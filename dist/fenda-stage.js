// Vitrine de novidade de uma família de encaixe (fenda.html: as lâmpadas de fenda) e o banner dela na home. Só marcação, sem acesso
// à página: tools/build-product-pages.cjs grava o HTML em fenda.html e entre <!-- novidade --> e <!-- /novidade --> no index.html;
// fenda.js põe o palco para andar. Peça nova da família (FAMILIES em products.js) entra sozinha nas duas.
// O palco, como as vitrines de lançamento: a peça encaixada no centro (a mesma figura da página Escolha o seu, escolha.js › fitFigure),
// as vizinhas desfocadas dos lados, o selo "Novidade" e a lista das peças à esquerda, o nome grande embaixo e "Ver mais", que leva a
// peça para a esquerda e abre à direita o preço, as cores em aletas, a descrição e o "Monte seu kit" (kit-builder.js). O fundo de cada
// peça é o da vitrine da home: o degradê dela e as silhuetas dela (hero-scenery.js), trocados devagar.
import {PRODUCTS, FAMILIES, showcase, badgeStyle, artSmall} from './products.js';
import {COMMERCE, money, pixPrice, installmentLabel, kitOffer} from './commerce-config.js';
import {familyItems, fitFigure} from './escolha.js';
import {scenery} from './hero-scenery.js';
import {sceneryVars} from './hero-motion.js';
import {icon} from './icons.js';

