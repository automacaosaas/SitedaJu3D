'use strict';
// Production server for hosts that run a Node process (Hostinger "Node.js web app"). Serves dist/ as the site and the
// functions in api/ at the same /api/... paths Vercel uses, with the headers from vercel.json (one source for both hosts).
// The entry file is ../server.cjs, which only calls start(). Tests use createServer() directly.
// Settings come from environment variables set in the host panel: APP_ENV, SITE_URL, RESEND_API_KEY… See HOSTINGER-SETUP.md.
// No dependencies: only Node built-ins, so the host installs nothing.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const {isProduction, canonicalHost, indexableHosts, requestHost} = require('../api/_lib/runtime');
const {minifyCss} = require('./minify-css.cjs');

const PROJECT = path.join(__dirname, '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary'
};
// Text compresses well; Meshopt-compressed models still shrink by about a fifth.
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.txt', '.xml', '.svg', '.glb']);
const DEFAULT_CACHE = 'public, max-age=0, must-revalidate';   // same as Vercel: always revalidate, cheap 304 with the ETag
const IMMUTABLE = 'public, max-age=31536000, immutable';
const VERSIONED = /[?&]v=[^&]/;
const COMPRESSED_CACHE_LIMIT = 64 * 1024 * 1024;
// Compression (2026-10-08, PageSpeed): every file is compressed once per version (mtime) and kept. The best compression
// (Brotli 11, gzip 9) runs in the background on zlib's thread pool, never on the event loop: at start for the whole site
// (precompress, one file at a time) and, for a file asked for before that, right after the first answer. Until then a small
// file is compressed on the spot at the old quality (6, a few milliseconds); a big one (three.js, the 3D models) goes out
// uncompressed that once instead of holding every other request.
const SYNC_LIMIT = 256 * 1024;
const QUICK = 6;
const best = ext => ext === '.glb' ? 6 : 11;   // Meshopt models gain almost nothing above 6, at many times the time
// Headers only a document acts on (2026-10-08, PageSpeed): the Content-Security-Policy, X-Frame-Options and
// Permissions-Policy belong to the page (and to a worker, which the site does not have), never to the scripts,
// stylesheets, images, fonts and models it loads, where the browser ignores them; on each of those they were ~1.1 KB of
// headers for nothing. Pages, the 404 page, the SVG (a document when opened on its own), XML and every /api answer
// keep them. nosniff, HSTS and Referrer-Policy stay everywhere: nosniff is checked on the scripts and stylesheets
// themselves, HSTS is read from any HTTPS answer, and a module's or stylesheet's own Referrer-Policy rules what it imports.
const DOCUMENT_ONLY = new Set(['content-security-policy', 'x-frame-options', 'permissions-policy']);
const SUBRESOURCE = /\.(?:m?js|css|webp|png|jpe?g|ico|woff2|glb)$/i;

// vercel.json `headers` → [{pattern, headers}]. Sources are plain "/prefix/(.*)" patterns (checked by tests/headers.mjs),
// which are also valid regular expressions.
function readHeaderRules(file = path.join(PROJECT, 'vercel.json')) {
  if (!fs.existsSync(file)) return [];
  return (JSON.parse(fs.readFileSync(file, 'utf8')).headers || []).map(rule => ({pattern: new RegExp(`^${rule.source}$`), headers: rule.headers}));
}

