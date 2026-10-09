'use strict';
// Builds the NF-e for an order in a neutral shape (NF-e layout 4.00 concepts, amounts in cents) that each provider
// adapter (api/_lib/nfe-providers/) turns into its own API call. Nothing is sent here; problems are listed in plain
// Portuguese so the panel can show what is missing (tax data, store details, recipient document, CEP).
const fields = require('./fields');
const {describeSelection, cleanSelection, PRODUCTS} = require('./catalog');
const {COMPANY} = require('./legal');
const {FISCAL, missing, missingExport} = require('./fiscal');

const PAYMENT_CODE = {pix: '17', card: '03', debit: '04'};   // tPag: Pix, cartão de crédito, cartão de débito
const pending = value => String(value || '').startsWith('[PREENCHER');
const cents = value => Math.round(Number(value) || 0);

// An order delivered outside Brazil: shipTo.country (ISO 3166 alpha-2) other than BR. The checkout sells only in Brazil
// and writes no country, so every order it makes stays national; an order for abroad gets the export note (buildExport).
const countryOf = order => String(order?.shipTo?.country || '').trim().toUpperCase();
const abroad = order => !['', 'BR'].includes(countryOf(order));
const UFS = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
// Codes with a name in Intl that are not countries: pseudo-regions (XA, XB) and the reserved ones for islands and parts of
// a country (Ascension, Clipperton, Diego Garcia, Ceuta and Melilla, the Canaries, Tristan da Cunha).
const NOT_A_COUNTRY = new Set(['BR', 'ZZ', 'EU', 'EZ', 'UN', 'QO', 'XA', 'XB', 'AC', 'CP', 'DG', 'EA', 'IC', 'TA']);
let regionNames = null;
// The country as Bling takes it (its name in Portuguese, in capitals and without accents, as in the tax authority's table:
// "MEXICO", "ESTADOS UNIDOS"); null for a code that is not a country, or an old one Intl replaces (DD, SU, YU, UK and others).
function countryName(iso) {
  if (!/^[A-Z]{2}$/.test(iso) || NOT_A_COUNTRY.has(iso)) return null;
  try {
    if (Intl.getCanonicalLocales(`und-${iso}`)[0] !== `und-${iso}`) return null;
    regionNames ??= new Intl.DisplayNames(['pt-BR'], {type: 'region', fallback: 'none'}); return regionNames.of(iso)?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase() || null;
  }
  catch { return null; }
}
// idEstrangeiro: the passport or another document of a buyer abroad, 5 to 20 characters of these (optional on the note).
const FOREIGN_ID = /^[A-Za-z0-9:.+\-/()]{5,20}$/;

// The line on the invoice: the piece and its colors, within the 120 characters of xProd.
function describe(item) {
  const colors = PRODUCTS[item.productId] ? describeSelection(item.productId, cleanSelection(item.productId, item.selection || {}), 'pt-BR').map(p => `${p.part}: ${p.color}`).join(', ') : '';
  return (colors ? `${item.title} (${colors})` : item.title).slice(0, 120);
}

// Who receives the invoice: the company (CNPJ and state registration) when the buyer bought as one, otherwise the person.
// ieIndicator (indIEDest): 1 contribuinte, 9 não contribuinte. A company without a state registration ("ISENTO" at
// checkout) goes as a non-contributor, as the accountant set on 01/10/2026 (rule 2 of the Bling nature, CFOP 6107).
function recipientOf(order, env) {
  const company = order.buyer?.company;
  if (company?.cnpj) {
    const ie = String(company.stateRegistration || '').toUpperCase();
    return {name: company.name || order.buyer?.name || '', cnpj: fields.normalizeCnpj(company.cnpj) || company.cnpj, stateRegistration: ie && ie !== 'ISENTO' ? ie : '', ieIndicator: ie && ie !== 'ISENTO' ? '1' : '9'};
  }
  let cpf = '';
  try { cpf = order.buyerDocEnc ? fields.decrypt(env, order.buyerDocEnc) : ''; } catch { cpf = ''; }
  return {name: order.buyer?.name || '', cpf, ieIndicator: '9'};
}

