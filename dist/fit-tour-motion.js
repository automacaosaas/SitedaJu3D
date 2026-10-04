// Movimento de "O 3D nas suas consultas" (fit-tour.js monta o HTML, que já vem pronto em index.html).
//
// Modo cinema — GSAP + ScrollTrigger + SplitText + Lenis (dist/vendor, carregados só aqui, sem bloquear a página):
// · Lenis suaviza a roda do mouse na página inteira (o toque continua nativo); janelas, gavetas e o carrossel rolam
//   por conta própria, e ele para enquanto a área do produto está aberta;
// · a rolagem vira uma posição contínua entre as peças (0 → 1 → 2 → 3). Dela saem, sem conflito entre animações:
//   a cor de fundo da página inteira (uma camada fixa por peça, só opacidade), a peça fixa à direita (a que sai sobe e
//   gira para um lado, a próxima chega de baixo girando do outro; só transform e opacidade) e a ficha ativa;
// · a ficha se constrói com a rolagem, na velocidade dela (scrub): as letras do nome sobem de dentro de uma máscara por
//   linha, as palavras da visão geral sobem e acendem em sequência, as linhas da ficha técnica entram em cascata e,
//   ao sair, a ficha inteira sobe e esmaece. Cada linha ganha força no centro da tela e esmaece de leve ao passar dele;
// · a visão geral é dividida já no idioma escolhido (i18n.js) e refeita quando a pessoa troca o idioma.
// Com movimento reduzido: sem Lenis e sem deslocamentos; o fundo e a peça só trocam por opacidade.
//
// Reserva — se as bibliotecas não carregarem: o reveal do CSS (animation-timeline: view()) e a peça ativa por
// IntersectionObserver, como antes.
import {translate} from './i18n.js';

const tour = document.querySelector('[data-fit-tour]');
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const supports = rule => !!window.CSS?.supports?.(rule);
const behavior = calm ? 'auto' : 'smooth';
const LIBS = ['vendor/gsap.min.js', 'vendor/ScrollTrigger.min.js', 'vendor/SplitText.min.js', 'vendor/lenis.min.js'];
const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
let lenis = null;

