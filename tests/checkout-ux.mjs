// The checkout's refused-card notice, the short installments box and the Pix screen (2026-10-08, the owner's review: the
// refusal "apareceu, mas embaixo de uma tabela gigantesca de parcelas"; the Pix screen "um loading em 'aguardando
// pagamento' e, a cada etapa concluída no pagamento, um verificado"). What each piece says and does, from the simulated
// Mercado Pago's own answers through to the words on the screen, in Portuguese, English and Spanish; the notice's dialog
// with a stand-in document (open, focus, Esc, buttons, outside click). The full flow in a real browser: the simulator
// (node tools/dev-server.cjs --fake-mp), MERCADOPAGO-VALIDACAO.md 3.2 and 3.3.
// Run: node tests/checkout-ux.mjs — no network, no browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = file => import(pathToFileURL(path.join(root, 'dist', file)).href);
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const require = createRequire(import.meta.url);
const mp = require('../api/_lib/mercadopago');
const {createFakeMercadoPago} = require('../tools/fake-mercadopago.cjs');
const {refusalNotice, refusalMessage, refusedMessage} = await site('live-payment.js');
const {refusalNoticeMarkup, openRefusalNotice} = await site('payment-notice.js');
const {installmentRows, installmentsInfo, installmentsSummary, installmentsTable} = await site('installments.js');
const {PIX_STEPS, pixStepStates, pixSteps, formatPixClock, pixClockNotice, pixHowTo} = await site('pix-panel.js');
const {translate} = await site('i18n-core.js');
const translated = (text, why) => { for (const lang of ['en', 'es']) assert.notEqual(translate(text, lang), text, `${why || 'missing'} ${lang}: ${text}`); };
const textOf = html => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;| /g, ' ').replace(/\s+/g, ' ').trim();

