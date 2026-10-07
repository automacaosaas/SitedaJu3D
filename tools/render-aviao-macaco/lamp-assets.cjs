#!/usr/bin/env node
// The lamps' pictures from their corrected 3D (07/10/2026): renders of lamp-glb.html placed exactly where the old pictures had the piece
// (the same height, bottom and centre of the alpha box of each file), so the showcase, the cards and the demonstration keep their
// framing: product-<peça>-cutout (1254), card-<peça> (768) and card-preview-<peça> (384). With "--vistas", also the giraffe's gallery
// sources (design/vistas/girafoscopio-3d-*.png: frente, lado, costas and the face for the close-up).
// Needs `node serve.cjs` running (port 8851).   node lamp-assets.cjs girafoscopio,unicornioscopio [--vistas]
const fs = require('fs'), path = require('path'), {execFileSync} = require('child_process');
const {withBrowser} = require('./cdp.cjs');
const ROOT = path.join(__dirname, '..', '..'), ASSETS = path.join(ROOT, 'dist', 'assets'), VISTAS = path.join(ROOT, 'design', 'vistas'), TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'lamp-'));
const pieces = (process.argv[2] || 'girafoscopio,unicornioscopio').split(','), vistas = process.argv.includes('--vistas');
const b64 = f => fs.readFileSync(f).toString('base64');
// light and colour of each piece's pictures: a firmer key than the default (the shading of the showcase photos) and, on the giraffe, the
// lemon yellow and the darker brown of its showcase photo (only in the picture: lamp-glb.html tint)
const LOOK = {girafoscopio: '&exposure=1.12&key=3&dome=0.75&tint=coat:%23e8b616,spots:%23572e1a', unicornioscopio: '&exposure=1.1&key=3&dome=0.8'};

for (const id of pieces) {
  const views = ['frente:0:6', ...(vistas && id === 'girafoscopio' ? ['lado:90:6', 'costas:180:6', 'rosto:0:4:face'] : [])].join(',');
  execFileSync('node', [path.join(__dirname, 'runpage.cjs'), `glb=/assets/models/${id}.glb&views=${views}&size=1800&passes=56${LOOK[id] || ''}`, path.join(TMP, `${id}.png`), 'lamp-glb.html'], {stdio: 'inherit', cwd: __dirname});
  if (vistas && id === 'girafoscopio') for (const v of ['frente', 'lado', 'costas', 'rosto']) fs.copyFileSync(path.join(TMP, `${id}-${v}.png`), path.join(VISTAS, `girafoscopio-3d-${v}.png`));
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
}, {port: 9600 + process.pid % 300}).then(() => fs.rmSync(TMP, {recursive: true, force: true}));
