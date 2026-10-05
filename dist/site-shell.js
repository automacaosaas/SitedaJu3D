import {icon} from './icons.js';
import {mountLanguagePicker} from './i18n.js';
import {readCart, CART_KEY} from './cart-store.js';
import {getSession, refreshSession, signOut} from './auth-service.js';
import {setupScrollHeader} from './header-scroll.js';
import {mountAnnouncementBar} from './announcement-bar.js';
import {PRODUCTS} from './products.js';
import {COMMERCE} from './commerce-config.js';
import './shopping-navigation.js';
import './account-drawer.js';

const MAIN_NAVIGATION = [
  {label:'Início', href:'index.html', active:() => /(?:\/|\/index\.html)$/.test(location.pathname)},
  {label:'Produtos', href:'produtos.html', active:() => /produtos\.html$/.test(location.pathname)},
  {label:'Sobre a Ju', href:'sobre.html', active:() => /\/sobre\.html$/.test(location.pathname)},
  {label:'Contato', href:'contato.html', active:() => /\/contato\.html$/.test(location.pathname)}
];
const primaryNav = () => MAIN_NAVIGATION.map(item => `<a href="${item.href}"${item.active() ? ' aria-current="page"' : ''}>${item.label}</a>`).join('');
// The phone menu beyond the four links (audit H1): the pieces with thumbnails, "Meus pedidos", "Fale com a Ju" once the
// WhatsApp number exists, Instagram and the signature.
const INSTAGRAM = 'https://www.instagram.com/juimprimepramim/';
function drawerExtras() {
  const pieces = Object.entries(PRODUCTS).map(([id, product]) => `<li><a href="${id}.html"><img src="assets/card-preview-${id}.webp" alt="" width="56" height="56" loading="lazy" decoding="async"><span><strong>${product.title}</strong><small>${product.subtitle}</small></span></a></li>`).join('');
  const whatsapp = /^\d{10,15}$/.test(COMMERCE.whatsapp) ? `<a href="https://wa.me/${COMMERCE.whatsapp}" target="_blank" rel="noopener">${icon('mail')}<span>Fale com a Ju</span></a>` : '';
  return `<section class="drawer-products" aria-labelledby="drawer-products-title"><h2 id="drawer-products-title">Nossas peças</h2><ul>${pieces}</ul></section>`
    + `<nav class="drawer-more" aria-label="Mais"><a href="conta.html#pedidos">${icon('bag')}<span>Meus pedidos</span></a>${whatsapp}<a href="${INSTAGRAM}" target="_blank" rel="noopener noreferrer" aria-label="Instagram da Ju, imprime pra mim? (abre em uma nova aba)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r=".9" fill="currentColor" stroke="none"/></svg><span>Instagram</span></a></nav>`
    + '<p class="drawer-signature">feito com carinho, pela Ju.</p>';
}

function setupSiteHeader(host) {
  const header = host.closest('.header');
  if (!header || header.dataset.siteHeaderReady) return;
  header.dataset.siteHeaderReady = 'true';
  header.classList.add('site-header');
  header.querySelector('.edition')?.setAttribute('hidden', '');
  header.querySelector('.brand')?.insertAdjacentHTML('afterend', `<nav class="primary-nav" aria-label="Navegação principal">${primaryNav()}</nav>`);
  header.insertAdjacentHTML('afterbegin', `<button type="button" class="menu-toggle" aria-label="Abrir menu" aria-expanded="false" aria-controls="mobile-drawer"><i></i><i></i><i></i></button>`);
}

function setupMobileDrawer() {
  if (!document.querySelector('.menu-toggle') || document.querySelector('#mobile-drawer')) return;
  document.body.insertAdjacentHTML('beforeend', `<div class="mobile-drawer-layer" hidden><aside class="mobile-drawer" id="mobile-drawer" aria-label="Menu principal" aria-modal="true" role="dialog" tabindex="-1"><div class="drawer-top"><img src="assets/logo-ju.webp" width="92" height="92" alt="Ju, imprime pra mim"><button type="button" class="drawer-close" aria-label="Fechar menu">×</button></div><nav class="drawer-links" aria-label="Navegação móvel">${primaryNav()}</nav>${drawerExtras()}</aside></div>`);
  const layer = document.querySelector('.mobile-drawer-layer'), drawer = layer.querySelector('.mobile-drawer');
  let opener = null, closingTimer = null, openingFrame = null;
  const headerToggles = () => [...document.querySelectorAll('.menu-toggle')];
  const close = ({restoreFocus = true} = {}) => {
    if (layer.hidden) return;
    cancelAnimationFrame(openingFrame);
    clearTimeout(closingTimer);
    layer.classList.remove('is-open');
    const finish = () => {
      layer.hidden = true;
      document.querySelector('.page')?.removeAttribute('inert');
      document.body.classList.remove('drawer-open');
      if (restoreFocus) opener?.focus({preventScroll:true});
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
    else closingTimer = setTimeout(finish, 260);
    headerToggles().forEach(button => button.setAttribute('aria-expanded', 'false'));
  };
  const open = button => {
    opener = button;
    document.querySelector('.page')?.setAttribute('inert', '');
    document.body.classList.add('drawer-open');
    layer.hidden = false;
    openingFrame = requestAnimationFrame(() => layer.classList.add('is-open'));
    headerToggles().forEach(toggle => toggle.setAttribute('aria-expanded', 'true'));
    drawer.focus({preventScroll:true});
  };
  headerToggles().forEach(button => button.addEventListener('click', () => layer.hidden ? open(button) : close()));
  layer.addEventListener('click', event => { if (event.target === layer) close(); });
  layer.querySelector('.drawer-close').addEventListener('click', () => close());
  drawer.querySelectorAll('a').forEach(link => link.addEventListener('click', () => close({restoreFocus:false})));
  drawer.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const focusables = [...drawer.querySelectorAll('a[href], button:not([disabled])')];
    const first = focusables[0], last = focusables.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === drawer)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !layer.hidden) close(); });
  matchMedia('(min-width: 801px)').addEventListener('change', event => {
    if (event.matches) close({restoreFocus:false});
  });
}

