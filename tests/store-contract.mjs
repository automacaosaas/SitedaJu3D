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
  assert.equal(await cashBalance(new Date(t + 1)) - await cashBalance(new Date(t)), 14700, `${label}: a paid order counts from the instant it was paid`);

  // Deleting the account keeps the order (fiscal record) and drops the link, the sessions and the codes.
  const sessionHash = crypto.randomBytes(32);
  await store.sessions.create({tokenHash: sessionHash, customerId: id, expiresAt, ip: null, userAgent: null});
  assert.equal(await store.customers.delete(id), true);
  assert.equal(await store.customers.findById(id), null);
  assert.equal(await store.sessions.find(sessionHash), null, `${label}: sessions go with the account`);
  assert.equal(await store.challenges.find(challengeId), null, `${label}: codes for the address go too`);
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

  // Integrations: one row per name, partial saves keep the other fields, binary tokens survive, remove clears.
  const integration = `test-${crypto.randomUUID().slice(0, 8)}`, blob = crypto.randomBytes(3000);
  assert.equal(await store.integrations.get(integration), null);
  const saved = await store.integrations.save(integration, {tokensEnc: blob, accessExpiresAt: new Date(Date.now() + 3600e3), connectedBy: 'ju@site.test', connectedAt: new Date()});
  assert.equal(saved.name, integration); assert.equal(saved.connectedBy, 'ju@site.test'); assert(Buffer.from(saved.tokensEnc).equals(blob), `${label}: tokens kept byte for byte`);
  const paused = await store.integrations.save(integration, {pausedReason: 'teste'});
  assert.equal(paused.pausedReason, 'teste'); assert.equal(paused.connectedBy, 'ju@site.test', 'a partial save keeps the rest'); assert(Buffer.from(paused.tokensEnc).equals(blob));
  assert.equal((await store.integrations.save(integration, {pausedReason: null})).pausedReason, null);
  await store.integrations.remove(integration);
  assert.equal(await store.integrations.get(integration), null);

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
