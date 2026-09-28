// Accounts: e-mailed codes, sign-up grants, passwords, sessions and the buyer identification, with a controlled clock and
// the in-memory store (same interface as MySQL). Then the HTTP endpoints through server/create-server.cjs: cookies,
// origin checks and what never leaves the server.
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {createAccounts, SESSION_TTL} = require('../api/_lib/accounts.js');
const {createMemoryStore} = require('../api/_lib/store-memory.js');
const {decrypt} = require('../api/_lib/fields.js');
const {TERMS_VERSION} = require('../api/_lib/legal.js');

const env = {APP_ENV: 'preview'};
let clock = Date.parse('2026-09-28T12:00:00Z');
const now = () => clock;
const advance = ms => { clock += ms; };
const rejects = async (promise, code, message) => { await assert.rejects(promise, error => error.code === code, message || code); };

const store = createMemoryStore();
const sent = [];
const accounts = createAccounts({store, env, now, sendCode: async mail => sent.push(mail)});

// --- Codes and sign-up -------------------------------------------------------------------------------------------
await rejects(accounts.start({email: 'não é e-mail'}), 'invalid_email');
const first = await accounts.start({email: '  Ana.Souza@Exemplo.com.br ', ip: '1.1.1.1'});
assert.equal(first.email, 'ana.souza@exemplo.com.br', 'addresses are normalized');
assert.match(first.demoCode, /^\d{6}$/, 'without e-mail, the test site shows the code');
assert.match(first.challenge, /^[0-9a-f-]{36}\.[\w-]+$/);
await rejects(accounts.start({email: 'ana.souza@exemplo.com.br', ip: '1.1.1.1'}), 'too_many_requests', 'one code per 30 s per address');

// Wrong codes spend attempts; after five, even the right code is refused.
const wrong = first.demoCode === '000000' ? '111111' : '000000';
await rejects(accounts.verify({challenge: first.challenge, code: wrong}), 'invalid_code');
for (let i = 0; i < 3; i++) await rejects(accounts.verify({challenge: first.challenge, code: wrong}), 'invalid_code');
await rejects(accounts.verify({challenge: first.challenge, code: wrong}), 'too_many_attempts');
await rejects(accounts.verify({challenge: first.challenge, code: first.demoCode}), 'too_many_attempts', 'a locked code stays locked');

advance(31_000);
const second = await accounts.start({email: 'ana.souza@exemplo.com.br', ip: '1.1.1.1'});
const verified = await accounts.verify({challenge: second.challenge, code: second.demoCode});
assert.equal(verified.status, 'needs_profile', 'a new address finishes the sign-up');
assert.match(verified.grant, /^[\w-]{43}$/);
await rejects(accounts.verify({challenge: second.challenge, code: second.demoCode}), 'invalid_challenge', 'a code works once');
await rejects(accounts.register({grant: verified.grant, name: 'A'}), 'invalid_request', 'name is required');
await rejects(accounts.register({grant: verified.grant, name: 'Ana', password: 'curta'}), 'weak_password');
const signup = await accounts.register({grant: verified.grant, name: 'Ana', password: 'senha-forte-123', marketingOptIn: false});
{ const row = await store.customers.findByEmail('ana.souza@exemplo.com.br'); assert.equal(row.termsVersion, TERMS_VERSION, 'the account records the Termos accepted at sign-up'); assert(row.termsAcceptedAt); }
assert.deepEqual(signup.user, {name: 'Ana', email: 'ana.souza@exemplo.com.br', hasPassword: true, profileComplete: false, marketingOptIn: false});
assert.match(signup.session.token, /^[\w-]{43}$/);
await rejects(accounts.register({grant: verified.grant, name: 'Ana'}), 'invalid_grant', 'a grant is spent once');

// An existing account signs straight in with a code; the reference is the same shape for known and unknown addresses.
advance(31_000);
const again = await accounts.start({email: 'ana.souza@exemplo.com.br', ip: '1.1.1.1'});
const unknown = await accounts.start({email: 'ninguem@exemplo.com', ip: '1.1.1.1'});
assert.deepEqual(Object.keys(again).sort(), Object.keys(unknown).sort(), 'start does not reveal whether an account exists');
const signedIn = await accounts.verify({challenge: again.challenge, code: again.demoCode, ip: '1.1.1.1', userAgent: 'teste'});
assert.equal(signedIn.status, 'signed_in');
assert.equal(signedIn.user.email, 'ana.souza@exemplo.com.br');

