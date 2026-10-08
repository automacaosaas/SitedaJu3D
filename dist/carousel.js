// Vitrine principal: um produto por vez, apoiado na pilastra, com fundo e header temáticos.
// Um único valor contínuo (`position`) comanda produto+pilastra, textos, paleta, fundo e header.
import {PRODUCTS, SOON, PRODUCT_CATEGORIES, ALIASES, showcase, artSrcset, HERO_SIZES, fixedColors} from './products.js';
import {scenery} from './hero-scenery.js';
import {imageReady} from './loading-ui.js';
import {EASE, cubicBezier, clamp, mod, wrapDistance, pose, textPose, layerMix, mixColor, withAlpha, swipeTarget, settleDuration, journeyColors, sceneryVars, sceneryShift, sceneryScroll, SCENERY_EDGE} from './hero-motion.js';
import {createHeroDemo} from './hero-demo.js';
import {COMMERCE, money} from './commerce-config.js';
import {icon} from './icons.js';

const region = document.querySelector('.showcase');
const shell = region?.closest('.hero-shell');
// A vitrine avisa a coleção logo abaixo (catalog.js) por este evento quando muda de peça, e os cards vêm junto. O contrário não vale
// (07/10/2026, pedido da dona: "ao mudar essa sessão dos produtos, não mudar a vitrine"): mexer nos cards ou abrir uma peça por eles não
// move a vitrine; só a demonstração (#produto/<peça>/encaixe) a traz até a peça.
const FOCUS = 'ju:product-focus';
if (region && shell) init();

