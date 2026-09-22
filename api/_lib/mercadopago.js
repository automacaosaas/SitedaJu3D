'use strict';
// Mercado Pago, Checkout Transparente with the Orders API. Everything here runs on the server: the Access Token never
// reaches the browser, and prices are recomputed from api/_lib/catalog.js (never taken from the request).
const crypto = require('node:crypto');
const {amount, fromAmount, encodeSelection, decodeSelection, PRODUCTS} = require('./catalog');

const API = 'https://api.mercadopago.com';
const PIX_EXPIRATION = 'PT1H';          // ISO 8601 duration; Mercado Pago accepts 30 minutes to 30 days
const MAX_INSTALLMENTS = 12;
const TIMEOUT_MS = 25000;
const REFERENCE_PREFIX = 'JU-';
const TEST_PAYER_EMAIL = 'test@testuser.com';

const fail = (code, extra = {}) => Object.assign(new Error(code), {code, ...extra});

// Payments switch on only with both keys. On the Production site they also need a deliberate MP_MODE: "test" (Mercado Pago's
// test credentials, no real money can move) or "live" (real charges). Previews and local runs are always "test", so a key saved
// in the wrong Vercel environment cannot charge anyone.
function settings(env = process.env) {
  const token = String(env.MP_ACCESS_TOKEN || '').trim();
  const publicKey = String(env.MP_PUBLIC_KEY || '').trim();
  const production = env.VERCEL_ENV === 'production';
  const keys = Boolean(token && publicKey);
  const mode = !keys ? 'off' : production ? (env.MP_MODE === 'live' || env.MP_MODE === 'test' ? env.MP_MODE : 'off') : 'test';
  return {
    token, publicKey, mode, production,
    blocked: keys && mode === 'off',                                   // keys present, but Production has no MP_MODE yet
    webhookSecret: String(env.MP_WEBHOOK_SECRET || '').trim(),
    ownerEmail: String(env.ORDER_NOTIFY_EMAIL || '').trim().toLowerCase()
  };
}

function apiError(status, data) {
  const first = Array.isArray(data?.errors) ? data.errors[0] : null;
  return Object.assign(new Error(`Mercado Pago ${status}: ${first?.message || data?.message || data?.error || 'request failed'}`), {status, code: first?.code || data?.error || data?.code || null});
}