// Codes expire after 10 minutes.
advance(31_000);
const late = await accounts.start({email: 'ana.souza@exemplo.com.br', ip: '1.1.1.1'});
advance(10 * 60 * 1000 + 1);
await rejects(accounts.verify({challenge: late.challenge, code: late.demoCode}), 'expired');
await rejects(accounts.verify({challenge: 'nao-e-um-desafio', code: '123456'}), 'invalid_challenge');

// --- Passwords and sessions ----------------------------------------------------------------------------------
const byPassword = await accounts.login({email: 'ANA.SOUZA@exemplo.com.br', password: 'senha-forte-123', ip: '2.2.2.2'});
assert.equal(byPassword.user.email, 'ana.souza@exemplo.com.br');
await rejects(accounts.login({email: 'ana.souza@exemplo.com.br', password: 'senha-errada-000', ip: '2.2.2.2'}), 'invalid_credentials');
await rejects(accounts.login({email: 'ninguem@exemplo.com', password: 'senha-forte-123', ip: '2.2.2.2'}), 'invalid_credentials', 'unknown e-mail looks like a wrong password');

const customer = await accounts.authenticate(byPassword.session.token);
assert.equal(customer.email, 'ana.souza@exemplo.com.br');
assert.equal(await accounts.authenticate('x'.repeat(43)), null, 'unknown token');
await accounts.logout(signup.session.token);
assert.equal(await accounts.authenticate(signup.session.token), null, 'logout ends the session');

// Forgot password: code → grant → new password; every other session ends.
advance(31_000);
const forgot = await accounts.start({email: 'ana.souza@exemplo.com.br', purpose: 'reset', ip: '1.1.1.1'});
const allowed = await accounts.verify({challenge: forgot.challenge, code: forgot.demoCode});
assert.equal(allowed.status, 'reset_allowed');
const reset = await accounts.resetPassword({grant: allowed.grant, password: 'outra-senha-456'});
assert.equal(await accounts.authenticate(byPassword.session.token), null, 'reset signs out other devices');
assert.ok(await accounts.authenticate(reset.session.token));
await rejects(accounts.login({email: 'ana.souza@exemplo.com.br', password: 'senha-forte-123', ip: '3.3.3.3'}), 'invalid_credentials', 'old password no longer works');
assert.ok((await accounts.login({email: 'ana.souza@exemplo.com.br', password: 'outra-senha-456', ip: '3.3.3.3'})).session);

// Sessions last 30 days and slide while used.
const session = (await accounts.login({email: 'ana.souza@exemplo.com.br', password: 'outra-senha-456', ip: '4.4.4.4'})).session;
advance(SESSION_TTL - 60_000);
assert.ok(await accounts.authenticate(session.token), 'still valid just before 30 days (and renewed now)');
advance(SESSION_TTL - 60_000);
assert.ok(await accounts.authenticate(session.token), 'renewed by use');
advance(SESSION_TTL + 1);
assert.equal(await accounts.authenticate(session.token), null, 'expires after 30 idle days');

// Brute force on the password is limited per address.
for (let i = 0; i < 10; i++) await accounts.login({email: 'ana.souza@exemplo.com.br', password: 'errada-' + i, ip: `9.9.9.${i}`}).catch(() => {});
await rejects(accounts.login({email: 'ana.souza@exemplo.com.br', password: 'outra-senha-456', ip: '9.9.9.99'}), 'too_many_requests');

// --- Identification (checkout) -------------------------------------------------------------------------------
const ana = await store.customers.findByEmail('ana.souza@exemplo.com.br');
await rejects(accounts.updateProfile(ana, {firstName: 'Ana Beatriz', lastName: 'Souza Lima', phone: '(11) 98765-4321'}), 'invalid_request', 'CPF is required the first time');
await rejects(accounts.updateProfile(ana, {firstName: 'Ana Beatriz', lastName: 'Souza Lima', phone: '(11) 98765-4321', cpf: '529.982.247-26'}), 'invalid_request', 'CPF check digits');
await rejects(accounts.updateProfile(ana, {firstName: 'Ana Beatriz', lastName: 'Souza Lima', phone: '1234', cpf: '529.982.247-25'}), 'invalid_request', 'phone with area code');
const profile = await accounts.updateProfile(ana, {firstName: 'Ana Beatriz', lastName: 'Souza Lima', phone: '(11) 98765-4321', cpf: '529.982.247-25'});
assert.deepEqual(profile, {email: 'ana.souza@exemplo.com.br', firstName: 'Ana Beatriz', lastName: 'Souza Lima', cpf: {masked: '***.982.247-**'}, phone: '(11) 98765-4321', company: null, marketingOptIn: false});
const row = await store.customers.findByEmail('ana.souza@exemplo.com.br');
assert(!Buffer.from(row.cpfEnc).toString('latin1').includes('52998224725') && !JSON.stringify(row).includes('52998224725'), 'CPF is never stored in clear');
assert.equal(decrypt(env, row.cpfEnc), '52998224725', 'but it can be read back by the server (NF-e, shipping label)');
assert.equal(accounts.publicUser(row).profileComplete, true);

