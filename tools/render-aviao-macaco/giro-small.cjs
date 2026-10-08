#!/usr/bin/env node
// The unicorn's head turn at half resolution (dist/assets/unicornioscopio-giro-m.webp), made from the full strip that
// "lamp-assets.cjs --giro" writes: every frame is scaled down on its own (no bleeding between neighbouring frames) with the
// browser's high-quality filter, into whole-pixel cells. hero-demo.js picks it when the head's box on the screen is no bigger than
// one of its frames (phones at 2x, most computers): a quarter of the memory to decode. Prints the numbers for products.js.
//   node giro-small.cjs        (run again after a new --giro)
const fs = require('fs'), path = require('path');
const {withBrowser} = require('./cdp.cjs');
const ASSETS = path.join(__dirname, '..', '..', 'dist', 'assets'), FULL = 'unicornioscopio-giro.webp', SMALL = 'unicornioscopio-giro-m.webp';
const COLS = 6, FRAMES = 36, QUALITY = .88;

withBrowser(async b => {
  await b.goto('about:blank', {wait: 50});
  const data = await b.eval(`(async () => {
    const img = new Image(); img.src = 'data:image/webp;base64,${fs.readFileSync(path.join(ASSETS, FULL)).toString('base64')}'; await img.decode();
    const rows = Math.ceil(${FRAMES} / ${COLS}), fw = img.naturalWidth / ${COLS}, fh = img.naturalHeight / rows, cw = Math.round(fw / 2), ch = Math.round(fh / 2);
    const grid = document.createElement('canvas'); grid.width = cw * ${COLS}; grid.height = ch * rows;
    const g = grid.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    for (let i = 0; i < ${FRAMES}; i++) {
      // the frame alone first, so the filter never reads pixels of the next frame
      const cell = document.createElement('canvas'); cell.width = Math.round(fw); cell.height = Math.round(fh);
      cell.getContext('2d').drawImage(img, (i % ${COLS}) * fw, Math.floor(i / ${COLS}) * fh, fw, fh, 0, 0, cell.width, cell.height);
      g.drawImage(cell, 0, 0, cell.width, cell.height, (i % ${COLS}) * cw, Math.floor(i / ${COLS}) * ch, cw, ch);
    }
    const blob = await new Promise(r => grid.toBlob(r, 'image/webp', ${QUALITY})), buf = new Uint8Array(await blob.arrayBuffer());
    let str = ''; for (let i = 0; i < buf.length; i += 32768) str += String.fromCharCode(...buf.subarray(i, i + 32768));
    return JSON.stringify({full: [img.naturalWidth, img.naturalHeight], cell: [cw, ch], size: [grid.width, grid.height], b64: btoa(str)});
  })()`);
  const {full, cell, size, b64} = JSON.parse(data);
  fs.writeFileSync(path.join(ASSETS, SMALL), Buffer.from(b64, 'base64'));
  console.log(SMALL, size.join('x'), `(from ${full.join('x')}),`, Math.round(fs.statSync(path.join(ASSETS, SMALL)).size / 1024), 'KB');
  console.log('products.js → demo.turn.small:', JSON.stringify({src: SMALL, width: cell[0]}));
}, {port: 9600 + process.pid % 300});
