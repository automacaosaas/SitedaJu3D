'use strict';
// POST /api/admin/login  {email, password} → {next: 'totp'} or, on the first login, {next: 'totp_setup', setup: {secret,
// otpauth}} for the authenticator app. Sets a short cookie that only allows the code step (POST /api/admin/verify).
const {adminEndpoint} = require('../_lib/admin-http');

module.exports = adminEndpoint({methods: ['POST'], open: true, async handle({body, auth, ip, userAgent}) {
  const {next, session, setup} = await auth.login({email: body.email, password: body.password, ip, userAgent});
  return {body: {ok: true, next, ...(setup ? {setup} : {})}, session};
}});
