'use strict';
// Server-side copy of the catalog. The browser only says WHAT was chosen (product, quantity, colors); prices, titles and
// the delivery fee always come from here. tests/payments.mjs fails when this drifts from dist/products.js or
// dist/commerce-config.js, so the two copies cannot silently disagree.
const SHIPPING_CENTS = 1800;
const MAX_LINES = 60, MAX_QUANTITY = 99;

// Color and part names in the three site languages (same wording as dist/translations.js).
const COLORS = Object.freeze({
  mint: ['Verde-menta', 'Mint green', 'Verde menta'], sky: ['Azul-céu', 'Sky blue', 'Azul cielo'], blue: ['Azul-royal', 'Royal blue', 'Azul real'],
  pink: ['Rosa Ju', 'Ju pink', 'Rosa Ju'], lilac: ['Lilás', 'Lilac', 'Lila'], yellow: ['Amarelo', 'Yellow', 'Amarillo'],
  red: ['Vermelho', 'Red', 'Rojo'], orange: ['Laranja', 'Orange', 'Naranja'], white: ['Branco', 'White', 'Blanco'], black: ['Preto', 'Black', 'Negro']
});
const PARTS = Object.freeze({
  body: ['Corpo', 'Body', 'Cuerpo'],
  wings: ['Detalhes das asas', 'Wing details', 'Detalles de las alas'],
  spikes: ['Crista e bolinhas', 'Spikes and dots', 'Cresta y puntos'],
  stars: ['Estrelas e topo', 'Stars and top', 'Estrellas y parte superior'],
  engines: ['Motores', 'Engines', 'Motores']
});
// The part ids below are the site's own ("body", "details", "engines"); `names` says which wording each product uses.
const PRODUCTS = Object.freeze({
  borboletoscopio: {title: 'Borboletoscópio', price: 12900, parts: [{id: 'body', names: PARTS.body, default: 'mint'}, {id: 'details', names: PARTS.wings, default: 'yellow'}]},
  dinossauroscopio: {title: 'Dinossauroscópio', price: 13900, parts: [{id: 'body', names: PARTS.body, default: 'sky'}, {id: 'details', names: PARTS.spikes, default: 'mint'}]},
  aviaoscopia: {title: 'Aviãoscopia', price: 15900, parts: [{id: 'body', names: PARTS.body, default: 'blue'}, {id: 'details', names: PARTS.stars, default: 'red'}, {id: 'engines', names: PARTS.engines, default: 'yellow'}]}
});
const LANG_INDEX = {'pt-BR': 0, en: 1, es: 2};

const fail = code => Object.assign(new Error(code), {code});

function cleanSelection(productId, value) {
  const selection = {};
  for (const part of PRODUCTS[productId].parts) {
    const chosen = value && typeof value === 'object' ? value[part.id] : undefined;
    selection[part.id] = typeof chosen === 'string' && Object.hasOwn(COLORS, chosen) ? chosen : part.default;
  }
  return selection;
}

// Turns what the browser sent into priced lines. Anything that does not look like a real cart is refused, never "fixed".
function priceOrder(rawItems) {
  if (!Array.isArray(rawItems) || !rawItems.length || rawItems.length > MAX_LINES) throw fail('invalid_items');
  const lines = rawItems.map(raw => {
    if (!raw || typeof raw.productId !== 'string' || !Object.hasOwn(PRODUCTS, raw.productId)) throw fail('invalid_items');
    const quantity = raw.quantity;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) throw fail('invalid_items');
    const product = PRODUCTS[raw.productId];
    return {productId: raw.productId, title: product.title, quantity, unitCents: product.price, selection: cleanSelection(raw.productId, raw.selection)};
  });
  const subtotal = lines.reduce((sum, line) => sum + line.unitCents * line.quantity, 0);
  return {lines, subtotal, shipping: SHIPPING_CENTS, total: subtotal + SHIPPING_CENTS};
}

// Mercado Pago wants amounts as strings with two decimals ("129.00").
const amount = cents => (cents / 100).toFixed(2);
const fromAmount = value => Math.round(Number(value) * 100);
const money = cents => new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(cents / 100);

// The chosen colors travel inside the MP item as `body=mint;details=yellow` (item description accepts 100 characters),
// so the paid order can be rebuilt from Mercado Pago alone, without a database.
const encodeSelection = (productId, selection) => PRODUCTS[productId].parts.map(part => `${part.id}=${selection[part.id]}`).join(';');
function decodeSelection(productId, text) {
  const chosen = {};
  for (const pair of String(text || '').split(';')) { const [key, value] = pair.split('='); if (key) chosen[key.trim()] = (value || '').trim(); }
  return cleanSelection(productId, chosen);
}
function describeSelection(productId, selection, lang = 'pt-BR') {
  const at = LANG_INDEX[lang] ?? 0;
  return PRODUCTS[productId].parts.map(part => ({part: part.names[at], color: COLORS[selection[part.id]][at]}));
}

module.exports = {PRODUCTS, COLORS, SHIPPING_CENTS, MAX_LINES, MAX_QUANTITY, priceOrder, cleanSelection, amount, fromAmount, money, encodeSelection, decodeSelection, describeSelection};
