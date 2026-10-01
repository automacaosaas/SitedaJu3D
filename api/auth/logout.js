'use strict';
// POST /api/auth/logout → ends this session and clears the cookie.
const {endpoint} = require('../_lib/account-http');

module.exports = endpoint({methods: ['POST'], async handle({accounts, token}) {
  await accounts.logout(token);
  return {body: {ok: true}, clear: true};
}});
