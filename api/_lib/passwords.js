'use strict';
// Password hashing with scrypt (built into Node, so no native module has to compile on the host). Parameters follow
// OWASP's scrypt table (N=2^14, r=8, p=5: 16 MiB per hash, gentle on shared hosting) and are stored with each hash, so
// they can be raised later: verify() reports when a stored hash uses older parameters and should be recomputed.
const crypto = require('node:crypto');
const {promisify} = require('node:util');
const scrypt = promisify(crypto.scrypt);

const PARAMS = Object.freeze({N: 2 ** 14, r: 8, p: 5});
const KEY_LENGTH = 32;
const MAX_MEMORY = 64 * 1024 * 1024;
const MIN_LENGTH = 8, MAX_LENGTH = 128;

const validPassword = value => typeof value === 'string' && value.length >= MIN_LENGTH && value.length <= MAX_LENGTH;
const prepare = value => String(value).normalize('NFKC');

async function hashPassword(password, params = PARAMS) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(prepare(password), salt, KEY_LENGTH, {...params, maxmem: MAX_MEMORY});
  return `scrypt$${params.N}$${params.r}$${params.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

// Always does the full computation, even for an unknown account (a fixed dummy hash), so response time does not reveal
// whether an e-mail has a password.
const DUMMY = `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${Buffer.alloc(16).toString('base64')}$${Buffer.alloc(KEY_LENGTH).toString('base64')}`;
async function verifyPassword(password, stored) {
  const parts = String(stored || DUMMY).split('$');
  const [kind, N, r, p, salt, hash] = parts.length === 6 ? parts : DUMMY.split('$');
  const params = {N: Number(N), r: Number(r), p: Number(p)};
  if (kind !== 'scrypt' || ![params.N, params.r, params.p].every(Number.isInteger)) return {ok: false, needsRehash: false};
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(prepare(password ?? ''), Buffer.from(salt, 'base64'), expected.length, {...params, maxmem: MAX_MEMORY});
  const ok = Boolean(stored) && actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  return {ok, needsRehash: ok && (params.N !== PARAMS.N || params.r !== PARAMS.r || params.p !== PARAMS.p)};
}

module.exports = {PARAMS, MIN_LENGTH, MAX_LENGTH, validPassword, hashPassword, verifyPassword};
