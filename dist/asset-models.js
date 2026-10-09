import * as T from 'three';
import {GLTFLoader} from './vendor/loaders/GLTFLoader.js';
import {MeshoptDecoder} from './vendor/libs/meshopt_decoder.module.js';

// GLBs are Meshopt-compressed (EXT_meshopt_compression, 16-bit positions); see PERFORMANCE-QA.md. Bump `v` whenever a
// model file changes so browsers holding the cached copy fetch the new one.
const ASSETS={
  // A borboleta do arquivo de impressão (BORBOLETA COMPLETO.3mf, 06/10/2026): corpo e cabeça exatos, os encaixes das asas nos detalhes,
  // (07/10/2026: a cabeça assenta no encaixe do corpo, 0,03 para dentro — sem saltar e sem afundar, como na foto da vitrine —, e o brilho dos olhos fica branco)
  // rosto creme, olhos, sobrancelhas e sorriso pretos, bochechas rosadas (tools/modelo-borboleta)
  borboletoscopio:new URL('./assets/models/borboletoscopio.glb?v=3mf-4',import.meta.url),
  // O dinossauro do Meshy (05/10/2026), com os 2 espinhos da peça nova: corpo e detalhes coloríveis, olhos, dentes e brilho fixos
  dinossauroscopio:new URL('./assets/models/dinossauroscopio.glb?v=meshy-1',import.meta.url),
  aviaoscopia:new URL('./assets/models/aviaoscopia.glb?v=cad-21-08-estrelas1',import.meta.url),
  // O macaco do Meshy com as cores fixas do macaco em cinco materiais, sem textura (VITRINE-AVIAO-MACACO-QA.md)
  macacoscopio:new URL('./assets/models/macacoscopio.glb?v=meshy-3',import.meta.url),
  // Girafa e unicórnio do Rodin (06/10/2026) com as cores fixas de cada um em materiais, sem textura; por dentro, lisos; as estrelas
  // do unicórnio refeitas (tools/modelo-novidades)
  // (07/10/2026: as cores seguem o relevo — as manchas, os olhos, as narinas e o sorriso da girafa; as orelhas, as mãos, a crina, o
  // chifre e a faixa da base do unicórnio; o arco-íris em três faixas, roxo, lavanda e dourado; tools/modelo-novidades/pintura.md)
  // (08/10/2026: a girafa com o pescoço, as pintas, a faixa sob a cabeça, os olhos e a pele do rosto refeitos lisos, com as normais da
  // própria superfície, e a pele em volta do focinho sem os fiapos claros — o zoom da galeria sem riscos, emendas nem bordas tortas;
  // tools/modelo-novidades/pintura/pintura.md, passo 9; na revisão, o creme do focinho com as normais da forma também na borda: de
  // lado e a 45° a borda de trás do focinho saía salpicada de claro)
  girafoscopio:new URL('./assets/models/girafoscopio.glb?v=rodin10-7',import.meta.url),
  unicornioscopio:new URL('./assets/models/unicornioscopio.glb?v=rodin11-2',import.meta.url)
};
// The file each piece loads (tests read the same one).
export const modelURL=key=>ASSETS[key];
// Every product is fitted to the same 4.1 height; the butterfly's thin wings and antennae read small
// at that height, so it alone is presented larger (proportions, camera and lighting unchanged).
export const PRESENTATION_SCALE={borboletoscopio:1.25};

// Os acabamentos dos filamentos (products.js › PALETTE, `finish`). Sem acabamento é o PLA fosco de sempre: a rugosidade e o metal do
// próprio modelo, sem reflexo de ambiente (o visual de antes). Os outros refletem o estúdio do visualizador (viewer.js › studio): seda
// e metal com o brilho acetinado dos filamentos silk; a pérola com brilho de tecido, uma iridescência leve e os redemoinhos creme,
// cinza-frio e bege da foto pintados nos vértices, como o arco-íris e as duais (paintVertices). Sem verniz (clearcoat): nas bordas finas
// dos modelos ele deixava pontinhos escuros.
const FINISHES={
  silk:{metalness:.45,roughness:.3},
  metal:{metalness:.9,roughness:.26},
  pearl:{metalness:.12,roughness:.24,sheen:.8,sheenRoughness:.4,sheenColor:'#f6eadb',iridescence:.6,iridescenceIOR:1.32,iridescenceThicknessRange:[160,420]},
  rainbow:{metalness:.4,roughness:.3},
  dual:{metalness:.42,roughness:.3}
};
const PAINTED=['rainbow','dual','pearl'];
// A dual (08/10/2026, "mais em degradê, misturando, como o arco-íris"): as duas cores do fio num degradê do pé ao topo da parte
// (`stops`: a de baixo e a de cima), e por cima dele as faixas em diagonal do fio que gira ao subir (DUAL_TWIST voltas, DUAL_SWIRL de
// quanto elas empurram a mistura), para as duas cores aparecerem de qualquer lado. A mistura é feita em OKLab (o espaço de cor que
// segue o olho): no meio, o rosa e o azul passam por um violeta vivo, e não por um cinza.
const DUAL_TWIST=.85,DUAL_SWIRL=.3;
const oklab=c=>{const l=Math.cbrt(.4122214708*c.r+.5363325363*c.g+.0514459929*c.b),m=Math.cbrt(.2119034982*c.r+.6806995451*c.g+.1073969566*c.b),s=Math.cbrt(.0883024619*c.r+.2817188376*c.g+.6299787005*c.b);
  return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];};
