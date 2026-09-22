import {returnFromCart} from './shopping-navigation.js';
import {PRODUCTS, color} from './products.js';
import {COMMERCE, money} from './commerce-config.js';
import {readCart, writeCart, totals, EDIT_KEY, CART_KEY, DIRECT_KEY, normalizeCart, selectedItems, removePurchased} from './cart-store.js';
import {createDemoOrder, paymentStatus, approveDemo, renewDemo, demoPixCode} from './demo-payment.js';
import {loadPaymentConfig, loadSdk, newAttempt, createPayment, paymentState, paymentMessage, refusedMessage, brickLocale, BRICK_STYLE, safeBase64, parseExpiry} from './live-payment.js';

import {icon} from './icons.js';
import {saveDemoOrder, getSession} from './auth-service.js';
import {refreshHeader} from './site-shell.js';
import {renderCart} from './cart-view.js';

const direct = document.body.dataset.flow === 'direct';
function readDirect() {try{return normalizeCart(JSON.parse(sessionStorage.getItem(DIRECT_KEY)||'[]'));}catch{return [];}}
const main = document.querySelector('#shop-main'), liveRegion = document.querySelector('#shop-live');
// Real payments (Mercado Pago) are on only when the server says so; otherwise everything below behaves as the demo.
const live = await loadPaymentConfig();
const banner = document.querySelector('.demo-banner');
if (live.mode === 'test' && banner) banner.innerHTML = 'AMBIENTE DE TESTE <span>Pagamentos de teste do Mercado Pago · nenhum valor real é cobrado</span>';
else if (live.mode === 'live' && banner) banner.remove();
let brick = null, brickToken = 0, pollTimer = null, clockTimer = null;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let cart = direct ? readDirect() : readCart(), stage = direct && readDirect().length ? 'delivery' : 'cart', method = 'pix', order = null, draft = {name:getSession()?.name || '', email:getSession()?.email || ''}, timer = null, busy = false, noticeTimer = null;
let selected = new Set(cart.map(i=>i.id));
const purchaseItems = () => selectedItems(cart, selected);
const count = items => items.reduce((n, i) => n + i.quantity, 0);
const announce = message => {clearTimeout(noticeTimer);liveRegion.textContent = message;noticeTimer=setTimeout(()=>{liveRegion.textContent='';},7000);};
const primary = (text, action, extra = '') => `<button class="primary shop-primary" data-action="${action}" ${extra}>${text}<span aria-hidden="true">↗</span></button>`;
function heading(kicker, title, description) { return `<div class="shop-heading"><p class="eyebrow">${kicker}</p><h1 tabindex="-1">${title}</h1><p>${description}</p></div>`; }
function chips(item) { return `<ul class="color-chips">${PRODUCTS[item.productId].parts.map(p => {const c = color(item.selection[p.id]); return `<li><i style="--chip:${c.hex}" aria-hidden="true"></i><span>${p.name}: <strong>${c.name}</strong></span></li>`;}).join('')}</ul>`; }
function thumbnail(item) { return `<div class="cart-art" style="--item-aura:${color(item.selection.body).hex}40"><img src="${esc(item.thumbnail || `assets/${PRODUCTS[item.productId].catalogImage || PRODUCTS[item.productId].image}`)}" alt="${esc(item.title)} — ${item.thumbnail ? 'prévia 3D da combinação' : 'imagem nas cores originais'}"><small>${item.thumbnail ? 'Sua combinação · prévia 3D' : 'Foto nas cores originais'}</small></div>`; }
function amounts(items) {const t = totals(items); return `<dl class="amounts"><div><dt>Subtotal</dt><dd>${money(t.subtotal)}</dd></div><div><dt>Entrega <small>(exemplo)</small></dt><dd>${money(t.shipping)}</dd></div><div class="grand-total"><dt>Total</dt><dd>${money(t.total)}</dd></div></dl>`;}
function summary(items, action = '') {return `<aside class="order-summary"><p class="eyebrow">CADA DETALHE, DO SEU JEITO</p><h2>Resumo do pedido</h2>${items.map(i => `<article class="summary-item">${thumbnail(i)}<div><h3>${esc(i.title)}</h3><p>${i.quantity} ${i.quantity === 1 ? 'peça' : 'peças'} · ${money(i.unitPrice * i.quantity)}</p>${chips(i)}</div></article>`).join('')}${amounts(items)}<p class="production-note">Feito sob encomenda<br><strong>Produção: ${COMMERCE.productionLabel}</strong></p>${action}${live.mode === 'live' ? '' : '<p class="small-note">Preços, frete e prazo são exemplos para avaliação. A entrega real será calculada antes do pagamento.</p>'}</aside>`;}
function field(name, label, options = {}) {return `<label class="field ${options.wide ? 'wide' : ''}"><span>${label}${options.optional ? ' <small>(opcional)</small>' : ''}</span><input name="${name}" value="${esc(draft[name])}" type="${options.type || 'text'}" ${options.optional ? '' : 'required'} autocomplete="${options.auto || 'off'}" ${options.inputmode ? `inputmode="${options.inputmode}"` : ''} ${options.pattern ? `pattern="${options.pattern}"` : ''} maxlength="${options.max || 100}" ${options.placeholder ? `placeholder="${options.placeholder}"` : ''}></label>`;}
function deliveryView() {return `${heading(direct?'COMPRAR AGORA':'UM PASSO MAIS PERTO', 'Para onde vai<br><em>esse carinho?</em>', 'Preencha os dados de entrega e escolha como prefere pagar.')}<div class="shop-layout"><form id="delivery-form" class="delivery-form"><div class="form-section"><div class="section-label"><span>01</span><h2>Quem vai receber?</h2></div><p class="small-note">${deliveryNote()}</p><div class="form-grid">${field('name', 'Nome completo', {auto:'name',wide:true,max:120})}${field('email', 'E-mail', {type:'email',auto:'email',max:180})}${field('phone', 'WhatsApp com DDD', {type:'tel',auto:'tel',inputmode:'tel',max:20,placeholder:'(11) 99999-9999'})}</div></div><div class="form-section"><div class="section-label"><span>02</span><h2>Endereço de entrega</h2></div><div class="form-grid">${field('cep','CEP',{auto:'postal-code',inputmode:'numeric',pattern:'[0-9]{5}-?[0-9]{3}',max:9,placeholder:'00000-000'})}${field('city','Cidade',{auto:'address-level2'})}${field('street','Rua ou avenida',{auto:'address-line1',wide:true})}${field('number','Número',{max:12})}${field('district','Bairro',{max:80})}${field('complement','Complemento',{optional:true,auto:'address-line2'})}<label class="field"><span>Estado</span><select name="state" autocomplete="address-level1" required><option value="">Selecione</option>${'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ').map(s=>`<option ${draft.state === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label class="field wide"><span>Observações <small>(opcional)</small></span><textarea name="notes" rows="2" maxlength="500" placeholder="Algo que a Ju precisa saber?">${esc(draft.notes)}</textarea></label></div><div class="shipping-option"><span aria-hidden="true">↗</span><div><strong>Entrega no seu endereço</strong><p>Frete e prazo finais serão definidos na integração.</p></div><strong>${money(COMMERCE.shippingCents)}<small>exemplo</small></strong></div></div><div class="form-section"><div class="section-label"><span>03</span><h2>Como prefere pagar?</h2></div>${live.mode !== 'off' ? '<p class="small-note">Na próxima etapa você escolhe entre Pix, cartão de crédito ou cartão de débito. O pagamento é feito com segurança pelo Mercado Pago.</p>' : ''}<fieldset class="payment-choice" ${live.mode !== 'off' ? 'hidden disabled' : ''}><legend class="sr-only">Forma de pagamento</legend><label><input type="radio" name="payment" value="pix" ${method === 'pix' ? 'checked' : ''}><span class="method-symbol" aria-hidden="true">${icon('pix')}</span><span><strong>Pix</strong><small>Copia e cola ou QR Code</small></span></label><label><input type="radio" name="payment" value="card" ${method === 'card' ? 'checked' : ''}><span class="method-symbol" aria-hidden="true">${icon('card')}</span><span><strong>Cartão</strong><small>Pagamento com intermediador</small></span></label></fieldset>${live.mode === 'off' ? '<p class="small-note">Aqui você pode experimentar a jornada completa, sem informar dados de cartão.</p>' : ''}</div><div class="form-footer"><button class="text-button" type="button" data-action="cart">${direct?'← Rever minha combinação':'← Voltar ao carrinho'}</button><button type="submit" class="primary shop-primary">Continuar para pagamento <span aria-hidden="true">↗</span></button></div></form>${summary(purchaseItems())}</div>`;}
// Decorative matrix, deliberately NOT a payable QR code.
function qrIllustration() {let cells = '';for(let y=0;y<21;y++)for(let x=0;x<21;x++){const inFinder = (x<7&&y<7)||(x>13&&y<7)||(x<7&&y>13);if(inFinder){const a=x>13?x-14:x,b=y>13?y-14:y;if(a===0||a===6||b===0||b===6||(a>=2&&a<=4&&b>=2&&b<=4))cells+=`<rect x="${x}" y="${y}" width="1" height="1"/>`;}else if((x*13+y*7+x*y)%5<2)cells+=`<rect x="${x}" y="${y}" width="1" height="1"/>`;}return `<div class="demo-qr"><svg viewBox="-2 -2 25 25" role="img" aria-label="QR Code ilustrativo, sem valor de pagamento"><g fill="#49303b">${cells}</g></svg><span>DEMONSTRAÇÃO</span></div>`;}
function progress() {const approved = order.status === 'approved';return `<ol class="order-progress" aria-label="Andamento do pedido">${['Pedido criado','Aguardando pagamento','Pagamento confirmado','Em preparação','Pronto para envio'].map((s,i)=>`<li class="${i < (approved?2:1) ? 'done' : i === (approved?2:1) ? 'current' : ''}" ${i === (approved?2:1) ? 'aria-current="step"' : ''}><i aria-hidden="true">${i < (approved?2:1) ? '✓' : i+1}</i><span>${s}</span></li>`).join('')}</ol>`;}
function paymentView() {if(order.live)return livePaymentView();const expired =paymentStatus(order) === 'expired', pix = order.method === 'pix';return `${heading('PEDIDO ' + order.id, expired ? 'O tempo passou.<br><em>Suas escolhas ficaram.</em>' : 'Falta só<br><em>um pequeno passo.</em>', 'Pagamento de demonstração. Nenhum valor será movimentado.')}<div class="shop-layout"><section class="payment-panel" aria-label="Pagamento por ${pix?'Pix':'cartão'}">${progress()}${pix ? `<div class="payment-state"><span class="status-pill ${expired?'expired':''}">${expired?'Código expirado':'<i class="waiting-dot" aria-hidden="true"></i>Aguardando pagamento'}</span><h2>${expired?'Gere um novo código.':'Pague do seu jeito, com Pix.'}</h2><p>${expired?'Seu pedido e suas cores continuam aqui.':'No celular, copie o código. Em outro dispositivo, você usaria o QR Code.'}</p></div>${expired ? '<div class="expired-art" aria-hidden="true">↻</div>' : `${qrIllustration()}<p class="qr-note">Imagem ilustrativa • não permite pagamentos</p><p class="countdown">Válido por <strong id="pix-time" role="timer"></strong></p><label class="pix-code-label" for="pix-code">Pix copia e cola <small>demonstrativo</small></label><div class="pix-copy"><input id="pix-code" readonly value="${demoPixCode(order)}"><button data-action="copy-pix">Copiar código</button></div>`}<div class="payment-buttons">${expired?primary('Gerar novo código de demonstração','renew'):primary('Já realizei o pagamento · simular','approve')}</div>${!expired?'<details class="demo-controls"><summary>Testar outro cenário</summary><button class="text-button" data-action="expire">Simular expiração do Pix</button></details>':''}` : `<div class="payment-state"><span class="status-pill">Cartão · demonstração</span><h2>Seu cartão, em boas mãos.</h2><p>Na versão final, o intermediador de pagamentos cuidará dos dados do seu cartão.</p></div><div class="card-illustration" aria-hidden="true"><span>Ju, imprime pra mim?</span><i>▥</i><strong>•••• &nbsp; •••• &nbsp; •••• &nbsp; ••••</strong><small>PRÉVIA DE PAGAMENTO</small></div><p class="card-explanation">Você não precisa digitar número, validade ou código de segurança para testar esta etapa.</p>${primary('Simular aprovação no cartão','approve')}<details class="demo-controls"><summary>Testar outro cenário</summary><button class="text-button" data-action="decline">Simular cartão recusado</button></details><p id="card-error" class="inline-error" role="alert"></p>`}<button class="text-button payment-back" data-action="delivery">← Alterar dados ou pagamento</button></section>${summary(order.items)}</div>`;}
function confirmationView() {const message = `Olá, Ju! Gostaria de falar sobre o pedido ${order.id}${order.live ? '' : ' (demonstração)'}.\n`+order.items.map(i=>`${i.quantity}x ${i.title}\n`+PRODUCTS[i.productId].parts.map(p=>`${p.name}: ${color(i.selection[p.id]).name}`).join('\n')).join('\n\n');const whatsapp = /^\d{10,15}$/.test(COMMERCE.whatsapp) ? `<a class="primary shop-primary" href="https://wa.me/${COMMERCE.whatsapp}?text=${encodeURIComponent(message)}" target="_blank" rel="noopener">Falar com a Ju no WhatsApp ↗</a>` : '<button class="secondary-button" disabled>WhatsApp da Ju · em breve</button><p class="small-note">O contato será habilitado quando o número da loja for definido.</p>';
return `${heading('PEDIDO ' + order.id, 'Suas cores.<br><em>Um novo começo.</em>', confirmationLead())}<div class="shop-layout"><section class="confirmation-panel"><div class="success-mark" aria-hidden="true">✓</div><h2>Seu pedido ganhou vida.</h2><p>${order.live ? 'A Ju recebeu todos os detalhes do seu pedido para preparar suas peças.' : 'Na loja final, a confirmação chega por aqui e a Ju recebe todos os detalhes para preparar suas peças.'}</p>${progress()}<div class="confirmation-facts"><div><small>Forma de pagamento</small><strong>${order.method==='pix'?'Pix':'Cartão'}</strong></div><div><small>Produção estimada</small><strong>${COMMERCE.productionLabel}</strong></div></div>${whatsapp}<button class="text-button" data-action="copy-order">Copiar resumo para conversar com a Ju</button><a class="primary shop-primary" href="index.html">Continuar explorando <span aria-hidden="true">↗</span></a></section>${summary(order.items)}</div>`;}
// ── real payments (Mercado Pago) ───────────────────────────────────────
const lang = () => document.documentElement.lang || 'pt-BR';
const deliveryNote = () => live.mode === 'off' ? 'Use dados fictícios neste protótipo. Eles não são enviados nem salvos pelo formulário.' : live.mode === 'test' ? 'Ambiente de teste: use dados de teste. Eles servem só para criar o pedido de teste; nenhum valor real é cobrado.' : 'Usamos estes dados só para entregar o seu pedido.';
const confirmationLead = () => order.live ? (order.mode === 'test' ? 'Pagamento de teste aprovado. Nenhum valor real foi cobrado e nenhuma peça será produzida.' : 'Pagamento confirmado. A Ju já recebeu o seu pedido.') : 'Pagamento aprovado na demonstração. Nenhuma cobrança ou produção foi iniciada.';
function createLiveOrder(items) {
  const snapshot = normalizeCart(items);
  if (!snapshot.length) throw new Error('Adicione uma peça ao carrinho.');
  return {live: true, mode: live.mode, id: null, mpId: null, phase: 'form', method: null, status: 'pending', items: snapshot, amounts: totals(snapshot), createdAt: Date.now(), pix: null, expiresAt: null};
}
function testHelp() {
  if (live.mode !== 'test') return '';
  const row = (name, value) => `<div><dt>${name}</dt><dd>${value}</dd></div>`;
  return `<details class="demo-controls test-help"><summary>Como testar neste ambiente</summary><dl class="test-cards">${row('Cartão de teste (Mastercard)', '5480 8328 0103 3311')}${row('Validade', '11/30')}${row('Código de segurança', '123')}${row('Nome do titular (aprova o pagamento)', 'APRO')}${row('CPF', '12345678909')}</dl><p class="small-note">No campo de e-mail do pagamento, use um endereço diferente do da sua conta do Mercado Pago. O Pix de teste fica sempre pendente.</p></details>`;
}
function livePaymentView() {
  const test = live.mode === 'test', phase = order.phase, expired = phase === 'expired';
  const back = '<button class="text-button payment-back" data-action="delivery">← Alterar dados ou pagamento</button>';
  if (phase === 'pix' || expired) {
    const qr = safeBase64(order.pix?.qrCodeBase64);
    return `${heading('PEDIDO ' + order.id, expired ? 'O tempo passou.<br><em>Suas escolhas ficaram.</em>' : 'Falta só<br><em>um pequeno passo.</em>', test ? 'Pix de teste do Mercado Pago. Nenhum valor real será cobrado.' : 'Pague com o Pix e o pedido é confirmado na hora.')}<div class="shop-layout"><section class="payment-panel" aria-label="Pagamento por Pix">${progress()}<div class="payment-state"><span class="status-pill ${expired ? 'expired' : ''}">${expired ? 'Código expirado' : '<i class="waiting-dot" aria-hidden="true"></i>Aguardando pagamento'}</span><h2>${expired ? 'Gere um novo código.' : 'Pague do seu jeito, com Pix.'}</h2><p>${expired ? 'Seu pedido e suas cores continuam aqui.' : 'No celular, copie o código. Em outro dispositivo, use o QR Code.'}</p></div>${expired ? '<div class="expired-art" aria-hidden="true">↻</div>' : `${qr ? `<div class="live-qr"><img src="data:image/png;base64,${qr}" width="200" height="200" alt="QR Code do Pix"></div>` : ''}<p class="countdown">Válido por <strong id="pix-time" role="timer"></strong></p><label class="pix-code-label" for="pix-code">Pix copia e cola</label><div class="pix-copy"><input id="pix-code" readonly value="${esc(order.pix?.qrCode)}"><button data-action="copy-live-pix">Copiar código</button></div>${test ? '<p class="small-note">No ambiente de teste o Pix fica pendente: não existe pagamento real para confirmar. Para ver um pedido aprovado, use um cartão de teste.</p>' : ''}`}<div class="payment-buttons">${expired ? primary('Gerar novo código Pix', 'new-pix') : '<button class="secondary-button" data-action="check-now">Já paguei · verificar agora</button>'}</div>${back}</section>${summary(order.items)}</div>`;
  }
  if (phase === 'review') {
    return `${heading('PEDIDO ' + order.id, 'Estamos<br><em>confirmando.</em>', 'O pagamento está em análise. Costuma levar poucos minutos.')}<div class="shop-layout"><section class="payment-panel" aria-label="Pagamento em análise">${progress()}<div class="payment-state"><span class="status-pill"><i class="waiting-dot" aria-hidden="true"></i>Em análise</span><h2>Só mais um instante.</h2><p>Você não precisa fazer nada. Quando o pagamento for confirmado, esta página avança sozinha.</p></div><div class="payment-buttons"><button class="secondary-button" data-action="check-now">Verificar agora</button></div></section>${summary(order.items)}</div>`;
  }
  return `${heading('PAGAMENTO', 'Falta só<br><em>um pequeno passo.</em>', test ? 'Ambiente de teste do Mercado Pago. Nenhum valor real será cobrado.' : 'Escolha como prefere pagar. O Mercado Pago processa tudo com segurança.')}<div class="shop-layout"><section class="payment-panel" aria-label="Pagamento">${progress()}${testHelp()}<p id="brick-loading" class="small-note">Carregando as formas de pagamento…</p><div id="payment-brick" class="payment-brick" translate="no" aria-busy="true"></div><p id="card-error" class="inline-error" role="alert"></p>${back}</section>${summary(order.items)}</div>`;
}
function disposeLive() {
  brickToken++; clearInterval(pollTimer); clearInterval(clockTimer); pollTimer = clockTimer = null;
  try { brick?.unmount?.(); } catch {}
  brick = null;
}
function showPaymentError(message, detail = '') {
  const box = main.querySelector('#card-error');
  if (!box) return announce(message);
  box.textContent = message;
  if (detail) { const small = document.createElement('small'); small.setAttribute('translate', 'no'); small.textContent = ` (${detail})`; box.append(small); }
}
async function mountBrick() {
  const token = ++brickToken, box = main.querySelector('#payment-brick');
  if (!box) return;
  try {
    const MercadoPago = await loadSdk();
    if (token !== brickToken) return;
    const controller = await new MercadoPago(live.publicKey, {locale: brickLocale(lang())}).bricks().create('payment', 'payment-brick', {
      initialization: {amount: order.amounts.total / 100, payer: {email: draft.email}},
      customization: {paymentMethods: {creditCard: 'all', debitCard: 'all', bankTransfer: 'all', maxInstallments: 12}, visual: {hideFormTitle: true, style: BRICK_STYLE}},
      callbacks: {
        onReady: () => { box.removeAttribute('aria-busy'); main.querySelector('#brick-loading')?.remove(); },
        onSubmit: data => submitFromBrick(data),
        onError: error => { console.error('Payment Brick:', error?.type, error?.cause || error?.message); if (error?.type === 'critical') showPaymentError('Não foi possível carregar o pagamento. Recarregue a página e tente de novo.'); }
      }
    });
    if (token !== brickToken) { try { controller.unmount(); } catch {} return; }
    brick = controller;
  } catch (error) {
    if (token !== brickToken) return;
    console.error('Payment Brick did not load:', error?.message);
    main.querySelector('#brick-loading')?.remove();
    box.removeAttribute('aria-busy');
    box.innerHTML = '<p class="inline-error" role="alert">Não foi possível carregar as formas de pagamento. Verifique sua conexão e tente de novo.</p><button class="primary shop-primary" data-action="retry-brick">Tentar novamente</button>';
  }
}
// Called by the Brick when the customer presses its pay button. The promise tells the Brick when to stop spinning.
function submitFromBrick(data) {
  return new Promise(async (resolve, reject) => {
    showPaymentError('');
    try {
      const {status, data: result} = await createPayment({
        attempt: newAttempt(), lang: lang(), notes: draft.notes || '',
        items: order.items.map(({productId, quantity, selection}) => ({productId, quantity, selection})),
        customer: {name: draft.name, email: draft.email, phone: draft.phone},
        address: {cep: draft.cep, street: draft.street, number: draft.number, district: draft.district, city: draft.city, state: draft.state, complement: draft.complement || ''},
        payment: {selectedPaymentMethod: data.selectedPaymentMethod || data.paymentMethod, formData: data.formData}
      });
      if (status !== 201 || !result?.ok) { showPaymentError(paymentMessage(status, result), result?.detail); return reject(new Error('payment_failed')); }
      if (result.state === 'refused' || result.state === 'expired') { showPaymentError(refusedMessage(), result.statusDetail); return reject(new Error('payment_refused')); }
      const pix = result.method?.type === 'bank_transfer' || result.method?.id === 'pix';
      order = {...order, id: result.reference, mpId: result.id, method: pix ? 'pix' : 'card', pix: result.pix, expiresAt: pix ? parseExpiry(result.pix?.expiresAt) : null, phase: result.state === 'pending_pix' ? 'pix' : result.state === 'approved' ? 'done' : 'review'};
      resolve();
      setTimeout(() => { if (result.state === 'approved') { order = {...order, status: 'approved'}; finishPaid(); } else { render(); announce(result.state === 'pending_pix' ? 'Pix gerado. Pague com o código ou o QR Code.' : 'Pagamento em análise.'); } }, 0);
    } catch (error) {
      showPaymentError(paymentMessage(0, null));
      reject(error);
    }
  });
}
function finishPaid() {
  try { if (direct) sessionStorage.removeItem(DIRECT_KEY); else persist(removePurchased(readCart(), order.items)); refreshHeader(); }
  catch { announce('Pagamento aprovado, mas não foi possível atualizar o carrinho neste navegador.'); }
  if (order.mode !== 'live') saveDemoOrder(order);
  stage = 'confirmation'; render(); announce(order.mode === 'test' ? 'Pagamento de teste aprovado. Nenhum valor real foi cobrado.' : 'Pagamento confirmado.');
}
function applyState(state) {
  if (!order?.live || stage !== 'payment') return;
  if (state === 'approved') { order = {...order, status: 'approved', phase: 'done'}; finishPaid(); }
  else if (state === 'expired' && order.phase !== 'expired') { order = {...order, phase: 'expired'}; render(false); announce('O Pix expirou. Gere um novo código para continuar.'); }
  else if (state === 'refused') { order = {...order, phase: 'form', id: null, mpId: null, pix: null}; render(); announce(refusedMessage()); }
}
async function checkNow(button) {
  if (!order?.mpId) return;
  const label = button.textContent; button.disabled = true; button.textContent = 'Verificando…';
  try { const {status, data} = await paymentState(order.mpId); if (status === 200) applyState(data.state); else announce('Não foi possível verificar agora. Tente de novo em instantes.'); }
  catch { announce('Não foi possível verificar agora. Tente de novo em instantes.'); }
  if (button.isConnected) { button.disabled = false; button.textContent = label; }
}
function afterLiveRender() {
  if (order.phase === 'form') mountBrick();
  else if (order.phase === 'pix' || order.phase === 'review') {
    if (order.phase === 'pix') {
      const tick = () => {
        const left = Math.max(0, Math.ceil((order.expiresAt - Date.now()) / 1000)), clock = document.querySelector('#pix-time');
        if (clock) clock.textContent = left >= 3600 ? `${Math.floor(left / 3600)} h ${String(Math.floor(left % 3600 / 60)).padStart(2, '0')} min` : `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
        if (!left) { order = {...order, phase: 'expired'}; render(false); announce('O Pix expirou. Gere um novo código para continuar.'); }
      };
      tick(); clockTimer = setInterval(tick, 1000);
    }
    pollTimer = setInterval(async () => { try { const {status, data} = await paymentState(order.mpId); if (status === 200) applyState(data.state); } catch {} }, 5000);
  }
}

