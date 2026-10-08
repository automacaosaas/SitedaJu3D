// Matemática da vitrine principal, sem DOM. Um único valor contínuo (`position`) comanda
// produto+pilastra, textos, paleta, fundo e header; aqui ficam só as funções puras.
export const MIN_SCALE = .88;          // escala de quem entra/sai (o ativo fica em 1)
export const EASE = [.22, 1, .36, 1];  // cubic-bezier do movimento principal
export const FULL_DURATION = 780;      // ms para atravessar um produto

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const mod = (n, total) => ((n % total) + total) % total;
const smooth = t => t * t * (3 - 2 * t);

// Distância assinada (em produtos) entre um item e a posição atual, no caminho circular mais curto.
export function wrapDistance(index, position, total) {
  let d = mod(index - position, total);
  if (d > total / 2) d -= total;
  return d;
}

// Produto + pilastra. x em "unidades de deslocamento", y em "unidades de elevação"; a escala
// é aplicada a partir da base, então a pilastra continua apoiada no mesmo chão.
export function pose(distance, {reduced = false} = {}) {
  const a = Math.min(1, Math.abs(distance));
  if (reduced) return {x: 0, y: 0, scale: 1, opacity: 1 - smooth(a), a};
  return {
    x: clamp(distance, -1.25, 1.25),
    y: -a,
    scale: 1 - (1 - MIN_SCALE) * a,
    opacity: 1 - smooth(clamp((a - .04) / .9, 0, 1)),
    a
  };
}

// Categoria/nome/paleta: somem na primeira metade do trajeto e o próximo surge na segunda,
// com deslocamento pequeno a favor do movimento (x) e uma leve descida (y).
export function textPose(distance, {reduced = false} = {}) {
  const a = Math.min(1, Math.abs(distance));
  const opacity = smooth(clamp(1 - a / .5, 0, 1));
  if (reduced) return {x: 0, y: 0, opacity};
  return {x: clamp(distance, -1, 1), y: a, opacity};
}

