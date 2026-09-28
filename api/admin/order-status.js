'use strict';
// POST /api/admin/order-status  {id, status: 'pendente' | 'concluido' | 'recusado', reason?} — Ju moves a paid order.
// Recorded in the order history and in the panel audit log. Confirming or declining also e-mails the buyer (`mailed`).
// Confirming issues the NF-e when issuing is switched on (api/_lib/invoicing.js); a refusal is saved on the invoice and
// shown in the panel, it never undoes the confirmation.
const {adminEndpoint} = require('../_lib/admin-http');
const {createOrders} = require('../_lib/orders');
const {createInvoicing} = require('../_lib/invoicing');

module.exports = adminEndpoint({methods: ['POST'], async handle({body, store, env, now, admin, auth, ip, fetchImpl, outbox}) {
  const id = String(body.id || '');
  if (!/^[0-9a-f-]{36}$/.test(id)) throw Object.assign(new Error('invalid_request'), {code: 'invalid_request', field: 'id'});
  const orders = createOrders({store, env, now});
  const order = await orders.setStatus(id, String(body.status || ''), {reason: body.reason, actor: admin.email});
  await auth.audit(admin.id, 'order_status', `${order.reference} → ${order.status}`, ip);
  const mailed = await orders.notifyDecision(order, {fetchImpl, outbox});
  const invoicing = createInvoicing({store, env, now, fetchImpl, outbox});
  let invoice = await store.invoices.findByOrder(order.id);
  if (order.status === 'concluido') {
    try { invoice = await invoicing.issue(order, {actor: admin.email}) || invoice; }
    catch (error) { console.error(`admin: invoice for ${order.reference} not issued —`, error.message); }
  }
  return {body: {ok: true, order: {...orders.adminView(order), invoice: invoicing.view(invoice)}, mailed}};
}});
