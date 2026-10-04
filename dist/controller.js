import {PRODUCTS,SOON,PALETTE,ALIASES,defaults,color,validSelection} from './products.js';
import {setupCartBridge} from './cart-bridge.js';
import {COMMERCE,money} from './commerce-config.js';
import {icon} from './icons.js';
import {staticViews,createGallery,realPhotos,galleryBg} from './gallery.js';
// Página de produto compacta: uma tela só (preço, cores, combinações prontas e compra sempre à vista);
// os detalhes ficam num painel com abas. Rotas: #produto/<peça> abre na imagem, #produto/<peça>/personalizar na prévia 3D.
// Novidade sem venda (SOON, cores fixas): #produto/<peça>/3d abre só para ver — foto e 3D, as cores da peça e um aviso no lugar da compra.
// A aba Foto é uma galeria de fotos reais da peça (frente, três quartos, detalhes…; gallery.js); sem elas, a foto da vitrine.
const $=selector=>document.querySelector(selector),dialog=$('#product-dialog'),sheet=$('#pdp-sheet'),storageKey='ju.colors.v1';
let saved={};try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}')||{};}catch{}
const selections=Object.fromEntries(Object.keys(PRODUCTS).map(key=>[key,validSelection(key,saved[key])]));
let activeProduct=null,selectedPart='body',view='photo',viewer=null,viewerImport=null,request=0,sheetOpener=null;
const photoNote=()=>`${gallery.current?.name} · ${realPhotos(activeProduct)?'foto real':preview()?'cores da peça':'cores da vitrine'}`;
const gallery=createGallery($('.image-area'),{onChange:()=>{if(view==='photo')$('.view-note').textContent=photoNote();}});
// Combinações prontas: as cores valem para as partes na ordem do produto (corpo, detalhes, motores).
export const PRESETS=[{id:'original',name:'Original'},{id:'pastel',name:'Pastel',colors:['pink','lilac','cream']},{id:'vibrante',name:'Vibrante',colors:['sky','orange','yellow']},{id:'surpresa',name:'Surpreenda-me'}];
export function presetSelection(key,preset,random=Math.random){
  const parts=PRODUCTS[key].parts;
  if(preset.id==='original')return defaults(key);
  if(preset.colors)return Object.fromEntries(parts.map((part,i)=>[part.id,preset.colors[i%preset.colors.length]]));
  const pool=PALETTE.map(c=>c.id),picked=[];
  for(const part of parts){const free=pool.filter(id=>!picked.includes(id));picked.push(free[Math.floor(random()*free.length)]);}
  return Object.fromEntries(parts.map((part,i)=>[part.id,picked[i]]));
}
export const pixPrice=cents=>cents-Math.round(cents*COMMERCE.pixDiscountBps/10000);
// Link de uma combinação (auditoria D3): #produto/<peça>/personalizar/<cor>.<cor>… reabre a peça nessas cores.
export const comboPath=(key,selection)=>`#produto/${key}/personalizar/${PRODUCTS[key].parts.map(part=>selection[part.id]).join('.')}`;
export function comboFrom(key,text){if(!PRODUCTS[key])return null;const ids=String(text||'').split('.');if(!ids[0])return null;return validSelection(key,Object.fromEntries(PRODUCTS[key].parts.map((part,i)=>[part.id,ids[i]])));}
function save(){try{localStorage.setItem(storageKey,JSON.stringify(selections));}catch{}}
const product=key=>PRODUCTS[key]||SOON[key],preview=()=>!PRODUCTS[activeProduct]&&!!SOON[activeProduct];
function hexColors(){if(!selections[activeProduct])return {};return Object.fromEntries(Object.entries(selections[activeProduct]).map(([id,value])=>[id,color(value).hex]));}
function announce(message){$('#color-announcement').textContent=message;}
function fillProduct(key){
  const p=product(key),soon=!PRODUCTS[key],price=COMMERCE.prices[key];
  $('#dialog-number').textContent=soon?'Novidade · em breve':'Ateliê de cores';
  $('#dialog-title').textContent=p.title;$('#dialog-subtitle').textContent=p.subtitle;$('#dialog-description').textContent=p.description;
  $('.image-area').style.setProperty('--gallery-bg',galleryBg(key)||null);gallery.set(staticViews(key).map(item=>({...item,alt:`${p.title} — ${item.name}`})));$('#fixed-note').textContent=soon?`Cores fixas: ${p.colors.map(c=>c.name).join(', ')}.`:p.fixed;
  if(soon){$('#fixed-colors').replaceChildren(...p.colors.map(c=>{const s=document.createElement('span');s.className='pdp-fixed-color';const dot=document.createElement('i');dot.style.background=c.hex;dot.setAttribute('aria-hidden','true');s.append(dot,c.name);return s;}));$('#fixed-text').textContent=p.description;}
  else{$('#product-price').textContent=money(price);$('#product-pix').textContent=`${money(pixPrice(price))} no Pix`;}
  $('#pdp-production').textContent=COMMERCE.productionLabel;
  document.title=`${p.title} | Ju imprime pra mim`;$('#share-link').hidden=true;
}
function syncProduct(){
  const [raw,step,combo]=location.hash.replace('#produto/','').split('/'),key=ALIASES[raw]||raw;
  // a novidade só abre aqui pela rota /3d; #produto/<novidade> continua só levando a vitrine até ela
  if(!PRODUCTS[key]&&!(SOON[key]&&step==='3d')){if(dialog.open)dialog.close();document.title='Ju imprime pra mim • Coleção 3D';return;}
  const soon=!PRODUCTS[key];
  // Uma combinação compartilhada vira as cores da peça; o endereço volta ao normal para não prender as próximas escolhas.
  const shared=step==='personalizar'?comboFrom(key,combo):null;
  if(shared){selections[key]=shared;save();history.replaceState(null,'',`#produto/${key}/personalizar`);if(key===activeProduct&&dialog.open)updateControls();}
  const changed=key!==activeProduct||!dialog.open;activeProduct=key;dialog.dataset.mode=soon?'preview':'compact';
  if(changed){fillProduct(key);selectedPart='body';closeSheet(false);if(!soon)renderControls();}
  if(!dialog.open)dialog.showModal();lockPage();
  if(step==='personalizar'||step==='3d'){if(changed||view!=='model')setView('model');if(!soon)requestAnimationFrame(()=>$('#palette [aria-checked="true"]')?.focus({preventScroll:true}));}
  else if(changed)setView('photo');
}
let lockedScroll=null;
function lockPage(){if(lockedScroll!==null)return;lockedScroll=window.scrollY;document.documentElement.classList.add('modal-open');Object.assign(document.body.style,{position:'fixed',top:`-${lockedScroll}px`,width:'100%',overflow:'hidden'});}
function unlockPage(){if(lockedScroll===null)return;const y=lockedScroll;lockedScroll=null;document.documentElement.classList.remove('modal-open');Object.assign(document.body.style,{position:'',top:'',width:'',overflow:''});window.scrollTo(0,y);}
function closeProduct(){history.replaceState(null,'',location.pathname+location.search);dialog.close();document.title='Ju imprime pra mim • Coleção 3D';}
function viewerError(){const msg=$('.viewer-message');msg.hidden=false;msg.textContent='A prévia 3D não está disponível neste navegador. Você pode continuar escolhendo as cores e consultar a imagem do produto.';$('.viewer-tools').hidden=true;viewer?.dispose();viewer=null;}
async function setView(next){
  view=next;const id=++request;
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===next)));
  $('.image-area').hidden=next!=='photo';$('#viewer-host').hidden=next!=='model';
  $('.viewer-tools').hidden=true;$('.viewer-message').hidden=true;
  $('.view-note').textContent=next==='photo'?photoNote():preview()?'Arraste para girar e ver cada detalhe.':'Arraste para girar · as cores mudam na hora.';
  dialog.dataset.view=next;
  if(next==='photo'){viewer?.hide();return;}
  $('.viewer-message').hidden=false;$('.viewer-message').textContent='Preparando sua prévia 3D…';
  try{
    viewerImport??=import('./viewer.js');const {ProductViewer}=await viewerImport;
    if(id!==request||!dialog.open||view!=='model')return;
    viewer??=new ProductViewer($('#viewer-host'),viewerError);
    const shown=await viewer.show(activeProduct,hexColors(),product(activeProduct).title);
    if(!shown||id!==request||!dialog.open||view!=='model')return;
    $('.viewer-message').hidden=true;$('.viewer-tools').hidden=false;
  }catch(error){
    if(error.name==='AbortError'||id!==request)return;
    console.error('Visualização 3D indisponível:',error);viewerError();
  }
}
function renderControls(){
  const p=PRODUCTS[activeProduct];
  $('#part-tabs').replaceChildren(...p.parts.map(part=>{const b=document.createElement('button');b.type='button';b.dataset.part=part.id;b.innerHTML='<span class="part-dot" aria-hidden="true"></span><span></span>';b.lastElementChild.textContent=part.name;return b;}));
  $('#palette').replaceChildren(...PALETTE.map(value=>{const b=document.createElement('button');b.type='button';b.className='swatch';b.dataset.color=value.id;b.setAttribute('role','radio');b.setAttribute('aria-label',value.name);b.title=value.name;b.style.setProperty('--swatch',value.hex);b.style.setProperty('--check',['yellow','cream','mint','white'].includes(value.id)?'#332b32':'#fff');const swatch=document.createElement('i');swatch.setAttribute('aria-hidden','true');b.append(swatch);return b;}));
  $('#presets').replaceChildren(...PRESETS.map(preset=>{const b=document.createElement('button');b.type='button';b.dataset.preset=preset.id;const dots=document.createElement('span');dots.className='preset-dots';dots.setAttribute('aria-hidden','true');if(preset.id!=='surpresa')for(const id of Object.values(presetSelection(activeProduct,preset))){const i=document.createElement('i');i.style.background=color(id).hex;dots.append(i);}else dots.textContent='✦';const label=document.createElement('span');label.textContent=preset.name;b.append(dots,label);return b;}));
  updateControls();
}
function updateControls(){
  const s=selections[activeProduct],p=PRODUCTS[activeProduct],part=p.parts.find(item=>item.id===selectedPart);
  document.querySelectorAll('#part-tabs [data-part]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.part===selectedPart));b.querySelector('.part-dot').style.background=color(s[b.dataset.part]).hex;});
  document.querySelectorAll('#palette [data-color]').forEach(b=>{const on=b.dataset.color===s[selectedPart];b.setAttribute('aria-checked',String(on));b.tabIndex=on?0:-1;});
  $('#selected-color').textContent=`${part.name}: ${color(s[selectedPart]).name}`;$('#part-hint').textContent=part.hint;
  $('#pdp-preview-dots').replaceChildren(...p.parts.map(item=>{const i=document.createElement('i');i.style.background=color(s[item.id]).hex;i.title=`${item.name}: ${color(s[item.id]).name}`;return i;}));
  viewer?.update(hexColors());revealSwatch();
}
// No celular as cores ficam numa fileira que rola de lado: a escolhida fica sempre à vista.
function revealSwatch(){const row=$('#palette'),b=row.querySelector('[aria-checked="true"]');if(!b||row.scrollWidth<=row.clientWidth+1)return;row.scrollTo({left:Math.max(0,b.offsetLeft-(row.clientWidth-b.offsetWidth)/2),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
// As fotos mostram só as cores da vitrine: ao escolher uma cor, a prévia passa para o 3D.
function applyColors(next,message){selections[activeProduct]=validSelection(activeProduct,next);updateControls();save();announce(message);if(view!=='model')setView('model');}
function chooseColor(id){applyColors({...selections[activeProduct],[selectedPart]:id},`${PRODUCTS[activeProduct].parts.find(p=>p.id===selectedPart).name}: ${color(id).name}.`);}

// ── Painel "Sobre a peça" (abas) ──
const tabs=[...sheet.querySelectorAll('[role="tab"]')],panels=[...sheet.querySelectorAll('[role="tabpanel"]')];
function showTab(n,focus=false){tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===n));tab.tabIndex=i===n?0:-1;});panels.forEach((panel,i)=>{panel.hidden=i!==n;});if(focus)tabs[n].focus();}
function openSheet(n,opener){sheetOpener=opener;showTab(n);sheet.hidden=false;dialog.classList.add('sheet-open');requestAnimationFrame(()=>{sheet.classList.add('is-open');tabs[n].focus({preventScroll:true});});}
function closeSheet(restoreFocus=true){if(sheet.hidden)return;sheet.classList.remove('is-open');dialog.classList.remove('sheet-open');sheet.hidden=true;if(restoreFocus)sheetOpener?.focus({preventScroll:true});sheetOpener=null;}
document.querySelectorAll('[data-sheet]').forEach(b=>{b.insertAdjacentHTML('afterbegin',icon(b.dataset.icon));b.addEventListener('click',()=>openSheet(Number(b.dataset.sheet),b));});
tabs.forEach((tab,i)=>tab.addEventListener('click',()=>showTab(i)));
sheet.addEventListener('keydown',e=>{const i=tabs.indexOf(document.activeElement);if(i<0||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();showTab(e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length,true);});
$('.pdp-sheet-close').addEventListener('click',()=>closeSheet());
// No celular, as combinações prontas e o link das cores saem da tela da peça e ficam no (i), na aba Cores (já abertas).
const more=$('.pdp-more'),moreHome=more.parentElement,phone=matchMedia('(max-width: 600px)');
function placeMore(){if(phone.matches){more.open=true;$('#pdp-panel-1').prepend(more);}else if(more.parentElement!==moreHome){moreHome.append(more);more.open=false;}}
phone.addEventListener('change',placeMore);placeMore();
// (i) no topo: abre "Sobre a peça" nos detalhes.
$('#pdp-info').insertAdjacentHTML('afterbegin',icon('info'));$('#pdp-info').addEventListener('click',e=>openSheet(0,e.currentTarget));

$('.close').addEventListener('click',closeProduct);
dialog.addEventListener('cancel',e=>{e.preventDefault();if(!sheet.hidden)closeSheet();else closeProduct();});
// Esc com o painel aberto fecha só o painel, mesmo quando o navegador não deixa segurar o "cancel" (sem um clique antes).
dialog.addEventListener('keydown',e=>{if(e.key==='Escape'&&!sheet.hidden){e.preventDefault();closeSheet();}});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeProduct();}});
dialog.addEventListener('close',()=>{++request;viewer?.hide();closeSheet(false);unlockPage();document.querySelector(`[data-product="${activeProduct}"]`)?.focus({preventScroll:true});});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$('#part-tabs').addEventListener('click',e=>{const b=e.target.closest('[data-part]');if(!b)return;selectedPart=b.dataset.part;updateControls();});
$('#palette').addEventListener('click',e=>{const b=e.target.closest('[data-color]');if(b)chooseColor(b.dataset.color);});
// Cores como grupo de opções: as setas trocam a cor e levam o foco junto.
$('#palette').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const ids=PALETTE.map(c=>c.id),i=ids.indexOf(selections[activeProduct][selectedPart]),next=ids[(i+(['ArrowRight','ArrowDown'].includes(e.key)?1:-1)+ids.length)%ids.length];chooseColor(next);$(`#palette [data-color="${next}"]`)?.focus();});
// Compartilhar estas cores: no celular, o menu de compartilhar; no computador, o link copiado.
$('#share-colors').insertAdjacentHTML('afterbegin',icon('link'));
$('#share-colors').addEventListener('click',async()=>{
  const p=PRODUCTS[activeProduct],url=new URL(comboPath(activeProduct,selections[activeProduct]),location.href).href;
  const text=`${p.title}: ${p.parts.map(part=>`${part.name} ${color(selections[activeProduct][part.id]).name}`).join(', ')}`;
  try{if(navigator.share&&matchMedia('(pointer: coarse)').matches){await navigator.share({title:p.title,text,url});return;}await navigator.clipboard.writeText(url);announce('Link das cores copiado. Quem abrir vê a peça nesta combinação.');}
  catch(error){if(error?.name==='AbortError')return;const field=$('#share-link');field.value=url;field.hidden=false;field.focus();field.select();announce(`Copie o link: ${url}`);}
});
$('#presets').addEventListener('click',e=>{const b=e.target.closest('[data-preset]');if(!b)return;const preset=PRESETS.find(p=>p.id===b.dataset.preset);applyColors(presetSelection(activeProduct,preset),`Combinação ${preset.name} aplicada.`);});
document.querySelectorAll('[data-camera]').forEach(b=>b.addEventListener('click',()=>{if(!viewer)return;const a=b.dataset.camera;if(a==='left'||a==='right')viewer.rotate(a==='left'?-1:1);else if(a==='in'||a==='out')viewer.zoom(a==='in'?1:-1);else if(a==='reset')viewer.reset();else{const auto=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(auto));b.textContent=auto?'Pausar':'Girar';b.setAttribute('aria-label',auto?'Pausar giro automático':'Girar automaticamente');viewer.setAuto(auto);}}));
window.addEventListener('hashchange',syncProduct);window.addEventListener('pagehide',()=>viewer?.hide());syncProduct();
setupCartBridge({getProduct:()=>activeProduct,getSelection:()=>({...selections[activeProduct]}),capture:()=>{try{return view==='model'&&viewer?.key===activeProduct?viewer.snapshot():null;}catch{return null;}},restore:selection=>{selections[activeProduct]=validSelection(activeProduct,selection);renderControls();setView('model');}});
