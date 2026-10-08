// Exact borders from the relief (07/10/2026, second round: "o nariz mostra linhas fora do campo do nariz… pinta não colorida 100%…
// os olhos vazados… contornos em preto padronizados… no relevo por completo"). Instead of a blurred mask sampled at the vertices
// (which zigzags across the big Rodin triangles and leaves slivers on the walls), each detail gets a smooth signed function s(p) of the
// position — positive inside, zero on the border — evaluated at every vertex near it, so crisp.cjs cuts the triangles along s = 0:
//   contour (eyes, nostrils): front height map, the surface around the bump fitted by a quadric, the height above it, and the foot of
//            the bump (where that height falls to `frac` of the top) found along 360 rays from the centre, then smoothed (only the
//            first `harmonics` of the radius as a function of the angle): a regular outline that is the relief's own;
//   line (the smile): the bottom of the groove (curveMask of project2d.cjs: tracked, fitted by a polynomial, trimmed) at constant
//            width, with round ends;
//   tube (the neck's spots): the tube's own surface (radius as a smooth function of angle and height, fitted to the bare tube) and the
//            spots where the surface stands above it by more than `t`: the paint is the plateau of each spot, wall included.
// Every function works in the local units of the GLB; the options are in render units (height 4.1, floor at −1.9, like the viewer).
const D = require('./depth.cjs'), P2 = require('./project2d.cjs');

function solve(A, b) { // small dense least squares through the normal equations already formed: A (n×n), b (n)
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) { let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r; [M[i], M[p]] = [M[p], M[i]]; const d = M[i][i] || 1e-12; for (let r = 0; r < n; r++) if (r !== i) { const k = M[r][i] / d; if (k) for (let c = i; c <= n; c++) M[r][c] -= k * M[i][c]; } }
  return M.map((row, i) => row[n] / (row[i] || 1e-12));
}
function fit(rows, ys, wts) { const n = rows[0].length, A = Array.from({length: n}, () => new Float64Array(n)), b = new Float64Array(n); rows.forEach((r, k) => { const w = wts ? wts[k] : 1; for (let i = 0; i < n; i++) { b[i] += w * r[i] * ys[k]; for (let j = 0; j < n; j++) A[i][j] += w * r[i] * r[j]; } }); return solve(A.map(r => [...r]), [...b]); }
const bil = (F, W, H, x, y) => { x -= .5; y -= .5; const xi = Math.max(0, Math.min(W - 2, Math.floor(x))), yi = Math.max(0, Math.min(H - 2, Math.floor(y))), fx = Math.max(0, Math.min(1, x - xi)), fy = Math.max(0, Math.min(1, y - yi)), i = yi * W + xi; return F[i] * (1 - fx) * (1 - fy) + F[i + 1] * fx * (1 - fy) + F[i + W] * (1 - fx) * fy + F[i + W + 1] * fx * fy; };

