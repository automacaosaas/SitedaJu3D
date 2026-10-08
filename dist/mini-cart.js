// Mini-cart (audit E1): adding a piece opens a drawer instead of leaving the shop. It confirms the piece just added (in its
// colors), shows what the cart adds up to with the free-shipping bar, offers "Complete o kit" with up to 3 other pieces of the
// same category (in their original colors; they stay after being added, with how many are in the cart on the button), and
// two ways on: "Ver carrinho" and "Continuar escolhendo". Drawer on the right on a computer, sheet from the bottom on a
// phone; it slides away when closed. A <dialog>, so it sits above everything, traps focus and closes with Esc.
// "Monte seu kit" (kit-builder.js) opens it for several pieces added at once: each one is confirmed (itemIds).
import {PRODUCTS, color, defaults, artSmall, itemColors, fixedColors, showcase} from './products.js';
import {COMMERCE, money, kitOf} from './commerce-config.js';
import {readCart, writeCart, putItem, totals, pixDiscount, priceSegments, signature} from './cart-store.js';
import {loadShippingConfig} from './shipping-client.js';
import {freeShippingBar, riseBar} from './free-shipping.js';
import {icon} from './icons.js';
import {journeyColors} from './hero-motion.js';
import {lateCssReady, whenStyled} from './late-css.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const pieces = n => `${n} ${n === 1 ? 'peça' : 'peças'}`;
const picture = item => item.thumbnail || `assets/${artSmall(PRODUCTS[item.productId].catalogImage || PRODUCTS[item.productId].image)}`;
// the thumbnail sits on its own piece's wash (the --theme-wash of the dialog and the page of that piece), not on a fixed pink
const wash = id => journeyColors(showcase(id).theme)['--theme-wash'];

