import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';

// Galeria de vistas da aba Foto (pedido do Luiz, 04/10/2026): miniaturas à esquerda e a vista grande no computador, arrastar de lado
// com pontinhos no celular; vistas prontas nas cores da vitrine e, nas cores escolhidas, geradas do mesmo modelo 3D.
const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const [html, controller, gallery, viewer, css, generator, page, i18n] = await Promise.all(['dist/index.html', 'dist/controller.js', 'dist/gallery.js', 'dist/viewer.js', 'dist/product-page.css', 'tools/galeria-vistas/gerar.cjs', 'tools/galeria-vistas/vistas.html', 'dist/i18n-core.js'].map(read));
const {VIEWS, VIEWS_VERSION, staticViews} = await import('../dist/gallery.js');
const {PRODUCTS, SOON} = await import('../dist/products.js');
const dialog = html.match(/<dialog id="product-dialog"[\s\S]*?<\/dialog>/)[0];

// Marcação: a galeria no lugar da foto única (sem a peça na pilastra), com miniaturas, faixa que rola, setas e pontinhos.
assert(!dialog.includes('id="dialog-image"') && !controller.includes('#dialog-image'), 'sem a foto única da peça na pilastra');
assert(dialog.includes('<div class="image-area gallery" role="region" aria-roledescription="galeria" aria-label="Vistas da peça">'));
for (const part of ['class="gallery-rail" role="group" aria-label="Escolher a vista"', 'class="gallery-track" tabindex="0"', 'data-step="-1" aria-label="Vista anterior"', 'data-step="1" aria-label="Próxima vista"', 'class="gallery-dots" role="group" aria-label="Escolher a vista"']) assert(dialog.includes(part), part);

// As vistas: frente, três quartos, lado, três quartos de trás e costas; ângulos em graus.
assert.deepEqual(VIEWS.map(v => v.id), ['frente', 'tres-quartos', 'lado', 'tras', 'costas']);
for (const view of VIEWS) assert(Number.isFinite(view.az) && Number.isFinite(view.el) && view.name, view.id);
// Uma vista pronta (1000 px) e uma miniatura (200 px) de cada vista, para as quatro peças (o macaco também, nas cores fixas).
const keys = [...Object.keys(PRODUCTS), ...Object.keys(SOON)];
assert.deepEqual(keys.sort(), ['aviaoscopia', 'borboletoscopio', 'dinossauroscopio', 'macacoscopio']);
let total = 0;
for (const key of keys) for (const item of staticViews(key)) {
  assert.equal(item.src, `assets/vistas/${key}-${item.id}.webp?v=${VIEWS_VERSION}`);
  for (const [src, size, max] of [[item.src, 1000, 120000], [item.thumb, 200, 12000]]) {
    const file = new URL(`../dist/${src.split('?')[0]}`, import.meta.url), bytes = (await stat(file)).size, data = Buffer.from(await readFile(file));
    assert.equal(data.toString('latin1', 0, 4) + data.toString('latin1', 8, 12), 'RIFFWEBP', `${src} é WebP`);
    // VP8X (WebP com transparência): largura e altura menos um, em 24 bits, nos bytes 24 a 29
    assert.equal(data.toString('latin1', 12, 16), 'VP8X', `${src} tem transparência (o quadro claro vem da página)`);
    assert.deepEqual([data.readUIntLE(24, 3) + 1, data.readUIntLE(27, 3) + 1], [size, size], `${src} tem ${size} px`);
    assert(bytes < max, `${src} leve (${bytes} B)`);
    total += bytes;
  }
}
assert(total < 900000, `as 40 imagens somam menos de 900 KB (${total} B)`);

