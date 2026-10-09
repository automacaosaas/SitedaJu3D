import {PRODUCTS, SOON, color, showcase, thumbImg, thumbSizes, itemColors, fixedColors, noticeOf} from './products.js';
import {COMMERCE, money} from './commerce-config.js';
import {totals, pixDiscount, lineCents} from './cart-store.js';
import {icon} from './icons.js';
import {freeShippingBar} from './free-shipping.js';
import {formatDays, shippingMessage} from './shipping-client.js';
import {FALLBACK_METHODS, payMark, MERCADO_PAGO_MARK} from './payment-marks.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// (a peça de cores fixas não tem o que editar)
const editButton = (item, circular = false) => fixedColors(item.productId) ? '' : `<button type="button" class="${circular ? 'cart-customize' : 'cart-edit-link'}" data-action="edit" data-id="${esc(item.id)}" aria-label="Editar personalização de ${esc(item.title)}">${circular ? icon('pencil') : 'Editar cores'}</button>`;
const formatCep = cep => { const digits = String(cep ?? '').replace(/\D/g, '').slice(0, 8); return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits; };

// o aviso de uma cor escolhida (o arco-íris varia com o rolo de filamento), embaixo das cores da peça
const cartNotice = item => { const notice = fixedColors(item.productId) ? '' : noticeOf(PRODUCTS[item.productId]?.parts.map(part => color(item.selection?.[part.id] ?? part.default)) || []); return notice ? `<p class="cart-notice">${esc(notice)}</p>` : ''; };
function swatches(item) {
  return `<div class="cart-colors"><span>Cores</span><ul aria-label="Cores ${fixedColors(item.productId) ? 'de' : 'escolhidas para'} ${esc(item.title)}">${itemColors(item.productId, item.selection).map(c => {
    const label = c.part ? `${c.part}: ${c.name}` : c.name;
    return `<li><span class="cart-swatch" style="--chip:${c.paint}" role="img" aria-label="${esc(label)}" title="${esc(label)}"></span></li>`;
  }).join('')}</ul></div>${cartNotice(item)}`;
}

function itemCard(item, cart) {
  const product = PRODUCTS[item.productId];
  return `<article class="cart-product" aria-label="${esc(item.title)}">
    <div class="cart-product-art"><img ${thumbImg(product.catalogImage || product.image, thumbSizes(156))} width="1024" height="1024" alt="${esc(item.title)} — imagem nas cores originais">${editButton(item, true)}</div>
    <div class="cart-product-info"><h2>${esc(item.title)}</h2><p class="item-type">${esc(product.subtitle)}</p>${swatches(item)}${editButton(item)}</div>
    <div class="cart-product-controls"><div class="quantity-control" role="group" aria-label="Quantidade de ${esc(item.title)}"><button type="button" data-action="minus" data-id="${esc(item.id)}" aria-label="Diminuir quantidade de ${esc(item.title)}" ${item.quantity <= 1 ? 'disabled' : ''}>−</button><output aria-label="Quantidade de ${esc(item.title)}">${item.quantity}</output><button type="button" data-action="plus" data-id="${esc(item.id)}" aria-label="Aumentar quantidade de ${esc(item.title)}" ${item.quantity >= 99 ? 'disabled' : ''}>+</button></div><button type="button" class="trash-button" data-action="remove" data-id="${esc(item.id)}" aria-label="Remover ${esc(item.title)}">${icon('trash')}</button></div>
    <strong class="cart-product-price" aria-label="Preço de ${item.quantity} ${esc(item.title)}">${money(lineCents(cart, item))}</strong>
  </article>`;
}

// The CEP box of the cart (real shipping only): the buyer can price the delivery before signing in. `estimate` is the
// checkout's quote state ({cep, status: idle | loading | ready | none | error, options, chosen, error}); the same CEP and
// quote carry on to the delivery step.
function shippingEstimate(estimate = {}) {
  let result = '';
  if (estimate.status === 'loading') result = '<p class="cart-ship-note">Calculando o frete…</p>';
  else if (estimate.status === 'ready') result = `<ul class="cart-ship-options">${estimate.options.map(o => `<li><span><strong>${esc(o.label)}</strong><small>Entrega em ${formatDays(o.days)}</small></span><span>${o.free ? '<em>Grátis</em>' : money(o.priceCents)}</span></li>`).join('')}</ul>`;
  else if (estimate.status === 'none' || estimate.status === 'error') result = `<p class="cart-ship-note is-problem">${shippingMessage(estimate.error)}</p>`;
  return `<form class="cart-ship" id="cart-ship-form" novalidate><label for="cart-cep">Calcule o frete</label><div class="cart-ship-row"><input id="cart-cep" name="cep" value="${esc(formatCep(estimate.cep))}" inputmode="numeric" autocomplete="postal-code" maxlength="9" placeholder="00000-000" aria-describedby="cart-ship-result"><button type="submit" class="cart-ship-button">Calcular</button></div><div id="cart-ship-result" class="cart-ship-result" aria-live="polite">${result}</div></form>`;
}

