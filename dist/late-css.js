// Stylesheets the home does not need for its first paint (2026-10-07, PageSpeed): the product window, the demonstration, the
// mini-cart and the checkout styles. index.html asks for them with media="print" data-late-css (they download without holding
// the first paint, a <noscript> copy for pages without scripts); each one is switched on here, in its own place of the cascade
// (no inline onload: the security policy has no inline scripts). site-shell.js imports this first.
// When (2026-10-09, PageSpeed desktop): none of them changes anything the home shows (computed styles compared at 412, 820 and
// 1350 px), but switching one on makes the browser re-check the whole page against its rules, and in the middle of the load that
// was up to ~60 ms of style work in one go, for each. So they wait for the page to finish loading and then come on one at a time,
// each in an idle moment of its own (requestIdleCallback; a frame apart where it does not exist).
// What opens on top of the page — the product window, the demonstration, the mini-cart — does not wait for that turn: whenStyled(fn)
// (and styleNow()) switch on at once every sheet that has arrived, and the others as they arrive, and run fn when they are all on
// (at once on the pages without late stylesheets). whenStyled(fn, false) waits for the turn, for what is not opening anything.
// No time limit: on a slow connection the window opens a little later, never unstyled; only a stylesheet that fails lets it go.
const links = typeof document === 'undefined' ? [] : [...document.querySelectorAll('link[data-late-css]')];
let styled = !links.length, woken = false, queued = false;
const waiting = [];   // arrived, waiting for their turn
const idle = fn => typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, {timeout: 3000}) : requestAnimationFrame(fn);
const loaded = () => document.readyState === 'complete';
function turn() {
  queued = false;
  waiting.shift()?.();
  queue();
}
function queue() { if (waiting.length && !queued && !woken && loaded()) { queued = true; idle(turn); } }
export const lateCss = Promise.all(links.map(link => new Promise(resolve => {
  const on = () => { link.media = 'all'; resolve(); };
  const arrived = () => { if (woken) on(); else { waiting.push(on); queue(); } };
  if (link.sheet) return arrived();
  link.addEventListener('load', arrived, {once: true});
  link.addEventListener('error', () => resolve(), {once: true});
}))).then(() => { styled = true; });
if (links.length && !loaded()) addEventListener('load', queue, {once: true});
export function styleNow() {
  if (!woken) { woken = true; for (const on of waiting.splice(0)) on(); }
  return lateCss;
}
export const lateCssReady = () => styled;
export function whenStyled(fn, now = true) { if (styled) return fn(); if (now) styleNow(); lateCss.then(() => fn()); }
