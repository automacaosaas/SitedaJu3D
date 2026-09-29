'use strict';
// Builds the NF-e for an order in a neutral shape (NF-e layout 4.00 concepts, amounts in cents) that each provider
// adapter (api/_lib/nfe-providers/) turns into its own API call. Nothing is sent here; problems are listed in plain
// Portuguese so the panel can show what is missing (tax data, store details, recipient document, CEP).
const fields = require('./fields');
const {describeSelection, cleanSelection, PRODUCTS} = require('./catalog');
const {COMPANY} = require('./legal');
const {FISCAL, missing} = require('./fiscal');

const PAYMENT_CODE = {pix: '17', card: '03', debit: '04'};   // tPag: Pix, cartão de crédito, cartão de débito
const pending = value => String(value || '').startsWith('[PREENCHER');
const cents = value => Math.round(Number(value) || 0);

// The line on the invoice: the piece and its colors, within the 120 characters of xProd.
function describe(item) {
  const colors = PRODUCTS[item.productId] ? describeSelection(item.productId, cleanSelection(item.productId, item.selection || {}), 'pt-BR').map(p => `${p.part}: ${p.color}`).join(', ') : '';
  return (colors ? `${item.title} (${colors})` : item.title).slice(0, 120);
}

// Who receives the invoice: the company (CNPJ and state registration) when the buyer bought as one, otherwise the person.
// ieIndicator (indIEDest): 1 contribuinte, 2 isento, 9 não contribuinte.
function recipientOf(order, env) {
  const company = order.buyer?.company;
  if (company?.cnpj) {
    const ie = String(company.stateRegistration || '').toUpperCase();
    return {name: company.name || order.buyer?.name || '', cnpj: fields.normalizeCnpj(company.cnpj) || company.cnpj, stateRegistration: ie && ie !== 'ISENTO' ? ie : '', ieIndicator: ie && ie !== 'ISENTO' ? '1' : '2'};
  }
  let cpf = '';
  try { cpf = order.buyerDocEnc ? fields.decrypt(env, order.buyerDocEnc) : ''; } catch { cpf = ''; }
  return {name: order.buyer?.name || '', cpf, ieIndicator: '9'};
}

function buildInvoice({order, city, environment, provider, env = process.env, company = COMPANY, fiscal = FISCAL, now = Date.now()}) {
  const problems = [];
  const gaps = missing(fiscal, {provider});
  if (gaps.length) problems.push(`Dados fiscais a preencher (api/_lib/fiscal.js): ${gaps.join(', ')}`);
  for (const key of ['legalName', 'cnpj']) if (pending(company[key])) problems.push(`Dados da empresa a preencher (api/_lib/legal.js): ${key}`);
  const recipient = recipientOf(order, env);
  if (!recipient.cpf && !recipient.cnpj) problems.push('Pedido sem CPF ou CNPJ do comprador');
  const ship = order.shipTo || {};
  if (!city) problems.push(`CEP ${ship.cep || '(vazio)'} não encontrado: confira o endereço de entrega`);
  else if (city.state !== ship.state) problems.push(`O CEP ${ship.cep} é de ${city.state}, mas o endereço diz ${ship.state}`);
  const items = (order.items || []).map(item => {
    const ncm = fiscal.products?.[item.productId]?.ncm;
    if (!ncm) problems.push(`Produto sem NCM em api/_lib/fiscal.js: ${item.productId}`);
    return {code: item.productId, description: describe(item), ncm, quantity: item.quantity, unitCents: cents(item.unitCents), totalCents: cents(item.unitCents) * item.quantity};
  });
  if (!items.length) problems.push('Pedido sem itens');
  const productsCents = items.reduce((sum, i) => sum + i.totalCents, 0), freightCents = cents(order.shippingCents);
  if (productsCents + freightCents !== cents(order.totalCents)) problems.push('Os itens mais o frete não somam o total do pedido');
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
    totals: {productsCents, freightCents, totalCents: cents(order.totalCents)},
    additionalInfo: `${fiscal.additionalInfo}${difal} Pedido ${order.reference}.`,
    ...(provider === 'bling' ? {bling: {natureId: fiscal.bling?.natureId}} : {})
  }};
}

module.exports = {buildInvoice, describe, PAYMENT_CODE};
