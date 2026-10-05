'use strict';
// POST /api/admin/order-status  {id, status, reason?, trackingCode?} — Ju moves a paid order one step (orders.js FROM):
// pendente → confirmado ("Confirmar": the NF-e is issued, "pronto para envio") → enviado (with the Correios tracking code,
// only once the NF-e is authorized when issuing is on: 409 invoice_pending)
// → concluido (the buyer gets the tracking e-mail), or recusado before it is posted; also one step back. 409
// invalid_transition for any other move.
// Recorded in the order history and in the panel audit log. Declining also refunds the whole amount through Mercado Pago
// (`refund`: refunded, requested or failed; the decline stands either way), and confirming or declining e-mails the
// buyer (`mailed`), with the refund already reflected in the wording. A refunded order cannot be reopened (409 refunded).
// Confirming issues the NF-e when issuing is switched on (api/_lib/invoicing.js); a refusal is saved on the invoice and
// shown in the panel, it never undoes the confirmation. The answer waits a few seconds for the note at most: the note is
// saved in the queue first, and a slow or absent service never holds Ju (BLING-RESILIENCIA.md). Taking the order back
// to Pendentes, or declining it, takes its note out of the queue until it is confirmed again.
const {adminEndpoint} = require('../_lib/admin-http');
const {createOrders, INVOICED} = require('../_lib/orders');
const {createInvoicing} = require('../_lib/invoicing');
const {nfeSettings} = require('../_lib/fiscal');

module.exports = adminEndpoint({methods: ['POST'], async handle({body, store, env, now, admin, auth, ip, fetchImpl, outbox, waitUntil}) {
  const id = String(body.id || '');
  if (!/^[0-9a-f-]{36}$/.test(id)) throw Object.assign(new Error('invalid_request'), {code: 'invalid_request', field: 'id'});
  const orders = createOrders({store, env, now}), before = (await store.orders.findById(id))?.status;
  // The piece never leaves without its note: with NF-e issuing on, "Enviado" (the tracking code) waits for the note to be
  // authorized (409 invoice_pending).
  if (String(body.status || '') === 'enviado' && before === 'confirmado' && nfeSettings(env).mode !== 'off' && (await store.invoices.findByOrder(id))?.status !== 'autorizada') {
    throw Object.assign(new Error('invoice_pending'), {code: 'invoice_pending'});
  }
  let order = await orders.setStatus(id, String(body.status || ''), {reason: body.reason, trackingCode: body.trackingCode, actor: admin.email});
  await auth.audit(admin.id, 'order_status', `${order.reference} → ${order.status}`, ip);
  if (order.status === 'recusado') {
    order = await orders.refund(order, {fetchImpl, actor: admin.email});
    await auth.audit(admin.id, 'order_refund', `${order.reference} → ${order.refundState}`, ip);
  }
  // The buyer hears about the steps forward only: confirmed (from Pendentes), concluded with the tracking code, declined.
  // Going back, and the tracking code going in, e-mail nobody.
  const confirmed = order.status === 'confirmado' && before === 'pendente';
  const mailed = confirmed || ['concluido', 'recusado'].includes(order.status) ? await orders.notifyDecision(order, {fetchImpl, outbox}) : false;
  const invoicing = createInvoicing({store, env, now, fetchImpl, outbox});
  let invoice = await store.invoices.findByOrder(order.id);
  if (confirmed) invoice = await invoicing.issueWithin(order, {actor: admin.email}, {waitUntil}) || invoice;
  else if (!INVOICED.includes(order.status) && invoice?.status === 'fila' && invoice.nextAttemptAt) invoice = await store.invoices.update(invoice.id, {nextAttemptAt: null});
  return {body: {ok: true, order: {...orders.adminView(order), invoice: invoicing.view(invoice)}, mailed, refund: order.status === 'recusado' ? order.refundState : null}};
}});
