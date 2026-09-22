// Mercado Pago integration, server side: catalog parity, price authority, Orders API payloads, webhook signature,
// handlers (create / status / webhook) with a fake Mercado Pago + Resend, and the payment e-mails.
// Run: node tests/payments.mjs — no network, no keys.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const catalog = require('../api/_lib/catalog');
const mp = require('../api/_lib/mercadopago');
const {renderOwnerEmail, renderCustomerEmail} = require('../api/_lib/order-email');
const {createLimiter} = require('../api/_lib/http');
const configHandler = require('../api/payments/config'), createHandler = require('../api/payments/create'), statusHandler = require('../api/payments/status'), webhookHandler = require('../api/payments/webhook'), health = require('../api/health');
const site = f => import(pathToFileURL(path.join(root, 'dist', f)).href);
const {PRODUCTS: SITE_PRODUCTS, PALETTE} = await site('products.js');
const {COMMERCE} = await site('commerce-config.js');
const {translations} = await site('translations.js');

const SITE = 'https://site.test';
const ENV = {SITE_URL: SITE, RESEND_API_KEY: 're_test_key_123', MAIL_FROM: 'Ju <pedidos@site.test>', MP_ACCESS_TOKEN: 'TEST-secret-token-000', MP_PUBLIC_KEY: 'TEST-public-key-111', MP_WEBHOOK_SECRET: 'whsec-test-222', ORDER_NOTIFY_EMAIL: 'Ju@Site.Test', VERCEL_ENV: 'preview'};
const SECRETS = [ENV.MP_ACCESS_TOKEN, ENV.MP_WEBHOOK_SECRET, ENV.RESEND_API_KEY];
const ITEMS = [{productId: 'borboletoscopio', quantity: 2, selection: {body: 'pink', details: 'lilac'}}, {productId: 'aviaoscopia', quantity: 1, selection: {body: 'black'}}];
const CUSTOMER = {name: 'Ana Souza Lima', email: 'Ana@Example.com', phone: '(31) 99999-1234'};
const ADDRESS = {cep: '30140-071', street: 'Rua da Bahia', number: '1200', district: 'Centro', city: 'Belo Horizonte', state: 'mg', complement: 'Sala 4'};
const BRICK_PIX = {selectedPaymentMethod: 'bank_transfer', formData: {payment_method_id: 'pix', payer: {email: 'ana@example.com'}}};
const brickCard = (token = 'APRO' + 'a'.repeat(28), extra = {}) => ({selectedPaymentMethod: 'credit_card', formData: {token, payment_method_id: 'master', installments: 3, issuer_id: '24', payer: {email: 'ana@example.com', identification: {type: 'CPF', number: '123.456.789-09'}}, ...extra}});
const request = (over = {}) => ({attempt: crypto.randomUUID(), items: ITEMS, customer: CUSTOMER, address: ADDRESS, notes: 'Escrever "Ana" na base', lang: 'en', payment: BRICK_PIX, ...over});

// ── fakes ─────────────────────────────────────────────────────────────
function makeRes() { return {statusCode: 200, headers: {}, body: '', setHeader(key, value) { this.headers[key.toLowerCase()] = value; }, end(data) { this.body = data || ''; }, json() { return JSON.parse(this.body); }}; }
async function call(handler, {method = 'POST', origin = SITE, body = {}, ip = '203.0.113.9', url = '/', headers = {}} = {}) {
  const res = makeRes();
  await handler({method, headers: {...(origin ? {origin} : {}), 'x-forwarded-for': ip, ...headers}, body, socket: {}, url}, res);
  return res;
}
// One fetch for both Mercado Pago and Resend. Card tokens starting APRO are approved, REJE refused, CONT in review.
function fakeNetwork({mpStatus, resendFailFor, testEmailOnly} = {}) {
  const orders = new Map(), mpCalls = [], mails = [];
  const reply = (status, body) => ({ok: status < 400, status, json: async () => body});
  const fetchImpl = async (url, init = {}) => {
    if (url === 'https://api.resend.com/emails') {
      const body = JSON.parse(init.body); mails.push({headers: init.headers, ...body});
      if (resendFailFor && body.to.includes(resendFailFor)) return reply(403, {message: 'You can only send testing emails to your own email address'});
      return reply(200, {id: 'em_' + mails.length});
    }
    mpCalls.push({url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : null});
    if (mpStatus) return reply(mpStatus, {errors: [{code: mpStatus === 422 ? 'invalid_payer' : 'internal', message: 'simulated failure with payer ana@example.com'}]});
    if (url === 'https://api.mercadopago.com/v1/orders' && init.method === 'POST') {
      const body = JSON.parse(init.body), key = init.headers['X-Idempotency-Key'];
      if (testEmailOnly && body.payer.email !== 'test@testuser.com') return reply(400, {errors: [{code: '2198', message: 'Invalid test user email'}]});
      if (orders.has(key)) return reply(201, orders.get(key));
      const pay = body.transactions.payments[0], pm = pay.payment_method, pix = pm.id === 'pix';
      const outcome = pix ? ['action_required', 'waiting_transfer'] : pm.token.startsWith('APRO') ? ['processed', 'accredited'] : pm.token.startsWith('CONT') ? ['processing', 'in_process'] : ['failed', 'failed'];
      const order = {id: 'ORD01TEST' + String(orders.size + 1).padStart(6, '0'), type: 'online', status: outcome[0], status_detail: outcome[1], external_reference: body.external_reference, total_amount: body.total_amount, description: body.description, payer: body.payer, shipment: body.shipment, items: body.items,
        transactions: {payments: [{id: 'PAY01', status: outcome[0], status_detail: outcome[1], amount: pay.amount, date_of_expiration: '2030-01-01T10:00:00.000-03:00', payment_method: {...pm, ...(pix ? {ticket_url: 'https://mp.test/ticket', qr_code: '000201PIXCODE', qr_code_base64: 'iVBORw0KGgo='} : {}), ...(pm.token ? {token: undefined} : {})}}]}};
      orders.set(key, order); orders.set(order.id, order);
      return reply(201, order);
    }
    const found = url.match(/\/v1\/orders\/([^/?]+)$/);
    if (found && init.method === 'GET') return orders.has(found[1]) ? reply(200, orders.get(found[1])) : reply(404, {errors: [{code: 'order_not_found', message: 'not found'}]});
    throw new Error('unexpected request ' + url);
  };
  const pay = id => { const order = orders.get(id); order.status = 'processed'; order.status_detail = 'accredited'; order.transactions.payments[0].status = 'processed'; order.transactions.payments[0].status_detail = 'accredited'; };
  return {fetchImpl, orders, mpCalls, mails, pay};
}
const sign = ({secret = ENV.MP_WEBHOOK_SECRET, id, requestId = 'req-123', ts = String(Date.now()), lower = true} = {}) => `ts=${ts},v1=${crypto.createHmac('sha256', secret).update(`id:${lower ? id.toLowerCase() : id};request-id:${requestId};ts:${ts};`).digest('hex')}`;
const notify = (handler, id, {signature, requestId = 'req-123', dataInQuery = true, ...more} = {}) => call(handler, {origin: '', url: dataInQuery ? `/api/payments/webhook?data.id=${id}&type=order` : '/api/payments/webhook', body: {type: 'order', data: {id}}, headers: {'x-signature': signature ?? sign({id, requestId}), 'x-request-id': requestId}, ...more});
const spyErrors = () => { const lines = []; const original = console.error; console.error = (...args) => { lines.push(args.join(' ')); }; return {lines, restore: () => { console.error = original; }}; };

