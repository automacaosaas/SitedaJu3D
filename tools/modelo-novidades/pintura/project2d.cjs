// Small front details painted from the relief itself, in a front height map (depth.cjs):
//   bump   (nostril): marker-controlled watershed on −h — the inside floods down from the top of the bump, the outside from the
//          surface around it, and they meet in the valley at the foot of the bump (its crease);
//   groove (smile):   the pixels where h is below `level` along the old painted line (the groove itself), widened by `grow` px.
// The mask is then blurred (smooth outline) and sampled at the vertices that the front view sees: M(v) in [0, 1].
const D = require('./depth.cjs');

class Heap { constructor() { this.k = []; this.v = []; }
  push(key, val) { const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val); while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; } k[i] = key; v[i] = val; }
  pop() { const k = this.k, v = this.v, top = v[0], lk = k.pop(), lv = v.pop(); if (k.length) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= k.length) break; if (c + 1 < k.length && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; } k[i] = lk; v[i] = lv; } return top; }
  get size() { return this.k.length; } }

function frame(m) { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let v = 0; v < m.nv; v++) for (let j = 0; j < 3; j++) { lo[j] = Math.min(lo[j], m.P[v * 3 + j]); hi[j] = Math.max(hi[j], m.P[v * 3 + j]); } const s = 4.1 / (hi[1] - lo[1]), ctr = lo.map((v, j) => (v + hi[j]) / 2); return {s, ctr, lo, toLocalBox: rb => [rb[0] / s + ctr[0], (rb[1] + 1.9) / s + lo[1], rb[2] / s + ctr[0], (rb[3] + 1.9) / s + lo[1]]}; }

// texture mask of label k in the map (pixel's face has label k)
const texMask = (map, label, k) => { const t = new Uint8Array(map.W * map.H); for (let i = 0; i < t.length; i++) t[i] = map.FID[i] >= 0 && label[map.FID[i]] === k ? 1 : 0; return t; };
function dilate(mask, W, H, r) { let a = mask; for (let it = 0; it < r; it++) { const b = Uint8Array.from(a); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (a[i]) continue; if ((x > 0 && a[i - 1]) || (x < W - 1 && a[i + 1]) || (y > 0 && a[i - W]) || (y < H - 1 && a[i + W])) b[i] = 1; } a = b; } return a; }
function erode(mask, W, H, r) { const inv = mask.map(v => 1 - v); return dilate(inv, W, H, r).map(v => 1 - v); }
function components(mask, W, H) { const id = new Int32Array(W * H).fill(-1), sizes = []; for (let s = 0; s < W * H; s++) { if (!mask[s] || id[s] >= 0) continue; const k = sizes.length, q = [s]; id[s] = k; for (let i = 0; i < q.length; i++) { const p = q[i], x = p % W, y = (p - x) / W; for (const n of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) if (n >= 0 && mask[n] && id[n] < 0) { id[n] = k; q.push(n); } } sizes.push(q.length); } return {id, sizes}; }

