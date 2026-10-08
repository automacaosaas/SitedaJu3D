// Pix 5% on the storefront pieces outside the checkout (the checkout itself is covered by payments.mjs and
// checkout-extras.mjs): the page shows exactly what the server charges (same rule, same rounding), the demonstration
// follows it, the cards, the product window, the banner and the cart show the Pix price, the card option says "3x sem
// juros" (decision of 01/10/2026; one number, and never more than Mercado Pago gives, 2026-10-08), and the Termos state the
// rule. Run: node tests/pix.mjs — no network, no browser.
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
const {MESSAGES} = await site('announcement-bar.js');
// the "3x sem juros" the pages announce: one number, COMMERCE.interestFreeInstallments (2026-10-08); nothing below writes a 3
const n = COMMERCE.interestFreeInstallments;

// ── the page and the server agree ─────────────────────────────────────
{
  assert.equal(COMMERCE.pixDiscountBps, 500); assert.equal(pixPercent, 5);
  for (const [id, price] of Object.entries(COMMERCE.prices)) assert.equal(pixUnitDiscount(price), catalog.pixUnitDiscount(price), `${id}: same rounding`);
  for (const cents of [1, 10, 19, 21, 12345, 99999]) assert.equal(pixUnitDiscount(cents), catalog.pixUnitDiscount(cents), `${cents}: same rounding`);
  assert.equal(pixPrice(12900), 12255); assert.equal(pixPrice(13900), 13205); assert.equal(pixPrice(15900), 15105);

  const cart = normalizeCart([{productId: 'borboletoscopio', quantity: 2}, {productId: 'aviaoscopia', quantity: 1}]);
  const server = catalog.applyPixDiscount(catalog.priceOrder(cart.map(({productId, quantity, selection}) => ({productId, quantity, selection}))));
  const page = pixTotals(cart, catalog.SHIPPING_CENTS);
  assert.deepEqual(page, {subtotal: 81500, shipping: 1800, discount: 4075, total: 79225}, 'pieces −5%, delivery untouched');
  assert.equal(page.total, server.total, 'the page shows what Mercado Pago will charge');
  assert.equal(page.discount, server.discount); assert.equal(pixDiscount(cart), server.discount);
  assert.deepEqual(totals(cart, 1800), {subtotal: 81500, shipping: 1800, total: 83300}, 'card: full price');
  assert.deepEqual(pixTotals([], 2201), {subtotal: 0, shipping: 0, discount: 0, total: 0});

  // the demonstration follows the same rule
  assert.equal(createDemoOrder(cart, 'pix', Date.now(), 1800).amounts.total, 79225);
  assert.equal(createDemoOrder(cart, 'card', Date.now(), 1800).amounts.total, 83300);
}

// ── where the Pix price shows ─────────────────────────────────────────
{
  const cart = normalizeCart([{productId: 'borboletoscopio', quantity: 2}, {productId: 'aviaoscopia', quantity: 1}]);
  assert.match(cartSummary(cart, {}), /<div class="pix-hint"><dt>No Pix <small>\(5% off\)<\/small><\/dt><dd>R\$\s?792,25<\/dd><\/div>/, 'cart: the Pix total under the total');

  // product cards: the showcase carousel (catalog.js) and the Produtos grid (pre-rendered in produtos.html) carry the Pix price
  const page = read('dist/produtos.html'), script = read('dist/catalog.js');
  assert.match(script, /<span class="product-rail-pix">\$\{money\(pixPrice\(COMMERCE\.prices\[id\]\)\)\} no Pix<\/span>/);
  for (const price of Object.values(COMMERCE.prices)) assert(page.includes(`<span class="product-grid-pix">${money(pixPrice(price))} no Pix</span>`), `produtos.html grid: ${money(pixPrice(price))} no Pix`);
  assert.match(read('dist/carousel.js'), /<span class="copy-pix">5% off no Pix<\/span>/, 'banner: price with the Pix badge');
  // product page (controller.js paintPrice): the piece's price, or the lamp kit's total (08/10/2026), with the same Pix rule
  assert.match(read('dist/controller.js'), /function paintPrice\(cents,full=cents,pix=pixPrice\(cents\)\)\{[^}]*\$\('#product-pix'\)\.textContent=`\$\{money\(pix\)\} no Pix`/, 'product page: the Pix price');
  assert.match(read('dist/controller.js'), /if\(!soon\)\{paintPrice\(price\);/, 'the piece\'s own price first');
}

// ── checkout: the card option (decision of 01/10/2026: 3x sem juros; 2026-10-08: never more than Mercado Pago gives) ──
{
  const checkout = read('dist/checkout.js');
  assert.match(checkout, /<span class="card-off" data-card-offer>\$\{cardOffer\(full\)\}<\/span>/, 'the card option carries the promise');
  assert.match(checkout, /<strong>\$\{shown\}X SEM JUROS<\/strong><span><span>\$\{installmentLabel\(full, shown\)\}<\/span> · <span>ou até \$\{max\}x no crédito<\/span><\/span>/, 'with the installment value');
  assert.match(checkout, /<strong>EM ATÉ \$\{max\}X<\/strong><span><span>no crédito<\/span> · <span>veja as parcelas ao digitar o cartão<\/span><\/span>/, 'or the honest one when Mercado Pago gives fewer');
  assert.match(checkout, /const freeInstallments = \(\) => promisedInstallments\(cardFree, live\.interestFree, COMMERCE\.interestFreeInstallments\);/, 'the typed card first, then the account; never past the site\'s number (the rule itself: checkout-extras.mjs)');
  assert.match(checkout, /const free = interestFreeCount\(rows\);\r?\n  if \(free !== cardFree\) \{ cardFree = free; paintCardOffer\(\); \}/, 'the card\'s own table decides once it is typed');
  assert.match(checkout, /pollTimer = clockTimer = null; cardFree = null;/, 'and a new form starts from the account again (disposeLive)');
  assert.doesNotMatch(checkout, /<strong>\d+X SEM JUROS|ATÉ 12X NO CRÉDITO/, 'no number written by hand');
  // the two promises share one place: the larger sets the size, so switching does not push the Brick
  assert.match(read('dist/cart-page.css'), /\.card-off \{ display: grid; grid-template-columns: minmax\(0, 1fr\); \}\r?\n\.card-offer \{ grid-area: 1 \/ 1;[^}]*\}\r?\n\.card-offer\[aria-hidden="true"\] \{ visibility: hidden; \}/);
  const bar = read('dist/announcement-bar.js');
  assert.match(bar, /text: `5% off no Pix ou \$\{COMMERCE\.interestFreeInstallments\}x sem juros no cartão`/, 'the top bar says the same, from the same number');
  assert.equal(MESSAGES[1].text, `5% off no Pix ou ${n}x sem juros no cartão`);
  assert.doesNotMatch(bar, /até 12x no cartão/);
  assert.match(read('dist/index.html'), new RegExp(`<small><span id="product-installments">ou ${n}x sem juros no cartão</span></small><small class="pdp-offer" id="product-offer" hidden></small>`), 'and the product window (prices confirmed on 05/10/2026: no "valores ilustrativos"; the second-airplane offer under it)');
  assert(read('dist/contato.html').includes(`cartão de crédito em até ${COMMERCE.maxInstallments}x, sendo até ${n}x sem juros.`), 'and the Contato FAQ (both written by tools/build-product-pages.cjs)');
  assert.match(read('dist/controller.js'), /\$\('#product-installments'\)\.textContent=cents\?`ou \$\{installmentLabel\(cents\)\} sem juros no cartão`/, 'with the value of each installment');
  assert.match(checkout, /paymentMethods: payMethod === 'pix' \? \{bankTransfer: 'all'\} : \{creditCard: 'all', debitCard: 'all', maxInstallments: COMMERCE\.maxInstallments\}/, 'the Brick offers only the method chosen');
  assert.equal(COMMERCE.maxInstallments, 12);
}

