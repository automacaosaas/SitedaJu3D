'use strict';
// MySQL/MariaDB store (tables in db/migrations/001_contas.sql). Same interface as store-memory.js. Every query uses
// placeholders; values never go into the SQL text.
const COLUMNS = {
  id: 'id', email: 'email', emailVerifiedAt: 'email_verified_at', displayName: 'display_name', firstName: 'first_name', lastName: 'last_name',
  passwordHash: 'password_hash', cpfEnc: 'cpf_enc', cpfIndex: 'cpf_index', phoneEnc: 'phone_enc', companyCnpj: 'company_cnpj', companyName: 'company_name',
  companyIe: 'company_ie', marketingOptIn: 'marketing_opt_in', marketingConsentAt: 'marketing_consent_at', createdAt: 'created_at'
};

function toCustomer(row) {
  if (!row) return null;
  const customer = {};
  for (const [field, column] of Object.entries(COLUMNS)) customer[field] = row[column] ?? null;
  customer.marketingOptIn = Boolean(row.marketing_opt_in);
  return customer;
}
const toSession = row => row && {tokenHash: row.token_hash, customerId: row.customer_id, createdAt: row.created_at, lastSeenAt: row.last_seen_at, expiresAt: row.expires_at, revokedAt: row.revoked_at, ip: row.ip, userAgent: row.user_agent};
const toChallenge = row => row && {id: row.id, email: row.email, purpose: row.purpose, codeHash: row.code_hash, attempts: row.attempts, createdAt: row.created_at, expiresAt: row.expires_at, verifiedAt: row.verified_at, grantHash: row.grant_hash, grantExpiresAt: row.grant_expires_at, usedAt: row.used_at};

function createMysqlStore(pool) {
  const one = async (sql, params) => { const [rows] = await pool.execute(sql, params); return rows[0] || null; };
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
      }
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
    async rateLimit(bucket, limit, windowMs, now) {
      const start = Math.floor(now / windowMs) * windowMs;
      await run('INSERT INTO rate_limits (bucket, window_start, hits) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE hits = hits + 1', [bucket.slice(0, 200), start]);
      const {hits} = await one('SELECT hits FROM rate_limits WHERE bucket = ? AND window_start = ?', [bucket.slice(0, 200), start]);
      if (Math.random() < 0.01) run('DELETE FROM rate_limits WHERE window_start < ?', [now - 86400000]).catch(() => {});
      return hits <= limit ? {ok: true} : {ok: false, retryAfter: Math.ceil((start + windowMs - now) / 1000)};
    }
  };
}

module.exports = {createMysqlStore, toCustomer};
