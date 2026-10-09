// A part of the mesh moved onto a smooth target surface (08/10/2026: tube-rebuild.cjs for the giraffe's neck, eye-rebuild.cjs for its
// eyes). Two steps shared by both:
//   refineMove      edges are split (at their midpoints, the mesh stays conforming) until the flat triangles follow the target within
//                   `tol` and, near a crease of the target (the foot of a spot's or an eye's wall), until the normals along each edge
//                   turn by less than `maxAngle`; then every vertex with weight w > 0 moves to P + w·(T − P) and gets the target's
//                   normal (with its w, so the caller can blend it where w < 1);
//   simplifyInside  the dense triangles left on the flat parts collapse (meshoptimizer simplifyWithAttributes, the positions and the
//                   normals kept within tolerance); the vertices the caller locks (outside, the creases) stay.
// Positions and lengths in the options are in render units (scale `s` = render units per local unit).

// spec: {target(x, y, z) → [w, X, Y, Z] (local), normal(x, y, z) → unit normal of the target there, crease(x, y, z) → signed distance (render)
// to the crease or null, s, tol, minLen, maxLen, maxAngle, creaseBand, passes}
function refineMove(m, spec, log = () => {}) {
  const s = spec.s, Pa = Array.from(m.P), F = Array.from(m.F), corner = Array.from(m.corner), label = Array.from(m.label), verts = m.verts;
  const vnOrig = []; { const acc = new Float64Array(m.nv * 3); for (let f = 0; f < m.nf; f++) for (let k = 0; k < 3; k++) { const v = F[f * 3 + k], q = verts[corner[f * 3 + k]]; acc[v * 3] += q[3]; acc[v * 3 + 1] += q[4]; acc[v * 3 + 2] += q[5]; } for (let v = 0; v < m.nv; v++) { const l = Math.hypot(acc[v * 3], acc[v * 3 + 1], acc[v * 3 + 2]) || 1; vnOrig.push(acc[v * 3] / l, acc[v * 3 + 1] / l, acc[v * 3 + 2] / l); } }
  let nv = m.nv, nf = m.nf;
  const at = v => [Pa[v * 3], Pa[v * 3 + 1], Pa[v * 3 + 2]];
  const tCache = [], nCache = [], cCache = [], tgt = v => tCache[v] || (tCache[v] = spec.target(...at(v))), nrm = v => nCache[v] || (nCache[v] = spec.normal(...at(v)));
  const crease = v => { if (cCache[v] === undefined) cCache[v] = spec.crease ? spec.crease(...at(v)) : null; return cCache[v]; };
  const KEY = 4194304, edges = new Map(), key = (a, b) => a < b ? a * KEY + b : b * KEY + a;
  const addEdge = (a, b, f) => { const k = key(a, b), l = edges.get(k); if (l) l.push(f); else edges.set(k, [f]); };
  for (let f = 0; f < nf; f++) for (let k = 0; k < 3; k++) addEdge(F[f * 3 + k], F[f * 3 + (k + 1) % 3], f);
  const tol = (spec.tol ?? .0004) / s, minLen = (spec.minLen ?? .0025) / s, maxLen = (spec.maxLen ?? .035) / s, cosMax = Math.cos((spec.maxAngle ?? 22) * Math.PI / 180), band = spec.creaseBand ?? .005;
  const area2 = f => { const i = F[f * 3] * 3, j = F[f * 3 + 1] * 3, k = F[f * 3 + 2] * 3, ux = Pa[j] - Pa[i], uy = Pa[j + 1] - Pa[i + 1], uz = Pa[j + 2] - Pa[i + 2], vx = Pa[k] - Pa[i], vy = Pa[k + 1] - Pa[i + 1], vz = Pa[k + 2] - Pa[i + 2]; return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx); };
  const need = (a, b) => {
    const A = tgt(a), B = tgt(b); if (A[0] <= 0 && B[0] <= 0) return 0;
    const len = Math.hypot(Pa[a * 3] - Pa[b * 3], Pa[a * 3 + 1] - Pa[b * 3 + 1], Pa[a * 3 + 2] - Pa[b * 3 + 2]); if (len < minLen) return 0;
    // an edge only of slivers (three vertices in a row, zero area: the Rodin mesh has chains of them) is left alone: splitting it
    // only makes more slivers
    if ((edges.get(key(a, b)) || []).every(f => area2(f) < 1e-3 * len * len)) return 0;
    if (len > maxLen && A[0] > 0 && B[0] > 0) return len;
    const M = spec.target((Pa[a * 3] + Pa[b * 3]) / 2, (Pa[a * 3 + 1] + Pa[b * 3 + 1]) / 2, (Pa[a * 3 + 2] + Pa[b * 3 + 2]) / 2);
    if (Math.hypot(M[1] - (A[1] + B[1]) / 2, M[2] - (A[2] + B[2]) / 2, M[3] - (A[3] + B[3]) / 2) > tol) return len;
    // near a crease, the normals along the edge must not turn by more than maxAngle: a long triangle there would smear the wall's shading
    // over the flat part beside it (the round tops turn slowly and their triangles are fine as they are)
    if (A[0] > .999 && B[0] > .999) { const ca = crease(a), cb = crease(b); if (ca !== null && cb !== null && (Math.min(Math.abs(ca), Math.abs(cb)) < band || ca * cb < 0)) { const na = nrm(a), nb = nrm(b); if (na[0] * nb[0] + na[1] * nb[1] + na[2] * nb[2] < cosMax) return len; } }
    return 0; };
  const split = k => {
    const faces = edges.get(k); edges.delete(k); const a = Math.floor(k / KEY), b = k % KEY, mv = nv++;
    Pa.push((Pa[a * 3] + Pa[b * 3]) / 2, (Pa[a * 3 + 1] + Pa[b * 3 + 1]) / 2, (Pa[a * 3 + 2] + Pa[b * 3 + 2]) / 2);
    let nx = vnOrig[a * 3] + vnOrig[b * 3], ny = vnOrig[a * 3 + 1] + vnOrig[b * 3 + 1], nz = vnOrig[a * 3 + 2] + vnOrig[b * 3 + 2]; const l = Math.hypot(nx, ny, nz) || 1; vnOrig.push(nx / l, ny / l, nz / l);
    verts.push([Pa[mv * 3], Pa[mv * 3 + 1], Pa[mv * 3 + 2], nx / l, ny / l, nz / l]); const cm = verts.length - 1;
    for (const f of faces) {
      let i = 0; for (; i < 3; i++) { const x = F[f * 3 + i], y = F[f * 3 + (i + 1) % 3]; if ((x === a && y === b) || (x === b && y === a)) break; }
      const i1 = (i + 1) % 3, i2 = (i + 2) % 3, x = F[f * 3 + i], y = F[f * 3 + i1], cv = F[f * 3 + i2], cx = corner[f * 3 + i], cy = corner[f * 3 + i1], cc = corner[f * 3 + i2], g = nf++;
      F[f * 3] = x; F[f * 3 + 1] = mv; F[f * 3 + 2] = cv; corner[f * 3] = cx; corner[f * 3 + 1] = cm; corner[f * 3 + 2] = cc;
      F.push(mv, y, cv); corner.push(cm, cy, cc); label.push(label[f]);
      addEdge(x, mv, f); addEdge(mv, y, g); addEdge(mv, cv, f); addEdge(mv, cv, g);
      const l2 = edges.get(key(y, cv)); if (l2) { const j = l2.indexOf(f); if (j >= 0) l2[j] = g; }
    }
  };
  let passes = 0, splits = 0; const perPass = [];
  for (; passes < (spec.passes ?? 16); passes++) {
    const list = []; for (const [k] of edges) { const len = need(Math.floor(k / KEY), k % KEY); if (len) list.push([k, len]); }
    if (!list.length) break; list.sort((p, q) => q[1] - p[1]);
    let n = 0; for (const [k] of list) if (edges.has(k)) { split(k); splits++; n++; } perPass.push(n);
  }
  log('refined', splits, 'edges in', passes, 'passes (' + perPass.join(' ') + '); vertices', m.nv, '→', nv, 'faces', m.nf, '→', nf);
  // move onto the surface (the normal is read at the original position first)
  const moved = new Set(), normals = new Map(), creaseOf = new Map();
  for (let v = 0; v < nv; v++) {
    const T = tgt(v); if (T[0] <= 0) continue;
    const n = nrm(v); creaseOf.set(v, crease(v));
    Pa[v * 3] = T[1]; Pa[v * 3 + 1] = T[2]; Pa[v * 3 + 2] = T[3]; moved.add(v);
    normals.set(v, {n, w: T[0]});
  }
  m.P = Float32Array.from(Pa); m.F = Uint32Array.from(F); m.corner = Uint32Array.from(corner); m.label = Uint8Array.from(label); m.nv = nv; m.nf = nf;
  return {moved, normals, creaseOf, splits};
}

