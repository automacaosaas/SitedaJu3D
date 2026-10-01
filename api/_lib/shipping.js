'use strict';
// Real shipping quote: cart lines + destination CEP → the options the buyer can pick, priced with the shop's Correios
// contract. Used twice with the same instance: to show the options (POST /api/shipping/quote) and, when paying, to
// recompute the price on the server (POST /api/payments/create) — the browser's number is never trusted, only compared.
//
//   status()  'off' (no Correios credentials) · 'pending' (credentials, but the shop data in shipping-config.js is
//             incomplete) · 'correios' (quoting for real). Anything but 'correios' keeps the fixed example fee.
//   volumes() the boxes an order needs (one shared box for every product, or each product filling its own; see shipping-config.js)
//   quote()   the options, cheapest first: {service, label, priceCents, days:{min,max}, free, …}
const baseConfig = require('./shipping-config');
const {createCorreios, settings: correiosSettings} = require('./correios');
const {PRODUCTS} = require('./catalog');

const CACHE_MS = 10 * 60 * 1000;
const fail = (code, extra = {}) => Object.assign(new Error(code), {code, ...extra});
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const validBox = box => Boolean(box) && [box.length, box.width, box.height, box.weightG].every(positive) && box.weightG <= 30000
  && Math.max(box.length, box.width, box.height) <= 105 && box.length + box.width + box.height <= 200;
// One box any product fits in: its size, `maxPieces` (how many pieces fit) and `pieceG`, the packed weight of one piece of each
// product. A box weighs the sum of the pieces it holds.
const validShared = shared => {
  if (!shared || !Number.isInteger(shared.maxPieces) || shared.maxPieces < 1 || !shared.pieceG) return false;
  const weights = Object.keys(PRODUCTS).map(id => shared.pieceG[id]);
  return weights.every(positive) && validBox({length: shared.length, width: shared.width, height: shared.height, weightG: Math.max(...weights) * shared.maxPieces});
};

// What is still missing in the shop's data (names of the missing pieces; empty when complete).
function missing(config) {
  const gaps = [];
  if (!config.services.some(s => /^\d{5}$/.test(String(s.code || '')))) gaps.push('services');
  const {minDays, maxDays} = config.production || {};
  if (!Number.isInteger(minDays) || !Number.isInteger(maxDays) || minDays < 0 || maxDays < minDays) gaps.push('production');
  if (config.sharedBox) { if (!validShared(config.sharedBox)) gaps.push('sharedBox'); }
  else for (const id of Object.keys(PRODUCTS)) {
    const box = config.boxes?.[id];
    if (!validBox(box?.unit) || !Number.isInteger(box?.perBox) || box.perBox < 1 || (box.perBox > 1 && !validBox(box.full))) gaps.push(`boxes.${id}`);
  }
  if (config.freeShipping && (!positive(config.freeShipping.fromCents) || !config.services.some(s => s.id === config.freeShipping.service && s.code))) gaps.push('freeShipping');
  if (!Number.isInteger(config.labelFeeCents) || config.labelFeeCents < 0) gaps.push('labelFeeCents');
  return gaps;
}

// Lines → volumes, grouped by identical box: [{box, count}].
//   sharedBox  every piece of the order, whatever the product, goes in boxes of up to `maxPieces` (heaviest first); a box weighs the sum
//              of its pieces (`pieceG` of each product).
//   boxes      each product fills its own boxes: a full box holds `perBox` pieces; a box left partly full with more than one piece
//              is sent as a full-size box (the safe side); a single leftover piece goes in its own small box.
function volumesFor(lines, config) {
  const pieces = new Map();
  for (const line of lines) pieces.set(line.productId, (pieces.get(line.productId) || 0) + line.quantity);
  const groups = new Map();
  const add = (count, box) => {
    if (!count) return;
    const key = [box.length, box.width, box.height, box.weightG].join('x');
    groups.set(key, {box: {length: box.length, width: box.width, height: box.height, weightG: box.weightG}, count: (groups.get(key)?.count || 0) + count});
  };
  if (config.sharedBox) {
    const {length, width, height, maxPieces, pieceG} = config.sharedBox;
    const weights = [...pieces].flatMap(([productId, quantity]) => Array(quantity).fill(pieceG[productId])).sort((a, b) => b - a);
    for (let i = 0; i < weights.length; i += maxPieces) add(1, {length, width, height, weightG: weights.slice(i, i + maxPieces).reduce((sum, g) => sum + g, 0)});
    return [...groups.values()];
  }
  for (const [productId, quantity] of pieces) {
    const spec = config.boxes[productId], full = spec.perBox > 1 ? spec.full : spec.unit;
    add(Math.floor(quantity / spec.perBox), full);
    const rest = quantity % spec.perBox;
    if (rest) add(1, rest === 1 ? spec.unit : full);
  }
  return [...groups.values()];
}

