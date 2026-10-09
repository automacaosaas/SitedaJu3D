// Files asked for with ?v= are kept by the browser for a year without asking again (server/create-server.cjs, 2026-10-07).
// tools/versioned-assets.json records each one's ?v= and a fingerprint of its contents (tools/sync-versions.cjs): a file that
// changed while its ?v= stayed the same would reach past visitors only a year later, so this fails until the ?v= changes.
// The site's own stylesheets and scripts (09/10/2026) carry the fingerprint of their contents instead, written by the same
// tool into every page and into the import map: this fails while any address is behind its file.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const {current, compare, read} = require('../tools/sync-versions.cjs');

const now = current(), {stale, forgot} = compare(read(), now);
assert.deepEqual(forgot, [], 'a versioned file changed and its ?v= did not: change the ?v=, then run node tools/sync-versions.cjs');
assert.deepEqual(stale, [], 'tools/versioned-assets.json out of date: run node tools/sync-versions.cjs');

// What it covers: every 3D model, every gallery view and every font.
const files = Object.keys(now);
for (const m of fs.readFileSync(path.join(root, 'dist/asset-models.js'), 'utf8').matchAll(/'\.\/(assets\/models\/[\w-]+\.glb)\?v=([\w.-]+)'/g)) assert.equal(now[m[1]]?.v, m[2], `${m[1]} recorded with ?v=${m[2]}`);
for (const name of fs.readdirSync(path.join(root, 'dist/assets/vistas'))) assert(files.includes(`assets/vistas/${name}`), `assets/vistas/${name} recorded`);
for (const name of fs.readdirSync(path.join(root, 'dist/assets/fonts')).filter(f => f.endsWith('.woff2'))) assert(files.includes(`assets/fonts/${name}`), `assets/fonts/${name} recorded`);

// The rule itself.
const before = {'assets/a.glb': {v: '1', sha256: 'aaaa'}};
assert.equal(compare(before, {'assets/a.glb': {v: '1', sha256: 'bbbb'}}).forgot.length, 1, 'changed, same ?v=: caught');
assert.deepEqual(compare(before, {'assets/a.glb': {v: '2', sha256: 'bbbb'}}), {stale: ['assets/a.glb: ?v=1 → ?v=2'], forgot: []}, 'changed with a new ?v=: only to record');
assert.deepEqual(compare(before, before), {stale: [], forgot: []});
assert.equal(compare(before, {}).stale.length, 1, 'no longer versioned: to record');
assert.equal(compare({}, before).stale.length, 1, 'newly versioned: to record');

