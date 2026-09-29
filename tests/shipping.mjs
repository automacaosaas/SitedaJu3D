// Real shipping (Correios contract): the pieces (money parsing, package rules, boxes → volumes), the quote engine against the
// Correios simulator (prices, delivery times, cache, token renewal, services missing from the contract, invalid or unserved
// CEPs, outages, free shipping, label fee), POST /api/shipping/quote, and the payment (POST /api/payments/create) where the
// server prices the delivery itself and accepts only the option the buyer saw.
// Run: node tests/shipping.mjs — no network, no keys.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const {createFakeCorreios, EXAMPLE_CONFIG} = require('../tools/fake-correios.cjs');
const {createFakeMercadoPago} = require('../tools/fake-mercadopago.cjs');
const {parseMoney, boxParams, settings: correiosSettings} = require('../api/_lib/correios');
const {createShipping, forEnv, missing, volumesFor, publicOption} = require('../api/_lib/shipping');
const baseConfig = require('../api/_lib/shipping-config');
const quoteHandler = require('../api/shipping/quote'), createHandler = require('../api/payments/create'), health = require('../api/health');
const {createMemoryStore} = require('../api/_lib/store-memory');
const {createAccounts} = require('../api/_lib/accounts');
const {createOrders} = require('../api/_lib/orders');
const {decrypt} = require('../api/_lib/fields');
const site = f => import(pathToFileURL(path.join(root, 'dist', f)).href);

const SITE = 'https://site.test';
const fresh = () => createFakeCorreios();
const ENV_OF = fake => ({SITE_URL: SITE, ...fake.creds});
const LINES = [{productId: 'borboletoscopio', quantity: 3}, {productId: 'aviaoscopia', quantity: 1}];   // 3 volumes: 600 g box, 320 g box, 350 g box
const withConfig = over => ({...EXAMPLE_CONFIG, ...over});
// Same formula as the simulator: origin 30140071 (first digit 3). Zone = gap between first digits.
const pac = (zone, kgPerVolume, volumes) => volumes * (1850 + 430 * zone + 340 * kgPerVolume), sedex = (zone, kgPerVolume, volumes) => volumes * (2650 + 870 * zone + 590 * kgPerVolume);

// Anything the server logs must never carry the access code or the postage card.
const logged = [];
const realError = console.error;
console.error = (...args) => { logged.push(args.map(String).join(' ')); };
const noSecrets = fake => { for (const line of logged) for (const secret of [fake.creds.CORREIOS_CODE, fake.creds.CORREIOS_CARD]) assert(!line.includes(secret), 'a secret reached the log: ' + line); };

// ── the pieces ──────────────────────────────────────────────────────────────────────────────────────
assert.equal(parseMoney('23,45'), 2345); assert.equal(parseMoney('1.234,56'), 123456); assert.equal(parseMoney(23.45), 2345); assert.equal(parseMoney('12.5'), 1250);
for (const bad of ['', '0,00', 'abc', null, undefined, -5, NaN]) assert(Number.isNaN(parseMoney(bad)), `not an amount: ${bad}`);
assert.deepEqual(boxParams({length: 10, width: 20, height: 1, weightG: 0.4}), {psObjeto: '1', tpObjeto: '2', comprimento: '20', largura: '11', altura: '2'}, 'longest side first, at least 16 × 11 × 2');
assert.deepEqual(boxParams({length: 20.2, width: 15, height: 8, weightG: 320.1}), {psObjeto: '321', tpObjeto: '2', comprimento: '21', largura: '15', altura: '8'}, 'centimetres and grams rounded up');
assert.deepEqual(correiosSettings({CORREIOS_USER: ' u ', CORREIOS_CODE: 'c', CORREIOS_CARD: '00 675', CORREIOS_CONTRACT: '99123-45', SHIP_FROM_CEP: '30140-071', CORREIOS_DR: '74'}), {user: 'u', code: 'c', card: '00675', contract: '9912345', dr: '74', originCep: '30140071', ready: true});
for (const drop of ['CORREIOS_USER', 'CORREIOS_CODE', 'CORREIOS_CARD', 'CORREIOS_CONTRACT', 'CORREIOS_DR', 'SHIP_FROM_CEP']) assert.equal(correiosSettings({...fresh().creds, [drop]: ''}).ready, false, `${drop} is needed`);

