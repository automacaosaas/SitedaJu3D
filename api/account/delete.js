'use strict';
// POST /api/account/delete  {challenge, code} — deletes the signed-in account after the e-mailed code: profile,
// sessions and codes go; orders stay (invoice records) without the link to the account. Clears the session cookie.
const {endpoint, requireUser} = require('../_lib/account-http');

module.exports = endpoint({methods: ['POST'], async handle(context) {
  const customer = await requireUser(context);
  await context.accounts.deleteAccount(customer, {challenge: context.body.challenge, code: String(context.body.code ?? '').trim(), ip: context.ip});
  return {body: {ok: true, deleted: true}, clear: true};
}});