// ── contour: the foot of one bump ──
function contour(m, label, names, t) {
  const fr = P2.frame(m), box = fr.toLocalBox(t.box), res = 1 / ((t.res ?? 1600) * fr.s), map = D.rasterize(m, box, res), {W, H, Z, FID} = map, N = W * H;
  const k = names.indexOf(t.name), excl = new Set((t.exclude || [t.name]).map(n => names.indexOf(n)));
  // the painted blob (largest piece of the colour in the box; 'fromPaint': of those colours, the details inside it included): centre
  // and second moments → a rough ellipse
  const blobOf = new Set((t.fromPaint || [t.name]).map(n => names.indexOf(n)));
  const tex = new Uint8Array(N); for (let i = 0; i < N; i++) tex[i] = FID[i] >= 0 && blobOf.has(label[FID[i]]) ? 1 : 0;
  const id = new Int32Array(N).fill(-1); let best = -1, bestN = 0;
  for (let s = 0; s < N; s++) { if (!tex[s] || id[s] >= 0) continue; const q = [s]; id[s] = s; for (let i = 0; i < q.length; i++) { const p = q[i], x = p % W; for (const n of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) if (n >= 0 && n < N && tex[n] && id[n] < 0) { id[n] = s; q.push(n); } } if (q.length > bestN) { bestN = q.length; best = s; } }
  let n = 0, mx = 0, my = 0; for (let i = 0; i < N; i++) if (id[i] === best) { n++; mx += i % W + .5; my += Math.floor(i / W) + .5; } mx /= n; my /= n;
  let sxx = 0, syy = 0, sxy = 0; for (let i = 0; i < N; i++) if (id[i] === best) { const dx = i % W + .5 - mx, dy = Math.floor(i / W) + .5 - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; } sxx /= n; syy /= n; sxy /= n;
  // Mahalanobis radius of a pixel in the rough ellipse (1 = its rim)
  const det = sxx * syy - sxy * sxy, ixx = syy / det, iyy = sxx / det, ixy = -sxy / det, mah = (x, y) => { const dx = x - mx, dy = y - my; return Math.sqrt((ixx * dx * dx + 2 * ixy * dx * dy + iyy * dy * dy) / 4); };
  // the surface around: a quadric through the valid pixels of the ring between `ring` radii that are not a detail colour
  const [r0, r1] = t.ring ?? [1.35, 2.1], rows = [], ys = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!Number.isFinite(Z[i]) || FID[i] < 0 || excl.has(label[FID[i]])) continue; const r = mah(x + .5, y + .5); if (r < r0 || r > r1) continue; const u = (x + .5 - mx) / 100, v = (y + .5 - my) / 100; rows.push([1, u, v, u * u, u * v, v * v]); ys.push(Z[i]); }
  const c = fit(rows, ys), base = (x, y) => { const u = (x - mx) / 100, v = (y - my) / 100; return c[0] + c[1] * u + c[2] * v + c[3] * u * u + c[4] * u * v + c[5] * v * v; };
  const Hh = new Float32Array(N); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; Hh[i] = Number.isFinite(Z[i]) ? Z[i] - base(x + .5, y + .5) : -1; }
  const inside = []; for (let i = 0; i < N; i++) if (id[i] === best) inside.push(Hh[i]); inside.sort((a, b) => a - b);
  const top = inside[Math.floor(inside.length * .95)], level = (t.frac ?? .15) * top;
  // the foot along 360 rays: the first point (from the centre out) where the height drops below `level`; with 'fromPaint', where the
  // painted blob ends (the border stays where the paint already follows the relief, only smoothed: the muzzle)
  const R = new Float64Array(360), rmax = 2.2 * Math.sqrt(Math.max(sxx, syy)) * 2;
  if (t.fromPaint) for (let a = 0; a < 360; a++) { const ca = Math.cos(a * Math.PI / 180), sa = Math.sin(a * Math.PI / 180); let r; for (r = .5; r < rmax * 1.5; r += .5) { const x = Math.floor(mx + r * ca), y = Math.floor(my + r * sa); if (x < 0 || y < 0 || x >= W || y >= H || id[y * W + x] !== best) break; } R[a] = r - .25; }
  else for (let a = 0; a < 360; a++) { const ca = Math.cos(a * Math.PI / 180), sa = Math.sin(a * Math.PI / 180); let r = 0, prev = bil(Hh, W, H, mx, my); for (r = .25; r < rmax; r += .25) { const h = bil(Hh, W, H, mx + r * ca, my + r * sa); if (h < level) { r -= .25 * (level - h) / ((prev - h) || 1e-9); break; } prev = h; } R[a] = r; }
  // the outline: 'ellipse' (07/10/2026: "contornos padronizados") = the ellipse with the area and second moments of the foot's polygon,
  // scaled so that it holds the whole relief ('cover': that share of the rays inside it, up to 'maxScale'); else the first
  // 'harmonics' of R(θ) (a smooth outline that is the relief's own)
  const Rs = new Float64Array(360), grow = (t.grow ?? 0) / fr.s / res;
  let info = '', ell = null, setEllipse = null;
  if (t.shape === 'ellipse') {
    const pts = Array.from(R, (r, j) => [r * Math.cos(j * Math.PI / 180), r * Math.sin(j * Math.PI / 180)]);
    let A2 = 0, Cx = 0, Cy = 0; for (let j = 0; j < 360; j++) { const [x0, y0] = pts[j], [x1, y1] = pts[(j + 1) % 360], c2 = x0 * y1 - x1 * y0; A2 += c2; Cx += (x0 + x1) * c2; Cy += (y0 + y1) * c2; } const area = A2 / 2; Cx /= 3 * A2; Cy /= 3 * A2;
    let Ixx = 0, Iyy = 0, Ixy = 0; for (let j = 0; j < 360; j++) { const x0 = pts[j][0] - Cx, y0 = pts[j][1] - Cy, x1 = pts[(j + 1) % 360][0] - Cx, y1 = pts[(j + 1) % 360][1] - Cy, c2 = x0 * y1 - x1 * y0; Ixx += (y0 * y0 + y0 * y1 + y1 * y1) * c2; Iyy += (x0 * x0 + x0 * x1 + x1 * x1) * c2; Ixy += (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * c2; }
    Ixx /= 12; Iyy /= 12; Ixy /= 24;   // ∫y², ∫x², ∫xy over the polygon
    const sxx2 = Iyy / area, syy2 = Ixx / area, sxy2 = Ixy / area, tr = sxx2 + syy2, dt = sxx2 * syy2 - sxy2 * sxy2, l1 = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - dt)), l2 = tr / 2 - Math.sqrt(Math.max(0, tr * tr / 4 - dt));
    const ang = Math.atan2(l1 - sxx2, sxy2 || 1e-12); let ea = 2 * Math.sqrt(l1), eb = 2 * Math.sqrt(Math.max(l2, 1e-9));
    // the ellipse's radius from the bump's centre (mx, my) along each ray: the ray p = (Cx, Cy)·0 + r·dir crosses it where…
    const ca = Math.cos(ang), sa = Math.sin(ang), along = (j, a, b) => { const dx = Math.cos(j * Math.PI / 180), dy = Math.sin(j * Math.PI / 180); const ux = dx * ca + dy * sa, uy = -dx * sa + dy * ca, ox = -Cx * ca - Cy * sa, oy = Cx * sa - Cy * ca;
      const A = ux * ux / (a * a) + uy * uy / (b * b), B = 2 * (ux * ox / (a * a) + uy * oy / (b * b)), C = ox * ox / (a * a) + oy * oy / (b * b) - 1; return (-B + Math.sqrt(Math.max(0, B * B - 4 * A * C))) / (2 * A); };
    const ratio = Array.from(R, (r, j) => r / along(j, ea, eb)).sort((x, y) => x - y), k = Math.min(t.maxScale ?? 1.06, Math.max(t.minScale ?? 1, ratio[Math.min(359, Math.floor(360 * (t.cover ?? .97)))]));
    for (let j = 0; j < 360; j++) Rs[j] = along(j, ea * k, eb * k) + grow;
    // a pair drawn the same (the nostrils, mirrored): lamp-fix.cjs gives both the same axes, the angle mirrored
    ell = {a: ea * k * res, b: eb * k * res, ang};
    setEllipse = (a2, b2, ang2) => { const c2 = Math.cos(ang2), s2 = Math.sin(ang2), A = a2 / res, B = b2 / res;
      for (let j = 0; j < 360; j++) { const dx = Math.cos(j * Math.PI / 180), dy = Math.sin(j * Math.PI / 180), ux = dx * c2 + dy * s2, uy = -dx * s2 + dy * c2, ox = -Cx * c2 - Cy * s2, oy = Cx * s2 - Cy * c2;
        const qa = ux * ux / (A * A) + uy * uy / (B * B), qb = 2 * (ux * ox / (A * A) + uy * oy / (B * B)), qc = ox * ox / (A * A) + oy * oy / (B * B) - 1; Rs[j] = (-qb + Math.sqrt(Math.max(0, qb * qb - 4 * qa * qc))) / (2 * qa) + grow; } };
    info = `ellipse ${(ea * res * fr.s).toFixed(3)}×${(eb * res * fr.s).toFixed(3)} at ${(ang * 180 / Math.PI).toFixed(0)}° scale ${k.toFixed(3)} (rays outside before: ${ratio.filter(x => x > 1).length})`;
  } else {
    const K = t.harmonics ?? 4, coef = []; for (let h = 0; h <= K; h++) { let a = 0, b = 0; for (let j = 0; j < 360; j++) { const th = j * Math.PI / 180; a += R[j] * Math.cos(h * th); b += R[j] * Math.sin(h * th); } coef.push([a / 360 * (h ? 2 : 1), b / 360 * 2]); }
    for (let j = 0; j < 360; j++) { const th = j * Math.PI / 180; let r = coef[0][0]; for (let h = 1; h <= K; h++) r += coef[h][0] * Math.cos(h * th) + coef[h][1] * Math.sin(h * th); Rs[j] = r + grow; }
  }
  const rough = R.reduce((s, v, j) => s + Math.abs(v - (Rs[j] - grow)), 0) / 360;
  // s(p), p in local x/y: (outline radius − distance) in local units
  const cx = box[0] + mx * res, cy = box[1] + my * res;
  const s = (x, y) => { const dx = (x - cx) / res, dy = (y - cy) / res, d = Math.hypot(dx, dy); let a = Math.atan2(dy, dx) * 180 / Math.PI; if (a < 0) a += 360; const j = Math.floor(a) % 360, f = a - Math.floor(a); return ((Rs[j] * (1 - f) + Rs[(j + 1) % 360] * f) - d) * res; };
  // on the front shell: not below the surface around (the quadric) by more than 'depth' (the bore and the back are far behind)
  // 'front': the surface the front view sees at that point instead (a thin part, like an ear, has its back right behind it)
  // 'radial': on the outer shell (farther than rMin from the tube's axis) and in front of the axis — the steep sides of a big relief
  // (the muzzle's flanks) included, the bore inside and the back excluded
  const radial = t.zMode === 'radial' ? (x, y, z) => { const rx = (x - fr.ctr[0]) * fr.s - t.axis[0], rz = (z - fr.ctr[2]) * fr.s - t.axis[1]; return rz > 0 && Math.hypot(rx, rz) > t.rMin; } : null;
  const dz = (t.depth ?? .03) / fr.s, zOK = radial || t.zMode === 'front'
    ? (x, y, z) => { const px = (x - box[0]) / res, py = (y - box[1]) / res; if (px < 1 || py < 1 || px > W - 2 || py > H - 2) return false; const i = Math.floor(py) * W + Math.floor(px); let zf = -Infinity; for (const j of [i - W - 1, i - W, i - W + 1, i - 1, i, i + 1, i + W - 1, i + W, i + W + 1]) if (Number.isFinite(Z[j])) zf = Math.max(zf, Z[j]); return z >= zf - dz; }
    : (x, y, z) => z >= base((x - box[0]) / res, (y - box[1]) / res) - dz;
  return {s, zOK, info, ell, setEllipse, top, res, centre: [cx, cy], R, Rs, rough: rough * res * fr.s, topRender: top * fr.s, extent: Math.max(...Rs) * res};
}

