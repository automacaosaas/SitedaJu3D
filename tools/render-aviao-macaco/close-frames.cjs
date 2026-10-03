// node close-frames.cjs <product> <outdir> [width height mobile] — opens the demo, lets it settle, clicks "Voltar" and saves the way out at
// exact moments (timeline time going down: TIMES=2100,1800,…,0). The close plays the timeline backwards, so time t of the way out is
// the state at t of the closing tracks.
const fs = require('fs'), path = require('path');
const {withBrowser, sleep} = require('./cdp.cjs');
const [product = 'macacoscopio', outDir = 'close-frames', w = '1440', h = '900', mobile = ''] = process.argv.slice(2);
const times = (process.env.TIMES || '2100,1700,1500,1400,1300,1200,1100,1000,800,600,400,200,0').split(',').map(Number);
const PORT = process.env.PORT || 8844;
fs.mkdirSync(outDir, {recursive: true});
withBrowser(async b => {
  await b.viewport(Number(w), Number(h), {mobile: !!mobile});
  await b.goto(`http://localhost:${PORT}/index.html`, {wait: 2600});
  const order = ['borboletoscopio', 'dinossauroscopio', 'aviaoscopia', 'macacoscopio'];
  for (let i = 0; i < order.indexOf(product); i++) { await b.click('.hero-next'); await sleep(1500); }
  await b.eval('window.scrollTo(0, 0); 1'); await sleep(400);
  await b.eval("document.querySelector('.slot[data-front=true] [data-demo-open], .palette:not([inert]) [data-demo-open]')?.click(); 1");
  await sleep(3200);
  await b.eval("document.querySelector('.demo-close').click(); 1");
  await sleep(30);
  const tl = "document.getAnimations().filter(a => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition))";
  await b.eval(`${tl}.forEach(a => a.pause()); 1`);
  const total = await b.eval(`Math.max(...${tl}.map(a => a.effect.getComputedTiming().endTime))`);
  console.log('timeline total', total, 'ms');
  for (const t of times) {
    await b.eval(`${tl}.forEach(a => { a.currentTime = Math.abs(a.effect.getComputedTiming().endTime - ${total}) < 1 ? ${t} : a.effect.getComputedTiming().endTime; }); 1`);
    await sleep(120);
    await b.shot(path.join(outDir, `f${String(t).padStart(4, '0')}.png`));
  }
  const problems = b.consoleLog.filter(line => /exception|Refused|error/i.test(line) && !/favicon|Failed to load resource/.test(line));
  console.log('console problems:', problems.length ? problems.join(' | ') : 'none');
});
