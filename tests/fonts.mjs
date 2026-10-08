// The shop's fonts come from the shop itself (2026-10-07, PageSpeed: the Google Fonts stylesheet blocked the first paint
// from two other hosts). Every @font-face file exists with its licence, the weights are the ones the Google stylesheet
// declared (so the browser picks the same face), the fallbacks keep the text in place while a font arrives, no page or
// policy still names Google Fonts, the pages preload the very DM Sans file theme.css asks for, and the servers keep the
// files for a year.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const theme = read('dist/theme.css');
const faces = [...theme.matchAll(/@font-face\{([^}]*)\}/g)].map(m => m[1]);
const web = faces.filter(face => face.includes('src:url(')), fallbacks = faces.filter(face => face.includes('src:local('));

// The files: woff2, in assets/fonts, with ?v= (a year in the cache), swap (the text shows at once).
const urls = new Set();
for (const face of web) {
  const url = /src:url\(([^)]+)\) format\('woff2'\)/.exec(face)?.[1];
  assert.match(url || '', /^assets\/fonts\/[a-z0-9-]+\.woff2\?v=\d+$/, `font file with a version: ${face}`);
  assert.equal(fs.readFileSync(path.join(root, 'dist', url.split('?')[0])).toString('latin1', 0, 4), 'wOF2', `${url}: a WOFF2 file`);
  assert.match(face, /font-display:swap/, `${url}: font-display swap`);
  urls.add(url);
}
assert.deepEqual(web.map(face => `${/font-family:'([^']+)'/.exec(face)[1]} ${/font-style:(\w+)/.exec(face)[1]} ${/font-weight:(\d+)/.exec(face)[1]}`), [
  ...[400, 450, 500, 550, 600, 650, 700].map(w => `DM Sans normal ${w}`), ...[500, 600, 700].map(w => `Playfair Display normal ${w}`),
  ...[500, 600].map(w => `Playfair Display italic ${w}`), 'Parisienne normal 400', 'Roboto normal 500'
], 'the weights and styles of the Google stylesheet the pages used to load');
const shipped = fs.readdirSync(path.join(root, 'dist/assets/fonts'));
assert.deepEqual(shipped.filter(f => f.endsWith('.woff2')).sort(), [...urls].map(u => u.slice('assets/fonts/'.length).split('?')[0]).filter((f, i, all) => all.indexOf(f) === i).sort(), 'no font file left unused');
assert(theme.indexOf('@font-face') < theme.indexOf(':root{'), 'the faces open theme.css');

// The licence ships with the files.
const ofl = read('dist/assets/fonts/OFL.txt');
assert.match(ofl, /SIL OPEN FONT LICENSE Version 1\.1/);
for (const owner of ['The DM Sans Project Authors', 'The Playfair Display Project Authors', 'Brian J. Bonislawsky', 'The Roboto Project Authors']) assert(ofl.includes(owner), `licence names ${owner}`);

// Fallbacks: local Arial and Georgia resized to the web font (size, ascent, descent, no line gap), regular and bold, only for
// the characters the web font has (an arrow or a check mark keeps falling back to the system font as before).
for (const family of ['DM Sans Fallback', 'Playfair Display Fallback']) {
  const own = fallbacks.filter(face => face.includes(`font-family:'${family}'`));
  assert.equal(own.length, 2, `${family}: regular and bold`);
  for (const face of own) for (const rule of [/size-adjust:\d+(\.\d+)?%/, /ascent-override:\d+(\.\d+)?%/, /descent-override:\d+(\.\d+)?%/, /line-gap-override:0%/, /unicode-range:U\+0000-00FF,/]) assert.match(face, rule, `${family}: ${rule}`);
}
// Every stack in the site's stylesheets names the fallback right after the web font (account.css and admin.css excepted).
for (const file of fs.readdirSync(path.join(root, 'dist')).filter(f => f.endsWith('.css') && !['account.css', 'admin.css'].includes(f))) {
  const css = read(`dist/${file}`).replace(/@font-face\{[^}]*\}/g, '');
  for (const [name, fallback] of [['DM Sans', 'DM Sans Fallback'], ['Playfair Display', 'Playfair Display Fallback']])
    for (const m of css.matchAll(new RegExp(`'${name}'\\s*,\\s*([^;}]*)`, 'g'))) assert(m[1].startsWith(`'${fallback}'`), `${file}: '${name}' followed by '${fallback}' (${m[0].slice(0, 60)})`);
}

// No page and no policy names Google Fonts any more; every page with the site's styles preloads the DM Sans file of theme.css
// (same address, so the preload is the file the page uses), before its first stylesheet.
const dmSans = [...urls].find(u => u.includes('dm-sans'));
for (const page of fs.readdirSync(path.join(root, 'dist')).filter(f => f.endsWith('.html'))) {
  const html = read(`dist/${page}`);
  assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)\.com/, `${page}: nothing from Google Fonts`);
  if (!html.includes('href="theme.css"')) continue;
  const preloads = [...html.matchAll(/<link rel="preload"[^>]*as="font"[^>]*>/g)].map(m => m[0]);
  assert.deepEqual(preloads, [`<link rel="preload" href="${dmSans}" as="font" type="font/woff2" crossorigin>`], `${page}: preloads only DM Sans`);
  assert(html.indexOf(preloads[0]) < html.indexOf('<link rel="stylesheet"'), `${page}: the preload before the stylesheets`);
}
assert.doesNotMatch(read('vercel.json'), /fonts\.(googleapis|gstatic)\.com/, 'the policy no longer allows Google Fonts');
assert.match(read('tools/dev-server.cjs'), /'\.woff2': 'font\/woff2'/, 'the local server knows the type');

// The production server: font/woff2, a year with ?v=, never compressed again (WOFF2 is already Brotli inside).
const {createServer} = require('../server/create-server.cjs');
const server = createServer({log: {error: () => {}}});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const get = target => new Promise((resolve, reject) => http.get({host: '127.0.0.1', port: server.address().port, path: target, headers: {'accept-encoding': 'br, gzip'}}, res => { res.resume(); res.on('end', () => resolve(res)); }).on('error', reject));
try {
  const font = await get(`/${dmSans}`);
  assert.equal(font.statusCode, 200);
  assert.equal(font.headers['content-type'], 'font/woff2');
  assert.equal(font.headers['cache-control'], 'public, max-age=31536000, immutable', 'a year, never revalidated');
  assert.equal(font.headers['content-encoding'], undefined);
  assert.match((await get(`/${dmSans.split('?')[0]}`)).headers['cache-control'], /max-age=86400, stale-while-revalidate/, 'without ?v= the usual asset rule');
} finally { server.close(); }

console.log('PASS: fonts — DM Sans, Playfair Display, Parisienne and Roboto served by the shop (same files and weights as Google Fonts, OFL licence), metric fallbacks in every stack, DM Sans preloaded on every page, nothing from Google Fonts, a year in the cache.');
