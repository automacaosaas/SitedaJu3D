// Pix 5% on the storefront pieces outside the checkout (the checkout itself is covered by payments.mjs and
// checkout-extras.mjs): the page shows exactly what the server charges (same rule, same rounding), the demonstration
// follows it, the cards, the product window, the banner and the cart show the Pix price, the card option says "3x sem
// juros" (decision of 01/10/2026), and the Termos state the rule. Run: node tests/pix.mjs — no network, no browser.
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
const {COMMERCE, money, pixUnitDiscount, pixPrice, pixPercent, installmentLabel, installmentCents} = await site('commerce-config.js');
const {normalizeCart, totals, pixTotals, pixDiscount} = await site('cart-store.js');
const {createDemoOrder} = await site('demo-payment.js');
const {cartSummary} = await site('cart-view.js');
const {translate} = await site('i18n-core.js');

// ── the page and the server agree ─────────────────────────────────────
{
  assert.equal(COMMERCE.pixDiscountBps, 500); assert.equal(pixPercent, 5);
  for (const [id, price] of Object.entries(COMMERCE.prices)) assert.equal(pixUnitDiscount(price), catalog.pixUnitDiscount(price), `${id}: same rounding`);
  for (const cents of [1, 10, 19, 21, 12345, 99999]) assert.equal(pixUnitDiscount(cents), catalog.pixUnitDiscount(cents), `${cents}: same rounding`);
  assert.equal(pixPrice(12900), 12255); assert.equal(pixPrice(13900), 13205); assert.equal(pixPrice(15900), 15105);

  const cart = normalizeCart([{productId: 'borboletoscopio', quantity: 2}, {productId: 'aviaoscopia', quantity: 1}]);
  const server = catalog.applyPixDiscount(catalog.priceOrder(cart.map(({productId, quantity, selection}) => ({productId, quantity, selection}))));
  const page = pixTotals(cart, catalog.SHIPPING_CENTS);
  assert.deepEqual(page, {subtotal: 41700, shipping: 1800, discount: 2085, total: 41415}, 'pieces −5%, delivery untouched');
  assert.equal(page.total, server.total, 'the page shows what Mercado Pago will charge');
  assert.equal(page.discount, server.discount); assert.equal(pixDiscount(cart), server.discount);
  assert.deepEqual(totals(cart, 1800), {subtotal: 41700, shipping: 1800, total: 43500}, 'card: full price');
  assert.deepEqual(pixTotals([], 2201), {subtotal: 0, shipping: 0, discount: 0, total: 0});

  // the demonstration follows the same rule
  assert.equal(createDemoOrder(cart, 'pix', Date.now(), 1800).amounts.total, 41415);
  assert.equal(createDemoOrder(cart, 'card', Date.now(), 1800).amounts.total, 43500);
}

// ── where the Pix price shows ─────────────────────────────────────────
{
  const cart = normalizeCart([{productId: 'borboletoscopio', quantity: 2}, {productId: 'aviaoscopia', quantity: 1}]);
  assert.match(cartSummary(cart, {}), /<div class="pix-hint"><dt>No Pix <small>\(5% off\)<\/small><\/dt><dd>R\$\s?414,15<\/dd><\/div>/, 'cart: the Pix total under the total');

  // product cards: the showcase carousel (catalog.js) and the Produtos grid (pre-rendered in produtos.html) carry the Pix price
  const page = read('dist/produtos.html'), script = read('dist/catalog.js');
  assert.match(script, /<span class="product-rail-pix">\$\{money\(pixPrice\(COMMERCE\.prices\[id\]\)\)\} no Pix<\/span>/);
  for (const price of Object.values(COMMERCE.prices)) assert(page.includes(`<span class="product-grid-pix">${money(pixPrice(price))} no Pix</span>`), `produtos.html grid: ${money(pixPrice(price))} no Pix`);
  assert.match(read('dist/carousel.js'), /<span class="copy-pix">5% off no Pix<\/span>/, 'banner: price with the Pix badge');
  assert.match(read('dist/controller.js'), /\$\('#product-pix'\)\.textContent=`\$\{money\(pixPrice\(price\)\)\} no Pix`/, 'product page: the Pix price');
}

