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
const {decrypt} = require('../api/_lib/fields');
const handlers = Object.fromEntries(['login', 'verify', 'session', 'logout', 'orders', 'order-status'].map(name => [name, require(`../api/admin/${name}`)]));
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
  const paid = await order('JU-PAGO000001', 'pendente'), waiting = await order('JU-ESPERA0001', 'aguardando_pagamento'), cancelled = await order('JU-CANCEL0001', 'cancelado');

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
  assert.equal(anon.statusCode, 401); assert.match(anon.headers['set-cookie'], /Max-Age=0/, 'a stale cookie is cleared');

  const list = await call(h.orders, {method: 'GET', origin: '', cookie});
  assert.equal(list.statusCode, 200);
  assert.deepEqual(list.json().orders.map(o => o.reference), ['JU-PAGO000001'], 'only paid orders: not the ones waiting or cancelled');
  const shown = list.json().orders[0];
  assert.equal(shown.customer.name, 'Ana Souza'); assert.equal(shown.address.cep, '30140071'); assert.equal(shown.items[0].selection.body, 'pink');

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
  assert.deepEqual(events, [['status:recusado', 'ju@site.test'], ['status:pendente', 'ju@site.test'], ['status:concluido', 'ju@site.test']], 'each change is recorded with who made it');
  assert.equal((await store.adminAudit.list()).filter(a => a.action === 'order_status').length, 3);

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
  await assert.rejects(client.currentSession({fetchImpl: fake([[503, {error: 'admin_unavailable'}]]).fetchImpl}), error => error.code === 'admin_unavailable', 'a server problem is not a sign-out');
  await assert.rejects(client.loadOrders({fetchImpl: fake([[401, {}]]).fetchImpl}), error => error.code === 'unauthorized');
  const moved = fake([[200, {ok: true, order: {id: 'x', status: 'concluido'}}]]);
  assert.deepEqual(await client.changeStatus('x', 'concluido', '', {fetchImpl: moved.fetchImpl}), {id: 'x', status: 'concluido'});
  assert.deepEqual(JSON.parse(moved.calls[0].init.body), {id: 'x', status: 'concluido', reason: ''});

  // The vendored QR generator draws a valid symbol for an otpauth link (finder pattern in the corner).
  const qr = qrcode(0, 'M'); qr.addData(totp.otpauthUrl({secret: totp.newSecret(), account: 'powershop.bras@gmail.com'})); qr.make();
  assert(qr.getModuleCount() >= 41, 'version 6 or larger for a ~120-character link');
  for (let i = 0; i < 7; i++) assert(qr.isDark(0, i) && qr.isDark(6, i) && qr.isDark(i, 0) && qr.isDark(i, 6), 'finder pattern border');
  assert(!qr.isDark(1, 1) && qr.isDark(3, 3), 'finder pattern inside');
}

console.log('PASS: TOTP (RFC 6238 vectors, drift window, single use), first admin only from ADMIN_EMAIL/ADMIN_PASSWORD (12+ characters), password then code with a short session (10 min, 5 codes) and a full one (12 h, new token), encrypted app secret, rate limits and audit; HTTP endpoints (HttpOnly __Host- SameSite=Strict cookie, origin, only paid orders, status changes recorded with who made them, unpaid orders untouchable); browser helpers (grouping, revenue without declined orders, API client) and the vendored QR code.');
