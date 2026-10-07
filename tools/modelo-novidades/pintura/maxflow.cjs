// Boykov–Kolmogorov max-flow / min-cut (as in Kolmogorov's maxflow-v3), typed arrays.
// const g = new Graph(nNodes, nArcPairsHint); g.addTweights(i, capSource, capSink); g.addEdge(i, j, capIJ, capJI); g.maxflow(); g.inSink(i)
class Graph {
  constructor(n, m) {
    this.n = n; this.trCap = new Float64Array(n);
    this.head = new Int32Array(2 * m); this.next = new Int32Array(2 * m); this.rcap = new Float64Array(2 * m); this.na = 0;
    this.first = new Int32Array(n).fill(-1);
  }
  addTweights(i, cs, ct) { const d = this.trCap[i]; if (d > 0) cs += d; else ct -= d; this.flow = (this.flow || 0) + Math.min(cs, ct); this.trCap[i] = cs - ct; }
  addEdge(i, j, cij, cji) {
    if (this.na + 2 > this.head.length) this._grow();
    const a = this.na++, b = this.na++; // sister of a is a ^ 1
    this.head[a] = j; this.rcap[a] = cij; this.next[a] = this.first[i]; this.first[i] = a;
    this.head[b] = i; this.rcap[b] = cji; this.next[b] = this.first[j]; this.first[j] = b;
  }
  _grow() { const L = this.head.length * 2; for (const k of ['head', 'next']) { const t = new Int32Array(L); t.set(this[k]); this[k] = t; } const r = new Float64Array(L); r.set(this.rcap); this.rcap = r; }
  maxflow() {
    const n = this.n, TERMINAL = -2, ORPHAN = -3, NONE = -1;
    const parent = new Int32Array(n).fill(NONE), isSink = new Uint8Array(n), dist = new Int32Array(n), ts = new Int32Array(n), nextActive = new Int32Array(n).fill(-1), inQueue = new Uint8Array(n);
    const {head, next, rcap, first, trCap} = this;
    let flow = this.flow || 0, time = 0;
    // active queue (FIFO)
    let qHead = -1, qTail = -1;
    const pushActive = i => { if (inQueue[i]) return; inQueue[i] = 1; nextActive[i] = -1; if (qTail < 0) qHead = qTail = i; else { nextActive[qTail] = i; qTail = i; } };
    const popActive = () => { while (qHead >= 0) { const i = qHead; qHead = nextActive[i]; if (qHead < 0) qTail = -1; inQueue[i] = 0; if (parent[i] !== NONE) return i; } return -1; };
    for (let i = 0; i < n; i++) { if (trCap[i] > 0) { isSink[i] = 0; parent[i] = TERMINAL; pushActive(i); dist[i] = 1; ts[i] = 0; } else if (trCap[i] < 0) { isSink[i] = 1; parent[i] = TERMINAL; pushActive(i); dist[i] = 1; ts[i] = 0; } }
    const orphans = [];
    let current = -1;
    for (;;) {
      // growth
      let i = current, mid = -1;
      if (i >= 0 && parent[i] === NONE) i = -1;
      if (i < 0) { i = popActive(); if (i < 0) break; }
      if (!isSink[i]) {
        for (let a = first[i]; a >= 0; a = next[a]) if (rcap[a] > 0) { const j = head[a];
          if (parent[j] === NONE) { isSink[j] = 0; parent[j] = a ^ 1; ts[j] = ts[i]; dist[j] = dist[i] + 1; pushActive(j); }
          else if (isSink[j]) { mid = a; break; }
          else if (ts[j] <= ts[i] && dist[j] > dist[i]) { parent[j] = a ^ 1; ts[j] = ts[i]; dist[j] = dist[i] + 1; } }
      } else {
        for (let a = first[i]; a >= 0; a = next[a]) if (rcap[a ^ 1] > 0) { const j = head[a];
          if (parent[j] === NONE) { isSink[j] = 1; parent[j] = a ^ 1; ts[j] = ts[i]; dist[j] = dist[i] + 1; pushActive(j); }
          else if (!isSink[j]) { mid = a ^ 1; break; }
          else if (ts[j] <= ts[i] && dist[j] > dist[i]) { parent[j] = a ^ 1; ts[j] = ts[i]; dist[j] = dist[i] + 1; } }
      }
      time++;
      if (mid < 0) { current = -1; continue; }
      current = i; pushActive(i); // keep i active: it may have more paths
      // augment along: source ... tail(mid) -> head(mid) ... sink. mid goes from S-node to T-node.
      const sNode = head[mid ^ 1], tNode = head[mid];
      let bott = rcap[mid];
      for (let k = sNode; ; ) { const a = parent[k]; if (a === TERMINAL) { bott = Math.min(bott, trCap[k]); break; } bott = Math.min(bott, rcap[a ^ 1]); k = head[a]; }
      for (let k = tNode; ; ) { const a = parent[k]; if (a === TERMINAL) { bott = Math.min(bott, -trCap[k]); break; } bott = Math.min(bott, rcap[a]); k = head[a]; }
      rcap[mid ^ 1] += bott; rcap[mid] -= bott;
      for (let k = sNode; ; ) { const a = parent[k]; if (a === TERMINAL) { trCap[k] -= bott; if (!(trCap[k] > 0)) { parent[k] = ORPHAN; orphans.push(k); } break; } rcap[a] += bott; rcap[a ^ 1] -= bott; if (!(rcap[a ^ 1] > 0)) { parent[k] = ORPHAN; orphans.push(k); } k = head[a]; }
      for (let k = tNode; ; ) { const a = parent[k]; if (a === TERMINAL) { trCap[k] += bott; if (!(trCap[k] < 0)) { parent[k] = ORPHAN; orphans.push(k); } break; } rcap[a ^ 1] += bott; rcap[a] -= bott; if (!(rcap[a] > 0)) { parent[k] = ORPHAN; orphans.push(k); } k = head[a]; }
      flow += bott;
      // adoption
      time++;
      while (orphans.length) {
        const o = orphans.pop(), sink = isSink[o];
        let best = NONE, bestD = 1e9;
        for (let a = first[o]; a >= 0; a = next[a]) {
          const ok = sink ? rcap[a] > 0 : rcap[a ^ 1] > 0; if (!ok) continue;
          let j = head[a]; if (isSink[j] !== sink || parent[j] === NONE) continue;
          // walk to the root, checking it ends at a terminal
          let d = 0, k = j, valid = false;
          for (;;) { if (ts[k] === time) { d += dist[k]; valid = true; break; } const p = parent[k]; d++; if (p === TERMINAL) { ts[k] = time; dist[k] = 1; valid = true; break; } if (p === ORPHAN || p === NONE) break; k = head[p]; }
          if (valid) { if (d < bestD) { best = a; bestD = d; } for (let k2 = j; ts[k2] !== time; k2 = head[parent[k2]]) { ts[k2] = time; dist[k2] = d; d--; } }
        }
        if (best !== NONE) { parent[o] = best; ts[o] = time; dist[o] = bestD + 1; }
        else {
          parent[o] = NONE;
          for (let a = first[o]; a >= 0; a = next[a]) { const j = head[a]; if (isSink[j] !== sink || parent[j] === NONE) continue; const ok = sink ? rcap[a] > 0 : rcap[a ^ 1] > 0; if (ok) pushActive(j); const p = parent[j]; if (p !== TERMINAL && p !== ORPHAN && head[p] === o) { parent[j] = ORPHAN; orphans.push(j); } }
        }
      }
    }
    this.parent = parent; this.isSink = isSink;
    return flow;
  }
  // after maxflow: true if the node ends on the sink side (free nodes count as source side)
  inSink(i) { return this.parent[i] !== -1 && this.isSink[i] === 1; }
}
module.exports = {Graph};
