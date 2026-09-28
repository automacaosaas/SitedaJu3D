// vercel.json headers: the Content-Security-Policy must allow exactly what the pages load, and assets keep a cache rule.
// A stale hash or a new external host would silently break the live site, so this test compares the policy with the pages.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, readdir} from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const config = JSON.parse(await readFile(new URL('vercel.json', root), 'utf8'));
const rule = source => config.headers.find(r => r.source === source);
const header = (r, key) => r?.headers.find(h => h.key.toLowerCase() === key.toLowerCase())?.value;

for (const r of config.headers) assert.match(r.source, /^\/([a-z-]+\/)?\(\.\*\)$/, `simple "/prefix/(.*)" source (tools/dev-server.cjs reads it as a RegExp): ${r.source}`);

const global = rule('/(.*)');
const csp = header(global, 'Content-Security-Policy');
assert(csp, 'CSP on every path');
const directives = Object.fromEntries(csp.split(';').map(part => part.trim().split(/\s+/)).filter(p => p[0]).map(([name, ...values]) => [name, values]));
const allows = (directive, source) => (directives[directive] || directives['default-src']).includes(source);

for (const name of ['default-src', 'script-src', 'style-src', 'font-src', 'img-src', 'connect-src', 'object-src', 'base-uri', 'form-action', 'frame-ancestors']) assert(directives[name], `CSP has ${name}`);
assert.deepEqual(directives['object-src'], ["'none'"], 'no plugins');
assert.deepEqual(directives['frame-ancestors'], ["'self'"], 'other sites cannot frame the shop (the e-mail preview frames our own /api)');
assert(!directives['script-src'].includes("'unsafe-inline'") && !directives['script-src'].includes("'unsafe-eval'"), 'no inline or eval scripts');
assert.equal(header(global, 'X-Content-Type-Options'), 'nosniff');
assert.equal(header(global, 'X-Frame-Options'), 'SAMEORIGIN');
assert(header(global, 'Referrer-Policy'), 'Referrer-Policy set');

// Every page also carries the policy in a <meta> tag: the Hostinger CDN replaces the CSP header with its own
// "upgrade-insecure-requests", while the markup reaches the browser untouched. <meta> ignores frame-ancestors (X-Frame-Options
// covers framing), so it is the header policy without that directive, placed before any script or stylesheet.
const metaPolicy = csp.split(';').map(s => s.trim()).filter(s => s && !s.startsWith('frame-ancestors')).join('; ');

// Every inline script (the import map) is allowed by its exact hash; nothing else is inline.
const pages = (await readdir(new URL('dist/', root))).filter(f => f.endsWith('.html'));
const hashes = new Set();
for (const page of pages) {
  const html = await readFile(new URL(`dist/${page}`, root), 'utf8');
  const metas = [...html.matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/g)];
  assert.equal(metas.length, 1, `${page}: one CSP <meta> tag`);
  assert.equal(metas[0][1], metaPolicy, `${page}: CSP <meta> equals vercel.json without frame-ancestors. Use:\n<meta http-equiv="Content-Security-Policy" content="${metaPolicy}">`);
  const firstResource = html.search(/<script\b|<link\b|<style\b/);
  assert(firstResource === -1 || metas[0].index < firstResource, `${page}: CSP <meta> comes before any script, stylesheet or style`);
  assert(!/\son[a-z]+\s*=\s*["']/i.test(html), `${page}: no inline event handlers`);
  assert(!/(href|src)\s*=\s*["']javascript:/i.test(html), `${page}: no javascript: URLs`);
  for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/.test(attrs)) { assert.equal(body.trim(), '', `${page}: script with src has no body`); continue; }
    assert.match(attrs, /type="importmap"/, `${page}: only the import map may be inline (move other scripts to a .js file)`);
    const hash = `'sha256-${createHash('sha256').update(body).digest('base64')}'`;
    assert(directives['script-src'].includes(hash), `${page}: import map hash ${hash} is in script-src — update vercel.json after editing the import map`);
    hashes.add(hash);
  }
  // External stylesheets the page asks for.
  for (const [, url] of html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="(https:\/\/[^"]+)"/g)) {
    const origin = new URL(url.replace(/&amp;/g, '&')).origin;
    assert(allows('style-src', origin), `${page}: style-src allows ${origin}`);
    if (origin === 'https://fonts.googleapis.com') assert(allows('font-src', 'https://fonts.gstatic.com'), `${page}: font-src allows the Google Fonts files`);
  }
}
for (const hash of directives['script-src'].filter(s => s.startsWith("'sha256-"))) assert(hashes.has(hash), `no stale hash left in script-src: ${hash}`);

// CSS must not pull anything from other hosts that the policy does not know about.
for (const file of (await readdir(new URL('dist/', root))).filter(f => f.endsWith('.css'))) {
  const css = await readFile(new URL(`dist/${file}`, root), 'utf8');
  assert(!/@import\s+url\(['"]?https?:/i.test(css), `${file}: no external @import (load fonts with <link> in the page head)`);
}

// The Meshopt decoder compiles WebAssembly; without this keyword every 3D preview fails.
const assetModels = await readFile(new URL('dist/asset-models.js', root), 'utf8');
if (assetModels.includes('meshopt_decoder')) assert(directives['script-src'].includes("'wasm-unsafe-eval'"), "script-src has 'wasm-unsafe-eval' for the Meshopt decoder");

// E-mail logos load from the public site (api/_lib/mail.js DEFAULT_SITE); the dev e-mail preview shows them in a frame.
const mail = await readFile(new URL('api/_lib/mail.js', root), 'utf8');
const site = mail.match(/DEFAULT_SITE = '([^']+)'/)[1];
assert(allows('img-src', new URL(site).origin), `img-src allows the public site ${site}`);
assert(allows('img-src', 'data:') && allows('img-src', 'blob:'), 'cart thumbnails (data:) and 3D textures (blob:)');

// Heavy files: images and models are cached, then refreshed in the background.
for (const source of ['/assets/(.*)', '/vendor/(.*)']) {
  const cache = header(rule(source), 'Cache-Control');
  assert.match(cache || '', /max-age=\d+/, `${source}: max-age`);
  assert.match(cache || '', /stale-while-revalidate=\d+/, `${source}: stale-while-revalidate`);
}

// Mercado Pago Payment Brick (dist/live-payment.js): the SDK and the form bundle, its API calls and the card's secure fields
// (iframes). Measured by loading the real SDK under this policy; its "advanced fraud prevention" injects an inline script,
// so it stays off instead of allowing inline scripts.
const livePayment = await readFile(new URL('dist/live-payment.js', root), 'utf8');
if (livePayment.includes('https://sdk.mercadopago.com')) {
  for (const host of ['https://sdk.mercadopago.com', 'https://http2.mlstatic.com']) assert(allows('script-src', host), `script-src allows ${host} (Payment Brick)`);
  for (const host of ['https://api.mercadopago.com', 'https://http2.mlstatic.com']) assert(allows('connect-src', host), `connect-src allows ${host} (Payment Brick)`);
  assert(allows('frame-src', 'https://*.mercadopago.com'), 'frame-src allows the card secure fields (Payment Brick)');
  assert(allows('frame-src', "'self'"), 'frame-src keeps our own frames (e-mail preview)');
  assert(/advancedFraudPrevention: false/.test(livePayment), 'the SDK runs without the inline-script fraud module (the policy has no unsafe-inline)');
}

console.log('PASS: CSP matches the pages (import map hash, no inline scripts or handlers, fonts, WebAssembly, e-mail logo, Mercado Pago), security headers and asset caching.');
