// Geometric patches: faces grown together across smooth edges, stopping at creases (dihedral angle over `T` degrees, normals
// smoothed once). Each patch's texture colours (area-weighted) give its majority colour and purity. Debug GLB: patches in random
// colours. node patches.cjs <in.glb> <T> <out.glb> [labels.bin]
const fs = require('fs');
const lib = require('./seg-lib.cjs');
function patches(m, topo, T, smooth = 1, dilate = 0) {
  const {adj, N, C} = topo, nf = m.nf;
  let n = Float32Array.from(N); for (let it = 0; it < smooth; it++) { const t = new Float32Array(n.length); for (let f = 0; f < nf; f++) { let x = n[f * 3], y = n[f * 3 + 1], z = n[f * 3 + 2]; for (const g of adj[f]) { x += n[g * 3]; y += n[g * 3 + 1]; z += n[g * 3 + 2]; } const l = Math.hypot(x, y, z) || 1; t[f * 3] = x / l; t[f * 3 + 1] = y / l; t[f * 3 + 2] = z / l; } n = t; }
  const cosT = Math.cos(T * Math.PI / 180), pid = new Int32Array(nf).fill(-1), list = [];
  // crease faces (an edge over T) and their neighbours up to `dilate` rings are walls: they close small gaps in a crease; they join
  // the nearest patch at the end
  let wall = new Uint8Array(nf); if (dilate > 0) { for (let f = 0; f < nf; f++) for (const g of adj[f]) if (n[f * 3] * n[g * 3] + n[f * 3 + 1] * n[g * 3 + 1] + n[f * 3 + 2] * n[g * 3 + 2] <= cosT) wall[f] = 1;
    for (let d = 1; d < dilate; d++) { const w2 = Uint8Array.from(wall); for (let f = 0; f < nf; f++) if (wall[f]) for (const g of adj[f]) w2[g] = 1; wall = w2; } }
  for (let s = 0; s < nf; s++) { if (pid[s] >= 0 || wall[s]) continue; const id = list.length, q = [s]; pid[s] = id;
    for (let i = 0; i < q.length; i++) { const f = q[i]; for (const g of adj[f]) if (pid[g] < 0 && !wall[g] && n[f * 3] * n[g * 3] + n[f * 3 + 1] * n[g * 3 + 1] + n[f * 3 + 2] * n[g * 3 + 2] > cosT) { pid[g] = id; q.push(g); } }
    list.push(q); }
  if (dilate > 0) { const q = []; for (let f = 0; f < nf; f++) if (pid[f] >= 0) q.push(f); for (let i = 0; i < q.length; i++) { const f = q[i]; for (const g of adj[f]) if (pid[g] < 0) { pid[g] = pid[f]; list[pid[f]].push(g); q.push(g); } } }
  return {pid, list};
}
module.exports = {patches};
if (require.main === module) (async () => {
  const [file, T = '10', out, labelsFile, dil = '0'] = process.argv.slice(2);
  const m = await lib.load(file), topo = lib.topology(m), label = labelsFile && labelsFile !== '-' ? new Uint8Array(fs.readFileSync(labelsFile)) : m.label;
  const {pid, list} = patches(m, topo, +T, 1, +dil);
  const big = list.map((fs_, id) => { const area = new Float64Array(m.names.length); for (const f of fs_) area[label[f]] += topo.A[f]; const tot = area.reduce((s, v) => s + v, 0), best = area.indexOf(Math.max(...area)); return {id, n: fs_.length, tot, best, purity: area[best] / tot}; }).sort((a, b) => b.tot - a.tot);
  console.log('patches', list.length, 'top:', big.slice(0, 25).map(p => `${p.n}:${m.names[p.best]}:${p.purity.toFixed(2)}`).join(' '));
  const lab = new Uint8Array(m.nf), K = m.names.length, P = 24;
  for (let f = 0; f < m.nf; f++) lab[f] = K + (list[pid[f]].length < 20 ? P : (pid[f] * 7919) % P);
  const colors = Array.from({length: P}, (_, i) => { const h = i / P * 6, c = [0, 0, 0]; const x = 1 - Math.abs(h % 2 - 1); const [r, g, b] = h < 1 ? [1, x, 0] : h < 2 ? [x, 1, 0] : h < 3 ? [0, 1, x] : h < 4 ? [0, x, 1] : h < 5 ? [x, 0, 1] : [1, 0, x]; return [r, g, b].map(v => Math.round(60 + v * 180)); });
  colors.push([20, 20, 20]);
  console.log('debug', await lib.write(m, lab, out, {extra: colors.map((rgb, i) => ({name: 'p' + i, rgb})), compress: false}));
})().catch(e => { console.error(e); process.exit(1); });
