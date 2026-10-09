import {AUTH_MODE, auth, getSession, acceptSession, refreshSession, signOut, readDemoOrders, loadProfile, saveProfile, loadOrders, loadTracking, startDeletion, adoptDeletion, confirmDeletion, loadProviders, socialStartUrl, socialMessage} from './auth-service.js';
import {identificationForm, wireIdentification, readIdentification, showIdentificationError, missingIdentification} from './identification.js';
import {icon} from './icons.js';
import {mountLanguagePicker, getLanguage} from './i18n.js';
import {PRODUCTS, SOON, color, paint} from './products.js';
import {money} from './commerce-config.js';
import {createBusyDialog} from './loading-ui.js';
import {readCart} from './cart-store.js';
import {schemePicker, wireSchemePicker} from './scheme-picker.js';
const host = document.querySelector('#account-content'), feedback = document.querySelector('#account-feedback');
mountLanguagePicker(document.querySelector('.account-tools'));
const busyDialog = createBusyDialog();
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let screen = getSession() ? 'profile' : 'email', email = '', name = '', challenge = null, busy = false, countdown, notice = '', details = null, myOrders = [], deletion = null;
// After signing in from the checkout, go back there (conta.html?next=checkout or ?next=comprar-agora).
const nextPage = {checkout: 'checkout.html#identificacao', 'comprar-agora': 'comprar-agora.html#identificacao'}[new URLSearchParams(location.search).get('next')] || '';
const title = (kicker, heading, text) => `<p class="eyebrow">${kicker}</p><h2 id="account-title" tabindex="-1">${heading}</h2><p class="account-lead">${text}</p>`;
const input = (key, label, type = 'text', autocomplete = '', placeholder = '', optional = false) => `<div class="auth-field"><label for="auth-${key}">${label}</label><div class="auth-input">${icon(key === 'email' ? 'mail' : key === 'name' ? 'profile' : 'lock')}<input id="auth-${key}" name="${key}" type="${type}" autocomplete="${autocomplete}" placeholder="${placeholder}" value="${key === 'email' ? esc(email) : key === 'name' ? esc(name) : ''}" ${type === 'email' ? 'autocapitalize="none" spellcheck="false" inputmode="email" maxlength="180"' : type === 'password' ? 'data-secret minlength="8" maxlength="128"' : 'maxlength="100"'} aria-describedby="account-feedback" ${optional ? '' : 'required'}>${type === 'password' ? `<button class="password-toggle" type="button" aria-label="Mostrar senha" aria-controls="auth-${key}" aria-pressed="false">${icon('eye')}</button>` : ''}</div></div>`;
const submit = text => `<button class="primary account-submit" type="submit">${text}${icon('arrow')}</button>`;
const action = (text, target, style = 'back-auth') => `<button type="button" class="${style}" data-screen="${target}">${text}</button>`;
const stamp = () => `<div class="email-stamp"><span>${esc(email)}</span>${action('Alterar', 'email')}</div>`;
const previewNote = AUTH_MODE === 'demo' ? '<p class="auth-demo-note">Prévia: use dados fictícios. Quando o envio não estiver disponível, um código de teste aparece nesta página.</p>' : '';
const demoCode = () => screen === 'verify' ? challenge?.demoCode : screen === 'delete' ? deletion?.demoCode : '';
// "Continuar com o Google / com a Apple", under the e-mail form, only for the providers configured on the server. A full
// page round trip (also from the side panel, hence target="_top"); the server brings the person back to the checkout, to
// "Meus pedidos", or here (#bem-vindo for a new account). Buttons after the brands' guidelines: Google's "G" in its colours
// on white with a grey outline and Roboto Medium; Apple's logo and title in white on black; same size, same weight.
let providers = {google: false, apple: false};
const GOOGLE_LOGO = '<svg class="social-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
const APPLE_LOGO = '<svg class="social-logo" viewBox="0 0 814 1000" aria-hidden="true"><path fill="currentColor" d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/></svg>';
const socialNext = () => new URLSearchParams(location.search).get('next') || (location.hash.startsWith('#pedidos') ? 'pedidos' : '');
function socialBlock() {
  if (!providers.google && !providers.apple) return '';
  const button = (id, logo, label) => `<a class="social-button social-${id}" href="${esc(socialStartUrl(id, socialNext()))}" target="_top" data-social="${id}">${logo}<span>${label}</span></a>`;
  return `<div class="social-login"><p class="social-divider"><span>ou entre com</span></p><div class="social-buttons">${providers.google ? button('google', GOOGLE_LOGO, 'Continuar com o Google') : ''}${providers.apple ? button('apple', APPLE_LOGO, 'Continuar com a Apple') : ''}</div><p class="auth-terms social-terms">Ao continuar, você concorda com os Termos de Uso e declara ter lido a Política de Privacidade.</p><p class="auth-terms-links"><a href="termos.html" target="_blank" rel="noopener">Termos de Uso</a><a href="privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a></p></div>`;
}
// "Meus pedidos": the account's orders from the server; demonstration orders (payments off) from this tab.
// One card per order, in three parts: on top the number (its short form; the full code, the one in the e-mails, is under
// "Detalhes do pedido"), the date and a coloured badge for where it stands; then the pieces with their colours, the
// total and the invoice; at the bottom the four steps (payment, 3D production, shipping, delivered) and the buttons: the
// details, and the Correios timeline once it is posted. The delivery comes from the Correios by itself
// (api/_lib/tracking.js). With orders in more than one stage, pills filter them.
const CORREIOS = 'https://rastreamento.correios.com.br/app/index.php';
// The badge: words and tone (its colour) per stage; a posted order shows where the package stands.
const BADGE = {aguardando_pagamento: ['Aguardando pagamento', 'neutral'], pendente: ['Pagamento confirmado', 'wait'], confirmado: ['Em produção', 'making'], enviado: ['Em trânsito', 'transit'], concluido: ['Entregue', 'done'], recusado: ['Não pôde ser atendido', 'stop'], cancelado: ['Pagamento não concluído', 'neutral']};
const TRACK_STATE = {postado: ['Postado', 'transit'], em_transito: ['Em trânsito', 'transit'], saiu_para_entrega: ['Saiu para entrega', 'transit'], aguardando_retirada: ['Aguardando retirada', 'wait'], entregue: ['Entregue', 'done'], problema: ['Entrega não realizada', 'stop'], devolvido: ['Devolvido ao remetente', 'stop'], nao_encontrado: ['Postado', 'transit']};
const badgeOf = o => (o.status === 'enviado' && TRACK_STATE[o.tracking?.state]) || BADGE[o.status] || [o.status, 'neutral'];
// The pills: Em produção (paid, waiting for Ju or being made), Enviados, Concluídos; the rest only under Todos.
const GROUP = {pendente: 'producao', confirmado: 'producao', enviado: 'enviados', concluido: 'concluidos'};
const FILTERS = [['todos', 'Todos'], ['producao', 'Em produção'], ['enviados', 'Enviados'], ['concluidos', 'Concluídos']];
let orderFilter = 'todos';
// The steps: how many each stage has behind it; the next one is where the order is now.
const STEPS = ['Pagamento', 'Produção 3D', 'Envio', 'Entregue'];
const PROGRESS = {aguardando_pagamento: 0, pendente: 1, confirmado: 1, enviado: 3, concluido: 4};
const PAYMENT = {pix: 'Pix', card: 'Cartão de crédito', debit: 'Cartão de débito'};
const shortNumber = reference => `#${String(reference).replace(/^JU-/, '').slice(0, 6)}`;
const placeText = p => p ? [String(p.city || '').toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()), p.uf].filter(Boolean).join('/') : '';
// Dates in the language of the page ("05 out 2026", "05 Oct 2026"); the page draws them again when the language changes.
const when = iso => new Date(iso).toLocaleString(getLanguage(), {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'});
const dayText = iso => { const parts = new Intl.DateTimeFormat(getLanguage(), {day: '2-digit', month: 'short', year: 'numeric'}).formatToParts(new Date(iso)), part = type => parts.find(p => p.type === type)?.value || ''; return `${part('day')} ${part('month').replace('.', '')} ${part('year')}`; };
// The piece: its catalogue thumbnail, the quantity and, as dots, the colours chosen for each part (named in the details).
const partsOf = item => (PRODUCTS[item.productId]?.parts || []).filter(part => item.selection?.[part.id]);
const thumb = id => PRODUCTS[id] || SOON[id] ? `<img src="assets/card-preview-${esc(id)}.webp" alt="" width="56" height="56" loading="lazy" decoding="async">` : `<span class="order-thumb-empty">${icon('bag')}</span>`;
const swatches = item => partsOf(item).length ? `<span class="order-swatches" aria-hidden="true">${partsOf(item).map(part => { const c = color(item.selection[part.id]); return `<i style="--swatch:${esc(paint(c))}" title="${esc(c.name)}"></i>`; }).join('')}</span>` : '';
const itemRow = item => `<li><span class="order-thumb">${thumb(item.productId)}</span><span class="order-item-name"><strong>${Number(item.quantity) || 1}×</strong> <span translate="no">${esc(item.title)}</span></span>${swatches(item)}</li>`;
// The last thing the Correios said, on the card; every step in the timeline under "Rastrear pacote".
const lastEvent = o => { const last = o.tracking?.last; return last ? `<p class="order-last">${icon('truck')}<span><span translate="no">${esc(last.description)}</span>${last.place ? ` · <span translate="no">${esc(placeText(last.place))}</span>` : ''} · <time datetime="${esc(last.at)}">${esc(when(last.at))}</time></span></p>` : ''; };
const timelineView = tracking => tracking?.events?.length
  ? tracking.events.map(e => `<li class="is-${esc(e.state)}"><strong translate="no">${esc(e.description)}</strong>${e.detail ? `<span translate="no">${esc(e.detail)}</span>` : ''}<small>${e.place ? `<span translate="no">${esc(placeText(e.place))}</span> · ` : ''}<time datetime="${esc(e.at)}">${esc(when(e.at))}</time></small></li>`).join('')
  : '<li class="is-empty"><span>Os Correios ainda não registraram este pacote. Volte a olhar mais tarde.</span></li>';
function stepsBar(o) {
  if (!(o.status in PROGRESS)) return '';
  const done = PROGRESS[o.status];
  return `<ol class="order-steps" aria-label="Andamento do pedido" style="--fill:${Math.min(done, 3) / 3}">${STEPS.map((label, i) => `<li class="${i < done ? 'is-done' : i === done ? 'is-now' : ''}"${i === done ? ' aria-current="step"' : ''}><span>${label}</span></li>`).join('')}</ol>`;
}
const fact = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
function orderDetails(o) {
  const lines = o.items.map(item => `<li><span><strong>${Number(item.quantity) || 1}×</strong> <span translate="no">${esc(item.title)}</span></span><span>${money((item.unitCents || 0) * (Number(item.quantity) || 1))}</span>${partsOf(item).length ? `<small>${partsOf(item).map(part => `<span>${esc(part.name)}</span>: <span>${esc(color(item.selection[part.id]).name)}</span>`).join(' · ')}</small>` : ''}</li>`).join('');
  return `<dl class="order-facts">${fact('Código completo', `<span translate="no">${esc(o.reference)}</span>`)}${fact('Data da compra', esc(dayText(o.paidAt || o.createdAt)))}${PAYMENT[o.method] ? fact('Forma de pagamento', PAYMENT[o.method]) : ''}`
    + `${o.trackingCode ? fact('Código de rastreio', `<code translate="no">${esc(o.trackingCode)}</code> <a href="${CORREIOS}" target="_blank" rel="noopener">Rastrear nos Correios ↗</a>`) : ''}</dl>`
    + `<ul class="order-lines">${lines}</ul>`
    + `<dl class="order-totals">${fact('Subtotal', money(o.subtotalCents || 0))}${fact('Frete', o.shippingCents ? money(o.shippingCents) : 'Grátis')}${o.discountCents ? fact('Desconto no Pix', `− ${money(o.discountCents)}`) : ''}<div class="is-total"><dt>Total</dt><dd>${money(o.totalCents || 0)}</dd></div></dl>`;
}
const collapse = (id, inner) => `<div class="order-collapse" id="${id}" data-open="false"><div class="order-collapse-inner">${inner}</div></div>`;
function orderCard(o) {
  const ref = esc(o.reference), [label, tone] = badgeOf(o), hidden = orderFilter !== 'todos' && GROUP[o.status] !== orderFilter;
  return `<article class="order-card tone-${tone}" data-group="${GROUP[o.status] || 'outros'}" aria-labelledby="pedido-${ref}"${hidden ? ' hidden' : ''}>`
    + `<div class="order-card-top"><h3 id="pedido-${ref}"><span>Pedido</span> <span class="order-number" translate="no">${esc(shortNumber(o.reference))}</span></h3><time datetime="${esc(o.createdAt)}">${esc(dayText(o.createdAt))}</time><span class="order-badge">${esc(label)}</span></div>`
    + `<div class="order-card-body"><ul class="order-items">${o.items.map(itemRow).join('')}</ul>${lastEvent(o)}`
    + `<div class="order-sum"><span>Total</span><strong>${money(o.totalCents || 0)}</strong></div>`
    + `${o.test ? '<p class="order-flag">Pedido de teste · nenhum valor real</p>' : ''}${o.refunded ? '<p class="order-flag">Valor estornado</p>' : ''}`
    + `${o.invoice?.pdfUrl ? `<a class="order-invoice" href="${esc(o.invoice.pdfUrl)}" target="_blank" rel="noopener">${icon('document')}<span>Nota fiscal</span> <span translate="no">nº ${esc(o.invoice.number)}</span></a>` : ''}</div>`
    + `<div class="order-card-foot">${stepsBar(o)}<div class="order-actions"><button type="button" class="order-more-toggle" data-more="${ref}" aria-expanded="false" aria-controls="detalhes-${ref}"><span>Detalhes do pedido</span></button>`
    + `${o.trackingCode ? `<button type="button" class="order-track-toggle" data-track="${ref}" aria-expanded="false" aria-controls="rastreio-${ref}">${icon('truck')}<span>Rastrear pacote</span></button>` : ''}</div>`
    + collapse(`detalhes-${ref}`, orderDetails(o)) + (o.trackingCode ? collapse(`rastreio-${ref}`, `<ol class="order-timeline" id="timeline-${ref}"></ol>`) : '') + `</div></article>`;
}
const demoCard = o => `<article class="order-card tone-neutral" data-group="outros"><div class="order-card-top"><h3><span>Pedido</span> <span class="order-number" translate="no">#${esc(String(o.id).replace(/^DEMO-/, '').slice(0, 6))}</span></h3><span class="order-badge">Pagamento simulado · nenhuma cobrança</span></div><div class="order-card-body"><ul class="order-items">${o.items.map(itemRow).join('')}</ul><div class="order-sum"><span>Total</span><strong>${money(o.total || 0)}</strong></div></div></article>`;
function filterBar(list) {
  const count = key => key === 'todos' ? list.length : list.filter(o => GROUP[o.status] === key).length;
  const shown = FILTERS.filter(([key]) => key === 'todos' || count(key));
  return shown.length < 3 ? '' : `<div class="orders-filter" role="group" aria-label="Filtrar pedidos">${shown.map(([key, label]) => `<button type="button" data-filter="${key}" aria-pressed="${orderFilter === key}"><span>${label}</span> <span class="orders-filter-count">${count(key)}</span></button>`).join('')}</div>`;
}
const noOrders = `<div class="account-empty orders-empty"><span class="orders-empty-art" aria-hidden="true">${icon('bag')}<i>♡</i></span><h3>Você ainda não fez nenhum pedido.</h3><p>Que tal dar uma olhada nas nossas coleções?</p><a class="primary account-submit" href="produtos.html">Ver as coleções ${icon('arrow')}</a></div>`;
// A panel under a card (the details, or the timeline): opens and closes in place, with its button saying which.
function setOpen(button, open, [closed, opened]) {
  const panel = host.querySelector(`#${CSS.escape(button.getAttribute('aria-controls'))}`);
  if (!panel) return;
  panel.dataset.open = String(open); button.setAttribute('aria-expanded', String(open));
  button.querySelector('span').textContent = open ? opened : closed;
}
function showCode() {
  // Only when the e-mail service could not send the code; a real e-mailed code is never shown on the page.
  document.querySelector('#demo-inbox').innerHTML = demoCode() ? `<div class="demo-code">Código de teste · não enviado<strong>${esc(demoCode())}</strong></div>` : '';
}
// "Seu cantinho": quem está na conta (a foto do Google, ou a inicial num círculo no tom da Ju), quatro atalhos (pedidos, dados,
// carrinho e coleções; um embaixo do outro no celular), as preferências, com a Aparência (claro, escuro ou a do aparelho), e o sair.
const tile = (tag, attrs, glyph, label, note) => `<${tag} class="profile-tile" ${attrs}><span class="profile-tile-icon">${icon(glyph)}</span><span class="profile-tile-text"><strong>${label}</strong><small>${note}</small></span>${icon('chevron')}</${tag}>`;
function profileView(session) {
  const pieces = readCart().reduce((sum, item) => sum + item.quantity, 0), initial = esc((session.name.trim()[0] || '♡').toUpperCase());
  return `<div class="profile-summary"><span class="profile-portrait">${session.avatar ? `<img class="profile-avatar" src="${esc(session.avatar)}" alt="" width="64" height="64" referrerpolicy="no-referrer">` : `<span class="profile-initial" aria-hidden="true">${initial}</span>`}</span>`
    + `<div class="profile-who"><strong>${esc(session.name)}</strong><p>${esc(session.email)}</p><span class="profile-verified">${icon('check')} E-mail confirmado</span></div></div>`
    + `<nav class="profile-hub" aria-label="Sua conta">${tile('button', 'type="button" data-screen="orders"', 'bag', 'Meus pedidos', 'Produção, envio e entrega')}${tile('button', 'type="button" data-screen="details"', 'profile', 'Meus dados', 'Nota fiscal e entrega')}`
    + `${tile('a', 'href="checkout.html"', 'cart', 'Carrinho', pieces ? `${pieces} ${pieces === 1 ? 'peça' : 'peças'} no carrinho` : 'Vazio por enquanto')}${tile('a', 'href="produtos.html"', 'cube', 'Coleções', 'Peças em 3D para a consulta')}</nav>`
    + `<section class="profile-prefs" aria-labelledby="profile-prefs-title"><h3 id="profile-prefs-title">Preferências</h3>${schemePicker({hint: 'Automático acompanha o tema do seu aparelho.'})}`
    + `<p class="profile-pref">${icon('mail')}<span>Novidades por e-mail: ${session.marketingOptIn ? 'você escolheu receber' : 'não autorizadas'}.</span></p><p class="profile-pref">${icon('truck')}<span>O endereço é informado na etapa de entrega.</span></p></section>`
    + `<button class="profile-signout" id="signout" type="button">${icon('exit')}<span>Sair da conta</span></button>`;
}
wireSchemePicker(host);
function render(focus = true) {
  const previousScreen = host.dataset.screen;
  clearInterval(countdown); feedback.textContent = notice; notice = ''; host.dataset.screen = screen;
  document.querySelector('.preview-details').hidden = AUTH_MODE !== 'demo';
  document.querySelector('#scene-greeting').hidden = true;
  const session = getSession();
  if (['profile', 'orders', 'details', 'delete', 'welcome'].includes(screen) && !session) screen = 'email';
  document.title = (screen === 'orders' ? 'Meus pedidos' : 'Seu cantinho') + ' · Ju imprime pra mim';
  if (screen === 'email') host.innerHTML = title('UM CANTINHO SÓ SEU', 'Tudo começa<br>com seu e-mail.', 'Entre ou crie sua conta para acompanhar cada detalhe das suas escolhas.') + `<form id="email-form">${input('email', 'Seu e-mail', 'email', 'email', 'voce@exemplo.com')}${submit('Continuar')}</form>${socialBlock()}<div class="auth-reassurance">${icon('lock')}<div><strong>Seu e-mail, com cuidado.</strong><p>Para acessar seu perfil e acompanhar pedidos. Novidades e ofertas, só se você escolher.</p></div></div>` + previewNote;
  if (screen === 'verify') {
    host.innerHTML = title('SÓ MAIS UM PASSINHO', 'Seu acesso,<br>com cuidado.', challenge?.demoCode ? 'Digite o código de teste abaixo para experimentar a confirmação do e-mail.' : 'Enviamos um código de seis números para o seu e-mail. Toque no botão da mensagem ou digite o código abaixo.') + stamp() + `<form id="verify-form"><label class="auth-field code-input" for="auth-code"><span>Código de 6 números</span><input id="auth-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" placeholder="000000" aria-describedby="code-help account-feedback" required></label><p class="password-help" id="code-help">O código vale por 10 minutos.</p>${submit('Confirmar e continuar')}</form><div class="resend-row"><span>Precisa de outro código?</span><button id="resend-code" type="button">Reenviar código</button></div>` + (challenge?.purpose === 'reset' ? action('Voltar ao acesso', 'password') : action('Usar minha senha', 'password', 'auth-alternative'));
    const tick = () => { const b = host.querySelector('#resend-code'); if (!b) return; const seconds = Math.max(0, Math.ceil((challenge.resendAt - Date.now()) / 1000)); b.disabled = busy || seconds > 0; b.textContent = seconds ? `Reenviar em ${seconds}s` : 'Reenviar código'; };
    tick(); countdown = setInterval(tick, 1000);
  }
  if (screen === 'password') host.innerHTML = title('BEM-VINDA DE VOLTA', 'Que bom ter<br>você por aqui.', 'Use a senha que criou no seu primeiro cadastro.') + stamp() + `<form id="password-form">${input('password', 'Sua senha', 'password', 'current-password', 'Digite sua senha')}<div class="auth-links"><button type="button" id="forgot-password">Esqueci minha senha</button></div>${submit('Entrar')}</form>` + action('Usar código de acesso', 'verify', 'auth-alternative') + previewNote;
  if (screen === 'signup') host.innerHTML = title('E-MAIL CONFIRMADO', 'Vamos nos<br>conhecer?', 'Só mais dois detalhes para criar seu cantinho.') + stamp() + `<form id="signup-form">${input('name', 'Como podemos chamar você?', 'text', 'name', 'Seu nome')}${input('password', 'Crie uma senha (opcional)', 'password', 'new-password', 'Pelo menos 8 caracteres', true)}<p class="auth-hint">Sem senha, você entra sempre com um código enviado para o seu e-mail.</p><label class="auth-optin"><input type="checkbox" name="marketing"><span>Quero receber novidades e ofertas da Ju por e-mail. <small>Opcional. Você pode mudar de ideia.</small></span></label><p class="auth-terms">Ao criar sua conta, você concorda com os Termos de Uso e declara ter lido a Política de Privacidade.</p><p class="auth-terms-links"><a href="termos.html" target="_blank" rel="noopener">Termos de Uso</a><a href="privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a></p>${submit('Criar minha conta')}</form>` + previewNote;
  if (screen === 'reset') host.innerHTML = title('CÓDIGO CONFIRMADO', 'Um novo começo.', 'Escolha uma nova senha para acessar seu cantinho.') + `<form id="reset-form">${input('password', 'Nova senha', 'password', 'new-password', 'Pelo menos 8 caracteres')}${submit('Salvar nova senha')}</form>` + previewNote;
  if (screen === 'profile') host.innerHTML = title('SEU CANTINHO', `Olá, ${esc(session.name.split(/\s+/)[0])}.`, 'Suas escolhas e seus próximos encantos, bem pertinho.') + profileView(session);
  // After a first "Continuar com o Google / com a Apple": the account exists already; only what the shop still needs to sell
  // (usually CPF and phone, for the invoice and the order messages) is asked, and it can wait ("Agora não").
  if (screen === 'welcome') {
    const missing = missingIdentification(details);
    host.innerHTML = title('BOAS-VINDAS', 'Que bom ter<br>você por aqui.', missing.length ? 'Sua conta está pronta. Para comprar sem pausas, faltam só estes dados para a nota fiscal e os avisos do pedido:' : 'Sua conta está pronta, com tudo o que precisamos para as suas compras.')
      + (missing.length ? identificationForm({profile: details, submitLabel: 'Salvar e continuar', formId: 'welcome-form', only: missing}) : '')
      + action(missing.length ? 'Agora não' : 'Ir para minha conta', 'profile');
    if (missing.length) wireIdentification(host.querySelector('#welcome-form'));
  }
  if (screen === 'details') {
    host.innerHTML = title('SEUS DADOS', 'Meus dados.', 'Usados na nota fiscal e na entrega. Altere quando quiser.') + identificationForm({email: session.email, profile: details, submitLabel: 'Salvar meus dados', formId: 'details-form'}) + action('Voltar à minha conta', 'profile') + `<div class="account-danger"><h3>Excluir minha conta</h3><p>Apaga seus dados de cadastro. Pede a confirmação de um código enviado ao seu e-mail.</p>${action('Excluir minha conta', 'delete', 'danger-link')}</div>`;
    wireIdentification(host.querySelector('#details-form'));
  }
  if (screen === 'orders') {
    if (orderFilter !== 'todos' && !myOrders.some(o => GROUP[o.status] === orderFilter)) orderFilter = 'todos';
    const cards = myOrders.map(orderCard).join('') + readDemoOrders().map(demoCard).join('');
    host.innerHTML = title('CADA ESCOLHA CONTA', 'Meus pedidos.', 'Acompanhe a produção e a entrega dos seus pedidos.') + (cards ? `${filterBar(myOrders)}<div class="orders-list">${cards}</div>` : noOrders) + action('Voltar à minha conta', 'profile');
  }
  if (screen === 'delete') host.innerHTML = title('EXCLUIR CONTA', 'Excluir minha<br>conta.', deletion ? 'Enviamos um código de seis números para o seu e-mail. Digite o código para confirmar.' : 'Esta ação não pode ser desfeita.') + (deletion
    ? `<form id="delete-form"><label class="auth-field code-input" for="delete-code"><span>Código de 6 números</span><input id="delete-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" placeholder="000000" required></label><p class="password-help">O código vale por 10 minutos.</p><button class="primary account-submit danger" type="submit">Excluir minha conta definitivamente</button></form>`
    : `<ul class="delete-facts"><li>Seus dados de cadastro (nome, CPF, telefone e senha) são apagados.</li><li>Os pedidos já feitos ficam guardados pelo prazo exigido para a nota fiscal, sem ligação com a conta.</li><li>Você sai da conta em todos os aparelhos.</li></ul><button class="primary account-submit danger" type="button" id="delete-start">Enviar código de confirmação</button>`) + action('Cancelar', 'profile');
  if (screen === 'profile') host.querySelector('#account-title')?.setAttribute('translate', 'no');
  showCode();
  if (previousScreen && previousScreen !== screen && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    host.getAnimations().forEach(animation => animation.cancel());
    host.animate([{opacity:0,translate:'0 5px'},{opacity:1,translate:'0 0'}], {duration:200,easing:'ease-out'});
  }
  if (focus) host.querySelector('h2')?.focus({preventScroll:true});
}
async function run(message, operation) {
  if (busy) return;
  busy = true; host.inert = true; host.setAttribute('aria-busy', 'true'); feedback.textContent = '';
  busyDialog.start(message);
  try {
    await operation(); render();
  } catch (error) { feedback.textContent = error.message || 'Não foi possível continuar. Tente novamente.'; host.querySelector('input[name="code"]')?.setAttribute('aria-invalid', 'true'); }
  finally { busy = false; host.inert = false; host.removeAttribute('aria-busy'); busyDialog.close(); if (!feedback.textContent) host.querySelector('h2')?.focus({preventScroll:true}); }
}
async function finishSession(user, created = false) {
  busyDialog.update(created ? 'Preparando seu cantinho…' : 'Conferindo seu acesso…');
  await acceptSession(user);
  await busyDialog.success(AUTH_MODE === 'demo' ? created ? 'Conta de teste criada!' : 'Acesso de teste confirmado!' : created ? 'Conta criada!' : 'Acesso confirmado!');
  if (nextPage) { location.assign(nextPage); return; }
  if (location.hash === '#pedidos') { myOrders = await loadOrders().catch(() => []); screen = 'orders'; } else screen = 'profile';
}
host.addEventListener('click', async event => {
  const going = event.target.closest('.social-button');
  if (going) { if (going.classList.contains('is-going')) event.preventDefault(); else { going.classList.add('is-going'); going.setAttribute('aria-busy', 'true'); } return; }
  const toggle = event.target.closest('.password-toggle');
  if (toggle) { const field = toggle.previousElementSibling, show = field.type === 'password'; field.type = show ? 'text' : 'password'; toggle.setAttribute('aria-pressed', String(show)); toggle.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha'); return; }
  if (busy) return;
  const nav = event.target.closest('button[data-screen]');
  if (nav && nav.dataset.screen === 'orders') { openOrders(); return; }
  if (nav && nav.dataset.screen === 'delete') deletion = null;
  if (nav && nav.dataset.screen === 'details') { run('Buscando seus dados…', async () => { details = await loadProfile(); screen = 'details'; }); return; }
  if (nav) { if (nav.dataset.screen === 'email') {auth.cancel(); challenge = null;} screen = nav.dataset.screen; if (screen === 'verify' && !challenge) screen = 'email'; render(); return; }
  if (event.target.closest('#signout')) { await signOut(); auth.cancel(); challenge = null; screen = 'email'; render(); }
  if (event.target.closest('#resend-code')) run('Enviando outro código…', async () => {challenge = await auth.resend(); notice = challenge.demoCode ? 'Novo código de teste gerado.' : 'Enviamos um novo código para o seu e-mail.';});
  if (event.target.closest('#delete-start')) run('Enviando o código…', async () => {deletion = await startDeletion(); notice = deletion.demoCode ? 'Código de teste gerado.' : 'Enviamos o código para o seu e-mail.';});
  const pill = event.target.closest('[data-filter]');
  if (pill) {
    orderFilter = pill.dataset.filter;
    host.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button === pill)));
    host.querySelectorAll('.order-card').forEach(card => { card.hidden = orderFilter !== 'todos' && card.dataset.group !== orderFilter; });
    return;
  }
  const more = event.target.closest('[data-more]');
  if (more) { setOpen(more, more.getAttribute('aria-expanded') !== 'true', ['Detalhes do pedido', 'Ocultar detalhes']); return; }
  // "Rastrear pacote": the Correios timeline, asked for the first time it opens (api/account/tracking).
  const track = event.target.closest('[data-track]');
  if (track) {
    const list = host.querySelector(`#${CSS.escape(`timeline-${track.dataset.track}`)}`), open = track.getAttribute('aria-expanded') === 'true', words = ['Rastrear pacote', 'Ocultar rastreio'];
    if (!list) return;
    if (open || list.dataset.loaded) { setOpen(track, !open, words); return; }
    track.disabled = true; track.querySelector('span').textContent = 'Carregando…';
    try { list.innerHTML = timelineView(await loadTracking(track.dataset.track)); list.dataset.loaded = '1'; }
    catch { list.innerHTML = '<li class="is-empty"><span>Não foi possível carregar o rastreio agora. Tente de novo em instantes.</span></li>'; }
    finally { track.disabled = false; }
    setOpen(track, true, words);
    return;
  }
  if (event.target.closest('#forgot-password')) run('Preparando a recuperação de acesso…', async () => {challenge = await auth.forgot({email}); screen = 'verify';});
});
window.addEventListener('ju:language', () => { if (screen === 'orders' && !busy) render(false); });
host.addEventListener('input', event => {
  event.target.removeAttribute('aria-invalid'); feedback.textContent = '';
  if (event.target.name === 'email') email = event.target.value;
  if (event.target.name === 'name') name = event.target.value;
  if (event.target.name === 'code') event.target.value = event.target.value.replace(/\D/g, '').slice(0, 6);
});
host.addEventListener('submit', event => {
  event.preventDefault(); const form = event.target;
  if (form.id === 'details-form' || form.id === 'welcome-form') { saveDetails(form); return; }
  if (form.id === 'delete-form') { if (!busy && form.reportValidity()) deleteAccount(form); return; }
  if (busy || !form.reportValidity()) return;
  const values = Object.fromEntries(new FormData(form));
  const messages = {'email-form':'Preparando seu acesso…', 'verify-form':'Conferindo seu código…', 'signup-form':'Criando sua conta…', 'password-form':'Conferindo seu acesso…', 'reset-form':'Atualizando sua senha…'};
  run(messages[form.id], async () => {
    if (form.id === 'email-form') {challenge = await auth.begin(values); email = challenge.email; screen = 'verify';}
    if (form.id === 'verify-form') {const result = await auth.verify(values); if (result.user) await finishSession(result.user); else if (result.registrationAllowed) {busyDialog.update('E-mail confirmado.'); screen = 'signup';} else screen = 'reset';}
    if (form.id === 'signup-form') await finishSession(await auth.completeRegistration({...values, marketingOptIn:values.marketing === 'on'}), true);
    if (form.id === 'password-form') {const user = await auth.login({email, password:values.password}); auth.cancel(); await finishSession(user);}
    if (form.id === 'reset-form') {await acceptSession(await auth.reset(values)); await busyDialog.success('Senha atualizada!'); challenge = null; if (nextPage) { location.assign(nextPage); return; } screen = 'profile';}
    form.reset();
  });
});
// "Meus dados": the same identification form as the checkout. A refused field is pointed out instead of the page message.
async function saveDetails(form) {
  if (busy) return;
  const {data, error} = readIdentification(form);
  if (error) { showIdentificationError(form, error); return; }
  busy = true; busyDialog.start('Salvando seus dados…');
  try { details = await saveProfile(data); await busyDialog.success('Dados salvos!'); screen = 'profile'; render(); }
  catch (problem) { busyDialog.close(); if (problem.code === 'unauthorized') { screen = 'email'; render(); feedback.textContent = problem.message; } else showIdentificationError(form, {field: problem.field, message: problem.message}); }
  finally { busy = false; busyDialog.close(); }
}
// Deleting is final: the code is checked by the server, the session ends and the page goes back to the start.
function deleteAccount(form) {
  const {code} = Object.fromEntries(new FormData(form));
  run('Excluindo sua conta…', async () => { await confirmDeletion({code}); deletion = null; challenge = null; details = null; myOrders = []; await busyDialog.success('Conta excluída.'); screen = 'email'; notice = 'Sua conta foi excluída. Obrigada por ter passado por aqui.'; });
}
function openOrders() {
  return run('Buscando seus pedidos…', async () => {
    try { myOrders = await loadOrders(); screen = 'orders'; }
    catch (error) { screen = error.code === 'unauthorized' ? 'email' : 'profile'; render(false); throw error; }
  });
}
async function resumeFromLink(token, code) {
  history.replaceState(null, '', location.pathname + location.search + '#verificar');
  try {
    challenge = auth.adopt(token); email = challenge.email; screen = 'verify'; render(false);
    const field = host.querySelector('[name="code"]');
    if (!/^\d{6}$/.test(code)) { field?.focus(); return; }
    field.value = code;
    await new Promise(resolve => setTimeout(resolve, matchMedia('(prefers-reduced-motion: reduce)').matches ? 100 : 450));
    host.querySelector('#verify-form')?.requestSubmit();
  } catch (error) {
    screen = 'email'; render(false); feedback.textContent = error.message || 'Este link não é mais válido. Solicite um novo código.';
  }
}
function route(focus = false) {
  if (busy) return;
  const [routeName, query = ''] = location.hash.slice(1).split('?');
  if (routeName === 'verificar') {
    const params = new URLSearchParams(query);
    if (params.get('c')) { resumeFromLink(params.get('c'), params.get('k') || ''); return; }
    screen = challenge ? 'verify' : getSession() ? 'profile' : 'email';
  } else if (routeName === 'pedidos' && getSession()) { openOrders(); return; }
  // Back from "Continuar com o Google / com a Apple": a new account is welcomed; a problem is explained on the e-mail form.
  else if (routeName === 'bem-vindo' && getSession()) {
    history.replaceState(null, '', location.pathname + location.search);
    run('Preparando seu cantinho…', async () => { details = await loadProfile(); screen = 'welcome'; });
    return;
  } else if (routeName === 'entrar') {
    const code = new URLSearchParams(query).get('erro');
    history.replaceState(null, '', location.pathname + location.search);
    screen = getSession() ? 'profile' : 'email'; render(focus);
    if (code) feedback.textContent = socialMessage(code);
    return;
  }
  else if (routeName === 'excluir') {
    // The link in the deletion e-mail fills in the code; the deletion itself still waits for the button.
    const params = new URLSearchParams(query);
    history.replaceState(null, '', location.pathname + location.search);
    if (!getSession()) { screen = 'email'; render(focus); feedback.textContent = 'Entre na sua conta para confirmar a exclusão.'; return; }
    try { deletion = adoptDeletion(params.get('c') || ''); } catch (error) { deletion = null; notice = error.message; }
    screen = 'delete'; render(focus);
    const field = host.querySelector('[name="code"]'), code = params.get('k') || '';
    if (field && /^\d{6}$/.test(code)) field.value = code;
    return;
  } else screen = getSession() ? 'profile' : 'email';
  render(focus);
  if (routeName === 'verificar' && !challenge && !getSession()) feedback.textContent = 'Para verificar sua conta, informe seu e-mail e solicite um novo código.';
  if (routeName === 'verificar' && challenge) host.querySelector('[name="code"]')?.focus();
}
window.addEventListener('hashchange', () => route(true));
if (window.parent !== window && new URLSearchParams(location.search).get('panel') === '1') {
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !document.querySelector('dialog[open]')) parent.postMessage({type:'ju:account-close'}, location.origin);
  });
}
// The providers configured on the server (their buttons) and who is signed in, asked together.
[providers] = await Promise.all([loadProviders(), refreshSession()]);
// Back from a provider through the browser history (bfcache): the button that was opening it is a button again.
window.addEventListener('pageshow', event => { if (event.persisted) host.querySelectorAll('.social-button.is-going').forEach(link => { link.classList.remove('is-going'); link.removeAttribute('aria-busy'); }); });
route();