// ── line: the smile ──
function line(m, label, names, t) {
  const fr = P2.frame(m), box = fr.toLocalBox(t.box), res = 1 / ((t.res ?? 1600) * fr.s), map = D.rasterize(m, box, res), {h, valid} = D.highpass(map, (t.sigma ?? .03) / (res * fr.s));
  const k = names.indexOf(t.name), N = map.W * map.H, tex = new Uint8Array(N); for (let i = 0; i < N; i++) tex[i] = map.FID[i] >= 0 && label[map.FID[i]] === k ? 1 : 0;
  const pts = P2.curvePoints(map, h, valid, tex, t);   // [[x, y] px] along the bottom of the groove
  const L = pts.map(([x, y]) => [box[0] + (x + .5) * res, box[1] + (y + .5) * res]), hw = (t.width ?? 30) / 2 * res;
  const s = (x, y) => { let d = Infinity; for (let i = 0; i + 1 < L.length; i++) { const [ax, ay] = L[i], [bx, by] = L[i + 1], ux = bx - ax, uy = by - ay, l2 = ux * ux + uy * uy, q = Math.max(0, Math.min(1, ((x - ax) * ux + (y - ay) * uy) / (l2 || 1e-12))); d = Math.min(d, Math.hypot(x - ax - q * ux, y - ay - q * uy)); } return hw - d; };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of L) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  // on the front shell: not behind the surface the front view sees there by more than 'depth' (the groove is a little lower)
  const {W, H, Z} = map, tol = (t.depth ?? .04) / fr.s;
  const zOK = (x, y, z) => { const px = (x - box[0]) / res, py = (y - box[1]) / res; if (px < 1 || py < 1 || px > W - 2 || py > H - 2) return false; const i = Math.floor(py) * W + Math.floor(px); let zf = -Infinity; for (const j of [i - W - 1, i - W, i - W + 1, i - 1, i, i + 1, i + W - 1, i + W, i + W + 1]) if (Number.isFinite(Z[j])) zf = Math.max(zf, Z[j]); return z >= zf - tol; };
  return {s, zOK, res, centre: [(x0 + x1) / 2, (y0 + y1) / 2], extent: Math.hypot(x1 - x0, y1 - y0) / 2 + hw, points: L};
}

