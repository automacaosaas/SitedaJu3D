'use strict';
// O logo da Ju sem fundo e os ícones do site (09/10/2026: o Google mostrava um globo no lugar do ícone).
//
// 1) Recorte (uma vez; só quando a arte muda): o logo oficial (design/originais/logo-ju.png, 1254 px, fundo creme liso e o
//    círculo rosa fino em volta) ampliado 4x pelo Real-ESRGAN fica nítido; daqui sai design/logo/logo-ju-transparente.png
//    (2048 px), só a escrita e os detalhes: o fundo, a sombra suave das letras e o círculo saem de verdade (alfa limpo).
//      realesrgan-ncnn-vulkan -i design/originais/logo-ju.png -o <x4>.png -n realesrgan-x4plus -t 128 -s 4
//      node tools/make-logo-icons.cjs --matte <x4>.png
//    Como: é fundo o que está perto do creme (inclusive a sombra) e é largo — linhas finas claras por dentro das letras (o brilho
//    do relevo) ficam; os miolos das letras (o "e", o "p") saem também. A impressora (corpo creme, quase a cor do fundo) é
//    protegida pela própria silhueta. Os arcos do círculo são achados pela geometria (componentes sobre a circunferência). A borda
//    de cada letra é "descontaminada": a cor dos pixels da borda vem de dentro da letra, sem a mistura com o creme (sem halo claro
//    sobre preto ou rosa).
// 2) Arquivos do site (sempre que mudar algo abaixo): node tools/make-logo-icons.cjs
//    - dist/assets/logo-ju-transparente.png e .webp (1024 px): o logo da empresa nos dados para o Google (Organization.logo);
//    - o "Ju," do logo (a marca) para os ícones: dist/favicon.ico (16, 32 e 48 px, onde o Google procura), favicon-48.png,
//      icon-192.png e icon-512.png (transparentes, com um contorno rosa-escuro sutil que segura a marca em aba clara e escura),
//      apple-touch-icon.png (180 px, com fundo: o iOS não aceita transparência) e favicon.svg (a marca dentro, para quem ainda
//      pedir o endereço antigo). As páginas apontam para eles pelo bloco <!-- icons --> de tools/sync-meta.cjs.
//    O WebP sai pelo codificador do Chrome (como as outras imagens do site): Chrome sem janela.
const fs = require('node:fs');
const path = require('node:path');
const {decode, encode, resize, ico} = require('./png-codec.cjs');

const ROOT = path.join(__dirname, '..');
const MASTER = path.join(ROOT, 'design', 'logo', 'logo-ju-transparente.png');
const DIST = path.join(ROOT, 'dist');

// ── 1) recorte ───────────────────────────────────────────────────────────────────────────────────────────────────────
const WORK = 4096;          // resolução do recorte (a ampliação de 5016 px reduzida); o master sai com a metade
const T_BG = 72;            // distância (maior canal) do creme até onde ainda é fundo ou sombra
const T_PRINTER = 9;        // dentro da caixa da impressora: só o creme quase exato é fundo (o corpo dela fica a ~20)
const OPEN = 3;             // px: fundo mais estreito que 2·3+1 px (o brilho fino por dentro das letras) não sai
const EDGE = 3;             // px da borda cuja cor vem de dentro da letra
// em frações do quadro do logo original
// a impressora: caixa, um ponto do corpo, de onde a sombra do chão pode começar e os vãos de fundo (cercados pelos cabos; a sombra à\n// direita do carretel), cada um com a distância até onde é fundo
const PRINTER = {box: [0.5688, 0.2759, 0.7764, 0.4932], seed: [0.5859, 0.4004], floor: 0.455, loops: [[0.5688, 0.2759, 0.7764, 0.330, 14], [0.734, 0.386, 0.762, 0.408, 14], [0.757, 0.458, 0.7764, 0.4932, 30]]};
const RING = {center: [0.5054, 0.4761], radius: 0.358, band: 0.03};

