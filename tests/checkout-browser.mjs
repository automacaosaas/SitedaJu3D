// The checkout's payment step in a real browser (2026-10-08, review: the old checks of checkout.js only compared its source with
// regular expressions). The local server with the simulated Mercado Pago, Correios and CEP (tools/dev-server.cjs --fake-mp
// --fake-correios --fake-cep --sem-juros=3) and Chrome without a window, driven over the DevTools protocol (no dependencies):
// each scenario is a buyer with a new account going through "comprar agora", and the page's own code answering.
//   - the Pix paid while it waits: the steps close, no button wakes up, the focus waits on the steps, then the confirmation;
//   - "← Voltar" when Mercado Pago does not confirm the cancel: the focus stays on it and the reason is said; then it works;
//   - the code runs out: the focus on "Gerar novo código Pix";
//   - a card in review that comes back refused: the notice with the reason; closed, the reminder in sight beside the form;
//   - the notice: selecting its words and letting go outside keeps it open, a whole click outside closes it;
//   - a Pix refused when it is created: its own line, never the card's notice;
//   - a reload with a Pix waiting: the choice (go on with it, or cancel it first), never a second payable code;
//   - /api/payments/config slow: asked again ("Carregando o pagamento…"), never the demo.
// Run: node tests/checkout-browser.mjs — needs Google Chrome or Chromium (CHROME_PATH points at one). Without one (the own
// server's deploy) the suite says so and is skipped; CHECKOUT_BROWSER=0 skips it too. About a minute.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const CHROMES = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'];
const chrome = process.env.CHECKOUT_BROWSER === '0' ? null : CHROMES.find(file => file && fs.existsSync(file));
if (!chrome) { console.log('PULADA: checkout no navegador — nenhum Chrome/Chromium encontrado (CHROME_PATH aponta um) ou CHECKOUT_BROWSER=0.'); process.exit(0); }

const freePort = () => new Promise((resolve, reject) => { const probe = net.createServer(); probe.on('error', reject); probe.listen(0, '127.0.0.1', () => { const {port} = probe.address(); probe.close(() => resolve(port)); }); });
const until = async (check, timeout = 10000, what = 'condition') => { const start = Date.now(); for (;;) { try { const value = await check(); if (value) return value; } catch {} if (Date.now() - start > timeout) throw new Error(`timed out waiting for ${what}`); await sleep(80); } };

// ── the local server (its own port; e-mails only to its outbox, never sent) ──
const port = await freePort(), BASE = `http://localhost:${port}/`;
const server = spawn(process.execPath, ['tools/dev-server.cjs', '--fake-mp', '--fake-correios', '--fake-cep', '--sem-juros=3'], {cwd: root, env: {...process.env, PORT: String(port), RESEND_API_KEY: '', MAIL_TRANSPORT: 'console', SITE_URL: BASE.slice(0, -1)}, stdio: ['ignore', 'pipe', 'pipe']});
let serverLog = '';
server.stdout.on('data', d => { serverLog += d; }); server.stderr.on('data', d => { serverLog += d; });
// ── Chrome without a window, a profile of its own ──
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ju-checkout-browser-'));
const browser = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', '--disable-features=Translate', ...(process.platform === 'linux' ? ['--no-sandbox'] : []), 'about:blank'], {stdio: 'ignore'});
let socket;
const stop = async () => { try { socket?.close(); } catch {} browser.kill(); server.kill(); await sleep(400); try { fs.rmSync(profile, {recursive: true, force: true}); } catch {} };

