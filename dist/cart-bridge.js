import {PRODUCTS} from './products.js';
import {readCart, writeCart, putItem, EDIT_KEY, CART_KEY} from './cart-store.js';
import {COMMERCE, money} from './commerce-config.js';

export function setupCartBridge({getProduct, getSelection, capture, restore}) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'primary'; button.id = 'add-to-cart';
  const status = document.createElement('p'); status.className = 'color-note'; status.setAttribute('role', 'status');
  document.querySelector('#combination').append(status, button);
  let edit = null, busy = false;
  try { edit = JSON.parse(sessionStorage.getItem(EDIT_KEY)); } catch {}
  if (edit) {
    const item = readCart().find(i => i.id === edit.id);
    if (item && item.productId === getProduct()) restore(item.selection);
    else edit = null;
  }
  function refresh() {
    const count = readCart().reduce((sum, i) => sum + i.quantity, 0);
    document.querySelector('#cart-count').textContent = count;
    document.querySelector('#cart-link').setAttribute('aria-label', `Ver carrinho, ${count} ${count === 1 ? 'item' : 'itens'}`);
    const key = getProduct();
    if (key && PRODUCTS[key]) {
      button.textContent = `${edit ? 'Salvar no carrinho' : 'Adicionar ao carrinho'} · ${money(COMMERCE.prices[key])}`;
      status.textContent = 'Preço de demonstração. Nenhuma cobrança será realizada.';
    }
  }
  button.addEventListener('click', () => {
    if (busy) return;
    busy = true; button.disabled = true;
    try {
      const key = getProduct(), selection = getSelection();
      writeCart(putItem(readCart(), key, selection, capture(), edit?.id || null));
      try { sessionStorage.removeItem(EDIT_KEY); } catch {}
      location.assign('checkout.html');
    } catch (error) { status.textContent = error.message; busy = false; button.disabled = false; }
  });
  const clearEdit = () => {edit = null; try {sessionStorage.removeItem(EDIT_KEY);} catch {} refresh();};
  window.addEventListener('hashchange', clearEdit);
  document.querySelector('#product-dialog').addEventListener('close', clearEdit);
  window.addEventListener('storage', e => { if (e.key === CART_KEY) refresh(); });
  window.addEventListener('pageshow', () => {busy = false; button.disabled = false; refresh();});
  new MutationObserver(refresh).observe(document.querySelector('#product-dialog'), {attributes: true, attributeFilter: ['data-mode']});
  refresh();
}
