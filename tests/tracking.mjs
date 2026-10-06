// Rastreio automático pelos Correios (05/10/2026, API Rastro): how the Correios events are read (codes and words, times in
// Brasília), the round (batches, the move to Concluídos on delivery, one e-mail per notice, Ju warned once per problem, an
// unknown code, the Correios down or refusing), the tracking e-mail when the code goes in, "Meus pedidos" (the timeline
// endpoint, only the buyer's own posted orders) and the panel/page wiring.
// Run: node tests/tracking.mjs — no network (tools/fake-correios.cjs plays the Correios, a fake Resend gets the e-mails).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const {classify, eventsOf, timeOf, createTracking, EVERY} = require('../api/_lib/tracking');
const {createFakeCorreios} = require('../tools/fake-correios.cjs');
const {createMemoryStore} = require('../api/_lib/store-memory');
const {createOrders, trackingView} = require('../api/_lib/orders');
const {encrypt} = require('../api/_lib/fields');
const {createCorreios} = require('../api/_lib/correios');

const quiet = {log: () => {}, error: () => {}};

// ── reading the Correios events ────────────────────────────────────────
assert.equal(classify({codigo: 'BDE', tipo: '01', descricao: 'Objeto entregue ao destinatário'}), 'entregue');
assert.equal(classify({codigo: 'BDI', tipo: '00', descricao: 'x'}), 'entregue', 'the delivery codes, whatever the words');
assert.equal(classify({codigo: 'OEC', tipo: '01', descricao: 'Objeto saiu para entrega ao destinatário'}), 'saiu_para_entrega');
assert.equal(classify({codigo: 'LDI', tipo: '01', descricao: 'Objeto aguardando retirada no endereço indicado'}), 'aguardando_retirada');
assert.equal(classify({codigo: 'BDE', tipo: '20', descricao: 'Carteiro não atendido'}), 'problema', 'a "baixa" that is not a delivery');
assert.equal(classify({codigo: 'BDE', tipo: '23', descricao: 'Objeto devolvido ao remetente'}), 'devolvido');
assert.equal(classify({codigo: 'BDE', tipo: '01', descricao: 'Objeto entregue ao remetente'}), 'devolvido', 'delivered back to the shop is a return');
// The words are a backstop, never a way around a "não entregue": no Concluído nor "Pedido entregue" e-mail by mistake.
assert.equal(classify({codigo: 'BDE', tipo: '25', descricao: 'Objeto não entregue ao destinatário'}), 'problema', 'a delivery that did not happen');
assert.equal(classify({codigo: 'XYZ', descricao: 'Objeto não foi entregue ao destinatário'}), 'problema', 'also for a code we do not know');
assert.equal(classify({codigo: 'XYZ', descricao: 'Objeto entregue ao destinatário'}), 'entregue', 'the words still count for an unknown code');
assert.equal(classify({codigo: 'OEC', tipo: '01', descricao: 'Objeto saiu para entrega ao remetente'}), 'devolvido', 'on its way back to the shop: no "saiu para entrega" e-mail to the buyer');
assert.equal(classify({codigo: 'PO', tipo: '01', descricao: 'Objeto postado'}), 'postado');
assert.equal(classify({codigo: 'RO', tipo: '01', descricao: 'Objeto em transferência - por favor aguarde'}), 'em_transito');
assert.equal(timeOf('2026-10-05T14:32:00'), '2026-10-05T17:32:00.000Z', 'no zone: Brasília time');
assert.equal(timeOf('2026-10-05T14:32:00Z'), '2026-10-05T14:32:00.000Z');
assert.equal(timeOf(''), null);
{
  const events = eventsOf({eventos: [
    {codigo: 'PO', tipo: '01', descricao: 'Objeto postado', dtHrCriado: '2026-10-01T09:00:00', unidade: {endereco: {cidade: 'OURO PRETO', uf: 'mg'}}},
    {codigo: 'OEC', tipo: '01', descricao: 'Objeto saiu para entrega ao destinatário', dtHrCriado: '2026-10-03T08:10:00', unidade: {endereco: {cidade: 'SAO PAULO', uf: 'SP'}}},
    {codigo: 'XX', descricao: '', dtHrCriado: '2026-10-02T00:00:00'}
  ]});
  assert.deepEqual(events.map(e => e.state), ['saiu_para_entrega', 'postado'], 'newest first; an event without words is dropped');
  assert.deepEqual(events[1].place, {city: 'OURO PRETO', uf: 'MG'});
  assert.deepEqual(Object.keys(events[0]).sort(), ['at', 'code', 'description', 'detail', 'place', 'state', 'to', 'type']);
  assert.deepEqual(eventsOf({mensagem: 'SRO-020: Objeto não encontrado'}), []);
}

