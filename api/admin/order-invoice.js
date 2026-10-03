'use strict';
// POST /api/admin/order-invoice  {id} — issues the NF-e of a confirmed order again, after an error (missing tax data,
// a CEP to fix, the service down). An authorized note is never issued twice. Recorded in the panel audit log.
const {adminEndpoint} = require('../_lib/admin-http');
const {createOrders} = require('../_lib/orders');
const {createInvoicing} = require('../_lib/invoicing');

const fail = (code, field) => Object.assign(new Error(code), {code, ...(field ? {field} : {})});

module.exports = adminEndpoint({methods: ['POST'], async handle({body, store, env, now, admin, auth, ip, fetchImpl, outbox}) {
  const id = String(body.id || '');
  if (!/^[0-9a-f-]{36}$/.test(id)) throw fail('invalid_request', 'id');
  const order = await store.orders.findById(id);
  if (!order) throw fail('not_found');
  if (order.status !== 'concluido') throw fail('invalid_request', 'status');
  const invoicing = createInvoicing({store, env, now, fetchImpl, outbox});
  if (invoicing.settings.mode === 'off') throw fail('invoicing_off');
  const invoice = await invoicing.issue(order, {actor: admin.email});
  await auth.audit(admin.id, 'nfe_issue', `${order.reference} → ${invoice?.status}`, ip);
  return {body: {ok: true, order: {...createOrders({store, env, now}).adminView(order), invoice: invoicing.view(invoice)}}};
}});
