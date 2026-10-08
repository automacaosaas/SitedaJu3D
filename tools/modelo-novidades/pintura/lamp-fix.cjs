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
  // 0. reshaped reliefs before anything else reads the geometry: the nostrils rebuilt as two equal, aligned domes (exact.cjs domes)
  let rebuilt = null; if (opt.domes) { rebuilt = exact.domes(m, Uint8Array.from(m.label), m.names, opt.domes); console.log('0 domes:', rebuilt.info, '· vertices moved', rebuilt.moved.size); }
  const topo = lib.topology(m), ring = lib.vertexRing(m), {adj, A, C} = topo, nf = m.nf, names = m.names, K = names.length;
  const idOf = n => names.indexOf(n), label = Uint8Array.from(m.label);
  const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
  const count = () => names.map((n, k) => `${n} ${label.filter(l => l === k).length}`).join(' · ');
  log('in', count());
  // 0. forced colours inside boxes (where the texture was simply wrong)
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
  if (opt.saveLabels) fs.writeFileSync(opt.saveLabels, Buffer.from(label.buffer));
  // 4. smooth borders
  const fl = crisp.fields(m, label, ring, K, opt.smooth ?? 3, {iterationsBy: Object.fromEntries(Object.entries(opt.smoothBy || {}).map(([n, v]) => [idOf(n), v])), bias: Object.fromEntries(Object.entries(opt.bias || {}).map(([n, v]) => [idOf(n), v]))});
  for (const {k, o, yb, yMax, yMin, zMax, w, fr} of bands) for (let v = 0; v < m.nv; v++) { const y = (m.P[v * 3 + 1] - fr.lo[1]) * fr.s - 1.9, z = (m.P[v * 3 + 2] - fr.ctr[2]) * fr.s; if (y >= yMax || y < yMin || z > zMax || fl[k][v] + fl[o][v] < .5) continue; const s = fl[k][v] + fl[o][v], val = Math.max(0, Math.min(1, (yb - y) / w + .5)); fl[k][v] = s * val; fl[o][v] = s * (1 - val); }
  for (const {k, M} of projected) for (const [v, val] of M) { let S = 0; for (let j = 0; j < K; j++) if (j !== k) S += fl[j][v]; const keep = Math.max(0, 1 - val); for (let j = 0; j < K; j++) if (j !== k) fl[j][v] = S > 0 ? fl[j][v] * keep / S : 0; fl[k][v] = val; }
  // 5. exact borders from the relief (exact.cjs): the neck's spots on the tube, then the front details in order (muzzle, eyes,
  //    nostrils, smile), each a signed function of the position cut exactly across the triangles
  for (const t of opt.tube || []) { const r = exact.tube(m, fl, K, names, ring, t); log('5 tube', t.name, 'vertices', r.n, 'inside', r.inside, process.env.HIST ? '\n' + r.hist : ''); }
  const overrides = [], claimed = names.map(() => new Uint8Array(m.nv)), vn = crisp.vertexNormals(m);
  if (rebuilt) log('0 domes: normals rebuilt for', exact.rebuildNormals(m, vn, rebuilt.moved, ring), 'vertices');
  const dets = (opt.exact || []).map(t => t.mode === 'line' ? exact.line(m, label, names, t) : exact.contour(m, label, names, t));
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
  (opt.exact || []).forEach((t, i) => { if (rebuilt && t.dome != null) { const e = rebuilt.ellipses[t.dome], g = t.domeGrow ?? 1.02; dets[i].setEllipseAt(e.cx, e.cy, e.a * g, e.b * g, e.ang); dets[i].extent = Math.max(e.a, e.b) * g + Math.hypot(e.cx - dets[i].centre[0], e.cy - dets[i].centre[1]); } });
  for (const [i, t] of (opt.exact || []).entries()) {
    const k = idOf(t.name), det = dets[i];
    const ov = exact.override(m, k, det, {...t, surround: t.surround ? idOf(t.surround) : -1}), n = exact.applyVertices(m, fl, K, ov, claimed[k], vn); overrides.push(ov);
    log('5 exact', t.name, t.mode || 'contour', JSON.stringify(t.box), 'vertices', n, det.R ? `relief top ${det.topRender.toFixed(4)} · rough ${det.rough.toFixed(4)} · r ${(det.extent * frame(m).s).toFixed(3)} ${det.info}` : `points ${det.points.length}`);
  }
  // a colour that only the details draw (the giraffe's black): nothing of it outside them
  for (const name of opt.onlyExact || []) log('5 only exact', name, 'cleared', exact.onlyClaimed(m, fl, K, idOf(name), claimed[idOf(name)], ring, idOf(opt.fallback || names[0])));
  const {geo, split, refined} = crisp.build(m, label, fl, vn, K, overrides.length ? {overrides, target: (opt.refineTarget ?? .004) / frame(m).s, maxDepth: opt.maxDepth ?? 4} : null);
  log('4 crisp: split', split, 'faces (refined', refined, '); out', geo.map((G, k) => `${names[k]} ${G.idx.length / 3}`).join(' · '));
  const bytes = await crisp.writeGeo(m, geo, out, {compress: opt.compress !== false});
  log('written', out, Math.round(bytes / 1024), 'KB');
}
const [file, out, json = '{}'] = process.argv.slice(2);
run(file, out, JSON.parse(json)).catch(e => { console.error(e); process.exit(1); });
