// "Envio internacional" (05/10/2026): the Exporta Fácil quote with the shop's Correios contract (what is sent to the
// Correios, options, refusals with the Correios' words, an answer without a delivery time, the Correios down) and the panel
// endpoint behind the login (customs data, validation, shipping off), plus the panel wiring.
// Run: node tests/international.mjs — no network (tools/fake-correios.cjs plays the Correios).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const {createFakeCorreios} = require('../tools/fake-correios.cjs');
const {createShipping} = require('../api/_lib/shipping');
const config = require('../api/_lib/shipping-config');
const {createMemoryStore} = require('../api/_lib/store-memory');
const totp = require('../api/_lib/totp');
const handlers = Object.fromEntries(['login', 'verify', 'international-quote'].map(name => [name, require(`../api/admin/${name}`)]));

const realError = console.error; console.error = () => {};   // the engine logs each refused service
const lines = [{productId: 'borboletoscopio', quantity: 2}, {productId: 'aviaoscopia', quantity: 1}];

// ── the quote engine ───────────────────────────────────────────────────
{
  const fake = createFakeCorreios(), env = {...fake.creds};
  const engine = createShipping({env, fetchImpl: fake.fetchImpl, now: () => Date.parse('2026-10-05T15:00:00Z')});
  const quote = await engine.quoteInternational({lines, country: 'mx'});
  assert.equal(quote.country, 'MX');
  assert.deepEqual(quote.options.map(o => o.code), ['45128', '45110'], 'Standard and Expresso, cheapest first');
  assert(quote.options.every(o => o.priceCents > 0 && Number.isInteger(o.deliveryDays)));
  // The Correios give a range of working days (05/10/2026, the real contract to Mexico): the longest is what is promised.
  assert.deepEqual(quote.options.map(o => [o.deliveryDaysMin, o.deliveryDays]), [[9, 12], [3, 6]], 'Standard 9 to 12, Expresso 3 to 6 (simulated)');
  {
    const real = {coProduto: '45110', dataMaxEntrega: '2026-10-21', dataMinEntrega: '2026-10-16', prazoMaximo: 12, prazoMinimo: 9, sgPaisDestino: 'MX', sgPaisOrigem: 'BR'};
    const asReal = createShipping({env, fetchImpl: (url, init) => String(url).includes('/prazo/') ? Promise.resolve({ok: true, status: 200, json: async () => real}) : fake.fetchImpl(url, init)});
    const answered = await asReal.quoteInternational({lines, country: 'MX'});
    assert(answered.options.every(o => o.deliveryDaysMin === 9 && o.deliveryDays === 12), 'the answer the real contract gave: 9 to 12 working days');
  }
  assert.deepEqual(quote.refused, [{service: 'economico', label: 'Exporta Fácil Econômico', code: '45209', reason: 'rejected', messages: ['Serviço não contratado']}], 'a service outside the contract is listed with the Correios\' words');
  assert.deepEqual(quote.volumes, [{length: 22, width: 20, height: 7, weightG: 61 + 75 * 2 + 166, count: 1}], 'the same shared box as in Brazil: its tare and the pieces');
  const price = fake.calls.find(c => c.path === '/preco/v1/internacional/45128').params;
  assert.deepEqual({country: price.sgPaisDestino, from: price.cepOrigem, grams: price.psObjeto, type: price.tpObjeto, contract: price.nuContrato, dr: price.nuDR},
    {country: 'MX', from: env.SHIP_FROM_CEP, grams: '377', type: '2', contract: env.CORREIOS_CONTRACT, dr: env.CORREIOS_DR}, 'contract price, by country, for the box');
  assert(!('cepDestino' in price));
  const time = fake.calls.find(c => c.path === '/prazo/v2/internacional/exportacao/45128').params;
  assert.deepEqual(time, {sgPaisOrigem: 'BR', sgPaisDestino: 'MX', dtPostagem: '05-10-2026'}, 'export time, posted today (Brasília)');

  for (const country of ['BR', 'br', 'MEX', '', null]) await assert.rejects(engine.quoteInternational({lines, country}), {code: 'invalid_country'}, String(country));
  const unserved = await engine.quoteInternational({lines, country: 'KP'});
  assert.equal(unserved.options.length, 0); assert(unserved.refused.every(r => r.reason === 'rejected'), 'a country no service takes: all refused, with the reason');
  fake.setDown(true);
  await assert.rejects(engine.quoteInternational({lines, country: 'PT'}), {code: 'shipping_unavailable'}, 'the Correios down');
  fake.setDown(false);

  // no delivery time from the Correios: the price still stands
  const noTime = createShipping({env, fetchImpl: (url, init) => String(url).includes('/prazo/') ? Promise.resolve({ok: false, status: 500, json: async () => ({})}) : fake.fetchImpl(url, init)});
  const logged = [], original = console.error;
  console.error = (...parts) => logged.push(parts.join(' '));
  let priced, unknown;
  try {
    priced = await noTime.quoteInternational({lines, country: 'US'});
    // An answer in a format the site does not know (05/10/2026: the real contract gave no known time): the answer is logged.
    const odd = createShipping({env, fetchImpl: (url, init) => String(url).includes('/prazo/') ? Promise.resolve({ok: true, status: 200, json: async () => ({coProduto: '45128', diasUteis: '9 a 14'})}) : fake.fetchImpl(url, init)});
    unknown = await odd.quoteInternational({lines, country: 'MX'});
  } finally { console.error = original; }
  assert(priced.options.length === 2 && priced.options.every(o => o.deliveryDays === null && o.priceCents > 0));
  assert(logged.some(line => /prazo de Exporta Fácil .* para US — correios_unavailable \(500\)/.test(line)), 'why the time is missing goes to the log');
  assert(unknown.options.every(o => o.deliveryDays === null && o.priceCents > 0));
  assert(logged.some(line => line.includes('sem prazo reconhecido') && line.includes('"diasUteis":"9 a 14"')), 'an answer without a known time is logged as it came');
  await assert.rejects(createShipping({env: {}, fetchImpl: fake.fetchImpl}).quoteInternational({lines, country: 'MX'}), {code: 'shipping_off'}, 'no Correios credentials');
}

