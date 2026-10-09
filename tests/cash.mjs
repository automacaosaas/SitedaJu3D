// Fluxo de caixa of Ju's panel: the movements built from paid orders, entries and bills (api/_lib/cash.js), the endpoint
// /api/admin/cash (only a signed-in admin, validation, audit) and the browser helpers (dist/cash-store.js).
// Run: node tests/cash.mjs — no network, in-memory store with a fixed clock.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const {movements, balance, dayEnd, CATEGORIES, MONEY_BACK, spDay} = require('../api/_lib/cash');
const {PAID} = require('../api/_lib/orders');
const {createMemoryStore} = require('../api/_lib/store-memory');
const totp = require('../api/_lib/totp');
const handlers = Object.fromEntries(['login', 'verify', 'cash'].map(name => [name, require(`../api/admin/${name}`)]));
const site = f => import(pathToFileURL(path.join(root, 'dist', f)).href);
const helpers = await site('cash-store.js');
const client = await site('admin-auth.js');

const SITE = 'https://site.test';
const ENV = {SITE_URL: SITE, APP_ENV: 'preview', ADMIN_EMAIL: 'ju@site.test', ADMIN_PASSWORD: 'senha-do-painel-2026'};
const clock = Date.parse('2026-10-04T15:00:00Z');   // meio-dia em Brasília
const now = () => clock;

// ── Brasília days ─────────────────────────────────────────────────────
assert.equal(spDay('2026-10-05T02:30:00Z'), '2026-10-04', '23:30 in Brasília is still the 4th');
assert.equal(spDay('2026-10-05T03:00:00Z'), '2026-10-05');
assert.equal(dayEnd('2026-10-04').toISOString(), '2026-10-05T03:00:00.000Z', 'the 4th ends at midnight in Brasília');
assert.equal(dayEnd('2026-12-31').toISOString(), '2027-01-01T03:00:00.000Z', 'across the year');
for (const date of ['2026-02-28', '2026-10-04', '2028-02-29']) {
  const end = dayEnd(date).getTime();
  assert.equal(spDay(end - 1), date, `${date}: the last millisecond is still that day`); assert.notEqual(spDay(end), date);
}

