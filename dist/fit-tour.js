// "O 3D nas suas consultas" (home, logo depois do banner) e os banners da página Escolha o seu (escolha.html).
// No estilo de uma ficha de produto: a peça já encaixada no equipamento fica fixa e flutuando à direita, sobre uma faixa
// que muda de cor a cada peça, enquanto a ficha técnica de cada uma aparece à esquerda com a rolagem, família por família
// (FAMILIES, products.js). No fim, um carrossel arrastável com as peças da categoria e "Escolha o seu".
// A peça encaixada usa as mesmas camadas da demonstração do banner (SHOWCASE.<peça>.demo). Só marcação, sem acesso à
// página: tools/build-product-pages.cjs grava o mesmo HTML em index.html e escolha.html; fit-tour-motion.js dá o movimento.
import {PRODUCTS, SOON, FAMILIES, PRODUCT_CATEGORIES, showcase, originalColors} from './products.js';
import {COMMERCE, money} from './commerce-config.js';
import {icon} from './icons.js';

const esc = value => String(value ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const piece = key => PRODUCTS[key] || SOON[key];
const chevron = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

// Por peça: `overview` troca a descrição da loja só aqui (a do macaco termina em "Em breve.", que já vira selo);
// `frame` posiciona a peça encaixada na figura (scale: lado do quadrado da demonstração ÷ largura da figura; y: topo do
// quadrado ÷ altura da figura); `fade` encurta o equipamento só aqui (frações da altura dele, como tool.fade).
// `spots`: os pontos sobre a peça, no espaço do quadrado da demonstração (x, y de 0 a 1, como as chamadas do banner).
// 'fit' = onde a peça encaixa no equipamento (o texto é o da família); 'colors' = cores à sua escolha; 'production' =
// prazo de produção; 'printed' = impresso em 3D. Só o que a loja já afirma (nada de "universal": as lâmpadas
// compatíveis com o macaco ainda não estão definidas).
export const FIT = {
  borboletoscopio: {frame: {scale: .85, y: .035}, spots: [[.5, .44, 'fit'], [.26, .4, 'colors'], [.78, .76, 'production']]},
  dinossauroscopio: {frame: {scale: .84, y: .085}, spots: [[.5, .5, 'fit'], [.4, .3, 'colors'], [.72, .82, 'production']]},
  aviaoscopia: {frame: {scale: .71, y: .07}, spots: [[.5, .93, 'fit'], [.283, .522, 'colors'], [.72, .5, 'production']]},
  macacoscopio: {overview: 'Um macaquinho para acompanhar o olhar dos pequenos.', frame: {scale: .74, y: .2}, fade: [.33, .47], spots: [[.5, .1, 'fit'], [.6, .72, 'printed']]}
};
const familyOf = key => Object.keys(FAMILIES).find(id => FAMILIES[id].items.includes(key));
const spotText = (key, kind) => ({fit: FAMILIES[familyOf(key)]?.label, colors: 'Cores à sua escolha', production: `Produção em ${COMMERCE.productionLabel}`, printed: 'Impresso em 3D'})[kind];

// Peças de uma família que a loja conhece hoje (as que ainda não chegaram ficam de fora) e as famílias com alguma peça.
export const familyItems = id => (FAMILIES[id]?.items || []).filter(key => piece(key) && showcase(key).demo);
export const families = () => Object.keys(FAMILIES).filter(id => familyItems(id).length);
// Todas as peças da seção, na ordem das famílias, com o número da família.
export const tourItems = () => families().flatMap((id, i) => familyItems(id).map(key => ({key, family: id, number: String(i + 1).padStart(2, '0')})));

// A peça encaixada: parede de trás, equipamento (com a mesma queda da demonstração), cabeça do equipamento (lâmpada),
// sombra da peça sobre o equipamento e a frente. Flutua sobre uma sombra no chão. Com `spots`, os pontos que abrem um
// cartãozinho (passar o mouse, focar ou tocar) flutuam junto com a peça.
export function fitFigure(key, {lazy = true, alt = true, spots = false} = {}) {
  const product = piece(key), {tool, layers = {}, head, message} = showcase(key).demo, fit = FIT[key] || {};
  const frame = fit.frame || {scale: .8, y: .1}, fade = fit.fade || tool.fade, front = layers.front || product.catalogImage || product.image;
  const img = (className, src, text = '') => `<img${className ? ` class="${className}"` : ''} src="assets/${esc(src)}" alt="${esc(text)}"${lazy ? ' loading="lazy"' : ''} decoding="async" draggable="false">`;
  const vars = [`--fit-scale:${frame.scale}`, `--fit-y:${frame.y}`, `--tool-w:${tool.width}`, `--tool-top:${tool.top}`, `--tool-ratio:${tool.ratio}`,
    `--fade-a:${fade[0]}`, `--fade-b:${fade[1]}`, `--tool-src:url(assets/${tool.src})`, ...(head ? [`--head-w:${head.width}`, `--head-top:${head.top}`, `--head-ratio:${head.ratio}`] : [])].join(';');
  return `<div class="fit-figure" style="${vars}"><i class="fit-ground" aria-hidden="true"></i><div class="fit-float"><div class="fit-art">`
    + (layers.back ? img('fit-back', layers.back) : '')
    + `<div class="fit-tool">${img('', tool.src)}</div>`
    + (head ? `<div class="fit-head">${img('', head.src)}</div>` : '')
    + img('fit-shade', front) + img('fit-cover', front, alt ? message || product.title : '')
    + (spots && fit.spots ? `<div class="fit-spots">${fit.spots.map(([x, y, kind]) => `<button type="button" class="fit-spot" style="--x:${x};--y:${y}" data-side="${x < .5 ? 'left' : 'right'}" aria-expanded="false"><i class="fit-spot-dot" aria-hidden="true"></i><span class="fit-tip">${esc(spotText(key, kind))}</span></button>`).join('')}</div>` : '')
    + '</div></div></div>';
}

// Cores da peça (as do banner): o degradê em três paradas vira três cores que a faixa troca suavemente.
const tone = key => {
  const {theme} = showcase(key), stops = theme.bannerStops.match(/#[0-9a-f]{3,8}/gi) || [];
  return [`--fit-accent:${theme.accentColor}`, `--fit-ink:${theme.textColor}`, `--fit-stops:${theme.bannerStops}`, ...stops.slice(0, 3).map((hex, i) => `--fit-bg-${i + 1}:${hex}`)].join(';');
};
const link = key => piece(key).soon
  ? {href: `#produto/${key}/3d`, label: 'Ver em 3D', icon: 'cube'}
  : {href: `#produto/${key}/personalizar`, label: 'Personalizar o meu', icon: 'draw'};

// As cores da peça em esferas, sem texto: as fixas da novidade ou as originais da peça (que a pessoa pode trocar).
function spheres(key) {
  const product = piece(key), colors = product.soon ? product.colors || [] : originalColors(key);
  return `<p class="fit-colors fit-reveal"><span class="sr-only">${product.soon ? 'Cores fixas' : 'Cores originais'}</span>`
    + colors.map(c => `<i style="--swatch:${c.hex}" role="img" aria-label="${esc(c.name)}" title="${esc(c.name)}"></i>`).join('') + '</p>';
}

function step({key, family, number}, i) {
  const product = piece(key), go = link(key), overview = FIT[key]?.overview || product.description;
  return `<article class="fit-step" id="consultas-${key}" data-item="${key}" data-index="${i}" style="${tone(key)}" aria-labelledby="fit-name-${key}">`
    + `<div class="fit-step-art"><i class="fit-glow" aria-hidden="true"></i>${fitFigure(key, {alt: false, spots: true})}</div>`
    + '<div class="fit-step-copy">'
    + `<p class="fit-family fit-reveal"><span class="fit-index">${number}</span><span>${esc(FAMILIES[family].label)}</span></p>`
    + `<h3 class="fit-reveal" id="fit-name-${key}"><span class="fit-name" translate="no">${esc(product.title)}</span>${product.soon ? '<span class="fit-soon">Em breve</span>' : ''}</h3>`
    + `<p class="fit-overview fit-reveal" data-text="${esc(overview)}">${esc(overview)}</p>`
    // ficha enxuta: o encaixe, as cores e a produção saem da própria peça, nos pontos sobre ela (fitFigure, spots)
    + spheres(key)
    // a peça já aparece encaixada ao lado: a ficha termina só com a ação principal
    + `<p class="fit-actions fit-reveal"><a class="fit-cta" href="${go.href}">${icon(go.icon)}<span>${go.label}</span><span class="sr-only"> ${esc(product.title)}</span></a></p>`
    + '</div></article>';
}

// Carrossel da categoria: a peça encaixada flutuando sobre a cor dela, o nome e o preço (ou "Em breve"); cada cartão
// leva de volta à ficha técnica da peça, lá em cima.
function card({key}) {
  const product = piece(key), price = COMMERCE.prices[key];
  return `<li class="fit-card" style="${tone(key)}"><a class="fit-card-link" href="#consultas-${key}" data-item="${key}" draggable="false">`
    + `<span class="fit-card-art"><i class="fit-wash" aria-hidden="true"></i>${fitFigure(key, {alt: false})}</span>`
    + `<span class="fit-card-name">${esc(product.title)}</span><span class="fit-card-sub">${esc(product.subtitle)}</span>`
    + (product.soon || !price ? '<span class="fit-card-soon">Em breve</span>' : `<span class="fit-card-price">${esc(money(price))}</span>`)
    + '</a></li>';
}

// Conteúdo da seção da home (o <section data-fit-tour> fica em index.html).
export function fitTour() {
  const items = tourItems(), category = PRODUCT_CATEGORIES[piece(items[0].key).category]?.label || '';
  const slides = items.map(({key}, i) => `<div class="fit-slide" data-item="${key}" data-pos="${i ? 'after' : 'active'}" style="${tone(key)}">${fitFigure(key, {spots: true})}</div>`).join('');
  const dots = items.map(({key}, i) => `<a href="#consultas-${key}" aria-label="${esc(piece(key).title)}"${i ? '' : ' aria-current="true"'}><i></i></a>`).join('');
  return '<header class="fit-tour-head fit-reveal"><p class="eyebrow">FEITO PARA ENCAIXAR</p><h2 id="fit-tour-title">O 3D nas suas consultas</h2>'
    + '<p>Cada peça é pensada para um equipamento da consulta.</p></header>'
    + `<div class="fit-story" style="${tone(items[0].key)}">`
    // .fit-pin: no desktop, com o modo cinema, vira a tela fixa onde uma ficha sai antes da próxima entrar
    + `<div class="fit-pin"><div class="fit-steps">${items.map(step).join('')}</div>`
    + `<div class="fit-stage"><div class="fit-stage-pin"><i class="fit-glow"></i><div class="fit-slides">${slides}</div></div></div>`
    + `<nav class="fit-dots" aria-label="Peças">${dots}</nav></div>`
    // fundo da página nas cores de cada peça (fit-tour-motion.js leva para logo depois do fundo do banner e troca a cada peça)
    + `<div class="fit-backdrop" aria-hidden="true">${items.map(({key}) => `<i style="${tone(key)}"></i>`).join('')}</div></div>`
    + '<section class="fit-more" aria-labelledby="fit-more-title">'
    + `<header class="fit-more-head fit-reveal"><h3 id="fit-more-title">Peças de ${esc(category.toLowerCase())}</h3><p>ENCONTRE A PEÇA DO SEU EQUIPAMENTO</p></header>`
    // setas nas bordas do carrossel no desktop; no celular, compactas ao lado das bolinhas, abaixo do cartão do centro
    + `<div class="fit-carousel"><ul class="fit-track" aria-label="Peças de ${esc(category.toLowerCase())}">${items.map(card).join('')}</ul>`
    + `<div class="fit-nav"><button type="button" class="fit-arrow fit-prev" aria-label="Produto anterior">${chevron('m15 5-7 7 7 7')}</button>`
    + `<div class="fit-pager" role="group" aria-label="Peças">${items.map(({key}, i) => `<button type="button" data-index="${i}" aria-label="${esc(piece(key).title)}"${i ? '' : ' aria-current="true"'}><i></i></button>`).join('')}</div>`
    + `<button type="button" class="fit-arrow fit-next" aria-label="Próximo produto">${chevron('m9 5 7 7-7 7')}</button></div></div></section>`
    + `<p class="fit-tour-end fit-reveal"><a class="fit-choose" href="escolha.html"><span>Escolha o seu</span>${icon('arrow')}</a></p>`;
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
