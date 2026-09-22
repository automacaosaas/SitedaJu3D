#!/usr/bin/env node
'use strict';
// Local server: dist/ as the site root plus the /api functions, like Vercel serves them.
//   node tools/dev-server.cjs              → e-mails are written to a temp folder instead of being sent
//   node tools/dev-server.cjs --ask-key    → asks for the Resend key (hidden) and sends real e-mails
//   RESEND_API_KEY=... node tools/dev-server.cjs   → same, key taken from the environment
//   node tools/dev-server.cjs --fake-mp    → payments with a simulated Mercado Pago and a simulated Payment Brick (no credentials)
//   node tools/dev-server.cjs --ask-mp     → asks for the Mercado Pago TEST credentials (hidden) and talks to the real service
// Optional: MAIL_FROM, MAIL_REPLY_TO, ORDER_NOTIFY_EMAIL, PORT (default 8844), SITE_URL.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {createFakeMercadoPago} = require('./fake-mercadopago.cjs');

const PORT = Number(process.env.PORT) || 8844;
const ROOT = path.join(__dirname, '..', 'dist');
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.woff2': 'font/woff2'};

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

async function main() {
  const env = {...process.env, SITE_URL: process.env.SITE_URL || `http://localhost:${PORT}`};
  if (process.argv.includes('--ask-key')) {
    console.log('\nTeste de e-mail com o Resend. A chave fica só na memória deste programa; nada é gravado.');
    env.RESEND_API_KEY = await askHidden('Cole a chave do Resend (começa com re_) e tecle Enter. Ela não aparece na tela: ');
    if (!env.RESEND_API_KEY) { console.error('Nenhuma chave informada. Encerrando.'); process.exit(1); }
    if (!env.RESEND_API_KEY.startsWith('re_')) console.warn('Aviso: chaves do Resend começam com "re_". Confira se copiou a chave inteira.');
    else console.log(`Chave recebida (${env.RESEND_API_KEY.length} caracteres).`);
  }
  const fakeMp = process.argv.includes('--fake-mp');
  if (process.argv.includes('--ask-mp')) {
    console.log('Teste de pagamentos com o Mercado Pago. Use as credenciais de TESTE. Nada é gravado; ficam só na memória deste programa.');
    env.MP_ACCESS_TOKEN = await askHidden('Cole o Access Token de teste e tecle Enter (não aparece na tela): ');
    env.MP_PUBLIC_KEY = await askHidden('Cole a Public Key de teste e tecle Enter: ');
    if (!env.MP_ACCESS_TOKEN || !env.MP_PUBLIC_KEY) { console.error('Faltou uma das chaves. Encerrando.'); process.exit(1); }
  }
  if (fakeMp) { env.MP_ACCESS_TOKEN = 'TEST-fake-access-token-local'; env.MP_PUBLIC_KEY = 'TEST-fake-public-key-local'; env.MP_WEBHOOK_SECRET = 'fake-webhook-secret-local'; env.ORDER_NOTIFY_EMAIL = env.ORDER_NOTIFY_EMAIL || 'ju@exemplo.test'; }
  env.AUTH_SECRET = env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');
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
    const response = await fetch(url, init);
    const info = await response.clone().json().catch(() => ({}));
    const to = JSON.parse(init.body).to?.[0] || '?';
    console.log(response.ok ? `[resend] enviado para ${to} (id ${info.id})` : `[resend] FALHOU ${response.status} para ${to}: ${info.message || info.name || 'sem detalhe'}`);
    return response;
  };

  // Calls to Mercado Pago go to the simulator with --fake-mp, otherwise to the real API (only the status is logged, never a body).
  const mpFetch = async (url, init) => { const response = await fetch(url, init); console.log(`[mp] ${init.method} ${String(url).replace('https://api.mercadopago.com', '')} → ${response.status}`); return response; };
  let fake = null;
  const routed = (url, init) => String(url).startsWith('https://api.mercadopago.com') ? (fake ? fake.fetchImpl(url, init) : mpFetch(url, init)) : loggedFetch(url, init);
  const routes = {
    '/api/auth/send-code': require('../api/auth/send-code').create({env, outbox, fetchImpl: loggedFetch}),
    '/api/auth/verify-code': require('../api/auth/verify-code').create({env}),
    '/api/health': require('../api/health').create({env}),
    '/api/email-preview': require('../api/email-preview').create({env}),
    '/api/payments/config': require('../api/payments/config').create({env}),
    '/api/payments/create': require('../api/payments/create').create({env, fetchImpl: routed}),
    '/api/payments/status': require('../api/payments/status').create({env, fetchImpl: routed}),
    '/api/payments/webhook': require('../api/payments/webhook').create({env, fetchImpl: routed, outbox})
  };
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
    try {
      if (routes[url.pathname]) return await routes[url.pathname](req, res);
      if (fake && url.pathname === '/__fake-mp/sdk.js') { res.setHeader('Content-Type', TYPES['.js']); return res.end(fs.readFileSync(path.join(__dirname, 'fake-brick.js'))); }
      if (fake && url.pathname === '/__fake-mp/pay') { const ok = await fake.pay(url.searchParams.get('id') || ''); res.statusCode = ok ? 200 : 404; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({paid: ok})); }
      if (url.pathname === '/__outbox/latest') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(latest)); }
      let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
      if (!file.startsWith(ROOT)) { res.statusCode = 403; return res.end('Forbidden'); }
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('Not found'); }
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
    console.log(`\nSite + API em http://localhost:${PORT}  (e-mails: ${real ? 'enviados de verdade pelo Resend' : 'gravados em ' + outboxDir})`);
    if (real) console.log(`Abra http://localhost:${PORT}/conta.html, crie uma conta e use o MESMO e-mail da sua conta do Resend.\nSem domínio verificado, o Resend só entrega para esse e-mail. Cada disparo aparece aqui embaixo.\nParar: Ctrl+C.\n`);
  });
}
main();
