// Legal pages and the buyer's agreement: the three documents, the store details in every footer (one source,
// api/_lib/legal.js, copied by tools/sync-legal.cjs), the agreement at sign-up and at checkout, and what the server
// records. Run: node tests/legal.mjs — no network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const legal = require('../api/_lib/legal');
const {sync, pages} = require('../tools/sync-legal.cjs');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');

// ── one source for the store details and the terms date ───────────────
assert.match(legal.TERMS_VERSION, /^\d{4}-\d{2}-\d{2}$/, 'TERMS_VERSION is a date');
assert.equal(legal.termsDate('2026-09-28'), '28 de setembro de 2026');
for (const field of ['tradeName', 'legalName', 'cnpj', 'address', 'email', 'phone', 'website']) assert(legal.COMPANY[field], `COMPANY.${field}`);
const stale = pages().filter(name => { const html = read('dist/' + name); return sync(html) !== html; });
assert.deepEqual(stale, [], `pages out of date with api/_lib/legal.js — run: node tools/sync-legal.cjs (${stale.join(', ')})`);
// The contact channels for the scripts (company.js) come from the same file; what is still "[PREENCHER]" is empty there.
{
  const {companyModule, COMPANY_JS} = require('../tools/sync-legal.cjs');
  assert.equal(read('dist/' + COMPANY_JS), companyModule(), 'dist/company.js out of date — run: node tools/sync-legal.cjs');
  const contact = legal.contact();
  assert.deepEqual(Object.keys(contact), ['email', 'phone', 'whatsapp', 'hours']);
  for (const [key, value] of Object.entries(contact)) assert(!value.includes('[PREENCHER'), `company.js: ${key} never shows a placeholder`);
  if (legal.WHATSAPP) assert.match(legal.WHATSAPP, /^55\d{10,11}$/, 'WhatsApp: digits, with 55 and the area code');
}

// ── every public page: links to the three documents and who the store is ─
const internal = new Set(['admin.html', 'email-preview.html']);
for (const name of pages().filter(n => !internal.has(n))) {
  const html = read('dist/' + name), block = html.match(/<div class="footer-legal">[\s\S]*?<\/div>/)?.[0] || '';
  assert(block, `${name}: footer legal block`);
  for (const href of ['termos.html', 'privacidade.html', 'trocas.html']) assert(block.includes(`href="${href}"`), `${name}: footer links to ${href}`);
  for (const field of ['legalName', 'cnpj', 'address', 'email']) assert(block.includes(`data-company="${field}"`), `${name}: footer shows ${field}`);
  assert(block.includes('translate="no"'), `${name}: the store details are never translated`);
}

