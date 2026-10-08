'use strict';
// GET /api/auth/apple/start?next=checkout → the Apple sign-in page (api/_lib/social-http.js).
module.exports = require('../../_lib/social-http').startRoute('apple');
