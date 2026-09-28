'use strict';
// GET /api/admin/orders — paid orders for Ju's panel (pendente, concluido, recusado), newest first, with what is needed
// to produce and ship, and the NF-e of each (status, number, links; notes the service is still processing are asked
// again here). The CPF only masked. Orders still waiting for payment or cancelled are not shown.
const {adminEndpoint} = require('../_lib/admin-http');
const {createOrders, PAID} = require('../_lib/orders');
const {createInvoicing} = require('../_lib/invoicing');

module.exports = adminEndpoint({methods: ['GET'], async handle({store, env, now, fetchImpl, outbox}) {
  const orders = createOrders({store, env, now}), invoicing = createInvoicing({store, env, now, fetchImpl, outbox});
  const list = await store.orders.list({statuses: PAID, limit: 1000});
  const invoices = new Map((await store.invoices.listByOrders(list.map(o => o.id))).map(i => [i.orderId, i]));
  for (const order of list) {
    const invoice = invoices.get(order.id);
    if (invoice?.status === 'processando') invoices.set(order.id, await invoicing.refresh(invoice, order));
  }
  return {body: {orders: list.map(order => ({...orders.adminView(order), invoice: invoicing.view(invoices.get(order.id))})), invoicing: invoicing.settings.mode}};
}});