// The pieces (with their NCM), the freight and the discount, for a national note or an export one.
function linesOf(order, fiscal, problems) {
  const items = (order.items || []).map(item => {
    const ncm = fiscal.products?.[item.productId]?.ncm;
    if (!ncm) problems.push(`Produto sem NCM em api/_lib/fiscal.js: ${item.productId}`);
    return {code: item.productId, description: describe(item), ncm, quantity: item.quantity, unitCents: cents(item.unitCents), totalCents: cents(item.unitCents) * item.quantity};
  });
  if (!items.length) problems.push('Pedido sem itens');
  // A discount (the Pix 5%) is what the pieces and the freight exceed the total by; it goes on the note as a discount.
  const productsCents = items.reduce((sum, i) => sum + i.totalCents, 0), freightCents = cents(order.shippingCents);
  const discountCents = productsCents + freightCents - cents(order.totalCents);
  if (discountCents < 0 || discountCents > productsCents) problems.push('Os itens mais o frete não somam o total do pedido');
  return {items, productsCents, freightCents, discountCents};
}

function buildInvoice({order, city, environment, provider, env = process.env, company = COMPANY, fiscal = FISCAL, now = Date.now()}) {
  if (abroad(order)) return buildExport({order, environment, provider, company, fiscal, now});
  const problems = [];
  const gaps = missing(fiscal, {provider});
  if (gaps.length) problems.push(`Dados fiscais a preencher (api/_lib/fiscal.js): ${gaps.join(', ')}`);
  for (const key of ['legalName', 'cnpj']) if (pending(company[key])) problems.push(`Dados da empresa a preencher (api/_lib/legal.js): ${key}`);
  const recipient = recipientOf(order, env);
  if (!recipient.cpf && !recipient.cnpj) problems.push('Pedido sem CPF ou CNPJ do comprador');
  const ship = order.shipTo || {};
  if (!city) problems.push(`CEP ${ship.cep || '(vazio)'} não encontrado: confira o endereço de entrega`);
  else if (city.state !== ship.state) problems.push(`O CEP ${ship.cep} é de ${city.state}, mas o endereço diz ${ship.state}`);
  const {items, productsCents, freightCents, discountCents} = linesOf(order, fiscal, problems);
  if (problems.length) return {ok: false, problems};

  // Another state: a buyer with a state registration (ICMS taxpayer) gets the taxpayer CFOP; a person or a company without
  // one gets the consumer CFOP, and the note states the interstate ICMS (DIFAL), which is zero in the Simples Nacional.
  const sameState = city.state === fiscal.issuerState, taxpayer = recipient.ieIndicator === '1';
  const cfop = sameState ? fiscal.cfop.sameState : taxpayer ? fiscal.cfop.otherState : fiscal.cfop.otherStateConsumer || fiscal.cfop.otherState;
  const difal = !sameState && !taxpayer ? ' Valores totais do ICMS Interestadual: DIFAL da UF destino R$ 0,00 + FCP R$ 0,00; DIFAL da UF Origem R$ 0,00.' : '';
  return {ok: true, invoice: {
    reference: order.reference, environment, issuedAt: new Date(now).toISOString(),
    nature: fiscal.nature, series: fiscal.series,
    purpose: '1', presence: '2', finalConsumer: true, destination: sameState ? '1' : '2', intermediary: '0',   // normal, internet, consumidor final, sem intermediador
    issuer: {cnpj: fields.normalizeCnpj(company.cnpj) || company.cnpj, name: company.legalName, stateRegistration: fiscal.stateRegistration, crt: fiscal.crt, state: fiscal.issuerState},
    recipient: {...recipient, email: order.buyer?.email || '', address: {street: ship.street, number: ship.number, complement: ship.complement || '', district: ship.district, city: city.city, cityCode: city.cityCode, state: city.state, cep: city.cep, country: 'Brasil', countryCode: '1058'}},
    items: items.map(i => ({...i, cfop, unit: fiscal.unit, icms: {origin: fiscal.icms.origin, csosn: fiscal.icms.csosn}, pis: {cst: fiscal.pis.cst}, cofins: {cst: fiscal.cofins.cst}})),
    freight: {mode: fiscal.freightMode, cents: freightCents},
    payment: {code: PAYMENT_CODE[order.method] || '99', cents: cents(order.totalCents)},
    totals: {productsCents, freightCents, discountCents, totalCents: cents(order.totalCents)},
    additionalInfo: `${fiscal.additionalInfo}${difal} Pedido nº: ${order.reference}`,
    ...(provider === 'bling' ? {bling: {natureId: fiscal.bling?.natureId?.[taxpayer ? 'taxpayer' : 'nonTaxpayer']}} : {})   // the nature for this kind of buyer
  }};
}

