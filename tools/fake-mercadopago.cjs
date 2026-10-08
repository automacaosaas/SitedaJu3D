'use strict';
// A small stand-in for Mercado Pago, for local prototyping and tests. It answers the calls the site makes
// (POST /v1/orders, GET /v1/orders/:id, POST /v1/orders/:id/refund and /cancel) with the shapes documented for the Orders API, so the whole checkout can be
// tried without credentials. It is NOT Mercado Pago: the real behavior is only proven with the test credentials.
//   Card token starting with APRO → approved · CONT → in review · anything else → refused, like Mercado Pago's test
//   cards: 402 "failed" with the reason (FUND insufficient_amount, SECU/EXPI/FORM bad_filled_card_data, CALL
//   required_call_for_authorize, LOCK card_disabled, ATTE max_attempts_exceeded, INST invalid_installments, BLAC
//   high_risk, OTHE and the rest rejected_by_issuer). Pix always waits for payment, until paid, expired or cancelled.
//   The device id (X-meli-session-id) of each order is kept in `deviceIds`.
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

const REFUSALS = {FUND: 'insufficient_amount', SECU: 'bad_filled_card_data', EXPI: 'bad_filled_card_data', FORM: 'bad_filled_card_data', CALL: 'required_call_for_authorize', LOCK: 'card_disabled', ATTE: 'max_attempts_exceeded', INST: 'invalid_installments', BLAC: 'high_risk'};

