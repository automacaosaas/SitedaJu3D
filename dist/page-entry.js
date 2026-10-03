// One entry state keeps the header, pedestal and product from appearing separately.
// The opening screen shows only on the first visit of the browser session (audit A5): later visits show the shop at once.
(() => {
  const root = document.documentElement;
  let seen = false;
  try { seen = sessionStorage.getItem('ju.opened') === '1'; sessionStorage.setItem('ju.opened', '1'); } catch {}
  if (seen) {
    window.finishJuOpening = () => {};
    document.addEventListener('DOMContentLoaded', () => document.querySelector('.page-opening')?.remove(), {once:true});
    return;
  }
  root.classList.add('ju-opening');
  let finished = false;
  window.finishJuOpening = () => {
    if (finished) return;
    finished = true;
    clearTimeout(fallback);
    root.classList.remove('ju-opening');
    root.classList.add('ju-arrived');
    setTimeout(() => root.classList.remove('ju-arrived'), 1200);
    document.querySelector('.page')?.removeAttribute('inert');
    const loader = document.querySelector('.page-opening');
    if (loader) {
      loader.setAttribute('aria-hidden', 'true');
      setTimeout(() => loader.remove(), 350);
    }
  };
  const fallback = setTimeout(() => window.finishJuOpening(), 7500);
  document.addEventListener('DOMContentLoaded', () => {
    if (!finished) document.querySelector('.page')?.setAttribute('inert', '');
  }, {once:true});
  window.addEventListener('pageshow', e => { if (e.persisted) window.finishJuOpening(); });
})();
