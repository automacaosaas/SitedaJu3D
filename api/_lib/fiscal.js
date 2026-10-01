'use strict';
// Tax data for the NF-e (nota fiscal eletrônica) and the switch for issuing it. Everything marked "[PREENCHER: …]" comes
// from the accountant (see NFE-SETUP.md); while anything is left, no invoice is sent and the panel says what is missing.
// Filled with the accountant's answers of 29/09/2026 and the last note issued before the site (nº 10, série 1,
// 19/09/2026, emissor do SEBRAE); the next note is nº 11 (set in Bling). The store makes what it sells, so the CFOPs are
// the "produção do estabelecimento" ones (5101/6101/6107), never the resale ones (5102/6102/6108).
// The store's own identification (CNPJ, name, address) lives in api/_lib/legal.js.
//
// Issuing is switched on by NFE_PROVIDER (the NF-e service with an API) and NFE_TOKEN. Outside production, and in
// production unless NFE_ENVIRONMENT=producao is set on purpose, notes go to the tax authority's test environment
// (homologação), which has no fiscal value — the same two-step rule as the Mercado Pago keys.
const {isProduction} = require('./runtime');

const PENDING = what => `[PREENCHER: ${what}]`;

const FISCAL = {
  issuerState: 'MG',
  crt: '1',   // Simples Nacional (ME, não MEI), conforme a inscrição estadual na SEFAZ-MG
  stateRegistration: '0055757470062',   // 005575747.00-62
  series: '1',
  nature: 'Venda de produção do estabelecimento',
  // Inside MG 5101; another state: 6101 for a buyer with a state registration (ICMS taxpayer), 6107 for a person or a
  // company without one (as on note nº 10).
  cfop: {sameState: '5101', otherState: '6101', otherStateConsumer: '6107'},
  icms: {origin: '0', csosn: '102'},   // Simples Nacional sem permissão de crédito, como na nota nº 10
  pis: {cst: '49'},   // outras operações de saída: in the Simples Nacional, PIS/COFINS are paid through the DAS
  cofins: {cst: '49'},
  // One entry per product of api/_lib/catalog.js (tests/nfe.mjs checks they match).
  products: {
    borboletoscopio: {ncm: '39269090'},   // 3926.90.90, outras obras de plásticos
    dinossauroscopio: {ncm: '39269090'},
    aviaoscopia: {ncm: '39269090'}
  },
  unit: 'UN',
  freightMode: '0',   // 0 = frete por conta do emitente (CIF): the store pays the carrier and charges it in the order
  // The accountant's text (01/10/2026); api/_lib/nfe.js adds the DIFAL line when due and "Pedido nº: <pedido>". The
  // "Informações complementares" field of the nature in Bling stays empty, so the text is not repeated.
  additionalInfo: 'DOCUMENTO EMITIDO POR ME OU EPP OPTANTE PELO SIMPLES NACIONAL. NAO GERA DIREITO A CREDITO FISCAL DE IPI.',
  // With Bling (NFE_PROVIDER=bling) the series and the tax rules (CFOP, CSOSN, PIS/COFINS, DIFAL) are set up inside
  // Bling, in a "natureza de operação"; the site sends only its id. Bling's rules split by state, not by kind of buyer,
  // so there are two natures (01/10/2026, NFE-SETUP.md): "Venda de produção do estabelecimento" for a person or a company
  // without a state registration (MG 5101, other states 6107) and "… – contribuinte" for a company with one (MG 5101,
  // other states 6101). The panel lists the ids once the Bling account is connected.
  bling: {natureId: {nonTaxpayer: '15111617940', taxpayer: '15111617959'}}
};

// EXAMPLE values, only to run the whole flow with the simulator (tests, local server with NFE_EXAMPLE_DATA=1). Never
// used in production and not a tax recommendation: the real values come from the accountant.
const EXAMPLE = Object.freeze({
  company: {legalName: 'EMPRESA EXEMPLO LTDA (dados de teste)', cnpj: '11.222.333/0001-81'},
  fiscal: {
    ...FISCAL, issuerState: 'MG', crt: '1', stateRegistration: '0010000000001', series: '1',
    cfop: {sameState: '5101', otherState: '6101', otherStateConsumer: '6107'}, icms: {origin: '0', csosn: '102'}, pis: {cst: '49'}, cofins: {cst: '49'},
    products: {borboletoscopio: {ncm: '39269090'}, dinossauroscopio: {ncm: '39269090'}, aviaoscopia: {ncm: '39269090'}},
    additionalInfo: 'Dados fiscais de exemplo, sem valor fiscal.',
    bling: {natureId: {nonTaxpayer: '1', taxpayer: '3'}}
  }
});

// Paths still to be filled for the chosen service, e.g. ["products.aviaoscopia.ncm", "bling.natureId.taxpayer"]. Bling
// keeps the series and the tax rules itself; the other services get them from here and have no use for bling.natureId.
const NOT_NEEDED = {bling: ['series', 'cfop.', 'icms.csosn', 'pis.', 'cofins.'], other: ['bling.']};
function pendingPaths(fiscal, prefix = '') {
  return Object.entries(fiscal).flatMap(([key, value]) => value && typeof value === 'object' ? pendingPaths(value, `${prefix}${key}.`) : String(value).startsWith('[PREENCHER') ? [`${prefix}${key}`] : []);
}
function missing(fiscal = FISCAL, {provider} = {}) {
  const skip = NOT_NEEDED[provider === 'bling' ? 'bling' : 'other'];
  return pendingPaths(fiscal).filter(path => !skip.some(s => s.endsWith('.') ? path.startsWith(s) : path === s));
}

function nfeSettings(env = process.env) {
  const provider = String(env.NFE_PROVIDER || '').trim().toLowerCase(), production = isProduction(env);
  if (!provider) return {mode: 'off', blocked: false};
  if (provider === 'fake' && production) return {mode: 'off', blocked: true};   // the simulator never runs in production
  const environment = production && env.NFE_ENVIRONMENT === 'producao' ? 'producao' : 'homologacao';
  return {mode: environment === 'producao' ? 'live' : 'test', blocked: false, provider, environment, token: String(env.NFE_TOKEN || '').trim(), example: !production && env.NFE_EXAMPLE_DATA === '1'};
}

module.exports = {FISCAL, EXAMPLE, missing, nfeSettings};
