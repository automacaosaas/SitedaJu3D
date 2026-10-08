// The Pix screen of the checkout (2026-10-08, the owner: "um loading em 'aguardando pagamento' e, a cada etapa concluída no
// pagamento, um verificado nos passos acima"). Pure pieces, drawn by checkout.js: the four steps, the clock and when it
// speaks, and the short "how to pay". No DOM here, so tests/checkout-ux.mjs runs them in Node.

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
