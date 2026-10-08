import {PRODUCTS,SOON,PALETTE,PALETTE_GROUPS,ALIASES,defaults,color,paint,isLight,validSelection,fixedColors,showcase,badgeStyle} from './products.js';
import {setupCartBridge} from './cart-bridge.js';
import {COMMERCE,money,installmentLabel,kitOffer,kitOf} from './commerce-config.js';
import {icon} from './icons.js';
import {staticViews,createGallery} from './gallery.js';
import {fillDescription} from './contact-link.js';
import {setupPurchaseSheet} from './purchase-sheet.js';
import {journeyColors} from './hero-motion.js';
import {mountKit} from './kit-builder.js';
import {readCart,writeCart,putItems,totals,DIRECT_KEY} from './cart-store.js';
import {openMiniCart,addedItemId} from './mini-cart.js';
import {shineBadge,wireBadge} from './badge-shine.js';
import {whenStyled} from './late-css.js';
// Página de produto compacta: uma tela só (preço, cores, combinações prontas e compra sempre à vista);
// os detalhes ficam num painel com abas. Rotas: #produto/<peça> abre na imagem, #produto/<peça>/personalizar na prévia 3D.
// Novidade sem venda (SOON, cores fixas): #produto/<peça>/3d abre só para ver — foto e 3D, as cores da peça e um aviso no lugar da compra.
// Peça de cores fixas à venda (as lâmpadas, data-fixed): as cores dela no lugar das escolhas, com o preço, a oferta do kit e a compra.
// A aba Foto é uma galeria de fotos reais da peça (frente, três quartos, detalhes…; gallery.js); sem elas, a foto da vitrine.
// As cores da janela são as da peça aberta (07/10/2026): a vitrine não anda mais quando a peça abre por um card, então a janela não pode
// herdar as cores da página (journey.js); fillProduct põe nela o --theme-* da própria peça. Ao fechar, o foco volta a quem a abriu.
// As lâmpadas (um kit em COMMERCE.kits) ganham "Monte seu kit" na área branca (kit-builder.js), e a frase do kit sai da barra de compra.
// Uma compra só (08/10/2026): o kit escolhe as peças e a barra compra o que foi montado (preço, Pix, "3x" e os dois botões seguem o kit).
const $=selector=>document.querySelector(selector),dialog=$('#product-dialog'),sheet=$('#pdp-sheet'),storageKey='ju.colors.v1';
const calm=matchMedia('(prefers-reduced-motion: reduce)');
let saved={};try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}')||{};}catch{}
const selections=Object.fromEntries(Object.keys(PRODUCTS).map(key=>[key,validSelection(key,saved[key])]));
let activeProduct=null,selectedPart='body',view='photo',viewer=null,viewerImport=null,request=0,sheetOpener=null,opener=null,trigger=null;
// na aba Foto não há nota embaixo: as fotos falam por si (o nome de cada uma fica nas miniaturas e nos pontinhos, para leitores de tela)
const gallery=createGallery($('.image-area'));
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
// as cores escolhidas, parte por parte, como as cores da paleta (com o acabamento de cada uma: o 3D brilha como o filamento)
function chosenColors(){if(!selections[activeProduct])return {};return Object.fromEntries(Object.entries(selections[activeProduct]).map(([id,value])=>[id,color(value)]));}
function announce(message){$('#color-announcement').textContent=message;}
// O topo da janela (as cores da peça, o sobretítulo, o nome): é o que aparece no primeiro quadro, antes do showModal (movimento 8).
function fillHead(key){
  const p=product(key),soon=!PRODUCTS[key],fixed=fixedColors(key);
  for(const [name,value] of Object.entries(journeyColors(showcase(key).theme)))dialog.style.setProperty(name,value);
  // o sobretítulo; com `badge` (products.js: as lâmpadas) vira o selo "Novidade", nas cores do dado (badgeStyle); `eyebrowEffect` diz
  // qual é ('rainbow' só no unicórnio, 'shine' nas outras). product-page.css .is-badge
  const eyebrow=$('#dialog-number');eyebrow.textContent=soon?'Novidade · em breve':fixed?'Novidade':'Ateliê de cores';eyebrow.classList.toggle('is-badge',!!p.badge);eyebrow.style.cssText=badgeStyle(key);
  if(p.badge)eyebrow.dataset.effect=p.eyebrowEffect||'shine';else delete eyebrow.dataset.effect;
  $('#dialog-title').textContent=p.title;$('#dialog-subtitle').textContent=p.subtitle;
  document.title=`${p.title} | Ju imprime pra mim`;
}
function fillProduct(key){
  const p=product(key),soon=!PRODUCTS[key],fixed=fixedColors(key),price=COMMERCE.prices[key];
  fillDescription($('#dialog-description'),p.description,p.title);
  gallery.set(staticViews(key).map(item=>({...item,alt:`${p.title} — ${item.name}`})));$('#fixed-note').textContent=soon||fixed?`Cores fixas: ${p.colors.map(c=>c.name).join(', ')}.`:p.fixed;
  if(soon||fixed){$('#fixed-colors').replaceChildren(...p.colors.map(c=>{const s=document.createElement('span');s.className='pdp-fixed-color';const dot=document.createElement('i');dot.style.background=c.hex;dot.setAttribute('aria-hidden','true');s.append(dot,c.name);return s;}));$('#fixed-text').textContent=p.description;}
  const kitHost=$('#pdp-kit');kitHost.hidden=soon||!fixed||!kitOf(key);kitPick=null;
  if(!soon){paintPrice(price);
    // o 2.º da mesma peça mais barato (COMMERCE.extraPrices: hoje, o avião); as lâmpadas, o kit (COMMERCE.kits: 2 por R$ 160, 3 por R$ 210).
    // Com o "Monte seu kit" à vista, a frase do kit sai da barra (fica no HTML para quem não tem o bloco).
    const extra=COMMERCE.extraPrices?.[key],kit=kitOffer(key),offer=$('#product-offer');offer.hidden=!extra&&(!kit||!kitHost.hidden);offer.textContent=extra?`Levando 2, o segundo sai por ${money(extra)}`:kit;}
  // "Monte seu kit": só nas peças de cores fixas à venda que fazem parte de um kit (as lâmpadas); começa com esta peça, 1 unidade, e a
  // barra de compra segue o que se monta nele (paintKit)
  mountKit(kitHost.querySelector('.pdp-kit-body'),{current:kitHost.hidden?null:key,onChange:paintKit});
  $('#pdp-production').textContent=COMMERCE.productionLabel;$('#share-link').hidden=true;
}
// O preço da barra: o da peça, ou o do kit montado (com o preço cheio riscado quando há desconto). Kit vazio: R$ 0,00, o aviso no lugar
// do "3x" e os dois botões avisando em vez de comprar (aria-disabled: continuam no Tab e dizem o porquê).
function paintPrice(cents,full=cents,pix=pixPrice(cents)){
  $('#product-price').textContent=money(cents);const struck=$('#product-full');struck.textContent=money(full);struck.hidden=!(full>cents);
  $('#product-pix').textContent=`${money(pix)} no Pix`;$('#product-pix').hidden=!cents;
  $('#product-installments').textContent=cents?`ou ${installmentLabel(cents)} sem juros no cartão`:'Escolha pelo menos uma peça.';
  for(const b of [$('#add-to-cart'),$('#buy-now')])b.setAttribute('aria-disabled',String(!cents));
  if(cents)$('#purchase-status').textContent='';
}
let kitPick=null;
function paintKit(quote){kitPick=quote;paintPrice(quote.total,quote.full,quote.pix);}
function syncProduct(hash=location.hash){
  const [raw,step,combo]=hash.replace('#produto/','').split('/'),key=ALIASES[raw]||raw;
  // a novidade só abre aqui pela rota /3d; #produto/<novidade> continua só levando a vitrine até ela. #produto/<peça>/encaixe é a
  // demonstração na vitrine (carousel.js): a janela da peça não abre por cima dela
  if(step==='encaixe'||(!PRODUCTS[key]&&!(SOON[key]&&step==='3d'))){if(dialog.open)closeDialog();document.title='Ju imprime pra mim • Coleção 3D';return;}
  const soon=!PRODUCTS[key];
  // Uma combinação compartilhada vira as cores da peça; o endereço volta ao normal para não prender as próximas escolhas.
  const shared=step==='personalizar'?comboFrom(key,combo):null;
  if(shared){selections[key]=shared;save();history.replaceState(null,'',`#produto/${key}/personalizar`);if(key===activeProduct&&dialog.open)updateControls();}
  const changed=key!==activeProduct||!dialog.open||!!closing;cancelClose();activeProduct=key;dialog.dataset.mode=soon?'preview':'compact';dialog.toggleAttribute('data-fixed',!soon&&fixedColors(key));
  if(changed){fillHead(key);selectedPart='body';closeSheet(false);}
  // Movimento 8 (08/10/2026): a janela entra já no quadro do toque, só com o topo; a galeria, as cores, o kit e a trava da página vêm
  // dois quadros depois, enquanto ela ainda está quase transparente (a entrada começa em opacidade 0). Até lá o miolo fica parado no
  // começo da entrada, invisível (.is-filling): nunca a foto e o preço da peça de antes debaixo do nome da nova, nem num celular lento.
  // Com movimento reduzido a janela aparece inteira de uma vez, então tudo vem no mesmo quadro.
  const opening=!dialog.open,later=opening&&!calm.matches,asked=request;
  if(opening){const focused=document.activeElement;opener=focused&&focused!==document.body?focused:trigger&&performance.now()-trigger.at<1500?trigger.link:null;dialog.classList.toggle('is-filling',later);dialog.showModal();}if(opening){const badge=$('#dialog-number');wireBadge(badge);shineBadge(badge);}trigger=null;
  const rest=()=>{
    if(activeProduct!==key||!dialog.open)return;lockPage();
    if(changed){fillProduct(key);if(!soon&&!fixedColors(key))renderControls();}
    dialog.classList.remove('is-filling');
    // a vista já escolhida nesse meio-tempo vale (o cart-bridge.js reabre no 3D a peça que se edita do carrinho)
    if(request!==asked)return;
    if(step==='personalizar'||step==='3d'){if(changed||view!=='model')setView('model');if(!soon&&!fixedColors(key))requestAnimationFrame(()=>$('#palette [aria-checked="true"]')?.focus({preventScroll:true}));}
    else if(changed)setView('photo');
  };
  if(later)requestAnimationFrame(()=>requestAnimationFrame(rest));else rest();
}
let lockedScroll=null;
function lockPage(){if(lockedScroll!==null)return;lockedScroll=window.scrollY;document.documentElement.classList.add('modal-open');Object.assign(document.body.style,{position:'fixed',top:`-${lockedScroll}px`,width:'100%',overflow:'hidden'});}
function unlockPage(){if(lockedScroll===null)return;const y=lockedScroll;lockedScroll=null;document.documentElement.classList.remove('modal-open');Object.assign(document.body.style,{position:'',top:'',width:'',overflow:''});window.scrollTo(0,y);}
// Fechar (movimento 12, 08/10/2026): a janela desce um pouco e esmaece com o fundo (180 ms) antes do close() de verdade. Fecha na hora com
// movimento reduzido e quando o código fecha para abrir outra coisa (o mini-carrinho depois de adicionar, o clique sintético do
// cart-bridge.js): assim o foco já voltou a quem abriu a janela quando o mini-carrinho guarda o seu.
let closing=null;
function closeDialog(animate=true){
  if(!dialog.open||closing)return;
  if(!animate||calm.matches){dialog.close();return;}
  dialog.classList.add('is-closing');const token=closing={};setTimeout(()=>{if(closing===token)finishClose();},400);
}
function finishClose(){closing=null;dialog.classList.remove('is-closing');if(dialog.open)dialog.close();}
function cancelClose(){if(!closing)return;closing=null;dialog.classList.remove('is-closing');}
dialog.addEventListener('animationend',e=>{if(e.target===dialog&&closing&&/^pd-(out|down)$/.test(e.animationName))finishClose();});
function closeProduct(animate=true){history.replaceState(null,'',location.pathname+location.search);closeDialog(animate);document.title='Ju imprime pra mim • Coleção 3D';}
function viewerError(){const msg=$('.viewer-message');msg.hidden=false;msg.textContent='A prévia 3D não está disponível neste navegador. Você pode continuar escolhendo as cores e consultar a imagem do produto.';$('.viewer-tools').hidden=true;viewer?.dispose();viewer=null;}
async function setView(next){
  view=next;const id=++request;
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===next)));
  $('.image-area').hidden=next!=='photo';$('#viewer-host').hidden=next!=='model';
  $('.viewer-tools').hidden=true;$('.viewer-message').hidden=true;
  // a dica do 3D; nas peças de personalizar em duas partes, para o celular deixar só "Arraste para girar" ao lado do Surpreenda-me
  const note=$('.view-note');if(next==='photo')note.textContent='';else if(preview()||fixedColors(activeProduct))note.textContent='Arraste para girar e ver cada detalhe.';
  else{const more=document.createElement('span');more.className='view-note-more';more.textContent=' · as cores mudam na hora.';note.replaceChildren('Arraste para girar',more);}
  dialog.dataset.view=next;
  if(next==='photo'){viewer?.hide();return;}
  $('.viewer-message').hidden=false;$('.viewer-message').textContent='Preparando sua prévia 3D…';
  try{
    viewerImport??=import('./viewer.js');const {ProductViewer}=await viewerImport;
    if(id!==request||!dialog.open||view!=='model')return;
    viewer??=new ProductViewer($('#viewer-host'),viewerError);
    const shown=await viewer.show(activeProduct,chosenColors(),product(activeProduct).title);
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
  // as cores em grupos (foscas, com brilho, multicor), o nome de cada grupo antes das bolinhas dele; a bolinha é o degradê do filamento
  $('#palette').replaceChildren(...PALETTE_GROUPS.flatMap(group=>{const label=document.createElement('span');label.className='palette-group';label.setAttribute('aria-hidden','true');label.textContent=group.name;
    return [label,...PALETTE.filter(value=>value.group===group.id).map(value=>{const b=document.createElement('button');b.type='button';b.className='swatch';b.dataset.color=value.id;if(value.finish)b.dataset.finish=value.finish;b.setAttribute('role','radio');b.setAttribute('aria-label',value.name);b.title=value.name;b.style.setProperty('--swatch',paint(value));b.style.setProperty('--check',isLight(value)?'#332b32':'#fff');const swatch=document.createElement('i');swatch.setAttribute('aria-hidden','true');b.append(swatch);return b;})];}));
  $('#presets').replaceChildren(...PRESETS.filter(preset=>preset.id!=='surpresa').map(preset=>{const b=document.createElement('button');b.type='button';b.dataset.preset=preset.id;const dots=document.createElement('span');dots.className='preset-dots';dots.setAttribute('aria-hidden','true');if(preset.id!=='surpresa')for(const id of Object.values(presetSelection(activeProduct,preset))){const i=document.createElement('i');i.style.background=paint(color(id));dots.append(i);}else dots.textContent='✦';const label=document.createElement('span');label.textContent=preset.name;b.append(dots,label);return b;}));
  updateControls();
}
function updateControls(){
  const s=selections[activeProduct],p=PRODUCTS[activeProduct],part=p.parts.find(item=>item.id===selectedPart);
  document.querySelectorAll('#part-tabs [data-part]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.part===selectedPart));b.querySelector('.part-dot').style.background=paint(color(s[b.dataset.part]));});
  document.querySelectorAll('#palette [data-color]').forEach(b=>{const on=b.dataset.color===s[selectedPart];b.setAttribute('aria-checked',String(on));b.tabIndex=on?0:-1;});
  const chosen=color(s[selectedPart]);$('#selected-color').textContent=`${part.name}: ${chosen.name}${chosen.note?` · ${chosen.note}`:''}`;$('#part-hint').textContent=part.hint;
  $('#pdp-preview-dots').replaceChildren(...p.parts.map(item=>{const i=document.createElement('i');i.style.background=paint(color(s[item.id]));i.title=`${item.name}: ${color(s[item.id]).name}`;return i;}));
  viewer?.update(chosenColors());revealSwatch();
}
// No celular as cores ficam numa fileira que rola de lado: a escolhida fica sempre à vista. Só lá a fileira rola (product-page.css,
// até 600 px), e a medida fica para o quadro seguinte: lida logo depois das escritas da janela, ela refazia o layout no meio da
// abertura (150 ms com a CPU 4x mais lenta, 08/10/2026).
const swatchRow=matchMedia('(max-width: 600px)');let swatchFrame=0;
function revealSwatch(){if(!swatchRow.matches)return;cancelAnimationFrame(swatchFrame);swatchFrame=requestAnimationFrame(()=>{const row=$('#palette'),b=row.querySelector('[aria-checked="true"]');if(!b||row.scrollWidth<=row.clientWidth+1)return;row.scrollTo({left:Math.max(0,b.offsetLeft-(row.clientWidth-b.offsetWidth)/2),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});});}
// As fotos mostram só as cores da vitrine: ao escolher uma cor, a prévia passa para o 3D.
function applyColors(next,message){selections[activeProduct]=validSelection(activeProduct,next);updateControls();save();announce(message);if(view!=='model')setView('model');}
function chooseColor(id){const c=color(id);applyColors({...selections[activeProduct],[selectedPart]:id},`${PRODUCTS[activeProduct].parts.find(p=>p.id===selectedPart).name}: ${c.name}${c.note?` · ${c.note}`:''}.`);}

// ── Painel "Sobre a peça" (abas) ──
const tabs=[...sheet.querySelectorAll('[role="tab"]')],panels=[...sheet.querySelectorAll('[role="tabpanel"]')];
function showTab(n,focus=false){tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===n));tab.tabIndex=i===n?0:-1;});panels.forEach((panel,i)=>{panel.hidden=i!==n;});if(focus)tabs[n].focus();}
// O painel segura o foco (usabilidade 6): enquanto está aberto, o resto da janela fica inerte. Ele sai deslizando (movimento 12); ao
// fechar junto com a janela (ou com movimento reduzido), some na hora.
const sheetOpen=()=>!sheet.hidden&&!sheet.classList.contains('is-leaving');let sheetTimer=0;
function openSheet(n,opener){clearTimeout(sheetTimer);sheet.classList.remove('is-leaving');sheetOpener=opener;showTab(n);dialog.scrollTop=0;sheet.hidden=false;dialog.classList.add('sheet-open');for(const el of dialog.children)el.inert=el!==sheet;requestAnimationFrame(()=>{sheet.classList.add('is-open');tabs[n].focus({preventScroll:true});});}
function closeSheet(restoreFocus=true){
  if(sheet.hidden)return;clearTimeout(sheetTimer);sheet.classList.remove('is-open');dialog.classList.remove('sheet-open');for(const el of dialog.children)el.inert=false;
  if(restoreFocus)sheetOpener?.focus({preventScroll:true});sheetOpener=null;
  if(!restoreFocus||calm.matches){sheet.classList.remove('is-leaving');sheet.hidden=true;return;}
  sheet.classList.add('is-leaving');sheetTimer=setTimeout(()=>{sheet.classList.remove('is-leaving');sheet.hidden=true;},260);
}
tabs.forEach((tab,i)=>tab.addEventListener('click',()=>showTab(i)));
sheet.addEventListener('keydown',e=>{const i=tabs.indexOf(document.activeElement);if(i<0||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();showTab(e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length,true);});
$('.pdp-sheet-close').addEventListener('click',()=>closeSheet());
// No celular, as combinações prontas e o link das cores saem da tela da peça e ficam no (i), na aba Cores (já abertas).
const more=$('.pdp-more'),moreHome=more.parentElement,phone=matchMedia('(max-width: 600px)');
function placeMore(){if(phone.matches){more.open=true;$('#pdp-panel-1').prepend(more);}else if(more.parentElement!==moreHome){moreHome.append(more);more.open=false;}}
phone.addEventListener('change',placeMore);placeMore();
// (i) no topo: abre "Sobre a peça" nos detalhes.
$('#pdp-info').insertAdjacentHTML('afterbegin',icon('info'));$('#pdp-info').addEventListener('click',e=>openSheet(0,e.currentTarget));

// o clique de verdade anima a saída; o sintético (cart-bridge.js, que fecha para abrir o mini-carrinho ou voltar ao carrinho) fecha na hora
$('.close').addEventListener('click',e=>closeProduct(e.isTrusted));
dialog.addEventListener('cancel',e=>{e.preventDefault();if(sheetOpen())closeSheet();else closeProduct();});
// Esc com o painel aberto fecha só o painel, mesmo quando o navegador não deixa segurar o "cancel" (sem um clique antes).
dialog.addEventListener('keydown',e=>{if(e.key==='Escape'&&sheetOpen()){e.preventDefault();closeSheet();}});
// fora da janela fecha a janela; com o painel aberto, um clique na parte inerte da janela fecha só o painel
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeProduct();else if(sheetOpen())closeSheet();}});
dialog.addEventListener('close',()=>{++request;viewer?.hide();closeSheet(false);unlockPage();restoreFocus();});
// Quem abriu a janela (o card, a vitrine, um link) ganha o foco de volta. O Safari não foca um link no clique: vale o último link
// #produto/… clicado. Sem nenhum dos dois (a página abriu já na peça), o botão do card da peça ou a peça da frente da vitrine.
document.addEventListener('click',e=>{const link=e.target.closest?.('a[href*="#produto/"]');trigger=link?{link,at:performance.now()}:null;},true);
function restoreFocus(){
  const back=opener;opener=null;
  if(back?.isConnected&&!back.closest('[inert]')&&back.getClientRects().length){back.focus({preventScroll:true});return;}
  document.querySelector(`.product-rail-card.is-active[data-product-id="${activeProduct}"] .product-customize, .slot[data-front="true"][data-product="${activeProduct}"]`)?.focus({preventScroll:true});
}
// O kit montado no "Adicionar ao carrinho" da barra: as peças entram juntas (cart-store.js putItems) e o mini-carrinho confirma cada uma,
// com o total já no preço do kit. Um erro (carrinho cheio, armazenamento bloqueado) aparece no aviso da barra.
async function addKit(lines){
  const before=totals(readCart(),0).subtotal,cart=writeCart(putItems(readCart(),lines));
  window.dispatchEvent(new Event('ju:cart'));
  closeProduct(false);await new Promise(resolve=>requestAnimationFrame(resolve));
  openMiniCart({itemIds:lines.map(line=>addedItemId(cart,line.productId,{})).filter(Boolean),original:true,riseFrom:before});
}
// As lâmpadas: os dois botões da barra compram o kit montado (na captura, antes do cart-bridge.js, que só sabe comprar uma peça). Kit
// vazio: o aviso em vez da compra. Editando uma peça do carrinho, o kit some e a barra volta a ser a do cart-bridge.js.
let buying=false;
$('.purchase-actions').addEventListener('click',e=>{
  const b=e.target.closest('#add-to-cart, #buy-now');
  if(!b||!kitPick||$('#pdp-kit').hidden||dialog.hasAttribute('data-cart-edit'))return;
  e.stopPropagation();
  const lines=kitPick.lines.map(({productId,selection,quantity})=>({productId,selection,quantity})),status=$('#purchase-status');
  // o aviso sai da linha do "3x" e vai para a linha que se anuncia (não aparece duas vezes); paintPrice o devolve
  if(!lines.length){$('#product-installments').textContent='';status.textContent='Escolha pelo menos uma peça.';return;}
  if(buying)return;buying=true;setTimeout(()=>{buying=false;},900);
  if(b.id==='add-to-cart'){addKit(lines).catch(error=>{status.textContent=error.message;});return;}
  try{sessionStorage.setItem(DIRECT_KEY,JSON.stringify(putItems([],lines)));location.assign('comprar-agora.html');}
  catch{status.textContent='Não foi possível preparar a compra. Verifique o armazenamento do navegador.';}
},true);
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
// Surpreenda-me (08/10/2026, pedido do dono: "na tela do 3D, sem atrapalhar a visualização"): uma pílula de vidro na área da peça, só
// nas peças de personalizar (as outras combinações seguem em Combinações e compartilhamento). Da aba Foto, o sorteio aparece no 3D
// (applyColors), e a estrelinha dá uma volta a cada sorteio.
$('#surprise').addEventListener('click',e=>{const preset=PRESETS.find(p=>p.id==='surpresa'),b=e.currentTarget;applyColors(presetSelection(activeProduct,preset),`Combinação ${preset.name} aplicada.`);if(!calm.matches){b.classList.remove('is-sparkling');void b.offsetWidth;b.classList.add('is-sparkling');}});
$('#surprise').addEventListener('animationend',e=>e.currentTarget.classList.remove('is-sparkling'));
document.querySelectorAll('[data-camera]').forEach(b=>b.addEventListener('click',()=>{if(!viewer)return;const a=b.dataset.camera;if(a==='left'||a==='right')viewer.rotate(a==='left'?-1:1);else if(a==='in'||a==='out')viewer.zoom(a==='in'?1:-1);else if(a==='reset')viewer.reset();else{const auto=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(auto));b.textContent=auto?'Pausar':'Girar';b.setAttribute('aria-label',auto?'Pausar giro automático':'Girar automaticamente');viewer.setAuto(auto);}}));
// A janela da peça só abre com as folhas dela já aplicadas (a home as carrega depois da primeira pintura, late-css.js): um
// #produto/<peça>/personalizar que chega com a página nunca aparece sem estilo. Vale o endereço de quando ele chegou: enquanto
// as folhas chegam, a demonstração (#produto/<peça>/encaixe) já pode tê-lo trocado para #produto/<peça>.
const syncStyled=()=>{const hash=location.hash;whenStyled(()=>syncProduct(hash));};
window.addEventListener('hashchange',syncStyled);window.addEventListener('pagehide',()=>viewer?.hide());syncStyled();
setupCartBridge({getProduct:()=>activeProduct,getSelection:()=>({...selections[activeProduct]}),capture:()=>{try{return view==='model'&&viewer?.key===activeProduct?viewer.snapshot():null;}catch{return null;}},restore:selection=>{selections[activeProduct]=validSelection(activeProduct,selection);if(!fixedColors(activeProduct))renderControls();setView('model');}});
setupPurchaseSheet(dialog);
