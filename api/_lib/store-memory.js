'use strict';
// In-memory store with the same interface as store-mysql.js. Used by tests and, outside production, when no database is
// configured (local server, test site before the database exists). Data disappears when the process restarts.
function createMemoryStore() {
  const customers = new Map(), sessions = new Map(), challenges = new Map(), limits = new Map(), orders = new Map(), events = [];
  const admins = new Map(), adminSessions = new Map(), audit = [], invoices = new Map(), integrations = new Map(), cashEntries = new Map(), bills = new Map();
  let eventSerial = 0, auditSerial = 0;
  const key = buffer => Buffer.from(buffer).toString('hex');
  const copy = value => value && structuredClone(value);

  return {
    kind: 'memory',
    customers: {
      async findByEmail(email) { return copy([...customers.values()].find(c => c.email === email) || null); },
      async findById(id) { return copy(customers.get(id) || null); },
      async findByCpfIndex(index) { return copy([...customers.values()].find(c => c.cpfIndex && key(c.cpfIndex) === key(index)) || null); },
      async create(data) {
        if ([...customers.values()].some(c => c.email === data.email)) throw Object.assign(new Error('duplicate email'), {code: 'account_exists'});
        const row = {emailVerifiedAt: null, displayName: '', firstName: null, lastName: null, passwordHash: null, cpfEnc: null, cpfIndex: null, phoneEnc: null, companyCnpj: null, companyName: null, companyIe: null, marketingOptIn: false, marketingConsentAt: null, termsVersion: null, termsAcceptedAt: null, createdAt: new Date(), ...data};
        customers.set(row.id, row);
        return copy(row);
      },
      async update(id, patch) {
        const row = customers.get(id);
        if (!row) return null;
        if (patch.cpfIndex && [...customers.values()].some(c => c.id !== id && c.cpfIndex && key(c.cpfIndex) === key(patch.cpfIndex))) throw Object.assign(new Error('duplicate cpf'), {code: 'cpf_in_use'});
        Object.assign(row, patch);
        return copy(row);
      },
      // Account deletion: sessions and codes go; orders stay (fiscal records) without the link to the account.
      async delete(id) {
        const row = customers.get(id);
        if (!row) return false;
        customers.delete(id);
        for (const [k, s] of sessions) if (s.customerId === id) sessions.delete(k);
        for (const [k, c] of challenges) if (c.email === row.email) challenges.delete(k);
        for (const o of orders.values()) if (o.customerId === id) o.customerId = null;
        return true;
      }
    },
    orders: {
      // Same reference (a retried payment attempt) returns the existing order instead of a second one.
      async create(order) {
        const existing = [...orders.values()].find(o => o.reference === order.reference);
        if (existing) return {order: copy(existing), created: false};
        const row = {paymentState: null, method: null, installments: null, mpOrderId: null, paidAt: null, decidedAt: null, declineReason: null, shippingInfo: null, refundState: null, refundId: null, refundedAt: null, refundError: null, ownerNotifiedAt: null, customerNotifiedAt: null, termsVersion: null, termsAcceptedAt: null, notes: '', lang: 'pt-BR', createdAt: new Date(), ...order};
        orders.set(row.id, row);
        return {order: copy(row), created: true};
      },
      async findById(id) { return copy(orders.get(id) || null); },
      async findByReference(reference) { return copy([...orders.values()].find(o => o.reference === reference) || null); },
      async findByMpId(mpOrderId) { return copy([...orders.values()].find(o => o.mpOrderId && o.mpOrderId === mpOrderId) || null); },
      async update(id, patch) { const row = orders.get(id); if (!row) return null; Object.assign(row, patch); return copy(row); },
      // Applies `patch` only while the order is still in one of `from`; true for exactly one caller.
      async transition(id, from, patch) { const row = orders.get(id); if (!row || !from.includes(row.status)) return false; Object.assign(row, patch); return true; },
      async listByCustomer(customerId, limit = 50) { return copy([...orders.values()].filter(o => o.customerId === customerId).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit)); },
      async list({statuses = null, limit = 500} = {}) { return copy([...orders.values()].filter(o => !statuses || statuses.includes(o.status)).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit)); },
      // Painel: one page of orders, newest first (ties by id), starting right below `before` ({createdAt, id}).
      async listForAdmin({statuses, limit = 100, before = null}) {
        const cap = Math.min(Math.max(Math.floor(Number(limit)) || 100, 1), 500), below = o => !before || o.createdAt < before.createdAt || (+o.createdAt === +before.createdAt && o.id < before.id);
        return copy([...orders.values()].filter(o => statuses.includes(o.status) && below(o)).sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)).slice(0, cap));
      },
      // Fluxo de caixa: every paid order, with only what the cash flow shows.
      async listForCash({statuses}) {
        return copy([...orders.values()].filter(o => statuses.includes(o.status) && o.paidAt).sort((a, b) => b.paidAt - a.paidAt)
          .map(o => ({id: o.id, reference: o.reference, source: o.source, totalCents: o.totalCents, paidAt: o.paidAt, refundState: o.refundState ?? null, refundedAt: o.refundedAt ?? null, decidedAt: o.decidedAt ?? null, items: (o.items || []).map(i => ({title: i.title, quantity: i.quantity}))})));
      },
      async addEvent(orderId, kind, detail = null, actor = null) { events.push({id: ++eventSerial, orderId, kind, detail, actor, createdAt: new Date()}); },
      async events(orderId) { return copy(events.filter(e => e.orderId === orderId)); }
    },
    // Painel da Ju (db/migrations/003_painel.sql).
    admins: {
      async count() { return admins.size; },
      async findByEmail(email) { return copy([...admins.values()].find(a => a.email === email) || null); },
      async findById(id) { return copy(admins.get(id) || null); },
      async create(data) {
        if ([...admins.values()].some(a => a.email === data.email)) throw Object.assign(new Error('duplicate email'), {code: 'admin_exists'});
        const row = {totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null, lastLoginAt: null, createdAt: new Date(), ...data};
        admins.set(row.id, row);
        return copy(row);
      },
      async update(id, patch) { const row = admins.get(id); if (!row) return null; Object.assign(row, patch); return copy(row); },
      // Accepts a TOTP step only if it is newer than the last one used: true for exactly one caller.
      async useStep(id, step) { const row = admins.get(id); if (!row || (row.totpLastStep !== null && row.totpLastStep >= step)) return false; row.totpLastStep = step; return true; }
    },
    // NF-e: one per order (db/migrations/007_notas_fiscais.sql).
    invoices: {
      async create(data) {
        const existing = [...invoices.values()].find(i => i.orderId === data.orderId);
        if (existing) return {invoice: copy(existing), created: false};
        const row = {providerId: null, number: null, series: null, accessKey: null, pdfUrl: null, xmlUrl: null, message: null, attempts: 0, authorizedAt: null, customerNotifiedAt: null, createdAt: new Date(), updatedAt: new Date(), ...data};
        invoices.set(row.id, row);
        return {invoice: copy(row), created: true};
      },
      async findById(id) { return copy(invoices.get(id) || null); },
      async findByOrder(orderId) { return copy([...invoices.values()].find(i => i.orderId === orderId) || null); },
      async update(id, patch) { const row = invoices.get(id); if (!row) return null; Object.assign(row, patch, {updatedAt: new Date()}); return copy(row); },
      async listByOrders(orderIds) { const ids = new Set(orderIds); return copy([...invoices.values()].filter(i => ids.has(i.orderId))); }
    },
    // Connections to outside services, one row per name (db/migrations/008_bling.sql): tokens encrypted, dates, pause.
    integrations: {
      async get(name) { return copy(integrations.get(name) || null); },
      async save(name, patch) {
        const row = integrations.get(name) || {name, tokensEnc: null, accessExpiresAt: null, refreshExpiresAt: null, connectedBy: null, connectedAt: null, refreshedAt: null, pausedReason: null};
        Object.assign(row, patch, {name, updatedAt: new Date()});
        integrations.set(name, row);
        return copy(row);
      },
      async remove(name) { integrations.delete(name); }
    },
    // Fluxo de caixa (db/migrations/009_caixa.sql): entries Ju adds by hand and the bills to pay. Days are "YYYY-MM-DD".
    // Same sums as the MySQL store: orders and refunds before an instant, entries and paid bills up to a day.
    async cashBalance({statuses, refundStates, before, until}) {
      const at = value => new Date(value).getTime(), limit = at(before);
      let cents = 0;
      for (const o of orders.values()) {
        if (!statuses.includes(o.status) || !o.paidAt) continue;
        if (at(o.paidAt) < limit) cents += o.totalCents;
        if (refundStates.includes(o.refundState) && at(o.refundedAt || o.decidedAt || o.paidAt) < limit) cents -= o.totalCents;
      }
      for (const e of cashEntries.values()) if (e.occurredOn <= until) cents += e.kind === 'entrada' ? e.amountCents : -e.amountCents;
      for (const b of bills.values()) if (b.paidOn && b.paidOn <= until) cents -= b.amountCents;
      return cents;
    },
    cashEntries: {
      async create(data) { const row = {createdBy: null, createdAt: new Date(), ...data}; cashEntries.set(row.id, row); return copy(row); },
      async list(limit = 5000) { return copy([...cashEntries.values()].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt - a.createdAt).slice(0, limit)); },
      // The removed row, or null when there was none.
      async remove(id) { const row = cashEntries.get(id); if (!row) return null; cashEntries.delete(id); return copy(row); }
    },
    bills: {
      async create(data) { const row = {paidOn: null, lockedAt: null, createdBy: null, createdAt: new Date(), ...data}; bills.set(row.id, row); return copy(row); },
      async findById(id) { return copy(bills.get(id) || null); },
      async list(limit = 5000) { return copy([...bills.values()].sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.createdAt - b.createdAt).slice(0, limit)); },
      async setPaid(id, paidOn) { const row = bills.get(id); if (!row) return null; row.paidOn = paidOn; return copy(row); },
      async setLocked(id, lockedAt) { const row = bills.get(id); if (!row) return null; row.lockedAt = lockedAt; return copy(row); },
      async remove(id) { const row = bills.get(id); if (!row) return null; bills.delete(id); return copy(row); }
    },
    adminSessions: {
      async create(session) { adminSessions.set(key(session.tokenHash), {mfaAt: null, attempts: 0, revokedAt: null, createdAt: new Date(), ...session}); },
      async find(tokenHash) { return copy(adminSessions.get(key(tokenHash)) || null); },
      async recordAttempt(tokenHash) { const s = adminSessions.get(key(tokenHash)); if (s) s.attempts += 1; return s ? s.attempts : 0; },
      async revoke(tokenHash, now) { const s = adminSessions.get(key(tokenHash)); if (s && !s.revokedAt) s.revokedAt = now; },
      async revokeAllFor(adminId, now) { for (const s of adminSessions.values()) if (s.adminId === adminId && !s.revokedAt) s.revokedAt = now; }
    },
    adminAudit: {
      async add({adminId = null, action, detail = null, ip = null}) { audit.push({id: ++auditSerial, adminId, action, detail, ip, createdAt: new Date()}); },
      async list(limit = 100) { return copy(audit.slice(-limit).reverse()); }
    },
    sessions: {
      async create(session) { sessions.set(key(session.tokenHash), {revokedAt: null, lastSeenAt: new Date(), ...session}); },
      async find(tokenHash) { return copy(sessions.get(key(tokenHash)) || null); },
      async touch(tokenHash, expiresAt, now) { const s = sessions.get(key(tokenHash)); if (s) Object.assign(s, {expiresAt, lastSeenAt: now}); },
      async revoke(tokenHash, now) { const s = sessions.get(key(tokenHash)); if (s) s.revokedAt = now; },
      async revokeAllFor(customerId, now) { for (const s of sessions.values()) if (s.customerId === customerId && !s.revokedAt) s.revokedAt = now; }
    },
    challenges: {
      async create(challenge) { challenges.set(challenge.id, {attempts: 0, verifiedAt: null, grantHash: null, grantExpiresAt: null, usedAt: null, ...challenge}); },
      async find(id) { return copy(challenges.get(id) || null); },
      async recordAttempt(id) { const c = challenges.get(id); if (c) c.attempts += 1; return c ? c.attempts : 0; },
      async markVerified(id, grantHash, grantExpiresAt, now) { Object.assign(challenges.get(id), {verifiedAt: now, grantHash, grantExpiresAt}); },
      async findByGrant(grantHash) { return copy([...challenges.values()].find(c => c.grantHash && key(c.grantHash) === key(grantHash)) || null); },
      // Returns true only for the first caller, so a grant or a code is spent exactly once.
      async markUsed(id, now) { const c = challenges.get(id); if (!c || c.usedAt) return false; c.usedAt = now; return true; }
    },
    // Same retention as store-mysql.js: counters 1 day, codes 30 days, expired sessions 6 months.
    async purge(now) {
      const day = 86400000, old = (value, days) => new Date(value).getTime() < now - days * day;
      for (const k of limits.keys()) if (Number(k.split('|').pop()) < now - day) limits.delete(k);
      for (const [k, c] of challenges) if (old(c.expiresAt, 30)) challenges.delete(k);
      for (const [k, s] of sessions) if (old(s.expiresAt, 183)) sessions.delete(k);
      for (const [k, s] of adminSessions) if (old(s.expiresAt, 183)) adminSessions.delete(k);
    },
    // Fixed windows: at most `limit` hits per `windowMs` for a bucket.
    async rateLimit(bucket, limit, windowMs, now) {
      const start = Math.floor(now / windowMs) * windowMs, id = `${bucket}|${start}`;
      const hits = (limits.get(id) || 0) + 1;
      limits.set(id, hits);
      if (limits.size > 10000) await this.purge(now);
      return hits <= limit ? {ok: true} : {ok: false, retryAfter: Math.ceil((start + windowMs - now) / 1000)};
    }
  };
}

module.exports = {createMemoryStore};
