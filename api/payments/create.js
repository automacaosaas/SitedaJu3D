'use strict';
// POST /api/payments/create
//   {attempt, items:[{productId, quantity, selection}], customer:{name,email,phone}, address:{cep,street,number,district,city,state,complement},
//    notes, lang, payment:{selectedPaymentMethod, formData}}
// Validates the cart, recomputes every price on the server, creates the order at Mercado Pago and answers with a small
// status object (and, for Pix, the QR code). Card data never comes through here: the Payment Brick turns it into a token.
const {json, readJson, clientIp, sameOrigin, createLimiter} = require('../_lib/http');
const {config} = require('../_lib/mail');
const {priceOrder} = require('../_lib/catalog');
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

function createHandler({env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now(), limiter = createLimiter(now)} = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return json(res, 405, {error: 'method_not_allowed'}, {Allow: 'POST'});
    const settings = mp.settings(env), site = config(env);
    if (!sameOrigin(req, {...env, SITE_URL: site.siteUrl})) return json(res, 403, {error: 'forbidden'});
    if (settings.mode === 'off') return json(res, 503, {error: 'payments_not_configured'});

    let body;
    try { body = await readJson(req, MAX_BODY); } catch (error) { return json(res, error.status || 400, {error: 'invalid_request'}); }
    const attempt = String(body.attempt || '');
    if (!/^[A-Za-z0-9-]{16,64}$/.test(attempt)) return json(res, 400, {error: 'invalid_request', field: 'attempt'});

    let form, priced, payment;
    try { form = readCustomer(body); } catch (error) { return json(res, 400, {error: 'invalid_request', field: error.field}); }
    try { priced = priceOrder(body.items); } catch { return json(res, 400, {error: 'invalid_items'}); }
    try { payment = mp.paymentFromBrick(body.payment || {}); } catch (error) { return json(res, 400, {error: error.code || 'invalid_payment'}); }

    for (const [key, limit, windowMs] of [['pay-ip:' + clientIp(req), 20, 10 * 60 * 1000], ['pay-email:' + form.customer.email, 8, 10 * 60 * 1000]]) {
      const taken = limiter.take(key, limit, windowMs);
      if (!taken.ok) return json(res, 429, {error: 'too_many_requests', retryAfter: taken.retryAfter}, {'Retry-After': String(taken.retryAfter)});
    }

    const lang = LANGUAGES.includes(body.lang) ? body.lang : 'pt-BR';
    const reference = mp.referenceFor(attempt);
    const payload = mp.buildOrderPayload({priced, reference, customer: form.customer, address: form.address, notes: form.notes, lang, payment});
    try {
      let order;
      try { order = await mp.createOrder({settings, fetchImpl, payload, idempotencyKey: attempt}); }
      catch (error) {
        // The test environment may accept only Mercado Pago's own test buyer address. The real e-mail stays in the order description.
        if (settings.mode !== 'test' || !mp.isTestEmailRejection(error)) throw error;
        order = await mp.createOrder({settings, fetchImpl, payload: {...payload, payer: {...payload.payer, email: mp.TEST_PAYER_EMAIL}}, idempotencyKey: attempt + '-t'});
      }
      return json(res, 201, {ok: true, mode: settings.mode, ...mp.normalizeOrder(order)});
    } catch (error) {
      console.error('payments/create: Mercado Pago answered', error.status || '', error.code || '', error.message);
      const refused = [400, 402, 409, 422].includes(error.status);   // the order itself was turned down; everything else is on our side or theirs
      return json(res, refused ? 422 : 502, {error: refused ? 'payment_rejected' : 'provider_unavailable', code: error.code || null, ...(settings.mode === 'test' ? {detail: String(error.message).slice(0, 300)} : {})});
    }
  };
}

module.exports = createHandler();
module.exports.create = createHandler;
