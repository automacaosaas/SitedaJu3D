import {COMMERCE} from './commerce-config.js';

// Rotating bar above the header (envio, Pix e cartão, prazo). Five seconds per message; it stops while the pointer or the
// keyboard is on it, has a pause button (WCAG 2.2.2) and never moves by itself with prefers-reduced-motion.
// Colors follow the active product theme (--theme-wash / --theme-accent, see journey.js).
const ICONS = {
  truck: '<path d="M3 6.5h11v9H3zM14 9.5h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>',
  pix: '<path d="M12 2.8 21.2 12 12 21.2 2.8 12z"/><path d="m8.5 12 3.5-3.5 3.5 3.5-3.5 3.5z"/>',
  card: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  prev: '<path d="m15 5-7 7 7 7"/>', next: '<path d="m9 5 7 7-7 7"/>', pause: '<path d="M9 6v12M15 6v12"/>', play: '<path d="M8 5.5v13l10-6.5z"/>'
};
const svg = name => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

export const MESSAGES = Object.freeze([
  {icons: ['truck'], title: 'ENVIO PARA TODO O BRASIL', text: 'Frete calculado pelo CEP'},
  {icons: ['pix', 'card'], title: 'PIX E CARTÃO', text: '5% off no Pix ou 3x sem juros no cartão'},
  {icons: ['clock'], title: 'FEITO SOB ENCOMENDA', text: `Produção em ${COMMERCE.productionLabel}`}
]);
export const INTERVAL_MS = 5000;

// The rotation itself, without the DOM, so it can be tested with fake timers.
export function createRotator({count, onShow, interval = INTERVAL_MS, reduce = false, timers = globalThis}) {
  let index = 0, timer = null, paused = reduce, holds = 0;
  const run = () => {
    timers.clearInterval(timer); timer = null;
    if (!paused && !holds && count > 1) timer = timers.setInterval(() => go(index + 1), interval);
  };
  const go = next => { index = (next % count + count) % count; onShow(index); };
  return {
    get index() { return index; }, get paused() { return paused; }, get running() { return timer !== null; },
    next() { go(index + 1); run(); }, prev() { go(index - 1); run(); },
    toggle() { paused = !paused; run(); return paused; },
    hold() { holds++; run(); }, release() { holds = Math.max(0, holds - 1); run(); },
    start() { onShow(index); run(); }
  };
}

export function mountAnnouncementBar({doc = document, win = window} = {}) {
  if (doc.querySelector('.announce-bar')) return null;
  const bar = doc.createElement('div');
  bar.className = 'announce-bar';
  bar.setAttribute('role', 'region'); bar.setAttribute('aria-roledescription', 'carrossel'); bar.setAttribute('aria-label', 'Vantagens da loja');
  bar.innerHTML = `<button type="button" class="announce-btn" data-announce="prev" aria-label="Mensagem anterior">${svg('prev')}</button>`
    + `<div class="announce-track" aria-live="off">${MESSAGES.map((m, i) => `<p class="announce-msg" role="group" aria-roledescription="mensagem" aria-label="${i + 1} de ${MESSAGES.length}"><span class="announce-icons">${m.icons.map(svg).join('')}</span><strong>${m.title}</strong><span class="announce-text">${m.text}</span></p>`).join('')}</div>`
    + `<button type="button" class="announce-btn" data-announce="next" aria-label="Próxima mensagem">${svg('next')}</button>`
    + `<button type="button" class="announce-btn" data-announce="pause" aria-label="Pausar mensagens">${svg('pause')}</button>`;
  const page = doc.querySelector('.page');
  if (page) page.before(bar); else doc.body.prepend(bar);

  const items = [...bar.querySelectorAll('.announce-msg')], track = bar.querySelector('.announce-track'), pause = bar.querySelector('[data-announce="pause"]');
  let shown = -1;
  const show = i => {
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
  const paint = () => {
    pause.innerHTML = svg(rotator.paused ? 'play' : 'pause');
    pause.setAttribute('aria-label', rotator.paused ? 'Retomar mensagens' : 'Pausar mensagens');
    // Announce changes only when nothing moves by itself; a live region that speaks every five seconds is noise.
    track.setAttribute('aria-live', rotator.paused ? 'polite' : 'off');
  };
  bar.addEventListener('click', event => {
    const action = event.target.closest('[data-announce]')?.dataset.announce;
    if (action === 'pause') rotator.toggle(); else if (action === 'next') rotator.next(); else if (action === 'prev') rotator.prev();
    paint();
  });
  bar.addEventListener('pointerenter', () => rotator.hold()); bar.addEventListener('pointerleave', () => rotator.release());
  bar.addEventListener('focusin', () => rotator.hold()); bar.addEventListener('focusout', () => rotator.release());
  rotator.start(); paint();
  return {bar, rotator};
}
