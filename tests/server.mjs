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
const raw = (path, {method = 'GET', headers = {}, at = base} = {}) => new Promise((resolve, reject) => {
  const req = http.request(at + '/', {method, path, headers}, res => { const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks)})); });
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
  // Short links: /fenda (printed on the flyer) is fenda.html; only names without an extension, never a folder path nor the 404 page.
  const short = await raw('/fenda', {headers: {'accept-encoding': 'identity'}});
  assert.equal(short.status, 200);
  assert.match(short.headers['content-type'], /^text\/html/);
  assert.match(short.body.toString(), /<section class="nv-stage"/);
  for (const path of ['/fenda/', '/fenda.htm', '/404']) assert.equal((await raw(path)).status, 404, path);
  // A page typed with capitals moves to the lowercase page, query kept (08/10/2026: ADMIN.HTML gave 404 on the server);
  // a vendor file with capitals in its name is served as it is, and a page that does not exist still gets the 404.
  for (const [path, to] of [['/ADMIN.HTML', '/admin.html'], ['/Produtos.html?x=1', '/produtos.html?x=1']]) {
    const moved = await raw(path);
    assert.equal(moved.status, 301, `capitals: ${path}`); assert.equal(moved.headers.location, to); assert.equal(moved.body.length, 0);
  }
  assert.equal((await raw('/vendor/OrbitControls.js')).status, 200, 'vendor file with capitals');
  assert.equal((await raw('/NAO-EXISTE.HTML')).status, 404, 'a missing page in capitals is still a 404');

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
  // With ?v= the address changes with the file: a year, never revalidated (2026-10-07). Pages never.
  for (const path of ['/assets/logo-ju.webp?v=2', '/carousel.js?v=abc123', '/theme.css?x=1&v=9'])
    assert.equal((await raw(path)).headers['cache-control'], 'public, max-age=31536000, immutable', `versioned: ${path}`);
  assert.equal((await raw('/index.html?v=2')).headers['cache-control'], 'public, max-age=0, must-revalidate', 'a page with ?v= still revalidates');
  assert.equal((await raw('/carousel.js?view=1')).headers['cache-control'], 'public, max-age=0, must-revalidate', 'only a real v= parameter');
  assert.equal((await raw('/nao-existe.js?v=1')).headers['cache-control'], 'no-store', 'a missing file is never cached');
  // A big file (a 3D model, three.js) is never compressed while a request waits (2026-10-08): the first answer goes out as it
  // is, the compression runs in the background, and the next answers are compressed. A small file is compressed at once.
  const settled = async (path, headers, encoding) => {
    for (let i = 0; i < 200; i++) { const res = await raw(path, {headers}); if (res.headers['content-encoding'] === encoding) return res; await new Promise(r => setTimeout(r, 50)); }
    throw new Error(`${path}: never ${encoding}`);
  };
  const modelPath = '/assets/models/dinossauroscopio.glb?v=meshopt1';
  const first = await raw(modelPath, {headers: {'accept-encoding': 'br, gzip'}});
  assert.equal(first.status, 200);
  assert.equal(first.headers['content-type'], 'model/gltf-binary');
  assert.ok(first.headers['content-encoding'] === undefined || first.headers['content-encoding'] === 'br');
  assert.equal(Number(first.headers['content-length']), first.body.length);
  const model = await settled(modelPath, {'accept-encoding': 'br, gzip'}, 'br');
  assert.equal(Number(model.headers['content-length']), model.body.length);
  assert.ok(model.body.length < first.body.length || first.headers['content-encoding'] === 'br');
  const three = await settled('/vendor/three.module.min.js', {'accept-encoding': 'gzip'}, 'gzip');
  assert.match(three.headers['content-type'], /^text\/javascript/);
  assert.equal(three.headers.vary, 'Accept-Encoding');
  const small = await raw('/carousel.js', {headers: {'accept-encoding': 'br'}});
  assert.equal(small.headers['content-encoding'], 'br', 'a small file compressed on the first answer');
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
  // A missing page gets the site's 404 page (links back to the showcase, never cached, out of search results); a missing
  // file keeps the short text answer.
  for (const path of ['/nao-existe.html', '/pagina-antiga', '/loja/peca/', '/A/B.htm']) {
    const res = await raw(path);
    assert.equal(res.status, 404, path);
    assert.match(res.headers['content-type'], /^text\/html/, `${path}: an HTML page`);
    assert.equal(res.headers['cache-control'], 'no-store');
    const html = res.body.toString().replace(/\r\n/g, '\n');   // a Windows checkout has CRLF in dist/ (core.autocrlf)
    assert.match(html, /<h1 id="not-found-title">Ops! Essa página sumiu no meio das impressões 3D\.<\/h1>/, path);
    assert.match(html, /<a class="primary" href="index\.html">Ir para a vitrine/); assert.match(html, /<a class="not-found-secondary" href="produtos\.html">Ver a coleção de produtos<\/a>/);
    assert.match(html, /<base href="\/">\n  <meta name="robots" content="noindex">\n  <script src="journey\.js"><\/script>/, 'every link resolves from the site root, before the first script');
  }
  for (const path of ['/nao-existe.js', '/assets/nao-existe.webp']) {
    const res = await raw(path);
    assert.equal(res.status, 404, path);
    assert.equal(res.body.toString(), 'Página não encontrada.', `${path}: a missing file is not a page`);
  }
  assert.equal((await raw('/nao-existe', {method: 'HEAD'})).body.length, 0, 'HEAD: no body');
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

  // Search engines (2026-10-07): decided by the address asked for, not by APP_ENV. The shop's domain (and www) can be
  // indexed even while the server still runs as preview; the temporary domain, localhost and bare IPs never.
  const robots = async (headers, target = raw) => (await target('/', {headers})).headers['x-robots-tag'];
  for (const host of ['juimprimepramim.com.br', 'www.juimprimepramim.com.br', 'JuImprimePraMim.com.br.:443']) assert.equal(await robots({host}), undefined, `indexable: ${host}`);
  assert.equal(await robots({host: 'wheat-llama-936569.hostingersite.com', 'x-forwarded-host': 'juimprimepramim.com.br, outro.com'}), undefined, 'the first X-Forwarded-Host wins (a CDN in front rewrites Host)');
  for (const host of ['wheat-llama-936569.hostingersite.com', '201.77.147.3', 'localhost:3000', '[::1]:3000', 'juimprimepramim.com.br.evil.com', 'outro-site.com.br'])
    assert.equal(await robots({host}), 'noindex, nofollow', `stays out of search results: ${host}`);
  assert.equal(await robots({host: 'wheat-llama-936569.hostingersite.com', 'x-forwarded-host': 'wheat-llama-936569.hostingersite.com'}), 'noindex, nofollow');
  const healthBy = async host => JSON.parse((await raw('/api/health', {headers: {host}})).body).indexable;
  assert.equal(await healthBy('juimprimepramim.com.br'), true, '/api/health says the domain can be indexed');
  assert.equal(await healthBy('wheat-llama-936569.hostingersite.com'), false);
  assert.equal(await healthBy('127.0.0.1'), false);

  const runtime = require('../api/_lib/runtime.js');
  assert.equal(runtime.normalizeHost('WWW.Site.com.br.:8080'), 'www.site.com.br');
  assert.equal(runtime.normalizeHost('[2804:2b44::80]:443'), '2804:2b44::80');
  assert.equal(runtime.canonicalHost({SITE_URL: 'https://juimprimepramim.com.br/'}), 'juimprimepramim.com.br');
  assert.equal(runtime.canonicalHost({SITE_URL: 'https://www.juimprimepramim.com.br'}), 'www.juimprimepramim.com.br');
  for (const SITE_URL of ['https://wheat-llama-936569.hostingersite.com', 'http://10.0.100.80', 'http://201.77.147.3', 'http://localhost:3000', '', 'nada'])
    assert.equal(runtime.canonicalHost({SITE_URL}), 'juimprimepramim.com.br', `a test or machine address in SITE_URL falls back to COMPANY.website: ${SITE_URL || '(vazio)'}`);
  assert.deepEqual([...runtime.indexableHosts({SITE_URL: 'https://www.juimprimepramim.com.br'})], ['www.juimprimepramim.com.br', 'juimprimepramim.com.br'], 'www and apex both ways');
  assert.deepEqual([...runtime.indexableHosts({INDEX_HOSTS: 'Loja.Outra.com, outra.com.br'})], ['juimprimepramim.com.br', 'www.juimprimepramim.com.br', 'loja.outra.com', 'outra.com.br'], 'INDEX_HOSTS adds more');
  assert.equal(runtime.requestHost({headers: {host: 'a.com', 'x-forwarded-host': ' B.com , c.com'}}), 'b.com');
  assert.equal(runtime.indexable({}, ''), false);

  // Production with the domain in SITE_URL: the same rule.
  const live = createServer({env: {APP_ENV: 'production', SITE_URL: 'https://juimprimepramim.com.br'}});
  await new Promise(resolve => live.listen(0, '127.0.0.1', resolve));
  const liveGet = (path, {headers = {}} = {}) => new Promise((resolve, reject) => http.get({host: '127.0.0.1', port: live.address().port, path, headers}, res => { res.resume(); resolve({headers: res.headers}); }).on('error', reject));
  assert.equal(await robots({host: 'juimprimepramim.com.br'}, liveGet), undefined, 'production pages on the domain can be indexed');
  assert.equal(await robots({host: 'www.juimprimepramim.com.br'}, liveGet), undefined, 'and on www (its 301 to the apex carries no noindex)');
  assert.equal(await robots({host: 'wheat-llama-936569.hostingersite.com'}, liveGet), 'noindex, nofollow', 'the temporary domain stays out after launch too');
  assert.equal(await robots({}, liveGet), 'noindex, nofollow', 'and a bare IP');

  // www → the domain without www, in the Node server itself (2026-10-08): one session cookie, one cart and one origin for the
  // forms. Same path and query, the same security headers, no body; GET/HEAD 301, any other method 308 (keeps the body).
  const at = `http://127.0.0.1:${live.address().port}`, www = {host: 'www.juimprimepramim.com.br'};
  const page = await raw('/produtos.html?cor=rosa&utm_source=insta', {headers: www, at});
  assert.equal(page.status, 301);
  assert.equal(page.headers.location, 'https://juimprimepramim.com.br/produtos.html?cor=rosa&utm_source=insta', 'path and query string intact');
  assert.equal(page.body.length, 0, 'no body');
  assert.match(page.headers['content-security-policy'] || '', /default-src 'self'/, 'the redirect carries the vercel.json headers');
  assert.equal(page.headers['x-frame-options'], 'SAMEORIGIN'); assert.match(page.headers['strict-transport-security'] || '', /max-age=/);
  for (const path of ['/produtos.html', '/assets/logo-ju.webp?v=2'])
    assert.equal((await raw(path, {headers: www, at})).headers['cache-control'], 'private, max-age=86400', `${path}: kept by the browser, never by a shared cache`);
  const headWww = await raw('/', {method: 'HEAD', headers: www, at});
  assert.equal(headWww.status, 301); assert.equal(headWww.headers.location, 'https://juimprimepramim.com.br/'); assert.equal(headWww.body.length, 0);
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const moved = await raw('/api/auth/start?lang=en', {method, headers: {...www, 'content-type': 'application/json'}, at});
    assert.equal(moved.status, 308, `${method}: 308 keeps the method and the body`);
    assert.equal(moved.headers.location, 'https://juimprimepramim.com.br/api/auth/start?lang=en');
  }
  assert.equal((await raw('/api/health', {headers: www, at})).headers.location, 'https://juimprimepramim.com.br/api/health');
  // Calls from other servers are the exception: the Mercado Pago webhook and the scheduled task reach their handler on www
  // and answer as on the domain (a 308 would never be followed: no 200 for Mercado Pago, no Authorization for the cron).
  for (const path of ['/api/payments/webhook?data.id=ORD01ABCDEFGH&type=order', '/api/fila/rodar', '/api/fila/rodar/']) {
    const [onWww, onDomain] = await Promise.all([www, {host: 'juimprimepramim.com.br'}].map(headers => raw(path, {method: 'POST', headers: {...headers, 'content-type': 'application/json'}, at})));
    assert.equal(onWww.headers.location, undefined, `${path}: not moved`);
    assert.deepEqual([onWww.status, onWww.body.toString()], [onDomain.status, onDomain.body.toString()], `${path}: the handler answers on www as on the domain`);
  }
  assert.equal((await raw('/api/payments/status?ref=x', {headers: www, at})).status, 301, 'the other payment routes still move');
  for (const headers of [{host: 'WWW.JuImprimePraMim.com.br.:443'}, {host: '127.0.0.1', 'x-forwarded-host': 'www.juimprimepramim.com.br, outro.com'}])
    assert.equal((await raw('/conta.html?x=1', {headers, at})).headers.location, 'https://juimprimepramim.com.br/conta.html?x=1', `moved: ${JSON.stringify(headers)}`);
  for (const host of ['juimprimepramim.com.br', '127.0.0.1', `127.0.0.1:${live.address().port}`, 'localhost:3000', 'wheat-llama-936569.hostingersite.com', 'www.juimprimepramim.com.br.evil.com', 'www.outro-site.com.br']) {
    const stays = await raw('/?x=1', {headers: {host}, at});
    assert.equal(stays.status, 200, `not moved: ${host}`); assert.equal(stays.headers.location, undefined);
  }
  assert.equal((await raw('/api/health', {headers: {host: '127.0.0.1:3000'}, at})).status, 200, "the deploy's health check (127.0.0.1) is never moved");
  assert.equal((await raw('/', {method: 'POST', headers: {host: 'juimprimepramim.com.br'}, at})).status, 405, 'the domain itself answers as before');
  live.close();
  // The default server (no SITE_URL, as in development or on the test site) sends only the shop's www there; its own
  // address stays. A domain that is itself www never moves.
  assert.equal((await raw('/', {headers: www})).headers.location, 'https://juimprimepramim.com.br/');
  for (const host of ['localhost:3000', '127.0.0.1', 'wheat-llama-936569.hostingersite.com']) assert.equal((await raw('/', {headers: {host}})).status, 200, `not moved: ${host}`);
  const wwwSite = createServer({env: {APP_ENV: 'production', SITE_URL: 'https://www.juimprimepramim.com.br'}});
  await new Promise(resolve => wwwSite.listen(0, '127.0.0.1', resolve));
  for (const host of ['www.juimprimepramim.com.br', 'juimprimepramim.com.br'])
    assert.equal((await raw('/', {headers: {host}, at: `http://127.0.0.1:${wwwSite.address().port}`})).status, 200, `SITE_URL with www: ${host} is not moved`);
  wwwSite.close();
} finally {
  server.close();
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

console.log('PASS: server.cjs starts when loaded with require() (like the Hostinger runner) and serves pages, assets (cache, ETag/304, br/gzip, HEAD) and /api routes with the vercel.json headers, keeps every address but the shop\'s domain out of search results, moves www to the domain without www (301/308), and blocks traversal, dot-files and api/_lib.');
