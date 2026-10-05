// server.cjs, the production server for the Hostinger: pages, /api routes, vercel.json headers, caching, compression and
// the guards that keep anything outside dist/ (and api/_lib) unreachable.
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {createServer} = require('../server/create-server.cjs');
const errors = [];
const server = createServer({log: {error: (...args) => errors.push(args.join(' '))}});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

// Raw request: fetch() would normalize "/../" before sending, which is exactly what an attacker would not do.
const raw = (path, {method = 'GET', headers = {}} = {}) => new Promise((resolve, reject) => {
  const req = http.request(base + '/', {method, path, headers}, res => { const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks)})); });
  req.on('error', reject); req.end();
});

try {
  // Pages and security headers from vercel.json.
  const home = await raw('/', {headers: {'accept-encoding': 'identity'}});
  assert.equal(home.status, 200);
  assert.match(home.headers['content-type'], /^text\/html/);
  assert.match(home.body.toString(), /<script type="importmap">/);
  assert.match(home.headers['content-security-policy'] || '', /script-src 'self' 'sha256-/, 'CSP on pages');
  assert.equal(home.headers['x-frame-options'], 'SAMEORIGIN');
  assert.equal(home.headers['x-content-type-options'], 'nosniff');
  assert.equal(home.headers['cache-control'], 'public, max-age=0, must-revalidate', 'pages always revalidate');
  assert.equal(home.headers['x-powered-by'], undefined);
  assert.equal(home.headers['x-robots-tag'], 'noindex, nofollow', 'test deployments stay out of search results');
  assert.equal((await raw('/produtos.html')).status, 200);

  // Revalidation is cheap: same ETag → 304 with no body.
  const again = await raw('/', {headers: {'if-none-match': home.headers.etag}});
  assert.equal(again.status, 304);
  assert.equal(again.body.length, 0);

  // Assets: right type, long cache, compression where it pays.
  const logo = await raw('/assets/logo-ju.webp');
  assert.equal(logo.status, 200);
  assert.equal(logo.headers['content-type'], 'image/webp');
  assert.match(logo.headers['cache-control'], /max-age=86400, stale-while-revalidate=604800/);
  assert.equal(logo.headers['content-encoding'], undefined, 'images are already compressed');
  const model = await raw('/assets/models/dinossauroscopio.glb?v=meshopt1', {headers: {'accept-encoding': 'br, gzip'}});
  assert.equal(model.status, 200);
  assert.equal(model.headers['content-type'], 'model/gltf-binary');
  assert.equal(model.headers['content-encoding'], 'br');
  assert.equal(Number(model.headers['content-length']), model.body.length);
  const three = await raw('/vendor/three.module.min.js', {headers: {'accept-encoding': 'gzip'}});
  assert.equal(three.headers['content-encoding'], 'gzip');
  assert.match(three.headers['content-type'], /^text\/javascript/);
  assert.equal(three.headers.vary, 'Accept-Encoding');
  const head = await raw('/assets/logo-ju.webp', {method: 'HEAD'});
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);
  assert.equal(Number(head.headers['content-length']), logo.body.length);

  // Nothing outside dist/ is ever served, however the path is spelled.
  for (const path of ['/../package.json', '/%2e%2e/package.json', '/assets/%2e%2e/%2e%2e/server.cjs', '/..%2fvercel.json', '/assets/..%5c..%5cpackage.json', '/%00', '/.git/config', '/assets/.hidden']) {
    const res = await raw(path);
    assert.equal(res.status, 404, `blocked: ${path}`);
    assert(!/"scripts"|createServer|\[core\]/.test(res.body.toString()), `no file content leaks for ${path}`);
  }
  assert.equal((await raw('/nao-existe.html')).status, 404);
  assert.equal((await raw('/', {method: 'POST'})).status, 405, 'pages are read-only');

  // API routes behave like Vercel's; helpers in api/_lib are not routes.
  const health = await raw('/api/health');
  assert.equal(health.status, 200);
  assert.equal(JSON.parse(health.body).ok, true);
  assert.match(health.headers['content-security-policy'] || '', /default-src 'self'/, 'API responses carry the same headers');
  for (const path of ['/api/_lib/mail', '/api/_lib/http', '/api/../server', '/api/nao-existe', '/api/Health']) assert.equal((await raw(path)).status, 404, `not a route: ${path}`);
  assert.equal((await raw('/api/auth/start')).status, 405, 'handlers keep their own method checks');

  assert.deepEqual(errors, [], 'no server errors logged');

  // APP_ENV (Hostinger) and VERCEL_ENV (Vercel) both mark production; outside it, localhost is accepted for local tests.
  const {isProduction} = require('../api/_lib/runtime.js');
  const {sameOrigin} = require('../api/_lib/http.js');
  const {config} = require('../api/_lib/mail.js');
  assert.equal(isProduction({APP_ENV: 'production'}), true);
  assert.equal(isProduction({VERCEL_ENV: 'production'}), true);
  assert.equal(isProduction({APP_ENV: 'preview'}), false);
  const from = origin => ({headers: {origin}});
  assert.equal(sameOrigin(from('https://teste.hostingersite.com'), {APP_ENV: 'preview', SITE_URL: 'https://teste.hostingersite.com'}), true, 'SITE_URL is the allowed origin');
  assert.equal(sameOrigin(from('https://outro-site.com'), {APP_ENV: 'production', SITE_URL: 'https://juimprimepramim.com.br'}), false);
  assert.equal(sameOrigin(from('http://localhost:3000'), {APP_ENV: 'production', SITE_URL: 'https://juimprimepramim.com.br'}), false, 'no localhost in production');
  assert.equal(sameOrigin(from('http://localhost:3000'), {APP_ENV: 'preview'}), true);
  assert.equal(config({APP_ENV: 'production', SITE_URL: 'https://juimprimepramim.com.br', MAIL_TRANSPORT: 'console'}).transport, 'resend', 'console e-mail never in production');
  assert.equal(config({APP_ENV: 'production', SITE_URL: 'https://juimprimepramim.com.br/'}).siteUrl, 'https://juimprimepramim.com.br');

  // In production the site is indexable again.
  const live = createServer({env: {APP_ENV: 'production'}});
  await new Promise(resolve => live.listen(0, '127.0.0.1', resolve));
  const liveHome = await new Promise((resolve, reject) => http.get(`http://127.0.0.1:${live.address().port}/`, resolve).on('error', reject));
  liveHome.resume();
  assert.equal(liveHome.headers['x-robots-tag'], undefined, 'production pages can be indexed');
  live.close();
} finally {
  server.close();
}

