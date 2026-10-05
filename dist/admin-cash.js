// "Fluxo de caixa" in Ju's panel: Visão geral (balance, the month, the chart, bills coming up), Movimentações (the list,
// search and the two quick buttons) and Contas a pagar. The data comes from /api/admin/cash; sales arrive by themselves
// from the paid orders. admin.js shows this part when "Fluxo de caixa" is chosen and hands the clicks over.
import {loadCash, cashAction} from './admin-auth.js';
import {money} from './commerce-config.js';
import {icon} from './icons.js';
import {CATEGORY_LABEL, ENTRY_CATEGORIES, MONTHS, monthKey, shortDate, monthSummary, dailySeries, monthlySeries, filterMovements, listTotals, billsView, upcomingBills, parseMoney, centsToInput} from './cash-store.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
// Scale labels: "R$ 750", "R$ 1,5 mil". The top of the chart is a round value (1, 2, 2,5 or 5 × 10ⁿ reais).
const scaleLabel = cents => new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL', maximumFractionDigits: cents >= 100000 ? 1 : 0, ...(cents >= 100000 ? {notation: 'compact'} : {})}).format(cents / 100);
const roundTop = cents => { if (!cents) return 0; const reais = cents / 100, power = 10 ** Math.floor(Math.log10(reais)); return Math.round([1, 2, 2.5, 5, 10].find(f => f * power >= reais) * power * 100); };
// "+ R$ 932,25" stays on one line (the space after the sign does not break).
const signed = cents => `${cents > 0 ? '+\u00a0' : cents < 0 ? '−\u00a0' : ''}${money(Math.abs(cents))}`;

// admin.js passes run (busy dialog + re-render), announce, signedOut and render.
let deps = null;
export function initCash(options) { deps = options; }

let cash = null, loadError = '', notice = '', tab = 'geral', periodsSet = false;
const now = new Date();
let chart = {mode: 'dia', year: now.getFullYear(), month: now.getMonth()};
const list = {year: now.getFullYear(), month: now.getMonth(), type: 'todas', query: ''};

export const hasCash = () => Boolean(cash);
export function resetCash() { cash = null; loadError = ''; notice = ''; tab = 'geral'; list.query = ''; list.type = 'todas'; periodsSet = false; }
// The chart and the list open on the shop's current month (Brasília), once.
function setPeriods() {
  if (periodsSet || !cash) return;
  const [year, month] = cash.today.split('-').map(Number);
  chart = {mode: 'dia', year, month: month - 1}; Object.assign(list, {year, month: month - 1}); periodsSet = true;
}
// A failure other than a lapsed session leaves a message and a retry button; the rest of the panel keeps working.
export async function loadCashData() {
  try { cash = await loadCash(); loadError = ''; setPeriods(); }
  catch (error) { if (error.code === 'unauthorized') throw error; loadError = 'Não foi possível carregar o fluxo de caixa agora.'; }
}

function change(message, action, payload, done, after) {
  deps.run(message, async () => {
    try { cash = await cashAction(action, payload); notice = done; deps.announce(done); after?.(); }
    catch (error) {
      if (error.code === 'unauthorized') { deps.signedOut(); return; }
      if (error.code === 'not_found') { cash = await loadCash().catch(() => cash); throw new Error('Esse item já não existia. A lista foi atualizada.'); }
      throw new Error(error.code === 'invalid_request' ? 'Algum campo não foi aceito. Confira e tente de novo.' : 'Não foi possível salvar agora. Tente novamente.');
    }
  });
}

// ── Visão geral ─────────────────────────────────────────────────────────
function overviewView() {
  const s = monthSummary(cash.movements, cash.today.slice(0, 7), cash.today), adjusted = cash.movements.some(m => m.category === 'ajuste');
  return `<div class="admin-kpis cash-kpis">
      <div class="admin-kpi cash-kpi-balance"><span>Saldo atual</span><strong>${esc(money(cash.balanceCents))}</strong><button type="button" class="cash-link" data-cash="adjust">${adjusted ? 'Ajustar saldo' : 'Informar o saldo de hoje'}</button></div>
      <div class="admin-kpi is-in"><span>Entrou este mês</span><strong>${esc(money(s.inCents))}</strong></div>
      <div class="admin-kpi is-out"><span>Saiu este mês</span><strong>${esc(money(s.outCents))}</strong></div>
      <div class="admin-kpi ${s.resultCents < 0 ? 'is-out' : 'is-in'}"><span>Resultado do mês</span><strong>${esc(signed(s.resultCents))}</strong></div>
    </div>
    ${chartView()}${upcomingView()}`;
}

