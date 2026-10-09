// "Continuar com o Google / com a Apple": the round trip against the simulator of both providers (tools/fake-oauth.cjs,
// real signatures), the account rules (a new account, the same account next time, linking to an e-mail account without a
// duplicate, Apple's "Ocultar meu e-mail"), and the checks that keep it safe (signed state cookie, state, nonce, issuer,
// audience, expiry, signature, single-use code, verified e-mail only). Run: node tests/social-login.mjs — no network.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import lightCssModule from './lib/light-css.cjs';
import versionsModule from '../tools/sync-versions.cjs';
const {withoutVersions} = versionsModule;   // pages read without the ?v= of their stylesheets and scripts (tests/versioned-assets.mjs checks them)
const {lightCss} = lightCssModule;

const require = createRequire(import.meta.url);
const social = require('../api/_lib/social');
const routes = require('../api/_lib/social-http');
const {createMemoryStore} = require('../api/_lib/store-memory');
const {createAccounts} = require('../api/_lib/accounts');
const {createFakeOAuth, fakeCredentials} = require('../tools/fake-oauth.cjs');

const SITE = 'https://loja.test', BASE = `${SITE}/__fake-oauth`;
const ENV = {SITE_URL: SITE, APP_ENV: 'preview', AUTH_SECRET: 's'.repeat(40), ...fakeCredentials(BASE)};
const fake = createFakeOAuth({base: BASE, env: ENV});
let store = createMemoryStore();

// A Node-style request/response pair, enough for the handlers.
function call(handler, {method = 'GET', url, cookie = '', body} = {}) {
  return new Promise((resolve, reject) => {
    const headers = {};
    const res = {statusCode: 200, setHeader(k, v) { headers[k.toLowerCase()] = v; }, end(data) { resolve({status: this.statusCode, headers, body: data ? String(data) : ''}); }};
    const req = {method, url, body, headers: {cookie, 'user-agent': 'teste', 'x-forwarded-for': '203.0.113.9'}, socket: {remoteAddress: '203.0.113.9'}};
    Promise.resolve(handler(req, res)).catch(reject);
  });
}
const cookieValue = (set, name) => (Array.isArray(set) ? set : [set]).find(c => c?.startsWith(`${name}=`));

// The whole round trip: start → (the person approves at the provider) → callback.
async function signIn(provider, person = {}, {next = '', env = ENV, tamper = null} = {}) {
  const start = await call(routes.startRoute(provider).create({env}), {url: `/api/auth/${provider}/start${next ? `?next=${next}` : ''}`});
  assert.equal(start.status, 302, 'start redirects to the provider');
  const location = new URL(start.headers.location), query = Object.fromEntries(location.searchParams);
  let cookie = cookieValue(start.headers['set-cookie'], social.STATE_COOKIE)?.split(';')[0] || '';
  let params = person.cancel ? {error: provider === 'google' ? 'access_denied' : 'user_cancelled_authorize', state: query.state} : fake.approve(provider, query, person);
  if (tamper) ({cookie, params} = tamper({cookie, params, query}));
  const handler = routes.callbackRoute(provider).create({env, store, fetchImpl: fake.fetchImpl, keys: social.createKeyCache()});
  const result = provider === 'google'
    ? await call(handler, {url: `/api/auth/google/callback?${new URLSearchParams(params)}`, cookie})
    : await call(handler, {method: 'POST', url: '/api/auth/apple/callback', body: new URLSearchParams(params).toString(), cookie});
  return {start, location, query, params, result, session: cookieValue(result.headers['set-cookie'], '__Host-ju_session')};
}
const countCustomers = async emails => (await Promise.all(emails.map(e => store.customers.findByEmail(e)))).filter(Boolean).length;

// ── which buttons show ──
{
  const providers = async env => JSON.parse((await call(routes.providersRoute().create({env}), {url: '/api/auth/providers'})).body);
  assert.deepEqual(await providers(ENV), {google: true, apple: true});
  assert.deepEqual(await providers({SITE_URL: SITE, APP_ENV: 'preview'}), {google: false, apple: false}, 'without credentials, no button');
  const {APPLE_PRIVATE_KEY, ...noApple} = ENV;
  assert.deepEqual(await providers(noApple), {google: true, apple: false}, 'each provider on its own');
  assert.deepEqual(social.enabled({...ENV, APP_ENV: 'production', AUTH_SECRET: '', RESEND_API_KEY: ''}), {google: false, apple: false}, 'production needs the server secret for the state cookie');
}

