'use strict';
// Sign in with Google and with Apple (OpenID Connect, authorization code flow), with Node built-ins only, like the rest of
// the server. This file talks to the providers and checks what they answer; the account rules (find by the provider's id,
// link to an account with the same verified e-mail, or create one) are in accounts.js (socialSignIn), and the endpoints in
// api/auth/google/* and api/auth/apple/* (social-http.js). Set-up of the consoles: SOCIAL-LOGIN.md.
//
// The round trip: start() sends the browser to the provider with a random state and nonce (and, for Google, PKCE), kept
// in a short-lived cookie signed with the server secret; the provider comes back to the callback with a code (Google with
// a GET, Apple with a form POST, response_mode=form_post); the code is exchanged server to server for an ID token, whose
// signature is checked against the provider's public keys (JWKS), and so are its issuer, audience, expiry and nonce.
const crypto = require('node:crypto');
const {isProduction} = require('./runtime');
const {config} = require('./mail');

const fail = (code, detail = '') => Object.assign(new Error(detail ? `${code}: ${detail}` : code), {code});
const b64 = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
const STATE_TTL = 10 * 60 * 1000;
const SKEW = 2 * 60 * 1000;
// Where the browser lands afterwards: the checkout (it asks for CPF and phone itself), "Meus pedidos", or the account.
const NEXT = {checkout: '/checkout.html#identificacao', 'comprar-agora': '/comprar-agora.html#identificacao', pedidos: '/conta.html#pedidos'};
const nextKey = value => Object.hasOwn(NEXT, value) ? value : '';

const PROVIDERS = {
  google: {
    label: 'Google',
    endpoints: {authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', jwks: 'https://www.googleapis.com/oauth2/v3/certs'},
    issuers: ['https://accounts.google.com', 'accounts.google.com'],
    enabled: env => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    clientId: env => env.GOOGLE_CLIENT_ID,
    scope: 'openid email profile',
    pkce: true,
    sameSite: 'Lax'   // the provider comes back with a top-level GET
  },
  apple: {
    label: 'Apple',
    endpoints: {authorize: 'https://appleid.apple.com/auth/authorize', token: 'https://appleid.apple.com/auth/token', jwks: 'https://appleid.apple.com/auth/keys'},
    issuers: ['https://appleid.apple.com'],
    enabled: env => Boolean(env.APPLE_CLIENT_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY),
    clientId: env => env.APPLE_CLIENT_ID,
    scope: 'name email',
    pkce: false,
    // Apple comes back with a cross-site form POST (form_post): a Lax cookie would not travel with it.
    sameSite: 'None'
  }
};

const enabled = (env = process.env) => Object.fromEntries(Object.entries(PROVIDERS).map(([id, p]) => [id, p.enabled(env) && Boolean(stateSecret(env, false))]));

// Outside production only, SOCIAL_FAKE_URL points both providers at the local simulator (tools/fake-oauth.cjs).
function endpointsFor(id, env, override) {
  if (override?.[id]) return override[id];
  const fake = !isProduction(env) && env.SOCIAL_FAKE_URL;
  if (fake) return {authorize: `${fake}/${id}/authorize`, token: `${fake}/${id}/token`, jwks: `${fake}/${id}/jwks`, issuer: `${fake}/${id}`};
  return PROVIDERS[id].endpoints;
}
const issuersFor = (id, endpoints) => endpoints.issuer ? [endpoints.issuer] : PROVIDERS[id].issuers;
const redirectUri = (id, env) => `${String(config(env).siteUrl || '').replace(/\/+$/, '')}/api/auth/${id}/callback`;

// ── the state cookie: what the callback needs, signed so it cannot be forged or changed ──
// __Host-: HTTPS only, this exact host, path "/". HttpOnly: no page script reads it. 10 minutes.
const STATE_COOKIE = '__Host-ju_social';
function stateSecret(env, required = true) {
  const secret = config(env).secret;
  if (secret) return secret;
  if (!isProduction(env)) return 'ju-imprime-pra-mim:dev-only:social';
  if (required) throw fail('social_unavailable', 'no AUTH_SECRET');
  return '';
}
const mac = (env, payload) => crypto.createHmac('sha256', stateSecret(env)).update(`social|${payload}`).digest('base64url');
function sealState(env, data) { const payload = b64(data); return `${payload}.${mac(env, payload)}`; }
function openState(env, sealed, now) {
  const [payload, signature] = String(sealed || '').split('.');
  if (!payload || !signature) throw fail('social_expired', 'no state cookie');
  const expected = Buffer.from(mac(env, payload)), given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) throw fail('social_expired', 'state cookie signature');
  let data; try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { throw fail('social_expired', 'state cookie'); }
  if (!data || typeof data !== 'object' || !Number.isFinite(data.t) || now - data.t > STATE_TTL || data.t - now > SKEW) throw fail('social_expired', 'state too old');
  return data;
}
const stateCookie = (id, value) => `${STATE_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=${PROVIDERS[id].sameSite}; Max-Age=${STATE_TTL / 1000}`;
const clearStateCookie = id => `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=${PROVIDERS[id]?.sameSite || 'Lax'}; Max-Age=0`;
function readStateCookie(req) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === STATE_COOKIE) return part.slice(at + 1).trim();
  }
  return '';
}

