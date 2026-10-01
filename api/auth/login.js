'use strict';
// POST /api/auth/login  {email, password} → {user} + session cookie. Wrong e-mail and wrong password look the same.
const {endpoint} = require('../_lib/account-http');

module.exports = endpoint({methods: ['POST'], async handle({body, accounts, ip, userAgent}) {
  const {user, session} = await accounts.login({email: body.email, password: body.password, ip, userAgent});
  return {body: {user}, session};
}});
