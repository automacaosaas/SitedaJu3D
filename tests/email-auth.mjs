// E-mail verification: challenge, template, /api handlers (with a fake Resend) and the browser adapter.
// Run: node tests/email-auth.mjs — no network, no keys.
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const {issue, verify, makeCode, CODE_TTL_MS, RESEND_AFTER_MS} = require('../api/_lib/challenge');
const {renderVerificationEmail, verificationUrl, COPY} = require('../api/_lib/email-template');
const {createLimiter, sameOrigin} = require('../api/_lib/http');
const {config} = require('../api/_lib/mail');
const sendCode = require('../api/auth/send-code'), verifyCode = require('../api/auth/verify-code'), health = require('../api/health'), preview = require('../api/email-preview');
const {createMailer, createDemoAuth} = await import(pathToFileURL(path.join(root, 'dist/auth-service.js')).href);

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
const fresh = (env = ENV, extra = {}) => { const resend = fakeResend(); let t = 1_700_000_000_000; return {resend, clock: {set: value => { t = value; }, now: () => t}, handler: sendCode.create({env, fetchImpl: resend.fetchImpl, now: () => t, ...extra}), verifier: verifyCode.create({env, now: () => t})}; };

// ── send-code ─────────────────────────────────────────────────────────
{
  const {handler, resend, verifier, clock} = fresh();
  assert.equal((await call(handler, {method: 'GET'})).statusCode, 405);
  assert.equal((await call(handler, {origin: ''})).statusCode, 403, 'no Origin');
  assert.equal((await call(handler, {origin: 'https://evil.example', body: {email: 'a@b.co', purpose: 'signup'}})).statusCode, 403, 'foreign Origin');
  assert.equal((await call(handler, {origin: 'http://localhost:3000', body: {email: 'a@b.co', purpose: 'signup'}})).statusCode, 403, 'localhost is not trusted in production');
  for (const email of ['', 'nope', 'a@b', 'a b@c.de', 'a@b.co\nBcc: x@y.zz', 'a@b.co, c@d.ee', '<a@b.co>', 'x'.repeat(200) + '@b.co']) {
    assert.equal((await call(handler, {body: {email, purpose: 'signup'}})).statusCode, 400, `bad e-mail: ${JSON.stringify(email).slice(0, 40)}`);
  }
  assert.equal((await call(handler, {body: {email: 'a@b.co', purpose: 'admin'}})).statusCode, 400, 'unknown purpose');
  assert.equal((await call(handler, {body: 'not json'})).statusCode, 400, 'broken JSON');
  assert.equal(resend.calls.length, 0, 'nothing was sent for invalid requests');

  const ok = await call(handler, {body: {email: '  Maria@Example.COM ', name: 'Maria <b>Silva</b>\n', purpose: 'signup', lang: 'es'}});
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.headers['cache-control'], 'no-store');
  const reply = ok.json();
  assert.equal(resend.calls.length, 1);
  const sent = resend.calls[0];
  assert.equal(sent.url, 'https://api.resend.com/emails');
  assert.equal(sent.init.method, 'POST');
  assert.equal(sent.init.headers.Authorization, 'Bearer re_test_key_123');
  assert(/^signup-/.test(sent.init.headers['Idempotency-Key']));
  assert.deepEqual(sent.body.to, ['maria@example.com'], 'address is trimmed and lower-cased');
  assert.equal(sent.body.from, 'Ju <acesso@site.test>');
  assert(sent.body.subject.startsWith('Tu código de verificación'), 'language follows the request');
  assert(sent.body.html.includes('Maria bSilva/b') || sent.body.html.includes('Maria Silva'), 'name is cleaned of markup characters');
  assert(!sent.body.html.includes('<b>Silva'), 'no markup from the name');
  const code = codeFrom(sent.body.html);
  assert(!ok.body.includes(code), 'the response never contains the code');
  assert.deepEqual(Object.keys(reply).sort(), ['challenge', 'email', 'expiresAt', 'purpose', 'resendAt']);
  assert.equal(reply.resendAt - (reply.expiresAt - CODE_TTL_MS), RESEND_AFTER_MS);
  assert(sent.body.html.includes(encodeURIComponent(reply.challenge)) && sent.body.text.includes(`k=${code}`), 'the link carries the same challenge and code');

  // verify-code accepts it, rejects a wrong code, and expires
  assert.equal((await call(verifier, {body: {challenge: reply.challenge, code}})).json().email, 'maria@example.com');
  assert.equal((await call(verifier, {body: {challenge: reply.challenge, code: code === '000000' ? '111111' : '000000'}})).statusCode, 400);
  assert.equal((await call(verifier, {body: {challenge: 'a.b', code}})).json().error, 'invalid_challenge');
  assert.equal((await call(verifier, {origin: 'https://evil.example', body: {challenge: reply.challenge, code}})).statusCode, 403);
  assert.equal((await call(verifier, {method: 'GET'})).statusCode, 405);
  clock.set(clock.now() + CODE_TTL_MS + 1);
  const late = await call(verifier, {body: {challenge: reply.challenge, code}});
  assert.equal(late.statusCode, 410);
  assert.equal(late.json().error, 'expired');
}

