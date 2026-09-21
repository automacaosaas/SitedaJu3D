// Generates dist/assets/logo-ju-email.png: the official logo with a transparent background, sized for e-mail.
// Usage: node tools/make-email-logo.cjs
// No dependencies. The source art sits on a flat cream background; everything connected to the image border through
// near-background pixels becomes transparent, and the anti-aliased edge is un-mixed from the cream so the logo has
// no halo on white, pink or dark backgrounds. Areas enclosed by the artwork (e.g. the printer body) stay opaque.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SRC = path.join(__dirname, '..', 'dist', 'assets', 'logo-ju.png');
const OUT = path.join(__dirname, '..', 'dist', 'assets', 'logo-ju-email.png');
const SIZE = 360;      // 2x of the 180px it is shown at in the e-mail
const TOLERANCE = 34;  // max per-channel distance from the background to count as "background"
const HALO = 3;        // px around the removed area whose edge is un-mixed from the background

function decode(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8, width, height, depth, type, interlace; const idat = [];
  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos), kind = buffer.toString('latin1', pos + 4, pos + 8), data = buffer.subarray(pos + 8, pos + 8 + length);
    if (kind === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    if (kind === 'IDAT') idat.push(data);
    pos += 12 + length;
  }
  if (depth !== 8 || interlace !== 0 || ![2, 6].includes(type)) throw new Error(`unsupported PNG (depth ${depth}, type ${type}, interlace ${interlace})`);
  const channels = type === 6 ? 4 : 3, stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat)), out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = out.subarray(y * stride, (y + 1) * stride), prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? row[x - channels] : 0, b = prev ? prev[x] : 0, c = prev && x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a; else if (filter === 2) v += b; else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      row[x] = v & 255;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) { rgba[i * 4] = out[i * channels]; rgba[i * 4 + 1] = out[i * channels + 1]; rgba[i * 4 + 2] = out[i * channels + 2]; rgba[i * 4 + 3] = channels === 4 ? out[i * 4 + 3] : 255; }
  return {width, height, rgba};
}

function crc32(buf) { let c, crc = ~0; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 255; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; }
function encode({width, height, rgba}) {
  const chunk = (kind, data) => { const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(kind, 4, 'latin1'); const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0); return Buffer.concat([head, data, tail]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (width * 4 + 1)] = 0; rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, {level: 9})), chunk('IEND', Buffer.alloc(0))]);
}

function removeBackground({width, height, rgba}) {
  // Background colour: median of the four corner patches (the art is flat cream there).
  const samples = [];
  for (const [cx, cy] of [[0, 0], [width - 12, 0], [0, height - 12], [width - 12, height - 12]]) for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) samples.push((cy + y) * width + cx + x);
  const bg = [0, 1, 2].map(ch => { const v = samples.map(i => rgba[i * 4 + ch]).sort((a, b) => a - b); return v[v.length >> 1]; });
  const near = i => Math.max(Math.abs(rgba[i * 4] - bg[0]), Math.abs(rgba[i * 4 + 1] - bg[1]), Math.abs(rgba[i * 4 + 2] - bg[2])) <= TOLERANCE;
  // Flood fill from every border pixel through "near background" pixels.
  const removed = new Uint8Array(width * height), stack = [];
  const push = i => { if (!removed[i] && near(i)) { removed[i] = 1; stack.push(i); } };
  for (let x = 0; x < width; x++) { push(x); push((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { push(y * width); push(y * width + width - 1); }
  while (stack.length) {
    const i = stack.pop(), x = i % width, y = (i / width) | 0;
    if (x > 0) push(i - 1); if (x < width - 1) push(i + 1); if (y > 0) push(i - width); if (y < height - 1) push(i + width);
  }
  // Distance (in px) to the removed area, capped at HALO, to find the anti-aliased rim.
  const dist = new Uint8Array(width * height).fill(255); let frontier = [];
  for (let i = 0; i < removed.length; i++) if (removed[i]) { dist[i] = 0; frontier.push(i); }
  for (let d = 1; d <= HALO; d++) {
    const next = [];
    for (const i of frontier) { const x = i % width, y = (i / width) | 0; for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1]) if (j >= 0 && dist[j] === 255) { dist[j] = d; next.push(j); } }
    frontier = next;
  }
  const out = Buffer.from(rgba);
  for (let i = 0; i < width * height; i++) {
    if (dist[i] === 0) { out[i * 4 + 3] = 0; continue; }
    if (dist[i] > HALO) continue;
    // "Colour to alpha": smallest alpha for which the pixel is a mix of the background and some foreground colour.
    let alpha = 0;
    for (let ch = 0; ch < 3; ch++) { const p = rgba[i * 4 + ch], b = bg[ch]; alpha = Math.max(alpha, p < b ? (b - p) / b : p > b ? (p - b) / (255 - b) : 0); }
    alpha = Math.min(1, alpha * 1.04);
    if (alpha < 0.02) { out[i * 4 + 3] = 0; continue; }
    for (let ch = 0; ch < 3; ch++) out[i * 4 + ch] = Math.max(0, Math.min(255, Math.round((rgba[i * 4 + ch] - bg[ch] * (1 - alpha)) / alpha)));
    out[i * 4 + 3] = Math.round(alpha * 255);
  }
  return {image: {width, height, rgba: out}, bg};
}

function resize({width, height, rgba}, size) {
  // Area-average on premultiplied colour so transparent pixels never bleed dark or light fringes.
  const out = Buffer.alloc(size * size * 4), scale = width / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const x0 = x * scale, x1 = (x + 1) * scale, y0 = y * scale, y1 = (y + 1) * scale;
    let r = 0, g = 0, b = 0, a = 0, w = 0;
    for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
      const weight = (Math.min(sx + 1, x1) - Math.max(sx, x0)) * (Math.min(sy + 1, y1) - Math.max(sy, y0)), i = (sy * width + sx) * 4, alpha = rgba[i + 3] / 255;
      r += rgba[i] * alpha * weight; g += rgba[i + 1] * alpha * weight; b += rgba[i + 2] * alpha * weight; a += alpha * weight; w += weight;
    }
    const o = (y * size + x) * 4;
    if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); out[o + 3] = Math.round((a / w) * 255); }
  }
  return {width: size, height: size, rgba: out};
}

const source = decode(fs.readFileSync(SRC));
const {image, bg} = removeBackground(source);
const result = resize(image, SIZE);
fs.writeFileSync(OUT, encode(result));
const transparent = result.rgba.filter((v, i) => i % 4 === 3 && v === 0).length / (SIZE * SIZE);
console.log(`background ${bg.join(',')} · ${source.width}px → ${SIZE}px · ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB · ${(transparent * 100).toFixed(0)}% transparent`);
