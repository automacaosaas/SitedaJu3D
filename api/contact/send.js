'use strict';
// POST /api/contact/send  {name, email, subject, message, website}: the form of contato.html (api/_lib/contact.js).
//   200 {ok: true} · 400 {error: 'invalid_request', field} · 403 another site · 429 too_many_requests (Retry-After)
//   503 contact_unavailable (no inbox or e-mail service set up) · 502 mail_failed (the e-mail service refused)
const {json, readJson, clientIp, sameOrigin} = require('../_lib/http');
const {config} = require('../_lib/mail');
const {storeFor} = require('../_lib/account-http');
const {createContact} = require('../_lib/contact');

const STATUS = {invalid_request: 400, too_many_requests: 429, contact_unavailable: 503, mail_failed: 502};

function create({env = process.env, store, now = () => Date.now(), fetchImpl = globalThis.fetch, outbox} = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return json(res, 405, {error: 'method_not_allowed'}, {Allow: 'POST'});
    if (!sameOrigin(req, {...env, SITE_URL: config(env).siteUrl})) return json(res, 403, {error: 'forbidden'});
    const active = store || storeFor(env);
    if (!active) return json(res, 503, {error: 'contact_unavailable'});
    let body;
    try { body = await readJson(req, 8 * 1024); } catch (error) { return json(res, error.status || 400, {error: 'invalid_request'}); }
    try {
      await createContact({store: active, env, now, fetchImpl, outbox}).send(body, {ip: clientIp(req)});
      return json(res, 200, {ok: true});
    } catch (error) {
      const status = STATUS[error.code];
      if (!status) { console.error('contact: unexpected failure —', error); return json(res, 500, {error: 'internal_error'}); }
      return json(res, status, {error: error.code, ...(error.field ? {field: error.field} : {})}, error.retryAfter ? {'Retry-After': String(error.retryAfter)} : {});
    }
  };
}

const handler = create();
handler.create = create;
module.exports = handler;
