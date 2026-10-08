'use strict';
// "Sem juros" (2026-10-08): how many card installments the shop's Mercado Pago account really gives without interest. That is
// a setting of the account (the shop pays the fee; MERCADOPAGO-VALIDACAO.md says where the owner turns it on), not of the site:
// the site only announces a number (dist/commerce-config.js interestFreeInstallments). Mercado Pago is asked with the Access
// Token for its installment plans on a reference amount, the price of a lamp (the cheapest piece; a larger cart never gets
// fewer), and the answer is kept for hours. /api/payments/config hands the number to the checkout, which never promises more,
// and /api/health shows it to the owner. null = unknown (payments off, or Mercado Pago did not answer): the checkout then
// promises nothing beyond what the buyer's own card table shows. Never throws; only the first ask after a start waits for
// Mercado Pago (at most WAIT_MS), every later one is answered at once from what is kept.
const mp = require('./mercadopago');
const {PRODUCTS} = require('./catalog');

const KEEP_MS = 6 * 60 * 60 * 1000, RETRY_MS = 5 * 60 * 1000;
// The checkout gives /api/payments/config 2.5 s (dist/live-payment.js): a slow first answer is kept for the next visit instead.
const WAIT_MS = 1200;
const REFERENCE_CENTS = Math.min(...Object.values(PRODUCTS).map(p => p.price));
// The two brands most buyers pay with; the account's setting is the same for every card, so the smaller count of the two is kept.
const BRANDS = ['master', 'visa'];

function createInterestFree({fetchImpl = globalThis.fetch, now = () => Date.now(), wait = WAIT_MS} = {}) {
  let kept = null, running = null;   // kept: {token, at, value, failed}; running: the ask in flight, {token, done}
  async function ask(s) {
    const answers = await Promise.all(BRANDS.map(id => mp.installmentOptions({settings: s, fetchImpl, amountCents: REFERENCE_CENTS, paymentMethodId: id}).catch(() => null)));
    const counts = answers.map(answer => mp.interestFreeCount(answer, REFERENCE_CENTS)).filter(Number.isInteger);
    return counts.length ? Math.min(...counts) : null;
  }
  // 0 (interest from 2x on), 2 to 12, or null while unknown.
  return async function interestFree(env = process.env) {
    const s = mp.settings(env);
    if (s.mode === 'off') return null;
    const current = () => kept && kept.token === s.token ? kept.value : null;
    const mine = kept && kept.token === s.token ? kept : null;
    if (mine && now() - mine.at < (mine.failed ? RETRY_MS : KEEP_MS)) return mine.value;
    if (!running || running.token !== s.token) {
      const token = s.token, done = ask(s).catch(() => null).then(value => { kept = {token, at: now(), value, failed: value === null}; }).finally(() => { if (running?.done === done) running = null; });
      running = {token, done};
    }
    // Once these credentials have an answer (even an old one, or null after a failure), it is handed over at once and the new
    // one comes in the background (2026-10-08, review): only the first ask after the site starts waits, and never past `wait`.
    if (mine) return mine.value;
    let timer;
    await Promise.race([running.done, new Promise(resolve => { timer = setTimeout(resolve, wait); timer.unref?.(); })]);
    clearTimeout(timer);
    return current();   // still asking: null for now, the number on a later request
  };
}

// The one the server's own handlers share (api/payments/config.js, api/health.js), with the real fetch. Tests and the local
// server build their own, against a simulated Mercado Pago.
const shared = createInterestFree();

module.exports = {createInterestFree, shared, REFERENCE_CENTS, BRANDS, KEEP_MS, RETRY_MS, WAIT_MS};
