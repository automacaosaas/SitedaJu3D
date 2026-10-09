'use strict';
// Tax data for the NF-e (nota fiscal eletrônica) and the switch for issuing it. Everything marked "[PREENCHER: …]" comes
// from the accountant (see NFE-SETUP.md); while anything is left, no invoice is sent and the panel says what is missing
// (what is left in the export group holds back only the notes for abroad).
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
    aviaoscopia: {ncm: '39269090'},
    // the lamps (07/10/2026): the same kind of piece — plastic, printed in 3D — so the same NCM; confirm with the accountant
    macacoscopio: {ncm: '39269090'},
    girafoscopio: {ncm: '39269090'},
    unicornioscopio: {ncm: '39269090'}
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
  bling: {natureId: {nonTaxpayer: '15111617940', taxpayer: '15111617959'}},
  // Sale abroad (exportação): the accountant's answer of 08/10/2026 (RICMS/MG, Parte 1 do Anexo VIII, art. 166) and
  // NFE-SETUP.md, "Venda para o exterior". api/_lib/nfe.js uses this group for an order delivered outside Brazil
  // (shipTo.country); the national rules above stay as they are. While anything here is left to fill, no export note is
  // sent (the order says what is missing) and the national notes go on as usual.
  export: {
    nature: 'Exportação Direta - Simples Nacional',   // the accountant's name for the Bling nature (09/10/2026)
    cfop: '7101',   // the store makes what it sells: 7101 (exportação de produção do estabelecimento); 7102 is for resale
    icms: {origin: '0', csosn: '300'},   // "X300" in the answer: origem 0 (nacional) + CSOSN 300 (imune), Simples Nacional
    // Not in the answer: with Bling, PIS/COFINS come from the export nature set up there (the site does not send them).
    // The accountant (09/10/2026): PIS/COFINS CST 49 (or 99); IPI CST 54 (saída imune; the accountant first wrote 55, which in the IPI table is suspension, and confirmed 54); the IBPT line off for this nature.
    pis: {cst: '49'},
    cofins: {cst: '49'},
    ipi: {cst: '54'},
    // Where the goods leave Brazil (grupo ZA of the note, "exporta") and the "Informações complementares" line asked in
    // item g (name, address and CNPJ of the bonded area or operator). Parcels go by the Correios (Exporta Fácil, posted
    // at any agency): the place is the Correios unit where the parcel is cleared by customs before it leaves the country.
    // Which unit, its address and its CNPJ come from the Correios / the accountant; never guessed.
    shipment: {
      state: PENDING('UF do local de embarque (ex.: SP)'),
      place: PENDING('local de embarque: nome da unidade dos Correios que despacha a remessa'),
      address: PENDING('endereço do local de embarque'),
      cnpj: PENDING('CNPJ do recinto ou da unidade dos Correios do embarque')
    },
    // On a note to the exterior the tax authority checks each item's tax unit (uTrib) against its NCM in the table "NCM e
    // respectiva uTrib (Comércio Exterior)" of the Portal da NF-e (rejeição 817), with the quantity in that unit. One per
    // NCM of the products above, from that table; never guessed. UN keeps the pieces; KG sends their net weight (netG).
    // KG for 3926.90.90: the test export note nº 27 (homologação, 09/10/2026, protocolo 131260153094809) went with uTrib KG and qTrib = net weight and was authorized (no rejection 817).
    taxUnit: {'39269090': 'KG'},
    // Net weight of one piece, in grams, without the box (the owner's weights of 08/10/2026).
    netG: {borboletoscopio: 75, dinossauroscopio: 60, aviaoscopia: 166, macacoscopio: 24, girafoscopio: 18, unicornioscopio: 16},
    bling: {natureId: '15111672683'}   // a natureza "Exportação de mercadoria" no Bling (criada em 09/10/2026, regra EX: CFOP 7101, CSOSN 300)
  }
};