// ── the Correios client: one code, a batch (up to 50) ─────────────────
{
  const fake = createFakeCorreios(), client = createCorreios({env: fake.creds, fetchImpl: fake.fetchImpl});
  await client.track(['aa123456745br']);
  assert(fake.calls.some(c => c.path === '/srorastro/v1/objetos/AA123456745BR' && c.params.resultado === 'T'), 'one code: its own address, every event');
  await client.track(['AA123456710BR', 'AA123456723BR', 'AA123456710BR']);
  const batch = fake.calls.findLast(c => c.path === '/srorastro/v1/objetos');
  assert(batch && batch.params.resultado === 'T', 'a batch: codigosObjetos repeated');
  // The real API Rastro answered 400 "SRO-018" to Node's own "Accept-Language: *" (site de teste, 06/10): the client says pt-BR.
  const sent = [], spied = createCorreios({env: fake.creds, fetchImpl: (url, init) => { sent.push(init?.headers || {}); return fake.fetchImpl(url, init); }});
  await spied.track(['AA123456745BR']);
  assert(sent.some(h => /^Bearer /.test(h.Authorization || '')) && sent.filter(h => /^Bearer /.test(h.Authorization || '')).every(h => h['Accept-Language'] === 'pt-BR'), 'every authenticated call says pt-BR');
  await assert.rejects(client.track(Array.from({length: 51}, (_, i) => `AA${String(100000000 + i)}BR`)), {code: 'correios_rejected'}, 'never more than 50');
}