// ── the documents ─────────────────────────────────────────────────────
const docs = {
  'termos.html': ['Termos de Uso', 'Código de Defesa do Consumidor', 'maiores de 18 anos', 'Cada CPF pode ter uma conta', 'Propriedade intelectual', 'foro do domicílio do consumidor', 'href="trocas.html"', 'href="privacidade.html"', 'Excluir minha conta'],
  'privacidade.html': ['Política de Privacidade', 'Lei nº 13.709/2018', 'art. 7º', 'Mercado Pago', 'Resend', 'servidor próprio da loja, no Brasil', 'Bling (emissor de nota fiscal)', 'e o Backblaze, que guarda as cópias de segurança', 'já chegam criptografadas', 'Correios', 'Cálculo do frete', 'ViaCEP', 'BrasilAPI', 'art. 33', '5 anos', '6 meses', 'art. 18', 'Excluir minha conta', 'ANPD', 'art. 48', 'Cookies', 'não usamos cookies de publicidade', 'só serão carregadas depois do seu consentimento', 'Preferências de cookies', 'não recebemos nem guardamos o número', 'Mensagens de atendimento:</strong> as mensagens do formulário de contato ficam guardadas por 12 meses', 'spam), por 30 dias', 'o número de WhatsApp que informar'],
  'trocas.html': ['Trocas e Devoluções', 'até 7 dias', 'art. 49', 'inclusive o frete', '90 dias', 'art. 26', '30 dias', 'art. 18', 'Decreto nº 7.962/2013', 'Pix', 'Cartão de crédito', 'Direito de arrependimento: 7 dias', 'href="#arrependimento">Como desistir']
};
for (const [file, musts] of Object.entries(docs)) {
  const html = read('dist/' + file);
  assert(/<meta http-equiv="Content-Security-Policy"/.test(html), `${file}: security policy meta`);
  assert(/<article class="legal-doc" translate="no" lang="pt-BR"/.test(html), `${file}: Portuguese text, never machine-translated`);
  assert(/<p class="legal-language">/.test(html), `${file}: English and Spanish readers are told the text is Portuguese`);
  assert(html.includes(`<span data-terms-date>${legal.termsDate()}</span>`), `${file}: shows the date of TERMS_VERSION`);
  for (const text of musts) assert(html.includes(text), `${file}: mentions "${text}"`);
  assert(!html.includes('Melhor Envio'), `${file}: no Melhor Envio (the shop ships with its own Correios contract)`);
  assert(!html.includes('Hostinger'), `${file}: no Hostinger (the site and the database are on the shop's own server)`);
  const ids = [...html.matchAll(/<a href="#([\w-]+)">/g)].map(m => m[1]);
  for (const id of ids) assert(html.includes(`id="${id}"`), `${file}: table of contents points to #${id}`);
  assert(!/<script(?![^>]*\bsrc=)/.test(html.replace(/<script type="importmap"[\s\S]*?<\/script>/, '')), `${file}: no inline scripts`);
}
assert(/html\[lang="pt-BR"\] \.legal-language \{ display: none; \}/.test(read('dist/legal.css')), 'the language notice is hidden in Portuguese');

// ── agreement: sign-up notice, checkout box, what the browser sends ───
const account = read('dist/account.js'), checkout = read('dist/checkout.js'), drawer = read('dist/account-drawer.js');
assert(/<p class="auth-terms">Ao criar sua conta, você concorda com os Termos de Uso e declara ter lido a Política de Privacidade\.<\/p>/.test(account), 'sign-up says that creating the account is agreeing');
assert(/<a href="termos\.html" target="_blank" rel="noopener">Termos de Uso<\/a>/.test(account), 'sign-up links open in a new tab (the account page may be inside the drawer)');
assert(/<input type="checkbox" name="terms" required /.test(checkout), 'checkout: the agreement box is required');
assert(/acceptTerms: draft\.terms === 'on'/.test(checkout), 'checkout: the agreement goes to the server with the payment');
assert(/target="_blank" rel="noopener">Trocas e Devoluções<\/a>/.test(checkout), 'checkout: documents open in a new tab, the order in progress stays');
assert(/termos\|privacidade\|trocas/.test(drawer), 'the account drawer may open the legal pages');

// ── server: the agreement is required and recorded ────────────────────
const create = read('api/payments/create.js'), orders = read('api/_lib/orders.js'), accounts = read('api/_lib/accounts.js');
assert(/termsAccepted: body\.acceptTerms === true/.test(create), 'the payment requires acceptTerms to be exactly true');
assert(/if \(termsAccepted !== true\) throw fail\('invalid_request', \{field: 'terms'\}\)/.test(orders), 'no order without the agreement');
assert(/termsVersion: TERMS_VERSION, termsAcceptedAt: date\(\)/.test(orders) && /termsVersion: TERMS_VERSION, termsAcceptedAt: date\(\)/.test(accounts), 'version and time recorded on the order and on the account');
assert(read('db/migrations/004_termos.sql').includes('ADD COLUMN terms_version'), 'migration for the agreement');

const left = Object.entries(legal.COMPANY).filter(([, value]) => String(value).startsWith('[PREENCHER')).map(([key]) => key);
console.log(`PASS: legal pages (Termos, Privacidade LGPD, Trocas CDC) with the terms date, store details in every footer from one source, agreement at sign-up and required at checkout, recorded by the server.${left.length ? ` Pendente antes do lançamento: ${left.join(', ')} em api/_lib/legal.js.` : ''}`);
