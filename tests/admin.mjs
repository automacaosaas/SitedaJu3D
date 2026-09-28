// Admin panel: server-side login/session (no database — e-mail and password come from environment variables) and the
// client order store (localStorage-backed, prototype persistence). Run: node tests/admin.mjs — no network, no keys.
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const admin = require('../api/_lib/admin-auth');
const loginHandler = require('../api/admin/login'), sessionHandler = require('../api/admin/session');
const {createLimiter} = require('../api/_lib/http');
const site = f => import(pathToFileURL(path.join(root, 'dist', f)).href);
const store = await site('admin-store.js');

const SITE = 'https://site.test';
const ENV = {SITE_URL: SITE, AUTH_SECRET: 'a-long-test-secret-that-has-more-than-32-chars', ADMIN_EMAIL: ' Ju@Site.Test ', ADMIN_PASSWORD: '12345678'};

// ── settings / password check ──────────────────────────────────────────
{
  assert.equal(admin.settings({}).ready, false, 'nothing configured');
  assert.equal(admin.settings({ADMIN_EMAIL: 'ju@site.test'}).ready, false, 'password missing');
  assert.equal(admin.settings({ADMIN_PASSWORD: '12345678'}).ready, false, 'email missing');
  assert.equal(admin.settings({ADMIN_EMAIL: 'ju@site.test', ADMIN_PASSWORD: '12345678'}).ready, false, 'no signing secret available (no AUTH_SECRET, no RESEND_API_KEY)');
  const settings = admin.settings(ENV);
  assert.equal(settings.ready, true); assert.equal(settings.email, 'ju@site.test', 'trimmed and lower-cased');
  assert(settings.secret.length >= 32 && /^[0-9a-f]+$/.test(settings.secret));
  assert.notEqual(settings.secret, ENV.AUTH_SECRET, 'a distinct secret from the e-mail one, not the same value reused');
  const viaResend = admin.settings({SITE_URL: SITE, RESEND_API_KEY: 're_test_key_123', ADMIN_EMAIL: 'ju@site.test', ADMIN_PASSWORD: '12345678'});
  assert.equal(viaResend.ready, true, 'a Resend-derived secret is enough too');

  assert.equal(admin.checkPassword(settings, 'JU@SITE.TEST', '12345678'), true, 'email is case-insensitive');
  assert.equal(admin.checkPassword(settings, ' ju@site.test ', '12345678'), true, 'email is trimmed');
  assert.equal(admin.checkPassword(settings, 'ju@site.test', '1234567'), false);
  assert.equal(admin.checkPassword(settings, 'ju@site.test', '123456789'), false);
  assert.equal(admin.checkPassword(settings, 'someone@site.test', '12345678'), false);
  assert.equal(admin.checkPassword(admin.settings({}), 'ju@site.test', '12345678'), false, 'never "passes" just because nothing is configured');
  assert.equal(admin.checkPassword(admin.settings({ADMIN_EMAIL: '', ADMIN_PASSWORD: '', AUTH_SECRET: ENV.AUTH_SECRET, SITE_URL: SITE}), '', ''), false, 'two empty strings never compare as a match');
}

// ── session tokens ──────────────────────────────────────────────────────
{
  const settings = admin.settings(ENV);
  const now = 1_700_000_000_000;
  const {token, expiresAt} = admin.issueSession({secret: settings.secret, email: settings.email, now});
  assert.equal(expiresAt - now, admin.SESSION_TTL_MS);
  assert(!Buffer.from(token.split('.')[0], 'base64url').toString().includes('12345678'), 'the password is never inside the token');
  assert.deepEqual(admin.verifySession({secret: settings.secret, token, now: now + 1000}), {ok: true, email: settings.email, expiresAt});
  assert.equal(admin.verifySession({secret: settings.secret, token, now: expiresAt}).ok, false, 'expired');
  assert.equal(admin.verifySession({secret: settings.secret + 'x', token, now}).ok, false, 'wrong secret');
  const [body, signature] = token.split('.');
  const forged = JSON.parse(Buffer.from(body, 'base64url').toString()); forged.e = 'attacker@site.test';
  const forgedToken = Buffer.from(JSON.stringify(forged)).toString('base64url') + '.' + signature;
  assert.equal(admin.verifySession({secret: settings.secret, token: forgedToken, now}).ok, false, 'an edited payload is rejected');
  for (const bad of ['', 'abc', 'a.b', null, undefined, 42, 'x'.repeat(2000) + '.y', token + 'x']) assert.equal(admin.verifySession({secret: settings.secret, token: bad, now}).ok, false, String(bad).slice(0, 30));
  assert.equal(admin.bearerToken({headers: {authorization: 'Bearer abc.def'}}), 'abc.def');
  assert.equal(admin.bearerToken({headers: {authorization: 'Basic abc'}}), ''); assert.equal(admin.bearerToken({headers: {}}), '');
}

