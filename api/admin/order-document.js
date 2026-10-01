'use strict';
// POST /api/admin/order-document  {id} → {cpf}: the buyer's full CPF, for issuing the invoice by hand while the NF-e is
// not automatic. The panel and the e-mails show it masked; the full number comes only on request, for paid orders, and
// every view is recorded in the panel audit log (who, which order, when).
const {adminEndpoint} = require('../_lib/admin-http');
const {PAID} = require('../_lib/orders');
const fields = require('../_lib/fields');

const fail = (code, field) => Object.assign(new Error(code), {code, ...(field ? {field} : {})});
const formatCpf = cpf => cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');

module.exports = adminEndpoint({methods: ['POST'], async handle({body, store, env, admin, auth, ip}) {
  const id = String(body.id || '');
  if (!/^[0-9a-f-]{36}$/.test(id)) throw fail('invalid_request', 'id');
  const order = await store.orders.findById(id);
  if (!order || !PAID.includes(order.status) || !order.buyerDocEnc) throw fail('not_found');
  const cpf = fields.decrypt(env, order.buyerDocEnc);
  await auth.audit(admin.id, 'cpf_viewed', order.reference, ip);
  return {body: {ok: true, cpf: formatCpf(cpf)}};
}});