function createServer({root = path.join(PROJECT, 'dist'), apiDir = path.join(PROJECT, 'api'), rules = readHeaderRules(), env = process.env, log = console} = {}) {
  root = path.resolve(root);
  // Search results only for the shop's own domain and its www/apex sibling (api/_lib/runtime.js), decided per request by
  // the address asked for, not by APP_ENV: the temporary Hostinger domain, localhost and bare IPs stay out.
  const searchHosts = indexableHosts(env);
  // www → the shop's domain without www (2026-10-08), here and not only in nginx: one address means one session cookie, one
  // cart and the one origin the forms accept (api/_lib/http.js). Only that exact www name moves; 127.0.0.1/localhost (the
  // deploy's health checks), the temporary Hostinger domain and the dev server never match it.
  const mainHost = canonicalHost(env), wwwHost = mainHost && !mainHost.startsWith('www.') ? `www.${mainHost}` : '';
  // Calls from other servers keep answering on www, as before: no cookie, cart or form origin is involved, and they would
  // not follow the move (the Mercado Pago webhook wants its 200 and retries otherwise; curl and fetch drop Authorization
  // when a redirect changes host, so the scheduled /api/fila/rodar would arrive without its secret).
  const serverToServer = /^\/api\/(?:payments\/webhook|fila\/rodar)\/?$/;
  const handlers = new Map();
  const compressed = new Map();
  let compressedBytes = 0;

  // /api/auth/start → api/auth/start.js. Lowercase segments only, so "_lib" helpers and "..": never routes.
  function apiHandler(pathname) {
    const match = /^\/api\/([a-z0-9-]+(?:\/[a-z0-9-]+)*)\/?$/.exec(pathname);
    if (!match) return null;
    if (!handlers.has(match[1])) {
      const file = path.join(apiDir, ...match[1].split('/')) + '.js';
      const loaded = fs.existsSync(file) ? require(file) : null;
      handlers.set(match[1], typeof loaded === 'function' ? loaded : null);
    }
    return handlers.get(match[1]);
  }

  // A file inside dist/, or null. Dot-files and anything outside the folder are never served.
  function resolveFile(pathname) {
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { return null; }
    if (decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').some(part => part.startsWith('.'))) return null;
    let file = path.resolve(root, '.' + decoded);
    if (file !== root && !file.startsWith(root + path.sep)) return null;
    let stat;
    // Short links without ".html" (the flyer prints juimprimepramim.com.br/fenda): a name with no extension that is not a file
    // or folder is looked up as the page of that name. The page's relative links still work: /fenda sits at the site root.
    try { stat = fs.statSync(file); } catch {
      if (path.extname(file) || decoded.endsWith('/') || path.basename(file) === '404') return null;
      file += '.html';
      try { stat = fs.statSync(file); } catch { return null; }
    }
    if (stat.isDirectory()) {
      file = path.join(file, 'index.html');
      try { stat = fs.statSync(file); } catch { return null; }
    }
    return stat.isFile() ? {file, stat} : null;
  }

  // What a file is served with: a stylesheet minified (server/minify-css.cjs, once per version), anything else as on disk.
  const minified = new Map();
  function contents(file, stat, ext) {
    if (ext !== '.css') return fs.readFileSync(file);
    const key = `${file}|${stat.mtimeMs}`;
    if (!minified.has(key)) minified.set(key, Buffer.from(minifyCss(fs.readFileSync(file, 'utf8'))));
    return minified.get(key);
  }
  // The ETag comes from what is served (2026-10-08, PageSpeed): a hash of the file (of the minified text, for a stylesheet),
  // worked out once per version (mtime and size) and kept. A deploy gives every file the commit's time (git archive), so a
  // validator made of size and date changed even when nothing did and returning visitors downloaded everything again; this
  // one changes only with the content. Weak, and the same for the br, gzip and plain answers of a file (Vary:
  // Accept-Encoding tells them apart): they carry the same text, not the same bytes. A stylesheet keeps "-m" (minified).
  const validators = new Map();
  function validator(file, stat, ext) {
    const version = `${stat.mtimeMs}|${stat.size}`, known = validators.get(file);
    if (known?.version === version) return known.etag;
    const etag = `W/"${crypto.createHash('sha256').update(contents(file, stat, ext)).digest('base64url').slice(0, 16)}${ext === '.css' ? '-m' : ''}"`;
    validators.set(file, {version, etag});
    return etag;
  }
  const zipOptions = (encoding, raw, quality, ext) => encoding === 'br'
    ? {params: {[zlib.constants.BROTLI_PARAM_QUALITY]: quality, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length, [zlib.constants.BROTLI_PARAM_MODE]: ext === '.glb' ? zlib.constants.BROTLI_MODE_GENERIC : zlib.constants.BROTLI_MODE_TEXT}}
    : {level: quality >= 9 ? 9 : quality};
  const finest = new Set(), pending = new Map();
  function remember(key, body, isBest) {
    const old = compressed.get(key);
    if (compressedBytes - (old?.length || 0) + body.length > COMPRESSED_CACHE_LIMIT) return;
    compressed.set(key, body); compressedBytes += body.length - (old?.length || 0);
    if (isBest) finest.add(key);
  }
  // The best compression of one file version, in the background; a promise that settles when it is cached (never rejects).
  function compressLater(file, stat, ext, encoding) {
    const key = `${file}|${stat.mtimeMs}|${encoding}`;
    if (finest.has(key)) return Promise.resolve();
    if (pending.has(key)) return pending.get(key);
    const job = new Promise(resolve => {
      let raw;
      try { raw = contents(file, stat, ext); } catch { pending.delete(key); return resolve(); }
      const quality = encoding === 'br' ? best(ext) : 9;
      (encoding === 'br' ? zlib.brotliCompress : zlib.gzip)(raw, zipOptions(encoding, raw, quality, ext), (error, body) => {
        pending.delete(key);
        if (!error) remember(key, body, true);
        resolve();
      });
    });
    pending.set(key, job);
    return job;
  }
  // The compressed body to answer with now, or null (a big file whose compression is still running: it goes out as it is).
  function encoded(file, stat, ext, encoding) {
    const key = `${file}|${stat.mtimeMs}|${encoding}`;
    let body = compressed.get(key) || null;
    if (!body && stat.size <= SYNC_LIMIT) {
      const raw = contents(file, stat, ext);
      body = encoding === 'br' ? zlib.brotliCompressSync(raw, zipOptions('br', raw, QUICK, ext)) : zlib.gzipSync(raw, zipOptions('gzip', raw, QUICK, ext));
      remember(key, body, false);
    }
    compressLater(file, stat, ext, encoding);
    return body;
  }
  // The whole site compressed with Brotli in the background, one file at a time (start() calls it once; the tests may too).
  async function precompress() {
    const files = [];
    const walk = dir => { for (const entry of fs.readdirSync(dir, {withFileTypes: true})) { if (entry.name.startsWith('.')) continue; const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (COMPRESSIBLE.has(path.extname(entry.name).toLowerCase())) files.push(full); } };
    walk(root);
    // text first (what every page needs), the 3D models last
    files.sort((a, b) => (a.endsWith('.glb') - b.endsWith('.glb')) || a.localeCompare(b));
    for (const file of files) {
      let stat;
      try { stat = fs.statSync(file); } catch { continue; }
      const ext = path.extname(file).toLowerCase();
      try { validator(file, stat, ext); } catch { continue; }   // the ETag ready before the first visit
      if (stat.size > 1024) await compressLater(file, stat, ext, 'br');
    }
    return files.length;
  }

  function serveStatic(req, res, pathname, search = '') {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.setHeader('Allow', 'GET, HEAD'); return res.end(); }
    // A page address typed with capitals (ADMIN.HTML, Produtos.html, 08/10/2026): every page is lowercase on disk, and the
    // Linux server would answer 404, so it moves to the lowercase address when that page exists. Only page addresses (some
    // vendor files have capitals in their names).
    const lower = pathname.toLowerCase();
    if (lower !== pathname && /(^|\/)[^./]*$|\.html?$/i.test(pathname) && resolveFile(lower)) {
      res.statusCode = 301; res.setHeader('Location', lower + search); res.setHeader('Cache-Control', 'private, max-age=86400');
      return res.end();
    }
    const found = resolveFile(pathname);
    if (!found) {
      // A page address that does not exist gets the site's own 404 page (404.html, with links back to the showcase); a
      // missing file (a script, an image) keeps the short text answer.
      res.statusCode = 404;
      res.setHeader('Cache-Control', 'no-store');
      const page = /(^|\/)[^./]*$|\.html?$/i.test(pathname) && resolveFile('/404.html');
      if (page) {
        res.setHeader('Content-Type', TYPES['.html']);
        return res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(page.file));
      }
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.end(req.method === 'HEAD' ? undefined : 'Página não encontrada.');
    }
    const {file, stat} = found, ext = path.extname(file).toLowerCase();
    const etag = validator(file, stat, ext), modified = Math.floor(stat.mtimeMs / 1000) * 1000;
    res.setHeader('ETag', etag);
    // A file asked for with ?v= (the fonts, the 3D models, the gallery views…) changes address whenever it changes: a year
    // in the cache, never revalidated. Pages and the same files without ?v= keep the rules above.
    if (ext !== '.html' && VERSIONED.test(search)) res.setHeader('Cache-Control', IMMUTABLE);
    if (!res.hasHeader('Cache-Control')) res.setHeader('Cache-Control', DEFAULT_CACHE);
    if (COMPRESSIBLE.has(ext)) res.setHeader('Vary', 'Accept-Encoding');   // also on a 304 (RFC 9110 §15.4.5)
    // RFC 9110 §13.2.2: If-None-Match first (weak comparison, "*" too); If-Modified-Since only without it. A browser sends
    // both, and after a deploy only the ETag still matches (the date is the new commit's), so the ETag decides. The date
    // alone counts only when it is the file's own (as nginx's "if_modified_since exact"): a rollback (deploy.sh --rollback)
    // puts back files with an older date, and "not modified since" a later one would keep the newer file in that cache.
    const ifNoneMatch = req.headers['if-none-match'];
    const fresh = ifNoneMatch !== undefined
      ? ifNoneMatch.trim() === '*' || ifNoneMatch.split(',').some(tag => tag.trim().replace(/^W\//, '') === etag.slice(2))
      : modified === Date.parse(req.headers['if-modified-since'] || '');
    if (fresh) { res.statusCode = 304; return res.end(); }   // no Content-Type or Last-Modified: the cache keeps its own
    res.setHeader('Content-Type', TYPES[ext] || 'application/octet-stream');
    res.setHeader('Last-Modified', stat.mtime.toUTCString());

    const accepts = String(req.headers['accept-encoding'] || '');
    const encoding = COMPRESSIBLE.has(ext) && stat.size > 1024 ? (/\bbr\b/.test(accepts) ? 'br' : /\bgzip\b/.test(accepts) ? 'gzip' : null) : null;
    const body = encoding ? encoded(file, stat, ext, encoding) : null;
    if (body) {
      res.setHeader('Content-Encoding', encoding);
      res.setHeader('Content-Length', body.length);
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    if (ext === '.css') {
      const css = contents(file, stat, ext);
      res.setHeader('Content-Length', css.length);
      return res.end(req.method === 'HEAD' ? undefined : css);
    }
    res.setHeader('Content-Length', stat.size);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    let pathname, search;
    try { ({pathname, search} = new URL(req.url, 'http://localhost')); } catch { res.statusCode = 400; return res.end(); }
    const subresource = SUBRESOURCE.test(pathname);
    for (const rule of rules) if (rule.pattern.test(pathname)) for (const {key, value} of rule.headers) if (!subresource || !DOCUMENT_ONLY.has(key.toLowerCase())) res.setHeader(key, value);
    if (!searchHosts.has(requestHost(req))) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    // Same path and query on the domain, with the headers above: 301 for GET/HEAD, 308 (method and body kept) for the rest.
    // Kept by the browser only: a CDN in front must not hand it to other hosts (X-Forwarded-Host can be forged).
    if (wwwHost && requestHost(req) === wwwHost && !serverToServer.test(pathname)) {
      res.statusCode = req.method === 'GET' || req.method === 'HEAD' ? 301 : 308;
      res.setHeader('Location', `https://${mainHost}${req.url.startsWith('/') ? req.url : pathname + search}`);   // "*" or a full URL: the parsed path
      res.setHeader('Cache-Control', 'private, max-age=86400');
      return res.end();
    }
    try {
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        const handler = apiHandler(pathname);
        if (!handler) { res.statusCode = 404; res.setHeader('Content-Type', 'application/json; charset=utf-8'); return res.end('{"error":"not_found"}'); }
        return await handler(req, res);
      }
      return serveStatic(req, res, pathname, search);
    } catch (error) {
      log.error(`${req.method} ${pathname}:`, error);
      if (!res.headersSent) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end('{"error":"internal_error"}'); }
      else res.destroy();
    }
  });
  server.precompress = precompress;
  return server;
}

