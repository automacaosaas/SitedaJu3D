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