function mixOklab(out,a,b,t){
  const L=a[0]+(b[0]-a[0])*t,A=a[1]+(b[1]-a[1])*t,B=a[2]+(b[2]-a[2])*t;
  const l=(L+.3963377774*A+.2158037573*B)**3,m=(L-.1055613458*A-.0638541728*B)**3,s=(L-.0894841775*A-1.291485548*B)**3;
  const clip=v=>Math.min(1,Math.max(0,v));
  return out.setRGB(clip(4.0767416621*l-3.3077115913*m+.2309699292*s),clip(-1.2684380046*l+2.6097574011*m-.3413193965*s),clip(-.0041960863*l-.7034186147*m+1.707614701*s),T.LinearSRGBColorSpace);
}
// A parte que se escolhe vira MeshPhysicalMaterial (verniz, brilho de tecido, iridescência); no fosco ele desenha igual ao do modelo.
function physical(source){
  const keep=['color','roughness','metalness','map','normalMap','normalScale','aoMap','emissive','emissiveIntensity','side','transparent','opacity','alphaTest','flatShading'];
  const params=Object.fromEntries(keep.filter(k=>source[k]!==undefined&&source[k]!==null).map(k=>[k,source[k]?.clone?source[k].clone():source[k]]));
  const material=new T.MeshPhysicalMaterial({...params,name:source.name});
  material.userData.base={roughness:material.roughness,metalness:material.metalness};
  source.dispose();
  return material;
}
const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};

export function disposeAsset(group){
  const geometries=new Set(),materials=new Set(),textures=new Set(),images=new Set();
  group.traverse(object=>{
    if(object.geometry)geometries.add(object.geometry);
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
      if(!material)continue;materials.add(material);
      for(const value of Object.values(material))if(value?.isTexture){textures.add(value);if(value.image)images.add(value.image);}
    }
  });
  geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());
  images.forEach(i=>i.close?.());materials.forEach(m=>m.dispose());
}