function createFakeMercadoPago({now = () => Date.now(), onPaid} = {}) {
  const orders = new Map(), keys = new Map(), deviceIds = new Map();
  const reply = (status, body) => ({ok: status < 400, status, headers: {get: name => String(name).toLowerCase() === 'x-request-id' ? 'fake-req-' + (orders.size + 1) : null}, json: async () => body});
  const error = (status, code, message, extra = {}) => reply(status, {errors: [{code, message, ...extra}]});

  const refusal = order => error(402, 'failed', 'The following transactions failed', {details: [`${order.transactions.payments[0].id}: ${order.transactions.payments[0].status_detail}`]});
  function create(body, key, sessionId) {
    // The same idempotency key gives the same answer: the order created the first time, or the same refusal.
    if (keys.has(key)) { const known = orders.get(keys.get(key)); return known.status === 'failed' ? refusal(known) : reply(201, known); }
    const payment = body?.transactions?.payments?.[0], method = payment?.payment_method;
    if (body?.type !== 'online' || !payment || !method || typeof body.total_amount !== 'string') return error(400, 'invalid_parameters', 'the order is incomplete');
    if (payment.amount !== body.total_amount) return error(400, 'invalid_total_amount', 'amount does not match total_amount');
    const pix = method.id === 'pix';
    if (pix && (!body.external_reference || !body.payer?.email || !body.shipment?.address)) return error(422, 'invalid_pix_order', 'Pix needs external_reference, payer.email and shipment.address');
    if (!pix && !/^[A-Za-z0-9]{32,33}$/.test(method.token || '')) return error(400, 'invalid_token', 'card token is missing');
    const holder = pix ? '' : method.token.slice(0, 4).toUpperCase();
    const outcome = pix ? ['action_required', 'waiting_transfer'] : holder === 'APRO' ? ['processed', 'accredited'] : holder === 'CONT' ? ['processing', 'in_process'] : ['failed', REFUSALS[holder] || 'rejected_by_issuer'];
    const id = 'ORD01FAKE' + String(orders.size + 1).padStart(8, '0') + Math.random().toString(36).slice(2, 8).toUpperCase();
    const expires = new Date(now() + durationMs(payment.expiration_time)).toISOString();
    const paymentId = 'PAY01FAKE' + orders.size;
    const order = {
      id, type: 'online', processing_mode: 'automatic', status: outcome[0], status_detail: outcome[0] === 'failed' ? 'failed' : outcome[1], external_reference: body.external_reference, total_amount: body.total_amount, description: body.description,
      payer: body.payer, shipment: body.shipment, items: body.items,
      transactions: {payments: [{id: paymentId, amount: payment.amount, status: outcome[0], status_detail: outcome[1], date_of_expiration: pix ? expires : undefined,
        payment_method: pix ? {id: 'pix', type: 'bank_transfer', ticket_url: 'https://www.mercadopago.com.br/', qr_code: '00020126FAKE-PIX-CODE-' + id + '-SEM-VALOR', qr_code_base64: fakeQrPng(orders.size + 1).toString('base64')} : {id: method.id, type: method.type, installments: method.installments}}]}
    };
    orders.set(id, order); keys.set(key, id); deviceIds.set(id, sessionId || null);
    // A refused card: the order exists, and the answer is 402 "failed" naming the transaction and its reason.
    if (outcome[0] === 'failed') return refusal(order);
    // Like the real service, an approved card is announced by webhook a moment after the order is created.
    if (outcome[0] === 'processed' && onPaid) setTimeout(() => Promise.resolve(onPaid(id)).catch(() => {}), 120);
    return reply(201, order);
  }

  // POST /v1/orders/{id}/cancel: only an order nobody paid (created or action_required); 409 otherwise.
  const cancelKeys = new Map();
  function cancel(id, key) {
    if (!key) return error(400, 'empty_required_header', 'X-Idempotency-Key is required');
    const order = orders.get(id); if (!order) return error(404, 'order_not_found', 'order not found');
    if (cancelKeys.has(key)) return reply(200, order);
    expireIfDue(order);
    if (order.status === 'canceled') return error(409, 'order_already_canceled', 'order already canceled');
    if (!['created', 'action_required'].includes(order.status)) return error(409, 'cannot_cancel_order', 'order cannot be canceled');
    Object.assign(order, {status: 'canceled', status_detail: 'canceled_transaction'});
    Object.assign(order.transactions.payments[0], {status: 'canceled', status_detail: 'canceled_transaction'});
    cancelKeys.set(key, id);
    return reply(200, order);
  }

  // Total refund, like POST /v1/orders/{id}/refund: 201 with the refund, the same answer for a repeated key, 409 when the
  // order was already refunded or cannot be (not paid).
  const refundKeys = new Map();
  function refund(id, key) {
    if (!key) return error(400, 'empty_required_header', 'X-Idempotency-Key is required');
    const order = orders.get(id); if (!order) return error(404, 'order_not_found', 'order not found');
    if (refundKeys.has(key)) return reply(201, order);
    if (order.status === 'refunded') return error(409, 'order_already_refunded', 'order already refunded');
    if (order.status !== 'processed' || order.status_detail !== 'accredited') return error(409, 'cannot_refund_order', 'order cannot be refunded');
    const payment = order.transactions.payments[0];
    Object.assign(order, {status: 'refunded', status_detail: 'refunded'});
    Object.assign(payment, {status: 'refunded', status_detail: 'refunded'});
    order.transactions.refunds = [{id: 'REF01FAKE' + id.slice(-10), transaction_id: payment.id, amount: payment.amount, status: 'processed'}];
    refundKeys.set(key, id);
    return reply(201, order);
  }

  async function fetchImpl(url, init = {}) {
    const path = String(url).replace('https://api.mercadopago.com', '');
    if (!/^Bearer \S+/.test(init.headers?.Authorization || '')) return error(401, 'unauthorized', 'missing access token');
    if (path === '/v1/orders' && init.method === 'POST') { if (!init.headers['X-Idempotency-Key']) return error(400, 'missing_idempotency_key', 'X-Idempotency-Key is required'); return create(JSON.parse(init.body), init.headers['X-Idempotency-Key'], init.headers['X-meli-session-id']); }
    const refunding = path.match(/^\/v1\/orders\/([^/?]+)\/refund$/);
    if (refunding && init.method === 'POST') return refund(refunding[1], init.headers['X-Idempotency-Key']);
    const cancelling = path.match(/^\/v1\/orders\/([^/?]+)\/cancel$/);
    if (cancelling && init.method === 'POST') return cancel(cancelling[1], init.headers['X-Idempotency-Key']);
    // GET /v1/payment_methods: a Brazilian account's usual list (Pix, the credit cards, the Caixa virtual debit card), plus the
    // boleto and lottery ones the checkout does not offer, so the filter is exercised.
    if (path === '/v1/payment_methods' && (init.method || 'GET') === 'GET') return reply(200, [
      {id: 'pix', name: 'Pix', payment_type_id: 'bank_transfer', status: 'active', secure_thumbnail: ''},
      {id: 'visa', name: 'Visa', payment_type_id: 'credit_card', status: 'active', secure_thumbnail: ''},
      {id: 'master', name: 'Mastercard', payment_type_id: 'credit_card', status: 'active', secure_thumbnail: ''},
      {id: 'elo', name: 'Elo', payment_type_id: 'credit_card', status: 'active', secure_thumbnail: ''},
      {id: 'amex', name: 'American Express', payment_type_id: 'credit_card', status: 'active', secure_thumbnail: ''},
      {id: 'hipercard', name: 'Hipercard', payment_type_id: 'credit_card', status: 'active', secure_thumbnail: ''},
      {id: 'debelo', name: 'Cartão de débito virtual Caixa', payment_type_id: 'debit_card', status: 'active', secure_thumbnail: ''},
      {id: 'bolbradesco', name: 'Boleto', payment_type_id: 'ticket', status: 'active', secure_thumbnail: ''},
      {id: 'pec', name: 'Pagamento na lotérica', payment_type_id: 'ticket', status: 'active', secure_thumbnail: ''}
    ]);
    const found = path.match(/^\/v1\/orders\/([^/?]+)$/);
    if (found && init.method === 'GET') { const order = orders.get(found[1]); if (!order) return error(404, 'order_not_found', 'order not found'); expireIfDue(order); return reply(200, order); }
    return error(404, 'not_found', path);
  }
  function expireIfDue(order) {
    const payment = order.transactions.payments[0];
    if (order.status === 'action_required' && payment.date_of_expiration && Date.parse(payment.date_of_expiration) <= now()) { order.status = 'expired'; order.status_detail = 'expired'; payment.status = 'expired'; payment.status_detail = 'expired'; }
  }
  // "The customer paid the Pix": the order becomes processed/accredited and Mercado Pago would now call our webhook. A
  // cancelled or expired code cannot be paid any more (false), like the real one.
  async function pay(id) {
    const order = orders.get(id); if (!order) return false;
    expireIfDue(order);
    if (['canceled', 'expired', 'failed', 'refunded'].includes(order.status)) return false;
    order.status = 'processed'; order.status_detail = 'accredited'; Object.assign(order.transactions.payments[0], {status: 'processed', status_detail: 'accredited'});
    if (onPaid) await onPaid(id);
    return true;
  }
  return {fetchImpl, pay, orders, deviceIds};
}

module.exports = {createFakeMercadoPago, fakeQrPng};
