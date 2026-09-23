// Demonstração na vitrine: partes puras e regras do pedido. O movimento em si (quadros, clique × arraste,
// toque, movimento reduzido) é conferido no navegador. Run: node tests/hero-demo.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, 'dist', file), 'utf8');
const load = file => import(pathToFileURL(path.join(root, 'dist', file)).href);
const {planTracks} = await load('motion-timeline.js');
const {PRODUCTS, SHOWCASE, showcase} = await load('products.js');
const {translate} = await load('i18n-core.js');

// ── linha do tempo: todas as trilhas terminam juntas, então tocar ao contrário espelha a ordem ──
const plan = planTracks([{el: 1, duration: 400}, {el: 2, delay: 1000, duration: 900}, {el: 3, delay: 2020, duration: 380}]);
assert.equal(plan.total, 2400);
for (const track of plan.tracks) assert.equal(track.delay + track.duration + track.endDelay, 2400);
assert.deepEqual(plan.tracks.map(track => track.endDelay), [2000, 500, 0], 'a última a entrar é a primeira a sair');
assert.equal(planTracks([]).total, 0);

// ── dados: medidas coerentes com a peça e o equipamento ─────────────────────────
const demos = Object.entries(SHOWCASE).filter(([, entry]) => entry.demo);
assert.ok(demos.length >= 1);
for (const [key, {demo}] of demos) {
  const {tool, layers = {}} = demo;
  assert.ok(PRODUCTS[key], `${key}: produto existe`);
  assert.ok(fs.existsSync(path.join(root, 'dist/assets', tool.src)), `${key}: imagem do equipamento existe`);
  for (const value of [tool.width, tool.top, tool.ratio, ...tool.fade]) assert.ok(value > 0 && value <= 1, `${key}: medidas em fração do quadrado`);
  assert.ok(tool.fade[0] < tool.fade[1], `${key}: o equipamento se dissolve de cima para baixo`);
  assert.ok(!tool.turn || Math.abs(tool.turn) <= 20, `${key}: giro do equipamento discreto (acompanha a foto da peça)`);
  assert.ok(!tool.shift || Math.abs(tool.shift) < .05, `${key}: deslocamento do equipamento discreto`);
  assert.ok(tool.top + tool.fade[1] * tool.width / tool.ratio < 1.25, `${key}: o cabo some logo abaixo da peça (o foco fica no encaixe)`);
  for (const name of ['back', 'front']) if (layers[name]) assert.ok(fs.existsSync(path.join(root, 'dist/assets', layers[name])), `${key}: camada ${name} existe`);
  assert.ok(!layers.depth || (layers.back && layers.depth > 0 && layers.depth < .3), `${key}: recuo da camada de trás discreto`);
  for (const item of demo.callouts || []) {
    assert.ok(item.label && item.wide && item.compact, `${key}: chamada com rótulo e desenho para desktop e celular`);
    for (const {points, align} of [item.wide, item.compact]) assert.ok(points.length >= 2 && points.every(p => p.length === 2) && ['left', 'right', 'below'].includes(align), `${key}: linha da chamada ${item.label}`);
  }
  for (const name of ['glow', 'halo', 'accent', 'shade']) assert.match(demo[name], /^#[0-9a-f]{6}$/i, `${key}: cor ${name}`);
  assert.ok(!demo.zoom || (demo.zoom >= .8 && demo.zoom <= 1.25), `${key}: zoom discreto`);
  assert.ok(demo.message && translate(demo.message, 'en') !== demo.message && translate(demo.message, 'es') !== demo.message, `${key}: aviso traduzido`);
}
assert.equal(showcase('aviaoscopia').demo, null, 'produto sem demo continua abrindo o popup');
assert.ok(showcase('borboletoscopio').demo);
assert.equal(SHOWCASE.borboletoscopio.demo.layers.front, PRODUCTS.borboletoscopio.catalogImage, 'a frente da demonstração é a própria imagem da vitrine');
assert.deepEqual(SHOWCASE.borboletoscopio.demo.callouts.map(item => item.label), ['Borboletoscópio', 'Retinoscópio'], 'ficha técnica: só os dois rótulos pedidos');
assert.deepEqual(SHOWCASE.dinossauroscopio.demo.callouts.map(item => item.label), ['Dinossauroscópio', 'Retinoscópio']);
for (const key of Object.keys(SHOWCASE)) if (SHOWCASE[key].demo?.layers?.front) assert.equal(SHOWCASE[key].demo.layers.front, PRODUCTS[key].catalogImage, `${key}: a frente da demonstração é a própria imagem da vitrine`);
assert.equal(translate('Retinoscópio', 'en'), 'Retinoscope');

// ── regras do pedido, direto no código ──────────────────────────────────────────
const demo = read('hero-demo.js'), timeline = read('motion-timeline.js'), carousel = read('carousel.js'), css = read('hero-demo.css');
const html = read('index.html'), controller = read('controller.js');
assert.ok(!/borboletosc|dinossaurosc|aviaosc|retinosc/i.test(demo + timeline), 'a experiência vem dos dados: nada específico de produto no código');
assert.ok(html.includes('<link rel="stylesheet" href="hero-demo.css">'));
assert.ok(carousel.includes("import {createHeroDemo} from './hero-demo.js';"));
assert.ok(/if \(locked \|\| !e\.isPrimary/.test(carousel) && /if \(locked \|\| gesture/.test(carousel) && /if \(!locked && \(e\.key === 'ArrowLeft'/.test(carousel), 'arraste, setas e teclado travados durante a demonstração');
assert.ok(/performance\.now\(\) < suppressUntil[\s\S]{0,420}demo\.open\(index\)/.test(carousel), 'um arraste nunca abre a demonstração (o filtro de clique vem antes)');
assert.ok(/demo\.close\(\{immediate: true\}\)/.test(carousel), 'trocar de produto pela rota fecha a demonstração');
assert.ok(carousel.includes(".split('/')[0]") && controller.includes("step==='personalizar'") && demo.includes('/personalizar'), 'convite leva à personalização pela rota existente (#produto/<chave>/personalizar)');
assert.ok(/prefers-reduced-motion/.test(css) && /calm = reduced\.matches/.test(demo), 'movimento reduzido');
assert.ok(/finePointer\.matches/.test(demo), 'inclinação e flutuação só com mouse/trackpad');
assert.ok(/timeline\.cancel\(\)/.test(demo) && /float\.cancel\(\)/.test(demo) && /removeEventListener\('pointermove'/.test(demo), 'limpeza de animações e ouvintes');
assert.ok(!/setInterval/.test(demo + timeline));
assert.ok(demo.includes("dataset.back = !layers.back ? 'none' : layers.depth ? 'recessed' : 'rendered'") && css.includes('.hero-demo[data-back="recessed"] .demo-back {') && !/^\.demo-back \{[^}]*(filter|mask|scale)/m.test(css), 'camadas renderizadas juntas (depth 0) entram sem nenhuma compensação');
const ends = [...demo.matchAll(/delay: (\d+)[^}]*?duration: (\d+)/g)].map(m => Number(m[1]) + Number(m[2]));
assert.ok(ends.length > 10 && Math.max(...ends) <= 1700, `sequência completa em até 1,7 s (${Math.max(...ends)} ms)`);
assert.ok(/el: d\.header/.test(demo) && /\{opacity: \.6\}/.test(demo), 'o header fica mais discreto durante a demonstração');
assert.ok(/aria-label', 'Voltar à vitrine'/.test(demo) && /Personalize o seu/.test(demo));
for (const text of ['Voltar à vitrine', 'Personalize o seu']) { assert.notEqual(translate(text, 'en'), text); assert.notEqual(translate(text, 'es'), text); }

console.log('hero-demo: ok');