// Leva até uma ficha (pontos da história e cartões do carrossel): com o Lenis, a mesma rolagem suave da página.
// O topo da ficha para a 7% da tela (scroll-margin-top da .fit-step, que o Lenis e o scrollIntoView respeitam).
function goToStep(step) {
  if (!step) return;
  if (lenis) lenis.scrollTo(step, {duration: 1.6, easing: easeInOut});
  else step.scrollIntoView({behavior, block: 'start'});
}

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

  // posição contínua entre as peças → fundo, peça fixa e ficha ativa
  const progress = steps.map(() => 0), ease = gsap.parseEase('power2.inOut');
  let enter = 0, leave = 0, active = -1;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const render = () => {
    const p = progress.reduce((sum, value) => sum + ease(value), 0);
    backdrop.style.opacity = (enter * (1 - leave)).toFixed(3);
    layers.forEach((layer, i) => { if (i) layer.style.opacity = clamp(p - (i - 1), 0, 1).toFixed(3); });
    slides.forEach((slide, i) => {
      const d = clamp(i - p, -1, 1), a = Math.abs(d), opacity = clamp(1 - a * 1.75, 0, 1);
      slide.style.opacity = opacity.toFixed(3);
      slide.style.visibility = opacity > .002 ? 'visible' : 'hidden';
      // a que sai sobe e gira para a esquerda; a próxima chega de baixo, da direita, girando ao contrário até assentar
      slide.style.transform = calm ? 'none' : `translate3d(${(d * 7).toFixed(2)}%, ${(d * (d > 0 ? 26 : 20)).toFixed(2)}%, 0) rotate(${(d * (d > 0 ? 10 : 8)).toFixed(2)}deg) scale(${(1 - a * .14).toFixed(3)})`;
    });
    const index = clamp(Math.round(p), 0, steps.length - 1);
    if (index === active) return;
    active = index;
    steps.forEach((step, i) => step.classList.toggle('is-active', i === index));
    slides.forEach((slide, i) => { slide.dataset.pos = i < index ? 'before' : i > index ? 'after' : 'active'; });
    dots.forEach((dot, i) => { if (i === index) dot.setAttribute('aria-current', 'true'); else dot.removeAttribute('aria-current'); });
    for (const name of ['--fit-bg-1', '--fit-bg-2', '--fit-bg-3', '--fit-accent', '--fit-ink']) story.style.setProperty(name, steps[index].style.getPropertyValue(name));
  };
  const follow = (trigger, start, end, use) => ScrollTrigger.create({trigger, start, end, onUpdate: self => use(self.progress), onRefresh: self => use(self.progress)});
  steps.forEach((step, i) => { if (i) follow(step, 'top 85%', 'top 35%', value => { progress[i] = value; render(); }); });
  follow(story, 'top bottom', 'top 30%', value => { enter = value; render(); });
  follow(story, 'bottom 85%', 'bottom 25%', value => { leave = value; render(); });
  render();
  dots.forEach((dot, i) => dot.addEventListener('click', event => { event.preventDefault(); goToStep(steps[i]); }));

  if (calm) return;
  const scrub = (trigger, start, end) => ({trigger, start, end, scrub: true});
  // foco: a linha acende ao subir da borda de baixo, fica inteira no meio da tela e esmaece de leve ao passar do centro
  const focusAt = p => { const f = 1 - p; return f > .82 ? gsap.utils.mapRange(.82, 1, 1, .15, f) : f < .3 ? gsap.utils.mapRange(0, .3, .32, 1, f) : 1; };
  const focus = elements => [...elements].map(el => follow(el, 'top bottom', 'bottom top', p => { el.style.opacity = focusAt(p).toFixed(3); }));
  const unfocus = self => { self.fitFocus?.forEach(trigger => trigger.kill()); self.fitFocus = null; };

  for (const step of steps) {
    const copy = step.querySelector('.fit-step-copy'), family = step.querySelector('.fit-family'), name = step.querySelector('.fit-name');
    const badge = step.querySelector('.fit-soon'), para = step.querySelector('.fit-overview'), label = step.querySelector('.fit-label');
    const rows = [...step.querySelectorAll('.fit-specs > div')], actions = step.querySelector('.fit-actions');
    gsap.from(family, {y: 28, autoAlpha: 0, ease: 'none', scrollTrigger: scrub(family, 'top 97%', 'top 76%')});
    focus(family.children);
    // nome: cada letra sobe de dentro da máscara da linha, da esquerda para a direita
    SplitText.create(name, {type: 'chars,lines', mask: 'lines', tag: 'span', linesClass: 'fit-line', charsClass: 'fit-char', aria: 'auto', autoSplit: true,
      onSplit: self => { self.fitFocus = focus(self.masks); return gsap.from(self.chars, {yPercent: 118, ease: 'none', stagger: .05, scrollTrigger: scrub(name, 'top 97%', 'top 62%')}); },
      onRevert: unfocus});
    if (badge) gsap.from(badge, {autoAlpha: 0, scale: .7, ease: 'none', scrollTrigger: scrub(badge, 'top 92%', 'top 70%')});
    overview(para, {gsap, ScrollTrigger, SplitText, scrub, focus, unfocus});
    gsap.from(label, {y: 20, autoAlpha: 0, ease: 'none', scrollTrigger: scrub(label, 'top 96%', 'top 80%')});
    // ficha técnica em cascata: uma linha, depois a outra
    gsap.from(rows, {y: 36, autoAlpha: 0, ease: 'none', stagger: .24, scrollTrigger: scrub(rows[0], 'top 97%', 'top 60%')});
    rows.forEach(row => focus(row.children));
    gsap.from(actions, {y: 28, autoAlpha: 0, ease: 'none', scrollTrigger: scrub(actions, 'top 99%', 'top 86%')});
    // ao sair, a ficha inteira sobe e esmaece enquanto a próxima se constrói
    gsap.fromTo(copy, {y: 0, autoAlpha: 1}, {y: -72, autoAlpha: 0, ease: 'none', immediateRender: false, scrollTrigger: scrub(copy, 'bottom 32%', 'bottom 2%')});
  }
  // telas menores: cada ficha traz a sua peça, que chega girando de leve
  gsap.matchMedia().add('(max-width: 979px)', () => {
    for (const art of story.querySelectorAll('.fit-step-art')) gsap.from(art, {yPercent: 14, rotation: 6, scale: .9, autoAlpha: 0, ease: 'none', scrollTrigger: scrub(art, 'top 99%', 'top 58%')});
  });
  for (const el of tour.querySelectorAll('.fit-tour-head, .fit-more-head, .fit-carousel, .fit-tour-end')) gsap.from(el, {y: 44, autoAlpha: 0, ease: 'none', scrollTrigger: scrub(el, 'top 98%', 'top 72%')});
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
}