// ── the balance summed by the store is the same as the one of the movements ──
{
  const store = createMemoryStore(), at = iso => new Date(iso);
  const order = async (reference, status, paidAt, extra = {}) => store.orders.create({id: crypto.randomUUID(), reference, source: 'live', status, totalCents: 10000 + reference.length, paidAt, refundState: null, items: [{productId: 'p', title: 'Peça', quantity: 2, unitCents: 5000, selection: {}}], buyer: {name: 'Maria Cliente', email: 'maria@x.com'}, ...extra});
  await order('JU-1', 'pendente', at('2026-10-04T13:00:00Z'));
  await order('JU-22', 'concluido', at('2026-10-05T02:59:59Z'));                                         // 23:59 in Brasília: still the 4th
  await order('JU-333', 'pendente', at('2026-10-05T03:00:00Z'));                                         // already the 5th
  await order('JU-4444', 'recusado', at('2026-10-01T12:00:00Z'), {refundState: 'refunded', refundedAt: at('2026-10-05T12:00:00Z')});
  await order('JU-55555', 'recusado', at('2026-10-01T12:00:00Z'), {refundState: 'requested', decidedAt: at('2026-10-03T12:00:00Z')});
  await order('JU-666666', 'recusado', at('2026-10-01T12:00:00Z'), {refundState: 'failed'});
  await order('JU-7', 'aguardando_pagamento', null);
  await order('JU-88', 'cancelado', at('2026-10-01T12:00:00Z'));
  await order('JU-T9', 'pendente', at('2026-10-04T14:00:00Z'), {source: 'test'});                             // Mercado Pago's test mode
  await order('JU-T99', 'recusado', at('2026-10-01T12:00:00Z'), {source: 'test', refundState: 'refunded', refundedAt: at('2026-10-03T12:00:00Z')});
  await store.cashEntries.create({id: crypto.randomUUID(), kind: 'saida', category: 'frete', description: 'Correios', amountCents: 2800, occurredOn: '2026-10-04'});
  await store.cashEntries.create({id: crypto.randomUUID(), kind: 'entrada', category: 'outros', description: 'Futuro', amountCents: 999, occurredOn: '2026-10-06'});
  await store.cashEntries.create({id: crypto.randomUUID(), kind: 'entrada', category: 'ajuste', description: 'Ajuste de saldo', amountCents: 50000, occurredOn: '2026-09-30'});
  await store.bills.create({id: 'b1', description: 'Fornecedor', amountCents: 31000, dueOn: '2026-10-15'});
  await store.bills.setPaid('b1', '2026-10-05');
  await store.bills.create({id: 'b2', description: 'Aluguel', amountCents: 80000, dueOn: '2026-10-06'});

  const cashOrders = await store.orders.listForCash({statuses: PAID});
  assert.deepEqual(cashOrders.map(o => o.reference).sort(), ['JU-1', 'JU-22', 'JU-333', 'JU-4444', 'JU-55555', 'JU-666666', 'JU-T9', 'JU-T99'], 'only paid orders');
  assert.deepEqual(cashOrders[0].items, [{title: 'Peça', quantity: 2}], 'only the pieces it shows');
  assert(!/maria/i.test(JSON.stringify(cashOrders)), 'nothing about the buyer is loaded');
  const list = movements({orders: cashOrders, entries: await store.cashEntries.list(), bills: await store.bills.list()});
  assert.deepEqual(list.filter(m => m.test).map(m => m.description).sort(), ['Estorno do pedido JU-T99', 'Pedido JU-T9', 'Pedido JU-T99'], 'the test orders are listed, marked');
  for (const date of ['2026-09-30', '2026-10-01', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06']) {
    assert.equal(await store.cashBalance({statuses: PAID, refundStates: MONEY_BACK, before: dayEnd(date), until: date}), balance(list, date), `balance of ${date}`);
    assert.equal(balance(list, date), balance(list.filter(m => !m.test), date), `${date}: the test orders are no money`);
  }
  assert.equal(balance(list, '2026-10-04') - balance(list, '2026-10-03'), 10000 + 'JU-1'.length + 10000 + 'JU-22'.length - 2800, 'the 4th: two real sales and the Correios, not the test sale');
}

// ── movements: paid orders, refunds, entries and paid bills ───────────
{
  const order = (reference, extra = {}) => ({id: crypto.randomUUID(), reference, source: 'live', status: 'pendente', totalCents: 14445, paidAt: new Date('2026-10-04T13:00:00Z'), refundState: null, items: [{title: 'Borboletoscópio', quantity: 1}], buyer: {name: 'Maria Cliente', email: 'maria@x.com'}, ...extra});
  const list = movements({
    orders: [
      order('JU-A', {source: 'test'}),
      order('JU-B', {status: 'recusado', refundState: 'refunded', refundedAt: new Date('2026-10-05T12:00:00Z')}),
      order('JU-C', {status: 'recusado', refundState: 'failed'}),
      order('JU-D', {source: 'live', paidAt: new Date('2026-10-02T02:30:00Z')}),
      order('JU-E', {status: 'recusado', refundState: 'requested', decidedAt: new Date('2026-10-04T20:00:00Z')})
    ],
    entries: [
      {id: 'e1', kind: 'saida', category: 'frete', description: 'Correios', amountCents: 2800, occurredOn: '2026-10-04', createdAt: new Date(clock)},
      {id: 'e2', kind: 'entrada', category: 'ajuste', description: 'Ajuste de saldo', amountCents: 100000, occurredOn: '2026-10-01', createdAt: new Date(clock)}
    ],
    bills: [
      {id: 'b1', description: 'Fornecedor PLA', amountCents: 31000, dueOn: '2026-10-15', paidOn: '2026-10-03', createdAt: new Date(clock)},
      {id: 'b2', description: 'Aluguel', amountCents: 80000, dueOn: '2026-10-06', paidOn: null, createdAt: new Date(clock)}
    ]
  });
  const brief = list.map(m => `${m.date} ${m.type} ${m.category} ${m.amountCents} ${m.description}`);
  assert(brief.includes('2026-10-04 entrada venda 14445 Pedido JU-A'), 'a paid order is money in on the day it was paid');
  assert(brief.includes('2026-10-05 saida estorno 14445 Estorno do pedido JU-B'), 'refunded: money out on the day of the refund');
  assert(brief.includes('2026-10-04 saida estorno 14445 Estorno do pedido JU-E'), 'refund on its way: out on the day of the decline');
  assert(!brief.some(b => b.includes('Estorno do pedido JU-C')), 'a refund that failed took nothing back');
  assert(brief.includes('2026-10-01 entrada venda 14445 Pedido JU-D'), 'paid at 23:30 in Brasília counts on that day, not on the next (UTC) one');
  assert(brief.includes('2026-10-03 saida conta 31000 Fornecedor PLA'), 'a paid bill is money out on the day it was paid');
  assert(!brief.some(b => b.includes('Aluguel')), 'a pending bill is not money yet');
  assert.deepEqual(list.map(m => m.date), list.map(m => m.date).sort().reverse(), 'newest first');
  assert.equal(list.find(m => m.description === 'Pedido JU-A').test, true, 'test orders are marked');
  assert.equal(list.find(m => m.description === 'Pedido JU-D').test, false);
  assert.equal(list.find(m => m.description === 'Pedido JU-A').detail, '1× Borboletoscópio');
  assert(!/maria/i.test(JSON.stringify(list)), 'nothing about the buyer leaves the server');
  assert.deepEqual(list.filter(m => m.removable).map(m => m.id).sort(), ['e1', 'e2'], 'only entries typed by hand can be removed');
  // Everything up to today; the refund dated tomorrow does not count yet. JU-A, paid in Mercado Pago's test mode, is in the
  // list (above) but no money: 4 real sales.
  const money = 4 * 14445 + 100000, out = 14445 + 2800 + 31000;
  assert.equal(balance(list, '2026-10-04'), money - out);
  assert.equal(balance(list, '2026-10-05'), money - out - 14445);
}

// ── the endpoint ──────────────────────────────────────────────────────
function makeRes() { return {statusCode: 200, headers: {}, body: '', setHeader(key, value) { this.headers[key.toLowerCase()] = value; }, end(data) { this.body = data || ''; }, json() { return JSON.parse(this.body); }}; }
async function call(handler, {method = 'POST', origin = SITE, body = {}, cookie = ''} = {}) {
  const res = makeRes();
  await handler({method, headers: {...(origin ? {origin} : {}), 'x-forwarded-for': '203.0.113.7', ...(cookie ? {cookie} : {})}, body, socket: {}, url: '/'}, res);
  return res;
}
const jar = res => String(res.headers['set-cookie'] || '').split(';')[0];
{
  const store = createMemoryStore(), h = Object.fromEntries(Object.entries(handlers).map(([name, handler]) => [name, handler.create({env: ENV, store, now})]));
  assert.equal((await call(h.cash, {method: 'GET', origin: ''})).statusCode, 401, 'signed out: nothing');
  const login = await call(h.login, {body: {email: 'ju@site.test', password: 'senha-do-painel-2026'}});
  assert.equal((await call(h.cash, {method: 'GET', origin: '', cookie: jar(login)})).statusCode, 401, 'the password alone does not open the cash flow');
  const secret = totp.fromBase32(login.json().setup.secret);
  const cookie = jar(await call(h.verify, {body: {code: totp.codeAt(secret, totp.stepAt(clock))}, cookie: jar(login)}));
  const get = () => call(h.cash, {method: 'GET', origin: '', cookie}), post = body => call(h.cash, {cookie, body});

  const empty = await get();
  assert.equal(empty.statusCode, 200); assert.equal(empty.headers['cache-control'], 'no-store');
  assert.deepEqual(empty.json().cash, {today: '2026-10-04', balanceCents: 0, movements: [], bills: []});
  assert.equal((await call(h.cash, {origin: 'https://evil.example', cookie, body: {action: 'add-bill'}})).statusCode, 403, 'changes only from the site itself');

  const shipTo = {recipient: 'Ana', cep: '30140071', street: 'Rua da Bahia', number: '1', district: 'Centro', city: 'Belo Horizonte', state: 'MG', complement: ''};
  const base = {customerId: null, source: 'live', method: 'pix', subtotalCents: 12900, shippingCents: 1800, totalCents: 14700, buyer: {name: 'Ana', email: 'ana@example.com', company: null}, shipTo, notes: '', lang: 'pt-BR', items: [{productId: 'borboletoscopio', title: 'Borboletoscópio', quantity: 1, unitCents: 12900, selection: {}}]};
  await store.orders.create({...base, id: crypto.randomUUID(), reference: 'JU-CAIXA00001', status: 'pendente', paidAt: new Date(clock)});
  await store.orders.create({...base, id: crypto.randomUUID(), reference: 'JU-CAIXA00002', status: 'aguardando_pagamento', paidAt: null});
  assert.deepEqual((await get()).json().cash.movements.map(m => m.description), ['Pedido JU-CAIXA00001'], 'a paid order arrives by itself; an unpaid one does not');

  const added = await post({action: 'add-entry', kind: 'saida', description: '  Compra   de <b>filamento</b> ', amountCents: 31000, category: 'materiais', date: '2026-10-03'});
  assert.equal(added.statusCode, 200);
  assert.deepEqual(added.json().cash.movements.map(m => m.description), ['Pedido JU-CAIXA00001', 'Compra de b filamento /b'], 'text cleaned, no markup');
  assert.equal(added.json().cash.balanceCents, 14700 - 31000);

  const entry = {action: 'add-entry', kind: 'saida', description: 'x', amountCents: 100, category: 'materiais', date: '2026-10-03'};
  for (const [body, field] of [
    [{...entry, amountCents: 0}, 'amountCents'], [{...entry, amountCents: 12.5}, 'amountCents'], [{...entry, amountCents: '100'}, 'amountCents'], [{...entry, amountCents: 1000000001}, 'amountCents'],
    [{...entry, category: 'venda'}, 'category'], [{...entry, kind: 'ajuste', category: 'ajuste'}, 'kind'], [{...entry, kind: 'entrada', category: 'ajuste'}, 'category'],
    [{...entry, description: '   '}, 'description'], [{...entry, description: 'x'.repeat(121)}, 'description'],
    [{...entry, date: '2026-02-30'}, 'date'], [{...entry, date: '2019-12-31'}, 'date'], [{...entry, date: '2029-10-05'}, 'date'], [{...entry, date: '03/10/2026'}, 'date'],
    [{action: 'add-bill', description: 'PLA', amountCents: 100, dueDate: '15/10/2026'}, 'dueDate'],
    [{action: 'adjust-balance', balanceCents: 1.5}, 'balanceCents'],
    [{action: 'remove-entry', id: 'x'}, 'id'], [{action: 'apagar-tudo'}, 'action']
  ]) { const res = await post(body); assert.equal(res.statusCode, 400, field); assert.equal(res.json().field, field, field); }
  assert.equal((await post({...entry, date: '2029-10-04'})).statusCode, 200, 'up to three years ahead');
  assert.equal((await post({action: 'remove-entry', id: crypto.randomUUID()})).statusCode, 404);

  // Bills: added, paid (money out today), back to pending.
  const bill = (await post({action: 'add-bill', description: 'Fornecedor PLA', amountCents: 31000, dueDate: '2026-10-15'})).json().cash.bills[0];
  assert.deepEqual(bill, {id: bill.id, description: 'Fornecedor PLA', amountCents: 31000, dueDate: '2026-10-15', paidDate: null, locked: false});
  const paid = (await post({action: 'set-bill-paid', id: bill.id, paid: true})).json().cash;
  assert.equal(paid.bills[0].paidDate, '2026-10-04');
  assert(paid.movements.some(m => m.id === `conta-${bill.id}` && m.type === 'saida' && m.date === '2026-10-04' && m.category === 'conta' && !m.removable), 'a paid bill becomes money out of the day');
  assert.equal(paid.balanceCents, 14700 - 31000 - 31000);
  assert(!(await post({action: 'set-bill-paid', id: bill.id, paid: false})).json().cash.movements.some(m => m.id === `conta-${bill.id}`), 'back to pending, out of the cash');
  assert.equal((await post({action: 'set-bill-paid', id: crypto.randomUUID(), paid: true})).statusCode, 404);

  // The padlock: a locked bill keeps its status and cannot be removed, until it is unlocked.
  const locked = (await post({action: 'lock-bill', id: bill.id, locked: true})).json().cash.bills[0];
  assert.deepEqual([locked.locked, locked.paidDate], [true, null]);
  const refused = await post({action: 'set-bill-paid', id: bill.id, paid: true});
  assert.deepEqual([refused.statusCode, refused.json().error], [409, 'locked'], 'a locked status does not change');
  assert.equal((await post({action: 'remove-bill', id: bill.id})).statusCode, 409, 'nor is the bill removed');
  assert.equal((await get()).json().cash.bills[0].paidDate, null);
  assert.equal((await post({action: 'lock-bill', id: crypto.randomUUID(), locked: true})).statusCode, 404);
  assert.equal((await post({action: 'lock-bill', id: bill.id, locked: false})).json().cash.bills[0].locked, false, 'unlocked');
  const auditBefore = (await store.adminAudit.list(1000)).length;
  assert.equal((await post({action: 'set-bill-paid', id: bill.id, paid: false})).statusCode, 200);
  assert.equal((await store.adminAudit.list(1000)).length, auditBefore, 'choosing the status it already has changes nothing');

  // The balance Ju types: the difference is one adjustment of today, never money in or out of the month.
  await post({action: 'remove-entry', id: (await get()).json().cash.movements.find(m => m.date === '2029-10-04').id});
  const listForCash = store.orders.listForCash;
  let loads = 0;
  store.orders.listForCash = (...args) => { loads++; return listForCash(...args); };
  const adjusted = (await post({action: 'adjust-balance', balanceCents: 250000})).json().cash;
  store.orders.listForCash = listForCash;
  assert.equal(loads, 1, 'adjusting the balance loads the orders once (the view), the difference is summed by the store');
  assert.equal(adjusted.balanceCents, 250000);
  const adjustment = adjusted.movements.find(m => m.category === 'ajuste');
  assert.deepEqual([adjustment.type, adjustment.amountCents, adjustment.date, adjustment.removable], ['entrada', 250000 - (14700 - 31000), '2026-10-04', true]);
  assert.equal((await post({action: 'adjust-balance', balanceCents: 250000})).json().cash.movements.filter(m => m.category === 'ajuste').length, 1, 'the same balance again adds nothing');
  assert.equal((await post({action: 'adjust-balance', balanceCents: -5000})).json().cash.balanceCents, -5000, 'an overdrawn account can be typed');
  assert.deepEqual(helpers.monthSummary(adjusted.movements, '2026-10', '2026-10-04'), {inCents: 14700, outCents: 31000, resultCents: -16300}, 'adjustments are not money in or out');

  const typed = adjusted.movements.find(m => m.description.startsWith('Compra'));
  assert.equal((await post({action: 'remove-entry', id: typed.id})).statusCode, 200);
  assert.equal((await post({action: 'remove-entry', id: typed.id})).statusCode, 404, 'removed once');
  assert.equal((await post({action: 'remove-bill', id: bill.id})).json().cash.bills.length, 0);
  assert.equal((await post({action: 'remove-bill', id: bill.id})).statusCode, 404);

  // A purchase paid in Mercado Pago's test mode (the tests before the launch): listed as a sale with its label, but no money —
  // not in the balance, not in the month, and not in what the balance Ju types is compared with.
  const real = (await get()).json().cash;
  await store.orders.create({...base, source: 'test', id: crypto.randomUUID(), reference: 'JU-CAIXA00003', status: 'pendente', paidAt: new Date(clock)});
  const withTest = (await get()).json().cash;
  assert(withTest.movements.some(m => m.description === 'Pedido JU-CAIXA00003' && m.test === true && m.type === 'entrada' && m.category === 'venda'), 'the test order is listed, marked');
  assert.equal(withTest.balanceCents, real.balanceCents, 'not in the balance');
  assert.deepEqual(helpers.monthSummary(withTest.movements, '2026-10', '2026-10-04'), helpers.monthSummary(real.movements, '2026-10', '2026-10-04'), 'not in the month');
  const sameBalance = (await post({action: 'adjust-balance', balanceCents: withTest.balanceCents})).json().cash;
  assert.equal(sameBalance.movements.filter(m => m.category === 'ajuste').length, real.movements.filter(m => m.category === 'ajuste').length, 'typing the balance shown adds no adjustment: the store leaves the test order out too');

  const audit = await store.adminAudit.list(100), actions = audit.map(a => a.action);
  for (const action of ['cash_entry_add', 'cash_entry_remove', 'bill_add', 'bill_paid', 'bill_unpaid', 'bill_lock', 'bill_unlock', 'bill_remove', 'cash_adjust']) assert(actions.includes(action), `audit: ${action}`);
  assert(audit.find(a => a.action === 'bill_add').detail.includes('Fornecedor PLA'), 'the audit says what changed');

  // Browser client: the action always wins over the payload; a lapsed session is "unauthorized".
  const fake = answers => { const calls = []; return {calls, fetchImpl: async (url, init) => { calls.push({url, init}); const [status, body] = answers.shift(); return {status, json: async () => body}; }}; };
  const sent = fake([[200, {ok: true, cash: {today: '2026-10-04'}}]]);
  assert.deepEqual(await client.cashAction('add-bill', {description: 'PLA', action: 'remove-bill'}, {fetchImpl: sent.fetchImpl}), {today: '2026-10-04'});
  assert.equal(sent.calls[0].url, '/api/admin/cash'); assert.equal(sent.calls[0].init.method, 'POST'); assert.equal(sent.calls[0].init.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(sent.calls[0].init.body), {description: 'PLA', action: 'add-bill'});
  await assert.rejects(client.loadCash({fetchImpl: fake([[401, {error: 'unauthorized'}]]).fetchImpl}), error => error.code === 'unauthorized');
  await assert.rejects(client.cashAction('add-bill', {}, {fetchImpl: fake([[400, {error: 'invalid_request', field: 'dueDate'}]]).fetchImpl}), error => error.code === 'invalid_request' && error.field === 'dueDate');
}

// ── browser helpers ───────────────────────────────────────────────────
{
  const m = (date, type, amountCents, category, description) => ({id: crypto.randomUUID(), date, type, amountCents, category, description});
  const list = [m('2026-10-04', 'entrada', 14700, 'venda', 'Pedido JU-1'), m('2026-10-04', 'saida', 2800, 'frete', 'Correios'), m('2026-10-03', 'saida', 31000, 'materiais', 'Compra de filamento'),
    m('2026-10-10', 'entrada', 5000, 'outros', 'Futuro'), m('2026-10-01', 'entrada', 99999, 'ajuste', 'Ajuste de saldo'), m('2026-09-20', 'saida', 18900, 'materiais', 'Filamento PETG')];
  assert.deepEqual(helpers.monthSummary(list, '2026-10', '2026-10-04'), {inCents: 14700, outCents: 33800, resultCents: -19100}, 'the month up to today, without adjustments');
  const days = helpers.dailySeries(list, 2026, 9);
  assert.equal(days.length, 31);
  assert.deepEqual(days[3], {key: '2026-10-04', label: '4', title: '04/10', inCents: 14700, outCents: 2800});
  assert.equal(days[0].inCents, 0, 'adjustments stay out of the chart');
  assert.equal(helpers.dailySeries(list, 2026, 1).length, 28, 'February');
  const months = helpers.monthlySeries(list, 2026);
  assert.equal(months.length, 12);
  assert.deepEqual([months[8].outCents, months[9].inCents, months[9].label, months[9].title], [18900, 19700, 'out', 'outubro de 2026']);

  assert.deepEqual(helpers.filterMovements(list, {month: '2026-10'}).map(x => x.description), ['Pedido JU-1', 'Correios', 'Compra de filamento', 'Futuro', 'Ajuste de saldo']);
  assert.deepEqual(helpers.filterMovements(list, {month: '2026-10', type: 'entrada'}).map(x => x.description), ['Pedido JU-1', 'Futuro'], 'adjustments only under "Todas"');
  assert.deepEqual(helpers.filterMovements(list, {month: '2026-10', query: 'FILAMENTO'}).map(x => x.description), ['Compra de filamento', 'Filamento PETG'], 'search: every month, any case');
  assert.equal(helpers.filterMovements(list, {month: '2026-10', query: 'materiais'}).length, 2, 'search by category');
  assert.equal(helpers.filterMovements([m('2026-10-01', 'saida', 1, 'outros', 'Manutenção')], {month: '2026-10', query: 'manutencao'}).length, 1, 'accents do not matter');
  assert.deepEqual(helpers.listTotals(list), {inCents: 19700, outCents: 52700});
  // An order paid in Mercado Pago's test mode, and its refund: in the list (under Entradas and Saídas too), out of every total.
  const withTest = [...list, {...m('2026-10-04', 'entrada', 14700, 'venda', 'Pedido JU-TESTE'), test: true}, {...m('2026-10-04', 'saida', 14700, 'estorno', 'Estorno do pedido JU-TESTE'), test: true}];
  assert.deepEqual(helpers.monthSummary(withTest, '2026-10', '2026-10-04'), helpers.monthSummary(list, '2026-10', '2026-10-04'), 'a test order is out of the month');
  assert.deepEqual(helpers.dailySeries(withTest, 2026, 9), days, 'out of the chart by day');
  assert.deepEqual(helpers.monthlySeries(withTest, 2026), months, 'and by month');
  assert.deepEqual(helpers.filterMovements(withTest, {month: '2026-10', type: 'entrada'}).map(x => x.description), ['Pedido JU-1', 'Futuro', 'Pedido JU-TESTE'], 'but listed, under Entradas too');
  assert.deepEqual(helpers.filterMovements(withTest, {month: '2026-10', type: 'saida'}).map(x => x.description).at(-1), 'Estorno do pedido JU-TESTE');
  assert.deepEqual(helpers.listTotals(helpers.filterMovements(withTest, {month: '2026-10'})), helpers.listTotals(helpers.filterMovements(list, {month: '2026-10'})), 'and out of the list totals');

  const bills = [{id: '1', description: 'A', amountCents: 1, dueDate: '2026-10-06', paidDate: null}, {id: '2', description: 'B', amountCents: 1, dueDate: '2026-10-01', paidDate: null},
    {id: '3', description: 'C', amountCents: 1, dueDate: '2026-10-02', paidDate: '2026-10-03'}, {id: '4', description: 'D', amountCents: 1, dueDate: '2026-10-04', paidDate: null}, {id: '5', description: 'E', amountCents: 1, dueDate: '2026-10-30', paidDate: null}];
  assert.deepEqual(helpers.billsView(bills, '2026-10-04').map(b => `${b.description}:${b.status}`), ['B:atrasada', 'D:hoje', 'A:pendente', 'E:pendente', 'C:pago'], 'most urgent first, paid at the end');
  assert.deepEqual(helpers.upcomingBills(bills, '2026-10-04').map(b => b.description), ['B', 'D', 'A'], 'late ones and the next 10 days');

  for (const [typed, cents] of [['129', 12900], ['129,9', 12990], ['129,90', 12990], ['1.290,50', 129050], ['R$ 1.290,50', 129050], ['129.90', 12990], ['1.290', 129000], ['12.345.678,00', 1234567800], [' 45 ', 4500]]) assert.equal(helpers.parseMoney(typed), cents, typed);
  for (const typed of ['', 'abc', '12,345', '1,2,3', '12.34.5', '-10', '1.29,00', '0,001', '1e3']) assert.equal(helpers.parseMoney(typed), null, `refused: "${typed}"`);
  assert.equal(helpers.parseMoney('-1.000,50', {negative: true}), -100050, 'the balance may be negative');
  assert.equal(helpers.centsToInput(-100050), '-1000,50'); assert.equal(helpers.centsToInput(5), '0,05');
  assert.equal(helpers.shortDate('2026-10-04'), '04/10'); assert.equal(helpers.shortDate('2026-10-04', true), '04/10/2026');

  assert.deepEqual(JSON.parse(JSON.stringify(helpers.ENTRY_CATEGORIES)), JSON.parse(JSON.stringify(CATEGORIES)), 'the same categories in the panel and on the server');
  for (const category of [...Object.values(CATEGORIES).flat(), 'estorno', 'conta', 'ajuste']) assert(helpers.CATEGORY_LABEL[category], `label: ${category}`);
}

// ── wiring: the tables, the local server and the switch in the panel ──
{
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const sql = read('db/migrations/009_caixa.sql');
  assert.match(sql, /CREATE TABLE cash_entries \(/); assert.match(sql, /CREATE TABLE bills \(/); assert.match(sql, /occurred_on DATE NOT NULL/);
  assert.match(read('tools/dev-server.cjs'), /'bling', 'cash'(, '[a-z-]+')*\]\) routes\[/, 'the local server answers /api/admin/cash');
  const panel = read('dist/admin.js');
  assert.match(panel, /\[\['pedidos', 'Pedidos'\], \['caixa', 'Fluxo de caixa'\](, \[[^\]]+\])*\]/, 'parts: Pedidos and Fluxo de caixa (and Envio internacional, since 05/10/2026)');
  assert.match(panel, /let section = location\.hash === '#caixa' \? 'caixa' : /, '#caixa keeps the part on reload');
  const cash = read('dist/admin-cash.js');
  assert.match(cash, /\[\['geral', 'Visão geral'\], \['movimentacoes', 'Movimentações'\], \['contas', 'Contas a pagar'\]\]/, 'three tabs');
  // Movimentações: 10 lines, then "Ver mais" adds 10; the totals are of the whole month.
  assert.match(cash, /const PAGE = 10;/);
  assert.match(cash, /m\.test \? ' · pedido de teste, fora do saldo e dos totais' : ''/, 'a test order says it is out of the balance');
  assert.match(cash, /<tr class="is-\$\{kind\}\$\{m\.test \? ' is-test' : ''\}">/);
  assert.match(read('dist/admin.css'), /\.cash-table tr\.is-test \.num\{color:var\(--muted\);text-decoration:line-through\}/, 'and its value is struck through');
  assert.match(cash, /shown = rows\.slice\(0, list\.limit\), rest = rows\.length - shown\.length;/);
  assert.match(cash, /case 'more': list\.limit \+= PAGE;/);
  assert.match(cash, /data-cash="more">Ver mais/);
  // Contas a pagar: the status only through the dropdown, a padlock beside it, and no click-to-change anywhere.
  assert.doesNotMatch(cash, /bill-toggle/, 'no click on a status changes it');
  assert.match(cash, /<select data-cash-bill-status data-id="\$\{id\}" aria-label="Status da conta \$\{name\}"\$\{b\.locked \? ' disabled' : ''\}>/, 'the dropdown, disabled while locked');
  assert.match(cash, /data-cash="bill-lock"[^>]*aria-pressed="\$\{b\.locked\}"/, 'the padlock says whether it is locked');
  assert.match(cash, /title="\$\{b\.locked \? 'Destranque o status para excluir' : 'Excluir'\}"\$\{b\.locked \? ' disabled' : ''\}/, 'no removing a locked bill');
  assert.match(read('dist/icons.js'), /unlock: '/);
}

console.log('PASS: cash — orders become money in on the day they were paid (Brasília) and refunds money out (test-mode orders listed, out of the balance and totals); entries, paid bills and balance adjustments; the endpoint only for a signed-in admin, validated and audited; month totals, chart series, search, bills and the value field.');
