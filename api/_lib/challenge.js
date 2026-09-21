'use strict';
// Verification challenges without a database: the server signs a token that carries the e-mail, the purpose, the
// expiry and a keyed hash of the code. The code itself is only ever sent by e-mail. See EMAIL-TEMPLATE.md for the
// limits of this approach (no attempt counter until a datastore exists).
const crypto = require('node:crypto');

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_AFTER_MS = 30 * 1000;
const PURPOSES = ['signup', 'access', 'reset'];
const LANGUAGES = ['pt-BR', 'en', 'es'];

const b64 = value => Buffer.from(value).toString('base64url');
const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest();
const equal = (a, b) => a.length === b.length && crypto.timingSafeEqual(a, b);
const codeHash = (secret, payload, code) => hmac(secret, ['code', payload.e, payload.p, payload.r, payload.x, code].join('|'));

function makeCode(random = crypto.randomInt) { return String(random(0, 1000000)).padStart(6, '0'); }

function issue({secret, email, name = '', purpose, now = Date.now(), code = makeCode()}) {
  if (!secret) throw new Error('secret is required');
  const payload = {v: 1, e: email, p: purpose, n: name, s: now, x: now + CODE_TTL_MS, r: b64(crypto.randomBytes(9))};
  payload.h = b64(codeHash(secret, payload, code));
  const body = b64(JSON.stringify(payload));
  return {code, payload, token: `${body}.${b64(hmac(secret, 'token|' + body))}`};
}

function verify({secret, token, code, now = Date.now()}) {
  if (!secret || typeof token !== 'string' || token.length > 1024 || !/^[\w-]+\.[\w-]+$/.test(token)) return {ok: false, reason: 'invalid_challenge'};
  const [body, signature] = token.split('.');
  if (!equal(hmac(secret, 'token|' + body), Buffer.from(signature, 'base64url'))) return {ok: false, reason: 'invalid_challenge'};
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return {ok: false, reason: 'invalid_challenge'}; }
  if (payload?.v !== 1 || !PURPOSES.includes(payload.p) || typeof payload.e !== 'string' || typeof payload.h !== 'string') return {ok: false, reason: 'invalid_challenge'};
  if (now >= payload.x) return {ok: false, reason: 'expired'};
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return {ok: false, reason: 'invalid_code'};
  if (!equal(codeHash(secret, payload, code), Buffer.from(payload.h, 'base64url'))) return {ok: false, reason: 'invalid_code'};
  return {ok: true, email: payload.e, purpose: payload.p, name: payload.n || '', expiresAt: payload.x};
}

module.exports = {CODE_TTL_MS, RESEND_AFTER_MS, PURPOSES, LANGUAGES, makeCode, issue, verify};
