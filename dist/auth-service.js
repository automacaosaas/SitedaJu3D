// Accounts through the server (api/auth/*, api/account/*). The session itself is an HttpOnly cookie that page scripts
// cannot read; the copy kept here (sessionStorage) only shows the name in the header and is refreshed from /api/auth/me.
// account.js and checkout.js use the methods below; see AUTH-INTEGRATION.md.
export const AUTH_MODE = 'server';
const SESSION_KEY = 'ju.account.v2';
export const ORDERS_KEY = 'ju.orders.preview.v1';

const MESSAGES = {
  invalid_email: 'Informe um e-mail válido.',
  invalid_code: 'O código não confere. Verifique os seis números.',
  expired: 'O código expirou. Solicite um novo código.',
  too_many_attempts: 'Limite de tentativas atingido. Solicite outro código.',
  too_many_requests: 'Muitas tentativas. Aguarde um instante e tente de novo.',
  invalid_challenge: 'Este código não é mais válido. Solicite um novo código.',
  invalid_grant: 'Confirme seu e-mail com um novo código.',
  invalid_credentials: 'E-mail ou senha não conferem.',
  weak_password: 'Use uma senha com 8 a 128 caracteres.',
  account_exists: 'Este e-mail já tem uma conta. Entre com o código ou com a sua senha.',
  send_failed: 'Não foi possível enviar o e-mail agora. Tente novamente em instantes.',
  email_not_configured: 'O envio de e-mails ainda não está disponível. Tente novamente mais tarde.',
  accounts_unavailable: 'As contas estão indisponíveis no momento. Tente novamente mais tarde.',
  data_keys_missing: 'As contas estão indisponíveis no momento. Tente novamente mais tarde.',
  unauthorized: 'Sua sessão terminou. Entre de novo para continuar.',
  cpf_in_use: 'Este CPF já está ligado a outra conta.',
  forbidden: 'Não foi possível confirmar este pedido. Recarregue a página e tente de novo.'
};
const FIELDS = {
  name: 'Informe seu nome (até 100 caracteres).', password: 'Use uma senha com 8 a 128 caracteres.',
  firstName: 'Informe seu nome.', lastName: 'Informe seu sobrenome.', cpf: 'Confira o CPF.', phone: 'Informe um telefone com DDD.',
  cnpj: 'Confira o CNPJ.', companyName: 'Informe a razão social.', stateRegistration: 'Informe a inscrição estadual ou marque que é isenta.'
};
const GENERIC = 'Não foi possível continuar. Tente novamente.';

