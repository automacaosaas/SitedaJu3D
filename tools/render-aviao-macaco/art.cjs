// node art.cjs picture.png|webp … — the numbers products.js keeps for a vitrine picture (SHOWCASE.<key>.art): h (visible height), bottom (free
// space below), foot (width where it rests: the widest opaque run in its lowest 4 %), all as fractions of the side. Needs ffmpeg on the PATH.
const {execFileSync} = require('child_process');
for (const file of process.argv.slice(2)) {
  const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]).toString().trim().split(',').map(Number);
  const [W, H] = probe, a = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'alphaextract', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], {maxBuffer: W * H + 1024});
  let y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (a[y * W + x] >= 8) { if (y < y0) y0 = y; y1 = y; break; }
  const lo = Math.round(y1 - (y1 - y0 + 1) * .04); let foot = 0;
  for (let y = lo; y <= y1; y++) { let l = W, r = -1; for (let x = 0; x < W; x++) if (a[y * W + x] >= 128) { if (x < l) l = x; r = x; } if (r > l) foot = Math.max(foot, r - l + 1); }
  console.log(file.split(/[\\/]/).pop(), JSON.stringify({h: +((y1 - y0 + 1) / H).toFixed(4), bottom: +((H - 1 - y1) / H).toFixed(4), foot: +(foot / W).toFixed(4)}));
}
