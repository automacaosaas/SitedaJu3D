const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

// Vitrine principal: a matemática do movimento e os dados de cada produto são puros e rodam
// direto no Node. Gestos, teclado, foco e transição são conferidos no navegador (ver HERO-BANNER-QA.md).
const dist = file => path.join(__dirname, '../dist', file);
const load = file => import(pathToFileURL(dist(file)).href);
const read = file => fs.readFileSync(dist(file), 'utf8');

const channel = value => { const c = value / 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; };
const luminance = hex => { const [r, g, b] = [1, 3, 5].map(i => channel(parseInt(hex.slice(i, i + 2), 16))); return .2126 * r + .7152 * g + .0722 * b; };
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + .05) / (lo + .05); };
const stops = css => [...css.matchAll(/#[0-9a-f]{6}\b/gi)].map(m => m[0]);

(async () => {
  const motion = await load('hero-motion.js');
  const data = await load('products.js');
  const {wrapDistance, pose, textPose, layerMix, swipeTarget, settleDuration, cubicBezier, MIN_SCALE, EASE, FULL_DURATION} = motion;

  // ── distância circular: o produto vizinho é sempre ±1, nos dois sentidos ─────────
  assert.equal(wrapDistance(0, 0, 3), 0);
  assert.equal(wrapDistance(1, 0, 3), 1);
  assert.equal(wrapDistance(2, 0, 3), -1, 'o último é o vizinho da esquerda do primeiro');
  assert.ok(Math.abs(wrapDistance(0, 1.4, 3) + 1.4) < 1e-9);
  for (let p = -7; p <= 7; p += .13) {
    const d = [0, 1, 2].map(i => wrapDistance(i, p, 3));
    assert.ok(d.every(v => v > -1.5 - 1e-9 && v <= 1.5 + 1e-9), 'distância sempre no caminho mais curto');
  }

  // ── produto + pilastra: profundidade sem exagero ────────────────────────────────
  const rest = pose(0);
  assert.deepEqual({x: rest.x, y: rest.y, scale: rest.scale, opacity: rest.opacity}, {x: 0, y: -0, scale: 1, opacity: 1}, 'ativo: escala 1, opacidade 1, no centro');
  assert.ok(MIN_SCALE >= .85 && MIN_SCALE <= .92, 'entra/sai entre 0.85 e 0.92');
  const edge = pose(1);
  assert.equal(edge.scale, MIN_SCALE);
  assert.equal(edge.opacity, 0, 'quem está a um produto de distância está invisível em repouso');
  assert.equal(pose(-.4).x, -.4);
  assert.ok(pose(.4).x === -pose(-.4).x && pose(.4).opacity === pose(-.4).opacity, 'saída e entrada são simétricas');
  let previous = 1;
  for (let a = 0; a <= 1; a += .02) { const o = pose(a).opacity; assert.ok(o <= previous + 1e-12, 'opacidade nunca sobe ao se afastar'); previous = o; }
  assert.ok(pose(.15).opacity > .9, 'perde só um pouco de opacidade no começo');
  const soft = pose(.5, {reduced: true});
  assert.deepEqual([soft.x, soft.y, soft.scale], [0, 0, 1], 'movimento reduzido: só crossfade, sem translação nem escala');
  assert.ok(soft.opacity > 0 && soft.opacity < 1);

  // ── textos e paleta: nunca dois blocos legíveis ao mesmo tempo ─────────────────
  assert.equal(textPose(0).opacity, 1);
  assert.equal(textPose(.5).opacity, 0);
  for (let p = 0; p <= 1; p += .01) {
    const a = textPose(-p).opacity, b = textPose(1 - p).opacity;
    assert.ok(a === 0 || b === 0, `texto sobreposto em ${p.toFixed(2)}: ${a} × ${b}`);
  }
  assert.deepEqual([textPose(.3, {reduced: true}).x, textPose(.3, {reduced: true}).y], [0, 0]);

  // ── fundo + header: cross-fade entre exatamente duas camadas vizinhas ───────────
  assert.deepEqual(layerMix(0, 3), {from: 0, to: 1, t: 0});
  assert.deepEqual(layerMix(2.5, 3), {from: 2, to: 0, t: .5});
  const back = layerMix(-.25, 3);
  assert.deepEqual([back.from, back.to, +back.t.toFixed(2)], [2, 0, .75]);
  for (let p = -6; p <= 6; p += .07) { const m = layerMix(p, 3); assert.ok(m.from !== m.to && m.t >= 0 && m.t < 1); }

  // ── gesto: mesma regra de limiar da vitrine anterior ────────────────────────────
  assert.equal(swipeTarget({anchor: 0, dx: -41, stride: 600}), 1);
  assert.equal(swipeTarget({anchor: 0, dx: 41, stride: 600}), -1);
  assert.equal(swipeTarget({anchor: 3, dx: -16, stride: 600}), 3, 'arraste curto volta');
  assert.equal(swipeTarget({anchor: 3, dx: -300, stride: 600, cancelled: true}), 3, 'cancelado volta');
  assert.equal(swipeTarget({anchor: 0, dx: -20, stride: 100}), 1, 'limiar diminui em telas curtas (18% do curso)');
  // o peteleco (movimento 14): rápido e curto troca; um peteleco de volta desfaz o arraste; devagar vale o limiar; nunca mais de uma peça
  const {FLICK} = motion;
  assert.ok(FLICK > .2 && FLICK < .6, 'peteleco a partir de ~0,35 px/ms');
  assert.equal(swipeTarget({anchor: 2, dx: -30, stride: 600, velocity: -.8}), 3, 'peteleco curto para a esquerda: a próxima');
  assert.equal(swipeTarget({anchor: 2, dx: 30, stride: 600, velocity: .8}), 1, 'peteleco curto para a direita: a anterior');
  assert.equal(swipeTarget({anchor: 2, dx: -200, stride: 600, velocity: .8}), 2, 'arrastou e voltou num peteleco: fica');
  assert.equal(swipeTarget({anchor: 2, dx: -30, stride: 600, velocity: -.1}), 2, 'devagar e curto: fica');
  assert.equal(swipeTarget({anchor: 2, dx: -900, stride: 600, velocity: -2}), 3, 'nunca mais de uma peça');
  assert.equal(swipeTarget({anchor: 2, dx: -20, stride: 600, velocity: -.8, position: 2.6}), 3, 'a partir de onde a vitrine está');
  assert.equal(swipeTarget({anchor: 2, dx: -300, stride: 600, velocity: -2, cancelled: true}), 2, 'cancelado volta, com ou sem impulso');

  // ── tempo e curva ───────────────────────────────────────────────────────────────
  assert.ok(FULL_DURATION >= 600 && FULL_DURATION <= 900, 'transição completa entre 600 e 900 ms');
  assert.equal(settleDuration(1), FULL_DURATION);
  assert.equal(settleDuration(1, {reduced: true}), 320);
  assert.ok(settleDuration(5) <= 1100 && settleDuration(0) >= 320);
  // ao soltar, a curva sai na velocidade do dedo: a ease-out começa a EASE[1]/EASE[0] vezes a média, entre 320 ms e FULL_DURATION
  assert.equal(settleDuration(.5, {velocity: 3, stride: 600}), Math.round(EASE[1] / EASE[0] * 300 / 3));
  assert.equal(settleDuration(.5, {velocity: .05, stride: 600}), FULL_DURATION, 'dedo parado: no máximo a duração cheia');
  assert.equal(settleDuration(.05, {velocity: 3, stride: 600}), 320, 'quase lá: no mínimo 320 ms');
  assert.equal(settleDuration(.5, {velocity: 1.5, stride: 600, reduced: true}), 320, 'movimento reduzido não muda');
  assert.deepEqual(EASE, [.22, 1, .36, 1]);
  const ease = cubicBezier(...EASE);
  assert.equal(ease(0), 0); assert.equal(ease(1), 1);
  const bezier = t => { const u = 1 - t, [x1, y1, x2, y2] = EASE; return [3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3, 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3]; };
  let last = 0;
  for (let x = .02; x < 1; x += .02) {
    const y = ease(x); assert.ok(y >= last - 1e-9, 'curva monotônica'); last = y;
    let best = Infinity; for (let t = 0; t <= 1; t += .0005) { const [bx, by] = bezier(t); best = Math.min(best, Math.hypot(bx - x, by - y)); }
    assert.ok(best < 2e-3, `ease(${x.toFixed(2)}) fora da curva CSS`);
  }

  // ── dados: cada produto tem tema, enquadramento e cores originais ───────────────
  const {PRODUCTS, SOON, PRODUCT_CATEGORIES, PALETTE, SHOWCASE, DEFAULT_SHOWCASE, showcase, originalColors} = data;
  assert.ok(Object.keys(SHOWCASE).every(key => PRODUCTS[key] || SOON[key]), 'SHOWCASE só descreve produtos (ou novidades) que existem');
  assert.ok(Object.keys(SOON).every(key => !PRODUCTS[key] && SOON[key].soon === true && SOON[key].colors.length && SOON[key].colors.every(c => /^#[0-9a-f]{6}$/i.test(c.hex)) && !SOON[key].parts.length),
    'novidade: só vitrine (fora de PRODUCTS: sem preço, carrinho, catálogo nem personalização) e com os pontinhos do banner');
  // as lâmpadas (07/10/2026): à venda, de cores fixas (nada para escolher), com as cores delas nos pontinhos
  const lamps = Object.keys(PRODUCTS).filter(key => !PRODUCTS[key].parts.length);
  assert.deepEqual(lamps, ['macacoscopio', 'girafoscopio', 'unicornioscopio'], 'as lâmpadas: produtos de cores fixas');
  assert.ok(lamps.every(key => PRODUCTS[key].colors.length && PRODUCTS[key].colors.every(c => /^#[0-9a-f]{6}$/i.test(c.hex)) && !PRODUCTS[key].soon), 'cores fixas com hex, sem o selo de novidade');
  const tokens = ['bannerStops', 'headerBackground', 'textColor', 'mutedColor', 'accentColor'];
  for (const key of [...Object.keys(PRODUCTS), ...Object.keys(SOON)]) {
    const {art, theme} = showcase(key), p = PRODUCTS[key] || SOON[key];
    assert.ok(PRODUCT_CATEGORIES[p.category]?.label, `${key}: categoria real cadastrada`);
    assert.ok(fs.existsSync(dist('assets/' + (p.catalogImage || p.image))), `${key}: imagem original existe`);
    for (const field of ['h', 'bottom', 'foot']) assert.ok(art[field] > 0 && art[field] <= 1, `${key}: art.${field}`);
    assert.ok(art.h + art.bottom <= 1, `${key}: recorte cabe no quadrado`);
    for (const token of tokens) assert.ok(theme[token], `${key}: theme.${token}`);
    // cores mostradas = cores de fábrica de cada parte, sem repetir
    if (!SOON[key] && !p.parts.length) assert.deepEqual(originalColors(key), p.colors, `${key}: as cores fixas dela`);
    else if (!SOON[key]) {
      const shown = originalColors(key), expected = [...new Set(p.parts.map(part => part.default))];
      assert.deepEqual(shown.map(c => c.id), expected, `${key}: paleta = padrão das partes`);
      assert.ok(shown.every(c => PALETTE.some(x => x.id === c.id && /^#[0-9a-f]{6}$/i.test(c.hex))));
    }
    // tema pastel e legível
    const bg = stops(theme.bannerStops), header = theme.headerBackground;
    assert.ok(bg.length >= 2, `${key}: gradiente com paradas hex`);
    for (const stop of [...bg, header]) assert.ok(luminance(stop) >= .6, `${key}: ${stop} é claro/pastel demais para o site (luminância ${luminance(stop).toFixed(2)})`);
    for (const stop of bg) {
      assert.ok(contrast(theme.textColor, stop) >= 7, `${key}: texto sobre ${stop}`);
      assert.ok(contrast(theme.mutedColor, stop) >= 4.5, `${key}: subtítulo sobre ${stop} = ${contrast(theme.mutedColor, stop).toFixed(2)}`);
      assert.ok(contrast(theme.accentColor, stop) >= 4.5, `${key}: categoria sobre ${stop} = ${contrast(theme.accentColor, stop).toFixed(2)}`);
    }
  }
  assert.deepEqual(originalColors('aviaoscopia').map(c => c.id), ['blue', 'red', 'yellow']);
  assert.deepEqual(originalColors('borboletoscopio').map(c => c.id), ['mint', 'yellow']);
  assert.deepEqual(originalColors('dinossauroscopio').map(c => c.id), ['moss', 'cream']);
  assert.deepEqual(Object.keys(showcase('produto-novo').theme), Object.keys(DEFAULT_SHOWCASE.theme), 'produto sem entrada usa o tema padrão');

  // ── regras do pedido, direto no código ──────────────────────────────────────────
  const js = read('carousel.js'), css = read('carousel.css'), html = read('index.html');
  assert.ok(!/aviaoscopia|borboletoscopio|dinossauroscopio/i.test(js), 'nenhuma lógica específica de produto');
  assert.ok(!/setInterval|autoplay/i.test(js), 'sem autoplay');
  assert.ok(js.includes('lostpointercapture'), 'tratamento de lostpointercapture preservado');
  assert.ok(css.includes('touch-action: pan-y pinch-zoom'), 'rolagem vertical nativa preservada');
  assert.ok(css.includes('prefers-reduced-motion'), 'movimento reduzido tratado no CSS');
  assert.ok(js.includes('reduced'), 'movimento reduzido tratado no JS');
  assert.ok(html.includes('aria-label="Produto anterior"') && html.includes('aria-label="Próximo produto"'));
  assert.ok(!/Coleção explorar/i.test(html + js), 'sem "Coleção explorar"');
  assert.ok(!/thumb|miniatur/i.test(html + js + css), 'sem miniaturas abaixo do banner');
  assert.ok(!/setInterval|requestAnimationFrame\(\s*\(\)\s*=>\s*\{\s*document/.test(js));

  // ── emenda banner → página: degradê até a cor do site, sem borda seca ───────────
  const theme = read('theme.css'), catalog = read('catalog.css'), shopping = read('shopping.css');
  const bg = theme.match(/--bg:#([0-9a-f]{6})/i)[1], [r, g, b] = [0, 2, 4].map(i => parseInt(bg.slice(i, i + 2), 16));
  const overlay = css.match(/\.hero-bg::after \{[^}]*\}/)[0];
  // Uma faixa de cor por tema cobre a página inteira; o véu na cor do site regula a intensidade:
  // 0% no fim do banner → sobe até um piso (nunca volta ao rosa cheio) → desce no rodapé (mais tema).
  const veil = [...overlay.matchAll(/rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/g)];
  assert.ok(veil.length === 22 && veil.every(m => m[1] == r && m[2] == g && m[3] == b), 'o véu usa exatamente a cor de fundo do site (--bg)');
  const veilAlpha = veil.map(m => Number(m[4])), peak = veilAlpha.indexOf(Math.max(...veilAlpha));
  assert.equal(veilAlpha[0], 0, 'o véu começa transparente (emenda invisível com o banner)');
  assert.ok(veilAlpha.slice(0, peak + 1).every((v, i, all) => i === 0 || v >= all[i - 1]) && veilAlpha.slice(peak).every((v, i, all) => i === 0 || v <= all[i - 1]), 'sobe, mantém e desce sem degraus (curva suave)');
  assert.ok(Math.max(...veilAlpha) <= .65 && veilAlpha.at(-1) <= .3 && veilAlpha.at(-1) < Math.max(...veilAlpha), 'a seção mantém a cor do banner (sem faixa rosa no meio) e o rodapé aprofunda o tema');
  assert.ok(overlay.includes('max(var(--ramp-1), calc(100% - var(--foot-ramp)))') && !/--foot-ramp\) \*/.test(overlay), 'a rampa do rodapé só começa depois do fim da primeira (paradas nunca se sobrepõem)');
  assert.ok(/\.home \.page \{[^}]*isolation: isolate[^}]*--hero-h[^}]*--ramp-1[^}]*--foot-ramp/.test(css), 'variáveis do fundo na .page (ancestral comum)');
  assert.ok(!/border-radius/.test(css.match(/\.hero-bg \.hero-layer \{[^}]*\}/)[0]), 'sem cantos arredondados no fundo (a pilastra mantém a base curva)');
  const layerRule = css.match(/\.hero-bg \.hero-layer \{[^}]*\}/)[0], heroBg = css.match(/\.hero-bg \{[^}]*\}/)[0];
  assert.ok(!/bottom:/.test(layerRule) && layerRule.includes('radial-gradient(90% calc(var(--hero-h) * .75) at 52% calc(var(--hero-h) * .42), var(--stops))'), 'degradê do banner com a geometria presa à altura do banner');
  assert.ok(/position: absolute; inset: 0/.test(heroBg) && html.indexOf('data-hero-bg') < html.indexOf('class="hero-shell"'), 'o fundo cobre a página inteira, atrás do banner e do catálogo');
  const tail = css.match(/--tail:\s*clamp\((\d+)px,[^,]+,\s*(\d+)px\)/);
  assert.ok(tail && Number(tail[1]) >= 300 && Number(tail[2]) <= 800, 'a dissolução do banner cobre o título e o começo dos cards');
  assert.ok(/\.scenery-mist \{[^}]*mask-image/.test(css) && !/\.clouds\b|\.cloud \{|class="clouds"/.test(css + read('hero-scenery.js')), 'as silhuetas dos cantos esmaecem antes do limite do banner (sem os discos chapados de antes)');
  assert.ok(js.includes("put(page, '--hero-h', height + 'px');"), 'altura do banner medida no JS');
  // Card central limpo: nada de sombra cortada pela borda do palco nem brilho no alto.
  assert.ok(/@supports \(overflow: clip\) \{ \.home \.product-carousel-stage \{ overflow-x: clip; overflow-y: visible; \} \}/.test(css), 'o palco só recorta na horizontal (a sombra não é cortada em retângulo)');
  const cardShadows = css.match(/\.home \.product-rail-card(\.is-active)? \{[^}]*box-shadow:[^;]*;/g);
  assert.ok(cardShadows.length === 2 && cardShadows.every(rule => /var\(--theme-glow/.test(rule) && !/-?\d+px -?\d+px -?\d+px -?\d+px[^;]*,/.test(rule) && !/box-shadow: 0 -\d/.test(rule)), 'sombras curtas, suaves, no tom do tema, sem brilho no alto');
  // Personalização abaixo do banner: título/apoio, link do catálogo, rodapé e SÓ os dois botões do card.
  for (const selector of ['.catalog-heading .eyebrow', '.catalog-heading h2', '.catalog-heading > p', '.catalog-all', '.catalog-note', 'footer .signature', 'footer .footer-copy', 'footer .footer-social', '.product-rail-category', '.product-rail-active-details strong']) assert.ok(css.includes('.home ' + selector), 'personaliza ' + selector);
  // Só o que foi pedido chega ao catálogo, sempre com o prefixo .home (a página Produtos não muda).
  const catalogClasses = new Set(['.product-cart', '.product-carousel-dots', '.product-carousel-stage', '.product-customize', '.product-rail-actions', '.product-rail-active-details', '.product-rail-art', '.product-rail-bottom', '.product-rail-card', '.product-rail-category', '.product-rail-copy']);
  assert.ok([...new Set(css.match(/\.product-[a-z-]+/g))].every(name => catalogClasses.has(name)), 'o CSS só menciona partes permitidas do catálogo');
  assert.ok(css.split('\n').filter(line => /\.product-/.test(line)).every(line => /^\s*(\.home |\/\*|@supports \([^)]*\) \{ \.home )/.test(line)), 'todo seletor do catálogo tem o prefixo .home');
  assert.ok(!/catalog-card|catalog-carousel/.test(css), 'sem seletores fora do escopo do catálogo');
  assert.ok(!/product-rail|product-customize/.test(js), 'o banner não mexe nos cards do catálogo (a ação principal abre o configurador)');
  assert.ok(/var\(--theme-accent, var\(--rose\)\)/.test(css) && /var\(--theme-text, var\(--ink\)\)/.test(css) && /var\(--theme-muted, var\(--muted\)\)/.test(css), 'sem JS, tudo mantém as cores originais do site');
  assert.ok(!/\.explore|Conhecer <span/.test(css + js) && !/class="explore"/.test(js), 'sem o botão "Conhecer" no hover');
  assert.ok(/\.slot\[data-front=true\] \{ cursor: pointer; \}/.test(css) && /\.slot\[data-front=true\]:hover \.piece img \{ transform: translateY\(-8px\)/.test(css), 'o movimento de hover da peça continua');
  const {mixColor} = motion;
  assert.equal(mixColor('#000000', '#ffffff', 0), '#000000'); assert.equal(mixColor('#000000', '#ffffff', 1), '#ffffff');
  assert.equal(mixColor('#102030', '#304050', .5), '#203040'); assert.equal(mixColor('#102030', '#304050', 2), '#304050', 'limita t a [0, 1]');
  for (const key of Object.keys(PRODUCTS)) for (const other of Object.keys(PRODUCTS)) for (const token of ['textColor', 'mutedColor', 'accentColor']) {
    const a = showcase(key).theme[token], b = showcase(other).theme[token];
    for (let t = 0; t <= 1; t += .25) { const mixed = mixColor(a, b, t); assert.ok(/^#[0-9a-f]{6}$/.test(mixed)); assert.ok(contrast(mixed, '#dde1f8') >= 4, key + '→' + other + ' ' + token + ' legível durante a troca'); }
  }
  assert.ok(css.includes('.home .page-inner { position: relative; z-index: 1; }'), 'catálogo desenha acima da dissolução');

  // ── Banner limpo: preço, ação principal "Personalizar o meu" e, com demonstração, "Ver encaixado" ──────
  assert.ok(js.includes('href="#produto/${key}/personalizar" data-role="palette"'), 'a ação principal abre o configurador do produto ativo');
  assert.ok(js.includes("${icon('palette')}<span>Personalizar o meu</span><span class=\"palette-go\" aria-hidden=\"true\">${icon('arrow')}</span>"), 'ícone de paleta de cores à esquerda, verbo claro e, na ponta, o círculo com a seta');
  assert.ok(/\.palette-button:hover > svg \{ animation: palette-tilt \.6s/.test(css) && /\.palette-button:hover \{ transform: scale\(1\.03\);/.test(css), 'no hover o botão sobe 3% e a paleta balança');
  assert.ok(/\.home \.product-rail-card\[style\*="--rail-own-1"\]\.is-active \.product-rail-art img \{ transform: scale\(1\); \}/.test(css) && /\.home \.product-rail-card\[style\*="--rail-own-1"\] \.product-rail-art img \{ transform: scale\(\.9\);/.test(css) && !/translateY\(-21%\)/.test(css), 'em "Nossa coleção" a peça fica dentro do card; a do centro cresce um pouco (2026-10-05)');
  // 08/10/2026: a mesma caixa em todos os cards; os dos lados menores só pela escala (--side-s), nada pula na troca. Segunda volta: o do
  // centro uns 8% menor e os vizinhos (só a peça e o nome) maiores; no tablet e no celular, no meio da sobra de cada lado
  assert.ok(/--card-w: min\(342px, 35vw\);[^}]*--slot-w: clamp\(270px, 24vw, 340px\); --side-s: \.82;/.test(css) && /scale\(var\(--side-s\)\)/.test(css) && /--slot-w: calc\(var\(--card-w\) \* \.8\)/.test(catalog) && /--slot-w: 41vw/.test(catalog), 'cards dos lados menores, ao lado do central (desktop, tablet e celular)');
  // revisão: de 901 a 1023 px a sobra é estreita; os vizinhos chegam mais perto do centro e encolhem um pouco (a peça não passa por baixo
  // da seta, o nome não some no esmaecido da borda e fica em 18 px)
  assert.ok(/@media \(min-width: 901px\) and \(max-width: 1023px\) \{\r?\n  \.home \.product-carousel-stage \{ --slot-w: 25\.8vw; --side-s: \.72; \}\r?\n\}/.test(css), 'notebook pequeno: os vizinhos entre o card e as setas');
  assert.ok(/\.palette-button:active \{ transform: scale\(\.98\);/.test(css), 'no clique o botão afunda');
  assert.ok(/\.palette-button \{[^}]*box-shadow: [^;]*0 10px 25px var\(--glow\)/.test(css), 'sombra viva no tom do botão');
  assert.ok(js.includes("data-demo-open>${icon('eye')}<span>Ver encaixado</span>"), '"Ver encaixado" com o olho (ver a peça montada)');
  assert.ok(/\.palette \{ display: flex; flex-direction: row; align-items: center; gap: 12px;/.test(css), 'no computador, as duas ações lado a lado');
  assert.ok(/\.palette-button \{[^}]*border-radius: 999px;/.test(css) && /\.hero-demo-button \{[^}]*min-height: 52px;[^}]*border-radius: 999px;[^}]*backdrop-filter: blur\(10px\)/.test(css), 'as duas em pílula, na mesma altura; "Ver encaixado" de vidro');
  assert.ok(css.includes('@keyframes palette-sheen') && /prefers-reduced-motion[\s\S]*\.palette-button::after \{ animation: none; display: none; \}/.test(css), 'o brilho que atravessa o botão (e sem ele com movimento reduzido)');
  assert.ok(/\.hero-arrow \{[^}]*background: rgba\(255, 255, 255, \.5\); -webkit-backdrop-filter: blur\(10px\)/.test(css) && /\.hero-next:hover svg \{ translate: 3px 0; \}/.test(css), 'setas de vidro translúcido; no hover o chevron anda para onde aponta');
  assert.ok(!/data-go-card|goToCard|is-pulsing|chevron-nudge|cta-pulse|palette-dots/.test(js + css), 'sem a ida ao card, a seta pulsante nem as bolinhas');
  assert.ok(!/hero-cue|data-hero-cue|cue-ring|cue-bounce/.test(html + js + css), 'sem a seta separada');
  assert.ok(js.includes('${demo ? `<button class="hero-demo-button" type="button" data-demo-open>'), '"Ver encaixado" só nas peças com demonstração');
  assert.ok(/data-demo-open\]'\) && !locked && demo\.has\(active\)\) demo\.open\(active\)/.test(js), 'e abre a demonstração do produto ativo');
  assert.ok(js.includes('<p class="copy-price"><strong>${money(price)}</strong><span class="copy-pix">5% off no Pix</span></p>'), 'preço com o selo do Pix');
  assert.ok(/\.palette-button \{[^}]*min-height: 52px;[^}]*background: var\(--accent\)/.test(css), 'botão na cor do tema, com área de toque generosa');
  assert.ok(/\.palette-button \{ width: 100%;/.test(css) && /\.hero-demo-button \{ width: 100%; min-height: 50px; \}/.test(css), 'no celular as duas ocupam a linha inteira, uma embaixo da outra');
  assert.ok(/\.hero-arrow \{ position: static; translate: none; grid-row: 2; align-self: center;/.test(css), 'no celular as setas flutuam nas bordas da pilastra, longe do botão');
  assert.ok(/\.hero-palette \{[^}]*margin-top: clamp\(20px, 6vw, 34px\)/.test(css), 'no celular o botão fica abaixo da pilastra');
  assert.ok(css.includes('.palette-button:active { transform: none; }'), 'movimento reduzido: sem animação de toque');
  assert.ok(/\.home \.catalog-home \.product-customize, \.home \.catalog-home \.product-cart \{[^}]*background: var\(--theme-accent, var\(--rose\)\)/.test(css), 'Personalize o seu e carrinho do card seguem a cor do banner');
  assert.ok(/\.home \.catalog-home \.product-customize:hover, \.home \.catalog-home \.product-cart:hover \{[^}]*var\(--theme-accent-strong/.test(css), 'e escurecem no hover na mesma família de cor');
  for (const key of Object.keys(PRODUCTS)) {
    const {accentColor} = showcase(key).theme;
    assert.ok(contrast('#ffffff', accentColor) >= 4.5, key + ': texto branco sobre o botão (' + contrast('#ffffff', accentColor).toFixed(2) + ')');
    assert.ok(contrast('#ffffff', mixColor(accentColor, '#000000', .2)) >= 4.5, key + ': texto branco sobre o botão no hover');
  }

  // ── categoria, valor, pontinhos e topo do card central no tema ─────────────────
  assert.ok(/\.home \.product-rail-category, \.home \.product-rail-active-details strong \{ color: var\(--theme-accent, var\(--rose\)\)/.test(css), 'categoria e valor "Categoria" seguem o tema');
  assert.ok(css.includes('.home .product-carousel-dots button::after { background: var(--theme-soft') && css.includes('.home .product-carousel-dots button[aria-current]::after { background: var(--theme-accent'), 'pontinhos seguem o tema (o alvo de toque de 44 px não muda)');
  assert.ok(/\.home \.product-rail-card\.is-active \{[^}]*border-color: var\(--theme-soft[^}]*var\(--theme-glow/.test(css) && /\.home \.product-rail-card\.is-active \.product-rail-art \{ background: linear-gradient\(to bottom, var\(--theme-wash/.test(css), 'o topo do card central se conecta ao degradê do tema');
  assert.ok(js.includes("'--theme-soft'") && js.includes("'--theme-wash'"), 'as duas cores novas são calculadas a cada quadro');
  const desktopCards = css.match(/@media \(min-width: 901px\) \{\r?\n(?:  \/\*[\s\S]*?\*\/\r?\n)?  \.home \.product-carousel-stage \{ height: (\d+)px;[^}]*\}[\s\S]*?\r?\n\}/);
  assert.ok(desktopCards && Number(desktopCards[1]) <= 540 && /--card-w: min\(342px/.test(desktopCards[0]), 'no desktop os cards cabem na tela (só na home); o do centro uns 8% menor desde a segunda volta (2026-10-08)');
  assert.ok([...desktopCards[0].matchAll(/font-size: (\d+)px/g)].every(match => Number(match[1]) >= 26) && !/product-rail-(bottom|actions|active-details)[^{]*\{[^}]*font-size/.test(desktopCards[0]), 'o texto das informações não encolhe (só o título cai de 28 para 26 px)');
  for (const key of Object.keys(PRODUCTS)) {
    const {theme} = showcase(key), [, mid] = stops(theme.bannerStops), wash = mixColor(mid, '#ffffff', .3);
    assert.ok(contrast('#282326', wash) >= 12, key + ': texto do card sobre o topo tingido');
    assert.ok(contrast(theme.accentColor, '#ffffff') >= 4.5 && contrast(theme.accentColor, wash) >= 4.5, key + ': categoria legível sobre o card e sobre o topo tingido');
    assert.match(mixColor(theme.accentColor, '#ffffff', .78), /^#[0-9a-f]{6}$/);
  }

  // ── rodapé: © 2026, Instagram e a assinatura (nas páginas que compartilham o rodapé) ──
  for (const page of ['index.html', 'produtos.html', 'sobre.html', 'contato.html']) {
    const text = read(page);
    assert.ok(text.includes('<footer class="site-footer">') && text.includes('© 2026 Ju, imprime pra mim? Todos os direitos reservados.'), page + ': rodapé com direitos reservados');
    assert.ok(/<a class="footer-social" href="https:\/\/www\.instagram\.com\/juimprimepramim\/" target="_blank" rel="noopener noreferrer" aria-label="[^"]*Instagram[^"]*"><svg/.test(text), page + ': ícone do Instagram com rel seguro e nome acessível');
    assert.ok(text.includes('<span class="signature">feito com carinho, pela Ju.</span>') && !text.includes('Cor e criatividade em cada camada'), page + ': assinatura mantida');
  }
  assert.ok(/\.footer-social\{[^}]*width:44px;height:44px/.test(read('theme.css')), 'ícone com alvo de toque de 44 px');

  // ── header e banner num degradê só (sem linha) ──────────────────────────────────
  assert.ok(!/site-header::after/.test(css), 'sem linha entre o header e o banner');
  const band = css.match(/\.hero-band \.hero-layer \{[^}]*\}/)[0], bandAlphas = [...band.split('mask-image:')[1].matchAll(/rgba\(0, 0, 0, ([\d.]+)\) calc/g)].map(m => Number(m[1]));
  assert.ok(band.includes('bottom: -72px') && band.includes('mask-image'), 'a faixa do header desce sobre o banner e some em degradê');
  assert.ok(bandAlphas[0] === 1 && bandAlphas.at(-1) < .05 && bandAlphas.every((v, i) => i === 0 || v < bandAlphas[i - 1]), 'a máscara do header decresce em curva suave');

  // ── a mesma faixa de cor vai do banner ao rodapé (sem camada de rodapé separada) ──
  assert.ok(!/hero-foot|data-hero-foot|--foot-h|fadeGradient/.test(html + js + css + read('hero-motion.js')), 'sem o rodapé tingido separado');
  assert.equal(motion.withAlpha('#102030', .5), 'rgba(16, 32, 48, 0.5)');
  for (const key of Object.keys(PRODUCTS)) {
    const {theme} = showcase(key), [, , edge] = stops(theme.bannerStops), page = '#' + bg;
    for (const [where, amount] of [['miolo da seção', Math.max(...veilAlpha)], ['rodapé', veilAlpha.at(-1)]]) {
      const under = mixColor(edge, page, amount);   // cor real atrás do texto: borda do tema sob o véu
      assert.ok(contrast(theme.accentColor, under) >= 4.5 && contrast(theme.mutedColor, under) >= 4.5 && contrast(theme.textColor, under) >= 7, key + ': textos legíveis no ' + where + ' (' + under + ')');
    }
  }

  // ── a peça guardada para a volta à home (logo, Início, carrinho) ──────────────────
  // A vitrine guarda as cores de journeyColors; a página de cada peça já nasce com as mesmas (tools/build-product-pages.cjs).
  for (const key of [...Object.keys(PRODUCTS), ...Object.keys(data.SOON)]) {
    const {theme} = showcase(key), colors = motion.journeyColors(theme), [, mid] = stops(theme.bannerStops);
    assert.deepEqual(Object.keys(colors).sort(), ['--theme-accent', '--theme-accent-strong', '--theme-muted', '--theme-soft', '--theme-text', '--theme-wash'], key + ': as seis cores que o journey.js leva');
    assert.ok(Object.values(colors).every(value => /^#[0-9a-f]{6}$/i.test(value)), key + ': só cores que o journey.js aceita');
    assert.equal(colors['--theme-wash'], mixColor(mid, '#ffffff', .3));
    assert.equal(colors['--theme-accent-strong'], mixColor(theme.accentColor, '#000000', .2));
  }
  for (const key of Object.keys(PRODUCTS)) {
    const tag = read(key + '.html').match(/<html lang="pt-BR" data-theme-product="([a-z]+)" data-theme-colors="([^"]+)">/);
    assert.ok(tag && tag[1] === key, key + '.html: a página declara a própria peça');
    assert.deepEqual(JSON.parse(tag[2].replace(/&quot;/g, '"')), motion.journeyColors(showcase(key).theme), key + '.html: as mesmas cores da vitrine');
  }
  assert.ok(js.includes("const FOCUS = 'ju:product-focus'") && read('catalog.js').includes("const FOCUS = 'ju:product-focus'"), 'vitrine e coleção falam pelo mesmo evento');
  // 07/10/2026 (a dona: "ao mudar essa sessão dos produtos, não mudar a vitrine"): os cards não movem a vitrine, abrir uma peça por eles
  // também não (só a demonstração, /encaixe), e a vitrine não pinta mais a seção dos produtos — ela veste o card do centro.
  assert.ok(!/addEventListener\(FOCUS/.test(js), 'a vitrine não escuta mais a coleção');
  assert.ok(js.includes("const themed = [shell, document.querySelector('.home footer')].filter(Boolean);") && !/themed = \[[^\]]*catalog-home/.test(js), 'a vitrine pinta o banner e o rodapé, não a seção dos produtos');
  assert.ok(/function fromRoute\(\) \{\s*const index = fromHash\(\), step = location\.hash\.replace\('#produto\/', ''\)\.split\('\/'\)\[1\];\s*if \(step === 'encaixe' && index >= 0/.test(js), 'um #produto/<peça> depois da chegada só abre a janela; só /encaixe move a vitrine');
  assert.ok(js.includes('const initial = Math.max(0, fromHash() >= 0 ? fromHash() : keys.indexOf(window.juTheme?.product()));'), 'o endereço da chegada continua escolhendo a peça da vitrine');
  for (const name of ['text', 'muted', 'accent', 'accent-strong', 'soft', 'wash', 'glow']) assert.ok(css.includes(`@property --cat-${name} { syntax: '<color>'; inherits: true;`), `--cat-${name} registrada (desliza)`);
  assert.ok(/\.home \.catalog-home\[data-themed\] \{ --theme-text: var\(--cat-text\); --theme-muted: var\(--cat-muted\); --theme-accent: var\(--cat-accent\);[^}]*--rose: var\(--cat-accent\);/.test(css), 'a seção lê as cores do card do centro (também as do site, para os cards dos lados)');
  assert.ok(/\.home \.catalog-home\[data-themed="live"\] \{ transition: --cat-text \.6s ease,/.test(css) && css.includes('@media (prefers-reduced-motion: reduce) { .home .catalog-home[data-themed] { transition: none; } }'), 'troca suave de .6s; parada com movimento reduzido');
  assert.ok(/paintTheme\(\) \{[^]*?journeyColors\(showcase\(this\.items\[this\.active\]\.id\)\.theme\)/.test(read('catalog.js')) && /this\.paintTheme\(\);\r?\n  \}/.test(read('catalog.js')), 'a cada movimento dos cards, as cores do card do centro');
  // o título e o apoio da seção (cores do card do centro) continuam legíveis sobre o fundo da vitrine, qualquer que seja a peça de cada um
  for (const shown of Object.keys(PRODUCTS)) for (const card of Object.keys(PRODUCTS)) {
    const [, , edge] = stops(showcase(shown).theme.bannerStops), under = mixColor(edge, '#' + bg, Math.max(...veilAlpha)), theme = showcase(card).theme;
    assert.ok(contrast(theme.accentColor, under) >= 4.5 && contrast(theme.mutedColor, under) >= 4.5 && contrast(theme.textColor, under) >= 7, `${card} sobre a vitrine ${shown}`);
  }
  assert.ok(js.includes('window.juTheme?.save(key, colors)') && js.includes('if (key !== shared) { shared = key;'), 'a vitrine guarda a peça e só avisa a coleção quando ela muda');
  assert.ok(js.includes("addEventListener('pageshow', e => { if (e.persisted) report(); });"), 'voltar à home restaurada guarda de novo a peça à vista');
  assert.ok(/function settle\(next[^]*?if \(routed >= 0 && routed !== mod\(Math\.round\(target\), total\)\) history\.replaceState\(history\.state, '', location\.pathname \+ location\.search\);[^]*?setActive\(/.test(js), 'trocada a peça, o #produto/<peça> antigo sai do endereço já no início do movimento (Continuar escolhendo volta à peça certa)');

  // ── a demonstração pré-montada no ocioso só com conexão boa; em 3G/2G ou economia de dados, ao primeiro sinal de interesse ──
  assert.ok(js.includes("roomy = !net || (!net.saveData && !/(^|-)2g$|^3g$/.test(net.effectiveType || ''))"), 'economia de dados e 3G/2G não pré-carregam a demonstração');
  assert.ok(js.includes("for (const type of ['pointerenter', 'focusin', 'pointerdown']) region.addEventListener(type, early, {once: true, passive: true});"), 'mouse, foco ou toque na vitrine preparam a demonstração antes do clique, em qualquer conexão');
  // 08/10/2026 (PageSpeed): com conexão boa, só depois que a página carregou e ficou ociosa, mais 3 s — nunca nos primeiros segundos
  assert.ok(js.includes("const later = () => idle(() => setTimeout(() => idle(early), 3000));") && js.includes("if (document.readyState === 'complete') later(); else addEventListener('load', later, {once: true});") && !/requestIdleCallback\(early, \{timeout: 1500\}\)/.test(js), 'a demonstração nunca disputa a banda com a página');

  // ── fundo da vitrine em silhuetas brancas de nuvem (08/10/2026: "usando as nuvens BRANCAS… só silhuetas de características que
  //    lembram [cada peça], limpas e otimizadas"; antes, 07/10, cada peça tinha um desenho colorido) ──
  const {scenery, MOTIF_NAMES, SIDE_NAMES} = await load('hero-scenery.js');
  const {luminance: lum, lightTint, sceneryVars, sceneryShift, SCENERY_SHADE, SCENERY_PARALLAX, SCENERY_EDGE} = motion;
  const looks = Object.fromEntries(Object.keys(PRODUCTS).map(key => [key, [showcase(key).scenery.side, showcase(key).scenery.motif]]));
  assert.deepEqual(looks, {borboletoscopio: ['daisies', 'flowers'], dinossauroscopio: ['ferns', 'tracks'], aviaoscopia: ['towers', 'sky'], macacoscopio: ['palms', 'bananas'], girafoscopio: ['grass', 'acacia'], unicornioscopio: ['puffs', 'rainbow']},
    'borboleta: margaridas; dinossauro: samambaias e a pegada; avião: cúmulos e o rastro; macaco: palmeiras e bananas; girafa: o capim (o dono gostou) e a acácia; unicórnio: nuvens e o arco-íris');
  assert.deepEqual([...MOTIF_NAMES].sort(), ['acacia', 'bananas', 'flowers', 'rainbow', 'sky', 'tracks'], 'a biblioteca de desenhos (sem a pata colorida de T-rex)');
  assert.deepEqual([...SIDE_NAMES].sort(), ['daisies', 'ferns', 'grass', 'palms', 'petals', 'puffs', 'towers'], 'as silhuetas dos cantos');
  assert.deepEqual(showcase('produto-novo').scenery, {...DEFAULT_SHOWCASE.scenery}, 'produto sem entrada: as pétalas de sempre, sem desenho');
  assert.ok(scenery(showcase('produto-novo').scenery, 9).includes('scenery-petals') && !scenery(showcase('produto-novo').scenery, 9).includes('scenery-back'), 'e a vitrine dele só com os cantos');
  for (let a = 0; a <= 1; a += .05) assert.ok(Math.abs(lum(mixColor('#000000', '#ffffff', a)) - luminance(mixColor('#000000', '#ffffff', a))) < 1e-12, 'a mesma luminância dos testes');
  assert.ok(SCENERY_SHADE > 0 && SCENERY_SHADE <= .08, 'o sombreado do desenho: no máximo 8% da cor do texto');
  const layers = Object.keys(PRODUCTS).map((key, i) => ({key, html: scenery(showcase(key).scenery, i), look: showcase(key).scenery, theme: showcase(key).theme}));
  const allIds = [];
  for (const {key, html, look, theme} of layers) {
    // um elemento raiz só (a demonstração escurece e recua esse elemento, e o desenho tem de ir junto)
    const tags = [...html.matchAll(/<(\/?)([a-zA-Z]+)\b[^>]*?(\/?)>/g)];
    let depth = 0, roots = 0;
    for (const [, close, , self] of tags) { if (close) depth--; else if (!self) { if (depth === 0) roots++; depth++; } else if (depth === 0) roots++; assert.ok(depth >= 0, key + ': marcação equilibrada'); }
    assert.ok(depth === 0 && roots === 1 && html.startsWith('<div class="') && /^<div[^>]* aria-hidden="true"/.test(html), key + ': um elemento raiz, decorativo (aria-hidden)');
    assert.ok(!/<filter|filter\s*[:=]|feGaussian|<animate|<set\b|<script|\son[a-z]+=|javascript:|<image|href="(?!#)/i.test(html), key + ': sem filtros, animação SVG, scripts nem arquivos externos');
    assert.ok(!/#[0-9a-f]{6}\b|#(?!fff\b)[0-9a-f]{3}\b|rgba?\(/i.test(html.replace(/url\(#[^)]+\)/g, '').replace(/id="[^"]*"/g, '')), key + ': cores só pelas variáveis da camada (e o branco)');
    // branco: o preenchimento é sempre branco (direto ou por um degradê); o tom da peça só entra nas paradas da sombra (m-tN) e nos detalhes
    assert.ok([...html.matchAll(/\s(fill|stroke)="([^"]+)"/g)].every(([, , value]) => /^(#fff|none|url\(#scn-\d+-[a-z0-9-]+\))$/.test(value)), key + ': silhuetas brancas (sem cor chapada)');
    assert.ok([...html.matchAll(/<stop\b[^>]*>/g)].every(([stop]) => /stop-color="#fff"/.test(stop) || /class="m-t[1-4]"/.test(stop)), key + ': degradês brancos, com o tom da peça só na sombra');
    assert.ok(!/class="m-(k|g[hts]|fs|lh|ls|scale|crease|gloss)\b/.test(html), key + ': sem os desenhos coloridos de antes (escamas, garras, contornos)');
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
    allIds.push(...ids);
    for (const [, ref] of html.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ids.includes(ref), `${key}: o degradê ${ref} está na própria camada`);
    assert.ok(html.includes(`class="hero-scenery scenery-${look.side}"`) && html.includes(`data-motif="${look.motif}"`) && /<div class="scenery-back"><svg class="scenery-motif" viewBox="-180 -60 360 340"/.test(html), key + ': os cantos e o desenho dentro da raiz, no quadro da pilastra');
    // limpo e leve: poucas formas (o navegador pinta uma vez; depois só desliza)
    const shapes = (html.match(/<(path|circle|ellipse)\b/g) || []).length;
    assert.ok(shapes <= 48, `${key}: ${shapes} formas (no máximo 48)`);
    // as nuvenzinhas que flutuam: cada uma num <svg> próprio, dentro do <span> que se mexe, no quadro do desenho, com a posição do
    // celular e o seu tempo
    const drifts = [...html.matchAll(/<span class="scenery-drift" style="([^"]+)"><svg viewBox="([-\d. ]+)"/g)].map(([, style, box]) => [, box, style]);
    assert.ok(drifts.length >= 2 && drifts.length <= 3, key + ': duas ou três nuvenzinhas');
    // o que anima nunca é um <svg> (no Chrome, a animação dele não vai para o compositor): as silhuetas dos cantos também num <span>
    assert.ok(!/<svg class="scenery-(drift|spark|left|right)"/.test(html) && (html.match(/<span class="scenery-(left|right)"><svg viewBox="0 0 360 440"/g) || []).length === 2, key + ': o que se mexe é um <span> em volta do <svg>');
    for (const [, box, style] of drifts) {
      const [x, y, w, h] = box.split(' ').map(Number);
      assert.ok(style.startsWith(`--x:${x};--y:${y};--w:${w};--h:${h};--cx:`) && /--d:\d+s;--dl:-?\d+s/.test(style), key + ': o quadro da nuvenzinha bate com a posição dela');
      assert.ok(x >= -180 && x + w <= 180 && y >= -40, key + ': nuvenzinha dentro do quadro e abaixo do header');
    }
    // cores: a cor da peça clareada nunca escurece o fundo; o lado da sombra (8% do texto) mantém os textos legíveis
    const vars = sceneryVars(theme, look), [, mid] = stops(theme.bannerStops);
    assert.ok(look.tints.length >= 1 && look.tints.every(c => /^#[0-9a-f]{6}$/i.test(c)), key + ': as cores da peça em #rrggbb');
    assert.ok(Object.keys(vars).length === 12 && Object.values(vars).every(c => /^#[0-9a-f]{6}$/.test(c)), key + ': só cores opacas (nada translúcido escurecendo o fundo)');
    for (let k = 1; k <= 4; k++) {
      const t = vars[`--scn-t${k}`], h = vars[`--scn-h${k}`], s = vars[`--scn-s${k}`];
      assert.ok([t, h, s].every(c => /^#[0-9a-f]{6}$/.test(c)), `${key}: cor ${k} opaca`);
      assert.ok(luminance(t) >= luminance(mid) - 1e-9 && luminance(h) >= luminance(t), `${key}: cor ${k} (${t}) tão clara quanto o meio do degradê (${mid})`);
      assert.equal(s, mixColor(t, theme.textColor, SCENERY_SHADE), `${key}: sombra ${k} = 8% do texto sobre a cor`);
      assert.ok(contrast(theme.textColor, s) >= 7 && contrast(theme.mutedColor, s) >= 4.5 && contrast(theme.accentColor, s) >= 4.5, `${key}: textos legíveis até sobre a sombra do desenho (${s})`);
    }
    assert.equal(vars['--scn-t1'], lightTint(look.tints[0], mid));
    const shade = mixColor(mid, theme.textColor, SCENERY_SHADE);
    assert.ok(contrast(theme.textColor, shade) >= 7 && contrast(theme.mutedColor, shade) >= 4.5 && contrast(theme.accentColor, shade) >= 4.5, key + ': o sombreado sobre o meio do degradê mantém o contraste');
  }
  assert.equal(new Set(allIds).size, allIds.length, 'ids dos degradês únicos entre as seis camadas');
  for (const color of ['#183c99', '#efcf59', '#60341e', '#000000', '#ffffff']) for (const floor of ['#d9f0e4', '#fbe4b0', '#e2e8d4']) {
    // a cor da peça misturada ao branco só até a luminância do piso (a menor mistura que chega lá)
    const tint = lightTint(color, floor), k = [...Array(101).keys()].find(i => luminance(mixColor(color, '#ffffff', i / 100)) >= luminance(floor));
    assert.ok(luminance(tint) >= luminance(floor) && tint === mixColor(color, '#ffffff', k / 100), `lightTint(${color}, ${floor})`);
  }
  // profundidade no arraste: o desenho anda com a peça a 12% do caminho dela e os cantos a 5%; tudo parado no movimento reduzido
  assert.equal(SCENERY_PARALLAX, .12); assert.equal(SCENERY_EDGE, .05);
  assert.equal(sceneryShift(0, 600), 0);
  for (let d = -1.5; d <= 1.5; d += .1) {
    const shift = sceneryShift(d, 600), x = pose(d).x * 600;
    assert.ok(Math.abs(shift - x * .12) < 1e-9 && (shift === 0 || Math.sign(shift) === Math.sign(x)) && Math.abs(shift) <= 600 * .12 * 1.25 + 1e-9, 'parallax a favor da peça, a 12%');
    assert.ok(Math.abs(sceneryShift(d, 600, {depth: SCENERY_EDGE}) - x * .05) < 1e-9, 'os cantos, mais longe, a 5%');
    assert.equal(sceneryShift(d, 600, {reduced: true}), 0, 'movimento reduzido: o desenho não anda');
  }
  // regras do pedido no código: sem nome de produto, palco medido, e o laço de quadros barato (movimento 1): translate direto no desenho e
  // nos cantos, só nas camadas à vista; a camada apagada fora da pintura (content-visibility); estilos escritos só quando mudam; as cores
  // do tema, no meio da troca, só no header e nas setas (o banner inteiro e o rodapé recebem a cor final ao assentar)
  const sceneryJs = read('hero-scenery.js'), renderJs = js.slice(js.indexOf('function render()'), js.indexOf('function report('));
  const reportJs = js.slice(js.indexOf('function report('), js.indexOf('// ── Movimento'));
  assert.ok(!new RegExp(Object.keys(PRODUCTS).join('|'), 'i').test(js + sceneryJs), 'vitrine e desenhos sem nome de produto (o desenho vem de SHOWCASE)');
  assert.ok(js.includes("put(page, '--stage-x'") && js.includes("put(page, '--stage-top'") && js.includes("put(page, '--scn-ped'"), 'o desenho se prende ao palco medido em qualquer tela');
  // 08/10/2026 (PageSpeed): medir não força layout — todas as leituras antes das escritas, chamado pelo ResizeObserver, nunca na montagem
  const measureJs = js.slice(js.indexOf('function measure()'), js.indexOf('// Um estilo só é escrito quando muda'));
  assert.ok(measureJs.indexOf('getBoundingClientRect') < measureJs.indexOf('put(page') && measureJs.indexOf('offsetHeight') < measureJs.indexOf('put(page'), 'todas as leituras antes das escritas');
  assert.ok(js.includes("const sizes = new ResizeObserver(() => measure()); sizes.observe(shell); sizes.observe(slots[0]);") && js.includes('setActive(initial); render(); report();') && !/measure\(\); report\(\);/.test(js), 'a primeira medida vem do ResizeObserver, não da montagem');
  assert.ok(!/--scn-x/.test(js + css), 'sem a variável herdada --scn-x (cada escrita recalculava as seis camadas inteiras)');
  assert.ok(renderJs.includes("bgLayers[i].classList.toggle('is-off', !shown)") && renderJs.includes('if (!shown) continue;') && renderJs.includes("put(motifs[i], 'translate', `${Math.round(sceneryShift(d, travel, motion))}px 0`)") && renderJs.includes("put(edges[i], 'translate',"), 'camadas apagadas fora da pintura; na à vista, o desenho e os cantos acompanham a peça');
  assert.ok(/function put\(element, name, value\) \{[^]*?if \(seen\[name\] === value\) return;/.test(js) && !/\.style\.(setProperty|transform|opacity|visibility|zIndex)\b/.test(renderJs), 'no laço de quadros, nada é escrito sem mudar');
  assert.ok(js.includes("const live = [shell.querySelector('.site-header'), prevButton, nextButton].filter(Boolean);") && renderJs.includes('for (const element of live) for (const name in themeNow)') && !renderJs.includes('themed') && reportJs.includes('for (const element of themed) for (const name in themeNow)'), 'cores do tema: header e setas no meio da troca; banner e rodapé ao assentar');
  assert.ok(js.includes("<div class=\"hero-layer${i === initial ? '' : ' is-off'}\""), 'só a camada da abertura nasce na pintura');
  assert.ok(css.includes('.hero-bg .hero-layer.is-off { visibility:hidden; content-visibility:hidden; }'), 'a camada apagada sai da pintura (content-visibility)');
  assert.ok(/\.scenery-back \{[^}]*var\(--scn-ped[^}]*left:calc\(var\(--stage-x[^}]*top:calc\(var\(--stage-top[^}]*will-change:translate;/.test(css) && /\.scenery-mist \{[^}]*will-change:translate;/.test(css), 'o desenho no palco; desenho e cantos na própria camada do compositor (o transform da raiz é da demonstração)');
  assert.ok(/\.scenery-back \{[^}]*mask-image:/.test(css) && /\.scenery-mist \{[^}]*mask-image:/.test(css) && css.includes('.scenery-mist > span { position:absolute;') && !/\.hero-scenery svg \{/.test(css), 'bordas dissolvidas pela máscara; as silhuetas dos cantos não dimensionam o desenho');
  assert.ok(![...css.matchAll(/([^{}]+)\{[^}]*animation:scn-/g)].some(([, selector]) => /\bsvg\s*$/.test(selector.trim())), 'nenhuma animação do fundo num <svg> (só nos <span> em volta, que vão para o compositor)');
  // a dinâmica: as nuvenzinhas deslizam e os cantos balançam (só translate, voltas longas) e duas estrelinhas por peça cintilam (só
  // opacity e scale); param fora da tela, com a aba escondida, com a vitrine andando e na camada apagada; paradas no movimento reduzido
  const keyframes = Object.fromEntries([...css.matchAll(/@keyframes (scn-[a-z]+) \{([^]*?)\}\s*\}/g)].map(m => [m[1], m[2]]));
  assert.deepEqual(Object.keys(keyframes).sort(), ['scn-drift', 'scn-sway', 'scn-twinkle']);
  assert.ok(['scn-drift', 'scn-sway'].every(name => (keyframes[name].match(/translate:/g) || []).length === 2 && !/transform|opacity|scale|left|top|width|height|margin/.test(keyframes[name].replace(/translate:/g, ''))), 'só translate no que desliza');
  assert.ok(/opacity:/.test(keyframes['scn-twinkle']) && /scale:/.test(keyframes['scn-twinkle']) && !/transform|translate|left|top|width|height|margin|filter/.test(keyframes['scn-twinkle']), 'só opacity e scale no que cintila');
  assert.ok([...css.matchAll(/animation:scn-(drift|sway) (?:var\(--d, )?(\d+)s/g)].every(m => Number(m[2]) >= 10) && /animation:scn-twinkle var\(--d, [4-9]s\)/.test(css), 'voltas longas (10 s ou mais; o brilho, alguns segundos)');
  for (const {key, html} of layers) assert.equal((html.match(/<span class="scenery-spark"/g) || []).length, 2, key + ': duas estrelinhas que cintilam');
  assert.ok(css.includes('.hero-bg:is(.is-still, .is-moving) :is(.scenery-drift, .scenery-spark, .scenery-mist > span), .hero-layer.is-off :is(.scenery-drift, .scenery-spark, .scenery-mist > span) { animation-play-state:paused; }'), 'fora da tela, aba escondida, vitrine andando ou camada apagada: param');
  assert.ok(js.includes("const moving = on => bgHost.classList.toggle('is-moving', on);") && /stop\(\); target = next; moving\(true\);/.test(js) && /gesture\.horizontal = true; stop\(\); moving\(true\);/.test(js) && reportJs.includes('moving(false);'), 'param no arraste e no assentar, e voltam quando a peça assenta');
  assert.ok(css.includes('.palette[inert] .palette-button::after { animation: none; }'), 'o brilho do botão só no da peça à vista');
  assert.ok(js.includes("const rest = () => bgHost.classList.toggle('is-still', document.hidden || !onScreen);") && /new IntersectionObserver\(\(\[entry\]\) => \{ onScreen = entry\.isIntersecting; rest\(\); \}\)\.observe\(shell\)/.test(js) && /visibilitychange', \(\) => \{\s*rest\(\);/.test(js), 'a vitrine avisa quando sai da tela e quando a aba se esconde');
  assert.ok(/@media \(prefers-reduced-motion: reduce\) \{\r?\n  \.scenery-drift, \.scenery-spark, \.scenery-mist > span \{ animation:none; \}/.test(css), 'movimento reduzido: o fundo parado');
  assert.ok(/@media \(min-width: 901px\) and \(max-width: 1100px\) \{\r?\n  \.scenery-back \{ --m-scale:/.test(css) && /@media \(max-width: 600px\) \{\r?\n  \.scenery-back \{ --m-scale:/.test(css), 'o tamanho do desenho acompanha a pilastra em cada tela');
  // no celular, nada do desenho atrás das setas de vidro nem do preço: cada desenho tem a sua arrumação para essas telas
  const phone = css.slice(css.search(/@media \(max-width: 600px\) \{\r?\n  \.scenery-back \{ --m-scale:/));
  for (const motif of MOTIF_NAMES) assert.ok(phone.includes(`[data-motif="${motif}"]`), `${motif}: arrumado para o celular`);
  // as nuvenzinhas vão para o lugar do celular em toda tela com o texto acima do palco (até 900 px): no tablet, no lugar do computador,
  // passavam por trás do preço
  assert.ok(/@media \(max-width: 900px\) \{\r?\n  \.scenery-back > :is\(\.scenery-drift, \.scenery-spark\) \{ left:calc\(\(var\(--cx, var\(--x\)\) \+ 180\) \* 100% \/ 360\);/.test(phone), 'as nuvenzinhas no lugar delas no celular e no tablet');
  // dos 901 aos 1100 px os cúmulos baixos do céu saem de trás de "Ver encaixado" (a nuvenzinha alta fica no lugar)
  assert.ok(/@media \(min-width: 901px\) and \(max-width: 1100px\) \{[^@]*\[data-motif="sky"\] \.scn-l \{ transform:translate\((\d+)px, (\d+)px\); \}\r?\n  \[data-motif="sky"\] \.scn-a \{ transform:translate\(-\1px, -\2px\); \}/.test(css), 'o céu longe dos botões no notebook pequeno');
  // as pontinhas das bananas na sombra quente da peça (a do marrom clareado virava cinza)
  assert.ok(css.includes('.scenery-back .m-nub { fill:var(--scn-s1); }'), 'pontinhas das bananas na cor quente');

  console.log('carousel: ok');
})().catch(error => { console.error(error); process.exit(1); });
