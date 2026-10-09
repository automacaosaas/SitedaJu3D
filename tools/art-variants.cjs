'use strict';
// Cópias reduzidas das fotos da vitrine (dist/assets/product-<peça>-cutout.webp, 1254 px): 768, 512 e 384 px, o mesmo recorte,
// em WebP com perda (qualidade 90, redução lanczos3, cor com sharp_yuv). Onde cada uma entra: products.js (artSrcset, demoSrcset,
// thumbSrcset). Elas saem sempre da 1254 do ar: foto nova ou retocada pede rodar de novo, senão celular e computador ficam com a
// foto antiga (09/10/2026: a 768 da girafa era de antes da revisão de 08/10). tools/art-variants.json guarda a impressão digital de
// cada 1254 e de cada cópia; tests/assets.mjs falha quando uma delas mudou sem as outras.
// A qualidade 90 foi escolhida pela foto desenhada na tela (Chrome, 1x a 3x) comparada com a ideal: com ela a de 512 e a de 384
// ficam iguais à 768 de antes no tamanho em que cada uma é usada (PERFORMANCE-QA.md, 09/10/2026).
//   SHARP=<pasta do pacote sharp> node tools/art-variants.cjs [peça...] [--only=384,512]
//     sem peça: só as peças cuja 1254 mudou (ou falta cópia); com peça: refaz essa. O sharp não é dependência da loja
//     (ex.: npm i --no-save --prefix <pasta> sharp; SHARP=<pasta>/node_modules/sharp).
//   node tools/art-variants.cjs --check     só confere, sem o sharp
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ASSETS = path.join(__dirname, '..', 'dist', 'assets');
const RECORD = path.join(__dirname, 'art-variants.json');
const WIDTHS = [768, 512, 384];
const QUALITY = 90;
const fingerprint = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(ASSETS, file))).digest('hex').slice(0, 16);
const copyName = (file, width) => file.replace(/\.webp$/, `-${width}.webp`);

async function pieces() {
  const {pathToFileURL} = require('node:url');
  const {ART_768} = await import(pathToFileURL(path.join(__dirname, '..', 'dist', 'products.js')).href);
  return Object.keys(ART_768);
}
const readRecord = () => fs.existsSync(RECORD) ? JSON.parse(fs.readFileSync(RECORD, 'utf8')) : {};
// what is out of date: the 1254 changed since its copies were made, or a copy is missing or was changed by hand
function stale(record, file) {
  const entry = record[file];
  if (!entry || entry.source !== fingerprint(file)) return 'a foto de 1254 px mudou';
  for (const width of WIDTHS) {
    const copy = copyName(file, width);
    if (!fs.existsSync(path.join(ASSETS, copy))) return `falta ${copy}`;
    if (entry.copies?.[copy] !== fingerprint(copy)) return `${copy} mudou sem a 1254`;
  }
  return '';
}

async function main() {
  const args = process.argv.slice(2), check = args.includes('--check');
  const only = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean).map(Number);
  const asked = args.filter(a => !a.startsWith('--'));
  const files = await pieces(), record = readRecord();
  if (check) {
    let bad = 0;
    for (const file of files) { const why = stale(record, file); if (why) { bad++; console.log(`${file}: ${why} — rode node tools/art-variants.cjs`); } }
    if (!bad) console.log(`${files.length} fotos da vitrine com as cópias em dia.`);
    process.exitCode = bad ? 1 : 0;
    return;
  }
  const sharp = require(process.env.SHARP || 'sharp');
  const todo = files.filter(file => asked.length ? asked.some(piece => file === `product-${piece}-cutout.webp` || file === piece) : stale(record, file));
  for (const file of todo) {
    for (const width of only.length ? WIDTHS.filter(w => only.includes(w)) : WIDTHS) {
      const out = path.join(ASSETS, copyName(file, width));
      const data = await sharp(path.join(ASSETS, file)).resize(width, width, {kernel: 'lanczos3'})
        .webp({quality: QUALITY, alphaQuality: 100, effort: 6, smartSubsample: true}).toBuffer();
      fs.writeFileSync(out, data);
      console.log(`  ${path.basename(out)}: ${(data.length / 1024).toFixed(1)} KB`);
    }
  }
  const next = {};
  for (const file of files) next[file] = {source: fingerprint(file), copies: Object.fromEntries(WIDTHS.map(w => copyName(file, w)).filter(c => fs.existsSync(path.join(ASSETS, c))).map(c => [c, fingerprint(c)]))};
  // the line ending of the checkout (as tools/sync-versions.cjs does)
  const eol = fs.readFileSync(path.join(ASSETS, '..', 'index.html'), 'utf8').includes('\r\n') ? '\r\n' : '\n';
  fs.writeFileSync(RECORD, JSON.stringify(next, null, 2).replace(/\n/g, eol) + eol);
  console.log(`${todo.length ? `${todo.length} peça(s) refeita(s)` : 'Nada a refazer'}; tools/art-variants.json em dia.`);
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = {stale, readRecord, copyName, WIDTHS};