// realShipping: the delivery is priced by CEP (in the cart when the buyer types one, otherwise later), so without a quote
// this summary says so instead of adding a made-up fee. freeShipping: {fromCents, label} to show how far the free delivery is.
export function cartSummary(chosen, {realShipping = false, productionLabel = '', freeShipping = null, estimate = null} = {}) {
  const quoted = realShipping && estimate?.status === 'ready' && estimate.chosen ? estimate.chosen : null;
  const amount = totals(chosen, realShipping ? (quoted ? quoted.priceCents : 0) : undefined), units = chosen.reduce((sum, item) => sum + item.quantity, 0);
  const delivery = !realShipping ? `<div><dt>Entrega${COMMERCE.mode === 'demo' ? ' <small>(exemplo)</small>' : ''}</dt><dd>${money(amount.shipping)}</dd></div>`
    : quoted ? `<div><dt>Entrega <small>(${esc(quoted.label)})</small></dt><dd>${quoted.free ? '<em>Grátis</em>' : money(quoted.priceCents)}</dd></div>` : '<div><dt>Entrega</dt><dd><small>calculada pelo CEP</small></dd></div>';
  const withoutDelivery = realShipping && !quoted;
  return `<aside class="cart-order-summary" aria-labelledby="cart-summary-title"><h2 id="cart-summary-title">Resumo do pedido</h2><p class="cart-selection-note">${units} ${units === 1 ? 'peça' : 'peças'}</p>
    ${realShipping && chosen.length ? freeShippingBar(freeShipping, amount.subtotal) : ''}
    <dl class="amounts"><div><dt>Subtotal</dt><dd>${money(amount.subtotal)}</dd></div>${delivery}<div class="grand-total"><dt>Total${withoutDelivery ? ' <small>(sem entrega)</small>' : ''}</dt><dd>${money(amount.total)}</dd></div>${chosen.length ? `<div class="pix-hint"><dt>No Pix <small>(5% off)</small></dt><dd>${money(amount.total - pixDiscount(chosen))}</dd></div>` : ''}</dl>
    ${realShipping && chosen.length ? shippingEstimate(estimate || {}) : ''}
    <div class="cart-checkout-bar" role="group" aria-label="Resumo da compra e finalização">
      <a class="cart-checkout-total" href="#cart-summary-title"><span class="cart-total-label">Total</span><strong>${money(amount.total)}</strong>${!chosen.length ? '<small class="cart-total-note">Selecione uma peça</small>' : withoutDelivery ? '<small class="cart-total-note">sem frete</small>' : ''}</a>${chosen.length ? '<a class="cart-summary-balloon" href="#cart-summary-title">Ver resumo<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5"/></svg></a>' : ''}
      <button type="button" class="primary cart-checkout" data-action="checkout" ${chosen.length ? '' : 'disabled'}>Finalizar pedido ${icon('arrow')}</button>
    </div>
    ${!chosen.length ? '<p class="cart-selection-help">Selecione uma peça para continuar.</p>' : ''}
  </aside>`;
}

