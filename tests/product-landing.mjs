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
const {PRODUCTS, defaults, color, badgeStyle} = await site('products.js');
const {COMMERCE, money, pixPrice, kitOffer} = await site('commerce-config.js');
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
  assert(page.includes(`<link rel="canonical" href="${BASE}/${id}">`), `${id}: canonical address`);
  assert(page.includes(`<h1>${product.title}</h1>`), `${id}: the name as the page heading`);
  assert(page.includes(`<strong>${money(price).replace(/ /g, '&nbsp;')}</strong><span class="pl-pix">${money(pixPrice(price)).replace(/ /g, '&nbsp;')} no Pix</span>`), `${id}: price and Pix price`);
  for (const part of product.parts) assert(page.includes(`${part.name}: <strong>${color(defaults(id)[part.id]).name}</strong>`), `${id}: original color of ${part.id}`);
  // the lamps (07/10/2026): fixed colours — nothing to customize; the kit offer under the price
  const fixed = !product.parts.length;
  if (fixed) {
    assert(!page.includes('data-pl-customize') && !page.includes('id="pl-custom"'), `${id}: a lamp — nothing to customize`);
    assert(page.includes('<div class="pl-actions is-single"><button type="button" class="pl-add" data-add-product="' + id + '">') && page.includes('<span>Adicionar ao carrinho</span>'), `${id}: only "Adicionar ao carrinho"`);
    assert(page.includes(`<p class="pl-offer">${kitOffer(id)}</p>`), `${id}: the kit offer`);
    // 07/10/2026: right after the button, the place of "Monte seu kit" (hidden; product-landing.js mounts it with kit-builder.js)
    assert(page.includes(`<span>Adicionar ao carrinho</span></button></div>\n          <section class="pl-kit" data-pl-kit aria-labelledby="pl-kit-title" hidden><div class="pl-kit-head"><h2 id="pl-kit-title">Monte seu kit</h2><span class="pl-kit-mix">escolha os seus</span></div><div data-pl-kit-body></div></section>`), `${id}: the kit block after the button`);
  } else assert(!page.includes('data-pl-kit'), `${id}: no kit block for a piece without a kit`);
  if (fixed) {
    for (const c of product.colors) assert(page.includes(`<li><span class="pl-dot is-fixed" role="img" title="${c.name}" aria-label="${c.name}"><i style="--chip:${c.hex}" aria-hidden="true"></i></span></li>`), `${id}: the dot of ${c.name}`);
    assert(page.includes('nas cores dela. A produção começa'), `${id}: printed in its own colours`);
  } else assert(page.includes(`href="./#produto/${id}/personalizar"`), `${id}: "Personalizar o meu" opens the configurator`);
  assert(page.includes(`<button type="button" class="pl-add" data-add-product="${id}">`), `${id}: add in the original colors (mini-cart)`);
  assert(page.includes(`Produção em ${COMMERCE.productionLabel}`), `${id}: production time`);
  // hierarchy asked for on 2026-10-04: the piece, the category once (a badge above the name), name, price, colors, add
  // first, then "Personalizar o meu" (palette), accordions, and the description at the end
  // 08/10/2026 (visual 10): a piece with the "Novidade" badge (the lamps) shows it before the category, in the dialog's colours
  const category = product.badge ? '<span class="pl-badge">Oftalmologia</span>' : '<p class="pl-badge">Oftalmologia</p>';
  if (product.badge) assert(page.includes(`<p class="pl-badges"><span class="pl-badge is-badge" data-effect="${product.eyebrowEffect}" style="${badgeStyle(id)}">Novidade</span>${category}</p>`), `${id}: the Novidade badge`);
  else assert(!page.includes('is-badge'), `${id}: no badge`);
  const order = ['data-pl-stage', category, `<h1>${product.title}</h1>`, 'class="pl-price"', 'class="pl-add"', ...(fixed ? [] : ['data-pl-customize']), 'class="pl-facts"', 'class="pl-about"'].map(text => page.indexOf(text));
  assert(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), `${id}: order of the page ${order}`);
  assert.equal((page.match(/Oftalmologia|OFTALMOLOGIA/g) || []).length, (page.match(/"category":"Oftalmologia"/g) || []).length + 1, `${id}: the category shows once`);
  // 2026-10-05: the colors are dots on the top corner of the picture; the list and the note moved to "Sobre a peça"
  assert.match(page, /<ul class="pl-dots" data-pl-dots aria-label="Cores originais">/);
  assert(page.indexOf('class="pl-dots"') < page.indexOf('class="pl-info"'), `${id}: the dots are on the picture`);
  assert.doesNotMatch(page, /class="pl-colors"|valores ilustrativos/, `${id}: no colors block above the actions, no "valores ilustrativos"`);
  assert.match(page, /<section class="pl-about"><h2>Sobre a peça<\/h2><p class="pl-desc">(?:[^<]+|<a class="contact-mail" href="mailto:juimprimepramim@gmail\.com\?subject=[^"]+">entre em contato<\/a>)+<\/p><p class="pl-note"><span>(?:Cores originais|Cores da peça):<\/span> /);
  // 2026-10-06: "entre em contato" na descrição (hoje, só a do avião) abre o e-mail da Ju
  assert.equal(page.includes('class="contact-mail"'), product.description.includes('entre em contato'), `${id}: o link do e-mail onde a descrição diz "entre em contato"`);
  if (product.fixed) assert(page.includes(`<p class="pl-note"><span>Observação:</span> ${product.fixed}</p>`), `${id}: the fixed colors as a note in "Sobre a peça"`);
  if (!fixed) {
    assert.match(page, /<a class="pl-customize" href="[^"]+" data-pl-customize><svg[^>]*>[^]*?<\/svg><span>Personalizar o meu<\/span><\/a>/);
    assert(page.includes(read('dist/icons.js').match(/palette: '([^']+)'/)[1].slice(0, 60)), `${id}: the palette on "Personalizar o meu"`);
  }
  for (const part of product.parts) { const c = color(defaults(id)[part.id]).name; assert(page.includes(`<button type="button" class="pl-dot" data-pl-part="${part.id}" aria-controls="pl-custom" title="${part.name}: ${c}" aria-label="${part.name}: ${c}">`), `${id}: the dot of ${part.id} opens the picker`); }
  assert.deepEqual([...page.matchAll(/<details class="pl-acc"><summary><svg[^]*?<strong>([^<]+)<\/strong>/g)].map(m => m[1]), ['Feito sob encomenda', 'Envio para todo o Brasil', 'Trocas e Devoluções']);
  assert.match(page, /Desistência em até 7 dias[^]*<a href="trocas">Ver a política<\/a>/);
  if (!fixed) assert.match(page, /<div class="pl-custom" id="pl-custom" data-pl-custom hidden><\/div>/);
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
  assert.equal(data.offers.url, `${BASE}/${id}`);
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
  // the lamps: "Monte seu kit" shows (and the kit sentence under the price steps aside), and the kit goes in with one write
  assert.match(code, /kitHost\.hidden = false;\n      const offer = q\('\.pl-offer'\); if \(offer\) offer\.hidden = true;\n      add\.closest\('\.pl-actions'\)\.hidden = true;/, 'one purchase action: with the kit on screen, the one-unit button steps aside (visual 1)');
  // the badge: the dialog's construction (the gradient over white letters in darken, moving by transform only), still with reduced motion
  assert.match(css, /\.pl-badge\.is-badge::before \{[^}]*width: 400%; background: var\(--badge-ink\) 0 0 \/ 50% 100% repeat-x; mix-blend-mode: darken; animation: pl-badge-flow 4s linear 2;/);
  assert(css.includes('@keyframes pl-badge-flow { to { transform: translateX(-50%); } }') && css.includes('@media (prefers-reduced-motion: reduce) { .pl-badge.is-badge::before { animation: none; }'));
  // 320 px (usabilidade 8): the two buttons of a customizable piece wrap instead of running off the screen
  assert(css.includes('@media (max-width: 360px) { .pl-add, .pl-customize { flex-basis: 100%; min-width: 0; padding: 0 14px; white-space: normal;'));
  assert.match(code, /openMiniCart\(\{itemIds: lines\.map\(line => addedItemId\(cart, line\.productId, \{\}\)\)\.filter\(Boolean\), original: true, riseFrom: before\}\);/);
  assert.match(css, /\.pl \.kit \{ --kit-accent: var\(--pl-accent\);/, 'the kit wears the page colors');
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
  // the dots follow the colors chosen (3D) and show the original ones on the photo; the floating cart while the header is away
  assert.match(code, /const shown = view === '3d' \? selection : original;/);
  assert.match(code, /class="pl-fab" data-pl-fab aria-label="Adicionar ao carrinho"/);
  assert.match(css, /\.pl\.show-fab \.pl-fab \{ opacity: 1; transform: none; pointer-events: auto; \}/);
  assert.match(code, /root\.classList\.toggle\('show-fab', add\.getBoundingClientRect\(\)\.bottom < TOP \+ height \+ GAP/, 'the cart on the piece only while the main add button is covered');
  assert.match(code, /stage\.insertAdjacentHTML\('beforeend', `<button type="button" class="pl-fab"/, 'it lives on the piece and leaves with it');
  assert.match(css, /\.pl-dots \{ position: absolute; top: 18px; left: 18px; z-index: 3; display: grid; gap: 9px; margin: 0; padding: 0; list-style: none; \}/, 'dots on the background, no box around them');
  for (const text of ['Ver a peça', 'Girar em 360°', 'Arraste para girar', 'Preparando sua prévia 3D…', 'A prévia 3D não abriu neste navegador; a foto mostra as cores originais.', 'Escolha a cor de cada parte', 'Partes da peça', 'Restaurar cores', 'Suas cores', 'Adicionar com estas cores', 'Adicionado', 'Cores originais restauradas para este produto.', 'Desistência em até 7 dias']) {
    assert(code.includes(text) || read(`dist/${Object.keys(PRODUCTS)[0]}.html`).includes(text), `${text}: used`);
    assert.notEqual(translate(text, 'en'), text, `${text}: EN`); assert.notEqual(translate(text, 'es'), text, `${text}: ES`);
  }
}

// ── sitemap, robots and the home's organization data ──────────────────
{
  const sitemap = read('dist/sitemap.xml'), robots = read('dist/robots.txt');
  // endereços limpos (09/10/2026): o sitemap leva /produtos, /borboletoscopio…, sem ".html"
  for (const page of ['', 'produtos', ...Object.keys(PRODUCTS), 'termos', 'privacidade', 'trocas'])
    assert(sitemap.includes(`<loc>${BASE}/${page}</loc>`), `sitemap lists /${page}`);
  for (const hidden of ['/sobre<', '/checkout<', '/conta<', '/admin', '.html']) assert(!sitemap.includes(hidden), `sitemap leaves out ${hidden}`);
  assert(sitemap.includes('/contato</loc>'), 'the contact page (with content now) is listed');
  for (const blocked of ['/admin', '/api/', '/checkout', '/comprar-agora', '/conta$', '/conta?', '/conta.html']) assert(robots.includes(`Disallow: ${blocked}\n`), `robots keeps ${blocked} out`);
  // "/conta" sem o $ tiraria também /contato do Google (a regra vale pelo começo do endereço)
  assert(!robots.includes('Disallow: /conta\n') && !robots.includes('Disallow: /contato'), 'the contact page stays searchable');
  assert(robots.includes(`Sitemap: ${BASE}/sitemap.xml`));
  const home = JSON.parse(/<script type="application\/ld\+json">([^<]*)<\/script>/.exec(read('dist/index.html'))[1]);
  assert.equal(home['@type'], 'Organization'); assert.equal(home.legalName, COMPANY.legalName);
  // o logo para o Google (09/10/2026): só a escrita em fundo transparente, PNG quadrado de 1024 px (mín. 112 px), bom sobre branco
  assert.equal(home.logo, `${BASE}/assets/logo-ju-transparente.png`, 'Organization.logo: the transparent logo');
  const {decode} = require('../tools/png-codec.cjs');
  const logo = decode(fs.readFileSync(path.join(root, 'dist/assets/logo-ju-transparente.png')));
  assert.deepEqual([logo.width, logo.height], [1024, 1024], 'the logo: square, 1024 px');
  const alpha = i => logo.rgba[i * 4 + 3], n = logo.width * logo.height;
  assert.equal(alpha(0) + alpha(logo.width - 1) + alpha(n - logo.width) + alpha(n - 1), 0, 'the logo: transparent corners (no cream square)');
  // sem o círculo rosa: no recorte de trabalho (design/logo, o quadro do logo original) a metade de cima do círculo, onde ele passava
  // sozinho (centro 50%, 48,5%; raio 36,3% do lado), fica vazia
  const master = decode(fs.readFileSync(path.join(root, 'design/logo/logo-ju-transparente.png')));
  let ring = 0, inked = 0;
  for (let k = 0; k < 1440; k++) {
    const a = k / 1440 * 2 * Math.PI; if (Math.sin(a) > -0.15) continue;
    const x = Math.round(master.width * (0.5005 + 0.3632 * Math.cos(a))), y = Math.round(master.height * (0.4849 + 0.3632 * Math.sin(a)));
    ring++; if (master.rgba[(y * master.width + x) * 4 + 3] > 32) inked++;
  }
  assert(inked / ring < 0.01, `the logo: no round frame (${inked}/${ring} points of the old circle still inked)`);
  const webp = fs.readFileSync(path.join(root, 'dist/assets/logo-ju-transparente.webp'));
  assert.equal(webp.toString('latin1', 8, 15), 'WEBPVP8', 'and its WebP');
  assert.match(read('server/create-server.cjs'), /'\.xml': 'application\/xml; charset=utf-8'/, 'the server sends the sitemap as XML');
}

console.log('PASS: product pages (title, canonical, price and Pix, original colors, actions, preview, product data), sitemap, robots and organization data.');
