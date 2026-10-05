// Painel da Ju: TOTP (RFC 6238), admins in the database (first one from ADMIN_EMAIL/ADMIN_PASSWORD), password + code
// login with short and full sessions, the HTTP endpoints (cookie, origin, orders, status changes, audit) and the browser
// helpers. Run: node tests/admin.mjs — no network, no keys, in-memory store with a controlled clock.
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const totp = require('../api/_lib/totp');
const adminAuth = require('../api/_lib/admin-auth');
const {createMemoryStore} = require('../api/_lib/store-memory');
const {decrypt, encrypt} = require('../api/_lib/fields');
const handlers = Object.fromEntries(['login', 'verify', 'session', 'logout', 'orders', 'order-status', 'order-document'].map(name => [name, require(`../api/admin/${name}`)]));
const health = require('../api/health');
const site = f => import(pathToFileURL(path.join(root, 'dist', f)).href);
const helpers = await site('admin-store.js');
const client = await site('admin-auth.js');
const {default: qrcode} = await site('vendor/qrcode-generator.js');

const SITE = 'https://site.test';
const ENV = {SITE_URL: SITE, APP_ENV: 'preview', ADMIN_EMAIL: ' Ju@Site.Test ', ADMIN_PASSWORD: 'senha-do-painel-2026'};
let clock = Date.parse('2026-09-28T12:00:00Z');
const now = () => clock, advance = ms => { clock += ms; };
const rejects = async (promise, code, message) => { await assert.rejects(promise, error => error.code === code, message || code); };
const secretOf = async (store, email) => totp.fromBase32(decrypt(ENV, (await store.admins.findByEmail(email)).totpSecretEnc));
const codeFor = (secret, at = clock) => totp.codeAt(secret, totp.stepAt(at));
const other = code => String((Number(code) + 1) % 1e6).padStart(6, '0');

