// Demonstration values only. Production prices must come from a server catalog.
export const COMMERCE = Object.freeze({
  mode: 'demo', currency: 'BRL', pixDurationMs: 15 * 60 * 1000,
  shippingCents: 1800, productionLabel: '5 a 7 dias úteis (exemplo)',
  whatsapp: '',
  prices: Object.freeze({borboletoscopio: 12900, dinossauroscopio: 13900, aviaoscopia: 15900})
});
export const money = cents => new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(cents / 100);
