// The shop keeps going without Bling (BLING-RESILIENCIA.md): Bling down, slow, refusing for too many calls or
// disconnected never stops a confirmation nor shows the buyer an error. The note is saved in the queue first and goes by
// itself later (1, 5, 15 minutes, then every hour); after 3 failures in a row the circuit breaker stops calling Bling
// for a while and one call tests it again; calls keep Bling's pace (3 a second) and a 429 waits and goes again; a
// creation that broke midway is never sent twice; Ju is told in the panel and by e-mail (after 10 minutes), and again
// when Bling is back; every failure is in the integration log.
// Run: node tests/bling-resilience.mjs — no network (tools/fake-bling.cjs plays Bling, failures included).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {createBling, BREAKER} = require('../api/_lib/bling');
const {createInvoicing, QUEUE} = require('../api/_lib/invoicing');
const {createInvoiceQueue, panelStatus, ALERT_AFTER} = require('../api/_lib/invoice-queue');
const {UNKNOWN_CREATION} = require('../api/_lib/nfe-providers/bling');
const {createMemoryStore} = require('../api/_lib/store-memory');
const {encrypt} = require('../api/_lib/fields');
const {createFakeBling} = require('../tools/fake-bling.cjs');
const orderStatus = require('../api/admin/order-status'), orderInvoice = require('../api/admin/order-invoice'), adminOrders = require('../api/admin/orders');
const blingEndpoint = require('../api/admin/bling'), accountOrders = require('../api/account/orders');

const fake = createFakeBling();
// The pace (3 a second) is checked on its own below; BLING_TIMEOUT_MS makes "Bling never answers" take 60 ms here.
const ENV = {APP_ENV: 'preview', SITE_URL: 'https://site.test', NFE_PROVIDER: 'bling', NFE_EXAMPLE_DATA: '1', AUTH_SECRET: 's'.repeat(40), MAIL_TRANSPORT: 'console', ORDER_NOTIFY_EMAIL: 'ju@site.test',
  BLING_CLIENT_ID: fake.clientId, BLING_CLIENT_SECRET: fake.clientSecret, BLING_REQUESTS_PER_SECOND: '1000', BLING_TIMEOUT_MS: '60'};
const network = async (url, init) => String(url).includes('viacep.com.br') ? {ok: true, json: async () => ({cep: '01001-000', localidade: 'São Paulo', uf: 'SP', ibge: '3550308'})} : fake.fetchImpl(url, init);
const instant = async () => {};

let clock = Date.parse('2026-10-05T15:00:00Z');
const now = () => clock;
const store = createMemoryStore(), mails = [], outbox = mail => mails.push(mail);
const creations = () => fake.calls.filter(c => c.method === 'POST' && c.path === '/nfe').length;
const httpCalls = () => fake.calls.length;
const subjects = pattern => mails.filter(m => pattern.test(m.subject));
const breaker = () => store.integrations.get('bling');
const logged = async kind => (await store.integrationLog.recent('bling', 100)).filter(e => e.kind === kind);

function makeRes() { return {statusCode: 200, headers: {}, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(d) { this.body = d || ''; }, json() { return JSON.parse(this.body); }}; }
async function call(handler, {method = 'POST', body = {}, cookie = '', url = '/'} = {}) {
  const res = makeRes();
  await handler({method, headers: {origin: 'https://site.test', 'x-forwarded-for': '203.0.113.7', ...(cookie ? {cookie} : {})}, body, socket: {}, url}, res);
  return res;
}
const token = () => crypto.randomBytes(32).toString('base64url'), sha = t => crypto.createHash('sha256').update(t).digest();
async function adminSession(email = 'ju@site.test') {
  let admin = await store.admins.findByEmail(email);
  if (!admin) { admin = {id: crypto.randomUUID()}; await store.admins.create({id: admin.id, email, passwordHash: 'x', totpEnabledAt: new Date(clock)}); }
  const raw = token(); await store.adminSessions.create({tokenHash: sha(raw), adminId: admin.id, mfaAt: new Date(clock), expiresAt: new Date(clock + 30 * 86400e3)});
  return `__Host-ju_admin=${raw}`;
}
// A paid order, as the checkout saves it.
async function place({status = 'pendente', name = 'Ana Souza Lima', email = 'ana@example.com', customerId = null} = {}) {
  const {order} = await store.orders.create({
    id: crypto.randomUUID(), reference: 'JU-' + crypto.randomBytes(5).toString('hex').toUpperCase(), customerId, source: 'test', status, method: 'pix', lang: 'pt-BR', paidAt: new Date(clock),
    subtotalCents: 12900, shippingCents: 1800, totalCents: 14700,
    buyer: {name, email, company: null}, buyerDocEnc: encrypt(ENV, '52998224725'), phoneEnc: encrypt(ENV, '31999991234'),
    shipTo: {recipient: name, cep: '01001000', street: 'Praça da Sé', number: '100', district: 'Sé', city: 'São Paulo', state: 'SP', complement: ''},
    items: [{productId: 'borboletoscopio', title: 'Borboletoscópio', quantity: 1, unitCents: 12900, selection: {body: 'pink', details: 'lilac'}}], createdAt: new Date(clock)
  });
  return order;
}
const noteOf = async order => store.invoices.findByOrder(order.id);

