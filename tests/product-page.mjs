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
// Na aba Foto (galeria de vistas), escolher uma cor repinta as vistas nas cores escolhidas, sem pular para o 3D (tests/gallery.mjs).
assert(js.includes("announce(message);if(view==='photo')paintGallery();}") && !/if\(view!=='model'\)setView\('model'\)/.test(js));
// Preço no Pix com a mesma regra do servidor (pixDiscountBps).
assert(js.includes("cents-Math.round(cents*COMMERCE.pixDiscountBps/10000)") && js.includes('no Pix`'));
// Cores como grupo de opções acessível: role=radio, aria-checked, tabindex itinerante e setas.
assert(dialog.includes('id="palette" role="radiogroup"') && js.includes("b.setAttribute('role','radio')") && js.includes("b.tabIndex=on?0:-1") && /ArrowLeft','ArrowRight','ArrowUp','ArrowDown'/.test(js));
// Combinações prontas.
for (const [id, name] of [['original', 'Original'], ['pastel', 'Pastel'], ['vibrante', 'Vibrante'], ['surpresa', 'Surpreenda-me']]) assert(js.includes(`{id:'${id}',name:'${name}'`), name);
// Painel com abas: quatro atalhos, setas/Home/End nas abas, Esc fecha primeiro o painel e devolve o foco.
assert.equal((dialog.match(/data-sheet="\d"/g) || []).length, 4);
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
assert(css.includes('#product-dialog[data-mode=preview] :is(.pdp-colors, .pdp-facts, .pdp-price, #purchase-panel, .pdp-preview) { display: none; }'), 'novidade: sem escolha de cor, preço nem compra');

console.log('PASS: product page — one screen (no steps), price with Pix value, colors as an accessible radio group, presets, the photo gallery repainted on color change, info sheet with tabs and Esc order, no invented data, 44px targets, reduced motion, mobile bottom sheet.');
