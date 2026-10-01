'use strict';
// Address by CEP for the delivery form. The browser only ever talks to this server (GET /api/cep/lookup); the server asks
// ViaCEP and, when that fails or does not know the CEP, BrasilAPI. Nothing but the CEP leaves the server. Answers are
// cached, so the same CEP is not asked twice.
//   lookup(cep) → {street, district, city, state}   (street and district are '' for a CEP that covers a whole town)
//   throws not_found (both services answered and neither knows the CEP) · cep_unavailable (a service failed and none found it)
const STATES = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
const TIMEOUT_MS = 4000, FOUND_MS = 24 * 60 * 60 * 1000, MISSING_MS = 60 * 60 * 1000, MAX_CACHE = 2000;

const fail = code => Object.assign(new Error(code), {code});
const clean = (value, max) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
function address(raw) {
  const state = clean(raw.state, 2).toUpperCase();
  return {street: clean(raw.street, 100), district: clean(raw.district, 80), city: clean(raw.city, 80), state: STATES.has(state) ? state : ''};
}

const PROVIDERS = [
  {name: 'ViaCEP', url: cep => `https://viacep.com.br/ws/${cep}/json/`,
    read: data => data && (data.erro === true || data.erro === 'true') ? null : data && {street: data.logradouro, district: data.bairro, city: data.localidade, state: data.uf}},
  {name: 'BrasilAPI', url: cep => `https://brasilapi.com.br/api/cep/v2/${cep}`,
    read: data => data && {street: data.street, district: data.neighborhood, city: data.city, state: data.state}}
];

// → {address} · {missing: true} · {failed: true}
async function ask(provider, cep, fetchImpl) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(provider.url(cep), {headers: {Accept: 'application/json'}, signal: controller.signal});
    if (response.status === 404 || response.status === 400) return {missing: true};
    if (!response.ok) return {failed: true};
    const raw = provider.read(await response.json());
    if (!raw) return {missing: true};
    const found = address(raw);
    return found.city && found.state ? {address: found} : {missing: true};
  } catch { return {failed: true}; }
  finally { clearTimeout(timer); }
}

function createCepLookup({fetchImpl = globalThis.fetch, now = () => Date.now()} = {}) {
  const cache = new Map();
  async function resolve(cep) {
    let failed = false;
    for (const provider of PROVIDERS) {
      const outcome = await ask(provider, cep, fetchImpl);
      if (outcome.address) return {value: outcome.address, ttl: FOUND_MS};
      if (outcome.failed) failed = true;
    }
    return failed ? {error: 'cep_unavailable'} : {error: 'not_found', ttl: MISSING_MS};
  }
  return async function lookup(cep) {
    if (!/^\d{8}$/.test(cep)) throw fail('invalid_cep');
    const hit = cache.get(cep);
    if (hit && hit.expires > now()) return hit.promise;
    if (cache.size >= MAX_CACHE) for (const [key, entry] of cache) if (entry.expires <= now()) cache.delete(key);
    const promise = resolve(cep).then(result => {
      if (result.error === 'cep_unavailable') { cache.delete(cep); throw fail(result.error); }   // a service being down is not remembered
      const entry = cache.get(cep); if (entry) entry.expires = now() + result.ttl;
      if (result.error) throw fail(result.error);
      return result.value;
    });
    promise.catch(() => {});
    cache.set(cep, {promise, expires: now() + FOUND_MS});
    return promise;
  };
}

module.exports = {createCepLookup, address};
