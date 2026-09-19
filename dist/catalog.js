import {PRODUCTS, PRODUCT_CATEGORIES, color, defaults} from './products.js';
import {COMMERCE, money} from './commerce-config.js';
import {readCart, writeCart, putItem} from './cart-store.js';
import {icon} from './icons.js';

const entries = Object.entries(PRODUCTS).map(([id, product]) => ({id, product}));
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const productHref = id => `${document.body.classList.contains('products-page') ? 'index.html' : ''}#produto/${id}`;
const category = key => PRODUCT_CATEGORIES[key] || {label:key};
const offsetFrom = (index, active, length) => {
  let offset = (index - active) % length;
  if (offset > length / 2) offset -= length;
  if (offset < -length / 2) offset += length;
  return offset;
};
function colorsFor(id, product) { const selection = defaults(id); return product.parts.map(part => color(selection[part.id])); }
function productCard({id, product}) {
  const colors = colorsFor(id, product), categoryLabel = category(product.category).label;
  return `<article class="product-rail-card" data-product-id="${id}" tabindex="-1"><a class="product-rail-art" href="${productHref(id)}" aria-label="Personalizar ${product.title}"><img src="assets/${product.image}" alt="${product.title} nas cores originais" width="1024" height="1024" loading="lazy"></a><div class="product-rail-copy"><p class="product-rail-category">${categoryLabel}</p><h3><a href="${productHref(id)}">${product.title}</a></h3><p class="product-rail-subtitle">${product.subtitle}</p><div class="product-rail-active-details" aria-hidden="true"><div><span>Categoria</span><strong>${categoryLabel}</strong></div><div><span>Cores</span><span class="product-swatches">${colors.map(item => `<i style="--swatch:${item.hex}" title="${item.name}"></i>`).join('')}</span></div></div><div class="product-rail-bottom"><strong>${money(COMMERCE.prices[id])}</strong><span class="product-rail-price-note">Preço ilustrativo</span></div><div class="product-rail-actions"><a class="product-customize" href="${productHref(id)}">Personalize o seu</a><button type="button" class="product-cart" data-add-product="${id}" aria-label="Adicionar ${product.title} ao carrinho">${icon('cart')}</button></div></div></article>`;
}
function emptyState(key) { const meta = category(key); return `<div class="catalog-empty"><p class="eyebrow">EM BREVE</p><h3>${meta.emptyMessage || 'Esta coleção está sendo preparada.'}</h3><p>Ela vai ganhar forma com o mesmo cuidado e imaginação da coleção atual.</p></div>`; }

