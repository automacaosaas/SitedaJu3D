// One entry state keeps the header, pedestal and product from appearing separately.
// The opening screen shows only on the first visit of the browser session (audit A5). Later visits skip it, but the page
// still waits, hidden over the piece's own background colour (journey.js), until the showcase has drawn the piece in
// front (carousel.js calls finishJuReturn): the HTML written in the page (the butterfly, larger than its stage, and the
// header without its bar) never flashes before the piece the visitor was looking at. At most 2.5 s, even if a script fails.
(() => {
  const root = document.documentElement;
  // The showcase's first photo, asked for at once: the piece the home opens on (the one in the address, or the one the
  // visitor was looking at, journey.js), the butterfly when there is none. Not a fixed preload in the HTML, which always
  // fetched the butterfly, also for a visitor coming back to another piece. The same srcset and sizes as the showcase
  // (products.js HERO_SIZES), so this is the very file carousel.js asks for. The picture written in the page (lazy, and
  // hidden while the page waits, experience.css) never fetches another one.
  const PIECES = ['borboletoscopio', 'dinossauroscopio', 'aviaoscopia', 'macacoscopio'];
  const HERO_SIZES = '(max-width: 600px) 56vw, (max-width: 1000px) 310px, (max-width: 1560px) 25vw, 390px';
  const routed = (location.hash.match(/^#produto\/([\w-]+)/) || [])[1], saved = window.juTheme?.product();
  const piece = [routed, saved].find(key => PIECES.includes(key)) || PIECES[0], file = `assets/product-${piece}-cutout`;
  const preload = document.createElement('link');
  preload.rel = 'preload'; preload.as = 'image'; preload.href = `${file}.webp`;
  preload.setAttribute('imagesrcset', `${file}-768.webp 768w, ${file}.webp 1254w`);
  preload.setAttribute('imagesizes', HERO_SIZES);
  preload.setAttribute('fetchpriority', 'high');
  document.head.append(preload);
  let seen = false;
  try { seen = sessionStorage.getItem('ju.opened') === '1'; sessionStorage.setItem('ju.opened', '1'); } catch {}
  if (seen) {
    window.finishJuOpening = () => {};
    document.addEventListener('DOMContentLoaded', () => document.querySelector('.page-opening')?.remove(), {once:true});
    root.classList.add('ju-returning');
    let shown = false;
    window.finishJuReturn = () => {
      if (shown) return;
      shown = true;
      clearTimeout(safety);
      root.classList.replace('ju-returning', 'ju-returned');
      setTimeout(() => root.classList.remove('ju-returned'), 400);
    };
    const safety = setTimeout(() => window.finishJuReturn(), 2500);
    window.addEventListener('pageshow', e => { if (e.persisted) window.finishJuReturn(); });
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
