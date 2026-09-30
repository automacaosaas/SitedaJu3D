'use strict';
// Simulator of the two address services the CEP lookup uses (ViaCEP and BrasilAPI), with the shapes they answer with, for tests and
// `node tools/dev-server.cjs --fake-cep`. A handful of CEPs; anything else is "not found".
const ADDRESSES = Object.freeze({
  '01310100': {street: 'Avenida Paulista', district: 'Bela Vista', city: 'São Paulo', state: 'SP'},
  '20040020': {street: 'Rua Sete de Setembro', district: 'Centro', city: 'Rio de Janeiro', state: 'RJ'},
  '35400000': {street: '', district: '', city: 'Ouro Preto', state: 'MG'},   // one CEP for the whole town: no street, no district
  '40020000': {street: 'Rua da Misericórdia', district: 'Centro', city: 'Salvador', state: 'BA'}
});

function createFakeCep() {
  const calls = [], down = new Set();
  const reply = (status, body) => ({ok: status >= 200 && status < 300, status, json: async () => body});
  async function fetchImpl(url) {
    const parsed = new URL(String(url)), provider = parsed.hostname.startsWith('viacep') ? 'viacep' : parsed.hostname.startsWith('brasilapi') ? 'brasilapi' : null;
    if (!provider) return reply(404, {});
    calls.push({provider, url: String(url)});
    if (down.has(provider) || down.has('all')) return reply(503, {});
    const cep = (parsed.pathname.match(/(\d{8})/) || [])[1], found = ADDRESSES[cep];
    if (provider === 'viacep') {
      if (!cep) return reply(400, {});
      if (!found) return reply(200, {erro: true});
      return reply(200, {cep: cep.replace(/^(\d{5})/, '$1-'), logradouro: found.street, complemento: '', unidade: '', bairro: found.district, localidade: found.city, uf: found.state, ibge: '0000000'});
    }
    if (!found) return reply(404, {name: 'CepPromiseError', message: 'Todos os serviços de CEP retornaram erro.', type: 'service_error'});
    return reply(200, {cep, state: found.state, city: found.city, neighborhood: found.district, street: found.street, service: 'fake'});
  }
  return {
    fetchImpl, calls,
    setDown(provider = 'all', value = true) { if (value) down.add(provider); else down.delete(provider); },   // 'viacep' · 'brasilapi' · 'all': answers 503
    callsTo: provider => calls.filter(call => call.provider === provider).length
  };
}

module.exports = {createFakeCep, ADDRESSES};