// ── the pace: at most 3 calls a second leave a process ─────────────────
{
  const own = createMemoryStore();
  let t = 0;
  const starts = [], paced = createBling({store: own, env: {...ENV, BLING_REQUESTS_PER_SECOND: '3'}, now, clock: () => t, sleep: async ms => { t += ms; }, fetchImpl: async (url, init) => { starts.push(t); return network(url, init); }});
  await paced.connect(fake.authorize(paced.authorizationUrl('s')).code, {actor: 'ju'});
  for (let i = 0; i < 5; i++) await paced.natures();
  const gaps = starts.slice(1).map((s, i) => s - starts[i]);
  assert(gaps.every(gap => gap >= 333), `calls spaced by a third of a second at least (${gaps.join(', ')} ms)`);
}

const queue = createInvoiceQueue({store, env: ENV, now, fetchImpl: network, outbox, sleep: instant});
const invoicing = createInvoicing({store, env: ENV, now, fetchImpl: network, outbox, sleep: instant});
const ju = await adminSession();
const confirm = orderStatus.create({env: ENV, store, now, fetchImpl: network, outbox});
{
  const bling = createBling({store, env: ENV, now, fetchImpl: network});
  await bling.connect(fake.authorize(bling.authorizationUrl('s')).code, {actor: 'ju@site.test'});
}

// ── Bling down: the confirmation goes on, the note waits in the queue ─
const T0 = clock;
const buyerId = crypto.randomUUID();
await store.customers.create({id: buyerId, email: 'ana@example.com', emailVerifiedAt: new Date(clock), displayName: 'Ana'});
const buyerToken = token(); await store.sessions.create({tokenHash: sha(buyerToken), customerId: buyerId, expiresAt: new Date(clock + 30 * 86400e3)});
const first = await place({customerId: buyerId});
{
  fake.fail('rede');
  const started = Date.now();
  const answer = await call(confirm, {body: {id: first.id, status: 'confirmado'}, cookie: ju});
  assert.equal(answer.statusCode, 200);
  assert(Date.now() - started < 2000, 'answered at once');
  const {order, mailed} = answer.json();
  assert.equal(order.status, 'confirmado', 'the order is confirmed with Bling down'); assert.equal(mailed, true, 'and the buyer hears it');
  assert.equal(order.invoice.status, 'fila'); assert.match(order.invoice.message, /não respondeu/);
  assert.equal(new Date(order.invoice.nextAttemptAt).getTime(), clock + QUEUE.retry[0], 'tried again in a minute');
  assert.equal((await breaker()).failures, 1);
  assert((await store.orders.events(first.id)).some(e => e.kind === 'nfe:fila'), 'in the order history');
  // "Meus pedidos": the buyer never sees a note that is not authorized, so never an error.
  const mine = (await call(accountOrders.create({env: ENV, store, now}), {method: 'GET', cookie: `__Host-ju_session=${buyerToken}`})).json().orders;
  assert.equal(mine.find(o => o.reference === first.reference).invoice, null);
}

// ── the queue: 1, 5, 15 minutes; the breaker opens on the third failure in a row ──
{
  assert.deepEqual(await queue.runOnce(), {sent: 0, checked: 0, mailed: 0, waiting: 0}, 'nothing before its time');
  clock += QUEUE.retry[0];
  assert.equal((await queue.runOnce()).sent, 1);
  let note = await noteOf(first);
  assert.deepEqual([note.status, note.retries, new Date(note.nextAttemptAt).getTime()], ['fila', 2, clock + QUEUE.retry[1]]);
  clock += QUEUE.retry[1];
  await queue.runOnce();
  const row = await breaker();
  assert.equal(row.failures, 3); assert.equal(new Date(row.openUntil).getTime(), clock + BREAKER.firstMs, 'the breaker opens after 3 failures in a row');
  assert.equal(new Date(row.failingSince).getTime(), T0, 'unstable since the first failure');
  note = await noteOf(first);
  assert.equal(new Date(note.nextAttemptAt).getTime(), clock + QUEUE.retry[2]);
  assert.equal((await logged('falha')).length, 3); assert.equal((await logged('disjuntor')).length, 1);
}

