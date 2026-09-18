import {PRODUCTS} from './products.js';
import {COMMERCE, money} from './commerce-config.js';
import {icon} from './icons.js';
const grid = document.querySelector('.catalog-grid');
grid.innerHTML = Object.entries(PRODUCTS).map(([id,p]) => `<article class="catalog-card"><a class="catalog-art" href="#produto/${id}" aria-label="Conhecer ${p.title}"><img src="assets/${p.image}" alt="${p.title} nas cores originais" width="400" height="400" loading="lazy"></a><div class="catalog-copy"><h3>${p.title}</h3><p>${p.subtitle}</p><div class="catalog-bottom"><strong>${money(COMMERCE.prices[id])}</strong><a href="#produto/${id}">Escolher minhas cores ${icon('arrow')}</a></div></div></article>`).join('');
