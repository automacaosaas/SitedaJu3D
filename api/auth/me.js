'use strict';
// GET /api/auth/me → {user} for the signed-in buyer, or {user: null} (and a stale cookie is cleared). Every page asks
// this, so "nobody signed in" is a normal answer, not an error the browser would log for each anonymous visit.
const {endpoint} = require('../_lib/account-http');

module.exports = endpoint({methods: ['GET'], async handle({accounts, user, token}) {
  const customer = await user();
  if (!customer) return {body: {user: null}, clear: Boolean(token)};
  return {body: {user: accounts.publicUser(customer)}};
}});
