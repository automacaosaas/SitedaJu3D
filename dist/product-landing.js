import {PRODUCTS, PALETTE, PALETTE_GROUPS, defaults, color, paint as swatchOf, isLight, noticeOf, validSelection} from './products.js';
import {readCart, writeCart, putItem, putItems, totals} from './cart-store.js';
import {openMiniCart, addedItemId} from './mini-cart.js';
import {icon} from './icons.js';
import {mountKit} from './kit-builder.js';
import {wireBadge} from './badge-shine.js';

// Página de cada peça (borboletoscopio.html…, tools/build-product-pages.cjs). A foto dá lugar ao modelo 3D que gira (o
// mesmo do configurador, viewer.js); "Personalizar o meu" abre a escolha das cores aqui mesmo, e cada cor pinta o modelo
// na hora; o botão de compra leva as cores escolhidas e confirma com um check animado antes de abrir o mini-carrinho.
// Sem este arquivo a página continua inteira: a foto, o configurador da vitrine e o botão do mini-carrinho (catalog.js).
const root = document.querySelector('[data-pl]'), key = root?.dataset.pl;
if (root && PRODUCTS[key]) setup(root, key);
// o selo "Novidade" brilha duas vezes ao abrir a página e de novo com o mouse por cima ou quando a página volta a aparecer
wireBadge(document.querySelector('.pl-badge.is-badge'), {onVisible: true});

