// Contato e Perguntas frequentes (contato.html): the message form's endpoint (api/contact/send.js), the e-mail that reaches
// the shop, and the page itself (channels, form, questions whose values follow the shop's own settings).
// Run: node tests/contact.mjs — no network (Resend is faked), in-memory store.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const send = require('../api/contact/send');
const {renderContactEmail, SUBJECTS} = require('../api/_lib/contact');
const {createMemoryStore} = require('../api/_lib/store-memory');
const shipping = require('../api/_lib/shipping-config');
const {COMMERCE, money, pixPercent} = await import(pathToFileURL(path.join(root, 'dist/commerce-config.js')).href);

const SITE = 'https://site.test';
const ENV = {SITE_URL: SITE, APP_ENV: 'preview', RESEND_API_KEY: 're_test_key_123', AUTH_SECRET: 's'.repeat(40), ORDER_NOTIFY_EMAIL: ' Ju@Site.Test ', MAIL_FROM: 'Ju <oi@site.test>'};
const MESSAGE = {name: 'Ana Souza', email: 'Ana@Example.com', subject: 'produto', message: 'Oi, Ju!\nO Borboletoscópio serve no meu Heine? <script>alert(1)</script>'};

function makeRes() { return {statusCode: 200, headers: {}, body: '', setHeader(key, value) { this.headers[key.toLowerCase()] = value; }, end(data) { this.body = data || ''; }, json() { return JSON.parse(this.body); }}; }
function setup(env = ENV, answer = [200, {id: 'em_1'}]) {
  const sent = [], store = createMemoryStore();
  const fetchImpl = async (url, init) => { sent.push({url, body: JSON.parse(init.body), headers: init.headers}); return {ok: answer[0] < 400, status: answer[0], json: async () => answer[1]}; };
  const handler = send.create({env, store, now: () => Date.parse('2026-10-04T15:00:00Z'), fetchImpl});
  const call = async ({method = 'POST', origin = SITE, body = MESSAGE, ip = '203.0.113.20'} = {}) => { const res = makeRes(); await handler({method, headers: {...(origin ? {origin} : {}), 'x-forwarded-for': ip}, body, socket: {}, url: '/api/contact/send'}, res); return res; };
  return {sent, call};
}

// ── the endpoint ──────────────────────────────────────────────────────
{
  const {sent, call} = setup();
  assert.equal((await call({method: 'GET'})).statusCode, 405);
  assert.equal((await call({origin: ''})).statusCode, 403, 'no Origin');
  assert.equal((await call({origin: 'https://evil.example'})).statusCode, 403, 'another site');
  assert.equal(sent.length, 0);

  const ok = await call();
  assert.equal(ok.statusCode, 200); assert.deepEqual(ok.json(), {ok: true}); assert.equal(ok.headers['cache-control'], 'no-store');
  assert.equal(sent.length, 1); assert.equal(sent[0].url, 'https://api.resend.com/emails');
  const mail = sent[0].body;
  assert.deepEqual(mail.to, ['ju@site.test'], 'to the inbox that already gets the orders');
  assert.equal(mail.reply_to, 'ana@example.com', 'answering goes straight to the person who wrote');
  assert.equal(mail.subject, '[TESTE] Contato pelo site · Dúvida sobre produto · Ana Souza');
  assert(mail.text.includes('Oi, Ju!\nO Borboletoscópio serve no meu Heine?'), 'the message as written, line breaks kept');
  assert(!mail.html.includes('<script>') && mail.html.includes('&lt;script&gt;'), 'nothing in the message runs in the e-mail');
  assert.equal(renderContactEmail({...MESSAGE, email: 'ana@example.com', test: false}).subject, 'Contato pelo site · Dúvida sobre produto · Ana Souza', 'no [TESTE] on the real shop');

  for (const [change, field] of [[{name: ' a '}, 'name'], [{email: 'ana@'}, 'email'], [{email: 'a b@c.com'}, 'email'], [{subject: 'reclamacao'}, 'subject'], [{subject: ''}, 'subject'], [{message: 'curta'}, 'message'], [{message: 'x'.repeat(2001)}, 'message']]) {
    const res = await call({body: {...MESSAGE, ...change}, ip: `198.51.100.${Math.floor(Math.random() * 200)}`});
    assert.equal(res.statusCode, 400, field); assert.deepEqual(res.json(), {error: 'invalid_request', field});
  }
  assert.equal((await call({body: 'not json'})).statusCode, 400);
  assert.equal(sent.length, 1, 'nothing is sent for a form that does not pass');

  const bot = await call({body: {...MESSAGE, website: 'http://spam.example'}, ip: '192.0.2.99'});
  assert.equal(bot.statusCode, 200, 'the hidden field filled: the bot sees success…');
  assert.equal(sent.length, 1, '…and nothing goes out');
  assert.deepEqual(Object.keys(SUBJECTS), ['produto', 'pedido', 'personalizado', 'outro']);
}

// ── floods: 5 messages an hour per address, 3 per e-mail ──────────────
{
  const {sent, call} = setup();
  for (let i = 0; i < 5; i++) assert.equal((await call({body: {...MESSAGE, email: `pessoa${i}@example.com`}})).statusCode, 200);
  const blocked = await call({body: {...MESSAGE, email: 'pessoa9@example.com'}});
  assert.equal(blocked.statusCode, 429); assert.equal(blocked.json().error, 'too_many_requests'); assert(Number(blocked.headers['retry-after']) > 0);
  for (let i = 0; i < 3; i++) assert.equal((await call({ip: `192.0.2.${i + 1}`})).statusCode, 200);
  assert.equal((await call({ip: '192.0.2.50'})).statusCode, 429, 'the same e-mail from other addresses');
  assert.equal(sent.length, 8);
}