// ── the breaker open: no call to Bling at all, the confirmation still instant ──
const second = await place({name: 'Bia Costa', email: 'bia@example.com'});
{
  const before = httpCalls();
  const answer = (await call(confirm, {body: {id: second.id, status: 'confirmado'}, cookie: ju})).json();
  assert.equal(answer.order.invoice.status, 'fila'); assert.match(answer.order.invoice.message, /fora do ar ou instável/);
  assert.equal(httpCalls(), before, 'with the breaker open Bling is not even called');
  await store.invoices.update((await noteOf(second)).id, {nextAttemptAt: new Date(clock)});   // due, but the breaker is still open
  assert.equal((await queue.runOnce()).waiting, 1, 'the queue waits for the breaker'); assert.equal(httpCalls(), before);

  // The panel tells Ju, from the database only.
  const status = await panelStatus({store, env: ENV, now});
  assert.deepEqual([status.state, status.waiting], ['instavel', 2]);
  const panel = (await call(adminOrders.create({env: ENV, store, now, fetchImpl: network, outbox, waitUntil: () => {}}), {method: 'GET', cookie: ju})).json();
  assert.equal(panel.integration.state, 'instavel'); assert.equal(panel.integration.waiting, 2);
  assert.equal(panel.orders.find(o => o.id === second.id).invoice.status, 'fila');
  // The notice can fail (the queue's columns missing after a migration that did not run): the panel opens anyway.
  const broken = Object.create(store);
  broken.invoices = {...store.invoices, queue: async () => { throw Object.assign(new Error("Unknown column 'next_attempt_at'"), {code: 'ER_BAD_FIELD_ERROR'}); }};
  const quietLog = console.error; console.error = () => {};
  let opened;
  try { opened = await call(adminOrders.create({env: ENV, store: broken, now, fetchImpl: network, outbox, waitUntil: () => {}}), {method: 'GET', cookie: ju}); } finally { console.error = quietLog; }
  assert.equal(opened.statusCode, 200, 'the panel opens without the notice'); assert.equal(opened.json().integration, undefined); assert(opened.json().orders.length >= 2);
  const card = (await call(blingEndpoint.create({env: ENV, store, now, fetchImpl: network}), {method: 'GET', cookie: ju})).json().bling;
  assert.equal(httpCalls(), before, 'opening the Bling card does not wait for Bling either');
  assert.equal(card.unstable, true); assert(card.problems.some(p => p.kind === 'disjuntor'), 'the last problems are listed');
  assert(!subjects(/Bling instável/).length, 'a short instability is no news yet');
}

// ── 10 minutes unstable: one e-mail to Ju; the next test of Bling fails and waits longer ──
{
  clock = T0 + ALERT_AFTER;
  await queue.runOnce();
  const row = await breaker();
  assert.equal(row.failures, 4, 'the breaker let one call through to test Bling, and it failed');
  assert.equal(new Date(row.openUntil).getTime(), clock + 2 * BREAKER.firstMs, 'the wait doubles');
  const alert = subjects(/Bling instável/);
  assert.equal(alert.length, 1); assert.equal(alert[0].to, 'ju@site.test');
  assert.match(alert[0].text, /Seus pedidos continuam salvos com segurança/); assert.match(alert[0].text, /2 notas fiscais esperando na fila/);
  await queue.runOnce();
  assert.equal(subjects(/Bling instável/).length, 1, 'only once');
}

// ── Bling back: the oldest note tests it, the breaker closes, everything goes, Ju hears it ──
{
  fake.fail(null);
  clock = T0 + 30 * 60000;
  const done = await queue.runOnce();
  assert.equal(done.sent, 2);
  for (const order of [first, second]) { const note = await noteOf(order); assert.equal(note.status, 'autorizada'); assert.equal(note.nextAttemptAt, null); }
  const row = await breaker();
  assert.deepEqual([row.failures, row.openUntil, row.alertedAt], [0, null, null], 'closed, and the alert cleared');
  assert.equal((await logged('recuperado')).length, 1);
  assert.equal(subjects(/O Bling voltou/).length, 1);
  assert(mails.some(m => m.to === 'ana@example.com' && /Nota fiscal do seu pedido/.test(m.subject)) && mails.some(m => m.to === 'bia@example.com' && /Nota fiscal do seu pedido/.test(m.subject)), 'each buyer gets the note');
  assert.equal(creations(), 2, 'one note each');
}

