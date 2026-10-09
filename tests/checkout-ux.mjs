// The checkout's refused-card notice, the short installments box and the Pix screen (2026-10-08, the owner's review: the
// refusal "apareceu, mas embaixo de uma tabela gigantesca de parcelas"; the Pix screen "um loading em 'aguardando
// pagamento' e, a cada etapa concluída no pagamento, um verificado"). What each piece says and does, from the simulated
// Mercado Pago's own answers through to the words on the screen, in Portuguese, English and Spanish; the notice's dialog
// with a stand-in document (open, focus, Esc, buttons, a whole click outside); and the payment step's behaviour (the paid Pix
// closing, "← Voltar", a refusal found while "em análise", the focus, the Pix remembered across a reload, the patient payment
// settings) with the very code the page runs, on a stand-in page. The same in the real checkout, in Chrome with the simulator:
// tests/checkout-browser.mjs; by hand: node tools/dev-server.cjs --fake-mp, MERCADOPAGO-VALIDACAO.md 3.2 and 3.3.
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
const {refusalNotice, refusalMessage, refusedMessage, loadPaymentConfigPatiently} = await site('live-payment.js');
const {refusalNoticeMarkup, openRefusalNotice} = await site('payment-notice.js');
const {installmentRows, installmentsInfo, installmentsSummary, installmentsTable} = await site('installments.js');
const {PIX_STEPS, pixStepStates, pixSteps, formatPixClock, pixClockNotice, pixHowTo, nextStep, stillClosing, cancelOutcome, isPixAttempt, lockPanel, holdButton, isHeld, focusInside, focusInSight, copyPixCode, unmarkCopied} = await site('pix-panel.js');
const {PENDING_KEY, rememberPendingPix, recallPendingPix, forgetPendingPix, resumeStep, matchCartItems} = await site('pending-pix.js');
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
        getBoundingClientRect: () => ({left: 100, right: 500, top: 100, bottom: 400}),   // the notice's own box; around it, the dimmed page
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
  // A whole click on the dimmed page around it (press and release both outside its box) closes it; a click on the words does
  // not, and neither does a press on the words dragged out to select them, nor a press outside released on the notice: both of
  // those also end in a click on the dialog itself (2026-10-08, review: the notice closed in the middle of a selection).
  openRefusalNotice({notice, onChoice: choice => answers.push(choice), doc});
  const words = {closest: () => null}, inside = {clientX: 300, clientY: 250}, around = {clientX: 40, clientY: 30};
  const click = (down, up) => { dialog.dispatch('pointerdown', down); dialog.dispatch('click', up); doc.flush(); };
  click({target: words, ...inside}, {target: words, ...inside});
  assert(dialog.open, 'a click on the words keeps it open');
  click({target: words, ...inside}, {target: dialog, ...around});
  assert(dialog.open, 'selecting the words and letting go on the dimmed page keeps it open');
  click({target: dialog, ...around}, {target: dialog, ...inside});
  assert(dialog.open, 'a press on the dimmed page let go on the notice keeps it open');
  dialog.dispatch('click', {target: dialog, ...around}); doc.flush();
  assert(dialog.open, 'a click with no press before it (nothing pressed on the dimmed page) keeps it open');
  assert.deepEqual(answers, ['close', 'pix'], 'nothing answered meanwhile');
  click({target: dialog, ...around}, {target: dialog, ...around});
  assert(!dialog.open, 'a whole click on the dimmed page closes it'); assert.deepEqual(answers, ['close', 'pix', 'close']);
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

