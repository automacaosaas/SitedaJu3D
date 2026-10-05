// Order helpers for the admin panel: grouping, sorting and totals over the list that comes from /api/admin/orders.
// Orders live in the database; nothing here is stored in the browser.
export const STATUSES = Object.freeze(['pendente', 'confirmado', 'enviado', 'concluido', 'recusado']);
// The steps still to work through, oldest first; Concluídos and Recusados are history, newest first.
const QUEUES = ['pendente', 'confirmado', 'enviado'];

// Local calendar day the order was paid on, e.g. "2026-09-22" — used to group orders for the chart and the calendar.
export const dayKey = value => { const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const paidTime = order => Date.parse(order.paidAt || order.createdAt) || 0;

// Pending is a queue to work through — oldest first. Completed/declined is history — most recent first.
export function listByStatus(list, status) {
  const filtered = list.filter(o => o.status === status);
  return QUEUES.includes(status) ? filtered.sort((a, b) => paidTime(a) - paidTime(b)) : filtered.sort((a, b) => paidTime(b) - paidTime(a));
}

// Replaces one order in the list (after a status change), keeping the others as they are.
export const replaceOrder = (list, order) => list.map(o => o.id === order.id ? order : o);

// Revenue counts paid orders that were not declined. One row per day with at least one, oldest first.
const counted = list => list.filter(o => o.status !== 'recusado');
export function dailyTotals(list) {
  const byDay = new Map();
  for (const order of counted(list)) { const key = dayKey(paidTime(order)); const entry = byDay.get(key) || {date: key, totalCents: 0, count: 0}; entry.totalCents += order.totalCents; entry.count += 1; byDay.set(key, entry); }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}
export const ordersForDay = (list, key) => list.filter(o => dayKey(paidTime(o)) === key).sort((a, b) => paidTime(b) - paidTime(a));

export function summary(list, now = new Date()) {
  const thisMonth = dayKey(now).slice(0, 7);
  const revenue = counted(list).reduce((sum, o) => sum + o.totalCents, 0);
  const monthRevenue = counted(list).filter(o => dayKey(paidTime(o)).startsWith(thisMonth)).reduce((sum, o) => sum + o.totalCents, 0);
  const count = status => list.filter(o => o.status === status).length;
  return {pendentes: count('pendente'), confirmados: count('confirmado'), enviados: count('enviado'), concluidos: count('concluido'), recusados: count('recusado'), revenue, monthRevenue};
}
