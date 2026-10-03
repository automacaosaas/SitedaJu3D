// Régua de esquiascopia (plus lens rack), modelled from the photos in OneDrive\ANIMAÇÃO_JU3D (2026-10-01), in millimetres:
// clear acrylic paddle 3 mm thick, black screen print with "PLUS (+)" and the dioptres, 16 biconvex lenses whose curvature follows their power,
// clear neck with a small dome, matte black grip with a hole at the end. Same face as the one the airplane shows (0.5 to 4 on the left), without
// the owner's sticker on the grip. Origin: centre of the top edge of the black print; x right, y up, z toward the viewer.
import * as THREE from 'three';
import {roundedRect, noiseTexture} from './studio.js';

// measured on the label-free photo (plate 49.6 mm ≙ 165 px, pitch 19.5 mm ≙ 65.4 px)
const PLATE_W = 49.6, THICK = 3, TAB = 10.4, ROW0 = -15, PITCH = 19.5, COLS = [-9.75, 9.75], HOLE_R = 8.2;
const PLATE_BOTTOM = ROW0 - 7 * PITCH - 9.6;            // −161.1: the last lenses leave only a thin black margin
const NECK_W = 20.6, NECK_TOP = PLATE_BOTTOM - 3, NECK_CURVE = 12.5, GRIP_TOP = PLATE_BOTTOM - 27, GRIP_LEN = 86, GRIP_W = 21.6, GRIP_T = 8.4;
const LABELS = [['0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4'], ['5', '6', '7', '8', '9', '10', '12', '15']];
const POWERS = [[.5, 1, 1.5, 2, 2.5, 3, 3.5, 4], [5, 6, 7, 8, 9, 10, 12, 15]];
export const RULER = {PLATE_W, THICK, TAB, ROW0, PITCH, COLS, HOLE_R, PLATE_BOTTOM, GRIP_TOP, GRIP_LEN, top: TAB, bottom: GRIP_TOP - GRIP_LEN};

