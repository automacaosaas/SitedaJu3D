'use strict';
// Time-based one-time codes (RFC 6238: HMAC-SHA1, 6 digits, 30 s) — the codes shown by Google Authenticator, Microsoft
// Authenticator, 1Password and similar apps. Only Node built-ins.
const crypto = require('node:crypto');

const STEP_SECONDS = 30, DIGITS = 6, SECRET_BYTES = 20;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32(buffer) {
  let bits = 0, value = 0, out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
function fromBase32(text) {
  const clean = String(text).toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error('invalid base32');
    value = (value << 5) | index; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

const newSecret = () => crypto.randomBytes(SECRET_BYTES);
const stepAt = ms => Math.floor(ms / 1000 / STEP_SECONDS);

function codeAt(secret, step, digits = DIGITS) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac('sha1', secret).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const number = ((hmac[offset] & 127) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(number % 10 ** digits).padStart(digits, '0');
}

// The step the code belongs to (one step of clock drift either way), or null. Steps up to `after` are refused, so a
// code that was already used cannot be used again.
function verify(secret, code, {now = Date.now(), window = 1, after = null} = {}) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
  const current = stepAt(now);
  for (let delta = -window; delta <= window; delta++) {
    const step = current + delta;
    if (after !== null && step <= after) continue;
    if (crypto.timingSafeEqual(Buffer.from(codeAt(secret, step)), Buffer.from(code))) return step;
  }
  return null;
}

// What the authenticator app reads from the QR code.
function otpauthUrl({secret, account, issuer = 'Ju imprime pra mim'}) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${base32(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

module.exports = {base32, fromBase32, newSecret, stepAt, codeAt, verify, otpauthUrl, STEP_SECONDS};
