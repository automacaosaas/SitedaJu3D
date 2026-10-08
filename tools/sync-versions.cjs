'use strict';
// Every file asked for with ?v= goes out with a year in the browser cache, never asked for again (server/create-server.cjs,
// 2026-10-07): a file changed without changing its ?v= stays old for a year for everyone who already visited. This tool keeps,
// for each of those files (the 3D models of asset-models.js, the gallery views under VIEWS_VERSION, the fonts of theme.css,
// any other ?v= in dist/), the ?v= and a fingerprint of the contents in tools/versioned-assets.json; tests/versioned-assets.mjs
// fails when a file changed and its ?v= did not (and when the record is out of date).
// Run after changing a versioned file and its ?v=: node tools/sync-versions.cjs   (or --check to only report)
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DIST = path.join(__dirname, '..', 'dist');
const FILE = path.join(__dirname, 'versioned-assets.json');
// "assets/models/x.glb?v=3mf-4", "./assets/…", "url(assets/fonts/x.woff2?v=1)"
const REF = /(?:\.\/)?((?:assets|vendor)\/[\w\-./]+\.[a-z0-9]+)\?v=([\w.\-]+)/g;

// file → the ?v= values it is asked for with
function references() {
  const refs = new Map();
  const add = (file, v) => { if (!refs.has(file)) refs.set(file, new Set()); refs.get(file).add(v); };
  for (const name of fs.readdirSync(DIST).filter(f => /\.(html|js|css)$/.test(f))) for (const m of fs.readFileSync(path.join(DIST, name), 'utf8').matchAll(REF)) add(m[1], m[2]);
  // the gallery views: dist/gallery.js builds their addresses, every file of assets/vistas with ?v=VIEWS_VERSION
  const views = /VIEWS_VERSION\s*=\s*'([\w.\-]+)'/.exec(fs.readFileSync(path.join(DIST, 'gallery.js'), 'utf8'))?.[1];
  if (views) for (const entry of fs.readdirSync(path.join(DIST, 'assets/vistas'), {withFileTypes: true})) if (entry.isFile()) add(`assets/vistas/${entry.name}`, views);
  return refs;
}
const fingerprint = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(DIST, file))).digest('hex').slice(0, 16);
function current() {
  return Object.fromEntries([...references()].sort(([a], [b]) => a.localeCompare(b)).map(([file, versions]) => {
    if (!fs.existsSync(path.join(DIST, file))) throw new Error(`dist/${file} is asked for with ?v= but does not exist`);
    return [file, {v: [...versions].sort().join(' '), sha256: fingerprint(file)}];
  }));
}
// forgot: changed with the same ?v= (never to be recorded); stale: the record is behind (new file, new ?v=, gone)
function compare(saved, now) {
  const stale = [], forgot = [];
  for (const [file, entry] of Object.entries(now)) {
    const old = saved[file];
    if (!old) stale.push(`${file}: novo arquivo com ?v=${entry.v}`);
    else if (old.sha256 !== entry.sha256 && old.v === entry.v) forgot.push(`${file}: o arquivo mudou e o ?v= continua "${entry.v}" — mude o ?v= (com ele o navegador guarda o arquivo por um ano sem perguntar de novo)`);
    else if (old.v !== entry.v) stale.push(`${file}: ?v=${old.v} → ?v=${entry.v}`);
  }
  for (const file of Object.keys(saved)) if (!now[file]) stale.push(`${file}: não é mais pedido com ?v=`);
  return {stale, forgot};
}
const read = () => fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};

if (require.main === module) {
  const check = process.argv.includes('--check');
  const saved = read(), now = current(), {stale, forgot} = compare(saved, now);
  for (const line of forgot) console.log(`ERRO ${line}`);
  for (const line of stale) console.log(`${check || forgot.length ? 'desatualizado' : 'gravado'}: ${line}`);
  if (forgot.length) { console.log('Nada gravado enquanto houver arquivo mudado com o mesmo ?v=.'); process.exitCode = 1; }
  else if (!stale.length) console.log(`${Object.keys(now).length} arquivos com ?v=: em dia.`);
  else if (check) { console.log('Rode node tools/sync-versions.cjs'); process.exitCode = 1; }
  else {
    const eol = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8').includes('\r\n') ? '\r\n' : '\n';
    fs.writeFileSync(FILE, JSON.stringify(now, null, 2).replace(/\n/g, eol) + eol);
  }
}

module.exports = {references, current, compare, read, FILE};
