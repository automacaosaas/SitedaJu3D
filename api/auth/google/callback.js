'use strict';
// GET /api/auth/google/callback?code=…&state=… → signs in and redirects (api/_lib/social-http.js). Registered as the
// "Authorized redirect URI" of the OAuth client in the Google Cloud console (SOCIAL-LOGIN.md).
module.exports = require('../../_lib/social-http').callbackRoute('google');
