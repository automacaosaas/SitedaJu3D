import {openMiniCart, addedItemId} from './mini-cart.js';
import {productGrid} from './product-grid.js';
import {PRODUCTS, SOON, PRODUCT_CATEGORIES, FAMILIES, ALIASES, color, defaults, showcase, fixedColors} from './products.js';
import {COMMERCE, money, pixPrice} from './commerce-config.js';
import {readCart, writeCart, putItem} from './cart-store.js';
import {icon} from './icons.js';
import {imageReady} from './loading-ui.js';
import {journeyColors, withAlpha} from './hero-motion.js';

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
// The card photo comes in two sizes (card-preview-<id> 384 px, card-<id> 768 px) and the browser picks one: the picture shows at
// most 212 px tall in the card (catalog.css --art-h), so a 1x computer takes the 384 and phones and 2x screens the 768 — one
// file per card, not the preview and then the sharp one (PageSpeed, 2026-10-08).
const CARD_SIZES = '212px';
const cardSources = (preview, full) => preview === full ? `src="assets/${full}"` : `src="assets/${full}" srcset="assets/${preview} 384w, assets/${full} 768w" sizes="${CARD_SIZES}"`;
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
// A primeira linha da ficha do card diz em que aparelho a peça encaixa (FAMILIES): a categoria já está no sobretítulo, logo acima.
// Sem família (uma categoria nova), volta a ser a categoria.
const specRow = (id, categoryLabel) => { const tool = Object.values(FAMILIES).find(family => family.items.includes(id))?.tool; return tool ? `<div><span>Encaixe</span><strong>${tool}</strong></div>` : `<div><span>Categoria</span><strong>${categoryLabel}</strong></div>`; };
function colorsFor(id, product) { if (fixedColors(id)) return product.colors; const selection = defaults(id); return product.parts.map(part => color(selection[part.id])); }
function soonCard({id, product}) {
  const categoryLabel = category(product.category).label, href = demoHref(id);
  return `<article class="product-rail-card is-soon" data-product-id="${id}" tabindex="-1" style="${railTone(id)}"><a class="product-rail-art" href="${href}" aria-label="Ver o ${product.title} encaixado"><img ${cardSources(`card-preview-${id}.webp`, `card-${id}.webp`)} alt="${product.title}" width="768" height="768" loading="lazy" decoding="async"></a><div class="product-rail-copy"><p class="product-rail-category">${categoryLabel}</p><h3><a href="${href}">${product.title}</a></h3><p class="product-rail-subtitle">${product.subtitle}</p><div class="product-rail-active-details" aria-hidden="true">${specRow(id, categoryLabel)}<div><span>Cores</span><span class="product-swatches">${product.colors.map(item => `<i style="--swatch:${item.hex}" title="${item.name}"></i>`).join('')}</span></div></div><div class="product-rail-bottom"><span class="product-soon">Em breve</span></div><div class="product-rail-actions is-single"><a class="product-customize product-see-fit" href="${href}">${icon('play')}<span>Ver encaixado</span></a><a class="product-see-3d" href="${productHref(id)}/3d">${icon('cube')}<span>Ver em 3D</span></a></div></div></article>`;
}
function productCard({id, product}) {
  if (product.soon) return soonCard({id, product});
  const colors = colorsFor(id, product), categoryLabel = category(product.category).label, fixed = fixedColors(id);
  const fullArt = cardArt[id] || product.catalogImage || product.image;
  const previewArt = cardArt[id] ? `card-preview-${id}.webp` : fullArt;
  return `<article class="product-rail-card" data-product-id="${id}" tabindex="-1" style="${railTone(id)}"><a class="product-rail-art" href="${productHref(id)}" aria-label="${fixed ? 'Ver' : 'Personalizar'} ${product.title}"><img ${cardSources(previewArt, fullArt)} alt="${product.title} nas cores originais" width="768" height="768" loading="lazy" decoding="async"></a><div class="product-rail-copy"><p class="product-rail-category">${categoryLabel}</p><h3><a href="${productHref(id)}">${product.title}</a></h3><p class="product-rail-subtitle">${product.subtitle}</p><div class="product-rail-active-details" aria-hidden="true">${specRow(id, categoryLabel)}<div><span>Cores</span><span class="product-swatches">${colors.map(item => `<i style="--swatch:${item.hex}" title="${item.name}"></i>`).join('')}</span></div></div><div class="product-rail-bottom"><strong>${money(COMMERCE.prices[id])}</strong><span class="product-rail-price-note" role="status"></span><span class="product-rail-pix">${money(pixPrice(COMMERCE.prices[id]))} no Pix</span></div><div class="product-rail-actions">${fixed ? `<a class="product-customize" href="${productHref(id)}">Ver e comprar</a>` : `<a class="product-customize" href="${productHref(id)}/personalizar">Personalizar o meu</a>`}<button type="button" class="product-cart" data-add-product="${id}" aria-label="Adicionar ${product.title} ao carrinho${fixed ? '' : ' nas cores originais'}" title="${fixed ? 'Adicionar ao carrinho' : 'Adicionar nas cores originais'}">${icon('cart')}</button></div></div></article>`;
}
function emptyState(key) { const meta = category(key); return `<div class="catalog-empty"><p class="eyebrow">EM BREVE</p><h3>${meta.emptyMessage || 'Esta coleção está sendo preparada.'}</h3><p>Ela vai ganhar forma com o mesmo cuidado e imaginação da coleção atual.</p></div>`; }