class ProductCarousel {
  constructor(host, items) {
    this.host = host; this.items = items; this.active = 0; this.gesture = null; this.wheelLock = false;
    host.innerHTML = `<div class="product-carousel-stage" tabindex="0" role="region" aria-roledescription="carrossel" aria-label="${host.getAttribute('aria-label') || 'Produtos'}"><div class="product-carousel-track"></div><button class="product-carousel-arrow product-carousel-prev" type="button" aria-label="Ver produto anterior">${icon('arrow')}</button><button class="product-carousel-arrow product-carousel-next" type="button" aria-label="Ver próximo produto">${icon('arrow')}</button></div><div class="product-carousel-dots" role="tablist" aria-label="Escolher produto"></div><p class="sr-only" aria-live="polite" aria-atomic="true"></p>`;
    this.stage = host.querySelector('.product-carousel-stage'); this.track = host.querySelector('.product-carousel-track'); this.dots = host.querySelector('.product-carousel-dots'); this.live = host.querySelector('[aria-live]');
    this.track.innerHTML = items.map(productCard).join(''); this.cards = [...this.track.children];
    this.dots.innerHTML = items.map(({product}, index) => `<button type="button" role="tab" aria-label="Mostrar ${product.title}" aria-selected="${index === 0}" data-dot="${index}"><span class="sr-only">${product.title}</span></button>`).join('');
    this.bind(); this.render(false);
  }
  bind() {
    this.host.querySelector('.product-carousel-prev').addEventListener('click', () => this.move(-1));
    this.host.querySelector('.product-carousel-next').addEventListener('click', () => this.move(1));
    this.dots.addEventListener('click', event => { const button = event.target.closest('[data-dot]'); if (button) this.goTo(Number(button.dataset.dot)); });
    // Suppress the click before it reaches a link, arrow or the document cart handler.
    this.stage.addEventListener('click', event => { if (this.suppressClick) { event.preventDefault(); event.stopPropagation(); this.suppressClick = false; } }, true);
    this.track.addEventListener('dragstart', event => event.preventDefault());
    this.track.addEventListener('click', event => { const card = event.target.closest('[data-product-id]'); if (!card || event.target.closest('[data-add-product]')) return; const index = this.cards.indexOf(card); if (index !== this.active) { event.preventDefault(); this.goTo(index); } });
    this.stage.addEventListener('keydown', event => { if (event.key === 'ArrowLeft') { event.preventDefault(); this.move(-1); } if (event.key === 'ArrowRight') { event.preventDefault(); this.move(1); } });
    this.stage.addEventListener('wheel', event => { if (Math.abs(event.deltaX) < Math.abs(event.deltaY) || Math.abs(event.deltaX) < 12 || this.wheelLock) return; event.preventDefault(); this.wheelLock = true; this.move(event.deltaX > 0 ? 1 : -1); setTimeout(() => { this.wheelLock = false; }, reduceMotion() ? 0 : 360); }, {passive:false});
    this.stage.addEventListener('pointerdown', event => { if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return; this.suppressClick = false; this.gesture = {id:event.pointerId, x:event.clientX, y:event.clientY, moved:false}; });
    this.stage.addEventListener('pointermove', event => { if (!this.gesture || event.pointerId !== this.gesture.id) return; const dx = event.clientX - this.gesture.x, dy = event.clientY - this.gesture.y; if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return; this.gesture.moved = true; this.stage.setPointerCapture?.(event.pointerId); this.track.style.setProperty('--drag', `${Math.max(-24, Math.min(24, dx * .08))}px`); if (event.cancelable) event.preventDefault(); });
    const end = event => {
      if (!this.gesture || event.pointerId !== this.gesture.id) return;
      const dx = event.clientX - this.gesture.x, moved = this.gesture.moved;
      this.gesture = null; this.track.style.removeProperty('--drag');
      if (this.stage.hasPointerCapture?.(event.pointerId)) this.stage.releasePointerCapture(event.pointerId);
      if (moved) {
        this.suppressClick = true;
        if (event.type === 'pointerup' && Math.abs(dx) > 46) this.move(dx < 0 ? 1 : -1);
      }
    };
    this.stage.addEventListener('pointerup', end); this.stage.addEventListener('pointercancel', end);
    this.stage.addEventListener('lostpointercapture', event => { if (event.target === this.stage) end(event); });
    this.stage.addEventListener('pointerleave', event => { if (!this.gesture?.moved) end(event); });
  }
  move(direction) { this.goTo((this.active + direction + this.items.length) % this.items.length); }
  goTo(index) { if (index === this.active) return; this.active = index; this.render(true); }
  render(announce) {
    this.cards.forEach((card, index) => { const position = offsetFrom(index, this.active, this.items.length); card.style.setProperty('--slot', position); card.classList.toggle('is-active', position === 0); card.classList.toggle('is-side', Math.abs(position) === 1); card.classList.toggle('is-far', Math.abs(position) > 1); card.tabIndex = position === 0 ? 0 : -1; card.querySelector('.product-rail-active-details').setAttribute('aria-hidden', String(position !== 0)); });
    [...this.dots.children].forEach((dot, index) => dot.setAttribute('aria-selected', String(index === this.active)));
    if (announce) this.live.textContent = `${this.items[this.active].product.title}, ${this.active + 1} de ${this.items.length}.`;
  }
}
function mountCarousel(host, key = host.dataset.category) { const list = entries.filter(({product}) => product.category === key); if (!list.length) { host.innerHTML = emptyState(key); return; } new ProductCarousel(host, list); }
for (const host of document.querySelectorAll('[data-product-carousel]')) mountCarousel(host);
for (const tabs of document.querySelectorAll('[data-catalog-tabs]')) {
  const categories = Object.entries(PRODUCT_CATEGORIES);
  tabs.innerHTML = categories.map(([key, meta], index) => `<button type="button" role="tab" aria-selected="${index === 0}" data-catalog-filter="${key}">${meta.label}${!entries.some(({product}) => product.category === key) ? ' <span>em breve</span>' : ''}</button>`).join('');
  tabs.addEventListener('click', event => { const button = event.target.closest('[data-catalog-filter]'); if (!button) return; tabs.querySelectorAll('[data-catalog-filter]').forEach(tab => tab.setAttribute('aria-selected', String(tab === button))); const host = tabs.parentElement.querySelector('[data-product-carousel]'); host.dataset.category = button.dataset.catalogFilter; mountCarousel(host, button.dataset.catalogFilter); });
}
document.addEventListener('click', event => { const button = event.target.closest('[data-add-product]'); if (!button || button.disabled) return; const id = button.dataset.addProduct; try { button.disabled = true; button.classList.add('is-loading'); writeCart(putItem(readCart(), id, defaults(id))); window.dispatchEvent(new Event('ju:cart')); location.assign('checkout.html'); } catch (error) { button.disabled = false; button.classList.remove('is-loading'); const notice = button.closest('[data-product-id]')?.querySelector('.product-rail-price-note'); if (notice) notice.textContent = error.message; } });
