// Vitrine de novidade das lâmpadas de fenda (fenda.html; marcação em fenda-stage.js). Põe o palco para andar: setas, lista, teclado e
// arrastar no celular; a cada peça, o fundo, as cores, o selo "Novidade" e o tema do site (journey.js leva para as páginas seguintes,
// como na vitrine da home). "Ver mais" leva a peça para a esquerda e abre o preço, as cores, a descrição e o "Monte seu kit"
// (kit-builder.js, o mesmo da página da peça), que põe as peças no carrinho e abre o mini-carrinho. fenda#<peça> abre naquela peça.
// Sem este arquivo a página continua útil: a primeira peça, o preço e "Ver mais" como o link da página dela.
import {PRODUCTS, showcase, badgeStyle} from './products.js';
import {journeyColors} from './hero-motion.js';
import {CONTACT} from './company.js';
import {translate} from './i18n.js';
import {mountKit} from './kit-builder.js';
import {readCart, writeCart, putItems, totals} from './cart-store.js';
import {openMiniCart, addedItemId} from './mini-cart.js';
import {wireBadge, shineBadge} from './badge-shine.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');

// ── WhatsApp: "Enviar a um colega" (o endereço desta página, na língua escolhida) e "Falar com a Ju" (com o número da loja) ──
const here = () => { const url = new URL(location.href); url.search = ''; return url.href; };
for (const share of document.querySelectorAll('[data-nv-share]')) {
  const update = () => { share.href = `https://wa.me/?text=${encodeURIComponent(`${translate('Olha que fofura: capas impressas em 3D para a lâmpada de fenda portátil, da Ju, imprime pra mim? Conheça:')} ${here()}`)}`; };
  update(); share.addEventListener('click', update);   // the language or the piece may have changed since
}
const number = /^\d{12,13}$/.test(CONTACT.whatsapp) ? CONTACT.whatsapp : '';
const ju = document.querySelector('[data-nv-ju]');
if (number && ju) {
  const update = () => { ju.href = `https://wa.me/${number}?text=${encodeURIComponent(translate('Olá, Ju! Vi as novidades para a lâmpada de fenda e tenho uma dúvida.'))}`; };
  update(); ju.addEventListener('click', update);
  ju.target = '_blank'; ju.rel = 'noopener';
}

// ── o palco ──
const stage = document.querySelector('[data-nv]');
if (stage) setup(stage);

