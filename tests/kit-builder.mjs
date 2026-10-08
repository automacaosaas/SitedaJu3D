// "Monte seu kit" (dist/kit-builder.js, 07/10/2026): the lamp kit priced like the cart and the server (1 for R$ 90, 2 for R$ 160,
// 3 for R$ 210, mixing allowed), the one-tap tiers, the steppers, the live total and the add button, plus where it is mounted (the
// product dialog's white area and the lamp pages). Run: node tests/kit-builder.mjs — no browser (a tiny stand-in for the DOM).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = file => import(pathToFileURL(path.join(root, 'dist', file)).href);
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const {kitItems, kitTiers, kitPreset, kitLines, kitQuote, mountKit, KIT_MAX} = await site('kit-builder.js');
const {normalizeCart, putItems, totals} = await site('cart-store.js');
const {COMMERCE, money} = await site('commerce-config.js');
const {translate} = await site('i18n-core.js');

// ── the numbers ───────────────────────────────────────────────────────
{
  assert.deepEqual(kitItems('unicornioscopio'), ['macacoscopio', 'girafoscopio', 'unicornioscopio'], 'the three lamps, in the kit order');
  assert.deepEqual(kitItems('aviaoscopia'), [], 'a piece without a kit');
  assert.deepEqual(kitTiers('girafoscopio'), [{units: 1, cents: 9000, each: 9000}, {units: 2, cents: 16000, each: 8000}, {units: 3, cents: 21000, each: 7000}]);
  assert.deepEqual(kitPreset('macacoscopio', 1), {macacoscopio: 1, girafoscopio: 0, unicornioscopio: 0}, '1 = only this lamp');
  assert.deepEqual(kitPreset('girafoscopio', 2), {macacoscopio: 0, girafoscopio: 1, unicornioscopio: 1}, '2 = this lamp and the next one');
  assert.deepEqual(kitPreset('unicornioscopio', 2), {macacoscopio: 1, girafoscopio: 0, unicornioscopio: 1}, 'the next one wraps around');
  assert.deepEqual(kitPreset('unicornioscopio', 3), {macacoscopio: 1, girafoscopio: 1, unicornioscopio: 1}, '3 = one of each');
  const q = counts => { const r = kitQuote(counts); return [r.units, r.full, r.total, r.saving, r.pix]; };
  assert.deepEqual(q({unicornioscopio: 1}), [1, 9000, 9000, 0, 8550]);
  assert.deepEqual(q({girafoscopio: 1, unicornioscopio: 1}), [2, 18000, 16000, 2000, 15200], '2 for R$ 160 (R$ 152 with Pix)');
  assert.deepEqual(q(kitPreset('macacoscopio', 3)), [3, 27000, 21000, 6000, 19950], '3 for R$ 210');
  assert.deepEqual(q({macacoscopio: 2, girafoscopio: 2}), [4, 36000, 30000, 6000, 28500], '4: a group of 3 and one at full price');
  assert.deepEqual(q({}), [0, 0, 0, 0, 0]);
  assert.deepEqual(kitLines({macacoscopio: 30, aviaoscopia: 0, nope: 2, __proto__: 1}).map(l => [l.productId, l.quantity]), [['macacoscopio', KIT_MAX]], 'only real pieces, up to the stepper limit');
  // the kit is grouped across the whole cart: with a giraffe already there, one unicorn adds R$ 70, not R$ 90
  const cart = normalizeCart([{productId: 'girafoscopio', quantity: 1}]);
  const withCart = kitQuote({unicornioscopio: 1}, cart);
  assert.equal(withCart.total, 9000); assert.equal(withCart.added, 7000);
  assert.equal(totals(putItems(cart, kitLines({unicornioscopio: 1})), 0).subtotal - totals(cart, 0).subtotal, withCart.added, 'what the block says is what the cart charges');
  assert.equal(kitQuote({unicornioscopio: 1}, normalizeCart([{productId: 'aviaoscopia', quantity: 1}])).added, 9000, 'other pieces do not change the kit');
}