function chartView() {
  const daily = chart.mode === 'dia';
  const series = daily ? dailySeries(cash.movements, chart.year, chart.month) : monthlySeries(cash.movements, chart.year);
  const max = roundTop(Math.max(0, ...series.flatMap(p => [p.inCents, p.outCents]))), scale = max || 1;
  const inSum = series.reduce((sum, p) => sum + p.inCents, 0), outSum = series.reduce((sum, p) => sum + p.outCents, 0);
  const current = daily ? cash.today : cash.today.slice(0, 7), last = series.length - 1;
  const groups = series.map(p => `<button type="button" class="cash-group${p.key === current ? ' is-today' : ''}" data-cash-point="${p.key}" data-title="${esc(p.title)}" data-in="${p.inCents}" data-out="${p.outCents}" aria-label="${esc(p.title)}: entrou ${esc(money(p.inCents))}, saiu ${esc(money(p.outCents))}"><i class="is-in" style="--v:${(p.inCents / scale).toFixed(4)}"></i><i class="is-out" style="--v:${(p.outCents / scale).toFixed(4)}"></i></button>`).join('');
  // Day labels 1, 5, 10, 15, 20, 25 and the last one; every month by name.
  const axis = series.map((p, i) => `<span>${!daily || i === 0 || ((i + 1) % 5 === 0 && i < 25) || i === last ? esc(p.label) : ''}</span>`).join('');
  const ticks = (max ? [max, max / 2, 0] : [0]).map(v => `<span style="top:${100 - (v / scale) * 100}%">${esc(scaleLabel(v))}</span>`).join('');
  const period = daily ? `${MONTHS[chart.month]} de ${chart.year}` : String(chart.year);
  const empty = cash.movements.length ? '' : '<p class="cash-note">Ainda não há movimentações. As vendas do site entram aqui sozinhas; despesas e outras entradas você lança em <strong>Movimentações</strong>.</p>';
  return `<section class="admin-panel cash-chart-panel" aria-labelledby="cash-chart-title">
    <div class="cash-chart-head"><h2 id="cash-chart-title">Entradas e saídas</h2>
      <div class="cash-mode" role="group" aria-label="Ver o gráfico"><button type="button" data-cash-mode="dia" aria-pressed="${daily}">Por dia</button><button type="button" data-cash-mode="mes" aria-pressed="${!daily}">Por mês</button></div></div>
    <div class="cash-period"><button type="button" data-cash-chart="prev" aria-label="${daily ? 'Mês anterior' : 'Ano anterior'}">‹</button><strong>${esc(period)}</strong><button type="button" data-cash-chart="next" aria-label="${daily ? 'Próximo mês' : 'Próximo ano'}">›</button></div>
    ${empty}
    <div class="cash-chart" style="--n:${series.length}" role="group" aria-label="Entradas e saídas ${daily ? 'por dia' : 'por mês'} em ${esc(period)}"><div class="chart-grid">${ticks}</div><div class="cash-bars">${groups}</div></div>
    <div class="cash-axis" style="--n:${series.length}" aria-hidden="true">${axis}</div>
    <p class="cash-legend"><span class="is-in">Entrou <strong>${esc(money(inSum))}</strong></span><span class="is-out">Saiu <strong>${esc(money(outSum))}</strong></span><span>Resultado <strong>${esc(signed(inSum - outSum))}</strong></span></p>
    ${daily ? '' : '<p class="panel-sub">Toque num mês para ver os dias dele.</p>'}
  </section><div class="chart-tip" id="cash-tip" role="tooltip"></div>`;
}

