// Vitrine de novidade das lâmpadas de fenda (fenda.html; marcação em fenda-stage.js). Põe a página para andar:
//  · o palco: setas, lista, teclado e arrastar no celular; a cada peça, o fundo, as cores, o selo "Novidade" e o tema do site (journey.js
//    leva para as páginas seguintes, como na vitrine da home); fenda#<peça> abre naquela peça. "Ver detalhes" leva a peça para a esquerda
//    e abre o preço, as cores e a descrição;
//  · a compra: "Comprar" leva a peça direto para a compra (comprar-agora.html, como o "Comprar agora" da janela da peça) e "Adicionar ao
//    carrinho" é o do site (catalog.js › data-add-product, que abre o mini-carrinho);
//  · as ofertas, que entram ao rolar: escolher um cartão monta o kit com aquele tanto de peças (kit-builder.js), que vai para o carrinho
//    ou direto para a compra: "Comprar agora" e, ao lado, o botão menor do carrinho, na mesma linha, logo abaixo do total (escolher um
//    cartão desce até o kit inteiro à vista). O kit chega com a faixa mais vantajosa e o cartão dela marcado; no celular, os cartões
//    são uma fileira com setas e pontos;
//  · o "Voltar" do alto, que volta para onde a pessoa estava (o banner da home, rolado até ele) ou, sem página anterior do site, abre
//    a home no banner (index.html#novidade);
//  · o convite discreto para um colega no WhatsApp, com o endereço desta página.
// Sem este arquivo a página continua útil: a primeira peça, o preço, "Adicionar ao carrinho" e "Ver detalhes" como o link da peça.
import {PRODUCTS, showcase, badgeStyle} from './products.js';
import {journeyColors} from './hero-motion.js';
import {translate} from './i18n.js';
import {mountKit, kitPreset} from './kit-builder.js';
import {readCart, writeCart, putItem, putItems, totals, DIRECT_KEY} from './cart-store.js';
import {openMiniCart, addedItemId} from './mini-cart.js';
import {wireBadge, shineBadge} from './badge-shine.js';
import {localDestination} from './shopping-navigation.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const smooth = () => (reduced.matches ? 'auto' : 'smooth');

// ── direto para a compra (a peça ou o kit), como o "Comprar agora" da janela da peça ──
function buyNow(lines, status) {
  try { sessionStorage.setItem(DIRECT_KEY, JSON.stringify(lines)); location.assign('comprar-agora.html'); }
  catch { if (status) status.textContent = translate('Não foi possível preparar a compra. Verifique o armazenamento do navegador.'); }
}

// ── "Voltar": a página de onde a pessoa veio, na mesma altura; sem ela, o link (a home no banner da novidade) ──
// Vindo da faixa da home, a altura que ela guardou (catalog.js) volta pelo mesmo caminho da volta do carrinho
// (shopping-navigation.js › pageshow): o navegador sozinho às vezes restaura antes de a home terminar de montar e para mais acima.
for (const back of document.querySelectorAll('[data-nv-return]')) back.addEventListener('click', event => {
  const from = localDestination(document.referrer, location.href);
  if (!from || history.length < 2) return;
  event.preventDefault();
  try {
    const saved = JSON.parse(sessionStorage.getItem('ju:nvb-return'));
    if (saved?.url === from && Date.now() - saved.time < 86400000) sessionStorage.setItem('ju:restore-shopping', JSON.stringify({url: from, y: saved.y, time: Date.now()}));
  } catch {}
  history.back();
});

// ── convite para um colega no WhatsApp (o endereço desta página, na língua escolhida) ──
const here = () => { const url = new URL(location.href); url.search = ''; return url.href; };
for (const share of document.querySelectorAll('[data-nv-share]')) {
  const update = () => { share.href = `https://wa.me/?text=${encodeURIComponent(`${translate('Olha que fofura: capas impressas em 3D para a lâmpada de fenda portátil, da Ju, imprime pra mim? Conheça:')} ${here()}`)}`; };
  update(); share.addEventListener('click', update);   // the language or the piece may have changed since
}

