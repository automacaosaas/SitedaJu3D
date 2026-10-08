// The lamps' paint aligned with the relief (07/10/2026: "corrigir os relevos das pintinhas, bem delimitado pela sua própria cor, sem
// vazar nada… alinhado com o relevo, com o modelo 3D"). Steps:
//  1. patches bounded by creases (T°): in a patch that is mostly one colour, the other "base" colours become it (the spots fill
//     their plateau, the muzzle its bump; the yellow around them loses the brown/cream that leaked);
//  2. small details (eyes): patches closed by thickened creases; a small patch that is mostly a detail colour becomes all of it, and
//     the detail colour that spilled from it onto the next patch goes back to that patch's colour;
//  3. graph cut along the creases for what is left (nostrils, smile);
//  4. smooth borders across the triangles (crisp.cjs).
// node lamp-fix.cjs <in.glb> <out.glb> '<options JSON>'
const fs = require('fs');
const lib = require('./seg-lib.cjs');
const {patches} = require('./patches.cjs');
const crisp = require('./crisp.cjs');
const {projectTarget, seedRegions, frame} = require('./project2d.cjs');
const {cut} = require('./snap.cjs');
const exact = require('./exact.cjs');

async function run(file, out, opt) {
  const t0 = Date.now(), m = await lib.load(file);
  // 0t. the giraffe's neck rebuilt smooth (tube-rebuild.cjs): a smooth tube, the spots with regular outlines and the same relief, the
  //     mesh refined where the surface bends; it changes the mesh, so it comes before anything else reads it
  // (`protect` of the late parts: an exact entry or its index — the muzzle)
  const exactOf = p => typeof p === 'number' ? opt.exact[p] : p, tr = opt.tubeRebuild;
  const tubeO = tr && {...tr, band: tr.band && {...tr.band, protect: exactOf(tr.band.protect)}, cheeks: tr.cheeks && {...tr.cheeks, protect: exactOf(tr.cheeks.protect)}};
  const tubeR = tubeO ? await require('./tube-rebuild.cjs').rebuildTube(m, tubeO, (...a) => console.log('0t', ...a)) : null;
  // 0e. the eyes rebuilt (eye-rebuild.cjs): two equal clean domes on a clean skin, the muzzle (`protect`: an exact entry or its index)
  //     out of reach
  const eyeO = opt.eyeRebuild, eyesR = eyeO ? await require('./eye-rebuild.cjs').rebuildEyes(m, {...eyeO, protect: typeof eyeO.protect === 'number' ? opt.exact[eyeO.protect] : eyeO.protect}, (...a) => console.log('0e', ...a)) : null;
  // 0. reshaped reliefs before anything else reads the geometry: the nostrils rebuilt as two equal, aligned domes (exact.cjs domes)
  const early = {};
  let rebuilt = null; if (opt.domes) { rebuilt = exact.domes(m, Uint8Array.from(m.label), m.names, opt.domes); console.log('0 domes:', rebuilt.info, '· vertices moved', rebuilt.moved.size); }
  // 0b. smooth patches (folds and dents of the mesh beside the features): the eyes (their ellipses, from the exact targets named in
  // keepExact) and the new domes stay; everything else in the patch lies on the surface around it
  if (opt.smoothRegions?.length) {
    const ring0 = lib.vertexRing(m), keeps = [];
    // the eyes are measured here, before the patches move anything, and the same outlines paint them later (step 5)
    for (const i of opt.smoothKeepExact || []) { const t = opt.exact[i], det = exact.contour(m, Uint8Array.from(m.label), m.names, t); early[i] = det; keeps.push((x, y) => -det.s(x, y) - (opt.smoothKeepMargin ?? .006) / frame(m).s); }
    for (const e of rebuilt?.ellipses || []) { const c = Math.cos(e.ang), s = Math.sin(e.ang); keeps.push((x, y) => { const u = ((x - e.cx) * c + (y - e.cy) * s) / (e.a * 1.04), w = (-(x - e.cx) * s + (y - e.cy) * c) / (e.b * 1.04); return (Math.hypot(u, w) - 1) * Math.min(e.a, e.b); }); }
    const keep = (x, y) => Math.min(...keeps.map(f => f(x, y)));
    for (const r of opt.smoothRegions) { const out = exact.smoothRegion(m, r, keep, ring0); console.log('0b smooth', JSON.stringify(r.at), 'moved', out.moved.size, 'fitted on', out.fitted); rebuilt ||= {moved: new Set(), ellipses: []}; for (const v of out.moved) rebuilt.moved.add(v); }
  }
  const topo = lib.topology(m), {adj, A, C} = topo, nf = m.nf, names = m.names, K = names.length;
  let ring = lib.vertexRing(m), label = Uint8Array.from(m.label);
  const idOf = n => names.indexOf(n);
  const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
  const count = () => names.map((n, k) => `${n} ${label.filter(l => l === k).length}`).join(' · ');
  log('in', count());
  // 0. forced colours inside boxes (where the texture was simply wrong)
  // forceRender: the same with a box in render units [x0, y0, x1, y1] seen from the front (a stray fragment of a colour beside an eye)
  { const fr = frame(m); for (const {box, name, only} of opt.forceRender || []) { const k = idOf(name); let c = 0; for (let f = 0; f < nf; f++) { const x = (C[f * 3] - fr.ctr[0]) * fr.s, y = (C[f * 3 + 1] - fr.lo[1]) * fr.s - 1.9, z = (C[f * 3 + 2] - fr.ctr[2]) * fr.s; if (z > 0 && x >= box[0] && y >= box[1] && x <= box[2] && y <= box[3] && (!only || only.includes(names[label[f]]))) { label[f] = k; c++; } } log('forceRender', name, JSON.stringify(box), c); } }
  for (const {box, name, only} of opt.force || []) { const k = idOf(name); let c = 0; for (let f = 0; f < nf; f++) { const x = C[f * 3], y = C[f * 3 + 1], z = C[f * 3 + 2]; if (x >= box[0] && y >= box[1] && z >= box[2] && x <= box[3] && y <= box[4] && z <= box[5] && (!only || only.includes(names[label[f]]))) { label[f] = k; c++; } } log('force', name, c); }
  // 1. base patches
  const base = new Set((opt.base || []).map(idOf)), detail = new Set((opt.details || []).map(idOf));
  {
    const {pid, list} = patches(m, topo, opt.T ?? 8, 1, 0); let changed = 0;
    for (const fsP of list) {
      if (fsP.length < (opt.minPatch ?? 30)) continue;
      const area = new Float64Array(K); for (const f of fsP) area[label[f]] += A[f];
      let baseTot = 0; for (const k of base) baseTot += area[k];
      let best = -1, bv = 0; for (const k of base) if (area[k] > bv) { bv = area[k]; best = k; }
      if (best < 0 || bv / baseTot < (opt.purity ?? .75)) continue;
      // only fragments: a connected piece of another base colour inside the patch smaller than fragMax faces (a whole spot that
      // shares a patch with the coat through a gap in its crease stays a spot)
      const inP = new Set(fsP), seen = new Set();
      for (const f0 of fsP) {
        if (seen.has(f0) || !base.has(label[f0]) || label[f0] === best) continue;
        const comp = [f0]; seen.add(f0); for (let i = 0; i < comp.length; i++) for (const g of adj[comp[i]]) if (!seen.has(g) && inP.has(g) && label[g] === label[f0]) { seen.add(g); comp.push(g); }
        if (comp.length > (opt.fragMaxBy?.[names[label[f0]]] ?? opt.fragMax ?? 800)) continue;
        for (const f of comp) { label[f] = best; changed++; }
      }
    }
    log('1 base patches', list.length, 'changed', changed, '|', count());
  }
  // 2. details in closed patches
  if (detail.size) {
    const {pid, list} = patches(m, topo, opt.T2 ?? 6, 1, opt.dilate ?? 2), total = A.reduce((s, v) => s + v, 0);
    const isDetailPatch = new Uint8Array(list.length), patchMajor = new Int16Array(list.length);
    list.forEach((fsP, id) => { const area = new Float64Array(K); let tot = 0; for (const f of fsP) { area[label[f]] += A[f]; tot += A[f]; } let best = 0; for (let k = 1; k < K; k++) if (area[k] > area[best]) best = k; patchMajor[id] = best;
      if (detail.has(best) && area[best] / tot > (opt.detailPurity ?? .55) && tot < (opt.detailMaxArea ?? .01) * total) isDetailPatch[id] = 1; });
    let filled = 0, removed = 0;
    list.forEach((fsP, id) => { if (!isDetailPatch[id]) return; const k = patchMajor[id]; for (const f of fsP) if (label[f] !== k) { label[f] = k; filled++; } });
    // spill: detail-coloured faces outside a detail patch, connected (through detail faces) to a detail patch of the same colour
    const seen = new Uint8Array(nf);
    for (let s = 0; s < nf; s++) {
      if (seen[s] || !detail.has(label[s]) || isDetailPatch[pid[s]]) continue;
      const comp = [s]; seen[s] = 1; let touches = false;
      for (let i = 0; i < comp.length; i++) for (const g of adj[comp[i]]) { if (label[g] !== label[s]) continue; if (isDetailPatch[pid[g]]) { touches = true; continue; } if (!seen[g]) { seen[g] = 1; comp.push(g); } }
      if (!touches || comp.length > (opt.spillMax ?? 4000)) continue;
      // the detail patch it touches must hold most of the blob (an eye with a rim of spill), not a sliver of it (a nostril)
      const patchIds = new Set(); for (const f of comp) for (const g of adj[f]) if (label[g] === label[s] && isDetailPatch[pid[g]]) patchIds.add(pid[g]);
      let patchArea = 0; for (const id of patchIds) for (const f of list[id]) patchArea += A[f]; let compArea = 0; for (const f of comp) compArea += A[f];
      if (patchArea < (opt.spillRatio ?? 1.5) * compArea) continue;
      for (const f of comp) { const k = patchMajor[pid[f]]; const to = detail.has(k) ? null : k; if (to !== null) { label[f] = to; removed++; } }
    }
    log('2 detail patches', isDetailPatch.reduce((s, v) => s + v, 0), 'filled', filled, 'spill removed', removed, '|', count());
  }
  // 2a. seeded regions (front view): each lock of the mane, the rainbow and the clouds take the colour of their seed
  for (const r of opt.regions || []) { const {out} = seedRegions(m, label, r, names); let c = 0; for (const [f, k] of out) if (label[f] !== k) { label[f] = k; c++; } log('2a region', JSON.stringify(r.box), 'faces', out.size, 'changed', c); }
  // 2b. graph cut: the borders that are left move into the creases nearby (concave folds cost little to follow)
  if (opt.cut) { const out = cut(m, topo, label, opt.cut); label.set(out); log('2b cut |', count()); }
  const projected = [];
  for (const t of opt.projected || []) {
    const k = idOf(t.name), r = projectTarget(m, label, k, t); projected.push({k, M: r.M});
    const to = idOf(t.clearTo); let c = 0;
    for (let f = 0; f < nf; f++) if (label[f] === k && r.M.has(m.F[f * 3]) && r.M.has(m.F[f * 3 + 1]) && r.M.has(m.F[f * 3 + 2])) { label[f] = to; c++; }
    log('3 projected', t.name, t.mode, JSON.stringify(t.box), 'vertices', r.M.size, 'inside', [...r.M.values()].filter(v => v > .5).length, 'cleared', c);
  }
  // straight bands (the purple base of the unicorn): the border with `other` below yMax (render units) becomes a level line at the
  // median height of the painted border
  const bands = [];
  for (const b of opt.bands || []) {
    const fr = frame(m), k = idOf(b.name), o = idOf(b.other), ry0 = f => (C[f * 3 + 1] - fr.lo[1]) * fr.s - 1.9, rz = f => (C[f * 3 + 2] - fr.ctr[2]) * fr.s, ys = [];
    // inside the band's box (yMin ≤ y; z ≤ zMax), else "above" (out of reach)
    const ry = f => (b.yMin != null && ry0(f) < b.yMin) || (b.zMax != null && rz(f) > b.zMax) ? Infinity : ry0(f);
    for (let f = 0; f < nf; f++) if (label[f] === k && ry(f) < b.yMax && adj[f].some(g => label[g] === o)) ys.push(ry(f));
    ys.sort((a, c) => a - c); const yb = b.y ?? ys[ys.length >> 1]; let c = 0;
    for (let f = 0; f < nf; f++) { const y = ry(f); if (y >= b.yMax) continue; if (label[f] === o && y < yb) { label[f] = k; c++; } else if (label[f] === k && y >= yb) { label[f] = o; c++; } }
    bands.push({k, o, yb, yMax: b.yMax, yMin: b.yMin ?? -Infinity, zMax: b.zMax ?? Infinity, w: b.soft ?? .004, fr}); log('band', b.name, 'at', yb.toFixed(4), 'changed', c);
  }
  // 3b. the band under the giraffe's head (tube-rebuild.cjs, step 8) smoothed now that the colours are settled: it refines the mesh
  //     there (the new faces keep the settled colours) and moves it, so the neighbours are taken again
  //     then the cheek spots (step 8 there), rebuilt like the neck's
  for (const run of [tubeR?.runBand, tubeR?.runCheeks]) if (run) { m.label = label; await run(); label = Uint8Array.from(m.label); ring = lib.vertexRing(m); log('3b late part | faces', m.nf, '|', count()); }
  if (opt.saveLabels) fs.writeFileSync(opt.saveLabels, Buffer.from(label.buffer));
  // 4. smooth borders
  const fl = crisp.fields(m, label, ring, K, opt.smooth ?? 3, {iterationsBy: Object.fromEntries(Object.entries(opt.smoothBy || {}).map(([n, v]) => [idOf(n), v])), bias: Object.fromEntries(Object.entries(opt.bias || {}).map(([n, v]) => [idOf(n), v]))});
  for (const {k, o, yb, yMax, yMin, zMax, w, fr} of bands) for (let v = 0; v < m.nv; v++) { const y = (m.P[v * 3 + 1] - fr.lo[1]) * fr.s - 1.9, z = (m.P[v * 3 + 2] - fr.ctr[2]) * fr.s; if (y >= yMax || y < yMin || z > zMax || fl[k][v] + fl[o][v] < .5) continue; const s = fl[k][v] + fl[o][v], val = Math.max(0, Math.min(1, (yb - y) / w + .5)); fl[k][v] = s * val; fl[o][v] = s * (1 - val); }
  for (const {k, M} of projected) for (const [v, val] of M) { let S = 0; for (let j = 0; j < K; j++) if (j !== k) S += fl[j][v]; const keep = Math.max(0, 1 - val); for (let j = 0; j < K; j++) if (j !== k) fl[j][v] = S > 0 ? fl[j][v] * keep / S : 0; fl[k][v] = val; }
  // 5. exact borders from the relief (exact.cjs): the neck's spots on the tube, then the front details in order (muzzle, eyes,
  //    nostrils, smile), each a signed function of the position cut exactly across the triangles
  for (const t of opt.tube || []) { const r = exact.tube(m, fl, K, names, ring, t); log('5 tube', t.name, 'vertices', r.n, 'inside', r.inside, process.env.HIST ? '\n' + r.hist : ''); }
  // normals: 'geometry' (08/10/2026) = from the final shape, area-weighted and averaged with the neighbours `normalPasses` times — what
  // lamp-glb.html did in the browser for the pictures, now in the model itself, so the site's 3D and the pictures shade alike; else
  // the original ones (the moved reliefs rebuilt from their new faces)
  // the paint's 'facing' (where a front detail fades out on a steep flank) keeps reading the original normals (vnPaint): new shading
  // normals must not move a border
  const overrides = [], claimed = names.map(() => new Uint8Array(m.nv)), vnPaint = crisp.vertexNormals(m), vn = opt.normals === 'geometry' ? crisp.geometricNormals(m, ring, opt.normalPasses ?? 4) : vnPaint;
  if (rebuilt) log('0 domes: normals rebuilt for', exact.rebuildNormals(m, vnPaint, rebuilt.moved, ring), 'vertices');
  // the rebuilt neck and eyes: the surface's own normals (blended where the rebuilt part fades out), and the neck's spots painted
  // exactly over their relief (before the front details)
  for (const r of [tubeR, eyesR]) if (r) for (const [v, {n, w}] of r.normals) for (const arr of new Set([vn, vnPaint])) { const q = [0, 1, 2].map(j => w * n[j] + (1 - w) * arr[v * 3 + j]), l = Math.hypot(...q) || 1; arr.set(q.map(x => x / l), v * 3); }
  if (tubeR) {
    const t = opt.tubeRebuild, k = idOf(t.name || 'spots');
    for (const ov of tubeR.overrides(k, idOf(t.other || 'coat'), t.refine)) { log('5 tube rebuilt', t.name || 'spots', 'vertices', exact.applyVertices(m, fl, K, ov, claimed[k], vnPaint)); overrides.push(ov); }
    log('5 tube rebuilt: normals', tubeR.normals.size);
  }
  const dets = (opt.exact || []).map((t, i) => early[i] || (t.mode === 'line' ? exact.line(m, label, names, t) : exact.contour(m, label, names, t)));
  if (process.env.DEBUG_DETS) dets.forEach((d, i) => d.R && log('det', i, 'centre', ((d.centre[0] - frame(m).ctr[0]) * frame(m).s).toFixed(3), ((d.centre[1] - frame(m).lo[1]) * frame(m).s - 1.9).toFixed(3), 'R', Array.from({length: 24}, (_, j) => (d.R[j * 15] * d.res * frame(m).s).toFixed(3)).join(' ')));
  // mirrored pairs ('mirror': same group name): the same axes (the mean), the angle mirrored across the vertical — the two nostrils alike
  for (const g of new Set((opt.exact || []).map(t => t.mirror).filter(Boolean))) {
    const pair = dets.filter((d, i) => opt.exact[i].mirror === g && d.ell); if (pair.length !== 2) continue;
    pair.sort((p, q) => p.centre[0] - q.centre[0]);
    const a = (pair[0].ell.a + pair[1].ell.a) / 2, b = (pair[0].ell.b + pair[1].ell.b) / 2;
    // the angle: mean of the left one and the mirror of the right one, weighted by how oval each is (doubled-angle vectors)
    let sx = 0, sy = 0; pair.forEach((d, i) => { const e = (d.ell.a - d.ell.b) / (d.ell.a + d.ell.b), th = i ? Math.PI - d.ell.ang : d.ell.ang; sx += e * Math.cos(2 * th); sy += e * Math.sin(2 * th); });
    const angL = Math.atan2(sy, sx) / 2; pair[0].setEllipse(a, b, angL); pair[1].setEllipse(a, b, Math.PI - angL);
    log('5 mirror', g, `axes ${(a * frame(m).s).toFixed(3)}×${(b * frame(m).s).toFixed(3)} at ${(angL * 180 / Math.PI).toFixed(0)}°`);
  }
  // the rebuilt nostrils are painted with their domes' own ellipses (grown a hair to cover the foot)
  // the rebuilt eyes likewise, with their domes' ellipses (`eyeGrow`: a hair over the rim, the fillet's middle)
  (opt.exact || []).forEach((t, i) => { if (eyesR && t.eye != null) { const e = eyesR.ellipses[t.eye], g = t.eyeGrow ?? 1.005; dets[i].setEllipseAt(e.cx, e.cy, e.a * g, e.b * g, e.ang); dets[i].extent = Math.max(e.a, e.b) * g + Math.hypot(e.cx - dets[i].centre[0], e.cy - dets[i].centre[1]); } });
  (opt.exact || []).forEach((t, i) => { if (rebuilt && t.dome != null) { const e = rebuilt.ellipses[t.dome], g = t.domeGrow ?? 1.02; dets[i].setEllipseAt(e.cx, e.cy, e.a * g, e.b * g, e.ang); dets[i].extent = Math.max(e.a, e.b) * g + Math.hypot(e.cx - dets[i].centre[0], e.cy - dets[i].centre[1]); } });
  for (const [i, t] of (opt.exact || []).entries()) {
    const k = idOf(t.name), det = dets[i];
    const ov = exact.override(m, k, det, {...t, surround: t.surround ? idOf(t.surround) : -1}), n = exact.applyVertices(m, fl, K, ov, claimed[k], vnPaint); overrides.push(ov);
    log('5 exact', t.name, t.mode || 'contour', JSON.stringify(t.box), 'vertices', n, det.R ? `relief top ${det.topRender.toFixed(4)} · rough ${det.rough.toFixed(4)} · r ${(det.extent * frame(m).s).toFixed(3)} ${det.info}` : `points ${det.points.length}`);
  }
  // a colour that only the details draw (the giraffe's black): nothing of it outside them
  for (const name of opt.onlyExact || []) log('5 only exact', name, 'cleared', exact.onlyClaimed(m, fl, K, idOf(name), claimed[idOf(name)], ring, idOf(opt.fallback || names[0])));
  // ownNormals: [{name, near (an exact entry: its outline), reach: [r0, r1] (render), radius, facing}] (08/10/2026, the gallery's zoom: light
  // wedges on the coat all around the muzzle) — where the mesh does not resolve a crease (the long Rodin triangles at the muzzle's foot
  // join the flat coat to the muzzle's wall, and the coat's part of them, after the paint cut, carried the wall's tilted normal far into
  // the coat), the part of a triangle painted `name` shades with that colour's own surface: its corners within r0 of the outline (on
  // either side) take the fixed-distance average of the faces of that colour that touch no other one (crisp.metricField), blended
  // back to their own normal by r1. The shape does not move; the shading breaks only at the paint border, where the colour changes.
  // facing: [f0, f1] — only where the surface looks to the front (its normal's z from f0 to f1; under the muzzle, where the front view
  // does not draw the paint border, the steeper own normals would only light up its teeth)
  const vnBy = names.map(() => null);
  for (const o of opt.ownNormals || []) {
    const fr = frame(m), k = idOf(o.name), det = dets[o.near], [r0, r1] = o.reach, other = new Uint8Array(m.nv), reach = det.extent + r1 / fr.s;
    for (let f = 0; f < m.nf; f++) if (label[f] !== k) for (let j = 0; j < 3; j++) other[m.F[f * 3 + j]] = 1;
    const field = crisp.metricField(m, {s: fr.s, radius: o.radius ?? .012, faceOk: f => label[f] === k && !other[m.F[f * 3]] && !other[m.F[f * 3 + 1]] && !other[m.F[f * 3 + 2]],
      box: [det.centre[0] - reach, det.centre[1] - reach, fr.ctr[2], det.centre[0] + reach, det.centre[1] + reach, 2 * fr.ctr[2] - fr.lo[2]]});
    const arr = vnBy[k] || Float32Array.from(vn), smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); let n = 0;
    for (let v = 0; v < m.nv; v++) {
      const x = m.P[v * 3], y = m.P[v * 3 + 1], z = m.P[v * 3 + 2]; if (z < fr.ctr[2]) continue; const d = Math.abs(det.s(x, y)) * fr.s; if (!(d < r1) || !det.zOK(x, y, z)) continue;
      const q = field(x, y, z); if (!q) continue; const t = (1 - smooth((d - r0) / (r1 - r0))) * (o.facing ? smooth((vnPaint[v * 3 + 2] - o.facing[0]) / (o.facing[1] - o.facing[0])) : 1); if (t <= 0) continue; const mix = [0, 1, 2].map(j => t * q[j] + (1 - t) * arr[v * 3 + j]), l = Math.hypot(...mix) || 1;
      arr.set(mix.map(c => c / l), v * 3); n++;
    }
    vnBy[k] = arr; log('own normals', o.name, 'by', JSON.stringify(o.reach), 'corners', n);
  }
  const {geo, split, refined} = crisp.build(m, label, fl, vn, K, overrides.length ? {overrides, target: (opt.refineTarget ?? .004) / frame(m).s, maxDepth: opt.maxDepth ?? 4, facingNormals: vnPaint} : null, vnBy);
  log('4 crisp: split', split, 'faces (refined', refined, '); out', geo.map((G, k) => `${names[k]} ${G.idx.length / 3}`).join(' · '));
  const bytes = await crisp.writeGeo(m, geo, out, {compress: opt.compress !== false});
  log('written', out, Math.round(bytes / 1024), 'KB');
}
// the options: the JSON itself or the path of a .json file (girafa.json, unicornio.json)
const [file, out, json = '{}'] = process.argv.slice(2);
run(file, out, JSON.parse(/\.json$/i.test(json) ? fs.readFileSync(json, 'utf8') : json)).catch(e => { console.error(e); process.exit(1); });
