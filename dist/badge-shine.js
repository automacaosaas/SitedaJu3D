// O selo "Novidade" das lâmpadas (08/10/2026, pedido do dono: "duas vezes ao abrir e de novo quando a pessoa passa o mouse ou reabre a
// tela"): as letras passam pelas cores e o brilho atravessa duas vezes (product-page.css / product-landing.css: iteração 2); aqui a
// animação recomeça do início quando a janela da peça abre, quando o mouse passa por cima e quando a página volta a ficar visível.
// Com movimento reduzido, nada recomeça (o selo fica parado).
const calm = matchMedia('(prefers-reduced-motion: reduce)');

export function shineBadge(el) {
  if (!el || calm.matches || !el.classList.contains('is-badge')) return;
  for (const animation of el.getAnimations({subtree: true})) { animation.cancel(); animation.play(); }
}

export function wireBadge(el, {onVisible = false} = {}) {
  if (!el || el.dataset.shineWired) return;
  el.dataset.shineWired = '';
  el.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') shineBadge(el); });
  if (onVisible) {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') shineBadge(el); });
    addEventListener('pageshow', event => { if (event.persisted) shineBadge(el); });
  }
}