export function buildRuler({env: ENV = 1, acr = .08, print: withPrint = true} = {}) {
  const root = new THREE.Group(), add = (o, {cast = true} = {}) => { o.castShadow = cast; o.receiveShadow = true; root.add(o); return o; };
  const holes = []; for (let r = 0; r < 8; r++) for (let c = 0; c < 2; c++) holes.push({x: COLS[c], y: ROW0 - r * PITCH, power: POWERS[c][r]});

  // ── clear acrylic paddle with the 16 lens holes ─────────────────────────────────────────
  const outline = new THREE.Shape(), hw = PLATE_W / 2, nw = NECK_W / 2, r0 = 2.6;
  outline.moveTo(-hw + r0, TAB); outline.lineTo(hw - r0, TAB); outline.absarc(hw - r0, TAB - r0, r0, Math.PI / 2, 0, true);
  outline.lineTo(hw, NECK_TOP); outline.bezierCurveTo(hw, NECK_TOP - NECK_CURVE * .55, nw, NECK_TOP - NECK_CURVE * .45, nw, NECK_TOP - NECK_CURVE);
  outline.lineTo(nw, GRIP_TOP - 12); outline.lineTo(-nw, GRIP_TOP - 12); outline.lineTo(-nw, NECK_TOP - NECK_CURVE);
  outline.bezierCurveTo(-nw, NECK_TOP - NECK_CURVE * .45, -hw, NECK_TOP - NECK_CURVE * .55, -hw, NECK_TOP); outline.lineTo(-hw, TAB - r0); outline.absarc(-hw + r0, TAB - r0, r0, Math.PI, Math.PI / 2, true);
  for (const h of holes) { const p = new THREE.Path(); p.absarc(h.x, h.y, HOLE_R, 0, Math.PI * 2, false); outline.holes.push(p); }   // outline drawn clockwise, holes the other way
  const acrylicGeo = new THREE.ExtrudeGeometry(outline, {depth: THICK - 1.2, bevelEnabled: true, bevelSize: .75, bevelThickness: .6, bevelSegments: 3, curveSegments: 64});
  acrylicGeo.translate(0, 0, -(THICK - 1.2) / 2);
  const acrylicFace = new THREE.MeshPhysicalMaterial({color: 0xe8f1f5, transparent: true, opacity: acr, roughness: .03, clearcoat: 1, clearcoatRoughness: .02, envMapIntensity: 1.3 * ENV, depthWrite: false, side: THREE.DoubleSide});
  // the acrylic's edge is drawn as a firm slate contour (a clear paddle otherwise fades into a light page), with the studio's glint on its bevel
  const acrylicEdge = new THREE.MeshPhysicalMaterial({color: 0x6e8a98, transparent: true, opacity: .96, roughness: .12, clearcoat: 1, clearcoatRoughness: .06, envMapIntensity: 1.25 * ENV, depthWrite: false, side: THREE.DoubleSide});
  const acrylic = add(new THREE.Mesh(acrylicGeo, [acrylicFace, acrylicEdge]), {cast: false}); acrylic.renderOrder = 1;

  // ── black screen print on both faces, with the holes ──────────────────────────────────────
  const mask = roundedRect(PLATE_W - .3, PLATE_BOTTOM, 0, .4);
  for (const h of holes) { const p = new THREE.Path(); p.absarc(h.x, h.y, HOLE_R + .25, 0, Math.PI * 2, true); mask.holes.push(p); }
  const ink = new THREE.MeshPhysicalMaterial({color: 0x0b0c0e, roughness: .42, clearcoat: 1, clearcoatRoughness: .12, envMapIntensity: .9 * ENV, bumpMap: noiseTexture(512, {scale: 14, seed: 5, contrast: .6}), bumpScale: .08});
  const maskMesh = add(new THREE.Mesh(new THREE.ExtrudeGeometry(mask, {depth: .18, bevelEnabled: false, curveSegments: 64}), ink));
  maskMesh.position.z = THICK / 2 - .05;
  const maskBack = add(maskMesh.clone()); maskBack.position.z = -THICK / 2 - .13;

  // white print: PLUS (+) and the dioptres, condensed sans like the original
  if (withPrint) {
    const PX = 24, TW = Math.round(PLATE_W * PX), TH = Math.round((-PLATE_BOTTOM) * PX), tc = document.createElement('canvas'); tc.width = TW; tc.height = TH;
    const tx = tc.getContext('2d'); tx.fillStyle = '#f4f6f6'; tx.textBaseline = 'middle';
    const gx = mm => TW / 2 + mm * PX, gy = mm => -mm * PX;
    const text = (s, x, y, size, align, spacing = 0, squeeze = .74) => { tx.save(); tx.translate(gx(x), gy(y)); tx.scale(squeeze, 1); tx.font = `600 ${size * PX}px "Bahnschrift", "Arial Narrow", Arial, sans-serif`; tx.letterSpacing = `${spacing * PX}px`; tx.textAlign = align; tx.fillText(s, 0, 0); tx.restore(); };
    text('PLUS  (+)', 0, -3.1, 4.3, 'center', .75, .9);
    for (let r = 0; r < 8; r++) { text(LABELS[0][r], -hw + .9, ROW0 - r * PITCH + .15, 5.5, 'left', 0, .66); text(LABELS[1][r], hw - .9, ROW0 - r * PITCH + .15, 5.5, 'right', 0, .66); }
    const printTex = new THREE.CanvasTexture(tc); printTex.colorSpace = THREE.SRGBColorSpace; printTex.anisotropy = 16;
    const print = add(new THREE.Mesh(new THREE.PlaneGeometry(PLATE_W, -PLATE_BOTTOM), new THREE.MeshPhysicalMaterial({map: printTex, transparent: true, roughness: .5, clearcoat: 1, clearcoatRoughness: .14, envMapIntensity: .5 * ENV, depthWrite: false})), {cast: false});
    print.position.set(0, PLATE_BOTTOM / 2, THICK / 2 + .14); print.renderOrder = 3;
  }

  // ── lenses: biconvex crown glass (n 1.523), radius from the power, 2.6 mm at the edge ─────────
  // seen straight on, a lens is clear in the middle and whiter toward its edge (the glass thickens and bends the light away): an alpha ramp;
  // near the edge it refracts the black print around it: a grey band just inside a bright bevel
  const radial = (stops, space) => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), gr = x.createRadialGradient(128, 128, 0, 128, 128, 128); stops.forEach(([o, col]) => gr.addColorStop(o, col)); x.fillStyle = gr; x.fillRect(0, 0, 256, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = space; return t; };
  const ringTex = radial([[0, '#0b0b0b'], [.62, '#151515'], [.86, '#4a4a4a'], [.96, '#9a9a9a'], [1, '#c8c8c8']], THREE.NoColorSpace);
  const toneTex = radial([[0, '#fbfdfd'], [.78, '#eef3f4'], [.9, '#8d979b'], [.965, '#3e4649'], [1, '#e4ecee']], THREE.SRGBColorSpace);
  const glass = new THREE.MeshPhysicalMaterial({color: 0xffffff, map: toneTex, transparent: true, opacity: 1, alphaMap: ringTex, roughness: .015, metalness: 0, clearcoat: 1, clearcoatRoughness: .01, envMapIntensity: 2.6 * ENV, depthWrite: false, side: THREE.DoubleSide});
  const rim = new THREE.MeshPhysicalMaterial({color: 0xdfe9ea, transparent: true, opacity: .55, roughness: .2, envMapIntensity: 2 * ENV, depthWrite: false, side: THREE.DoubleSide});
  for (const {x, y, power} of holes) {
    const g = new THREE.Group(), r = HOLE_R - .05, R = 2 * (1.523 - 1) * 1000 / power, sag = R - Math.sqrt(R * R - r * r), edge = 2.6;
    const cap = new THREE.SphereGeometry(R, 72, 24, 0, Math.PI * 2, 0, Math.asin(r / R)); cap.rotateX(Math.PI / 2); cap.translate(0, 0, -R + sag + edge / 2);
    const pos = cap.attributes.position, uv = cap.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / (2 * r) + .5, pos.getY(i) / (2 * r) + .5);   // planar, so the ramps are radial
    const front = new THREE.Mesh(cap, glass), back = new THREE.Mesh(cap.clone().scale(1, 1, -1), glass);
    const side = new THREE.Mesh(new THREE.CylinderGeometry(r, r, edge, 72, 1, true).rotateX(Math.PI / 2), rim);
    front.renderOrder = back.renderOrder = 4; side.renderOrder = 2;
    g.add(front, back, side); g.position.set(x, y, 0); root.add(g);
  }

  // ── small dome on the neck (a moulded thumb rest) ────────────────────────────────────────
  const domeGeo = new THREE.SphereGeometry(5.2, 48, 16, 0, Math.PI * 2, 0, Math.asin(3.8 / 5.2)); domeGeo.rotateX(Math.PI / 2); domeGeo.translate(0, 0, THICK / 2 - 5.2 * Math.cos(Math.asin(3.8 / 5.2)));
  const dome = add(new THREE.Mesh(domeGeo, new THREE.MeshPhysicalMaterial({color: 0xf2f8f8, transparent: true, opacity: .22, roughness: .03, clearcoat: 1, envMapIntensity: 3 * ENV, depthWrite: false})), {cast: false});
  dome.position.set(0, PLATE_BOTTOM - 13, 0); dome.renderOrder = 5;

  // ── grip: matte black moulding, softly rounded, a shallow label recess and a hole at the end ───
  const rubberBump = noiseTexture(512, {scale: 22, seed: 9, contrast: .9});
  const gripShape = roundedRect(GRIP_W - 3, GRIP_TOP - GRIP_LEN + 1.5, GRIP_TOP - 1.5, 5.2);
  const hole = new THREE.Path(); hole.absarc(0, GRIP_TOP - GRIP_LEN + 12, 4.4, 0, Math.PI * 2, true); gripShape.holes.push(hole);
  const gripGeo = new THREE.ExtrudeGeometry(gripShape, {depth: GRIP_T - 3, bevelEnabled: true, bevelSize: 1.5, bevelThickness: 1.5, bevelSegments: 6, curveSegments: 48});
  gripGeo.translate(0, 0, -(GRIP_T - 3) / 2);
  add(new THREE.Mesh(gripGeo, new THREE.MeshPhysicalMaterial({color: 0x141518, roughness: .58, clearcoat: .35, clearcoatRoughness: .45, envMapIntensity: 1.1 * ENV, bumpMap: rubberBump, bumpScale: .12})));
  const recess = add(new THREE.Mesh(new THREE.ExtrudeGeometry(roundedRect(GRIP_W - 8.4, GRIP_TOP - 60, GRIP_TOP - 10, 2.4), {depth: .05, bevelEnabled: true, bevelSize: .6, bevelThickness: .2, bevelSegments: 4}),
    new THREE.MeshPhysicalMaterial({color: 0x131417, roughness: .5, clearcoat: .45, clearcoatRoughness: .35, envMapIntensity: 1.05 * ENV, bumpMap: rubberBump, bumpScale: .06})), {cast: false});
  recess.position.z = GRIP_T / 2 - .32;

  root.userData.holes = holes;
  return root;
}
