import {PRODUCTS, defaults} from './products.js';
import {COMMERCE, money} from './commerce-config.js';
import {readCart, writeCart, putItem} from './cart-store.js';
import {icon} from './icons.js';

const home = document.body.classList.contains('products-page') ? 'index.html' : '';
const productHref = id => `${home}#produto/${id}`;
const asset = id => `assets/catalog-${id}.png`;
const productEntries = Object.entries(PRODUCTS).map(([id, product]) => ({id, product, category: 'oftalmologia'}));

function card({id, product}) {
  return `<article class="catalog-card" data-category="oftalmologia"><a class="catalog-art" href="${productHref(id)}" aria-label="Personalizar ${product.title}"><img src="${asset(id)}" alt="${product.title} nas cores originais, sem pilastra" width="1024" height="1024" loading="lazy"></a><div class="catalog-copy"><p class="catalog-type">Oftalmologia</p><h3><a href="${productHref(id)}">${product.title}</a></h3><p>${product.subtitle}</p><div class="catalog-bottom"><strong>${money(COMMERCE.prices[id])}</strong><button class="catalog-add" type="button" data-add-product="${id}">Adicionar ao carrinho ${icon('cart')}</button></div><a class="catalog-customize" href="${productHref(id)}">Personalizar cores <span aria-hidden="true">↗</span></a></div></article>`;
}
function renderGrid(grid, category = 'oftalmologia') {
  const items = productEntries.filter(item => item.category === category);
  grid.innerHTML = items.length ? items.map(card).join('') : `<div class="catalog-empty"><p class="eyebrow">EM BREVE</p><h3>Novas ideias sensoriais estão chegando.</h3><p>Esta coleção está sendo preparada com o mesmo carinho para a consulta.</p></div>`;
}
for (const grid of document.querySelectorAll('[data-catalog-grid]')) renderGrid(grid);
for (const tabs of document.querySelectorAll('[data-catalog-tabs]')) tabs.addEventListener('click', event => {
  const button = event.target.closest('[data-catalog-filter]'); if (!button) return;
  tabs.querySelectorAll('[data-catalog-filter]').forEach(tab => tab.setAttribute('aria-selected', String(tab === button)));
  const grid = document.querySelector(tabs.dataset.catalogTarget); if (grid) renderGrid(grid, button.dataset.catalogFilter);
});
document.addEventListener('click', event => {
  const button = event.target.closest('[data-add-product]'); if (!button) return;
  const id = button.dataset.addProduct;
  try { writeCart(putItem(readCart(), id, defaults(id))); window.dispatchEvent(new Event('ju:cart')); location.assign('checkout.html'); }
  catch (error) { button.insertAdjacentText('afterend', error.message); }
});
for (const carousel of document.querySelectorAll('[data-catalog-carousel]')) {
  const track = carousel.querySelector('[data-catalog-grid]');
  const move = direction => track.scrollBy({left: direction * Math.max(track.clientWidth * .82, 280), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  carousel.querySelector('.catalog-prev')?.addEventListener('click', () => move(-1)); carousel.querySelector('.catalog-next')?.addEventListener('click', () => move(1));
  let gesture = null, suppressClick = false;
  track.addEventListener('dragstart', event => event.preventDefault());
  track.addEventListener('pointerdown', event => {
    suppressClick = false;
    // Touch uses native scrolling. Capture mouse only after an actual drag,
    // so a regular click still reaches its product link or cart button.
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    gesture = {id:event.pointerId, x:event.clientX, y:event.clientY, scroll:track.scrollLeft, dragging:false};
  });
  track.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!gesture.dragging && Math.abs(dx) > 7 && Math.abs(dx) > Math.abs(dy)) {
      gesture.dragging = true;
      suppressClick = true;
      track.classList.add('is-dragging');
      track.setPointerCapture(event.pointerId);
    }
    if (gesture.dragging) track.scrollLeft = gesture.scroll - dx;
  });
  const end = event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    gesture = null;
    track.classList.remove('is-dragging');
    if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
  };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);
  track.addEventListener('lostpointercapture', end);
  track.addEventListener('pointerleave', event => { if (!gesture?.dragging) end(event); });
  track.addEventListener('click', event => { if (suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false; } }, true);
}
