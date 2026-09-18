// UI adapter only. The demo is NOT authentication and grants no server access.
// Replace this adapter with the future backend; see AUTH-INTEGRATION.md.
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

export function createDemoAuth({now = () => Date.now(), makeCode = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6,'0')} = {}) {
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
  return {
    async register({name,email,password}) {
      email=normalize(email); name=String(name||'').trim();
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error('Preencha seu nome e um e-mail válido.');
      checkPassword(password);
      if(accounts.has(email)) throw Error('Este e-mail já foi cadastrado nesta prévia. Entre na sua conta.');
      return issue(email,'signup',{name,email,passwordHash:await digest(password)});
    },
    async login({email,password}) {
      const account=accounts.get(normalize(email));
      if (!account || account.passwordHash !== await digest(password)) throw Error('E-mail ou senha não conferem nesta prévia. Crie uma conta de teste nesta página.');
      return publicUser(account);
    },
    async forgot({email}) {
      email=normalize(email);
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error('Informe um e-mail válido.');
      return issue(email,'reset');
    },
    async resend() {
      if(!challenge) throw Error('Solicite um novo código.');
      return issue(challenge.email,challenge.purpose,challenge.pending);
    },
    async verify({code}) {
      if(!challenge) throw Error('Solicite um novo código.');
      if(now()>=challenge.expiresAt) throw Error('O código expirou. Solicite um novo código.');
      if(challenge.attempts>=5) throw Error('Limite de tentativas atingido. Solicite outro código.');
      challenge.attempts++;
      if(!/^\d{6}$/.test(code) || code!==challenge.code) throw Error('O código não confere. Verifique os seis números.');
      const valid=challenge; challenge=null;
      if(valid.purpose==='signup') {accounts.set(valid.email,valid.pending);return {user:publicUser(valid.pending)};}
      resetGrant={email:valid.email,expiresAt:now()+600000};
      return {resetAllowed:true};
    },
    async reset({password}) {
      checkPassword(password);
      if(!resetGrant || now()>=resetGrant.expiresAt) throw Error('Verifique um novo código para redefinir a senha.');
      const user=accounts.get(resetGrant.email);
      if(!user) throw Error('Não existe uma conta de teste nesta página. Comece por Criar conta.');
      user.passwordHash=await digest(password);resetGrant=null;return {ok:true};
    }
  };
}
export const auth = createDemoAuth();
export async function acceptSession(user) { return setSession(user); }
export function saveDemoOrder(order) {
  try {
    const existing=JSON.parse(sessionStorage.getItem(ORDERS_KEY)||'[]');
    const safe={id:order.id,method:order.method,total:order.amounts.total,createdAt:new Date().toISOString(),items:order.items.map(i=>({title:i.title,quantity:i.quantity,unitPrice:i.unitPrice})),demo:true};
    sessionStorage.setItem(ORDERS_KEY,JSON.stringify([safe,...(Array.isArray(existing)?existing:[])].slice(0,20)));
  } catch {}
}
export function readDemoOrders() { try { const value=JSON.parse(sessionStorage.getItem(ORDERS_KEY)||'[]');return Array.isArray(value)?value.filter(o=>o?.demo===true&&Array.isArray(o.items)):[]; } catch { return []; } }
