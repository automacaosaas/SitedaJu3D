'use strict';
// POST /api/account/delete-start  {lang} → {challenge, expiresAt, resendAt}: e-mails a code to the signed-in account's
// own address to confirm "Excluir minha conta" (POST /api/account/delete).
const {endpoint, requireUser} = require('../_lib/account-http');

module.exports = endpoint({methods: ['POST'], async handle(context) {
  const customer = await requireUser(context);
  const started = await context.accounts.startDeletion(customer, {lang: context.body.lang, ip: context.ip});
  return {body: started};
}});
