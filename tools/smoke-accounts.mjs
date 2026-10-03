#!/usr/bin/env node
// Checks the account flow on a running TEST site, end to end over HTTP: health, sign-up by code, session cookie,
// identification with a random valid CPF, sign-out and password sign-in. Useful right after configuring the database.
//   node tools/smoke-accounts.mjs https://wheat-llama-936569.hostingersite.com
// Works only while the site is in test mode without e-mail (APP_ENV=preview, no RESEND_API_KEY): the code comes back
// in the answer. It creates one account named "Teste automático" with an address @exemplo.com each run.
import crypto from 'node:crypto';

const base = String(process.argv[2] || '').replace(/\/+$/, '');
if (!/^https?:\/\/[^/]+$/.test(base)) { console.error('Uso: node tools/smoke-accounts.mjs https://endereco-do-site'); process.exit(1); }

let cookie = '', failed = false;
async function call(method, path, body) {
  const response = await fetch(base + path, {method, headers: {Origin: base, ...(cookie ? {Cookie: cookie} : {}), ...(body ? {'Content-Type': 'application/json'} : {})}, body: body ? JSON.stringify(body) : undefined, redirect: 'manual'});
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = /Max-Age=0/.test(setCookie) ? '' : setCookie.split(';')[0];
  let data = null;
  try { data = await response.json(); } catch {}
  return {status: response.status, data: data || {}};
}
function check(label, ok, detail = '') {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed = true;
  return ok;
}
// A valid CPF with random digits, so each run can save its identification.
function randomCpf() {
  const d = Array.from({length: 9}, () => crypto.randomInt(0, 10));
  for (const length of [9, 10]) { let sum = 0; for (let i = 0; i < length; i++) sum += d[i] * (length + 1 - i); d.push((sum * 10) % 11 % 10); }
  return d.join('');
}

const health = await call('GET', '/api/health');
check('site responde /api/health', health.status === 200 && health.data.ok === true, `contas: ${health.data.accounts}, banco: ${health.data.db}, chaves: ${health.data.dataKeys}`);
check('contas gravam no MySQL', health.data.accounts === 'mysql' && health.data.db === 'ok', health.data.accounts === 'memory' ? 'ainda em memória: confira DB_HOST, DB_NAME, DB_USER, DB_PASSWORD' : '');

const email = `teste-${Date.now()}@exemplo.com`, password = `Teste-${crypto.randomBytes(6).toString('hex')}`;
const started = await call('POST', '/api/auth/start', {email, purpose: 'access', lang: 'pt-BR'});
if (!check('código gerado', started.status === 200 && /^\d{6}$/.test(started.data.demoCode || ''), started.data.demoCode ? '' : `resposta ${started.status} ${started.data.error || ''} (o teste precisa do modo sem e-mail)`)) process.exit(1);
const verified = await call('POST', '/api/auth/verify', {challenge: started.data.challenge, code: started.data.demoCode});
check('código confirmado, e-mail novo', verified.data.status === 'needs_profile');
const created = await call('POST', '/api/auth/register', {grant: verified.data.grant, name: 'Teste automático', password});
check('conta criada com sessão em cookie', created.status === 201 && cookie.startsWith('__Host-ju_session='));
const me = await call('GET', '/api/auth/me');
check('servidor reconhece a sessão', me.data.user?.email === email);
const saved = await call('PUT', '/api/account/profile', {firstName: 'Teste', lastName: 'Automático', cpf: randomCpf(), phone: '11987654321'});
check('identificação salva (CPF criptografado)', saved.status === 200 && /^\*\*\*\.\d{3}\.\d{3}-\*\*$/.test(saved.data.profile?.cpf?.masked || ''), saved.data.error || '');
await call('POST', '/api/auth/logout', {});
check('saída encerra a sessão', (await call('GET', '/api/auth/me')).data.user === null);
const login = await call('POST', '/api/auth/login', {email, password});
check('entrada com senha', login.status === 200 && login.data.user?.email === email);
check('senha errada é recusada', (await call('POST', '/api/auth/login', {email, password: 'errada-000'})).data.error === 'invalid_credentials');
await call('POST', '/api/auth/logout', {});

console.log(failed ? '\nAlgo falhou. Veja as linhas FALHA acima e os logs de execução do app.' : `\nTudo certo. Conta de teste criada: ${email}`);
process.exit(failed ? 1 : 0);
