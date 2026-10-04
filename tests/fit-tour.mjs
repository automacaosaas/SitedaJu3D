// "O 3D nas suas consultas" (home, logo depois do banner), a página Escolha o seu e o filtro por encaixe da página Produtos.
// Os dados (FAMILIES, products.js) mandam: uma ficha técnica por peça, família por família, com a peça encaixada fixa ao
// lado (as camadas da demonstração do banner), o carrossel das peças da categoria e, no fim, "Escolha o seu".
// Run: node tests/fit-tour.mjs — sem rede nem navegador.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = file => import(pathToFileURL(path.join(root, 'dist', file)).href);
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const {PRODUCTS, SOON, FAMILIES, showcase} = await site('products.js');
const {COMMERCE, money} = await site('commerce-config.js');
const {FIT, families, familyItems, tourItems, fitFigure, fitTour, chooseBanners} = await site('fit-tour.js');
const {productGrid} = await site('product-grid.js');
const piece = key => PRODUCTS[key] || SOON[key];

// ── famílias: a ordem pedida, peças que existem e têm demonstração ──
assert.deepEqual(Object.keys(FAMILIES), ['retinoscopio', 'regua', 'lampada']);
assert.deepEqual(Object.values(FAMILIES).map(f => f.items), [['borboletoscopio', 'dinossauroscopio'], ['aviaoscopia'], ['macacoscopio']]);
assert.deepEqual(Object.values(FAMILIES).map(f => f.label), ['Encaixe para retinoscópio', 'Encaixe para régua de esquiascopia', 'Encaixe para lâmpada de fenda']);
for (const [id, family] of Object.entries(FAMILIES)) for (const key of family.items) {
  assert(piece(key), `${id}: ${key} existe na loja`);
  assert(showcase(key).demo, `${key}: tem a demonstração do banner (as camadas da figura encaixada)`);
  assert(FIT[key]?.frame, `${key}: enquadramento da peça na figura`);
}
// peça que ainda não chegou (girafa, unicórnio) fica fora até existir
assert.deepEqual(familyItems('retinoscopio'), ['borboletoscopio', 'dinossauroscopio']);
assert.deepEqual(families(), ['retinoscopio', 'regua', 'lampada']);
assert.deepEqual(tourItems().map(({key, number}) => `${number} ${key}`), ['01 borboletoscopio', '01 dinossauroscopio', '02 aviaoscopia', '03 macacoscopio']);

// ── a figura encaixada: as camadas da demonstração, no mesmo espaço ──
{
  const figure = fitFigure('borboletoscopio'), {tool, layers, message} = showcase('borboletoscopio').demo;
  assert.match(figure, new RegExp(`--tool-w:${tool.width};--tool-top:${tool.top};--tool-ratio:${tool.ratio}`));
  assert.match(figure, new RegExp(`<img class="fit-back" src="assets/${layers.back}"`));
  assert.match(figure, new RegExp(`<div class="fit-tool"><img src="assets/${tool.src}"`));
  assert.match(figure, new RegExp(`<img class="fit-cover" src="assets/${layers.front}" alt="${message}"`));
  assert.match(figure, /loading="lazy"/, 'as camadas só carregam perto da tela');
  assert.match(fitFigure('borboletoscopio', {alt: false}), /<img class="fit-cover" src="[^"]+" alt=""/, 'figura decorativa ao lado do texto');
  const monkey = fitFigure('macacoscopio'), demo = showcase('macacoscopio').demo;
  assert.match(monkey, new RegExp(`<div class="fit-head"><img src="assets/${demo.head.src}"`), 'a lâmpada tem a cabeça por cima do macaco');
  assert.match(monkey, new RegExp(`--fade-a:${FIT.macacoscopio.fade[0]};--fade-b:${FIT.macacoscopio.fade[1]}`), 'a base da lâmpada some antes, só aqui');
  assert.doesNotMatch(monkey, /fit-back/, 'o macaco não tem parede de trás');
}