async function call({settings: s, fetchImpl = globalThis.fetch, method, path, body, idempotencyKey}) {
  const response = await fetchImpl(API + path, {
    method,
    headers: {Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json', Accept: 'application/json', ...(idempotencyKey ? {'X-Idempotency-Key': idempotencyKey} : {})},
    ...(body ? {body: JSON.stringify(body)} : {}),
    ...(typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? {signal: AbortSignal.timeout(TIMEOUT_MS)} : {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw apiError(response.status, data);
  return data;
}

// Mercado Pago answers error 2198 ("Invalid test user email") when the buyer's address is not the test one while using test credentials.
const isTestEmailRejection = error => Number(error?.code) === 2198 || /test user email|testuser/i.test(String(error?.message || ''));
const createOrder = ({settings: s, fetchImpl, payload, idempotencyKey}) => call({settings: s, fetchImpl, method: 'POST', path: '/v1/orders', body: payload, idempotencyKey});
const getOrder = ({settings: s, fetchImpl, id}) => call({settings: s, fetchImpl, method: 'GET', path: `/v1/orders/${encodeURIComponent(id)}`});

// The reference is derived from the browser's attempt id, so a double click or a network retry lands on the same order.
const referenceFor = attempt => REFERENCE_PREFIX + crypto.createHash('sha256').update('ju-order:' + attempt).digest('hex').slice(0, 10).toUpperCase();

// Language, the customer's e-mail and their note ride in the order description: "en|ana@example.com|please write Ana on the base".
// The e-mail is kept here as well because, in the test environment, Mercado Pago may insist on a test address as the payer.
const encodeMeta = ({lang, email, notes}) => {
  const address = /^[^|\s]{3,100}$/.test(email || '') ? email : '';
  const note = String(notes || '').replace(/[|\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim();
  return `${lang || 'pt-BR'}|${address}|${note}`.slice(0, 250);
};
function decodeMeta(text) {
  const parts = String(text || '').split('|');
  return parts.length < 3 ? {lang: 'pt-BR', email: '', notes: ''} : {lang: parts[0] || 'pt-BR', email: parts[1], notes: parts.slice(2).join('|')};
}

const digits = value => String(value || '').replace(/\D/g, '');
function splitPhone(value) {
  const number = digits(value).replace(/^55(?=\d{10,11}$)/, '');
  return {area_code: number.slice(0, 2), number: number.slice(2)};
}

// What the Payment Brick hands over (`selectedPaymentMethod` + `formData`) → what the Orders API needs.
function paymentFromBrick(input) {
  const {selectedPaymentMethod, formData} = input && typeof input === 'object' ? input : {};
  const data = formData && typeof formData === 'object' ? formData : {};
  const id = String(data.payment_method_id || '').toLowerCase();
  const chosen = String(selectedPaymentMethod || '');
  if (chosen === 'bank_transfer' || id === 'pix') {
    if (id !== 'pix') throw fail('unsupported_method');
    return {methodId: 'pix', type: 'bank_transfer'};
  }
  if (chosen !== 'credit_card' && chosen !== 'debit_card') throw fail('unsupported_method');
  const token = String(data.token || '');
  if (!/^[A-Za-z0-9]{32,33}$/.test(token) || !/^[a-z0-9_]{2,24}$/.test(id)) throw fail('invalid_card');
  const installments = chosen === 'debit_card' ? 1 : Number(data.installments ?? 1);
  if (!Number.isInteger(installments) || installments < 1 || installments > MAX_INSTALLMENTS) throw fail('invalid_installments');
  const ident = data.payer?.identification, number = digits(ident?.number);
  const identification = ident && /^(CPF|CNPJ)$/.test(ident.type) && (number.length === 11 || number.length === 14) ? {type: ident.type, number} : null;
  return {methodId: id, type: chosen, token, installments, identification};
}

function buildOrderPayload({priced, reference, customer, address, notes, lang, payment}) {
  const [first, ...rest] = customer.name.split(' ');
  const items = priced.lines.map(line => ({title: line.title, unit_price: amount(line.unitCents), quantity: line.quantity, description: encodeSelection(line.productId, line.selection), external_code: line.productId}));
  // Delivery is a line of its own so the items always add up to the total Mercado Pago charges.
  items.push({title: 'Frete', unit_price: amount(priced.shipping), quantity: 1, description: 'Entrega', external_code: 'shipping'});
  const method = {id: payment.methodId, type: payment.type};
  if (payment.type !== 'bank_transfer') { method.token = payment.token; method.installments = payment.installments; }
  const transaction = {amount: amount(priced.total), payment_method: method};
  if (payment.type === 'bank_transfer') transaction.expiration_time = PIX_EXPIRATION;
  return {
    type: 'online', processing_mode: 'automatic', external_reference: reference, total_amount: amount(priced.total),
    description: encodeMeta({lang, email: customer.email, notes}),
    payer: {email: customer.email, first_name: first, last_name: rest.join(' ') || first, entity_type: 'individual', phone: splitPhone(customer.phone), ...(payment.identification ? {identification: payment.identification} : {})},
    shipment: {address: {zip_code: digits(address.cep), street_name: address.street, street_number: address.number, neighborhood: address.district, city: address.city, state: address.state, ...(address.complement ? {complement: address.complement} : {})}},
    items, transactions: {payments: [transaction]}
  };
}

// One vocabulary for the browser: approved · pending_pix · in_review · refused · expired.
function normalizeOrder(order) {
  const payment = order?.transactions?.payments?.[0] || {};
  const method = payment.payment_method || {};
  const status = String(order?.status || ''), detail = String(order?.status_detail || '');
  const paymentStatus = String(payment.status || ''), paymentDetail = String(payment.status_detail || '');
  const isPix = method.id === 'pix' || method.type === 'bank_transfer';
  let state = 'in_review';
  if (status === 'processed' && detail === 'accredited') state = 'approved';
  else if (status === 'expired' || paymentStatus === 'expired' || paymentDetail === 'expired') state = 'expired';
  else if (['failed', 'canceled', 'cancelled', 'rejected'].includes(status) || ['failed', 'rejected', 'canceled', 'cancelled'].includes(paymentStatus)) state = 'refused';
  else if (isPix && ['created', 'action_required', 'processing'].includes(status)) state = 'pending_pix';
  const pix = isPix && (method.qr_code || method.ticket_url) ? {qrCode: method.qr_code || '', qrCodeBase64: method.qr_code_base64 || '', ticketUrl: method.ticket_url || '', expiresAt: payment.date_of_expiration || null} : null;
  return {
    id: order?.id || '', reference: order?.external_reference || '', state, status, statusDetail: detail, paymentStatus, paymentStatusDetail: paymentDetail,
    method: {id: method.id || '', type: method.type || '', installments: method.installments || 1}, pix, total: fromAmount(order?.total_amount)
  };
}

// Everything the notification e-mails need, read back from Mercado Pago (the source of truth, not the notification body).
function summarizeOrder(order) {
  const {lang, email, notes} = decodeMeta(order?.description);
  const items = (order?.items || []).filter(item => Object.hasOwn(PRODUCTS, item.external_code)).map(item => ({
    productId: item.external_code, title: PRODUCTS[item.external_code].title, quantity: Number(item.quantity) || 1,
    unitCents: fromAmount(item.unit_price), selection: decodeSelection(item.external_code, item.description)
  }));
  const shipping = (order?.items || []).filter(item => item.external_code === 'shipping').reduce((sum, item) => sum + fromAmount(item.unit_price) * (Number(item.quantity) || 1), 0);
  const address = order?.shipment?.address || {}, payer = order?.payer || {};
  const normalized = normalizeOrder(order);
  return {
    id: order?.id, reference: order?.external_reference, lang, notes, items, shipping, total: fromAmount(order?.total_amount),
    customer: {name: [payer.first_name, payer.last_name].filter((part, i, all) => part && all.indexOf(part) === i).join(' '), email: email || payer.email || '', phone: `${payer.phone?.area_code || ''}${payer.phone?.number || ''}`},
    address: {cep: address.zip_code || '', street: address.street_name || '', number: address.street_number || '', district: address.neighborhood || '', city: address.city || '', state: address.state || '', complement: address.complement || ''},
    method: normalized.method, paid: normalized.state === 'approved'
  };
}

// x-signature: "ts=1742505638683,v1=<hex>". The signed text is "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" (parts
// that are missing are left out) and the key is the application's webhook secret. The docs ask for a lowercase id, but
// Orders ids are upper case, so both spellings are accepted; either one needs the secret to be produced.
function verifySignature({secret, signature, requestId, dataId}) {
  if (!secret || !signature) return false;
  const parts = {};
  for (const piece of String(signature).split(',')) { const cut = piece.indexOf('='); if (cut > 0) parts[piece.slice(0, cut).trim()] = piece.slice(cut + 1).trim(); }
  if (!parts.ts || !/^[0-9a-f]{64}$/i.test(parts.v1 || '')) return false;
  const given = Buffer.from(parts.v1.toLowerCase(), 'hex');
  const id = String(dataId ?? '');
  return [...new Set([id, id.toLowerCase()])].some(candidate => {
    const manifest = `${candidate ? `id:${candidate};` : ''}${requestId ? `request-id:${requestId};` : ''}ts:${parts.ts};`;
    const expected = crypto.createHmac('sha256', secret).update(manifest).digest();
    return expected.length === given.length && crypto.timingSafeEqual(expected, given);
  });
}

module.exports = {settings, isTestEmailRejection, TEST_PAYER_EMAIL, createOrder, getOrder, referenceFor, encodeMeta, decodeMeta, splitPhone, paymentFromBrick, buildOrderPayload, normalizeOrder, summarizeOrder, verifySignature, fail, PIX_EXPIRATION, MAX_INSTALLMENTS, REFERENCE_PREFIX};
