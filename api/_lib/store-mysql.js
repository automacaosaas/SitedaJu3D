'use strict';
// MySQL/MariaDB store (tables in db/migrations/001_contas.sql). Same interface as store-memory.js. Every query uses
// placeholders; values never go into the SQL text.
const COLUMNS = {
  id: 'id', email: 'email', emailVerifiedAt: 'email_verified_at', displayName: 'display_name', firstName: 'first_name', lastName: 'last_name',
  passwordHash: 'password_hash', cpfEnc: 'cpf_enc', cpfIndex: 'cpf_index', phoneEnc: 'phone_enc', companyCnpj: 'company_cnpj', companyName: 'company_name',
  companyIe: 'company_ie', marketingOptIn: 'marketing_opt_in', marketingConsentAt: 'marketing_consent_at', termsVersion: 'terms_version', termsAcceptedAt: 'terms_accepted_at', createdAt: 'created_at',
  avatarUrl: 'avatar_url'
};

function toCustomer(row) {
  if (!row) return null;
  const customer = {};
  for (const [field, column] of Object.entries(COLUMNS)) customer[field] = row[column] ?? null;
  customer.marketingOptIn = Boolean(row.marketing_opt_in);
  return customer;
}
const ORDER_COLUMNS = {
  id: 'id', reference: 'reference', customerId: 'customer_id', source: 'source', status: 'status', paymentState: 'payment_state', method: 'method',
  installments: 'installments', subtotalCents: 'subtotal_cents', shippingCents: 'shipping_cents', totalCents: 'total_cents', buyer: 'buyer',
  buyerDocEnc: 'buyer_doc_enc', phoneEnc: 'phone_enc', shipTo: 'ship_to', shippingInfo: 'shipping_info', notes: 'notes', lang: 'lang', mpOrderId: 'mp_order_id', paidAt: 'paid_at',
  decidedAt: 'decided_at', declineReason: 'decline_reason', trackingCode: 'tracking_code', shippedAt: 'shipped_at', refundState: 'refund_state', refundId: 'refund_id', refundedAt: 'refunded_at', refundError: 'refund_error',
  ownerNotifiedAt: 'owner_notified_at', customerNotifiedAt: 'customer_notified_at', termsVersion: 'terms_version', termsAcceptedAt: 'terms_accepted_at', createdAt: 'created_at',
  trackingState: 'tracking_state', trackingEvents: 'tracking_events', trackingCheckedAt: 'tracking_checked_at', deliveredAt: 'delivered_at', trackingNotices: 'tracking_notices',
  trackingLast: 'tracking_last'
};
// What the panel's list (orders.adminView) reads of an order: the rest stays in the table. Of the tracking, only the last
// event (tracking_last), never the whole line of up to 40 (tracking_events, for "Meus pedidos").
const ADMIN_ORDER_SELECT = ['id', 'reference', 'source', 'status', 'method', 'installments', 'subtotal_cents', 'shipping_cents', 'total_cents', 'buyer', 'buyer_doc_enc', 'phone_enc',
  'ship_to', 'shipping_info', 'notes', 'paid_at', 'decided_at', 'decline_reason', 'tracking_code', 'shipped_at', 'refund_state', 'refunded_at', 'refund_error',
  'created_at', 'tracking_state', 'tracking_last', 'tracking_checked_at', 'delivered_at', 'tracking_notices'].join(', ');
const JSON_FIELDS = new Set(['buyer', 'shipTo', 'shippingInfo', 'trackingEvents', 'trackingLast']);
const parse = value => { if (value === null || value === undefined) return null; if (typeof value !== 'string') return value; try { return JSON.parse(value); } catch { return null; } };
const toDb = (field, value) => JSON_FIELDS.has(field) && value !== null && value !== undefined ? JSON.stringify(value) : value ?? null;
function toOrder(row, items = []) {
  if (!row) return null;
  const order = {};
  for (const [field, column] of Object.entries(ORDER_COLUMNS)) order[field] = JSON_FIELDS.has(field) ? parse(row[column]) : row[column] ?? null;
  order.items = items.map(i => ({productId: i.product_id, title: i.title, quantity: i.quantity, unitCents: i.unit_price_cents, selection: parse(i.selection) || {}}));
  return order;
}
const ADMIN_COLUMNS = {id: 'id', email: 'email', passwordHash: 'password_hash', totpSecretEnc: 'totp_secret_enc', totpEnabledAt: 'totp_enabled_at', totpLastStep: 'totp_last_step', lastLoginAt: 'last_login_at', createdAt: 'created_at'};
function toAdmin(row) {
  if (!row) return null;
  const admin = {};
  for (const [field, column] of Object.entries(ADMIN_COLUMNS)) admin[field] = row[column] ?? null;
  if (admin.totpLastStep !== null) admin.totpLastStep = Number(admin.totpLastStep);
  return admin;
}
const INVOICE_COLUMNS = {id: 'id', orderId: 'order_id', provider: 'provider', providerId: 'provider_id', environment: 'environment', reference: 'reference', status: 'status', number: 'number', series: 'series', accessKey: 'access_key', pdfUrl: 'pdf_url', xmlUrl: 'xml_url', message: 'message', attempts: 'attempts',
  nextAttemptAt: 'next_attempt_at', retries: 'retries', lockedUntil: 'locked_until', authorizedAt: 'authorized_at', customerNotifiedAt: 'customer_notified_at', createdAt: 'created_at', updatedAt: 'updated_at'};
