// Macacoscópio, modelled from the photos in OneDrive\ANIMAÇÃO_JU3D (2026-09-30), in millimetres, at the scale of the slit lamp model (its column
// is Ø 32): a C-shaped sleeve open at the back that clips round the column, the body (brown, tall beige belly, a banana, two paw prints) and,
// on top, a slightly wider ring with the face (beige mask with a raised muzzle, glossy eyes, brows, nose and smile) and the two round ears.
// The arms come round the sides and the hands rest on the belly. Origin: centre of the sleeve's bottom; x right, y up, z toward the viewer.
// The painted details (belly, face, paw prints, brows, mouth) live on canvases unrolled round the cylinder: one for colour, one for relief.
import * as THREE from 'three';

export const MONKEY = {R: 18, H: 62, HEAD_R: 19.8, HEAD_Y0: 62.7, HEAD_H: 33.6, WALL: 1.8, GAP: .62};
const C = {brown: '#6b3521', beige: '#e2b597', yellow: '#ffc928', black: '#141414', stem: '#7a5a1c'};

function toy(color, extra = {}) { return new THREE.MeshPhysicalMaterial({color, roughness: .52, clearcoat: .28, clearcoatRoughness: .42, envMapIntensity: .95, ...extra}); }

// an unrolled cylinder: arc length s (mm, 0 = front, + = to the viewer's right) by height (mm, 0 = bottom). Colour and relief are painted with
// the same helpers; relief is grey (128 = flush, ±1 mm per 50 levels) and softened with a blur so every raised edge is rounded.
function sheet(R, H, pxmm = 16) {
  const W = Math.round(2 * Math.PI * R * pxmm), Hp = Math.round(H * pxmm);
  const mk = fill => { const c = document.createElement('canvas'); c.width = W; c.height = Hp; const x = c.getContext('2d'); x.fillStyle = fill; x.fillRect(0, 0, W, Hp); return {c, x}; };
  const color = mk('#000'), relief = mk('rgb(128,128,128)');
  const X = s => W / 2 + s * pxmm, Y = y => Hp - y * pxmm;
  return {R, H, W, Hp, pxmm, color, relief, X, Y, level: mm => { const v = Math.round(128 + mm * 50); return `rgb(${v},${v},${v})`; }};
}
function sampler(sh) {
  const d = sh.relief.x.getImageData(0, 0, sh.W, sh.Hp).data;
  return (u, v) => {   // u ∈ [0,1) round the cylinder (0.5 = front), v ∈ [0,1] up
    const fx = ((u % 1) + 1) % 1 * sh.W - .5, fy = (1 - v) * sh.Hp - .5, x0 = Math.floor(fx), y0 = Math.max(0, Math.min(sh.Hp - 1, Math.floor(fy))), tx = fx - x0, ty = Math.max(0, Math.min(1, fy - y0));
    const at = (x, y) => d[((Math.max(0, Math.min(sh.Hp - 1, y))) * sh.W + ((x % sh.W) + sh.W) % sh.W) * 4];
    const a = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx, b = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
    return ((a * (1 - ty) + b * ty) - 128) / 50;
  };
}

