import {PRODUCTS, color} from './products.js';
import {COMMERCE, money} from './commerce-config.js';
import {selectedItems, totals, pixDiscount} from './cart-store.js';
import {icon} from './icons.js';
import {freeShippingBar} from './free-shipping.js';
import {formatDays, shippingMessage} from './shipping-client.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const editButton = (item, circular = false) => `<button type="button" class="${circular ? 'cart-customize' : 'cart-edit-link'}" data-action="edit" data-id="${esc(item.id)}" aria-label="Editar personalização de ${esc(item.title)}">${circular ? icon('pencil') : 'Editar cores'}</button>`;
const formatCep = cep => { const digits = String(cep ?? '').replace(/\D/g, '').slice(0, 8); return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits; };

function swatches(item) {
  return `<div class="cart-colors"><span>Cores</span><ul aria-label="Cores escolhidas para ${esc(item.title)}">${PRODUCTS[item.productId].parts.map(part => {
    const chosen = color(item.selection[part.id]), label = `${part.name}: ${chosen.name}`;
    return `<li><span class="cart-swatch" style="--chip:${chosen.hex}" role="img" aria-label="${esc(label)}" title="${esc(label)}"></span></li>`;
  }).join('')}</ul></div>`;
}

function itemCard(item, selected) {
  const product = PRODUCTS[item.productId];
  return `<article class="cart-product ${selected ? 'is-selected' : 'is-unselected'}" aria-label="${esc(item.title)}">
    <label class="cart-select"><input type="checkbox" data-select-id="${esc(item.id)}" aria-label="Selecionar ${esc(item.title)}" ${selected ? 'checked' : ''}></label>
    <div class="cart-product-art"><img src="assets/${esc(product.catalogImage || product.image)}" width="1024" height="1024" alt="${esc(item.title)} — imagem nas cores originais">${editButton(item, true)}</div>
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
  return `<aside class="cart-order-summary" aria-labelledby="cart-summary-title"><h2 id="cart-summary-title">Resumo do pedido</h2><p class="cart-selection-note">${units} ${units === 1 ? 'peça selecionada' : 'peças selecionadas'}</p>
    ${realShipping && chosen.length ? freeShippingBar(freeShipping, amount.subtotal) : ''}
    <dl class="amounts"><div><dt>Subtotal</dt><dd>${money(amount.subtotal)}</dd></div>${delivery}<div class="grand-total"><dt>Total${withoutDelivery ? ' <small>(sem entrega)</small>' : ''}</dt><dd>${money(amount.total)}</dd></div>${chosen.length ? `<div class="pix-hint"><dt>No Pix <small>(5% off)</small></dt><dd>${money(amount.total - pixDiscount(chosen))}</dd></div>` : ''}</dl>
    ${realShipping && chosen.length ? shippingEstimate(estimate || {}) : ''}
    <div class="cart-checkout-bar" role="group" aria-label="Resumo da compra e finalização">
      <a class="cart-checkout-total" href="#cart-summary-title"><span>Total <span aria-hidden="true">⌃</span></span><strong>${money(amount.total)}</strong><small>${!chosen.length ? 'Selecione uma peça' : withoutDelivery ? 'Sem frete · ver resumo' : 'Ver resumo'}</small></a>
      <button type="button" class="primary cart-checkout" data-action="checkout" ${chosen.length ? '' : 'disabled'}>Finalizar pedido ${icon('arrow')}</button>
    </div>
    ${!chosen.length ? '<p class="cart-selection-help">Selecione uma peça para continuar.</p>' : ''}
    <div class="cart-reassurance"><div>${icon('lock')}<p><strong>Compra segura</strong><span>Seus dados protegidos</span></p></div><div>${icon('truck')}<p><strong>Produção sob demanda</strong><span>${esc(productionLabel || COMMERCE.productionLabel)}</span></p></div></div>
    <div class="accepted-methods" aria-label="Meios de pagamento${COMMERCE.mode === 'demo' ? ' em demonstração' : ''}"><span>${icon('pix')} Pix</span><span>${icon('card')} Cartão</span></div>
  </aside>`;
}

export function renderCart(cart, selected, options = {}) {
  const chosen = selectedItems(cart, selected);
  const introduction = `<div class="shop-heading cart-heading"><button type="button" class="cart-back" data-action="return" aria-label="Voltar à página anterior">${icon('arrow')}</button><p class="eyebrow">SUAS ESCOLHAS</p><h1 tabindex="-1">Seu carrinho. <span class="cart-heart" aria-hidden="true">♡</span></h1><p>Confira seus produtos antes de continuar.</p></div>`;
  if (!cart.length) return `<div class="cart-empty-layout"><div id="cart-steps-slot"></div>${introduction}<section class="empty-cart"><span aria-hidden="true">♡</span><h2>Seu carrinho espera um pouco de cor.</h2><p>Escolha uma peça e crie a sua combinação.</p><a class="primary shop-primary" href="produtos.html">Explorar os produtos ${icon('arrow')}</a></section></div>`;
  return `<div class="cart-layout"><section class="cart-main-column" aria-label="Produtos no carrinho"><div id="cart-steps-slot"></div>${introduction}
    <div class="cart-select-tools"><label class="select-label"><input type="checkbox" id="select-all" aria-label="Selecionar todos os produtos" ${chosen.length === cart.length ? 'checked' : ''}>Selecionar todos (${cart.length})</label><button type="button" class="remove-selected" data-action="remove-selected" aria-label="Remover produtos selecionados" ${chosen.length ? '' : 'disabled'}>${icon('trash')}<span>Remover selecionados</span></button></div>
    <div class="cart-products">${cart.map(item => itemCard(item, selected.has(item.id))).join('')}</div><a class="collection-link cart-continue" href="produtos.html">← Continuar escolhendo</a>
    </section>${cartSummary(chosen, options)}</div>`;
}
