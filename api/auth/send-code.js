'use strict';
// POST /api/auth/send-code  {email, name?, purpose: 'signup'|'access'|'reset', lang?}
// Generates a six-digit code, e-mails it through Resend and returns a signed challenge (never the code).
const {issue, PURPOSES, LANGUAGES, CODE_TTL_MS, RESEND_AFTER_MS} = require('../_lib/challenge');
const {json, readJson, clientIp, sameOrigin, createLimiter} = require('../_lib/http');
const {config, mailReady, sendMail} = require('../_lib/mail');
const {renderVerificationEmail, verificationUrl} = require('../_lib/email-template');

const EMAIL = /^[^\s@<>()[\],;:"\\]+@[^\s@<>()[\],;:"\\]+\.[^\s@<>()[\],;:"\\]+$/;
const cleanName = value => String(value || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);

function createHandler({env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now(), limiter = createLimiter(now), outbox} = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return json(res, 405, {error: 'method_not_allowed'}, {Allow: 'POST'});
    const settings = config(env);
    if (!sameOrigin(req, {...env, SITE_URL: settings.siteUrl})) return json(res, 403, {error: 'forbidden'});
    if (!mailReady(settings)) return json(res, 503, {error: 'email_not_configured'});

    let body;
    try { body = await readJson(req); } catch (error) { return json(res, error.status || 400, {error: 'invalid_request'}); }
    const email = String(body.email || '').trim().toLowerCase();
    if (email.length > 180 || !EMAIL.test(email)) return json(res, 400, {error: 'invalid_email'});
    if (!PURPOSES.includes(body.purpose)) return json(res, 400, {error: 'invalid_purpose'});
    const purpose = body.purpose, lang = LANGUAGES.includes(body.lang) ? body.lang : 'pt-BR', name = cleanName(body.name);

    for (const [key, limit, windowMs] of [['cool:' + email, 1, RESEND_AFTER_MS], ['email:' + email, 4, 10 * 60 * 1000], ['ip:' + clientIp(req), 15, 60 * 60 * 1000]]) {
      const taken = limiter.take(key, limit, windowMs);
      if (!taken.ok) return json(res, 429, {error: 'too_many_requests', retryAfter: taken.retryAfter}, {'Retry-After': String(taken.retryAfter)});
    }

    const {code, token, payload} = issue({secret: settings.secret, email, name, purpose, now: now()});
    const message = renderVerificationEmail({lang, purpose, name, code, siteUrl: settings.siteUrl, assetUrl: settings.assetUrl, expiryMinutes: CODE_TTL_MS / 60000, url: verificationUrl({siteUrl: settings.siteUrl, token, code})});
    try {
      await sendMail({settings, to: email, subject: message.subject, html: message.html, text: message.text, idempotencyKey: `${purpose}-${payload.r}`, fetchImpl, outbox: outbox && (mail => outbox({...mail, code, token, purpose, url: verificationUrl({siteUrl: settings.siteUrl, token, code})}))});
    } catch (error) {
      console.error('send-code: e-mail not sent —', error.status || '', error.message);
      return json(res, 502, {error: 'send_failed'});
    }
    return json(res, 200, {challenge: token, email, purpose, expiresAt: payload.x, resendAt: payload.s + RESEND_AFTER_MS});
  };
}

module.exports = createHandler();
module.exports.create = createHandler;
