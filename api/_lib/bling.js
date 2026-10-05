'use strict';
// Bling (API v3), the NF-e service chosen by the accountant. The store's Bling account is connected once from the panel
// (OAuth 2.0 authorization code: someone signs in at Bling and allows the app), and the site keeps the tokens encrypted
// with DATA_KEY in the integrations table (db/migrations/008_bling.sql), renewing them by itself. The access token lasts
// about 6 hours; the refresh token 30 days from its last use, so the site renews it at least once a week (keepAlive).
// Tokens never leave the server and are never logged.
//
// Bling down, slow or refusing for too many calls never stops the shop (BLING-RESILIENCIA.md): the buyer never waits for
// Bling, and here every call is
//   - paced: at most BLING_REQUESTS_PER_SECOND (3) leave a server process each second, as Bling allows;
//   - timed out after 20 seconds, and a refusal for too many calls (429) waits and goes again, twice, before giving up;
//   - counted by a circuit breaker kept in the integrations row (db/migrations/011_bling_fila.sql), shared by every
//     process and shown in the panel: after 3 failures in a row the calls stop for a while (1, 2, 4… up to 30 minutes)
//     and fail at once, without waiting for Bling; then one call tests it again, and the first good answer closes it.
// Failures, pauses and recoveries go to integration_log. The NF-e queue (api/_lib/invoice-queue.js) waits for Bling.
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
// The circuit breaker: open after `threshold` failures in a row, for firstMs doubling up to maxMs; when that is over, one
// call tests Bling while the others keep waiting for probeMs.
const BREAKER = Object.freeze({threshold: 3, firstMs: 60000, maxMs: 30 * 60000, probeMs: 30000});
const RATE_LIMIT_WAITS = [1000, 2000];   // a 429 goes again after these waits (or Bling's Retry-After, up to 5 s)
const MAX_RETRY_AFTER = 5000;
const NEVER_SENT = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH']);   // the call never left the server
const SEEN = 60000;   // how long a process trusts what it last saw of the breaker before reading it again

