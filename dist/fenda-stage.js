// Vitrine de novidade de uma família de encaixe (fenda.html: as lâmpadas de fenda) e o banner dela na home. Só marcação, sem acesso
// à página: tools/build-product-pages.cjs grava o HTML em fenda.html e entre <!-- novidade --> e <!-- /novidade --> no index.html;
// fenda.js põe a página para andar. Peça nova da família (FAMILIES em products.js) entra sozinha nas três partes:
//  · o palco, como as vitrines de lançamento: a peça encaixada na lâmpada inteira no centro (a figura da página Escolha o seu,
//    escolha.js › fitFigure, com o próprio enquadramento), as vizinhas dos lados, o selo "Novidade" e a lista à esquerda, o nome grande,
//    o preço e a compra (Comprar e Adicionar) embaixo; "Ver detalhes" leva a peça para a esquerda e abre o preço, as cores em aletas e a
//    descrição. O fundo de cada peça é o da vitrine da home (o degradê e as silhuetas dela, hero-scenery.js), trocado devagar;
//  · as ofertas, que aparecem ao rolar: um cartão por faixa do kit (1, 2 e 3 peças, cada um nas cores de uma peça) e o "Monte seu kit"
//    (kit-builder.js) com "Comprar agora";
//  · o banner da home, que entra ao rolar da vitrine: as peças lado a lado nas cores delas, as faixas do kit e o convite.
import {PRODUCTS, FAMILIES, showcase, badgeStyle, artSmall} from './products.js';
import {COMMERCE, money, pixPrice, pixPercent, installmentLabel, kitOffer} from './commerce-config.js';
import {kitTiers} from './kit-builder.js';
import {familyItems, fitFigure} from './escolha.js';
import {scenery} from './hero-scenery.js';
import {sceneryVars} from './hero-motion.js';
import {icon} from './icons.js';

