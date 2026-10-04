// Movimento de "O 3D nas suas consultas" (fit-tour.js monta o HTML, que já vem pronto em index.html):
// · cada bloco entra quando chega na tela (IntersectionObserver); a peça só flutua quando o capítulo está perto da tela;
// · na família com mais de uma peça: setas, deslizar o dedo, pontos e teclas ← →. O avanço automático é o próprio
//   preenchimento do ponto ativo (animação CSS): pausa com o mouse ou o foco em cima e fora da tela, e para de vez
//   quando a pessoa troca a peça. Com movimento reduzido não há avanço automático nem deslocamento, só a troca.
const tour = document.querySelector('[data-fit-tour]');
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = {out: 'cubic-bezier(.16, 1, .3, 1)', swap: 'cubic-bezier(.65, 0, .35, 1)', exit: 'cubic-bezier(.4, 0, 1, 1)'};

function reveal(blocks) {
  if (!('IntersectionObserver' in window) || calm) return;
  tour.classList.add('is-ready');
  const seen = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-in');
      seen.unobserve(entry.target);
      // depois da entrada, as trocas de peça não esperam os atrasos escalonados
      setTimeout(() => entry.target.classList.add('is-revealed'), 1500);
    }
  }, {rootMargin: '0px 0px -14% 0px', threshold: .12});
  blocks.forEach(block => block && seen.observe(block));
}

