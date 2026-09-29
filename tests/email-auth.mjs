// E-mail: challenge signing, the verification template, sign-in codes sent through /api/auth/start (with a fake Resend),
// health/preview and source-level guards of the account and checkout pages. The account rules themselves are in
// tests/accounts.mjs; the browser adapter against the real API is in tests/account-commerce.mjs.
// Run: node tests/email-auth.mjs — no network, no keys.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const {issue, verify, makeCode, CODE_TTL_MS, RESEND_AFTER_MS} = require('../api/_lib/challenge');
const {renderVerificationEmail, verificationUrl, COPY} = require('../api/_lib/email-template');
const {createLimiter, sameOrigin} = require('../api/_lib/http');
const {config} = require('../api/_lib/mail');
const start = require('../api/auth/start'), verifyEndpoint = require('../api/auth/verify'), health = require('../api/health'), preview = require('../api/email-preview');
const {createMemoryStore} = require('../api/_lib/store-memory');

const SECRET = 'a-long-test-secret-that-has-more-than-32-chars';
const SITE = 'https://site.test';
const ENV = {SITE_URL: SITE, AUTH_SECRET: SECRET, RESEND_API_KEY: 're_test_key_123', MAIL_FROM: 'Ju <acesso@site.test>', VERCEL_ENV: 'production'};

// ── challenge ─────────────────────────────────────────────────────────
{
  const now = 1_000_000;
  const {code, token, payload} = issue({secret: SECRET, email: 'a@b.co', name: 'Ana', purpose: 'signup', now, code: '123456'});
  assert.equal(payload.x - payload.s, CODE_TTL_MS);
  assert(!Buffer.from(token.split('.')[0], 'base64url').toString().includes('123456'), 'the code itself is never inside the token');
  assert.deepEqual(verify({secret: SECRET, token, code, now: now + 1000}), {ok: true, email: 'a@b.co', purpose: 'signup', name: 'Ana', expiresAt: now + CODE_TTL_MS});
  assert.equal(verify({secret: SECRET, token, code: '654321', now}).reason, 'invalid_code');
  assert.equal(verify({secret: SECRET, token, code: '12345', now}).reason, 'invalid_code', 'must be six digits');
  assert.equal(verify({secret: SECRET, token, code: 123456, now}).reason, 'invalid_code', 'must be a string');
  assert.equal(verify({secret: SECRET, token, code, now: now + CODE_TTL_MS}).reason, 'expired');
  assert.equal(verify({secret: SECRET + 'x', token, code, now}).reason, 'invalid_challenge', 'another secret cannot validate it');
  const [body, signature] = token.split('.');
  const forged = JSON.parse(Buffer.from(body, 'base64url')); forged.e = 'victim@b.co';
  assert.equal(verify({secret: SECRET, token: Buffer.from(JSON.stringify(forged)).toString('base64url') + '.' + signature, code, now}).reason, 'invalid_challenge', 'edited payload is rejected');
  for (const bad of ['', 'abc', 'a.b', '.', null, undefined, 42, 'x'.repeat(2000) + '.y']) assert.equal(verify({secret: SECRET, token: bad, code, now}).ok, false);
  assert.equal(makeCode(() => 0), '000000');
  assert.equal(makeCode(() => 999999), '999999');
  assert.equal(makeCode(() => 42), '000042');
  assert.throws(() => issue({secret: '', email: 'a@b.co', purpose: 'signup'}));
}