// ── the round ─────────────────────────────────────────────────────────
const SITE = 'https://site.test';
const ENV = {SITE_URL: SITE, APP_ENV: 'preview', DATA_KEY: 'k'.repeat(64), RESEND_API_KEY: 're_test_rastreio', MAIL_FROM: 'Ju <pedidos@site.test>', ORDER_NOTIFY_EMAIL: 'ju@site.test'};
function world({down = false} = {}) {
  const fake = createFakeCorreios(), env = {...ENV, ...fake.creds}, store = createMemoryStore(), mails = [];
  let clock = Date.parse('2026-10-05T15:00:00Z');
  const fetchImpl = async (url, init = {}) => {
    if (String(url).startsWith('https://api.resend.com')) { const body = JSON.parse(init.body); mails.push({...body, key: init.headers['Idempotency-Key']}); return {ok: true, status: 200, json: async () => ({id: 'em_' + mails.length})}; }
    return fake.fetchImpl(url, init);
  };
  if (down) fake.setDown(true);
  return {fake, env, store, mails, fetchImpl, now: () => clock, advance: ms => { clock += ms; }};
}
async function posted(store, code, over = {}) {
  const id = crypto.randomUUID(), reference = `JU-R${code.slice(2, 11)}`;
  await store.orders.create({id, reference, customerId: over.customerId ?? null, source: 'test', status: 'enviado', method: 'pix', lang: 'pt-BR', subtotalCents: 12900, shippingCents: 1800, totalCents: 14700,
    buyer: {name: 'Ana Souza', email: 'ana@example.com', company: null}, buyerDocEnc: null, phoneEnc: null,
    shipTo: {recipient: 'Ana Souza', cep: '01001000', street: 'Praça da Sé', number: '100', district: 'Sé', city: 'São Paulo', state: 'SP', complement: ''},
    items: [{productId: 'borboletoscopio', title: 'Borboletoscópio', quantity: 1, unitCents: 12900, selection: {body: 'mint', details: 'yellow'}}],
    paidAt: new Date(Date.parse('2026-10-03T12:00:00Z')), trackingCode: code, shippedAt: new Date(Date.parse('2026-10-04T12:00:00Z')), createdAt: new Date(Date.parse('2026-10-03T12:00:00Z')), ...over});
  return id;
}
{
  const w = world(), tracking = createTracking({store: w.store, env: w.env, now: w.now, fetchImpl: w.fetchImpl, log: quiet});
  const ids = {
    unknown: await posted(w.store, 'AA123456706BR'), transit: await posted(w.store, 'AA123456723BR'), out: await posted(w.store, 'AA123456737BR'),
    delivered: await posted(w.store, 'AA123456745BR'), away: await posted(w.store, 'AA123456754BR'), back: await posted(w.store, 'AA123456768BR'),
    old: await posted(w.store, 'AA123456771BR', {shippedAt: new Date(Date.parse('2026-07-01T12:00:00Z'))})
  };
  const done = await tracking.runOnce();
  assert.deepEqual(done, {checked: 6, delivered: 1, failed: 0}, 'every package due, the 60-day-old one left out');
  assert.equal(w.fake.calls.filter(c => c.path.startsWith('/srorastro')).length, 1, 'one batch call for all of them');
  const get = async key => w.store.orders.findById(ids[key]);
  assert.equal((await get('unknown')).trackingState, 'nao_encontrado'); assert.equal((await get('unknown')).status, 'enviado');
  assert.equal((await get('transit')).trackingState, 'em_transito');
  const delivered = await get('delivered');
  assert.deepEqual([delivered.status, delivered.trackingState], ['concluido', 'entregue'], 'delivered: Concluídos by itself');
  assert(delivered.deliveredAt && delivered.decidedAt);
  assert((await w.store.orders.events(ids.delivered)).some(e => e.kind === 'status:concluido' && e.actor === 'correios'), 'recorded in the history');
  assert.equal((await get('old')).trackingCheckedAt ?? null, null, 'a code posted more than 60 days ago is no longer looked up');
  const subjects = w.mails.map(m => `${m.to[0]} · ${m.subject}`);
  assert(subjects.includes('ana@example.com · [TESTE] Pedido entregue · JU-R123456745 · Ju, imprime pra mim?'), 'the buyer hears about the delivery');
  assert(subjects.includes('ana@example.com · [TESTE] Seu pedido saiu para entrega · JU-R123456737 · Ju, imprime pra mim?'), 'and that it is out for delivery');
  assert(subjects.some(s => s.startsWith('ju@site.test · [TESTE] O pacote do pedido JU-R123456754 precisa de atenção')), 'Ju hears about a recipient away');
  assert(subjects.some(s => s.startsWith('ju@site.test · [TESTE] O pacote do pedido JU-R123456768 está voltando')), 'and about a return');
  const away = w.mails.find(m => m.subject.includes('JU-R123456754'));
  assert(away.html.includes('ENTREGA · AVISO DO SITE') && away.text.includes('Carteiro não atendido') && away.text.includes('Destinatário ausente'), 'what the Correios said, in the e-mail');
  assert.equal(w.mails.length, 4);
  assert.equal(w.mails.find(m => m.subject.includes('saiu para entrega')).key, `order-saiu-${ids.out}-${Date.parse('2026-10-04T12:00:00Z')}`);

  // the next round within 2 hours looks up nothing; after 2 hours the same answers send nothing again
  assert.deepEqual(await tracking.runOnce(), {checked: 0, delivered: 0, failed: 0});
  w.advance(EVERY + 60000);
  await tracking.runOnce();
  assert.equal(w.mails.length, 4, 'one e-mail per notice: nothing repeats');
  assert.deepEqual(String((await get('away')).trackingNotices).split(','), ['problema:BDE20'], 'already a failed attempt when first looked at: Ju is warned, no late "saiu para entrega" to the buyer');

  // the views
  const admin = createOrders({store: w.store, env: w.env}).adminView(delivered);
  assert.deepEqual([admin.tracking.state, admin.tracking.last.state, admin.tracking.code], ['entregue', 'entregue', 'AA123456745BR']);
  assert(!('events' in admin.tracking), 'the panel gets the last event only');
  const buyer = createOrders({store: w.store, env: w.env}).customerView(delivered);
  assert.equal(buyer.tracking.state, 'entregue');
  assert.equal(trackingView(delivered, {all: true}).events.length, 4);
}