export function refreshHeader() {
  const quantity = readCart().reduce((sum, item) => sum + item.quantity, 0);
  document.querySelectorAll('[data-cart-count]').forEach(el => { el.textContent = quantity; el.hidden = !quantity; });
  document.querySelectorAll('[data-cart-link]').forEach(el => el.setAttribute('aria-label', `Carrinho, ${quantity} ${quantity === 1 ? 'item' : 'itens'}`));
}
for (const host of document.querySelectorAll('[data-shop-nav]')) {
  setupSiteHeader(host);
  host.innerHTML = `<a class="nav-products" href="produtos.html">Produtos</a><a class="header-icon" data-cart-link href="checkout.html" aria-label="Carrinho">${icon('cart')}<span class="cart-badge" data-cart-count hidden>0</span></a><div class="profile-nav"><button class="header-icon" type="button" aria-label="Meu perfil" aria-expanded="false" aria-controls="profile-menu">${icon('profile')}</button><div class="profile-menu" id="profile-menu" hidden><p class="profile-greeting"></p><a href="conta.html" data-account-link>Entrar ou cadastrar</a><a href="conta.html#pedidos">${icon('bag')} Meus pedidos</a><button type="button" data-signout hidden>${icon('exit')} Sair</button></div></div>`;
  const picker = mountLanguagePicker(host, host.querySelector('[data-cart-link]'));
  const menuToggle = host.closest('.site-header')?.querySelector('.menu-toggle');
  if (picker && menuToggle) {
    // Phones: beside the menu button, where there is room next to the centered logo. Desktop: beside the cart.
    const compact = matchMedia('(max-width: 800px)');
    const place = () => compact.matches ? menuToggle.after(picker) : host.insertBefore(picker, host.querySelector('[data-cart-link]'));
    compact.addEventListener('change', place);
    place();
  }
  const trigger = host.querySelector('.profile-nav > button'), menu = host.querySelector('.profile-menu');
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
// The session is an HttpOnly cookie; ask the server who is signed in so a new tab shows the right name in the menu.
refreshSession();
setupMobileDrawer();
// The rotating bar is for the shop pages; cart, checkout and account keep the buyer focused on finishing.
if (!document.body.matches('.commerce-page, .account-page')) mountAnnouncementBar();
setupScrollHeader(document.querySelector('.site-header'));
window.addEventListener('hashchange', () => {
  document.querySelectorAll('.primary-nav a, .drawer-links a').forEach(link => {
    const item = MAIN_NAVIGATION.find(item => item.href === link.getAttribute('href'));
    if (item?.active()) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
});
window.addEventListener('storage', e => { if (e.key === CART_KEY) refreshHeader(); });
window.addEventListener('pageshow', refreshHeader);
window.addEventListener('ju:cart', refreshHeader);
refreshHeader();
window.dispatchEvent(new Event('ju:header-ready'));

// "Voltar à vitrine" leans a few pixels toward the cursor (journey.css reads --mx/--my); mouse only, never with reduced motion.
if (matchMedia('(hover: hover) and (pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  for (const link of document.querySelectorAll('.showcase-return')) {
    link.addEventListener('pointermove', event => {
      const box = link.getBoundingClientRect();
      link.style.setProperty('--mx', `${(((event.clientX - box.left) / box.width - .5) * 8).toFixed(1)}px`);
      link.style.setProperty('--my', `${(((event.clientY - box.top) / box.height - .5) * 5).toFixed(1)}px`);
    });
    link.addEventListener('pointerleave', () => { link.style.removeProperty('--mx'); link.style.removeProperty('--my'); });
  }
}