const dueText = b => b.status === 'atrasada' ? `venceu em ${shortDate(b.dueDate, true)}` : b.status === 'hoje' ? 'vence hoje' : `vence em ${shortDate(b.dueDate, true)}`;
function upcomingView() {
  const bills = upcomingBills(cash.bills, cash.today);
  if (!bills.length) return '';
  const due = bills.reduce((sum, b) => sum + b.amountCents, 0);
  const items = bills.map(b => `<li><span class="cash-upcoming-name"><strong>${esc(b.description)}</strong><small${b.status === 'pendente' ? '' : ' class="is-late"'}>${esc(dueText(b))}</small></span><span class="cash-upcoming-value">${esc(money(b.amountCents))}</span><button type="button" class="cash-status is-${b.status === 'pendente' ? 'pending' : 'late'}" data-cash="bill-toggle" data-id="${esc(b.id)}" aria-label="Marcar ${esc(b.description)} como paga">Marcar como paga</button></li>`).join('');
  return `<section class="admin-panel cash-upcoming" aria-labelledby="cash-upcoming-title"><h2 id="cash-upcoming-title">Contas para pagar</h2><p class="panel-sub">As atrasadas e as que vencem nos próximos 10 dias.</p>
    <ul class="cash-upcoming-list">${items}</ul>
    <p class="cash-forecast">Depois de pagar essas contas, o saldo fica em <strong class="${cash.balanceCents - due < 0 ? 'is-out' : ''}">${esc(money(cash.balanceCents - due))}</strong>.</p></section>`;
}

// ── Movimentações ───────────────────────────────────────────────────────
function movementRow(m, withYear) {
  const adjust = m.category === 'ajuste', kind = adjust ? 'adjust' : m.type === 'entrada' ? 'in' : 'out';
  const origin = m.source === 'pedido' ? `<span class="cash-origin">automático${m.test ? ' · pedido de teste' : ''}</span>` : m.source === 'conta' ? '<span class="cash-origin">de Contas a pagar</span>' : '';
  const remove = m.removable ? `<button type="button" class="cash-remove" data-cash="remove-entry" data-id="${esc(m.id)}" aria-label="Excluir ${esc(m.description)}" title="Excluir">${icon('trash')}</button>` : '';
  return `<tr class="is-${kind}"><td class="c-date">${esc(shortDate(m.date, withYear))}</td><td class="c-desc"><strong>${esc(m.description)}</strong>${m.detail ? `<small>${esc(m.detail)}</small>` : ''}${origin}</td><td class="c-cat">${esc(CATEGORY_LABEL[m.category] || m.category)}</td><td class="c-type"><span class="cash-type is-${kind}">${adjust ? 'Ajuste' : m.type === 'entrada' ? 'Entrada' : 'Saída'}</span></td><td class="num">${m.type === 'entrada' ? '+' : '−'} ${esc(money(m.amountCents))}</td><td class="c-act">${remove}</td></tr>`;
}
function movementsTable() {
  const searching = Boolean(list.query.trim());
  const rows = filterMovements(cash.movements, {month: monthKey(list.year, list.month), type: list.type, query: list.query});
  const where = searching ? `para “${list.query.trim()}”` : `em ${MONTHS[list.month]} de ${list.year}`;
  if (!rows.length) return `<p class="admin-empty">${searching ? 'Nada encontrado' : 'Nenhuma movimentação'} ${esc(where)}.</p>`;
  const t = listTotals(rows);
  return `<p class="cash-count">${rows.length} ${rows.length === 1 ? 'movimentação' : 'movimentações'} ${esc(where)}${searching ? ', em todos os meses' : ''}</p>
    <table class="cash-table"><thead><tr><th scope="col">Data</th><th scope="col">Descrição</th><th scope="col">Categoria</th><th scope="col">Tipo</th><th scope="col" class="num">Valor</th><th scope="col"><span class="sr-only">Excluir</span></th></tr></thead>
    <tbody>${rows.map(m => movementRow(m, searching)).join('')}</tbody>
    <tfoot><tr><td colspan="6"><span class="is-in">Entradas <strong>${esc(money(t.inCents))}</strong></span><span class="is-out">Saídas <strong>${esc(money(t.outCents))}</strong></span><span>Resultado <strong>${esc(signed(t.inCents - t.outCents))}</strong></span></td></tr></tfoot></table>`;
}
function movementsView() {
  const searching = Boolean(list.query.trim());
  const types = [['todas', 'Todas'], ['entrada', 'Entradas'], ['saida', 'Saídas']].map(([id, label]) => `<button type="button" data-cash-type="${id}" aria-pressed="${list.type === id}">${label}</button>`).join('');
  return `<div class="cash-actions"><button type="button" class="cash-add is-in" data-cash="new-entrada">+ Adicionar entrada</button><button type="button" class="cash-add is-out" data-cash="new-saida">+ Adicionar despesa</button></div>
    <div class="cash-toolbar">
      <div class="cash-period cash-list-period"${searching ? ' hidden' : ''}><button type="button" data-cash-list="prev" aria-label="Mês anterior">‹</button><strong>${esc(MONTHS[list.month])} de ${list.year}</strong><button type="button" data-cash-list="next" aria-label="Próximo mês">›</button></div>
      <label class="cash-search"><span class="sr-only">Buscar nas movimentações</span><input type="search" id="cash-search" value="${esc(list.query)}" placeholder="Buscar: filamento, Correios, pedido…" autocomplete="off"></label>
      <div class="cash-filter" role="group" aria-label="Mostrar">${types}</div>
    </div>
    <div id="cash-list">${movementsTable()}</div>`;
}

