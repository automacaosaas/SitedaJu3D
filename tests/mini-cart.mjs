// Mini-cart (audit E1): adding a piece opens a drawer and the buyer stays in the shop. The drawer confirms the piece (in
// its colors), shows the cart total and the Pix total, the free-shipping bar, "Complete o kit" with up to 3 other pieces of
// the same category (they stay after being added, with their count), and "Ver carrinho" / "Continuar escolhendo". Run: node tests/mini-cart.mjs — no browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = file => import(pathToFileURL(path.join(root, 'dist', file)).href);
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const {miniCartBody, addedItemId} = await site('mini-cart.js');
const {normalizeCart, putItem} = await site('cart-store.js');
const {defaults} = await site('products.js');
const {translate} = await site('i18n-core.js');

// ── the drawer's content ──────────────────────────────────────────────
{
  const cart = normalizeCart(putItem([], 'borboletoscopio', {body: 'pink', details: 'yellow'}));
  const id = addedItemId(cart, 'borboletoscopio', {body: 'pink', details: 'yellow'});
  assert.equal(id, cart[0].id, 'the piece just added is found by its colors');
  const html = miniCartBody({cart, itemId: id, freeShipping: {fromCents: 50000, label: 'PAC'}});
  assert.match(html, /Adicionado ao carrinho/);
  assert.match(html, /<h3>Borboletoscópio<\/h3>/);
  assert.match(html, /Corpo: <strong>Rosa Ju<\/strong>/, 'the colors chosen, by part');
  assert.match(html, /<dt>1 peça no carrinho<\/dt><dd>R\$\s?129,00<\/dd>/);
  assert.match(html, /<dt>No Pix<\/dt><dd>R\$\s?122,55<\/dd>/, 'the Pix total, with the shop rule');
  assert.match(html, /Faltam <strong>R\$\s?371,00<\/strong> para o frete grátis \(PAC\)/, 'how far the free delivery is');
  assert.match(html, /Complete o kit/);
  assert.match(html, /data-kit-add="dinossauroscopio"/); assert.match(html, /data-kit-add="aviaoscopia"/);
  assert.doesNotMatch(html, /data-kit-add="borboletoscopio"/, 'the piece just added is not offered in its own kit');
  assert.doesNotMatch(html, /mini-cart-add-count/, 'no count on a kit piece that is not in the cart');
  assert.match(html, /<a class="primary" href="checkout\.html" data-mini-cart-go>Ver carrinho/);
  assert.match(html, /data-mini-close>Continuar escolhendo<\/button>/);
  assert.match(html, /aria-label="Fechar o carrinho"/);

  const full = normalizeCart(['borboletoscopio', 'dinossauroscopio', 'aviaoscopia'].map(p => ({productId: p, selection: defaults(p)})));
  const all = miniCartBody({cart: full, itemId: full[2].id, original: true, freeShipping: null});
  // 2026-10-05: the kit stays — the other pieces of the same category, each with how many are in the cart (original colors)
  assert.match(all, /Complete o kit/, 'the kit does not disappear once its pieces are in the cart');
  assert.deepEqual([...all.matchAll(/data-kit-add="([a-z]+)"/g)].map(m => m[1]), ['borboletoscopio', 'dinossauroscopio'], 'same category, without the piece just added, up to 3');
  assert.equal((all.match(/<b class="mini-cart-add-count" aria-hidden="true">1<\/b>/g) || []).length, 2, 'the count on each kit button');
  assert.match(all, /Adicionado nas cores originais/); assert.match(all, /cores originais<\/span>/);
  assert.match(all, /<dt>3 peças no carrinho<\/dt><dd>R\$\s?427,00<\/dd>/);
  assert.doesNotMatch(all, /free-ship/, 'no bar without free shipping');
  assert.doesNotMatch(miniCartBody({cart: normalizeCart(putItem([], 'aviaoscopia', {}, '<img src=x onerror=alert(1)>')), itemId: null}), /onerror=alert/, 'a thumbnail that is not an image never reaches the page');
}

// ── wiring: both "add" buttons open it ────────────────────────────────
{
  const bridge = read('dist/cart-bridge.js'), cards = read('dist/catalog.js');
  assert.match(bridge, /openMiniCart\(\{itemId: addedItemId\(cart, product, selection\)\}\);/, 'product page: the drawer instead of the cart page');
  assert.match(bridge, /await goToCart\(\{replace:true, saved:true\}\);/, 'editing from the cart still goes back to the cart');
  assert.match(cards, /openMiniCart\(\{itemId: addedItemId\(cart, id, defaults\(id\)\), original: true\}\)/, 'card quick add');
  for (const page of ['dist/index.html', 'dist/produtos.html']) assert.match(read(page), /<link rel="stylesheet" href="mini-cart\.css">/, `${page}: drawer styles`);
  const css = read('dist/mini-cart.css');
  assert.match(css, /@media \(max-width: 600px\) \{\n  \.mini-cart \{ inset: auto 0 0 0;/, 'a sheet from the bottom on a phone');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.mini-cart\[open\], \.mini-cart\.is-closing,/);
  // closing slides away (down on a phone) instead of vanishing; the kit button: the cart runs across it and the count pops
  assert.match(read('dist/mini-cart.js'), /dialog\.addEventListener\('cancel', event => \{ event\.preventDefault\(\); leave\(\); \}\);/);
  assert.match(css, /\.mini-cart\.is-closing \{ animation: mini-cart-down \.32s/);
  assert.match(css, /\.mini-cart-add\.is-adding \.mini-cart-add-cart \{ animation: kit-cart-run \.9s/);
}

// ── texts ─────────────────────────────────────────────────────────────
{
  for (const text of ['Adicionado ao carrinho', 'Adicionado nas cores originais', 'Fechar o carrinho', 'Complete o kit', 'Ver carrinho', 'Continuar escolhendo', '2 peças no carrinho', 'Adicionar Aviãoscopia nas cores originais', 'Aviãoscopia adicionado nas cores originais.'])
    for (const locale of ['en', 'es']) assert.notEqual(translate(text, locale), text, `${locale}: ${text}`);
  assert.equal(translate('1 peça no carrinho', 'en'), '1 item in the cart');
}

console.log('PASS: mini-cart — the piece in its colors, cart and Pix totals, free-shipping bar, "Complete o kit", both buttons open it, texts.');
