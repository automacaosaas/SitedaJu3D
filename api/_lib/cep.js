'use strict';
// CEP lookup (ViaCEP, public and free): the NF-e needs the IBGE code of the recipient's city, which the delivery form
// does not ask for. Also confirms that the CEP exists and belongs to the state that was typed. Results are cached.
const TIMEOUT_MS = 5000;
const cache = new Map();

async function lookupCep(cep, {fetchImpl = globalThis.fetch} = {}) {
  const digits = String(cep || '').replace(/\D/g, '');
  if (!/^\d{8}$/.test(digits)) return null;
  if (cache.has(digits)) return cache.get(digits);
  const response = await fetchImpl(`https://viacep.com.br/ws/${digits}/json/`, {
    headers: {Accept: 'application/json'},
    ...(typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? {signal: AbortSignal.timeout(TIMEOUT_MS)} : {})
  });
  if (!response.ok) throw Object.assign(new Error(`ViaCEP ${response.status}`), {status: response.status});
  const data = await response.json();
  const found = data && !data.erro && /^\d{7}$/.test(String(data.ibge || '')) ? {cep: digits, city: data.localidade, state: data.uf, cityCode: String(data.ibge)} : null;
  cache.set(digits, found);
  if (cache.size > 5000) cache.delete(cache.keys().next().value);
  return found;
}

module.exports = {lookupCep};
