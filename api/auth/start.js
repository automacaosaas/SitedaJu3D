'use strict';
// POST /api/auth/start  {email, purpose: 'access'|'reset', lang} → {challenge, email, expiresAt, resendAt}
// E-mails a 6-digit code. The answer is the same whether or not the address already has an account.
const {endpoint} = require('../_lib/account-http');

module.exports = endpoint({methods: ['POST'], async handle({body, accounts, ip}) {
  return {body: await accounts.start({email: body.email, purpose: body.purpose, lang: body.lang, ip})};
}});
