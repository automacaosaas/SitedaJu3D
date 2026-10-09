// Smooth colour borders that do not follow the triangles: per vertex, a membership field for each colour (area share of the faces
// around it), smoothed over the surface; inside each triangle the fields are linear, and each colour gets the part of the triangle
// where its field is the largest (exact clipping by half-planes, Sutherland–Hodgman). Borders become smooth curves across the
// triangles; triangles with a single colour stay as they are. Writes a GLB (one primitive per material, Meshopt like the site).
const fs = require('fs');
const {createRequire} = require('module');
const req = createRequire(require('path').join(process.env.GLTF_NM || 'C:/Users/LUIZ/tools/gltf/node_modules', '..', 'package.json'));
const {Document} = req('@gltf-transform/core');
const {meshopt, unpartition} = req('@gltf-transform/functions');
const {MeshoptEncoder} = req('meshoptimizer');
const lib = require('./seg-lib.cjs');

function vertexNormals(m) {
  const vn = new Float32Array(m.nv * 3);
  for (let f = 0; f < m.nf; f++) for (let c = 0; c < 3; c++) { const v = m.F[f * 3 + c], o = m.verts[m.corner[f * 3 + c]]; vn[v * 3] += o[3]; vn[v * 3 + 1] += o[4]; vn[v * 3 + 2] += o[5]; }
  for (let v = 0; v < m.nv; v++) { const l = Math.hypot(vn[v * 3], vn[v * 3 + 1], vn[v * 3 + 2]) || 1; vn[v * 3] /= l; vn[v * 3 + 1] /= l; vn[v * 3 + 2] /= l; }
  return vn;
}

