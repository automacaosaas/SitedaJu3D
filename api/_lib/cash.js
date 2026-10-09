'use strict';
// Fluxo de caixa of Ju's panel: the money that really came into and went out of the shop, on the day it happened (the
// cash view, not accounting). Three sources, put together on every request so they never drift apart:
//   · paid orders → "Entrada · Venda" on the day of the payment, for what the buyer paid (freight included); a declined
//     order whose money went back → "Saída · Estorno" on the day of the refund. Nothing to type, nothing to forget;
//   · entradas and despesas Ju adds by hand (store.cashEntries, db/migrations/009_caixa.sql);
//   · contas a pagar (store.bills): one she marks as paid becomes "Saída · Conta paga" on that day. A locked bill
//     (the padlock in the panel) keeps its status and cannot be removed until it is unlocked.
// "Ajuste de saldo" entries set the balance to what is really in the account; they are not money in or out of the month.
// Orders paid in Mercado Pago's TEST mode (source other than "live": the purchases tried before the launch) are no money: they
// stay in the list, marked `test` (the panel labels them), but count in no total and not in the balance.
// Days are calendar days in Brasília ("YYYY-MM-DD"). Nothing about the buyers goes out: the order reference and the pieces.
const crypto = require('node:crypto');
const {PAID} = require('./orders');

