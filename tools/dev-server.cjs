#!/usr/bin/env node
'use strict';
// Local server: dist/ as the site root plus the /api functions, like Vercel serves them.
//   node tools/dev-server.cjs              → e-mails are written to a temp folder instead of being sent
//   node tools/dev-server.cjs --ask-key    → asks for the Resend key (hidden) and sends real e-mails
//   RESEND_API_KEY=... node tools/dev-server.cjs   → same, key taken from the environment
//   node tools/dev-server.cjs --fake-mp    → payments with a simulated Mercado Pago and a simulated Payment Brick (no credentials)
//   node tools/dev-server.cjs --ask-mp     → asks for the Mercado Pago TEST credentials (hidden) and talks to the real service
//   node tools/dev-server.cjs --fake-bling → NF-e through a simulated Bling (connect it in the panel, then conclude an order)
//   node tools/dev-server.cjs --fake-cep   → the address-by-CEP lookup answers from a simulator (a few CEPs) instead of ViaCEP / BrasilAPI
//   node tools/dev-server.cjs --fake-social → "Continuar com o Google / com a Apple" against a local simulator (tools/fake-oauth.cjs)
// Optional: MAIL_FROM, MAIL_REPLY_TO, ORDER_NOTIFY_EMAIL, PORT (default 8844), SITE_URL.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {createFakeMercadoPago} = require('./fake-mercadopago.cjs');
const {createFakeBling} = require('./fake-bling.cjs');

const PORT = Number(process.env.PORT) || 8844;
const ROOT = path.join(__dirname, '..', 'dist');
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.webp': 'image/webp'};

// Reads a secret without echoing it. Pasting works. Falls back to a plain line when stdin is not a terminal.
function askHidden(question) {
  return new Promise(resolve => {
    process.stdout.write(question);
    process.stdin.setEncoding('utf8');
    if (!process.stdin.isTTY) {
      let data = '';
      process.stdin.on('data', chunk => { data += chunk; if (/\r?\n/.test(data)) { process.stdin.pause(); resolve(data.split(/\r?\n/)[0].trim()); } });
      return;
    }
    let value = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const onData = chunk => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', onData); process.stdout.write('\n'); return resolve(value.trim()); }
        if (ch === '') { process.stdout.write('\n'); process.exit(130); }
        if (ch === '' || ch === '\b') { value = value.slice(0, -1); continue; }
        value += ch;
      }
    };
    process.stdin.on('data', onData);
  });
}

// vercel.json `headers` rules as {pattern, headers}. Sources here are plain "/prefix/(.*)" patterns, which are also valid
// regular expressions; tests/headers.mjs keeps it that way.
function readHeaderRules() {
  const file = path.join(__dirname, '..', 'vercel.json');
  if (!fs.existsSync(file)) return [];
  return (JSON.parse(fs.readFileSync(file, 'utf8')).headers || []).map(rule => ({
    pattern: new RegExp(`^${rule.source}$`),
    headers: rule.headers.filter(header => header.key.toLowerCase() !== 'cache-control')
  }));
}

