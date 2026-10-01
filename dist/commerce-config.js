// Demonstration values only. Production prices must come from a server catalog.
export const COMMERCE = Object.freeze({
  mode: 'demo', currency: 'BRL', pixDurationMs: 15 * 60 * 1000,
  shippingCents: 1800, productionLabel: '5 a 7 dias úteis (exemplo)',
  whatsapp: '',
  pixDiscountPercent: 5,   // Pix pays this much less on the pieces (never on the delivery); the server applies the same rule
  prices: Object.freeze({borboletoscopio: 12900, dinossauroscopio: 13900, aviaoscopia: 15900})
});
export const money = cents => new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(cents / 100);
// Pix: the server's rule (api/_lib/catalog.js), rounded per unit, so the page always shows what Mercado Pago will charge.
export const pixUnitDiscount = unitCents => Math.round(unitCents * COMMERCE.pixDiscountPercent / 100);
export const pixPrice = unitCents => unitCents - pixUnitDiscount(unitCents);