// the shop's data: nothing is guessed
assert.deepEqual(missing(baseConfig), [], 'the shipped config is complete: with the Correios credentials the real quote is on');
assert.deepEqual([baseConfig.services.filter(s => s.code).map(s => [s.id, s.code]), baseConfig.production], [[['pac', '03298']], {minDays: 3, maxDays: 5}], 'PAC CONTRATO AG only; 3 to 5 days of production');
assert.deepEqual([baseConfig.freeShipping, baseConfig.labelFeeCents], [{fromCents: 50000, service: 'pac'}, 0], 'free PAC from R$ 500, no extra label fee');
const SHARED = {length: 22, width: 20, height: 7, maxPieces: 3, pieceG: {borboletoscopio: 129, dinossauroscopio: 128, aviaoscopia: 250}};
assert.deepEqual(baseConfig.sharedBox, SHARED, 'the packaging registered at the Correios Empresa; butterfly + dinosaur weigh 257 g together, the airplane about 250 g');
assert.deepEqual(missing({...baseConfig, sharedBox: {...SHARED, maxPieces: null}}), ['sharedBox'], 'how many pieces fit is missing');
assert.deepEqual(missing({...baseConfig, sharedBox: {...SHARED, pieceG: {borboletoscopio: 129, dinossauroscopio: 128}}}), ['sharedBox'], 'a weight for every product');
assert.deepEqual(missing({...baseConfig, sharedBox: {...SHARED, pieceG: {...SHARED.pieceG, aviaoscopia: 0}}}), ['sharedBox'], 'weights are positive');
assert.deepEqual(missing({...baseConfig, sharedBox: {...SHARED, pieceG: {...SHARED.pieceG, aviaoscopia: 11000}}}), ['sharedBox'], 'a full box over 30 kg');
assert.deepEqual(missing({...baseConfig, boxes: undefined, sharedBox: undefined}).slice(0, 1), ['boxes.borboletoscopio'], 'without a shared box the per-product boxes are needed');
assert.deepEqual(missing(EXAMPLE_CONFIG), []);
assert.deepEqual(missing(withConfig({production: {minDays: 7, maxDays: 5}})), ['production']);
assert.deepEqual(missing(withConfig({boxes: {...EXAMPLE_CONFIG.boxes, aviaoscopia: {unit: {length: 25, width: 14, height: 6, weightG: 31000}, perBox: 1, full: null}}})), ['boxes.aviaoscopia'], 'over 30 kg');
assert.deepEqual(missing(withConfig({boxes: {...EXAMPLE_CONFIG.boxes, aviaoscopia: {unit: {length: 100, width: 60, height: 50, weightG: 900}, perBox: 1, full: null}}})), ['boxes.aviaoscopia'], 'sides add up to more than 200 cm');
assert.deepEqual(missing(withConfig({boxes: {...EXAMPLE_CONFIG.boxes, aviaoscopia: {unit: EXAMPLE_CONFIG.boxes.aviaoscopia.unit, perBox: 2, full: null}}})), ['boxes.aviaoscopia'], 'a box for several pieces needs its own size');
assert.deepEqual(missing(withConfig({freeShipping: {fromCents: 30000, service: 'nope'}})), ['freeShipping']);
assert.deepEqual(missing(withConfig({services: [{id: 'pac', label: 'PAC', code: '3298'}]})), ['services'], 'service codes have 5 digits');

// boxes → volumes: each product fills its own boxes; leftovers are sized on the safe side
const vol = lines => volumesFor(lines, EXAMPLE_CONFIG).map(v => [v.count, v.box.weightG]);
assert.deepEqual(vol([{productId: 'borboletoscopio', quantity: 1}]), [[1, 320]], 'one piece: the small box');
assert.deepEqual(vol([{productId: 'borboletoscopio', quantity: 2}]), [[1, 600]], 'a full box');
assert.deepEqual(vol([{productId: 'borboletoscopio', quantity: 1}, {productId: 'borboletoscopio', quantity: 1}]), [[1, 600]], 'lines of the same product (other colors) share boxes');
assert.deepEqual(vol([{productId: 'dinossauroscopio', quantity: 4}]), [[1, 800], [1, 280]], '3 + 1');
assert.deepEqual(vol([{productId: 'dinossauroscopio', quantity: 5}]), [[2, 800]], '3 + 2: the box with two pieces is priced as a full one (the safe side)');
assert.deepEqual(vol([{productId: 'aviaoscopia', quantity: 3}]), [[3, 350]], 'one piece per box: identical volumes are grouped');
assert.deepEqual(vol(LINES), [[1, 600], [1, 320], [1, 350]]);

// one shared box for any mix of products, up to maxPieces pieces; a box weighs the sum of its pieces
const sharedVol = lines => volumesFor(lines, {...EXAMPLE_CONFIG, sharedBox: SHARED}).map(v => [v.count, v.box.weightG]);
assert.deepEqual(sharedVol([{productId: 'borboletoscopio', quantity: 1}]), [[1, 129]], 'one butterfly');
assert.deepEqual(sharedVol([{productId: 'aviaoscopia', quantity: 1}]), [[1, 250]], 'the airplane');
assert.deepEqual(sharedVol([{productId: 'borboletoscopio', quantity: 1}, {productId: 'dinossauroscopio', quantity: 1}]), [[1, 257]], 'butterfly + dinosaur: the 257 g the shop measured');
assert.deepEqual(sharedVol([{productId: 'borboletoscopio', quantity: 1}, {productId: 'dinossauroscopio', quantity: 1}, {productId: 'aviaoscopia', quantity: 1}]), [[1, 507]], 'three different products share one box: 129 + 128 + 250');
assert.deepEqual(sharedVol(LINES), [[1, 508], [1, 129]], '4 pieces (3 butterflies + 1 airplane): a box of 3, heaviest first, and a box with the last butterfly');
assert.deepEqual(sharedVol([{productId: 'aviaoscopia', quantity: 5}]), [[1, 750], [1, 500]], '3 + 2 airplanes');
assert.deepEqual(sharedVol([{productId: 'aviaoscopia', quantity: 6}]), [[2, 750]], 'identical full boxes are grouped');
assert.deepEqual(sharedVol([{productId: 'borboletoscopio', quantity: 4}]), [[1, 387], [1, 129]], '3 + 1 butterflies');