// ── A) the refused card: from the simulator's answer to the notice ────
{
  // The simulated Mercado Pago refuses by the holder's name, like the test cards (OTHE, FUND, SECU, CALL…); the server reads
  // the reason out of its 402 answer; the notice says it in one plain sentence, with what to do.
  const fake = createFakeMercadoPago();
  let serial = 0;
  const refuse = async holder => {
    const body = {type: 'online', total_amount: '299.80', external_reference: 'JU-TESTE', transactions: {payments: [{amount: '299.80', payment_method: {id: 'master', type: 'credit_card', token: (holder + 'x'.repeat(32)).slice(0, 32), installments: 1}}]}};
    const answer = await fake.fetchImpl('https://api.mercadopago.com/v1/orders', {method: 'POST', headers: {Authorization: 'Bearer TEST-x', 'X-Idempotency-Key': 'k' + ++serial}, body: JSON.stringify(body)});
    assert.equal(answer.status, 402, `${holder}: a refusal`);
    return mp.refusalReason(...(await answer.json()).errors[0].details);
  };
  const expected = {
    OTHE: ['rejected_by_issuer', 'O banco do seu cartão recusou esta compra.', 'Tente outro cartão ou pague com Pix.', 'Tentar outro cartão'],
    FUND: ['insufficient_amount', 'O cartão não tem limite disponível para esta compra.', 'Tente outro cartão ou pague com Pix.', 'Tentar outro cartão'],
    SECU: ['bad_filled_card_data', 'Algum dado do cartão não confere (número, validade ou código de segurança).', 'Confira e tente de novo.', 'Corrigir os dados do cartão'],
    CALL: ['required_call_for_authorize', 'O banco do cartão pediu para você autorizar esta compra.', 'Fale com o banco e tente de novo.', 'Tentar de novo'],
    LOCK: ['card_disabled', 'Este cartão está bloqueado ou inativo.', 'Use outro cartão ou pague com Pix.', 'Tentar outro cartão'],
    ATTE: ['max_attempts_exceeded', 'Foram muitas tentativas com este cartão.', 'Use outro cartão ou pague com Pix.', 'Tentar outro cartão'],
    INST: ['invalid_installments', 'O cartão não aceita esse número de parcelas.', 'Escolha outra quantidade e tente de novo.', 'Escolher outras parcelas'],
    BLAC: ['high_risk', 'O pagamento não passou pela análise de segurança do Mercado Pago.', 'Tente outro cartão ou pague com Pix.', 'Tentar outro cartão']
  };
  for (const [holder, [reason, plain, todo, retry]] of Object.entries(expected)) {
    assert.equal(await refuse(holder), reason, `${holder}: the server reads ${reason}`);
    const notice = refusalNotice(reason);
    assert.deepEqual([notice.reason, notice.todo, notice.retry, notice.pix], [plain, todo, retry, true], holder);
    assert.equal(notice.text, refusalMessage(reason), `${holder}: the reminder under the form is the sentence of MERCADOPAGO-VALIDACAO.md 3.2`);
  }
  // Every reason the server can pass on: a sentence of its own, never the code, always translated; Pix offered unless it
  // makes no sense (a payment that just went through).
  for (const reason of mp.REFUSAL_REASONS) {
    const notice = refusalNotice(reason);
    assert.notEqual(notice.group, 'other', reason);
    for (const part of [notice.reason, notice.todo, notice.retry]) { assert(part && !part.includes(reason), `${reason}: plain words`); translated(part, reason); }
    assert(notice.text.startsWith(notice.reason) || notice.group === 'issuer', `${reason}: the reminder says the same`);
    assert.equal(notice.pix, reason !== 'duplicated_payment', `${reason}: Pix offered`);
  }
  assert.equal(refusalNotice('duplicated_payment').retry, 'Entendi');
  // An unknown reason: the general words, never a blank notice.
  for (const odd of ['', undefined, 'toString', '__proto__', 'cc_rejected_other_reason']) {
    const notice = refusalNotice(odd);
    assert.deepEqual([notice.group, notice.text, notice.retry, notice.pix], ['other', refusedMessage(), 'Tentar outro cartão', true], String(odd));
    assert(notice.reason && notice.todo);
  }
  for (const text of ['Pagamento não aprovado', 'Pagar com Pix', 'Fechar aviso', 'Código do Mercado Pago (teste):']) translated(text);

  // The notice's words: title, reason and next step tied to the dialog; the main button first; Pix with its price; the
  // Mercado Pago code only when given (test mode), as plain text.
  const html = refusalNoticeMarkup(refusalNotice('insufficient_amount'), {code: 'insufficient_amount', pixPrice: 'R$ 286,55'});
  assert.match(html, /<h2 id="pay-notice-title">Pagamento não aprovado<\/h2><p id="pay-notice-reason" class="pay-notice-reason">O cartão não tem limite disponível para esta compra\.<\/p><p id="pay-notice-todo" class="pay-notice-todo">Tente outro cartão ou pague com Pix\.<\/p>/);
  assert(html.indexOf('data-notice="retry"') < html.indexOf('data-notice="pix"') && html.indexOf('data-notice="pix"') < html.indexOf('data-notice="close"'), 'retry, then Pix, then ×: the order of Tab');
  assert.match(textOf(html), /Tentar outro cartão Pagar com Pix R\$ 286,55/);
  assert.match(html, /<code translate="no">insufficient_amount<\/code>/);
  assert.match(html, /<span class="sr-only">Fechar aviso<\/span>/, 'the × has a name');
  assert.doesNotMatch(refusalNoticeMarkup(refusalNotice('insufficient_amount')), /pay-notice-code/, 'no code on the real site');
  assert.doesNotMatch(refusalNoticeMarkup(refusalNotice('duplicated_payment')), /data-notice="pix"/, 'no Pix after a duplicated payment');
  const hostile = refusalNoticeMarkup({reason: '<img src=x onerror=1>', todo: '<u>', retry: '"x"', pix: true}, {code: '<script>', pixPrice: '<i>'});
  assert.doesNotMatch(hostile, /<img|<u>|<script>|<i>|>"x"</, 'nothing from outside becomes markup');
  for (const safe of ['&lt;img src=x onerror=1&gt;', '&lt;u&gt;', '&quot;x&quot;', '&lt;script&gt;', '<b>&lt;i&gt;</b>']) assert(hostile.includes(safe), `shown as text: ${safe}`);
}

