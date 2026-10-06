'use strict';
// GET or POST /api/fila/rodar — one round of the NF-e queue (api/_lib/invoice-queue.js) and of the Correios tracking
// (api/_lib/tracking.js) on demand, for a scheduled task
// (hPanel "Cron Jobs" or any scheduler; BLING-RESILIENCIA.md). The Node server already runs the queue every minute and
// the panel runs it when it opens; this call covers a host that stops the app when there are no visits: it wakes the app
// and runs the queue.
// Needs the CRON_SECRET variable (24 characters or more) and the header "Authorization: Bearer <CRON_SECRET>". Without
// the variable the address does not exist (404). Limited per address, and answers only counts, never data.
const crypto = require('node:crypto');
const {json, clientIp} = require('../_lib/http');
const {storeFor} = require('../_lib/account-http');
const {createInvoiceQueue} = require('../_lib/invoice-queue');
const {createTracking} = require('../_lib/tracking');

const HOUR = 3600000, PER_HOUR = 120;
const digest = value => crypto.createHash('sha256').update(String(value)).digest();

function createHandler({env = process.env, store, fetchImpl = globalThis.fetch, now = () => Date.now(), outbox} = {}) {
  return async function handler(req, res) {
    const secret = String(env.CRON_SECRET || '').trim();
    if (secret.length < 24) return json(res, 404, {error: 'not_found'});
    if (!['GET', 'POST'].includes(req.method)) return json(res, 405, {error: 'method_not_allowed'}, {Allow: 'GET, POST'});
    const active = store || storeFor(env);
    if (!active) return json(res, 503, {error: 'unavailable'});
    const taken = await active.rateLimit(`fila-rodar:${clientIp(req)}`, PER_HOUR, HOUR, now());
    if (!taken.ok) return json(res, 429, {error: 'too_many_requests'}, {'Retry-After': String(taken.retryAfter)});
    // Compared as digests of the same length, in constant time: the answer time says nothing about the secret.
    const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!given || !crypto.timingSafeEqual(digest(given), digest(secret))) return json(res, 401, {error: 'unauthorized'});
    const [done, tracked] = await Promise.all([createInvoiceQueue({store: active, env, now, fetchImpl, outbox}).kick(), createTracking({store: active, env, now, fetchImpl, outbox}).kick()]);
    return json(res, done ? 200 : 500, done ? {ok: true, ...done, tracking: tracked || null} : {error: 'queue_failed'});
  };
}

module.exports = createHandler();
module.exports.create = createHandler;
