// Shared studio for the device and character renders: a softbox environment for the reflections and an accumulation renderer that averages
// many passes, each with a jittered key light (soft shadows, like a large softbox), one light from a random point of the dome (contact shadows
// and ambient occlusion) and a sub-pixel camera jitter (anti-aliasing). The result is a transparent PNG with the look of a studio product photo.
import * as THREE from 'three';

export function makeRenderer(width, height, {exposure = 1, toneMapping = 'neutral'} = {}) {
  const renderer = new THREE.WebGLRenderer({antialias: false, alpha: true, preserveDrawingBuffer: true});
  renderer.setPixelRatio(1); renderer.setSize(width, height); renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = {neutral: THREE.NeutralToneMapping, agx: THREE.AgXToneMapping, aces: THREE.ACESFilmicToneMapping}[toneMapping];
  renderer.toneMappingExposure = exposure;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.append(renderer.domElement);
  return renderer;
}

// Softboxes around a dim grey room: a big one above and in front (the main reflection on glossy parts), two vertical strips at the sides
// (the bright edges on cylinders), a low front fill and a dark floor, so black parts keep their shape and white parts stay clean.
// Behind the camera hangs a large graded scrim (bright at the upper left, dark at the lower right): flat faces that look straight at the camera
// (a printed plate, a cover panel) reflect it as the soft gradient of a product photo instead of a flat grey.
export function studioEnvironment(renderer, {top = 6, left = 3.2, right = 2.4, front = 1.4, room = .32, floor = .08, scrim = 1.1, scrimLow = .02, back = .8, glint = 0, glintAt = [-3.2, 4.2, 9]} = {}) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({color: new THREE.Color(room, room, room), side: THREE.BackSide})));
  const panel = (w, h, pos, k, map = null) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(k, k, k), map, side: THREE.DoubleSide}));
    m.position.set(...pos); m.lookAt(0, 0, 0); env.add(m); return m;
  };
  const ramp = document.createElement('canvas'); ramp.width = ramp.height = 256;
  const rg = ramp.getContext('2d'), grad = rg.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, '#fff'); grad.addColorStop(.42, `rgb(${[1, 1, 1].map(() => Math.round(255 * .32)).join(',')})`); grad.addColorStop(1, `rgb(${[1, 1, 1].map(() => Math.round(255 * scrimLow)).join(',')})`);
  rg.fillStyle = grad; rg.fillRect(0, 0, 256, 256);
  const rampTex = new THREE.CanvasTexture(ramp); rampTex.colorSpace = THREE.SRGBColorSpace;
  panel(9, 6, [-1.5, 9, 6], top);                 // overhead softbox, tilted toward the subject
  panel(2.2, 14, [-9, 1, 4], left);               // tall strip, left
  panel(2.2, 14, [9, 1, 2], right);               // tall strip, right
  panel(10, 3, [0, -4.5, 10], front);             // low front fill
  panel(9, 9, [0, 0, 11], scrim, rampTex);        // graded scrim behind the camera
  panel(30, 30, [0, -9, 0], floor);               // floor
  panel(4, 10, [0, 2, -10], back);                // back wall kicker (rim on the far edges)
  if (glint) panel(1.5, 1.1, glintAt, glint);      // small hard light up and left of the camera: the crisp glint on lenses and glossy edges
  const pmrem = new THREE.PMREMGenerator(renderer), tex = pmrem.fromScene(env, .02).texture; pmrem.dispose();
  return tex;
}

// deterministic pseudo random numbers, so a render can be repeated exactly
export function rng(seed = 7) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function fitShadow(light, sphere) {
  const r = sphere.radius * 1.08, cam = light.shadow.camera;
  cam.left = cam.bottom = -r; cam.right = cam.top = r; cam.near = .1; cam.far = r * 4 + 10;
  light.target.position.copy(sphere.center);
  cam.updateProjectionMatrix();
}