// The export note (Nota Fiscal de Exportação), as the accountant listed on 08/10/2026 (RICMS/MG, Anexo VIII, art. 166):
// nature "Exportação Direta - Simples Nacional", CFOP 7101, CSOSN 300 (origem 0), destination 3 (exterior), the place where the goods
// leave Brazil (grupo ZA) and, in the "Informações complementares", that place with its address and CNPJ. The freight is
// stated in its own field with its mode, as on every note, although the operation is immune. No IPI CST (Simples
// Nacional: Res. CGSN 140/2018, art. 59, § 4º) and no DIFAL line. The buyer goes as foreign: no CPF or CNPJ, the passport or
// another document when the order has one (buyer.foreignId), not an ICMS taxpayer, the city "EXTERIOR" (IBGE 9999999),
// UF "EX" and the country's name; the foreign city, region and postal code go in the district and the complement. Each
// item takes the tax unit the export table gives for its NCM (export.taxUnit; in KG, the net weight of the pieces).
function buildExport({order, environment, provider, company, fiscal, now}) {
  const problems = [], exp = fiscal.export || {}, shipment = exp.shipment || {};
  // The national sale rules (nature, CFOPs, CSOSN 102, PIS/COFINS, the national natures) are not used here; the rest is.
  const gaps = missing(fiscal, {provider}).filter(path => !/^(nature$|cfop\.|icms\.|pis\.|cofins\.|bling\.)/.test(path));
  if (gaps.length) problems.push(`Dados fiscais a preencher (api/_lib/fiscal.js): ${gaps.join(', ')}`);
  const exportGaps = missingExport(fiscal, {provider});
  if (exportGaps.length) problems.push(`Venda para o exterior: a nota de exportação só sai depois de preencher em api/_lib/fiscal.js: ${exportGaps.join(', ')} (veja "Venda para o exterior" no NFE-SETUP.md)`);
  else {
    if (!fields.validCnpj(shipment.cnpj)) problems.push('CNPJ do local de embarque inválido em api/_lib/fiscal.js (export.shipment.cnpj)');
    if (!UFS.has(String(shipment.state).toUpperCase())) problems.push('UF do local de embarque inválida em api/_lib/fiscal.js (export.shipment.state)');
    // A blank place would go out empty (rejeição 355); the note takes at most 60 characters for it (xLocExporta).
    if (!String(shipment.place || '').trim() || !String(shipment.address || '').trim()) problems.push('Local de embarque sem nome ou sem endereço em api/_lib/fiscal.js (export.shipment.place, export.shipment.address)');
    else if (String(shipment.place).trim().length > 60) problems.push('Nome do local de embarque com mais de 60 caracteres em api/_lib/fiscal.js (export.shipment.place): a NF-e não aceita mais que isso');
  }
  for (const key of ['legalName', 'cnpj']) if (pending(company[key])) problems.push(`Dados da empresa a preencher (api/_lib/legal.js): ${key}`);
  const ship = order.shipTo || {}, iso = countryOf(order), country = countryName(iso);
  const name = String(order.buyer?.company?.name || order.buyer?.name || ship.recipient || '').trim();
  if (!name) problems.push('Pedido sem o nome do comprador');
  if (!country) problems.push(`País de entrega desconhecido: "${iso}" (código de duas letras, ISO 3166)`);
  if (!String(ship.street || '').trim() || !String(ship.city || '').trim()) problems.push('Endereço no exterior incompleto: faltam a rua ou a cidade');
  const foreignId = String(order.buyer?.foreignId || '').replace(/\s+/g, '');
  if (foreignId && !FOREIGN_ID.test(foreignId)) problems.push('Documento do comprador estrangeiro inválido: de 5 a 20 letras ou números (passaporte ou outro documento)');
  const lines = linesOf(order, fiscal, problems), {productsCents, freightCents, discountCents} = lines;
  // The tax unit of each item (rejeição 817): the pieces themselves (the note's unit) or their net weight in KG. One still
  // to be filled is already in the list above.
  const items = lines.items.map(i => {
    const unit = String(exp.taxUnit?.[i.ncm] || '').trim().toUpperCase(), grams = Number(exp.netG?.[i.code]);
    if (!i.ncm || pending(unit) || unit === String(fiscal.unit).toUpperCase()) return i;
    if (!unit) problems.push(`Unidade tributável da exportação a preencher em api/_lib/fiscal.js: export.taxUnit.${i.ncm}`);
    else if (unit !== 'KG') problems.push(`Unidade tributável da exportação "${unit}" (NCM ${i.ncm}): o site só manda ${fiscal.unit} ou KG; faça esta nota à mão no Bling`);
    else if (!(grams > 0)) problems.push(`Peso da peça a preencher em api/_lib/fiscal.js: export.netG.${i.code}`);
    else return {...i, tax: {unit: 'KG', quantity: Math.round(i.quantity * grams * 10) / 10000}};   // qTrib: up to 4 decimals
    return i;
  });
  if (problems.length) return {ok: false, problems: [...new Set(problems)]};

  const join = (parts, separator) => parts.map(p => String(p || '').trim()).filter(Boolean).join(separator);
  const postalCode = String(ship.postalCode || ship.cep || '').trim(), filled = value => pending(value) ? null : value;
  const where = {exitState: String(shipment.state).toUpperCase(), place: String(shipment.place).trim(), address: String(shipment.address).trim(), cnpj: fields.formatCnpj(fields.normalizeCnpj(shipment.cnpj))};
  return {ok: true, invoice: {
    reference: order.reference, environment, issuedAt: new Date(now).toISOString(),
    nature: exp.nature, series: fiscal.series,
    purpose: '1', presence: '2', finalConsumer: true, destination: '3', intermediary: '0',   // normal, internet, consumidor final, exterior, sem intermediador
    issuer: {cnpj: fields.normalizeCnpj(company.cnpj) || company.cnpj, name: company.legalName, stateRegistration: fiscal.stateRegistration, crt: fiscal.crt, state: fiscal.issuerState},
    recipient: {name, foreignId, ieIndicator: '9', email: order.buyer?.email || '', address: {
      street: String(ship.street).trim(), number: String(ship.number || '').trim() || 'S/N',
      complement: join([ship.complement, postalCode && `Código postal ${postalCode}`], ' · ').slice(0, 60),
      district: join([ship.district, ship.city, ship.state], ', ').slice(0, 60),
      city: 'EXTERIOR', cityCode: '9999999', state: 'EX', cep: '', country, countryIso: iso
    }},
    items: items.map(i => ({...i, cfop: exp.cfop, unit: fiscal.unit, icms: {origin: exp.icms.origin, csosn: exp.icms.csosn}, pis: {cst: filled(exp.pis?.cst)}, cofins: {cst: filled(exp.cofins?.cst)}})),
    freight: {mode: fiscal.freightMode, cents: freightCents},
    payment: {code: PAYMENT_CODE[order.method] || '99', cents: cents(order.totalCents)},
    totals: {productsCents, freightCents, discountCents, totalCents: cents(order.totalCents)},
    export: where,
    additionalInfo: `${fiscal.additionalInfo} Local de embarque: ${where.place}, ${where.address}, CNPJ ${where.cnpj}. Pedido nº: ${order.reference}`,
    ...(provider === 'bling' ? {bling: {natureId: exp.bling?.natureId}} : {})   // the export nature
  }};
}

module.exports = {buildInvoice, describe, abroad, countryName, PAYMENT_CODE};
