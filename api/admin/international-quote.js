'use strict';
// POST /api/admin/international-quote  {country: "MX", items: [{productId, quantity}]} — the panel's "Envio internacional":
// Ju quotes an order from abroad (asked by WhatsApp or e-mail) with the shop's Correios contract. Answers the Exporta Fácil
// options (price for all the boxes and the Correios delivery time), the services the contract or the country refused (with
// the Correios' words, so the shop sees what its contract covers), the boxes, the pieces' value and the customs data to
// copy into Minhas Exportações (HS code and an English description per piece). Behind the panel login (password + code).
const {adminEndpoint} = require('../_lib/admin-http');
const shipping = require('../_lib/shipping');
const {PRODUCTS} = require('../_lib/catalog');

const MAX_PIECES = 10;
const invalid = field => Object.assign(new Error('invalid_request'), {code: 'invalid_request', field});
const SHIPPING_STATUS = {shipping_off: 409, invalid_country: 400, shipping_unavailable: 502};

function linesOf(items) {
  if (!Array.isArray(items) || !items.length || items.length > Object.keys(PRODUCTS).length) throw invalid('items');
  const lines = items.map(item => ({productId: String(item?.productId || ''), quantity: Number(item?.quantity)}));
  if (lines.some(l => !Object.hasOwn(PRODUCTS, l.productId) || !Number.isInteger(l.quantity) || l.quantity < 1) || new Set(lines.map(l => l.productId)).size !== lines.length) throw invalid('items');
  if (lines.reduce((sum, l) => sum + l.quantity, 0) > MAX_PIECES) throw invalid('items');
  return lines;
}

module.exports = adminEndpoint({methods: ['POST'], async handle({body, env, fetchImpl}) {
  // the shared instance per environment keeps the Correios token between quotes
  const lines = linesOf(body.items), engine = shipping.forEnv(env, {fetchImpl}), intl = engine.config.international || {};
  let quote;
  try { quote = await engine.quoteInternational({lines, country: body.country}); }
  catch (error) {
    if (!SHIPPING_STATUS[error.code]) throw error;
    return {status: SHIPPING_STATUS[error.code], body: {error: error.code}};
  }
  const piecesCents = lines.reduce((sum, l) => sum + PRODUCTS[l.productId].price * l.quantity, 0);
  const customs = {
    hsCode: intl.hsCode || '',
    items: lines.map(l => ({productId: l.productId, title: PRODUCTS[l.productId].title, description: intl.descriptions?.[l.productId] || '', quantity: l.quantity, unitCents: PRODUCTS[l.productId].price})),
    dueLimitUsd: intl.dueLimitUsd || null
  };
  return {body: {...quote, piecesCents, customs}};
}});
