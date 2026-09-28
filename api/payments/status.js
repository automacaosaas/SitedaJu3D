'use strict';
// GET /api/payments/status?id=ORD… — the checkout polls this while a Pix is waiting to be paid. Read-only and minimal:
// only the state is returned, never the customer's data.
const {json, clientIp, createLimiter} = require('../_lib/http');
const mp = require('../_lib/mercadopago');

function createHandler({env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now(), limiter = createLimiter(now)} = {}) {
  return async function handler(req, res) {
    if (req.method !== 'GET') return json(res, 405, {error: 'method_not_allowed'}, {Allow: 'GET'});
    const settings = mp.settings(env);
    if (settings.mode === 'off') return json(res, 503, {error: 'payments_not_configured'});
    const id = new URL(req.url, 'http://localhost').searchParams.get('id') || '';
    if (!/^[A-Za-z0-9]{10,64}$/.test(id)) return json(res, 400, {error: 'invalid_request'});
    const taken = limiter.take('status-ip:' + clientIp(req), 200, 10 * 60 * 1000);
    if (!taken.ok) return json(res, 429, {error: 'too_many_requests', retryAfter: taken.retryAfter}, {'Retry-After': String(taken.retryAfter)});
    try {
      const order = mp.normalizeOrder(await mp.getOrder({settings, fetchImpl, id}));
      if (!order.reference.startsWith(mp.REFERENCE_PREFIX)) return json(res, 404, {error: 'not_found'});
      return json(res, 200, {reference: order.reference, state: order.state, statusDetail: order.statusDetail, expiresAt: order.pix?.expiresAt || null});
    } catch (error) {
      if (error.status === 404) return json(res, 404, {error: 'not_found'});
      console.error('payments/status: Mercado Pago answered', error.status || '', error.code || '', error.message);
      return json(res, 502, {error: 'provider_unavailable'});
    }
  };
}

module.exports = createHandler();
module.exports.create = createHandler;