const QUEUED = ['fila', 'processando', 'autorizada'];   // the NF-e queue: to send, to check, or the buyer's e-mail to send again
function toInvoice(row) {
  if (!row) return null;
  const invoice = {};
  for (const [field, column] of Object.entries(INVOICE_COLUMNS)) invoice[field] = row[column] ?? null;
  return invoice;
}
const INTEGRATION_COLUMNS = {name: 'name', tokensEnc: 'tokens_enc', accessExpiresAt: 'access_expires_at', refreshExpiresAt: 'refresh_expires_at', connectedBy: 'connected_by', connectedAt: 'connected_at', refreshedAt: 'refreshed_at', pausedReason: 'paused_reason',
  failures: 'failures', failingSince: 'failing_since', openUntil: 'open_until', lastError: 'last_error', alertedAt: 'alerted_at', updatedAt: 'updated_at'};
function toIntegration(row) {
  if (!row) return null;
  const integration = {};
  for (const [field, column] of Object.entries(INTEGRATION_COLUMNS)) integration[field] = row[column] ?? null;
  integration.failures = Number(integration.failures) || 0;
  return integration;
}
const toLogEntry = row => row && {id: Number(row.id), name: row.name, kind: row.kind, operation: row.operation, httpStatus: row.http_status, durationMs: row.duration_ms, reference: row.reference, message: row.message, createdAt: row.created_at};
// Fluxo de caixa (db/migrations/009_caixa.sql). DATE columns come back as a Date at midnight UTC (pool timezone 'Z'):
// back to the "YYYY-MM-DD" they were saved as.
const toDay = value => value instanceof Date ? value.toISOString().slice(0, 10) : value === null || value === undefined ? null : String(value).slice(0, 10);
const CASH_COLUMNS = {id: 'id', kind: 'kind', category: 'category', description: 'description', amountCents: 'amount_cents', occurredOn: 'occurred_on', createdBy: 'created_by', createdAt: 'created_at'};
const toCashEntry = row => row && {id: row.id, kind: row.kind, category: row.category, description: row.description, amountCents: Number(row.amount_cents), occurredOn: toDay(row.occurred_on), createdBy: row.created_by ?? null, createdAt: row.created_at};
const BILL_COLUMNS = {id: 'id', description: 'description', amountCents: 'amount_cents', dueOn: 'due_on', paidOn: 'paid_on', lockedAt: 'locked_at', createdBy: 'created_by', createdAt: 'created_at'};
const toBill = row => row && {id: row.id, description: row.description, amountCents: Number(row.amount_cents), dueOn: toDay(row.due_on), paidOn: toDay(row.paid_on), lockedAt: row.locked_at ?? null, createdBy: row.created_by ?? null, createdAt: row.created_at};
// Only what the cash flow shows of a paid order: no buyer, address or document leaves the table.
const toCashOrder = (row, items = []) => ({id: row.id, reference: row.reference, source: row.source, totalCents: Number(row.total_cents), paidAt: row.paid_at, refundState: row.refund_state ?? null, refundedAt: row.refunded_at ?? null, decidedAt: row.decided_at ?? null, items: items.map(i => ({title: i.title, quantity: i.quantity}))});
// Rows grouped by a key, keeping their order: one pass instead of a filter per row.
function groupBy(rows, keyOf) {
  const groups = new Map();
  for (const row of rows) { const key = keyOf(row), group = groups.get(key); if (group) group.push(row); else groups.set(key, [row]); }
  return groups;
}
// Mensagens do formulário de contato (db/migrations/015_mensagens.sql). The views of the panel, as in store-memory.js:
// novas (not read, not archived, not spam), todas, arquivadas. Fixed SQL text, never built from a value.
const MESSAGE_COLUMNS = {id: 'id', name: 'name', email: 'email', phoneEnc: 'phone_enc', subject: 'subject', message: 'message', orderRef: 'order_ref', lang: 'lang', status: 'status',
  mailedAt: 'mailed_at', readAt: 'read_at', readBy: 'read_by', repliedAt: 'replied_at', archivedAt: 'archived_at', createdAt: 'created_at'};