export async function createAssetModel(key,colors,signal){
  if(!Object.hasOwn(ASSETS,key))throw new Error('Produto sem modelo 3D');
  const response=await fetch(ASSETS[key],{signal});
  if(!response.ok)throw new Error(`Modelo 3D: HTTP ${response.status}`);
  const data=await response.arrayBuffer();signal?.throwIfAborted();
  const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(data,'');
  const group=gltf.scene;
  if(signal?.aborted){disposeAsset(group);signal.throwIfAborted();}
  const bounds=new T.Box3().setFromObject(group),size=bounds.getSize(new T.Vector3());
  if(!Number.isFinite(size.y)||size.y<=0){disposeAsset(group);throw new Error('Dimensões do modelo inválidas');}
  const center=bounds.getCenter(new T.Vector3()),scale=4.1*(PRESENTATION_SCALE[key]||1)/size.y;
  const wrapper=new T.Group();wrapper.name=key;wrapper.add(group);
  wrapper.scale.setScalar(scale);wrapper.position.set(-center.x*scale,-1.9-bounds.min.y*scale,-center.z*scale);
  const parts=new Map(),meshes=new Map(),upgraded=new Map(),shared=new Set();
  group.traverse(object=>{
    // Dense, thin Rodin surfaces produce shadow-map acne. Keep their pedestal
    // shadows, while lighting the model itself without the coarse shadow map.
    if(!object.isMesh)return;object.castShadow=true;object.receiveShadow=false;
    const list=Array.isArray(object.material)?object.material:[object.material];
    list.forEach((material,i)=>{
      const part=material.name.replace(/\.\d+$/,'');
      if(!['body','details','engines'].includes(part))return;
      if(!upgraded.has(material))upgraded.set(material,physical(material));
      const next=upgraded.get(material);
      if(Array.isArray(object.material))object.material[i]=next;else object.material=next;
      if(!parts.has(part)){parts.set(part,new Set());meshes.set(part,[]);}
      parts.get(part).add(next);
      // a pintura nos vértices é de cada peça: uma geometria repetida (os dois motores) ganha a sua cópia
      if(shared.has(object.geometry))object.geometry=object.geometry.clone();
      shared.add(object.geometry);
      if(!meshes.get(part).includes(object))meshes.get(part).push(object);
    });
  });
  // O arco-íris muda com a altura da parte, camada por camada, como a peça sai da impressora (de baixo para cima, `stops`); a dual,
  // no degradê das duas cores com as faixas do fio que gira (DUAL_TWIST); a pérola, em redemoinhos suaves
  // (senos que se dobram uns sobre os outros, no tamanho da parte) entre o creme, o cinza-frio e o bege. Feito uma vez por cor e guardado.
  const at=new T.Vector3(),facing=new T.Vector3(),normalMatrix=new T.Matrix3(),mixed=new T.Color();
  function paintVertices(part,c){
    const list=meshes.get(part)||[],stops=c.stops.map(hex=>new T.Color(hex));
    wrapper.updateMatrixWorld(true);
    const box=new T.Box3();
    for(const mesh of list){const position=mesh.geometry.attributes.position;for(let i=0;i<position.count;i++)box.expandByPoint(at.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld));}
    const low=box.min.y,span=box.max.y-low||1,center=box.getCenter(new T.Vector3()),size=Math.max(...box.getSize(new T.Vector3()).toArray())||1;
    const ramp=x=>{const k=Math.min(stops.length-2,Math.floor(x*(stops.length-1)));return mixed.copy(stops[k]).lerp(stops[k+1],smooth(0,1,x*(stops.length-1)-k));};
    const ends=stops.map(oklab);
    for(const mesh of list){
      const geometry=mesh.geometry,cache=geometry.userData.paints||(geometry.userData.paints={});
      if(!cache[c.id]){
        if(!geometry.attributes.normal)geometry.computeVertexNormals();
        const position=geometry.attributes.position,normal=geometry.attributes.normal,out=new Float32Array(position.count*3);
        normalMatrix.getNormalMatrix(mesh.matrixWorld);
        for(let i=0;i<position.count;i++){
          const h=(at.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld).y-low)/span;
          if(c.finish==='rainbow')ramp(h);
          else if(c.finish==='pearl'){
            const x=(at.x-center.x)/size,y=(at.y-center.y)/size,z=(at.z-center.z)/size;
            ramp(smooth(.15,.85,.5+.5*Math.sin(5.1*x+2.6*Math.sin(4.2*y+1.3)+1.9*Math.sin(3.7*z+2.1*x))*Math.cos(2.3*y-1.4*z+.7)));
          }
          else{
            facing.fromBufferAttribute(normal,i).applyMatrix3(normalMatrix).normalize();
            // as faixas só nas faces dos lados; nas de cima (o topo da peça) fica o degradê
            const side=Math.min(1,Math.hypot(facing.x,facing.z)*1.4),swirl=Math.sin(Math.atan2(facing.z,facing.x)+h*Math.PI*2*DUAL_TWIST)*side;
            mixOklab(mixed,ends[0],ends[1],smooth(0,1,.5+(h-.5)*1.15+DUAL_SWIRL*swirl));
          }
          out[i*3]=mixed.r;out[i*3+1]=mixed.g;out[i*3+2]=mixed.b;
        }
        cache[c.id]=new T.BufferAttribute(out,3);
      }
      geometry.setAttribute('color',cache[c.id]);
    }
  }
  // selection: {parte: cor}, a cor como hex (sempre fosco) ou como a cor da paleta (com o acabamento dela); env: o estúdio do
  // visualizador (ou a função que o faz: só é feito quando uma cor com brilho aparece).
  function setColors(selection,env=null){
    let studio;const reflection=()=>studio===undefined?(studio=(typeof env==='function'?env():env)||null):studio;
    for(const [part,materials] of parts){
      const value=selection[part];if(!value)continue;
      const c=typeof value==='string'?{hex:value}:value,finish=FINISHES[c.finish],painted=!!(finish&&c.stops&&PAINTED.includes(c.finish));
      if(painted)paintVertices(part,c);
      for(const m of materials){
        m.roughness=finish?.roughness??m.userData.base.roughness;m.metalness=finish?.metalness??m.userData.base.metalness;
        m.sheen=finish?.sheen||0;if(finish?.sheen){m.sheenRoughness=finish.sheenRoughness;m.sheenColor.set(finish.sheenColor);}
        m.iridescence=finish?.iridescence||0;if(finish?.iridescence){m.iridescenceIOR=finish.iridescenceIOR;m.iridescenceThicknessRange=[...finish.iridescenceThicknessRange];}
        const reflect=finish?reflection():null;
        if(m.vertexColors!==painted||m.envMap!==reflect){m.vertexColors=painted;m.envMap=reflect;m.needsUpdate=true;}
        m.color.set(painted?'#ffffff':c.hex);
      }
    }
  }
  setColors(colors);
  return {group:wrapper,parts,setColors,dispose(){disposeAsset(wrapper);}};
}
