import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';

// Galeria de fotos da aba Foto: miniaturas à esquerda e a foto grande no computador, arrastar de lado com pontinhos no celular.
// No padrão de 4 por peça — frente, três quartos, costas e um detalhe de perto —, todas 4:5 e com a peça do mesmo tamanho. Desde
// 05/10/2026 são renders do modelo 3D (tools/render-vistas: luz de estúdio, cores da vitrine), feitos fora do navegador de quem compra.
const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const [html, controller, gallery, viewer, css, generator, page, i18n, fotosJson, landingCss] = await Promise.all(['dist/index.html', 'dist/controller.js', 'dist/gallery.js', 'dist/viewer.js', 'dist/product-page.css', 'tools/galeria-vistas/gerar.cjs', 'tools/galeria-vistas/vistas.html', 'dist/i18n-core.js', 'design/vistas/fotos.json', 'dist/product-landing.css'].map(read));
const {STANDARD, GALLERY, VIEWS_VERSION, viewsOf, hasGallery, staticViews} = await import('../dist/gallery.js');
const {translations} = await import('../dist/translations.js');
const {PRODUCTS, SOON, PALETTE} = await import('../dist/products.js');
const fotos = JSON.parse(fotosJson);
const dialog = html.match(/<dialog id="product-dialog"[\s\S]*?<\/dialog>/)[0];

// Marcação: a galeria no lugar da foto única (sem a peça na pilastra), com miniaturas, faixa que rola, setas e pontinhos.
assert(!dialog.includes('id="dialog-image"') && !controller.includes('#dialog-image'), 'sem a foto única da peça na pilastra');
assert(dialog.includes('<div class="image-area gallery" role="region" aria-roledescription="galeria" aria-label="Vistas da peça">'));
for (const part of ['class="gallery-rail" role="group" aria-label="Escolher a vista"', 'class="gallery-track" tabindex="0"', 'data-step="-1" aria-label="Vista anterior"', 'data-step="1" aria-label="Próxima vista"', 'class="gallery-dots" role="group" aria-label="Escolher a vista"']) assert(dialog.includes(part), part);

