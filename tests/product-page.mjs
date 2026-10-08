import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Página de produto compacta (dist/controller.js): uma tela só, com preço, cores e compra à vista; detalhes num painel.
const read = file => readFile(new URL(`../dist/${file}`, import.meta.url), 'utf8');
const [html, js, css, bridge] = await Promise.all(['index.html', 'controller.js', 'product-page.css', 'cart-bridge.js'].map(read));
const dialog = html.match(/<dialog id="product-dialog"[\s\S]*?<\/dialog>/)[0];

// Uma tela só: sem as etapas apresentação → personalização → resumo.
for (const gone of ['id="personalize"', 'id="finish"', 'id="combination"', 'id="customizer"', 'id="product-info"', 'Voltar à coleção', 'copy-combination']) assert(!dialog.includes(gone), `sem ${gone}`);
assert(!/setMode|dataset\.mode==='summary'/.test(js) && !/dataset\.mode !== 'summary'/.test(bridge), 'sem modos; a compra fica sempre à vista');
assert(/panel\.hidden = false;/.test(bridge), 'painel de compra sempre visível');
for (const id of ['product-price', 'product-pix', 'part-tabs', 'palette', 'presets', 'add-to-cart', 'buy-now', 'pdp-sheet', 'dialog-description', 'fixed-note', 'pdp-production']) assert(dialog.includes(`id="${id}"`), `tem #${id}`);

