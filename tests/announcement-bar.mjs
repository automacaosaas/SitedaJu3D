import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';

// announcement-bar.js imports commerce-config.js by relative path; load both from dist/ as ES modules.
registerHooks({load(url, context, next) { return url.includes('/dist/') && url.endsWith('.js') ? {format: 'module', source: next(url, context).source, shortCircuit: true} : next(url, context); }});
const {createRotator, MESSAGES, INTERVAL_MS} = await import('../dist/announcement-bar.js');
const read = file => readFile(new URL(`../dist/${file}`, import.meta.url), 'utf8');

// Fake timers: one interval at a time, fired by hand.
const fake = () => {
  const timers = {active: null, delay: null, setInterval(fn, delay) { this.active = fn; this.delay = delay; return 1; }, clearInterval() { this.active = null; }};
  return timers;
};

{
  const shown = [], timers = fake();
  const r = createRotator({count: 3, onShow: i => shown.push(i), timers});
  r.start();
  assert.deepEqual(shown, [0], 'the first message shows at once'); assert.equal(timers.delay, INTERVAL_MS); assert.equal(INTERVAL_MS, 5000);
  timers.active(); timers.active(); timers.active();
  assert.deepEqual(shown, [0, 1, 2, 0], 'rotates and wraps around');
  r.prev(); assert.equal(r.index, 2, 'back from the first goes to the last');
  r.next(); assert.equal(r.index, 0);
  r.hold(); assert.equal(r.running, false, 'pointer or keyboard on the bar stops the rotation');
  r.hold(); r.release(); assert.equal(r.running, false, 'still held (pointer and focus count separately)');
  r.release(); assert.equal(r.running, true, 'released: rotates again');
  assert.equal(r.toggle(), true); assert.equal(r.running, false, 'pause button stops it');
  r.next(); assert.equal(r.index, 1, 'arrows still work while paused'); assert.equal(r.running, false, 'and do not restart it');
  r.release(); assert.equal(r.running, false, 'an extra release never goes below zero or resumes a paused bar');
  r.toggle(); assert.equal(r.running, true, 'resume');
}
{
  const timers = fake(), r = createRotator({count: 3, onShow() {}, reduce: true, timers});
  r.start();
  assert.equal(r.paused, true); assert.equal(timers.active, null, 'prefers-reduced-motion: never moves by itself');
  r.toggle(); assert.equal(r.running, true, 'the visitor can still start it');
}

assert.deepEqual(MESSAGES.map(m => m.title), ['ENVIO PARA TODO O BRASIL', 'PIX E CARTÃO', 'FEITO SOB ENCOMENDA']);
assert.deepEqual(MESSAGES.map(m => m.icons), [['truck'], ['pix', 'card'], ['clock']], 'each message has its symbol');
assert.equal(MESSAGES[2].text, 'Produção em 3 a 5 dias úteis', 'the production time comes from commerce-config.js');

const shell = await read('site-shell.js');
assert.match(shell, /if \(!document\.body\.matches\('\.commerce-page, \.account-page'\)\) mountAnnouncementBar\(\);/, 'shop pages only: not on cart, checkout or account');
const css = await read('shopping.css');
assert.match(css, /\.announce-btn\{[^}]*width:44px;height:44px/, 'controls have 44px touch targets');
assert.match(css, /prefers-reduced-motion:reduce\)\{\.announce-msg/, 'reduced motion: crossfade only');
const bar = await read('announcement-bar.js');
assert.match(bar, /aria-live', rotator\.paused \? 'polite' : 'off'/, 'the live region speaks only when nothing moves by itself');

console.log('PASS: announcement bar — rotation every 5 s with wrap-around, arrows, pause, hold on pointer/focus, reduced motion, messages and symbols, shop pages only, 44px controls.');
