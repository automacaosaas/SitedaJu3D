import {PRODUCTS, PALETTE, defaults, color, validSelection} from './products.js';
import {readCart, writeCart, putItem} from './cart-store.js';
import {openMiniCart, addedItemId} from './mini-cart.js';
import {icon} from './icons.js';

// Página de cada peça (borboletoscopio.html…, tools/build-product-pages.cjs). A foto dá lugar ao modelo 3D que gira (o
// mesmo do configurador, viewer.js); "Personalizar o meu" abre a escolha das cores aqui mesmo, e cada cor pinta o modelo
// na hora; o botão de compra leva as cores escolhidas e confirma com um check animado antes de abrir o mini-carrinho.
// Sem este arquivo a página continua inteira: a foto, o configurador da vitrine e o botão do mini-carrinho (catalog.js).
const root = document.querySelector('[data-pl]'), key = root?.dataset.pl;
if (root && PRODUCTS[key]) setup(root, key);

function setup(root, key) {
  const product = PRODUCTS[key], original = defaults(key), q = selector => root.querySelector(selector);
  const stage = q('[data-pl-stage]'), host = q('[data-pl-viewer]'), status = q('[data-pl-status]'), views = q('[data-pl-views]');
  const add = q('.pl-add'), customize = q('[data-pl-customize]'), panel = q('[data-pl-custom]'), title = q('[data-pl-colors-title]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)'), phone = matchMedia('(max-width: 860px)');
  let selection = {...original}, part = product.parts[0].id, view = 'photo', viewer = null, viewerImport = null, request = 0;
  let spinning = !reduced.matches, onScreen = true, busy = false;
  const isOriginal = () => product.parts.every(p => selection[p.id] === original[p.id]);
  const hex = () => Object.fromEntries(Object.entries(selection).map(([id, value]) => [id, color(value).hex]));

  // O botão do mini-carrinho do catalog.js só conhece as cores originais: daqui em diante esta página adiciona as escolhidas.
  add.removeAttribute('data-add-product');
  add.insertAdjacentHTML('beforeend', '<svg class="pl-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.4 4.4L19 7.2"/></svg>');
  views.hidden = false;
  stage.insertAdjacentHTML('beforeend', `<span class="pl-drag" aria-hidden="true">${icon('returns')}<span>Arraste para girar</span></span>`);

  // ── a peça: foto ou 3D ──
  async function setView(next) {
    view = next; const id = ++request;
    views.querySelectorAll('[data-pl-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.plView === next)));
    stage.dataset.view = next;
    if (next === 'photo') { viewer?.hide(); host.hidden = true; status.hidden = true; return; }
    host.hidden = false;
    if (!viewer?.active) { status.hidden = false; status.textContent = 'Preparando sua prévia 3D…'; }
    try {
      viewerImport ??= import('./viewer.js');
      const {ProductViewer} = await viewerImport;
      if (id !== request) return;
      if (!viewer) { viewer = new ProductViewer(host, fail); tune(viewer); }
      const shown = await viewer.show(key, hex(), product.title);
      if (!shown || id !== request) return;
      status.hidden = true; stage.classList.add('is-3d-ready');
      viewer.setAuto(spinning && onScreen);
    } catch (error) {
      if (error.name === 'AbortError' || id !== request) return;
      console.error('Prévia 3D indisponível:', error); fail();
    }
  }
  // No meio da página o modelo não pode prender a rolagem: sem zoom pela roda do mouse e, no celular, arrastar na vertical
  // rola a página (na horizontal, gira). O giro automático para no primeiro toque e fora da tela.
  function tune(v) {
    v.controls.enableZoom = false;
    v.renderer.domElement.style.touchAction = 'pan-y';
    v.controls.addEventListener('start', () => { spinning = false; v.setAuto(false); stage.classList.add('is-touched'); });
  }
  function fail() {
    ++request; viewer?.dispose(); viewer = null; view = 'photo'; stage.dataset.view = 'photo'; stage.classList.remove('is-3d-ready');
    host.hidden = true; views.hidden = true; status.hidden = false;
    status.textContent = 'A prévia 3D não abriu neste navegador; a foto mostra as cores originais.';
  }
  views.addEventListener('click', event => { const b = event.target.closest('[data-pl-view]'); if (b && b.dataset.plView !== view) setView(b.dataset.plView); });
  new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; if (viewer?.active) viewer.setAuto(spinning && onScreen); }).observe(stage);
  window.addEventListener('pagehide', () => viewer?.hide());
  window.addEventListener('pageshow', event => { if (event.persisted && view === '3d') setView('3d'); });

  // ── as cores, aqui mesmo ──
  panel.innerHTML = `<div class="pl-custom-inner"><div class="pl-custom-card">
    <div class="pl-custom-head"><p>Escolha a cor de cada parte</p><button type="button" class="pl-reset" data-pl-reset>Restaurar cores</button></div>
    <div class="pl-tabs" role="group" aria-label="Partes da peça">${product.parts.map(p => `<button type="button" data-pl-tab="${p.id}" aria-pressed="false"><i aria-hidden="true"></i><span></span></button>`).join('')}</div>
    <p class="pl-hint" data-pl-hint></p>
    <div class="pl-palette" role="radiogroup" aria-label="Cores">${PALETTE.map(c => `<button type="button" class="pl-swatch" role="radio" aria-checked="false" data-pl-color="${c.id}" style="--swatch:${c.hex}"><i aria-hidden="true"></i></button>`).join('')}</div>
    <p class="pl-now" data-pl-now aria-live="polite"></p>
  </div></div>`;
  // nomes por textContent/atributo (vêm dos dados, e o i18n.js traduz)
  product.parts.forEach(p => { panel.querySelector(`[data-pl-tab="${p.id}"] span`).textContent = p.name; });
  PALETTE.forEach(c => { const b = panel.querySelector(`[data-pl-color="${c.id}"]`); b.title = c.name; b.setAttribute('aria-label', c.name); });

  function paint(message) {
    const current = product.parts.find(p => p.id === part);
    root.querySelectorAll('[data-pl-part]').forEach(chip => {
      const c = color(selection[chip.dataset.plPart]);
      chip.querySelector('i').style.setProperty('--chip', c.hex); chip.querySelector('strong').textContent = c.name;
      chip.setAttribute('aria-pressed', String(!panel.hidden && chip.dataset.plPart === part));
    });
    panel.querySelectorAll('[data-pl-tab]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.plTab === part)); b.querySelector('i').style.background = color(selection[b.dataset.plTab]).hex; });
    panel.querySelectorAll('[data-pl-color]').forEach(b => { const on = b.dataset.plColor === selection[part]; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
    panel.querySelector('[data-pl-hint]').textContent = current.hint;
    panel.querySelector('[data-pl-reset]').hidden = isOriginal();
    title.textContent = isOriginal() ? 'Cores originais' : 'Suas cores';
    if (!add.classList.contains('is-added')) add.querySelector('span').textContent = isOriginal() ? 'Adicionar nas cores originais' : 'Adicionar com estas cores';
    if (message) panel.querySelector('[data-pl-now]').textContent = message;
    viewer?.update(hex());
  }
  function openPanel(open, focusPart) {
    if (focusPart) part = focusPart;
    root.classList.toggle('is-customizing', open);
    customize.setAttribute('aria-expanded', String(open));
    if (open) {
      panel.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => { panel.classList.add('is-open'); pin(); }));
      if (view !== '3d') setView('3d');
    } else {
      pin(false);
      panel.classList.remove('is-open');
      const done = () => { if (!panel.classList.contains('is-open')) panel.hidden = true; };
      if (reduced.matches) done(); else setTimeout(done, 420);
    }
    paint();
  }
  // No celular, escolhendo as cores: a peça fica presa no alto (menor), o header some (o foco é a peça) e a página rola até
  // o botão e a paleta, logo abaixo dela. Passada a paleta, o fim dela vai empurrando a peça para cima junto com a rolagem,
  // como se a soltasse aos poucos; aí o header pode voltar. Rolando de volta, a peça desce de novo do mesmo jeito.
  const holder = root.querySelector('.pl-stage'), TOP = 8, GAP = 12;
  let follow = null;
  function pin(on = true) {
    if (follow) { window.removeEventListener('scroll', follow.schedule); window.removeEventListener('resize', follow.schedule); cancelAnimationFrame(follow.frame); follow = null; }
    root.classList.remove('is-pinned'); document.documentElement.classList.remove('pl-focus'); holder.style.transform = '';
    if (!on || !phone.matches) return;
    root.classList.add('is-pinned');
    const card = panel.querySelector('.pl-custom-card');
    const update = () => {
      follow.frame = 0;
      const height = holder.offsetHeight, push = Math.min(TOP + height + GAP - card.getBoundingClientRect().bottom, height + TOP + 40);
      holder.style.transform = push > 0 ? `translate3d(0, ${-push}px, 0)` : '';
      document.documentElement.classList.toggle('pl-focus', push < height);
    };
    follow = {frame: 0, schedule: () => { if (!follow.frame) follow.frame = requestAnimationFrame(update); }};
    window.addEventListener('scroll', follow.schedule, {passive: true}); window.addEventListener('resize', follow.schedule, {passive: true});
    update();
    // o botão ativo (que fecha as cores) fica à vista logo abaixo da peça, com a paleta em seguida
    const top = customize.getBoundingClientRect().top + scrollY - (TOP + holder.offsetHeight + GAP);
    if (top > scrollY) window.scrollTo({top, behavior: reduced.matches ? 'auto' : 'smooth'});
  }
  // A foto mostra só as cores originais: ao escolher uma cor, a peça passa para o 3D.
  function choose(id) {
    selection = validSelection(key, {...selection, [part]: id});
    paint(`${product.parts.find(p => p.id === part).name}: ${color(id).name}.`);
    if (view !== '3d') setView('3d');
  }
  // ativo (cores abertas), o botão se pinta com as cores e mostra um × pequeno: clicar de novo fecha
  customize.insertAdjacentHTML('beforeend', '<i class="pl-customize-x" aria-hidden="true"></i>');
  customize.setAttribute('aria-controls', 'pl-custom'); customize.setAttribute('aria-expanded', 'false'); customize.setAttribute('role', 'button');
  customize.addEventListener('click', event => { event.preventDefault(); openPanel(panel.hidden || !panel.classList.contains('is-open')); });
  customize.addEventListener('keydown', event => { if (event.key === ' ') { event.preventDefault(); customize.click(); } });
  root.querySelectorAll('[data-pl-part]').forEach(chip => chip.addEventListener('click', () => {
    openPanel(true, chip.dataset.plPart);
    requestAnimationFrame(() => panel.querySelector('[aria-checked="true"]')?.focus({preventScroll: true}));
  }));
  panel.addEventListener('click', event => {
    const tab = event.target.closest('[data-pl-tab]'), swatch = event.target.closest('[data-pl-color]');
    if (tab) { part = tab.dataset.plTab; paint(); }
    else if (swatch) choose(swatch.dataset.plColor);
    else if (event.target.closest('[data-pl-reset]')) { selection = {...original}; paint('Cores originais restauradas para este produto.'); }
  });
  // cores como grupo de opções: as setas trocam a cor e levam o foco junto
  panel.querySelector('.pl-palette').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const ids = PALETTE.map(c => c.id), i = ids.indexOf(selection[part]), next = ids[(i + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + ids.length) % ids.length];
    choose(next); panel.querySelector(`[data-pl-color="${next}"]`).focus();
  });

  // ── comprar: as cores escolhidas vão para o carrinho; o botão confirma com o check e então o mini-carrinho abre ──
  add.addEventListener('click', () => {
    if (busy) return;
    const chosen = {...selection}, plain = isOriginal();
    let thumbnail = null;
    try { if (!plain && view === '3d' && viewer?.active) thumbnail = viewer.snapshot(); } catch {}
    let cart;
    try { cart = writeCart(putItem(readCart(), key, chosen, thumbnail)); }
    catch (error) { panel.querySelector('[data-pl-now]').textContent = error.message; return; }
    window.dispatchEvent(new Event('ju:cart'));
    busy = true; add.classList.add('is-added'); add.querySelector('span').textContent = 'Adicionado';
    setTimeout(() => openMiniCart({itemId: addedItemId(cart, key, chosen), original: plain}), reduced.matches ? 0 : 650);
    setTimeout(() => { busy = false; add.classList.remove('is-added'); paint(); }, 2200);
  });

  paint();
}
