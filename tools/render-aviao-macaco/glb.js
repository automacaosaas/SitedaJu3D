// Minimal GLB writer for the 3D previews: one mesh, one primitive per material, float positions and normals, optional COLOR_0
// (linear RGB), uint32 indices. export-glb.cjs reads the result in slices (window.glbB64) and simplifies and compresses it.
export function writeGlb({name, generator, primitives}) {
  const chunks = [], views = [], accessors = []; let offset = 0;
  const addView = (array, target) => { const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength); chunks.push(bytes); const pad = (4 - bytes.length % 4) % 4; if (pad) chunks.push(new Uint8Array(pad)); views.push({buffer: 0, byteOffset: offset, byteLength: bytes.length, target}); offset += bytes.length + pad; return views.length - 1; };
  const prims = primitives.map(({geometry: g}, i) => {
    const p = g.attributes.position.array, n = g.attributes.normal.array, c = g.attributes.color?.array, idx = Uint32Array.from(g.index.array);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < p.length; k += 3) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], p[k + a]); max[a] = Math.max(max[a], p[k + a]); }
    const attributes = {};
    accessors.push({bufferView: addView(Float32Array.from(p), 34962), componentType: 5126, count: p.length / 3, type: 'VEC3', min, max}); attributes.POSITION = accessors.length - 1;
    accessors.push({bufferView: addView(Float32Array.from(n), 34962), componentType: 5126, count: n.length / 3, type: 'VEC3'}); attributes.NORMAL = accessors.length - 1;
    if (c) { accessors.push({bufferView: addView(Float32Array.from(c), 34962), componentType: 5126, count: c.length / 3, type: 'VEC3'}); attributes.COLOR_0 = accessors.length - 1; }
    accessors.push({bufferView: addView(idx, 34963), componentType: 5125, count: idx.length, type: 'SCALAR'});
    return {attributes, indices: accessors.length - 1, material: i};
  });
  const json = {asset: {version: '2.0', generator}, scene: 0, scenes: [{name: 'Scene', nodes: [0]}], nodes: [{name, mesh: 0}], meshes: [{name, primitives: prims}],
    materials: primitives.map(({material}) => material), buffers: [{byteLength: offset}], bufferViews: views, accessors};
  let text = JSON.stringify(json); text += ' '.repeat((4 - new TextEncoder().encode(text).length % 4) % 4);
  const jsonBytes = new TextEncoder().encode(text), total = 12 + 8 + jsonBytes.length + 8 + offset, out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true); dv.setUint32(16, 0x4E4F534A, true); out.set(jsonBytes, 20);
  let at = 20 + jsonBytes.length; dv.setUint32(at, offset, true); dv.setUint32(at + 4, 0x004E4942, true); at += 8;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  let binary = ''; for (let k = 0; k < out.length; k += 0x8000) binary += String.fromCharCode.apply(null, out.subarray(k, k + 0x8000));
  return {base64: btoa(binary), bytes: total};
}
