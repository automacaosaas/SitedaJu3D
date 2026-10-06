// Demonstração na vitrine: quando o produto tem `demo` (products.js › SHOWCASE), um clique de verdade na peça
// transforma a própria vitrine numa apresentação — a interface sai, a peça se aproxima como numa câmera, o fundo
// acompanha, o equipamento sobe até se encaixar nela e uma ficha técnica mínima nomeia as duas partes.
// "Voltar" toca a mesma sequência ao contrário.
// Com `assemble` (products.js) o produto é montado em vez de encaixado: a peça se abre em duas metades, o equipamento sobe por entre elas e as
// metades se fecham em volta dele (peça de duas metades, como a de um avião com régua). Com `head`, uma segunda peça do equipamento desce por cima da
// peça depois que a base sobe (equipamento em duas partes).
//
// Camadas (de trás para frente): sombra projetada · peça, camada de trás (paredes internas da abertura) · sombra do
// equipamento nas paredes · equipamento (com o reflexo verde da peça) · sombra da peça sobre o equipamento · peça,
// camada da frente.
import {Timeline} from './motion-timeline.js';
import {withAlpha} from './hero-motion.js';
import {imageReady} from './loading-ui.js';
import {icon} from './icons.js';
import {artSrcset, DEMO_SIZES} from './products.js';

const PERSPECTIVE = 1600;
const CLOSE_RATE = 1.35;
const EASE = {
  exit: 'cubic-bezier(.4, 0, .2, 1)',
  camera: 'cubic-bezier(.16, .9, .24, 1)',
  turn: 'cubic-bezier(.45, 0, .3, 1)',
  soft: 'cubic-bezier(.65, 0, .35, 1)',
  rise: 'cubic-bezier(.3, .1, .2, 1)',
  settle: 'cubic-bezier(.45, 0, .55, 1)',
  out: 'cubic-bezier(.22, 1, .36, 1)'
};
const DROP_REST = 'translate3d(1%, 4%, 0) scale(.985)';
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const node = (tag, className, html = '') => { const el = document.createElement(tag); el.className = className; el.innerHTML = html; return el; };

// Linha fina com um ponto na âncora; coordenadas em milésimos do quadrado da peça (podem sair dele).
function callout({label}, layout, {points, align}) {
  const pts = points.map(([x, y]) => [Math.round(x * 1000), Math.round(y * 1000)]), [[ax, ay]] = pts, [x, y] = points.at(-1);
  return `<div class="demo-callout" data-layout="${layout}" data-align="${align}"><svg class="demo-callout-line" viewBox="0 0 1000 1000" preserveAspectRatio="none" focusable="false">`
    + `<path d="M${pts.map(p => p.join(' ')).join(' L')}"/><circle class="demo-callout-halo" cx="${ax}" cy="${ay}" r="10"/><circle class="demo-callout-dot" cx="${ax}" cy="${ay}" r="5"/></svg>`
    + `<span class="demo-callout-label" style="--x:${x};--y:${y}">${label}</span></div>`;
}

