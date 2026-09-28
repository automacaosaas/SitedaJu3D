'use strict';
// Orders: opened on the server before the charge, then updated from Mercado Pago — by the answer to the charge, by the
// webhook and by the status checks the checkout makes while a Pix waits. Whichever arrives first moves the order; the
// others find nothing left to do (atomic transitions), so an order is marked paid once and its e-mails go out once.
//
// Statuses: aguardando_pagamento → pendente (paid, Ju produces it) → concluido | recusado (Ju decides; can reopen).
// A refused card or an expired Pix ends as cancelado. The order keeps a snapshot of buyer and delivery, so it survives
// the account being deleted (fiscal record).
const crypto = require('node:crypto');
const fields = require('./fields');
const {TERMS_VERSION} = require('./legal');
const {config, mailReady, sendMail} = require('./mail');
const {renderOwnerEmail, renderCustomerEmail, renderDecisionEmail} = require('./order-email');

const PAID = ['pendente', 'concluido', 'recusado'];
const ADMIN_STATUSES = ['pendente', 'concluido', 'recusado'];
const DECIDED = ['concluido', 'recusado'];   // Ju's decisions that the buyer hears about by e-mail
const fail = (code, extra = {}) => Object.assign(new Error(code), {code, ...extra});
// pix | debit | card (credit). Debit is kept apart so the e-mails and the panel name it correctly.
const methodOf = method => method?.type === 'bank_transfer' || method?.id === 'pix' ? 'pix' : method?.type === 'debit_card' ? 'debit' : method?.id || method?.type ? 'card' : null;

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
      shipTo: {recipient: recipient.name, ...address}, notes, lang, termsVersion: TERMS_VERSION, termsAcceptedAt: date(),
      items: priced.lines.map(line => ({productId: line.productId, title: line.title, quantity: line.quantity, unitCents: line.unitCents, selection: line.selection}))
    };
    const {order, created} = await store.orders.create(draft);
    if (order.customerId !== customer.id) throw fail('conflict');
    if (created) await store.orders.addEvent(order.id, 'created', `${source} · ${priced.total}`, customer.email);
    return order;
  }

  // Applies what Mercado Pago says about an order (mp.normalizeOrder shape). Refuses anything that does not match the
  // order we opened: another reference or another amount is recorded and ignored, never marked paid.
  async function applyPayment(order, payment, {actor = 'mercadopago'} = {}) {
    if (payment.reference !== order.reference || payment.total !== order.totalCents) {
      await store.orders.addEvent(order.id, 'payment_mismatch', `${payment.reference} · ${payment.total}`, actor);
      return {order, newlyPaid: false};
    }
    const base = {mpOrderId: payment.id || order.mpOrderId, paymentState: payment.state, method: methodOf(payment.method) || order.method, installments: payment.method?.installments || null};
    let newlyPaid = false;
    if (payment.state === 'approved') newlyPaid = await store.orders.transition(order.id, ['aguardando_pagamento', 'cancelado'], {...base, status: 'pendente', paidAt: date()});
    else if (payment.state === 'refused' || payment.state === 'expired') await store.orders.transition(order.id, ['aguardando_pagamento'], {...base, status: 'cancelado'});
    else await store.orders.transition(order.id, ['aguardando_pagamento'], base);
    if (newlyPaid || payment.state !== order.paymentState) await store.orders.addEvent(order.id, newlyPaid ? 'paid' : 'payment', payment.state, actor);
    return {order: await store.orders.findById(order.id), newlyPaid};
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
      id: order.mpOrderId || '', reference: order.reference, lang: order.lang, notes: order.notes, items: order.items, shipping: order.shippingCents, total: order.totalCents,
      invoice: invoice(order),
      customer: {name: order.shipTo?.recipient || order.buyer?.name || '', email: order.buyer?.email || '', phone: decrypt(order.phoneEnc)},
      address: {cep: order.shipTo?.cep || '', street: order.shipTo?.street || '', number: order.shipTo?.number || '', district: order.shipTo?.district || '', city: order.shipTo?.city || '', state: order.shipTo?.state || '', complement: order.shipTo?.complement || ''},
      method: {id: order.method === 'pix' ? 'pix' : order.method || '', type: order.method === 'pix' ? 'bank_transfer' : order.method === 'debit' ? 'debit_card' : 'credit_card', installments: order.installments || 1}, paid: PAID.includes(order.status)
    };
  }

  // Sends "pedido pago" to Ju and the receipt to the buyer, each once. A failure leaves the mark empty, so the next
  // webhook or status check tries again; Resend's idempotency key keeps a retry from arriving twice.
  async function notifyPaid(order, {fetchImpl = globalThis.fetch, outbox, test = order.source !== 'live'} = {}) {
    if (!PAID.includes(order.status)) return {owner: false, customer: false};
    const mail = config(env), ownerEmail = String(env.ORDER_NOTIFY_EMAIL || '').trim().toLowerCase();
    if (!mailReady(mail)) return {owner: false, customer: false};
    const data = summary(order), sent = {owner: Boolean(order.ownerNotifiedAt), customer: Boolean(order.customerNotifiedAt)};
    const deliver = (to, message, key) => sendMail({settings: mail, to, subject: message.subject, html: message.html, text: message.text, idempotencyKey: key, fetchImpl, outbox: outbox && (m => outbox({...m, kind: key.split('-')[1], reference: order.reference}))});
    if (!sent.owner && ownerEmail) {
      try { await deliver(ownerEmail, renderOwnerEmail({summary: data, test, assetUrl: mail.assetUrl}), `order-owner-${order.id}`); await store.orders.update(order.id, {ownerNotifiedAt: date()}); sent.owner = true; }
      catch (error) { console.error(`orders: e-mail to Ju failed for ${order.reference} —`, error.status || '', error.message); }
    }
    if (!sent.customer && data.customer.email) {
      try { await deliver(data.customer.email, renderCustomerEmail({summary: data, lang: order.lang, test, assetUrl: mail.assetUrl}), `order-customer-${order.id}`); await store.orders.update(order.id, {customerNotifiedAt: date()}); sent.customer = true; }
      catch (error) { console.error(`orders: receipt to the buyer failed for ${order.reference} —`, error.status || '', error.message); }
    }
    return sent;
  }

  // "Meus pedidos": what the buyer sees of their own orders. No payment ids, no internal notes.
  function customerView(order) {
    return {
      reference: order.reference, status: order.status, paymentState: order.paymentState, method: order.method,
      createdAt: new Date(order.createdAt).toISOString(), paidAt: order.paidAt ? new Date(order.paidAt).toISOString() : null,
      subtotalCents: order.subtotalCents, shippingCents: order.shippingCents, totalCents: order.totalCents, test: order.source !== 'live',
      items: order.items.map(i => ({productId: i.productId, title: i.title, quantity: i.quantity, unitCents: i.unitCents, selection: i.selection}))
    };
  }

  // Ju's panel: everything needed to produce and ship. The CPF only masked; the full number stays on the server for the invoice.
  function adminView(order) {
    const cpf = decrypt(order.buyerDocEnc);
    return {
      id: order.id, reference: order.reference, source: order.source, status: order.status, method: order.method || 'pix', installments: order.installments,
      items: order.items, subtotalCents: order.subtotalCents, shippingCents: order.shippingCents, totalCents: order.totalCents,
      customer: {name: order.shipTo?.recipient || order.buyer?.name || '', email: order.buyer?.email || '', phone: decrypt(order.phoneEnc)},
      buyer: {name: order.buyer?.name || '', cpf: cpf ? fields.maskCpf(cpf) : '', company: order.buyer?.company || null},
      address: summary(order).address, notes: order.notes || '',
      createdAt: new Date(order.createdAt).toISOString(), paidAt: order.paidAt ? new Date(order.paidAt).toISOString() : null,
      decidedAt: order.decidedAt ? new Date(order.decidedAt).toISOString() : null, declineReason: order.declineReason || ''
    };
  }

  // Ju moves paid orders between pendente, concluido and recusado (reopening is allowed); unpaid ones are not hers to move.
  async function setStatus(id, status, {reason = '', actor}) {
    if (!ADMIN_STATUSES.includes(status)) throw fail('invalid_request', {field: 'status'});
    const clean = String(reason || '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').trim().slice(0, 300);
    const moved = await store.orders.transition(id, ADMIN_STATUSES, {status, decidedAt: status === 'pendente' ? null : date(), declineReason: status === 'recusado' ? clean : null});
    if (!moved) throw fail('not_found');
    await store.orders.addEvent(id, `status:${status}`, clean || null, actor);
    return store.orders.findById(id);
  }

  // Tells the buyer what Ju decided in the panel: confirmed (concluido) or declined (recusado). Reopening sends nothing,
  // and the decline reason never leaves the panel. One e-mail per decision: the key carries the decision time, so a retry
  // cannot double it, while a new decision after reopening is a new e-mail. The status is already saved either way.
  async function notifyDecision(order, {fetchImpl = globalThis.fetch, outbox, test = order.source !== 'live'} = {}) {
    if (!DECIDED.includes(order.status)) return false;
    const mail = config(env), data = summary(order);
    if (!mailReady(mail) || !data.customer.email) return false;
    const message = renderDecisionEmail({summary: data, status: order.status, lang: order.lang, test, assetUrl: mail.assetUrl});
    const decided = order.decidedAt ? new Date(order.decidedAt).getTime() : 0;
    try {
      await sendMail({settings: mail, to: data.customer.email, subject: message.subject, html: message.html, text: message.text, idempotencyKey: `order-${order.status}-${order.id}-${decided}`, fetchImpl, outbox: outbox && (m => outbox({...m, kind: order.status, reference: order.reference}))});
      return true;
    } catch (error) { console.error(`orders: decision e-mail (${order.status}) failed for ${order.reference} —`, error.status || '', error.message); return false; }
  }

  return {open, applyPayment, notifyPaid, notifyDecision, summary, customerView, adminView, setStatus, PAID, ADMIN_STATUSES};
}

module.exports = {createOrders, PAID, ADMIN_STATUSES};
