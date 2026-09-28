'use strict';
// Personal data: validation (CPF, CNPJ, phone), masking for display, and encryption of the fields that stay secret in
// the database. CPF and phone are stored with AES-256-GCM (DATA_KEY); CPF also gets a keyed HMAC "blind index"
// (INDEX_KEY) so the database can enforce one account per CPF without holding the number in clear text.
const crypto = require('node:crypto');
const {isProduction} = require('./runtime');

const digits = value => String(value ?? '').replace(/\D/g, '');

function validCpf(value) {
  const d = digits(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const length of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(d[i]) * (length + 1 - i);
    if ((sum * 10) % 11 % 10 !== Number(d[length])) return false;
  }
  return true;
}

// CNPJ: 12 characters (digits, or letters for the alphanumeric CNPJ issued since July 2026) plus 2 check digits.
// Each character counts as its ASCII code minus 48, so digits keep their value and letters count from 17 (A) up.
const normalizeCnpj = value => String(value ?? '').toUpperCase().replace(/[.\-/\s]/g, '');
function validCnpj(value) {
  const c = normalizeCnpj(value);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(.)\1{13}$/.test(c)) return false;
  const check = (base, weights) => {
    const rest = [...base].reduce((sum, ch, i) => sum + (ch.charCodeAt(0) - 48) * weights[i], 0) % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const first = check(c.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = check(c.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return c.endsWith(`${first}${second}`);
}

// Brazilian phone with area code: 10 digits (landline) or 11 (mobile, starting with 9). A leading 55 is dropped.
function normalizePhone(value) {
  const d = digits(value).replace(/^55(?=\d{10,11}$)/, '');
  return /^[1-9]{2}(9\d{8}|[2-8]\d{7})$/.test(d) ? d : null;
}

const maskCpf = cpf => `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`;
const formatCnpj = c => `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
const formatPhone = p => p.length === 11 ? `(${p.slice(0, 2)}) ${p.slice(2, 7)}-${p.slice(7)}` : `(${p.slice(0, 2)}) ${p.slice(2, 6)}-${p.slice(6)}`;

// Keys: 32 random bytes in base64 (see HOSTINGER-SETUP.md). Outside production, missing keys fall back to fixed
// development keys so the local and test sites work; in production they are required.
const DEV_DATA = crypto.createHash('sha256').update('ju-imprime-pra-mim:dev-only:data').digest();
const DEV_INDEX = crypto.createHash('sha256').update('ju-imprime-pra-mim:dev-only:index').digest();
function readKey(value, fallback, env, name) {
  const key = value ? Buffer.from(String(value).trim(), 'base64') : null;
  if (key && key.length === 32) return key;
  if (key || isProduction(env)) throw Object.assign(new Error(`${name} must be 32 bytes in base64`), {code: 'data_keys_missing'});
  return fallback;
}
function keys(env = process.env) {
  return {data: readKey(env.DATA_KEY, DEV_DATA, env, 'DATA_KEY'), index: readKey(env.INDEX_KEY, DEV_INDEX, env, 'INDEX_KEY')};
}

const VERSION = 1;
function encrypt(env, text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keys(env).data, iv);
  const body = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), body]);
}
function decrypt(env, blob) {
  if (!blob) return null;
  const data = Buffer.from(blob);
  if (data[0] !== VERSION || data.length < 29) throw new Error('unknown field format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keys(env).data, data.subarray(1, 13));
  decipher.setAuthTag(data.subarray(13, 29));
  return Buffer.concat([decipher.update(data.subarray(29)), decipher.final()]).toString('utf8');
}
const blindIndex = (env, kind, value) => crypto.createHmac('sha256', keys(env).index).update(`${kind}:${value}`).digest();

module.exports = {digits, validCpf, validCnpj, normalizeCnpj, normalizePhone, maskCpf, formatCnpj, formatPhone, keys, encrypt, decrypt, blindIndex};
