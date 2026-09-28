'use strict';
// HTTP side of the admin panel, like endpoint() in account-http.js: the admin cookie, the origin check on every change
// and, unless the endpoint is `open` (login, code, logout), a signed-in admin with the second factor done.
const {json, readJson, clientIp, sameOrigin} = require('./http');
const {config} = require('./mail');
const {storeFor, STATUS} = require('./account-http');
const {createAdminAuth, sessionCookie, clearCookie, readCookie} = require('./admin-auth');

const ADMIN_STATUS = {...STATUS, not_found: 404, invoicing_off: 409, refunded: 409};

function adminEndpoint({methods, open = false, handle}) {
  function create({env = process.env, store, now = () => Date.now(), fetchImpl = globalThis.fetch, outbox} = {}) {
    return async function handler(req, res) {
      if (!methods.includes(req.method)) return json(res, 405, {error: 'method_not_allowed'}, {Allow: methods.join(', ')});
      const writing = req.method !== 'GET';
      if (writing && !sameOrigin(req, {...env, SITE_URL: config(env).siteUrl})) return json(res, 403, {error: 'forbidden'});
      const active = store || storeFor(env);
      if (!active) return json(res, 503, {error: 'admin_unavailable'});
      let body = {};
      if (writing) { try { body = await readJson(req, 8 * 1024); } catch (error) { return json(res, error.status || 400, {error: 'invalid_request'}); } }
      const auth = createAdminAuth({store: active, env, now}), token = readCookie(req);
      const context = {req, body, auth, store: active, env, now, token, fetchImpl, outbox, ip: clientIp(req), userAgent: String(req.headers['user-agent'] || '')};
      try {
        if (!open) {
          const current = await auth.authenticate(token);
          if (!current) return json(res, 401, {error: 'unauthorized'}, token ? {'Set-Cookie': clearCookie()} : {});
          Object.assign(context, current);
        }
        const {status = 200, body: answer = {ok: true}, session, clear} = await handle(context);
        return json(res, status, answer, session ? {'Set-Cookie': sessionCookie(session)} : clear ? {'Set-Cookie': clearCookie()} : {});
      } catch (error) {
        const status = ADMIN_STATUS[error.code];
        if (!status) { console.error(`admin: ${req.method} ${req.url} —`, error); return json(res, 500, {error: 'internal_error'}); }
        const extra = {};
        for (const key of ['field', 'remaining', 'retryAfter']) if (error[key] !== undefined) extra[key] = error[key];
        const headers = error.retryAfter ? {'Retry-After': String(error.retryAfter)} : error.code === 'too_many_attempts' ? {'Set-Cookie': clearCookie()} : {};
        return json(res, status, {error: error.code, ...extra}, headers);
      }
    };
  }
  const handler = create();
  handler.create = create;
  return handler;
}

module.exports = {adminEndpoint};
