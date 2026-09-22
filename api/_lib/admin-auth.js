'use strict';
// The Ju admin panel, without a database yet: the e-mail and password live in Vercel environment variables, and a
// signed, expiring session token stands in for a real session store. The password never leaves the server; the
// browser only ever holds the token. See ADMIN-SETUP.md.
const crypto = require('node:crypto');
const {config} = require('./mail');

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h — a work shift, not a permanent login
const b64 = value => Buffer.from(value).toString('base64url');
const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest();
const equal = (a, b) => a.length === b.length && crypto.timingSafeEqual(a, b);
// Comparing against an empty secret/password would make timingSafeEqual throw (length 0 vs 0 "passes" trivially);
// treat "not configured" as its own outcome instead of letting an empty value compare as equal to itself.
const equalText = (a, b) => Boolean(a) && Boolean(b) && equal(Buffer.from(a), Buffer.from(b));

function settings(env = process.env) {
  const email = String(env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(env.ADMIN_PASSWORD || '');
  // Reuses the signing secret already derived for e-mail challenges (see api/_lib/mail.js) under its own label, so no
  // extra secret has to be configured just for this. If that secret is not ready yet, the admin panel simply waits.
  const base = config(env).secret;
  return {email, password, ready: Boolean(email && password && base), secret: base ? hmac(base, 'ju-imprime-pra-mim:admin-session:v1').toString('hex') : ''};
}

function checkPassword(settings, email, password) {
  return settings.ready && equalText(String(email || '').trim().toLowerCase(), settings.email) && equalText(String(password || ''), settings.password);
}

function issueSession({secret, email, now = Date.now()}) {
  const payload = {v: 1, e: email, x: now + SESSION_TTL_MS};
  const body = b64(JSON.stringify(payload));
  return {token: `${body}.${b64(hmac(secret, 'admin|' + body))}`, expiresAt: payload.x};
}

function verifySession({secret, token, now = Date.now()}) {
  if (!secret || typeof token !== 'string' || token.length > 600 || !/^[\w-]+\.[\w-]+$/.test(token)) return {ok: false};
  const [body, signature] = token.split('.');
  try {
    if (!equal(hmac(secret, 'admin|' + body), Buffer.from(signature, 'base64url'))) return {ok: false};
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload?.v !== 1 || typeof payload.e !== 'string' || now >= payload.x) return {ok: false};
    return {ok: true, email: payload.e, expiresAt: payload.x};
  } catch { return {ok: false}; }
}

const bearerToken = req => { const header = String(req.headers.authorization || ''); return /^Bearer .+/.test(header) ? header.slice(7).trim() : ''; };

module.exports = {SESSION_TTL_MS, settings, checkPassword, issueSession, verifySession, bearerToken};