// ── catalog: server copy must equal the storefront ────────────────────
{
  assert.deepEqual(Object.keys(catalog.PRODUCTS).sort(), Object.keys(SITE_PRODUCTS).sort(), 'same products');
  assert.equal(catalog.SHIPPING_CENTS, COMMERCE.shippingCents, 'same delivery fee');
  for (const [id, product] of Object.entries(SITE_PRODUCTS)) {
    const mine = catalog.PRODUCTS[id];
    assert.equal(mine.title, product.title, `${id}: title`);
    assert.equal(mine.price, COMMERCE.prices[id], `${id}: price`);
    assert.deepEqual(mine.parts.map(p => [p.id, p.default, p.names[0]]), product.parts.map(p => [p.id, p.default, p.name]), `${id}: parts, defaults and Portuguese names`);
    for (const part of mine.parts) assert.deepEqual(part.names.slice(1), translations[part.names[0]], `${id}/${part.id}: English and Spanish names match the site dictionary`);
  }
  assert.deepEqual(Object.keys(catalog.COLORS), PALETTE.map(c => c.id), 'same colors, same order');
  for (const c of PALETTE) { assert.equal(catalog.COLORS[c.id][0], c.name, `${c.id} name`); assert.deepEqual(catalog.COLORS[c.id].slice(1), translations[c.name], `${c.id} translations`); }
}

// ── prices come from the server, and only real carts pass ─────────────
{
  const priced = catalog.priceOrder([{productId: 'borboletoscopio', quantity: 2, selection: {body: 'pink'}, unitPrice: 1, unitCents: 1, price: 1, total: 1}]);
  assert.equal(priced.lines[0].unitCents, 12900, 'a price sent by the browser is ignored');
  assert.equal(priced.subtotal, 25800); assert.equal(priced.shipping, 1800); assert.equal(priced.total, 27600);
  assert.deepEqual(priced.lines[0].selection, {body: 'pink', details: 'yellow'}, 'missing part falls back to the default color');
  assert.deepEqual(catalog.priceOrder([{productId: 'aviaoscopia', quantity: 1, selection: {body: 'neon', details: '__proto__', engines: 'red'}}]).lines[0].selection, {body: 'blue', details: 'red', engines: 'red'}, 'unknown colors fall back to the default');
  for (const bad of [null, [], 'x', {}, [null], [{productId: 'toString', quantity: 1}], [{productId: 'nao-existe', quantity: 1}], [{productId: 'aviaoscopia', quantity: 0}], [{productId: 'aviaoscopia', quantity: 100}], [{productId: 'aviaoscopia', quantity: 1.5}], [{productId: 'aviaoscopia', quantity: '2'}], Array(61).fill({productId: 'aviaoscopia', quantity: 1})]) {
    assert.throws(() => catalog.priceOrder(bad), /invalid_items/, JSON.stringify(bad)?.slice(0, 60));
  }
  assert.equal(catalog.priceOrder([{productId: 'aviaoscopia', quantity: Number('3')}]).subtotal, 47700);
  assert.equal(catalog.amount(12900), '129.00'); assert.equal(catalog.amount(5), '0.05'); assert.equal(catalog.fromAmount('129.00'), 12900); assert.equal(catalog.fromAmount('0.1'), 10);
  assert.equal(catalog.encodeSelection('aviaoscopia', {body: 'blue', details: 'red', engines: 'yellow'}), 'body=blue;details=red;engines=yellow');
  assert(catalog.encodeSelection('aviaoscopia', {body: 'blue', details: 'red', engines: 'yellow'}).length <= 100, 'fits the 100-character item description');
  assert.deepEqual(catalog.decodeSelection('aviaoscopia', 'body=black;details=;engines=nope;junk'), {body: 'black', details: 'red', engines: 'yellow'});
  assert.deepEqual(catalog.describeSelection('borboletoscopio', {body: 'mint', details: 'yellow'}, 'en'), [{part: 'Body', color: 'Mint green'}, {part: 'Wing details', color: 'Yellow'}]);
}

// ── settings: two deliberate steps before real money ──────────────────
{
  assert.equal(mp.settings({}).mode, 'off');
  assert.equal(mp.settings({MP_ACCESS_TOKEN: 'x'}).mode, 'off', 'a token alone is not enough');
  assert.equal(mp.settings({MP_PUBLIC_KEY: 'x'}).mode, 'off', 'neither is a public key alone');
  assert.equal(mp.settings({...ENV, VERCEL_ENV: 'preview'}).mode, 'test');
  assert.equal(mp.settings({...ENV, VERCEL_ENV: undefined}).mode, 'test', 'local runs are test');
  assert.equal(mp.settings({...ENV, VERCEL_ENV: 'production'}).mode, 'off', 'Production stays off with keys but without MP_MODE=live');
  assert(mp.settings({...ENV, VERCEL_ENV: 'production'}).blocked);
  assert.equal(mp.settings({...ENV, VERCEL_ENV: 'production', MP_MODE: 'live'}).mode, 'live');
  assert.equal(mp.settings({...ENV, VERCEL_ENV: 'production', MP_MODE: 'test'}).mode, 'test', 'Production can run the Mercado Pago test credentials on purpose');
  for (const word of ['yes', 'LIVE', 'true', '1', ' live']) assert.equal(mp.settings({...ENV, VERCEL_ENV: 'production', MP_MODE: word}).mode, 'off', `only the exact words "live" and "test" switch Production on (${word})`);
  assert.equal(mp.settings({...ENV, VERCEL_ENV: 'preview', MP_MODE: 'live'}).mode, 'test', 'a preview never goes live');
  assert.equal(mp.settings(ENV).ownerEmail, 'ju@site.test');
  const res = makeRes(); configHandler.create({env: ENV})({method: 'GET'}, res);
  assert.deepEqual(res.json(), {mode: 'test', publicKey: 'TEST-public-key-111'}); assert(!res.body.includes('secret-token') && !res.body.includes('whsec'));
  const off = makeRes(); configHandler.create({env: {}})({method: 'GET'}, off); assert.deepEqual(off.json(), {mode: 'off'});
  const blocked = makeRes(); configHandler.create({env: {...ENV, VERCEL_ENV: 'production'}})({method: 'GET'}, blocked); assert.deepEqual(blocked.json(), {mode: 'off'}, 'the public key is not even exposed while blocked');
  const post = makeRes(); configHandler.create({env: ENV})({method: 'POST'}, post); assert.equal(post.statusCode, 405);
  const h = makeRes(); health.create({env: ENV})({}, h);
  assert.deepEqual(h.json().mp, {token: true, publicKey: true, webhookSecret: true}); assert.equal(h.json().payments, 'test'); assert.equal(h.json().orderMail, true);
  for (const secret of SECRETS) assert(!h.body.includes(secret), 'health never prints a secret');
}

