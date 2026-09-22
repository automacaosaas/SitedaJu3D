import {login, logout, verifiedSession, getSession} from './admin-auth.js';
import {readOrders, setStatus, listByStatus, dailyTotals, ordersForDay, summary, dayKey, STATUSES} from './admin-store.js';
import {PRODUCTS, color} from './products.js';
import {money} from './commerce-config.js';
import {createBusyDialog} from './loading-ui.js';

const content = document.querySelector('#admin-content'), tools = document.querySelector('#admin-tools'), live = document.querySelector('#admin-live');
const busyDialog = createBusyDialog();
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const announce = message => { live.textContent = message; };

let screen = 'loading', session = null, busy = false, feedback = '';
let tab = 'pendente', decliningId = null;
const now = new Date();
let calendar = {year: now.getFullYear(), month: now.getMonth()}, selectedDay = dayKey(now.toISOString());

const SOURCE_LABEL = {demo: 'Demonstração', test: 'Teste Mercado Pago', live: 'Pedido real'};
const STATUS_LABEL = {pendente: 'Pendentes', concluido: 'Concluídos', recusado: 'Recusados'};
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const formatWhen = iso => iso ? new Date(iso).toLocaleString('pt-BR', {day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'}) : '';
const formatPhone = digits => digits.replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3');

function itemLine(item) {
  const product = PRODUCTS[item.productId];
  const parts = product ? product.parts.map(p => `${p.name}: ${color(item.selection[p.id]).name}`).join(' · ') : '';
  return `<li>${item.quantity}× ${esc(item.title)}${parts ? `<small>${esc(parts)}</small>` : ''}</li>`;
}

function orderCard(o) {
  const phoneDigits = String(o.customer.phone || '').replace(/\D/g, '');
  const whatsapp = /^\d{10,13}$/.test(phoneDigits) ? `<a href="https://wa.me/55${phoneDigits}" target="_blank" rel="noopener">${esc(formatPhone(phoneDigits))}</a>` : esc(o.customer.phone || '—');
  const cep = o.address.cep.replace(/^(\d{5})(\d{3})$/, '$1-$2');
  const actions = o.status === 'pendente'
    ? `<button type="button" class="primary" data-action="complete" data-id="${o.id}">Marcar como concluído</button><button type="button" class="danger" data-action="decline" data-id="${o.id}">Recusar pedido</button>`
    : `<span class="admin-decision-note">${o.status === 'concluido' ? 'Concluído' : 'Recusado'} em ${esc(formatWhen(o.decidedAt))}${o.declineReason ? ' · ' + esc(o.declineReason) : ''}</span><button type="button" data-action="reopen" data-id="${o.id}">Reabrir</button>`;
  const declineBox = decliningId === o.id ? `<div class="admin-decline-box"><label class="admin-field"><span>Motivo (opcional, só a Ju vê)</span><textarea name="reason" maxlength="300" placeholder="Ex.: sem estoque da cor escolhida"></textarea></label><div class="admin-decline-actions"><button type="button" data-action="cancel-decline">Cancelar</button><button type="button" class="danger" data-action="confirm-decline" data-id="${o.id}">Confirmar recusa</button></div></div>` : '';
  return `<article class="admin-order" data-order="${o.id}">
    <div class="admin-order-head">
      <span class="admin-order-ref">${esc(o.reference)}</span>
      <span class="admin-tag source-${o.source}">${esc(SOURCE_LABEL[o.source] || o.source)}</span>
      <span class="admin-tag">${o.method === 'pix' ? 'Pix' : 'Cartão'}</span>
      <span class="admin-order-when">${esc(formatWhen(o.paidAt))}</span>
    </div>
    <ul class="admin-order-items">${o.items.map(itemLine).join('')}</ul>
    <div class="admin-order-grid">
      <div><strong>${esc(o.customer.name || '—')}</strong>${esc(o.customer.email || '')}<br>${whatsapp}</div>
      <div><strong>Entrega</strong>${esc(o.address.street)}, ${esc(o.address.number)}${o.address.complement ? ' — ' + esc(o.address.complement) : ''}<br>${esc(o.address.district)} · ${esc(o.address.city)}/${esc(o.address.state)} · CEP ${esc(cep)}</div>
    </div>
    ${o.notes ? `<p class="admin-order-notes">${esc(o.notes)}</p>` : ''}
    ${declineBox}
    <div class="admin-order-foot"><span class="admin-order-total">${esc(money(o.totalCents))}</span>${actions}</div>
  </article>`;
}

function ordersView(list) {
  const counts = Object.fromEntries(STATUSES.map(s => [s, list.filter(o => o.status === s).length]));
  const tabsHtml = STATUSES.map(s => `<button type="button" data-tab="${s}" aria-pressed="${tab === s}">${STATUS_LABEL[s]}<span>${counts[s]}</span></button>`).join('');
  const shown = listByStatus(list, tab);
  const empty = {pendente: 'Nenhum pedido pendente por aqui. Assim que uma compra de teste for aprovada, ela aparece nesta lista.', concluido: 'Nenhum pedido concluído ainda.', recusado: 'Nenhum pedido recusado.'}[tab];
  const body = shown.length ? `<div class="admin-orders">${shown.map(orderCard).join('')}</div>` : `<p class="admin-empty">${empty}</p>`;
  return `<div class="admin-tabs">${tabsHtml}</div>${body}`;
}

function chartView(list) {
  const totals = new Map(dailyTotals(list).map(t => [t.date, t]));
  const days = Array.from({length: 14}, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (13 - i)); const key = dayKey(d.toISOString()); const found = totals.get(key); return {date: key, totalCents: found?.totalCents || 0, label: d.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'})}; });
  const max = Math.max(1, ...days.map(d => d.totalCents));
  const todayKey = dayKey(new Date().toISOString());
  const rangeTotal = days.reduce((sum, d) => sum + d.totalCents, 0);
  const bars = days.map(d => `<button type="button" class="chart-bar${d.date === todayKey ? ' is-today' : ''}" style="--v:${(d.totalCents / max).toFixed(4)}" data-value="${d.totalCents}" data-label="${esc(d.label)}" aria-label="${esc(d.label)}: ${esc(money(d.totalCents))}"></button>`).join('');
  const ticks = [max, Math.round(max / 2), 0].map(v => `<span style="top:${100 - (v / max) * 100}%">${esc(money(v))}</span>`).join('');
  return `<div class="admin-panel"><h2>Faturamento dos últimos 14 dias</h2><p class="panel-sub">Total no período: <strong>${esc(money(rangeTotal))}</strong></p>
    <div class="admin-chart" role="img" aria-label="Faturamento diário dos últimos 14 dias, total ${esc(money(rangeTotal))}"><div class="chart-grid">${ticks}</div><div class="chart-bars">${bars}</div></div>
    <div class="chart-axis"><span>${esc(days[0].label)}</span><span>${esc(days.at(-1).label)}</span></div>
  </div><div class="chart-tip" id="chart-tip" role="tooltip"></div>`;
}

function calendarView(list) {
  const {year, month} = calendar;
  const startOffset = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalsByDay = new Map(dailyTotals(list).map(t => [t.date, t]));
  const todayKey = dayKey(new Date().toISOString());
  const cells = Array.from({length: startOffset}, () => '<button type="button" disabled aria-hidden="true"></button>');
  for (let day = 1; day <= daysInMonth; day++) {
    const key = dayKey(new Date(year, month, day).toISOString());
    cells.push(`<button type="button" class="${totalsByDay.has(key) ? 'has-orders ' : ''}${key === todayKey ? 'is-today ' : ''}" data-day="${key}" aria-pressed="${selectedDay === key}">${day}</button>`);
  }
  const detail = ordersForDay(list, selectedDay), detailTotal = detail.reduce((sum, o) => sum + o.totalCents, 0);
  const detailDate = new Date(selectedDay + 'T12:00:00');
  const detailHtml = `<div class="admin-day-detail"><h3>${esc(detailDate.toLocaleDateString('pt-BR', {weekday: 'long', day: '2-digit', month: 'long'}))}</h3><p class="day-total">${detail.length ? `${detail.length} pedido${detail.length === 1 ? '' : 's'} · ${esc(money(detailTotal))}` : 'Nenhum pedido neste dia.'}</p>${detail.length ? `<ul class="admin-day-orders">${detail.map(o => `<li><span class="status-dot ${o.status}" aria-hidden="true"></span>${esc(o.reference)}<strong>${esc(money(o.totalCents))}</strong></li>`).join('')}</ul>` : ''}</div>`;
  return `<div class="admin-panel"><h2>Calendário</h2><p class="panel-sub">Selecione um dia para ver os pedidos.</p>
    <div class="admin-calendar-nav"><button type="button" data-cal="prev" aria-label="Mês anterior">‹</button><strong>${MONTHS[month]} de ${year}</strong><button type="button" data-cal="next" aria-label="Próximo mês">›</button></div>
    <div class="admin-calendar">${WEEKDAYS.map(w => `<span class="weekday">${w}</span>`).join('')}${cells.join('')}</div>
    ${detailHtml}
  </div>`;
}

function dashboardView() {
  const list = readOrders(), s = summary(list);
  return `<div class="admin-dash-head"><div><h1 id="admin-title" tabindex="-1">Pedidos</h1><p>Acompanhe as compras de teste e organize a produção.</p></div></div>
    <div class="admin-kpis">
      <div class="admin-kpi is-pendente"><span>Pendentes</span><strong>${s.pendentes}</strong></div>
      <div class="admin-kpi is-concluido"><span>Concluídos</span><strong>${s.concluidos}</strong></div>
      <div class="admin-kpi is-recusado"><span>Recusados</span><strong>${s.recusados}</strong></div>
      <div class="admin-kpi"><span>Faturamento total</span><strong>${esc(money(s.revenue))}</strong></div>
    </div>
    ${ordersView(list)}
    <div class="admin-panels">${chartView(list)}${calendarView(list)}</div>`;
}

function loginView() {
  return `<div class="admin-login-wrap"><form id="admin-login-form" class="admin-login-card" novalidate>
    <p class="eyebrow">ÁREA RESTRITA</p>
    <h1 id="admin-title" tabindex="-1">Entrar no painel</h1>
    <p class="lead">Acesso da Ju para acompanhar os pedidos.</p>
    <label class="admin-field"><span>E-mail</span><input name="email" type="email" autocomplete="username" required></label>
    <label class="admin-field"><span>Senha</span><input name="password" type="password" autocomplete="current-password" required></label>
    <button type="submit" class="admin-submit">Entrar</button>
    <p class="admin-error" role="alert">${esc(feedback)}</p>
  </form></div>`;
}

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
  content.innerHTML = screen === 'login' ? loginView() : screen === 'dashboard' ? dashboardView() : '<h1 id="admin-title" tabindex="-1">Carregando…</h1>';
  feedback = '';
  if (screen === 'dashboard') bindChartTooltips();
  if (focus) content.querySelector('#admin-title')?.focus({preventScroll: true});
}

async function run(message, operation) {
  if (busy) return;
  busy = true; content.setAttribute('aria-busy', 'true'); content.inert = true;
  busyDialog.start(message);
  try { await operation(); busyDialog.close(); }
  catch (error) { busyDialog.close(); feedback = error.message || 'Não foi possível continuar. Tente novamente.'; }
  finally { busy = false; content.removeAttribute('aria-busy'); content.inert = false; render(!feedback); }
}

content.addEventListener('submit', event => {
  if (event.target.id !== 'admin-login-form') return;
  event.preventDefault();
  if (busy || !event.target.reportValidity()) return;
  const {email, password} = Object.fromEntries(new FormData(event.target));
  run('Conferindo seu acesso…', async () => {
    const result = await login(email, password);
    if (!result.ok) {
      const messages = {invalid_credentials: 'E-mail ou senha incorretos.', too_many_requests: 'Muitas tentativas seguidas. Aguarde alguns minutos.', admin_not_configured: 'O painel ainda não foi configurado neste ambiente.'};
      throw new Error(messages[result.error] || 'Não foi possível entrar agora. Tente novamente.');
    }
    session = getSession(); screen = 'dashboard';
    await busyDialog.success('Acesso confirmado!');
  });
});

content.addEventListener('click', event => {
  const tabBtn = event.target.closest('[data-tab]');
  if (tabBtn) { tab = tabBtn.dataset.tab; decliningId = null; render(false); return; }

  const calBtn = event.target.closest('[data-cal]');
  if (calBtn) { let {year, month} = calendar; month += calBtn.dataset.cal === 'next' ? 1 : -1; if (month < 0) { month = 11; year--; } if (month > 11) { month = 0; year++; } calendar = {year, month}; render(false); return; }

  const dayBtn = event.target.closest('[data-day]');
  if (dayBtn && !dayBtn.disabled) { selectedDay = dayBtn.dataset.day; render(false); return; }

  const action = event.target.closest('[data-action]');
  if (action) {
    const id = action.dataset.id;
    if (action.dataset.action === 'complete') { setStatus(id, 'concluido'); announce('Pedido marcado como concluído.'); render(false); }
    if (action.dataset.action === 'reopen') { setStatus(id, 'pendente'); announce('Pedido reaberto como pendente.'); render(false); }
    if (action.dataset.action === 'decline') { decliningId = id; render(false); content.querySelector('.admin-decline-box textarea')?.focus(); }
    if (action.dataset.action === 'cancel-decline') { decliningId = null; render(false); }
    if (action.dataset.action === 'confirm-decline') { const reason = content.querySelector(`[data-order="${id}"] textarea`)?.value || ''; setStatus(id, 'recusado', {reason}); decliningId = null; announce('Pedido recusado.'); render(false); }
  }
});

// The logout button lives in the topbar (#admin-tools), outside #admin-content, so it needs its own listener.
tools.addEventListener('click', event => { if (event.target.closest('#admin-logout')) { logout(); session = null; screen = 'login'; render(); } });

content.addEventListener('input', event => { if (event.target.closest('#admin-login-form')) feedback = ''; });

(async function start() {
  session = await verifiedSession();
  screen = session ? 'dashboard' : 'login';
  render();
})();