// ── A) the notice's dialog, with a stand-in document ──────────────────
{
  // Just enough of a document: one <dialog> (attributes, events, showModal/close), its buttons and the focus.
  const makeDoc = ({reduced = false} = {}) => {
    const timers = [], doc = {focused: null, appended: [], defaultView: {matchMedia: query => ({matches: reduced && /reduce/.test(query)}), setTimeout: fn => timers.push(fn)}};
    const button = name => ({dataset: {notice: name}, focus() { doc.focused = name; }, closest: selector => selector === '[data-notice]' ? button(name) : null});
    doc.createElement = tag => {
      const listeners = {}, attrs = {}, classes = new Set();
      const el = {tagName: tag.toUpperCase(), ownerDocument: doc, open: false, modalCalls: 0, returnValue: '', html: '',
        setAttribute: (k, v) => { attrs[k] = String(v); }, getAttribute: k => attrs[k] ?? null,
        classList: {add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c)},
        addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
        dispatch(type, extra = {}) { const event = {type, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra}; (listeners[type] || []).forEach(fn => fn(event)); return event; },
        set innerHTML(value) { this.html = value; }, get innerHTML() { return this.html; },
        querySelector: selector => { const m = /\[data-notice="(\w+)"\]/.exec(selector); return m && el.html.includes(`data-notice="${m[1]}"`) ? button(m[1]) : null; },
        showModal() { this.open = true; this.modalCalls++; },
        close(value) { this.open = false; this.returnValue = value ?? this.returnValue; this.dispatch('close'); }};
      return el;
    };
    doc.body = {append: el => doc.appended.push(el)};
    doc.getElementById = id => doc.appended.find(el => el.id === id) || null;
    doc.flush = () => { while (timers.length) timers.shift()(); };
    return doc;
  };
  const notice = refusalNotice('rejected_by_issuer');
  const doc = makeDoc(), answers = [];
  const dialog = openRefusalNotice({notice, code: 'rejected_by_issuer', pixPrice: 'R$ 286,55', onChoice: choice => answers.push(choice), doc});
  assert.equal(doc.appended.length, 1, 'one dialog in the page');
  assert.deepEqual([dialog.tagName, dialog.id, dialog.getAttribute('role'), dialog.getAttribute('aria-modal'), dialog.getAttribute('aria-labelledby'), dialog.getAttribute('aria-describedby')], ['DIALOG', 'pay-notice', 'alertdialog', 'true', 'pay-notice-title', 'pay-notice-reason pay-notice-todo']);
  assert(dialog.open && dialog.modalCalls === 1, 'opened as a modal (showModal): the page behind waits');
  assert.equal(doc.focused, 'retry', 'focus goes into the notice, on its main button');
  assert(dialog.innerHTML.includes('O banco do seu cartão recusou esta compra.') && dialog.innerHTML.includes('rejected_by_issuer'));
  // Esc: the browser's "cancel" is held for a short fade, then the notice closes and the checkout hears "close"
  const esc = dialog.dispatch('cancel');
  assert(esc.defaultPrevented && dialog.open && dialog.classList.contains('is-closing'), 'Esc starts closing');
  doc.flush();
  assert(!dialog.open && !dialog.classList.contains('is-closing')); assert.deepEqual(answers, ['close']);
  // "Pagar com Pix": the answer is "pix"
  openRefusalNotice({notice, onChoice: choice => answers.push(choice), doc});
  assert.equal(doc.appended.length, 1, 'the same dialog is reused');
  dialog.dispatch('click', {target: {closest: () => ({dataset: {notice: 'pix'}})}}); doc.flush();
  assert.deepEqual(answers, ['close', 'pix']);
  // a click on the dimmed page around it closes it; a click inside, on text, does not
  openRefusalNotice({notice, onChoice: choice => answers.push(choice), doc});
  dialog.dispatch('click', {target: {closest: () => null}}); doc.flush();
  assert(dialog.open, 'a click on the words keeps it open');
  dialog.dispatch('click', {target: dialog}); doc.flush();
  assert(!dialog.open); assert.deepEqual(answers, ['close', 'pix', 'close']);
  // a second refusal while it is open only changes the words (no second showModal, one answer)
  openRefusalNotice({notice: refusalNotice('insufficient_amount'), onChoice: choice => answers.push('first ' + choice), doc});
  const calls = dialog.modalCalls;
  openRefusalNotice({notice: refusalNotice('bad_filled_card_data'), onChoice: choice => answers.push('second ' + choice), doc});
  assert.equal(dialog.modalCalls, calls); assert.match(dialog.innerHTML, /Corrigir os dados do cartão/);
  dialog.dispatch('click', {target: {closest: () => ({dataset: {notice: 'retry'}})}}); doc.flush();
  assert.deepEqual(answers.slice(-1), ['second retry']); assert.equal(answers.length, 4);
  // reduced motion: it closes at once, no fade
  const still = makeDoc({reduced: true}), quick = [];
  const calm = openRefusalNotice({notice, onChoice: choice => quick.push(choice), doc: still});
  calm.dispatch('cancel');
  assert(!calm.open && !calm.classList.contains('is-closing')); assert.deepEqual(quick, ['close']);
}