// ── a creation that broke midway: the site looks for the note in Bling, never makes a second one ──
{
  const closeBreaker = () => store.integrations.save('bling', {failures: 0, failingSince: null, openUntil: null, lastError: null});
  // Bling created the note and the answer never arrived (the connection dropped, a 502, an answer that stalled): the note
  // waits with a marker, and the next attempt finds that same note in Bling and goes on with it.
  for (const mode of ['queda', 'gateway', 'corpo']) {
    const order = await place({status: 'confirmado'}), before = creations();
    fake.fail(mode, {count: 1, match: 'POST /nfe'});
    const first = await invoicing.issue(order);
    assert.equal(first.status, 'fila', mode); assert.match(first.providerId, /^busca:\d{14}$/, `${mode}: marked for the search`); assert.match(first.message, /procura no Bling/);
    assert.equal(creations() - before, 1, `${mode}: Bling did create it`);
    await closeBreaker();
    clock += QUEUE.retry[0];
    await queue.runOnce();
    const found = await noteOf(order);
    assert.equal(found.status, 'autorizada', `${mode}: found and sent`); assert.match(found.providerId, /^\d+$/);
    assert.equal(creations() - before, 1, `${mode}: never a second note`);
  }
  assert((await logged('incerta')).length >= 3); assert((await logged('achada')).length >= 3, 'each found note is logged');

  // Nothing was created (the creation timed out before Bling took it): not found, so a person checks before a new one.
  const slowCreation = await place({status: 'confirmado'}), started = Date.now(), notesBefore = fake.notes.size;
  fake.fail('lento', {count: 1, match: 'POST /nfe'});
  assert.equal((await invoicing.issue(slowCreation)).status, 'fila');
  assert(Date.now() - started < 2000, 'the timeout cuts the wait');
  await closeBreaker();
  clock += QUEUE.retry[0];
  await queue.runOnce();
  const notFound = await noteOf(slowCreation);
  assert.deepEqual([notFound.status, notFound.message, notFound.providerId, notFound.nextAttemptAt], ['erro', UNKNOWN_CREATION, null, null], 'not found: a person checks Bling');
  assert.equal(fake.notes.size, notesBefore, 'no note exists in Bling, and none was created by the search');
  assert.equal((await invoicing.issue(slowCreation)).status, 'autorizada', 'after checking, "Tentar de novo" issues it');

  // Bling down during the search: the marker stays and the search runs again later.
  const later = await place({status: 'confirmado'});
  fake.fail('queda', {count: 1, match: 'POST /nfe'});
  await invoicing.issue(later);
  await closeBreaker();
  fake.fail('rede', {count: 1, match: 'GET /nfe'});
  clock += QUEUE.retry[0];
  await queue.runOnce();
  assert.match((await noteOf(later)).providerId, /^busca:/, 'still to be searched');
  await closeBreaker();
  clock += QUEUE.retry[1];
  await queue.runOnce();
  assert.equal((await noteOf(later)).status, 'autorizada');

  // Two notes in Bling fit (one more made by hand with the same data): the site does not choose; a person does.
  const twin = await place({status: 'confirmado'});
  fake.fail('queda', {count: 1, match: 'POST /nfe'});
  const marked = await invoicing.issue(twin);
  const original = [...fake.notes.values()].at(-1);
  fake.notes.set('99000001', {...original, id: 99000001, body: {...original.body}});
  await closeBreaker();
  clock += QUEUE.retry[0];
  await queue.runOnce();
  assert.match(marked.providerId, /^busca:/);
  assert.equal((await noteOf(twin)).message, UNKNOWN_CREATION, 'more than one: checked by a person');
  fake.notes.delete('99000001');

  // A refused connection never left the site: nothing was created, so the queue goes on as usual.
  await closeBreaker();
  const refused = await place({status: 'confirmado'});
  fake.fail('rede', {count: 1, match: 'POST /nfe'});
  assert.equal((await invoicing.issue(refused)).status, 'fila');
  assert.equal((await noteOf(refused)).providerId, null, 'no search needed');
  assert.equal(fake.state.fault, 'rede', 'armed once'); assert.equal(fake.state.faultCount, 0, 'and used');
  // A 503 on the creation: Bling did not take it either.
  const busy = await place({status: 'confirmado'});
  fake.fail('erro', {count: 1, match: 'POST /nfe'});
  assert.equal((await invoicing.issue(busy)).status, 'fila');
  clock += QUEUE.retry[0];
  await queue.runOnce();
  assert.equal((await noteOf(refused)).status, 'autorizada'); assert.equal((await noteOf(busy)).status, 'autorizada');
}

// ── a timeout after the note was sent: the next attempt reads it, never sends again ──
{
  const sentAlready = await place({status: 'confirmado'});
  fake.fail('lento', {count: 1, match: 'GET /nfe/'});
  const waiting = await invoicing.issue(sentAlready);
  assert.equal(waiting.status, 'fila'); assert.match(waiting.providerId, /^\d+$/, 'the note id is kept');
  const sends = fake.calls.filter(c => c.path === `/nfe/${waiting.providerId}/enviar?enviarEmail=false`).length, made = creations();
  clock += QUEUE.retry[0];
  await queue.runOnce();
  assert.equal((await noteOf(sentAlready)).status, 'autorizada');
  assert.equal(creations(), made, 'not created again'); assert.equal(fake.calls.filter(c => c.path === `/nfe/${waiting.providerId}/enviar?enviarEmail=false`).length, sends, 'nor sent again');
}

// ── Bling starts answering and stalls: the time limit covers the whole answer ──
{
  const stalled = await place({status: 'confirmado'});
  fake.fail('corpo', {count: 1, match: 'GET /nfe/'});
  const started = Date.now();
  const waiting = await invoicing.issue(stalled);
  assert(Date.now() - started < 2000, 'cut by the timeout, not held');
  assert.equal(waiting.status, 'fila'); assert.match(waiting.providerId, /^\d+$/);
  const made = creations();
  clock += QUEUE.retry[0];
  await queue.runOnce();
  assert.equal((await noteOf(stalled)).status, 'autorizada'); assert.equal(creations(), made, 'read again, not created again');

  await store.integrations.save('bling', {failures: 0, failingSince: null, openUntil: null, lastError: null});
}

