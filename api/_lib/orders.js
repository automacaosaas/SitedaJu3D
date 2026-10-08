'use strict';
// Orders: opened on the server before the charge, then updated from Mercado Pago — by the answer to the charge, by the
// webhook and by the status checks the checkout makes while a Pix waits. Whichever arrives first moves the order; the
// others find nothing left to do (atomic transitions), so an order is marked paid once and its e-mails go out once.
//
// Statuses: aguardando_pagamento → pendente (paid, waiting for Ju) → confirmado (Ju confirmed it: the NF-e is issued and the
// order is in "Expedição") → enviado (posted at the Correios: the tracking code goes in and the buyer gets the e-mail with
// it) → concluido (delivered: by itself when the Correios register the delivery, api/_lib/tracking.js, or by Ju) |
// recusado (before it is posted). Ju can step back (FROM below).
// Declining also refunds the buyer through Mercado Pago (refund); a refunded order can no longer be reopened.
// A refused card, an expired Pix or a Pix the buyer left (cancelled at Mercado Pago, api/payments/cancel.js) ends as cancelado. The order keeps a snapshot of buyer and delivery, so it survives
// the account being deleted (fiscal record).
const crypto = require('node:crypto');
const fields = require('./fields');
const {TERMS_VERSION} = require('./legal');
const {config, mailReady, sendMail} = require('./mail');
const {renderOwnerEmail, renderCustomerEmail, renderDecisionEmail} = require('./order-email');
const mp = require('./mercadopago');

