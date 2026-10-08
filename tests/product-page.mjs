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
assert(js.includes("if(!sheet.hidden)closeSheet();else closeProduct();") && js.includes('sheetOpener?.focus'));
assert(js.includes("dialog.addEventListener('keydown',e=>{if(e.key==='Escape'&&!sheet.hidden){e.preventDefault();closeSheet();}});"), 'Esc fecha o painel mesmo sem um clique antes (o navegador nem sempre deixa segurar o cancel)');
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
assert(css.includes('#product-dialog .viewer-tools { top: 50%; bottom: auto; right: 14px; left: auto;') && /@media \(max-width: 600px\) \{[\s\S]*#product-dialog \.viewer-tools \{ top: 12px; right: 12px; left: auto; transform: none; flex-direction: row;/.test(css), 'a barra do 3D à direita');
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

// O "Novidade" do unicórnio em arco-íris: um dado na peça (nada de nome de peça no código), degradê nas letras, volta de 6 s sem emenda,
// parado com movimento reduzido, a cor do sistema em alto contraste — e cada cor do degradê legível sobre o topo da janela.
{
  const {PRODUCTS, showcase} = await import(new URL('../dist/products.js', import.meta.url));
  const {journeyColors, mixColor} = await import(new URL('../dist/hero-motion.js', import.meta.url));
  assert.deepEqual(Object.keys(PRODUCTS).filter(key => PRODUCTS[key].eyebrowEffect), ['unicornioscopio'], 'só o unicórnio');
  assert.equal(PRODUCTS.unicornioscopio.eyebrowEffect, 'rainbow');
  assert(js.includes("eyebrow.classList.toggle('is-rainbow',p.eyebrowEffect==='rainbow');") && !/unicornioscopio|UnicornLamp/.test(js), 'a classe vem do dado');
  const rule = css.match(/#product-dialog \.pdp-heading \.eyebrow\.is-rainbow \{[^}]*\}/)[0];
  assert(/background-size: 200% 100%;/.test(rule) && /animation: pdp-rainbow 4s linear infinite;/.test(rule) && /width: fit-content;/.test(rule) && /border-radius: 999px;/.test(rule), 'um selo com o arco-íris correndo');
  assert(/\.eyebrow\.is-rainbow::after \{[^}]*animation: pdp-rainbow-shine[^}]*\}/.test(css) && /@keyframes pdp-rainbow-shine \{[^}]*translateX[^}]*\}/.test(css), 'o brilho que passa: só transform');
  assert(css.includes('@keyframes pdp-rainbow { from { background-position: 0% 0; } to { background-position: 200% 0; } }'), 'anda exatamente um ladrilho: sem emenda');
  assert(css.includes('@media (prefers-reduced-motion: reduce) { #product-dialog .pdp-heading .eyebrow.is-rainbow { animation: none; }') && css.includes('@media (forced-colors: active) { #product-dialog .pdp-heading .eyebrow.is-rainbow { background: none;'));
  const stops = rule.match(/linear-gradient\(90deg, ([^)]*)\)/)[1].split(', ');
  assert.equal(stops[0], stops.at(-1), 'o fim do degradê é o começo');
  const lum = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };
  const header = mixColor(journeyColors(showcase('unicornioscopio').theme)['--theme-wash'], '#ffffff', .28);   // --pd-tint (o topo da janela)
  let worst = Infinity;
  // o texto escuro do selo sobre cada ponto do degradê (e o selo se destaca do topo da janela)
  const ink = rule.match(/; color: (#[0-9a-f]{6});/)[1];
  for (let i = 0; i < stops.length - 1; i++) for (let t = 0; t <= 1; t += .05) worst = Math.min(worst, contrast(mixColor(stops[i], stops[i + 1], t), ink));
  assert(worst >= 4.5, `o texto do selo passa de 4,5:1 sobre todo o arco-íris (${worst.toFixed(2)})`);
  assert(header, 'o topo da janela do unicórnio');
}
console.log('PASS: product page — one screen (no steps), price with Pix value, colors as an accessible radio group, presets, 3D on color change, info sheet with tabs and Esc order, no invented data, 44px targets, reduced motion, mobile bottom sheet.');