// A detail as an override of the fields at any point (a vertex, or a point inside a triangle when crisp.cjs refines it): within the
// detail's reach (s > −reach) and on the front shell, the others keep their old proportions p (so the borders between them — the
// muzzle's, near an eye — stay where they were) and the detail's colour beats the strongest of them exactly where s > 0:
// val = (p_max + 2s/scale) / (1 + p_max) (a mixed rim — yellow and brown left over around the eye — cannot hand the black a win outside)
function override(m, k, det, opt = {}) {
  const fr = P2.frame(m), reach = (opt.reach ?? .06) / fr.s, scale = reach / .35, lim = det.extent + reach * 1.5, sur = opt.surround ?? -1, [cx, cy] = det.centre;
  // 'facing' [lo, hi]: the override fades out where the surface turns away from the front (normal z below lo): a steep flank keeps its
  // own paint (the front view cannot place a border on it)
  const [flo, fhi] = opt.facing || [-2, -1], old = new Float64Array(16);
  return {k, det, reach, target: opt.refine ? opt.refine / fr.s : null,
    apply(vec, x, y, z, nz = 1) {
      if (Math.hypot(x - cx, y - cy) > lim) return false;
      const sv = det.s(x, y); if (sv < -reach || !det.zOK(x, y, z)) return false;
      const w = Math.max(0, Math.min(1, (nz - flo) / (fhi - flo))); if (w <= 0) return false;
      for (let j = 0; j < vec.length; j++) old[j] = vec[j];
      let S = 0, top = 0; for (let j = 0; j < vec.length; j++) if (j !== k) { S += vec[j]; top = Math.max(top, vec[j]); }
      const pmax = S > 1e-6 ? top / S : 1, val = Math.max(0, Math.min(1, (pmax + 2 * sv / scale) / (1 + pmax)));
      for (let j = 0; j < vec.length; j++) if (j !== k) vec[j] = S > 1e-6 ? vec[j] / S * (1 - val) : (j === sur ? 1 - val : 0);
      vec[k] = val;
      if (w < 1) for (let j = 0; j < vec.length; j++) vec[j] = w * vec[j] + (1 - w) * old[j];
      return true;
    },
    // the border crosses this triangle (corners p, size d): the signs of s differ, or it passes very close to a corner
    crosses(p, d) { if (p.every(q => Math.hypot(q[0] - cx, q[1] - cy) > lim + d)) return false; const ss = p.filter(q => det.zOK(q[0], q[1], q[2])).map(q => det.s(q[0], q[1])); if (!ss.length) return false; return (Math.min(...ss) < 0 && Math.max(...ss) > 0) || Math.min(...ss.map(Math.abs)) < .3 * d; }
  };
}
function applyVertices(m, fl, K, ov, claimed, vn) {
  const vec = new Float64Array(K); let n = 0;
  for (let v = 0; v < m.nv; v++) { for (let j = 0; j < K; j++) vec[j] = fl[j][v]; if (!ov.apply(vec, m.P[v * 3], m.P[v * 3 + 1], m.P[v * 3 + 2], vn ? vn[v * 3 + 2] : 1)) continue; for (let j = 0; j < K; j++) fl[j][v] = vec[j]; if (claimed) claimed[v] = 1; n++; }
  return n;
}
// the colour k only where one of its details claimed the vertex: stray dark bits elsewhere go back to the colours around them
function onlyClaimed(m, fl, K, k, claimed, ring, fallback) {
  let n = 0;
  for (let v = 0; v < m.nv; v++) {
    if (claimed[v] || fl[k][v] <= 0) continue;
    let S = 0; for (let j = 0; j < K; j++) if (j !== k) S += fl[j][v];
    if (S > 1e-6) { for (let j = 0; j < K; j++) if (j !== k) fl[j][v] /= S; }
    else { const acc = new Float64Array(K); for (const u of ring[v]) for (let j = 0; j < K; j++) if (j !== k) acc[j] += fl[j][u]; let best = fallback, bv = 0; for (let j = 0; j < K; j++) if (acc[j] > bv) { bv = acc[j]; best = j; } fl[best][v] = 1; }
    fl[k][v] = 0; n++;
  }
  return n;
}

