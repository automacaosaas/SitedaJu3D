// node export-glb.cjs [out.glb] [error] [page] — a 3D preview of the site (needs serve.cjs on 8851). Default: the airplane from the real CAD;
// the provisional Macacoscópio: node export-glb.cjs ../../dist/assets/models/macacoscopio.glb 0.0001 monkey-glb.html
// 1. plane.html?export=glb assembles the STL parts as in the renders and writes a welded GLB (read here in slices);
// 2. gltf-transform 4.5.1 (the process of PERFORMANCE-QA.md): simplify with an error limit (detail kept where the shape has it),
//    then meshopt compression with 16-bit positions. Prints the sizes and the coordinates the model tests use. The cockpit pane stands
//    0.5 mm off the skin here (0.2 in the renders): at the viewer's depth precision a closer pane flickers through the shell.
const fs = require('fs'), path = require('path'), {execFileSync} = require('child_process');
const {withBrowser} = require('./cdp.cjs');
const [out = path.join(__dirname, '..', '..', 'dist', 'assets', 'models', 'aviaoscopia.glb'), error = '0.00007', page = 'plane.html?export=glb&passes=1&glift=.5&gdepth=.35'] = process.argv.slice(2);
const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'glb-'));
const raw = path.join(tmp, 'raw.glb'), simple = path.join(tmp, 'simple.glb');
withBrowser(async b => {
  await b.viewport(800, 800);
  await b.goto(`http://127.0.0.1:8851/${page}`, {wait: 300});
  const started = Date.now();
  while (Date.now() - started < 400000) { try { if (await b.eval('window.done === true')) break; } catch {} await b.sleep(500); }
  const info = await b.eval('window.info'), length = await b.eval('window.glbB64.length');
  let b64 = ''; for (let at = 0; at < length; at += 8e6) b64 += await b.eval(`window.glbB64.slice(${at}, ${at + 8e6})`);
  fs.writeFileSync(raw, Buffer.from(b64, 'base64'));
  console.log('raw', (fs.statSync(raw).size / 1048576).toFixed(1), 'MB', JSON.stringify(info));
}, {webgl: true, port: 9600 + process.pid % 300}).then(() => {
  const cli = (...args) => execFileSync('npx', ['-y', '@gltf-transform/cli@4.5.1', ...args], {stdio: ['ignore', 'pipe', 'pipe'], shell: true}).toString();
  cli('simplify', raw, simple, '--ratio', '0', '--error', error);
  cli('meshopt', simple, out, '--level', 'high', '--quantize-position', '16');
  console.log('simplified', (fs.statSync(simple).size / 1048576).toFixed(1), 'MB → compressed', (fs.statSync(out).size / 1024).toFixed(0), 'KB', out);
  const j = (f => { const d = fs.readFileSync(f); return JSON.parse(d.toString('utf8', 20, 20 + d.readUInt32LE(12))); })(simple);
  console.log('triangles', j.meshes[0].primitives.map((p, i) => `${j.materials[p.material].name} ${j.accessors[p.indices].count / 3}`).join(', '));
  fs.rmSync(tmp, {recursive: true, force: true});
});