// ── the Correios down, refusing, and Ju's panel round ─────────────────
{
  const w = world({down: true}), tracking = createTracking({store: w.store, env: w.env, now: w.now, fetchImpl: w.fetchImpl, log: quiet});
  const id = await posted(w.store, 'AA123456745BR');
  assert.deepEqual(await tracking.runOnce(), {checked: 0, delivered: 0, failed: 1});
  assert.equal((await w.store.orders.findById(id)).trackingCheckedAt ?? null, null, 'down: tried again at the next round');
  const refusing = createTracking({store: w.store, env: w.env, now: w.now, fetchImpl: async () => ({ok: false, status: 403, json: async () => ({msgs: ['API não liberada para o contrato']})}), log: quiet});
  await refusing.runOnce();
  assert((await w.store.orders.findById(id)).trackingCheckedAt, 'refused (the API off the contract): not asked again for 2 hours');
  assert.deepEqual(await createTracking({store: w.store, env: ENV, now: w.now, fetchImpl: w.fetchImpl, log: quiet}).runOnce(), {checked: 0, delivered: 0, failed: 0}, 'no Correios credentials: off');
}

// ── the tracking e-mail when the code goes in, the code changing ──────
{
  const w = world(), orders = createOrders({store: w.store, env: w.env, now: w.now});
  const id = await posted(w.store, 'AA123456737BR', {status: 'confirmado', trackingCode: null, shippedAt: null});
  const shipped = await orders.setStatus(id, 'enviado', {trackingCode: 'AA123456737BR', actor: 'ju'});
  assert.equal(await orders.notifyDecision(shipped, {fetchImpl: w.fetchImpl}), true);
  assert.equal(w.mails.at(-1).subject, '[TESTE] Pedido enviado · JU-R123456737 · Ju, imprime pra mim?', 'the code goes in: "pedido enviado"');
  await createTracking({store: w.store, env: w.env, now: w.now, fetchImpl: w.fetchImpl, log: quiet}).runOnce();
  assert.equal((await w.store.orders.findById(id)).trackingState, 'saiu_para_entrega');
  const fixed = await orders.setStatus(id, 'enviado', {trackingCode: 'AA123456723BR', actor: 'ju'});
  assert.deepEqual([fixed.trackingState, fixed.trackingEvents, fixed.trackingNotices], [null, null, null], 'a new code: what was tracked for the old one goes');
  const back = await orders.setStatus(id, 'confirmado', {actor: 'ju'});
  assert.deepEqual([back.trackingCode, back.trackingState, back.trackingCheckedAt], [null, null, null], 'back to Expedição: no code, no tracking');
}

