'use strict';
// GET /api/cep/lookup?cep=01310100 → {cep, street, district, city, state}
// Fills the delivery form from the CEP. The browser never talks to the address services: this handler does (api/_lib/cep.js).
// Errors: 400 invalid_request {field: 'cep'}, 404 not_found (no service knows the CEP), 429 too_many_requests,
// 503 cep_unavailable (the services did not answer: the buyer types the address by hand).
const {json, clientIp, createLimiter} = require('../_lib/http');
const {createCepLookup} = require('../_lib/cep');

function createHandler({fetchImpl = globalThis.fetch, now = () => Date.now()} = {}) {
  const limiter = createLimiter(now), lookup = createCepLookup({fetchImpl, now});
  return async function handler(req, res) {
    if (req.method !== 'GET') return json(res, 405, {error: 'method_not_allowed'}, {Allow: 'GET'});
    const cep = String(new URL(req.url || '/', 'http://localhost').searchParams.get('cep') ?? '').replace(/\D/g, '');
    if (!/^\d{8}$/.test(cep)) return json(res, 400, {error: 'invalid_request', field: 'cep'});
    const taken = limiter.take('cep-ip:' + clientIp(req), 60, 10 * 60 * 1000);
    if (!taken.ok) return json(res, 429, {error: 'too_many_requests', retryAfter: taken.retryAfter}, {'Retry-After': String(taken.retryAfter)});
    try {
      return json(res, 200, {cep, ...(await lookup(cep))});
    } catch (error) {
      if (error.code === 'not_found') return json(res, 404, {error: 'not_found'});
      console.error('cep/lookup:', error.code || error.message);
      return json(res, 503, {error: 'cep_unavailable'});
    }
  };
}

module.exports = createHandler();
module.exports.create = createHandler;
