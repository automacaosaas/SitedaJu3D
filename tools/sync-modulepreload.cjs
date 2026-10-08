'use strict';
// <link rel="modulepreload"> for every module the home imports statically (2026-10-07, PageSpeed). Without them the browser
// finds the modules one level at a time (site-shell.js → cart-store.js → products.js…), a round trip per level before the
// showcase can draw. The list is written between <!-- modulepreload --> and <!-- /modulepreload --> in index.html, after the
// import map (a module fetched before the import map would ignore it), from the import statements themselves, so it cannot
// drift: tests/pagespeed.mjs fails while the page is out of date. Dynamic import() stays out (three.js, the dictionaries,
// consent.js load only when needed).
// Run: node tools/sync-modulepreload.cjs   (or --check to only report)
const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist');
const PAGE = 'index.html';
const BLOCK = /([ \t]*)<!-- modulepreload -->[^]*?<!-- \/modulepreload -->/;

// Relative modules a file imports statically: `import … from './x.js'`, `import './x.js'`, `export … from './x.js'`.
function imports(file) {
  const code = fs.readFileSync(path.join(DIST, file), 'utf8').replace(/\/\*[^]*?\*\//g, '');
  const found = [];
  for (const m of code.matchAll(/^[ \t]*(?:import|export)\s*(?:[\w*${}\s,]*?\bfrom\s*)?['"](\.{1,2}\/[^'"\n]+\.js)['"]/gm)) found.push(path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1])));
  return found;
}
// The page's own module scripts, in order.
const entries = html => [...html.matchAll(/<script type="module" src="([^"]+)"><\/script>/g)].map(m => m[1]);
// Every module reachable from them, breadth first (the first levels are what the page waits for longest), entries left out
// (the page already names them).
function graph(html) {
  const roots = entries(html), seen = new Set(roots), order = [];
  let level = roots;
  while (level.length) {
    const next = [];
    for (const file of level) for (const dep of imports(file)) if (!seen.has(dep)) { seen.add(dep); order.push(dep); next.push(dep); }
    level = next;
  }
  return order;
}
function sync(html) {
  const match = BLOCK.exec(html);
  if (!match) throw new Error(`${PAGE}: no <!-- modulepreload --> block`);
  const eol = html.includes('\r\n') ? '\r\n' : '\n', indent = match[1];
  if (html.indexOf(match[0]) < html.indexOf('<script type="importmap">')) throw new Error(`${PAGE}: the modulepreload block must come after the import map`);
  const lines = [`${indent}<!-- modulepreload -->`, ...graph(html).map(file => `${indent}<link rel="modulepreload" href="${file}">`), `${indent}<!-- /modulepreload -->`];
  return html.replace(BLOCK, () => lines.join(eol));
}

if (require.main === module) {
  const check = process.argv.includes('--check'), file = path.join(DIST, PAGE), html = fs.readFileSync(file, 'utf8'), next = sync(html);
  if (next === html) console.log(`${PAGE}: modulepreload em dia.`);
  else if (check) { console.log(`${PAGE}: modulepreload desatualizado — rode node tools/sync-modulepreload.cjs`); process.exitCode = 1; }
  else { fs.writeFileSync(file, next); console.log(`${PAGE}: modulepreload atualizado (${graph(html).length} módulos).`); }
}

module.exports = {sync, graph, imports, entries, PAGE, DIST};
