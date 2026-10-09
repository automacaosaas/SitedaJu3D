#!/usr/bin/env node
// Recolore imagens da loja a partir das originais de design/recolorir/, como manda design/recolorir/receitas.json (09/10/2026: o
// Dinossauroscópio do Verde-musgo para o Verde-oliva). O mesmo recolorir em OKLab da galeria (tools/galeria-vistas/cores.js): a luz e
// a sombra de cada pixel ficam, só a tinta muda. Grava em dist/assets/<arquivo>, no mesmo formato; sempre a partir da original, então
// rodar de novo dá o mesmo resultado. Chrome sem janela (CHROME=<caminho> fora do PC do Luiz).
//   node tools/recolorir/recolorir.cjs                    → todas as receitas
//   node tools/recolorir/recolorir.cjs dinossauroscopio   → só uma
// Depois: node tools/sync-versions.cjs (as imagens vão com um ano de cache).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {withBrowser} = require('../render-aviao-macaco/cdp.cjs');

const ROOT = path.join(__dirname, '..', '..'), SRC = path.join(ROOT, 'design', 'recolorir'), OUT = path.join(ROOT, 'dist', 'assets');
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg'};
// a qualidade de cada tipo de imagem, a mesma das que saem do render (tools/render-aviao-macaco/lamp-assets.cjs)
const quality = name => name.startsWith('card-preview-') ? .86 : name.startsWith('card-') ? .88 : .9;
const only = process.argv[2] || '';
const receitas = JSON.parse(fs.readFileSync(path.join(SRC, 'receitas.json'), 'utf8'));

const jobs = Object.entries(receitas).filter(([key]) => !key.startsWith('_') && (!only || only.split(',').includes(key))).flatMap(([, receita]) =>
  receita.arquivos.map(item => {
    const {arquivo, so, ...extra} = typeof item === 'string' ? {arquivo: item} : item;
    if (!fs.existsSync(path.join(SRC, arquivo))) throw new Error(`falta a original: design/recolorir/${arquivo}`);
    const regras = receita.regras.map(regra => ({...regra, ...extra, ...(so ? {so: 'peca'} : {})}));
    return {nome: arquivo, src: `/design/recolorir/${arquivo}`, regras, areas: so ? {peca: so} : {}, tipo: arquivo.endsWith('.jpg') ? 'image/jpeg' : 'image/webp', qualidade: quality(arquivo)};
  }));
if (!jobs.length) { console.error(`Nenhuma receita "${only}" em design/recolorir/receitas.json.`); process.exit(1); }

const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store'});
  fs.createReadStream(file).pipe(res);
}).listen(0, '127.0.0.1', async () => {
  const {port} = server.address();
  try {
    await withBrowser(async b => {
      await b.goto(`http://127.0.0.1:${port}/tools/recolorir/recolorir.html`, {wait: 300});
      for (let i = 0; i < 40 && !(await b.eval('window.ready === true')); i++) await b.sleep(250);
      const crash = b.consoleLog.find(line => line.startsWith('exception:'));
      if (crash) throw new Error(crash);
      const results = await b.eval(`window.run(${JSON.stringify(jobs)})`);
      for (const [name, url] of Object.entries(results)) {
        const bytes = Buffer.from(url.split(',')[1], 'base64');
        fs.writeFileSync(path.join(OUT, name), bytes);
        console.log(`  ${name}: ${(bytes.length / 1024).toFixed(1)} KB`);
      }
    });
    console.log(`${jobs.length} imagens recoloridas em dist/assets. Agora: node tools/sync-versions.cjs`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { server.close(); }
});