// ── Brick data → Orders API ───────────────────────────────────────────
{
  assert.deepEqual(mp.paymentFromBrick(BRICK_PIX), {methodId: 'pix', type: 'bank_transfer'});
  const card = mp.paymentFromBrick(brickCard());
  assert.equal(card.type, 'credit_card'); assert.equal(card.installments, 3); assert.deepEqual(card.identification, {type: 'CPF', number: '12345678909'});
  assert.equal(mp.paymentFromBrick({selectedPaymentMethod: 'debit_card', formData: {token: 'D'.repeat(32), payment_method_id: 'debelo', installments: 6}}).installments, 1, 'debit is always one payment');
  const bad = (input, code) => assert.throws(() => mp.paymentFromBrick(input), new RegExp(code), JSON.stringify(input).slice(0, 80));
  bad({selectedPaymentMethod: 'ticket', formData: {payment_method_id: 'bolbradesco'}}, 'unsupported_method');
  bad({selectedPaymentMethod: 'wallet_purchase', formData: {}}, 'unsupported_method');
  bad({selectedPaymentMethod: 'bank_transfer', formData: {payment_method_id: 'other'}}, 'unsupported_method');
  bad({}, 'unsupported_method'); bad(null, 'unsupported_method');
  bad(brickCard('short'), 'invalid_card'); bad(brickCard('x'.repeat(40)), 'invalid_card'); bad(brickCard('a b'.repeat(11)), 'invalid_card');
  bad(brickCard(undefined, {payment_method_id: 'MASTER; DROP'}), 'invalid_card');
  bad(brickCard(undefined, {installments: 13}), 'invalid_installments'); bad(brickCard(undefined, {installments: 0}), 'invalid_installments'); bad(brickCard(undefined, {installments: 1.5}), 'invalid_installments');
  assert.equal(mp.paymentFromBrick(brickCard(undefined, {payer: {identification: {type: 'CPF', number: '123'}}})).identification, null, 'malformed document is dropped, not forwarded');
  assert.equal(mp.referenceFor('abc'.repeat(8)), mp.referenceFor('abc'.repeat(8))); assert.notEqual(mp.referenceFor('a'.repeat(20)), mp.referenceFor('b'.repeat(20)));
  assert(/^JU-[0-9A-F]{10}$/.test(mp.referenceFor(crypto.randomUUID())), 'short, readable, allowed characters only (max 64)');
  assert.deepEqual(mp.splitPhone('(31) 99999-1234'), {area_code: '31', number: '999991234'}); assert.deepEqual(mp.splitPhone('+55 31 3333-1234'), {area_code: '31', number: '33331234'});
  assert.deepEqual(mp.decodeMeta(mp.encodeMeta({lang: 'es', notes: 'a|b' + String.fromCharCode(10) + 'c <x>'})), {lang: 'es', email: '', notes: 'a b c x'});
  assert.deepEqual(mp.decodeMeta(''), {lang: 'pt-BR', email: '', notes: ''});
  assert.deepEqual(mp.decodeMeta(mp.encodeMeta({lang: 'en', email: 'ana@example.com', notes: 'oi'})), {lang: 'en', email: 'ana@example.com', notes: 'oi'});
  assert.equal(mp.decodeMeta(mp.encodeMeta({lang: 'en', email: 'a|b@example.com', notes: 'oi'})).email, '', 'an address that could break the format is not stored');
  assert.equal(mp.encodeMeta({lang: 'en', email: 'a@b.co', notes: 'a|b|c'}).split('|').length, 3, 'the note cannot forge the separator');
  assert(mp.encodeMeta({lang: 'en', notes: 'y'.repeat(900)}).length <= 250);
}

// ── payload: what Mercado Pago receives ───────────────────────────────
const priced = catalog.priceOrder(ITEMS);
const payloadFor = payment => mp.buildOrderPayload({priced, reference: 'JU-0123456789', customer: {name: 'Ana Souza Lima', email: 'ana@example.com', phone: '31999991234'}, address: {cep: '30140-071', street: 'Rua da Bahia', number: '1200', district: 'Centro', city: 'Belo Horizonte', state: 'MG', complement: ''}, notes: 'Escrever Ana', lang: 'en', payment});
{
  const pix = payloadFor(mp.paymentFromBrick(BRICK_PIX));
  assert.equal(pix.type, 'online'); assert.equal(pix.processing_mode, 'automatic'); assert.equal(pix.external_reference, 'JU-0123456789');
  assert.equal(pix.total_amount, '435.00', '2 x 129 + 159 + 18 delivery'); assert.equal(pix.transactions.payments[0].amount, pix.total_amount);
  assert.deepEqual(pix.transactions.payments[0].payment_method, {id: 'pix', type: 'bank_transfer'}); assert.equal(pix.transactions.payments[0].expiration_time, 'PT1H');
  const itemsTotal = pix.items.reduce((sum, item) => sum + Math.round(Number(item.unit_price) * 100) * item.quantity, 0);
  assert.equal(itemsTotal, 43500, 'the items (delivery included) add up to the total charged');
  assert.deepEqual(pix.items[0], {title: 'Borboletoscópio', unit_price: '129.00', quantity: 2, description: 'body=pink;details=lilac', external_code: 'borboletoscopio'});
  assert.deepEqual(pix.items.at(-1), {title: 'Frete', unit_price: '18.00', quantity: 1, description: 'Entrega', external_code: 'shipping'});
  assert.deepEqual(pix.payer, {email: 'ana@example.com', first_name: 'Ana', last_name: 'Souza Lima', entity_type: 'individual', phone: {area_code: '31', number: '999991234'}});
  assert.deepEqual(pix.shipment.address, {zip_code: '30140071', street_name: 'Rua da Bahia', street_number: '1200', neighborhood: 'Centro', city: 'Belo Horizonte', state: 'MG'}, 'empty complement is left out');
  assert.equal(pix.description, 'en|ana@example.com|Escrever Ana');
  assert(!('token' in pix.transactions.payments[0].payment_method));
  const card = payloadFor(mp.paymentFromBrick(brickCard()));
  assert.equal(card.transactions.payments[0].payment_method.token, 'APRO' + 'a'.repeat(28)); assert.equal(card.transactions.payments[0].payment_method.installments, 3);
  assert(!('expiration_time' in card.transactions.payments[0]), 'expiration is for Pix only');
  assert.deepEqual(card.payer.identification, {type: 'CPF', number: '12345678909'});
  assert.equal(payloadFor(mp.paymentFromBrick(brickCard())).items.at(-1).external_code, 'shipping');
  const oneName = mp.buildOrderPayload({priced, reference: 'JU-1', customer: {name: 'Madonna', email: 'm@x.co', phone: '31999991234'}, address: {cep: '30140071', street: 's', number: '1', district: 'd', city: 'c', state: 'MG'}, notes: '', lang: 'pt-BR', payment: {methodId: 'pix', type: 'bank_transfer'}});
  assert.equal(oneName.payer.last_name, 'Madonna', 'a single name still fills both fields');
}

