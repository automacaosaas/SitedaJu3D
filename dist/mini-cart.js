// Mini-cart (audit E1): adding a piece opens a drawer instead of leaving the shop. It confirms the piece just added (in its
// colors), shows what the cart adds up to with the free-shipping bar, offers "Complete o kit" with the pieces not in the cart
// yet (in their original colors), and two ways on: "Ver carrinho" and "Continuar escolhendo". Drawer on the right on a
// computer, sheet from the bottom on a phone. A <dialog>, so it sits above everything, traps focus and closes with Esc.
import {PRODUCTS, color, defaults} from './products.js';
import {COMMERCE, money} from './commerce-config.js';
import {readCart, writeCart, putItem, totals, pixDiscount, priceSegments, signature} from './cart-store.js';
import {loadShippingConfig} from './shipping-client.js';
import {freeShippingBar} from './free-shipping.js';
import {icon} from './icons.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const pieces = n => `${n} ${n === 1 ? 'peça' : 'peças'}`;
const picture = item => item.thumbnail || `assets/${PRODUCTS[item.productId].catalogImage || PRODUCTS[item.productId].image}`;

// The drawer's content for a cart, without touching the page (tests render it in Node).
// itemId: the piece just added; original: it went in with the original colors; freeShipping: {fromCents, label} or null.
export function miniCartBody({cart, itemId, original = false, freeShipping = null}) {
  const item = cart.find(i => i.id === itemId) || cart.at(-1);
  const units = cart.reduce((sum, i) => sum + i.quantity, 0), amount = totals(cart, 0);
  const pix = amount.subtotal - pixDiscount(cart);
  const kit = Object.keys(PRODUCTS).filter(id => !cart.some(i => i.productId === id));
  const added = item ? `<article class="mini-cart-item"><img src="${esc(picture(item))}" alt="" width="96" height="96"><div><h3>${esc(item.title)}</h3>`
    + `<ul class="mini-cart-colors" aria-label="Cores de ${esc(item.title)}">${PRODUCTS[item.productId].parts.map(part => { const c = color(item.selection[part.id]); return `<li><i style="--chip:${c.hex}" aria-hidden="true"></i>${esc(part.name)}: <strong>${esc(c.name)}</strong></li>`; }).join('')}</ul>`
    + `<p>${priceSegments(cart).filter(s => s.item === item).map(s => `${s.quantity} × ${money(s.unitCents)}`).join(' + ')}${original ? ' · <span>cores originais</span>' : ''}</p></div></article>` : '';
  const kitList = kit.length ? `<section class="mini-cart-kit" aria-labelledby="mini-cart-kit-title"><h3 id="mini-cart-kit-title">Complete o kit</h3><ul>${kit.map(id => {
    const product = PRODUCTS[id];
    return `<li><img src="assets/${esc(product.catalogImage || product.image)}" alt="" width="56" height="56"><span><strong>${esc(product.title)}</strong><small>${money(COMMERCE.prices[id])}</small></span><button type="button" class="mini-cart-add" data-kit-add="${id}" aria-label="Adicionar ${esc(product.title)} nas cores originais">${icon('cart')}<span>Adicionar</span></button></li>`;
  }).join('')}</ul></section>` : '';
  return `<header class="mini-cart-head"><p class="mini-cart-check">${icon('check')}<span>${original ? 'Adicionado nas cores originais' : 'Adicionado ao carrinho'}</span></p>`
    + `<button type="button" class="mini-cart-close" data-mini-close aria-label="Fechar o carrinho">×</button></header>`
    + `<div class="mini-cart-scroll">${added}`
    + `<dl class="mini-cart-total"><div><dt>${pieces(units)} no carrinho</dt><dd>${money(amount.subtotal)}</dd></div><div class="mini-cart-pix"><dt>No Pix</dt><dd>${money(pix)}</dd></div></dl>`
    + `${freeShippingBar(freeShipping, amount.subtotal)}${kitList}</div>`
    + `<div class="mini-cart-actions"><a class="primary" href="checkout.html" data-mini-cart-go>Ver carrinho ${icon('arrow')}</a><button type="button" class="mini-cart-continue" data-mini-close>Continuar escolhendo</button></div>`;
}
let dialog = null, freeShipping = null, configAsked = null, shownId = null, shownOriginal = false;
function paint() {
  const body = dialog.querySelector('.mini-cart-body');
  body.innerHTML = miniCartBody({cart: readCart(), itemId: shownId, original: shownOriginal, freeShipping});
}
function ensureDialog() {
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'mini-cart';
  dialog.setAttribute('aria-label', 'Seu carrinho');
  dialog.innerHTML = '<div class="mini-cart-body"></div><p class="sr-only" role="status" aria-live="polite"></p>';
  document.body.append(dialog);
  dialog.addEventListener('click', event => {
    if (event.target === dialog || event.target.closest('[data-mini-close]')) { dialog.close(); return; }
    const kit = event.target.closest('[data-kit-add]');
    if (!kit) return;
    const id = kit.dataset.kitAdd;
    try {
      const cart = writeCart(putItem(readCart(), id, defaults(id)));
      shownId = cart.find(i => signature(i.productId, i.selection) === signature(id, defaults(id)))?.id || null; shownOriginal = true;
      window.dispatchEvent(new Event('ju:cart'));
      paint();
      dialog.querySelector('[role=status]').textContent = `${PRODUCTS[id].title} adicionado nas cores originais.`;
      dialog.querySelector('[data-mini-cart-go]')?.focus();
    } catch (error) { dialog.querySelector('[role=status]').textContent = error.message; }
  });
  return dialog;
}

// Opens the drawer for the piece just added. Safe to call again while open (it repaints).
export function openMiniCart({itemId = null, original = false} = {}) {
  ensureDialog();
  shownId = itemId; shownOriginal = original;
  paint();
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('[data-mini-cart-go]')?.focus();
  configAsked ??= loadShippingConfig().then(config => config.mode === 'correios' ? config.freeShipping : null).catch(() => null);
  configAsked.then(value => { freeShipping = value; if (dialog.open) { const focused = document.activeElement?.matches?.('[data-mini-cart-go]'); paint(); if (focused) dialog.querySelector('[data-mini-cart-go]')?.focus(); } });
}

// Finds the cart line for a product and colors (after putItem merged equal combinations).
export function addedItemId(cart, productId, selection) {
  return cart.find(i => i.productId === productId && signature(i.productId, i.selection) === signature(productId, {...defaults(productId), ...selection}))?.id || null;
}