// "Você também pode gostar" (06/10/2026, refeito em 08/10/2026 a pedido do dono: "mostrar 3 produtos em carrossel e um 'Ver mais +' ao
// lado; em sequência eles iriam atualizando e passando com o tempo"). Cards com a foto, o nome e o preço: as peças que ainda não estão
// no carrinho e, depois, as novidades ("Em breve" no lugar do preço). Três cards à vista no computador e no tablet (dois no celular) e,
// no fim da fileira, o "Ver mais +" para a página Produtos. Cada card aparece uma vez só (sem cópias): o carrossel dá a volta trocando
// um card de ponta (wireRecArrows). Os botões (pausar, voltar, avançar) ficam acima, à direita do título (embaixo, no celular), longe
// dos cards; com poucas peças, que cabem todas, eles somem e nada anda.
// O botão de pausa é uma bolinha discreta (08/10/2026, segunda volta): um anel fino em duas metades que giram (cart-page.css) e, dentro,
// o sinal pequeno de pausa ou de play.
const PLAY_ICONS = '<span class="cart-rec-dot" aria-hidden="true"><span><i></i></span><span><i></i></span></span><svg class="cart-rec-pause" viewBox="0 0 10 10" aria-hidden="true"><path d="M3.7 2.7v4.6M6.3 2.7v4.6"/></svg><svg class="cart-rec-play" viewBox="0 0 10 10" aria-hidden="true"><path d="M3.8 2.5v5l4-2.5z"/></svg>';
function recommendations(cart) {
  const inCart = new Set(cart.map(item => item.productId));
  const items = [...Object.keys(PRODUCTS).filter(id => !inCart.has(id)).map(id => ({id, href: `${id}`, title: PRODUCTS[id].title, price: money(COMMERCE.prices[id])})),
    ...Object.keys(SOON).map(id => ({id, href: `./#produto/${id}/3d`, title: SOON[id].title}))];
  if (!items.length) return '';
  const arrow = step => `<button type="button" class="cart-rec-arrow ${step < 0 ? 'is-prev' : 'is-next'}" data-rec-step="${step}" aria-controls="cart-rec-track" aria-label="${step < 0 ? 'Peças anteriores' : 'Mais peças'}">${icon('arrow')}</button>`;
  const card = ({id, href, title, price}, index) => {
    const {theme} = showcase(id);
    return `<li class="cart-rec-slide" data-rec-index="${index + 1}"><a class="cart-rec${price ? '' : ' is-soon'}" href="${href}" draggable="false" style="--rec-stops:${theme.bannerStops};--rec-accent:${theme.accentColor};--rec-ink:${theme.textColor}"><span class="cart-rec-art"><img src="assets/card-preview-${id}.webp" alt="" width="384" height="384" loading="lazy" decoding="async" draggable="false"></span><span class="cart-rec-name">${esc(title)}</span><span class="cart-rec-price">${price || 'Em breve'}</span></a></li>`;
  };
  return `<section class="cart-recs" aria-labelledby="cart-recs-title"><div class="cart-recs-head"><h2 id="cart-recs-title">${cart.length ? 'Você também pode gostar' : 'Comece por uma destas'}</h2></div>`
    + `<div class="cart-rec-rail is-static" data-count="${Math.min(items.length, 3)}" role="region" aria-roledescription="carrossel" aria-labelledby="cart-recs-title">`
    + `<div class="cart-rec-controls" hidden><button type="button" class="cart-rec-toggle" data-rec-play aria-label="Pausar a troca automática" title="Pausar a troca automática">${PLAY_ICONS}</button>${arrow(-1)}${arrow(1)}</div>`
    + `<div class="cart-rec-viewport"><ul class="cart-rec-track" id="cart-rec-track" data-rec-track>${items.map(card).join('')}</ul></div>`
    + `<a class="cart-rec-more" href="produtos" aria-label="Ver mais peças"><span class="cart-rec-more-plus" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5.5v13M5.5 12h13"/></svg></span><span class="cart-rec-more-label">Ver mais</span></a>`
    + `</div><p class="sr-only" data-rec-live aria-live="polite" aria-atomic="true"></p></section>`;
}

// O carrossel. A fileira (track) é uma lista só, deslocada por transform: à vista ficam os cards de lead a lead + k (k = 3, ou 2 no
// celular, lido de --rec-k no CSS); para andar, o card de uma ponta passa para a outra (no DOM, fora da vista) e a fileira desliza um
// card. Os que estão fora da vista ficam inertes (fora do Tab e do leitor de tela). Anda sozinho um card a cada AUTO_MS (8,5 s desde a
// segunda volta, 08/10/2026: "está muito rápido, quero mais lento"), com o anel da bolinha de pausa mostrando o tempo. A contagem para —
// e o anel congela onde está — com o mouse em cima da seção (volta quando ele sai, de onde parou), com o dedo na fileira, nas setas ou
// rolando por cima dela (volta HOLD_MS depois de soltar), com o foco do teclado dentro, enquanto a fileira anda, fora da tela e com a aba
// escondida; o botão de pausa para de vez e, com "reduzir movimento", nada anda sozinho. Arrasta com o dedo ou o mouse (1:1, com
// velocidade); as setas do teclado andam entre os cards e a fileira acompanha.
const AUTO_MS = 8500;
const HOLD_MS = 4000;
const recStates = new WeakMap();
const recState = root => { let state = recStates.get(root); if (!state) recStates.set(root, state = {lead: 0, paused: false, hover: false, focus: false, touching: false, heldUntil: 0, onScreen: true, left: AUTO_MS, since: 0}); return state; };
const recParts = root => {
  const rail = root.querySelector('.cart-rec-rail');
  return rail && {rail, track: rail.querySelector('[data-rec-track]'), controls: rail.querySelector('.cart-rec-controls'), toggle: rail.querySelector('[data-rec-play]'), live: root.querySelector('[data-rec-live]')};
};
const reduceRec = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const perView = rail => Math.max(1, Math.round(parseFloat(getComputedStyle(rail).getPropertyValue('--rec-k')) || 3));
const stepOf = track => { const first = track.firstElementChild; return first ? first.getBoundingClientRect().width + (parseFloat(getComputedStyle(track).columnGap) || 0) : 0; };
// (a largura do passo só é lida quando a fileira está deslocada: no começo, logo depois de desenhar o carrinho, ler o layout
// obrigava o navegador a calcular a página inteira ali mesmo — PageSpeed, 08/10/2026)
function placeRec(parts, state, offset = 0) {
  const {track} = parts, shifted = state.moving && (state.lead || offset);
  track.style.transform = shifted ? `translate3d(${(-state.lead * stepOf(track) + offset).toFixed(2)}px, 0, 0)` : '';
}
function markRec(parts, state) {
  const k = state.moving ? perView(parts.rail) : Infinity;
  [...parts.track.children].forEach((slide, index) => { slide.inert = index < state.lead || index >= state.lead + k; });
}
// termina na hora o deslize em curso (antes de um arraste ou de redesenhar)
function settleRec(parts, state) {
  const anim = state.anim;
  if (!anim) return;
  state.anim = null; placeRec(parts, state); anim.cancel(); parts.rail.classList.remove('is-moving');
}
// abre espaço do lado para onde a fileira vai: o card da outra ponta muda de lugar no DOM (invisível) e a posição compensa
function roomRec(parts, state, direction) {
  const {track} = parts, n = track.children.length, k = perView(parts.rail);
  if (direction > 0 && state.lead + k >= n) { track.append(track.firstElementChild); state.lead -= 1; }
  if (direction < 0 && state.lead === 0) { track.prepend(track.lastElementChild); state.lead += 1; }
}

