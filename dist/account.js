import {AUTH_MODE, auth, getSession, acceptSession, signOut, readDemoOrders} from './auth-service.js';
import {icon} from './icons.js';
import './i18n.js';
import {money} from './commerce-config.js';
const host=document.querySelector('#account-content'), feedback=document.querySelector('#account-feedback'), sceneGreeting=document.querySelector('#scene-greeting');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let screen=getSession()?'profile':'login', email='', name='', challenge=null, busy=false, countdown=null;
const lockIcon='<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>';
const input=(key,label,{type='text',autocomplete='',placeholder='',hint=''}={})=>`<div class="auth-field"><label for="auth-${key}">${label}</label><div class="auth-input">${type==='password'?lockIcon:icon(key==='name'?'profile':'mail')}<input id="auth-${key}" name="${key}" type="${type}" ${type==='password'?'data-secret minlength="8" maxlength="128"':'maxlength="180"'} autocomplete="${autocomplete}" ${type==='email'?'autocapitalize="none" spellcheck="false" inputmode="email"':''} placeholder="${placeholder}" value="${key==='email'?esc(email):key==='name'?esc(name):''}" aria-describedby="${hint?`auth-${key}-help `:''}account-feedback" required>${type==='password'?`<button class="password-toggle" type="button" aria-label="Mostrar ${key==='confirm'?'confirmação da senha':'senha'}" aria-controls="auth-${key}" aria-pressed="false">${icon('eye')}</button>`:''}</div>${hint?`<small class="password-help" id="auth-${key}-help">${hint}</small>`:''}</div>`;
const submit=text=>`<button class="primary account-submit" type="submit">${text} ${icon('arrow')}</button>`;
const back=text=>`<button type="button" class="back-auth" data-screen="login">← ${text}</button>`;
const title=(kicker,title,description)=>`<p class="eyebrow">${kicker}</p><h2 id="account-title" tabindex="-1">${title}</h2><p class="account-lead">${description}</p>`;
function render(focus=true) {
  const previousScreen=host.dataset.screen;
  const existingTabs=host.querySelector('.account-tabs');
  clearInterval(countdown); feedback.textContent=''; host.dataset.screen=screen;
  document.querySelector('.preview-details').hidden=AUTH_MODE!=='demo';
  const session=getSession();
  if(sceneGreeting){const firstName=session?.name?.trim().split(/\s+/)[0];sceneGreeting.hidden=!firstName;sceneGreeting.textContent=firstName?`Olá, ${firstName}.`:'';}
  document.title=(screen==='orders'?'Meus pedidos':'Seu cantinho')+' · Ju imprime pra mim';
  const tabs=`<div class="account-tabs" data-active="${screen}" role="group" aria-label="Acesso à conta"><button type="button" data-screen="login" aria-pressed="${screen==='login'}">Entrar</button><button type="button" data-screen="signup" aria-pressed="${screen==='signup'}">Criar conta</button></div>`;
  if(screen==='login') host.innerHTML=title('BEM-VINDA DE VOLTA','Que bom ter<br>você por aqui.','Entre para acompanhar seus pedidos e descobrir criações pensadas para a sua rotina.')+tabs+`<form id="login-form">${input('email','E-mail',{type:'email',autocomplete:'email',placeholder:'Seu e-mail'})}${input('password','Senha',{type:'password',autocomplete:'current-password',placeholder:'Sua senha'})}<div class="auth-links"><button type="button" data-screen="forgot">Esqueci minha senha</button></div>${submit('Entrar na minha conta')}</form><p class="account-switch">Chegando agora? <button data-screen="signup">Crie seu cantinho</button></p>`;
  if(screen==='signup') host.innerHTML=title('VAMOS NOS CONHECER?','Seu toque.<br>Seu cantinho.','Crie sua conta para acompanhar cada escolha, da primeira cor à chegada da sua peça.')+tabs+`<form id="signup-form">${input('name','Como podemos chamar você?',{autocomplete:'name',placeholder:'Seu nome'})}${input('email','E-mail',{type:'email',autocomplete:'email',placeholder:'Seu e-mail'})}${input('password','Crie uma senha',{type:'password',autocomplete:'new-password',placeholder:'Pelo menos 8 caracteres',hint:AUTH_MODE==='demo'?'Na prévia, use uma senha fictícia, diferente das suas senhas pessoais.':''})}${submit('Criar minha conta')}</form><p class="account-switch">Já tem uma conta? <button data-screen="login">Entrar</button></p>`;
  if(screen==='forgot') host.innerHTML=`<div class="verify-icon">${icon('mail')}</div>`+title('A GENTE AJUDA VOCÊ','Esqueceu a senha?','Acontece! Informe seu e-mail para iniciar a recuperação com um código de seis números.')+`<form id="forgot-form">${input('email','E-mail da sua conta',{type:'email',autocomplete:'email',placeholder:'Seu e-mail'})}${submit('Receber código')}</form>${back('Voltar para entrar')}`;
  if(screen==='verify') {
    host.innerHTML=`<div class="verify-icon">${icon('mail')}</div>`+title('SÓ MAIS UM PASSINHO','Confira seu e-mail.',`Na versão conectada, o código chegará a <strong>${esc(email)}</strong>. Nesta prévia, consulte o código de teste abaixo.`)+`<form id="verify-form"><label class="auth-field code-input"><span>Código de verificação</span><input name="code" inputmode="numeric" autocomplete="one-time-code" type="text" pattern="[0-9]{6}" maxlength="6" minlength="6" placeholder="000000" aria-describedby="code-help" required></label><p class="password-help" id="code-help">Digite os seis números. O código vale por 10 minutos.</p>${submit(challenge.purpose==='reset'?'Verificar código':'Confirmar meu e-mail')}</form><div class="resend-row"><span>Não recebeu?</span><button id="resend-code" type="button">Reenviar código</button></div><button class="back-auth" data-screen="${challenge.purpose==='reset'?'forgot':'signup'}">← Alterar e-mail</button>`;
    const tick=()=>{const b=document.querySelector('#resend-code');if(!b)return;const seconds=Math.max(0,Math.ceil((challenge.resendAt-Date.now())/1000));b.disabled=busy||seconds>0;b.textContent=seconds?`Reenviar em ${seconds}s`:'Reenviar código';}; tick();countdown=setInterval(tick,1000);
  }
  if(screen==='reset') host.innerHTML=`<div class="verify-icon">${icon('check')}</div>`+title('CÓDIGO CONFERIDO','Um novo começo.','Escolha uma nova senha para voltar ao seu cantinho.')+`<form id="reset-form">${input('password','Nova senha',{type:'password',autocomplete:'new-password',placeholder:'Pelo menos 8 caracteres'})}${input('confirm','Confirme a nova senha',{type:'password',autocomplete:'new-password',placeholder:'Digite a senha novamente'})}${submit('Salvar nova senha')}</form>`;
  if(screen==='reset-done') host.innerHTML=`<div class="verify-icon">${icon('check')}</div>`+title('TUDO PRONTO','Senha renovada.','Sua senha de teste foi atualizada. Você já pode entrar de novo nesta página.')+`<button class="primary account-submit" data-screen="login">Voltar para entrar ${icon('arrow')}</button>`;
  if(screen==='profile') {
    const user=getSession();
    if(!user){screen='login';return render(focus);}
    host.innerHTML=title('SEU CANTINHO','Que bom ter você por aqui.','Acompanhe seus pedidos e explore novas cores quando quiser.')+`<div class="account-empty">${icon('profile')}<h3>${esc(user.name)}</h3><p>${esc(user.email)}</p><small>Sessão demonstrativa nesta aba</small></div><button class="primary account-submit" data-screen="orders">Meus pedidos ${icon('bag')}</button><a class="primary account-submit buy-now" href="produtos.html">Explorar os produtos ${icon('arrow')}</a><button class="text-button" id="signout">Sair da minha conta</button>`;
  }
  if(screen==='orders') {
    const orders=readDemoOrders();
    host.innerHTML=title('CADA ESCOLHA CONTA','Meus pedidos.','Acompanhe os pedidos demonstrativos feitos nesta aba.')+(orders.length?orders.map(o=>`<article class="order-preview"><h3>Pedido ${esc(o.id)}</h3><small>Pagamento simulado · nenhuma cobrança</small><p>${o.items.map(i=>`${Number(i.quantity)||1} × ${esc(i.title)}`).join('<br>')}</p><strong>${money(Number.isFinite(o.total)?o.total:o.items.reduce((s,i)=>s+(Number(i.unitPrice)||0)*(Number(i.quantity)||1),0))}</strong><p>${Number.isFinite(o.total)?'Total com entrega demonstrativa':'Produtos · entrega no resumo original'}</p></article>`).join(''):`<div class="account-empty">${icon('bag')}<h3>Seu primeiro encanto<br>está por vir.</h3><p>Quando você finalizar um pedido de teste, ele aparecerá aqui.</p><a class="primary account-submit" href="produtos.html">Conhecer os produtos ${icon('arrow')}</a></div>`)+`<button class="back-auth" data-screen="${getSession()?'profile':'login'}">← Voltar à minha conta</button>`;
  }
  if(screen==='profile') host.querySelector('.account-empty h3')?.setAttribute('translate','no');
  // Keep the selector node so its highlight can slide between the two states.
  if(existingTabs&&host.querySelector('.account-tabs')) {
    host.querySelector('.account-tabs').replaceWith(existingTabs);
    existingTabs.dataset.active=screen;
    existingTabs.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.screen===screen)));
  }
  if(previousScreen&&previousScreen!==screen&&!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    host.querySelector('form')?.animate([{opacity:.3,transform:'translateY(5px)'},{opacity:1,transform:'none'}],{duration:220,easing:'ease-out'});
  }
  if(focus) {
    const heading=host.querySelector('h2');
    heading?.focus({preventScroll:true});
    if(heading&&heading.getBoundingClientRect().top<0)heading.scrollIntoView({block:'start'});
  }
}
function showCode() {
  const inbox=document.querySelector('#demo-inbox');
  inbox.innerHTML=`<div class="demo-code">Código de teste — não enviado por e-mail<strong>${esc(challenge.demoCode)}</strong><small>Use apenas para testar esta prévia.</small></div>`;
  document.querySelector('.preview-details').open=true;
}
host.addEventListener('click',async e=>{
  const toggle=e.target.closest('.password-toggle');
  if(toggle){const field=toggle.previousElementSibling,show=field.type==='password';field.type=show?'text':'password';toggle.setAttribute('aria-pressed',String(show));toggle.setAttribute('aria-label',`${show?'Ocultar':'Mostrar'} ${field.name==='confirm'?'confirmação da senha':'senha'}`);return;}
  if(busy)return;
  const navigation=e.target.closest('[data-screen]');
  if(navigation&&navigation!==host){if(screen!==navigation.dataset.screen){screen=navigation.dataset.screen;render();}return;}
  if(e.target.closest('#signout')){await signOut();screen='login';render();}
  if(e.target.closest('#resend-code')){
    busy=true;try{challenge=await auth.resend();render(false);showCode();feedback.textContent='Novo código de teste gerado.';}catch(error){feedback.textContent=error.message;}finally{busy=false;}
  }
});
host.addEventListener('input',e=>{e.target.removeAttribute('aria-invalid');if(e.target.name==='email')email=e.target.value;if(e.target.name==='name')name=e.target.value;if(e.target.name==='code')e.target.value=e.target.value.replace(/\D/g,'').slice(0,6);});
host.addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;
  const form=e.target;if(!form.reportValidity())return;
  const values=Object.fromEntries(new FormData(form)),button=form.querySelector('[type=submit]');
  const buttonContent=button.innerHTML;
  busy=true;button.disabled=true;form.setAttribute('aria-busy','true');button.textContent='Processando…';feedback.textContent='';
  try{
    if(form.id==='login-form'){await acceptSession(await auth.login(values));screen=location.hash==='#pedidos'?'orders':'profile';}
    if(form.id==='signup-form'){challenge=await auth.register(values);email=challenge.email;screen='verify';}
    if(form.id==='forgot-form'){challenge=await auth.forgot(values);email=challenge.email;screen='verify';}
    if(form.id==='verify-form'){const result=await auth.verify(values);if(result.user){await acceptSession(result.user);screen=location.hash==='#pedidos'?'orders':'profile';}else screen='reset';}
    if(form.id==='reset-form'){if(values.password!==values.confirm)throw Error('As senhas precisam ser iguais.');await auth.reset(values);screen='reset-done';}
    form.reset();render();if(screen==='verify')showCode();else document.querySelector('#demo-inbox').replaceChildren();
  }catch(error){feedback.textContent=error.message;form.querySelector('input[name=code]')?.setAttribute('aria-invalid','true');}
  finally{busy=false;button.disabled=false;button.innerHTML=buttonContent;form.removeAttribute('aria-busy');}
});
function route(){
  if(location.hash==='#pedidos')screen=getSession()?'orders':'login';
  if(location.hash==='#verificar' && challenge) screen='verify';
  render(false);
  if(location.hash==='#verificar' && !challenge && !getSession()) feedback.textContent='Para verificar sua conta nesta prévia, crie uma conta ou solicite um novo código. O envio real de e-mail ainda não está conectado.';
  if(location.hash==='#verificar' && challenge) host.querySelector('[name="code"]')?.focus();
}
window.addEventListener('hashchange',route);route();
