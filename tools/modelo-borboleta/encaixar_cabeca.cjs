// Borboletoscópio em 3D (07/10/2026: "o rosto dela está saltando para fora da peça… encaixar"; "a pupila dela é branca"): a cabeça (o
// nó "cabeca" que trocar_cabeca.py pôs no corpo) recua dz no eixo da profundidade até assentar no encaixe, como na peça montada do 3MF,
// e o brilho de cada olho (rosa, nas bochechas) vira um material próprio, branco ("highlight"), como na vitrine.
// O site usa dz = -0.09 sobre o GLB de 06/10 (git show fb36280:dist/assets/models/borboletoscopio.glb).
// GLTF_NM=<node_modules do gltf-transform> node encaixar_cabeca.cjs <entrada.glb> <saida.glb> <dz> [inspect]
const {createRequire} = require('module');
const req = createRequire(require('path').join(process.env.GLTF_NM || 'C:/Users/LUIZ/tools/gltf/node_modules', '..', 'package.json'));
const {meshopt} = req('@gltf-transform/functions');
const {MeshoptEncoder} = req('meshoptimizer');
const lib = require('../modelo-novidades/pintura/seg-lib.cjs');
(async () => {
  const [src, out, dzArg = '0', inspect] = process.argv.slice(2);
  const io = await lib.io(), doc = await io.read(src), root = doc.getRoot();
  const head = root.listNodes().find(n => n.getName() === 'cabeca');
  const t = head.getTranslation(); head.setTranslation([t[0], t[1], t[2] + Number(dzArg)]);
  const mesh = head.getMesh(), prims = mesh.listPrimitives(), byName = n => prims.find(p => p.getMaterial().getName() === n);
  const eyes = byName('eyes'), cheeks = byName('cheeks');
  // eye blobs in local x/y: bounding boxes of the eye material split at x = 0 (the brows and the smile are eyes too, so use only the
  // front-most part: faces whose z is in the top 40% of the eyes' z range)
  const tri = (prim, f) => { const pos = prim.getAttribute('POSITION'), idx = prim.getIndices(), a = [0, 0, 0], c = [0, 0, 0]; for (let k = 0; k < 3; k++) { pos.getElement(idx.getScalar(f * 3 + k), a); for (let j = 0; j < 3; j++) c[j] += a[j] / 3; } return c; };
  const nE = eyes.getIndices().getCount() / 3, nC = cheeks.getIndices().getCount() / 3;
  const ec = Array.from({length: nE}, (_, f) => tri(eyes, f)), cc = Array.from({length: nC}, (_, f) => tri(cheeks, f));
  const zs = ec.map(c => c[2]).sort((a, b) => a - b), zTop = zs[Math.floor(zs.length * .6)];
  const box = side => { const s = ec.filter(c => c[2] >= zTop && Math.sign(c[0]) === side); const lo = [1e9, 1e9], hi = [-1e9, -1e9]; for (const c of s) for (let k = 0; k < 2; k++) { lo[k] = Math.min(lo[k], c[k]); hi[k] = Math.max(hi[k], c[k]); } return {lo, hi}; };
  const L = box(-1), R = box(1), inBox = (c, b) => c[0] >= b.lo[0] && c[0] <= b.hi[0] && c[1] >= b.lo[1] && c[1] <= b.hi[1];
  // the shine of each eye: the two pink blobs up at the eyes (y > -0.1 in the head's own units; the cheeks are lower, at y ≈ -0.41)
  const shine = cc.map(c => c[1] > -0.1);
  console.log('eye boxes', JSON.stringify([L, R].map(b => [...b.lo, ...b.hi].map(v => +v.toFixed(3)))), 'cheek faces', nC, '→ shine', shine.filter(Boolean).length);
  if (inspect) return;
  // split the cheeks primitive: the shine faces go to a new white material
  const white = doc.createMaterial('highlight').setBaseColorFactor([0.9, 0.9, 0.9, 1]).setRoughnessFactor(.25).setMetallicFactor(0).setDoubleSided(cheeks.getMaterial().getDoubleSided());
  const idx = cheeks.getIndices(), keep = [], move = [];
  for (let f = 0; f < nC; f++) (shine[f] ? move : keep).push(idx.getScalar(f * 3), idx.getScalar(f * 3 + 1), idx.getScalar(f * 3 + 2));
  const buffer = root.listBuffers()[0];
  const mk = arr => doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(arr)).setBuffer(buffer);
  cheeks.setIndices(mk(keep));
  const hp = doc.createPrimitive().setMaterial(white).setIndices(mk(move));
  for (const sem of cheeks.listSemantics()) hp.setAttribute(sem, cheeks.getAttribute(sem));
  mesh.addPrimitive(hp);
  await doc.transform(meshopt({encoder: MeshoptEncoder, level: 'high', quantizePosition: 16}));
  await io.write(out, doc);
  console.log('written', out, require('fs').statSync(out).size);
})().catch(e => { console.error(e); process.exit(1); });