// Keeping the CPF: later updates may omit it. Company data: valid CNPJ (numeric or alphanumeric) and a state registration.
const kept = await accounts.updateProfile(row, {firstName: 'Ana Beatriz', lastName: 'Souza Lima', phone: '11987654321'});
assert.equal(kept.cpf.masked, '***.982.247-**');
await rejects(accounts.updateProfile(row, {firstName: 'Ana', lastName: 'Souza', phone: '11987654321', company: {cnpj: '11.222.333/0001-82', name: 'Clínica Olhar', stateRegistration: '123'}}), 'invalid_request', 'CNPJ check digits');
await rejects(accounts.updateProfile(row, {firstName: 'Ana', lastName: 'Souza', phone: '11987654321', company: {cnpj: '12.ABC.345/01DE-35', name: 'Clínica Olhar'}}), 'invalid_request', 'state registration or exempt');
const withCompany = await accounts.updateProfile(row, {firstName: 'Ana', lastName: 'Souza', phone: '11987654321', company: {cnpj: '12.ABC.345/01DE-35', name: 'Clínica Olhar', stateRegistrationExempt: true}});
assert.deepEqual(withCompany.company, {cnpj: '12.ABC.345/01DE-35', name: 'Clínica Olhar', stateRegistration: 'ISENTO'});
const withoutCompany = await accounts.updateProfile(await store.customers.findByEmail('ana.souza@exemplo.com.br'), {firstName: 'Ana', lastName: 'Souza', phone: '11987654321', company: null});
assert.equal(withoutCompany.company, null);

// One account per CPF.
advance(31_000);
const bia = await accounts.start({email: 'bia@exemplo.com', ip: '5.5.5.5'});
const biaGrant = await accounts.verify({challenge: bia.challenge, code: bia.demoCode});
await accounts.register({grant: biaGrant.grant, name: 'Bia'});
await rejects(accounts.updateProfile(await store.customers.findByEmail('bia@exemplo.com'), {firstName: 'Bia', lastName: 'Lima', phone: '21987654321', cpf: '52998224725'}), 'cpf_in_use');

// --- With e-mail configured: the code goes by e-mail, never in the answer -----------------------------------------
const mailed = createAccounts({store, env: {APP_ENV: 'preview', AUTH_SECRET: 's'.repeat(40), MAIL_TRANSPORT: 'console'}, now, sendCode: async mail => sent.push(mail)});
advance(31_000);
const byMail = await mailed.start({email: 'caio@exemplo.com', ip: '6.6.6.6'});
assert.equal(byMail.demoCode, undefined, 'no code in the answer when e-mail works');
assert.equal(sent.at(-1).email, 'caio@exemplo.com');
assert.match(sent.at(-1).code, /^\d{6}$/);
await rejects(createAccounts({store, env: {APP_ENV: 'production'}, now}).start({email: 'x@exemplo.com'}), 'email_not_configured', 'production never shows codes on the page');

