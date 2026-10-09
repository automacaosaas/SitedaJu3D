import {returnFromCart} from './shopping-navigation.js';
import {PRODUCTS, color, itemColors} from './products.js';
import {COMMERCE, money, installmentLabel} from './commerce-config.js';
import {CONTACT} from './company.js';
import {readCart, writeCart, totals, pixDiscount, EDIT_KEY, CART_KEY, DIRECT_KEY, normalizeCart, removePurchased, signature} from './cart-store.js';
import {createDemoOrder, paymentStatus, approveDemo, renewDemo, demoPixCode} from './demo-payment.js';
import {SDK_OPTIONS, loadPaymentConfigPatiently, loadPaymentMethods, loadSdk, loadDeviceId, currentDeviceId, newAttempt, keepAttempt, createPayment, paymentState, cancelPayment, paymentMessage, refusalNotice, brickLocale, BRICK_STYLE, safeBase64, parseExpiry} from './live-payment.js';
import {openRefusalNotice} from './payment-notice.js';
import {pixSteps, formatPixClock, pixClockNotice, pixHowTo, nextStep, stillClosing, cancelOutcome, isPixAttempt, lockPanel, holdButton, isHeld, focusInside, focusInSight, copyPixCode, unmarkCopied} from './pix-panel.js';
import {rememberPendingPix, recallPendingPix, forgetPendingPix as forgetPix, resumeStep, matchCartItems} from './pending-pix.js';

import {loadShippingConfig, quoteShipping, formatDays, shippingMessage, isCep, pickOption} from './shipping-client.js';
import {lookupCep, cepMessage} from './cep-client.js';
import {freeShippingBar, barRatio, riseBar} from './free-shipping.js';
import {installmentRows, installmentsInfo, interestFreeCount, promisedInstallments} from './installments.js';
import {icon} from './icons.js';
import {saveDemoOrder, getSession, refreshSession, loadProfile, saveProfile} from './auth-service.js';
import {identificationForm, wireIdentification, readIdentification, showIdentificationError} from './identification.js';

import {refreshHeader} from './site-shell.js';
import {renderCart, cartSummary, wireRecArrows, updateRecArrows, wireSummaryLink, watchSummary, paymentBlock} from './cart-view.js';

const direct = document.body.dataset.flow === 'direct';
function readDirect() {try{return normalizeCart(JSON.parse(sessionStorage.getItem(DIRECT_KEY)||'[]'));}catch{return [];}}
const main = document.querySelector('#shop-main'), liveRegion = document.querySelector('#shop-live');
// Real payments (Mercado Pago) are on only when the server says so; otherwise everything below behaves as the demo.
// Real shipping (Correios contract) is on only when the server says so; otherwise the fixed example fee stays.
// The session, the payment keys and the shipping settings are asked at once: the cart shows after a single round trip.
// Pix only where the Mercado Pago account really takes it (09/10/2026: the live account still had no Pix). /api/payments/methods
// lists what the account accepts; with an answer and no bank transfer in it, the checkout opens on the card and Pix is not offered.
// No answer (or payments off): Pix stays, as before.
const pixOffered = () => fetch('/api/payments/methods', {headers: {accept: 'application/json'}, signal: AbortSignal.timeout?.(2500)})
  .then(r => r.ok ? r.json() : null).then(d => !Array.isArray(d?.methods) || d.methods.some(m => m?.type === 'bank_transfer' || m?.id === 'pix')).catch(() => true);
// The payment settings are asked with patience (live-payment.js loadPaymentConfigPatiently, 2026-10-08): a slow first answer
// is waited for (with a second request beside it after 2.5 s) instead of falling into the demo, and meanwhile the page's placeholder (the outline of the step, in the HTML,
// cart-page.css .shop-skeleton) says "Carregando o pagamento…". Still no answer: 'unreachable', and the delivery step asks
// once more before the payment (never the demo for a real buyer).
const loadingLine = document.querySelector('[data-checkout-loading]');
const [, firstLive, shipCfg, pixAvailable] = await Promise.all([refreshSession(), loadPaymentConfigPatiently({onRetry: () => { if (loadingLine) loadingLine.textContent = 'Carregando o pagamento…'; }}), loadShippingConfig(), pixOffered()]);
let live = firstLive;
const real = shipCfg.mode === 'correios';
function paintBanner() {
  const banner = document.querySelector('.demo-banner');
  if (!banner) return;
  banner.hidden = live.mode === 'unreachable';   // unknown: neither "protótipo" nor "teste" (a real buyer may be paying)
  if (live.mode === 'test') banner.innerHTML = 'AMBIENTE DE TESTE <span>Pagamentos de teste do Mercado Pago · nenhum valor real é cobrado</span>';
  else if (live.mode === 'live') { banner.remove(); return; }
  else if (live.mode !== 'unreachable') banner.innerHTML = 'PROTÓTIPO PARA AVALIAÇÃO <span>Valores ilustrativos · sem cobranças</span>';
  banner.classList.remove('is-pending');   // born invisible (as tall as always, the demonstration notice): shown only now, with the right text
}
paintBanner();
let brick = null, brickToken = 0, pollTimer = null, clockTimer = null;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let profile = null;
const CEP_KEY = 'ju.cep.v1';
const formatCep = value => { const digits = String(value ?? '').replace(/\D/g, '').slice(0, 8); return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits; };
const savedCep = () => { try { return formatCep(sessionStorage.getItem(CEP_KEY) || ''); } catch { return ''; } };
const saveCep = cep => { try { sessionStorage.setItem(CEP_KEY, String(cep).replace(/\D/g, '')); } catch {} };
// payMethod: the method chosen above the Mercado Pago Brick (pix | card). Pix pays 5% less on the pieces.
let payMethod = live.mode === 'off' || pixAvailable ? 'pix' : 'card';
let cart = direct ? readDirect() : readCart(), stage = direct && readDirect().length ? 'delivery' : 'cart', method = 'pix', order = null, draft = {name:getSession()?.name || '', email:getSession()?.email || '', cep: savedCep()}, timer = null, busy = false, noticeTimer = null;
const startStage = stage;   // where the checkout starts (and starts again after a remembered Pix is cancelled)
const purchaseItems = () => cart;   // the whole cart is bought (no checkboxes)
// The Pix that waits, remembered by this tab (pending-pix.js): only Mercado Pago's id and the order reference.
const tabStore = () => { try { return sessionStorage; } catch { return null; } };
const forgetPendingPix = () => forgetPix(tabStore());
// ── real shipping (Correios contract) ───────────────────────────────────
// `ship` holds the CEP asked, the options the server answered and the one chosen (PAC until the buyer picks another; see pickOption).
// The browser never sends a price to be trusted: the server quotes again when the order is paid and compares.
let ship = {cep: '', key: '', status: 'idle', options: [], chosen: null, error: null}, shipToken = 0, shipTimer = null;
let cepTimer = null, cepToken = 0, cepDone = '';
const shipKey = () => purchaseItems().map(i => `${i.productId}:${i.quantity}`).sort().join(',');
const activeShipping = () => (stage === 'payment' || stage === 'confirmation') && order ? order.shipping || null : ship.chosen;
const shippingCents = () => real ? (activeShipping() ? activeShipping().priceCents : null) : COMMERCE.shippingCents;
const productionText = () => { const s = activeShipping(); return s ? `Prazo estimado: ${formatDays(s.days)}` : real && shipCfg.production ? `Produção: ${formatDays({min: shipCfg.production.minDays, max: shipCfg.production.maxDays})}` : `Produção: ${COMMERCE.productionLabel}`; };
function shippingInner() {
  if (ship.status === 'loading') return '<p class="ship-note" role="status">Calculando o frete…</p>';
  if (ship.status === 'ready') return `<div class="ship-options" role="radiogroup" aria-label="Opções de envio">${ship.options.map(o => `<label class="ship-option"><input type="radio" name="shipping-service" value="${esc(o.service)}" ${ship.chosen?.service === o.service ? 'checked' : ''}><span class="ship-main"><strong>${esc(o.label)}</strong><small>Entrega em ${formatDays(o.days)}</small></span><span class="ship-price">${o.free ? '<em>Grátis</em>' : money(o.priceCents)}</span></label>`).join('')}</div>`;
  if (ship.status === 'none' || ship.status === 'error') return `<p class="ship-note ship-problem" role="alert">${shippingMessage(ship.error)}</p>${ship.status === 'error' && ship.error !== 'invalid_cep' ? '<button type="button" class="text-button" data-action="retry-shipping">Tentar de novo</button>' : ''}`;
  return '<p class="ship-note">Digite o CEP para calcular o frete.</p>';
}
const shippingSection = () => real
  ? `<div class="shipping-choice"><p class="ship-title"><strong>Como quer receber?</strong><a href="envio" target="_blank" rel="noopener">Prazos e frete</a></p><div id="shipping-choice" aria-live="polite">${shippingInner()}</div></div>`
  : `<div class="shipping-option"><span aria-hidden="true">↗</span><div><strong>Entrega no seu endereço</strong><p>Frete e prazo finais serão definidos na integração.</p></div><strong>${money(COMMERCE.shippingCents)}<small>exemplo</small></strong></div>`;
