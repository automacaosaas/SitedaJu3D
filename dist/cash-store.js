// Fluxo de caixa helpers for the admin panel: totals of the month, the chart series, the list filters and the bills, over
// what /api/admin/cash answers. Days are "YYYY-MM-DD" (Brasília). Pure functions, checked by tests/cash.mjs.
export const CATEGORY_LABEL = Object.freeze({venda: 'Venda', materiais: 'Materiais', frete: 'Frete', equipamentos: 'Equipamentos', marketing: 'Marketing', outros: 'Outros', estorno: 'Estorno', conta: 'Conta paga', ajuste: 'Ajuste de saldo'});
// The categories Ju picks from (same lists as api/_lib/cash.js).
export const ENTRY_CATEGORIES = Object.freeze({entrada: Object.freeze(['venda', 'outros']), saida: Object.freeze(['materiais', 'frete', 'equipamentos', 'marketing', 'outros'])});
export const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export const monthKey = (year, month) => `${year}-${String(month + 1).padStart(2, '0')}`;
export const shortDate = (date, withYear = false) => `${date.slice(8, 10)}/${date.slice(5, 7)}${withYear ? `/${date.slice(0, 4)}` : ''}`;
// An adjustment only sets the balance, and an order paid in Mercado Pago's test mode (`test`) is no money: neither is money in
// nor money out. The list still shows both.
const adjustment = m => m.category === 'ajuste';
const counts = m => !adjustment(m) && !m.test;
const total = (list, type) => list.reduce((sum, m) => sum + (m.type === type ? m.amountCents : 0), 0);

// "Entrou este mês", "Saiu este mês" and the result, up to today (a future entry is not money yet).
export function monthSummary(movements, month, today) {
  const done = movements.filter(m => counts(m) && m.date.startsWith(month) && m.date <= today);
  const inCents = total(done, 'entrada'), outCents = total(done, 'saida');
  return {inCents, outCents, resultCents: inCents - outCents};
}

// The chart: every day of a month, or every month of a year, with what came in and went out.
export function dailySeries(movements, year, month) {
  const prefix = monthKey(year, month), days = new Date(year, month + 1, 0).getDate();
  return Array.from({length: days}, (_, i) => {
    const key = `${prefix}-${String(i + 1).padStart(2, '0')}`, list = movements.filter(m => counts(m) && m.date === key);
    return {key, label: String(i + 1), title: shortDate(key), inCents: total(list, 'entrada'), outCents: total(list, 'saida')};
  });
}
export function monthlySeries(movements, year) {
  return MONTHS.map((name, i) => {
    const key = monthKey(year, i), list = movements.filter(m => counts(m) && m.date.startsWith(key));
    return {key, label: name.slice(0, 3), title: `${name} de ${year}`, inCents: total(list, 'entrada'), outCents: total(list, 'saida')};
  });
}

// The Movimentações list: one month, or every month while searching; "entrada" and "saida" leave the adjustments out (a test
// order stays, with its label; it is out of the totals only).
const plain = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function filterMovements(movements, {month, type = 'todas', query = ''}) {
  const q = plain(query).trim();
  return movements.filter(m => (q ? plain(`${m.description} ${m.detail || ''} ${CATEGORY_LABEL[m.category] || ''}`).includes(q) : m.date.startsWith(month))
    && (type === 'todas' || (m.type === type && !adjustment(m))));
}
export const listTotals = list => ({inCents: total(list.filter(counts), 'entrada'), outCents: total(list.filter(counts), 'saida')});

// Contas a pagar: pending first (the most urgent on top), then the paid ones (the latest first).
export function billsView(bills, today) {
  const status = b => b.paidDate ? 'pago' : b.dueDate < today ? 'atrasada' : b.dueDate === today ? 'hoje' : 'pendente';
  const list = bills.map(b => ({...b, status: status(b)}));
  const open = list.filter(b => !b.paidDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const paid = list.filter(b => b.paidDate).sort((a, b) => b.paidDate.localeCompare(a.paidDate));
  return [...open, ...paid];
}
// Bills still to pay that are late or due in the next `days` days.
export function upcomingBills(bills, today, days = 10) {
  const limit = new Date(`${today}T12:00:00Z`); limit.setUTCDate(limit.getUTCDate() + days);
  const until = limit.toISOString().slice(0, 10);
  return billsView(bills, today).filter(b => !b.paidDate && b.dueDate <= until);
}

// What Ju types in the value field, in cents: "129", "129,90", "1.290,50", "R$ 1.290,50" or "129.90". null when it is not a value.
export function parseMoney(input, {negative = false} = {}) {
  let s = String(input ?? '').replace(/R\$|\s/g, '');
  const minus = s.startsWith('-');
  if (minus) { if (!negative) return null; s = s.slice(1); }
  let whole, cents = '';
  if (s.includes(',')) { if (!/^(\d{1,3}(\.\d{3})+|\d+),\d{1,2}$/.test(s)) return null; [whole, cents] = s.split(','); whole = whole.replace(/\./g, ''); }
  else if (/^\d+\.\d{1,2}$/.test(s)) [whole, cents] = s.split('.');
  else if (/^(\d{1,3}(\.\d{3})+|\d+)$/.test(s)) whole = s.replace(/\./g, '');
  else return null;
  const value = Number(whole) * 100 + Number(cents.padEnd(2, '0'));
  return Number.isSafeInteger(value) ? (minus ? -value : value) : null;
}
// Cents back into the field ("1290,50"), for the balance adjustment.
export const centsToInput = value => `${value < 0 ? '-' : ''}${Math.floor(Math.abs(value) / 100)},${String(Math.abs(value) % 100).padStart(2, '0')}`;