// --- Excluir minha conta: a code to the account's own address; orders stay without the link -----------------------
{
  const biaRow = await store.customers.findByEmail('bia@exemplo.com');
  await store.orders.create({id: 'order-bia-1', reference: 'JU-BIA0000001', customerId: biaRow.id, source: 'test', status: 'pendente', subtotalCents: 12900, shippingCents: 1800, totalCents: 14700, buyer: {name: 'Bia Lima', email: 'bia@exemplo.com'}, shipTo: {recipient: 'Bia Lima'}, items: []});
  advance(31_000);
  const access = await accounts.start({email: 'bia@exemplo.com', ip: '5.5.5.6'});
  const {session} = await accounts.verify({challenge: access.challenge, code: access.demoCode});
  advance(31_000);
  const deletion = await accounts.startDeletion(biaRow, {ip: '5.5.5.6'});
  assert.equal(deletion.purpose, 'delete'); assert.equal(deletion.email, 'bia@exemplo.com'); assert.match(deletion.demoCode, /^\d{6}$/);
  await rejects(accounts.verify({challenge: deletion.challenge, code: deletion.demoCode}), 'invalid_challenge', 'a deletion code never signs anyone in nor opens a password reset');
  await rejects(accounts.deleteAccount(await store.customers.findByEmail('ana.souza@exemplo.com.br'), {challenge: deletion.challenge, code: deletion.demoCode}), 'invalid_challenge', 'only for the account it was sent to');
  await rejects(accounts.deleteAccount(biaRow, {challenge: access.challenge, code: access.demoCode}), 'invalid_challenge', 'a sign-in code cannot delete');
  const wrongCode = deletion.demoCode === '000000' ? '111111' : '000000';
  const miss = await accounts.deleteAccount(biaRow, {challenge: deletion.challenge, code: wrongCode}).catch(e => e);
  assert.equal(miss.code, 'invalid_code'); assert.equal(miss.remaining, 4);
  assert(await store.customers.findByEmail('bia@exemplo.com'), 'nothing is deleted by a wrong code');
  assert.deepEqual(await accounts.deleteAccount(biaRow, {challenge: deletion.challenge, code: deletion.demoCode}), {deleted: true});
  assert.equal(await store.customers.findByEmail('bia@exemplo.com'), null, 'the account is gone');
  assert.equal(await accounts.authenticate(session.token), null, 'and signed out on every device');
  const kept = await store.orders.findById('order-bia-1');
  assert.equal(kept.customerId, null, 'the order stays for the invoice records, without the link to the account');
  assert.equal(kept.buyer.email, 'bia@exemplo.com');
  await rejects(accounts.deleteAccount(biaRow, {challenge: deletion.challenge, code: deletion.demoCode}), 'invalid_challenge', 'once');
  // The address is free again: a new sign-up starts an empty account.
  advance(31_000);
  const fresh = await accounts.start({email: 'bia@exemplo.com', ip: '5.5.5.7'});
  assert.equal((await accounts.verify({challenge: fresh.challenge, code: fresh.demoCode})).status, 'needs_profile');
  // Rate limits: deletion codes are limited like any other code (and to five per hour per account).
  const ana = await store.customers.findByEmail('ana.souza@exemplo.com.br');
  for (let i = 0; i < 5; i++) { advance(31_000); await accounts.startDeletion(ana, {ip: `7.7.7.${i}`}); }
  advance(31_000);
  await rejects(accounts.startDeletion(ana, {ip: '7.7.7.9'}), 'too_many_requests');
}