// ── the engine against the Correios simulator ────────────────────────────────────────────────────────
{
  const fake = fresh(), env = ENV_OF(fake), ship = createShipping({env, fetchImpl: fake.fetchImpl, config: EXAMPLE_CONFIG});
  assert.equal(ship.status().mode, 'correios');
  assert.equal(createShipping({env: {}, fetchImpl: fake.fetchImpl, config: EXAMPLE_CONFIG}).status().mode, 'off', 'no credentials: off');
  assert.equal(createShipping({env, fetchImpl: fake.fetchImpl, config: {...baseConfig, sharedBox: {...SHARED, maxPieces: null}}}).status().mode, 'pending', 'credentials but the shop\'s data incomplete: pending');
  assert.equal(createShipping({env, fetchImpl: fake.fetchImpl}).status().mode, 'correios', 'credentials and the shipped config: on');
  await assert.rejects(createShipping({env: {}, fetchImpl: fake.fetchImpl, config: EXAMPLE_CONFIG}).quote({lines: LINES, cep: '90010000'}), {code: 'shipping_off'});
  await assert.rejects(ship.quote({lines: LINES, cep: '9001'}), {code: 'invalid_cep'});

  const q = await ship.quote({lines: LINES, cep: '90010-000', subtotalCents: 54700});   // zone 6 (3 → 9)
  assert.deepEqual(q.options.map(o => [o.service, o.priceCents]), [['pac', pac(6, 1, 3)], ['sedex', sedex(6, 1, 3)]], 'contract prices, summed over the 3 volumes, cheapest first');
  assert.deepEqual(q.options.map(o => o.days), [{min: 5 + 15, max: 7 + 15}, {min: 5 + 7, max: 7 + 7}], 'production days + the carrier\'s delivery time');
  assert.equal(q.options[0].code, '03298'); assert.equal(q.options[0].costCents, q.options[0].priceCents); assert.equal(q.options[0].volumes, 3); assert.equal(q.partial, false);
  assert.deepEqual(Object.keys(publicOption(q.options[0])).sort(), ['days', 'free', 'label', 'priceCents', 'service'], 'the browser never sees the contract code or the shop\'s cost');
  const price = fake.calls.find(c => c.path.startsWith('/preco')).params;
  assert.deepEqual([price.cepOrigem, price.cepDestino, price.tpObjeto, price.nuContrato], ['30140071', '90010000', '2', '9912345678'], 'origin from the settings, destination digits only, contract sent');
  assert.equal(price.nuDR, '20', 'the DR always goes with the contract');
  assert.equal(fake.tokenCalls(), 1, 'one token serves every call');
  const callsBefore = fake.calls.length;
  await ship.quote({lines: LINES, cep: '90010-000', subtotalCents: 54700});
  assert.equal(fake.calls.length, callsBefore, 'the same quote again comes from the cache: the displayed price and the charged price are one');

  // identical boxes are priced once and multiplied: three airplanes are three labels of the same box
  const triple = await ship.quote({lines: [{productId: 'aviaoscopia', quantity: 3}], cep: '90010-000'});
  assert.deepEqual(triple.options.map(o => [o.service, o.priceCents, o.volumes]), [['pac', pac(6, 1, 3), 3], ['sedex', sedex(6, 1, 3), 3]], 'a group of 3 identical volumes costs 3 times one');
  assert.equal(fake.calls.filter(c => c.path.startsWith('/preco') && c.params.cepDestino === '90010000' && c.params.psObjeto === '350').length, 2, 'one price request per service and box, not per label');

  // one shared box: three different products are ONE volume (507 g), not three
  const oneBox = createShipping({env, fetchImpl: fake.fetchImpl, config: withConfig({sharedBox: SHARED})});
  const mixed = await oneBox.quote({lines: [{productId: 'borboletoscopio', quantity: 1}, {productId: 'dinossauroscopio', quantity: 1}, {productId: 'aviaoscopia', quantity: 1}], cep: '90010-000'});
  assert.deepEqual(mixed.options.map(o => [o.service, o.priceCents, o.volumes]), [['pac', pac(6, 1, 1), 1], ['sedex', sedex(6, 1, 1), 1]], 'one label for the whole order');
  const four = await oneBox.quote({lines: LINES, cep: '90010-000'});
  assert.deepEqual(four.options.map(o => [o.service, o.priceCents, o.volumes]), [['pac', pac(6, 1, 2), 2], ['sedex', sedex(6, 1, 2), 2]], '4 pieces: two labels');

  // a heavier box changes the price by the weight brackets; DR is sent when configured
  const heavy = createShipping({env: {...env, CORREIOS_DR: '74'}, fetchImpl: fake.fetchImpl, config: withConfig({boxes: {...EXAMPLE_CONFIG.boxes, aviaoscopia: {unit: {length: 25, width: 14, height: 6, weightG: 1500}, perBox: 1, full: null}}})});
  const h = await heavy.quote({lines: [{productId: 'aviaoscopia', quantity: 1}], cep: '20040-020'});   // zone 1 (3 → 2)
  assert.equal(h.options[0].priceCents, pac(1, 2, 1), '1.5 kg is charged as 2 kg');
  assert.equal(fake.calls.filter(c => c.path.startsWith('/preco')).at(-1).params.nuDR, '74');

  // token renewal: an expired token is answered 403 and renewed once, transparently
  fake.expireTokens();
  const renewed = await ship.quote({lines: LINES, cep: '01310-100'});   // a new CEP, so no cache
  assert.equal(renewed.options.length, 2); assert.equal(fake.tokenCalls(), 4, 'the expired token was renewed (1 first + 1 for the shared-box engine + 1 for the heavy engine + 1 renewal)');

  // a service missing from the contract is left out; the others are still offered
  const partial = createShipping({env, fetchImpl: fake.fetchImpl, config: withConfig({services: [{id: 'pac', label: 'PAC', code: '03298'}, {id: 'sedex', label: 'SEDEX', code: '03158'}]})});
  const only = await partial.quote({lines: LINES, cep: '70040-010'});
  assert.deepEqual(only.options.map(o => o.service), ['pac']); assert.equal(only.partial, true);

  // free shipping: only on the chosen service, only from the threshold; the shop still pays the label
  const free = createShipping({env, fetchImpl: fake.fetchImpl, config: withConfig({freeShipping: {fromCents: 30000, service: 'pac'}})});
  const under = await free.quote({lines: LINES, cep: '90010000', subtotalCents: 29999}), over = await free.quote({lines: LINES, cep: '90010000', subtotalCents: 30000});
  assert.equal(under.options[0].priceCents, pac(6, 1, 3)); assert.equal(under.options[0].free, false);
  assert.deepEqual([over.options[0].service, over.options[0].priceCents, over.options[0].free, over.options[0].costCents], ['pac', 0, true, pac(6, 1, 3)], 'free for the buyer, not for the shop');
  assert.equal(over.options[1].priceCents, sedex(6, 1, 3), 'SEDEX is not free');
  // label fee, per label
  const fee = createShipping({env, fetchImpl: fake.fetchImpl, config: withConfig({labelFeeCents: 500})});
  assert.equal((await fee.quote({lines: LINES, cep: '90010000'})).options[0].priceCents, pac(6, 1, 3) + 3 * 500, 'a fee on every label (volume)');

  // a CEP nobody serves / an invalid one: no option, not an outage
  await assert.rejects(ship.quote({lines: LINES, cep: '99999-000'}), {code: 'no_service'});
  await assert.rejects(ship.quote({lines: LINES, cep: '00000-000'}), {code: 'no_service'});
  // wrong credentials: an outage from the buyer's point of view (never a wrong price)
  const wrong = createShipping({env: {...env, CORREIOS_CODE: 'not-the-code'}, fetchImpl: fake.fetchImpl, config: EXAMPLE_CONFIG});
  await assert.rejects(wrong.quote({lines: LINES, cep: '22041-001'}), {code: 'shipping_unavailable'});
  // the Correios are down
  fake.setDown(true);
  await assert.rejects(ship.quote({lines: LINES, cep: '40020-000'}), {code: 'shipping_unavailable'});
  fake.setDown(false);
  assert.equal((await ship.quote({lines: LINES, cep: '40020-000'})).options.length, 2, 'and it recovers');
  noSecrets(fake);

  // the cache expires: a new price is asked after ten minutes
  let clock = 1_700_000_000_000;
  const timed = createShipping({env, fetchImpl: fake.fetchImpl, now: () => clock, config: EXAMPLE_CONFIG});
  await timed.quote({lines: LINES, cep: '60010-000'}); const n1 = fake.calls.length;
  clock += 9 * 60 * 1000; await timed.quote({lines: LINES, cep: '60010-000'}); assert.equal(fake.calls.length, n1, 'still cached at 9 minutes');
  clock += 2 * 60 * 1000; await timed.quote({lines: LINES, cep: '60010-000'}); assert(fake.calls.length > n1, 'asked again after 10 minutes');
  // the same env and fetch share one engine (quote and payment see the same cache); another env does not
  const shared = {a: forEnv(env, {fetchImpl: fake.fetchImpl, config: EXAMPLE_CONFIG}), b: forEnv(env, {fetchImpl: fake.fetchImpl, config: EXAMPLE_CONFIG})};
  assert.equal(shared.a, shared.b); assert.notEqual(forEnv({...env}, {fetchImpl: fake.fetchImpl, config: EXAMPLE_CONFIG}), shared.a);
}