// rate limits: 30-second cooldown per address, 4 per 10 minutes, 15 per hour per IP
{
  const {handler, clock} = fresh();
  const send = (email, ip) => call(handler, {body: {email, purpose: 'reset'}, ip});
  assert.equal((await send('r@b.co', '1.1.1.1')).statusCode, 200);
  const again = await send('r@b.co', '1.1.1.1');
  assert.equal(again.statusCode, 429);
  assert(Number(again.headers['retry-after']) > 0 && again.json().retryAfter > 0);
  let sends = 1;
  for (let i = 0; i < 6; i++) { clock.set(clock.now() + RESEND_AFTER_MS + 1); if ((await send('r@b.co', '1.1.1.1')).statusCode === 200) sends++; }
  assert.equal(sends, 4, 'at most 4 e-mails per address in 10 minutes');
  const {handler: h2} = fresh();
  let okCount = 0;
  for (let i = 0; i < 20; i++) if ((await call(h2, {body: {email: `u${i}@b.co`, purpose: 'signup'}, ip: '9.9.9.9'})).statusCode === 200) okCount++;
  assert.equal(okCount, 15, 'at most 15 e-mails per IP per hour');
}

// failures never leak the key and are reported as 502
{
  const errors = []; const original = console.error; console.error = (...args) => errors.push(args.join(' '));
  try {
    const failing = fakeResend({ok: false, status: 422, body: {message: 'The domain is not verified', name: 'validation_error'}});
    const handler = sendCode.create({env: ENV, fetchImpl: failing.fetchImpl});
    const res = await call(handler, {body: {email: 'a@b.co', purpose: 'signup'}});
    assert.equal(res.statusCode, 502);
    assert.deepEqual(res.json(), {error: 'send_failed'});
    assert(!res.body.includes('re_test_key_123') && !errors.join('\n').includes('re_test_key_123'), 'the API key never appears in responses or logs');
    assert(errors.join('\n').includes('422'), 'the failure is logged for the owner');
    const down = sendCode.create({env: ENV, fetchImpl: async () => { throw new Error('network down'); }});
    assert.equal((await call(down, {body: {email: 'a@b.co', purpose: 'signup'}})).statusCode, 502);
  } finally { console.error = original; }
}