try {
  await until(() => /Site \+ API em/.test(serverLog), 20000, 'the local server');
  const devtools = await until(() => fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim(), 20000, 'Chrome');
  const page = await until(async () => (await (await fetch(`http://127.0.0.1:${devtools}/json/list`)).json()).find(t => t.type === 'page'), 10000, 'a page');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });

  // ── a small DevTools client ──
  let serial = 0;
  const pending = new Map(), listeners = new Map(), errors = [];
  socket.onmessage = ({data}) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) { const {resolve, reject} = pending.get(message.id); pending.delete(message.id); return message.error ? reject(new Error(message.error.message)) : resolve(message.result); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    (listeners.get(message.method) || []).forEach(fn => fn(message.params));
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++serial; pending.set(id, {resolve, reject}); socket.send(JSON.stringify({id, method, params})); });
  const on = (method, fn) => listeners.set(method, [...(listeners.get(method) || []), fn]);
  const once = method => new Promise(resolve => { const fn = params => { listeners.set(method, listeners.get(method).filter(f => f !== fn)); resolve(params); }; on(method, fn); });
  const js = async expression => { const r = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true}); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const goto = async url => { await send('Page.navigate', {url: 'about:blank'}); await sleep(50); const loaded = Promise.race([once('Page.loadEventFired'), sleep(15000)]); await send('Page.navigate', {url}); await loaded; };
  const viewport = (width, height) => send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: width < 700});
  const VK = {Enter: 13, Escape: 27, Tab: 9};
  const press = async key => { const text = key === 'Enter' ? '\r' : undefined; await send('Input.dispatchKeyEvent', {type: text ? 'keyDown' : 'rawKeyDown', key, code: key, windowsVirtualKeyCode: VK[key], text}); await send('Input.dispatchKeyEvent', {type: 'keyUp', key, code: key, windowsVirtualKeyCode: VK[key]}); };
  const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', {type, x, y, button: 'left', clickCount: 1, ...extra});
  const click = async selector => { const at = await js(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.scrollIntoView({block: 'center'}); const r = e.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2}; })()`); await mouse('mouseMoved', at.x, at.y, {button: 'none'}); await mouse('mousePressed', at.x, at.y); await mouse('mouseReleased', at.x, at.y); };
  const focusOn = selector => js(`document.querySelector(${JSON.stringify(selector)}).focus()`);
  const focused = () => js(`(() => { const a = document.activeElement; return a ? a.tagName.toLowerCase() + (a.dataset?.action ? '[' + a.dataset.action + ']' : '') + (a.id ? '#' + a.id : '') + (a.classList.length ? '.' + a.classList[0] : '') : ''; })()`);
  const said = () => js(`document.querySelector('#shop-live').textContent`);
  // answers chosen API calls in this browser only (CDP Fetch); a scenario sets `answer`, returning {status, body}, {hold: ms} or nothing
  let answer = null;
  await send('Fetch.enable', {patterns: [{urlPattern: '*/api/payments/*', requestStage: 'Request'}]});
  on('Fetch.requestPaused', async ({requestId, request}) => {
    const reply = answer?.(request.url);
    if (reply?.hold) await sleep(reply.hold);
    if (reply?.status) return send('Fetch.fulfillRequest', {requestId, responseCode: reply.status, responseHeaders: [{name: 'Content-Type', value: 'application/json'}], body: Buffer.from(JSON.stringify(reply.body || {})).toString('base64')}).catch(() => {});
    send('Fetch.continueRequest', {requestId}).catch(() => {});
  });
  await send('Page.enable'); await send('Runtime.enable');

  // ── a buyer: a new account (codes from the local outbox), the identification filled in, one piece bought now ──
  let buyers = 0;
  const signUp = () => js(`(async () => {
    const call = (url, body, method = 'POST') => fetch(url, {method, headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify(body)}).then(async r => ({status: r.status, data: await r.json().catch(() => ({}))}));
    const email = 'compra-${process.pid}-${++buyers}-' + Date.now() + '@exemplo.test';
    const start = await call('/api/auth/start', {email, purpose: 'access', lang: 'pt-BR'});
    const latest = await fetch('/__outbox/latest').then(r => r.json());
    const verify = await call('/api/auth/verify', {challenge: start.data.challenge, code: latest.code});
    await call('/api/auth/register', {grant: verify.data.grant, name: 'Teste Checkout', marketingOptIn: false});
    const d = Array.from({length: 9}, () => Math.floor(Math.random() * 10)), digit = list => { const s = list.reduce((sum, n, i) => sum + n * (list.length + 1 - i), 0) % 11; return s < 2 ? 0 : 11 - s; };
    d.push(digit(d)); d.push(digit(d));
    return (await call('/api/account/profile', {firstName: 'Teste', lastName: 'Checkout', cpf: d.join(''), phone: '31999991234'}, 'PUT')).status;
  })()`);
  const fillDelivery = () => js(`(() => {
    const f = document.querySelector('#delivery-form'), set = (n, v) => { const el = f.elements[n]; el.value = v; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); };
    set('name', 'Teste Checkout'); set('email', 'teste@exemplo.test'); set('phone', '(31) 99999-1234'); set('cep', '01310-100'); set('street', 'Avenida Paulista'); set('number', '1000'); set('district', 'Bela Vista'); set('city', 'São Paulo'); set('state', 'SP');
    f.querySelector('[name=terms]').checked = true;
  })()`);
  const buyNow = async ({width = 390, height = 844} = {}) => {
    await viewport(width, height);
    await goto(BASE + 'conta.html');
    assert.equal(await signUp(), 200, 'the buyer has an account with a complete identification');
    await js(`sessionStorage.clear(); sessionStorage.setItem('ju.direct.demo.v1', JSON.stringify([{id: 'p1', productId: 'borboletoscopio', quantity: 1, selection: {}}]))`);
    await goto(BASE + 'comprar-agora.html');
    await until(() => js(`document.body.dataset.stage === 'identification'`), 15000, 'the identification');
    await js(`document.querySelector('#identification-form').requestSubmit()`);
    await until(() => js(`!!document.querySelector('#delivery-form')`), 10000, 'the delivery form');
    await fillDelivery();
    await until(() => js(`!!document.querySelector('[name=shipping-service]:checked')`), 10000, 'the shipping options');
    await js(`document.querySelector('#delivery-form').requestSubmit()`);
    await until(() => js(`!!document.querySelector('[data-fake-brick]') && !document.querySelector('#brick-loading')`), 15000, 'the payment form');
  };
  const pay = (method, holder = 'APRO') => js(`(() => { const f = document.querySelector('[data-fake-brick]'), r = f.querySelector('[value=${method}]'); if (r) { r.checked = true; f.dispatchEvent(new Event('change', {bubbles: true})); } if (f.elements.holder) f.elements.holder.value = '${holder}'; f.requestSubmit(); })()`);
  const toCard = async () => { await js(`document.querySelector('[data-method=card]').click()`); await until(() => js(`!!document.querySelector('[data-fake-brick] [name=holder]') && !document.querySelector('#brick-loading')`), 10000, 'the card form'); };
  const toPix = async () => { await pay('bank_transfer'); await until(() => js(`!!document.querySelector('.pix-panel .live-qr img')`), 10000, 'the Pix screen'); await sleep(300); };
  const pixId = () => js(`(document.querySelector('#pix-code')?.value.match(/PIX-CODE-(ORD[A-Za-z0-9]+)-SEM/) || [])[1] || ''`);
  const stateAtMp = id => js(`fetch('/api/payments/status?id=${id}').then(r => r.json()).then(d => d.state)`);
  const inSight = selector => js(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })()`);
  const passed = [];
  const scenario = async (name, run) => { answer = null; await run(); answer = null; passed.push(name); console.log(`ok  ${name}`); };

  await scenario('o Pix pago fecha as etapas sem reativar nenhum botão; o foco espera nas etapas e vai à confirmação', async () => {
    await buyNow(); await toPix();
    assert.deepEqual(await js(`fetch('/__fake-mp/pay?id=${await pixId()}').then(r => r.json())`), {paid: true});
    await focusOn('[data-action=check-now]'); await press('Enter');
    const seen = [];
    for (let i = 0; i < 60; i++) {
      const now = await js(`(() => { const p = document.querySelector('.pix-panel'); if (!p) return {stage: document.body.dataset.stage}; return {closing: p.classList.contains('is-paid'), awake: [...p.querySelectorAll('button')].filter(b => !b.disabled && b.getAttribute('aria-disabled') !== 'true').map(b => b.dataset.action)}; })()`);
      now.focus = await focused(); seen.push(now);
      if (now.stage === 'confirmation') break;
      await sleep(60);
    }
    const closing = seen.filter(s => s.closing);
    assert(closing.length > 2, 'the steps were seen closing');
    assert.deepEqual([...new Set(closing.flatMap(s => s.awake))], [], 'no button answers while the paid steps close ("Já paguei" stayed off)');
    assert(closing.some(s => s.focus === 'ol.pix-steps'), `the focus waits on the steps, not on the page (${closing.map(s => s.focus).join(', ')})`);
    assert.equal(seen.at(-1).stage, 'confirmation');
    assert.equal(await focused(), 'h1', 'then the confirmation\'s heading');
    assert.equal(await js(`sessionStorage.getItem('ju.pix.pending.v1')`), null, 'paid: nothing remembered');
  });

  await scenario('"← Voltar" sem confirmação do cancelamento: o foco fica no botão e o motivo é dito; depois volta às formas de pagamento', async () => {
    await buyNow(); await toPix();
    const id = await pixId();
    answer = url => url.includes('/api/payments/cancel') ? {status: 503, body: {error: 'provider_unavailable'}} : null;
    await focusOn('.pix-back'); await press('Enter');
    await until(async () => (await said()).includes('Não foi possível cancelar'), 8000, 'the reason');
    assert.equal(await focused(), 'button[pix-back].pix-back', 'the focus is still on "Voltar"');
    assert.deepEqual(await js(`[!!document.querySelector('.pix-panel'), document.querySelector('.pix-back [data-label]').textContent, document.querySelector('.pix-back').getAttribute('aria-disabled')]`), [true, 'Voltar para as formas de pagamento', null], 'the same Pix screen, the button as it was');
    answer = url => url.includes('/api/payments/cancel') ? {hold: 700} : null;
    await press('Enter'); await sleep(250);
    assert.deepEqual(await js(`[document.querySelector('.pix-back [data-label]').textContent, document.querySelector('.pix-back').getAttribute('aria-disabled'), !!document.querySelector('.pix-back .pix-back-icon')]`), ['Cancelando o código anterior…', 'true', true], 'while it waits: the words say so beside the arrow');
    assert.equal(await focused(), 'button[pix-back].pix-back', 'and it keeps the focus');
    await until(() => js(`!!document.querySelector('.pay-choice')`), 8000, 'the payment options');
    assert.equal(await focused(), 'h1'); assert.match(await said(), /O código Pix anterior não vale mais/);
    assert.equal(await stateAtMp(id), 'canceled', 'the old code was cancelled at Mercado Pago');
  });

  await scenario('o código expira: o foco vai para "Gerar novo código Pix", à vista', async () => {
    await buyNow({width: 390, height: 700}); await toPix();
    answer = url => url.includes('/api/payments/status') ? {status: 200, body: {state: 'expired', reference: 'JU-X', statusDetail: 'expired'}} : null;
    await focusOn('[data-action=check-now]'); await press('Enter');
    await until(() => js(`!!document.querySelector('.pix-ended')`), 8000, 'the expired screen');
    await sleep(700);
    assert.equal(await focused(), 'button[new-pix].primary', 'the focus on "Gerar novo código Pix"');
    assert(await inSight('[data-action=new-pix]'), 'in sight');
    assert.match(await said(), /O Pix expirou/);
  });

  await scenario('cartão em análise que volta recusado: o aviso com o motivo; fechado, o lembrete fica à vista junto do formulário', async () => {
    await buyNow({width: 1366, height: 768}); await toCard();
    await pay('credit_card', 'CONT');
    await until(() => js(`!!document.querySelector('[aria-label="Pagamento em análise"]')`), 10000, 'the review screen');
    answer = url => url.includes('/api/payments/status') ? {status: 200, body: {state: 'refused', reason: 'high_risk', reference: 'JU-X'}} : null;
    await click('[data-action=check-now]');
    await until(() => js(`document.querySelector('#pay-notice')?.open`), 8000, 'the notice');
    assert.match(await js(`document.querySelector('#pay-notice').innerText`), /Pagamento não aprovado[\s\S]*análise de segurança do Mercado Pago/);
    assert.equal(await focused(), 'button.primary', 'the focus in the notice, on its main button');
    answer = null; await sleep(300);
    await press('Escape');
    await until(() => js(`!document.querySelector('#pay-notice').open`), 4000, 'the notice to close');
    await sleep(900);
    assert.equal(await focused(), 'div#payment-brick.payment-brick', 'the focus back on the payment form');
    assert.match(await js(`document.querySelector('#card-error').textContent`), /análise de segurança/);
    assert(await inSight('#card-error'), 'the reminder in sight, right under the form');
  });

  await scenario('o aviso só fecha com um clique inteiro fora (selecionar o texto e soltar fora não fecha)', async () => {
    await buyNow({width: 1366, height: 900}); await toCard();
    await pay('credit_card', 'FUND');
    await until(() => js(`document.querySelector('#pay-notice')?.open`), 8000, 'the notice'); await sleep(400);
    const at = await js(`(() => { const r = document.querySelector('#pay-notice-reason').getBoundingClientRect(), d = document.querySelector('#pay-notice').getBoundingClientRect(); return {x: r.left + 4, y: r.top + r.height / 2, out: d.right + 40, far: 40}; })()`);
    await mouse('mouseMoved', at.x, at.y, {button: 'none'}); await mouse('mousePressed', at.x, at.y);
    for (let i = 1; i <= 8; i++) await mouse('mouseMoved', at.x + (at.out - at.x) * i / 8, at.y, {buttons: 1});
    await mouse('mouseReleased', at.out, at.y); await sleep(400);
    assert(await js(`document.querySelector('#pay-notice').open`), 'still open after selecting its words');
    assert(String(await js('String(getSelection())')).length > 3, 'and the words are selected');
    await mouse('mouseMoved', at.far, at.far, {button: 'none'}); await mouse('mousePressed', at.far, at.far);
    for (let i = 1; i <= 5; i++) await mouse('mouseMoved', at.far + (at.x - at.far) * i / 5, at.far + (at.y - at.far) * i / 5, {buttons: 1});
    await mouse('mouseReleased', at.x, at.y); await sleep(400);
    assert(await js(`document.querySelector('#pay-notice').open`), 'a press outside let go on the notice keeps it open');
    await mouse('mouseMoved', at.far, at.far, {button: 'none'}); await mouse('mousePressed', at.far, at.far); await mouse('mouseReleased', at.far, at.far);
    await until(() => js(`!document.querySelector('#pay-notice').open`), 4000, 'a whole click outside to close it');
  });

  await scenario('Pix recusado na criação: a linha do Pix, nunca o aviso do cartão', async () => {
    await buyNow();
    answer = url => url.includes('/api/payments/create') ? {status: 422, body: {error: 'payment_rejected'}} : null;
    await pay('bank_transfer');
    await until(() => js(`document.querySelector('#card-error').textContent.length > 0`), 8000, 'the line');
    await sleep(300);
    assert.equal(await js(`!!document.querySelector('#pay-notice')?.open`), false, 'no card notice');
    assert.deepEqual(await js(`[document.querySelector('#card-error').textContent, document.querySelector('#card-error').getAttribute('role')]`), ['Não conseguimos gerar o Pix agora. Tente de novo ou pague com cartão.', 'alert']);
    assert.doesNotMatch(await js(`document.querySelector('#card-error').textContent`), /cartão não|Tentar outro cartão/);
  });

  await scenario('recarregar com um Pix aguardando: continuar com ele ou cancelá-lo antes; nunca dois códigos pagáveis', async () => {
    await buyNow(); await toPix();
    const first = await pixId();
    assert.deepEqual(JSON.parse(await js(`sessionStorage.getItem('ju.pix.pending.v1')`)), {mpId: first, reference: await js(`document.querySelector('.shop-heading .eyebrow').textContent.replace('PEDIDO ', '')`)}, 'only the id and the reference');
    await goto(BASE + 'comprar-agora.html');
    await until(() => js(`!!document.querySelector('.pix-resume') || document.body.dataset.stage === 'identification'`), 15000, 'the page');
    assert(await js(`!!document.querySelector('.pix-resume')`), 'the choice, not the identification');
    assert.equal(await focused(), 'h1');
    await click('[data-action=resume-pix]');
    await until(() => js(`!!document.querySelector('.pix-panel .live-qr img')`), 8000, 'the same Pix');
    assert.equal(await pixId(), first, 'the same code, not a new one');
    await goto(BASE + 'comprar-agora.html');
    await until(() => js(`!!document.querySelector('.pix-resume')`), 15000, 'the choice again');
    await click('[data-action=drop-pending]');
    await until(() => js(`document.body.dataset.stage === 'identification'`), 10000, 'the start again');
    assert.equal(await stateAtMp(first), 'canceled', 'the old one cancelled before anything else');
    assert.equal(await js(`sessionStorage.getItem('ju.pix.pending.v1')`), null);
  });

  await scenario('/api/payments/config lento: pergunta de novo ("Carregando o pagamento…"), nunca a demonstração', async () => {
    await viewport(360, 780);
    await goto(BASE + 'conta.html'); assert.equal(await signUp(), 200);
    await js(`sessionStorage.clear(); sessionStorage.setItem('ju.direct.demo.v1', JSON.stringify([{id: 'p1', productId: 'borboletoscopio', quantity: 1, selection: {}}]))`);
    answer = url => url.includes('/api/payments/config') ? {hold: 3000} : null;
    await send('Page.navigate', {url: BASE + 'comprar-agora.html'});
    await until(() => js(`document.querySelector('[data-checkout-loading]')?.textContent === 'Carregando o pagamento…'`), 6000, '"Carregando o pagamento…"');
    await until(() => js(`document.body.dataset.stage === 'identification'`), 15000, 'the identification');
    assert.match(await js(`document.querySelector('.demo-banner').textContent`), /^AMBIENTE DE TESTE/, 'real (test) payments, not the demo');
  });

  assert.deepEqual(errors, [], 'no script error on the pages');
  console.log(`PASS: checkout no navegador (Chrome sem janela + simulador) — ${passed.length} cenários: o Pix pago fecha sem reativar botões e com o foco nas etapas; "Voltar" sem confirmação mantém o foco e diz o motivo; expirado leva o foco a "Gerar novo código Pix"; recusa em análise abre o aviso e o lembrete fica à vista; o aviso só fecha com clique inteiro fora; Pix recusado na criação tem a sua linha; recarregar com Pix aberto oferece continuar ou cancelar; config lenta não cai na demonstração.`);
} catch (error) {
  console.error(error);
  console.error('--- servidor local (fim) ---\n' + serverLog.split('\n').slice(-25).join('\n'));
  process.exitCode = 1;
} finally {
  await stop();
}
