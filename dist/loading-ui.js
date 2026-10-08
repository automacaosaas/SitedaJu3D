// Shared loading states are tied to work, never to a fictitious percentage.
export const logoLoader = () => `<span class="ju-loader" aria-hidden="true"><img src="assets/logo-ju.webp" alt="" width="104" height="104"><span><img src="assets/logo-ju.webp" alt="" width="104" height="104"></span></span>`;

// How an image is doing after at most `limit` ms: 'loaded' (decoded, or at least loaded), 'error' (it failed) or 'slow' (still
// on its way when the time ran out: it may yet arrive, so it is not a failure). Once it answers, none of its listeners is left.
export function waitImage(img, limit = 12000) {
  return new Promise(resolve => {
    let settled = false, arrived = false;
    const finish = state => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      img.removeEventListener('load', loaded); img.removeEventListener('error', failed); document.removeEventListener('visibilitychange', drawn);
      resolve(state);
    };
    const drawn = () => finish(img.naturalWidth > 0 ? 'loaded' : 'error');
    const loaded = () => {
      arrived = true;
      if (!img.decode) { drawn(); return; }
      img.decode().then(() => finish('loaded'), drawn);
      // decode() waits for the page to draw, and a background tab draws nothing: without this, a page opened or left in
      // another tab hit the timeout and showed "Imagem indisponível" for good. A loaded image is enough there.
      if (document.hidden) drawn();
      else document.addEventListener('visibilitychange', drawn, {once:true});
    };
    const failed = () => finish('error');
    // at the limit, an image that has arrived and is still being decoded is ready, not late (it used to be hidden as unavailable)
    const timer = setTimeout(() => finish(img.naturalWidth > 0 && (arrived || img.complete) ? 'loaded' : 'slow'), limit);
    img.addEventListener('load', loaded, {once:true}); img.addEventListener('error', failed, {once:true});
    if (img.complete) img.naturalWidth ? loaded() : failed();
  });
}

// The same as a yes or no, for whoever only needs to know whether the image is there now (late counts as no).
export function imageReady(img, timeout = 12000) {
  return waitImage(img, timeout).then(state => state === 'loaded');
}

// Shows an image whenever it gets there: onReady once it is decoded, within `limit` or later (late is never reported as a
// failure: the image just shows up when it arrives), onFail only when it really fails. One call per image; a second call answers
// the same, with no new listeners. After the first answer the listeners stay on, because the browser may load the image again
// (another srcset file after turning the phone or zooming): onReady and onFail must be safe to run more than once.
const revealing = new WeakMap();
export function revealImage(img, {limit = 12000, onReady = () => {}, onFail = () => {}} = {}) {
  if (!revealing.has(img)) revealing.set(img, waitImage(img, limit).then(state => {
    if (state === 'loaded') onReady(img);
    else if (state === 'error') onFail(img);
    img.addEventListener('load', () => waitImage(img, limit).then(again => { if (again === 'loaded') onReady(img); }));
    img.addEventListener('error', () => { if (!img.naturalWidth) onFail(img); });
    return state;
  }));
  return revealing.get(img);
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
