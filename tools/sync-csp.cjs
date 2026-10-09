#!/usr/bin/env node
'use strict';
// Copies the Content-Security-Policy from vercel.json into the <meta> tag of every page in dist/ (the Hostinger CDN
// replaces the header, so the markup carries the policy too). <meta> ignores frame-ancestors, so it is left out there.
// The import map is the one inline script the pages run (09/10/2026: it carries the ?v= of every module, so it changes with
// them, tools/sync-versions.cjs): the hashes in script-src are worked out here from the pages themselves, the old ones go.
// Run after changing the policy:  node tools/sync-csp.cjs   (--check to only report; tools/sync-versions.cjs runs it too;
// tests/headers.mjs fails while they differ)
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const CONFIG = path.join(root, 'vercel.json');
const DIST = path.join(root, 'dist');

const policyOf = raw => JSON.parse(raw).headers.find(r => r.source === '/(.*)').headers.find(h => h.key === 'Content-Security-Policy').value;
// 'sha256-…' of every inline script that runs (structured data for search engines is a data block: no hash needed)
function inlineHashes(pages) {
  const hashes = new Set();
  for (const html of pages) for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/.test(attrs) || attrs.trim() === 'type="application/ld+json"') continue;
    hashes.add(`'sha256-${crypto.createHash('sha256').update(body).digest('base64')}'`);
  }
  return [...hashes].sort();
}
// script-src with exactly these hashes, where the old ones were (after 'self' when there were none)
function withHashes(policy, hashes) {
  return policy.split(';').map(part => {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name !== 'script-src') return part;
    const kept = values.filter(value => !value.startsWith("'sha256-"));
    const at = values.findIndex(value => value.startsWith("'sha256-"));
    kept.splice(at >= 0 ? values.slice(0, at).filter(value => !value.startsWith("'sha256-")).length : kept.indexOf("'self'") + 1, 0, ...hashes);
    return `${part.match(/^\s*/)[0]}${[name, ...kept].join(' ')}`;
  }).join(';');
}
const metaOf = policy => `<meta http-equiv="Content-Security-Policy" content="${policy.split(';').map(s => s.trim()).filter(s => s && !s.startsWith('frame-ancestors')).join('; ')}">`;
function withMeta(html, tag, file = 'page') {
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  if (/<meta http-equiv="Content-Security-Policy" content="[^"]*">/.test(html)) return html.replace(/<meta http-equiv="Content-Security-Policy" content="[^"]*">/, () => tag);
  // First thing inside <head> after the <meta charset> (2026-10-07: the charset opens every page), before any script or stylesheet.
  const head = html.match(/<head>\r?\n([ \t]*)(?:<meta charset="utf-8">\r?\n\1)?/);
  if (!head) throw new Error(`${file}: <head> não encontrado`);
  return html.replace(head[0], () => `${head[0]}${tag}${eol}${head[1]}`);
}

// Brings vercel.json and every page in line (or, with check, only says what is behind). Returns {changed: [file…]}.
function sync({check = false} = {}) {
  const changed = [];
  const names = fs.readdirSync(DIST).filter(f => f.endsWith('.html')).sort();
  const pages = names.map(name => fs.readFileSync(path.join(DIST, name), 'utf8'));
  const raw = fs.readFileSync(CONFIG, 'utf8'), old = policyOf(raw), policy = withHashes(old, inlineHashes(pages));
  if (policy !== old) {
    changed.push('vercel.json');
    const quoted = JSON.stringify(old);
    if (raw.split(quoted).length !== 2) throw new Error('vercel.json: a política não aparece uma vez só, como esperado');
    if (!check) fs.writeFileSync(CONFIG, raw.replace(quoted, () => JSON.stringify(policy)));
  }
  const tag = metaOf(policy);
  for (const [i, name] of names.entries()) {
    const next = withMeta(pages[i], tag, name);
    if (next === pages[i]) continue;
    changed.push(name);
    if (!check) fs.writeFileSync(path.join(DIST, name), next);
  }
  return {changed};
}

if (require.main === module) {
  const check = process.argv.includes('--check'), {changed} = sync({check});
  for (const file of changed) console.log(`${check ? 'desatualizado' : 'atualizado'}: ${file}`);
  console.log(changed.length ? `${changed.length} arquivo(s) ${check ? 'fora do vercel.json — rode node tools/sync-csp.cjs' : 'atualizado(s)'}.` : 'Todas as páginas já estavam iguais ao vercel.json.');
  if (check && changed.length) process.exitCode = 1;
}

module.exports = {sync, inlineHashes, withHashes, metaOf, withMeta, policyOf};