// configuration: not configured → 503 (the site then falls back to the preview code)
{
  for (const env of [{...ENV, RESEND_API_KEY: ''}, {...ENV, RESEND_API_KEY: '', AUTH_SECRET: ''}, {...ENV, RESEND_API_KEY: '   ', AUTH_SECRET: 'short'}]) {
    const handler = sendCode.create({env, fetchImpl: async () => { throw new Error('must not be called'); }});
    const res = await call(handler, {body: {email: 'a@b.co', purpose: 'signup'}});
    assert.equal(res.statusCode, 503); assert.equal(res.json().error, 'email_not_configured');
  }
  // the console transport works outside production only
  const outbox = []; const dev = {...ENV, VERCEL_ENV: 'development', MAIL_TRANSPORT: 'console', RESEND_API_KEY: ''};
  const devHandler = sendCode.create({env: dev, outbox: mail => outbox.push(mail), fetchImpl: async () => { throw new Error('must not be called'); }});
  assert.equal((await call(devHandler, {origin: 'http://localhost:8844', body: {email: 'a@b.co', purpose: 'access'}})).statusCode, 200);
  assert.equal(outbox.length, 1); assert(/^\d{6}$/.test(outbox[0].code)); assert.equal(outbox[0].to, 'a@b.co');
  const prodConsole = sendCode.create({env: {...ENV, MAIL_TRANSPORT: 'console', RESEND_API_KEY: ''}, outbox: () => assert.fail('console transport must never run in production')});
  assert.equal((await call(prodConsole, {body: {email: 'a@b.co', purpose: 'signup'}})).statusCode, 503);
  assert.equal(config({...ENV, MAIL_TRANSPORT: 'console'}).transport, 'resend');
  // reply-to and the default test sender
  const withReply = fakeResend();
  await call(sendCode.create({env: {...ENV, MAIL_REPLY_TO: 'ju@site.test', MAIL_FROM: ''}, fetchImpl: withReply.fetchImpl}), {body: {email: 'a@b.co', purpose: 'signup'}});
  assert.equal(withReply.calls[0].body.reply_to, 'ju@site.test');
  assert(withReply.calls[0].body.from.includes('onboarding@resend.dev'), 'default sender is Resend\'s test address until a domain is verified');
  assert.equal(config({}).siteUrl, 'https://siteda-ju3-d.vercel.app');
  assert.equal(config({VERCEL_URL: 'x-git-branch.vercel.app'}).siteUrl, 'https://x-git-branch.vercel.app', 'previews link to themselves');
  assert.equal(config({VERCEL_URL: 'x.vercel.app', VERCEL_ENV: 'production'}).siteUrl, 'https://siteda-ju3-d.vercel.app', 'production never links to a preview host');
  assert.equal(sameOrigin({headers: {origin: 'https://x-git-branch.vercel.app'}}, {VERCEL_BRANCH_URL: 'x-git-branch.vercel.app', VERCEL_ENV: 'preview'}), true);
  assert.equal(sameOrigin({headers: {origin: 'null'}}, ENV), false);
}

// only RESEND_API_KEY (what the Vercel integration provides): the signing key is derived from it
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
  const resend = fakeResend();
  const sender = sendCode.create({env: onlyKey, fetchImpl: resend.fetchImpl}), checker = verifyCode.create({env: onlyKey});
  const sent = await call(sender, {body: {email: 'a@b.co', purpose: 'signup'}});
  assert.equal(sent.statusCode, 200, 'works with the key alone');
  const proof = {challenge: sent.json().challenge, code: codeFrom(resend.calls[0].body.html)};
  assert.equal((await call(checker, {body: proof})).statusCode, 200);
  assert.equal((await call(verifyCode.create({env: {...onlyKey, RESEND_API_KEY: 're_other_key_456'}}), {body: proof})).statusCode, 400, 'another key cannot verify it');
  const healthRes = makeRes(); health.create({env: onlyKey})({}, healthRes);
  assert.deepEqual(healthRes.json(), {ok: true, mail: 'resend', secret: true, secretFrom: 'RESEND_API_KEY', key: true, sender: 'test'});
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
  const res = makeRes(); health.create({env: ENV})({}, res);
  assert.deepEqual(res.json(), {ok: true, mail: 'resend', secret: true, secretFrom: 'AUTH_SECRET', key: true, sender: 'custom'});
  assert(!res.body.includes('re_test_key_123') && !res.body.includes(SECRET));
  const off = makeRes(); health.create({env: {}})({}, off);
  assert.equal(off.json().mail, 'off');
  const prod = makeRes(); preview.create({env: ENV})({url: '/api/email-preview'}, prod);
  assert.equal(prod.statusCode, 404, 'the preview is not available in production');
  const dev = makeRes(); preview.create({env: {...ENV, VERCEL_ENV: 'development'}})({url: '/api/email-preview?purpose=access&lang=en&name=Ana'}, dev);
  assert.equal(dev.statusCode, 200); assert(dev.body.includes('FIRST ACCESS') && dev.body.includes('Hello, Ana.'));
}

