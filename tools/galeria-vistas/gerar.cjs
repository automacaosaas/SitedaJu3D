#!/usr/bin/env node
// Gera as vistas prontas da galeria da aba Foto (dist/assets/vistas/<peça>-<vista>.webp, 1000 px, e -mini.webp, 200 px) nas cores
// da vitrine, com o mesmo visualizador do site (dist/viewer.js → renderViews) num Chrome sem janela (WebGL por software).
//   node tools/galeria-vistas/gerar.cjs                      → as quatro peças
//   node tools/galeria-vistas/gerar.cjs aviaoscopia          → só uma (ou várias, separadas por vírgula)
// Depois de gerar de novo, suba VIEWS_VERSION em dist/gallery.js para quem tem as antigas no cache buscar as novas.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {withBrowser} = require('../render-aviao-macaco/cdp.cjs');

const ROOT = path.join(__dirname, '..', '..'), OUT = path.join(ROOT, 'dist', 'assets', 'vistas');
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.glb': 'model/gltf-binary', '.json': 'application/json'};
const pecas = process.argv[2] || '';

const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
  fs.createReadStream(file).pipe(res);
}).listen(0, '127.0.0.1', async () => {
  const {port} = server.address();
  try {
    await withBrowser(async b => {
      await b.viewport(800, 800);
      await b.goto(`http://127.0.0.1:${port}/tools/galeria-vistas/vistas.html${pecas ? `?pecas=${pecas}` : ''}`, {wait: 300});
      const started = Date.now();
      while (!(await b.eval('window.done === true'))) { if (Date.now() - started > 600000) throw new Error('demorou demais'); await b.sleep(500); }
      const error = await b.eval('window.error || null');
      if (error) throw new Error(error);
      const results = await b.eval('window.results');
      fs.mkdirSync(OUT, {recursive: true});
      for (const [name, url] of Object.entries(results)) {
        if (!url.startsWith('data:image/webp;base64,')) throw new Error(`${name}: o Chrome não gerou WebP`);
        fs.writeFileSync(path.join(OUT, `${name}.webp`), Buffer.from(url.split(',')[1], 'base64'));
      }
      const bytes = Object.values(results).reduce((sum, url) => sum + Math.round(url.split(',')[1].length * 3 / 4), 0);
      console.log(`${Object.keys(results).length} imagens em dist/assets/vistas (${Math.round(bytes / 1024)} KB) em ${Math.round((Date.now() - started) / 1000)} s`);
    }, {webgl: true, port: 9400 + process.pid % 500});
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  server.close();
});
