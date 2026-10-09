// The two stores (memory and MySQL) must behave the same. Always runs against the memory store; runs against MySQL too
// when TEST_DB_HOST, TEST_DB_NAME, TEST_DB_USER and TEST_DB_PASSWORD point to a disposable database (it applies the
// migrations and writes rows with random e-mails). Without them the MySQL part is reported as skipped.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {createMemoryStore} = require('../api/_lib/store-memory.js');

async function contract(store, label) {
  const id = crypto.randomUUID(), email = `contrato-${id.slice(0, 8)}@exemplo.com`;
  const at = new Date(Date.UTC(2026, 8, 28, 12, 0, 0, 0));
  const created = await store.customers.create({id, email, emailVerifiedAt: at, displayName: 'Contrato', passwordHash: 'scrypt$x', marketingOptIn: true, marketingConsentAt: at});
  assert.equal(created.email, email, `${label}: create returns the row`);
  assert.equal(created.marketingOptIn, true, `${label}: booleans come back as booleans`);
  assert.equal(new Date(created.emailVerifiedAt).getTime(), at.getTime(), `${label}: dates keep milliseconds (UTC)`);
  await assert.rejects(store.customers.create({id: crypto.randomUUID(), email}), e => e.code === 'account_exists', `${label}: one account per e-mail`);
  assert.equal((await store.customers.findByEmail(email)).id, id);
  assert.equal(await store.customers.findByEmail(`outro-${email}`), null);

  const index = crypto.randomBytes(32), cpfEnc = crypto.randomBytes(40);
  const updated = await store.customers.update(id, {firstName: 'Ana', lastName: 'Lima', cpfEnc, cpfIndex: index, companyCnpj: '12ABC34501DE35', companyIe: 'ISENTO'});
  assert.equal(updated.firstName, 'Ana');
  assert(Buffer.from(updated.cpfEnc).equals(cpfEnc), `${label}: binary fields round-trip`);
  assert.equal((await store.customers.findByCpfIndex(index)).id, id);
  const other = crypto.randomUUID();
  await store.customers.create({id: other, email: `b-${email}`});
  await assert.rejects(store.customers.update(other, {cpfIndex: index}), e => e.code === 'cpf_in_use', `${label}: one account per CPF`);

  const tokenHash = crypto.randomBytes(32), expiresAt = new Date(at.getTime() + 3600000);
  await store.sessions.create({tokenHash, customerId: id, expiresAt, ip: '1.1.1.1', userAgent: 'teste'});
  const session = await store.sessions.find(tokenHash);
  assert.equal(session.customerId, id);
  assert.equal(session.revokedAt, null);
  await store.sessions.touch(tokenHash, new Date(expiresAt.getTime() + 1000), at);
  assert.equal(new Date((await store.sessions.find(tokenHash)).expiresAt).getTime(), expiresAt.getTime() + 1000);
  await store.sessions.revokeAllFor(id, at);
  assert.ok((await store.sessions.find(tokenHash)).revokedAt, `${label}: revoke all`);

  // Google / Apple identities: one row per provider account, several per customer, gone with the customer.
  const subject = `sub-${id.slice(0, 8)}`;
  assert.equal(await store.identities.find('google', subject), null);
  const identity = await store.identities.create({provider: 'google', subject, customerId: id, email, privateEmail: false, createdAt: at, lastLoginAt: at});
  assert.deepEqual([identity.provider, identity.subject, identity.customerId, identity.email, identity.privateEmail], ['google', subject, id, email, false], `${label}: identity row`);
  await assert.rejects(store.identities.create({provider: 'google', subject, customerId: other}), e => e.code === 'identity_exists', `${label}: one row per provider account`);
  await store.identities.create({provider: 'apple', subject, customerId: id, email: `x${id.slice(0, 6)}@privaterelay.appleid.com`, privateEmail: true, createdAt: new Date(at.getTime() + 1000)});
  assert.deepEqual((await store.identities.listByCustomer(id)).map(i => [i.provider, i.privateEmail]), [['google', false], ['apple', true]], `${label}: both providers, oldest first`);
  const lastSeen = new Date(at.getTime() + 5000);
  assert.equal(await store.identities.touch('google', subject, {at: lastSeen, email: null}), true);
  const touched = await store.identities.find('google', subject);
  assert.equal(new Date(touched.lastLoginAt).getTime(), lastSeen.getTime(), `${label}: last sign-in`);
  assert.equal(touched.email, email, `${label}: touch without an e-mail keeps the one saved`);
  assert.equal(await store.identities.remove('apple', subject), true);
  assert.equal(await store.identities.find('apple', subject), null);
  const withPhoto = await store.customers.update(id, {avatarUrl: 'https://lh3.googleusercontent.com/a/x=s96-c'});
  assert.equal(withPhoto.avatarUrl, 'https://lh3.googleusercontent.com/a/x=s96-c', `${label}: profile photo`);

  const challengeId = crypto.randomUUID(), codeHash = crypto.randomBytes(32);
  await store.challenges.create({id: challengeId, email, purpose: 'access', codeHash, expiresAt});
  assert.equal((await store.challenges.recordAttempt(challengeId)), 1);
  assert.equal((await store.challenges.recordAttempt(challengeId)), 2);
  const grantHash = crypto.randomBytes(32);
  await store.challenges.markVerified(challengeId, grantHash, expiresAt, at);
  const byGrant = await store.challenges.findByGrant(grantHash);
  assert.equal(byGrant.id, challengeId);
  assert(Buffer.from(byGrant.codeHash).equals(codeHash));
  assert.equal(await store.challenges.markUsed(challengeId, at), true, `${label}: first use wins`);
  assert.equal(await store.challenges.markUsed(challengeId, at), false, `${label}: second use loses`);

  const bucket = `contrato:${id}`, t = at.getTime();
  for (let i = 0; i < 3; i++) assert.equal((await store.rateLimit(bucket, 3, 60000, t)).ok, true);
  const blocked = await store.rateLimit(bucket, 3, 60000, t);
  assert.equal(blocked.ok, false, `${label}: fourth hit in the window is refused`);
  assert(blocked.retryAfter > 0 && blocked.retryAfter <= 60);
  assert.equal((await store.rateLimit(bucket, 3, 60000, t + 60000)).ok, true, `${label}: next window starts fresh`);

  // Orders: created once per reference, items in order, atomic status transitions, lists per customer and per status.
  const orderId = crypto.randomUUID(), reference = `JU-${id.slice(0, 8).toUpperCase()}`;
  const draft = {
    id: orderId, reference, customerId: id, source: 'test', status: 'aguardando_pagamento', subtotalCents: 12900, shippingCents: 1800, totalCents: 14700,
    buyer: {name: 'Ana Lima', email, company: null}, buyerDocEnc: cpfEnc, phoneEnc: crypto.randomBytes(40), shipTo: {recipient: 'Ana Lima', cep: '01001000', street: 'Praça da Sé', number: '1', district: 'Sé', city: 'São Paulo', state: 'SP', complement: ''},
    notes: 'Escrever "Ana" na base', lang: 'pt-BR', termsVersion: '2026-09-28', termsAcceptedAt: new Date(),
    items: [{productId: 'borboletoscopio', title: 'Borboletoscópio', quantity: 1, unitCents: 12900, selection: {body: 'pink', details: 'yellow'}}, {productId: 'aviaoscopia', title: 'Aviãoscopia', quantity: 2, unitCents: 15900, selection: {body: 'blue', details: 'red', engines: 'yellow'}}]
  };
  const first = await store.orders.create(draft);
  assert.equal(first.created, true);
  assert.equal(first.order.reference, reference);
  assert.equal(first.order.termsVersion, '2026-09-28', `${label}: the order keeps the accepted terms version`); assert(first.order.termsAcceptedAt);
  assert.deepEqual(first.order.shipTo, draft.shipTo, `${label}: address snapshot round-trips`);
  assert.deepEqual(first.order.buyer, draft.buyer);
  assert.deepEqual(first.order.items.map(i => [i.productId, i.quantity, i.unitCents, i.selection]), draft.items.map(i => [i.productId, i.quantity, i.unitCents, i.selection]), `${label}: items keep order and colors`);
  assert(Buffer.from(first.order.phoneEnc).equals(draft.phoneEnc));
  const again = await store.orders.create({...draft, id: crypto.randomUUID()});
  assert.equal(again.created, false, `${label}: a retried attempt reuses the order`);
  assert.equal(again.order.id, orderId);
  await store.orders.update(orderId, {mpOrderId: `ORD${id.slice(0, 8).toUpperCase()}`, paymentState: 'pending_pix', method: 'pix'});
  assert.equal((await store.orders.findByMpId(`ORD${id.slice(0, 8).toUpperCase()}`)).id, orderId);
  const paidAt = new Date(t);
  assert.equal(await store.orders.transition(orderId, ['aguardando_pagamento'], {status: 'pendente', paymentState: 'approved', paidAt}), true, `${label}: first transition wins`);
  assert.equal(await store.orders.transition(orderId, ['aguardando_pagamento'], {status: 'pendente', paymentState: 'approved', paidAt}), false, `${label}: a repeated notice changes nothing`);
  const paid = await store.orders.findByReference(reference);
  assert.equal(paid.status, 'pendente');
  assert.equal(new Date(paid.paidAt).getTime(), paidAt.getTime());
  assert.deepEqual([paid.trackingCode, paid.shippedAt], [null, null], `${label}: no tracking code before it is posted`);
  const shippedAt = new Date(Date.UTC(2026, 9, 6, 15, 30));
  assert.equal(await store.orders.transition(orderId, ['pendente'], {status: 'confirmado'}), true);
  assert.equal(await store.orders.transition(orderId, ['confirmado'], {status: 'enviado', trackingCode: 'AA123456789BR', shippedAt}), true);
  const posted = await store.orders.findById(orderId);
  assert.deepEqual([posted.status, posted.trackingCode, new Date(posted.shippedAt).getTime()], ['enviado', 'AA123456789BR', shippedAt.getTime()], `${label}: the tracking code and the day it was posted (010_envio.sql)`);
  assert.equal(await store.orders.transition(orderId, ['enviado'], {status: 'pendente', trackingCode: null, shippedAt: null}), true);
  await store.orders.addEvent(orderId, 'paid', 'aprovado', 'mercadopago');
  assert.deepEqual((await store.orders.events(orderId)).map(e => [e.kind, e.actor]), [['paid', 'mercadopago']]);
  assert.deepEqual((await store.orders.listByCustomer(id)).map(o => o.id), [orderId]);
  assert((await store.orders.list({statuses: ['pendente']})).some(o => o.id === orderId));
  assert(!(await store.orders.list({statuses: ['concluido']})).some(o => o.id === orderId));
  // Fluxo de caixa: the paid order with only what the cash flow shows, the pieces in their order.
  const forCash = (await store.orders.listForCash({statuses: ['pendente']})).find(o => o.id === orderId);
  assert.deepEqual(forCash, {id: orderId, reference, source: 'test', totalCents: 14700, paidAt: forCash.paidAt, refundState: null, refundedAt: null, decidedAt: null, items: [{title: 'Borboletoscópio', quantity: 1}, {title: 'Aviãoscopia', quantity: 2}]}, `${label}: a paid order for the cash flow`);
  assert.equal(new Date(forCash.paidAt).getTime(), paidAt.getTime());
  assert(!(await store.orders.listForCash({statuses: ['concluido']})).some(o => o.id === orderId));
  // The balance summed by the store (other rows may exist: only the difference this order makes is checked).
  const cashBalance = before => store.cashBalance({statuses: ['pendente'], refundStates: ['refunded'], before, until: '2000-01-01'});
  assert.equal(await cashBalance(new Date(t + 1)) - await cashBalance(new Date(t)), 0, `${label}: an order paid in Mercado Pago's test mode is no money`);
  await store.orders.create({...draft, id: crypto.randomUUID(), reference: `JU-L${id.slice(0, 8).toUpperCase()}`, customerId: null, source: 'live', status: 'pendente', paidAt: new Date(t + 10)});
  assert.equal(await cashBalance(new Date(t + 11)) - await cashBalance(new Date(t + 10)), 14700, `${label}: a real paid order counts from the instant it was paid`);

  // Painel: a page of paid orders, newest first (ties by id), with what the panel shows; the next page starts right
  // below the last order of the previous one. Far in the future, so rows from earlier runs sit below these.
  const top = new Date(Date.now() + 100 * 365 * 86400e3), later = [crypto.randomUUID(), crypto.randomUUID()].sort().reverse(), older = crypto.randomUUID();
  const pageShippedAt = new Date(t + 2000);
  for (const [orderAt, pageId] of [[top, later[1]], [top, later[0]], [new Date(top.getTime() - 1), older]]) {
    await store.orders.create({...draft, id: pageId, reference: `JU-P${pageId.slice(0, 8).toUpperCase()}`, customerId: null, status: 'concluido', paidAt, trackingCode: 'AA123456789BR', shippedAt: pageShippedAt, createdAt: orderAt});
  }
  const firstPage = await store.orders.listForAdmin({statuses: ['concluido'], limit: 2, before: {createdAt: new Date(top.getTime() + 1), id: 'z'}});
  assert.deepEqual(firstPage.map(o => o.id), later, `${label}: newest first, ties by id`);
  assert.deepEqual(firstPage[0].shipTo, draft.shipTo, `${label}: the page carries what the panel shows`);
  assert.equal(firstPage[0].notes, draft.notes); assert(Buffer.from(firstPage[0].phoneEnc).equals(draft.phoneEnc));
  // the tracking code of Enviados and Concluídos (2026-10-05: the MySQL list did not read it)
  assert.equal(firstPage[0].trackingCode, 'AA123456789BR', `${label}: the page carries the tracking code`);
  assert.equal(new Date(firstPage[0].shippedAt).getTime(), pageShippedAt.getTime(), `${label}: and when it was shipped`);
  assert.deepEqual(firstPage[0].items.map(i => [i.productId, i.title, i.quantity, i.unitCents, i.selection]), draft.items.map(i => [i.productId, i.title, i.quantity, i.unitCents, i.selection]), `${label}: items in order`);
  const nextPage = await store.orders.listForAdmin({statuses: ['concluido'], limit: 2, before: {createdAt: firstPage[1].createdAt, id: firstPage[1].id}});
  assert.equal(nextPage[0].id, older, `${label}: the next page starts right below the cursor`);
  assert(!(await store.orders.listForAdmin({statuses: ['pendente'], limit: 500})).some(o => later.includes(o.id)), `${label}: only the statuses asked`);

  // Deleting the account keeps the order (fiscal record) and drops the link, the sessions and the codes.
  const sessionHash = crypto.randomBytes(32);
  await store.sessions.create({tokenHash: sessionHash, customerId: id, expiresAt, ip: null, userAgent: null});
  assert.equal(await store.customers.delete(id), true);
  assert.equal(await store.customers.findById(id), null);
  assert.equal(await store.sessions.find(sessionHash), null, `${label}: sessions go with the account`);
  assert.equal(await store.challenges.find(challengeId), null, `${label}: codes for the address go too`);
  assert.equal(await store.identities.find('google', subject), null, `${label}: the Google / Apple links go too`);
  const kept = await store.orders.findById(orderId);
  assert.equal(kept.customerId, null, `${label}: the order stays without the account link`);
  assert.equal(kept.items.length, 2);
  assert.equal(await store.customers.delete(id), false);

  // Painel da Ju: admins, their sessions (the code step and the full one) and the audit log.
  const adminEmail = `admin-${crypto.randomUUID()}@exemplo.com`, adminId = crypto.randomUUID();
  const before = await store.admins.count();
  const admin = await store.admins.create({id: adminId, email: adminEmail, passwordHash: 'scrypt$x'});
  assert.equal(admin.email, adminEmail); assert.equal(admin.totpEnabledAt, null); assert.equal(admin.totpLastStep, null);
  assert.equal(await store.admins.count(), before + 1);
  await assert.rejects(store.admins.create({id: crypto.randomUUID(), email: adminEmail, passwordHash: 'x'}), e => e.code === 'admin_exists', `${label}: one admin per address`);
  const secretEnc = crypto.randomBytes(61);
  const enrolled = await store.admins.update(adminId, {totpSecretEnc: secretEnc, totpEnabledAt: new Date(), lastLoginAt: new Date()});
  assert(Buffer.from(enrolled.totpSecretEnc).equals(secretEnc)); assert(enrolled.totpEnabledAt);
  assert.equal(await store.admins.useStep(adminId, 100), true, `${label}: a new step is accepted`);
  assert.equal(await store.admins.useStep(adminId, 100), false, `${label}: the same step is not`);
  assert.equal(await store.admins.useStep(adminId, 99), false, `${label}: nor an older one`);
  assert.equal(await store.admins.useStep(adminId, 101), true);
  assert.equal((await store.admins.findById(adminId)).totpLastStep, 101);
  const pendingHash = crypto.randomBytes(32), adminExpires = new Date(Date.now() + 600000);
  await store.adminSessions.create({tokenHash: pendingHash, adminId, mfaAt: null, expiresAt: adminExpires, ip: '1.1.1.1', userAgent: 'teste'});
  const pending = await store.adminSessions.find(pendingHash);
  assert.equal(pending.adminId, adminId); assert.equal(pending.mfaAt, null); assert.equal(pending.attempts, 0); assert.equal(pending.revokedAt, null);
  assert.equal(await store.adminSessions.recordAttempt(pendingHash), 1); assert.equal(await store.adminSessions.recordAttempt(pendingHash), 2);
  await store.adminSessions.revoke(pendingHash, new Date());
  assert((await store.adminSessions.find(pendingHash)).revokedAt, `${label}: revoked`);
  const fullHash = crypto.randomBytes(32);
  await store.adminSessions.create({tokenHash: fullHash, adminId, mfaAt: new Date(), expiresAt: adminExpires});
  assert((await store.adminSessions.find(fullHash)).mfaAt);
  await store.adminSessions.revokeAllFor(adminId, new Date());
  assert((await store.adminSessions.find(fullHash)).revokedAt, `${label}: revoke all`);
  await store.adminAudit.add({adminId, action: 'login', detail: 'contrato', ip: '1.1.1.1'});
  const [last] = await store.adminAudit.list(1);
  assert.equal(last.action, 'login'); assert.equal(last.adminId, adminId); assert.equal(last.detail, 'contrato');

  // NF-e: one invoice per order; a second create returns the first; updates and listing by orders.
  const invoiceId = crypto.randomUUID();
  const madeInvoice = await store.invoices.create({id: invoiceId, orderId, provider: 'fake', environment: 'homologacao', reference, status: 'processando'});
  assert.equal(madeInvoice.created, true); assert.equal(madeInvoice.invoice.status, 'processando'); assert.equal(madeInvoice.invoice.attempts, 0);
  const secondInvoice = await store.invoices.create({id: crypto.randomUUID(), orderId, provider: 'fake', environment: 'homologacao', reference, status: 'processando'});
  assert.equal(secondInvoice.created, false, `${label}: one invoice per order`); assert.equal(secondInvoice.invoice.id, invoiceId);
  const authorized = await store.invoices.update(invoiceId, {status: 'autorizada', number: '12', series: '1', accessKey: '3'.repeat(44), pdfUrl: 'https://n.test/a.pdf', attempts: 1, authorizedAt: new Date()});
  assert.equal(authorized.status, 'autorizada'); assert.equal(authorized.number, '12'); assert.equal(authorized.accessKey.length, 44); assert.equal(Number(authorized.attempts), 1);
  assert.equal((await store.invoices.findByOrder(orderId)).id, invoiceId);
  assert.deepEqual((await store.invoices.listByOrders([orderId, crypto.randomUUID()])).map(i => i.id), [invoiceId]);
  assert.deepEqual(await store.invoices.listByOrders([]), []);
  assert.equal(authorized.providerId, null);
  assert.equal((await store.invoices.update(invoiceId, {providerId: '987654321'})).providerId, '987654321', `${label}: the note's code at the NF-e service`);

  // The NF-e queue (011_bling_fila.sql): due notes, oldest first, never one an attempt holds; a hold is taken once and
  // frees itself when its time is up. Other rows may exist: only this note is checked.
  const when = new Date(Date.UTC(2026, 9, 5, 12, 0, 0)), ours = list => list.filter(i => i.id === invoiceId);
  assert.equal(madeInvoice.invoice.nextAttemptAt ?? null, null); assert.equal(Number(madeInvoice.invoice.retries), 0); assert.equal(madeInvoice.invoice.lockedUntil ?? null, null);
  const queued = await store.invoices.update(invoiceId, {status: 'fila', nextAttemptAt: new Date(when.getTime() - 60000), retries: 3, message: 'O Bling não respondeu.'});
  assert.equal(new Date(queued.nextAttemptAt).getTime(), when.getTime() - 60000, `${label}: the next attempt keeps milliseconds`); assert.equal(Number(queued.retries), 3);
  assert.equal(ours(await store.invoices.due({now: when})).length, 1, `${label}: due once its time came`);
  assert.equal(ours(await store.invoices.due({now: new Date(when.getTime() - 120000)})).length, 0, `${label}: not before`);
  assert.equal(await store.invoices.lease(invoiceId, {until: new Date(when.getTime() + 120000), now: when}), true, `${label}: held`);
  assert.equal(await store.invoices.lease(invoiceId, {until: new Date(when.getTime() + 120000), now: when}), false, `${label}: held once`);
  assert.equal(ours(await store.invoices.due({now: when})).length, 0, `${label}: a held note is not due`);
  const second = new Date(when.getTime() + 300000);
  assert.equal(await store.invoices.lease(invoiceId, {until: second, now: new Date(when.getTime() + 180000)}), true, `${label}: a hold whose time is up is taken again`);
  // Only the attempt holding it lets it go: the first one (its hold expired) ending late must not free the second's.
  await store.invoices.release(invoiceId, new Date(when.getTime() + 120000));
  assert.equal(new Date((await store.invoices.findById(invoiceId)).lockedUntil).getTime(), second.getTime(), `${label}: another attempt's hold stays`);
  await store.invoices.release(invoiceId, second);
  assert.equal((await store.invoices.findById(invoiceId)).lockedUntil ?? null, null, `${label}: its own hold is let go`);
  assert.equal(ours(await store.invoices.due({now: when})).length, 1, `${label}: free again`);
  assert.equal(ours(await store.invoices.due({now: when, statuses: ['autorizada']})).length, 0, `${label}: only the statuses asked for`);
  const line = await store.invoices.queue();
  assert(line.waiting >= 1, `${label}: counted in the queue`); assert(new Date(line.nextAttemptAt).getTime() <= when.getTime() - 60000, `${label}: the earliest attempt`);
  await store.invoices.update(invoiceId, {nextAttemptAt: null});   // parked (its order went back to Pendentes)
  assert.equal((await store.invoices.queue()).waiting, line.waiting - 1, `${label}: a parked note is not waiting`);
  await store.invoices.update(invoiceId, {status: 'autorizada', nextAttemptAt: null, retries: 0, message: null});
  assert.equal(ours(await store.invoices.due({now: new Date(when.getTime() + 86400e3)})).length, 0, `${label}: done, out of the queue`);

  // Integrations: one row per name, partial saves keep the other fields, binary tokens survive, remove clears.
  const integration = `test-${crypto.randomUUID().slice(0, 8)}`, blob = crypto.randomBytes(3000);
  assert.equal(await store.integrations.get(integration), null);
  const saved = await store.integrations.save(integration, {tokensEnc: blob, accessExpiresAt: new Date(Date.now() + 3600e3), connectedBy: 'ju@site.test', connectedAt: new Date()});
  assert.equal(saved.name, integration); assert.equal(saved.connectedBy, 'ju@site.test'); assert(Buffer.from(saved.tokensEnc).equals(blob), `${label}: tokens kept byte for byte`);
  const paused = await store.integrations.save(integration, {pausedReason: 'teste'});
  assert.equal(paused.pausedReason, 'teste'); assert.equal(paused.connectedBy, 'ju@site.test', 'a partial save keeps the rest'); assert(Buffer.from(paused.tokensEnc).equals(blob));
  assert.equal((await store.integrations.save(integration, {pausedReason: null})).pausedReason, null);
  // The circuit breaker (011_bling_fila.sql), saved with the connection and without touching it.
  assert.equal(saved.failures, 0, `${label}: no failures to start with`); assert.equal(saved.openUntil ?? null, null);
  const failing = await store.integrations.save(integration, {failures: 3, failingSince: when, openUntil: new Date(when.getTime() + 60000), lastError: 'O Bling não respondeu.', alertedAt: when});
  assert.deepEqual([failing.failures, new Date(failing.openUntil).getTime(), failing.lastError, new Date(failing.alertedAt).getTime()], [3, when.getTime() + 60000, 'O Bling não respondeu.', when.getTime()]);
  assert.equal(failing.connectedBy, 'ju@site.test', 'the breaker keeps the connection'); assert(Buffer.from(failing.tokensEnc).equals(blob));
  const closed = await store.integrations.save(integration, {failures: 0, failingSince: null, openUntil: null, lastError: null});
  assert.deepEqual([closed.failures, closed.openUntil, closed.failingSince], [0, null, null]);
  await store.integrations.remove(integration);
  assert.equal(await store.integrations.get(integration), null);

  // The integration log: newest first, only the given name, 90 days.
  const logName = `t${crypto.randomUUID().slice(0, 8)}`;
  await store.integrationLog.add({name: logName, kind: 'falha', operation: 'POST /nfe', httpStatus: 503, durationMs: 120, reference, message: 'O Bling respondeu 503.', createdAt: when});
  await store.integrationLog.add({name: logName, kind: 'recuperado', message: 'O Bling voltou a responder.', createdAt: new Date(when.getTime() + 1000)});
  await store.integrationLog.add({name: `${logName}x`, kind: 'falha', createdAt: when});
  const entries = await store.integrationLog.recent(logName, 10);
  assert.deepEqual(entries.map(e => e.kind), ['recuperado', 'falha'], `${label}: newest first, one name`);
  assert.deepEqual([entries[1].operation, Number(entries[1].httpStatus), Number(entries[1].durationMs), entries[1].reference], ['POST /nfe', 503, 120, reference]);
  assert.equal((await store.integrationLog.recent(logName, 1)).length, 1);
  await store.integrationLog.add({name: logName, kind: 'falha', message: 'antiga', createdAt: new Date(Date.now() - 100 * 86400e3)});
  await store.purge(Date.now());
  assert(!(await store.integrationLog.recent(logName, 10)).some(e => e.message === 'antiga'), `${label}: gone after 90 days`);
  assert.equal((await store.integrationLog.recent(logName, 10)).length, 2, `${label}: the recent ones stay`);

  // Fluxo de caixa (009_caixa.sql): entries typed by hand and bills. Days come back as the same "YYYY-MM-DD", whatever
  // the time zone of the server; remove answers the row once, then null.
  const entryId = crypto.randomUUID();
  const entry = await store.cashEntries.create({id: entryId, kind: 'saida', category: 'materiais', description: 'Filamento (contrato)', amountCents: 31000, occurredOn: '2026-10-03', createdBy: 'ju@site.test'});
  assert.deepEqual([entry.occurredOn, entry.amountCents, entry.kind, entry.category], ['2026-10-03', 31000, 'saida', 'materiais'], `${label}: a cash entry round-trips`);
  assert((await store.cashEntries.list()).some(e => e.id === entryId && e.occurredOn === '2026-10-03'));
  assert.equal((await store.cashEntries.remove(entryId)).description, 'Filamento (contrato)', `${label}: remove answers the row`);
  assert.equal(await store.cashEntries.remove(entryId), null, `${label}: and only once`);
  const billId = crypto.randomUUID();
  const bill = await store.bills.create({id: billId, description: 'Fornecedor (contrato)', amountCents: 12000, dueOn: '2026-10-15', createdBy: 'ju@site.test'});
  assert.deepEqual([bill.dueOn, bill.paidOn, bill.amountCents], ['2026-10-15', null, 12000], `${label}: a bill starts pending`);
  assert.equal((await store.bills.setPaid(billId, '2026-10-04')).paidOn, '2026-10-04', `${label}: paid on a day`);
  assert.equal((await store.bills.setPaid(billId, null)).paidOn, null, `${label}: back to pending`);
  assert.equal(bill.lockedAt, null, `${label}: a bill starts unlocked`);
  assert.ok((await store.bills.setLocked(billId, new Date())).lockedAt, `${label}: the padlock`);
  assert.ok((await store.bills.findById(billId)).lockedAt);
  assert.equal((await store.bills.setLocked(billId, null)).lockedAt, null);
  assert.equal(await store.bills.findById(crypto.randomUUID()), null);
  assert.equal(await store.bills.setPaid(crypto.randomUUID(), '2026-10-04'), null);
  assert((await store.bills.list()).some(b => b.id === billId && b.dueOn === '2026-10-15'));
  assert.equal((await store.bills.remove(billId)).id, billId);
  assert.equal(await store.bills.remove(billId), null);

  // Mensagens do formulário de contato (015_mensagens.sql, 2026-10-07): a message round-trips (the encrypted phone as
  // bytes); the panel's views (novas: not read, not archived, not spam), newest first with a cursor; the count of new ones;
  // changes and removal. Far in the future, so rows from earlier runs sit below these.
  {
    const top = new Date(Date.now() + 150 * 365 * 86400e3), ids = [crypto.randomUUID(), crypto.randomUUID()].sort().reverse(), spamId = crypto.randomUUID(), phoneEnc = crypto.randomBytes(44);
    const above = {createdAt: new Date(top.getTime() + 1), id: 'z'}, unreadBefore = await store.messages.countUnread();
    const first = await store.messages.create({id: ids[1], name: 'Ana Contrato', email: 'ana@exemplo.com', phoneEnc, subject: 'produto', message: 'Linha 1\nLinha 2', orderRef: 'JU-ABCDEF1234', lang: 'en', status: 'nova', createdAt: top});
    assert.deepEqual([first.name, first.email, first.subject, first.message, first.orderRef, first.lang, first.status, first.readAt, first.readBy, first.repliedAt, first.archivedAt, first.mailedAt],
      ['Ana Contrato', 'ana@exemplo.com', 'produto', 'Linha 1\nLinha 2', 'JU-ABCDEF1234', 'en', 'nova', null, null, null, null, null], `${label}: a message round-trips`);
    assert(Buffer.from(first.phoneEnc).equals(phoneEnc), `${label}: the encrypted phone comes back as the same bytes`);
    assert.equal(new Date(first.createdAt).getTime(), top.getTime(), `${label}: the time keeps milliseconds`);
    const second = await store.messages.create({id: ids[0], name: 'Bia', email: 'bia@exemplo.com', subject: 'outro', message: 'Mensagem dois', status: 'nova', createdAt: top});
    assert.equal(second.phoneEnc, null, `${label}: no phone, null`);
    await store.messages.create({id: spamId, name: 'Spam', email: 'spam@exemplo.com', subject: 'outro', message: 'http://a http://b http://c http://d', status: 'spam', createdAt: new Date(top.getTime() - 1)});
    assert.equal(await store.messages.countUnread(), unreadBefore + 2, `${label}: spam is not counted as new`);
    const page = await store.messages.list({view: 'todas', limit: 2, before: above});
    assert.deepEqual(page.map(m => m.id), ids, `${label}: newest first, ties by id`);
    const next = await store.messages.list({view: 'todas', limit: 2, before: {createdAt: page[1].createdAt, id: page[1].id}});
    assert.equal(next[0].id, spamId, `${label}: the next page starts right below the cursor`);
    assert.deepEqual((await store.messages.list({view: 'novas', limit: 3, before: above})).map(m => m.id), ids, `${label}: Novas leaves the spam out`);
    const read = await store.messages.update(ids[1], {readAt: new Date(), readBy: 'ju@site.test', id: 'ignored', createdAt: new Date(0)});
    assert(read.readAt && read.readBy === 'ju@site.test' && read.id === ids[1] && new Date(read.createdAt).getTime() === top.getTime(), `${label}: an update never changes the id or the time`);
    assert.equal(await store.messages.countUnread(), unreadBefore + 1, `${label}: a read message is not new any more`);
    assert.deepEqual((await store.messages.list({view: 'novas', limit: 3, before: above})).map(m => m.id), [ids[0]], `${label}: nor in Novas`);
    await store.messages.update(ids[0], {archivedAt: new Date(), mailedAt: new Date()});
    assert.equal(await store.messages.countUnread(), unreadBefore, `${label}: an archived message is not new`);
    assert.deepEqual((await store.messages.list({view: 'arquivadas', limit: 3, before: above})).map(m => m.id), [ids[0]], `${label}: Arquivadas`);
    assert.equal((await store.messages.update(spamId, {status: 'nova'})).status, 'nova', `${label}: not spam after all`);
    assert.equal(await store.messages.countUnread(), unreadBefore + 1);
    assert.equal(await store.messages.update(crypto.randomUUID(), {readAt: new Date()}), null, `${label}: an unknown message`);
    for (const id of [...ids, spamId]) assert.equal(await store.messages.remove(id), true, `${label}: removed`);
    assert.equal(await store.messages.findById(ids[0]), null);
    assert.equal(await store.messages.remove(ids[0]), false, `${label}: and only once`);
    assert.equal(await store.messages.countUnread(), unreadBefore);
  }
  // Their retention (Política de Privacidade): 12 months, spam 30 days.
  {
    const day = 86400000, nowMs = Date.now(), at = days => new Date(nowMs - days * day), make = (id, status, days) => store.messages.create({id, name: 'Prazo', email: 'prazo@exemplo.com', subject: 'outro', message: 'Mensagem de prazo', status, readAt: new Date(), createdAt: at(days)});
    const [oldSpam, recentSpam, oldMessage, keptMessage] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    await make(oldSpam, 'spam', 40); await make(recentSpam, 'spam', 10); await make(oldMessage, 'nova', 400); await make(keptMessage, 'nova', 300);
    await store.purge(nowMs);
    assert.equal(await store.messages.findById(oldSpam), null, `${label}: spam goes after 30 days`);
    assert(await store.messages.findById(recentSpam), `${label}: recent spam stays`);
    assert.equal(await store.messages.findById(oldMessage), null, `${label}: a message goes after 12 months`);
    assert(await store.messages.findById(keptMessage), `${label}: a younger one stays`);
    await store.messages.remove(recentSpam); await store.messages.remove(keptMessage);
  }

  // Retention: expired sessions go after 6 months, e-mailed codes after 30 days; recent ones stay.
  const purger = crypto.randomUUID(), purgerEmail = `purge-${purger}@exemplo.com`, day = 86400000, nowMs = Date.now();
  await store.customers.create({id: purger, email: purgerEmail, emailVerifiedAt: new Date(), displayName: 'P'});
  const oldSession = crypto.randomBytes(32), recentSession = crypto.randomBytes(32), oldAdmin = crypto.randomBytes(32);
  await store.sessions.create({tokenHash: oldSession, customerId: purger, expiresAt: new Date(nowMs - 200 * day), ip: '1.1.1.1', userAgent: null});
  await store.sessions.create({tokenHash: recentSession, customerId: purger, expiresAt: new Date(nowMs - 10 * day), ip: '1.1.1.1', userAgent: null});
  await store.adminSessions.create({tokenHash: oldAdmin, adminId, expiresAt: new Date(nowMs - 200 * day)});
  const oldCode = crypto.randomUUID(), recentCode = crypto.randomUUID();
  await store.challenges.create({id: oldCode, email: purgerEmail, purpose: 'access', codeHash: crypto.randomBytes(32), expiresAt: new Date(nowMs - 40 * day)});
  await store.challenges.create({id: recentCode, email: purgerEmail, purpose: 'access', codeHash: crypto.randomBytes(32), expiresAt: new Date(nowMs - 2 * day)});
  await store.purge(nowMs);
  assert.equal(await store.sessions.find(oldSession), null, `${label}: a session expired 6+ months ago is deleted`);
  assert(await store.sessions.find(recentSession), `${label}: a recently expired session is kept (access log)`);
  assert.equal(await store.adminSessions.find(oldAdmin), null, `${label}: same for the panel`);
  assert.equal(await store.challenges.find(oldCode), null, `${label}: codes older than 30 days are deleted`);
  assert(await store.challenges.find(recentCode), `${label}: recent codes stay`);
  await store.customers.delete(purger);
}

