// node frames.cjs <product> <outdir> [width height mobile] — opens the demo of a product on the local site and saves deterministic frames (animations paused and seeked).
const fs = require('fs'), path = require('path');
const {withBrowser, sleep} = require('./cdp.cjs');
const [product = 'aviaoscopia', outDir = 'frames', w = '1440', h = '900', mobile = ''] = process.argv.slice(2);
const times = (process.env.TIMES || '0,250,520,700,900,1100,1300,1500,1650,1760,1850,1980,2150,2400,2700').split(',').map(Number);
const PORT = process.env.PORT || 8847;
fs.mkdirSync(outDir, {recursive: true});
withBrowser(async b => {
  await b.viewport(Number(w), Number(h), {mobile: !!mobile});
  await b.goto(`http://localhost:${PORT}/index.html`, {wait: 2600});
  const order = ['borboletoscopio', 'dinossauroscopio', 'aviaoscopia', 'macacoscopio'];
  for (let i = 0; i < order.indexOf(product); i++) { await b.click('.hero-next'); await sleep(1500); }
  await b.eval('window.scrollTo(0, 0); 1'); await sleep(400);
  if (process.env.VITRINE) { await sleep(900); await b.shot(process.env.VITRINE); }
  const pt = await b.eval(`(() => { const r = document.querySelector('.slot[data-front=true] .piece').getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height * .35}; })()`);
  await b.send('Input.dispatchMouseEvent', {type: 'mouseMoved', x: pt.x, y: pt.y});
  await sleep(150);
  await b.send('Input.dispatchMouseEvent', {type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1});
  await b.send('Input.dispatchMouseEvent', {type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1});
  // the demo is prepared (images decoded) and the timeline starts; stop it and look at chosen moments
  for (let i = 0; i < 60; i++) { if (await b.eval("!document.querySelector('.hero-demo')?.hidden && document.getAnimations().filter(a => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition)).length > 5")) break; await sleep(50); }
  await b.eval("document.getAnimations().filter(a => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition)).forEach(a => a.pause()); 1");
  const total = await b.eval("Math.max(...document.getAnimations().filter(a => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition)).map(a => a.effect.getComputedTiming().endTime))");
  console.log('timeline total', total, 'ms; animations', await b.eval("document.getAnimations().filter(a => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition)).length"));
  for (const t of times) {
    await b.eval(`document.getAnimations().filter(a => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition)).forEach(a => { a.currentTime = ${t}; }); 1`);
    await sleep(120);
    await b.shot(path.join(outDir, `f${String(t).padStart(4, '0')}.png`));
  }
  const problems = b.consoleLog.filter(line => /exception|Refused|error/i.test(line) && !/favicon|Failed to load resource/.test(line));
  console.log('console problems:', problems.length ? problems.join(' | ') : 'none');
});
