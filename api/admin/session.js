'use strict';
// GET /api/admin/session — is this token still valid? Used when the panel loads, so a stale or forged token in the
// browser's storage is caught before showing anything.
const {json, clientIp, createLimiter} = require('../_lib/http');
const admin = require('../_lib/admin-auth');

function createHandler({env = process.env, now = () => Date.now(), limiter = createLimiter(now)} = {}) {
  return function handler(req, res) {
    if (req.method !== 'GET') return json(res, 405, {error: 'method_not_allowed'}, {Allow: 'GET'});
    const taken = limiter.take('admin-session:' + clientIp(req), 120, 10 * 60 * 1000);
    if (!taken.ok) return json(res, 429, {error: 'too_many_requests', retryAfter: taken.retryAfter}, {'Retry-After': String(taken.retryAfter)});
    const settings = admin.settings(env);
    if (!settings.ready) return json(res, 503, {error: 'admin_not_configured'});
    const result = admin.verifySession({secret: settings.secret, token: admin.bearerToken(req), now: now()});
    if (!result.ok) return json(res, 401, {error: 'invalid_session'});
    return json(res, 200, {ok: true, email: result.email, expiresAt: result.expiresAt});
  };
}

module.exports = createHandler();
module.exports.create = createHandler;