// ── an order taken back to Pendentes or declined: its note leaves the queue, and never blocks the others ──
{
  fake.fail('rede');
  const back = await place(), declined = await place({name: 'Eva Rocha', email: 'eva@example.com'}), other = await place({name: 'Gil Prado', email: 'gil@example.com'});
  for (const order of [back, declined, other]) assert.equal((await call(confirm, {body: {id: order.id, status: 'confirmado'}, cookie: ju})).json().order.invoice.status, 'fila');
  const toPending = (await call(confirm, {body: {id: back.id, status: 'pendente'}, cookie: ju})).json();
  assert.equal(toPending.order.status, 'pendente'); assert.equal(toPending.order.invoice.nextAttemptAt, null, 'out of the queue');
  await call(confirm, {body: {id: declined.id, status: 'recusado', reason: 'Teste'}, cookie: ju});
  assert.equal((await noteOf(declined)).nextAttemptAt, null);
  // Even a note left due for an order no longer confirmed (say, changed by another way) is taken out, never sent, and the
  // ones after it go.
  await store.invoices.update((await noteOf(back)).id, {nextAttemptAt: new Date(clock - 3600e3)});
  fake.fail(null);
  await store.integrations.save('bling', {failures: 0, failingSince: null, openUntil: null, lastError: null});
  clock += QUEUE.retry[0];
  const before = creations();
  await queue.runOnce();
  assert.equal((await noteOf(other)).status, 'autorizada', 'the queue goes on');
  assert.deepEqual([(await noteOf(back)).status, (await noteOf(back)).nextAttemptAt], ['fila', null], 'parked, not sent');
  assert.equal((await noteOf(declined)).status, 'fila', 'a declined order never gets a note');
  assert.equal(creations() - before, 1, 'only the confirmed one');
  assert.equal((await panelStatus({store, env: ENV, now})).waiting, 0, 'parked notes are not counted as waiting');
  // Confirmed again: issued.
  assert.equal((await call(confirm, {body: {id: back.id, status: 'confirmado'}, cookie: ju})).json().order.invoice.status, 'autorizada');

  // A note already sent (the tax authority still processing it) keeps being followed even if the order goes back.
  const sent = await place({name: 'Hugo DEMORAR', email: 'hugo@example.com'});
  assert.equal((await call(confirm, {body: {id: sent.id, status: 'confirmado'}, cookie: ju})).json().order.invoice.status, 'processando');
  await call(confirm, {body: {id: sent.id, status: 'pendente'}, cookie: ju});
  assert((await noteOf(sent)).nextAttemptAt, 'still followed');
  clock += QUEUE.poll[0];
  await queue.runOnce();
  assert.equal((await noteOf(sent)).status, 'autorizada', 'and its end recorded (the panel then warns to cancel it in Bling if the order is declined)');

  // A note that breaks the round (here, its order cannot be read) is put off 15 minutes; the others still go.
  fake.fail('rede');
  const broken = await place({status: 'confirmado'}), fine = await place({status: 'confirmado', name: 'Ivo Reis', email: 'ivo@example.com'});
  await invoicing.issue(broken); await invoicing.issue(fine);
  fake.fail(null);
  await store.integrations.save('bling', {failures: 0, failingSince: null, openUntil: null, lastError: null});
  const shaky = Object.create(store);
  shaky.orders = {...store.orders, findById: async id => { if (id === broken.id) throw new Error('falha de leitura simulada'); return store.orders.findById(id); }};
  const errors = [], quiet = {log: () => {}, error: (...a) => errors.push(a.join(' '))};
  clock += QUEUE.retry[0];
  await createInvoiceQueue({store: shaky, env: ENV, now, fetchImpl: network, outbox, sleep: instant, log: quiet}).runOnce();
  assert.equal((await noteOf(fine)).status, 'autorizada', 'the note after it went');
  assert.equal(new Date((await noteOf(broken)).nextAttemptAt).getTime(), clock + 15 * 60000, 'the broken one waits 15 minutes');
  assert(errors.some(e => e.includes(broken.reference)), 'and the reason is logged');
  clock += 15 * 60000;
  await queue.runOnce();
  assert.equal((await noteOf(broken)).status, 'autorizada');
}

// ── the panel never waits long for a slow service: the note keeps going after the answer ──
{
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const slowProvider = {name: 'fake', emit: async () => { await gate; return {status: 'autorizada', number: '901', series: '1', accessKey: '9'.repeat(44), pdfUrl: 'https://n.test/901.pdf', providerId: 'p901'}; }, check: async () => ({status: 'autorizada'})};
  const slowInvoicing = createInvoicing({store, env: ENV, now, fetchImpl: network, outbox, provider: slowProvider});
  const order = await place({status: 'confirmado'}), background = [];
  const started = Date.now();
  const answered = await slowInvoicing.issueWithin(order, {actor: 'ju'}, {ms: 50, waitUntil: work => background.push(work)});
  assert(Date.now() - started < 1000); assert.equal(answered.status, 'fila'); assert.equal(answered.message, null, 'being sent: no failure to show');
  assert.equal(background.length, 1, 'the attempt goes on after the answer');
  assert.equal((await slowInvoicing.issue(order)).status, 'fila', 'a second attempt meanwhile waits: the note is held');
  assert.equal(await queue.runOnce().then(() => null), null);
  release();
  await Promise.all(background);
  const done = await noteOf(order);
  assert.equal(done.status, 'autorizada'); assert.equal(done.number, '901'); assert.equal(done.lockedUntil, null, 'and let go');
}

