'use strict';
// GET /api/health — is the e-mail service configured? Are payments on? Reports booleans and modes only, never values.
const {json} = require('./_lib/http');
const {config, mailReady} = require('./_lib/mail');
const mp = require('./_lib/mercadopago');

function createHandler({env = process.env} = {}) {
  return function handler(req, res) {
    const settings = config(env), pay = mp.settings(env);
    json(res, 200, {
      ok: true, mail: !mailReady(settings) ? 'off' : settings.transport === 'console' ? 'console' : 'resend', secret: Boolean(settings.secret), secretFrom: settings.secretFrom, key: Boolean(settings.apiKey), sender: settings.from.includes('onboarding@resend.dev') ? 'test' : 'custom',
      payments: pay.mode, paymentsBlocked: pay.blocked, mp: {token: Boolean(pay.token), publicKey: Boolean(pay.publicKey), webhookSecret: Boolean(pay.webhookSecret)}, orderMail: Boolean(pay.ownerEmail)
    });
  };
}

module.exports = createHandler();
module.exports.create = createHandler;