function bumpMask(map, h, valid, tex, o) {
  const {W, H} = map, N = W * H;
  // inside markers: the top `top` fraction of h inside the eroded texture blob; outside: farther than `far` px from the blob
  const core = erode(tex, W, H, o.erode ?? 3), vals = []; for (let i = 0; i < N; i++) if (core[i] && valid[i]) vals.push(h[i]); vals.sort((a, b) => a - b);
  const thr = vals[Math.floor(vals.length * (1 - (o.top ?? .3)))] ?? Infinity, near = dilate(tex, W, H, o.far ?? 25);
  const lab = new Int8Array(N).fill(-1), heap = new Heap();
  const border = i => { const x = i % W, y = (i - x) / W; return x < 2 || y < 2 || x > W - 3 || y > H - 3; };
  for (let i = 0; i < N; i++) { if (!valid[i]) { lab[i] = 0; continue; } if (core[i] && h[i] >= thr) { lab[i] = 1; heap.push(-h[i], i); } else if (!near[i] || border(i)) { lab[i] = 0; heap.push(-h[i], i); } }
  while (heap.size) { const p = heap.pop(), x = p % W, y = (p - x) / W; for (const n of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) if (n >= 0 && lab[n] < 0) { lab[n] = lab[p]; heap.push(-h[n], n); } }
  const mask = new Uint8Array(N); for (let i = 0; i < N; i++) mask[i] = lab[i] === 1 ? 1 : 0;
  return mask;
}
function curveMask(map, h, valid, tex, o) {
  const {W, H} = map, mask = new Uint8Array(W * H), r = (o.width ?? 10) / 2;
  for (const [cx, cy] of curvePoints(map, h, valid, tex, o)) { for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) { if (x < 0 || y < 0 || x >= W || y >= H) continue; if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) mask[y * W + x] = 1; } }
  return mask;
}
// the bottom of the groove as points [x, y] (px), one per column
function curvePoints(map, h, valid, tex, o) {
  const {W, H} = map, N = W * H; let x0 = W, x1 = -1;
  for (let i = 0; i < N; i++) if (tex[i]) { const x = i % W; x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  // tracking: start at the deepest point of the valley inside the painted band, then follow it column by column, looking only
  // ±step px from the previous row, while it stays a valley (h below endLevel)
  let sx = -1, sy = -1, sh = Infinity; for (let i = 0; i < N; i++) if (valid[i] && tex[i] && h[i] < sh) { sh = h[i]; sx = i % W; sy = (i - sx) / W; }
  const follow = dir => { const out = []; let y = sy; for (let x = sx + dir; x >= 0 && x < W; x += dir) { let best = Infinity, by = -1; for (let yy = Math.max(0, y - (o.step ?? 3)); yy <= Math.min(H - 1, y + (o.step ?? 3)); yy++) { const i = yy * W + x; if (valid[i] && h[i] < best) { best = h[i]; by = yy; } } if (by < 0 || best > (o.endLevel ?? 0) || x < x0 - (o.extend ?? 20) || x > x1 + (o.extend ?? 20)) break; out.push([x, by, best]); y = by; } return out; };
  const run = [...follow(-1).reverse(), [sx, sy, sh], ...follow(1)];
  // "fit": the valley points fitted by a polynomial of that degree (least squares): a regular curve, as modelled (the tracking jitters
  // by a pixel or two); without it, a moving average
  let ys;
  if (o.fit) { const d = o.fit, n = d + 1, X0 = run.reduce((a, p) => a + p[0], 0) / run.length, sc = run.length / 2 || 1, A = Array.from({length: n}, () => new Float64Array(n + 1));
    for (const p of run) { const t = (p[0] - X0) / sc, pw = Array.from({length: n}, (_, i) => t ** i); for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) A[i][j] += pw[i] * pw[j]; A[i][n] += pw[i] * p[1]; } }
    for (let i = 0; i < n; i++) { let piv = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r; [A[i], A[piv]] = [A[piv], A[i]]; for (let r = 0; r < n; r++) if (r !== i) { const k = A[r][i] / A[i][i]; for (let c = i; c <= n; c++) A[r][c] -= k * A[i][c]; } }
    const coef = A.map((row, i) => row[n] / row[i]); ys = run.map(p => { const t = (p[0] - X0) / sc; return coef.reduce((a, c, i) => a + c * t ** i, 0); });
    // trim: the ends of the groove, where the valley fades, are cut by trim px on each side (the painted line stops inside the groove)
    if (o.trim) { run.splice(0, o.trim); ys.splice(0, o.trim); run.splice(-o.trim); ys.splice(-o.trim); }
  } else { const win = o.window ?? 15; ys = run.map((p, i) => { let s = 0, n = 0; for (let j = Math.max(0, i - win); j <= Math.min(run.length - 1, i + win); j++) { s += run[j][1]; n++; } return s / n; }); }
  return run.map((p, i) => [p[0], ys[i]]);
}
// raised lines (the unicorn's closed eyes and lashes): the pixels above a level along the painted line; level = levelFrac × the 90th
// percentile of the relief inside the painted pixels
function ridgeMask(map, h, valid, tex, o) {
  const {W, H} = map, N = W * H, near = dilate(tex, W, H, o.near ?? 10), vals = [];
  for (let i = 0; i < N; i++) if (tex[i] && valid[i]) vals.push(h[i]); vals.sort((a, b) => a - b);
  const level = o.level ?? (o.levelFrac ?? .3) * (vals[Math.floor(vals.length * .9)] || 0), m0 = new Uint8Array(N);
  for (let i = 0; i < N; i++) m0[i] = valid[i] && near[i] && h[i] > level ? 1 : 0;
  const {id, sizes} = components(m0, W, H), big = Math.max(...sizes); for (let i = 0; i < N; i++) if (m0[i] && sizes[id[i]] < (o.keep ?? .05) * big) m0[i] = 0;
  return o.grow ? dilate(m0, W, H, o.grow) : m0;
}
// the ellipse with the same area and second moments as the largest blob of a mask, scaled by k (round details become regular ovals)
function ellipseOf(mask, W, H, k) {
  const {id, sizes} = components(mask, W, H); if (!sizes.length) return mask;
  const best = sizes.indexOf(Math.max(...sizes)); let n = 0, mx = 0, my = 0;
  for (let i = 0; i < W * H; i++) if (id[i] === best) { n++; mx += i % W; my += (i - i % W) / W; } mx /= n; my /= n;
  let sxx = 0, syy = 0, sxy = 0; for (let i = 0; i < W * H; i++) if (id[i] === best) { const dx = i % W - mx, dy = (i - i % W) / W - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  sxx /= n; syy /= n; sxy /= n; const tr = sxx + syy, det = sxx * syy - sxy * sxy, l1 = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - det)), l2 = tr / 2 - Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const ang = Math.atan2(l1 - sxx, sxy || 1e-9), a = 2 * Math.sqrt(l1) * k, b = 2 * Math.sqrt(Math.max(l2, 1e-6)) * k, ca = Math.cos(ang), sa = Math.sin(ang), out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const dx = x - mx, dy = y - my, u = dx * ca + dy * sa, v = -dx * sa + dy * ca; if ((u / a) ** 2 + (v / b) ** 2 <= 1) out[y * W + x] = 1; }
  return out;
}
function grooveMask(map, h, valid, tex, o) {
  const {W, H} = map, N = W * H, near = dilate(tex, W, H, o.near ?? 12), m0 = new Uint8Array(N);
  for (let i = 0; i < N; i++) m0[i] = valid[i] && near[i] && h[i] < o.level ? 1 : 0;
  // keep the largest pieces (the groove), drop specks
  const {id, sizes} = components(m0, W, H), big = Math.max(...sizes); for (let i = 0; i < N; i++) if (m0[i] && sizes[id[i]] < (o.keep ?? .15) * big) m0[i] = 0;
  return o.grow ? dilate(m0, W, H, o.grow) : m0;
}

