'use strict';
// PNG sem dependências (8 bits, RGB/RGBA/cinza, sem entrelaçamento) para as ferramentas de imagem: tools/make-logo-icons.cjs.
// decode → {width, height, rgba}; encode(rgba) → PNG RGBA; resize: média por área na cor pré-multiplicada (sem franja clara ou
// escura onde o alfa cai); ico: o favicon.ico com uma imagem PNG por tamanho (o formato que todo navegador lê desde 2010).
const zlib = require('node:zlib');

function decode(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8, width, height, depth, type, interlace; const idat = [];
  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos), kind = buffer.toString('latin1', pos + 4, pos + 8), data = buffer.subarray(pos + 8, pos + 8 + length);
    if (kind === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    if (kind === 'IDAT') idat.push(data);
    pos += 12 + length;
  }
  const channels = {0: 1, 2: 3, 4: 2, 6: 4}[type];
  if (depth !== 8 || interlace !== 0 || !channels) throw new Error(`unsupported PNG (depth ${depth}, type ${type}, interlace ${interlace})`);
  const stride = width * channels, raw = zlib.inflateSync(Buffer.concat(idat)), out = Buffer.alloc(height * stride);
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
  for (let i = 0; i < width * height; i++) {
    const s = i * channels, gray = channels < 3;
    rgba[i * 4] = out[s]; rgba[i * 4 + 1] = out[gray ? s : s + 1]; rgba[i * 4 + 2] = out[gray ? s : s + 2];
    rgba[i * 4 + 3] = channels === 4 ? out[s + 3] : channels === 2 ? out[s + 1] : 255;
  }
  return {width, height, rgba};
}

function crc32(buf) { let c, crc = ~0; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 255; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; }
function chunk(kind, data) {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(kind, 4, 'latin1');
  const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}
// Filtro por linha escolhido pela menor soma absoluta (a heurística do libpng): bem menor que "sem filtro" em arte com degradê.
function encode({width, height, rgba}, {opaque = false} = {}) {
  const channels = opaque ? 3 : 4, stride = width * channels;
  const pixels = opaque ? Buffer.alloc(width * height * 3) : rgba;
  if (opaque) for (let i = 0; i < width * height; i++) { pixels[i * 3] = rgba[i * 4]; pixels[i * 3 + 1] = rgba[i * 4 + 1]; pixels[i * 3 + 2] = rgba[i * 4 + 2]; }
  const raw = Buffer.alloc((stride + 1) * height), candidate = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const row = pixels.subarray(y * stride, (y + 1) * stride), prev = y ? pixels.subarray((y - 1) * stride, y * stride) : null;
    let bestFilter = 0, bestScore = Infinity, best = null;
    for (let filter = 0; filter < 5; filter++) {
      let score = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= channels ? row[x - channels] : 0, b = prev ? prev[x] : 0, c = prev && x >= channels ? prev[x - channels] : 0;
        let p = 0;
        if (filter === 1) p = a; else if (filter === 2) p = b; else if (filter === 3) p = (a + b) >> 1;
        else if (filter === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        const v = (row[x] - p) & 255; candidate[x] = v; score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) { bestScore = score; bestFilter = filter; best = Buffer.from(candidate); }
    }
    raw[y * (stride + 1)] = bestFilter; best.copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = opaque ? 2 : 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, {level: 9, memLevel: 9})), chunk('IEND', Buffer.alloc(0))]);
}

// Média por área (caixa) em cor pré-multiplicada, para qualquer tamanho de saída.
function resize({width, height, rgba}, outW, outH = outW) {
  const out = Buffer.alloc(outW * outH * 4), sx = width / outW, sy = height / outH;
  for (let y = 0; y < outH; y++) {
    const y0 = y * sy, y1 = (y + 1) * sy;
    for (let x = 0; x < outW; x++) {
      const x0 = x * sx, x1 = (x + 1) * sx;
      let r = 0, g = 0, b = 0, a = 0, w = 0;
      for (let py = Math.floor(y0); py < Math.min(height, Math.ceil(y1)); py++) {
        const wy = Math.min(py + 1, y1) - Math.max(py, y0);
        for (let px = Math.floor(x0); px < Math.min(width, Math.ceil(x1)); px++) {
          const weight = (Math.min(px + 1, x1) - Math.max(px, x0)) * wy, i = (py * width + px) * 4, alpha = rgba[i + 3] / 255 * weight;
          r += rgba[i] * alpha; g += rgba[i + 1] * alpha; b += rgba[i + 2] * alpha; a += alpha; w += weight;
        }
      }
      const o = (y * outW + x) * 4;
      if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); out[o + 3] = Math.round((a / w) * 255); }
    }
  }
  return {width: outW, height: outH, rgba: out};
}

// favicon.ico: diretório ICONDIR + uma entrada PNG por tamanho (16, 32, 48…).
function ico(images) {
  const pngs = images.map(image => encode(image));
  const head = Buffer.alloc(6 + 16 * images.length); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach((image, n) => {
    const e = 6 + 16 * n;
    head[e] = image.width >= 256 ? 0 : image.width; head[e + 1] = image.height >= 256 ? 0 : image.height; head[e + 2] = 0; head[e + 3] = 0;
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6); head.writeUInt32LE(pngs[n].length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += pngs[n].length;
  });
  return Buffer.concat([head, ...pngs]);
}

module.exports = {decode, encode, resize, ico};