// ── too many calls (429): waits and goes again; still refused, the note waits ──
{
  const waits = [], patient = createInvoicing({store, env: ENV, now, fetchImpl: network, outbox, sleep: async ms => { waits.push(ms); }});
  fake.fail('limite', {count: 2, retryAfter: 1});
  const busy = await place({status: 'confirmado'});
  assert.equal((await patient.issue(busy)).status, 'autorizada', 'went through on the third try');
  assert.deepEqual(waits.filter(ms => ms >= 1000), [1000, 1000], "waited what Bling's Retry-After said"); assert.equal((await breaker()).failures, 0, 'not a failure');

  fake.fail('limite');
  const stubborn = await place({status: 'confirmado'});
  const note = await patient.issue(stubborn);
  assert.equal(note.status, 'fila'); assert.match(note.message, /pausa/);
  assert((await logged('limite')).length >= 1);
  fake.fail(null);
  clock += QUEUE.retry[0];
  await queue.runOnce();
  assert.equal((await noteOf(stubborn)).status, 'autorizada');
}

// ── two attempts at once (the panel and the queue): one note ──────────
{
  const twice = await place({status: 'confirmado'}), before = creations();
  const results = await Promise.all([invoicing.issue(twice), invoicing.issue(twice), queue.kick()]);
  assert.equal(creations() - before, 1, 'one note, however many attempts at the same time');
  assert(results.slice(0, 2).some(r => r.status === 'autorizada'));
  assert.equal((await noteOf(twice)).lockedUntil, null, 'and the note is free again');
}

// ── "Tentar agora": Ju makes the test call herself, past the breaker's wait ──
{
  const quick = createBling({store, env: ENV, now, fetchImpl: network, sleep: instant});
  fake.fail('erro');
  for (let i = 0; i < 2; i++) await assert.rejects(quick.natures());   // each GET is tried twice: 4 failures
  assert((await breaker()).failures >= BREAKER.threshold);
  const waiting = await place(), patientOne = await place({name: 'Dora Lima', email: 'dora@example.com'});
  assert.equal((await call(confirm, {body: {id: waiting.id, status: 'confirmado'}, cookie: ju})).json().order.invoice.status, 'fila');
  assert.equal((await call(confirm, {body: {id: patientOne.id, status: 'confirmado'}, cookie: ju})).json().order.invoice.status, 'fila');
  await store.invoices.update((await noteOf(patientOne)).id, {nextAttemptAt: new Date(clock + 3600e3), retries: 4});   // its next try an hour away
  fake.fail(null);
  const now1 = (await call(orderInvoice.create({env: ENV, store, now, fetchImpl: network, outbox}), {body: {id: waiting.id}, cookie: ju})).json();
  assert.equal(now1.order.invoice.status, 'autorizada', '"Tentar agora" issues it at once'); assert.equal((await breaker()).failures, 0);
  // Bling is back: the next round sends the others waiting for it, without waiting for their own next try.
  clock += 1000;
  await queue.runOnce();
  assert.equal((await noteOf(patientOne)).status, 'autorizada', 'Bling back: the queue goes at once');
}

// ── the tax authority still processing: asked again with growing waits, a failure only delays it ──
{
  const slow = await place({status: 'confirmado', name: 'Ana DEMORAR'});
  const processing = await invoicing.issue(slow);
  assert.equal(processing.status, 'processando'); assert.equal(new Date(processing.nextAttemptAt).getTime(), clock + QUEUE.poll[0]);
  fake.fail('rede', {count: 1});
  clock += QUEUE.poll[0];
  assert.equal((await queue.runOnce()).checked, 1);
  const later = await noteOf(slow);
  assert.deepEqual([later.status, later.retries, new Date(later.nextAttemptAt).getTime()], ['processando', 0, clock + QUEUE.poll[1]], 'a check that got no answer is not counted (only answers count toward the one-day limit)');
  clock += QUEUE.poll[1];
  await queue.runOnce();
  assert.equal((await noteOf(slow)).status, 'autorizada');
  assert(mails.some(m => /Nota fiscal do seu pedido/.test(m.subject) && m.text.includes(slow.reference)), 'the buyer gets it once authorized');
}

