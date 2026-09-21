'use strict';
// GET /api/email-preview?purpose=signup&lang=pt-BR&name=Maria — renders the e-mail with a fake code.
// Available outside production only (see dist/email-preview.html).
const {LANGUAGES, PURPOSES} = require('./_lib/challenge');
const {config} = require('./_lib/mail');
const {renderVerificationEmail, verificationUrl} = require('./_lib/email-template');

function createHandler({env = process.env} = {}) {
  return function handler(req, res) {
    const settings = config(env);
    if (settings.production) { res.statusCode = 404; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); return res.end('Not found'); }
    const query = new URL(req.url, 'http://local').searchParams;
    const purpose = PURPOSES.includes(query.get('purpose')) ? query.get('purpose') : 'signup', lang = LANGUAGES.includes(query.get('lang')) ? query.get('lang') : 'pt-BR';
    const name = (query.get('name') ?? 'Maria').slice(0, 60), code = '482916';
    const message = renderVerificationEmail({lang, purpose, name, code, siteUrl: settings.siteUrl, assetUrl: settings.assetUrl, url: verificationUrl({siteUrl: settings.siteUrl, token: 'exemplo-de-desafio.assinado', code})});
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(message.html);
  };
}

module.exports = createHandler();
module.exports.create = createHandler;
