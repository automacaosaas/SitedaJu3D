'use strict';
// GET /api/account/orders → the signed-in buyer's own orders ("Meus pedidos"): status, items, totals. No payment ids,
// no personal data beyond what the buyer typed. Attempts that were never paid (refused card, expired Pix) stay in the
// database but are not listed; paid orders and those still waiting for payment are.
const {endpoint, requireUser} = require('../_lib/account-http');
const {createOrders} = require('../_lib/orders');

module.exports = endpoint({methods: ['GET'], async handle(context) {
  const customer = await requireUser(context);
  const orders = createOrders({store: context.store, env: context.env, now: context.now});
  return {body: {orders: (await context.store.orders.listByCustomer(customer.id, 50)).filter(order => order.status !== 'cancelado').map(orders.customerView)}};
}});