// ── handlers ──────────────────────────────────────────────────────────
function makeRes() { return {statusCode: 200, headers: {}, body: '', setHeader(key, value) { this.headers[key.toLowerCase()] = value; }, end(data) { this.body = data || ''; }, json() { return JSON.parse(this.body); }}; }
async function call(handler, {method = 'POST', origin = SITE, body = {}, ip = '203.0.113.5', headers = {}} = {}) {
  const res = makeRes();
  await handler({method, headers: {...(origin ? {origin} : {}), 'x-forwarded-for': ip, ...headers}, body, socket: {}, url: '/'}, res);
  return res;
}
{
  const login = loginHandler.create({env: ENV}), session = sessionHandler.create({env: ENV});
  assert.equal((await call(login, {method: 'GET'})).statusCode, 405);
  assert.equal((await call(login, {origin: ''})).statusCode, 403, 'no Origin');
  assert.equal((await call(login, {origin: 'https://evil.example'})).statusCode, 403, 'foreign Origin');
  assert.equal((await call(loginHandler.create({env: {SITE_URL: SITE}}), {body: {email: 'ju@site.test', password: '12345678'}})).statusCode, 503, 'not configured');
  assert.equal((await call(login, {body: 'not json'})).statusCode, 400);

  const wrong = await call(login, {body: {email: 'ju@site.test', password: 'wrong'}});
  assert.equal(wrong.statusCode, 401); assert.equal(wrong.json().error, 'invalid_credentials'); assert(!wrong.body.includes('12345678'));

  const ok = await call(login, {body: {email: ' JU@Site.test ', password: '12345678'}});
  assert.equal(ok.statusCode, 200); assert.equal(ok.headers['cache-control'], 'no-store');
  const {token, expiresAt} = ok.json();
  assert(typeof token === 'string' && expiresAt > Date.now());

  const verified = await call(session, {method: 'GET', headers: {authorization: `Bearer ${token}`}});
  assert.equal(verified.statusCode, 200); assert.equal(verified.json().email, 'ju@site.test');
  assert.equal((await call(session, {method: 'GET'})).statusCode, 401, 'no token');
  assert.equal((await call(session, {method: 'GET', headers: {authorization: 'Bearer garbage'}})).statusCode, 401);
  assert.equal((await call(session, {method: 'POST'})).statusCode, 405);
  assert.equal((await call(sessionHandler.create({env: {SITE_URL: SITE}}), {method: 'GET', headers: {authorization: `Bearer ${token}`}})).statusCode, 503);

  // rate limits: per IP and per e-mail, ten minutes
  let t = 0; const limited = loginHandler.create({env: ENV, now: () => t, limiter: createLimiter(() => t)});
  for (let i = 0; i < 8; i++) assert.equal((await call(limited, {ip: `192.0.2.${i}`, body: {email: 'ju@site.test', password: 'wrong'}})).statusCode, 401);
  const ninth = await call(limited, {ip: '192.0.2.99', body: {email: 'ju@site.test', password: 'wrong'}});
  assert.equal(ninth.statusCode, 429); assert(Number(ninth.headers['retry-after']) > 0);
  for (let i = 0; i < 15; i++) await call(limited, {ip: '192.0.2.200', body: {email: `x${i}@site.test`, password: 'wrong'}});
  assert.equal((await call(limited, {ip: '192.0.2.200', body: {email: 'fresh@site.test', password: 'wrong'}})).statusCode, 429, 'per IP');
  const flood = sessionHandler.create({env: ENV, now: () => t, limiter: createLimiter(() => t)});
  for (let i = 0; i < 120; i++) await call(flood, {method: 'GET', ip: '198.51.100.1', headers: {authorization: `Bearer ${token}`}});
  assert.equal((await call(flood, {method: 'GET', ip: '198.51.100.1', headers: {authorization: `Bearer ${token}`}})).statusCode, 429);
}

