#!/usr/bin/env node
// Fotos da galeria da aba Foto (dist/assets/vistas/<peça>-<vista>.webp, lado maior 1000 px, e -mini.webp, 200 px): as fotos reais de
// cada peça, recortadas das fontes de design/vistas/ (fotos e vídeos) como manda design/vistas/fotos.json; as vistas e a ordem de cada
// peça estão em dist/gallery.js (GALLERY). Peça ainda sem fotos reais: só a foto da vitrine.
//   node tools/galeria-vistas/gerar.cjs                  → todas as peças
//   node tools/galeria-vistas/gerar.cjs aviaoscopia      → só uma (ou várias, separadas por vírgula)
// Tudo no Chrome sem janela. Depois de trocar fotos, suba VIEWS_VERSION em dist/gallery.js.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {withBrowser} = require('../render-aviao-macaco/cdp.cjs');

const ROOT = path.join(__dirname, '..', '..'), OUT = path.join(ROOT, 'dist', 'assets', 'vistas');
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp4': 'video/mp4'};
const pecas = process.argv.slice(2).find(a => !a.startsWith('--')) || '';

const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': fs.statSync(file).size, 'Cache-Control': 'no-store'});
  fs.createReadStream(file).pipe(res);
}).listen(0, '127.0.0.1', async () => {
  const {port} = server.address();
  try {
    await withBrowser(async b => {
      await b.viewport(800, 800);
      await b.goto(`http://127.0.0.1:${port}/tools/galeria-vistas/vistas.html${pecas ? `?pecas=${pecas}` : ''}`, {wait: 300});
      const started = Date.now();
      while (!(await b.eval('window.done === true'))) {
        const crash = b.consoleLog.find(l => l.startsWith('exception:'));
        if (crash) throw new Error(crash);
        if (Date.now() - started > 600000) throw new Error('demorou demais');
        await b.sleep(500);
      }
      const error = await b.eval('window.error || null');
      if (error) throw new Error(error);
      const results = await b.eval('window.results');
      fs.mkdirSync(OUT, {recursive: true});
      // a galeria só tem as vistas de agora: o que sobrou de outras vistas destas peças sai
      for (const f of fs.readdirSync(OUT)) if (f.endsWith('.webp') && !results[f] && (!pecas || pecas.split(',').some(k => f.startsWith(k + '-')))) fs.unlinkSync(path.join(OUT, f));
      for (const [name, url] of Object.entries(results)) fs.writeFileSync(path.join(OUT, name), Buffer.from(url.split(',')[1], 'base64'));
      const bytes = Object.values(results).reduce((sum, url) => sum + Math.round(url.split(',')[1].length * 3 / 4), 0);
      console.log(`${Object.keys(results).length} imagens em dist/assets/vistas (${Math.round(bytes / 1024)} KB) em ${Math.round((Date.now() - started) / 1000)} s`);
      for (const [vista, origem] of Object.entries(await b.eval('window.info'))) console.log(`  ${vista}: ${origem}`);
    }, {webgl: false, port: 9400 + process.pid % 500});
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  server.close();
});
