// A página Escolha o seu, o filtro por encaixe da página Produtos e os cards de "Nossa coleção" na cor da peça.
// (A seção "O 3D nas suas consultas", com as fichas técnicas, foi retirada da home a pedido do dono em 2026-10-05.)
// Run: node tests/escolha.mjs — sem rede nem navegador.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = file => import(pathToFileURL(path.join(root, 'dist', file)).href);
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const {PRODUCTS, SOON, FAMILIES, showcase} = await site('products.js');
const {FIT, families, familyItems, fitFigure, chooseBanners} = await site('escolha.js');
const {productGrid} = await site('product-grid.js');
const piece = key => PRODUCTS[key] || SOON[key];

// ── famílias: a ordem pedida, peças que existem e têm demonstração ──
assert.deepEqual(Object.keys(FAMILIES), ['retinoscopio', 'regua', 'lampada']);
assert.deepEqual(Object.values(FAMILIES).map(f => f.items), [['borboletoscopio', 'dinossauroscopio'], ['aviaoscopia'], ['macacoscopio']]);
for (const [id, family] of Object.entries(FAMILIES)) for (const key of family.items) {
  assert(piece(key), `${id}: ${key} existe na loja`);
  assert(showcase(key).demo, `${key}: tem a demonstração do banner (as camadas da figura encaixada)`);
  assert(FIT[key]?.frame, `${key}: enquadramento da peça na figura`);
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
  const monkey = fitFigure('macacoscopio'), demo = showcase('macacoscopio').demo;
  assert.match(monkey, new RegExp(`<div class="fit-head"><img src="assets/${demo.head.src}"`), 'a lâmpada tem a cabeça por cima do macaco');
  assert.match(monkey, new RegExp(`--fade-a:${FIT.macacoscopio.fade[0]};--fade-b:${FIT.macacoscopio.fade[1]}`), 'a base da lâmpada some antes, só aqui');
}

// ── a home não tem mais a seção das fichas técnicas (nem o GSAP/Lenis que só ela usava) ──
{
  const page = read('dist/index.html');
  assert.doesNotMatch(page, /fit-tour|data-fit-tour|O 3D nas suas consultas/, 'a seção saiu da home');
  for (const file of ['dist/fit-tour.js', 'dist/fit-tour.css', 'dist/fit-tour-motion.js', 'dist/vendor/gsap.min.js', 'dist/vendor/lenis.min.js'])
    assert(!fs.existsSync(path.join(root, file)), `${file} removido`);
}

// ── Escolha o seu: um banner por família, abrindo Produtos filtrada; listada no sitemap ──
{
  const page = read('dist/escolha.html');
  assert.match(page, /<title>Escolha o seu · Ju, imprime pra mim\?<\/title>/);
  assert.match(page, /<link rel="canonical" href="[^"]+\/escolha\.html">/);
  assert.match(page, /<link rel="stylesheet" href="escolha\.css">/);
  assert.match(page, /<h1>Escolha o seu<\/h1>/);
  assert(page.includes(`<div class="choose-banners">${chooseBanners()}</div>`), 'escolha.html em dia: node tools/build-product-pages.cjs');
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

// ── Nossa coleção: só o card do centro na cor exclusiva da sua peça; os laterais no tom da página; a peça sai do card ──
{
  const catalog = read('dist/catalog.js'), css = read('dist/carousel.css');
  assert.match(catalog, /return `--rail-own-1:\$\{one\};--rail-own-2:\$\{two\};--rail-own-3:\$\{three\};--rail-own-accent:\$\{theme\.accentColor\};--rail-own-ink:\$\{theme\.textColor\}`;/);
  assert.equal((catalog.match(/tabindex="-1" style="\$\{railTone\(id\)\}">/g) || []).length, 2, 'peças e novidades');
  for (const name of ['--rail-1', '--rail-2', '--rail-3', '--rail-a', '--rail-i']) assert.match(css, new RegExp(`@property ${name} \\{ syntax: '<color>'`), 'cores registradas: deslizam suavemente na troca');
  assert.match(css, /\.home \.product-rail-card\[style\*="--rail-own-1"\] \{\n  --rail-1: color-mix\(in srgb, var\(--theme-wash, #f4e4e7\) 22%, #fff\);[^}]*--rail-a: var\(--rose, #b64c68\); --rail-i: var\(--ink, #282326\);/, 'laterais no tom da página');
  assert.match(css, /\.home \.product-rail-card\[style\*="--rail-own-1"\]\.is-active \{ --rail-1: var\(--rail-own-1\); --rail-2: var\(--rail-own-2\); --rail-3: var\(--rail-own-3\); --rail-a: var\(--rail-own-accent\); --rail-i: var\(--rail-own-ink\);/, 'o do centro na cor da peça');
  assert.match(css, /\.home \.product-rail-card\[style\*="--rail-own-1"\] \{ overflow: visible; \}/, 'a peça pode sair por cima do card');
}

console.log('PASS: famílias de encaixe, figura encaixada, home sem a seção das fichas, Escolha o seu, filtro da página Produtos e cards da coleção.');
