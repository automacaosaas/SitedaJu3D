// Address by CEP: the server-side lookup (ViaCEP, then BrasilAPI, cached), GET /api/cep/lookup, the browser client and the texts.
// Run: node tests/cep.mjs — no network, no keys.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const {createFakeCep, ADDRESSES} = require('../tools/fake-cep.cjs');
const {createCepLookup} = require('../api/_lib/cep');
const lookupHandler = require('../api/cep/lookup');
const site = f => import(pathToFileURL(path.join(root, 'dist', f)).href);

const logged = [];
const realError = console.error;
console.error = (...args) => { logged.push(args.map(String).join(' ')); };
const rejects = (promise, code, message) => assert.rejects(promise, {code}, message);

// ── the lookup ──────────────────────────────────────────────────────────────────────────────────
{
  const fake = createFakeCep(), lookup = createCepLookup({fetchImpl: fake.fetchImpl});
  assert.deepEqual(await lookup('01310100'), ADDRESSES['01310100'], 'ViaCEP answers');
  assert.deepEqual([fake.callsTo('viacep'), fake.callsTo('brasilapi')], [1, 0], 'BrasilAPI is only asked when ViaCEP fails or does not know the CEP');
  assert(fake.calls[0].url.startsWith('https://viacep.com.br/ws/01310100/json'), 'the CEP is the only thing sent');
  await lookup('01310100');
  assert.equal(fake.calls.length, 1, 'the same CEP again comes from the cache');
  assert.deepEqual(await lookup('35400000'), ADDRESSES['35400000'], 'a CEP that covers a whole town: no street, no district');
  await rejects(lookup('123'), 'invalid_cep', 'not a CEP'); await rejects(lookup('abcdefgh'), 'invalid_cep');
}
{
  // one service down: the other answers; both down: unavailable, and the failure is not remembered
  const fake = createFakeCep(), lookup = createCepLookup({fetchImpl: fake.fetchImpl});
  fake.setDown('viacep');
  assert.deepEqual(await lookup('20040020'), ADDRESSES['20040020'], 'ViaCEP down: BrasilAPI answers');
  assert.deepEqual([fake.callsTo('viacep'), fake.callsTo('brasilapi')], [1, 1]);
  fake.setDown('all');
  await rejects(lookup('40020000'), 'cep_unavailable', 'both down');
  fake.setDown('all', false);
  assert.deepEqual(await lookup('40020000'), ADDRESSES['40020000'], 'a service being down is not cached: the next try works');
}
{
  // not found: both asked once, remembered for an hour, then asked again
  let clock = 1_000_000;
  const fake = createFakeCep(), lookup = createCepLookup({fetchImpl: fake.fetchImpl, now: () => clock});
  await rejects(lookup('99999000'), 'not_found');
  assert.deepEqual([fake.callsTo('viacep'), fake.callsTo('brasilapi')], [1, 1], 'ViaCEP says no, BrasilAPI is asked too');
  await rejects(lookup('99999000'), 'not_found'); assert.equal(fake.calls.length, 2, 'a CEP nobody knows is remembered');
  clock += 30 * 60 * 1000;
  await rejects(lookup('99999000'), 'not_found'); assert.equal(fake.calls.length, 2, 'still remembered half an hour later');
  clock += 31 * 60 * 1000;
  await rejects(lookup('99999000'), 'not_found'); assert.equal(fake.calls.length, 4, 'after an hour it is asked again');
  // one says no, the other is down: we do not know
  const half = createFakeCep(), halfLookup = createCepLookup({fetchImpl: half.fetchImpl});
  half.setDown('brasilapi');
  await rejects(halfLookup('99999000'), 'cep_unavailable', 'ViaCEP: unknown CEP, BrasilAPI: down');
}
{
  // ViaCEP does not know a CEP that BrasilAPI does
  const answers = {viacep: {erro: true}, brasilapi: {cep: '12345678', state: 'MG', city: 'Ouro Preto', neighborhood: 'Centro', street: 'Rua Direita'}};
  const lookup = createCepLookup({fetchImpl: async url => ({ok: true, status: 200, json: async () => String(url).includes('viacep') ? answers.viacep : answers.brasilapi})});
  assert.deepEqual(await lookup('12345678'), {street: 'Rua Direita', district: 'Centro', city: 'Ouro Preto', state: 'MG'});
}
{
  // what the services send is cleaned: text only, blanks collapsed, capped, a state that is not one of the 27 is not accepted
  const odd = {logradouro: '  Rua   das\n Flores  ' + 'x'.repeat(300), bairro: 42, localidade: 'Belo Horizonte', uf: 'mg'};
  const lookup = createCepLookup({fetchImpl: async () => ({ok: true, status: 200, json: async () => odd})});
  const found = await lookup('30140071');
  assert.equal(found.street.length, 100); assert(found.street.startsWith('Rua das Flores x')); assert.equal(found.district, '', 'not text: dropped'); assert.equal(found.state, 'MG', 'upper-cased');
  const badState = createCepLookup({fetchImpl: async () => ({ok: true, status: 200, json: async () => ({...odd, uf: 'XX'})})});
  await rejects(badState('30140071'), 'not_found', 'no valid state: not usable');
  const garbage = createCepLookup({fetchImpl: async () => ({ok: true, status: 200, json: async () => { throw new Error('not json'); }})});
  await rejects(garbage('30140071'), 'cep_unavailable', 'an answer that is not JSON counts as a failure');
}
{
  // a service that never answers is cut off
  const started = Date.now();
  const hang = createCepLookup({fetchImpl: (url, {signal}) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))});
  await rejects(hang('01310100'), 'cep_unavailable', 'timeout');
  assert(Date.now() - started < 12000, 'about 4 s per service, then it gives up');
  // the same CEP asked at once is one request
  const fake = createFakeCep(), lookup = createCepLookup({fetchImpl: fake.fetchImpl});
  await Promise.all([lookup('01310100'), lookup('01310100'), lookup('01310100')]);
  assert.equal(fake.calls.length, 1, 'concurrent lookups share one request');
}