function matte(src) {
  const W = src.width, H = src.height, N = W * H, px = src.rgba;
  // o creme: mediana de quatro cantos
  const corner = [];
  for (const [cx, cy] of [[0, 0], [W - 24, 0], [0, H - 24], [W - 24, H - 24]]) for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) corner.push((cy + y) * W + cx + x);
  const bg = [0, 1, 2].map(ch => { const v = corner.map(i => px[i * 4 + ch]).sort((a, b) => a - b); return v[v.length >> 1]; });
  const d = new Uint8Array(N);
  for (let i = 0; i < N; i++) d[i] = Math.max(Math.abs(px[i * 4] - bg[0]), Math.abs(px[i * 4 + 1] - bg[1]), Math.abs(px[i * 4 + 2] - bg[2]));
  const queue = new Int32Array(N);
  const neighbours = (i, fn) => {
    const x = i % W, y = (i / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H) fn(ny * W + nx);
    }
  };

  // a impressora: na caixa dela, o que a enchente de creme quase exato (vinda da borda da caixa) não alcança; só o pedaço
  // ligado ao corpo (as linhas de "som" e o círculo, que também caem na caixa, ficam de fora)
  const printer = new Uint8Array(N);
  {
    const [x0, y0, x1, y1] = PRINTER.box.map((v, k) => Math.round(v * (k % 2 ? H : W)));
    const inBox = i => { const x = i % W, y = (i / W) | 0; return x >= x0 && x <= x1 && y >= y0 && y <= y1; };
    const flooded = new Uint8Array(N); let head = 0, tail = 0;
    const push = i => { if (!flooded[i] && d[i] <= T_PRINTER) { flooded[i] = 1; queue[tail++] = i; } };
    for (let x = x0; x <= x1; x++) { push(y0 * W + x); push(y1 * W + x); }
    for (let y = y0; y <= y1; y++) { push(y * W + x0); push(y * W + x1); }
    while (head < tail) neighbours(queue[head++], j => { if (inBox(j)) push(j); });
    head = tail = 0;
    const seed = Math.round(PRINTER.seed[1] * H) * W + Math.round(PRINTER.seed[0] * W);
    if (flooded[seed]) throw new Error('printer seed is background');
    printer[seed] = 1; queue[tail++] = seed;
    while (head < tail) neighbours(queue[head++], j => { if (!printer[j] && !flooded[j] && inBox(j)) { printer[j] = 1; queue[tail++] = j; } });
    // o fundo cercado pelos cabos (o laço em cima e o vão entre a moldura, o cabo e o carretel) sai; o interior da moldura fica
    for (const [fx0, fy0, fx1, fy1, t] of PRINTER.loops) {
      for (let y = Math.round(fy0 * H); y <= Math.round(fy1 * H); y++) for (let x = Math.round(fx0 * W); x <= Math.round(fx1 * W); x++) if (d[y * W + x] <= t) printer[y * W + x] = 0;
    }
    // a sombra no chão, embaixo da base e do carretel: em cada coluna sai o que fica abaixo do último traço forte (d > 50)
    for (let x = x0; x <= x1; x++) {
      let low = -1;
      for (let y = y1; y >= Math.round(PRINTER.floor * H); y--) if (printer[y * W + x] && d[y * W + x] > 50) { low = y; break; }
      if (low >= 0) for (let y = low + 2; y <= y1; y++) printer[y * W + x] = 0;
    }
  }

  // fundo = creme/sombra (d ≤ T_BG) largo: abertura por reconstrução (erosão de OPEN px, depois de volta só por onde é creme)
  function background(passable) { return opening(passable, OPEN); }
  function opening(passable, radius) {
    const dist = new Uint8Array(N);
    for (let i = 0; i < N; i++) dist[i] = passable[i] ? 255 : 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {   // distância de Chebyshev até o que não é fundo (duas passadas)
      const i = y * W + x; if (!dist[i]) continue;
      let v = dist[i];
      if (x > 0) v = Math.min(v, dist[i - 1] + 1);
      if (y > 0) { v = Math.min(v, dist[i - W] + 1); if (x > 0) v = Math.min(v, dist[i - W - 1] + 1); if (x < W - 1) v = Math.min(v, dist[i - W + 1] + 1); }
      dist[i] = v;
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x; if (!dist[i]) continue;
      let v = dist[i];
      if (x < W - 1) v = Math.min(v, dist[i + 1] + 1);
      if (y < H - 1) { v = Math.min(v, dist[i + W] + 1); if (x < W - 1) v = Math.min(v, dist[i + W + 1] + 1); if (x > 0) v = Math.min(v, dist[i + W - 1] + 1); }
      dist[i] = v;
    }
    const removed = new Uint8Array(N), depth = new Uint8Array(N); let head = 0, tail = 0;
    for (let i = 0; i < N; i++) if (dist[i] > radius) { removed[i] = 1; queue[tail++] = i; }
    while (head < tail) {
      const i = queue[head++];
      if (depth[i] > radius) continue;
      neighbours(i, j => { if (!removed[j] && passable[j]) { removed[j] = 1; depth[j] = depth[i] + 1; queue[tail++] = j; } });
    }
    return removed;
  }
  const passable = new Uint8Array(N);
  for (let i = 0; i < N; i++) passable[i] = d[i] <= T_BG && !printer[i] ? 1 : 0;
  let removed = background(passable);

  // componentes do que ficou (8 vizinhos)
  function components(keep) {
    const label = new Int32Array(N).fill(-1), list = [];
    for (let s = 0; s < N; s++) {
      if (!keep[s] || label[s] >= 0) continue;
      const id = list.length, comp = {id, area: 0, x0: W, y0: H, x1: 0, y1: 0, pixels: null}; let head = 0, tail = 0;
      label[s] = id; queue[tail++] = s;
      while (head < tail) {
        const i = queue[head++], x = i % W, y = (i / W) | 0;
        comp.area++; if (x < comp.x0) comp.x0 = x; if (x > comp.x1) comp.x1 = x; if (y < comp.y0) comp.y0 = y; if (y > comp.y1) comp.y1 = y;
        neighbours(i, j => { if (keep[j] && label[j] < 0) { label[j] = id; queue[tail++] = j; } });
      }
      comp.pixels = Int32Array.from(queue.subarray(0, tail));
      list.push(comp);
    }
    return list;
  }
  const kept = new Uint8Array(N);
  for (let i = 0; i < N; i++) kept[i] = removed[i] ? 0 : 1;
  const comps = components(kept);

  // o círculo: ajuste (Kåsa) pelos pixels perto do círculo aproximado, fora da impressora
  let [cx, cy] = [RING.center[0] * W, RING.center[1] * H], r = RING.radius * W;
  {
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0, n = 0;
    for (let i = 0; i < N; i++) {
      if (!kept[i] || printer[i]) continue;
      const x = i % W, y = (i / W) | 0;
      if (Math.abs(Math.hypot(x - cx, y - cy) - r) > RING.band * W * 0.5) continue;
      const z = x * x + y * y;
      sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z; n++;
    }
    // resolve [sxx sxy sx; sxy syy sy; sx sy n]·[a b c] = [sxz syz sz] (x² + y² = a·x + b·y + c)
    const m = [[sxx, sxy, sx, sxz], [sxy, syy, sy, syz], [sx, sy, n, sz]];
    for (let k = 0; k < 3; k++) { for (let j = k + 1; j < 3; j++) { const f = m[j][k] / m[k][k]; for (let c = k; c < 4; c++) m[j][c] -= f * m[k][c]; } }
    const sol = [0, 0, 0];
    for (let k = 2; k >= 0; k--) { let v = m[k][3]; for (let c = k + 1; c < 3; c++) v -= m[k][c] * sol[c]; sol[k] = v / m[k][k]; }
    cx = sol[0] / 2; cy = sol[1] / 2; r = Math.sqrt(sol[2] + cx * cx + cy * cy);
  }
  // um arco do círculo: comprido (mais de 8% do quadro), quase todo sobre a circunferência e fino em volta dela (o círculo não é
  // perfeito: desvio de ~0,4%). As letras de "CRIATIVIDADE EM 3D" também seguem o círculo, mas cada uma é curta.
  const ring = [], specks = [];
  for (const comp of comps) {
    if (comp.area < 40) { specks.push(comp); continue; }
    let on = 0, sum = 0, sum2 = 0;
    for (const i of comp.pixels) { const v = Math.hypot(i % W - cx, ((i / W) | 0) - cy) - r; if (Math.abs(v) < 0.008 * W) on++; sum += v; sum2 += v * v; }
    const mean = sum / comp.area, sd = Math.sqrt(Math.max(0, sum2 / comp.area - mean * mean));
    if (Math.max(comp.x1 - comp.x0, comp.y1 - comp.y0) > 0.08 * W && on / comp.area > 0.85 && Math.abs(mean) < 0.006 * W && sd < 0.008 * W) ring.push(comp);
  }
  console.log(`creme ${bg.join(',')} · círculo centro ${(cx / W).toFixed(4)},${(cy / H).toFixed(4)} raio ${(r / W).toFixed(4)} · ${ring.length} arco(s) do círculo (${ring.map(c => c.area).join(', ')} px) · ${specks.length} pontinho(s) · ${comps.length - ring.length - specks.length} peças ficam`);
  if (!ring.length) throw new Error('the circle was not found');
  // o círculo e os pontinhos viram fundo (com a sombra em volta): de novo a abertura
  for (const comp of [...ring, ...specks]) for (const i of comp.pixels) { passable[i] = 1; neighbours(i, j => { if (!printer[j]) passable[j] = 1; }); }
  removed = background(passable);

  // borda: camadas de dentro (1..EDGE) e de fora (1..2); a cor da borda vem da camada mais funda
  const layer = new Int8Array(N);   // >0 dentro (camada), <0 fora, 0 longe da borda
  let head = 0, tail = 0;
  for (let i = 0; i < N; i++) if (!removed[i]) { let edge = false; neighbours(i, j => { if (removed[j]) edge = true; }); if (edge) { layer[i] = 1; queue[tail++] = i; } }
  while (head < tail) { const i = queue[head++]; if (layer[i] >= EDGE) continue; neighbours(i, j => { if (!removed[j] && !layer[j]) { layer[j] = layer[i] + 1; queue[tail++] = j; } }); }
  head = tail = 0;
  for (let i = 0; i < N; i++) if (removed[i]) { let edge = false; neighbours(i, j => { if (!removed[j]) edge = true; }); if (edge) { layer[i] = -1; queue[tail++] = i; } }
  while (head < tail) { const i = queue[head++]; if (layer[i] <= -2) continue; neighbours(i, j => { if (removed[j] && !layer[j]) { layer[j] = layer[i] - 1; queue[tail++] = j; } }); }
  const out = Buffer.from(px);
  const take = (i, from) => {   // média das vizinhas aceitas
    let r0 = 0, g0 = 0, b0 = 0, n = 0;
    neighbours(i, j => { if (from(j)) { r0 += out[j * 4]; g0 += out[j * 4 + 1]; b0 += out[j * 4 + 2]; n++; } });
    if (n) { out[i * 4] = Math.round(r0 / n); out[i * 4 + 1] = Math.round(g0 / n); out[i * 4 + 2] = Math.round(b0 / n); }
  };
  const deeper = k => j => !removed[j] && (layer[j] === 0 || layer[j] > k);
  for (let k = EDGE; k >= 1; k--) for (let i = 0; i < N; i++) if (layer[i] === k) take(i, deeper(k));
  for (let i = 0; i < N; i++) if (layer[i] === -1) take(i, j => !removed[j]);
  for (let i = 0; i < N; i++) if (layer[i] === -2) take(i, j => layer[j] === -1);
  // alfa: o recorte com um desfoque binomial 3x3 (a borda antisserrilhada; a redução para 2048 completa)
  const hard = new Uint8Array(N);
  for (let i = 0; i < N; i++) hard[i] = removed[i] ? 0 : 255;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!layer[i]) { out[i * 4 + 3] = hard[i]; continue; }
    let sum = 0, wsum = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const w = (dx ? 1 : 2) * (dy ? 1 : 2); sum += hard[ny * W + nx] * w; wsum += w;
    }
    out[i * 4 + 3] = Math.round(sum / wsum);
  }
  for (let i = 0; i < N; i++) if (!out[i * 4 + 3]) out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = 0;
  return {width: W, height: H, rgba: out};
}