// ── the buyer's e-mail failed: sent again later ──────────────────────
{
  let resendDown = true;
  const sent = [];
  const withResend = {...ENV, MAIL_TRANSPORT: '', RESEND_API_KEY: 're_test_key'};
  const viaResend = async (url, init) => {
    if (!String(url).startsWith('https://api.resend.com/')) return network(url, init);
    if (resendDown) return {ok: false, status: 503, json: async () => ({message: 'down'})};
    sent.push(JSON.parse(init.body)); return {ok: true, status: 200, json: async () => ({id: 'em_' + sent.length})};
  };
  const quiet = await place({status: 'confirmado', email: 'carla@example.com', name: 'Carla Dias'});
  const errors = [], original = console.error; console.error = (...a) => errors.push(a.join(' '));
  let note;
  try { note = await createInvoicing({store, env: withResend, now, fetchImpl: viaResend}).issue(quiet); } finally { console.error = original; }
  assert.equal(note.status, 'autorizada'); assert.equal(note.customerNotifiedAt, null);
  assert.equal(new Date(note.nextAttemptAt).getTime(), clock + QUEUE.mail[0], 'the e-mail goes again in 5 minutes');
  resendDown = false; clock += QUEUE.mail[0];
  assert.equal((await createInvoiceQueue({store, env: withResend, now, fetchImpl: viaResend}).runOnce()).mailed, 1);
  assert.deepEqual(sent.map(m => m.to[0]), ['carla@example.com']);
  const after = await noteOf(quiet);
  assert(after.customerNotifiedAt); assert.equal(after.nextAttemptAt, null);
}

// ── two days of failures: the note leaves the queue and Ju is told ──
{
  const stuck = await place({status: 'confirmado'});
  fake.fail('rede');
  await invoicing.issue(stuck);
  await store.invoices.update((await noteOf(stuck)).id, {retries: QUEUE.maxRetries});
  await store.integrations.save('bling', {failures: 0, openUntil: null});   // the breaker would hold it otherwise
  const gaveUp = await invoicing.issue(stuck);
  assert.equal(gaveUp.status, 'erro'); assert.match(gaveUp.message, /muito tempo/); assert.equal(gaveUp.nextAttemptAt, null);
  assert.equal(subjects(new RegExp(`${stuck.reference} não saiu`)).length, 1);
  fake.fail(null);
  await store.integrations.save('bling', {failures: 0, failingSince: null, openUntil: null, lastError: null, alertedAt: null});
}

// ── the connection lost: the notes wait, Ju is told, and connecting again sends them ──
{
  clock += 7 * 3600e3; fake.expireAccessTokens(); fake.forgetRefreshTokens();
  const lost = await place();
  const answer = (await call(confirm, {body: {id: lost.id, status: 'confirmado'}, cookie: ju})).json();
  assert.equal(answer.order.invoice.status, 'fila'); assert.match(answer.order.invoice.message, /Conecte/);
  clock += QUEUE.waitForPerson;
  const before = httpCalls();
  assert.equal((await queue.runOnce()).waiting, 1, 'waits without calling Bling'); assert.equal(httpCalls(), before);
  assert.equal(subjects(/Conecte o Bling de novo/).length, 1);
  assert.equal((await panelStatus({store, env: ENV, now})).state, 'expirado');

  const background = [], endpoint = blingEndpoint.create({env: ENV, store, now, fetchImpl: network, outbox, waitUntil: work => background.push(work)});
  const {url} = (await call(endpoint, {body: {action: 'start'}, cookie: ju})).json();
  const allowed = fake.authorize(url);
  assert.equal((await call(endpoint, {body: {action: 'connect', code: allowed.code, state: allowed.state}, cookie: ju})).json().bling.connected, true);
  await Promise.all(background);
  assert.equal((await noteOf(lost)).status, 'autorizada', 'connecting again sends the queue at once');
  assert.equal(subjects(/O Bling voltou/).length, 2);
}

