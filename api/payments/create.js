'use strict';
// POST /api/payments/create
//   {attempt, items:[{productId, quantity, selection}], customer:{name,email,phone}, address:{cep,street,number,district,city,state,complement},
//    notes, lang, payment:{selectedPaymentMethod, formData}}
// Needs a signed-in buyer with a complete identification (invoice and shipping label). Validates the cart, recomputes
// every price on the server, records the order in the database, then creates it at Mercado Pago and answers with a small
// status object (and, for Pix, the QR code). Card data never comes through here: the Payment Brick turns it into a token.
// `customer` is who receives the parcel (the delivery form); the buyer comes from the account.
const {json, readJson, clientIp, sameOrigin} = require('../_lib/http');
const {config} = require('../_lib/mail');
const {priceOrder} = require('../_lib/catalog');
const {storeFor, readCookie} = require('../_lib/account-http');
const {createAccounts} = require('../_lib/accounts');
const {createOrders} = require('../_lib/orders');
const fields = require('../_lib/fields');
const mp = require('../_lib/mercadopago');

const MAX_BODY = 16 * 1024;
const EMAIL = /^[^\s@<>()[\],;:"\\]+@[^\s@<>()[\],;:"\\]+\.[^\s@<>()[\],;:"\\]+$/;
const UFS = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
const LANGUAGES = ['pt-BR', 'en', 'es'];
const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const invalid = field => Object.assign(new Error('invalid_request'), {field});

function readCustomer(body) {
  const c = body.customer || {}, a = body.address || {};
  const name = clean(c.name, 120), email = String(c.email || '').trim().toLowerCase(), phone = String(c.phone || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (name.length < 2) throw invalid('name');
  if (email.length > 180 || !EMAIL.test(email)) throw invalid('email');
  if (!/^[1-9]\d{9,10}$/.test(phone)) throw invalid('phone');
  const address = {cep: String(a.cep || '').replace(/\D/g, ''), street: clean(a.street, 120), number: clean(a.number, 12), district: clean(a.district, 80), city: clean(a.city, 80), state: String(a.state || '').toUpperCase(), complement: clean(a.complement, 60)};
  if (!/^\d{8}$/.test(address.cep)) throw invalid('cep');
  for (const field of ['street', 'number', 'district', 'city']) if (!address[field]) throw invalid(field);
  if (!UFS.has(address.state)) throw invalid('state');
  return {customer: {name, email, phone}, address, notes: clean(body.notes, 500)};
}

function createHandler({env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now(), store: injected, outbox} = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return json(res, 405, {error: 'method_not_allowed'}, {Allow: 'POST'});
    const settings = mp.settings(env), site = config(env);
    if (!sameOrigin(req, {...env, SITE_URL: site.siteUrl})) return json(res, 403, {error: 'forbidden'});
    if (settings.mode === 'off') return json(res, 503, {error: 'payments_not_configured'});
    const store = injected || storeFor(env);
    if (!store) return json(res, 503, {error: 'accounts_unavailable'});
    const buyer = await createAccounts({store, env, now}).authenticate(readCookie(req));
    if (!buyer) return json(res, 401, {error: 'unauthorized'});

    let body;
    try { body = await readJson(req, MAX_BODY); } catch (error) { return json(res, error.status || 400, {error: 'invalid_request'}); }
    const attempt = String(body.attempt || '');
    if (!/^[A-Za-z0-9-]{16,64}$/.test(attempt)) return json(res, 400, {error: 'invalid_request', field: 'attempt'});

    let form, priced, payment;
    try { form = readCustomer(body); } catch (error) { return json(res, 400, {error: 'invalid_request', field: error.field}); }
    try { priced = priceOrder(body.items); } catch { return json(res, 400, {error: 'invalid_items'}); }
    try { payment = mp.paymentFromBrick(body.payment || {}); } catch (error) { return json(res, 400, {error: error.code || 'invalid_payment'}); }

    for (const [key, limit, windowMs] of [['pay-ip:' + clientIp(req), 20, 10 * 60 * 1000], ['pay-account:' + buyer.id, 8, 10 * 60 * 1000]]) {
      const taken = await store.rateLimit(key, limit, windowMs, now());
      if (!taken.ok) return json(res, 429, {error: 'too_many_requests', retryAfter: taken.retryAfter}, {'Retry-After': String(taken.retryAfter)});
    }

    const lang = LANGUAGES.includes(body.lang) ? body.lang : 'pt-BR';
    const reference = mp.referenceFor(attempt);
    const orders = createOrders({store, env, now});
    let order;
    try { order = await orders.open({customer: buyer, reference, source: settings.mode, priced, recipient: form.customer, address: form.address, notes: form.notes, lang}); }
    catch (error) {
      if (error.code === 'profile_incomplete') return json(res, 400, {error: 'profile_incomplete'});
      if (error.code === 'conflict') return json(res, 409, {error: 'invalid_request', field: 'attempt'});
      throw error;
    }

    // Mercado Pago gets the buyer from the account (name, e-mail, CPF when the Brick did not send one) and the phone
    // of this delivery. A complete payer improves approval and fraud checks.
    const identification = payment.identification || {type: 'CPF', number: fields.decrypt(env, buyer.cpfEnc)};
    const payer = {name: `${buyer.firstName} ${buyer.lastName}`, email: buyer.email, phone: form.customer.phone};
    const payload = mp.buildOrderPayload({priced, reference, customer: payer, address: form.address, notes: form.notes, lang, payment: {...payment, identification}});
    try {
      let answer;
      try { answer = await mp.createOrder({settings, fetchImpl, payload, idempotencyKey: attempt}); }
      catch (error) {
        // The test environment may accept only Mercado Pago's own test buyer address. The real e-mail stays in our order.
        if (settings.mode !== 'test' || !mp.isTestEmailRejection(error)) throw error;
        answer = await mp.createOrder({settings, fetchImpl, payload: {...payload, payer: {...payload.payer, email: mp.TEST_PAYER_EMAIL}}, idempotencyKey: attempt + '-t'});
      }
      const normalized = mp.normalizeOrder(answer);
      const {order: updated} = await orders.applyPayment(order, normalized, {actor: 'checkout'});
      if (orders.PAID.includes(updated.status)) await orders.notifyPaid(updated, {fetchImpl, outbox, test: settings.mode === 'test'});
      return json(res, 201, {ok: true, mode: settings.mode, ...normalized});
    } catch (error) {
      console.error('payments/create: Mercado Pago answered', error.status || '', error.code || '', error.message);
      const refused = [400, 402, 409, 422].includes(error.status);   // the order itself was turned down; everything else is on our side or theirs
      await store.orders.addEvent(order.id, refused ? 'payment_rejected' : 'provider_error', String(error.code || error.status || ''), 'checkout').catch(() => {});
      // A refused card ends this attempt (the next click is a new attempt and a new order). A provider error leaves it
      // open: the charge may still have gone through, and the webhook or a status check will settle it.
      if (refused) await store.orders.transition(order.id, ['aguardando_pagamento'], {status: 'cancelado', paymentState: 'refused'}).catch(() => {});
      return json(res, refused ? 422 : 502, {error: refused ? 'payment_rejected' : 'provider_unavailable', code: error.code || null, ...(settings.mode === 'test' ? {detail: String(error.message).slice(0, 300)} : {})});
    }
  };
}

module.exports = createHandler();
module.exports.create = createHandler;