const esc = value => String(value ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const nbsp = text => String(text).replace(/ /g, '&nbsp;');
const css = vars => Object.entries(vars).map(([name, value]) => `${name}:${value}`).join(';');

// As cores de uma peça para o palco: as do tema dela (as mesmas do banner da home e da página dela).
export const tone = key => { const {theme} = showcase(key); return {'--nv-accent': theme.accentColor, '--nv-ink': theme.textColor, '--nv-muted': theme.mutedColor}; };
// As peças à venda da família, na ordem dela.
export const noveltyItems = family => familyItems(family).filter(key => PRODUCTS[key]);

export function noveltyStage(family) {
  const items = noveltyItems(family), first = items[0], tool = FAMILIES[family].tool;
  const layers = items.map((key, i) => { const {theme, scenery: look} = showcase(key);
    return `<div class="nv-layer${i ? '' : ' is-on'}" data-nv-layer="${i}" style="--stops:${theme.bannerStops};${css(sceneryVars(theme, look))}">${scenery(look, `nv${i}`)}</div>`; }).join('');
  const slides = items.map((key, i) => `<li class="nv-item" data-nv-item="${i}" data-nv-key="${key}"${i ? ' aria-hidden="true"' : ''}><button type="button" class="nv-art" data-nv-go="${i}" tabindex="-1" aria-label="${esc(PRODUCTS[key].title)}">${fitFigure(key, {lazy: i > 0})}</button></li>`).join('');
  const captions = items.map((key, i) => { const p = PRODUCTS[key], price = COMMERCE.prices[key];
    return `<div class="nv-caption" data-nv-caption="${i}"${i ? ' hidden' : ''}><p class="nv-sub">${esc(p.subtitle)}</p><h2 class="nv-name">${esc(p.title)}</h2>`
      + `<p class="nv-price-line"><strong>${nbsp(money(price))}</strong><span class="nv-pix">${nbsp(money(pixPrice(price)))} no Pix</span></p>`
      // sem JavaScript, "Ver mais" é o link da página da peça; com ele, abre os detalhes aqui mesmo (fenda.js)
      + `<a class="nv-more" href="${key}.html" data-nv-more aria-controls="nv-detail" aria-expanded="false">Ver mais</a></div>`; }).join('');
  const tops = items.map((key, i) => { const p = PRODUCTS[key], price = COMMERCE.prices[key];
    return `<div class="nv-detail-top" data-nv-top="${i}"${i ? ' hidden' : ''}><div class="nv-price"><strong>${nbsp(money(price))}</strong><span class="nv-pix">${nbsp(money(pixPrice(price)))} no Pix</span><small>ou ${esc(installmentLabel(price))} sem juros no cartão</small></div>`
      + `<ul class="nv-tabs" aria-label="Cores da peça">${(p.colors || []).map(c => `<li style="--swatch:${c.hex}"><i aria-hidden="true"></i><span>${esc(c.name)}</span></li>`).join('')}</ul>`
      + `<p class="nv-desc">${esc(p.description)}</p>`
      + `<p class="nv-links"><a href="${key}.html">${icon('eye')}<span>Ver a peça</span></a><a href="index.html#produto/${key}/encaixe">${icon('play')}<span>Ver encaixado</span></a></p></div>`; }).join('');
  return `<section class="nv-stage" data-nv aria-roledescription="carrossel" aria-label="Novidades: encaixe para ${esc(tool.toLowerCase())}" style="${css(tone(first))}">
        <div class="nv-bg" aria-hidden="true">${layers}</div>
        <div class="nv-head">
          <p class="nv-badges"><span class="pl-badge is-badge" data-nv-badge data-effect="${esc(PRODUCTS[first].eyebrowEffect || 'shine')}" style="${esc(badgeStyle(first))}">Novidade</span></p>
          <p class="nv-kicker">Encaixe para</p>
          <h1 class="nv-title">${esc(tool)}</h1>
          <ol class="nv-list">${items.map((key, i) => `<li><button type="button" data-nv-go="${i}"${i ? '' : ' aria-current="true"'}>${esc(PRODUCTS[key].title)}</button></li>`).join('')}</ol>
        </div>
        <button type="button" class="nv-back" data-nv-back hidden>${icon('arrow')}<span>Voltar</span></button>
        <div class="nv-focus">
          <ol class="nv-track">${slides}</ol>
          ${captions}
        </div>
        <button type="button" class="hero-arrow nv-arrow nv-prev" data-nv-step="-1" aria-label="Peça anterior"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></button>
        <button type="button" class="hero-arrow nv-arrow nv-next" data-nv-step="1" aria-label="Próxima peça"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button>
        <aside class="nv-detail" id="nv-detail" data-nv-detail aria-label="Preço, cores e kit" hidden>
          ${tops}
          <section class="nv-kit" aria-labelledby="nv-kit-title"><div class="pl-kit-head"><h3 id="nv-kit-title">Monte seu kit</h3><span class="pl-kit-mix">pode misturar</span></div><div data-nv-kit></div></section>
        </aside>
        <p class="sr-only" aria-live="polite" data-nv-status></p>
      </section>`;
}

// O banner da home, entre a vitrine e "Nossa coleção": o selo, a família, as peças lado a lado (a primeira em destaque no meio, as dos lados
// desfocadas, como os vizinhos da coleção), a oferta do kit e o convite. O cartão inteiro é o link da vitrine.
export function noveltyBanner(family) {
  const items = noveltyItems(family), tool = FAMILIES[family].tool;
  if (!items.length) return '';
  // a primeira peça da família no meio (o macaco, a primeira a chegar), as duas seguintes dos lados
  const middle = items[0], order = [items[1], middle, items[2]].filter(Boolean);
  const art = order.map(key => `<img class="nvb-piece${key === middle ? ' is-main' : ''}" src="assets/${esc(artSmall(PRODUCTS[key].catalogImage))}" alt="" width="768" height="768" loading="lazy" decoding="async" draggable="false">`).join('');
  const {theme} = showcase(middle);
  return `<section class="nvb" aria-labelledby="nvb-title"><a class="nvb-link" href="fenda.html" style="--nvb-stops:${theme.bannerStops};${css(tone(middle))}">`
    + `<span class="nvb-copy"><span class="nvb-badge is-badge" data-effect="${esc(PRODUCTS[middle].eyebrowEffect || 'shine')}" style="${esc(badgeStyle(middle))}">Novidade</span>`
    + `<span class="nvb-kicker">Encaixe para</span><span class="nvb-title" id="nvb-title">${esc(tool)}</span>`
    + `<span class="nvb-names">${items.map(key => `<span>${esc(PRODUCTS[key].title)}</span>`).join('')}</span>`
    + `<span class="nvb-offer">${esc(kitOffer(middle))}</span>`
    + `<span class="nvb-cta"><span>Conhecer a novidade</span>${icon('arrow')}</span></span>`
    + `<span class="nvb-art" aria-hidden="true">${art}</span></a></section>`;
}
