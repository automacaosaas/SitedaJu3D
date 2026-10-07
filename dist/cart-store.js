import {PRODUCTS, validSelection} from './products.js';
import {COMMERCE, kitOf} from './commerce-config.js';
export const CART_KEY = 'ju.cart.demo.v1';
export const EDIT_KEY = 'ju.cart.edit.v1';
export const DIRECT_KEY = 'ju.direct.demo.v1';
export function selectedItems(items, ids) { return items.filter(item => ids.has(item.id)); }
export function removePurchased(items, purchased) {
  return items.flatMap(item => {
    const bought = purchased.find(p => p.id === item.id && signature(p.productId,p.selection) === signature(item.productId,item.selection));
    if (!bought) return [item];
    return item.quantity > bought.quantity ? [{...item, quantity:item.quantity-bought.quantity}] : [];
  });
}
export const signature = (productId, selection) => productId + ':' + PRODUCTS[productId].parts.map(p => selection[p.id]).join(':');
const uid = () => globalThis.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function normalizeCart(value) {
  if (!Array.isArray(value)) return [];
  const result = [];
  for (const raw of value.slice(0, 60)) {
    if (!raw || !Object.hasOwn(PRODUCTS, raw.productId)) continue;
    const selection = validSelection(raw.productId, raw.selection), key = signature(raw.productId, selection);
    const quantity = Math.max(1, Math.min(99, Math.floor(Number(raw.quantity) || 1)));
    const existing = result.find(i => signature(i.productId, i.selection) === key);
    if (existing) { existing.quantity = Math.min(99, existing.quantity + quantity); continue; }
    result.push({id: typeof raw.id === 'string' && raw.id.length < 100 && !result.some(i => i.id === raw.id) ? raw.id : uid(),
      productId: raw.productId, title: PRODUCTS[raw.productId].title, selection, quantity,
      unitPrice: COMMERCE.prices[raw.productId], createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
      thumbnail: typeof raw.thumbnail === 'string' && /^data:image\/png;base64,/.test(raw.thumbnail) && raw.thumbnail.length < 700000 ? raw.thumbnail : null});
  }
  return result;
}
export function readCart(storage = localStorage) { try { return normalizeCart(JSON.parse(storage.getItem(CART_KEY) || '[]')); } catch { return []; } }
export function writeCart(items, storage = localStorage) {
  const normalized = normalizeCart(items);
  try { storage.setItem(CART_KEY, JSON.stringify(normalized)); return normalized; }
  catch { throw new Error('Não foi possível salvar o carrinho. Libere espaço no navegador e tente novamente.'); }
}
export function putItem(items, productId, selection, thumbnail = null, editId = null) {
  if (!Object.hasOwn(PRODUCTS, productId)) throw new Error('Produto inválido.');
  const cart = normalizeCart(items), colors = validSelection(productId, selection);
  const old = editId ? cart.find(i => i.id === editId) : null;
  if (editId && !old) throw new Error('Este item foi removido do carrinho. Volte ao carrinho para continuar.');
  const remaining = cart.filter(i => i.id !== editId);
  const same = remaining.find(i => signature(i.productId, i.selection) === signature(productId, colors));
  if (same) { same.quantity = Math.min(99, same.quantity + (old?.quantity || 1)); if (thumbnail) same.thumbnail = thumbnail; }
  else remaining.push({id: old?.id || uid(), productId, selection: colors, quantity: old?.quantity || 1, thumbnail,
    unitPrice: COMMERCE.prices[productId], createdAt: old?.createdAt || new Date().toISOString()});
  return normalizeCart(remaining);
}
// shippingCents: the delivery to add (the fixed example fee unless the checkout passes the real one, from the Correios quote).
// What paying with Pix saves: the discount is taken per unit, exactly as the server does it.
// The same amounts paid with Pix (the demonstration uses it): the pieces with the Pix discount, the delivery unchanged.
// Preço por quantidade: cada linha vira os pedaços que o servidor cobra (api/_lib/catalog.js priceOrder faz igual): a primeira unidade
// de cada peça, na ordem do carrinho, tem o preço cheio; as seguintes, o de COMMERCE.extraPrices, se houver; as peças de um kit, o preço
// do grupo em que caem. [{item, quantity, unitCents}]
// Kits (COMMERCE.kits): as unidades das peças de um kit, somadas no carrinho todo, formam grupos com preço fechado, os maiores primeiro
// (3 lâmpadas: R$ 210, R$ 70 cada; 2: R$ 160, R$ 80 cada); as que sobram sem grupo pagam o preço cheio. O preço de cada unidade, na ordem
// do carrinho (null = o preço cheio).
export function kitUnitPrices(count, groups) {
  const sizes = Object.keys(groups).map(Number).filter(n => n > 1).sort((a, b) => b - a), out = [];
  let left = count;
  for (const size of sizes) while (left >= size) { for (let k = 0; k < size; k++) out.push(groups[size] / size); left -= size; }
  while (left-- > 0) out.push(null);
  return out;
}
export function priceSegments(items) {
  const seen = {}, out = [], queue = {};
  for (const [id, kit] of Object.entries(COMMERCE.kits || {})) queue[id] = kitUnitPrices(items.filter(i => kit.items.includes(i.productId)).reduce((sum, i) => sum + i.quantity, 0), kit.groups);
  for (const i of items) {
    const kit = kitOf(i.productId);
    if (kit) { const prices = queue[kit].splice(0, i.quantity).map(p => p ?? i.unitPrice); for (let k = 0; k < prices.length;) { let j = k; while (j < prices.length && prices[j] === prices[k]) j++; out.push({item: i, quantity: j - k, unitCents: prices[k]}); k = j; } continue; }
    const extra = COMMERCE.extraPrices?.[i.productId], before = seen[i.productId] || 0;seen[i.productId] = before + i.quantity;
    const full = extra == null ? i.quantity : Math.max(0, Math.min(i.quantity, 1 - before));
    if (full) out.push({item: i, quantity: full, unitCents: i.unitPrice});
    if (i.quantity > full) out.push({item: i, quantity: i.quantity - full, unitCents: extra});
  }
  return out;
}
// o que uma linha custa dentro do carrinho todo (o 2.º avião pode estar nela)
export const lineCents = (items, item) => priceSegments(items).filter(s => s.item === item).reduce((sum, s) => sum + s.unitCents * s.quantity, 0);
export function pixTotals(items, shippingCents = COMMERCE.shippingCents) { const base = totals(items, shippingCents), discount = pixDiscount(items); return {...base, discount, total: base.total - discount}; }
export function pixDiscount(items, bps = COMMERCE.pixDiscountBps) { return priceSegments(items).reduce((sum, s) => sum + Math.round(s.unitCents * bps / 10000) * s.quantity, 0); }
export function totals(items, shippingCents = COMMERCE.shippingCents) { const subtotal = priceSegments(items).reduce((sum, s) => sum + s.unitCents * s.quantity, 0); const shipping = items.length ? shippingCents : 0; return {subtotal, shipping, total: subtotal + shipping}; }
