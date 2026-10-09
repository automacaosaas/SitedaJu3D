// The Pix screen of the checkout (2026-10-08, the owner: "um loading em 'aguardando pagamento' e, a cada etapa concluída no
// pagamento, um verificado nos passos acima"). Pieces drawn by checkout.js: the four steps, the clock and when it speaks,
// the short "how to pay", and what the payment step decides (below). No page here: what touches a button gets it as an
// argument, so tests/checkout-ux.mjs runs everything in Node, with stand-ins.

export const PIX_STEPS = Object.freeze(['Pedido criado', 'Código Pix gerado', 'Aguardando pagamento', 'Pagamento confirmado']);

// The state of each step: 'done' (✓), 'current' (the step happening now), 'expired' (the code ran out there) or 'next'.
//   waiting → ✓ ✓ ◌ 4   ·   paid → ✓ ✓ ✓ ✓ (the last one current)   ·   expired → ✓ ✓ ⌛ 4
export function pixStepStates(state) {
  if (state === 'paid') return ['done', 'done', 'done', 'done'];
  if (state === 'expired') return ['done', 'done', 'expired', 'next'];
  return ['done', 'done', 'current', 'next'];
}
const CHECK = '<svg class="pix-check" viewBox="0 0 24 24" focusable="false"><path d="m6 12.5 4 4 8-9"/></svg>';
const CLOCK = '<svg class="pix-clock" viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 2"/></svg>';
const SPOKEN = {done: '(etapa concluída)', current: '(etapa atual)', expired: '(o tempo acabou)'};
// An ordered list with aria-current on the step happening now and, for screen readers, how each step stands. `fresh`: the
// steps that have just been concluded, whose check draws itself once (a short transition; none with reduced motion).
export function pixSteps(state, {fresh = []} = {}) {
  const states = pixStepStates(state), current = state === 'paid' ? 3 : 2;
  const items = PIX_STEPS.map((label, i) => {
    const s = states[i], mark = s === 'done' ? CHECK : s === 'current' ? '<i class="pix-wait"></i>' : s === 'expired' ? CLOCK : `<b>${i + 1}</b>`;
    return `<li class="pix-step is-${s}${fresh.includes(i) ? ' is-fresh' : ''}"${i === current ? ' aria-current="step"' : ''}><span class="pix-step-mark" aria-hidden="true">${mark}</span><span class="pix-step-label">${label}</span>${SPOKEN[s] ? `<span class="sr-only">${SPOKEN[s]}</span>` : ''}</li>`;
  }).join('');
  return `<ol role="list" class="pix-steps is-${state === 'paid' ? 'paid' : state === 'expired' ? 'expired' : 'waiting'}" aria-label="Etapas do pagamento por Pix">${items}</ol>`;
}

