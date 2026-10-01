// Demonstration values only. Production prices must come from a server catalog.
export const COMMERCE = Object.freeze({
  mode: 'demo', currency: 'BRL', pixDurationMs: 15 * 60 * 1000,
  shippingCents: 1800, productionLabel: '3 a 5 dias úteis',
  // Pix pays 5% less on the pieces (not on delivery), in basis points. The server applies the same rule
  // (api/_lib/catalog.js PIX_DISCOUNT_BPS); tests/payments.mjs fails if the two drift apart.
  pixDiscountBps: 500,
  whatsapp: '',
  prices: Object.freeze({borboletoscopio: 12900, dinossauroscopio: 13900, aviaoscopia: 15900})
});
export const money = cents => new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(cents / 100);
