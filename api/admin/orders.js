'use strict';
// GET /api/admin/orders — paid orders for Ju's panel (pendente, confirmado, enviado, concluido, recusado), newest first,
// a page at a time, with what is needed to produce and ship, and the NF-e of each (status, number, links). The CPF only
// masked. Orders still waiting for payment or cancelled are not shown.
//   ?limit=100 (1 to 200)  ?cursor=<nextCursor of the previous page>  → {orders, nextCursor (null on the last page), …}
// With Bling, the first page also says how the integration is (`integration`: ok, instavel, expirado, desconectado,
// pausado…, and how many notes wait in the queue), for the panel's notice.
// Nothing outside is awaited: notes the service is still processing are asked again after the answer (a few at a time
// in parallel), so the panel shows them as saved and the next opening shows what came back. After the answer the NF-e
// queue also takes a round (api/_lib/invoice-queue.js): notes waiting go, and with Bling the connection is renewed once
// a week, so it never lapses in a quiet month.
const {adminEndpoint} = require('../_lib/admin-http');
const {createOrders, PAID} = require('../_lib/orders');
const {createInvoicing} = require('../_lib/invoicing');
const {createInvoiceQueue, panelStatus} = require('../_lib/invoice-queue');
const {mapLimit} = require('../_lib/concurrency');

// How many notes are checked with the service at the same time. The Bling client keeps Bling's pace (3 requests a
// second); a note it cannot check now stays "processando" and the queue asks again later.
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
async function refreshLater({store, invoicing, processing, queue}) {
  try {
    await mapLimit(processing, REFRESH_CONCURRENCY, async invoice => {
      const order = await store.orders.findById(invoice.orderId);
      if (order) await invoicing.refresh(invoice, order);
    });
  } catch (error) { console.error('admin orders: could not check the notes still processing —', error.message); }
  if (queue) await queue.kick();
}

module.exports = adminEndpoint({methods: ['GET'], async handle({req, store, env, now, fetchImpl, outbox, waitUntil}) {
  const {limit, before} = pageOf(req.url);
  const orders = createOrders({store, env, now}), invoicing = createInvoicing({store, env, now, fetchImpl, outbox});
  // One extra row says whether there is a next page, without counting the table.
  const rows = await store.orders.listForAdmin({statuses: PAID, limit: limit + 1, before});
  const list = rows.slice(0, limit), more = rows.length > limit;
  const invoices = new Map((await store.invoices.listByOrders(list.map(o => o.id))).map(i => [i.orderId, i]));
  const processing = [...invoices.values()].filter(i => i.status === 'processando');
  const bling = !before && invoicing.settings.provider === 'bling';
  const waiting = [...invoices.values()].some(i => i.status === 'fila');
  // A notice, never a reason for the panel not to open (say, the queue's columns missing after a migration failed).
  const integration = bling ? await panelStatus({store, env, now}).catch(error => { console.error('admin orders: Bling status unavailable —', error.code || '', error.message); return null; }) : null;
  // Last thing before answering: the work after the answer starts here.
  if (processing.length || waiting || bling) waitUntil(refreshLater({store, invoicing, processing, queue: waiting || bling ? createInvoiceQueue({store, env, now, fetchImpl, outbox}) : null}));
  return {body: {
    orders: list.map(order => ({...orders.adminView(order), invoice: invoicing.view(invoices.get(order.id))})),
    nextCursor: more ? encodeCursor(list[list.length - 1]) : null,
    invoicing: invoicing.settings.mode, invoicingProvider: invoicing.settings.mode === 'off' ? null : invoicing.settings.provider,
    ...(integration ? {integration} : {})
  }};
}});
