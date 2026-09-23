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

  // ── tempo e curva ───────────────────────────────────────────────────────────────
  assert.ok(FULL_DURATION >= 600 && FULL_DURATION <= 900, 'transição completa entre 600 e 900 ms');
  assert.equal(settleDuration(1), FULL_DURATION);
  assert.equal(settleDuration(1, {reduced: true}), 320);
  assert.ok(settleDuration(5) <= 1100 && settleDuration(0) >= 320);
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
  const {PRODUCTS, PRODUCT_CATEGORIES, PALETTE, SHOWCASE, DEFAULT_SHOWCASE, showcase, originalColors} = data;
  assert.ok(Object.keys(SHOWCASE).every(key => PRODUCTS[key]), 'SHOWCASE só descreve produtos que existem');
  const tokens = ['bannerStops', 'headerBackground', 'textColor', 'mutedColor', 'accentColor'];
  for (const key of Object.keys(PRODUCTS)) {
    const {art, theme} = showcase(key), p = PRODUCTS[key];
    assert.ok(PRODUCT_CATEGORIES[p.category]?.label, `${key}: categoria real cadastrada`);
    assert.ok(fs.existsSync(dist('assets/' + (p.catalogImage || p.image))), `${key}: imagem original existe`);
    for (const field of ['h', 'bottom', 'foot']) assert.ok(art[field] > 0 && art[field] <= 1, `${key}: art.${field}`);
    assert.ok(art.h + art.bottom <= 1, `${key}: recorte cabe no quadrado`);
    for (const token of tokens) assert.ok(theme[token], `${key}: theme.${token}`);
    // cores mostradas = cores de fábrica de cada parte, sem repetir
    const shown = originalColors(key), expected = [...new Set(p.parts.map(part => part.default))];
    assert.deepEqual(shown.map(c => c.id), expected, `${key}: paleta = padrão das partes`);
    assert.ok(shown.every(c => PALETTE.some(x => x.id === c.id && /^#[0-9a-f]{6}$/i.test(c.hex))));
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
  assert.ok(/\.clouds \{[^}]*mask-image/.test(css), 'as nuvens esmaecem antes do limite do banner');
  assert.ok(js.includes("page.style.setProperty('--hero-h'"), 'altura do banner medida no JS');
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
  assert.ok(/product-rail-card\[data-product-id=/.test(js) && !/product-rail/.test(js.replace(/\.product-rail-card\[data-product-id="[^"]*"\]/g, '')), 'o JS só localiza o card do produto para levar até ele');
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

  // ── "Escolha sua cor" (botão), seta pulsante e ida ao card ──────────────────────
  assert.ok(js.includes('data-go-card') && js.includes('function goToCard'), 'o botão leva ao card do produto ativo');
  assert.ok(!/hero-cue|data-hero-cue|cue-ring|cue-bounce/.test(html + js + css), 'sem a seta separada');
  assert.ok(/\.palette-button \{[^}]*background: var\(--accent\)/.test(css), 'botão na cor do tema, trocando com o produto');
  assert.ok(/\.home \.catalog-home \.product-customize, \.home \.catalog-home \.product-cart \{[^}]*background: var\(--theme-accent, var\(--rose\)\)/.test(css), 'Personalize o seu e carrinho do card seguem a cor do banner');
  assert.ok(/\.home \.catalog-home \.product-customize:hover, \.home \.catalog-home \.product-cart:hover \{[^}]*var\(--theme-accent-strong/.test(css), 'e escurecem no hover na mesma família de cor');
  for (const name of ['chevron-nudge', 'cta-pulse']) assert.ok(css.includes('@keyframes ' + name), 'animação ' + name);
  assert.ok(css.includes('.palette-button svg { animation: none; }') && /\.home \.product-customize\.is-pulsing \{ animation: none; outline/.test(css), 'movimento reduzido: sem pulsar, com destaque estático');
  // A seta dentro do botão pulsa sem exagero (poucos pixels) e vale para desktop e mobile (regra base, sem media query).
  const nudge = css.match(/@keyframes chevron-nudge \{([^}]*\}[^}]*)\}/)[1], shifts = [...nudge.matchAll(/translateY\((-?[\d.]+)px\)/g)].map(m => Number(m[1]));
  assert.ok(shifts.length === 2 && Math.max(...shifts.map(Math.abs)) <= 3 && Math.max(...shifts) - Math.min(...shifts) <= 5, 'pulsar de leve (≤ 5 px de curso)');
  assert.ok(/^\.palette-button svg \{ animation: chevron-nudge/m.test(css), 'a animação vale para desktop e mobile');
  assert.ok(/\.hero-palette \{[^}]*margin-top: clamp\(20px, 6vw, 34px\)/.test(css), 'no celular o botão desceu um pouco');
  assert.ok(/\['pointerenter', 'focus', 'click', 'animationend'\]/.test(js), 'a pulsação para quando a pessoa interage');
  for (const key of Object.keys(PRODUCTS)) {
    const {accentColor} = showcase(key).theme;
    assert.ok(contrast('#ffffff', accentColor) >= 4.5, key + ': texto branco sobre o botão (' + contrast('#ffffff', accentColor).toFixed(2) + ')');
    assert.ok(contrast('#ffffff', mixColor(accentColor, '#000000', .2)) >= 4.5, key + ': texto branco sobre o botão no hover');
  }

  // ── categoria, valor, pontinhos e topo do card central no tema ─────────────────
  assert.ok(/\.home \.product-rail-category, \.home \.product-rail-active-details strong \{ color: var\(--theme-accent, var\(--rose\)\)/.test(css), 'categoria e valor "Categoria" seguem o tema');
  assert.ok(css.includes('.home .product-carousel-dots button::after { background: var(--theme-soft') && css.includes('.home .product-carousel-dots button[aria-selected=true]::after { background: var(--theme-accent'), 'pontinhos seguem o tema (o alvo de toque de 44 px não muda)');
  assert.ok(/\.home \.product-rail-card\.is-active \{[^}]*border-color: var\(--theme-soft[^}]*var\(--theme-glow/.test(css) && /\.home \.product-rail-card\.is-active \.product-rail-art \{ background: linear-gradient\(to bottom, var\(--theme-wash/.test(css), 'o topo do card central se conecta ao degradê do tema');
  assert.ok(js.includes("'--theme-soft'") && js.includes("'--theme-wash'"), 'as duas cores novas são calculadas a cada quadro');
  const desktopCards = css.match(/@media \(min-width: 901px\) \{\r?\n  \.home \.product-carousel-stage \{ height: (\d+)px; \}[\s\S]*?\r?\n\}/);
  assert.ok(desktopCards && Number(desktopCards[1]) <= 540 && /\.home \.product-rail-card\.is-active \{ width: min\(352px/.test(desktopCards[0]), 'no desktop os cards ficam menores (só na home)');
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

  console.log('carousel: ok');
})().catch(error => { console.error(error); process.exit(1); });
