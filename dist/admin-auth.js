// Client side of the admin panel API. The session is an HttpOnly cookie set by the server (password, then the code
// from the authenticator app); this file never sees or stores a token. Every answer is {status, data}.
async function request(path, {method = 'GET', body, fetchImpl = globalThis.fetch, timeout = 15000} = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetchImpl(path, {method, cache: 'no-store', credentials: 'same-origin', signal: controller.signal, ...(body ? {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {})});
    return {status: response.status, data: await response.json().catch(() => null)};
  } finally { clearTimeout(timer); }
}

// Step 1: {ok, next: 'totp' | 'totp_setup', setup?: {secret, otpauth}} or {ok: false, error, retryAfter?}.
export async function login(email, password, options) {
  const {status, data} = await request('/api/admin/login', {method: 'POST', body: {email, password}, ...options});
  return status === 200 && data?.ok ? {ok: true, next: data.next, setup: data.setup || null} : {ok: false, status, error: data?.error || 'unavailable', retryAfter: data?.retryAfter};
}
// Step 2: the 6-digit code. {ok, email, expiresAt} or {ok: false, error, remaining?}.
export async function verifyCode(code, options) {
  const {status, data} = await request('/api/admin/verify', {method: 'POST', body: {code}, ...options});
  return status === 200 && data?.ok ? {ok: true, email: data.email, expiresAt: data.expiresAt} : {ok: false, status, error: data?.error || 'unavailable', remaining: data?.remaining};
}
// Who is signed in, or null. A network failure throws, so the page can say so instead of showing the login.
export async function currentSession(options) {
  const {status, data} = await request('/api/admin/session', options);
  if (status === 200 && data?.ok) return {email: data.email, expiresAt: data.expiresAt};
  if ((status === 200 && data?.ok === false) || status === 401) return null;
  throw Object.assign(new Error('unavailable'), {status, code: data?.error || 'unavailable'});
}
export async function logout(options) { try { await request('/api/admin/logout', {method: 'POST', ...options}); } catch {} }