export function createClient({fetchImpl = (...args) => fetch(...args), language = () => globalThis.document?.documentElement?.lang || 'pt-BR'} = {}) {
  async function request(method, path, body) {
    let response;
    try { response = await fetchImpl(path, {method, credentials: 'same-origin', cache: 'no-store', ...(body ? {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {})}); }
    catch { throw Error('Sem conexão. Verifique sua internet e tente de novo.'); }
    let data = null;
    try { data = await response.json(); } catch {}
    if (response.ok) return data || {};
    const code = data?.error || '', message = code === 'invalid_request' || code === 'weak_password' ? FIELDS[data?.field] || GENERIC : MESSAGES[code] || GENERIC;
    throw Object.assign(Error(message), {code, field: data?.field || null, status: response.status});
  }

  // --- the header's copy of who is signed in --------------------------------------------------------------------
  const readCache = () => { try { const v = JSON.parse(sessionStorage.getItem(SESSION_KEY)); return v && typeof v.email === 'string' && typeof v.name === 'string' ? v : null; } catch { return null; } };
  let cached = null, pending = null;
  try { cached = readCache(); } catch {}
  function remember(user) {
    cached = user ? {name: user.name, email: user.email, marketingOptIn: user.marketingOptIn === true, hasPassword: user.hasPassword === true, profileComplete: user.profileComplete === true} : null;
    try { if (cached) sessionStorage.setItem(SESSION_KEY, JSON.stringify(cached)); else sessionStorage.removeItem(SESSION_KEY); } catch {}
    return cached;
  }

  // --- e-mail first: code, then name/password for a new address ------------------------------------------------
  let challenge = null, grant = null;
  const view = c => ({email: c.email, purpose: c.purpose, expiresAt: c.expiresAt, resendAt: c.resendAt, ...(c.demoCode ? {demoCode: c.demoCode} : {})});
  async function start(email, purpose) {
    const data = await request('POST', '/api/auth/start', {email, purpose, lang: language()});
    challenge = {...data, token: data.challenge};
    grant = null;
    return view(challenge);
  }
  const decodeEmail = part => { try { return new TextDecoder().decode(Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))); } catch { return ''; } };

  const auth = {
    begin: ({email}) => start(email, 'access'),
    forgot: ({email}) => start(email, 'reset'),
    async resend() { if (!challenge) throw Error('Solicite um novo código.'); return start(challenge.email, challenge.purpose); },
    // The link in the e-mail carries the code reference and the code; the address in it is only for display.
    adopt(token) {
      const [id = '', part = ''] = String(token).split('.'), email = decodeEmail(part);
      if (!/^[0-9a-f-]{36}$/.test(id) || !/^[^\s@]+@[^\s@]+$/.test(email)) throw Error('Este link não é mais válido. Entre ou crie sua conta para receber um novo código.');
      challenge = {token, email, purpose: 'access', expiresAt: Date.now() + 600000, resendAt: Date.now()};
      grant = null;
      return view(challenge);
    },
    async verify({code}) {
      if (!challenge) throw Error('Solicite um novo código.');
      const data = await request('POST', '/api/auth/verify', {challenge: challenge.token, code});
      if (data.status === 'signed_in') { challenge = null; return {user: remember(data.user)}; }
      grant = data.grant;
      return data.status === 'reset_allowed' ? {resetAllowed: true} : {registrationAllowed: true};
    },
    async completeRegistration({name, password, marketingOptIn = false}) {
      if (!grant) throw Error('Confirme seu e-mail com um novo código.');
      const data = await request('POST', '/api/auth/register', {grant, name, password, marketingOptIn: marketingOptIn === true});
      grant = null; challenge = null;
      return remember(data.user);
    },
    async login({email, password}) { return remember((await request('POST', '/api/auth/login', {email, password})).user); },
    async reset({password}) {
      if (!grant) throw Error('Verifique um novo código para redefinir a senha.');
      const data = await request('POST', '/api/auth/reset', {grant, password});
      grant = null; challenge = null;
      return remember(data.user);
    },
    cancel() { challenge = null; grant = null; }
  };

  return {
    auth,
    getSession: () => cached,
    acceptSession: async user => remember(user),
    // The header and the page both ask when a page opens; callers at the same moment share one request.
    refreshSession() {
      pending ??= (async () => {
        try {
          const response = await fetchImpl('/api/auth/me', {credentials: 'same-origin', cache: 'no-store'});
          if (response.status === 401) return remember(null);
          if (!response.ok) return cached;
          return remember((await response.json()).user || null);
        } catch { return cached; }
        finally { pending = null; }
      })();
      return pending;
    },
    async signOut() { try { await request('POST', '/api/auth/logout', {}); } catch {} auth.cancel(); remember(null); },
    loadProfile: async () => (await request('GET', '/api/account/profile')).profile,
    async saveProfile(data) { const profile = (await request('PUT', '/api/account/profile', data)).profile; if (cached) remember({...cached, profileComplete: true}); return profile; }
  };
}

const client = createClient();
export const auth = client.auth;
export const getSession = client.getSession;
export const acceptSession = client.acceptSession;
export const refreshSession = client.refreshSession;
export const signOut = client.signOut;
export const loadProfile = client.loadProfile;
export const saveProfile = client.saveProfile;

// Orders are still the demonstration kept in this tab until the orders database arrives.
export function saveDemoOrder(order) {
  try {
    const existing = JSON.parse(sessionStorage.getItem(ORDERS_KEY) || '[]');
    const safe = {id: order.id, method: order.method, total: order.amounts.total, createdAt: new Date().toISOString(), items: order.items.map(i => ({title: i.title, quantity: i.quantity, unitPrice: i.unitPrice})), demo: true};
    sessionStorage.setItem(ORDERS_KEY, JSON.stringify([safe, ...(Array.isArray(existing) ? existing : [])].slice(0, 20)));
  } catch {}
}
export function readDemoOrders() { try { const value = JSON.parse(sessionStorage.getItem(ORDERS_KEY) || '[]'); return Array.isArray(value) ? value.filter(o => o?.demo === true && Array.isArray(o.items)) : []; } catch { return []; } }
