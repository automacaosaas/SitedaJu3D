import {goToCart} from './shopping-navigation.js';
import {PRODUCTS} from './products.js';
import {readCart, writeCart, putItem, EDIT_KEY, DIRECT_KEY} from './cart-store.js';
import {COMMERCE, money} from './commerce-config.js';
import {icon} from './icons.js';

export function setupCartBridge({getProduct, getSelection, capture, restore}) {
  const panel = document.querySelector('#purchase-panel'), button = document.querySelector('#add-to-cart');
  const buy = document.querySelector('#buy-now'), status = document.querySelector('#purchase-status');
  const dialog = document.querySelector('#product-dialog');
  let edit = null, busy = false;
  try { edit = JSON.parse(sessionStorage.getItem(EDIT_KEY)); } catch {}
  if (edit) {
    const item = readCart().find(i => i.id === edit.id);
    if (item && item.productId === getProduct()) restore(item.selection);
    else edit = null;
  }
  function refresh() {
    panel.hidden = dialog.dataset.mode !== 'summary';
    buy.hidden = !!edit;
    dialog.toggleAttribute('data-cart-edit', !!edit);
    const key = getProduct();
    if (key && PRODUCTS[key]) {
      button.innerHTML = `${edit ? 'Salvar e voltar ao carrinho' : 'Adicionar ao carrinho'} ${icon(edit ? 'arrow' : 'cart')}`;
      document.querySelector('#product-price').textContent = money(COMMERCE.prices[key]);
    }
  }
  button.addEventListener('click', async () => {
    if (busy) return;
    busy = true; button.disabled = true;
    try {
      writeCart(putItem(readCart(), getProduct(), getSelection(), capture(), edit?.id || null));
      const edited = !!edit; edit = null;
      try { sessionStorage.removeItem(EDIT_KEY); } catch {}
      window.dispatchEvent(new Event('ju:cart'));
      if (edited) {
        button.innerHTML = `Salvo ${icon('check')}`;
        dialog.querySelector('.close').click();
        await new Promise(resolve => requestAnimationFrame(resolve));
        await goToCart({replace:true, saved:true});
        return;
      }
      dialog.querySelector('.close').click();
      await new Promise(resolve => requestAnimationFrame(resolve));
      await goToCart();
    } catch (error) { status.textContent = error.message; }
    finally { setTimeout(() => { busy = false; button.disabled = false; refresh(); }, 900); }
  });
  buy.addEventListener('click', () => {
    if (busy || edit) return;
    busy = true; buy.disabled = true;
    try {
      sessionStorage.setItem(DIRECT_KEY, JSON.stringify(putItem([], getProduct(), getSelection(), capture())));
      edit = null;
      try { sessionStorage.removeItem(EDIT_KEY); } catch {}
      location.assign('comprar-agora.html');
    } catch { status.textContent = 'Não foi possível preparar a compra. Verifique o armazenamento do navegador.'; busy = false; buy.disabled = false; }
  });
  const clearEdit = () => { edit = null; status.textContent = ''; try { sessionStorage.removeItem(EDIT_KEY); } catch {} refresh(); };
  window.addEventListener('hashchange', clearEdit);
  dialog.addEventListener('close', () => {
    const returnToCart = !!edit;
    clearEdit();
    if (returnToCart) location.replace('checkout.html');
  });
  window.addEventListener('pageshow', () => { busy = false; button.disabled = buy.disabled = false; refresh(); });
  new MutationObserver(() => {status.textContent='';refresh();}).observe(dialog, {attributes:true,attributeFilter:['data-mode']});
  refresh();
}
