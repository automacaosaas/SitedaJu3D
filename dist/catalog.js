import {openMiniCart, addedItemId} from './mini-cart.js';
import {productGrid} from './product-grid.js';
import {PRODUCTS, SOON, PRODUCT_CATEGORIES, FAMILIES, ALIASES, color, defaults, showcase, fixedColors} from './products.js';
import {COMMERCE, money, pixPrice} from './commerce-config.js';
import {readCart, writeCart, putItem} from './cart-store.js';
import {icon} from './icons.js';
import {imageReady} from './loading-ui.js';

// As novidades (SOON, products.js) entram no fim da coleção: foto, nome, selo "Em breve" e "Ver encaixado", sem preço nem carrinho.
const entries = [...Object.entries(PRODUCTS), ...Object.entries(SOON)].map(([id, product]) => ({id, product}));
const cardArt = Object.freeze({
  borboletoscopio: 'card-borboletoscopio.webp',
  dinossauroscopio: 'card-dinossauroscopio.webp',
  aviaoscopia: 'card-aviaoscopia.webp',
  macacoscopio: 'card-macacoscopio.webp',
  girafoscopio: 'card-girafoscopio.webp',
  unicornioscopio: 'card-unicornioscopio.webp'
});
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const productHref = id => `${document.body.classList.contains('products-page') ? 'index.html' : ''}#produto/${id}`;
// "Ver encaixado": a vitrine vai para a peça e abre a demonstração (carousel.js, #produto/<peça>/encaixe).
const demoHref = id => `${productHref(id)}/encaixe`;