// Depois de cada desenho do carrinho (checkout.js), e o carrinho é redesenhado a cada quantidade e a cada frete calculado: a fileira nova
// continua do card que estava primeiro à vista (sem voltar ao começo), e decide se é carrossel (mais peças do que cabem) ou fileira parada.
export function updateRecArrows(root) {
  const state = recState(root), parts = recParts(root);
  clearTimeout(state.timer);
  if (!parts) { state.watch?.disconnect(); return; }
  if (state.rail !== parts.rail) {
    const first = state.rail?.querySelector('[data-rec-track]')?.children[state.lead]?.querySelector('a')?.getAttribute('href');
    const keep = first && [...parts.track.children].findIndex(slide => slide.querySelector('a')?.getAttribute('href') === first);
    for (let i = 0; i < keep; i++) parts.track.append(parts.track.firstElementChild);
    state.rail = parts.rail; state.lead = 0; state.anim = null; state.drag = null; state.focus = parts.rail.contains(document.activeElement);
    state.watch?.disconnect();
    if ('IntersectionObserver' in window) { state.watch = new IntersectionObserver(([entry]) => { state.onScreen = entry.isIntersecting; scheduleRec(root); }); state.watch.observe(parts.rail); }
  }
  settleRec(parts, state);
  parts.rail.style.setProperty('--rec-auto', `${AUTO_MS}ms`);
  const k = perView(parts.rail);
  state.moving = parts.track.children.length > k;
  parts.controls.hidden = !state.moving;
  parts.rail.classList.toggle('is-static', !state.moving);
  if (!state.moving) state.lead = 0;
  // a tela girou (de 2 para 3 cards à vista) com a fileira perto do fim: o card da frente passa para o fim, sem um buraco no último lugar
  while (state.moving && state.lead > 0 && state.lead + k > parts.track.children.length) { parts.track.append(parts.track.firstElementChild); state.lead -= 1; }
  placeRec(parts, state); markRec(parts, state); paintToggle(parts, state);
  scheduleRec(root);
}
function paintToggle(parts, state) {
  const label = state.paused ? 'Retomar a troca automática' : 'Pausar a troca automática';
  parts.rail.classList.toggle('is-paused', state.paused);
  if (parts.toggle.getAttribute('data-label') !== label) { parts.toggle.setAttribute('data-label', label); parts.toggle.setAttribute('aria-label', label); parts.toggle.setAttribute('title', label); }
}
// conta (o anel aparece) quando há o que andar, sem o botão de pausa e sem "reduzir movimento"; anda quando, além disso, nada segura
const countingRec = state => state.moving && !state.paused && !reduceRec();
function playingRec(state) {
  return countingRec(state) && !state.hover && !state.focus && !state.touching && !state.drag && !state.anim && !document.hidden && state.onScreen && Date.now() >= state.heldUntil;
}
// O anel mostra o tempo já contado (AUTO_MS - state.left): corre enquanto conta e congela (is-held) quando algo segura. A posição dele
// é acertada pela animação (currentTime), sem reflow; numa fileira recém-desenhada, do começo, nem isso.
function paintRing(parts, state, on) {
  const armed = countingRec(state), fresh = state.ringRail !== parts.rail, at = AUTO_MS - state.left;
  state.ringRail = parts.rail;
  parts.rail.classList.toggle('is-counting', armed);
  parts.rail.classList.toggle('is-held', armed && !on);
  if (!armed || (fresh && !at)) return;
  for (const half of parts.rail.querySelectorAll('.cart-rec-dot i')) for (const anim of half.getAnimations?.() || []) anim.currentTime = at;
}
function scheduleRec(root) {
  const state = recState(root), parts = recParts(root);
  clearTimeout(state.timer);
  if (!parts || parts.rail !== state.rail) return;
  // guarda o tempo que já correu: ao voltar, a contagem continua de onde parou
  if (state.since) { state.left = Math.max(0, state.left - (Date.now() - state.since)); state.since = 0; }
  const on = playingRec(state);
  paintRing(parts, state, on);
  if (on) { state.since = Date.now(); state.timer = setTimeout(() => { state.since = 0; state.left = 0; if (playingRec(state)) goRec(root, 1, true); else scheduleRec(root); }, Math.max(state.left, 600)); }
  else if (countingRec(state) && Date.now() < state.heldUntil) state.timer = setTimeout(() => scheduleRec(root), state.heldUntil - Date.now() + 30);
}
// Anda um card. `offset` é onde a fileira está (no arraste); `auto` é a passagem sozinha, mais lenta e macia; a das setas, rápida.
function goRec(root, direction, auto = false, offset = 0) {
  const state = recState(root), parts = recParts(root);
  if (!parts || !state.moving) return;
  // um clique no meio de um deslize continua de onde a fileira está, sem saltar
  const step = stepOf(parts.track), before = state.lead;
  let from = -state.lead * step + offset;
  if (state.anim) { from = new DOMMatrixReadOnly(getComputedStyle(parts.track).transform).m41; state.anim.cancel(); state.anim = null; }
  roomRec(parts, state, direction);
  from += (before - state.lead) * step;
  state.lead += direction; state.left = AUTO_MS; state.since = 0;   // cards novos à vista: a contagem recomeça do zero
  const to = -state.lead * step;
  markRec(parts, state);
  if (!auto) {
    const entering = parts.track.children[direction > 0 ? state.lead + perView(parts.rail) - 1 : state.lead];
    if (entering && parts.live) parts.live.textContent = `${entering.querySelector('.cart-rec-name')?.textContent || ''}, ${entering.dataset.recIndex} de ${parts.track.children.length}.`;
  }
  if (parts.rail.contains(document.activeElement) && document.activeElement.closest('[inert]')) parts.track.children[state.lead]?.querySelector('a')?.focus({preventScroll: true});
  if (reduceRec()) { placeRec(parts, state); scheduleRec(root); return; }
  const anim = parts.track.animate([{transform: `translate3d(${from.toFixed(2)}px, 0, 0)`}, {transform: `translate3d(${to.toFixed(2)}px, 0, 0)`}],
    {duration: auto ? 760 : 420, easing: auto ? 'cubic-bezier(.45, 0, .25, 1)' : 'cubic-bezier(.22, 1, .36, 1)', fill: 'forwards'});
  state.anim = anim; parts.rail.classList.add('is-moving');
  anim.onfinish = () => { if (state.anim !== anim) return; state.anim = null; placeRec(parts, state); anim.cancel(); parts.rail.classList.remove('is-moving'); scheduleRec(root); };
  scheduleRec(root);
}
function holdRec(root) { const state = recState(root); state.heldUntil = Date.now() + HOLD_MS; scheduleRec(root); }

