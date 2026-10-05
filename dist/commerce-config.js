// Demonstration values only. Production prices must come from a server catalog.
export const COMMERCE = Object.freeze({
  mode: 'demo', currency: 'BRL', pixDurationMs: 15 * 60 * 1000,
  shippingCents: 1800, productionLabel: '3 a 5 dias úteis',
  // Pix pays 5% less on the pieces (not on delivery), in basis points. The server applies the same rule
  // (api/_lib/catalog.js PIX_DISCOUNT_BPS); tests/payments.mjs fails if the two drift apart.
  pixDiscountBps: 500,
  whatsapp: '',
  // Preços confirmados em 05/10/2026. extraPrices: o preço de cada unidade a partir da segunda da mesma peça na mesma compra (o 2.º
  // avião sai por R$ 215). O servidor tem a mesma tabela (api/_lib/catalog.js); tests/payments.mjs falha se as duas se separarem.
  prices: Object.freeze({borboletoscopio: 26500, dinossauroscopio: 26500, aviaoscopia: 28500}),
  extraPrices: Object.freeze({aviaoscopia: 21500})
});
export const money = cents => new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(cents / 100);
// Pix: the server's rule (api/_lib/catalog.js), rounded per unit, so the page always shows what Mercado Pago will charge.
export const pixUnitDiscount = unitCents => Math.round(unitCents * COMMERCE.pixDiscountBps / 10000);
export const pixPercent = COMMERCE.pixDiscountBps / 100;
export const pixPrice = unitCents => unitCents - pixUnitDiscount(unitCents);
