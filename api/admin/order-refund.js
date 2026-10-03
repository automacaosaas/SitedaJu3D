'use strict';
// POST /api/admin/order-refund  {id} — "Conferir estorno" / "Tentar estorno de novo" on a declined order. A refund still
// being processed is read back from Mercado Pago (never requested twice); a failed one is tried again. Answers the order
// and where its refund stands, with its NF-e (a declined order may still have one to cancel). Only declined orders have
// a refund to look after (404 otherwise).
const {adminEndpoint} = require('../_lib/admin-http');
const {createOrders} = require('../_lib/orders');
const {createInvoicing} = require('../_lib/invoicing');

module.exports = adminEndpoint({methods: ['POST'], async handle({body, store, env, now, admin, auth, ip, fetchImpl, outbox}) {
  const id = String(body.id || '');
  if (!/^[0-9a-f-]{36}$/.test(id)) throw Object.assign(new Error('invalid_request'), {code: 'invalid_request', field: 'id'});
  const orders = createOrders({store, env, now});
  const current = await store.orders.findById(id);
  if (!current || current.status !== 'recusado') throw Object.assign(new Error('not_found'), {code: 'not_found'});
  const order = await orders.retryRefund(current, {fetchImpl, actor: admin.email});
  await auth.audit(admin.id, 'order_refund', `${order.reference} → ${order.refundState}`, ip);
  const invoice = createInvoicing({store, env, now, fetchImpl, outbox}).view(await store.invoices.findByOrder(order.id));
  return {body: {ok: true, order: {...orders.adminView(order), invoice}, refund: order.refundState}};
}});
