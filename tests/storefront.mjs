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
const {PRODUCTS, defaults, color} = await site('products.js');
const {COMMERCE, money, pixPrice} = await site('commerce-config.js');
const html = string => string.replace(/ /g, '&nbsp;');

// ── B1: pre-rendered cards = the default combination ──────────────────
{
  const page = read('dist/produtos.html');
  const cards = page.split('<article class="product-rail-card').slice(1);
  assert.equal(cards.length, Object.keys(PRODUCTS).length, 'one pre-rendered card per product');
  for (const card of cards) {
    const id = /data-product-id="([a-z]+)"/.exec(card)?.[1];
    assert(id && PRODUCTS[id], `card for a known product: ${id}`);
    const swatches = [...card.matchAll(/<i style="--swatch:(#[0-9a-f]{6})" title="([^"]+)"><\/i>/g)].map(m => [m[1], m[2]]);
    const expected = Object.values(defaults(id)).map(c => [color(c).hex, color(c).name]);
    assert.deepEqual(swatches, expected, `${id}: the dots show the default colors`);
    assert(card.includes(`data-price-cents="${COMMERCE.prices[id]}"`), `${id}: price data`);
    assert(card.includes(`<strong>${html(money(COMMERCE.prices[id]))}</strong>`), `${id}: price`);
    assert(card.includes(`${html(money(pixPrice(COMMERCE.prices[id])))} no Pix`), `${id}: Pix price`);
    assert(card.includes(`data-product-title="${PRODUCTS[id].title}"`) && card.includes(`data-product-subtitle="${PRODUCTS[id].subtitle}"`), `${id}: title and subtitle`);
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

console.log('PASS: storefront — pre-rendered product cards match the default colors, prices and Pix prices; the cart without checkboxes; opening screen once per session; one "Personalizar o meu".');
