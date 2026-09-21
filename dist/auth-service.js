// UI adapter only. The demo is NOT authentication and grants no server access.
// Accounts and passwords live in this page's memory. Codes are e-mailed by the server (api/auth/*, Resend) when it is
// configured; otherwise the preview shows a test code. See AUTH-INTEGRATION.md and EMAIL-TEMPLATE.md.
export const AUTH_MODE = 'demo';
const SESSION_KEY = 'ju.account.preview.v1';
export const ORDERS_KEY = 'ju.orders.preview.v1';
let previewSession = null;
const publicUser = user => ({name:user.name, email:user.email, demo:true});
export function getSession() {
  try {
    const value = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    return value?.demo === true && typeof value.name === 'string' && typeof value.email === 'string' ? value : previewSession;
  } catch { return previewSession; }
}
function setSession(user) {
  previewSession = publicUser(user);
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(previewSession)); } catch {}
  return previewSession;
}
export async function signOut() { previewSession = null; try { sessionStorage.removeItem(SESSION_KEY); } catch {} }

// Talks to the e-mail service. Every method resolves to null when the service is not available on this host
// (no /api, or not configured yet) so the preview keeps working; real failures throw a message for the user.
export function createMailer({fetchImpl = (...args) => fetch(...args), language = () => document.documentElement?.lang || 'pt-BR'} = {}) {
  async function post(path, body) {
    let response;
    try { response = await fetchImpl(path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)}); }
    catch { throw Error('Sem conexão. Verifique sua internet e tente de novo.'); }
    let data = null;
    try { data = await response.json(); } catch {}
    if (response.status === 404 || response.status === 405 || (response.status === 503 && data?.error === 'email_not_configured') || (response.ok && !data)) return null;
    return {status:response.status, data:data || {}};
  }
  const tooMany = 'Muitas tentativas. Aguarde um instante e tente de novo.';
  return {
    async send({email, name = '', purpose}) {
      const reply = await post('/api/auth/send-code', {email, name, purpose, lang:language()});
      if (!reply) return null;
      if (reply.status === 200 && reply.data.challenge) return {token:reply.data.challenge, expiresAt:reply.data.expiresAt, resendAt:reply.data.resendAt};
      if (reply.status === 400) throw Error('Informe um e-mail válido.');
      if (reply.status === 429) throw Error(tooMany);
      throw Error('Não foi possível enviar o e-mail agora. Tente novamente em instantes.');
    },
    async verify({token, code}) {
      const reply = await post('/api/auth/verify-code', {challenge:token, code});
      if (!reply) throw Error('Não foi possível conferir o código agora. Tente novamente em instantes.');
      if (reply.status === 200) return reply.data;
      if (reply.data.error === 'expired') throw Error('O código expirou. Solicite um novo código.');
      if (reply.data.error === 'invalid_code') throw Error('O código não confere. Verifique os seis números.');
      if (reply.status === 429) throw Error(tooMany);
      throw Error('Este link não é mais válido. Entre ou crie sua conta para receber um novo código.');
    },
    // Display only: the server is what actually checks the signature and the code.
    peek(token) {
      try {
        const body = String(token).split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(body), char => char.charCodeAt(0))));
        return payload?.v === 1 && typeof payload.e === 'string' && typeof payload.p === 'string' ? {email:payload.e, purpose:payload.p, name:String(payload.n || ''), expiresAt:Number(payload.x)} : null;
      } catch { return null; }
    }
  };
}