export function wireRecArrows(root) {
  const inRail = target => target?.closest?.('.cart-rec-rail'), inRecs = target => target?.closest?.('.cart-recs');
  root.addEventListener('click', event => {
    const state = recState(root);
    if (state.suppress && event.target.closest?.('[data-rec-track]')) { event.preventDefault(); event.stopPropagation(); state.suppress = false; return; }
    const step = event.target.closest('[data-rec-step]');
    if (step) { goRec(root, Number(step.dataset.recStep)); return; }
    if (event.target.closest('[data-rec-play]')) { state.paused = !state.paused; state.heldUntil = 0; const parts = recParts(root); if (parts) paintToggle(parts, state); scheduleRec(root); }
  }, true);
  // teclado: dentro da fileira, as setas passam de card em card; no último à vista, a fileira anda e o foco vai junto
  root.addEventListener('keydown', event => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const slide = event.target.closest?.('.cart-rec-slide'), parts = recParts(root), state = recState(root);
    if (!slide || !parts) return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1, slides = [...parts.track.children], index = slides.indexOf(slide);
    const k = state.moving ? perView(parts.rail) : slides.length, last = state.lead + k - 1;
    let target = slides[index + direction];
    if (!state.moving) { target?.querySelector('a')?.focus(); return; }
    if ((direction > 0 && index >= last) || (direction < 0 && index <= state.lead)) { goRec(root, direction); target = parts.track.children[direction > 0 ? state.lead + k - 1 : state.lead]; }
    target?.querySelector('a')?.focus({preventScroll: true});
  });
  // no computador, o mouse em qualquer lugar da seção (título, cards, setas, "Ver mais") segura a contagem; ao sair, ela continua
  root.addEventListener('pointerover', event => { const state = recState(root); if (event.pointerType === 'mouse' && !state.hover && inRecs(event.target)) { state.hover = true; scheduleRec(root); } });
  root.addEventListener('pointerout', event => { if (event.pointerType === 'mouse' && inRecs(event.target) && !inRecs(event.relatedTarget)) { recState(root).hover = false; scheduleRec(root); } });
  // no celular, o dedo na seção segura enquanto estiver lá, também rolando a página por cima dela (os eventos de toque seguem durante a
  // rolagem, os de ponteiro não); ao soltar, mais HOLD_MS. O fim do toque é ouvido no próprio alvo: se o carrinho se redesenhar no meio,
  // o alvo sai da página e o evento não chegaria até aqui. Com outro dedo ainda na seção, segue segurando e volta a ouvir o alvo (o
  // ouvinte é de uma vez só e o segundo dedo pode ter começado no mesmo lugar).
  const lift = event => {
    const state = recState(root);
    if (!state.touching) return;
    if ([...event.touches].some(touch => inRecs(touch.target))) { event.currentTarget.addEventListener(event.type, lift, {once: true, passive: true}); return; }
    state.touching = false; holdRec(root);
  };
  root.addEventListener('touchstart', event => {
    if (!inRecs(event.target)) return;
    const state = recState(root);
    for (const type of ['touchend', 'touchcancel']) event.target.addEventListener(type, lift, {once: true, passive: true});
    if (!state.touching) { state.touching = true; scheduleRec(root); }
  }, {passive: true});
  // o foco do teclado pausa (o de um clique com o mouse numa seta, não: o mouse já pausa enquanto está em cima)
  root.addEventListener('focusin', event => { if (inRail(event.target) && event.target.matches(':focus-visible')) { recState(root).focus = true; scheduleRec(root); } });
  root.addEventListener('focusout', event => { if (inRail(event.target) && !inRail(event.relatedTarget)) { recState(root).focus = false; scheduleRec(root); } });
  // arrastar: a fileira segue o dedo (ou o mouse) 1:1; ao soltar, anda se passou de um quinto do card ou se o gesto foi rápido
  root.addEventListener('pointerdown', event => {
    const viewport = event.target.closest?.('.cart-rec-viewport'), state = recState(root);
    if (!viewport || event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (event.pointerType !== 'mouse') holdRec(root);
    state.suppress = false;
    state.drag = {id: event.pointerId, x: event.clientX, y: event.clientY, lx: event.clientX, lt: event.timeStamp, v: 0, moved: false, viewport};
  });
  root.addEventListener('pointermove', event => {
    const state = recState(root), drag = state.drag, parts = recParts(root);
    if (!drag || event.pointerId !== drag.id || !parts) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moved) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { state.drag = null; scheduleRec(root); return; }   // é rolagem da página
      if (Math.abs(dx) < 8 || !state.moving) return;
      drag.moved = true; settleRec(parts, state); drag.viewport.setPointerCapture?.(event.pointerId); parts.rail.classList.add('is-dragging');
    }
    // o card que vai entrar precisa existir do lado do arraste (com poucas peças, ele troca de ponta conforme o dedo muda de lado)
    const k = perView(parts.rail), n = parts.track.children.length;
    if (dx > 0 && state.lead === 0) roomRec(parts, state, -1);
    if (dx < 0 && state.lead + k >= n) roomRec(parts, state, 1);
    const step = stepOf(parts.track), limit = step * 1.15, offset = Math.max(-limit, Math.min(limit, dx));
    const dt = event.timeStamp - drag.lt;
    if (dt > 0) drag.v = .8 * (event.clientX - drag.lx) / dt + .2 * drag.v;
    drag.lx = event.clientX; drag.lt = event.timeStamp; drag.offset = offset;
    placeRec(parts, state, offset); markRec(parts, state);
    if (event.cancelable) event.preventDefault();
  });
  const release = event => {
    const state = recState(root), drag = state.drag, parts = recParts(root);
    if (!drag || event.pointerId !== drag.id) return;
    state.drag = null;
    if (drag.viewport.hasPointerCapture?.(event.pointerId)) drag.viewport.releasePointerCapture(event.pointerId);
    if (!drag.moved || !parts) { scheduleRec(root); return; }
    parts.rail.classList.remove('is-dragging');
    state.suppress = true; setTimeout(() => { state.suppress = false; }, 400);   // o clique que vem logo depois do arraste não abre o card
    const offset = drag.offset || 0, v = event.timeStamp - drag.lt > 100 ? 0 : drag.v, step = stepOf(parts.track);
    const flick = Math.abs(v) > .35 && Math.sign(v) === Math.sign(offset);
    if (event.type === 'pointerup' && offset && (Math.abs(offset) > step * .2 || flick)) goRec(root, offset < 0 ? 1 : -1, false, offset);
    else if (reduceRec() || !offset) { placeRec(parts, state); markRec(parts, state); }
    else {
      const anim = parts.track.animate([{transform: `translate3d(${(-state.lead * step + offset).toFixed(2)}px, 0, 0)`}, {transform: `translate3d(${(-state.lead * step).toFixed(2)}px, 0, 0)`}], {duration: 320, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'forwards'});
      state.anim = anim; placeRec(parts, state); markRec(parts, state);
      anim.onfinish = () => { if (state.anim !== anim) return; state.anim = null; anim.cancel(); scheduleRec(root); };
    }
    if (event.pointerType !== 'mouse') holdRec(root);
  };
  root.addEventListener('pointerup', release); root.addEventListener('pointercancel', release);
  root.addEventListener('dragstart', event => { if (event.target.closest?.('[data-rec-track]')) event.preventDefault(); });
  document.addEventListener('visibilitychange', () => scheduleRec(root));
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => scheduleRec(root));
  let resized = 0;
  addEventListener('resize', () => { clearTimeout(resized); resized = setTimeout(() => { if (recParts(root)) updateRecArrows(root); }, 120); }, {passive: true});
  updateRecArrows(root);
}

