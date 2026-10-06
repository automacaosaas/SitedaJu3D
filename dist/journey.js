// Runs before styles: carry only validated theme colours across documents.
(() => {
  const root = document.documentElement, key = 'ju:theme';
  const defaults = {'--theme-text':'#10281e','--theme-muted':'#356650','--theme-accent':'#25664c','--theme-wash':'#e5f5ec','--theme-soft':'#cfe1d8','--theme-accent-strong':'#1e523d'};
  const apply = values => {
    for (const name of Object.keys(defaults)) {
      const value = values?.[name];
      root.style.setProperty(name, /^#[0-9a-f]{6}$/i.test(value || '') ? value : defaults[name]);
    }
  };
  try { apply(JSON.parse(sessionStorage.getItem(key))?.colors); } catch { apply(defaults); }
  window.juTheme = {
    save(product, colors) {
      apply(colors);
      try { sessionStorage.setItem(key, JSON.stringify({product, colors})); } catch {}
    },
    product() { try { return JSON.parse(sessionStorage.getItem(key))?.product || ''; } catch { return ''; } }
  };
  // A product page (tools/build-product-pages.cjs) wears its piece's colors from the first frame and carries them on, so the
  // home's showcase opens on this piece. A page restored by Back/Forward claims its piece again.
  const claim = () => { if (root.dataset.themeProduct) try { window.juTheme.save(root.dataset.themeProduct, JSON.parse(root.dataset.themeColors)); } catch {} };
  claim();
  const embedded = window.parent !== window && new URLSearchParams(location.search).get('panel') === '1';
  if (embedded) root.classList.add('account-embedded');
  if (embedded) window.addEventListener('message', event => {
    if (event.origin === location.origin && event.source === parent && event.data?.type === 'ju:account-theme') apply(event.data.colors);
  });
  root.classList.add('journey-pending');
  let done = false;
  const reveal = () => {
    if (done) return;
    done = true;
    root.classList.remove('journey-pending'); root.classList.add('journey-ready');
    if (embedded) parent.postMessage({type:'ju:account-ready'}, location.origin);
  };
  let revealing = false;
  const revealWhenReady = async () => {
    if (done || revealing) return;
    const nav = document.querySelector('.header [data-shop-nav]');
    if (nav && !nav.closest('[data-site-header-ready]')) return;
    revealing = true;
    // The shell is complete. Decode only its small logo; artwork can finish
    // loading while the page is already visible.
    const logo = document.querySelector('.brand img');
    const imageReady = logo?.decode ? logo.decode().catch(() => {}) : Promise.resolve();
    await Promise.race([imageReady, new Promise(resolve => setTimeout(resolve, 120))]);
    requestAnimationFrame(() => { clearTimeout(deadline); reveal(); });
  };
  // Leave the loading state even if a module fails. The fallback exposes the
  // accessible HTML header, kept in its final logo position by CSS.
  const deadline = setTimeout(reveal, 2000);
  window.addEventListener('ju:header-ready', revealWhenReady, {once:true});
  document.addEventListener('DOMContentLoaded', revealWhenReady, {once:true});
  window.addEventListener('pageshow', event => { root.classList.remove('journey-leaving'); if (event.persisted) claim(); });
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.download || (link.target && link.target !== '_self')) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !url.pathname.endsWith('.html') || (url.pathname === location.pathname && url.search === location.search)) return;
    if (embedded && !url.pathname.endsWith('/conta.html')) {
      event.preventDefault(); parent.postMessage({type:'ju:account-navigate', url:url.href}, location.origin); return;
    }
    if (url.pathname.endsWith('/conta.html') && matchMedia('(min-width: 901px)').matches && !embedded && window.openJuAccount) {
      event.preventDefault(); window.openJuAccount(url); return;
    }
    // The destination reveals once its header is ready.
  });
})();