// ── B) the installments: short at a glance, everything one click away ──
{
  // The simulated account's own plans (tools/fake-mercadopago.cjs), as the Brick's getInstallments answers them.
  const plans = async interestFree => {
    const answer = await createFakeMercadoPago({interestFree}).fetchImpl('https://api.mercadopago.com/v1/payment_methods/installments?amount=299.80&bin=54808328', {method: 'GET', headers: {Authorization: 'Bearer x'}});
    return installmentRows(await answer.json(), 29980);
  };
  const three = await plans(3);
  assert.equal(three.length, 12);
  const summary = installmentsSummary(three);
  assert.deepEqual([summary.free.installments, summary.interest.installments, summary.count], [3, 12, 12]);
  const box = installmentsInfo(three), glance = box.slice(0, box.indexOf('<details'));
  assert.doesNotMatch(glance, /<table/, 'no table at a glance');
  assert.equal((glance.match(/<li /g) || []).length, 2, 'two lines: without and with interest');
  assert.match(textOf(glance), /^Parcelas neste cartão Até 3x de R\$ 99,93 sem juros Até 12x de R\$ 30,10 com juros Total R\$ 361,20 · Juros R\$ 61,40 · CET 42,41% ao ano$/, 'with interest: the total, the interest and the CET always in sight');
  assert(textOf(glance).length < 160, 'a glance, not a table');
  assert.match(box, /<details class="installments-more"><summary><span>Ver todas as parcelas<\/span><\/summary><table class="installments-table">/, 'the whole table behind a native disclosure, closed');
  assert.equal((box.slice(box.indexOf('<details')).match(/<tr><th scope="row">/g) || []).length, 12, 'every option is still there');
  assert.match(box, /O que passa do preço à vista são os juros do parcelamento\./);
  assert.match(installmentsInfo(three, {open: true}), /<details class="installments-more" open>/, 'stays open when the box is drawn again');
  // an account without interest-free installments: 1x without interest, up to 12x with
  const none = installmentsInfo(await plans(0));
  assert.match(textOf(none), /Parcelas neste cartão 1x de R\$ 299,80 sem juros Até 12x de R\$ 30,10 com juros/);
  // every installment without interest: one line, no "com juros"
  const all = installmentsInfo(await plans(12));
  assert.match(textOf(all.slice(0, all.indexOf('<details'))), /^Parcelas neste cartão Até 12x de R\$ 24,98 sem juros$/);
  // interest from 1x (odd, but possible): only the line with interest
  const odd = installmentsInfo([{installments: 1, eachCents: 1010, totalCents: 1010, interestCents: 10, cet: null}, {installments: 2, eachCents: 520, totalCents: 1040, interestCents: 40, cet: '<b>9%'}]);
  assert.doesNotMatch(odd, /sem juros|<b>/); assert.match(textOf(odd), /Até 2x de R\$ 5,20 com juros Total R\$ 10,40 · Juros R\$ 0,40 · CET 9% ao ano/);
  for (const nothing of [[], null, three.slice(0, 1)]) { assert.equal(installmentsInfo(nothing), ''); assert.equal(installmentsSummary(nothing), null); assert.equal(installmentsTable(nothing), ''); }
  // in English and Spanish, line by line as the page translates it
  assert.equal(translate('Até 3x de R$ 99,93', 'en'), 'Up to 3x of R$ 99,93'); assert.equal(translate('Até 3x de R$ 99,93', 'es'), 'Hasta 3x de R$ 99,93');
  assert.equal(translate('Até 12x de R$ 30,10', 'en'), 'Up to 12x of R$ 30,10', 'with the non-breaking space of money()');
  for (const text of ['com juros', 'Ver todas as parcelas', 'Parcelas neste cartão', 'sem juros', 'Juros', 'CET 42,41% ao ano']) translated(text);
}

