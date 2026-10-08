'use strict';
// What the two classic scripts that run before the styles need from products.js (2026-10-08, PageSpeed). They cannot import
// modules (they run first, synchronously), so the data is written into them here, between markers, and tests/pagespeed.mjs
// fails while either is out of date:
// - journey.js: the theme colours a page wears before any piece is chosen = the colours the showcase computes for the piece
//   it opens on (journeyColors of the first piece, hero-motion.js). When they differed by one unit, every themed element
//   (announcement bar, cards) ran a colour transition right at load (Lighthouse: non-composited animations).
// - page-entry.js: the first photo of the showcase, preloaded for the piece the home opens on (the address, its alias, the
//   remembered piece, else the first), every piece of the showcase with the very srcset and sizes carousel.js gives it.
// Run: node tools/sync-entry.cjs   (or --check to only report)
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const DIST = path.join(__dirname, '..', 'dist');
const BLOCK = /([ \t]*)\/\/ <entry-data>[^]*?\/\/ <\/entry-data>/;

async function data() {
  const load = file => import(pathToFileURL(path.join(DIST, file)).href);
  const {PRODUCTS, SOON, ALIASES, HERO_SIZES, artSrcset, showcase} = await load('products.js');
  const {journeyColors} = await load('hero-motion.js');
  // the showcase's own order (carousel.js): the pieces on sale, then the novelties
  const keys = [...Object.keys(PRODUCTS), ...Object.keys(SOON)];
  const pieces = Object.fromEntries(keys.map(key => {
    const product = PRODUCTS[key] || SOON[key], file = product.catalogImage || product.image;
    return [key, [`assets/${file}`, artSrcset(file)]];
  }));
  return {pieces, aliases: ALIASES, sizes: HERO_SIZES, theme: journeyColors(showcase(keys[0]).theme)};
}

function write(html, lines, file) {
  const match = BLOCK.exec(html);
  if (!match) throw new Error(`${file}: no // <entry-data> block`);
  const eol = html.includes('\r\n') ? '\r\n' : '\n', indent = match[1];
  return html.replace(BLOCK, () => [`${indent}// <entry-data> written by tools/sync-entry.cjs from products.js — do not edit by hand`, ...lines.map(line => indent + line), `${indent}// </entry-data>`].join(eol));
}
const quote = value => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const object = record => `{${Object.entries(record).map(([key, value]) => `${quote(key)}:${Array.isArray(value) ? `[${value.map(quote).join(', ')}]` : quote(value)}`).join(', ')}}`;

async function sync() {
  const {pieces, aliases, sizes, theme} = await data();
  const out = {};
  const journey = fs.readFileSync(path.join(DIST, 'journey.js'), 'utf8');
  out['journey.js'] = [journey, write(journey, [`const defaults = ${object(theme)};`], 'journey.js')];
  const entry = fs.readFileSync(path.join(DIST, 'page-entry.js'), 'utf8');
  out['page-entry.js'] = [entry, write(entry, [`const PIECES = ${object(pieces)};`, `const ALIASES = ${object(aliases)};`, `const HERO_SIZES = ${quote(sizes)};`], 'page-entry.js')];
  return out;
}

if (require.main === module) {
  sync().then(out => {
    const check = process.argv.includes('--check');
    for (const [file, [before, after]] of Object.entries(out)) {
      if (before === after) console.log(`${file}: em dia.`);
      else if (check) { console.log(`${file}: desatualizado — rode node tools/sync-entry.cjs`); process.exitCode = 1; }
      else { fs.writeFileSync(path.join(DIST, file), after); console.log(`${file}: atualizado.`); }
    }
  }).catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = {sync, data};
