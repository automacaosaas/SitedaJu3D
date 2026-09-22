// Orders visible to the admin panel. Prototype storage: everything lives in this browser's localStorage, exactly
// like the rest of the site's demo data. It is a stand-in for a real orders database — every order made here only
// shows up in the browser that made the purchase. When a database exists, this module is the one to replace; nothing
// else needs to change (checkout.js and admin.js both go through the functions below, never the storage key itself).
export const ORDERS_KEY = 'ju.admin.orders.v1';
export const STATUSES = Object.freeze(['pendente', 'concluido', 'recusado']);
const MAX_ORDERS = 500;

const uid = () => globalThis.crypto?.randomUUID?.() || `order-${Date.now()}-${Math.random().toString(36).slice(2)}`;
// Local calendar day the order was paid on, e.g. "2026-09-22" — used to group orders for the chart and the calendar.
export const dayKey = value => { const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function normalize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || typeof raw.reference !== 'string' || !Array.isArray(raw.items) || !raw.items.length) return null;
  if (!Number.isFinite(raw.totalCents) || raw.totalCents < 0) return null;
  return {
    id: raw.id, reference: raw.reference.slice(0, 80), source: ['demo', 'test', 'live'].includes(raw.source) ? raw.source : 'demo',
    method: raw.method === 'card' || raw.method === 'pix' ? raw.method : 'pix',
    items: raw.items.slice(0, 60).map(i => ({productId: String(i.productId || ''), title: String(i.title || '').slice(0, 150), quantity: Math.max(1, Math.min(99, Math.floor(Number(i.quantity) || 1))), unitCents: Math.max(0, Math.floor(Number(i.unitCents) || 0)), selection: i.selection && typeof i.selection === 'object' ? i.selection : {}})),
    totalCents: Math.floor(raw.totalCents),
    customer: {name: String(raw.customer?.name || '').slice(0, 120), email: String(raw.customer?.email || '').slice(0, 180), phone: String(raw.customer?.phone || '').slice(0, 20)},
    address: {cep: String(raw.address?.cep || '').slice(0, 9), street: String(raw.address?.street || '').slice(0, 120), number: String(raw.address?.number || '').slice(0, 12), district: String(raw.address?.district || '').slice(0, 80), city: String(raw.address?.city || '').slice(0, 80), state: String(raw.address?.state || '').slice(0, 2), complement: String(raw.address?.complement || '').slice(0, 60)},
    notes: String(raw.notes || '').slice(0, 500),
    status: STATUSES.includes(raw.status) ? raw.status : 'pendente',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    paidAt: typeof raw.paidAt === 'string' ? raw.paidAt : new Date().toISOString(),
    decidedAt: typeof raw.decidedAt === 'string' ? raw.decidedAt : null,
    declineReason: raw.declineReason ? String(raw.declineReason).slice(0, 300) : ''
  };
}

export function readOrders(storage = localStorage) {
  try { const value = JSON.parse(storage.getItem(ORDERS_KEY) || '[]'); return Array.isArray(value) ? value.map(normalize).filter(Boolean) : []; }
  catch { return []; }
}
function writeOrders(list, storage = localStorage) {
  const trimmed = list.slice(-MAX_ORDERS);
  try { storage.setItem(ORDERS_KEY, JSON.stringify(trimmed)); } catch { /* full/blocked storage: the order still exists in memory for this render */ }
  return trimmed;
}

// Called once, right after a payment is approved (demo or real). Never overwrites an existing order for the same
// reference — a duplicate call (e.g. the Pix polling loop firing twice) is a no-op, not a second entry.
export function recordOrder(input, storage = localStorage) {
  const list = readOrders(storage);
  if (list.some(o => o.reference === input.reference)) return list;
  const order = normalize({...input, id: uid(), status: 'pendente', createdAt: new Date().toISOString(), paidAt: new Date().toISOString()});
  if (!order) return list;
  return writeOrders([...list, order], storage);
}

export function setStatus(id, status, {reason = '', storage = localStorage, now = () => new Date().toISOString()} = {}) {
  if (!STATUSES.includes(status)) throw new Error('invalid_status');
  const list = readOrders(storage);
  const next = list.map(o => o.id === id ? {...o, status, decidedAt: status === 'pendente' ? null : now(), declineReason: status === 'recusado' ? reason.slice(0, 300) : ''} : o);
  return writeOrders(next, storage);
}

// Pending is a queue to work through — oldest first. Completed/declined is history — most recent first.
export function listByStatus(list, status) {
  const filtered = list.filter(o => o.status === status);
  return status === 'pendente' ? filtered.sort((a, b) => a.paidAt.localeCompare(b.paidAt)) : filtered.sort((a, b) => b.paidAt.localeCompare(a.paidAt));
}

// One row per day that had at least one paid order, oldest first — the chart and the calendar both read this.
export function dailyTotals(list) {
  const byDay = new Map();
  for (const order of list) { const key = dayKey(order.paidAt); const entry = byDay.get(key) || {date: key, totalCents: 0, count: 0}; entry.totalCents += order.totalCents; entry.count += 1; byDay.set(key, entry); }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}
export const ordersForDay = (list, key) => list.filter(o => dayKey(o.paidAt) === key).sort((a, b) => b.paidAt.localeCompare(a.paidAt));

export function summary(list) {
  const revenue = list.reduce((sum, o) => sum + o.totalCents, 0);
  const thisMonth = dayKey(new Date().toISOString()).slice(0, 7);
  const monthRevenue = list.filter(o => dayKey(o.paidAt).startsWith(thisMonth)).reduce((sum, o) => sum + o.totalCents, 0);
  return {pendentes: list.filter(o => o.status === 'pendente').length, concluidos: list.filter(o => o.status === 'concluido').length, recusados: list.filter(o => o.status === 'recusado').length, revenue, monthRevenue};
}

export function clearAll(storage = localStorage) { try { storage.removeItem(ORDERS_KEY); } catch {} return []; }
