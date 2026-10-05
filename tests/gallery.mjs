import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';

// Galeria de fotos da aba Foto: miniaturas à esquerda e a foto grande no computador, arrastar de lado com pontinhos no celular.
// Fotos reais da peça (04/10/2026: nem o 3D nem imagens geradas), no padrão de 4 por peça — frente, três quartos, costas e um detalhe de
// perto —, todas 4:5 e com a peça do mesmo tamanho; peça sem fotos reais: só a foto da vitrine, no mesmo quadro.
const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const [html, controller, gallery, viewer, css, generator, page, i18n, fotosJson] = await Promise.all(['dist/index.html', 'dist/controller.js', 'dist/gallery.js', 'dist/viewer.js', 'dist/product-page.css', 'tools/galeria-vistas/gerar.cjs', 'tools/galeria-vistas/vistas.html', 'dist/i18n-core.js', 'design/vistas/fotos.json'].map(read));
const {STANDARD, GALLERY, VIEWS_VERSION, viewsOf, realPhotos, staticViews} = await import('../dist/gallery.js');
const {translations} = await import('../dist/translations.js');
const {PRODUCTS, SOON} = await import('../dist/products.js');
const fotos = JSON.parse(fotosJson);
const dialog = html.match(/<dialog id="product-dialog"[\s\S]*?<\/dialog>/)[0];

// Marcação: a galeria no lugar da foto única (sem a peça na pilastra), com miniaturas, faixa que rola, setas e pontinhos.
assert(!dialog.includes('id="dialog-image"') && !controller.includes('#dialog-image'), 'sem a foto única da peça na pilastra');
assert(dialog.includes('<div class="image-area gallery" role="region" aria-roledescription="galeria" aria-label="Vistas da peça">'));
for (const part of ['class="gallery-rail" role="group" aria-label="Escolher a vista"', 'class="gallery-track" tabindex="0"', 'data-step="-1" aria-label="Vista anterior"', 'data-step="1" aria-label="Próxima vista"', 'class="gallery-dots" role="group" aria-label="Escolher a vista"']) assert(dialog.includes(part), part);