// normals from the geometry (08/10/2026; what lamp-glb.html computed in the browser): per vertex the sum of the area-weighted normals
// of its faces, normalized, then `passes` rounds of averaging with the neighbours (the noise of the dense mesh goes, the shape stays)
function geometricNormals(m, ring, passes = 4) {
  const P = m.P, acc = new Float64Array(m.nv * 3);
  for (let f = 0; f < m.nf; f++) {
    const a = m.F[f * 3] * 3, b = m.F[f * 3 + 1] * 3, c = m.F[f * 3 + 2] * 3, ux = P[c] - P[b], uy = P[c + 1] - P[b + 1], uz = P[c + 2] - P[b + 2], vx = P[a] - P[b], vy = P[a + 1] - P[b + 1], vz = P[a + 2] - P[b + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; for (const v of [a, b, c]) { acc[v] += nx; acc[v + 1] += ny; acc[v + 2] += nz; }
  }
  let n = new Float64Array(m.nv * 3); const unit = (dst, src) => { for (let v = 0; v < m.nv; v++) { const l = Math.hypot(src[v * 3], src[v * 3 + 1], src[v * 3 + 2]) || 1; dst[v * 3] = src[v * 3] / l; dst[v * 3 + 1] = src[v * 3 + 1] / l; dst[v * 3 + 2] = src[v * 3 + 2] / l; } };
  unit(n, acc);
  for (let it = 0; it < passes; it++) { const s = Float64Array.from(n); for (let v = 0; v < m.nv; v++) for (const u of ring[v]) { s[v * 3] += n[u * 3]; s[v * 3 + 1] += n[u * 3 + 1]; s[v * 3 + 2] += n[u * 3 + 2]; } unit(n, s); }
  return Float32Array.from(n);
}

// a surface's own normal at any point, averaged over a fixed distance (08/10/2026, the foot of the giraffe's muzzle): the area-weighted
// normals of the allowed faces within `radius` (render units; weight (1 − d/r)²; twice and four times as far where nothing is that
// close), each face sampled on a grid of sub-triangles fine enough for its size, so a long triangle counts along all its length. Used
// where a crease is not resolved by the mesh: the long Rodin triangles fanning out of the muzzle's foot joined the coat to the muzzle's
// wall, and the coat's part of them (after the paint cut) carried the wall's tilted normal far into the coat — light wedges all around
// the muzzle in the close-up. spec: {s (render units per local unit), faceOk(f), radius, box ([x0, y0, z0, x1, y1, z1], local: only the
// faces that reach it)} → at(x, y, z) (local) → [nx, ny, nz] or null
function metricField(m, {s, faceOk, radius, box}) {
  const P = m.P, R = radius / s, lo = box.slice(0, 3).map(v => v - 4 * R), hi = box.slice(3).map(v => v + 4 * R);
  const key = (i, j, k) => (i + 1024) + (j + 1024) * 4096 + (k + 1024) * 16777216, grid = new Map();
  const put = (x, y, z, nx, ny, nz, w) => { const k = key(Math.floor((x - lo[0]) / R), Math.floor((y - lo[1]) / R), Math.floor((z - lo[2]) / R)); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(x, y, z, nx, ny, nz, w); };
  for (let f = 0; f < m.nf; f++) {
    const a = m.F[f * 3] * 3, b = m.F[f * 3 + 1] * 3, c = m.F[f * 3 + 2] * 3;
    if (Math.max(P[a], P[b], P[c]) < lo[0] || Math.min(P[a], P[b], P[c]) > hi[0] || Math.max(P[a + 1], P[b + 1], P[c + 1]) < lo[1] || Math.min(P[a + 1], P[b + 1], P[c + 1]) > hi[1] || Math.max(P[a + 2], P[b + 2], P[c + 2]) < lo[2] || Math.min(P[a + 2], P[b + 2], P[c + 2]) > hi[2] || !faceOk(f)) continue;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; if (!(Math.hypot(nx, ny, nz) > 0)) continue;
    const edge = Math.max(Math.hypot(ux, uy, uz), Math.hypot(vx, vy, vz), Math.hypot(P[c] - P[b], P[c + 1] - P[b + 1], P[c + 2] - P[b + 2])), n = Math.max(1, Math.min(32, Math.ceil(edge / (R * .4)))), w = 1 / (n * n);
    // the n² sub-triangles' centres (up: (i + ⅓, j + ⅓)/n; down: (i + ⅔, j + ⅔)/n), each with its share of the face (the unnormalized
    // cross product carries the area)
    for (let i = 0; i < n; i++) for (let j = 0; i + j < n; j++) for (const d of i + j < n - 1 ? [1 / 3, 2 / 3] : [1 / 3]) {
      const p = (i + d) / n, q = (j + d) / n; put(P[a] + p * ux + q * vx, P[a + 1] + p * uy + q * vy, P[a + 2] + p * uz + q * vz, nx, ny, nz, w);
    }
  }
  return (x, y, z) => {
    const i0 = Math.floor((x - lo[0]) / R), j0 = Math.floor((y - lo[1]) / R), k0 = Math.floor((z - lo[2]) / R);
    for (const g of [1, 2, 4]) {
      let ax = 0, ay = 0, az = 0; const Rg = R * g;
      for (let i = i0 - g; i <= i0 + g; i++) for (let j = j0 - g; j <= j0 + g; j++) for (let k = k0 - g; k <= k0 + g; k++) {
        const l = grid.get(key(i, j, k)); if (!l) continue;
        for (let t = 0; t < l.length; t += 7) { const d = Math.hypot(l[t] - x, l[t + 1] - y, l[t + 2] - z); if (d >= Rg) continue; const wt = l[t + 6] * (1 - d / Rg) ** 2; ax += l[t + 3] * wt; ay += l[t + 4] * wt; az += l[t + 5] * wt; }
      }
      const len = Math.hypot(ax, ay, az); if (len > 0) return [ax / len, ay / len, az / len];
    }
    return null;
  };
}

// fields[k][v]; `iterations` of Laplacian smoothing (weight .5); `keep` = labels whose field is not smoothed (thin features keep their
// width: their field is sharpened instead by `gain`)
function fields(m, label, ring, K, iterations, opt = {}) {
  const A = new Float32Array(m.nf); for (let f = 0; f < m.nf; f++) { const a = m.F[f * 3], b = m.F[f * 3 + 1], c = m.F[f * 3 + 2], P = m.P; const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2]; A[f] = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2; }
  const fl = Array.from({length: K}, () => new Float32Array(m.nv)), tot = new Float32Array(m.nv);
  for (let f = 0; f < m.nf; f++) for (let c = 0; c < 3; c++) { const v = m.F[f * 3 + c]; fl[label[f]][v] += A[f]; tot[v] += A[f]; }
  for (const arr of fl) for (let v = 0; v < m.nv; v++) arr[v] /= tot[v] || 1;
  const present = fl.map(arr => arr.some(x => x > 0));
  for (let k = 0; k < K; k++) {
    if (!present[k]) continue;
    const its = opt.iterationsBy?.[k] ?? iterations;
    let a = fl[k], b = new Float32Array(m.nv);
    for (let it = 0; it < its; it++) { for (let v = 0; v < m.nv; v++) { const r = ring[v]; if (!r.length) { b[v] = a[v]; continue; } let s = 0; for (const u of r) s += a[u]; b[v] = .5 * a[v] + .5 * s / r.length; } [a, b] = [b, a]; }
    fl[k] = a;
  }
  // a bias per label (positive grows the region a little): thin dark details read thinner after smoothing
  if (opt.bias) for (const [k, bias] of Object.entries(opt.bias)) { const arr = fl[k]; if (arr) for (let v = 0; v < m.nv; v++) arr[v] += bias * (arr[v] > 0 ? 1 : 0); }
  return fl;
}