function setup(root, key) {
  const product = PRODUCTS[key], original = defaults(key), q = selector => root.querySelector(selector);
  const stage = q('[data-pl-stage]'), host = q('[data-pl-viewer]'), status = q('[data-pl-status]'), views = q('[data-pl-views]');
  const add = q('.pl-add'), customize = q('[data-pl-customize]'), panel = q('[data-pl-custom]'), dots = q('[data-pl-dots]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)'), phone = matchMedia('(max-width: 860px)');
  // a peça de cores fixas (as lâmpadas): sem partes nem painel de cores — só a foto, o 3D e a compra
  const fixed = !product.parts.length;
  let selection = {...original}, part = product.parts[0]?.id, view = 'photo', viewer = null, viewerImport = null, request = 0;
  // o grupo de cores à vista: o da cor da parte, a não ser que a pessoa tenha aberto outro para olhar (browsing)
  let shownGroup = 'solid', browsing = false;
  let spinning = !reduced.matches, onScreen = true, busy = false;
  const isOriginal = () => product.parts.every(p => selection[p.id] === original[p.id]);
  // as cores escolhidas como as da paleta (com o acabamento: o 3D brilha como o filamento)
  const chosen = () => Object.fromEntries(Object.entries(selection).map(([id, value]) => [id, color(value)]));

  // O botão do mini-carrinho do catalog.js só conhece as cores originais: daqui em diante esta página adiciona as escolhidas.
  add.removeAttribute('data-add-product');
  add.insertAdjacentHTML('beforeend', '<svg class="pl-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.4 4.4L19 7.2"/></svg>');
  views.hidden = false;
  stage.insertAdjacentHTML('beforeend', `<span class="pl-drag" aria-hidden="true">${icon('returns')}<span>Arraste para girar</span></span>`);
  // No celular, escolhendo as cores: quando a peça presa no alto cobre o botão de compra, um carrinho aparece no canto da
  // própria peça (e vai embora com ela) e adiciona nas cores escolhidas, abrindo o mini-carrinho como o botão de sempre.
  stage.insertAdjacentHTML('beforeend', `<button type="button" class="pl-fab" data-pl-fab aria-label="Adicionar ao carrinho">${icon('cart')}<span class="pl-fab-plus" aria-hidden="true">+</span></button>`);
  const fab = q('[data-pl-fab]');
  fab.addEventListener('click', () => { fab.classList.remove('is-adding'); void fab.offsetWidth; fab.classList.add('is-adding'); add.click(); });

  // ── a peça: foto ou 3D ──
  async function setView(next) {
    view = next; const id = ++request;
    views.querySelectorAll('[data-pl-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.plView === next)));
    stage.dataset.view = next; paintDots();
    if (next === 'photo') { viewer?.hide(); host.hidden = true; status.hidden = true; return; }
    host.hidden = false;
    if (!viewer?.active) { status.hidden = false; status.textContent = 'Preparando sua prévia 3D…'; }
    try {
      viewerImport ??= import('./viewer.js');
      const {ProductViewer} = await viewerImport;
      if (id !== request) return;
      if (!viewer) { viewer = new ProductViewer(host, fail); tune(viewer); }
      const shown = await viewer.show(key, chosen(), product.title);
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

  // ── as fotos (06/10/2026): embaixo da peça, as fotos reais (gallery.js) em miniaturas (a da vitrine, de outra cor, saiu); a escolhida troca a grande
  // com um esmaecimento (com o mouse, basta passar por cima), e no celular a foto grande também passa de lado com o dedo. ──
  const thumbs = q('[data-pl-thumbs]'), photo = q('.pl-photo');
  if (thumbs) {
    const buttons = [...thumbs.querySelectorAll('button')];
    let current = 0, swap = 0, startX = null;
    thumbs.hidden = false;
    const show = i => {
      i = (i + buttons.length) % buttons.length;
      if (view !== 'photo') setView('photo');
      if (i === current) return;
      current = i; const b = buttons[i], id = ++swap;
      buttons.forEach((x, j) => x.setAttribute('aria-pressed', String(j === i)));
      b.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: reduced.matches ? 'auto' : 'smooth'});
      const next = new Image(); next.src = b.dataset.src;
      photo.classList.add('is-swapping');
      Promise.all([(next.decode?.() || Promise.resolve()).catch(() => {}), new Promise(done => setTimeout(done, reduced.matches ? 0 : 180))]).then(() => {
        if (id !== swap) return;
        photo.src = b.dataset.src; photo.alt = b.dataset.alt;
        stage.classList.toggle('is-real', !('main' in b.dataset));
        requestAnimationFrame(() => photo.classList.remove('is-swapping'));
      });
    };
    thumbs.addEventListener('click', event => { const b = event.target.closest('button'); if (b) show(buttons.indexOf(b)); });
    thumbs.addEventListener('pointerover', event => { const b = event.target.closest('button'); if (b && event.pointerType === 'mouse') show(buttons.indexOf(b)); });
    thumbs.addEventListener('keydown', event => { const step = {ArrowLeft: -1, ArrowRight: 1}[event.key]; if (!step) return; event.preventDefault(); show(current + step); buttons[current].focus(); });
    stage.addEventListener('pointerdown', event => { if (view === 'photo' && event.pointerType !== 'mouse') startX = [event.clientX, event.clientY]; });
    stage.addEventListener('pointerup', event => {
      if (!startX) return;
      const dx = event.clientX - startX[0], dy = event.clientY - startX[1]; startX = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > 1.5 * Math.abs(dy)) show(current + (dx < 0 ? 1 : -1));
    });
    stage.addEventListener('pointercancel', () => { startX = null; });
  }
  new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; if (viewer?.active) viewer.setAuto(spinning && onScreen); }).observe(stage);
  window.addEventListener('pagehide', () => viewer?.hide());
  window.addEventListener('pageshow', event => { if (event.persisted && view === '3d') setView('3d'); });

  // A peça de cores fixas: o botão leva a peça (nas cores dela) e confirma com o check antes de abrir o mini-carrinho.
  if (fixed) {
    add.addEventListener('click', () => {
      if (busy) return;
      let cart;
      try { cart = writeCart(putItem(readCart(), key, {})); } catch (error) { status.hidden = false; status.textContent = error.message; return; }
      window.dispatchEvent(new Event('ju:cart'));
      busy = true; add.classList.add('is-added'); add.querySelector('span').textContent = 'Adicionado';
      setTimeout(() => openMiniCart({itemId: addedItemId(cart, key, {}), original: true}), reduced.matches ? 0 : 650);
      setTimeout(() => { busy = false; add.classList.remove('is-added'); add.querySelector('span').textContent = 'Adicionar ao carrinho'; }, 2200);
    });
    // "Monte seu kit" (kit-builder.js), logo depois do preço: as peças do kit entram juntas e o mini-carrinho confirma cada uma. Uma
    // compra só (08/10/2026): com o bloco à vista, ele é a compra — o botão de uma unidade e a frase do kit embaixo do preço saem (os dois
    // continuam no HTML para quem está sem JavaScript)
    const kitHost = q('[data-pl-kit]');
    if (kitHost) {
      kitHost.hidden = false;
      const offer = q('.pl-offer'); if (offer) offer.hidden = true;
      add.closest('.pl-actions').hidden = true;
      mountKit(kitHost.querySelector('[data-pl-kit-body]'), {current: key, onAdd: async lines => {
        const before = totals(readCart(), 0).subtotal, cart = writeCart(putItems(readCart(), lines));
        window.dispatchEvent(new Event('ju:cart'));
        openMiniCart({itemIds: lines.map(line => addedItemId(cart, line.productId, {})).filter(Boolean), original: true, riseFrom: before});
      }});
    }
    return;
  }

  // ── as cores, aqui mesmo ──
  panel.innerHTML = `<div class="pl-custom-inner"><div class="pl-custom-card">
    <div class="pl-custom-head"><p>Escolha a cor de cada parte</p><button type="button" class="pl-reset" data-pl-reset>Restaurar cores</button></div>
    <div class="pl-tabs" role="group" aria-label="Partes da peça">${product.parts.map(p => `<button type="button" data-pl-tab="${p.id}" aria-pressed="false"><i aria-hidden="true"></i><span></span></button>`).join('')}</div>
    <p class="pl-hint" data-pl-hint></p>
    <div class="pl-groups" role="group" aria-label="Tipos de cor">${PALETTE_GROUPS.map(g => `<button type="button" data-pl-group="${g.id}" aria-pressed="false" aria-controls="pl-palette"><span></span><i aria-hidden="true"></i></button>`).join('')}</div>
    <div class="pl-palette" id="pl-palette" role="radiogroup" aria-label="Cores" data-group="solid">${PALETTE.map(c => `<button type="button" class="pl-swatch" role="radio" aria-checked="false" data-pl-color="${c.id}" data-group="${c.group}"${c.finish ? ` data-finish="${c.finish}"` : ''} style="--swatch:${swatchOf(c)};--check:${isLight(c) ? '#332b32' : '#fff'}"><i aria-hidden="true"></i><span class="pl-swatch-name"></span></button>`).join('')}</div>
    <div class="pl-notice" data-pl-notice aria-live="polite"><div><p>${icon('info')}<span></span></p></div></div>
    <p class="pl-now" data-pl-now aria-live="polite"></p>
  </div></div>`;
  // nomes por textContent/atributo (vêm dos dados, e o i18n.js traduz)
  product.parts.forEach(p => { panel.querySelector(`[data-pl-tab="${p.id}"] span`).textContent = p.name; });
  PALETTE.forEach(c => { const b = panel.querySelector(`[data-pl-color="${c.id}"]`); b.title = c.name; b.setAttribute('aria-label', c.name); b.querySelector('.pl-swatch-name').textContent = c.name; });
  PALETTE_GROUPS.forEach(g => { panel.querySelector(`[data-pl-group="${g.id}"] span`).textContent = g.name; });
  // As cores, um grupo de cada vez (foscas, com brilho, multicor): a aba do grupo da cor escolhida leva uma bolinha dela; no Tab, a cor
  // escolhida, ou a primeira do grupo aberto.
  function paintGroups() {
    const chosenColor = color(selection[part]);
    if (!browsing) shownGroup = chosenColor.group;
    panel.querySelector('.pl-palette').dataset.group = shownGroup;
    panel.querySelectorAll('[data-pl-group]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.plGroup === shownGroup)); const dot = b.querySelector('i'); dot.hidden = b.dataset.plGroup !== chosenColor.group; dot.style.background = swatchOf(chosenColor); });
    const shown = [...panel.querySelectorAll(`.pl-swatch[data-group="${shownGroup}"]`)], focus = shown.find(b => b.getAttribute('aria-checked') === 'true') || shown[0];
    panel.querySelectorAll('[data-pl-color]').forEach(b => { b.tabIndex = b === focus ? 0 : -1; });
  }

  // As bolinhas no canto da peça: na foto, as cores originais (é o que ela mostra); no 3D, as escolhidas, mudando na hora.
  function paintDots() {
    const shown = view === '3d' ? selection : original;
    dots.setAttribute('aria-label', shown === original || isOriginal() ? 'Cores originais' : 'Suas cores');
    dots.querySelectorAll('[data-pl-part]').forEach(dot => {
      const p = product.parts.find(item => item.id === dot.dataset.plPart), c = color(shown[p.id]), i = dot.querySelector('i');
      if (i.style.getPropertyValue('--chip') !== swatchOf(c)) { i.style.setProperty('--chip', swatchOf(c)); if (!reduced.matches) { dot.classList.remove('is-changed'); void dot.offsetWidth; dot.classList.add('is-changed'); } }
      dot.title = `${p.name}: ${c.name}`; dot.setAttribute('aria-label', dot.title);
      dot.setAttribute('aria-pressed', String(!panel.hidden && p.id === part));
    });
  }
  function paint(message) {
    const current = product.parts.find(p => p.id === part);
    paintDots();
    panel.querySelectorAll('[data-pl-tab]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.plTab === part)); b.querySelector('i').style.background = swatchOf(color(selection[b.dataset.plTab])); });
    panel.querySelectorAll('[data-pl-color]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.plColor === selection[part])));
    paintGroups();
    // o aviso de uma cor escolhida (o arco-íris varia com o rolo de filamento), embaixo das cores
    const notice = noticeOf(product.parts.map(p => color(selection[p.id]))), box = panel.querySelector('[data-pl-notice]');
    if (notice) box.querySelector('span').textContent = notice;
    box.classList.toggle('is-on', !!notice);
    panel.querySelector('[data-pl-hint]').textContent = current.hint;
    panel.querySelector('[data-pl-reset]').hidden = isOriginal();
    if (!add.classList.contains('is-added')) add.querySelector('span').textContent = isOriginal() ? 'Adicionar nas cores originais' : 'Adicionar com estas cores';
    if (message) panel.querySelector('[data-pl-now]').textContent = message;
    viewer?.update(chosen());
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
    root.classList.remove('is-pinned', 'show-fab'); document.documentElement.classList.remove('pl-focus'); holder.style.transform = '';
    if (!on || !phone.matches) return;
    root.classList.add('is-pinned');
    const card = panel.querySelector('.pl-custom-card');
    const update = () => {
      follow.frame = 0;
      const height = holder.offsetHeight, push = Math.min(TOP + height + GAP - card.getBoundingClientRect().bottom, height + TOP + 40);
      holder.style.transform = push > 0 ? `translate3d(0, ${-push}px, 0)` : '';
      document.documentElement.classList.toggle('pl-focus', push < height);
      // o carrinho da peça só quando o botão "Adicionar" está escondido atrás dela (nunca os dois à vista)
      root.classList.toggle('show-fab', add.getBoundingClientRect().bottom < TOP + height + GAP - Math.max(push, 0));
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
    selection = validSelection(key, {...selection, [part]: id}); browsing = false;
    paint(`${product.parts.find(p => p.id === part).name}: ${color(id).name}${color(id).note ? ` · ${color(id).note}` : ''}.`);
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
    const tab = event.target.closest('[data-pl-tab]'), swatch = event.target.closest('[data-pl-color]'), group = event.target.closest('[data-pl-group]');
    if (tab) { part = tab.dataset.plTab; browsing = false; paint(); }
    else if (group) { shownGroup = group.dataset.plGroup; browsing = shownGroup !== color(selection[part]).group; paintGroups(); }
    else if (swatch) choose(swatch.dataset.plColor);
    else if (event.target.closest('[data-pl-reset]')) { selection = {...original}; browsing = false; paint('Cores originais restauradas para este produto.'); }
  });
  // cores como grupo de opções: as setas trocam a cor e levam o foco junto
  panel.querySelector('.pl-palette').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const ids = PALETTE.filter(c => c.group === shownGroup).map(c => c.id), i = ids.indexOf(selection[part]), forward = ['ArrowRight', 'ArrowDown'].includes(event.key);
    const next = ids[i < 0 ? (forward ? 0 : ids.length - 1) : (i + (forward ? 1 : -1) + ids.length) % ids.length];
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