// ── normalize / summarize ─────────────────────────────────────────────
{
  const net = fakeNetwork();
  const make = async payment => (await net.fetchImpl('https://api.mercadopago.com/v1/orders', {method: 'POST', headers: {'X-Idempotency-Key': crypto.randomUUID()}, body: JSON.stringify(payloadFor(mp.paymentFromBrick(payment)))})).json();
  const pix = mp.normalizeOrder(await make(BRICK_PIX));
  assert.equal(pix.state, 'pending_pix'); assert.equal(pix.pix.qrCode, '000201PIXCODE'); assert.equal(pix.pix.qrCodeBase64, 'iVBORw0KGgo='); assert.equal(pix.pix.ticketUrl, 'https://mp.test/ticket'); assert.equal(pix.total, 43500);
  assert.equal(mp.normalizeOrder(await make(brickCard())).state, 'approved'); assert.equal(mp.normalizeOrder(await make(brickCard('CONT' + 'c'.repeat(28)))).state, 'in_review'); assert.equal(mp.normalizeOrder(await make(brickCard('REJE' + 'r'.repeat(28)))).state, 'refused');
  assert.equal(mp.normalizeOrder({status: 'expired'}).state, 'expired'); assert.equal(mp.normalizeOrder({status: 'processed', status_detail: 'accredited', transactions: {payments: [{status: 'expired'}]}}).state, 'approved', 'the order status wins');
  assert.equal(mp.normalizeOrder({status: 'action_required', status_detail: 'waiting_capture'}).state, 'in_review', 'anything unknown is never treated as paid');
  assert.notEqual(mp.normalizeOrder({status: 'processed', status_detail: 'in_review'}).state, 'approved', 'processed without accredited is not paid');
  assert.equal(mp.normalizeOrder({}).state, 'in_review'); assert.equal(mp.normalizeOrder(null).state, 'in_review');
  assert(!JSON.stringify(mp.normalizeOrder(await make(brickCard()))).includes('aaaaaaaa'), 'the card token is not echoed to the browser');
  const paid = mp.summarizeOrder(await make(brickCard()));
  assert.equal(paid.paid, true); assert.equal(paid.lang, 'en'); assert.equal(paid.notes, 'Escrever Ana'); assert.equal(paid.shipping, 1800); assert.equal(paid.total, 43500);
  assert.deepEqual(paid.items.map(i => [i.productId, i.quantity, i.unitCents, i.selection]), [['borboletoscopio', 2, 12900, {body: 'pink', details: 'lilac'}], ['aviaoscopia', 1, 15900, {body: 'black', details: 'red', engines: 'yellow'}]], 'the whole order is rebuilt from Mercado Pago alone');
  assert.equal(paid.customer.name, 'Ana Souza Lima'); assert.equal(paid.customer.phone, '31999991234'); assert.equal(paid.address.cep, '30140071'); assert.equal(paid.method.installments, 3);
  assert.equal(mp.summarizeOrder(await make(BRICK_PIX)).paid, false);
  const swapped = await make(brickCard()); swapped.payer.email = 'test@testuser.com'; assert.equal(mp.summarizeOrder(swapped).customer.email, 'ana@example.com', 'the address stored in the order wins over the payer address Mercado Pago holds');
  assert.deepEqual(mp.summarizeOrder({items: [{external_code: 'toString', unit_price: '1.00', quantity: 1}, {external_code: 'shipping', unit_price: '9.00', quantity: 1}]}).items, [], 'foreign or forged items are ignored');
}

// ── webhook signature ─────────────────────────────────────────────────
{
  const id = 'ORD01ABCDEF1234567890XYZ', S = ENV.MP_WEBHOOK_SECRET, ts = '1742505638683';
  const good = sign({id, ts, requestId: 'rq-1'});
  assert(mp.verifySignature({secret: S, signature: good, requestId: 'rq-1', dataId: id}), 'lower-case id, as the docs describe');
  assert(mp.verifySignature({secret: S, signature: sign({id, ts, requestId: 'rq-1', lower: false}), requestId: 'rq-1', dataId: id}), 'the id as received also works');
  assert(mp.verifySignature({secret: S, signature: ` ts=${ts} , v1=${good.split('v1=')[1].toUpperCase()}`, requestId: 'rq-1', dataId: id}), 'spacing and hex case do not matter');
  assert(!mp.verifySignature({secret: S + 'x', signature: good, requestId: 'rq-1', dataId: id}), 'wrong secret');
  assert(!mp.verifySignature({secret: S, signature: good, requestId: 'rq-2', dataId: id}), 'another request id');
  assert(!mp.verifySignature({secret: S, signature: good, requestId: 'rq-1', dataId: id + '9'}), 'another order id');
  assert(!mp.verifySignature({secret: S, signature: good.replace(ts, '1742505638684'), requestId: 'rq-1', dataId: id}), 'tampered timestamp');
  for (const signature of ['', undefined, 'ts=1', 'v1=abc', `ts=${ts},v1=zz`, `ts=${ts},v1=${'0'.repeat(64)}`, `ts=${ts},v1=${'0'.repeat(63)}`, 'garbage', `ts=${ts},v1=${good.split('v1=')[1]}00`]) assert(!mp.verifySignature({secret: S, signature, requestId: 'rq-1', dataId: id}), String(signature).slice(0, 30));
  assert(!mp.verifySignature({secret: '', signature: good, requestId: 'rq-1', dataId: id}), 'no secret configured never validates');
  const noRequestId = `ts=${ts},v1=${crypto.createHmac('sha256', S).update(`id:${id.toLowerCase()};ts:${ts};`).digest('hex')}`;
  assert(mp.verifySignature({secret: S, signature: noRequestId, dataId: id}), 'a missing part is left out of the signed text');
}

