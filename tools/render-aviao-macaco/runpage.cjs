// node runpage.cjs "<query-string>" out.png [page=debug.html] — opens the render page in headless Chrome (software WebGL), waits for window.done and saves window.png
// (or one file per entry of window.results: out-<name>.png).
const fs = require('fs');
const {withBrowser} = require('./cdp.cjs');
const [query = '', out = 'out.png', page = 'debug.html'] = process.argv.slice(2);
withBrowser(async b => {
  await b.viewport(1000, 1000);
  await b.goto(`http://127.0.0.1:${Number(process.env.RENDER_PORT) || 8851}/${page}?${query}`, {wait: 300});
  const started = Date.now();
  let ok = false;
  // each check with its own time limit: a page whose GPU process hung never answers, and the loop must still reach its deadline
  const ask = js => Promise.race([b.eval(js), new Promise((_, no) => setTimeout(() => no(new Error('page not answering')), 8000))]);
  while (Date.now() - started < 280000) { try { if (await ask('window.done === true')) { ok = true; break; } } catch {} await b.sleep(400); }
  if (!ok) { console.log('TIMEOUT', JSON.stringify(b.consoleLog.slice(-8))); process.exitCode = 1; return; }
  const results = await b.eval('window.results || null');
  if (results) for (const [name, url] of Object.entries(results)) fs.writeFileSync(out.replace(/\.png$/, '') + '-' + name + '.png', Buffer.from(url.split(',')[1], 'base64'));
  else fs.writeFileSync(out, Buffer.from((await b.eval('window.png')).split(',')[1], 'base64'));
  console.log('ok', Math.round((Date.now() - started) / 100) / 10 + 's', JSON.stringify(await b.eval('window.info || null')), b.consoleLog.filter(l => /error|exception/i.test(l)).slice(0, 3).join(' | '));
  if (process.env.SHOWLOG) console.log(b.consoleLog.join('\n'));
}, {webgl: true, port: Number(process.env.CDP_PORT) || 9400 + process.pid % 500});   // a port per run: two renders at once never share a browser