// ── a história: uma ficha por peça, a peça fixa ao lado, pontos de navegação ──
{
  const html = fitTour(), items = tourItems();
  assert.match(html, /<h2 id="fit-tour-title">O 3D nas suas consultas<\/h2>/);
  const steps = html.split('<article class="fit-step"').slice(1).map(s => s.slice(0, s.indexOf('</article>')));
  assert.equal(steps.length, items.length);
  steps.forEach((step, i) => {
    const {key, family, number} = items[i], product = piece(key);
    assert.match(step, new RegExp(`^ id="consultas-${key}" data-item="${key}" data-index="${i}" style="--fit-accent:${showcase(key).theme.accentColor};`));
    assert.match(step, /--fit-bg-1:#[0-9a-f]{6};--fit-bg-2:#[0-9a-f]{6};--fit-bg-3:#[0-9a-f]{6}"/, 'as três cores da faixa vêm do degradê da peça');
    assert.match(step, new RegExp(`<span class="fit-index">${number}</span><span>${FAMILIES[family].label}</span>`));
    assert.match(step, new RegExp(`<p class="fit-overview fit-reveal">${(FIT[key]?.overview || product.description).replace(/[.?()]/g, '\\$&')}</p>`), 'a visão geral é o texto da loja');
    assert.match(step, /<p class="fit-label fit-reveal">FICHA TÉCNICA<\/p><dl class="fit-specs">/);
    assert.match(step, new RegExp(`<dt>Encaixe</dt><dd><span>${FAMILIES[family].tool}</span></dd>`));
    if (product.soon) {
      assert.match(step, /<dt>Cores fixas<\/dt><dd><span class="fit-swatches" aria-hidden="true">(<i style="--swatch:#[0-9a-f]{6}"><\/i>){3}<\/span><span>Marrom<\/span><span>Bege<\/span><span>Amarelo<\/span><\/dd>/);
      assert.match(step, /<dt>Disponibilidade<\/dt><dd><span>Em breve<\/span><\/dd>/);
      assert.match(step, new RegExp(`<a class="fit-cta" href="#produto/${key}/3d">`), 'a novidade abre a prévia em 3D');
      assert.match(step, /<span class="fit-soon">Em breve<\/span>/);
    } else {
      assert.match(step, new RegExp(`<dt>Cores à sua escolha</dt><dd>${product.parts.map(p => `<span>${p.name}</span>`).join('')}</dd>`), 'as partes que a pessoa colore');
      assert.match(step, new RegExp(`<dt>Produção</dt><dd><span>${COMMERCE.productionLabel}</span></dd>`), 'o prazo vem da loja');
      assert.match(step, new RegExp(`<a class="fit-cta" href="#produto/${key}/personalizar">`));
    }
    assert.match(step, new RegExp(`<a class="fit-link" href="#produto/${key}/encaixe">`), '"Ver encaixado" abre a demonstração no banner');
    assert.equal((step.match(/class="[^"]*fit-reveal/g) || []).length, 9, 'família, nome, visão geral, rótulo, quatro linhas da ficha e ações aparecem com a rolagem');
  });
  const stage = /<div class="fit-stage" aria-hidden="true">[^]*?<\/div><\/div><\/div><nav/.exec(html)?.[0] || '';
  assert.deepEqual([...stage.matchAll(/<div class="fit-slide" data-item="([a-z]+)" data-pos="([a-z]+)">/g)].map(m => `${m[1]}:${m[2]}`), items.map(({key}, i) => `${key}:${i ? 'after' : 'active'}`), 'sem script, a primeira peça aparece');
  assert.deepEqual([...html.matchAll(/<a href="#consultas-([a-z]+)" aria-label="([^"]+)"/g)].map(m => m[1]), items.map(i => i.key), 'um ponto por peça');
}

// ── o carrossel da categoria e "Escolha o seu" ──
{
  const html = fitTour(), track = /<ul class="fit-track" aria-label="Peças de oftalmologia">([^]*?)<\/ul>/.exec(html)?.[1] || '';
  assert.match(html, /<h3 id="fit-more-title">Peças de oftalmologia<\/h3><p>ENCONTRE A PEÇA DO SEU EQUIPAMENTO<\/p>/);
  const cards = track.split('<li class="fit-card"').slice(1);
  assert.equal(cards.length, tourItems().length);
  cards.forEach((card, i) => {
    const {key} = tourItems()[i], product = piece(key);
    assert.match(card, new RegExp(`<span class="fit-card-name">${product.title}</span><span class="fit-card-sub">${product.subtitle}</span>`));
    if (product.soon) assert.match(card, new RegExp(`href="#produto/${key}/3d"[^]*<span class="fit-card-soon">Em breve</span>`));
    else assert.match(card, new RegExp(`href="#produto/${key}/personalizar"[^]*<span class="fit-card-price">${money(COMMERCE.prices[key]).replace('$', '\\$')}</span>`), 'o preço da loja');
  });
  assert.match(html, /<button type="button" class="fit-arrow fit-prev" aria-label="Produto anterior">/);
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

// ── movimento: CSS moderno primeiro, acessível e leve ──
{
  const motion = read('dist/fit-tour-motion.js'), css = read('dist/fit-tour.css');
  // reveal pela rolagem no próprio CSS; o script só substitui onde não há suporte
  assert.match(css, /@supports \(animation-timeline: view\(\)\) \{\n  \.fit-reveal, \.fit-carousel, \.fit-step-art \{ animation: fit-rise linear both; animation-timeline: view\(\); animation-range: entry 0% cover 16%; will-change: opacity, transform; \}/);
  assert.match(css, /\.fit-card \{ animation: fit-card-in linear both; animation-timeline: view\(x\);/, 'cartões entram conforme deslizam');
  assert.match(css, /\.fit-progress i \{ animation: fit-thumb linear both; animation-timeline: --fit-track; \}/, 'barra do carrossel pela linha do tempo da rolagem');
  assert.match(motion, /if \(supports\('animation-timeline: view\(\)'\) \|\| calm \|\| !\('IntersectionObserver' in window\)\) return;/);
  // a peça fixa e a faixa com as cores da peça ativa
  assert.match(css, /\.fit-stage-pin \{ position: sticky;/);
  for (const n of [1, 2, 3]) assert.match(css, new RegExp(`@property --fit-bg-${n} \\{ syntax: '<color>'`), 'a faixa troca de cor suavemente');
  assert.match(motion, /if \(step\.getBoundingClientRect\(\)\.top <= middle\) index = i;/, 'a ativa é a última ficha que passou do meio da tela');
  assert.match(motion, /slide\.dataset\.pos = i < index \? 'before' : i > index \? 'after' : 'active'/);
  // carrossel: dedo nativo, mouse com impulso, setas, teclado; clique depois de arrastar não abre o cartão
  assert.match(css, /\.fit-track \{[^}]*scroll-snap-type: x mandatory;/);
  assert.match(motion, /event\.pointerType !== 'mouse'/);
  assert.match(motion, /track\.addEventListener\('click', swallow, \{capture: true, once: true\}\)/);
  assert.match(motion, /event\.key !== 'ArrowLeft' && event\.key !== 'ArrowRight'/);
  // movimento reduzido
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n  :is\(\.fit-float, \.fit-ground, \.fit-reveal, \.fit-carousel, \.fit-step-art, \.fit-card, \.fit-progress i\) \{ animation: none !important; \}/);
  assert.match(motion, /const behavior = calm \? 'auto' : 'smooth';/);
  assert.match(css, /\.fit-tour\[data-motion\] :is\(\.fit-figure:not\(\.is-near\), \.fit-slide:not\(\[data-pos="active"\]\) \.fit-figure\) :is\(\.fit-float, \.fit-ground\) \{ animation-play-state: paused; \}/, 'flutua só a peça ativa, perto da tela');
}

console.log('PASS: famílias de encaixe, figura encaixada, história com ficha técnica e peça fixa, carrossel da categoria, posição na home, Escolha o seu, filtro da página Produtos e movimento acessível.');
