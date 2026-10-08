#!/usr/bin/env node
// The lamps' pictures from their corrected 3D (07/10/2026): renders of lamp-glb.html placed exactly where the old pictures had the piece
// (the same height, bottom and centre of the alpha box of each file), so the showcase, the cards and the demonstration keep their
// framing: product-<peça>-cutout (1254), card-<peça> (768) and card-preview-<peça> (384). With "--vistas", also the giraffe's gallery
// sources (design/vistas/girafoscopio-3d-*.png: frente, lado, costas and the face for the close-up). With "--giro", the unicorn's head turn
// for "Ver encaixado" (dist/assets/unicornioscopio-giro.webp: the frames in a grid, only the part that changes; the numbers for
// products.js are printed) — and the showcase photo is then frame 0 itself, so the turn starts without any jump.
// Needs `node serve.cjs` running (port 8851). RENDER_GPU=d3d11 renders on the graphics card (about 7× faster than the software WebGL,
// the same picture).   node lamp-assets.cjs girafoscopio,unicornioscopio [--vistas] [--giro]
const fs = require('fs'), path = require('path'), {execFileSync} = require('child_process');
const {withBrowser} = require('./cdp.cjs');
const ROOT = path.join(__dirname, '..', '..'), ASSETS = path.join(ROOT, 'dist', 'assets'), VISTAS = path.join(ROOT, 'design', 'vistas'), TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'lamp-'));
const pieces = (process.argv[2] || 'girafoscopio,unicornioscopio').split(','), vistas = process.argv.includes('--vistas'), giro = process.argv.includes('--giro');
// the head turn: frames from 0 to TURN_MAX degrees (to the viewer's right), the head turning around the tube's axis. It ends where it
// sits on the tube (its ledge at y ≈ 0.556 and the snout hanging below it), the seam hidden under the ledge, with a collar inside the
// neck (07/10/2026: "fica piscando uma linha preta no pescoço"). 36 frames (2° apart) for a fluid turn; the grid is TURN_COLS wide and
// the frames are scaled by TURN_SCALE (a lighter image to decode on phones)
const TURN_FRAMES = 36, TURN_MAX = 70, TURN_COLS = 6, TURN_SCALE = .75, HEAD = '&cut=0.552&ledge=0.50,0.645,0.42,0.665&axis=0,-0.268&collar=0.628,0.40,0.56';
const b64 = f => fs.readFileSync(f).toString('base64');
// light and colour of each piece's pictures: a firmer key than the default (the shading of the showcase photos) and, on the giraffe, the
// lemon yellow and the darker brown of its showcase photo (only in the picture: lamp-glb.html tint)
const LOOK = {girafoscopio: '&exposure=1.12&key=3&dome=0.75&tint=coat:%23e8b616,spots:%23572e1a', unicornioscopio: '&exposure=1.1&key=3&dome=0.8&smooth=0' + HEAD};

for (const id of pieces) {
  // one view per page (a long page with several big views could stall the software WebGL)
  // the face (07/10/2026: the close-up showed only the top of the head): the whole head, ears and the top of the neck, from farther and
  // sharper (1800 px), for the gallery's "Rosto de perto"
  for (const view of ['frente:0:6', ...(vistas && id === 'girafoscopio' ? ['lado:90:6', 'costas:180:6', 'rosto:0:4:p0_0.8_10.5'] : [])])
    execFileSync('node', [path.join(__dirname, 'runpage.cjs'), `glb=/assets/models/${id}.glb&views=${view}&size=${view.startsWith('rosto') ? 1800 : 1600}&passes=44${LOOK[id] || ''}`, path.join(TMP, `${id}.png`), 'lamp-glb.html'], {stdio: 'inherit', cwd: __dirname});
  if (vistas && id === 'girafoscopio') for (const v of ['frente', 'lado', 'costas', 'rosto']) fs.copyFileSync(path.join(TMP, `${id}-${v}.png`), path.join(VISTAS, `girafoscopio-3d-${v}.png`));
  if (giro && id === 'unicornioscopio') {
    // one frame per page, the whole square (same camera: the frames line up)
    // the same size and passes as the showcase photo (frame 0 becomes the photo)
    for (let i = 0; i < TURN_FRAMES; i++) execFileSync('node', [path.join(__dirname, 'runpage.cjs'), `glb=/assets/models/${id}.glb&views=t${String(i).padStart(2, '0')}:0:6::${(TURN_MAX * i / (TURN_FRAMES - 1)).toFixed(2)}&size=1600&passes=44&full=1${LOOK[id]}`, path.join(TMP, 'giro.png'), 'lamp-glb.html'], {stdio: 'inherit', cwd: __dirname});
  }
}

