// Runs before styles: carry only validated theme colours across documents.
(() => {
  const root = document.documentElement, key = 'ju:theme';
  // Tema claro ou escuro (09/10/2026): a escolha da pessoa (o perfil: Automático, Claro ou Escuro, em localStorage 'ju.scheme') e, no
  // automático, o do aparelho. Vai para o <html> antes da primeira pintura (data-theme="light" | "dark": nada pisca), com a cor da
  // barra do navegador; o CSS só troca os tokens do tema (journey.css). Trocar no perfil vale na hora, nesta e nas outras abas.
  const SCHEME = 'ju.scheme', BAR = {light: '#fff7f5', dark: '#151214'};
  const system = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  const mode = () => { try { const value = localStorage.getItem(SCHEME); return value === 'light' || value === 'dark' ? value : 'auto'; } catch { return 'auto'; } };
  const paintScheme = () => {
    const chosen = mode(), scheme = chosen === 'auto' ? (system?.matches ? 'dark' : 'light') : chosen;
    root.dataset.theme = scheme;
    const bar = typeof document.querySelector === 'function' && document.querySelector('meta[name="theme-color"]');
    bar?.setAttribute?.('content', BAR[scheme]);
    return scheme;
  };
  const schemeChanged = () => { paintScheme(); window.dispatchEvent?.(new Event('ju:scheme')); };
  paintScheme();
  system?.addEventListener?.('change', () => { if (mode() === 'auto') schemeChanged(); });
  window.addEventListener?.('storage', event => { if (event.key === SCHEME) schemeChanged(); });
  // a barra do navegador: a meta vem depois deste script no <head>
  document.addEventListener?.('DOMContentLoaded', paintScheme, {once: true});
  window.juScheme = {
    mode,
    current: () => root.dataset.theme,
    set(next) { try { if (next === 'light' || next === 'dark') localStorage.setItem(SCHEME, next); else localStorage.removeItem(SCHEME); } catch {} schemeChanged(); return root.dataset.theme; }
  };
  // The colours of the piece the showcase opens on, exactly as it computes them: nothing changes colour (and transitions) at load.
  // <entry-data> written by tools/sync-entry.cjs from products.js — do not edit by hand
  const defaults = {'--theme-text':'#10281e', '--theme-muted':'#356650', '--theme-accent':'#25664c', '--theme-wash':'#e4f5ec', '--theme-soft':'#cfddd8', '--theme-accent-strong':'#1e523d'};
  // </entry-data>
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
  // English or Spanish chosen before: the dictionary (i18n.js loads it only for them) starts downloading now, with the page.
  try { if (/^(en|es)$/.test(localStorage.getItem('ju.language') || '')) for (const href of ['i18n-core.js', 'translations.js']) { const link = document.createElement('link'); link.rel = 'modulepreload'; link.href = href; document.head.append(link); } } catch {}
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
    // uma página da loja: / ou /nome, com ou sem ".html" (endereços limpos desde 09/10/2026)
    if (url.origin !== location.origin || !/^\/(?:[a-z0-9-]+(?:\.html)?)?$/.test(url.pathname) || (url.pathname === location.pathname && url.search === location.search)) return;
    if (embedded && !/\/conta(?:\.html)?$/.test(url.pathname)) {
      event.preventDefault(); parent.postMessage({type:'ju:account-navigate', url:url.href}, location.origin); return;
    }
    if (/\/conta(?:\.html)?$/.test(url.pathname) && matchMedia('(min-width: 901px)').matches && !embedded && window.openJuAccount) {
      event.preventDefault(); window.openJuAccount(url); return;
    }
    // The destination reveals once its header is ready.
  });
})();
