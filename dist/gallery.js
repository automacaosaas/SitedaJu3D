// Galeria de fotos da aba Foto, no jeito das lojas grandes: no computador, as miniaturas numa coluna à esquerda e a foto escolhida
// grande; no celular e no tablet, arrastar de lado, com os pontinhos embaixo. Desde 05/10/2026 as fotos são renders do modelo 3D da peça
// (tools/render-vistas: luz de estúdio, cores da vitrine, alta resolução; as fotos recortadas das fontes comprimidas ficavam ruins),
// levadas para dist/assets/vistas por tools/galeria-vistas; o 3D que gira continua na aba ao lado.
// O padrão de toda peça: 6 fotos, todas no mesmo formato (4:5, 1200 x 1500) e com a peça do mesmo tamanho — frente, três quartos,
// três quartos de trás, costas, de cima e um detalhe de perto (que enche o quadro, como o zoom das lojas). Cada peça só diz qual é o detalhe dela. Peça sem fotos nem
// modelo: só a foto da vitrine.
export const STANDARD=[['frente','Frente'],['tres-quartos','Três quartos'],['tres-quartos-costas','Três quartos de trás'],['costas','Costas'],['de-cima','De cima'],['detalhe','Detalhe de perto']];
export const GALLERY={
  borboletoscopio:{detalhe:'Rostinho de perto'},
  dinossauroscopio:{detalhe:'Rosto de perto'},
  aviaoscopia:{detalhe:'Cabine de perto'},
  macacoscopio:{detalhe:'Rosto de perto'}
};
export const viewsOf=key=>GALLERY[key]?STANDARD.map(([id,name])=>({id,name:id==='detalhe'?GALLERY[key].detalhe:name,zoom:id==='detalhe'})):[{id:'frente',name:'Frente',zoom:false}];
export const hasGallery=key=>!!GALLERY[key];
// Mude junto com as imagens de assets/vistas/ para quem tem a versão antiga no cache buscar a nova.
export const VIEWS_VERSION='8';
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
      track.replaceChildren(...list.map((item,i)=>{const slide=document.createElement('div');slide.className='gallery-slide';slide.setAttribute('role','group');slide.setAttribute('aria-roledescription','vista');const img=document.createElement('img');img.width=1200;img.height=1500;img.decoding='async';img.draggable=false;if(i)img.loading='lazy';slide.append(img);return slide;}));
      rail.replaceChildren(...list.map(()=>{const b=document.createElement('button');b.type='button';const img=document.createElement('img');img.width=160;img.height=200;img.alt='';img.decoding='async';img.draggable=false;b.append(img);return b;}));
      dots.replaceChildren(...list.map(()=>{const b=document.createElement('button');b.type='button';b.append(document.createElement('i'));return b;}));
    }
    list.forEach((item,i)=>{
      const img=track.children[i].firstElementChild;img.src=item.src;img.alt=item.alt;
      track.children[i].classList.toggle('is-zoom',!!item.zoom);rail.children[i].classList.toggle('is-zoom',!!item.zoom);
      track.children[i].setAttribute('aria-label',`${item.name}, ${i+1} de ${list.length}`);
      rail.children[i].firstElementChild.src=item.thumb;rail.children[i].setAttribute('aria-label',item.name);dots.children[i].setAttribute('aria-label',`${item.name}, ${i+1} de ${list.length}`);
    });
    root.toggleAttribute('data-single',list.length<2);items=list;index=0;target=null;track.scrollTo({left:0,behavior:'instant'});mark();
  }
  return {set,go,get index(){return index;},get current(){return items[index];}};
}
