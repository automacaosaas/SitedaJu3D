'use strict';
// GET /api/payments/methods — the payment methods the shop's Mercado Pago account really accepts (Pix, credit and debit
// cards), so the cart shows only those marks. Read on the server with the Access Token (GET /v1/payment_methods), kept for
// 6 hours. While payments are off, or when Mercado Pago does not answer, {methods: null}: the cart keeps its usual marks.
const {json} = require('../_lib/http');
const mp = require('../_lib/mercadopago');

const KEEP_MS = 6 * 60 * 60 * 1000, RETRY_MS = 5 * 60 * 1000;

function createHandler({env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now()} = {}) {
  let kept = null;   // {token, at, methods, failed}
  return async function handler(req, res) {
    if (req.method !== 'GET') return json(res, 405, {error: 'method_not_allowed'}, {Allow: 'GET'});
    const s = mp.settings(env);
    if (s.mode === 'off') return json(res, 200, {methods: null});
    const fresh = kept && kept.token === s.token && now() - kept.at < (kept.failed ? RETRY_MS : KEEP_MS);
    if (!fresh) {
      try { kept = {token: s.token, at: now(), methods: await mp.paymentMethods({settings: s, fetchImpl}), failed: false}; }
      catch { kept = {token: s.token, at: now(), methods: null, failed: true}; }
    }
    json(res, 200, {methods: kept.methods && kept.methods.length ? kept.methods : null});
  };
}

module.exports = createHandler();
module.exports.create = createHandler;
