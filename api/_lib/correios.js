'use strict';
// Correios API (CWS) client: contract price and delivery time. Server only: the access code never reaches the browser.
//   POST /token/v1/autentica/cartaopostagem   Basic (user:access code), body {numero: postage card} → {token, expiraEm}
//   GET  /preco/v1/nacional/{service}         cepOrigem, cepDestino, psObjeto (g), tpObjeto=2 (package), comprimento, largura,
//                                             altura (cm), nuContrato, nuDR → {pcFinal: "23,45", …}
//   GET  /prazo/v1/nacional/{service}         cepOrigem, cepDestino → {prazoEntrega: 4, …}
// Errors carry a `code`: correios_auth (credentials or token refused), correios_unavailable (network, 5xx, 429, timeout)
// and correios_rejected (the request itself was refused — a CEP or service the contract cannot ship; the caller drops that
// option). Messages from the Correios are kept only for the server log, never sent to the browser.
const BASE = 'https://api.correios.com.br';
const TIMEOUT_MS = 9000;
const TOKEN_MARGIN_MS = 5 * 60 * 1000, TOKEN_DEFAULT_MS = 60 * 60 * 1000, TOKEN_MAX_MS = 23 * 60 * 60 * 1000;
// Smallest package the Correios accept (cm): length ≥ width ≥ height, at least 16 × 11 × 2.
const MIN_BOX = Object.freeze([16, 11, 2]);

const fail = (code, extra = {}) => Object.assign(new Error(code), {code, ...extra});
const text = value => String(value ?? '').trim();
const digits = value => text(value).replace(/\D/g, '');

function settings(env = process.env) {
  const user = text(env.CORREIOS_USER), code = text(env.CORREIOS_CODE), card = digits(env.CORREIOS_CARD), contract = digits(env.CORREIOS_CONTRACT);
  const dr = digits(env.CORREIOS_DR), originCep = digits(env.SHIP_FROM_CEP);
  return {user, code, card, contract, dr, originCep, ready: Boolean(user && code && card && contract && /^\d{8}$/.test(originCep))};
}

// "23,45", "1.234,56" or 23.45 → cents; NaN when it is not a positive amount.
function parseMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : NaN;
  const raw = text(value).replace(/[^\d.,]/g, '');
  if (!raw) return NaN;
  const number = Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) : NaN;
}

// A packed box → the parameters of the price request (centimetres rounded up, at least the Correios minimum).
function boxParams(box) {
  const sorted = [box.length, box.width, box.height].map(Number).sort((a, b) => b - a);
  const [length, width, height] = sorted.map((value, i) => Math.max(MIN_BOX[i], Math.ceil(value)));
  return {psObjeto: String(Math.max(1, Math.ceil(Number(box.weightG)))), tpObjeto: '2', comprimento: String(length), largura: String(width), altura: String(height)};
}

const messagesOf = data => [].concat(data?.msgs || data?.mensagem || data?.txErro || data?.causa || []).map(item => String(item).slice(0, 200)).slice(0, 3);

function createCorreios({env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now()} = {}) {
  const config = settings(env);
  let token = null, expiresAt = 0, pending = null;
  const signal = () => typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? {signal: AbortSignal.timeout(TIMEOUT_MS)} : {};

  async function authenticate() {
    let response;
    try {
      response = await fetchImpl(`${BASE}/token/v1/autentica/cartaopostagem`, {
        method: 'POST',
        headers: {Authorization: 'Basic ' + Buffer.from(`${config.user}:${config.code}`).toString('base64'), 'Content-Type': 'application/json', Accept: 'application/json'},
        body: JSON.stringify({numero: config.card}), ...signal()
      });
    } catch { throw fail('correios_unavailable'); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const transient = response.status >= 500 || response.status === 429 || response.status === 408;
      console.error(`correios: token request answered ${response.status}`, messagesOf(data).join(' | '));
      throw fail(transient ? 'correios_unavailable' : 'correios_auth', {status: response.status});
    }
    if (typeof data.token !== 'string' || !data.token) throw fail('correios_auth', {status: response.status});
    const given = Date.parse(data.expiraEm || '') - now();
    token = data.token;
    expiresAt = now() + Math.max(60 * 1000, Math.min(Number.isFinite(given) ? given - TOKEN_MARGIN_MS : TOKEN_DEFAULT_MS, TOKEN_MAX_MS));
    return token;
  }
  const currentToken = () => token && now() < expiresAt ? Promise.resolve(token) : (pending ??= authenticate().finally(() => { pending = null; }));

  async function get(path, params, retry = true) {
    let response;
    const bearer = await currentToken();
    try {
      response = await fetchImpl(`${BASE}${path}?${new URLSearchParams(params)}`, {headers: {Authorization: `Bearer ${bearer}`, Accept: 'application/json'}, ...signal()});
    } catch { throw fail('correios_unavailable'); }
    if (response.status === 401 || response.status === 403) {
      // An expired or revoked token looks the same as a service the contract does not include: renew once, then ask again.
      if (retry) { token = null; return get(path, params, false); }
      throw fail('correios_rejected', {status: response.status, messages: messagesOf(await response.json().catch(() => ({})))});
    }
    const data = await response.json().catch(() => ({}));
    if (response.ok) return data;
    if (response.status >= 500 || response.status === 429 || response.status === 408) throw fail('correios_unavailable', {status: response.status});
    throw fail('correios_rejected', {status: response.status, messages: messagesOf(data)});
  }

  // Contract price of one volume (cents).
  async function price({code, cepDestino, box}) {
    const params = {cepOrigem: config.originCep, cepDestino, ...boxParams(box), nuContrato: config.contract, ...(config.dr ? {nuDR: config.dr} : {})};
    const data = await get(`/preco/v1/nacional/${encodeURIComponent(code)}`, params);
    const cents = parseMoney(data?.pcFinal);
    if (!(cents > 0)) throw fail('correios_rejected', {messages: ['no price in the answer']});
    return cents;
  }
  // Delivery time of the service (business days).
  async function deadline({code, cepDestino}) {
    const data = await get(`/prazo/v1/nacional/${encodeURIComponent(code)}`, {cepOrigem: config.originCep, cepDestino});
    const days = Number(data?.prazoEntrega);
    if (!Number.isInteger(days) || days < 0) throw fail('correios_rejected', {messages: ['no delivery time in the answer']});
    return days;
  }
  return {settings: config, price, deadline};
}

module.exports = {createCorreios, settings, parseMoney, boxParams, MIN_BOX, BASE};