// ── browser adapter ───────────────────────────────────────────────────
{
  const reply = (status, data, isJson = true) => async () => ({status, ok: status >= 200 && status < 300, json: async () => { if (!isJson) throw new Error('not json'); return data; }});
  const send = fetchImpl => createMailer({fetchImpl, language: () => 'en'}).send({email: 'a@b.co', name: 'Ana', purpose: 'signup'});
  assert.equal(await send(reply(404, {}, false)), null, 'no /api on this host → preview');
  assert.equal(await send(reply(200, null, false)), null, 'HTML fallback page → preview');
  assert.equal(await send(reply(503, {error: 'email_not_configured'})), null, 'not configured yet → preview');
  await assert.rejects(send(reply(429, {error: 'too_many_requests'})), /Muitas tentativas/);
  await assert.rejects(send(reply(502, {error: 'send_failed'})), /Não foi possível enviar o e-mail/);
  await assert.rejects(send(reply(400, {error: 'invalid_email'})), /e-mail válido/);
  await assert.rejects(send(async () => { throw new TypeError('Failed to fetch'); }), /Sem conexão/, 'a network error is reported, not hidden behind the preview code');
  let body; const good = await send(async (url, init) => { body = JSON.parse(init.body); return {status: 200, ok: true, json: async () => ({challenge: 't.k', expiresAt: 5, resendAt: 3})}; });
  assert.deepEqual(good, {token: 't.k', expiresAt: 5, resendAt: 3});
  assert.deepEqual(body, {email: 'a@b.co', name: 'Ana', purpose: 'signup', lang: 'en'});
  const mailer = createMailer({fetchImpl: reply(400, {error: 'invalid_code'})});
  await assert.rejects(mailer.verify({token: 't', code: '1'}), /não confere/);
  await assert.rejects(createMailer({fetchImpl: reply(410, {error: 'expired'})}).verify({token: 't', code: '1'}), /expirou/);
  await assert.rejects(createMailer({fetchImpl: reply(400, {error: 'invalid_challenge'})}).verify({token: 't', code: '1'}), /link não é mais válido/);
  const {token} = issue({secret: SECRET, email: 'ana@b.co', name: 'Ana Lúcia', purpose: 'signup', now: 5});
  assert.deepEqual(mailer.peek(token), {email: 'ana@b.co', purpose: 'signup', name: 'Ana Lúcia', expiresAt: 5 + CODE_TTL_MS}, 'UTF-8 names survive the link');
  for (const bad of ['', 'x', '###.x', null, undefined]) assert.equal(mailer.peek(bad), null);
}