function createShipping({env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now(), config = baseConfig} = {}) {
  const correios = createCorreios({env, fetchImpl, now});
  const cache = new Map();
  const remember = (key, load) => {
    const hit = cache.get(key);
    if (hit && hit.expires > now()) return hit.value;
    if (cache.size > 500) for (const [k, v] of cache) if (v.expires <= now()) cache.delete(k);
    const value = load();
    cache.set(key, {value, expires: now() + CACHE_MS});
    value.catch(() => cache.delete(key));
    return value;
  };
  const services = () => config.services.filter(s => /^\d{5}$/.test(String(s.code || '')));

  function status() {
    if (!correiosSettings(env).ready) return {mode: 'off', missing: []};
    const gaps = missing(config);
    return {mode: gaps.length ? 'pending' : 'correios', missing: gaps};
  }

  async function quote({lines, cep, subtotalCents = 0}) {
    if (status().mode !== 'correios') throw fail('shipping_off');
    const destination = String(cep ?? '').replace(/\D/g, '');
    if (!/^\d{8}$/.test(destination)) throw fail('invalid_cep');
    const volumes = volumesFor(lines, config), count = volumes.reduce((sum, v) => sum + v.count, 0);
    const outcomes = await Promise.all(services().map(async service => {
      try {
        const [days, prices] = await Promise.all([
          remember(`d|${service.code}|${destination}`, () => correios.deadline({code: service.code, cepDestino: destination})),
          Promise.all(volumes.map(v => remember(`p|${service.code}|${destination}|${v.box.length}x${v.box.width}x${v.box.height}x${v.box.weightG}`, () => correios.price({code: service.code, cepDestino: destination, box: v.box}))))
        ]);
        const carrierCents = volumes.reduce((sum, v, i) => sum + v.count * prices[i], 0) + config.labelFeeCents * count;
        const free = Boolean(config.freeShipping) && config.freeShipping.service === service.id && subtotalCents >= config.freeShipping.fromCents;
        return {option: {service: service.id, label: service.label, code: service.code, priceCents: free ? 0 : carrierCents, costCents: carrierCents, free, volumes: count,
          deliveryDays: days, days: {min: config.production.minDays + days, max: config.production.maxDays + days}}};
      } catch (error) {
        if (error.code !== 'correios_rejected') console.error(`shipping: ${service.label} (${service.code}) could not be quoted — ${error.code || error.message}${error.status ? ` (${error.status})` : ''}`);
        else console.error(`shipping: ${service.label} (${service.code}) is not offered for ${destination} — ${(error.messages || []).join(' | ') || error.status || ''}`);
        return {error};
      }
    }));
    const options = outcomes.filter(o => o.option).map(o => o.option).sort((a, b) => a.priceCents - b.priceCents || a.days.max - b.days.max);
    if (options.length) return {options, partial: outcomes.some(o => o.error)};
    throw outcomes.some(o => o.error && o.error.code !== 'correios_rejected') ? fail('shipping_unavailable') : fail('no_service');
  }

  return {status, quote, volumes: lines => volumesFor(lines, config), config};
}

// What the browser may know about an option (never the contract code or the shop's cost).
const publicOption = o => ({service: o.service, label: o.label, priceCents: o.priceCents, free: o.free, days: o.days});

// Quote and payment share one instance per environment and fetch, so the price shown and the price charged come from the
// same cache; a different env object (tests) or fetch gets its own.
const instances = new WeakMap();
function forEnv(env, deps = {}) {
  const fetchImpl = deps.fetchImpl || globalThis.fetch, config = deps.config || baseConfig;
  if (deps.now) return createShipping({env, fetchImpl, now: deps.now, config});   // a test clock gets its own instance
  if (!instances.has(env)) instances.set(env, new WeakMap());
  const byFetch = instances.get(env);
  if (!byFetch.has(fetchImpl)) byFetch.set(fetchImpl, new WeakMap());
  const byConfig = byFetch.get(fetchImpl);
  if (!byConfig.has(config)) byConfig.set(config, createShipping({env, fetchImpl, config}));
  return byConfig.get(config);
}

module.exports = {createShipping, forEnv, publicOption, missing, volumesFor, validBox};
