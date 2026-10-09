'use strict';
// Every file asked for with ?v= goes out with a year in the browser cache, never asked for again (server/create-server.cjs,
// 2026-10-07): a file changed without changing its ?v= stays old for a year for everyone who already visited. Two kinds:
//
// 1. A ?v= chosen by hand (the 3D models of asset-models.js, the gallery views under VIEWS_VERSION, the fonts of theme.css,
//    any other ?v= in dist/ outside the site's own stylesheets and scripts): this tool keeps, for each of those files, the
//    ?v= and a fingerprint of the contents in tools/versioned-assets.json; tests/versioned-assets.mjs fails when a file
//    changed and its ?v= did not (and when the record is out of date).
// 2. The site's own stylesheets and scripts (09/10/2026, PageSpeed "use efficient cache lifetimes": they went out with
//    max-age=0, one revalidation each, ~50 on the home, at every visit): the ?v= is the fingerprint of the file's contents
//    (server/asset-version.cjs), written here, never by hand, in every address the pages use: <link rel="stylesheet">,
//    <script src>, <link rel="modulepreload">, and the import map, one and the same in every page that loads modules, which
//    maps each module ("./cart-store.js", "three"…) to its versioned address, so the imports in the code stay as they are
//    and still reach the versioned file. A literal 'name.js?v=…' inside a script (journey.js's early preloads, consent.js's
//    stylesheet) is kept up to date too, and the file that holds it changes with it. The server gives the year only to the
//    current fingerprint (an old address keeps answering, revalidated as before), and the import map's hash goes into the
//    security policy (tools/sync-csp.cjs, run from here).
//
// Run after changing anything in dist/ (and after the other generators): node tools/sync-versions.cjs   (or --check to only
// report; tests/versioned-assets.mjs fails while anything is out of date)
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {assetVersion, HASHED} = require('../server/asset-version.cjs');

const DIST = path.join(__dirname, '..', 'dist');
const FILE = path.join(__dirname, 'versioned-assets.json');

// ── 1. ?v= chosen by hand ─────────────────────────────────────────────────────
// "assets/models/x.glb?v=3mf-4", "./assets/…", "url(assets/fonts/x.woff2?v=1)"
const REF = /(?:\.\/)?((?:assets|vendor)\/[\w\-./]+\.[a-z0-9]+)\?v=([\w.\-]+)/g;

