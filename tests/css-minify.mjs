// The stylesheets are served minified (server/minify-css.cjs, 2026-10-08 PageSpeed). Minifying must never change what a
// stylesheet says: here every dist/*.css is cut into CSS tokens (css-syntax-3, written independently of the minifier) before
// and after, and the two token sequences must be the same — only comments gone and whitespace collapsed, and dropped only next
// to { } ; , or at the ends, where the grammar ignores it. Plus the hard cases (strings, url(), escapes, comments between
// tokens, "and (", "a :hover", calc) one by one, and the server: minified body, length, validator and the cache per version.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import zlib from 'node:zlib';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const {minifyCss} = require('../server/minify-css.cjs');

// ── An independent tokenizer (css-syntax-3 §4) ─────────────────────────────────
function tokenize(css) {
  const out = []; let i = 0; const n = css.length;
  const ws = c => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
  const digit = c => c >= '0' && c <= '9';
  const hex = c => /^[0-9a-fA-F]$/.test(c || '');
  const nameStart = c => !!c && (/[a-zA-Z_]/.test(c) || c.charCodeAt(0) >= 0x80);
  const nameChar = c => !!c && (nameStart(c) || digit(c) || c === '-');
  const escapeOk = (a, b) => a === '\\' && b !== undefined && b !== '\n' && b !== '\r' && b !== '\f';
  const identStart = (a, b, c) => a === '-' ? (nameStart(b) || b === '-' || escapeOk(b, c)) : nameStart(a) || escapeOk(a, b);
  const numberStart = (a, b, c) => (a === '+' || a === '-') ? digit(b) || (b === '.' && digit(c)) : a === '.' ? digit(b) : digit(a);
  const escape = () => { const s = i; i++; if (hex(css[i])) { let k = 0; while (k < 6 && hex(css[i])) { i++; k++; } if (css[i] === '\r' && css[i + 1] === '\n') i += 2; else if (ws(css[i])) i++; } else i++; return css.slice(s, i); };
  const name = () => { let s = ''; for (;;) { if (nameChar(css[i])) s += css[i++]; else if (escapeOk(css[i], css[i + 1])) s += escape(); else return s; } };
  const number = () => { const s = i; if (css[i] === '+' || css[i] === '-') i++; while (digit(css[i])) i++; if (css[i] === '.' && digit(css[i + 1])) { i++; while (digit(css[i])) i++; } if ((css[i] === 'e' || css[i] === 'E') && (digit(css[i + 1]) || ((css[i + 1] === '+' || css[i + 1] === '-') && digit(css[i + 2])))) { i += 2; while (digit(css[i])) i++; } return css.slice(s, i); };
  const push = (type, value) => out.push({type, value});
  while (i < n) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; push('comment', ''); continue; }
    if (ws(c)) { while (ws(css[i])) i++; push('ws', ' '); continue; }
    if (c === '"' || c === "'") { const s = i++; while (i < n && css[i] !== c && css[i] !== '\n') i += css[i] === '\\' ? 2 : 1; i++; push('string', css.slice(s, i)); continue; }
    if (c === '#' && (nameChar(css[i + 1]) || escapeOk(css[i + 1], css[i + 2]))) { i++; push('hash', '#' + name()); continue; }
    if (numberStart(c, css[i + 1], css[i + 2])) { const num = number(); if (identStart(css[i], css[i + 1], css[i + 2])) push('dimension', num + name()); else if (css[i] === '%') { i++; push('percentage', num + '%'); } else push('number', num); continue; }
    if (identStart(c, css[i + 1], css[i + 2])) {
      const id = name();
      if (css[i] === '(') {
        if (id.toLowerCase() === 'url') { let j = i + 1; while (ws(css[j])) j++; if (css[j] !== '"' && css[j] !== "'") { const s = i + 1; while (i < n && css[i] !== ')') i += css[i] === '\\' ? 2 : 1; i++; push('url', 'url(' + css.slice(s, i - 1).trim() + ')'); continue; } }
        i++; push('function', id + '('); continue;
      }
      push('ident', id); continue;
    }
    if (c === '@' && identStart(css[i + 1], css[i + 2], css[i + 3])) { i++; push('at', '@' + name()); continue; }
    if (c === '<' && css.startsWith('<!--', i)) { i += 4; push('cdo', '<!--'); continue; }
    if (c === '-' && css.startsWith('-->', i)) { i += 3; push('cdc', '-->'); continue; }
    i++; push('{}[]();:,'.includes(c) ? c : 'delim', c);
  }
  return out;
}
const SILENT = new Set(['{', '}', ';', ',']);
// What the minifier promises: the original's tokens without comments, whitespace runs merged into one, and no whitespace next
// to { } ; , or at the ends. A comment that was the only thing between two tokens leaves either nothing or one space.
function expected(tokens) {
  const kept = [];
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.type === 'comment') { if (kept.length && kept[kept.length - 1].type !== 'ws') kept.push({type: 'joint', value: ''}); continue; }
    if (t.type === 'ws') { if (kept.length && kept[kept.length - 1].type === 'joint') kept.pop(); if (kept.length && kept[kept.length - 1].type !== 'ws') kept.push({type: 'ws', value: ' '}); continue; }
    if (kept.length && kept[kept.length - 1].type === 'joint') kept.pop();
    kept.push(t);
  }
  while (kept.length && kept[kept.length - 1].type === 'ws') kept.pop();
  return kept.filter((t, k) => t.type !== 'ws' || (!SILENT.has(kept[k - 1]?.type) && !SILENT.has(kept[k + 1]?.type)));
}
const same = (css, label) => {
  const min = minifyCss(css);
  const got = tokenize(min).map(t => `${t.type}:${t.value}`), want = expected(tokenize(css)).map(t => `${t.type}:${t.value}`);
  let k = 0; while (k < got.length && got[k] === want[k]) k++;
  assert.equal(k === got.length && k === want.length, true, `${label}: token ${k} differs — minified ${got[k]} · expected ${want[k]} (after ${got.slice(Math.max(0, k - 6), k).join(' ')})`);
  return min;
};