// ── POST /api/payments/create ─────────────────────────────────────────
{
  const net = fakeNetwork(), clock = {t: 1_700_000_000_000};
  const handler = createHandler.create({env: ENV, fetchImpl: net.fetchImpl, now: () => clock.t});
  const errors = spyErrors();
  try {
    assert.equal((await call(handler, {method: 'GET'})).statusCode, 405);
    assert.equal((await call(handler, {origin: '', body: request()})).statusCode, 403, 'no Origin'); assert.equal((await call(handler, {origin: 'https://evil.example', body: request()})).statusCode, 403, 'foreign Origin');
    assert.equal((await call(createHandler.create({env: {SITE_URL: SITE}, fetchImpl: net.fetchImpl}), {body: request()})).statusCode, 503, 'no keys → the checkout falls back to the demo');
    assert.equal((await call(createHandler.create({env: {...ENV, VERCEL_ENV: 'production'}, fetchImpl: net.fetchImpl}), {body: request()})).statusCode, 503, 'Production without MP_MODE refuses');
    assert.equal(net.mpCalls.length, 0, 'nothing reached Mercado Pago so far');
    const badField = async (mutate, field, status = 400) => { const res = await call(handler, {ip: '198.51.100.' + Math.floor(Math.random() * 200), body: mutate(request())}); assert.equal(res.statusCode, status, field); assert.equal(res.json().field ?? res.json().error, field); };
    await badField(b => ({...b, attempt: 'short'}), 'attempt'); await badField(b => ({...b, attempt: undefined}), 'attempt');
    await badField(b => ({...b, customer: {...CUSTOMER, name: ' '}}), 'name'); await badField(b => ({...b, customer: {...CUSTOMER, email: 'not-an-email'}}), 'email'); await badField(b => ({...b, customer: {...CUSTOMER, email: 'a@b.co\nBcc: x@y.zz'}}), 'email');
    await badField(b => ({...b, customer: {...CUSTOMER, phone: '123'}}), 'phone'); await badField(b => ({...b, address: {...ADDRESS, cep: '123'}}), 'cep'); await badField(b => ({...b, address: {...ADDRESS, street: ''}}), 'street'); await badField(b => ({...b, address: {...ADDRESS, state: 'XX'}}), 'state'); await badField(b => ({...b, address: {...ADDRESS, city: '   '}}), 'city');
    await badField(b => ({...b, items: []}), 'invalid_items'); await badField(b => ({...b, items: [{productId: 'nao-existe', quantity: 1}]}), 'invalid_items');
    await badField(b => ({...b, payment: {selectedPaymentMethod: 'ticket', formData: {payment_method_id: 'bolbradesco'}}}), 'unsupported_method'); await badField(b => ({...b, payment: brickCard('short')}), 'invalid_card');
    assert.equal((await call(handler, {body: 'not json'})).statusCode, 400);
    assert.equal(net.mpCalls.length, 0, 'invalid requests never reach Mercado Pago');

    const body = request({items: [{...ITEMS[0], unitPrice: 1, price: 1, unitCents: 1, total: 1}, ITEMS[1]], total: 1, amount: '0.01'});
    const ok = await call(handler, {body});
    assert.equal(ok.statusCode, 201); assert.equal(ok.headers['cache-control'], 'no-store');
    const answer = ok.json();
    assert.equal(answer.state, 'pending_pix'); assert.equal(answer.pix.qrCode, '000201PIXCODE'); assert.equal(answer.mode, 'test'); assert.equal(answer.reference, mp.referenceFor(body.attempt)); assert.match(answer.id, /^ORD01TEST/);
    const sent = net.mpCalls.at(-1);
    assert.equal(sent.method, 'POST'); assert.equal(sent.url, 'https://api.mercadopago.com/v1/orders');
    assert.equal(sent.headers.Authorization, `Bearer ${ENV.MP_ACCESS_TOKEN}`); assert.equal(sent.headers['X-Idempotency-Key'], body.attempt);
    assert.equal(sent.body.total_amount, '435.00', 'the total was recomputed on the server, not taken from the browser');
    assert.equal(sent.body.payer.email, 'ana@example.com', 'the e-mail is normalized'); assert.equal(sent.body.shipment.address.state, 'MG'); assert.equal(sent.body.shipment.address.zip_code, '30140071');
    assert.equal(sent.body.description, 'en|ana@example.com|Escrever "Ana" na base');
    for (const secret of SECRETS) assert(!ok.body.includes(secret), 'no secret in the answer');

    const again = await call(handler, {body});
    assert.equal(again.json().id, answer.id, 'the same attempt id returns the same order (a double click cannot charge twice)');
    assert.equal(new Set(net.orders.keys()).size >= 2, true);

    const card = await call(handler, {body: request({payment: brickCard()})});
    assert.equal(card.statusCode, 201); assert.equal(card.json().state, 'approved'); assert.equal(card.json().method.installments, 3);
    const cardCall = net.mpCalls.at(-1).body.transactions.payments[0];
    assert.equal(cardCall.payment_method.installments, 3); assert.equal(cardCall.payment_method.token.length, 32); assert(!card.body.includes('aaaaaaaa'), 'the card token stays on the server');
    assert.equal((await call(handler, {body: request({payment: brickCard('REJE' + 'r'.repeat(28))})})).json().state, 'refused');
    assert(!errors.lines.join('\n').includes('aaaaaaaa'), 'the card token is never logged');

    const refuse = await call(createHandler.create({env: ENV, fetchImpl: fakeNetwork({mpStatus: 422}).fetchImpl}), {body: request()});
    assert.equal(refuse.statusCode, 422); assert.equal(refuse.json().error, 'payment_rejected'); assert.equal(refuse.json().code, 'invalid_payer'); assert(refuse.json().detail, 'test mode shows Mercado Pago\'s reason');
    const live = await call(createHandler.create({env: {...ENV, VERCEL_ENV: 'production', MP_MODE: 'live'}, fetchImpl: fakeNetwork({mpStatus: 422}).fetchImpl}), {body: request()});
    assert.equal(live.statusCode, 422); assert(!('detail' in live.json()), 'live mode never leaks the provider message (it can quote the customer\'s data)');
    for (const status of [401, 403, 404, 424, 429, 500, 503]) { const res = await call(createHandler.create({env: ENV, fetchImpl: fakeNetwork({mpStatus: status}).fetchImpl}), {body: request()}); assert.equal(res.statusCode, 502, `MP ${status} → 502`); assert.equal(res.json().error, 'provider_unavailable'); }
    assert.equal((await call(createHandler.create({env: ENV, fetchImpl: async () => { throw new Error('socket hang up'); }}), {body: request()})).statusCode, 502, 'a network failure is reported as 502');

    // rate limits: 20 per IP and 8 per e-mail in ten minutes
    const limited = createHandler.create({env: ENV, fetchImpl: fakeNetwork().fetchImpl, now: () => clock.t, limiter: createLimiter(() => clock.t)});
    for (let i = 0; i < 8; i++) assert.equal((await call(limited, {ip: `192.0.2.${i}`, body: request({customer: {...CUSTOMER, email: 'same@example.com'}})})).statusCode, 201);
    const ninth = await call(limited, {ip: '192.0.2.99', body: request({customer: {...CUSTOMER, email: 'same@example.com'}})});
    assert.equal(ninth.statusCode, 429); assert(Number(ninth.headers['retry-after']) > 0);
    for (let i = 0; i < 20; i++) await call(limited, {ip: '192.0.2.200', body: request({customer: {...CUSTOMER, email: `n${i}@example.com`}})});
    assert.equal((await call(limited, {ip: '192.0.2.200', body: request({customer: {...CUSTOMER, email: 'fresh@example.com'}})})).statusCode, 429, 'per IP');
  } finally { errors.restore(); }
}