// file → the ?v= values it is asked for with (the stylesheets and scripts of part 2 left out: their ?v= is computed)
function references(dist = DIST) {
  const refs = new Map();
  const add = (file, v) => { if (HASHED.test(file)) return; if (!refs.has(file)) refs.set(file, new Set()); refs.get(file).add(v); };
  for (const name of fs.readdirSync(dist).filter(f => /\.(html|js|css)$/.test(f))) for (const m of fs.readFileSync(path.join(dist, name), 'utf8').matchAll(REF)) add(m[1], m[2]);
  // the gallery views: dist/gallery.js builds their addresses, every file of assets/vistas with ?v=VIEWS_VERSION
  const views = /VIEWS_VERSION\s*=\s*'([\w.\-]+)'/.exec(fs.readFileSync(path.join(dist, 'gallery.js'), 'utf8'))?.[1];
  if (views) for (const entry of fs.readdirSync(path.join(dist, 'assets/vistas'), {withFileTypes: true})) if (entry.isFile()) add(`assets/vistas/${entry.name}`, views);
  return refs;
}
const fingerprint = (file, dist = DIST) => crypto.createHash('sha256').update(fs.readFileSync(path.join(dist, file))).digest('hex').slice(0, 16);
function current(dist = DIST) {
  return Object.fromEntries([...references(dist)].sort(([a], [b]) => a.localeCompare(b)).map(([file, versions]) => {
    if (!fs.existsSync(path.join(dist, file))) throw new Error(`dist/${file} is asked for with ?v= but does not exist`);
    return [file, {v: [...versions].sort().join(' '), sha256: fingerprint(file, dist)}];
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

// ── 2. The site's own stylesheets and scripts: ?v= = fingerprint ──────────────
// Names that are not paths: the import map keeps them pointing at the same versioned file the paths reach (one three.js).
const BARE = {three: 'vendor/three.module.min.js'};
// a path inside dist/ ending in .css or .js: "theme.css", "./catalog.js", "vendor/loaders/GLTFLoader.js"
const PATH = String.raw`(\.\/)?((?:[\w\-]+\/)*[\w\-.]+?\.(?:css|js))`;
// in a page: href="…" / src="…" of a <link> or <script> tag, with or without ?v=
const TAG = /<(?:link|script)\b[^>]*>/gi;
const ATTR = new RegExp(String.raw`\b(href|src)="${PATH}(?:\?v=[\w.\-]*)?"`, 'g');
// in a script or stylesheet: a quoted literal that already carries ?v= ('i18n-core.js?v=…'); only those are touched
const LITERAL = new RegExp(String.raw`(['"])${PATH}\?v=[\w.\-]*\1`, 'g');
const MAP = /<script type="importmap">[^<]*<\/script>/g;   // JSON: never a "<" inside
const MODULE_TAG = /<script\b[^>]*\btype="module"|<link\b[^>]*\brel="modulepreload"/;

const pagesOf = (dist = DIST) => fs.readdirSync(dist).filter(name => name.endsWith('.html')).sort();
// every .css and .js at the root of dist/, and every .js of dist/vendor (three.js, its add-ons, the QR code)
function ownFiles(dist = DIST) {
  const found = fs.readdirSync(dist, {withFileTypes: true}).filter(entry => entry.isFile() && HASHED.test(entry.name)).map(entry => entry.name);
  const walk = dir => { for (const entry of fs.readdirSync(path.join(dist, dir), {withFileTypes: true})) { const rel = `${dir}/${entry.name}`; if (entry.isDirectory()) walk(rel); else if (/\.js$/.test(entry.name)) found.push(rel); } };
  if (fs.existsSync(path.join(dist, 'vendor'))) walk('vendor');
  return found.sort();
}

// The contents of the site's own files with their literal ?v= brought up to date, and the fingerprint of each. A file that
// names another with ?v= changes with it, so they settle in rounds (a file that names itself, even through others, never does).
function settle(dist = DIST) {
  const contents = new Map(ownFiles(dist).map(file => [file, fs.readFileSync(path.join(dist, file))]));
  for (let round = 0; ; round++) {
    const versions = new Map([...contents].map(([file, body]) => [file, assetVersion(body)]));
    let moved = false;
    for (const [file, body] of contents) {
      if (!body.includes('?v=')) continue;
      const before = body.toString('utf8');
      const after = before.replace(LITERAL, (all, quote, dot, name) => versions.has(name) ? `${quote}${dot || ''}${name}?v=${versions.get(name)}${quote}` : all);
      if (after !== before) { contents.set(file, Buffer.from(after, 'utf8')); moved = true; }
    }
    if (!moved) return {contents, versions};
    if (round > contents.size) throw new Error('sync-versions: arquivos que se citam com ?v= em círculo (nenhum ?v= fica parado)');
  }
}

// Scripts the pages run as classic scripts (journey.js, page-entry.js…): addressed with ?v= too, but not modules, so out of the map.
function classicScripts(pages) {
  const classic = new Set();
  for (const html of pages) for (const tag of html.match(/<script\b[^>]*>/gi) || []) {
    if (/\btype="(?:module|importmap|application\/ld\+json)"/.test(tag)) continue;
    const src = /\bsrc="(?:\.\/)?([^"?#]+)/.exec(tag)?.[1];
    if (src) classic.add(src);
  }
  return classic;
}
// Everything the versioned addresses need: fingerprints, settled contents and the import map shared by every page.
function state(dist = DIST, pages = pagesOf(dist).map(name => fs.readFileSync(path.join(dist, name), 'utf8'))) {
  const {contents, versions} = settle(dist), classic = classicScripts(pages);
  const imports = {};
  for (const [name, file] of Object.entries(BARE)) if (versions.has(file)) imports[name] = `./${file}?v=${versions.get(file)}`;
  for (const file of versions.keys()) if (file.endsWith('.js') && !classic.has(file)) imports[`./${file}`] = `./${file}?v=${versions.get(file)}`;
  return {contents, versions, map: `<script type="importmap">${JSON.stringify({imports})}</script>`};
}

const lineStart = (html, at) => html.lastIndexOf('\n', at - 1) + 1;
// The page without versions and without its import map: what the generators work on and compare (their output goes
// back through versionize). Lines that held only the import map go entirely.
function strip(html) {
  return html.replace(TAG, tag => tag.replace(ATTR, (all, attr, dot, name) => `${attr}="${dot || ''}${name}"`))
    .replace(/^[ \t]*<script type="importmap">[^<]*<\/script>[ \t]*\r?\n/gm, '').replace(MAP, '');
}
// Only the ?v= taken out of the tags (the import map stays): for tests that look for a plain <link> or <script>.
const withoutVersions = html => html.replace(TAG, tag => tag.replace(ATTR, (all, attr, dot, name) => `${attr}="${dot || ''}${name}"`));
// The page with every own stylesheet and script at its versioned address and, when it loads modules, the import map right
// before its first script (before journey.js: what a classic script preloads early already goes by the map).
function versionize(html, {versions, map} = state()) {
  let out = strip(html).replace(TAG, tag => tag.replace(ATTR, (all, attr, dot, name) => versions.has(name) ? `${attr}="${dot || ''}${name}?v=${versions.get(name)}"` : all));
  if (!MODULE_TAG.test(out)) return out;
  const first = out.search(/<script\b(?![^>]*application\/ld\+json)/i), at = lineStart(out, first), indent = /^[ \t]*/.exec(out.slice(at))[0];
  // the map's "./x.js" resolve against the page's base: a <base> (404.html) has to come before it
  if (/<base\b/i.test(out.slice(at))) throw new Error('sync-versions: o <base> tem de vir antes do primeiro script (o mapa de importação vai ali)');
  const eol = out.includes('\r\n') ? '\r\n' : '\n';
  return out.slice(0, at) + indent + map + eol + out.slice(at);
}

// What is out of date: own files whose literal ?v= moved, pages whose addresses or import map moved.
function outdated(dist = DIST) {
  const pages = pagesOf(dist), texts = pages.map(name => fs.readFileSync(path.join(dist, name), 'utf8')), now = state(dist, texts);
  const files = [...now.contents].filter(([file, body]) => !body.equals(fs.readFileSync(path.join(dist, file)))).map(([file, body]) => ({file, body}));
  const html = pages.map((name, i) => ({file: name, body: versionize(texts[i], now), was: texts[i]})).filter(page => page.body !== page.was);
  // addresses of own stylesheets or scripts that do not exist
  const missing = [];
  for (const [i, text] of texts.entries()) for (const tag of text.match(TAG) || []) for (const m of tag.matchAll(ATTR)) if (!now.versions.has(m[3]) && !/^https?:/.test(m[3])) missing.push(`${pages[i]}: ${m[3]}`);
  return {files, pages: html, missing, state: now};
}

if (require.main === module) {
  const check = process.argv.includes('--check');
  // 2 first: it rewrites pages, and part 1 and the policy read them
  const {files, pages, missing} = outdated();
  for (const line of missing) console.log(`ERRO endereço de arquivo que não existe: ${line}`);
  for (const {file, body} of files) { console.log(`${check ? 'desatualizado' : 'gravado'}: ${file} (?v= de outro arquivo)`); if (!check) fs.writeFileSync(path.join(DIST, file), body); }
  // the pages are worked out again after the files moved (their fingerprints changed)
  const pageFix = check ? pages : outdated().pages;
  for (const {file, body} of pageFix) { console.log(`${check ? 'desatualizada' : 'gravada'}: ${file} (?v= e mapa de importação)`); if (!check) fs.writeFileSync(path.join(DIST, file), body); }
  if (missing.length) process.exitCode = 1;

  const saved = read(), now = current(), {stale, forgot} = compare(saved, now);
  for (const line of forgot) console.log(`ERRO ${line}`);
  for (const line of stale) console.log(`${check || forgot.length ? 'desatualizado' : 'gravado'}: ${line}`);
  if (forgot.length) { console.log('Nada gravado em versioned-assets.json enquanto houver arquivo mudado com o mesmo ?v=.'); process.exitCode = 1; }
  else if (stale.length && !check) {
    const eol = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8').includes('\r\n') ? '\r\n' : '\n';
    fs.writeFileSync(FILE, JSON.stringify(now, null, 2).replace(/\n/g, eol) + eol);
  }

  // the import map's hash in the security policy (vercel.json and the <meta> of every page)
  const csp = require('./sync-csp.cjs').sync({check});
  for (const line of csp.changed) console.log(`${check ? 'desatualizada' : 'gravada'}: ${line} (política de segurança)`);

  const behind = files.length + pageFix.length + stale.length + csp.changed.length;
  if (!behind && !forgot.length && !missing.length) console.log(`${Object.keys(now).length} arquivos com ?v= escolhido à mão e ${state().versions.size} folhas e scripts do site com ?v= = conteúdo: em dia.`);
  else if (check && behind) { console.log('Rode node tools/sync-versions.cjs'); process.exitCode = 1; }
}

module.exports = {references, current, compare, read, FILE, ownFiles, settle, state, versionize, strip, withoutVersions, outdated, classicScripts, BARE};
