'use strict';
// Accounts: sign-in by e-mailed code or by password, sessions, and the buyer identification used at checkout (name,
// surname, CPF, phone and, optionally, company data). Storage is injected (store-mysql.js or store-memory.js), so the
// same rules run in production and in the tests.
//
// Flow ("e-mail first"): start → a 6-digit code is e-mailed → verify. An existing account is signed in; a new address
// gets a short, single-use grant to finish the sign-up (name, optional password). "Forgot password" uses the same code
// and a grant to set a new password. start() answers the same way whether or not the address has an account.
const crypto = require('node:crypto');
const {isProduction} = require('./runtime');
const {config, mailReady} = require('./mail');
const fields = require('./fields');
const {validPassword, hashPassword, verifyPassword} = require('./passwords');

const CODE_TTL = 10 * 60 * 1000, RESEND_AFTER = 30 * 1000, MAX_ATTEMPTS = 5, GRANT_TTL = 15 * 60 * 1000;
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000, TOUCH_EVERY = 24 * 60 * 60 * 1000;
const EMAIL = /^[^\s@<>()[\],;:"\\]+@[^\s@<>()[\],;:"\\]+\.[^\s@<>()[\],;:"\\]+$/;
const PURPOSES = ['access', 'reset'];

const fail = (code, extra = {}) => Object.assign(new Error(code), {code, ...extra});
const sha256 = value => crypto.createHash('sha256').update(value).digest();
const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const normalizeEmail = value => String(value ?? '').trim().toLowerCase();
const time = value => new Date(value).getTime();

// Codes are stored as an HMAC, never in clear text. Production needs AUTH_SECRET (or the Resend key it is derived from).
function codeSecret(env) {
  const secret = config(env).secret;
  if (secret) return secret;
  if (isProduction(env)) throw fail('email_not_configured');
  return 'ju-imprime-pra-mim:dev-only:codes';
}

function createAccounts({store, env = process.env, sendCode = async () => {}, now = () => Date.now()}) {
  const date = () => new Date(now());
  const codeHash = (id, code) => crypto.createHmac('sha256', codeSecret(env)).update(`${id}:${code}`).digest();
  async function limit(bucket, max, windowMs) {
    const result = await store.rateLimit(bucket, max, windowMs, now());
    if (!result.ok) throw fail('too_many_requests', {retryAfter: result.retryAfter});
  }

  async function openSession(customer, {ip = '', userAgent = ''} = {}) {
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(now() + SESSION_TTL);
    await store.sessions.create({tokenHash: sha256(token), customerId: customer.id, expiresAt, ip: clean(ip, 64) || null, userAgent: clean(userAgent, 255) || null});
    return {token, expiresAt};
  }

  // A verified grant that has not been spent or expired, or an error. Spending it is a separate, atomic step.
  async function readGrant(grant) {
    if (typeof grant !== 'string' || !/^[\w-]{43}$/.test(grant)) throw fail('invalid_grant');
    const challenge = await store.challenges.findByGrant(sha256(grant));
    if (!challenge || !challenge.verifiedAt || challenge.usedAt || now() >= time(challenge.grantExpiresAt)) throw fail('invalid_grant');
    return challenge;
  }
  async function spend(challenge) { if (!await store.challenges.markUsed(challenge.id, date())) throw fail('invalid_grant'); }

  function publicUser(c) {
    return {
      name: c.displayName || c.firstName || c.email.split('@')[0], email: c.email, hasPassword: Boolean(c.passwordHash),
      profileComplete: Boolean(c.firstName && c.lastName && c.cpfEnc && c.phoneEnc), marketingOptIn: Boolean(c.marketingOptIn)
    };
  }

  function profile(c) {
    const cpf = c.cpfEnc ? fields.decrypt(env, c.cpfEnc) : null, phone = c.phoneEnc ? fields.decrypt(env, c.phoneEnc) : null;
    return {
      email: c.email, firstName: c.firstName || '', lastName: c.lastName || '',
      cpf: cpf ? {masked: fields.maskCpf(cpf)} : null, phone: phone ? fields.formatPhone(phone) : '',
      company: c.companyCnpj ? {cnpj: fields.formatCnpj(c.companyCnpj), name: c.companyName || '', stateRegistration: c.companyIe || ''} : null,
      marketingOptIn: Boolean(c.marketingOptIn)
    };
  }

  return {
    publicUser, profile,

    async start({email, purpose = 'access', lang = 'pt-BR', ip = ''}) {
      email = normalizeEmail(email);
      if (email.length > 180 || !EMAIL.test(email)) throw fail('invalid_email');
      if (!PURPOSES.includes(purpose)) throw fail('invalid_request');
      const canMail = mailReady(config(env));
      if (!canMail && isProduction(env)) throw fail('email_not_configured');
      await limit(`code-wait:${email}`, 1, RESEND_AFTER);
      await limit(`code-email:${email}`, 5, 10 * 60 * 1000);
      await limit(`code-ip:${ip}`, 20, 60 * 60 * 1000);
      const id = crypto.randomUUID(), code = String(crypto.randomInt(0, 1000000)).padStart(6, '0'), expiresAt = new Date(now() + CODE_TTL);
      await store.challenges.create({id, email, purpose, codeHash: codeHash(id, code), expiresAt});
      // The reference carries the address only so the page can show it; the server trusts the id alone.
      const challenge = `${id}.${Buffer.from(email).toString('base64url')}`;
      if (canMail) await sendCode({email, code, challenge, purpose, lang, expiresAt});
      // Without e-mail (local and test sites only) the code comes back so the page can show it, as the preview did.
      return {challenge, email, purpose, expiresAt: expiresAt.getTime(), resendAt: now() + RESEND_AFTER, ...(canMail ? {} : {demoCode: code})};
    },

    async verify({challenge, code, ip = '', userAgent = ''}) {
      const id = String(challenge ?? '').split('.')[0];
      if (!/^[0-9a-f-]{36}$/.test(id)) throw fail('invalid_challenge');
      await limit(`verify-ip:${ip}`, 60, 10 * 60 * 1000);
      const found = await store.challenges.find(id);
      if (!found || found.usedAt || found.verifiedAt) throw fail('invalid_challenge');
      if (now() >= time(found.expiresAt)) throw fail('expired');
      if (found.attempts >= MAX_ATTEMPTS) throw fail('too_many_attempts');
      const attempts = await store.challenges.recordAttempt(id);
      const matches = typeof code === 'string' && /^\d{6}$/.test(code) && crypto.timingSafeEqual(codeHash(id, code), Buffer.from(found.codeHash));
      if (!matches) throw fail(attempts >= MAX_ATTEMPTS ? 'too_many_attempts' : 'invalid_code', {remaining: Math.max(0, MAX_ATTEMPTS - attempts)});

      const customer = await store.customers.findByEmail(found.email);
      if (customer && found.purpose === 'access') {
        if (!await store.challenges.markUsed(id, date())) throw fail('invalid_challenge');
        const verified = customer.emailVerifiedAt ? customer : await store.customers.update(customer.id, {emailVerifiedAt: date()});
        return {status: 'signed_in', user: publicUser(verified), session: await openSession(verified, {ip, userAgent})};
      }
      const grant = crypto.randomBytes(32).toString('base64url');
      await store.challenges.markVerified(id, sha256(grant), new Date(now() + GRANT_TTL), date());
      return {status: customer ? 'reset_allowed' : 'needs_profile', email: found.email, grant};
    },

    async register({grant, name, password, marketingOptIn = false, ip = '', userAgent = ''}) {
      name = clean(name, 100);
      if (name.length < 2) throw fail('invalid_request', {field: 'name'});
      const withPassword = password !== undefined && password !== null && password !== '';
      if (withPassword && !validPassword(password)) throw fail('weak_password', {field: 'password'});
      const challenge = await readGrant(grant);
      if (await store.customers.findByEmail(challenge.email)) throw fail('account_exists');
      await spend(challenge);
      const customer = await store.customers.create({
        id: crypto.randomUUID(), email: challenge.email, emailVerifiedAt: date(), displayName: name,
        passwordHash: withPassword ? await hashPassword(password) : null,
        marketingOptIn: marketingOptIn === true, marketingConsentAt: marketingOptIn === true ? date() : null
      });
      return {user: publicUser(customer), session: await openSession(customer, {ip, userAgent})};
    },

    async login({email, password, ip = '', userAgent = ''}) {
      email = normalizeEmail(email);
      await limit(`login-ip:${ip}`, 30, 15 * 60 * 1000);
      await limit(`login-email:${email}`, 10, 15 * 60 * 1000);
      const customer = EMAIL.test(email) ? await store.customers.findByEmail(email) : null;
      const check = await verifyPassword(String(password ?? ''), customer?.passwordHash);
      if (!customer || !check.ok) throw fail('invalid_credentials');
      if (check.needsRehash) await store.customers.update(customer.id, {passwordHash: await hashPassword(password)});
      return {user: publicUser(customer), session: await openSession(customer, {ip, userAgent})};
    },

    // After "forgot password" + code: sets the new password, signs out every other device and opens a new session.
    async resetPassword({grant, password, ip = '', userAgent = ''}) {
      if (!validPassword(password)) throw fail('weak_password', {field: 'password'});
      const challenge = await readGrant(grant);
      const customer = await store.customers.findByEmail(challenge.email);
      if (!customer) throw fail('invalid_grant');
      await spend(challenge);
      const updated = await store.customers.update(customer.id, {passwordHash: await hashPassword(password), emailVerifiedAt: customer.emailVerifiedAt || date()});
      await store.sessions.revokeAllFor(customer.id, date());
      return {user: publicUser(updated), session: await openSession(updated, {ip, userAgent})};
    },

    async authenticate(token) {
      if (typeof token !== 'string' || !/^[\w-]{43}$/.test(token)) return null;
      const session = await store.sessions.find(sha256(token));
      if (!session || session.revokedAt || now() >= time(session.expiresAt)) return null;
      const customer = await store.customers.findById(session.customerId);
      if (!customer) return null;
      if (now() - time(session.lastSeenAt) > TOUCH_EVERY) await store.sessions.touch(sha256(token), new Date(now() + SESSION_TTL), date());
      return customer;
    },

    async logout(token) { if (typeof token === 'string' && token) await store.sessions.revoke(sha256(token), date()); },

    // Identification before delivery. CPF is required once and afterwards only sent when it changes; company data
    // (pessoa jurídica) goes together or not at all. The state registration is checked by the NF-e issuer later.
    async updateProfile(customer, input = {}) {
      const firstName = clean(input.firstName, 60), lastName = clean(input.lastName, 100);
      if (firstName.length < 2) throw fail('invalid_request', {field: 'firstName'});
      if (lastName.length < 2) throw fail('invalid_request', {field: 'lastName'});
      const phone = fields.normalizePhone(input.phone);
      if (!phone) throw fail('invalid_request', {field: 'phone'});
      const patch = {firstName, lastName, phoneEnc: fields.encrypt(env, phone)};
      if (!customer.displayName) patch.displayName = firstName;

      if (input.cpf !== undefined && input.cpf !== null && input.cpf !== '') {
        const cpf = fields.digits(input.cpf);
        if (!fields.validCpf(cpf)) throw fail('invalid_request', {field: 'cpf'});
        const index = fields.blindIndex(env, 'cpf', cpf);
        const owner = await store.customers.findByCpfIndex(index);
        if (owner && owner.id !== customer.id) throw fail('cpf_in_use', {field: 'cpf'});
        Object.assign(patch, {cpfEnc: fields.encrypt(env, cpf), cpfIndex: index});
      } else if (!customer.cpfEnc) throw fail('invalid_request', {field: 'cpf'});

      const company = input.company;
      if (company && (company.cnpj || company.name || company.stateRegistration)) {
        const cnpj = fields.normalizeCnpj(company.cnpj);
        if (!fields.validCnpj(cnpj)) throw fail('invalid_request', {field: 'cnpj'});
        const name = clean(company.name, 150);
        if (name.length < 2) throw fail('invalid_request', {field: 'companyName'});
        const ie = company.stateRegistrationExempt === true ? 'ISENTO' : clean(company.stateRegistration, 20).toUpperCase().replace(/[^0-9A-Z]/g, '');
        if (!ie) throw fail('invalid_request', {field: 'stateRegistration'});
        Object.assign(patch, {companyCnpj: cnpj, companyName: name, companyIe: ie});
      } else if (company === null) Object.assign(patch, {companyCnpj: null, companyName: null, companyIe: null});

      if (typeof input.marketingOptIn === 'boolean' && input.marketingOptIn !== Boolean(customer.marketingOptIn)) {
        Object.assign(patch, {marketingOptIn: input.marketingOptIn, marketingConsentAt: input.marketingOptIn ? date() : null});
      }
      return profile(await store.customers.update(customer.id, patch));
    }
  };
}

module.exports = {createAccounts, CODE_TTL, RESEND_AFTER, MAX_ATTEMPTS, GRANT_TTL, SESSION_TTL};
