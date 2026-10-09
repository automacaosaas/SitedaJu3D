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
  assert.match(html, /Corpo: <strong>Rosa-bebê<\/strong>/, 'the colors chosen, by part');
  assert.match(html, /<dt>1 peça no carrinho<\/dt><dd>R\$\s?265,00<\/dd>/);
  assert.match(html, /<dt>No Pix<\/dt><dd>R\$\s?251,75<\/dd>/, 'the Pix total, with the shop rule');
  assert.match(html, /Faltam <strong>R\$\s?235,00<\/strong> para o frete grátis \(PAC\)/, 'how far the free delivery is');
  assert.match(html, /Complete o kit/);
  assert.match(html, /data-kit-add="dinossauroscopio"/); assert.match(html, /data-kit-add="aviaoscopia"/);
  assert.doesNotMatch(html, /data-kit-add="borboletoscopio"/, 'the piece just added is not offered in its own kit');
  assert.doesNotMatch(html, /mini-cart-add-count/, 'no count on a kit piece that is not in the cart');
  assert.match(html, /<a class="primary" href="checkout" data-mini-cart-go>Ver carrinho/);
  assert.match(html, /data-mini-close>Continuar escolhendo<\/button>/);
  assert.match(html, /aria-label="Fechar o carrinho"/);

  const full = normalizeCart(['borboletoscopio', 'dinossauroscopio', 'aviaoscopia'].map(p => ({productId: p, selection: defaults(p)})));
  const all = miniCartBody({cart: full, itemId: full[2].id, original: true, freeShipping: null});
  // 2026-10-05: the kit stays — the other pieces of the same category, each with how many are in the cart (original colors)
  assert.match(all, /Complete o kit/, 'the kit does not disappear once its pieces are in the cart');
  assert.deepEqual([...all.matchAll(/data-kit-add="([a-z]+)"/g)].map(m => m[1]), ['borboletoscopio', 'dinossauroscopio', 'macacoscopio'], 'same category, without the piece just added, up to 3');
  // a lamp (07/10/2026) pulls the other lamps first: mixed, 2 for R$ 160 and 3 for R$ 210; its colours are its own, no part names
  const lamp = normalizeCart([{productId: 'girafoscopio', selection: {}}]);
  const lampHtml = miniCartBody({cart: lamp, itemId: lamp[0].id, original: true, freeShipping: null});
  // 08/10/2026 (visual 16): a lamp suggests only the other lamps (never a piece out of its kit); its colours are one row of dots (the
  // names stay for screen readers), and each thumbnail sits on its own piece's wash
  assert.deepEqual([...lampHtml.matchAll(/data-kit-add="([a-z]+)"/g)].map(m => m[1]), ['macacoscopio', 'unicornioscopio'], 'only the other lamps');
  assert.match(lampHtml, /<h3 id="mini-cart-kit-title">Complete o kit<\/h3>/);
  assert.match(lampHtml, /<ul class="mini-cart-colors is-dots" aria-label="Cores de GiraffeLamp"><li><i style="--chip:#eeb012" aria-hidden="true"><\/i><span class="sr-only">Amarelo-ocre<\/span><\/li>/, 'the lamp\'s own colours, as dots');
  assert.match(lampHtml, /<img src="[^"]+" srcset="[^"]*-384\.webp 384w, [^"]*-512\.webp 512w, [^"]*-768\.webp 768w" sizes="139px" alt="" width="96" height="96" style="--thumb-wash:#[0-9a-f]{6}">/, 'the thumbnail on the piece\'s wash, the file picked by its size (products.js thumbImg)');
  assert.doesNotMatch(all, /is-dots/, 'a customizable piece keeps its colours part by part');
  assert.equal((all.match(/<\/span><\/span><b class="mini-cart-add-count" aria-hidden="true"><span>1<\/span><\/b><\/button>/g) || []).length, 2, 'the count on each kit button, outside the track that clips the running cart');
  assert.match(all, /Adicionado nas cores originais/); assert.match(all, /cores originais<\/span>/);
  assert.match(all, /<dt>3 peças no carrinho<\/dt><dd>R\$\s?815,00<\/dd>/);
  assert.doesNotMatch(all, /free-ship/, 'no bar without free shipping');
  assert.doesNotMatch(miniCartBody({cart: normalizeCart(putItem([], 'aviaoscopia', {}, '<img src=x onerror=alert(1)>')), itemId: null}), /onerror=alert/, 'a thumbnail that is not an image never reaches the page');
  // "Monte seu kit" (07/10/2026): several lines at once — each one confirmed, the header says the kit went in, the totals with the kit price
  const kit = normalizeCart(['macacoscopio', 'girafoscopio', 'unicornioscopio'].map(productId => ({productId, selection: {}})));
  const kitHtml = miniCartBody({cart: kit, itemIds: kit.map(i => i.id), original: true, freeShipping: null});
  assert.match(kitHtml, /Kit adicionado ao carrinho/);
  assert.deepEqual([...kitHtml.matchAll(/<article class="mini-cart-item">[^]*?<h3>([^<]+)<\/h3>/g)].map(m => m[1]), ['MonkeyLamp', 'GiraffeLamp', 'UnicornLamp'], 'every lamp of the kit is confirmed');
  assert.equal((kitHtml.match(/<p>1 × R\$\s?70,00/g) || []).length, 3, 'each one at the kit price');
  assert.match(kitHtml, /<dt>3 peças no carrinho<\/dt><dd>R\$\s?210,00<\/dd>/); assert.match(kitHtml, /<dt>No Pix<\/dt><dd>R\$\s?199,50<\/dd>/);
  assert.deepEqual([...kitHtml.matchAll(/data-kit-add="([a-z]+)"/g)].map(m => m[1]), ['borboletoscopio', 'dinossauroscopio', 'aviaoscopia'], 'the pieces just added are not suggested again');
  assert.match(kitHtml, /<h3 id="mini-cart-kit-title">Você também pode gostar<\/h3>/, 'the whole kit just added: the other pieces are not "the kit"');
  assert.match(kitHtml, /<span id="mini-cart-title">Kit adicionado ao carrinho<\/span>/); assert.match(kitHtml, /<dl class="mini-cart-total" id="mini-cart-total">/);
  const two = normalizeCart([{productId: 'girafoscopio', selection: {}}, {productId: 'unicornioscopio', selection: {}}]);
  assert.equal([...miniCartBody({cart: two, itemIds: two.map(i => i.id), original: true}).matchAll(/data-kit-add="([a-z]+)"/g)][0][1], 'macacoscopio', 'a 2-lamp kit suggests the third lamp first');
  assert.match(miniCartBody({cart: kit, itemIds: [kit[1].id], original: true}), /Adicionado nas cores originais/, 'one line: the usual header');
}