// ── template ──────────────────────────────────────────────────────────
{
  const url = verificationUrl({siteUrl: SITE + '/', token: 'a.b-c_d', code: '123456'});
  assert.equal(url, `${SITE}/conta.html#verificar?c=a.b-c_d&k=123456`, 'code travels in the fragment');
  const subjects = new Set();
  for (const lang of ['pt-BR', 'en', 'es']) for (const purpose of ['signup', 'access', 'reset']) {
    const mail = renderVerificationEmail({lang, purpose, name: 'Maria', code: '482916', url, siteUrl: SITE});
    subjects.add(mail.subject);
    assert(mail.html.includes(`lang="${lang}"`));
    assert(mail.html.includes('482916') && mail.text.includes('482916'));
    assert(mail.html.includes(`${SITE}/assets/logo-ju-email.png`), 'transparent logo from the site');
    assert(/<img[^>]+alt="[^"]+"/.test(mail.html) && /width="172"/.test(mail.html));
    assert(mail.html.includes('&amp;k=123456'), 'link ampersands are escaped in the attribute');
    assert(mail.html.includes('juimprimepramim'), 'footer links to Instagram');
    assert(mail.html.includes('color-scheme" content="light only"'));
    assert(!/undefined|null|\$\{|\{\{/.test(mail.html + mail.text), `${lang}/${purpose}: leftover placeholder`);
    assert(!/<script/i.test(mail.html));
    const preheader = mail.html.match(/mso-hide:all;">([^<]*)</)[1];
    assert(!preheader.includes('482916'), 'the code is not in the inbox preview line');
    assert(mail.html.includes(`${new Date().getFullYear()}`));
  }
  assert.equal(subjects.size, 9, 'every purpose/language has its own subject');
  const hostile = renderVerificationEmail({lang: 'pt-BR', purpose: 'signup', name: '<img src=x onerror=alert(1)>"', code: '111111', url: 'https://x.test/?a=1&b="2"', siteUrl: SITE});
  assert(!hostile.html.includes('<img src=x'), 'no raw markup from the name'); assert(hostile.html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'name is shown escaped');
  assert(!hostile.html.includes('"2"'), 'url is attribute-escaped');
  assert(renderVerificationEmail({lang: 'xx', purpose: 'nope', code: '1', url, siteUrl: SITE}).html.includes('lang="xx"') === true);
  assert(renderVerificationEmail({lang: 'xx', purpose: 'nope', code: '1', url, siteUrl: SITE}).subject === COPY['pt-BR'].purposes.signup.subject, 'unknown language/purpose fall back to Portuguese sign-up');
  assert(renderVerificationEmail({lang: 'en', purpose: 'reset', name: '', code: '1', url, siteUrl: SITE}).text.includes('Hello!'));
  const split = renderVerificationEmail({lang: 'pt-BR', purpose: 'signup', code: '1', url, siteUrl: 'https://preview.test', assetUrl: 'https://public.test/'});
  assert(split.html.includes('src="https://public.test/assets/logo-ju-email.png"'), 'assetUrl decides where the logo is loaded from');
}

// ── helpers for handler tests ─────────────────────────────────────────
function makeRes() {
  return {statusCode: 200, headers: {}, body: '', setHeader(key, value) { this.headers[key.toLowerCase()] = value; }, end(data) { this.body = data || ''; }, json() { return JSON.parse(this.body); }};
}
async function call(handler, {method = 'POST', origin = SITE, body = {}, ip = '203.0.113.5'} = {}) {
  const res = makeRes();
  await handler({method, headers: {...(origin ? {origin} : {}), 'x-forwarded-for': ip}, body, socket: {}, url: '/'}, res);
  return res;
}
function fakeResend(response = {ok: true, status: 200, body: {id: 'em_1'}}) {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({url, init, body: JSON.parse(init.body)}); return {ok: response.ok, status: response.status, json: async () => response.body}; };
  return {fetchImpl, calls};
}
const codeFrom = html => html.match(/class="code"[^>]*>(\d{6})</)[1];

// ── sign-in codes by e-mail: api/auth/start + verify with a fake Resend ───────────────────
{
  const resend = fakeResend(), store = createMemoryStore();
  const starter = start.create({env: ENV, store, fetchImpl: resend.fetchImpl}), checker = verifyEndpoint.create({env: ENV, store});
  const reply = await call(starter, {body: {email: 'Ana@Site.test', purpose: 'access', lang: 'en'}});
  assert.equal(reply.statusCode, 200);
  const data = reply.json();
  assert.deepEqual(Object.keys(data).sort(), ['challenge', 'email', 'expiresAt', 'purpose', 'resendAt'], 'no code in the answer when e-mail works');
  assert.equal(data.email, 'ana@site.test');
  assert.equal(resend.calls.length, 1);
  const mail = resend.calls[0];
  assert.equal(mail.url, 'https://api.resend.com/emails');
  assert.deepEqual(mail.body.to, ['ana@site.test']);
  assert.equal(mail.body.from, 'Ju <acesso@site.test>');
  assert.equal(mail.init.headers.Authorization, 'Bearer re_test_key_123');
  assert.match(mail.init.headers['Idempotency-Key'], /^code-[0-9a-f-]{36}$/, 'a retried request never sends a second e-mail');
  const code = codeFrom(mail.body.html);
  assert(mail.body.html.includes('conta.html#verificar?c=') && mail.body.html.includes(encodeURIComponent(data.challenge)), 'the button opens the site with the code reference');
  assert(mail.body.text.includes(code), 'plain-text version carries the code');
  assert(!reply.body.includes(code), 'the code only travels by e-mail');
  const ok = await call(checker, {body: {challenge: data.challenge, code}});
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().status, 'needs_profile');
  assert.equal((await call(checker, {body: {challenge: data.challenge, code}})).json().error, 'invalid_challenge', 'a code works once');
  assert.equal((await call(starter, {origin: 'https://evil.test', body: {email: 'x@site.test'}})).statusCode, 403, 'other sites cannot send codes');
  assert.equal((await call(starter, {origin: '', body: {email: 'x@site.test'}})).statusCode, 403);
  assert.equal((await call(starter, {method: 'GET'})).statusCode, 405);
  assert.equal((await call(starter, {body: {email: 'not-an-email'}})).json().error, 'invalid_email');
  assert.equal(resend.calls.length, 1, 'refused requests send nothing');
}

// Resend refuses: 502 without the key; production without e-mail: 503; test site without e-mail: code shown on the page
{
  const store = createMemoryStore();
  const failing = fakeResend({ok: false, status: 403, body: {message: 'You can only send testing emails to your own email address'}});
  const refused = await call(start.create({env: ENV, store, fetchImpl: failing.fetchImpl}), {body: {email: 'b@site.test'}});
  assert.equal(refused.statusCode, 502);
  assert.equal(refused.json().error, 'send_failed');
  assert(!refused.body.includes('re_test_key_123') && !refused.body.includes('testing emails'), 'provider details and keys stay on the server');
  const productionOff = await call(start.create({env: {SITE_URL: SITE, VERCEL_ENV: 'production', AUTH_SECRET: SECRET}, store}), {body: {email: 'c@site.test'}});
  assert.equal(productionOff.statusCode, 503);
  assert.equal(productionOff.json().error, 'email_not_configured', 'production never shows codes on the page');
  const testSite = await call(start.create({env: {SITE_URL: SITE, APP_ENV: 'preview'}, store}), {body: {email: 'd@site.test'}});
  assert.equal(testSite.statusCode, 200);
  assert.match(testSite.json().demoCode, /^\d{6}$/, 'the test site without e-mail shows the code');
}

// only RESEND_API_KEY (what the Vercel integration provides): the code key is derived from it
{
  const onlyKey = {SITE_URL: SITE, RESEND_API_KEY: 're_test_key_123', VERCEL_ENV: 'production'};
  const a = config(onlyKey);
  assert.equal(a.secret.length, 64);
  assert(a.secret !== 're_test_key_123' && !a.secret.includes('re_test_key_123'), 'the derived secret does not expose the key');
  assert.equal(a.secretFrom, 'RESEND_API_KEY');
  assert.equal(config(onlyKey).secret, a.secret, 'stable between requests and instances');
  assert.notEqual(config({...onlyKey, RESEND_API_KEY: 're_other_key_456'}).secret, a.secret);
  assert.equal(config({...onlyKey, AUTH_SECRET: SECRET}).secret, SECRET, 'an explicit secret wins');
  assert.equal(config({...onlyKey, AUTH_SECRET: SECRET}).secretFrom, 'AUTH_SECRET');
  assert.equal(config({...onlyKey, AUTH_SECRET: 'short'}).secretFrom, 'RESEND_API_KEY', 'a too-short explicit secret is ignored');
  assert.equal(config({...onlyKey, RESEND_API_KEY: ' re_test_key_123\r\n'}).apiKey, 're_test_key_123', 'pasted whitespace is trimmed');
  assert.equal(config({SITE_URL: SITE}).secret, '', 'no key and no secret: nothing to sign with');
  const resend = fakeResend(), store = createMemoryStore();
  const sent = await call(start.create({env: onlyKey, store, fetchImpl: resend.fetchImpl}), {body: {email: 'a@b.co'}});
  assert.equal(sent.statusCode, 200, 'works with the key alone');
  const proof = {challenge: sent.json().challenge, code: codeFrom(resend.calls[0].body.html)};
  assert.equal((await call(verifyEndpoint.create({env: {...onlyKey, RESEND_API_KEY: 're_other_key_456'}, store}), {body: proof})).json().error, 'invalid_code', 'another key cannot verify it');
  assert.equal((await call(verifyEndpoint.create({env: onlyKey, store}), {body: proof})).statusCode, 200);
  const healthRes = makeRes(); await health.create({env: onlyKey})({}, healthRes);
  assert.deepEqual(healthRes.json(), {ok: true, mail: 'resend', secret: true, secretFrom: 'RESEND_API_KEY', key: true, sender: 'test', accounts: 'off', db: 'off', dataKeys: 'missing', payments: 'off', paymentsBlocked: false, mp: {token: false, publicKey: false, webhookSecret: false}, orderMail: false, admin: 'off', legal: 'pending', shipping: 'off'});
}

// limiter
{
  let t = 0; const limiter = createLimiter(() => t);
  assert(limiter.take('k', 2, 1000).ok && limiter.take('k', 2, 1000).ok);
  const blocked = limiter.take('k', 2, 1000); assert(!blocked.ok && blocked.retryAfter === 1);
  t = 1001; assert(limiter.take('k', 2, 1000).ok, 'window slides');
}

// health and preview never expose values
{
  const res = makeRes(); await health.create({env: ENV})({}, res);
  // Production without a database or data keys: accounts are off and the keys are reported missing (never shown).
  assert.deepEqual(res.json(), {ok: true, mail: 'resend', secret: true, secretFrom: 'AUTH_SECRET', key: true, sender: 'custom', accounts: 'off', db: 'off', dataKeys: 'missing', payments: 'off', paymentsBlocked: false, mp: {token: false, publicKey: false, webhookSecret: false}, orderMail: false, admin: 'off', legal: 'pending', shipping: 'off'});
  assert(!res.body.includes('re_test_key_123') && !res.body.includes(SECRET));
  const off = makeRes(); await health.create({env: {}})({}, off);
  assert.equal(off.json().mail, 'off');
  const prod = makeRes(); preview.create({env: ENV})({url: '/api/email-preview'}, prod);
  assert.equal(prod.statusCode, 404, 'the preview is not available in production');
  const dev = makeRes(); preview.create({env: {...ENV, VERCEL_ENV: 'development'}})({url: '/api/email-preview?purpose=access&lang=en&name=Ana'}, dev);
  assert.equal(dev.statusCode, 200); assert(dev.body.includes('FIRST ACCESS') && dev.body.includes('Hello, Ana.'));
}

// ── account and checkout pages (source level; the browser flows are checked by hand, see AUTH-VISUAL-QA.md) ──────────
{
  const account = fs.readFileSync(path.join(root, 'dist/account.js'), 'utf8').replace(/\r\n/g, '\n');
  assert(/screen === 'verify' \? challenge\?\.demoCode : screen === 'delete' \? deletion\?\.demoCode : ''/.test(account) && /demoCode\(\) \? `<div class="demo-code">/.test(account), 'the test-code box exists only when the code was not e-mailed');
  assert(/challenge\?\.demoCode \? 'Digite o código de teste/.test(account) && /Enviamos um código de seis números para o seu e-mail/.test(account), 'the verify screen tells the truth about where the code is');
  assert(/auth\.adopt\(token\)/.test(account) && /history\.replaceState\(null, '', location\.pathname \+ location\.search \+ '#verificar'\)/.test(account), 'the e-mail link is adopted and its secrets leave the address bar');
  assert(/mountLanguagePicker\(document\.querySelector\('\.account-tools'\)\)/.test(account), 'language picker in the account header');
  assert(/createBusyDialog/.test(account) && !/openProgress/.test(account), 'one loading UI: the shared busy dialog');
  assert(/await refreshSession\(\);\nroute\(\);/.test(account), 'the page asks the server who is signed in before choosing a screen');
  assert(/identificationForm\(/.test(account) && /saveProfile\(data\)/.test(account), '"Meus dados" uses the shared identification form');
  assert(/checkout: 'checkout\.html#identificacao'/.test(account), 'signing in from the checkout returns to identification');
  assert(!/de teste(…|!)/.test(account), 'no "test account" wording in the real flow');
  const service = fs.readFileSync(path.join(root, 'dist/auth-service.js'), 'utf8');
  assert(/AUTH_MODE = 'server'/.test(service) && !/createDemoAuth|passwordHash|crypto\.subtle/.test(service), 'no password handling in the browser');
  const checkout = fs.readFileSync(path.join(root, 'dist/checkout.js'), 'utf8').replace(/\r\n/g, '\n');
  assert(/if\(action==='checkout'&&purchaseItems\(\)\.length\)\{await toIdentification\(\);\}/.test(checkout), 'the cart continues to identification, not straight to delivery');
  assert(/location\.assign\(signInPage\(\)\)/.test(checkout), 'identification needs an account');
  for (const page of ['checkout.html', 'comprar-agora.html']) {
    const html = fs.readFileSync(path.join(root, 'dist', page), 'utf8');
    assert(/data-step="identification"><b>02<\/b> Identificação/.test(html) && /identification\.css/.test(html), `${page}: identification step and styles`);
  }
}

console.log('PASS: challenge signing/expiry/tampering, e-mail template (3 languages x 3 purposes, escaping), sign-in codes by e-mail (Resend call, idempotency key, link, single use, origin, no key leaks, 502/503, code on the page only on the test site, key derived from RESEND_API_KEY), limiter, health/preview, and account/checkout page guards.');
