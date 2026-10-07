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
  // o e-mail da Ju: o "entre em contato" das descrições abre ele (contact-link.js)
  contactEmail: 'juimprimepramim@gmail.com',
  // Preços confirmados em 05/10/2026. extraPrices: o preço de cada unidade a partir da segunda da mesma peça na mesma compra (o 2.º
  // avião sai por R$ 215). O servidor tem a mesma tabela (api/_lib/catalog.js); tests/payments.mjs falha se as duas se separarem.
  prices: Object.freeze({borboletoscopio: 26500, dinossauroscopio: 26500, aviaoscopia: 28500, macacoscopio: 9000, girafoscopio: 9000, unicornioscopio: 9000}),
  extraPrices: Object.freeze({aviaoscopia: 21500}),
  // Kits (07/10/2026): as peças de um kit, misturadas na mesma compra, saem em grupos com preço fechado — as lâmpadas (macaco, girafa e
  // unicórnio, R$ 90 cada): 2 por R$ 160 e 3 por R$ 210. Os grupos maiores primeiro; o que sobra sem grupo paga o preço cheio (4 lâmpadas:
  // R$ 210 + R$ 90). O servidor tem a mesma tabela (api/_lib/catalog.js KITS).
  kits: Object.freeze({lampadas: Object.freeze({items: Object.freeze(['macacoscopio', 'girafoscopio', 'unicornioscopio']), groups: Object.freeze({2: 16000, 3: 21000})})})
});
// o kit de uma peça (o id em COMMERCE.kits) e a frase da oferta: "Leve 2 por R$ 160,00 ou 3 por R$ 210,00 (pode misturar)"
export const kitOf = productId => Object.keys(COMMERCE.kits || {}).find(id => COMMERCE.kits[id].items.includes(productId)) || null;
export const kitOffer = productId => { const kit = kitOf(productId); if (!kit) return ''; const g = COMMERCE.kits[kit].groups; return Object.keys(g).map(Number).sort((a, b) => a - b).map((n, i) => `${i ? '' : 'Leve '}${n} por ${money(g[n])}`).join(' ou ') + ' (pode misturar)'; };
export const money = cents => new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(cents / 100);
// "3x de R$ 43,00": the amount split into the interest-free installments, with nothing added (rounded down to the cent, as
// Mercado Pago shows the installment; the last one carries the leftover cents).
export const installmentCents = cents => Math.floor(cents / COMMERCE.interestFreeInstallments);
export const installmentLabel = cents => `${COMMERCE.interestFreeInstallments}x de ${money(installmentCents(cents))}`;
// Pix: the server's rule (api/_lib/catalog.js), rounded per unit, so the page always shows what Mercado Pago will charge.
export const pixUnitDiscount = unitCents => Math.round(unitCents * COMMERCE.pixDiscountBps / 10000);
export const pixPercent = COMMERCE.pixDiscountBps / 100;
export const pixPrice = unitCents => unitCents - pixUnitDiscount(unitCents);
