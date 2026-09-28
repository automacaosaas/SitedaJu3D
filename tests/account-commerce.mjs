// Cart and demo orders (dist/cart-store.js), then the browser account adapter (dist/auth-service.js) wired to the real
// /api handlers in-process: memory store, cookie jar and a fixed clock. No network.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const modules = {};
for (const file of ['products.js','commerce-config.js','cart-store.js','auth-service.js']) {
  let source = await readFile(new URL('../dist/'+file,import.meta.url),'utf8');
  for (const [name,url] of Object.entries(modules)) source=source.replaceAll(`'./${name}'`,JSON.stringify(url));
  modules[file]='data:text/javascript;base64,'+Buffer.from(source).toString('base64');
}
const {putItem,selectedItems,removePurchased,totals} = await import(modules['cart-store.js']);
const {createClient,saveDemoOrder,readDemoOrders} = await import(modules['auth-service.js']);
const values = new Map();
globalThis.sessionStorage = {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};

let cart=putItem([],'borboletoscopio',{body:'pink',details:'yellow'});
cart=putItem(cart,'aviaoscopia',{body:'blue',details:'red',engines:'yellow'});
const selected=new Set([cart[0].id]);
const chosen=selectedItems(cart,selected);
assert.equal(chosen.length,1); assert.equal(totals(chosen).total,14700);
assert.equal(selectedItems(cart,new Set()).length,0);
assert.deepEqual(removePurchased(cart,chosen),[cart[1]],'unselected products survive checkout');
assert.equal(removePurchased([{...cart[0],quantity:3}],chosen)[0].quantity,2,'extra units added during payment survive');
const changed={...cart[0],selection:{body:'mint',details:'yellow'}};
assert.deepEqual(removePurchased([changed],chosen),[changed],'changed colors are not removed by an old order');
assert.equal(cart.length,2,'filtering and reconciliation do not mutate the cart');
saveDemoOrder({id:'DEMO-TEST',method:'card',items:chosen,amounts:totals(chosen),email:'not-saved@example.com'});
assert.equal(readDemoOrders()[0].total,14700,'order history includes delivery');
assert.equal(JSON.stringify(readDemoOrders()).includes('not-saved@example.com'),false,'delivery PII is not saved');

// ── The account adapter against the real API ──────────────────────────────────────────────────────────────────
const require = createRequire(import.meta.url);
const {createMemoryStore} = require('../api/_lib/store-memory.js');
const store = createMemoryStore(), env = {APP_ENV: 'preview', SITE_URL: 'https://site.test'};
let clock = Date.parse('2026-09-28T12:00:00Z');
const routes = {};
for (const name of ['start', 'verify', 'register', 'login', 'reset', 'logout', 'me']) routes[`/api/auth/${name}`] = require(`../api/auth/${name}.js`).create({env, store, now: () => clock});
routes['/api/account/profile'] = require('../api/account/profile.js').create({env, store, now: () => clock});
let jar = '';
const requests = [];
const fetchImpl = async (url, init = {}) => {
  requests.push({url, method: init.method || 'GET', credentials: init.credentials});
  const handler = routes[url];
  if (!handler) return {ok: false, status: 404, json: async () => ({})};
  const res = {statusCode: 200, headers: {}, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(d) { this.body = d || ''; }};
  await handler({method: init.method || 'GET', url, headers: {origin: 'https://site.test', ...(jar ? {cookie: jar} : {})}, body: init.body ? JSON.parse(init.body) : undefined, socket: {}}, res);
  const cookie = res.headers['set-cookie'];
  if (cookie) jar = /Max-Age=0/.test(cookie) ? '' : cookie.split(';')[0];
  return {ok: res.statusCode < 300, status: res.statusCode, json: async () => JSON.parse(res.body || '{}')};
};
const client = createClient({fetchImpl, language: () => 'pt-BR'});
const {auth} = client;
const person = {name: 'Teste local', email: ' TESTE@example.com ', password: 'Ficticia-123'};
const other = code => code === '000000' ? '111111' : '000000';

// Sign-up: e-mail → code → name and password. The code comes back only because the test site has no e-mail service.
await assert.rejects(auth.completeRegistration(person), /Confirme seu e-mail/, 'no sign-up before the code');
let step = await auth.begin({email: person.email});
assert.equal(step.email, 'teste@example.com');
assert.equal(step.purpose, 'access');
assert.match(step.demoCode, /^\d{6}$/);
assert.equal(requests.at(-1).credentials, 'same-origin', 'the session cookie travels with every call');
await assert.rejects(auth.verify({code: other(step.demoCode)}), /O código não confere/);
await assert.rejects(auth.resend(), /Muitas tentativas/, 'a new code only after 30 seconds');
clock += 30_000;
const oldCode = step.demoCode;
step = await auth.resend();
if (step.demoCode !== oldCode) await assert.rejects(auth.verify({code: oldCode}), /O código não confere/, 'the old code is replaced');
assert.deepEqual(await auth.verify({code: step.demoCode}), {registrationAllowed: true});
assert.equal(client.getSession(), null, 'no session before the sign-up is finished');
const user = await auth.completeRegistration({...person, marketingOptIn: false});
assert.deepEqual(user, {name: 'Teste local', email: 'teste@example.com', marketingOptIn: false, hasPassword: true, profileComplete: false});
assert.deepEqual(client.getSession(), user, 'the header copy of the session');
assert.match(jar, /^__Host-ju_session=[\w-]{43}$/, 'the session itself is an HttpOnly cookie');
assert.equal(JSON.stringify([...values.values()]).includes(person.password), false, 'passwords never reach sessionStorage');
assert.equal(JSON.stringify([...values.values()]).includes(jar.split('=')[1]), false, 'nor the session token');
await assert.rejects(auth.completeRegistration(person), /Confirme seu e-mail/, 'a grant is used once');

