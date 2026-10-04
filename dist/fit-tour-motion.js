// Movimento de "O 3D nas suas consultas" (fit-tour.js monta o HTML, que já vem pronto em index.html):
// · a ficha que cruza o meio da tela é a ativa: a peça fixa à direita troca para a dela (sai para cima, a nova sobe de
//   baixo) e a faixa muda para as cores dela; os pontos mostram onde a pessoa está e levam a cada peça;
// · o reveal das linhas da ficha é do CSS (animation-timeline: view()); aqui só o substituto para os navegadores sem isso;
// · a peça só flutua perto da tela;
// · carrossel das peças da categoria: deslizar com o dedo (rolagem nativa com encaixe), arrastar com o mouse (com
//   impulso), setas e teclas ← →. Com movimento reduzido, nada desliza: as trocas são diretas.
const tour = document.querySelector('[data-fit-tour]');
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const supports = rule => !!window.CSS?.supports?.(rule);
const behavior = calm ? 'auto' : 'smooth';

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
  dots.forEach((dot, i) => dot.addEventListener('click', event => { event.preventDefault(); steps[i].scrollIntoView({behavior, block: 'start'}); }));
}

function near() {
  if (!('IntersectionObserver' in window)) { tour.querySelectorAll('.fit-figure').forEach(figure => figure.classList.add('is-near')); return; }
  const watch = new IntersectionObserver(entries => entries.forEach(entry => entry.target.classList.toggle('is-near', entry.isIntersecting)), {rootMargin: '15% 0px'});
  tour.querySelectorAll('.fit-figure').forEach(figure => watch.observe(figure));
}

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
  reveal();
  story();
  near();
  carousel();
}
