// One passive listener and at most one update per frame; no layout reads on scroll.
export function setupScrollHeader(header) {
  if (!header) return;
  const spacer = document.createElement('div');
  spacer.className = 'header-space'; spacer.setAttribute('aria-hidden', 'true');
  header.after(spacer);
  let height = header.offsetHeight, last = Math.max(0, scrollY), distance = 0, frame = 0, forcedUntil = 0;
  let floating = false, shown = false, positioningFrame = 0;
  const draw = () => {
    frame = 0;
    const y = Math.max(0, scrollY), delta = y - last;
    const wasFloating = floating;
    if (y > 8) header.classList.add('has-scrolled');
    distance = Math.sign(delta) === Math.sign(distance) ? distance + delta : delta;
    if (y <= 8) {floating = false; shown = true;}
    else {
      floating = floating || y > height || delta < -2 || performance.now() < forcedUntil;
      if (Math.abs(distance) > 8) shown = distance < 0;
      if (delta > 8) forcedUntil = 0;
      const usingKeyboard = header.contains(document.activeElement) && document.activeElement.matches(':focus-visible');
      if (performance.now() < forcedUntil || usingKeyboard || header.querySelector('[aria-expanded="true"]')) shown = true;
    }
    if (floating !== wasFloating) {
      // Switching from document flow to fixed must be atomic. Otherwise the
      // translate transition starts at the viewport top and flashes back in.
      cancelAnimationFrame(positioningFrame);
      header.classList.add('is-positioning');
      positioningFrame = requestAnimationFrame(() => {
        positioningFrame = requestAnimationFrame(() => header.classList.remove('is-positioning'));
      });
    }
    spacer.style.height = floating ? `${height}px` : '0px';
    header.classList.toggle('is-floating', floating);
    header.classList.toggle('is-revealed', shown);
    // Hidden controls should not remain in the tab sequence. Reveal on keyboard use.
    header.toggleAttribute('inert', floating && !shown);
    last = y;
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
  window.addEventListener('scroll', schedule, {passive:true});
  window.addEventListener('resize', () => {
    header.classList.remove('is-floating'); height = header.offsetHeight;
    header.classList.toggle('is-floating', floating); schedule();
  }, {passive:true});
  window.addEventListener('ju:cart-feedback', () => {
    forcedUntil = performance.now() + 1500; shown = true; schedule();
    header.classList.remove('cart-notified');
    requestAnimationFrame(() => header.classList.add('cart-notified'));
    setTimeout(() => header.classList.remove('cart-notified'), 850);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Tab') {forcedUntil = performance.now() + 600; shown = true; schedule();} });
  window.addEventListener('pageshow', schedule);
  draw();
}