// O padrão: 4 fotos por peça, nesta ordem; cada peça só diz o nome do detalhe dela. Cada vista com a fonte e o recorte em fotos.json.
const keys = [...Object.keys(PRODUCTS), ...Object.keys(SOON)];
assert.deepEqual([...keys].sort(), ['aviaoscopia', 'borboletoscopio', 'dinossauroscopio', 'macacoscopio']);
const standardIds = ['frente', 'tres-quartos', 'costas', 'detalhe'];
assert.deepEqual(STANDARD.map(([id]) => id), standardIds, 'o padrão: frente, três quartos, costas e um detalhe de perto');
for (const key of ['borboletoscopio', 'dinossauroscopio', 'aviaoscopia']) {
  assert(realPhotos(key), `${key} tem fotos reais`);
  // fundo claro: todas as fotos saem recortadas do fundo delas (preto ou claro) e ficam direto no fundo da página, com transparência
  assert(Object.values(fotos[key]).every(f => f.fundo === 'recortar'), `${key}: fotos recortadas`);
  assert.deepEqual(viewsOf(key).filter(v => v.zoom).map(v => v.id), Object.keys(fotos[key]).filter(id => fotos[key][id].detalhe), `${key}: as fotos de perto são as de zoom (enchem o quadro)`);
  for (const id of Object.keys(fotos[key])) { const b = Buffer.from(await readFile(new URL(`../dist/assets/vistas/${key}-${id}.webp`, import.meta.url))); assert(b.toString('latin1', 12, 16) === 'VP8X' && (b[20] & 0x10), `${key}-${id}: sem o fundo preto (com transparência)`); }
  const ids = viewsOf(key).map(v => v.id);
  assert.deepEqual(ids, standardIds, `${key}: as 4 fotos do padrão`);
  assert.deepEqual(Object.keys(fotos[key]).filter(id => !id.startsWith('_')), standardIds, `${key}: fotos.json com as 4 fotos do padrão, na ordem`);
  assert(/ de perto$/.test(viewsOf(key)[3].name) && fotos[key].detalhe.detalhe === true, `${key}: o detalhe de perto`);
  const [, , w, h] = fotos[key].detalhe.recorte; assert(Math.abs(w / h - .8) < .01, `${key}: o recorte do detalhe é 4:5, como o quadro`);
  for (const v of viewsOf(key)) assert(translations[v.name], `${key}: "${v.name}" traduzido`);
  for (const id of ids) { const f = fotos[key][id]; await stat(new URL(`../design/vistas/${f.fonte}`, import.meta.url)); assert(f.recorte.length === 4, `${key}-${id}: recorte`); }
}
assert(!realPhotos('macacoscopio') && viewsOf('macacoscopio').map(v => v.id).join() === 'frente', 'o macaco, sem fotos reais ainda: só a foto da vitrine');
// Uma foto (960 x 1200) e uma miniatura (160 x 200) de cada vista: o mesmo quadro 4:5 em todas.
let total = 0;
for (const key of keys) for (const item of staticViews(key)) {
  assert.equal(item.src, `assets/vistas/${key}-${item.id}.webp?v=${VIEWS_VERSION}`);
  for (const [src, size, max] of [[item.src, [960, 1200], 160000], [item.thumb, [160, 200], 16000]]) {
    const file = new URL(`../dist/${src.split('?')[0]}`, import.meta.url), bytes = (await stat(file)).size, data = Buffer.from(await readFile(file));
    assert.equal(data.toString('latin1', 0, 4) + data.toString('latin1', 8, 12), 'RIFFWEBP', `${src} é WebP`);
    // tamanho: no VP8X, largura e altura menos um em 24 bits nos bytes 24 a 29; no VP8, 14 bits nos bytes 26 a 29
    const dims = data.toString('latin1', 12, 16) === 'VP8X' ? [data.readUIntLE(24, 3) + 1, data.readUIntLE(27, 3) + 1] : [data.readUInt16LE(26) & 0x3fff, data.readUInt16LE(28) & 0x3fff];
    assert.deepEqual(dims, size, `${src}: ${size.join(' x ')} px`);
    assert(bytes < max, `${src} leve (${bytes} B)`);
    total += bytes;
  }
}
assert(total < 1500000, `as imagens somam menos de 1,5 MB (${total} B)`);

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
assert(/.gallery-main {[^}]*background: transparent;/.test(css) && css.includes('#product-dialog .gallery :is(.gallery-slide, .gallery-rail button).is-zoom img { object-fit: cover; object-position: 50% 0; }') && /#product-dialog .gallery img {[^}]*mix-blend-mode: normal; -webkit-mask-image: none; mask-image: none;/.test(css), 'sem quadro em volta das fotos; as de perto enchem a área');
// Surpreenda-me ao lado das cores, sempre à vista (fora de Combinações).
assert(dialog.includes('<div class="pdp-palette-row"><div id="palette" role="radiogroup" aria-label="Cor da parte"></div><button type="button" class="pdp-surprise" id="surprise">') && controller.includes("PRESETS.filter(preset=>preset.id!=='surpresa')") && controller.includes("$('#surprise').addEventListener('click'"), 'Surpreenda-me ao lado das cores');
assert(css.includes('.gallery[data-single] :is(.gallery-rail, .gallery-arrows, .gallery-dots) { display: none; }'));
assert(css.includes('.gallery-rail button { flex: none; width: 64px; height: 80px;') && gallery.includes('img.width=960;img.height=1200;') && gallery.includes('img.width=160;img.height=200;'), 'miniaturas e fotos no formato 4:5');
assert(!/\.image-area img \{[^}]*mask-image: radial-gradient/.test(css), 'sem a máscara da foto antiga');
// Celular menos carregado: a dica da parte, as combinações e Detalhes/Cores/Entrega/Trocas saem da tela; ficam no (i) do topo.
assert(/@media \(max-width: 600px\) \{[\s\S]*\.pdp-facts, #product-dialog \.part-hint \{ display: none; \}/.test(css) && dialog.includes('id="pdp-info"'), 'no celular, as informações ficam só no (i)');
assert(controller.includes("const more=$('.pdp-more'),moreHome=more.parentElement,phone=matchMedia('(max-width: 600px)');") && controller.includes("$('#pdp-panel-1').prepend(more)"), 'no celular, combinações e o link das cores vão para a aba Cores do (i)');
assert(css.includes('#product-dialog[data-mode=preview] .pdp-sheet .pdp-more { display: none; }'), 'a novidade sem venda não mostra combinações no (i)');

// Ferramenta: recorta as fotos e os quadros de vídeo de design/vistas como manda fotos.json; nada de 3D nem de imagem gerada.
assert(page.includes("await (await fetch('/design/vistas/fotos.json')).json()") && page.includes('const still=async(src,t)=>') && page.includes("else if(v.id==='frente')"));
assert(!/Fotografo|ProductViewer|kit/.test(page + generator), 'a ferramenta não tira fotos do 3D');
assert(generator.includes('VIEWS_VERSION') && generator.includes("'.mp4': 'video/mp4'"));
// Tradução: nota, rótulos e texto alternativo das fotos.
assert(i18n.includes('(Frente|Três quartos|Costas|.+ de perto)'));

console.log(`PASS: photo gallery — the 4-photo standard, all 4:5 with the piece at the same size (${Object.keys(GALLERY).map(k => `${k} ${viewsOf(k).length}`).join(', ')}; ${Math.round(total / 1024)} KB), cut out on the page background, close-ups filling the frame, showcase photo alone without real photos, Surpreenda-me beside the colors, cleaner phone screen with the extras in the (i) sheet.`);
