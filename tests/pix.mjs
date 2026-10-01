// Pix 5% on the storefront: the page shows exactly what the server charges (same rule, same rounding), the cart and the
// checkout show the Pix total and the discount line, the delivery step offers Pix or card also with real payments, and the
// Brick only offers the method chosen. Run: node tests/pix.mjs — no network, no browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = file => import(pathToFileURL(path.join(root, 'dist', file)).href);
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const require = createRequire(import.meta.url);
const catalog = require('../api/_lib/catalog');
const {COMMERCE, money, pixUnitDiscount, pixPrice} = await site('commerce-config.js');
const {normalizeCart, totals, pixTotals} = await site('cart-store.js');
const {createDemoOrder} = await site('demo-payment.js');
const {cartSummary} = await site('cart-view.js');
const {translate} = await site('i18n-core.js');

// ── the page and the server agree ─────────────────────────────────────
{
  assert.equal(COMMERCE.pixDiscountPercent, catalog.PIX_DISCOUNT_PERCENT, 'same percentage on the page and on the server');
  for (const [id, price] of Object.entries(COMMERCE.prices)) assert.equal(pixUnitDiscount(price), catalog.pixUnitDiscount(price), `${id}: same rounding`);
  for (const cents of [1, 10, 19, 21, 12345, 99999]) assert.equal(pixUnitDiscount(cents), catalog.pixUnitDiscount(cents), `${cents}: same rounding`);
  assert.equal(pixPrice(12900), 12255); assert.equal(pixPrice(13900), 13205); assert.equal(pixPrice(15900), 15105);

  const cart = normalizeCart([{productId: 'borboletoscopio', quantity: 2}, {productId: 'aviaoscopia', quantity: 1}]);
  const server = catalog.withPixDiscount(catalog.priceOrder(cart.map(({productId, quantity, selection}) => ({productId, quantity, selection}))));
  const page = pixTotals(cart, catalog.SHIPPING_CENTS);
  assert.deepEqual(page, {subtotal: 41700, shipping: 1800, discount: 2085, total: 41415}, 'pieces −5%, delivery untouched');
  assert.equal(page.total, server.total, 'the page shows what Mercado Pago will charge');
  assert.equal(page.discount, server.discount);
  assert.deepEqual(totals(cart, 1800), {subtotal: 41700, shipping: 1800, total: 43500}, 'card: full price, same shape as before');
  assert.equal(pixTotals(cart, 0).total, 41700 - 2085, 'free shipping: only the pieces');
  assert.deepEqual(pixTotals([], 2201), {subtotal: 0, shipping: 0, discount: 0, total: 0});

  // the demonstration follows the same rule
  assert.equal(createDemoOrder(cart, 'pix', Date.now(), 1800).amounts.total, 41415);
  assert.equal(createDemoOrder(cart, 'card', Date.now(), 1800).amounts.total, 43500);
}

// ── where the Pix price shows ─────────────────────────────────────────
{
  const cart = normalizeCart([{productId: 'borboletoscopio', quantity: 2}, {productId: 'aviaoscopia', quantity: 1}]);
  const demo = cartSummary(cart, {});
  assert.match(demo, /<div class="pix-total"><dt>No Pix <small>\(5% de desconto nas peças\)<\/small><\/dt><dd>R\$\s?414,15<\/dd><\/div>/, 'cart: the Pix total under the total');
  const quoted = cartSummary(cart, {realShipping: true, estimate: {status: 'ready', cep: '01001000', options: [], chosen: {service: 'pac', label: 'PAC', priceCents: 2201, free: false}}});
  assert.match(quoted, /No Pix[^]*?<dd>R\$\s?418,16<\/dd>/, 'with the quoted delivery: 417,00 − 20,85 + 22,01');
  assert.doesNotMatch(cartSummary([], {}), /pix-total/, 'nothing to show without pieces');

  // product cards: the script and the pre-rendered copy in produtos.html carry the same Pix price
  const page = read('dist/produtos.html'), script = read('dist/catalog.js');
  assert.match(script, /<span class="product-rail-pix">\$\{money\(pixPrice\(COMMERCE\.prices\[id\]\)\)\} no Pix<\/span>/);
  for (const price of Object.values(COMMERCE.prices)) assert(page.includes(`<span class="product-rail-pix">${money(pixPrice(price)).replace(/ /g, '&nbsp;')} no Pix</span>`), `produtos.html: ${money(pixPrice(price))} no Pix`);
  assert.match(read('dist/cart-bridge.js'), /money\(pixPrice\(COMMERCE\.prices\[key\]\)\)/, 'product panel: the Pix price under the price');
}

// ── checkout: Pix or card before the Brick, amounts that match ────────
{
  const checkout = read('dist/checkout.js');
  assert.doesNotMatch(checkout, /<fieldset class="payment-choice" \$\{live\.mode/, 'the choice shows with real payments too');
  assert.match(checkout, /createLiveOrder\(purchaseItems\(\),method\)/);
  assert.match(checkout, /amounts: \(pix \? pixTotals : totals\)\(snapshot, shippingCents\(\) \?\? undefined\)/, 'the Brick gets the discounted amount for Pix');
  assert.match(checkout, /paymentMethods: order\.method === 'pix' \? \{bankTransfer: 'all'\} : \{creditCard: 'all', debitCard: 'all', maxInstallments: 12\}/, 'the Brick offers only the method chosen');
  assert.match(checkout, /money\(orderTotals\(items, barShipping \?\? 0\)\.total\)/, 'the phone bar follows the method');
  assert.match(checkout, /if\(e\.target\.name==='payment'\)\{method=e\.target\.value;if\(stage==='delivery'\)paintShipping\(\);\}/, 'switching method repaints the summary');
  assert.match(checkout, /Desconto no Pix <small>/);
  assert.match(checkout, /<aside class="order-summary" id="order-summary">/, 'the phone bar link survives a repaint');

  const fake = read('tools/fake-brick.js');
  assert.match(fake, /settings\.customization && settings\.customization\.paymentMethods/, 'the local Brick also limits the methods');
}

// ── texts ─────────────────────────────────────────────────────────────
{
  assert.equal(translate('R$ 122,55 no Pix', 'en'), 'R$ 122,55 with Pix');
  assert.equal(translate('R$ 122,55 no Pix', 'es'), 'R$ 122,55 con Pix');
  assert.equal(translate('(5% de desconto nas peças)', 'en'), '(5% off the items)');
  assert.equal(translate('5% de desconto nas peças', 'es'), '5% de descuento en las piezas');
  assert.equal(translate('Pix · 5% de desconto nas peças', 'en'), 'Pix · 5% off the items');
  assert.equal(translate('(5% de desconto)', 'es'), '(5% de descuento)');
  for (const text of ['No Pix', 'no Pix', 'Desconto no Pix', 'Crédito ou débito, em até 12x', 'O pagamento é feito com segurança pelo Mercado Pago.', 'Cartão de crédito ou débito', 'Trocar forma de pagamento'])
    for (const locale of ['en', 'es']) assert.notEqual(translate(text, locale), text, `${locale}: ${text}`);
  assert.match(read('dist/termos.html'), /No Pix, as peças têm 5% de desconto \(o frete não entra no desconto\)/, 'the Termos tell the rule');
}

console.log('PASS: Pix 5% — same rule on the page and the server, cart and cards with the Pix price, checkout with Pix or card before the Brick, translations and Termos.');
