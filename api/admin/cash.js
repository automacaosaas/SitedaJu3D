'use strict';
// GET/POST /api/admin/cash — "Fluxo de caixa" in Ju's panel (api/_lib/cash.js).
//   GET                                                                     → {cash: {today, balanceCents, movements, bills}}
//   POST {action: 'add-entry', kind: 'entrada' | 'saida', description, amountCents, category, date}
//   POST {action: 'remove-entry', id}                     (only entries added by hand; sales come from the orders)
//   POST {action: 'add-bill', description, amountCents, dueDate}
//   POST {action: 'set-bill-paid', id, paid: true | false} (paid today, or back to pending)
//   POST {action: 'remove-bill', id}
//   POST {action: 'adjust-balance', balanceCents}          (what is in the account today; the difference is an adjustment)
// Every POST answers the whole view again, so the panel is up to date after each change, and goes to the audit log.
const {adminEndpoint} = require('../_lib/admin-http');
const {createCash} = require('../_lib/cash');

module.exports = adminEndpoint({methods: ['GET', 'POST'], async handle({req, body, store, now, admin, auth, ip}) {
  const cash = createCash({store, now});
  if (req.method === 'POST') {
    const change = await cash.apply(body, {actor: admin.email});
    if (change) await auth.audit(admin.id, change.action, change.detail, ip);
  }
  return {body: {ok: true, cash: await cash.view()}};
}});