const CATEGORIES = Object.freeze({entrada: Object.freeze(['venda', 'outros']), saida: Object.freeze(['materiais', 'frete', 'equipamentos', 'marketing', 'outros'])});
const MONEY_BACK = ['refunded', 'requested'];
const MAX_CENTS = 1000000000;   // R$ 10 milhões: far above any real entry, so a typo with extra zeros is refused
const SP_DAY = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'});
const spDay = value => SP_DAY.format(new Date(value));
const SP_OFFSET = new Intl.DateTimeFormat('en-US', {timeZone: 'America/Sao_Paulo', timeZoneName: 'longOffset'});
// The instant a Brasília day ends (the next one starts): what was paid before it counts in the balance of that day.
function dayEnd(date) {
  const next = new Date(`${date}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  const offset = SP_OFFSET.formatToParts(next).find(p => p.type === 'timeZoneName').value;   // "GMT-03:00"
  const [, sign, hours, minutes] = /([+-])(\d{2}):(\d{2})/.exec(offset) || [null, '+', '00', '00'];
  return new Date(next.getTime() - (sign === '-' ? -1 : 1) * (hours * 3600000 + minutes * 60000));
}
const iso = value => value ? new Date(value).toISOString() : null;
const fail = (code, field) => Object.assign(new Error(code), {code, ...(field ? {field} : {})});
// The bill, unlocked; 404 when it does not exist, 409 locked while the padlock is closed.
async function openBill(store, id) {
  const bill = await store.bills.findById(uuid(id));
  if (!bill) throw fail('not_found');
  if (bill.lockedAt) throw fail('locked');
  return bill;
}

function text(value, field) {
  const clean = String(value ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean || clean.length > 120) throw fail('invalid_request', field);
  return clean;
}
function cents(value, field, {negative = false} = {}) {
  if (!Number.isInteger(value) || Math.abs(value) > MAX_CENTS || (!negative && value <= 0)) throw fail('invalid_request', field);
  return value;
}
// A day that exists on the calendar, from 2020 up to three years from today.
function day(value, field, today) {
  const raw = String(value ?? ''), match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const valid = match && new Date(Date.UTC(+match[1], +match[2] - 1, +match[3])).toISOString().slice(0, 10) === raw;
  if (!valid || raw < '2020-01-01' || raw > `${Number(today.slice(0, 4)) + 3}${today.slice(4)}`) throw fail('invalid_request', field);
  return raw;
}
const uuid = (value, field = 'id') => { const id = String(value || ''); if (!/^[0-9a-f-]{36}$/.test(id)) throw fail('invalid_request', field); return id; };
const reais = value => (value / 100).toFixed(2);

function orderMovements(order) {
  const pieces = (order.items || []).map(item => `${item.quantity}× ${item.title}`).join(', ');
  const base = {detail: pieces, amountCents: order.totalCents, source: 'pedido', test: order.source !== 'live'};
  const list = [];
  if (order.paidAt) list.push({...base, id: `pedido-${order.id}`, date: spDay(order.paidAt), at: iso(order.paidAt), type: 'entrada', category: 'venda', description: `Pedido ${order.reference}`});
  if (order.paidAt && MONEY_BACK.includes(order.refundState)) {
    const when = order.refundedAt || order.decidedAt || order.paidAt;
    list.push({...base, id: `estorno-${order.id}`, date: spDay(when), at: iso(when), type: 'saida', category: 'estorno', description: `Estorno do pedido ${order.reference}`});
  }
  return list;
}
const entryMovement = entry => ({id: entry.id, date: entry.occurredOn, at: iso(entry.createdAt), type: entry.kind, category: entry.category, description: entry.description, amountCents: entry.amountCents, source: entry.category === 'ajuste' ? 'ajuste' : 'manual', removable: true});
const billMovement = bill => ({id: `conta-${bill.id}`, date: bill.paidOn, at: iso(bill.createdAt), type: 'saida', category: 'conta', description: bill.description, amountCents: bill.amountCents, source: 'conta'});

// Every movement, newest first (same day: the latest recorded first).
function movements({orders = [], entries = [], bills = []}) {
  return [...orders.flatMap(orderMovements), ...entries.map(entryMovement), ...bills.filter(b => b.paidOn).map(billMovement)]
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.at).localeCompare(String(a.at)));
}
// What is in the account today: everything up to today (an entry dated in the future does not count yet), but the test orders.
const balance = (list, today) => list.filter(m => m.date <= today && !m.test).reduce((sum, m) => sum + (m.type === 'entrada' ? m.amountCents : -m.amountCents), 0);
const billView = bill => ({id: bill.id, description: bill.description, amountCents: bill.amountCents, dueDate: bill.dueOn, paidDate: bill.paidOn, locked: Boolean(bill.lockedAt)});

function createCash({store, now = () => Date.now()}) {
  const today = () => spDay(now());

  async function load() {
    const [orders, entries, bills] = await Promise.all([store.orders.listForCash({statuses: PAID}), store.cashEntries.list(), store.bills.list()]);
    return {list: movements({orders, entries, bills}), bills};
  }
  async function view() {
    const {list, bills} = await load(), date = today();
    return {today: date, balanceCents: balance(list, date), movements: list, bills: bills.map(billView)};
  }

  // One change from the panel. Answers what goes to the audit log (null when nothing changed).
  async function apply(body, {actor = null} = {}) {
    const on = today();
    switch (body?.action) {
      case 'add-entry': {
        const kind = ['entrada', 'saida'].includes(body.kind) ? body.kind : null;
        if (!kind) throw fail('invalid_request', 'kind');
        if (!CATEGORIES[kind].includes(body.category)) throw fail('invalid_request', 'category');
        const row = await store.cashEntries.create({id: crypto.randomUUID(), kind, category: body.category, description: text(body.description, 'description'), amountCents: cents(body.amountCents, 'amountCents'), occurredOn: day(body.date, 'date', on), createdBy: actor});
        return {action: 'cash_entry_add', detail: `${kind} R$ ${reais(row.amountCents)} em ${row.occurredOn} · ${row.description}`};
      }
      case 'remove-entry': {
        const row = await store.cashEntries.remove(uuid(body.id));
        if (!row) throw fail('not_found');
        return {action: 'cash_entry_remove', detail: `${row.kind} R$ ${reais(row.amountCents)} em ${row.occurredOn} · ${row.description}`};
      }
      case 'add-bill': {
        const row = await store.bills.create({id: crypto.randomUUID(), description: text(body.description, 'description'), amountCents: cents(body.amountCents, 'amountCents'), dueOn: day(body.dueDate, 'dueDate', on), createdBy: actor});
        return {action: 'bill_add', detail: `R$ ${reais(row.amountCents)} vence ${row.dueOn} · ${row.description}`};
      }
      case 'set-bill-paid': {
        const paid = body.paid === true, bill = await openBill(store, body.id);
        if (Boolean(bill.paidOn) === paid) return null;
        const row = await store.bills.setPaid(bill.id, paid ? on : null);
        return {action: paid ? 'bill_paid' : 'bill_unpaid', detail: `R$ ${reais(row.amountCents)} · ${row.description}`};
      }
      case 'lock-bill': {
        const locked = body.locked === true, row = await store.bills.setLocked(uuid(body.id), locked ? new Date(now()) : null);
        if (!row) throw fail('not_found');
        return {action: locked ? 'bill_lock' : 'bill_unlock', detail: `${row.paidOn ? 'paga' : 'pendente'} · R$ ${reais(row.amountCents)} · ${row.description}`};
      }
      case 'remove-bill': {
        const row = await store.bills.remove((await openBill(store, body.id)).id);
        if (!row) throw fail('not_found');
        return {action: 'bill_remove', detail: `R$ ${reais(row.amountCents)} vence ${row.dueOn} · ${row.description}`};
      }
      case 'adjust-balance': {
        // Ju says how much the shop has today; the difference becomes one "Ajuste de saldo" dated today.
        const target = cents(body.balanceCents, 'balanceCents', {negative: true});
        // Summed by the database: nothing is loaded here, the view that follows loads the movements once.
        const difference = target - await store.cashBalance({statuses: PAID, refundStates: MONEY_BACK, before: dayEnd(on), until: on});
        if (!difference) return null;
        await store.cashEntries.create({id: crypto.randomUUID(), kind: difference > 0 ? 'entrada' : 'saida', category: 'ajuste', description: 'Ajuste de saldo', amountCents: Math.abs(difference), occurredOn: on, createdBy: actor});
        return {action: 'cash_adjust', detail: `saldo informado R$ ${reais(target)} (diferença R$ ${reais(difference)})`};
      }
      default: throw fail('invalid_request', 'action');
    }
  }

  return {view, apply, today};
}

module.exports = {createCash, movements, balance, dayEnd, CATEGORIES, MONEY_BACK, spDay};