// --- Endpoints for "Meus pedidos" and the deletion (handlers with the test store and clock) ------------------------
{
  const orderHandler = require('../api/account/orders.js').create({env, store, now});
  const startHandler = require('../api/account/delete-start.js').create({env, store, now});
  const deleteHandler = require('../api/account/delete.js').create({env, store, now});
  const invoke = async (handler, {method = 'POST', body = {}, cookie = '', origin = 'http://localhost:8844'} = {}) => {
    const res = {statusCode: 200, headers: {}, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(d) { this.body = d || ''; }};
    await handler({method, headers: {...(origin ? {origin} : {}), ...(cookie ? {cookie} : {}), 'x-forwarded-for': '8.8.8.8'}, body, socket: {}, url: '/'}, res);
    return {status: res.statusCode, headers: res.headers, body: res.body ? JSON.parse(res.body) : null};
  };
  advance(31_000);
  const carla = await accounts.start({email: 'carla@exemplo.com', ip: '8.8.8.8'});
  const grant = (await accounts.verify({challenge: carla.challenge, code: carla.demoCode})).grant;
  const {session} = await accounts.register({grant, name: 'Carla'});
  const cookie = `__Host-ju_session=${session.token}`, carlaRow = await store.customers.findByEmail('carla@exemplo.com');
  await store.orders.create({id: 'order-carla-1', reference: 'JU-CARLA00001', customerId: carlaRow.id, source: 'test', status: 'pendente', subtotalCents: 12900, shippingCents: 1800, totalCents: 14700, buyer: {name: 'Carla Dias', email: 'carla@exemplo.com'}, buyerDocEnc: Buffer.from('x'), shipTo: {recipient: 'Carla'}, mpOrderId: 'ORD01SECRET', paidAt: new Date(clock), items: [{productId: 'aviaoscopia', title: 'Aviãoscopia', quantity: 1, unitCents: 12900, selection: {body: 'blue'}}]});

  const attempt = (id, reference, status) => store.orders.create({id, reference, customerId: carlaRow.id, source: 'test', status, subtotalCents: 12900, shippingCents: 1800, totalCents: 14700, buyer: {name: 'Carla Dias', email: 'carla@exemplo.com'}, shipTo: {recipient: 'Carla'}, items: [{productId: 'aviaoscopia', title: 'Aviãoscopia', quantity: 1, unitCents: 12900, selection: {body: 'blue'}}]});
  await attempt('order-carla-2', 'JU-CARLA00002', 'cancelado');
  await attempt('order-carla-3', 'JU-CARLA00003', 'aguardando_pagamento');
  // An unpaid Pix from 3 hours ago: its code expired (1 h), so it is not listed even without Mercado Pago's notice.
  const stalePix = (await store.orders.create({id: 'order-carla-4', reference: 'JU-CARLA00004', customerId: carlaRow.id, source: 'test', status: 'aguardando_pagamento', subtotalCents: 1, shippingCents: 0, totalCents: 1, buyer: {name: 'Carla', email: 'carla@exemplo.com'}, shipTo: {}, items: [], createdAt: new Date(clock - 3 * 3600e3)})).order;
  await store.orders.update(stalePix.id, {paymentState: 'pending_pix'});

  assert.equal((await invoke(orderHandler, {method: 'GET', origin: ''})).status, 401, 'my orders need a session');
  const mine = await invoke(orderHandler, {method: 'GET', origin: '', cookie});
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.body.orders.map(o => [o.reference, o.status, o.totalCents, o.test]).sort(), [['JU-CARLA00001', 'pendente', 14700, true], ['JU-CARLA00003', 'aguardando_pagamento', 14700, true]], 'paid and still-waiting orders are listed; attempts never paid are not');
  assert(await store.orders.findById('order-carla-2'), 'the unpaid attempt stays in the database');
  assert(!JSON.stringify(mine.body).includes('ORD01SECRET') && !JSON.stringify(mine.body).includes('buyerDoc'), 'no payment ids or documents in the answer');
  const {createHash, randomBytes} = require('node:crypto'), anaToken = randomBytes(32).toString('base64url');
  await store.sessions.create({tokenHash: createHash('sha256').update(anaToken).digest(), customerId: (await store.customers.findByEmail('ana.souza@exemplo.com.br')).id, expiresAt: new Date(clock + 3600e3)});
  assert.deepEqual((await invoke(orderHandler, {method: 'GET', origin: '', cookie: `__Host-ju_session=${anaToken}`})).body.orders, [], "another buyer's orders never show");

  assert.equal((await invoke(startHandler, {cookie, origin: 'https://outro-site.com'})).status, 403);
  assert.equal((await invoke(startHandler)).status, 401);
  advance(31_000);
  const started = await invoke(startHandler, {cookie, body: {lang: 'en'}});
  assert.equal(started.status, 200); assert.match(started.body.challenge, /^[0-9a-f-]{36}\./);
  assert.equal((await invoke(deleteHandler, {cookie, body: {challenge: started.body.challenge, code: started.body.demoCode}, origin: 'https://outro-site.com'})).status, 403);
  assert.equal((await invoke(deleteHandler, {body: {challenge: started.body.challenge, code: started.body.demoCode}})).status, 401, 'the session is needed too, not only the code');
  const gone = await invoke(deleteHandler, {cookie, body: {challenge: started.body.challenge, code: started.body.demoCode}});
  assert.equal(gone.status, 200); assert.deepEqual(gone.body, {ok: true, deleted: true});
  assert.match(gone.headers['set-cookie'], /^__Host-ju_session=; .*Max-Age=0/, 'the cookie is cleared');
  assert.equal(await store.customers.findByEmail('carla@exemplo.com'), null);
  assert.equal((await store.orders.findById('order-carla-1')).customerId, null);
}

