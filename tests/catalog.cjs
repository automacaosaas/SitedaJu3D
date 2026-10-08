const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Exercise the production gesture handlers without a browser or persisted cart.
const source = fs.readFileSync(path.join(__dirname, '../dist/catalog.js'), 'utf8')
  .replace(/^import .*;\r?\n/gm, '');
const sent = [];
const context = vm.createContext({
  PRODUCTS: {}, SOON: {}, ALIASES: {old: 'p2'}, document: {querySelectorAll: () => [], addEventListener() {}},
  window: {addEventListener() {}}, location: {hash: ''},
  CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
  dispatchEvent: event => sent.push(event),
  matchMedia: () => ({matches:false}), setTimeout: fn => fn()
});
vm.runInContext(source + '\nglobalThis.Carousel = ProductCarousel; globalThis.startAt = startAt;', context);
function target() {
  const handlers = new Map(), captures = new Set();
  return {
    style: {setProperty() {}, removeProperty() {}},
    addEventListener(type, fn) { handlers.set(type, [...(handlers.get(type) || []), fn]); },
    setPointerCapture(id) { captures.add(id); },
    hasPointerCapture(id) { return captures.has(id); },
    releasePointerCapture(id) { captures.delete(id); },
    emit(type, props = {}) {
      const event = {type, target:this, pointerId:1, isPrimary:true, pointerType:'touch',
        clientX:200, clientY:100, cancelable:true, button:0,
        preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...props};
      for (const handler of handlers.get(type) || []) handler(event);
      return event;
    }
  };
}
function carousel(length) {
  const rail = Object.create(context.Carousel.prototype);
  rail.active = 0; rail.items = Array.from({length}, (_, i) => ({id: 'p' + i})); rail.stage = target();
  rail.track = target(); rail.dots = target(); rail.render = () => {};
  rail.previous = target(); rail.next = target();
  rail.host = {querySelector: selector => selector.endsWith('prev') ? rail.previous : rail.next};
  rail.bind(); return rail;
}
function drag(rail, dx, end = 'pointerup') {
  rail.stage.emit('pointerdown');
  rail.stage.emit('pointermove', {clientX:200+dx});
  rail.stage.emit(end, {clientX:200+dx});
}
for (const count of [1, 2, 3, 7]) {
  const rail = carousel(count);
  for (let i = 0; i < count * 2; i++) drag(rail, -100);
  assert.equal(rail.active, 0, 'two forward loops');
  for (let i = 0; i < count * 2; i++) drag(rail, 100);
  assert.equal(rail.active, 0, 'two reverse loops');
}
const rail = carousel(3);
drag(rail, -100, 'pointercancel');
assert.equal(rail.active, 0, 'cancelled gestures must not navigate');
drag(rail, -20);
assert.equal(rail.active, 0, 'small gestures must return');
const blocked = rail.stage.emit('click');
assert.ok(blocked.prevented && blocked.stopped, 'drag click cannot reach modal/cart handlers');
rail.stage.emit('pointerdown'); rail.stage.emit('pointerup');
assert.ok(!rail.stage.emit('click').prevented, 'a subsequent tap works');
rail.stage.emit('pointerdown'); rail.stage.emit('pointermove', {clientX:100});
rail.stage.emit('lostpointercapture', {target:rail.track});
assert.ok(rail.gesture, 'implicit capture transfer does not cancel');
rail.stage.emit('lostpointercapture');
assert.equal(rail.gesture, null, 'actual capture loss clears gesture');
assert.equal(rail.active, 0);
rail.stage.emit('pointerdown'); rail.stage.emit('pointermove', {clientX:202, clientY:250});
rail.stage.emit('pointerup', {clientX:202, clientY:250});
assert.equal(rail.active, 0, 'vertical movement leaves carousel unchanged');
rail.next.emit('click'); assert.equal(rail.active, 1);
rail.stage.emit('keydown', {key:'ArrowLeft'}); assert.equal(rail.active, 0);
assert.ok(rail.track.emit('dragstart').prevented, 'native image dragging is disabled');
// 07/10/2026 (the owner: "ao mudar essa sessão dos produtos, não mudar a vitrine"): a move in the collection tells nobody — only the
// cards (and the section's colors) change; a move in the showcase (carousel.js) is still followed here, and the collection starts
// where the showcase starts.
sent.length = 0;
const synced = carousel(4);
synced.next.emit('click'); synced.dots.emit('click', {target: {closest: () => ({dataset: {dot: '3'}})}}); drag(synced, -100);
assert.equal(synced.active, 0, 'arrows, dots and swipes move the collection');
assert.deepEqual(sent, [], 'a move in the collection does not move the showcase');
synced.follow('p3'); assert.equal(synced.active, 3, 'the collection follows the showcase');
synced.follow('nope'); assert.equal(synced.active, 3, 'a piece outside this category is ignored');
assert.equal(sent.length, 0, 'following does not echo back');
const catalogSource = fs.readFileSync(path.join(__dirname, '../dist/catalog.js'), 'utf8');
assert.ok(!/dispatchEvent\(new CustomEvent\(FOCUS/.test(catalogSource), 'the collection never sends the focus event');
assert.ok(/if \(event\.detail\?\.source === 'showcase'\) for \(const rail of rails\.values\(\)\) rail\.follow\(event\.detail\?\.product\);/.test(catalogSource), 'only the showcase moves the collection');
// the section wears the centred card's colors (carousel.css .catalog-home[data-themed])
{
  const section = {style: {values: {}, setProperty(name, value) { this.values[name] = value; }}, dataset: {}};
  const themed = Object.create(context.Carousel.prototype);
  themed.items = [{id: 'p0'}, {id: 'p1'}]; themed.active = 1; themed.host = {closest: selector => selector === '.catalog-home' ? section : null};
  context.showcase = id => ({theme: {id}}); context.journeyColors = theme => ({'--theme-text': '#111111', '--theme-muted': '#222222', '--theme-accent': theme.id === 'p1' ? '#336699' : '#000000', '--theme-accent-strong': '#29527a', '--theme-soft': '#cddbe8', '--theme-wash': '#eef3f8'});
  context.withAlpha = (hex, alpha) => `${hex}/${alpha}`; context.requestAnimationFrame = fn => fn();
  themed.paintTheme();
  assert.deepEqual(section.style.values, {'--cat-text': '#111111', '--cat-muted': '#222222', '--cat-accent': '#336699', '--cat-accent-strong': '#29527a', '--cat-soft': '#cddbe8', '--cat-wash': '#eef3f8', '--cat-glow': '#336699/0.32'}, 'the centred card\'s colors go to the section');
  assert.equal(section.dataset.themed, 'live', 'the first paint is still, then the colors slide');
  const lone = Object.create(context.Carousel.prototype); lone.host = {closest: () => null}; lone.items = [{id: 'p0'}]; lone.active = 0;
  assert.doesNotThrow(() => lone.paintTheme(), 'outside the home (no .catalog-home) nothing is painted');
}
const items = Array.from({length: 4}, (_, i) => ({id: 'p' + i}));
context.window.juTheme = {product: () => 'p3'};
assert.equal(context.startAt(items), 3, 'starts on the piece last seen');
context.location.hash = '#produto/p1/encaixe'; assert.equal(context.startAt(items), 1, 'the address comes first');
context.location.hash = '#produto/old'; assert.equal(context.startAt(items), 2, 'old names (ALIASES) still work');
context.location.hash = '#produto/unknown'; assert.equal(context.startAt(items), 3, 'an unknown piece falls back to the last seen');
context.location.hash = '#colecao'; context.window.juTheme = {product: () => ''}; assert.equal(context.startAt(items), 0, 'nothing seen yet: the first piece');
delete context.window.juTheme; assert.equal(context.startAt(items), 0, 'works without journey.js');
console.log('PASS: catalog loops (1/2/3/7 items), cancelled/small/vertical gestures, click suppression, capture transfer, arrows, keyboard, image drag and the piece shared with the showcase.');