// The totals, the chart and the calendar need every paid order: the server answers a page at a time (each answer small
// and quick) and the pages are joined here. MAX_PAGES stops a server that would keep answering a next page.
const ORDERS_PAGE = 200, MAX_PAGES = 100;
export async function loadOrders(options) {
  const orders = [];
  let first = null, cursor = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const {status, data} = await request(`/api/admin/orders?limit=${ORDERS_PAGE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, options);
    if (status !== 200 || !Array.isArray(data?.orders)) throw Object.assign(new Error(status === 401 ? 'unauthorized' : 'unavailable'), {status, code: status === 401 ? 'unauthorized' : data?.error || 'unavailable'});
    first ||= data; orders.push(...data.orders); cursor = data.nextCursor || null;
    if (!cursor) break;
  }
  return {orders, invoicing: first.invoicing || 'off', provider: first.invoicingProvider || null};
}
// "Conferir estorno" / "Tentar estorno de novo" on a declined order.
export async function retryRefund(id, options) {
  const answer = await request('/api/admin/order-refund', {method: 'POST', body: {id}, ...options});
  if (answer.status === 200 && answer.data?.order) return {order: answer.data.order, refund: answer.data.refund || null};
  throw Object.assign(new Error(answer.status === 401 ? 'unauthorized' : 'unavailable'), {status: answer.status, code: answer.status === 401 ? 'unauthorized' : answer.data?.error || 'unavailable'});
}
export async function changeStatus(id, status, reason = '', {trackingCode, ...options} = {}) {
  const answer = await request('/api/admin/order-status', {method: 'POST', body: {id, status, reason, ...(trackingCode ? {trackingCode} : {})}, ...options});
  if (answer.status === 200 && answer.data?.order) return {order: answer.data.order, mailed: answer.data.mailed === true, refund: answer.data.refund || null};
  throw Object.assign(new Error(answer.status === 401 ? 'unauthorized' : 'unavailable'), {status: answer.status, code: answer.status === 401 ? 'unauthorized' : answer.data?.error || 'unavailable'});
}

// Issues the NF-e of a confirmed order again (after an error). Answers the order with its invoice.
export async function retryInvoice(id, options) {
  const answer = await request('/api/admin/order-invoice', {method: 'POST', body: {id}, ...options});
  if (answer.status === 200 && answer.data?.order) return answer.data.order;
  throw Object.assign(new Error(answer.status === 401 ? 'unauthorized' : 'unavailable'), {status: answer.status, code: answer.status === 401 ? 'unauthorized' : answer.data?.error || 'unavailable'});
}

// Fluxo de caixa: the whole view ({today, balanceCents, movements, bills}), and one change that answers it again.
const cashError = answer => Object.assign(new Error(answer.status === 401 ? 'unauthorized' : 'unavailable'), {status: answer.status, code: answer.status === 401 ? 'unauthorized' : answer.data?.error || 'unavailable', field: answer.data?.field});
export async function loadCash(options) {
  const answer = await request('/api/admin/cash', options);
  if (answer.status === 200 && answer.data?.cash) return answer.data.cash;
  throw cashError(answer);
}
export async function cashAction(action, payload = {}, options) {
  const answer = await request('/api/admin/cash', {method: 'POST', body: {...payload, action}, ...options});
  if (answer.status === 200 && answer.data?.cash) return answer.data.cash;
  throw cashError(answer);
}

// Envio internacional: the Exporta Fácil options of the contract for a country and the pieces (api/admin/international-quote.js).
export async function internationalQuote(country, items, options) {
  const answer = await request('/api/admin/international-quote', {method: 'POST', body: {country, items}, timeout: 30000, ...options});
  if (answer.status === 200 && Array.isArray(answer.data?.options)) return answer.data;
  throw Object.assign(new Error(answer.status === 401 ? 'unauthorized' : 'unavailable'), {status: answer.status, code: answer.status === 401 ? 'unauthorized' : answer.data?.error || 'unavailable'});
}

// The buyer's full CPF for issuing the invoice by hand (audited on the server).
export async function revealDocument(id, options) {
  const answer = await request('/api/admin/order-document', {method: 'POST', body: {id}, ...options});
  if (answer.status === 200 && typeof answer.data?.cpf === 'string') return answer.data.cpf;
  throw Object.assign(new Error(answer.status === 401 ? 'unauthorized' : 'unavailable'), {status: answer.status, code: answer.status === 401 ? 'unauthorized' : answer.data?.error || 'unavailable'});
}

// The Bling connection (NF-e service): where it stands, and the actions. 'start' answers the address of Bling's
// authorization page; the others answer the new state.
export async function loadBling(options) {
  const answer = await request('/api/admin/bling', options);
  if (answer.status === 200 && answer.data?.bling) return answer.data.bling;
  throw Object.assign(new Error('unavailable'), {status: answer.status, code: answer.status === 401 ? 'unauthorized' : answer.data?.error || 'unavailable'});
}
export async function blingAction(action, extra = {}, options) {
  const answer = await request('/api/admin/bling', {method: 'POST', body: {action, ...extra}, ...options});
  if (answer.status === 200 && action === 'start' && /^https?:\/\//.test(answer.data?.url || '')) return answer.data.url;
  if (answer.status === 200 && answer.data?.bling) return answer.data.bling;
  throw Object.assign(new Error('unavailable'), {status: answer.status, code: answer.status === 401 ? 'unauthorized' : answer.data?.error || 'unavailable', field: answer.data?.field});
}

// The secret in groups of four, for typing into the app when the QR code cannot be scanned.
export const groupSecret = secret => String(secret || '').replace(/[^A-Z2-7]/g, '').replace(/(.{4})(?=.)/g, '$1 ');
