import {PRODUCTS, SOON, color, showcase} from './products.js';
import {COMMERCE, money} from './commerce-config.js';
import {totals, pixDiscount, lineCents} from './cart-store.js';
import {icon} from './icons.js';
import {freeShippingBar} from './free-shipping.js';
import {formatDays, shippingMessage} from './shipping-client.js';
import {FALLBACK_METHODS, payMark, MERCADO_PAGO_MARK} from './payment-marks.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const editButton = (item, circular = false) => `<button type="button" class="${circular ? 'cart-customize' : 'cart-edit-link'}" data-action="edit" data-id="${esc(item.id)}" aria-label="Editar personalização de ${esc(item.title)}">${circular ? icon('pencil') : 'Editar cores'}</button>`;
const formatCep = cep => { const digits = String(cep ?? '').replace(/\D/g, '').slice(0, 8); return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits; };

function swatches(item) {
  return `<div class="cart-colors"><span>Cores</span><ul aria-label="Cores escolhidas para ${esc(item.title)}">${PRODUCTS[item.productId].parts.map(part => {
    const chosen = color(item.selection[part.id]), label = `${part.name}: ${chosen.name}`;
    return `<li><span class="cart-swatch" style="--chip:${chosen.hex}" role="img" aria-label="${esc(label)}" title="${esc(label)}"></span></li>`;
  }).join('')}</ul></div>`;
}

function itemCard(item, cart) {
  const product = PRODUCTS[item.productId];
  return `<article class="cart-product" aria-label="${esc(item.title)}">
    <div class="cart-product-art"><img src="assets/${esc(product.catalogImage || product.image)}" width="1024" height="1024" alt="${esc(item.title)} — imagem nas cores originais">${editButton(item, true)}</div>
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

// "Você também pode gostar" (06/10/2026, pedido do Luiz): cards pequenos, lado a lado num carrossel, só com a foto, o nome e o
// preço; as peças que ainda não estão no carrinho e, depois, as novidades (com "Em breve" no lugar do preço). O carrossel passa
// um card por vez sozinho (wireRecArrows) e a seta da direita mostra, num anel, quanto falta para o próximo; "Ver todas" leva à
// página Produtos. Os cards se repetem uma vez no fim (cópias escondidas do leitor de tela e do Tab): o carrossel dá a volta sem
// rebobinar, e anda também no computador, onde os originais cabem na largura.
function recommendations(cart) {
  const inCart = new Set(cart.map(item => item.productId));
  const items = [...Object.keys(PRODUCTS).filter(id => !inCart.has(id)).map(id => ({id, href: `${id}.html`, title: PRODUCTS[id].title, price: money(COMMERCE.prices[id])})),
    ...Object.keys(SOON).map(id => ({id, href: `index.html#produto/${id}/3d`, title: SOON[id].title}))];
  if (!items.length) return '';
  const arrow = step => `<button type="button" class="cart-rec-arrow ${step < 0 ? 'is-prev' : 'is-next'}" data-rec-step="${step}" aria-label="${step < 0 ? 'Peças anteriores' : 'Mais peças'}"${step < 0 ? ' hidden' : ''}>${step > 0 ? '<svg class="cart-rec-ring" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22"></circle></svg>' : ''}${icon('arrow')}</button>`;
  const card = ({id, href, title, price}, clone) => {
    const {theme} = showcase(id);
    return `<li${clone ? ' aria-hidden="true"' : ''}><a class="cart-rec${price ? '' : ' is-soon'}${clone ? ' is-clone' : ''}" href="${href}"${clone ? ' tabindex="-1"' : ''} style="--rec-stops:${theme.bannerStops};--rec-accent:${theme.accentColor};--rec-ink:${theme.textColor}"><span class="cart-rec-art"><img src="assets/card-preview-${id}.webp" alt="" width="384" height="384" loading="lazy" decoding="async" draggable="false"></span><span class="cart-rec-name">${esc(title)}</span><span class="cart-rec-price">${price || 'Em breve'}</span></a></li>`;
  };
  return `<section class="cart-recs" aria-labelledby="cart-recs-title"><div class="cart-recs-head"><h2 id="cart-recs-title">${cart.length ? 'Você também pode gostar' : 'Comece por uma destas'}</h2><a class="cart-recs-all" href="produtos.html">Ver todas ${icon('arrow')}</a></div><div class="cart-rec-rail" aria-roledescription="carrossel">${arrow(-1)}<ul class="cart-rec-track" data-rec-track>${items.map(item => card(item, false)).join('')}${items.map(item => card(item, true)).join('')}</ul>${arrow(1)}</div></section>`;
}

