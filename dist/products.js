export const PALETTE = [
  {id:'mint',name:'Verde-menta',hex:'#89cdbc'}, {id:'sky',name:'Azul-céu',hex:'#2bb8df'},
  {id:'blue',name:'Azul-royal',hex:'#183c99'}, {id:'pink',name:'Rosa Ju',hex:'#ee8eaa'},
  {id:'lilac',name:'Lilás',hex:'#ab91d1'}, {id:'yellow',name:'Amarelo',hex:'#efcf59'},
  {id:'red',name:'Vermelho',hex:'#db354c'}, {id:'orange',name:'Laranja',hex:'#f29a44'},
  {id:'white',name:'Branco',hex:'#f4f1ed'}, {id:'black',name:'Preto',hex:'#28292d'}
];
export const PRODUCTS = {
  borboletoscopio:{number:'01',title:'Borboletoscópio',subtitle:'Capa para retinoscópio',image:'borboletoscopio.png',description:'Uma borboleta para levar cor e imaginação à consulta. Feita em impressão 3D, com o espaço de encaixe do retinoscópio livre.',parts:[{id:'body',name:'Corpo',hint:'Contorno, asas e antenas',default:'mint'},{id:'details',name:'Detalhes das asas',hint:'Parte interna e bolinhas',default:'yellow'}],fixed:'O rostinho e os olhos mantêm as cores originais.'},
  dinossauroscopio:{number:'02',title:'Dinossauroscópio',subtitle:'Capa para retinoscópio',image:'dinossauroscopio.png',description:'Um dinossauro simpático para acompanhar cada olhar. Capa impressa em 3D, com abertura para encaixar no retinoscópio.',parts:[{id:'body',name:'Corpo',hint:'Cabeça e corpo do dinossauro',default:'sky'},{id:'details',name:'Crista e bolinhas',hint:'A mesma cor nas duas partes',default:'mint'}],fixed:'Os olhos permanecem sempre pretos.'},
  aviaoscopia:{number:'03',title:'Aviãoscopia',subtitle:'Avião magnético para régua de grau',image:'aviaoscopia-regua.png',description:'Um convite para a imaginação decolar. As 16 aberturas da régua lembram janelas de avião, com os graus identificados ao lado. O rasgo retangular na base acomoda a haste plana da régua. Apresentação ilustrativa com a régua encaixada.',parts:[{id:'body',name:'Corpo',hint:'Fuselagem, asas e cauda',default:'blue'},{id:'details',name:'Estrelas e topo',hint:'A mesma cor nos dois detalhes',default:'red'},{id:'engines',name:'Motores',hint:'As duas peças sobre as asas',default:'yellow'}],fixed:'As janelas da cabine, lentes e aros mantêm as cores originais. A numeração acompanha cada abertura.'}
};
export const ALIASES = {'capa-01':'borboletoscopio','capa-02':'dinossauroscopio','aviao-magnetico':'aviaoscopia'};
export function defaults(key){return Object.fromEntries(PRODUCTS[key].parts.map(part=>[part.id,part.default]));}
export function color(id){return PALETTE.find(c=>c.id===id)||PALETTE[0];}
export function validSelection(key,value){const result=defaults(key);for(const part of PRODUCTS[key].parts){if(PALETTE.some(c=>c.id===value?.[part.id]))result[part.id]=value[part.id];}return result;}