// ── 2) arquivos do site ──────────────────────────────────────────────────────────────────────────────────────────────
const LOGO_SIZE = 1024;
const LOGO_MARGIN = 0.04;                                  // folga em volta da escrita, de cada lado
const MARK_BOX = [0.216, 0.225, 0.548, 0.470];             // o "Ju," (sem a estrelinha à esquerda nem o pingo do "i")
const OUTLINE = [0x9e, 0x3a, 0x55];                        // rosa-escuro do contorno (um tom abaixo do --rose #b64c68 da loja)
const APPLE_BG = [0xff, 0xf7, 0xf2];                       // o creme do logo
// tamanho → [folga de cada lado (fração), contorno (px no tamanho final), reforço do alfa]
const ICONS = {16: [0, 1, 1.35], 32: [0.02, 1.4, 1.2], 48: [0.03, 1.9, 1.1], 180: [0.15, 4, 1], 192: [0.06, 4.5, 1], 512: [0.06, 11, 1]};

function crop({width, height, rgba}, x0, y0, x1, y1) {
  const w = x1 - x0, h = y1 - y0, out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x + x0, sy = y + y0;
    if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
    rgba.copy(out, (y * w + x) * 4, (sy * width + sx) * 4, (sy * width + sx) * 4 + 4);
  }
  return {width: w, height: h, rgba: out};
}
function bounds({width, height, rgba}, min = 8) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (rgba[(y * width + x) * 4 + 3] > min) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1 + 1, y1 + 1];
}
// a imagem centrada num quadrado com folga (fração de cada lado)
function squared(image, margin) {
  const [x0, y0, x1, y1] = bounds(image), w = x1 - x0, h = y1 - y0, side = Math.ceil(Math.max(w, h) / (1 - 2 * margin));
  const ox = Math.round(x0 - (side - w) / 2), oy = Math.round(y0 - (side - h) / 2);
  return crop(image, ox, oy, ox + side, oy + side);
}

