let drawer, frame, opener, closing = false, previousOverflow;
const wide = matchMedia('(min-width: 901px)');
function close() {
  if (!drawer?.open || closing) return;
  closing = true;
  drawer.classList.add('is-closing');
  const finish = () => {
    drawer.close(); drawer.classList.remove('is-closing'); closing = false;
    document.body.style.overflow = previousOverflow;
    opener?.isConnected && opener.focus({preventScroll:true});
  };
  setTimeout(finish, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
}
window.openJuAccount = raw => {
  const url = new URL(raw, location.href);
  if (!wide.matches) { location.assign(url); return; }
  if (!drawer) {
    drawer = document.createElement('dialog'); drawer.className = 'ju-account-drawer'; drawer.setAttribute('aria-label', 'Seu cantinho');
    drawer.innerHTML = '<div class="ju-account-placeholder" role="status"><img src="assets/logo-ju.webp" alt="" width="90" height="90"><p>Preparando seu acesso…</p><a href="conta.html" target="_self" data-account-fallback>Abrir página de acesso</a></div><button class="ju-account-close" aria-label="Fechar acesso" type="button">×</button><iframe title="Entrar ou cadastrar" referrerpolicy="same-origin"></iframe>';
    document.body.append(drawer); frame = drawer.querySelector('iframe');
    drawer.querySelector('button').addEventListener('click', close);
    drawer.querySelector('[data-account-fallback]').addEventListener('click', event => {event.preventDefault();location.assign('conta.html');});
    drawer.addEventListener('cancel', event => {event.preventDefault();close();});
    drawer.addEventListener('click', event => {if (event.target === drawer && event.clientX < drawer.getBoundingClientRect().left) close();});
    window.addEventListener('message', event => {
      if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
      if (event.data?.type === 'ju:account-ready') drawer.classList.add('is-ready');
      if (event.data?.type === 'ju:account-close') close();
      if (event.data?.type === 'ju:account-navigate') {
        const next = new URL(event.data.url, location.href);
        if (next.origin === location.origin && /\/(index|produtos|checkout)\.html$/.test(next.pathname)) location.assign(next);
      }
    });
  }
  if (drawer.open) return;
  document.querySelectorAll('.profile-menu').forEach(menu => {menu.hidden = true; menu.parentElement.querySelector('button')?.setAttribute('aria-expanded','false');});
  opener = document.activeElement?.closest('.profile-menu')?.parentElement.querySelector('button') || document.activeElement;
  previousOverflow = document.body.style.overflow;
  url.searchParams.set('panel','1');
  if (frame.src !== url.href) { drawer.classList.remove('is-ready'); frame.src = url.href; }
  else {
    const style = getComputedStyle(document.documentElement), colors = {};
    for (const name of ['--theme-text','--theme-muted','--theme-accent','--theme-wash','--theme-soft','--theme-accent-strong']) colors[name] = style.getPropertyValue(name).trim();
    frame.contentWindow.postMessage({type:'ju:account-theme', colors}, location.origin);
  }
  drawer.showModal(); document.body.style.overflow = 'hidden'; drawer.querySelector('button').focus();
};
wide.addEventListener('change', () => {if (!wide.matches && drawer?.open) close();});