// ── checkout: the card option (decision of 01/10/2026: 3x sem juros) ──
{
  const checkout = read('dist/checkout.js');
  assert.match(checkout, /<span class="card-off"><strong>3X SEM JUROS<\/strong><span><span>\$\{installmentLabel\(full\)\}<\/span> · <span>ou até 12x no crédito<\/span><\/span><\/span>/, 'the card option shows the installment value');
  assert.doesNotMatch(checkout, /ATÉ 12X NO CRÉDITO/);
  const bar = read('dist/announcement-bar.js');
  assert.match(bar, /text: '5% off no Pix ou 3x sem juros no cartão'/, 'the top bar says the same');
  assert.doesNotMatch(bar, /até 12x no cartão/);
  assert.match(read('dist/index.html'), /<small><span id="product-installments">ou 3x sem juros no cartão<\/span> · valores ilustrativos nesta prévia</, 'and the product window');
  assert.match(read('dist/controller.js'), /\$\('#product-installments'\)\.textContent=`ou \$\{installmentLabel\(price\)\} sem juros no cartão`/, 'with the value of each installment');
  assert.match(checkout, /paymentMethods: payMethod === 'pix' \? \{bankTransfer: 'all'\} : \{creditCard: 'all', debitCard: 'all', maxInstallments: COMMERCE\.maxInstallments\}/, 'the Brick offers only the method chosen');
  assert.equal(COMMERCE.maxInstallments, 12);
}

// ── "3x de R$ 43,00 sem juros": the price split in three, nothing added (audit Q4) ──
{
  assert.equal(COMMERCE.interestFreeInstallments, 3);
  assert.equal(installmentLabel(12900), `3x de ${money(4300)}`);
  assert.equal(installmentLabel(13900), `3x de ${money(4633)}`, 'rounded down to the cent, never above the price');
  assert.equal(installmentLabel(15900), `3x de ${money(5300)}`);
  for (const [id, price] of Object.entries(COMMERCE.prices)) {
    const page = read(`dist/${id}.html`);
    assert(page.includes(`<p class="pl-installments">ou ${installmentLabel(price).replace(/ /g, '&nbsp;')} sem juros no cartão</p>`), `${id}.html: ou ${installmentLabel(price)} sem juros`);
    assert(installmentCents(price) * 3 <= price && installmentCents(price) * 3 > price - 3, `${id}: three installments make the price`);
  }
  assert.equal(translate('ou 3x de R$ 43,00 sem juros no cartão', 'en'), 'or 3 interest-free card installments of R$ 43,00');
  assert.equal(translate('ou 3x de R$ 43,00 sem juros no cartão', 'es'), 'o 3 cuotas sin interés de R$ 43,00 con tarjeta');
}

// ── texts ─────────────────────────────────────────────────────────────
{
  assert.equal(translate('R$ 122,55 no Pix', 'en'), 'R$ 122,55 with Pix');
  assert.equal(translate('R$ 122,55 no Pix', 'es'), 'R$ 122,55 con Pix');
  assert.equal(translate('(5% de desconto)', 'es'), '(5% de descuento)');
  assert.equal(translate('3X SEM JUROS', 'en'), '3X INTEREST-FREE');
  assert.equal(translate('ou até 12x no crédito', 'es'), 'o hasta 12 cuotas con crédito');
  for (const text of ['No Pix', 'no Pix', 'Desconto no Pix (5%)', 'Crédito ou débito', '5% OFF NO PIX'])
    for (const locale of ['en', 'es']) assert.notEqual(translate(text, locale), text, `${locale}: ${text}`);
  assert.match(read('dist/termos.html'), /No Pix, as peças têm 5% de desconto \(o frete não entra no desconto\)/, 'the Termos tell the rule');
}

console.log('PASS: Pix 5% — same rule on the page and the server, demonstration, cards, banner, product window and cart with the Pix price, "3x sem juros" on the card option, translations and Termos.');