// the payment marks of the cart: the Mercado Pago account's own list, when payments are on (asked once, after the page shows)
let payMethods = null;
const cartOptions = () => ({payMethods, realShipping: real, productionLabel: real && shipCfg.production ? formatDays({min: shipCfg.production.minDays, max: shipCfg.production.maxDays}) : '', freeShipping: real ? shipCfg.freeShipping : null, estimate: ship});
function paintShipping() {
  if (stage === 'cart') {
    const aside = main.querySelector('.cart-order-summary');
    if (!aside) return;
    const focused = document.activeElement?.id, typed = main.querySelector('#cart-cep')?.value;
    aside.outerHTML = cartSummary(purchaseItems(), cartOptions());
    watchSummary(main);
    const input = main.querySelector('#cart-cep');
    if (input && typed !== undefined && focused === 'cart-cep') { input.value = typed; input.focus({preventScroll: true}); }
    else if (focused) main.querySelector('#' + focused)?.focus({preventScroll: true});
    return;
  }
  const box = main.querySelector('#shipping-choice');
  if (box) box.innerHTML = shippingInner();
  const aside = main.querySelector('.order-summary');
  if (aside && stage === 'delivery') aside.outerHTML = summary(purchaseItems());
  const bar = main.querySelector('.mobile-order-bar');
  if (bar && stage === 'delivery') bar.innerHTML = mobileBar(purchaseItems());
}
async function requestShipping(cep) {
  const token = ++shipToken, previous = ship.chosen?.service;
  ship = {cep, key: shipKey(), status: 'loading', options: [], chosen: null, error: null};
  paintShipping();
  const result = await quoteShipping({items: purchaseItems(), cep});
  if (token !== shipToken) return;   // the CEP or the cart changed meanwhile
  ship = result.ok
    ? {...ship, status: 'ready', options: result.options, chosen: pickOption(result.options, previous)}
    : {...ship, status: result.error === 'no_service' || result.error === 'invalid_cep' ? 'none' : 'error', error: result.error};
  paintShipping();
  if (!result.ok) announce(shippingMessage(result.error));
}
// Called whenever the delivery step is drawn: (re)quote when the CEP is filled in and nothing current is known for this cart.
function ensureShipping() {
  if (real && stage === 'cart') {
    const cep = isCep(ship.cep) ? ship.cep : String(draft.cep ?? '').replace(/\D/g, '');
    if (isCep(cep) && purchaseItems().length && (ship.cep !== cep || ship.key !== shipKey()) && ship.status !== 'loading') { clearTimeout(shipTimer); shipTimer = setTimeout(() => requestShipping(cep), 400); }   // one quote after a burst of +/− clicks
    return;
  }
  if (!real || stage !== 'delivery') return;
  const cep = String(draft.cep ?? '').replace(/\D/g, '');
  if (!isCep(cep)) { if (ship.status !== 'idle') ship = {cep: '', key: '', status: 'idle', options: [], chosen: null, error: null}; return; }
  if (ship.cep === cep && ship.key === shipKey() && ship.status !== 'idle' && ship.status !== 'loading') return;
  setTimeout(() => requestShipping(cep), 0);
}
const shippingGuard = () => ship.status === 'loading' || (ship.status === 'idle' && isCep(draft.cep)) ? 'Aguarde o cálculo do frete.' : ship.status === 'ready' && !ship.chosen ? 'Escolha uma forma de envio.' : shippingMessage(ship.status === 'idle' ? 'invalid_cep' : ship.error);
// The server refused the delivery at payment time (price moved, no service, Correios down): back to the delivery step.
function backToDelivery(result) {
  ship = result.options?.length ? {...ship, status: 'ready', options: result.options, chosen: null, error: null} : {cep: '', key: '', status: 'idle', options: [], chosen: null, error: null};
  stage = 'delivery'; order = null; render();
  announce(shippingMessage(result.error, result.field));
}
const count = items => items.reduce((n, i) => n + i.quantity, 0);
// The phone's sticky total: the same amount as the summary (the delivery once known, "sem frete" before), never the example fee.
function mobileBar(items) {
  const barShipping = shippingCents();
  return `<span>${count(items)} ${count(items)===1?'peça':'peças'} · <strong>${money(totals(items, barShipping ?? 0).total - (pixApplied() ? pixDiscount(items) : 0))}</strong>${barShipping === null ? ' <small>sem frete</small>' : ''}</span><span>Ver resumo ↓</span>`;
}
const announce = message => {clearTimeout(noticeTimer);liveRegion.textContent = message;noticeTimer=setTimeout(()=>{liveRegion.textContent='';},7000);};
const primary = (text, action, extra = '') => `<button class="primary shop-primary" data-action="${action}" ${extra}>${text}<span aria-hidden="true">↗</span></button>`;
function heading(kicker, title, description) { return `<div class="shop-heading"><p class="eyebrow">${kicker}</p><h1 tabindex="-1">${title}</h1><p>${description}</p></div>`; }
function chips(item) { return `<ul class="color-chips">${itemColors(item.productId, item.selection).map(c => `<li><i style="--chip:${c.paint}" aria-hidden="true"></i><span>${c.part ? `${c.part}: ` : ''}<strong>${c.name}</strong></span></li>`).join('')}</ul>`; }
// as linhas de cor de um item no texto do pedido (WhatsApp, copiar): "Corpo: Verde-menta"; na peça de cores fixas, as cores dela
const colorLines = item => itemColors(item.productId, item.selection).map(c => c.part ? `${c.part}: ${c.name}` : c.name).join('\n');
function thumbnail(item) { return `<div class="cart-art" style="--item-aura:${(itemColors(item.productId, item.selection)[0]?.hex || '#cccccc')}40"><img src="${esc(item.thumbnail || `assets/${PRODUCTS[item.productId].catalogImage || PRODUCTS[item.productId].image}`)}" alt="${esc(item.title)} — ${item.thumbnail ? 'prévia 3D da combinação' : 'imagem nas cores originais'}"><small>${item.thumbnail ? 'Suas cores' : 'Cores originais'}</small></div>`; }
// The Pix discount counts once the payment is Pix: chosen above the Brick, or the method of the order already created.
const pixApplied = () => (stage === 'payment' || stage === 'confirmation') && Boolean(order) && (order.live ? (order.phase === 'form' ? payMethod === 'pix' : order.method === 'pix') : order.method === 'pix');
function amounts(items) {
  const cents = shippingCents(), t = totals(items, cents ?? 0), chosen = activeShipping(), discount = pixDiscount(items), applied = pixApplied();
  const label = !real ? 'Entrega <small>(exemplo)</small>' : chosen ? `Entrega <small>(${esc(chosen.label)})</small>` : 'Entrega';
  const value = cents === null ? '<small>calculada pelo CEP</small>' : cents === 0 && chosen?.free ? '<em>Grátis</em>' : money(cents);
  return `<dl class="amounts"><div><dt>Subtotal</dt><dd>${money(t.subtotal)}</dd></div><div><dt>${label}</dt><dd>${value}</dd></div>${applied ? `<div class="pix-discount"><dt>Desconto no Pix (5%)</dt><dd>− ${money(discount)}</dd></div>` : ''}<div class="grand-total"><dt>Total${cents === null ? ' <small>(sem entrega)</small>' : ''}</dt><dd>${money(t.total - (applied ? discount : 0))}</dd></div>${!applied && stage !== 'confirmation' && items.length ? `<div class="pix-hint"><dt>No Pix <small>(5% off)</small></dt><dd>${money(t.total - discount)}</dd></div>` : ''}</dl>`;
}
const summaryFreeShipping = items => real && ['identification', 'delivery'].includes(stage) ? freeShippingBar(shipCfg.freeShipping, totals(items, 0).subtotal) : '';
function summary(items, action = '') {return `<aside class="order-summary" id="order-summary"><p class="eyebrow">CADA DETALHE, DO SEU JEITO</p><h2>Resumo do pedido</h2>${summaryFreeShipping(items)}${items.map(i => `<article class="summary-item">${thumbnail(i)}<div><h3>${esc(i.title)}</h3><p>${i.quantity} ${i.quantity === 1 ? 'peça' : 'peças'} · ${money(i.unitPrice * i.quantity)}</p>${chips(i)}</div></article>`).join('')}${amounts(items)}<p class="production-note">Feito sob encomenda<br><strong>${productionText()}</strong></p>${action}${live.mode === 'live' || live.mode === 'unreachable' ? '' : `<p class="small-note">${real ? 'Preços são exemplos para avaliação. O frete é calculado pelo CEP, com a tabela dos Correios.' : 'Preços, frete e prazo são exemplos para avaliação. A entrega real será calculada antes do pagamento.'}</p>`}</aside>`;}
function field(name, label, options = {}) {return `<label class="field ${options.wide ? 'wide' : ''}"><span>${label}${options.optional ? ' <small>(opcional)</small>' : ''}</span><input name="${name}" value="${esc(draft[name])}" type="${options.type || 'text'}" ${options.optional ? '' : 'required'} autocomplete="${options.auto || 'off'}" ${options.inputmode ? `inputmode="${options.inputmode}"` : ''} ${options.pattern ? `pattern="${options.pattern}"` : ''} maxlength="${options.max || 100}" ${options.placeholder ? `placeholder="${options.placeholder}"` : ''}>${options.hint ? '<small class="field-hint" data-hint role="status"></small>' : ''}</label>`;}
// Identification (FARM Rio reference): e-mail from the account, name, surname, CPF, phone and optional company data.
function identificationView() {return `${heading(direct?'COMPRAR AGORA':'IDENTIFICAÇÃO', 'Quem está<br><em>comprando?</em>', 'Seus dados para a nota fiscal e a entrega.')}<div class="shop-layout"><section class="identification-panel">${identificationForm({email:getSession()?.email || '', profile, submitLabel:'Ir para a entrega'})}<button class="text-button" type="button" data-action="cart">${direct?'← Rever minha combinação':'← Voltar ao carrinho'}</button></section>${summary(purchaseItems())}</div>`;}
function deliveryView() {return `${heading(direct?'COMPRAR AGORA':'UM PASSO MAIS PERTO', 'Para onde vai<br><em>esse carinho?</em>', 'Preencha os dados de entrega e escolha como prefere pagar.')}<div class="shop-layout"><form id="delivery-form" class="delivery-form"><div class="form-section"><div class="section-label"><span>01</span><h2>Quem vai receber?</h2></div><p class="small-note">${deliveryNote()}</p><div class="form-grid">${field('name', 'Nome completo', {auto:'name',wide:true,max:120})}${field('email', 'E-mail', {type:'email',auto:'email',max:180})}${field('phone', 'WhatsApp com DDD', {type:'tel',auto:'tel',inputmode:'tel',max:20,placeholder:'(11) 99999-9999'})}</div></div><div class="form-section"><div class="section-label"><span>02</span><h2>Endereço de entrega</h2></div><div class="form-grid">${field('cep','CEP',{auto:'postal-code',inputmode:'numeric',pattern:'[0-9]{5}-?[0-9]{3}',max:9,placeholder:'00000-000',hint:true,wide:true})}${field('street','Rua ou avenida',{auto:'address-line1',wide:true})}${field('number','Número',{max:12})}${field('complement','Complemento',{optional:true,auto:'address-line2'})}${field('district','Bairro',{max:80,wide:true})}${field('city','Cidade',{auto:'address-level2'})}<label class="field"><span>Estado</span><select name="state" autocomplete="address-level1" required><option value="">Selecione</option>${'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ').map(s=>`<option ${draft.state === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label class="field wide"><span>Observações <small>(opcional)</small></span><textarea name="notes" rows="2" maxlength="500" placeholder="Algo que a Ju precisa saber?">${esc(draft.notes)}</textarea></label></div>${shippingSection()}</div><div class="form-section"><div class="section-label"><span>03</span><h2>Como prefere pagar?</h2></div>${live.mode !== 'off' ? '<p class="small-note">Na próxima etapa você escolhe entre Pix, cartão de crédito ou cartão de débito. O pagamento é feito com segurança pelo Mercado Pago.</p>' : ''}<fieldset class="payment-choice" ${live.mode !== 'off' ? 'hidden disabled' : ''}><legend class="sr-only">Forma de pagamento</legend><label><input type="radio" name="payment" value="pix" ${method === 'pix' ? 'checked' : ''}><span class="method-symbol" aria-hidden="true">${icon('pix')}</span><span><strong>Pix</strong><small>Copia e cola ou QR Code · 5% off</small></span></label><label><input type="radio" name="payment" value="card" ${method === 'card' ? 'checked' : ''}><span class="method-symbol" aria-hidden="true">${icon('card')}</span><span><strong>Cartão</strong><small>Pagamento com intermediador</small></span></label></fieldset>${live.mode === 'off' ? '<p class="small-note">Aqui você pode experimentar a jornada completa, sem informar dados de cartão.</p>' : ''}</div><div class="terms-check"><label><input type="checkbox" name="terms" required ${draft.terms === 'on' ? 'checked' : ''}><span>Li e concordo com os Termos de Uso e a Política de Trocas e Devoluções, e declaro ter lido a Política de Privacidade.</span></label><p class="terms-links"><a href="termos" target="_blank" rel="noopener">Termos de Uso</a><a href="trocas" target="_blank" rel="noopener">Trocas e Devoluções</a><a href="privacidade" target="_blank" rel="noopener">Política de Privacidade</a></p></div><div class="form-footer"><button class="text-button" type="button" data-action="cart">${direct?'← Rever minha combinação':'← Voltar ao carrinho'}</button><button type="submit" class="primary shop-primary">Continuar para pagamento <span aria-hidden="true">↗</span></button></div></form>${summary(purchaseItems())}</div>`;}
// Decorative matrix, deliberately NOT a payable QR code.
function qrIllustration() {let cells = '';for(let y=0;y<21;y++)for(let x=0;x<21;x++){const inFinder = (x<7&&y<7)||(x>13&&y<7)||(x<7&&y>13);if(inFinder){const a=x>13?x-14:x,b=y>13?y-14:y;if(a===0||a===6||b===0||b===6||(a>=2&&a<=4&&b>=2&&b<=4))cells+=`<rect x="${x}" y="${y}" width="1" height="1"/>`;}else if((x*13+y*7+x*y)%5<2)cells+=`<rect x="${x}" y="${y}" width="1" height="1"/>`;}return `<div class="demo-qr"><svg viewBox="-2 -2 25 25" role="img" aria-label="QR Code ilustrativo, sem valor de pagamento"><g fill="#49303b">${cells}</g></svg><span>DEMONSTRAÇÃO</span></div>`;}
function progress() {const approved = order.status === 'approved';return `<ol class="order-progress" aria-label="Andamento do pedido">${['Pedido criado','Aguardando pagamento','Pagamento confirmado','Em preparação','Pronto para envio'].map((s,i)=>`<li class="${i < (approved?2:1) ? 'done' : i === (approved?2:1) ? 'current' : ''}" ${i === (approved?2:1) ? 'aria-current="step"' : ''}><i aria-hidden="true">${i < (approved?2:1) ? '✓' : i+1}</i><span>${s}</span></li>`).join('')}</ol>`;}
function paymentView() {if(order.live)return livePaymentView();const expired =paymentStatus(order) === 'expired', pix = order.method === 'pix';return `${heading('PEDIDO ' + order.id, expired ? 'O tempo passou.<br><em>Suas escolhas ficaram.</em>' : 'Falta só<br><em>um pequeno passo.</em>', 'Pagamento de demonstração. Nenhum valor será movimentado.')}<div class="shop-layout"><section class="payment-panel" aria-label="Pagamento por ${pix?'Pix':'cartão'}">${progress()}${pix ? `<div class="payment-state"><span class="status-pill ${expired?'expired':''}">${expired?'Código expirado':'<i class="waiting-dot" aria-hidden="true"></i>Aguardando pagamento'}</span><h2>${expired?'Gere um novo código.':'Pague do seu jeito, com Pix.'}</h2><p>${expired?'Seu pedido e suas cores continuam aqui.':'No celular, copie o código. Em outro dispositivo, você usaria o QR Code.'}</p></div>${expired ? '<div class="expired-art" aria-hidden="true">↻</div>' : `${qrIllustration()}<p class="qr-note">Imagem ilustrativa • não permite pagamentos</p><p class="countdown">Válido por <strong id="pix-time" role="timer"></strong></p><label class="pix-code-label" for="pix-code">Pix copia e cola <small>demonstrativo</small></label><div class="pix-copy"><input id="pix-code" readonly value="${demoPixCode(order)}"><button data-action="copy-pix">Copiar código</button></div>`}<div class="payment-buttons">${expired?primary('Gerar novo código de demonstração','renew'):primary('Já realizei o pagamento · simular','approve')}</div>${!expired?'<details class="demo-controls"><summary>Testar outro cenário</summary><button class="text-button" data-action="expire">Simular expiração do Pix</button></details>':''}` : `<div class="payment-state"><span class="status-pill">Cartão · demonstração</span><h2>Seu cartão, em boas mãos.</h2><p>Na versão final, o intermediador de pagamentos cuidará dos dados do seu cartão.</p></div><div class="card-illustration" aria-hidden="true"><span>Ju, imprime pra mim?</span><i>▥</i><strong>•••• &nbsp; •••• &nbsp; •••• &nbsp; ••••</strong><small>PRÉVIA DE PAGAMENTO</small></div><p class="card-explanation">Você não precisa digitar número, validade ou código de segurança para testar esta etapa.</p>${primary('Simular aprovação no cartão','approve')}<details class="demo-controls"><summary>Testar outro cenário</summary><button class="text-button" data-action="decline">Simular cartão recusado</button></details><p id="card-error" class="inline-error" role="alert"></p>`}<button class="text-button payment-back" data-action="delivery">← Alterar dados ou pagamento</button></section>${summary(order.items)}</div>`;}
function confirmationView() {const message = `Olá, Ju! Gostaria de falar sobre o pedido ${order.id}${order.live ? '' : ' (demonstração)'}.\n`+order.items.map(i=>`${i.quantity}x ${i.title}\n`+colorLines(i)).join('\n\n');const whatsapp = /^\d{12,13}$/.test(CONTACT.whatsapp) ? `<a class="primary shop-primary" href="https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(message)}" target="_blank" rel="noopener">Falar com a Ju no WhatsApp ↗</a>` : '<button class="secondary-button" disabled>WhatsApp da Ju · em breve</button><p class="small-note">O contato será habilitado quando o número da loja for definido.</p>';
return `${heading('PEDIDO ' + order.id, 'Suas cores.<br><em>Um novo começo.</em>', confirmationLead())}<div class="shop-layout"><section class="confirmation-panel"><div class="success-mark" aria-hidden="true">✓</div><h2>Seu pedido ganhou vida.</h2><p>${order.live ? 'A Ju recebeu todos os detalhes do seu pedido para preparar suas peças.' : 'Na loja final, a confirmação chega por aqui e a Ju recebe todos os detalhes para preparar suas peças.'}</p>${progress()}<div class="confirmation-facts"><div><small>Forma de pagamento</small><strong>${order.method==='pix'?'Pix':'Cartão'}</strong></div>${order.shipping ? `<div><small>Envio</small><strong>${esc(order.shipping.label)}</strong><small>${formatDays(order.shipping.days)}</small></div>` : `<div><small>Produção estimada</small><strong>${COMMERCE.productionLabel}</strong></div>`}</div>${whatsapp}<button class="text-button" data-action="copy-order">Copiar resumo para conversar com a Ju</button><a class="primary shop-primary" href="./">Continuar explorando <span aria-hidden="true">↗</span></a></section>${summary(order.items)}</div>`;}
// ── real payments (Mercado Pago) ───────────────────────────────────────
const lang = () => document.documentElement.lang || 'pt-BR';
const deliveryNote = () => live.mode === 'off' ? 'Use dados fictícios neste protótipo. Eles não são enviados nem salvos pelo formulário.' : live.mode === 'test' ? 'Ambiente de teste: use dados de teste. Eles servem só para criar o pedido de teste; nenhum valor real é cobrado.' : 'Usamos estes dados só para entregar o seu pedido.';
const confirmationLead = () => order.live ? (order.mode === 'test' ? 'Pagamento de teste aprovado. Nenhum valor real foi cobrado e nenhuma peça será produzida.' : 'Pagamento confirmado. A Ju já recebeu o seu pedido.') : 'Pagamento aprovado na demonstração. Nenhuma cobrança ou produção foi iniciada.';
function createLiveOrder(items) {
  const snapshot = normalizeCart(items);
  if (!snapshot.length) throw new Error('Adicione uma peça ao carrinho.');
  return {live: true, mode: live.mode, id: null, mpId: null, phase: 'form', method: null, status: 'pending', items: snapshot, amounts: totals(snapshot, shippingCents() ?? undefined), shipping: real ? ship.chosen : null, createdAt: Date.now(), pix: null, expiresAt: null};
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
    // The Pix screen (2026-10-08): "Voltar" on top (back to choosing how to pay, the old code cancelled first, like "Alterar
    // dados ou pagamento"), the four steps with the wait shown on the third, the amount and the time left, the QR Code and
    // the copy-and-paste code, and how to pay in three lines. The steps' first check draws itself once, when the code is new.
    const qr = safeBase64(order.pix?.qrCodeBase64), fresh = !expired && !order.pixShown;
    order.pixShown = true;
    const pixBack = `<div class="pix-top"><button type="button" class="pix-back" data-action="pix-back"><span class="pix-back-icon" aria-hidden="true">${icon('arrow')}</span><span data-label>Voltar<span class="sr-only"> para as formas de pagamento</span></span></button></div>`;
    const waiting = `<div class="pix-head"><h2>Pague do seu jeito, com Pix.</h2><p>No celular, copie o código. Em outro dispositivo, use o QR Code.</p></div><dl class="pix-facts"><div><dt>Valor no Pix</dt><dd>${money(order.pixTotal ?? order.amounts.total - pixDiscount(order.items))}</dd></div><div><dt>Válido por</dt><dd><strong id="pix-time" role="timer">${formatPixClock((order.expiresAt - Date.now()) / 1000)}</strong></dd></div></dl><div class="pix-pay">${qr ? `<div class="live-qr"><img src="data:image/png;base64,${qr}" width="240" height="240" alt="QR Code do Pix"></div>` : ''}<div class="pix-code"><label class="pix-code-label" for="pix-code">Pix copia e cola</label><div class="pix-copy"><input id="pix-code" readonly value="${esc(order.pix?.qrCode)}"><button type="button" class="pix-copy-button" data-action="copy-live-pix"><span class="pix-copy-icon" aria-hidden="true">${icon('document')}${icon('check')}</span><span class="pix-copy-labels"><span class="pix-copy-idle">Copiar código</span><span class="pix-copy-done" aria-hidden="true">Copiado!</span></span></button></div><p class="pix-copy-hint" id="pix-copy-hint" hidden>Não deu para copiar sozinho. O código ficou selecionado: use a opção Copiar do seu aparelho.</p></div></div>${pixHowTo()}${test ? '<p class="small-note">No ambiente de teste o Pix fica pendente: não existe pagamento real para confirmar. Para ver um pedido aprovado, use um cartão de teste.</p>' : ''}<div class="payment-buttons"><button type="button" class="secondary-button" data-action="check-now">Já paguei · verificar agora</button></div>`;
    const ended = `<div class="payment-state pix-ended"><div class="expired-art" aria-hidden="true">↻</div><h2>Gere um novo código.</h2><p>Seu pedido e suas cores continuam aqui.</p></div><div class="payment-buttons">${primary('<span data-label>Gerar novo código Pix</span>', 'new-pix')}</div>`;
    return `${heading('PEDIDO ' + order.id, expired ? 'O tempo passou.<br><em>Suas escolhas ficaram.</em>' : 'Falta só<br><em>um pequeno passo.</em>', test ? 'Pix de teste do Mercado Pago. Nenhum valor real será cobrado.' : 'Pague com o Pix e o pedido é confirmado na hora.')}<div class="shop-layout"><section class="payment-panel pix-panel" aria-label="Pagamento por Pix">${pixBack}${pixSteps(expired ? 'expired' : 'waiting', {fresh: fresh ? [1] : []})}${expired ? ended : waiting}${back}</section>${summary(order.items)}</div>`;
  }
  if (phase === 'resume') {
    // Back on the checkout (a reload, or the way back from another page) with a Pix that may still be paid (pending-pix.js):
    // go on with that same code, or cancel it before choosing again. Never a second payable code next to it.
    return `${heading('PEDIDO ' + esc(order.id || ''), 'Seu Pix<br><em>ainda está aberto.</em>', 'Você saiu da página com um código Pix aguardando pagamento.')}<div class="shop-layout"><section class="payment-panel pix-resume" aria-label="Pix aguardando pagamento"><div class="payment-state"><span class="status-pill"><i class="waiting-dot" aria-hidden="true"></i>Aguardando pagamento</span><h2>Este código ainda pode ser pago.</h2><p>Continue com ele, ou cancele antes de pagar de outro jeito: assim nunca ficam dois Pix abertos.</p></div><div class="payment-buttons">${primary('<span data-label>Continuar com este Pix</span>', 'resume-pix')}<button type="button" class="secondary-button" data-action="drop-pending"><span data-label>Cancelar este Pix e recomeçar</span></button></div></section>${summary(order.items)}</div>`;
  }
  if (phase === 'review') {
    return `${heading('PEDIDO ' + order.id, 'Estamos<br><em>confirmando.</em>', 'O pagamento está em análise. Costuma levar poucos minutos.')}<div class="shop-layout"><section class="payment-panel" aria-label="Pagamento em análise">${progress()}<div class="payment-state"><span class="status-pill"><i class="waiting-dot" aria-hidden="true"></i>Em análise</span><h2>Só mais um instante.</h2><p>Você não precisa fazer nada. Quando o pagamento for confirmado, esta página avança sozinha.</p></div><div class="payment-buttons"><button class="secondary-button" data-action="check-now">Verificar agora</button></div></section>${summary(order.items)}</div>`;
  }
  return `${heading('PAGAMENTO', 'Falta só<br><em>um pequeno passo.</em>', test ? 'Ambiente de teste do Mercado Pago. Nenhum valor real será cobrado.' : 'Escolha como prefere pagar. O Mercado Pago processa tudo com segurança.')}<div class="shop-layout"><section class="payment-panel" aria-label="Pagamento">${progress()}${payChoice()}${testHelp()}<p id="brick-loading" class="small-note">Carregando as formas de pagamento…</p><div id="payment-brick" class="payment-brick" translate="no" aria-busy="true" tabindex="-1"></div><p id="card-error" class="inline-error" role="alert"></p><div id="installments-info" class="installments-info" aria-live="polite" hidden></div>${back}</section>${summary(order.items)}</div>`;
}
// Pix and card side by side, above the Brick. The Brick then opens with only the chosen method and its amount.
function payChoice() {
  const full = order.amounts.total, discount = pixDiscount(order.items), pix = payMethod === 'pix';
  const option = (value, checked, inner) => `<button type="button" class="pay-option pay-${value}" role="radio" aria-checked="${checked}" tabindex="${checked ? 0 : -1}" data-action="pay-method" data-method="${value}">${inner}</button>`;
  return `<div class="pay-choice" role="radiogroup" aria-label="Forma de pagamento">${live.mode === 'off' || pixAvailable ? option('pix', pix, `<span class="pay-head"><span class="method-symbol" aria-hidden="true">${icon('pix')}</span><strong>Pix</strong><b>${money(full - discount)}</b></span><small>QR Code ou copia e cola · confirmação na hora</small><span class="pix-off"><strong>5% OFF NO PIX</strong><span>economize ${money(discount)}</span></span>`) : ''}${option('card', !pix, `<span class="pay-head"><span class="method-symbol" aria-hidden="true">${icon('card')}</span><strong>Cartão</strong><b>${money(full)}</b></span><small>Crédito ou débito</small><span class="card-off" data-card-offer>${cardOffer(full)}</span>`)}</div>`;
}
// The card's promise (2026-10-08): "3X SEM JUROS" only as far as Mercado Pago really gives it — for the typed card, its own
// table (cardFree); before that, the account's number from /api/payments/config (unknown: no promise) — and never past what
// the site announces (COMMERCE.interestFreeInstallments). Otherwise the honest "EM ATÉ 12X". Both texts sit in the same place
// and the larger one sets the size (cart-page.css), so switching never moves the Brick under the buyer's fingers.
let cardFree = null;
const freeInstallments = () => promisedInstallments(cardFree, live.interestFree, COMMERCE.interestFreeInstallments);
function cardOffer(full) {
  const n = freeInstallments(), free = n >= 2, shown = free ? n : COMMERCE.interestFreeInstallments, max = COMMERCE.maxInstallments;
  return `<span class="card-offer"${free ? '' : ' aria-hidden="true"'}><strong>${shown}X SEM JUROS</strong><span><span>${installmentLabel(full, shown)}</span> · <span>ou até ${max}x no crédito</span></span></span><span class="card-offer"${free ? ' aria-hidden="true"' : ''}><strong>EM ATÉ ${max}X</strong><span><span>no crédito</span> · <span>veja as parcelas ao digitar o cartão</span></span></span>`;
}
const paintCardOffer = () => { const box = main.querySelector('[data-card-offer]'); if (box && order?.amounts) box.innerHTML = cardOffer(order.amounts.total); };
function disposeLive() {
  brickToken++; clearInterval(pollTimer); clearInterval(clockTimer); pollTimer = clockTimer = null; cardFree = null;
  try { brick?.unmount?.(); } catch {}
  brick = null;
}
// The line right under the payment form. `quiet`: a refusal, which the notice already says aloud (the line stays as a
// reminder beside the form, without a second alert).
function showPaymentError(message, detail = '', {quiet = false} = {}) {
  const box = main.querySelector('#card-error');
  if (!box) return announce(message);
  if (quiet) box.removeAttribute('role'); else box.setAttribute('role', 'alert');
  box.textContent = message;
  if (detail) { const small = document.createElement('small'); small.className = 'inline-error-code'; small.setAttribute('translate', 'no'); small.textContent = ` (${detail})`; box.append(small); }   // test mode only: Mercado Pago's own code
}
// A refused card (2026-10-08): the notice opens with the reason and what to do; "Tentar outro cartão" (or whatever fits the
// reason), Esc or × bring focus back to the card form, with the same sentence left as a reminder right under it (written
// only then, as an answer to that click or key, so nothing moves on the page by itself); "Pagar com Pix" switches to Pix.
// `code`: Mercado Pago's own code, test only.
function refuse(reason, code = '') {
  const notice = refusalNotice(reason);
  openRefusalNotice({notice, code, pixPrice: order?.amounts ? money(order.amounts.total - pixDiscount(order.items)) : '', onChoice: choice => {
    if (choice === 'pix' && notice.pix) return switchMethod('pix');
    showPaymentError(notice.text, code, {quiet: true});
    main.querySelector('#payment-brick')?.focus({preventScroll: true});
    revealPaymentError();
  }});
}
// The line under the payment form in sight, with the form's pay button right above it: aligned to the bottom of the screen
// (cart-page.css scroll-margin-bottom keeps it clear of the edge and of the message toast) when any of it is out of sight.
// The form itself can be taller than the screen, so aligning the form ("nearest") left the line below the fold.
function revealPaymentError() {
  const line = main.querySelector('#card-error');
  if (!line?.textContent) return;
  const box = line.getBoundingClientRect(), margin = parseFloat(getComputedStyle(line).scrollMarginBottom) || 0;
  if (box.top >= 0 && box.bottom <= innerHeight - margin) return;
  line.scrollIntoView({block: 'end', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
}
// A Pix that could not be created (Mercado Pago turned the order down; the server's 422 payment_rejected, usually without a
// reason): its own short line under the form, said aloud, never the card's notice (whose words are about a card).
const PIX_FAILED = 'Não conseguimos gerar o Pix agora. Tente de novo ou pague com cartão.';
function pixFailed(code = '') {
  showPaymentError(PIX_FAILED, code);
  revealPaymentError();
}
// Pix or card above the Brick (the options, the arrow keys and the refusal notice's "Pagar com Pix"): another total, so a new attempt.
function switchMethod(next) {
  if (next === payMethod || !order?.live || order.phase !== 'form') return;
  payMethod = next; order = {...order, attempt: null};
  render(false);
  main.querySelector(`[data-method="${payMethod}"]`)?.focus();
  announce(payMethod === 'pix' ? 'Pix escolhido: 5% de desconto nas peças.' : 'Cartão escolhido.');
}
async function mountBrick() {
  const token = ++brickToken, box = main.querySelector('#payment-brick');
  if (!box) return;
  loadDeviceId();   // Mercado Pago's device id, ready by the time the buyer pays (never waited for)
  try {
    const MercadoPago = await loadSdk();
    if (token !== brickToken) return;
    const mp = new MercadoPago(live.publicKey, SDK_OPTIONS(lang()));
    const controller = await mp.bricks().create('payment', 'payment-brick', {
      // The server prices the order again (and applies the Pix discount itself); this amount is what the Brick shows.
      initialization: {amount: (order.amounts.total - (payMethod === 'pix' ? pixDiscount(order.items) : 0)) / 100, payer: {email: draft.email}},
      customization: {paymentMethods: payMethod === 'pix' ? {bankTransfer: 'all'} : {creditCard: 'all', debitCard: 'all', maxInstallments: COMMERCE.maxInstallments}, visual: {hideFormTitle: true, style: BRICK_STYLE}},
      callbacks: {
        onReady: () => { box.removeAttribute('aria-busy'); main.querySelector('#brick-loading')?.remove(); },
        onSubmit: data => submitFromBrick(data),
        onBinChange: bin => showInstallments(mp, bin),
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
// With the card's first digits, Mercado Pago tells every installment option for this card and amount: the table shows
// each installment, the total and the interest on top of the price, and the card option promises "sem juros" only as far as
// the table goes (cardOffer). Asked once per card and amount.
let binToken = 0;
const installmentCache = new Map();
async function showInstallments(mp, bin) {
  const box = main.querySelector('#installments-info'), token = ++binToken, digits = String(bin ?? '').replace(/\D/g, '').slice(0, 8);
  if (!box) return;
  if (payMethod === 'pix' || digits.length < 6 || !order?.amounts?.total || typeof mp?.getInstallments !== 'function') { box.hidden = true; box.innerHTML = ''; if (cardFree !== null) { cardFree = null; paintCardOffer(); } return; }
  const key = `${digits}:${order.amounts.total}`;
  let rows = installmentCache.get(key);
  if (!rows) {
    try { rows = installmentRows(await mp.getInstallments({amount: (order.amounts.total / 100).toFixed(2), bin: digits, locale: brickLocale(lang())}), order.amounts.total); }
    catch { rows = []; }
    installmentCache.set(key, rows);
  }
  if (token !== binToken || !box.isConnected) return;
  box.innerHTML = installmentsInfo(rows, {open: Boolean(box.querySelector('details')?.open)});   // "Ver todas as parcelas" stays as the buyer left it
  box.hidden = !box.innerHTML;
  const free = interestFreeCount(rows);
  if (free !== cardFree) { cardFree = free; paintCardOffer(); }
}
// Called by the Brick when the customer presses its pay button. The promise tells the Brick when to stop spinning.
// The attempt id stays the same until a definite answer: a retry after a timeout or a 5xx lands on the same order (and
// the same Mercado Pago idempotency key) instead of a second charge. Mercado Pago's own code shows only in test mode.
function submitFromBrick(data) {
  return new Promise(async (resolve, reject) => {
    showPaymentError('');
    if (!order.attempt) order = {...order, attempt: newAttempt()};
    const attempt = order.attempt, test = live.mode === 'test', pixTry = isPixAttempt(data.selectedPaymentMethod || data.paymentMethod, payMethod);
    const turnedDown = (reason, code) => { if (pixTry) pixFailed(code); else refuse(reason, code); };   // a Pix never opens the card's notice
    const settle = status => { if (order?.attempt === attempt && !keepAttempt(status)) order = {...order, attempt: null}; };
    try {
      const {status, data: result} = await createPayment({
        attempt, deviceId: currentDeviceId() || undefined, lang: lang(), notes: draft.notes || '', acceptTerms: draft.terms === 'on',
        shipping: order.shipping ? {service: order.shipping.service, priceCents: order.shipping.priceCents} : undefined,
        items: order.items.map(({productId, quantity, selection}) => ({productId, quantity, selection})),
        customer: {name: draft.name, email: draft.email, phone: draft.phone},
        address: {cep: draft.cep, street: draft.street, number: draft.number, district: draft.district, city: draft.city, state: draft.state, complement: draft.complement || ''},
        payment: {selectedPaymentMethod: data.selectedPaymentMethod || data.paymentMethod, formData: data.formData}
      });
      settle(status);
      // The session ended or the identification is missing (both checked again by the server): back to that step.
      if (status === 401) { reject(new Error('unauthorized')); location.assign(signInPage()); return; }
      if (result?.error === 'profile_incomplete') { reject(new Error('profile_incomplete')); setTimeout(() => toIdentification().then(() => announce(paymentMessage(status, result))), 0); return; }
      if (['shipping_changed', 'shipping_unavailable', 'no_service'].includes(result?.error) || (result?.error === 'invalid_request' && result?.field === 'shipping')) { reject(new Error('shipping')); setTimeout(() => backToDelivery(result), 0); return; }
      if (result?.error === 'payment_rejected') { turnedDown(result.reason, test ? result.reason || result.detail : ''); return reject(new Error('payment_refused')); }   // Mercado Pago's 402: a refusal too
      if (status !== 201 || !result?.ok) { showPaymentError(paymentMessage(status, result), test ? result?.reason || result?.detail : ''); return reject(new Error('payment_failed')); }
      if (result.state === 'refused' || result.state === 'expired') { turnedDown(result.reason, test ? result.paymentStatusDetail || result.statusDetail : ''); return reject(new Error('payment_refused')); }
      const pix = result.method?.type === 'bank_transfer' || result.method?.id === 'pix';
      order = {...order, id: result.reference, mpId: result.id, method: pix ? 'pix' : 'card', pix: result.pix, expiresAt: pix ? parseExpiry(result.pix?.expiresAt) : null, phase: result.state === 'pending_pix' ? 'pix' : result.state === 'approved' ? 'done' : 'review'};
      if (result.state === 'pending_pix') rememberPendingPix(tabStore(), {mpId: result.id, reference: result.reference});   // a reload finds it again
      resolve();
      setTimeout(() => { if (result.state === 'approved') { order = {...order, status: 'approved'}; finishPaid(); } else { render(); announce(result.state === 'pending_pix' ? 'Pix gerado. Pague com o código ou o QR Code.' : 'Pagamento em análise.'); } }, 0);
    } catch (error) {
      settle(0);   // no answer at all: the same attempt goes again on the next click
      showPaymentError(paymentMessage(0, null));
      reject(error);
    }
  });
}
function finishPaid() {
  forgetPendingPix();
  try { if (direct) sessionStorage.removeItem(DIRECT_KEY); else persist(removePurchased(readCart(), order.items)); refreshHeader(); }
  catch { announce('Pagamento aprovado, mas não foi possível atualizar o carrinho neste navegador.'); }
  stage = 'confirmation'; render(); announce(order.mode === 'test' ? 'Pagamento de teste aprovado. Nenhum valor real foi cobrado.' : 'Pagamento confirmado.');
}
// An answer about the order (the 5-second check, "Já paguei · verificar agora", a cancel that found it paid): what it leads to
// is decided by pix-panel.js nextStep, from where the page is; nothing happens while the paid Pix is closing.
function applyState(state, reason) {
  if (!order?.live || stage !== 'payment') return;
  const step = nextStep(order, state);
  if (step === 'close') closePixSteps();
  else if (step === 'finish') { order = {...order, status: 'approved', phase: 'done'}; finishPaid(); }
  else if (step === 'expire') { forgetPendingPix(); expirePix(); }   // Mercado Pago says it expired: it can no longer be paid
  else if (step === 'refuse' || step === 'refused-pix') {
    order = {...order, phase: 'form', id: null, mpId: null, pix: null, attempt: null};
    forgetPendingPix();
    render();
    if (step === 'refuse') refuse(reason); else pixFailed();
  }
}
// The Pix was paid: the waiting step and "Pagamento confirmado" get their checks on the Pix screen, then the confirmation
// that already existed shows (a moment later, so the steps can be seen closing; shorter with reduced motion). Nothing on the
// screen can be pressed meanwhile (lockPanel; no button wakes up again, holdButton's {closing}), the focus waits on the
// steps instead of falling to the page, and the clock and the checks stop.
function closePixSteps() {
  const paid = order;
  order = {...order, status: 'approved', closing: true};
  clearInterval(pollTimer); clearInterval(clockTimer); pollTimer = clockTimer = null;
  const steps = main.querySelector('.pix-steps');
  if (steps) steps.outerHTML = pixSteps('paid', {fresh: [2, 3]});
  lockPanel(main.querySelector('.pix-panel'));
  setTimeout(() => {
    if (!stillClosing(order, paid.mpId, stage)) return;
    order = {...order, phase: 'done', closing: false};
    finishPaid();
  }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 500 : 1300);
}
// The code ran out (the clock reached zero, or Mercado Pago said so): the expired screen, and the keyboard focus on "Gerar novo
// código Pix" when it was in the Pix screen (or already lost to the page), so it never falls to the top of the page.
function expirePix() {
  const lost = focusInside(document, main);
  order = {...order, phase: 'expired'};   // the memory of the Pix stays until Mercado Pago confirms (a clock can run ahead)
  render(false);
  announce('O Pix expirou. Gere um novo código para continuar.');
  if (lost) focusInSight(main.querySelector('[data-action="new-pix"]'), window);
}
// Leaving a Pix that may still be paid ("Gerar novo código Pix", "← Voltar", "← Alterar dados ou pagamento"): its code is cancelled at
// Mercado Pago first, so the old QR code cannot be paid next to a new one (pix-panel.js cancelOutcome): 'paid' when it was paid
// meanwhile (the confirmation shows), 'gone' when it can no longer be paid, 'kept' when Mercado Pago could not confirm: the
// screen stays, the button that was pressed takes the focus back (holdButton) and the reason is said.
async function dropPix(button) {
  if (!order?.live || !order.mpId || !['pix', 'expired', 'resume'].includes(order.phase)) return 'gone';
  const expired = order.phase === 'expired', release = holdButton(button, 'Cancelando o código anterior…');
  let result = null;
  try { result = await cancelPayment(order.mpId); } catch {}
  const outcome = cancelOutcome(result, expired);
  if (outcome === 'paid') { release({closing: true}); applyState('approved'); return 'paid'; }
  release();
  if (outcome === 'gone') forgetPendingPix();
  else announce('Não foi possível cancelar o código Pix anterior agora. Tente de novo em instantes.');
  return outcome;
}
// A Pix remembered by this tab (pending-pix.js), asked to the server: 'resume' and 'unknown' show the choice (go on with that
// code, or cancel it first), 'paid' the confirmation, 'gone' forgets it. Returns the step; `kept` from recallPendingPix.
async function loadPendingPix(kept) {
  let answer = null;
  try { answer = await paymentState(kept.mpId, {details: true}); } catch {}
  const step = resumeStep(answer), data = answer?.data || {};
  if (step === 'gone') { forgetPendingPix(); return step; }
  if (step === 'signin') return step;
  // the server's pieces with this cart's ids (pending-pix.js matchCartItems): paid after the reload, they leave the cart too
  const items = matchCartItems(normalizeCart(Array.isArray(data.items) ? data.items : []), purchaseItems(), item => signature(item.productId, item.selection)), shown = items.length ? items : purchaseItems();
  const shipping = data.shipping && typeof data.shipping.priceCents === 'number' ? data.shipping : null;
  order = {live: true, mode: live.mode, id: data.reference || kept.reference || null, mpId: kept.mpId, phase: step === 'paid' ? 'done' : 'resume', method: data.method === 'card' ? 'card' : 'pix', status: step === 'paid' ? 'approved' : 'pending',
    items: shown, amounts: totals(shown, shipping ? shipping.priceCents : shippingCents() ?? undefined), shipping, createdAt: Date.now(), pix: data.pix || null,
    expiresAt: data.pix ? parseExpiry(data.expiresAt) : null, pixTotal: Number.isInteger(data.totalCents) && data.method !== 'card' ? data.totalCents : null};
  stage = 'payment';
  if (step === 'paid') finishPaid();
  return step;
}
// On arrival, and before a new order is made: true when a remembered Pix took over the page (the choice, or the confirmation).
async function resumePendingPix() {
  const kept = live.mode !== 'off' && getSession() ? recallPendingPix(tabStore()) : null;
  if (!kept) return false;
  const step = await loadPendingPix(kept);
  if (step === 'gone' || step === 'signin') return false;
  if (step !== 'paid') render();   // the heading takes the focus and says it: "Seu Pix ainda está aberto."
  return true;
}
// "Continuar com este Pix": the same code on the Pix screen (asked again when the server could not say before).
async function continuePendingPix(button) {
  if (!order?.pix) {
    const release = holdButton(button, 'Conferindo o Pix…'), step = await loadPendingPix({mpId: order.mpId, reference: order.id || ''});
    release({closing: step === 'paid'});
    if (step === 'paid') return;
    if (step === 'gone') { announce('Esse Pix não vale mais. Escolha como prefere pagar.'); return restartCheckout(); }
    if (step !== 'resume') { if (step === 'signin') location.assign(signInPage()); else announce('Não foi possível conferir o Pix agora. Tente de novo em instantes.'); return; }
  }
  order = {...order, phase: 'pix'};
  render();
  if (order.phase === 'pix') announce('Pix aberto de novo. Pague com o código ou o QR Code.');   // its time may have run out meanwhile: expirePix said so
}
// The checkout from its start again (a remembered Pix was cancelled, or can no longer be paid).
async function restartCheckout() {
  order = null; stage = startStage;
  if ((location.hash === '#identificacao' || stage === 'delivery') && purchaseItems().length) { history.replaceState(null, '', location.pathname + location.search); await toIdentification(); }
  else { stage = 'cart'; render(); }
}
// "Copiar código" (pix-panel.js copyPixCode): "Copiado!" for a moment, or the code selected with a line saying how to copy it.
let copiedTimer = null;
async function copyLivePix(button) {
  const result = await copyPixCode({text: order.pix?.qrCode || '', clipboard: navigator.clipboard, button, input: main.querySelector('#pix-code'), hint: main.querySelector('#pix-copy-hint')});
  if (result === 'copied') { announce('Código Pix copiado.'); clearTimeout(copiedTimer); copiedTimer = setTimeout(() => { if (button.isConnected) unmarkCopied(button); }, 2500); }
  else announce('Não deu para copiar sozinho. O código ficou selecionado: use a opção Copiar do seu aparelho.');
}
async function checkNow(button) {
  if (!order?.mpId) return;
  const release = holdButton(button, 'Verificando…');
  try { const {status, data} = await paymentState(order.mpId); if (status === 200) applyState(data.state, data.reason); else announce('Não foi possível verificar agora. Tente de novo em instantes.'); }
  catch { announce('Não foi possível verificar agora. Tente de novo em instantes.'); }
  release({closing: Boolean(order?.closing)});   // paid meanwhile: it stays off with the rest of the closing screen
}
function afterLiveRender() {
  if (order.phase === 'form') mountBrick();
  else if (order.phase === 'pix' || order.phase === 'review') {
    if (order.phase === 'pix') {
      // the clock (role="timer") changes quietly every second; it speaks only at 5 minutes and at 1 minute left (pixClockNotice)
      let before = null;
      const tick = () => {
        const left = Math.max(0, Math.ceil((order.expiresAt - Date.now()) / 1000)), clock = document.querySelector('#pix-time'), notice = before === null ? '' : pixClockNotice(before, left);
        before = left;
        if (clock) clock.textContent = formatPixClock(left);
        if (notice) announce(notice);
        if (!left) expirePix();
      };
      tick();
      // Its time had already run out (2026-10-08, review: "Continuar com este Pix" pressed after the code's hour passed on the
      // choice screen): expirePix has drawn the expired screen, which needs no clock and no checks. Started anyway, the clock
      // drew that screen again every second, taking the focus back and keeping the message on.
      if (order.phase !== 'pix') return;
      clockTimer = setInterval(tick, 1000);
    }
    pollTimer = setInterval(async () => { try { const {status, data} = await paymentState(order.mpId); if (status === 200) applyState(data.state, data.reason); } catch {} }, 5000);
  }
}

function render(focus = true) {
  const previousStage = document.body.dataset.stage;
  clearInterval(timer); timer = null; disposeLive();
  document.body.dataset.stage = stage;
  // Keep the same step navigation while replacing the cart or delivery content.
  const steps = document.querySelector('.shop-steps');
  main.before(steps);
  document.querySelectorAll('[data-step]').forEach(el=>{const active = el.dataset.step === (stage==='confirmation'?'payment':stage);if(active)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});
  // the free-shipping bar rises from where it was when a quantity goes up
  const barBefore = stage === 'cart' ? barRatio(main) : null;
  main.innerHTML = stage === 'cart' ? renderCart(cart, cartOptions()) : stage === 'identification' ? identificationView() : stage === 'delivery' ? deliveryView() : stage === 'payment' ? paymentView() : confirmationView();
  main.querySelector('#cart-steps-slot')?.append(steps);
  if (barBefore !== null) riseBar(main, barBefore);
  if (stage === 'cart') { updateRecArrows(main); watchSummary(main); }
  if (stage === 'identification') wireIdentification(main.querySelector('#identification-form'));
  ensureShipping();
  if (stage === 'delivery') setTimeout(autofillKnownCep, 0);
  if (previousStage && previousStage !== stage && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    main.getAnimations().forEach(animation => animation.cancel());
    main.animate([{opacity:0,translate:'0 6px'},{opacity:1,translate:'0 0'}], {duration:220,easing:'ease-out'});
  }
  const summaryPanel=main.querySelector('.order-summary');
  if(summaryPanel&&stage!=='cart'){
    summaryPanel.id='order-summary';
    const items=['identification','delivery'].includes(stage)?purchaseItems():order.items;
    const quick=document.createElement('a');quick.className='mobile-order-bar';quick.href='#order-summary';
    quick.innerHTML=mobileBar(items);
    main.querySelector('.shop-heading').after(quick);
  }
  document.title = `${stage==='cart'?'Seu carrinho':stage==='confirmation'?(order?.live?'Pedido confirmado':'Pedido confirmado · demonstração'):'Finalizar pedido'} · Ju imprime pra mim`;
  if (focus) {main.querySelector('h1').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
  if(stage==='payment'&&order?.live)afterLiveRender();
  if(stage==='payment' && !order.live && order.method==='pix' && paymentStatus(order)!=='expired') {
    const tick=()=>{if(paymentStatus(order)==='expired'){render(false);announce('O Pix de demonstração expirou. Gere um novo código para continuar.');return;}const seconds=Math.max(0,Math.ceil((order.expiresAt-Date.now())/1000));const clock=document.querySelector('#pix-time');if(clock)clock.textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;};
    tick();timer=setInterval(tick,1000);
  }
}
// Identification needs an account: without one, the account page opens and brings the buyer back to this step.
const signInPage = () => `conta?next=${direct ? 'comprar-agora' : 'checkout'}`;
async function toIdentification() {
  if (!getSession()) { location.assign(signInPage()); return; }
  try { profile = await loadProfile(); }
  catch (error) { if (error.code === 'unauthorized') { location.assign(signInPage()); return; } announce(error.message); return; }
  stage = 'identification'; render();
}
function persist(next) {
  if(direct){cart=normalizeCart(next);sessionStorage.setItem(DIRECT_KEY,JSON.stringify(cart));}
  else cart=writeCart(next);
  window.dispatchEvent(new Event('ju:cart'));
}
main.addEventListener('submit', async e => {
  if (e.target.id !== 'identification-form') return;
  e.preventDefault(); if (busy) return;
  const form = e.target, {data, error} = readIdentification(form);
  if (error) { showIdentificationError(form, error); return; }
  const button = form.querySelector('.id-submit'); busy = true; button.disabled = true;
  try {
    profile = await saveProfile(data);
    draft = {...draft, name: `${data.firstName} ${data.lastName}`, email: getSession()?.email || draft.email, phone: data.phone};
    busy = false; stage = 'delivery'; render();
  } catch (problem) {
    busy = false; button.disabled = false;
    if (problem.code === 'unauthorized') { location.assign(signInPage()); return; }
    showIdentificationError(form, {field: problem.field, message: problem.message});
  }
});
main.addEventListener('submit', async e=>{if(e.target.id!=='delivery-form')return;e.preventDefault();if(busy)return;const form=e.target;if(!form.reportValidity())return;draft=Object.fromEntries(new FormData(form));if(!draft.name.trim()||!draft.street.trim()||!draft.city.trim()||!draft.number.trim()||!draft.district.trim()){announce('Preencha os dados de entrega, sem deixar campos em branco.');return;}method=draft.payment||method;if(real&&(ship.status!=='ready'||!ship.chosen||ship.cep!==String(draft.cep).replace(/\D/g,''))){announce(shippingGuard());form.querySelector('[name=cep]')?.focus();return;}// the payment settings never came (a slow server): asked once more here, with the button saying so; never the demo instead
  if(live.mode==='unreachable'){const release=holdButton(form.querySelector('[type=submit]'),'Carregando o pagamento…');busy=true;live=await loadPaymentConfigPatiently();busy=false;release();paintBanner();if(live.mode==='unreachable'){announce('Não conseguimos carregar o pagamento. Verifique sua conexão e tente de novo.');return;}}
  if(live.mode!=='off'&&recallPendingPix(tabStore())&&await resumePendingPix())return;   // a Pix of this tab may still be paid: that choice first
  try{order=live.mode!=='off'?createLiveOrder(purchaseItems()):{...createDemoOrder(purchaseItems(),method,Date.now(),shippingCents()??undefined),shipping:real?ship.chosen:null};stage='payment';render();}catch(error){announce(error.message);}});
main.addEventListener('change',e=>{
  if(e.target.name==='payment')method=e.target.value;
});
main.addEventListener('input',e=>{
  if(e.target.name==='phone'){
    const digits=e.target.value.replace(/\D/g,'');
    e.target.setCustomValidity(/^(?:55)?[1-9]\d{9,10}$/.test(digits)?'':'Informe um WhatsApp com DDD, por exemplo (11) 99999-9999.');
  }
});
main.addEventListener('keydown', e => {
  const option = e.target.closest?.('[data-action="pay-method"]');
  if (!option || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
  e.preventDefault();
  main.querySelector(`[data-method="${option.dataset.method === 'pix' ? 'card' : 'pix'}"]`)?.click();
});
main.addEventListener('click',async e=>{
  const button=e.target.closest('[data-action]');if(!button||busy||isHeld(button))return;   // a button waiting for an answer (holdButton) does not answer twice
  const action=button.dataset.action,id=button.dataset.id,item=cart.find(i=>i.id===id);
  try {
    if(action==='return'){e.preventDefault();returnFromCart();return;}   // back to the page the person came from (produtos.html without JS)
    if(['plus','minus','remove'].includes(action)&&item){const next=cart.map(i=>({...i}));if(action==='remove')persist(next.filter(i=>i.id!==id));else{next.find(i=>i.id===id).quantity=Math.max(1,Math.min(99,item.quantity+(action==='plus'?1:-1)));persist(next);}render(false);const target=[...main.querySelectorAll('[data-action]')].find(b=>b.dataset.id===id&&b.dataset.action===action&&!b.disabled);(target||main.querySelector('h1')).focus({preventScroll:true});announce(action==='remove'?'Peça removida do carrinho.':'Quantidade atualizada.');}
    if(action==='edit'&&item){sessionStorage.setItem(EDIT_KEY,JSON.stringify({id:item.id}));location.assign(`./#produto/${item.productId}`);}
    if(action==='checkout'&&purchaseItems().length){await toIdentification();}
    if(action==='cart'&&direct&&cart[0]){location.assign(`./#produto/${cart[0].productId}`);return;}
    if(action==='cart'){const form=document.querySelector('#delivery-form');if(form)draft=Object.fromEntries(new FormData(form));stage='cart';order=null;render();}
    if(action==='delivery'){if(order?.live&&['pix','expired'].includes(order.phase)&&await dropPix(button)!=='gone')return;if(stage!=='payment')return;stage='delivery';order=null;render();}
    if(action==='retry-brick'){render(false);}
    if(action==='pay-method'){switchMethod(button.dataset.method);}
    // "Gerar novo código Pix" and the Pix screen's "← Voltar": back to choosing how to pay, the waiting code cancelled first (dropPix)
    if(action==='new-pix'||action==='pix-back'){if(await dropPix(button)==='gone'&&stage==='payment'&&order?.live){order={...order,phase:'form',id:null,mpId:null,pix:null,status:'pending',attempt:null};render();if(action==='pix-back')announce('O código Pix anterior não vale mais. Escolha como prefere pagar.');}}
    // a Pix remembered from before (pending-pix.js): go on with it, or cancel it before starting again
    if(action==='resume-pix'){await continuePendingPix(button);}
    if(action==='drop-pending'){if(await dropPix(button)==='gone'){announce('O Pix anterior foi cancelado. Você pode recomeçar.');await restartCheckout();}}
    if(action==='copy-live-pix'){await copyLivePix(button);}
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
    if(action==='copy-order'){const text=`Pedido ${order.id}${order.live ? '' : ' — demonstração'}\n`+order.items.map(i=>`${i.quantity}x ${i.title}\n`+colorLines(i)).join('\n\n');try{await navigator.clipboard.writeText(text);announce('Resumo copiado.');}catch{announce('Não foi possível copiar automaticamente. As escolhas estão no resumo ao lado.');}}
  } catch(error){busy=false;button.disabled=false;announce(error.message);}
});
window.addEventListener('storage',e=>{if(e.key!==CART_KEY||direct)return;cart=readCart();if(stage==='cart')render(false);else if(stage==='delivery'||stage==='payment'){if(order?.live&&order.mpId&&['pix','resume'].includes(order.phase))cancelPayment(order.mpId).then(r=>{if(cancelOutcome(r)==='gone')forgetPendingPix();}).catch(()=>{});order=null;stage='cart';render();announce('O carrinho foi alterado em outra aba. Confira os itens antes de continuar.');}});
// Coming back from the account page (#identificacao) or starting a direct purchase: go straight to identification.
// A Pix this tab left waiting comes first (pending-pix.js): never a second payable code next to it.
if (await resumePendingPix()) {}
else if ((location.hash === '#identificacao' || stage === 'delivery') && purchaseItems().length) { history.replaceState(null, '', location.pathname + location.search); await toIdentification(); }
else render(false);
// Address by CEP: a complete CEP fills street, district, city and state. A field is only written when it is empty or still holds
// what the last lookup wrote (`data-autofill`), so nothing the buyer typed is ever overwritten. Any failure just leaves the form as it is.
const cepHint = () => main.querySelector('[data-hint]');
function showCepHint(message) { const hint = cepHint(); if (hint) hint.textContent = message; }
function autofillKnownCep() {
  const form = main.querySelector('#delivery-form'), cep = String(form?.elements.cep?.value ?? '').replace(/\D/g, '');
  if (form && isCep(cep) && cep !== cepDone && !form.elements.street.value && !form.elements.city.value) fillAddressFromCep(cep);
}
async function fillAddressFromCep(cep) {
  const token = ++cepToken, result = await lookupCep(cep);
  const form = main.querySelector('#delivery-form');
  if (token !== cepToken || !form || stage !== 'delivery') return;   // the CEP changed or the buyer left the step meanwhile
  showCepHint(cepMessage(result));
  if (!result.ok) return;
  cepDone = cep;
  for (const name of ['street', 'district', 'city', 'state']) {
    const input = form.elements[name], value = result.address[name] || '';
    if (!input || (input.value && input.value !== input.dataset.autofill)) continue;   // typed by the buyer: leave it
    input.value = value; input.dataset.autofill = input.value;   // a CEP without street or district clears what the previous CEP wrote; for the state list, what the browser really selected
  }
  const number = form.elements.number;
  if (result.address.street && number && !number.value && document.activeElement === form.elements.cep) number.focus();
}
main.addEventListener('input', e => {
  if (stage !== 'delivery' || e.target.name !== 'cep') return;
  const cep = e.target.value.replace(/\D/g, '');
  clearTimeout(cepTimer);
  if (!isCep(cep)) { cepToken++; cepDone = ''; showCepHint(''); return; }
  if (cep === cepDone) return;
  cepTimer = setTimeout(() => fillAddressFromCep(cep), 300);
});
// CEP boxes show 00000-000 while typing (the listeners below read the digits only).
main.addEventListener('input', e => {
  if (e.target.name !== 'cep' || e.inputType?.startsWith('delete')) return;
  const formatted = formatCep(e.target.value);
  if (formatted !== e.target.value) e.target.value = formatted;
});
// Shipping estimate in the cart: the CEP is kept for the delivery step, and the same quote is reused there.
main.addEventListener('submit', e => {
  if (e.target.id !== 'cart-ship-form') return;
  e.preventDefault();
  const cep = String(e.target.elements.cep.value).replace(/\D/g, '');
  if (!isCep(cep)) { ship = {cep, key: '', status: 'none', options: [], chosen: null, error: 'invalid_cep'}; paintShipping(); announce(shippingMessage('invalid_cep')); return; }
  draft = {...draft, cep: formatCep(cep)}; saveCep(cep);
  if (ship.cep === cep && ship.key === shipKey() && ship.status === 'ready') return;
  requestShipping(cep);
});
// Real shipping: typing a CEP quotes it (after a short pause); picking an option updates the summary.
main.addEventListener('input', e => {
  if (!real || stage !== 'delivery' || e.target.name !== 'cep') return;
  const cep = e.target.value.replace(/\D/g, '');
  if (cep === ship.cep) return;
  clearTimeout(shipTimer); shipToken++;
  if (!isCep(cep)) { ship = {cep, key: '', status: 'idle', options: [], chosen: null, error: null}; paintShipping(); return; }
  saveCep(cep);
  shipTimer = setTimeout(() => requestShipping(cep), 300);
});
main.addEventListener('change', e => {
  if (!real || e.target.name !== 'shipping-service') return;
  const option = ship.options.find(o => o.service === e.target.value);
  if (option) { ship = {...ship, chosen: option}; paintShipping(); }
});
wireRecArrows(main);
wireSummaryLink(main);
if (live.mode === 'test' || live.mode === 'live') loadPaymentMethods().then(methods => { if (!methods) return; payMethods = methods; const block = main.querySelector('[data-cart-pay]'); if (block) block.outerHTML = paymentBlock(methods); });
main.addEventListener('click', e => {
  if (!real || !e.target.closest('[data-action="retry-shipping"]')) return;
  const form = main.querySelector('#delivery-form'), cep = String(form?.elements.cep?.value ?? draft.cep ?? '').replace(/\D/g, '');
  if (isCep(cep)) requestShipping(cep);
});