// spec: {normals (from refineMove), free(v, {n, w}) → true where it may collapse, tol (render), normalWeight, s, label (for the new faces)}
async function simplifyInside(m, spec, log = () => {}) {
  const req = require('module').createRequire(require('path').join(process.env.GLTF_NM || 'C:/Users/LUIZ/tools/gltf/node_modules', '..', 'package.json'));
  const {MeshoptSimplifier: MS} = req('meshoptimizer'); await MS.ready;
  const attr = new Float32Array(m.nv * 3), lock = new Uint8Array(m.nv).fill(1);
  for (const [v, rec] of spec.normals) { attr.set(rec.n, v * 3); if (spec.free(v, rec)) lock[v] = 0; }
  const before = m.nf, [idx, err] = MS.simplifyWithAttributes(Uint32Array.from(m.F), m.P, 3, attr, 3, Array(3).fill(spec.normalWeight ?? .004), lock, 0, spec.tol / spec.s, ['ErrorAbsolute']);
  // the faces that stayed keep their labels and corners; the new ones (all inside the rebuilt part, painted by its override) get
  // spec.label and each vertex's first corner
  const tri = (a, b, c) => [a, b, c].sort((p, q) => p - q).join(','), old = new Map(), firstCorner = new Uint32Array(m.nv);
  for (let f = before - 1; f >= 0; f--) { old.set(tri(m.F[f * 3], m.F[f * 3 + 1], m.F[f * 3 + 2]), f); for (let k = 0; k < 3; k++) firstCorner[m.F[f * 3 + k]] = m.corner[f * 3 + k]; }
  const n2 = idx.length / 3, L2 = new Uint8Array(n2), C2 = new Uint32Array(idx.length);
  for (let f = 0; f < n2; f++) { const g = old.get(tri(idx[f * 3], idx[f * 3 + 1], idx[f * 3 + 2])); L2[f] = g === undefined ? spec.label : m.label[g]; for (let k = 0; k < 3; k++) C2[f * 3 + k] = firstCorner[idx[f * 3 + k]]; }
  m.F = idx; m.label = L2; m.corner = C2; m.nf = n2;
  log('simplified', before, '→', n2, 'faces (error', (err * spec.s).toFixed(5), ')');
}

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

module.exports = {refineMove, simplifyInside, smooth};
