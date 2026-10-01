'use strict';
// POST /api/auth/register  {grant, name, password?, marketingOptIn} → {user} + session cookie. Password is optional:
// without one, the buyer always signs in with an e-mailed code.
const {endpoint} = require('../_lib/account-http');

module.exports = endpoint({methods: ['POST'], async handle({body, accounts, ip, userAgent}) {
  const {user, session} = await accounts.register({grant: body.grant, name: body.name, password: body.password, marketingOptIn: body.marketingOptIn === true, ip, userAgent});
  return {status: 201, body: {user}, session};
}});
