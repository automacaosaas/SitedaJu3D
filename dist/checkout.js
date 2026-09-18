import {PRODUCTS, color} from './products.js';
import {COMMERCE, money} from './commerce-config.js';
import {readCart, writeCart, totals, EDIT_KEY, CART_KEY, DIRECT_KEY, normalizeCart, selectedItems, removePurchased} from './cart-store.js';
import {createDemoOrder, paymentStatus, approveDemo, renewDemo, demoPixCode} from './demo-payment.js';

import {icon} from './icons.js';
import {saveDemoOrder} from './auth-service.js';
import {refreshHeader} from './site-shell.js';

const direct = document.body.dataset.flow === 'direct';
function readDirect() {try{return normalizeCart(JSON.parse(sessionStorage.getItem(DIRECT_KEY)||'[]'));}catch{return [];}}
const main = document.querySelector('#shop-main'), live = document.querySelector('#shop-live');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let cart = direct ? readDirect() : readCart(), stage = direct && readDirect().length ? 'delivery' : 'cart', method = 'pix', order = null, draft = {}, timer = null, busy = false, noticeTimer = null;
let selected = new Set(cart.map(i=>i.id));
const purchaseItems = () => selectedItems(cart, selected);
const count = items => items.reduce((n, i) => n + i.quantity, 0);
const announce = message => {clearTimeout(noticeTimer);live.textContent = message;noticeTimer=setTimeout(()=>{live.textContent='';},7000);};
const primary = (text, action, extra = '') => `<button class="primary shop-primary" data-action="${action}" ${extra}>${text}<span aria-hidden="true">↗</span></button>`;
function heading(kicker, title, description) { return `<div class="shop-heading"><p class="eyebrow">${kicker}</p><h1 tabindex="-1">${title}</h1><p>${description}</p></div>`; }
function chips(item) { return `<ul class="color-chips">${PRODUCTS[item.productId].parts.map(p => {const c = color(item.selection[p.id]); return `<li><i style="--chip:${c.hex}" aria-hidden="true"></i><span>${p.name}: <strong>${c.name}</strong></span></li>`;}).join('')}</ul>`; }
function thumbnail(item) { return `<div class="cart-art" style="--item-aura:${color(item.selection.body).hex}40"><img src="${esc(item.thumbnail || `assets/${PRODUCTS[item.productId].image}`)}" alt="${esc(item.title)} — ${item.thumbnail ? 'prévia 3D da combinação' : 'imagem nas cores originais'}"><small>${item.thumbnail ? 'Sua combinação · prévia 3D' : 'Foto nas cores originais'}</small></div>`; }
function amounts(items) {const t = totals(items); return `<dl class="amounts"><div><dt>Subtotal</dt><dd>${money(t.subtotal)}</dd></div><div><dt>Entrega <small>(exemplo)</small></dt><dd>${money(t.shipping)}</dd></div><div class="grand-total"><dt>Total</dt><dd>${money(t.total)}</dd></div></dl>`;}
function summary(items, action = '') {return `<aside class="order-summary"><p class="eyebrow">CADA DETALHE, DO SEU JEITO</p><h2>Resumo do pedido</h2>${items.map(i => `<article class="summary-item">${thumbnail(i)}<div><h3>${esc(i.title)}</h3><p>${i.quantity} ${i.quantity === 1 ? 'peça' : 'peças'} · ${money(i.unitPrice * i.quantity)}</p>${chips(i)}</div></article>`).join('')}${amounts(items)}<p class="production-note">Feito sob encomenda<br><strong>Produção: ${COMMERCE.productionLabel}</strong></p>${action}<p class="small-note">Preços, frete e prazo são exemplos para avaliação. A entrega real será calculada antes do pagamento.</p></aside>`;}
function cartView() {
  if (!cart.length) return `${heading('FEITO PARA VOCÊ', 'Seu carrinho espera<br><em>um pouco de cor.</em>', 'Escolha uma peça, imagine as cores e deixe o resto com a Ju.')}<section class="empty-cart"><span aria-hidden="true">♡</span><h2>Vamos encontrar a sua favorita?</h2><a class="primary shop-primary" href="index.html#produtos">Explorar os produtos <span aria-hidden="true">↗</span></a></section>`;
  const chosen=purchaseItems();
  return `${heading('QUASE PRONTO PARA ENCANTAR', 'Seu carrinho.<br><em>Suas combinações.</em>', 'Escolha quais peças vão com você agora. As demais continuam guardadas.')}<div class="shop-layout"><section class="cart-items" aria-label="Produtos no carrinho"><div class="cart-select-tools"><label class="select-label"><input type="checkbox" id="select-all" ${chosen.length===cart.length?'checked':''}>Selecionar todos (${cart.length})</label><button class="remove-selected" data-action="remove-selected" ${chosen.length?'':'disabled'}>${icon('trash')} Remover selecionados</button></div>${cart.map(i => `<article class="cart-item ${selected.has(i.id)?'':'is-unselected'}"><label class="cart-select"><input type="checkbox" data-select-id="${esc(i.id)}" aria-label="Selecionar ${esc(i.title)}" ${selected.has(i.id)?'checked':''}></label>${thumbnail(i)}<div class="cart-item-copy"><p class="eyebrow">COLEÇÃO 01 / PEÇA ${PRODUCTS[i.productId].number}</p><h2>${esc(i.title)}</h2><p class="item-type">${PRODUCTS[i.productId].subtitle}</p>${chips(i)}<div class="item-actions"><button class="text-button" data-action="edit" data-id="${esc(i.id)}">Editar cores<span class="sr-only"> de ${esc(i.title)}</span></button><button class="trash-button" data-action="remove" data-id="${esc(i.id)}" aria-label="Remover ${esc(i.title)}">${icon('trash')}</button></div><div class="quantity-price"><div class="quantity-control" role="group" aria-label="Quantidade de ${esc(i.title)}"><button data-action="minus" data-id="${esc(i.id)}" aria-label="Diminuir quantidade de ${esc(i.title)}" ${i.quantity<=1?'disabled':''}>−</button><output aria-label="Quantidade">${i.quantity}</output><button data-action="plus" data-id="${esc(i.id)}" aria-label="Aumentar quantidade de ${esc(i.title)}" ${i.quantity>=99?'disabled':''}>+</button></div><div><strong>${money(i.unitPrice*i.quantity)}</strong><small>${money(i.unitPrice)} / unidade</small></div></div></div></article>`).join('')}<a class="collection-link" href="index.html#produtos">← Escolher mais uma peça</a></section><aside class="order-summary"><p class="eyebrow">SUAS ESCOLHAS REUNIDAS</p><h2>Um toque seu.<br>Em cada peça.</h2><p class="selection-note">${count(chosen)} ${count(chosen)===1?'peça selecionada':'peças selecionadas'} para este pedido.</p>${amounts(chosen)}<p class="production-note">Feito sob encomenda<br><strong>Produção: ${COMMERCE.productionLabel}</strong></p>${primary('Finalizar selecionados', 'checkout', chosen.length?'':'disabled')}<p class="small-note">Valores de demonstração. Nenhuma compra ou cobrança real será realizada.</p><div class="accepted-methods"><span>${icon('pix')} Pix</span><span>${icon('card')} Cartão</span></div></aside></div>`;
}
function field(name, label, options = {}) {return `<label class="field ${options.wide ? 'wide' : ''}"><span>${label}${options.optional ? ' <small>(opcional)</small>' : ''}</span><input name="${name}" value="${esc(draft[name])}" type="${options.type || 'text'}" ${options.optional ? '' : 'required'} autocomplete="${options.auto || 'off'}" ${options.inputmode ? `inputmode="${options.inputmode}"` : ''} ${options.pattern ? `pattern="${options.pattern}"` : ''} maxlength="${options.max || 100}" ${options.placeholder ? `placeholder="${options.placeholder}"` : ''}></label>`;}
function deliveryView() {return `${heading(direct?'COMPRAR AGORA':'UM PASSO MAIS PERTO', 'Para onde vai<br><em>esse carinho?</em>', 'Preencha os dados de entrega e escolha como prefere pagar.')}<div class="shop-layout"><form id="delivery-form" class="delivery-form"><div class="form-section"><div class="section-label"><span>01</span><h2>Quem vai receber?</h2></div><p class="small-note">Use dados fictícios neste protótipo. Eles não são enviados nem salvos pelo formulário.</p><div class="form-grid">${field('name', 'Nome completo', {auto:'name',wide:true,max:120})}${field('email', 'E-mail', {type:'email',auto:'email',max:180})}${field('phone', 'WhatsApp com DDD', {type:'tel',auto:'tel',inputmode:'tel',max:20,placeholder:'(11) 99999-9999'})}</div></div><div class="form-section"><div class="section-label"><span>02</span><h2>Endereço de entrega</h2></div><div class="form-grid">${field('cep','CEP',{auto:'postal-code',inputmode:'numeric',pattern:'[0-9]{5}-?[0-9]{3}',max:9,placeholder:'00000-000'})}${field('city','Cidade',{auto:'address-level2'})}${field('street','Rua ou avenida',{auto:'address-line1',wide:true})}${field('number','Número',{max:12})}${field('district','Bairro',{max:80})}${field('complement','Complemento',{optional:true,auto:'address-line2'})}<label class="field"><span>Estado</span><select name="state" autocomplete="address-level1" required><option value="">Selecione</option>${'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ').map(s=>`<option ${draft.state === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label class="field wide"><span>Observações <small>(opcional)</small></span><textarea name="notes" rows="2" maxlength="500" placeholder="Algo que a Ju precisa saber?">${esc(draft.notes)}</textarea></label></div><div class="shipping-option"><span aria-hidden="true">↗</span><div><strong>Entrega no seu endereço</strong><p>Frete e prazo finais serão definidos na integração.</p></div><strong>${money(COMMERCE.shippingCents)}<small>exemplo</small></strong></div></div><div class="form-section"><div class="section-label"><span>03</span><h2>Como prefere pagar?</h2></div><fieldset class="payment-choice"><legend class="sr-only">Forma de pagamento</legend><label><input type="radio" name="payment" value="pix" ${method === 'pix' ? 'checked' : ''}><span class="method-symbol" aria-hidden="true">${icon('pix')}</span><span><strong>Pix</strong><small>Copia e cola ou QR Code</small></span></label><label><input type="radio" name="payment" value="card" ${method === 'card' ? 'checked' : ''}><span class="method-symbol" aria-hidden="true">${icon('card')}</span><span><strong>Cartão</strong><small>Pagamento com intermediador</small></span></label></fieldset><p class="small-note">Aqui você pode experimentar a jornada completa, sem informar dados de cartão.</p></div><div class="form-footer"><button class="text-button" type="button" data-action="cart">${direct?'← Rever minha combinação':'← Voltar ao carrinho'}</button><button type="submit" class="primary shop-primary">Continuar para pagamento <span aria-hidden="true">↗</span></button></div></form>${summary(purchaseItems())}</div>`;}
// Decorative matrix, deliberately NOT a payable QR code.
function qrIllustration() {let cells = '';for(let y=0;y<21;y++)for(let x=0;x<21;x++){const inFinder = (x<7&&y<7)||(x>13&&y<7)||(x<7&&y>13);if(inFinder){const a=x>13?x-14:x,b=y>13?y-14:y;if(a===0||a===6||b===0||b===6||(a>=2&&a<=4&&b>=2&&b<=4))cells+=`<rect x="${x}" y="${y}" width="1" height="1"/>`;}else if((x*13+y*7+x*y)%5<2)cells+=`<rect x="${x}" y="${y}" width="1" height="1"/>`;}return `<div class="demo-qr"><svg viewBox="-2 -2 25 25" role="img" aria-label="QR Code ilustrativo, sem valor de pagamento"><g fill="#49303b">${cells}</g></svg><span>DEMONSTRAÇÃO</span></div>`;}
function progress() {const approved = paymentStatus(order) === 'approved';return `<ol class="order-progress" aria-label="Andamento do pedido">${['Pedido criado','Aguardando pagamento','Pagamento confirmado','Em preparação','Pronto para envio'].map((s,i)=>`<li class="${i < (approved?2:1) ? 'done' : i === (approved?2:1) ? 'current' : ''}" ${i === (approved?2:1) ? 'aria-current="step"' : ''}><i aria-hidden="true">${i < (approved?2:1) ? '✓' : i+1}</i><span>${s}</span></li>`).join('')}</ol>`;}
function paymentView() {const expired = paymentStatus(order) === 'expired', pix = order.method === 'pix';return `${heading('PEDIDO ' + order.id, expired ? 'O tempo passou.<br><em>Suas escolhas ficaram.</em>' : 'Falta só<br><em>um pequeno passo.</em>', 'Pagamento de demonstração. Nenhum valor será movimentado.')}<div class="shop-layout"><section class="payment-panel" aria-label="Pagamento por ${pix?'Pix':'cartão'}">${progress()}${pix ? `<div class="payment-state"><span class="status-pill ${expired?'expired':''}">${expired?'Código expirado':'<i class="waiting-dot" aria-hidden="true"></i>Aguardando pagamento'}</span><h2>${expired?'Gere um novo código.':'Pague do seu jeito, com Pix.'}</h2><p>${expired?'Seu pedido e suas cores continuam aqui.':'No celular, copie o código. Em outro dispositivo, você usaria o QR Code.'}</p></div>${expired ? '<div class="expired-art" aria-hidden="true">↻</div>' : `${qrIllustration()}<p class="qr-note">Imagem ilustrativa • não permite pagamentos</p><p class="countdown">Válido por <strong id="pix-time" role="timer"></strong></p><label class="pix-code-label" for="pix-code">Pix copia e cola <small>demonstrativo</small></label><div class="pix-copy"><input id="pix-code" readonly value="${demoPixCode(order)}"><button data-action="copy-pix">Copiar código</button></div>`}<div class="payment-buttons">${expired?primary('Gerar novo código de demonstração','renew'):primary('Já realizei o pagamento · simular','approve')}</div>${!expired?'<details class="demo-controls"><summary>Testar outro cenário</summary><button class="text-button" data-action="expire">Simular expiração do Pix</button></details>':''}` : `<div class="payment-state"><span class="status-pill">Cartão · demonstração</span><h2>Seu cartão, em boas mãos.</h2><p>Na versão final, o intermediador de pagamentos cuidará dos dados do seu cartão.</p></div><div class="card-illustration" aria-hidden="true"><span>Ju, imprime pra mim?</span><i>▥</i><strong>•••• &nbsp; •••• &nbsp; •••• &nbsp; ••••</strong><small>PRÉVIA DE PAGAMENTO</small></div><p class="card-explanation">Você não precisa digitar número, validade ou código de segurança para testar esta etapa.</p>${primary('Simular aprovação no cartão','approve')}<details class="demo-controls"><summary>Testar outro cenário</summary><button class="text-button" data-action="decline">Simular cartão recusado</button></details><p id="card-error" class="inline-error" role="alert"></p>`}<button class="text-button payment-back" data-action="delivery">← Alterar dados ou pagamento</button></section>${summary(order.items)}</div>`;}
function confirmationView() {const message = `Olá, Ju! Gostaria de falar sobre o pedido ${order.id} (demonstração).\n`+order.items.map(i=>`${i.quantity}x ${i.title}\n`+PRODUCTS[i.productId].parts.map(p=>`${p.name}: ${color(i.selection[p.id]).name}`).join('\n')).join('\n\n');const whatsapp = /^\d{10,15}$/.test(COMMERCE.whatsapp) ? `<a class="primary shop-primary" href="https://wa.me/${COMMERCE.whatsapp}?text=${encodeURIComponent(message)}" target="_blank" rel="noopener">Falar com a Ju no WhatsApp ↗</a>` : '<button class="secondary-button" disabled>WhatsApp da Ju · em breve</button><p class="small-note">O contato será habilitado quando o número da loja for definido.</p>';
return `${heading('PEDIDO ' + order.id, 'Suas cores.<br><em>Um novo começo.</em>', 'Pagamento aprovado na demonstração. Nenhuma cobrança ou produção foi iniciada.')}<div class="shop-layout"><section class="confirmation-panel"><div class="success-mark" aria-hidden="true">✓</div><h2>Seu pedido ganhou vida.</h2><p>Na loja final, a confirmação chega por aqui e a Ju recebe todos os detalhes para preparar suas peças.</p>${progress()}<div class="confirmation-facts"><div><small>Forma de pagamento</small><strong>${order.method==='pix'?'Pix':'Cartão'}</strong></div><div><small>Produção estimada</small><strong>${COMMERCE.productionLabel}</strong></div></div>${whatsapp}<button class="text-button" data-action="copy-order">Copiar resumo para conversar com a Ju</button><a class="primary shop-primary" href="index.html">Continuar explorando <span aria-hidden="true">↗</span></a></section>${summary(order.items)}</div>`;}
function render(focus = true) {
  clearInterval(timer); timer = null;
  document.querySelectorAll('[data-step]').forEach(el=>{const active = el.dataset.step === (stage==='confirmation'?'payment':stage);if(active)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});
  main.innerHTML = stage === 'cart' ? cartView() : stage === 'delivery' ? deliveryView() : stage === 'payment' ? paymentView() : confirmationView();
  const summaryPanel=main.querySelector('.order-summary');
  if(summaryPanel&&stage!=='cart'){
    summaryPanel.id='order-summary';
    const items=stage==='delivery'?purchaseItems():order.items;
    const quick=document.createElement('a');quick.className='mobile-order-bar';quick.href='#order-summary';
    quick.innerHTML=`<span>${count(items)} ${count(items)===1?'peça':'peças'} · <strong>${money(totals(items).total)}</strong></span><span>Ver resumo ↓</span>`;
    main.querySelector('.shop-heading').after(quick);
  }
  document.title = `${stage==='cart'?'Seu carrinho':stage==='confirmation'?'Pedido confirmado · demonstração':'Finalizar pedido'} · Ju imprime pra mim`;
  const all=main.querySelector('#select-all');
  if(all)all.indeterminate=selected.size>0&&purchaseItems().length<cart.length;
  if (focus) {main.querySelector('h1').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
  if(stage==='payment' && order.method==='pix' && paymentStatus(order)!=='expired') {
    const tick=()=>{if(paymentStatus(order)==='expired'){render(false);announce('O Pix de demonstração expirou. Gere um novo código para continuar.');return;}const seconds=Math.max(0,Math.ceil((order.expiresAt-Date.now())/1000));const clock=document.querySelector('#pix-time');if(clock)clock.textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;};
    tick();timer=setInterval(tick,1000);
  }
}
function persist(next) {
  if(direct){cart=normalizeCart(next);sessionStorage.setItem(DIRECT_KEY,JSON.stringify(cart));}
  else cart=writeCart(next);
  selected=new Set([...selected].filter(id=>cart.some(i=>i.id===id)));
  window.dispatchEvent(new Event('ju:cart'));
}
main.addEventListener('submit', e=>{if(e.target.id!=='delivery-form')return;e.preventDefault();if(busy)return;const form=e.target;if(!form.reportValidity())return;draft=Object.fromEntries(new FormData(form));if(!draft.name.trim()||!draft.street.trim()||!draft.city.trim()||!draft.number.trim()||!draft.district.trim()){announce('Preencha os dados de entrega, sem deixar campos em branco.');return;}method=draft.payment;try{order=createDemoOrder(purchaseItems(),method);stage='payment';render();}catch(error){announce(error.message);}});
main.addEventListener('change',e=>{
  if(e.target.name==='payment')method=e.target.value;
  if(e.target.id==='select-all'||e.target.dataset.selectId){
    const id=e.target.dataset.selectId,all=e.target.id==='select-all';
    if(all)selected=e.target.checked?new Set(cart.map(i=>i.id)):new Set();
    else if(e.target.checked)selected.add(id);else selected.delete(id);
    render(false);
    const target=all?document.querySelector('#select-all'):[...main.querySelectorAll('[data-select-id]')].find(x=>x.dataset.selectId===id);
    target?.focus({preventScroll:true});
    announce(count(purchaseItems())+' peças selecionadas.');
  }
});
main.addEventListener('input',e=>{
  if(e.target.name==='phone'){
    const digits=e.target.value.replace(/\D/g,'');
    e.target.setCustomValidity(/^(?:55)?[1-9]\d{9,10}$/.test(digits)?'':'Informe um WhatsApp com DDD, por exemplo (11) 99999-9999.');
  }
});
main.addEventListener('click',async e=>{
  const button=e.target.closest('[data-action]');if(!button||busy)return;
  const action=button.dataset.action,id=button.dataset.id,item=cart.find(i=>i.id===id);
  try {
    if(['plus','minus','remove'].includes(action)&&item){const next=cart.map(i=>({...i}));if(action==='remove')persist(next.filter(i=>i.id!==id));else{next.find(i=>i.id===id).quantity=Math.max(1,Math.min(99,item.quantity+(action==='plus'?1:-1)));persist(next);}render(false);const target=[...main.querySelectorAll('[data-action]')].find(b=>b.dataset.id===id&&b.dataset.action===action&&!b.disabled);(target||main.querySelector('h1')).focus({preventScroll:true});announce(action==='remove'?'Peça removida do carrinho.':'Quantidade atualizada.');}
    if(action==='edit'&&item){sessionStorage.setItem(EDIT_KEY,JSON.stringify({id:item.id}));location.assign(`index.html#produto/${item.productId}`);}
    if(action==='checkout'&&purchaseItems().length){stage='delivery';render();}
    if(action==='remove-selected'){persist(cart.filter(i=>!selected.has(i.id)));render();announce('Itens selecionados removidos.');}
    if(action==='cart'&&direct&&cart[0]){location.assign(`index.html#produto/${cart[0].productId}`);return;}
    if(action==='cart'){const form=document.querySelector('#delivery-form');if(form)draft=Object.fromEntries(new FormData(form));stage='cart';order=null;render();}
    if(action==='delivery'){stage='delivery';order=null;render();}
    if(action==='copy-pix'){try{await navigator.clipboard.writeText(demoPixCode(order));announce('Código demonstrativo copiado. Ele não permite pagamentos.');}catch{document.querySelector('#pix-code').select();announce('Selecione e copie o código demonstrativo.');}}
    if(action==='expire'){order={...order,expiresAt:Date.now()-1};render();}
    if(action==='renew'){order=renewDemo(order);render();announce('Novo código de demonstração criado.');}
    if(action==='decline'){document.querySelector('#card-error').textContent='Cartão recusado na simulação. Tente novamente ou escolha Pix; suas escolhas estão preservadas.';}
    if(action==='approve'){
      if(paymentStatus(order)!=='pending'){render();return;}
      busy=true;button.disabled=true;button.textContent='Confirmando pagamento de demonstração…';announce('Processando a simulação.');
      const pendingOrder=order;
      await new Promise(resolve=>setTimeout(resolve,900));
      if(order!==pendingOrder){busy=false;return;}
      order=approveDemo(order);
      saveDemoOrder(order);
      try { if(direct){sessionStorage.removeItem(DIRECT_KEY);}else{persist(removePurchased(readCart(),order.items));} refreshHeader(); }
      catch {announce('Demonstração aprovada, mas não foi possível atualizar o carrinho neste navegador.');}
      busy=false;stage='confirmation';render();announce('Pagamento confirmado na demonstração. Nenhum valor foi cobrado.');
    }
    if(action==='copy-order'){const text=`Pedido ${order.id} — demonstração\n`+order.items.map(i=>`${i.quantity}x ${i.title}\n`+PRODUCTS[i.productId].parts.map(p=>`${p.name}: ${color(i.selection[p.id]).name}`).join('\n')).join('\n\n');try{await navigator.clipboard.writeText(text);announce('Resumo copiado.');}catch{announce('Não foi possível copiar automaticamente. As escolhas estão no resumo ao lado.');}}
  } catch(error){busy=false;button.disabled=false;announce(error.message);}
});
window.addEventListener('storage',e=>{if(e.key!==CART_KEY||direct)return;cart=readCart();selected=new Set(cart.map(i=>i.id));if(stage==='cart')render(false);else if(stage==='delivery'||stage==='payment'){order=null;stage='cart';render();announce('O carrinho foi alterado em outra aba. Confira os itens antes de continuar.');}});
render(false);