// A seta de avançar aparece sempre que a fileira rola (ela dá a volta); a de voltar, depois que a fileira andou.
export function updateRecArrows(root) {
  const track = root.querySelector('[data-rec-track]');
  if (!track) return;
  const max = track.scrollWidth - track.clientWidth - 2, rail = track.closest('.cart-rec-rail');
  rail.classList.toggle('can-scroll', max > 0);
  rail.classList.toggle('at-start', track.scrollLeft <= 2);
  const prev = root.querySelector('[data-rec-step="-1"]'), next = root.querySelector('[data-rec-step="1"]');
  if (prev) prev.hidden = max <= 0 || track.scrollLeft <= 2;
  if (next) next.hidden = max <= 0;
}

// O carrossel: um card por vez a cada AUTO_MS, em volta (depois do último vem o primeiro, das cópias, e a fileira volta uma volta
// inteira sem ninguém ver). Para enquanto o mouse está em cima, o foco
// está dentro, a pessoa acabou de mexer (toque, arraste, rolagem: 6 s), a fileira está fora da tela ou a aba escondida; com
// "reduzir movimento", não anda sozinho. No computador, a fileira também se arrasta com o mouse (e assenta no card mais perto).
const AUTO_MS = 4200;
export function wireRecArrows(root) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let timer = 0, settle = 0, hover = false, focus = false, heldUntil = 0, autoUntil = 0, drag = null;
  const track = () => root.querySelector('[data-rec-track]');
  const step = t => { const li = t.querySelector('li'); return li ? li.getBoundingClientRect().width + (parseFloat(getComputedStyle(t).columnGap) || 12) : 200; };
  const hold = (ms = 6000) => { heldUntil = Date.now() + ms; schedule(); };
  const lap = t => t.querySelectorAll('li:not([aria-hidden])').length * step(t);       // a largura de uma volta
  const jump = (t, left) => { t.classList.add('is-dragging'); t.scrollLeft = left; void t.offsetWidth; t.classList.remove('is-dragging'); };
  function wrap(t = track()) { if (t && t.scrollLeft >= lap(t) - 1) { autoUntil = Date.now() + 200; jump(t, t.scrollLeft - lap(t)); } }
  function go(direction, t = track()) {
    if (!t) return;
    const behavior = reduce.matches ? 'auto' : 'smooth';
    autoUntil = Date.now() + 900;
    if (direction < 0 && t.scrollLeft < step(t) / 2) jump(t, t.scrollLeft + lap(t));
    t.scrollTo({left: Math.round(t.scrollLeft / step(t) + direction) * step(t), behavior});
    setTimeout(() => wrap(t), reduce.matches ? 0 : 700);
  }
  function playing(t) {
    if (!t || reduce.matches || hover || focus || drag || document.hidden || Date.now() < heldUntil || t.scrollWidth - t.clientWidth <= 4) return false;
    const box = t.getBoundingClientRect();
    return box.bottom > 0 && box.top < innerHeight;
  }
  function schedule() {
    clearTimeout(timer);
    const t = track(), rail = t?.closest('.cart-rec-rail');
    if (!rail) return;
    const on = playing(t);
    // o anel da seta recomeça a cada card (a animação dele dura AUTO_MS)
    if (on !== rail.classList.contains('is-playing') || on) { rail.classList.remove('is-playing'); if (on) { void rail.offsetWidth; rail.classList.add('is-playing'); } }
    rail.style.setProperty('--rec-auto', `${AUTO_MS}ms`);
    timer = setTimeout(() => { if (playing(track())) go(1); schedule(); }, on ? AUTO_MS : 800);
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-rec-step]');
    if (drag?.moved) { event.preventDefault(); event.stopPropagation(); drag = null; return; }
    if (!button) return;
    go(Number(button.dataset.recStep)); hold();
  }, true);
  root.addEventListener('scroll', event => {
    if (!event.target.matches?.('[data-rec-track]')) return;
    updateRecArrows(root);
    if (Date.now() > autoUntil && !drag) hold();          // a pessoa rolou: espera ela terminar
    clearTimeout(settle); settle = setTimeout(() => wrap(), 160);
  }, true);
  root.addEventListener('pointerover', event => { if (event.pointerType === 'mouse' && event.target.closest('.cart-rec-rail')) { hover = true; schedule(); } });
  root.addEventListener('pointerout', event => { if (event.pointerType === 'mouse' && event.target.closest('.cart-rec-rail') && !event.relatedTarget?.closest?.('.cart-rec-rail')) { hover = false; schedule(); } });
  root.addEventListener('focusin', event => { if (event.target.closest('.cart-rec-rail')) { focus = true; schedule(); } });
  root.addEventListener('focusout', event => { if (event.target.closest('.cart-rec-rail') && !event.relatedTarget?.closest?.('.cart-rec-rail')) { focus = false; schedule(); } });
  root.addEventListener('touchstart', event => { if (event.target.closest('.cart-rec-rail')) hold(); }, {passive: true});
  // arrastar com o mouse
  root.addEventListener('pointerdown', event => {
    const t = event.target.closest('[data-rec-track]');
    if (!t || event.pointerType !== 'mouse' || event.button !== 0) return;
    drag = {t, x: event.clientX, left: t.scrollLeft, moved: false, id: event.pointerId};
  });
  addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 6) { drag.moved = true; drag.t.classList.add('is-dragging'); }
    if (drag.moved) drag.t.scrollLeft = drag.left - dx;
  });
  addEventListener('pointerup', () => {
    if (!drag) return;
    const {t, moved} = drag;
    if (!moved) { drag = null; return; }
    t.classList.remove('is-dragging');
    autoUntil = Date.now() + 900;
    t.scrollTo({left: Math.round(t.scrollLeft / step(t)) * step(t), behavior: reduce.matches ? 'auto' : 'smooth'});
    setTimeout(() => { drag = null; hold(); }, 0);   // o clique que vem logo depois do arraste não abre o card
  });
  document.addEventListener('visibilitychange', schedule);
  addEventListener('scroll', () => { if (!root.querySelector('.cart-rec-rail.is-playing')) schedule(); }, {passive: true});
  addEventListener('resize', () => updateRecArrows(root), {passive: true});
  schedule();
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
    row('truck', 'termos.html#producao', 'Entrega e frete.', 'Enviamos pelos Correios para todo o Brasil; o frete e o prazo saem pelo CEP.'),
    row('card', 'termos.html#precos', 'Formas de pagamento.', 'Pix com 5% de desconto ou cartão de crédito e débito, pelo Mercado Pago.'),
    row('clock', 'termos.html#producao', 'Feito sob encomenda.', `A produção leva ${esc(COMMERCE.productionLabel)} e começa depois da confirmação do pagamento.`),
    row('returns', 'trocas.html', 'Trocas e devoluções.', 'Você pode desistir em até 7 dias depois de receber.')].join('')}</ul>
    ${paymentBlock(methods)}</section>`;
}
const extras = (cart, options = {}) => `<div class="cart-more">${recommendations(cart)}${purchaseInfo(options.payMethods)}</div>`;

// Every piece in the cart is bought: with one to three pieces, checkboxes only add noise (audit E2).
export function renderCart(cart, options = {}) {
  const chosen = cart;
  const introduction = `<div class="shop-heading cart-heading"><p class="eyebrow">SUAS ESCOLHAS</p><h1 tabindex="-1">Seu carrinho. <span class="cart-heart" aria-hidden="true">♡</span></h1><p>Confira seus produtos antes de continuar.</p></div>`;
  if (!cart.length) return `<div class="cart-empty-layout"><div id="cart-steps-slot"></div>${introduction}<section class="empty-cart"><span aria-hidden="true">♡</span><h2>Seu carrinho espera um pouco de cor.</h2><p>Escolha uma peça e crie a sua combinação.</p><a class="primary shop-primary" href="produtos.html">Explorar os produtos ${icon('arrow')}</a></section></div>${extras(cart, options)}`;
  return `<div class="cart-layout"><section class="cart-main-column" aria-label="Produtos no carrinho"><div id="cart-steps-slot"></div>${introduction}
    <div class="cart-products">${cart.map(item => itemCard(item, cart)).join('')}</div><a class="collection-link cart-continue" href="produtos.html" data-action="return">← Continuar escolhendo</a>
    </section>${cartSummary(chosen, options)}</div>${extras(cart, options)}`;
}