// ── The hard cases ─────────────────────────────────────────────────────────────
assert.equal(minifyCss('a  b {\n  color : red ;\n}\n'), 'a b{color : red;}', 'whitespace collapsed, gone next to { ; }');
assert.equal(minifyCss('/* x */ .a{}/* y */\n.b{}'), '.a{}.b{}');
assert.equal(minifyCss('.a{content:"  /* not a comment */ ; , {"}'), '.a{content:"  /* not a comment */ ; , {"}', 'strings untouched');
assert.equal(minifyCss(".a{background:url( data:image/svg+xml;utf8,<svg/*x*/> )}"), ".a{background:url( data:image/svg+xml;utf8,<svg/*x*/> )}", 'url() untouched');
assert.equal(minifyCss('@media screen and (max-width: 600px) { a :hover { margin: calc(1px + 2px) } }'), '@media screen and (max-width: 600px){a :hover{margin: calc(1px + 2px)}}', 'spaces kept where they can matter');
assert.equal(minifyCss('.a{margin:1px/**/2px}'), '.a{margin:1px 2px}', 'a comment between two tokens that would merge leaves a space');
assert.equal(minifyCss('.a{margin:1px/**/;}'), '.a{margin:1px;}');
assert.equal(minifyCss('.icon-\\31 0 {color:red}'), '.icon-\\31 0{color:red}', 'the space that ends a hex escape stays');
assert.equal(minifyCss('.a\\:b , .c{x:y}'), '.a\\:b,.c{x:y}');
assert.equal(minifyCss('a{font:12px "DM Sans", sans-serif}'), 'a{font:12px "DM Sans",sans-serif}');
assert.equal(minifyCss('\r\n.a {\r\n\tcolor: red;\r\n}\r\n'), '.a{color: red;}');
for (const css of ['a{b:c}', '/* only */', '', '   ', '@font-face{src:url(a.woff2?v=1) format("woff2")}', 'a{grid-template-areas:"a b"  "c d"}', 'a{--x:  1px   2px ;}']) same(css, JSON.stringify(css));

// ── Every stylesheet of the site ───────────────────────────────────────────────
let before = 0, after = 0;
const sheets = fs.readdirSync(path.join(root, 'dist')).filter(f => f.endsWith('.css'));
assert(sheets.length > 15);
for (const file of sheets) {
  const css = fs.readFileSync(path.join(root, 'dist', file), 'utf8');
  const min = same(css, file);
  assert.equal(minifyCss(min), min, `${file}: minifying twice changes nothing`);
  assert.equal((min.match(/\{/g) || []).length, (css.replace(/\/\*[^]*?\*\//g, '').match(/\{/g) || []).length, `${file}: same number of blocks`);
  before += css.length; after += min.length;
}
assert(after < before * .93, `the stylesheets get lighter (${before} → ${after} bytes)`);

// ── The server serves them minified, once per version ──────────────────────────
const {createServer} = require('../server/create-server.cjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'css-min-'));
const sheet = path.join(dir, 'site.css'), source = '/* the shop */\n.a {\n  color: red;\n}\n' + '.b { margin: 0 auto; }\n'.repeat(80);
fs.writeFileSync(sheet, source);
fs.writeFileSync(path.join(dir, 'page.html'), '<!doctype html><title>x</title>' + ' '.repeat(2000));
const server = createServer({root: dir, rules: [], log: {error: () => {}}});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const get = (target, headers = {}) => new Promise((resolve, reject) => http.get({host: '127.0.0.1', port: server.address().port, path: target, headers}, res => { const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({res, body: Buffer.concat(chunks)})); }).on('error', reject));
try {
  const plain = await get('/site.css');
  assert.equal(plain.body.toString(), minifyCss(source), 'identity: minified');
  assert.equal(Number(plain.res.headers['content-length']), plain.body.length);
  assert.match(plain.res.headers.etag, /-m"$/, 'its own validator');
  const br = await get('/site.css', {'accept-encoding': 'br'});
  assert.equal(br.res.headers['content-encoding'], 'br');
  assert.equal(zlib.brotliDecompressSync(br.body).toString(), minifyCss(source), 'compressed: the minified text');
  const again = await get('/site.css', {'if-none-match': plain.res.headers.etag});
  assert.equal(again.res.statusCode, 304);
  // a new version of the file: minified again (the cache is per version)
  await new Promise(r => setTimeout(r, 20));
  fs.writeFileSync(sheet, '.c {  color: blue; }');
  fs.utimesSync(sheet, new Date(), new Date(Date.now() + 5000));
  assert.equal((await get('/site.css')).body.toString(), '.c{color: blue;}');
  const page = await get('/page.html');
  assert.equal(page.body.length, 2000 + '<!doctype html><title>x</title>'.length, 'pages are served as they are');
} finally { server.close(); fs.rmSync(dir, {recursive: true, force: true}); }

console.log(`PASS: css-minify — ${sheets.length} stylesheets keep exactly their tokens (${Math.round(before / 1024)} KB → ${Math.round(after / 1024)} KB before compression); strings, url(), escapes and comments between tokens handled; the server serves them minified, with their own validator, per version.`);
