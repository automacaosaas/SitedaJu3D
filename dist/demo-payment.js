import {COMMERCE} from './commerce-config.js';
import {normalizeCart, totals} from './cart-store.js';
// Local simulator. Never authorizes a shipment or contacts a payment provider.
export function createDemoOrder(items, method, now = Date.now()) {
  if (!['pix', 'card'].includes(method)) throw new Error('Escolha uma forma de pagamento.');
  const snapshot = normalizeCart(items);
  if (!snapshot.length) throw new Error('Adicione uma peça ao carrinho.');
  const suffix = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36)).replaceAll('-', '').slice(-6).toUpperCase();
  return {id: `DEMO-${suffix}`, mode: 'demo', method, items: snapshot, amounts: totals(snapshot),
    status: 'pending', createdAt: now, expiresAt: now + COMMERCE.pixDurationMs, attempt: 1};
}
export function paymentStatus(order, now = Date.now()) {
  if (order.status === 'approved') return 'approved';
  return order.method === 'pix' && now >= order.expiresAt ? 'expired' : order.status;
}
export function approveDemo(order, now = Date.now()) {
  if (order.mode !== 'demo' || paymentStatus(order, now) !== 'pending') throw new Error('Este pagamento não está disponível para confirmação.');
  return {...order, status: 'approved', paidAt: now};
}
export function renewDemo(order, now = Date.now()) {
  if (order.mode !== 'demo' || paymentStatus(order, now) !== 'expired') throw new Error('O código ainda está ativo.');
  return {...order, status: 'pending', expiresAt: now + COMMERCE.pixDurationMs, attempt: order.attempt + 1};
}
export const demoPixCode = order => `DEMONSTRACAO-SEM-VALOR-${order.id}-${order.attempt}`;
