// One passive listener and at most one update per frame; no layout reads on scroll.
export function setupScrollHeader(header) {
  if (!header) return;
  const spacer = document.createElement('div');
  spacer.className = 'header-space'; spacer.setAttribute('aria-hidden', 'true');
  header.after(spacer);
  // The header's height in the page flow comes from a ResizeObserver (after layout): nothing here reads layout while the page
  // is being built (PageSpeed, 2026-10-08: offsetHeight and scrollY read right after the shell's DOM writes forced a reflow).
  // Until that first measure no frame draws; the measure draws the first one.
  let height = 0, last = null, distance = 0, frame = 0, forcedUntil = 0;
  let floating = false, shown = false, positioningFrame = 0;
  const draw = () => {
    frame = 0;
    if (!height) return;
    const y = Math.max(0, scrollY), delta = last === null ? 0 : y - last;
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
  // In the flow the observer has the height; floating, the header has its compact height, so it is ignored then.
  const measured = size => {
    if (floating || !size) return;
    const first = !height;
    height = size;
    if (first) draw();
  };
  if ('ResizeObserver' in window) new ResizeObserver(([entry]) => measured(entry.borderBoxSize?.[0]?.blockSize ?? entry.target.offsetHeight)).observe(header);
  else requestAnimationFrame(() => measured(header.offsetHeight));
  // A resize while floating: the height in the flow is read without the floating style for a moment (only then).
  window.addEventListener('resize', () => {
    if (floating) { header.classList.remove('is-floating'); height = header.offsetHeight || height; header.classList.toggle('is-floating', floating); }
    schedule();
  }, {passive:true});
  window.addEventListener('ju:cart-feedback', () => {
    forcedUntil = performance.now() + 1500; shown = true; schedule();
    header.classList.remove('cart-notified');
    requestAnimationFrame(() => header.classList.add('cart-notified'));
    setTimeout(() => header.classList.remove('cart-notified'), 850);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Tab') {forcedUntil = performance.now() + 600; shown = true; schedule();} });
  // a page restored by Back/Forward redraws; a fresh load is drawn by the first measure
  window.addEventListener('pageshow', e => { if (e.persisted) schedule(); });
}
