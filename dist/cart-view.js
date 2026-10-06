import {PRODUCTS, color, showcase, artSmall} from './products.js';
import {COMMERCE, money} from './commerce-config.js';
import {totals, pixDiscount} from './cart-store.js';
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

function itemCard(item) {
  const product = PRODUCTS[item.productId];
  return `<article class="cart-product" aria-label="${esc(item.title)}">
    <div class="cart-product-art"><img src="assets/${esc(artSmall(product.catalogImage || product.image))}" width="1024" height="1024" alt="${esc(item.title)} — imagem nas cores originais">${editButton(item, true)}</div>
    <div class="cart-product-info"><h2>${esc(item.title)}</h2><p class="item-type">${esc(product.subtitle)}</p>${swatches(item)}${editButton(item)}</div>
    <div class="cart-product-controls"><div class="quantity-control" role="group" aria-label="Quantidade de ${esc(item.title)}"><button type="button" data-action="minus" data-id="${esc(item.id)}" aria-label="Diminuir quantidade de ${esc(item.title)}" ${item.quantity <= 1 ? 'disabled' : ''}>−</button><output aria-label="Quantidade de ${esc(item.title)}">${item.quantity}</output><button type="button" data-action="plus" data-id="${esc(item.id)}" aria-label="Aumentar quantidade de ${esc(item.title)}" ${item.quantity >= 99 ? 'disabled' : ''}>+</button></div><button type="button" class="trash-button" data-action="remove" data-id="${esc(item.id)}" aria-label="Remover ${esc(item.title)}">${icon('trash')}</button></div>
    <strong class="cart-product-price" aria-label="Preço de ${item.quantity} ${esc(item.title)}">${money(item.unitPrice * item.quantity)}</strong>
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
      <a class="cart-checkout-total" href="#cart-summary-title"><span>Total <span aria-hidden="true">⌃</span></span><strong>${money(amount.total)}</strong><small>${!chosen.length ? 'Selecione uma peça' : withoutDelivery ? 'Sem frete · ver resumo' : 'Ver resumo'}</small></a>
      <button type="button" class="primary cart-checkout" data-action="checkout" ${chosen.length ? '' : 'disabled'}>Finalizar pedido ${icon('arrow')}</button>
    </div>
    ${!chosen.length ? '<p class="cart-selection-help">Selecione uma peça para continuar.</p>' : ''}
  </aside>`;
}

// Depois do resumo: até 3 das outras peças da loja (as que ainda não estão no carrinho), cada uma levando à página dela, e
// no fim "Ver mais", para a página Produtos. No celular é uma fileira que desliza, com setas finas (wireRecArrows).
function recommendations(cart) {
  const inCart = new Set(cart.map(item => item.productId)), ids = Object.keys(PRODUCTS).filter(id => !inCart.has(id)).slice(0, 3);
  if (!ids.length) return '';
  const more = `<li class="cart-rec-more-item"><a class="cart-rec cart-rec-more" href="produtos.html"><span class="cart-rec-more-mark" aria-hidden="true"></span><strong>Ver mais</strong><small>Todas as peças</small></a></li>`;
  const arrow = (step, label) => `<button type="button" class="cart-rec-arrow ${step < 0 ? 'is-prev' : 'is-next'}" data-rec-step="${step}" aria-label="${label}" hidden>${icon('arrow')}</button>`;
  return `<section class="cart-recs" aria-labelledby="cart-recs-title"><h2 id="cart-recs-title">${cart.length ? 'Você também pode gostar' : 'Comece por uma destas'}</h2><div class="cart-rec-rail">${arrow(-1, 'Peças anteriores')}<ul class="cart-rec-track" data-rec-track>${ids.map(id => {
    const product = PRODUCTS[id], {theme} = showcase(id);
    return `<li><a class="cart-rec" href="${id}.html" style="--rec-stops:${theme.bannerStops};--rec-accent:${theme.accentColor};--rec-ink:${theme.textColor}"><span class="cart-rec-art"><img src="assets/card-${id}.webp" alt="" width="768" height="768" loading="lazy" decoding="async"></span><span class="cart-rec-copy"><span class="cart-rec-name">${esc(product.title)}</span><span class="cart-rec-sub">${esc(product.subtitle)}</span><strong class="cart-rec-price">${money(COMMERCE.prices[id])}</strong></span></a></li>`;
  }).join('')}${more}</ul>${arrow(1, 'Mais peças')}</div></section>`;
}

// As setas da fileira: avançam um card e somem quando não há mais para onde ir (no computador, sem rolagem, não aparecem).
export function updateRecArrows(root) {
  const track = root.querySelector('[data-rec-track]');
  if (!track) return;
  const max = track.scrollWidth - track.clientWidth - 2;
  root.querySelectorAll('[data-rec-step]').forEach(button => { button.hidden = max <= 0 || (Number(button.dataset.recStep) < 0 ? track.scrollLeft <= 2 : track.scrollLeft >= max); });
}
export function wireRecArrows(root) {
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-rec-step]'), track = root.querySelector('[data-rec-track]');
    if (!button || !track) return;
    const step = (track.querySelector('li')?.offsetWidth || 240) + 12;
    track.scrollBy({left: Number(button.dataset.recStep) * step, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
  });
  root.addEventListener('scroll', event => { if (event.target.matches?.('[data-rec-track]')) updateRecArrows(root); }, true);
  window.addEventListener('resize', () => updateRecArrows(root), {passive: true});
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
    <div class="cart-products">${cart.map(item => itemCard(item)).join('')}</div><a class="collection-link cart-continue" href="produtos.html" data-action="return">← Continuar escolhendo</a>
    </section>${cartSummary(chosen, options)}</div>${extras(cart, options)}`;
}