const MESSAGE_VIEWS = {novas: "status = 'nova' AND archived_at IS NULL AND read_at IS NULL", todas: '1 = 1', arquivadas: 'archived_at IS NOT NULL'};
function toMessage(row) {
  if (!row) return null;
  const message = {};
  for (const [field, column] of Object.entries(MESSAGE_COLUMNS)) message[field] = row[column] ?? null;
  return message;
}
const toAdminSession = row => row && {tokenHash: row.token_hash, adminId: row.admin_id, mfaAt: row.mfa_at, attempts: row.attempts, createdAt: row.created_at, expiresAt: row.expires_at, revokedAt: row.revoked_at, ip: row.ip, userAgent: row.user_agent};
const toIdentity = row => row && {provider: row.provider, subject: row.subject, customerId: row.customer_id, email: row.email, privateEmail: Boolean(row.private_email), createdAt: row.created_at, lastLoginAt: row.last_login_at};
const toSession = row => row && {tokenHash: row.token_hash, customerId: row.customer_id, createdAt: row.created_at, lastSeenAt: row.last_seen_at, expiresAt: row.expires_at, revokedAt: row.revoked_at, ip: row.ip, userAgent: row.user_agent};
const toChallenge = row => row && {id: row.id, email: row.email, purpose: row.purpose, codeHash: row.code_hash, attempts: row.attempts, createdAt: row.created_at, expiresAt: row.expires_at, verifiedAt: row.verified_at, grantHash: row.grant_hash, grantExpiresAt: row.grant_expires_at, usedAt: row.used_at};

