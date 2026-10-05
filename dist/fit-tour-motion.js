// Movimento de "O 3D nas suas consultas" (fit-tour.js monta o HTML, que já vem pronto em index.html).
//
// Modo cinema — GSAP + ScrollTrigger + SplitText + Lenis (dist/vendor, carregados só aqui, sem bloquear a página).
// A rolagem é só o GATILHO: quando uma ficha chega na tela, a revelação roda sozinha até o fim (cerca de 1,2 s,
// power3.out), mesmo que a pessoa pare de rolar. Nada fica preso ao progresso da rolagem, então nada aparece pela metade.
// · Desktop: a história vira uma tela fixa (.fit-pin). Rolar troca a peça da vez: a ficha atual sai inteira e só então
//   a próxima se constrói; a peça fixa sai girando e a nova chega girando ao contrário; a cor da página troca junto.
// · Celular: cada ficha (com a sua peça) dispara ao chegar a 75% da tela e volta a se esconder ao rolar de volta
//   (o mesmo que toggleActions "play none none reverse").
// · Revelação: as letras do nome sobem de dentro da máscara da linha, as palavras da visão geral sobem em sequência e
//   os itens da ficha técnica entram em cascata (opacidade 0 → 1, y 30 → 0, intervalo de 0,03 s).
// · Lenis suaviza a roda do mouse (o toque continua nativo); janelas, gavetas e o carrossel rolam por conta própria, e ele
//   para enquanto a área do produto está aberta.
// · A visão geral é dividida já no idioma escolhido (i18n.js) e refeita quando a pessoa troca o idioma.
// Com movimento reduzido: sem Lenis e sem deslocamentos; tudo troca só por opacidade, rápido.
//
// Reserva — se as bibliotecas não carregarem: o reveal do CSS (animation-timeline: view()) e a peça ativa por
// IntersectionObserver.
import {translate} from './i18n.js';

const tour = document.querySelector('[data-fit-tour]');
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const supports = rule => !!window.CSS?.supports?.(rule);
const behavior = calm ? 'auto' : 'smooth';
const LIBS = ['vendor/gsap.min.js', 'vendor/ScrollTrigger.min.js', 'vendor/SplitText.min.js', 'vendor/lenis.min.js'];
const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
let lenis = null;

// Leva até uma ficha (pontos da história e cartões do carrossel). Sem tela fixa, o topo da ficha para a 7% da tela
// (scroll-margin-top da .fit-step, que o Lenis e o scrollIntoView respeitam); com tela fixa, o modo cinema troca isto.
const scrollToStep = step => {
  if (!step) return;
  if (lenis) lenis.scrollTo(step, {duration: 1.6, easing: easeInOut});
  else step.scrollIntoView({behavior, block: 'start'});
};
let goToStep = scrollToStep;

const loadScript = src => new Promise((resolve, reject) => {
  const script = document.createElement('script');
  script.src = src; script.async = false; script.onload = resolve; script.onerror = () => reject(new Error(`não carregou ${src}`));
  document.head.append(script);
});

