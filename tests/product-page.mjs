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
// Painel com abas: quatro atalhos, setas/Home/End nas abas, Esc fecha primeiro o painel e devolve o foco.
assert.equal((dialog.match(/data-sheet="\d"/g) || []).length, 4);
assert.equal((dialog.match(/role="tab"/g) || []).length, 4);
assert(js.includes("if(!sheet.hidden)closeSheet();else closeProduct();") && js.includes('sheetOpener?.focus'));
assert(js.includes("['ArrowLeft','ArrowRight','Home','End']"));
// Sem dados inventados: trocas apontam para a política real; nada de "a confirmar".
assert(dialog.includes('href="trocas.html"') && !/a confirmar|compatível com/i.test(dialog));
// Toque e movimento.
assert(/#product-dialog \.swatch \{ width: 44px; height: 44px;/.test(css), 'cores com 44 px de área de toque');
assert(/\.pdp-sheet-tabs button \{ min-height: 44px;/.test(css) && /\.pdp-sheet-close \{ width: 44px; height: 44px;/.test(css));
assert(/@media \(prefers-reduced-motion: reduce\) \{\s*\.pdp-sheet/.test(css));
assert(/@media \(max-width: 600px\) \{[\s\S]*\.pdp-sheet \{ top: auto; left: 0;/.test(css), 'no celular o painel sobe de baixo');
assert(html.includes('<link rel="stylesheet" href="product-page.css">'));

// Versão de 01/10/2026: a peça no centro, com as cores logo abaixo dela (partes + fileira com rolagem lateral);
// "Surpreenda-me" virou um balão no canto da peça; "Mais sobre a peça" no fim, com uma linha de resumo por atalho.
const visual = dialog.match(/<div class="detail-visual">[\s\S]*?<div class="detail-copy">/)[0];
assert(/<div class="pdp-stage">[\s\S]*<button type="button" class="pdp-surprise" id="surprise-me">[\s\S]*<\/div>\s*<section class="pdp-colors"/.test(visual), 'balão no palco da peça; cores logo abaixo');
assert(visual.includes('id="part-tabs"') && /<div class="pdp-rail">.*<div id="palette" role="radiogroup"/.test(visual), 'partes e fileira de cores embaixo da peça');
assert(!dialog.includes('pdp-preview'), 'sem o selo "Suas cores" (as cores já aparecem embaixo da peça)');
assert(js.includes("PRESETS.filter(preset=>preset.id!=='surpresa')") && js.includes("applyPreset('surpresa')"), 'Surpreenda-me sai das combinações e vai para o balão');
assert(/#product-dialog #palette \{[^}]*flex-wrap: nowrap;[^}]*overflow-x: auto;/.test(css) && /scroll-snap-align: center;/.test(css), 'cores em rolagem lateral');
assert(js.includes('requestAnimationFrame(revealColor)') && js.includes("rail.toggleAttribute('data-start'"), 'a cor escolhida fica à vista; as bordas mostram que há mais cores');
assert(/@media \(hover: none\) \{ \.pdp-rail-nav \{ display: none; \} \}/.test(css), 'setas só onde há mouse; no celular, o dedo');
assert(/\.pdp-surprise \{[^}]*min-height: 44px;/.test(css) && /\.pdp-presets button::before \{ content: ''; position: absolute; inset: -4px 0; \}/.test(css), '44 px de toque no balão e nas combinações');
assert(/prefers-reduced-motion: reduce\) \{[^}]*\.pdp-surprise[^}]*\}\s*\.pdp-surprise, \.pdp-surprise\.is-pop svg \{ animation: none; \}/.test(css), 'balão sem animação com movimento reduzido');
assert.equal((dialog.match(/class="pdp-fact-text"/g) || []).length, 4, 'cada atalho com uma linha de resumo');
assert(js.includes("$('#pdp-fact-delivery').textContent=`Produção em ${COMMERCE.productionLabel}`"), 'o prazo vem de commerce-config.js');
assert(/@media \(max-width: 600px\) \{[\s\S]*#product-dialog\[open\] \{ grid-template-rows: auto minmax\(0, 1fr\) auto; \}/.test(css), 'no celular as cores ficam fixas entre a peça e o texto que rola');

console.log('PASS: product page — one screen (no steps), piece in the center with the colors right below (side-scrolling rail), "Surpreenda-me" balloon, summaries at the end, price with Pix value, colors as an accessible radio group, presets, 3D on color change, info sheet with tabs and Esc order, no invented data, 44px targets, reduced motion, mobile bottom sheet.');
