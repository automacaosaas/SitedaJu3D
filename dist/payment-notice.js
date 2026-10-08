// The notice for a refused card (2026-10-08, the owner: the sentence "apareceu, mas embaixo de uma tabela gigantesca de
// parcelas… colocar essa mensagem como um pop up de inválido"). A modal <dialog> opened with showModal(): focus goes into it
// (the main button), the rest of the page waits behind it, Esc, the close button and a click outside close it, and the
// checkout decides where focus goes next (the card form, or the Pix option). role="alertdialog" with its title and its two
// sentences (aria-labelledby / aria-describedby), so a screen reader says why at once. On phones it rises from the bottom as
// a sheet (cart-page.css). The words come from live-payment.js refusalNotice(); Mercado Pago's own code shows only in the
// test environment. Nothing is drawn until the first refusal.
import {icon} from './icons.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const MARK = '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><rect x="5" y="11" width="32" height="22" rx="4" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M5 18h32M11 27h7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="36" cy="33" r="9" fill="currentColor"/><path d="m32.6 29.6 6.8 6.8m0-6.8-6.8 6.8" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>';

// The inside of the notice. notice: {reason, todo, retry, pix} (refusalNotice); code: Mercado Pago's own code (test only);
// pixPrice: what the order costs with Pix, beside "Pagar com Pix".
export function refusalNoticeMarkup(notice, {code = '', pixPrice = ''} = {}) {
  const pix = notice.pix ? `<button type="button" class="pay-notice-pix" data-notice="pix"><span class="method-symbol" aria-hidden="true">${icon('pix')}</span><span>Pagar com Pix</span>${pixPrice ? `<b>${esc(pixPrice)}</b>` : ''}</button>` : '';
  const test = code ? `<p class="pay-notice-code"><span>Código do Mercado Pago (teste):</span> <code translate="no">${esc(code)}</code></p>` : '';
  return `<div class="pay-notice-body"><span class="pay-notice-mark">${MARK}</span><h2 id="pay-notice-title">Pagamento não aprovado</h2><p id="pay-notice-reason" class="pay-notice-reason">${esc(notice.reason)}</p><p id="pay-notice-todo" class="pay-notice-todo">${esc(notice.todo)}</p>${test}<div class="pay-notice-actions"><button type="button" class="primary pay-notice-retry" data-notice="retry">${esc(notice.retry)}</button>${pix}</div></div><button type="button" class="pay-notice-close" data-notice="close">${CLOSE}<span class="sr-only">Fechar aviso</span></button>`;
}

let settle = null;   // what the checkout wants done with the answer (one notice at a time)
const reduced = win => Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
// Closes with a short fade (none with reduced motion); `choice` is "retry", "pix" or "close" (Esc, ×, outside).
function finish(dialog, choice) {
  if (!dialog.open || dialog.classList.contains('is-closing')) return;
  const win = dialog.ownerDocument.defaultView || globalThis;
  if (reduced(win)) return dialog.close(choice);
  dialog.classList.add('is-closing');
  win.setTimeout(() => { dialog.classList.remove('is-closing'); if (dialog.open) dialog.close(choice); }, 160);
}
function create(doc) {
  const dialog = doc.createElement('dialog');
  dialog.id = 'pay-notice'; dialog.className = 'pay-notice';
  dialog.setAttribute('role', 'alertdialog'); dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'pay-notice-title'); dialog.setAttribute('aria-describedby', 'pay-notice-reason pay-notice-todo');
  // the buttons answer; a click on the dimmed page around the notice (the dialog itself, outside its body) closes it
  dialog.addEventListener('click', event => { const choice = event.target.closest?.('[data-notice]')?.dataset.notice; if (choice) finish(dialog, choice); else if (event.target === dialog) finish(dialog, 'close'); });
  dialog.addEventListener('cancel', event => { event.preventDefault(); finish(dialog, 'close'); });   // Esc
  dialog.addEventListener('close', () => { const answer = settle; settle = null; answer?.(dialog.returnValue || 'close'); });
  doc.body.append(dialog);
  return dialog;
}

// Opens the notice; onChoice(choice) runs once it is closed. Calling it again while open replaces the words.
export function openRefusalNotice({notice, code = '', pixPrice = '', onChoice = () => {}, doc = document} = {}) {
  const dialog = doc.getElementById('pay-notice') || create(doc);
  dialog.innerHTML = refusalNoticeMarkup(notice, {code, pixPrice});
  dialog.classList.remove('is-closing');
  settle = onChoice;
  if (!dialog.open) { dialog.returnValue = ''; dialog.showModal(); }
  dialog.querySelector('[data-notice="retry"]')?.focus();
  return dialog;
}