// ── D) the payment step's behaviour, with the very code the page runs (pix-panel.js, pending-pix.js, live-payment.js) on a
//    stand-in page. The same behaviour in the real checkout, in Chrome with the simulator: tests/checkout-browser.mjs ──
{
  // Just enough of a page: elements with attributes, classes, children and text, the keyboard focus with the browser's focus
  // fixup (a focused element that gets disabled or leaves the page hands the focus to the body), and innerHTML kept as a
  // snapshot that can be put back (what holdButton does with a button's words).
  const page = () => {
    const doc = {}, snapshots = [];
    const make = (tag, attrs = {}, children = [], text = '') => {
      const el = {tagName: tag.toUpperCase(), ownerDocument: doc, attrs: {...attrs}, kids: [], parent: null, text, classes: new Set(String(attrs.class || '').split(' ').filter(Boolean)), off: false, scrolled: null,
        get isConnected() { for (let n = this; n; n = n.parent) if (n === doc.body) return true; return false; },
        get disabled() { return this.off; }, set disabled(value) { this.off = Boolean(value); if (value && doc.activeElement === this) doc.activeElement = doc.body; },
        setAttribute(key, value) { this.attrs[key] = String(value); }, getAttribute(key) { return Object.hasOwn(this.attrs, key) ? this.attrs[key] : null; }, removeAttribute(key) { delete this.attrs[key]; },
        focus() { if (!this.off && this.isConnected) doc.activeElement = this; },
        contains(other) { for (let n = other; n; n = n.parent) if (n === this) return true; return false; },
        append(...nodes) { for (const node of nodes) { node.parent = this; this.kids.push(node); } },
        remove() { const lost = this.contains(doc.activeElement); this.parent.kids = this.parent.kids.filter(k => k !== this); this.parent = null; if (lost) doc.activeElement = doc.body; },
        all() { return this.kids.flatMap(k => [k, ...k.all()]); },
        matches(selector) { return selector.split(',').some(one => { one = one.trim(); const attr = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(one); if (attr) return Object.hasOwn(this.attrs, attr[1]) && (attr[2] === undefined || this.attrs[attr[1]] === attr[2]); return one.startsWith('.') ? this.classes.has(one.slice(1)) : this.tagName === one.toUpperCase(); }); },
        querySelector(selector) { return this.all().find(n => n.matches(selector)) || null; },
        querySelectorAll(selector) { return this.all().filter(n => n.matches(selector)); },
        get textContent() { return this.text + this.kids.map(k => k.textContent).join(''); },
        set textContent(value) { this.kids = []; this.text = String(value); },
        get innerHTML() { const keep = n => ({node: n, text: n.text, kids: n.kids.map(keep)}); snapshots.push(keep(this)); return `#${snapshots.length - 1}`; },
        set innerHTML(value) { const put = ({node, text, kids}) => { node.text = text; node.kids = []; node.append(...kids.map(put)); return node; }; put(snapshots[Number(String(value).slice(1))]); },
        getBoundingClientRect() { return this.box || {top: 100, bottom: 150}; },
        scrollIntoView(options) { this.scrolled = options; },
        setSelectionRange(start, end) { this.selection = [start, end]; }
      };
      el.classList = {add: c => el.classes.add(c), remove: c => el.classes.delete(c), contains: c => el.classes.has(c), toggle: (c, on) => (on ? el.classes.add(c) : el.classes.delete(c))};
      el.append(...children);
      return el;
    };
    doc.body = make('body'); doc.activeElement = doc.body; doc.make = make;
    return doc;
  };
  // The Pix screen as checkout.js draws it: "← Voltar" (arrow + words), the steps, "Copiar código", "Já paguei", "Alterar dados".
  const pixScreen = () => {
    const doc = page(), make = doc.make;
    const arrow = make('span', {class: 'pix-back-icon'}, [], '←');
    const back = make('button', {class: 'pix-back', 'data-action': 'pix-back'}, [arrow, make('span', {'data-label': ''}, [], 'Voltar')]);
    const copy = make('button', {class: 'pix-copy-button', 'data-action': 'copy-live-pix'}, [make('span', {class: 'pix-copy-idle', 'aria-hidden': 'false'}, [], 'Copiar código'), make('span', {class: 'pix-copy-done', 'aria-hidden': 'true'}, [], 'Copiado!')]);
    const check = make('button', {'data-action': 'check-now'}, [], 'Já paguei · verificar agora');
    const change = make('button', {'data-action': 'delivery'}, [], '← Alterar dados ou pagamento');
    const steps = make('ol', {class: 'pix-steps'}), input = make('input', {id: 'pix-code'}), hint = make('p', {id: 'pix-copy-hint'});
    hint.hidden = true; input.value = 'PIX-CODE';
    const panel = make('section', {class: 'pix-panel'}, [back, steps, input, copy, hint, check, change]), main = make('main', {id: 'shop-main'}, [panel]);
    doc.body.append(main);
    return {doc, main, panel, arrow, back, copy, check, change, steps, input, hint};
  };
  const buttons = panel => panel.querySelectorAll('button').map(b => `${b.getAttribute('data-action')}:${b.disabled ? 'off' : isHeld(b) ? 'held' : 'on'}`).join(' ');

  // 1) The Pix paid, found by "Já paguei · verificar agora" (checkout.js checkNow + closePixSteps): the button waits keeping the
  //    focus; the answer closes the steps (nextStep → 'close'), every button stops (lockPanel) and the focus waits on the steps;
  //    the button's own release afterwards, with {closing}, never wakes it up again (2026-10-08, review: it came back on).
  {
    const {doc, panel, check, steps} = pixScreen();
    check.focus();
    const release = holdButton(check, 'Verificando…');
    assert.deepEqual([check.textContent, check.getAttribute('aria-disabled'), doc.activeElement === check, isHeld(check)], ['Verificando…', 'true', true, true], 'waiting: its words say so, it keeps the focus and does not answer twice');
    const order = {phase: 'pix', method: 'pix', mpId: 'ORD1', closing: false};
    assert.equal(nextStep(order, 'approved'), 'close');
    order.closing = true;
    lockPanel(panel);
    assert.equal(buttons(panel), 'pix-back:off copy-live-pix:off check-now:off delivery:off', 'nothing on the closing screen answers');
    assert(panel.classList.contains('is-paid'));
    assert.equal(doc.activeElement, steps, 'the focus waits on the steps ("Pagamento confirmado"), not on the page');
    assert.equal(steps.getAttribute('tabindex'), '-1', 'focusable by the script only');
    release({closing: Boolean(order.closing)});
    assert.deepEqual([check.textContent, check.disabled, doc.activeElement === steps], ['Já paguei · verificar agora', true, true], 'its words back, still off, the focus left where it was');
    for (const state of ['approved', 'expired', 'refused', 'pending_pix']) assert.equal(nextStep(order, state), '', `${state} while closing: nothing reopens or redraws the screen`);
    assert.equal(buttons(panel), 'pix-back:off copy-live-pix:off check-now:off delivery:off');
    assert.equal(stillClosing(order, 'ORD1', 'payment'), true, 'the confirmation follows');
    assert.equal(stillClosing(order, 'ORD2', 'payment'), false, 'another Pix meanwhile: no confirmation for the old one');
    assert.equal(stillClosing(order, 'ORD1', 'delivery'), false, 'the buyer left the step: none either');
    // a 5-second check that finds it paid while the focus is somewhere else on the page: the focus is not taken from there
    const other = pixScreen(), elsewhere = other.doc.make('a', {href: '#'});
    other.doc.body.append(elsewhere); elsewhere.focus();
    lockPanel(other.panel);
    assert.equal(other.doc.activeElement, elsewhere, 'focus outside the Pix screen stays where it is');
  }

  // 2) "← Voltar" (checkout.js dropPix): the old code is cancelled first. While Mercado Pago answers, the button says so next
  //    to its arrow and keeps the focus; when the cancel is not confirmed ('kept'), its words come back and the focus is still
  //    (or again) on it, ready to try again (2026-10-08, review: the focus fell to the page and stayed there).
  {
    const {doc, back, arrow} = pixScreen();
    back.focus();
    const release = holdButton(back, 'Cancelando o código anterior…');
    assert.deepEqual([back.querySelector('[data-label]').textContent, back.contains(arrow), doc.activeElement === back], ['Cancelando o código anterior…', true, true], 'the arrow stays, the words change, the focus stays');
    assert.equal(cancelOutcome({status: 503, data: {error: 'unavailable'}}), 'kept');
    release();
    assert.deepEqual([back.textContent, back.getAttribute('aria-disabled'), doc.activeElement === back], ['←Voltar', null, true], 'kept: the button again, with the focus');
    // the focus had fallen to the page meanwhile (the page redrew something): it comes back to the button
    const again = holdButton(back, 'Cancelando o código anterior…');
    doc.activeElement = doc.body; again();
    assert.equal(doc.activeElement, back, 'lost meanwhile: back on the button');
    // the buyer moved on to something else meanwhile: not taken from there
    const moved = holdButton(back, 'Cancelando o código anterior…'), link = doc.make('a');
    doc.body.append(link); link.focus(); moved();
    assert.equal(doc.activeElement, link, 'moved on: left alone');
    // a button that left the page meanwhile (the step was drawn again) is not touched
    const gone = holdButton(back, 'Cancelando o código anterior…');
    back.remove(); gone();
    assert.equal(back.getAttribute('aria-disabled'), 'true', 'nothing done on a button no longer in the page');
    // what each answer of /api/payments/cancel means
    assert.equal(cancelOutcome({status: 200, data: {state: 'canceled'}}), 'gone');
    assert.equal(cancelOutcome({status: 200, data: {state: 'expired'}}), 'gone');
    assert.equal(cancelOutcome({status: 200, data: {state: 'approved'}}), 'paid', 'paid meanwhile: the confirmation');
    assert.equal(cancelOutcome({status: 200, data: {state: 'pending_pix'}}), 'kept', 'still payable: stay');
    assert.equal(cancelOutcome(null), 'kept', 'no answer: stay');
    assert.equal(cancelOutcome(null, true), 'gone', 'no answer about an expired code: it cannot be paid anyway');
  }

  // 3) Answers about an order, from where the page is (checkout.js applyState → nextStep): a card refused while "em análise"
  //    opens the card's notice ('refuse'); a Pix order refused never does ('refused-pix'); a Pix that could not be created is
  //    told apart from a card by the attempt (isPixAttempt), so it gets its own line and never the card's notice.
  {
    assert.equal(nextStep({phase: 'review', method: 'card'}, 'refused'), 'refuse');
    assert.equal(nextStep({phase: 'review', method: 'card'}, 'approved'), 'finish');
    assert.equal(nextStep({phase: 'pix', method: 'pix'}, 'refused'), 'refused-pix');
    assert.equal(nextStep({phase: 'pix', method: 'pix'}, 'expired'), 'expire');
    assert.equal(nextStep({phase: 'expired', method: 'pix'}, 'expired'), '', 'already on the expired screen');
    assert.equal(nextStep({phase: 'expired', method: 'pix'}, 'approved'), 'finish', 'paid just before it ran out: the confirmation');
    for (const state of ['pending_pix', 'in_review', undefined]) assert.equal(nextStep({phase: 'pix', method: 'pix'}, state), '');
    assert.equal(isPixAttempt('bank_transfer', 'card'), true); assert.equal(isPixAttempt(undefined, 'pix'), true);
    assert.equal(isPixAttempt('credit_card', 'card'), false); assert.equal(isPixAttempt('debit_card', 'card'), false);
    translated('Não conseguimos gerar o Pix agora. Tente de novo ou pague com cartão.', 'the Pix line');
  }

  // 4) The code runs out (checkout.js expirePix): the screen is drawn again, so the focus that was in it falls to the page;
  //    it goes to "Gerar novo código Pix", brought into sight when it is not (2026-10-08, review: it stayed on the page's top).
  {
    const {doc, main, panel, check} = pixScreen();
    check.focus();
    assert.equal(focusInside(doc, main), true, 'the focus is in the step that is about to be drawn again');
    panel.remove();
    assert.equal(doc.activeElement, doc.body, 'drawn again: the browser hands the focus to the page');
    const renew = doc.make('button', {'data-action': 'new-pix'}, [], 'Gerar novo código Pix');
    main.append(doc.make('section', {class: 'pix-panel'}, [renew]));
    renew.box = {top: 900, bottom: 950};
    const win = {innerHeight: 780, matchMedia: () => ({matches: false})};
    focusInSight(main.querySelector('[data-action="new-pix"]'), win);
    assert.equal(doc.activeElement, renew, 'the focus on "Gerar novo código Pix"');
    assert.deepEqual(renew.scrolled, {block: 'center', behavior: 'smooth'}, 'below the fold: brought to the middle of the screen');
    renew.scrolled = null; renew.box = {top: 300, bottom: 350}; doc.activeElement = doc.body;
    focusInSight(renew, {innerHeight: 780, matchMedia: () => ({matches: true})});
    assert.equal(renew.scrolled, null, 'already in sight: the page does not move');
    // the focus was elsewhere on the page (the summary, the header): nothing is taken from there
    const link = doc.make('a'); doc.body.append(link); link.focus();
    assert.equal(focusInside(doc, main), false);
  }

  // 5) "Copiar código" (pix-panel.js copyPixCode): "Copiado!" in the same place, or, with the clipboard refused, the code
  //    selected and the line saying how to copy it by hand.
  {
    const {doc, copy, input, hint} = pixScreen();
    const said = await copyPixCode({text: 'PIX-CODE', clipboard: {writeText: async text => assert.equal(text, 'PIX-CODE')}, button: copy, input, hint});
    assert.equal(said, 'copied');
    assert.deepEqual([copy.classList.contains('is-copied'), copy.querySelector('.pix-copy-idle').getAttribute('aria-hidden'), copy.querySelector('.pix-copy-done').getAttribute('aria-hidden')], [true, 'true', 'false']);
    unmarkCopied(copy);
    assert.deepEqual([copy.classList.contains('is-copied'), copy.querySelector('.pix-copy-idle').getAttribute('aria-hidden')], [false, 'false']);
    assert.equal(await copyPixCode({text: 'PIX-CODE', clipboard: undefined, button: copy, input, hint}), 'selected', 'no clipboard at all (an insecure page)');
    assert.deepEqual([doc.activeElement === input, input.selection, hint.hidden], [true, [0, 8], false], 'the code selected and the line shown');
  }

  // 6) The Pix that waits, remembered by the tab (pending-pix.js): only Mercado Pago's id and the reference; what the server's
  //    answer leads to after a reload.
  {
    const memory = new Map(), storage = {getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: k => memory.delete(k)};
    rememberPendingPix(storage, {mpId: 'ORD01FAKE00000001ABCDE', reference: 'JU-24DBC2E70F', qrCode: 'never kept', email: 'ana@exemplo.test'});
    assert.deepEqual(JSON.parse(memory.get(PENDING_KEY)), {mpId: 'ORD01FAKE00000001ABCDE', reference: 'JU-24DBC2E70F'}, 'nothing but the id and the reference');
    assert.deepEqual(recallPendingPix(storage), {mpId: 'ORD01FAKE00000001ABCDE', reference: 'JU-24DBC2E70F'});
    forgetPendingPix(storage); assert.equal(recallPendingPix(storage), null);
    rememberPendingPix(storage, {mpId: '../x', reference: 'JU-1'}); assert.equal(memory.size, 0, 'an id that does not look like Mercado Pago\'s is not kept');
    memory.set(PENDING_KEY, '{"mpId":"<script>","reference":"x"}'); assert.equal(recallPendingPix(storage), null, 'nor read back');
    memory.set(PENDING_KEY, 'not json'); assert.equal(recallPendingPix(storage), null);
    const broken = {getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); }};
    rememberPendingPix(broken, {mpId: 'ORD01FAKE00000001ABCDE'}); forgetPendingPix(broken); assert.equal(recallPendingPix(broken), null, 'storage blocked: no memory, no error');
    assert.equal(recallPendingPix(null), null);
    const pending = {state: 'pending_pix', pix: {qrCode: 'PIX'}, items: [{productId: 'borboletoscopio', quantity: 1}]};
    assert.equal(resumeStep({status: 200, data: pending}), 'resume', 'still payable, with its code: go on with it or cancel it');
    assert.equal(resumeStep({status: 200, data: {...pending, pix: null}}), 'unknown', 'payable but without its code: ask again, never a new one');
    assert.equal(resumeStep({status: 200, data: {state: 'approved'}}), 'paid');
    for (const state of ['expired', 'canceled', 'refused', 'refunded']) assert.equal(resumeStep({status: 200, data: {state}}), 'gone', state);
    assert.equal(resumeStep({status: 404, data: {error: 'not_found'}}), 'gone');
    assert.equal(resumeStep({status: 401}), 'signin');
    // The server lists the remembered order's pieces without the cart's ids (2026-10-08, review: paid after a reload, they stayed
    // in the cart, ready to be bought again): each takes the id of the same piece in the page's cart, so removePurchased works.
    {
      const {normalizeCart, signature, removePurchased} = await site('cart-store.js');
      const key = item => signature(item.productId, item.selection);
      const cart = normalizeCart([{id: 'p1', productId: 'borboletoscopio', quantity: 2, selection: {}}, {id: 'p2', productId: 'dinossauroscopio', quantity: 1, selection: {}}]);
      const listed = normalizeCart([{productId: 'borboletoscopio', quantity: 1, selection: cart[0].selection}, {productId: 'girafoscopio', quantity: 1, selection: {}}]);
      assert.equal(removePurchased(cart, listed).length, 2, 'without the match nothing leaves the cart (the old behaviour)');
      const matched = matchCartItems(listed, cart, key);
      assert.equal(matched[0].id, 'p1', 'the same piece takes the cart\'s id');
      assert.equal(matched[1].id, listed[1].id, 'a piece the cart does not have keeps its own');
      assert.deepEqual(removePurchased(cart, matched).map(i => [i.id, i.quantity]), [['p1', 1], ['p2', 1]], 'paid after the reload: the bought one leaves the cart');
      assert.deepEqual(matchCartItems(null, cart, key), []);
    }
    for (const unclear of [null, {status: 502}, {status: 429}, {status: 200, data: {state: 'in_review'}}]) assert.equal(resumeStep(unclear), 'unknown', JSON.stringify(unclear));
    for (const text of ['Seu Pix', 'ainda está aberto.', 'Você saiu da página com um código Pix aguardando pagamento.', 'Este código ainda pode ser pago.', 'Continuar com este Pix', 'Cancelar este Pix e recomeçar', 'Conferindo o Pix…',
      'Continue com ele, ou cancele antes de pagar de outro jeito: assim nunca ficam dois Pix abertos.', 'Esse Pix não vale mais. Escolha como prefere pagar.', 'Pix aberto de novo. Pague com o código ou o QR Code.', 'O Pix anterior foi cancelado. Você pode recomeçar.']) translated(text);
  }

  // 7) The payment settings with patience (live-payment.js loadPaymentConfigPatiently): a slow or failed first try is tried
  //    again after a pause, saying so (onRetry), instead of falling into the demo (2026-10-08, review).
  {
    const waits = [], retries = [];
    const answers = list => { let n = 0; return async (url, {signal}) => { const next = list[Math.min(n++, list.length - 1)]; if (next === 'hang') return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), {name: 'AbortError'})))); if (next === 'offline') throw new TypeError('Failed to fetch'); return next; }; };
    const ok = {ok: true, status: 200, json: async () => ({mode: 'test', publicKey: 'TEST-abc', interestFree: null})};
    const patient = list => loadPaymentConfigPatiently({timeouts: [20, 40], pause: 5, fetchImpl: answers(list), onRetry: i => retries.push(i), wait: ms => { waits.push(ms); return Promise.resolve(); }});
    assert.deepEqual(await patient(['hang', ok]), {mode: 'test', publicKey: 'TEST-abc'}, 'the first one lost on the way, then the answer: real payments');
    assert.deepEqual([retries, waits], [[1], []], 'a second request beside the first, said aloud');
    retries.length = 0;
    assert.deepEqual(await patient(['offline', ok]), {mode: 'test', publicKey: 'TEST-abc'}, 'a quick failure: asked again');
    assert.deepEqual([retries, waits], [[1], [5]], 'after a pause, said aloud');
    // A slow server is not asked again from scratch (2026-10-08, review: the first try was cut at 2.5 s, and a config that took
    // 3.5 s showed after about 7 s): the first request is kept, and its answer counts even after the second one went out.
    {
      let calls = 0;
      const slow = (url, {signal}) => { calls++; return new Promise((resolve, reject) => { const timer = calls > 1 ? null : setTimeout(() => resolve(ok), 35); signal.addEventListener('abort', () => { clearTimeout(timer); reject(Object.assign(new Error('aborted'), {name: 'AbortError'})); }); }); };   // like fetch: an aborted request never answers
      retries.length = 0;
      const started = Date.now(), config = await loadPaymentConfigPatiently({timeouts: [20, 200], pause: 5, fetchImpl: slow, onRetry: i => retries.push(i), wait: () => Promise.resolve()});
      assert.deepEqual(config, {mode: 'test', publicKey: 'TEST-abc'}, 'the first, slow answer is used');
      assert(Date.now() - started < 150, 'as soon as it comes, not after a second full try');
      assert.deepEqual([calls, retries], [2, [1]], '"Carregando o pagamento…" once the first 2.5 s pass, with a second request beside it');
    }
    assert.deepEqual(await patient(['offline', 'offline']), {mode: 'unreachable'}, 'never heard: unknown, never the demo');
    assert.deepEqual(await patient([{ok: false, status: 503}, {ok: false, status: 503}]), {mode: 'unreachable'});
    retries.length = 0;
    assert.deepEqual(await patient([{ok: false, status: 404}]), {mode: 'off'}, 'no /api (a static preview): the demo, at once');
    assert.deepEqual(await patient([{ok: true, status: 200, json: async () => ({mode: 'off'})}]), {mode: 'off'}, 'the server says off: the demo');
    assert.deepEqual(retries, [], 'a clear answer is not asked again');
    translated('Carregando o pagamento…'); translated('Não conseguimos carregar o pagamento. Verifique sua conexão e tente de novo.');
  }
}

// The Content-Security-Policy: the pieces of the payment step write no inline style (the looks are in cart-page.css).
for (const file of ['dist/payment-notice.js', 'dist/pix-panel.js', 'dist/pending-pix.js']) assert.doesNotMatch(read(file), /style=|\.style\./, `${file}: no inline style`);
assert.doesNotMatch(read('dist/checkout.js'), /\.style\./, 'checkout.js sets no style from script');

console.log('PASS: checkout UX — the refused card notice (the simulator\'s reasons in plain words, its dialog: modal, focus, Esc, Pix, only a whole click outside closes it, reduced motion), the short installments box with the whole table one click away, the Pix screen (steps with checks, a quiet clock that speaks at 5 and 1 minute, how to pay), and the payment step\'s behaviour on a stand-in page (the paid Pix closing with nothing waking up, "Voltar" keeping the focus, refusals routed, the focus after expiry, copy, the Pix remembered by the tab, patient settings), in Portuguese, English and Spanish.');
