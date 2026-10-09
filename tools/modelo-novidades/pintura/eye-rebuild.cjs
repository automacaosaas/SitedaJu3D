// The giraffe's eyes rebuilt (08/10/2026, the gallery's zoom: "pequenos defeitos na pele abaixo do olho" — a light streak at the base
// of each eye, the folds and needle triangles of the Rodin mesh beside it). Each eye becomes a clean dome on a clean skin:
//   skin   around each eye, out to `flatten[0]` (elliptic radius: 1 = the eye's rim), the surface lies on the quadric fitted to the face
//          around it (exact.cjs contour); it blends back to the original surface by `flatten[1]`, and never reaches the muzzle (it fades
//          out `protect` before the muzzle's outline);
//   eye    the two eyes alike (`mirror`): the same axes, the angles mirrored, at the same height and symmetric about the pair's centre;
//          the relief h·(1 − ρ²)^profile (the measured shape: a lens with a steep rim) with its foot rounded by `fillet`;
//   mesh   refined where the surface bends and moved onto it (surface-rebuild.cjs), with the surface's own normals.
// lamp-fix.cjs then paints each eye with its dome's ellipse (`eye` in the exact entry). Options in render units.
const P2 = require('./project2d.cjs');
const D = require('./depth.cjs');
const exact = require('./exact.cjs');
const {refineMove, simplifyInside, smooth} = require('./surface-rebuild.cjs');
const {splineSurface} = require('./tube-rebuild.cjs');

