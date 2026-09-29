'use strict';
// GET  /api/shipping/quote   → {mode: 'off'} or {mode: 'correios', production: {minDays, maxDays}}   (is the real quote on?)
// POST /api/shipping/quote   {items: [{productId, quantity, selection?}], cep}
//        → {mode: 'correios', cep, options: [{service, label, priceCents, free, days: {min, max}}]}, cheapest first
// The price of every option comes from the Correios contract, computed here from the cart (product and quantity only):
// the browser never sends a price. Errors: 400 invalid_items / invalid_request {field: 'cep'}, 422 no_service (no offered
// service ships to that CEP), 503 shipping_unavailable (the Correios did not answer), 429 too_many_requests.
const {json, readJson, clientIp, sameOrigin, createLimiter} = require('../_lib/http');
const {config: mailConfig} = require('../_lib/mail');
const {priceOrder} = require('../_lib/catalog');
const shipping = require('../_lib/shipping');

const MAX_BODY = 8 * 1024;

function createHandler({env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now(), shippingConfig} = {}) {
  const limiter = createLimiter(now);
  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, {error: 'method_not_allowed'}, {Allow: 'GET, POST'});
    const engine = shipping.forEnv(env, {fetchImpl, config: shippingConfig}), state = engine.status();
    // "pending" (credentials saved but the shop's data incomplete) looks like "off" from outside: the fixed example fee stays.
    if (state.mode !== 'correios') return json(res, 200, {mode: 'off'});
    if (req.method === 'GET') return json(res, 200, {mode: 'correios', production: engine.config.production});
    if (!sameOrigin(req, {...env, SITE_URL: mailConfig(env).siteUrl})) return json(res, 403, {error: 'forbidden'});

    let body;
    try { body = await readJson(req, MAX_BODY); } catch (error) { return json(res, error.status || 400, {error: 'invalid_request'}); }
    const cep = String(body.cep ?? '').replace(/\D/g, '');
    if (!/^\d{8}$/.test(cep)) return json(res, 400, {error: 'invalid_request', field: 'cep'});
    let priced;
    try { priced = priceOrder(body.items); } catch { return json(res, 400, {error: 'invalid_items'}); }
    const taken = limiter.take('quote-ip:' + clientIp(req), 40, 10 * 60 * 1000);
    if (!taken.ok) return json(res, 429, {error: 'too_many_requests', retryAfter: taken.retryAfter}, {'Retry-After': String(taken.retryAfter)});

    try {
      const {options} = await engine.quote({lines: priced.lines, cep, subtotalCents: priced.subtotal});
      return json(res, 200, {mode: 'correios', cep, options: options.map(shipping.publicOption)});
    } catch (error) {
      if (error.code === 'no_service') return json(res, 422, {error: 'no_service'});
      if (error.code === 'invalid_cep') return json(res, 400, {error: 'invalid_request', field: 'cep'});
      console.error('shipping/quote:', error.code || error.message);
      return json(res, 503, {error: 'shipping_unavailable'});
    }
  };
}

module.exports = createHandler();
module.exports.create = createHandler;
