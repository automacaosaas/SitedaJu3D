import {icon} from './icons.js';
import {readCart, CART_KEY} from './cart-store.js';
import {getSession, signOut} from './auth-service.js';

export function refreshHeader() {
  const quantity = readCart().reduce((sum, item) => sum + item.quantity, 0);
  document.querySelectorAll('[data-cart-count]').forEach(el => { el.textContent = quantity; el.hidden = !quantity; });
  document.querySelectorAll('[data-cart-link]').forEach(el => el.setAttribute('aria-label', `Carrinho, ${quantity} ${quantity === 1 ? 'item' : 'itens'}`));
}
for (const host of document.querySelectorAll('[data-shop-nav]')) {
  host.innerHTML = `<a class="nav-products" href="index.html#produtos">Produtos</a><a class="header-icon" data-cart-link href="checkout.html" aria-label="Carrinho">${icon('cart')}<span class="cart-badge" data-cart-count hidden>0</span></a><div class="profile-nav"><button class="header-icon" type="button" aria-label="Meu perfil" aria-expanded="false" aria-controls="profile-menu">${icon('profile')}</button><div class="profile-menu" id="profile-menu" hidden><p class="profile-greeting"></p><a href="conta.html" data-account-link>Entrar ou cadastrar</a><a href="conta.html#pedidos">${icon('bag')} Meus pedidos</a><button type="button" data-signout hidden>${icon('exit')} Sair</button></div></div>`;
  const trigger = host.querySelector('button'), menu = host.querySelector('.profile-menu');
  const close = () => { menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); };
  trigger.addEventListener('click', () => {
    const session = getSession();
    host.querySelector('.profile-greeting').textContent = session ? `Olá, ${session.name.split(' ')[0]}.` : 'Um cantinho só seu.';
    host.querySelector('[data-account-link]').textContent = session ? 'Minha conta' : 'Entrar ou cadastrar';
    host.querySelector('[data-signout]').hidden = !session;
    menu.hidden = !menu.hidden; trigger.setAttribute('aria-expanded', String(!menu.hidden));
  });
  host.querySelector('[data-signout]').addEventListener('click', async () => { await signOut(); close(); location.assign('conta.html'); });
  document.addEventListener('click', e => { if (!host.contains(e.target)) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { close(); trigger.focus(); } });
}
window.addEventListener('storage', e => { if (e.key === CART_KEY) refreshHeader(); });
window.addEventListener('pageshow', refreshHeader);
window.addEventListener('ju:cart', refreshHeader);
refreshHeader();
