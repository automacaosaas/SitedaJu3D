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
  borboletoscopio:{number:'01',category:'oftalmologia',title:'Borboletoscópio',subtitle:'Capa para retinoscópio',image:'borboletoscopio.webp',catalogImage:'product-borboletoscopio-cutout.webp',description:'Uma borboleta para levar cor e imaginação à consulta. Feita em impressão 3D, com o espaço de encaixe do retinoscópio livre.',parts:[{id:'body',name:'Corpo',hint:'Contorno, asas e antenas',default:'mint'},{id:'details',name:'Detalhes das asas',hint:'Parte interna e bolinhas',default:'yellow'}],fixed:'O rostinho e os olhos mantêm as cores originais.'},
  dinossauroscopio:{number:'02',category:'oftalmologia',title:'Dinossauroscópio',subtitle:'Capa para retinoscópio',image:'dinossauroscopio.webp',catalogImage:'product-dinossauroscopio-cutout.webp',description:'Um dinossauro simpático para acompanhar cada olhar. Capa impressa em 3D, com abertura para encaixar no retinoscópio.',parts:[{id:'body',name:'Corpo',hint:'Cabeça e corpo do dinossauro',default:'moss'},{id:'details',name:'Crista e bolinhas',hint:'A mesma cor nas duas partes',default:'cream'}],fixed:'Os olhos permanecem pretos e os dentes, brancos.'},
  aviaoscopia:{number:'03',category:'oftalmologia',title:'Aviãoscopia',subtitle:'Avião magnético para régua de grau',image:'aviaoscopia.webp',catalogImage:'product-aviaoscopia-cutout.webp',description:'Um convite para a imaginação decolar. As 16 aberturas lembram janelas de avião, com os graus identificados ao lado. As duas metades se prendem por ímãs ao redor da régua de grau, e a haste da régua sai pela base. Compatível com régua de esquiascopia de 4,7 cm x 27,9 cm. Marca usada como molde: Luneau. Para saber mais medidas, entre em contato.',parts:[{id:'body',name:'Corpo',hint:'Fuselagem, asas e cauda',default:'blue'},{id:'details',name:'Estrelas e topo',hint:'A mesma cor nos dois detalhes',default:'red'},{id:'engines',name:'Motores',hint:'As duas peças sobre as asas',default:'yellow'}],fixed:'As janelas da cabine mantêm a cor original.'}
};
// Novidades só de vitrine: aparecem no banner com a demonstração, mas não têm catálogo, preço, carrinho nem personalização (`soon: true`).
// Quando a modelagem ficar pronta, a entrada passa para PRODUCTS (com preço no servidor, cores e modelo 3D). `colors` são só os pontinhos do banner.
export const SOON = {
  macacoscopio:{number:'04',category:'oftalmologia',title:'MonkeyLamp',subtitle:'Capa para lâmpada de fenda portátil',image:'product-macacoscopio-cutout.webp',catalogImage:'product-macacoscopio-cutout.webp',description:'Um macaquinho para acompanhar o olhar dos pequenos. Em breve.',parts:[],soon:true,colors:[{id:'brown',name:'Marrom',hex:'#6a3a28'},{id:'tan',name:'Bege',hex:'#c9a07d'},{id:'yellow',name:'Amarelo',hex:'#efcf59'}]},
  // Girafa e unicórnio (06/10/2026): duas abas iguais à do macaco, com as cores de cada bicho no banner, no header e nos pontinhos. Até
  // chegarem a foto e o 3D deles, as imagens (arquivos com o nome de cada um) e o 3D são os do macaco; é só trocar os arquivos.
  girafoscopio:{number:'05',category:'oftalmologia',title:'GiraffeLamp',subtitle:'Capa para lâmpada de fenda portátil',image:'product-girafoscopio-cutout.webp',catalogImage:'product-girafoscopio-cutout.webp',description:'Uma girafinha para acompanhar o olhar dos pequenos. Em breve.',parts:[],soon:true,colors:[{id:'ochre',name:'Amarelo-ocre',hex:'#e3a83a'},{id:'brown',name:'Marrom',hex:'#8b4f24'},{id:'cream',name:'Creme',hex:'#f3e2b8'}]},
  unicornioscopio:{number:'06',category:'oftalmologia',title:'UnicornLamp',subtitle:'Capa para lâmpada de fenda portátil',image:'product-unicornioscopio-cutout.webp',catalogImage:'product-unicornioscopio-cutout.webp',description:'Um unicórnio para acompanhar o olhar dos pequenos. Em breve.',parts:[],soon:true,colors:[{id:'white',name:'Branco',hex:'#f4f1ed'},{id:'pink',name:'Rosa Ju',hex:'#ee8eaa'},{id:'lilac',name:'Lilás',hex:'#ab91d1'},{id:'gold',name:'Dourado',hex:'#e2b84a'}]}
};
// Famílias de encaixe: o equipamento que cada peça veste. Ordenam a seção "O 3D nas suas consultas" da home, os banners
// da página Escolha o seu (escolha.html) e o filtro da página Produtos (produtos.html?encaixe=<família>). Peça nova entra
// na lista da família quando chegar (PRODUCTS ou SOON); família sem nenhuma peça conhecida não aparece.
export const FAMILIES = Object.freeze({
  retinoscopio: Object.freeze({label:'Encaixe para retinoscópio', tool:'Retinoscópio', items:Object.freeze(['borboletoscopio','dinossauroscopio'])}),
  regua: Object.freeze({label:'Encaixe para régua de esquiascopia', tool:'Régua de esquiascopia', items:Object.freeze(['aviaoscopia'])}),
  lampada: Object.freeze({label:'Encaixe para lâmpada de fenda', tool:'Lâmpada de fenda', items:Object.freeze(['macacoscopio'])})
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
export const DEFAULT_SHOWCASE = Object.freeze({
  art:Object.freeze({h:.92, bottom:.03, foot:.55}),
  theme:Object.freeze({bannerStops:'#fbf1f2 0%,#f6dfe3 52%,#eecfd6 100%', headerBackground:'#f8e6e9', textColor:'#2a1c22', mutedColor:'#6c4b57', accentColor:'#9b3f5a'})
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
// Girafa e unicórnio: o enquadramento e a demonstração do macaco (as imagens provisórias são as dele), com o nome e o tema de cada um.
// Quando chegar a foto de um deles, ajuste `art` (node tools/render-aviao-macaco/art.cjs) e as medidas da demonstração.
for (const [key, alt, theme, demo] of [
  ['girafoscopio', 'GiraffeLamp sobre uma pilastra branca',
    {bannerStops:'#fff6df 0%,#fbe4b0 52%,#f4d08a 100%', headerBackground:'#fbe9c0', textColor:'#2e1c07', mutedColor:'#5c3a10', accentColor:'#87430c'},
    {glow:'#fffaf0', halo:'#e9b44c', accent:'#e3a83a', shade:'#2e1c07', message:'GiraffeLamp encaixado na lâmpada de fenda.'}],
  ['unicornioscopio', 'UnicornLamp sobre uma pilastra branca',
    {bannerStops:'#fcf6fe 0%,#f1e3f8 52%,#e5d1f1 100%', headerBackground:'#f4e9fa', textColor:'#291532', mutedColor:'#5a3d6a', accentColor:'#87397a'},
    {glow:'#fdf8ff', halo:'#d6a8e6', accent:'#ee8eaa', shade:'#291532', message:'UnicornLamp encaixado na lâmpada de fenda.'}]
]) {
  const monkey = SHOWCASE.macacoscopio, title = SOON[key].title;
  SHOWCASE[key] = {art:{...monkey.art, alt}, theme, demo:{...monkey.demo, ...demo, callouts:monkey.demo.callouts.map((c, i) => i ? c : {...c, label:title})}};
}
export function showcase(key){const entry=SHOWCASE[key]||{};return {art:{...DEFAULT_SHOWCASE.art,...entry.art},theme:{...DEFAULT_SHOWCASE.theme,...entry.theme},demo:entry.demo||null};}
export function defaults(key){return Object.fromEntries(PRODUCTS[key].parts.map(part=>[part.id,part.default]));}
export function color(id){return PALETTE.find(c=>c.id===id)||PALETTE[0];}
// Cores de fábrica do produto (padrão de cada parte), sem repetir a mesma cor.
export function originalColors(key){const base=defaults(key),seen=new Set();return PRODUCTS[key].parts.map(part=>color(base[part.id])).filter(c=>!seen.has(c.id)&&seen.add(c.id));}
export function validSelection(key,value){const result=defaults(key);for(const part of PRODUCTS[key].parts){if(PALETTE.some(c=>c.id===value?.[part.id]))result[part.id]=value[part.id];}return result;}