// a marca: só os componentes cuja caixa cabe em MARK_BOX
function mark(master) {
  const {width: W, height: H, rgba} = master, N = W * H;
  const [bx0, by0, bx1, by1] = [MARK_BOX[0] * W, MARK_BOX[1] * H, MARK_BOX[2] * W, MARK_BOX[3] * H];
  const label = new Int32Array(N).fill(-1), keep = new Uint8Array(N), queue = new Int32Array(N);
  const picked = [];
  for (let s = 0; s < N; s++) {
    if (rgba[s * 4 + 3] <= 8 || label[s] >= 0) continue;
    let head = 0, tail = 0, x0 = W, y0 = H, x1 = 0, y1 = 0; label[s] = s; queue[tail++] = s;
    while (head < tail) {
      const i = queue[head++], x = i % W, y = (i / W) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, j = ny * W + nx;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && label[j] < 0 && rgba[j * 4 + 3] > 8) { label[j] = s; queue[tail++] = j; }
      }
    }
    if (x0 >= bx0 && y0 >= by0 && x1 <= bx1 && y1 <= by1 && tail > 200) { picked.push(`${tail} px em ${(x0 / W).toFixed(3)},${(y0 / H).toFixed(3)}`); for (let k = 0; k < tail; k++) keep[queue[k]] = 1; }
  }
  // a franja (alfa ≤ 8) junto do que ficou também fica
  const out = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) {
    let near = keep[i];
    if (!near && rgba[i * 4 + 3]) { const x = i % W, y = (i / W) | 0; for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < H && keep[ny * W + nx]) { near = 1; break; } } }
    if (near) rgba.copy(out, i * 4, i * 4, i * 4 + 4);
  }
  console.log(`marca "Ju,": ${picked.length} peças (${picked.join('; ')})`);
  if (picked.length !== 3) throw new Error(`the mark should be J, u and the comma (found ${picked.length})`);
  const image = {width: W, height: H, rgba: out}, [x0, y0, x1, y1] = bounds(image);
  return crop(image, x0, y0, x1, y1);
}