async function rebuildEyes(m, o, log = () => {}) {
  const fr = P2.frame(m), s = fr.s, label = Uint8Array.from(m.label);
  const dets = o.targets.map(t => exact.contour(m, label, m.names, {...t, shape: 'ellipse'}));
  // the pair alike: mean axes, the angle mirrored across the vertical (doubled-angle mean weighted by how oval each is), the same y
  const [L, R] = [...dets].sort((p, q) => p.ellC[0] - q.ellC[0]), g = o.scale ?? 1;
  const a = (L.ell.a + R.ell.a) / 2 * g, b = (L.ell.b + R.ell.b) / 2 * g, ym = (L.ellC[1] + R.ellC[1]) / 2, xm = (L.ellC[0] + R.ellC[0]) / 2, half = (R.ellC[0] - L.ellC[0]) / 2;
  let sx = 0, sy = 0; [L, R].forEach((d, i) => { const e = (d.ell.a - d.ell.b) / (d.ell.a + d.ell.b), th = i ? Math.PI - d.ell.ang : d.ell.ang; sx += e * Math.cos(2 * th); sy += e * Math.sin(2 * th); });
  const angL = Math.atan2(sy, sx) / 2, h = o.height != null ? o.height / s : (L.top + R.top) / 2, p = o.profile ?? .35;
  const eyes = o.mirror === false ? dets.map(d => ({cx: d.ellC[0], cy: d.ellC[1], a: d.ell.a * g, b: d.ell.b * g, ang: d.ell.ang, det: d}))
    : [{cx: xm - half, cy: ym, a, b, ang: angL, det: L}, {cx: xm + half, cy: ym, a, b, ang: Math.PI - angL, det: R}];
  log('eyes:', eyes.map(e => `centre ${((e.cx - fr.ctr[0]) * s).toFixed(3)},${((e.cy - fr.lo[1]) * s - 1.9).toFixed(3)} axes ${(e.a * s).toFixed(3)}×${(e.b * s).toFixed(3)} at ${(e.ang * 180 / Math.PI).toFixed(1)}°`).join(' · '), `height ${(h * s).toFixed(4)} (measured ${(L.top * s).toFixed(4)} / ${(R.top * s).toFixed(4)})`);
  // the muzzle's outline (its painted blob, smoothed), kept out of reach
  const guard = o.protect ? exact.contour(m, label, m.names, o.protect) : null, [pg0, pg1] = o.protectBand ?? [.012, .03];
  const [f0, f1] = o.flatten ?? [1.7, 2.3], depth = (o.depth ?? .03) / s, fil = (o.fillet ?? .001) / s;
  const GHQ = [[0, .8102646175568073], [.8162878828589647, .4256072526101278], [-.8162878828589647, .4256072526101278], [1.6735516287674714, .05451558281912703], [-1.6735516287674714, .05451558281912703], [2.651961356835233, .0009717812450995192], [-2.651961356835233, .0009717812450995192]];
  // elliptic radius, its gradient's size (→ distance to the rim ≈ (1 − ρ)/|∇ρ|), and the relief with the foot rounded
  const ell = (e, x, y) => { const c = Math.cos(e.ang), sn = Math.sin(e.ang), u = (x - e.cx) * c + (y - e.cy) * sn, w = -(x - e.cx) * sn + (y - e.cy) * c, rho = Math.hypot(u / e.a, w / e.b) || 1e-9, gr = Math.hypot(u / (e.a * e.a), w / (e.b * e.b)) / rho; return [rho, gr]; };
  const dome0 = rho => rho >= 1 ? 0 : h * Math.pow(1 - rho * rho, p);
  const dome = (rho, gr) => { if (!fil || Math.abs(1 - rho) / gr > 4 * fil) return dome0(rho); let acc = 0; for (const [x, wq] of GHQ) acc += wq * dome0(rho - fil * Math.SQRT2 * x * gr); return acc / Math.sqrt(Math.PI); };
  const nearest = (x, y) => { let best = null, br = Infinity; for (const e of eyes) { const [rho, gr] = ell(e, x, y); if (rho < br) { br = rho; best = [e, rho, gr]; } } return best; };
  // skin (option, 08/10/2026): one smooth surface for the whole upper face — a B-spline z(x, y) seen from the front, fitted to the
  // front view of the face (the eyes, the muzzle and the other colours left out, robust) — instead of a quadric around each eye: the
  // forehead between the eyes and the skin around them alike. In its box (fading over `margin`) the skin lies on it, the eyes' old
  // bumps sink into it, and what stands off it elsewhere (a cheek spot) stays.
  let skinZ = null, skinW = null;
  if (o.skin) {
    const S = o.skin, box = fr.toLocalBox(S.box), px = (S.px ?? .004) / s, map = D.rasterize(m, box, px), excl = new Set((S.exclude || ['features', 'muzzle', 'spots']).map(n => m.names.indexOf(n))), pts = [];
    for (let j = 0; j < map.H; j++) for (let i = 0; i < map.W; i++) { const q = j * map.W + i, z = map.Z[q]; if (!Number.isFinite(z) || map.FID[q] < 0 || excl.has(label[map.FID[q]])) continue; const x = box[0] + (i + .5) * px, y = box[1] + (j + .5) * px;
      if (nearest(x, y)[1] < (S.eyeClear ?? 1.5)) continue; if (guard && guard.s(x, y) * s > -(S.muzzleClear ?? .01)) continue; pts.push([x, y, z]); }
    const k = (S.knot ?? .06) / s, surf = splineSurface(pts, {a0: box[0], a1: box[2], b0: box[1], b1: box[3], ha: k, hb: k, smoothing: S.smooth ?? .05, drop: (S.drop ?? .004) / s, iters: S.iters ?? 4});
    log('eyes: skin fit on', surf.used, 'of', pts.length, 'points, rms', (surf.rms * s).toFixed(5)); skinZ = surf.f;
    const mg = (S.margin ?? .06) / s, [rg0, rg1] = (S.reliefBand ?? [.006, .015]).map(v => v / s), keepOld = S.eyeOld ?? 1.6;
    skinW = (x, y, z) => { let w = smooth(box[0], box[0] + mg, x) * (1 - smooth(box[2] - mg, box[2], x)) * smooth(box[1], box[1] + mg, y) * (1 - smooth(box[3] - mg, box[3], y)); if (w <= 0) return 0;
      if (nearest(x, y)[1] > keepOld) w *= 1 - smooth(rg0, rg1, Math.abs(z - skinZ(x, y))); return w; };
  }
  const baseOf = (e, x, y) => skinZ ? skinZ(x, y) : e.det.baseAt(x, y);
  const weight = (x, y, z) => { const [e, rho] = nearest(x, y); if (!skinZ && rho >= f1) return 0; const zb = baseOf(e, x, y); if (z < zb - depth || z > zb + h + depth) return 0;
    let w = skinZ ? skinW(x, y, z) : 1 - smooth(f0, f1, rho); if (guard && w > 0) { const sm = guard.s(x, y) * s; w *= 1 - smooth(-pg1, -pg0, sm); } return w; };
  const zAt = (x, y) => { const [e, rho, gr] = nearest(x, y); return baseOf(e, x, y) + dome(rho, gr); };
  const target = (x, y, z) => { const w = weight(x, y, z); if (w <= 0) return [0, x, y, z]; return [w, x, y, z + w * (zAt(x, y) - z)]; };
  const hs = 1e-6, normal = (x, y) => { const zx = (zAt(x + hs, y) - zAt(x - hs, y)) / (2 * hs), zy = (zAt(x, y + hs) - zAt(x, y - hs)) / (2 * hs), l = Math.hypot(zx, zy, 1); return [-zx / l, -zy / l, 1 / l]; };
  const crease = (x, y) => { const [, rho, gr] = nearest(x, y); return (1 - rho) / gr * s; };
  const res = refineMove(m, {s, target, normal, crease, tol: o.tol, minLen: o.minLen, maxLen: o.maxLen, maxAngle: o.maxAngle, creaseBand: o.creaseBand, passes: o.passes}, (...q) => log('eyes:', ...q));
  // lighter: the flat skin away from the eyes (outside their rims by `simplifyKeep`) collapses (surface-rebuild.cjs simplifyInside);
  // the rims and the eyes stay as refined
  if (o.simplifyTol) await simplifyInside(m, {s, normals: res.normals, free: (v, {w}) => { const c = res.creaseOf.get(v); return w >= .999 && c !== null && c < -(o.simplifyKeep ?? .012); }, tol: o.simplifyTol, normalWeight: o.normalWeight, label: Math.max(0, m.names.indexOf(o.surround || 'coat'))}, (...q) => log('eyes:', ...q));
  return {...res, ellipses: eyes.map(({det, ...e}) => e)};
}

module.exports = {rebuildEyes};