// ── where it goes, and when it cannot go ──────────────────────────────
{
  const noInbox = setup({...ENV, ORDER_NOTIFY_EMAIL: ''});
  const res = await noInbox.call();
  assert.equal(res.statusCode, 503); assert.equal(res.json().error, 'contact_unavailable'); assert.equal(noInbox.sent.length, 0);
  assert.equal((await setup({...ENV, RESEND_API_KEY: '', AUTH_SECRET: ''}).call()).statusCode, 503, 'no e-mail service');
  const own = setup({...ENV, CONTACT_EMAIL: 'Contato@Site.Test'});
  await own.call();
  assert.deepEqual(own.sent[0].body.to, ['contato@site.test'], 'CONTACT_EMAIL wins over ORDER_NOTIFY_EMAIL');
  const refused = setup(ENV, [500, {message: 'boom'}]);
  const failed = await refused.call();
  assert.equal(failed.statusCode, 502); assert.equal(failed.json().error, 'mail_failed');
}

// ── the page ──────────────────────────────────────────────────────────
{
  const page = read('dist/contato.html'), script = read('dist/contato.js');
  assert.doesNotMatch(page, /name="robots" content="noindex"/, 'the contact page can be found now');
  assert.match(page, /<link rel="stylesheet" href="contact\.css">/); assert.match(page, /<script type="module" src="contato\.js"><\/script>/);
  assert.doesNotMatch(page.replace(/<script type="application\/ld\+json">[^]*?<\/script>/g, ''), /<script(?![^>]*\bsrc=)[^>]*>/, 'no inline script (CSP)');
  assert.match(page, /<h1 id="contact-title">Fale com a Ju <span class="contact-heart" aria-hidden="true">💜<\/span><\/h1>/);
  // Channels: WhatsApp first; its button stays hidden until the number exists, and then carries a greeting.
  const channels = [...page.matchAll(/<article class="contact-channel[^"]*">[^]*?<h2>([^<]+)<\/h2>/g)].map(m => m[1]);
  assert.deepEqual(channels, ['WhatsApp', 'E-mail', 'Instagram']);
  assert.match(page, /<a class="contact-cta" href="#" data-whatsapp-link target="_blank" rel="noopener" hidden>Falar agora no WhatsApp →<\/a>/);
  assert.match(script, /const number = \/\^\\d\{10,15\}\$\/\.test\(COMMERCE\.whatsapp\) \? COMMERCE\.whatsapp : '';/);
  assert.match(script, /https:\/\/wa\.me\/\$\{number\}\?text=\$\{encodeURIComponent\(translate\('Olá, Ju! Vim pelo site e tenho uma dúvida\.'\)\)\}/);
  assert(page.includes(`href="${/const INSTAGRAM = '([^']+)'/.exec(read('dist/site-shell.js'))[1]}"`), 'the same Instagram as the menu and the footer');
  // The form: the same fields and subjects the server accepts, a hidden trap field and the privacy note.
  for (const name of ['name', 'email', 'subject', 'message', 'website']) assert.match(page, new RegExp(`name="${name}"`), name);
  assert.deepEqual([...page.matchAll(/<option value="([a-z]+)">/g)].map(m => m[1]), Object.keys(SUBJECTS));
  assert.match(page, /<div class="contact-trap" aria-hidden="true"><label>Não preencha este campo<input name="website" tabindex="-1" autocomplete="off"><\/label><\/div>/);
  assert.match(page, /<a href="privacidade\.html">Política de Privacidade<\/a>/);
  assert.match(script, /fetch\('\/api\/contact\/send'/);
  assert.match(page, /<h2>Mensagem enviada com sucesso!<\/h2>\n\s*<p>Responderemos em breve\.<\/p>/);
  // The questions: opening one by one, with the shop's real numbers.
  assert.equal((page.match(/<details class="faq-item"/g) || []).length, 7);
  const faq = page.slice(page.indexOf('class="contact-faq"'));
  assert(faq.includes(`a produção leva de ${COMMERCE.productionLabel}`), 'production time = commerce-config.js');
  assert(faq.includes(`Pix, com ${pixPercent}% de desconto nas peças`), 'Pix discount = the server rule');
  assert(faq.includes(`a partir de ${money(shipping.freeShipping.fromCents).replace(/ /g, ' ')} em peças, o envio por PAC é grátis`), 'free shipping = shipping-config.js');
  assert(read('dist/trocas.html').includes('desistir em até 7 dias corridos') && faq.includes('desistir da compra em até 7 dias corridos'), 'returns as in the policy');
  const css = read('dist/contact.css');
  assert.match(css, /\.faq-item\[open\]::details-content \{ block-size: auto; opacity: 1; \}/, 'the answers slide open with CSS alone');
  assert.match(css, /prefers-reduced-motion: reduce\) \{[^}]*\.faq-item::details-content/, 'no slide when the system asks for less motion');
  assert.doesNotMatch(script, /\.animate\(/, 'no script animation that could stop half way');
  // Around the page.
  assert(read('dist/privacidade.html').includes('as mensagens do formulário de contato'), 'the Privacy Policy names the contact form');
  assert.match(read('tools/dev-server.cjs'), /'\/api\/contact\/send': require\('\.\.\/api\/contact\/send'\)/, 'the local server answers the form');
}

console.log('PASS: contact — the form reaches the shop inbox with the sender as reply-to, checked fields, a trap for bots, limits per address and per e-mail; the page with WhatsApp first, the same subjects as the server and questions that follow the shop settings.');