// distância euclidiana (aprox.) até a forma, para o contorno: chanfro 3-4
function outlineAlpha({width: W, height: H, rgba}, radius) {
  const N = W * H, INF = 1e9, dist = new Float32Array(N);
  for (let i = 0; i < N; i++) dist[i] = rgba[i * 4 + 3] >= 128 ? 0 : INF;
  const pass = (y, x, dx, dy, c) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < W && ny < H ? dist[ny * W + nx] + c : INF; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; dist[i] = Math.min(dist[i], pass(y, x, -1, 0, 1), pass(y, x, 0, -1, 1), pass(y, x, -1, -1, Math.SQRT2), pass(y, x, 1, -1, Math.SQRT2)); }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; dist[i] = Math.min(dist[i], pass(y, x, 1, 0, 1), pass(y, x, 0, 1, 1), pass(y, x, 1, 1, Math.SQRT2), pass(y, x, -1, 1, Math.SQRT2)); }
  const out = new Uint8Array(N);
  for (let i = 0; i < N; i++) out[i] = Math.round(255 * Math.max(0, Math.min(1, radius + 0.5 - dist[i])));
  return out;
}

// um ícone: a marca centrada (folga), o contorno por baixo, reduzida por área e com o alfa reforçado nos tamanhos pequenos
function icon(markImage, size, {background = null} = {}) {
  const [margin, outlinePx, boost] = ICONS[size];
  const scale = 8;                                           // desenha a 8x do tamanho final e reduz
  const hi = size * scale, inner = hi * (1 - 2 * margin) - 2 * outlinePx * scale;
  const k = inner / Math.max(markImage.width, markImage.height);
  const w = Math.round(markImage.width * k), h = Math.round(markImage.height * k);
  const fitted = resize(markImage, w, h);
  const canvas = {width: hi, height: hi, rgba: Buffer.alloc(hi * hi * 4)};
  const ox = Math.round((hi - w) / 2), oy = Math.round((hi - h) / 2);
  for (let y = 0; y < h; y++) fitted.rgba.copy(canvas.rgba, ((y + oy) * hi + ox) * 4, y * w * 4, (y + 1) * w * 4);
  const ring = outlineAlpha(canvas, outlinePx * scale);
  const out = Buffer.alloc(hi * hi * 4);
  for (let i = 0; i < hi * hi; i++) {   // a marca sobre o contorno (operação "over")
    const fa = canvas.rgba[i * 4 + 3] / 255, oa = ring[i] / 255, a = fa + oa * (1 - fa);
    if (!a) continue;
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round((canvas.rgba[i * 4 + c] * fa + OUTLINE[c] * oa * (1 - fa)) / a);
    out[i * 4 + 3] = Math.round(a * 255);
  }
  const small = resize({width: hi, height: hi, rgba: out}, size);
  if (boost !== 1) for (let i = 0; i < size * size; i++) { const a = small.rgba[i * 4 + 3] / 255; small.rgba[i * 4 + 3] = Math.round(255 * Math.max(0, Math.min(1, (a - 0.5) * boost + 0.5))); }
  if (background) for (let i = 0; i < size * size; i++) {
    const a = small.rgba[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) small.rgba[i * 4 + c] = Math.round(small.rgba[i * 4 + c] * a + background[c] * (1 - a));
    small.rgba[i * 4 + 3] = 255;
  }
  return small;
}