// passes: number of averaged renders. key: {dir:[x,y,z], spread (radians), intensity}. dome: {intensity, minElevation}. fill: extra fixed lights.
export function renderStudio(renderer, scene, camera, {width, height, passes = 48, key = {dir: [-.55, .75, .6], spread: .22, intensity: 2.2},
  dome = {intensity: 1.1, minElevation: -.15}, seed = 11, shadowMap = 2048, subject, view = null} = {}) {
  const sphere = new THREE.Box3().setFromObject(subject || scene).getBoundingSphere(new THREE.Sphere());
  const mk = () => { const l = new THREE.DirectionalLight(0xffffff, 1); l.castShadow = true; l.shadow.mapSize.set(shadowMap, shadowMap); l.shadow.bias = -.0002; l.shadow.normalBias = sphere.radius * .0025; l.shadow.radius = 2; scene.add(l, l.target); fitShadow(l, sphere); return l; };
  // key.distance (in radii of the subject): the key becomes a softbox at that distance, a spot light jittered over its face, so flat faces get the
  // gentle falloff of a near light (brighter toward the softbox) instead of the even light of the sun
  let keyLight = mk(); const domeLight = mk();
  if (key.distance) {
    scene.remove(keyLight, keyLight.target);
    const D = sphere.radius * key.distance;
    keyLight = new THREE.SpotLight(0xffffff, key.intensity * D * D, 0, Math.atan(sphere.radius * 1.25 / D) + .05, 0, 2);
    keyLight.castShadow = true; keyLight.shadow.mapSize.set(shadowMap, shadowMap); keyLight.shadow.bias = -.0002; keyLight.shadow.normalBias = sphere.radius * .0025; keyLight.shadow.radius = 2;
    keyLight.shadow.camera.near = D - sphere.radius * 1.2; keyLight.shadow.camera.far = D + sphere.radius * 1.2;
    keyLight.target.position.copy(sphere.center); scene.add(keyLight, keyLight.target);
  }
  const random = rng(seed), acc = new Float32Array(width * height * 4);
  const grab = document.createElement('canvas'); grab.width = width; grab.height = height; const g = grab.getContext('2d', {willReadFrequently: true});
  const kd = new THREE.Vector3(...key.dir).normalize();
  for (let i = 0; i < passes; i++) {
    // key: a direction inside a cone around the softbox direction
    const u = random(), v = random(), a = Math.sqrt(u) * key.spread, b = v * Math.PI * 2;
    const t1 = new THREE.Vector3().crossVectors(kd, Math.abs(kd.y) < .9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize(), t2 = new THREE.Vector3().crossVectors(kd, t1);
    const d = kd.clone().multiplyScalar(Math.cos(a)).addScaledVector(t1, Math.sin(a) * Math.cos(b)).addScaledVector(t2, Math.sin(a) * Math.sin(b));
    if (key.distance) {   // a point on the softbox face (a disc perpendicular to the key direction)
      const D = sphere.radius * key.distance, rr = Math.sqrt(u) * Math.tan(key.spread) * D;
      keyLight.position.copy(sphere.center).addScaledVector(kd, D).addScaledVector(t1, rr * Math.cos(b)).addScaledVector(t2, rr * Math.sin(b));
    } else { keyLight.position.copy(sphere.center).addScaledVector(d, sphere.radius * 2); keyLight.intensity = key.intensity; }
    // dome: uniform over the upper hemisphere (plus a little below the horizon), facing the camera side more often
    let e; do { e = new THREE.Vector3(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1); } while (e.lengthSq() > 1 || e.lengthSq() < .01 || e.normalize().y < dome.minElevation || e.z < -.35);
    domeLight.position.copy(sphere.center).addScaledVector(e, sphere.radius * 2); domeLight.intensity = dome.intensity;
    keyLight.shadow.needsUpdate = domeLight.shadow.needsUpdate = true;
    // view: a window into a larger frame (a tall layer that continues below a square picture), jittered by a fraction of a pixel
    const vw = view || {fullWidth: width, fullHeight: height, x: 0, y: 0};
    camera.setViewOffset(vw.fullWidth, vw.fullHeight, vw.x + random() - .5, vw.y + random() - .5, width, height);
    renderer.render(scene, camera);
    g.clearRect(0, 0, width, height); g.drawImage(renderer.domElement, 0, 0);
    const px = g.getImageData(0, 0, width, height).data;
    for (let p = 0; p < px.length; p += 4) { const al = px[p + 3] / 255; acc[p] += px[p] * al; acc[p + 1] += px[p + 1] * al; acc[p + 2] += px[p + 2] * al; acc[p + 3] += al; }
  }
  camera.clearViewOffset();
  scene.remove(keyLight, keyLight.target, domeLight, domeLight.target);
  const out = document.createElement('canvas'); out.width = width; out.height = height;
  const o = out.getContext('2d'), img = o.createImageData(width, height);
  for (let p = 0; p < acc.length; p += 4) {
    const al = acc[p + 3] / passes;
    if (al <= 0) continue;
    img.data[p] = acc[p] / passes / al; img.data[p + 1] = acc[p + 1] / passes / al; img.data[p + 2] = acc[p + 2] / passes / al; img.data[p + 3] = Math.round(al * 255);
  }
  o.putImageData(img, 0, 0);
  return out;
}

// rounded rectangle shape (x centred, from bottom to top)
export function roundedRect(w, bottom, top, r) {
  const s = new THREE.Shape(), l = -w / 2, rr = w / 2;
  s.moveTo(l + r, bottom); s.lineTo(rr - r, bottom); s.absarc(rr - r, bottom + r, r, -Math.PI / 2, 0); s.lineTo(rr, top - r); s.absarc(rr - r, top - r, r, 0, Math.PI / 2);
  s.lineTo(l + r, top); s.absarc(l + r, top - r, r, Math.PI / 2, Math.PI); s.lineTo(l, bottom + r); s.absarc(l + r, bottom + r, r, Math.PI, Math.PI * 1.5);
  return s;
}

// fine noise for bump maps (hammered paint, anodised aluminium, rubber)
export function noiseTexture(size = 512, {scale = 1, seed = 3, contrast = 1} = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'), img = x.createImageData(size, size), random = rng(seed);
  const grid = Array.from({length: 4}, (_, o) => { const n = 8 << o; return {n, v: Float32Array.from({length: n * n}, random)}; });
  const sample = ({n, v}, u, w) => { const fx = u * n, fy = w * n, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, s = t => t * t * (3 - 2 * t);
    const at = (i, j) => v[((j % n + n) % n) * n + ((i % n + n) % n)];
    return (at(x0, y0) * (1 - s(tx)) + at(x0 + 1, y0) * s(tx)) * (1 - s(ty)) + (at(x0, y0 + 1) * (1 - s(tx)) + at(x0 + 1, y0 + 1) * s(tx)) * s(ty); };
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    let value = 0, amp = .5; for (const level of grid) { value += sample(level, i / size * scale, j / size * scale) * amp; amp *= .5; }
    value = .5 + (value - .47) * contrast + (random() - .5) * .12;
    const k = Math.max(0, Math.min(255, value * 255)); const p = (j * size + i) * 4; img.data[p] = img.data[p + 1] = img.data[p + 2] = k; img.data[p + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 8;
  return tex;
}

// trim the transparent margin of a layer (alpha ≥ threshold), optionally keeping it centred left/right so the site can place it by width alone
export function cropToContent(canvas, {threshold = 3, pad = 4, symmetric = true} = {}) {
  const w = canvas.width, h = canvas.height, d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] >= threshold) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return {canvas, box: {x: 0, y: 0, w, h}};
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  if (symmetric) { const half = Math.max(w / 2 - x0, x1 + 1 - w / 2); x0 = Math.max(0, Math.floor(w / 2 - half)); x1 = Math.min(w - 1, Math.ceil(w / 2 + half) - 1); }
  const out = document.createElement('canvas'); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1; out.getContext('2d').drawImage(canvas, -x0, -y0);
  return {canvas: out, box: {x: x0, y: y0, w: out.width, h: out.height}};
}
// the alpha bounding box of a square picture, as the vitrine describes its art: height and bottom margin as fractions of the side
// foot: how wide the piece is where it rests (the widest run of opaque pixels in its lowest 4 %), for the contact shadow on the pillar
export function artBox(canvas, threshold = 8) {
  const {box} = cropToContent(canvas, {threshold, pad: 0, symmetric: false}), S = canvas.height, W = canvas.width;
  const d = canvas.getContext('2d').getImageData(0, 0, W, S).data, y1 = box.y + box.h - 1, y0 = Math.round(y1 - box.h * .04);
  let foot = 0; for (let y = y0; y <= y1; y++) { let a = W, b = -1; for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] >= 128) { if (x < a) a = x; b = x; } if (b > a) foot = Math.max(foot, b - a + 1); }
  return {h: +(box.h / S).toFixed(4), bottom: +((S - box.y - box.h) / S).toFixed(4), width: +(box.w / W).toFixed(4), foot: +(foot / W).toFixed(4)};
}

export function finish(canvases, info = {}) {
  window.results = Object.fromEntries(Object.entries(canvases).map(([k, c]) => [k, c.toDataURL('image/png')]));
  window.info = info; window.done = true;
}
