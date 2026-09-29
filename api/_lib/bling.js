'use strict';
// Bling (API v3), the NF-e service chosen by the accountant. The store's Bling account is connected once from the panel
// (OAuth 2.0 authorization code: someone signs in at Bling and allows the app), and the site keeps the tokens encrypted
// with DATA_KEY in the integrations table (db/migrations/007_bling.sql), renewing them by itself. The access token lasts
// about 6 hours; the refresh token 30 days from its last use, so the panel renews it at least once a week (keepAlive).
// Tokens never leave the server and are never logged.
//
// Variables: BLING_CLIENT_ID and BLING_CLIENT_SECRET (secret), from the app created in Bling (Central de Extensões →
// Área do Integrador) with the redirect link `${SITE_URL}/admin.html`. JWT tokens (header enable-jwt: 1), as Bling asks.
const crypto = require('node:crypto');
const {encrypt, decrypt} = require('./fields');
const {config} = require('./mail');
const {isProduction} = require('./runtime');

const API = 'https://api.bling.com.br/Api/v3';
const OAUTH = 'https://www.bling.com.br/Api/v3/oauth';
const NAME = 'bling';
const DAY = 86400000;
const REFRESH_LIFETIME = 30 * DAY, KEEP_ALIVE = 7 * DAY, EARLY = 60000, TIMEOUT_MS = 20000;
const STATE_TTL = 10 * 60000;

class BlingError extends Error {
  constructor(code, message, status) { super(message); this.name = 'BlingError'; this.code = code; this.status = status; }
}
const clean = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
const time = value => value ? new Date(value).getTime() : 0;
const iso = value => value ? new Date(value).toISOString() : null;

// Bling's errors come as {error: {type, message, description, fields: [{msg, collection: [{msg}]}]}}.
function readable(data, status) {
  const error = data?.error && typeof data.error === 'object' ? data.error : null;
  const parts = [error?.description || error?.message || (typeof data?.error === 'string' ? data.error_description || data.error : ''),
    ...(error?.fields || []).flatMap(f => [f?.msg, ...(f?.collection || []).map(c => c?.msg)])];
  return clean([...new Set(parts.filter(Boolean))].join(' · ')) || `O Bling respondeu ${status}.`;
}

function blingSettings(env = process.env) {
  const clientId = String(env.BLING_CLIENT_ID || '').trim(), clientSecret = String(env.BLING_CLIENT_SECRET || '').trim();
  // Another authorization address only for the local simulator (tools/fake-bling.cjs), never in production.
  const authorizeUrl = !isProduction(env) && env.BLING_AUTHORIZE_URL ? String(env.BLING_AUTHORIZE_URL) : `${OAUTH}/authorize`;
  return {configured: Boolean(clientId && clientSecret), clientId, clientSecret, redirectUri: `${config(env).siteUrl}/admin.html`, authorizeUrl};
}