// "Ver resumo" na barra de baixo do celular: a página desce até o resumo numa rolagem suave (e não num pulo), e o resumo acende
// um instante para o olho achar onde chegou. Enquanto o resumo está na tela, o botão "Ver resumo" da barra sai (já está lá).
function scrollToY(y) {
  const start = scrollY, distance = y - start, ms = Math.min(900, Math.max(420, Math.abs(distance) * .6)), t0 = performance.now();
  const ease = p => p < .5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
  let stop = false; const cancel = () => { stop = true; };
  addEventListener('wheel', cancel, {once: true, passive: true}); addEventListener('touchstart', cancel, {once: true, passive: true});
  return new Promise(done => {
    const frame = now => {
      const p = Math.min(1, (now - t0) / ms);
      if (stop) return done();
      scrollTo(0, start + distance * ease(p));
      if (p < 1) requestAnimationFrame(frame); else { removeEventListener('wheel', cancel); removeEventListener('touchstart', cancel); done(); }
    };
    requestAnimationFrame(frame);
  });
}
export function wireSummaryLink(root) {
  root.addEventListener('click', async event => {
    const link = event.target.closest('.cart-checkout-total, .cart-summary-balloon');
    if (!link) return;
    const summary = root.querySelector('.cart-order-summary');
    if (!summary) return;
    event.preventDefault();
    // o balão sobe e some, como se puxasse a página junto
    const balloon = root.querySelector('.cart-summary-balloon');
    if (balloon && !matchMedia('(prefers-reduced-motion: reduce)').matches) balloon.animate([{transform: 'none', opacity: 1}, {transform: 'translateY(-22px) scale(.94)', opacity: 0}], {duration: 380, easing: 'cubic-bezier(.4, 0, .2, 1)'});
    const header = document.querySelector('.header.site-header.is-floating')?.getBoundingClientRect().height || 0;
    const y = summary.getBoundingClientRect().top + scrollY - header - 16;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) scrollTo(0, y); else await scrollToY(y);
    summary.classList.remove('is-spotlight'); void summary.offsetWidth; summary.classList.add('is-spotlight');
    summary.querySelector('h2')?.focus({preventScroll: true});
  });
}
let summaryWatch = null;
export function watchSummary(root) {
  summaryWatch?.disconnect();
  const summary = root.querySelector('.cart-order-summary'), bar = root.querySelector('.cart-checkout-bar');
  if (!summary || !bar || !('IntersectionObserver' in window)) return;
  // a setinha do balão aponta para onde está o resumo: para baixo enquanto ele está mais abaixo, para cima depois que a pessoa passou dele
  summaryWatch = new IntersectionObserver(([entry]) => {
    bar.classList.toggle('is-at-summary', entry.isIntersecting);
    if (!entry.isIntersecting) bar.classList.toggle('summary-above', entry.boundingClientRect.top < 0);
  }, {threshold: .35});
  summaryWatch.observe(summary.querySelector('.amounts') || summary);
}

