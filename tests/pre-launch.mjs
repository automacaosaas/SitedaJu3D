// Quick fixes before the launch (audit of 06/10/2026): the 404 page (Q2), "Envio e prazos" in one place (Q6) and the
// cookie notice that only exists with an analytics or ad tool (Q7). The contact channels (Q3) are in contact.mjs and
// legal.mjs, the "3x de R$ … sem juros" (Q4) in pix.mjs, the 404 answer of the server in server.mjs.
// Run: node tests/pre-launch.mjs — no network, no browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const site = file => import(pathToFileURL(path.join(root, 'dist', file)).href);
const {COMMERCE, money} = await site('commerce-config.js');
const shipping = require('../api/_lib/shipping-config');
const pages = fs.readdirSync(path.join(root, 'dist')).filter(name => name.endsWith('.html'));

// ── Q6: Envio e prazos ────────────────────────────────────────────────
{
  const page = read('dist/envio.html');
  assert.match(page, /<meta http-equiv="Content-Security-Policy"/, 'security policy meta');
  assert.match(page, /<link rel="stylesheet" href="shipping-info\.css">/);
  assert.match(page, /<h1 id="ship-title">Do ateliê até você\.<\/h1>/);
  assert.doesNotMatch(page, /translate="no" lang="pt-BR"/, 'translated into English and Spanish like the shop pages');
  // The numbers are the shop's own settings: production time, free shipping threshold and service, the services.
  assert.equal((page.match(new RegExp(COMMERCE.productionLabel, 'g')) || []).length >= 2, true, 'production time = commerce-config.js');
  const {minDays, maxDays} = shipping.production;
  assert.equal(COMMERCE.productionLabel, `${minDays} a ${maxDays} dias úteis`, 'the page and the server count the same days');
  const free = money(shipping.freeShipping.fromCents).replace(/\s/g, ' ');
  assert(page.includes(`Nas compras a partir de <strong>${free}</strong> em peças, o envio por ${shipping.services.find(s => s.id === shipping.freeShipping.service).label} é grátis`), 'free shipping = shipping-config.js');
  for (const service of shipping.services) assert(page.includes(service.label), `service ${service.label}`);
  const ids = [...page.matchAll(/<a href="#([\w-]+)">/g)].map(m => m[1]);
  assert.deepEqual(ids, ['prazo', 'frete', 'frete-gratis', 'acompanhar', 'onde', 'endereco']);
  for (const id of ids) assert(page.includes(`<section id="${id}">`), `#${id}`);
  // Everyone who sees a delivery fact can open the page: product pages, cart, checkout, questions and every footer.
  for (const id of Object.keys(COMMERCE.prices)) {
    const product = read(`dist/${id}.html`);
    assert(product.includes('<a href="envio.html#prazo">Ver envio e prazos</a>') && product.includes('<a href="envio.html#frete">Ver envio e prazos</a>'), `${id}.html links to Envio e prazos`);
  }
  assert.match(read('dist/cart-view.js'), /row\('truck', 'envio\.html#frete', 'Entrega e frete\.'/);
  assert.match(read('dist/checkout.js'), /<p class="ship-title"><strong>Como quer receber\?<\/strong><a href="envio\.html" target="_blank" rel="noopener">Prazos e frete<\/a><\/p>/);
  assert.equal((read('dist/contato.html').match(/<a href="envio\.html">Ver Envio e prazos →<\/a>/g) || []).length, 2, 'two questions link to it');
  for (const name of pages.filter(name => !['admin.html', 'email-preview.html'].includes(name))) {
    const html = read('dist/' + name);
    if (html.includes('<div class="footer-legal">')) assert(html.includes('<a href="trocas.html">Trocas e Devoluções</a><a href="envio.html">Envio e prazos</a></nav>'), `${name}: footer links to Envio e prazos`);
  }
  assert.match(read('dist/sitemap.xml'), /<loc>https:\/\/juimprimepramim\.com\.br\/envio\.html<\/loc>/, 'search engines find it');
  assert.match(page, /<meta property="og:url" content="https:\/\/juimprimepramim\.com\.br\/envio\.html">/, 'and a link preview');
}

// ── Q2: the 404 page ──────────────────────────────────────────────────
{
  const page = read('dist/404.html');
  assert.match(page, /<head>\n  <meta http-equiv="Content-Security-Policy" content="[^"]+">\n  <base href="\/">\n  <meta name="robots" content="noindex">\n/, 'root links first, never indexed');
  assert.match(page, /<p class="eyebrow">ERRO 404<\/p>/);
  assert.match(page, /<a class="primary" href="index\.html">Ir para a vitrine <span aria-hidden="true">→<\/span><\/a><a class="not-found-secondary" href="produtos\.html">Ver a coleção de produtos<\/a>/, 'the showcase and the collection');
  assert.match(page, /<header class="header">[^]*<nav class="shop-nav" data-shop-nav/, 'the header of the site (menu, cart, account)');
  assert.match(page, /<footer class="site-footer">/, 'and its footer');
  assert.doesNotMatch(read('dist/sitemap.xml'), /404/, 'not in the sitemap');
  const css = read('dist/not-found.css');
  assert.match(css, /prefers-reduced-motion: reduce\) \{ \.nf-filament \{ animation: none; \} \}/, 'the filament stops for less motion');
  assert.match(read('server/create-server.cjs'), /resolveFile\('\/404\.html'\)/, 'the server answers with it');
  assert.match(read('tools/dev-server.cjs'), /path\.join\(ROOT, '404\.html'\)/, 'and the local server too');
}