// target: {box (render), mode, sigma (render), res (px per render unit), smoothPx, ...}; returns Map vertex → M, and the map
function projectTarget(m, label, k, target) {
  const fr = frame(m), box = fr.toLocalBox(target.box), res = 1 / ((target.res ?? 1100) * fr.s);
  const map = D.rasterize(m, box, res), {h, valid} = D.highpass(map, (target.sigma ?? .04) / (res * fr.s));
  const tex = texMask(map, label, k);
  let mask = target.mode === 'curve' ? curveMask(map, h, valid, tex, target) : target.mode === 'groove' ? grooveMask(map, h, valid, tex, target) : target.mode === 'ridge' ? ridgeMask(map, h, valid, tex, target) : bumpMask(map, h, valid, tex, target);
  if (target.ellipse) mask = ellipseOf(mask, map.W, map.H, target.ellipse);
  // each separate blob of the texture gets its own bump: run per blob when asked
  const soft = D.blur(Float32Array.from(mask), map.W, map.H, target.smoothPx ?? 3);
  const M = new Map(), tol = target.tol ?? 3 * res;
  for (let v = 0; v < m.nv; v++) {
    const x = (m.P[v * 3] - box[0]) / res - .5, y = (m.P[v * 3 + 1] - box[1]) / res - .5; if (x < 1 || y < 1 || x > map.W - 2 || y > map.H - 2) continue;
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, i = yi * map.W + xi;
    const zmap = Math.max(map.Z[i], map.Z[i + 1], map.Z[i + map.W], map.Z[i + map.W + 1]); if (!(m.P[v * 3 + 2] >= zmap - tol)) continue; // not seen from the front
    const val = soft[i] * (1 - fx) * (1 - fy) + soft[i + 1] * fx * (1 - fy) + soft[i + map.W] * (1 - fx) * fy + soft[i + map.W + 1] * fx * fy;
    M.set(v, val);
  }
  return {M, map, mask, soft, h, tex};
}
// Seeded regions: watershed on −h from seed points (render x, y) each with a colour; the colours meet in the valleys between the
// bumps (the mane's locks, the rainbow and the clouds). Returns, per face seen from the front inside the box, its new colour.
function seedRegions(m, label, region, names) {
  const fr = frame(m), box = fr.toLocalBox(region.box), res = 1 / ((region.res ?? 900) * fr.s);
  const map = D.rasterize(m, box, res), {h, valid} = D.highpass(map, (region.sigma ?? .03) / (res * fr.s)), {W, H} = map, N = W * H;
  const lab = new Int32Array(N).fill(-1), heap = new Heap();
  if (region.superpixels) {
    const r = region.superpixels, seeds = region.seeds = [...(region.seeds || [])];
    for (let y = r; y < H - r; y += 1) for (let x = r; x < W - r; x += 1) { const i = y * W + x; if (!valid[i]) continue; let isMax = true;
      for (let dy = -r; dy <= r && isMax; dy++) for (let dx = -r; dx <= r; dx++) { const j = i + dy * W + dx; if (j !== i && valid[j] && (h[j] > h[i] || (h[j] === h[i] && j < i))) { isMax = false; break; } }
      if (isMax) seeds.push({px: [x, y], name: 'auto', r: 0}); }
  }
  region.seeds.forEach((sd, k) => {
    if (sd.px) { const i = sd.px[1] * W + sd.px[0]; lab[i] = k; heap.push(-h[i], i); return; }
    if (sd.name !== 'auto' && names.indexOf(sd.name) < 0) throw new Error('cor ' + sd.name);
    const lx = sd.at[0] / fr.s + fr.ctr[0], ly = (sd.at[1] + 1.9) / fr.s + fr.lo[1], r = sd.r ?? 4;
    let cx = Math.round((lx - box[0]) / res), cy = Math.round((ly - box[1]) / res);
    // "snap": the seed moves to the highest point within that many px (a seed in the dip between two lobes of a cloud would lose
    // the lobes to the next colour)
    if (sd.snap) { let best = -Infinity, bx = cx, by = cy; for (let y = cy - sd.snap; y <= cy + sd.snap; y++) for (let x = cx - sd.snap; x <= cx + sd.snap; x++) { if (x < 0 || y < 0 || x >= W || y >= H) continue; const i = y * W + x; if (valid[i] && h[i] > best) { best = h[i]; bx = x; by = y; } } cx = bx; cy = by; }
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) { if (x < 0 || y < 0 || x >= W || y >= H) continue; const i = y * W + x; if (!valid[i]) continue; lab[i] = k; heap.push(-h[i], i); }
  });
  while (heap.size) { const p = heap.pop(), x = p % W, y = (p - x) / W; for (const n of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) if (n >= 0 && valid[n] && lab[n] < 0) { lab[n] = lab[p]; heap.push(-h[n], n); } }
  // colour of each basin
  const autoSet = new Set((region.auto || names).map(n => names.indexOf(n))), votes = region.seeds.map(() => new Float64Array(names.length));
  for (let i = 0; i < N; i++) if (lab[i] >= 0 && map.FID[i] >= 0 && autoSet.has(label[map.FID[i]])) votes[lab[i]][label[map.FID[i]]]++;
  const colourOf = region.seeds.map((sd, k) => sd.name !== 'auto' ? names.indexOf(sd.name) : votes[k].indexOf(Math.max(...votes[k])));
  if (process.env.DEBUG_REGION) console.log('basins', region.seeds.map((sd, k) => `${sd.at}:${names[colourOf[k]]}`).join(' '));
  if (!process.env.BASINS) for (let i = 0; i < N; i++) if (lab[i] >= 0) lab[i] = colourOf[lab[i]];
  const out = new Map(), only = region.only ? new Set(region.only.map(n => names.indexOf(n))) : null, tol = region.tol ?? 3 * res;
  for (let f = 0; f < m.nf; f++) {
    if (only && !only.has(label[f])) continue;
    let cx = 0, cy = 0, cz = 0; for (let c = 0; c < 3; c++) { const v = m.F[f * 3 + c]; cx += m.P[v * 3] / 3; cy += m.P[v * 3 + 1] / 3; cz += m.P[v * 3 + 2] / 3; }
    const x = Math.floor((cx - box[0]) / res), y = Math.floor((cy - box[1]) / res); if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const i = y * W + x; if (lab[i] < 0 || !(cz >= map.Z[i] - tol)) continue;
    if (region.polygon) { let inside = false; const rx = (cx - fr.ctr[0]) * fr.s, ry = (cy - fr.lo[1]) * fr.s - 1.9, P = region.polygon; for (let a = 0, b = P.length - 1; a < P.length; b = a++) if ((P[a][1] > ry) !== (P[b][1] > ry) && rx < (P[b][0] - P[a][0]) * (ry - P[a][1]) / (P[b][1] - P[a][1]) + P[a][0]) inside = !inside; if (!inside) continue; }
    out.set(f, lab[i]);
  }
  return {out, map, lab};
}
module.exports = {projectTarget, frame, seedRegions, curvePoints};
