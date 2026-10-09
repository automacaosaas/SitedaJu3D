// A página Escolha o seu, o filtro por encaixe da página Produtos e os cards de "Nossa coleção" na cor da peça.
// (A seção "O 3D nas suas consultas", com as fichas técnicas, foi retirada da home a pedido do dono em 2026-10-04.)
// Run: node tests/escolha.mjs — sem rede nem navegador.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import lightCssModule from './lib/light-css.cjs';
const {lightCss} = lightCssModule;

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = file => import(pathToFileURL(path.join(root, 'dist', file)).href);
// o CSS como o tema claro o lê (os tokens do escuro caem na reserva; tests/lib/light-css.cjs)
const read = file => { const text = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n'); return file.endsWith('.css') ? lightCss(text) : text; };
const {PRODUCTS, SOON, FAMILIES, showcase} = await site('products.js');
const {FIT, families, familyItems, fitFigure, chooseBanners} = await site('escolha.js');
const {productGrid} = await site('product-grid.js');
const piece = key => PRODUCTS[key] || SOON[key];

// ── famílias: a ordem pedida, peças que existem e têm demonstração ──
assert.deepEqual(Object.keys(FAMILIES), ['retinoscopio', 'regua', 'lampada']);
assert.deepEqual(Object.values(FAMILIES).map(f => f.items), [['borboletoscopio', 'dinossauroscopio'], ['aviaoscopia'], ['macacoscopio', 'girafoscopio', 'unicornioscopio']]);
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
  assert.match(page, /<link rel="canonical" href="[^"]+\/escolha">/);
  assert.match(page, /<link rel="stylesheet" href="escolha\.css">/);
  assert.match(page, /<h1>Escolha o seu<\/h1>/);
  assert(page.includes(`<div class="choose-banners">${chooseBanners()}</div>`), 'escolha.html em dia: node tools/build-product-pages.cjs');
  assert.deepEqual([...page.matchAll(/<a class="choose-banner" href="([^"]+)"/g)].map(m => m[1]), ['produtos?encaixe=retinoscopio', 'produtos?encaixe=regua', 'produtos?encaixe=lampada']);
  assert.match(page, /<span class="choose-art" data-count="2">/, 'o retinoscópio mostra as duas peças');
  assert.match(read('dist/sitemap.xml'), /\/escolha<\/loc>/);
}

// ── Produtos ?encaixe=: só as peças da família, na ordem dela ──
{
  const ids = html => [...html.matchAll(/data-product-id="([a-z]+)"/g)].map(m => m[1]);
  assert.deepEqual(ids(productGrid('oftalmologia', 'retinoscopio')), ['borboletoscopio', 'dinossauroscopio']);
  assert.deepEqual(ids(productGrid('oftalmologia', 'regua')), ['aviaoscopia']);
  assert.deepEqual(ids(productGrid('oftalmologia', 'lampada')), ['macacoscopio', 'girafoscopio', 'unicornioscopio']);
  assert.deepEqual(ids(productGrid('oftalmologia', 'nada')), ids(productGrid('oftalmologia')), 'família desconhecida mostra tudo');
  const catalog = read('dist/catalog.js');
  assert.match(catalog, /new URLSearchParams\(location\.search\)\.get\('encaixe'\)/);
  assert.match(catalog, /Object\.hasOwn\(FAMILIES, id\)/, 'só aceita famílias conhecidas');
  assert.match(catalog, /<a class="catalog-family-other" href="escolha">/);
}

// ── Nossa coleção: só o card do centro na cor exclusiva da sua peça; os laterais no tom da página; a peça sai do card ──
{
  const catalog = read('dist/catalog.js'), css = read('dist/carousel.css');
  assert.match(catalog, /return `--rail-own-1:\$\{one\};--rail-own-2:\$\{two\};--rail-own-3:\$\{three\};--rail-own-accent:\$\{theme\.accentColor\};--rail-own-ink:\$\{theme\.textColor\}`;/);
  assert.equal((catalog.match(/tabindex="-1" style="\$\{railTone\(id\)\}">/g) || []).length, 2, 'peças e novidades');
  // 08/10/2026 (revisão de movimento 4 e 5): sem cores próprias com transição nos cards (era uma transição alimentando outra a cada
  // quadro); o degradê da peça do centro é uma camada que só acende (opacidade); todos os cards têm a mesma caixa e só a escala muda
  assert.doesNotMatch(css, /@property --rail-|--rail-[123ai]\b/, 'sem --rail-* registradas nem transição de cor nos cards');
  assert.match(css, /\.home \.product-rail-card\[style\*="--rail-own-1"\]::before \{[^}]*radial-gradient\(130% 78% at 50% 20%, var\(--rail-own-1\) 0%, var\(--rail-own-2\) 52%, var\(--rail-own-3\) 100%\); opacity: 0; transition: opacity \.45s ease;/, 'o do centro na cor da peça, numa camada');
  assert.match(css, /\.home \.product-rail-card\[style\*="--rail-own-1"\]\.is-active::before \{ opacity: 1; \}/);
  // segunda volta (08/10/2026, a dona: "as imagens parecem estar dentro de um quadrado... quero em fundo transparente; os que não são
  // centrais mais simples, diferentes do central"): os vizinhos não têm caixa (fundo, contorno e sombra transparentes); a caixa do card
  // (degradê, contorno claro e sombra) é a camada ::before, que só acende no do centro; a troca anda só por transform e opacidade
  assert.match(css, /\.home \.product-rail-card\[style\*="--rail-own-1"\] \{\n  width: var\(--card-w\); min-height: var\(--card-h\);[^}]*transform: translate\(calc\(-50% \+ var\(--slot\) \* var\(--slot-w\) \+ var\(--drag\)\), var\(--side-y\)\) scale\(var\(--side-s\)\);\n  border-color: transparent; color: var\(--ink, #282326\); background: transparent; box-shadow: none;[^}]*transition: transform 560ms [^;]*, opacity 360ms ease;\n\}/, 'a mesma caixa em todos os cards, sem caixa nos vizinhos; troca só por transform e opacidade');
  assert.doesNotMatch(css, /clip-path/, 'sem o recorte (clip-path) que recolhia os vizinhos');
  assert.match(css, /\.home \.product-rail-card\[style\*="--rail-own-1"\]::before \{[^}]*box-shadow: inset 0 0 0 1px rgba\(255, 255, 255, \.8\), 0 30px 50px -32px/, 'contorno e sombra do card do centro na camada que acende');
  assert.match(css, /\.home \.product-rail-card\[style\*="--rail-own-1"\]\.is-active \{ transform: translate\(calc\(-50% \+ var\(--drag\)\), 0\) scale\(1\);/);
  // a peça fica dentro do card (2026-10-05): a foto tem a altura da caixa (--art-h); só a sombra dela não é mais cortada (era a marca reta)
  assert.match(css, /\.home \.product-rail-card\[style\*="--rail-own-1"\] \.product-rail-art, \.home \.product-rail-card\[style\*="--rail-own-1"\]\.is-active \.product-rail-art \{ height: var\(--art-h\); background: transparent; overflow: visible;/);
  assert.match(css, /\.is-active \.product-rail-art img \{ filter: drop-shadow\(/, 'a sombra da peça só no card do centro');
  // os vizinhos: a peça recortada flutua (invólucro .product-rail-float) num halo nas cores da peça do centro (--theme-* = --cat-*), com
  // o chão embaixo e o nome centralizado; halo, chão e nome fora do link da foto (num <a>, o Chrome perde as --cat-* enquanto deslizam)
  const cat = read('dist/catalog.css');
  assert.match(catalog, /const railArt = \(href, label, title, img\) => `<a class="product-rail-art" href="\$\{href\}" aria-label="\$\{label\}"><span class="product-rail-float">\$\{img\}<\/span><\/a><span class="product-rail-name" aria-hidden="true">\$\{title\}<\/span>`;/);
  assert.equal((catalog.match(/\$\{railArt\(/g) || []).length, 2, 'peças e novidades');
  // revisão: um brilho leve, não um disco branco atrás da peça (a dona pediu fundo transparente)
  assert.match(cat, /\.home \.product-rail-card::after \{[^}]*background: radial-gradient\(closest-side, rgba\(255, 255, 255, \.8\) 0%, rgba\(255, 255, 255, \.46\) 38%, color-mix\(in srgb, var\(--theme-accent, #b64c68\) 8%, transparent\) 66%, transparent 100%\);/, 'o halo na cor da peça do centro');
  assert.match(cat, /\.home \.product-rail-card:not\(\.is-active\)::after, \.home \.product-rail-card:not\(\.is-active\) \.product-rail-copy::before \{ opacity: 1; \}/);
  assert.doesNotMatch(cat, /\.product-rail-art::(before|after) \{/, 'nada que leia as cores da seção dentro do link');
  assert.match(cat, /\.home \.product-rail-card:not\(\.is-active\) :is\(\.product-rail-category, \.product-rail-copy h3, \.product-rail-subtitle,/, 'nos vizinhos, só a peça e o nome');
  // movimento: só os dois vizinhos flutuam (e só sem "reduzir movimento"), parado com a coleção fora da tela; tudo em transform/opacidade
  const still = cat.slice(cat.indexOf('@media (prefers-reduced-motion: no-preference) {\n  .home .product-rail-card.is-side'));
  assert.match(still, /^@media \(prefers-reduced-motion: no-preference\) \{\n  \.home \.product-rail-card\.is-side \.product-rail-float \{ animation: rail-float 6\.4s ease-in-out infinite; \}/);
  assert.match(still, /\.home \.product-carousel\.is-away \.product-rail-float, [^{]*\{ animation-play-state: paused; \}/);
  for (const name of ['rail-float', 'rail-floor', 'rail-halo', 'rail-mist']) {
    const frames = new RegExp(`@keyframes ${name} \\{ 50% \\{ ([^}]*) \\} \\}`).exec(cat);
    assert(frames && frames[1].split(';').filter(Boolean).every(rule => /^\s*(transform|opacity):/.test(rule)), `${name}: só transform e opacidade`);
  }
  assert.match(catalog, /this\.away = new IntersectionObserver\(\(\[entry\]\) => host\.classList\.toggle\('is-away', !entry\.isIntersecting\)/);
}

console.log('PASS: famílias de encaixe, figura encaixada, home sem a seção das fichas, Escolha o seu, filtro da página Produtos e cards da coleção.');
