#!/usr/bin/env node
// Fotos da galeria da aba Foto (dist/assets/vistas/<peça>-<vista>.webp, 1000 px, e -mini.webp, 200 px): frente, três quartos e costas
// de cada peça, nas cores da vitrine, padronizadas (recortadas em volta da peça, centralizadas num quadrado, mesma margem).
// As originais ficam em design/vistas/<peça>-<vista>.png|jpg|webp (por exemplo, as geradas no ChatGPT com o kit, em fundo branco).
// Sem original, a frente é a foto da vitrine (catalogImage) e as outras vistas saem do 3D, como provisórias.
//   node tools/galeria-vistas/gerar.cjs                  → as quatro peças
//   node tools/galeria-vistas/gerar.cjs aviaoscopia      → só uma (ou várias, separadas por vírgula)
//   node tools/galeria-vistas/gerar.cjs --kit <pasta>    → referências do kit do ChatGPT: foto da vitrine e pose de cada vista (PNG)
// Tudo no Chrome sem janela (WebGL por software), com o visualizador do site. Depois de trocar fotos, suba VIEWS_VERSION em dist/gallery.js.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {withBrowser} = require('../render-aviao-macaco/cdp.cjs');

const ROOT = path.join(__dirname, '..', '..'), SOURCES = path.join(ROOT, 'design', 'vistas');
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.glb': 'model/gltf-binary', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'};
const args = process.argv.slice(2), kitAt = args.indexOf('--kit'), kit = kitAt >= 0 ? path.resolve(args[kitAt + 1]) : null;
const pecas = args.filter((a, i) => !a.startsWith('--') && !(kitAt >= 0 && i === kitAt + 1))[0] || '';
const OUT = kit || path.join(ROOT, 'dist', 'assets', 'vistas');
const fontes = {};
if (!kit && fs.existsSync(SOURCES)) for (const f of fs.readdirSync(SOURCES)) { const m = /^([a-z]+-[a-z-]+)\.(png|jpe?g|webp)$/.exec(f); if (m) fontes[m[1]] = `/design/vistas/${f}`; }

const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store'});
  fs.createReadStream(file).pipe(res);
}).listen(0, '127.0.0.1', async () => {
  const {port} = server.address();
  try {
    await withBrowser(async b => {
      await b.viewport(800, 800);
      const query = new URLSearchParams({modo: kit ? 'kit' : 'site', fontes: JSON.stringify(fontes), ...(pecas ? {pecas} : {})});
      await b.goto(`http://127.0.0.1:${port}/tools/galeria-vistas/vistas.html?${query}`, {wait: 300});
      const started = Date.now();
      while (!(await b.eval('window.done === true'))) { if (Date.now() - started > 600000) throw new Error('demorou demais'); await b.sleep(500); }
      const error = await b.eval('window.error || null');
      if (error) throw new Error(error);
      const results = await b.eval('window.results');
      fs.mkdirSync(OUT, {recursive: true});
      // a galeria só tem as vistas de agora: o que sobrou de outras vistas destas peças sai
      if (!kit) for (const f of fs.readdirSync(OUT)) if (f.endsWith('.webp') && !results[f] && (!pecas || pecas.split(',').some(k => f.startsWith(k + '-')))) fs.unlinkSync(path.join(OUT, f));
      for (const [name, url] of Object.entries(results)) fs.writeFileSync(path.join(OUT, name), Buffer.from(url.split(',')[1], 'base64'));
      const bytes = Object.values(results).reduce((sum, url) => sum + Math.round(url.split(',')[1].length * 3 / 4), 0);
      console.log(`${Object.keys(results).length} imagens em ${path.relative(process.cwd(), OUT) || OUT} (${Math.round(bytes / 1024)} KB) em ${Math.round((Date.now() - started) / 1000)} s`);
      if (!kit) for (const [vista, origem] of Object.entries(await b.eval('window.info'))) console.log(`  ${vista}: ${origem}`);
    }, {webgl: true, port: 9400 + process.pid % 500});
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  server.close();
});