// Os meios de pagamento aceitos, em três grupos (Pix, crédito, débito): a lista da conta do Mercado Pago (methods, de
// GET /api/payments/methods) ou, sem ela, FALLBACK_METHODS. checkout.js troca só este bloco quando a lista chega.
// O Pix aparece sempre: é regra da loja (5% de desconto) e o checkout sempre o oferece. As credenciais de teste do
// Mercado Pago não o listam, e por isso ele não pode depender da lista (pedido do dono, 05/10/2026).
const PAY_GROUPS = [['bank_transfer', 'Pix'], ['credit_card', 'Crédito'], ['debit_card', 'Débito']];
const PIX = {id: 'pix', name: 'Pix', type: 'bank_transfer'};
export function paymentBlock(methods) {
  const given = Array.isArray(methods) && methods.length ? methods : FALLBACK_METHODS;
  const list = given.some(m => m.id === 'pix') ? given : [PIX, ...given];
  const groups = PAY_GROUPS.map(([type, label]) => { const items = list.filter(m => m.type === type); return items.length ? `<div class="pay-group"><span class="pay-group-label">${label}</span><ul class="pay-marks">${items.map(payMark).join('')}</ul></div>` : ''; }).join('');
  return `<div class="cart-pay" data-cart-pay><h2>Métodos de pagamento aceitos</h2><div class="pay-groups">${groups}</div><p class="cart-pay-by">${MERCADO_PAGO_MARK}<span>Pagamento processado pelo Mercado Pago</span></p></div>`;
}