// The drawer's content for a cart, without touching the page (tests render it in Node).
// itemId: the piece just added; original: it went in with the original colors; freeShipping: {fromCents, label} or null.
// itemIds: several lines added at once ("Monte seu kit", kit-builder.js): each one is confirmed, and the header says the kit went in.
export function miniCartBody({cart, itemId, itemIds = null, original = false, freeShipping = null}) {
  const several = itemIds?.length ? cart.filter(i => itemIds.includes(i.id)) : [];
  const item = several[0] || cart.find(i => i.id === itemId) || cart.at(-1), shown = several.length ? several : item ? [item] : [];
  const units = cart.reduce((sum, i) => sum + i.quantity, 0), amount = totals(cart, 0);
  const pix = amount.subtotal - pixDiscount(cart);
  // "Complete o kit": the other pieces of the same category as the one just added (oftalmologia today; sensoriais and others later).
  // A lamp (a kit with a closed price: 2 por R$ 160, 3 por R$ 210) suggests only the other lamps (08/10/2026: never a piece out of its
  // kit), with how many are already in the cart; the whole kit just added: "Você também pode gostar", with the other pieces of the
  // category. The pieces just added are never suggested again.
  const category = item ? PRODUCTS[item.productId].category : null;
  const just = new Set(shown.map(i => i.productId)), lamp = !!(item && kitOf(item.productId));
  const peers = lamp ? COMMERCE.kits[kitOf(item.productId)].items.filter(id => !just.has(id) && Object.hasOwn(PRODUCTS, id)) : [];
  const others = Object.keys(PRODUCTS).filter(id => !just.has(id) && (!category || PRODUCTS[id].category === category));
  const kit = (peers.length ? peers : others).slice(0, 3), kitTitle = lamp && !peers.length ? 'Você também pode gostar' : 'Complete o kit';
  const inCart = id => cart.filter(i => signature(i.productId, i.selection) === signature(id, defaults(id))).reduce((sum, i) => sum + i.quantity, 0);
  // a piece in its own colours (the lamps) shows them as one row of dots (the names stay for screen readers); a customized one, part by part
  const colorsOf = line => fixedColors(line.productId)
    ? `<ul class="mini-cart-colors is-dots" aria-label="Cores de ${esc(line.title)}">${itemColors(line.productId).map(c => `<li><i style="--chip:${c.hex}" aria-hidden="true"></i><span class="sr-only">${esc(c.name)}</span></li>`).join('')}</ul>`
    : `<ul class="mini-cart-colors" aria-label="Cores de ${esc(line.title)}">${itemColors(line.productId, line.selection).map(c => `<li><i style="--chip:${c.hex}" aria-hidden="true"></i>${c.part ? `${esc(c.part)}: ` : ''}<strong>${esc(c.name)}</strong></li>`).join('')}</ul>`;
  const added = shown.map(line => `<article class="mini-cart-item"><img src="${esc(picture(line))}" alt="" width="96" height="96" style="--thumb-wash:${wash(line.productId)}"><div><h3>${esc(line.title)}</h3>`
    + colorsOf(line)
    + `<p>${priceSegments(cart).filter(s => s.item === line).map(s => `${s.quantity} × ${money(s.unitCents)}`).join(' + ')}${original ? ' · <span>cores originais</span>' : ''}</p></div></article>`).join('');
  const kitList = kit.length ? `<section class="mini-cart-kit" aria-labelledby="mini-cart-kit-title"><h3 id="mini-cart-kit-title">${kitTitle}</h3><ul>${kit.map(id => {
    const product = PRODUCTS[id];
    const count = inCart(id);
    return `<li><img src="assets/${esc(artSmall(product.catalogImage || product.image))}" alt="" width="56" height="56" style="--thumb-wash:${wash(id)}"><span><strong>${esc(product.title)}</strong><small>${money(COMMERCE.prices[id])}</small></span><button type="button" class="mini-cart-add" data-kit-add="${id}" aria-label="Adicionar ${esc(product.title)} nas cores originais"><span class="mini-cart-add-track"><span class="mini-cart-add-cart">${icon('cart')}</span><span class="mini-cart-add-label">Adicionar</span></span>${count ? `<b class="mini-cart-add-count" aria-hidden="true"><span>${count}</span></b>` : ''}</button></li>`;
  }).join('')}</ul></section>` : '';
  return `<header class="mini-cart-head"><p class="mini-cart-check">${icon('check')}<span id="mini-cart-title">${several.length > 1 ? 'Kit adicionado ao carrinho' : original ? 'Adicionado nas cores originais' : 'Adicionado ao carrinho'}</span></p>`
    + `<button type="button" class="mini-cart-close" data-mini-close aria-label="Fechar o carrinho">×</button></header>`
    + `<div class="mini-cart-scroll">${added}`
    + `<dl class="mini-cart-total" id="mini-cart-total"><div><dt>${pieces(units)} no carrinho</dt><dd>${money(amount.subtotal)}</dd></div><div class="mini-cart-pix"><dt>No Pix</dt><dd>${money(pix)}</dd></div></dl>`
    + `${freeShippingBar(freeShipping, amount.subtotal)}${kitList}</div>`
    + `<div class="mini-cart-actions"><a class="primary" href="checkout.html" data-mini-cart-go>Ver carrinho ${icon('arrow')}</a><button type="button" class="mini-cart-continue" data-mini-close>Continuar escolhendo</button></div>`;
}
// riseFrom: the subtotal before the piece just added, so the free-shipping bar rises from there (kept until the bar shows,
// which can be a moment later, when the shipping rule arrives from the server).
let dialog = null, freeShipping = null, configAsked = null, shownId = null, shownIds = null, shownOriginal = false, riseFrom = null;
function paint() {
  const body = dialog.querySelector('.mini-cart-body'), cart = readCart();
  body.innerHTML = miniCartBody({cart, itemId: shownId, itemIds: shownIds, original: shownOriginal, freeShipping});
  if (riseFrom !== null && freeShipping?.fromCents && body.querySelector('.free-ship')) { riseBar(body, Math.min(1, Math.max(0, riseFrom) / freeShipping.fromCents)); riseFrom = null; }
}
function ensureDialog() {
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'mini-cart';
  // its name is the confirmation itself ("Kit adicionado ao carrinho"…) and its description the cart total (usabilidade 5)
  dialog.setAttribute('aria-labelledby', 'mini-cart-title'); dialog.setAttribute('aria-describedby', 'mini-cart-total');
  dialog.innerHTML = '<div class="mini-cart-body"></div><p class="sr-only" role="status" aria-live="polite"></p>';
  document.body.append(dialog);
  dialog.addEventListener('close', () => { riseFrom = null; dialog.classList.remove('is-closing'); });
  // the slide away ends, then it closes (on a phone it lasts a little longer than on a computer: it waits for its own end)
  dialog.addEventListener('animationend', event => { if (event.target === dialog && /^mini-cart-(out|down)$/.test(event.animationName) && dialog.classList.contains('is-closing')) dialog.close(); });
  // Esc, the ×, "Continuar escolhendo" and a click outside: the drawer slides away (down on a phone) before it closes
  dialog.addEventListener('cancel', event => { event.preventDefault(); leave(); });
  dialog.addEventListener('click', event => {
    if (event.target === dialog || event.target.closest('[data-mini-close]')) { leave(); return; }
    const kit = event.target.closest('[data-kit-add]');
    if (!kit) return;
    const id = kit.dataset.kitAdd;
    try {
      riseFrom = totals(readCart(), 0).subtotal;
      const before = dialog.querySelector(`[data-kit-add="${id}"] .mini-cart-add-count span`)?.textContent || '';
      writeCart(putItem(readCart(), id, defaults(id)));
      window.dispatchEvent(new Event('ju:cart'));
      // the piece shown on top stays; the kit piece stays too, with its new count, and the cart runs across its button
      paint();
      // the badge keeps the old number (or stays hidden) while the cart runs, and changes as the cart comes back in
      const button = dialog.querySelector(`[data-kit-add="${id}"]`), badge = button?.querySelector('.mini-cart-add-count');
      if (button && badge && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const after = badge.firstChild.textContent;
        if (before) badge.firstChild.textContent = before; else badge.hidden = true;
        button.classList.add('is-adding');
        setTimeout(() => { badge.hidden = false; badge.firstChild.textContent = after; badge.classList.remove('is-new', 'is-bump'); void badge.offsetWidth; badge.classList.add(before ? 'is-bump' : 'is-new'); }, 560);
        setTimeout(() => button.classList.remove('is-adding'), 1000);
      }
      dialog.querySelector('[role=status]').textContent = `${PRODUCTS[id].title} adicionado nas cores originais.`;
      button?.focus();
    } catch (error) { dialog.querySelector('[role=status]').textContent = error.message; }
  });
  return dialog;
}

