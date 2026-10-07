// O resumo da compra da peça recolhe e abre (06/10/2026, pedido do Luiz: "a linha que a pessoa possa diminuir o resumo e deixar assim",
// no site todo). No topo da área de compra, uma alça: puxar para baixo (ou tocar) recolhe o resumo numa linha só, com o preço, o
// carrinho e "Comprar agora"; puxar para cima abre de novo. Recolhido, um balãozinho "Ver resumo" aparece em cima; um toque nele abre o
// resumo numa animação fluida, como se ele subisse puxado. Enquanto o dedo arrasta, a área acompanha. A escolha fica guardada.
const KEY = 'ju.buy.compact';
const CHEVRON = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 7.5 6 4.5 9 7.5"/></svg>';

export function setupPurchaseSheet(dialog) {
  const area = dialog?.querySelector('.modal-actions');
  if (!area) return;
  area.insertAdjacentHTML('afterbegin', `<button type="button" class="pdp-grip" aria-expanded="true" aria-label="Recolher o resumo da compra"><i aria-hidden="true"></i></button><button type="button" class="pdp-balloon" hidden>Ver resumo ${CHEVRON}</button>`);
  const grip = area.querySelector('.pdp-grip'), balloon = area.querySelector('.pdp-balloon');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let compact = false, drag = null, moving = null;
  try { compact = localStorage.getItem(KEY) === '1'; } catch {}

  function paint() {
    area.classList.toggle('is-compact', compact);
    grip.setAttribute('aria-expanded', String(!compact));
    grip.setAttribute('aria-label', compact ? 'Abrir o resumo da compra' : 'Recolher o resumo da compra');
  }
  // FLIP: a altura vai da de antes para a de depois, e o conteúdo chega deslizando (para cima quando abre, como puxado)
  function set(next) {
    if (next === compact) { settle(); return; }
    const from = area.getBoundingClientRect().height, offset = drag?.dy || 0;
    compact = next; paint(); balloon.hidden = true;
    try { localStorage.setItem(KEY, compact ? '1' : '0'); } catch {}
    area.style.transform = '';
    const done = () => { area.classList.remove('is-moving'); balloon.hidden = !compact; };
    if (reduce.matches) { done(); return; }
    const to = area.getBoundingClientRect().height;
    moving?.cancel(); area.classList.add('is-moving');
    moving = area.animate([{height: `${from}px`, transform: `translateY(${offset}px)`}, {height: `${to}px`, transform: 'translateY(0)'}],
      {duration: compact ? 340 : 520, easing: compact ? 'cubic-bezier(.4, 0, .2, 1)' : 'cubic-bezier(.16, 1, .3, 1)'});
    for (const el of area.querySelectorAll('.pdp-price, #purchase-panel'))
      el.animate([{opacity: .15, transform: `translateY(${compact ? -8 : 14}px)`}, {opacity: 1, transform: 'none'}], {duration: compact ? 300 : 480, easing: 'cubic-bezier(.16, 1, .3, 1)'});
    moving.finished.then(done, done);
  }
  function settle() {
    if (!area.style.transform) return;
    if (reduce.matches) { area.style.transform = ''; return; }
    area.animate([{transform: area.style.transform}, {transform: 'translateY(0)'}], {duration: 260, easing: 'cubic-bezier(.16, 1, .3, 1)'});
    area.style.transform = '';
  }

  // arrastar pela alça: a área acompanha o dedo (com resistência); ao soltar, decide pelo sentido e pela distância
  grip.addEventListener('pointerdown', event => {
    drag = {y: event.clientY, dy: 0, moved: false, id: event.pointerId};
    try { grip.setPointerCapture(event.pointerId); } catch {}
  });
  grip.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const raw = event.clientY - drag.y;
    if (Math.abs(raw) > 4) drag.moved = true;
    // recolhido só sobe; aberto só desce; o resto é resistência
    const allowed = compact ? Math.min(0, raw) : Math.max(0, raw);
    drag.dy = Math.sign(allowed) * Math.min(64, Math.abs(allowed) * .55);
    if (drag.moved) area.style.transform = `translateY(${drag.dy}px)`;
  });
  const release = event => {
    if (!drag || event.pointerId !== drag.id) return;
    const {moved, dy} = drag;
    if (!moved) { drag = null; return; }          // um toque: o clique decide
    if (!compact && dy > 18) set(true);
    else if (compact && dy < -18) set(false);
    else settle();
    drag = null;
    grip.dataset.dragged = '1'; setTimeout(() => { delete grip.dataset.dragged; }, 0);
  };
  grip.addEventListener('pointerup', release);
  grip.addEventListener('pointercancel', release);
  grip.addEventListener('click', () => { if (!grip.dataset.dragged) set(!compact); });
  balloon.addEventListener('click', () => { set(false); grip.focus({preventScroll: true}); });
  paint(); balloon.hidden = !compact;
}