await contract(createMemoryStore(), 'memory');

// The panel's list reads from MySQL only the columns in ADMIN_ORDER_SELECT, while the memory store returns every field, so
// the contract above only catches a missing column against a real database. Here, without one: every field the panel's
// view of an order reads (orders.adminView) must be among the selected columns. (2026-10-05: tracking_code and shipped_at
// were missing, and the panel would show Enviados and Concluídos without the tracking code.)
{
  const fs = require('node:fs'), path = require('node:path'), root = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
  const mysqlSource = fs.readFileSync(path.join(root, 'api/_lib/store-mysql.js'), 'utf8'), ordersSource = fs.readFileSync(path.join(root, 'api/_lib/orders.js'), 'utf8');
  const map = /const ORDER_COLUMNS = \{([^}]+)\}/.exec(mysqlSource)[1], columns = Object.fromEntries([...map.matchAll(/(\w+): '([a-z_]+)'/g)].map(m => [m[1], m[2]]));
  const selected = new Set([.../const ADMIN_ORDER_SELECT = \[([^\]]+)\]/.exec(mysqlSource)[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]));
  const view = ordersSource.slice(ordersSource.indexOf('function adminView('), ordersSource.indexOf('function', ordersSource.indexOf('function adminView(') + 10));
  const read = [...new Set([...view.matchAll(/order\.(\w+)/g)].map(m => m[1]))].filter(field => field !== 'items');
  assert(read.includes('trackingCode') && read.length > 15, 'adminView found');
  for (const field of read) assert(columns[field] && selected.has(columns[field]), `adminView reads ${field}: ADMIN_ORDER_SELECT needs ${columns[field]}`);
}