// Visão geral: dividida em palavras já traduzidas (o i18n.js não mexe nela: translate="no"); cada palavra sobe da
// máscara da linha e acende em sequência. Trocar o idioma refaz a divisão com o texto novo.
function overview(para, {gsap, ScrollTrigger, SplitText, scrub, focus, unfocus}) {
  const source = para.dataset.text;
  let split = null;
  const build = () => {
    split?.revert();
    para.setAttribute('translate', 'no');
    para.textContent = translate(source);
    split = SplitText.create(para, {type: 'words,lines', mask: 'lines', tag: 'span', linesClass: 'fit-line', wordsClass: 'fit-word', aria: 'auto', autoSplit: true,
      onSplit: self => { self.fitFocus = focus(self.masks); return gsap.from(self.words, {yPercent: 100, opacity: .15, ease: 'none', stagger: .035, scrollTrigger: scrub(para, 'top 94%', 'top 50%')}); },
      onRevert: unfocus});
  };
  build();
  addEventListener('ju:language', () => { build(); ScrollTrigger.refresh(); });
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

// ── sempre: flutuar só perto da tela e o carrossel ───────────────────────────────────────────────────────────────
function near() {
  if (!('IntersectionObserver' in window)) { tour.querySelectorAll('.fit-figure').forEach(figure => figure.classList.add('is-near')); return; }
  const watch = new IntersectionObserver(entries => entries.forEach(entry => entry.target.classList.toggle('is-near', entry.isIntersecting)), {rootMargin: '15% 0px'});
  tour.querySelectorAll('.fit-figure').forEach(figure => watch.observe(figure));
}

// Carrossel das peças da categoria: deslizar com o dedo (rolagem nativa com encaixe), arrastar com o mouse (com
// impulso), setas e teclas ← →. Tocar num cartão leva à ficha técnica da peça, lá em cima.
function carousel() {
  const more = tour.querySelector('.fit-more');
  if (!more) return;
  const track = more.querySelector('.fit-track'), prev = more.querySelector('.fit-prev'), next = more.querySelector('.fit-next'), bar = more.querySelector('.fit-progress');
  const timeline = supports('animation-timeline: scroll()');
  const pitch = () => (track.firstElementChild?.getBoundingClientRect().width || 280) + (parseFloat(getComputedStyle(track).columnGap) || 16);
  const max = () => track.scrollWidth - track.clientWidth;
  let frame = 0;
  const update = () => {
    frame = 0;
    const end = max();
    more.classList.toggle('is-static', end < 4);
    prev.disabled = track.scrollLeft < 4;
    next.disabled = track.scrollLeft > end - 4;
    if (!timeline) bar.style.setProperty('--p', end > 0 ? (track.scrollLeft / end).toFixed(3) : '0');
  };
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
  near();
  carousel();
  Promise.all(LIBS.map(loadScript)).then(cinema).catch(error => {
    console.warn('O 3D nas suas consultas: modo de reserva', error?.message || error);
    tour.classList.remove('is-gsap');
    reveal();
    story();
  });
}