function clipPoly(poly, g) { // poly: [{b:[3], g:value}]; keep g >= 0
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], gp = g(p.b), gq = g(q.b);
    if (gp >= 0) out.push(p);
    if ((gp >= 0) !== (gq >= 0)) { const t = gp / (gp - gq); out.push({b: [p.b[0] + t * (q.b[0] - p.b[0]), p.b[1] + t * (q.b[1] - p.b[1]), p.b[2] + t * (q.b[2] - p.b[2])]}); }
  }
  return out;
}

// ref (exact.cjs): {overrides, target, maxDepth} — a triangle that a detail's border may cross (override.crosses) and is bigger than
// `target` is split into 4^depth smaller ones (flat: the shape does not change), each corner getting the fields interpolated and then
// the details' exact values; the border then follows the detail's smooth outline instead of one straight cut per big triangle
// vnBy[k] (optional): the corner normals the vertices of colour k interpolate, in place of vn (lamp-fix.cjs ownNormals: each side of a
// crease the mesh does not resolve shades with its own surface)
function build(m, label, fl, vn, K, ref = null, vnBy = null) {
  const geo = Array.from({length: K}, () => ({pos: [], nor: [], idx: [], map: new Map()}));
  const P = m.P, vn0 = vn;
  const addVert = (k, b, vs) => {
    const x = b[0] * P[vs[0] * 3] + b[1] * P[vs[1] * 3] + b[2] * P[vs[2] * 3], y = b[0] * P[vs[0] * 3 + 1] + b[1] * P[vs[1] * 3 + 1] + b[2] * P[vs[2] * 3 + 1], z = b[0] * P[vs[0] * 3 + 2] + b[1] * P[vs[1] * 3 + 2] + b[2] * P[vs[2] * 3 + 2];
    const key = `${Math.round(x * 2e6)},${Math.round(y * 2e6)},${Math.round(z * 2e6)}`, G = geo[k];
    let i = G.map.get(key); if (i !== undefined) return i;
    const vn = vnBy?.[k] || vn0;
    let nx = b[0] * vn[vs[0] * 3] + b[1] * vn[vs[1] * 3] + b[2] * vn[vs[2] * 3], ny = b[0] * vn[vs[0] * 3 + 1] + b[1] * vn[vs[1] * 3 + 1] + b[2] * vn[vs[2] * 3 + 1], nz = b[0] * vn[vs[0] * 3 + 2] + b[1] * vn[vs[1] * 3 + 2] + b[2] * vn[vs[2] * 3 + 2]; const l = Math.hypot(nx, ny, nz) || 1;
    i = G.pos.length / 3; G.map.set(key, i); G.pos.push(x, y, z); G.nor.push(nx / l, ny / l, nz / l); return i;
  };
  const argmax = v => { let best = 0, bv = -1; for (let k = 0; k < K; k++) if (fl[k][v] > bv) { bv = fl[k][v]; best = k; } return best; };
  const vmax = new Uint8Array(m.nv); for (let v = 0; v < m.nv; v++) vmax[v] = argmax(v);
  let split = 0, refined = 0;
  const clipInto = (vs, corners) => {   // corners: [{b (barycentric in the original triangle), vec (K fields)}] × 3
    const L = corners.map(c => { let best = 0; for (let k = 1; k < K; k++) if (c.vec[k] > c.vec[best]) best = k; return best; });
    if (L[0] === L[1] && L[1] === L[2]) { geo[L[0]].idx.push(...corners.map(c => addVert(L[0], c.b, vs))); return; }
    const cand = []; for (let k = 0; k < K; k++) if (corners.some(c => c.vec[k] > .15) || L.includes(k)) cand.push(k);
    for (const k of cand) {
      let poly = [{b: [1, 0, 0]}, {b: [0, 1, 0]}, {b: [0, 0, 1]}];
      for (const j of cand) { if (j === k || !poly.length) continue; const d = corners.map(c => c.vec[k] - c.vec[j]); poly = clipPoly(poly, b => b[0] * d[0] + b[1] * d[1] + b[2] * d[2] + (k < j ? 1e-9 : -1e-9)); }
      if (poly.length < 3) continue;
      const ids = poly.map(p => addVert(k, [0, 1, 2].map(t => p.b[0] * corners[0].b[t] + p.b[1] * corners[1].b[t] + p.b[2] * corners[2].b[t]), vs));
      for (let i = 1; i + 1 < ids.length; i++) if (ids[0] !== ids[i] && ids[i] !== ids[i + 1] && ids[0] !== ids[i + 1]) geo[k].idx.push(ids[0], ids[i], ids[i + 1]);
    }
  };
  for (let f = 0; f < m.nf; f++) {
    const vs = [m.F[f * 3], m.F[f * 3 + 1], m.F[f * 3 + 2]], L = vs.map(v => vmax[v]);
    if (ref?.overrides.length) {
      const p = vs.map(v => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]), d = Math.max(...[0, 1, 2].map(i => Math.hypot(p[i][0] - p[(i + 1) % 3][0], p[i][1] - p[(i + 1) % 3][1], p[i][2] - p[(i + 1) % 3][2])));
      let depth = 0;
      for (const ov of ref.overrides) { const tg = ov.target || ref.target; if (d > tg && ov.crosses(p, d)) depth = Math.max(depth, Math.min(ref.maxDepth ?? 4, Math.ceil(Math.log2(d / tg)))); }
      if (depth) {
        refined++; split++;
        const n = 1 << depth, cache = new Map(), at = (i, j) => {
          const key = i * (n + 1) + j; let c = cache.get(key); if (c) return c;
          const b = [(n - i - j) / n, i / n, j / n], vec = new Float64Array(K);
          for (let k = 0; k < K; k++) vec[k] = b[0] * fl[k][vs[0]] + b[1] * fl[k][vs[1]] + b[2] * fl[k][vs[2]];
          const x = b[0] * p[0][0] + b[1] * p[1][0] + b[2] * p[2][0], y = b[0] * p[0][1] + b[1] * p[1][1] + b[2] * p[2][1], z = b[0] * p[0][2] + b[1] * p[1][2] + b[2] * p[2][2];
          // (the details' 'facing' reads ref.facingNormals when given: the paint does not move when only the shading normals change)
          const fn = ref.facingNormals || vn, nx = b[0] * fn[vs[0] * 3] + b[1] * fn[vs[1] * 3] + b[2] * fn[vs[2] * 3], ny = b[0] * fn[vs[0] * 3 + 1] + b[1] * fn[vs[1] * 3 + 1] + b[2] * fn[vs[2] * 3 + 1], nz = b[0] * fn[vs[0] * 3 + 2] + b[1] * fn[vs[1] * 3 + 2] + b[2] * fn[vs[2] * 3 + 2];
          for (const ov of ref.overrides) ov.apply(vec, x, y, z, nz / (Math.hypot(nx, ny, nz) || 1));
          c = {b, vec}; cache.set(key, c); return c;
        };
        for (let i = 0; i < n; i++) for (let j = 0; i + j < n; j++) {
          clipInto(vs, [at(i, j), at(i + 1, j), at(i, j + 1)]);
          if (i + j < n - 1) clipInto(vs, [at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]);
        }
        continue;
      }
    }
    if (L[0] === L[1] && L[1] === L[2]) { const k = L[0]; const ids = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(b => addVert(k, b, vs)); geo[k].idx.push(...ids); continue; }
    split++;
    const cand = []; for (let k = 0; k < K; k++) if (vs.some(v => fl[k][v] > .15) || L.includes(k)) cand.push(k);
    for (const k of cand) {
      let poly = [{b: [1, 0, 0]}, {b: [0, 1, 0]}, {b: [0, 0, 1]}];
      for (const j of cand) { if (j === k || !poly.length) continue; const d = vs.map(v => fl[k][v] - fl[j][v]); poly = clipPoly(poly, b => b[0] * d[0] + b[1] * d[1] + b[2] * d[2] + (k < j ? 1e-9 : -1e-9)); }
      if (poly.length < 3) continue;
      const ids = poly.map(p => addVert(k, p.b, vs));
      for (let i = 1; i + 1 < ids.length; i++) if (ids[0] !== ids[i] && ids[i] !== ids[i + 1] && ids[0] !== ids[i + 1]) geo[k].idx.push(ids[0], ids[i], ids[i + 1]);
    }
  }
  return {geo, split, refined};
}