// ── modo cinema ──────────────────────────────────────────────────────────────────────────────────────────────────
function cinema() {
  const {gsap, ScrollTrigger, SplitText, Lenis} = window;
  if (!gsap || !ScrollTrigger || !SplitText) throw new Error('GSAP indisponível');
  gsap.registerPlugin(ScrollTrigger, SplitText);
  tour.classList.add('is-gsap');
  const story = tour.querySelector('.fit-story');
  const steps = [...story.querySelectorAll('.fit-step')], slides = [...story.querySelectorAll('.fit-slide')], dots = [...story.querySelectorAll('.fit-dots a')];
  const backdrop = story.querySelector('.fit-backdrop'), layers = [...backdrop.children];
  // logo depois do fundo do banner (.hero-bg, que se estende pela página inteira dentro de .page): acima dele e abaixo de todo o conteúdo
  const heroBg = document.querySelector('.hero-bg');
  if (heroBg) heroBg.after(backdrop); else document.body.prepend(backdrop);
  backdrop.classList.add('is-on');
  story.style.setProperty('--fit-count', steps.length);

  if (!calm && Lenis) {
    lenis = new Lenis({lerp: .1, allowNestedScroll: true, prevent: node => node.matches?.('dialog, [role="dialog"], .language-menu, [data-lenis-prevent]')});
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(time => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    // a área do produto trava a página (controller.js, html.modal-open): o Lenis para junto e volta depois
    let locked = false;
    new MutationObserver(() => {
      const now = document.documentElement.classList.contains('modal-open');
      if (now === locked) return;
      locked = now;
      if (now) lenis.stop(); else lenis.start();
    }).observe(document.documentElement, {attributes: true, attributeFilter: ['class']});
  }

  // as peças de texto de cada ficha (o SplitText refaz a divisão sozinho quando a largura ou a fonte mudam)
  const parts = steps.map(step => {
    const name = step.querySelector('.fit-name');
    const title = SplitText.create(name, {type: 'chars,lines', mask: 'lines', tag: 'span', linesClass: 'fit-line', charsClass: 'fit-char', aria: 'auto', autoSplit: true});
    const words = overview(step.querySelector('.fit-overview'), {ScrollTrigger, SplitText});
    const art = step.querySelector('.fit-step-art');
    return {step, title, words, art, copy: step.querySelector('.fit-step-copy'), family: step.querySelector('.fit-family'), badge: step.querySelector('.fit-soon'),
      colors: [...step.querySelectorAll('.fit-colors i')], actions: step.querySelector('.fit-actions'), artSpots: [...(art?.querySelectorAll('.fit-spot') || [])]};
  });
  const stageSpots = slides.map(slide => [...slide.querySelectorAll('.fit-spot')]);
  const pieces = part => [part.copy, part.art, part.family, part.badge, part.actions, ...part.colors, ...part.artSpots, ...part.title.chars, ...part.words().words].filter(Boolean);
  // os pontos sobre a peça aparecem por último, um de cada vez, com um pequeno quique
  const popSpots = (tl, spots, at) => { if (spots.length) tl.fromTo(spots, {autoAlpha: 0, scale: .4}, {autoAlpha: 1, scale: 1, duration: .5, stagger: .14, ease: 'back.out(2.2)'}, at); };

  // A revelação de uma ficha: roda sozinha até o fim depois de disparada (cerca de 1,2 s).
  const reveal = (part, {art = false} = {}) => {
    const tl = gsap.timeline({defaults: {ease: 'power3.out'}});
    tl.set(part.copy, {autoAlpha: 1, y: 0});
    if (calm) {
      tl.fromTo([part.copy, ...(art && part.art ? [part.art] : [])], {autoAlpha: 0}, {autoAlpha: 1, duration: .35, ease: 'none'});
      return tl;
    }
    if (art && part.art) tl.fromTo(part.art, {autoAlpha: 0, y: 40, rotation: 4, scale: .94}, {autoAlpha: 1, y: 0, rotation: 0, scale: 1, duration: 1.1, ease: 'expo.out'}, 0);
    tl.fromTo(part.family, {autoAlpha: 0, y: 20}, {autoAlpha: 1, y: 0, duration: .6}, 0)
      .fromTo(part.title.chars, {autoAlpha: 0, y: 30}, {autoAlpha: 1, y: 0, duration: .8, stagger: .03}, .06);
    if (part.badge) tl.fromTo(part.badge, {autoAlpha: 0, scale: .8}, {autoAlpha: 1, scale: 1, duration: .5}, .4);
    tl.fromTo(part.words().words, {autoAlpha: 0, y: 30}, {autoAlpha: 1, y: 0, duration: .65, stagger: {amount: .35}}, .18)
      // as esferas de cor, uma depois da outra
      .fromTo(part.colors, {autoAlpha: 0, y: 14, scale: .6}, {autoAlpha: 1, y: 0, scale: 1, duration: .5, stagger: .05, ease: 'back.out(2)'}, .4)
      .fromTo(part.actions, {autoAlpha: 0, y: 24}, {autoAlpha: 1, y: 0, duration: .6}, .5);
    if (art) popSpots(tl, part.artSpots, .8);
    return tl;
  };

  // cor da página, pontos e ficha ativa da peça da vez (a cor nova cobre a anterior, sem clarear no meio)
  let painted = 0;
  layers.forEach((layer, i) => { layer.style.zIndex = i ? 1 : 2; });
  const paint = index => {
    steps.forEach((step, i) => step.classList.toggle('is-active', i === index));
    slides.forEach((slide, i) => { slide.dataset.pos = i < index ? 'before' : i > index ? 'after' : 'active'; });
    dots.forEach((dot, i) => { if (i === index) dot.setAttribute('aria-current', 'true'); else dot.removeAttribute('aria-current'); });
    for (const name of ['--fit-bg-1', '--fit-bg-2', '--fit-bg-3', '--fit-accent', '--fit-ink']) story.style.setProperty(name, steps[index].style.getPropertyValue(name));
    if (index === painted) return;
    painted = index;
    layers.forEach((layer, i) => { layer.style.zIndex = i === index ? 2 : 1; });
    gsap.to(layers[index], {opacity: 1, duration: calm ? .4 : .9, ease: 'power2.out', overwrite: true,
      onComplete: () => layers.forEach((layer, i) => { if (i !== index) gsap.set(layer, {opacity: 0}); })});
  };
  // o fundo da página aparece quando a história chega na tela e sai quando ela vai embora
  const fade = on => gsap.to(backdrop, {opacity: on ? 1 : 0, duration: on ? 1 : .8, ease: 'power2.out', overwrite: true});
  ScrollTrigger.create({trigger: story, start: 'top 75%', end: 'bottom 40%', onToggle: self => fade(self.isActive)});
  dots.forEach((dot, i) => dot.addEventListener('click', event => { event.preventDefault(); goToStep(steps[i]); }));

  const mm = gsap.matchMedia();
  // ── desktop: tela fixa, uma ficha por vez ──
  mm.add('(min-width: 980px)', () => {
    tour.classList.add('is-pinned');
    gsap.set(parts.map(part => part.copy), {autoAlpha: 0});
    gsap.set(slides, {autoAlpha: 0});
    let shown = -1, running = null, inside = false;
    const show = index => {
      if (index === shown) return;
      const dir = index > shown ? 1 : -1;
      shown = index;
      running?.kill();
      const tl = gsap.timeline();
      // primeiro saem, inteiras, a ficha e a peça que estiverem na tela (0,4 s); só depois a próxima chega e se constrói
      const leaving = parts.filter((part, i) => i !== index && +gsap.getProperty(part.copy, 'opacity') > 0);
      leaving.forEach(part => tl.to(part.copy, calm ? {autoAlpha: 0, duration: .2} : {autoAlpha: 0, y: -30, duration: .4, ease: 'power2.in'}, 0));
      slides.forEach((slide, i) => {
        if (i === index || +gsap.getProperty(slide, 'opacity') === 0) return;
        tl.to(slide, calm ? {autoAlpha: 0, duration: .25} : {autoAlpha: 0, yPercent: -14 * dir, xPercent: -5 * dir, rotation: -7 * dir, scale: .9, duration: .4, ease: 'power2.in'}, 0);
      });
      if (index >= 0) {
        const at = leaving.length ? (calm ? .2 : .4) : 0;
        tl.fromTo(slides[index], calm ? {autoAlpha: 0} : {autoAlpha: 0, yPercent: 16 * dir, xPercent: 6 * dir, rotation: 9 * dir, scale: .9},
          calm ? {autoAlpha: 1, duration: .35} : {autoAlpha: 1, yPercent: 0, xPercent: 0, rotation: 0, scale: 1, duration: 1.15, ease: 'expo.out'}, at);
        tl.add(reveal(parts[index]), at);
        if (!calm) popSpots(tl, stageSpots[index], at + .85);
        paint(index);
      }
      running = tl;
    };
    // a peça da vez sai da posição dentro da tela fixa (a cada 88% de tela rolada, a próxima)
    const segment = ScrollTrigger.create({trigger: story, start: 'top top', end: 'bottom bottom', onUpdate: self => { if (inside) show(Math.round(self.progress * (steps.length - 1))); }});
    const current = () => Math.round(segment.progress * (steps.length - 1));
    // a primeira ficha dispara quando a história chega a 75% da tela; rolar de volta para cima a esconde
    ScrollTrigger.create({trigger: story, start: 'top 75%', end: 'bottom top',
      onEnter: () => { inside = true; show(current()); }, onEnterBack: () => { inside = true; show(current()); },
      onLeaveBack: () => { inside = false; show(-1); }, onLeave: () => { inside = false; }});
    goToStep = step => {
      const i = steps.indexOf(step), y = segment.start + i * (segment.end - segment.start) / Math.max(1, steps.length - 1);
      if (lenis) lenis.scrollTo(y, {duration: 1.6, easing: easeInOut}); else scrollTo({top: y, behavior});
    };
    return () => {
      running?.kill();
      goToStep = scrollToStep;
      tour.classList.remove('is-pinned');
      const all = [...slides, ...stageSpots.flat(), ...parts.flatMap(pieces)];
      gsap.killTweensOf(all);
      gsap.set(all, {clearProps: 'opacity,visibility,transform'});
    };
  });
  // ── telas menores: cada ficha, com a sua peça, dispara ao chegar a 75% da tela ──
  mm.add('(max-width: 979px)', () => {
    const played = new Map();
    parts.forEach((part, i) => {
      gsap.set([part.copy, part.art].filter(Boolean), {autoAlpha: 0});
      ScrollTrigger.create({trigger: part.step, start: 'top 75%',
        onEnter: () => { played.get(i)?.kill(); played.set(i, reveal(part, {art: true})); },
        onLeaveBack: () => played.get(i)?.timeScale(1.8).reverse()});
      ScrollTrigger.create({trigger: part.step, start: 'top 50%', end: 'bottom 50%', onToggle: self => { if (self.isActive) paint(i); }});
    });
    return () => {
      played.forEach(tl => tl.kill());
      const all = parts.flatMap(pieces);
      gsap.killTweensOf(all);
      gsap.set(all, {clearProps: 'opacity,visibility,transform'});
    };
  });

  // títulos da seção, carrossel e "Escolha o seu": também disparam a 75% e rodam até o fim
  for (const el of tour.querySelectorAll('.fit-tour-head, .fit-more-head, .fit-carousel, .fit-tour-end')) {
    gsap.fromTo(el, calm ? {autoAlpha: 0} : {autoAlpha: 0, y: 40}, {autoAlpha: 1, y: 0, duration: calm ? .35 : 1, ease: 'power3.out',
      scrollTrigger: {trigger: el, start: 'top 75%', toggleActions: 'play none none reverse'}});
  }
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
}

// Visão geral: dividida em palavras já traduzidas (o i18n.js não mexe nela: translate="no"). Trocar o idioma refaz a
// divisão com o texto novo.
function overview(para, {ScrollTrigger, SplitText}) {
  const source = para.dataset.text;
  let split = null;
  const build = () => {
    split?.revert();
    para.setAttribute('translate', 'no');
    para.textContent = translate(source);
    split = SplitText.create(para, {type: 'words,lines', mask: 'lines', tag: 'span', linesClass: 'fit-line', wordsClass: 'fit-word', aria: 'auto', autoSplit: true});
  };
  build();
  addEventListener('ju:language', () => { build(); ScrollTrigger.refresh(); });
  return () => split;
}

// ── reserva sem bibliotecas ──────────────────────────────────────────────────────────────────────────────────────
function reveal() {
  if (supports('animation-timeline: view()') || calm || !('IntersectionObserver' in window)) return;
  tour.classList.add('is-ready');
  const seen = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('is-in'); seen.unobserve(entry.target); }
  }, {rootMargin: '0px 0px -8% 0px', threshold: .05});
  tour.querySelectorAll('.fit-reveal, .fit-carousel, .fit-step-art').forEach(el => seen.observe(el));
}

