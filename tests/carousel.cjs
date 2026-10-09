const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

// Vitrine principal: a matemática do movimento e os dados de cada produto são puros e rodam
// direto no Node. Gestos, teclado, foco e transição são conferidos no navegador (ver HERO-BANNER-QA.md).
const dist = file => path.join(__dirname, '../dist', file);
const load = file => import(pathToFileURL(dist(file)).href);
// o CSS como o tema claro o lê (os tokens do escuro caem na reserva; tests/lib/light-css.cjs)
const {lightCss} = require('./lib/light-css.cjs');
const read = file => { const text = fs.readFileSync(dist(file), 'utf8'); return file.endsWith('.css') ? lightCss(text) : text; };

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
  // tema escuro (09/10/2026): a cor do véu é o token --veil-rgb, que só o escuro define; a reserva é a cor do site no claro
  const veil = [...overlay.matchAll(/rgb\(var\(--veil-rgb, (\d+) (\d+) (\d+)\) \/ ([\d.]+)\)/g)];
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
  assert.ok(js.includes("put(bgHost, '--hero-h', height + 'px');"), 'altura do banner medida no JS (escrita no fundo, o único que a usa)');
  // Card central limpo: nada de sombra cortada pela borda do palco nem brilho no alto.
  assert.ok(/@supports \(overflow: clip\) \{ \.home \.product-carousel-stage \{ overflow-x: clip; overflow-y: visible; \} \}/.test(css), 'o palco só recorta na horizontal (a sombra não é cortada em retângulo)');
  const cardShadows = css.match(/\.home \.product-rail-card(\.is-active)? \{[^}]*box-shadow:[^;]*;/g);
  assert.ok(cardShadows.length === 2 && cardShadows.every(rule => /var\(--theme-glow/.test(rule) && !/-?\d+px -?\d+px -?\d+px -?\d+px[^;]*,/.test(rule) && !/box-shadow: 0 -\d/.test(rule)), 'sombras curtas, suaves, no tom do tema, sem brilho no alto');
  // Personalização abaixo do banner: título/apoio, link do catálogo, rodapé e SÓ os dois botões do card.
  for (const selector of ['.catalog-heading .eyebrow', '.catalog-heading h2', '.catalog-heading > p', '.catalog-all', '.catalog-note', 'footer .signature', 'footer .footer-copy', 'footer .footer-social', '.product-rail-category', '.product-rail-active-details strong']) assert.ok(css.includes('.home ' + selector), 'personaliza ' + selector);
  // Só o que foi pedido chega ao catálogo, sempre com o prefixo .home (a página Produtos não muda).
  const catalogClasses = new Set(['.product-cart', '.product-carousel-dots', '.product-carousel-stage', '.product-customize', '.product-rail-actions', '.product-rail-active-details', '.product-rail-art', '.product-rail-bottom', '.product-rail-card', '.product-rail-category', '.product-rail-copy']);
  assert.ok([...new Set(css.match(/\.product-[a-z-]+/g))].every(name => catalogClasses.has(name)), 'o CSS só menciona partes permitidas do catálogo');
  assert.ok(css.split('\n').filter(line => /\.product-/.test(line)).every(line => /^\s*((:root\[data-theme="dark"\] )?\.home |\/\*|@supports \([^)]*\) \{ \.home )/.test(line)), 'todo seletor do catálogo tem o prefixo .home (no tema escuro, :root[data-theme="dark"] .home)');
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
  assert.ok(/\.hero-arrow \{[^}]*background: rgb\(var\(--glass-rgb, 255 255 255\) \/ 0\.5\); -webkit-backdrop-filter: blur\(10px\)/.test(css) && /\.hero-next:hover svg \{ translate: 3px 0; \}/.test(css), 'setas de vidro translúcido; no hover o chevron anda para onde aponta');
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
  //    lembram [cada peça], limpas e otimizadas"; antes, 07/10, cada peça tinha um desenho colorido), e nas BORDAS (08/10/2026, depois:
  //    "deixar as coisas mais na borda, para se conectar com a página… algo mais fluido, que conecte com o rolar da página… que não ocupe
  //    além [da vitrine]") ──
  const {scenery, MOTIF_NAMES, SIDE_NAMES} = await load('hero-scenery.js');
  const {luminance: lum, lightTint, sceneryVars, sceneryShift, SCENERY_SHADE, SCENERY_PARALLAX, SCENERY_EDGE, SCENERY_SCROLL, sceneryScroll} = motion;
  const looks = Object.fromEntries(Object.keys(PRODUCTS).map(key => [key, [showcase(key).scenery.side, showcase(key).scenery.motif]]));
  assert.deepEqual(looks, {borboletoscopio: ['daisies', 'flowers'], dinossauroscopio: ['ferns', 'tracks'], aviaoscopia: ['towers', 'sky'], macacoscopio: ['palms', 'bananas'], girafoscopio: ['grass', 'acacia'], unicornioscopio: ['puffs', 'rainbow']},
    'borboleta: margaridas; dinossauro: samambaias e as pegadas; avião: cúmulos e o rastro; macaco: palmeiras e bananas; girafa: o capim (o dono gostou) e a acácia; unicórnio: nuvens e o arco-íris');
  assert.deepEqual([...MOTIF_NAMES].sort(), ['acacia', 'bananas', 'flowers', 'rainbow', 'sky', 'tracks'], 'a biblioteca de desenhos (sem a pata colorida de T-rex)');
  assert.deepEqual([...SIDE_NAMES].sort(), ['daisies', 'ferns', 'grass', 'palms', 'petals', 'puffs', 'towers'], 'as silhuetas dos cantos');
  assert.deepEqual(showcase('produto-novo').scenery, {...DEFAULT_SHOWCASE.scenery}, 'produto sem entrada: as pétalas de sempre, sem desenho');
  assert.ok(scenery(showcase('produto-novo').scenery, 9).includes('scenery-petals') && !scenery(showcase('produto-novo').scenery, 9).includes('scenery-back'), 'e a vitrine dele só com os cantos');
  for (let a = 0; a <= 1; a += .05) assert.ok(Math.abs(lum(mixColor('#000000', '#ffffff', a)) - luminance(mixColor('#000000', '#ffffff', a))) < 1e-12, 'a mesma luminância dos testes');
  assert.ok(SCENERY_SHADE > 0 && SCENERY_SHADE <= .08, 'o sombreado do desenho: no máximo 8% da cor do texto');
  // a borboleta sem nada colorido ("eu não quero coisa colorida. As flores estão com o miolo colorido"): só a sombra, no tom dela
  assert.deepEqual(showcase('borboletoscopio').scenery.tints, ['#89cdbc'], 'borboleta: sem o amarelo dos miolos');
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
    assert.ok(html.includes(`class="hero-scenery scenery-${look.side}"`) && html.includes(`data-motif="${look.motif}"`) && html.includes('<div class="scenery-back"><svg class="scenery-defs" focusable="false"><defs>'), key + ': os cantos e as silhuetas das bordas dentro da raiz; os degradês num <svg> só de definições');
    // limpo e leve: poucas formas (o navegador pinta uma vez; depois só desliza)
    const shapes = (html.match(/<(path|circle|ellipse)\b/g) || []).length;
    assert.ok(shapes <= 32, `${key}: ${shapes} formas (no máximo 32)`);
    // cada silhueta da borda, nuvenzinha e estrelinha é um <span> com o lado, a profundidade na rolagem, o lugar no computador e no
    // celular e o tamanho do desenho, com um <svg> próprio cujo quadro é esse tamanho
    const spans = [...html.matchAll(/<span class="scenery-(edge|drift|spark) scn-([lr]) scn-(far|mid)(?: scn-fade)?" style="([^"]+)"><svg viewBox="0 0 ([\d.]+) ([\d.]+)" focusable="false">/g)];
    assert.equal(spans.length, (html.match(/<span class="scenery-(edge|drift|spark)\b/g) || []).length, key + ': todas no mesmo molde');
    assert.ok(!/scn-fade/.test(html) || look.motif === 'rainbow' && !/class="scenery-(drift|spark)[^"]*scn-fade/.test(html), key + ': só os arcos do arco-íris se dissolvem antes da borda');
    for (const [, kind, , depthName, style, vw, vh] of spans) {
      assert.ok(/^--x:-?[\d.]+;--y:-?[\d.]+;--s:[\d.]+;--cx:-?[\d.]+;--cy:-?[\d.]+;--cs:[\d.]+;--w:[\d.]+;--h:[\d.]+(;--d:\d+(\.\d+)?s;--dl:-?\d+(\.\d+)?s)?$/.test(style), `${key}: ${kind} com o lugar nas duas arrumações (${style})`);
      assert.ok(style.includes(`--w:${vw};--h:${vh}`), `${key}: o quadro do ${kind} bate com o tamanho dele`);
      assert.ok(kind === 'edge' || depthName === 'far', `${key}: nuvenzinhas e estrelinhas ficam mais ao longe na rolagem`);
    }
    assert.ok((html.match(/class="scenery-edge /g) || []).length >= 2 && /scenery-edge scn-l/.test(html) && /scenery-edge scn-r/.test(html), key + ': silhuetas nas duas bordas');
    const drifts = spans.filter(([, kind]) => kind === 'drift');
    assert.ok(drifts.length >= 2 && drifts.length <= 3, key + ': duas ou três nuvenzinhas');
    // o que anima nunca é um <svg> (no Chrome, a animação dele não vai para o compositor): as silhuetas dos cantos também num <span>
    assert.ok(!/<svg class="scenery-(edge|drift|spark|glint|left|right)"/.test(html) && (html.match(/<span class="scenery-(left|right)"><svg viewBox="0 0 360 440"/g) || []).length === 2, key + ': o que se mexe é um <span> em volta do <svg>');
    // cores: a cor da peça clareada nunca escurece o fundo; o lado da sombra (8% do texto) mantém os textos legíveis
    const vars = sceneryVars(theme, look), [, mid] = stops(theme.bannerStops);
    assert.ok(look.tints.length >= 1 && look.tints.every(c => /^#[0-9a-f]{6}$/i.test(c)), key + ': as cores da peça em #rrggbb');
    // tema escuro (09/10/2026): mais uma, --stops-dark (o degradê do banner na noite da peça, que só o escuro usa)
    const {'--stops-dark': night, ...day} = vars;
    assert.ok(Object.keys(day).length === 12 && Object.values(day).every(c => /^#[0-9a-f]{6}$/.test(c)), key + ': só cores opacas (nada translúcido escurecendo o fundo)');
    assert.match(night, /^#[0-9a-f]{6} 0%,#[0-9a-f]{6} 52%,#[0-9a-f]{6} 100%$/, key + ': o degradê do escuro em três paradas opacas');
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
  // o arco-íris: as paradas do degradê das faixas sempre crescendo (fora de ordem, o navegador as juntava e só a faixa de fora aparecia)
  const rainbowHtml = layers.find(({look}) => look.motif === 'rainbow').html;
  const bands = [...rainbowHtml.matchAll(/<radialGradient id="scn-\d+-bands[lr]"[^>]*>(.*?)<\/radialGradient>/g)];
  assert.equal(bands.length, 2, 'dois arcos, um em cada borda');
  for (const [, inner] of bands) {
    const offsets = [...inner.matchAll(/offset="([\d.]+)"/g)].map(m => +m[1]);
    assert.ok(offsets.length === 13 && offsets.every((o, i) => i === 0 || o > offsets[i - 1]), 'faixas do arco-íris de dentro para fora');
    assert.deepEqual([...inner.matchAll(/class="m-t(\d)"/g)].map(m => +m[1]), [3, 2, 1, 4], 'dourado, lavanda, roxo e rosa, de dentro para fora');
  }
  assert.equal((rainbowHtml.match(/<span class="scenery-glint" style="left:-?[\d.]+%;top:-?[\d.]+%;width:[\d.]+%;height:[\d.]+%;--turn:-?1">/g) || []).length, 2, 'um brilho que corre por cada arco');
  // o pé de cada arco no meio da nuvem, acima da base dela (que se dissolve: ali o pé aparecia cortado reto por baixo), e o fim do arco
  // se dissolvendo antes da borda, com o brilho (acima de 1560 px a borda é a do contêiner: sem isso, um corte reto no meio do fundo)
  const feet = [...rainbowHtml.matchAll(/fill="url\(#scn-\d+-bands([lr])\)" d="M[\d.]+ ([\d.]+)A[^"]*" mask="url\(#scn-\d+-foot\1\)"\/><path fill="url\(#scn-\d+-c\)" d="M[\d.]+ ([\d.]+)A/g)];
  assert.equal(feet.length, 2, 'cada arco, com o pé dissolvido (máscara), seguido da nuvem dele');
  for (const [, , foot, base] of feet) assert.ok(+base - +foot >= 8, `o pé do arco (y ${foot}) bem acima da base da nuvem (y ${base})`);
  for (const [, k, foot] of feet) assert.ok(new RegExp(`<linearGradient id="scn-\\d+-foot${k}g" gradientUnits="userSpaceOnUse" x1="0" y1="${+foot - 36}" x2="0" y2="${+foot - 6}"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`).test(rainbowHtml), 'as faixas somem antes do pé, dentro da nuvem');
  assert.equal((rainbowHtml.match(/<span class="scenery-edge scn-[lr] scn-\w+ scn-fade" style="[^"]+"><svg[^>]*>(?:(?!<\/svg>).)*-bands[lr](?:(?!<\/span>).)*<span class="scenery-glint"/g) || []).length, 2, 'os dois arcos (e o brilho deles) se dissolvem antes da borda');
  assert.ok(css.includes('.scenery-back > .scn-fade.scn-l { -webkit-mask-image:linear-gradient(90deg, transparent, #000 14%); mask-image:linear-gradient(90deg, transparent, #000 14%); }') && css.includes('.scenery-back > .scn-fade.scn-r { -webkit-mask-image:linear-gradient(270deg, transparent, #000 12%); mask-image:linear-gradient(270deg, transparent, #000 12%); }'), 'a máscara do lado de fora de cada arco');
  // o macaco: só as folhas embaixo e nuvens em forma de banana (nenhuma nuvem comum nas bordas), com o cabinho e a pontinha
  const bananaHtml = layers.find(({look}) => look.motif === 'bananas').html;
  assert.ok(!/<span class="scenery-(edge|drift)[^"]*"[^>]*><svg[^>]*>(?:(?!<\/svg>).)*url\(#scn-\d+-c\)/.test(bananaHtml), 'bananas no lugar das nuvens');
  assert.ok((bananaHtml.match(/class="m-nub"/g) || []).length >= 3 && css.includes('.scenery-back .m-nub { fill:var(--scn-s1); }'), 'o cabinho e a pontinha das bananas na sombra quente da peça');
  // e as folhas de palmeira embaixo também no computador (mais altas, passavam por trás da seta, do "Comprar" e do preço; medido por pixel)
  assert.ok(/@media \(min-width: 901px\) \{\r?\n  \.scenery-palms \.scenery-left, \.scenery-palms \.scenery-right \{ bottom:-175px; \}\r?\n\}\r?\n@media \(min-width: 1561px\) \{\r?\n  \.scenery-palms \.scenery-left \{ left:-13%; \}\r?\n  \.scenery-palms \.scenery-right \{ right:-13%; \}/.test(css), 'as folhas do macaco embaixo, longe das setas e dos botões');
  // profundidade no arraste: o desenho anda com a peça a 12% do caminho dela e os cantos a 5%; tudo parado no movimento reduzido
  assert.equal(SCENERY_PARALLAX, .12); assert.equal(SCENERY_EDGE, .05);
  assert.equal(sceneryShift(0, 600), 0);
  for (let d = -1.5; d <= 1.5; d += .1) {
    const shift = sceneryShift(d, 600), x = pose(d).x * 600;
    assert.ok(Math.abs(shift - x * .12) < 1e-9 && (shift === 0 || Math.sign(shift) === Math.sign(x)) && Math.abs(shift) <= 600 * .12 * 1.25 + 1e-9, 'parallax a favor da peça, a 12%');
    assert.ok(Math.abs(sceneryShift(d, 600, {depth: SCENERY_EDGE}) - x * .05) < 1e-9, 'os cantos, mais longe, a 5%');
    assert.equal(sceneryShift(d, 600, {reduced: true}), 0, 'movimento reduzido: o desenho não anda');
  }

  // ── tudo nas bordas: nada atrás da peça e da pilastra, das setas, do texto, do preço e dos botões, no computador e no celular ──
  // As contas do navegador (tools: medido de 360 a 2560 px, hero-scenery.js) em unidades da pilastra: x a partir da borda de cada lado,
  // y a partir do alto do palco. O contorno de cada desenho sai do próprio SVG (caminhos achatados, com as transformações), na escala da
  // tela (--m-scale: 0,9 dos 901 aos 1100 px e 0,92 até 600 px), e as nuvenzinhas com a folga do deslizar (9 px para cada lado).
  const KEEP_OUT = {
    wide: [
      {side: 'all', x: [-1e3, 1e3], y: [-1e3, -34], what: 'o header'},
      {side: 'l', x: [12, 44], y: [118, 152], what: 'a seta da esquerda'}, {side: 'r', x: [13, 44], y: [118, 152], what: 'a seta da direita'},
      {side: 'l', x: [64, 1e3], y: [18, 178], what: 'o texto, o preço e os botões'},
      // a peça e a pilastra, à direita: dos 901 aos 1100 px (escala 0,9) a pilastra chega a x 130 e a peça a 165; acima disso, 148 e 183
      {side: 'r', x: [160, 1e3], y: [-6, 176], what: 'a peça', scale: [.9]}, {side: 'r', x: [128, 1e3], y: [150, 1e3], what: 'a pilastra', scale: [.9]},
      {side: 'r', x: [178, 1e3], y: [-6, 176], what: 'a peça', scale: [1]}, {side: 'r', x: [146, 1e3], y: [150, 1e3], what: 'a pilastra', scale: [1]},
      {side: 'l', x: [330, 1e3], y: [-6, 1e3], what: 'a peça e a pilastra'}
    ],
    compact: [
      {side: 'all', x: [-1e3, 1e3], y: [-1e3, -130], what: 'o header'}, {side: 'all', x: [55, 1e3], y: [-1e3, -32], what: 'o título e o subtítulo'}, {side: 'all', x: [74, 1e3], y: [-32, -10], what: 'o preço'},
      {side: 'all', x: [13, 60], y: [103, 146], what: 'as setas'},
      {side: 'all', x: [100, 1e3], y: [-6, 176], what: 'a peça'}, {side: 'all', x: [67, 1e3], y: [150, 262], what: 'a pilastra'},
      {side: 'all', x: [18, 1e3], y: [276, 1e3], what: 'os botões'}
    ]
  };
  const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  const parseTransform = text => [...(text || '').matchAll(/(\w+)\(([^)]*)\)/g)].reduce((m, [, fn, args]) => {
    const v = args.split(/[\s,]+/).filter(Boolean).map(Number), r = (v[0] || 0) * Math.PI / 180;
    const t = fn === 'translate' ? [1, 0, 0, 1, v[0], v[1] || 0] : fn === 'scale' ? [v[0], 0, 0, v[1] ?? v[0], 0, 0] : fn === 'matrix' ? v
      : [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), (v[1] || 0) - (v[1] || 0) * Math.cos(r) + (v[2] || 0) * Math.sin(r), (v[2] || 0) - (v[1] || 0) * Math.sin(r) - (v[2] || 0) * Math.cos(r)];
    return mul(m, t);
  }, [1, 0, 0, 1, 0, 0]);
  // os pontos de um caminho (só os comandos absolutos que hero-scenery.js escreve: M L Q C A Z), as curvas e os arcos amostrados
  const outline = d => {
    const tk = d.match(/[MLQCAZ]|-?\d*\.?\d+/g), pts = [];
    let i = 0, x = 0, y = 0, sx = 0, sy = 0;
    const num = () => +tk[i++];
    while (i < tk.length) {
      const c = tk[i++];
      if (c === 'M') { x = sx = num(); y = sy = num(); pts.push([x, y]); }
      else if (c === 'L') { x = num(); y = num(); pts.push([x, y]); }
      else if (c === 'Q' || c === 'C') {
        const v = Array.from({length: c === 'Q' ? 4 : 6}, num), [ex, ey] = v.slice(-2);
        for (let t = .1; t < 1.01; t += .1) {
          const u = 1 - t;
          pts.push(c === 'Q' ? [u * u * x + 2 * u * t * v[0] + t * t * ex, u * u * y + 2 * u * t * v[1] + t * t * ey] : [u ** 3 * x + 3 * u * u * t * v[0] + 3 * u * t * t * v[2] + t ** 3 * ex, u ** 3 * y + 3 * u * u * t * v[1] + 3 * u * t * t * v[3] + t ** 3 * ey]);
        }
        x = ex; y = ey;
      } else if (c === 'A') {
        const [r0, , , large, sweep, ex, ey] = Array.from({length: 7}, num), hx = (ex - x) / 2, hy = (ey - y) / 2, d2 = hx * hx + hy * hy, r = Math.max(r0, Math.sqrt(d2));
        const f = Math.sqrt(Math.max(0, r * r - d2) / (d2 || 1)) * (large === sweep ? -1 : 1), cx = x + hx - f * hy, cy = y + hy + f * hx;
        let a1 = Math.atan2(y - cy, x - cx), da = Math.atan2(ey - cy, ex - cx) - a1;
        if (sweep && da < 0) da += 2 * Math.PI; if (!sweep && da > 0) da -= 2 * Math.PI;
        for (let k = 1; k <= 12; k++) pts.push([cx + r * Math.cos(a1 + da * k / 12), cy + r * Math.sin(a1 + da * k / 12)]);
        x = ex; y = ey;
      } else if (c === 'Z') { x = sx; y = sy; }
    }
    return pts;
  };
  // os pontos de cada <span> da borda, na unidade da pilastra a partir da borda dele: [lado, tipo, [[x, y], …], profundidade] por arrumação
  const placed = (html, compact, m) => [...html.matchAll(/<span class="scenery-(edge|drift|spark) scn-([lr]) scn-(\w+)(?: scn-fade)?" style="([^"]+)"><svg viewBox="0 0 ([\d.]+) ([\d.]+)" focusable="false">(.*?)<\/svg>/g)].map(([, kind, side, depth, style, vw, , body]) => {
    const v = Object.fromEntries([...style.matchAll(/--(\w+):(-?[\d.]+)/g)].map(([, k, n]) => [k, +n])), [x0, y0, s] = compact ? [v.cx, v.cy, v.cs] : [v.x, v.y, v.s];
    const stack = [[1, 0, 0, 1, 0, 0]], pts = [], slack = kind === 'drift' ? 9 / (compact ? 1.08 : 1.535) : 0;
    for (const [, close, tag, attrs] of body.matchAll(/<(\/?)(g|path|ellipse|circle|defs|linearGradient|radialGradient|stop)\b([^>]*)>/g)) {
      if (tag === 'g') { if (close) stack.pop(); else if (!attrs.endsWith('/')) stack.push(mul(stack.at(-1), parseTransform((attrs.match(/transform="([^"]+)"/) || [])[1]))); continue; }
      if (close || !/^(path|ellipse|circle)$/.test(tag)) continue;
      const own = mul(stack.at(-1), parseTransform((attrs.match(/transform="([^"]+)"/) || [])[1])), a = name => +(attrs.match(new RegExp(` ${name}="(-?[\\d.]+)"`)) || [])[1];
      const local = tag === 'path' ? outline(attrs.match(/ d="([^"]+)"/)[1]) : Array.from({length: 16}, (_, k) => [a('cx') + (a('rx') || a('r')) * Math.cos(k * Math.PI / 8), a('cy') + (a('ry') || a('r')) * Math.sin(k * Math.PI / 8)]);
      const stroke = /stroke="/.test(attrs) ? (+(attrs.match(/stroke-width="([\d.]+)"/) || [])[1] || 3.4) / 2 : 0;
      for (const [px, py] of local) {
        const lx = own[0] * px + own[2] * py + own[4], ly = own[1] * px + own[3] * py + own[5];
        // o quadro do <svg> vai da esquerda para a direita; na direita, a borda é o lado direito dele (a silhueta já vem espelhada)
        const fromEdge = side === 'r' ? +vw - lx : lx;
        for (const [ex, ey] of [[-stroke - slack, 0], [stroke + slack, 0], [0, -stroke], [0, stroke]]) pts.push([x0 + (fromEdge + ex) * s * m, y0 + (ly + ey) * s * m]);
      }
    }
    return [side, kind, pts, depth];
  });
  // e em todo o caminho da rolagem (SCENERY_SCROLL: frações da altura da vitrine, que mede, em unidades da pilastra, de 556 a 666 no
  // celular e no tablet e de 401 a 493 no computador): com as silhuetas descendo 6% e 14% da vitrine, no meio da rolagem as
  // nuvenzinhas passavam por trás das setas
  const HERO_UNITS = {wide: [401, 493], compact: [556, 666]};
  for (const {key, html} of layers) for (const [layout, compact, scales] of [['wide', false, [1, .9]], ['compact', true, [1, .92]]]) for (const m of scales) {
    for (const [side, kind, pts, depth] of placed(html, compact, m)) for (const zone of KEEP_OUT[layout]) {
      if (zone.side !== 'all' && zone.side !== side || zone.scale && !zone.scale.includes(m)) continue;
      for (const units of HERO_UNITS[layout]) for (const p of [0, .25, .5, .75, 1]) {
        const dx = SCENERY_SCROLL[depth].x * units * p, dy = SCENERY_SCROLL[depth].y * units * p;
        const hit = pts.map(([x, y]) => [x - dx, y + dy]).find(([x, y]) => x > zone.x[0] && x < zone.x[1] && y > zone.y[0] && y < zone.y[1]);
        assert.ok(!hit, `${key} (${compact ? 'celular' : 'computador'}, escala ${m}${p ? `, ${p * 100}% da rolagem` : ''}): ${kind} da borda ${side === 'l' ? 'esquerda' : 'direita'} em cima de ${zone.what} (${hit && hit.map(n => n.toFixed(0))})`);
      }
    }
  }

  // ── a rolagem da página: cada parte do fundo na sua profundidade, só transform e opacity, recortada na vitrine ──
  assert.deepEqual(Object.keys(SCENERY_SCROLL).sort(), ['far', 'mid', 'near']);
  const {near, mid: midDepth, far} = SCENERY_SCROLL;
  // os cantos ficam embaixo das setas e dos botões: só afundam (subindo 10%, no computador as margaridas e as pegadas passavam por trás
  // das setas no meio da rolagem)
  assert.ok(near.y > 0 && near.x === 0 && near.fade < 1 && midDepth.y === 0 && far.y === 0 && midDepth.x > far.x && far.x > 0 && midDepth.fade < 1 && far.fade < 1, 'os cantos afundam um pouco e esmaecem; as bordas só se abrem para fora e esmaecem, e o que está longe se abre mais devagar');
  assert.ok(Object.values(SCENERY_SCROLL).every(d => Math.abs(d.y) <= .16 && d.x >= 0 && d.x <= .06 && d.fade >= .25 && d.fade < 1), 'de leve: no máximo 16% da altura da vitrine, 6% para fora');
  assert.deepEqual(sceneryScroll(0, {depth: 'far', side: 1}, 800), {x: 0, y: 0, opacity: 1});
  assert.deepEqual(sceneryScroll(1, {depth: 'far', side: -1}, 800), {x: -far.x * 800, y: far.y * 800, opacity: far.fade});
  assert.deepEqual(sceneryScroll(3, {depth: 'near'}, 800), sceneryScroll(1, {depth: 'near'}, 800), 'depois de a vitrine sair, nada mais anda');
  assert.deepEqual(sceneryScroll(-1, {depth: 'mid', side: 1}, 800), {x: 0, y: 0, opacity: 1}, 'o puxão para baixo no topo não anda');
  const half = sceneryScroll(.5, {depth: 'mid', side: 1}, 800), whole = sceneryScroll(1, {depth: 'mid', side: 1}, 800);
  assert.ok(Math.abs(half.y - whole.y / 2) < 1e-9 && Math.abs(half.x - whole.x / 2) < 1e-9 && Math.abs(half.opacity - (1 + whole.opacity) / 2) < 1e-9 && whole.x > 0, 'em linha reta (como o `linear` do CSS), para fora pelo lado');
  assert.deepEqual(sceneryScroll(.6, {depth: 'near', side: -1}, 800, {reduced: true}), {x: 0, y: 0, opacity: 1}, 'movimento reduzido: tudo no lugar');
  assert.ok(Object.is(sceneryScroll(.5, {depth: 'near', side: -1}, 800).x, 0), 'nunca -0');
  // o CSS e o laço do JavaScript com os mesmos números
  const depthVars = selector => Object.fromEntries(css.split(/\r?\n/).filter(line => line.startsWith(selector + ' {')).flatMap(line => [...line.matchAll(/--(s[xyf]):(-?[\d.]+)/g)].map(([, k, v]) => [k, +v])));
  assert.deepEqual(depthVars('.scenery-mist'), {sy: near.y, sf: near.fade}, 'os cantos');
  assert.deepEqual(depthVars('.scenery-back > .scn-mid'), {sy: midDepth.y, sx: midDepth.x, sf: midDepth.fade}, 'as silhuetas das bordas');
  assert.deepEqual(depthVars('.scenery-back > .scn-far'), {sy: far.y, sx: far.x, sf: far.fade}, 'o que está longe');
  assert.ok(css.includes('.scenery-back > .scn-l { --sd:-1; }') && css.includes('.scenery-back > .scn-r { --sd:1; }'), 'para fora: a esquerda para a esquerda, a direita para a direita');
  // só transform e opacity (no compositor), ligadas à rolagem só onde o navegador sabe e sem movimento reduzido
  assert.ok(/@keyframes scn-scroll \{ to \{ transform:translate3d\([^;]*var\(--sd[^;]*var\(--sx[^;]*var\(--hero-h[^;]*var\(--sy[^;]*\); opacity:var\(--sf, 1\); \} \}/.test(css), 'a rolagem: translate3d e opacity');
  const scrollAt = css.indexOf('@supports (animation-timeline: scroll()) {'), scrollBlock = css.slice(scrollAt, css.indexOf('\n}', scrollAt));
  assert.ok(scrollAt > 0 && /^@supports \(animation-timeline: scroll\(\)\) \{\r?\n  @media \(prefers-reduced-motion: no-preference\) \{/.test(scrollBlock), 'só onde o navegador liga a animação à rolagem, e sem movimento reduzido');
  assert.ok(scrollBlock.includes('.scenery-mist, .scenery-back > .scenery-edge { animation:scn-scroll linear both; animation-timeline:scroll(root block); animation-range:0px var(--hero-h, 720px); }'), 'cantos e bordas: do topo até a vitrine sair da tela');
  assert.ok(scrollBlock.includes('.scenery-back > .scenery-drift { animation:scn-drift var(--d, 20s) ease-in-out var(--dl, 0s) infinite alternate, scn-scroll linear both; animation-timeline:auto, scroll(root block); animation-range:normal, 0px var(--hero-h, 720px); }') && scrollBlock.includes('.scenery-back > .scenery-spark { animation:scn-twinkle var(--d, 6s) ease-in-out var(--dl, 0s) infinite, scn-lift linear both; animation-timeline:auto, scroll(root block); animation-range:normal, 0px var(--hero-h, 720px); }'), 'as nuvenzinhas e estrelinhas: o movimento delas e a rolagem (a estrelinha só anda; a opacidade é do cintilar)');
  assert.ok((css.match(/animation-timeline:/g) || []).length === 4 && (scrollBlock.match(/animation-timeline:/g) || []).length === 4, 'a rolagem só nesse bloco (a condição e as três regras)');
  assert.ok(css.includes('.hero-bg:is(.is-still, .is-moving, .is-scrolling) :is(.scenery-drift, .scenery-spark, .scenery-glint, .scenery-mist > span), .hero-layer.is-off :is(.scenery-drift, .scenery-spark, .scenery-glint, .scenery-mist > span) { animation-play-state:paused, running; }'), 'fora da tela, aba escondida, vitrine andando, página rolando ou camada apagada: o do ambiente para (a rolagem segue)');
  // rolando, só o que acompanha a rolagem anda (a cada quadro o navegador recalcula o estilo de tudo o que anima): o ambiente volta 200 ms depois
  assert.ok(js.includes("if (!onScreen || reduced.matches) return;") && js.includes("if (scrollRest) clearTimeout(scrollRest); else bgHost.classList.add('is-scrolling');") && /scrollRest = setTimeout\(\(\) => \{ scrollRest = 0; bgHost\.classList\.remove\('is-scrolling'\); \}, 200\);\r?\n  \}, \{passive: true\}\);/.test(js), 'o ambiente para enquanto a página rola (passivo, só com a vitrine na tela)');
  // recortado na vitrine: o fundo inteiro dentro da raiz, que tem a altura da vitrine e esconde o que passa dela; a base se dissolve
  assert.ok(css.includes('.hero-scenery { position:absolute; inset:0 0 auto; height:var(--hero-h); overflow:hidden; pointer-events:none; }'), 'recortado na altura da vitrine');
  assert.ok(/\.scenery-back \{ --u:calc\(var\(--scn-ped, 360px\) \/ 200 \* var\(--m-scale, 1\)\); --at:calc\(var\(--scn-ped, 360px\) \/ 200\); position:absolute; inset:0; will-change:translate; transform-origin:var\(--stage-x, 66%\) calc\(var\(--stage-top, 200px\) \+ 90 \* var\(--at\)\);[^}]*mask-image:linear-gradient\(#000 \d+%, transparent\); \}/.test(css), 'as bordas cobrem a vitrine, cada uma na própria camada do compositor; a câmera da demonstração vai até a peça; a base se dissolve');
  assert.ok(css.includes('.scenery-back > span { position:absolute; top:calc(var(--stage-top, 200px) + var(--y) * var(--at)); width:calc(var(--w) * var(--s, 1) * var(--u)); height:calc(var(--h) * var(--s, 1) * var(--u)); }') && css.includes('.scenery-back > .scn-l { left:calc(max(0px, (100% - 1560px) / 2) + var(--x) * var(--at)); }') && css.includes('.scenery-back > .scn-r { right:calc(max(0px, (100% - 1560px) / 2) + var(--x) * var(--at)); }'), 'cada silhueta presa à borda do seu lado (a do contêiner nas telas largas) e ao alto do palco');
  assert.ok(/@media \(max-width: 900px\) \{\r?\n  \.scenery-back > span \{ top:calc\(var\(--stage-top, 200px\) \+ var\(--cy\) \* var\(--at\)\); width:calc\(var\(--w\) \* var\(--cs, 1\) \* var\(--u\)\); height:calc\(var\(--h\) \* var\(--cs, 1\) \* var\(--u\)\); \}\r?\n  \.scenery-back > \.scn-l \{ left:calc\(var\(--cx\) \* var\(--at\)\); \}\r?\n  \.scenery-back > \.scn-r \{ right:calc\(var\(--cx\) \* var\(--at\)\); \}/.test(css), 'no celular e no tablet, a arrumação deles');
  // onde o navegador não liga animação à rolagem: o laço, só então, passivo, um quadro por vez, só transform e opacity e só o que mudou
  const followJs = js.slice(js.indexOf('const scrollLinked'), js.indexOf('function render()'));
  assert.ok(followJs.startsWith("const scrollLinked = !!window.CSS?.supports?.('animation-timeline: scroll()');") && followJs.includes("[...layer.querySelectorAll('.scenery-mist, .scenery-back > .scenery-edge')]"), 'o laço só onde falta a animação ligada à rolagem, nos mesmos elementos');
  assert.ok(followJs.includes("if (!scrollLinked) addEventListener('scroll', () => { scrollFrame ||= requestAnimationFrame(() => follow()); }, {passive: true});"), 'rolagem passiva, um quadro por vez');
  assert.ok(followJs.includes('const progress = reduced.matches ? 0 : clamp(scrollY / heroHeight, 0, 1);') && followJs.includes('if (progress === followed && !force) return;') && followJs.includes("if (layer.classList.contains('is-off')) return;") && followJs.includes('sceneryScroll(progress, item, heroHeight)'), 'só quando a posição muda, só nas camadas à vista; parado no movimento reduzido');
  assert.deepEqual([...followJs.matchAll(/put\(item\.el, '([a-z]+)'/g)].map(m => m[1]), ['transform', 'opacity'], 'só transform e opacity, escritos só quando mudam (put)');
  assert.ok(!/\.style\./.test(followJs), 'nada escrito fora do put');
  // na medida, o laço vem no quadro seguinte (catchUp): ler scrollY ali, depois das escritas, podia forçar o layout
  assert.ok(/heroHeight = height;\r?\n    catchUp\(\);/.test(js.slice(js.indexOf('function measure()'), js.indexOf('// Um estilo só é escrito quando muda'))) && js.includes("if (shown) catchUp(); }") && js.includes('report(); catchUp(); });') && js.includes('const catchUp = () => { if (!scrollLinked) { cancelAnimationFrame(scrollFrame); scrollFrame = requestAnimationFrame(() => follow(true)); } };'), 'acompanha a medida da vitrine, a camada que aparece e a troca do movimento reduzido, sempre no quadro seguinte');

  // regras do pedido no código: sem nome de produto, palco medido, e o laço de quadros barato (movimento 1): translate direto no desenho e
  // nos cantos, só nas camadas à vista; a camada apagada fora da pintura (content-visibility); estilos escritos só quando mudam; as cores
  // do tema, no meio da troca, só no header e nas setas (o banner inteiro e o rodapé recebem a cor final ao assentar)
  const sceneryJs = read('hero-scenery.js'), renderJs = js.slice(js.indexOf('function render()'), js.indexOf('function report('));
  const reportJs = js.slice(js.indexOf('function report('), js.indexOf('// ── Movimento'));
  assert.ok(!new RegExp(Object.keys(PRODUCTS).join('|'), 'i').test(js + sceneryJs), 'vitrine e desenhos sem nome de produto (o desenho vem de SHOWCASE)');
  assert.ok(js.includes("put(bgHost, '--stage-x'") && js.includes("put(bgHost, '--stage-top'") && js.includes("put(bgHost, '--scn-ped'"), 'o desenho se prende ao palco medido em qualquer tela');
  // 09/10/2026 (PageSpeed, computador): as quatro medidas vão para o fundo (.hero-bg), não para a .page: variável herdada escrita na .page
  // recalculava o estilo da página inteira (coleção, novidade, rodapé) a cada medida. Só o que está dentro do fundo as usa.
  assert.ok(!/put\(page,/.test(js), 'nada medido é escrito na .page');
  for (const name of ['--hero-h', '--stage-x', '--stage-top', '--scn-ped']) for (const file of fs.readdirSync(path.join(__dirname, '../dist')).filter(n => n.endsWith('.css') && n !== 'fenda.css')) {
    const sheet = read(file);
    for (const [, selector, body] of sheet.matchAll(/([^{}]*)\{([^{}]*)\}/g)) if (body.includes(`var(${name}`)) assert.ok(/\.hero-bg|\.hero-layer|\.hero-scenery|\.scenery-|^(to|from|\d+%)$/.test(selector.trim()), `${file}: ${name} usada fora do fundo (${selector.trim().slice(-80)})`);
  }
  // 08/10/2026 (PageSpeed): medir não força layout — todas as leituras antes das escritas, chamado pelo ResizeObserver, nunca na montagem
  const measureJs = js.slice(js.indexOf('function measure()'), js.indexOf('// Um estilo só é escrito quando muda'));
  assert.ok(measureJs.indexOf('getBoundingClientRect') < measureJs.indexOf('put(bgHost') && measureJs.indexOf('offsetHeight') < measureJs.indexOf('put(bgHost'), 'todas as leituras antes das escritas');
  assert.ok(js.includes("const sizes = new ResizeObserver(() => measure()); sizes.observe(shell); sizes.observe(slots[0]);") && js.includes('setActive(initial); render(); report();') && !/measure\(\); report\(\);/.test(js), 'a primeira medida vem do ResizeObserver, não da montagem');
  assert.ok(!/--scn-x/.test(js + css), 'sem a variável herdada --scn-x (cada escrita recalculava as seis camadas inteiras)');
  assert.ok(renderJs.includes("bgLayers[i].classList.toggle('is-off', !shown)") && renderJs.includes('if (!shown) continue;') && renderJs.includes("put(motifs[i], 'translate', `${Math.round(sceneryShift(d, travel, motion))}px 0`)") && renderJs.includes("put(edges[i], 'translate',"), 'camadas apagadas fora da pintura; na à vista, o desenho e os cantos acompanham a peça');
  assert.ok(/function put\(element, name, value\) \{[^]*?if \(seen\[name\] === value\) return;/.test(js) && !/\.style\.(setProperty|transform|opacity|visibility|zIndex)\b/.test(renderJs), 'no laço de quadros, nada é escrito sem mudar');
  assert.ok(js.includes("const live = [shell.querySelector('.site-header'), prevButton, nextButton].filter(Boolean);") && renderJs.includes('for (const element of live) for (const name in themeNow)') && !renderJs.includes('themed') && reportJs.includes('for (const element of themed) for (const name in themeNow)'), 'cores do tema: header e setas no meio da troca; banner e rodapé ao assentar');
  assert.ok(js.includes("<div class=\"hero-layer${i === initial ? '' : ' is-off'}\""), 'só a camada da abertura nasce na pintura');
  assert.ok(css.includes('.hero-bg .hero-layer.is-off { visibility:hidden; content-visibility:hidden; }'), 'a camada apagada sai da pintura (content-visibility)');
  // 09/10/2026 (PageSpeed, computador; a ideia da etapa 9a): só a camada da abertura nasce com o desenho; as outras ganham o dela depois
  // que a página aparece, uma por quadro e a mais perto primeiro, nunca no meio de uma troca, de um arraste ou da demonstração, ou na
  // hora em que vão aparecer (render); onde não há animation-timeline, os seguidores da rolagem de cada camada são lidos na primeira
  // vez que ela aparece
  assert.ok(js.includes('style="--stops:${theme.bannerStops};${lookVars(theme, look)}"></div>`).join(\'\');') && !/bgHost\.innerHTML = [^\n]*scenery\(/.test(js), 'as camadas nascem vazias: nenhum desenho na montagem do fundo');
  assert.ok(/function sketch\(i\) \{\r?\n    const layer = bgLayers\[i\];\r?\n    if \(layer\.firstElementChild\) return;\r?\n    layer\.innerHTML = scenery\(entries\[i\]\.look, i\);/.test(js) && js.includes('\n  sketch(initial);'), 'o desenho de cada camada uma vez só, e o da abertura já na montagem');
  assert.ok(renderJs.includes("if (shown) sketch(i); bgLayers[i].classList.toggle('is-off', !shown);"), 'a camada que vai aparecer ganha o desenho na hora, antes de entrar na pintura');
  const drawnJs = js.slice(js.indexOf('drawn.then(() => {'), js.indexOf('demoFromRoute();   // chegou'));
  assert.ok(drawnJs.indexOf('window.finishJuOpening?.();') >= 0 && drawnJs.indexOf('window.finishJuOpening?.();') < drawnJs.indexOf('sketchRest();'), 'as outras só depois que a página aparece');
  const restJs = js.slice(js.indexOf('async function sketchRest()'), js.indexOf('// ── Estado ativo'));
  assert.ok(/for \(;;\) \{\r?\n      await afterFrame\(\);\r?\n      if \(frame \|\| gesture \|\| locked\) continue;\r?\n      const rest = /.test(restJs) && restJs.includes('wrapDistance(b, active, total)') && (restJs.match(/sketch\(/g) || []).length === 1, 'uma camada por quadro (cada uma na sua tarefa), a mais perto primeiro, esperando a troca, o arraste ou a demonstração terminar');
  assert.ok(followJs.includes("followers[i] ||= [...layer.querySelectorAll('.scenery-mist, .scenery-back > .scenery-edge')].map(depthOf);") && !/bgLayers\.map\(layer => \[\.\.\.layer\.querySelectorAll/.test(js), 'sem animation-timeline: os seguidores de cada camada lidos quando ela aparece');
  assert.ok(/\.scenery-mist \{[^}]*will-change:translate;/.test(css), 'os cantos na própria camada do compositor (o transform da raiz é da demonstração)');
  assert.ok(/\.scenery-back \{[^}]*mask-image:/.test(css) && /\.scenery-mist \{[^}]*mask-image:/.test(css) && css.includes('.scenery-mist > span { position:absolute;') && !/\.hero-scenery svg \{/.test(css), 'bordas dissolvidas pela máscara; as silhuetas dos cantos não dimensionam o desenho');
  assert.ok(![...css.matchAll(/([^{}]+)\{[^}]*animation:scn-/g)].some(([, selector]) => /\bsvg\s*$/.test(selector.trim())), 'nenhuma animação do fundo num <svg> (só nos <span> em volta, que vão para o compositor)');
  // a dinâmica: as nuvenzinhas deslizam e os cantos balançam (só translate, voltas longas), duas estrelinhas por peça cintilam (só
  // opacity e scale) e, no arco-íris, um brilho gira pelas faixas (só transform e opacity); param fora da tela, com a aba escondida, com a
  // vitrine andando e na camada apagada; paradas no movimento reduzido
  const keyframes = Object.fromEntries([...css.matchAll(/@keyframes (scn-[a-z]+) \{([^]*?)\}\s*\}/g)].map(m => [m[1], m[2]]));
  assert.deepEqual(Object.keys(keyframes).sort(), ['scn-drift', 'scn-glint', 'scn-lift', 'scn-scroll', 'scn-sway', 'scn-twinkle']);
  assert.ok(['scn-drift', 'scn-sway'].every(name => (keyframes[name].match(/translate:/g) || []).length === 2 && !/transform|opacity|scale|left|top|width|height|margin/.test(keyframes[name].replace(/translate:/g, ''))), 'só translate no que desliza');
  assert.ok(/opacity:/.test(keyframes['scn-twinkle']) && /scale:/.test(keyframes['scn-twinkle']) && !/transform|translate|left|top|width|height|margin|filter/.test(keyframes['scn-twinkle']), 'só opacity e scale no que cintila');
  for (const name of ['scn-glint', 'scn-scroll', 'scn-lift']) assert.ok([...keyframes[name].matchAll(/([a-z-]+):/g)].every(([, prop]) => prop === 'transform' || prop === 'opacity') && /transform:/.test(keyframes[name]), `${name}: só transform e opacity`);
  assert.ok(!/opacity/.test(keyframes['scn-lift']), 'a estrelinha só anda com a rolagem (a opacidade é do cintilar)');
  assert.ok([...css.matchAll(/animation:scn-(drift|sway) (?:var\(--d, )?(\d+)s/g)].every(m => Number(m[2]) >= 10) && /animation:scn-twinkle var\(--d, [4-9]s\)/.test(css) && /animation:scn-glint (\d+)s/.test(css) && +css.match(/animation:scn-glint (\d+)s/)[1] >= 8, 'voltas longas (10 s ou mais; o brilho do arco-íris, 8 s ou mais; o das estrelinhas, alguns segundos)');
  for (const {key, html} of layers) assert.equal((html.match(/<span class="scenery-spark /g) || []).length, 2, key + ': duas estrelinhas que cintilam');
  assert.ok(js.includes("const moving = on => bgHost.classList.toggle('is-moving', on);") && /stop\(\); target = next; moving\(true\);/.test(js) && /gesture\.horizontal = true; stop\(\); moving\(true\);/.test(js) && reportJs.includes('moving(false);'), 'param no arraste e no assentar, e voltam quando a peça assenta');
  assert.ok(css.includes('.palette[inert] .palette-button::after { animation: none; }'), 'o brilho do botão só no da peça à vista');
  assert.ok(js.includes("const rest = () => bgHost.classList.toggle('is-still', document.hidden || !onScreen);") && /new IntersectionObserver\(\(\[entry\]\) => \{ onScreen = entry\.isIntersecting; rest\(\); \}\)\.observe\(shell\)/.test(js) && /visibilitychange', \(\) => \{\s*rest\(\);/.test(js), 'a vitrine avisa quando sai da tela e quando a aba se esconde');
  assert.ok(/@media \(prefers-reduced-motion: reduce\) \{\r?\n  \.scenery-drift, \.scenery-spark, \.scenery-glint, \.scenery-mist > span \{ animation:none; \}/.test(css) && /\.scenery-glint \{ position:absolute; opacity:0;/.test(css), 'movimento reduzido: o fundo parado (e o brilho do arco-íris apagado)');
  assert.ok(/@media \(min-width: 901px\) and \(max-width: 1100px\) \{\r?\n  \.scenery-back \{ --m-scale:/.test(css) && /@media \(max-width: 600px\) \{\r?\n  \.scenery-back \{ --m-scale:/.test(css), 'o tamanho do desenho acompanha a pilastra em cada tela');
  assert.ok(!/\[data-motif="[a-z]+"\] \.scn-/.test(css), 'sem a arrumação por desenho de antes: cada silhueta traz o lugar dela nas duas telas');

  console.log('carousel: ok');
})().catch(error => { console.error(error); process.exit(1); });