// A vitrine do topo (carousel.js) avisa por este evento quando muda de peça, e a coleção vai junto. O contrário não (07/10/2026, pedido
// da dona: "ao mudar essa sessão dos produtos, não mudar a vitrine; mudar apenas o visual dos cards, conforme cada produto vai
// passando"): mexer aqui muda só a seção, que veste as cores do card do centro (paintTheme, carousel.css .catalog-home[data-themed]).
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
    if (!preRendered) host.innerHTML = `<div class="product-carousel-stage" tabindex="0" role="region" aria-roledescription="carrossel" aria-label="${host.getAttribute('aria-label') || 'Produtos'}"><div class="product-carousel-track"></div><button class="product-carousel-arrow product-carousel-prev" type="button" aria-label="Ver produto anterior">${icon('arrow')}</button><button class="product-carousel-arrow product-carousel-next" type="button" aria-label="Ver próximo produto">${icon('arrow')}</button></div><div class="product-carousel-dots" role="group" aria-label="Escolher produto"></div><p class="sr-only" aria-live="polite" aria-atomic="true"></p>`;
    this.stage = host.querySelector('.product-carousel-stage'); this.track = host.querySelector('.product-carousel-track'); this.dots = host.querySelector('.product-carousel-dots'); this.live = host.querySelector('[aria-live]');
    if (!preRendered) this.track.innerHTML = items.map(productCard).join('');
    this.cards = [...this.track.children];
    this.cards.forEach(card => {
      const img = card.querySelector('img');
      // Near the screen, the photo is asked for (srcset: the size this screen needs, cardSources); one that fails says so.
      const begin = async () => {
        img.loading = 'eager';
        if (await imageReady(img)) return;
        img.hidden = true;
        img.parentElement.insertAdjacentHTML('beforeend', '<span class="image-unavailable">Imagem indisponível</span>');
      };
      if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver(entries => {if(entries.some(entry => entry.isIntersecting)){observer.disconnect();begin();}}, {rootMargin:'240px'});
        observer.observe(card);
      } else begin();
    });
    if (!preRendered) this.dots.innerHTML = items.map(({product}, index) => `<button type="button" aria-label="Mostrar ${product.title}" data-dot="${index}"><span class="sr-only">${product.title}</span></button>`).join('');
    this.bind(); this.render(false);
  }
  bind() {
    if ('IntersectionObserver' in window) new IntersectionObserver(([entry]) => { this.visible = entry.isIntersecting; }).observe(this.stage);
    this.host.querySelector('.product-carousel-prev').addEventListener('click', () => this.move(-1));
    this.host.querySelector('.product-carousel-next').addEventListener('click', () => this.move(1));
    this.dots.addEventListener('click', event => { const button = event.target.closest('[data-dot]'); if (button) this.goTo(Number(button.dataset.dot)); });
    // Suppress the click before it reaches a link, arrow or the document cart handler.
    this.stage.addEventListener('click', event => { if (this.suppressClick) { event.preventDefault(); event.stopPropagation(); this.suppressClick = false; } }, true);
    this.track.addEventListener('dragstart', event => event.preventDefault());
    this.track.addEventListener('click', event => { const card = event.target.closest('[data-product-id]'); if (!card || event.target.closest('[data-add-product]')) return; const index = this.cards.indexOf(card); if (index !== this.active) { event.preventDefault(); this.goTo(index); } });
    this.stage.addEventListener('keydown', event => { if (event.key === 'ArrowLeft') { event.preventDefault(); this.move(-1); } if (event.key === 'ArrowRight') { event.preventDefault(); this.move(1); } });
    this.stage.addEventListener('wheel', event => { if (Math.abs(event.deltaX) < Math.abs(event.deltaY) || Math.abs(event.deltaX) < 12 || this.wheelLock) return; event.preventDefault(); this.wheelLock = true; this.move(event.deltaX > 0 ? 1 : -1); setTimeout(() => { this.wheelLock = false; }, reduceMotion() ? 0 : 360); }, {passive:false});
    // Arrastar (dedo ou mouse): os cards andam junto com o dedo, 1:1, sem transição; ao soltar, troca se passou de 46 px ou se o
    // gesto foi rápido (velocidade dos últimos movimentos), e anda dois cards num arraste longo.
    this.stage.addEventListener('pointerdown', event => { if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return; this.suppressClick = false; this.gesture = {id:event.pointerId, x:event.clientX, y:event.clientY, moved:false, lx:event.clientX, lt:event.timeStamp, v:0}; });
    this.stage.addEventListener('pointermove', event => {
      const gesture = this.gesture;
      if (!gesture || event.pointerId !== gesture.id) return;
      const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
      if (!gesture.moved) {
        if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
        gesture.moved = true; this.stage.setPointerCapture?.(event.pointerId); this.placeFar(); this.track.classList.add('is-dragging');
      }
      const dt = event.timeStamp - gesture.lt;
      if (dt > 0) gesture.v = .8 * (event.clientX - gesture.lx) / dt + .2 * gesture.v;
      gesture.lx = event.clientX; gesture.lt = event.timeStamp;
      this.track.style.setProperty('--drag', `${dx}px`);
      if (event.cancelable) event.preventDefault();
    });
    const end = event => {
      const gesture = this.gesture;
      if (!gesture || event.pointerId !== gesture.id) return;
      const dx = event.clientX - gesture.x, moved = gesture.moved, v = event.timeStamp - gesture.lt > 100 ? 0 : gesture.v;
      this.gesture = null; this.track.classList.remove('is-dragging'); this.track.style.removeProperty('--drag');
      if (this.stage.hasPointerCapture?.(event.pointerId)) this.stage.releasePointerCapture(event.pointerId);
      if (moved) {
        this.suppressClick = true;
        const flick = Math.abs(v) > .35, along = !flick || Math.sign(v) === Math.sign(dx);   // um tranco de volta cancela
        if (event.type === 'pointerup' && along && (Math.abs(dx) > 46 || (flick && Math.abs(dx) > 12))) {
          const steps = this.slotPx && Math.abs(dx) > this.slotPx * 1.5 ? 2 : 1;
          this.move(dx < 0 ? steps : -steps);
        }
      }
    };
    this.stage.addEventListener('pointerup', end); this.stage.addEventListener('pointercancel', end);
    this.stage.addEventListener('lostpointercapture', event => { if (event.target === this.stage) end(event); });
    this.stage.addEventListener('pointerleave', event => { if (!this.gesture?.moved) end(event); });
  }
  move(direction) { const length = this.items.length, index = ((this.active + direction) % length + length) % length; if (index === this.active) return; this.shift = direction; this.goTo(index); }
  // Só a coleção anda (a vitrine fica onde está).
  goTo(index) { if (index === this.active) return; this.active = index; this.render(true); }
  // A vitrine mudou de peça: a coleção vai junto, sem anunciar (quem anuncia é a vitrine). Com a seção fora da tela, de uma vez:
  // cards e cores trocam sem transição (nada fica animando longe dos olhos).
  follow(id) { const index = this.items.findIndex(item => item.id === id); if (index < 0 || index === this.active) return; this.active = index; this.quiet = !this.onScreen(); this.render(false); this.quiet = false; }
  // Na tela ou não, pelo IntersectionObserver (bind): medir aqui, no fim de cada passagem da vitrine e logo depois de ela pintar o
  // banner com a cor nova, obrigava o navegador a recalcular o estilo da página inteira no meio do script (até 430 ms com a CPU 4x
  // mais lenta, 08/10/2026). A medida direta fica só para antes da primeira resposta do observador.
  onScreen() { if (typeof this.visible === 'boolean') return this.visible; const box = this.stage.getBoundingClientRect?.(); return !!box && box.bottom > 0 && box.top < innerHeight; }
  // Cada card guarda onde está desenhado (this.slots) e anda o mesmo tanto que a coleção. O que dá a volta não atravessa o palco: se
  // vai ficar escondido, fica do lado por onde saiu; se vai aparecer, entra pela borda certa. Os de longe ficam inertes (fora do Tab).
  render(announce) {
    const length = this.items.length, shift = this.slots ? this.shift ?? offsetFrom(this.active, this.shown, length) : 0, instant = !this.slots || this.quiet || reduceMotion();
    const slots = this.slots || [], entering = [];
    this.cards.forEach((card, index) => {
      const position = offsetFrom(index, this.active, length), expected = (slots[index] ?? position) - shift;
      let slot = position;
      if (!instant && expected !== position) { if (Math.abs(position) > 1) slot = expected; else entering.push([card, position + shift]); }
      slots[index] = slot; card.style.setProperty('--slot', slot);
      card.classList.toggle('is-active', position === 0); card.classList.toggle('is-side', Math.abs(position) === 1); card.classList.toggle('is-far', Math.abs(position) > 1);
      // os de longe ficam inertes; os vizinhos se clicam (vêm para o centro), mas no Tab só entra o do centro (as setas e os pontinhos levam aos outros)
      card.inert = Math.abs(position) > 1; card.tabIndex = -1;
      for (const control of card.querySelectorAll('a, button')) { if (position === 0) control.removeAttribute('tabindex'); else control.tabIndex = -1; }
      card.querySelector('.product-rail-active-details').setAttribute('aria-hidden', String(position !== 0));
    });
    if (entering.length) {
      for (const [card, from] of entering) { card.classList.add('is-placing'); card.style.setProperty('--slot', from); }
      void this.track.offsetWidth;
      for (const [card] of entering) { card.classList.remove('is-placing'); card.style.setProperty('--slot', slots[this.cards.indexOf(card)]); }
    }
    if (instant && this.slots) { this.track.classList.add('is-instant'); requestAnimationFrame(() => requestAnimationFrame(() => this.track.classList.remove('is-instant'))); }
    this.slots = slots; this.shown = this.active; this.shift = undefined;
    [...this.dots.children].forEach((dot, index) => { if (index === this.active) dot.setAttribute('aria-current', 'true'); else dot.removeAttribute('aria-current'); });
    if (announce) this.live.textContent = `${this.items[this.active].product.title}, ${this.active + 1} de ${this.items.length}.`;
    this.paintTheme();
  }
  // No começo de um arraste, os cards escondidos vão (sem transição) para o lugar de verdade, dos dois lados, e aparecem conforme o
  // dedo puxa; a distância entre dois cards (slotPx) decide se um arraste longo anda dois.
  placeFar() {
    if (!this.cards || !this.slots) return;
    const moved = this.cards.filter((card, index) => { const position = offsetFrom(index, this.active, this.items.length); if (Math.abs(position) <= 1 || this.slots[index] === position) return false; this.slots[index] = position; card.classList.add('is-placing'); card.style.setProperty('--slot', position); return true; });
    const active = this.cards[this.active].getBoundingClientRect(), side = this.cards.find(card => card.classList.contains('is-side'))?.getBoundingClientRect();
    if (side) this.slotPx = Math.abs(side.left + side.width / 2 - active.left - active.width / 2);
    for (const card of moved) card.classList.remove('is-placing');
  }
  // A seção da home (.catalog-home) veste as cores da peça do card do centro: título, apoio, pontinhos, botões e o tom dos cards dos
  // lados. As cores (--cat-*) são propriedades registradas em carousel.css: deslizam em .6s quando o card do centro muda.
  paintTheme() {
    const section = this.host.closest?.('.catalog-home');
    if (!section) return;
    const colors = journeyColors(showcase(this.items[this.active].id).theme), accent = colors['--theme-accent'];
    const vars = {'--cat-text': colors['--theme-text'], '--cat-muted': colors['--theme-muted'], '--cat-accent': accent, '--cat-accent-strong': colors['--theme-accent-strong'], '--cat-soft': colors['--theme-soft'], '--cat-wash': colors['--theme-wash'], '--cat-glow': withAlpha(accent, .32)};
    for (const name in vars) section.style.setProperty(name, vars[name]);
    // a primeira pintura entra parada (e a que segue a vitrine com a seção fora da tela); dali em diante, as cores deslizam
    if (!section.dataset.themed || this.quiet) { section.dataset.themed = 'still'; requestAnimationFrame(() => requestAnimationFrame(() => { section.dataset.themed = 'live'; })); }
  }
}
const rails = new Map();   // uma coleção por host; trocar de categoria troca a do host
function mountCarousel(host, key = host.dataset.category) { const list = entries.filter(({product}) => product.category === key); if (!list.length) { host.innerHTML = emptyState(key); rails.delete(host); return; } rails.set(host, new ProductCarousel(host, list)); }
for (const host of document.querySelectorAll('[data-product-carousel]')) mountCarousel(host);
window.addEventListener(FOCUS, event => { if (event.detail?.source === 'showcase') for (const rail of rails.values()) rail.follow(event.detail?.product); });
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