// ── C) the Pix screen: the steps, the clock, how to pay ────────────────
{
  assert.deepEqual(PIX_STEPS, ['Pedido criado', 'Código Pix gerado', 'Aguardando pagamento', 'Pagamento confirmado']);
  assert.deepEqual(pixStepStates('waiting'), ['done', 'done', 'current', 'next']);
  assert.deepEqual(pixStepStates('paid'), ['done', 'done', 'done', 'done']);
  assert.deepEqual(pixStepStates('expired'), ['done', 'done', 'expired', 'next']);
  const steps = html => [...html.matchAll(/<li class="pix-step ([^"]+)"( aria-current="step")?><span class="pix-step-mark" aria-hidden="true">(.*?)<\/span><span class="pix-step-label">([^<]+)<\/span>(?:<span class="sr-only">([^<]+)<\/span>)?<\/li>/g)]
    .map(([, cls, current, mark, label, spoken]) => ({cls, current: Boolean(current), mark: /pix-check/.test(mark) ? '✓' : /pix-wait/.test(mark) ? '◌' : /pix-clock/.test(mark) ? '⌛' : mark.replace(/<[^>]+>/g, ''), label, spoken: spoken || ''}));
  const waiting = pixSteps('waiting', {fresh: [1]});
  assert.match(waiting, /^<ol role="list" class="pix-steps is-waiting" aria-label="Etapas do pagamento por Pix">/, 'an ordered list, named, that stays a list for screen readers');
  assert.deepEqual(steps(waiting).map(s => [s.mark, s.cls, s.current, s.spoken]), [
    ['✓', 'is-done', false, '(etapa concluída)'], ['✓', 'is-done is-fresh', false, '(etapa concluída)'], ['◌', 'is-current', true, '(etapa atual)'], ['4', 'is-next', false, '']],
  'waiting: two checks (the code\'s one drawn now), the wait on the third, aria-current there');
  assert.deepEqual(steps(pixSteps('paid', {fresh: [2, 3]})).map(s => [s.mark, s.cls, s.current]), [['✓', 'is-done', false], ['✓', 'is-done', false], ['✓', 'is-done is-fresh', false], ['✓', 'is-done is-fresh', true]], 'paid: every step checked, the last two drawn now');
  assert.deepEqual(steps(pixSteps('expired')).map(s => [s.mark, s.cls, s.current, s.spoken]), [['✓', 'is-done', false, '(etapa concluída)'], ['✓', 'is-done', false, '(etapa concluída)'], ['⌛', 'is-expired', true, '(o tempo acabou)'], ['4', 'is-next', false, '']], 'expired: the clock where the wait was');
  assert.equal((pixSteps('waiting').match(/is-fresh/g) || []).length, 0, 'drawn again later (a new language, a re-check): no animation');
  for (const text of [...PIX_STEPS, 'Etapas do pagamento por Pix', '(etapa concluída)', '(etapa atual)', '(o tempo acabou)']) translated(text);

  // the clock: "60:00" as a one-hour code is born, then 59:59 …; hours only above one
  assert.deepEqual([3600, 3599.4, 3599, 61, 1, 0, -5, NaN, 3601, 7200].map(formatPixClock), ['60:00', '60:00', '59:59', '01:01', '00:01', '00:00', '00:00', '00:00', '1 h 00 min', '2 h 00 min']);
  // a whole hour, second by second (and a tab that slept): it speaks twice, at 5 minutes and at 1 minute, never every second
  const spoken = [];
  for (let left = 3599, before = 3600; left >= 0; before = left, left--) { const said = pixClockNotice(before, left); if (said) spoken.push([left, said]); }
  assert.deepEqual(spoken, [[300, 'Faltam 5 minutos para o código Pix expirar.'], [60, 'Falta 1 minuto para o código Pix expirar.']]);
  assert.equal(pixClockNotice(400, 200), 'Faltam 5 minutos para o código Pix expirar.', 'a tab that slept past 5 minutes');
  assert.equal(pixClockNotice(400, 30), 'Falta 1 minuto para o código Pix expirar.', 'past both: the nearer one');
  assert.equal(pixClockNotice(300, 300), '', 'the same second twice: nothing'); assert.equal(pixClockNotice(30, 0), '', 'zero: the page says it expired instead');
  for (const [, text] of spoken) translated(text);

  // how to pay, in three short lines
  const how = pixHowTo();
  assert.deepEqual([...how.matchAll(/<li><span>([^<]+)<\/span><\/li>/g)].map(m => m[1]), ['Abra o app do seu banco e entre na área Pix.', 'Escolha “Ler QR Code” ou “Pix copia e cola”.', 'Confira o valor e confirme. Esta página avança sozinha.']);
  assert.match(how, /<h3>Como pagar<\/h3><ol role="list">/);
  for (const text of ['Como pagar', ...[...how.matchAll(/<li><span>([^<]+)<\/span><\/li>/g)].map(m => m[1]), 'Valor no Pix', 'Voltar', 'para as formas de pagamento', 'Copiado!',
    'Não deu para copiar sozinho. O código ficou selecionado: use a opção Copiar do seu aparelho.', 'O código Pix anterior não vale mais. Escolha como prefere pagar.']) translated(text);
}