function story() {
  const story = tour.querySelector('.fit-story');
  if (!story) return;
  const steps = [...story.querySelectorAll('.fit-step')], slides = [...story.querySelectorAll('.fit-slide')], dots = [...story.querySelectorAll('.fit-dots a')];
  let active = -1;
  const activate = index => {
    if (index === active || index < 0) return;
    active = index;
    steps.forEach((step, i) => step.classList.toggle('is-active', i === index));
    slides.forEach((slide, i) => { slide.dataset.pos = i < index ? 'before' : i > index ? 'after' : 'active'; });
    dots.forEach((dot, i) => { if (i === index) dot.setAttribute('aria-current', 'true'); else dot.removeAttribute('aria-current'); });
    for (const name of ['--fit-bg-1', '--fit-bg-2', '--fit-bg-3', '--fit-accent', '--fit-ink']) story.style.setProperty(name, steps[index].style.getPropertyValue(name));
  };
  activate(0);
  // a ativa é a última ficha cujo topo já passou do meio da tela; recalculada sempre que alguma ficha entra, sai ou
  // cruza um quarto da tela, então uma rolagem rápida (que pula fichas inteiras) também chega na peça certa
  if ('IntersectionObserver' in window) {
    const pick = () => { const middle = innerHeight / 2; let index = 0; steps.forEach((step, i) => { if (step.getBoundingClientRect().top <= middle) index = i; }); activate(index); };
    const watch = new IntersectionObserver(pick, {threshold: [0, .25, .5, .75, 1]});
    steps.forEach(step => watch.observe(step));
  }
  dots.forEach((dot, i) => dot.addEventListener('click', event => { event.preventDefault(); goToStep(steps[i]); }));
}