// ── client order store (prototype persistence in localStorage) ─────────
function fakeStorage() { const map = new Map(); return {getItem: k => map.has(k) ? map.get(k) : null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k)}; }
const ITEM = {productId: 'borboletoscopio', title: 'Borboletoscópio', quantity: 2, unitCents: 12900, selection: {body: 'pink', details: 'lilac'}};
const order = (over = {}) => ({reference: 'JU-TEST1', source: 'test', method: 'pix', items: [ITEM], totalCents: 27600, customer: {name: 'Ana', email: 'ana@example.com', phone: '31999991234'}, address: {cep: '30140071', street: 'Rua A', number: '1', district: 'Centro', city: 'BH', state: 'MG', complement: ''}, notes: '', ...over});
{
  const s = fakeStorage();
  assert.deepEqual(store.readOrders(s), []);
  const list = store.recordOrder(order(), s);
  assert.equal(list.length, 1); assert.equal(list[0].status, 'pendente'); assert.equal(list[0].reference, 'JU-TEST1'); assert(list[0].id);
  assert.equal(store.recordOrder(order({totalCents: 1}), s).length, 1, 'the same reference is never recorded twice');
  store.recordOrder(order({reference: 'JU-TEST2', totalCents: 15900}), s);
  assert.equal(store.readOrders(s).length, 2);

  const id = store.readOrders(s)[0].id;
  const afterDecline = store.setStatus(id, 'recusado', {reason: 'sem estoque', storage: s});
  assert.equal(afterDecline.find(o => o.id === id).status, 'recusado'); assert.equal(afterDecline.find(o => o.id === id).declineReason, 'sem estoque');
  assert(afterDecline.find(o => o.id === id).decidedAt);
  store.setStatus(id, 'pendente', {storage: s});
  assert.equal(store.readOrders(s).find(o => o.id === id).declineReason, '', 'reopening clears the old decline reason');
  assert.equal(store.readOrders(s).find(o => o.id === id).decidedAt, null);
  assert.throws(() => store.setStatus(id, 'nope', {storage: s}));

  assert.equal(store.listByStatus(store.readOrders(s), 'pendente').length, 2);
  const pending = store.listByStatus(store.readOrders(s), 'pendente');
  assert(pending[0].paidAt <= pending.at(-1).paidAt, 'pending queue is oldest-first');

  const s2 = fakeStorage();
  store.recordOrder(order({reference: 'A'}), s2);
  const bogus = JSON.parse(s2.getItem(store.ORDERS_KEY)); bogus.push({not: 'an order'}, null, {id: 'x', reference: 'y', items: [], totalCents: 5});
  s2.setItem(store.ORDERS_KEY, JSON.stringify(bogus));
  assert.equal(store.readOrders(s2).length, 1, 'malformed rows are dropped, not shown or thrown');
  s2.setItem(store.ORDERS_KEY, '{not json');
  assert.deepEqual(store.readOrders(s2), []);

  const s3 = fakeStorage();
  const day = iso => store.dayKey(iso);
  const d1 = new Date('2026-01-05T10:00:00').toISOString(), d2 = new Date('2026-01-05T22:00:00').toISOString(), d3 = new Date('2026-01-06T09:00:00').toISOString();
  for (const [ref, paidAt, cents] of [['A', d1, 1000], ['B', d2, 2000], ['C', d3, 500]]) { store.recordOrder(order({reference: ref, totalCents: cents}), s3); const list3 = store.readOrders(s3); const found = list3.find(o => o.reference === ref); found.paidAt = paidAt; s3.setItem(store.ORDERS_KEY, JSON.stringify(list3)); }
  const totals = store.dailyTotals(store.readOrders(s3));
  assert.deepEqual(totals.map(t => [t.date, t.totalCents, t.count]), [[day(d1), 3000, 2], [day(d3), 500, 1]]);
  assert.deepEqual(store.ordersForDay(store.readOrders(s3), day(d1)).map(o => o.reference).sort(), ['A', 'B']);
  const sum = store.summary(store.readOrders(s3));
  assert.equal(sum.revenue, 3500); assert.equal(sum.pendentes, 3);

  assert.deepEqual(store.clearAll(s3), []); assert.deepEqual(store.readOrders(s3), []);
}

console.log('PASS: admin settings/password check (case-insensitive, trimmed, never matches unconfigured), session tokens (signed, expiring, tamper-evident), login/session handlers (origin, rate limits per IP and e-mail, no password leaks), and the client order store (idempotent recording, status transitions with decline reasons, daily totals, malformed data dropped).');
