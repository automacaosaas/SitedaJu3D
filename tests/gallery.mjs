import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';

// Galeria de fotos da aba Foto (pedido do Luiz, 04/10/2026): miniaturas à esquerda e a foto grande no computador, arrastar de lado com
// pontinhos no celular. Fotos de produto nas cores da vitrine (a primeira é a própria foto da vitrine); o 3D continua na aba ao lado.
const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const [html, controller, gallery, viewer, css, generator, page, i18n] = await Promise.all(['dist/index.html', 'dist/controller.js', 'dist/gallery.js', 'dist/viewer.js', 'dist/product-page.css', 'tools/galeria-vistas/gerar.cjs', 'tools/galeria-vistas/vistas.html', 'dist/i18n-core.js'].map(read));
const {VIEWS, VIEWS_VERSION, staticViews} = await import('../dist/gallery.js');
const {PRODUCTS, SOON} = await import('../dist/products.js');
const dialog = html.match(/<dialog id="product-dialog"[\s\S]*?<\/dialog>/)[0];

// Marcação: a galeria no lugar da foto única (sem a peça na pilastra), com miniaturas, faixa que rola, setas e pontinhos.
assert(!dialog.includes('id="dialog-image"') && !controller.includes('#dialog-image'), 'sem a foto única da peça na pilastra');
assert(dialog.includes('<div class="image-area gallery" role="region" aria-roledescription="galeria" aria-label="Vistas da peça">'));
for (const part of ['class="gallery-rail" role="group" aria-label="Escolher a vista"', 'class="gallery-track" tabindex="0"', 'data-step="-1" aria-label="Vista anterior"', 'data-step="1" aria-label="Próxima vista"', 'class="gallery-dots" role="group" aria-label="Escolher a vista"']) assert(dialog.includes(part), part);

// Três fotos por peça, como as do Luiz: frente (a primeira, a da vitrine), três quartos e costas.
assert.deepEqual(VIEWS.map(v => v.id), ['frente', 'tres-quartos', 'costas']);
for (const view of VIEWS) assert(Number.isFinite(view.az) && Number.isFinite(view.el) && view.name, view.id);
// Uma foto (1000 px) e uma miniatura (200 px) de cada vista, para as quatro peças (o macaco também, nas cores fixas).
const keys = [...Object.keys(PRODUCTS), ...Object.keys(SOON)];
assert.deepEqual([...keys].sort(), ['aviaoscopia', 'borboletoscopio', 'dinossauroscopio', 'macacoscopio']);
let total = 0;
for (const key of keys) for (const item of staticViews(key)) {
  assert.equal(item.src, `assets/vistas/${key}-${item.id}.webp?v=${VIEWS_VERSION}`);
  for (const [src, size, max] of [[item.src, 1000, 160000], [item.thumb, 200, 16000]]) {
    const file = new URL(`../dist/${src.split('?')[0]}`, import.meta.url), bytes = (await stat(file)).size, data = Buffer.from(await readFile(file));
    assert.equal(data.toString('latin1', 0, 4) + data.toString('latin1', 8, 12), 'RIFFWEBP', `${src} é WebP`);
    // tamanho: no VP8X (com transparência), largura e altura menos um em 24 bits nos bytes 24 a 29; no VP8 (sem), 14 bits nos bytes 26 a 29
    const dims = data.toString('latin1', 12, 16) === 'VP8X' ? [data.readUIntLE(24, 3) + 1, data.readUIntLE(27, 3) + 1] : [data.readUInt16LE(26) & 0x3fff, data.readUInt16LE(28) & 0x3fff];
    assert.deepEqual(dims, [size, size], `${src} é quadrada, com ${size} px`);
    assert(bytes < max, `${src} leve (${bytes} B)`);
    total += bytes;
  }
}
assert(total < 1500000, `as 24 imagens somam menos de 1,5 MB (${total} B)`);

// Controlador: a galeria troca com a peça; escolher uma cor continua levando ao 3D (as fotos são só nas cores da vitrine).
assert(controller.includes("import {VIEWS,staticViews,createGallery} from './gallery.js';"));
assert(controller.includes('gallery.set(staticViews(key).map(item=>({...item,alt:`${p.title} — ${item.name}`})));'));
assert(controller.includes("${preview()?'cores da peça':'cores da vitrine'}"), 'a nota diz a vista e de quem são as cores');
assert(/if\(view!=='model'\)setView\('model'\)/.test(controller), 'escolher uma cor leva ao 3D');
assert(!/renderViews|createObjectURL/.test(controller + gallery + viewer), 'nada de gerar imagem no navegador de quem compra');

// Galeria: arrastar, teclado, miniaturas (passar o mouse), pontinhos, setas.
for (const part of ["track.addEventListener('scroll'", "{ArrowLeft:-1,ArrowRight:1}[e.key]", "e.key==='Home'||e.key==='End'", "rail.addEventListener('pointermove'", "e.pointerType==='mouse'", "prev.disabled=index===0;next.disabled=index===items.length-1;", "slide.setAttribute('aria-roledescription','vista')", "matchMedia('(prefers-reduced-motion: reduce)')"]) assert(gallery.includes(part), part);

// CSS: miniaturas à esquerda no computador; no celular, a faixa inteira e pontinhos com 24 px de toque; fundo branco das fotos vira o quadro.
assert(css.includes('#product-dialog .image-area { position: absolute; inset: 70px 24px 46px 18px; width: auto; height: auto; padding: 0; display: grid; grid-template-columns: 64px minmax(0, 1fr);'));
assert(css.includes('.gallery-track { position: absolute; inset: 0; display: flex; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory;'));
assert(/@media \(max-width: 900px\) \{[\s\S]*\.gallery-rail, \.gallery-arrows \{ display: none; \}[\s\S]*\.gallery-dots button \{ display: grid; place-items: center; width: 24px; height: 24px;/.test(css));
assert(/#product-dialog \.gallery img \{[^}]*mix-blend-mode: multiply;/.test(css), 'o fundo branco das fotos some no quadro');
assert(!/\.image-area img \{[^}]*mask-image: radial-gradient/.test(css), 'sem a máscara da foto antiga');

// Ferramenta: originais em design/vistas; sem original, a frente é a foto da vitrine e o resto sai do 3D; o kit do ChatGPT.
assert(generator.includes("path.join(ROOT, 'design', 'vistas')") && generator.includes('VIEWS_VERSION') && generator.includes("'--kit'"));
assert(page.includes("v.id==='frente'?`/dist/assets/${p.catalogImage}`:null") && page.includes('class Fotografo extends ProductViewer'));
// Tradução: nota, rótulos e texto alternativo das vistas.
assert(i18n.includes('(Frente|Três quartos|Costas) · (.+)') && i18n.includes('(.+) — (Frente|Três quartos|Costas)'));

console.log(`PASS: photo gallery — thumbnails + large photo on desktop, swipe + dots on phones, 3 views × 4 pieces as square WebP (${Math.round(total / 1024)} KB), the showcase photo first, color choice opens the 3D view.`);