// EXAMPLE values, only to run the whole flow with the simulator (tests, local server with NFE_EXAMPLE_DATA=1). Never
// used in production and not a tax recommendation: the real values come from the accountant.
const EXAMPLE = Object.freeze({
  company: {legalName: 'EMPRESA EXEMPLO LTDA (dados de teste)', cnpj: '11.222.333/0001-81'},
  fiscal: {
    ...FISCAL, issuerState: 'MG', crt: '1', stateRegistration: '0010000000001', series: '1',
    cfop: {sameState: '5101', otherState: '6101', otherStateConsumer: '6107'}, icms: {origin: '0', csosn: '102'}, pis: {cst: '49'}, cofins: {cst: '49'},
    products: {borboletoscopio: {ncm: '39269090'}, dinossauroscopio: {ncm: '39269090'}, aviaoscopia: {ncm: '39269090'}, macacoscopio: {ncm: '39269090'}, girafoscopio: {ncm: '39269090'}, unicornioscopio: {ncm: '39269090'}},
    additionalInfo: 'Dados fiscais de exemplo, sem valor fiscal.',
    bling: {natureId: {nonTaxpayer: '1', taxpayer: '3'}},
    export: {
      nature: 'Exportação Direta - Simples Nacional', cfop: '7101', icms: {origin: '0', csosn: '300'}, pis: {cst: '49'}, cofins: {cst: '49'}, ipi: {cst: '54'},
      shipment: {state: 'SP', place: 'LOCAL DE EMBARQUE DE EXEMPLO (dados de teste)', address: 'Rua de Exemplo, 100, São Paulo/SP', cnpj: '11.222.333/0001-81'},
      taxUnit: {'39269090': 'KG'}, netG: FISCAL.export.netG,
      bling: {natureId: '4'}
    }
  }
});

// Paths still to be filled for the chosen service, e.g. ["products.aviaoscopia.ncm", "bling.natureId.taxpayer"]. Bling
// keeps the series and the tax rules itself; the other services get them from here and have no use for bling.natureId.
// The export group is checked apart (missingExport): it holds back only the notes for abroad.
const NOT_NEEDED = {bling: ['series', 'cfop.', 'icms.csosn', 'pis.', 'cofins.'], other: ['bling.']};
function pendingPaths(fiscal, prefix = '') {
  return Object.entries(fiscal).flatMap(([key, value]) => value && typeof value === 'object' ? pendingPaths(value, `${prefix}${key}.`) : String(value).startsWith('[PREENCHER') ? [`${prefix}${key}`] : []);
}
const skipped = (path, skip) => skip.some(s => s.endsWith('.') ? path.startsWith(s) : path === s);
function missing(fiscal = FISCAL, {provider} = {}) {
  const skip = NOT_NEEDED[provider === 'bling' ? 'bling' : 'other'];
  return pendingPaths(fiscal).filter(path => !path.startsWith('export.') && !skipped(path, skip));
}
// The same for a note for abroad, e.g. ["export.shipment.cnpj", "export.bling.natureId"] (no export group at all: ["export"]).
const EXPORT_NOT_NEEDED = {bling: ['export.cfop', 'export.icms.csosn', 'export.pis.', 'export.cofins.'], other: ['export.bling.']};
function missingExport(fiscal = FISCAL, {provider} = {}) {
  if (!fiscal.export || typeof fiscal.export !== 'object') return ['export'];
  return pendingPaths(fiscal.export, 'export.').filter(path => !skipped(path, EXPORT_NOT_NEEDED[provider === 'bling' ? 'bling' : 'other']));
}

function nfeSettings(env = process.env) {
  const provider = String(env.NFE_PROVIDER || '').trim().toLowerCase(), production = isProduction(env);
  if (!provider) return {mode: 'off', blocked: false};
  if (provider === 'fake' && production) return {mode: 'off', blocked: true};   // the simulator never runs in production
  const environment = production && env.NFE_ENVIRONMENT === 'producao' ? 'producao' : 'homologacao';
  return {mode: environment === 'producao' ? 'live' : 'test', blocked: false, provider, environment, token: String(env.NFE_TOKEN || '').trim(), example: !production && env.NFE_EXAMPLE_DATA === '1'};
}

module.exports = {FISCAL, EXAMPLE, missing, missingExport, nfeSettings};
