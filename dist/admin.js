import {login, verifyCode, currentSession, logout, loadOrders, changeStatus, revealDocument, retryInvoice, groupSecret} from './admin-auth.js';
import {listByStatus, dailyTotals, ordersForDay, summary, dayKey, replaceOrder, STATUSES} from './admin-store.js';
import qrcode from './vendor/qrcode-generator.js';
import {PRODUCTS, color} from './products.js';
import {money} from './commerce-config.js';
import {createBusyDialog} from './loading-ui.js';
import {icon} from './icons.js';

const content = document.querySelector('#admin-content'), tools = document.querySelector('#admin-tools'), live = document.querySelector('#admin-live');
const busyDialog = createBusyDialog();
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const announce = message => { live.textContent = message; };

// The prototype kept orders and a token in this browser; both are gone now (orders in the database, session in a cookie).
try { localStorage.removeItem('ju.admin.orders.v1'); localStorage.removeItem('ju.admin.session.v1'); } catch {}

// A real confirmation step before recusar: one accidental click can never reject a paid order.
const declineDialog = document.createElement('dialog');
declineDialog.className = 'admin-confirm';
declineDialog.setAttribute('aria-labelledby', 'decline-title');
declineDialog.innerHTML = `<form method="dialog">
  <p class="admin-confirm-icon" aria-hidden="true">⚠️</p>
  <h2 id="decline-title">Recusar este pedido?</h2>
  <p class="admin-confirm-ref"></p>
  <p class="admin-confirm-warn">O pedido vai para a aba Recusados. Se for engano, dá para reabrir depois. O estorno do pagamento é feito no Mercado Pago.</p>
  <p class="admin-confirm-warn">O cliente recebe um e-mail avisando que o pedido não será produzido e que o valor volta pelo Mercado Pago. O motivo não vai no e-mail.</p>
  <label class="admin-field"><span>Motivo (opcional, só a equipe vê)</span><textarea name="reason" maxlength="300" placeholder="Ex.: sem estoque da cor escolhida"></textarea></label>
  <div class="admin-confirm-actions"><button type="button" data-action="cancel-decline">Cancelar</button><button type="button" class="btn-decline" data-action="confirm-decline">Sim, recusar pedido</button></div>
</form>`;
document.body.append(declineDialog);
function openDeclineDialog(order) {
  declineDialog.dataset.orderId = order.id;
  declineDialog.querySelector('.admin-confirm-ref').textContent = `${order.reference} · ${money(order.totalCents)}`;
  declineDialog.querySelector('textarea').value = '';
  declineDialog.showModal();
  declineDialog.querySelector('textarea').focus();
}
declineDialog.addEventListener('click', event => {
  if (event.target.closest('[data-action="cancel-decline"]')) declineDialog.close();
  if (event.target.closest('[data-action="confirm-decline"]')) {
    const reason = declineDialog.querySelector('textarea').value;
    declineDialog.close();
    move(declineDialog.dataset.orderId, 'recusado', reason, 'Pedido recusado.');
  }
});

// screen: loading | login | code | dashboard | offline
let screen = 'loading', session = null, busy = false, feedback = '', setup = null, orders = [];
let tab = 'pendente';
const now = new Date();
let calendar = {year: now.getFullYear(), month: now.getMonth()}, selectedDay = dayKey(now);

const SOURCE_LABEL = {test: 'Teste Mercado Pago', live: 'Pedido real'};
const STATUS_LABEL = {pendente: 'Pendentes', concluido: 'Concluídos', recusado: 'Recusados'};
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESSAGES = {
  invalid_credentials: 'E-mail ou senha incorretos.', too_many_requests: 'Muitas tentativas seguidas. Aguarde alguns minutos.',
  invalid_code: 'Código incorreto ou já usado. Confira o app e digite o código atual.', too_many_attempts: 'Muitos códigos incorretos. Entre com a senha de novo.',
  unauthorized: 'O tempo para digitar o código acabou. Entre com a senha de novo.', admin_unavailable: 'O painel ainda não está disponível neste ambiente.',
  data_keys_missing: 'O painel ainda não está configurado neste ambiente (chaves de dados).', forbidden: 'Acesso bloqueado por segurança. Recarregue a página.'
};
const messageFor = code => MESSAGES[code] || 'Não foi possível continuar. Tente novamente.';

