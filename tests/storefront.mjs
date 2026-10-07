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
    const id = /data-product-id="([a-z]+)"/.exec(card)?.[1], demo = `index.html#produto/${id}/encaixe`;
    assert(id && SOON[id], `novelty card for a known novelty: ${id}`);
    assert(card.includes(`<h2><a href="${demo}">${SOON[id].title}</a></h2>`) && card.includes(`<p class="product-grid-sub">${SOON[id].subtitle}</p>`), `${id}: name and subtitle`);
    assert(card.includes('<span class="product-soon">Em breve</span>') && card.includes(`<a class="product-customize product-see-fit" href="${demo}">`) && card.includes('<span>Ver encaixado</span>'), `${id}: "Em breve" and "Ver encaixado"`);
    assert(card.includes(`<a class="product-see-3d" href="index.html#produto/${id}/3d">`) && card.includes('<span>Ver em 3D</span>'), `${id}: "Ver em 3D" opens the piece to turn around`);
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
    const expected = Object.values(defaults(id)).map(c => [color(c).hex, color(c).name]);
    assert.deepEqual(swatches, expected, `${id}: the dots show the default colors`);
    assert(card.includes(`<strong>${money(COMMERCE.prices[id])}</strong>`), `${id}: price`);
    assert(card.includes(`${money(pixPrice(COMMERCE.prices[id]))} no Pix`), `${id}: Pix price`);
    assert(card.includes(`<h2><a href="${id}.html">${PRODUCTS[id].title}</a></h2>`), `${id}: the name links to the product's own page`);
    assert(card.includes(`${icon('clock')}<span><span class="sr-only">Produção em </span>${COMMERCE.productionLabel}</span>`), `${id}: the clock and the production time on the card (audit B5; 2026-10-05: no "Feito sob encomenda")`);
    assert.doesNotMatch(card, /Preço ilustrativo/, `${id}: no "Preço ilustrativo" (2026-10-05)`);
    assert(card.includes(`href="index.html#produto/${id}/personalizar">Personalizar o meu</a>`), `${id}: customize`);
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
  assert.match(page, /<a class="collection-link cart-continue" href="produtos\.html" data-action="return">← Continuar escolhendo<\/a>/, '"Continuar escolhendo" goes back to where the person was');
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
  assert.deepEqual([...page.matchAll(/<a class="cart-rec" href="([^"]+)"/g)].map(m => m[1]), ['dinossauroscopio.html'], 'recommends only what is not in the cart');
  // 2026-10-06: small cards (photo, name, price) side by side in a carousel; after the pieces, the novelties ("Em breve");
  // "Ver todas" next to the title; the next arrow carries the countdown ring of the autoplay
  assert.deepEqual([...page.matchAll(/<a class="cart-rec is-soon" href="([^"]+)"/g)].map(m => m[1]), Object.keys(SOON).map(id => `index.html#produto/${id}/3d`), 'then the novelties, to see in 3D');
  assert.match(page, /<span class="cart-rec-name">Dinossauroscópio<\/span><span class="cart-rec-price">R\$\s?265,00<\/span><\/a>/, 'only the photo, the name and the price');
  assert.match(page, /<span class="cart-rec-price">Em breve<\/span>/);
  assert.doesNotMatch(page, /cart-rec-sub|cart-rec-more/, 'no subtitle, no "Ver mais" card');
  assert.match(page, /<a class="cart-recs-all" href="produtos\.html">Ver todas/);
  assert.match(page, /<\/ul><button type="button" class="cart-rec-arrow is-next" data-rec-step="1" aria-label="Mais peças"><svg class="cart-rec-ring"/);
  assert.match(read('dist/cart-view.js'), /const AUTO_MS = 4200;/);
  assert.match(read('dist/cart-page.css'), /\.cart-rec-track \{ display: flex; flex-wrap: nowrap;/, 'side by side (on phones it wrapped into a column)');
  // "Ver resumo" (bar at the bottom on phones): a smooth scroll to the summary, which lights up for a moment
  assert.match(page, /<a class="cart-checkout-total" href="#cart-summary-title"><span class="cart-total-label">Total<\/span><strong>[^<]+<\/strong><\/a><a class="cart-summary-balloon" href="#cart-summary-title">Ver resumo<svg/, '"Ver resumo" is a balloon above the bar');
  assert.match(read('dist/checkout.js'), /wireSummaryLink\(main\);/);
  assert.match(read('dist/cart-page.css'), /\.cart-order-summary\.is-spotlight \{ animation: summary-spot/);
  assert.deepEqual([...page.matchAll(/<li><svg[^]*?<a href="([^"]+)"><strong>([^<]+)<\/strong>/g)].map(m => [m[1], m[2]]),
    [['termos.html#producao', 'Entrega e frete.'], ['termos.html#precos', 'Formas de pagamento.'], ['termos.html#producao', 'Feito sob encomenda.'], ['trocas.html', 'Trocas e devoluções.']]);
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
  // C6: one label for the action that opens the configurator
  for (const file of ['dist/catalog.js', 'dist/produtos.html', 'dist/hero-demo.js', 'dist/index.html', 'dist/carousel.js']) assert.doesNotMatch(read(file), /Personalize o seu|PERSONALIZE O SEU/, `${file}: "Personalizar o meu"`);
  assert.match(read('dist/catalog.js'), /class="product-customize" href="\$\{productHref\(id\)\}\/personalizar">Personalizar o meu</, 'the card button opens the configurator');
}

// ── B3, L1, L2: legible text, full-contrast side cards, drawn 3D controls ──
{
  for (const file of ['account.css', 'cart-page.css', 'catalog.css', 'commerce.css', 'mobile-modal.css', 'shopping.css', 'theme.css', 'carousel.css'])
    assert.doesNotMatch(read('dist/' + file), /font-size: *(?:clamp\()?(?:[0-9]|1[01])(?:\.\d+)?px|font: [^;}]*?(?:clamp\()?\b(?:[0-9]|1[01])px/, `${file}: no text under 12 px (audit B3)`);
  assert.match(read('dist/catalog.css'), /\.product-rail-card\{opacity:1;filter:none\}\.product-rail-card:not\(\.is-active\) \.product-rail-art img\{opacity:\.55/, 'side cards: only the picture fades (audit L1)');
  const tools = /<div class="viewer-tools"[^]*?<\/div>/.exec(read('dist/index.html'))[0];
  assert.doesNotMatch(tools, /[↶↷]|>[+−]</, '3D controls are drawn icons, not text characters (audit L2)');
  assert.equal((tools.match(/<svg /g) || []).length, 4);
}

// ── B6: the quick cart button says which colors go in (the product page itself is the owner's, tests/product-page.mjs) ──
{
  const cards = read('dist/catalog.js'), navigation = read('dist/shopping-navigation.js');
  assert.match(cards, /aria-label="Adicionar \$\{product\.title\} ao carrinho nas cores originais" title="Adicionar nas cores originais"/, 'the quick cart button says which colors go in (audit B6)');
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
  assert.match(shell, /<a href="\$\{id\}\.html"><img src="assets\/card-preview-\$\{id\}\.webp" alt="" width="56" height="56" loading="lazy"/, 'the pieces with thumbnails, to their own pages');
  assert.match(shell, /<a href="conta\.html#pedidos">/, '"Meus pedidos"');
  assert.match(shell, /\/\^\\d\{10,15\}\$\/\.test\(COMMERCE\.whatsapp\) \? `<a href="https:\/\/wa\.me\/\$\{COMMERCE\.whatsapp\}"/, '"Fale com a Ju" only once the WhatsApp number is set');
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
  const jpeg = fs.readFileSync(path.join(root, 'dist', IMAGE.path));
  assert.equal(jpeg.readUInt16BE(0), 0xffd8, 'the preview is a JPEG (the format every app reads)');
  assert(jpeg.length < 300 * 1024, 'and small enough for WhatsApp');
}

console.log('PASS: storefront — pre-rendered product cards match the default colors, prices and Pix prices; the cart without checkboxes; opening screen once per session; one "Personalizar o meu".');
