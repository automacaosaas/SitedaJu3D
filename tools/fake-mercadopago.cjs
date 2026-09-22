'use strict';
// A small stand-in for Mercado Pago, for local prototyping and tests. It answers the calls the site makes
// (POST /v1/orders, GET /v1/orders/:id) with the shapes documented for the Orders API, so the whole checkout can be
// tried without credentials. It is NOT Mercado Pago: the real behavior is only proven with the test credentials.
//   Card token starting with APRO → approved · CONT → in review · anything else → refused. Pix always waits for payment.
const zlib = require('node:zlib');

const crc = (() => { const table = Array.from({length: 256}, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; }); return buffer => { let c = 0xffffffff; for (const byte of buffer) c = table[(c ^ byte) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }; })();
function chunk(type, data) { const body = Buffer.concat([Buffer.from(type), data]), out = Buffer.alloc(body.length + 8); out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc(body), body.length + 4); return out; }
// A recognizable QR-looking picture (finder squares + pseudo-random modules). It cannot be scanned; it only stands in for the image.
function fakeQrPng(seed = 1, modules = 25, scale = 8) {
  const size = modules * scale, rows = [];
  const dark = (x, y) => {
    const tl = x < 7 && y < 7, tr = x >= modules - 7 && y < 7, bl = x < 7 && y >= modules - 7;
    if (tl || tr || bl) { const fx = tr ? x - (modules - 7) : x, fy = bl ? y - (modules - 7) : y; return fx === 0 || fx === 6 || fy === 0 || fy === 6 || (fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4); }
    return ((x * 31 + y * 17 + seed * 7 + x * y) % 5) < 2;
  };
  for (let y = 0; y < size; y++) { const row = Buffer.alloc(size + 1, 255); row[0] = 0; for (let x = 0; x < size; x++) if (dark(Math.floor(x / scale), Math.floor(y / scale))) row[x + 1] = 0; rows.push(row); }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

const durationMs = text => { const m = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(String(text || '')); return m ? ((+m[1] || 0) * 60 + (+m[2] || 0)) * 60000 : 3600000; };

function createFakeMercadoPago({now = () => Date.now(), onPaid} = {}) {
  const orders = new Map(), keys = new Map();
  const reply = (status, body) => ({ok: status < 400, status, json: async () => body});
  const error = (status, code, message) => reply(status, {errors: [{code, message}]});

  function create(body, key) {
    if (keys.has(key)) return reply(201, orders.get(keys.get(key)));
    const payment = body?.transactions?.payments?.[0], method = payment?.payment_method;
    if (body?.type !== 'online' || !payment || !method || typeof body.total_amount !== 'string') return error(400, 'invalid_parameters', 'the order is incomplete');
    if (payment.amount !== body.total_amount) return error(400, 'invalid_total_amount', 'amount does not match total_amount');
    const pix = method.id === 'pix';
    if (pix && (!body.external_reference || !body.payer?.email || !body.shipment?.address)) return error(422, 'invalid_pix_order', 'Pix needs external_reference, payer.email and shipment.address');
    if (!pix && !/^[A-Za-z0-9]{32,33}$/.test(method.token || '')) return error(400, 'invalid_token', 'card token is missing');
    const outcome = pix ? ['action_required', 'waiting_transfer'] : method.token.startsWith('APRO') ? ['processed', 'accredited'] : method.token.startsWith('CONT') ? ['processing', 'in_process'] : ['failed', 'failed'];
    const id = 'ORD01FAKE' + String(orders.size + 1).padStart(8, '0') + Math.random().toString(36).slice(2, 8).toUpperCase();
    const expires = new Date(now() + durationMs(payment.expiration_time)).toISOString();
    const order = {
      id, type: 'online', processing_mode: 'automatic', status: outcome[0], status_detail: outcome[1], external_reference: body.external_reference, total_amount: body.total_amount, description: body.description,
      payer: body.payer, shipment: body.shipment, items: body.items,
      transactions: {payments: [{id: 'PAY01FAKE' + orders.size, amount: payment.amount, status: outcome[0], status_detail: outcome[1], date_of_expiration: pix ? expires : undefined,
        payment_method: pix ? {id: 'pix', type: 'bank_transfer', ticket_url: 'https://www.mercadopago.com.br/', qr_code: '00020126FAKE-PIX-CODE-' + id + '-SEM-VALOR', qr_code_base64: fakeQrPng(orders.size + 1).toString('base64')} : {id: method.id, type: method.type, installments: method.installments}}]}
    };
    orders.set(id, order); keys.set(key, id);
    // Like the real service, an approved card is announced by webhook a moment after the order is created.
    if (outcome[0] === 'processed' && onPaid) setTimeout(() => Promise.resolve(onPaid(id)).catch(() => {}), 120);
    return reply(201, order);
  }

  async function fetchImpl(url, init = {}) {
    const path = String(url).replace('https://api.mercadopago.com', '');
    if (!/^Bearer \S+/.test(init.headers?.Authorization || '')) return error(401, 'unauthorized', 'missing access token');
    if (path === '/v1/orders' && init.method === 'POST') { if (!init.headers['X-Idempotency-Key']) return error(400, 'missing_idempotency_key', 'X-Idempotency-Key is required'); return create(JSON.parse(init.body), init.headers['X-Idempotency-Key']); }
    const found = path.match(/^\/v1\/orders\/([^/?]+)$/);
    if (found && init.method === 'GET') { const order = orders.get(found[1]); if (!order) return error(404, 'order_not_found', 'order not found'); expireIfDue(order); return reply(200, order); }
    return error(404, 'not_found', path);
  }
  function expireIfDue(order) {
    const payment = order.transactions.payments[0];
    if (order.status === 'action_required' && payment.date_of_expiration && Date.parse(payment.date_of_expiration) <= now()) { order.status = 'expired'; order.status_detail = 'expired'; payment.status = 'expired'; payment.status_detail = 'expired'; }
  }
  // "The customer paid the Pix": the order becomes processed/accredited and Mercado Pago would now call our webhook.
  async function pay(id) {
    const order = orders.get(id); if (!order) return false;
    order.status = 'processed'; order.status_detail = 'accredited'; Object.assign(order.transactions.payments[0], {status: 'processed', status_detail: 'accredited'});
    if (onPaid) await onPaid(id);
    return true;
  }
  return {fetchImpl, pay, orders};
}

module.exports = {createFakeMercadoPago, fakeQrPng};
