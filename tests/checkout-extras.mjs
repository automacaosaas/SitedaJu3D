// Checkout improvements of 30/09/2026: the free-shipping bar (product, cart, checkout), the shipping estimate in the cart,
// the installments table with the interest of each option, the mobile total bar and the optional sign-up password.
// Run: node tests/checkout-extras.mjs — no network, no browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = file => import(pathToFileURL(path.join(root, 'dist', file)).href);
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const {freeShippingProgress, freeShippingBar, freeShippingNote} = await site('free-shipping.js');
const {installmentRows, installmentsTable, interestFreeCount} = await site('installments.js');
const {cartSummary} = await site('cart-view.js');

// ── free shipping ─────────────────────────────────────────────────────
{
  const free = {fromCents: 50000, label: 'PAC'};
  assert.equal(freeShippingProgress(null, 12900), null, 'nothing without free shipping');
  assert.deepEqual(freeShippingProgress(free, 38800), {reached: false, missingCents: 11200, ratio: 0.776});
  assert.deepEqual(freeShippingProgress(free, 51600), {reached: true, missingCents: 0, ratio: 1});
  const bar = freeShippingBar(free, 38800);
  assert.match(bar, /Faltam <strong>R\$\s?112,00<\/strong> para o frete grátis \(PAC\)\./); assert.match(bar, /--free-ship:0\.776/);
  assert.match(freeShippingBar(free, 50000), /Frete grátis \(PAC\) garantido!/, 'exactly the threshold counts');
  assert.equal(freeShippingBar(null, 1), '');
  assert.match(freeShippingNote(free), /^Frete grátis \(PAC\) em compras a partir de R\$\s?500,00$/);
  assert.doesNotMatch(freeShippingBar({fromCents: 100, label: '<img src=x>'}, 0), /<img/, 'the label cannot inject markup');
}

// ── installments of the typed card ────────────────────────────────────
{
  const answer = [
    {payment_method_id: 'debmaster', payment_type_id: 'debit_card', payer_costs: [{installments: 1, installment_amount: 163.8, total_amount: 163.8}]},
    {payment_method_id: 'master', payment_type_id: 'credit_card', payer_costs: [
      {installments: 3, installment_rate: 5.89, installment_amount: 57.83, total_amount: 173.49, labels: ['CFT_42,58%|TEA_42,58%']},
      {installments: 1, installment_rate: 0, installment_amount: 163.8, total_amount: 163.8, labels: ['recommended_installment']},
      {installments: 2, installment_rate: 0, installment_amount: 81.9, total_amount: 163.8, labels: []},
      {installments: 'x', installment_amount: 1, total_amount: 1}, {installments: 6, installment_amount: 0, total_amount: 0}
    ]}
  ];
  const rows = installmentRows(answer, 16380);
  assert.deepEqual(rows.map(r => [r.installments, r.eachCents, r.totalCents, r.interestCents, r.cet]), [[1, 16380, 16380, 0, null], [2, 8190, 16380, 0, null], [3, 5783, 17349, 969, '42,58%']], 'credit options only, in order, with the interest on top of the price');
  const table = installmentsTable(rows);
  assert.match(table, /3x de R\$\s?57,83/); assert.match(table, /\+ R\$\s?9,69/); assert.match(table, /CET 42,58% ao ano/); assert.equal((table.match(/sem juros/g) || []).length, 2);
  assert.match(table, /<th scope="col">Juros<\/th>/, 'a real table with headers');
  assert.equal(installmentsTable(rows.slice(0, 1)), '', 'one option: nothing to compare');
  assert.deepEqual(installmentRows(null, 100), []); assert.deepEqual(installmentRows([{payment_type_id: 'debit_card', payer_costs: [{installments: 1, installment_amount: 1, total_amount: 1}]}], 100), [], 'debit cards have no installments');
  assert.doesNotMatch(installmentsTable([{installments: 1, eachCents: 1, totalCents: 1, interestCents: 0}, {installments: 2, eachCents: 1, totalCents: 3, interestCents: 2, cet: '<b>9%'}]), /<b>/, 'a label from outside cannot inject markup');
  // the card option promises "sem juros" only as far as this card's table goes (2026-10-08)
  assert.equal(interestFreeCount(rows), 2, 'this card: 2x without interest, 3x with');
  assert.equal(interestFreeCount(rows.slice(0, 1)), 1);
  assert.equal(interestFreeCount([{installments: 1, interestCents: 0}, {installments: 2, interestCents: 5}, {installments: 3, interestCents: 0}]), 1, 'stops at the first interest');
  assert.equal(interestFreeCount([]), null); assert.equal(interestFreeCount(null), null, 'no table yet: the account\'s number decides');
}

