'use strict';
// HTTP side of accounts: picks the store, reads and writes the session cookie, checks the origin of every change and
// turns service errors into status codes. Each file in api/auth and api/account is one small endpoint built with endpoint().
const {json, readJson, clientIp, sameOrigin} = require('./http');
const {isProduction} = require('./runtime');
const {config, sendMail} = require('./mail');
const {renderVerificationEmail, verificationUrl} = require('./email-template');
const {getPool} = require('./db');
const {createMysqlStore} = require('./store-mysql');
const {createMemoryStore} = require('./store-memory');
const {createAccounts, CODE_TTL} = require('./accounts');

// __Host-: only over HTTPS, only for this exact host, path "/". HttpOnly keeps it away from page scripts.
const COOKIE = '__Host-ju_session';
const sessionCookie = ({token, expiresAt}) => `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expiresAt.toUTCString()}`;
const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
function readCookie(req) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === COOKIE) return part.slice(at + 1).trim();
  }
  return '';
}

// MySQL when configured. Without a database: an in-memory store outside production (local and test sites), and
// accounts switched off in production.
let mysqlStore = null, mysqlPool = null, memoryStore = null;
function storeFor(env) {
  const pool = getPool(env);
  if (pool) { if (pool !== mysqlPool) { mysqlStore = createMysqlStore(pool); mysqlPool = pool; } return mysqlStore; }
  if (!isProduction(env)) return (memoryStore ??= createMemoryStore());
  return null;
}
const storeKind = env => storeFor(env)?.kind || 'off';

function mailerFor(env, fetchImpl, outbox) {
  return async ({email, code, challenge, purpose, lang}) => {
    const settings = config(env);
    const url = verificationUrl({siteUrl: settings.siteUrl, token: challenge, code, route: purpose === 'delete' ? 'excluir' : 'verificar'});
    const message = renderVerificationEmail({lang, purpose, code, url, siteUrl: settings.siteUrl, assetUrl: settings.assetUrl, expiryMinutes: CODE_TTL / 60000});
    try {
      await sendMail({settings, to: email, subject: message.subject, html: message.html, text: message.text, idempotencyKey: `code-${challenge.split('.')[0]}`, fetchImpl, outbox: outbox && (mail => outbox({...mail, code, challenge, purpose, url}))});
    } catch (error) {
      console.error('accounts: e-mail not sent —', error.status || '', error.message);
      throw Object.assign(new Error('send_failed'), {code: 'send_failed'});
    }
  };
}

const STATUS = {
  invalid_request: 400, invalid_email: 400, invalid_code: 400, invalid_challenge: 400, invalid_grant: 400, weak_password: 400,
  invalid_credentials: 401, unauthorized: 401, account_exists: 409, cpf_in_use: 409, expired: 410,
  too_many_requests: 429, too_many_attempts: 429, send_failed: 502, email_not_configured: 503, accounts_unavailable: 503, data_keys_missing: 503
};

// endpoint({methods, handle}) → a Vercel-style handler with an injectable factory for tests: .create({env, store, ...}).
function endpoint({methods, handle}) {
  function create({env = process.env, store, fetchImpl = globalThis.fetch, now = () => Date.now(), outbox} = {}) {
    return async function handler(req, res) {
      if (!methods.includes(req.method)) return json(res, 405, {error: 'method_not_allowed'}, {Allow: methods.join(', ')});
      const writing = req.method !== 'GET';
      if (writing && !sameOrigin(req, {...env, SITE_URL: config(env).siteUrl})) return json(res, 403, {error: 'forbidden'});
      const active = store || storeFor(env);
      if (!active) return json(res, 503, {error: 'accounts_unavailable'});
      const accounts = createAccounts({store: active, env, now, sendCode: mailerFor(env, fetchImpl, outbox)});
      let body = {};
      if (writing) { try { body = await readJson(req); } catch (error) { return json(res, error.status || 400, {error: 'invalid_request'}); } }
      const token = readCookie(req);
      const context = {req, res, body, accounts, store: active, env, now, token, ip: clientIp(req), userAgent: String(req.headers['user-agent'] || ''), user: () => accounts.authenticate(token)};
      try {
        const {status = 200, body: answer = {ok: true}, session, clear} = await handle(context);
        const headers = session ? {'Set-Cookie': sessionCookie(session)} : clear ? {'Set-Cookie': clearCookie()} : {};
        return json(res, status, answer, headers);
      } catch (error) {
        const status = STATUS[error.code];
        if (!status) { console.error(`accounts: ${req.method} ${req.url} —`, error); return json(res, 500, {error: 'internal_error'}); }
        const extra = {};
        for (const key of ['field', 'remaining', 'retryAfter']) if (error[key] !== undefined) extra[key] = error[key];
        return json(res, status, {error: error.code, ...extra}, error.retryAfter ? {'Retry-After': String(error.retryAfter)} : {});
      }
    };
  }
  const handler = create();
  handler.create = create;
  return handler;
}

// For endpoints that need a signed-in buyer.
async function requireUser(context) {
  const customer = await context.user();
  if (!customer) throw Object.assign(new Error('unauthorized'), {code: 'unauthorized'});
  return customer;
}

module.exports = {endpoint, requireUser, storeFor, storeKind, readCookie, sessionCookie, clearCookie, COOKIE, STATUS};
