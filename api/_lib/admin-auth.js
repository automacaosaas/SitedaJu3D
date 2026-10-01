'use strict';
// Painel da Ju: password + a 6-digit code from an authenticator app (TOTP, api/_lib/totp.js). Admins, their sessions
// and an audit log live in the database (db/migrations/003_painel.sql). The first admin is created from ADMIN_EMAIL and
// ADMIN_PASSWORD while there is none; after that the database is what counts (see ADMIN-SETUP.md).
//
// Login: password → a short session that only allows the code step (on the first login it also returns the secret for
// the app, shown as a QR code) → code → a new token for the full session. Tokens live in an HttpOnly cookie; the database
// keeps only their SHA-256.
const crypto = require('node:crypto');
const fields = require('./fields');
const totp = require('./totp');
const {hashPassword, verifyPassword} = require('./passwords');

const COOKIE = '__Host-ju_admin';
const PENDING_TTL = 10 * 60 * 1000, SESSION_TTL = 12 * 60 * 60 * 1000;   // 12 h: a work shift, not a permanent login
const MAX_CODE_ATTEMPTS = 5, MIN_PASSWORD = 12;

const fail = (code, extra = {}) => Object.assign(new Error(code), {code, ...extra});
const sha256 = value => crypto.createHash('sha256').update(value).digest();
const normalizeEmail = value => String(value ?? '').trim().toLowerCase();
const time = value => new Date(value).getTime();
// Compares digests, so the length of the secret does not show in the timing either.
const sameText = (a, b) => crypto.timingSafeEqual(sha256(String(a)), sha256(String(b)));

// ADMIN_EMAIL / ADMIN_PASSWORD only create the first admin. A short password is refused rather than silently accepted.
function settings(env = process.env) {
  const email = normalizeEmail(env.ADMIN_EMAIL), password = String(env.ADMIN_PASSWORD || '');
  return {email, bootstrap: Boolean(email && password.length >= MIN_PASSWORD), passwordTooShort: Boolean(password) && password.length < MIN_PASSWORD};
}

const sessionCookie = ({token, expiresAt}) => `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Expires=${new Date(expiresAt).toUTCString()}`;
const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
function readCookie(req) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === COOKIE) return part.slice(at + 1).trim();
  }
  return '';
}