// ── the block, on a tiny stand-in DOM ─────────────────────────────────
class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.dataset = {}; this.style = {}; this.className = ''; this.text = ''; this.listeners = {}; this.hidden = false; this.disabled = false; this.parent = null; }
  get classList() { const el = this; const list = () => new Set(el.className.split(' ').filter(Boolean)); return {toggle(name, on) { const set = list(); if (on ?? !set.has(name)) set.add(name); else set.delete(name); el.className = [...set].join(' '); }, contains: name => list().has(name)}; }
  append(...nodes) { for (const n of nodes) { const node = typeof n === 'string' ? Object.assign(new Node('#text'), {text: n}) : n; node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  set textContent(value) { this.children = []; this.text = String(value); }
  get textContent() { return this.text + this.children.map(c => c.textContent).join(''); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  insertAdjacentHTML(where, html) { this.children.unshift(Object.assign(new Node('#html'), {html})); }
  addEventListener(type, fn, options) { (this.listeners[type] ||= []).push(fn); options?.signal?.addEventListener('abort', () => { this.listeners[type] = this.listeners[type].filter(f => f !== fn); }); }
  closest(selector) { const key = /^\[data-([a-z-]+)\]$/.exec(selector)?.[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase()); for (let el = this; el; el = el.parent) if (key && key in el.dataset) return el; return null; }
  all(test) { return [this, ...this.children.flatMap(c => c.all(test))].filter(test); }
  one(className) { return this.all(el => el.className.split(' ').includes(className))[0]; }
  each(className) { return this.all(el => el.className.split(' ').includes(className)); }
}
const windowListeners = {};
globalThis.document = {createElement: tag => new Node(tag)};
globalThis.window = {addEventListener(type, fn, options) { (windowListeners[type] ||= []).push(fn); options?.signal?.addEventListener('abort', () => { windowListeners[type] = windowListeners[type].filter(f => f !== fn); }); }};
const click = el => { for (let node = el; node; node = node.parent) for (const fn of node.listeners.click || []) fn({target: el}); };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
{
  let cart = [], added = null, fail = null;
  const host = new Node('div');
  const kit = mountKit(host, {current: 'unicornioscopio', cart: () => cart, onAdd: async lines => { if (fail) throw new Error(fail); added = lines; }});
  const tiers = host.each('kit-tier'), rows = host.each('kit-row'), addButton = host.one('kit-add'), status = host.one('kit-status');
  const qty = () => host.each('kit-qty').map(o => o.textContent).join(','), pressed = () => tiers.map(t => t.getAttribute('aria-pressed')).join(',');
  assert.equal(tiers.length, 3); assert.equal(rows.length, 3);
  assert.deepEqual(tiers.map(t => t.textContent), [`1 por${money(9000)}`, `2 por${money(16000)}${money(8000)} cada`, `3 por${money(21000)}${money(7000)} cada`], 'the tiers: 1 por R$ 90,00 · 2 por R$ 160,00 (R$ 80,00 cada) · 3 por R$ 210,00 (R$ 70,00 cada)');
  assert.equal(qty(), '0,0,1', 'it opens with this lamp, one unit'); assert.equal(pressed(), 'true,false,false');
  // one lamp is not a kit yet: "Total" and "Adicionar ao carrinho" (08/10/2026); from two on, "Total do kit" and "Adicionar o kit ao carrinho"
  assert.equal(host.one('kit-total').textContent.replace(/\s/g, ' '), `Total${money(9000)}${money(9000)}`.replace(/\s/g, ' '));
  assert.equal(addButton.textContent.trim(), 'Adicionar ao carrinho');
  assert.ok(host.one('kit-total').children[1].children[0].hidden, 'no struck price for a single lamp'); assert.ok(host.one('kit-saving').hidden);
  assert.equal(host.one('kit-pix').textContent, `${money(8550)} no Pix`);
  // what changed is announced once, by a status line of its own (usabilidade 4): how many of each lamp, then the total
  const said = host.one('sr-only');
  assert.equal(said.getAttribute('role'), 'status'); assert.equal(host.one('kit-sum').getAttribute('aria-live'), null, 'the total is not announced twice');
  assert.equal(said.textContent, '', 'nothing said before a tap');
  assert.ok(host.one('kit-cart-note').hidden, 'nothing in the cart: no cart line');
  assert.deepEqual(rows.map(r => r.all(el => el.tag === 'img')[0].src), ['assets/card-preview-macacoscopio.webp', 'assets/card-preview-girafoscopio.webp', 'assets/card-preview-unicornioscopio.webp']);
  assert.deepEqual(rows[0].each('kit-step').map(b => b.getAttribute('aria-label')), ['Diminuir quantidade de MonkeyLamp', 'Aumentar quantidade de MonkeyLamp']);
  assert.equal(rows[0].one('kit-stepper').getAttribute('aria-label'), 'Quantidade de MonkeyLamp');
  // one-tap presets
  click(tiers[1].children[1]); assert.equal(qty(), '1,0,1', '2 = the unicorn and the next lamp'); assert.equal(pressed(), 'false,true,false');
  assert.equal(said.textContent, `MonkeyLamp: 1, UnicornLamp: 1. Total do kit ${money(16000)}`, 'the quantities and the total are announced');
  assert.equal(host.one('kit-total-label').textContent, 'Total do kit'); assert.equal(addButton.textContent.trim(), 'Adicionar o kit ao carrinho');
  assert.equal(host.one('kit-total').children[1].textContent, `${money(18000)}${money(16000)}`); assert.equal(host.one('kit-saving').textContent, `economize ${money(2000)}`);
  assert.equal(host.one('kit-pix').textContent, `${money(15200)} no Pix`);
  click(tiers[2]); assert.equal(qty(), '1,1,1'); assert.equal(pressed(), 'false,false,true');
  // the steppers: 0 to 9, the tier follows the total units
  click(rows[1].one('is-plus')); assert.equal(qty(), '1,2,1'); assert.equal(pressed(), 'false,false,false', 'four lamps: no tier');
  assert.equal(said.textContent, `MonkeyLamp: 1, GiraffeLamp: 2, UnicornLamp: 1. Total do kit ${money(30000)}`, 'a stepper tells how many of that lamp');
  for (let k = 0; k < 12; k++) click(rows[1].one('is-plus'));
  assert.equal(qty(), `1,${KIT_MAX},1`); assert.equal(rows[1].one('is-plus').getAttribute('aria-disabled'), 'true');
  kit.set({macacoscopio: 0, girafoscopio: 0, unicornioscopio: 1});
  click(rows[2].one('is-minus')); assert.equal(qty(), '0,0,0'); assert.equal(rows[2].one('is-minus').getAttribute('aria-disabled'), 'true');
  click(rows[2].one('is-minus')); assert.equal(qty(), '0,0,0', 'never below zero');
  // nothing chosen (usabilidade 14): the button stays in the Tab order, says it is unavailable and, tapped, says why
  assert.ok(!addButton.disabled); assert.equal(addButton.getAttribute('aria-disabled'), 'true'); assert.ok(host.one('kit-pix').hidden);
  assert.equal(said.textContent, 'Escolha pelo menos uma peça.');
  click(addButton); await tick(); assert.equal(status.textContent, 'Escolha pelo menos uma peça.'); assert.equal(added, null, 'nothing added');
  // adding: every lamp goes in one call; an error shows in the block
  click(tiers[2]); assert.equal(addButton.getAttribute('aria-disabled'), 'false'); assert.equal(status.textContent, '', 'the warning goes away');
  click(addButton); await tick();
  assert.deepEqual(added, [{productId: 'macacoscopio', selection: {}, quantity: 1}, {productId: 'girafoscopio', selection: {}, quantity: 1}, {productId: 'unicornioscopio', selection: {}, quantity: 1}]);
  assert.equal(status.textContent, '');
  fail = 'Não foi possível salvar o carrinho.'; click(addButton); await tick();
  assert.equal(status.textContent, 'Não foi possível salvar o carrinho.', 'the error stays in the block'); fail = null;
  // grouped with what is already in the cart: the extra line, refreshed when the cart changes
  kit.set({unicornioscopio: 1}); cart = normalizeCart([{productId: 'girafoscopio', quantity: 1}]);
  for (const fn of windowListeners['ju:cart']) fn();
  assert.ok(!host.one('kit-cart-note').hidden); assert.equal(host.one('kit-cart-note').textContent, `Com o que já está no carrinho: + ${money(7000)}`);
  // mounted again (another lamp): the old listeners go away, and a piece without a kit leaves the host empty
  mountKit(host, {current: 'macacoscopio', onAdd() {}, cart: () => []});
  assert.equal(windowListeners['ju:cart'].length, 1, 'no listener left behind');
  assert.equal(host.each('kit-qty').map(o => o.textContent).join(','), '1,0,0');
  assert.equal(mountKit(host, {current: 'aviaoscopia', onAdd() {}}), null); assert.equal(host.children.length, 0);
  assert.equal(windowListeners['ju:cart'].length, 0);
}

// ── the product dialog: the block only chooses (no total, no button); the purchase bar follows onChange (08/10/2026) ──
{
  const host = new Node('div'), quotes = [];
  const kit = mountKit(host, {current: 'girafoscopio', cart: () => [], onChange: quote => quotes.push(quote)});
  assert.equal(host.one('kit-add'), undefined, 'no add button: the bar buys'); assert.equal(host.one('kit-total'), undefined, 'no total: the bar shows it');
  assert.ok(host.one('kit').className.includes('is-picker'));
  assert.equal(quotes.length, 1, 'the bar learns the kit when it is mounted'); assert.deepEqual([quotes[0].units, quotes[0].total], [1, 9000]);
  assert.ok(host.one('kit-sum').hidden, 'one lamp: nothing under the rows');
  click(host.each('kit-tier')[2]);
  assert.deepEqual([quotes.at(-1).units, quotes.at(-1).total, quotes.at(-1).full, quotes.at(-1).pix], [3, 21000, 27000, 19950], 'three lamps: the bar gets R$ 210 (R$ 270 struck, R$ 199,50 with Pix)');
  assert.equal(quotes.at(-1).lines.length, 3);
  assert.ok(!host.one('kit-sum').hidden); assert.equal(host.one('kit-deal').textContent, `3 peças${`economize ${money(6000)}`}`, 'how many pieces and how much is saved');
  kit.set({}); assert.equal(quotes.at(-1).units, 0, 'an empty kit reaches the bar too');
}

// ── where it lives ────────────────────────────────────────────────────
{
  const html = read('dist/index.html'), controller = read('dist/controller.js'), landing = read('dist/product-landing.js'), code = read('dist/kit-builder.js');
  assert.ok(html.includes('<p class="pdp-fixed-text" id="fixed-text"></p></section>\n      <section class="pdp-kit" id="pdp-kit" aria-labelledby="pdp-kit-title" hidden><div class="pdp-colors-head"><h3 id="pdp-kit-title">Monte seu kit</h3><span class="pdp-kit-mix">escolha os seus</span></div><div class="pdp-kit-body"></div></section>'), 'the dialog: right after "Cores da peça", in the white area');
  assert.ok(controller.includes("kitHost.hidden=soon||!fixed||!kitOf(key);kitPick=null;") && controller.includes("mountKit(kitHost.querySelector('.pdp-kit-body'),{current:kitHost.hidden?null:key,onChange:paintKit});"), 'only lamps of a kit get the block; in the dialog it only chooses and the bar follows it');
  assert.ok(controller.includes('offer.hidden=!extra&&(!kit||!kitHost.hidden);'), 'the bar sentence hides while the block shows');
  assert.ok(/async function addKit\(lines\)\{[^}]*writeCart\(putItems\(readCart\(\),lines\)\)[^]*?openMiniCart\(\{itemIds:lines\.map\(line=>addedItemId\(cart,line\.productId,\{\}\)\)\.filter\(Boolean\),original:true,riseFrom:before\}\);/.test(controller), 'one write, then the mini-cart confirms every line');
  assert.ok(landing.includes("mountKit(kitHost.querySelector('[data-pl-kit-body]'), {current: key, onAdd: async lines => {") && landing.includes('writeCart(putItems(readCart(), lines))'), 'the lamp pages use the same block');
  assert.ok(!/\.(innerHTML|outerHTML)\s*=/.test(code) && (code.match(/insertAdjacentHTML\(/g) || []).length === 1 && code.includes("add.insertAdjacentHTML('afterbegin', icon('cart'));"), 'built with createElement/textContent (only the shop\'s own cart icon goes in as markup)');
  assert.ok(code.includes('os grupos do kit valem no carrinho TODO'), 'the cart-wide grouping is noted in the code');
  const css = read('dist/mini-cart.css');
  assert.match(css, /\.kit-step \{[^}]*width: 44px; height: 44px;/, '44 px steppers');
  assert.match(css, /\.kit-add \{[^}]*min-height: 50px;/);
  assert.ok([...css.slice(css.indexOf('Monte seu kit')).matchAll(/font-size: ([\d.]+)px/g)].every(m => Number(m[1]) >= 12), 'no kit text under 12 px');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.kit :is\(/);
  for (const text of ['Monte seu kit', 'escolha os seus', 'Kits prontos', 'Total do kit', 'Com o que já está no carrinho:', 'Adicionar o kit ao carrinho', 'Kit adicionado ao carrinho', 'Escolha pelo menos uma peça.', 'Não foi possível adicionar o kit. Tente novamente.', `${money(8000)} cada`, `economize ${money(2000)}`, `${money(15200)} no Pix`])
    for (const locale of ['en', 'es']) assert.notEqual(translate(text, locale), text, `${locale}: ${text}`);
  assert.equal(translate('3 por', 'en'), '3 for'); assert.equal(translate('3 por', 'es'), '3 por', '"por" is Spanish too');
  assert.equal(translate(`${money(7000)} cada`, 'en'), 'R$ 70,00 each'); assert.equal(translate(`${money(7000)} cada`, 'es'), 'R$ 70,00 cada una');
  assert.equal(COMMERCE.kits.lampadas.groups[3], 21000);
}

console.log('PASS: Monte seu kit — prices like the cart (1/2/3 and mixes, Pix, cart-wide groups), presets, steppers 0..9, live total, add in one go, errors in the block, dialog and lamp pages, texts.');