// ── start: what goes to the provider ──
{
  const google = await signIn('google', {email: 'inicio@exemplo.test'});
  assert.equal(`${google.location.origin}${google.location.pathname}`, `${BASE}/google/authorize`);
  assert.equal(google.query.client_id, ENV.GOOGLE_CLIENT_ID);
  assert.equal(google.query.redirect_uri, `${SITE}/api/auth/google/callback`, 'the address registered in the Google console');
  assert.equal(google.query.response_type, 'code'); assert.equal(google.query.scope, 'openid email profile');
  assert.equal(google.query.code_challenge_method, 'S256', 'PKCE'); assert.match(google.query.code_challenge, /^[\w-]{43}$/);
  assert.match(google.query.state, /^[\w-]{32}$/); assert.match(google.query.nonce, /^[\w-]{32}$/);
  assert.match(google.start.headers['set-cookie'][0], /^__Host-ju_social=[\w-]+\.[\w-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/, 'signed, short-lived, HTTPS-only state cookie');
  const apple = await signIn('apple', {email: 'inicio@exemplo.test'});
  assert.equal(apple.query.response_mode, 'form_post', 'Apple answers with a form POST');
  assert.equal(apple.query.scope, 'name email'); assert.equal(apple.query.redirect_uri, `${SITE}/api/auth/apple/callback`);
  assert.equal(apple.query.code_challenge, undefined);
  assert.match(apple.start.headers['set-cookie'][0], /SameSite=None; Max-Age=600$/, 'the cookie must travel with Apple\'s cross-site POST');
  // In production the simulator address is ignored: the real providers, always.
  const prodEnv = {...ENV, APP_ENV: 'production'};
  const real = await call(routes.startRoute('google').create({env: prodEnv}), {url: '/api/auth/google/start'});
  assert.match(real.headers.location, /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
  const realApple = await call(routes.startRoute('apple').create({env: prodEnv}), {url: '/api/auth/apple/start'});
  assert.match(realApple.headers.location, /^https:\/\/appleid\.apple\.com\/auth\/authorize\?/);
  const off = await call(routes.startRoute('google').create({env: {SITE_URL: SITE, APP_ENV: 'preview'}}), {url: '/api/auth/google/start?next=checkout'});
  assert.equal(off.headers.location, '/conta?next=checkout#entrar?erro=social_unavailable', 'a provider without credentials explains itself');
}

// ── Google: a new account, then the same one ──
store = createMemoryStore();
{
  const first = await signIn('google', {email: 'Ana.Souza@Exemplo.test', firstName: 'Ana', lastName: 'Souza', picture: 'https://lh3.googleusercontent.com/a/foto-da-ana=s96-c'});
  assert.equal(first.result.status, 303);
  assert.equal(first.result.headers.location, '/conta#bem-vindo', 'a new account is welcomed and asked for what is missing');
  assert.match(first.session, /^__Host-ju_session=[\w-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Expires=/, 'the same session cookie as the e-mailed code');
  assert.match(cookieValue(first.result.headers['set-cookie'], social.STATE_COOKIE), /Max-Age=0/, 'the state cookie is spent');
  const ana = await store.customers.findByEmail('ana.souza@exemplo.test');
  assert.ok(ana, 'account created with the lower-cased e-mail');
  assert.equal(ana.displayName, 'Ana Souza'); assert.equal(ana.firstName, 'Ana'); assert.equal(ana.lastName, 'Souza');
  assert.ok(ana.emailVerifiedAt, 'already verified by Google'); assert.equal(ana.passwordHash, null);
  assert.equal(ana.avatarUrl, 'https://lh3.googleusercontent.com/a/foto-da-ana=s96-c', 'the profile photo');
  assert.equal(ana.termsVersion, require('../api/_lib/legal').TERMS_VERSION, 'continuing is agreeing to the Termos, recorded like the sign-up');
  assert.equal(ana.marketingOptIn, false, 'no marketing without asking');
  const ids = await store.identities.listByCustomer(ana.id);
  assert.deepEqual(ids.map(i => [i.provider, i.subject, i.email]), [['google', fake.subjectOf('google', 'ana.souza@exemplo.test'), 'ana.souza@exemplo.test']]);
  const token = first.session.split(';')[0].split('=')[1];
  assert.equal((await createAccounts({store, env: ENV}).authenticate(token)).id, ana.id, 'the session works like any other');

  const again = await signIn('google', {email: 'ana.souza@exemplo.test', firstName: 'Ana', lastName: 'Souza'});
  assert.equal(again.result.headers.location, '/conta', 'next time, straight to the account');
  assert.equal((await createAccounts({store, env: ENV}).authenticate(again.session.split(';')[0].split('=')[1])).id, ana.id, 'the same account');
  assert.equal((await store.identities.listByCustomer(ana.id)).length, 1, 'no second identity');
  // Found by Google's id even with another e-mail on the Google account now.
  const moved = await signIn('google', {email: 'ana.nova@exemplo.test', subject: fake.subjectOf('google', 'ana.souza@exemplo.test')});
  assert.equal((await createAccounts({store, env: ENV}).authenticate(moved.session.split(';')[0].split('=')[1])).id, ana.id);
  assert.equal(await store.customers.findByEmail('ana.nova@exemplo.test'), null, 'no account for the new address');
  // A photo from anywhere else is not kept (the security policy only allows Google's).
  const odd = await signIn('google', {email: 'foto@exemplo.test', picture: 'https://exemplo.test/foto.jpg'});
  assert.equal(odd.result.status, 303); assert.equal((await store.customers.findByEmail('foto@exemplo.test')).avatarUrl, null);
}

// ── linking: an account made with the e-mailed code, then Google or Apple with the same address ──
{
  const accounts = createAccounts({store, env: ENV});
  const started = await accounts.start({email: 'bia@exemplo.test'});
  const challenge = await store.challenges.find(started.challenge.split('.')[0]);
  const {grant} = await accounts.verify({challenge: started.challenge, code: started.demoCode});
  const {user} = await accounts.register({grant, name: 'Bia', password: 'senha-forte-123'});
  assert.ok(challenge && user);
  const bia = await store.customers.findByEmail('bia@exemplo.test');
  const viaGoogle = await signIn('google', {email: 'bia@exemplo.test', firstName: 'Beatriz', lastName: 'Lima'});
  assert.equal(viaGoogle.result.headers.location, '/conta', 'an existing account: no welcome');
  assert.equal(await countCustomers(['bia@exemplo.test']), 1, 'one account, never a duplicate');
  assert.equal((await createAccounts({store, env: ENV}).authenticate(viaGoogle.session.split(';')[0].split('=')[1])).id, bia.id, 'signed in to the existing account');
  const linked = await store.customers.findById(bia.id);
  assert.equal(linked.displayName, 'Bia', 'the name chosen at sign-up stays'); assert.ok(linked.passwordHash, 'and the password too');
  const viaApple = await signIn('apple', {email: 'bia@exemplo.test', firstName: 'Beatriz', lastName: 'Lima'});
  assert.equal((await createAccounts({store, env: ENV}).authenticate(viaApple.session.split(';')[0].split('=')[1])).id, bia.id, 'Apple with the same e-mail: the same account');
  assert.deepEqual((await store.identities.listByCustomer(bia.id)).map(i => i.provider), ['google', 'apple']);
  // An e-mail Google did not verify is never linked nor used.
  const unverified = await signIn('google', {email: 'bia@exemplo.test', verified: false, subject: 'outra-conta-google'});
  assert.equal(unverified.result.headers.location, '/conta#entrar?erro=social_email_unverified');
  assert.equal(unverified.session, undefined, 'no session');
  assert.equal(await store.identities.find('google', 'outra-conta-google'), null);
  const fresh = await signIn('google', {email: 'ninguem@exemplo.test', verified: false});
  assert.equal(fresh.result.headers.location, '/conta#entrar?erro=social_email_unverified');
  assert.equal(await store.customers.findByEmail('ninguem@exemplo.test'), null);
}

// ── Apple: form_post, the name only the first time, "Ocultar meu e-mail" ──
{
  const hidden = await signIn('apple', {email: 'caio@exemplo.test', firstName: 'Caio', lastName: 'Prado', hideEmail: true});
  assert.equal(hidden.result.status, 303); assert.equal(hidden.result.headers.location, '/conta#bem-vindo');
  const relay = fake.relayOf('caio@exemplo.test');
  assert.match(relay, /@privaterelay\.appleid\.com$/);
  const caio = await store.customers.findByEmail(relay);
  assert.ok(caio, 'the private relay address is the account e-mail (Apple forwards to the real one)');
  assert.equal(caio.displayName, 'Caio Prado', 'the name from the "user" field of the first authorization');
  assert.equal(caio.avatarUrl, null);
  const [identity] = await store.identities.listByCustomer(caio.id);
  assert.equal(identity.privateEmail, true); assert.equal(identity.email, relay);
  const second = await signIn('apple', {email: 'caio@exemplo.test', hideEmail: true, firstTime: false});
  assert.equal(second.result.headers.location, '/conta', 'no name the second time, still the same account');
  assert.equal((await createAccounts({store, env: ENV}).authenticate(second.session.split(';')[0].split('=')[1])).id, caio.id);
  assert.equal((await store.customers.findById(caio.id)).displayName, 'Caio Prado', 'the name is kept');
  // The real address of a hidden e-mail never matches another account: a new one (the person chose to hide it).
  assert.equal(await store.customers.findByEmail('caio@exemplo.test'), null);
}

// ── where to go next ──
{
  const toCheckout = await signIn('google', {email: 'dani@exemplo.test', firstName: 'Dani', lastName: 'Reis'}, {next: 'checkout'});
  assert.equal(toCheckout.result.headers.location, '/checkout#identificacao', 'back to the checkout, which asks for CPF and phone');
  const toBuyNow = await signIn('apple', {email: 'dani@exemplo.test'}, {next: 'comprar-agora'});
  assert.equal(toBuyNow.result.headers.location, '/comprar-agora#identificacao');
  const toOrders = await signIn('google', {email: 'dani@exemplo.test'}, {next: 'pedidos'});
  assert.equal(toOrders.result.headers.location, '/conta#pedidos');
  const odd = await signIn('google', {email: 'dani@exemplo.test'}, {next: 'https://golpe.example/'});
  assert.equal(odd.result.headers.location, '/conta', 'only the known destinations, never an address from the link');
}

// ── what is refused ──
{
  const expect = async (label, run, code, next = '') => {
    const {result} = await run();
    assert.equal(result.status, 303, label);
    assert.equal(result.headers.location, `/conta${['checkout', 'comprar-agora'].includes(next) ? `?next=${next}` : ''}#entrar?erro=${code}`, label);
    assert.equal(cookieValue(result.headers['set-cookie'], '__Host-ju_session'), undefined, `${label}: no session`);
  };
  const person = {email: 'eva@exemplo.test'};
  await expect('cancelled at Google', () => signIn('google', {cancel: true}, {next: 'checkout'}), 'social_cancelled', 'checkout');
  await expect('cancelled at Apple', () => signIn('apple', {cancel: true}), 'social_cancelled');
  await expect('another state', () => signIn('google', person, {tamper: ({cookie, params}) => ({cookie, params: {...params, state: 'x'.repeat(32)}})}), 'social_expired');
  await expect('no state cookie (another browser)', () => signIn('google', person, {tamper: ({params}) => ({cookie: '', params})}), 'social_expired');
  await expect('a changed cookie', () => signIn('apple', person, {tamper: ({cookie, params}) => ({cookie: cookie.replace(/=(.)/, (m, c) => `=${c === 'a' ? 'b' : 'a'}`), params})}), 'social_expired');
  await expect('a Google cookie at the Apple callback', async () => {
    const google = await call(routes.startRoute('google').create({env: ENV}), {url: '/api/auth/google/start'});
    const appleStart = await call(routes.startRoute('apple').create({env: ENV}), {url: '/api/auth/apple/start'});
    const query = Object.fromEntries(new URL(appleStart.headers.location).searchParams);
    const handler = routes.callbackRoute('apple').create({env: ENV, store, fetchImpl: fake.fetchImpl});
    return {result: await call(handler, {method: 'POST', url: '/api/auth/apple/callback', body: new URLSearchParams(fake.approve('apple', query, person)).toString(), cookie: google.headers['set-cookie'][0].split(';')[0]})};
  }, 'social_expired');
  await expect('a state cookie older than 10 minutes', async () => {
    const old = Date.now() - 11 * 60 * 1000;
    const start = await call(routes.startRoute('google').create({env: ENV, now: () => old}), {url: '/api/auth/google/start'});
    const query = Object.fromEntries(new URL(start.headers.location).searchParams);
    const handler = routes.callbackRoute('google').create({env: ENV, store, fetchImpl: fake.fetchImpl});
    return {result: await call(handler, {url: `/api/auth/google/callback?${new URLSearchParams(fake.approve('google', query, person))}`, cookie: start.headers['set-cookie'][0].split(';')[0]})};
  }, 'social_expired');
  // A code is good once: the same answer replayed is refused by the provider.
  let replay = null;
  const first = await signIn('google', person, {tamper: ({cookie, params}) => { replay = {cookie, params}; return {cookie, params}; }});
  assert.equal(first.result.status, 303);
  const again = await call(routes.callbackRoute('google').create({env: ENV, store, fetchImpl: fake.fetchImpl}), {url: `/api/auth/google/callback?${new URLSearchParams(replay.params)}`, cookie: replay.cookie});
  assert.equal(again.headers.location, '/conta#entrar?erro=social_failed', 'the code was already used');
  // The wrong PKCE verifier (someone else's code): refused by Google.
  await expect('a code from another start', async () => {
    const a = await call(routes.startRoute('google').create({env: ENV}), {url: '/api/auth/google/start'});
    const b = await call(routes.startRoute('google').create({env: ENV}), {url: '/api/auth/google/start'});
    const qa = Object.fromEntries(new URL(a.headers.location).searchParams), qb = Object.fromEntries(new URL(b.headers.location).searchParams);
    const stolen = fake.approve('google', qa, person);
    return {result: await call(routes.callbackRoute('google').create({env: ENV, store, fetchImpl: fake.fetchImpl}), {url: `/api/auth/google/callback?${new URLSearchParams({code: stolen.code, state: qb.state})}`, cookie: b.headers['set-cookie'][0].split(';')[0]})};
  }, 'social_failed');
  // No database (production without MySQL): accounts are off.
  const noStore = await call(routes.callbackRoute('google').create({env: {...ENV, APP_ENV: 'production', DB_HOST: ''}, store: null}), {url: '/api/auth/google/callback?code=x&state=y'});
  assert.match(noStore.headers.location, /#entrar\?erro=(accounts_unavailable|social_expired)$/);
}

// ── the ID token checks, one by one ──
{
  const keys = social.createKeyCache();
  const {privateKey: otherKey} = crypto.generateKeyPairSync('rsa', {modulusLength: 2048});
  const now = Date.now(), iat = Math.floor(now / 1000);
  const base = {iss: `${BASE}/google`, aud: ENV.GOOGLE_CLIENT_ID, sub: '123', nonce: 'n-1', iat, exp: iat + 600, email: 'a@exemplo.test', email_verified: true};
  const check = (token, extra = {}) => social.verifyIdToken(token, {jwks: `${BASE}/google/jwks`, issuers: [`${BASE}/google`], audience: ENV.GOOGLE_CLIENT_ID, nonce: 'n-1', now, fetchImpl: fake.fetchImpl, keys, ...extra});
  assert.equal((await check(fake.sign(base))).sub, '123', 'a good token');
  const forged = (() => { const signed = `${Buffer.from(JSON.stringify({alg: 'RS256', kid: fake.jwk.kid})).toString('base64url')}.${Buffer.from(JSON.stringify(base)).toString('base64url')}`; return `${signed}.${crypto.sign('sha256', Buffer.from(signed), otherKey).toString('base64url')}`; })();
  await assert.rejects(check(forged), /bad signature/, 'signed by someone else');
  await assert.rejects(check(fake.sign({...base, aud: 'outro-app'})), /audience/);
  await assert.rejects(check(fake.sign({...base, iss: 'https://golpe.example'})), /issuer/);
  await assert.rejects(check(fake.sign({...base, exp: iat - 600})), /expired/);
  await assert.rejects(check(fake.sign({...base, nonce: 'n-2'})), /nonce/, 'a token made for another sign-in');
  await assert.rejects(check(fake.sign({...base, sub: ''})), /subject/);
  const none = `${Buffer.from(JSON.stringify({alg: 'none'})).toString('base64url')}.${Buffer.from(JSON.stringify(base)).toString('base64url')}.`;
  await assert.rejects(check(none), /algorithm/, 'alg "none" is never accepted');
  await assert.rejects(check('nada'), /malformed/);
  // An unknown key id: one new download of the keys, not a loop.
  let downloads = 0;
  const counting = (url, init) => { downloads++; return fake.fetchImpl(url, init); };
  const fresh = social.createKeyCache({refetchAfter: 60 * 1000});
  const unknownKid = (() => { const signed = `${Buffer.from(JSON.stringify({alg: 'RS256', kid: 'outra'})).toString('base64url')}.${Buffer.from(JSON.stringify(base)).toString('base64url')}`; return `${signed}.${crypto.sign('sha256', Buffer.from(signed), otherKey).toString('base64url')}`; })();
  await assert.rejects(check(unknownKid, {keys: fresh, fetchImpl: counting}), /unknown key/);
  await assert.rejects(check(unknownKid, {keys: fresh, fetchImpl: counting}), /unknown key/);
  assert.equal(downloads, 1, 'the keys are downloaded once, then kept');
}

// ── Apple's client secret (ES256) and the .p8 key as pasted in a panel ──
{
  const {privateKey, publicKey} = crypto.generateKeyPairSync('ec', {namedCurve: 'P-256'});
  const pem = privateKey.export({type: 'pkcs8', format: 'pem'});
  const env = {APPLE_CLIENT_ID: 'br.com.loja.web', APPLE_TEAM_ID: 'TEAM123456', APPLE_KEY_ID: 'KEY1234567'};
  for (const pasted of [pem, pem.replace(/\n/g, '\\n'), pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '')]) {
    const secret = social.appleClientSecret({...env, APPLE_PRIVATE_KEY: pasted}, Date.UTC(2026, 9, 6, 12));
    const [h, p, s] = secret.split('.');
    assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${p}`), {key: publicKey, dsaEncoding: 'ieee-p1363'}, Buffer.from(s, 'base64url')), 'signed with the .p8 key (ES256)');
    assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), {alg: 'ES256', kid: 'KEY1234567'});
    const claims = JSON.parse(Buffer.from(p, 'base64url'));
    assert.deepEqual([claims.iss, claims.sub, claims.aud], ['TEAM123456', 'br.com.loja.web', 'https://appleid.apple.com']);
    assert.ok(claims.exp - claims.iat <= 300, 'short-lived');
  }
  assert.throws(() => social.appleClientSecret({...env, APPLE_PRIVATE_KEY: 'não é uma chave'}), /social_unavailable/);
}

// ── deleting the account takes its Google / Apple links along ──
{
  const ana = await store.customers.findByEmail('ana.souza@exemplo.test');
  await store.customers.delete(ana.id);
  assert.deepEqual(await store.identities.listByCustomer(ana.id), []);
  assert.equal(await store.identities.find('google', fake.subjectOf('google', 'ana.souza@exemplo.test')), null);
  const back = await signIn('google', {email: 'ana.souza@exemplo.test', firstName: 'Ana', lastName: 'Souza'});
  assert.equal(back.result.headers.location, '/conta#bem-vindo', 'coming back after deleting is a new account');
}

// ── the page: buttons, welcome, messages, fonts, security policy, translations ──
{
  const fs = await import('node:fs'), path = await import('node:path'), {fileURLToPath, pathToFileURL} = await import('node:url');
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  // o CSS como o tema claro o lê (os tokens do escuro caem na reserva; tests/lib/light-css.cjs)
  const read = file => { const text = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n'); return file.endsWith('.css') ? lightCss(text) : file.endsWith('.html') ? withoutVersions(text) : text; };
  const site = file => import(pathToFileURL(path.join(root, 'dist', file)).href);
  const account = read('dist/account.js'), page = read('dist/conta.html'), service = read('dist/auth-service.js');
  // The buttons: under the e-mail form, after the divider, only the configured providers, leaving the side panel too.
  assert.match(account, /\$\{submit\('Continuar'\)\}<\/form>\$\{socialBlock\(\)\}<div class="auth-reassurance">/);
  assert.match(account, /<p class="social-divider"><span>ou entre com<\/span><\/p>/);
  assert.match(account, /button\('google', GOOGLE_LOGO, 'Continuar com o Google'\)/); assert.match(account, /button\('apple', APPLE_LOGO, 'Continuar com a Apple'\)/);
  assert.match(account, /href="\$\{esc\(socialStartUrl\(id, socialNext\(\)\)\)\}" target="_top"/, 'from the side panel (an iframe) the whole page goes to the provider');
  assert.match(account, /if \(!providers\.google && !providers\.apple\) return '';/, 'no provider configured, no block');
  assert.match(account, /Ao continuar, você concorda com os Termos de Uso e declara ter lido a Política de Privacidade\./, 'the agreement, as on the sign-up screen');
  for (const color of ['#EA4335', '#4285F4', '#FBBC05', '#34A853']) assert(account.includes(`fill="${color}"`), `Google's "G" keeps its ${color}`);
  const css = read('dist/account.css');
  assert.match(css, /\.social-google \{ background: #fff; color: #1f1f1f; border: 1px solid #747775; font-family: 'Roboto'/, 'Google: white, #747775 outline, Roboto');
  assert.match(css, /\.social-apple \{ background: #000; color: #fff;/, 'Apple: white on black');
  // Roboto Medium for the Google button: served by the shop since 2026-10-07 (theme.css, which this page loads; tests/fonts.mjs)
  assert.match(read('dist/theme.css'), /@font-face\{font-family:'Roboto';font-style:normal;font-weight:500;font-display:swap;src:url\(assets\/fonts\/roboto-500-latin\.woff2\?v=\d+\)/, 'Roboto Medium for the Google button');
  assert.match(page, /<link rel="stylesheet" href="theme\.css">/);
  // Back from the provider: a new account is welcomed (only what is missing); a problem is explained.
  assert.match(account, /else if \(routeName === 'bem-vindo' && getSession\(\)\) \{/);
  assert.match(account, /identificationForm\(\{profile: details, submitLabel: 'Salvar e continuar', formId: 'welcome-form', only: missing\}\)/);
  assert.match(account, /action\(missing\.length \? 'Agora não' : 'Ir para minha conta', 'profile'\)/, 'it can wait');
  assert.match(account, /if \(code\) feedback\.textContent = socialMessage\(code\);/);
  assert.match(account, /<img class="profile-avatar" src="\$\{esc\(session\.avatar\)\}" alt="" width="64" height="64" referrerpolicy="no-referrer">/);
  const {socialMessage, socialStartUrl} = await site('auth-service.js');
  for (const code of ['social_unavailable', 'social_cancelled', 'social_expired', 'social_failed', 'social_email_unverified']) {
    assert.ok(service.includes(`  ${code}: '`), `a message for ${code}`);
    assert.doesNotMatch(socialMessage(code), /social_|error/i);
  }
  assert.equal(socialMessage('qualquer'), socialMessage('social_failed'));
  assert.equal(socialStartUrl('google', 'checkout'), '/api/auth/google/start?next=checkout');
  assert.equal(socialStartUrl('apple'), '/api/auth/apple/start');
  // The short identification form of the welcome.
  const {missingIdentification, identificationForm, readIdentification} = await site('identification.js');
  assert.deepEqual(missingIdentification({firstName: 'Ana', lastName: 'Souza', cpf: null, phone: ''}), ['cpf', 'phone']);
  assert.deepEqual(missingIdentification({firstName: '', lastName: '', cpf: {masked: '***'}, phone: '(31) 99999-0000'}), ['firstName', 'lastName']);
  const short = identificationForm({profile: {firstName: 'Ana', lastName: 'Souza', phone: ''}, submitLabel: 'Salvar', formId: 'w', only: ['cpf', 'phone']});
  assert.match(short, /<input type="hidden" name="firstName" value="Ana">/); assert.match(short, /name="cpf"/); assert.match(short, /name="phone"/);
  assert.doesNotMatch(short, /name="cnpj"|name="marketingOptIn"|name="email"/, 'only what is missing: no company, consent or e-mail');
  const fakeForm = values => ({querySelector: selector => { const name = /\[name="(\w+)"\]/.exec(selector)?.[1]; return name in values ? (typeof values[name] === 'boolean' ? {checked: values[name]} : {value: values[name]}) : null; }});
  const {data} = readIdentification(fakeForm({firstName: 'Ana', lastName: 'Souza', cpf: '529.982.247-25', phone: '(31) 99999-0000'}));
  assert.equal('company' in data, false, 'the short form never touches the company data'); assert.equal('marketingOptIn' in data, false, 'nor the consent');
  // Google's photos only, in the policy of every page.
  const policy = JSON.parse(read('vercel.json')).headers.find(r => r.source === '/(.*)').headers.find(h => h.key === 'Content-Security-Policy').value;
  assert.match(policy.split(';').find(d => d.trim().startsWith('img-src')), / https:\/\/lh3\.googleusercontent\.com(\s|$)/);
  assert(page.includes('https://lh3.googleusercontent.com'), 'and in the page meta (node tools/sync-csp.cjs)');
  // Words in the three languages; the Privacy Policy tells what comes from Google and Apple.
  const {translate} = await site('i18n-core.js');
  assert.equal(translate('Continuar com o Google', 'en'), 'Continue with Google'); assert.equal(translate('Continuar com a Apple', 'es'), 'Continuar con Apple');
  for (const text of ['ou entre com', 'Salvar e continuar', 'Agora não', 'Telefone (WhatsApp)', socialMessage('social_cancelled'), socialMessage('social_email_unverified')])
    for (const locale of ['en', 'es']) assert.notEqual(translate(text, locale), text, `${locale}: ${text}`);
  const privacy = read('dist/privacidade.html');
  assert(privacy.includes('<strong>Entrar com o Google ou com a Apple:</strong>') && privacy.includes('@') === true && privacy.includes('Ocultar meu e-mail') && privacy.includes('<strong>Google e Apple:</strong>'), 'the Privacy Policy covers it');
  // Set-up: the variables listed, the local simulator, the routes.
  const example = read('.env.example');
  for (const name of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'APPLE_CLIENT_ID', 'APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY', 'SITE_URL', 'AUTH_SECRET']) assert.match(example, new RegExp(`^${name}=`, 'm'), `.env.example: ${name}`);
  assert.doesNotMatch(example, /^(GOOGLE_CLIENT_SECRET|APPLE_PRIVATE_KEY)=\S/m, 'no real value in the example');
  assert.match(read('.gitignore'), /^!\.env\.example$/m, '.env.example is tracked, .env never');
  const dev = read('tools/dev-server.cjs');
  assert.match(dev, /routes\[`\/api\/auth\/\$\{provider\}\/callback`\]/); assert.match(dev, /--fake-social/);
  assert.match(read('db/migrations/014_login_social.sql'), /CREATE TABLE customer_identities[^]*PRIMARY KEY \(provider, subject\)[^]*ON DELETE CASCADE/);
}

console.log('PASS: social login — Google (PKCE) and Apple (form_post, ES256 secret) against a simulator with real signatures; new account, the same account next time, linking by verified e-mail without duplicates, Apple\'s hidden e-mail, destinations, and every refusal (state, cookie, age, replay, PKCE, signature, issuer, audience, expiry, nonce, unverified e-mail).');
