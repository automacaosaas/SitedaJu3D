'use strict';
// POST /api/auth/apple/callback (response_mode=form_post: code, state and, the first time only, the name in "user") →
// signs in and redirects (api/_lib/social-http.js). Registered as a "Return URL" of the Services ID (SOCIAL-LOGIN.md).
module.exports = require('../../_lib/social-http').callbackRoute('apple');