// Connection settings: separate variables, or one DATABASE_URL (what a panel wizard may write); separate ones win.
{
  const {dbSettings} = require('../api/_lib/db.js');
  const fromUrl = dbSettings({DATABASE_URL: 'mysql://u123_ju:s%40nha@srv1.exemplo.io:3307/u123_loja'});
  assert.deepEqual({...fromUrl}, {host: 'srv1.exemplo.io', port: 3307, database: 'u123_loja', user: 'u123_ju', password: 's@nha', configured: true});
  assert.equal(dbSettings({DB_HOST: 'localhost', DB_NAME: 'x', DB_USER: 'y', DB_PASSWORD: 'z', DATABASE_URL: 'mysql://a:b@c/d'}).host, 'localhost');
  assert.equal(dbSettings({}).configured, false);
  assert.equal(dbSettings({DATABASE_URL: 'postgres://a:b@c/d'}).configured, false, 'only MySQL URLs');
}

let mysql = 'skipped (defina TEST_DB_HOST, TEST_DB_NAME, TEST_DB_USER, TEST_DB_PASSWORD)';
if (process.env.TEST_DB_HOST) {
  const {getPool} = require('../api/_lib/db.js');
  const {migrate} = require('../api/_lib/migrate.js');
  const {createMysqlStore} = require('../api/_lib/store-mysql.js');
  const pool = getPool({DB_HOST: process.env.TEST_DB_HOST, DB_PORT: process.env.TEST_DB_PORT, DB_NAME: process.env.TEST_DB_NAME, DB_USER: process.env.TEST_DB_USER, DB_PASSWORD: process.env.TEST_DB_PASSWORD});
  try { await migrate(pool, {log: {log: () => {}}}); await contract(createMysqlStore(pool), 'mysql'); mysql = 'ok'; }
  finally { await pool.end(); }
}

console.log(`PASS: store contract — memory ok, MySQL ${mysql}.`);
