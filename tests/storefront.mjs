// Storefront checks from the audit (Auditoria da Vitrine Ju): the static copy of the product cards in produtos.html must
// show what the script would draw (the colors of the default combination, the price and the Pix price), so nobody sees
// one pattern on the card and gets another in the cart. Run: node tests/storefront.mjs — no network, no browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = file => import(pathToFileURL(path.join(root, 'dist', file)).href);
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const {PRODUCTS, SOON, defaults, color} = await site('products.js');
const {COMMERCE, money, pixPrice} = await site('commerce-config.js');
const {icon} = await site('icons.js');
const html = string => string.replace(/ /g, '&nbsp;');

// ── B1, B2, B5: the Produtos grid (pre-rendered) = the default combination, price, Pix and production time ──
{
  const page = read('dist/produtos.html');
  assert.match(page, /<div class="product-grid" data-product-grid data-category="oftalmologia" aria-label="Produtos de oftalmologia"><!-- grid -->/, 'a grid instead of the carousel (audit B2)');
  assert.doesNotMatch(page, /data-product-carousel/);
  const chunks = page.split('<article class="product-grid-card').slice(1), cards = chunks.filter(c => c.startsWith('"')), soonCards = chunks.filter(c => c.startsWith(' is-soon"')).map(c => c.slice(0, c.indexOf('</article>')));
  // the novelty (SOON): photo, name, "Em breve" and "Ver encaixado", which opens its demonstration in the showcase; no price, cart or page
  assert.equal(soonCards.length, Object.keys(SOON).length, 'one card per novelty, after the products');
  for (const card of soonCards) {
    const id = /data-product-id="([a-z]+)"/.exec(card)?.[1], demo = `./#produto/${id}/encaixe`;
    assert(id && SOON[id], `novelty card for a known novelty: ${id}`);
    assert(card.includes(`<h2><a href="${demo}">${SOON[id].title}</a></h2>`) && card.includes(`<p class="product-grid-sub">${SOON[id].subtitle}</p>`), `${id}: name and subtitle`);
    assert(card.includes('<span class="product-soon">Em breve</span>') && card.includes(`<a class="product-customize product-see-fit" href="${demo}">`) && card.includes('<span>Ver encaixado</span>'), `${id}: "Em breve" and "Ver encaixado"`);
    assert(card.includes(`<a class="product-see-3d" href="./#produto/${id}/3d">`) && card.includes('<span>Ver em 3D</span>'), `${id}: "Ver em 3D" opens the piece to turn around`);
    assert(!/R\$|no Pix|data-add-product|personalizar|\.html"/.test(card.replace(/index\.html#/g, '#')), `${id}: no price, cart, customization or page of its own`);
    for (const name of [`card-${id}.webp`, `card-preview-${id}.webp`]) assert(fs.existsSync(path.join(root, 'dist/assets', name)), name);
  }
  const catalog = read('dist/catalog.js'), banner = read('dist/carousel.js');
  assert(/const entries = \[\.\.\.Object\.entries\(PRODUCTS\), \.\.\.Object\.entries\(SOON\)\]/.test(catalog) && /if \(product\.soon\) return soonCard\(\{id, product\}\);/.test(catalog), 'the collection carousel shows the novelties after the products');
  assert(/<span class="product-soon">Em breve<\/span>[^`]*<a class="product-customize product-see-fit" href="\$\{href\}">\$\{icon\('play'\)\}<span>Ver encaixado<\/span><\/a>/.test(catalog) && !/function soonCard[^}]*data-add-product/.test(catalog), 'carousel novelty card: "Em breve" and "Ver encaixado", no cart');
  assert(catalog.includes("<a class=\"product-see-3d\" href=\"${productHref(id)}/3d\">${icon('cube')}<span>Ver em 3D</span></a>") && banner.includes('${soon ? `<a class="palette-button" href="#produto/${key}/3d" data-role="palette">'), '"Ver em 3D" on the collection card and as the main action of the novelty in the showcase');
  assert(/if \(step !== 'encaixe' \|\| index < 0\) return;/.test(banner) && /history\.replaceState\(null, '', `#produto\/\$\{keys\[index\]\}`\)/.test(banner) && /demoFromRoute\(\);   \/\/ chegou da página Produtos/.test(banner), '#produto/<piece>/encaixe opens the demonstration and the address goes back to normal');
  assert.equal(cards.length, Object.keys(PRODUCTS).length, 'one pre-rendered card per product');
  for (const card of cards) {
    const id = /data-product-id="([a-z]+)"/.exec(card)?.[1];
    assert(id && PRODUCTS[id], `card for a known product: ${id}`);
    const swatches = [...card.matchAll(/<i style="--swatch:(#[0-9a-f]{6})" title="([^"]+)"><\/i>/g)].map(m => [m[1], m[2]]);
    // the lamps (fixed colours, 07/10/2026): their own colours
    const expected = PRODUCTS[id].parts.length ? Object.values(defaults(id)).map(c => [color(c).hex, color(c).name]) : PRODUCTS[id].colors.map(c => [c.hex, c.name]);
    assert.deepEqual(swatches, expected, `${id}: the dots show the default colors`);
    assert(card.includes(`<strong>${money(COMMERCE.prices[id])}</strong>`), `${id}: price`);
    assert(card.includes(`${money(pixPrice(COMMERCE.prices[id]))} no Pix`), `${id}: Pix price`);
    assert(card.includes(`<h2><a href="${id}">${PRODUCTS[id].title}</a></h2>`), `${id}: the name links to the product's own page`);
    assert(card.includes(`${icon('clock')}<span><span class="sr-only">Produção em </span>${COMMERCE.productionLabel}</span>`), `${id}: the clock and the production time on the card (audit B5; 2026-10-05: no "Feito sob encomenda")`);
    assert.doesNotMatch(card, /Preço ilustrativo/, `${id}: no "Preço ilustrativo" (2026-10-05)`);
    assert(PRODUCTS[id].parts.length ? card.includes(`href="./#produto/${id}/personalizar">Personalizar o meu</a>`) : card.includes(`<a class="product-customize" href="${id}">Ver a peça</a>`) && !card.includes('personalizar'), `${id}: customize (a lamp: its page, nothing to customize)`);
    assert(card.includes(`data-add-product="${id}"`), `${id}: quick add (mini-cart)`);
  }
  // the card art of the dinosaur is the moss-green default (the old one was sky blue); every card image exists
  for (const id of Object.keys(PRODUCTS)) for (const name of [`card-${id}.webp`, `card-preview-${id}.webp`]) assert(fs.existsSync(path.join(root, 'dist/assets', name)), name);
}

// ── E2 and E4: the cart without checkboxes, one way back ──────────────
{
  const {renderCart} = await site('cart-view.js');
  const {normalizeCart} = await site('cart-store.js');
  const cart = normalizeCart([{productId: 'borboletoscopio', quantity: 2}, {productId: 'aviaoscopia', quantity: 1}]);
  const page = renderCart(cart, {});
  assert.doesNotMatch(page, /type="checkbox"|select-all|remove-selected|Selecionar/, 'no checkboxes: every piece in the cart is bought');
  assert.match(page, /<p class="cart-selection-note">3 peças<\/p>/);
  assert.match(page, /<button type="button" class="primary cart-checkout" data-action="checkout" >/, 'checkout is enabled with pieces in the cart');
  assert.doesNotMatch(page, /cart-back/, 'no floating back button over the title');
  assert.match(page, /<a class="collection-link cart-continue" href="produtos" data-action="return">← Continuar escolhendo<\/a>/, '"Continuar escolhendo" goes back to where the person was');
  assert.equal((page.match(/data-action="remove"/g) || []).length, 2, 'the trash can stays on each piece');
  // 2026-10-05: the cart turns on the card before the mini-cart rises; the free-shipping bar rises when a piece goes in
  assert.match(read('dist/catalog.js'), /await new Promise\(done => setTimeout\(done, reduceMotion\(\) \? 0 : 600\)\); openMiniCart\(/);
  assert.match(read('dist/catalog.css'), /\.product-cart\.is-loading \.icon \{ animation: cart-spin \.6s/);
  assert.match(read('dist/mini-cart.js'), /riseFrom = totals\(readCart\(\), 0\)\.subtotal;/, '"Complete o kit" remembers where the bar was');
  assert.match(read('dist/checkout.js'), /if \(barBefore !== null\) riseBar\(main, barBefore\);/, 'the cart page too, when a quantity goes up');
  for (const file of ['mini-cart.css', 'commerce.css']) assert.match(read('dist/' + file), /\.free-ship\.is-rising \{ animation: free-ship-glow/);
  assert.match(read('tools/dev-server.cjs'), /freeShipping: shopShipping\.freeShipping/, 'the local preview shows the shop\'s free shipping rule');
  // after the summary (no "Compra segura" box in it any more): the other pieces, the purchase info with links to the
  // policies, and the payment methods Mercado Pago takes in the shop (Termos: Pix, credit and debit card)
  assert.doesNotMatch(page, /cart-reassurance|accepted-methods|Compra segura/);
  assert(page.indexOf('</aside>') < page.indexOf('<div class="cart-more">'), 'the extras come after the order summary');
  assert.deepEqual([...page.matchAll(/<a class="cart-rec" href="([^"]+)"/g)].map(m => m[1]), ['dinossauroscopio', 'macacoscopio', 'girafoscopio', 'unicornioscopio'], 'recommends only what is not in the cart (the lamps too, on sale since 07/10/2026)');
  // 2026-10-06: small cards (photo, name, price) side by side in a carousel; after the pieces, the novelties ("Em breve");
  // "Ver todas" next to the title; the next arrow carries the countdown ring of the autoplay
  assert.deepEqual([...page.matchAll(/<a class="cart-rec is-soon" href="([^"]+)"/g)].map(m => m[1]), Object.keys(SOON).map(id => `./#produto/${id}/3d`), 'then the novelties, to see in 3D');
  assert.match(page, /<span class="cart-rec-name">Dinossauroscópio<\/span><span class="cart-rec-price">R\$\s?265,00<\/span><\/a>/, 'only the photo, the name and the price');
  assert.match(page, /<span class="cart-rec-name">GiraffeLamp<\/span><span class="cart-rec-price">R\$\s?90,00<\/span>/, 'a lamp at R$ 90');
  assert.doesNotMatch(page, /cart-rec-sub/, 'no subtitle');
  // 2026-10-08 (the owner: "mostrar 3 produtos em carrossel e um 'Ver mais +' ao lado"): each piece once (no hidden copies), three in
  // view (two on phones, --rec-k), "Ver mais +" closing the row, and the pause / previous / next buttons away from the cards
  assert.equal((page.match(/class="cart-rec-slide"/g) || []).length, 4 + Object.keys(SOON).length, 'every suggestion once, no clones');
  assert.doesNotMatch(page, /is-clone|aria-hidden="true"><a class="cart-rec/, 'no hidden copies in the row');
  assert.match(page, /<\/ul><\/div><a class="cart-rec-more" href="produtos" aria-label="Ver mais peças"><span class="cart-rec-more-plus" aria-hidden="true">[^]*?<span class="cart-rec-more-label">Ver mais<\/span><\/a>/, '"Ver mais +" at the end of the row');
  assert.match(page, /<div class="cart-rec-controls" hidden><button type="button" class="cart-rec-toggle" data-rec-play aria-label="Pausar a troca automática"[^>]*><span class="cart-rec-dot" aria-hidden="true">[^]*?data-rec-step="-1"[^]*?data-rec-step="1"/, 'pause (the small dot with the ring), previous and next, before the cards');
  const cartView = read('dist/cart-view.js'), cartCss = read('dist/cart-page.css');
  // 2026-10-08, second round (the owner: "uma bolinha menor, com esse tempo maior... quando a pessoa põe o dedo por cima, escrola, essa
  // contagem para... no computador, se passa o mouse por cima, o temporizador também para e volta quando o mouse sair"): one card every
  // 8.5 s; the countdown holds — and resumes from where it stopped — with the mouse anywhere over the section, with a finger on it (also
  // while scrolling the page over it: touch events keep coming during the scroll, pointer events do not) and for HOLD_MS after lifting it
  assert.match(cartView, /const AUTO_MS = 8500;/);
  assert.match(cartView, /const HOLD_MS = 4000;/);
  assert.match(cartView, /if \(state\.since\) \{ state\.left = Math\.max\(0, state\.left - \(Date\.now\(\) - state\.since\)\); state\.since = 0; \}/, 'the time already counted is kept');
  assert.match(cartView, /state\.lead \+= direction; state\.left = AUTO_MS; state\.since = 0;/, 'new cards in view: the countdown starts over');
  assert.match(cartView, /root\.addEventListener\('pointerover', event => \{ const state = recState\(root\); if \(event\.pointerType === 'mouse' && !state\.hover && inRecs\(event\.target\)\)/, 'the mouse anywhere over the section holds');
  assert.match(cartView, /root\.addEventListener\('touchstart', event => \{[^]*?event\.target\.addEventListener\(type, lift, \{once: true, passive: true\}\);[^]*?\}, \{passive: true\}\);/, 'a finger holds until it lifts (heard on the touch target itself)');
  assert.match(cartView, /return countingRec\(state\) && !state\.hover && !state\.focus && !state\.touching && !state\.drag && !state\.anim && !document\.hidden && state\.onScreen && Date\.now\(\) >= state\.heldUntil;/);
  assert.doesNotMatch(cartView.slice(cartView.indexOf('function paintRing'), cartView.indexOf('export function wireRecArrows')), /offsetWidth/, 'the ring is set through its animation (currentTime), with no forced reflow');
  assert.match(cartView, /for \(const anim of half\.getAnimations\?\.\(\) \|\| \[\]\) anim\.currentTime = at;/);
  // the dot: a 44 px target with no box, an 18 px ring in two halves that rotate (transform only), frozen and dimmed while held
  assert.match(cartCss, /\.cart-rec-arrow, \.cart-rec-toggle \{ position: relative; display: grid; place-items: center; width: 44px; height: 44px;/);
  assert.match(cartCss, /\.cart-rec-toggle \{ border-color: transparent; background: transparent; box-shadow: none;/);
  assert.match(cartCss, /\.cart-rec-dot \{ position: relative; width: 18px; height: 18px;/);
  assert.match(cartCss, /@keyframes rec-half-a \{ 50%, 100% \{ transform: rotate\(405deg\); \} \}\r?\n@keyframes rec-half-b \{ 0%, 50% \{ transform: rotate\(45deg\); \} 100% \{ transform: rotate\(225deg\); \} \}/, 'the ring moves by transform only');
  assert.doesNotMatch(cartCss, /stroke-dashoffset/, 'no painted ring');
  assert.match(cartCss, /\.cart-rec-rail\.is-held \.cart-rec-dot i \{ animation-play-state: paused; \}/, 'held: the ring freezes where it is');
  // review: the slide of each change holds the count too, but the dot does not dim then (it would blink at every card); a second finger
  // still on the section keeps holding, and the once-only listener is armed again on the lifted target
  assert.match(cartCss, /\.cart-rec-rail\.is-held:not\(\.is-moving\) \.cart-rec-dot \{ opacity: \.55; \}/);
  assert.match(cartView, /if \(\[\.\.\.event\.touches\]\.some\(touch => inRecs\(touch\.target\)\)\) \{ event\.currentTarget\.addEventListener\(event\.type, lift, \{once: true, passive: true\}\); return; \}/);
  assert.match(cartView, /slide\.inert = index < state\.lead \|\| index >= state\.lead \+ k;/, 'the cards out of view leave the Tab order');
  // the cart is redrawn on every quantity and every shipping quote: the row carries on from the card that was first in view; turning a
  // phone sideways (2 -> 3 in view) near the end of the row leaves no empty place
  assert.match(cartView, /const first = state\.rail\?\.querySelector\('\[data-rec-track\]'\)\?\.children\[state\.lead\]/, 'a redraw keeps the row where it was');
  assert.match(cartView, /while \(state\.moving && state\.lead > 0 && state\.lead \+ k > parts\.track\.children\.length\)/, 'no hole after rotating the phone');
  assert.match(cartCss, /\.cart-rec-rail \{ --rec-k: 3; --rec-gap: 16px; display: grid; grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/, 'three cards and "Ver mais" in four columns');
  assert.match(cartCss, /\.cart-rec-rail, \.cart-rec-rail\[data-count\] \{ --rec-k: 2;/, 'two cards on phones');
  assert.match(cartCss, /\.cart-rec-rail\[data-count="1"\] \{ --rec-k: 1; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); grid-template-areas: "view more"; \}/, 'one suggestion on a phone: the card and "Ver mais +" side by side');
  assert.match(cartCss, /@media \(prefers-reduced-motion: reduce\) \{ \.cart-rec-toggle \{ display: none; \}/, 'no autoplay (nor its pause button) with reduced motion');
  assert.match(cartCss, /\.cart-checkout-bar\.is-at-summary \.cart-summary-balloon \{ opacity: 0; visibility: hidden;/, 'the hidden "Ver resumo" balloon leaves the Tab order');
  // "Ver resumo" (bar at the bottom on phones): a smooth scroll to the summary, which lights up for a moment
  assert.match(page, /<a class="cart-checkout-total" href="#cart-summary-title"><span class="cart-total-label">Total<\/span><strong>[^<]+<\/strong><\/a><a class="cart-summary-balloon" href="#cart-summary-title">Ver resumo<svg/, '"Ver resumo" is a balloon above the bar');
  assert.match(read('dist/checkout.js'), /wireSummaryLink\(main\);/);
  assert.match(read('dist/cart-page.css'), /\.cart-order-summary\.is-spotlight \{ animation: summary-spot/);
  assert.deepEqual([...page.matchAll(/<li><svg[^]*?<a href="([^"]+)"><strong>([^<]+)<\/strong>/g)].map(m => [m[1], m[2]]),
    [['envio#frete', 'Entrega e frete.'], ['termos#precos', 'Formas de pagamento.'], ['envio#prazo', 'Feito sob encomenda.'], ['trocas', 'Trocas e devoluções.']]);
  assert.match(page, /começa depois da confirmação do pagamento\./);
  // without the account's list (payments off): Pix, the credit cards and the Caixa virtual debit card, in three groups
  assert.deepEqual([...page.matchAll(/<li class="pay-mark" title="([^"]+)">/g)].map(m => m[1]), ['Pix', 'Visa', 'Mastercard', 'Elo', 'American Express', 'Hipercard', 'Cartão de débito virtual Caixa']);
  assert.deepEqual([...page.matchAll(/<span class="pay-group-label">([^<]+)<\/span>/g)].map(m => m[1]), ['Pix', 'Crédito', 'Débito']);
  // with the account's list (GET /api/payments/methods): only what it accepts; an unknown brand shows Mercado Pago's picture
  const {paymentBlock} = await site('cart-view.js');
  const own = paymentBlock([{id: 'pix', name: 'Pix', type: 'bank_transfer'}, {id: 'master', name: 'Mastercard', type: 'credit_card'}, {id: 'novo', name: 'Bandeira nova', type: 'credit_card', thumbnail: 'https://http2.mlstatic.com/x.png'}]);
  assert.deepEqual([...own.matchAll(/<li class="pay-mark" title="([^"]+)">/g)].map(m => m[1]), ['Pix', 'Mastercard', 'Bandeira nova']);
  assert.match(own, /<img src="https:\/\/http2\.mlstatic\.com\/x\.png" alt=""/);
  assert.doesNotMatch(own, /Débito/, 'no debit group when the account has no debit card');
  // Pix always shows (shop rule, offered by the checkout): the test credentials do not list it (2026-10-05)
  const testAccount = paymentBlock([{id: 'visa', name: 'Visa', type: 'credit_card'}, {id: 'debelo', name: 'Elo Débito', type: 'debit_card'}]);
  assert.deepEqual([...testAccount.matchAll(/<span class="pay-group-label">([^<]+)<\/span>/g)].map(m => m[1]), ['Pix', 'Crédito', 'Débito']);
  assert.deepEqual([...testAccount.matchAll(/<li class="pay-mark" title="([^"]+)">/g)].map(m => m[1]), ['Pix', 'Visa', 'Elo Débito']);
  assert.match(page, /Pagamento processado pelo Mercado Pago/);
  const empty = renderCart([], {});
  assert.match(empty, /<h2 id="cart-recs-title">Comece por uma destas<\/h2>/);
  assert.equal((empty.match(/class="cart-rec"/g) || []).length, Object.keys(PRODUCTS).length, 'the empty cart suggests every piece');
  const checkout = read('dist/checkout.js');
  assert.match(checkout, /const purchaseItems = \(\) => cart;/);
  assert.doesNotMatch(checkout, /selectedItems|select-all|remove-selected/);
}

// ── A5: the opening screen only on the first visit of the session ─────
{
  const entry = read('dist/page-entry.js');
  assert.match(entry, /seen = sessionStorage\.getItem\('ju\.opened'\) === '1'; sessionStorage\.setItem\('ju\.opened', '1'\);/);
  assert.ok(entry.indexOf("if (seen) {") < entry.indexOf("root.classList.add('ju-opening')"), 'a later visit never hides the shop behind the opening');
  assert.match(entry, /window\.finishJuOpening = \(\) => \{\};/, 'the banner can still call it');
  // 2026-10-06: back to the home (logo, Início) on a later visit, the HTML written in the page (the butterfly, larger than its
  // stage, and the header without its bar) flashed before the piece the visitor was looking at. The page now waits hidden,
  // over the piece's background colour, until the showcase draws the piece in front, 2.5 s at most.
  const later = entry.slice(entry.indexOf('if (seen) {'), entry.indexOf("root.classList.add('ju-opening')"));
  assert.match(later, /root\.classList\.add\('ju-returning'\);/, 'a later visit waits for the showcase');
  assert.match(later, /window\.finishJuReturn = \(\) => \{/);
  assert.match(later, /const safety = setTimeout\(\(\) => window\.finishJuReturn\(\), 2500\);/, 'never hidden for good, even if a script fails');
  assert.match(later, /addEventListener\('pageshow', e => \{ if \(e\.persisted\) window\.finishJuReturn\(\); \}\)/, 'Back shows the page at once');
  const experience = read('dist/experience.css');
  assert.match(experience, /\.ju-returning \.home :is\(\.page, \.announce-bar\) \{ opacity:0; pointer-events:none; \}/, 'opacity: the showcase marks its pieces visibility:visible, which shows through a hidden parent');
  assert.match(experience, /\.ju-returned \.home :is\(\.page, \.announce-bar\) \{ animation:ju-return \.24s ease-out both; \}/, 'the bar above the page comes in with it');
  assert.match(experience, /\.ju-returned \.home :is\(\.page, \.announce-bar\) \{animation:none\}/, 'no fade with reduced motion');
  assert.match(experience, /\.hero-fallback \{[^}]*max-height:100%;/, 'the picture written in the page fits its stage');
  const showcase = read('dist/carousel.js');
  assert.match(showcase, /Promise\.race\(\[drawn, new Promise\(r => setTimeout\(r, 600\)\)\]\)\.then\(\(\) => window\.finishJuReturn\?\.\(\)\);/, 'the showcase shows the page once the piece in front is drawn (600 ms at most)');
  assert.ok(showcase.indexOf('window.finishJuReturn') > showcase.indexOf("region.querySelector('[data-hero-stage]').innerHTML ="), 'only after the showcase is built');
  // 2026-10-06: the showcase photos in 768 px for phones and 1x/2x computers (products.js). The home's preload, the
  // picture written in the page and the carousel share one srcset and one sizes: one file downloaded. The demonstration
  // shows the piece larger, with its own sizes.
  const {ART_768, HERO_SIZES, PHOTO_SIZES, LIGHT_SCREEN, artSrcset, demoSrcset, thumbSrcset, thumbSizes, thumbImg} = await import('../dist/products.js');
  const butterfly = 'product-borboletoscopio-cutout.webp', set = artSrcset(butterfly), home = read('dist/index.html');
  assert.equal(set, 'assets/product-borboletoscopio-cutout-768.webp 768w, assets/product-borboletoscopio-cutout.webp 1254w');
  assert.equal(artSrcset('card-x.webp'), ''); assert.equal(artSrcset('card-x.webp', true), ''); assert.equal(thumbImg('card-x.webp', '84px'), 'src="assets/card-x.webp"');
  // 2026-10-09: the 512 px copy only on low-density screens (phones under 1.9x, 1x computers and tablets), where it is still 1.3x
  // the photo on the screen; denser screens keep the list above, so they pick the same file as before. The demonstration always
  // keeps it. The miniatures pick from 384, 512 and 768 with a 1.45x margin over the size they are drawn at, never above the 768.
  assert.equal(LIGHT_SCREEN, '(max-width: 600px) and (max-resolution: 1.89dppx), (max-resolution: 1.19dppx)');
  assert.equal(artSrcset(butterfly, true), `assets/product-borboletoscopio-cutout-512.webp 512w, ${set}`);
  assert.equal(artSrcset(butterfly), set, 'outside the browser (the pages written by the tools): the list as before');
  assert.equal(demoSrcset(butterfly), set);
  assert.equal(thumbSrcset(butterfly), 'assets/product-borboletoscopio-cutout-384.webp 384w, assets/product-borboletoscopio-cutout-512.webp 512w, assets/product-borboletoscopio-cutout-768.webp 768w');
  assert.equal(thumbSizes(200, [900, 132]), '(max-width: 900px) 191px, 290px');
  assert.equal(thumbImg(butterfly, '84px'), `src="assets/product-borboletoscopio-cutout-768.webp" srcset="${thumbSrcset(butterfly)}" sizes="84px"`);
  assert.ok(home.includes(`<img class="hero-fallback" loading="lazy" src="assets/${butterfly}" srcset="${set}" sizes="${HERO_SIZES}"`), 'the picture written in the page matches the showcase, and is lazy');
  // The first photo is preloaded by page-entry.js for the piece the home opens on (the address, then the remembered one,
  // then the butterfly), not by a fixed link that always fetched the butterfly; the picture written in the page stays out
  // while the page waits, so it never fetches another one.
  assert.doesNotMatch(home, /<link rel="preload" as="image"[^>]*cutout/, 'no fixed preload of one piece');
  const entryCode = read('dist/page-entry.js');
  assert.ok(entryCode.includes(`const HERO_SIZES = '${HERO_SIZES}';`), 'page-entry.js sizes the preload like the showcase');
  // 2026-10-08: every piece of the showcase, with its own photo and srcset, written from products.js (tools/sync-entry.cjs,
  // checked in tests/pagespeed.mjs); the address may use an alias.
  const pieces = JSON.parse(/const PIECES = (\{[^\n]+\});/.exec(entryCode)[1].replace(/'/g, '"'));
  assert.deepEqual(Object.values(pieces).map(([file]) => file.slice('assets/'.length)).sort(), Object.keys(ART_768).sort(), 'every showcase photo with a 768 px version, by the same names');
  for (const [key, [file, srcset, light]] of Object.entries(pieces)) { assert.equal(srcset, artSrcset(file.slice('assets/'.length), false), `${key}: the srcset carousel.js gives it`); assert.equal(light, artSrcset(file.slice('assets/'.length), true), `${key}: on low-density screens, too`); }
  assert.ok(entryCode.includes(`const LIGHT_SCREEN = '${LIGHT_SCREEN}';`), 'page-entry.js tells the screens apart like carousel.js');
  assert.match(entryCode, /const srcset = light && matchMedia\(LIGHT_SCREEN\)\.matches \? light : dense;/);
  assert.equal(Object.keys(pieces)[0], 'borboletoscopio', 'the butterfly when there is no piece to open on');
  assert.match(entryCode, /const piece = \[asked, saved\]\.find\(key => Object\.hasOwn\(PIECES, key \|\| ''\)\) \|\| Object\.keys\(PIECES\)\[0\]/, 'the address first (or its alias), then the remembered piece');
  assert.match(entryCode, /if \(srcset\) \{ preload\.setAttribute\('imagesrcset', srcset\); preload\.setAttribute\('imagesizes', HERO_SIZES\); \}/);
  assert.ok(entryCode.indexOf('document.head.append(preload)') < entryCode.indexOf('if (seen) {'), 'on every visit, first or later');
  assert.match(experience, /\.ju-opening \.hero-fallback,\.ju-returning \.hero-fallback \{ display:none; \}/);
  // 2026-10-08: only the piece in front gets its photo while the showcase is built; the neighbours right after it shows
  assert.match(showcase, /const set = artSrcset\(product\.catalogImage \|\| product\.image\), sources = set \? ` sizes="\$\{HERO_SIZES\}" \$\{first \? '' : 'data-'\}srcset="\$\{set\}"` : '';/);
  assert.match(showcase, /const first = i === initial, src = /);
  assert.match(showcase, /drawn\.then\(\(\) => \{[^]*?ready\[initial\]\.then\(state => state === 'slow' && waitImage\(images\[initial\], 15000\)\)\.then\(\(\) => preloadAround\(active\)\);/, 'the neighbours after the first draw; with the photo in front late, once it arrives (or 15 s later)');
  // 2026-10-08: a photo later than 6.5 s (cards: 12 s) shows up when it arrives; "Imagem indisponível" only for a real failure
  assert.match(showcase, /return revealImage\(img, \{limit: 6500,/);
  assert.match(read('dist/catalog.js'), /revealImage\(img, \{/);
  for (const file of ['dist/carousel.js', 'dist/catalog.js']) assert.doesNotMatch(read(file), /imageReady/, `${file}: no late photo hidden as unavailable`);
  assert.match(showcase, /if \(img\.dataset\.srcset\) \{ img\.srcset = img\.dataset\.srcset; delete img\.dataset\.srcset; \}/, 'a distant piece gets its srcset when its turn comes');
  assert.match(read('dist/hero-demo.js'), /img\.sizes = frontSet \? DEMO_SIZES : ''; img\.srcset = frontSet;/, 'the demonstration picks its file by its own size');
  assert.match(read('dist/hero-demo.js'), /const frontSet = demoSrcset\(frontFile\);/, 'the demonstration keeps the list as before');
  for (const file of ['dist/mini-cart.js', 'dist/cart-view.js', 'dist/fenda-stage.js']) assert.match(read(file), /thumbImg\(/, `${file}: the small pictures pick their file by size`);
  for (const [tag] of read('dist/index.html').matchAll(/<img\b[^>]*cutout-768[^>]*>/g)) assert.ok(tag.includes('class="hero-fallback"') || /srcset="[^"]*-384\.webp 384w/.test(tag), `index.html: a miniature with the 384/512/768 list (${tag.slice(0, 80)}…)`);
  const {hasGallery} = await import('../dist/gallery.js');
  for (const id of ['borboletoscopio', 'dinossauroscopio', 'aviaoscopia']) {
    const photo = /<img class="pl-photo"[^>]*>/.exec(read(`dist/${id}.html`))[0];
    if (hasGallery(id)) assert.match(photo, new RegExp(`src="assets/vistas/${id}-frente\\.webp`), `${id}.html: opens on the real-photo gallery`);
    else assert.ok(photo.includes(`srcset="${artSrcset(`product-${id}-cutout.webp`)}"`) && photo.includes(`sizes="${PHOTO_SIZES}"`), `${id}.html: the photo picks its size`);
  }
  assert.match(read('tools/build-product-pages.cjs'), /data\.artSrcset\(product\.catalogImage \|\| product\.image\) \? ` srcset=/, 'a piece without gallery photos keeps the srcset');
  // 2026-10-08: the giraffe and the unicorn too — every piece of the showcase has its 768 px photo
  assert.deepEqual(Object.keys(ART_768).sort(), Object.keys(PRODUCTS).map(id => PRODUCTS[id].catalogImage || PRODUCTS[id].image).sort());
  // C6: one label for the action that opens the configurator
  for (const file of ['dist/catalog.js', 'dist/produtos.html', 'dist/hero-demo.js', 'dist/index.html', 'dist/carousel.js']) assert.doesNotMatch(read(file), /Personalize o seu|PERSONALIZE O SEU/, `${file}: "Personalizar o meu"`);
  assert.match(read('dist/catalog.js'), /class="product-customize" href="\$\{productHref\(id\)\}\/personalizar">Personalizar o meu</, 'the card button opens the configurator');
}

// ── B3, L1, L2: legible text, full-contrast side cards, drawn 3D controls ──
{
  for (const file of ['account.css', 'cart-page.css', 'catalog.css', 'commerce.css', 'mobile-modal.css', 'shopping.css', 'theme.css', 'carousel.css'])
    assert.doesNotMatch(read('dist/' + file), /font-size: *(?:clamp\()?(?:[0-9]|1[01])(?:\.\d+)?px|font: [^;}]*?(?:clamp\()?\b(?:[0-9]|1[01])px/, `${file}: no text under 12 px (audit B3)`);
  // audit L1, then the review of 2026-10-08 (visual 14): side cards recede by scale, with the text and the piece in true colors
  assert.match(read('dist/catalog.css'), /\.product-rail-card\{opacity:1;filter:none\}/, 'side cards: full contrast (audit L1)');
  assert.doesNotMatch(read('dist/catalog.css'), /\.product-rail-card:not\(\.is-active\) \.product-rail-art img\{opacity/, 'side cards: the picture keeps its true colors');
  // on phones the side pieces float whole in the margins, beside the centre card's photo, with no box and no name (it would be cut);
  // the arrows sit below them (second round, 2026-10-08)
  assert.match(read('dist/catalog.css'), /@media \(max-width: 760px\) \{[^@]*\.home \.product-rail-name \{ display: none; \}[^@]*--art-h: 212px; --slot-w: 41vw; --side-s: \.56; --side-y: -64px;/, 'phone side pieces: whole, beside the photo, no name');
  const tools = /<div class="viewer-tools"[^]*?<\/div>/.exec(read('dist/index.html'))[0];
  assert.doesNotMatch(tools, /[↶↷]|>[+−]</, '3D controls are drawn icons, not text characters (audit L2)');
  assert.equal((tools.match(/<svg /g) || []).length, 4);
}

// ── B6: the quick cart button says which colors go in (the product page itself is the owner's, tests/product-page.mjs) ──
{
  const cards = read('dist/catalog.js'), navigation = read('dist/shopping-navigation.js');
  assert(cards.includes(`aria-label="Adicionar \${product.title} ao carrinho\${fixed ? '' : ' nas cores originais'}" title="\${fixed ? 'Adicionar ao carrinho' : 'Adicionar nas cores originais'}"`), 'the quick cart button says which colors go in (audit B6; a lamp has only its own)');
  assert.match(cards, /openMiniCart\(\{itemId: addedItemId\(cart, id, defaults\(id\)\), original: true\}\)/, 'the quick add opens the mini-cart saying the original colors went in (audits B6 and E1)');
  assert.doesNotMatch(navigation, /original/);
  assert.equal((read('dist/produtos.html').match(/ao carrinho nas cores originais" title="Adicionar nas cores originais">/g) || []).length, 3);
  assert.doesNotMatch(read('dist/index.html'), /Voltar à coleção/, 'no link repeating the × (audit C6)');
}

// ── D3: a link that reopens the same combination ──────────────────────
{
  const controller = read('dist/controller.js'), page = read('dist/index.html');
  assert.match(controller, /export const comboPath=\(key,selection\)=>`#produto\/\$\{key\}\/personalizar\/\$\{PRODUCTS\[key\]\.parts\.map\(part=>selection\[part\.id\]\)\.join\('\.'\)\}`;/, 'the link carries the colors in part order');
  assert.match(controller, /return validSelection\(key,Object\.fromEntries\(PRODUCTS\[key\]\.parts\.map\(\(part,i\)=>\[part\.id,ids\[i\]\]\)\)\);/, 'an unknown color falls back to the original one');
  assert.match(controller, /const shared=step==='personalizar'\?comboFrom\(key,combo\):null;/);
  assert.match(controller, /history\.replaceState\(null,'',`#produto\/\$\{key\}\/personalizar`\)/, 'the address goes back to normal so the next choices are not pinned');
  assert.match(controller, /navigator\.share&&matchMedia\('\(pointer: coarse\)'\)\.matches/, 'share sheet on a phone');
  assert.match(controller, /await navigator\.clipboard\.writeText\(url\)/, 'copied link elsewhere');
  assert.match(page, /<button type="button" class="pdp-share" id="share-colors">Compartilhar estas cores<\/button><input class="pdp-share-link" id="share-link" readonly hidden aria-label="Link das cores">/, 'the link stays visible when copying is not allowed');
}

// ── H1: the phone menu beyond the four links ──────────────────────────
{
  const shell = read('dist/site-shell.js');
  assert.match(shell, /<nav class="drawer-links" aria-label="Navegação móvel">\$\{primaryNav\(\)\}<\/nav>\$\{drawerExtras\(\)\}<\/aside>/);
  assert.match(shell, /<a href="\$\{id\}"><img src="assets\/card-preview-\$\{id\}\.webp" alt="" width="56" height="56" loading="lazy"/, 'the pieces with thumbnails, to their own pages');
  assert.match(shell, /<a href="conta#pedidos">/, '"Meus pedidos"');
  assert.match(shell, /\/\^\\d\{12,13\}\$\/\.test\(CONTACT\.whatsapp\) \? `<a href="https:\/\/wa\.me\/\$\{CONTACT\.whatsapp\}"/, '"Fale com a Ju" only once the WhatsApp number is set (api/_lib/legal.js)');
  assert.match(shell, /<p class="drawer-signature">feito com carinho, pela Ju\.<\/p>/, 'the signature at the foot');
}

// ── J1: link previews (Open Graph) on every page a person may share ───
{
  const {createRequire} = await import('node:module');
  const require = createRequire(import.meta.url);
  const {sync, pages, IMAGE} = require('../tools/sync-meta.cjs');
  const {COMPANY} = require('../api/_lib/legal');
  const stale = pages().filter(name => sync(fs.readFileSync(path.join(root, 'dist', name), 'utf8'), name) !== fs.readFileSync(path.join(root, 'dist', name), 'utf8'));
  assert.deepEqual(stale, [], `link previews out of date — run: node tools/sync-meta.cjs (${stale.join(', ')})`);
  for (const name of ['index.html', 'produtos.html', 'termos.html', 'privacidade.html', 'trocas.html']) {
    const page = read('dist/' + name);
    for (const tag of ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:width', 'og:image:height']) assert.match(page, new RegExp(`<meta property="${tag}" content="[^"]+">`), `${name}: ${tag}`);
    assert.match(page, new RegExp(`<meta property="og:image" content="${COMPANY.website.replace(/[.]/g, '\\.')}/assets/og-ju\\.jpg">`), `${name}: absolute image address on the store's domain`);
  }
  // Search engines (2026-10-07): every page of sitemap.xml names itself on the shop's domain (apex) with one canonical link;
  // the pages kept out of the index (meta robots noindex) never carry one.
  const listed = [...read('dist/sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert(listed.length >= 14 && listed.every(url => url.startsWith(`${COMPANY.website}/`)), 'the sitemap lists the domain addresses');
  for (const url of listed) {
    // o endereço limpo (/produtos) é o arquivo produtos.html; a home, index.html
    const page = read(`dist/${url.slice(COMPANY.website.length + 1) || 'index'}.html`);
    assert.deepEqual([...page.matchAll(/<link rel="canonical" href="([^"]+)">/g)].map(m => m[1]), [url], `${url}: one canonical link, to itself`);
    assert.doesNotMatch(page, /<meta name="robots" content="noindex/, `${url}: listed, so indexable`);
  }
  for (const name of fs.readdirSync(path.join(root, 'dist')).filter(f => f.endsWith('.html'))) {
    const page = read('dist/' + name);
    if (/<meta name="robots" content="noindex/.test(page)) assert.doesNotMatch(page, /rel="canonical"/, `${name}: noindex, so no canonical`);
  }
  assert.match(read('dist/robots.txt'), new RegExp(`^Sitemap: ${COMPANY.website.replace(/[.]/g, '\\.')}/sitemap\\.xml$`, 'm'));
  assert.doesNotMatch(read('dist/robots.txt'), /^Disallow: \/$/m, 'robots.txt never blocks the whole site');
  const jpeg = fs.readFileSync(path.join(root, 'dist', IMAGE.path));
  assert.equal(jpeg.readUInt16BE(0), 0xffd8, 'the preview is a JPEG (the format every app reads)');
  assert(jpeg.length < 300 * 1024, 'and small enough for WhatsApp');
}

console.log('PASS: storefront — pre-rendered product cards match the default colors, prices and Pix prices; the cart without checkboxes; opening screen once per session; one "Personalizar o meu".');