// Só FOTOS REAIS (06/10/2026: "tem que ser as fotos reais" — nem render nem imagem gerada): as do Luiz em três vistas, 4 por peça, nesta
// ordem; cada peça só diz o nome do detalhe dela. O macaco, sem fotos reais, mostra só a da vitrine.
const keys = [...Object.keys(PRODUCTS), ...Object.keys(SOON)];
assert.deepEqual([...keys].sort(), ['aviaoscopia', 'borboletoscopio', 'dinossauroscopio', 'girafoscopio', 'macacoscopio', 'unicornioscopio']);
const standardIds = ['frente', 'tres-quartos', 'costas', 'detalhe'];
assert.deepEqual(STANDARD.map(([id]) => id), standardIds, 'o padrão: frente, três quartos, costas e um detalhe de perto');
// A girafa (07/10/2026): ainda sem peça impressa, as imagens do render que o dono mandou — de frente, de lado (no lugar da de três
// quartos) e de costas, e o rosto de perto saindo da de frente.
const photoPieces = ['aviaoscopia', 'borboletoscopio', 'dinossauroscopio'];
assert.deepEqual(Object.keys(GALLERY).sort(), [...photoPieces, 'girafoscopio'], 'as três peças com fotos reais e a girafa');
assert.deepEqual(viewsOf('girafoscopio').map(v => v.id), ['frente', 'lado', 'costas', 'detalhe'], 'a girafa: frente, lado, costas e o rosto de perto');
for (const key of Object.keys(GALLERY)) {
  const ids = viewsOf(key).map(v => v.id), specs = ids.map(id => fotos[key][id]);
  // recortadas do fundo delas (preto ou claro); a fonte é a foto do Luiz (a girafa: as imagens que o dono mandou). O avião de frente
  // e a cabine de perto (07/10/2026: "a imagem de frente, você pode usar simplesmente a que está na vitrine"): a foto da vitrine,
  // ampliada, já sem fundo.
  const showcaseViews = key === 'aviaoscopia' ? ['frente', 'detalhe'] : [];
  assert(ids.every(id => showcaseViews.includes(id) ? fotos[key][id].fundo === 'transparente' && fotos[key][id].fonte === 'design/vistas/ampliadas/aviaoscopia-vitrine-x4.webp'
    : fotos[key][id].fundo === 'recortar' && (photoPieces.includes(key) ? fotos[key][id].fonte === `${key}-3-vistas.webp` : fotos[key][id].fonte.startsWith(`${key}-`))), `${key}: as fotos, recortadas`);
  assert(!/render/.test(JSON.stringify(specs)), `${key}: nada do render do visualizador do site`);
  assert.deepEqual(viewsOf(key).filter(v => v.zoom).map(v => v.id), ids.filter(id => fotos[key][id].detalhe), `${key}: as fotos de perto são as de zoom (enchem o quadro)`);
  // no branco puro (07/10/2026: "FUNDO BRANCO nas imagens"), como nas lojas grandes: sem transparência
  for (const id of ids) { const b = Buffer.from(await readFile(new URL(`../dist/assets/vistas/${key}-${id}.webp`, import.meta.url))); assert(!(b.toString('latin1', 12, 16) === 'VP8X' && (b[20] & 0x10)), `${key}-${id}: no fundo branco (sem transparência)`); }
  if (photoPieces.includes(key)) assert.deepEqual(ids, standardIds, `${key}: as 4 fotos do padrão`);
  assert.deepEqual(Object.keys(fotos[key]).filter(id => !id.startsWith('_') && id !== 'cores'), ids, `${key}: fotos.json com as fotos da galeria, na ordem`);
  assert(/ de perto$/.test(viewsOf(key).at(-1).name) && fotos[key].detalhe.detalhe === true, `${key}: o detalhe de perto`);
  const [, , w, h] = fotos[key].detalhe.recorte; assert(Math.abs(w / h - .8) < .01, `${key}: o recorte do detalhe é 4:5, como o quadro`);
  for (const v of viewsOf(key)) assert(translations[v.name], `${key}: "${v.name}" traduzido`);
  for (const id of ids) await stat(new URL(fotos[key][id].fundo === 'transparente' ? `../${fotos[key][id].fonte}` : `../design/vistas/${fotos[key][id].fonte}`, import.meta.url));
}
for (const key of ['macacoscopio', 'unicornioscopio']) assert(!hasGallery(key) && viewsOf(key).map(v => v.id).join() === 'frente', `${key}, sem fotos reais ainda: só a foto da vitrine`);
assert(!hasGallery('unicornio') && viewsOf('unicornio').map(v => v.id).join() === 'frente', 'peça sem fotos nem modelo: só a foto da vitrine');
// Nas cores da vitrine (07/10/2026: "preciso que as imagens estejam todas nas cores que ela é originalmente"): as fotos reais foram
// feitas com peças de outras cores; cada regra de "cores" leva uma cor da foto para a da paleta (a borboleta, para o verde do render da
// vitrine, mais verde que a amostra), e as regras que valem só numa parte dizem a área dela em todas as vistas.
// a cor média de cada parte na foto da vitrine (medida em OKLab, 07/10/2026): a peça sai, em média, com a claridade, a saturação e o
// matiz da vitrine
const showcaseTone = {borboletoscopio: {mint: '#5bc091', yellow: '#f3da3e'}, dinossauroscopio: {moss: '#687560', cream: '#cabc77'}, aviaoscopia: {blue: '#1f41a6', red: '#dd2e42', yellow: '#eaab39'}};
for (const key of photoPieces) {
  const rules = fotos[key].cores, targets = rules.map(rule => rule.para);
  for (const rule of rules) {
    assert(/^#[0-9a-f]{6}$/i.test(rule.de) && (PALETTE.some(p => p.id === rule.para) || /^#[0-9a-f]{6}$/i.test(rule.para)), `${key}: regra de cor ${JSON.stringify(rule)}`);
    for (const area of [rule.so, rule.exceto].filter(Boolean)) for (const id of standardIds.filter(id => fotos[key][id].fundo === 'recortar')) assert(Array.isArray(fotos[key][id].areas?.[area]), `${key}-${id}: a área "${area}"`);
  }
  for (const part of PRODUCTS[key].parts) assert(targets.includes(showcaseTone[key]?.[part.default] || part.default), `${key}: ${part.name} na cor de fábrica (${part.default})`);
}
assert(page.includes("import {PRODUCTS,SOON,PALETTE} from '/dist/products.js';") && page.includes('function recolor(canvas,[x,y],rules,areas={})') && page.includes('if(fotos[key].cores)recolor(crop,rect,fotos[key].cores,areas);'), 'o gerador troca as cores (OKLab, mantendo a luz)');
// A base da girafa é redonda e encosta no reflexo: o chão é uma linha por vários pontos (em ordem de x), não uma altura só.
assert(page.includes('while(j<floor.length-1&&sx>floor[j][0])j++;'), 'chão por vários pontos');
for (const id of ['frente', 'lado', 'costas']) { const line = fotos.girafoscopio[id].chao; assert(Array.isArray(line) && line.length > 10 && line.every((p, i) => !i || p[0] > line[i - 1][0]), `girafoscopio-${id}: o chão segue a curva da base`); }
// Zoom óptico (07/10/2026): as fontes ampliadas 4x pelo Real-ESRGAN, com as medidas de fotos.json em pixels da original; o recorte
// entra um pouco na peça (sem o fio escuro do fundo), a claridade passa por uma curva (sem estourar em branco) e a cor nova cabe na tela.
for (const [fonte, sr] of Object.entries(fotos._ampliadas)) { assert(sr.fator === 4 && sr.arquivo.startsWith('ampliadas/'), fonte); await stat(new URL(`../design/vistas/${sr.arquivo}`, import.meta.url)); }
for (const key of Object.keys(GALLERY)) for (const id of viewsOf(key).map(v => v.id)) if (fotos[key][id].fundo === 'recortar') assert(fotos._ampliadas[fotos[key][id].fonte], `${key}-${id}: da fonte ampliada`);
assert(page.includes("const sr=spec.t==null?fotos._ampliadas?.[spec.fonte]:null") && page.includes('if(opts.encolher>0)') && page.includes('function fitted(L,C,h)') && page.includes("rule.contraste!=null?dL+(L-sL)*rule.contraste:L<=sL?L*dL/sL:dL+(L-sL)*(1-dL)/(1-sL)"), 'ampliadas, encolher, a curva da claridade e a cor dentro da tela');
assert(page.includes('const we=w*(1-taken);') && page.includes('for(const poly of opts.manter||[])'), 'o peso que sobra passa para a regra seguinte; "manter" protege o creme claro do avião');
assert(page.includes('function onWhite(canvas)') && page.includes('encode(photo,.93)') && page.includes('encode(resample(photo,[0,0,...FRAME],...MINI),.88)'), 'as fotos e as miniaturas saem no branco');
// Uma foto (1200 x 1500) e uma miniatura (160 x 200) de cada vista: o mesmo quadro 4:5 em todas.
let total = 0;
for (const key of keys) for (const item of staticViews(key)) {
  assert.equal(item.src, `assets/vistas/${key}-${item.id}.webp?v=${VIEWS_VERSION}`);
  for (const [src, size, max] of [[item.src, [1200, 1500], 200000], [item.thumb, [160, 200], 16000]]) {
    const file = new URL(`../dist/${src.split('?')[0]}`, import.meta.url), bytes = (await stat(file)).size, data = Buffer.from(await readFile(file));
    assert.equal(data.toString('latin1', 0, 4) + data.toString('latin1', 8, 12), 'RIFFWEBP', `${src} é WebP`);
    // tamanho: no VP8X, largura e altura menos um em 24 bits nos bytes 24 a 29; no VP8, 14 bits nos bytes 26 a 29
    const dims = data.toString('latin1', 12, 16) === 'VP8X' ? [data.readUIntLE(24, 3) + 1, data.readUIntLE(27, 3) + 1] : [data.readUInt16LE(26) & 0x3fff, data.readUInt16LE(28) & 0x3fff];
    assert.deepEqual(dims, size, `${src}: ${size.join(' x ')} px`);
    assert(bytes < max, `${src} leve (${bytes} B)`);
    total += bytes;
  }
}
assert(total < 4000000, `as imagens somam menos de 4 MB (${total} B)`);

// Controlador: a galeria troca com a peça, com a cor do fundo das fotos; sem nota embaixo da foto; cor leva ao 3D.
assert(controller.includes("import {staticViews,createGallery} from './gallery.js';"));
assert(controller.includes("gallery.set(staticViews(key).map(item=>({...item,alt:`${p.title} — ${item.name}`})));"));
assert(controller.includes("$('.view-note').textContent=next==='photo'?'':") && !controller.includes('foto real'), 'na aba Foto, sem nota embaixo da foto');
assert(/if\(view!=='model'\)setView\('model'\)/.test(controller), 'escolher uma cor leva ao 3D');
assert(!/renderViews|createObjectURL/.test(controller + gallery + viewer), 'nada de gerar imagem no navegador de quem compra');

// Galeria: arrastar, teclado, miniaturas (passar o mouse), pontinhos, setas; com uma foto só, nada disso aparece.
for (const part of ["track.addEventListener('scroll'", "{ArrowLeft:-1,ArrowRight:1}[e.key]", "e.key==='Home'||e.key==='End'", "rail.addEventListener('pointermove'", "e.pointerType==='mouse'", "prev.disabled=index===0;next.disabled=index===items.length-1;", "slide.setAttribute('aria-roledescription','vista')", "matchMedia('(prefers-reduced-motion: reduce)')", "root.toggleAttribute('data-single',list.length<2)"]) assert(gallery.includes(part), part);

// CSS: miniaturas à esquerda no computador; no celular, a faixa inteira e pontinhos com 24 px de toque; o fundo das fotos em volta delas.
assert(css.includes('#product-dialog .image-area { position: absolute; inset: 70px 24px 24px 18px; width: auto; height: auto; padding: 0; display: grid; grid-template-columns: 64px minmax(0, 1fr);'));
assert(css.includes('.gallery-track { position: absolute; inset: 0; display: flex; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory;'));
assert(/@media \(max-width: 900px\) \{[\s\S]*\.gallery-rail, \.gallery-arrows \{ display: none; \}[\s\S]*\.gallery-dots button \{ display: grid; place-items: center; width: 24px; height: 24px;/.test(css));
assert(/\.gallery-main \{[^}]*border: 1px solid var\(--pd-line\);[^}]*background: #fff;/.test(css) && css.includes('#product-dialog .gallery :is(.gallery-slide, .gallery-rail button).is-zoom img { object-fit: cover; object-position: 50% 0; }') && /#product-dialog .gallery img {[^}]*mix-blend-mode: normal; -webkit-mask-image: none; mask-image: none;/.test(css), 'as fotos num painel branco (sem emenda com o branco delas); as de perto enchem o painel');
assert(/@media \(max-width: 900px\) \{[\s\S]*\.gallery-main \{ margin: 0 16px; border-radius: 20px;[^}]*\}\r?\n  \.gallery-slide \{ padding: 0; \}/.test(css), 'no tablet e no celular, o painel branco com margem dos lados');
// A página da peça: o quadro da foto real branco, com borda (a foto, opaca, não cobre a borda), a foto inteira e sem a sombra do
// contorno (marcaria o retângulo); as miniaturas brancas, com folga para a sombra da escolhida.
assert(landingCss.includes('.pl-art.is-real { border: 1px solid #2a1c2214; background: #fff; }') && landingCss.includes('.pl-art.is-real .pl-photo { position: absolute; inset: 0; width: 100%; height: 100%; filter: none; }') && landingCss.includes('.pl-art.is-real[data-view="3d"] { background: radial-gradient('), 'página da peça: o quadro da foto branco');
assert(/\.pl-thumbs button \{[^}]*background: #fff;/.test(landingCss) && landingCss.includes('padding: 3px 3px 16px; margin-bottom: -13px;'), 'página da peça: miniaturas brancas, sombra sem corte');
// A novidade sem venda continua sem os botões de compra no celular (o display: contents do resumo compacto passava por cima).
assert(css.includes('#product-dialog:not([data-mode=preview]) .modal-actions.is-compact :is(#purchase-panel, .purchase-actions) { display: contents; }') && css.includes('#product-dialog[data-mode=preview] :is(.pdp-colors, .pdp-price, #purchase-panel, .pdp-preview) { display: none; }'), 'novidade sem botões de compra no celular');
// Surpreenda-me ao lado das cores, sempre à vista (fora de Combinações).
assert(dialog.includes('<div class="pdp-palette-row"><div id="palette" role="radiogroup" aria-label="Cor da parte"></div><button type="button" class="pdp-surprise" id="surprise">') && controller.includes("PRESETS.filter(preset=>preset.id!=='surpresa')") && controller.includes("$('#surprise').addEventListener('click'"), 'Surpreenda-me ao lado das cores');
assert(css.includes('.gallery[data-single] :is(.gallery-rail, .gallery-arrows, .gallery-dots) { display: none; }'));
assert(css.includes('.gallery-rail button { flex: none; width: 64px; height: 80px;') && gallery.includes('img.width=1200;img.height=1500;') && gallery.includes('img.width=160;img.height=200;'), 'miniaturas e fotos no formato 4:5');
assert(!/\.image-area img \{[^}]*mask-image: radial-gradient/.test(css), 'sem a máscara da foto antiga');
// Celular menos carregado: a dica da parte e as combinações saem da tela (Detalhes/Cores/Entrega/Trocas ficam só no (i) do topo, em todo tamanho).
assert(/@media \(max-width: 600px\) \{[\s\S]*  #product-dialog \.part-hint \{ display: none; \}/.test(css) && dialog.includes('id="pdp-info"'), 'no celular, sem a dica da parte');
assert(controller.includes("const more=$('.pdp-more'),moreHome=more.parentElement,phone=matchMedia('(max-width: 600px)');") && controller.includes("$('#pdp-panel-1').prepend(more)"), 'no celular, combinações e o link das cores vão para a aba Cores do (i)');
assert(css.includes('#product-dialog[data-mode=preview] .pdp-sheet .pdp-more { display: none; }'), 'a novidade sem venda não mostra combinações no (i)');

// Ferramentas: os renders saem do Blender (tools/render-vistas), não do visualizador do site; o gerador leva os renders (ou fotos
// recortadas, se um dia voltarem) de design/vistas como manda fotos.json.
assert(page.includes("await (await fetch('/design/vistas/fotos.json')).json()") && page.includes("spec?.fundo==='render'") && page.includes('const still=async(src,t)=>') && page.includes("else if(v.id==='frente')"));
assert(!/Fotografo|ProductViewer|kit/.test(page + generator), 'o gerador não tira fotos do visualizador do site');
assert(generator.includes('VIEWS_VERSION') && generator.includes("'.mp4': 'video/mp4'"));
// Tradução: nota, rótulos e texto alternativo das fotos.
assert(i18n.includes('(Frente|Três quartos|Lado|Três quartos de trás|Costas|De cima|.+ de perto)'));

console.log(`PASS: photo gallery — 4 photos per piece (the giraffe from the owner's render images), in the showcase colours, on pure white in a white panel and frame, all 4:5 with the piece at the same size (${Object.keys(GALLERY).map(k => `${k} ${viewsOf(k).length}`).join(', ')}; ${Math.round(total / 1024)} KB), cut out of the sources, close-ups filling the frame, showcase photo alone without photos or model, Surpreenda-me beside the colors, cleaner phone screen with the extras in the (i) sheet.`);
