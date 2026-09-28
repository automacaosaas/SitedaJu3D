'use strict';
// POST /api/payments/webhook — Mercado Pago tells us an order changed. The notification itself is never trusted: the
// signature is checked, then the order is read back from Mercado Pago. When it is paid, Ju and the customer get an e-mail.
// Answer 200 fast (Mercado Pago waits 22 s and retries otherwise); a 5xx makes it retry later.
const {json, readJson} = require('../_lib/http');
const {config, mailReady, sendMail} = require('../_lib/mail');
const {renderOwnerEmail, renderCustomerEmail} = require('../_lib/order-email');
const mp = require('../_lib/mercadopago');

function createHandler({env = process.env, fetchImpl = globalThis.fetch, outbox} = {}) {
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

    let order;
    try { order = await mp.getOrder({settings, fetchImpl, id: String(dataId)}); }
    catch (error) { console.error('payments/webhook: could not read the order —', error.status || '', error.message); return json(res, 500, {error: 'lookup_failed'}); }
    if (!String(order.external_reference || '').startsWith(mp.REFERENCE_PREFIX)) return json(res, 200, {ok: true, ignored: 'not_ours'});
    const summary = mp.summarizeOrder(order);
    if (!summary.paid) return json(res, 200, {ok: true, paid: false});

    const mail = config(env), test = settings.mode === 'test', sent = {owner: false, customer: false};
    if (!mailReady(mail)) { console.error(`payments/webhook: order ${summary.reference} is paid but e-mail is not configured`); return json(res, 200, {ok: true, paid: true, sent}); }
    const deliver = (to, message, key) => sendMail({settings: mail, to, subject: message.subject, html: message.html, text: message.text, idempotencyKey: key, fetchImpl, outbox: outbox && (m => outbox({...m, kind: key.split('-')[1], reference: summary.reference}))});
    // Ju's e-mail is the one that matters: if it fails, ask Mercado Pago to retry. The customer's copy is best effort
    // (until a domain is verified at Resend it can only reach the account owner's address).
    if (settings.ownerEmail) {
      try { await deliver(settings.ownerEmail, renderOwnerEmail({summary, test, assetUrl: mail.assetUrl}), `order-owner-${summary.id}`); sent.owner = true; }
      catch (error) { console.error('payments/webhook: e-mail to the owner failed —', error.status || '', error.message); return json(res, 500, {error: 'owner_email_failed'}); }
    } else console.error('payments/webhook: ORDER_NOTIFY_EMAIL is not set, so Ju was not notified');
    if (summary.customer.email) {
      try { await deliver(summary.customer.email, renderCustomerEmail({summary, lang: summary.lang, test, assetUrl: mail.assetUrl}), `order-customer-${summary.id}`); sent.customer = true; }
      catch (error) { console.error('payments/webhook: e-mail to the customer failed —', error.status || '', error.message); }
    }
    return json(res, 200, {ok: true, paid: true, sent});
  };
}

module.exports = createHandler();
module.exports.create = createHandler;