async function writeGeo(m, geo, file, {extra = [], compress = true} = {}) {
  const doc = new Document(), buffer = doc.createBuffer();
  const mats = [...m.materials.map(src => doc.createMaterial(src.getName()).setBaseColorFactor(src.getBaseColorFactor()).setRoughnessFactor(src.getRoughnessFactor()).setMetallicFactor(src.getMetallicFactor()).setDoubleSided(src.getDoubleSided())),
    ...extra.map(e => doc.createMaterial(e.name).setBaseColorFactor([...e.rgb.map(c => { c /= 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }), 1]).setRoughnessFactor(e.roughness ?? .4).setMetallicFactor(0).setDoubleSided(true))];
  const mesh = doc.createMesh('model');
  geo.forEach((G, k) => {
    if (!G.idx.length) return;
    mesh.addPrimitive(doc.createPrimitive().setMaterial(mats[k])
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(G.pos)).setBuffer(buffer))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(G.nor)).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(G.pos.length / 3 > 65535 ? new Uint32Array(G.idx) : new Uint16Array(G.idx)).setBuffer(buffer)));
  });
  const node = doc.createNode(m.node.getName()).setMesh(mesh).setTranslation(m.node.getTranslation()).setScale(m.node.getScale());
  doc.createScene().addChild(node);
  if (compress) await doc.transform(meshopt({encoder: MeshoptEncoder, level: 'high', quantizePosition: 16}), unpartition());
  const io = await lib.io(); await io.write(file, doc);
  return fs.statSync(file).size;
}

module.exports = {vertexNormals, geometricNormals, metricField, fields, build, writeGeo};
