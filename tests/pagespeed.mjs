// PageSpeed (2026-10-07, mobile 75 on the official domain): what keeps the first paint of the home short. The charset opens
// every page, the import map comes before any module, the home preloads its whole static module graph (generated, so it
// cannot drift), and the stylesheets the first paint does not use arrive late without leaving anything unstyled.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import lightCssModule from './lib/light-css.cjs';
const {lightCss} = lightCssModule;

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// o CSS como o tema claro o lê (os tokens do escuro caem na reserva; tests/lib/light-css.cjs)
const read = file => { const text = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n'); return file.endsWith('.css') ? lightCss(text) : text; };
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
assert.match(read('dist/site-shell.js'), /^import '\.\/late-css\.js';/, 'site-shell.js, the first module, takes charge of them first');
assert.match(read('dist/controller.js'), /const syncStyled=\(\)=>\{const hash=location\.hash;whenStyled\(\(\)=>syncProduct\(hash\),hash\.startsWith\('#produto\/'\)\);\};\nwindow\.addEventListener\('hashchange',syncStyled\);[^\n]*syncStyled\(\);/, 'the product window (also from #produto/<peça>, /personalizar or /3d at load) opens styled, for the address it was opened by; only an address of a piece switches the sheets on at once');
// #produto/<peça>/encaixe opens the demonstration (carousel.js), never the product window over it; the demonstration itself
// opens only with hero-demo.css applied, and so does the mini-cart.
assert.match(read('dist/controller.js'), /function syncProduct\(hash=location\.hash\)\{\n  const \[raw,step,combo\]=hash\.replace/);
assert.match(read('dist/controller.js'), /if\(step==='encaixe'\|\|\(!PRODUCTS\[key\]/);
assert.match(read('dist/hero-demo.js'), /const \[loaded\] = await Promise\.all\(\[ready, styleNow\(\)\]\);/);
assert.match(read('dist/mini-cart.js'), /if \(!lateCssReady\(\)\) return void whenStyled\(\(\) => openMiniCart\(/);
assert.doesNotMatch(read('dist/late-css.js'), /setTimeout/, 'no time limit: on a slow connection the window waits for its styles, never opens unstyled');
// commerce.css (the checkout) no longer styles the showcase demonstration through a loose .demo-controls rule; the demonstration
// keeps that look in its own stylesheet.
const commerce = read('dist/commerce.css');
for (const m of commerce.matchAll(/([^{}]*\.demo-controls[^{}]*)\{/g)) assert(m[1].trim().startsWith(':where(.commerce-page) .demo-controls'), `commerce.css scoped to the checkout: ${m[1].trim()}`);
assert.match(read('dist/hero-demo.css'), /\.demo-controls \{ margin-top: 16px; font-size: 12px; color: var\(--muted\); text-align: center; \}\n\.demo-controls button \{ min-height: 44px; \}/);
for (const page of ['checkout.html', 'comprar-agora.html']) assert.match(read(`dist/${page}`), /<body class="commerce-page"/, `${page}: the checkout keeps the rule`);

// late-css.js itself, with a stand-in document (2026-10-09, PageSpeed desktop: switching a sheet on in the middle of the load was up
// to ~60 ms of style work in one go). Nothing is switched on while the page loads; after the load, one sheet per idle moment, a late
// arrival in its own turn. Something opening on top (whenStyled(fn), styleNow()) switches on at once every sheet that arrived and the
// others as they arrive; whenStyled(fn, false) waits for the turn; a broken sheet never holds the window.
{
  const url = pathToFileURL(path.join(root, 'dist/late-css.js')).href;
  const link = (sheet) => { const listeners = {}; return {media: 'print', sheet, addEventListener: (type, fn) => { listeners[type] = fn; }, fire: type => listeners[type]?.()}; };
  const idle = [], onLoad = [];
  globalThis.requestIdleCallback = fn => { idle.push(fn); };
  globalThis.addEventListener = (type, fn) => { if (type === 'load') onLoad.push(fn); };
  const a = link({}), b = link({}), c = link(null);
  globalThis.document = {readyState: 'interactive', querySelectorAll: selector => selector === 'link[data-late-css]' ? [a, b, c] : []};
  const late = await import(url + '?turn');
  assert.equal(a.media, 'print', 'arrived during the load: waits for its turn');
  assert.equal(idle.length, 0, 'nothing scheduled before the load');
  assert.equal(late.lateCssReady(), false);
  const quiet = [];
  late.whenStyled(() => quiet.push('closed'), false);
  assert.equal(a.media, 'print', 'whenStyled(fn, false) does not hurry them');
  document.readyState = 'complete'; onLoad.splice(0).forEach(fn => fn());
  assert.equal(idle.length, 1, 'after the load: one idle moment at a time');
  idle.shift()();
  assert.deepEqual([a.media, b.media], ['all', 'print'], 'one sheet per idle moment');
  idle.shift()();
  assert.equal(b.media, 'all');
  assert.equal(idle.length, 0, 'nothing left: nothing scheduled');
  c.fire('load');
  assert.equal(c.media, 'print');
  idle.shift()();
  assert.equal(c.media, 'all', 'a late arrival gets a turn of its own');
  await late.lateCss;
  assert.equal(late.lateCssReady(), true);
  assert.deepEqual(quiet, ['closed']);
  const d = link({}), e = link(null), g = link(null);
  idle.length = 0;
  globalThis.document = {readyState: 'interactive', querySelectorAll: selector => selector === 'link[data-late-css]' ? [d, e, g] : []};
  const now = await import(url + '?now');
  const order = [];
  now.whenStyled(() => order.push('dialog'));
  assert.equal(d.media, 'all', 'a window opening: what arrived is switched on at once');
  e.fire('load'); g.fire('error');
  assert.equal(e.media, 'all', 'and the others as they arrive');
  assert.equal(g.media, 'print', 'a broken one is left off');
  assert.equal(idle.length, 0, 'no turns once woken');
  await now.lateCss;
  assert.equal(now.lateCssReady(), true);
  assert.deepEqual(order, ['dialog'], 'waiting callers run on arrival');
  now.whenStyled(() => order.push('now'));
  assert.deepEqual(order, ['dialog', 'now'], 'and at once afterwards');
  assert.equal(now.styleNow(), now.lateCss, 'styleNow() (the demonstration) answers with the same promise');
  const h = link({});
  globalThis.document = {readyState: 'complete', querySelectorAll: selector => selector === 'link[data-late-css]' ? [h] : []};
  const demo = await import(url + '?demo');
  assert.equal(idle.length, 1, 'a page that has already loaded: the turn is scheduled at once');
  await Promise.race([demo.styleNow(), new Promise((_, no) => setTimeout(() => no(new Error('styleNow did not switch it on')), 500))]);
  assert.equal(h.media, 'all', 'styleNow() switches on at once, without waiting for the idle moment');
  delete globalThis.document; delete globalThis.requestIdleCallback; delete globalThis.addEventListener;
  const none = await import(url + '?none');
  assert.equal(none.lateCssReady(), true, 'pages without late stylesheets (and Node) are ready from the start');
}

// ── Data the first scripts need from products.js, generated (tools/sync-entry.cjs) ──
{
  const {sync, data} = require('../tools/sync-entry.cjs');
  for (const [file, [before, after]] of Object.entries(await sync())) assert.equal(after, before, `${file} out of date — run: node tools/sync-entry.cjs`);
  const {PRODUCTS, SOON, artSrcset, HERO_SIZES, showcase} = await import(pathToFileURL(path.join(root, 'dist/products.js')).href);
  const {journeyColors} = await import(pathToFileURL(path.join(root, 'dist/hero-motion.js')).href);
  const {pieces, theme} = await data();
  // journey.js wears, before anything runs, exactly the colours the showcase computes for the piece it opens on: no colour
  // changes (and no transition of the announcement bar or the cards) at load
  const first = Object.keys(PRODUCTS)[0];
  assert.deepEqual(theme, journeyColors(showcase(first).theme));
  assert(read('dist/journey.js').includes(`const defaults = {${Object.entries(theme).map(([k, v]) => `'${k}':'${v}'`).join(', ')}};`));
  // page-entry.js preloads the photo of any piece of the showcase (all of them, in its order), with the showcase's srcset and sizes
  assert.deepEqual(Object.keys(pieces), [...Object.keys(PRODUCTS), ...Object.keys(SOON)]);
  for (const [key, [file, srcset, light]] of Object.entries(pieces)) { const name = PRODUCTS[key]?.catalogImage || PRODUCTS[key]?.image || SOON[key]?.catalogImage || SOON[key]?.image; assert.equal(file, `assets/${name}`); assert.equal(srcset, artSrcset(name, false)); assert.equal(light, artSrcset(name, true)); assert(srcset && light, `${key}: a 768 px photo too (products.js ART_768), and the 512 px one`); }
  assert(read('dist/page-entry.js').includes(`const HERO_SIZES = '${HERO_SIZES}';`));
}

// ── Opening: the page shows as soon as the photo in front is decoded ───────────
{
  const entry = read('dist/page-entry.js'), showcase = read('dist/carousel.js'), experience = read('dist/experience.css'), carouselCss = read('dist/carousel.css');
  // never held more than 2.5 s once the page's scripts have run (DOMContentLoaded), nor 7.5 s in all
  assert.match(entry, /let fallback = setTimeout\(\(\) => window\.finishJuOpening\(\), 7500\);/);
  assert.match(entry, /fallback = setTimeout\(\(\) => window\.finishJuOpening\(\), Math\.max\(0, Math\.min\(2500, 7500 - \(performance\.now\(\) - started\)\)\)\);/);
  // the photo, then at most 150 ms for the fonts (swap + metric fallbacks), and document.fonts is read only after the photo
  // …and only once the first measure is applied (it may come after the photo on a slow phone: no scenery jump, no CLS); the
  // fonts are asked about after a drawn frame (clean layout: no forced reflow)
  assert.match(showcase, /const drawn = Promise\.all\(\[ready\[initial\], firstMeasure\]\)\.then\(afterFrame\)\.then\(\(\) => Promise\.race\(\[document\.fonts\?\.ready, new Promise\(r => setTimeout\(r, 150\)\)\]\)\);/);
  assert.match(showcase, /const afterFrame = \(\) => new Promise\(r => requestAnimationFrame\(\(\) => setTimeout\(r\)\)\);/);
  assert.ok(showcase.indexOf('const firstMeasure = new Promise') < showcase.indexOf('const drawn ='), 'declared before it is awaited');
  assert.match(showcase.slice(showcase.indexOf('function measure()'), showcase.indexOf('// Um estilo só é escrito quando muda')), /render\(\);\n    measured\(\);\n  \}/);
  assert.equal((showcase.replace(/^\s*\/\/.*$/gm, '').match(/document\.fonts/g) || []).length, 1, 'document.fonts read in one place only (it forces a style and layout pass)');
  // no fade on the first photo; the photos that come later still fade in
  assert.match(carouselCss, /\.showcase:not\(\.is-drawn\) \.piece img \{ transition: none; \}/);
  assert.match(showcase, /requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) => region\.classList\.add\('is-drawn'\)\)\);/);
  // only the photo in front is asked for while the showcase is built: the neighbours after it, the demonstration much later
  assert.match(showcase, /\$\{first \? `src="\$\{src\}"` : `data-src="\$\{src\}"`\}/);
  assert.doesNotMatch(showcase.slice(showcase.indexOf('position = target = initial;')), /preloadAround/);
  assert.doesNotMatch(showcase, /requestIdleCallback\(early, \{timeout: 1500\}\)/, 'the demonstration is never prepared in the first seconds');
  // the loader leaves by opacity only (a visibility transition does not run on the compositor)
  assert.match(experience, /\.page-opening \{[^}]*opacity:0; visibility:hidden; transition:opacity \.3s; \}/);
  assert.match(experience, /\.page-opening\.is-leaving \{ visibility:visible; pointer-events:none; \}/);
  assert(entry.indexOf("loader?.classList.add('is-leaving');") < entry.indexOf("root.classList.remove('ju-opening');"));
  assert.doesNotMatch(experience.replace(/\/\*[^]*?\*\//g, ''), /transition:[^;}]*\bvisibility\b/, 'experience.css (the opening screen): no visibility transitions');
}

// ── No forced reflow while the page is built ───────────────────────────────────
{
  const header = read('dist/header-scroll.js'), setup = header.slice(header.indexOf('export function setupScrollHeader'), header.indexOf('const draw = () =>')).replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(setup, /offsetHeight|scrollY|getBoundingClientRect/, 'header-scroll.js reads no layout while setting up');
  assert.match(header, /new ResizeObserver\(\(\[entry\]\) => measured\(entry\.borderBoxSize\?\.\[0\]\?\.blockSize \?\? entry\.target\.offsetHeight\)\)\.observe\(header\);/);
  assert.doesNotMatch(header.slice(header.lastIndexOf("window.addEventListener('pageshow'")), /draw\(\)/, 'the first frame is drawn by the measure, not at setup');
  // 2026-10-09 (PageSpeed desktop, "forced reflow" at catalog.js): the novelty band asks the IntersectionObserver which parts are below
  // the screen, instead of reading their boxes while the page is being built (that forced style and layout of the whole page)
  const catalog = read('dist/catalog.js'), band = catalog.slice(catalog.indexOf("document.querySelectorAll('[data-nvb-reveal]')"), catalog.indexOf('// indo para a vitrine')).replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(band, /getBoundingClientRect|offset(Top|Height|Width)|clientHeight/, 'catalog.js: no layout read while the page is built');
  assert.match(band, /entry\.boundingClientRect\.top > \(entry\.rootBounds\?\.bottom \?\? innerHeight\)\) \{ entry\.target\.classList\.add\('is-pending'\); seen\.observe\(entry\.target\); \}/, 'the same rule as before: what starts below the screen waits for the scroll');
  // under the opening screen the collection is built right after the first frame (its style and layout out of the task that styles
  // the showcase), still before the page shows; on a page without that screen, at once
  assert(catalog.includes("if (/\\bju-(opening|returning)\\b/.test(document.documentElement?.className || '')) { requestAnimationFrame(() => setTimeout(mountAll)); setTimeout(mountAll, 200); }\nelse mountAll();") && catalog.includes('const mountAll = () => { if (mounted) return; mounted = true;'), 'catalog.js: the collection after the first frame, under the opening screen (once; 200 ms later in a tab opened in the background)');
  // the measures of the showcase go to the background (the only one that uses them), not to the .page: an inherited variable written
  // on the .page restyled the whole page at each measure
  assert.doesNotMatch(read('dist/carousel.js'), /put\(page,/);
}

// ── Prices without Intl (its first formatter loads the locale data: ~130 ms of a slow phone's main thread) ──
{
  const {money} = await import(pathToFileURL(path.join(root, 'dist/commerce-config.js')).href);
  const intl = new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'});
  const values = [0, 1, 5, 10, 99, 100, 101, 999, 1000, 26500, 99999, 100000, 123456, 1234567, 100000000, 123456789012, -1, -100, -26500, -123456, 0.5, 1.5, 2.5, 26500.5, -0.5, -0.4, -0];
  for (let c = 0; c < 300000; c += 13) values.push(c);
  for (const cents of values) assert.equal(money(cents), intl.format(cents / 100), `money(${cents})`);
  assert.equal(money(26500), 'R$ 265,00');
  assert.doesNotMatch(read('dist/commerce-config.js'), /new Intl\./);
}

// ── Images: one card photo per card, the size the screen needs ─────────────────
{
  const catalog = read('dist/catalog.js');
  assert.match(catalog, /const CARD_SIZES = '212px';/);
  assert.match(catalog, /srcset="assets\/\$\{preview\} 384w, assets\/\$\{full\} 768w" sizes="\$\{CARD_SIZES\}"/);
  assert.doesNotMatch(catalog, /data-full-src|new Image\(\)/, 'no preview first and the sharp one after');
  assert(Math.max(...[...catalog.matchAll(/--art-h: (\d+)px/g)].map(m => +m[1]), 0) <= 212);
  for (const css of ['catalog.css', 'carousel.css']) for (const m of read(`dist/${css}`).matchAll(/\.home \.product-carousel-stage \{[^}]*--art-h: (\d+)px/g)) assert(+m[1] <= 212, `${css}: the card photo is at most ${m[1]} px tall (CARD_SIZES)`);
  // re-encoded (2026-10-08, WebP ~q78 through Chrome's encoder, the invisible alpha noise cleared): visually the same
  const kb = file => fs.statSync(path.join(root, 'dist/assets', file)).size / 1024;
  for (const [file, limit] of [['card-borboletoscopio.webp', 50], ['retinoscopio.webp', 60], ['aviaoscopia-ruler.webp', 70], ['product-girafoscopio-cutout-768.webp', 30], ['product-unicornioscopio-cutout-768.webp', 30]]) assert(kb(file) <= limit, `${file}: ${Math.round(kb(file))} KB (budget ${limit} KB)`);
}

console.log('PASS: pagespeed — charset first, import map before modules, the home preloads its static module graph (generated), late stylesheets with <noscript> copies and nothing opening unstyled; theme and hero preload generated from products.js; the page shows with the photo in front (no fade, fonts ≤ 150 ms, 2.5 s fallback); no forced reflow at setup; one card photo per card.');
