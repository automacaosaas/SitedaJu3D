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

export async function loadOrders(options) {
  const {status, data} = await request('/api/admin/orders', options);
  if (status === 200 && Array.isArray(data?.orders)) return data.orders;
  throw Object.assign(new Error(status === 401 ? 'unauthorized' : 'unavailable'), {status, code: status === 401 ? 'unauthorized' : data?.error || 'unavailable'});
}
// "Conferir estorno" / "Tentar estorno de novo" on a declined order.
export async function retryRefund(id, options) {
  const answer = await request('/api/admin/order-refund', {method: 'POST', body: {id}, ...options});
  if (answer.status === 200 && answer.data?.order) return {order: answer.data.order, refund: answer.data.refund || null};
  throw Object.assign(new Error(answer.status === 401 ? 'unauthorized' : 'unavailable'), {status: answer.status, code: answer.status === 401 ? 'unauthorized' : answer.data?.error || 'unavailable'});
}
export async function changeStatus(id, status, reason = '', options) {
  const answer = await request('/api/admin/order-status', {method: 'POST', body: {id, status, reason}, ...options});
  if (answer.status === 200 && answer.data?.order) return {order: answer.data.order, mailed: answer.data.mailed === true, refund: answer.data.refund || null};
  throw Object.assign(new Error(answer.status === 401 ? 'unauthorized' : 'unavailable'), {status: answer.status, code: answer.status === 401 ? 'unauthorized' : answer.data?.error || 'unavailable'});
}

// The buyer's full CPF for issuing the invoice by hand (audited on the server).
export async function revealDocument(id, options) {
  const answer = await request('/api/admin/order-document', {method: 'POST', body: {id}, ...options});
  if (answer.status === 200 && typeof answer.data?.cpf === 'string') return answer.data.cpf;
  throw Object.assign(new Error(answer.status === 401 ? 'unauthorized' : 'unavailable'), {status: answer.status, code: answer.status === 401 ? 'unauthorized' : answer.data?.error || 'unavailable'});
}

// The secret in groups of four, for typing into the app when the QR code cannot be scanned.
export const groupSecret = secret => String(secret || '').replace(/[^A-Z2-7]/g, '').replace(/(.{4})(?=.)/g, '$1 ');
