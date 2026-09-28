'use strict';
// GET /api/auth/me → {user} for the signed-in buyer, or 401 (and the stale cookie is cleared).
const {endpoint} = require('../_lib/account-http');

module.exports = endpoint({methods: ['GET'], async handle({accounts, user, token}) {
  const customer = await user();
  if (!customer) return {status: 401, body: {error: 'unauthorized'}, clear: Boolean(token)};
  return {body: {user: accounts.publicUser(customer)}};
}});