function family(chapter) {
  const stage = chapter.querySelector('.fit-stage'), slides = [...chapter.querySelectorAll('.fit-slide')], copies = [...chapter.querySelectorAll('.fit-copy')];
  const dots = [...chapter.querySelectorAll('.fit-dots button')];
  const live = document.createElement('p');
  live.className = 'sr-only'; live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true');
  chapter.querySelector('.fit-sheet').append(live);
  let index = 0, settle = null, auto = !calm && slides.length > 1, hover = false, focus = false, shown = false;

  // tudo empilhado no mesmo lugar; só a ativa recebe foco e leitura
  const mark = () => {
    for (const list of [slides, copies]) list.forEach((el, i) => { el.hidden = false; el.classList.toggle('is-active', i === index); el.inert = i !== index; if (i === index) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', 'true'); });
    dots.forEach((dot, i) => dot.setAttribute('aria-pressed', String(i === index)));
    for (const name of ['--fit-stops', '--fit-accent', '--fit-ink']) chapter.style.setProperty(name, slides[index].style.getPropertyValue(name));
  };
  const pause = () => stage.classList.toggle('is-paused', hover || focus || !shown || document.hidden);
  mark();
  if (slides.length < 2) return;

  function go(next, dir, byPerson) {
    next = (next + slides.length) % slides.length;
    if (next === index) return;
    settle?.();
    if (byPerson && auto) { auto = false; stage.classList.remove('is-auto'); }
    const from = index, outSlide = slides[from], inSlide = slides[next], outCopy = copies[from], inCopy = copies[next];
    index = next;
    outSlide.classList.add('is-leaving'); outCopy.classList.add('is-leaving');
    mark();
    if (byPerson) live.textContent = `${inCopy.querySelector('h3').firstChild.textContent}, produto ${next + 1} de ${slides.length}.`;
    const shift = calm ? 0 : 7 * dir, figure = slide => slide.querySelector('.fit-figure');
    const running = [
      // a peça que sai recua para o lado e desfoca; a que entra vem do outro lado, sobre o degradê dela, que cobre o anterior
      figure(outSlide).animate([{opacity: 1, transform: 'none', filter: 'blur(0)'}, {opacity: 0, transform: `translate3d(${-shift}%, 0, 0) scale(${calm ? 1 : .955})`, filter: `blur(${calm ? 0 : 6}px)`}], {duration: calm ? 260 : 620, easing: EASE.exit, fill: 'forwards'}),
      inSlide.querySelector('.fit-wash').animate([{opacity: 0}, {opacity: 1}], {duration: calm ? 260 : 900, easing: EASE.swap}),
      figure(inSlide).animate([{opacity: 0, transform: `translate3d(${shift}%, 0, 0) scale(${calm ? 1 : .955})`, filter: `blur(${calm ? 0 : 6}px)`}, {opacity: 1, transform: 'none', filter: 'blur(0)'}], {duration: calm ? 260 : 1050, delay: calm ? 0 : 160, easing: EASE.out, fill: 'backwards'}),
      outCopy.animate([{opacity: 1, transform: 'none'}, {opacity: 0, transform: `translate3d(0, ${calm ? 0 : -10}px, 0)`}], {duration: calm ? 200 : 300, easing: EASE.exit, fill: 'forwards'}),
      ...[inCopy.querySelector('h3'), inCopy.querySelector('.fit-line'), ...inCopy.querySelectorAll('.fit-facts li'), inCopy.querySelector('.fit-link')].map((el, i) =>
        el.animate([{opacity: 0, transform: `translate3d(0, ${calm ? 0 : 14}px, 0)`}, {opacity: 1, transform: 'none'}], {duration: calm ? 220 : 700, delay: calm ? 120 : 220 + i * 55, easing: EASE.out, fill: 'backwards'}))
    ];
    // ao terminar (ou já na troca seguinte, se a pessoa for mais rápida) o estado final fica só nas classes
    const done = () => { if (settle !== done) return; settle = null; outSlide.classList.remove('is-leaving'); outCopy.classList.remove('is-leaving'); running.forEach(animation => animation.cancel()); };
    settle = done;
    Promise.all(running.map(animation => animation.finished.catch(() => {}))).then(done);
  }

  chapter.querySelector('.fit-prev')?.addEventListener('click', () => go(index - 1, -1, true));
  chapter.querySelector('.fit-next')?.addEventListener('click', () => go(index + 1, 1, true));
  dots.forEach((dot, i) => dot.addEventListener('click', () => go(i, i > index ? 1 : -1, true)));
  stage.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    go(index + (event.key === 'ArrowRight' ? 1 : -1), event.key === 'ArrowRight' ? 1 : -1, true);
  });

  // deslizar: a peça acompanha o dedo (com resistência) e passa adiante se o gesto foi para o lado
  let drag = null;
  stage.addEventListener('pointerdown', event => {
    if ((event.pointerType === 'mouse' && event.button !== 0) || event.target.closest('button')) return;
    drag = {id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, horizontal: null, figure: slides[index].querySelector('.fit-figure')};
  });
  stage.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (drag.horizontal === null && Math.hypot(dx, dy) > 8) { drag.horizontal = Math.abs(dx) > Math.abs(dy); if (drag.horizontal) stage.setPointerCapture?.(event.pointerId); }
    if (!drag.horizontal) return;
    drag.dx = dx;
    if (!calm) drag.figure.style.transform = `translate3d(${dx * .35}px, 0, 0)`;
  });
  const release = event => {
    if (!drag || event.pointerId !== drag.id) return;
    const {dx, horizontal, figure} = drag, current = figure.style.transform;
    drag = null;
    figure.style.transform = '';
    if (horizontal && Math.abs(dx) > 44 && event.type === 'pointerup') { go(index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1, true); return; }
    if (current && !calm) figure.animate([{transform: current}, {transform: 'none'}], {duration: 520, easing: EASE.out});
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  // avanço automático: termina o preenchimento do ponto ativo → próxima peça
  if (auto) {
    stage.classList.add('is-auto');
    stage.addEventListener('animationend', event => { if (auto && event.animationName === 'fit-progress') go(index + 1, 1, false); });
    if (matchMedia('(hover: hover)').matches) {
      stage.addEventListener('pointerenter', () => { hover = true; pause(); });
      stage.addEventListener('pointerleave', () => { hover = false; pause(); });
    }
    stage.addEventListener('focusin', () => { focus = true; pause(); });
    stage.addEventListener('focusout', event => { if (!stage.contains(event.relatedTarget)) { focus = false; pause(); } });
    document.addEventListener('visibilitychange', pause);
    new IntersectionObserver(([entry]) => { shown = entry.isIntersecting; pause(); }, {threshold: .55}).observe(stage);
    pause();
  }
}

if (tour) {
  tour.dataset.motion = '';
  const chapters = [...tour.querySelectorAll('.fit-chapter')];
  reveal([tour.querySelector('.fit-tour-head'), ...chapters, tour.querySelector('.fit-tour-end')]);
  // flutua só o que está perto da tela
  if ('IntersectionObserver' in window) {
    const near = new IntersectionObserver(entries => entries.forEach(entry => entry.target.classList.toggle('is-near', entry.isIntersecting)), {rootMargin: '20% 0px'});
    chapters.forEach(chapter => near.observe(chapter));
  } else chapters.forEach(chapter => chapter.classList.add('is-near'));
  chapters.forEach(family);
}