// ── wiring: both "add" buttons open it ────────────────────────────────
{
  const bridge = read('dist/cart-bridge.js'), cards = read('dist/catalog.js');
  assert.match(bridge, /openMiniCart\(\{itemId: addedItemId\(cart, product, selection\)\}\);/, 'product page: the drawer instead of the cart page');
  assert.match(bridge, /await goToCart\(\{replace:true, saved:true\}\);/, 'editing from the cart still goes back to the cart');
  assert.match(cards, /openMiniCart\(\{itemId: addedItemId\(cart, id, defaults\(id\)\), original: true\}\)/, 'card quick add');
  assert.match(read('dist/mini-cart.js'), /export function openMiniCart\(\{itemId = null, itemIds = null, original = false, riseFrom: from = null\} = \{\}\) \{[^]*?riseFrom = from \?\? \(item \? totals\(cart, 0\)\.subtotal - item\.unitPrice : null\);/, 'a kit passes its lines and the subtotal before them (the free-shipping bar rises from there)');
  assert.match(read('dist/produtos.html'), /<link rel="stylesheet" href="mini-cart\.css">/, 'produtos.html: drawer styles');
  // the home loads them after its first paint (late-css.js) and the drawer waits for them
  assert.match(read('dist/index.html'), /<link rel="stylesheet" href="mini-cart\.css" media="print" data-late-css><noscript><link rel="stylesheet" href="mini-cart\.css"><\/noscript>/, 'index.html: drawer styles, late');
  assert.match(read('dist/mini-cart.js'), /if \(!lateCssReady\(\)\) return void whenStyled\(\(\) => openMiniCart\(\{itemId, itemIds, original, riseFrom: from\}\)\);\n  ensureDialog\(\);/, 'never opens unstyled');
  const css = read('dist/mini-cart.css');
  assert.match(css, /@media \(max-width: 600px\) \{\n  \.mini-cart \{ inset: auto 0 0 0;/, 'a sheet from the bottom on a phone');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.mini-cart\[open\], \.mini-cart\.is-closing,/);
  // closing slides away (down on a phone) instead of vanishing; the kit button: the cart runs across it and the count pops
  assert.match(read('dist/mini-cart.js'), /dialog\.addEventListener\('cancel', event => \{ event\.preventDefault\(\); leave\(\); \}\);/);
  assert.match(css, /\.mini-cart\.is-closing \{ animation: mini-cart-down \.32s/);
  assert.match(css, /\.mini-cart-add\.is-adding \.mini-cart-add-cart \{ animation: kit-cart-run \.9s/);
  assert.match(css, /\.mini-cart-add-track \{[^}]*overflow: hidden;/); assert.doesNotMatch(css, /\.mini-cart-add\.is-adding \{[^}]*overflow: hidden/, 'the badge is never clipped');
  assert.match(read('dist/mini-cart.js'), /badge\.classList\.add\(before \? 'is-bump' : 'is-new'\); \}, 560\);/, 'the number changes as the cart comes back');
  // its name is the confirmation and its description the total (usabilidade 5); it closes when its own slide ends (movimento 16)
  assert.match(read('dist/mini-cart.js'), /dialog\.setAttribute\('aria-labelledby', 'mini-cart-title'\); dialog\.setAttribute\('aria-describedby', 'mini-cart-total'\);/);
  assert.match(read('dist/mini-cart.js'), /\/\^mini-cart-\(out\|down\)\$\/\.test\(event\.animationName\)/);
  assert.match(css, /\.mini-cart\[open\]::backdrop \{ animation: mini-cart-backdrop-in \.25s ease both; \}/, 'the backdrop fades in too');
  assert.match(read('dist/free-shipping.js'), /fill\.animate\(\[\{transform: `scaleX\(/, 'the free-shipping bar rises by transform only');
}

// ── texts ─────────────────────────────────────────────────────────────
{
  for (const text of ['Adicionado ao carrinho', 'Adicionado nas cores originais', 'Fechar o carrinho', 'Complete o kit', 'Você também pode gostar', 'Ver carrinho', 'Continuar escolhendo', '2 peças no carrinho', 'Adicionar Aviãoscopia nas cores originais', 'Aviãoscopia adicionado nas cores originais.'])
    for (const locale of ['en', 'es']) assert.notEqual(translate(text, locale), text, `${locale}: ${text}`);
  assert.equal(translate('1 peça no carrinho', 'en'), '1 item in the cart');
}

console.log('PASS: mini-cart — the piece in its colors, cart and Pix totals, free-shipping bar, "Complete o kit", both buttons open it, texts.');
