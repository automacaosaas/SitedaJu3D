'use strict';
// POST /api/admin/logout — ends this panel session (also in the database) and clears the cookie.
const {adminEndpoint} = require('../_lib/admin-http');

module.exports = adminEndpoint({methods: ['POST'], open: true, async handle({auth, token}) {
  await auth.logout(token);
  return {body: {ok: true}, clear: true};
}});