// ── 2026-10-05, the review: the check digit, a reopened delivery, the panel's list, a delivered order ──
{
  const {validTracking} = require('../api/_lib/orders');
  // UPU S10: the 9th digit checks the eight before it (RA473124829GB is the standard's own example)
  for (const code of ['RA473124829GB', 'AA123456785BR', 'AA123456706BR', 'AA123456710BR', 'AA987654326BR']) assert(validTracking(code), code);
  for (const code of ['AA123456789BR', 'AA123456758BR', 'AA132456785BR', 'AA12345678BR']) assert(!validTracking(code), code);   // a wrong digit, two swapped, one missing
  const panel = read('dist/admin.js');
  const panelOk = new Function('TRACKING', `${/const trackingOk = [^\n]+/.exec(panel)[0]} return trackingOk;`)(/^[A-Z]{2}\d{9}[A-Z]{2}$/);
  for (let i = 0; i < 3000; i++) { const code = `AA${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}BR`; assert.equal(panelOk(code), validTracking(code), code); }
  assert(panel.includes('ok = trackingOk(code)') && panel.includes("scan.form.classList.toggle('is-ready', ok)"), 'only a code that checks is offered to "Confirmar envio"');
  assert(panel.includes("'Este código não confere: algum número está trocado. Confira na etiqueta.'"));

  const w = world(), orders = createOrders({store: w.store, env: w.env, now: w.now}), tracking = createTracking({store: w.store, env: w.env, now: w.now, fetchImpl: w.fetchImpl, log: quiet});
  const waiting = await posted(w.store, 'AA123456737BR', {status: 'confirmado', trackingCode: null, shippedAt: null});
  await assert.rejects(orders.setStatus(waiting, 'enviado', {trackingCode: 'AA123456738BR', actor: 'ju'}), {code: 'invalid_request'}, 'the server never ships a code that does not check');

  // delivered (times from this test's clock, not the simulator's)
  const local = ms => new Date(ms - 3 * 3600000).toISOString().slice(0, 19);
  const step = (codigo, descricao, ms) => ({codigo, tipo: '01', descricao, dtHrCriado: local(ms), unidade: {endereco: {cidade: 'SAO PAULO', uf: 'SP'}}});
  const first = w.now() - 3600000, line = [step('OEC', 'Objeto saiu para entrega ao destinatário', first - 3 * 3600000), step('PO', 'Objeto postado', first - 30 * 3600000)];
  w.fake.setTracking('AA123456745BR', [step('BDE', 'Objeto entregue ao destinatário', first), ...line]);
  const id = await posted(w.store, 'AA123456745BR');
  await tracking.runOnce();
  assert.equal((await w.store.orders.findById(id)).status, 'concluido');
  const rastro = () => w.fake.calls.filter(c => c.path.startsWith('/srorastro')).length, asked = rastro();
  w.advance(86400000);
  await tracking.forOrder(await w.store.orders.findById(id));
  assert.equal(rastro(), asked, 'delivered: "Acompanhar entrega" shows the saved line, the Correios are not asked again');

  // the panel's list: the last event only (tracking_last), never the whole line
  const [listed] = await w.store.orders.listForAdmin({statuses: ['concluido']});
  assert.equal(listed.trackingEvents, null);
  assert.equal(orders.adminView(listed).tracking.last.description, 'Objeto entregue ao destinatário');
  const selected = /const ADMIN_ORDER_SELECT = \[([^\]]+)\]/.exec(read('api/_lib/store-mysql.js'))[1];
  assert(selected.includes("'tracking_last'") && !selected.includes("'tracking_events'"), 'MySQL: the list reads tracking_last, not tracking_events');
  assert(read('db/migrations/013_rastreio_ultimo.sql').includes('ADD COLUMN tracking_last TEXT NULL'));

  // reopened: the old delivery does not close it again; a new one does, and the buyer hears about it again
  const reopened = await orders.setStatus(id, 'enviado', {actor: 'ju'});
  assert.deepEqual([reopened.status, reopened.trackingState], ['enviado', 'entregue'], 'the tracking stays');
  assert.match(reopened.trackingNotices, /^reaberto:[0-9a-z]+$/, 'the delivery notice goes, the reopening time stays');
  w.advance(EVERY + 60000);
  await tracking.runOnce();
  assert.equal((await w.store.orders.findById(id)).status, 'enviado', 'a delivery from before the reopening does not close it again');
  assert.equal(w.mails.filter(m => m.subject.includes('Pedido entregue')).length, 1);
  w.advance(EVERY + 60000);
  const again = w.now() - 60000;
  w.fake.setTracking('AA123456745BR', [step('BDE', 'Objeto entregue ao destinatário', again), step('OEC', 'Objeto saiu para entrega ao destinatário', again - 3 * 3600000), step('BDE', 'Objeto entregue ao destinatário', first), ...line]);
  await tracking.runOnce();
  const closed = await w.store.orders.findById(id);
  assert.equal(closed.status, 'concluido', 'a delivery after the reopening closes it again');
  assert.equal(new Date(closed.deliveredAt).getTime(), Math.floor(again / 1000) * 1000, 'on the new day');
  assert.equal(w.mails.filter(m => m.subject.includes('Pedido entregue')).length, 2, 'and the buyer hears about it again');
}

