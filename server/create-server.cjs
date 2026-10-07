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
const {isProduction} = require('../api/_lib/runtime');

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
const COMPRESSED_CACHE_LIMIT = 64 * 1024 * 1024;

// vercel.json `headers` → [{pattern, headers}]. Sources are plain "/prefix/(.*)" patterns (checked by tests/headers.mjs),
// which are also valid regular expressions.
function readHeaderRules(file = path.join(PROJECT, 'vercel.json')) {
  if (!fs.existsSync(file)) return [];
  return (JSON.parse(fs.readFileSync(file, 'utf8')).headers || []).map(rule => ({pattern: new RegExp(`^${rule.source}$`), headers: rule.headers}));
}

function createServer({root = path.join(PROJECT, 'dist'), apiDir = path.join(PROJECT, 'api'), rules = readHeaderRules(), env = process.env, log = console} = {}) {
  root = path.resolve(root);
  // Test deployments live at public addresses; keep them out of search results until APP_ENV=production.
  const hideFromSearch = !isProduction(env);
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
    try { stat = fs.statSync(file); } catch { return null; }
    if (stat.isDirectory()) {
      file = path.join(file, 'index.html');
      try { stat = fs.statSync(file); } catch { return null; }
    }
    return stat.isFile() ? {file, stat} : null;
  }

  function compress(file, stat, encoding) {
    const key = `${file}|${stat.mtimeMs}|${encoding}`;
    if (compressed.has(key)) return compressed.get(key);
    const raw = fs.readFileSync(file);
    const body = encoding === 'br'
      ? zlib.brotliCompressSync(raw, {params: {[zlib.constants.BROTLI_PARAM_QUALITY]: 6, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length}})
      : zlib.gzipSync(raw, {level: 6});
    if (compressedBytes + body.length <= COMPRESSED_CACHE_LIMIT) { compressed.set(key, body); compressedBytes += body.length; }
    return body;
  }

  function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.setHeader('Allow', 'GET, HEAD'); return res.end(); }
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
    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    res.setHeader('Content-Type', TYPES[ext] || 'application/octet-stream');
    res.setHeader('ETag', etag);
    res.setHeader('Last-Modified', stat.mtime.toUTCString());
    if (!res.hasHeader('Cache-Control')) res.setHeader('Cache-Control', DEFAULT_CACHE);
    if (String(req.headers['if-none-match'] || '').split(/\s*,\s*/).includes(etag)) { res.statusCode = 304; return res.end(); }

    const accepts = String(req.headers['accept-encoding'] || '');
    const encoding = COMPRESSIBLE.has(ext) && stat.size > 1024 ? (/\bbr\b/.test(accepts) ? 'br' : /\bgzip\b/.test(accepts) ? 'gzip' : null) : null;
    if (COMPRESSIBLE.has(ext)) res.setHeader('Vary', 'Accept-Encoding');
    if (encoding) {
      const body = compress(file, stat, encoding);
      res.setHeader('Content-Encoding', encoding);
      res.setHeader('Content-Length', body.length);
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    res.setHeader('Content-Length', stat.size);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  }

  return http.createServer(async (req, res) => {
    let pathname;
    try { pathname = new URL(req.url, 'http://localhost').pathname; } catch { res.statusCode = 400; return res.end(); }
    for (const rule of rules) if (rule.pattern.test(pathname)) for (const {key, value} of rule.headers) res.setHeader(key, value);
    if (hideFromSearch) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    try {
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        const handler = apiHandler(pathname);
        if (!handler) { res.statusCode = 404; res.setHeader('Content-Type', 'application/json; charset=utf-8'); return res.end('{"error":"not_found"}'); }
        return await handler(req, res);
      }
      return serveStatic(req, res, pathname);
    } catch (error) {
      log.error(`${req.method} ${pathname}:`, error);
      if (!res.headersSent) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end('{"error":"internal_error"}'); }
      else res.destroy();
    }
  });
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
