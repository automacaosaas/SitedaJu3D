'use strict';
// Small helpers so handlers work on Vercel and on the local dev server (plain Node req/res).
const MAX_BODY = 4096;

function json(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(JSON.stringify(body));
}

async function readJson(req, limit = MAX_BODY) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let text = typeof req.body === 'string' ? req.body : '';
  if (!text) {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > limit) throw Object.assign(new Error('body too large'), {status: 413}); chunks.push(chunk); }
    text = Buffer.concat(chunks).toString('utf8');
  }
  if (text.length > limit) throw Object.assign(new Error('body too large'), {status: 413});
  try { const value = JSON.parse(text || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  catch { throw Object.assign(new Error('invalid json'), {status: 400}); }
}

const clientIp = req => String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();

// Browsers always send Origin on POST. It must belong to this site (or localhost outside production).
function allowedOrigins(env) {
  const hosts = new Set();
  for (const value of [env.SITE_URL, env.VERCEL_PROJECT_PRODUCTION_URL, env.VERCEL_URL, env.VERCEL_BRANCH_URL]) {
    if (!value) continue;
    try { hosts.add(new URL(/^https?:\/\//.test(value) ? value : 'https://' + value).host); } catch {}
  }
  return hosts;
}
function sameOrigin(req, env) {
  const origin = req.headers.origin;
  if (!origin) return false;
  let url; try { url = new URL(origin); } catch { return false; }
  if (allowedOrigins(env).has(url.host)) return true;
  return env.VERCEL_ENV !== 'production' && /^(localhost|127\.0\.0\.1)$/.test(url.hostname);
}

// Best-effort limiter kept in memory. Serverless instances are short-lived, so this only slows down naive loops;
// see EMAIL-TEMPLATE.md for the durable option.
function createLimiter(now = () => Date.now()) {
  const hits = new Map();
  return {
    take(key, limit, windowMs) {
      const t = now(), recent = (hits.get(key) || []).filter(time => t - time < windowMs);
      if (recent.length >= limit) { hits.set(key, recent); return {ok: false, retryAfter: Math.ceil((windowMs - (t - recent[0])) / 1000)}; }
      recent.push(t); hits.set(key, recent);
      if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(time => t - time < windowMs)) hits.delete(k);
      return {ok: true};
    }
  };
}

module.exports = {json, readJson, clientIp, sameOrigin, createLimiter};