// ── Contas a pagar ──────────────────────────────────────────────────────
function billRow(b) {
  const paid = Boolean(b.paidDate), state = paid ? 'paid' : b.status === 'pendente' ? 'pending' : 'late';
  const note = paid ? `<small>paga em ${esc(shortDate(b.paidDate))}</small>` : b.status === 'atrasada' ? '<small class="is-late">atrasada</small>' : b.status === 'hoje' ? '<small class="is-late">vence hoje</small>' : '';
  return `<tr class="${paid ? 'is-paid' : ''}"><td class="c-desc"><strong>${esc(b.description)}</strong></td><td class="c-date">${esc(shortDate(b.dueDate, true))}${note}</td><td class="num">${esc(money(b.amountCents))}</td>
    <td class="c-type"><button type="button" class="cash-status is-${state}" data-cash="bill-toggle" data-id="${esc(b.id)}" aria-label="${esc(b.description)}: ${paid ? 'paga. Voltar para pendente' : 'pendente. Marcar como paga'}" title="${paid ? 'Clique para voltar para pendente' : 'Clique para marcar como paga'}">${paid ? `${icon('check')}Pago` : 'Pendente'}</button></td>
    <td class="c-act"><button type="button" class="cash-remove" data-cash="remove-bill" data-id="${esc(b.id)}" aria-label="Excluir a conta ${esc(b.description)}" title="Excluir">${icon('trash')}</button></td></tr>`;
}
function billsTabView() {
  const bills = billsView(cash.bills, cash.today), open = bills.filter(b => !b.paidDate), late = open.filter(b => b.status === 'atrasada').length;
  const summary = open.length
    ? `<p class="cash-count">Para pagar: <strong>${esc(money(open.reduce((sum, b) => sum + b.amountCents, 0)))}</strong> em ${open.length} ${open.length === 1 ? 'conta' : 'contas'}${late ? ` · <span class="is-late">${late} ${late === 1 ? 'atrasada' : 'atrasadas'}</span>` : ''}</p>`
    : '<p class="cash-count">Nenhuma conta pendente.</p>';
  const table = bills.length
    ? `<table class="cash-table cash-bills"><thead><tr><th scope="col">Conta</th><th scope="col">Vencimento</th><th scope="col" class="num">Valor</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Excluir</span></th></tr></thead><tbody>${bills.map(billRow).join('')}</tbody></table>`
    : '<p class="admin-empty">Nenhuma conta cadastrada. Use “Adicionar conta” para lembrar dos pagamentos da loja: fornecedor, aluguel, internet…</p>';
  return `<div class="cash-actions"><button type="button" class="cash-add is-out" data-cash="new-bill">+ Adicionar conta</button></div>${summary}${table}
    <p class="panel-sub cash-hint">Um clique no status marca a conta como paga (ou volta para pendente). Paga, ela entra em Movimentações como saída do dia.</p>`;
}

// ── the part as a whole ─────────────────────────────────────────────────
const TABS = [['geral', 'Visão geral'], ['movimentacoes', 'Movimentações'], ['contas', 'Contas a pagar']];
export function cashView() {
  const head = `<div class="admin-dash-head"><div><h1 id="admin-title" tabindex="-1">Fluxo de caixa</h1><p>O dinheiro que entrou e saiu da loja, dia a dia.</p></div><button type="button" class="btn-reopen" data-cash="refresh">Atualizar</button></div>`;
  if (!cash) return `${head}<p class="admin-empty">${esc(loadError || 'Carregando…')}${loadError ? ' <button type="button" class="admin-reveal" data-cash="refresh">Tentar de novo</button>' : ''}</p>`;
  const pending = cash.bills.filter(b => !b.paidDate).length;
  const tabs = TABS.map(([id, label]) => `<button type="button" data-cash-tab="${id}" aria-pressed="${tab === id}">${label}${id === 'contas' && pending ? `<span>${pending}</span>` : ''}</button>`).join('');
  const shown = notice; notice = '';
  return `${head}<div class="admin-tabs cash-tabs" role="group" aria-label="Partes do fluxo de caixa">${tabs}</div>
    ${shown ? `<p class="admin-bling-note cash-notice" role="status">${esc(shown)}</p>` : ''}
    ${tab === 'movimentacoes' ? movementsView() : tab === 'contas' ? billsTabView() : overviewView()}`;
}