// Controlador: nas cores da vitrine, as vistas prontas; em outras cores, geradas do 3D; a cor escolhida fica na aba Foto.
assert(controller.includes("import {VIEWS,staticViews,createGallery} from './gallery.js';"));
assert(controller.includes("if(next==='photo'){viewer?.pause();paintGallery();return;}"), 'voltar à aba Foto não cancela a carga do modelo (a galeria usa o mesmo)');
assert(controller.includes("const original=key=>!PRODUCTS[key]||PRODUCTS[key].parts.every(part=>selections[key][part.id]===part.default);"), 'cores da vitrine = as cores padrão de products.js');
assert(controller.includes('.renderViews(key,JSON.parse(colors),VIEWS,{size:gallery.size()})'), 'outras cores: as mesmas vistas, do modelo 3D');
assert(controller.includes("if(job!==galleryJob)return;") && controller.includes("dialog.addEventListener('close',()=>{++request;++galleryJob;"), 'uma geração antiga não sobrescreve a atual nem a próxima peça');
assert(controller.includes("galleryNote='cores da vitrine (as suas aparecem no 3D)'"), 'sem WebGL: fica nas vistas prontas e avisa');
assert(controller.includes('capture:()=>{try{return viewer?.key===activeProduct?viewer.snapshot():null;}catch{return null;}}'), 'o carrinho leva a miniatura nas cores escolhidas também a partir da aba Foto');

// Galeria: arrastar, teclado, miniaturas (passar o mouse), pontinhos, setas e as imagens geradas liberadas da memória.
for (const part of ["track.addEventListener('scroll'", "{ArrowLeft:-1,ArrowRight:1}[e.key]", "e.key==='Home'||e.key==='End'", "thumbs.addEventListener('pointermove'", "e.pointerType==='mouse'", 'URL.revokeObjectURL(url)', "prev.disabled=index===0;next.disabled=index===items.length-1;", "slide.setAttribute('aria-roledescription','vista')", 'matchMedia(\'(prefers-reduced-motion: reduce)\')']) assert(gallery.includes(part), part);

// Visualizador: carregar sem mostrar, pausar sem cancelar, e as vistas sem pilastra, com a luz girando junto e a mesma distância.
assert(/  load\(key\)\{/.test(viewer) && viewer.includes('pause(){this.loadVersion=') && viewer.includes('hide(){this.pause();this.loadController?.abort();}'));
assert(viewer.includes('async renderViews(key,colors,views,{size=1000,type=\'image/webp\',quality=.9}={}){'));
assert(viewer.includes('this.pedestal.visible=false;this.ground.visible=true;') && viewer.includes('this.pedestal.visible=true;this.ground.visible=false;'), 'sem a pilastra nas vistas, e ela volta para o 3D');
assert(viewer.includes('new T.ShadowMaterial(') && viewer.includes('this.shade=new T.DirectionalLight(0xffffff,0)'), 'só a sombra no chão, de uma luz sem brilho');

// CSS: miniaturas à esquerda no computador; no celular, a faixa inteira e pontinhos com 24 px de toque.
assert(css.includes('#product-dialog .image-area { position: absolute; inset: 70px 24px 46px 18px; width: auto; height: auto; padding: 0; display: grid; grid-template-columns: 64px minmax(0, 1fr);'));
assert(css.includes('.gallery-track { position: absolute; inset: 0; display: flex; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory;'));
assert(/@media \(max-width: 900px\) \{[\s\S]*\.gallery-rail, \.gallery-arrows \{ display: none; \}[\s\S]*\.gallery-dots button \{ display: grid; place-items: center; width: 24px; height: 24px;/.test(css));
assert(!/\.image-area img \{[^}]*mask-image: radial-gradient/.test(css), 'sem a máscara da foto antiga');

// Gerador: o mesmo renderViews do site, nas cores padrão de cada parte.
assert(page.includes("import {ProductViewer} from '/dist/viewer.js';") && page.includes('color(part.default).hex') && page.includes('viewer.renderViews(key,colors,VIEWS,{size:1000'));
assert(generator.includes("path.join(ROOT, 'dist', 'assets', 'vistas')") && generator.includes('VIEWS_VERSION'));
// Tradução: nota, rótulos e texto alternativo das vistas.
assert(i18n.includes('(Frente|Três quartos|Lado|Três quartos de trás|Costas) · (.+)'));

console.log(`PASS: photo gallery — thumbnails + large view on desktop, swipe + dots on phones, 5 views × 4 pieces as transparent WebP (${Math.round(total / 1024)} KB), chosen colors rendered from the same 3D model, shared model load, cart thumbnail from the photo tab.`);
