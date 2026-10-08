#!/usr/bin/env node
'use strict';
// Copies the Content-Security-Policy from vercel.json into the <meta> tag of every page in dist/ (the Hostinger CDN
// replaces the header, so the markup carries the policy too). <meta> ignores frame-ancestors, so it is left out there.
// Run after changing the policy:  node tools/sync-csp.cjs   (tests/headers.mjs fails while they differ)
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const policy = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8')).headers.find(r => r.source === '/(.*)').headers.find(h => h.key === 'Content-Security-Policy').value;
const meta = policy.split(';').map(s => s.trim()).filter(s => s && !s.startsWith('frame-ancestors')).join('; ');
const tag = `<meta http-equiv="Content-Security-Policy" content="${meta}">`;

let changed = 0;
for (const file of fs.readdirSync(path.join(root, 'dist')).filter(f => f.endsWith('.html'))) {
  const p = path.join(root, 'dist', file);
  const html = fs.readFileSync(p, 'utf8');
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  let next;
  if (/<meta http-equiv="Content-Security-Policy" content="[^"]*">/.test(html)) next = html.replace(/<meta http-equiv="Content-Security-Policy" content="[^"]*">/, tag);
  else {
    // First thing inside <head> after the <meta charset> (2026-10-07: the charset opens every page), before any script or stylesheet.
    const head = html.match(/<head>\r?\n([ \t]*)(?:<meta charset="utf-8">\r?\n\1)?/);
    if (!head) throw new Error(`${file}: <head> não encontrado`);
    next = html.replace(head[0], `${head[0]}${tag}${eol}${head[1]}`);
  }
  if (next !== html) { fs.writeFileSync(p, next); changed++; console.log(`atualizado: ${file}`); }
}
console.log(changed ? `${changed} página(s) atualizada(s).` : 'Todas as páginas já estavam iguais ao vercel.json.');