// ── test environment that only accepts Mercado Pago's own buyer address ─
{
  const net = fakeNetwork({testEmailOnly: true}), errors = spyErrors();
  try {
    const handler = createHandler.create({env: ENV, fetchImpl: net.fetchImpl});
    const ok = await call(handler, {body: request({customer: {...CUSTOMER, email: 'real.customer@example.com'}, payment: brickCard()})});
    assert.equal(ok.statusCode, 201, 'the second try with the test address succeeds'); assert.equal(ok.json().state, 'approved');
    const posts = net.mpCalls.filter(c => c.method === 'POST');
    assert.equal(posts.length, 2); assert.equal(posts[0].body.payer.email, 'real.customer@example.com'); assert.equal(posts[1].body.payer.email, 'test@testuser.com');
    assert(posts[1].headers['X-Idempotency-Key'].endsWith('-t') && posts[1].headers['X-Idempotency-Key'] !== posts[0].headers['X-Idempotency-Key'], 'the retry is a new request for Mercado Pago');
    assert(posts[1].body.description.includes('real.customer@example.com'), 'the real address stays in the order');
    const hook = webhookHandler.create({env: ENV, fetchImpl: net.fetchImpl});
    assert.equal((await notify(hook, ok.json().id)).statusCode, 200);
    assert.deepEqual(net.mails.map(m => m.to[0]).sort(), ['ju@site.test', 'real.customer@example.com'], 'the receipt still goes to the real customer, not to the test address');
    const live = createHandler.create({env: {...ENV, VERCEL_ENV: 'production', MP_MODE: 'live'}, fetchImpl: fakeNetwork({testEmailOnly: true}).fetchImpl});
    const before = net.mpCalls.length; const refused = await call(live, {body: request({customer: {...CUSTOMER, email: 'someone@example.com'}, payment: brickCard()})});
    assert.equal(refused.statusCode, 422, 'in live mode the address is never swapped'); assert.equal(net.mpCalls.length, before);
  } finally { errors.restore(); }
  assert.equal(mp.isTestEmailRejection({code: 2198}), true); assert.equal(mp.isTestEmailRejection({code: '2198'}), true); assert.equal(mp.isTestEmailRejection({message: 'Invalid test user email'}), true); assert.equal(mp.isTestEmailRejection({code: 4050, message: 'Payer.email must be a valid email'}), false);
}

// ── GET /api/payments/status ──────────────────────────────────────────
{
  const net = fakeNetwork(), created = await call(createHandler.create({env: ENV, fetchImpl: net.fetchImpl}), {body: request()});
  const {id} = created.json(), handler = statusHandler.create({env: ENV, fetchImpl: net.fetchImpl});
  const get = (query, opts = {}) => call(handler, {method: 'GET', origin: '', url: '/api/payments/status' + query, ...opts});
  const waiting = await get('?id=' + id); assert.equal(waiting.statusCode, 200); assert.equal(waiting.json().state, 'pending_pix'); assert.deepEqual(Object.keys(waiting.json()).sort(), ['expiresAt', 'reference', 'state', 'statusDetail'], 'only the state is exposed');
  net.pay(id); assert.equal((await get('?id=' + id)).json().state, 'approved');
  assert.equal((await get('')).statusCode, 400); assert.equal((await get('?id=../../secret')).statusCode, 400); assert.equal((await get('?id=short')).statusCode, 400);
  assert.equal((await get('?id=ORD01DOESNOTEXIST999')).statusCode, 404);
  net.orders.get(id).external_reference = 'OUTRA-LOJA-1'; assert.equal((await get('?id=' + id)).statusCode, 404, 'only orders that carry our reference');
  assert.equal((await call(handler, {method: 'POST', origin: ''})).statusCode, 405);
  assert.equal((await call(statusHandler.create({env: {}, fetchImpl: net.fetchImpl}), {method: 'GET', origin: '', url: '/x?id=' + id})).statusCode, 503);
  const errors = spyErrors(); try { assert.equal((await call(statusHandler.create({env: ENV, fetchImpl: fakeNetwork({mpStatus: 500}).fetchImpl}), {method: 'GET', origin: '', url: '/x?id=' + id})).statusCode, 502); } finally { errors.restore(); }
  let t = 0; const flood = statusHandler.create({env: ENV, fetchImpl: net.fetchImpl, now: () => t, limiter: createLimiter(() => t)});
  for (let i = 0; i < 200; i++) await call(flood, {method: 'GET', origin: '', url: '/x?id=' + id, ip: '198.51.100.7'});
  assert.equal((await call(flood, {method: 'GET', origin: '', url: '/x?id=' + id, ip: '198.51.100.7'})).statusCode, 429);
}

