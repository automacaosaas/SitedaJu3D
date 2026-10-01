// "Frete grátis a partir de R$ 500" wherever the buyer sees prices: the product, the cart and the checkout. The threshold
// and its service come from the server (GET /api/shipping/quote, shipping-config.js on the server); nothing here decides
// it. Without real shipping, or without free shipping configured, every function returns an empty string.
import {money} from './commerce-config.js';

// {reached, missingCents, ratio} for a subtotal, or null when there is no free shipping.
export function freeShippingProgress(freeShipping, subtotalCents) {
  if (!freeShipping?.fromCents) return null;
  const subtotal = Math.max(0, Number(subtotalCents) || 0), missingCents = Math.max(0, freeShipping.fromCents - subtotal);
  return {reached: missingCents === 0, missingCents, ratio: Math.min(1, subtotal / freeShipping.fromCents)};
}

// The progress line with its bar: "Faltam R$ 112,00 para o frete grátis (PAC)." or "Frete grátis (PAC) garantido!".
export function freeShippingBar(freeShipping, subtotalCents) {
  const progress = freeShippingProgress(freeShipping, subtotalCents);
  if (!progress) return '';
  const label = String(freeShipping.label || 'PAC').replace(/[^\p{L}\p{N} ]/gu, '');
  const text = progress.reached ? `<strong>Frete grátis (${label}) garantido!</strong>` : `Faltam <strong>${money(progress.missingCents)}</strong> para o frete grátis (${label}).`;
  return `<div class="free-ship${progress.reached ? ' is-reached' : ''}"><p>${text}</p><span class="free-ship-track" aria-hidden="true"><i style="--free-ship:${progress.ratio.toFixed(3)}"></i></span></div>`;
}

// The short note for the product: "Frete grátis (PAC) em compras a partir de R$ 500,00".
export function freeShippingNote(freeShipping) {
  if (!freeShipping?.fromCents) return '';
  const label = String(freeShipping.label || 'PAC').replace(/[^\p{L}\p{N} ]/gu, '');
  return `Frete grátis (${label}) em compras a partir de ${money(freeShipping.fromCents)}`;
}
