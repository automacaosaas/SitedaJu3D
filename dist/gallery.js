// Galeria de fotos da aba Foto, no jeito das lojas grandes: no computador, as miniaturas numa coluna à esquerda e a foto escolhida
// grande; no celular e no tablet, arrastar de lado, com os pontinhos embaixo. São fotos reais da peça (pedido de 04/10/2026: nem o 3D
// nem imagens geradas), recortadas por tools/galeria-vistas das fontes de design/vistas/; o 3D continua na aba ao lado.
// Cada peça: a cor do fundo das fotos (bg, para o quadro em volta delas, que não são quadradas) e as vistas, na ordem (a primeira abre a
// galeria). Peça ainda sem fotos reais: só a foto da vitrine.
export const GALLERY={
  borboletoscopio:{bg:'',views:{frente:'Frente','tres-quartos':'Três quartos',costas:'Costas',rosto:'Rostinho de perto',asa:'Asa de perto'}},
  dinossauroscopio:{bg:'',views:{frente:'Frente','tres-quartos':'Três quartos',lado:'Lado',tras:'Três quartos de trás',costas:'Costas',rosto:'Rosto de perto',crista:'Crista de perto',pes:'Pés de perto'}},
  aviaoscopia:{bg:'#f7f7f7',views:{frente:'Frente','tres-quartos':'Três quartos',costas:'Costas',numeros:'Aberturas de perto',asa:'Asa e motor de perto'}}
};
export const viewsOf=key=>Object.entries(GALLERY[key]?.views||{frente:'Frente'}).map(([id,name])=>({id,name}));
export const realPhotos=key=>!!GALLERY[key];
export const galleryBg=key=>GALLERY[key]?.bg||'';
// Mude junto com as imagens de assets/vistas/ para quem tem a versão antiga no cache buscar a nova.
export const VIEWS_VERSION='4';
export const staticViews=key=>viewsOf(key).map(view=>({...view,src:`assets/vistas/${key}-${view.id}.webp?v=${VIEWS_VERSION}`,thumb:`assets/vistas/${key}-${view.id}-mini.webp?v=${VIEWS_VERSION}`}));

export function createGallery(root,{onChange}={}){
  const track=root.querySelector('.gallery-track'),rail=root.querySelector('.gallery-rail'),dots=root.querySelector('.gallery-dots');
  const prev=root.querySelector('[data-step="-1"]'),next=root.querySelector('[data-step="1"]');
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  let items=[],index=0,target=null,targetTimer=0;
  function mark(){
    [...track.children].forEach((slide,i)=>slide.setAttribute('aria-hidden',String(i!==index)));
    for(const list of [rail,dots])[...list.children].forEach((b,i)=>b.setAttribute('aria-current',String(i===index)));
    prev.disabled=index===0;next.disabled=index===items.length-1;
    onChange?.(index,items[index]);
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
  for(const list of [rail,dots])list.addEventListener('click',e=>{const b=e.target.closest('button');if(b)go([...list.children].indexOf(b));});
  // Como nas lojas: no computador, passar o mouse na miniatura já mostra a vista (só com o mouse se movendo, não quando a
  // galeria abre debaixo de um mouse parado).
  rail.addEventListener('pointermove',e=>{const b=e.target.closest('button');if(b&&e.pointerType==='mouse')go([...rail.children].indexOf(b),{smooth:false});});
  // items: [{name, src, thumb, alt}]. Outra peça: refaz as imagens e volta para a primeira vista.
  function set(list){
    if(list.length!==items.length){
      track.replaceChildren(...list.map((item,i)=>{const slide=document.createElement('div');slide.className='gallery-slide';slide.setAttribute('role','group');slide.setAttribute('aria-roledescription','vista');const img=document.createElement('img');img.width=img.height=1000;img.decoding='async';img.draggable=false;if(i)img.loading='lazy';slide.append(img);return slide;}));
      rail.replaceChildren(...list.map(()=>{const b=document.createElement('button');b.type='button';const img=document.createElement('img');img.width=img.height=200;img.alt='';img.decoding='async';img.draggable=false;b.append(img);return b;}));
      dots.replaceChildren(...list.map(()=>{const b=document.createElement('button');b.type='button';b.append(document.createElement('i'));return b;}));
    }
    list.forEach((item,i)=>{
      const img=track.children[i].firstElementChild;img.src=item.src;img.alt=item.alt;
      track.children[i].setAttribute('aria-label',`${item.name}, ${i+1} de ${list.length}`);
      rail.children[i].firstElementChild.src=item.thumb;rail.children[i].setAttribute('aria-label',item.name);dots.children[i].setAttribute('aria-label',`${item.name}, ${i+1} de ${list.length}`);
    });
    root.toggleAttribute('data-single',list.length<2);items=list;index=0;target=null;track.scrollTo({left:0,behavior:'instant'});mark();
  }
  return {set,go,get index(){return index;},get current(){return items[index];}};
}