// ── "3x de R$ 43,00 sem juros": the price split in the announced installments, nothing added (audit Q4) ──
{
  // Changing the number is one line in commerce-config.js plus node tools/build-product-pages.cjs; 2 to 12 (below 2 there is
  // no "sem juros" to announce: dropping it is a change of the texts, the owner's decision).
  assert(Number.isInteger(n) && n >= 2 && n <= COMMERCE.maxInstallments, 'interestFreeInstallments: 2 to 12');
  assert.equal(installmentLabel(12900), `${n}x de ${money(Math.floor(12900 / n))}`);
  assert.equal(installmentLabel(12900, 3), `3x de ${money(4300)}`);
  assert.equal(installmentLabel(13900, 3), `3x de ${money(4633)}`, 'rounded down to the cent, never above the price');
  assert.equal(installmentLabel(15900, 2), `2x de ${money(7950)}`, 'fewer, when the checkout knows Mercado Pago gives fewer');
  for (const [id, price] of Object.entries(COMMERCE.prices)) {
    const page = read(`dist/${id}.html`);
    assert(page.includes(`<p class="pl-installments">ou ${installmentLabel(price).replace(/ /g, '&nbsp;')} sem juros no cartão</p>`), `${id}.html: ou ${installmentLabel(price)} sem juros`);
    assert(installmentCents(price) * n <= price && installmentCents(price) * n > price - n, `${id}: the installments make the price`);
  }
  assert.equal(translate('ou 3x de R$ 43,00 sem juros no cartão', 'en'), 'or 3 interest-free card installments of R$ 43,00');
  assert.equal(translate('ou 3x de R$ 43,00 sem juros no cartão', 'es'), 'o 3 cuotas sin interés de R$ 43,00 con tarjeta');
  // whatever the number, every text with it is translated (rules in i18n-core.js, not one dictionary line per number)
  for (const k of [2, 3, 6]) {
    assert.equal(translate(`${k}X SEM JUROS`, 'en'), `${k}X INTEREST-FREE`); assert.equal(translate(`${k}X SEM JUROS`, 'es'), `${k}X SIN INTERESES`);
    assert.equal(translate(`5% off no Pix ou ${k}x sem juros no cartão`, 'en'), `5% off with Pix or ${k} interest-free card installments`);
    assert.equal(translate(`ou ${k}x sem juros no cartão`, 'es'), `o ${k} cuotas sin interés con tarjeta`);
    assert.equal(translate(`Pix, com 5% de desconto nas peças, ou cartão de crédito em até 12x, sendo até ${k}x sem juros. O pagamento é feito pelo Mercado Pago, com segurança.`, 'en'), `Pix, with 5% off the pieces, or credit card in up to 12 installments, up to ${k} of them interest-free. Payment is processed securely by Mercado Pago.`);
  }
  assert.equal(translate('EM ATÉ 12X', 'en'), 'UP TO 12X'); assert.equal(translate('EM ATÉ 12X', 'es'), 'HASTA 12 CUOTAS');
  for (const text of ['no crédito', 'veja as parcelas ao digitar o cartão', MESSAGES[1].text]) for (const locale of ['en', 'es']) assert.notEqual(translate(text, locale), text, `${locale}: ${text}`);
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
