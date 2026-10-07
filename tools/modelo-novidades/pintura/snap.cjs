// Colours snapped to the relief: alpha-expansion graph cut over the faces near the colour borders.
//   data:   changing a face's colour costs lambda[colour] × area × confidence (confidence grows with the distance to the old border);
//   border: two colours side by side cost mu × edge length × w, w small on a concave crease (the foot of a relief) and a bit smaller on
//           a convex one (the rim of a groove), 1 on smooth surface — the new borders run along the creases and are short and smooth
//           elsewhere (no spikes, no leaks, no holes).
// Then islands smaller than `island` faces join their surroundings.
// node snap.cjs <in.glb> <out.glb> '<options JSON>'
const fs = require('fs');
const lib = require('./seg-lib.cjs');
const {Graph} = require('./maxflow.cjs');

function cut(m, topo, labelIn, opt) {
  const t0 = Date.now(), {adj, N, C, A} = topo, nf = m.nf, names = m.names, K = names.length;
  let label = Uint8Array.from(labelIn);
  for (const {box, name, only} of opt.force || []) { const k = names.indexOf(name); for (let f = 0; f < nf; f++) { const x = C[f * 3], y = C[f * 3 + 1], z = C[f * 3 + 2]; if (x >= box[0] && y >= box[1] && z >= box[2] && x <= box[3] && y <= box[4] && z <= box[5] && (!only || only.includes(names[label[f]]))) label[f] = k; } }
  const orig = Uint8Array.from(label);
  // edge weights (per adjacency, symmetric): shared edge length × crease factor
  const nAdj = adj.map(a => a.length), off = new Int32Array(nf + 1); for (let f = 0; f < nf; f++) off[f + 1] = off[f] + nAdj[f];
  const W = new Float32Array(off[nf]), nb = new Int32Array(off[nf]);
  const {F, P} = m, sharedLen = (f, g) => { const a = [F[f * 3], F[f * 3 + 1], F[f * 3 + 2]], b = new Set([F[g * 3], F[g * 3 + 1], F[g * 3 + 2]]), s = a.filter(v => b.has(v)); if (s.length < 2) return 0; return Math.hypot(P[s[0] * 3] - P[s[1] * 3], P[s[0] * 3 + 1] - P[s[1] * 3 + 1], P[s[0] * 3 + 2] - P[s[1] * 3 + 2]); };
  // smoothed normals for the crease angle (sliver triangles make raw angles noisy)
  let n = Float32Array.from(N); for (let it = 0; it < (opt.normalSmooth ?? 1); it++) { const t = new Float32Array(n.length); for (let f = 0; f < nf; f++) { let x = n[f * 3], y = n[f * 3 + 1], z = n[f * 3 + 2]; for (const g of adj[f]) { x += n[g * 3]; y += n[g * 3 + 1]; z += n[g * 3 + 2]; } const l = Math.hypot(x, y, z) || 1; t[f * 3] = x / l; t[f * 3 + 1] = y / l; t[f * 3 + 2] = z / l; } n = t; }
  const th0 = opt.concave ?? 6, th1 = opt.convex ?? 14;
  for (let f = 0; f < nf; f++) adj[f].forEach((g, k) => {
    const dot = Math.max(-1, Math.min(1, n[f * 3] * n[g * 3] + n[f * 3 + 1] * n[g * 3 + 1] + n[f * 3 + 2] * n[g * 3 + 2])), th = Math.acos(dot) * 180 / Math.PI;
    const up = (C[g * 3] - C[f * 3]) * (n[f * 3] + n[g * 3]) + (C[g * 3 + 1] - C[f * 3 + 1]) * (n[f * 3 + 1] + n[g * 3 + 1]) + (C[g * 3 + 2] - C[f * 3 + 2]) * (n[f * 3 + 2] + n[g * 3 + 2]);
    // concavity: g lies above f's tangent plane (and f above g's); use the symmetric test on the average normal of the two faces
    const concave = ((C[g * 3] - C[f * 3]) * n[f * 3] + (C[g * 3 + 1] - C[f * 3 + 1]) * n[f * 3 + 1] + (C[g * 3 + 2] - C[f * 3 + 2]) * n[f * 3 + 2]) - ((C[g * 3] - C[f * 3]) * n[g * 3] + (C[g * 3 + 1] - C[f * 3 + 1]) * n[g * 3 + 1] + (C[g * 3 + 2] - C[f * 3 + 2]) * n[g * 3 + 2]) > 0;
    const w = concave ? 1 / (1 + (th / th0) ** 2) : 1 / (1 + (th / th1) ** 2);
    W[off[f] + k] = sharedLen(f, g) * (w + (opt.floor ?? .02)); nb[off[f] + k] = g;
  });
  // confidence: distance (rings) to the old colour border
  const dist = new Int32Array(nf).fill(1e9), q = [];
  for (let f = 0; f < nf; f++) if (adj[f].some(g => orig[g] !== orig[f])) { dist[f] = 0; q.push(f); }
  for (let i = 0; i < q.length; i++) { const f = q[i]; for (const g of adj[f]) if (dist[g] > dist[f] + 1) { dist[g] = dist[f] + 1; q.push(g); } }
  const band = opt.band ?? 14, active = new Int32Array(nf).fill(-1), act = [];
  for (let f = 0; f < nf; f++) if (dist[f] <= band) { active[f] = act.length; act.push(f); }
  const lam = names.map(nm => opt.lambda?.[nm] ?? opt.lambdaAll ?? 1), mu = opt.mu ?? 1, conf = opt.conf ?? 4;
  const meanA = A.reduce((s, v) => s + v, 0) / nf, meanL = Math.sqrt(meanA * 2);
  const D = (f, l) => l === orig[f] ? 0 : lam[orig[f]] * (A[f] / meanA) * Math.min(1, (dist[f] + 1) / conf) * (opt.dataScale ?? 1);
  const V = (f, k) => mu * W[off[f] + k] / meanL;
  const energy = () => { let e = 0; for (const f of act) { e += D(f, label[f]); for (let k = off[f]; k < off[f + 1]; k++) { const g = nb[k]; if (label[g] !== label[f] && (active[g] < 0 || g > f)) e += V(f, k - off[f]); } } return e; };
  console.log('faces', nf, 'active', act.length, 'energy', energy().toFixed(1), Date.now() - t0, 'ms');
  for (let cycle = 0; cycle < (opt.cycles ?? 3); cycle++) {
    let changed = 0;
    for (let alpha = 0; alpha < K; alpha++) {
      if (opt.only && !opt.only.includes(names[alpha])) continue;
      const g = new Graph(act.length, off[nf]);
      for (let i = 0; i < act.length; i++) {
        const f = act[i];
        if (label[f] === alpha) { g.addTweights(i, 0, 1e12); continue; } // stays alpha: sink side (x = 1)
        let c0 = D(f, label[f]), c1 = D(f, alpha);
        for (let k = off[f]; k < off[f + 1]; k++) {
          const h = nb[k], v = V(f, k - off[f]);
          if (active[h] < 0) { c0 += label[h] !== label[f] ? v : 0; c1 += label[h] !== alpha ? v : 0; continue; } // fixed neighbour
          if (h < f) continue; // each pair once
          const j = active[h];
          if (label[h] === alpha) { // h is alpha (x_h = 1 fixed): term (f) only
            c0 += label[f] !== alpha ? v : 0; continue; }
          // E(x_f, x_h): 00: [l_f≠l_h]v, 01: [l_f≠α]v = v, 10: v, 11: 0
          const Aa = label[f] !== label[h] ? v : 0, B = v, Cc = v, Dd = 0;
          // E = A + (C−A) x_f + (D−C) x_h + (B+C−A−D)(1−x_f) x_h
          c1 += Cc - Aa; // to f's cost of 1
          const ch = Dd - Cc; // to h's cost of 1 (negative)
          if (ch >= 0) g.addTweights(j, ch, 0); else g.addTweights(j, 0, -ch);
          const pw = B + Cc - Aa - Dd; // (1−x_f) x_h: f in S, h in T → edge f→h
          g.addEdge(i, j, pw, 0);
          c0 += Aa; // constant part goes to f's both sides equally — add A to both (keeps the costs exact)
          c1 += Aa;
        }
        const mn = Math.min(c0, c1); g.addTweights(i, c1 - mn, c0 - mn);
      }
      g.maxflow();
      for (let i = 0; i < act.length; i++) { const f = act[i]; if (label[f] !== alpha && g.inSink(i)) { label[f] = alpha; changed++; } }
    }
    console.log('cycle', cycle, 'changed', changed, 'energy', energy().toFixed(1), Date.now() - t0, 'ms');
    if (!changed) break;
  }
  // small islands join their surroundings
  const island = opt.island ?? 30, comp = new Int32Array(nf).fill(-1); let moved = 0;
  for (let s = 0; s < nf; s++) {
    if (comp[s] >= 0) continue; const list = [s]; comp[s] = s;
    for (let i = 0; i < list.length; i++) for (const g of adj[list[i]]) if (comp[g] < 0 && label[g] === label[s]) { comp[g] = s; list.push(g); }
    if (list.length >= (opt.islandBy?.[names[label[s]]] ?? island)) continue;
    const votes = new Map(); for (const f of list) for (const g of adj[f]) if (label[g] !== label[s]) votes.set(label[g], (votes.get(label[g]) || 0) + 1);
    if (!votes.size) continue; const best = [...votes].sort((a, b) => b[1] - a[1])[0][0]; for (const f of list) label[f] = best; moved += list.length;
  }
  console.log(names.map((nm, k) => `${nm} ${orig.filter(l => l === k).length}→${label.filter(l => l === k).length}`).join(' · '), '| islands', moved);
  return label;
}
async function snap(file, out, opt) {
  const m = await lib.load(file), topo = lib.topology(m), label = cut(m, topo, m.label, opt);
  if (opt.saveLabels) fs.writeFileSync(opt.saveLabels, Buffer.from(label.buffer));
  const bytes = await lib.write(m, label, out, {compress: opt.compress !== false});
  console.log('written', out, Math.round(bytes / 1024), 'KB');
}
module.exports = {snap, cut};
if (require.main === module) { const [file, out, json = '{}'] = process.argv.slice(2); snap(file, out, JSON.parse(json)).catch(e => { console.error(e); process.exit(1); }); }
