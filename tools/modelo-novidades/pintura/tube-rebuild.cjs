// The giraffe's neck rebuilt smooth (08/10/2026, the gallery's zoom: "linhas claras entre as pintas… pintas com borda deformada ou
// manchada… emenda/sombra estranha logo abaixo do focinho"). The Rodin mesh of the neck is a dented tube with long needle triangles on
// the coat (their shading drew light streaks between the spots) and spots with wavy walls and noisy tops. Here it becomes the shape it
// was meant to be:
//   tube   the bare tube's own surface, a smooth radius R(θ, y) (degree `deg` in y × `harm` harmonics in θ) fitted to the coat;
//   spots  each spot found where the surface stands above the tube (e > `t`), its outline (the foot of the wall) smoothed (the first
//          `harmonics` of the radius around its centre: the same shape, without the wobble), and the relief rebuilt from the distance
//          to that outline: a steep wall that rounds into a flat top, the same height `height` for every spot;
//   mesh   edges are split until the flat triangles follow that surface within `tol` (render units): fine at the walls, coarse on the
//          coat and the tops (surface-rebuild.cjs); every vertex then moves along the radius onto the surface, with its own normal;
//   paint  the spots' brown exactly over their relief (s > 0: the whole raised part), the coat's yellow around — an override in the
//          format of exact.cjs, so crisp.cjs cuts the triangles along the outline.
// The rebuilt tube ends below the flare of the head (the foot of the flare per angle, `yF(θ)`, found in the geometry), above the
// rounded bottom (`yMin`) and before the slot at the back (`theta`), blending into the original surface over a short band. Two more
// parts run later, from lamp-fix.cjs, once the colours are settled (smoothing near the muzzle earlier merged its crease patches):
//   band   the flare itself, where the neck meets the head, smoothed (runBand);
//   cheeks the spots on the head's sides rebuilt like the neck's, on a smooth local surface (runCheeks).
// Every option is in render units (height 4.1, floor at −1.9, centred), like the viewer.
const P2 = require('./project2d.cjs');
const {fit, contour} = require('./exact.cjs');
const {refineMove, simplifyInside} = require('./surface-rebuild.cjs');

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// A x = b for a symmetric positive definite A (rows of Float64Array): Cholesky
function cholSolve(A, b) {
  const n = b.length, L = A.map(r => Float64Array.from(r));
  for (let j = 0; j < n; j++) { let d = L[j][j]; for (let k = 0; k < j; k++) d -= L[j][k] * L[j][k]; d = Math.sqrt(Math.max(d, 1e-18)); L[j][j] = d;
    for (let i = j + 1; i < n; i++) { let v = L[i][j]; for (let k = 0; k < j; k++) v -= L[i][k] * L[j][k]; L[i][j] = v / d; } }
  const y = new Float64Array(n); for (let i = 0; i < n; i++) { let v = b[i]; for (let k = 0; k < i; k++) v -= L[i][k] * y[k]; y[i] = v / L[i][i]; }
  const x = new Float64Array(n); for (let i = n - 1; i >= 0; i--) { let v = y[i]; for (let k = i + 1; k < n; k++) v -= L[k][i] * x[k]; x[i] = v / L[i][i]; }
  return x;
}
// uniform cubic B-splines: the nonzero ones at x, [index, value] (knots x0 + i·h, n functions)
const b3 = t => t <= 0 || t >= 4 ? 0 : t < 1 ? t * t * t / 6 : t < 2 ? (-3 * t * t * t + 12 * t * t - 12 * t + 4) / 6 : t < 3 ? (3 * t * t * t - 24 * t * t + 60 * t - 44) / 6 : (4 - t) ** 3 / 6;
const spl = (x, x0, h, n) => { const out = []; const i0 = Math.floor((x - x0) / h) - 3; for (let i = Math.max(0, i0); i <= Math.min(n - 1, i0 + 3); i++) { const v = b3((x - x0) / h - i); if (v > 0) out.push([i, v]); } return out; };
// a smooth surface r(a, b) = Σ c_ij B_i(a) B_j(b) over [a0, a1] × [b0, b1] (knots ha, hb) fitted to points [a, b, r]: second differences
// along both as a penalty (`smoothing`, per data point), robust (points off the surface by more than `drop` leave the fit, `iters` times)
function splineSurface(pts, {a0, a1, b0, b1, ha, hb, smoothing = .05, drop = .006, iters = 3}) {
  const nA = Math.ceil((a1 - a0) / ha) + 6, nB = Math.ceil((b1 - b0) / hb) + 6, tA = a0 - 3 * ha, tB = b0 - 3 * hb, NU = nA * nB;
  const rows = pts.map(([a, b]) => { const row = []; for (const [i, vi] of spl(a, tA, ha, nA)) for (const [j, vj] of spl(b, tB, hb, nB)) row.push([i * nB + j, vi * vj]); return row; });
  const ys = pts.map(p => p[2]), mean = ys.reduce((p, q) => p + q, 0) / (ys.length || 1); let c = null, use = ys.map(() => true);
  const at = q => { let v = 0; for (const [i, w] of rows[q]) v += c[i] * w; return v; };
  for (let it = 0; it < iters; it++) {
    const A = Array.from({length: NU}, () => new Float64Array(NU)), rhs = new Float64Array(NU); let n = 0;
    for (let q = 0; q < rows.length; q++) { if (!use[q]) continue; n++; for (const [i, vi] of rows[q]) { rhs[i] += vi * ys[q]; for (const [j, vj] of rows[q]) A[i][j] += vi * vj; } }
    const lam = smoothing * n / NU, pen = (i, j, k) => { const idx = [i, j, k], cf = [1, -2, 1]; for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) A[idx[p]][idx[q]] += lam * cf[p] * cf[q]; };
    for (let i = 0; i < nA; i++) for (let j = 0; j < nB; j++) { if (i > 0 && i < nA - 1) pen((i - 1) * nB + j, i * nB + j, (i + 1) * nB + j); if (j > 0 && j < nB - 1) pen(i * nB + j - 1, i * nB + j, i * nB + j + 1); A[i * nB + j][i * nB + j] += 1e-6 * lam; rhs[i * nB + j] += 1e-6 * lam * mean; }
    c = cholSolve(A, rhs); use = ys.map((r, q) => Math.abs(r - at(q)) < drop);
  }
  let rms = 0, nUse = 0; for (let q = 0; q < rows.length; q++) if (use[q]) { rms += (at(q) - ys[q]) ** 2; nUse++; }
  const f = (a, b) => { let v = 0; for (const [i, vi] of spl(a, tA, ha, nA)) for (const [j, vj] of spl(b, tB, hb, nB)) v += c[i * nB + j] * vi * vj; return v; };
  return {f, rms: Math.sqrt(rms / (nUse || 1)), used: nUse, unknowns: NU};
}
// the relief of a spot from the signed distance to its outline: a steep wall (w1) that rounds into the top (w2), height `height`; the
// foot rounded by a Gaussian of `fillet` (a crease there drew light slivers on the coat: the triangles across it mixed the wall's normal
// into the coat's), 7-point Gauss–Hermite
const GHQ = [[0, .8102646175568073], [.8162878828589647, .4256072526101278], [-.8162878828589647, .4256072526101278], [1.6735516287674714, .05451558281912703], [-1.6735516287674714, .05451558281912703], [2.651961356835233, .0009717812450995192], [-2.651961356835233, .0009717812450995192]];
function spotProfile(o) {
  const Hs = o.height ?? .028, al = o.alpha ?? .5, w1 = o.w1 ?? .008, w2 = o.w2 ?? .05, fil = o.fillet ?? .0012;
  const prof0 = sd => sd <= 0 ? 0 : Hs * (al * (1 - (1 - Math.min(1, sd / w1)) ** 2) + (1 - al) * (1 - (1 - Math.min(1, sd / w2)) ** 2));
  return sd => { if (!fil || sd > 4 * fil || sd < -4 * fil) return prof0(sd); let acc = 0; for (const [x, wq] of GHQ) acc += wq * prof0(sd + fil * Math.SQRT2 * x); return acc / Math.sqrt(Math.PI); };
}
// The spots over an unwrapped cylindrical patch: e = r − base(θ, y) rasterized over u = θ·R0 ∈ [uLo, uHi], y ∈ [yLo, yHi] (px `px`);
// spots = components of e > t that `allow(u, y)`; along each ray from a spot's centre, the last pixel of it (a dip inside does not end
// it) and the crossing of t just past it; the outline smoothed (Lanczos-damped harmonics) and pushed out by `foot`. Returns the spots
// and sdf(u, y): the signed distance to the nearest outline (positive inside), clamped to ±reach — a grid of exact distances to the
// outline polygons, read bilinearly.
function findSpots(m, {cyl, base, R0, uLo, uHi, yLo, yHi, rMin, rMax, allow, o, debug}) {
  const S = o.px ?? .002, W = Math.ceil((uHi - uLo) / S), H = Math.ceil((yHi - yLo) / S), E = new Float32Array(W * H).fill(NaN), P = m.P;
  const vi = new Map(); for (let v = 0; v < m.nv; v++) { const [th, y, r] = cyl(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]), u = th * R0; if (u < uLo || u > uHi || y < yLo || y > yHi || r < rMin || r > rMax) continue; vi.set(v, [u, y, r - base(th, y)]); }
  for (let f = 0; f < m.nf; f++) {
    const a = vi.get(m.F[f * 3]), b = vi.get(m.F[f * 3 + 1]), cc = vi.get(m.F[f * 3 + 2]); if (!a || !b || !cc) continue;
    const pts = [a, b, cc].map(([u, y, e]) => [(u - uLo) / S, (yHi - y) / S, e]);
    if (Math.max(...pts.map(p => p[0])) - Math.min(...pts.map(p => p[0])) > W / 2) continue;
    const [A, B, C] = pts, area = (B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1]); if (Math.abs(area) < 1e-9) continue;
    for (let y = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1]))); y <= Math.min(H - 1, Math.ceil(Math.max(A[1], B[1], C[1]))); y++) for (let x = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0]))); x <= Math.min(W - 1, Math.ceil(Math.max(A[0], B[0], C[0]))); x++) {
      const px = x + .5, py = y + .5, w0 = ((B[0] - px) * (C[1] - py) - (C[0] - px) * (B[1] - py)) / area, w1 = ((C[0] - px) * (A[1] - py) - (A[0] - px) * (C[1] - py)) / area, w2 = 1 - w0 - w1;
      if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue; E[y * W + x] = w0 * A[2] + w1 * B[2] + w2 * C[2];
    }
  }
  const t = o.t ?? .01, N = W * H, uy = i => [uLo + (i % W + .5) * S, yHi - (Math.floor(i / W) + .5) * S];
  // (below tMax: what stands much higher — the muzzle beside a cheek — is no spot)
  const mask = new Uint8Array(N); for (let i = 0; i < N; i++) { if (!(E[i] > t) || E[i] > (o.tMax ?? Infinity)) continue; const [u, y] = uy(i); if (allow(u, y)) mask[i] = 1; }
  const id = new Int32Array(N).fill(-1), comps = [];
  for (let s0 = 0; s0 < N; s0++) { if (!mask[s0] || id[s0] >= 0) continue; const q = [s0]; id[s0] = comps.length; for (let i = 0; i < q.length; i++) { const p = q[i], x = p % W; for (const n of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) if (n >= 0 && n < N && mask[n] && id[n] < 0) { id[n] = comps.length; q.push(n); } } comps.push(q); }
  const eAt = (u, y) => { const fx = (u - uLo) / S - .5, fy = (yHi - y) / S - .5, x0 = Math.floor(fx), y0 = Math.floor(fy); let acc = 0, wsum = 0; for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const x = x0 + dx, y1 = y0 + dy; if (x < 0 || y1 < 0 || x >= W || y1 >= H) continue; const v = E[y1 * W + x]; if (Number.isNaN(v)) continue; const wgt = (dx ? fx - x0 : 1 - (fx - x0)) * (dy ? fy - y0 : 1 - (fy - y0)); acc += v * wgt; wsum += wgt; } return wsum > .25 ? acc / wsum : -1; };
  const NA = o.rays ?? 360, K = o.harmonics ?? 8, foot = o.foot ?? .0025, spots = [];
  const idAt = (u, y) => { const x = Math.floor((u - uLo) / S), yy = Math.floor((yHi - y) / S); return x < 0 || yy < 0 || x >= W || yy >= H ? -1 : id[yy * W + x]; };
  for (const [ci, comp] of comps.entries()) {
    if (comp.length * S * S < (o.minArea ?? .01)) continue;
    let cu = 0, cy = 0; for (const i of comp) { const [u, y] = uy(i); cu += u; cy += y; } cu /= comp.length; cy /= comp.length;
    const rho = new Float64Array(NA);
    for (let j = 0; j < NA; j++) { const a = 2 * Math.PI * j / NA, ca = Math.cos(a), sa = Math.sin(a); let last = 0;
      for (let r = 0; r < (o.maxRadius ?? 1); r += S / 4) if (idAt(cu + r * ca, cy + r * sa) === ci) last = r;
      let prev = eAt(cu + last * ca, cy + last * sa), r = last;
      for (r = last + S / 8; r < last + 4 * S; r += S / 8) { const e = eAt(cu + r * ca, cy + r * sa); if (e < t) { r -= S / 8 * (t - e) / ((prev - e) || 1e-9); break; } prev = e; } rho[j] = r; }
    const coef = []; for (let h = 0; h <= K; h++) { let p = 0, q = 0; for (let j = 0; j < NA; j++) { const a = 2 * Math.PI * j / NA; p += rho[j] * Math.cos(h * a); q += rho[j] * Math.sin(h * a); } coef.push([p / NA * (h ? 2 : 1), q / NA * 2]); }
    const sig = h => { const x = Math.PI * h / (K + 1); return Math.sin(x) / x; };
    const rs = Float64Array.from({length: NA}, (_, j) => { const a = 2 * Math.PI * j / NA; let r = coef[0][0]; for (let h = 1; h <= K; h++) r += sig(h) * (coef[h][0] * Math.cos(h * a) + coef[h][1] * Math.sin(h * a)); return r + foot; });
    const poly = Array.from(rs, (r, j) => [cu + r * Math.cos(2 * Math.PI * j / NA), cy + r * Math.sin(2 * Math.PI * j / NA)]);
    let u0 = Infinity, u1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const [u, y] of poly) { u0 = Math.min(u0, u); u1 = Math.max(u1, u); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const inner = comp.map(i => E[i]).sort((p, q) => p - q);
    spots.push({cu, cy, rs, poly, box: [u0, y0, u1, y1], rough: rho.reduce((acc, r, j) => acc + Math.abs(r + foot - rs[j]), 0) / NA, top: inner[Math.floor(inner.length * .5)]});
  }
  // the signed distance grid
  const reach = Math.max(o.w2 ?? .05, .02) + .01, g = o.sdfPx ?? .001, GW = Math.ceil((uHi - uLo) / g) + 2, GH = Math.ceil((yHi - yLo) / g) + 2, SD = new Float32Array(GW * GH).fill(-reach);
  for (const p of spots) {
    const gx0 = Math.max(0, Math.floor((p.box[0] - reach - uLo) / g)), gx1 = Math.min(GW - 1, Math.ceil((p.box[2] + reach - uLo) / g)), gy0 = Math.max(0, Math.floor((p.box[1] - reach - yLo) / g)), gy1 = Math.min(GH - 1, Math.ceil((p.box[3] + reach - yLo) / g)), lw = gx1 - gx0 + 1, lh = gy1 - gy0 + 1, D2 = new Float32Array(lw * lh).fill(reach * reach);
    for (let j = 0, k = NA - 1; j < NA; k = j++) {
      const [x0, y0] = p.poly[k], [x1, y1] = p.poly[j], dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1e-12;
      const cx0 = Math.max(gx0, Math.floor((Math.min(x0, x1) - reach - uLo) / g)), cx1 = Math.min(gx1, Math.ceil((Math.max(x0, x1) + reach - uLo) / g)), cy0 = Math.max(gy0, Math.floor((Math.min(y0, y1) - reach - yLo) / g)), cy1 = Math.min(gy1, Math.ceil((Math.max(y0, y1) + reach - yLo) / g));
      for (let gy = cy0; gy <= cy1; gy++) { const y = yLo + gy * g; for (let gx = cx0; gx <= cx1; gx++) { const u = uLo + gx * g, q = Math.max(0, Math.min(1, ((u - x0) * dx + (y - y0) * dy) / l2)), ex = u - x0 - q * dx, ey = y - y0 - q * dy, dd = ex * ex + ey * ey, li = (gy - gy0) * lw + gx - gx0; if (dd < D2[li]) D2[li] = dd; } }
    }
    for (let gy = gy0; gy <= gy1; gy++) { const y = yLo + gy * g; for (let gx = gx0; gx <= gx1; gx++) { const u = uLo + gx * g;
      let a = Math.atan2(y - p.cy, u - p.cu); if (a < 0) a += 2 * Math.PI; const fj = a / (2 * Math.PI) * NA, j0 = Math.floor(fj) % NA, fr2 = fj - Math.floor(fj), rr = p.rs[j0] * (1 - fr2) + p.rs[(j0 + 1) % NA] * fr2;
      const sd = (Math.hypot(u - p.cu, y - p.cy) < rr ? 1 : -1) * Math.sqrt(D2[(gy - gy0) * lw + gx - gx0]), gi = gy * GW + gx; if (sd > SD[gi]) SD[gi] = sd; } }
  }
  const sdf = (u, y) => { const fx = (u - uLo) / g, fy = (y - yLo) / g; if (fx < 0 || fy < 0 || fx >= GW - 1 || fy >= GH - 1) return -reach; const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, i = y0 * GW + x0;
    return SD[i] * (1 - tx) * (1 - ty) + SD[i + 1] * tx * (1 - ty) + SD[i + GW] * (1 - tx) * ty + SD[i + GW + 1] * tx * ty; };
  // debug=file: the unwrapped height (gray), the spots found (pink), the smoothed outlines (red) and debug.line(u) → y (green)
  if (debug?.file) { const rgb = new Uint8Array(N * 3); for (let i = 0; i < N; i++) { const e = E[i]; if (Number.isNaN(e)) { rgb.set([0, 0, 60], i * 3); continue; } const gv = Math.max(0, Math.min(255, 128 + e / .03 * 127)); rgb.set(mask[i] ? [gv, gv * .75, gv * .75] : [gv, gv, gv], i * 3); }
    for (const p of spots) for (let j = 0; j < NA * 4; j++) { const a = 2 * Math.PI * j / (NA * 4), r = p.rs[Math.floor(j / 4)], x = Math.round((p.cu + r * Math.cos(a) - uLo) / S - .5), y = Math.round((yHi - (p.cy + r * Math.sin(a))) / S - .5); if (x >= 0 && y >= 0 && x < W && y < H) rgb.set([255, 0, 0], (y * W + x) * 3); }
    if (debug.line) for (let x = 0; x < W; x++) { const y = Math.round((yHi - debug.line(uLo + (x + .5) * S)) / S); if (y >= 0 && y < H) rgb.set([0, 255, 0], (y * W + x) * 3); }
    require('./depth.cjs').png(debug.file, W, H, rgb); }
  return {spots, sdf, reach};
}

