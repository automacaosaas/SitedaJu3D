'use strict';
// POST /api/payments/cancel  {id: "ORD…"} — the buyer leaves a Pix that is still waiting ("Gerar novo código Pix",
// "← Alterar dados ou pagamento"): its code is cancelled at Mercado Pago, so it can no longer be paid next to the new
// one (two payments for one cart). Only the buyer who placed the order, from the site itself. A Pix paid in the
// meantime is never cancelled: Mercado Pago refuses (409), the order is read back and recorded as paid, and the answer
// says "approved" so the checkout shows the confirmation instead of a new code.
//   200 {reference, state}   state: canceled · approved · expired · refused · pending_pix (still waiting: try again)
const {json, readJson, sameOrigin} = require('../_lib/http');
const {config} = require('../_lib/mail');
const {storeFor, readCookie} = require('../_lib/account-http');
const {createAccounts} = require('../_lib/accounts');
const {createOrders} = require('../_lib/orders');
const mp = require('../_lib/mercadopago');

function createHandler({env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now(), store: injected, outbox, waitUntil = () => {}} = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return json(res, 405, {error: 'method_not_allowed'}, {Allow: 'POST'});
    const settings = mp.settings(env);
    if (!sameOrigin(req, {...env, SITE_URL: config(env).siteUrl})) return json(res, 403, {error: 'forbidden'});
    if (settings.mode === 'off') return json(res, 503, {error: 'payments_not_configured'});
    const store = injected || storeFor(env);
    if (!store) return json(res, 503, {error: 'accounts_unavailable'});
    const buyer = await createAccounts({store, env, now}).authenticate(readCookie(req));
    if (!buyer) return json(res, 401, {error: 'unauthorized'});
    let body;
    try { body = await readJson(req, 1024); } catch (error) { return json(res, error.status || 400, {error: 'invalid_request'}); }
    const id = String(body?.id || '');
    if (!/^[A-Za-z0-9]{10,64}$/.test(id)) return json(res, 400, {error: 'invalid_request'});
    const taken = await store.rateLimit('cancel-account:' + buyer.id, 30, 10 * 60 * 1000, now());
    if (!taken.ok) return json(res, 429, {error: 'too_many_requests', retryAfter: taken.retryAfter}, {'Retry-After': String(taken.retryAfter)});

    const ours = await store.orders.findByMpId(id);
    if (!ours || ours.customerId !== buyer.id) return json(res, 404, {error: 'not_found'});
    const orders = createOrders({store, env, now});
    let remote;
    try {
      // Waiting on our side: cancel it there. Anything else (paid, cancelled, expired) is only read back.
      remote = ours.status === 'aguardando_pagamento' ? await mp.cancelOrder({settings, fetchImpl, id, idempotencyKey: `cancel-${ours.id}`}) : await mp.getOrder({settings, fetchImpl, id});
    } catch (error) {
      if (error.status === 404) {
        // Mercado Pago does not know it: nothing there can be paid.
        await store.orders.transition(ours.id, ['aguardando_pagamento'], {status: 'cancelado', paymentState: 'canceled'});
        return json(res, 200, {reference: ours.reference, state: 'canceled'});
      }
      try { if (error.status !== 409) throw error; remote = await mp.getOrder({settings, fetchImpl, id}); }   // moved on meanwhile: which way?
      catch (problem) {
        console.error(`payments/cancel: Mercado Pago answered ${problem.status || 'sem resposta'} ${problem.code || ''} · ${ours.reference} · x-request-id ${problem.requestId || '-'}`);
        return json(res, 502, {error: 'provider_unavailable'});
      }
    }
    const state = mp.normalizeOrder(remote);
    const {order} = await orders.applyPayment(ours, state, {actor: 'cliente'});
    if (orders.PAID.includes(order.status)) waitUntil(orders.notifyPaidLater(order, {fetchImpl, outbox, test: settings.mode === 'test'}));
    return json(res, 200, {reference: ours.reference, state: state.state});
  };
}

module.exports = createHandler();
module.exports.create = createHandler;