function setup(stage) {
  const q = selector => stage.querySelector(selector), qa = selector => [...stage.querySelectorAll(selector)];
  const items = qa('[data-nv-item]'), keys = items.map(item => item.dataset.nvKey), total = items.length;
  const captions = qa('[data-nv-caption]'), tops = qa('[data-nv-top]'), layers = qa('[data-nv-layer]'), list = qa('.nv-list [data-nv-go]');
  const detail = q('[data-nv-detail]'), back = q('[data-nv-back]'), status = q('[data-nv-status]'), badge = q('[data-nv-badge]'), kitHost = q('[data-nv-kit]');
  const fromHash = () => keys.indexOf(decodeURIComponent(location.hash.slice(1)));
  let active = Math.max(0, fromHash() >= 0 ? fromHash() : keys.indexOf(window.juTheme?.product())), open = false;
  const offset = i => { let d = i - active; if (d > total / 2) d -= total; if (d < -total / 2) d += total; return d; };

  function paint() {
    const key = keys[active], {theme} = showcase(key);
    items.forEach((item, i) => {
      const d = offset(i);
      item.style.setProperty('--slot', d); item.style.setProperty('--k', Math.min(1, Math.abs(d)));
      item.toggleAttribute('data-side', d !== 0); item.toggleAttribute('data-far', Math.abs(d) > 1);
      item.setAttribute('aria-hidden', String(d !== 0));
    });
    captions.forEach((caption, i) => { caption.hidden = i !== active; });
    tops.forEach((top, i) => { top.hidden = i !== active; });
    layers.forEach((layer, i) => layer.classList.toggle('is-on', i === active));
    list.forEach((button, i) => { if (i === active) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current'); });
    stage.style.setProperty('--nv-accent', theme.accentColor); stage.style.setProperty('--nv-ink', theme.textColor); stage.style.setProperty('--nv-muted', theme.mutedColor);
    if (badge) { badge.setAttribute('style', badgeStyle(key)); badge.dataset.effect = PRODUCTS[key].eyebrowEffect || 'shine'; }
    window.juTheme?.save(key, journeyColors(theme));
  }
  function go(i, {announce = true} = {}) {
    if (open) close(false);
    const next = (i + total) % total;
    if (next === active && announce) return;
    active = next; paint(); shineBadge(badge);
    if (announce) {
      status.textContent = `${translate(PRODUCTS[keys[active]].title)} (${active + 1}/${total})`;
      history.replaceState(null, '', `#${keys[active]}`);
    }
  }

  // "Monte seu kit" com a peça do centro: as peças entram juntas no carrinho e o mini-carrinho confirma cada uma
  function mountKitFor(key) {
    if (!kitHost) return;
    mountKit(kitHost, {current: key, onAdd: async lines => {
      const before = totals(readCart(), 0).subtotal, cart = writeCart(putItems(readCart(), lines));
      window.dispatchEvent(new Event('ju:cart'));
      openMiniCart({itemIds: lines.map(line => addedItemId(cart, line.productId, {})).filter(Boolean), original: true, riseFrom: before});
    }});
  }
  // com os detalhes abertos no computador, o palco cresce até caber tudo (o kit inteiro, sem rolagem por dentro)
  const fit = () => { stage.style.minHeight = open && !matchMedia('(max-width: 900px)').matches ? `${detail.offsetTop + detail.offsetHeight + 26}px` : ''; };
  function more() {
    open = true; mountKitFor(keys[active]);
    detail.hidden = false; back.hidden = false; stage.classList.add('is-detail'); fit();
    captions[active].querySelector('[data-nv-more]').setAttribute('aria-expanded', 'true');
    back.focus({preventScroll: true});
    if (matchMedia('(max-width: 900px)').matches) detail.scrollIntoView({behavior: reduced.matches ? 'auto' : 'smooth', block: 'start'});
  }
  function close(focus = true) {
    if (!open) return;
    open = false; detail.hidden = true; back.hidden = true; stage.classList.remove('is-detail'); fit();
    const button = captions[active].querySelector('[data-nv-more]'); button.setAttribute('aria-expanded', 'false');
    if (focus) button.focus({preventScroll: true});
  }

  stage.addEventListener('click', event => {
    const target = event.target.closest('[data-nv-go], [data-nv-step], [data-nv-more], [data-nv-back]');
    if (!target) return;
    if (target.matches('[data-nv-more]')) { event.preventDefault(); more(); }
    else if (target.matches('[data-nv-back]')) close();
    else if (target.matches('[data-nv-step]')) go(active + Number(target.dataset.nvStep));
    else go(Number(target.dataset.nvGo));
  });
  stage.addEventListener('keydown', event => {
    if (event.key === 'Escape' && open) { close(); return; }
    if (open || event.target.closest('input, textarea, select, .kit')) return;
    if (event.key === 'ArrowRight') { go(active + 1); event.preventDefault(); }
    if (event.key === 'ArrowLeft') { go(active - 1); event.preventDefault(); }
  });
  // arrastar de lado no celular (fora dos detalhes)
  let startX = null, startY = 0;
  stage.addEventListener('pointerdown', event => { if (event.pointerType !== 'mouse' && !open && !event.target.closest('.nv-detail')) { startX = event.clientX; startY = event.clientY; } });
  stage.addEventListener('pointerup', event => {
    if (startX === null) return;
    const dx = event.clientX - startX, dy = event.clientY - startY; startX = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(active + (dx < 0 ? 1 : -1));
  });
  stage.addEventListener('pointercancel', () => { startX = null; });
  addEventListener('hashchange', () => { const i = fromHash(); if (i >= 0 && i !== active) go(i, {announce: false}); });

  // As silhuetas do fundo (carousel.css › .scenery-back) se medem pelo palco: a altura dele, o alto da figura e a largura dela.
  const measure = () => {
    const box = stage.getBoundingClientRect(), track = q('.nv-track').getBoundingClientRect(), figure = items[active].getBoundingClientRect();
    stage.style.setProperty('--hero-h', `${Math.round(box.height)}px`);
    stage.style.setProperty('--stage-top', `${Math.round(track.top - box.top)}px`);
    stage.style.setProperty('--scn-ped', `${Math.round(figure.width / (1 - Math.min(1, Math.abs(offset(active))) * .4) || 300)}px`);
  };
  new ResizeObserver(() => { measure(); fit(); }).observe(stage);
  new ResizeObserver(fit).observe(detail);

  paint(); measure();
  wireBadge(badge, {onVisible: true});
}
