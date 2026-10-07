'use strict';
// GET /api/auth/google/start?next=checkout → the Google sign-in page (api/_lib/social-http.js).
module.exports = require('../../_lib/social-http').startRoute('google');
