// "O 3D nas suas consultas" (home, logo depois do banner) e os banners da página Escolha o seu (escolha.html).
// Um capítulo por família de encaixe (FAMILIES, products.js): a peça já encaixada no equipamento, montada com as mesmas
// camadas da demonstração do banner (SHOWCASE.<peça>.demo), e uma ficha curta ao lado. Só marcação, sem acesso à página:
// tools/build-product-pages.cjs grava o mesmo HTML em index.html e escolha.html, e fit-tour-motion.js dá o movimento.
import {PRODUCTS, SOON, FAMILIES, showcase} from './products.js';
import {COMMERCE} from './commerce-config.js';
import {icon} from './icons.js';

const esc = value => String(value ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const piece = key => PRODUCTS[key] || SOON[key];
const chevron = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

// Ficha de cada peça: uma linha e três fatos curtos, só o que a loja já afirma (products.js e o prazo de produção).
// 'production' vira "Produção em <prazo>"; 'colors' mostra as cores fixas da novidade. `frame` posiciona a peça
// encaixada na figura (scale: lado do quadrado da demonstração ÷ largura da figura; y: topo do quadrado ÷ altura
// da figura); `fade` encurta o equipamento só aqui (frações da altura dele, como tool.fade).
export const FIT = {
  borboletoscopio: {line: 'Uma borboleta para levar cor e imaginação à consulta.', facts: ['Espaço do retinoscópio livre', 'Cores à sua escolha', 'production'], frame: {scale: .85, y: .035}},
  dinossauroscopio: {line: 'Um dinossauro simpático para acompanhar cada olhar.', facts: ['Abertura para o retinoscópio', 'Cores à sua escolha', 'production'], frame: {scale: .84, y: .085}},
  aviaoscopia: {line: 'Um convite para a imaginação decolar: as aberturas lembram janelas de avião.', facts: ['16 aberturas com os graus ao lado', 'Metades presas por ímãs', 'Cores à sua escolha'], frame: {scale: .71, y: .07}},
  macacoscopio: {line: 'Um macaquinho para acompanhar o olhar dos pequenos.', facts: ['Capa para lâmpada de fenda portátil', 'colors', 'Impresso em 3D'], frame: {scale: .74, y: .2}, fade: [.33, .47]}
};

// Peças de uma família que a loja conhece hoje (as que ainda não chegaram ficam de fora) e as famílias com alguma peça.
export const familyItems = id => (FAMILIES[id]?.items || []).filter(key => piece(key) && showcase(key).demo);
export const families = () => Object.keys(FAMILIES).filter(id => familyItems(id).length);

// A peça encaixada: parede de trás, equipamento (com a mesma queda da demonstração), cabeça do equipamento (lâmpada),
// sombra da peça sobre o equipamento e a frente. Flutua sobre uma sombra no chão.
export function fitFigure(key, {lazy = true} = {}) {
  const product = piece(key), {tool, layers = {}, head, message} = showcase(key).demo, fit = FIT[key] || {};
  const frame = fit.frame || {scale: .8, y: .1}, fade = fit.fade || tool.fade, front = layers.front || product.catalogImage || product.image;
  const img = (className, src, alt = '') => `<img${className ? ` class="${className}"` : ''} src="assets/${esc(src)}" alt="${esc(alt)}"${lazy ? ' loading="lazy"' : ''} decoding="async" draggable="false">`;
  const vars = [`--fit-scale:${frame.scale}`, `--fit-y:${frame.y}`, `--tool-w:${tool.width}`, `--tool-top:${tool.top}`, `--tool-ratio:${tool.ratio}`,
    `--fade-a:${fade[0]}`, `--fade-b:${fade[1]}`, `--tool-src:url(assets/${tool.src})`, ...(head ? [`--head-w:${head.width}`, `--head-top:${head.top}`, `--head-ratio:${head.ratio}`] : [])].join(';');
  return `<div class="fit-figure" style="${vars}"><i class="fit-ground" aria-hidden="true"></i><div class="fit-float"><div class="fit-art">`
    + (layers.back ? img('fit-back', layers.back) : '')
    + `<div class="fit-tool">${img('', tool.src)}</div>`
    + (head ? `<div class="fit-head">${img('', head.src)}</div>` : '')
    + img('fit-shade', front) + img('fit-cover', front, message || product.title)
    + '</div></div></div>';
}

const tone = key => { const {theme} = showcase(key); return `--fit-stops:${theme.bannerStops};--fit-accent:${theme.accentColor};--fit-ink:${theme.textColor}`; };

function fact(key, text) {
  if (text === 'production') return `<li>${icon('check')}<span>Produção em ${esc(COMMERCE.productionLabel)}</span></li>`;
  if (text === 'colors') {
    const colors = piece(key).colors || [];
    return `<li>${icon('check')}<span class="sr-only">Cores fixas: ${esc(colors.map(c => c.name).join(', '))}.</span><span aria-hidden="true">Cores fixas</span>`
      + `<span class="fit-swatches" aria-hidden="true">${colors.map(c => `<i style="--swatch:${c.hex}"></i>`).join('')}</span></li>`;
  }
  return `<li>${icon('check')}<span>${esc(text)}</span></li>`;
}

function copy(key, active) {
  const product = piece(key), fit = FIT[key] || {};
  return `<div class="fit-copy${active ? ' is-active' : ''}" data-item="${key}"${active ? '' : ' hidden'}>`
    + `<h3>${esc(product.title)}${product.soon ? '<span class="fit-soon">Em breve</span>' : ''}</h3>`
    + `<p class="fit-line">${esc(fit.line || product.description)}</p>`
    + `<ul class="fit-facts">${(fit.facts || []).map(text => fact(key, text)).join('')}</ul>`
    + `<a class="fit-link" href="#produto/${key}/encaixe">${icon('play')}<span>Ver encaixado</span><span class="sr-only"> ${esc(product.title)}</span></a></div>`;
}

function chapter(id, number) {
  const family = FAMILIES[id], items = familyItems(id), many = items.length > 1;
  const slides = items.map((key, i) => `<div class="fit-slide${i ? '' : ' is-active'}" data-item="${key}" style="${tone(key)}"${i ? ' hidden' : ''}><i class="fit-wash" aria-hidden="true"></i>${fitFigure(key)}</div>`).join('');
  const controls = many ? `<button type="button" class="fit-arrow fit-prev" aria-label="Produto anterior">${chevron('m15 5-7 7 7 7')}</button>`
    + `<button type="button" class="fit-arrow fit-next" aria-label="Próximo produto">${chevron('m9 5 7 7-7 7')}</button>`
    + `<div class="fit-dots" role="group" aria-label="Peças">${items.map((key, i) => `<button type="button" data-item="${key}" aria-label="${esc(piece(key).title)}" aria-pressed="${!i}"><i></i></button>`).join('')}</div>` : '';
  return `<article class="fit-chapter" data-family="${id}" aria-labelledby="fit-family-${id}" style="${tone(items[0])}">`
    + `<div class="fit-stage"${many ? ` role="group" aria-roledescription="carrossel" aria-label="${esc(family.label)}"` : ''}><div class="fit-slides">${slides}</div>${controls}</div>`
    + `<div class="fit-sheet"><p class="fit-family" id="fit-family-${id}"><span class="fit-index" aria-hidden="true">${String(number).padStart(2, '0')}</span><span>${esc(family.label)}</span></p>`
    + items.map((key, i) => copy(key, !i)).join('') + '</div></article>';
}

// Conteúdo da seção da home (o <section data-fit-tour> fica em index.html).
export function fitTour() {
  return '<header class="fit-tour-head"><p class="eyebrow">FEITO PARA ENCAIXAR</p><h2 id="fit-tour-title">O 3D nas suas consultas</h2>'
    + '<p>Cada peça é pensada para um equipamento da consulta.</p></header>'
    + `<div class="fit-chapters">${families().map((id, i) => chapter(id, i + 1)).join('')}</div>`
    + `<p class="fit-tour-end"><a class="fit-choose" href="escolha.html"><span>Escolha o seu</span>${icon('arrow')}</a></p>`;
}

// Página Escolha o seu: um banner por família, que abre a página Produtos só com as peças daquele encaixe.
export function chooseBanners() {
  return families().map(id => {
    const family = FAMILIES[id], items = familyItems(id);
    return `<a class="choose-banner" href="produtos.html?encaixe=${id}" data-family="${id}" style="${tone(items[0])}"><i class="fit-wash" aria-hidden="true"></i>`
      + `<span class="choose-art" data-count="${Math.min(items.length, 2)}">${items.slice(0, 2).map(key => fitFigure(key, {lazy: false})).join('')}</span>`
      + `<span class="choose-copy"><span class="choose-kicker">Encaixe para</span><span class="choose-title">${esc(family.tool)}</span>`
      + `<span class="choose-pieces">${items.map(key => `<span>${esc(piece(key).title)}${piece(key).soon ? ' <em>Em breve</em>' : ''}</span>`).join('')}</span>`
      + `<span class="choose-cta"><span>Ver as peças</span>${icon('arrow')}</span></span></a>`;
  }).join('');
}
