'use strict';
// In-memory store with the same interface as store-mysql.js. Used by tests and, outside production, when no database is
// configured (local server, test site before the database exists). Data disappears when the process restarts.
function createMemoryStore() {
  const customers = new Map(), sessions = new Map(), challenges = new Map(), limits = new Map();
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
        const row = {emailVerifiedAt: null, displayName: '', firstName: null, lastName: null, passwordHash: null, cpfEnc: null, cpfIndex: null, phoneEnc: null, companyCnpj: null, companyName: null, companyIe: null, marketingOptIn: false, marketingConsentAt: null, createdAt: new Date(), ...data};
        customers.set(row.id, row);
        return copy(row);
      },
      async update(id, patch) {
        const row = customers.get(id);
        if (!row) return null;
        if (patch.cpfIndex && [...customers.values()].some(c => c.id !== id && c.cpfIndex && key(c.cpfIndex) === key(patch.cpfIndex))) throw Object.assign(new Error('duplicate cpf'), {code: 'cpf_in_use'});
        Object.assign(row, patch);
        return copy(row);
      }
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
    // Fixed windows: at most `limit` hits per `windowMs` for a bucket.
    async rateLimit(bucket, limit, windowMs, now) {
      const start = Math.floor(now / windowMs) * windowMs, id = `${bucket}|${start}`;
      const hits = (limits.get(id) || 0) + 1;
      limits.set(id, hits);
      if (limits.size > 10000) for (const k of limits.keys()) if (Number(k.split('|').pop()) < now - 86400000) limits.delete(k);
      return hits <= limit ? {ok: true} : {ok: false, retryAfter: Math.ceil((start + windowMs - now) / 1000)};
    }
  };
}

module.exports = {createMemoryStore};
