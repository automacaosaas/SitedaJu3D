// Lâmpada de fenda portátil on its table stand, modelled from the photos in OneDrive\ANIMAÇÃO_JU3D (2026-10-01), in millimetres.
// Seen from the patient's side, like the photo "14.27.59": the black illumination column in front, the prism on top of it, the white binocular
// head behind with the two objectives and the black eyecups, the white lamp housing with its two black dials, the grey hammered-paint stand
// with the steel plate and the cross bar. x right, y up, z toward the viewer; the column axis is x = z = 0, the table is y = 0.
// Three groups, so the parts can be rendered as layers that register pixel for pixel: base (stand + housing), column, top (prism + head).
import * as THREE from 'three';
import {mergeVertices} from '/vendor/utils/BufferGeometryUtils.js';
import {roundedRect, noiseTexture} from './studio.js';

export function buildLamp({env: ENV = 1} = {}) {
  // ── materials ─────────────────────────────────────────────────────────────────────────
  const fine = noiseTexture(512, {scale: 30, seed: 4, contrast: .7});
  const hammer = noiseTexture(1024, {scale: 26, seed: 8, contrast: 2.2});
  const white = new THREE.MeshPhysicalMaterial({color: '#f1efea', roughness: .3, clearcoat: .7, clearcoatRoughness: .18, envMapIntensity: .95 * ENV, sheen: 0});
  const whiteMatte = new THREE.MeshPhysicalMaterial({color: '#ebe9e4', roughness: .45, clearcoat: .3, clearcoatRoughness: .35, envMapIntensity: .9 * ENV});
  const anodised = new THREE.MeshPhysicalMaterial({color: '#151618', metalness: .45, roughness: .44, clearcoat: .45, clearcoatRoughness: .28, envMapIntensity: 1.1 * ENV, bumpMap: fine, bumpScale: .04});
  const paint = new THREE.MeshPhysicalMaterial({color: '#6c6e72', metalness: .55, roughness: .46, clearcoat: .35, clearcoatRoughness: .3, envMapIntensity: 1 * ENV, bumpMap: hammer, bumpScale: .55});
  const paintDark = paint.clone(); paintDark.color = new THREE.Color('#5f6165');
  const steel = new THREE.MeshPhysicalMaterial({color: '#cfd2d6', metalness: 1, roughness: .22, envMapIntensity: 1.2 * ENV});
  const rubber = new THREE.MeshPhysicalMaterial({color: '#1c1d20', roughness: .78, envMapIntensity: .8 * ENV, bumpMap: fine, bumpScale: .08});
  const ruby = new THREE.MeshPhysicalMaterial({color: '#9b1f33', roughness: .15, clearcoat: 1, clearcoatRoughness: .05, envMapIntensity: 1.4 * ENV});
  const coated = new THREE.MeshPhysicalMaterial({color: '#07090c', roughness: .04, metalness: 0, clearcoat: 1, clearcoatRoughness: .02, iridescence: 1, iridescenceIOR: 1.38, iridescenceThicknessRange: [120, 300], envMapIntensity: 6 * ENV});
  const prismGlass = new THREE.MeshPhysicalMaterial({color: '#0e1824', roughness: .02, clearcoat: 1, clearcoatRoughness: .02, envMapIntensity: 7 * ENV});
  const seamMat = new THREE.MeshPhysicalMaterial({color: '#77736a', roughness: .5, envMapIntensity: .6 * ENV});

  const groups = {base: new THREE.Group(), column: new THREE.Group(), top: new THREE.Group()};
  const root = new THREE.Group(); Object.values(groups).forEach(g => root.add(g));
  const add = (group, mesh, {cast = true} = {}) => { mesh.castShadow = cast; mesh.receiveShadow = true; groups[group].add(mesh); return mesh; };

  // ── helpers ───────────────────────────────────────────────────────────────────────────
  // a shape drawn in plan (x right, "y" = −z) extruded upward from y0 by h, with rounded vertical edges from the shape and a bevel on top/bottom
  function plan(shape, y0, h, bevel = 1.5, segs = 4) {
    const g = new THREE.ExtrudeGeometry(shape, {depth: Math.max(.01, h - 2 * bevel), bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: segs, curveSegments: 48});
    g.rotateX(-Math.PI / 2); g.translate(0, y0 + bevel, 0); return g;
  }
  function box(w, h, d, r, x, y, z) { const s = roundedRect(w - 2 * r, -(d / 2) + r, d / 2 - r, Math.min(r, (w - 2 * r) / 2 - .01)); return plan(s, y, h, r, 4).translate(x, 0, z); }
  // lathe around the vertical axis from [radius, y] pairs
  const lathe = (pts, segs = 128) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  function filletedCylinder(r, y0, y1, f0, f1, segs = 128) {
    const pts = [[0, y0]];
    for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + i / 8 * Math.PI / 2; pts.push([r - f0 + f0 * Math.cos(a), y0 + f0 + f0 * Math.sin(a)]); }
    for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI / 2; pts.push([r - f1 + f1 * Math.cos(a), y1 - f1 + f1 * Math.sin(a)]); }
    pts.push([0, y1]); return lathe(pts, segs);
  }
  function stripes(n, {w = 1024, h = 64, duty = .5, soft = .25} = {}) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'), period = w / n;
    for (let i = 0; i < n; i++) { const g = x.createLinearGradient(i * period, 0, (i + 1) * period, 0); g.addColorStop(0, '#000'); g.addColorStop(duty * (1 - soft), '#fff'); g.addColorStop(duty, '#fff'); g.addColorStop(Math.min(1, duty + soft * .5), '#000'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(i * period, 0, period, h); }
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 16; return t;
  }
  function phillips(x, y, z, r = 2.3, normal = new THREE.Vector3(0, 0, 1)) {
    const g = new THREE.Group();
    const head = new THREE.Mesh(lathe([[0, .9], [r * .8, .85], [r, .45], [r, 0]], 48), steel); head.rotation.x = Math.PI / 2;
    const slot = new THREE.MeshPhysicalMaterial({color: '#2a2b2e', roughness: .6});
    const a = new THREE.Mesh(new THREE.BoxGeometry(r * 1.3, .38, .5), slot), b = a.clone(); b.rotation.z = Math.PI / 2; a.position.z = b.position.z = .8;
    g.add(head, a, b); g.position.set(x, y, z); g.lookAt(new THREE.Vector3(x, y, z).add(normal)); g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return g;
  }

  // ── stand: two-layer grey casting, front arm with a steel plate, cross bar with rubber ends ─────
  const ARM_W = 41, TIP_Z = 76, ARM_BACK = -64, BASE_LOW = 9.5, BASE_TOP = 23;
  function armShape(inset = 0) {
    const s = new THREE.Shape(), hw = ARM_W / 2 - inset, r = hw, cz = TIP_Z - r - inset;
    s.moveTo(-hw, -(ARM_BACK + inset)); s.lineTo(hw, -(ARM_BACK + inset)); s.lineTo(hw, -cz); s.absarc(0, -cz, hw, 0, Math.PI, true); s.lineTo(-hw, -(ARM_BACK + inset));
    return s;
  }
  add('base', new THREE.Mesh(plan(armShape(.9), 0, BASE_LOW, 2, 4), paintDark));
  add('base', new THREE.Mesh(plan(armShape(0), BASE_LOW + .5, BASE_TOP - BASE_LOW - .5 - 2.4, 2.2, 5), paint));
  // top skin with the slot for the steel plate in front of the housing
  { const s = armShape(0); const slot = new THREE.Path(), sw = 9.2, z0 = 36, z1 = 67; slot.moveTo(-sw, -z0); slot.lineTo(-sw, -(z1 - sw)); slot.absarc(0, -(z1 - sw), sw, Math.PI, 0, true); slot.lineTo(sw, -z0); slot.lineTo(-sw, -z0); s.holes.push(slot);
    add('base', new THREE.Mesh(plan(s, BASE_TOP - 3.4, 3.4, 1.1, 4), paint)); }
  add('base', new THREE.Mesh(plan(roundedRect(18.4, -67, -36, 8.5), BASE_TOP - 3.6, .6, 0), paintDark), {cast: false});   // slot floor
  { const s = roundedRect(13.4, -63, -49, 2.2); const h = new THREE.Path(); h.absarc(0, -56, 2.3, 0, Math.PI * 2, true); s.holes.push(h);
    add('base', new THREE.Mesh(plan(s, BASE_TOP - 3, 1.5, .35, 2), steel));
    const sink = new THREE.Mesh(lathe([[2.3, BASE_TOP - 3], [2.3, BASE_TOP - 2], [3.6, BASE_TOP - 1.5]], 48), steel); sink.position.z = 56; add('base', sink); }
  // grip foot boss behind the housing
  add('base', new THREE.Mesh(plan(roundedRect(30, 30, 64, 8), BASE_TOP - 2, 9, 2.5, 4), paint));
  // cross bar under the grip, its ends capped in black rubber
  { const prof = (x0, x1, top0, top1) => { const s = new THREE.Shape(); s.moveTo(x0, 0); s.lineTo(x1, 0); s.lineTo(x1, top1); s.lineTo(x0, top0); s.lineTo(x0, 0); return s; };
    const bar = (shape, mat, inset = 0) => { const g = new THREE.ExtrudeGeometry(shape, {depth: 22 - 2 * 1.6 - inset, bevelEnabled: true, bevelSize: 1.6, bevelThickness: 1.6, bevelSegments: 4}); g.translate(0, 1.6, -78 + 1.6 + inset / 2); return add('base', new THREE.Mesh(g, mat)); };   // the bevel grows the profile by 1.6 all round
    bar(prof(-38.4, 38.4, 16.4, 16.4), paint);
    bar(prof(-50.4, -39.6, 11.6, 15.6), rubber, .6); bar(prof(39.6, 50.4, 15.6, 11.6), rubber, .6); }

  // ── lamp housing: lower body, white dial drum with two black dials, cap, front cover with its screw plate ─────
  add('base', new THREE.Mesh(box(41, 52, 58, 4.5, 0, BASE_TOP - 1, 9), white));                      // lower body (z −20 … +38, up to the cover); the dials show at its sides
  add('base', new THREE.Mesh(filletedCylinder(25.6, 60, 89, 1, 1), whiteMatte));                    // drum core under the dials
  const knurl = stripes(180, {duty: .5, soft: .5});
  function dial(y0, h, labels, seed) {
    const r = 27.6, kh = h * .42;
    // smooth band with white figures
    const c = document.createElement('canvas'); c.width = 2048; c.height = 128; const x = c.getContext('2d'); x.fillStyle = '#111214'; x.fillRect(0, 0, 2048, 128);
    x.fillStyle = '#e9ecec'; x.font = '600 70px "Bahnschrift", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    labels.forEach((t, i) => { x.save(); x.translate((i + .5) / labels.length * 2048, 66); x.scale(.8, 1); x.fillText(t, 0, 0); x.restore(); });
    x.fillStyle = '#e9ecec'; for (let i = 0; i < labels.length; i++) x.fillRect(i / labels.length * 2048 - 1, 8, 2, 16);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16; tex.wrapS = THREE.RepeatWrapping; tex.offset.x = seed;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h - kh, 192, 1, true), new THREE.MeshPhysicalMaterial({map: tex, roughness: .42, clearcoat: .4, clearcoatRoughness: .3, envMapIntensity: 1 * ENV}));
    band.position.y = y0 + kh + (h - kh) / 2; add('base', band);
    const kt = knurl.clone(); kt.needsUpdate = true;
    const kn = new THREE.Mesh(new THREE.CylinderGeometry(r + .5, r + .5, kh, 384, 1, true), new THREE.MeshPhysicalMaterial({color: '#141518', roughness: .45, clearcoat: .3, envMapIntensity: 1.1 * ENV, bumpMap: kt, bumpScale: .9}));
    kn.position.y = y0 + kh / 2; add('base', kn);
    for (const [yy, rr] of [[y0, r + .5], [y0 + kh, r + .5], [y0 + h, r]]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(rr - .2, .45, 8, 192), anodised); ring.rotation.x = Math.PI / 2; ring.position.y = yy; add('base', ring); }
  }
  dial(62, 12.4, ['0.5', '1', '2', '3', '4', '5', '6', '8', '10', '12', '◯', '▢', '0.5', '1', '2', '3'], .05);
  dial(75.2, 12.4, Array(16).fill(''), .3);
  add('base', new THREE.Mesh(lathe([[0, 88], [26.8, 88], [27.4, 88.6], [27.4, 98], [26.6, 100.6], [24.5, 102], [18.6, 102.4], [17.2, 103.2], [16.6, 104], [0, 104]]), white));   // cap, rounding into a collar round the column
  // front cover: a block in front of the drum, its top edge rounded, then a small plate with a Phillips screw
  { // side profile (z toward the camera, y up) with the sloped "roof" at the front top, extruded across x
    const s = new THREE.Shape(), b = 2.2; s.moveTo(16, 74 + b); s.lineTo(43 - b, 74 + b); s.lineTo(43 - b, 95.5); s.lineTo(37.5, 102 - b); s.lineTo(16, 102 - b); s.lineTo(16, 74 + b);
    const g = new THREE.ExtrudeGeometry(s, {depth: 39.5 - 2 * b, bevelEnabled: true, bevelSize: b, bevelThickness: b, bevelSegments: 5, curveSegments: 24});
    g.translate(0, 0, -(39.5 - 2 * b) / 2); g.rotateY(-Math.PI / 2);   // shape x → world +z
    add('base', new THREE.Mesh(g, white)); }
  add('base', new THREE.Mesh(box(19, 12.4, 4, 1.4, 0, 61.6, 37.8), white));
  groups.base.add(phillips(0, 67.6, 40.1, 2.1));
  // soft dark parting line between the cover and the drum, and between the lower body and the dials
  for (const [yy, rr] of [[60.3, 25.9], [88.2, 27.1]]) { const t = new THREE.Mesh(new THREE.TorusGeometry(rr, .35, 8, 192), seamMat); t.rotation.x = Math.PI / 2; t.position.y = yy; add('base', t, {cast: false}); }

  // ── column: matte black anodised tube with two set screws, a mount on top ─────────────────
  const COL_R = 16, COL_Y0 = 102, COL_Y1 = 198, AXIS = COL_Y1 + 9;   // AXIS: height of the objectives and of the parting line
  add('column', new THREE.Mesh(filletedCylinder(COL_R, COL_Y0, COL_Y1, .3, 1.1, 160), anodised));
  for (const yy of [COL_Y1 - 9, COL_Y1 - 30]) { const s = new THREE.Mesh(new THREE.CylinderGeometry(.9, .9, 1, 24), new THREE.MeshPhysicalMaterial({color: '#050506', roughness: .8})); s.rotation.z = Math.PI / 2; s.position.set(Math.sin(.85) * COL_R, yy, Math.cos(.85) * COL_R); s.lookAt(0, yy, 0); s.rotateX(Math.PI / 2); add('column', s, {cast: false}); }

  // ── prism head on the column: black block, front face is the exit window, top cut at 45° toward the objectives ──
  { const s = new THREE.Shape(); s.moveTo(-4.5, 0); s.lineTo(12, 0); s.lineTo(12, 22.6); s.lineTo(9.8, 23.4); s.lineTo(-4.5, 9.6); s.lineTo(-4.5, 0);
    const g = new THREE.ExtrudeGeometry(s, {depth: 11.4 - 1.2, bevelEnabled: true, bevelSize: .6, bevelThickness: .6, bevelSegments: 3});
    g.translate(0, 0, -(11.4 - 1.2) / 2); g.rotateY(-Math.PI / 2);   // shape x → world +z (toward the camera)
    const block = new THREE.Mesh(g, anodised); block.position.y = COL_Y1 + 1.6; add('top', block);
    const mount = new THREE.Mesh(filletedCylinder(13.2, COL_Y1, COL_Y1 + 2.2, .2, .6), anodised); add('top', mount);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 18.8), prismGlass); win.position.set(0, COL_Y1 + 1.6 + 11.3, 12.62); add('top', win, {cast: false});
  }

  // ── binocular head: a rounded white shell (superellipsoid), front visor with two coated objectives, a parting line with ruby dots, eyecups ──
  const HEAD = {x: 0, y: AXIS + 1, z: -57, a: 41, b: 24, c: 38, e1: .6, e2: .62};
  const sp = (w, m) => Math.sign(w) * Math.pow(Math.abs(w), m);
  const taper = y => { const t = Math.max(0, (HEAD.y - y) / HEAD.b); return [1 - .34 * Math.pow(t, 1.25), 1 - .08 * Math.pow(t, 1.6)]; };
  function headGeometry() {
    let g = new THREE.SphereGeometry(1, 200, 120); g.deleteAttribute('normal'); g.deleteAttribute('uv');
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), v = Math.asin(Math.max(-1, Math.min(1, y))), u = Math.atan2(z, x);
      let X = HEAD.a * sp(Math.cos(v), HEAD.e1) * sp(Math.cos(u), HEAD.e2), Y = HEAD.b * sp(Math.sin(v), HEAD.e1), Z = HEAD.c * sp(Math.cos(v), HEAD.e1) * sp(Math.sin(u), HEAD.e2);
      const [tx, tz] = taper(HEAD.y + Y); X *= tx; Z *= tz;
      p.setXYZ(i, HEAD.x + X, HEAD.y + Y, HEAD.z + Z);
    }
    g = mergeVertices(g, 1e-4); g.computeVertexNormals(); return g;
  }
  add('top', new THREE.Mesh(headGeometry(), white));
  // surface point of the shell at height y in direction (x, z) from the head centre: march outward
  function shellPoint(y, dx, dz) {
    const [tx, tz] = taper(y), Y = (y - HEAD.y) / HEAD.b, cv = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(Y), 2 / HEAD.e1)), HEAD.e1 / 2);
    // in the horizontal section the outline is |X/A|^(2/e2) + |Z/C|^(2/e2) = 1, with A = a·cv·tx, C = c·cv·tz
    const A = HEAD.a * cv * tx, C = HEAD.c * cv * tz, n = 2 / HEAD.e2, ang = Math.atan2(dz, dx), cx = Math.cos(ang), sz = Math.sin(ang);
    const t = 1 / Math.pow(Math.pow(Math.abs(cx / A), n) + Math.pow(Math.abs(sz / C), n), 1 / n);
    return new THREE.Vector3(HEAD.x + cx * t, y, HEAD.z + sz * t);
  }
  // parting line all round at the objectives' height, two ruby dots on it near the sides
  { // the line runs from one end of the visor round the back to the other (it never crosses the visor)
    const a0 = Math.atan2(38 * Math.pow(1 - Math.pow(25.6 / HEAD.a, 2 / HEAD.e2), HEAD.e2 / 2), 25.6), pts = [];
    for (let i = 0; i <= 256; i++) { const a = a0 - i / 256 * (Math.PI * 2 - (Math.PI - 2 * a0)); const q = shellPoint(AXIS, Math.cos(a), Math.sin(a)); const n = q.clone().sub(new THREE.Vector3(HEAD.x, AXIS, HEAD.z)).setY(0).normalize(); pts.push(q.addScaledVector(n, -.12)); }
    add('top', new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false), 512, .32, 8, false), seamMat), {cast: false});
    for (const s of [-1, 1]) { const q = shellPoint(AXIS, s * .68, .73); const dot = new THREE.Mesh(new THREE.SphereGeometry(1.7, 32, 16), ruby); dot.position.copy(q); dot.scale.set(1, 1, .7); dot.lookAt(q.clone().add(q.clone().sub(new THREE.Vector3(HEAD.x, AXIS, HEAD.z)).setY(0))); add('top', dot); } }
  // visor: a raised stadium frame on the front face, a slightly recessed panel inside, the two objectives standing out of it
  const FRONT_Z = HEAD.z + HEAD.c * taper(AXIS)[1];   // ≈ −18
  { const stadium = (w, h) => { const s = new THREE.Shape(), r = h / 2, hw = w / 2 - r; s.moveTo(-hw, -r); s.lineTo(hw, -r); s.absarc(hw, 0, r, -Math.PI / 2, Math.PI / 2); s.lineTo(-hw, r); s.absarc(-hw, 0, r, Math.PI / 2, Math.PI * 1.5); return s; };
    const ring = stadium(48.5, 26.8); const hole = stadium(43, 21.2); ring.holes.push(new THREE.Path(hole.getPoints(64).reverse()));
    const rg = new THREE.ExtrudeGeometry(ring, {depth: 2.4, bevelEnabled: true, bevelSize: .8, bevelThickness: .8, bevelSegments: 4, curveSegments: 64}); rg.translate(0, AXIS, FRONT_Z - 2.2);
    add('top', new THREE.Mesh(rg, white));
    const panel = new THREE.ExtrudeGeometry(stadium(43.4, 21.6), {depth: 2.2, bevelEnabled: false, curveSegments: 64}); panel.translate(0, AXIS, FRONT_Z - 2.6);
    add('top', new THREE.Mesh(panel, whiteMatte));
    for (const s of [-1, 1]) {
      const x0 = s * 12.8, zb = FRONT_Z - .6, len = 13.5;
      const barrel = new THREE.Mesh(lathe([[0, 0], [7.2, 0], [7.4, .5], [7.4, len - 2], [7.9, len - 1.6], [7.9, len - .3], [7.5, len], [6.1, len], [5.9, len - 1.2], [0, len - 1.2]], 96), anodised);
      barrel.rotation.x = Math.PI / 2; barrel.position.set(x0, AXIS, zb); add('top', barrel);   // lathe axis y → world +z
      const lens = new THREE.Mesh(new THREE.SphereGeometry(16, 64, 16, 0, Math.PI * 2, 0, Math.asin(5.9 / 16)), coated); lens.rotation.x = Math.PI / 2; lens.position.set(x0, AXIS, zb + len - 1.15 - 16 * Math.cos(Math.asin(5.9 / 16))); add('top', lens, {cast: false});   // glass just in front of the barrel floor, its crown flush with the rim
    } }
  // eyecups behind, pointing back, up and slightly out: from the front they show as dark "ears" over the shoulders of the shell
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    const tube = new THREE.Mesh(lathe([[0, 0], [10.5, 0], [10.5, 18], [11.6, 19], [0, 19]], 64), new THREE.MeshPhysicalMaterial({color: '#2a2b2e', roughness: .4, metalness: .3, envMapIntensity: ENV}));
    const cup = new THREE.Mesh(lathe([[11, 17], [17.2, 18.5], [18.6, 22], [19, 34], [18.4, 38.6], [16.8, 40.2], [14.6, 40], [13.8, 38], [12.4, 30], [0, 30]], 96), rubber);
    g.add(tube, cup); g.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    const dir = new THREE.Vector3(s * .1, .05, -1).normalize();
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); g.position.set(s * 22, AXIS + 3, -76); g.scale.setScalar(.95);
    groups.top.add(g);
  }
  // small dark interpupillary knob on top, between the eyecups
  add('top', new THREE.Mesh(box(13, 6, 22, 2.6, 0, AXIS + 18.5, -76), new THREE.MeshPhysicalMaterial({color: '#4a4c50', roughness: .4, metalness: .2, envMapIntensity: ENV})));
  // handle: hidden behind the housing and column from the front, but it shades them; a simple rounded column down to the boss
  add('base', new THREE.Mesh(box(28, 150, 34, 9, 0, 30, -47), white));
  return {root, groups, COL_R, COL_Y0, COL_Y1, AXIS};
}
