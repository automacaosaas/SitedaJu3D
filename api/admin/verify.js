'use strict';
// POST /api/admin/verify  {code} — the 6-digit code from the authenticator app, after the password. Replaces the
// short cookie with the full session (12 h). Five wrong codes end the attempt; the password has to be typed again.
const {adminEndpoint} = require('../_lib/admin-http');

module.exports = adminEndpoint({methods: ['POST'], open: true, async handle({body, auth, token, ip, userAgent}) {
  const {email, session} = await auth.verifyCode({token, code: body.code, ip, userAgent});
  return {body: {ok: true, email, expiresAt: session.expiresAt.getTime()}, session};
}});