// ── ID tokens: RS256 signature against the provider's keys, then the claims ──
function decode(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || parts.some(part => !/^[\w-]*$/.test(part))) throw fail('social_failed', 'malformed token');
  try { return {header: JSON.parse(Buffer.from(parts[0], 'base64url')), claims: JSON.parse(Buffer.from(parts[1], 'base64url')), signed: `${parts[0]}.${parts[1]}`, signature: Buffer.from(parts[2], 'base64url')}; }
  catch { throw fail('social_failed', 'malformed token'); }
}

// The providers' public keys, kept for 6 hours. A key id the cache does not know triggers one new download (they rotate
// keys), at most once a minute per address, so a bad token cannot make the server fetch in a loop.
function createKeyCache({ttl = 6 * 60 * 60 * 1000, refetchAfter = 60 * 1000} = {}) {
  const sets = new Map();
  async function download(url, fetchImpl, now) {
    const response = await fetchImpl(url, {headers: {Accept: 'application/json'}, signal: AbortSignal.timeout(10000)});
    if (!response.ok) throw fail('social_failed', `jwks ${response.status}`);
    const body = await response.json();
    const keys = new Map((Array.isArray(body?.keys) ? body.keys : []).filter(k => k?.kty === 'RSA' && typeof k.kid === 'string').map(k => [k.kid, k]));
    const entry = {keys, at: now};
    sets.set(url, entry);
    return entry;
  }
  return {
    async key(url, kid, {fetchImpl, now}) {
      let entry = sets.get(url);
      if (!entry || now - entry.at > ttl) entry = await download(url, fetchImpl, now);
      if (!entry.keys.has(kid) && now - entry.at > refetchAfter) entry = await download(url, fetchImpl, now);
      const jwk = entry.keys.get(kid);
      if (!jwk) throw fail('social_failed', 'unknown key');
      return crypto.createPublicKey({key: {kty: 'RSA', n: jwk.n, e: jwk.e}, format: 'jwk'});
    },
    clear() { sets.clear(); }
  };
}
const sharedKeys = createKeyCache();

async function verifyIdToken(token, {jwks, issuers, audience, nonce, now = Date.now(), fetchImpl = globalThis.fetch, keys = sharedKeys}) {
  const {header, claims, signed, signature} = decode(token);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw fail('social_failed', 'unexpected algorithm');
  const key = await keys.key(jwks, header.kid, {fetchImpl, now});
  if (!crypto.verify('sha256', Buffer.from(signed), key, signature)) throw fail('social_failed', 'bad signature');
  if (!issuers.includes(claims.iss)) throw fail('social_failed', 'issuer');
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience || !audiences.includes(audience)) throw fail('social_failed', 'audience');
  if (!Number.isFinite(claims.exp) || claims.exp * 1000 < now - SKEW) throw fail('social_failed', 'expired');
  if (Number.isFinite(claims.iat) && claims.iat * 1000 > now + SKEW) throw fail('social_failed', 'issued in the future');
  if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255) throw fail('social_failed', 'subject');
  const expected = Buffer.from(String(nonce || '')), given = Buffer.from(String(claims.nonce || ''));
  if (!nonce || expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) throw fail('social_failed', 'nonce');
  return claims;
}

// ── Apple: the client secret is a JWT signed (ES256) with the key made in the Apple Developer account ──
// APPLE_PRIVATE_KEY is the content of the .p8 file; pasted in a panel it may come with "\n" instead of line breaks, or
// without the BEGIN/END lines.
function applePrivateKey(raw) {
  let pem = String(raw || '').trim().replace(/\\n/g, '\n');
  if (!pem.includes('BEGIN')) pem = `-----BEGIN PRIVATE KEY-----\n${pem.replace(/\s+/g, '').match(/.{1,64}/g)?.join('\n') || ''}\n-----END PRIVATE KEY-----`;
  try { return crypto.createPrivateKey(pem); } catch { throw fail('social_unavailable', 'APPLE_PRIVATE_KEY'); }
}
function appleClientSecret(env, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const signed = `${b64({alg: 'ES256', kid: env.APPLE_KEY_ID})}.${b64({iss: env.APPLE_TEAM_ID, iat, exp: iat + 300, aud: 'https://appleid.apple.com', sub: env.APPLE_CLIENT_ID})}`;
  const signature = crypto.sign('sha256', Buffer.from(signed), {key: applePrivateKey(env.APPLE_PRIVATE_KEY), dsaEncoding: 'ieee-p1363'});
  return `${signed}.${signature.toString('base64url')}`;
}

