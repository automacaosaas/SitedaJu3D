// "O 3D nas suas consultas" (home, logo depois do banner), a página Escolha o seu e o filtro por encaixe da página Produtos.
// Os dados (FAMILIES, products.js) mandam: um capítulo por família com peças, a peça montada com as camadas da demonstração
// do banner, ficha com três fatos, "Ver encaixado" e, no fim, "Escolha o seu". Run: node tests/fit-tour.mjs — sem rede nem navegador.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = file => import(pathToFileURL(path.join(root, 'dist', file)).href);
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const {PRODUCTS, SOON, FAMILIES, showcase} = await site('products.js');
const {COMMERCE} = await site('commerce-config.js');
const {FIT, families, familyItems, fitFigure, fitTour, chooseBanners} = await site('fit-tour.js');
const {productGrid} = await site('product-grid.js');

// ── famílias: a ordem pedida, peças que existem e têm demonstração ──
assert.deepEqual(Object.keys(FAMILIES), ['retinoscopio', 'regua', 'lampada']);
assert.deepEqual(Object.values(FAMILIES).map(f => f.items), [['borboletoscopio', 'dinossauroscopio'], ['aviaoscopia'], ['macacoscopio']]);
assert.deepEqual(Object.values(FAMILIES).map(f => f.label), ['Encaixe para retinoscópio', 'Encaixe para régua de esquiascopia', 'Encaixe para lâmpada de fenda']);
for (const [id, family] of Object.entries(FAMILIES)) for (const key of family.items) {
  assert(PRODUCTS[key] || SOON[key], `${id}: ${key} existe na loja`);
  assert(showcase(key).demo, `${key}: tem a demonstração do banner (as camadas da figura encaixada)`);
  assert.equal(FIT[key]?.facts.length, 3, `${key}: três fatos curtos`);
}
// peça que ainda não chegou (girafa, unicórnio) fica fora até existir
assert.deepEqual(familyItems('retinoscopio'), ['borboletoscopio', 'dinossauroscopio']);
assert.deepEqual(families(), ['retinoscopio', 'regua', 'lampada']);

// ── a figura encaixada: as camadas da demonstração, no mesmo espaço ──
{
  const figure = fitFigure('borboletoscopio'), {tool, layers, message} = showcase('borboletoscopio').demo;
  assert.match(figure, new RegExp(`--tool-w:${tool.width};--tool-top:${tool.top};--tool-ratio:${tool.ratio}`));
  assert.match(figure, new RegExp(`<img class="fit-back" src="assets/${layers.back}"`));
  assert.match(figure, new RegExp(`<div class="fit-tool"><img src="assets/${tool.src}"`));
  assert.match(figure, new RegExp(`<img class="fit-cover" src="assets/${layers.front}" alt="${message}"`));
  assert.match(figure, /loading="lazy"/, 'as camadas só carregam perto da tela');
  const monkey = fitFigure('macacoscopio'), demo = showcase('macacoscopio').demo;
  assert.match(monkey, new RegExp(`<div class="fit-head"><img src="assets/${demo.head.src}"`), 'a lâmpada tem a cabeça por cima do macaco');
  assert.match(monkey, new RegExp(`--fade-a:${FIT.macacoscopio.fade[0]};--fade-b:${FIT.macacoscopio.fade[1]}`), 'a base da lâmpada some antes, só aqui');
  assert.doesNotMatch(monkey, /fit-back/, 'o macaco não tem parede de trás');
}

