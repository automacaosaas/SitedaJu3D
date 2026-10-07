// GLTF_NM=<node_modules do gltf-transform CLI 4.5.1> node reduzir-comprimir.cjs <entrada.glb> <saida.glb> [proporção 0.5] [erro 0.0004]
// Menos triângulos sem mexer nas bordas entre cores, depois a compressão Meshopt de sempre (PERFORMANCE-QA.md). Cada cor é uma
// primitiva do GLB; a simplificação do meshoptimizer roda em cada uma com a borda travada (lockBorder), então o contorno entre duas
// cores fica exatamente o da malha inteira (a redução do Blender esticava triângulos brancos por cima do roxo nas bordas). Mesmas
// bibliotecas e mesmo cuidado de tools que não carregam o módulo nativo 'sharp' (bloqueado nesta máquina; só serve para texturas).
const path = require('path'); const Module = require('module'); const {createRequire} = Module;
const load = Module._load;
Module._load = function (request, ...rest) { if (request === 'sharp') return new Proxy({}, {get() { throw new Error('sharp não deveria ser usado: o modelo tem textura?'); }}); return load.call(this, request, ...rest); };
const req = createRequire(path.join(process.env.GLTF_NM, '@gltf-transform', 'cli', 'package.json'));
(async () => {
  const {NodeIO} = req('@gltf-transform/core'); const {ALL_EXTENSIONS} = req('@gltf-transform/extensions');
  const {weld, simplify, meshopt, unpartition} = req('@gltf-transform/functions');
  const {MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier} = req('meshoptimizer');
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
  const io = new NodeIO(global.fetch).registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder});
  const [input, output, ratio = '0.5', error = '0.0004'] = process.argv.slice(2);
  const doc = await io.read(input);
  const tris = () => doc.getRoot().listMeshes().flatMap(m => m.listPrimitives()).map(p => `${p.getMaterial()?.getName()}:${(p.getIndices()?.getCount() ?? 0) / 3}`).join(' ');
  console.log('ANTES', tris());
  await doc.transform(weld(), simplify({simplifier: MeshoptSimplifier, ratio: Number(ratio), error: Number(error), lockBorder: true}));
  console.log('DEPOIS', tris());
  await doc.transform(meshopt({encoder: MeshoptEncoder, level: 'high', quantizePosition: 16}), unpartition());
  await io.write(output, doc);
  console.log('OK', path.basename(output), io.lastReadBytes, '->', io.lastWriteBytes);
})().catch(e => { console.error(e); process.exit(1); });