// No fim: o que a pessoa precisa saber para comprar tranquila (cada linha leva à política) e os meios de pagamento
// aceitos pelo Mercado Pago, só o que os Termos dizem.
function purchaseInfo(methods) {
  const row = (name, href, title, text) => `<li>${icon(name)}<a href="${href}"><strong>${title}</strong> <span>${text}</span></a></li>`;
  return `<section class="cart-info" aria-label="Informações da compra"><ul class="cart-info-list">${[
    row('truck', 'envio#frete', 'Entrega e frete.', 'Enviamos pelos Correios para todo o Brasil; o frete e o prazo saem pelo CEP.'),
    row('card', 'termos#precos', 'Formas de pagamento.', 'Pix com 5% de desconto ou cartão de crédito e débito, pelo Mercado Pago.'),
    row('clock', 'envio#prazo', 'Feito sob encomenda.', `A produção leva ${esc(COMMERCE.productionLabel)} e começa depois da confirmação do pagamento.`),
    row('returns', 'trocas', 'Trocas e devoluções.', 'Você pode desistir em até 7 dias depois de receber.')].join('')}</ul>
    ${paymentBlock(methods)}</section>`;
}
const extras = (cart, options = {}) => `<div class="cart-more">${recommendations(cart)}${purchaseInfo(options.payMethods)}</div>`;

// Every piece in the cart is bought: with one to three pieces, checkboxes only add noise (audit E2).
export function renderCart(cart, options = {}) {
  const chosen = cart;
  const introduction = `<div class="shop-heading cart-heading"><p class="eyebrow">SUAS ESCOLHAS</p><h1 tabindex="-1">Seu carrinho. <span class="cart-heart" aria-hidden="true">♡</span></h1><p>Confira seus produtos antes de continuar.</p></div>`;
  if (!cart.length) return `<div class="cart-empty-layout"><div id="cart-steps-slot"></div>${introduction}<section class="empty-cart"><span aria-hidden="true">♡</span><h2>Seu carrinho espera um pouco de cor.</h2><p>Escolha uma peça e crie a sua combinação.</p><a class="primary shop-primary" href="produtos">Explorar os produtos ${icon('arrow')}</a></section></div>${extras(cart, options)}`;
  return `<div class="cart-layout"><section class="cart-main-column" aria-label="Produtos no carrinho"><div id="cart-steps-slot"></div>${introduction}
    <div class="cart-products">${cart.map(item => itemCard(item, cart)).join('')}</div><a class="collection-link cart-continue" href="produtos" data-action="return">← Continuar escolhendo</a>
    </section>${cartSummary(chosen, options)}</div>${extras(cart, options)}`;
}