// ── 2026-10-06, the first real test (AP503109323BR, delivered 18/09): an old package's code, and the Correios survey ──
{
  // the survey the Correios put in a delivery's detail is not tracking; a real detail stays
  const survey = eventsOf({eventos: [{codigo: 'BDE', tipo: '01', descricao: 'Objeto entregue ao destinatário', detalhe: 'Queremos te ouvir! Responda: https://survey3.medallia.com/?e=1', dtHrCriado: '2026-09-18T16:50:00'}]});
  assert.equal(survey[0].detail, null, 'the survey never shows as a detail');
  assert.equal(eventsOf({eventos: [{codigo: 'BDE', tipo: '20', descricao: 'Carteiro não atendido', detalhe: 'Destinatário ausente.', dtHrCriado: '2026-09-18T16:50:00'}]})[0].detail, 'Destinatário ausente.');

  // a code the Correios registered before the purchase (posted() pays on 03/10): another package's, pasted by mistake
  const w = world(), orders = createOrders({store: w.store, env: w.env, now: w.now}), tracking = createTracking({store: w.store, env: w.env, now: w.now, fetchImpl: w.fetchImpl, log: quiet});
  const at = (codigo, descricao, dtHrCriado, cidade) => ({codigo, tipo: '01', descricao, dtHrCriado, unidade: {endereco: {cidade, uf: 'MG'}}});
  w.fake.setTracking('AP503109323BR', [{...at('BDE', 'Objeto entregue ao destinatário', '2026-09-18T16:50:00', 'BELO HORIZONTE'), detalhe: 'Queremos te ouvir!… https://survey3.medallia.com/x'}, at('PO', 'Objeto postado', '2026-09-15T10:00:00', 'OURO PRETO')]);
  const id = await posted(w.store, 'AP503109323BR');
  await tracking.runOnce();
  const old = await w.store.orders.findById(id);
  assert.deepEqual([old.status, old.trackingState, old.deliveredAt ?? null, old.trackingNotices], ['enviado', 'entregue', null, 'antigo'], 'not concluded, marked as another package\'s');
  assert.equal(w.mails.length, 0, 'no "Pedido entregue", no notice at all');
  const panel = orders.adminView(old).tracking;
  assert.deepEqual([panel.oldCode, panel.state, panel.last.place.city, panel.last.detail], [true, 'entregue', 'BELO HORIZONTE', null], 'the panel sees the line, with the warning');
  assert.deepEqual([orders.customerView(old).tracking.state, orders.customerView(old).tracking.last], [null, null], 'the buyer sees nothing of it');
  assert.deepEqual(trackingView(old, {all: true, buyer: true}).events, [], 'nor in the timeline');
  w.advance(EVERY + 60000); await tracking.runOnce();
  assert.equal((await w.store.orders.findById(id)).status, 'enviado'); assert.equal(w.mails.length, 0, 'the next rounds keep it so');
  assert(read('dist/admin.js').includes('Código de outro pacote?') && read('dist/admin.js').includes("quiet: order.status === 'enviado' && !order.tracking?.oldCode"), 'the panel warns, and says when the right code was e-mailed');

  // posted after the purchase but entered days later: still this order's (the reference is the payment, not the code going in)
  const late = await posted(w.store, 'AA123456745BR', {shippedAt: new Date(Date.parse('2026-10-05T14:00:00Z'))});
  w.fake.setTracking('AA123456745BR', [at('BDE', 'Objeto entregue ao destinatário', '2026-10-04T15:00:00', 'BELO HORIZONTE'), at('PO', 'Objeto postado', '2026-10-03T18:00:00', 'OURO PRETO')]);
  await tracking.runOnce();
  assert.equal((await w.store.orders.findById(late)).status, 'concluido', 'delivered before the code went in, but after the purchase: concluded');
}

// ── "Meus pedidos": the timeline endpoint, only the buyer's own posted orders ──
{
  const w = world(), handler = require('../api/account/tracking').create({env: w.env, store: w.store, now: w.now, fetchImpl: w.fetchImpl});
  const sha = value => crypto.createHash('sha256').update(value).digest();
  const signIn = async email => {
    const customer = await w.store.customers.create({id: crypto.randomUUID(), email, emailVerifiedAt: new Date(w.now())});
    const token = crypto.randomBytes(32).toString('base64url');
    await w.store.sessions.create({tokenHash: sha(token), customerId: customer.id, expiresAt: new Date(w.now() + 86400000), ip: null, userAgent: null});
    return {customer, cookie: `__Host-ju_session=${token}`};
  };
  const ana = await signIn('ana@example.com'), bia = await signIn('bia@example.com');
  await posted(w.store, 'AA123456737BR', {customerId: ana.customer.id});
  await posted(w.store, 'AA123456723BR', {customerId: ana.customer.id, reference: 'JU-RCONFIRM1', status: 'confirmado', trackingCode: null, shippedAt: null});
  const ask = async (ref, cookie = '') => {
    const res = {statusCode: 200, headers: {}, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(d) { this.body = d || ''; }, json() { return JSON.parse(this.body); }};
    await handler({method: 'GET', headers: cookie ? {cookie} : {}, url: `/api/account/tracking?ref=${ref}`, socket: {}}, res);
    return res;
  };
  assert.equal((await ask('JU-R123456737')).statusCode, 401, 'signed out');
  assert.equal((await ask('JU-R123456737', bia.cookie)).statusCode, 404, 'another buyer\'s order');
  assert.equal((await ask('JU-RCONFIRM1', ana.cookie)).statusCode, 404, 'an order not posted yet');
  assert.equal((await ask('nada', ana.cookie)).statusCode, 400);
  const first = await ask('JU-R123456737', ana.cookie);
  assert.equal(first.statusCode, 200);
  const {tracking} = first.json();
  assert.deepEqual([tracking.code, tracking.state, tracking.events.length], ['AA123456737BR', 'saiu_para_entrega', 3], 'asked the Correios now (nothing saved yet)');
  assert.deepEqual(tracking.events.map(e => e.state), ['saiu_para_entrega', 'em_transito', 'postado'], 'the whole line, newest first');
  const calls = w.fake.calls.filter(c => c.path.startsWith('/srorastro')).length;
  await ask('JU-R123456737', ana.cookie);
  assert.equal(w.fake.calls.filter(c => c.path.startsWith('/srorastro')).length, calls, 'within half an hour: the saved line, no new call');
  assert(w.mails.some(m => m.subject.includes('saiu para entrega')), 'a look from "Meus pedidos" counts like the round (the notice goes once)');
}

