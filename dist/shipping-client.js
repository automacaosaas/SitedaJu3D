// Real shipping in the checkout: asks the server for the options of a CEP (POST /api/shipping/quote). The server prices the delivery
// from the shop's Correios contract; this file only shows what it answers and never sends a price. When the server says "off"
// (no Correios credentials, or the shop's data still incomplete) the checkout keeps its fixed example fee.
const cleanCep = value => String(value ?? '').replace(/\D/g, '');
export const isCep = value => /^\d{8}$/.test(cleanCep(value));

export async function loadShippingConfig({fetchImpl = globalThis.fetch, timeout = 2500} = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetchImpl('/api/shipping/quote', {cache: 'no-store', signal: controller.signal});
    if (!response.ok) return {mode: 'off'};
    const data = await response.json();
    const free = data.freeShipping && Number.isInteger(data.freeShipping.fromCents) && data.freeShipping.fromCents > 0 ? {fromCents: data.freeShipping.fromCents, label: String(data.freeShipping.label || 'PAC')} : null;
    return data.mode === 'correios' ? {mode: 'correios', production: data.production || null, freeShipping: free} : {mode: 'off'};
  } catch { return {mode: 'off'}; }
  finally { clearTimeout(timer); }
}

// → {ok: true, options: [{service, label, priceCents, free, days: {min, max}}]} or {ok: false, error}, where error is one of
// invalid_cep · no_service · too_many_requests · shipping_unavailable (the last also covers a dead network).
export async function quoteShipping({items, cep}, {fetchImpl = globalThis.fetch, timeout = 25000} = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetchImpl('/api/shipping/quote', {
      method: 'POST', cache: 'no-store', signal: controller.signal, headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({cep: cleanCep(cep), items: items.map(({productId, quantity, selection}) => ({productId, quantity, selection}))})
    });
    const data = await response.json().catch(() => null);
    if (response.ok && data?.mode === 'correios' && Array.isArray(data.options)) return {ok: true, options: data.options};
    if (response.ok) return {ok: false, error: 'shipping_unavailable'};
    if (data?.error === 'invalid_request' && data.field === 'cep') return {ok: false, error: 'invalid_cep'};
    if (data?.error === 'no_service') return {ok: false, error: 'no_service'};
    if (response.status === 429 || data?.error === 'too_many_requests') return {ok: false, error: 'too_many_requests'};
    return {ok: false, error: 'shipping_unavailable'};
  } catch { return {ok: false, error: 'shipping_unavailable'}; }
  finally { clearTimeout(timer); }
}

// "20 a 22 dias úteis" · "5 dias úteis" (the site translates the phrase as a whole).
export const formatDays = ({min, max}) => min === max ? `${min} dias úteis` : `${min} a ${max} dias úteis`;

// Texts for what can go wrong, in Portuguese (the site translates them like the rest of the page).
export function shippingMessage(error, field) {
  if (error === 'no_service' || error === 'invalid_cep' || (error === 'invalid_request' && field === 'cep')) return 'Não encontramos envio para esse CEP. Confira o CEP ou fale com a Ju.';
  if (error === 'too_many_requests') return 'Muitas consultas seguidas. Aguarde alguns instantes e tente de novo.';
  if (error === 'shipping_changed') return 'O valor do frete mudou. Confira o novo valor antes de pagar.';
  if (error === 'invalid_request' && field === 'shipping') return 'Escolha uma forma de envio.';
  return 'Não conseguimos calcular o frete agora. Tente de novo em instantes.';
}