// Session: the server is the source of truth.
assert.equal((await client.refreshSession()).email, 'teste@example.com');
await client.signOut();
assert.equal(client.getSession(), null);
assert.equal(jar, '', 'sign-out clears the cookie');
assert.equal(await client.refreshSession(), null);
assert.equal((await auth.login(person)).email, 'teste@example.com', 'password sign-in');
await assert.rejects(auth.login({...person, password: 'errada-123'}), /E-mail ou senha não conferem/);
await assert.rejects(auth.login({email: 'ninguem@example.com', password: 'Ficticia-123'}), /E-mail ou senha não conferem/, 'unknown address looks the same');

// Existing address: same first step, signed in by the code; a used code is forgotten.
clock += 30_000;
step = await auth.begin({email: person.email});
assert.equal(step.purpose, 'access', 'existing and new addresses start the same way');
assert.equal((await auth.verify({code: step.demoCode})).user.email, 'teste@example.com');
await assert.rejects(auth.verify({code: step.demoCode}), /Solicite um novo código/);

// Forgot password: five wrong codes lock it, codes expire, a fresh one allows a reset that signs in.
clock += 30_000;
step = await auth.forgot({email: person.email});
for (let i = 0; i < 4; i++) await assert.rejects(auth.verify({code: other(step.demoCode)}), /O código não confere/);
await assert.rejects(auth.verify({code: other(step.demoCode)}), /Limite de tentativas/);
await assert.rejects(auth.verify({code: step.demoCode}), /Limite de tentativas/);
clock += 30_000;
step = await auth.resend();
clock += 600_001;
await assert.rejects(auth.verify({code: step.demoCode}), /O código expirou/);
step = await auth.resend();
assert.deepEqual(await auth.verify({code: step.demoCode}), {resetAllowed: true});
await assert.rejects(auth.reset({password: 'curta'}), /8 a 128 caracteres/);
assert.equal((await auth.reset({password: 'Nova-Senha-456'})).email, 'teste@example.com');
await assert.rejects(auth.login(person), /E-mail ou senha não conferem/, 'old password is gone');
assert.ok(await auth.login({email: person.email, password: 'Nova-Senha-456'}));

// Cancel drops the pending grant; the 30-second interval still applies.
clock += 30_000;
step = await auth.begin({email: 'cancelado@example.com'});
await auth.verify({code: step.demoCode});
auth.cancel();
await assert.rejects(auth.completeRegistration(person), /Confirme seu e-mail/);
await assert.rejects(auth.begin({email: 'cancelado@example.com'}), /Muitas tentativas/, 'cancel cannot bypass the interval');

// The e-mail link: its reference is adopted; a broken link is refused.
const adopted = auth.adopt(`0f4e1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b.${Buffer.from('link@example.com').toString('base64url')}`);
assert.equal(adopted.email, 'link@example.com');
assert.throws(() => auth.adopt('quebrado'), /link não é mais válido/);

// Identification ("Meus dados" and the checkout): masked CPF back, field errors in Portuguese.
await assert.rejects(client.saveProfile({firstName: 'Teste', lastName: 'Local', phone: '11987654321', cpf: '52998224726'}), /Confira o CPF/);
const saved = await client.saveProfile({firstName: 'Teste', lastName: 'Local', phone: '11987654321', cpf: '529.982.247-25', company: null, marketingOptIn: true});
assert.equal(saved.cpf.masked, '***.982.247-**');
assert.equal(saved.phone, '(11) 98765-4321');
assert.equal(client.getSession().profileComplete, true);
assert.equal((await client.loadProfile()).firstName, 'Teste');
assert.equal(JSON.stringify([...values.values()]).includes('52998224725'), false, 'the CPF never goes to browser storage');
await client.signOut();
await assert.rejects(client.loadProfile(), /Sua sessão terminou/);

// Network down: a clear message; the last known state is kept.
const offline = createClient({fetchImpl: async () => { throw new TypeError('Failed to fetch'); }});
await assert.rejects(offline.auth.begin({email: 'a@b.co'}), /Sem conexão/);
assert.equal(await offline.refreshSession(), null);

console.log('PASS: cart and demo orders; account adapter against the real API — e-mail-first sign-up, 30 s interval, one-use codes and grants, 5 attempts, 10-minute expiry, reset, password sign-in, HttpOnly session (no token, password or CPF in browser storage), identification, cancel and offline.');