// ── GET/POST /api/shipping/quote ─────────────────────────────────────────────────────────────────────
function makeRes() { return {statusCode: 200, headers: {}, body: '', setHeader(key, value) { this.headers[key.toLowerCase()] = value; }, end(data) { this.body = data || ''; }, json() { return JSON.parse(this.body); }}; }
async function call(handler, {method = 'POST', origin = SITE, body = {}, ip = '203.0.113.9', headers = {}} = {}) {
  const res = makeRes();
  await handler({method, headers: {...(origin ? {origin} : {}), 'x-forwarded-for': ip, ...headers}, body, socket: {}, url: '/'}, res);
  return res;
}
const ITEMS = [{productId: 'borboletoscopio', quantity: 3, selection: {body: 'pink', details: 'lilac'}}, {productId: 'aviaoscopia', quantity: 1, selection: {body: 'black'}}];
{
  const fake = fresh(), env = ENV_OF(fake);
  const handler = quoteHandler.create({env, fetchImpl: fake.fetchImpl, shippingConfig: EXAMPLE_CONFIG});
  assert.equal((await call(handler, {method: 'PUT'})).statusCode, 405);
  assert.deepEqual((await call(quoteHandler.create({env: {SITE_URL: SITE}, fetchImpl: fake.fetchImpl}), {method: 'GET'})).json(), {mode: 'off'});
  assert.deepEqual((await call(quoteHandler.create({env, fetchImpl: fake.fetchImpl, shippingConfig: {...baseConfig, production: {minDays: null, maxDays: null}}}), {method: 'GET'})).json(), {mode: 'off'}, 'credentials but incomplete shop data look off from outside');
  assert.deepEqual((await call(handler, {method: 'GET'})).json(), {mode: 'correios', production: {minDays: 5, maxDays: 7}});
  assert.deepEqual((await call(quoteHandler.create({env: {SITE_URL: SITE}, fetchImpl: fake.fetchImpl}), {body: {items: ITEMS, cep: '90010000'}})).json(), {mode: 'off'}, 'off: the checkout keeps its fixed example fee');

  assert.equal((await call(handler, {origin: '', body: {items: ITEMS, cep: '90010000'}})).statusCode, 403, 'no Origin');
  assert.equal((await call(handler, {origin: 'https://evil.example', body: {items: ITEMS, cep: '90010000'}})).statusCode, 403, 'foreign Origin');
  assert.equal((await call(handler, {body: 'not json'})).statusCode, 400);
  const badCep = await call(handler, {body: {items: ITEMS, cep: '9001'}}); assert.equal(badCep.statusCode, 400); assert.equal(badCep.json().field, 'cep');
  assert.equal((await call(handler, {body: {items: [{productId: 'x', quantity: 1}], cep: '90010000'}})).json().error, 'invalid_items');
  assert.equal((await call(handler, {body: {items: [], cep: '90010000'}})).json().error, 'invalid_items');
  assert.equal(fake.calls.length, 0, 'nothing reached the Correios for invalid requests');

  const ok = await call(handler, {body: {items: ITEMS, cep: '90010-000', priceCents: 1, options: [{priceCents: 1}], shipping: {priceCents: 1}}});   // a price sent by the browser is ignored
  assert.equal(ok.statusCode, 200); const body = ok.json();
  assert.deepEqual(body.options, [{service: 'pac', label: 'PAC', priceCents: pac(6, 1, 3), free: false, days: {min: 20, max: 22}}, {service: 'sedex', label: 'SEDEX', priceCents: sedex(6, 1, 3), free: false, days: {min: 12, max: 14}}]);
  assert.equal(body.cep, '90010000'); assert(!ok.body.includes('03298') && !ok.body.includes('costCents') && !ok.body.includes('9912345678'), 'no contract data in the answer');
  assert.equal((await call(handler, {body: {items: ITEMS, cep: '99999-000'}})).statusCode, 422);
  assert.equal((await call(handler, {body: {items: ITEMS, cep: '99999-000'}})).json().error, 'no_service');
  fake.setDown(true);
  const down = await call(handler, {body: {items: ITEMS, cep: '40020-000'}});
  assert.equal(down.statusCode, 503); assert.equal(down.json().error, 'shipping_unavailable'); assert(!down.body.includes('Serviço indisponível'), 'the Correios\' own words stay in the log');
  fake.setDown(false);
  // rate limit: 40 quotes per address in ten minutes (repeats of the same quote come from the cache)
  const limited = quoteHandler.create({env: ENV_OF(fresh()), fetchImpl: fresh().fetchImpl, shippingConfig: EXAMPLE_CONFIG});
  let last;
  for (let i = 0; i < 41; i++) last = await call(limited, {body: {items: ITEMS, cep: '90010-000'}, ip: '198.51.100.7'});
  assert.equal(last.statusCode, 429); assert(Number(last.headers['retry-after']) > 0);
  assert.equal((await call(limited, {body: {items: ITEMS, cep: '90010-000'}, ip: '198.51.100.8'})).statusCode, 200, 'another address is not limited');
  noSecrets(fake);
}

