import {AUTH_MODE, auth, getSession, acceptSession, refreshSession, signOut, readDemoOrders, loadProfile, saveProfile, loadOrders, startDeletion, adoptDeletion, confirmDeletion} from './auth-service.js';
import {identificationForm, wireIdentification, readIdentification, showIdentificationError} from './identification.js';
import {icon} from './icons.js';
import {mountLanguagePicker} from './i18n.js';
import {money} from './commerce-config.js';
import {createBusyDialog} from './loading-ui.js';
const host = document.querySelector('#account-content'), feedback = document.querySelector('#account-feedback');
mountLanguagePicker(document.querySelector('.account-tools'));
const busyDialog = createBusyDialog();
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let screen = getSession() ? 'profile' : 'email', email = '', name = '', challenge = null, busy = false, countdown, notice = '', details = null, myOrders = [], deletion = null;
// After signing in from the checkout, go back there (conta.html?next=checkout or ?next=comprar-agora).
const nextPage = {checkout: 'checkout.html#identificacao', 'comprar-agora': 'comprar-agora.html#identificacao'}[new URLSearchParams(location.search).get('next')] || '';
const title = (kicker, heading, text) => `<p class="eyebrow">${kicker}</p><h2 id="account-title" tabindex="-1">${heading}</h2><p class="account-lead">${text}</p>`;
const input = (key, label, type = 'text', autocomplete = '', placeholder = '') => `<div class="auth-field"><label for="auth-${key}">${label}</label><div class="auth-input">${icon(key === 'email' ? 'mail' : key === 'name' ? 'profile' : 'lock')}<input id="auth-${key}" name="${key}" type="${type}" autocomplete="${autocomplete}" placeholder="${placeholder}" value="${key === 'email' ? esc(email) : key === 'name' ? esc(name) : ''}" ${type === 'email' ? 'autocapitalize="none" spellcheck="false" inputmode="email" maxlength="180"' : type === 'password' ? 'data-secret minlength="8" maxlength="128"' : 'maxlength="100"'} aria-describedby="account-feedback" required>${type === 'password' ? `<button class="password-toggle" type="button" aria-label="Mostrar senha" aria-controls="auth-${key}" aria-pressed="false">${icon('eye')}</button>` : ''}</div></div>`;
const submit = text => `<button class="primary account-submit" type="submit">${text}${icon('arrow')}</button>`;
const action = (text, target, style = 'back-auth') => `<button type="button" class="${style}" data-screen="${target}">${text}</button>`;
const stamp = () => `<div class="email-stamp"><span>${esc(email)}</span>${action('Alterar', 'email')}</div>`;
const previewNote = AUTH_MODE === 'demo' ? '<p class="auth-demo-note">Prévia: use dados fictícios. Quando o envio não estiver disponível, um código de teste aparece nesta página.</p>' : '';
const demoCode = () => screen === 'verify' ? challenge?.demoCode : screen === 'delete' ? deletion?.demoCode : '';
// "Meus pedidos": the account's orders from the server; demonstration orders (payments off) from this tab.
const ORDER_STATUS = {aguardando_pagamento: 'Aguardando pagamento', pendente: 'Pagamento confirmado · em produção', concluido: 'Pedido concluído', recusado: 'Pedido não pôde ser atendido', cancelado: 'Pagamento não concluído'};
const orderDate = iso => new Date(iso).toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit', year: 'numeric'});
const orderCard = o => `<article class="order-preview status-${esc(o.status)}"><h3>Pedido <span translate="no">${esc(o.reference)}</span></h3><small><span>${esc(ORDER_STATUS[o.status] || o.status)}</span> · <time datetime="${esc(o.createdAt)}">${esc(orderDate(o.createdAt))}</time></small>${o.test ? '<small class="order-test">Pedido de teste · nenhum valor real</small>' : ''}<p>${o.items.map(i => `${Number(i.quantity) || 1} × ${esc(i.title)}`).join('<br>')}</p><strong>${money(o.totalCents || 0)}</strong></article>`;
const demoCard = o => `<article class="order-preview"><h3>Pedido <span translate="no">${esc(o.id)}</span></h3><small>Pagamento simulado · nenhuma cobrança</small><p>${o.items.map(i => `${Number(i.quantity) || 1} × ${esc(i.title)}`).join('<br>')}</p><strong>${money(o.total || 0)}</strong></article>`;
function showCode() {
  // Only when the e-mail service could not send the code; a real e-mailed code is never shown on the page.
  document.querySelector('#demo-inbox').innerHTML = demoCode() ? `<div class="demo-code">Código de teste · não enviado<strong>${esc(demoCode())}</strong></div>` : '';
}
function render(focus = true) {
  const previousScreen = host.dataset.screen;
  clearInterval(countdown); feedback.textContent = notice; notice = ''; host.dataset.screen = screen;
  document.querySelector('.preview-details').hidden = AUTH_MODE !== 'demo';
  document.querySelector('#scene-greeting').hidden = true;
  const session = getSession();
  if (['profile', 'orders', 'details', 'delete'].includes(screen) && !session) screen = 'email';
  document.title = (screen === 'orders' ? 'Meus pedidos' : 'Seu cantinho') + ' · Ju imprime pra mim';
  if (screen === 'email') host.innerHTML = title('UM CANTINHO SÓ SEU', 'Tudo começa<br>com seu e-mail.', 'Entre ou crie sua conta para acompanhar cada detalhe das suas escolhas.') + `<form id="email-form">${input('email', 'Seu e-mail', 'email', 'email', 'voce@exemplo.com')}${submit('Continuar')}</form><div class="auth-reassurance">${icon('lock')}<div><strong>Seu e-mail, com cuidado.</strong><p>Para acessar seu perfil e acompanhar pedidos. Novidades e ofertas, só se você escolher.</p></div></div>` + previewNote;
  if (screen === 'verify') {
    host.innerHTML = title('SÓ MAIS UM PASSINHO', 'Seu acesso,<br>com cuidado.', challenge?.demoCode ? 'Digite o código de teste abaixo para experimentar a confirmação do e-mail.' : 'Enviamos um código de seis números para o seu e-mail. Toque no botão da mensagem ou digite o código abaixo.') + stamp() + `<form id="verify-form"><label class="auth-field code-input" for="auth-code"><span>Código de 6 números</span><input id="auth-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" placeholder="000000" aria-describedby="code-help account-feedback" required></label><p class="password-help" id="code-help">O código vale por 10 minutos.</p>${submit('Confirmar e continuar')}</form><div class="resend-row"><span>Precisa de outro código?</span><button id="resend-code" type="button">Reenviar código</button></div>` + (challenge?.purpose === 'reset' ? action('Voltar ao acesso', 'password') : action('Usar minha senha', 'password', 'auth-alternative'));
    const tick = () => { const b = host.querySelector('#resend-code'); if (!b) return; const seconds = Math.max(0, Math.ceil((challenge.resendAt - Date.now()) / 1000)); b.disabled = busy || seconds > 0; b.textContent = seconds ? `Reenviar em ${seconds}s` : 'Reenviar código'; };
    tick(); countdown = setInterval(tick, 1000);
  }
  if (screen === 'password') host.innerHTML = title('BEM-VINDA DE VOLTA', 'Que bom ter<br>você por aqui.', 'Use a senha que criou no seu primeiro cadastro.') + stamp() + `<form id="password-form">${input('password', 'Sua senha', 'password', 'current-password', 'Digite sua senha')}<div class="auth-links"><button type="button" id="forgot-password">Esqueci minha senha</button></div>${submit('Entrar')}</form>` + action('Usar código de acesso', 'verify', 'auth-alternative') + previewNote;
  if (screen === 'signup') host.innerHTML = title('E-MAIL CONFIRMADO', 'Vamos nos<br>conhecer?', 'Só mais dois detalhes para criar seu cantinho.') + stamp() + `<form id="signup-form">${input('name', 'Como podemos chamar você?', 'text', 'name', 'Seu nome')}${input('password', 'Crie sua senha', 'password', 'new-password', 'Pelo menos 8 caracteres')}<label class="auth-optin"><input type="checkbox" name="marketing"><span>Quero receber novidades e ofertas da Ju por e-mail. <small>Opcional. Você pode mudar de ideia.</small></span></label>${submit('Criar minha conta')}</form>` + previewNote;
  if (screen === 'reset') host.innerHTML = title('CÓDIGO CONFIRMADO', 'Um novo começo.', 'Escolha uma nova senha para acessar seu cantinho.') + `<form id="reset-form">${input('password', 'Nova senha', 'password', 'new-password', 'Pelo menos 8 caracteres')}${submit('Salvar nova senha')}</form>` + previewNote;
  if (screen === 'profile') host.innerHTML = title('SEU CANTINHO', `Olá, ${esc(session.name.split(/\s+/)[0])}.`, 'Suas escolhas e seus próximos encantos, bem pertinho.') + `<div class="profile-summary"><span>${icon('check')} E-mail confirmado</span><strong>${esc(session.name)}</strong><p>${esc(session.email)}</p><small>Novidades por e-mail: ${session.marketingOptIn ? 'você escolheu receber' : 'não autorizadas'}.</small><small>O endereço é informado na etapa de entrega.</small></div><a class="primary account-submit" href="produtos.html">Explorar os produtos ${icon('arrow')}</a><a class="auth-alternative" href="checkout.html">Voltar ao carrinho ${icon('cart')}</a>${action('Meus dados', 'details')}${action('Meus pedidos', 'orders')}<button class="back-auth signout" id="signout">Sair da conta</button>`;
  if (screen === 'details') {
    host.innerHTML = title('SEUS DADOS', 'Meus dados.', 'Usados na nota fiscal e na entrega. Altere quando quiser.') + identificationForm({email: session.email, profile: details, submitLabel: 'Salvar meus dados', formId: 'details-form'}) + action('Voltar à minha conta', 'profile') + `<div class="account-danger"><h3>Excluir minha conta</h3><p>Apaga seus dados de cadastro. Pede a confirmação de um código enviado ao seu e-mail.</p>${action('Excluir minha conta', 'delete', 'danger-link')}</div>`;
    wireIdentification(host.querySelector('#details-form'));
  }
  if (screen === 'orders') {
    const cards = myOrders.map(orderCard).join('') + readDemoOrders().map(demoCard).join('');
    host.innerHTML = title('CADA ESCOLHA CONTA', 'Meus pedidos.', 'Acompanhe o pagamento e a produção de cada pedido.') + (cards ? cards : `<div class="account-empty">${icon('bag')}<h3>Seu primeiro encanto<br>está por vir.</h3><a class="primary account-submit" href="produtos.html">Conhecer as peças ${icon('arrow')}</a></div>`) + action('Voltar à minha conta', 'profile');
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
  if (event.target.closest('#forgot-password')) run('Preparando a recuperação de acesso…', async () => {challenge = await auth.forgot({email}); screen = 'verify';});
});
host.addEventListener('input', event => {
  event.target.removeAttribute('aria-invalid'); feedback.textContent = '';
  if (event.target.name === 'email') email = event.target.value;
  if (event.target.name === 'name') name = event.target.value;
  if (event.target.name === 'code') event.target.value = event.target.value.replace(/\D/g, '').slice(0, 6);
});
host.addEventListener('submit', event => {
  event.preventDefault(); const form = event.target;
  if (form.id === 'details-form') { saveDetails(form); return; }
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
await refreshSession();
route();
