// Página Escolha o seu (escolha.html): um banner por família de encaixe (FAMILIES, products.js), cada um com a peça já
// encaixada no equipamento e abrindo a página Produtos só com as peças daquele encaixe (produtos.html?encaixe=<família>).
// A peça encaixada usa as mesmas camadas da demonstração do banner (SHOWCASE.<peça>.demo). Só marcação, sem acesso à
// página: tools/build-product-pages.cjs grava o HTML em escolha.html.
import {PRODUCTS, SOON, FAMILIES, showcase} from './products.js';
import {icon} from './icons.js';

const esc = value => String(value ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const piece = key => PRODUCTS[key] || SOON[key];

// Por peça: `frame` posiciona a peça encaixada na figura (scale: lado do quadrado da demonstração ÷ largura da figura;
// y: topo do quadrado ÷ altura da figura); `fade` encurta o equipamento só aqui (frações da altura dele, como tool.fade).
export const FIT = {
  borboletoscopio: {frame: {scale: .85, y: .035}},
  dinossauroscopio: {frame: {scale: .84, y: .085}},
  aviaoscopia: {frame: {scale: .71, y: .07}},
  macacoscopio: {frame: {scale: .74, y: .2}, fade: [.33, .47]},
  // girafa e unicórnio: a demonstração do macaco (a mesma lâmpada, products.js fitLamp), então o mesmo enquadramento
  girafoscopio: {frame: {scale: .74, y: .2}, fade: [.33, .47]},
  unicornioscopio: {frame: {scale: .74, y: .2}, fade: [.33, .47]}
};

// Peças de uma família que a loja conhece hoje (as que ainda não chegaram ficam de fora) e as famílias com alguma peça.
export const familyItems = id => (FAMILIES[id]?.items || []).filter(key => piece(key) && showcase(key).demo);
export const families = () => Object.keys(FAMILIES).filter(id => familyItems(id).length);

// A peça encaixada: parede de trás, equipamento (com a mesma queda da demonstração), cabeça do equipamento (lâmpada),
// sombra da peça sobre o equipamento e a frente. Flutua sobre uma sombra no chão. Quem mostra a figura em outro formato
// (a vitrine das lâmpadas, fenda-stage.js: a lâmpada inteira) passa o próprio enquadramento (frame, fade), uma classe e variáveis.
export function fitFigure(key, {lazy = true, frame: ownFrame = null, fade: ownFade = null, className = '', vars: extra = ''} = {}) {
  const product = piece(key), {tool, layers = {}, head, message} = showcase(key).demo, fit = FIT[key] || {};
  const frame = ownFrame || fit.frame || {scale: .8, y: .1}, fade = ownFade || fit.fade || tool.fade, front = layers.front || product.catalogImage || product.image;
  const img = (className, src, text = '') => `<img${className ? ` class="${className}"` : ''} src="assets/${esc(src)}" alt="${esc(text)}"${lazy ? ' loading="lazy"' : ''} decoding="async" draggable="false">`;
  const vars = [`--fit-scale:${frame.scale}`, `--fit-y:${frame.y}`, `--tool-w:${tool.width}`, `--tool-top:${tool.top}`, `--tool-ratio:${tool.ratio}`,
    `--fade-a:${fade[0]}`, `--fade-b:${fade[1]}`, `--tool-src:url(assets/${tool.src})`, ...(head ? [`--head-w:${head.width}`, `--head-top:${head.top}`, `--head-ratio:${head.ratio}`] : []), ...(extra ? [extra] : [])].join(';');
  return `<div class="fit-figure${className ? ` ${className}` : ''}" style="${vars}"><i class="fit-ground" aria-hidden="true"></i><div class="fit-float"><div class="fit-art">`
    + (layers.back ? img('fit-back', layers.back) : '')
    + `<div class="fit-tool">${img('', tool.src)}</div>`
    + (head ? `<div class="fit-head">${img('', head.src)}</div>` : '')
    + img('fit-shade', front) + img('fit-cover', front, message || product.title)
    + '</div></div></div>';
}

// Cores da peça (as do banner).
const tone = key => { const {theme} = showcase(key); return `--fit-accent:${theme.accentColor};--fit-ink:${theme.textColor};--fit-stops:${theme.bannerStops}`; };

// Um banner por família, que abre a página Produtos só com as peças daquele encaixe.
export function chooseBanners() {
  return families().map(id => {
    const family = FAMILIES[id], items = familyItems(id);
    return `<a class="choose-banner" href="produtos?encaixe=${id}" data-family="${id}" style="${tone(items[0])}"><i class="fit-wash" aria-hidden="true"></i>`
      + `<span class="choose-art" data-count="${Math.min(items.length, 2)}">${items.slice(0, 2).map(key => fitFigure(key, {lazy: false})).join('')}</span>`
      + `<span class="choose-copy"><span class="choose-kicker">Encaixe para</span><span class="choose-title">${esc(family.tool)}</span>`
      + `<span class="choose-pieces">${items.map(key => `<span>${esc(piece(key).title)}${piece(key).soon ? ' <em>Em breve</em>' : ''}</span>`).join('')}</span>`
      + `<span class="choose-cta"><span>Ver as peças</span>${icon('arrow')}</span></span></a>`;
  }).join('');
}
