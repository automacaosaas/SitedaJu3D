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
  borboletoscopio:{number:'01',category:'oftalmologia',title:'Borboletoscópio',subtitle:'Capa para retinoscópio',image:'borboletoscopio.png',catalogImage:'product-borboletoscopio-cutout.webp',description:'Uma borboleta para levar cor e imaginação à consulta. Feita em impressão 3D, com o espaço de encaixe do retinoscópio livre.',parts:[{id:'body',name:'Corpo',hint:'Contorno, asas e antenas',default:'mint'},{id:'details',name:'Detalhes das asas',hint:'Parte interna e bolinhas',default:'yellow'}],fixed:'O rostinho e os olhos mantêm as cores originais.'},
  dinossauroscopio:{number:'02',category:'oftalmologia',title:'Dinossauroscópio',subtitle:'Capa para retinoscópio',image:'dinossauroscopio.png',catalogImage:'product-dinossauroscopio-cutout.webp',description:'Um dinossauro simpático para acompanhar cada olhar. Capa impressa em 3D, com abertura para encaixar no retinoscópio.',parts:[{id:'body',name:'Corpo',hint:'Cabeça e corpo do dinossauro',default:'moss'},{id:'details',name:'Crista e bolinhas',hint:'A mesma cor nas duas partes',default:'cream'}],fixed:'Os olhos permanecem pretos e os dentes, brancos.'},
  aviaoscopia:{number:'03',category:'oftalmologia',title:'Aviãoscopia',subtitle:'Avião magnético para régua de grau',image:'aviaoscopia-regua.png',catalogImage:'product-aviaoscopia-cutout.webp',description:'Um convite para a imaginação decolar. As 16 aberturas da régua lembram janelas de avião, com os graus identificados ao lado. O rasgo retangular na base acomoda a haste plana da régua. Apresentação ilustrativa com a régua encaixada.',parts:[{id:'body',name:'Corpo',hint:'Fuselagem, asas e cauda',default:'blue'},{id:'details',name:'Estrelas e topo',hint:'A mesma cor nos dois detalhes',default:'red'},{id:'engines',name:'Motores',hint:'As duas peças sobre as asas',default:'yellow'}],fixed:'As janelas da cabine, lentes e aros mantêm as cores originais. A numeração acompanha cada abertura.'}
};
export const ALIASES = {'capa-01':'borboletoscopio','capa-02':'dinossauroscopio','aviao-magnetico':'aviaoscopia'};
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
    art:{h:.9043, bottom:.0702, foot:.5263, alt:'Aviãoscopia sobre pilastra branca, com 16 aberturas numeradas e rasgo retangular para a haste da régua'},
    theme:{bannerStops:'#f0f9fe 0%,#d3ebf8 52%,#bcdff2 100%', headerBackground:'#deeffa', textColor:'#0e1c3d', mutedColor:'#3a6280', accentColor:'#22638f'}
  }
};
export function showcase(key){const entry=SHOWCASE[key]||{};return {art:{...DEFAULT_SHOWCASE.art,...entry.art},theme:{...DEFAULT_SHOWCASE.theme,...entry.theme},demo:entry.demo||null};}
export function defaults(key){return Object.fromEntries(PRODUCTS[key].parts.map(part=>[part.id,part.default]));}
export function color(id){return PALETTE.find(c=>c.id===id)||PALETTE[0];}
// Cores de fábrica do produto (padrão de cada parte), sem repetir a mesma cor.
export function originalColors(key){const base=defaults(key),seen=new Set();return PRODUCTS[key].parts.map(part=>color(base[part.id])).filter(c=>!seen.has(c.id)&&seen.add(c.id));}
export function validSelection(key,value){const result=defaults(key);for(const part of PRODUCTS[key].parts){if(PALETTE.some(c=>c.id===value?.[part.id]))result[part.id]=value[part.id];}return result;}