// ── the piece never leaves without its note: "Enviado" waits for the note to be authorized ──
{
  fake.fail('rede');
  const order = await place();
  assert.equal((await call(confirm, {body: {id: order.id, status: 'confirmado'}, cookie: ju})).json().order.invoice.status, 'fila');
  const blocked = await call(confirm, {body: {id: order.id, status: 'enviado', trackingCode: 'AA123456785BR'}, cookie: ju});
  assert.equal(blocked.statusCode, 409); assert.equal(blocked.json().error, 'invoice_pending');
  assert.equal((await store.orders.findById(order.id)).status, 'confirmado', 'still Pronto para envio');
  fake.fail(null);
  await store.integrations.save('bling', {failures: 0, failingSince: null, openUntil: null, lastError: null});
  clock += QUEUE.retry[0];
  await queue.runOnce();
  assert.equal((await noteOf(order)).status, 'autorizada');
  const shipped = await call(confirm, {body: {id: order.id, status: 'enviado', trackingCode: 'AA123456785BR'}, cookie: ju});
  assert.equal(shipped.statusCode, 200); assert.equal(shipped.json().order.status, 'enviado', 'with the note authorized, it goes');
  // Confirmed with no note at all (before NF-e issuing was on, or reopened from Recusados): the shipping waits, and
  // "Emitir nota fiscal" (the same retry endpoint) issues it, so the order is never stuck.
  const bare = await place({status: 'confirmado'});
  assert.equal(await noteOf(bare), null, 'no note');
  assert.equal((await call(confirm, {body: {id: bare.id, status: 'enviado', trackingCode: 'AA123456785BR'}, cookie: ju})).json().error, 'invoice_pending');
  const issued = (await call(orderInvoice.create({env: ENV, store, now, fetchImpl: network, outbox}), {body: {id: bare.id}, cookie: ju})).json();
  assert.equal(issued.order.invoice.status, 'autorizada', '"Emitir nota fiscal" issues it');
  assert.equal((await call(confirm, {body: {id: bare.id, status: 'enviado', trackingCode: 'AA123456785BR'}, cookie: ju})).statusCode, 200, 'then it ships');
  const panelSource = (await import('node:fs')).readFileSync(new URL('../dist/admin.js', import.meta.url), 'utf8');
  assert(panelSource.includes('Nota fiscal não emitida.') && panelSource.includes('Emitir nota fiscal'), 'the panel offers to issue it');
  // With NF-e issuing off, nothing changes.
  const offStore = createMemoryStore(), offEnv = {APP_ENV: 'preview', SITE_URL: 'https://site.test', AUTH_SECRET: 's'.repeat(40), MAIL_TRANSPORT: 'console'};
  const {order: plain} = await offStore.orders.create({...(await store.orders.findById(order.id)), id: crypto.randomUUID(), reference: 'JU-OFF0000001', status: 'confirmado'});
  const offAdmin = crypto.randomUUID(), raw = token();
  await offStore.admins.create({id: offAdmin, email: 'ju@site.test', passwordHash: 'x', totpEnabledAt: new Date(clock)});
  await offStore.adminSessions.create({tokenHash: sha(raw), adminId: offAdmin, mfaAt: new Date(clock), expiresAt: new Date(clock + 3600e3)});
  const free = await call(orderStatus.create({env: offEnv, store: offStore, now, outbox}), {body: {id: plain.id, status: 'enviado', trackingCode: 'AA123456785BR'}, cookie: `__Host-ju_admin=${raw}`});
  assert.equal(free.statusCode, 200, 'no NF-e issuing: shipping as before');
}

// ── a scheduled task can run the queue (a host that stops the app when idle) ──
{
  const runner = require('../api/fila/rodar');
  const secret = 'c'.repeat(40), withCron = {...ENV, CRON_SECRET: secret};
  const hit = async (env, auth, method = 'GET') => {
    const res = makeRes();
    await runner.create({env, store, now, fetchImpl: network, outbox})({method, headers: {'x-forwarded-for': '198.51.100.9', ...(auth ? {authorization: auth} : {})}, socket: {}, url: '/api/fila/rodar'}, res);
    return res;
  };
  assert.equal((await hit(ENV, `Bearer ${secret}`)).statusCode, 404, 'without CRON_SECRET the address does not exist');
  assert.equal((await hit({...ENV, CRON_SECRET: 'curta'}, 'Bearer curta')).statusCode, 404, 'a short secret does not switch it on');
  assert.equal((await hit(withCron, '')).statusCode, 401);
  assert.equal((await hit(withCron, `Bearer ${'x'.repeat(40)}`)).statusCode, 401, 'a wrong secret');
  assert.equal((await hit(withCron, `Bearer ${secret}`, 'DELETE')).statusCode, 405);
  fake.fail('rede');
  const waiting = await place();
  await call(confirm, {body: {id: waiting.id, status: 'confirmado'}, cookie: ju});
  fake.fail(null);
  await store.integrations.save('bling', {failures: 0, failingSince: null, openUntil: null, lastError: null});
  clock += QUEUE.retry[0];
  const ran = await hit(withCron, `Bearer ${secret}`);
  assert.equal(ran.statusCode, 200); assert.equal(ran.json().ok, true); assert(ran.json().sent >= 1, 'a round ran');
  assert.equal((await noteOf(waiting)).status, 'autorizada');
  assert(!JSON.stringify(ran.json()).includes(waiting.reference), 'counts only, never data');
  // /api/health says how long the process has been up and when the queue last ran (to see whether the host stops it).
  const health = JSON.parse(await new Promise(resolve => { const res = makeRes(); require('../api/health').create({env: ENV})({method: 'GET', headers: {}, socket: {}, url: '/api/health'}, res).then(() => resolve(res.body)); }));
  assert(Number.isInteger(health.uptime)); assert('lastRound' in health.queue && 'worker' in health.queue);
}

console.log('PASS: Bling resilience — confirmations never wait for Bling (saved in the queue first, the buyer never sees an error), the queue tries again (1, 5, 15 minutes, every hour) and gives up after two days with an e-mail, the circuit breaker (3 failures, doubling waits, one test call, "Tentar agora"), 3 calls a second and 429 waited out, creations that broke midway looked for in Bling and never sent twice, notes processing asked again, buyer e-mails sent again, a lost connection waited out and resent on connecting, Ju told in the panel and by e-mail after 10 minutes and when Bling is back, every failure logged, no shipping before the note is authorized, a scheduled task can run the queue.');
