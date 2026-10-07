// Mesh colour segmentation helpers for the lamp models (GLB with one primitive per colour material).
// load(path) → welded mesh {P, F, label, corner, names, materials, doc}; height(mesh, iterations) → per-face relief height;
// write(mesh, label, path, {compress}) → GLB with one primitive per material, original vertex attributes kept.
const path = require('path');
const {createRequire} = require('module');
const req = createRequire(require('path').join(process.env.GLTF_NM || 'C:/Users/LUIZ/tools/gltf/node_modules', '..', 'package.json'));
const {NodeIO, Document} = req('@gltf-transform/core');
const {ALL_EXTENSIONS} = req('@gltf-transform/extensions');
const {meshopt, weld, unpartition, prune} = req('@gltf-transform/functions');
const {MeshoptEncoder, MeshoptDecoder} = req('meshoptimizer');

async function io() {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder});
}

async function load(file) {
  const doc = await (await io()).read(file);
  const node = doc.getRoot().listNodes().find(n => n.getMesh());
  const mesh = node.getMesh(), prims = mesh.listPrimitives();
  const names = prims.map(p => p.getMaterial().getName());
  // original corners: every vertex of every primitive, with its attributes in model space (dequantized by gltf-transform)
  const verts = [], label = [], Fo = [];
  let base = 0;
  prims.forEach((p, k) => {
    const pos = p.getAttribute('POSITION'), nor = p.getAttribute('NORMAL'), idx = p.getIndices().getArray();
    const n = pos.getCount(), a = [0, 0, 0], b = [0, 0, 0];
    for (let i = 0; i < n; i++) { pos.getElement(i, a); nor.getElement(i, b); verts.push([a[0], a[1], a[2], b[0], b[1], b[2]]); }
    for (let t = 0; t < idx.length; t += 3) { Fo.push(base + idx[t], base + idx[t + 1], base + idx[t + 2]); label.push(k); }
    base += n;
  });
  // weld by position (the primitives duplicate the vertices on the colour borders)
  const key = v => `${Math.round(v[0] * 1e6)},${Math.round(v[1] * 1e6)},${Math.round(v[2] * 1e6)}`, map = new Map(), wid = new Int32Array(verts.length), Pw = [];
  verts.forEach((v, i) => { const k = key(v); let w = map.get(k); if (w === undefined) { w = Pw.length / 3; map.set(k, w); Pw.push(v[0], v[1], v[2]); } wid[i] = w; });
  const F = new Uint32Array(Fo.length); for (let i = 0; i < Fo.length; i++) F[i] = wid[Fo[i]];
  return {doc, node, mesh, names, materials: prims.map(p => p.getMaterial()), verts, corner: Uint32Array.from(Fo), P: Float32Array.from(Pw), F, label: Uint8Array.from(label), nv: Pw.length / 3, nf: label.length};
}

// face normals, centers, areas; face adjacency through shared edges (edge → the two faces)
function topology(m) {
  const {P, F, nf} = m, N = new Float32Array(nf * 3), C = new Float32Array(nf * 3), A = new Float32Array(nf), edges = new Map(), adj = Array.from({length: nf}, () => []);
  for (let f = 0; f < nf; f++) {
    const a = F[f * 3], b = F[f * 3 + 1], c = F[f * 3 + 2];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1;
    N[f * 3] = nx / l; N[f * 3 + 1] = ny / l; N[f * 3 + 2] = nz / l; A[f] = l / 2;
    for (let k = 0; k < 3; k++) C[f * 3 + k] = (P[a * 3 + k] + P[b * 3 + k] + P[c * 3 + k]) / 3;
    for (const [x, y] of [[a, b], [b, c], [c, a]]) { const e = x < y ? x * 4194304 + y : y * 4194304 + x; const o = edges.get(e); if (o === undefined) edges.set(e, f); else if (o >= 0) { adj[f].push(o); adj[o].push(f); edges.set(e, -1); } }
  }
  return {N, C, A, adj};
}

