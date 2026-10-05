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
const {createMemoryStore} = require('../api/_lib/store-memory');
const {createAccounts} = require('../api/_lib/accounts');
const {createOrders} = require('../api/_lib/orders');
const {decrypt, maskCpf} = require('../api/_lib/fields');
const {TERMS_VERSION} = require('../api/_lib/legal');
const configHandler = require('../api/payments/config'), createHandler = require('../api/payments/create'), statusHandler = require('../api/payments/status'), webhookHandler = require('../api/payments/webhook'), health = require('../api/health');
const site = f => import(pathToFileURL(path.join(root, 'dist', f)).href);
const {PRODUCTS: SITE_PRODUCTS, PALETTE} = await site('products.js');
const {COMMERCE} = await site('commerce-config.js');
const {translations} = await site('translations.js');

const SITE = 'https://site.test';
const ENV = {SITE_URL: SITE, RESEND_API_KEY: 're_test_key_123', MAIL_FROM: 'Ju <pedidos@site.test>', MP_ACCESS_TOKEN: 'TEST-secret-token-000', MP_PUBLIC_KEY: 'TEST-public-key-111', MP_WEBHOOK_SECRET: 'whsec-test-222', ORDER_NOTIFY_EMAIL: 'Ju@Site.Test', VERCEL_ENV: 'preview'};
const SECRETS = [ENV.MP_ACCESS_TOKEN, ENV.MP_WEBHOOK_SECRET, ENV.RESEND_API_KEY];
// Real money: Production, MP_MODE=live, and the data keys that production requires (test values here).
const LIVE = {...ENV, VERCEL_ENV: 'production', MP_MODE: 'live', DATA_KEY: Buffer.alloc(32, 1).toString('base64'), INDEX_KEY: Buffer.alloc(32, 2).toString('base64')};
const ITEMS = [{productId: 'borboletoscopio', quantity: 2, selection: {body: 'pink', details: 'lilac'}}, {productId: 'aviaoscopia', quantity: 1, selection: {body: 'black'}}];
const CUSTOMER = {name: 'Ana Souza Lima', email: 'Ana@Example.com', phone: '(31) 99999-1234'};
const ADDRESS = {cep: '30140-071', street: 'Rua da Bahia', number: '1200', district: 'Centro', city: 'Belo Horizonte', state: 'mg', complement: 'Sala 4'};
const BRICK_PIX = {selectedPaymentMethod: 'bank_transfer', formData: {payment_method_id: 'pix', payer: {email: 'ana@example.com'}}};
const brickCard = (token = 'APRO' + 'a'.repeat(28), extra = {}) => ({selectedPaymentMethod: 'credit_card', formData: {token, payment_method_id: 'master', installments: 3, issuer_id: '24', payer: {email: 'ana@example.com', identification: {type: 'CPF', number: '123.456.789-09'}}, ...extra}});
const request = (over = {}) => ({attempt: crypto.randomUUID(), items: ITEMS, customer: CUSTOMER, address: ADDRESS, notes: 'Escrever "Ana" na base', lang: 'en', acceptTerms: true, payment: BRICK_PIX, ...over});

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
    if (String(url).startsWith('https://viacep.com.br/ws/')) {   // CEP lookup before charging
      const cep = String(url).match(/ws\/(\d{8})\//)[1];
      return reply(200, {'30140071': {cep: '30140-071', localidade: 'Belo Horizonte', uf: 'MG', ibge: '3106200'}, '01310100': {cep: '01310-100', localidade: 'São Paulo', uf: 'SP', ibge: '3550308'}}[cep] || {erro: true});
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
// The checkout and the status check answer before the paid e-mails go out: they hand that work to waitUntil, and the
// tests wait for it (settled) before looking at the mailbox.
const background = [], waitUntil = work => { background.push(work); }, settled = () => Promise.all(background.splice(0));

// ── catalog: server copy must equal the storefront ────────────────────
{
  assert.deepEqual(Object.keys(catalog.PRODUCTS).sort(), Object.keys(SITE_PRODUCTS).sort(), 'same products');
  assert.equal(catalog.SHIPPING_CENTS, COMMERCE.shippingCents, 'same delivery fee');
  assert.equal(catalog.PIX_DISCOUNT_BPS, COMMERCE.pixDiscountBps, 'same Pix discount on the server and in the shop');
  assert.equal(catalog.PIX_DISCOUNT_BPS, 500, 'Pix pays 5% less');
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
  // Hostinger (server.cjs): the same rule through APP_ENV.
  const {VERCEL_ENV, ...hostinger} = ENV;
  assert.equal(mp.settings({...hostinger, APP_ENV: 'preview'}).mode, 'test', 'Hostinger test site: test credentials work');
  assert.equal(mp.settings({...hostinger, APP_ENV: 'production'}).mode, 'off', 'Hostinger production needs a deliberate MP_MODE');
  assert.equal(mp.settings({...hostinger, APP_ENV: 'production', MP_MODE: 'test'}).mode, 'test');
  assert.equal(mp.settings(ENV).ownerEmail, 'ju@site.test');
  const res = makeRes(); configHandler.create({env: ENV})({method: 'GET'}, res);
  assert.deepEqual(res.json(), {mode: 'test', publicKey: 'TEST-public-key-111'}); assert(!res.body.includes('secret-token') && !res.body.includes('whsec'));
  const off = makeRes(); configHandler.create({env: {}})({method: 'GET'}, off); assert.deepEqual(off.json(), {mode: 'off'});
  const blocked = makeRes(); configHandler.create({env: {...ENV, VERCEL_ENV: 'production'}})({method: 'GET'}, blocked); assert.deepEqual(blocked.json(), {mode: 'off'}, 'the public key is not even exposed while blocked');
  const post = makeRes(); configHandler.create({env: ENV})({method: 'POST'}, post); assert.equal(post.statusCode, 405);
  const h = makeRes(); await health.create({env: ENV})({}, h);
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
{
  // Pix discount: per unit, on the pieces only; card keeps the list price.
  const pix = catalog.applyPixDiscount(priced);
  assert.deepEqual(pix.lines.map(l => [l.unitCents, l.chargeUnitCents]), [[12900, 12255], [15900, 15105]]);
  assert.equal(pix.subtotal, priced.subtotal, 'the subtotal keeps the list price'); assert.equal(pix.discount, 2085); assert.equal(pix.shipping, 1800);
  assert.equal(pix.total, 41415); assert.equal(priced.total, 43500, 'the priced order itself is not changed');
  for (const [id, cents] of [['borboletoscopio', 645], ['dinossauroscopio', 695], ['aviaoscopia', 795]]) assert.equal(catalog.pixUnitDiscount(catalog.PRODUCTS[id].price), cents, id);
  const free = catalog.applyPixDiscount({...priced, shipping: 0, total: priced.subtotal});
  assert.equal(free.total, 41700 - 2085, 'with free delivery the total is only the discounted pieces');
  const payload = mp.buildOrderPayload({priced: pix, reference: 'JU-PIX', customer: {name: 'Ana Souza', email: 'ana@example.com', phone: '31999991234'}, address: {cep: '30140071', street: 's', number: '1', district: 'd', city: 'c', state: 'MG'}, notes: '', lang: 'pt-BR', payment: {methodId: 'pix', type: 'bank_transfer'}});
  assert.equal(payload.total_amount, '414.15');
  assert.equal(payload.items.reduce((sum, i) => sum + Math.round(Number(i.unit_price) * 100) * i.quantity, 0), 41415, 'items add up to the discounted total');
}
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

// ── helpers: a database (memory store) with signed-in buyers ─────────────
// A valid CPF that no other test account uses (the database keeps one account per CPF).
function randomCpf() {
  const d = Array.from({length: 9}, () => crypto.randomInt(0, 10));
  for (const size of [9, 10]) { const sum = d.slice(0, size).reduce((acc, n, i) => acc + n * (size + 1 - i), 0); d.push((sum * 10) % 11 % 10); }
  return d.join('');
}
// A buyer with a verified account and, unless profile is false, the identification filled in. The session is opened
// directly in the store (as a sign-in would) to keep the tests fast.
async function signedInBuyer(store, {email = 'ana@example.com', profile = true, env = ENV} = {}) {
  const id = crypto.randomUUID(), cpf = randomCpf(), token = crypto.randomBytes(32).toString('base64url');
  await store.customers.create({id, email, emailVerifiedAt: new Date(), displayName: 'Ana'});
  if (profile) await createAccounts({store, env}).updateProfile(await store.customers.findById(id), {firstName: 'Ana', lastName: 'Souza Lima', cpf, phone: '(31) 98888-7777'});
  await store.sessions.create({tokenHash: crypto.createHash('sha256').update(token).digest(), customerId: id, expiresAt: new Date(Date.now() + 86400000)});
  return {id, cpf, cookie: `__Host-ju_session=${token}`};
}
const as = buyer => ({headers: {cookie: buyer.cookie}});

// ── POST /api/payments/create ─────────────────────────────────────────
{
  const net = fakeNetwork(), clock = {t: 1_700_000_000_000}, store = createMemoryStore();
  const handler = createHandler.create({waitUntil, env: ENV, fetchImpl: net.fetchImpl, now: () => clock.t, store});
  const ana = await signedInBuyer(store);
  const errors = spyErrors();
  try {
    assert.equal((await call(handler, {method: 'GET'})).statusCode, 405);
    assert.equal((await call(handler, {origin: '', body: request(), ...as(ana)})).statusCode, 403, 'no Origin'); assert.equal((await call(handler, {origin: 'https://evil.example', body: request(), ...as(ana)})).statusCode, 403, 'foreign Origin');
    assert.equal((await call(createHandler.create({waitUntil, env: {SITE_URL: SITE}, fetchImpl: net.fetchImpl, store}), {body: request(), ...as(ana)})).statusCode, 503, 'no keys → the checkout falls back to the demo');
    assert.equal((await call(createHandler.create({waitUntil, env: {...ENV, VERCEL_ENV: 'production'}, fetchImpl: net.fetchImpl, store}), {body: request(), ...as(ana)})).statusCode, 503, 'Production without MP_MODE refuses');
    assert.equal((await call(handler, {body: request()})).statusCode, 401, 'buying needs an account');
    const incomplete = await signedInBuyer(store, {email: 'sem-dados@example.com', profile: false});
    assert.equal((await call(handler, {body: request(), ...as(incomplete)})).json().error, 'profile_incomplete', 'and the identification (invoice and label)');
    assert.equal(net.mpCalls.length, 0, 'nothing reached Mercado Pago so far');
    const badField = async (mutate, field, status = 400) => { const res = await call(handler, {ip: '198.51.100.' + Math.floor(Math.random() * 200), body: mutate(request()), ...as(ana)}); assert.equal(res.statusCode, status, field); assert.equal(res.json().field ?? res.json().error, field); };
    await badField(b => ({...b, attempt: 'short'}), 'attempt'); await badField(b => ({...b, attempt: undefined}), 'attempt');
    await badField(b => ({...b, customer: {...CUSTOMER, name: ' '}}), 'name'); await badField(b => ({...b, customer: {...CUSTOMER, email: 'not-an-email'}}), 'email'); await badField(b => ({...b, customer: {...CUSTOMER, email: 'a@b.co\nBcc: x@y.zz'}}), 'email');
    await badField(b => ({...b, customer: {...CUSTOMER, phone: '123'}}), 'phone'); await badField(b => ({...b, address: {...ADDRESS, cep: '123'}}), 'cep'); await badField(b => ({...b, address: {...ADDRESS, street: ''}}), 'street'); await badField(b => ({...b, address: {...ADDRESS, state: 'XX'}}), 'state'); await badField(b => ({...b, address: {...ADDRESS, city: '   '}}), 'city');
    await badField(b => ({...b, acceptTerms: undefined}), 'terms'); await badField(b => ({...b, acceptTerms: 'true'}), 'terms');   // the checkout box, required and exactly true
    await badField(b => ({...b, address: {...ADDRESS, cep: '99999-999'}}), 'cep');   // a CEP that does not exist
    const otherState = await call(handler, {ip: '198.51.100.250', body: request({address: {...ADDRESS, cep: '01310-100'}}), ...as(ana)});
    assert.equal(otherState.json().field, 'state'); assert.equal(otherState.json().expected, 'SP', 'a CEP of another state is sent back before charging');
    await badField(b => ({...b, items: []}), 'invalid_items'); await badField(b => ({...b, items: [{productId: 'nao-existe', quantity: 1}]}), 'invalid_items');
    await badField(b => ({...b, payment: {selectedPaymentMethod: 'ticket', formData: {payment_method_id: 'bolbradesco'}}}), 'unsupported_method'); await badField(b => ({...b, payment: brickCard('short')}), 'invalid_card');
    assert.equal((await call(handler, {body: 'not json', ...as(ana)})).statusCode, 400);
    assert.equal(net.mpCalls.length, 0, 'invalid requests never reach Mercado Pago');
    assert.equal((await store.orders.list()).length, 0, 'nor create orders');

    const body = request({items: [{...ITEMS[0], unitPrice: 1, price: 1, unitCents: 1, total: 1}, ITEMS[1]], total: 1, amount: '0.01'});
    const ok = await call(handler, {body, ...as(ana)});
    assert.equal(ok.statusCode, 201); assert.equal(ok.headers['cache-control'], 'no-store');
    const answer = ok.json();
    assert.equal(answer.state, 'pending_pix'); assert.equal(answer.pix.qrCode, '000201PIXCODE'); assert.equal(answer.mode, 'test'); assert.equal(answer.reference, mp.referenceFor(body.attempt)); assert.match(answer.id, /^ORD01TEST/);
    const sent = net.mpCalls.at(-1);
    assert.equal(sent.method, 'POST'); assert.equal(sent.url, 'https://api.mercadopago.com/v1/orders');
    assert.equal(sent.headers.Authorization, `Bearer ${ENV.MP_ACCESS_TOKEN}`); assert.equal(sent.headers['X-Idempotency-Key'], body.attempt);
    assert.equal(sent.body.total_amount, '414.15', 'the total was recomputed on the server, not taken from the browser (Pix: 5% off the pieces, 417.00 − 20.85 + 18.00 delivery)');
    assert.deepEqual(sent.body.items.map(i => [i.external_code, i.unit_price, i.quantity]), [['borboletoscopio', '122.55', 2], ['aviaoscopia', '151.05', 1], ['shipping', '18.00', 1]], 'Pix items carry the discounted unit price; delivery is not discounted');
    assert.equal(sent.body.items.reduce((sum, i) => sum + Math.round(Number(i.unit_price) * 100) * i.quantity, 0), 41415, 'the items add up to the Pix total');
    assert.equal(sent.body.payer.email, 'ana@example.com', 'the payer is the account'); assert.equal(sent.body.payer.first_name, 'Ana'); assert.equal(sent.body.payer.last_name, 'Souza Lima');
    assert.deepEqual(sent.body.payer.identification, {type: 'CPF', number: ana.cpf}, 'Pix carries the CPF from the identification (better approval and fraud checks)');
    assert.equal(sent.body.shipment.address.state, 'MG'); assert.equal(sent.body.shipment.address.zip_code, '30140071');
    for (const secret of SECRETS) assert(!ok.body.includes(secret), 'no secret in the answer');
    assert(!ok.body.includes(ana.cpf), 'the CPF is not echoed back');

    // The order is in our database before and after Mercado Pago answers.
    const saved = await store.orders.findByReference(answer.reference);
    assert.equal(saved.customerId, ana.id); assert.equal(saved.status, 'aguardando_pagamento'); assert.equal(saved.paymentState, 'pending_pix'); assert.equal(saved.mpOrderId, answer.id); assert.equal(saved.method, 'pix');
    assert.equal(saved.subtotalCents, 41700, 'the subtotal stays at list price'); assert.equal(saved.totalCents, 41415, 'the total is what Pix charges'); assert.deepEqual(saved.items.map(i => [i.productId, i.quantity, i.unitCents]), [['borboletoscopio', 2, 12900], ['aviaoscopia', 1, 15900]]);
    assert.deepEqual(saved.items[0].selection, {body: 'pink', details: 'lilac'}, 'the colors of each part are recorded');
    assert.equal(saved.shipTo.recipient, 'Ana Souza Lima'); assert.equal(saved.buyer.name, 'Ana Souza Lima'); assert.equal(saved.buyer.email, 'ana@example.com');
    assert.equal(saved.termsVersion, TERMS_VERSION, 'the order records which Termos the buyer accepted'); assert.ok(saved.termsAcceptedAt);
    assert.equal(decrypt(ENV, saved.phoneEnc), '31999991234'); assert.equal(decrypt(ENV, saved.buyerDocEnc), ana.cpf, 'CPF and phone are encrypted in the order too');

    const again = await call(handler, {body, ...as(ana)});
    assert.equal(again.json().id, answer.id, 'the same attempt id returns the same order (a double click cannot charge twice)');
    assert.equal((await store.orders.list()).filter(o => o.reference === answer.reference).length, 1, 'and one order in the database');
    const bia = await signedInBuyer(store, {email: 'bia@example.com'});
    assert.equal((await call(handler, {body, ...as(bia)})).statusCode, 409, "another buyer cannot take over someone else's attempt");

    const cepDown = await call(createHandler.create({waitUntil, env: ENV, fetchImpl: net.fetchImpl, now: () => clock.t, store, lookup: async () => { throw new Error('ViaCEP 503'); }}), {body: request(), ...as(bia)});
    assert.equal(cepDown.statusCode, 201, 'the CEP service down never blocks a sale');
    const card = await call(handler, {body: request({payment: brickCard()}), ...as(ana)});
    assert.equal(card.statusCode, 201); assert.equal(card.json().state, 'approved'); assert.equal(card.json().method.installments, 3);
    const paidOrder = await store.orders.findByReference(card.json().reference);
    await settled(); assert.equal(paidOrder.status, 'pendente', 'an approved card is a paid order for Ju right away'); assert.ok(paidOrder.paidAt); assert.equal(paidOrder.installments, 3);
    assert.deepEqual(net.mails.map(m => m.to[0]).sort(), ['ana@example.com', 'ju@site.test'], 'and Ju and the buyer are told at once');
    assert.equal(net.mails.find(m => m.to[0] === 'ju@site.test').headers['Idempotency-Key'], `order-owner-${paidOrder.id}`);
    const notified = await store.orders.findById(paidOrder.id); assert.ok(notified.ownerNotifiedAt && notified.customerNotifiedAt);
    const cardCall = net.mpCalls.at(-1).body.transactions.payments[0];
    assert.equal(cardCall.payment_method.installments, 3); assert.equal(cardCall.payment_method.token.length, 32); assert(!card.body.includes('aaaaaaaa'), 'the card token stays on the server');
    assert.deepEqual(net.mpCalls.at(-1).body.payer.identification, {type: 'CPF', number: '12345678909'}, 'the card holder CPF typed in the Brick wins');
    const debit = await call(handler, {body: request({payment: {selectedPaymentMethod: 'debit_card', formData: {token: 'APRO' + 'd'.repeat(28), payment_method_id: 'debelo', installments: 1, payer: {email: 'ana@example.com'}}}}), ...as(ana)});
    assert.equal((await store.orders.findByReference(debit.json().reference)).method, 'debit', 'debit is recorded as debit (e-mails and panel say "débito")');
    const refused = await call(handler, {body: request({payment: brickCard('REJE' + 'r'.repeat(28))}), ...as(ana)});
    assert.equal(refused.json().state, 'refused'); assert.equal((await store.orders.findByReference(refused.json().reference)).status, 'cancelado');
    assert(!errors.lines.join('\n').includes('aaaaaaaa'), 'the card token is never logged');

    const refusedBody = request(), refuse = await call(createHandler.create({waitUntil, env: ENV, fetchImpl: fakeNetwork({mpStatus: 422}).fetchImpl, store}), {body: refusedBody, ...as(ana)});
    assert.equal(refuse.statusCode, 422); assert.equal(refuse.json().error, 'payment_rejected'); assert.equal(refuse.json().code, 'invalid_payer'); assert(refuse.json().detail, 'test mode shows Mercado Pago\'s reason');
    assert.equal((await store.orders.findByReference(mp.referenceFor(refusedBody.attempt))).status, 'cancelado', 'a refused card ends the attempt instead of "waiting for payment"');
    const declinedBody = request(), declined = await call(createHandler.create({waitUntil, env: ENV, fetchImpl: fakeNetwork({mpStatus: 402}).fetchImpl, store}), {body: declinedBody, ...as(ana)});
    assert.equal(declined.statusCode, 422, 'Mercado Pago 402 ("the following transactions failed") is a refusal');
    assert.equal((await store.orders.findByReference(mp.referenceFor(declinedBody.attempt))).status, 'cancelado');
    const caio = await signedInBuyer(store, {email: 'caio@example.com'}), openBody = request();
    assert.equal((await call(createHandler.create({waitUntil, env: ENV, fetchImpl: fakeNetwork({mpStatus: 500}).fetchImpl, store}), {body: openBody, ...as(caio)})).statusCode, 502);
    assert.equal((await store.orders.findByReference(mp.referenceFor(openBody.attempt))).status, 'aguardando_pagamento', 'a provider error leaves the order open: the charge may have gone through');
    const liveStore = createMemoryStore(), liveAna = await signedInBuyer(liveStore, {env: LIVE});
    const live = await call(createHandler.create({waitUntil, env: LIVE, fetchImpl: fakeNetwork({mpStatus: 422}).fetchImpl, store: liveStore}), {body: request(), ...as(liveAna)});
    assert.equal(live.statusCode, 422); assert(!('detail' in live.json()), 'live mode never leaks the provider message (it can quote the customer\'s data)');
    for (const status of [401, 403, 404, 424, 429, 500, 503]) { const res = await call(createHandler.create({waitUntil, env: ENV, fetchImpl: fakeNetwork({mpStatus: status}).fetchImpl, store}), {body: request(), ...as(bia)}); assert.equal(res.statusCode, 502, `MP ${status} → 502`); assert.equal(res.json().error, 'provider_unavailable'); }
    assert.equal((await call(createHandler.create({waitUntil, env: ENV, fetchImpl: async () => { throw new Error('socket hang up'); }, store}), {body: request(), ...as(bia)})).statusCode, 502, 'a network failure is reported as 502');

    // rate limits, kept in the database: 8 per account and 20 per IP in ten minutes
    const limitStore = createMemoryStore(), limited = createHandler.create({waitUntil, env: ENV, fetchImpl: fakeNetwork().fetchImpl, now: () => clock.t, store: limitStore});
    const same = await signedInBuyer(limitStore, {email: 'same@example.com'});
    for (let i = 0; i < 8; i++) assert.equal((await call(limited, {ip: `192.0.2.${i}`, body: request(), ...as(same)})).statusCode, 201);
    const ninth = await call(limited, {ip: '192.0.2.99', body: request(), ...as(same)});
    assert.equal(ninth.statusCode, 429); assert(Number(ninth.headers['retry-after']) > 0);
    for (let i = 0; i < 20; i++) await call(limited, {ip: '192.0.2.200', body: request(), ...as(await signedInBuyer(limitStore, {email: `n${i}@example.com`}))});
    assert.equal((await call(limited, {ip: '192.0.2.200', body: request(), ...as(await signedInBuyer(limitStore, {email: 'fresh@example.com'}))})).statusCode, 429, 'per IP');
  } finally { errors.restore(); }
}

// ── test environment that only accepts Mercado Pago's own buyer address ─
{
  const net = fakeNetwork({testEmailOnly: true}), errors = spyErrors(), store = createMemoryStore();
  try {
    const buyer = await signedInBuyer(store, {email: 'real.customer@example.com'});
    const handler = createHandler.create({waitUntil, env: ENV, fetchImpl: net.fetchImpl, store});
    const ok = await call(handler, {body: request({payment: brickCard()}), ...as(buyer)});
    assert.equal(ok.statusCode, 201, 'the second try with the test address succeeds'); assert.equal(ok.json().state, 'approved');
    const posts = net.mpCalls.filter(c => c.method === 'POST');
    assert.equal(posts.length, 2); assert.equal(posts[0].body.payer.email, 'real.customer@example.com'); assert.equal(posts[1].body.payer.email, 'test@testuser.com');
    assert(posts[1].headers['X-Idempotency-Key'].endsWith('-t') && posts[1].headers['X-Idempotency-Key'] !== posts[0].headers['X-Idempotency-Key'], 'the retry is a new request for Mercado Pago');
    await settled(); assert.deepEqual(net.mails.map(m => m.to[0]).sort(), ['ju@site.test', 'real.customer@example.com'], 'the receipt goes to the real customer (from our order), not to the test address');
    const liveStore = createMemoryStore(), liveBuyer = await signedInBuyer(liveStore, {email: 'someone@example.com', env: LIVE});
    const live = createHandler.create({waitUntil, env: LIVE, fetchImpl: fakeNetwork({testEmailOnly: true}).fetchImpl, store: liveStore});
    const before = net.mpCalls.length; const refused = await call(live, {body: request({payment: brickCard()}), ...as(liveBuyer)});
    assert.equal(refused.statusCode, 422, 'in live mode the address is never swapped'); assert.equal(net.mpCalls.length, before);
  } finally { errors.restore(); }
  assert.equal(mp.isTestEmailRejection({code: 2198}), true); assert.equal(mp.isTestEmailRejection({code: '2198'}), true); assert.equal(mp.isTestEmailRejection({message: 'Invalid test user email'}), true); assert.equal(mp.isTestEmailRejection({code: 4050, message: 'Payer.email must be a valid email'}), false);
}

// ── GET /api/payments/status ──────────────────────────────────────────
{
  const net = fakeNetwork(), store = createMemoryStore(), ana = await signedInBuyer(store), bia = await signedInBuyer(store, {email: 'bia@example.com'});
  const created = await call(createHandler.create({waitUntil, env: ENV, fetchImpl: net.fetchImpl, store}), {body: request(), ...as(ana)});
  const {id, reference} = created.json(), handler = statusHandler.create({waitUntil, env: ENV, fetchImpl: net.fetchImpl, store});
  const get = (query, buyer = ana, opts = {}) => call(handler, {method: 'GET', origin: '', url: '/api/payments/status' + query, ...(buyer ? as(buyer) : {}), ...opts});
  const waiting = await get('?id=' + id); assert.equal(waiting.statusCode, 200); assert.equal(waiting.json().state, 'pending_pix'); assert.deepEqual(Object.keys(waiting.json()).sort(), ['expiresAt', 'reference', 'state', 'statusDetail'], 'only the state is exposed');
  assert.equal((await get('?id=' + id, null)).statusCode, 401, 'needs the session');
  assert.equal((await get('?id=' + id, bia)).statusCode, 404, "another buyer's order does not exist for her");
  assert.equal(net.mails.length, 0);
  net.pay(id); assert.equal((await get('?id=' + id)).json().state, 'approved'); await settled();
  const order = await store.orders.findByReference(reference);
  assert.equal(order.status, 'pendente', 'a status check records the payment even without a webhook');
  assert.deepEqual(net.mails.map(m => m.to[0]).sort(), ['ana@example.com', 'ju@site.test'], 'and tells Ju and the buyer');
  await get('?id=' + id); await settled(); assert.equal(net.mails.length, 2, 'once');
  assert.equal((await get('')).statusCode, 400); assert.equal((await get('?id=../../secret')).statusCode, 400); assert.equal((await get('?id=short')).statusCode, 400);
  assert.equal((await get('?id=ORD01DOESNOTEXIST999')).statusCode, 404);
  assert.equal((await call(handler, {method: 'POST', origin: ''})).statusCode, 405);
  assert.equal((await call(statusHandler.create({waitUntil, env: {}, fetchImpl: net.fetchImpl, store}), {method: 'GET', origin: '', url: '/x?id=' + id, ...as(ana)})).statusCode, 503);
  const errors = spyErrors(); try { assert.equal((await call(statusHandler.create({waitUntil, env: ENV, fetchImpl: fakeNetwork({mpStatus: 500}).fetchImpl, store}), {method: 'GET', origin: '', url: '/x?id=' + id, ...as(ana)})).statusCode, 502); } finally { errors.restore(); }
  let t = 0; const flood = statusHandler.create({waitUntil, env: ENV, fetchImpl: net.fetchImpl, now: () => t, store});
  for (let i = 0; i < 200; i++) await call(flood, {method: 'GET', origin: '', url: '/x?id=' + id, ...as(ana)});
  assert.equal((await call(flood, {method: 'GET', origin: '', url: '/x?id=' + id, ...as(ana)})).statusCode, 429);
}

// ── status check while a Pix waits: the answer never waits for Resend, and polling writes nothing ──
{
  const net = fakeNetwork(), store = createMemoryStore(), ana = await signedInBuyer(store);
  let release; const resendGate = new Promise(r => { release = r; });
  const slowMail = async (url, init) => { if (String(url).startsWith('https://api.resend.com')) await resendGate; return net.fetchImpl(url, init); };
  const created = await call(createHandler.create({waitUntil, env: ENV, fetchImpl: net.fetchImpl, store}), {body: request(), ...as(ana)});
  const {id, reference} = created.json(), pending = [];
  const handler = statusHandler.create({env: ENV, fetchImpl: slowMail, store, waitUntil: work => pending.push(work)});
  const get = () => call(handler, {method: 'GET', origin: '', url: '/api/payments/status?id=' + id, ...as(ana)});

  const writes = {transition: 0, update: 0, findById: 0}, real = {...store.orders};
  for (const name of Object.keys(writes)) store.orders[name] = (...args) => { writes[name]++; return real[name](...args); };
  for (let i = 0; i < 3; i++) assert.equal((await get()).json().state, 'pending_pix');
  assert.deepEqual(writes, {transition: 0, update: 0, findById: 0}, 'a Pix still waiting: no write and no re-read of the order on each check');
  assert.equal((await store.orders.events((await store.orders.findByReference(reference)).id)).filter(e => e.actor === 'status').length, 0, 'nor an event per check');

  net.pay(id);
  const paid = await get();
  assert.equal(paid.statusCode, 200); assert.equal(paid.json().state, 'approved', 'the buyer hears "paid" while the e-mails are still on their way');
  assert.equal(writes.transition, 1, 'the payment itself is one transition'); assert.equal(net.mails.length, 0);
  assert.equal((await store.orders.findByReference(reference)).status, 'pendente', 'the order is already paid when the answer leaves');
  release(); await Promise.all(pending.splice(0));
  assert.deepEqual(net.mails.map(m => m.to[0]).sort(), ['ana@example.com', 'ju@site.test'], 'then Ju and the buyer get their e-mails');
  await get(); await Promise.all(pending.splice(0)); assert.equal(net.mails.length, 2, 'once');
  assert.equal(writes.transition, 1, 'a paid order is not moved again by later checks');

  // A failure in the background (here the database) is logged, never left as an unhandled rejection.
  const broken = createMemoryStore(), bia = await signedInBuyer(broken, {email: 'bia@example.com'});
  const card = (await call(createHandler.create({waitUntil: () => {}, env: ENV, fetchImpl: fakeNetwork().fetchImpl, store: broken}), {body: request({payment: brickCard()}), ...as(bia)})).json();
  const order = await broken.orders.findByMpId(card.id);
  broken.orders.update = async () => { throw Object.assign(new Error('connection lost'), {code: 'PROTOCOL_CONNECTION_LOST'}); };
  const quiet = spyErrors();
  try {
    const sent = await createOrders({store: broken, env: ENV}).notifyPaidLater({...order, ownerNotifiedAt: null, customerNotifiedAt: null}, {fetchImpl: fakeNetwork().fetchImpl});
    assert.deepEqual(sent, {owner: false, customer: false}, 'resolves with nothing marked as sent');
    assert(quiet.lines.some(l => l.includes(order.reference) && l.includes('connection lost')), 'and says which order failed and why');
  } finally { quiet.restore(); }
}

// ── POST /api/payments/webhook ────────────────────────────────────────
{
  const build = async (extra = {}, envOver = {}) => {
    const net = fakeNetwork(extra), store = createMemoryStore(), env = {...ENV, ...envOver}, buyer = await signedInBuyer(store, {env});
    return {net, store, buyer, handler: webhookHandler.create({env, fetchImpl: net.fetchImpl, store}), create: createHandler.create({waitUntil, env, fetchImpl: net.fetchImpl, store})};
  };
  const errors = spyErrors();
  try {
    const {net, store, buyer, handler, create} = await build();
    const card = (await call(create, {body: request({payment: brickCard()}), ...as(buyer)})).json(), pix = (await call(create, {body: request(), ...as(buyer)})).json(); await settled();
    assert.equal(net.mails.length, 2, 'the approved card already told Ju and the buyer');
    assert.equal((await store.orders.findByMpId(card.id)).totalCents, 43500, 'card pays the list price (no Pix discount)');
    assert.equal((await store.orders.findByMpId(pix.id)).totalCents, 41415, 'Pix pays 5% less on the pieces');
    assert(!net.mails.at(-1).html.includes('Pix (5%)'), 'no discount line on a card receipt');
    assert.equal((await call(handler, {method: 'GET', origin: ''})).statusCode, 405);
    assert.equal((await notify(handler, pix.id, {signature: 'ts=1,v1=' + '0'.repeat(64)})).statusCode, 401, 'wrong signature');
    assert.equal((await notify(handler, pix.id, {signature: sign({id: pix.id, secret: 'another-secret'})})).statusCode, 401, 'signed with another secret');
    assert.equal((await call(handler, {origin: '', url: `/x?data.id=${pix.id}`, body: {}})).statusCode, 401, 'no signature at all');
    assert.equal((await notify(handler, pix.id, {signature: sign({id: card.id})})).statusCode, 401, 'a signature for another order');

    const first = await notify(handler, card.id);
    assert.equal(first.statusCode, 200); assert.deepEqual(first.json(), {ok: true, paid: true, sent: {owner: true, customer: true}});
    assert.equal(net.mails.length, 2, 'a notice about an order already recorded as paid sends nothing new');
    const [owner, customer] = [net.mails.find(m => m.to[0] === 'ju@site.test'), net.mails.find(m => m.to[0] === 'ana@example.com')];
    assert(owner.subject.startsWith('[TESTE] Novo pedido pago · JU-')); assert(owner.subject.includes('R$') && owner.subject.includes('435,00'));
    assert(owner.html.includes('Borboletoscópio') && owner.html.includes('Rosa Ju') && owner.html.includes('Lilás') && owner.html.includes('Preto') && owner.html.includes('Aviãoscopia'), 'Ju sees the pieces and the chosen colors');
    assert(owner.html.includes('Rua da Bahia, 1200') && owner.html.includes('30140-071') && owner.html.includes('wa.me/5531999991234') && owner.html.includes('ana@example.com'), 'and where to send it and how to reach the customer');
    assert(owner.html.includes('NOTA FISCAL') && owner.html.includes(`CPF ${maskCpf(buyer.cpf)}`) && !owner.html.includes(buyer.cpf) && !owner.text.includes(buyer.cpf), 'invoice data for Ju, CPF masked (the full number stays in the panel)');
    assert(owner.html.includes(`Pedido no Mercado Pago: ${card.id}`) && card.id.startsWith('ORD'), 'the Mercado Pago order number, not our internal id');
    assert(owner.html.includes('Cartão de crédito · 3x') && owner.html.includes('Escrever &quot;Ana&quot; na base') && owner.html.includes('AMBIENTE DE TESTE'));
    assert(customer.subject.startsWith('[TESTE] Payment confirmed · JU-'), 'the customer gets it in the language they used');
    assert(customer.html.includes('Body') && customer.html.includes('Ju pink') && customer.html.includes('Wing details') && customer.html.includes('Credit card · 3x'));

    const waiting = await notify(handler, pix.id); assert.deepEqual(waiting.json(), {ok: true, paid: false}); assert.equal(net.mails.length, 2, 'an unpaid Pix sends nothing');
    net.pay(pix.id); const bodyOnly = await notify(handler, pix.id, {dataInQuery: false});
    assert.equal(bodyOnly.statusCode, 200, 'the id may also come in the body; the signature still covers it'); assert.equal(net.mails.length, 4); assert(net.mails.at(-2).html.includes('Pix'));
    assert.equal((await store.orders.findByMpId(pix.id)).status, 'pendente');
    await notify(handler, pix.id, {requestId: 'req-456'}); assert.equal(net.mails.length, 4, 'a repeated notice changes nothing');
    const events = await store.orders.events((await store.orders.findByMpId(pix.id)).id);
    assert.deepEqual(events.filter(e => e.kind === 'paid').map(e => e.actor), ['webhook'], 'paid exactly once, by the webhook');

    // Amount tampering: Mercado Pago says a different total → never marked paid.
    const other = (await call(create, {body: request(), ...as(buyer)})).json();
    net.orders.get(other.id).total_amount = '1.00'; net.pay(other.id);
    await notify(handler, other.id);
    const tampered = await store.orders.findByMpId(other.id);
    assert.equal(tampered.status, 'aguardando_pagamento', 'a different amount is not a payment of this order');
    assert((await store.orders.events(tampered.id)).some(e => e.kind === 'payment_mismatch'));

    assert.equal((await notify(handler, 'ORD01DOESNOTEXIST999')).statusCode, 500, 'Mercado Pago cannot find it → 5xx so it retries later');
    assert.equal((await notify(handler, 'x/../y', {signature: sign({id: 'x/../y'})})).json().ignored, 'not_an_order');
    net.orders.get(card.id).external_reference = 'OUTRA-LOJA'; const before = net.mails.length;
    assert.equal((await notify(handler, card.id)).json().ignored, 'not_ours'); assert.equal(net.mails.length, before, 'orders from elsewhere are ignored');
    net.orders.get(card.id).external_reference = 'JU-NAOEXISTE'; assert.equal((await notify(handler, card.id)).json().ignored, 'unknown_order', 'ours by prefix but not in the database');
    for (const text of net.mails.map(m => m.html + m.text)) for (const secret of SECRETS) assert(!text.includes(secret), 'no secret in any e-mail');
  } finally { errors.restore(); }

  // failure handling: the order is saved first, e-mails are retried by later notices
  const quiet = spyErrors();
  try {
    const noSecret = await build({}, {MP_WEBHOOK_SECRET: ''}); assert.equal((await notify(noSecret.handler, 'ORD01ABCDEFGHIJKLM')).statusCode, 503, 'no webhook secret → refuses');
    assert.equal((await call(webhookHandler.create({env: {}, fetchImpl: noSecret.net.fetchImpl}), {origin: '', url: '/x?data.id=ORD01ABCDEFGHIJKLM', body: {}})).statusCode, 503, 'payments off');
    const ownerDown = await build({resendFailFor: 'ju@site.test'}); const paid = (await call(ownerDown.create, {body: request({payment: brickCard()}), ...as(ownerDown.buyer)})).json();
    assert.equal((await ownerDown.store.orders.findByMpId(paid.id)).status, 'pendente', 'the paid order is saved even when the e-mail fails');
    assert.equal((await notify(ownerDown.handler, paid.id)).statusCode, 500, 'Ju\'s e-mail still failing → 500 so Mercado Pago calls again');
    const customerDown = await build({resendFailFor: 'ana@example.com'}); const paid2 = (await call(customerDown.create, {body: request({payment: brickCard()}), ...as(customerDown.buyer)})).json();
    const partial = await notify(customerDown.handler, paid2.id); assert.equal(partial.statusCode, 200, 'the customer\'s copy is best effort'); assert.deepEqual(partial.json().sent, {owner: true, customer: false});
    const noOwner = await build({}, {ORDER_NOTIFY_EMAIL: ''}); const paid3 = (await call(noOwner.create, {body: request({payment: brickCard()}), ...as(noOwner.buyer)})).json();
    const ownerless = await notify(noOwner.handler, paid3.id); assert.equal(ownerless.statusCode, 200); assert.deepEqual(ownerless.json().sent, {owner: false, customer: true}); assert(quiet.lines.some(l => l.includes('ORDER_NOTIFY_EMAIL')), 'says why Ju was not told');
    const noMail = await build({}, {RESEND_API_KEY: ''}); const paid4 = (await call(noMail.create, {body: request({payment: brickCard()}), ...as(noMail.buyer)})).json();
    assert.deepEqual((await notify(noMail.handler, paid4.id)).json(), {ok: true, paid: true, sent: {owner: false, customer: false}}); assert.equal(noMail.net.mails.length, 0);
    const live = await build({}, {...LIVE}); const paid5 = (await call(live.create, {body: request({payment: brickCard()}), ...as(live.buyer)})).json();
    await notify(live.handler, paid5.id); assert(!live.net.mails[0].subject.includes('[TESTE]') && !live.net.mails[0].html.includes('AMBIENTE DE TESTE'), 'live orders are not marked as tests');
  } finally { quiet.restore(); }
}

// ── the e-mails themselves (built from our order) ─────────────────────
{
  const net = fakeNetwork(), store = createMemoryStore(), buyer = await signedInBuyer(store);
  const made = await call(createHandler.create({waitUntil, env: ENV, fetchImpl: net.fetchImpl, store}), {body: request({payment: brickCard()}), ...as(buyer)});
  const real = createOrders({store, env: ENV}).summary(await store.orders.findByMpId(made.json().id));
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
  const discounted = {...summary, discount: 2085, total: summary.total - 2085};
  for (const [lang, word] of [['pt-BR', 'Desconto no Pix (5%)'], ['en', 'Pix discount (5%)'], ['es', 'Descuento por Pix (5%)']]) {
    const mail = renderCustomerEmail({summary: discounted, lang, assetUrl: SITE});
    assert(mail.html.includes(word) && mail.text.includes(word), `${lang}: the receipt shows the Pix discount`);
  }
  assert(renderOwnerEmail({summary: discounted, assetUrl: SITE}).text.includes('Desconto no Pix (5%): − R$'), 'Ju sees the discount too');
  assert(!renderCustomerEmail({summary, lang: 'pt-BR', assetUrl: SITE}).html.includes('Desconto no Pix'), 'no discount line without a discount');
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

console.log('PASS: server catalog equals the storefront (products, prices, colors, translations); prices are recomputed on the server; Production needs an explicit MP_MODE (test or live); Brick data maps to Orders API payloads (Pix and card); order state vocabulary; webhook signature (valid, tampered, wrong secret, missing parts); create/status/webhook handlers with a fake Mercado Pago and Resend (signed-in buyer with identification, orders recorded in the database, paid once and e-mailed once, amount mismatch refused, status only for the owner, origin, validation, idempotency, rate limits, no secrets or card tokens leaked, error mapping, e-mail retries); owner and customer e-mails in three languages, escaped.');
