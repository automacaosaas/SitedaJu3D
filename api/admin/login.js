'use strict';
// POST /api/admin/login  {email, password} → {token, expiresAt}. The password is compared on the server only; the
// browser never sees it again, just the signed session token.
const {json, readJson, clientIp, sameOrigin, createLimiter} = require('../_lib/http');
const {config} = require('../_lib/mail');
const admin = require('../_lib/admin-auth');

function createHandler({env = process.env, now = () => Date.now(), limiter = createLimiter(now)} = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return json(res, 405, {error: 'method_not_allowed'}, {Allow: 'POST'});
    const site = config(env);
    if (!sameOrigin(req, {...env, SITE_URL: site.siteUrl})) return json(res, 403, {error: 'forbidden'});
    const settings = admin.settings(env);
    if (!settings.ready) return json(res, 503, {error: 'admin_not_configured'});

    let body;
    try { body = await readJson(req, 1024); } catch (error) { return json(res, error.status || 400, {error: 'invalid_request'}); }

    for (const [key, limit, windowMs] of [['admin-ip:' + clientIp(req), 15, 10 * 60 * 1000], ['admin-email:' + String(body.email || '').trim().toLowerCase(), 8, 10 * 60 * 1000]]) {
      const taken = limiter.take(key, limit, windowMs);
      if (!taken.ok) return json(res, 429, {error: 'too_many_requests', retryAfter: taken.retryAfter}, {'Retry-After': String(taken.retryAfter)});
    }

    if (!admin.checkPassword(settings, body.email, body.password)) return json(res, 401, {error: 'invalid_credentials'});
    const {token, expiresAt} = admin.issueSession({secret: settings.secret, email: settings.email, now: now()});
    return json(res, 200, {token, expiresAt});
  };
}

module.exports = createHandler();
module.exports.create = createHandler;
