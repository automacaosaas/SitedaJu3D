'use strict';
// GET /api/health — is e-mail configured, where do accounts live, does the database answer, are payments on, is the
// admin panel ready (off, waiting, bootstrap, ready)? Booleans and modes only, never values.
const {json} = require('./_lib/http');
const {config, mailReady} = require('./_lib/mail');
const {ping} = require('./_lib/db');
const {storeKind, storeFor} = require('./_lib/account-http');
const {keys} = require('./_lib/fields');
const mp = require('./_lib/mercadopago');
const admin = require('./_lib/admin-auth');
const legal = require('./_lib/legal');
const fiscal = require('./_lib/fiscal');
const {createBling} = require('./_lib/bling');
const shipping = require('./_lib/shipping');

async function blingState(env, nfe) {
  if (nfe.provider !== 'bling') return 'off';
  const store = storeFor(env);
  if (!store) return 'off';
  try {
    const status = await createBling({store, env}).status();
    return !status.configured ? 'not_configured' : !status.connected ? 'disconnected' : status.pausedReason ? 'paused' : 'connected';
  } catch { return 'error'; }
}

function createHandler({env = process.env} = {}) {
  return async function handler(req, res) {
    const settings = config(env), pay = mp.settings(env), nfe = fiscal.nfeSettings(env);
    let dataKeys = 'ok';
    try { keys(env); if (!env.DATA_KEY || !env.INDEX_KEY) dataKeys = 'dev'; } catch { dataKeys = 'missing'; }
    json(res, 200, {
      ok: true, mail: !mailReady(settings) ? 'off' : settings.transport === 'console' ? 'console' : 'resend', secret: Boolean(settings.secret), secretFrom: settings.secretFrom, key: Boolean(settings.apiKey), sender: settings.from.includes('onboarding@resend.dev') ? 'test' : 'custom',
      accounts: storeKind(env), db: await ping(env), dataKeys,
      payments: pay.mode, paymentsBlocked: pay.blocked, mp: {token: Boolean(pay.token), publicKey: Boolean(pay.publicKey), webhookSecret: Boolean(pay.webhookSecret)}, orderMail: Boolean(pay.ownerEmail),
      admin: await admin.status(storeFor(env), env),
      shipping: shipping.forEnv(env).status().mode,   // off (no Correios credentials) · pending (shop data incomplete) · correios
      legal: legal.pending() ? 'pending' : 'ok',   // store details still marked [PREENCHER] in api/_lib/legal.js
      nfe: nfe.mode, fiscal: fiscal.missing(fiscal.FISCAL, {provider: nfe.provider}).length ? 'pending' : 'ok',   // NF-e issuing (off, test, live) and the tax data of api/_lib/fiscal.js
      bling: await blingState(env, nfe)   // off, not_configured (app variables missing), disconnected, connected or paused
    });
  };
}

module.exports = createHandler();
module.exports.create = createHandler;
