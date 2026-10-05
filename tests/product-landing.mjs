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
  // hierarchy asked for on 2026-10-04: the piece, the category once (a badge above the name), name, price, colors, add
  // first, then "Personalizar o meu" (palette), accordions, and the description at the end
  const order = ['data-pl-stage', '<p class="pl-badge">Oftalmologia</p>', `<h1>${product.title}</h1>`, 'class="pl-price"', 'class="pl-colors"', 'class="pl-add"', 'data-pl-customize', 'class="pl-facts"', 'class="pl-about"'].map(text => page.indexOf(text));
  assert(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), `${id}: order of the page ${order}`);
  assert.equal((page.match(/Oftalmologia|OFTALMOLOGIA/g) || []).length, (page.match(/"category":"Oftalmologia"/g) || []).length + 1, `${id}: the category shows once`);
  assert.equal((page.match(/Cores originais/g) || []).length, 1, `${id}: one "Cores originais"`);
  assert.match(page, /<a class="pl-customize" href="[^"]+" data-pl-customize><svg[^>]*>[^]*?<\/svg><span>Personalizar o meu<\/span><\/a>/);
  assert(page.includes(read('dist/icons.js').match(/palette: '([^']+)'/)[1].slice(0, 60)), `${id}: the palette on "Personalizar o meu"`);
  for (const part of product.parts) assert(page.includes(`<button type="button" class="pl-chip" data-pl-part="${part.id}" aria-controls="pl-custom">`), `${id}: the color of ${part.id} opens the picker`);
  assert.deepEqual([...page.matchAll(/<details class="pl-acc"><summary><svg[^]*?<strong>([^<]+)<\/strong>/g)].map(m => m[1]), ['Feito sob encomenda', 'Envio para todo o Brasil', 'Trocas e Devoluções']);
  assert.match(page, /Desistência em até 7 dias[^]*<a href="trocas\.html">Ver a política<\/a>/);
  assert.match(page, /<div class="pl-custom" id="pl-custom" data-pl-custom hidden><\/div>/);
  assert.match(page, /<div class="pl-views" role="group" aria-label="Ver a peça" data-pl-views hidden>/, 'the photo / 3D switch only shows with the script');
  // the 3D model needs three.js by name: the home's import map (its hash is in the security policy) before any module
  const map = '<script type="importmap">{"imports":{"three":"./vendor/three.module.min.js"}}</script>';
  assert(page.includes(map) && page.indexOf(map) < page.indexOf('<script type="module"'), `${id}: import map first`);
  assert.match(page, /<script type="module" src="product-landing\.js"><\/script>/);
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

// ── product-landing.js: the 3D model, the colors on the page and the cart with the chosen colors ──
{
  const code = read('dist/product-landing.js'), css = read('dist/product-landing.css'), policy = read('vercel.json');
  const {translate} = await site('i18n-core.js');
  assert.match(policy, /'sha256-6p13ug9Y\/2TWPZMF0aIT0xv2TqxNkp62hhuZFDN2uAM='/, 'the import map is allowed by the policy');
  assert.match(code, /viewerImport \?\?= import\('\.\/viewer\.js'\)/, 'the same 3D viewer as the configurator, loaded only when asked');
  assert.match(code, /v\.controls\.enableZoom = false;/, 'the mouse wheel keeps scrolling the page');
  assert.match(code, /v\.renderer\.domElement\.style\.touchAction = 'pan-y';/, 'on the phone a vertical drag scrolls the page');
  assert.match(code, /add\.removeAttribute\('data-add-product'\);/, 'from here on the page adds the chosen colors (not catalog.js)');
  assert.match(code, /writeCart\(putItem\(readCart\(\), key, chosen, thumbnail\)\)/);
  assert.match(code, /openMiniCart\(\{itemId: addedItemId\(cart, key, chosen\), original: plain\}\)/);
  assert.match(code, /new IntersectionObserver\(\(\[entry\]\) => \{ onScreen = entry\.isIntersecting;/, 'the spin stops off screen');
  assert.match(css, /\.pl-add\.is-added \.pl-check path \{ animation: pl-draw/, 'the check draws itself');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  // 2026-10-05: on the phone, while choosing colors, the header stays away (focus on the piece) and the end of the palette
  // pushes the piece up with the scroll; the active "Personalizar o meu" paints itself and shows the × that closes
  assert.match(code, /document\.documentElement\.classList\.toggle\('pl-focus', push < height\);/);
  assert.match(code, /holder\.style\.transform = push > 0 \? `translate3d\(0, \$\{-push\}px, 0\)` : '';/);
  assert.match(css, /html\.pl-focus \.header\.site-header\.is-floating, html\.pl-focus \.header\.site-header\.is-floating\.is-revealed \{ translate: 0 -110%;/);
  assert.match(css, /\.pl-customize\[aria-expanded="true"\]::before \{ clip-path: inset\(0 0 0 0\); animation: pl-flow/);
  assert.match(css, /\.pl-customize::before \{ content: ''; /);
  assert.match(code, /<i class="pl-customize-x" aria-hidden="true"><\/i>/);
  for (const text of ['Ver a peça', 'Girar em 360°', 'Arraste para girar', 'Preparando sua prévia 3D…', 'A prévia 3D não abriu neste navegador; a foto mostra as cores originais.', 'Escolha a cor de cada parte', 'Partes da peça', 'Restaurar cores', 'Suas cores', 'Adicionar com estas cores', 'Adicionado', 'Cores originais restauradas para este produto.', 'Desistência em até 7 dias']) {
    assert(code.includes(text) || read(`dist/${Object.keys(PRODUCTS)[0]}.html`).includes(text), `${text}: used`);
    assert.notEqual(translate(text, 'en'), text, `${text}: EN`); assert.notEqual(translate(text, 'es'), text, `${text}: ES`);
  }
}

// ── sitemap, robots and the home's organization data ──────────────────
{
  const sitemap = read('dist/sitemap.xml'), robots = read('dist/robots.txt');
  for (const page of ['', 'produtos.html', ...Object.keys(PRODUCTS).map(id => `${id}.html`), 'termos.html', 'privacidade.html', 'trocas.html'])
    assert(sitemap.includes(`<loc>${BASE}/${page}</loc>`), `sitemap lists /${page}`);
  for (const hidden of ['sobre.html', 'contato.html', 'checkout.html', 'conta.html', 'admin.html']) assert(!sitemap.includes(hidden), `sitemap leaves out ${hidden}`);
  for (const blocked of ['/admin.html', '/api/', '/checkout.html', '/conta.html']) assert(robots.includes(`Disallow: ${blocked}`), `robots keeps ${blocked} out`);
  assert(robots.includes(`Sitemap: ${BASE}/sitemap.xml`));
  const home = JSON.parse(/<script type="application\/ld\+json">([^<]*)<\/script>/.exec(read('dist/index.html'))[1]);
  assert.equal(home['@type'], 'Organization'); assert.equal(home.legalName, COMPANY.legalName);
  assert.match(read('server/create-server.cjs'), /'\.xml': 'application\/xml; charset=utf-8'/, 'the server sends the sitemap as XML');
}

console.log('PASS: product pages (title, canonical, price and Pix, original colors, actions, preview, product data), sitemap, robots and organization data.');