// ── checkout.js: where the pieces are wired (the page itself needs a browser: see the header) ──
{
  const checkout = read('dist/checkout.js');
  // both kinds of refusal (Mercado Pago's 402, and a refused order) and a refusal found while "em análise" open the notice
  assert.equal((checkout.match(/refuse\(result\.reason, test \? /g) || []).length, 2);
  assert.match(checkout, /else if \(state === 'refused'\) \{ order = \{\.\.\.order, phase: 'form', id: null, mpId: null, pix: null, attempt: null\}; render\(\); refuse\(reason\); \}/);
  assert.match(checkout, /if \(choice === 'pix' && notice\.pix\) return switchMethod\('pix'\);\n    showPaymentError\(notice\.text, code, \{quiet: true\}\);/, '"Pagar com Pix" switches; otherwise the reminder goes under the form');
  // the installments box keeps "Ver todas as parcelas" open when the buyer opened it
  assert.match(checkout, /box\.innerHTML = installmentsInfo\(rows, \{open: Boolean\(box\.querySelector\('details'\)\?\.open\)\}\);/);
  // the refusal reminder sits right under the payment form, before the installments
  assert(checkout.indexOf('<p id="card-error" class="inline-error" role="alert"></p><div id="installments-info"') > checkout.indexOf('<div id="payment-brick"'));
  // "← Voltar" and "Gerar novo código Pix" both cancel the waiting code first, like "Alterar dados ou pagamento"
  assert.match(checkout, /if\(action==='new-pix'\|\|action==='pix-back'\)\{if\(await dropPix\(button\)==='gone'&&stage==='payment'&&order\?\.live\)\{order=\{\.\.\.order,phase:'form',id:null,mpId:null,pix:null,status:'pending',attempt:null\};render\(\);/);
  assert.match(checkout, /data-action="pix-back"/); assert.match(checkout, /<button class="text-button payment-back" data-action="delivery">← Alterar dados ou pagamento<\/button>/, '"Alterar dados ou pagamento" stays');
  // paid while waiting: the steps close with their checks, then the confirmation that existed
  assert.match(checkout, /if \(state === 'approved' && order\.phase === 'pix'\) closePixSteps\(\);/);
  assert.match(checkout, /steps\.outerHTML = pixSteps\('paid', \{fresh: \[2, 3\]\}\);/);
  assert.match(checkout, /order = \{\.\.\.order, phase: 'done', closing: false\};\n    finishPaid\(\);/);
  // the clock changes quietly; it speaks only through pixClockNotice
  assert.match(checkout, /<strong id="pix-time" role="timer">/);
  assert.match(checkout, /if \(clock\) clock\.textContent = formatPixClock\(left\);\n        if \(notice\) announce\(notice\);/);
  // no inline style written by the checkout for these pieces (the Content-Security-Policy; the looks are in cart-page.css)
  assert.doesNotMatch(checkout, /\.style\.fontSize/);
  for (const file of ['dist/payment-notice.js', 'dist/pix-panel.js']) assert.doesNotMatch(read(file), /style=|\.style\./, `${file}: no inline style`);
  const css = read('dist/cart-page.css');
  assert.match(css, /\.pay-notice\[open\] \{ display: block;/, 'not the two columns of the product window');
  assert.match(css, /@media \(max-width: 600px\) \{\n  \.pay-notice \{ width: 100%;[^}]*margin: auto 0 0;[^}]*border-radius: 24px 24px 0 0;/, 'a sheet from the bottom on phones');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n  \.pay-notice\[open\], \.pay-notice\[open\]::backdrop, \.pay-notice\.is-closing \{ animation: none; \}[^@]*\.pix-wait \{ width: 12px; height: 12px; border: 0; background: var\(--rose\); animation: none; \}/, 'reduced motion: no slide, a still wait mark');
  assert.match(css, /\.pix-back \{[^}]*min-height: 44px;/); assert.match(css, /\.installments-more > summary \{[^}]*min-height: 44px;/);
}

console.log('PASS: checkout UX — the refused card notice (the simulator\'s reasons in plain words, its dialog: modal, focus, Esc, Pix, outside click, reduced motion), the short installments box with the whole table one click away, and the Pix screen (steps with checks, a quiet clock that speaks at 5 and 1 minute, how to pay), in Portuguese, English and Spanish.');
