// Vitrine de novidade das lâmpadas de fenda (fenda.html e o banner dela na home; marcação em dist/fenda-stage.js, gravada por
// tools/build-product-pages.cjs; movimento em dist/fenda.js) e o flyer (tools/flyer-fenda/). Run: node tests/fenda.mjs — no network,
// no browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const site = file => import(pathToFileURL(path.join(root, 'dist', file)).href);
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const {COMPANY} = require('../api/_lib/legal');
const {PRODUCTS, FAMILIES, badgeStyle} = await site('products.js');
const {COMMERCE, money, pixPrice, kitOffer} = await site('commerce-config.js');
const {noveltyItems, noveltyStage, noveltyBanner} = await site('fenda-stage.js');
const BASE = COMPANY.website.replace(/\/+$/, '');
const page = read('dist/fenda.html'), home = read('dist/index.html'), js = read('dist/fenda.js'), css = read('dist/fenda.css');

// As peças: as da família das lâmpadas que estão à venda, na ordem dela; peça nova da família entra sozinha.
const items = noveltyItems('lampada');
assert.deepEqual(items, FAMILIES.lampada.items.filter(key => PRODUCTS[key]));
assert(items.length >= 3, 'the three lamps');

// O palco, gravado na página como fenda-stage.js o desenha.
assert(page.includes(noveltyStage('lampada')), 'fenda.html carries the stage from fenda-stage.js (run node tools/build-product-pages.cjs)');
for (const [i, key] of items.entries()) {
  const p = PRODUCTS[key], price = COMMERCE.prices[key];
  assert(page.includes(`data-nv-item="${i}" data-nv-key="${key}"`), `${key}: on the stage`);
  assert(page.includes(`data-nv-layer="${i}"`), `${key}: its own background layer (the home's gradient and silhouettes)`);
  assert(new RegExp(`<h2 class="nv-name">${p.title}</h2>`).test(page), `${key}: the big name`);
  assert(page.includes(`<a class="nv-more" href="${key}.html" data-nv-more`), `${key}: "Ver mais" (the piece's page without JavaScript)`);
  assert(page.includes(money(price).replace(/ /g, '&nbsp;')) && page.includes(`${money(pixPrice(price)).replace(/ /g, '&nbsp;')} no Pix`), `${key}: price and Pix price`);
  for (const c of p.colors) assert(page.includes(`<li style="--swatch:${c.hex}"><i aria-hidden="true"></i><span>${c.name}</span></li>`), `${key}: color tab ${c.name}`);
  assert(page.includes(`href="index.html#produto/${key}/encaixe"`) && page.includes(`<a href="${key}.html">`), `${key}: see it fitted, see its page`);
}
assert.equal((page.match(/class="fit-figure"/g) || []).length, items.length, 'each piece fitted on the lamp (escolha.js › fitFigure)');
assert(page.includes(`style="${badgeStyle(items[0]).replace(/"/g, '&quot;')}"`) && page.includes('data-nv-badge'), 'the "Novidade" badge of the piece in front');
assert(page.includes('<div data-nv-kit></div>') && js.includes("import {mountKit} from './kit-builder.js';"), '"Monte seu kit" inside "Ver mais"');
assert.equal((page.match(/<h1\b/g) || []).length, 1, 'one heading for the page');

// A página: as folhas do site e o script dela, endereço curto, prévia de link própria, no sitemap.
for (const sheet of ['carousel.css', 'escolha.css', 'product-landing.css', 'fenda.css']) assert(page.includes(`<link rel="stylesheet" href="${sheet}">`), sheet);
assert(page.includes('<script type="module" src="fenda.js"></script>'));
assert(page.includes(`<link rel="canonical" href="${BASE}/fenda.html">`) && page.includes(`<meta property="og:url" content="${BASE}/fenda.html">`), 'its address');
assert(page.includes(`<meta property="og:image" content="${BASE}/assets/og-fenda.jpg">`) && fs.existsSync(path.join(root, 'dist/assets/og-fenda.jpg')), 'link preview image');
assert(read('dist/sitemap.xml').includes(`<loc>${BASE}/fenda.html</loc>`), 'listed for search engines');
assert(page.includes(kitOffer(items[0])), 'the kit offer below the stage');
const share = new URL(page.match(/<a class="nv-share" href="([^"]+)"/)[1].replace(/&amp;/g, '&'));
assert.equal(share.origin + share.pathname, 'https://wa.me/', '"Enviar a um colega" opens WhatsApp to pick a contact');
assert(share.searchParams.get('text').endsWith(` ${BASE}/fenda`), 'the message carries the short link (server/create-server.cjs opens /fenda as fenda.html)');
assert(/<a class="nv-ju" href="contato.html" data-nv-ju>/.test(page) && /wa\.me\/\$\{number\}/.test(js), '"Falar com a Ju": WhatsApp with the shop number, the contact page without it');

// O movimento: setas, teclado, arrastar, "Ver mais" e "Voltar", o fundo e o tema de cada peça, link direto para uma peça.
assert(js.includes("'ArrowRight'") && js.includes("'Escape'") && js.includes('pointerdown'), 'arrows, keyboard and swipe');
assert(js.includes("history.replaceState(null, '', `#${keys[active]}`)") && js.includes('fromHash()'), 'fenda#<piece> opens on that piece');
assert(js.includes('window.juTheme?.save(key, journeyColors(theme))'), 'the piece colors carry on to the next pages, as on the home');
assert(!/abs\(/.test(css), 'no CSS abs() (not in every browser): fenda.js writes the distance (--k)');
assert(/\.nv-stage > \.nv-arrow \{ position: absolute;/.test(css), 'the glass arrows stay put on phones (carousel.css moves .hero-arrow into its grid)');
assert(/prefers-reduced-motion: reduce/.test(css));

// O banner da home, entre a vitrine e "Nossa coleção", gravado como fenda-stage.js o desenha.
assert(home.includes(`<!-- novidade -->${noveltyBanner('lampada')}<!-- /novidade -->`), 'home banner (run node tools/build-product-pages.cjs)');
assert(home.indexOf('<!-- novidade -->') < home.indexOf('class="catalog catalog-home"'), 'between the showcase and the collection');
assert(/<a class="nvb-link" href="fenda.html"/.test(home) && (home.match(/class="nvb-piece/g) || []).length === Math.min(3, items.length), 'the three pieces, the whole card is the link');
assert(/loading="lazy"/.test(noveltyBanner('lampada')), 'below the first screen: lazy pictures');
assert(read('dist/catalog.css').includes('.nvb-badge::before'), 'its styles ride on catalog.css (no new stylesheet on the home)');

// O flyer: as peças e os preços do site, o endereço curto.
const flyer = read('tools/flyer-fenda/flyer.html');
assert(flyer.includes("import {fitFigure} from './escolha.js';") && flyer.includes('FAMILIES.lampada.items') && flyer.includes("'https://juimprimepramim.com.br/fenda'"));
assert(read('tools/flyer-fenda/render.cjs').includes('/fenda`'));

console.log('PASS: slit lamp novelty showcase — the family pieces on a stage (fitted figure, background, badge, price, color tabs, kit), its page (short address, preview, sitemap, WhatsApp), the movement, the home banner and the flyer.');
