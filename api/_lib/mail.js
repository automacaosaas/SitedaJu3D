'use strict';
// Server-side settings and the Resend call. The API key only ever lives in server environment variables.
const crypto = require('node:crypto');
const DEFAULT_SITE = 'https://siteda-ju3-d.vercel.app';
const DEFAULT_FROM = 'Ju imprime pra mim <onboarding@resend.dev>';
const MIN_SECRET = 32;

// Without a dedicated AUTH_SECRET the signing key is derived from the Resend key (already a server-only secret), so
// the Vercel integration, which only provides RESEND_API_KEY, is enough to get going. Set AUTH_SECRET to keep the two
// independent; see EMAIL-TEMPLATE.md.
const deriveSecret = key => crypto.createHmac('sha256', key).update('ju-imprime-pra-mim:auth-challenge:v1').digest('hex');

function config(env = process.env) {
  const production = env.VERCEL_ENV === 'production';
  const apiKey = String(env.RESEND_API_KEY || '').trim();
  const explicit = String(env.AUTH_SECRET || '').length >= MIN_SECRET ? env.AUTH_SECRET : '';
  const siteUrl = (env.SITE_URL || (production || !env.VERCEL_URL ? DEFAULT_SITE : 'https://' + env.VERCEL_URL)).replace(/\/+$/, '');
  return {
    production, siteUrl,
    secret: explicit || (apiKey ? deriveSecret(apiKey) : ''),
    secretFrom: explicit ? 'AUTH_SECRET' : apiKey ? 'RESEND_API_KEY' : null,
    apiKey,
    from: env.MAIL_FROM || DEFAULT_FROM,
    replyTo: env.MAIL_REPLY_TO || '',
    // "console" prints instead of sending; it can never be switched on in production.
    transport: env.MAIL_TRANSPORT === 'console' && !production ? 'console' : 'resend'
  };
}

const mailReady = settings => Boolean(settings.secret && (settings.transport === 'console' || settings.apiKey));

async function sendMail({settings, to, subject, html, text, idempotencyKey, fetchImpl = globalThis.fetch, outbox = () => {}}) {
  if (settings.transport === 'console') { outbox({to, subject, html, text}); return {id: 'console'}; }
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {Authorization: `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json', ...(idempotencyKey ? {'Idempotency-Key': idempotencyKey} : {})},
    body: JSON.stringify({from: settings.from, to: [to], subject, html, text, ...(settings.replyTo ? {reply_to: settings.replyTo} : {})})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(`Resend ${response.status}: ${data.message || data.name || 'request failed'}`), {status: response.status});
  return data;
}

module.exports = {config, mailReady, sendMail, DEFAULT_SITE};
