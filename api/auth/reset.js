'use strict';
// POST /api/auth/reset  {grant, password} → {user} + session cookie. Signs out every other device.
const {endpoint} = require('../_lib/account-http');

module.exports = endpoint({methods: ['POST'], async handle({body, accounts, ip, userAgent}) {
  const {user, session} = await accounts.resetPassword({grant: body.grant, password: body.password, ip, userAgent});
  return {body: {user}, session};
}});