// ── tube: the spots of the neck (within thetaMax degrees of the front: the slot at the back has edges that stand out too) ──
function tube(m, fl, K, names, ring, t) {
  const fr = P2.frame(m), k = names.indexOf(t.name), o = names.indexOf(t.other), P = m.P;
  const [ax, az] = t.axis, sel = [], th = [], yy = [], rr = [];
  for (let v = 0; v < m.nv; v++) { const x = (P[v * 3] - fr.ctr[0]) * fr.s - ax, y = (P[v * 3 + 1] - fr.lo[1]) * fr.s - 1.9, z = (P[v * 3 + 2] - fr.ctr[2]) * fr.s - az, r = Math.hypot(x, z); if (y < t.yMin || y > t.yMax || r < t.rMin || r > t.rMax || Math.abs(Math.atan2(x, z)) > (t.thetaMax ?? 180) * Math.PI / 180) continue; sel.push(v); th.push(Math.atan2(x, z)); yy.push(y); rr.push(r); }
  const deg = t.deg ?? 4, harm = t.harm ?? 3, ym = (t.yMin + t.yMax) / 2, yh = (t.yMax - t.yMin) / 2;
  const basis = (a, y) => { const u = (y - ym) / yh, out = []; for (let d = 0; d <= deg; d++) { const p = u ** d; out.push(p); for (let h = 1; h <= harm; h++) out.push(p * Math.cos(h * a), p * Math.sin(h * a)); } return out; };
  const rows = sel.map((_, i) => basis(th[i], yy[i]));
  let use = rr.map(r => r < t.rBare), c = null, e = null;
  for (let it = 0; it < (t.iters ?? 4); it++) {
    const R = [], Y = []; rows.forEach((row, i) => { if (use[i]) { R.push(row); Y.push(rr[i]); } });
    c = fit(R, Y); e = rr.map((r, i) => r - rows[i].reduce((s, b, j) => s + b * c[j], 0));
    use = e.map(x => x < t.t * .5);
  }
  // a little smoothing of the height over the surface (the vertex noise of the shell), only among the selected vertices
  const idx = new Map(sel.map((v, i) => [v, i])); let E = Float64Array.from(e);
  for (let it = 0; it < (t.smooth ?? 1); it++) { const N2 = new Float64Array(E.length); sel.forEach((v, i) => { let s = E[i], n = 1; for (const u of ring[v]) { const j = idx.get(u); if (j !== undefined) { s += E[j]; n++; } } N2[i] = s / n; }); E = N2; }
  const scale = t.scale ?? .08; let inside = 0;
  sel.forEach((v, i) => { const val = Math.max(0, Math.min(1, .5 + (E[i] - t.t) / scale)); for (let j = 0; j < K; j++) fl[j][v] = 0; fl[k][v] = val; fl[o][v] = 1 - val; if (val > .5) inside++; });
  const hist = new Map(); for (const x of e) { const b = Math.round(x * 400) / 400; hist.set(b, (hist.get(b) || 0) + 1); }
  return {n: sel.length, inside, hist: [...hist].sort((a, b) => a[0] - b[0]).filter(([b]) => b > -.02 && b < .05).map(([b, c2]) => `${b.toFixed(4)}:${c2}`).join(' '), sel, E};
}

module.exports = {contour, line, override, applyVertices, onlyClaimed, tube};