// ── the two steps ──
function createSocial({env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now(), endpoints = null, keys = sharedKeys} = {}) {
  function provider(id) {
    const p = PROVIDERS[id];
    if (!p) throw fail('social_unavailable', 'unknown provider');
    if (!p.enabled(env)) throw fail('social_unavailable', `${id} not configured`);
    return p;
  }

  return {
    // → {location, cookie}: where to send the browser, and the state cookie to set.
    start(id, {next = ''} = {}) {
      const p = provider(id), e = endpointsFor(id, env, endpoints);
      const state = crypto.randomBytes(24).toString('base64url'), nonce = crypto.randomBytes(24).toString('base64url');
      const verifier = p.pkce ? crypto.randomBytes(48).toString('base64url') : undefined;
      const url = new URL(e.authorize);
      const params = {client_id: p.clientId(env), redirect_uri: redirectUri(id, env), response_type: 'code', scope: p.scope, state, nonce};
      if (id === 'google') Object.assign(params, {code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account'});
      if (id === 'apple') params.response_mode = 'form_post';
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
      return {location: url.href, cookie: stateCookie(id, sealState(env, {p: id, s: state, n: nonce, v: verifier, x: nextKey(next), t: now()}))};
    },

    // The provider's answer (query for Google, form fields for Apple) and the state cookie → who signed in.
    async finish(id, {params, cookie}) {
      const p = provider(id), e = endpointsFor(id, env, endpoints);
      const saved = openState(env, cookie, now());
      if (saved.p !== id) throw fail('social_expired', 'provider changed');
      const next = nextKey(saved.x);
      const error = String(params.error || '');
      if (error) throw Object.assign(fail(/denied|cancel/i.test(error) ? 'social_cancelled' : 'social_failed', error), {next});
      const expected = Buffer.from(String(saved.s || '')), given = Buffer.from(String(params.state || ''));
      if (!saved.s || expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) throw Object.assign(fail('social_expired', 'state'), {next});
      const code = String(params.code || '');
      if (!code || code.length > 2048) throw Object.assign(fail('social_failed', 'no code'), {next});

      const form = new URLSearchParams({grant_type: 'authorization_code', code, redirect_uri: redirectUri(id, env), client_id: p.clientId(env)});
      if (id === 'google') { form.set('client_secret', env.GOOGLE_CLIENT_SECRET); form.set('code_verifier', saved.v || ''); }
      if (id === 'apple') form.set('client_secret', appleClientSecret(env, now()));
      let answer;
      try {
        const response = await fetchImpl(e.token, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json'}, body: form.toString(), signal: AbortSignal.timeout(10000)});
        answer = await response.json().catch(() => ({}));
        if (!response.ok) throw fail('social_failed', `token ${response.status} ${answer.error || ''}`);
      } catch (problem) { throw Object.assign(problem.code ? problem : fail('social_failed', problem.message), {next}); }
      let claims;
      try { claims = await verifyIdToken(answer.id_token, {jwks: e.jwks, issuers: issuersFor(id, e), audience: p.clientId(env), nonce: saved.n, now: now(), fetchImpl, keys}); }
      catch (problem) { throw Object.assign(problem, {next}); }

      const truthy = value => value === true || value === 'true';
      const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
      const person = {provider: id, subject: claims.sub, email, emailVerified: Boolean(email) && truthy(claims.email_verified), next,
        privateEmail: id === 'apple' && (truthy(claims.is_private_email) || /@privaterelay\.appleid\.com$/.test(email)),
        firstName: '', lastName: '', name: '', picture: ''};
      if (id === 'google') {
        Object.assign(person, {firstName: claims.given_name || '', lastName: claims.family_name || '', name: claims.name || ''});
        // Only Google's own picture addresses (the page's security policy allows that host for images).
        if (typeof claims.picture === 'string' && /^https:\/\/lh3\.googleusercontent\.com\/[\w\-./=?&%+~]+$/.test(claims.picture) && claims.picture.length <= 500) person.picture = claims.picture;
      }
      // Apple sends the name only the first time, outside the token, in the "user" field of the form (never trusted
      // for the e-mail, which comes from the signed token).
      if (id === 'apple' && params.user) {
        try { const user = JSON.parse(String(params.user)); Object.assign(person, {firstName: user?.name?.firstName || '', lastName: user?.name?.lastName || ''}); } catch {}
        person.name = [person.firstName, person.lastName].filter(Boolean).join(' ');
      }
      return person;
    }
  };
}

module.exports = {createSocial, enabled, verifyIdToken, createKeyCache, appleClientSecret, applePrivateKey, redirectUri, sealState, openState,
  readStateCookie, clearStateCookie, stateCookie, nextKey, NEXT, PROVIDERS, STATE_COOKIE, STATE_TTL};
