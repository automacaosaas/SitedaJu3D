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
  // hidden while the page waits, experience.css) never fetches another one. Every piece of the showcase, with its photo and
  // srcset, comes from products.js (tools/sync-entry.cjs).
  // <entry-data> written by tools/sync-entry.cjs from products.js — do not edit by hand
  const PIECES = {'borboletoscopio':['assets/product-borboletoscopio-cutout.webp', 'assets/product-borboletoscopio-cutout-768.webp 768w, assets/product-borboletoscopio-cutout.webp 1254w'], 'dinossauroscopio':['assets/product-dinossauroscopio-cutout.webp', 'assets/product-dinossauroscopio-cutout-768.webp 768w, assets/product-dinossauroscopio-cutout.webp 1254w'], 'aviaoscopia':['assets/product-aviaoscopia-cutout.webp', 'assets/product-aviaoscopia-cutout-768.webp 768w, assets/product-aviaoscopia-cutout.webp 1254w'], 'macacoscopio':['assets/product-macacoscopio-cutout.webp', 'assets/product-macacoscopio-cutout-768.webp 768w, assets/product-macacoscopio-cutout.webp 1254w'], 'girafoscopio':['assets/product-girafoscopio-cutout.webp', 'assets/product-girafoscopio-cutout-768.webp 768w, assets/product-girafoscopio-cutout.webp 1254w'], 'unicornioscopio':['assets/product-unicornioscopio-cutout.webp', 'assets/product-unicornioscopio-cutout-768.webp 768w, assets/product-unicornioscopio-cutout.webp 1254w']};
  const ALIASES = {'capa-01':'borboletoscopio', 'capa-02':'dinossauroscopio', 'aviao-magnetico':'aviaoscopia'};
  const HERO_SIZES = '(max-width: 600px) 56vw, (max-width: 1000px) 310px, (max-width: 1560px) 25vw, 390px';
  // </entry-data>
  const routed = (location.hash.match(/^#produto\/([\w-]+)/) || [])[1], saved = window.juTheme?.product();
  const asked = Object.hasOwn(ALIASES, routed || '') ? ALIASES[routed] : routed;
  const piece = [asked, saved].find(key => Object.hasOwn(PIECES, key || '')) || Object.keys(PIECES)[0], [file, srcset] = PIECES[piece];
  const preload = document.createElement('link');
  preload.rel = 'preload'; preload.as = 'image'; preload.href = file;
  if (srcset) { preload.setAttribute('imagesrcset', srcset); preload.setAttribute('imagesizes', HERO_SIZES); }
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
    // the loader fades by opacity alone (.is-leaving keeps it visible meanwhile, experience.css): a visibility transition
    // would not run on the compositor
    const loader = document.querySelector('.page-opening');
    loader?.classList.add('is-leaving');
    root.classList.remove('ju-opening');
    root.classList.add('ju-arrived');
    setTimeout(() => root.classList.remove('ju-arrived'), 1200);
    document.querySelector('.page')?.removeAttribute('inert');
    if (loader) {
      loader.setAttribute('aria-hidden', 'true');
      setTimeout(() => loader.remove(), 350);
    }
  };
  // The showcase reveals the page as soon as the piece in front is drawn (carousel.js). Otherwise 2.5 s after the page's
  // scripts have run (DOMContentLoaded comes after the modules): a slow photo or a script that failed never holds it longer,
  // and a slow phone still building the showcase is not caught half-way (the page written in the HTML would then jump).
  // 7.5 s at most in any case.
  const started = performance.now();
  let fallback = setTimeout(() => window.finishJuOpening(), 7500);
  document.addEventListener('DOMContentLoaded', () => {
    if (finished) return;
    document.querySelector('.page')?.setAttribute('inert', '');
    clearTimeout(fallback);
    fallback = setTimeout(() => window.finishJuOpening(), Math.max(0, Math.min(2500, 7500 - (performance.now() - started))));
  }, {once:true});
  window.addEventListener('pageshow', e => { if (e.persisted) window.finishJuOpening(); });
})();