// ── POST /api/payments/webhook ────────────────────────────────────────
{
  const build = (extra = {}, envOver = {}) => { const net = fakeNetwork(extra); return {net, handler: webhookHandler.create({env: {...ENV, ...envOver}, fetchImpl: net.fetchImpl}), create: createHandler.create({env: ENV, fetchImpl: net.fetchImpl})}; };
  const errors = spyErrors();
  try {
    const {net, handler, create} = build();
    const card = (await call(create, {body: request({payment: brickCard()})})).json(), pix = (await call(create, {body: request()})).json();
    assert.equal((await call(handler, {method: 'GET', origin: ''})).statusCode, 405);
    assert.equal((await notify(handler, card.id, {signature: 'ts=1,v1=' + '0'.repeat(64)})).statusCode, 401, 'wrong signature');
    assert.equal((await notify(handler, card.id, {signature: sign({id: card.id, secret: 'another-secret'})})).statusCode, 401, 'signed with another secret');
    assert.equal((await call(handler, {origin: '', url: `/x?data.id=${card.id}`, body: {}})).statusCode, 401, 'no signature at all');
    assert.equal((await notify(handler, pix.id, {signature: sign({id: card.id})})).statusCode, 401, 'a signature for another order');
    assert.equal(net.mails.length, 0, 'unsigned notifications send nothing');

    const first = await notify(handler, card.id);
    assert.equal(first.statusCode, 200); assert.deepEqual(first.json(), {ok: true, paid: true, sent: {owner: true, customer: true}});
    assert.equal(net.mails.length, 2);
    const [owner, customer] = net.mails;
    assert.deepEqual(owner.to, ['ju@site.test']); assert(owner.subject.startsWith('[TESTE] Novo pedido pago · JU-')); assert(owner.subject.includes('R$') && owner.subject.includes('435,00'));
    assert(owner.html.includes('Borboletoscópio') && owner.html.includes('Rosa Ju') && owner.html.includes('Lilás') && owner.html.includes('Preto') && owner.html.includes('Aviãoscopia'), 'Ju sees the pieces and the chosen colors');
    assert(owner.html.includes('Rua da Bahia, 1200') && owner.html.includes('30140-071') && owner.html.includes('wa.me/5531999991234') && owner.html.includes('ana@example.com'), 'and where to send it and how to reach the customer');
    assert(owner.html.includes('Cartão de crédito · 3x') && owner.html.includes('Escrever &quot;Ana&quot; na base') && owner.html.includes('AMBIENTE DE TESTE'));
    assert.deepEqual(customer.to, ['ana@example.com']); assert(customer.subject.startsWith('[TESTE] Payment confirmed · JU-'), 'the customer gets it in the language they used');
    assert(customer.html.includes('Body') && customer.html.includes('Ju pink') && customer.html.includes('Wing details') && customer.html.includes('Credit card · 3x'));
    assert.equal(owner.headers['Idempotency-Key'], `order-owner-${card.id}`); assert.equal(customer.headers['Idempotency-Key'], `order-customer-${card.id}`, 'a retried notification reuses the same keys, so Resend drops the duplicate');
    const retry = await notify(handler, card.id, {requestId: 'req-456'}); assert.equal(retry.statusCode, 200);
    assert.equal(net.mails.at(-1).headers['Idempotency-Key'], `order-customer-${card.id}`);

    const waiting = await notify(handler, pix.id); assert.deepEqual(waiting.json(), {ok: true, paid: false}); assert.equal(net.mails.length, 4, 'an unpaid Pix sends nothing');
    net.pay(pix.id); const bodyOnly = await notify(handler, pix.id, {dataInQuery: false});
    assert.equal(bodyOnly.statusCode, 200, 'the id may also come in the body; the signature still covers it'); assert.equal(net.mails.length, 6); assert(net.mails.at(-2).html.includes('Pix'));

    assert.equal((await notify(handler, 'ORD01DOESNOTEXIST999')).statusCode, 500, 'Mercado Pago cannot find it → 5xx so it retries later');
    assert.equal((await notify(handler, 'x/../y', {signature: sign({id: 'x/../y'})})).json().ignored, 'not_an_order');
    net.orders.get(card.id).external_reference = 'OUTRA-LOJA'; const before = net.mails.length;
    assert.equal((await notify(handler, card.id)).json().ignored, 'not_ours'); assert.equal(net.mails.length, before, 'orders from elsewhere are ignored');
    for (const text of net.mails.map(m => m.html + m.text)) for (const secret of SECRETS) assert(!text.includes(secret), 'no secret in any e-mail');
  } finally { errors.restore(); }

  // failure handling
  const quiet = spyErrors();
  try {
    const noSecret = build({}, {MP_WEBHOOK_SECRET: ''}); assert.equal((await notify(noSecret.handler, 'ORD01ABCDEFGHIJKLM')).statusCode, 503, 'no webhook secret → refuses');
    assert.equal((await call(webhookHandler.create({env: {}, fetchImpl: noSecret.net.fetchImpl}), {origin: '', url: '/x?data.id=ORD01ABCDEFGHIJKLM', body: {}})).statusCode, 503, 'payments off');
    const ownerDown = build({resendFailFor: 'ju@site.test'}); const paid = (await call(ownerDown.create, {body: request({payment: brickCard()})})).json();
    assert.equal((await notify(ownerDown.handler, paid.id)).statusCode, 500, 'Ju\'s e-mail failing → 500 so Mercado Pago retries');
    const customerDown = build({resendFailFor: 'ana@example.com'}); const paid2 = (await call(customerDown.create, {body: request({payment: brickCard()})})).json();
    const partial = await notify(customerDown.handler, paid2.id); assert.equal(partial.statusCode, 200, 'the customer\'s copy is best effort'); assert.deepEqual(partial.json().sent, {owner: true, customer: false});
    const noOwner = build({}, {ORDER_NOTIFY_EMAIL: ''}); const paid3 = (await call(noOwner.create, {body: request({payment: brickCard()})})).json();
    const ownerless = await notify(noOwner.handler, paid3.id); assert.equal(ownerless.statusCode, 200); assert.deepEqual(ownerless.json().sent, {owner: false, customer: true}); assert(quiet.lines.some(l => l.includes('ORDER_NOTIFY_EMAIL')), 'says why Ju was not told');
    const noMail = build({}, {RESEND_API_KEY: ''}); const paid4 = (await call(noMail.create, {body: request({payment: brickCard()})})).json();
    assert.deepEqual((await notify(noMail.handler, paid4.id)).json(), {ok: true, paid: true, sent: {owner: false, customer: false}}); assert.equal(noMail.net.mails.length, 0);
    const live = build({}, {VERCEL_ENV: 'production', MP_MODE: 'live'}); const paid5 = (await call(createHandler.create({env: {...ENV, VERCEL_ENV: 'production', MP_MODE: 'live'}, fetchImpl: live.net.fetchImpl}), {body: request({payment: brickCard()})})).json();
    await notify(live.handler, paid5.id); assert(!live.net.mails[0].subject.includes('[TESTE]') && !live.net.mails[0].html.includes('AMBIENTE DE TESTE'), 'live orders are not marked as tests');
  } finally { quiet.restore(); }
}

