// Client side of the admin login: talks to /api/admin/login and /api/admin/session, and keeps the session token in
// this browser only (localStorage). The password itself never touches this file after the login call resolves.
const KEY = 'ju.admin.session.v1';

export function getSession(storage = localStorage) {
  try {
    const value = JSON.parse(storage.getItem(KEY) || 'null');
    if (!value || typeof value.token !== 'string' || !Number.isFinite(value.expiresAt)) return null;
    return Date.now() < value.expiresAt ? value : null;
  } catch { return null; }
}
function setSession(session, storage = localStorage) { try { storage.setItem(KEY, JSON.stringify(session)); } catch {} return session; }
export function clearSession(storage = localStorage) { try { storage.removeItem(KEY); } catch {} }

async function request(path, {method = 'GET', body, token, fetchImpl = globalThis.fetch, timeout = 15000} = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetchImpl(path, {method, cache: 'no-store', signal: controller.signal, headers: {...(body ? {'Content-Type': 'application/json'} : {}), ...(token ? {Authorization: `Bearer ${token}`} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});
    return {status: response.status, data: await response.json().catch(() => null)};
  } finally { clearTimeout(timer); }
}

export async function login(email, password, options) {
  const {status, data} = await request('/api/admin/login', {method: 'POST', body: {email, password}, ...options});
  if (status !== 200 || !data?.token) return {ok: false, status, error: data?.error || 'invalid_credentials'};
  setSession({token: data.token, expiresAt: data.expiresAt, email}, options?.storage);
  return {ok: true};
}
export function logout(storage) { clearSession(storage); }

// Confirms the token with the server (catches a forged token, or one from before a password change) before showing
// anything. A network hiccup does not sign the admin out — it falls back to the token's own (unexpired) claim, since
// the token itself was only ever handed out by a server that had already checked the password.
export async function verifiedSession(options) {
  const session = getSession(options?.storage);
  if (!session) return null;
  try {
    const {status} = await request('/api/admin/session', {token: session.token, ...options});
    if (status === 401) { clearSession(options?.storage); return null; }
    return session;
  } catch { return session; }
}