// ── wiring ─────────────────────────────────────────────────────────────
{
  assert.match(read('db/migrations/012_rastreio.sql'), /ADD COLUMN tracking_state VARCHAR\(24\) NULL,[^;]*ADD COLUMN tracking_events MEDIUMTEXT NULL,[^;]*ADD COLUMN delivered_at DATETIME\(3\) NULL,[^;]*ADD INDEX orders_tracking \(status, tracking_checked_at\);/);
  assert.match(read('server/create-server.cjs'), /require\('\.\.\/api\/_lib\/tracking'\)\.startTrackingWorker\(\{env, log\}\)/, 'the Node server runs it');
  assert.match(read('api/fila/rodar.js'), /createTracking\(\{store: active, env, now, fetchImpl, outbox\}\)\.kick\(\)/, 'and the scheduled task that wakes the app');
  assert.match(read('api/admin/orders.js'), /list\.some\(o => o\.status === 'enviado'\)\) waitUntil\(createTracking\(/, 'and the panel, after its answer');
  assert.match(read('api/admin/order-status.js'), /posted = order\.status === 'enviado' && before === 'confirmado'/, 'the e-mail when the code goes in');
  const panel = read('dist/admin.js');
  assert.match(panel, /confirmado: 'Expedição'/);
  assert.doesNotMatch(panel, /requestSubmit\(\)/, 'a pasted or scanned code never ships by itself: only "Confirmar envio" does (Pedro, 06/10)');
  assert.match(panel, /scan\.form\.querySelector\('\.btn-ship'\)\?\.focus\(\)/, "the scanner's Enter goes to the button, not past it");
  assert.match(panel, /conferido\. Clique em Confirmar envio: o pedido vai para Enviados e o cliente recebe o e-mail com o código\./, 'a checked code says what the button will do');
  assert.match(panel, /<p class="admin-tracking-note" role="status"><\/p><\/form>/);
  assert.match(panel, /\.admin-order\.status-confirmado \.admin-tracking input'\)\.focus\(/, 'the field is ready for the next code');
  assert.match(panel, />Marcar como entregue<\/button>/);
  assert.match(panel, /t\?\.checkedAt \? `A consulta aos Correios de \$\{esc\(formatWhen\(t\.checkedAt\)\)\} não deu certo/, 'a refused query is not shown as "not asked yet"');
  assert.match(panel, /t\.state === 'nao_encontrado' \? `Consultado em \$\{formatWhen\(t\.checkedAt\)\}\. O código costuma aparecer/, 'a code the Correios do not know yet: what it means, not the badge twice');
  const account = read('dist/account.js');
  assert.match(account, /data-track="\$\{ref\}" aria-expanded="false"/); assert.match(account, /await loadTracking\(track\.dataset\.track\)/);
  const {translate} = await import(new URL('../dist/i18n-core.js', import.meta.url).href);
  for (const text of ['Acompanhar entrega', 'Ocultar entrega', 'Pedido entregue', 'Saiu para entrega', 'Entrega não realizada', 'Devolvido ao remetente']) for (const lang of ['en', 'es']) assert.notEqual(translate(text, lang), text, `${lang}: ${text}`);
}

console.log('PASS: rastreio — the Correios events (codes, words, Brasília time), one code or a batch, the round (Concluídos on delivery, one e-mail per notice, Ju warned once per problem, unknown codes, 60 days, down and refused), the e-mail when the code goes in, the code changing or coming off, the check digit (UPU S10, panel and server), a reopened delivery, the list in the panel with the last event only, a delivered order not asked again, the timeline endpoint and the wiring.');