// ── the e-mails themselves ────────────────────────────────────────────
{
  const net = fakeNetwork(), made = await call(createHandler.create({env: ENV, fetchImpl: net.fetchImpl}), {body: request({payment: brickCard()})});
  const real = mp.summarizeOrder(net.orders.get(made.json().id));
  const summary = {...real, notes: '<script>alert(1)</script> "oi" & mais', customer: {...real.customer, name: '<img src=x onerror=alert(1)> Lima'}};
  for (const lang of ['pt-BR', 'en', 'es']) {
    const mail = renderCustomerEmail({summary: {...summary, lang}, lang, test: true, assetUrl: SITE});
    assert(mail.subject.startsWith('[TESTE] ') && mail.subject.includes(summary.reference)); assert(mail.html.includes('lang="' + lang + '"'));
    assert(!/<script|<img src=x/i.test(mail.html), lang + ': customer text is escaped'); assert(mail.html.includes('&lt;script&gt;'));
    assert(mail.html.includes(summary.reference) && mail.html.includes('src="https://site.test/assets/logo-ju-email.png"'));
    assert(mail.text.includes(summary.reference), lang + ': plain-text part');
  }
  assert.notEqual(renderCustomerEmail({summary, lang: 'en', assetUrl: SITE}).subject, renderCustomerEmail({summary, lang: 'es', assetUrl: SITE}).subject, 'each language has its own subject');
  assert(!renderCustomerEmail({summary, lang: 'en', test: false, assetUrl: SITE}).html.includes('TEST ENVIRONMENT'), 'no test banner for real orders');
  assert(renderCustomerEmail({summary, lang: 'xx', assetUrl: SITE}).subject.includes('Pagamento confirmado'), 'an unknown language falls back to Portuguese');
  const owner = renderOwnerEmail({summary, test: false, assetUrl: SITE});
  assert(!owner.subject.includes('[TESTE]') && owner.subject.includes('R$') && !/<script|<img src=x/i.test(owner.html));
  assert(owner.html.includes('wa.me/5531999991234'));
}

// ── browser module: configuration, messages, safe values ──────────────
{
  const client = await site('live-payment.js');
  const cfg = (response, options) => client.loadPaymentConfig({fetchImpl: async () => response, ...options});
  assert.deepEqual(await cfg({ok: true, json: async () => ({mode: 'test', publicKey: 'TEST-abc'})}), {mode: 'test', publicKey: 'TEST-abc'});
  assert.deepEqual(await cfg({ok: true, json: async () => ({mode: 'live', publicKey: 'APP_USR-x', token: 'must-not-leak'})}), {mode: 'live', publicKey: 'APP_USR-x'}, 'only mode and the public key are kept');
  for (const bad of [{ok: false}, {ok: true, json: async () => ({mode: 'off'})}, {ok: true, json: async () => ({mode: 'test'})}, {ok: true, json: async () => ({mode: 'weird', publicKey: 'k'})}, {ok: true, json: async () => ({mode: 'test', publicKey: 42})}, {ok: true, json: async () => { throw new Error('not json'); }}]) assert.deepEqual(await cfg(bad), {mode: 'off'}, 'anything unexpected keeps the demo');
  assert.deepEqual(await client.loadPaymentConfig({fetchImpl: async () => { throw new Error('offline'); }}), {mode: 'off'}, 'offline / no API (static hosting) keeps the demo');
  assert.deepEqual(await client.loadPaymentConfig({timeout: 30, fetchImpl: (url, {signal}) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))}), {mode: 'off'}, 'a hanging API cannot freeze the checkout');
  assert(/^[A-Za-z0-9-]{16,64}$/.test(client.newAttempt()), 'attempt ids satisfy the server rule'); assert.notEqual(client.newAttempt(), client.newAttempt());
  assert.equal(client.brickLocale('pt-BR'), 'pt-BR'); assert.equal(client.brickLocale('en'), 'en-US'); assert.equal(client.brickLocale('es'), 'es-AR'); assert.equal(client.brickLocale('xx'), 'pt-BR');
  const said = (status, data) => client.paymentMessage(status, data);
  assert(/entrega/.test(said(400, {error: 'invalid_request', field: 'cep'}))); assert(/cartão/.test(said(400, {error: 'invalid_card'}))); assert(/Muitas tentativas/.test(said(429, {error: 'too_many_requests'}))); assert(/não foi aceito/.test(said(422, {error: 'payment_rejected'})));
  assert(/Se tiver certeza de que não houve cobrança/.test(said(502, {error: 'provider_unavailable'})) && /Se tiver certeza/.test(said(0, null)), 'an unclear outcome never promises that nothing was charged');
  assert.equal(client.safeBase64('iVBORw0KGgo='), 'iVBORw0KGgo='); for (const hostile of ['"><script>', 'a b', 'data:x', '', null, undefined, 'x'.repeat(30000)]) assert.equal(client.safeBase64(hostile), '', 'only clean base64 reaches the page');
  assert.equal(client.parseExpiry('2030-01-01T10:00:00.000-03:00', 0), Date.parse('2030-01-01T13:00:00.000Z')); assert.equal(client.parseExpiry('yesterday', 1000), 1000 + 3600000); assert.equal(client.parseExpiry('2000-01-01T00:00:00Z', 5e12), 5e12 + 3600000, 'a date in the past falls back to one hour'); assert.equal(client.parseExpiry(null, 0), 3600000);
}

console.log('PASS: server catalog equals the storefront (products, prices, colors, translations); prices are recomputed on the server; Production needs an explicit MP_MODE (test or live); Brick data maps to Orders API payloads (Pix and card); order state vocabulary; webhook signature (valid, tampered, wrong secret, missing parts); create/status/webhook handlers with a fake Mercado Pago and Resend (origin, validation, idempotency, rate limits, no secrets or card tokens leaked, error mapping, e-mail retries); owner and customer e-mails in three languages, escaped.');