export function createHeroDemo({region, shell, entries, slots, bgLayers, status, reduced, onLock}) {
  const configs = entries.map(entry => entry.demo || null);
  const compact = matchMedia('(max-width: 900px)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const timeline = new Timeline();
  let dom = null, prepared = -1, index = -1, state = 'idle', calm = false, float = null, tilt = null;

  function build() {
    const image = className => `<img class="${className}" alt="" decoding="async" draggable="false">`;
    const backdrop = node('div', 'demo-backdrop', '<i class="demo-glow"></i>');
    const stage = node('div', 'hero-demo', '<div class="demo-rig"><div class="demo-tilt"><div class="demo-turn"><div class="demo-float">'
      + image('demo-drop') + image('demo-back')
      + '<div class="demo-cast">' + image('demo-cast-image') + '</div>'
      + '<div class="demo-tool"><img alt="" decoding="async" draggable="false"></div>'
      + '<div class="demo-head"><img alt="" decoding="async" draggable="false"></div>'
      + '<div class="demo-sleeve">' + image('demo-shade') + image('demo-cover') + '<div class="demo-sheen" aria-hidden="true"><i></i></div></div>'
      + '</div></div></div></div>');
    const controls = node('div', 'demo-controls', '<div class="demo-callouts" aria-hidden="true"></div>');
    const close = node('button', 'demo-close', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>');
    close.type = 'button';
    close.setAttribute('aria-label', 'Voltar à vitrine');
    const cta = node('a', 'palette-button demo-cta', icon('palette') + '<span>Personalizar o meu</span>');
    const atmosphere = node('div', 'demo-atmosphere', '<i class="demo-vignette"></i>');
    controls.append(close, cta);
    for (const el of [backdrop, stage, atmosphere]) el.setAttribute('aria-hidden', 'true');
    for (const el of [backdrop, stage, controls, atmosphere]) el.hidden = true;
    region.append(backdrop, stage, controls);
    shell.append(atmosphere);
    close.addEventListener('click', () => closeDemo());
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && state !== 'idle' && !document.querySelector('dialog[open]')) closeDemo(); });
    const q = selector => stage.querySelector(selector);
    return {backdrop, stage, controls, close, cta, atmosphere, glow: backdrop.firstElementChild, vignette: atmosphere.firstElementChild,
      callouts: controls.querySelector('.demo-callouts'), header: shell.querySelector('.site-header'),
      rig: q('.demo-rig'), tilt: q('.demo-tilt'), turn: q('.demo-turn'), float: q('.demo-float'), drop: q('.demo-drop'), back: q('.demo-back'),
      cast: q('.demo-cast'), castImage: q('.demo-cast-image'), tool: q('.demo-tool'), toolImage: q('.demo-tool img'),
      sleeve: q('.demo-sleeve'), shade: q('.demo-shade'), cover: q('.demo-cover'), sheen: q('.demo-sheen i'), head: q('.demo-head'), headImage: q('.demo-head img'), ready: null};
  }

  // Monta as camadas do produto e decodifica as imagens antes do clique (o equipamento nunca chega atrasado).
  function prepare(i) {
    const config = configs[i];
    if (!config) return null;
    dom ||= build();
    if (prepared !== i) {
      prepared = i;
      const {key, product} = entries[i], {tool, layers = {}, callouts = []} = config;
      const toolSrc = `assets/${tool.src}`, frontFile = layers.front || product.catalogImage || product.image, front = `assets/${frontFile}`;
      // 768 ou 1254 px conforme a tela (products.js): a peça aqui aparece 1,4 a 1,6 vez maior que na vitrine, então o
      // celular 2x e o computador 1x reaproveitam a de 768 da vitrine, e as telas 3x e retina pegam a de 1254, nítida.
      const frontSet = artSrcset(frontFile);
      // turn: peça fotografada levemente de lado → o equipamento gira igual (graus em Y; negativo = de frente para a esquerda),
      // fica um pouco mais para o lado de trás (shift), escurece do lado que se afasta e mostra a lateral do lado que se aproxima.
      const turn = tool.turn || 0, far = turn < 0 ? ['--tool-dim-l', '--tool-dim-r'] : ['--tool-dim-r', '--tool-dim-l'];
      const vars = {'--tool-w': tool.width, '--tool-top': tool.top, '--tool-ratio': tool.ratio, '--tool-fade-a': tool.fade[0], '--tool-fade-b': tool.fade[1], '--tool-src': `url("${toolSrc}")`,
        '--tool-turn': `${turn}deg`, '--tool-shift': tool.shift || 0, [far[0]]: turn ? Math.min(.45, Math.abs(turn) * .04) : 0, [far[1]]: 0, '--tool-side': `${-Math.sign(turn) * Math.min(2, Math.abs(turn) * .16)}px`,
        '--demo-core': withAlpha(config.glow, .95), '--demo-halo': withAlpha(config.halo, .3), '--demo-halo-soft': withAlpha(config.halo, .1), '--demo-accent': withAlpha(config.accent, .12),
        '--demo-bounce': withAlpha(config.halo, .85), '--demo-vignette': withAlpha(config.shade, .16), '--demo-zoom': config.zoom?.wide ?? config.zoom ?? 1, '--demo-zoom-compact': config.zoom?.compact ?? config.zoom?.wide ?? config.zoom ?? 1, '--front-src': `url("${front}")`,
        '--cy-shift': `${config.cy?.wide ?? 0}%`, '--cta-y-compact': config.ctaY?.compact ?? .78, '--cy-shift-compact': `${config.cy?.compact ?? config.cy?.wide ?? 0}%`,
        ...(config.head ? {'--head-w': config.head.width, '--head-top': config.head.top, '--head-ratio': config.head.ratio} : {})};
      // Camada de trás renderizada junto com a frente (depth 0) entra como veio; recortada de outra imagem (depth > 0) é
      // recuada, escurecida e mostrada só em volta da abertura para compensar a diferença.
      if (layers.back) Object.assign(vars, {'--back-src': `url("assets/${layers.back}")`, '--back-depth': layers.depth || 0, '--back-shift': layers.depth ? .004 : 0});
      dom.stage.dataset.back = !layers.back ? 'none' : layers.depth ? 'recessed' : 'rendered';
      dom.stage.toggleAttribute('data-turned', !!turn);
      // bounce: false — equipamento que já vem renderizado com a luz do estúdio (a régua): sem o reflexo colorido por cima, que lavaria o cabo preto
      dom.stage.toggleAttribute('data-plain-tool', tool.bounce === false);
      for (const host of [dom.stage, dom.backdrop, dom.controls, dom.atmosphere]) for (const name in vars) host.style.setProperty(name, vars[name]);
      for (const img of [dom.cover, dom.drop, dom.shade]) { img.sizes = frontSet ? DEMO_SIZES : ''; img.srcset = frontSet; img.src = front; }
      dom.back.hidden = dom.cast.hidden = !layers.back;
      if (layers.back) dom.back.src = `assets/${layers.back}`;
      dom.toolImage.src = dom.castImage.src = toolSrc;
      dom.head.hidden = !config.head;
      if (config.head) dom.headImage.src = `assets/${config.head.src}`;
      // novidade sem compra: o convite vira um aviso, sem link
      const soon = !!entries[i].soon;
      // novidade sem compra (cores fixas): o convite é para ver a peça em 3D, sem personalizar
      dom.cta.classList.toggle('is-soon', soon); dom.cta.querySelector('span').textContent = soon ? 'Ver em 3D' : 'Personalizar o meu';
      dom.cta.querySelector('svg')?.replaceWith(document.createRange().createContextualFragment(icon(soon ? 'cube' : 'palette')));
      dom.cta.href = soon ? `#produto/${key}/3d` : `#produto/${key}/personalizar`;
      dom.callouts.innerHTML = callouts.map(item => ['wide', 'compact'].filter(layout => item[layout]).map(layout => callout(item, layout, item[layout])).join('')).join('');
      const images = [dom.cover, dom.toolImage, ...(layers.back ? [dom.back] : []), ...(config.head ? [dom.headImage] : [])];
      dom.ready = Promise.all(images.map(img => imageReady(img, 6500))).then(results => results.every(Boolean));
    }
    return dom.ready;
  }

  function measure() {
    const slot = slots[index], source = slot.querySelector('.piece img'), config = configs[index];
    const piece = (source.hidden ? slot.querySelector('.piece') : source).getBoundingClientRect();
    const box = dom.stage.getBoundingClientRect(), size = dom.rig.offsetWidth || 1;
    const left = box.left + dom.rig.offsetLeft, top = box.top + dom.rig.offsetTop;
    return {slot, source, scenery: bgLayers[index]?.firstElementChild, compact: compact.matches, reduced: calm,
      s: piece.width / size || 1,
      dx: piece.left + piece.width / 2 - (left + size / 2),
      dy: piece.top + piece.height / 2 - (top + size / 2),
      toolY: box.bottom - (top + config.tool.top * size) + 24};
  }

  function tracks(g) {
    const d = dom, back = d.back.hidden ? null : d.back, cast = d.cast.hidden ? null : d.castImage;
    const ped = g.slot.querySelector('.ped'), contact = g.slot.querySelector('.piece-shadow');
    const copy = region.querySelector('.hero-copy'), palette = region.querySelector('.hero-palette');
    const arrows = [...region.querySelectorAll('.hero-arrow')], labels = [...d.callouts.children];
    if (g.reduced) {
      const fade = (el, delay, duration, from, to, extra = {}) => ({el, delay, duration, easing: 'ease', keyframes: [{opacity: from, ...extra}, {opacity: to, ...extra}]});
      return [
        fade(g.source, 0, 200, 1, 0), fade(copy, 0, 180, 1, 0), fade(palette, 0, 180, 1, 0), ...arrows.map(el => fade(el, 0, 180, 1, 0)),
        fade(ped, 0, 200, 1, 0), fade(contact, 0, 180, 1, 0), fade(g.scenery, 80, 260, 1, .3), fade(d.header, 80, 260, 1, .6),
        fade(d.glow, 80, 260, 0, 1), fade(d.vignette, 80, 260, 0, 1), fade(d.rig, 120, 240, 0, 1),
        fade(d.drop, 120, 240, 0, .16, {transform: DROP_REST}), fade(back, 120, 240, 1, 1), fade(d.shade, 120, 240, .56, .56), ...(configs[index].head ? [fade(d.head, 120, 240, 0, 1)] : []),
        fade(d.close, 180, 200, 0, 1), ...labels.map(el => fade(el, 300, 200, 0, 1)), fade(d.cta, 340, 200, 0, 1)
      ];
    }
    const depth = PERSPECTIVE * (1 / g.s - 1);
    // Tempos (ms) do que vem depois da câmera. Montagem: a peça se abre (0,52–0,98 s), o equipamento sobe (0,9–1,5 s) e as metades se fecham (1,34–1,79 s).
    const config = configs[index], asm = config.assemble || null;
    // encaixe simples · equipamento em duas partes (a cabeça desce depois que a base sobe) · montagem
    const T = asm ? {tool: 900, shade: 1660, labels: 2150, cta: 2260, glow: 2000, drop: 1900} : config.head ? {tool: 520, shade: 880, labels: 1650, cta: 1760, glow: 1700, drop: 1700, head: 1000} : {tool: 520, shade: 880, labels: 1120, cta: 1220, glow: 1220, drop: 1260};
    const assemble = () => {
      // cada metade quando aberta (vista explodida): z (px de perspectiva), x/y (% do quadrado) e giros em X/Y (graus); a da frente vem para perto, a de trás recua
      const at = ({z = 0, x = 0, y = 0, rx = 0, ry = 0} = {}) => `translate3d(${x}%, ${y}%, ${z}px) rotateX(${rx}deg) rotateY(${ry}deg)`;
      const drift = (to, k) => Object.fromEntries(Object.entries(to).map(([name, value]) => [name, value * k]));
      // abrem, seguem se afastando um pouco enquanto a régua sobe (nada fica parado), fecham acelerando (o ímã puxa), batem (over: px além do ponto) e assentam
      const shell = (to, over) => [
        {offset: 0, transform: at(), easing: EASE.out}, {offset: .3, transform: at(to), easing: 'linear'}, {offset: .6, transform: at(drift(to, 1.06)), easing: 'cubic-bezier(.5, 0, .8, .4)'},
        {offset: .9, transform: at(), easing: EASE.out}, {offset: .95, transform: at({z: over}), easing: EASE.settle}, {offset: 1, transform: at()}];
      return [
        {el: d.sleeve, delay: 520, duration: 1360, keyframes: shell(asm.open, -5)},
        {el: back, delay: 520, duration: 1360, keyframes: shell(asm.apart, 5)},
        // o estalo dos ímãs: as duas metades incham um fio e voltam (scale é outra propriedade: não briga com o transform acima nem com a inclinação)
        ...[d.sleeve, back].map(el => ({el, delay: 1735, duration: 320, easing: EASE.settle, keyframes: [{scale: '1'}, {offset: .3, scale: '1.007'}, {scale: '1'}]})),
        // no estalo, um brilho atravessa a frente (sobreposição das camadas)
        {el: d.sheen, delay: 1790, duration: 760, easing: EASE.soft, keyframes: [{offset: 0, opacity: 0, transform: 'translateX(-130%) skewX(-16deg)'}, {offset: .15, opacity: 1}, {offset: .85, opacity: 1}, {offset: 1, opacity: 0, transform: 'translateX(330%) skewX(-16deg)'}]}
      ];
    };
    const camera = (x, y, z) => `perspective(${PERSPECTIVE}px) translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${z.toFixed(2)}px)`;
    const [copyAway, paletteAway] = g.compact ? ['0, -12px', '0, 12px'] : ['-18px, 0', '18px, 0'];
    const leave = away => [{opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)', filter: 'blur(0px)'}, {opacity: 0, transform: `translate3d(${away}, 0) scale(.985)`, filter: 'blur(2px)'}];
    const rise = [
      {offset: 0, opacity: 0, transform: `translate3d(0, ${g.toolY.toFixed(1)}px, 0)`, easing: EASE.rise},
      {offset: .03, opacity: 1},
      {offset: .78, transform: 'translate3d(0, -3px, 0)', easing: EASE.settle},
      {offset: .9, transform: 'translate3d(0, 1px, 0)', easing: EASE.settle},
      {offset: 1, transform: 'translate3d(0, 0, 0)'}];
    const give = [
      {offset: 0, transform: 'translate3d(0, 0, 0)', easing: EASE.out},
      {offset: .32, transform: 'translate3d(0, -1.5px, 0)', easing: EASE.settle},
      {offset: .68, transform: 'translate3d(0, .4px, 0)', easing: EASE.settle},
      {offset: 1, transform: 'translate3d(0, 0, 0)'}];
    return [
      ...(asm ? assemble() : []),
      // 1 · 0–0,35 s — a peça da pilastra dá lugar à da demonstração no mesmo lugar; interface e header recuam
      {el: g.source, duration: 1, keyframes: [{visibility: 'hidden'}, {visibility: 'hidden'}]},
      {el: copy, duration: 260, easing: EASE.exit, keyframes: leave(copyAway)},
      {el: palette, delay: 20, duration: 260, easing: EASE.exit, keyframes: leave(paletteAway)},
      ...arrows.map(el => ({el, duration: 240, easing: EASE.exit, keyframes: [{opacity: 1, transform: 'scale(1)'}, {opacity: 0, transform: 'scale(.9)'}]})),
      {el: contact, duration: 200, easing: EASE.exit, keyframes: [{opacity: 1, transform: 'scale(1)'}, {opacity: 0, transform: 'scale(1.25)'}]},
      {el: ped, delay: 30, duration: 320, easing: EASE.exit, keyframes: [{opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)'}, {opacity: 0, transform: 'translate3d(0, 5%, 0) scale(.965)'}]},
      {el: d.header, duration: 320, easing: EASE.soft, keyframes: [{opacity: 1}, {opacity: .6}]},
      // 2 · 0,04–0,6 s — câmera: a peça vem da profundidade até o centro, girando poucos graus para revelar volume;
      //     a abertura ganha profundidade (paredes internas) enquanto ela chega
      {el: d.rig, delay: 40, duration: 560, easing: EASE.camera, keyframes: [{transform: camera(g.dx / g.s, g.dy / g.s, -depth)}, {transform: camera(0, 0, 0)}]},
      {el: d.turn, delay: 40, duration: 600, easing: EASE.turn, keyframes: [
        {transform: 'perspective(1100px) rotateX(0deg) rotateY(0deg)'},
        {offset: .45, transform: 'perspective(1100px) rotateX(2.5deg) rotateY(-3deg)'},
        {transform: 'perspective(1100px) rotateX(0deg) rotateY(0deg)'}]},
      {el: back, delay: asm ? 0 : 80, duration: asm ? 140 : 400, easing: EASE.soft, keyframes: [{opacity: 0}, {opacity: 1}]},
      {el: d.drop, delay: 40, duration: T.drop, keyframes: [
        {offset: 0, opacity: 0, transform: 'translate3d(0, 0, 0) scale(.92)', easing: EASE.out},
        {offset: .42, opacity: .12, transform: 'translate3d(.8%, 3.4%, 0) scale(.98)', easing: EASE.soft},
        {offset: .78, opacity: .12, transform: 'translate3d(.8%, 3.4%, 0) scale(.98)', easing: EASE.soft},
        {offset: 1, opacity: .16, transform: DROP_REST}]},
      // 3 · o fundo acompanha: luz macia atrás do encaixe, cenário recua, vinheta discreta
      {el: g.scenery, delay: 60, duration: 460, easing: EASE.soft, keyframes: [{opacity: 1, transform: 'translate3d(0, 0, 0)'}, {opacity: .3, transform: 'translate3d(0, 12px, 0)'}]},
      {el: d.vignette, delay: 80, duration: 460, easing: EASE.soft, keyframes: [{opacity: 0}, {opacity: 1}]},
      {el: d.glow, delay: 80, duration: T.glow, keyframes: [
        {offset: 0, opacity: 0, transform: 'scale(.85)', easing: EASE.soft},
        {offset: .38, opacity: .85, transform: 'scale(1)', easing: EASE.soft},
        {offset: .8, opacity: .85, transform: 'scale(1)', easing: EASE.soft},
        {offset: 1, opacity: 1, transform: 'scale(1.02)'}]},
      {el: d.close, delay: 360, duration: 260, easing: EASE.out, keyframes: [{opacity: 0, scale: '.9'}, {opacity: 1, scale: '1'}]},
      // 4 · 0,52–1,12 s — o equipamento sobe por dentro da peça, passa 3 px do ponto, volta 1 px e assenta; ele projeta
      //     sombra nas paredes internas, a peça projeta sombra nele e, no contato, cede um pouco
      {el: d.tool, delay: T.tool, duration: 600, keyframes: rise},
      // a cabeça do equipamento desce por cima, encaixa o pino e assenta (1,0–1,56 s)
      ...(config.head ? [{el: d.head, delay: T.head, duration: 560, keyframes: g.closing ? [
        // na volta (a linha do tempo toca de trás para frente, lida de baixo para cima): a cabeça solta do pino com um leve
        // tranco para cima, sobe acelerando, ainda inteira, e só se dissolve quando já saiu de cima da peça
        {offset: 0, opacity: 0, transform: 'translate3d(0, -66%, 0)'}, {offset: .2, opacity: 1, transform: 'translate3d(0, -50%, 0)', easing: 'cubic-bezier(.2, .7, .3, 1)'},
        {offset: .84, transform: 'translate3d(0, -3%, 0)', easing: EASE.settle}, {offset: 1, opacity: 1, transform: 'translate3d(0, 0, 0)'}]
        : [{offset: 0, opacity: 0, transform: 'translate3d(0, -22%, 0)', easing: EASE.out}, {offset: .3, opacity: 1}, {offset: .8, transform: 'translate3d(0, 1.4%, 0)', easing: EASE.settle}, {offset: .92, transform: 'translate3d(0, -.4%, 0)', easing: EASE.settle}, {offset: 1, opacity: 1, transform: 'translate3d(0, 0, 0)'}]}] : []),
      {el: cast, delay: T.tool, duration: 600, keyframes: rise},
      {el: d.shade, delay: T.shade, duration: 300, keyframes: [
        {offset: 0, opacity: 0, easing: EASE.soft},
        {offset: .45, opacity: .66, easing: EASE.settle},
        {offset: 1, opacity: .56}]},
      ...(asm ? [] : [{el: d.sleeve, delay: 970, duration: 240, keyframes: give}, {el: back, delay: 970, duration: 240, keyframes: give}]),   // na montagem o assentar já está nas metades
      // 5 · 1,12–1,56 s — estabilizado: a ficha técnica nomeia as partes e, logo depois, o convite
      ...labels.map((el, i) => ({el, delay: T.labels + Math.floor(i / 2) * 60, duration: 300, easing: EASE.out,
        keyframes: [{opacity: 0, translate: el.dataset.align === 'below' ? '0 -6px' : '8px 0'}, {opacity: 1, translate: '0 0'}]})),
      {el: d.cta, delay: T.cta, duration: 340, easing: EASE.out, keyframes: [{opacity: 0, translate: '0 10px', filter: 'blur(3px)'}, {opacity: 1, translate: '0 0', filter: 'blur(0px)'}]}
    ];
  }

  function show(on) {
    for (const el of [dom.backdrop, dom.stage, dom.controls, dom.atmosphere]) el.hidden = !on;
    region.classList.toggle('is-demo', on);
    for (const el of region.querySelectorAll('.hero-copy, .hero-stage, .hero-palette, .hero-arrow')) el.inert = on;
  }

  async function open(i) {
    if (state === 'opening' || state === 'open') return;
    if (state === 'closing') { timeline.load(tracks(measure()), timeline.time); run('opening'); return; }   // reaberta no meio da saída: volta com a entrada normal
    const ready = prepare(i);
    if (!ready) return;
    index = i; calm = reduced.matches; state = 'opening'; onLock(true);
    region.setAttribute('aria-busy', 'true');
    const loaded = await ready;
    region.removeAttribute('aria-busy');
    if (state !== 'opening') return;
    if (!loaded) { prepared = -1; finish(); status.textContent = 'Não foi possível carregar a demonstração. Tente novamente.'; return; }
    show(true);
    timeline.load(tracks(measure()));
    run('opening');
    dom.close.focus({preventScroll: true});
  }

  function run(next) {
    state = next;
    if (next === 'opening') timeline.play(1).then(done => { if (done && state === 'opening') settle(); });
    else timeline.play(-CLOSE_RATE).then(done => { if (done && state === 'closing') finish(); });
  }

  function settle() {
    state = 'open';
    status.textContent = configs[index].message || '';
    if (calm || !finePointer.matches) return;
    float = dom.float.animate([
      {transform: 'perspective(1100px) translate3d(0, 0, 0) rotateX(0deg) rotateY(0deg)'},
      {transform: 'perspective(1100px) translate3d(0, -3px, 0) rotateX(.5deg) rotateY(-.45deg)'}
    ], {duration: 4200, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out'});
    (tilt ||= createTilt()).start();
  }

  function stopIdle(immediate) {
    if (float) {
      const from = getComputedStyle(dom.float).transform;
      float.cancel(); float = null;
      if (!immediate && from !== 'none') dom.float.animate([{transform: from}, {transform: 'none'}], {duration: 220, easing: EASE.out});
    }
    tilt?.stop(immediate);
  }

  function closeDemo({immediate = false} = {}) {
    if (state === 'idle' || (state === 'closing' && !immediate)) return;
    if (immediate || !timeline.animations.length || timeline.time <= 0) { finish(); return; }
    const time = timeline.time;
    stopIdle(false);
    timeline.load(tracks({...measure(), closing: true}), time);   // saída própria onde precisa (closing); medidas novas: a janela pode ter mudado de tamanho enquanto estava aberta
    run('closing');
  }

  function finish() {
    const hadFocus = dom?.controls.contains(document.activeElement);
    stopIdle(true);
    timeline.cancel();
    if (dom) show(false);
    state = 'idle';
    onLock(false);
    if (hadFocus) slots[index]?.focus({preventScroll: true});
  }

  // Desktop, depois da montagem: o conjunto inclina até 2° seguindo o cursor; camadas mais próximas deslocam mais.
  function createTilt() {
    const target = {x: 0, y: 0}, now = {x: 0, y: 0};
    const layers = [[dom.sleeve, 2.4, 1.6], [dom.head, 1.8, 1.1], [dom.tool, 1, .6], [dom.cast, .5, .3], [dom.back, .5, .3], [dom.drop, -6, -4]];
    let frame = 0, listening = false;
    const clear = () => { dom.tilt.style.transform = ''; for (const [el] of layers) el.style.translate = ''; };
    function draw() {
      now.x += (target.x - now.x) * .08; now.y += (target.y - now.y) * .08;
      dom.tilt.style.transform = `perspective(1400px) rotateX(${(-now.y * 2).toFixed(3)}deg) rotateY(${(now.x * 2).toFixed(3)}deg)`;
      for (const [el, kx, ky] of layers) el.style.translate = `${(now.x * kx).toFixed(2)}px ${(now.y * ky).toFixed(2)}px`;
      const moving = Math.abs(target.x - now.x) + Math.abs(target.y - now.y) > .002;
      frame = moving ? requestAnimationFrame(draw) : 0;
      if (!moving && !listening) clear();
    }
    const kick = () => { frame ||= requestAnimationFrame(draw); };
    const move = e => {
      if (e.pointerType !== 'mouse') return;
      const box = dom.stage.getBoundingClientRect(), size = dom.rig.offsetWidth;
      const cx = box.left + dom.rig.offsetLeft + size / 2, cy = box.top + dom.rig.offsetTop + size / 2;
      target.x = clamp((e.clientX - cx) / (box.width / 2), -1, 1);
      target.y = clamp((e.clientY - cy) / (box.height / 2), -1, 1);
      kick();
    };
    const leave = () => { target.x = target.y = 0; kick(); };
    return {
      start() { if (listening) return; listening = true; region.addEventListener('pointermove', move); region.addEventListener('pointerleave', leave); },
      stop(immediate) {
        listening = false; target.x = target.y = 0;
        region.removeEventListener('pointermove', move); region.removeEventListener('pointerleave', leave);
        if (!immediate) { kick(); return; }
        cancelAnimationFrame(frame); frame = 0; now.x = now.y = 0; clear();
      }
    };
  }

  return {has: i => !!configs[i], prepare, open, close: closeDemo};
}