// ── as ofertas: os cartões das faixas e o "Monte seu kit" ──
const kitHost = document.querySelector('[data-nv-kit]'), kitBuy = document.querySelector('[data-nv-kit-buy]');
const tierButtons = [...document.querySelectorAll('[data-nv-tier]')];
// o kit chega com a faixa mais vantajosa (o último cartão, "Mais vantajoso"), como o banner da home a mostra
let units = Number(document.querySelector('.nv-tier.is-best [data-nv-tier]')?.dataset.nvTier) || 1;
let kit = null, kitTouched = false, kitLinesNow = [];
// o cartão do kit de agora fica marcado ("No seu kit")
const markTier = count => tierButtons.forEach(button => {
  const on = Number(button.dataset.nvTier) === count;
  button.setAttribute('aria-pressed', String(on)); button.closest('.nv-tier')?.classList.toggle('is-picked', on);
});
function mountOffers(key) {
  if (!kitHost) return;
  kit = mountKit(kitHost, {
    current: key,
    onChange: quote => { kitLinesNow = quote.lines; markTier(quote.units); if (kitBuy) kitBuy.setAttribute('aria-disabled', String(!quote.lines.length)); },
    onAdd: async lines => {
      const before = totals(readCart(), 0).subtotal, cart = writeCart(putItems(readCart(), lines));
      window.dispatchEvent(new Event('ju:cart'));
      openMiniCart({itemIds: lines.map(line => addedItemId(cart, line.productId, {})).filter(Boolean), original: true, riseFrom: before});
    }
  });
  if (kit) {
    document.querySelector('[data-nv-kit-fallback]')?.setAttribute('hidden', '');
    // "Comprar agora" e o carrinho na mesma linha, no lugar do "Adicionar ao carrinho" do kit (que vira o botão menor, só com o
    // ícone; o nome dele continua para quem usa leitor de tela)
    const add = kitHost.querySelector('.kit-add');
    if (kitBuy && add) {
      const actions = document.createElement('div'); actions.className = 'nv-kit-actions';
      add.before(actions); actions.append(kitBuy, add); kitBuy.hidden = false;
    }
    kitHost.addEventListener('click', () => { kitTouched = true; });
    kit.set(kitPreset(key, units));
  }
}
kitBuy?.addEventListener('click', () => {
  if (!kitLinesNow.length) return;
  buyNow(putItems([], kitLinesNow.map(({productId, selection, quantity}) => ({productId, selection, quantity}))));
});
// escolher um cartão: o kit com aquele tanto de peças, começando pela peça do palco, e a página desce até ele
let stageKey = () => document.querySelector('[data-nv-key]')?.dataset.nvKey;
for (const button of tierButtons) button.addEventListener('click', () => {
  const key = stageKey(); units = Number(button.dataset.nvTier);
  if (!kit) return void (location.href = `${key}.html`);
  kit.set(kitPreset(key, units)); kitTouched = true;
  // o kit inteiro à vista, com "Comprar agora": no meio da tela se couber, senão com a compra no pé dela
  const panel = document.getElementById('nv-kit');
  if (panel) panel.scrollIntoView({behavior: smooth(), block: panel.offsetHeight <= innerHeight - 120 ? 'center' : 'end'});
});
// no celular os cartões são uma fileira que corre de lado: as setas andam um cartão e os pontos dizem em qual se está
const row = document.querySelector('[data-nv-tiers]');
if (row) {
  const steps = [...document.querySelectorAll('[data-nv-tiers-step]')], dots = [...document.querySelectorAll('.nv-tiers-dots i')];
  const pitch = () => { const [a, b] = row.children; return b ? b.offsetLeft - a.offsetLeft : row.clientWidth; };
  const sync = () => {
    const max = row.scrollWidth - row.clientWidth, scrolls = max > 4, at = Math.round(row.scrollLeft / pitch());
    row.parentElement.toggleAttribute('data-scrolls', scrolls);
    for (const step of steps) { step.hidden = !scrolls; step.disabled = Number(step.dataset.nvTiersStep) < 0 ? row.scrollLeft < 4 : row.scrollLeft > max - 4; }
    dots.forEach((dot, i) => dot.classList.toggle('is-on', i === Math.min(dots.length - 1, at)));
  };
  for (const step of steps) step.addEventListener('click', () => row.scrollBy({left: Number(step.dataset.nvTiersStep) * pitch(), behavior: smooth()}));
  row.addEventListener('scroll', () => requestAnimationFrame(sync), {passive: true});
  new ResizeObserver(sync).observe(row);
}
// os cartões e o kit entram ao rolar (sem IntersectionObserver ou com movimento reduzido, já estão à vista)
const reveals = [...document.querySelectorAll('[data-nv-reveal]')];
if ('IntersectionObserver' in window && !reduced.matches && reveals.length) {
  const seen = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('is-in'); entry.target.classList.remove('is-pending'); seen.unobserve(entry.target);
  }), {rootMargin: '0px 0px -12% 0px', threshold: .12});
  for (const el of reveals) if (el.getBoundingClientRect().top > innerHeight) { el.classList.add('is-pending'); seen.observe(el); }
}

// ── o palco ──
const stage = document.querySelector('[data-nv]');
if (stage) setup(stage); else mountOffers(stageKey());