// ── the add form (entrada, despesa, conta, saldo) ───────────────────────
const dialog = document.createElement('dialog');
dialog.className = 'admin-confirm cash-dialog';
dialog.setAttribute('aria-labelledby', 'cash-form-title');
document.body.append(dialog);
let formMode = null;

function openForm(mode) {
  formMode = mode;
  const kind = mode === 'entrada' || mode === 'saida' ? mode : null, bill = mode === 'bill', adjust = mode === 'adjust';
  const title = {entrada: 'Nova entrada', saida: 'Nova despesa', bill: 'Nova conta a pagar', adjust: 'Saldo de hoje'}[mode];
  const placeholder = {entrada: 'Ex.: venda na feira', saida: 'Ex.: compra de filamento', bill: 'Ex.: fornecedor de PLA'}[mode];
  const options = kind ? ENTRY_CATEGORIES[kind].map(c => `<option value="${c}">${CATEGORY_LABEL[c]}</option>`).join('') : '';
  dialog.innerHTML = `<form method="dialog" novalidate>
    <h2 id="cash-form-title">${title}</h2>
    ${adjust ? '<p class="admin-confirm-warn">Quanto dinheiro a loja tem hoje, somando conta e caixa? A diferença para o saldo do painel entra como <strong>ajuste de saldo</strong>, que não conta como entrada nem saída do mês.</p>' : `<label class="admin-field"><span>${bill ? 'Conta' : 'Descrição'}</span><input name="description" maxlength="120" required placeholder="${placeholder}" autocomplete="off"></label>`}
    <label class="admin-field"><span>${adjust ? 'Saldo de hoje' : 'Valor'}</span><span class="cash-money"><input name="amount" inputmode="decimal" required placeholder="0,00" autocomplete="off" value="${adjust ? esc(centsToInput(cash.balanceCents)) : ''}"></span></label>
    ${kind ? `<label class="admin-field"><span>Categoria</span><select name="category">${options}</select></label>` : ''}
    ${adjust ? '' : `<label class="admin-field"><span>${bill ? 'Vencimento' : 'Data'}</span><input name="date" type="date" required value="${bill ? '' : esc(cash.today)}"></label>`}
    <p class="admin-error" role="alert"></p>
    <div class="admin-confirm-actions"><button type="button" data-action="cancel-cash">Cancelar</button><button type="submit" class="${mode === 'entrada' ? 'btn-complete' : adjust ? 'btn-ink' : 'btn-decline'}">Salvar</button></div>
  </form>`;
  dialog.showModal();
  dialog.querySelector('input')?.focus();
}
dialog.addEventListener('click', event => { if (event.target.closest('[data-action="cancel-cash"]')) dialog.close(); });
dialog.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target, data = Object.fromEntries(new FormData(form)), mode = formMode;
  const say = (message, field) => { form.querySelector('.admin-error').textContent = message; form.querySelector(`[name="${field}"]`)?.focus(); };
  const amount = parseMoney(data.amount, {negative: mode === 'adjust'});
  if (mode !== 'adjust' && !String(data.description || '').trim()) return say('Escreva uma descrição.', 'description');
  if (amount === null || (mode !== 'adjust' && amount <= 0)) return say('Digite um valor, por exemplo 129,90.', 'amount');
  if (mode !== 'adjust' && !data.date) return say(mode === 'bill' ? 'Escolha o dia do vencimento.' : 'Escolha a data.', 'date');
  dialog.close();
  if (mode === 'adjust') change('Salvando o saldo…', 'adjust-balance', {balanceCents: amount}, 'Saldo atualizado.');
  else if (mode === 'bill') change('Salvando a conta…', 'add-bill', {description: data.description, amountCents: amount, dueDate: data.date}, 'Conta adicionada.');
  // The list jumps to the month of the new entry, so it is always in sight.
  else change('Salvando…', 'add-entry', {kind: mode, description: data.description, amountCents: amount, category: data.category, date: data.date}, mode === 'entrada' ? 'Entrada adicionada.' : 'Despesa adicionada.', () => { Object.assign(list, {year: Number(data.date.slice(0, 4)), month: Number(data.date.slice(5, 7)) - 1, query: ''}); });
});