// ── Q7: the cookie notice ─────────────────────────────────────────────
{
  const config = await site('analytics-config.js');
  // No tool, no notice: the site keeps loading nothing from third parties (the Privacy Policy says so).
  globalThis.location = {search: ''};
  const store = new Map();
  globalThis.sessionStorage = {getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value))};
  assert.deepEqual(config.ANALYTICS, {ga4: '', metaPixel: ''}, 'no analytics tool is on yet');
  assert.equal(config.cookieNoticeNeeded(), false, 'without a tool there is nothing to ask');
  globalThis.location = {search: '?cookies=preview'};
  assert.equal(config.cookieNoticeNeeded(), true, '?cookies=preview shows it, to check its look');
  globalThis.location = {search: ''};
  assert.equal(config.cookieNoticeNeeded(), true, 'for the rest of the tab');
  // When a tool is turned on, its addresses must be in the Content-Security-Policy, or the browser would block it.
  const policy = JSON.parse(read('vercel.json')).headers.find(r => r.source === '/(.*)').headers.find(h => h.key === 'Content-Security-Policy').value;
  const directive = name => (policy.split(';').map(s => s.trim()).find(s => s.startsWith(name + ' ')) || '').split(/\s+/);
  for (const [tool, id] of Object.entries(config.validIds())) if (id) for (const [name, hosts] of Object.entries(config.CSP_DOMAINS[tool])) for (const host of hosts) assert(directive(name).includes(host), `${tool} is on: add ${host} to ${name} in vercel.json and run node tools/sync-csp.cjs`);
  // The notice: loaded only when needed, choices as easy to refuse as to accept, and tools only after consent.
  const shell = read('dist/site-shell.js'), consent = read('dist/consent.js');
  assert.match(shell, /if \(cookieNoticeNeeded\(\)\) import\('\.\/consent\.js'\)\.then\(module => module\.mountConsent\(\)\)/, 'consent.js is fetched only with a tool');
  assert.match(consent, /data-consent="accept">Aceitar todos<\/button>\n      <button type="button" class="consent-decline" data-consent="decline">Recusar<\/button>/, '"Recusar" right beside "Aceitar todos"');
  assert.match(consent, /<input type="checkbox" checked disabled><span><strong>Essenciais<\/strong>/, 'essential storage cannot be turned off');
  assert.match(consent, /if \(choice\.analytics && ids\.ga4 && !loaded\.has\('ga4'\)\)/, 'Google Analytics only with "Análise" accepted');
  assert.match(consent, /if \(choice\.marketing && ids\.metaPixel && !loaded\.has\('metaPixel'\)\)/, 'the Meta pixel only with "Anúncios" accepted');
  assert.match(consent, /button\.textContent = 'Preferências de cookies';/, 'the choice can change at any time, from the footer');
  assert.doesNotMatch(consent, /innerHTML = [^;]*\$\{(?!esc\()/, 'no unescaped value in the markup');
  const {readConsent} = await site('consent.js');
  const local = new Map();
  globalThis.localStorage = {getItem: key => local.get(key) ?? null, setItem: (key, value) => local.set(key, String(value))};
  assert.equal(readConsent(), null, 'nothing chosen yet');
  local.set('ju.consent', JSON.stringify({v: 1, analytics: true, marketing: false, at: '2026-10-06T12:00:00.000Z'}));
  assert.deepEqual(readConsent(), {v: 1, analytics: true, marketing: false, at: '2026-10-06T12:00:00.000Z'});
  local.set('ju.consent', JSON.stringify({v: 0, analytics: true}));
  assert.equal(readConsent(), null, 'a choice from an older notice is asked again');
  const privacy = read('dist/privacidade.html');
  assert(privacy.includes('Hoje não usamos cookies de publicidade nem de análise de audiência.') && privacy.includes('“Preferências de cookies”, no rodapé'), 'the Privacy Policy tells the same');
}

console.log('PASS: pre-launch — 404 page with the way back, Envio e prazos with the shop\'s own numbers and linked from every delivery fact, and a cookie notice that exists only with an analytics tool, asks before loading it and keeps the choice changeable.');
