'use strict';
// A small stand-in for the Correios API (CWS), for local prototyping and tests. It answers the three calls the site makes
// (token by postage card, price, delivery time) with the shapes the real API uses ("pcFinal": "23,45", "prazoEntrega": 4),
// checks the same things the real one checks (Basic credentials, Bearer token, package rules) and can misbehave on demand.
// It is NOT the Correios: prices here are a made-up formula; the real numbers are only proven with the shop's contract.
//   Services it knows: 03298 (PAC) and 03220 (SEDEX). Any other code answers 403, like a service missing from the contract.
//   CEP 00000000 is refused as invalid; CEPs starting with 99999 are "not served". Distance = gap between first digits.
const CODES = {'03298': {name: 'PAC', base: 1850, perZone: 430, perKg: 340, days: 3, perZoneDays: 2}, '03220': {name: 'SEDEX', base: 2650, perZone: 870, perKg: 590, days: 1, perZoneDays: 1}};

// Example shop data for tests and `tools/dev-server.cjs --fake-correios` (NOT the real boxes: those come from the shop).
const EXAMPLE_CONFIG = Object.freeze({
  services: Object.freeze([Object.freeze({id: 'pac', label: 'PAC', code: '03298'}), Object.freeze({id: 'sedex', label: 'SEDEX', code: '03220'})]),
  production: Object.freeze({minDays: 5, maxDays: 7}),
  labelFeeCents: 0,
  freeShipping: null,
  boxes: Object.freeze({
    borboletoscopio: Object.freeze({unit: Object.freeze({length: 20, width: 15, height: 8, weightG: 320}), perBox: 2, full: Object.freeze({length: 24, width: 20, height: 10, weightG: 600})}),
    dinossauroscopio: Object.freeze({unit: Object.freeze({length: 22, width: 12, height: 9, weightG: 280}), perBox: 3, full: Object.freeze({length: 26, width: 22, height: 10, weightG: 800})}),
    aviaoscopia: Object.freeze({unit: Object.freeze({length: 25, width: 14, height: 6, weightG: 350}), perBox: 1, full: null})
  })
});

function createFakeCorreios({user = 'fake-user', code = 'fake-code', card = '0067511082'} = {}) {
  const tokens = new Set(), calls = [];
  let serial = 0, down = false;
  const reply = (status, body) => ({ok: status >= 200 && status < 300, status, json: async () => body});
  const refused = (status, ...msgs) => reply(status, {msgs});
  const zone = (from, to) => Math.abs(Number(String(from)[0]) - Number(String(to)[0]));
  const money = cents => (cents / 100).toFixed(2).replace('.', ',');

  function authenticate(init) {
    const basic = /^Basic (.+)$/.exec(init.headers?.Authorization || '');
    if (!basic || Buffer.from(basic[1], 'base64').toString() !== `${user}:${code}`) return refused(401, 'PSW-001: usuário ou código de acesso inválido');
    if (JSON.parse(init.body || '{}').numero !== card) return refused(400, 'CAR-002: cartão de postagem não encontrado');
    const token = `FAKE.${++serial}.${Math.random().toString(36).slice(2)}`;
    tokens.add(token);
    return reply(201, {token, expiraEm: new Date(Date.now() + 24 * 3600 * 1000).toISOString(), ambiente: 'HOMOLOGACAO'});
  }

  function checkCommon(params, init) {
    const bearer = /^Bearer (.+)$/.exec(init.headers?.Authorization || '');
    if (!bearer || !tokens.has(bearer[1])) return refused(403, 'Token inválido ou expirado');
    for (const cep of [params.get('cepOrigem'), params.get('cepDestino')]) if (!/^\d{8}$/.test(cep || '') || cep === '00000000') return refused(400, 'PRC-127: CEP inválido.');
    if (params.get('cepDestino').startsWith('99999')) return refused(400, 'PRC-130: CEP de destino não atendido para este serviço.');
    return null;
  }

  function price(code5, params, init) {
    const bad = checkCommon(params, init); if (bad) return bad;
    const service = CODES[code5]; if (!service) return refused(403, 'Serviço não contratado');
    if (!params.get('nuContrato')) return refused(400, 'PRC-010: informe o contrato para o preço de contrato');
    const grams = Number(params.get('psObjeto')), [l, w, h] = ['comprimento', 'largura', 'altura'].map(k => Number(params.get(k)));
    if (params.get('tpObjeto') !== '2' || !(grams >= 1) || !(l >= 16 && w >= 11 && h >= 2) || l < w) return refused(400, 'PRC-140: objeto fora das medidas aceitas.');
    const cents = service.base + service.perZone * zone(params.get('cepOrigem'), params.get('cepDestino')) + Math.ceil(grams / 1000) * service.perKg;
    return reply(200, {coProduto: code5, pcBase: money(cents - 100), pcFinal: money(cents), psCobrado: String(grams), pcProduto: money(cents)});
  }

  function deadline(code5, params, init) {
    const bad = checkCommon(params, init); if (bad) return bad;
    const service = CODES[code5]; if (!service) return refused(403, 'Serviço não contratado');
    const days = service.days + service.perZoneDays * zone(params.get('cepOrigem'), params.get('cepDestino'));
    return reply(200, {coProduto: code5, prazoEntrega: days, dataMaxima: new Date(Date.now() + days * 86400000).toISOString(), entregaDomiciliar: 'S', entregaSabado: 'N', entregaDomingo: 'N'});
  }

  async function fetchImpl(url, init = {}) {
    const parsed = new URL(String(url));
    calls.push({method: init.method || 'GET', path: parsed.pathname, params: Object.fromEntries(parsed.searchParams)});
    if (down) return refused(503, 'Serviço indisponível');
    if (parsed.pathname === '/token/v1/autentica/cartaopostagem' && init.method === 'POST') return authenticate(init);
    const found = parsed.pathname.match(/^\/(preco|prazo)\/v1\/nacional\/(\d{5})$/);
    if (found && (!init.method || init.method === 'GET')) return found[1] === 'preco' ? price(found[2], parsed.searchParams, init) : deadline(found[2], parsed.searchParams, init);
    return refused(404, 'Rota não encontrada');
  }

  return {
    fetchImpl, calls,
    setDown(value = true) { down = value; },          // every call answers 503
    expireTokens() { tokens.clear(); },               // the next authenticated call is answered 403, like an expired token
    creds: {CORREIOS_USER: user, CORREIOS_CODE: code, CORREIOS_CARD: card, CORREIOS_CONTRACT: '9912345678', SHIP_FROM_CEP: '30140071'},
    tokenCalls: () => calls.filter(c => c.path.startsWith('/token')).length
  };
}

module.exports = {createFakeCorreios, EXAMPLE_CONFIG, CODES};