// ── the shop's shipped data end to end: PAC only, free from R$ 500 ─────────────────────────────────────
{
  const fake = fresh(), shop = createShipping({env: ENV_OF(fake), fetchImpl: fake.fetchImpl, config: baseConfig});
  assert.equal(shop.status().mode, 'correios');
  const under = await shop.quote({lines: LINES, cep: '90010-000', subtotalCents: 49999}), over = await shop.quote({lines: LINES, cep: '90010-000', subtotalCents: 50000});
  assert.deepEqual(under.options.map(o => [o.service, o.free, o.volumes, o.priceCents]), [['pac', false, 2, pac(6, 1, 2)]], 'PAC only; 3 butterflies + 1 airplane are two boxes; R$ 499,99 pays the freight');
  assert.deepEqual(over.options.map(o => [o.service, o.free, o.priceCents, o.costCents]), [['pac', true, 0, pac(6, 1, 2)]], 'R$ 500,00 ships free; the shop still pays the label');
  assert.deepEqual(under.options[0].days, {min: 3 + 15, max: 5 + 15}, 'production 3 to 5 days + the carrier\'s 15');
  assert(!fake.calls.some(c => c.path.includes('03220')), 'SEDEX is never asked for');
}

// ── health says where shipping stands, never a value ─────────────────────────────────────────────────
{
  const fake = fresh();
  const read = async env => { const res = makeRes(); await health.create({env})({}, res); return res.json(); };
  assert.equal((await read({})).shipping, 'off');
  assert.equal((await read(fake.creds)).shipping, 'correios', 'credentials and the shipped shop data: quoting');
  assert.equal((await read({...fake.creds, CORREIOS_DR: ''})).shipping, 'off', 'without the DR the real quote stays off');
  const text = JSON.stringify(await read(fake.creds)); for (const secret of [fake.creds.CORREIOS_CODE, fake.creds.CORREIOS_CARD, fake.creds.CORREIOS_CONTRACT, fake.creds.SHIP_FROM_CEP]) assert(!text.includes(secret));
}