const esc = value => String(value ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const nbsp = text => String(text).replace(/ /g, '&nbsp;');
const css = vars => Object.entries(vars).map(([name, value]) => `${name}:${value}`).join(';');
const round = value => Math.round(value * 10000) / 10000;
// "R$ 90" para os valores redondos (as faixas do kit), "R$ 85,50" para os outros
const short = cents => money(cents).replace(/,00$/, '');
const mid = key => showcase(key).theme.bannerStops.match(/#[0-9a-f]{6}/gi)[1];

// As cores de uma peça: as do tema dela (as mesmas da vitrine da home e da página dela).
export const tone = key => { const {theme} = showcase(key); return {'--nv-accent': theme.accentColor, '--nv-ink': theme.textColor, '--nv-muted': theme.mutedColor}; };
// As peças à venda da família, na ordem dela.
export const noveltyItems = family => familyItems(family).filter(key => PRODUCTS[key]);

// A peça encaixada na lâmpada inteira, da cabeça binocular à base: o quadrado da peça ocupa SCALE da largura da figura e a altura da
// figura (em larguras, `height`) é a da maior das peças, para todas pisarem na mesma linha. Sem a queda do equipamento (fade 1).
const SCALE = .94, PAD = .03;
const span = key => { const {tool, head} = showcase(key).demo; return {top: Math.min(0, head ? head.top : 0), bottom: Math.max(1, tool.top + tool.width / tool.ratio)}; };
export const figureHeight = items => round(Math.max(...items.map(key => { const s = span(key); return (s.bottom - s.top) * SCALE; })) + 2 * PAD);
export function lampFigure(key, height, {lazy = true} = {}) {
  const {bottom} = span(key), y = round((height - PAD - bottom * SCALE) / height);
  return fitFigure(key, {lazy, frame: {scale: SCALE, y}, fade: [1, 1], className: 'nv-fig', vars: `--fig-h:${height}`});
}

export function noveltyStage(family) {
  const items = noveltyItems(family), first = items[0], tool = FAMILIES[family].tool, height = figureHeight(items);
  const layers = items.map((key, i) => { const {theme, scenery: look} = showcase(key);
    return `<div class="nv-layer${i ? '' : ' is-on'}" data-nv-layer="${i}" style="--stops:${theme.bannerStops};${css(sceneryVars(theme, look))}">${scenery(look, `nv${i}`)}</div>`; }).join('');
  const slides = items.map((key, i) => `<li class="nv-item" data-nv-item="${i}" data-nv-key="${key}"${i ? ' aria-hidden="true"' : ''}><button type="button" class="nv-art" data-nv-go="${i}" tabindex="-1" aria-label="${esc(PRODUCTS[key].title)}">${lampFigure(key, height, {lazy: i > 0})}</button></li>`).join('');
  const buy = (key, label) => `<button type="button" class="nv-cta is-main" data-nv-buy="${key}">${icon('bag')}<span>${label}</span></button>`
    + `<button type="button" class="nv-cta" data-add-product="${key}" aria-label="Adicionar ${esc(PRODUCTS[key].title)} ao carrinho">${icon('cart')}<span>Adicionar ao carrinho</span></button>`;
  const captions = items.map((key, i) => { const p = PRODUCTS[key], price = COMMERCE.prices[key];
    return `<div class="nv-caption" data-nv-caption="${i}"${i ? ' hidden' : ''}><p class="nv-sub">${esc(p.subtitle)}</p><h2 class="nv-name">${esc(p.title)}</h2>`
      + `<div class="nv-buy"><p class="nv-price-line"><strong>${nbsp(money(price))}</strong><span class="nv-pix">${nbsp(money(pixPrice(price)))} no Pix</span></p>`
      + `<div class="nv-ctas">${buy(key, 'Comprar')}</div></div>`
      // sem JavaScript, "Ver detalhes" é o link da página da peça; com ele, abre os detalhes aqui mesmo (fenda.js)
      + `<a class="nv-more" href="${key}.html" data-nv-more aria-controls="nv-detail" aria-expanded="false">Ver detalhes</a></div>`; }).join('');
  const tops = items.map((key, i) => { const p = PRODUCTS[key], price = COMMERCE.prices[key];
    return `<div class="nv-detail-top" data-nv-top="${i}"${i ? ' hidden' : ''}><div class="nv-price"><strong>${nbsp(money(price))}</strong><span class="nv-pix">${nbsp(money(pixPrice(price)))} no Pix</span><small>ou ${esc(installmentLabel(price))} sem juros no cartão</small></div>`
      + `<ul class="nv-tabs" aria-label="Cores da peça">${(p.colors || []).map(c => `<li style="--swatch:${c.hex}"><i aria-hidden="true"></i><span>${esc(c.name)}</span></li>`).join('')}</ul>`
      + `<p class="nv-desc">${esc(p.description)}</p>`
      + `<div class="nv-ctas">${buy(key, 'Comprar agora')}</div>`
      + `<p class="nv-links"><a href="#ofertas" data-nv-offers>${icon('bag')}<span>${esc(kitOffer(key))}</span></a><a href="${key}.html">${icon('eye')}<span>Ver a peça</span></a><a href="index.html#produto/${key}/encaixe">${icon('play')}<span>Ver encaixado</span></a></p></div>`; }).join('');
  return `<section class="nv-stage" data-nv aria-roledescription="carrossel" aria-label="Novidades: encaixe para ${esc(tool.toLowerCase())}" style="${css(tone(first))};--fig-h:${height}">
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
        <aside class="nv-detail" id="nv-detail" data-nv-detail aria-label="Preço, cores e compra" hidden>
          ${tops}
        </aside>
        <p class="sr-only" aria-live="polite" data-nv-status></p>
      </section>`;
}

// As ofertas, depois do palco: um cartão por faixa do kit (o preço, o de cada peça, quanto economiza e as peças), cada um nas cores de
// uma peça, e o "Monte seu kit" — escolher um cartão já monta o kit com aquele tanto de peças (fenda.js).
export function noveltyOffers(family) {
  const items = noveltyItems(family), first = items[0], tiers = kitTiers(first), full = COMMERCE.prices[first];
  if (tiers.length < 2) return '';
  const cards = tiers.map((tier, i) => { const key = items[i % items.length], {theme} = showcase(key), saving = full * tier.units - tier.cents, best = i === tiers.length - 1;
    const pieces = Array.from({length: tier.units}, (_, n) => items[n % items.length]);
    return `<article class="nv-tier${best ? ' is-best' : ''}" data-nv-reveal style="--tier-stops:${theme.bannerStops};--tier-accent:${theme.accentColor};--tier-ink:${theme.textColor};--i:${i}">`
      + (best ? '<span class="nv-tier-flag">Mais vantajoso</span>' : '')
      + `<span class="nv-tier-art" aria-hidden="true">${pieces.map(key => `<img src="assets/${esc(artSmall(PRODUCTS[key].catalogImage))}" alt="" width="768" height="768" loading="lazy" decoding="async">`).join('')}</span>`
      + `<h3 class="nv-tier-n">${tier.units === 1 ? '1 peça' : `${tier.units} peças`}</h3>`
      + `<p class="nv-tier-price"><strong>${nbsp(short(tier.cents))}</strong>${tier.units > 1 ? `<span>${nbsp(short(tier.each))} cada</span>` : '<span>a peça</span>'}</p>`
      + `<p class="nv-tier-save">${saving > 0 ? `Economize ${nbsp(short(saving))}` : 'Escolha a sua'}</p>`
      + `<button type="button" class="nv-tier-cta" data-nv-tier="${tier.units}">${tier.units === 1 ? 'Escolher 1 peça' : `Escolher ${tier.units} peças`}</button></article>`; }).join('');
  return `<section class="nv-offers" id="ofertas" aria-labelledby="nv-offers-title">
        <header class="nv-offers-head" data-nv-reveal><p class="nv-kicker">Ofertas da novidade</p><h2 id="nv-offers-title">Leve mais, <em>pague menos.</em></h2><p>${esc(kitOffer(first))}. <span>Vale para ${items.map(key => esc(PRODUCTS[key].title)).join(', ').replace(/, ([^,]*)$/, ' e $1')}.</span></p></header>
        <div class="nv-tiers">${cards}</div>
        <div class="nv-kit-panel" id="nv-kit" data-nv-reveal>
          <div class="pl-kit-head"><h3>Monte seu kit</h3><span class="pl-kit-mix">pode misturar</span></div>
          <div data-nv-kit></div>
          <button type="button" class="nv-kit-buy" data-nv-kit-buy hidden>${icon('bag')}<span>Comprar agora</span></button>
          <p class="nv-kit-fallback" data-nv-kit-fallback>${items.map(key => `<a href="${key}.html">${esc(PRODUCTS[key].title)}</a>`).join('')}</p>
        </div>
      </section>`;
}

// O banner da home, entre a vitrine e "Nossa coleção" (entra ao rolar da vitrine, catalog.css): o selo, a família, as faixas do kit e o
// convite; à direita, as peças lado a lado, nítidas, cada uma com o nome, o preço e a luz da cor dela, sobre o degradê das três.
export function noveltyBanner(family) {
  const items = noveltyItems(family), tool = FAMILIES[family].tool;
  if (!items.length) return '';
  // a primeira peça da família no meio (o macaco, a primeira a chegar), as duas seguintes dos lados
  const middle = items[0], order = [items[1], middle, items[2]].filter(Boolean), tiers = kitTiers(middle);
  const art = order.map(key => `<span class="nvb-pick${key === middle ? ' is-main' : ''}" style="--pick-glow:${mid(key)};--pick-accent:${showcase(key).theme.accentColor}"><img src="assets/${esc(artSmall(PRODUCTS[key].catalogImage))}" alt="" width="768" height="768" loading="lazy" decoding="async" draggable="false"><span class="nvb-tag"><b>${esc(PRODUCTS[key].title)}</b>${nbsp(short(COMMERCE.prices[key]))}</span></span>`).join('');
  const stops = order.map(mid);
  return `<section class="nvb" aria-labelledby="nvb-title"><a class="nvb-link" href="fenda.html" style="--nvb-a:${stops[0]};--nvb-b:${stops[1]};--nvb-c:${stops[2] || stops[1]};${css(tone(middle))}">`
    + `<span class="nvb-copy"><span class="nvb-badge is-badge" data-effect="${esc(PRODUCTS[middle].eyebrowEffect || 'shine')}" style="${esc(badgeStyle(middle))}">Novidade</span>`
    + `<span class="nvb-kicker">Encaixe para</span><span class="nvb-title" id="nvb-title">${esc(tool)}</span>`
    + `<span class="nvb-tiers">${tiers.map(t => `<span><b>${t.units}</b> por ${nbsp(short(t.cents))}</span>`).join('')}</span>`
    + `<span class="nvb-note">Pode misturar · ${pixPercent}% off no Pix</span>`
    + `<span class="nvb-cta"><span>Ver as ofertas</span>${icon('arrow')}</span></span>`
    + `<span class="nvb-art" aria-hidden="true">${art}</span></a></section>`;
}