// The "state" of the authorization round trip: tied to the admin session that started it and valid for 10 minutes, so
// only that same signed-in person can hand the code back (the CSRF protection of OAuth).
function stateMac(env, sessionToken, payload) {
  const secret = config(env).secret;
  if (!secret) throw Object.assign(new Error('AUTH_SECRET missing'), {code: 'bling_not_configured'});
  const session = crypto.createHash('sha256').update(String(sessionToken || '')).digest('hex');
  return crypto.createHmac('sha256', secret).update(`bling-state|${session}|${payload}`).digest('base64url');
}
function signState(env, sessionToken, now = Date.now()) {
  const payload = `${now + STATE_TTL}.${crypto.randomBytes(12).toString('base64url')}`;
  return `${payload}.${stateMac(env, sessionToken, payload)}`;
}
function checkState(env, sessionToken, state, now = Date.now()) {
  const match = /^(\d{13})\.([\w-]{16})\.([\w-]{43})$/.exec(String(state || ''));
  if (!match || Number(match[1]) < now || Number(match[1]) > now + STATE_TTL) return false;
  const expected = Buffer.from(stateMac(env, sessionToken, `${match[1]}.${match[2]}`)), given = Buffer.from(match[3]);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

// One renewal at a time per store: two requests needing a fresh token share the same answer (Bling may retire a
// refresh token once it has been used).
const renewing = new WeakMap();
const paymentMethods = new WeakMap();

function createBling({store, env = process.env, now = () => Date.now(), fetchImpl = globalThis.fetch}) {
  const settings = blingSettings(env), date = () => new Date(now());
  const read = row => { if (!row?.tokensEnc) return null; try { return JSON.parse(decrypt(env, row.tokensEnc)); } catch { return null; } };
  const notConnected = () => new BlingError('not_connected', 'O Bling não está conectado. Conecte a conta no painel (Nota fiscal · Bling).');

  async function send(url, init) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try { return await fetchImpl(url, {...init, signal: controller.signal}); }
    catch { throw new BlingError('bling_unavailable', 'O Bling não respondeu. Tente de novo em alguns minutos.'); }
    finally { clearTimeout(timer); }
  }

  async function tokenCall(path, form) {
    const response = await send(`${OAUTH}/${path}`, {method: 'POST', headers: {Authorization: 'Basic ' + Buffer.from(`${settings.clientId}:${settings.clientSecret}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'enable-jwt': '1'}, body: new URLSearchParams(form).toString()});
    const data = await response.json().catch(() => null);
    return {response, data};
  }

  async function save(data, previousTokens, previousRow, extra = {}) {
    const tokens = {access: String(data.access_token), refresh: data.refresh_token ? String(data.refresh_token) : previousTokens?.refresh || null};
    return store.integrations.save(NAME, {
      tokensEnc: encrypt(env, JSON.stringify(tokens)),
      accessExpiresAt: new Date(now() + (Number(data.expires_in) > 0 ? Number(data.expires_in) * 1000 : 6 * 3600e3)),
      refreshExpiresAt: data.refresh_token ? new Date(now() + REFRESH_LIFETIME) : previousRow?.refreshExpiresAt || null,
      refreshedAt: date(), ...extra
    });
  }

  function renew() {
    if (renewing.has(store)) return renewing.get(store);
    const job = (async () => {
      const row = await store.integrations.get(NAME), tokens = read(row);
      if (!tokens?.refresh) throw notConnected();
      const {response, data} = await tokenCall('token', {grant_type: 'refresh_token', refresh_token: tokens.refresh});
      if (response.ok && data?.access_token) { await save(data, tokens, row); return String(data.access_token); }
      if (response.status >= 500) throw new BlingError('bling_unavailable', 'O Bling não respondeu. Tente de novo em alguns minutos.', response.status);
      // Refused: another server process may have renewed with this same refresh token a moment ago; use its result.
      const again = await store.integrations.get(NAME), fresh = read(again);
      if (fresh?.access && fresh.access !== tokens.access && time(again.accessExpiresAt) > now() + EARLY) return fresh.access;
      await store.integrations.save(NAME, {tokensEnc: null, accessExpiresAt: null, refreshExpiresAt: null});
      console.error('bling: the refresh token was refused —', response.status, readable(data, response.status));
      throw new BlingError('not_connected', 'A conexão com o Bling expirou. Conecte de novo no painel (Nota fiscal · Bling).', response.status);
    })().finally(() => renewing.delete(store));
    renewing.set(store, job);
    return job;
  }

  async function accessToken() {
    const row = await store.integrations.get(NAME), tokens = read(row);
    if (!tokens) throw notConnected();
    if (tokens.access && time(row.accessExpiresAt) > now() + EARLY) return tokens.access;
    return renew();
  }

  // A call to the Bling API. An expired token is renewed once; errors come back as BlingError with Bling's own words.
  async function api(method, path, body, {retry = true} = {}) {
    const token = await accessToken();
    const response = await send(API + path, {method, headers: {Authorization: `Bearer ${token}`, 'enable-jwt': '1', Accept: 'application/json', ...(body ? {'Content-Type': 'application/json'} : {})}, body: body ? JSON.stringify(body) : undefined});
    if (response.status === 401 && retry) { await renew(); return api(method, path, body, {retry: false}); }
    if (response.status === 204) return null;
    const data = await response.json().catch(() => null);
    if (response.status === 429) throw new BlingError('rate_limited', 'O Bling pediu uma pausa. Tente de novo em alguns instantes.', 429);
    if (response.status === 401) throw new BlingError('not_connected', 'O Bling recusou o acesso. Conecte de novo no painel (Nota fiscal · Bling).', 401);
    if (!response.ok) throw new BlingError(response.status >= 500 ? 'bling_unavailable' : 'bling_rejected', readable(data, response.status), response.status);
    return data;
  }

  return {
    settings,
    api,

    authorizationUrl(state) {
      const url = new URL(settings.authorizeUrl);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', settings.clientId);
      url.searchParams.set('state', state);
      return url.toString();
    },

    // Bling sent the admin back with a one-minute code: exchange it for tokens. Connecting again lifts a pause.
    async connect(code, {actor}) {
      if (!settings.configured) throw new BlingError('bling_not_configured', 'Faltam BLING_CLIENT_ID e BLING_CLIENT_SECRET.');
      if (!/^[\w.~-]{4,512}$/.test(String(code || ''))) throw new BlingError('bling_code_invalid', 'Código de autorização inválido.');
      const {response, data} = await tokenCall('token', {grant_type: 'authorization_code', code});
      if (!response.ok || !data?.access_token) {
        if (response.status >= 500) throw new BlingError('bling_unavailable', 'O Bling não respondeu. Tente de novo em alguns minutos.', response.status);
        throw new BlingError('bling_code_invalid', readable(data, response.status), response.status);
      }
      await save(data, null, null, {connectedBy: clean(actor).slice(0, 180) || null, connectedAt: date(), pausedReason: null});
      paymentMethods.delete(store);
    },

    // Forget the tokens (and ask Bling to revoke them; if Bling does not answer, they die on their own).
    async disconnect() {
      const tokens = read(await store.integrations.get(NAME));
      if (tokens?.refresh && settings.configured) await tokenCall('revoke', {token: tokens.refresh, token_type_hint: 'refresh_token'}).catch(() => {});
      await store.integrations.remove(NAME);
      paymentMethods.delete(store);
    },

    async status() {
      const row = await store.integrations.get(NAME), connected = Boolean(read(row));
      return {
        configured: settings.configured, redirectUri: settings.redirectUri, connected, expired: Boolean(row && !connected && row.connectedAt),
        connectedAt: iso(row?.connectedAt), connectedBy: row?.connectedBy || null, refreshExpiresAt: connected ? iso(row.refreshExpiresAt) : null, pausedReason: row?.pausedReason || null
      };
    },

    // Called when the panel loads: renews the refresh token once a week, so a quiet month never drops the connection.
    async keepAlive() {
      const row = await store.integrations.get(NAME);
      if (!settings.configured || !read(row) || now() - time(row.refreshedAt) < KEEP_ALIVE) return false;
      try { await renew(); return true; } catch (error) { console.error('bling: keep-alive failed —', error.code || '', error.message); return false; }
    },

    async pause(reason) { await store.integrations.save(NAME, {pausedReason: clean(reason)}); },
    async resume() { await store.integrations.save(NAME, {pausedReason: null}); },

    // Bling's "naturezas de operação" (the accountant's tax rules), so the panel can show which id to use.
    async natures() {
      const data = await api('GET', '/naturezas-operacoes?limite=100');
      return (data?.data || []).map(n => ({id: String(n.id), description: clean(n.descricao), active: Number(n.situacao) !== 0, standard: Number(n.padrao) === 1}));
    },

    // Bling's payment method for an NF-e payment code (17 Pix, 03 credit card, 04 debit card), looked up once an hour.
    async paymentMethodId(code) {
      let cached = paymentMethods.get(store);
      if (!cached || now() - cached.at > 3600e3) {
        const data = await api('GET', '/formas-pagamentos?limite=100');
        cached = {at: now(), list: (data?.data || []).filter(f => Number(f.situacao) !== 0)};
        paymentMethods.set(store, cached);
      }
      const matches = cached.list.filter(f => Number(f.tipoPagamento) === Number(code));
      const chosen = matches.find(f => Number(f.padrao) === 1) || matches[0];
      return chosen ? String(chosen.id) : null;
    }
  };
}

module.exports = {createBling, blingSettings, signState, checkState, BlingError, readable, NAME};