// ── the shop's data ────────────────────────────────────────────────────
assert.deepEqual(config.international.services.map(s => s.code), ['45128', '45110', '45209']);
assert.equal(config.international.hsCode, '392690', 'the first 6 digits of NCM 3926.90.90');
for (const id of ['borboletoscopio', 'dinossauroscopio', 'aviaoscopia']) assert.match(config.international.descriptions[id], /^3D printed plastic /, `${id}: what it really is, in English`);

// ── the panel endpoint ─────────────────────────────────────────────────
function makeRes() { return {statusCode: 200, headers: {}, body: '', setHeader(key, value) { this.headers[key.toLowerCase()] = value; }, end(data) { this.body = data || ''; }, json() { return JSON.parse(this.body); }}; }
const SITE = 'https://site.test', clock = Date.parse('2026-10-05T15:00:00Z');
async function call(handler, {body = {}, cookie = ''} = {}) {
  const res = makeRes();
  await handler({method: 'POST', headers: {origin: SITE, 'x-forwarded-for': '203.0.113.7', ...(cookie ? {cookie} : {})}, body, socket: {}, url: '/'}, res);
  return res;
}
const jar = res => String(res.headers['set-cookie'] || '').split(';')[0];
{
  const fake = createFakeCorreios(), store = createMemoryStore();
  const ENV = {SITE_URL: SITE, APP_ENV: 'preview', ADMIN_EMAIL: 'ju@site.test', ADMIN_PASSWORD: 'senha-do-painel-2026', ...fake.creds};
  const h = Object.fromEntries(Object.entries(handlers).map(([name, handler]) => [name, handler.create({env: ENV, store, now: () => clock, fetchImpl: fake.fetchImpl})]));
  assert.equal((await call(h['international-quote'], {body: {country: 'MX', items: lines}})).statusCode, 401, 'signed out: nothing');
  const login = await call(h.login, {body: {email: 'ju@site.test', password: 'senha-do-painel-2026'}});
  assert.equal((await call(h['international-quote'], {body: {country: 'MX', items: lines}, cookie: jar(login)})).statusCode, 401, 'the password alone is not enough');
  const cookie = jar(await call(h.verify, {body: {code: totp.codeAt(totp.fromBase32(login.json().setup.secret), totp.stepAt(clock))}, cookie: jar(login)}));
  const quote = await call(h['international-quote'], {body: {country: 'MX', items: lines}, cookie});
  assert.equal(quote.statusCode, 200);
  const data = quote.json();
  const price = id => require('../api/_lib/catalog').PRODUCTS[id].price;   // the server catalog (prices of 05/10/2026)
  assert.equal(data.piecesCents, price('borboletoscopio') * 2 + price('aviaoscopia'), 'the pieces at the shop\'s prices');
  assert.deepEqual(data.customs.items.map(i => [i.description, i.quantity, i.unitCents]), [['3D printed plastic cover for ophthalmic retinoscope', 2, price('borboletoscopio')], ['3D printed plastic fixation target for skiascopy rack', 1, price('aviaoscopia')]]);
  assert.equal(data.customs.hsCode, '392690'); assert.equal(data.customs.dueLimitUsd, 1000);
  assert.deepEqual(data.options.map(o => o.code), ['45128', '45110']); assert.equal(data.refused[0].code, '45209');
  assert.equal((await call(h['international-quote'], {body: {country: 'BR', items: lines}, cookie})).json().error, 'invalid_country');
  for (const items of [[], [{productId: 'unicornio', quantity: 1}], [{productId: 'borboletoscopio', quantity: 11}], [{productId: 'borboletoscopio', quantity: 1}, {productId: 'borboletoscopio', quantity: 1}], [{productId: 'aviaoscopia', quantity: 1.5}]])
    assert.equal((await call(h['international-quote'], {body: {country: 'MX', items}, cookie})).statusCode, 400, JSON.stringify(items));
  const off = handlers['international-quote'].create({env: {...ENV, CORREIOS_USER: ''}, store, now: () => clock, fetchImpl: fake.fetchImpl});
  const offAnswer = await call(off, {body: {country: 'MX', items: lines}, cookie});
  assert.deepEqual([offAnswer.statusCode, offAnswer.json().error], [409, 'shipping_off']);
}

// ── the panel ──────────────────────────────────────────────────────────
{
  const panel = read('dist/admin.js'), part = read('dist/admin-international.js'), client = read('dist/admin-auth.js');
  assert.match(panel, /\['internacional', 'Envio internacional'\]/, 'a part of the panel');
  assert.match(panel, /section === 'internacional' \? intlView\(\)/);
  assert.match(client, /request\('\/api\/admin\/international-quote', \{method: 'POST', body: \{country, items\}/);
  assert.match(part, /Dados de alfândega/); assert.match(part, /Minhas Exportações/); assert.match(part, /Impostos e taxas de importação são cobrados de quem recebe/);
  assert.match(read('tools/dev-server.cjs'), /'cash', 'international-quote'\]/, 'the local server serves it');
}

console.error = realError;
console.log('PASS: envio internacional — Exporta Fácil quote with the contract (by country, the shared box, refusals with the Correios\' words, no time, Correios down), the panel endpoint (login, customs data, validation, off) and the panel.');
