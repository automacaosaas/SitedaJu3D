// Recolorir no espaço OKLab: as regras de "cores" de design/vistas/fotos.json (a galeria, vistas.html) e as imagens da loja que
// passam por tools/recolorir (09/10/2026). Módulo do navegador: usa canvas.
import {PALETTE} from '/dist/products.js';
const context=canvas=>canvas.getContext('2d',{willReadFrequently:true});
// Cores da vitrine (07/10/2026: "preciso que as imagens estejam todas nas cores que ela é originalmente"). As fotos reais foram
// feitas com peças impressas em outras cores (o dino azul-marinho, a borboleta lilás com rosa, o avião com as estrelas amarelas e os
// motores vermelhos). Cada regra de "cores" em fotos.json leva uma cor da foto ("de", com a faixa de matiz em graus) para a cor da
// paleta ("para"), no espaço OKLab (o da percepção): a luz e a sombra de cada pixel ficam, só a tinta muda — a claridade passa por uma
// curva que leva a da cor de antes à da nova e mantém o preto e o branco no lugar (multiplicar estourava as partes claras em branco),
// a saturação escala pela razão entre as duas, e a variação de matiz da foto continua (mais fraca). Brancos, pretos e
// brilhos (pouca saturação) não mudam. A transição entre as cores é suave (sem serrilhado), e uma regra pode valer só dentro de
// algumas áreas da fonte ("so") ou fora delas ("exceto"); "contraste" troca a curva da claridade por uma reta em volta da média (o
// painel creme do avião, muito sombreado, vira azul com a variação de luz do azul da vitrine) e "matiz" diz quanto da variação de
// matiz da foto passa (0 no creme, quase sem cor, em que o matiz e a saturação são só ruído: sai a saturação da cor nova) e "neutros"
// leva também os brancos, cinzas e pretos (os brilhos e as sombras do painel creme): as bochechas rosadas da borboleta são da cor das asas, o bico do avião é do
// vermelho dos motores; "croma_max" e "claridade_max" deixam de fora o que é mais saturado ou mais claro que isso (o fundo claro da
// prévia de link, no mesmo matiz da peça). As áreas são retângulos [x, y, largura, altura] em pixels da fonte, listados por nome em "areas" de cada vista.
const toLin=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;},toSrgb=v=>{v=v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055;return Math.max(0,Math.min(255,Math.round(v*255)));};
function oklab(r,g,b){r=toLin(r);g=toLin(g);b=toLin(b);
  const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
  return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];}
function fromOklab(L,a,b){const l=(L+.3963377774*a+.2158037573*b)**3,m=(L-.1055613458*a-.0638541728*b)**3,s=(L-.0894841775*a-1.291485548*b)**3;
  return [toSrgb(4.0767416621*l-3.3077115913*m+.2309699292*s),toSrgb(-1.2684380046*l+2.6097574011*m-.3413193965*s),toSrgb(-.0041960863*l-.7034186147*m+1.707614701*s)];}
// a cor que a tela mostra mais perto de L, C, h: com a mesma claridade e o mesmo matiz, a saturação baixa até caber no sRGB (cortar
// os canais estourava a cor: o verde-menta das partes claras virava neon)
function fitted(L,C,h){const a=Math.cos(h*Math.PI/180),b=Math.sin(h*Math.PI/180);
  const lin=c=>{const l=(L+.3963377774*a*c+.2158037573*b*c)**3,m=(L-.1055613458*a*c-.0638541728*b*c)**3,s=(L-.0894841775*a*c-1.291485548*b*c)**3;
    return [4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s];};
  const inside=c=>lin(c).every(v=>v>=-.0005&&v<=1.0005);
  if(!inside(C)){let lo=0,hi=C;for(let i=0;i<14;i++){const mid=(lo+hi)/2;if(inside(mid))lo=mid;else hi=mid;}C=lo;}
  return fromOklab(L,C*a,C*b);}
export const lch=hex=>{const [L,a,b]=oklab(...[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)));return {L,C:Math.hypot(a,b),h:(Math.atan2(b,a)*180/Math.PI+360)%360};};
const smooth=(e0,e1,x)=>{const t=Math.min(1,Math.max(0,(x-e0)/(e1-e0)));return t*t*(3-2*t);};
export function recolor(canvas,[x,y],rules,areas={}){
  const W=canvas.width,H=canvas.height,g=context(canvas),img=g.getImageData(0,0,W,H),px=img.data;
  const inside=(list,c,r)=>(list||[]).some(([ax,ay,aw,ah])=>c+x>=ax&&c+x<ax+aw&&r+y>=ay&&r+y<ay+ah);
  const prepared=rules.map(rule=>{const hex=PALETTE.find(p=>p.id===rule.para)?.hex||rule.para;if(!/^#[0-9a-f]{6}$/i.test(hex))throw new Error('cor "'+rule.para+'" fora da paleta');
    return {...rule,src:lch(rule.de),dst:lch(hex),band:rule.faixa??40,cmin:rule.croma_min??.012};});
  for(let r=0;r<H;r++)for(let c=0;c<W;c++){const i=(r*W+c)*4;if(px[i+3]===0)continue;
    const [L,a,b]=oklab(px[i],px[i+1],px[i+2]),C=Math.hypot(a,b),h=(Math.atan2(b,a)*180/Math.PI+360)%360;
    // a primeira regra que vale leva o seu peso; o que sobra passa para as seguintes (uma regra com peso quase nenhum não trava o pixel)
    let sumR=0,sumG=0,sumB=0,taken=0;
    for(const rule of prepared){
      if(rule.so&&!inside(areas[rule.so],c,r))continue;if(rule.exceto&&inside(areas[rule.exceto],c,r))continue;
      const dh=Math.abs(((h-rule.src.h+540)%360)-180),w=(rule.neutros?Math.max(1-smooth(.02,.04,C),1-smooth(.7*rule.band,rule.band,dh)):1-smooth(.7*rule.band,rule.band,dh))*(rule.neutros?1:smooth(.5*rule.cmin,1.5*rule.cmin,C))*(rule.croma_max?1-smooth(.85*rule.croma_max,1.15*rule.croma_max,C):1)*(rule.claridade_max?1-smooth(.94*rule.claridade_max,1.06*rule.claridade_max,L):1);
      const we=w*(1-taken);if(we<=0)continue;
      const sL=rule.src.L,dL=rule.dst.L,L2=Math.max(0,Math.min(.995,rule.contraste!=null?dL+(L-sL)*rule.contraste:L<=sL?L*dL/sL:dL+(L-sL)*(1-dL)/(1-sL))),C2=rule.matiz===0?rule.dst.C:rule.dst.C*Math.min(1.8,C/rule.src.C),h2=(rule.dst.h+(rule.matiz??.4)*(((h-rule.src.h+540)%360)-180)+360)%360;
      const [R,G,B]=fitted(L2,C2,h2);
      sumR+=R*we;sumG+=G*we;sumB+=B*we;taken+=we;if(taken>.999)break;}
    if(taken>0){px[i]=Math.round(px[i]*(1-taken)+sumR);px[i+1]=Math.round(px[i+1]*(1-taken)+sumG);px[i+2]=Math.round(px[i+2]*(1-taken)+sumB);}}
  g.putImageData(img,0,0);return canvas;}