// ── POST /api/payments/create with the real shipping ─────────────────────────────────────────────────
function network(correios, mercadoPago) {
  const mails = [];
  const fetchImpl = async (url, init = {}) => {
    if (String(url) === 'https://api.resend.com/emails') { mails.push(JSON.parse(init.body)); return {ok: true, status: 200, json: async () => ({id: 'em_' + mails.length})}; }
    if (String(url).startsWith('https://api.correios.com.br')) return correios.fetchImpl(url, init);
    return mercadoPago.fetchImpl(url, init);
  };
  return {fetchImpl, mails};
}
async function signedInBuyer(store, env) {
  const id = crypto.randomUUID(), token = crypto.randomBytes(32).toString('base64url');
  await store.customers.create({id, email: 'ana@example.com', emailVerifiedAt: new Date(), displayName: 'Ana'});
  await createAccounts({store, env}).updateProfile(await store.customers.findById(id), {firstName: 'Ana', lastName: 'Souza Lima', cpf: '52998224725', phone: '(31) 98888-7777'});
  await store.sessions.create({tokenHash: crypto.createHash('sha256').update(token).digest(), customerId: id, expiresAt: new Date(Date.now() + 86400000)});
  return {headers: {cookie: `__Host-ju_session=${token}`}};
}
const ADDRESS = {cep: '90010-000', street: 'Rua dos Andradas', number: '100', district: 'Centro', city: 'Porto Alegre', state: 'rs', complement: ''};
const CARD = {selectedPaymentMethod: 'credit_card', formData: {token: 'APRO' + 'a'.repeat(28), payment_method_id: 'master', installments: 1, issuer_id: '24', payer: {email: 'ana@example.com', identification: {type: 'CPF', number: '52998224725'}}}};
const order = (shipping, over = {}) => ({attempt: crypto.randomUUID(), items: ITEMS, customer: {name: 'Ana Souza Lima', email: 'ana@example.com', phone: '(31) 98888-7777'}, address: ADDRESS, notes: '', lang: 'pt-BR', acceptTerms: true, payment: CARD, ...(shipping ? {shipping} : {}), ...over});
{
  const correios = fresh(), mercadoPago = createFakeMercadoPago(), net = network(correios, mercadoPago), store = createMemoryStore();
  const env = {...ENV_OF(correios), RESEND_API_KEY: 're_test_key_123', MAIL_FROM: 'Ju <pedidos@site.test>', MP_ACCESS_TOKEN: 'TEST-secret-token-000', MP_PUBLIC_KEY: 'TEST-public-key-111', MP_WEBHOOK_SECRET: 'whsec-test-222', ORDER_NOTIFY_EMAIL: 'ju@site.test', VERCEL_ENV: 'preview'};
  const handler = createHandler.create({env, fetchImpl: net.fetchImpl, store, shippingConfig: EXAMPLE_CONFIG});
  const quoter = quoteHandler.create({env, fetchImpl: net.fetchImpl, shippingConfig: EXAMPLE_CONFIG});
  const ana = await signedInBuyer(store, env);
  const subtotal = 3 * 12900 + 15900;
  const quoted = (await call(quoter, {body: {items: ITEMS, cep: ADDRESS.cep}})).json().options;   // what the buyer is shown
  const pacOption = quoted.find(o => o.service === 'pac');
  const orders = () => store.orders.list();
  const mpBefore = () => mercadoPago.orders.size;

  // the shipping is required, known and equal to what was shown
  const missingShipping = await call(handler, {body: order(null), ...ana});
  assert.equal(missingShipping.statusCode, 400); assert.equal(missingShipping.json().field, 'shipping');
  assert.equal((await call(handler, {body: order({service: 'jadlog', priceCents: 1000}), ...ana})).json().field, 'shipping', 'an unknown service');
  assert.equal((await call(handler, {body: order('pac'), ...ana})).json().field, 'shipping', 'not an object');
  const stale = await call(handler, {body: order({service: 'pac', priceCents: pacOption.priceCents - 1000}), ...ana});
  assert.equal(stale.statusCode, 409); assert.equal(stale.json().error, 'shipping_changed');
  assert.deepEqual(stale.json().options, quoted, 'the buyer is shown the current options');
  assert.equal((await orders()).length, 0); assert.equal(mpBefore(), 0, 'nothing was created for a stale or missing shipping');

  // the price the browser claims decides nothing: only the server's quote is charged
  const paid = await call(handler, {body: order({service: 'pac', priceCents: pacOption.priceCents}), ...ana});
  assert.equal(paid.statusCode, 201, paid.body); assert.equal(paid.json().state, 'approved');
  const saved = await store.orders.findByReference(paid.json().reference);
  assert.equal(saved.shippingCents, pac(6, 1, 3)); assert.equal(saved.totalCents, subtotal + pac(6, 1, 3));
  assert.deepEqual(saved.shippingInfo, {service: 'pac', label: 'PAC', code: '03298', days: {min: 20, max: 22}, deliveryDays: 15, priceCents: pac(6, 1, 3), costCents: pac(6, 1, 3), volumes: 3, source: 'correios'});
  const remote = [...mercadoPago.orders.values()].at(-1);
  assert.equal(remote.total_amount, ((subtotal + pac(6, 1, 3)) / 100).toFixed(2), 'Mercado Pago charges items + the quoted delivery');
  const freight = remote.items.find(i => i.external_code === 'shipping');
  assert.deepEqual([freight.unit_price, freight.description], [(pac(6, 1, 3) / 100).toFixed(2), 'Entrega PAC']);

  // Ju and the buyer see the service, the estimate and what the label costs
  const admin = createOrders({store, env}).adminView(saved);
  assert.deepEqual(admin.shipping, {service: 'pac', label: 'PAC', days: {min: 20, max: 22}, deliveryDays: 15, chargedCents: pac(6, 1, 3), costCents: pac(6, 1, 3), volumes: 3});
  const toBuyer = net.mails.find(m => m.to[0] === 'ana@example.com'), toJu = net.mails.find(m => m.to[0] === 'ju@site.test');
  assert(toBuyer.html.includes('Entrega · PAC') && toBuyer.text.includes('Prazo estimado: 20 a 22 dias úteis (produção + envio).'), 'the buyer sees the service and the estimate');
  assert(toJu.html.includes('PAC · 3 volumes · prazo 20 a 22 dias úteis') && toJu.text.includes('custo da etiqueta'), 'Ju sees the volumes and the label cost');
  assert(!toBuyer.html.includes('03298') && !toBuyer.text.includes('custo da etiqueta'), 'the buyer never sees the contract code or the shop\'s cost');
  assert(!JSON.stringify(paid.json()).includes('03298'), 'nor does the payment answer');

  // free shipping through the payment: the order total is just the items and Mercado Pago gets no zero-priced item
  const freeConfig = withConfig({freeShipping: {fromCents: 30000, service: 'pac'}});
  const freeHandler = createHandler.create({env, fetchImpl: net.fetchImpl, store, shippingConfig: freeConfig}), freeQuoter = quoteHandler.create({env, fetchImpl: net.fetchImpl, shippingConfig: freeConfig});
  const freeOption = (await call(freeQuoter, {body: {items: ITEMS, cep: ADDRESS.cep}})).json().options.find(o => o.service === 'pac');
  assert.deepEqual([freeOption.priceCents, freeOption.free], [0, true]);
  const freePaid = await call(freeHandler, {body: order({service: 'pac', priceCents: 0}), ...ana});
  assert.equal(freePaid.statusCode, 201, freePaid.body);
  const freeSaved = await store.orders.findByReference(freePaid.json().reference);
  assert.deepEqual([freeSaved.shippingCents, freeSaved.totalCents, freeSaved.shippingInfo.costCents], [0, subtotal, pac(6, 1, 3)], 'free for the buyer; the label cost is kept for Ju');
  const freeRemote = [...mercadoPago.orders.values()].at(-1);
  assert.equal(freeRemote.total_amount, (subtotal / 100).toFixed(2)); assert(!freeRemote.items.some(i => i.external_code === 'shipping'), 'no zero-priced delivery item');

  // no service for the CEP, and the Correios down: refused before anything is created
  const before = (await orders()).length, mpMade = mpBefore();
  const nowhere = await call(handler, {body: order({service: 'pac', priceCents: 1000}, {address: {...ADDRESS, cep: '99999-000'}}), ...ana});
  assert.equal(nowhere.statusCode, 422); assert.equal(nowhere.json().error, 'no_service');
  correios.setDown(true);
  const outage = await call(handler, {body: order({service: 'pac', priceCents: pacOption.priceCents}, {address: {...ADDRESS, cep: '40020-000'}}), ...ana});
  assert.equal(outage.statusCode, 503); assert.equal(outage.json().error, 'shipping_unavailable');
  correios.setDown(false);
  assert.equal((await orders()).length, before); assert.equal(mpBefore(), mpMade, 'no order, no charge');

  // without Correios credentials (or with the template config) nothing changes: the fixed example fee, no `shipping` needed
  const plainStore = createMemoryStore(), plainBuyer = await signedInBuyer(plainStore, env);
  const plainEnv = {...env, CORREIOS_USER: '', CORREIOS_CODE: ''};
  const plain = await call(createHandler.create({env: plainEnv, fetchImpl: net.fetchImpl, store: plainStore}), {body: order(null), ...plainBuyer});
  assert.equal(plain.statusCode, 201, plain.body);
  const plainSaved = await plainStore.orders.findByReference(plain.json().reference);
  assert.deepEqual([plainSaved.shippingCents, plainSaved.shippingInfo], [1800, null]);
  const pendingStore = createMemoryStore(), pendingBuyer = await signedInBuyer(pendingStore, env);
  const pending = await call(createHandler.create({env, fetchImpl: net.fetchImpl, store: pendingStore, shippingConfig: {...baseConfig, production: {minDays: null, maxDays: null}}}), {body: order(null), ...pendingBuyer});   // credentials, shop data incomplete
  assert.equal(pending.statusCode, 201, pending.body); assert.equal((await pendingStore.orders.findByReference(pending.json().reference)).shippingCents, 1800);
  noSecrets(correios);
}

