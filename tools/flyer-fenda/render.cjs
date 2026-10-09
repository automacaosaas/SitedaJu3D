'use strict';
// Gera o flyer das lâmpadas de fenda (MonkeyLamp, GiraffeLamp e UnicornLamp) a partir de flyer.html, no Chrome (Playwright), com as
// fontes, as imagens, os nomes e os preços do próprio site:
//   design/flyer-fenda/flyer-fenda.jpg    1080 x 1350  conversa e feed (mandar no WhatsApp com o link na legenda)
//   design/flyer-fenda/status-fenda.jpg   1080 x 1920  Status do WhatsApp e Stories
//   dist/assets/og-fenda.jpg              1200 x 630   prévia do link de fenda.html (o card que o WhatsApp mostra ao colar o link)
// O QR e o endereço impresso apontam para <site>/fenda (site = COMPANY.website em api/_lib/legal.js). Para outro endereço (um site de
// teste): node tools/flyer-fenda/render.cjs --url=https://exemplo.com/fenda (essa versão vai só para design/flyer-fenda/teste/; a
// prévia do link continua com o endereço oficial). Rode de novo quando mudar uma peça, o preço ou o kit das lâmpadas.
// Precisa do Playwright (npm i -g playwright, ou PLAYWRIGHT_PATH com o caminho do pacote); sem ele, usa o Chrome instalado (CHROME, ou o
// caminho padrão do Windows), pelo mesmo driver dos renders (tools/render-aviao-macaco/cdp.cjs).
// Só a prévia do link, sem refazer o flyer nem o status (09/10/2026: "não precisa gerar o flyer da fenda. Apenas atualize no site"):
//   node tools/flyer-fenda/render.cjs --so=og
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {COMPANY} = require('../../api/_lib/legal');

const ROOT = path.join(__dirname, '..', '..');
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webp': 'image/webp', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'};
const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const official = `${String(COMPANY.website).replace(/\/+$/, '')}/fenda`, url = arg('url') || official;
const out = url === official ? path.join(ROOT, 'design', 'flyer-fenda') : path.join(ROOT, 'design', 'flyer-fenda', 'teste');
const JOBS = [
  {format: 'flyer', width: 1080, height: 1350, file: path.join(out, 'flyer-fenda.jpg')},
  {format: 'status', width: 1080, height: 1920, file: path.join(out, 'status-fenda.jpg')},
  ...(url === official ? [{format: 'og', width: 1200, height: 630, file: path.join(ROOT, 'dist', 'assets', 'og-fenda.jpg')}] : [])
].filter(job => !arg('so') || arg('so').split(',').includes(job.format));

function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT_PATH, 'playwright', path.join(require('node:child_process').execSync('npm root -g').toString().trim(), 'playwright')].filter(Boolean);
  for (const name of tries) { try { return require(name); } catch {} }
  return null;
}

// as mesmas páginas e capturas, no Playwright ou no Chrome instalado
async function shoot(base) {
  const playwright = loadPlaywright();
  if (playwright) {
    const browser = await playwright.chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? {executablePath: '/opt/pw-browsers/chromium'} : {});
    try {
      for (const job of JOBS) {
        const page = await browser.newPage({viewport: {width: job.width, height: job.height}, deviceScaleFactor: 1});
        page.on('pageerror', error => console.error(`${job.format}: ${error.message}`));
        await page.goto(`${base}&format=${job.format}`);
        await page.waitForSelector('body[data-ready]', {timeout: 30000});
        await page.screenshot({path: job.file, type: 'jpeg', quality: job.format === 'og' ? 82 : 90, clip: {x: 0, y: 0, width: job.width, height: job.height}});
        await page.close();
        done(job);
      }
    } finally { await browser.close(); }
    return;
  }
  const {withBrowser} = require('../render-aviao-macaco/cdp.cjs');
  if (!fs.existsSync(process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe')) throw new Error('Nem Playwright (npm i -g playwright, ou PLAYWRIGHT_PATH) nem o Chrome (CHROME=<caminho>).');
  await withBrowser(async b => {
    for (const job of JOBS) {
      await b.viewport(job.width, job.height);
      await b.goto(`${base}&format=${job.format}`, {wait: 100});
      for (let t = 0; !(await b.eval('document.body.dataset.ready === "1"')); t++) { if (t > 150) throw new Error(`${job.format}: a página não ficou pronta`); await b.sleep(200); }
      const crash = b.consoleLog.find(line => line.startsWith('exception:')); if (crash) console.error(`${job.format}: ${crash}`);
      const {data} = await b.send('Page.captureScreenshot', {format: 'jpeg', quality: job.format === 'og' ? 82 : 90, clip: {x: 0, y: 0, width: job.width, height: job.height, scale: 1}});
      fs.writeFileSync(job.file, Buffer.from(data, 'base64'));
      done(job);
    }
  }, {port: 9500 + process.pid % 400});
}
const done = job => console.log(`${path.relative(ROOT, job.file)} (${job.width}x${job.height}, ${Math.round(fs.statSync(job.file).size / 1024)} KB)`);

(async () => {
  // a raiz do repositório (flyer.html em /tools/flyer-fenda/, o site em /dist/)
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    if (!JOBS.length) throw new Error('nenhum formato: --so=flyer,status,og');
    if (JOBS.some(job => job.file.startsWith(out))) fs.mkdirSync(out, {recursive: true});
    await shoot(`http://127.0.0.1:${server.address().port}/tools/flyer-fenda/flyer.html?url=${encodeURIComponent(url)}`);
  } finally {
    server.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