// "59:59" up to an hour ("60:00" right when a one-hour code is born), "1 h 05 min" above.
export function formatPixClock(seconds) {
  const left = Math.max(0, Math.ceil(Number(seconds) || 0));
  return left > 3600 ? `${Math.floor(left / 3600)} h ${String(Math.floor(left % 3600 / 60)).padStart(2, '0')} min` : `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
}
// The clock is a role="timer" (never read out by itself every second); it speaks only when it crosses 5 minutes and 1 minute
// left, once each. previous/left in seconds; '' when there is nothing to say.
export function pixClockNotice(previous, left) {
  if (!(previous > left)) return '';
  if (previous > 60 && left <= 60 && left > 0) return 'Falta 1 minuto para o código Pix expirar.';
  if (previous > 300 && left <= 300 && left > 60) return 'Faltam 5 minutos para o código Pix expirar.';
  return '';
}

// The three steps of paying, as short as they can be.
export function pixHowTo() {
  return `<div class="pix-howto"><h3>Como pagar</h3><ol role="list"><li><span>Abra o app do seu banco e entre na área Pix.</span></li><li><span>Escolha “Ler QR Code” ou “Pix copia e cola”.</span></li><li><span>Confira o valor e confirme. Esta página avança sozinha.</span></li></ol></div>`;
}

// ── the payment step's decisions (checkout.js does what they say; tests/checkout-ux.mjs runs them on a stand-in page and
//    tests/checkout-browser.mjs runs the whole step in Chrome) ──
// What an answer about the order leads to, from where the page is (checkout.js applyState): 'close' (paid while the Pix
// waits: the steps get their checks, then the confirmation), 'finish' (paid: the confirmation), 'expire' (the code ran
// out), 'refuse' (a card refused, found while "em análise": the notice), 'refused-pix' (a Pix order refused: the Pix's own line
// under the form, never the card's notice), '' (nothing: the Pix is closing already, or nothing changed).
export function nextStep({phase, method, closing} = {}, state) {
  if (closing) return '';
  if (state === 'approved') return phase === 'pix' ? 'close' : 'finish';
  if (state === 'expired') return phase === 'expired' ? '' : 'expire';
  if (state === 'refused') return method === 'pix' ? 'refused-pix' : 'refuse';
  return '';
}
// The closing steps end in the confirmation only if nothing changed meanwhile (the same Pix, still closing, still paying).
export const stillClosing = (order, mpId, stage) => Boolean(order?.closing) && order.mpId === mpId && stage === 'payment';
// What cancelling a waiting Pix left (checkout.js dropPix; result = the answer of /api/payments/cancel, null without one):
// 'paid' when it was paid meanwhile, 'gone' when it can no longer be paid (an expired code cannot be paid anyway), 'kept'
// when Mercado Pago could not confirm (stay on the Pix screen and try again).
export function cancelOutcome(result, expired = false) {
  const state = result?.status === 200 ? result.data?.state : null;
  if (state === 'approved') return 'paid';
  if ((state && state !== 'pending_pix' && state !== 'in_review') || (!state && expired)) return 'gone';
  return 'kept';
}
// A refused attempt that was a Pix (the Brick's bank transfer, or Pix chosen above it) keeps the line under the form; only a
// card opens the notice, whose words and buttons are about the card.
export const isPixAttempt = (selected, chosen) => selected === 'bank_transfer' || chosen === 'pix';
// Whether the keyboard focus is in `area`, or already lost (on the page itself, or nowhere): what is drawn next may take it.
export const focusInside = (doc, area) => { const active = doc?.activeElement; return !active || active === doc.body || Boolean(area?.contains(active)); };
// Focus without the page jumping when the element is in sight; otherwise it is brought to the middle of the screen (the expired
// Pix: its "Gerar novo código Pix", so the focus never falls to the top of the page).
export function focusInSight(element, win = globalThis) {
  if (!element) return false;
  element.focus({preventScroll: true});
  const box = element.getBoundingClientRect();
  if (box.top < 0 || box.bottom > win.innerHeight) element.scrollIntoView({block: 'center', behavior: win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
  return true;
}
// Every button of the Pix screen stops answering while the paid steps close; the screen dims (cart-page.css .is-paid). A
// disabled button drops the keyboard focus to the page: when it was in the screen (or already lost), it waits on the steps,
// which say "Pagamento confirmado", until the confirmation takes it.
export function lockPanel(panel) {
  if (!panel) return;
  const doc = panel.ownerDocument, lost = focusInside(doc, panel);
  panel.querySelectorAll('button').forEach(button => { button.disabled = true; });
  panel.classList.add('is-paid');
  const steps = panel.querySelector('.pix-steps');
  if (lost && steps) { steps.setAttribute('tabindex', '-1'); steps.focus({preventScroll: true}); }
}
// A button waiting for an answer ("Já paguei", "← Voltar", "Gerar novo código Pix", "Alterar dados", "Continuar para
// pagamento"): aria-disabled (it keeps the keyboard focus, which a disabled button would drop to the page; checkout.js ignores
// its clicks meanwhile), the wait in words (in its visible label, [data-label], when it has one, so its arrow stays), then its
// own words again, and the focus back on it if it was there and got lost. With `closing` (the Pix was just paid) it ends
// disabled, like the rest of the closing screen (lockPanel). Returns release({closing}).
export function holdButton(button, text) {
  if (!button) return () => {};
  const doc = button.ownerDocument, html = button.innerHTML, focused = Boolean(doc) && doc.activeElement === button;
  button.setAttribute('aria-disabled', 'true');
  (button.querySelector('[data-label]') || button).textContent = text;
  return ({closing = false} = {}) => {
    if (!button.isConnected) return;
    button.innerHTML = html;
    if (closing) { button.disabled = true; return; }
    button.removeAttribute('aria-disabled');
    if (focused && (!doc.activeElement || doc.activeElement === doc.body)) button.focus({preventScroll: true});
  };
}
// A button held by holdButton (or disabled) does not answer.
export const isHeld = button => Boolean(button?.disabled) || button?.getAttribute?.('aria-disabled') === 'true';
// "Copiar código": 'copied' (the button says "Copiado!" for a moment; both words sit on top of each other, so its width
// never changes), or, when the browser refuses the clipboard, 'selected' (the code selected and the line under it saying
// how to copy it by hand).
export async function copyPixCode({text, clipboard, button, input, hint}) {
  const mark = copied => { button.classList.toggle('is-copied', copied); button.querySelector('.pix-copy-idle')?.setAttribute('aria-hidden', String(copied)); button.querySelector('.pix-copy-done')?.setAttribute('aria-hidden', String(!copied)); };
  try {
    await clipboard.writeText(text);
    if (hint) hint.hidden = true;
    mark(true);
    return 'copied';
  } catch {
    mark(false);
    if (input) { input.focus(); input.setSelectionRange(0, input.value.length); }
    if (hint) hint.hidden = false;
    return 'selected';
  }
}
export const unmarkCopied = button => { button.classList.remove('is-copied'); button.querySelector('.pix-copy-idle')?.setAttribute('aria-hidden', 'false'); button.querySelector('.pix-copy-done')?.setAttribute('aria-hidden', 'true'); };
