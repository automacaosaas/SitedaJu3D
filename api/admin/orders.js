'use strict';
// GET /api/admin/orders — paid orders for Ju's panel (pendente, concluido, recusado), newest first, with what is needed
// to produce and ship. The CPF only masked. Orders still waiting for payment or cancelled are not shown.
const {adminEndpoint} = require('../_lib/admin-http');
const {createOrders, PAID} = require('../_lib/orders');

module.exports = adminEndpoint({methods: ['GET'], async handle({store, env, now}) {
  const orders = createOrders({store, env, now});
  return {body: {orders: (await store.orders.list({statuses: PAID, limit: 1000})).map(orders.adminView)}};
}});