// ── sempre: pontos sobre a peça, flutuar só perto da tela e o carrossel ─────────────────────────────────────────
// Pontos: passar o mouse ou focar abre o cartãozinho (CSS); tocar abre e fecha (um de cada vez), tocar fora ou Esc fecha.
// O cartãozinho é empurrado para dentro da tela se for sair dela (--tip-shift).
function spots() {
  const all = [...tour.querySelectorAll('.fit-spot')];
  const fit = spot => {
    const tip = spot.querySelector('.fit-tip');
    spot.style.setProperty('--tip-shift', '0px');
    requestAnimationFrame(() => {
      const box = tip.getBoundingClientRect(), pad = 10, width = document.documentElement.clientWidth;
      const shift = box.left < pad ? pad - box.left : box.right > width - pad ? width - pad - box.right : 0;
      spot.style.setProperty('--tip-shift', `${Math.round(shift)}px`);
    });
  };
  const close = except => all.forEach(spot => { if (spot !== except) spot.setAttribute('aria-expanded', 'false'); });
  all.forEach(spot => {
    spot.addEventListener('pointerenter', () => fit(spot));
    spot.addEventListener('focus', () => fit(spot));
    spot.addEventListener('click', event => {
      event.stopPropagation();
      const open = spot.getAttribute('aria-expanded') !== 'true';
      close(spot);
      spot.setAttribute('aria-expanded', String(open));
      if (open) fit(spot);
    });
  });
  document.addEventListener('click', () => close());
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
}

