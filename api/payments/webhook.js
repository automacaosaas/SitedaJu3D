'use strict';
// POST /api/payments/webhook — Mercado Pago tells us an order changed. The notification itself is never trusted: the
// signature is checked, then the order is read back from Mercado Pago and matched with ours (reference and amount).
// A paid order moves once (atomic transition) and Ju and the buyer get their e-mails once.
// Answer 200 fast (Mercado Pago waits 22 s and retries otherwise); a 5xx makes it retry later.
const {json, readJson} = require('../_lib/http');
const {config, mailReady} = require('../_lib/mail');
const {storeFor} = require('../_lib/account-http');
const {createOrders} = require('../_lib/orders');
const mp = require('../_lib/mercadopago');

function createHandler({env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now(), store: injected, outbox} = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return json(res, 405, {error: 'method_not_allowed'}, {Allow: 'POST'});
    const settings = mp.settings(env);
    if (settings.mode === 'off') return json(res, 503, {error: 'payments_not_configured'});
    if (!settings.webhookSecret) { console.error('payments/webhook: MP_WEBHOOK_SECRET is not set'); return json(res, 503, {error: 'webhook_not_configured'}); }

    let body = {};
    try { body = await readJson(req, 8 * 1024); } catch { /* the signature only needs the query string */ }
    const dataId = new URL(req.url, 'http://localhost').searchParams.get('data.id') || (body.data && body.data.id) || '';
    if (!mp.verifySignature({secret: settings.webhookSecret, signature: req.headers['x-signature'], requestId: req.headers['x-request-id'], dataId})) return json(res, 401, {error: 'invalid_signature'});
    if (!/^[A-Za-z0-9]{10,64}$/.test(String(dataId))) return json(res, 200, {ok: true, ignored: 'not_an_order'});

    let remote;
    try { remote = await mp.getOrder({settings, fetchImpl, id: String(dataId)}); }
    catch (error) { console.error('payments/webhook: could not read the order —', error.status || '', error.message); return json(res, 500, {error: 'lookup_failed'}); }
    if (!String(remote.external_reference || '').startsWith(mp.REFERENCE_PREFIX)) return json(res, 200, {ok: true, ignored: 'not_ours'});

    const store = injected || storeFor(env);
    const ours = store && await store.orders.findByReference(remote.external_reference);
    if (!ours) { console.error(`payments/webhook: ${remote.external_reference} is not in the database`); return json(res, 200, {ok: true, ignored: 'unknown_order'}); }
    const orders = createOrders({store, env, now});
    const {order} = await orders.applyPayment(ours, mp.normalizeOrder(remote), {actor: 'webhook'});
    if (!orders.PAID.includes(order.status)) return json(res, 200, {ok: true, paid: false});

    const sent = await orders.notifyPaid(order, {fetchImpl, outbox, test: settings.mode === 'test'});
    if (!mailReady(config(env))) console.error(`payments/webhook: order ${order.reference} is paid but e-mail is not configured`);
    else if (!settings.ownerEmail) console.error('payments/webhook: ORDER_NOTIFY_EMAIL is not set, so Ju was not notified');
    // Ju's e-mail is the one that matters: if it failed, ask Mercado Pago to call again (the order itself is already saved).
    else if (!sent.owner) return json(res, 500, {error: 'owner_email_failed'});
    return json(res, 200, {ok: true, paid: true, sent});
  };
}

module.exports = createHandler();
module.exports.create = createHandler;