function setup(stage) {
  const q = selector => stage.querySelector(selector), qa = selector => [...stage.querySelectorAll(selector)];
  const items = qa('[data-nv-item]'), keys = items.map(item => item.dataset.nvKey), total = items.length;
  const captions = qa('[data-nv-caption]'), tops = qa('[data-nv-top]'), layers = qa('[data-nv-layer]'), list = qa('.nv-list [data-nv-go]');
  const detail = q('[data-nv-detail]'), back = q('[data-nv-back]'), status = q('[data-nv-status]'), badge = q('[data-nv-badge]');
  const fromHash = () => keys.indexOf(decodeURIComponent(location.hash.slice(1)));
  let active = Math.max(0, fromHash() >= 0 ? fromHash() : keys.indexOf(window.juTheme?.product())), open = false;
  stageKey = () => keys[active];
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
    // o kit acompanha a peça do palco (é a primeira dele) enquanto a pessoa não mexeu nele
    if (kit && !kitTouched) kit.set(kitPreset(key, units));
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

  // com os detalhes abertos no computador, o palco cresce até caber tudo
  const fit = () => { stage.style.minHeight = open && !matchMedia('(max-width: 900px)').matches ? `${detail.offsetTop + detail.offsetHeight + 28}px` : ''; };
  function more() {
    open = true; detail.hidden = false; back.hidden = false; stage.classList.add('is-detail'); fit();
    captions[active].querySelector('[data-nv-more]').setAttribute('aria-expanded', 'true');
    back.focus({preventScroll: true});
    if (matchMedia('(max-width: 900px)').matches) detail.scrollIntoView({behavior: smooth(), block: 'start'});
  }
  function close(focus = true) {
    if (!open) return;
    open = false; detail.hidden = true; back.hidden = true; stage.classList.remove('is-detail'); fit();
    const button = captions[active].querySelector('[data-nv-more]'); button.setAttribute('aria-expanded', 'false');
    if (focus) button.focus({preventScroll: true});
  }

  stage.addEventListener('click', event => {
    const buy = event.target.closest('[data-nv-buy]');
    if (buy) { buy.disabled = true; buyNow(putItem([], buy.dataset.nvBuy, {}), status); setTimeout(() => { buy.disabled = false; }, 1500); return; }
    const target = event.target.closest('[data-nv-go], [data-nv-step], [data-nv-more], [data-nv-back]');
    if (!target) return;
    if (target.matches('[data-nv-more]')) { event.preventDefault(); more(); }
    else if (target.matches('[data-nv-back]')) close();
    else if (target.matches('[data-nv-step]')) go(active + Number(target.dataset.nvStep));
    else go(Number(target.dataset.nvGo));
  });
  stage.addEventListener('keydown', event => {
    if (event.key === 'Escape' && open) { close(); return; }
    if (open || event.target.closest('input, textarea, select')) return;
    if (event.key === 'ArrowRight') { go(active + 1); event.preventDefault(); }
    if (event.key === 'ArrowLeft') { go(active - 1); event.preventDefault(); }
  });
  // arrastar de lado no celular (fora dos detalhes)
  let startX = null, startY = 0;
  stage.addEventListener('pointerdown', event => { if (event.pointerType !== 'mouse' && !open && !event.target.closest('.nv-detail, .nv-cta')) { startX = event.clientX; startY = event.clientY; } });
  stage.addEventListener('pointerup', event => {
    if (startX === null) return;
    const dx = event.clientX - startX, dy = event.clientY - startY; startX = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(active + (dx < 0 ? 1 : -1));
  });
  stage.addEventListener('pointercancel', () => { startX = null; });
  addEventListener('hashchange', () => { const i = fromHash(); if (i >= 0 && i !== active) go(i, {announce: false}); });
  // "Leve 2 por… ou 3 por…" nos detalhes: desce até as ofertas
  for (const link of qa('[data-nv-offers]')) link.addEventListener('click', event => { event.preventDefault(); close(false); document.getElementById('ofertas')?.scrollIntoView({behavior: smooth(), block: 'start'}); });

  // As silhuetas do fundo (carousel.css › .scenery-back) se medem pelo palco: a altura dele, o alto da figura e a largura dela.
  const measure = () => {
    const box = stage.getBoundingClientRect(), track = q('.nv-track').getBoundingClientRect(), figure = items[active].getBoundingClientRect();
    stage.style.setProperty('--hero-h', `${Math.round(box.height)}px`);
    stage.style.setProperty('--stage-top', `${Math.round(track.top - box.top)}px`);
    stage.style.setProperty('--scn-ped', `${Math.round(figure.width * 1.4) || 300}px`);
  };
  new ResizeObserver(() => { measure(); fit(); }).observe(stage);
  new ResizeObserver(fit).observe(detail);

  mountOffers(keys[active]);
  paint(); measure();
  wireBadge(badge, {onVisible: true});
  // vindo do banner da home (fenda.html#ofertas): as ofertas no alto, depois que o palco ganhou a altura dele
  if (location.hash === '#ofertas') requestAnimationFrame(() => document.getElementById('ofertas')?.scrollIntoView({block: 'start'}));
}
