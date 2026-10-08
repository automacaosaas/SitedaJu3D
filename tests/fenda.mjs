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
const {noveltyItems, noveltyStage, noveltyOffers, noveltyBanner} = await site('fenda-stage.js');
const {kitTiers} = await site('kit-builder.js');
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
  assert(page.includes(`<a class="nv-more" href="${key}.html" data-nv-more`), `${key}: "Ver detalhes" (the piece's page without JavaScript)`);
  assert.equal((page.match(new RegExp(`data-nv-buy="${key}"`, 'g')) || []).length, 2, `${key}: "Comprar" under the name and "Comprar agora" in the details, straight to the purchase`);
  assert(page.includes(`data-add-product="${key}" aria-label="Adicionar ${p.title} ao carrinho"`), `${key}: "Adicionar ao carrinho" (catalog.js)`);
  assert(page.includes(money(price).replace(/ /g, '&nbsp;')) && page.includes(`${money(pixPrice(price)).replace(/ /g, '&nbsp;')} no Pix`), `${key}: price and Pix price`);
  for (const c of p.colors) assert(page.includes(`<li style="--swatch:${c.hex}"><i aria-hidden="true"></i><span>${c.name}</span></li>`), `${key}: color tab ${c.name}`);
  assert(page.includes(`href="index.html#produto/${key}/encaixe"`) && page.includes(`<a href="${key}.html">`), `${key}: see it fitted, see its page`);
}
assert.equal((page.match(/class="fit-figure nv-fig"/g) || []).length, items.length, 'each piece fitted on the whole lamp (escolha.js › fitFigure)');
assert(/--fig-h:[\d.]+/.test(page), 'the figure keeps the whole lamp in proportion (fenda-stage.js › figureHeight)');
assert(page.includes(`style="${badgeStyle(items[0]).replace(/"/g, '&quot;')}"`) && page.includes('data-nv-badge'), 'the "Novidade" badge of the piece in front');
// As ofertas, que entram ao rolar: um cartão por faixa nas cores das peças, o kit e a compra dele.
const tiers = kitTiers(items[0]);
assert(page.includes(noveltyOffers('lampada')) && page.indexOf('id="ofertas"') > page.indexOf('<section class="nv-stage"'), 'offers below the stage (fenda-stage.js › noveltyOffers)');
assert(tiers.length >= 3 && (page.match(/<article class="nv-tier\b/g) || []).length === tiers.length, 'one card per tier');
for (const {units} of tiers) assert(page.includes(`data-nv-tier="${units}" aria-pressed="false"`), `card for ${units}`);
assert(page.includes('data-nv-tiers-step="-1"') && page.includes('data-nv-tiers-step="1"') && /class="nv-tiers-dots"/.test(page), 'arrows and dots for the row of cards on phones');
assert(/let units = Number\(document\.querySelector\('\.nv-tier\.is-best \[data-nv-tier\]'\)/.test(js) && js.includes("classList.toggle('is-picked', on)"), 'the kit comes with the best value tier, its card marked');
assert(page.includes('class="nv-tier is-best"') && page.includes('--tier-stops:'), 'each card in its piece colors, the best one marked');
assert(page.includes('<div data-nv-kit></div>') && js.includes("import {mountKit, kitPreset} from './kit-builder.js';"), '"Monte seu kit" below the cards');
assert(page.includes('data-nv-kit-buy hidden') && page.includes('data-nv-kit-fallback'), 'the kit goes straight to the purchase; without JavaScript, links to the pieces');
assert(js.includes("sessionStorage.setItem(DIRECT_KEY, JSON.stringify(lines)); location.assign('comprar-agora.html');"), '"Comprar" goes to the purchase like the piece page\'s "Comprar agora"');
assert(/data-nv-reveal/.test(page) && js.includes('IntersectionObserver'), 'offers come in on scroll');
assert(!/nv-ju|Falar com a Ju/.test(page + js), 'no "talk to Ju": the price is on the page, the page leads to the purchase');
assert.equal((page.match(/<h1\b/g) || []).length, 1, 'one heading for the page');

// A página: as folhas do site e o script dela, endereço curto, prévia de link própria, no sitemap.
for (const sheet of ['carousel.css', 'escolha.css', 'product-landing.css', 'fenda.css']) assert(page.includes(`<link rel="stylesheet" href="${sheet}">`), sheet);
assert(page.includes('<script type="module" src="fenda.js"></script>'));
assert(page.includes(`<link rel="canonical" href="${BASE}/fenda.html">`) && page.includes(`<meta property="og:url" content="${BASE}/fenda.html">`), 'its address');
assert(page.includes(`<meta property="og:image" content="${BASE}/assets/og-fenda.jpg">`) && fs.existsSync(path.join(root, 'dist/assets/og-fenda.jpg')), 'link preview image');
assert(read('dist/sitemap.xml').includes(`<loc>${BASE}/fenda.html</loc>`), 'listed for search engines');
assert(page.includes(kitOffer(items[0])), 'the kit offer below the stage');
assert(page.indexOf('class="nv-share"') > page.indexOf('id="ofertas"'), 'the WhatsApp invite, discreet, at the bottom');
assert(page.includes('<a class="nv-return" href="index.html#novidade" data-nv-return>') && page.indexOf('data-nv-return') < page.indexOf('<section class="nv-stage"'), '"Voltar" above the stage: back to the home banner');
assert(js.includes('history.back()') && js.includes("import {localDestination} from './shopping-navigation.js';"), '"Voltar" returns to the page the person came from, at the same height');
const share = new URL(page.match(/<a class="nv-share" href="([^"]+)"/)[1].replace(/&amp;/g, '&'));
assert.equal(share.origin + share.pathname, 'https://wa.me/', '"Enviar a um colega" opens WhatsApp to pick a contact');
assert(share.searchParams.get('text').endsWith(` ${BASE}/fenda`), 'the message carries the short link (server/create-server.cjs opens /fenda as fenda.html)');

// O movimento: setas, teclado, arrastar, "Ver mais" e "Voltar", o fundo e o tema de cada peça, link direto para uma peça.
assert(js.includes("'ArrowRight'") && js.includes("'Escape'") && js.includes('pointerdown'), 'arrows, keyboard and swipe');
assert(js.includes("history.replaceState(null, '', `#${keys[active]}`)") && js.includes('fromHash()'), 'fenda#<piece> opens on that piece');
assert(js.includes('window.juTheme?.save(key, journeyColors(theme))'), 'the piece colors carry on to the next pages, as on the home');
assert(!/abs\(/.test(css), 'no CSS abs() (not in every browser): fenda.js writes the distance (--k)');
assert(/\.nv-stage > \.nv-arrow \{ position: absolute;/.test(css), 'the glass arrows stay put (carousel.css moves .hero-arrow into its grid on phones)');
assert(!/(^|[^-])filter: *blur/m.test(css), 'the neighbors are sharp, side by side (only the glass buttons blur what is behind them)');
assert(/prefers-reduced-motion: reduce/.test(css));

// O banner da home, entre a vitrine e "Nossa coleção", gravado como fenda-stage.js o desenha.
assert(home.includes(`<!-- novidade -->${noveltyBanner('lampada')}<!-- /novidade -->`), 'home banner (run node tools/build-product-pages.cjs)');
assert(home.indexOf('<!-- novidade -->') < home.indexOf('class="catalog catalog-home"'), 'between the showcase and the collection');
assert(home.includes('<section class="nvb" id="novidade"') && (home.match(/class="nvb-pick/g) || []).length === Math.min(3, items.length), 'the three pieces; index.html#novidade comes back here');
for (const key of items.slice(0, 3)) assert(home.includes(`<a href="fenda.html#${key}">`), `${key}: opens the showcase on it`);
assert(home.includes('<a class="nvb-cta" href="fenda.html#ofertas">') && /<li class="is-best"><b>3<\/b>/.test(home), 'the best tier marked and the invite straight to the offers');
assert(/--nvb-a:#[0-9a-f]{6};--nvb-b:#[0-9a-f]{6};--nvb-c:#[0-9a-f]{6}/.test(home), 'the band blends the three pieces\' palettes');
assert(/\.nvb::before\{[^}]*mask-image:linear-gradient\(to bottom,transparent/.test(read('dist/catalog.css')), 'the band fades into the showcase above and the collection below');
assert(/animation-timeline: *view\(\)/.test(read('dist/catalog.css')), 'the pieces come in from the sides on scroll (where the browser supports it)');
assert(/loading="lazy"/.test(noveltyBanner('lampada')), 'below the first screen: lazy pictures');
assert(read('dist/catalog.css').includes('.nvb-badge::before'), 'its styles ride on catalog.css (no new stylesheet on the home)');

// O flyer: as peças e os preços do site, o endereço curto.
const flyer = read('tools/flyer-fenda/flyer.html');
assert(flyer.includes("import {fitFigure} from './escolha.js';") && flyer.includes('FAMILIES.lampada.items') && flyer.includes("'https://juimprimepramim.com.br/fenda'"));
assert(read('tools/flyer-fenda/render.cjs').includes('/fenda`'));

console.log('PASS: slit lamp novelty showcase — the family pieces on a stage (whole lamp, background, badge, price, color tabs, buy now), the offers (tier cards, kit, buy now), its page (short address, preview, sitemap, discreet WhatsApp), the movement, the home banner and the flyer.');
