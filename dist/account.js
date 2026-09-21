import {AUTH_MODE, auth, getSession, acceptSession, signOut, readDemoOrders} from './auth-service.js';
import {icon} from './icons.js';
import './i18n.js';
import {money} from './commerce-config.js';
import {createBusyDialog} from './loading-ui.js';
const host = document.querySelector('#account-content'), feedback = document.querySelector('#account-feedback');
const busyDialog = createBusyDialog();
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let screen = getSession() ? 'profile' : 'email', email = '', name = '', challenge = null, busy = false, countdown;
const title = (kicker, heading, text) => `<p class="eyebrow">${kicker}</p><h2 id="account-title" tabindex="-1">${heading}</h2><p class="account-lead">${text}</p>`;
const input = (key, label, type = 'text', autocomplete = '', placeholder = '') => `<div class="auth-field"><label for="auth-${key}">${label}</label><div class="auth-input">${icon(key === 'email' ? 'mail' : key === 'name' ? 'profile' : 'lock')}<input id="auth-${key}" name="${key}" type="${type}" autocomplete="${autocomplete}" placeholder="${placeholder}" value="${key === 'email' ? esc(email) : key === 'name' ? esc(name) : ''}" ${type === 'email' ? 'autocapitalize="none" spellcheck="false" inputmode="email" maxlength="180"' : type === 'password' ? 'data-secret minlength="8" maxlength="128"' : 'maxlength="100"'} aria-describedby="account-feedback" required>${type === 'password' ? `<button class="password-toggle" type="button" aria-label="Mostrar senha" aria-controls="auth-${key}" aria-pressed="false">${icon('eye')}</button>` : ''}</div></div>`;
const submit = text => `<button class="primary account-submit" type="submit">${text}${icon('arrow')}</button>`;
const action = (text, target, style = 'back-auth') => `<button type="button" class="${style}" data-screen="${target}">${text}</button>`;
const stamp = () => `<div class="email-stamp"><span>${esc(email)}</span>${action('Alterar', 'email')}</div>`;
const previewNote = AUTH_MODE === 'demo' ? '<p class="auth-demo-note">Prévia: use dados fictícios. Nenhum e-mail é enviado.</p>' : '';
function showCode() {
  document.querySelector('#demo-inbox').innerHTML = challenge && screen === 'verify' && AUTH_MODE === 'demo' ? `<div class="demo-code">Código de teste · não enviado<strong>${esc(challenge.demoCode)}</strong></div>` : '';
}
function render(focus = true) {
  clearInterval(countdown); feedback.textContent = ''; host.dataset.screen = screen;
  document.querySelector('.preview-details').hidden = AUTH_MODE !== 'demo';
  document.querySelector('#scene-greeting').hidden = true;
  const session = getSession();
  if (['profile', 'orders'].includes(screen) && !session) screen = 'email';
  document.title = (screen === 'orders' ? 'Meus pedidos' : 'Seu cantinho') + ' · Ju imprime pra mim';
  if (screen === 'email') host.innerHTML = title('UM CANTINHO SÓ SEU', 'Tudo começa<br>com seu e-mail.', 'Entre ou crie sua conta para acompanhar cada detalhe das suas escolhas.') + `<form id="email-form">${input('email', 'Seu e-mail', 'email', 'email', 'voce@exemplo.com')}${submit('Continuar')}</form><div class="auth-reassurance">${icon('lock')}<div><strong>Seu e-mail, com cuidado.</strong><p>Para acessar seu perfil e acompanhar pedidos. Novidades e ofertas, só se você escolher.</p></div></div>` + previewNote;
  if (screen === 'verify') {
    host.innerHTML = title('SÓ MAIS UM PASSINHO', 'Seu acesso,<br>com cuidado.', AUTH_MODE === 'demo' ? 'Digite o código de teste abaixo para experimentar a confirmação do e-mail.' : 'Digite o código de seis números que enviamos para você.') + stamp() + `<form id="verify-form"><label class="auth-field code-input" for="auth-code"><span>Código de 6 números</span><input id="auth-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" placeholder="000000" aria-describedby="code-help account-feedback" required></label><p class="password-help" id="code-help">O código vale por 10 minutos.</p>${submit('Confirmar e continuar')}</form><div class="resend-row"><span>Precisa de outro código?</span><button id="resend-code" type="button">Reenviar código</button></div>` + (challenge?.purpose === 'reset' ? action('Voltar ao acesso', 'password') : action('Usar minha senha', 'password', 'auth-alternative'));
    const tick = () => { const b = host.querySelector('#resend-code'); if (!b) return; const seconds = Math.max(0, Math.ceil((challenge.resendAt - Date.now()) / 1000)); b.disabled = busy || seconds > 0; b.textContent = seconds ? `Reenviar em ${seconds}s` : 'Reenviar código'; };
    tick(); countdown = setInterval(tick, 1000);
  }
  if (screen === 'password') host.innerHTML = title('BEM-VINDA DE VOLTA', 'Que bom ter<br>você por aqui.', 'Use a senha que criou no seu primeiro cadastro.') + stamp() + `<form id="password-form">${input('password', 'Sua senha', 'password', 'current-password', 'Digite sua senha')}<div class="auth-links"><button type="button" id="forgot-password">Esqueci minha senha</button></div>${submit('Entrar')}</form>` + action('Usar código de acesso', 'verify', 'auth-alternative') + previewNote;
  if (screen === 'signup') host.innerHTML = title('E-MAIL CONFIRMADO', 'Vamos nos<br>conhecer?', 'Só mais dois detalhes para criar seu cantinho.') + stamp() + `<form id="signup-form">${input('name', 'Como podemos chamar você?', 'text', 'name', 'Seu nome')}${input('password', 'Crie sua senha', 'password', 'new-password', 'Pelo menos 8 caracteres')}<label class="auth-optin"><input type="checkbox" name="marketing"><span>Quero receber novidades e ofertas da Ju por e-mail. <small>Opcional. Você pode mudar de ideia.</small></span></label>${submit('Criar minha conta')}</form>` + previewNote;
  if (screen === 'reset') host.innerHTML = title('CÓDIGO CONFIRMADO', 'Um novo começo.', 'Escolha uma nova senha para acessar seu cantinho.') + `<form id="reset-form">${input('password', 'Nova senha', 'password', 'new-password', 'Pelo menos 8 caracteres')}${submit('Salvar nova senha')}</form>` + previewNote;
  if (screen === 'profile') host.innerHTML = title('SEU CANTINHO', `Olá, ${esc(session.name.split(/\s+/)[0])}.`, 'Suas escolhas e seus próximos encantos, bem pertinho.') + `<div class="profile-summary"><span>${icon('check')} E-mail confirmado na prévia</span><strong>${esc(session.name)}</strong><p>${esc(session.email)}</p><small>Novidades por e-mail: ${session.marketingOptIn ? 'você escolheu receber' : 'não autorizadas'}.</small><small>O endereço é informado na etapa de entrega.</small></div><a class="primary account-submit" href="produtos.html">Explorar os produtos ${icon('arrow')}</a><a class="auth-alternative" href="checkout.html">Voltar ao carrinho ${icon('cart')}</a>${action('Meus pedidos', 'orders')}<button class="back-auth signout" id="signout">Sair da conta</button>`;
  if (screen === 'orders') {
    const orders = readDemoOrders();
    host.innerHTML = title('CADA ESCOLHA CONTA', 'Meus pedidos.', 'Pedidos demonstrativos feitos nesta aba.') + (orders.length ? orders.map(o => `<article class="order-preview"><h3>Pedido ${esc(o.id)}</h3><small>Pagamento simulado · nenhuma cobrança</small><p>${o.items.map(i => `${Number(i.quantity)||1} × ${esc(i.title)}`).join('<br>')}</p><strong>${money(o.total || 0)}</strong></article>`).join('') : `<div class="account-empty">${icon('bag')}<h3>Seu primeiro encanto<br>está por vir.</h3><a class="primary account-submit" href="produtos.html">Conhecer as peças ${icon('arrow')}</a></div>`) + action('Voltar à minha conta', 'profile');
  }
  if (screen === 'profile') host.querySelector('#account-title')?.setAttribute('translate', 'no');
  showCode();
  if (focus) host.querySelector('h2')?.focus({preventScroll:true});
}
async function run(message, operation) {
  if (busy) return;
  busy = true; host.inert = true; host.setAttribute('aria-busy', 'true'); feedback.textContent = '';
  busyDialog.start(message);
  try {
    // Explicit demo latency lets the local prototype demonstrate its pending state.
    if (AUTH_MODE === 'demo') await new Promise(resolve => setTimeout(resolve, 380));
    await operation(); render();
  } catch (error) { feedback.textContent = error.message || 'Não foi possível continuar. Tente novamente.'; host.querySelector('input[name="code"]')?.setAttribute('aria-invalid', 'true'); }
  finally { busy = false; host.inert = false; host.removeAttribute('aria-busy'); busyDialog.close(); if (!feedback.textContent) host.querySelector('h2')?.focus({preventScroll:true}); }
}
async function finishSession(user, created = false) {
  busyDialog.update(created ? 'Preparando seu cantinho…' : 'Conferindo seu acesso…');
  await acceptSession(user);
  await busyDialog.success(AUTH_MODE === 'demo' ? created ? 'Conta de teste criada!' : 'Acesso de teste confirmado!' : created ? 'Conta criada!' : 'Acesso confirmado!');
  screen = location.hash === '#pedidos' ? 'orders' : 'profile';
}
host.addEventListener('click', async event => {
  const toggle = event.target.closest('.password-toggle');
  if (toggle) { const field = toggle.previousElementSibling, show = field.type === 'password'; field.type = show ? 'text' : 'password'; toggle.setAttribute('aria-pressed', String(show)); toggle.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha'); return; }
  if (busy) return;
  const nav = event.target.closest('button[data-screen]');
  if (nav) { if (nav.dataset.screen === 'email') {auth.cancel(); challenge = null;} screen = nav.dataset.screen; if (screen === 'verify' && !challenge) screen = 'email'; render(); return; }
  if (event.target.closest('#signout')) { await signOut(); auth.cancel(); challenge = null; screen = 'email'; render(); }
  if (event.target.closest('#resend-code')) run('Preparando outro código de teste…', async () => {challenge = await auth.resend();});
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
  if (busy || !form.reportValidity()) return;
  const values = Object.fromEntries(new FormData(form));
  const messages = {'email-form':'Preparando seu acesso…', 'verify-form':'Conferindo seu código…', 'signup-form':'Criando sua conta de teste…', 'password-form':'Conferindo seu acesso…', 'reset-form':'Atualizando sua senha de teste…'};
  run(messages[form.id], async () => {
    if (form.id === 'email-form') {challenge = await auth.begin(values); email = challenge.email; screen = 'verify';}
    if (form.id === 'verify-form') {const result = await auth.verify(values); if (result.user) await finishSession(result.user); else if (result.registrationAllowed) {busyDialog.update('E-mail confirmado.'); screen = 'signup';} else screen = 'reset';}
    if (form.id === 'signup-form') await finishSession(await auth.completeRegistration({...values, marketingOptIn:values.marketing === 'on'}), true);
    if (form.id === 'password-form') {const user = await auth.login({email, password:values.password}); auth.cancel(); await finishSession(user);}
    if (form.id === 'reset-form') {await auth.reset(values); await busyDialog.success('Senha de teste atualizada!'); challenge = null; screen = 'password';}
    form.reset();
  });
});
function route(focus = false) {
  if (busy) return;
  screen = location.hash === '#pedidos' && getSession() ? 'orders' : getSession() ? 'profile' : 'email';
  if (location.hash === '#verificar' && challenge) screen = 'verify';
  render(focus);
  if (location.hash === '#verificar' && !challenge && !getSession()) feedback.textContent = 'Para verificar sua conta nesta prévia, informe seu e-mail e solicite um novo código. O envio real de e-mail ainda não está conectado.';
  if (location.hash === '#verificar' && challenge) host.querySelector('[name="code"]')?.focus();
}
window.addEventListener('hashchange', () => route(true));
route();
