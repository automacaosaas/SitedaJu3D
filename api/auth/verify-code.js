'use strict';
// POST /api/auth/verify-code  {challenge, code}
// Checks the code against the signed challenge. Success only proves control of the e-mail address.
const {verify} = require('../_lib/challenge');
const {json, readJson, clientIp, sameOrigin, createLimiter} = require('../_lib/http');
const {config} = require('../_lib/mail');

function createHandler({env = process.env, now = () => Date.now(), limiter = createLimiter(now)} = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return json(res, 405, {error: 'method_not_allowed'}, {Allow: 'POST'});
    const settings = config(env);
    if (!sameOrigin(req, {...env, SITE_URL: settings.siteUrl})) return json(res, 403, {error: 'forbidden'});
    if (!settings.secret) return json(res, 503, {error: 'email_not_configured'});
    const taken = limiter.take('verify:' + clientIp(req), 40, 10 * 60 * 1000);
    if (!taken.ok) return json(res, 429, {error: 'too_many_requests', retryAfter: taken.retryAfter}, {'Retry-After': String(taken.retryAfter)});

    let body;
    try { body = await readJson(req); } catch (error) { return json(res, error.status || 400, {error: 'invalid_request'}); }
    const result = verify({secret: settings.secret, token: body.challenge, code: String(body.code ?? '').trim(), now: now()});
    if (!result.ok) return json(res, result.reason === 'expired' ? 410 : 400, {error: result.reason});
    return json(res, 200, {ok: true, email: result.email, purpose: result.purpose, name: result.name});
  };
}

module.exports = createHandler();
module.exports.create = createHandler;
