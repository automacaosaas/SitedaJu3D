'use strict';
// GET /api/account/profile → identification data of the signed-in buyer (CPF only masked).
// PUT /api/account/profile  {firstName, lastName, cpf?, phone, company?: {cnpj, name, stateRegistration | stateRegistrationExempt}, marketingOptIn?}
const {endpoint, requireUser} = require('../_lib/account-http');

module.exports = endpoint({methods: ['GET', 'PUT'], async handle(context) {
  const customer = await requireUser(context);
  if (context.req.method === 'GET') return {body: {profile: context.accounts.profile(customer)}};
  return {body: {profile: await context.accounts.updateProfile(customer, context.body)}};
}});
