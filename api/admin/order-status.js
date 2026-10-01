'use strict';
// POST /api/admin/order-status  {id, status: 'pendente' | 'concluido' | 'recusado', reason?} — Ju moves a paid order.
// Recorded in the order history and in the panel audit log. Declining also refunds the whole amount through Mercado Pago
// (`refund`: refunded, requested or failed; the decline stands either way), and confirming or declining e-mails the
// buyer (`mailed`), with the refund already reflected in the wording. A refunded order cannot be reopened (409 refunded).
const {adminEndpoint} = require('../_lib/admin-http');
const {createOrders} = require('../_lib/orders');

module.exports = adminEndpoint({methods: ['POST'], async handle({body, store, env, now, admin, auth, ip, fetchImpl, outbox}) {
  const id = String(body.id || '');
  if (!/^[0-9a-f-]{36}$/.test(id)) throw Object.assign(new Error('invalid_request'), {code: 'invalid_request', field: 'id'});
  const orders = createOrders({store, env, now});
  let order = await orders.setStatus(id, String(body.status || ''), {reason: body.reason, actor: admin.email});
  await auth.audit(admin.id, 'order_status', `${order.reference} → ${order.status}`, ip);
  if (order.status === 'recusado') {
    order = await orders.refund(order, {fetchImpl, actor: admin.email});
    await auth.audit(admin.id, 'order_refund', `${order.reference} → ${order.refundState}`, ip);
  }
  const mailed = await orders.notifyDecision(order, {fetchImpl, outbox});
  return {body: {ok: true, order: orders.adminView(order), mailed, refund: order.status === 'recusado' ? order.refundState : null}};
}});