// vertex neighbours (for smoothing)
function vertexRing(m) {
  const {F, nv} = m, sets = Array.from({length: nv}, () => new Set());
  for (let i = 0; i < F.length; i += 3) { const a = F[i], b = F[i + 1], c = F[i + 2]; sets[a].add(b).add(c); sets[b].add(a).add(c); sets[c].add(a).add(b); }
  return sets.map(s => Uint32Array.from(s));
}

// relief height of each face: distance (along the face normal) from the face centre to the same centre on a Taubin-smoothed copy of
// the mesh (the smoothing removes details smaller than ~ sqrt(iterations) edges: the relief stands out, the shape stays)
function height(m, topo, ring, iterations) {
  const {P, F, nv, nf} = m; let S = Float32Array.from(P), T = new Float32Array(P.length);
  const lams = iterations < 0 ? [.5] : [.5, -.53]; iterations = Math.abs(iterations);
  for (let it = 0; it < iterations; it++) for (const lam of lams) {
    for (let v = 0; v < nv; v++) { const r = ring[v]; if (!r.length) { T.set(S.subarray(v * 3, v * 3 + 3), v * 3); continue; } let x = 0, y = 0, z = 0; for (const u of r) { x += S[u * 3]; y += S[u * 3 + 1]; z += S[u * 3 + 2]; } const n = r.length; T[v * 3] = S[v * 3] + lam * (x / n - S[v * 3]); T[v * 3 + 1] = S[v * 3 + 1] + lam * (y / n - S[v * 3 + 1]); T[v * 3 + 2] = S[v * 3 + 2] + lam * (z / n - S[v * 3 + 2]); }
    [S, T] = [T, S];
  }
  const h = new Float32Array(nf);
  for (let f = 0; f < nf; f++) { let d = 0; for (let k = 0; k < 3; k++) { const s = (S[F[f * 3] * 3 + k] + S[F[f * 3 + 1] * 3 + k] + S[F[f * 3 + 2] * 3 + k]) / 3; d += (topo.C[f * 3 + k] - s) * topo.N[f * 3 + k]; } h[f] = d; }
  return h;
}

// GLB with one primitive per label (material list = mesh.materials, plus extra [{name, rgb, roughness}]), keeping the original
// vertex attributes of each corner; compressed like the site's models (meshopt, 16-bit positions)
async function write(m, label, file, {extra = [], compress = true} = {}) {
  const doc = new Document(), buffer = doc.createBuffer();
  const mats = [...m.materials.map(src => { const mat = doc.createMaterial(src.getName()).setBaseColorFactor(src.getBaseColorFactor()).setRoughnessFactor(src.getRoughnessFactor()).setMetallicFactor(src.getMetallicFactor()).setDoubleSided(src.getDoubleSided()); return mat; }),
    ...extra.map(e => doc.createMaterial(e.name).setBaseColorFactor([...e.rgb.map(c => { c /= 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }), 1]).setRoughnessFactor(e.roughness ?? .4).setMetallicFactor(0).setDoubleSided(true))];
  const meshOut = doc.createMesh('model');
  for (let k = 0; k < mats.length; k++) {
    const map = new Map(), pos = [], nor = [], idx = [];
    for (let f = 0; f < m.nf; f++) { if (label[f] !== k) continue; for (let c = 0; c < 3; c++) { const o = m.corner[f * 3 + c]; let i = map.get(o); if (i === undefined) { i = pos.length / 3; map.set(o, i); const v = m.verts[o]; pos.push(v[0], v[1], v[2]); nor.push(v[3], v[4], v[5]); } idx.push(i); } }
    if (!idx.length) continue;
    const prim = doc.createPrimitive().setMaterial(mats[k])
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(nor)).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx)).setBuffer(buffer));
    meshOut.addPrimitive(prim);
  }
  const node = doc.createNode(m.node.getName()).setMesh(meshOut).setTranslation(m.node.getTranslation()).setScale(m.node.getScale());
  doc.createScene().addChild(node);
  const w = await io();
  if (compress) await doc.transform(meshopt({encoder: MeshoptEncoder, level: 'high', quantizePosition: 16}), unpartition());
  await w.write(file, doc);
  return require('fs').statSync(file).size;
}

module.exports = {load, topology, vertexRing, height, write, io};
