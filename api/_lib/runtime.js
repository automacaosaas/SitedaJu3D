'use strict';
// Where the functions run. Vercel sets VERCEL_ENV; the Node server used on the Hostinger (server.cjs) reads APP_ENV from
// the panel's environment variables. Either one set to "production" means the live shop, so test-only paths stay closed.
const net = require('node:net');
const {COMPANY} = require('./legal');

const isProduction = (env = process.env) => env.APP_ENV === 'production' || env.VERCEL_ENV === 'production';

// Search engines (2026-10-07): whether a page may be indexed depends on the address it was asked by, not on APP_ENV.
// The shop's own domain (and its www/apex sibling) is indexable even while the server still runs as preview; every
// other address (the Hostinger temporary *.hostingersite.com, localhost, a bare IP) keeps "X-Robots-Tag: noindex".
// "host:port", "[::1]:3000", "Site.com." → "host", "::1", "site.com".
function normalizeHost(value) {
  let host = String(value || '').trim().toLowerCase();
  if (host.startsWith('[')) host = host.slice(1, host.includes(']') ? host.indexOf(']') : undefined);
  else if ((host.match(/:/g) || []).length === 1) host = host.slice(0, host.indexOf(':'));
  return host.replace(/\.+$/, '');
}
// Addresses that are never the public shop, even when SITE_URL names them (the test site's SITE_URL is its temporary domain).
const NOT_PUBLIC = /(^|\.)(hostingersite\.com|vercel\.app|localhost|local|test|internal|invalid|example)$/;
function publicHost(url) {
  let host;
  try { host = normalizeHost(new URL(String(url || '')).host); } catch { return ''; }
  return host && host.includes('.') && !net.isIP(host) && !NOT_PUBLIC.test(host) ? host : '';
}
// The shop's domain: the host of SITE_URL when it is a public name, else COMPANY.website (api/_lib/legal.js).
const canonicalHost = (env = process.env) => publicHost(env.SITE_URL) || publicHost(COMPANY.website);
// The canonical host, its www/apex sibling and the optional INDEX_HOSTS list (commas or spaces).
function indexableHosts(env = process.env) {
  const hosts = new Set(), main = canonicalHost(env);
  if (main) { hosts.add(main); hosts.add(main.startsWith('www.') ? main.slice(4) : `www.${main}`); }
  for (const host of String(env.INDEX_HOSTS || '').split(/[\s,]+/)) if (normalizeHost(host)) hosts.add(normalizeHost(host));
  return hosts;
}
// The address the visitor typed: the first X-Forwarded-Host (a CDN in front may rewrite Host), else Host.
function requestHost(req) {
  const headers = req?.headers || {}, forwarded = String(headers['x-forwarded-host'] || '').split(',')[0].trim();
  return normalizeHost(forwarded || headers.host || '');
}
const indexable = (env, host) => Boolean(host) && indexableHosts(env).has(normalizeHost(host));

module.exports = {isProduction, normalizeHost, canonicalHost, indexableHosts, requestHost, indexable};
