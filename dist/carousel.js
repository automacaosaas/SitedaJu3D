// Vitrine principal: um produto por vez, apoiado na pilastra, com fundo e header temáticos.
// Um único valor contínuo (`position`) comanda produto+pilastra, textos, paleta, fundo e header.
import {PRODUCTS, PRODUCT_CATEGORIES, ALIASES, originalColors, showcase} from './products.js';
import {scenery} from './hero-scenery.js';
import {imageReady} from './loading-ui.js';
import {EASE, cubicBezier, mod, wrapDistance, pose, textPose, layerMix, mixColor, withAlpha, swipeTarget, settleDuration} from './hero-motion.js';

const region = document.querySelector('.showcase');
const shell = region?.closest('.hero-shell');
if (region && shell) init();

function init() {
  const keys = Object.keys(PRODUCTS), total = keys.length;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const easeOut = cubicBezier(...EASE);
  const status = region.querySelector('#gallery-status');
  // Abaixo do banner só seguem o tema: título/apoio da seção, botões Personalize/carrinho dos cards,
  // link do catálogo e rodapé. O restante dos cards não é tocado.
  const themed = [shell, document.querySelector('.catalog-home'), document.querySelector('.home footer')].filter(Boolean);
  // O fundo de tema cobre a página inteira; --hero-h (altura do banner) fica na .page, ancestral comum.
  const page = shell.closest('.page'), bgHost = document.querySelector('[data-hero-bg]');
  const prevButton = region.querySelector('.hero-prev'), nextButton = region.querySelector('.hero-next');
  const TEXT_SHIFT = 36, TEXT_DROP = 10;
  const lower = text => text.charAt(0).toLowerCase() + text.slice(1);
  const themeVars = theme => `--text:${theme.textColor};--muted:${theme.mutedColor};--accent:${theme.accentColor};--strong:${mixColor(theme.accentColor, '#000000', .2)};--glow:${withAlpha(theme.accentColor, .32)}`;
  const entries = keys.map(key => {
    const product = PRODUCTS[key], {art, theme} = showcase(key), colors = originalColors(key);
    // wash: tom claro (miolo do degradê + branco) que suaviza o topo do card ativo do catálogo.
    const wash = mixColor(theme.bannerStops.match(/#[0-9a-f]{6}/gi)[1], '#ffffff', .3);
    return {key, product, art, theme, colors, wash, category: PRODUCT_CATEGORIES[product.category]?.label || product.category};
  });

  let position = 0, target = 0, active = -1, frame = 0, gesture = null, suppressUntil = 0;
  let travel = 600, rise = 12;

  function fromHash() {
    const raw = location.hash.replace('#produto/', ''), index = keys.indexOf(ALIASES[raw] || raw);
    return index;
  }
  const initial = Math.max(0, fromHash());

  // ── Estrutura ────────────────────────────────────────────────────────────────
  bgHost.innerHTML = entries.map(({key,theme}) => `<div class="hero-layer" style="--stops:${theme.bannerStops}">${scenery(key)}</div>`).join('');
  shell.querySelector('[data-hero-band]').innerHTML = entries.map(({theme}) => `<div class="hero-layer" style="background:${theme.headerBackground}"></div>`).join('');
  region.querySelector('[data-hero-copy]').innerHTML = entries.map(({product, category, theme}) =>
    `<div class="copy" style="${themeVars(theme)}"><p class="copy-category">${category}</p><h2 class="copy-name">${product.title}</h2><p class="copy-sub">${product.subtitle}</p></div>`).join('');
  region.querySelector('[data-hero-palette]').innerHTML = entries.map(({key, product, colors, theme}) =>
    `<div class="palette" style="${themeVars(theme)}"><button class="palette-button" type="button" data-role="palette" data-go-card aria-label="Escolha sua cor: ver ${product.title} na coleção e personalizar. Cores originais: ${colors.map(c => c.name).join(', ')}"><span>Escolha sua cor</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><span class="palette-dots" aria-hidden="true">${colors.map(c => `<i style="--dot:${c.hex}"></i>`).join('')}</span></div>`).join('');
  region.querySelector('[data-hero-stage]').innerHTML = entries.map(({key, product, art}, i) => {
    const near = Math.abs(wrapDistance(i, initial, total)) <= 1, src = `assets/${product.catalogImage || product.image}`;
    return `<a class="slot" href="#produto/${key}" data-product="${key}" data-role="slot" draggable="false" aria-label="Conhecer ${product.title}, ${lower(product.subtitle)}" style="--art-h:${art.h};--art-bottom:${art.bottom};--art-foot:${art.foot}"><span class="ped" aria-hidden="true"><i class="ped-ground"></i><i class="ped-body"></i><i class="ped-top"></i></span><span class="piece"><i class="piece-shadow" aria-hidden="true"></i><img ${near ? `src="${src}"` : `data-src="${src}"`} alt="${art.alt || product.title}" width="1254" height="1254" decoding="async" draggable="false"${i === initial ? ' fetchpriority="high"' : ''}></span></a>`;
  }).join('');

  const slots = [...region.querySelectorAll('.slot')], copies = [...region.querySelectorAll('.copy')], palettes = [...region.querySelectorAll('.palette')];
  const bgLayers = [...bgHost.querySelectorAll('.hero-layer')], bandLayers = [...shell.querySelectorAll('[data-hero-band] .hero-layer')];
  const images = slots.map(slot => slot.querySelector('img'));
  const stage = region.querySelector('[data-hero-stage]');
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
  Promise.all([ready[initial], Promise.race([document.fonts?.ready, new Promise(r => setTimeout(r, 1600))])]).then(() => {
    stage.setAttribute('aria-busy', 'false');
    window.finishJuOpening?.();
  });
  region.setAttribute('aria-label', `Coleção de ${total} ${total === 1 ? 'produto' : 'produtos'}`);
  if (total < 2) { prevButton.hidden = nextButton.hidden = true; }

  // ── Pré-carregamento: anterior, atual e próximo ──────────────────────────────
  function load(index) {
    const img = images[mod(index, total)];
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
    clearPulse();
    if (role) (role === 'slot' ? slots[active] : palettes[active].querySelector('[data-role]')).focus({preventScroll: true});
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  function measure() {
    const viewport = document.documentElement.clientWidth, pedestal = slots[0].offsetWidth || 320;
    page.style.setProperty('--hero-h', shell.offsetHeight + 'px');
    travel = Math.max(pedestal * 1.3, viewport * .48);
    rise = Math.max(8, pedestal * .035);
    render();
  }
  function render() {
    const motion = {reduced: reduced.matches};
    for (let i = 0; i < total; i++) {
      const d = wrapDistance(i, position, total), p = pose(d, motion), t = textPose(d, motion), slot = slots[i];
      slot.style.transform = `translate3d(${(p.x * travel).toFixed(2)}px,${(p.y * rise).toFixed(2)}px,0) scale(${p.scale.toFixed(4)})`;
      slot.style.opacity = p.opacity.toFixed(3);
      slot.style.visibility = p.opacity < .005 ? 'hidden' : 'visible';
      slot.style.zIndex = String(Math.round((1 - p.a) * 10));
      for (const block of [copies[i], palettes[i]]) {
        block.style.opacity = t.opacity.toFixed(3);
        block.style.visibility = t.opacity < .005 ? 'hidden' : 'visible';
        block.style.transform = `translate3d(${(t.x * TEXT_SHIFT).toFixed(2)}px,${(t.y * TEXT_DROP).toFixed(2)}px,0)`;
      }
    }
    const mix = layerMix(position, total);
    for (let i = 0; i < total; i++) {
      const opacity = i === mix.from ? 1 : i === mix.to ? mix.t : 0, z = i === mix.to ? '2' : '1';
      for (const layer of [bgLayers[i], bandLayers[i]]) { layer.style.opacity = opacity.toFixed(3); layer.style.zIndex = z; }
    }
    const a = entries[mix.from].theme, b = entries[mix.to].theme, accent = mixColor(a.accentColor, b.accentColor, mix.t);
    const vars = {'--theme-text': mixColor(a.textColor, b.textColor, mix.t), '--theme-muted': mixColor(a.mutedColor, b.mutedColor, mix.t), '--theme-accent': accent, '--theme-accent-strong': mixColor(accent, '#000000', .2), '--theme-glow': withAlpha(accent, .32), '--theme-pulse': withAlpha(accent, .55), '--theme-pulse-off': withAlpha(accent, 0), '--theme-soft': mixColor(accent, '#ffffff', .78), '--theme-wash': mixColor(entries[mix.from].wash, entries[mix.to].wash, mix.t)};
    for (const element of themed) for (const name in vars) element.style.setProperty(name, vars[name]);
  }
  function report() {
    const i = mod(Math.round(target), total);
    status.textContent = `${entries[i].product.title}, produto ${i + 1} de ${total}.`;
  }

  // ── Movimento ────────────────────────────────────────────────────────────────
  function stop() { cancelAnimationFrame(frame); frame = 0; }
  function settle(next) {
    stop(); target = next;
    setActive(mod(Math.round(target), total));
    preloadAround(active);
    const from = position, start = performance.now(), duration = settleDuration(target - from, {reduced: reduced.matches});
    if (from === target) { render(); report(); return; }
    function tick(now) {
      const progress = Math.min(1, (now - start) / duration);
      position = from + (target - from) * easeOut(progress);
      render();
      if (progress < 1) frame = requestAnimationFrame(tick);
      else { frame = 0; position = target; render(); report(); }
    }
    frame = requestAnimationFrame(tick);
  }
  function move(direction) {
    if (gesture || total < 2 || Math.abs(target - position) >= 2) return;
    settle(target + direction);
  }
  prevButton.addEventListener('click', () => move(-1));
  nextButton.addEventListener('click', () => move(1));

  // ── Ir ao card: "Escolha sua cor" e a seta pulsante levam ao card do produto ativo ──
  let pulseAbort = null;
  function clearPulse() {
    pulseAbort?.abort(); pulseAbort = null;
    document.querySelectorAll('.product-customize.is-pulsing').forEach(button => button.classList.remove('is-pulsing'));
  }
  function goToCard() {
    const key = entries[active].key, card = document.querySelector(`.product-rail-card[data-product-id="${key}"]`);
    const section = card?.closest('[data-product-carousel]') || document.querySelector('#produtos');
    if (!section) return;
    clearPulse();
    card?.click(); // traz o card ao centro do carrossel, igual ao toque em um card lateral
    section.scrollIntoView({behavior: reduced.matches ? 'auto' : 'smooth', block: 'center'});
    status.textContent = `${entries[active].product.title}: use Personalize o seu para escolher as cores.`;
    const button = card?.querySelector('.product-customize');
    if (!button) return;
    let started = false;
    const begin = () => {
      if (started) return;
      started = true;
      button.classList.add('is-pulsing');
      pulseAbort = new AbortController();
      for (const type of ['pointerenter', 'focus', 'click', 'animationend']) button.addEventListener(type, clearPulse, {once: true, signal: pulseAbort.signal});
    };
    addEventListener('scrollend', begin, {once: true});
    setTimeout(begin, reduced.matches ? 60 : 1100);
  }
  region.addEventListener('click', e => { if (e.target.closest('[data-go-card]')) goToCard(); });

  // ── Gestos: o dedo acompanha a peça 1:1; rolagem vertical continua nativa ───
  region.addEventListener('dragstart', e => e.preventDefault());
  region.addEventListener('pointerdown', e => {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0) || gesture || total < 2 || e.target.closest('.hero-arrow')) return;
    suppressUntil = 0;
    gesture = {id: e.pointerId, x: e.clientX, y: e.clientY, base: position, anchor: target, horizontal: false, vertical: false, moved: false};
  });
  region.addEventListener('pointermove', e => {
    if (!gesture || e.pointerId !== gesture.id) return;
    const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
    if (Math.hypot(dx, dy) > 8) gesture.moved = true;
    if (!gesture.horizontal && !gesture.vertical && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
      if (Math.abs(dx) > Math.abs(dy) * 1.2) {
        gesture.horizontal = true; stop(); gesture.base = position;
        region.setPointerCapture(e.pointerId); region.classList.add('is-dragging');
      } else if (Math.abs(dy) > Math.abs(dx)) gesture.vertical = true;
    }
    if (gesture.horizontal) { e.preventDefault(); position = gesture.base - dx / travel; render(); }
  });
  function finish(e, cancelled = false) {
    if (!gesture || e.pointerId !== gesture.id) return;
    const g = gesture, dx = e.clientX - g.x;
    gesture = null; region.classList.remove('is-dragging');
    if (g.moved) suppressUntil = performance.now() + 650;
    if (region.hasPointerCapture(e.pointerId)) region.releasePointerCapture(e.pointerId);
    if (g.horizontal) settle(swipeTarget({anchor: g.anchor, dx, stride: travel, cancelled}));
  }
  region.addEventListener('pointerup', e => finish(e));
  region.addEventListener('pointercancel', e => finish(e, true));
  // O toque começa com captura implícita no link. Ao transferi-la para a região, o link emite
  // lostpointercapture; esse evento propagado não é um cancelamento.
  region.addEventListener('lostpointercapture', e => {
    if (gesture && e.target === region && !region.hasPointerCapture(e.pointerId)) finish(e, true);
  });
  // Depois de um arraste (ou no meio da transição) o clique sintético não pode abrir o produto.
  region.addEventListener('click', e => {
    if (performance.now() < suppressUntil || (frame && e.target.closest('[data-role]'))) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  region.addEventListener('keydown', e => {
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.altKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); move(e.key === 'ArrowRight' ? 1 : -1); }
  });
  // Só gesto horizontal do trackpad/roda navega; a rolagem vertical da página fica livre.
  let wheelTotal = 0, wheelAt = -Infinity, wheelMovedAt = -Infinity;
  region.addEventListener('wheel', e => {
    if (e.ctrlKey || gesture || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
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
  function fromRoute() {
    const index = fromHash();
    if (index >= 0 && index !== mod(Math.round(target), total)) { stop(); position = target = index; setActive(index); preloadAround(index); render(); report(); }
  }
  addEventListener('hashchange', fromRoute);
  addEventListener('resize', measure);
  if ('ResizeObserver' in window) new ResizeObserver(() => measure()).observe(shell);
  reduced.addEventListener('change', () => { stop(); position = target; render(); report(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stop(); gesture = null; region.classList.remove('is-dragging'); position = target; render(); report(); }
  });

  position = target = initial;
  setActive(initial); preloadAround(initial); measure(); report();
  shell.classList.add('is-ready');
}
