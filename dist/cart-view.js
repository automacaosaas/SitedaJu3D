import {PRODUCTS, color} from './products.js';
import {COMMERCE, money} from './commerce-config.js';
import {selectedItems, totals} from './cart-store.js';
import {icon} from './icons.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const editButton = (item, circular = false) => `<button type="button" class="${circular ? 'cart-customize' : 'cart-edit-link'}" data-action="edit" data-id="${esc(item.id)}" aria-label="Editar personalização de ${esc(item.title)}">${circular ? icon('pencil') : 'Editar cores'}</button>`;

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

function orderSummary(chosen) {
  const amount = totals(chosen), units = chosen.reduce((sum, item) => sum + item.quantity, 0);
  return `<aside class="cart-order-summary" aria-labelledby="cart-summary-title"><h2 id="cart-summary-title">Resumo do pedido</h2><p class="cart-selection-note">${units} ${units === 1 ? 'peça selecionada' : 'peças selecionadas'}</p>
    <dl class="amounts"><div><dt>Subtotal</dt><dd>${money(amount.subtotal)}</dd></div><div><dt>Entrega${COMMERCE.mode === 'demo' ? ' <small>(exemplo)</small>' : ''}</dt><dd>${money(amount.shipping)}</dd></div><div class="grand-total"><dt>Total</dt><dd>${money(amount.total)}</dd></div></dl>
    <button type="button" class="primary cart-checkout" data-action="checkout" ${chosen.length ? '' : 'disabled'}>Finalizar pedido ${icon('arrow')}</button>
    ${!chosen.length ? '<p class="cart-selection-help">Selecione uma peça para continuar.</p>' : ''}
    <div class="cart-reassurance"><div>${icon('lock')}<p><strong>Compra segura</strong><span>Seus dados protegidos</span></p></div><div>${icon('truck')}<p><strong>Produção sob demanda</strong><span>${esc(COMMERCE.productionLabel)}</span></p></div></div>
    <div class="accepted-methods" aria-label="Meios de pagamento${COMMERCE.mode === 'demo' ? ' em demonstração' : ''}"><span>${icon('pix')} Pix</span><span>${icon('card')} Cartão</span></div>
  </aside>`;
}

export function renderCart(cart, selected) {
  const chosen = selectedItems(cart, selected);
  const introduction = `<div class="shop-heading cart-heading"><p class="eyebrow">SUAS ESCOLHAS</p><h1 tabindex="-1">Seu carrinho. <span class="cart-heart" aria-hidden="true">♡</span></h1><p>Confira seus produtos antes de continuar.</p></div>`;
  if (!cart.length) return `<div class="cart-empty-layout"><div id="cart-steps-slot"></div>${introduction}<section class="empty-cart"><span aria-hidden="true">♡</span><h2>Seu carrinho espera um pouco de cor.</h2><p>Escolha uma peça e crie a sua combinação.</p><a class="primary shop-primary" href="produtos.html">Explorar os produtos ${icon('arrow')}</a></section></div>`;
  return `<div class="cart-layout"><section class="cart-main-column" aria-label="Produtos no carrinho"><div id="cart-steps-slot"></div>${introduction}
    <div class="cart-select-tools"><label class="select-label"><input type="checkbox" id="select-all" aria-label="Selecionar todos os produtos" ${chosen.length === cart.length ? 'checked' : ''}>Selecionar todos (${cart.length})</label><button type="button" class="remove-selected" data-action="remove-selected" aria-label="Remover produtos selecionados" ${chosen.length ? '' : 'disabled'}>${icon('trash')}<span>Remover selecionados</span></button></div>
    <div class="cart-products">${cart.map(item => itemCard(item, selected.has(item.id))).join('')}</div><a class="collection-link cart-continue" href="produtos.html">← Continuar escolhendo</a>
    </section>${orderSummary(chosen)}</div>`;
}
