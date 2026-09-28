'use strict';
// GET /api/admin/session — who is signed in to the panel (401 otherwise). Called when the panel opens.
const {adminEndpoint} = require('../_lib/admin-http');

module.exports = adminEndpoint({methods: ['GET'], handle: async ({admin, expiresAt}) => ({body: {ok: true, email: admin.email, expiresAt}})});
