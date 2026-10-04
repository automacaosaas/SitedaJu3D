import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';

// Galeria de fotos da aba Foto: miniaturas à esquerda e a foto grande no computador, arrastar de lado com pontinhos no celular.
// Fotos reais da peça (04/10/2026: nem o 3D nem imagens geradas), com detalhes de perto; peça sem fotos reais: só a foto da vitrine.
const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const [html, controller, gallery, viewer, css, generator, page, i18n, fotosJson] = await Promise.all(['dist/index.html', 'dist/controller.js', 'dist/gallery.js', 'dist/viewer.js', 'dist/product-page.css', 'tools/galeria-vistas/gerar.cjs', 'tools/galeria-vistas/vistas.html', 'dist/i18n-core.js', 'design/vistas/fotos.json'].map(read));
const {GALLERY, VIEWS_VERSION, viewsOf, realPhotos, galleryBg, staticViews} = await import('../dist/gallery.js');
const {PRODUCTS, SOON} = await import('../dist/products.js');
const fotos = JSON.parse(fotosJson);
const dialog = html.match(/<dialog id="product-dialog"[\s\S]*?<\/dialog>/)[0];

// Marcação: a galeria no lugar da foto única (sem a peça na pilastra), com miniaturas, faixa que rola, setas e pontinhos.
assert(!dialog.includes('id="dialog-image"') && !controller.includes('#dialog-image'), 'sem a foto única da peça na pilastra');
assert(dialog.includes('<div class="image-area gallery" role="region" aria-roledescription="galeria" aria-label="Vistas da peça">'));
for (const part of ['class="gallery-rail" role="group" aria-label="Escolher a vista"', 'class="gallery-track" tabindex="0"', 'data-step="-1" aria-label="Vista anterior"', 'data-step="1" aria-label="Próxima vista"', 'class="gallery-dots" role="group" aria-label="Escolher a vista"']) assert(dialog.includes(part), part);

