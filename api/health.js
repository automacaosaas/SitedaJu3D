'use strict';
// GET /api/health — is e-mail configured, where do accounts live, does the database answer? Booleans and modes only,
// never values.
const {json} = require('./_lib/http');
const {config, mailReady} = require('./_lib/mail');
const {ping} = require('./_lib/db');
const {storeKind} = require('./_lib/account-http');
const {keys} = require('./_lib/fields');

function createHandler({env = process.env} = {}) {
  return async function handler(req, res) {
    const settings = config(env);
    let dataKeys = 'ok';
    try { keys(env); if (!env.DATA_KEY || !env.INDEX_KEY) dataKeys = 'dev'; } catch { dataKeys = 'missing'; }
    json(res, 200, {
      ok: true, mail: !mailReady(settings) ? 'off' : settings.transport === 'console' ? 'console' : 'resend', secret: Boolean(settings.secret), secretFrom: settings.secretFrom, key: Boolean(settings.apiKey), sender: settings.from.includes('onboarding@resend.dev') ? 'test' : 'custom',
      accounts: storeKind(env), db: await ping(env), dataKeys
    });
  };
}

module.exports = createHandler();
module.exports.create = createHandler;
