// The Produtos page as a grid (audit B2): every piece sharp and side by side, 3 columns on a computer and 2 on a phone,
// instead of the carousel that dims all but one. Each card links to the product's own page (borboletoscopio.html…), shows
// the original colors, the price and the Pix price, "Feito sob encomenda · 3 a 5 dias úteis" (audit B5) and the actions.
// No page access here: catalog.js draws it in the browser and tools/build-product-pages.cjs writes the same markup into
// produtos.html (no-JS visitors and search engines see the products too).
import {PRODUCTS, SOON, PRODUCT_CATEGORIES, color, defaults} from './products.js';
import {COMMERCE, money, pixPrice} from './commerce-config.js';
import {icon} from './icons.js';

const category = key => PRODUCT_CATEGORIES[key] || {label: key};

export function productGridCard(id) {
  const product = PRODUCTS[id], price = COMMERCE.prices[id], selection = defaults(id);
  const colors = product.parts.map(part => color(selection[part.id]));
  return `<article class="product-grid-card" data-product-id="${id}">`
    + `<div class="product-grid-art"><a href="${id}.html" tabindex="-1" aria-hidden="true"><img src="assets/card-${id}.webp" alt="" width="768" height="768" loading="lazy" decoding="async"></a>`
    + `<button type="button" class="product-cart" data-add-product="${id}" aria-label="Adicionar ${product.title} ao carrinho nas cores originais" title="Adicionar nas cores originais">${icon('cart')}</button></div>`
    + `<div class="product-grid-copy"><p class="product-grid-category">${category(product.category).label}</p>`
    + `<h2><a href="${id}.html">${product.title}</a></h2><p class="product-grid-sub">${product.subtitle}</p>`
    + `<p class="product-grid-colors"><span class="sr-only">Cores originais: ${colors.map(c => c.name).join(', ')}</span><span class="product-swatches" aria-hidden="true">${colors.map(c => `<i style="--swatch:${c.hex}" title="${c.name}"></i>`).join('')}</span></p>`
    + `<p class="product-grid-price"><strong>${money(price)}</strong><span class="product-grid-pix">${money(pixPrice(price))} no Pix</span></p>`
    + `<p class="product-grid-made">${icon('clock')}<span>Feito sob encomenda · ${COMMERCE.productionLabel}</span></p>`
    + `<a class="product-customize" href="index.html#produto/${id}/personalizar">Personalizar o meu</a></div></article>`;
}

// A novidade sem venda (SOON, products.js): foto, nome, selo "Em breve" e "Ver encaixado", que abre a demonstração no banner
// da vitrine (index.html#produto/<peça>/encaixe). Sem preço, carrinho, personalização nem página própria.
export function soonGridCard(id) {
  const product = SOON[id], href = `index.html#produto/${id}/encaixe`;
  return `<article class="product-grid-card is-soon" data-product-id="${id}">`
    + `<div class="product-grid-art"><a href="${href}" tabindex="-1" aria-hidden="true"><img src="assets/card-${id}.webp" alt="" width="768" height="768" loading="lazy" decoding="async"></a><span class="product-soon">Em breve</span></div>`
    + `<div class="product-grid-copy"><p class="product-grid-category">${category(product.category).label}</p>`
    + `<h2><a href="${href}">${product.title}</a></h2><p class="product-grid-sub">${product.subtitle}</p>`
    + `<p class="product-grid-colors"><span class="sr-only">Cores originais: ${product.colors.map(c => c.name).join(', ')}</span><span class="product-swatches" aria-hidden="true">${product.colors.map(c => `<i style="--swatch:${c.hex}" title="${c.name}"></i>`).join('')}</span></p>`
    + `<p class="product-grid-soon-note">Novidade · em breve</p>`
    + `<a class="product-customize product-see-fit" href="${href}">${icon('play')}<span>Ver encaixado</span></a><a class="product-see-3d" href="index.html#produto/${id}/3d">${icon('cube')}<span>Ver em 3D</span></a></div></article>`;
}

export function productGrid(key) {
  const ids = Object.keys(PRODUCTS).filter(id => PRODUCTS[id].category === key), soon = Object.keys(SOON).filter(id => SOON[id].category === key);
  if (!ids.length && !soon.length) { const meta = category(key); return `<div class="catalog-empty"><p class="eyebrow">EM BREVE</p><h3>${meta.emptyMessage || 'Esta coleção está sendo preparada.'}</h3><p>Ela vai ganhar forma com o mesmo cuidado e imaginação da coleção atual.</p></div>`; }
  return ids.map(productGridCard).join('') + soon.map(soonGridCard).join('');
}