// ── TOTP: RFC 6238 test vectors (SHA-1) and the rules around them ─────
{
  const secret = Buffer.from('12345678901234567890');
  for (const [seconds, code] of [[59, '94287082'], [1111111109, '07081804'], [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']]) assert.equal(totp.codeAt(secret, Math.floor(seconds / 30), 8), code, `RFC 6238 at ${seconds}`);
  assert.equal(totp.base32(Buffer.from('foobar')), 'MZXW6YTBOI'); assert.equal(totp.fromBase32('mzxw 6ytb-oi').toString(), 'foobar');
  assert.throws(() => totp.fromBase32('não é base32'));
  const at = 1_800_000_000_000, step = totp.stepAt(at), current = totp.codeAt(secret, step);
  assert.equal(totp.verify(secret, current, {now: at}), step);
  assert.equal(totp.verify(secret, totp.codeAt(secret, step - 1), {now: at}), step - 1, 'one step of clock drift is accepted');
  assert.equal(totp.verify(secret, totp.codeAt(secret, step - 2), {now: at}), null, 'two steps are not');
  assert.equal(totp.verify(secret, current, {now: at, after: step}), null, 'a code already used is refused');
  for (const bad of ['', '12345', '1234567', 'abcdef', null, 123456]) assert.equal(totp.verify(secret, bad, {now: at}), null, String(bad));
  const url = totp.otpauthUrl({secret, account: 'ju@site.test'});
  assert.equal(url, `otpauth://totp/Ju%20imprime%20pra%20mim%3Aju%40site.test?secret=${totp.base32(secret)}&issuer=Ju%20imprime%20pra%20mim&algorithm=SHA1&digits=6&period=30`);
  assert.equal(totp.newSecret().length, 20, '160-bit secrets, as RFC 4226 recommends');
}

// ── settings: the first admin needs a real password ───────────────────
{
  assert.deepEqual(adminAuth.settings(ENV), {email: 'ju@site.test', bootstrap: true, passwordTooShort: false});
  assert.equal(adminAuth.settings({ADMIN_EMAIL: 'ju@site.test', ADMIN_PASSWORD: '12345678'}).bootstrap, false, 'shorter than 12 characters');
  assert.equal(adminAuth.settings({ADMIN_EMAIL: 'ju@site.test', ADMIN_PASSWORD: '12345678'}).passwordTooShort, true);
  assert.equal(adminAuth.settings({ADMIN_PASSWORD: 'senha-do-painel-2026'}).bootstrap, false, 'no e-mail');
  assert.equal(adminAuth.settings({}).bootstrap, false);
}

// ── login: password, then the code from the app ───────────────────────
{
  const store = createMemoryStore(), auth = adminAuth.createAdminAuth({store, env: ENV, now});
  await rejects(auth.login({email: 'ju@site.test', password: 'senha-errada-123', ip: '1.1.1.1'}), 'invalid_credentials');
  assert.equal(await store.admins.count(), 0, 'a wrong password never creates the admin');
  await rejects(auth.login({email: 'outra@site.test', password: 'senha-do-painel-2026', ip: '1.1.1.1'}), 'invalid_credentials', 'only ADMIN_EMAIL');

  const first = await auth.login({email: ' JU@site.test ', password: 'senha-do-painel-2026', ip: '1.1.1.1', userAgent: 'teste'});
  assert.equal(first.next, 'totp_setup'); assert.match(first.setup.secret, /^[A-Z2-7]{32}$/); assert(first.setup.otpauth.startsWith('otpauth://totp/Ju%20imprime%20pra%20mim%3Aju%40site.test?secret=' + first.setup.secret));
  assert.match(first.session.token, /^[\w-]{43}$/); assert.equal(first.session.expiresAt - clock, adminAuth.PENDING_TTL);
  const admin = await store.admins.findByEmail('ju@site.test');
  assert(admin.passwordHash.startsWith('scrypt$'), 'the password is stored as scrypt'); assert.equal(admin.totpEnabledAt, null);
  assert(!Buffer.from(admin.totpSecretEnc).toString('latin1').includes(first.setup.secret), 'the app secret is encrypted in the database');
  assert.equal(await auth.authenticate(first.session.token), null, 'the password alone opens nothing');

  const secret = await secretOf(store, 'ju@site.test');
  assert.equal(totp.base32(secret), first.setup.secret);
  const wrong = await auth.verifyCode({token: first.session.token, code: other(codeFor(secret))}).catch(e => e);
  assert.equal(wrong.code, 'invalid_code'); assert.equal(wrong.remaining, 4);
  const done = await auth.verifyCode({token: first.session.token, code: codeFor(secret), ip: '1.1.1.1'});
  assert.equal(done.email, 'ju@site.test'); assert.equal(done.session.expiresAt - clock, adminAuth.SESSION_TTL);
  assert.notEqual(done.session.token, first.session.token, 'a new token after the second factor');
  await rejects(auth.verifyCode({token: first.session.token, code: codeFor(secret)}), 'unauthorized', 'the short token is spent');
  assert.equal((await auth.authenticate(done.session.token)).admin.email, 'ju@site.test');
  assert((await store.admins.findByEmail('ju@site.test')).totpEnabledAt, 'the app is now required');

  // Next time: no new secret, the same code cannot be reused, and a new one works.
  const second = await auth.login({email: 'ju@site.test', password: 'senha-do-painel-2026', ip: '1.1.1.1'});
  assert.deepEqual(Object.keys(second).sort(), ['next', 'session'], 'no secret once enrolled'); assert.equal(second.next, 'totp');
  await rejects(auth.verifyCode({token: second.session.token, code: codeFor(secret)}), 'invalid_code', 'a code works once');
  advance(30_000);
  assert.equal((await auth.verifyCode({token: second.session.token, code: codeFor(secret)})).email, 'ju@site.test');

  // The environment only creates the first admin: another address with the same password gets nothing.
  const other2 = adminAuth.createAdminAuth({store, env: {...ENV, ADMIN_EMAIL: 'intrusa@site.test'}, now});
  await rejects(other2.login({email: 'intrusa@site.test', password: 'senha-do-painel-2026', ip: '1.1.1.2'}), 'invalid_credentials');
  assert.equal(await store.admins.count(), 1);

  // Five wrong codes end the attempt.
  const third = await auth.login({email: 'ju@site.test', password: 'senha-do-painel-2026', ip: '1.1.1.3'});
  for (let i = 0; i < 5; i++) await rejects(auth.verifyCode({token: third.session.token, code: other(codeFor(secret))}), 'invalid_code');
  await rejects(auth.verifyCode({token: third.session.token, code: codeFor(secret)}), 'too_many_attempts', 'even the right code');
  await rejects(auth.verifyCode({token: third.session.token, code: codeFor(secret)}), 'unauthorized', 'the attempt is closed');

  // The short session lasts 10 minutes; the full one 12 hours; logout ends it.
  const fourth = await auth.login({email: 'ju@site.test', password: 'senha-do-painel-2026', ip: '1.1.1.4'});
  advance(adminAuth.PENDING_TTL);
  await rejects(auth.verifyCode({token: fourth.session.token, code: codeFor(secret)}), 'unauthorized', 'too late for the code');
  advance(5 * 60 * 1000);   // past the 15-minute window of the code limit (10 codes per admin)
  const fifth = await auth.login({email: 'ju@site.test', password: 'senha-do-painel-2026', ip: '1.1.1.5'});
  advance(30_000);
  const full = await auth.verifyCode({token: fifth.session.token, code: codeFor(secret)});
  advance(adminAuth.SESSION_TTL - 1);
  assert((await auth.authenticate(full.session.token)));
  advance(1);
  assert.equal(await auth.authenticate(full.session.token), null, '12 h');
  const sixth = await auth.login({email: 'ju@site.test', password: 'senha-do-painel-2026', ip: '1.1.1.6'});
  advance(30_000);
  const again = await auth.verifyCode({token: sixth.session.token, code: codeFor(secret)});
  await auth.logout(again.session.token);
  assert.equal(await auth.authenticate(again.session.token), null, 'logout');
  for (const bad of ['', 'x', null, 'a'.repeat(43)]) assert.equal(await auth.authenticate(bad), null);

  // Rate limits: 8 tries per address and 15 per IP in ten minutes.
  advance(10 * 60 * 1000);
  for (let i = 0; i < 8; i++) await rejects(auth.login({email: 'ju@site.test', password: 'errada-' + i, ip: `2.2.2.${i}`}), 'invalid_credentials');
  await rejects(auth.login({email: 'ju@site.test', password: 'senha-do-painel-2026', ip: '2.2.2.99'}), 'too_many_requests');
  const actions = (await store.adminAudit.list(200)).map(a => a.action);
  for (const action of ['admin_created', 'totp_enabled', 'login', 'login_failed', 'code_failed', 'logout']) assert(actions.includes(action), `audit: ${action}`);
}

// ── HTTP: cookie, origin, orders and status changes ───────────────────
function makeRes() { return {statusCode: 200, headers: {}, body: '', setHeader(key, value) { this.headers[key.toLowerCase()] = value; }, end(data) { this.body = data || ''; }, json() { return JSON.parse(this.body); }}; }
async function call(handler, {method = 'POST', origin = SITE, body = {}, ip = '203.0.113.5', cookie = '', url = '/'} = {}) {
  const res = makeRes();
  await handler({method, headers: {...(origin ? {origin} : {}), 'x-forwarded-for': ip, ...(cookie ? {cookie} : {})}, body, socket: {}, url}, res);
  return res;
}
const jar = res => String(res.headers['set-cookie'] || '').split(';')[0];
{
  const store = createMemoryStore(), h = Object.fromEntries(Object.entries(handlers).map(([name, handler]) => [name, handler.create({env: ENV, store, now})]));
  const order = (reference, status, extra = {}) => store.orders.create({id: crypto.randomUUID(), reference, customerId: null, source: 'test', status, method: 'pix', subtotalCents: 12900, shippingCents: 1800, totalCents: 14700, buyer: {name: 'Ana Souza', email: 'ana@example.com', company: null}, shipTo: {recipient: 'Ana Souza', cep: '30140071', street: 'Rua da Bahia', number: '1200', district: 'Centro', city: 'Belo Horizonte', state: 'MG', complement: ''}, notes: '', lang: 'pt-BR', paidAt: status === 'aguardando_pagamento' ? null : new Date(clock), items: [{productId: 'borboletoscopio', title: 'Borboletoscópio', quantity: 1, unitCents: 12900, selection: {body: 'pink', details: 'lilac'}}], ...extra}).then(r => r.order);
  const paid = await order('JU-PAGO000001', 'pendente', {buyerDocEnc: encrypt(ENV, '52998224725')}), waiting = await order('JU-ESPERA0001', 'aguardando_pagamento'), cancelled = await order('JU-CANCEL0001', 'cancelado');

  assert.equal((await call(h.login, {method: 'GET'})).statusCode, 405);
  assert.equal((await call(h.login, {origin: '', body: {email: 'ju@site.test', password: 'x'}})).statusCode, 403, 'no Origin');
  assert.equal((await call(h.login, {origin: 'https://evil.example', body: {email: 'ju@site.test', password: 'x'}})).statusCode, 403, 'foreign Origin');
  assert.equal((await call(h.login, {body: 'not json'})).statusCode, 400);
  const wrong = await call(h.login, {body: {email: 'ju@site.test', password: 'errada-errada-1'}});
  assert.equal(wrong.statusCode, 401); assert.equal(wrong.json().error, 'invalid_credentials'); assert(!wrong.body.includes('senha-do-painel'));

  const login = await call(h.login, {body: {email: 'ju@site.test', password: 'senha-do-painel-2026'}});
  assert.equal(login.statusCode, 200); assert.equal(login.headers['cache-control'], 'no-store'); assert.equal(login.json().next, 'totp_setup');
  assert.match(login.headers['set-cookie'], /^__Host-ju_admin=[\w-]{43}; Path=\/; HttpOnly; Secure; SameSite=Strict; Expires=/, 'admin cookie flags');
  assert(!login.body.includes(jar(login).split('=')[1]), 'the token is only in the cookie');
  assert.equal((await call(h.orders, {method: 'GET', origin: '', cookie: jar(login)})).statusCode, 401, 'the password alone does not open the orders');

  const secret = totp.fromBase32(login.json().setup.secret);
  const bad = await call(h.verify, {body: {code: other(codeFor(secret))}, cookie: jar(login)});
  assert.equal(bad.statusCode, 400); assert.deepEqual(bad.json(), {error: 'invalid_code', remaining: 4});
  assert.equal((await call(h.verify, {body: {code: codeFor(secret)}})).statusCode, 401, 'no cookie, no code step');
  const verified = await call(h.verify, {body: {code: codeFor(secret)}, cookie: jar(login)});
  assert.equal(verified.statusCode, 200); assert.equal(verified.json().email, 'ju@site.test');
  const cookie = jar(verified);
  assert.match(verified.headers['set-cookie'], /^__Host-ju_admin=[\w-]{43}; Path=\/; HttpOnly; Secure; SameSite=Strict/);

  const me = await call(h.session, {method: 'GET', origin: '', cookie});
  assert.equal(me.statusCode, 200); assert.equal(me.json().email, 'ju@site.test');
  const anon = await call(h.session, {method: 'GET', origin: '', cookie: '__Host-ju_admin=' + 'x'.repeat(43)});
  assert.equal(anon.statusCode, 200, 'nobody signed in is a normal answer, not a console error'); assert.deepEqual(anon.json(), {ok: false}); assert.match(anon.headers['set-cookie'], /Max-Age=0/, 'a stale cookie is cleared');
  const nobody = await call(h.session, {method: 'GET', origin: ''}); assert.deepEqual(nobody.json(), {ok: false}); assert.equal(nobody.headers['set-cookie'], undefined, 'no cookie to clear');

  const list = await call(h.orders, {method: 'GET', origin: '', cookie});
  assert.equal(list.statusCode, 200);
  assert.deepEqual(list.json().orders.map(o => o.reference), ['JU-PAGO000001'], 'only paid orders: not the ones waiting or cancelled');
  const shown = list.json().orders[0];
  assert.equal(shown.customer.name, 'Ana Souza'); assert.equal(shown.buyer.cpf, '***.982.247-**', 'the list shows the CPF masked'); assert.equal(shown.address.cep, '30140071'); assert.equal(shown.items[0].selection.body, 'pink');

  const move = (body, extra = {}) => call(h['order-status'], {body, cookie, ...extra});
  assert.equal((await move({id: paid.id, status: 'concluido'}, {origin: 'https://evil.example'})).statusCode, 403);
  assert.equal((await move({id: paid.id, status: 'concluido'}, {cookie: ''})).statusCode, 401);
  assert.equal((await move({id: paid.id, status: 'enviado'})).json().field, 'status');
  assert.equal((await move({id: 'not-an-id', status: 'concluido'})).json().field, 'id');
  assert.equal((await move({id: waiting.id, status: 'concluido'})).statusCode, 404, 'an unpaid order is not Ju\'s to move');
  assert.equal((await move({id: cancelled.id, status: 'pendente'})).statusCode, 404, 'nor a cancelled one');
  const declined = await move({id: paid.id, status: 'recusado', reason: '<b>sem</b> estoque'});
  assert.equal(declined.statusCode, 200); assert.equal(declined.json().order.status, 'recusado'); assert.equal(declined.json().order.declineReason, 'b sem /b  estoque');
  assert(!declined.body.includes('<b>'), 'the reason is cleaned');
  const reopened = await move({id: paid.id, status: 'pendente'});
  assert.equal(reopened.json().order.status, 'pendente'); assert.equal(reopened.json().order.declineReason, ''); assert.equal(reopened.json().order.decidedAt, null);
  assert.equal((await move({id: paid.id, status: 'concluido'})).json().order.status, 'concluido');
  const events = (await store.orders.events(paid.id)).map(e => [e.kind, e.actor]);
  // Here Mercado Pago is not configured, so the automatic refund of the decline is recorded as failed (and the order can be reopened).
  assert.deepEqual(events, [['status:recusado', 'ju@site.test'], ['refund_failed', 'ju@site.test'], ['status:pendente', 'ju@site.test'], ['status:concluido', 'ju@site.test']], 'each change is recorded with who made it');
  assert.equal((await store.adminAudit.list()).filter(a => a.action === 'order_status').length, 3);

  // Full CPF for the invoice: on request, paid orders only, every view recorded.
  const doc = (id, extra = {}) => call(h['order-document'], {body: {id}, cookie, ...extra});
  assert.equal((await doc(paid.id, {cookie: ''})).statusCode, 401);
  assert.equal((await doc(paid.id, {origin: 'https://evil.example'})).statusCode, 403);
  assert.equal((await doc(waiting.id)).statusCode, 404, 'not for unpaid orders');
  assert.equal((await doc('nao-e-um-id')).json().field, 'id');
  assert.deepEqual((await doc(paid.id)).json(), {ok: true, cpf: '529.982.247-25'});
  assert((await store.adminAudit.list()).some(a => a.action === 'cpf_viewed' && a.detail === 'JU-PAGO000001'), 'each view of a full CPF is recorded');

  const out = await call(h.logout, {cookie});
  assert.match(out.headers['set-cookie'], /__Host-ju_admin=; .*Max-Age=0/);
  assert.equal((await call(h.orders, {method: 'GET', origin: '', cookie})).statusCode, 401, 'logged out on the server too');

  const hr = makeRes(); await health.create({env: ENV})({}, hr); assert.equal(hr.json().admin, 'bootstrap', 'health says the first admin can be created (its own store has none yet)');
}

// ── health: the state of the panel, never a value ─────────────────────
{
  const empty = createMemoryStore();
  assert.equal(await adminAuth.status(null, ENV), 'off');
  assert.equal(await adminAuth.status(empty, ENV), 'bootstrap');
  assert.equal(await adminAuth.status(empty, {ADMIN_EMAIL: 'ju@site.test', ADMIN_PASSWORD: 'curta'}), 'waiting');
  await empty.admins.create({id: crypto.randomUUID(), email: 'ju@site.test', passwordHash: 'x'});
  assert.equal(await adminAuth.status(empty, {}), 'ready');
}

// ── browser helpers ───────────────────────────────────────────────────
{
  const at = (day, hour) => new Date(2026, 0, day, hour).toISOString();
  const o = (reference, status, paidAt, totalCents) => ({id: reference, reference, status, paidAt, createdAt: paidAt, totalCents});
  const list = [o('A', 'pendente', at(5, 10), 1000), o('B', 'concluido', at(5, 22), 2000), o('C', 'pendente', at(6, 9), 500), o('D', 'recusado', at(6, 11), 9900)];
  assert.deepEqual(helpers.listByStatus(list, 'pendente').map(x => x.reference), ['A', 'C'], 'pending: oldest first');
  assert.deepEqual(helpers.listByStatus([...list, o('E', 'concluido', at(7, 8), 1)], 'concluido').map(x => x.reference), ['E', 'B'], 'history: newest first');
  assert.deepEqual(helpers.dailyTotals(list).map(t => [t.date, t.totalCents, t.count]), [[helpers.dayKey(at(5, 10)), 3000, 2], [helpers.dayKey(at(6, 9)), 500, 1]], 'declined orders do not count as revenue');
  assert.deepEqual(helpers.ordersForDay(list, helpers.dayKey(at(6, 9))).map(x => x.reference), ['D', 'C'], 'the day view shows every order of the day');
  const sum = helpers.summary(list, new Date(2026, 0, 20));
  assert.deepEqual(sum, {pendentes: 2, concluidos: 1, recusados: 1, revenue: 3500, monthRevenue: 3500});
  assert.equal(helpers.replaceOrder(list, {...list[0], status: 'concluido'})[0].status, 'concluido');
  assert.equal(client.groupSecret('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'), 'JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP');

  const fake = answers => { const calls = []; return {calls, fetchImpl: async (url, init) => { calls.push({url, init}); const [status, body] = answers.shift(); return {status, json: async () => body}; }}; };
  const a = fake([[200, {ok: true, next: 'totp_setup', setup: {secret: 'S', otpauth: 'otpauth://x'}}]]);
  assert.deepEqual(await client.login('ju@site.test', 'senha', {fetchImpl: a.fetchImpl}), {ok: true, next: 'totp_setup', setup: {secret: 'S', otpauth: 'otpauth://x'}});
  assert.equal(a.calls[0].init.credentials, 'same-origin'); assert.equal(a.calls[0].url, '/api/admin/login');
  assert.deepEqual(await client.login('x', 'y', {fetchImpl: fake([[401, {error: 'invalid_credentials'}]]).fetchImpl}), {ok: false, status: 401, error: 'invalid_credentials', retryAfter: undefined});
  assert.deepEqual(await client.verifyCode('123456', {fetchImpl: fake([[400, {error: 'invalid_code', remaining: 3}]]).fetchImpl}), {ok: false, status: 400, error: 'invalid_code', remaining: 3});
  assert.equal(await client.currentSession({fetchImpl: fake([[401, {error: 'unauthorized'}]]).fetchImpl}), null);
  assert.equal(await client.currentSession({fetchImpl: fake([[200, {ok: false}]]).fetchImpl}), null, 'signed out');
  await assert.rejects(client.currentSession({fetchImpl: fake([[503, {error: 'admin_unavailable'}]]).fetchImpl}), error => error.code === 'admin_unavailable', 'a server problem is not a sign-out');
  await assert.rejects(client.loadOrders({fetchImpl: fake([[401, {}]]).fetchImpl}), error => error.code === 'unauthorized');
  const moved = fake([[200, {ok: true, order: {id: 'x', status: 'concluido'}}]]);
  assert.deepEqual(await client.changeStatus('x', 'concluido', '', {fetchImpl: moved.fetchImpl}), {order: {id: 'x', status: 'concluido'}, mailed: false, refund: null});
  assert.deepEqual(await client.changeStatus('x', 'concluido', '', {fetchImpl: fake([[200, {ok: true, order: {id: 'x'}, mailed: true, refund: 'refunded'}]]).fetchImpl}), {order: {id: 'x'}, mailed: true, refund: 'refunded'}, 'the panel learns whether the buyer was e-mailed and refunded');
  assert.deepEqual(JSON.parse(moved.calls[0].init.body), {id: 'x', status: 'concluido', reason: ''});

  // The vendored QR generator draws a valid symbol for an otpauth link (finder pattern in the corner).
  const qr = qrcode(0, 'M'); qr.addData(totp.otpauthUrl({secret: totp.newSecret(), account: 'powershop.bras@gmail.com'})); qr.make();
  assert(qr.getModuleCount() >= 41, 'version 6 or larger for a ~120-character link');
  for (let i = 0; i < 7; i++) assert(qr.isDark(0, i) && qr.isDark(6, i) && qr.isDark(i, 0) && qr.isDark(i, 6), 'finder pattern border');
  assert(!qr.isDark(1, 1) && qr.isDark(3, 3), 'finder pattern inside');
}

// ── the panel asks before concluir (it issues the NF-e), as it does before recusar (it refunds) ──
{
  const read = f => require('node:fs').readFileSync(path.join(root, 'dist', f), 'utf8');
  const panel = read('admin.js');
  assert(panel.includes(`if (action.dataset.action === 'complete') { const order = orders.find(o => o.id === id); if (order) openCompleteDialog(order); }`), '"Marcar como concluído" only opens the confirmation');
  assert.equal(panel.split(`'concluido', '', 'Pedido marcado como concluído.'`).length - 1, 1, 'only the "Sim, concluir" button concludes');
  assert(panel.includes('data-action="cancel-complete">Cancelar</button><button type="button" class="btn-complete" data-action="confirm-complete">Sim, concluir</button>'));
  assert(panel.includes(`completeDialog.querySelector('[data-action="cancel-complete"]').focus();`), 'Cancelar has the focus, so Enter never concludes by accident');
  assert.match(read('admin.css'), /\.chart-bars\{[^}]*justify-content:space-between/, "the 14 bars span the chart: the last one sits over today's date");
}

// ── Ju's decision e-mails the buyer: confirmed or declined, never the reason; reopening sends nothing ──
{
  const MAIL_ENV = {...ENV, RESEND_API_KEY: 're_test_key_admin', MAIL_FROM: 'Ju <pedidos@site.test>'};
  const sent = [], fetchImpl = async (url, init) => { sent.push({url, key: init.headers['Idempotency-Key'], body: JSON.parse(init.body)}); return {ok: true, status: 200, json: async () => ({id: 'em_' + sent.length})}; };
  const store = createMemoryStore(), h = Object.fromEntries(Object.entries(handlers).map(([name, handler]) => [name, handler.create({env: MAIL_ENV, store, now, fetchImpl})]));
  const base = {customerId: null, source: 'test', method: 'pix', subtotalCents: 12900, shippingCents: 1800, totalCents: 14700, buyer: {name: '<b>Ana</b> Souza', email: 'ana@example.com', company: null}, shipTo: {recipient: '<b>Ana</b> Souza', cep: '30140071', street: 'Rua da Bahia', number: '1200', district: 'Centro', city: 'Belo Horizonte', state: 'MG', complement: ''}, notes: '', paidAt: new Date(clock), items: [{productId: 'borboletoscopio', title: 'Borboletoscópio', quantity: 1, unitCents: 12900, selection: {body: 'pink', details: 'lilac'}}]};
  const make = (reference, lang) => store.orders.create({...base, id: crypto.randomUUID(), reference, status: 'pendente', lang}).then(r => r.order);
  const pt = await make('JU-DECIDE0001', 'pt-BR'), en = await make('JU-DECIDE0002', 'en');
  const login = await call(h.login, {body: {email: 'ju@site.test', password: 'senha-do-painel-2026'}});
  const cookie = jar(await call(h.verify, {body: {code: codeFor(totp.fromBase32(login.json().setup.secret))}, cookie: jar(login)}));
  const move = body => call(h['order-status'], {body, cookie});

  const done = await move({id: pt.id, status: 'concluido'});
  assert.equal(done.statusCode, 200); assert.equal(done.json().mailed, true, 'confirming e-mails the buyer');
  assert.equal(sent.length, 1); assert.deepEqual(sent[0].body.to, ['ana@example.com']);
  assert.equal(sent[0].body.subject, '[TESTE] Pedido confirmado · JU-DECIDE0001 · Ju, imprime pra mim?');
  assert(sent[0].body.html.includes('Seu pedido foi') && sent[0].body.html.includes('JU-DECIDE0001') && sent[0].body.html.includes('Borboletoscópio'));
  assert(!sent[0].body.html.includes('<b>Ana') && sent[0].body.html.includes('&lt;b&gt;Ana&lt;/b&gt;'), 'the name is escaped');

  const declined = await move({id: en.id, status: 'recusado', reason: 'sem estoque da cor lilás'});
  assert.equal(declined.json().mailed, true); assert.equal(sent.length, 2);
  assert.equal(sent[1].body.subject, '[TESTE] About your order JU-DECIDE0002 · Ju, imprime pra mim?', 'in the language the buyer used');
  assert(sent[1].body.html.includes('refunded through Mercado Pago'));
  assert(!JSON.stringify(sent[1].body).includes('estoque'), 'the decline reason stays with the team');

  const reopened = await move({id: en.id, status: 'pendente'});
  assert.equal(reopened.json().mailed, false); assert.equal(sent.length, 2, 'reopening sends nothing');
  advance(60000);
  await move({id: en.id, status: 'concluido'});
  assert.equal(sent.length, 3); assert.notEqual(sent[2].key, sent[1].key, 'a new decision is a new e-mail (its own idempotency key)');
  assert.match(sent[0].key, /^order-concluido-[0-9a-f-]{36}-\d+$/);

  // Without an e-mail service nothing is sent and nothing breaks (the route still saves the status and says mailed: false).
  const {createOrders} = require('../api/_lib/orders');
  const noMail = createOrders({store, env: ENV, now});
  assert.equal(await noMail.notifyDecision({...pt, status: 'concluido'}, {fetchImpl}), false, 'no e-mail service: nothing sent, nothing thrown');
  assert.equal(sent.length, 3);
}

// ── automatic refund: declining returns the whole amount through Mercado Pago (Orders API), once ──
{
  const mp = require('../api/_lib/mercadopago');
  const {createFakeMercadoPago} = require('../tools/fake-mercadopago.cjs');
  const {createOrders} = require('../api/_lib/orders');
  const PAY_ENV = {...ENV, MP_ACCESS_TOKEN: 'TEST-token-refund', MP_PUBLIC_KEY: 'TEST-public-refund', RESEND_API_KEY: 're_test_refund', MAIL_FROM: 'Ju <pedidos@site.test>'};
  const fake = createFakeMercadoPago({now});
  const calls = [], mails = [];
  let mpDown = false;   // makes the refund call fail with a 500, to see the retry
  const fetchImpl = async (url, init = {}) => {
    if (String(url).startsWith('https://api.resend.com')) { mails.push(JSON.parse(init.body)); return {ok: true, status: 200, json: async () => ({id: 'em'})}; }
    calls.push({url: String(url), method: init.method, key: init.headers?.['X-Idempotency-Key'], body: init.body});
    if (mpDown && /\/refund$/.test(String(url))) return {ok: false, status: 500, json: async () => ({errors: [{code: 'internal_error', message: 'try again'}]})};
    return fake.fetchImpl(url, init);
  };
  const settings = mp.settings(PAY_ENV);
  assert.equal(settings.mode, 'test');
  const store = createMemoryStore(), h = Object.fromEntries(Object.entries(handlers).map(([name, handler]) => [name, handler.create({env: PAY_ENV, store, now, fetchImpl})]));
  h['order-refund'] = require('../api/admin/order-refund').create({env: PAY_ENV, store, now, fetchImpl});
  let seq = 0;
  async function paidOrder({source = 'test', lang = 'pt-BR'} = {}) {
    const remote = await mp.createOrder({settings, fetchImpl: fake.fetchImpl, idempotencyKey: 'create-' + (++seq), payload: {type: 'online', total_amount: '147.00', external_reference: 'JU-REFUND000' + seq, transactions: {payments: [{amount: '147.00', payment_method: {id: 'master', type: 'credit_card', token: 'APRO' + 'a'.repeat(28)}}]}}});
    return (await store.orders.create({id: crypto.randomUUID(), reference: 'JU-REFUND000' + seq, customerId: null, source, status: 'pendente', method: 'card', subtotalCents: 12900, shippingCents: 1800, totalCents: 14700, mpOrderId: remote.id,
      buyer: {name: 'Ana Souza', email: 'ana@example.com', company: null}, shipTo: {recipient: 'Ana Souza', cep: '30140071', street: 'Rua da Bahia', number: '1200', district: 'Centro', city: 'Belo Horizonte', state: 'MG', complement: ''},
      notes: '', lang, paidAt: new Date(clock), items: [{productId: 'borboletoscopio', title: 'Borboletoscópio', quantity: 1, unitCents: 12900, selection: {body: 'pink', details: 'lilac'}}]})).order;
  }
  const login = await call(h.login, {body: {email: 'ju@site.test', password: 'senha-do-painel-2026'}});
  const cookie = jar(await call(h.verify, {body: {code: codeFor(totp.fromBase32(login.json().setup.secret))}, cookie: jar(login)}));
  const move = body => call(h['order-status'], {body, cookie});
  const refundCalls = () => calls.filter(c => /\/refund$/.test(c.url));

  // 1 · decline → refunded at once; the buyer's e-mail says the money is already back
  const a = await paidOrder();
  const declined = await move({id: a.id, status: 'recusado', reason: 'sem estoque'});
  assert.equal(declined.statusCode, 200); assert.equal(declined.json().refund, 'refunded'); assert.equal(declined.json().order.refund.state, 'refunded');
  assert.equal(refundCalls().length, 1);
  assert.equal(refundCalls()[0].url, 'https://api.mercadopago.com/v1/orders/' + a.mpOrderId + '/refund'); assert.equal(refundCalls()[0].method, 'POST');
  assert.equal(refundCalls()[0].body, undefined, 'total refund: no amount, no body');
  assert.equal(refundCalls()[0].key, 'refund-' + a.id + '-1', 'idempotency key per order and attempt');
  assert.equal(fake.orders.get(a.mpOrderId).status, 'refunded');
  assert.equal(mails.length, 1); assert(mails[0].text.includes('já foi estornado') && !mails[0].text.includes('sem estoque'), 'the e-mail says it was refunded, never the reason');
  assert.deepEqual((await store.orders.events(a.id)).map(e => e.kind), ['status:recusado', 'refund_requested', 'refunded']);
  // 2 · the money went back: no reopening, no confirming
  assert.equal((await move({id: a.id, status: 'pendente'})).json().error, 'refunded');
  assert.equal((await move({id: a.id, status: 'concluido'})).statusCode, 409);
  // 3 · "conferir" on a refunded order asks Mercado Pago for nothing new
  const checked = await call(h['order-refund'], {body: {id: a.id}, cookie});
  assert.equal(checked.json().refund, 'refunded'); assert.equal(refundCalls().length, 1, 'never refunded twice');
  assert.equal((await call(h['order-refund'], {body: {id: (await paidOrder()).id}, cookie})).statusCode, 404, 'only declined orders have a refund to look after');

  // 4 · Mercado Pago fails: the decline stands, the failure is shown, reopening is still possible; the retry uses a new key
  const b = await paidOrder({lang: 'en'});
  mpDown = true;
  const failed = await move({id: b.id, status: 'recusado'});
  assert.equal(failed.statusCode, 200); assert.equal(failed.json().refund, 'failed'); assert.equal(failed.json().order.refund.error, 'internal_error');
  assert(mails.at(-1).text.includes('will be refunded through Mercado Pago'), 'nothing refunded yet: the e-mail only promises it');
  mpDown = false;
  const retried = await call(h['order-refund'], {body: {id: b.id}, cookie});
  assert.equal(retried.json().refund, 'refunded'); assert.equal(refundCalls().at(-1).key, 'refund-' + b.id + '-2', 'a new attempt has its own key');
  // (a failed refund does not lock the order: it could have been reopened before the retry)
  const c = await paidOrder(); mpDown = true; await move({id: c.id, status: 'recusado'}); mpDown = false;
  assert.equal((await move({id: c.id, status: 'pendente'})).json().order.status, 'pendente');

  // 5 · already refunded in Mercado Pago's panel: the conflict is read back as refunded, no second refund
  const d = await paidOrder();
  await mp.refundOrder({settings, fetchImpl: fake.fetchImpl, id: d.mpOrderId, idempotencyKey: 'by-hand'});
  const before = refundCalls().length;
  const conflict = await move({id: d.id, status: 'recusado'});
  assert.equal(conflict.json().refund, 'refunded'); assert.equal(refundCalls().length, before + 1);
  assert(calls.at(-1).method === 'GET', 'the 409 was settled by reading the order back');

  // 6 · a test order is never refunded with other keys (and the reverse)
  const e = await paidOrder({source: 'live'});
  const mismatch = await move({id: e.id, status: 'recusado'});
  assert.equal(mismatch.json().refund, 'failed'); assert.equal(mismatch.json().order.refund.error, 'mode_mismatch');

  // 7 · webhook/status saying "refunded" (e.g. done in Mercado Pago's panel) is recorded; declining later does not refund again
  const g = await paidOrder();
  await mp.refundOrder({settings, fetchImpl: fake.fetchImpl, id: g.mpOrderId, idempotencyKey: 'panel'});
  const orders = createOrders({store, env: PAY_ENV, now});
  const remote = mp.normalizeOrder(fake.orders.get(g.mpOrderId));
  assert.equal(remote.state, 'refunded');
  const {order: marked} = await orders.applyPayment(g, {...remote, reference: g.reference, total: g.totalCents});
  assert.equal(marked.refundState, 'refunded'); assert.equal(marked.status, 'pendente', 'Ju still decides; the money is already back');
  const count = refundCalls().length;
  assert.equal((await move({id: g.id, status: 'recusado'})).json().refund, 'refunded'); assert.equal(refundCalls().length, count, 'no second refund');

  // outcome parsing: refunded / requested / failed / none
  assert.equal(mp.refundOutcome({status: 'processed', status_detail: 'refunded'}).state, 'refunded');
  assert.equal(mp.refundOutcome({status: 'processed', transactions: {refunds: [{id: 'R', status: 'in_process'}]}}).state, 'requested');
  assert.equal(mp.refundOutcome({transactions: {refunds: [{id: 'R', status: 'rejected'}]}}).state, 'failed');
  assert.equal(mp.refundOutcome({status: 'processed', status_detail: 'accredited'}).state, 'none');
}

console.log('PASS: TOTP (RFC 6238 vectors, drift window, single use), first admin only from ADMIN_EMAIL/ADMIN_PASSWORD (12+ characters), password then code with a short session (10 min, 5 codes) and a full one (12 h, new token), encrypted app secret, rate limits and audit; HTTP endpoints (HttpOnly __Host- SameSite=Strict cookie, origin, only paid orders, status changes recorded with who made them, unpaid orders untouchable); browser helpers (grouping, revenue without declined orders, API client), a confirmation before concluding and the vendored QR code.');
