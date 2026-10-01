'use strict';
// GET /api/admin/session — who is signed in to the panel. Called when the panel opens: nobody signed in is a normal
// answer ({ok: false}, 200), not an error in the browser console; a stale cookie is cleared.
const {adminEndpoint} = require('../_lib/admin-http');

module.exports = adminEndpoint({methods: ['GET'], open: true, async handle({auth, token}) {
  const current = await auth.authenticate(token);
  if (!current) return {body: {ok: false}, clear: Boolean(token)};
  return {body: {ok: true, email: current.admin.email, expiresAt: current.expiresAt}};
}});