async function rebuildTube(m, o, log = () => {}) {
  const fr = P2.frame(m), s = fr.s, [ax, az] = o.axis;
  const cyl = (x, y, z) => { const X = (x - fr.ctr[0]) * s - ax, Y = (y - fr.lo[1]) * s - 1.9, Z = (z - fr.ctr[2]) * s - az; return [Math.atan2(X, Z), Y, Math.hypot(X, Z)]; };
  const toLocal = ([X, Y, Z]) => [X / s + fr.ctr[0], (Y + 1.9) / s + fr.lo[1], Z / s + fr.ctr[2]];
  // a surface of revolution-like patch r = rad(θ, y) as a point, and its outward normal (finite differences)
  const hs = 1e-5, at = (rad, th, y) => { const r = rad(th, y); return [ax + r * Math.sin(th), y, az + r * Math.cos(th)]; };
  const normalOf = (rad, th, y) => { const p0 = at(rad, th, y), pt = at(rad, th + hs, y), py = at(rad, th, y + hs), du = [pt[0] - p0[0], pt[1] - p0[1], pt[2] - p0[2]], dv = [py[0] - p0[0], py[1] - p0[1], py[2] - p0[2]];
    let n = [dv[1] * du[2] - dv[2] * du[1], dv[2] * du[0] - dv[0] * du[2], dv[0] * du[1] - dv[1] * du[0]]; const ln = Math.hypot(...n) || 1; n = n.map(q => q / ln); return n[0] * Math.sin(th) + n[2] * Math.cos(th) < 0 ? n.map(q => -q) : n; };
  // a target for refineMove from a weight and a radius function
  const targetFrom = (weight, rad) => (x, y, z) => { const [th, yy, r] = cyl(x, y, z), w = weight(th, yy, r, x, y, z); if (w <= 0) return [0, x, y, z]; const [X, Y, Z] = toLocal(at(rad, th, yy)); return [w, x + w * (X - x), y + w * (Y - y), z + w * (Z - z)]; };
  const R0 = o.r0 ?? .69, rMin = o.rMin ?? .66, rMax = o.rMax ?? .8, yMin = o.yMin ?? -1.84, thFit = (o.thetaFit ?? 130) * Math.PI / 180;
  const [thA, thB] = (o.theta ?? [122, 132]).map(d => d * Math.PI / 180);
  // ── 1. the bare tube R(θ, y) ──
  const yLo = yMin - .04, yHi = o.yFitTop ?? .62, ym = (yLo + yHi) / 2, yh = (yHi - yLo) / 2, deg = o.deg ?? 4, harm = o.harm ?? 3;
  const basis = (a, y) => { const u = (Math.max(yLo, Math.min(yHi, y)) - ym) / yh, out = []; for (let d = 0; d <= deg; d++) { const p = u ** d; out.push(p); for (let h = 1; h <= harm; h++) out.push(p * Math.cos(h * a), p * Math.sin(h * a)); } return out; };
  const P = m.P, cand = [];
  for (let v = 0; v < m.nv; v++) { const [th, y, r] = cyl(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); if (y >= yLo && y <= .9 && r >= rMin && r <= 1.2 && Math.abs(th) <= thFit) cand.push([v, th, y, r]); }
  let c = null; const Rof = (th, y) => basis(th, y).reduce((acc, b, j) => acc + b * c[j], 0);
  const fitBare = top => { let use = cand.map(([, , y, r]) => y <= top(y) && r < (o.rBare ?? .712) && r <= rMax);
    for (let it = 0; it < (o.iters ?? 6); it++) { const rows = [], ys = []; cand.forEach(([, th, y, r], i) => { if (use[i]) { rows.push(basis(th, y)); ys.push(r); } }); c = fit(rows, ys); use = cand.map(([, th, y, r]) => y <= top(y, th) && r - Rof(th, y) < (o.bareTol ?? .0045)); } };
  fitBare(() => o.yBareTop ?? .47);
  // ── 2. the foot of the head's flare per angle: from high on the head down to the first bare coat (a gap always parts it from the
  //       spots below) ──
  const nb = Math.round(2 * thFit / (3 * Math.PI / 180)), bins = Array.from({length: nb}, () => new Map());
  for (const [, th, y, r] of cand) { if (y < .3) continue; const bi = Math.min(nb - 1, Math.floor((th + thFit) / (2 * thFit) * nb)), yb = Math.round(y * 100); const e = r - Rof(th, Math.min(y, .5)); const arr = bins[bi].get(yb) || []; arr.push(e); bins[bi].set(yb, arr); }
  const feet = [];
  bins.forEach((bin, bi) => { const th = -thFit + (bi + .5) * 2 * thFit / nb; let foot = null;
    for (let yb = 85; yb >= 30; yb--) { const arr = bin.get(yb); if (!arr) continue; arr.sort((p, q) => p - q); if (arr[arr.length >> 1] < (o.footTol ?? .006)) { foot = yb / 100; break; } }
    if (foot != null && Math.abs(th) <= (o.footTheta ?? 123) * Math.PI / 180) feet.push([th, foot]); });
  // a smooth function of the angle (harmonics), robust: the samples far from the curve (a dip of the slot's lip) are left out
  const HF = o.footHarm ?? 5, yfRow = th => { const r = [1]; for (let h = 1; h <= HF; h++) r.push(Math.cos(h * th), Math.sin(h * th)); return r; };
  let yfC = null, keepF = feet.map(() => true);
  const yF = th => yfRow(th).reduce((acc, b, j) => acc + b * yfC[j], 0);
  for (let it = 0; it < 4; it++) { const fs = feet.filter((_, i) => keepF[i]); yfC = fit(fs.map(([th]) => yfRow(th)), fs.map(f => f[1])); keepF = feet.map(([th, y]) => Math.abs(y - yF(th)) < (o.footOutlier ?? .025)); }
  log('tube: flare foot y', [0, 45, 90, 120].map(d => `${d}°:${yF(d * Math.PI / 180).toFixed(3)}/${yF(-d * Math.PI / 180).toFixed(3)}`).join(' '));
  // refit the tube with the coat up to the flare
  fitBare((y, th = 0) => yF(th) - .012);
  // ── 3. the spots ──
  const {spots, sdf} = findSpots(m, {cyl, base: Rof, R0, uLo: -thFit * R0, uHi: thFit * R0, yLo, yHi: .7, rMin, rMax, o,
    allow: (u, y) => y < yF(u / R0) - (o.spotTopGap ?? .008) && y > yMin, debug: process.env.DEBUG_TUBE_PNG && {file: process.env.DEBUG_TUBE_PNG, line: u => yF(u / R0)}});
  log('tube: spots', spots.length, spots.map(p => `θ ${(p.cu / R0 * 180 / Math.PI).toFixed(0)}° y ${p.cy.toFixed(2)} top ${p.top.toFixed(3)} wobble ${p.rough.toFixed(4)}`).join(' · '));
  const prof = spotProfile(o);
  // ── 4. target surface and weight (1 = rebuilt, 0 = original) ──
  const [tb0, tb1] = o.topBlend ?? [.03, .004], [bb0, bb1] = o.bottomBlend ?? [0, .04];
  const weight = (th, y, r) => { if (r < rMin - .02 || r > rMax + .02) return 0; const a = Math.abs(th); if (a >= thB) return 0; const f = yF(th); if (y >= f - tb1 || y <= yMin + bb0) return 0;
    return (1 - smooth(f - tb0, f - tb1, y)) * smooth(yMin + bb0, yMin + bb1, y) * (1 - smooth(thA, thB, a)); };
  const radT = (th, y) => Rof(th, y) + prof(sdf(th * R0, y));
  // ── 5. the mesh refined where the surface bends and moved onto it; the crease is the spots' foot ──
  const tlog = (...a) => log('tube:', ...a);
  const res = refineMove(m, {s, target: targetFrom(weight, radT), normal: (x, y, z) => normalOf(radT, ...cyl(x, y, z).slice(0, 2)), crease: (x, y, z) => { const [th, yy] = cyl(x, y, z); return sdf(th * R0, yy); },
    tol: o.tol, minLen: o.minLen, maxLen: o.maxLen, maxAngle: o.maxAngle, creaseBand: o.footBand, passes: o.passes}, tlog);
  // ── 6. lighter: the dense Rodin triangles of the flat coat and the flat tops collapse; the walls and a margin each side stay as
  //       refined (a coat vertex collapsed onto the foot made a long triangle that carried the wall's normal over the coat) ──
  if (o.simplifyTol) { const [lk0, lk1] = o.simplifyKeep ?? [-.012, (o.w2 ?? .05) + .01];
    await simplifyInside(m, {s, normals: res.normals, free: (v, {w}) => { const sd = res.creaseOf.get(v); return w >= .999 && sd !== null && (sd < lk0 || sd > lk1); }, tol: o.simplifyTol, normalWeight: o.normalWeight, label: Math.max(0, m.names.indexOf(o.other || 'coat'))}, tlog); }
  const {moved, normals, splits} = res;
  const merge = r => { for (const [v, {n, w}] of r.normals) { const old = normals.get(v); if (!old) { normals.set(v, {n, w}); moved.add(v); continue; } const q = [0, 1, 2].map(j => w * n[j] + (1 - w) * old.n[j]), l = Math.hypot(...q) || 1; normals.set(v, {n: q.map(x => x / l), w: Math.max(w, old.w)}); } };
  // the muzzle (its painted outline seen from the front: an exact.cjs contour), kept out of reach of the late parts
  const guardOf = opt => opt ? contour(m, Uint8Array.from(m.label), m.names, opt) : null;
  // distance (render) to the nearest face of some colours (the cheek spots: spots above the neck)
  const labelDistance = names => { const P1 = m.P, gl = new Set(names.map(n => m.names.indexOf(n))), spotsK = m.names.indexOf(o.name || 'spots'), cell = .03, grid = new Map();
    for (let f = 0; f < m.nf; f++) { if (!gl.has(m.label[f])) continue; const a = m.F[f * 3] * 3, b = m.F[f * 3 + 1] * 3, c2 = m.F[f * 3 + 2] * 3, x = (P1[a] + P1[b] + P1[c2]) / 3, y = (P1[a + 1] + P1[b + 1] + P1[c2 + 1]) / 3, z = (P1[a + 2] + P1[b + 2] + P1[c2 + 2]) / 3, [th, yy] = cyl(x, y, z);
      if (m.label[f] === spotsK && yy < yF(th) - .005) continue; const X = (x - fr.ctr[0]) * s, Y = (y - fr.lo[1]) * s - 1.9, Z = (z - fr.ctr[2]) * s, k = `${Math.floor(X / cell)},${Math.floor(Y / cell)},${Math.floor(Z / cell)}`; const l = grid.get(k); if (l) l.push(X, Y, Z); else grid.set(k, [X, Y, Z]); }
    return (x, y, z) => { const X = (x - fr.ctr[0]) * s, Y = (y - fr.lo[1]) * s - 1.9, Z = (z - fr.ctr[2]) * s, i = Math.floor(X / cell), j = Math.floor(Y / cell), k = Math.floor(Z / cell); let d2 = Infinity;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (let dk = -1; dk <= 1; dk++) { const l = grid.get(`${i + di},${j + dj},${k + dk}`); if (!l) continue; for (let q = 0; q < l.length; q += 3) { const dd = (l[q] - X) ** 2 + (l[q + 1] - Y) ** 2 + (l[q + 2] - Z) ** 2; if (dd < d2) d2 = dd; } }
      return Math.min(Math.sqrt(d2), cell); }; };
  // ── 7. the band under the head: where the neck flares into the head, from a little below the flare's foot up to `top` above it, a
  //       tensor cubic B-spline r(θ, η) (η = y − yF(θ): the flare at the same η all around) fitted to the surface there (the neck just
  //       rebuilt included, so the two meet without a step); only what lies near it moves (the muzzle and the cheek spots stand off it),
  //       away from the neck's spots, the cheek spots (`guard`) and the muzzle (`protect`) ──
  const runBand = !o.band ? null : async () => {
    const B = o.band, blog = (...a) => log('band:', ...a), thMaxB = (B.theta ?? [100, 110]).map(d => d * Math.PI / 180), [e0, e1] = B.eta ?? [-.07, .17], [top0, top1] = B.top ?? [.1, .14], hE = B.knotEta ?? .02;
    const guardDist = labelDistance(B.guard || []), muzzle = guardOf(B.protect);
    const [g0, g1] = B.guardBand ?? [.012, .03], [rg0, rg1] = B.reliefBand ?? [.006, .015], [pm0, pm1] = B.protectBand ?? [.004, .015];
    const pts = []; const P1 = m.P;
    for (let v = 0; v < m.nv; v++) { const x = P1[v * 3], y = P1[v * 3 + 1], z = P1[v * 3 + 2], [th, yy, r] = cyl(x, y, z); if (Math.abs(th) > thMaxB[1] || r < rMin - .02 || r > 1.15) continue; const et = yy - yF(th); if (et < e0 + hE || et > e1 - hE) continue;
      if (sdf(th * R0, yy) > -.012 || guardDist(x, y, z) < g0 || (muzzle && z > fr.ctr[2] && muzzle.s(x, y) * s > -pm0)) continue; pts.push([th, et, r]); }
    const surf = splineSurface(pts, {a0: -thMaxB[1], a1: thMaxB[1], b0: e0, b1: e1, ha: (B.knotTheta ?? 8) * Math.PI / 180, hb: hE, smoothing: B.smooth ?? .02, drop: rg0, iters: B.iters ?? 3});
    blog('fit on', surf.used, 'of', pts.length, 'vertices,', surf.unknowns, 'unknowns, rms', surf.rms.toFixed(5));
    const rB = (th, y) => surf.f(th, y - yF(th));
    const wB = (th, yy, r, x, y, z) => { const a = Math.abs(th); if (a >= thMaxB[1] || r < rMin - .02 || r > 1.15) return 0; const et = yy - yF(th); if (et <= e0 + hE || et >= top1) return 0;
      let w = smooth(e0 + hE, e0 + 2.5 * hE, et) * (1 - smooth(top0, top1, et)) * (1 - smooth(thMaxB[0], thMaxB[1], a)); if (w <= 0) return 0;
      w *= smooth(.006, .016, -sdf(th * R0, yy)); if (w <= 0) return 0; w *= 1 - smooth(rg0, rg1, Math.abs(r - rB(th, yy))); if (w <= 0) return 0; if (B.guard?.length) w *= smooth(g0, g1, guardDist(x, y, z));
      if (muzzle && w > 0 && z > fr.ctr[2]) w *= smooth(pm0, pm1, -muzzle.s(x, y) * s); return w; };
    const rb = refineMove(m, {s, target: targetFrom(wB, rB), normal: (x, y, z) => normalOf(rB, ...cyl(x, y, z).slice(0, 2)), tol: B.tol ?? o.tol, minLen: B.minLen ?? o.minLen, maxLen: B.maxLen ?? .025, passes: o.passes}, blog);
    if (o.simplifyTol) await simplifyInside(m, {s, normals: rb.normals, free: (v, {w}) => w >= .999, tol: o.simplifyTol, normalWeight: o.normalWeight, label: Math.max(0, m.names.indexOf(o.other || 'coat'))}, blog);
    merge(rb);
  };
  // ── 8. the cheek spots (the spots on the head's sides) rebuilt like the neck's: in each patch (`theta`, `y`), the head's side as a
  //       smooth B-spline r(θ, y) fitted to it (robust: the spots stand off it), the spots on it found, their outlines smoothed and their
  //       relief rebuilt with the same profile; the patch fades back to the original at its edges and never touches the muzzle ──
  const cheekPaint = [];
  const runCheeks = !o.cheeks ? null : async () => {
    const Ck = o.cheeks, muzzle = guardOf(Ck.protect), [pm0, pm1] = Ck.protectBand ?? [.006, .02], [rg0, rg1] = Ck.reliefBand ?? [.006, .015], profC = spotProfile({...o, ...Ck}), Rc = Ck.r0 ?? .78;
    // the vertices of the spots' faces (the colours are settled by now) stay out of the fit from the start: a spot as big as the
    // knots would otherwise pull the surface up under it
    const spotK = m.names.indexOf(o.name || 'spots'), onSpot = new Uint8Array(m.nv); for (let f = 0; f < m.nf; f++) if (m.label[f] === spotK) for (let k = 0; k < 3; k++) onSpot[m.F[f * 3 + k]] = 1;
    for (const [pi, patch] of Ck.patches.entries()) {
      const clog = (...a) => log(`cheek ${pi}:`, ...a), [t0, t1] = patch.theta.map(d => d * Math.PI / 180), [y0, y1] = patch.y ?? Ck.y ?? [.5, 1.1], mT = (Ck.margin ?? 8) * Math.PI / 180, mY = Ck.marginY ?? .05;
      const inPatch = (th, y) => th > t0 && th < t1 && y > y0 && y < y1, P1 = m.P, pts = [];
      for (let v = 0; v < m.nv; v++) { const x = P1[v * 3], y = P1[v * 3 + 1], z = P1[v * 3 + 2], [th, yy, r] = cyl(x, y, z); if (!inPatch(th, yy) || r < rMin || r > 1.2 || onSpot[v]) continue; if (muzzle && z > fr.ctr[2] && muzzle.s(x, y) * s > -pm0) continue; pts.push([th, yy, r]); }
      const surf = splineSurface(pts, {a0: t0, a1: t1, b0: y0, b1: y1, ha: (Ck.knotTheta ?? 10) * Math.PI / 180, hb: Ck.knotY ?? .04, smoothing: Ck.smooth ?? .05, drop: rg0, iters: Ck.iters ?? 4});
      clog('fit on', surf.used, 'of', pts.length, 'vertices, rms', surf.rms.toFixed(5));
      const found = findSpots(m, {cyl, base: surf.f, R0: Rc, uLo: t0 * Rc, uHi: t1 * Rc, yLo: y0, yHi: y1, rMin, rMax: 1.2, o: {...o, ...Ck},
        // (and off the muzzle: the point of the head's side there, seen from the front, outside the muzzle's outline by pm1)
        allow: (u, y) => { const th = u / Rc; if (!inPatch(th, y) || th < t0 + mT || th > t1 - mT || y < y0 + mY || y > y1 - mY) return false; if (!muzzle) return true; const [xl, yl, zl] = toLocal(at(surf.f, th, y)); return zl <= fr.ctr[2] || muzzle.s(xl, yl) * s < -pm1; }, debug: process.env.DEBUG_CHEEK_PNG && {file: process.env.DEBUG_CHEEK_PNG.replace(/(\.png)?$/, `-${pi}.png`)}});
      clog('spots', found.spots.length, found.spots.map(p => `θ ${(p.cu / Rc * 180 / Math.PI).toFixed(0)}° y ${p.cy.toFixed(2)} top ${p.top.toFixed(3)} wobble ${p.rough.toFixed(4)}`).join(' · '));
      const sdC = (th, y) => found.sdf(th * Rc, y), radC = (th, y) => surf.f(th, y) + profC(sdC(th, y));
      // weight: the patch (fading over the margins), off the muzzle, and only what lies near the fitted surface or on a spot
      const wC = (th, yy, r, x, y, z) => { if (!inPatch(th, yy) || r < rMin || r > 1.2) return 0; let w = smooth(t0, t0 + mT, th) * (1 - smooth(t1 - mT, t1, th)) * smooth(y0, y0 + mY, yy) * (1 - smooth(y1 - mY, y1, yy)); if (w <= 0) return 0;
        const sd = sdC(th, yy); if (sd < -.012) w *= 1 - smooth(rg0, rg1, Math.abs(r - surf.f(th, yy))); if (w > 0 && muzzle && z > fr.ctr[2]) w *= smooth(pm0, pm1, -muzzle.s(x, y) * s); return w; };
      const rc = refineMove(m, {s, target: targetFrom(wC, radC), normal: (x, y, z) => normalOf(radC, ...cyl(x, y, z).slice(0, 2)), crease: (x, y, z) => { const [th, yy] = cyl(x, y, z); return sdC(th, yy); },
        tol: Ck.tol ?? o.tol, minLen: Ck.minLen ?? o.minLen, maxLen: Ck.maxLen ?? o.maxLen, maxAngle: Ck.maxAngle ?? o.maxAngle, creaseBand: Ck.footBand ?? o.footBand, passes: o.passes}, clog);
      if (o.simplifyTol) { const [lk0, lk1] = o.simplifyKeep ?? [-.012, (o.w2 ?? .05) + .01]; await simplifyInside(m, {s, normals: rc.normals, free: (v, {w}) => { const sd = rc.creaseOf.get(v); return w >= .999 && sd !== null && (sd < lk0 || sd > lk1); }, tol: o.simplifyTol, normalWeight: o.normalWeight, label: Math.max(0, m.names.indexOf(o.other || 'coat'))}, clog); }
      merge(rc);
      // the paint: inside the patch and near its spots (within `paintReach` of an outline), brown over the relief, yellow around
      cheekPaint.push({sAt: (x, y, z) => { const [th, yy, r] = cyl(x, y, z); if (!inPatch(th, yy) || r < rMin || r > 1.2) return null; if (muzzle && z > fr.ctr[2] && muzzle.s(x, y) * s > -pm0) return null; const sd = sdC(th, yy); return sd < -(Ck.paintReach ?? .03) ? null : sd; }});
    }
  };
  // ── the paint: brown over the relief (s > 0), yellow around, on the outer shell of the rebuilt tube (up to `paintAbove` over the
  //    flare's foot: no spot reaches it, and stray bits of the old paint there turn yellow) and near the cheek spots ──
  const paintAbove = o.paintAbove ?? .02, thP = (o.thetaPaint ?? 128) * Math.PI / 180;
  const sTube = (x, y, z) => { const [th, yy, r] = cyl(x, y, z); if (r < rMin - .02 || r > rMax + .02 || Math.abs(th) > thP || yy > yF(th) + paintAbove || yy < yMin) return null; return sdf(th * R0, yy); };
  const overrideOf = (sAt, k, other, refine, own = false) => ({k, target: refine / s,
    // (own: only where the colours there are already the spot's and the coat's — a cheek patch never repaints the muzzle or the black)
    apply(vec, x, y, z) { const sd = sAt(x, y, z); if (sd === null || (own && vec[k] + vec[other] < .5)) return false; const val = Math.max(0, Math.min(1, .5 + sd / (o.paintSoft ?? .0006))); for (let j = 0; j < vec.length; j++) vec[j] = 0; vec[k] = val; vec[other] = 1 - val; return true; },
    // only a triangle the outline crosses (the mesh is already fine there: the linear cut is exact enough)
    crosses(p) { const ss = p.map(q => sAt(q[0], q[1], q[2])).filter(v => v !== null); return ss.length > 1 && Math.min(...ss) < 0 && Math.max(...ss) > 0; }});
  const overrides = (k, other, refine = .0015) => [overrideOf(sTube, k, other, refine), ...cheekPaint.map(cp => overrideOf(cp.sAt, k, other, refine, true))];
  return {moved, normals, overrides, spots, yF, splits, runBand, runCheeks};
}

module.exports = {rebuildTube, splineSurface, findSpots, spotProfile};
