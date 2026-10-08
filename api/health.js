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
const social = require('./_lib/social');
const fiscal = require('./_lib/fiscal');
const {createBling} = require('./_lib/bling');
const shipping = require('./_lib/shipping');
const {queueHeartbeat} = require('./_lib/invoice-queue');
const {indexable, requestHost} = require('./_lib/runtime');
const {shared} = require('./_lib/interest-free');
const fs = require('node:fs');
const path = require('node:path');

// The commit this copy of the site was published from: the own server's deploy writes it to REVISION
// (deploy/deploy.sh) and only calls a release healthy once it answers with it. No file (a local checkout, the Hostinger
// zip): no `release` field at all.
function readRelease(file = path.join(__dirname, '..', 'REVISION')) {
  try { const text = fs.readFileSync(file, 'utf8').trim(); return /^[0-9a-f]{7,40}$/.test(text) ? text.slice(0, 12) : null; } catch { return null; }
}

async function blingState(env, nfe) {
  if (nfe.provider !== 'bling') return 'off';
  const store = storeFor(env);
  if (!store) return 'off';
  try {
    const status = await createBling({store, env}).status();
    return !status.configured ? 'not_configured' : !status.connected ? 'disconnected' : status.pausedReason ? 'paused' : status.unstable ? 'unstable' : 'connected';
  } catch { return 'error'; }
}

// `interestFree`: the "sem juros" check (api/_lib/interest-free.js, the same one /api/payments/config uses). The deployed
// handler (below) has the shared one; a handler made with .create() asks Mercado Pago only when given one.
function createHandler({env = process.env, release = readRelease(), interestFree = null} = {}) {
  return async function handler(req, res) {
    const settings = config(env), pay = mp.settings(env), nfe = fiscal.nfeSettings(env);
    let dataKeys = 'ok';
    try { keys(env); if (!env.DATA_KEY || !env.INDEX_KEY) dataKeys = 'dev'; } catch { dataKeys = 'missing'; }
    json(res, 200, {
      ok: true, mail: !mailReady(settings) ? 'off' : settings.transport === 'console' ? 'console' : 'resend', secret: Boolean(settings.secret), secretFrom: settings.secretFrom, key: Boolean(settings.apiKey), sender: settings.from.includes('onboarding@resend.dev') ? 'test' : 'custom',
      accounts: storeKind(env), db: await ping(env), dataKeys,
      payments: pay.mode, paymentsBlocked: pay.blocked,
      // with payments on: how many installments the Mercado Pago account gives without interest (0, 2 to 12; null = no answer
      // yet), what the checkout's "sem juros" follows (MERCADOPAGO-VALIDACAO.md)
      ...(pay.mode !== 'off' ? {interestFree: interestFree ? await interestFree(env) : null} : {}),
      mp: {token: Boolean(pay.token), publicKey: Boolean(pay.publicKey), webhookSecret: Boolean(pay.webhookSecret)}, orderMail: Boolean(pay.ownerEmail),
      admin: await admin.status(storeFor(env), env),
      shipping: shipping.forEnv(env).status().mode,   // off (no Correios credentials) · pending (shop data incomplete) · correios
      legal: legal.pending() ? 'pending' : 'ok',   // store details still marked [PREENCHER] in api/_lib/legal.js
      social: social.enabled(env),   // "Continuar com o Google / com a Apple": which providers have their credentials (SOCIAL-LOGIN.md)
      nfe: nfe.mode, fiscal: fiscal.missing(fiscal.FISCAL, {provider: nfe.provider}).length ? 'pending' : 'ok',   // NF-e issuing (off, test, live) and the tax data of api/_lib/fiscal.js
      bling: await blingState(env, nfe),   // off, not_configured (app variables missing), disconnected, connected, paused or unstable (the notes wait in the queue)
      // Seconds since this server process started (a host that stops the app when idle shows it starting over) and the
      // NF-e queue of this process: its timer on, and when its last round ended (BLING-RESILIENCIA.md).
      uptime: Math.round(process.uptime()),
      ...(nfe.mode !== 'off' ? {queue: queueHeartbeat()} : {}),
      // Whether search engines may index the address this request came by (the shop's domain, not the temporary one;
      // api/_lib/runtime.js). Only for a real request, which has a Host.
      ...(req?.headers?.host || req?.headers?.['x-forwarded-host'] ? {indexable: indexable(env, requestHost(req))} : {}),
      ...(release ? {release} : {})   // the published commit (12 characters), only where a REVISION file exists
    });
  };
}

module.exports = createHandler({interestFree: shared});
module.exports.create = createHandler;
module.exports.readRelease = readRelease;
