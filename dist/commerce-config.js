// Demonstration values only. Production prices must come from a server catalog.
export const COMMERCE = Object.freeze({
  mode: 'demo', currency: 'BRL', pixDurationMs: 15 * 60 * 1000,
  shippingCents: 1800, productionLabel: '3 a 5 dias úteis',
  // Pix pays 5% less on the pieces (not on delivery), in basis points. The server applies the same rule
  // (api/_lib/catalog.js PIX_DISCOUNT_BPS); tests/payments.mjs fails if the two drift apart.
  pixDiscountBps: 500,
  // The card (decision of 01/10/2026): up to 3 installments without interest, up to 12 on credit. "Sem juros" is a setting
  // of the Mercado Pago account (the shop pays the fee); the site only shows it and offers at most `maxInstallments`.
  interestFreeInstallments: 3, maxInstallments: 12,
  prices: Object.freeze({borboletoscopio: 12900, dinossauroscopio: 13900, aviaoscopia: 15900})
});
export const money = cents => new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(cents / 100);
// "3x de R$ 43,00": the amount split into the interest-free installments, with nothing added (rounded down to the cent, as
// Mercado Pago shows the installment; the last one carries the leftover cents).
export const installmentCents = cents => Math.floor(cents / COMMERCE.interestFreeInstallments);
export const installmentLabel = cents => `${COMMERCE.interestFreeInstallments}x de ${money(installmentCents(cents))}`;
// Pix: the server's rule (api/_lib/catalog.js), rounded per unit, so the page always shows what Mercado Pago will charge.
export const pixUnitDiscount = unitCents => Math.round(unitCents * COMMERCE.pixDiscountBps / 10000);
export const pixPercent = COMMERCE.pixDiscountBps / 100;
export const pixPrice = unitCents => unitCents - pixUnitDiscount(unitCents);