// code: not_connected, bling_not_configured, bling_code_invalid, bling_rejected (Bling refused the data), and the
// passing ones: bling_unavailable (down, slow or the breaker open) and rate_limited. `retryAt`: when trying again makes
// sense. `unknown`: the call may have reached Bling before it broke (a note may have been created).
class BlingError extends Error {
  constructor(code, message, status, extra = {}) { super(message); this.name = 'BlingError'; this.code = code; this.status = status; Object.assign(this, extra); }
  get transient() { return this.code === 'bling_unavailable' || this.code === 'rate_limited'; }
}
const clean = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
const time = value => value ? new Date(value).getTime() : 0;
const iso = value => value ? new Date(value).toISOString() : null;
const hhmm = value => new Intl.DateTimeFormat('pt-BR', {timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit'}).format(new Date(value));
const realSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
  const perSecond = Number(env.BLING_REQUESTS_PER_SECOND);
  return {configured: Boolean(clientId && clientSecret), clientId, clientSecret, redirectUri: `${config(env).siteUrl}/admin.html`, authorizeUrl, perSecond: perSecond > 0 ? perSecond : 3};
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
const natureLists = new WeakMap();
const gates = new WeakMap();     // store → when the next call may leave this process
const failing = new WeakMap();   // store → {value, at}: did this process last see the breaker counting failures?

// sleep and clock: the pacing's and the 429's waits (tests make them instant). BLING_TIMEOUT_MS only shortens the
// 20-second timeout in tests.
function createBling({store, env = process.env, now = () => Date.now(), fetchImpl = globalThis.fetch, sleep = realSleep, clock = Date.now, timeoutMs = Number(env.BLING_TIMEOUT_MS) > 0 ? Number(env.BLING_TIMEOUT_MS) : TIMEOUT_MS}) {
  const settings = blingSettings(env), date = () => new Date(now());
  const read = row => { if (!row?.tokensEnc) return null; try { return JSON.parse(decrypt(env, row.tokensEnc)); } catch { return null; } };
  const notConnected = () => new BlingError('not_connected', 'O Bling não está conectado. Conecte a conta no painel (Nota fiscal · Bling).');

  async function log(entry) {
    try { await store.integrationLog?.add({name: NAME, ...entry, message: entry.message ? clean(entry.message) : null}); }
    catch (error) { console.error('bling: could not write the integration log —', error.code || '', error.message); }
  }

  // Calls leave one process at most settings.perSecond times a second, in the order they asked.
  async function pace() {
    const gap = 1000 / settings.perSecond, t = clock(), at = Math.max(t, gates.get(store) || 0);
    gates.set(store, at + gap);
    if (at > t) await sleep(at - t);
  }

  // ── the circuit breaker ─────────────────────────────────────────────
  const unavailable = row => new BlingError('bling_unavailable', 'O Bling está fora do ar ou instável no momento.', 503,
    {retryAt: new Date(Math.max(time(row?.openUntil), now() + 1000)), breaker: true});
  // Before a call: open → fail at once; the pause just ended → this call is the test (the others wait probeMs more).
  async function guard(row) {
    if (!row || (row.failures || 0) < BREAKER.threshold) return;
    if (time(row.openUntil) > now()) throw unavailable(row);
    await store.integrations.save(NAME, {openUntil: new Date(now() + BREAKER.probeMs)});
  }
  async function failed({operation, reference = null, status = null, message, ms = null}) {
    console.error(`bling: ${operation} falhou —`, status || 'sem resposta', message);
    failing.set(store, {value: true, at: clock()});
    try {
      const row = await store.integrations.get(NAME);
      if (!row) return;   // not connected: nothing to count
      const failures = (row.failures || 0) + 1, opens = failures >= BREAKER.threshold;
      const openUntil = opens ? new Date(now() + Math.min(BREAKER.firstMs * 2 ** (failures - BREAKER.threshold), BREAKER.maxMs)) : row.openUntil;
      await store.integrations.save(NAME, {failures, failingSince: row.failingSince || date(), openUntil, lastError: clean(message)});
      await log({kind: status === 429 ? 'limite' : 'falha', operation, httpStatus: status, durationMs: ms, reference, message});
      if (opens) await log({kind: 'disjuntor', operation, reference, message: `${failures} falhas seguidas: chamadas ao Bling suspensas até ${hhmm(openUntil)}.`});
    } catch (error) { console.error('bling: could not record the failure —', error.code || '', error.message); }
  }
  // Any answer that is not a server error means Bling is up again (a 400 is about the data sent, not about Bling).
  // `suspect`: the row read before the call was counting failures, so it is read again whatever this process last saw.
  async function healthy(suspect = false) {
    const seen = failing.get(store);
    if (!suspect && seen && !seen.value && clock() - seen.at < SEEN) return;
    try {
      const row = await store.integrations.get(NAME);
      if (row && ((row.failures || 0) > 0 || row.openUntil)) {
        await store.integrations.save(NAME, {failures: 0, failingSince: null, openUntil: null, lastError: null});
        await log({kind: 'recuperado', message: `O Bling voltou a responder${row.failingSince ? ` (instável desde ${hhmm(row.failingSince)})` : ''}.`});
      }
      failing.set(store, {value: false, at: clock()});
    } catch (error) { console.error('bling: could not record the recovery —', error.code || '', error.message); }
  }

  // Every request to Bling goes through here: paced, timed out, and counted for the breaker. The answer is read whole
  // within the same time limit (Bling sending the start of an answer and then stalling must not hold the site), and
  // comes back as {status, ok, headers, data}. `unsafe`: a call that creates something, so a break after it left may
  // have created it.
  async function send(url, init, {operation, reference = null, unsafe = false, suspect = false} = {}) {
    await pace();
    const started = clock(), controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
    let response, data = null;
    try {
      response = await fetchImpl(url, {...init, signal: controller.signal});
      if (response.status !== 204) data = await response.json().catch(error => { if (controller.signal.aborted) throw error; return null; });   // not JSON (an HTML error page): no data
    } catch (error) {
      const timedOut = controller.signal.aborted, neverSent = !timedOut && !response && NEVER_SENT.has(error?.cause?.code || error?.code);
      const seconds = Math.max(1, Math.round(timeoutMs / 1000));
      const message = timedOut ? `O Bling não respondeu em ${seconds} segundo${seconds === 1 ? '' : 's'}.` : 'O Bling não respondeu.';
      await failed({operation, reference, message, ms: clock() - started});
      throw new BlingError('bling_unavailable', message, null, {retryAt: new Date(now() + BREAKER.firstMs), unknown: unsafe && !neverSent});
    } finally { clearTimeout(timer); }
    if (response.status >= 500) await failed({operation, reference, status: response.status, message: `O Bling respondeu ${response.status}.`, ms: clock() - started});
    else if (response.status !== 429) await healthy(suspect);
    return {status: response.status, ok: response.ok, headers: response.headers, data};
  }

  async function tokenCall(path, form) {
    const response = await send(`${OAUTH}/${path}`, {method: 'POST', headers: {Authorization: 'Basic ' + Buffer.from(`${settings.clientId}:${settings.clientSecret}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'enable-jwt': '1'}, body: new URLSearchParams(form).toString()}, {operation: `oauth ${form.grant_type || path}`});
    return {response, data: response.data};
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
      if (response.status >= 500 || response.status === 429) throw new BlingError(response.status === 429 ? 'rate_limited' : 'bling_unavailable', 'O Bling não respondeu. Tente de novo em alguns minutos.', response.status, {retryAt: new Date(now() + BREAKER.firstMs)});
      // Refused: another server process may have renewed with this same refresh token a moment ago; use its result.
      const again = await store.integrations.get(NAME), fresh = read(again);
      if (fresh?.access && fresh.access !== tokens.access && time(again.accessExpiresAt) > now() + EARLY) return fresh.access;
      await store.integrations.save(NAME, {tokensEnc: null, accessExpiresAt: null, refreshExpiresAt: null});
      console.error('bling: the refresh token was refused —', response.status, readable(data, response.status));
      await log({kind: 'conexao', operation: 'oauth refresh_token', httpStatus: response.status, message: 'O Bling recusou a renovação do acesso: é preciso conectar de novo no painel.'});
      throw new BlingError('not_connected', 'A conexão com o Bling expirou. Conecte de novo no painel (Nota fiscal · Bling).', response.status);
    })().finally(() => renewing.delete(store));
    renewing.set(store, job);
    return job;
  }

  async function accessToken(row) {
    const tokens = read(row);
    if (!tokens) throw notConnected();
    if (tokens.access && time(row.accessExpiresAt) > now() + EARLY) return tokens.access;
    return renew();
  }

  const retryAfter = response => {
    const value = Number(response.headers?.get?.('retry-after'));
    return value > 0 ? value * 1000 : null;
  };

  // A call to the Bling API. An expired token is renewed once; a 429 waits and goes again; errors come back as BlingError
  // with Bling's own words. `reference`: the order it is for, in the integration log. `unsafe`: it creates something.
  async function api(method, path, body, {retry = true, reference = null, unsafe = false, guarded = false} = {}) {
    const row = await store.integrations.get(NAME);
    if (!read(row)) throw notConnected();
    if (!guarded) await guard(row);
    const token = await accessToken(row), suspect = (row.failures || 0) > 0;
    const operation = `${method} ${path.replace(/\/\d+(?=\/|$|\?)/g, '/{id}').replace(/\?.*$/, '')}`;
    for (let attempt = 0; ; attempt++) {
      const response = await send(API + path, {method, headers: {Authorization: `Bearer ${token}`, 'enable-jwt': '1', Accept: 'application/json', ...(body ? {'Content-Type': 'application/json'} : {})}, body: body ? JSON.stringify(body) : undefined}, {operation, reference, unsafe, suspect});
      if (response.status === 401 && retry) { await renew(); return api(method, path, body, {retry: false, reference, unsafe, guarded: true}); }
      if (response.status === 204) return null;
      const data = response.data;
      if (response.status === 429) {
        const wait = retryAfter(response) ?? RATE_LIMIT_WAITS[attempt];
        // Refused for too many calls: nothing was done, so the same call can go again after a short wait.
        if (attempt < RATE_LIMIT_WAITS.length && wait <= MAX_RETRY_AFTER) { await sleep(wait); continue; }
        await failed({operation, reference, status: 429, message: 'O Bling pediu uma pausa (limite de requisições).'});
        throw new BlingError('rate_limited', 'O Bling pediu uma pausa. Tente de novo em alguns instantes.', 429, {retryAt: new Date(now() + Math.max(wait || 0, BREAKER.firstMs))});
      }
      if (response.status === 401) throw new BlingError('not_connected', 'O Bling recusou o acesso. Conecte de novo no painel (Nota fiscal · Bling).', 401);
      if (response.status >= 500) {
        if (method === 'GET' && attempt === 0) { await sleep(1000); continue; }   // a read goes again once, a second later
        // A gateway error (502, 504) on a creation: Bling itself may have done it before the gateway gave up.
        throw new BlingError('bling_unavailable', readable(data, response.status), response.status, {retryAt: new Date(now() + BREAKER.firstMs), unknown: unsafe && [502, 504].includes(response.status)});
      }
      if (!response.ok) {
        await log({kind: 'recusa', operation, httpStatus: response.status, reference, message: readable(data, response.status)});
        throw new BlingError('bling_rejected', readable(data, response.status), response.status);
      }
      return data;
    }
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

    // Bling sent the admin back with a one-minute code: exchange it for tokens. Connecting again lifts a pause and
    // starts the breaker from zero.
    async connect(code, {actor}) {
      if (!settings.configured) throw new BlingError('bling_not_configured', 'Faltam BLING_CLIENT_ID e BLING_CLIENT_SECRET.');
      if (!/^[\w.~-]{4,512}$/.test(String(code || ''))) throw new BlingError('bling_code_invalid', 'Código de autorização inválido.');
      const {response, data} = await tokenCall('token', {grant_type: 'authorization_code', code});
      if (!response.ok || !data?.access_token) {
        if (response.status >= 500 || response.status === 429) throw new BlingError('bling_unavailable', 'O Bling não respondeu. Tente de novo em alguns minutos.', response.status);
        throw new BlingError('bling_code_invalid', readable(data, response.status), response.status);
      }
      await save(data, null, null, {connectedBy: clean(actor).slice(0, 180) || null, connectedAt: date(), pausedReason: null, failures: 0, failingSince: null, openUntil: null, lastError: null});
      paymentMethods.delete(store); natureLists.delete(store);   // perhaps another Bling account: nothing of the old one stays
    },

    // Forget the tokens (and ask Bling to revoke them; if Bling does not answer, they die on their own).
    async disconnect() {
      const tokens = read(await store.integrations.get(NAME));
      if (tokens?.refresh && settings.configured) await tokenCall('revoke', {token: tokens.refresh, token_type_hint: 'refresh_token'}).catch(() => {});
      await store.integrations.remove(NAME);
      paymentMethods.delete(store); natureLists.delete(store);
    },

    // The connection and the breaker, from the database only (never calls Bling).
    async status() {
      const row = await store.integrations.get(NAME), connected = Boolean(read(row)), failures = row?.failures || 0;
      return {
        configured: settings.configured, redirectUri: settings.redirectUri, connected, expired: Boolean(row && !connected && row.connectedAt),
        connectedAt: iso(row?.connectedAt), connectedBy: row?.connectedBy || null, refreshExpiresAt: connected ? iso(row.refreshExpiresAt) : null, pausedReason: row?.pausedReason || null,
        unstable: connected && failures >= BREAKER.threshold, failures, failingSince: failures ? iso(row.failingSince) : null,
        retryAt: failures >= BREAKER.threshold ? iso(row.openUntil) : null, lastError: failures ? row.lastError || null : null, alertedAt: iso(row?.alertedAt)
      };
    },

    // Renews the refresh token once a week, so a quiet month never drops the connection (the NF-e queue calls it every
    // round, and the panel when it opens). Waits while the breaker is open.
    async keepAlive() {
      const row = await store.integrations.get(NAME);
      if (!settings.configured || !read(row) || now() - time(row.refreshedAt) < KEEP_ALIVE) return false;
      try { await guard(row); await renew(); return true; } catch (error) { console.error('bling: keep-alive failed —', error.code || '', error.message); return false; }
    },

    // Ju asked to try now: the breaker lets the next call through as a test.
    async wake() {
      const row = await store.integrations.get(NAME);
      if (row && (row.failures || 0) >= BREAKER.threshold && time(row.openUntil) > now()) await store.integrations.save(NAME, {openUntil: date()});
    },

    async pause(reason) { await store.integrations.save(NAME, {pausedReason: clean(reason)}); await log({kind: 'pausa', message: reason}); },
    async resume() { await store.integrations.save(NAME, {pausedReason: null}); },
    async markAlerted(at) { await store.integrations.save(NAME, {alertedAt: at}); },
    recent: (limit = 10) => store.integrationLog ? store.integrationLog.recent(NAME, limit) : [],
    log,

    // Bling's "naturezas de operação" (the accountant's tax rules), so the panel can show which id to use. `kept`: the
    // panel's card takes the list of the last hour, or the last one it got while Bling does not answer.
    async natures({kept = false} = {}) {
      const last = natureLists.get(store);
      if (kept && last && now() - last.at < 3600e3) return last.list;
      try {
        const data = await api('GET', '/naturezas-operacoes?limite=100');
        const list = (data?.data || []).map(n => ({id: String(n.id), description: clean(n.descricao), active: Number(n.situacao) !== 0, standard: Number(n.padrao) === 1}));
        natureLists.set(store, {at: now(), list});
        return list;
      } catch (error) { if (kept && last && error instanceof BlingError && error.transient) return last.list; throw error; }
    },

    // Bling's payment method for an NF-e payment code (17 Pix, 03 credit card, 04 debit card), looked up once an hour.
    async paymentMethodId(code, {reference} = {}) {
      let cached = paymentMethods.get(store);
      if (!cached || now() - cached.at > 3600e3) {
        const data = await api('GET', '/formas-pagamentos?limite=100', null, {reference});
        cached = {at: now(), list: (data?.data || []).filter(f => Number(f.situacao) !== 0)};
        paymentMethods.set(store, cached);
      }
      const matches = cached.list.filter(f => Number(f.tipoPagamento) === Number(code));
      const chosen = matches.find(f => Number(f.padrao) === 1) || matches[0];
      return chosen ? String(chosen.id) : null;
    }
  };
}

module.exports = {createBling, blingSettings, signState, checkState, BlingError, readable, NAME, BREAKER};
