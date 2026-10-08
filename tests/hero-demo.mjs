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
const {PRODUCTS, SOON, SHOWCASE, showcase} = await load('products.js');
const {translate} = await load('i18n-core.js');

// ── linha do tempo: um relógio só para todas as trilhas (tocar ao contrário espelha a ordem), sem endDelay — o Chrome não leva
//    para a GPU uma animação com endDelay, e a demonstração inteira rodava na thread principal (movimento 2, 08/10/2026) ──
const plan = planTracks([{el: 1, duration: 400}, {el: 2, delay: 1000, duration: 900}, {el: 3, delay: 2020, duration: 380}]);
assert.equal(plan.total, 2400);
assert.deepEqual(plan.tracks.map(track => track.delay), [0, 1000, 2020]);
assert.ok(plan.tracks.every(track => !('endDelay' in track)), 'nenhuma trilha com endDelay');
assert.equal(planTracks([]).total, 0);
{
  const timeline = read('motion-timeline.js').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/endDelay:/.test(timeline) && /animation\.startTime = this\.origin/.test(timeline) && !/animation\.play\(\)/.test(timeline),
    'play() por um startTime comum (sem o auto-rewind de play() numa trilha já terminada): ida e volta continuam alinhadas');
}

// ── dados: medidas coerentes com a peça e o equipamento ─────────────────────────
const demos = Object.entries(SHOWCASE).filter(([, entry]) => entry.demo);
assert.ok(demos.length >= 1);
for (const [key, {demo}] of demos) {
  const {tool, layers = {}} = demo;
  assert.ok(PRODUCTS[key] || SOON[key], `${key}: produto (ou novidade) existe`);
  if (demo.head) {
    assert.ok(fs.existsSync(path.join(root, 'dist/assets', demo.head.src)), `${key}: imagem da cabeça do equipamento existe`);
    assert.ok(demo.head.width > 0 && demo.head.width <= 1 && demo.head.ratio > 0 && demo.head.top > -.6 && demo.head.top < .5, `${key}: cabeça do equipamento em fração do quadrado, acima ou sobre a peça`);
  }
  assert.ok(fs.existsSync(path.join(root, 'dist/assets', tool.src)), `${key}: imagem do equipamento existe`);
  for (const value of [tool.width, tool.top, tool.ratio, ...tool.fade]) assert.ok(value > 0 && value <= 1, `${key}: medidas em fração do quadrado`);
  assert.ok(tool.fade[0] < tool.fade[1], `${key}: o equipamento se dissolve de cima para baixo`);
  assert.ok(!tool.turn || Math.abs(tool.turn) <= 20, `${key}: giro do equipamento discreto (acompanha a foto da peça)`);
  assert.ok(!tool.shift || Math.abs(tool.shift) < .05, `${key}: deslocamento do equipamento discreto`);
  // o cabo some logo abaixo da peça (o foco fica no encaixe); num equipamento em duas partes a carcaça embaixo da peça faz parte da cena,
  // e na montagem a régua aparece inteira, com o cabo nítido (pedido de 01/10/2026: nada de cabo desbotando)
  assert.ok(tool.top + tool.fade[1] * tool.width / tool.ratio < (demo.head ? 1.8 : demo.assemble ? 1.4 : 1.25), `${key}: o equipamento se dissolve logo abaixo da peça`);
  for (const name of ['back', 'front']) if (layers[name]) assert.ok(fs.existsSync(path.join(root, 'dist/assets', layers[name])), `${key}: camada ${name} existe`);
  assert.ok(!layers.depth || (layers.back && layers.depth > 0 && layers.depth < .3), `${key}: recuo da camada de trás discreto`);
  for (const item of demo.callouts || []) {
    assert.ok(item.label && item.wide && item.compact, `${key}: chamada com rótulo e desenho para desktop e celular`);
    for (const {points, align} of [item.wide, item.compact]) assert.ok(points.length >= 2 && points.every(p => p.length === 2) && ['left', 'right', 'below'].includes(align), `${key}: linha da chamada ${item.label}`);
  }
  for (const name of ['glow', 'halo', 'accent', 'shade']) assert.match(demo[name], /^#[0-9a-f]{6}$/i, `${key}: cor ${name}`);
  // zoom: um número, ou {wide, compact} quando o desktop e o celular pedem enquadramentos diferentes
  for (const z of [demo.zoom?.wide ?? demo.zoom, demo.zoom?.compact]) assert.ok(z === undefined || (z >= .7 && z <= 1.25), `${key}: zoom discreto`);
  assert.ok(demo.message && translate(demo.message, 'en') !== demo.message && translate(demo.message, 'es') !== demo.message, `${key}: aviso traduzido`);
}
assert.equal(showcase('produto-sem-demo').demo, null, 'produto sem demo continua abrindo o popup');
assert.ok(showcase('aviaoscopia').demo?.assemble, 'o avião é montado: o equipamento sobe por entre as duas metades, que se fecham em volta dele');
assert.ok(SHOWCASE.aviaoscopia.demo.tool.bounce === false && SHOWCASE.aviaoscopia.demo.tool.fade[0] >= .98 && read('hero-demo.css').includes('.hero-demo[data-plain-tool] .demo-tool::after { display: none; }'), 'régua inteira e nítida: o cabo não desbota nem recebe o reflexo colorido');
assert.ok(showcase('borboletoscopio').demo);
assert.equal(SHOWCASE.borboletoscopio.demo.layers.front, PRODUCTS.borboletoscopio.catalogImage, 'a frente da demonstração é a própria imagem da vitrine');
assert.deepEqual(SHOWCASE.borboletoscopio.demo.callouts.map(item => item.label), ['Borboletoscópio', 'Retinoscópio'], 'ficha técnica: só os dois rótulos pedidos');
assert.deepEqual(SHOWCASE.dinossauroscopio.demo.callouts.map(item => item.label), ['Dinossauroscópio', 'Retinoscópio']);
for (const key of Object.keys(SHOWCASE)) if (SHOWCASE[key].demo?.layers?.front && !SHOWCASE[key].demo.assemble) assert.equal(SHOWCASE[key].demo.layers.front, PRODUCTS[key].catalogImage, `${key}: a frente da demonstração é a própria imagem da vitrine`);
assert.equal(translate('Retinoscópio', 'en'), 'Retinoscope');

// ── regras do pedido, direto no código ──────────────────────────────────────────
const demo = read('hero-demo.js'), timeline = read('motion-timeline.js'), carousel = read('carousel.js'), css = read('hero-demo.css');
const html = read('index.html'), controller = read('controller.js');
assert.ok(!/borboletosc|dinossaurosc|aviaosc|retinosc/i.test(demo + timeline), 'a experiência vem dos dados: nada específico de produto no código');
// a folha da demonstração chega depois da primeira pintura (late-css.js; tests/pagespeed.mjs) e a abertura espera por ela
assert.ok(html.includes('<link rel="stylesheet" href="hero-demo.css" media="print" data-late-css><noscript><link rel="stylesheet" href="hero-demo.css"></noscript>'));
assert.ok(demo.includes("import {lateCss} from './late-css.js';") && demo.includes('const [loaded] = await Promise.all([ready, lateCss]);'), 'a demonstração só aparece com o estilo dela');
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
// o fundo: a raiz da camada escurece e recua (o desenho atrás da peça vai junto, por estar dentro dela); com movimento, o desenho
// ainda desliza com a câmera até ficar atrás da peça montada — num translate/scale próprio, sem disputar o transform da raiz
const calmBlock = demo.slice(demo.indexOf('if (g.reduced) {'), demo.indexOf('const depth = PERSPECTIVE'));
assert.ok(demo.includes('scenery: bgLayers[index]?.firstElementChild') && demo.includes("motif: bgLayers[index]?.querySelector('.scenery-back')"), 'a demonstração usa a raiz do fundo e o desenho dentro dela');
assert.ok(calmBlock.includes('fade(g.scenery, 80, 260, 1, .3)') && !calmBlock.includes('g.motif'), 'movimento reduzido: o fundo só esmaece, o desenho não desliza');
assert.ok(/\{el: g\.motif, delay: 40, duration: 560, easing: EASE\.camera, keyframes: \[\{translate: '0px 0px', scale: '1'\}, \{translate: `\$\{\(-g\.dx\)\.toFixed\(1\)\}px \$\{\(-g\.dy\)\.toFixed\(1\)\}px`, scale: Math\.min\(1\.2, 1 \/ g\.s\)/.test(demo), 'o desenho acompanha a câmera, sem crescer demais');
assert.ok(!new RegExp(Object.keys(PRODUCTS).join('|'), 'i').test(demo + timeline), 'nenhuma peça citada pelo nome na demonstração');
const ends = [...demo.matchAll(/delay: (\d+)[^}]*?duration: (\d+)/g)].map(m => Number(m[1]) + Number(m[2]));
assert.ok(ends.length > 8 && Math.max(...ends) <= 2700, `nenhuma trilha passa de 2,7 s (${Math.max(...ends)} ms)`);
const timing = demo.match(/const T = asm \? \{([^}]*)\} : config\.head \? \{([^}]*)\} : \{([^}]*)\};/), field = (text, name) => Number(text.match(new RegExp(name + ': (\\d+)'))[1]);
assert.ok(timing, 'tempos do encaixe e da montagem na mesma tabela');
assert.ok(field(timing[3], 'cta') + 340 <= 1700, 'encaixe: sequência completa em até 1,7 s');
assert.ok(field(timing[2], 'cta') + 340 <= 2200 && field(timing[2], 'head') > field(timing[2], 'tool'), 'equipamento em duas partes: até 2,2 s, e a cabeça só desce depois de a base começar a subir');
assert.ok(field(timing[1], 'cta') + 340 <= 2700 && field(timing[1], 'tool') > 520, 'montagem: até 2,7 s, e o equipamento só sobe depois de a peça se abrir');
assert.ok(/el: d\.header/.test(demo) && /\{opacity: \.6\}/.test(demo), 'o header fica mais discreto durante a demonstração');
assert.ok(/aria-label', 'Voltar à vitrine'/.test(demo) && /icon\('palette'\) \+ '<span>Personalizar o meu<\/span>'/.test(demo), 'a demonstração usa o mesmo botão do banner (paleta, sem seta)');
assert.ok(/entries\[i\]\.soon/.test(demo) && /'Ver em 3D'/.test(demo) && demo.includes('#produto/${key}/3d'), 'novidade sem compra (cores fixas): o convite leva a ver a peça em 3D');
for (const text of ['Em breve', 'Novidade · em breve', 'Lâmpada de fenda', 'Régua de esquiascopia', SHOWCASE.aviaoscopia.demo.message, SHOWCASE.macacoscopio.demo.message, SHOWCASE.macacoscopio.art.alt, PRODUCTS.macacoscopio.subtitle]) { assert.notEqual(translate(text, 'en'), text, text); assert.notEqual(translate(text, 'es'), text, text); }
assert.ok(demo.includes("fixed ? 'Comprar' : 'Personalizar o meu'") && demo.includes('fixed ? `#produto/${key}`'), 'a lâmpada (cores fixas, à venda): o convite é Comprar, que abre a peça na foto');
assert.notEqual(translate('Comprar', 'en'), 'Comprar');
for (const text of ['Voltar à vitrine', 'Personalizar o meu']) { assert.notEqual(translate(text, 'en'), text); assert.notEqual(translate(text, 'es'), text); }
// O unicórnio (07/10/2026: "fazer uma animação… girar o rostinho para a direita, para ensinar… o chifre pode atrapalhar"): depois do
// encaixe a cabeça gira (os quadros do 3D numa tira, por cima da foto, só na caixa que muda) e a dica aparece; na volta, a cabeça desvira.
{
  const turn = SHOWCASE.unicornioscopio.demo.turn, file = new URL(`../dist/assets/${turn.src}`, import.meta.url);
  assert.ok(turn.frames >= 12 && turn.angle > 45 && turn.box.length === 4 && turn.box.every(v => v >= 0 && v <= 1) && turn.box[0] + turn.box[2] <= 1.0001 && turn.box[1] + turn.box[3] <= 1.0001, 'o giro: quadros, ângulo e a caixa na foto');
  const bytes = fs.readFileSync(file);
  assert.ok(bytes.toString('latin1', 8, 12) === 'WEBP' && bytes.length < 900000, 'a tira dos quadros, leve');
  assert.ok(!SHOWCASE.girafoscopio.demo.turn && !SHOWCASE.macacoscopio.demo.turn, 'só o unicórnio gira a cabeça');
  for (const part of ['function setupTurn(turn)', 'function playTurn(to, duration, fade = false)', "dom.cover.classList.add('is-turning')", 'playTurn(1, calm ? 260 : 950, calm)', 'if (dom.giro.p > 0) playTurn(0, calm ? 200 : 420, calm)', "g.globalCompositeOperation = 'lighter'", 'resetTurn();']) assert.ok(demo.includes(part), part);
  assert.notEqual(translate(turn.hint, 'en'), turn.hint); assert.notEqual(translate(turn.hint, 'es'), turn.hint);
  // 08/10/2026 (movimento 3): a tira é decodificada fora da thread principal antes do giro (o primeiro drawImage de um <img> a
  // decodificava na hora: até 1 s de tela parada no celular); em meia resolução quando ela basta para a tela
  assert.ok(/createImageBitmap\(await response\.blob\(\)\)/.test(demo) && /t\.ready = true/.test(demo) && /drawImage\(t\.bitmap/.test(demo) && !/drawImage\(t\.sprite/.test(demo), 'tira decodificada com createImageBitmap antes de ficar pronta');
  assert.ok(/t\?\.decoded\.then\(/.test(demo), 'o giro espera a tira decodificada');
  const small = fs.readFileSync(new URL(`../dist/assets/${turn.small.src}`, import.meta.url));
  assert.ok(small.toString('latin1', 8, 12) === 'WEBP' && small.length < bytes.length && turn.small.width > 200 && turn.small.width < 300, 'a tira em meia resolução existe, mais leve');
  assert.ok(/turn\.small && turnPixels\(/.test(demo), 'a tira menor só quando basta para a tela');
}

// ── a saída (movimento 7): curta e própria com a peça montada; nada de filter nas trilhas (vai para a GPU) ──
{
  const exit = demo.slice(demo.indexOf('function exitTracks(g)'), demo.indexOf('function show(on)'));
  // (montada = depois de T.labels: fechada enquanto a ficha técnica e o convite ainda entram, a saída também é a curta, não a montagem
  // inteira de trás para frente a 4×; o que estava aparecendo some da opacidade em que estava)
  assert.ok(exit.length > 500 && /exiting = !calm && \(state === 'open' \|\| time >= assembled\);/.test(demo) && /assembled = T\.labels;/.test(demo) && /timeline\.load\(exitTracks\(g\)\)/.test(demo), 'Voltar com a peça montada usa a saída própria');
  assert.ok(/keyframes: \[\{opacity: \+getComputedStyle\(el\)\.opacity\}, \{opacity: 0\}\]/.test(exit), 'a ficha técnica e o convite somem da opacidade de agora');
  const ends = [...exit.matchAll(/delay: (\d+), duration: (\d+)/g)].map(m => Number(m[1]) + Number(m[2]));
  assert.ok(ends.length >= 8 && Math.max(...ends) <= 650, `a saída inteira em até 0,65 s (${Math.max(...ends)} ms)`);
  assert.ok(/\{el: d\.rig, delay: 40, duration: 540/.test(exit), 'a câmera começa a voltar logo (40 ms)');
  // o equipamento esmaece desde cedo (a curva que acelera fica só no deslocamento): com ela na trilha inteira, ele descia opaco por
  // cima do texto e do "Comprar" que voltavam
  assert.ok(/const down = el => \(\{el, delay: [^,]+, duration: 260, keyframes: \[\s*\{offset: 0, opacity: 1, transform: 'translate3d\(0, 0, 0\)', easing: EASE\.away\}, \{offset: \.2, opacity: 1\}/.test(exit) && !/easing: EASE\.away, keyframes/.test(exit), 'o equipamento esmaece em linha reta, sem esperar o fim da curva');
  assert.ok(/if \(exiting\) \{ run\('closing'\); return; \}/.test(demo), 'reaberta no meio da saída e fechada de novo: a saída segue');
  assert.ok(/-Math\.max\(CLOSE_RATE, timeline\.time \/ REWIND_MS\)/.test(demo) && /REWIND_MS = 600/.test(demo), 'uma entrada interrompida volta de trás para frente em até ~0,6 s');
  assert.ok(!/filter: '[^']*blur/.test(demo.slice(demo.indexOf('function tracks(g)'), demo.indexOf('function show(on)'))), 'nenhuma trilha anima filter: blur');
  assert.ok(/if \(top < 0\) scrollTo\(\{top: Math\.max\(0, scrollY \+ top\)/.test(demo) && /dom\.close\.focus\(\{preventScroll: true\}\)/.test(demo), 'aberta com a página rolada: a vitrine sobe antes de o foco ir para Voltar (usabilidade 3)');
}

console.log('hero-demo: ok');
