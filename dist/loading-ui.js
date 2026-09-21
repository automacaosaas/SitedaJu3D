// Shared loading states are tied to work, never to a fictitious percentage.
export const logoLoader = () => `<span class="ju-loader" aria-hidden="true"><img src="assets/logo-ju.webp" alt="" width="104" height="104"><span><img src="assets/logo-ju.webp" alt="" width="104" height="104"></span></span>`;

export function imageReady(img, timeout = 12000) {
  return new Promise(resolve => {
    let settled = false;
    const finish = ok => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      img.removeEventListener('load', loaded); img.removeEventListener('error', failed);
      resolve(ok);
    };
    const loaded = () => {
      if (img.decode) img.decode().then(() => finish(true), () => finish(img.naturalWidth > 0));
      else finish(img.naturalWidth > 0);
    };
    const failed = () => finish(false);
    const timer = setTimeout(failed, timeout);
    img.addEventListener('load', loaded, {once:true}); img.addEventListener('error', failed, {once:true});
    if (img.complete) img.naturalWidth ? loaded() : failed();
  });
}

export function createBusyDialog() {
  const dialog = document.createElement('dialog');
  dialog.className = 'ju-busy-dialog';
  dialog.setAttribute('aria-labelledby', 'ju-busy-title');
  dialog.innerHTML = `${logoLoader()}<span class="ju-success" hidden aria-hidden="true"><svg viewBox="0 0 40 40"><path d="m10 20 7 7 14-15"/></svg></span><h2 id="ju-busy-title" tabindex="-1"></h2><p class="ju-busy-caption" role="status" aria-live="polite"></p>`;
  document.body.append(dialog);
  let timer, opener;
  const title = dialog.querySelector('h2'), caption = dialog.querySelector('p');
  dialog.addEventListener('cancel', event => event.preventDefault());
  return {
    start(message) {
      opener = document.activeElement;
      title.textContent = 'Um instante de cuidado.'; caption.textContent = message;
      dialog.querySelector('.ju-loader').hidden = false; dialog.querySelector('.ju-success').hidden = true;
      clearTimeout(timer);
      timer = setTimeout(() => {if (!dialog.open) dialog.showModal(); title.focus();}, 150);
    },
    update(message) { caption.textContent = message; },
    async success(message) {
      clearTimeout(timer);
      dialog.querySelector('.ju-loader').hidden = true; dialog.querySelector('.ju-success').hidden = false;
      title.textContent = message; caption.textContent = 'Tudo pronto para continuar.';
      if (!dialog.open) dialog.showModal(); title.focus();
      await new Promise(resolve => setTimeout(resolve, matchMedia('(prefers-reduced-motion: reduce)').matches ? 350 : 850));
    },
    close() { clearTimeout(timer); if (dialog.open) dialog.close(); if (opener?.isConnected) opener.focus({preventScroll:true}); }
  };
}
