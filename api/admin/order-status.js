'use strict';
// POST /api/admin/order-status  {id, status: 'pendente' | 'concluido' | 'recusado', reason?} — Ju moves a paid order.
// Recorded in the order history and in the panel audit log.
const {adminEndpoint} = require('../_lib/admin-http');
const {createOrders} = require('../_lib/orders');

module.exports = adminEndpoint({methods: ['POST'], async handle({body, store, env, now, admin, auth, ip}) {
  const id = String(body.id || '');
  if (!/^[0-9a-f-]{36}$/.test(id)) throw Object.assign(new Error('invalid_request'), {code: 'invalid_request', field: 'id'});
  const orders = createOrders({store, env, now});
  const order = await orders.setStatus(id, String(body.status || ''), {reason: body.reason, actor: admin.email});
  await auth.audit(admin.id, 'order_status', `${order.reference} → ${order.status}`, ip);
  return {body: {ok: true, order: orders.adminView(order)}};
}});