const PAID = ['pendente', 'confirmado', 'enviado', 'concluido', 'recusado'];
const ADMIN_STATUSES = PAID;
// Where an order may come from, for each status Ju moves it to (the panel only offers these; the server refuses the rest).
const FROM = Object.freeze({
  pendente: ['confirmado', 'recusado'],             // back from "Pronto para envio", or a declined order reopened
  confirmado: ['pendente', 'enviado'],              // "Confirmar", or back from "Enviados" (the tracking code comes off)
  enviado: ['confirmado', 'enviado', 'concluido'],  // with the tracking code, a corrected code, or a concluded order reopened
  concluido: ['enviado'],                           // only once the tracking code is in
  recusado: ['pendente', 'confirmado']              // never after it is posted
});
const DECIDED = ['confirmado', 'enviado', 'concluido', 'recusado'];   // the steps the buyer hears about by e-mail
const INVOICED = ['confirmado', 'enviado', 'concluido'];   // the NF-e is issued when Ju confirms
const TRACKING = /^[A-Z]{2}\d{9}[A-Z]{2}$/;                // a Correios object code: AA123456785BR
// The 9th digit checks the other eight (UPU S10, the Correios' standard): a mistyped or misread number almost never
// passes. The panel checks it too (dist/admin.js), before a complete code confirms the shipment by itself.
const S10 = [8, 6, 4, 2, 3, 5, 9, 7];
function validTracking(code) {
  if (!TRACKING.test(code)) return false;
  const rest = 11 - S10.reduce((sum, weight, i) => sum + weight * Number(code[2 + i]), 0) % 11;
  return Number(code[10]) === (rest === 10 ? 0 : rest === 11 ? 5 : rest);
}
const MONEY_BACK = ['refunded', 'requested']; // refund states that make a declined order final (the money is going back)
const fail = (code, extra = {}) => Object.assign(new Error(code), {code, ...extra});
// Everything the automatic tracking saved (api/_lib/tracking.js): cleared when the code comes off or changes.
const NO_TRACKING = Object.freeze({trackingState: null, trackingEvents: null, trackingLast: null, trackingCheckedAt: null, deliveredAt: null, trackingNotices: null});
const iso = value => value ? new Date(value).toISOString() : null;
// What the panel and "Meus pedidos" show of the tracking: where the package stands and the last event, kept apart
// (trackingLast) so the panel's list never reads the whole line; every event with `all`, for the timeline. A code the
// tracking found to be another, older package's (oldCode, tracking.js): the panel sees its line and a warning, the buyer
// (`buyer`) sees nothing of it.
function trackingView(order, {all = false, buyer = false} = {}) {
  const oldCode = String(order.trackingNotices || '').split(',').includes('antigo');
  if (buyer && oldCode) return {code: order.trackingCode || null, state: null, last: null, checkedAt: null, deliveredAt: null, ...(all ? {events: []} : {})};
  const events = all && Array.isArray(order.trackingEvents) ? order.trackingEvents : [];
  return {code: order.trackingCode || null, state: order.trackingState || null, last: order.trackingLast || events[0] || null, checkedAt: iso(order.trackingCheckedAt), deliveredAt: iso(order.deliveredAt), ...(oldCode ? {oldCode} : {}), ...(all ? {events} : {})};
}
// pix | debit | card (credit). Debit is kept apart so the e-mails and the panel name it correctly.
// The Pix discount is not a column: the order keeps the list subtotal and the total charged, so it is what is missing.
const discountOf = order => Math.max(0, (order.subtotalCents || 0) + (order.shippingCents || 0) - (order.totalCents || 0));
// Whether what Mercado Pago says would leave a waiting order exactly as it is (no write needed).
const sameBase = (order, base) => ['mpOrderId', 'paymentState', 'method', 'installments'].every(f => (order[f] ?? null) === (base[f] ?? null));
const methodOf = method => method?.type === 'bank_transfer' || method?.id === 'pix' ? 'pix' : method?.type === 'debit_card' ? 'debit' : method?.id || method?.type ? 'card' : null;
// What Mercado Pago charged must be what we asked (2026-10-08): our total exactly — or, only for a credit card in 2x or more,
// a larger total, our price plus the interest of the installments the buyer chose (Mercado Pago's financing, paid by the buyer,
// never the shop's revenue). The Orders API documents total_amount as the amount asked (it must equal the payments' amount we
// send) and paid_amount as what was really paid, so the interest should stay out of the total; a total raised by it is accepted
// as well, up to a sane bound (12x at Mercado Pago's highest rates stays well under +60%). Less is never a payment of this
// order, nor a larger total on Pix, debit or 1x.
const MAX_INTEREST = 0.6;
function amountMatches(order, payment) {
  if (payment.total === order.totalCents) return true;
  const installments = Number(payment.method?.installments) || 1;
  return payment.method?.type === 'credit_card' && installments > 1 && payment.total > order.totalCents && payment.total <= Math.round(order.totalCents * (1 + MAX_INTEREST));
}