// As fotos reais: cada peça com o fundo das fotos e as vistas, na ordem; cada vista com a fonte e o recorte em design/vistas/fotos.json.
const keys = [...Object.keys(PRODUCTS), ...Object.keys(SOON)];
assert.deepEqual([...keys].sort(), ['aviaoscopia', 'borboletoscopio', 'dinossauroscopio', 'macacoscopio']);
for (const key of ['borboletoscopio', 'dinossauroscopio', 'aviaoscopia']) {
  assert(realPhotos(key), `${key} tem fotos reais`);
  assert.match(galleryBg(key), /^#[0-9a-f]{6}$/, `${key}: cor do fundo das fotos`);
  const ids = viewsOf(key).map(v => v.id);
  assert(ids[0] === 'frente' && ids.length >= 5 && ids.filter(id => fotos[key][id]?.recorte).length === ids.length, `${key}: frente primeiro, mais ângulos e detalhes de perto, todos com recorte`);
  assert(viewsOf(key).some(v => / de perto$/.test(v.name)), `${key}: detalhes de perto`);
  for (const id of ids) { const f = fotos[key][id]; await stat(new URL(`../design/vistas/${f.fonte}`, import.meta.url)); assert(f.recorte.length === 4, `${key}-${id}: recorte`); }
}
assert.deepEqual(viewsOf('dinossauroscopio').slice(0, 5).map(v => v.id), ['frente', 'tres-quartos', 'lado', 'tras', 'costas'], 'o dinossauro em cinco ângulos, do vídeo dele girando');
assert(!realPhotos('macacoscopio') && viewsOf('macacoscopio').map(v => v.id).join() === 'frente', 'o macaco, sem fotos reais ainda: só a foto da vitrine');
// Uma foto (lado maior 1000 px) e uma miniatura (200 px) de cada vista.
let total = 0;
for (const key of keys) for (const item of staticViews(key)) {
  assert.equal(item.src, `assets/vistas/${key}-${item.id}.webp?v=${VIEWS_VERSION}`);
  for (const [src, size, max] of [[item.src, 1000, 160000], [item.thumb, 200, 16000]]) {
    const file = new URL(`../dist/${src.split('?')[0]}`, import.meta.url), bytes = (await stat(file)).size, data = Buffer.from(await readFile(file));
    assert.equal(data.toString('latin1', 0, 4) + data.toString('latin1', 8, 12), 'RIFFWEBP', `${src} é WebP`);
    // tamanho: no VP8X, largura e altura menos um em 24 bits nos bytes 24 a 29; no VP8, 14 bits nos bytes 26 a 29
    const dims = data.toString('latin1', 12, 16) === 'VP8X' ? [data.readUIntLE(24, 3) + 1, data.readUIntLE(27, 3) + 1] : [data.readUInt16LE(26) & 0x3fff, data.readUInt16LE(28) & 0x3fff];
    assert.equal(Math.max(...dims), size, `${src}: lado maior de ${size} px`);
    assert(bytes < max, `${src} leve (${bytes} B)`);
    total += bytes;
  }
}
assert(total < 1500000, `as imagens somam menos de 1,5 MB (${total} B)`);

// Controlador: a galeria troca com a peça, com a cor do fundo das fotos; a nota diz a vista e que é foto real; cor leva ao 3D.
assert(controller.includes("import {staticViews,createGallery,realPhotos,galleryBg} from './gallery.js';"));
assert(controller.includes("$('.image-area').style.setProperty('--gallery-bg',galleryBg(key)||null);gallery.set(staticViews(key).map(item=>({...item,alt:`${p.title} — ${item.name}`})));"));
assert(controller.includes("${realPhotos(activeProduct)?'foto real':preview()?'cores da peça':'cores da vitrine'}"), 'a nota diz a vista e que é foto real');
assert(/if\(view!=='model'\)setView\('model'\)/.test(controller), 'escolher uma cor leva ao 3D');
assert(!/renderViews|createObjectURL/.test(controller + gallery + viewer), 'nada de gerar imagem no navegador de quem compra');

// Galeria: arrastar, teclado, miniaturas (passar o mouse), pontinhos, setas; com uma foto só, nada disso aparece.
for (const part of ["track.addEventListener('scroll'", "{ArrowLeft:-1,ArrowRight:1}[e.key]", "e.key==='Home'||e.key==='End'", "rail.addEventListener('pointermove'", "e.pointerType==='mouse'", "prev.disabled=index===0;next.disabled=index===items.length-1;", "slide.setAttribute('aria-roledescription','vista')", "matchMedia('(prefers-reduced-motion: reduce)')", "root.toggleAttribute('data-single',list.length<2)"]) assert(gallery.includes(part), part);

// CSS: miniaturas à esquerda no computador; no celular, a faixa inteira e pontinhos com 24 px de toque; o fundo das fotos em volta delas.
assert(css.includes('#product-dialog .image-area { position: absolute; inset: 70px 24px 46px 18px; width: auto; height: auto; padding: 0; display: grid; grid-template-columns: 64px minmax(0, 1fr);'));
assert(css.includes('.gallery-track { position: absolute; inset: 0; display: flex; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory;'));
assert(/@media \(max-width: 900px\) \{[\s\S]*\.gallery-rail, \.gallery-arrows \{ display: none; \}[\s\S]*\.gallery-dots button \{ display: grid; place-items: center; width: 24px; height: 24px;/.test(css));
assert(css.includes('background: var(--gallery-bg, var(--pd-stage))') && /#product-dialog \.gallery img \{[^}]*mix-blend-mode: normal;/.test(css), 'em volta das fotos, a cor do fundo delas');
assert(css.includes('.gallery[data-single] :is(.gallery-rail, .gallery-arrows, .gallery-dots) { display: none; }'));
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
assert(i18n.includes('(.+) · (foto real|cores da vitrine|cores da peça)') && i18n.includes('(Frente|Três quartos|Lado|Costas|Três quartos de trás|.+ de perto)'));

console.log(`PASS: photo gallery — real photos with close-ups (${Object.keys(GALLERY).map(k => `${k} ${viewsOf(k).length}`).join(', ')}; ${Math.round(total / 1024)} KB), the photo background around them, showcase photo alone without real photos, cleaner phone screen with the extras in the (i) sheet.`);