function createMysqlStore(pool) {
  const one = async (sql, params) => { const [rows] = await pool.execute(sql, params); return rows[0] || null; };
  const all = async (sql, params) => { const [rows] = await pool.execute(sql, params); return rows; };
  async function withItems(row) { return row ? toOrder(row, await all('SELECT * FROM order_items WHERE order_id = ? ORDER BY position', [row.id])) : null; }
  async function withItemsList(rows, columns = '*') {
    if (!rows.length) return [];
    const items = await all(`SELECT ${columns} FROM order_items WHERE order_id IN (${rows.map(() => '?').join(', ')}) ORDER BY order_id, position`, rows.map(r => r.id));
    const byOrder = groupBy(items, i => i.order_id);
    return rows.map(r => toOrder(r, byOrder.get(r.id) || []));
  }
  const run = async (sql, params) => { const [result] = await pool.execute(sql, params); return result; };
  const duplicate = (error, name) => error?.code === 'ER_DUP_ENTRY' && String(error.message).includes(name);

  return {
    kind: 'mysql',
    customers: {
      findByEmail: async email => toCustomer(await one('SELECT * FROM customers WHERE email = ?', [email])),
      findById: async id => toCustomer(await one('SELECT * FROM customers WHERE id = ?', [id])),
      findByCpfIndex: async index => toCustomer(await one('SELECT * FROM customers WHERE cpf_index = ?', [index])),
      async create(data) {
        const fields = Object.keys(data).filter(f => COLUMNS[f]);
        try { await run(`INSERT INTO customers (${fields.map(f => COLUMNS[f]).join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`, fields.map(f => data[f])); }
        catch (error) { if (duplicate(error, 'uq_customers_email')) throw Object.assign(new Error('duplicate email'), {code: 'account_exists'}); throw error; }
        return toCustomer(await one('SELECT * FROM customers WHERE id = ?', [data.id]));
      },
      async update(id, patch) {
        const fields = Object.keys(patch).filter(f => COLUMNS[f] && f !== 'id');
        if (fields.length) {
          try { await run(`UPDATE customers SET ${fields.map(f => `${COLUMNS[f]} = ?`).join(', ')} WHERE id = ?`, [...fields.map(f => patch[f]), id]); }
          catch (error) { if (duplicate(error, 'uq_customers_cpf')) throw Object.assign(new Error('duplicate cpf'), {code: 'cpf_in_use'}); throw error; }
        }
        return toCustomer(await one('SELECT * FROM customers WHERE id = ?', [id]));
      },
      // Account deletion: sessions go by cascade, orders keep their snapshot with customer_id set to NULL.
      async delete(id) {
        const customer = await one('SELECT email FROM customers WHERE id = ?', [id]);
        if (!customer) return false;
        await run('DELETE FROM auth_challenges WHERE email = ?', [customer.email]);
        return (await run('DELETE FROM customers WHERE id = ?', [id])).affectedRows === 1;
      }
    },
    orders: {
      async create(order) {
        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();
          const fields = Object.keys(order).filter(f => ORDER_COLUMNS[f]);
          try { await connection.execute(`INSERT INTO orders (${fields.map(f => ORDER_COLUMNS[f]).join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`, fields.map(f => toDb(f, order[f]))); }
          catch (error) {
            await connection.rollback();
            if (duplicate(error, 'uq_orders_reference')) return {order: await this.findByReference(order.reference), created: false};
            throw error;
          }
          for (const [position, item] of (order.items || []).entries()) {
            await connection.execute('INSERT INTO order_items (order_id, position, product_id, title, quantity, unit_price_cents, selection) VALUES (?, ?, ?, ?, ?, ?, ?)', [order.id, position, item.productId, item.title, item.quantity, item.unitCents, JSON.stringify(item.selection || {})]);
          }
          await connection.commit();
        } catch (error) { await connection.rollback().catch(() => {}); throw error; }
        finally { connection.release(); }
        return {order: await this.findById(order.id), created: true};
      },
      async findById(id) { return withItems(await one('SELECT * FROM orders WHERE id = ?', [id])); },
      async findByReference(reference) { return withItems(await one('SELECT * FROM orders WHERE reference = ?', [reference])); },
      async findByMpId(mpOrderId) { return withItems(await one('SELECT * FROM orders WHERE mp_order_id = ?', [mpOrderId])); },
      async update(id, patch) {
        const fields = Object.keys(patch).filter(f => ORDER_COLUMNS[f] && f !== 'id');
        if (fields.length) await run(`UPDATE orders SET ${fields.map(f => `${ORDER_COLUMNS[f]} = ?`).join(', ')} WHERE id = ?`, [...fields.map(f => toDb(f, patch[f])), id]);
        return this.findById(id);
      },
      // The WHERE on the current status makes this atomic: one caller gets affectedRows = 1, every other gets 0.
      async transition(id, from, patch) {
        const fields = Object.keys(patch).filter(f => ORDER_COLUMNS[f] && f !== 'id');
        const result = await run(`UPDATE orders SET ${fields.map(f => `${ORDER_COLUMNS[f]} = ?`).join(', ')} WHERE id = ? AND status IN (${from.map(() => '?').join(', ')})`, [...fields.map(f => toDb(f, patch[f])), id, ...from]);
        return result.affectedRows === 1;
      },
      async listByCustomer(customerId, limit = 50) { return withItemsList(await all(`SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT ${Math.min(Number(limit) || 50, 200)}`, [customerId])); },
      async list({statuses = null, limit = 500} = {}) {
        const cap = Math.min(Number(limit) || 500, 2000);
        const rows = statuses ? await all(`SELECT * FROM orders WHERE status IN (${statuses.map(() => '?').join(', ')}) ORDER BY created_at DESC LIMIT ${cap}`, statuses) : await all(`SELECT * FROM orders ORDER BY created_at DESC LIMIT ${cap}`, []);
        return withItemsList(rows);
      },
      // Painel: one page of orders, newest first, with only the columns the panel shows (no payment ids, terms or
      // e-mail marks). Keyset pagination on (created_at, id): the page after `before` starts right below that order, so
      // an order paid while Ju scrolls neither repeats nor pushes another one out, and no page reads past its own rows.
      async listForAdmin({statuses, limit = 100, before = null}) {
        const cap = Math.min(Math.max(Math.floor(Number(limit)) || 100, 1), 500);
        const where = [`status IN (${statuses.map(() => '?').join(', ')})`], params = [...statuses];
        if (before) { where.push('(created_at < ? OR (created_at = ? AND id < ?))'); params.push(before.createdAt, before.createdAt, before.id); }
        const rows = await all(`SELECT ${ADMIN_ORDER_SELECT} FROM orders WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ${cap}`, params);
        return withItemsList(rows, 'order_id, product_id, title, quantity, unit_price_cents, selection');
      },
      // Rastreio (api/_lib/tracking.js): the posted packages whose last look at the Correios is older than `checkedBefore`
      // (never looked at first, then the oldest look), shipped after `shippedAfter` (a code that never moves is dropped
      // after a while). Without the pieces: the round only needs the code and what it already knows.
      async listForTracking({statuses, checkedBefore, shippedAfter, limit = 50}) {
        const cap = Math.min(Math.max(Math.floor(Number(limit)) || 50, 1), 500);
        const rows = await all(`SELECT * FROM orders WHERE status IN (${statuses.map(() => '?').join(', ')}) AND tracking_code IS NOT NULL AND shipped_at >= ? AND (tracking_checked_at IS NULL OR tracking_checked_at < ?) ORDER BY tracking_checked_at IS NOT NULL, tracking_checked_at ASC LIMIT ${cap}`, [...statuses, shippedAfter, checkedBefore]);
        return rows.map(row => toOrder(row));
      },
      // Fluxo de caixa: every paid order (no cap, the balance needs all of them), only the columns it shows, and the
      // pieces in one query that filters on the server instead of a placeholder per order.
      async listForCash({statuses}) {
        const marks = statuses.map(() => '?').join(', ');
        const [rows, items] = await Promise.all([
          all(`SELECT id, reference, source, total_cents, paid_at, refund_state, refunded_at, decided_at FROM orders WHERE status IN (${marks}) AND paid_at IS NOT NULL ORDER BY paid_at DESC`, statuses),
          all(`SELECT i.order_id, i.title, i.quantity FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.status IN (${marks}) AND o.paid_at IS NOT NULL ORDER BY i.order_id, i.position`, statuses)
        ]);
        const byOrder = groupBy(items, i => i.order_id);
        return rows.map(r => toCashOrder(r, byOrder.get(r.id)));
      },
      addEvent: (orderId, kind, detail = null, actor = null) => run('INSERT INTO order_events (order_id, kind, detail, actor) VALUES (?, ?, ?, ?)', [orderId, kind, detail === null ? null : String(detail).slice(0, 500), actor === null ? null : String(actor).slice(0, 180)]),
      async events(orderId) { return (await all('SELECT * FROM order_events WHERE order_id = ? ORDER BY id', [orderId])).map(e => ({id: e.id, orderId: e.order_id, kind: e.kind, detail: e.detail, actor: e.actor, createdAt: e.created_at})); }
    },
    admins: {
      count: async () => Number((await one('SELECT COUNT(*) AS n FROM admin_users', [])).n),
      findByEmail: async email => toAdmin(await one('SELECT * FROM admin_users WHERE email = ?', [email])),
      findById: async id => toAdmin(await one('SELECT * FROM admin_users WHERE id = ?', [id])),
      async create(data) {
        const fields = Object.keys(data).filter(f => ADMIN_COLUMNS[f]);
        try { await run(`INSERT INTO admin_users (${fields.map(f => ADMIN_COLUMNS[f]).join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`, fields.map(f => data[f])); }
        catch (error) { if (duplicate(error, 'uq_admin_users_email')) throw Object.assign(new Error('duplicate email'), {code: 'admin_exists'}); throw error; }
        return toAdmin(await one('SELECT * FROM admin_users WHERE id = ?', [data.id]));
      },
      async update(id, patch) {
        const fields = Object.keys(patch).filter(f => ADMIN_COLUMNS[f] && f !== 'id');
        if (fields.length) await run(`UPDATE admin_users SET ${fields.map(f => `${ADMIN_COLUMNS[f]} = ?`).join(', ')} WHERE id = ?`, [...fields.map(f => patch[f]), id]);
        return toAdmin(await one('SELECT * FROM admin_users WHERE id = ?', [id]));
      },
      // Only a newer step matches the WHERE, so a code is accepted once even with two requests at the same time.
      async useStep(id, step) { return (await run('UPDATE admin_users SET totp_last_step = ? WHERE id = ? AND (totp_last_step IS NULL OR totp_last_step < ?)', [step, id, step])).affectedRows === 1; }
    },
    invoices: {
      async create(data) {
        const fields = Object.keys(data).filter(f => INVOICE_COLUMNS[f]);
        try { await run(`INSERT INTO invoices (${fields.map(f => INVOICE_COLUMNS[f]).join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`, fields.map(f => data[f] ?? null)); }
        catch (error) { if (duplicate(error, 'uq_invoices_order')) return {invoice: await this.findByOrder(data.orderId), created: false}; throw error; }
        return {invoice: await this.findById(data.id), created: true};
      },
      findById: async id => toInvoice(await one('SELECT * FROM invoices WHERE id = ?', [id])),
      findByOrder: async orderId => toInvoice(await one('SELECT * FROM invoices WHERE order_id = ?', [orderId])),
      async update(id, patch) {
        const fields = Object.keys(patch).filter(f => INVOICE_COLUMNS[f] && !['id', 'createdAt', 'updatedAt'].includes(f));
        if (fields.length) await run(`UPDATE invoices SET ${fields.map(f => `${INVOICE_COLUMNS[f]} = ?`).join(', ')} WHERE id = ?`, [...fields.map(f => patch[f] ?? null), id]);
        return this.findById(id);
      },
      async listByOrders(orderIds) { if (!orderIds.length) return []; return (await all(`SELECT * FROM invoices WHERE order_id IN (${orderIds.map(() => '?').join(', ')})`, orderIds)).map(toInvoice); },
      // The queue (db/migrations/011_bling_fila.sql): notes whose next step is due and that no attempt holds, oldest first.
      async due({now, limit = 20, statuses = QUEUED}) {
        const cap = Math.min(Math.max(Math.floor(Number(limit)) || 20, 1), 200);
        return (await all(`SELECT * FROM invoices WHERE status IN (${statuses.map(() => '?').join(', ')}) AND next_attempt_at IS NOT NULL AND next_attempt_at <= ? AND (locked_until IS NULL OR locked_until < ?) ORDER BY next_attempt_at LIMIT ${cap}`, [...statuses, now, now])).map(toInvoice);
      },
      // Holds a note for one attempt until `until`; false when another attempt holds it (checked and taken in one UPDATE,
      // so two processes never both get it).
      async lease(id, {until, now}) { return (await run('UPDATE invoices SET locked_until = ? WHERE id = ? AND (locked_until IS NULL OR locked_until < ?)', [until, id, now])).affectedRows === 1; },
      // Lets the note go, only if this attempt still holds it (`until` of its own lease).
      async release(id, until) { await run('UPDATE invoices SET locked_until = NULL WHERE id = ? AND locked_until = ?', [id, until]); },
      // Waiting = in the queue with a next attempt (a note parked because its order went back to Pendentes is not).
      async queue() {
        const rows = await all("SELECT status, COUNT(*) AS total, MIN(created_at) AS oldest, MIN(next_attempt_at) AS next_at FROM invoices WHERE status = 'processando' OR (status = 'fila' AND next_attempt_at IS NOT NULL) GROUP BY status", []);
        const by = Object.fromEntries(rows.map(r => [r.status, r]));
        return {waiting: Number(by.fila?.total || 0), processing: Number(by.processando?.total || 0), oldestWaiting: by.fila?.oldest || null, nextAttemptAt: by.fila?.next_at || null};
      }
    },
    integrations: {
      get: async name => toIntegration(await one('SELECT * FROM integrations WHERE name = ?', [name])),
      // Insert or update only the given fields.
      async save(name, patch) {
        const fields = Object.keys(patch).filter(f => INTEGRATION_COLUMNS[f] && !['name', 'updatedAt'].includes(f));
        const columns = fields.map(f => INTEGRATION_COLUMNS[f]);
        const update = columns.length ? columns.map(c => `${c} = VALUES(${c})`).join(', ') : 'name = name';
        await run(`INSERT INTO integrations (name${columns.map(c => ', ' + c).join('')}) VALUES (?${columns.map(() => ', ?').join('')}) ON DUPLICATE KEY UPDATE ${update}`, [name, ...fields.map(f => patch[f] ?? null)]);
        return this.get(name);
      },
      remove: name => run('DELETE FROM integrations WHERE name = ?', [name])
    },
    // What went wrong with an outside service (db/migrations/011_bling_fila.sql): failures, pauses, alerts, recoveries.
    integrationLog: {
      async add(entry) {
        const row = {operation: null, httpStatus: null, durationMs: null, reference: null, message: null, createdAt: new Date(), ...entry};
        const result = await run('INSERT INTO integration_log (name, kind, operation, http_status, duration_ms, reference, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [row.name, row.kind, row.operation, row.httpStatus, row.durationMs, row.reference, row.message, row.createdAt]);
        return {...row, id: Number(result.insertId)};
      },
      async recent(name, limit = 10) {
        const cap = Math.min(Math.max(Math.floor(Number(limit)) || 10, 1), 100);
        return (await all(`SELECT * FROM integration_log WHERE name = ? ORDER BY created_at DESC, id DESC LIMIT ${cap}`, [name])).map(toLogEntry);
      }
    },
    // The cash balance summed by the database, without loading a single movement: paid orders up to `before` (the
    // instant the day after `until` starts in Brasília), minus the refunds up to then, plus the entries and minus the bills
    // paid up to `until` ("YYYY-MM-DD"). Same rules as balance() in cash.js.
    async cashBalance({statuses, refundStates, before, until}) {
      const marks = list => list.map(() => '?').join(', ');
      const row = await one(`SELECT
          (SELECT COALESCE(SUM(total_cents), 0) FROM orders WHERE status IN (${marks(statuses)}) AND paid_at IS NOT NULL AND paid_at < ?) AS sales,
          (SELECT COALESCE(SUM(total_cents), 0) FROM orders WHERE status IN (${marks(statuses)}) AND paid_at IS NOT NULL AND refund_state IN (${marks(refundStates)}) AND COALESCE(refunded_at, decided_at, paid_at) < ?) AS refunds,
          (SELECT COALESCE(SUM(CASE WHEN kind = 'entrada' THEN amount_cents ELSE -amount_cents END), 0) FROM cash_entries WHERE occurred_on <= ?) AS entries,
          (SELECT COALESCE(SUM(amount_cents), 0) FROM bills WHERE paid_on IS NOT NULL AND paid_on <= ?) AS bills`,
        [...statuses, before, ...statuses, ...refundStates, before, until, until]);
      return Number(row.sales) - Number(row.refunds) + Number(row.entries) - Number(row.bills);
    },
    cashEntries: {
      async create(data) {
        const fields = Object.keys(data).filter(f => CASH_COLUMNS[f] && f !== 'createdAt');
        await run(`INSERT INTO cash_entries (${fields.map(f => CASH_COLUMNS[f]).join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`, fields.map(f => data[f] ?? null));
        return toCashEntry(await one('SELECT * FROM cash_entries WHERE id = ?', [data.id]));
      },
      async list(limit = 5000) { return (await all(`SELECT * FROM cash_entries ORDER BY occurred_on DESC, created_at DESC LIMIT ${Math.min(Number(limit) || 5000, 20000)}`, [])).map(toCashEntry); },
      async remove(id) {
        const row = toCashEntry(await one('SELECT * FROM cash_entries WHERE id = ?', [id]));
        if (!row) return null;
        await run('DELETE FROM cash_entries WHERE id = ?', [id]);
        return row;
      }
    },
    bills: {
      async create(data) {
        const fields = Object.keys(data).filter(f => BILL_COLUMNS[f] && f !== 'createdAt');
        await run(`INSERT INTO bills (${fields.map(f => BILL_COLUMNS[f]).join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`, fields.map(f => data[f] ?? null));
        return toBill(await one('SELECT * FROM bills WHERE id = ?', [data.id]));
      },
      findById: async id => toBill(await one('SELECT * FROM bills WHERE id = ?', [id])),
      async list(limit = 5000) { return (await all(`SELECT * FROM bills ORDER BY due_on, created_at LIMIT ${Math.min(Number(limit) || 5000, 20000)}`, [])).map(toBill); },
      async setPaid(id, paidOn) {
        await run('UPDATE bills SET paid_on = ? WHERE id = ?', [paidOn, id]);
        return toBill(await one('SELECT * FROM bills WHERE id = ?', [id]));
      },
      async setLocked(id, lockedAt) {
        await run('UPDATE bills SET locked_at = ? WHERE id = ?', [lockedAt, id]);
        return toBill(await one('SELECT * FROM bills WHERE id = ?', [id]));
      },
      async remove(id) {
        const row = toBill(await one('SELECT * FROM bills WHERE id = ?', [id]));
        if (!row) return null;
        await run('DELETE FROM bills WHERE id = ?', [id]);
        return row;
      }
    },
    // Mensagens: newest first, keyset pagination on (created_at, id) like orders.listForAdmin.
    messages: {
      async create(data) {
        const fields = Object.keys(data).filter(f => MESSAGE_COLUMNS[f]);
        await run(`INSERT INTO contact_messages (${fields.map(f => MESSAGE_COLUMNS[f]).join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`, fields.map(f => data[f] ?? null));
        return toMessage(await one('SELECT * FROM contact_messages WHERE id = ?', [data.id]));
      },
      findById: async id => toMessage(await one('SELECT * FROM contact_messages WHERE id = ?', [id])),
      async list({view = 'todas', limit = 50, before = null} = {}) {
        const cap = Math.min(Math.max(Math.floor(Number(limit)) || 50, 1), 200);
        const where = [MESSAGE_VIEWS[view] || MESSAGE_VIEWS.todas], params = [];
        if (before) { where.push('(created_at < ? OR (created_at = ? AND id < ?))'); params.push(new Date(before.createdAt), new Date(before.createdAt), before.id); }
        return (await all(`SELECT * FROM contact_messages WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ${cap}`, params)).map(toMessage);
      },
      countUnread: async () => Number((await one(`SELECT COUNT(*) AS n FROM contact_messages WHERE ${MESSAGE_VIEWS.novas}`, [])).n),
      async update(id, patch) {
        const fields = Object.keys(patch).filter(f => MESSAGE_COLUMNS[f] && !['id', 'createdAt'].includes(f));
        if (fields.length) await run(`UPDATE contact_messages SET ${fields.map(f => `${MESSAGE_COLUMNS[f]} = ?`).join(', ')} WHERE id = ?`, [...fields.map(f => patch[f] ?? null), id]);
        return toMessage(await one('SELECT * FROM contact_messages WHERE id = ?', [id]));
      },
      remove: async id => (await run('DELETE FROM contact_messages WHERE id = ?', [id])).affectedRows === 1
    },
    adminSessions: {
      create: s => run('INSERT INTO admin_sessions (token_hash, admin_id, mfa_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)', [s.tokenHash, s.adminId, s.mfaAt ?? null, s.expiresAt, s.ip ?? null, s.userAgent ?? null]),
      find: async tokenHash => toAdminSession(await one('SELECT * FROM admin_sessions WHERE token_hash = ?', [tokenHash])),
      async recordAttempt(tokenHash) { await run('UPDATE admin_sessions SET attempts = attempts + 1 WHERE token_hash = ?', [tokenHash]); return (await one('SELECT attempts FROM admin_sessions WHERE token_hash = ?', [tokenHash]))?.attempts ?? 0; },
      revoke: (tokenHash, now) => run('UPDATE admin_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL', [now, tokenHash]),
      revokeAllFor: (adminId, now) => run('UPDATE admin_sessions SET revoked_at = ? WHERE admin_id = ? AND revoked_at IS NULL', [now, adminId])
    },
    adminAudit: {
      add: ({adminId = null, action, detail = null, ip = null}) => run('INSERT INTO admin_audit (admin_id, action, detail, ip) VALUES (?, ?, ?, ?)', [adminId, String(action).slice(0, 40), detail === null ? null : String(detail).slice(0, 300), ip === null ? null : String(ip).slice(0, 64)]),
      async list(limit = 100) { return (await all(`SELECT * FROM admin_audit ORDER BY id DESC LIMIT ${Math.min(Number(limit) || 100, 1000)}`, [])).map(a => ({id: a.id, adminId: a.admin_id, action: a.action, detail: a.detail, ip: a.ip, createdAt: a.created_at})); }
    },
    // Google / Apple sign-in (db/migrations/014_login_social.sql). They go with the customer (ON DELETE CASCADE).
    identities: {
      find: async (provider, subject) => toIdentity(await one('SELECT * FROM customer_identities WHERE provider = ? AND subject = ?', [provider, subject])),
      async create(data) {
        try {
          await run('INSERT INTO customer_identities (provider, subject, customer_id, email, private_email, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [data.provider, data.subject, data.customerId, data.email ?? null, data.privateEmail ? 1 : 0, data.createdAt ?? new Date(), data.lastLoginAt ?? null]);
        } catch (error) { if (error?.code === 'ER_DUP_ENTRY') throw Object.assign(new Error('duplicate identity'), {code: 'identity_exists'}); throw error; }
        return toIdentity(await one('SELECT * FROM customer_identities WHERE provider = ? AND subject = ?', [data.provider, data.subject]));
      },
      touch: async (provider, subject, {at, email = null}) => (await run('UPDATE customer_identities SET last_login_at = ?, email = COALESCE(?, email) WHERE provider = ? AND subject = ?', [at, email, provider, subject])).affectedRows === 1,
      remove: async (provider, subject) => (await run('DELETE FROM customer_identities WHERE provider = ? AND subject = ?', [provider, subject])).affectedRows === 1,
      listByCustomer: async customerId => (await all('SELECT * FROM customer_identities WHERE customer_id = ? ORDER BY created_at', [customerId])).map(toIdentity)
    },
    sessions: {
      create: s => run('INSERT INTO sessions (token_hash, customer_id, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?)', [s.tokenHash, s.customerId, s.expiresAt, s.ip, s.userAgent]),
      find: async tokenHash => toSession(await one('SELECT * FROM sessions WHERE token_hash = ?', [tokenHash])),
      touch: (tokenHash, expiresAt, now) => run('UPDATE sessions SET expires_at = ?, last_seen_at = ? WHERE token_hash = ?', [expiresAt, now, tokenHash]),
      revoke: (tokenHash, now) => run('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL', [now, tokenHash]),
      revokeAllFor: (customerId, now) => run('UPDATE sessions SET revoked_at = ? WHERE customer_id = ? AND revoked_at IS NULL', [now, customerId])
    },
    challenges: {
      create: c => run('INSERT INTO auth_challenges (id, email, purpose, code_hash, expires_at) VALUES (?, ?, ?, ?, ?)', [c.id, c.email, c.purpose, c.codeHash, c.expiresAt]),
      find: async id => toChallenge(await one('SELECT * FROM auth_challenges WHERE id = ?', [id])),
      async recordAttempt(id) { await run('UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = ?', [id]); return (await one('SELECT attempts FROM auth_challenges WHERE id = ?', [id]))?.attempts ?? 0; },
      markVerified: (id, grantHash, grantExpiresAt, now) => run('UPDATE auth_challenges SET verified_at = ?, grant_hash = ?, grant_expires_at = ? WHERE id = ?', [now, grantHash, grantExpiresAt, id]),
      findByGrant: async grantHash => toChallenge(await one('SELECT * FROM auth_challenges WHERE grant_hash = ?', [grantHash])),
      // The UPDATE only matches an unused row, so exactly one caller wins even with two requests at the same time.
      async markUsed(id, now) { return (await run('UPDATE auth_challenges SET used_at = ? WHERE id = ? AND used_at IS NULL', [now, id])).affectedRows === 1; }
    },
    // Data kept only as long as needed (Política de Privacidade): attempt counters for a day, e-mailed codes for 30 days,
    // expired sessions (they hold the IP of each access) for the 6 months of the Marco Civil, contact messages for 12
    // months (spam for 30 days). Runs now and then from rateLimit, so no scheduled job is needed.
    async purge(now) {
      const day = 86400000, before = days => new Date(now - days * day);
      await run('DELETE FROM rate_limits WHERE window_start < ?', [now - day]);
      await run('DELETE FROM contact_messages WHERE created_at < ?', [before(365)]);
      await run("DELETE FROM contact_messages WHERE status = 'spam' AND created_at < ?", [before(30)]);
      await run('DELETE FROM auth_challenges WHERE expires_at < ?', [before(30)]);
      await run('DELETE FROM sessions WHERE expires_at < ?', [before(183)]);
      await run('DELETE FROM admin_sessions WHERE expires_at < ?', [before(183)]);
      await run('DELETE FROM integration_log WHERE created_at < ?', [before(90)]);
    },
    async rateLimit(bucket, limit, windowMs, now) {
      const start = Math.floor(now / windowMs) * windowMs;
      await run('INSERT INTO rate_limits (bucket, window_start, hits) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE hits = hits + 1', [bucket.slice(0, 200), start]);
      const {hits} = await one('SELECT hits FROM rate_limits WHERE bucket = ? AND window_start = ?', [bucket.slice(0, 200), start]);
      if (Math.random() < 0.01) this.purge(now).catch(error => console.error('db: cleanup failed —', error.code || error.message));
      return hits <= limit ? {ok: true} : {ok: false, retryAfter: Math.ceil((start + windowMs - now) / 1000)};
    }
  };
}

module.exports = {createMysqlStore, toCustomer};