async function main() {
  const env = {...process.env, SITE_URL: process.env.SITE_URL || `http://localhost:${PORT}`};
  if (process.argv.includes('--ask-key')) {
    console.log('\nTeste de e-mail com o Resend. A chave fica só na memória deste programa; nada é gravado.');
    env.RESEND_API_KEY = await askHidden('Cole a chave do Resend (começa com re_) e tecle Enter. Ela não aparece na tela: ');
    if (!env.RESEND_API_KEY) { console.error('Nenhuma chave informada. Encerrando.'); process.exit(1); }
    if (!env.RESEND_API_KEY.startsWith('re_')) console.warn('Aviso: chaves do Resend começam com "re_". Confira se copiou a chave inteira.');
    else console.log(`Chave recebida (${env.RESEND_API_KEY.length} caracteres).`);
  }
  const fakeMp = process.argv.includes('--fake-mp'), fakeCorreios = process.argv.includes('--fake-correios'), fakeCep = process.argv.includes('--fake-cep');
  // --fake-nfe: simulated NF-e service with example tax data (never in production), to see the whole invoice flow locally.
  if (process.argv.includes('--fake-nfe')) { env.NFE_PROVIDER = 'fake'; env.NFE_EXAMPLE_DATA = '1'; }
  // --fake-bling: the NF-e goes through a simulated Bling, with example tax data; its authorization page is local.
  const fakeBling = process.argv.includes('--fake-bling') ? createFakeBling() : null;
  // Google / Apple sign-in: with --fake-social, test credentials and a simulator of both providers on this server.
  let fakeSocial = null;
  if (process.argv.includes('--fake-social')) {
    const {createFakeOAuth, fakeCredentials} = require('./fake-oauth.cjs');
    Object.assign(env, fakeCredentials(`${env.SITE_URL}/__fake-oauth`));
    fakeSocial = createFakeOAuth({base: env.SOCIAL_FAKE_URL, env});
  }
  if (fakeBling) Object.assign(env, {NFE_PROVIDER: 'bling', NFE_EXAMPLE_DATA: '1', BLING_CLIENT_ID: fakeBling.clientId, BLING_CLIENT_SECRET: fakeBling.clientSecret, BLING_AUTHORIZE_URL: `http://localhost:${PORT}/__fake-bling/authorize`});
  if (process.argv.includes('--ask-mp')) {
    console.log('Teste de pagamentos com o Mercado Pago. Use as credenciais de TESTE. Nada é gravado; ficam só na memória deste programa.');
    env.MP_ACCESS_TOKEN = await askHidden('Cole o Access Token de teste e tecle Enter (não aparece na tela): ');
    env.MP_PUBLIC_KEY = await askHidden('Cole a Public Key de teste e tecle Enter: ');
    if (!env.MP_ACCESS_TOKEN || !env.MP_PUBLIC_KEY) { console.error('Faltou uma das chaves. Encerrando.'); process.exit(1); }
  }
  if (fakeMp) { env.MP_ACCESS_TOKEN = 'TEST-fake-access-token-local'; env.MP_PUBLIC_KEY = 'TEST-fake-public-key-local'; env.MP_WEBHOOK_SECRET = 'fake-webhook-secret-local'; env.ORDER_NOTIFY_EMAIL = env.ORDER_NOTIFY_EMAIL || 'ju@exemplo.test'; }
  env.AUTH_SECRET = env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');
  // The admin panel (dist/admin.html) always works locally, with a fixed local-only login unless you set your own.
  env.ADMIN_EMAIL = env.ADMIN_EMAIL || 'ju@exemplo.test';
  env.ADMIN_PASSWORD = env.ADMIN_PASSWORD || 'painel-local-123';
  if (!env.RESEND_API_KEY && !env.MAIL_TRANSPORT) env.MAIL_TRANSPORT = 'console';

  const outboxDir = path.join(os.tmpdir(), 'ju-mail-outbox');
  fs.mkdirSync(outboxDir, {recursive: true});
  let latest = null;
  const outbox = mail => {
    const id = `${Date.now()}-${mail.to.replace(/[^\w.@-]/g, '_')}`;
    fs.writeFileSync(path.join(outboxDir, id + '.html'), mail.html);
    latest = {id, to: mail.to, subject: mail.subject, purpose: mail.purpose, kind: mail.kind, reference: mail.reference, code: mail.code, url: mail.url, file: path.join(outboxDir, id + '.html')};
    if (mail.kind) { console.log(`[mail] pedido ${mail.reference} (${mail.kind}) para ${mail.to} · ${mail.subject} → ${latest.file}`); return; }
    console.log(`[mail] to ${mail.to} · ${mail.subject}\n       code ${mail.code}\n       ${mail.url}\n       ${latest.file}`);
  };
  // Logs what Resend answered (status and id or message) without ever printing the key.
  const loggedFetch = async (url, init) => {
    if (!String(url).startsWith('https://api.resend.com/')) return fetch(url, init);   // CEP lookups and the like pass through
    const response = await fetch(url, init);
    const info = await response.clone().json().catch(() => ({}));
    const to = JSON.parse(init.body).to?.[0] || '?';
    console.log(response.ok ? `[resend] enviado para ${to} (id ${info.id})` : `[resend] FALHOU ${response.status} para ${to}: ${info.message || info.name || 'sem detalhe'}`);
    return response;
  };

  // Accounts use the in-memory store here (no database locally): they last until the server stops. Codes go to the
  // terminal and to the outbox folder (or by Resend with --ask-key).
  // Calls to Mercado Pago go to the simulator with --fake-mp, otherwise to the real API (only the status is logged, never a body).
  const mpFetch = async (url, init) => { const response = await fetch(url, init); console.log(`[mp] ${init.method} ${String(url).replace('https://api.mercadopago.com', '')} → ${response.status}`); return response; };
  let fake = null;
  // Shipping: with --fake-correios the quote runs against a simulator and example shop data (NOT the real boxes).
  const {createFakeCorreios, EXAMPLE_CONFIG} = require('./fake-correios.cjs');
  const fakeCorreiosApi = fakeCorreios ? createFakeCorreios() : null;
  if (fakeCorreiosApi) Object.assign(env, fakeCorreiosApi.creds);
  // the example boxes, with the shop's own production time and free shipping, so the preview shows the same rule as the site
  const shopShipping = require('../api/_lib/shipping-config');
  const shippingConfig = fakeCorreiosApi ? {...EXAMPLE_CONFIG, production: shopShipping.production, freeShipping: shopShipping.freeShipping} : undefined;
  const toMp = (url, init) => String(url).startsWith('https://api.mercadopago.com') ? (fake ? fake.fetchImpl(url, init) : mpFetch(url, init)) : String(url).startsWith('https://api.correios.com.br') && fakeCorreiosApi ? fakeCorreiosApi.fetchImpl(url, init) : loggedFetch(url, init);
  const routed = (url, init) => fakeBling && /^https:\/\/(api|www)\.bling\.com\.br\//.test(String(url)) ? fakeBling.fetchImpl(url, init) : toMp(url, init);
  const routes = {
    '/api/auth/start': require('../api/auth/start').create({env, outbox, fetchImpl: loggedFetch}),
    '/api/health': require('../api/health').create({env}),
    '/api/email-preview': require('../api/email-preview').create({env}),
    '/api/payments/config': require('../api/payments/config').create({env}),
    '/api/payments/methods': require('../api/payments/methods').create({env, fetchImpl: routed}),
    '/api/payments/create': require('../api/payments/create').create({env, fetchImpl: routed, outbox, shippingConfig}),
    '/api/shipping/quote': require('../api/shipping/quote').create({env, fetchImpl: routed, shippingConfig}),
    '/api/contact/send': require('../api/contact/send').create({env, outbox, fetchImpl: loggedFetch}),
    '/api/fila/rodar': require('../api/fila/rodar').create({env, outbox, fetchImpl: routed}),
    '/api/cep/lookup': require('../api/cep/lookup').create({fetchImpl: fakeCep ? require('./fake-cep.cjs').createFakeCep().fetchImpl : loggedFetch}),
    '/api/payments/status': require('../api/payments/status').create({env, fetchImpl: routed, outbox}),
    '/api/payments/webhook': require('../api/payments/webhook').create({env, fetchImpl: routed, outbox}),
  };
  for (const name of ['login', 'verify', 'session', 'logout', 'orders', 'order-status', 'order-refund', 'order-document', 'order-invoice', 'bling', 'cash', 'international-quote']) routes[`/api/admin/${name}`] = require(`../api/admin/${name}`).create({env, outbox, fetchImpl: routed});
  for (const name of ['verify', 'register', 'login', 'reset', 'logout', 'me']) routes[`/api/auth/${name}`] = require(`../api/auth/${name}`).create({env});
  routes['/api/auth/providers'] = require('../api/auth/providers').create({env});
  for (const provider of ['google', 'apple']) {
    routes[`/api/auth/${provider}/start`] = require(`../api/auth/${provider}/start`).create({env});
    routes[`/api/auth/${provider}/callback`] = require(`../api/auth/${provider}/callback`).create({env, fetchImpl: fakeSocial ? fakeSocial.fetchImpl : loggedFetch});
  }
  for (const name of ['profile', 'orders', 'delete-start', 'delete']) routes[`/api/account/${name}`] = require(`../api/account/${name}`).create({env, outbox, fetchImpl: loggedFetch});
  // the delivery timeline asks the Correios (the simulator with --fake-correios)
  routes['/api/account/tracking'] = require('../api/account/tracking').create({env, outbox, fetchImpl: routed});
  // The NF-e queue, as on the Node server, on the same in-memory store; a round every 15 seconds to see it move.
  require('../api/_lib/invoice-queue').startWorker({env, outbox, fetchImpl: routed, intervalMs: 15000});
  require('../api/_lib/tracking').startTrackingWorker({env, outbox, fetchImpl: routed, intervalMs: 60000});

  // Same security headers as production (vercel.json), so a Content-Security-Policy problem shows up locally too.
  // Cache-Control is left out on purpose: local files stay `no-store` while editing.
  const headerRules = readHeaderRules();
  if (fakeMp) {
    // When the simulated customer "pays" a Pix, deliver a properly signed notification to our own webhook, like Mercado Pago would.
    fake = createFakeMercadoPago({onPaid: async id => {
      const ts = String(Date.now()), requestId = crypto.randomUUID(), sign = crypto.createHmac('sha256', env.MP_WEBHOOK_SECRET).update(`id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`).digest('hex');
      const res = {statusCode: 200, setHeader() {}, end() {}};
      await routes['/api/payments/webhook']({method: 'POST', url: `/api/payments/webhook?data.id=${id}&type=order`, headers: {'x-signature': `ts=${ts},v1=${sign}`, 'x-request-id': requestId}, body: {type: 'order', data: {id}}, socket: {}}, res);
      console.log(`[mp] pagamento simulado de ${id} → o webhook respondeu ${res.statusCode}`);
    }});
  }

  http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    for (const rule of headerRules) if (rule.pattern.test(url.pathname)) for (const {key, value} of rule.headers) res.setHeader(key, value);
    try {
      if (routes[url.pathname]) return await routes[url.pathname](req, res);
      if (fake && url.pathname === '/__fake-mp/sdk.js') { res.setHeader('Content-Type', TYPES['.js']); return res.end(fs.readFileSync(path.join(__dirname, 'fake-brick.js'))); }
      if (fake && url.pathname === '/__fake-mp/pay') { const ok = await fake.pay(url.searchParams.get('id') || ''); res.statusCode = ok ? 200 : 404; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({paid: ok})); }
      // The simulated Bling "allows" at once and sends the browser back to the panel with a code, like the real page.
      if (fakeBling && url.pathname === '/__fake-bling/authorize') {
        const allowed = fakeBling.authorize(url.href);
        res.statusCode = allowed ? 302 : 400;
        if (allowed) res.setHeader('Location', `${env.SITE_URL}/admin.html?code=${encodeURIComponent(allowed.code)}&state=${encodeURIComponent(allowed.state || '')}`);
        return res.end();
      }
      // "Fixes" a rejected note in the simulated Bling, as the person would on Bling's screen, to try the panel's retry.
      if (fakeBling && url.pathname === '/__fake-bling/corrigir') { const ok = fakeBling.correct(url.searchParams.get('id') || ''); res.statusCode = ok ? 200 : 404; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({corrigida: ok})); }
      // Puts the simulated Bling down (or back): ?modo=rede|lento|erro|limite|queda|gateway|corpo, or nothing for normal;
      // &vezes=N for the next N calls only; &so=POST%20/nfe for those calls only. Shows the queue and the panel's notice.
      if (fakeSocial && url.pathname.startsWith('/__fake-oauth/') && await fakeSocial.handle(req, res, url)) return;
      if (fakeBling && url.pathname === '/__fake-bling/falha') {
        const mode = url.searchParams.get('modo') || null, times = Number(url.searchParams.get('vezes')) || null;
        if (mode && !['rede', 'lento', 'erro', 'limite', 'queda', 'gateway', 'corpo'].includes(mode)) { res.statusCode = 400; return res.end('modo: rede, lento, erro, limite, queda, gateway ou corpo'); }
        fakeBling.fail(mode, {count: times, match: url.searchParams.get('so') || null});
        console.log(`[bling] simulado: ${mode ? `falha "${mode}"${times ? ` nas próximas ${times} chamadas` : ''}` : 'normal'}`);
        res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({modo: mode || 'normal', vezes: times}));
      }
      if (url.pathname === '/__outbox/latest') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(latest)); }
      let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
      if (!file.startsWith(ROOT)) { res.statusCode = 403; return res.end('Forbidden'); }
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) {
        // Like the real server: a missing page gets the site's 404 page, a missing file a short answer.
        res.statusCode = 404; res.setHeader('Cache-Control', 'no-store');
        if (/(^|\/)[^./]*$|\.html?$/i.test(url.pathname)) { res.setHeader('Content-Type', TYPES['.html']); return res.end(fs.readFileSync(path.join(ROOT, '404.html'))); }
        return res.end('Not found');
      }
      res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      // With --fake-mp the checkout pages load the simulated Payment Brick instead of the real SDK.
      if (fake && /^(checkout|comprar-agora)/.test(path.basename(file)) && file.endsWith('.html')) return res.end(fs.readFileSync(file, 'utf8').replace('</head>', "<script src='/__fake-mp/sdk.js'></script></head>"));
      fs.createReadStream(file).pipe(res);
    } catch (error) {
      console.error(error);
      res.statusCode = 500; res.end('Internal error');
    }
  }).listen(PORT, () => {
    const real = env.MAIL_TRANSPORT !== 'console';
    console.log(`Pagamentos: ${fakeMp ? `SIMULADOS (Mercado Pago e Brick de mentira). Para "pagar" um Pix aberto: http://localhost:${PORT}/__fake-mp/pay?id=<código do pedido>` : env.MP_ACCESS_TOKEN ? 'Mercado Pago de TESTE (credenciais informadas)' : 'desligados (o checkout usa a demonstração)'}`);
    console.log(`Painel da Ju: http://localhost:${PORT}/admin.html  (e-mail ${env.ADMIN_EMAIL} · senha ${env.ADMIN_PASSWORD})`);
    const socialOn = require('../api/_lib/social').enabled(env);
    console.log(`Entrar com Google / Apple: ${fakeSocial ? 'SIMULADOS (tela de teste em /__fake-oauth)' : [socialOn.google && 'Google', socialOn.apple && 'Apple'].filter(Boolean).join(' e ') || 'desligados (sem credenciais)'}`);
    console.log(`\nSite + API em http://localhost:${PORT}  (e-mails: ${real ? 'enviados de verdade pelo Resend' : 'gravados em ' + outboxDir})`);
    if (real) console.log(`Abra http://localhost:${PORT}/conta.html, crie uma conta e use o MESMO e-mail da sua conta do Resend.\nSem domínio verificado, o Resend só entrega para esse e-mail. Cada disparo aparece aqui embaixo.\nParar: Ctrl+C.\n`);
  });
}
main();