// ── account state machine with the e-mail service ─────────────────────
{
  const store = {}; // pretends to be the server
  const mailer = {
    async send({email, name, purpose}) { const {code, token, payload} = issue({secret: SECRET, email, name, purpose}); store.code = code; return {token, expiresAt: payload.x, resendAt: payload.s + RESEND_AFTER_MS}; },
    async verify({token, code}) { const r = verify({secret: SECRET, token, code}); if (!r.ok) throw Error(r.reason === 'expired' ? 'O código expirou. Solicite um novo código.' : 'O código não confere. Verifique os seis números.'); return {email: r.email, name: r.name, purpose: r.purpose}; },
    peek: createMailer().peek
  };
  let t = 10_000_000;
  const auth = createDemoAuth({mailer, now: () => t});
  const challenge = await auth.register({name: 'Maria', email: 'MARIA@b.co', password: 'senha-forte-1'});
  assert(!('demoCode' in challenge), 'e-mailed challenges never expose a code to the page');
  assert.equal(challenge.email, 'maria@b.co');
  await assert.rejects(auth.verify({code: store.code === '000000' ? '111111' : '000000'}), /não confere/);
  const done = await auth.verify({code: store.code});
  assert.deepEqual(done.user, {name: 'Maria', email: 'maria@b.co', demo: true});
  assert.equal((await auth.login({email: 'maria@b.co', password: 'senha-forte-1'})).name, 'Maria', 'the password chosen at sign-up still works after verification');
  await assert.rejects(auth.verify({code: store.code}), /Solicite um novo código/, 'single use');

  // recovery, and resend through the service once the 30-second cooldown has passed
  await auth.forgot({email: 'maria@b.co'});
  t += 5000; await assert.rejects(auth.resend(), /Aguarde 30 segundos/);
  t += 31_000; await auth.resend();
  assert.equal((await auth.verify({code: store.code})).resetAllowed, true);
  await auth.reset({password: 'nova-senha-123'});
  assert.equal((await auth.login({email: 'maria@b.co', password: 'nova-senha-123'})).email, 'maria@b.co');

  // the link from the e-mail, opened in a page that knows nothing about the sign-up
  const {token, code} = issue({secret: SECRET, email: 'joana@b.co', name: 'Joana Silva', purpose: 'signup'});
  const other = createDemoAuth({mailer, now: () => t});
  const adopted = other.adopt(token);
  assert.equal(adopted.email, 'joana@b.co'); assert.equal(adopted.purpose, 'signup');
  assert.deepEqual((await other.verify({code})).user, {name: 'Joana Silva', email: 'joana@b.co', demo: true});
  assert.throws(() => other.adopt('lixo'), /link não é mais válido/);
  const resetLink = issue({secret: SECRET, email: 'lia@b.co', purpose: 'reset'});
  const third = createDemoAuth({mailer, now: () => t});
  third.adopt(resetLink.token);
  assert.equal((await third.verify({code: resetLink.code})).resetAllowed, true);
  await third.reset({password: 'senha-da-lia-1'});
  assert.equal((await third.login({email: 'lia@b.co', password: 'senha-da-lia-1'})).email, 'lia@b.co', 'a verified recovery can set a password even in a fresh page');

  // no service on this host: the preview keeps working with its test code
  const offline = createDemoAuth({mailer: {send: async () => null, verify: async () => assert.fail('unused'), peek: () => null}});
  const preview = await offline.register({name: 'Bia', email: 'bia@b.co', password: 'senha-da-bia-1'});
  assert(/^\d{6}$/.test(preview.demoCode));
  assert.equal((await offline.verify({code: preview.demoCode})).user.name, 'Bia');
  // the server's answer decides which address was verified
  const liar = createDemoAuth({mailer: {...mailer, verify: async () => ({email: 'real@b.co', name: 'Real'})}, now: () => t});
  await liar.register({name: 'Fake', email: 'fake@b.co', password: 'senha-forte-1'});
  assert.equal((await liar.verify({code: '123456'})).user.email, 'real@b.co');
}

console.log('PASS: challenge signing/expiry/tampering, e-mail template (3 languages x 3 purposes, escaping), send/verify handlers with a fake Resend (origin, validation, cooldown and volume limits, no key leaks, 502/503), health/preview, browser adapter and account flow including the e-mail link.');
