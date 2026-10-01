'use strict';
// GET /api/account/orders → the signed-in buyer's own orders ("Meus pedidos"): status, items, totals. No payment ids,
// no personal data beyond what the buyer typed. Attempts that were never paid (refused card, expired Pix) stay in the
// database but are not listed; paid orders and those still waiting for payment are. A Pix code lasts one hour: after
// two, an unpaid Pix is treated as expired even if Mercado Pago's notice about it has not arrived.
const {endpoint, requireUser} = require('../_lib/account-http');
const {createOrders} = require('../_lib/orders');

const PIX_GONE_AFTER = 2 * 60 * 60 * 1000;
const listed = now => order => order.status !== 'cancelado'
  && !(order.status === 'aguardando_pagamento' && order.paymentState === 'pending_pix' && now - new Date(order.createdAt).getTime() > PIX_GONE_AFTER);

module.exports = endpoint({methods: ['GET'], async handle(context) {
  const customer = await requireUser(context);
  const orders = createOrders({store: context.store, env: context.env, now: context.now});
  return {body: {orders: (await context.store.orders.listByCustomer(customer.id, 50)).filter(listed(context.now())).map(orders.customerView)}};
}});