const formatWhen = iso => iso ? new Date(iso).toLocaleString('pt-BR', {day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'}) : '';
const formatPhone = digits => digits.replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3');

function itemLine(item) {
  const product = PRODUCTS[item.productId];
  const parts = product ? product.parts.map(p => `${p.name}: ${color(item.selection?.[p.id]).name}`).join(' · ') : '';
  return `<li>${Number(item.quantity) || 1}× ${esc(item.title)}${parts ? `<small>${esc(parts)}</small>` : ''}</li>`;
}

// CPFs shown on request in this session only (never stored in the browser); each request is audited on the server.
const revealed = new Map();
function cpfLine(o) {
  const button = o.buyer?.cpf && !revealed.has(o.id) ? ` <button type="button" class="admin-reveal" data-action="reveal-cpf" data-id="${esc(o.id)}">Ver CPF completo</button>` : '';
  return `CPF ${esc(revealed.get(o.id) || o.buyer?.cpf || '—')}${button}`;
}
function invoiceLine(o) {
  const company = o.buyer?.company;
  // CNPJ may be alphanumeric (since July 2026): 12 letters or digits and 2 check digits.
  if (company?.cnpj) return `${esc(company.name)}<br>CNPJ ${esc(company.cnpj.replace(/^(\w{2})(\w{3})(\w{3})(\w{4})(\d{2})$/, '$1.$2.$3/$4-$5'))} · IE ${esc(company.stateRegistration || '—')}<br>Comprador: ${esc(o.buyer?.name || '—')} · ${cpfLine(o)}`;
  return `${esc(o.buyer?.name || '—')}<br>${cpfLine(o)}`;
}

// NF-e of the order: issued when Ju confirms it ("concluído"). Shows the number and links, a note still being issued, or
// what went wrong with a retry button. A declined order that already has a note needs it cancelled at the service.
let invoicingMode = 'off';
function nfeLine(o) {
  const nfe = o.invoice;
  if (!nfe) return invoicingMode !== 'off' && o.status === 'pendente' ? '<p class="admin-invoice is-waiting">Nota fiscal: sai quando você marcar como concluído.</p>' : '';
  const test = nfe.environment !== 'producao' ? ' <span class="admin-tag source-test">homologação</span>' : '';
  if (nfe.status === 'autorizada') {
    const links = [nfe.pdfUrl && `<a href="${esc(nfe.pdfUrl)}" target="_blank" rel="noopener">PDF</a>`, nfe.xmlUrl && `<a href="${esc(nfe.xmlUrl)}" target="_blank" rel="noopener">XML</a>`].filter(Boolean).join(' · ');
    const warn = o.status === 'recusado' ? '<br><strong>Pedido recusado com nota emitida:</strong> cancele a nota no emissor (a Fazenda aceita em até 24 horas).' : '';
    return `<p class="admin-invoice is-ok">Nota fiscal nº ${esc(nfe.number)}${nfe.series ? ` · série ${esc(nfe.series)}` : ''}${test}${links ? ` · ${links}` : ''}${warn}</p>`;
  }
  if (nfe.status === 'processando') return `<p class="admin-invoice is-waiting">Nota fiscal: emitindo…${test} Clique em Atualizar em alguns instantes.</p>`;
  return `<p class="admin-invoice is-error"><strong>Nota fiscal com problema:</strong> ${esc(nfe.message || 'erro no emissor')}${o.status === 'concluido' ? ` <button type="button" class="admin-reveal" data-action="retry-invoice" data-id="${esc(o.id)}">Tentar de novo</button>` : ''}</p>`;
}

function orderCard(o) {
  const phoneDigits = String(o.customer.phone || '').replace(/\D/g, '');
  const whatsapp = /^\d{10,11}$/.test(phoneDigits) ? `<a href="https://wa.me/55${phoneDigits}" target="_blank" rel="noopener">${esc(formatPhone(phoneDigits))}</a>` : esc(o.customer.phone || '—');
  const cep = String(o.address.cep || '').replace(/^(\d{5})(\d{3})$/, '$1-$2');
  const payLabel = o.method === 'pix' ? 'Pago via Pix' : o.method === 'debit' ? 'Pago no débito' : `Pago no crédito${o.installments > 1 ? ` · ${o.installments}x` : ''}`;
  // The payment method rides a colored corner badge (icon only) instead of a text tag — quicker to scan, and its
  // color always matches the order's own status (yellow/green/red), never an extra color to learn.
  const payBadge = `<span class="admin-pay-badge status-${esc(o.status)}" title="${esc(payLabel)}">${icon(o.method === 'pix' ? 'pix' : 'card')}<span class="sr-only">${esc(payLabel)}</span></span>`;
  const actions = o.status === 'pendente'
    ? `<div class="admin-order-actions"><button type="button" class="btn-complete" data-action="complete" data-id="${esc(o.id)}">Marcar como concluído</button><button type="button" class="btn-decline" data-action="decline" data-id="${esc(o.id)}">Recusar pedido</button></div>`
    : `<div class="admin-order-actions"><span class="admin-decision-note">${o.status === 'concluido' ? 'Concluído' : 'Recusado'} em ${esc(formatWhen(o.decidedAt))}${o.declineReason ? ' · ' + esc(o.declineReason) : ''}</span><button type="button" class="btn-reopen" data-action="reopen" data-id="${esc(o.id)}">Reabrir</button></div>`;
  return `<article class="admin-order status-${esc(o.status)}" data-order="${esc(o.id)}">
    ${payBadge}
    <div class="admin-order-head">
      <span class="admin-order-ref">${esc(o.reference)}</span>
      <span class="admin-tag source-${esc(o.source)}">${esc(SOURCE_LABEL[o.source] || o.source)}</span>
      <span class="admin-order-when">${esc(formatWhen(o.paidAt))}</span>
    </div>
    <ul class="admin-order-items">${o.items.map(itemLine).join('')}</ul>
    <div class="admin-order-grid">
      <div><strong>${esc(o.customer.name || '—')}</strong>${esc(o.customer.email || '')}<br>${whatsapp}</div>
      <div><strong>Entrega</strong>${esc(o.address.street)}, ${esc(o.address.number)}${o.address.complement ? ' — ' + esc(o.address.complement) : ''}<br>${esc(o.address.district)} · ${esc(o.address.city)}/${esc(o.address.state)} · CEP ${esc(cep)}</div>
      <div><strong>Nota fiscal</strong>${invoiceLine(o)}</div>
    </div>
    ${nfeLine(o)}
    ${o.notes ? `<p class="admin-order-notes">${esc(o.notes)}</p>` : ''}
    <div class="admin-order-foot"><span class="admin-order-total">${esc(money(o.totalCents))}</span>${actions}</div>
  </article>`;
}

function ordersView(list) {
  const counts = Object.fromEntries(STATUSES.map(s => [s, list.filter(o => o.status === s).length]));
  const tabsHtml = STATUSES.map(s => `<button type="button" data-tab="${s}" aria-pressed="${tab === s}">${STATUS_LABEL[s]}<span>${counts[s]}</span></button>`).join('');
  const shown = listByStatus(list, tab);
  const empty = {pendente: 'Nenhum pedido pendente por aqui. Assim que um pedido for pago, ele aparece nesta lista.', concluido: 'Nenhum pedido concluído ainda.', recusado: 'Nenhum pedido recusado.'}[tab];
  const body = shown.length ? `<div class="admin-orders">${shown.map(orderCard).join('')}</div>` : `<p class="admin-empty">${empty}</p>`;
  return `<div class="admin-tabs">${tabsHtml}</div>${body}`;
}

function chartView(list) {
  const totals = new Map(dailyTotals(list).map(t => [t.date, t]));
  const days = Array.from({length: 14}, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (13 - i)); const key = dayKey(d); const found = totals.get(key); return {date: key, totalCents: found?.totalCents || 0, label: d.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'})}; });
  const max = Math.max(1, ...days.map(d => d.totalCents));
  const todayKey = dayKey(new Date());
  const rangeTotal = days.reduce((sum, d) => sum + d.totalCents, 0);
  const bars = days.map(d => `<button type="button" class="chart-bar${d.date === todayKey ? ' is-today' : ''}" style="--v:${(d.totalCents / max).toFixed(4)}" data-value="${d.totalCents}" data-label="${esc(d.label)}" aria-label="${esc(d.label)}: ${esc(money(d.totalCents))}"></button>`).join('');
  const ticks = (rangeTotal ? [max, Math.round(max / 2), 0] : [0]).map(v =>`<span style="top:${100 - (v / max) * 100}%">${esc(money(v))}</span>`).join('');
  return `<div class="admin-panel"><h2>Faturamento dos últimos 14 dias</h2><p class="panel-sub">Total no período: <strong>${esc(money(rangeTotal))}</strong> · sem os recusados</p>
    <div class="admin-chart" role="img" aria-label="Faturamento diário dos últimos 14 dias, total ${esc(money(rangeTotal))}"><div class="chart-grid">${ticks}</div><div class="chart-bars">${bars}</div></div>
    <div class="chart-axis"><span>${esc(days[0].label)}</span><span>${esc(days.at(-1).label)}</span></div>
  </div><div class="chart-tip" id="chart-tip" role="tooltip"></div>`;
}

function calendarView(list) {
  const {year, month} = calendar;
  const startOffset = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalsByDay = new Map(dailyTotals(list).map(t => [t.date, t]));
  const todayKey = dayKey(new Date());
  const cells = Array.from({length: startOffset}, () => '<button type="button" disabled aria-hidden="true"></button>');
  for (let day = 1; day <= daysInMonth; day++) {
    const key = dayKey(new Date(year, month, day));
    cells.push(`<button type="button" class="${totalsByDay.has(key) ? 'has-orders ' : ''}${key === todayKey ? 'is-today ' : ''}" data-day="${key}" aria-pressed="${selectedDay === key}">${day}</button>`);
  }
  const detail = ordersForDay(list, selectedDay), detailTotal = detail.filter(o => o.status !== 'recusado').reduce((sum, o) => sum + o.totalCents, 0);
  const detailDate = new Date(selectedDay + 'T12:00:00');
  const detailHtml = `<div class="admin-day-detail"><h3>${esc(detailDate.toLocaleDateString('pt-BR', {weekday: 'long', day: '2-digit', month: 'long'}))}</h3><p class="day-total">${detail.length ? `${detail.length} pedido${detail.length === 1 ? '' : 's'} · ${esc(money(detailTotal))}` : 'Nenhum pedido neste dia.'}</p>${detail.length ? `<ul class="admin-day-orders">${detail.map(o => `<li><span class="status-dot ${esc(o.status)}" aria-hidden="true"></span>${esc(o.reference)}<strong>${esc(money(o.totalCents))}</strong></li>`).join('')}</ul>` : ''}</div>`;
  return `<div class="admin-panel"><h2>Calendário</h2><p class="panel-sub">Selecione um dia para ver os pedidos.</p>
    <div class="admin-calendar-nav"><button type="button" data-cal="prev" aria-label="Mês anterior">‹</button><strong>${MONTHS[month]} de ${year}</strong><button type="button" data-cal="next" aria-label="Próximo mês">›</button></div>
    <div class="admin-calendar">${WEEKDAYS.map(w => `<span class="weekday">${w}</span>`).join('')}${cells.join('')}</div>
    ${detailHtml}
  </div>`;
}

function dashboardView() {
  const s = summary(orders);
  return `<div class="admin-dash-head"><div><h1 id="admin-title" tabindex="-1">Pedidos</h1><p>Pedidos pagos, direto do banco de dados. Organize a produção e o envio.</p></div><button type="button" class="btn-reopen" data-action="refresh">Atualizar</button></div>
    <div class="admin-kpis">
      <div class="admin-kpi is-pendente"><span>Pendentes</span><strong>${s.pendentes}</strong></div>
      <div class="admin-kpi is-concluido"><span>Concluídos</span><strong>${s.concluidos}</strong></div>
      <div class="admin-kpi is-recusado"><span>Recusados</span><strong>${s.recusados}</strong></div>
      <div class="admin-kpi"><span>Faturamento no mês</span><strong>${esc(money(s.monthRevenue))}</strong></div>
    </div>
    ${ordersView(orders)}
    <div class="admin-panels">${chartView(orders)}${calendarView(orders)}</div>`;
}

function loginView() {
  return `<div class="admin-login-wrap"><form id="admin-login-form" class="admin-login-card" novalidate>
    <p class="eyebrow">ÁREA RESTRITA</p>
    <h1 id="admin-title" tabindex="-1">Entrar no painel</h1>
    <p class="lead">Acesso da equipe para acompanhar os pedidos.</p>
    <label class="admin-field"><span>E-mail</span><input name="email" type="email" autocomplete="username" required></label>
    <label class="admin-field"><span>Senha</span><input name="password" type="password" autocomplete="current-password" required></label>
    <button type="submit" class="admin-submit">Continuar</button>
    <p class="admin-error" role="alert">${esc(feedback)}</p>
  </form></div>`;
}

// The otpauth link drawn as an SVG QR code (no image request, nothing leaves the page).
function qrSvg(text) {
  const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
  const size = qr.getModuleCount(), quiet = 4;
  let path = '';
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (qr.isDark(r, c)) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  return `<svg class="admin-qr" viewBox="0 0 ${size + quiet * 2} ${size + quiet * 2}" role="img" aria-label="QR Code para o app autenticador" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

function codeView() {
  const enroll = setup ? `<ol class="admin-setup-steps">
      <li>Instale um app autenticador no celular: Google Authenticator, Microsoft Authenticator ou similar.</li>
      <li>No app, toque em <strong>adicionar</strong> e leia este QR Code.</li>
      <li>Digite abaixo o código de 6 dígitos que aparecer.</li>
    </ol>
    ${qrSvg(setup.otpauth)}
    <details class="admin-secret"><summary>Não consegue ler o QR Code?</summary><p>No app, escolha “inserir chave” e digite:</p><code translate="no">${esc(groupSecret(setup.secret))}</code></details>` : '<p class="lead">Abra o app autenticador no celular e digite o código de 6 dígitos do Painel da Ju.</p>';
  return `<div class="admin-login-wrap"><form id="admin-code-form" class="admin-login-card" novalidate>
    <p class="eyebrow">${setup ? 'PRIMEIRO ACESSO · VERIFICAÇÃO EM DUAS ETAPAS' : 'VERIFICAÇÃO EM DUAS ETAPAS'}</p>
    <h1 id="admin-title" tabindex="-1">${setup ? 'Proteja o painel' : 'Código do app'}</h1>
    ${enroll}
    <label class="admin-field"><span>Código de 6 dígitos</span><input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label>
    <button type="submit" class="admin-submit">${setup ? 'Ativar e entrar' : 'Entrar'}</button>
    <button type="button" class="admin-link" data-action="restart">← Voltar para a senha</button>
    <p class="admin-error" role="alert">${esc(feedback)}</p>
  </form></div>`;
}

const offlineView = () => `<div class="admin-login-wrap"><div class="admin-login-card"><h1 id="admin-title" tabindex="-1">Painel indisponível</h1><p class="lead">${esc(feedback || 'Não foi possível falar com o servidor.')}</p><button type="button" class="admin-submit" data-action="retry">Tentar de novo</button></div></div>`;

function bindChartTooltips() {
  const tip = content.querySelector('#chart-tip');
  if (!tip) return;
  const show = bar => { const rect = bar.getBoundingClientRect(); tip.innerHTML = `<strong>${esc(money(Number(bar.dataset.value)))}</strong>${esc(bar.dataset.label)}`; tip.style.left = `${rect.left + rect.width / 2}px`; tip.style.top = `${rect.top}px`; tip.classList.add('is-visible'); };
  const hide = () => tip.classList.remove('is-visible');
  content.querySelectorAll('.chart-bar').forEach(bar => { bar.addEventListener('mouseenter', () => show(bar)); bar.addEventListener('mouseleave', hide); bar.addEventListener('focus', () => show(bar)); bar.addEventListener('blur', hide); });
}

function render(focus = true) {
  tools.hidden = screen !== 'dashboard';
  if (screen === 'dashboard') tools.innerHTML = `<span>Olá, <strong>${esc(session.email)}</strong></span><button type="button" id="admin-logout">Sair</button>`;
  content.innerHTML = screen === 'login' ? loginView() : screen === 'code' ? codeView() : screen === 'dashboard' ? dashboardView() : screen === 'offline' ? offlineView() : '<h1 id="admin-title" tabindex="-1">Carregando…</h1>';
  feedback = '';
  if (screen === 'dashboard') bindChartTooltips();
  if (screen === 'code') content.querySelector('input[name=code]')?.focus({preventScroll: true});
  else if (focus) content.querySelector('#admin-title')?.focus({preventScroll: true});
}

async function run(message, operation) {
  if (busy) return;
  busy = true; content.setAttribute('aria-busy', 'true'); content.inert = true;
  busyDialog.start(message);
  try { await operation(); busyDialog.close(); }
  catch (error) { busyDialog.close(); feedback = error.message || messageFor(); }
  finally { busy = false; content.removeAttribute('aria-busy'); content.inert = false; render(!feedback); }
}

// Signed out (session ended elsewhere, or expired): back to the password, saying why.
function signedOut() { session = null; orders = []; setup = null; revealed.clear(); screen = 'login'; feedback = 'Sua sessão terminou. Entre de novo.'; }

async function openDashboard() {
  const loaded = await loadOrders();
  orders = loaded.orders; invoicingMode = loaded.invoicing;
  screen = 'dashboard';
}

async function move(id, status, reason, done) {
  await run('Salvando…', async () => {
    try {
      const result = await changeStatus(id, status, reason);
      orders = replaceOrder(orders, result.order);
      // Confirming or declining e-mails the buyer; say whether it went out (reopening sends nothing).
      const nfe = result.order.invoice;
      const nfeNote = status === 'concluido' && nfe ? (nfe.status === 'autorizada' ? ` Nota fiscal nº ${nfe.number} emitida.` : nfe.status === 'processando' ? ' A nota fiscal está sendo emitida.' : ' A nota fiscal teve um problema: veja no pedido.') : '';
      announce(status === 'pendente' ? done : `${done} ${result.mailed ? 'O cliente recebeu um e-mail.' : 'O e-mail ao cliente não saiu.'}${nfeNote}`);
    }
    catch (error) { if (error.code === 'unauthorized') { signedOut(); return; } throw new Error('Não foi possível salvar agora. Tente novamente.'); }
  });
}

content.addEventListener('submit', event => {
  event.preventDefault();
  if (busy || !event.target.reportValidity()) return;
  const data = Object.fromEntries(new FormData(event.target));
  if (event.target.id === 'admin-login-form') run('Conferindo seu acesso…', async () => {
    const result = await login(data.email, data.password);
    if (!result.ok) throw new Error(messageFor(result.error));
    setup = result.setup; screen = 'code';
  });
  if (event.target.id === 'admin-code-form') run('Conferindo o código…', async () => {
    const result = await verifyCode(String(data.code || '').replace(/\D/g, ''));
    if (!result.ok) {
      if (['too_many_attempts', 'unauthorized'].includes(result.error)) { setup = null; screen = 'login'; }
      throw new Error(messageFor(result.error) + (result.error === 'invalid_code' && result.remaining ? ` Restam ${result.remaining} tentativa${result.remaining === 1 ? '' : 's'}.` : ''));
    }
    session = {email: result.email, expiresAt: result.expiresAt}; setup = null;
    await openDashboard();
    await busyDialog.success('Acesso confirmado!');
  });
});

content.addEventListener('click', event => {
  const tabBtn = event.target.closest('[data-tab]');
  if (tabBtn) { tab = tabBtn.dataset.tab; render(false); return; }

  const calBtn = event.target.closest('[data-cal]');
  if (calBtn) { let {year, month} = calendar; month += calBtn.dataset.cal === 'next' ? 1 : -1; if (month < 0) { month = 11; year--; } if (month > 11) { month = 0; year++; } calendar = {year, month}; render(false); return; }

  const dayBtn = event.target.closest('[data-day]');
  if (dayBtn && !dayBtn.disabled) { selectedDay = dayBtn.dataset.day; render(false); return; }

  const action = event.target.closest('[data-action]');
  if (!action) return;
  const id = action.dataset.id;
  if (action.dataset.action === 'complete') move(id, 'concluido', '', 'Pedido marcado como concluído.');
  if (action.dataset.action === 'reopen') move(id, 'pendente', '', 'Pedido reaberto como pendente.');
  if (action.dataset.action === 'decline') { const order = orders.find(o => o.id === id); if (order) openDeclineDialog(order); }
  if (action.dataset.action === 'refresh') run('Atualizando os pedidos…', async () => { try { await openDashboard(); announce('Pedidos atualizados.'); } catch (error) { if (error.code === 'unauthorized') { signedOut(); return; } throw new Error('Não foi possível atualizar agora.'); } });
  if (action.dataset.action === 'retry-invoice') run('Emitindo a nota fiscal…', async () => {
    try { const order = await retryInvoice(id); orders = replaceOrder(orders, order); announce(order.invoice?.status === 'autorizada' ? `Nota fiscal nº ${order.invoice.number} emitida.` : 'A nota fiscal ainda tem um problema: veja no pedido.'); }
    catch (error) { if (error.code === 'unauthorized') { signedOut(); return; } throw new Error('Não foi possível emitir a nota agora. Tente novamente.'); }
  });
  if (action.dataset.action === 'reveal-cpf') run('Buscando o CPF…', async () => {
    try { revealed.set(id, await revealDocument(id)); announce('CPF completo exibido. A consulta fica registrada.'); }
    catch (error) { if (error.code === 'unauthorized') { signedOut(); return; } throw new Error('Não foi possível buscar o CPF agora. Tente novamente.'); }
  });
  if (action.dataset.action === 'restart') { setup = null; screen = 'login'; render(); }
  if (action.dataset.action === 'retry') start();
});

// The logout button lives in the topbar (#admin-tools), outside #admin-content, so it needs its own listener.
tools.addEventListener('click', async event => {
  if (!event.target.closest('#admin-logout')) return;
  await logout(); session = null; orders = []; revealed.clear(); screen = 'login'; render();
});

content.addEventListener('input', event => { if (event.target.closest('#admin-login-form, #admin-code-form')) feedback = ''; });

async function start() {
  screen = 'loading'; render(false);
  try {
    session = await currentSession();
    if (session) await openDashboard(); else screen = 'login';
  } catch (error) {
    if (error.code === 'unauthorized') { session = null; screen = 'login'; }
    else { screen = 'offline'; feedback = error.code === 'admin_unavailable' ? messageFor('admin_unavailable') : 'Não foi possível falar com o servidor. Verifique a conexão.'; }
  }
  render();
}
start();
