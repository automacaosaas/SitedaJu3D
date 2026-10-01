// node sheet.cjs <dir> <out.png> <cols> <cropW> <cropH> <cropX> <cropY> <thumbW> — contact sheet of the frames in a folder (no labels: the order is the time order)
const fs = require('fs'), path = require('path'), {spawnSync} = require('child_process');
const [dir, out, cols = '5', cw = '900', ch = '900', cx = '270', cy = '0', tw = '300'] = process.argv.slice(2);
const files = fs.readdirSync(dir).filter(f => /^f\d+\.png$/.test(f)).sort();
const inputs = files.flatMap(f => ['-i', path.join(dir, f)]);
const filters = files.map((f, i) => `[${i}:v]crop=${cw}:${ch}:${cx}:${cy},scale=${tw}:-1[v${i}]`).join(';');
const th = Math.round(Number(tw) * Number(ch) / Number(cw));
const layout = files.map((_, i) => `${(i % Number(cols)) * Number(tw)}_${Math.floor(i / Number(cols)) * th}`).join('|');
const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', filters + ';' + files.map((_, i) => `[v${i}]`).join('') + `xstack=inputs=${files.length}:layout=${layout}[o]`, '-map', '[o]', '-frames:v', '1', out], {encoding: 'utf8'});
console.log(r.status === 0 ? 'ok ' + out + ' (' + files.map(f => Number(f.slice(1, 5))).join(', ') + ' ms)' : r.stderr.slice(0, 600));
