'use strict';
// GET /api/payments/status?id=ORD… — the checkout asks this while a Pix waits or a card is in review. Only the buyer
// who placed the order gets an answer, and only its state (with ?details=1, a Pix that still waits comes with what the
// checkout needs to show it again after a reload). Each check also brings our order up to date, so a payment is
// recorded (and Ju notified) even when a webhook is late or cannot reach the site. The e-mails go out after the answer
// (`waitUntil` receives them, for a host or a test that wants to keep the work alive or wait for it).
const {json} = require('../_lib/http');
const {storeFor, readCookie} = require('../_lib/account-http');
const {createAccounts} = require('../_lib/accounts');
const {createOrders} = require('../_lib/orders');
const mp = require('../_lib/mercadopago');

function createHandler({env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now(), store: injected, outbox, waitUntil = () => {}} = {}) {
  return async function handler(req, res) {
    if (req.method !== 'GET') return json(res, 405, {error: 'method_not_allowed'}, {Allow: 'GET'});
    const settings = mp.settings(env);
    if (settings.mode === 'off') return json(res, 503, {error: 'payments_not_configured'});
    const id = new URL(req.url, 'http://localhost').searchParams.get('id') || '';
    if (!/^[A-Za-z0-9]{10,64}$/.test(id)) return json(res, 400, {error: 'invalid_request'});
    const store = injected || storeFor(env);
    if (!store) return json(res, 503, {error: 'accounts_unavailable'});
    const buyer = await createAccounts({store, env, now}).authenticate(readCookie(req));
    if (!buyer) return json(res, 401, {error: 'unauthorized'});
    const taken = await store.rateLimit('status-account:' + buyer.id, 200, 10 * 60 * 1000, now());
    if (!taken.ok) return json(res, 429, {error: 'too_many_requests', retryAfter: taken.retryAfter}, {'Retry-After': String(taken.retryAfter)});

    const ours = await store.orders.findByMpId(id);
    if (!ours || ours.customerId !== buyer.id) return json(res, 404, {error: 'not_found'});
    try {
      const remote = mp.normalizeOrder(await mp.getOrder({settings, fetchImpl, id}));
      const orders = createOrders({store, env, now});
      const {order} = await orders.applyPayment(ours, remote, {actor: 'status'});
      if (orders.PAID.includes(order.status)) waitUntil(orders.notifyPaidLater(order, {fetchImpl, outbox, test: settings.mode === 'test'}));
      // ?details=1 (2026-10-08): the checkout reloaded with a Pix that waits asks once for what it needs to show that same Pix
      // again (its code and QR Code, the pieces, the delivery and the amount) instead of creating a second payable one, or the
      // confirmation when it was paid meanwhile. Only to the buyer of the order; the code only while it can still be paid; the
      // 5-second checks never carry any of it.
      const wanted = new URL(req.url, 'http://localhost').searchParams.get('details') === '1' && ['pending_pix', 'approved'].includes(remote.state);
      const details = wanted ? {
        method: remote.method?.type === 'bank_transfer' || remote.method?.id === 'pix' ? 'pix' : 'card', totalCents: order.totalCents,
        items: (order.items || []).map(({productId, quantity, selection}) => ({productId, quantity, selection})),
        shipping: order.shippingInfo ? {service: order.shippingInfo.service, label: order.shippingInfo.label, days: order.shippingInfo.days, priceCents: order.shippingCents, free: order.shippingCents === 0} : null,
        ...(remote.state === 'pending_pix' && remote.pix?.qrCode ? {pix: {qrCode: remote.pix.qrCode, qrCodeBase64: remote.pix.qrCodeBase64 || ''}} : {})
      } : {};
      return json(res, 200, {reference: remote.reference, state: remote.state, statusDetail: remote.statusDetail, expiresAt: remote.pix?.expiresAt || null, ...(remote.reason ? {reason: remote.reason} : {}), ...details});
    } catch (error) {
      if (error.status === 404) return json(res, 404, {error: 'not_found'});
      console.error(`payments/status: Mercado Pago answered ${error.status || 'sem resposta'} ${error.code || ''} · ${ours.reference} · x-request-id ${error.requestId || '-'}`);
      return json(res, 502, {error: 'provider_unavailable'});
    }
  };
}

module.exports = createHandler();
module.exports.create = createHandler;
