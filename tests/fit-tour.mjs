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
const {PRODUCTS, SOON, FAMILIES, showcase, originalColors} = await site('products.js');
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
    const overview = (FIT[key]?.overview || product.description).replace(/[.?()]/g, '\\$&');
    assert.match(step, new RegExp(`<p class="fit-overview fit-reveal" data-text="${overview}">${overview}</p>`), 'a visão geral é o texto da loja (data-text: a fonte para dividir em palavras no idioma escolhido)');
    assert.match(step, new RegExp(`<h3 class="fit-reveal" id="fit-name-${key}"><span class="fit-name" translate="no">${product.title}</span>`), 'o nome fica separado para subir letra a letra');
    // ficha enxuta: sem tabela; as cores em esferas sem texto; encaixe, cores e produção nos pontos sobre a peça
    assert.doesNotMatch(step, /fit-specs|fit-label|FICHA TÉCNICA|Disponibilidade|Feito em/, 'sem a tabela da ficha técnica');
    const colors = product.soon ? product.colors : originalColors(key);
    assert.match(step, new RegExp(`<p class="fit-colors fit-reveal"><span class="sr-only">${product.soon ? 'Cores fixas' : 'Cores originais'}</span>${colors.map(c => `<i style="--swatch:${c.hex}" role="img" aria-label="${c.name}" title="${c.name}"></i>`).join('')}</p>`), 'as cores da peça em esferas');
    const art = /<div class="fit-step-art">([^]*?)<\/div><div class="fit-step-copy">/.exec(step)?.[1] || '';
    const spots = [...art.matchAll(/<button type="button" class="fit-spot" style="--x:([\d.]+);--y:([\d.]+)" data-side="(left|right)" aria-expanded="false"><i class="fit-spot-dot" aria-hidden="true"><\/i><span class="fit-tip">([^<]+)<\/span><\/button>/g)].map(m => m[4]);
    assert.equal(spots[0], FAMILIES[family].label, 'o primeiro ponto mostra onde a peça encaixa');
    if (product.soon) {
      assert.deepEqual(spots, [FAMILIES[family].label, 'Impresso em 3D'], 'o macaco: encaixe no topo e impressão 3D na base');
      assert.doesNotMatch(art, /universal/i, 'sem prometer compatibilidade que ainda não foi definida');
      assert.match(step, new RegExp(`<a class="fit-cta" href="#produto/${key}/3d">`), 'a novidade abre a prévia em 3D');
      assert.match(step, /<span class="fit-soon">Em breve<\/span>/);
    } else {
      assert.deepEqual(spots, [FAMILIES[family].label, 'Cores à sua escolha', `Produção em ${COMMERCE.productionLabel}`], 'encaixe, cores e o prazo da loja');
      assert.match(step, new RegExp(`<a class="fit-cta" href="#produto/${key}/personalizar"><svg[^>]*><g class="draw-pencil">`), 'com o lápis, como o botão do banner');
    }
    assert.doesNotMatch(step, /fit-link|Ver encaixado/, 'a peça já aparece encaixada ao lado: a ficha termina só com a ação principal');
    assert.equal((step.match(/class="[^"]*fit-reveal/g) || []).length, 5, 'família, nome, visão geral, cores e ação aparecem com a rolagem');
  });
  const stage = /<div class="fit-stage">[^]*?<\/div><\/div><\/div><nav/.exec(html)?.[0] || '';
  assert.equal((stage.match(/class="fit-spot"/g) || []).length, items.reduce((n, {key}) => n + FIT[key].spots.length, 0), 'os pontos também sobre a peça fixa do desktop');
  assert.doesNotMatch(stage.slice(0, 40), /aria-hidden/, 'a peça fixa não fica escondida de leitores de tela: os pontos são botões');
  assert.deepEqual([...stage.matchAll(/<div class="fit-slide" data-item="([a-z]+)" data-pos="([a-z]+)" style="--fit-accent:/g)].map(m => `${m[1]}:${m[2]}`), items.map(({key}, i) => `${key}:${i ? 'after' : 'active'}`), 'sem script, a primeira peça aparece');
  assert.deepEqual([...html.matchAll(/<a href="#consultas-([a-z]+)" aria-label="([^"]+)"/g)].map(m => m[1]), items.map(i => i.key), 'um ponto por peça');
  const backdrop = /<div class="fit-backdrop" aria-hidden="true">([^]*?)<\/div>/.exec(html)?.[1] || '';
  assert.equal((backdrop.match(/<i style="--fit-accent:/g) || []).length, items.length, 'uma camada de fundo da página por peça, nas cores dela');
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
    assert.match(card, new RegExp(`<a class="fit-card-link" href="#consultas-${key}" data-item="${key}"`), 'o cartão leva à ficha técnica da peça, lá em cima');
    if (product.soon) assert.match(card, /<span class="fit-card-soon">Em breve<\/span>/);
    else assert.match(card, new RegExp(`<span class="fit-card-price">${money(COMMERCE.prices[key]).replace('$', '\\$')}</span>`), 'o preço da loja');
  });
  assert.match(html, /<div class="fit-nav"><button type="button" class="fit-arrow fit-prev" aria-label="Produto anterior">/);
  assert.deepEqual([...html.matchAll(/<button type="button" data-index="(\d)" aria-label="([^"]+)"/g)].map(m => m[2]), tourItems().map(({key}) => piece(key).title), 'uma bolinha por peça');
  assert.doesNotMatch(html, /fit-progress/);
  assert.match(html, /<a class="fit-choose" href="escolha\.html"><span>Escolha o seu<\/span>/);
  // celular: o cartão da vez no centro, bolinhas e setas compactas; desktop: setas de vidro nas bordas
  const css = read('dist/fit-tour.css');
  assert.match(css, /\.fit-track \{ margin: 0 -22px; padding-inline: calc\(\(100vw - min\(72vw, 300px\)\) \/ 2\); scroll-padding-inline: 0; \}\n  \.fit-card \{ flex-basis: min\(72vw, 300px\); scroll-snap-align: center; \}/);
  assert.match(css, /\.fit-pager \{ display: none;/, 'bolinhas só nas telas menores');
  assert.match(css, /\.fit-arrow \{ position: absolute;[^}]*background: rgba\(255, 255, 255, \.5\);[^}]*backdrop-filter: blur\(10px\) saturate\(1\.2\);/);
  assert.match(css, /\.fit-next:hover svg \{ translate: 3px 0; \}/);
  assert.match(read('dist/fit-tour-motion.js'), /dots\.forEach\(\(dot, i\) => \{ if \(i === active\) dot\.setAttribute\('aria-current', 'true'\);/, 'a bolinha acompanha o cartão do centro');
  // a peça das fichas cabe na coluna e fica centralizada no celular
  assert.match(css, /  \.fit-step-art \.fit-figure \{ width: min\(100%, 420px\); height: auto; \}/);
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
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n  :is\(\.fit-float, \.fit-ground, \.fit-reveal, \.fit-carousel, \.fit-step-art, \.fit-card, \.fit-spot-dot::after, \.draw-pencil\) \{ animation: none !important; \}/);
  assert.match(motion, /const behavior = calm \? 'auto' : 'smooth';/);
  assert.match(css, /\.fit-tour\[data-motion\] :is\(\.fit-figure:not\(\.is-near\), \.fit-slide:not\(\[data-pos="active"\]\) \.fit-figure\) :is\(\.fit-float, \.fit-ground\) \{ animation-play-state: paused; \}/, 'flutua só a peça ativa, perto da tela');
}

// ── modo cinema: GSAP + ScrollTrigger + SplitText + Lenis, guardados no próprio site e carregados só aqui ──
{
  const motion = read('dist/fit-tour-motion.js'), css = read('dist/fit-tour.css'), page = read('dist/index.html');
  for (const [file, head] of [['gsap.min.js', /GSAP 3\.15\.0/], ['ScrollTrigger.min.js', /ScrollTrigger 3\.15\.0/], ['SplitText.min.js', /SplitText 3\.15\.0/], ['lenis.min.js', /1\.3\.26/]]) {
    const source = read(`dist/vendor/${file}`);
    assert.match(source.slice(0, 400), head, `${file}: versão guardada no site`);
    assert.doesNotMatch(source, /sourceMappingURL/, `${file}: sem referência a arquivo .map que não existe`);
  }
  assert.match(read('dist/vendor/GSAP-LICENSE.txt'), /gsap\.com\/standard-license/);
  assert.match(read('dist/vendor/LENIS-LICENSE.txt'), /MIT/);
  assert.match(motion, /const LIBS = \['vendor\/gsap\.min\.js', 'vendor\/ScrollTrigger\.min\.js', 'vendor\/SplitText\.min\.js', 'vendor\/lenis\.min\.js'\];/);
  assert.doesNotMatch(page, /vendor\/gsap|vendor\/lenis/, 'nada bloqueia o carregamento da página: o módulo da seção busca as bibliotecas depois');
  assert.match(motion, /Promise\.all\(LIBS\.map\(loadScript\)\)\.then\(cinema\)\.catch\(/, 'se não carregarem, fica o modo de reserva');
  // Lenis: só a roda do mouse, sem mexer em janelas e gavetas; para enquanto a área do produto trava a página
  assert.match(motion, /if \(!calm && Lenis\) \{\n    lenis = new Lenis\(\{lerp: \.1, allowNestedScroll: true, prevent: node => node\.matches\?\.\('dialog, \[role="dialog"\], \.language-menu, \[data-lenis-prevent\]'\)\}\);/);
  assert.match(motion, /lenis\.on\('scroll', ScrollTrigger\.update\);\n    gsap\.ticker\.add\(time => lenis\.raf\(time \* 1000\)\);/);
  assert.match(motion, /if \(now\) lenis\.stop\(\); else lenis\.start\(\);/);
  // a rolagem é só o gatilho: nada preso ao progresso (sem scrub); a revelação roda sozinha até o fim
  assert.doesNotMatch(motion, /scrub:/, 'nenhuma animação presa ao progresso da rolagem');
  assert.match(motion, /const tl = gsap\.timeline\(\{defaults: \{ease: 'power3\.out'\}\}\);/);
  assert.match(motion, /\.fromTo\(part\.title\.chars, \{autoAlpha: 0, y: 30\}, \{autoAlpha: 1, y: 0, duration: \.8, stagger: \.03\}, \.06\)/, 'letras: opacidade 0 → 1, y 30 → 0, intervalo 0,03 s');
  assert.match(motion, /\.fromTo\(part\.words\(\)\.words, \{autoAlpha: 0, y: 30\}, \{autoAlpha: 1, y: 0, duration: \.65, stagger: \{amount: \.35\}\}, \.18\)/, 'palavras em sequência, sem passar de ~1,2 s');
  assert.match(motion, /\.fromTo\(part\.colors, \{autoAlpha: 0, y: 14, scale: \.6\}, \{autoAlpha: 1, y: 0, scale: 1, duration: \.5, stagger: \.05, ease: 'back\.out\(2\)'\}, \.4\)/, 'as esferas de cor em cascata');
  assert.match(motion, /if \(!calm\) popSpots\(tl, stageSpots\[index\], at \+ \.85\);/, 'os pontos sobre a peça aparecem depois da ficha');
  assert.match(motion, /document\.addEventListener\('keydown', event => \{ if \(event\.key === 'Escape'\) close\(\); \}\);/, 'Esc fecha o cartãozinho do ponto');
  // desktop: tela fixa, uma ficha por vez; a atual sai inteira antes de a próxima entrar
  assert.match(css, /\.fit-tour\.is-pinned \.fit-pin \{ position: sticky; top: 0;/);
  assert.match(css, /\.fit-tour\.is-pinned \.fit-story \{ display: block; height: calc\(100vh \+ \(var\(--fit-count, 4\) - 1\) \* 88vh\);/);
  assert.match(css, /\.fit-tour\.is-pinned \.fit-step \{ grid-area: 1 \/ 1;/, 'as fichas ocupam o mesmo lugar: nenhuma vaza embaixo da outra');
  assert.match(css, /\.fit-pin \{ display: contents; \}/, 'sem o modo cinema, o layout continua o de antes');
  assert.match(motion, /mm\.add\('\(min-width: 980px\)', \(\) => \{\n    tour\.classList\.add\('is-pinned'\);/);
  assert.match(motion, /leaving\.forEach\(part => tl\.to\(part\.copy, calm \? \{autoAlpha: 0, duration: \.2\} : \{autoAlpha: 0, y: -30, duration: \.4, ease: 'power2\.in'\}, 0\)\);/);
  assert.match(motion, /const at = leaving\.length \? \(calm \? \.2 : \.4\) : 0;/, 'a próxima só começa depois que a atual saiu');
  assert.match(motion, /ScrollTrigger\.create\(\{trigger: story, start: 'top 75%', end: 'bottom top',\n      onEnter: /, 'a primeira ficha dispara quando a história chega a 75% da tela');
  assert.match(motion, /onLeaveBack: \(\) => \{ inside = false; show\(-1\); \}/, 'rolar de volta para cima esconde');
  // celular: cada ficha dispara a 75% e volta a se esconder ao rolar de volta (play none none reverse)
  assert.match(motion, /ScrollTrigger\.create\(\{trigger: part\.step, start: 'top 75%',\n        onEnter: \(\) => \{ played\.get\(i\)\?\.kill\(\); played\.set\(i, reveal\(part, \{art: true\}\)\); \},\n        onLeaveBack: \(\) => played\.get\(i\)\?\.timeScale\(1\.8\)\.reverse\(\)\}\);/, 'rolando de volta, a ficha se desfaz quase duas vezes mais rápido');
  assert.match(motion, /scrollTrigger: \{trigger: el, start: 'top 75%', toggleActions: 'play none none reverse'\}/);
  assert.match(css, /\.fit-backdrop \{ display: none; position: fixed; inset: 0; z-index: -1;/);
  // texto dividido: letras do nome com máscara por linha; palavras já no idioma escolhido, refeitas quando ele muda
  assert.match(motion, /SplitText\.create\(name, \{type: 'chars,lines', mask: 'lines', tag: 'span',[^}]*aria: 'auto', autoSplit: true\}\);/);
  assert.match(css, /\.fit-tour\.is-gsap :is\(\.fit-char, \.fit-word\) \{ display: inline-block;/, 'peças em linha não se movem: as letras e palavras precisam ser inline-block');
  assert.match(motion, /para\.textContent = translate\(source\);/, 'a visão geral é dividida já no idioma escolhido');
  assert.match(motion, /addEventListener\('ju:language', \(\) => \{ build\(\); ScrollTrigger\.refresh\(\); \}\);/, 'e refeita quando o idioma muda');
  assert.match(motion, /if \(calm\) \{\n      tl\.fromTo\(\[part\.copy/, 'com movimento reduzido, só opacidade');
}

// ── Nossa coleção: só o card do centro na cor exclusiva da sua peça; os laterais no tom da página; foto sem encaixe ──
{
  const catalog = read('dist/catalog.js'), css = read('dist/carousel.css');
  assert.match(catalog, /return `--rail-own-1:\$\{one\};--rail-own-2:\$\{two\};--rail-own-3:\$\{three\};--rail-own-accent:\$\{theme\.accentColor\};--rail-own-ink:\$\{theme\.textColor\}`;/);
  assert.equal((catalog.match(/tabindex="-1" style="\$\{railTone\(id\)\}">/g) || []).length, 2, 'peças e novidades');
  for (const name of ['--rail-1', '--rail-2', '--rail-3', '--rail-a', '--rail-i']) assert.match(css, new RegExp(`@property ${name} \\{ syntax: '<color>'`), 'cores registradas: deslizam suavemente na troca');
  assert.match(css, /\.home \.product-rail-card\[style\*="--rail-own-1"\] \{\n  --rail-1: color-mix\(in srgb, var\(--theme-wash, #f4e4e7\) 22%, #fff\);[^}]*--rail-a: var\(--rose, #b64c68\); --rail-i: var\(--ink, #282326\);/, 'laterais no tom da página');
  assert.match(css, /\.home \.product-rail-card\[style\*="--rail-own-1"\]\.is-active \{ --rail-1: var\(--rail-own-1\); --rail-2: var\(--rail-own-2\); --rail-3: var\(--rail-own-3\); --rail-a: var\(--rail-own-accent\); --rail-i: var\(--rail-own-ink\);/, 'o do centro na cor da peça');
  assert.match(css, /--rail-1 \.6s ease, --rail-2 \.6s ease, --rail-3 \.6s ease, --rail-a \.6s ease, --rail-i \.6s ease;/);
}

console.log('PASS: famílias de encaixe, figura encaixada, história com ficha técnica e peça fixa, carrossel da categoria, posição na home, Escolha o seu, filtro da página Produtos e movimento acessível.');