// Starts listening once, however the file was loaded. Hosting runners load the entry file with require() (so
// `require.main === module` is false there) and may pass PORT as a number or as a socket path. Hostinger expects 3000.
// HOST limits a numeric port to one address: on the shop's own server (SERVIDOR-SETUP.md) HOST=127.0.0.1, so only nginx
// on the same machine reaches the app. Without it, every address, as before.
let running = null;
function start({env = process.env, log = console} = {}) {
  if (running) return running;
  const port = /^\d+$/.test(String(env.PORT || '')) ? Number(env.PORT) : env.PORT || 3000;
  if (!env.SITE_URL) log.warn('Aviso: SITE_URL não está definida. Sem ela, formulários de conta e pagamento recusam os pedidos (proteção de origem). Veja HOSTINGER-SETUP.md.');
  running = createServer({env, log});
  // Database migrations run before the first request. A failure is logged and the site still starts (pages keep
  // working; /api/health reports the database state), so a database problem never takes the shop offline.
  const pool = require('../api/_lib/db').getPool(env);
  const ready = pool ? require('../api/_lib/migrate').migrate(pool, {log}).catch(error => log.error('db: migração falhou —', error.code || '', error.message)) : Promise.resolve();
  const host = typeof port === 'number' && env.HOST ? String(env.HOST) : undefined;
  ready.then(() => running.listen(...(host ? [port, host] : [port]), () => log.log(`Ju imprime pra mim no ar em ${port} · modo ${isProduction(env) ? 'produção' : 'teste'} · contas: ${pool ? 'MySQL' : isProduction(env) ? 'desligadas (sem banco)' : 'memória (teste)'} · ${env.SITE_URL || 'sem SITE_URL'}`)));
  // Brotli 11 for the whole site, in the background once the server answers (requests never wait for it).
  ready.then(() => running.precompress()).catch(error => log.error('compressão prévia: parou —', error.message));
  // The NF-e queue (api/_lib/invoice-queue.js): a round a minute in the background, once the tables exist. Off when
  // NF-e issuing is off; a failure to start never stops the site.
  let stopQueue = () => {};
  ready.then(() => { try { stopQueue = require('../api/_lib/invoice-queue').startWorker({env, log}); } catch (error) { log.error('fila de notas: não ligou —', error.message); } });
  // The Correios tracking (api/_lib/tracking.js): a round every 10 minutes, each package looked up every 2 hours.
  ready.then(() => { try { require('../api/_lib/tracking').startTrackingWorker({env, log}); } catch (error) { log.error('rastreio dos Correios: não ligou —', error.message); } });
  const stop = () => { stopQueue(); running.close(() => process.exit(0)); };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  return running;
}

module.exports = {createServer, readHeaderRules, start};