async function webp(png, quality) {
  const {withBrowser} = require('./render-aviao-macaco/cdp.cjs');
  let result;
  await withBrowser(async b => {
    const src = `data:image/png;base64,${png.toString('base64')}`;
    result = await b.eval(`new Promise((resolve, reject) => { const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); resolve(c.toDataURL('image/webp', ${quality})); }; img.onerror = reject; img.src = ${JSON.stringify(src)}; })`);
  }, {port: 9341});
  return Buffer.from(result.split(',')[1], 'base64');
}

async function build() {
  const master = decode(fs.readFileSync(MASTER));
  const write = (rel, buffer) => { fs.writeFileSync(path.join(DIST, rel), buffer); console.log(`dist/${rel}: ${(buffer.length / 1024).toFixed(1)} KB`); };
  // o logo: a escrita centrada num quadrado de 1024 px
  const logo = resize(squared(master, LOGO_MARGIN), LOGO_SIZE);
  const logoPng = encode(logo);
  write('assets/logo-ju-transparente.png', logoPng);
  write('assets/logo-ju-transparente.webp', await webp(logoPng, 0.9));
  // os ícones
  const ju = mark(master);
  const icons = Object.fromEntries(Object.keys(ICONS).map(size => [size, icon(ju, Number(size), Number(size) === 180 ? {background: APPLE_BG} : {})]));
  write('favicon.ico', ico([icons[16], icons[32], icons[48]]));
  write('favicon-48.png', encode(icons[48]));
  write('icon-192.png', encode(icons[192]));
  write('icon-512.png', encode(icons[512]));
  write('apple-touch-icon.png', encode(icons[180], {opaque: true}));
  const eol = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8').includes('\r\n') ? '\r\n' : '\n';
  write('favicon.svg', Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 192 192"><image width="192" height="192" xlink:href="data:image/png;base64,${encode(icons[192]).toString('base64')}"/></svg>${eol}`));
}

if (require.main === module) {
  const at = process.argv.indexOf('--matte');
  if (at > 0) {
    const big = decode(fs.readFileSync(process.argv[at + 1]));
    console.log(`ampliação ${big.width} px → recorte em ${WORK} px`);
    const cut = matte(big.width === WORK ? big : resize(big, WORK));
    fs.mkdirSync(path.dirname(MASTER), {recursive: true});
    fs.writeFileSync(MASTER, encode(resize(cut, WORK / 2)));
    console.log(`${path.relative(ROOT, MASTER)}: ${(fs.statSync(MASTER).size / 1024).toFixed(0)} KB`);
  } else build().catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = {matte, mark, icon, squared, ICONS, MARK_BOX};