function near() {
  if (!('IntersectionObserver' in window)) { tour.querySelectorAll('.fit-figure').forEach(figure => figure.classList.add('is-near')); return; }
  const watch = new IntersectionObserver(entries => entries.forEach(entry => entry.target.classList.toggle('is-near', entry.isIntersecting)), {rootMargin: '15% 0px'});
  tour.querySelectorAll('.fit-figure').forEach(figure => watch.observe(figure));
}

// Carrossel das peças da categoria: deslizar com o dedo (rolagem nativa com encaixe), arrastar com o mouse (com
// impulso), setas e teclas ← →. No celular o cartão da vez fica no centro, e as bolinhas mostram qual é e levam a cada
// um. Tocar num cartão leva à ficha técnica da peça, lá em cima.
function carousel() {
  const more = tour.querySelector('.fit-more');
  if (!more) return;
  const track = more.querySelector('.fit-track'), prev = more.querySelector('.fit-prev'), next = more.querySelector('.fit-next');
  const cards = [...track.children], dots = [...more.querySelectorAll('.fit-pager button')];
  const pitch = () => (track.firstElementChild?.getBoundingClientRect().width || 280) + (parseFloat(getComputedStyle(track).columnGap) || 16);
  const max = () => track.scrollWidth - track.clientWidth;
  // o cartão mais perto do centro da faixa (as posições são dentro da faixa, que é position: relative)
  const centre = () => {
    const middle = track.scrollLeft + track.clientWidth / 2;
    let best = 0, distance = Infinity;
    cards.forEach((card, i) => { const d = Math.abs(card.offsetLeft + card.offsetWidth / 2 - middle); if (d < distance) { distance = d; best = i; } });
    return best;
  };
  let frame = 0;
  const update = () => {
    frame = 0;
    const end = max(), active = centre();
    more.classList.toggle('is-static', end < 4);
    prev.disabled = track.scrollLeft < 4;
    next.disabled = track.scrollLeft > end - 4;
    dots.forEach((dot, i) => { if (i === active) dot.setAttribute('aria-current', 'true'); else dot.removeAttribute('aria-current'); });
  };
  dots.forEach((dot, i) => dot.addEventListener('click', () => {
    const card = cards[i];
    track.scrollTo({left: Math.max(0, Math.min(max(), card.offsetLeft + card.offsetWidth / 2 - track.clientWidth / 2)), behavior});
  }));
  const later = () => { frame ||= requestAnimationFrame(update); };
  track.addEventListener('scroll', later, {passive: true});
  addEventListener('resize', later, {passive: true});
  update();
  const go = dir => track.scrollBy({left: dir * pitch(), behavior});
  prev.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));
  track.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    go(event.key === 'ArrowRight' ? 1 : -1);
  });
  track.addEventListener('click', event => {
    const link = event.target.closest('.fit-card-link');
    if (!link) return;
    event.preventDefault();
    goToStep(document.getElementById(`consultas-${link.dataset.item}`));
  });

  // arrastar com o mouse (no toque, a rolagem nativa já desliza e encaixa): segue o mouse e, ao soltar, continua com o
  // impulso do gesto até o cartão mais próximo; o clique que vem depois de arrastar não abre o cartão
  let drag = null;
  track.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    drag = {id: event.pointerId, x: event.clientX, left: track.scrollLeft, moved: false, last: event.clientX, time: performance.now(), speed: 0};
  });
  track.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 5) { drag.moved = true; track.classList.add('is-dragging'); track.setPointerCapture?.(event.pointerId); }
    if (!drag.moved) return;
    track.scrollLeft = drag.left - dx;
    const now = performance.now();
    drag.speed = (event.clientX - drag.last) / Math.max(1, now - drag.time);
    drag.last = event.clientX; drag.time = now;
  });
  const release = event => {
    if (!drag || event.pointerId !== drag.id) return;
    const {moved, speed} = drag;
    drag = null;
    if (!moved) return;
    track.classList.remove('is-dragging');
    const size = pitch(), target = Math.round((track.scrollLeft - (calm ? 0 : speed * 280)) / size) * size;
    track.scrollTo({left: Math.max(0, Math.min(max(), target)), behavior});
    const swallow = click => { click.preventDefault(); click.stopPropagation(); };
    track.addEventListener('click', swallow, {capture: true, once: true});
    setTimeout(() => track.removeEventListener('click', swallow, {capture: true}), 0);
  };
  track.addEventListener('pointerup', release);
  track.addEventListener('pointercancel', release);
}

if (tour) {
  tour.dataset.motion = '';
  spots();
  near();
  carousel();
  Promise.all(LIBS.map(loadScript)).then(cinema).catch(error => {
    console.warn('O 3D nas suas consultas: modo de reserva', error?.message || error);
    tour.classList.remove('is-gsap', 'is-pinned');
    reveal();
    story();
  });
}
