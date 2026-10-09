'use strict';
// The endpoints of "Continuar com o Google / com a Apple" (api/auth/google/*, api/auth/apple/*). They answer with
// redirects, not JSON: start sends the browser to the provider; the callback signs the person in (the same session
// cookie as the e-mailed code) and sends them on: to the checkout (which asks for CPF and phone itself), to "Meus
// pedidos", or to the account, where a first visit is welcomed and asked only for what the shop still needs.
// A problem never shows a raw error: the account page explains it (conta.html#entrar?erro=…).
const {json, clientIp} = require('./http');
const {storeFor, sessionCookie} = require('./account-http');
const {createAccounts} = require('./accounts');
const social = require('./social');

const MAX_FORM = 16 * 1024;
const KNOWN = ['social_unavailable', 'social_cancelled', 'social_expired', 'social_failed', 'social_email_unverified', 'accounts_unavailable', 'too_many_requests'];
const AFTER = {...social.NEXT};
const accountNext = next => ['checkout', 'comprar-agora'].includes(next) ? `?next=${next}` : '';
const errorPage = (code, next = '') => `/conta${accountNext(next)}#entrar?erro=${code}`;
// Where to go once signed in: what the person was doing, or the welcome of a new account, or the account.
const destination = (next, created) => AFTER[next] || (created ? '/conta#bem-vindo' : '/conta');

function redirect(res, status, location, cookies) {
  res.statusCode = status;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Set-Cookie', cookies);
  res.end();
}

// Apple's form_post: application/x-www-form-urlencoded fields (code, state, user, error).
async function readForm(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let text = typeof req.body === 'string' ? req.body : '';
  if (!text) {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > MAX_FORM) throw Object.assign(new Error('form too large'), {code: 'social_failed'}); chunks.push(chunk); }
    text = Buffer.concat(chunks).toString('utf8');
  }
  return Object.fromEntries(new URLSearchParams(text));
}

// GET /api/auth/{google,apple}/start?next=checkout → the provider's sign-in page.
function startRoute(id) {
  function create({env = process.env, now = () => Date.now(), endpoints = null} = {}) {
    return async function handler(req, res) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, {error: 'method_not_allowed'}, {Allow: 'GET'});
      const next = social.nextKey(new URL(req.url || '/', 'http://localhost').searchParams.get('next'));
      try {
        const {location, cookie} = social.createSocial({env, now, endpoints}).start(id, {next});
        return redirect(res, 302, location, [cookie]);
      } catch (error) {
        if (!KNOWN.includes(error.code)) console.error(`social: ${id} start —`, error);
        return redirect(res, 302, errorPage(KNOWN.includes(error.code) ? error.code : 'social_failed', next), [social.clearStateCookie(id)]);
      }
    };
  }
  const handler = create();
  handler.create = create;
  return handler;
}

// /api/auth/google/callback (GET) and /api/auth/apple/callback (POST, form_post; GET also accepted for errors).
function callbackRoute(id) {
  function create({env = process.env, store, fetchImpl = globalThis.fetch, now = () => Date.now(), endpoints = null, keys} = {}) {
    return async function handler(req, res) {
      if (!['GET', 'POST'].includes(req.method)) return json(res, 405, {error: 'method_not_allowed'}, {Allow: 'GET, POST'});
      let next = '';
      try {
        const params = req.method === 'POST' ? await readForm(req) : Object.fromEntries(new URL(req.url || '/', 'http://localhost').searchParams);
        const active = store || storeFor(env);
        if (!active) throw Object.assign(new Error('accounts_unavailable'), {code: 'accounts_unavailable'});
        const person = await social.createSocial({env, fetchImpl, now, endpoints, ...(keys ? {keys} : {})}).finish(id, {params, cookie: social.readStateCookie(req)});
        next = person.next;
        const accounts = createAccounts({store: active, env, now});
        const {session, created} = await accounts.socialSignIn({...person, ip: clientIp(req), userAgent: String(req.headers['user-agent'] || '')});
        return redirect(res, 303, destination(next, created), [social.clearStateCookie(id), sessionCookie(session)]);
      } catch (error) {
        next = next || error.next || '';
        const code = KNOWN.includes(error.code) ? error.code : 'social_failed';
        // The detail goes to the server log (never a token or a code); the person sees a plain message.
        if (code === 'social_failed' || !KNOWN.includes(error.code)) console.warn(`social: ${id} callback — ${error.message}`);
        return redirect(res, 303, errorPage(code, next), [social.clearStateCookie(id)]);
      }
    };
  }
  const handler = create();
  handler.create = create;
  return handler;
}

// GET /api/auth/providers → {google, apple}: which buttons the account page shows (only the configured ones).
function providersRoute() {
  function create({env = process.env} = {}) {
    return async function handler(req, res) {
      if (req.method !== 'GET') return json(res, 405, {error: 'method_not_allowed'}, {Allow: 'GET'});
      const on = storeFor(env) ? social.enabled(env) : {google: false, apple: false};
      return json(res, 200, {google: on.google, apple: on.apple});
    };
  }
  const handler = create();
  handler.create = create;
  return handler;
}

module.exports = {startRoute, callbackRoute, providersRoute, errorPage, destination, readForm};