// Cores #rrggbb: mistura (textos e botões que seguem o tema) e versão com transparência.
const channels = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
export function mixColor(a, b, t) {
  const from = channels(a), to = channels(b), k = clamp(t, 0, 1);
  return '#' + from.map((v, i) => Math.round(v + (to[i] - v) * k).toString(16).padStart(2, '0')).join('');
}
export function withAlpha(hex, alpha) {
  const [r, g, b] = channels(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// As cores que a peça empresta às outras páginas (journey.js): as do tema e as derivadas. A vitrine guarda as da peça da
// frente; a página de cada peça (tools/build-product-pages.cjs) já nasce com as dela.
// wash: tom claro (miolo do degradê + branco) que suaviza o topo do card ativo do catálogo e o fundo das páginas.
export function journeyColors(theme) {
  return {
    '--theme-text': theme.textColor, '--theme-muted': theme.mutedColor, '--theme-accent': theme.accentColor,
    '--theme-wash': mixColor(theme.bannerStops.match(/#[0-9a-f]{6}/gi)[1], '#ffffff', .3),
    '--theme-soft': mixColor(theme.accentColor, '#ffffff', .78), '--theme-accent-strong': mixColor(theme.accentColor, '#000000', .2)
  };
}

// ── Fundo desenhado atrás da peça (hero-scenery.js) ──
// Luminância relativa (WCAG), a mesma fórmula dos testes de contraste.
const linear = value => { const c = value / 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; };
export function luminance(hex) {
  const [r, g, b] = channels(hex).map(linear);
  return .2126 * r + .7152 * g + .0722 * b;
}
// A cor da peça clareada com branco só até ficar tão clara quanto `floor` (o tom do meio do degradê): um desenho nessa cor
// nunca escurece o fundo atrás de um texto, e ainda guarda o máximo da cor da peça.
export function lightTint(hex, floor) {
  const target = luminance(floor);
  for (let k = 0; k <= 100; k++) { const tint = mixColor(hex, '#ffffff', k / 100); if (luminance(tint) >= target) return tint; }
  return '#ffffff';
}
// O sombreado (os detalhes miúdos, como o cabinho das bananas) é a cor do texto do tema a 7% (no máximo 8%): marca sem tirar contraste
// (com o céu do avião, 8% já deixava o apoio e o destaque abaixo de 4,5:1).
export const SCENERY_SHADE = .07;
// Profundidade no arraste: o desenho do fundo acompanha a peça a 12% do caminho dela (pose(d).x) e as silhuetas dos cantos, mais
// longe, a 5% (depth); tudo parado no movimento reduzido.
export const SCENERY_PARALLAX = .12, SCENERY_EDGE = .05;
export function sceneryShift(distance, travel, {reduced = false, depth = SCENERY_PARALLAX} = {}) {
  return reduced ? 0 : pose(distance).x * travel * depth + 0;   // + 0: nunca -0
}
// A rolagem da página (08/10/2026: "algo mais fluido, que conecte com o rolar da página"; carousel.css › scn-scroll, com os mesmos
// números, e carousel.js onde o navegador não liga animação à rolagem): da página no topo (progress 0) até a vitrine inteira ter saído
// da tela (1), cada parte do fundo anda, em linha reta, até y (fração da altura da vitrine; negativo sobe) e até x para fora, pelo
// seu lado (side: −1 a esquerda, 1 a direita), e esmaece até fade. near = os cantos (ficam um pouco para trás, afundando, e esmaecem);
// mid = as silhuetas das bordas (se abrem para fora e esmaecem); far = o que está longe (se abre mais devagar). As das bordas só andam
// para fora, nunca para cima ou para baixo: as setas, a peça, o preço e os botões ficam logo acima e abaixo delas (com 6% e 14% da
// vitrine para trás, no meio da rolagem as nuvenzinhas passavam por trás das setas); e os cantos, embaixo, nunca sobem até as setas
// (subindo 10%, no computador as margaridas e as pegadas passavam por trás delas). Parado no movimento reduzido.
export const SCENERY_SCROLL = Object.freeze({near: Object.freeze({y: .06, x: 0, fade: .3}), mid: Object.freeze({y: 0, x: .06, fade: .45}), far: Object.freeze({y: 0, x: .035, fade: .4})});
export function sceneryScroll(progress, {depth = 'mid', side = 0} = {}, height = 0, {reduced = false} = {}) {
  const p = reduced ? 0 : clamp(progress, 0, 1), d = SCENERY_SCROLL[depth] || SCENERY_SCROLL.mid;
  return {x: side * d.x * height * p + 0, y: d.y * height * p + 0, opacity: 1 + (d.fade - 1) * p};   // + 0: nunca -0
}
// As cores do desenho de uma peça, como variáveis CSS da camada, todas opacas: --scn-tN (a cor N clareada), --scn-hN (o lado da
// luz, mais branco) e --scn-sN (o lado da sombra e os detalhes). Com menos de quatro cores, a última se repete; sem cores, o tom do meio.
export function sceneryVars(theme, {tints = []} = {}) {
  const [, mid] = theme.bannerStops.match(/#[0-9a-f]{6}/gi), list = tints.length ? tints : [mid], vars = {};
  for (let i = 0; i < 4; i++) {
    const tint = lightTint(list[Math.min(i, list.length - 1)], mid);
    vars[`--scn-t${i + 1}`] = tint;
    vars[`--scn-h${i + 1}`] = mixColor(tint, '#ffffff', .62);
    vars[`--scn-s${i + 1}`] = mixColor(tint, theme.textColor, SCENERY_SHADE);
  }
  return vars;
}

// Fundo e header: cross-fade entre as duas camadas vizinhas da posição atual.
export function layerMix(position, total) {
  const lo = Math.floor(position);
  return {from: mod(lo, total), to: mod(lo + 1, total), t: position - lo};
}

// Soltar o arraste. Um peteleco (velocity, em px/ms do dedo, acima de FLICK) segue para o lado dele a partir de onde a vitrine está
// (position): um movimento rápido e curto troca de peça, e um peteleco de volta desfaz o arraste. Sem impulso, vale a distância
// (o limiar). Nunca mais de uma peça a partir da âncora.
export const FLICK = .35;
export function swipeTarget({anchor, dx, stride, velocity = 0, position = anchor - dx / stride, cancelled = false}) {
  if (cancelled) return anchor;
  const base = Math.round(anchor);
  if (Math.abs(velocity) > FLICK) return clamp(velocity < 0 ? Math.floor(position + 1e-6) + 1 : Math.ceil(position - 1e-6) - 1, base - 1, base + 1);
  const threshold = Math.min(40, stride * .18);
  return Math.abs(dx) >= threshold ? base + (dx < 0 ? 1 : -1) : anchor;
}

// Duração do assentar, pela distância. Ao soltar um arraste (velocity + stride, o curso de uma peça em px), a curva sai na velocidade
// do dedo, sem tranco: a ease-out EASE começa a EASE[1]/EASE[0] (~4,5×) a velocidade média; entre 320 ms e FULL_DURATION.
export function settleDuration(distance, {reduced = false, velocity = null, stride = 0} = {}) {
  if (reduced) return 320;
  if (velocity != null && stride > 0) return Math.round(clamp(EASE[1] / EASE[0] * Math.abs(distance) * stride / Math.max(.4, Math.abs(velocity)), 320, FULL_DURATION));
  return Math.round(clamp(FULL_DURATION * (.55 + .45 * Math.abs(distance)), 320, 1100));
}

// Avaliador de cubic-bezier (mesma curva do CSS).
export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sampleX = t => ((ax * t + bx) * t + cx) * t;
  const sampleY = t => ((ay * t + by) * t + cy) * t;
  const slopeX = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const error = sampleX(t) - x;
      if (Math.abs(error) < 1e-6) return sampleY(t);
      const slope = slopeX(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= error / slope;
    }
    let lo = 0, hi = 1;
    t = x;
    while (hi - lo > 1e-7) {
      const value = sampleX(t);
      if (Math.abs(value - x) < 1e-6) break;
      if (x > value) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return sampleY(t);
  };
}
