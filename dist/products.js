export const PALETTE = [
  {id:'mint',name:'Verde-menta',hex:'#89cdbc'}, {id:'moss',name:'Verde-musgo',hex:'#616c52'}, {id:'sky',name:'Azul-céu',hex:'#2bb8df'},
  {id:'blue',name:'Azul-royal',hex:'#183c99'}, {id:'pink',name:'Rosa Ju',hex:'#ee8eaa'},
  {id:'lilac',name:'Lilás',hex:'#ab91d1'}, {id:'yellow',name:'Amarelo',hex:'#efcf59'}, {id:'cream',name:'Amarelo-claro',hex:'#f0dd7c'},
  {id:'red',name:'Vermelho',hex:'#db354c'}, {id:'orange',name:'Laranja',hex:'#f29a44'},
  {id:'white',name:'Branco',hex:'#f4f1ed'}, {id:'black',name:'Preto',hex:'#28292d'}
];
export const PRODUCT_CATEGORIES = Object.freeze({
  oftalmologia: Object.freeze({label:'Oftalmologia'}),
  sensoriais: Object.freeze({label:'Sensoriais', emptyMessage:'Novas ideias sensoriais estão chegando.'})
});
export const PRODUCTS = {
  borboletoscopio:{number:'01',category:'oftalmologia',title:'Borboletoscópio',subtitle:'Capa para retinoscópio',image:'borboletoscopio.webp',catalogImage:'product-borboletoscopio-cutout.webp',description:'Uma borboleta para levar cor e imaginação à consulta. Impressa em 3D e feita para encaixe no retinoscópio da marca Welch Allyn.',parts:[{id:'body',name:'Corpo',hint:'Contorno, asas e antenas',default:'mint'},{id:'details',name:'Detalhes das asas',hint:'Parte interna e bolinhas',default:'yellow'}],fixed:'O rostinho e os olhos mantêm as cores originais.'},
  dinossauroscopio:{number:'02',category:'oftalmologia',title:'Dinossauroscópio',subtitle:'Capa para retinoscópio',image:'dinossauroscopio.webp',catalogImage:'product-dinossauroscopio-cutout.webp',description:'Um dinossauro simpático para acompanhar cada olhar. Capa impressa em 3D, feita para encaixe no retinoscópio da marca Welch Allyn.',parts:[{id:'body',name:'Corpo',hint:'Cabeça e corpo do dinossauro',default:'moss'},{id:'details',name:'Crista e bolinhas',hint:'A mesma cor nas duas partes',default:'cream'}],fixed:'Os olhos permanecem pretos e os dentes, brancos.'},
  aviaoscopia:{number:'03',category:'oftalmologia',title:'Aviãoscopia',subtitle:'Avião magnético para régua de esquiascopia',image:'aviaoscopia.webp',catalogImage:'product-aviaoscopia-cutout.webp',description:'Um convite para a imaginação decolar. As 16 aberturas lembram janelas de avião, com os graus identificados ao lado. As duas metades se prendem por ímãs ao redor da régua de esquiascopia, e a haste da régua sai pela base. Compatível com régua de esquiascopia de 4,7 cm x 27,9 cm. Marca usada como molde: Luneau. Para saber mais medidas, entre em contato.',parts:[{id:'body',name:'Corpo',hint:'Fuselagem, asas e cauda',default:'blue'},{id:'details',name:'Estrelas e topo',hint:'A mesma cor nos dois detalhes',default:'red'},{id:'engines',name:'Motores',hint:'As duas peças sobre as asas',default:'yellow'}],fixed:'As janelas da cabine mantêm a cor original.'},
  // As lâmpadas (07/10/2026: à venda, R$ 90 cada; misturando as três, 2 por R$ 160 e 3 por R$ 210 — COMMERCE.kits): peças de cores fixas,
  // sem partes para escolher (`parts` vazio); `colors` são as cores delas (pontinhos, carrinho, pedido). Girafa e unicórnio (06/10/2026):
  // abas iguais à do macaco, com as cores de cada bicho no banner, no header e nos pontinhos; o 3D de cada um chegou em 06/10 (as cores
  // fixas abaixo são as do modelo).
  // eyebrowEffect + badge: o selo "Novidade" (no alto da janela da peça e na página dela; product-page.css e product-landing.css .is-badge):
  // uma pílula escura no tom da peça (pill: as duas pontas do degradê), com um fio branco em volta, um halo (glow) e as letras passando
  // pelas cores de `ink` numa volta sem emenda. 'rainbow' (07/10/2026, pedido da dona: só o unicórnio) = o arco-íris vivo; 'shine'
  // (08/10/2026: "um selo bordado nas outras, brilhando conforme a paleta delas") = as cores da própria peça. Cada cor de `ink` passa de
  // 4,5:1 sobre as duas pontas de `pill` e não é mais escura que elas em nenhum canal (tests/product-page.mjs confere).
  macacoscopio:{number:'04',category:'oftalmologia',title:'MonkeyLamp',subtitle:'Capa para lâmpada de fenda portátil',image:'product-macacoscopio-cutout.webp',catalogImage:'product-macacoscopio-cutout.webp',description:'Um macaquinho para acompanhar o olhar dos pequenos. Impressa em 3D, nas cores da peça.',eyebrowEffect:'shine',badge:{ink:['#ffe27a','#f2bd6b','#d08e5c','#dca57a','#f4d8b4'],pill:['#2a1508','#43230f'],glow:'#d9964f'},parts:[],colors:[{id:'brown',name:'Marrom',hex:'#6a3a28'},{id:'tan',name:'Bege',hex:'#c9a07d'},{id:'yellow',name:'Amarelo',hex:'#efcf59'}]},
  girafoscopio:{number:'05',category:'oftalmologia',title:'GiraffeLamp',subtitle:'Capa para lâmpada de fenda portátil',image:'product-girafoscopio-cutout.webp',catalogImage:'product-girafoscopio-cutout.webp',description:'Uma girafinha para acompanhar o olhar dos pequenos. Impressa em 3D, nas cores da peça.',eyebrowEffect:'shine',badge:{ink:['#f7b733','#fff27a','#f8e7c6','#d9a066'],pill:['#2b1a04','#46300a'],glow:'#e9b44c'},parts:[],colors:[{id:'ochre',name:'Amarelo-ocre',hex:'#eeb012'},{id:'brown',name:'Marrom',hex:'#60341e'},{id:'cream',name:'Creme',hex:'#dec4a0'}]},
  unicornioscopio:{number:'06',category:'oftalmologia',title:'UnicornLamp',subtitle:'Capa para lâmpada de fenda portátil',image:'product-unicornioscopio-cutout.webp',catalogImage:'product-unicornioscopio-cutout.webp',description:'Um unicórnio para acompanhar o olhar dos pequenos. Impressa em 3D, nas cores da peça.',eyebrowEffect:'rainbow',badge:{ink:['#ff8fc4','#ffb86b','#ffe36b','#8ff09a','#7fd2ff','#b9a4ff'],pill:['#2a1236','#3d1c50'],glow:'#a65cbe'},parts:[],colors:[{id:'white',name:'Branco',hex:'#f0ece8'},{id:'purple',name:'Roxo',hex:'#a65cbe'},{id:'lavender',name:'Azul-lavanda',hex:'#7c8ad8'},{id:'gold',name:'Dourado',hex:'#d6a82c'}]}
};
// Novidades só de vitrine: aparecem no banner com a demonstração, mas não têm catálogo, preço, carrinho nem personalização (`soon: true`).
// Quando a modelagem ficar pronta, a entrada passa para PRODUCTS (com preço no servidor, cores e modelo 3D). `colors` são só os pontinhos do banner.
// (07/10/2026: o macaco, a girafa e o unicórnio passaram para PRODUCTS, à venda; hoje não há novidade só de vitrine.)
export const SOON = {};
// Famílias de encaixe: o equipamento que cada peça veste. Ordenam a seção "O 3D nas suas consultas" da home, os banners
// da página Escolha o seu (escolha.html) e o filtro da página Produtos (produtos.html?encaixe=<família>). Peça nova entra
// na lista da família quando chegar (PRODUCTS ou SOON); família sem nenhuma peça conhecida não aparece.
export const FAMILIES = Object.freeze({
  retinoscopio: Object.freeze({label:'Encaixe para retinoscópio', tool:'Retinoscópio', items:Object.freeze(['borboletoscopio','dinossauroscopio'])}),
  regua: Object.freeze({label:'Encaixe para régua de esquiascopia', tool:'Régua de esquiascopia', items:Object.freeze(['aviaoscopia'])}),
  lampada: Object.freeze({label:'Encaixe para lâmpada de fenda', tool:'Lâmpada de fenda', items:Object.freeze(['macacoscopio','girafoscopio','unicornioscopio'])})
});
export const ALIASES = {'capa-01':'borboletoscopio','capa-02':'dinossauroscopio','aviao-magnetico':'aviaoscopia'};
// Fotos da vitrine também em 768 px (mesmo recorte, reduzidas): a peça na vitrine aparece com 190 a 390 px de largura,
// então no celular (até 3x) e no computador (1x e 2x) a de 768 basta; a de 1254 fica para telas grandes e muito densas.
// artSrcset monta o srcset; artSmall é a leve, para miniaturas (mini-carrinho, carrinho), já no cache depois da vitrine.
// HERO_SIZES, DEMO_SIZES e PHOTO_SIZES: a largura com que a foto aparece na vitrine, na demonstração (1,4 a 1,6 vez a da
// vitrine) e na página da peça (medida em 06/10/2026). O index.html repete HERO_SIZES no pré-carregamento e na imagem de
// reserva, para o navegador baixar um arquivo só.
export const ART_768 = Object.freeze({
  'product-borboletoscopio-cutout.webp': 'product-borboletoscopio-cutout-768.webp',
  'product-dinossauroscopio-cutout.webp': 'product-dinossauroscopio-cutout-768.webp',
  'product-aviaoscopia-cutout.webp': 'product-aviaoscopia-cutout-768.webp',
  'product-macacoscopio-cutout.webp': 'product-macacoscopio-cutout-768.webp'
});
export const artSmall = file => ART_768[file] || file;
export const artSrcset = file => ART_768[file] ? `assets/${ART_768[file]} 768w, assets/${file} 1254w` : '';
export const HERO_SIZES = '(max-width: 600px) 56vw, (max-width: 1000px) 310px, (max-width: 1560px) 25vw, 390px';
export const DEMO_SIZES = '(max-width: 600px) 84vw, (max-width: 900px) 500px, (max-width: 1560px) 35vw, 545px';
export const PHOTO_SIZES = '(max-width: 899px) 72vw, (max-width: 1400px) 35vw, 460px';
// Vitrine da home. `art` descreve o recorte catalogImage como fração do lado do quadrado
// (h: altura visível · bottom: folga abaixo do produto · foot: largura da base), para assentar
// cada peça na pilastra sem tratar produto por produto. `theme` colore o banner, o header e a seção
// logo abaixo (título e linha de apoio; os cards não). `bannerStops` são as três paradas do degradê
// (claro no centro → borda); a geometria fica no CSS. Produto novo sem entrada usa DEFAULT_SHOWCASE.
// `scenery` é o fundo da vitrine em silhuetas brancas de nuvem (hero-scenery.js; 08/10/2026): side = as silhuetas dos cantos ('petals',
// 'grass', 'ferns', 'palms', 'puffs', 'towers' ou 'daisies'); motif = o desenho em volta da peça ('acacia', 'bananas', 'rainbow',
// 'flowers', 'tracks', 'sky' ou null); tints = as cores da própria peça (#rrggbb), só para as sombras, bem de leve: a vitrine as clareia
// até o tom do meio do degradê (hero-motion.js › sceneryVars), para o desenho nunca escurecer o fundo atrás de um texto.
export const DEFAULT_SHOWCASE = Object.freeze({
  art:Object.freeze({h:.92, bottom:.03, foot:.55}),
  theme:Object.freeze({bannerStops:'#fbf1f2 0%,#f6dfe3 52%,#eecfd6 100%', headerBackground:'#f8e6e9', textColor:'#2a1c22', mutedColor:'#6c4b57', accentColor:'#9b3f5a'}),
  scenery:Object.freeze({side:'petals', motif:null, tints:Object.freeze([])})
});
// `demo` (opcional) liga a demonstração na vitrine: clicar na peça aproxima o produto e faz o equipamento
// subir até encaixar nele (hero-demo.js). Medidas em fração do lado do quadrado do recorte, tiradas do alfa
// das próprias imagens. tool: imagem do equipamento (width/top no quadrado, ratio = largura/altura, fade = trecho
// da altura em que ele se dissolve, para o cabo não roubar a cena). layers: a peça em duas camadas, com o equipamento
// entre elas — back (estrutura traseira, no mesmo enquadramento da frente) e front (padrão = catalogImage). Renderizadas
// juntas (mesma câmera): depth 0, entram como vieram. Back tirado de outra imagem: depth > 0 recua a camada de trás em
// direção ao centro (perspectiva), revelando as paredes internas da abertura. callouts: chamadas da ficha técnica,
// com os pontos da linha (âncora → cotovelo → rótulo) em fração do quadrado, para desktop (wide) e celular (compact);
// align diz de que lado da ponta fica o rótulo. zoom (opcional) aumenta o conjunto para peças mais estreitas.
// glow/halo/accent/shade: luz, reflexo no equipamento e vinheta.
export const SHOWCASE = {
  borboletoscopio:{
    art:{h:.949, bottom:.0136, foot:.6085, alt:'Borboletoscópio verde-menta com detalhes amarelos sobre uma pilastra branca'},
    theme:{bannerStops:'#f0faf4 0%,#d9f0e4 52%,#c6e8d7 100%', headerBackground:'#e5f5ec', textColor:'#10281e', mutedColor:'#356650', accentColor:'#25664c'},
    // margaridas de pétalas brancas nos cantos e dos dois lados da borboleta: a sombra no verde-menta dela, os miolos no amarelo
    scenery:{side:'daisies', motif:'flowers', tints:['#89cdbc', '#efcf59']},
    demo:{
      tool:{src:'retinoscopio.webp', width:.2343, top:.2871, ratio:.1933, fade:[.63, .72]},
      // front = a mesma imagem da vitrine (catalogImage), identidade oficial da peça. back = parede traseira já pronta:
      // alinhada pixel a pixel à frente, recuada, na sombra e só em volta da abertura — entra como veio (depth 0).
      layers:{front:'product-borboletoscopio-cutout.webp', back:'borboletoscopio-back.webp'},
      callouts:[
        {label:'Borboletoscópio', wide:{points:[[.21, .33], [.12, .24], [-.04, .24]], align:'left'}, compact:{points:[[.25, .93], [.25, 1.07]], align:'below'}},
        {label:'Retinoscópio', wide:{points:[[.455, 1.03], [.4, 1.08], [-.04, 1.08]], align:'left'}, compact:{points:[[.46, 1.03], [.74, 1.03], [.74, 1.07]], align:'below'}}
      ],
      glow:'#fbfffc', halo:'#89cdbc', accent:'#efcf59', shade:'#1f5a43',
      message:'Borboletoscópio encaixado no retinoscópio.'
    }
  },
  dinossauroscopio:{
    art:{h:.893, bottom:.0526, foot:.3995, alt:'Dinossauroscópio verde-musgo com espinhos amarelo-claros sobre uma pilastra branca'},
    theme:{bannerStops:'#f4f6ee 0%,#e2e8d4 52%,#d0d9bf 100%', headerBackground:'#e9eedf', textColor:'#1b2414', mutedColor:'#46553a', accentColor:'#4a5f34'},
    // samambaias pré-históricas e a pegada de três dedos do T-rex, fofa como nuvem: a sombra no verde-musgo da peça
    scenery:{side:'ferns', motif:'tracks', tints:['#616c52', '#f0dd7c']},
    demo:{
      tool:{src:'retinoscopio.webp', width:.2291, top:.3285, ratio:.1933, fade:[.57, .66]},
      layers:{front:'product-dinossauroscopio-cutout.webp', back:'dinossauroscopio-back.webp'},
      callouts:[
        {label:'Dinossauroscópio', wide:{points:[[.36, .265], [.28, .2], [.12, .2]], align:'left'}, compact:{points:[[.33, .9], [.22, .98], [.22, 1.05]], align:'below'}},
        {label:'Retinoscópio', wide:{points:[[.46, .98], [.4, 1.03], [.12, 1.03]], align:'left'}, compact:{points:[[.47, .98], [.78, .98], [.78, 1.05]], align:'below'}}
      ],
      zoom:1.06, glow:'#fbfcf6', halo:'#7e8b6c', accent:'#efdb68', shade:'#1b2414',
      message:'Dinossauroscópio encaixado no retinoscópio.'
    }
  },
  aviaoscopia:{
    art:{h:.8939, bottom:.0758, foot:.4896, alt:'Aviãoscopia azul com 16 aberturas numeradas sobre uma pilastra branca'},
    theme:{bannerStops:'#f0f9fe 0%,#d3ebf8 52%,#bcdff2 100%', headerBackground:'#deeffa', textColor:'#0e1c3d', mutedColor:'#3a6280', accentColor:'#22638f'},
    scenery:{side:'towers', motif:'sky', tints:['#2bb8df', '#183c99', '#efcf59']},   // céu: cúmulos em camadas e o rastro pontilhado de um voo
    demo:{
      // Montagem em vez de encaixe: a régua de esquiascopia sobe por entre as duas metades e elas se fecham em volta dela. Metades, régua e
      // vitrine são renders do mesmo modelo com a mesma câmera (tools/render-aviao-macaco/plane.html), então as camadas coincidem pixel a pixel.
      // assemble.open/apart = vista explodida enquanto a régua sobe: a metade da frente vem para perto (z em px de perspectiva) e a de trás recua;
      // x/y em % do quadrado, rx/ry em graus.
      assemble:{open:{z:96, x:-1.5, y:-3, rx:5, ry:-7}, apart:{z:-118, x:1.5, y:2.5, rx:-2, ry:6}},
      // a régua aparece inteira e nítida: fade só na última linha de pixels e sem o reflexo colorido por cima (bounce: false)
      tool:{src:'aviaoscopia-ruler.webp', width:.2233, top:.1675, ratio:.1872, fade:[.99, 1], bounce:false},
      layers:{front:'aviaoscopia-front.webp', back:'aviaoscopia-back.webp'},
      callouts:[
        {label:'Aviãoscopia', wide:{points:[[.283, .522], [.17, .6], [-.04, .6]], align:'left'}, compact:{points:[[.283, .522], [.2, .66], [.2, 1.05]], align:'below'}},
        {label:'Régua de esquiascopia', wide:{points:[[.5, 1.04], [.43, 1.09], [-.04, 1.09]], align:'left'}, compact:{points:[[.5, 1.338], [.5, 1.39]], align:'below'}}
      ],
      // desktop: peça e régua inteira cabem na área do banner (o cabo nunca chega à borda que desbota); no celular, o enquadramento de sempre
      zoom:{wide:.76, compact:.84}, cy:{wide:-7, compact:-4}, ctaY:{compact:1.03}, glow:'#f4fbff', halo:'#5aa7d9', accent:'#efcf59', shade:'#0e1c3d',
      message:'Aviãoscopia fechada em volta da régua de esquiascopia.'
    }
  },
  macacoscopio:{
    art:{h:.8708, bottom:.0542, foot:.311, alt:'MonkeyLamp, capa de macaco marrom com uma banana, sobre uma pilastra branca'},
    theme:{bannerStops:'#fcf5e5 0%,#f5e8c8 52%,#eddcb5 100%', headerBackground:'#f6ebd0', textColor:'#33200f', mutedColor:'#634526', accentColor:'#86441a'},
    scenery:{side:'palms', motif:'bananas', tints:['#efcf59', '#c9a07d', '#6a3a28']},   // selva: folhas de palmeira e o cacho de bananas
    demo:{
      // A lâmpada de fenda portátil em duas partes, renderizadas com a câmera da foto da vitrine (tools/render-aviao-macaco/monkeylamp.html):
      // tool = base, carcaça e coluna preta, que sobe por dentro do macaco; head = prisma e cabeça binocular, que descem por cima (top negativo:
      // acima do quadrado). As duas ficam atrás do macaco, como na peça montada.
      tool:{src:'macacoscopio-base.webp', width:.799, top:.0925, ratio:.3981, fade:[.66, .8]},
      head:{src:'macacoscopio-head.webp', width:.6635, top:-.1778, ratio:1.6808},
      callouts:[
        {label:'MonkeyLamp', wide:{points:[[.43, .59], [.25, .5], [-.04, .5]], align:'left'}, compact:{points:[[.43, .59], [.06, .86], [.06, 1.62]], align:'below'}},
        {label:'Lâmpada de fenda', wide:{points:[[.61, .02], [.78, -.06], [1.04, -.06]], align:'right'}, compact:{points:[[.69, 1.26], [.94, 1.26], [.94, 1.62]], align:'below'}}
      ],
      zoom:.7, cy:{wide:-6, compact:-6}, ctaY:{compact:1.33}, glow:'#fffaf0', halo:'#e8b96a', accent:'#f4c431', shade:'#33200f',
      message:'MonkeyLamp encaixado na lâmpada de fenda.'
    }
  }
};
// Girafa e unicórnio: a demonstração do macaco (a lâmpada em duas camadas), com o nome e o tema de cada um. As fotos são renders do 3D
// deles (06/10/2026, tools/modelo-novidades): `art` medido nelas, e a lâmpada na escala de cada peça. Na foto, o tubo da girafa e o do
// unicórnio saem mais finos que o do macaco (as orelhas e o chifre ocupam altura): a largura do tubo / a do macaco é o `fit`, e a lâmpada
// encolhe nessa proporção, ancorada no pé da peça (a coluna continua dentro da capa; a cabeça desce até o mesmo ponto).
const fitLamp = (demo, fit, foot) => {
  const t = demo.tool, h = demo.head, bottom = h.top + h.width / h.ratio;
  return {...demo, tool:{...t, width:t.width * fit, top:foot - (foot - t.top) * fit}, head:{...h, width:h.width * fit, top:bottom - h.width * fit / h.ratio}};
};
for (const [key, art, fit, theme, demo, scenery] of [
  ['girafoscopio', {h:.874, bottom:.053, foot:.286, alt:'GiraffeLamp, capa de girafa amarela com manchas marrons, sobre uma pilastra branca'}, .92,
    {bannerStops:'#fff6df 0%,#fbe4b0 52%,#f4d08a 100%', headerBackground:'#fbe9c0', textColor:'#2e1c07', mutedColor:'#5c3a10', accentColor:'#87430c'},
    {glow:'#fffaf0', halo:'#e9b44c', accent:'#e3a83a', shade:'#2e1c07', message:'GiraffeLamp encaixado na lâmpada de fenda.'},
    {side:'grass', motif:'acacia', tints:['#eeb012', '#60341e', '#dec4a0']}],   // savana: o capim alto, o sol e a acácia de copa em nuvem
  ['unicornioscopio', {h:.876, bottom:.052, foot:.257, alt:'UnicornLamp, capa de unicórnio branca com crina, arco-íris e estrelas, sobre uma pilastra branca'}, .817,
    {bannerStops:'#fcf6fe 0%,#f1e3f8 52%,#e5d1f1 100%', headerBackground:'#f4e9fa', textColor:'#291532', mutedColor:'#5a3d6a', accentColor:'#87397a'},
    {glow:'#fdf8ff', halo:'#d6a8e6', accent:'#ee8eaa', shade:'#291532', message:'UnicornLamp encaixado na lâmpada de fenda.',
      // 07/10/2026: depois do encaixe, a cabeça gira para a direita — o chifre sai da frente da lâmpada, para a criança olhar pelos olhinhos
      // (36 quadros do 3D numa grade de 6 colunas, por cima da foto: tools/render-aviao-macaco/lamp-assets.cjs --giro; box = a parte que muda, em frações da foto)
      turn:{src:'unicornioscopio-giro.webp', frames:36, cols:6, box:[0.2616, 0.0662, 0.5239, 0.3884], angle:70, hint:'Gire a cabecinha para o lado: o chifre sai da frente da lâmpada.'}},
    {side:'puffs', motif:'rainbow', tints:['#a65cbe', '#7c8ad8', '#d6a82c', '#ee8eaa']}]   // arco-íris de nuvem, com um fio das cores da peça, e nuvens fofas nos pés
]) {
  const monkey = SHOWCASE.macacoscopio, title = PRODUCTS[key].title;
  SHOWCASE[key] = {art, theme, scenery, demo:{...fitLamp(monkey.demo, fit, 1 - art.bottom), ...demo, callouts:monkey.demo.callouts.map((c, i) => i ? c : {...c, label:title})}};
}
export function showcase(key){const entry=SHOWCASE[key]||{};return {art:{...DEFAULT_SHOWCASE.art,...entry.art},theme:{...DEFAULT_SHOWCASE.theme,...entry.theme},scenery:{...DEFAULT_SHOWCASE.scenery,...entry.scenery},demo:entry.demo||null};}
export function defaults(key){return Object.fromEntries(PRODUCTS[key].parts.map(part=>[part.id,part.default]));}
export function color(id){return PALETTE.find(c=>c.id===id)||PALETTE[0];}
// Peça de cores fixas (as lâmpadas): nada para escolher — sem partes; as cores são as dela (`colors`).
export const fixedColors=key=>!!PRODUCTS[key]&&!PRODUCTS[key].parts.length;
// O selo "Novidade" da peça (`badge`) em variáveis de CSS, para a janela da peça (controller.js) e a página dela
// (tools/build-product-pages.cjs): --badge-ink (o degradê das letras, que termina na cor em que começa: a volta não tem emenda),
// --badge-pill (a pílula) e --badge-glow (o halo). '' para a peça sem selo.
export function badgeStyle(key){const b=PRODUCTS[key]?.badge;return b?`--badge-ink:linear-gradient(90deg, ${[...b.ink,b.ink[0]].join(', ')});--badge-pill:linear-gradient(135deg, ${b.pill.join(', ')});--badge-glow:${b.glow}`:'';}
// As cores de um item, para o carrinho, o pedido e os cartões: as escolhidas, parte por parte; na peça de cores fixas, as dela.
// [{part, name, hex}] (part vazio nas cores fixas)
export function itemColors(key,selection={}){const p=PRODUCTS[key];if(!p)return [];if(!p.parts.length)return (p.colors||[]).map(c=>({part:'',name:c.name,hex:c.hex}));
  return p.parts.map(part=>{const c=color(selection?.[part.id]??part.default);return {part:part.name,name:c.name,hex:c.hex};});}
// Cores de fábrica do produto (padrão de cada parte), sem repetir a mesma cor; na peça de cores fixas, as dela.
export function originalColors(key){if(fixedColors(key))return PRODUCTS[key].colors;const base=defaults(key),seen=new Set();return PRODUCTS[key].parts.map(part=>color(base[part.id])).filter(c=>!seen.has(c.id)&&seen.add(c.id));}
export function validSelection(key,value){const result=defaults(key);for(const part of PRODUCTS[key].parts){if(PALETTE.some(c=>c.id===value?.[part.id]))result[part.id]=value[part.id];}return result;}
