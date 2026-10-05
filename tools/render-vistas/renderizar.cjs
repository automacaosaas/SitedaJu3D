#!/usr/bin/env node
// Fotos da galeria renderizadas dos modelos do site (render.py, Blender 5.2, Cycles): para cada peça, as 4 vistas do padrão
// (dist/gallery.js) nas cores da vitrine, em design/vistas/renders/<peça>-<vista>.webp (1200 x 1500, fundo transparente). Depois,
// node tools/galeria-vistas/gerar.cjs leva para dist/assets/vistas/ (com a sombra no chão).
//   GLTF_NM=<node_modules do gltf-transform> node tools/render-vistas/renderizar.cjs [peças] [--vistas=detalhe,…] [--amostras=128] [--rascunho]
// O Blender não lê a compressão Meshopt dos modelos do site: o modelo vai sem ela (e sem a quantização) para uma pasta temporária.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {pathToFileURL} = require('node:url');

const ROOT = path.join(__dirname, '..', '..'), OUT = path.join(ROOT, 'design', 'vistas', 'renders');
const BLENDER = process.env.BLENDER || 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe';
const args = process.argv.slice(2), opt = name => args.find(a => a.startsWith(`--${name}`))?.split('=')[1];
const rascunho = args.includes('--rascunho');
// O detalhe de perto de cada peça: [altura do centro, altura do quadro], em frações da altura da peça (o rosto, a cabine). Com folga
// embaixo: no celular a foto de perto enche uma área quase quadrada presa no alto, e o quinto de baixo do quadro fica de fora.
const DETALHE = {borboletoscopio: [.72, .52], dinossauroscopio: [.78, .50], aviaoscopia: [.78, .50], macacoscopio: [.74, .50]};
const SO = opt('vistas')?.split(',');
const VISTAS = key => [
  {id: 'frente', giro: 0},
  {id: 'tres-quartos', giro: -35},
  {id: 'costas', giro: 180},
  {id: 'detalhe', giro: 12, elev: 8, detalhe: DETALHE[key]}
].filter(v => !SO || SO.includes(v.id));

(async () => {
  const {PRODUCTS, SOON, PALETTE} = await import(pathToFileURL(path.join(ROOT, 'dist', 'products.js')).href);
  const keys = args.find(a => !a.startsWith('--'))?.split(',') || [...Object.keys(PRODUCTS), ...Object.keys(SOON)];
  const req = require('node:module').createRequire(path.join(process.env.GLTF_NM, '@gltf-transform', 'cli', 'package.json'));
  const {NodeIO} = req('@gltf-transform/core'), {ALL_EXTENSIONS} = req('@gltf-transform/extensions');
  const {dequantize} = req('@gltf-transform/functions'), {MeshoptDecoder} = req('meshoptimizer');
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder': MeshoptDecoder});
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'render-vistas-'));
  fs.mkdirSync(OUT, {recursive: true});
  try {
    for (const key of keys) {
      const p = PRODUCTS[key] || SOON[key];
      if (!p) throw new Error(`peça desconhecida: ${key}`);
      const doc = await io.read(path.join(ROOT, 'dist', 'assets', 'models', `${key}.glb`));
      for (const ext of doc.getRoot().listExtensionsUsed()) if (['EXT_meshopt_compression', 'KHR_mesh_quantization'].includes(ext.extensionName)) ext.dispose();
      await doc.transform(dequantize());
      const modelo = path.join(tmp, `${key}.glb`);
      await io.write(modelo, doc);
      // as cores da vitrine (o padrão de cada parte); peça sem partes coloríveis (o macaco) fica com as cores do modelo
      const cores = Object.fromEntries((p.parts || []).map(part => [part.id, PALETTE.find(c => c.id === part.default).hex]));
      const config = {modelo, saida: path.join(tmp, key), cores, vistas: VISTAS(key), largura: rascunho ? 480 : 1200, altura: rascunho ? 600 : 1500,
        amostras: Number(opt('amostras') || (rascunho ? 32 : 128))};
      fs.writeFileSync(path.join(tmp, `${key}.json`), JSON.stringify(config));
      const t = Date.now();
      execFileSync(BLENDER, ['-b', '-P', path.join(__dirname, 'render.py'), '--', path.join(tmp, `${key}.json`)], {stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 28});
      for (const v of config.vistas) fs.copyFileSync(path.join(config.saida, `${v.id}.webp`), path.join(OUT, `${key}-${v.id}${rascunho ? '-rascunho' : ''}.webp`));
      console.log(`${key}: ${config.vistas.length} vistas em ${Math.round((Date.now() - t) / 1000)} s (${Object.entries(cores).map(([k, v]) => `${k} ${v}`).join(', ') || 'cores do modelo'})`);
    }
  } finally { fs.rmSync(tmp, {recursive: true, force: true}); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
