'use strict';
// GET /api/account/tracking?ref=JU-… → the delivery of one of the signed-in buyer's own orders, step by step, for the
// "Acompanhar entrega" timeline in "Meus pedidos": where the package stands and the Correios events (newest first: what
// happened, where, when). Served from what the automatic tracking saved (api/_lib/tracking.js); when that is older than
// half an hour, the site asks the Correios once now. Another buyer's order, or one not posted yet, answers 404.
const {endpoint, requireUser} = require('../_lib/account-http');
const {trackingView} = require('../_lib/orders');
const {createTracking} = require('../_lib/tracking');

const REFERENCE = /^JU-[0-9A-Z]{4,20}$/;

module.exports = endpoint({methods: ['GET'], async handle(context) {
  const customer = await requireUser(context);
  const reference = String(new URL(context.req.url || '/', 'http://site').searchParams.get('ref') || '').trim().toUpperCase();
  if (!REFERENCE.test(reference)) throw Object.assign(new Error('invalid_request'), {code: 'invalid_request', field: 'ref'});
  const order = await context.store.orders.findByReference(reference);
  if (!order || order.customerId !== customer.id || !['enviado', 'concluido'].includes(order.status) || !order.trackingCode) throw Object.assign(new Error('not_found'), {code: 'not_found'});
  const current = await createTracking({store: context.store, env: context.env, now: context.now, fetchImpl: context.fetchImpl, outbox: context.outbox}).forOrder(order);
  return {body: {reference, status: current.status, tracking: trackingView(current, {all: true, buyer: true})}};
}});
