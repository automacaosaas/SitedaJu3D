'use strict';
// GET /api/payments/status?id=ORD… — the checkout asks this while a Pix waits or a card is in review. Only the buyer
// who placed the order gets an answer, and only its state. Each check also brings our order up to date, so a payment is
// recorded (and Ju notified) even when a webhook is late or cannot reach the site.
const {json} = require('../_lib/http');
const {storeFor, readCookie} = require('../_lib/account-http');
const {createAccounts} = require('../_lib/accounts');
const {createOrders} = require('../_lib/orders');
const mp = require('../_lib/mercadopago');

function createHandler({env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now(), store: injected, outbox} = {}) {
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
      if (orders.PAID.includes(order.status)) await orders.notifyPaid(order, {fetchImpl, outbox, test: settings.mode === 'test'});
      return json(res, 200, {reference: remote.reference, state: remote.state, statusDetail: remote.statusDetail, expiresAt: remote.pix?.expiresAt || null});
    } catch (error) {
      if (error.status === 404) return json(res, 404, {error: 'not_found'});
      console.error('payments/status: Mercado Pago answered', error.status || '', error.code || '', error.message);
      return json(res, 502, {error: 'provider_unavailable'});
    }
  };
}

module.exports = createHandler();
module.exports.create = createHandler;
