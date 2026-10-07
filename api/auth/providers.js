'use strict';
// GET /api/auth/providers → {google, apple}: which "Continuar com…" buttons the account page shows.
module.exports = require('../_lib/social-http').providersRoute();
