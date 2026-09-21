'use strict';
// GET /api/health — is the e-mail service configured? Reports booleans only, never values.
const {json} = require('./_lib/http');
const {config, mailReady} = require('./_lib/mail');

function createHandler({env = process.env} = {}) {
  return function handler(req, res) {
    const settings = config(env);
    json(res, 200, {ok: true, mail: !mailReady(settings) ? 'off' : settings.transport === 'console' ? 'console' : 'resend', secret: Boolean(settings.secret), secretFrom: settings.secretFrom, key: Boolean(settings.apiKey), sender: settings.from.includes('onboarding@resend.dev') ? 'test' : 'custom'});
  };
}

module.exports = createHandler();
module.exports.create = createHandler;