// ── cart summary: estimate by CEP and the free-shipping bar ───────────
{
  const items = [{id: 'a', productId: 'borboletoscopio', title: 'Borboletoscópio', selection: {body: 'pink', details: 'lilac'}, quantity: 1, unitPrice: 12900}];
  const before = cartSummary(items, {realShipping: true, freeShipping: {fromCents: 50000, label: 'PAC'}, estimate: {status: 'idle'}});
  assert.match(before, /calculada pelo CEP/); assert.match(before, /<small class="cart-total-note">sem frete<\/small>/); assert.match(before, /class="cart-summary-balloon"/); assert.match(before, /id="cart-ship-form"/); assert.match(before, /Faltam <strong>R\$\s?371,00/);
  const quoted = cartSummary(items, {realShipping: true, estimate: {status: 'ready', cep: '01001000', options: [{service: 'pac', label: 'PAC', priceCents: 2201, free: false, days: {min: 9, max: 11}}], chosen: {service: 'pac', label: 'PAC', priceCents: 2201, free: false}}});
  assert.match(quoted, /Entrega <small>\(PAC\)<\/small><\/dt><dd>R\$\s?22,01/); assert.match(quoted, /R\$\s?151,01/, 'total with the delivery'); assert.match(quoted, /value="01001-000"/, 'the CEP stays in the box, formatted');
  assert.doesNotMatch(quoted, /Sem frete/);
  assert.match(cartSummary(items, {realShipping: true, estimate: {status: 'none', error: 'no_service'}}), /Não encontramos envio para esse CEP/);
  const demo = cartSummary(items, {});
  assert.doesNotMatch(demo, /cart-ship-form|free-ship/, 'without real shipping: the example fee, no CEP box, no bar');
}

// ── checkout.js and account.js: source guards ─────────────────────────
{
  const checkout = read('dist/checkout.js'), account = read('dist/account.js'), fake = read('tools/fake-brick.js');
  assert.match(checkout, /money\(totals\(items, barShipping \?\? 0\)\.total[ )]/, 'the mobile bar adds the real delivery, never the example fee');
  assert.match(checkout, /bar\.innerHTML = mobileBar\(purchaseItems\(\)\)/, 'and follows the delivery when it is quoted or changed');
  assert.doesNotMatch(checkout, /money\(totals\(items\)\.total\)/);
  assert.match(checkout, /await Promise\.all\(\[refreshSession\(\), loadPaymentConfig\(\), loadShippingConfig\(\)\]\)/, 'one round trip before the cart shows');
  assert.match(checkout, /onBinChange: bin => showInstallments\(mp, bin\)/); assert.match(checkout, /mp\.getInstallments\(\{amount:/);
  assert.match(checkout, /id="installments-info"/);
  assert.match(checkout, /sessionStorage\.setItem\(CEP_KEY/, 'the CEP typed in the cart goes on to the delivery step');
  assert.match(account, /input\('password', 'Crie uma senha \(opcional\)', 'password', 'new-password', 'Pelo menos 8 caracteres', true\)/, 'sign-up password is optional');
  assert.match(account, /\$\{optional \? '' : 'required'\}/);
  assert.match(fake, /getInstallments/); assert.match(fake, /onBinChange/);
  assert.match(fake, /fetch\('\/__fake-mp\/installments\?amount='/, 'the simulated Brick\'s table comes from the same simulated account as the server\'s check');
  // Before going live (2026-10-07): one attempt until a definite answer, the device id, no raw Mercado Pago code on the
  // real site, and a waiting Pix cancelled before a new one is made.
  assert.match(checkout, /if \(!order\.attempt\) order = \{\.\.\.order, attempt: newAttempt\(\)\};/, 'the attempt is kept across retries');
  assert.match(checkout, /if \(order\?\.attempt === attempt && !keepAttempt\(status\)\) order = \{\.\.\.order, attempt: null\};/, 'and dropped after a definite answer');
  assert.match(checkout, /payMethod=button\.dataset\.method;order=\{\.\.\.order,attempt:null\};/, 'switching Pix/card starts a new attempt (another total)');
  assert.match(checkout, /attempt, deviceId: currentDeviceId\(\) \|\| undefined,/, 'the device id goes with the payment');
  assert.match(checkout, /loadDeviceId\(\);/);
  assert.match(checkout, /showPaymentError\(refusalMessage\(result\.reason\), test \? result\.paymentStatusDetail \|\| result\.statusDetail : ''\)/, 'the code in parentheses only in test mode');
  assert.doesNotMatch(checkout, /refusedMessage\(\), result\.statusDetail/);
  assert.match(checkout, /if\(action==='new-pix'\)\{if\(await dropPix\(button\)==='gone'/, '"Gerar novo código Pix" cancels the old one first');
  assert.match(checkout, /if\(action==='delivery'\)\{if\(order\?\.live&&\['pix','expired'\]\.includes\(order\.phase\)&&await dropPix\(button\)!=='gone'\)return;/, 'and so does going back from a waiting Pix');
  assert.match(checkout, /try \{ result = await cancelPayment\(order\.mpId\); \} catch \{\}/);
  assert.match(fake, /window\.MP_DEVICE_SESSION_ID = /, 'the simulator stands in for security.js');
}

console.log('PASS: checkout extras — free-shipping bar and note, installments with interest per option, cart estimate by CEP, mobile total with the real delivery, optional sign-up password, one payment attempt until a definite answer, device id, a waiting Pix cancelled before a new one.');