export function createDemoAuth({now = () => Date.now(), makeCode = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6,'0'), mailer = null} = {}) {
  const accounts = new Map();
  let challenge = null, resetGrant = null;
  const normalize = value => String(value || '').trim().toLowerCase();
  const checkPassword = value => { if (typeof value !== 'string' || value.length < 8 || value.length > 128) throw Error('Use uma senha com 8 a 128 caracteres.'); };
  async function digest(value) {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(n=>n.toString(16).padStart(2,'0')).join('');
  }
  function issue(email, purpose, pending) {
    if (challenge && now()-challenge.sentAt < 30000) throw Error('Aguarde 30 segundos antes de solicitar outro código.');
    resetGrant = null;
    challenge = {email, purpose, pending, code:makeCode(), expiresAt:now()+600000, sentAt:now(), attempts:0};
    return {email, purpose, expiresAt:challenge.expiresAt, resendAt:challenge.sentAt+30000, demoCode:challenge.code};
  }
  // E-mailed code when the service is available; otherwise the preview code above.
  async function issueByEmail(email, purpose, pending, name = '') {
    if (challenge && now()-challenge.sentAt < 30000) throw Error('Aguarde 30 segundos antes de solicitar outro código.');
    const sent = mailer ? await mailer.send({email, name:pending?.name || name, purpose}) : null;
    if (!sent) return issue(email, purpose, pending);
    resetGrant = null;
    challenge = {email, purpose, pending, name:pending?.name || name, server:sent, expiresAt:sent.expiresAt, sentAt:now(), attempts:0};
    return {email, purpose, expiresAt:sent.expiresAt, resendAt:sent.resendAt};
  }
  // The server's answer is authoritative for which address was verified.
  function complete(valid, proof) {
    challenge = null;
    const email = proof?.email || valid.email;
    if (valid.purpose === 'signup' || valid.purpose === 'access') {
      const pending = valid.pending ? {...valid.pending, email} : {name:proof?.name || email.split('@')[0], email, passwordHash:null};
      accounts.set(email, pending);
      return {user:publicUser(pending)};
    }
    resetGrant = {email, expiresAt:now()+600000, verified:Boolean(proof)};
    return {resetAllowed:true};
  }
  return {
    async register({name,email,password}, {onStage = () => {}} = {}) {
      email=normalize(email); name=String(name||'').trim();
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error('Preencha seu nome e um e-mail válido.');
      checkPassword(password);
      if(accounts.has(email)) throw Error('Este e-mail já foi cadastrado nesta prévia. Entre na sua conta.');
      const pending = {name,email,passwordHash:await digest(password)};
      onStage('sending');
      return issueByEmail(email,'signup',pending);
    },
    async login({email,password}) {
      const account=accounts.get(normalize(email));
      if (!account || account.passwordHash !== await digest(password)) throw Error('E-mail ou senha não conferem nesta prévia. Crie uma conta de teste nesta página.');
      return publicUser(account);
    },
    async forgot({email}, {onStage = () => {}} = {}) {
      email=normalize(email);
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error('Informe um e-mail válido.');
      onStage('sending');
      return issueByEmail(email,'reset');
    },
    async resend() {
      if(!challenge) throw Error('Solicite um novo código.');
      return issueByEmail(challenge.email,challenge.purpose,challenge.pending,challenge.name);
    },
    // Continue a challenge that started elsewhere: the person followed the link in the e-mail.
    adopt(token) {
      const info = mailer?.peek(token);
      if (!info) throw Error('Este link não é mais válido. Entre ou crie sua conta para receber um novo código.');
      resetGrant = null;
      challenge = {email:info.email, purpose:info.purpose, name:info.name, server:{token}, expiresAt:info.expiresAt, sentAt:now()-30000, attempts:0};
      return {email:info.email, purpose:info.purpose, expiresAt:info.expiresAt, resendAt:challenge.sentAt+30000};
    },
    async verify({code}) {
      if(!challenge) throw Error('Solicite um novo código.');
      if(now()>=challenge.expiresAt) throw Error('O código expirou. Solicite um novo código.');
      if(challenge.attempts>=5) throw Error('Limite de tentativas atingido. Solicite outro código.');
      challenge.attempts++;
      if(challenge.server) {
        if(!/^\d{6}$/.test(code)) throw Error('O código não confere. Verifique os seis números.');
        return complete(challenge, await mailer.verify({token:challenge.server.token, code}));
      }
      if(!/^\d{6}$/.test(code) || code!==challenge.code) throw Error('O código não confere. Verifique os seis números.');
      return complete(challenge, null);
    },
    async reset({password}) {
      checkPassword(password);
      if(!resetGrant || now()>=resetGrant.expiresAt) throw Error('Verifique um novo código para redefinir a senha.');
      let user=accounts.get(resetGrant.email);
      if(!user && resetGrant.verified) { user={name:resetGrant.email.split('@')[0], email:resetGrant.email, passwordHash:null}; accounts.set(user.email,user); }
      if(!user) throw Error('Não existe uma conta de teste nesta página. Comece por Criar conta.');
      user.passwordHash=await digest(password);resetGrant=null;return {ok:true};
    }
  };
}
export const auth = createDemoAuth({mailer:createMailer()});
export async function acceptSession(user) { return setSession(user); }
export function saveDemoOrder(order) {
  try {
    const existing=JSON.parse(sessionStorage.getItem(ORDERS_KEY)||'[]');
    const safe={id:order.id,method:order.method,total:order.amounts.total,createdAt:new Date().toISOString(),items:order.items.map(i=>({title:i.title,quantity:i.quantity,unitPrice:i.unitPrice})),demo:true};
    sessionStorage.setItem(ORDERS_KEY,JSON.stringify([safe,...(Array.isArray(existing)?existing:[])].slice(0,20)));
  } catch {}
}
export function readDemoOrders() { try { const value=JSON.parse(sessionStorage.getItem(ORDERS_KEY)||'[]');return Array.isArray(value)?value.filter(o=>o?.demo===true&&Array.isArray(o.items)):[]; } catch { return []; } }
