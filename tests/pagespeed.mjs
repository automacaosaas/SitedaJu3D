// PageSpeed (2026-10-07, mobile 75 on the official domain): what keeps the first paint of the home short. The charset opens
// every page, the import map comes before any module, the home preloads its whole static module graph (generated, so it
// cannot drift), and the stylesheets the first paint does not use arrive late without leaving anything unstyled.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const pages = fs.readdirSync(path.join(root, 'dist')).filter(f => f.endsWith('.html'));
const home = read('dist/index.html');

// ── Head order ─────────────────────────────────────────────────────────────────
for (const page of pages) {
  const html = read(`dist/${page}`);
  assert.match(html, /<head>\n[ \t]*<meta charset="utf-8">\n/, `${page}: <meta charset> first in <head> (within the first 1024 bytes)`);
  assert.equal((html.match(/<meta charset=/g) || []).length, 1, `${page}: one charset`);
  const map = html.indexOf('<script type="importmap">'), firstModule = html.search(/<script type="module"|<link rel="modulepreload"/);
  if (map >= 0) assert(map < firstModule, `${page}: the import map before the first module (a module loaded before it ignores it)`);
}

// ── modulepreload: the home's whole static graph, after the import map, generated ──
{
  const {sync, graph, entries} = require('../tools/sync-modulepreload.cjs');
  assert.equal(sync(home.replace(/\n/g, fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8').includes('\r\n') ? '\r\n' : '\n')), fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8'), 'index.html modulepreload out of date — run: node tools/sync-modulepreload.cjs');
  const listed = [...home.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map(m => m[1]);
  assert.deepEqual(listed, graph(home), 'exactly the static graph');
  assert.deepEqual(entries(home), ['site-shell.js', 'catalog.js', 'carousel.js', 'controller.js']);
  for (const file of ['late-css.js', 'products.js', 'hero-motion.js', 'hero-scenery.js', 'loading-ui.js', 'hero-demo.js', 'motion-timeline.js', 'cart-store.js', 'i18n.js']) assert(listed.includes(file), `preloads ${file}`);
  for (const file of [...entries(home), 'viewer.js', 'i18n-core.js', 'translations.js', 'consent.js']) assert(!listed.includes(file), `${file}: named by the page or loaded only when needed`);
  for (const file of listed) assert(fs.existsSync(path.join(root, 'dist', file)), `${file} exists`);
  assert(home.indexOf('<script type="importmap">') < home.indexOf('<!-- modulepreload -->'));
}

// ── Late stylesheets on the home ───────────────────────────────────────────────
const LATE = ['hero-demo.css', 'mobile-modal.css', 'product-page.css', 'commerce.css', 'mini-cart.css'];
const sheets = [...home.matchAll(/<link rel="stylesheet" href="([^"]+)"([^>]*)>/g)].filter(m => !home.slice(0, m.index).endsWith('<noscript>')).map(m => [m[1], m[2]]);
assert.deepEqual(sheets.map(s => s[0]), ['theme.css', 'experience.css', 'carousel.css', ...LATE.slice(0, 4), 'shopping.css', 'catalog.css', 'mini-cart.css', 'journey.css'], 'same stylesheets in the same cascade order');
for (const [href, attrs] of sheets) {
  if (LATE.includes(href)) {
    assert.equal(attrs, ' media="print" data-late-css', `${href}: downloads without holding the first paint`);
    assert(home.includes(`<link rel="stylesheet" href="${href}" media="print" data-late-css><noscript><link rel="stylesheet" href="${href}"></noscript>`), `${href}: a <noscript> copy right after it, for pages without scripts`);
  } else assert.equal(attrs, '', `${href}: needed for the first paint`);
}
assert.match(read('dist/site-shell.js'), /^import '\.\/late-css\.js';/, 'site-shell.js, the first module, switches them on first');
assert.match(read('dist/controller.js'), /const syncStyled=\(\)=>whenStyled\(syncProduct\);\nwindow\.addEventListener\('hashchange',syncStyled\);[^\n]*syncStyled\(\);/, 'the product window (also from #produto/<peça>/personalizar at load) opens styled');
// commerce.css (the checkout) no longer styles the showcase demonstration through a loose .demo-controls rule; the demonstration
// keeps that look in its own stylesheet.
const commerce = read('dist/commerce.css');
for (const m of commerce.matchAll(/([^{}]*\.demo-controls[^{}]*)\{/g)) assert(m[1].trim().startsWith(':where(.commerce-page) .demo-controls'), `commerce.css scoped to the checkout: ${m[1].trim()}`);
assert.match(read('dist/hero-demo.css'), /\.demo-controls \{ margin-top: 16px; font-size: 12px; color: var\(--muted\); text-align: center; \}\n\.demo-controls button \{ min-height: 44px; \}/);
for (const page of ['checkout.html', 'comprar-agora.html']) assert.match(read(`dist/${page}`), /<body class="commerce-page"/, `${page}: the checkout keeps the rule`);

// late-css.js itself, with a stand-in document: a sheet already there switches on at once, a pending one when it loads, a broken
// one never holds the window; whenStyled runs at once when ready, else on arrival.
{
  const link = (sheet) => { const listeners = {}; return {media: 'print', sheet, addEventListener: (type, fn) => { listeners[type] = fn; }, fire: type => listeners[type]?.()}; };
  const loaded = link({}), pending = link(null), broken = link(null);
  globalThis.document = {querySelectorAll: selector => selector === 'link[data-late-css]' ? [loaded, pending, broken] : []};
  const late = await import(pathToFileURL(path.join(root, 'dist/late-css.js')).href + '?test');
  assert.equal(loaded.media, 'all', 'already loaded: switched on at once');
  assert.equal(pending.media, 'print');
  assert.equal(late.lateCssReady(), false);
  const order = [];
  late.whenStyled(() => order.push('dialog'));
  pending.fire('load'); broken.fire('error');
  assert.equal(pending.media, 'all', 'switched on once it arrives');
  assert.equal(broken.media, 'print', 'a broken one is left off');
  await late.lateCss;
  assert.equal(late.lateCssReady(), true);
  assert.deepEqual(order, ['dialog'], 'waiting callers run on arrival');
  late.whenStyled(() => order.push('now'));
  assert.deepEqual(order, ['dialog', 'now'], 'and at once afterwards');
  delete globalThis.document;
  const none = await import(pathToFileURL(path.join(root, 'dist/late-css.js')).href + '?none');
  assert.equal(none.lateCssReady(), true, 'pages without late stylesheets (and Node) are ready from the start');
}

console.log('PASS: pagespeed — charset first, import map before modules, the home preloads its static module graph (generated), late stylesheets with <noscript> copies and nothing opening unstyled.');
