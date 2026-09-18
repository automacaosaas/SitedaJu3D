import {PRODUCTS, validSelection} from './products.js';
import {COMMERCE} from './commerce-config.js';
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
export function totals(items) { const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0); const shipping = items.length ? COMMERCE.shippingCents : 0; return {subtotal, shipping, total: subtotal + shipping}; }