// ── GET /api/cep/lookup ─────────────────────────────────────────────────────────────────────────
function makeRes() { return {statusCode: 200, headers: {}, body: '', setHeader(key, value) { this.headers[key.toLowerCase()] = value; }, end(data) { this.body = data || ''; }, json() { return JSON.parse(this.body); }}; }
async function get(handler, query, {method = 'GET', ip = '203.0.113.9'} = {}) {
  const res = makeRes();
  await handler({method, headers: {'x-forwarded-for': ip}, socket: {}, url: '/api/cep/lookup' + query}, res);
  return res;
}
{
  const fake = createFakeCep(), handler = lookupHandler.create({fetchImpl: fake.fetchImpl});
  const ok = await get(handler, '?cep=01310-100');
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(ok.json(), {cep: '01310100', ...ADDRESSES['01310100']}, 'digits only; street, district, city, state');
  assert.equal(ok.headers['cache-control'], 'no-store');
  assert.deepEqual(Object.keys((await get(handler, '?cep=35400000')).json()).sort(), ['cep', 'city', 'district', 'state', 'street'], 'same shape for a town-wide CEP');
  for (const bad of ['', '?cep=', '?cep=0131010', '?cep=abc', '?cep=013101000']) { const res = await get(handler, bad); assert.deepEqual([res.statusCode, res.json()], [400, {error: 'invalid_request', field: 'cep'}], `refused: ${bad}`); }
  assert.equal((await get(handler, '?cep=01310100', {method: 'POST'})).statusCode, 405);
  const missing = await get(handler, '?cep=99999000'); assert.deepEqual([missing.statusCode, missing.json()], [404, {error: 'not_found'}]);
  fake.setDown('all');
  const down = await get(handler, '?cep=40020000'); assert.deepEqual([down.statusCode, down.json()], [503, {error: 'cep_unavailable'}]);
  assert(logged.some(line => line.includes('cep/lookup:')), 'the outage is logged (the CEP is not)');
  assert(logged.every(line => !/\d{8}/.test(line)), 'no CEP in the logs');
}
{
  // 60 lookups per address every 10 minutes, then 429; another address is not limited
  const fake = createFakeCep(), handler = lookupHandler.create({fetchImpl: fake.fetchImpl});
  let last;
  for (let i = 0; i < 61; i++) last = await get(handler, '?cep=01310100', {ip: '198.51.100.7'});
  assert.equal(last.statusCode, 429); assert(Number(last.headers['retry-after']) > 0);
  assert.equal((await get(handler, '?cep=01310100', {ip: '198.51.100.8'})).statusCode, 200);
}

