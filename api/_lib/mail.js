'use strict';
// Server-side settings and the Resend call. The API key only ever lives in server environment variables.
const crypto = require('node:crypto');
const {isProduction} = require('./runtime');
const {COMPANY, contact} = require('./legal');
// Without SITE_URL the links and the logo point at the shop's own domain (2026-10-08), never at the temporary Hostinger one.
const DEFAULT_SITE = COMPANY.website;
const DEFAULT_FROM = 'Ju imprime pra mim <onboarding@resend.dev>';
const SEND_TIMEOUT_MS = 10000;
const MIN_SECRET = 32;

// Without a dedicated AUTH_SECRET the signing key is derived from the Resend key (already a server-only secret), so
// the Vercel integration, which only provides RESEND_API_KEY, is enough to get going. Set AUTH_SECRET to keep the two
// independent; see EMAIL-TEMPLATE.md.
const deriveSecret = key => crypto.createHmac('sha256', key).update('ju-imprime-pra-mim:auth-challenge:v1').digest('hex');

function config(env = process.env) {
  const production = isProduction(env);
  const apiKey = String(env.RESEND_API_KEY || '').trim();
  const explicit = String(env.AUTH_SECRET || '').length >= MIN_SECRET ? env.AUTH_SECRET : '';
  const siteUrl = (env.SITE_URL || (production || !env.VERCEL_URL ? DEFAULT_SITE : 'https://' + env.VERCEL_URL)).replace(/\/+$/, '');
  // Images in e-mails must be publicly reachable. Preview deployments sit behind a login, so the logo always comes
  // from the public site (or SITE_URL when set) while the button keeps pointing at the deployment that sent the e-mail.
  const assetUrl = (env.SITE_URL || DEFAULT_SITE).replace(/\/+$/, '');
  return {
    production, siteUrl, assetUrl,
    secret: explicit || (apiKey ? deriveSecret(apiKey) : ''),
    secretFrom: explicit ? 'AUTH_SECRET' : apiKey ? 'RESEND_API_KEY' : null,
    apiKey,
    from: env.MAIL_FROM || DEFAULT_FROM,
    // The domain has no inbox (no MX), so "Responder" on a shop e-mail would bounce: without MAIL_REPLY_TO, answers go to the
    // shop's public e-mail (COMPANY.email, api/_lib/legal.js; none while it is still "[PREENCHER: ...]"). Sender and recipients
    // stay as they are.
    replyTo: String(env.MAIL_REPLY_TO || '').trim() || contact().email,
    // "console" prints instead of sending; it can never be switched on in production.
    transport: env.MAIL_TRANSPORT === 'console' && !production ? 'console' : 'resend'
  };
}

const mailReady = settings => Boolean(settings.secret && (settings.transport === 'console' || settings.apiKey));

// `replyTo` (a contact message: the sender's address; a paid order's notice to Ju: the buyer's) wins over settings.replyTo.
async function sendMail({settings, to, subject, html, text, idempotencyKey, replyTo, fetchImpl = globalThis.fetch, outbox = () => {}}) {
  const reply = replyTo || settings.replyTo;
  if (settings.transport === 'console') { outbox({to, subject, html, text, replyTo: reply}); return {id: 'console'}; }
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {Authorization: `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json', ...(idempotencyKey ? {'Idempotency-Key': idempotencyKey} : {})},
    body: JSON.stringify({from: settings.from, to: [to], subject, html, text, ...(reply ? {reply_to: reply} : {})}),
    // A slow e-mail service must not hold the answer to a payment (the order is saved before any e-mail goes out, and a
    // later webhook or status check retries the e-mail).
    ...(typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? {signal: AbortSignal.timeout(SEND_TIMEOUT_MS)} : {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(`Resend ${response.status}: ${data.message || data.name || 'request failed'}`), {status: response.status});
  return data;
}

module.exports = {config, mailReady, sendMail, DEFAULT_SITE};
