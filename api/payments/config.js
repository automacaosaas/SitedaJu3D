'use strict';
// GET /api/payments/config — tells the checkout whether real payments are on. Only the PUBLIC key is ever returned, plus how
// many installments the shop's Mercado Pago account gives without interest (interestFree: 0, 2 to 12, or null while unknown;
// api/_lib/interest-free.js), so the checkout never promises "sem juros" beyond it.
const {json} = require('../_lib/http');
const mp = require('../_lib/mercadopago');
const {shared} = require('../_lib/interest-free');

// `interestFree`: the check of interest-free.js. The deployed handler (below) uses the shared one; a handler made with .create()
// asks Mercado Pago only when given one (the tests, the local server), so it never reaches the network by itself.
function createHandler({env = process.env, interestFree = null} = {}) {
  return async function handler(req, res) {
    if (req.method !== 'GET') return json(res, 405, {error: 'method_not_allowed'}, {Allow: 'GET'});
    const settings = mp.settings(env);
    if (settings.mode === 'off') return json(res, 200, {mode: 'off'});
    // never held by the "sem juros" check: null at once while it is first asked (in the background), the number afterwards
    json(res, 200, {mode: settings.mode, publicKey: settings.publicKey, interestFree: interestFree ? await interestFree(env, {wait: 0}) : null});
  };
}

module.exports = createHandler({interestFree: shared});
module.exports.create = createHandler;