function createAdminAuth({store, env = process.env, now = () => Date.now()}) {
  const date = () => new Date(now());
  async function limit(bucket, max, windowMs) {
    const result = await store.rateLimit(bucket, max, windowMs, now());
    if (!result.ok) throw fail('too_many_requests', {retryAfter: result.retryAfter});
  }
  async function audit(adminId, action, detail = null, ip = null) {
    try { await store.adminAudit.add({adminId, action, detail, ip}); } catch (error) { console.error('admin: audit not recorded —', error.message); }
  }
  async function openSession(admin, {mfa, ip = '', userAgent = ''}) {
    const token = crypto.randomBytes(32).toString('base64url'), expiresAt = new Date(now() + (mfa ? SESSION_TTL : PENDING_TTL));
    await store.adminSessions.create({tokenHash: sha256(token), adminId: admin.id, mfaAt: mfa ? date() : null, expiresAt, ip: String(ip).slice(0, 64) || null, userAgent: String(userAgent).slice(0, 255) || null});
    return {token, expiresAt};
  }
  // A live session of the requested kind (after the password only, or complete), or null.
  async function readSession(token, {pending = false} = {}) {
    if (typeof token !== 'string' || !/^[\w-]{43}$/.test(token)) return null;
    const session = await store.adminSessions.find(sha256(token));
    if (!session || session.revokedAt || now() >= time(session.expiresAt)) return null;
    return Boolean(session.mfaAt) === !pending ? session : null;
  }
  // The first admin, from the environment, only while the table is empty.
  async function bootstrap(email, password) {
    const boot = settings(env);
    if (!boot.bootstrap || email !== boot.email || !sameText(password, env.ADMIN_PASSWORD) || await store.admins.count() > 0) return null;
    try {
      const admin = await store.admins.create({id: crypto.randomUUID(), email, passwordHash: await hashPassword(password)});
      await audit(admin.id, 'admin_created', 'ADMIN_EMAIL');
      return admin;
    } catch (error) { if (error.code === 'admin_exists') return store.admins.findByEmail(email); throw error; }
  }

  return {
    async login({email, password, ip = '', userAgent = ''}) {
      email = normalizeEmail(email); password = String(password ?? '');
      await limit(`admin-ip:${ip}`, 15, 10 * 60 * 1000);
      await limit(`admin-email:${email}`, 8, 10 * 60 * 1000);
      const admin = await store.admins.findByEmail(email) || await bootstrap(email, password);
      const check = await verifyPassword(password, admin?.passwordHash);   // runs even without an admin: same timing
      if (!admin || !check.ok) { await audit(admin?.id || null, 'login_failed', email.slice(0, 180), ip); throw fail('invalid_credentials'); }
      if (check.needsRehash) await store.admins.update(admin.id, {passwordHash: await hashPassword(password)});
      const session = await openSession(admin, {mfa: false, ip, userAgent});
      if (admin.totpEnabledAt) return {next: 'totp', session};
      // Not enrolled yet: a new secret on every attempt until one is confirmed with a code from the app.
      const secret = totp.newSecret();
      await store.admins.update(admin.id, {totpSecretEnc: fields.encrypt(env, totp.base32(secret))});
      return {next: 'totp_setup', session, setup: {secret: totp.base32(secret), otpauth: totp.otpauthUrl({secret, account: admin.email})}};
    },

    async verifyCode({token, code, ip = '', userAgent = ''}) {
      const session = await readSession(token, {pending: true});
      if (!session) throw fail('unauthorized');
      await limit(`admin-code:${session.adminId}`, 10, 15 * 60 * 1000);
      const attempts = await store.adminSessions.recordAttempt(session.tokenHash);
      if (attempts > MAX_CODE_ATTEMPTS) { await store.adminSessions.revoke(session.tokenHash, date()); throw fail('too_many_attempts'); }
      const admin = await store.admins.findById(session.adminId);
      if (!admin?.totpSecretEnc) throw fail('unauthorized');
      const secret = totp.fromBase32(fields.decrypt(env, admin.totpSecretEnc));
      const step = totp.verify(secret, String(code ?? '').replace(/\s/g, ''), {now: now(), after: admin.totpLastStep});
      if (step === null || !await store.admins.useStep(admin.id, step)) {
        await audit(admin.id, 'code_failed', null, ip);
        throw fail('invalid_code', {remaining: Math.max(0, MAX_CODE_ATTEMPTS - attempts)});
      }
      // The password-only token ends here; the full session gets a token of its own.
      await store.adminSessions.revoke(session.tokenHash, date());
      await store.admins.update(admin.id, {lastLoginAt: date(), ...(admin.totpEnabledAt ? {} : {totpEnabledAt: date()})});
      await audit(admin.id, admin.totpEnabledAt ? 'login' : 'totp_enabled', null, ip);
      return {email: admin.email, session: await openSession(admin, {mfa: true, ip, userAgent})};
    },

    async authenticate(token) {
      const session = await readSession(token);
      const admin = session && await store.admins.findById(session.adminId);
      return admin ? {admin, expiresAt: time(session.expiresAt)} : null;
    },

    async logout(token) {
      if (typeof token !== 'string' || !/^[\w-]{43}$/.test(token)) return;
      const session = await store.adminSessions.find(sha256(token));
      if (session && !session.revokedAt) { await store.adminSessions.revoke(session.tokenHash, date()); await audit(session.adminId, 'logout'); }
    },

    audit
  };
}

// For /api/health: is the panel usable here, and how?
async function status(store, env = process.env) {
  if (!store) return 'off';
  try { if (await store.admins.count() > 0) return 'ready'; } catch { return 'error'; }
  return settings(env).bootstrap ? 'bootstrap' : 'waiting';
}

module.exports = {createAdminAuth, settings, status, sessionCookie, clearCookie, readCookie, COOKIE, PENDING_TTL, SESSION_TTL, MAX_CODE_ATTEMPTS, MIN_PASSWORD};
