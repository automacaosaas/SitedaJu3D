// One page per product, sitemap and robots (audits C1 and J2), built by tools/build-product-pages.cjs from the shop's own
// data. Run: node tests/product-landing.mjs — no network, no browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const site = file => import(pathToFileURL(path.join(root, 'dist', file)).href);
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const {build} = require('../tools/build-product-pages.cjs');
const {COMPANY} = require('../api/_lib/legal');
const {PRODUCTS, defaults, color} = await site('products.js');
const {COMMERCE, money, pixPrice} = await site('commerce-config.js');
const BASE = COMPANY.website.replace(/\/+$/, '');

// ── the files are what the tool builds now ────────────────────────────
{
  const stale = (await build()).filter(({name, text}) => read('dist/' + name) !== text).map(f => f.name);
  assert.deepEqual(stale, [], `out of date — run: node tools/build-product-pages.cjs (${stale.join(', ')})`);
}

// ── each product page ─────────────────────────────────────────────────
for (const [id, product] of Object.entries(PRODUCTS)) {
  const page = read(`dist/${id}.html`), price = COMMERCE.prices[id];
  assert.match(page, new RegExp(`<title>${product.title} · ${product.subtitle} \\| Ju, imprime pra mim\\?</title>`), `${id}: a title search engines can show`);
  assert(page.includes(`<link rel="canonical" href="${BASE}/${id}.html">`), `${id}: canonical address`);
  assert(page.includes(`<h1>${product.title}</h1>`), `${id}: the name as the page heading`);
  assert(page.includes(`<strong>${money(price).replace(/ /g, '&nbsp;')}</strong><span class="pl-pix">${money(pixPrice(price)).replace(/ /g, '&nbsp;')} no Pix</span>`), `${id}: price and Pix price`);
  for (const part of product.parts) assert(page.includes(`${part.name}: <strong>${color(defaults(id)[part.id]).name}</strong>`), `${id}: original color of ${part.id}`);
  assert(page.includes(`href="index.html#produto/${id}/personalizar"`), `${id}: "Personalizar o meu" opens the configurator`);
  assert(page.includes(`<button type="button" class="pl-add" data-add-product="${id}">`), `${id}: add in the original colors (mini-cart)`);
  assert(page.includes(`Produção em ${COMMERCE.productionLabel}`), `${id}: production time`);
  // link preview with the piece's own picture, and the product data search engines read
  assert(page.includes('<meta property="og:type" content="product">'));
  assert(page.includes(`<meta property="og:image" content="${BASE}/assets/og-${id}.jpg">`) && fs.existsSync(path.join(root, `dist/assets/og-${id}.jpg`)), `${id}: preview picture`);
  assert(page.includes(`<meta property="product:price:amount" content="${(price / 100).toFixed(2)}">`));
  const data = JSON.parse(/<script type="application\/ld\+json">([^<]*)<\/script>/.exec(page)[1]);
  assert.equal(data['@type'], 'Product'); assert.equal(data.name, product.title); assert.equal(data.sku, id);
  assert.equal(data.offers.price, (price / 100).toFixed(2)); assert.equal(data.offers.priceCurrency, 'BRL');
  assert.equal(data.offers.availability, 'https://schema.org/MadeToOrder', 'made to order');
  assert.equal(data.offers.url, `${BASE}/${id}.html`);
  // the same head, header and footer as the catalog (security policy, company data, scripts)
  const catalog = read('dist/produtos.html');
  assert(page.includes(/<meta http-equiv="Content-Security-Policy" content="[^"]+">/.exec(catalog)[0]), `${id}: same security policy`);
  assert(page.includes(/<footer class="site-footer">[^]*?<\/footer>/.exec(catalog)[0]), `${id}: same footer (company data)`);
  assert.match(page, /<script type="module" src="catalog\.js"><\/script>/, `${id}: the add button works (catalog.js) and opens the mini-cart`);
  assert.match(page, /<link rel="stylesheet" href="mini-cart\.css">\n  <link rel="stylesheet" href="product-landing\.css">/);
}

// ── sitemap, robots and the home's organization data ──────────────────
{
  const sitemap = read('dist/sitemap.xml'), robots = read('dist/robots.txt');
  for (const page of ['', 'produtos.html', ...Object.keys(PRODUCTS).map(id => `${id}.html`), 'termos.html', 'privacidade.html', 'trocas.html'])
    assert(sitemap.includes(`<loc>${BASE}/${page}</loc>`), `sitemap lists /${page}`);
  for (const hidden of ['sobre.html', 'checkout.html', 'conta.html', 'admin.html']) assert(!sitemap.includes(hidden), `sitemap leaves out ${hidden}`);
  assert(sitemap.includes('/contato.html</loc>'), 'the contact page (with content now) is listed');
  for (const blocked of ['/admin.html', '/api/', '/checkout.html', '/conta.html']) assert(robots.includes(`Disallow: ${blocked}`), `robots keeps ${blocked} out`);
  assert(robots.includes(`Sitemap: ${BASE}/sitemap.xml`));
  const home = JSON.parse(/<script type="application\/ld\+json">([^<]*)<\/script>/.exec(read('dist/index.html'))[1]);
  assert.equal(home['@type'], 'Organization'); assert.equal(home.legalName, COMPANY.legalName);
  assert.match(read('server/create-server.cjs'), /'\.xml': 'application\/xml; charset=utf-8'/, 'the server sends the sitemap as XML');
}

console.log('PASS: product pages (title, canonical, price and Pix, original colors, actions, preview, product data), sitemap, robots and organization data.');
