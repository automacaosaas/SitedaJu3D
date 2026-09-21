const RETURN_KEY = 'ju:shopping-return';

export function localDestination(raw, base) {
  try {
    const url = new URL(raw, base), origin = new URL(base).origin;
    if (url.origin !== origin || !/\/(?:$|(?:index|produtos|sobre|contato|conta)\.html$)/.test(url.pathname)) return null;
    return url.pathname + url.search + url.hash;
  } catch { return null; }
}

export function rememberShoppingLocation() {
  const url = localDestination(location.href, location.href);
  if (!url) return;
  try { sessionStorage.setItem(RETURN_KEY, JSON.stringify({url, y:scrollY, time:Date.now()})); } catch {}
}

export function returnFromCart() {
  let saved;
  try { saved = JSON.parse(sessionStorage.getItem(RETURN_KEY)); } catch {}
  const referrer = localDestination(document.referrer, location.href);
  const safe = saved && Date.now() - saved.time < 86400000 && localDestination(saved.url, location.href);
  // An edit can insert another checkout in history. Restore the saved shopping
  // page explicitly so Back never returns to another copy of the cart.
  if (safe) {
    try { sessionStorage.setItem('ju:restore-shopping', JSON.stringify(saved)); } catch {}
  } else if (referrer && history.length > 1) {
    history.back(); return;
  }
  location.assign(safe || 'produtos.html');
}

let navigating = false;
export async function goToCart({replace = false, saved = false} = {}) {
  if (navigating) return;
  navigating = true;
  if (!replace) rememberShoppingLocation();
  window.dispatchEvent(new Event('ju:cart-feedback'));
  let notice = document.querySelector('.cart-transfer');
  if (!notice) {
    notice = document.createElement('div');
    notice.className = 'cart-transfer'; notice.setAttribute('role', 'status');
    notice.innerHTML = '<span aria-hidden="true">✓</span><p></p><i aria-hidden="true"></i>';
    document.body.append(notice);
  }
  notice.querySelector('p').textContent = saved ? 'Cores salvas. Voltando ao carrinho…' : 'Peça adicionada. Indo para o carrinho…';
  notice.hidden = false;
  notice.classList.add('is-visible');
  await new Promise(resolve => setTimeout(resolve, matchMedia('(prefers-reduced-motion: reduce)').matches ? 250 : 700));
  location[replace ? 'replace' : 'assign']('checkout.html');
}

if (typeof window !== 'undefined') {
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (link && /(?:^|\/)checkout\.html(?:[?#]|$)/.test(link.getAttribute('href'))) rememberShoppingLocation();
  }, {capture:true});
  window.addEventListener('pageshow', () => {
    navigating = false;
    const notice = document.querySelector('.cart-transfer');
    if (notice) {notice.hidden = true; notice.classList.remove('is-visible');}
    try {
      const saved = JSON.parse(sessionStorage.getItem('ju:restore-shopping'));
      if (saved && saved.url === localDestination(location.href, location.href)) {
        sessionStorage.removeItem('ju:restore-shopping');
        requestAnimationFrame(() => scrollTo({top:Math.max(0, Number(saved.y) || 0), behavior:'instant'}));
      }
    } catch {}
  });
}