function leave() {
  if (!dialog?.open || dialog.classList.contains('is-closing')) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { dialog.close(); return; }
  dialog.classList.add('is-closing');
  setTimeout(() => { if (dialog.classList.contains('is-closing')) dialog.close(); }, 450);   // only a safety net
}

// Opens the drawer for the piece just added. Safe to call again while open (it repaints).
// itemIds: several lines just added (a kit); riseFrom: the subtotal before them, so the free-shipping bar rises from there (with
// one piece it is worked out from that piece's price).
export function openMiniCart({itemId = null, itemIds = null, original = false, riseFrom: from = null} = {}) {
  // On the home its stylesheet arrives after the first paint (late-css.js): never open unstyled.
  if (!lateCssReady()) return void whenStyled(() => openMiniCart({itemId, itemIds, original, riseFrom: from}));
  ensureDialog();
  shownId = itemId; shownIds = itemIds?.length ? [...itemIds] : null; shownOriginal = original;
  const cart = readCart(), item = cart.find(i => i.id === itemId);
  riseFrom = from ?? (item ? totals(cart, 0).subtotal - item.unitPrice : null);
  paint();
  dialog.classList.remove('is-closing');
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('[data-mini-cart-go]')?.focus();
  configAsked ??= loadShippingConfig().then(config => config.mode === 'correios' ? config.freeShipping : null).catch(() => null);
  configAsked.then(value => { freeShipping = value; if (dialog.open) { const focused = document.activeElement?.matches?.('[data-mini-cart-go]'); paint(); if (focused) dialog.querySelector('[data-mini-cart-go]')?.focus(); } });
}

// Finds the cart line for a product and colors (after putItem merged equal combinations).
export function addedItemId(cart, productId, selection) {
  return cart.find(i => i.productId === productId && signature(i.productId, i.selection) === signature(productId, {...defaults(productId), ...selection}))?.id || null;
}