// ── the browser client and the words ────────────────────────────────────────────────────────────
{
  const {lookupCep, cepMessage} = await site('cep-client.js'), {translate} = await site('i18n-core.js');
  const asked = [];
  const answer = (status, body) => async url => { asked.push(String(url)); return {ok: status >= 200 && status < 300, status, json: async () => body}; };
  const found = await lookupCep('01310-100', {fetchImpl: answer(200, {cep: '01310100', street: ' Avenida Paulista ', district: 'Bela Vista', city: 'São Paulo', state: 'sp'})});
  assert.deepEqual(found, {ok: true, address: {street: 'Avenida Paulista', district: 'Bela Vista', city: 'São Paulo', state: 'SP'}});
  assert.deepEqual(asked, ['/api/cep/lookup?cep=01310100'], 'only this site is asked, with the digits only');
  assert.deepEqual(await lookupCep('1234'), {ok: false, error: 'invalid_cep'}); assert.equal(asked.length, 1, 'an incomplete CEP asks nothing');
  assert.deepEqual(await lookupCep('01310100', {fetchImpl: answer(404, {error: 'not_found'})}), {ok: false, error: 'not_found'});
  assert.deepEqual(await lookupCep('01310100', {fetchImpl: answer(503, {error: 'cep_unavailable'})}), {ok: false, error: 'unavailable'});
  assert.deepEqual(await lookupCep('01310100', {fetchImpl: answer(429, {error: 'too_many_requests'})}), {ok: false, error: 'unavailable'});
  assert.deepEqual(await lookupCep('01310100', {fetchImpl: answer(200, {street: 'x'})}), {ok: false, error: 'unavailable'}, 'an answer without a city is not an address');
  assert.deepEqual(await lookupCep('01310100', {fetchImpl: async () => { throw new Error('offline'); }}), {ok: false, error: 'unavailable'}, 'no network');
  const slow = await lookupCep('01310100', {timeout: 30, fetchImpl: (url, {signal}) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))});
  assert.deepEqual(slow, {ok: false, error: 'unavailable'}, 'a slow answer is cut off');

  const messages = [cepMessage(found), cepMessage({ok: true, address: {street: '', city: 'Ouro Preto'}}), cepMessage({ok: false, error: 'not_found'}), cepMessage({ok: false, error: 'unavailable'})];
  assert.equal(new Set(messages).size, 4, 'four different messages');
  for (const text of messages) for (const lang of ['en', 'es']) assert.notEqual(translate(text, lang), text, `${lang}: ${text}`);
}

// ── wired into the checkout ─────────────────────────────────────────────────────────────────────
{
  const checkout = fs.readFileSync(path.join(root, 'dist/checkout.js'), 'utf8').replace(/\r\n/g, '\n');
  assert(/import \{lookupCep, cepMessage\} from '\.\/cep-client\.js'/.test(checkout));
  assert(/field\('cep',[^)]*hint:true[^)]*\}\)/.test(checkout), 'the CEP field has a place for the message');
  assert(/<div class="form-grid">\$\{field\('cep',/.test(checkout), 'the CEP is the first address field (audit F1)');
  assert(/input\.value && input\.value !== input\.dataset\.autofill\)\) continue/.test(checkout), 'what the buyer typed is never overwritten');
  assert(!/viacep|brasilapi/i.test(checkout + fs.readFileSync(path.join(root, 'dist/cep-client.js'), 'utf8')), 'the browser never names an outside address service');
  const headers = fs.readFileSync(path.join(root, 'vercel.json'), 'utf8');
  assert(!/viacep|brasilapi/i.test(headers), 'no outside address service in the Content-Security-Policy: the browser only asks this site');
}

console.error = realError;
console.log('PASS: CEP lookup (ViaCEP then BrasilAPI, cache, outages, cleaning), GET /api/cep/lookup (errors, limit, logs), browser client, texts, checkout wiring');