// Compression never blocks the event loop: no *Sync zlib call per request, concurrent requests for the same file share
// one async job, the result is cached, and the body decompresses back to the exact file.
{
  const zlib = require('node:zlib');
  const fs = await import('node:fs');
  const {fileURLToPath} = await import('node:url');
  const original = {brotliCompress: zlib.brotliCompress, gzip: zlib.gzip, brotliCompressSync: zlib.brotliCompressSync, gzipSync: zlib.gzipSync};
  const calls = {br: 0, gzip: 0, sync: 0};
  zlib.brotliCompress = (...args) => { calls.br++; return original.brotliCompress(...args); };
  zlib.gzip = (...args) => { calls.gzip++; return original.gzip(...args); };
  zlib.brotliCompressSync = zlib.gzipSync = () => { calls.sync++; throw new Error('sync compression blocks the event loop'); };
  const fresh = createServer({log: {error: (...args) => errors.push(args.join(' '))}});
  await new Promise(resolve => fresh.listen(0, '127.0.0.1', resolve));
  const get = (path, encoding) => new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${fresh.address().port}${path}`, {headers: {'accept-encoding': encoding}}, res => { const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks)})); }).on('error', reject);
  });
  try {
    const glb = '/assets/models/dinossauroscopio.glb';
    const glbFile = fs.readFileSync(fileURLToPath(new URL(`../dist${glb}`, import.meta.url)));
    const replies = await Promise.all(Array.from({length: 5}, () => get(glb, 'br')));
    for (const reply of replies) {
      assert.equal(reply.status, 200);
      assert.equal(reply.headers['content-encoding'], 'br');
      assert.equal(Number(reply.headers['content-length']), reply.body.length);
      assert(zlib.brotliDecompressSync(reply.body).equals(glbFile), 'brotli body decompresses to the file');
    }
    assert.equal(calls.br, 1, 'concurrent requests share one compression job');
    assert.equal((await get(glb, 'br')).headers['content-encoding'], 'br');
    assert.equal(calls.br, 1, 'later requests come from the cache');
    const gz = await get('/vendor/three.module.min.js', 'gzip');
    assert.equal(gz.headers['content-encoding'], 'gzip');
    assert(zlib.gunzipSync(gz.body).equals(fs.readFileSync(fileURLToPath(new URL('../dist/vendor/three.module.min.js', import.meta.url)))), 'gzip body decompresses to the file');
    assert.equal(calls.gzip, 1);
    assert.equal(calls.sync, 0, 'no synchronous compression');
    assert.deepEqual(errors, [], 'no server errors logged');
  } finally {
    Object.assign(zlib, original);
    fresh.close();
  }
}

// Like the Hostinger runner: the entry file is loaded with require(), not executed. It must still start listening
// (a `require.main === module` guard made the first upload answer 503 for every request).
{
  const {spawn} = await import('node:child_process');
  const {fileURLToPath} = await import('node:url');
  const probe = http.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const entry = fileURLToPath(new URL('../server.cjs', import.meta.url));
  const child = spawn(process.execPath, ['-e', `require(${JSON.stringify(entry)})`], {env: {...process.env, PORT: String(port), APP_ENV: 'preview', SITE_URL: `http://127.0.0.1:${port}`}, stdio: ['ignore', 'pipe', 'pipe']});
  let output = '';
  child.stdout.on('data', d => { output += d; });
  child.stderr.on('data', d => { output += d; });
  try {
    let health = null;
    for (let i = 0; i < 50 && !health; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      health = await fetch(`http://127.0.0.1:${port}/api/health`).then(r => r.status === 200 ? r.json() : null, () => null);
    }
    assert(health?.ok, `server.cjs listens when loaded with require() (output: ${output.trim()})`);
    assert.match(output, new RegExp(`no ar em ${port} · modo teste`), 'start message names the port and mode');
  } finally {
    child.kill();
  }
}

console.log('PASS: server.cjs starts when loaded with require() (like the Hostinger runner) and serves pages, assets (cache, ETag/304, async cached br/gzip, HEAD) and /api routes with the vercel.json headers, and blocks traversal, dot-files and api/_lib.');
