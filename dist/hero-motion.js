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

// Fundo e header: cross-fade entre as duas camadas vizinhas da posição atual.
export function layerMix(position, total) {
  const lo = Math.floor(position);
  return {from: mod(lo, total), to: mod(lo + 1, total), t: position - lo};
}

// Mesma regra de gesto da vitrine anterior: soltar além do limiar avança um produto.
export function swipeTarget({anchor, dx, stride, cancelled = false}) {
  if (cancelled) return anchor;
  const threshold = Math.min(40, stride * .18);
  return Math.abs(dx) >= threshold ? Math.round(anchor) + (dx < 0 ? 1 : -1) : anchor;
}

export function settleDuration(distance, {reduced = false} = {}) {
  if (reduced) return 320;
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