// --- HTTP: cookies, origin and what the browser sees ----------------------------------------------------------
const {createServer} = require('../server/create-server.cjs');
const server = createServer({log: {error: () => {}}});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const call = (method, path, body, {cookie = '', origin = base} = {}) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : '';
  const req = http.request(base + path, {method, headers: {...(data ? {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data)} : {}), ...(origin ? {Origin: origin} : {}), ...(cookie ? {Cookie: cookie} : {})}}, res => {
    let text = ''; res.on('data', c => { text += c; }); res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body: text ? JSON.parse(text) : null}));
  });
  req.on('error', reject); req.end(data);
});
try {
  assert.equal((await call('POST', '/api/auth/start', {email: 'dani@exemplo.com'}, {origin: 'https://outro-site.com'})).status, 403, 'other sites cannot start a sign-in');
  assert.equal((await call('POST', '/api/auth/start', {email: 'dani@exemplo.com'}, {origin: ''})).status, 403, 'no Origin, no change');
  const started = await call('POST', '/api/auth/start', {email: 'dani@exemplo.com'});
  assert.equal(started.status, 200);
  const needs = await call('POST', '/api/auth/verify', {challenge: started.body.challenge, code: started.body.demoCode});
  assert.equal(needs.body.status, 'needs_profile');
  assert.equal(needs.headers['set-cookie'], undefined, 'no session before the sign-up is finished');
  const created = await call('POST', '/api/auth/register', {grant: needs.body.grant, name: 'Dani', password: 'senha-da-dani-1'});
  assert.equal(created.status, 201);
  const cookie = created.headers['set-cookie'][0];
  assert.match(cookie, /^__Host-ju_session=[\w-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Expires=/, 'session cookie flags');
  assert(!JSON.stringify(created.body).includes(cookie.split(';')[0].split('=')[1]), 'the token is only in the cookie');
  const jar = cookie.split(';')[0];
  assert.equal((await call('GET', '/api/auth/me', null, {cookie: jar})).body.user.email, 'dani@exemplo.com');
  assert.equal((await call('GET', '/api/account/profile')).status, 401, 'profile needs a session');
  const saved = await call('PUT', '/api/account/profile', {firstName: 'Daniela', lastName: 'Prado', cpf: '123.456.789-09', phone: '(21) 99876-5432'}, {cookie: jar});
  assert.equal(saved.status, 200);
  assert.equal(saved.body.profile.cpf.masked, '***.456.789-**');
  assert.equal((await call('PUT', '/api/account/profile', {firstName: 'D', lastName: 'Prado', phone: '21998765432'}, {cookie: jar})).body.field, 'firstName', 'errors name the field');
  assert.equal((await call('PUT', '/api/account/profile', {firstName: 'Daniela', lastName: 'Prado', phone: '21998765432'}, {cookie: jar, origin: 'https://outro-site.com'})).status, 403);
  const out = await call('POST', '/api/auth/logout', {}, {cookie: jar});
  assert.match(out.headers['set-cookie'][0], /__Host-ju_session=; .*Max-Age=0/, 'logout clears the cookie');
  const after = await call('GET', '/api/auth/me', null, {cookie: jar});
  assert.equal(after.status, 200, 'nobody signed in is a normal answer, not a browser error on every page');
  assert.equal(after.body.user, null);
  assert.match(after.headers['set-cookie'][0], /Max-Age=0/, 'the stale cookie is cleared');
  assert.deepEqual((await call('GET', '/api/auth/me')).body, {user: null});
  const login = await call('POST', '/api/auth/login', {email: 'dani@exemplo.com', password: 'senha-da-dani-1'});
  assert.equal(login.status, 200);
  assert.equal((await call('POST', '/api/auth/login', {email: 'dani@exemplo.com', password: 'errada-000'})).body.error, 'invalid_credentials');
  const health = await call('GET', '/api/health');
  assert.equal(health.body.accounts, 'memory');
  assert.equal(health.body.db, 'off');
  assert.equal(health.body.dataKeys, 'dev');

  // Production without a database: accounts are off rather than kept in memory.
  const {endpoint} = require('../api/_lib/account-http.js');
  const off = endpoint({methods: ['GET'], handle: async () => ({})}).create({env: {APP_ENV: 'production'}});
  const offRes = await new Promise(resolve => { const res = new http.ServerResponse({method: 'GET'}); res.end = body => resolve({status: res.statusCode, body: JSON.parse(body)}); off({method: 'GET', headers: {}, url: '/api/auth/me'}, res); });
  assert.deepEqual(offRes, {status: 503, body: {error: 'accounts_unavailable'}});
} finally {
  server.close();
}

console.log('PASS: codes (single use, 5 attempts, 10 min, rate limits), sign-up grants, passwords (scrypt, reset signs out other devices), 30-day sliding sessions, identification (CPF encrypted and unique, alphanumeric CNPJ, phone), account deletion (e-mailed code of its own purpose, orders kept without the link, signed out everywhere), my orders (own orders only, no payment ids), and the HTTP layer (HttpOnly __Host- cookie, origin check, 503 without a database in production).');