// Rotas mantidas: #produto/<peça> abre na imagem; /personalizar abre na prévia 3D.
assert(js.includes("step==='personalizar'") && js.includes("setView('model')") && js.includes("else if(changed)setView('photo')"));
// Escolher uma cor leva a prévia para o 3D (a foto só mostra as cores originais).
assert(/if\(view!=='model'\)setView\('model'\)/.test(js));
// Preço no Pix com a mesma regra do servidor (pixDiscountBps).
assert(js.includes("cents-Math.round(cents*COMMERCE.pixDiscountBps/10000)") && js.includes('no Pix`'));
// Cores como grupo de opções acessível: role=radio, aria-checked, tabindex itinerante e setas.
assert(dialog.includes('id="palette" role="radiogroup"') && js.includes("b.setAttribute('role','radio')") && js.includes("b.tabIndex=on?0:-1") && /ArrowLeft','ArrowRight','ArrowUp','ArrowDown'/.test(js));
// Combinações prontas.
for (const [id, name] of [['original', 'Original'], ['pastel', 'Pastel'], ['vibrante', 'Vibrante'], ['surpresa', 'Surpreenda-me']]) assert(js.includes(`{id:'${id}',name:'${name}'`), name);
// Painel com abas, aberto pelo (i) do topo (Detalhes, Cores, Entrega e Trocas não se repetem embaixo das cores, pedido de 05/10/2026):
// setas/Home/End nas abas, Esc fecha primeiro o painel e devolve o foco.
assert(dialog.includes('id="pdp-info"') && !dialog.includes('pdp-facts') && !/data-sheet=/.test(dialog), 'as informações ficam só no (i)');
assert.equal((dialog.match(/role="tab"/g) || []).length, 4);
assert(js.includes("if(sheetOpen())closeSheet();else closeProduct();") && js.includes('sheetOpener?.focus'));
assert(js.includes("dialog.addEventListener('keydown',e=>{if(e.key==='Escape'&&sheetOpen()){e.preventDefault();closeSheet();}});"), 'Esc fecha o painel mesmo sem um clique antes (o navegador nem sempre deixa segurar o cancel)');
// O painel segura o foco (usabilidade 6): aberto, o resto da janela fica inerte; ao fechar, sai deslizando antes de sumir (movimento 12).
assert(js.includes('for(const el of dialog.children)el.inert=el!==sheet;') && js.includes('for(const el of dialog.children)el.inert=false;') && js.includes("sheet.classList.add('is-leaving');sheetTimer=setTimeout(") && css.includes('.pdp-sheet.is-leaving { transition-duration: .24s;'), 'o painel segura o foco e sai deslizando');
assert(js.includes("['ArrowLeft','ArrowRight','Home','End']"));
// Sem dados inventados: trocas apontam para a política real; nada de "a confirmar".
assert(dialog.includes('href="trocas.html"') && !/a confirmar|compatível com/i.test(dialog));
// Toque e movimento.
assert(/#product-dialog \.swatch \{ width: 44px; height: 44px;/.test(css), 'cores com 44 px de área de toque');
assert(/\.pdp-sheet-tabs button \{ min-height: 44px;/.test(css) && /\.pdp-sheet-close \{ width: 44px; height: 44px;/.test(css));
assert(/@media \(prefers-reduced-motion: reduce\) \{\s*\.pdp-sheet/.test(css));
assert(/@media \(max-width: 600px\) \{[\s\S]*\.pdp-sheet \{ top: auto; left: 0;/.test(css), 'no celular o painel sobe de baixo');
assert(html.includes('<link rel="stylesheet" href="product-page.css">'));
// Novidade sem venda (SOON, cores fixas): #produto/<peça>/3d abre só para ver — foto e 3D, as cores da peça e um aviso no lugar da compra.
assert(js.includes("dialog.dataset.mode=soon?'preview':'compact'") && js.includes("if(!PRODUCTS[key]&&!(SOON[key]&&step==='3d'))") && js.includes('if(!PRODUCTS[key])return null;'), 'novidade: modo só para ver, pela rota /3d');
assert(dialog.includes('id="fixed-colors"') && dialog.includes('<p class="pdp-soon-bar">'), 'novidade: as cores fixas e o aviso no lugar da compra');
assert(css.includes('#product-dialog[data-mode=preview] :is(.pdp-colors, .pdp-price, #purchase-panel, .pdp-preview) { display: none; }'), 'novidade: sem escolha de cor, preço nem compra');

// Pedido de 05/10/2026: a barra do 3D do outro lado (à direita; no celular, numa linha no alto, ao lado do Foto | 3D) e, no celular, a
// área da peça menor: as cores ficam sempre à vista e a peça fica com o que sobra da tela.
assert(css.includes('#product-dialog .viewer-tools { top: 50%; bottom: auto; right: 14px; left: auto;') && /@media \(max-width: 600px\) \{[\s\S]*#product-dialog \.viewer-tools \{ top: 8px; right: 16px; left: auto; transform: none; flex-direction: row;/.test(css), 'a barra do 3D à direita');
assert(/@media \(max-width: 600px\) \{[\s\S]*#product-dialog\[open\] \{ grid-template-rows: auto minmax\(190px, 1fr\) minmax\(0, auto\) auto;/.test(css), 'no celular, as cores à vista e a peça com o resto da tela');

// 07/10/2026: a barra de compra recolhida (celular) mostra o preço no Pix logo abaixo do preço, na mesma linha de 48 px; girar o aparelho
// de volta à largura de celular abaixa a compra de novo.
assert(css.includes('#product-dialog .modal-actions.is-compact .pdp-price p { flex-direction: column; align-items: flex-start; flex-wrap: nowrap; gap: 1px; }'), 'recolhida: o Pix embaixo do preço');
assert(css.includes('#product-dialog .modal-actions.is-compact :is(.pdp-price > small, .purchase-free-ship) { display: none; }') && !/is-compact :is\([^)]*\.pdp-pix/.test(css), 'o Pix não some mais na barra recolhida');
assert(/#product-dialog \.modal-actions\.is-compact \.pdp-pix \{ padding: 1px 8px; font-size: 12px; line-height: 1\.35;/.test(css) && /#product-dialog \.modal-actions\.is-compact \.pdp-price strong \{ font-size: 22px; line-height: 1\.1;/.test(css), 'preço (24 px) + Pix (20 px) cabem nos 48 px');
assert((await read('purchase-sheet.js')).includes("phone.addEventListener('change', start);"), 'girar para a largura de celular recolhe de novo');

// As cores da janela são as da peça aberta (a vitrine não anda mais quando a peça abre por um card) e o foco volta a quem abriu.
assert(js.includes("for(const [name,value] of Object.entries(journeyColors(showcase(key).theme)))dialog.style.setProperty(name,value);"), 'a janela veste a própria peça');
assert(js.includes('opener=focused&&focused!==document.body?focused:trigger&&performance.now()-trigger.at<1500?trigger.link:null;') && js.includes('restoreFocus();') && !js.includes('document.querySelector(`[data-product="${activeProduct}"]`)?.focus'), 'ao fechar, o foco volta a quem abriu (não à vitrine)');
assert(js.includes('.product-rail-card.is-active[data-product-id="${activeProduct}"] .product-customize, .slot[data-front="true"][data-product="${activeProduct}"]'), 'sem quem abriu: o botão do card ou a peça da frente da vitrine');

// O selo "Novidade" das lâmpadas (07/10 o unicórnio em arco-íris; 08/10/2026 o mesmo selo nas outras, nas cores de cada uma): tudo vem
// do dado (nada de nome de peça no código), as letras passam pelas cores numa volta sem emenda que anda só por transform (um ::before
// em darken por cima das letras brancas: movimento 10), parado com movimento reduzido, a cor do sistema em alto contraste — e cada
// ponto do degradê de cada peça passa de 4,5:1 sobre a pílula dela.
{
  const {PRODUCTS, badgeStyle} = await import(new URL('../dist/products.js', import.meta.url));
  const {mixColor} = await import(new URL('../dist/hero-motion.js', import.meta.url));
  const lamps = Object.keys(PRODUCTS).filter(key => PRODUCTS[key].badge);
  assert.deepEqual(lamps, ['macacoscopio', 'girafoscopio', 'unicornioscopio'], 'as três lâmpadas têm o selo');
  assert.deepEqual(Object.keys(PRODUCTS).filter(key => PRODUCTS[key].eyebrowEffect === 'rainbow'), ['unicornioscopio'], 'arco-íris só no unicórnio');
  assert.equal(PRODUCTS.macacoscopio.eyebrowEffect, 'shine'); assert.equal(PRODUCTS.girafoscopio.eyebrowEffect, 'shine');
  for (const key of ['macacoscopio', 'girafoscopio']) assert(!PRODUCTS[key].badge.ink.some(c => PRODUCTS.unicornioscopio.badge.ink.includes(c)), `${key}: as letras nas cores da própria peça`);
  assert(js.includes("eyebrow.classList.toggle('is-badge',!!p.badge);eyebrow.style.cssText=badgeStyle(key);") && js.includes("eyebrow.dataset.effect=p.eyebrowEffect||'shine'") && !/unicornioscopio|UnicornLamp|macacoscopio|girafoscopio/.test(js), 'a classe e as cores vêm do dado');
  const rule = css.match(/#product-dialog \.pdp-heading \.eyebrow\.is-badge \{[^}]*\}/)[0], flow = css.match(/#product-dialog \.pdp-heading \.eyebrow\.is-badge::before \{[^}]*\}/)[0];
  assert(/background: var\(--badge-pill\);/.test(rule) && /color: #fff;/.test(rule) && /width: fit-content;/.test(rule) && /border-radius: 999px;/.test(rule) && /outline: 1px dashed/.test(rule) && /var\(--badge-glow\)/.test(rule) && /isolation: isolate;/.test(rule) && /overflow: hidden;/.test(rule), 'a pílula escura com o fio, o pesponto e o halo');
  assert(/width: 400%;/.test(flow) && /background: var\(--badge-ink\) 0 0 \/ 50% 100% repeat-x;/.test(flow) && /mix-blend-mode: darken;/.test(flow) && /animation: pdp-badge-flow 4s linear infinite;/.test(flow), 'o degradê das letras num ::before em darken');
  assert(css.includes('@keyframes pdp-badge-flow { to { transform: translateX(-50%); } }') && !/background-position/.test(css.slice(css.indexOf('/* O selo "Novidade"'))), 'anda exatamente um ladrilho (50% de 400% = 200% do selo, o tamanho do ladrilho), só por transform');
  assert(/\.eyebrow\.is-badge::after \{[^}]*animation: pdp-badge-shine[^}]*\}/.test(css) && /@keyframes pdp-badge-shine \{[^}]*translateX[^}]*\}/.test(css), 'o brilho que passa: só transform');
  assert(/@media \(min-width: 901px\) \{ #product-dialog \.pdp-heading \.eyebrow\.is-badge \{[^}]*font-size: 13\.5px;/.test(css), 'no computador, maior (visual 10)');
  assert(css.includes('@media (prefers-reduced-motion: reduce) { #product-dialog .pdp-heading .eyebrow.is-badge::before { animation: none; }') && css.includes('@media (forced-colors: active) { #product-dialog .pdp-heading .eyebrow.is-badge { background: none;'));
  const lum = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };
  const channels = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  for (const key of lamps) {
    const {ink, pill} = PRODUCTS[key].badge, style = badgeStyle(key);
    const stops = style.match(/--badge-ink:linear-gradient\(90deg, ([^)]*)\)/)[1].split(', ');
    assert.equal(stops[0], stops.at(-1), `${key}: o fim do degradê é o começo (a volta não tem emenda)`);
    assert(style.includes(`--badge-pill:linear-gradient(135deg, ${pill.join(', ')})`) && /--badge-glow:#[0-9a-f]{6}/.test(style), `${key}: a pílula e o halo`);
    // em darken, a pílula fica intacta: nenhuma cor das letras é mais escura que ela em nenhum canal
    assert(ink.every(c => pill.every(p => channels(c).every((v, i) => v >= channels(p)[i]))), `${key}: o degradê não mancha a pílula`);
    let worst = Infinity;
    for (let i = 0; i < stops.length - 1; i++) for (let t = 0; t <= 1.0001; t += .05) for (const p of pill) worst = Math.min(worst, contrast(mixColor(stops[i], stops[i + 1], t), p));
    assert(worst >= 4.5, `${key}: cada ponto das letras passa de 4,5:1 sobre a pílula (${worst.toFixed(2)})`);
  }
  assert.equal(badgeStyle('borboletoscopio'), '', 'peça sem selo');
}

// Surpreenda-me na área da peça (08/10/2026, pedido do dono): uma pílula de vidro, só nas peças de personalizar, no alto e no meio no
// computador e no tablet (entre o Foto | 3D e "Suas cores") e embaixo à direita no celular; as cores usam a largura toda; da aba Foto o
// sorteio aparece no 3D (applyColors); a estrelinha gira a cada sorteio; 44 px de toque.
{
  const visual = dialog.slice(dialog.indexOf('<div class="detail-visual">'), dialog.indexOf('<div class="detail-copy">'));
  assert(visual.includes('<button type="button" class="pdp-surprise" id="surprise"><span aria-hidden="true">✦</span>Surpreenda-me</button>') && !dialog.includes('pdp-palette-row'), 'na área da peça, fora da fileira das cores');
  assert(css.includes('#product-dialog .pdp-surprise { position: absolute; z-index: 3; top: 21px; left: 50%; translate: -50% 0;') && /#product-dialog \.pdp-surprise \{[^}]*min-height: 44px;[^}]*backdrop-filter: blur/.test(css), 'no alto e no meio, de vidro, 44 px');
  assert(/@media \(max-width: 600px\) \{[\s\S]*#product-dialog \.pdp-surprise \{ top: auto; bottom: 10px; left: auto; right: 16px; translate: none;/.test(css), 'no celular, embaixo à direita');
  assert(css.includes('#product-dialog:is([data-fixed], [data-mode=preview]) .pdp-surprise { display: none; }'), 'só nas peças de personalizar');
  assert(css.includes('#product-dialog #palette { position: relative; min-width: 0; display: flex;') && !/\.pdp-palette-row/.test(css), 'as cores na largura toda');
  assert(js.includes("applyColors(presetSelection(activeProduct,preset),`Combinação ${preset.name} aplicada.`);if(!calm.matches){b.classList.remove('is-sparkling');") && /function applyColors\([^)]*\)\{[^}]*if\(view!=='model'\)setView\('model'\);\}/.test(js), 'o sorteio vai para o 3D, com a estrelinha');
  assert(css.includes('@keyframes pdp-sparkle { 45% { transform: rotate(200deg) scale(1.45); } 100% { transform: rotate(360deg); } }'));
}

// Uma compra só nas lâmpadas (visual 1): o kit escolhe e a barra compra o que foi montado — preço, Pix, "3x" e os dois botões seguem o
// kit, com o preço cheio riscado (só onde cabe); kit vazio, os botões avisam (aria-disabled) em vez de comprar.
{
  assert(js.includes("mountKit(kitHost.querySelector('.pdp-kit-body'),{current:kitHost.hidden?null:key,onChange:paintKit});") && js.includes('function paintKit(quote){kitPick=quote;paintPrice(quote.total,quote.full,quote.pix);}'), 'a barra segue o kit');
  assert(js.includes("$('.purchase-actions').addEventListener('click',e=>{") && js.includes('},true);') && js.includes("if(!b||!kitPick||$('#pdp-kit').hidden||dialog.hasAttribute('data-cart-edit'))return;") && js.includes('sessionStorage.setItem(DIRECT_KEY,JSON.stringify(putItems([],lines)));'), 'os dois botões compram o kit (na captura, antes do cart-bridge.js)');
  assert(js.includes("$('#product-installments').textContent=cents?`ou ${installmentLabel(cents)} sem juros no cartão`:'Escolha pelo menos uma peça.';") && js.includes("b.setAttribute('aria-disabled',String(!cents))"), 'kit vazio: o aviso e os botões aria-disabled');
  assert(dialog.includes('<s class="pdp-full" id="product-full" aria-hidden="true" hidden></s>') && css.includes('#product-dialog .modal-actions.is-compact .pdp-full { display: none; }'), 'o preço cheio riscado (fora da barra recolhida)');
  assert(js.includes('closeProduct(false);await new Promise(resolve=>requestAnimationFrame(resolve));'), 'adicionando, a janela fecha na hora e o foco volta a quem abriu antes do mini-carrinho');
}

// Abrir e fechar (movimentos 8 e 12): a janela abre no quadro do toque (o resto vem dois quadros depois) e sai esmaecendo com o fundo.
{
  assert(js.includes('if(later)requestAnimationFrame(()=>requestAnimationFrame(rest));else rest();') && /if\(opening\)\{[^}]*dialog\.showModal\(\);\}/.test(js) && js.includes('later=opening&&!calm.matches'), 'showModal primeiro, a galeria e o kit depois (com movimento reduzido, tudo junto)');
  // até a peça nova estar montada, o miolo fica parado no começo da entrada (invisível): nunca a foto e o preço da peça de antes
  assert(js.includes("dialog.classList.toggle('is-filling',later);dialog.showModal();") && js.includes("dialog.classList.remove('is-filling');") && css.includes('#product-dialog.is-filling :is(.detail-visual, .detail-copy > *, .modal-actions) { animation-play-state: paused; }'), 'sem a peça de antes enquanto a nova monta');
  assert(js.includes("dialog.classList.add('is-closing');") && js.includes("/^pd-(out|down)$/.test(e.animationName))finishClose();") && js.includes("$('.close').addEventListener('click',e=>closeProduct(e.isTrusted));"), 'fechar espera a animação de saída');
  assert(css.includes('#product-dialog[open]::backdrop { animation: pd-fade .22s ease both; }') && css.includes('#product-dialog[open].is-closing { animation: pd-out .18s cubic-bezier(.4, 0, 1, 1) forwards;') && css.includes('#product-dialog.is-closing::backdrop { animation: pd-fade-out .18s ease forwards; }'));
}

// A alça (usabilidade 7, movimento 9): 44 px de toque, foco à vista, e chama só com transform, quatro vezes.
{
  assert(css.includes('#product-dialog .pdp-grip { position: absolute; top: -22px; left: 50%; z-index: 3; display: grid; place-items: center; width: 72px; height: 44px;') && css.includes('#product-dialog .pdp-grip:focus-visible { outline: 2px solid var(--pd-accent);'));
  assert(css.includes('animation: pdp-grip-call 1.6s cubic-bezier(.45, 0, .55, 1) 4;') && css.includes('@keyframes pdp-grip-call { 0%, 100% { transform: translateY(0) scaleX(1); } 45% { transform: translateY(-4px) scaleX(1.35); } }') && !/@keyframes pdp-grip-call \{[^}]*width/.test(css), 'só transform');
}

// Alvos de 44 px (usabilidade 11, visual 12) e o celular em três faixas: Foto | 3D e as ferramentas no alto, a peça no meio, os pontinhos
// ou a dica de girar e o Surpreenda-me embaixo.
{
  assert(css.includes('#product-dialog .view-tabs button { min-height: 44px;') && css.includes('#product-dialog .viewer-tools button { min-height: 44px; min-width: 44px;') && /\.gallery-dots button \{ display: grid; place-items: center; width: 44px; height: 44px;/.test(css) && css.includes('.gallery-arrows button { display: grid; place-items: center; width: 44px; height: 44px;'));
  assert(!/min-height: 3[0-9]px/.test(css.slice(css.indexOf('@media (max-width: 600px) {'))), 'nada de botão baixo no celular');
  assert(/@media \(max-width: 600px\) \{[\s\S]*#product-dialog \.view-tabs \{ top: 8px; left: 16px; \}[\s\S]*#product-dialog \.image-area \{ inset: 66px 0 10px; gap: 8px; \}/.test(css), 'no celular, o Foto | 3D acima da foto, alinhado ao painel');
  assert(css.includes('@media (max-width: 374px) { #product-dialog .viewer-tools [data-camera="reset"] { display: none; } }'));
}

// As lâmpadas no celular (visual 2): a foto continua grande e o texto com o kit rola embaixo dela; o que rola se dissolve na barra (visual 17).
assert(/@media \(max-width: 600px\) \{[\s\S]*#product-dialog\[data-fixed\]\[open\] \{ grid-template-rows: auto clamp\(300px, 50dvh, 470px\) minmax\(0, 1fr\) auto; \}/.test(css), 'a foto da lâmpada grande no celular');
assert(css.includes('mask-image: linear-gradient(#000 calc(100% - 26px), transparent); }') && css.includes('.gallery-rail { display: flex; flex-direction: column; justify-content: flex-start;'), 'o fim do texto esmaece e as miniaturas começam no alto');

// Tela baixa até 900 px (usabilidade 1): a janela inteira rola e a compra, recolhida, fica presa embaixo.
{
  const short = css.slice(css.indexOf('@media (max-width: 900px) and (max-height: 560px) {'));
  assert(short.includes('#product-dialog { overflow: hidden auto;') && short.includes('#product-dialog[open] { display: block; }') && short.includes('#product-dialog .modal-actions { position: sticky; bottom: 0; z-index: 5; }'), 'rola, com a compra presa embaixo');
  // as ferramentas do 3D numa linha no alto (em pé, com 4 botões de 44 px, passariam dos 180 px da área no celular deitado)
  assert(short.includes('#product-dialog .viewer-tools { top: 10px; right: 26px; transform: none; flex-direction: row;'), 'as ferramentas do 3D cabem na tela baixa');
  assert((await read('purchase-sheet.js')).includes("const phone = matchMedia('(max-width: 600px), (max-width: 900px) and (max-height: 560px)');"), 'a compra recolhida também na tela baixa');
}
console.log('PASS: product page — one screen (no steps), price with Pix value, colors as an accessible radio group, presets, 3D on color change, info sheet with tabs and Esc order, no invented data, 44px targets, reduced motion, mobile bottom sheet.');