function createOrders({store, env = process.env, now = () => Date.now()}) {
  const date = () => new Date(now());
  const decrypt = blob => { try { return blob ? fields.decrypt(env, blob) : ''; } catch { return ''; } };

  // The buyer must be signed in with a complete identification: the invoice and the shipping label need it.
  async function open({customer, reference, source, priced, recipient, address, notes = '', lang = 'pt-BR', termsAccepted = false}) {
    if (!customer.firstName || !customer.lastName || !customer.cpfEnc || !customer.phoneEnc) throw fail('profile_incomplete');
    if (termsAccepted !== true) throw fail('invalid_request', {field: 'terms'});
    const company = customer.companyCnpj ? {cnpj: customer.companyCnpj, name: customer.companyName || '', stateRegistration: customer.companyIe || ''} : null;
    const draft = {
      id: crypto.randomUUID(), reference, customerId: customer.id, source, status: 'aguardando_pagamento',
      subtotalCents: priced.subtotal, shippingCents: priced.shipping, totalCents: priced.total,
      buyer: {name: `${customer.firstName} ${customer.lastName}`, email: customer.email, company},
      buyerDocEnc: customer.cpfEnc, phoneEnc: fields.encrypt(env, recipient.phone),
      shipTo: {recipient: recipient.name, ...address}, shippingInfo: priced.shippingInfo || null, notes, lang, termsVersion: TERMS_VERSION, termsAcceptedAt: date(),
      items: priced.lines.map(line => ({productId: line.productId, title: line.title, quantity: line.quantity, unitCents: line.unitCents, selection: line.selection}))
    };
    const {order, created} = await store.orders.create(draft);
    if (order.customerId !== customer.id) throw fail('conflict');
    if (created) await store.orders.addEvent(order.id, 'created', `${source} · ${priced.total}`, customer.email);
    return order;
  }

  // Applies what Mercado Pago says about an order (mp.normalizeOrder shape). Refuses anything that does not match the
  // order we opened: another reference or another amount (amountMatches) is recorded and ignored, never marked paid.
  async function applyPayment(order, payment, {actor = 'mercadopago'} = {}) {
    if (payment.reference !== order.reference || !amountMatches(order, payment)) {
      await store.orders.addEvent(order.id, 'payment_mismatch', `${payment.reference} · ${payment.total}`, actor);
      return {order, newlyPaid: false};
    }
    const base = {mpOrderId: payment.id || order.mpOrderId, paymentState: payment.state, method: methodOf(payment.method) || order.method, installments: payment.method?.installments || null};
    // Refunded (by our decline or straight in Mercado Pago's panel): record it; the status Ju chose stays as it is.
    if (payment.state === 'refunded') {
      if (order.refundState !== 'refunded') {
        await store.orders.update(order.id, {paymentState: 'refunded', refundState: 'refunded', refundedAt: date(), refundError: null});
        await store.orders.addEvent(order.id, 'refunded', 'mercadopago', actor);
      }
      return {order: await store.orders.findById(order.id), newlyPaid: false};
    }
    // The checkout asks every few seconds while a Pix waits: when Mercado Pago says nothing new, or the order is already
    // past the status a transition starts from, nothing is written and the order is not read back. Statuses only move
    // forward from these, so skipping on the copy we hold never loses a transition (the WHERE would refuse it anyway).
    let newlyPaid = false, moved = false;
    if (payment.state === 'approved') { if (!PAID.includes(order.status)) moved = newlyPaid = await store.orders.transition(order.id, ['aguardando_pagamento', 'cancelado'], {...base, status: 'pendente', paidAt: date()}); }
    else if (order.status !== 'aguardando_pagamento') { /* paid, cancelled or decided: a late pending/refused answer changes nothing */ }
    else if (['refused', 'expired', 'canceled'].includes(payment.state)) moved = await store.orders.transition(order.id, ['aguardando_pagamento'], {...base, status: 'cancelado'});
    else if (!sameBase(order, base)) moved = await store.orders.transition(order.id, ['aguardando_pagamento'], base);
    if (newlyPaid || payment.state !== order.paymentState) await store.orders.addEvent(order.id, newlyPaid ? 'paid' : 'payment', payment.state, actor);
    // the buyer paid interest on top (in the order's history: installments · interest in cents); the order keeps our price
    if (newlyPaid && payment.total > order.totalCents) await store.orders.addEvent(order.id, 'card_interest', `${payment.method.installments}x · ${payment.total - order.totalCents}`, actor);
    return {order: moved ? await store.orders.findById(order.id) : order, newlyPaid};
  }

  // What the notification e-mails need (api/_lib/order-email.js), built from our own record.
  // Who the invoice is for: the buyer's name and CPF (masked: the full number never goes by e-mail; the panel shows it on
  // request), or the company's name, CNPJ (public data) and state registration.
  function invoice(order) {
    const cpf = decrypt(order.buyerDocEnc), company = order.buyer?.company;
    return {
      name: order.buyer?.name || '', cpf: cpf ? fields.maskCpf(cpf) : '',
      company: company?.cnpj ? {name: company.name || '', cnpj: fields.formatCnpj(company.cnpj), stateRegistration: company.stateRegistration || ''} : null
    };
  }

  function summary(order) {
    return {
      id: order.mpOrderId || '', reference: order.reference, lang: order.lang, notes: order.notes, items: order.items, shipping: order.shippingCents, discount: discountOf(order), shippingInfo: order.shippingInfo || null, total: order.totalCents,
      invoice: invoice(order),
      customer: {name: order.shipTo?.recipient || order.buyer?.name || '', email: order.buyer?.email || '', phone: decrypt(order.phoneEnc)},
      address: {cep: order.shipTo?.cep || '', street: order.shipTo?.street || '', number: order.shipTo?.number || '', district: order.shipTo?.district || '', city: order.shipTo?.city || '', state: order.shipTo?.state || '', complement: order.shipTo?.complement || ''},
      method: {id: order.method === 'pix' ? 'pix' : order.method || '', type: order.method === 'pix' ? 'bank_transfer' : order.method === 'debit' ? 'debit_card' : 'credit_card', installments: order.installments || 1}, paid: PAID.includes(order.status),
      trackingCode: order.trackingCode || null
    };
  }

  // Sends "pedido pago" to Ju and the receipt to the buyer, each once. A failure leaves the mark empty, so the next
  // webhook or status check tries again; Resend's idempotency key keeps a retry from arriving twice.
  async function notifyPaid(order, {fetchImpl = globalThis.fetch, outbox, test = order.source !== 'live'} = {}) {
    if (!PAID.includes(order.status)) return {owner: false, customer: false};
    const mail = config(env), ownerEmail = String(env.ORDER_NOTIFY_EMAIL || '').trim().toLowerCase();
    if (!mailReady(mail)) return {owner: false, customer: false};
    const data = summary(order), sent = {owner: Boolean(order.ownerNotifiedAt), customer: Boolean(order.customerNotifiedAt)};
    const deliver = (to, message, key, replyTo) => sendMail({settings: mail, to, replyTo, subject: message.subject, html: message.html, text: message.text, idempotencyKey: key, fetchImpl, outbox: outbox && (m => outbox({...m, kind: key.split('-')[1], reference: order.reference}))});
    if (!sent.owner && ownerEmail) {
      // "Responder" on Ju's notice writes to the buyer, as on a contact message (api/_lib/contact.js).
      try { await deliver(ownerEmail, renderOwnerEmail({summary: data, test, assetUrl: mail.assetUrl}), `order-owner-${order.id}`, data.customer.email); await store.orders.update(order.id, {ownerNotifiedAt: date()}); sent.owner = true; }
      catch (error) { console.error(`orders: e-mail to Ju failed for ${order.reference} —`, error.status || '', error.message); }
    }
    if (!sent.customer && data.customer.email) {
      try { await deliver(data.customer.email, renderCustomerEmail({summary: data, lang: order.lang, test, assetUrl: mail.assetUrl}), `order-customer-${order.id}`); await store.orders.update(order.id, {customerNotifiedAt: date()}); sent.customer = true; }
      catch (error) { console.error(`orders: receipt to the buyer failed for ${order.reference} —`, error.status || '', error.message); }
    }
    return sent;
  }

  // notifyPaid for a request that answers the buyer (checkout and status check): the answer does not wait for Resend.
  // The returned promise never rejects, so nothing is left unhandled; whatever fails is logged and, with the mark still
  // empty, retried by the next status check or webhook (the idempotency key keeps two sends in flight from doubling).
  function notifyPaidLater(order, options) {
    return notifyPaid(order, options).catch(error => {
      console.error(`orders: paid e-mails for ${order.reference} could not be sent —`, error.status || '', error.code || '', error.message);
      return {owner: false, customer: false};
    });
  }

  // "Meus pedidos": what the buyer sees of their own orders. No payment ids, no internal notes.
  function customerView(order) {
    return {
      reference: order.reference, status: order.status, paymentState: order.paymentState, method: order.method,
      createdAt: new Date(order.createdAt).toISOString(), paidAt: order.paidAt ? new Date(order.paidAt).toISOString() : null,
      subtotalCents: order.subtotalCents, shippingCents: order.shippingCents, discountCents: discountOf(order), totalCents: order.totalCents, test: order.source !== 'live', refunded: order.refundState === 'refunded',
      trackingCode: ['enviado', 'concluido'].includes(order.status) ? order.trackingCode || null : null,
      tracking: ['enviado', 'concluido'].includes(order.status) && order.trackingCode ? trackingView(order, {buyer: true}) : null,
      items: order.items.map(i => ({productId: i.productId, title: i.title, quantity: i.quantity, unitCents: i.unitCents, selection: i.selection}))
    };
  }

  // Ju's panel: everything needed to produce and ship. The CPF only masked; the full number stays on the server for the invoice.
  function adminView(order) {
    const cpf = decrypt(order.buyerDocEnc);
    return {
      id: order.id, reference: order.reference, source: order.source, status: order.status, method: order.method || 'pix', installments: order.installments,
      items: order.items, subtotalCents: order.subtotalCents, shippingCents: order.shippingCents, discountCents: discountOf(order), totalCents: order.totalCents,
      customer: {name: order.shipTo?.recipient || order.buyer?.name || '', email: order.buyer?.email || '', phone: decrypt(order.phoneEnc)},
      buyer: {name: order.buyer?.name || '', cpf: cpf ? fields.maskCpf(cpf) : '', company: order.buyer?.company || null},
      address: summary(order).address, notes: order.notes || '',
      shipping: order.shippingInfo ? {service: order.shippingInfo.service, label: order.shippingInfo.label, days: order.shippingInfo.days, deliveryDays: order.shippingInfo.deliveryDays, chargedCents: order.shippingCents, costCents: order.shippingInfo.costCents, volumes: order.shippingInfo.volumes} : null,
      createdAt: new Date(order.createdAt).toISOString(), paidAt: order.paidAt ? new Date(order.paidAt).toISOString() : null,
      decidedAt: order.decidedAt ? new Date(order.decidedAt).toISOString() : null, declineReason: order.declineReason || '',
      trackingCode: order.trackingCode || null, shippedAt: order.shippedAt ? new Date(order.shippedAt).toISOString() : null,
      tracking: order.trackingCode ? trackingView(order) : null,
      refund: {state: order.refundState || null, at: order.refundedAt ? new Date(order.refundedAt).toISOString() : null, error: order.refundError || null}
    };
  }

  // Ju moves a paid order one step along FROM (unpaid ones are not hers to move). "enviado" takes the Correios tracking
  // code (spaces and lower case are fine); a corrected code keeps the day it was first posted. Going back to "confirmado"
  // or "pendente" takes the code off. The WHERE of the transition holds the status read here, so two clicks at once move
  // the order once.
  async function setStatus(id, status, {reason = '', trackingCode = '', actor}) {
    if (!ADMIN_STATUSES.includes(status)) throw fail('invalid_request', {field: 'status'});
    const current = await store.orders.findById(id);
    if (!current || !PAID.includes(current.status)) throw fail('not_found');
    if (status !== 'recusado' && MONEY_BACK.includes(current.refundState)) throw fail('refunded');   // the money is on its way back
    if (!FROM[status].includes(current.status)) throw fail('invalid_transition');
    const clean = String(reason || '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').trim().slice(0, 300);
    const patch = {status, decidedAt: status === 'pendente' ? null : date(), declineReason: status === 'recusado' ? clean : null};
    let code = null;
    if (status === 'enviado' && current.status !== 'concluido') {
      code = String(trackingCode || '').replace(/\s+/g, '').toUpperCase();
      if (!validTracking(code)) throw fail('invalid_request', {field: 'trackingCode'});
      Object.assign(patch, {trackingCode: code, shippedAt: current.status === 'enviado' && current.shippedAt ? current.shippedAt : date()});
      if (code !== current.trackingCode) Object.assign(patch, NO_TRACKING);   // a new code: what was tracked for the old one goes
    }
    if (['pendente', 'confirmado', 'recusado'].includes(status)) Object.assign(patch, {trackingCode: null, shippedAt: null}, NO_TRACKING);
    if (status === 'enviado' && current.status === 'concluido') {
      // Reopened (the buyer says it never arrived, say): the tracking stays, but a delivery the Correios registered before
      // now no longer closes it by itself (tracking.js), and a new delivery e-mails the buyer again.
      const kept = String(current.trackingNotices || '').split(',').filter(n => n && n !== 'entregue' && !n.startsWith('reaberto:'));
      patch.trackingNotices = [...kept, `reaberto:${Number(now()).toString(36)}`].join(',').slice(0, 255);
    }
    const moved = await store.orders.transition(id, [current.status], patch);
    if (!moved) throw fail('invalid_transition');
    await store.orders.addEvent(id, `status:${status}`, code || clean || null, actor);
    return store.orders.findById(id);
  }

  // Tells the buyer each step: confirmed (confirmado), posted with the tracking code (enviado, with a button to "Meus
  // pedidos"), delivered (concluido) or declined (recusado). Going back sends nothing, and the decline reason never leaves
  // the panel. One e-mail per decision: the key carries the decision time, so a retry cannot double it, while a new
  // decision after reopening is a new e-mail. The status is already saved either way.
  async function notifyDecision(order, {fetchImpl = globalThis.fetch, outbox, test = order.source !== 'live'} = {}) {
    if (!DECIDED.includes(order.status)) return false;
    const mail = config(env), data = summary(order);
    if (!mailReady(mail) || !data.customer.email) return false;
    const message = renderDecisionEmail({summary: data, status: order.status, refund: order.refundState, lang: order.lang, test, assetUrl: mail.assetUrl, ordersUrl: `${mail.siteUrl}/conta.html#pedidos`});
    const decided = order.decidedAt ? new Date(order.decidedAt).getTime() : 0;
    try {
      await sendMail({settings: mail, to: data.customer.email, subject: message.subject, html: message.html, text: message.text, idempotencyKey: `order-${order.status}-${order.id}-${decided}`, fetchImpl, outbox: outbox && (m => outbox({...m, kind: order.status, reference: order.reference}))});
      return true;
    } catch (error) { console.error(`orders: decision e-mail (${order.status}) failed for ${order.reference} —`, error.status || '', error.message); return false; }
  }

  // A tracking notice that is not a step of the order: "saiu para entrega" (api/_lib/tracking.js). Once per package (the key
  // carries the day it was posted).
  async function notifyTracking(order, kind, {fetchImpl = globalThis.fetch, outbox, test = order.source !== 'live'} = {}) {
    const mail = config(env), data = summary(order);
    if (kind !== 'saiu' || !mailReady(mail) || !data.customer.email) return false;
    const message = renderDecisionEmail({summary: data, status: kind, lang: order.lang, test, assetUrl: mail.assetUrl, ordersUrl: `${mail.siteUrl}/conta.html#pedidos`});
    const shipped = order.shippedAt ? new Date(order.shippedAt).getTime() : 0;
    try {
      await sendMail({settings: mail, to: data.customer.email, subject: message.subject, html: message.html, text: message.text, idempotencyKey: `order-${kind}-${order.id}-${shipped}`, fetchImpl, outbox: outbox && (m => outbox({...m, kind, reference: order.reference}))});
      return true;
    } catch (error) { console.error(`orders: tracking e-mail (${kind}) failed for ${order.reference} —`, error.status || '', error.message); return false; }
  }

  // Ju declined a paid order: ask Mercado Pago for the whole amount back. Each attempt has its own idempotency key (the
  // attempt number), so a double click or a lost answer cannot refund twice, and a conflict ("already refunded / in
  // process") is settled by reading the order back. Never throws: the result lands on the order for the panel.
  async function refund(order, {fetchImpl = globalThis.fetch, actor = 'painel'} = {}) {
    if (order.refundState === 'refunded') return order;
    const settings = mp.settings(env);
    const save = async (state, extra = {}) => { await store.orders.update(order.id, {refundState: state, ...extra}); return store.orders.findById(order.id); };
    const failed = async code => { await store.orders.addEvent(order.id, 'refund_failed', String(code).slice(0, 120), actor); return save('failed', {refundError: String(code).slice(0, 120)}); };
    if (settings.mode === 'off') return failed('payments_off');
    if (!order.mpOrderId) return failed('no_mp_order');
    if (order.source !== settings.mode) return failed('mode_mismatch');   // a test order cannot be refunded with live keys, nor the reverse
    const attempt = (await store.orders.events(order.id)).filter(e => e.kind === 'refund_requested').length + 1;
    await store.orders.addEvent(order.id, 'refund_requested', String(attempt), actor);
    let outcome;
    try {
      outcome = mp.refundOutcome(await mp.refundOrder({settings, fetchImpl, id: order.mpOrderId, idempotencyKey: `refund-${order.id}-${attempt}`}));
      if (outcome.state === 'none') outcome = {...outcome, state: 'requested'};   // accepted (201), not settled yet
    } catch (error) {
      if (error.status !== 409 && !mp.REFUND_CONFLICTS.has(error.code)) return failed(error.code || (error.status ? `http_${error.status}` : 'network'));
      try { outcome = mp.refundOutcome(await mp.getOrder({settings, fetchImpl, id: order.mpOrderId})); }
      catch (lookup) { return failed(lookup.code || error.code || 'lookup_failed'); }
      if (outcome.state === 'none') return failed(error.code || 'conflict');
    }
    if (outcome.state === 'failed') return failed('refund_rejected');
    await store.orders.addEvent(order.id, outcome.state === 'refunded' ? 'refunded' : 'refund_pending', outcome.id || null, actor);
    return save(outcome.state, {refundId: outcome.id || null, refundedAt: outcome.state === 'refunded' ? date() : null, refundError: null});
  }

  // "Conferir estorno" / "Tentar estorno de novo" in the panel: a refund still being processed is read back from Mercado
  // Pago (never requested twice); a failed one is tried again.
  async function retryRefund(order, {fetchImpl = globalThis.fetch, actor = 'painel'} = {}) {
    if (order.status !== 'recusado') throw fail('not_found');
    if (order.refundState !== 'requested') return refund(order, {fetchImpl, actor});
    try {
      const outcome = mp.refundOutcome(await mp.getOrder({settings: mp.settings(env), fetchImpl, id: order.mpOrderId}));
      if (outcome.state === 'refunded') {
        await store.orders.addEvent(order.id, 'refunded', outcome.id || null, actor);
        await store.orders.update(order.id, {refundState: 'refunded', refundId: outcome.id || order.refundId, refundedAt: date(), refundError: null});
      } else if (outcome.state === 'failed') await store.orders.update(order.id, {refundState: 'failed', refundError: 'refund_rejected'});
    } catch (error) { console.error(`orders: could not check the refund of ${order.reference} —`, error.status || '', error.message); }
    return store.orders.findById(order.id);
  }

  return {open, applyPayment, notifyPaid, notifyPaidLater, notifyDecision, notifyTracking, refund, retryRefund, summary, customerView, adminView, setStatus, PAID, ADMIN_STATUSES};
}

module.exports = {createOrders, trackingView, validTracking, PAID, ADMIN_STATUSES, FROM, INVOICED, TRACKING};