function init() {
  const keys = [...Object.keys(PRODUCTS), ...Object.keys(SOON)], total = keys.length;   // as novidades (SOON) vêm depois: só vitrine, sem compra
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const easeOut = cubicBezier(...EASE);
  const status = region.querySelector('#gallery-status');
  // Abaixo do banner só o rodapé segue o tema da vitrine. A seção dos produtos tem o tema do card do centro (catalog.js).
  const themed = [shell, document.querySelector('.home footer')].filter(Boolean);
  // O fundo de tema cobre a página inteira; --hero-h (altura do banner) fica na .page, ancestral comum.
  const page = shell.closest('.page'), bgHost = document.querySelector('[data-hero-bg]');
  const prevButton = region.querySelector('.hero-prev'), nextButton = region.querySelector('.hero-next');
  const TEXT_SHIFT = 36, TEXT_DROP = 10;
  const lower = text => text.charAt(0).toLowerCase() + text.slice(1);
  const themeVars = theme => `--text:${theme.textColor};--muted:${theme.mutedColor};--accent:${theme.accentColor};--strong:${mixColor(theme.accentColor, '#000000', .2)};--glow:${withAlpha(theme.accentColor, .32)}`;
  const entries = keys.map(key => {
    const product = PRODUCTS[key] || SOON[key], soon = !PRODUCTS[key], {art, theme, scenery: look, demo} = showcase(key);
    // colors: o que a peça empresta às outras páginas (journey.js); wash: o tom claro do card ativo do catálogo e do fundo.
    const colors = journeyColors(theme), wash = colors['--theme-wash'];
    return {key, product, art, theme, look, demo, colors, wash, soon, price: soon ? 0 : COMMERCE.prices[key], category: PRODUCT_CATEGORIES[product.category]?.label || product.category};
  });

  let position = 0, target = 0, active = -1, frame = 0, gesture = null, suppressUntil = 0, locked = false, shared = '';
  let travel = 600, rise = 12;
  // a primeira medida da vitrine (measure(), pelo ResizeObserver): a página só aparece depois dela
  let measured;
  const firstMeasure = new Promise(resolve => { measured = resolve; });

  function fromHash() {
    const raw = location.hash.replace('#produto/', '').split('/')[0], index = keys.indexOf(ALIASES[raw] || raw);
    return index;
  }
  const initial = Math.max(0, fromHash() >= 0 ? fromHash() : keys.indexOf(window.juTheme?.product()));

  // ── Estrutura ────────────────────────────────────────────────────────────────
  // Cada camada de fundo: o degradê do tema e o desenho da peça (hero-scenery.js), com as cores dela já clareadas (sceneryVars).
  const lookVars = (theme, look) => Object.entries(sceneryVars(theme, look)).map(([name, value]) => `${name}:${value}`).join(';');
  // Só a camada da peça de abertura entra na pintura; as outras nascem fora dela (.is-off) até a vez delas.
  bgHost.innerHTML = entries.map(({theme, look}, i) => `<div class="hero-layer${i === initial ? '' : ' is-off'}" style="--stops:${theme.bannerStops};${lookVars(theme, look)}">${scenery(look, i)}</div>`).join('');
  shell.querySelector('[data-hero-band]').innerHTML = entries.map(({theme}) => `<div class="hero-layer" style="background:${theme.headerBackground}"></div>`).join('');
  region.querySelector('[data-hero-copy]').innerHTML = entries.map(({product, category, theme, price, soon}) =>
    `<div class="copy" style="${themeVars(theme)}"><p class="copy-category">${category}</p><h2 class="copy-name">${product.title}</h2><p class="copy-sub">${product.subtitle}</p>${price ? `<p class="copy-price"><strong>${money(price)}</strong><span class="copy-pix">5% off no Pix</span></p>` : soon ? '<p class="copy-price"><span class="palette-soon">Novidade · em breve</span></p>' : ''}</div>`).join('');
  // Banner limpo: uma ação principal (abre o configurador do produto ativo) e, nas peças com demonstração,
  // uma secundária que mostra a peça encaixada no equipamento. O nome do produto completa o rótulo para leitores de tela.
  // Novidade (SOON): sem configurador nem preço; no lugar da ação principal, um selo "Novidade · em breve". Peça de cores fixas (as
  // lâmpadas): nada para personalizar — a ação principal é Comprar, que abre a peça na foto, com o preço e a compra.
  region.querySelector('[data-hero-palette]').innerHTML = entries.map(({key, product, theme, demo, soon}) =>
    `<div class="palette" style="${themeVars(theme)}">${soon ? `<a class="palette-button" href="#produto/${key}/3d" data-role="palette">${icon('cube')}<span>Ver em 3D</span><span class="palette-go" aria-hidden="true">${icon('arrow')}</span><span class="sr-only"> ${product.title}</span></a>` : fixedColors(key) ? `<a class="palette-button" href="#produto/${key}" data-role="palette">${icon('cart')}<span>Comprar</span><span class="palette-go" aria-hidden="true">${icon('arrow')}</span><span class="sr-only"> ${product.title}</span></a>` : `<a class="palette-button" href="#produto/${key}/personalizar" data-role="palette">${icon('palette')}<span>Personalizar o meu</span><span class="palette-go" aria-hidden="true">${icon('arrow')}</span><span class="sr-only"> ${product.title}</span></a>`}${demo ? `<button class="hero-demo-button" type="button" data-demo-open>${icon('eye')}<span>Ver encaixado</span><span class="sr-only"> ${product.title}</span></button>` : ''}</div>`).join('');
  region.querySelector('[data-hero-stage]').innerHTML = entries.map(({key, product, art}, i) => {
    const first = i === initial, src = `assets/${product.catalogImage || product.image}`;
    // 768 ou 1254 px conforme a tela (products.js). Só a peça da frente pede a foto agora (a mesma que o page-entry.js já
    // pré-carregou: a banda fica toda para ela); as vizinhas, logo depois de ela aparecer, e as distantes na vez delas.
    const set = artSrcset(product.catalogImage || product.image), sources = set ? ` sizes="${HERO_SIZES}" ${first ? '' : 'data-'}srcset="${set}"` : '';
    return `<a class="slot" href="#produto/${key}" data-product="${key}" data-role="slot" draggable="false" aria-label="Conhecer ${product.title}, ${lower(product.subtitle)}" style="--art-h:${art.h};--art-bottom:${art.bottom};--art-foot:${art.foot}"><span class="ped" aria-hidden="true"><i class="ped-ground"></i><i class="ped-body"></i><i class="ped-top"></i></span><span class="piece"><i class="piece-shadow" aria-hidden="true"></i><img${sources} ${first ? `src="${src}"` : `data-src="${src}"`} alt="${art.alt || product.title}" width="1254" height="1254" decoding="async" draggable="false"${first ? ' fetchpriority="high"' : ''}></span></a>`;
  }).join('');

  const slots = [...region.querySelectorAll('.slot')], copies = [...region.querySelectorAll('.copy')], palettes = [...region.querySelectorAll('.palette')];
  const bgLayers = [...bgHost.querySelectorAll('.hero-layer')], bandLayers = [...shell.querySelectorAll('[data-hero-band] .hero-layer')];
  // As silhuetas das bordas e as dos cantos de cada camada: o parallax do arraste escreve `translate` direto nelas.
  const motifs = bgLayers.map(layer => layer.querySelector('.scenery-back')), edges = bgLayers.map(layer => layer.querySelector('.scenery-mist'));
  // No meio da troca as cores do tema vão só para o header e as setas (o resto do banner e o rodapé recebem a cor final em report()).
  const live = [shell.querySelector('.site-header'), prevButton, nextButton].filter(Boolean);
  const images = slots.map(slot => slot.querySelector('img'));
  const stage = region.querySelector('[data-hero-stage]');
  // Produto com `demo` em SHOWCASE: o clique na peça vira a demonstração na própria vitrine (hero-demo.js).
  const demo = createHeroDemo({region, shell, entries, slots, bgLayers, status, reduced, onLock: value => { locked = value; if (!value) report(); }});
  stage.setAttribute('aria-busy', 'true');
  const ready = images.map(img => {
    // Offscreen images start observing only when their source is requested.
    if (!img.hasAttribute('src')) return null;
    return prepareImage(img);
  });
  async function prepareImage(img) {
    const ok = await imageReady(img, 6500);
    if (ok) img.classList.add('is-loaded');
    else {img.hidden = true; img.parentElement.insertAdjacentHTML('beforeend','<span class="image-unavailable">Imagem indisponível.<br>Conheça as cores da peça.</span>');}
  }
  // A página aparece assim que a peça da frente está decodificada e a primeira medida (ResizeObserver, measure()) aplicada — num
  // celular lento ela pode vir depois da foto, e a página não aparece com o desenho do fundo fora do lugar para logo pular (CLS).
  // As fontes ganham no máximo 150 ms a mais (com swap e os fallbacks métricos o texto já está no lugar). document.fonts só é
  // consultado depois de um quadro desenhado: lido com o layout por fazer (na montagem), ele obrigava o navegador a calcular
  // estilo e layout ali mesmo (PageSpeed, 08/10/2026).
  const afterFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r)));
  const drawn = Promise.all([ready[initial], firstMeasure]).then(afterFrame).then(() => Promise.race([document.fonts?.ready, new Promise(r => setTimeout(r, 150))]));
  // Volta à home (page-entry.js): a página aparece quando a peça da frente está pronta, ou 600 ms depois da estrutura.
  Promise.race([drawn, new Promise(r => setTimeout(r, 600))]).then(() => window.finishJuReturn?.());
  drawn.then(() => {
    stage.setAttribute('aria-busy', 'false');
    window.finishJuOpening?.();
    // a primeira foto entra sem esmaecer (carousel.css); daqui em diante, as que chegam esmaecem
    requestAnimationFrame(() => requestAnimationFrame(() => region.classList.add('is-drawn')));
    // as vizinhas, para o primeiro arraste, só agora: até aqui a banda era toda da foto da frente
    preloadAround(active);
    // Pré-monta a demonstração (as imagens do equipamento, ~130 KB) para estar pronta no clique: ao primeiro sinal de interesse
    // na vitrine (mouse por cima, foco, toque), ainda antes do clique, ou, em conexão folgada, um tempo depois que a página
    // terminou de carregar e ficou ociosa — nunca nos primeiros segundos, disputando a banda com a página. Em 3G/2G ou com
    // economia de dados ligada, só com o interesse: quem não abre a demonstração não paga por ela.
    const net = navigator.connection, roomy = !net || (!net.saveData && !/(^|-)2g$|^3g$/.test(net.effectiveType || ''));
    const early = () => demo.prepare(active);
    for (const type of ['pointerenter', 'focusin', 'pointerdown']) region.addEventListener(type, early, {once: true, passive: true});
    if (roomy) {
      const idle = fn => window.requestIdleCallback ? requestIdleCallback(fn, {timeout: 2000}) : setTimeout(fn, 200);
      const later = () => idle(() => setTimeout(() => idle(early), 3000));
      if (document.readyState === 'complete') later(); else addEventListener('load', later, {once: true});
    }
    demoFromRoute();   // chegou da página Produtos por "Ver encaixado"
  });
  region.setAttribute('aria-label', `Coleção de ${total} ${total === 1 ? 'produto' : 'produtos'}`);
  if (total < 2) { prevButton.hidden = nextButton.hidden = true; }

  // ── Pré-carregamento: anterior, atual e próximo ──────────────────────────────
  function load(index) {
    const img = images[mod(index, total)];
    if (img.dataset.srcset) { img.srcset = img.dataset.srcset; delete img.dataset.srcset; }
    if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; prepareImage(img); }
  }
  const preloadAround = index => { load(index - 1); load(index); load(index + 1); };

  // ── Estado ativo: só o produto de destino é focável/lido ─────────────────────
  function setActive(index) {
    if (index === active) return;
    const focused = document.activeElement, role = region.contains(focused) ? focused.closest?.('[data-role]')?.dataset.role : null;
    active = index;
    slots.forEach((slot, i) => { slot.dataset.front = String(i === active); slot.toggleAttribute('inert', i !== active); });
    copies.forEach((block, i) => block.toggleAttribute('inert', i !== active));
    palettes.forEach((block, i) => block.toggleAttribute('inert', i !== active));
    if (stage.getAttribute('aria-busy') === 'false') demo.prepare(active);
    if (role) (role === 'slot' ? slots[active] : palettes[active].querySelector('[data-role]'))?.focus({preventScroll: true});
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  // Todas as leituras antes de qualquer escrita, e chamado pelo ResizeObserver (depois do layout, antes da pintura): medir nunca
  // obriga o navegador a refazer o layout no meio do script (PageSpeed, 08/10/2026: "forced reflow" na montagem).
  function measure() {
    const viewport = document.documentElement.clientWidth, pedestal = slots[0].offsetWidth || 320, height = shell.offsetHeight;
    // O desenho do fundo (hero-scenery.js) se prende ao palco em qualquer tela: o centro e o alto dele, medidos na .page (onde
    // o fundo começa), e a largura da pilastra.
    const host = page.getBoundingClientRect(), box = stage.getBoundingClientRect();
    put(page, '--hero-h', height + 'px');
    put(page, '--stage-x', `${(box.left + box.width / 2 - host.left).toFixed(1)}px`);
    put(page, '--stage-top', `${(box.top - host.top).toFixed(1)}px`);
    put(page, '--scn-ped', `${pedestal}px`);
    travel = Math.max(pedestal * 1.3, viewport * .48);
    rise = Math.max(8, pedestal * .035);
    heroHeight = height;
    catchUp();
    render();
    measured();
  }
  // Um estilo só é escrito quando muda: a cada quadro quase nada muda (as peças longe, as camadas apagadas, a cor já certa).
  const written = new WeakMap();
  function put(element, name, value) {
    let seen = written.get(element);
    if (!seen) written.set(element, seen = {});
    if (seen[name] === value) return;
    seen[name] = value;
    if (name.startsWith('--')) element.style.setProperty(name, value); else element.style[name] = value;
  }
  let themeNow = {};
  // Enquanto a vitrine anda, as nuvenzinhas e os cantos param (o parallax já os move; assim os quadros não recalculam as animações).
  const moving = on => bgHost.classList.toggle('is-moving', on);
  // O fundo acompanha a rolagem da página (carousel.css › scn-scroll): os cantos afundam e esmaecem, as silhuetas das bordas se abrem
  // para fora e esmaecem, cada uma na sua profundidade. Onde o navegador não liga uma animação à rolagem (animation-timeline), este laço faz
  // o mesmo com os mesmos números (hero-motion.js › sceneryScroll): só na rolagem (passiva), um quadro por vez, só nas camadas à vista
  // e só quando a posição muda, escrevendo transform e opacity direto nos cantos e nas silhuetas das bordas de cada camada (poucos
  // elementos) e só o que mudou. Com movimento reduzido, tudo no lugar.
  const scrollLinked = !!window.CSS?.supports?.('animation-timeline: scroll()');
  const depthOf = el => ({el, depth: el.classList.contains('scenery-mist') ? 'near' : el.classList.contains('scn-far') ? 'far' : 'mid', side: el.classList.contains('scn-l') ? -1 : el.classList.contains('scn-r') ? 1 : 0});
  const followers = scrollLinked ? [] : bgLayers.map(layer => [...layer.querySelectorAll('.scenery-mist, .scenery-back > .scenery-edge')].map(depthOf));
  let heroHeight = 720, scrollFrame = 0, followed = -1;
  function follow(force = false) {
    scrollFrame = 0;
    const progress = reduced.matches ? 0 : clamp(scrollY / heroHeight, 0, 1);
    if (progress === followed && !force) return;
    followed = progress;
    bgLayers.forEach((layer, i) => {
      if (layer.classList.contains('is-off')) return;
      for (const item of followers[i]) {
        const {x, y, opacity} = sceneryScroll(progress, item, heroHeight);
        put(item.el, 'transform', x || y ? `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)` : '');
        put(item.el, 'opacity', opacity < 1 ? opacity.toFixed(3) : '');
      }
    });
  }
  const catchUp = () => { if (!scrollLinked) { cancelAnimationFrame(scrollFrame); scrollFrame = requestAnimationFrame(() => follow(true)); } };
  if (!scrollLinked) addEventListener('scroll', () => { scrollFrame ||= requestAnimationFrame(() => follow()); }, {passive: true});
  function render() {
    const motion = {reduced: reduced.matches};
    for (let i = 0; i < total; i++) {
      const d = wrapDistance(i, position, total), p = pose(d, motion), t = textPose(d, motion), slot = slots[i];
      put(slot, 'transform', `translate3d(${(p.x * travel).toFixed(2)}px,${(p.y * rise).toFixed(2)}px,0) scale(${p.scale.toFixed(4)})`);
      put(slot, 'opacity', p.opacity.toFixed(3));
      put(slot, 'visibility', p.opacity < .005 ? 'hidden' : 'visible');
      put(slot, 'zIndex', String(Math.round((1 - p.a) * 10)));
      for (const block of [copies[i], palettes[i]]) {
        put(block, 'opacity', t.opacity.toFixed(3));
        put(block, 'visibility', t.opacity < .005 ? 'hidden' : 'visible');
        put(block, 'transform', `translate3d(${(t.x * TEXT_SHIFT).toFixed(2)}px,${(t.y * TEXT_DROP).toFixed(2)}px,0)`);
      }
    }
    const mix = layerMix(position, total);
    for (let i = 0; i < total; i++) {
      const opacity = i === mix.from ? 1 : i === mix.to ? mix.t : 0, z = i === mix.to ? '2' : '1', shown = opacity >= .005;
      for (const layer of [bgLayers[i], bandLayers[i]]) { put(layer, 'opacity', opacity.toFixed(3)); put(layer, 'zIndex', z); }
      // a camada apagada sai da pintura e para de animar (.is-off: visibility e content-visibility); na que aparece, o desenho
      // acompanha a peça a 12% do caminho e os cantos a 5% (profundidade), cada um no seu translate, parados no movimento reduzido
      if (bgLayers[i].classList.contains('is-off') === shown) { bgLayers[i].classList.toggle('is-off', !shown); if (shown) catchUp(); }
      if (!shown) continue;
      const d = wrapDistance(i, position, total);
      if (motifs[i]) put(motifs[i], 'translate', `${Math.round(sceneryShift(d, travel, motion))}px 0`);
      if (edges[i]) put(edges[i], 'translate', `${Math.round(sceneryShift(d, travel, {...motion, depth: SCENERY_EDGE}))}px 0`);
    }
    const a = entries[mix.from].theme, b = entries[mix.to].theme, accent = mixColor(a.accentColor, b.accentColor, mix.t);
    themeNow = {'--theme-text': mixColor(a.textColor, b.textColor, mix.t), '--theme-muted': mixColor(a.mutedColor, b.mutedColor, mix.t), '--theme-accent': accent, '--theme-accent-strong': mixColor(accent, '#000000', .2), '--theme-glow': withAlpha(accent, .32), '--theme-pulse': withAlpha(accent, .55), '--theme-pulse-off': withAlpha(accent, 0), '--theme-soft': mixColor(accent, '#ffffff', .78), '--theme-wash': mixColor(entries[mix.from].wash, entries[mix.to].wash, mix.t)};
    for (const element of live) for (const name in themeNow) put(element, name, themeNow[name]);
  }
  function report({announce = true} = {}) {
    const i = mod(Math.round(target), total), {key, colors} = entries[i];
    // assentada a peça, a cor do tema vai para o banner inteiro e o rodapé (variáveis herdadas: uma escrita por troca, não por quadro)
    for (const element of themed) for (const name in themeNow) put(element, name, themeNow[name]);
    moving(false);
    window.juTheme?.save(key, colors);
    status.textContent = announce ? `${entries[i].product.title}, produto ${i + 1} de ${total}.` : '';   // vazio não fica desatualizado
    // A coleção (catalog.js) acompanha a vitrine; só quando a peça muda, não a cada relatório da mesma peça.
    if (key !== shared) { shared = key; dispatchEvent(new CustomEvent(FOCUS, {detail: {product: key, source: 'showcase'}})); }
  }

  // ── Movimento ────────────────────────────────────────────────────────────────
  function stop() { cancelAnimationFrame(frame); frame = 0; }
  function settle(next, {announce = true, velocity = null} = {}) {
    stop(); target = next; moving(true);
    // #produto/<peça> diz por onde se chegou (Ver encaixado, Produtos, carrinho). Trocada a peça, o endereço sai já: senão o
    // "Continuar escolhendo" do carrinho e o recarregar voltavam à peça antiga (e, se à venda, abriam a janela dela).
    const routed = fromHash();
    if (routed >= 0 && routed !== mod(Math.round(target), total)) history.replaceState(history.state, '', location.pathname + location.search);
    setActive(mod(Math.round(target), total));
    preloadAround(active);
    const from = position, start = performance.now(), duration = settleDuration(target - from, {reduced: reduced.matches, velocity, stride: travel});
    if (from === target) { render(); report({announce}); return; }
    function tick(now) {
      const progress = Math.min(1, (now - start) / duration);
      position = from + (target - from) * easeOut(progress);
      render();
      if (progress < 1) frame = requestAnimationFrame(tick);
      else { frame = 0; position = target; render(); report({announce}); }
    }
    frame = requestAnimationFrame(tick);
  }
  function move(direction) {
    if (locked || gesture || total < 2 || Math.abs(target - position) >= 2) return;
    settle(target + direction);
  }
  prevButton.addEventListener('click', () => move(-1));
  nextButton.addEventListener('click', () => move(1));

  region.addEventListener('click', e => { if (e.target.closest('[data-demo-open]') && !locked && demo.has(active)) demo.open(active); });

  // ── Hover: a peça ativa inclina até ~2,5° seguindo o cursor (só mouse; o CSS aplica em :hover) ──
  let tiltFrame = 0, tiltAt = null;
  function drawTilt() {
    tiltFrame = 0;
    const piece = slots[active].querySelector('.piece'), box = piece.getBoundingClientRect();
    const nx = clamp((tiltAt.x - box.left) / box.width * 2 - 1, -1, 1), ny = clamp((tiltAt.y - box.top) / box.height * 2 - 1, -1, 1);
    piece.style.setProperty('--tilt-x', `${(-ny * 2.2).toFixed(2)}deg`);
    piece.style.setProperty('--tilt-y', `${(nx * 2.6).toFixed(2)}deg`);
  }
  region.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || locked || gesture || reduced.matches || !e.target.closest('.slot[data-front=true]')) return;
    tiltAt = {x: e.clientX, y: e.clientY};
    tiltFrame ||= requestAnimationFrame(drawTilt);
  });
  slots.forEach(slot => slot.addEventListener('pointerleave', () => { const piece = slot.querySelector('.piece'); piece.style.removeProperty('--tilt-x'); piece.style.removeProperty('--tilt-y'); }));

  // ── Gestos: o dedo acompanha a peça 1:1; rolagem vertical continua nativa ───
  region.addEventListener('dragstart', e => e.preventDefault());
  region.addEventListener('pointerdown', e => {
    if (locked || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0) || gesture || total < 2 || e.target.closest('.hero-arrow')) return;
    suppressUntil = 0;
    gesture = {id: e.pointerId, x: e.clientX, y: e.clientY, base: position, anchor: target, horizontal: false, vertical: false, moved: false, lx: e.clientX, lt: e.timeStamp, v: 0};
  });
  region.addEventListener('pointermove', e => {
    if (!gesture || e.pointerId !== gesture.id) return;
    const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y, dt = e.timeStamp - gesture.lt;
    // a velocidade do dedo (px/ms), suavizada: decide o peteleco e a duração do assentar ao soltar
    if (dt > 0) { gesture.v = .8 * (e.clientX - gesture.lx) / dt + .2 * gesture.v; gesture.lx = e.clientX; gesture.lt = e.timeStamp; }
    if (Math.hypot(dx, dy) > 8) gesture.moved = true;
    if (!gesture.horizontal && !gesture.vertical && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
      if (Math.abs(dx) > Math.abs(dy) * 1.2) {
        gesture.horizontal = true; stop(); moving(true); gesture.base = position;
        region.setPointerCapture(e.pointerId); region.classList.add('is-dragging');
      } else if (Math.abs(dy) > Math.abs(dx)) gesture.vertical = true;
    }
    if (gesture.horizontal) { e.preventDefault(); position = gesture.base - dx / travel; render(); }
  });
  function finish(e, cancelled = false) {
    if (!gesture || e.pointerId !== gesture.id) return;
    const g = gesture, dx = e.clientX - g.x, velocity = cancelled || e.timeStamp - g.lt > 90 ? 0 : g.v;   // parou antes de soltar: sem impulso
    gesture = null; region.classList.remove('is-dragging');
    if (g.moved) suppressUntil = performance.now() + 650;
    if (region.hasPointerCapture(e.pointerId)) region.releasePointerCapture(e.pointerId);
    if (g.horizontal) settle(swipeTarget({anchor: g.anchor, dx, stride: travel, velocity, position, cancelled}), {velocity});
  }
  region.addEventListener('pointerup', e => finish(e));
  region.addEventListener('pointercancel', e => finish(e, true));
  // O toque começa com captura implícita no link. Ao transferi-la para a região, o link emite
  // lostpointercapture; esse evento propagado não é um cancelamento.
  region.addEventListener('lostpointercapture', e => {
    if (gesture && e.target === region && !region.hasPointerCapture(e.pointerId)) finish(e, true);
  });
  // Depois de um arraste (ou no meio da transição) o clique sintético não pode abrir o produto.
  // Um toque/clique de verdade na peça de um produto com demonstração abre a demonstração no lugar do popup.
  region.addEventListener('click', e => {
    if (performance.now() < suppressUntil || (frame && e.target.closest('[data-role]'))) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    const index = slots.indexOf(e.target.closest('.slot'));
    if (index >= 0 && demo.has(index)) { e.preventDefault(); e.stopImmediatePropagation(); demo.open(index); }
  }, true);
  region.addEventListener('keydown', e => {
    if (!locked && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.altKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); move(e.key === 'ArrowRight' ? 1 : -1); }
  });
  // Só gesto horizontal do trackpad/roda navega; a rolagem vertical da página fica livre.
  let wheelTotal = 0, wheelAt = -Infinity, wheelMovedAt = -Infinity;
  region.addEventListener('wheel', e => {
    if (locked || e.ctrlKey || gesture || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    const delta = e.deltaX * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? region.clientWidth : 1), now = performance.now();
    if (!delta) return;
    e.preventDefault();
    if (now - wheelAt > 180) wheelTotal = 0;
    wheelAt = now;
    if (now - wheelMovedAt < 650) return;
    wheelTotal += delta;
    if (Math.abs(wheelTotal) >= 35) { move(wheelTotal > 0 ? 1 : -1); wheelTotal = 0; wheelMovedAt = now; }
  }, {passive: false});

  // ── Rota, ciclo de vida ──────────────────────────────────────────────────────
  // Um #produto/<peça> que chega depois (o "Ver e comprar" dos cards, um link) só abre a janela da peça por cima: a vitrine fica onde
  // está. Só a demonstração (/encaixe) traz a vitrine até a peça. O endereço da chegada continua valendo (initial, fromHash).
  function fromRoute() {
    const index = fromHash(), step = location.hash.replace('#produto/', '').split('/')[1];
    if (step === 'encaixe' && index >= 0 && index !== mod(Math.round(target), total)) { demo.close({immediate: true}); stop(); position = target = index; setActive(index); preloadAround(index); render(); report(); }
    demoFromRoute();
  }
  // #produto/<peça>/encaixe ("Ver encaixado" nos cards da coleção e da página Produtos): a vitrine já está na peça; a página sobe
  // até o banner e a demonstração abre. O endereço volta a #produto/<peça>, para fechar e voltar não reabrirem a demonstração.
  function demoFromRoute() {
    const [raw, step] = location.hash.replace('#produto/', '').split('/'), index = keys.indexOf(ALIASES[raw] || raw);
    if (step !== 'encaixe' || index < 0) return;
    history.replaceState(null, '', `#produto/${keys[index]}`);
    if (!demo.has(index)) return;
    const started = performance.now();
    if (scrollY > 4) scrollTo({top: 0, behavior: reduced.matches ? 'auto' : 'smooth'});
    const open = () => { if (scrollY > 4 && performance.now() - started < 1200) { requestAnimationFrame(open); return; } if (!locked) demo.open(index); };
    requestAnimationFrame(open);
  }
  addEventListener('hashchange', fromRoute);
  // A primeira medida vem do ResizeObserver, no primeiro quadro (depois do layout, antes da pintura): a montagem só escreve.
  // Ele observa o banner (largura da tela, altura com as fontes) e a pilastra; o resize da janela segue (numa tela larga o
  // banner para de crescer, mas o passo entre as peças ainda acompanha a janela).
  addEventListener('resize', measure);
  if ('ResizeObserver' in window) { const sizes = new ResizeObserver(() => measure()); sizes.observe(shell); sizes.observe(slots[0]); }
  else requestAnimationFrame(measure);
  reduced.addEventListener('change', () => { stop(); position = target; render(); report(); catchUp(); });
  // As nuvenzinhas e os cantos do fundo só se mexem com o banner na tela e a aba aberta (carousel.css › .hero-bg.is-still).
  let onScreen = true;
  const rest = () => bgHost.classList.toggle('is-still', document.hidden || !onScreen);
  if ('IntersectionObserver' in window) new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; rest(); }).observe(shell);
  // Enquanto a página rola, o que é do ambiente também para (.is-scrolling) e só o que acompanha a rolagem anda: a cada quadro da
  // rolagem o navegador recalcula o estilo de tudo o que está animando (medido no Chrome, rolando pela vitrine: de 2870 para 933
  // elementos recalculados). Volta 200 ms depois do último movimento.
  let scrollRest = 0;
  addEventListener('scroll', () => {
    if (!onScreen || reduced.matches) return;
    if (scrollRest) clearTimeout(scrollRest); else bgHost.classList.add('is-scrolling');
    scrollRest = setTimeout(() => { scrollRest = 0; bgHost.classList.remove('is-scrolling'); }, 200);
  }, {passive: true});
  document.addEventListener('visibilitychange', () => {
    rest();
    if (document.hidden) { stop(); gesture = null; region.classList.remove('is-dragging'); position = target; render(); report(); }
  });
  // Voltar (Back) restaura a home como estava: a peça à vista volta a ser a guardada, mesmo que outra página tenha guardado outra.
  addEventListener('pageshow', e => { if (e.persisted) report(); });

  position = target = initial;
  setActive(initial); render(); report();
  shell.classList.add('is-ready');
}
