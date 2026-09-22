'use strict';
// GET /api/payments/config — tells the checkout whether real payments are on. Only the PUBLIC key is ever returned.
const {json} = require('../_lib/http');
const mp = require('../_lib/mercadopago');

function createHandler({env = process.env} = {}) {
  return function handler(req, res) {
    if (req.method !== 'GET') return json(res, 405, {error: 'method_not_allowed'}, {Allow: 'GET'});
    const settings = mp.settings(env);
    json(res, 200, settings.mode === 'off' ? {mode: 'off'} : {mode: settings.mode, publicKey: settings.publicKey});
  };
}

module.exports = createHandler();
module.exports.create = createHandler;
