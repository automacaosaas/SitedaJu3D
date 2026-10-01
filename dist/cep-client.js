// Address by CEP in the delivery form: asks this site's server (GET /api/cep/lookup), never an outside address service, and only
// returns what it found. It never throws: a failure just means the buyer types the address by hand.
const cleanCep = value => String(value ?? '').replace(/\D/g, '');
const text = value => typeof value === 'string' ? value.trim() : '';

// → {ok: true, address: {street, district, city, state}} or {ok: false, error}, where error is
// invalid_cep · not_found · unavailable (the last also covers a dead network).
export async function lookupCep(cep, {fetchImpl = globalThis.fetch, timeout = 6000} = {}) {
  const digits = cleanCep(cep);
  if (!/^\d{8}$/.test(digits)) return {ok: false, error: 'invalid_cep'};
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetchImpl(`/api/cep/lookup?cep=${digits}`, {cache: 'no-store', signal: controller.signal});
    const data = await response.json().catch(() => null);
    if (response.ok && data && typeof data === 'object' && text(data.city)) {
      return {ok: true, address: {street: text(data.street), district: text(data.district), city: text(data.city), state: text(data.state).toUpperCase()}};
    }
    if (response.status === 404) return {ok: false, error: 'not_found'};
    return {ok: false, error: 'unavailable'};
  } catch { return {ok: false, error: 'unavailable'}; }
  finally { clearTimeout(timer); }
}

// What the buyer reads under the CEP field, in Portuguese (the site translates the phrase as a whole).
export function cepMessage(result) {
  if (result.ok) return result.address.street ? 'Endereço preenchido pelo CEP. Confira e complete o número.' : 'Cidade e estado preenchidos pelo CEP. Complete o endereço.';
  if (result.error === 'not_found') return 'Não encontramos esse CEP. Preencha o endereço manualmente.';
  return 'Não foi possível buscar o endereço agora. Preencha manualmente.';
}