// ── events handed over by admin.js ──────────────────────────────────────
const step = (period, delta) => { let {year, month} = period; month += delta; if (month < 0) { month = 11; year--; } if (month > 11) { month = 0; year++; } return {year, month}; };
export function handleCashClick(event) {
  const target = event.target, find = selector => target.closest(selector);
  let el;
  if ((el = find('[data-cash-tab]'))) { tab = el.dataset.cashTab; deps.render(false); return true; }
  if ((el = find('[data-cash-mode]'))) { chart.mode = el.dataset.cashMode; deps.render(false); return true; }
  if ((el = find('[data-cash-chart]'))) {
    const delta = el.dataset.cashChart === 'next' ? 1 : -1;
    chart = chart.mode === 'dia' ? {mode: 'dia', ...step(chart, delta)} : {...chart, year: chart.year + delta};
    deps.render(false); return true;
  }
  // By month, a month opens its days; by day, a tap only shows the values (tooltip on focus).
  if ((el = find('[data-cash-point]'))) { if (chart.mode === 'mes') { const [year, month] = el.dataset.cashPoint.split('-').map(Number); chart = {mode: 'dia', year, month: month - 1}; deps.render(false); } return true; }
  if ((el = find('[data-cash-list]'))) { Object.assign(list, step(list, el.dataset.cashList === 'next' ? 1 : -1)); deps.render(false); return true; }
  if ((el = find('[data-cash-type]'))) { list.type = el.dataset.cashType; deps.render(false); return true; }
  if (!(el = find('[data-cash]'))) return false;
  const id = el.dataset.id;
  const movement = cash?.movements.find(m => m.id === id), bill = cash?.bills.find(b => b.id === id);
  switch (el.dataset.cash) {
    case 'refresh': deps.run('Atualizando o fluxo de caixa…', async () => {
      try { cash = await loadCash(); loadError = ''; setPeriods(); deps.announce('Fluxo de caixa atualizado.'); }
      catch (error) { if (error.code === 'unauthorized') { deps.signedOut(); return; } throw new Error('Não foi possível atualizar agora.'); }
    }); break;
    case 'new-entrada': case 'new-saida': openForm(el.dataset.cash.slice(4)); break;
    case 'new-bill': openForm('bill'); break;
    case 'adjust': openForm('adjust'); break;
    case 'remove-entry': if (movement && confirm(`Excluir “${movement.description}” (${money(movement.amountCents)}) das movimentações?`)) change('Excluindo…', 'remove-entry', {id}, 'Movimentação excluída.'); break;
    case 'bill-toggle': if (bill) change('Salvando…', 'set-bill-paid', {id, paid: !bill.paidDate}, bill.paidDate ? `“${bill.description}” voltou para pendente.` : `“${bill.description}” marcada como paga. A saída entrou em Movimentações.`); break;
    case 'remove-bill': if (bill && confirm(`Excluir a conta “${bill.description}”?${bill.paidDate ? ' A saída dela também sai das movimentações.' : ''}`)) change('Excluindo…', 'remove-bill', {id}, 'Conta excluída.'); break;
  }
  return true;
}
// Search as you type: only the list is drawn again, so the field keeps the focus.
export function handleCashInput(event) {
  if (event.target.id !== 'cash-search' || !cash) return;
  list.query = event.target.value;
  document.getElementById('cash-list').innerHTML = movementsTable();
  document.querySelector('.cash-list-period')?.toggleAttribute('hidden', Boolean(list.query.trim()));
}
// Chart values on hover, on keyboard focus and on a tap.
export function bindCash(root) {
  const tip = root.querySelector('#cash-tip');
  if (!tip) return;
  const show = el => { const rect = el.getBoundingClientRect(); tip.innerHTML = `<strong>${esc(el.dataset.title)}</strong>Entrou ${esc(money(Number(el.dataset.in)))}<br>Saiu ${esc(money(Number(el.dataset.out)))}`; tip.style.left = `${rect.left + rect.width / 2}px`; tip.style.top = `${rect.top}px`; tip.classList.add('is-visible'); };
  const hide = () => tip.classList.remove('is-visible');
  root.querySelectorAll('.cash-group').forEach(el => { el.addEventListener('mouseenter', () => show(el)); el.addEventListener('mouseleave', hide); el.addEventListener('focus', () => show(el)); el.addEventListener('blur', hide); });
}