// ── the browser side: what it asks, how it reads the answers, and the words ──────────────────────────
{
  const client = await site('shipping-client.js'), {translate} = await site('i18n-core.js');
  const answer = (status, body) => async () => ({ok: status >= 200 && status < 300, status, json: async () => body});
  assert.deepEqual(await client.loadShippingConfig({fetchImpl: answer(200, {mode: 'correios', production: {minDays: 5, maxDays: 7}})}), {mode: 'correios', production: {minDays: 5, maxDays: 7}});
  assert.deepEqual(await client.loadShippingConfig({fetchImpl: answer(200, {mode: 'off'})}), {mode: 'off'});
  assert.deepEqual(await client.loadShippingConfig({fetchImpl: answer(500, {})}), {mode: 'off'});
  assert.deepEqual(await client.loadShippingConfig({fetchImpl: async () => { throw new Error('offline'); }}), {mode: 'off'}, 'a dead network keeps the fixed example fee');
  assert.equal(client.isCep('90010-000'), true); assert.equal(client.isCep('9001'), false);

  let sent;
  const spy = async (url, init) => { sent = {url, init}; return answer(200, {mode: 'correios', options: [{service: 'pac', label: 'PAC', priceCents: 1000, free: false, days: {min: 1, max: 2}}]})(); };
  const ok = await client.quoteShipping({items: [{productId: 'aviaoscopia', quantity: 2, selection: {body: 'blue'}, unitPrice: 15900, thumbnail: 'data:image/png;base64,AAAA'}], cep: '90010-000'}, {fetchImpl: spy});
  assert.equal(ok.ok, true); assert.equal(ok.options[0].label, 'PAC');
  assert.equal(sent.url, '/api/shipping/quote'); assert.equal(sent.init.method, 'POST');
  assert.deepEqual(JSON.parse(sent.init.body), {cep: '90010000', items: [{productId: 'aviaoscopia', quantity: 2, selection: {body: 'blue'}}]}, 'only what to price: no price, no thumbnail');
  const failure = async (status, body) => (await client.quoteShipping({items: [], cep: '90010000'}, {fetchImpl: answer(status, body)})).error;
  assert.equal(await failure(422, {error: 'no_service'}), 'no_service');
  assert.equal(await failure(400, {error: 'invalid_request', field: 'cep'}), 'invalid_cep');
  assert.equal(await failure(429, {error: 'too_many_requests'}), 'too_many_requests');
  assert.equal(await failure(503, {error: 'shipping_unavailable'}), 'shipping_unavailable');
  assert.equal(await failure(200, {mode: 'off'}), 'shipping_unavailable', 'an unexpected answer is never read as a price');
  assert.equal((await client.quoteShipping({items: [], cep: '90010000'}, {fetchImpl: async () => { throw new Error('offline'); }})).error, 'shipping_unavailable');

  assert.equal(client.formatDays({min: 20, max: 22}), '20 a 22 dias úteis'); assert.equal(client.formatDays({min: 5, max: 5}), '5 dias úteis');
  // every message and every new label is translated, and the numbers survive
  const messages = [client.shippingMessage('no_service'), client.shippingMessage('too_many_requests'), client.shippingMessage('shipping_changed'), client.shippingMessage('invalid_request', 'shipping'), client.shippingMessage('shipping_unavailable')];
  assert.equal(new Set(messages).size, 5, 'each problem has its own message');
  const words = ['Como quer receber?', 'Digite o CEP para calcular o frete.', 'Calculando o frete…', 'Grátis', 'calculada pelo CEP', '(sem entrega)', 'Tentar de novo', 'Opções de envio', 'Envio', 'Aguarde o cálculo do frete.', 'Escolha uma forma de envio.', 'Preços são exemplos para avaliação. O frete é calculado pelo CEP, com a tabela dos Correios.'];
  for (const text of [...messages, ...words]) for (const lang of ['en', 'es']) assert.notEqual(translate(text, lang), text, `${lang}: ${text}`);
  assert.equal(translate('20 a 22 dias úteis', 'en'), '20 to 22 business days'); assert.equal(translate('20 a 22 dias úteis', 'es'), '20 a 22 días hábiles');
  assert.equal(translate('5 dias úteis', 'en'), '5 business days');
  assert.equal(translate('Entrega em 12 a 14 dias úteis', 'en'), 'Delivery in 12 to 14 business days'); assert.equal(translate('Entrega em 12 a 14 dias úteis', 'es'), 'Entrega en 12 a 14 días hábiles');
  assert.equal(translate('Prazo estimado: 20 a 22 dias úteis', 'en'), 'Estimated delivery: 20 to 22 business days'); assert.equal(translate('Prazo estimado: 20 a 22 dias úteis', 'es'), 'Plazo estimado: 20 a 22 días hábiles');
  assert.equal(translate('Produção: 5 a 7 dias úteis', 'en'), 'Production: 5 to 7 business days');
  // the totals: the delivery is whatever the checkout passes; without it, the fixed example fee
  const {totals} = await site('cart-store.js');
  const items = [{unitPrice: 12900, quantity: 2}];
  assert.deepEqual(totals(items), {subtotal: 25800, shipping: 1800, total: 27600}, 'no argument: the fixed example fee');
  assert.deepEqual(totals(items, 4770), {subtotal: 25800, shipping: 4770, total: 30570}); assert.deepEqual(totals(items, 0), {subtotal: 25800, shipping: 0, total: 25800});
  assert.deepEqual(totals([], 4770), {subtotal: 0, shipping: 0, total: 0}, 'an empty cart has no delivery');
}

// ── storage: the migration and the column map ────────────────────────────────────────────────────────
assert(fs.readFileSync(path.join(root, 'db/migrations/006_frete.sql'), 'utf8').includes('ADD COLUMN shipping_info TEXT NULL'));
const mysqlSource = fs.readFileSync(path.join(root, 'api/_lib/store-mysql.js'), 'utf8');
assert(mysqlSource.includes("shippingInfo: 'shipping_info'") && /JSON_FIELDS = new Set\(\[[^\]]*'shippingInfo'/.test(mysqlSource), 'the delivery choice is stored as JSON text like the other structured fields');
assert.deepEqual(fs.readdirSync(path.join(root, 'db/migrations')).filter(f => /^00[56]_/.test(f)).sort(), ['005_estorno.sql', '006_frete.sql'], 'migrations stay numbered in order');

console.error = realError;
console.log('PASS: Correios client (money, package rules, token renewal), boxes → volumes, quote engine (prices, times, cache, free shipping, label fee, missing services, invalid/unserved CEPs, outages, no secrets in logs), /api/shipping/quote, health, and the payment pricing the delivery itself.');
