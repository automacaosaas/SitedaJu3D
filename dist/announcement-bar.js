import {COMMERCE} from './commerce-config.js';

// Rotating bar above the header (envio, Pix e cartão, prazo). Five seconds per message, each one rising into place. It stops while
// the pointer or the keyboard is on it; the arrows (up on the left, down on the right, the message centred between them) move one
// message and hand the bar over to the visitor (it no longer moves by itself: the way to stop it, WCAG 2.2.2); it never moves
// by itself with prefers-reduced-motion.
// Colors follow the active product theme (--theme-wash / --theme-accent, see journey.js).
// The Pix symbol is the official one (path from Simple Icons, CC0), filled; the other symbols are line drawings.
export const PIX_PATH = 'M5.283 18.36a3.505 3.505 0 0 0 2.493-1.032l3.6-3.6a.684.684 0 0 1 .946 0l3.613 3.613a3.504 3.504 0 0 0 2.493 1.032h.71l-4.56 4.56a3.647 3.647 0 0 1-5.156 0L4.85 18.36ZM18.428 5.627a3.505 3.505 0 0 0-2.493 1.032l-3.613 3.614a.67.67 0 0 1-.946 0l-3.6-3.6A3.505 3.505 0 0 0 5.283 5.64h-.434l4.573-4.572a3.646 3.646 0 0 1 5.156 0l4.559 4.559ZM1.068 9.422 3.79 6.699h1.492a2.483 2.483 0 0 1 1.744.722l3.6 3.6a1.73 1.73 0 0 0 2.443 0l3.614-3.613a2.482 2.482 0 0 1 1.744-.723h1.767l2.737 2.737a3.646 3.646 0 0 1 0 5.156l-2.736 2.736h-1.768a2.482 2.482 0 0 1-1.744-.722l-3.613-3.613a1.77 1.77 0 0 0-2.444 0l-3.6 3.6a2.483 2.483 0 0 1-1.744.722H3.791l-2.723-2.723a3.646 3.646 0 0 1 0-5.156';
const ICONS = {
  truck: '<path d="M3 6.5h11v9H3zM14 9.5h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>',
  pix: `<path fill="currentColor" stroke="none" d="${PIX_PATH}"/>`,
  card: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>'
};
const svg = name => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

export const MESSAGES = Object.freeze([
  {icons: ['truck'], title: 'ENVIO PARA TODO O BRASIL', text: 'Frete calculado pelo CEP'},
  {icons: ['pix', 'card'], title: 'PIX E CARTÃO', text: '5% off no Pix ou 3x sem juros no cartão'},
  {icons: ['clock'], title: 'FEITO SOB ENCOMENDA', text: `Produção em ${COMMERCE.productionLabel}`}
]);
export const INTERVAL_MS = 5000;

// The rotation itself, without the DOM, so it can be tested with fake timers. onShow(index, direction): +1 rises from below, −1 comes down.
export function createRotator({count, onShow, interval = INTERVAL_MS, reduce = false, timers = globalThis}) {
  let index = 0, timer = null, stopped = reduce, holds = 0;
  const run = () => {
    timers.clearInterval(timer); timer = null;
    if (!stopped && !holds && count > 1) timer = timers.setInterval(() => go(index + 1, 1), interval);
  };
  const go = (next, direction) => { index = (next % count + count) % count; onShow(index, direction); };
  return {
    get index() { return index; }, get stopped() { return stopped; }, get running() { return timer !== null; },
    // the visitor took over: one message, and no more rotating by itself
    next() { stopped = true; go(index + 1, 1); run(); }, prev() { stopped = true; go(index - 1, -1); run(); },
    hold() { holds++; run(); }, release() { holds = Math.max(0, holds - 1); run(); },
    start() { onShow(index, 1); run(); }
  };
}

export function mountAnnouncementBar({doc = document, win = window} = {}) {
  if (doc.querySelector('.announce-bar')) return null;
  const bar = doc.createElement('div');
  bar.className = 'announce-bar';
  bar.setAttribute('role', 'region'); bar.setAttribute('aria-roledescription', 'carrossel'); bar.setAttribute('aria-label', 'Vantagens da loja');
  bar.innerHTML = `<button type="button" class="announce-btn" data-announce="prev" aria-label="Mensagem anterior">${svg('up')}</button>`
    + `<div class="announce-track" aria-live="off">${MESSAGES.map((m, i) => `<p class="announce-msg" role="group" aria-roledescription="mensagem" aria-label="${i + 1} de ${MESSAGES.length}"><span class="announce-icons">${m.icons.map(svg).join('')}</span><strong>${m.title}</strong><span class="announce-text">${m.text}</span></p>`).join('')}</div>`
    + `<button type="button" class="announce-btn" data-announce="next" aria-label="Próxima mensagem">${svg('down')}</button>`;
  const page = doc.querySelector('.page');
  if (page) page.before(bar); else doc.body.prepend(bar);

  const items = [...bar.querySelectorAll('.announce-msg')], track = bar.querySelector('.announce-track');
  let shown = -1;
  const show = (i, direction = 1) => {
    bar.dataset.direction = direction < 0 ? 'down' : 'up';   // the arrow up brings the previous message down from above
    items.forEach((item, k) => {
      const on = k === i;
      item.classList.toggle('is-on', on);
      item.classList.toggle('is-out', !on && k === shown);
      item.setAttribute('aria-hidden', on ? 'false' : 'true');
    });
    shown = i;
  };
  const reduce = Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const rotator = createRotator({count: items.length, onShow: show, reduce});
  // Announce changes only when nothing moves by itself; a live region that speaks every five seconds is noise.
  const paint = () => track.setAttribute('aria-live', rotator.stopped ? 'polite' : 'off');
  bar.addEventListener('click', event => {
    const action = event.target.closest('[data-announce]')?.dataset.announce;
    if (action === 'next') rotator.next(); else if (action === 'prev') rotator.prev();
    paint();
  });
  bar.addEventListener('pointerenter', () => rotator.hold()); bar.addEventListener('pointerleave', () => rotator.release());
  bar.addEventListener('focusin', () => rotator.hold()); bar.addEventListener('focusout', () => rotator.release());
  rotator.start(); paint();
  return {bar, rotator};
}