// ── The site's own stylesheets and scripts (09/10/2026): ?v= = the fingerprint of the contents ─────────────────────────
// They go out with a year in the cache at their versioned address (server/create-server.cjs); a file changed while the pages
// still ask for the old fingerprint would only reach returning visitors… never: the server would answer the old address
// revalidated, but the pages must name the new one. So every address must carry the file's current fingerprint.
const {assetVersion} = require('../server/asset-version.cjs');
const {outdated, state, versionize, strip, ownFiles, BARE} = require('../tools/sync-versions.cjs');
{
  const behind = outdated();
  assert.deepEqual(behind.missing, [], 'every stylesheet and script a page names exists');
  assert.deepEqual(behind.files.map(f => f.file), [], 'a literal ?v= inside a script is behind its file: run node tools/sync-versions.cjs');
  assert.deepEqual(behind.pages.map(p => p.file), [], 'a page asks for a stylesheet or script without its current fingerprint (the file changed, the ?v= did not): run node tools/sync-versions.cjs');

  const dist = path.join(root, 'dist'), own = new Set(ownFiles(dist));
  const print = file => assetVersion(fs.readFileSync(path.join(dist, file)));
  let tags = 0, maps = 0;
  for (const name of fs.readdirSync(dist).filter(f => f.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(dist, name), 'utf8');
    // every <link>/<script> of an own file, with its fingerprint (the <noscript> copies too)
    for (const tag of html.match(/<(?:link|script)\b[^>]*>/g) || []) {
      const ref = /\b(?:href|src)="(?:\.\/)?([^"?#]+\.(?:css|js))(\?v=[^"]*)?"/.exec(tag);
      if (!ref || /^https?:/.test(ref[1])) continue;
      assert(own.has(ref[1]), `${name}: ${ref[1]} is one of the site's files`);
      assert.equal(ref[2], `?v=${print(ref[1])}`, `${name}: ${ref[1]} asked for with its fingerprint`);
      tags++;
    }
    // one import map, the same everywhere, before the first script, when the page loads modules
    const found = html.match(/<script type="importmap">[^]*?<\/script>/g) || [];
    if (!/<script\b[^>]*\btype="module"|<link\b[^>]*\brel="modulepreload"/.test(html)) { assert.equal(found.length, 0, `${name}: no modules, no import map`); continue; }
    assert.equal(found.length, 1, `${name}: one import map`);
    assert.equal(html.indexOf(found[0]), html.search(/<script\b/), `${name}: the import map is the first script (what journey.js preloads early already goes by it)`);
    const {imports} = JSON.parse(/>([^]*)</.exec(found[0])[1]);
    for (const [key, value] of Object.entries(imports)) {
      const file = (BARE[key] || key.replace(/^\.\//, ''));
      assert.equal(value, `./${file}?v=${print(file)}`, `${name}: the import map sends ${key} to ${file} with its fingerprint`);
    }
    // a module named by the page (script or modulepreload) is at the very address the map gives it: one copy of each module
    for (const m of html.matchAll(/<(?:script type="module" src|link rel="modulepreload" href)="([^"?]+)(\?v=[^"]*)"/g)) assert.equal(`./${m[1]}${m[2]}`, imports[`./${m[1]}`], `${name}: ${m[1]} named at its mapped address`);
    maps++;
  }
  assert(tags > 200 && maps >= 20, `found the addresses (${tags}) and the import maps (${maps})`);

  // Every import in the site's modules goes through the map: relative paths to a mapped file, names only from BARE.
  const {map} = state();
  const imports = JSON.parse(/>([^]*)</.exec(map)[1]).imports;
  for (const file of own) {
    if (!file.endsWith('.js')) continue;
    const code = fs.readFileSync(path.join(dist, file), 'utf8').replace(/\/\*[^]*?\*\//g, '');
    // import … from '…', import '…', export … from '…' (minified too), import('…')
    for (const m of code.matchAll(/(?:(?:^|[;\s}])(?:import|export)\s*(?:[\w*${}\s,]*?\bfrom\s*)?|\bimport\(\s*)(['"])([^'"\n]+)\1/gm)) {
      const spec = m[2];
      if (/^\.{1,2}\//.test(spec)) {
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
        assert(imports[`./${target}`], `${file} imports ${spec}: in the import map`);
      } else assert(spec in BARE, `${file} imports "${spec}" by name: only ${Object.keys(BARE).join(', ')} are mapped`);
    }
  }

  // The rule itself, on a small site of its own: a page with a stylesheet, a classic script, a module, a modulepreload and a
  // script that preloads another early ('b.js?v=…'); a file changed without its ?v= changing is caught.
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'ju-versions-'));
  try {
    const put = (file, text) => fs.writeFileSync(path.join(site, file), text);
    put('a.js', "import {b} from './b.js';\nexport const a = b;\n"); put('b.js', 'export const b = 1;\n'); put('style.css', 'body{color:red}\n');
    put('early.js', "document.head.append(Object.assign(document.createElement('link'), {rel: 'modulepreload', href: 'b.js?v=0'}));\n");
    put('index.html', '<!doctype html>\n<html>\n<head>\n  <meta charset="utf-8">\n  <script src="early.js"></script>\n  <link rel="stylesheet" href="style.css">\n  <link rel="modulepreload" href="b.js">\n  <script type="module" src="a.js"></script>\n</head>\n<body></body>\n</html>\n');
    put('plain.html', '<!doctype html>\n<html>\n<head>\n  <link rel="stylesheet" href="style.css?v=old">\n</head>\n</html>\n');
    const v = file => assetVersion(fs.readFileSync(path.join(site, file)));
    assert.deepEqual(outdated(site).files.map(f => f.file), ['early.js'], 'the literal ?v= is behind');
    fs.writeFileSync(path.join(site, 'early.js'), outdated(site).files[0].body);
    assert(fs.readFileSync(path.join(site, 'early.js'), 'utf8').includes(`href: 'b.js?v=${v('b.js')}'`), 'the literal gets b.js\'s fingerprint');
    const now = state(site), page = versionize(fs.readFileSync(path.join(site, 'index.html'), 'utf8'), now);
    assert.equal(page, `<!doctype html>\n<html>\n<head>\n  <meta charset="utf-8">\n  <script type="importmap">{"imports":{"./a.js":"./a.js?v=${v('a.js')}","./b.js":"./b.js?v=${v('b.js')}"}}</script>\n  <script src="early.js?v=${v('early.js')}"></script>\n  <link rel="stylesheet" href="style.css?v=${v('style.css')}">\n  <link rel="modulepreload" href="b.js?v=${v('b.js')}">\n  <script type="module" src="a.js?v=${v('a.js')}"></script>\n</head>\n<body></body>\n</html>\n`, 'every address versioned, the map before the first script, the classic script out of it');
    assert.equal(versionize(page, now), page, 'running again changes nothing');
    assert.equal(strip(page), fs.readFileSync(path.join(site, 'index.html'), 'utf8'), 'strip gives back the page the generators work on');
    assert.equal(versionize(fs.readFileSync(path.join(site, 'plain.html'), 'utf8'), now), `<!doctype html>\n<html>\n<head>\n  <link rel="stylesheet" href="style.css?v=${v('style.css')}">\n</head>\n</html>\n`, 'a wrong ?v= is corrected; no modules, no map');
    put('index.html', page); put('plain.html', versionize(fs.readFileSync(path.join(site, 'plain.html'), 'utf8'), now));
    assert.deepEqual(outdated(site).pages, [], 'up to date');
    put('b.js', 'export const b = 2;\n');   // changed, nobody ran the tool
    const after = outdated(site);
    assert.deepEqual(after.files.map(f => f.file), ['early.js'], 'caught: the early preload still names the old b.js');
    assert.deepEqual(after.pages.map(p => p.file), ['index.html'], 'caught: the page still asks for the old b.js');
    put('style.css', 'body{color:blue}\n');
    assert.deepEqual(outdated(site).pages.map(p => p.file), ['index.html', 'plain.html'], 'caught: a stylesheet changed under the same ?v=');
  } finally { fs.rmSync(site, {recursive: true, force: true}); }
}

console.log(`PASS: versioned-assets — ${files.length} files with ?v= (models, gallery views, fonts) recorded with their contents; none changed without a new ?v=; the site's stylesheets and scripts asked for at their fingerprint everywhere, through one import map.`);