const category = key => PRODUCT_CATEGORIES[key] || {label:key};
const offsetFrom = (index, active, length) => {
  let offset = (index - active) % length;
  if (offset > length / 2) offset -= length;
  if (offset < -length / 2) offset += length;
  return offset;
};
// As cores próprias de cada peça (as três paradas do degradê do banner, o destaque e o texto). Só o card do centro as
// usa; os laterais ficam no tom da página (carousel.css), e a cor desliza quando o card passa a ser o do centro.
const railTone = id => {
  const {theme} = showcase(id), [one, two, three] = theme.bannerStops.match(/#[0-9a-f]{3,8}/gi);
  return `--rail-own-1:${one};--rail-own-2:${two};--rail-own-3:${three};--rail-own-accent:${theme.accentColor};--rail-own-ink:${theme.textColor}`;
};
function colorsFor(id, product) { if (fixedColors(id)) return product.colors; const selection = defaults(id); return product.parts.map(part => color(selection[part.id])); }
function soonCard({id, product}) {
  const categoryLabel = category(product.category).label, href = demoHref(id);
  return `<article class="product-rail-card is-soon" data-product-id="${id}" tabindex="-1" style="${railTone(id)}"><a class="product-rail-art" href="${href}" aria-label="Ver o ${product.title} encaixado"><img src="assets/card-preview-${id}.webp" data-full-src="assets/card-${id}.webp" alt="${product.title}" width="768" height="768" loading="lazy" decoding="async"></a><div class="product-rail-copy"><p class="product-rail-category">${categoryLabel}</p><h3><a href="${href}">${product.title}</a></h3><p class="product-rail-subtitle">${product.subtitle}</p><div class="product-rail-active-details" aria-hidden="true"><div><span>Categoria</span><strong>${categoryLabel}</strong></div><div><span>Cores</span><span class="product-swatches">${product.colors.map(item => `<i style="--swatch:${item.hex}" title="${item.name}"></i>`).join('')}</span></div></div><div class="product-rail-bottom"><span class="product-soon">Em breve</span></div><div class="product-rail-actions is-single"><a class="product-customize product-see-fit" href="${href}">${icon('play')}<span>Ver encaixado</span></a><a class="product-see-3d" href="${productHref(id)}/3d">${icon('cube')}<span>Ver em 3D</span></a></div></div></article>`;
}
function productCard({id, product}) {
  if (product.soon) return soonCard({id, product});
  const colors = colorsFor(id, product), categoryLabel = category(product.category).label, fixed = fixedColors(id);
  const fullArt = cardArt[id] || product.catalogImage || product.image;
  const previewArt = cardArt[id] ? `card-preview-${id}.webp` : fullArt;
  return `<article class="product-rail-card" data-product-id="${id}" tabindex="-1" style="${railTone(id)}"><a class="product-rail-art" href="${productHref(id)}" aria-label="${fixed ? 'Ver' : 'Personalizar'} ${product.title}"><img src="assets/${previewArt}" data-full-src="assets/${fullArt}" alt="${product.title} nas cores originais" width="768" height="768" loading="lazy" decoding="async"></a><div class="product-rail-copy"><p class="product-rail-category">${categoryLabel}</p><h3><a href="${productHref(id)}">${product.title}</a></h3><p class="product-rail-subtitle">${product.subtitle}</p><div class="product-rail-active-details" aria-hidden="true"><div><span>Categoria</span><strong>${categoryLabel}</strong></div><div><span>Cores</span><span class="product-swatches">${colors.map(item => `<i style="--swatch:${item.hex}" title="${item.name}"></i>`).join('')}</span></div></div><div class="product-rail-bottom"><strong>${money(COMMERCE.prices[id])}</strong><span class="product-rail-price-note" role="status"></span><span class="product-rail-pix">${money(pixPrice(COMMERCE.prices[id]))} no Pix</span></div><div class="product-rail-actions">${fixed ? `<a class="product-customize" href="${productHref(id)}">Ver e comprar</a>` : `<a class="product-customize" href="${productHref(id)}/personalizar">Personalizar o meu</a>`}<button type="button" class="product-cart" data-add-product="${id}" aria-label="Adicionar ${product.title} ao carrinho${fixed ? '' : ' nas cores originais'}" title="${fixed ? 'Adicionar ao carrinho' : 'Adicionar nas cores originais'}">${icon('cart')}</button></div></div></article>`;
}
function emptyState(key) { const meta = category(key); return `<div class="catalog-empty"><p class="eyebrow">EM BREVE</p><h3>${meta.emptyMessage || 'Esta coleção está sendo preparada.'}</h3><p>Ela vai ganhar forma com o mesmo cuidado e imaginação da coleção atual.</p></div>`; }

// A peça em foco na home é uma só: a coleção e a vitrine do topo (carousel.js) se avisam por este evento e andam juntas.
// A coleção começa onde a vitrine começa: na peça do endereço (#produto/<peça>) ou na última vista (journey.js), não na primeira.
const FOCUS = 'ju:product-focus';
function startAt(items) {
  const raw = location.hash.startsWith('#produto/') ? location.hash.slice(9).split('/')[0] : '';
  return [ALIASES[raw] || raw, window.juTheme?.product()].map(id => items.findIndex(item => item.id === id)).find(index => index >= 0) ?? 0;
}

class ProductCarousel {
  constructor(host, items) {
    this.host = host; this.items = items; this.active = startAt(items); this.gesture = null; this.wheelLock = false;
    const initialCards = [...host.querySelectorAll('.product-rail-card')];
    const preRendered = host.dataset.preRendered === 'true' && initialCards.length === items.length &&
      initialCards.every((card, index) => card.dataset.productId === items[index].id &&
        card.dataset.productTitle === items[index].product.title &&
        card.dataset.productSubtitle === items[index].product.subtitle &&
        Number(card.dataset.priceCents) === COMMERCE.prices[items[index].id]);
    if (!preRendered) host.innerHTML = `<div class="product-carousel-stage" tabindex="0" role="region" aria-roledescription="carrossel" aria-label="${host.getAttribute('aria-label') || 'Produtos'}"><div class="product-carousel-track"></div><button class="product-carousel-arrow product-carousel-prev" type="button" aria-label="Ver produto anterior">${icon('arrow')}</button><button class="product-carousel-arrow product-carousel-next" type="button" aria-label="Ver próximo produto">${icon('arrow')}</button></div><div class="product-carousel-dots" role="tablist" aria-label="Escolher produto"></div><p class="sr-only" aria-live="polite" aria-atomic="true"></p>`;
    this.stage = host.querySelector('.product-carousel-stage'); this.track = host.querySelector('.product-carousel-track'); this.dots = host.querySelector('.product-carousel-dots'); this.live = host.querySelector('[aria-live]');
    if (!preRendered) this.track.innerHTML = items.map(productCard).join('');
    this.cards = [...this.track.children];
    this.cards.forEach(card => {
      const img = card.querySelector('img');
      // Keep the small artwork visible until the sharper version is decoded.
      const begin = async () => {
        img.loading = 'eager';
        let ok = await imageReady(img);
        if (!ok && img.dataset.fullSrc) {
          img.src = img.dataset.fullSrc;
          ok = await imageReady(img);
        }
        if (!ok) {
          img.hidden = true;
          img.parentElement.insertAdjacentHTML('beforeend', '<span class="image-unavailable">Imagem indisponível</span>');
          return;
        }
        if (!img.dataset.fullSrc || img.src.endsWith(img.dataset.fullSrc)) return;
        const sharp = new Image();
        sharp.decoding = 'async';
        sharp.src = img.dataset.fullSrc;
        if (await imageReady(sharp) && img.isConnected) img.src = sharp.src;
      };
      if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver(entries => {if(entries.some(entry => entry.isIntersecting)){observer.disconnect();begin();}}, {rootMargin:'240px'});
        observer.observe(card);
      } else begin();
    });
    if (!preRendered) this.dots.innerHTML = items.map(({product}, index) => `<button type="button" role="tab" aria-label="Mostrar ${product.title}" aria-selected="${index === 0}" data-dot="${index}"><span class="sr-only">${product.title}</span></button>`).join('');
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
  goTo(index) { if (index === this.active) return; this.active = index; this.render(true); dispatchEvent(new CustomEvent(FOCUS, {detail: {product: this.items[index].id, source: 'collection'}})); }
  // A vitrine mudou de peça: a coleção vai junto, sem anunciar (quem anuncia é a vitrine) e sem avisar de volta.
  follow(id) { const index = this.items.findIndex(item => item.id === id); if (index < 0 || index === this.active) return; this.active = index; this.render(false); }
  render(announce) {
    this.cards.forEach((card, index) => { const position = offsetFrom(index, this.active, this.items.length); card.style.setProperty('--slot', position); card.classList.toggle('is-active', position === 0); card.classList.toggle('is-side', Math.abs(position) === 1); card.classList.toggle('is-far', Math.abs(position) > 1); card.tabIndex = position === 0 ? 0 : -1; card.querySelector('.product-rail-active-details').setAttribute('aria-hidden', String(position !== 0)); });
    [...this.dots.children].forEach((dot, index) => dot.setAttribute('aria-selected', String(index === this.active)));
    if (announce) this.live.textContent = `${this.items[this.active].product.title}, ${this.active + 1} de ${this.items.length}.`;
  }
}
const rails = new Map();   // uma coleção por host; trocar de categoria troca a do host
function mountCarousel(host, key = host.dataset.category) { const list = entries.filter(({product}) => product.category === key); if (!list.length) { host.innerHTML = emptyState(key); rails.delete(host); return; } rails.set(host, new ProductCarousel(host, list)); }
for (const host of document.querySelectorAll('[data-product-carousel]')) mountCarousel(host);
window.addEventListener(FOCUS, event => { if (event.detail?.source !== 'collection') for (const rail of rails.values()) rail.follow(event.detail?.product); });
// Produtos page: a grid with every piece side by side (audit B2); produtos.html already carries the same markup.
// Aberta por um banner da página Escolha o seu (produtos.html?encaixe=<família>): só as peças daquele encaixe, com um selo
// para voltar a ver todas e o caminho para os outros encaixes. Trocar de categoria volta à página inteira.
const fitFamily = (() => { try { const id = new URLSearchParams(location.search).get('encaixe'); return Object.hasOwn(FAMILIES, id) ? id : null; } catch { return null; } })();
function familyBar(grid, id) {
  grid.parentElement.querySelector('.catalog-family')?.remove();
  if (!id) return;
  const bar = document.createElement('div');
  bar.className = 'catalog-family';
  bar.innerHTML = `<p class="catalog-family-chip"><span>${FAMILIES[id].label}</span><a href="produtos.html" aria-label="Ver todas as peças"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg></a></p><a class="catalog-family-other" href="escolha.html"><span>Outros encaixes</span>${icon('arrow')}</a>`;
  grid.before(bar);
}
for (const host of document.querySelectorAll('[data-product-grid]')) { const html = productGrid(host.dataset.category, fitFamily); if (host.innerHTML.trim() !== html) host.innerHTML = html; familyBar(host, fitFamily); }
for (const tabs of document.querySelectorAll('[data-catalog-tabs]')) {
  const categories = Object.entries(PRODUCT_CATEGORIES);
  const initialTabs = [...tabs.querySelectorAll('[data-catalog-filter]')];
  if (initialTabs.length !== categories.length || initialTabs.some((tab, index) => tab.dataset.catalogFilter !== categories[index][0]))
    tabs.innerHTML = categories.map(([key, meta], index) => `<button type="button" role="tab" aria-selected="${index === 0}" data-catalog-filter="${key}">${meta.label}${!entries.some(({product}) => product.category === key) ? ' <span>em breve</span>' : ''}</button>`).join('');
  tabs.addEventListener('click', event => { const button = event.target.closest('[data-catalog-filter]'); if (!button) return; tabs.querySelectorAll('[data-catalog-filter]').forEach(tab => tab.setAttribute('aria-selected', String(tab === button))); const host = tabs.parentElement.querySelector('[data-product-carousel], [data-product-grid]'); host.dataset.category = button.dataset.catalogFilter; if (host.matches('[data-product-grid]')) { host.innerHTML = productGrid(button.dataset.catalogFilter); familyBar(host, null); if (location.search) history.replaceState(history.state, '', location.pathname + location.hash); } else mountCarousel(host, button.dataset.catalogFilter); });
}
document.addEventListener('click', async event => { const button = event.target.closest('[data-add-product]'); if (!button || button.disabled) return; const id = button.dataset.addProduct; try { button.disabled = true; button.classList.add('is-loading'); const cart = writeCart(putItem(readCart(), id, defaults(id))); window.dispatchEvent(new Event('ju:cart')); await new Promise(done => setTimeout(done, reduceMotion() ? 0 : 600)); openMiniCart({itemId: addedItemId(cart, id, defaults(id)), original: true}); button.disabled = false; button.classList.remove('is-loading'); } catch (error) { button.disabled = false; button.classList.remove('is-loading'); const notice = button.closest('[data-product-id]')?.querySelector('.product-rail-price-note, .product-grid-note'); if (notice) notice.textContent = error.message; } });

window.addEventListener('pageshow', () => document.querySelectorAll('[data-add-product]').forEach(button => {button.disabled = false; button.classList.remove('is-loading');}));