// ── a seção: capítulos, ficha, controles só onde há mais de uma peça, e "Escolha o seu" ──
{
  const html = fitTour();
  assert.match(html, /<h2 id="fit-tour-title">O 3D nas suas consultas<\/h2>/);
  const chapters = html.split('<article class="fit-chapter"').slice(1);
  assert.equal(chapters.length, 3);
  chapters.forEach((chapter, i) => {
    const id = families()[i], items = familyItems(id);
    assert.match(chapter, new RegExp(`^ data-family="${id}"`));
    assert.match(chapter, new RegExp(`<span class="fit-index" aria-hidden="true">0${i + 1}</span><span>${FAMILIES[id].label}</span>`));
    assert.equal((chapter.match(/<div class="fit-slide[ "]/g) || []).length, items.length);
    assert.equal((chapter.match(/<div class="fit-copy/g) || []).length, items.length);
    items.forEach((key, n) => {
      assert.match(chapter, new RegExp(`<a class="fit-link" href="#produto/${key}/encaixe">`), `${key}: "Ver encaixado" abre a demonstração no banner`);
      assert.match(chapter, new RegExp(`<div class="fit-copy${n ? '' : ' is-active'}" data-item="${key}"${n ? ' hidden' : ''}>`), 'sem script, a primeira peça de cada família aparece');
    });
    const many = items.length > 1;
    assert.equal(/fit-prev/.test(chapter) && /fit-next/.test(chapter) && /class="fit-dots"/.test(chapter), many, `${id}: setas e pontos só com mais de uma peça`);
    assert.equal(/aria-roledescription="carrossel"/.test(chapter), many);
  });
  assert.match(html, new RegExp(`<span>Produção em ${COMMERCE.productionLabel}</span>`), 'o prazo vem da loja');
  assert.match(html, /<span class="sr-only">Cores fixas: Marrom, Bege, Amarelo\.<\/span>/, 'as cores fixas da novidade, também para leitor de tela');
  assert.match(html, /Macacoscópio<span class="fit-soon">Em breve<\/span>/);
  assert.match(html, /<a class="fit-choose" href="escolha\.html"><span>Escolha o seu<\/span>/);
}

// ── a home: depois do banner, antes de "Nossa coleção", com o HTML pronto e o movimento ──
{
  const page = read('dist/index.html');
  const section = page.indexOf('<section class="fit-tour"'), hero = page.indexOf('<section class="showcase"'), catalog = page.indexOf('<section class="catalog catalog-home"');
  assert(hero < section && section < catalog, 'a seção fica logo depois do banner e antes de "Nossa coleção"');
  assert.match(page, /<section class="fit-tour" id="consultas" aria-labelledby="fit-tour-title" data-fit-tour><!-- fit-tour -->/);
  assert(page.includes(`<!-- fit-tour -->${fitTour()}<!-- /fit-tour -->`), 'index.html em dia: node tools/build-product-pages.cjs');
  assert.match(page, /<link rel="stylesheet" href="fit-tour\.css">/);
  assert.match(page, /<script type="module" src="fit-tour-motion\.js"><\/script>/);
}

// ── Escolha o seu: um banner por família, abrindo Produtos filtrada; listada no sitemap ──
{
  const page = read('dist/escolha.html');
  assert.match(page, /<title>Escolha o seu · Ju, imprime pra mim\?<\/title>/);
  assert.match(page, /<link rel="canonical" href="[^"]+\/escolha\.html">/);
  assert.match(page, /<link rel="stylesheet" href="fit-tour\.css">/);
  assert.match(page, /<h1>Escolha o seu<\/h1>/);
  assert(page.includes(`<div class="choose-banners">${chooseBanners()}</div>`));
  assert.deepEqual([...page.matchAll(/<a class="choose-banner" href="([^"]+)"/g)].map(m => m[1]), ['produtos.html?encaixe=retinoscopio', 'produtos.html?encaixe=regua', 'produtos.html?encaixe=lampada']);
  assert.match(page, /<span class="choose-art" data-count="2">/, 'o retinoscópio mostra as duas peças');
  assert.match(read('dist/sitemap.xml'), /\/escolha\.html<\/loc>/);
}

// ── Produtos ?encaixe=: só as peças da família, na ordem dela ──
{
  const ids = html => [...html.matchAll(/data-product-id="([a-z]+)"/g)].map(m => m[1]);
  assert.deepEqual(ids(productGrid('oftalmologia', 'retinoscopio')), ['borboletoscopio', 'dinossauroscopio']);
  assert.deepEqual(ids(productGrid('oftalmologia', 'regua')), ['aviaoscopia']);
  assert.deepEqual(ids(productGrid('oftalmologia', 'lampada')), ['macacoscopio']);
  assert.deepEqual(ids(productGrid('oftalmologia', 'nada')), ids(productGrid('oftalmologia')), 'família desconhecida mostra tudo');
  const catalog = read('dist/catalog.js');
  assert.match(catalog, /new URLSearchParams\(location\.search\)\.get\('encaixe'\)/);
  assert.match(catalog, /Object\.hasOwn\(FAMILIES, id\)/, 'só aceita famílias conhecidas');
  assert.match(catalog, /<a class="catalog-family-other" href="escolha\.html">/);
}

// ── movimento: acessível e leve ──
{
  const motion = read('dist/fit-tour-motion.js'), css = read('dist/fit-tour.css');
  assert.match(motion, /prefers-reduced-motion: reduce/);
  assert.match(motion, /auto = !calm && slides\.length > 1/, 'sem avanço automático com movimento reduzido');
  assert.match(motion, /event\.animationName === 'fit-progress'/, 'o avanço automático é o preenchimento do ponto ativo');
  assert.match(motion, /if \(byPerson && auto\) \{ auto = false;/, 'para de vez quando a pessoa troca a peça');
  for (const pause of ['pointerenter', 'focusin', 'visibilitychange']) assert(motion.includes(pause), `pausa: ${pause}`);
  assert.match(motion, /el\.inert = i !== index/, 'só a peça ativa recebe foco');
  assert.match(motion, /ArrowLeft/);
  assert.match(css, /\.fit-stage \{[^}]*touch-action: pan-y/, 'deslizar para o lado sem travar a rolagem');
  assert.match(css, /\.fit-tour\[data-motion\] \.fit-chapter:not\(\.is-near\) :is\(\.fit-float, \.fit-ground\) \{ animation-play-state: paused; \}/, 'flutua só perto da tela');
  assert.match(css, /@supports \(animation-timeline: view\(\)\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n  :is\(\.fit-float, \.fit-ground, \.fit-figure\) \{ animation: none !important; \}/);
  assert.match(css, /@media \(hover: none\), \(max-width: 900px\) \{ \.fit-arrow \{ display: none; \} \}/, 'setas só no desktop');
}

console.log('PASS: famílias de encaixe, figura encaixada, seção da home (posição, ficha, controles), Escolha o seu, filtro da página Produtos e movimento acessível.');
