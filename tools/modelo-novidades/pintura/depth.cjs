// Front height map of a region of a model: triangles facing +z rasterized into a z-buffer (local coordinates), then a high-pass
// (z minus a wide Gaussian blur): raised details are positive blobs, grooves negative lines, whatever the curvature of the base.
// Also a tiny PNG writer for looking at maps.
const zlib = require('zlib'), fs = require('fs');

function rasterize(m, box, res) { // box: [x0, y0, x1, y1] local; res: grid step
  const W = Math.ceil((box[2] - box[0]) / res), H = Math.ceil((box[3] - box[1]) / res), Z = new Float32Array(W * H).fill(-Infinity), FID = new Int32Array(W * H).fill(-1);
  const P = m.P, F = m.F;
  for (let f = 0; f < m.nf; f++) {
    const a = F[f * 3], b = F[f * 3 + 1], c = F[f * 3 + 2];
    const ax = (P[a * 3] - box[0]) / res, ay = (P[a * 3 + 1] - box[1]) / res, bx = (P[b * 3] - box[0]) / res, by = (P[b * 3 + 1] - box[1]) / res, cx = (P[c * 3] - box[0]) / res, cy = (P[c * 3 + 1] - box[1]) / res;
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay); if (area <= 0) continue; // facing +z (counter-clockwise in x/y)
    const minx = Math.max(0, Math.floor(Math.min(ax, bx, cx))), maxx = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx))), miny = Math.max(0, Math.floor(Math.min(ay, by, cy))), maxy = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
    if (minx > maxx || miny > maxy) continue;
    const az = P[a * 3 + 2], bz = P[b * 3 + 2], cz = P[c * 3 + 2];
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const px = x + .5, py = y + .5;
      const w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area, w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area, w2 = 1 - w0 - w1;
      if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
      const z = w0 * az + w1 * bz + w2 * cz, i = y * W + x; if (z > Z[i]) { Z[i] = z; FID[i] = f; }
    }
  }
  return {W, H, Z, FID, box, res};
}
function blur(src, W, H, sigma, valid) { // normalized Gaussian blur (ignores invalid pixels)
  const n = Math.ceil(3 * sigma), K = []; for (let i = -n; i <= n; i++) K.push(Math.exp(-i * i / (2 * sigma * sigma)));
  const pass = (a, wa, horizontal) => { const o = new Float32Array(W * H), ow = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0, sw = 0; for (let k = -n; k <= n; k++) { const xx = horizontal ? x + k : x, yy = horizontal ? y : y + k; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx, w = K[k + n] * wa[j]; s += a[j] * w; sw += w; } o[y * W + x] = sw ? s / sw : 0; ow[y * W + x] = sw / K.reduce((p, q) => p + q, 0); }
    return [o, ow]; };
  const w0 = new Float32Array(W * H); for (let i = 0; i < W * H; i++) w0[i] = valid ? (valid[i] ? 1 : 0) : 1;
  const a0 = new Float32Array(W * H); for (let i = 0; i < W * H; i++) a0[i] = w0[i] ? src[i] : 0;
  const [a1, w1] = pass(a0, w0, true); const [a2] = pass(a1, w1, false); return a2;
}
function highpass(map, sigmaPx) { const {W, H, Z} = map, valid = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) valid[i] = Number.isFinite(Z[i]) ? 1 : 0; const base = blur(Z, W, H, sigmaPx, valid), h = new Float32Array(W * H); for (let i = 0; i < W * H; i++) h[i] = valid[i] ? Z[i] - base[i] : 0; return {h, valid}; }
function png(file, W, H, rgb) { // rgb: Uint8Array W*H*3
  const raw = Buffer.alloc((W * 3 + 1) * H); for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; Buffer.from(rgb.buffer, rgb.byteOffset + y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1); }
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
module.exports = {rasterize, blur, highpass, png};
