// O resumo da compra da peça recolhe e abre por uma alça (06/10/2026, pedidos do Luiz). No topo da área de compra, uma linha: puxar
// para baixo (ou tocar) recolhe o resumo numa linha só, com o preço, o carrinho e "Comprar agora"; puxar para cima abre de novo, e a área
// acompanha o dedo. No celular o resumo começa abaixado e a linha pulsa de leve, chamando para puxar; ela para assim que a pessoa
// começa a personalizar (parte, cor, "Surpreenda-me", combinação, o kit das lâmpadas), troca Foto/3D ou mexe na própria linha. Sem o balão "Ver resumo"
// aqui (fica só no carrinho).
// celular, e também tablet ou notebook de tela baixa (celular deitado, zoom de 200%: 08/10/2026, usabilidade 1), onde a janela inteira rola
// e a compra fica presa embaixo: recolhida, ela não cobre a peça
const phone = matchMedia('(max-width: 600px), (max-width: 900px) and (max-height: 560px)');

export function setupPurchaseSheet(dialog) {
  const area = dialog?.querySelector('.modal-actions');
  if (!area) return;
  area.insertAdjacentHTML('afterbegin', '<button type="button" class="pdp-grip" aria-expanded="true" aria-label="Recolher o resumo da compra"><i aria-hidden="true"></i></button>');
  const grip = area.querySelector('.pdp-grip');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let compact = phone.matches, drag = null, moving = null;

  function paint() {
    area.classList.toggle('is-compact', compact);
    grip.setAttribute('aria-expanded', String(!compact));
    grip.setAttribute('aria-label', compact ? 'Abrir o resumo da compra' : 'Recolher o resumo da compra');
  }
  const calm = () => grip.classList.remove('is-calling');
  // FLIP: a altura vai da de antes para a de depois, e o conteúdo chega deslizando (para cima quando abre, como puxado)
  function set(next) {
    calm();
    if (next === compact) { settle(); return; }
    const from = area.getBoundingClientRect().height, offset = drag?.dy || 0;
    compact = next; paint(); area.style.transform = '';
    if (reduce.matches) return;
    const to = area.getBoundingClientRect().height;
    moving?.cancel(); area.classList.add('is-moving');
    moving = area.animate([{height: `${from}px`, transform: `translateY(${offset}px)`}, {height: `${to}px`, transform: 'translateY(0)'}],
      {duration: compact ? 340 : 520, easing: compact ? 'cubic-bezier(.4, 0, .2, 1)' : 'cubic-bezier(.16, 1, .3, 1)'});
    for (const el of area.querySelectorAll('.pdp-price, #purchase-panel'))
      el.animate([{opacity: .15, transform: `translateY(${compact ? -8 : 14}px)`}, {opacity: 1, transform: 'none'}], {duration: compact ? 300 : 480, easing: 'cubic-bezier(.16, 1, .3, 1)'});
    const done = () => area.classList.remove('is-moving');
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
    calm(); drag = {y: event.clientY, dy: 0, moved: false, id: event.pointerId};
    try { grip.setPointerCapture(event.pointerId); } catch {}
  });
  grip.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const raw = event.clientY - drag.y;
    if (Math.abs(raw) > 4) drag.moved = true;
    const allowed = compact ? Math.min(0, raw) : Math.max(0, raw);       // recolhido só sobe; aberto só desce
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

  // a linha pulsa (no celular, recolhido) até a pessoa personalizar ou trocar Foto/3D
  dialog.addEventListener('click', event => {
    if (event.target.closest('#part-tabs, #palette, #surprise, #presets, .pdp-kit button, .view-tabs [data-view]')) calm();
  });
  // cada vez que a área de compra aparece (a janela abre com outra peça), volta ao começo: no celular, abaixada e chamando
  const start = () => {
    if (!dialog.open) return;
    compact = phone.matches; paint();
    grip.classList.toggle('is-calling', compact && !reduce.matches);
  };
  new MutationObserver(start).observe(dialog, {attributes: true, attributeFilter: ['open']});
  // girar o aparelho com a janela aberta: voltando à largura de celular, a compra abaixa de novo (e, mais larga, abre)
  phone.addEventListener('change', start);
  paint(); start();          // a janela pode já estar aberta (o endereço da página abre a peça)
}