withBrowser(async b => {
  await b.goto('about:blank', {wait: 50});
  for (const id of pieces) {
    const render = path.join(TMP, `${id}-frente.png`);
    for (const [file, quality] of [[`product-${id}-cutout.webp`, .9], [`card-${id}.webp`, .88], [`card-preview-${id}.webp`, .86]]) {
      const old = path.join(ASSETS, file);
      const data = await b.eval(`(async () => {
        const load = async src => { const i = new Image(); i.src = src; await i.decode(); return i; };
        const old = await load('data:image/webp;base64,${b64(old)}'), neu = await load('data:image/png;base64,${b64(render)}');
        const W = old.naturalWidth, H = old.naturalHeight, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
        g.drawImage(old, 0, 0); const d = g.getImageData(0, 0, W, H).data; let x0 = W, y0 = H, x1 = -1, y1 = -1;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        const h = y1 - y0 + 1, s = h / neu.naturalHeight, w = neu.naturalWidth * s, cx = (x0 + x1 + 1) / 2;
        g.clearRect(0, 0, W, H); g.imageSmoothingQuality = 'high';
        // two halvings at most, then the last step: a cleaner downscale than one big jump
        let src = neu, sw = neu.naturalWidth, sh = neu.naturalHeight;
        while (sw * .5 > w * 1.05) { const t = document.createElement('canvas'); t.width = Math.round(sw / 2); t.height = Math.round(sh / 2); const tg = t.getContext('2d'); tg.imageSmoothingQuality = 'high'; tg.drawImage(src, 0, 0, t.width, t.height); src = t; sw = t.width; sh = t.height; }
        g.drawImage(src, cx - w / 2, y1 + 1 - h, w, h);
        const blob = await new Promise(r => c.toBlob(r, 'image/webp', ${quality})); const buf = new Uint8Array(await blob.arrayBuffer());
        let str = ''; for (let i = 0; i < buf.length; i += 32768) str += String.fromCharCode(...buf.subarray(i, i + 32768));
        return JSON.stringify({box: [x0, y0, x1, y1], b64: btoa(str)}); })()`);
      const {box, b64: out} = JSON.parse(data);
      fs.writeFileSync(old, Buffer.from(out, 'base64'));
      console.log(file, 'box', box.join(','), Math.round(fs.statSync(old).size / 1024), 'KB');
    }
  }
  if (giro && pieces.includes('unicornioscopio')) {
    const frames = Array.from({length: TURN_FRAMES}, (_, i) => b64(path.join(TMP, `giro-t${String(i).padStart(2, '0')}.png`)));
    const data = await b.eval(`(async () => {
      const load = async src => { const i = new Image(); i.src = src; await i.decode(); return i; };
      const photo = await load('data:image/webp;base64,${b64(path.join(ASSETS, 'product-unicornioscopio-cutout.webp'))}');
      const frames = await Promise.all(${JSON.stringify(frames)}.map(d => load('data:image/png;base64,' + d)));
      const S = photo.naturalWidth, alphaBox = img => { const c = document.createElement('canvas'); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1; for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; };
      // frame 0 is the photo's own render: its piece goes exactly where the photo's piece is
      const B = alphaBox(photo), b0 = alphaBox(frames[0]), s = (B[3] - B[1] + 1) / (b0[3] - b0[1] + 1), dx = (B[0] + B[2] + 1) / 2 - s * (b0[0] + b0[2] + 1) / 2, dy = B[3] + 1 - s * (b0[3] + 1);
      const placed = frames.map(img => { const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, dx, dy, img.naturalWidth * s, img.naturalHeight * s); return c; });
      // the part that changes: pixels that differ from frame 0 in any frame (plus a margin); below it, the photo stays
      const base = placed[0].getContext('2d').getImageData(0, 0, S, S).data; let x0 = S, y0 = S, x1 = -1, y1 = -1;
      for (const c of placed.slice(1)) { const d = c.getContext('2d').getImageData(0, 0, S, S).data; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i + 3] - base[i + 3]) > 6 || Math.abs(d[i] - base[i]) + Math.abs(d[i + 1] - base[i + 1]) + Math.abs(d[i + 2] - base[i + 2]) > 18) { const p = i / 4, x = p % S, y = (p - x) / S; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
      // a wider margin (12 px): hero-demo.js cuts the photo a little inside the box, so photo and frames overlap in a ring where
      // nothing changes — no hairline between them while the demonstration floats
      x0 = Math.max(0, x0 - 12); y0 = Math.max(0, y0 - 12); x1 = Math.min(S - 1, x1 + 12); y1 = Math.min(S - 1, y1 + 14);
      const w = x1 - x0 + 1, h = y1 - y0 + 1, fw = Math.round(w * ${TURN_SCALE}), fh = Math.round(h * ${TURN_SCALE}), cols = ${TURN_COLS}, rows = Math.ceil(frames.length / cols);
      const grid = document.createElement('canvas'); grid.width = fw * cols; grid.height = fh * rows; const gg = grid.getContext('2d'); gg.imageSmoothingQuality = 'high';
      placed.forEach((c, i) => gg.drawImage(c, x0, y0, w, h, (i % cols) * fw, Math.floor(i / cols) * fh, fw, fh));
      const enc = async (cv, q) => { const blob = await new Promise(r => cv.toBlob(r, 'image/webp', q)), buf = new Uint8Array(await blob.arrayBuffer()); let str = ''; for (let i = 0; i < buf.length; i += 32768) str += String.fromCharCode(...buf.subarray(i, i + 32768)); return btoa(str); };
      return JSON.stringify({box: [x0 / S, y0 / S, w / S, h / S].map(v => +v.toFixed(4)), size: [fw, fh], cols, b64: await enc(grid, .86), photo: await enc(placed[0], .9)}); })()`);
    const {box, size, cols, b64: out, photo} = JSON.parse(data);
    fs.writeFileSync(path.join(ASSETS, 'unicornioscopio-giro.webp'), Buffer.from(out, 'base64'));
    // the showcase photo = frame 0 (the same render, the same placement): the turn starts exactly from the picture on the screen
    fs.writeFileSync(path.join(ASSETS, 'product-unicornioscopio-cutout.webp'), Buffer.from(photo, 'base64'));
    console.log('unicornioscopio-giro.webp', size.join('x'), 'x', TURN_FRAMES, 'in', cols, 'columns', Math.round(fs.statSync(path.join(ASSETS, 'unicornioscopio-giro.webp')).size / 1024), 'KB; product photo = frame 0');
    console.log('products.js → demo.turn:', JSON.stringify({src: 'unicornioscopio-giro.webp', frames: TURN_FRAMES, cols, box, angle: TURN_MAX}));
  }
}, {port: 9600 + process.pid % 300}).then(() => fs.rmSync(TMP, {recursive: true, force: true}));
