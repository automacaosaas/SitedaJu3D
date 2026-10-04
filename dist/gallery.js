// Galeria de vistas da aba Foto (pedido do Luiz, 04/10/2026), no jeito das lojas grandes: no computador, as miniaturas numa coluna
// à esquerda e a vista escolhida grande; no celular e no tablet, arrastar de lado, com os pontinhos embaixo. As vistas vêm prontas
// (assets/vistas/, nas cores da vitrine, geradas do próprio modelo 3D por tools/galeria-vistas) ou saem do modelo 3D nas cores
// escolhidas (viewer.renderViews), com a mesma câmera e a mesma luz. az/el: ângulo em volta da peça e altura da câmera, em graus.
export const VIEWS=[
  {id:'frente',name:'Frente',az:0,el:10},
  {id:'tres-quartos',name:'Três quartos',az:35,el:14},
  {id:'lado',name:'Lado',az:90,el:6},
  {id:'tras',name:'Três quartos de trás',az:145,el:14},
  {id:'costas',name:'Costas',az:180,el:10}
];
// Mude junto com as imagens de assets/vistas/ para quem tem a versão antiga no cache buscar a nova.
export const VIEWS_VERSION='1';
export const staticViews=key=>VIEWS.map(view=>({...view,src:`assets/vistas/${key}-${view.id}.webp?v=${VIEWS_VERSION}`,thumb:`assets/vistas/${key}-${view.id}-mini.webp?v=${VIEWS_VERSION}`}));

export function createGallery(root,{onChange}={}){
  const track=root.querySelector('.gallery-track'),thumbs=root.querySelector('.gallery-rail'),dots=root.querySelector('.gallery-dots');
  const prev=root.querySelector('[data-step="-1"]'),next=root.querySelector('[data-step="1"]');
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  let items=[],index=0,target=null,targetTimer=0,owned=[];
  function mark(){
    [...track.children].forEach((slide,i)=>slide.setAttribute('aria-hidden',String(i!==index)));
    for(const list of [thumbs,dots])[...list.children].forEach((b,i)=>b.setAttribute('aria-current',String(i===index)));
    prev.disabled=index===0;next.disabled=index===items.length-1;
    onChange?.(index);
  }
  function go(i,{smooth=true}={}){
    i=Math.max(0,Math.min(items.length-1,i));
    const left=i*track.clientWidth,instant=!smooth||reduced();
    if(Math.abs(track.scrollLeft-left)>1){target=instant?null:i;clearTimeout(targetTimer);if(target!==null)targetTimer=setTimeout(()=>{target=null;},900);track.scrollTo({left,behavior:instant?'instant':'smooth'});}
    if(i!==index){index=i;mark();}
  }
  // Arrastar (ou a rolagem lateral do touchpad) muda a vista; durante uma rolagem pedida por botão, só vale a de destino.
  track.addEventListener('scroll',()=>{const w=track.clientWidth;if(!w)return;const i=Math.round(track.scrollLeft/w);if(target!==null){if(i!==target)return;target=null;}if(i!==index&&i<items.length){index=i;mark();}},{passive:true});
  // Quem volta da aba 3D (ou muda o tamanho da janela) continua na mesma vista.
  new ResizeObserver(()=>{if(track.clientWidth)track.scrollTo({left:index*track.clientWidth,behavior:'instant'});}).observe(track);
  track.addEventListener('keydown',e=>{const step={ArrowLeft:-1,ArrowRight:1}[e.key];if(step){e.preventDefault();go(index+step);}else if(e.key==='Home'||e.key==='End'){e.preventDefault();go(e.key==='Home'?0:items.length-1);}});
  for(const b of [prev,next])b.addEventListener('click',()=>go(index+Number(b.dataset.step)));
  for(const list of [thumbs,dots])list.addEventListener('click',e=>{const b=e.target.closest('button');if(b)go([...list.children].indexOf(b));});
  // Como nas lojas: no computador, passar o mouse na miniatura já mostra a vista (só com o mouse se movendo, não quando a
  // galeria abre debaixo de um mouse parado).
  thumbs.addEventListener('pointermove',e=>{const b=e.target.closest('button');if(b&&e.pointerType==='mouse')go([...thumbs.children].indexOf(b),{smooth:false});});
  // items: [{name, src, thumb?, alt}]. Mesma quantidade de vistas: troca só as imagens (a vista escolhida fica); senão, refaz tudo.
  function set(list,{reset=false,blobs=false}={}){
    const rebuilt=list.length!==items.length;
    if(rebuilt){
      track.replaceChildren(...list.map((item,i)=>{const slide=document.createElement('div');slide.className='gallery-slide';slide.setAttribute('role','group');slide.setAttribute('aria-roledescription','vista');const img=document.createElement('img');img.width=img.height=1000;img.decoding='async';img.draggable=false;if(i)img.loading='lazy';slide.append(img);return slide;}));
      thumbs.replaceChildren(...list.map(()=>{const b=document.createElement('button');b.type='button';const img=document.createElement('img');img.width=img.height=200;img.alt='';img.decoding='async';img.draggable=false;b.append(img);return b;}));
      dots.replaceChildren(...list.map(()=>{const b=document.createElement('button');b.type='button';b.append(document.createElement('i'));return b;}));
    }
    list.forEach((item,i)=>{
      const img=track.children[i].firstElementChild;if(img.getAttribute('src')!==item.src)img.src=item.src;img.alt=item.alt;
      track.children[i].setAttribute('aria-label',`${item.name}, ${i+1} de ${list.length}`);
      const mini=thumbs.children[i].firstElementChild,src=item.thumb||item.src;if(mini.getAttribute('src')!==src)mini.src=src;
      thumbs.children[i].setAttribute('aria-label',item.name);dots.children[i].setAttribute('aria-label',`${item.name}, ${i+1} de ${list.length}`);
    });
    // As imagens geradas aqui (blob:) saem da memória quando são trocadas.
    const old=owned;owned=blobs?list.map(item=>item.src):[];old.forEach(url=>URL.revokeObjectURL(url));
    items=list;
    if(reset||rebuilt||index>=list.length){index=0;target=null;track.scrollTo({left:0,behavior:'instant'});}
    mark();
  }
  return {set,go,busy(on){root.toggleAttribute('data-busy',on);},get index(){return index;},
    // lado do quadrado da imagem principal, em pixels da tela (para gerar as vistas sem desperdício)
    size(){const r=track.getBoundingClientRect();return Math.min(1000,Math.max(480,Math.ceil(Math.min(r.width,r.height||r.width)*(window.devicePixelRatio||1))));}};
}
