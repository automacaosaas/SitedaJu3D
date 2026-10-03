'use strict';
// POST /api/auth/verify  {challenge, code}
//   → {status: 'signed_in', user} (+ session cookie) for an existing account,
//   → {status: 'needs_profile' | 'reset_allowed', email, grant} to finish sign-up or set a new password.
const {endpoint} = require('../_lib/account-http');

module.exports = endpoint({methods: ['POST'], async handle({body, accounts, ip, userAgent}) {
  const result = await accounts.verify({challenge: body.challenge, code: String(body.code ?? '').trim(), ip, userAgent});
  if (result.status !== 'signed_in') return {body: result};
  return {body: {status: result.status, user: result.user}, session: result.session};
}});