function render(focus = true) {
  clearInterval(timer); timer = null; disposeLive();
  document.body.dataset.stage = stage;
  // Keep the same step navigation while replacing the cart or delivery content.
  const steps = document.querySelector('.shop-steps');
  main.before(steps);
  document.querySelectorAll('[data-step]').forEach(el=>{const active = el.dataset.step === (stage==='confirmation'?'payment':stage);if(active)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});
  main.innerHTML = stage === 'cart' ? renderCart(cart, selected) : stage === 'delivery' ? deliveryView() : stage === 'payment' ? paymentView() : confirmationView();
  main.querySelector('#cart-steps-slot')?.append(steps);
  const summaryPanel=main.querySelector('.order-summary');
  if(summaryPanel&&stage!=='cart'){
    summaryPanel.id='order-summary';
    const items=stage==='delivery'?purchaseItems():order.items;
    const quick=document.createElement('a');quick.className='mobile-order-bar';quick.href='#order-summary';
    quick.innerHTML=`<span>${count(items)} ${count(items)===1?'peça':'peças'} · <strong>${money(totals(items).total)}</strong></span><span>Ver resumo ↓</span>`;
    main.querySelector('.shop-heading').after(quick);
  }
  document.title = `${stage==='cart'?'Seu carrinho':stage==='confirmation'?(order?.live?'Pedido confirmado':'Pedido confirmado · demonstração'):'Finalizar pedido'} · Ju imprime pra mim`;
  const all=main.querySelector('#select-all');
  if(all)all.indeterminate=selected.size>0&&purchaseItems().length<cart.length;
  if (focus) {main.querySelector('h1').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
  if(stage==='payment'&&order?.live)afterLiveRender();
  if(stage==='payment' && !order.live && order.method==='pix' && paymentStatus(order)!=='expired') {
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
main.addEventListener('submit', e=>{if(e.target.id!=='delivery-form')return;e.preventDefault();if(busy)return;const form=e.target;if(!form.reportValidity())return;draft=Object.fromEntries(new FormData(form));if(!draft.name.trim()||!draft.street.trim()||!draft.city.trim()||!draft.number.trim()||!draft.district.trim()){announce('Preencha os dados de entrega, sem deixar campos em branco.');return;}method=draft.payment;try{order=live.mode!=='off'?createLiveOrder(purchaseItems()):createDemoOrder(purchaseItems(),method);stage='payment';render();}catch(error){announce(error.message);}});
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
    if(action==='return'){returnFromCart();return;}
    if(['plus','minus','remove'].includes(action)&&item){const next=cart.map(i=>({...i}));if(action==='remove')persist(next.filter(i=>i.id!==id));else{next.find(i=>i.id===id).quantity=Math.max(1,Math.min(99,item.quantity+(action==='plus'?1:-1)));persist(next);}render(false);const target=[...main.querySelectorAll('[data-action]')].find(b=>b.dataset.id===id&&b.dataset.action===action&&!b.disabled);(target||main.querySelector('h1')).focus({preventScroll:true});announce(action==='remove'?'Peça removida do carrinho.':'Quantidade atualizada.');}
    if(action==='edit'&&item){sessionStorage.setItem(EDIT_KEY,JSON.stringify({id:item.id}));location.assign(`index.html#produto/${item.productId}`);}
    if(action==='checkout'&&purchaseItems().length){stage='delivery';render();}
    if(action==='remove-selected'){persist(cart.filter(i=>!selected.has(i.id)));render();announce('Itens selecionados removidos.');}
    if(action==='cart'&&direct&&cart[0]){location.assign(`index.html#produto/${cart[0].productId}`);return;}
    if(action==='cart'){const form=document.querySelector('#delivery-form');if(form)draft=Object.fromEntries(new FormData(form));stage='cart';order=null;render();}
    if(action==='delivery'){stage='delivery';order=null;render();}
    if(action==='retry-brick'){render(false);}
    if(action==='new-pix'){order={...order,phase:'form',id:null,mpId:null,pix:null,status:'pending'};render();}
    if(action==='copy-live-pix'){try{await navigator.clipboard.writeText(order.pix.qrCode);announce('Código Pix copiado.');}catch{document.querySelector('#pix-code').select();announce('Selecione e copie o código Pix.');}}
    if(action==='check-now'){await checkNow(button);}
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
    if(action==='copy-order'){const text=`Pedido ${order.id}${order.live ? '' : ' — demonstração'}\n`+order.items.map(i=>`${i.quantity}x ${i.title}\n`+PRODUCTS[i.productId].parts.map(p=>`${p.name}: ${color(i.selection[p.id]).name}`).join('\n')).join('\n\n');try{await navigator.clipboard.writeText(text);announce('Resumo copiado.');}catch{announce('Não foi possível copiar automaticamente. As escolhas estão no resumo ao lado.');}}
  } catch(error){busy=false;button.disabled=false;announce(error.message);}
});
window.addEventListener('storage',e=>{if(e.key!==CART_KEY||direct)return;cart=readCart();selected=new Set(cart.map(i=>i.id));if(stage==='cart')render(false);else if(stage==='delivery'||stage==='payment'){order=null;stage='cart';render();announce('O carrinho foi alterado em outra aba. Confira os itens antes de continuar.');}});
render(false);