// C-shaped sleeve from y0 to y0 + H: outer skin displaced by the relief, inner wall, the two slot edges and the top and bottom rims.
// shape: rounded edges like the printed part (fillet radius at the top and the bottom, rows spread by angle so the curve stays smooth)
// and a slight bulge at mid height. The relief follows the skin over the rounded edges (the face reaches into the top one).
function sleeveGeometry(sh, y0, wall, gapHalf, segU = 720, segV, {top = 0, bottom = 0, bulge = 0} = {}) {
  const h = sampler(sh), R = sh.R, H = sh.H, pos = [], uv = [], idx = [];
  const t0 = -Math.PI + gapHalf, t1 = Math.PI - gapHalf;   // θ = 0 at the front (+z), the slot is at the back
  // profile rows: [height, radial offset]; quarter circles at the edges, straight in between
  const rows = [], straight = Math.max(8, Math.round((H - top - bottom) * (segV ? segV / H : 6))), arc = n => Math.max(2, Math.round(n));
  if (bottom > 0) for (let k = 0; k < arc(bottom * 5); k++) { const a = Math.PI / 2 * (1 - k / arc(bottom * 5)); rows.push([bottom - bottom * Math.sin(a), -bottom + bottom * Math.cos(a)]); }
  for (let k = 0; k <= straight; k++) rows.push([bottom + (H - top - bottom) * k / straight, 0]);
  if (top > 0) for (let k = 1; k <= arc(top * 5); k++) { const a = Math.PI / 2 * k / arc(top * 5); rows.push([H - top + top * Math.sin(a), -top + top * Math.cos(a)]); }
  const nV = rows.length - 1;
  const grid = (radius, displaced, flip) => {
    const base = pos.length / 3;
    for (let j = 0; j <= nV; j++) for (let i = 0; i <= segU; i++) {
      const [y, off] = rows[j], t = t0 + (t1 - t0) * i / segU, v = y / H, u = t / (2 * Math.PI) + .5;
      const shell = R + off + bulge * Math.sin(Math.PI * v), r = displaced ? radius + h(u, v) + off + bulge * Math.sin(Math.PI * v) : Math.min(radius, shell - .9);   // inside, the wall thins where a big rounded edge needs it
      pos.push(r * Math.sin(t), y0 + y, r * Math.cos(t)); uv.push(u, v);
    }
    for (let j = 0; j < nV; j++) for (let i = 0; i < segU; i++) {
      const a = base + j * (segU + 1) + i, b = a + 1, c = a + segU + 1, d = c + 1;
      if (flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);   // outer skin faces out, inner wall faces the axis
    }
  };
  grid(R, true, false); grid(R - wall, false, true);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  // rims: flat strips closing the wall (top, bottom, slot edges); the top and bottom ones start where the rounded edge ends
  const rim = []; const ring = (y, rOut, rIn) => { for (let i = 0; i < segU; i++) { const ta = t0 + (t1 - t0) * i / segU, tb = t0 + (t1 - t0) * (i + 1) / segU; const q = (t, r) => [r * Math.sin(t), y, r * Math.cos(t)]; rim.push(...q(ta, rOut), ...q(tb, rOut), ...q(ta, rIn), ...q(tb, rOut), ...q(tb, rIn), ...q(ta, rIn)); } };
  ring(y0, R - bottom, Math.min(R - wall, R - bottom - .9)); ring(y0 + H, R - top, Math.min(R - wall, R - top - .9));
  for (const t of [t0, t1]) for (let j = 0; j < nV; j++) {   // the slot edges follow the profile
    const [ya, oa] = rows[j], [yb, ob] = rows[j + 1], q = (y, r) => [r * Math.sin(t), y0 + y, r * Math.cos(t)];
    const ra = R + oa + bulge * Math.sin(Math.PI * ya / H), rb = R + ob + bulge * Math.sin(Math.PI * yb / H);
    const ia = Math.min(R - wall, ra - .9), ib = Math.min(R - wall, rb - .9); rim.push(...q(ya, ra), ...q(yb, rb), ...q(ya, ia), ...q(yb, rb), ...q(yb, ib), ...q(ya, ia));
  }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rim, 3)); rg.computeVertexNormals();
  return {skin: g, rims: rg};
}
// tube along a curve whose radius varies (rx across, ry along the surface normal), for the arms and the banana
function taperedTube(curve, radius, {seg = 96, around = 32, flatten = 1, up = new THREE.Vector3(0, 0, 1)} = {}) {
  const pos = [], idx = [], pts = curve.getSpacedPoints(seg);
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, p = pts[i], tan = curve.getTangentAt(Math.min(.999, Math.max(.001, t))).normalize();
    const n = up.clone().sub(tan.clone().multiplyScalar(up.dot(tan))).normalize(), b = new THREE.Vector3().crossVectors(tan, n);
    const r = radius(t);
    for (let k = 0; k <= around; k++) { const a = k / around * Math.PI * 2; const q = p.clone().addScaledVector(b, Math.cos(a) * r).addScaledVector(n, Math.sin(a) * r * flatten); pos.push(q.x, q.y, q.z); }
  }
  for (let i = 0; i < seg; i++) for (let k = 0; k < around; k++) { const a = i * (around + 1) + k, b2 = a + 1, c = a + around + 1, d = c + 1; idx.push(a, c, b2, b2, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

// a point on the cylinder (radius r) at arc length s and height y, and the outward normal there
const onCyl = (r, s, y, R = r) => { const t = s / R; return new THREE.Vector3(r * Math.sin(t), y, r * Math.cos(t)); };

export function buildMonkey({detail = 1} = {}) {
  const M = MONKEY, root = new THREE.Group();
  const brown = toy(C.brown, {side: THREE.DoubleSide}), beige = toy(C.beige, {side: THREE.DoubleSide}), yellow = toy(C.yellow, {roughness: .4, clearcoat: .45}), black = toy(C.black, {roughness: .12, clearcoat: 1, clearcoatRoughness: .05, envMapIntensity: 1.3});
  const mesh = (g, m, cast = true) => { const o = new THREE.Mesh(g, m); o.castShadow = cast; o.receiveShadow = true; return o; };

  // ── body: belly, paw prints ────────────────────────────────────────────────────────────
  const body = sheet(M.R, M.H);
  { const {color: {x: cx}, relief: {x: rx}, X, Y, pxmm, level} = body;
    cx.fillStyle = C.brown; cx.fillRect(0, 0, body.W, body.Hp);
    const belly = (ctx) => { ctx.beginPath(); ctx.ellipse(X(0), Y(36.8), 13.4 * pxmm, 23.6 * pxmm, 0, 0, Math.PI * 2); ctx.fill(); };
    cx.fillStyle = C.beige; belly(cx);
    rx.filter = `blur(${.45 * pxmm}px)`; rx.fillStyle = level(.85); belly(rx);
    // paw prints, engraved: a pad and four toes
    const paw = (ctx, s, y) => { ctx.beginPath(); ctx.ellipse(X(s), Y(y), 2.5 * pxmm, 2.1 * pxmm, 0, 0, Math.PI * 2); ctx.fill(); for (const [dx, dy, r] of [[-2.6, 2.4, .85], [-.9, 3.4, .9], [.9, 3.4, .9], [2.6, 2.4, .85]]) { ctx.beginPath(); ctx.ellipse(X(s + dx), Y(y + dy), r * pxmm, r * 1.1 * pxmm, 0, 0, Math.PI * 2); ctx.fill(); } };
    rx.filter = `blur(${.18 * pxmm}px)`; rx.fillStyle = level(-.45); paw(rx, -10.5, 5.2); paw(rx, 10.5, 5.2);
    cx.fillStyle = '#5c2c1b'; cx.filter = `blur(${.2 * pxmm}px)`; paw(cx, -10.5, 5.2); paw(cx, 10.5, 5.2); cx.filter = 'none'; }
  const bodyTex = new THREE.CanvasTexture(body.color.c); bodyTex.colorSpace = THREE.SRGBColorSpace; bodyTex.anisotropy = 16;
  const bodyGeo = sleeveGeometry(body, 0, M.WALL, M.GAP, Math.round(720 * detail), undefined, {bottom: 1.4, top: 1});
  root.add(mesh(bodyGeo.skin, toy('#ffffff', {map: bodyTex})), mesh(bodyGeo.rims, brown));

  // ── head ring: face mask, raised muzzle, brows and smile ─────────────────────────────────
  const head = sheet(M.HEAD_R, M.HEAD_H);
  const FACE = {eyeS: 6.7, eyeY: 20.6, noseY: 14.9};
  { const {color: {x: cx}, relief: {x: rx}, X, Y, pxmm, level} = head;
    cx.fillStyle = C.brown; cx.fillRect(0, 0, head.W, head.Hp);
    const face = ctx => { ctx.beginPath();
      ctx.ellipse(X(-7.4), Y(23.6), 8.3 * pxmm, 7.7 * pxmm, 0, 0, Math.PI * 2); ctx.ellipse(X(7.4), Y(23.6), 8.3 * pxmm, 7.7 * pxmm, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(X(0), Y(15.4), 16.6 * pxmm, 9.4 * pxmm, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(X(-15.2), Y(23.6), 30.4 * pxmm, 7 * pxmm); };
    cx.fillStyle = C.beige; face(cx);
    rx.filter = `blur(${.4 * pxmm}px)`; rx.fillStyle = level(.9); face(rx);
    // muzzle: a soft dome under the eyes
    const mz = rx.createRadialGradient(X(0), Y(13.6), 0, X(0), Y(13.6), 10.5 * pxmm); mz.addColorStop(0, level(2.5)); mz.addColorStop(.55, level(1.9)); mz.addColorStop(1, level(.9));
    rx.save(); rx.filter = `blur(${.8 * pxmm}px)`; rx.translate(X(0), Y(13.6)); rx.scale(1, .66); rx.translate(-X(0), -Y(13.6)); rx.fillStyle = mz; rx.beginPath(); rx.arc(X(0), Y(13.6), 10.5 * pxmm, 0, Math.PI * 2); rx.fill(); rx.restore();
    // brows and the smile: black, raised a little
    const strokes = ctx => { ctx.lineCap = 'round'; ctx.lineWidth = .95 * pxmm;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(X(s * 3.9), Y(25.3)); ctx.quadraticCurveTo(X(s * 6.9), Y(27.6), X(s * 9.9), Y(25.6)); ctx.stroke(); }
      ctx.lineWidth = .8 * pxmm; ctx.beginPath(); ctx.moveTo(X(0), Y(FACE.noseY - 1.6)); ctx.lineTo(X(0), Y(FACE.noseY - 3.4)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(-4.4), Y(FACE.noseY - 2.4)); ctx.quadraticCurveTo(X(-2.2), Y(FACE.noseY - 4.9), X(0), Y(FACE.noseY - 3.4)); ctx.quadraticCurveTo(X(2.2), Y(FACE.noseY - 4.9), X(4.4), Y(FACE.noseY - 2.4)); ctx.stroke(); };
    cx.strokeStyle = C.black; strokes(cx);
    rx.globalCompositeOperation = 'lighter'; rx.filter = `blur(${.15 * pxmm}px)`; rx.strokeStyle = 'rgb(18,18,18)'; strokes(rx); rx.globalCompositeOperation = 'source-over'; }
  const headTex = new THREE.CanvasTexture(head.color.c); headTex.colorSpace = THREE.SRGBColorSpace; headTex.anisotropy = 16;
  const headGeo = sleeveGeometry(head, M.HEAD_Y0, M.HEAD_R - 16.2, M.GAP * .78, Math.round(760 * detail), undefined, {top: 6.8, bottom: 2.2, bulge: 1.1});   // rounded like the printed head; the wall reaches the column (r 16.2)
  root.add(mesh(headGeo.skin, toy('#ffffff', {map: headTex})), mesh(headGeo.rims, brown));
  // a dark liner behind the joint, so the thin gap between head and body reads as a seam, not a slit of daylight
  { const liner = mesh(new THREE.CylinderGeometry(M.R - .5, M.R - .5, 4, 128, 1, true), toy('#2e160d', {side: THREE.DoubleSide}), false); liner.position.y = (M.H + M.HEAD_Y0) / 2; root.add(liner); }
  const hs = sampler(head), faceAt = (s, y, lift = 0) => { const u = s / M.HEAD_R / (2 * Math.PI) + .5; return onCyl(M.HEAD_R + hs(u, y / M.HEAD_H) + lift, s, M.HEAD_Y0 + y, M.HEAD_R); };

  // eyes: glossy black domes with a painted highlight, set into the mask
  for (const s of [-1, 1]) {
    const p = faceAt(s * FACE.eyeS, FACE.eyeY, -.6), n = p.clone().setY(0).normalize();
    const eye = mesh(new THREE.SphereGeometry(2.75, 48, 32), black); eye.scale.set(1, 1.12, .78); eye.position.copy(p); eye.lookAt(p.clone().add(n)); root.add(eye);
    const hl = mesh(new THREE.SphereGeometry(.78, 24, 16), toy('#ffffff', {roughness: .3, clearcoat: 1}), false); hl.scale.set(1, 1, .4);
    hl.position.copy(p).addScaledVector(n, 2.0).add(new THREE.Vector3(-.85, 1.05, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), s * FACE.eyeS / M.HEAD_R)); hl.lookAt(hl.position.clone().add(n)); root.add(hl);
  }
  // nose: a rounded, slightly flattened triangle on the muzzle
  { const p = faceAt(0, FACE.noseY, -.4); const shape = new THREE.Shape(); shape.moveTo(-2.3, .9); shape.quadraticCurveTo(0, 1.9, 2.3, .9); shape.quadraticCurveTo(2.6, .2, 0, -1.6); shape.quadraticCurveTo(-2.6, .2, -2.3, .9);
    const g = new THREE.ExtrudeGeometry(shape, {depth: .6, bevelEnabled: true, bevelSize: .7, bevelThickness: .9, bevelSegments: 6, curveSegments: 24});
    const nose = mesh(g, black); nose.position.copy(p); root.add(nose); }

  // ears: rounded half-sphere shells on the sides of the head, like the printed ones: a brown dome behind, a thick rounded lip, and a beige
  // dished centre facing forward and a little out
  for (const s of [-1, 1]) {
    const ear = new THREE.Group(), domeR = 6.9, depth = 6.0, dome = [];
    for (let k = 0; k <= 16; k++) { const a = k / 16 * Math.PI / 2; dome.push([domeR * Math.sin(a), .6 - depth * Math.cos(a)]); }
    const outer = mesh(new THREE.LatheGeometry([...dome, [7.05, 1.05], [6.75, 1.7], [6.15, 2.0], [5.5, 1.82]].map(([r, y]) => new THREE.Vector2(r, y)), 72), brown);
    const bowl = []; for (let k = 0; k <= 12; k++) { const a = (1 - k / 12) * Math.PI / 2; bowl.push([5.5 * Math.sin(a), 1.8 - 3.3 * Math.cos(a)]); }
    const inner = mesh(new THREE.LatheGeometry(bowl.map(([r, y]) => new THREE.Vector2(r, y)), 72), beige);
    outer.rotation.x = inner.rotation.x = Math.PI / 2;   // lathe axis y → z: the open side faces +z
    ear.add(outer, inner);
    ear.position.set(s * (M.HEAD_R + 2.3), M.HEAD_Y0 + 22.2, 1.4); ear.rotation.y = s * .36;
    root.add(ear);
  }
  // arms: from the sides round to the front, the hands resting on the edge of the belly with four fingers
  for (const s of [-1, 1]) {
    const pts = [[96, 49.6, 0], [80, 49.4, 1.9], [62, 47.6, 3.2], [47, 45.4, 3.3]].map(([deg, y, out]) => { const t = s * deg * Math.PI / 180, r = M.R + out; return new THREE.Vector3(r * Math.sin(t), y, r * Math.cos(t)); });
    const curve = new THREE.CatmullRomCurve3(pts);
    root.add(mesh(taperedTube(curve, t => 4.2 - .9 * t, {up: new THREE.Vector3(0, 1, 0), flatten: .95}), brown));   // both ends hidden: in the shoulder and in the palm
    // shoulder cap so the arm grows out of the body
    const sh = mesh(new THREE.SphereGeometry(4.3, 32, 24), brown); sh.position.copy(pts[0]).add(new THREE.Vector3(-s * .6, 0, -.4)); sh.scale.set(.75, 1, 1); root.add(sh);
    // hand: palm + four short fingers pointing toward the middle of the belly
    const hand = new THREE.Group(), palm = mesh(new THREE.SphereGeometry(3.6, 32, 24), brown); palm.scale.set(1, 1.08, .78); hand.add(palm);
    for (let f = 0; f < 4; f++) { const finger = mesh(new THREE.CapsuleGeometry(1.05, 3.1, 6, 16), brown); finger.rotation.z = Math.PI / 2; finger.position.set(-s * 3.1, 2.25 - f * 1.5, .5); finger.scale.set(1, 1, .9); hand.add(finger); }
    const hp = onCyl(M.R + 3.1, s * 42 * Math.PI / 180 * M.R, 44.6); hand.position.copy(hp); hand.rotation.y = s * 42 * Math.PI / 180; hand.rotation.z = s * -.12;
    root.add(hand);
  }

  // banana on the belly: a crescent, beige-yellow tip at one end, a little dark stem at the other
  { const bs = sampler(body), at = (x, y, lift) => { const t = Math.asin(x / M.R), s = t * M.R, u = t / (2 * Math.PI) + .5; return onCyl(M.R + bs(u, y / M.H) + lift, s, y, M.R); };
    // centred in the lower part of the belly and well inside it (about 60 % of its width), like the printed one
    const path = [[-7.4, 28.0], [-4.6, 25.6], [-1.0, 24.6], [2.6, 25.4], [5.2, 27.8], [6.4, 31.0]].map(([x, y]) => at(x, y, 1.3));
    const curve = new THREE.CatmullRomCurve3(path);
    const banana = mesh(taperedTube(curve, t => .28 + 1.95 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.04)), .62), {up: new THREE.Vector3(0, 0, 1), flatten: .62, seg: 128}), yellow);
    root.add(banana);
    const stem = mesh(new THREE.CapsuleGeometry(.55, 1.6, 4, 12), toy(C.stem)); stem.position.copy(at(6.6, 32.5, 1.15)); stem.rotation.z = -.35; stem.scale.setScalar(.85); root.add(stem); }

  return root;
}
