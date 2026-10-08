// Stylesheets the home does not need for its first paint (2026-10-07, PageSpeed): the product window, the demonstration, the
// mini-cart and the checkout styles. index.html asks for them with media="print" data-late-css (they download without holding
// the first paint, a <noscript> copy for pages without scripts); each one is switched on here once it has arrived, in its own
// place of the cascade (no inline onload: the security policy has no inline scripts). site-shell.js imports this first.
// What opens on top of the page — the product window, the demonstration, the mini-cart — waits for them: whenStyled(fn) runs fn
// at once when they are ready (always, on the pages without late stylesheets), or as soon as they arrive.
const links = typeof document === 'undefined' ? [] : [...document.querySelectorAll('link[data-late-css]')];
let styled = !links.length;
export const lateCss = Promise.all(links.map(link => new Promise(resolve => {
  let timer = 0;
  const done = () => { clearTimeout(timer); resolve(); };
  const on = () => { link.media = 'all'; done(); };
  if (link.sheet) return on();
  link.addEventListener('load', on, {once: true});
  link.addEventListener('error', done, {once: true});
  timer = setTimeout(done, 8000);   // a stylesheet that never answers never keeps the window closed
}))).then(() => { styled = true; });
export const lateCssReady = () => styled;
export function whenStyled(fn) { if (styled) return fn(); lateCss.then(fn); }
