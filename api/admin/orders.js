'use strict';
// GET /api/admin/orders — paid orders for Ju's panel (pendente, concluido, recusado), newest first, a page at a time,
// with what is needed to produce and ship, and the NF-e of each (status, number, links). The CPF only masked. Orders
// still waiting for payment or cancelled are not shown.
//   ?limit=100 (1 to 200)  ?cursor=<nextCursor of the previous page>  → {orders, nextCursor (null on the last page), …}
// Nothing outside is awaited: notes the service is still processing are asked again after the answer (a few at a time
// in parallel), so the panel shows them as saved and the next opening shows what came back. With Bling, the first page
// also renews the connection once a week, after the answer too, so it never lapses in a quiet month.
const {adminEndpoint} = require('../_lib/admin-http');
const {createOrders, PAID} = require('../_lib/orders');
const {createInvoicing} = require('../_lib/invoicing');
const {createBling} = require('../_lib/bling');
const {mapLimit} = require('../_lib/concurrency');

// How many notes are checked with the service at the same time. Bling allows about 3 requests a second per account; a
// refusal (429) only leaves that note as "processando" until the panel is opened again.
const REFRESH_CONCURRENCY = 3;
const PAGE = 100, MAX_PAGE = 200;
const ID = /^[0-9a-zA-Z-]{1,36}$/;

const invalid = field => Object.assign(new Error('invalid request'), {code: 'invalid_request', field});
// The cursor is the last order of a page ({createdAt, id}), opaque to the panel.
const encodeCursor = order => Buffer.from(JSON.stringify([new Date(order.createdAt).toISOString(), order.id])).toString('base64url');
function decodeCursor(text) {
  try {
    const [at, id] = JSON.parse(Buffer.from(text, 'base64url').toString('utf8')), createdAt = new Date(at);
    if (typeof at === 'string' && !Number.isNaN(createdAt.getTime()) && typeof id === 'string' && ID.test(id)) return {createdAt, id};
  } catch {}
  throw invalid('cursor');
}
function pageOf(url) {
  const query = new URL(url || '/', 'http://panel').searchParams, limit = query.get('limit'), cursor = query.get('cursor');
  if (limit !== null && !(/^\d{1,3}$/.test(limit) && +limit >= 1 && +limit <= MAX_PAGE)) throw invalid('limit');
  return {limit: limit === null ? PAGE : +limit, before: cursor ? decodeCursor(cursor) : null};
}

// After the answer; never rejects, so nothing is left unhandled. Each note is checked against its full order (the
// e-mail with the authorized note needs the buyer), which the page itself does not carry.
async function refreshLater({store, invoicing, processing, bling}) {
  try {
    await mapLimit(processing, REFRESH_CONCURRENCY, async invoice => {
      const order = await store.orders.findById(invoice.orderId);
      if (order) await invoicing.refresh(invoice, order);
    });
  } catch (error) { console.error('admin orders: could not check the notes still processing —', error.message); }
  if (bling) await bling.keepAlive().catch(error => console.error('admin orders: Bling keep-alive failed —', error.message));
}

module.exports = adminEndpoint({methods: ['GET'], async handle({req, store, env, now, fetchImpl, outbox, waitUntil}) {
  const {limit, before} = pageOf(req.url);
  const orders = createOrders({store, env, now}), invoicing = createInvoicing({store, env, now, fetchImpl, outbox});
  // One extra row says whether there is a next page, without counting the table.
  const rows = await store.orders.listForAdmin({statuses: PAID, limit: limit + 1, before});
  const list = rows.slice(0, limit), more = rows.length > limit;
  const invoices = new Map((await store.invoices.listByOrders(list.map(o => o.id))).map(i => [i.orderId, i]));
  const processing = [...invoices.values()].filter(i => i.status === 'processando');
  const bling = !before && invoicing.settings.provider === 'bling' ? createBling({store, env, now, fetchImpl}) : null;
  if (processing.length || bling) waitUntil(refreshLater({store, invoicing, processing, bling}));
  return {body: {
    orders: list.map(order => ({...orders.adminView(order), invoice: invoicing.view(invoices.get(order.id))})),
    nextCursor: more ? encodeCursor(list[list.length - 1]) : null,
    invoicing: invoicing.settings.mode, invoicingProvider: invoicing.settings.mode === 'off' ? null : invoicing.settings.provider
  }};
}});
