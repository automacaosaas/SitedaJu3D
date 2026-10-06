import {login, verifyCode, currentSession, logout, loadOrders, changeStatus, retryRefund, revealDocument, retryInvoice, loadBling, blingAction, groupSecret} from './admin-auth.js';
import {listByStatus, dailyTotals, ordersForDay, summary, dayKey, replaceOrder, STATUSES} from './admin-store.js';
import qrcode from './vendor/qrcode-generator.js';
import {PRODUCTS, color} from './products.js';
import {money} from './commerce-config.js';
import {createBusyDialog} from './loading-ui.js';
import {icon} from './icons.js';
import {initCash, cashView, handleCashClick, handleCashInput, bindCash, loadCashData, hasCash, resetCash} from './admin-cash.js';
import {initIntl, intlView, handleIntlClick, handleIntlInput, resetIntl} from './admin-international.js';

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
  <p class="admin-confirm-warn">O pedido vai para a aba Recusados e <strong>o valor é estornado na hora pelo Mercado Pago</strong>, na mesma forma de pagamento. Depois do estorno, o pedido não pode mais ser reaberto.</p>
  <p class="admin-confirm-warn">O cliente recebe um e-mail avisando que o pedido não será produzido e que o valor foi estornado. O motivo não vai no e-mail.</p>
  <label class="admin-field"><span>Motivo (opcional, só a equipe vê)</span><textarea name="reason" maxlength="300" placeholder="Ex.: sem estoque da cor escolhida"></textarea></label>
  <div class="admin-confirm-actions"><button type="button" data-action="cancel-decline">Cancelar</button><button type="button" class="btn-decline" data-action="confirm-decline">Sim, recusar e estornar</button></div>
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

// A real confirmation before two steps that e-mail the buyer: "Confirmar" (it issues the NF-e, which going back to
// Pendentes does not cancel) and "Marcar como entregue" (normally the Correios tracking does it by itself).
const stepDialog = document.createElement('dialog');
stepDialog.className = 'admin-confirm';
stepDialog.setAttribute('aria-labelledby', 'step-title');
stepDialog.innerHTML = `<form method="dialog">
  <p class="admin-confirm-icon" aria-hidden="true"></p>
  <h2 id="step-title"></h2>
  <p class="admin-confirm-ref"></p>
  <p class="admin-confirm-warn" data-step-warn hidden></p>
  <p class="admin-confirm-warn" data-step-mail></p>
  <div class="admin-confirm-actions"><button type="button" data-action="cancel-step">Cancelar</button><button type="button" class="btn-complete" data-action="confirm-step"></button></div>
</form>`;
document.body.append(stepDialog);
function openStepDialog(order, step) {
  const issues = step === 'confirmado' && invoicingMode !== 'off' && !order.invoice, where = invoicingProvider === 'bling' ? 'no Bling' : 'no emissor';
  const copy = step === 'confirmado'
    ? {icon: '📦', title: 'Confirmar este pedido?', button: issues ? 'Sim, confirmar e emitir a nota' : 'Sim, confirmar',
      warn: issues ? `<strong>A nota fiscal é emitida na hora</strong> e vai para o cliente por e-mail (PDF e XML); se o emissor estiver fora do ar, ela fica na fila e sai sozinha depois. "Voltar para Pendentes" não cancela a nota: o cancelamento é feito ${where} (a Fazenda aceita em até 24 horas).` : '',
      mail: 'O pedido vai para Expedição e o cliente recebe o e-mail de pedido confirmado.'}
    : {icon: '📬', title: 'Marcar como entregue?', button: 'Sim, marcar como entregue',
      warn: `Rastreio <strong translate="no">${esc(order.trackingCode || '')}</strong>. Normalmente não precisa: quando os Correios registram a entrega, o pedido vai sozinho para Concluídos.`,
      mail: 'O cliente recebe o e-mail de pedido entregue. O pedido vai para Concluídos.'};
  Object.assign(stepDialog.dataset, {orderId: order.id, step});
  stepDialog.querySelector('.admin-confirm-icon').textContent = copy.icon;
  stepDialog.querySelector('#step-title').textContent = copy.title;
  stepDialog.querySelector('.admin-confirm-ref').textContent = `${order.reference} · ${money(order.totalCents)}`;
  const warn = stepDialog.querySelector('[data-step-warn]');
  warn.hidden = !copy.warn; warn.innerHTML = copy.warn;
  stepDialog.querySelector('[data-step-mail]').textContent = copy.mail;
  stepDialog.querySelector('[data-action="confirm-step"]').textContent = copy.button;
  stepDialog.showModal();
  stepDialog.querySelector('[data-action="cancel-step"]').focus();
}
stepDialog.addEventListener('click', event => {
  if (event.target.closest('[data-action="cancel-step"]')) stepDialog.close();
  if (event.target.closest('[data-action="confirm-step"]')) {
    const {orderId, step} = stepDialog.dataset;
    stepDialog.close();
    move(orderId, step, '', step === 'confirmado' ? 'Pedido confirmado: ele foi para Expedição.' : 'Pedido marcado como entregue.');
  }
});

// screen: loading | login | code | dashboard | offline
let screen = 'loading', session = null, busy = false, feedback = '', setup = null, orders = [];
let tab = 'pendente';
// Parts of the panel: Pedidos, Fluxo de caixa (admin-cash.js) and Envio internacional (admin-international.js). "#caixa" and
// "#internacional" in the address keep them on reload.
let section = location.hash === '#caixa' ? 'caixa' : location.hash === '#internacional' ? 'internacional' : 'pedidos';
initCash({run: (message, operation) => run(message, operation), announce, signedOut: () => signedOut(), render: focus => render(focus)});
initIntl({run: (message, operation) => run(message, operation), announce, signedOut: () => signedOut(), render: focus => render(focus)});
const now = new Date();
let calendar = {year: now.getFullYear(), month: now.getMonth()}, selectedDay = dayKey(now);

const SOURCE_LABEL = {test: 'Teste Mercado Pago', live: 'Pedido real'};
const STATUS_LABEL = {pendente: 'Pendentes', confirmado: 'Expedição', enviado: 'Enviados', concluido: 'Concluídos', recusado: 'Recusados'};
// The Correios tracking (api/_lib/tracking.js): where the package stands, in a word, and the last event.
const TRACK_STATE = {postado: 'Postado', em_transito: 'Em trânsito', saiu_para_entrega: 'Saiu para entrega', aguardando_retirada: 'Aguardando retirada', entregue: 'Entregue', problema: 'Precisa de atenção', devolvido: 'Devolvido', nao_encontrado: 'Ainda sem registro nos Correios'};
const placeText = p => p ? [p.city.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()), p.uf].filter(Boolean).join('/') : '';
function trackingStatus(o) {
  const t = o.tracking;
  // Asked but without an answer to keep (the Correios refused the query): said as it is, not as "not asked yet".
  if (!t || !t.state) return `<p class="admin-track is-waiting">${o.status !== 'enviado' ? '' : t?.checkedAt ? `A consulta aos Correios de ${esc(formatWhen(t.checkedAt))} não deu certo; o site tenta de novo sozinho em algumas horas. O motivo fica no log do servidor (linha "rastreio:").` : 'Os Correios ainda não foram consultados: o rastreio aparece aqui em algumas horas.'}</p>`;
  const last = t.last, when = last ? formatWhen(last.at) : '';
  // No event yet (the Correios do not know the code): what that means and what to check, instead of the badge again.
  const line = last ? [last.description, placeText(last.place), when].filter(Boolean).join(' · ')
    : t.state === 'nao_encontrado' ? `Consultado em ${formatWhen(t.checkedAt)}. O código costuma aparecer algumas horas depois da postagem; se não aparecer até o dia seguinte, confira se foi digitado certo.` : '';
  // A code the Correios registered before this purchase (tracking.js): another package's, so nothing was concluded or sent.
  if (t.oldCode) return `<p class="admin-track is-problema"><span class="admin-track-state">Código de outro pacote?</span><span>${esc(line)}</span><small>Os Correios registram este código antes desta compra: parece de um pacote antigo. O pedido não foi concluído e o cliente não recebeu aviso do rastreio. Confira na etiqueta e use "Corrigir o código de rastreio": o código certo vai por e-mail ao cliente.</small></p>`;
  return `<p class="admin-track is-${esc(t.state)}"><span class="admin-track-state">${esc(TRACK_STATE[t.state] || t.state)}</span><span>${esc(line)}</span>${last?.detail ? `<small>${esc(last.detail)}</small>` : ''}</p>`;
}
const INVOICED = ['confirmado', 'enviado', 'concluido'];
const TRACKING = /^[A-Z]{2}\d{9}[A-Z]{2}$/;
// The 9th digit checks the other eight (UPU S10, the Correios' standard; the server checks it too, api/_lib/orders.js):
// a mistyped or misread code is stopped here instead of e-mailing the buyer a wrong one.
const trackingOk = code => { if (!TRACKING.test(code)) return false; const rest = 11 - [8, 6, 4, 2, 3, 5, 9, 7].reduce((sum, weight, i) => sum + weight * Number(code[2 + i]), 0) % 11; return Number(code[10]) === (rest === 10 ? 0 : rest === 11 ? 5 : rest); };
const trackingProblem = code => !TRACKING.test(code) ? 'São 2 letras, 9 números e 2 letras, como AA123456785BR.' : trackingOk(code) ? '' : 'Este código não confere: algum número está trocado. Confira na etiqueta.';
const formatDay = iso => iso ? new Date(iso).toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit', year: '2-digit'}) : '';
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

// NF-e of the order: issued when Ju confirms it ("Confirmar pedido"). Shows the number and links, a note still being issued, or
// what went wrong with a retry button. A declined order that already has a note needs it cancelled at the service.
let invoicingMode = 'off';
function nfeLine(o) {
  const nfe = o.invoice;
  if (!nfe && invoicingMode !== 'off' && INVOICED.includes(o.status)) {
    // Confirmed with no note at all: before NF-e issuing was on, or reopened from Recusados. The piece cannot leave without
    // one, so the panel offers to issue it here.
    return `<div class="admin-invoice is-error admin-invoice-missing"><p><strong>Nota fiscal não emitida.</strong> Este pedido foi confirmado sem nota, e a peça não pode sair sem ela.</p><button type="button" class="btn-issue" data-action="retry-invoice" data-id="${esc(o.id)}">Emitir nota fiscal</button></div>`;
  }
  if (!nfe) return invoicingMode !== 'off' && o.status === 'pendente' ? '<p class="admin-invoice is-waiting">Nota fiscal: sai quando você confirmar o pedido.</p>' : '';
  const test = nfe.environment !== 'producao' ? ' <span class="admin-tag source-test">homologação</span>' : '';
  if (nfe.status === 'autorizada') {
    const links = [nfe.pdfUrl && `<a href="${esc(nfe.pdfUrl)}" target="_blank" rel="noopener">PDF</a>`, nfe.xmlUrl && `<a href="${esc(nfe.xmlUrl)}" target="_blank" rel="noopener">XML</a>`].filter(Boolean).join(' · ');
    const warn = o.status === 'recusado' ? '<br><strong>Pedido recusado com nota emitida:</strong> cancele a nota no emissor (a Fazenda aceita em até 24 horas).' : '';
    const notice = nfe.message ? `<br><strong>Atenção:</strong> ${esc(nfe.message)}` : '';
    return `<p class="admin-invoice ${notice ? 'is-error' : 'is-ok'}">Nota fiscal nº ${esc(nfe.number)}${nfe.series ? ` · série ${esc(nfe.series)}` : ''}${test}${links ? ` · ${links}` : ''}${notice}${warn}</p>`;
  }
  if (nfe.status === 'processando') return `<p class="admin-invoice is-waiting">Nota fiscal: emitindo…${test} Clique em Atualizar em alguns instantes.</p>`;
  // Waiting in the queue (BLING-RESILIENCIA.md): saved, goes by itself. Never an error: the order is fine. An order taken
  // back to Pendentes (or declined) took its note out of the queue; no reason yet: the first attempt is still going.
  if (nfe.status === 'fila' && !INVOICED.includes(o.status)) return o.status === 'pendente' ? '<p class="admin-invoice is-waiting">Nota fiscal: sai quando você confirmar o pedido.</p>' : '<p class="admin-invoice is-waiting">Nota fiscal não emitida.</p>';
  if (nfe.status === 'fila' && !nfe.message) return `<p class="admin-invoice is-waiting">Nota fiscal: enviando ao emissor…${test} Clique em Atualizar em alguns instantes.</p>`;
  if (nfe.status === 'fila') return `<p class="admin-invoice is-queued"><strong>Nota fiscal na fila:</strong> ${esc(nfe.message)} ${queueWhen(nfe)} <button type="button" class="admin-reveal" data-action="retry-invoice" data-id="${esc(o.id)}">Tentar agora</button></p>`;
  return `<p class="admin-invoice is-error"><strong>Nota fiscal com problema:</strong> ${esc(nfe.message || 'erro no emissor')}${INVOICED.includes(o.status) ? ` <button type="button" class="admin-reveal" data-action="retry-invoice" data-id="${esc(o.id)}">Tentar de novo</button>` : ''}</p>`;
}
// When a note in the queue goes: by itself at the next attempt, or once Ju connects or lifts the pause.
const formatHour = iso => new Date(iso).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
function queueWhen(nfe) {
  if (/Conecte|não está conectado/.test(nfe.message || '')) return 'Ela sai sozinha assim que o Bling for conectado de novo (Nota fiscal · Bling, no fim da página).';
  if (/Emissão pausada/.test(nfe.message || '')) return 'Ela sai sozinha assim que a emissão for liberada.';
  const next = nfe.nextAttemptAt && new Date(nfe.nextAttemptAt) > new Date() ? ` (próxima tentativa às ${formatHour(nfe.nextAttemptAt)})` : '';
  return `O site tenta de novo sozinho${next}; não precisa fazer nada.`;
}

// The notice at the top of Pedidos when the Bling integration needs attention (GET /api/admin/orders → integration).
let integration = null;
function integrationBanner() {
  const s = integration;
  if (!s || s.state === 'ok' && !s.waiting) return '';
  const notes = n => n === 1 ? '1 nota fiscal' : `${n} notas fiscais`;
  const queue = s.waiting ? ` ${notes(s.waiting)} na fila.` : '';
  if (s.state === 'instavel') return `<div class="admin-integration is-warn" role="status"><strong>Integração com o Bling em modo de espera devido a instabilidade externa.</strong> Seus pedidos continuam salvos com segurança.${queue} As notas saem sozinhas assim que o Bling voltar${s.retryAt ? ` (próxima tentativa às ${esc(formatHour(s.retryAt))})` : ''}. Confirmar pedidos continua funcionando normalmente.</div>`;
  if (s.state === 'expirado') return `<div class="admin-integration is-error" role="status"><strong>A conexão com o Bling expirou.</strong> Seus pedidos continuam salvos.${queue} Para as notas saírem, conecte de novo em <a href="#admin-bling-title">Nota fiscal · Bling</a>, no fim da página.</div>`;
  if (s.state === 'pausado') return `<div class="admin-integration is-error" role="status"><strong>Emissão de notas pausada:</strong> ${esc(s.pausedReason || '')}${queue} Veja em <a href="#admin-bling-title">Nota fiscal · Bling</a>.</div>`;
  if (s.state === 'desconectado' && s.waiting) return `<div class="admin-integration is-error" role="status"><strong>O Bling não está conectado.</strong>${queue} Conecte em <a href="#admin-bling-title">Nota fiscal · Bling</a>, no fim da página, e elas saem sozinhas.</div>`;
  if (s.waiting) return `<div class="admin-integration is-info" role="status">${notes(s.waiting)} na fila, saindo sozinha${s.waiting === 1 ? '' : 's'}${s.nextAttemptAt ? ` (próxima tentativa às ${esc(formatHour(s.nextAttemptAt))})` : ''}.</div>`;
  return '';
}

// "Nota fiscal · Bling": the store's connection to the NF-e service (only with NFE_PROVIDER=bling). Connecting sends
// Ju to Bling's authorization page; Bling sends her back here with a one-minute code (see start()).
let invoicingProvider = null, bling = null, blingNote = '';
const BLING_MESSAGES = {
  bling_code_invalid: 'O Bling não aceitou a autorização (ela vale um minuto). Clique em Conectar ao Bling de novo.',
  invalid_request: 'Por segurança, a conexão não foi confirmada. Clique em Conectar ao Bling de novo.',
  bling_not_configured: 'Faltam as variáveis BLING_CLIENT_ID e BLING_CLIENT_SECRET na Hostinger.',
  bling_unavailable: 'O Bling não respondeu. Tente de novo em alguns minutos.'
};
const blingMessage = code => BLING_MESSAGES[code] || 'Não foi possível falar com o Bling agora. Tente de novo.';
function naturesList(b) {
  if (b.naturesError) return `<p class="panel-sub">Não foi possível listar as naturezas de operação: ${esc(b.naturesError)}</p>`;
  if (!b.natures) return '';
  if (!b.natures.length) return '<p class="panel-sub">Nenhuma natureza de operação no Bling ainda. O contador cria a de venda.</p>';
  // Two natures, by kind of buyer (api/_lib/fiscal.js): the panel says which one each kind of buyer gets.
  const used = {nonTaxpayer: 'cliente sem IE', taxpayer: 'cliente com IE'}, ids = b.natureIds || {};
  const items = b.natures.map(n => { const kind = Object.keys(ids).find(k => ids[k] === n.id); return `<li><code translate="no">${esc(n.id)}</code> ${esc(n.description)}${kind ? ` <span class="admin-tag source-live">usada nas notas · ${used[kind] || kind}</span>` : ''}${n.active ? '' : ' <span class="admin-tag">inativa</span>'}</li>`; }).join('');
  const missing = Object.keys(used).filter(k => !ids[k]), unknown = Object.values(ids).filter(id => !b.natures.some(n => n.id === id));
  const note = missing.length === Object.keys(used).length ? 'Nenhuma natureza escolhida no site ainda: as notas só saem depois disso.' : missing.length ? `Falta escolher no site a natureza para ${missing.map(k => used[k]).join(' e ')}: essas notas só saem depois disso.` : unknown.length ? `A natureza ${unknown.join(', ')} usada pelo site não está no Bling: confira antes de confirmar pedidos.` : '';
  return `<p class="panel-sub">Naturezas de operação cadastradas no Bling (o código da natureza de venda vai nos dados fiscais do site):</p><ul class="admin-natures">${items}</ul>${note ? `<p class="admin-bling-note">${note}</p>` : ''}`;
}
function blingView() {
  if (invoicingProvider !== 'bling' || !bling) return '';
  const b = bling, note = blingNote ? `<p class="admin-bling-note" role="status">${esc(blingNote)}</p>` : '';
  const redirect = `<p class="panel-sub">Link de redirecionamento do aplicativo no Bling: <code translate="no">${esc(b.redirectUri || '')}</code></p>`;
  let body;
  if (b.error) body = '<p>Não foi possível consultar a conexão com o Bling agora. Clique em Atualizar.</p>';
  else if (!b.configured) body = `<p>Falta configurar o aplicativo do Bling: variáveis <code>BLING_CLIENT_ID</code> e <code>BLING_CLIENT_SECRET</code> na Hostinger.</p>${redirect}`;
  else if (!b.connected) body = `<p>${b.expired ? '<strong>A conexão com o Bling expirou.</strong> ' : ''}Conecte a conta do Bling para as notas fiscais saírem sozinhas quando você confirmar um pedido.</p><div class="admin-bling-actions"><button type="button" class="btn-bling" data-action="bling-connect">Conectar ao Bling</button></div>${redirect}`;
  else body = `<p>Conectado${b.connectedBy ? ` por ${esc(b.connectedBy)}` : ''} em ${esc(formatWhen(b.connectedAt))}. A conexão se renova sozinha${b.refreshExpiresAt ? ` (vale até ${esc(formatWhen(b.refreshExpiresAt))}, e abrir o painel renova)` : ''}.</p>
    ${b.unstable ? `<p class="admin-invoice is-queued"><strong>O Bling está instável${b.failingSince ? ` desde ${esc(formatWhen(b.failingSince))}` : ''}.</strong> O site parou de chamar o Bling por alguns minutos para não insistir à toa${b.retryAt ? ` e testa de novo às ${esc(formatHour(b.retryAt))}` : ''}. As notas esperam na fila e saem sozinhas.</p>` : ''}
    ${b.pausedReason ? `<p class="admin-invoice is-error"><strong>Emissão pausada:</strong> ${esc(b.pausedReason)} <button type="button" class="admin-reveal" data-action="bling-resume">Liberar a emissão</button></p>` : ''}
    ${naturesList(b)}
    <div class="admin-bling-actions"><button type="button" class="btn-reopen" data-action="bling-disconnect">Desconectar o Bling</button></div>`;
  return `<section class="admin-panel admin-bling" aria-labelledby="admin-bling-title"><h2 id="admin-bling-title" tabindex="-1">Nota fiscal · Bling</h2>${note}${body}${problemsList(b)}</section>`;
}
// The last problems with Bling (integration log): what happened and when, newest first.
const PROBLEM_KIND = {falha: 'Falha', limite: 'Limite de chamadas', disjuntor: 'Pausa automática', recuperado: 'Voltou', conexao: 'Conexão', pausa: 'Emissão pausada', incerta: 'Criação incerta', achada: 'Nota encontrada', alerta: 'Aviso por e-mail'};
function problemsList(b) {
  if (b.error || !b.problems?.length) return '';
  const items = b.problems.map(p => `<li class="is-${esc(p.kind)}"><time datetime="${esc(p.at)}">${esc(formatWhen(p.at))}</time> <strong>${esc(PROBLEM_KIND[p.kind] || p.kind)}</strong>${p.reference ? ` · <span translate="no">${esc(p.reference)}</span>` : ''} — ${esc(p.message)}</li>`).join('');
  return `<details class="admin-bling-log"><summary>Últimos acontecimentos com o Bling</summary><ul>${items}</ul></details>`;
}

const REFUND_ERRORS = {payments_off: 'os pagamentos estão desligados neste ambiente', mode_mismatch: 'o pedido é de outro ambiente (teste × real)', no_mp_order: 'o pedido não tem código do Mercado Pago', refund_rejected: 'o Mercado Pago recusou o estorno', network: 'sem resposta do Mercado Pago'};
// Refund badge of a declined order: estornado (with the date), em andamento (with a check button) or não feito (with the reason and a retry button).
function refundNote(o) {
  const state = o.refund?.state || null, id = esc(o.id);
  if (state === 'refunded') return `<p class="admin-refund refund-done">Valor estornado pelo Mercado Pago${o.refund.at ? ` em ${esc(formatWhen(o.refund.at))}` : ''}.</p>`;
  if (state === 'requested') return `<p class="admin-refund refund-wait">Estorno em andamento no Mercado Pago. <button type="button" class="btn-refund" data-action="refund-retry" data-id="${id}">Conferir estorno</button></p>`;
  if (state === 'failed') return `<p class="admin-refund refund-fail">Estorno não feito: ${esc(REFUND_ERRORS[o.refund.error] || 'o Mercado Pago não respondeu como esperado')}. Tente de novo ou estorne pelo painel do Mercado Pago. <button type="button" class="btn-refund" data-action="refund-retry" data-id="${id}">Tentar estorno de novo</button></p>`;
  return o.status === 'recusado' ? '<p class="admin-refund refund-fail">Pedido recusado antes do estorno automático: confira o estorno no painel do Mercado Pago.</p>' : '';
}
function orderCard(o) {
  const phoneDigits = String(o.customer.phone || '').replace(/\D/g, '');
  const whatsapp = /^\d{10,11}$/.test(phoneDigits) ? `<a href="https://wa.me/55${phoneDigits}" target="_blank" rel="noopener">${esc(formatPhone(phoneDigits))}</a>` : esc(o.customer.phone || '—');
  const cep = String(o.address.cep || '').replace(/^(\d{5})(\d{3})$/, '$1-$2');
  const payLabel = o.method === 'pix' ? 'Pago via Pix' : o.method === 'debit' ? 'Pago no débito' : `Pago no crédito${o.installments > 1 ? ` · ${o.installments}x` : ''}`;
  // The payment method rides a colored corner badge (icon only) instead of a text tag — quicker to scan, and its
  // color always matches the order's own status (yellow/green/red), never an extra color to learn.
  const payBadge = `<span class="admin-pay-badge status-${esc(o.status)}" title="${esc(payLabel)}">${icon(o.method === 'pix' ? 'pix' : 'card')}<span class="sr-only">${esc(payLabel)}</span></span>`;
  // Declined orders show where the automatic refund stands; once the money is going back, the order cannot be reopened.
  const refund = o.refund?.state || null, moneyBack = refund === 'refunded' || refund === 'requested';
  const refundLine = o.status === 'recusado' || refund ? refundNote(o) : '';
  // What Ju can do at each step: Pendentes → Confirmar (or Recusar); Expedição → the tracking code (typed or read by a
  // barcode scanner; or back, or Recusar); Enviados → the Correios' last event (the delivery moves the order by itself), and on
  // the side Marcar como entregue, fix the code or back; Concluídos and Recusados → Reabrir.
  const id = esc(o.id), code = o.trackingCode ? `<code translate="no">${esc(o.trackingCode)}</code>` : '';
  const trackingForm = (value, label) => `<form class="admin-tracking" data-id="${id}" novalidate><label><span>Código de rastreio dos Correios</span><input name="trackingCode" value="${esc(value)}" placeholder="AA123456785BR" maxlength="20" autocomplete="off" autocapitalize="characters" spellcheck="false" required></label><button type="submit" class="btn-ship">${label}</button><p class="admin-tracking-note" role="status"></p></form>`;
  const back = (to, label) => `<button type="button" class="btn-reopen" data-action="move" data-to="${to}" data-id="${id}">${label}</button>`;
  const steps = {
    pendente: () => `<div class="admin-order-actions"><button type="button" class="btn-complete" data-action="confirm" data-id="${id}"${moneyBack ? ' disabled' : ''}>Confirmar pedido</button><button type="button" class="btn-decline" data-action="decline" data-id="${id}">Recusar pedido</button></div>`,
    // The piece never leaves without its note: with NF-e on, the tracking code waits for the note to be authorized.
    confirmado: () => `<div class="admin-ship">${invoicingMode !== 'off' && o.invoice?.status !== 'autorizada'
      ? `<p class="admin-ship-locked" role="note"><strong>🔒 Envio bloqueado até a nota fiscal ser autorizada.</strong> A peça não pode sair sem a nota. ${!o.invoice ? 'Clique em Emitir nota fiscal, acima.' : o.invoice.status === 'erro' ? 'Resolva o problema da nota acima e clique em Tentar de novo.' : 'A nota sai sozinha; depois clique em Atualizar para liberar o rastreio.'}</p>`
      : `<p class="admin-ship-hint">Postou nos Correios? Digite, cole ou leia com o leitor o código de rastreio e clique em Confirmar envio: o pedido vai para Enviados e o cliente recebe o e-mail com o código.</p>${trackingForm('', 'Confirmar envio')}`}<div class="admin-secondary">${back('pendente', 'Voltar para Pendentes')}<button type="button" class="btn-reopen is-danger" data-action="decline" data-id="${id}">Recusar pedido</button></div></div>`,
    enviado: () => `<div class="admin-ship"><p class="admin-tracking-line">Rastreio ${code} · postado em ${esc(formatDay(o.shippedAt))}</p>${trackingStatus(o)}<details class="admin-fix"><summary>Corrigir o código de rastreio</summary>${trackingForm(o.trackingCode || '', 'Salvar o código certo')}</details><div class="admin-secondary"><button type="button" class="btn-reopen" data-action="conclude" data-id="${id}">Marcar como entregue</button>${back('confirmado', 'Voltar para Expedição')}</div></div>`,
    concluido: () => `${o.tracking?.state ? trackingStatus(o) : ''}<div class="admin-order-actions"><span class="admin-decision-note">${o.tracking?.deliveredAt ? `Entregue em ${esc(formatWhen(o.tracking.deliveredAt))}` : `Concluído em ${esc(formatWhen(o.decidedAt))}`}${code ? ` · rastreio ${code}` : ''}</span>${back('enviado', 'Reabrir')}</div>`,
    recusado: () => `<div class="admin-order-actions"><span class="admin-decision-note">Recusado em ${esc(formatWhen(o.decidedAt))}${o.declineReason ? ' · ' + esc(o.declineReason) : ''}</span>${moneyBack ? '' : back('pendente', 'Reabrir')}</div>`
  };
  const actions = refundLine + (steps[o.status] || steps.recusado)();
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
    ${o.shipping ? `<p class="admin-order-shipping"><strong>Envio</strong> ${esc(o.shipping.label)} · ${o.shipping.volumes || 1} ${(o.shipping.volumes || 1) === 1 ? 'volume' : 'volumes'} · prazo ${esc(o.shipping.days?.min)} a ${esc(o.shipping.days?.max)} dias úteis · cobrado do cliente ${esc(money(o.shipping.chargedCents))} · custo da etiqueta ${esc(money(o.shipping.costCents))}</p>` : ''}
    ${nfeLine(o)}
    ${o.notes ? `<p class="admin-order-notes">${esc(o.notes)}</p>` : ''}
    <div class="admin-order-foot"><span class="admin-order-total">${esc(money(o.totalCents))}</span>${actions}</div>
  </article>`;
}

function ordersView(list) {
  const counts = Object.fromEntries(STATUSES.map(s => [s, list.filter(o => o.status === s).length]));
  const tabsHtml = STATUSES.map(s => `<button type="button" data-tab="${s}" aria-pressed="${tab === s}">${STATUS_LABEL[s]}<span>${counts[s]}</span></button>`).join('');
  const shown = listByStatus(list, tab);
  const empty = {pendente: 'Nenhum pedido pendente por aqui. Assim que um pedido for pago, ele aparece nesta lista.', confirmado: 'Nenhum pedido pronto para envio. Os pedidos confirmados ficam aqui até você digitar o código de rastreio.', enviado: 'Nenhum pedido enviado esperando para ser concluído.', concluido: 'Nenhum pedido concluído ainda.', recusado: 'Nenhum pedido recusado.'}[tab];
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

// The switch between the two parts, and the message of an action that did not work (shown once).
function dashboardView() {
  const nav = `<nav class="admin-sections" aria-label="Partes do painel">${[['pedidos', 'Pedidos'], ['caixa', 'Fluxo de caixa'], ['internacional', 'Envio internacional']].map(([id, label]) => `<button type="button" data-section="${id}"${section === id ? ' aria-current="page"' : ''}>${label}</button>`).join('')}</nav>`;
  const error = feedback ? `<p class="admin-error admin-dash-error" role="alert">${esc(feedback)}</p>` : '';
  return nav + error + (section === 'caixa' ? cashView() : section === 'internacional' ? intlView() : ordersDashboard());
}
function ordersDashboard() {
  const s = summary(orders);
  return `<div class="admin-dash-head"><div><h1 id="admin-title" tabindex="-1">Pedidos</h1><p>Pedidos pagos, direto do banco de dados. Organize a produção e o envio.</p></div><button type="button" class="btn-reopen" data-action="refresh">Atualizar</button></div>
    ${integrationBanner()}
    <div class="admin-kpis">
      <div class="admin-kpi is-pendente"><span>Pendentes</span><strong>${s.pendentes}</strong></div>
      <div class="admin-kpi is-confirmado"><span>Expedição</span><strong>${s.confirmados}</strong></div>
      <div class="admin-kpi is-enviado"><span>Enviados</span><strong>${s.enviados}</strong></div>
      <div class="admin-kpi is-concluido"><span>Concluídos</span><strong>${s.concluidos}</strong></div>
      <div class="admin-kpi is-recusado"><span>Recusados</span><strong>${s.recusados}</strong></div>
      <div class="admin-kpi"><span>Faturamento no mês</span><strong>${esc(money(s.monthRevenue))}</strong></div>
    </div>
    ${ordersView(orders)}
    <div class="admin-panels">${chartView(orders)}${calendarView(orders)}</div>
    <div id="admin-bling-slot">${blingView()}</div>`;
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
  if (screen === 'dashboard') { if (section === 'caixa') bindCash(content); else bindChartTooltips(); }
  if (screen === 'code') content.querySelector('input[name=code]')?.focus({preventScroll: true});
  // Expedição: the first tracking field is ready for the next code (typed, pasted or read by a barcode scanner).
  else if (screen === 'dashboard' && section === 'pedidos' && tab === 'confirmado' && content.querySelector('.admin-order.status-confirmado .admin-tracking input')) content.querySelector('.admin-order.status-confirmado .admin-tracking input').focus({preventScroll: !focus});
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
function signedOut() { session = null; orders = []; setup = null; revealed.clear(); resetCash(); resetIntl(); screen = 'login'; feedback = 'Sua sessão terminou. Entre de novo.'; }

async function openDashboard() {
  const loaded = await loadOrders();
  orders = loaded.orders; invoicingMode = loaded.invoicing; invoicingProvider = loaded.provider; integration = loaded.integration;
  if (section === 'caixa') await loadCashData();
  screen = 'dashboard';
  // The Bling card comes in after the orders: the panel never waits for it. Only its own slot is drawn again, so a
  // tracking code being typed or a focused button stays as it is.
  if (invoicingProvider === 'bling') {
    loadBling().then(card => { bling = card; }, error => {
      if (error.code === 'unauthorized') { signedOut(); render(); return; }
      bling = {error: true};
    }).finally(() => { const slot = document.getElementById('admin-bling-slot'); if (slot && screen === 'dashboard') slot.innerHTML = blingView(); });
  } else bling = null;
}

// quiet: a step that e-mails nobody (going back, or the tracking code going in).
async function move(id, status, reason, done, {trackingCode, quiet = false} = {}) {
  await run('Salvando…', async () => {
    try {
      const result = await changeStatus(id, status, reason, {trackingCode});
      orders = replaceOrder(orders, result.order);
      // Declining refunds the buyer, confirming issues the NF-e, concluding sends the tracking code; each e-mails them.
      const refundText = status !== 'recusado' ? '' : result.refund === 'refunded' ? ' Valor estornado pelo Mercado Pago.' : result.refund === 'requested' ? ' Estorno em andamento no Mercado Pago.' : ' O estorno automático não deu certo: veja o aviso no pedido.';
      const nfe = result.order.invoice;
      const nfeNote = status === 'confirmado' && nfe ? (nfe.status === 'autorizada' ? ` Nota fiscal nº ${nfe.number} emitida.` : nfe.status === 'processando' || (nfe.status === 'fila' && !nfe.message) ? ' A nota fiscal está sendo emitida.' : nfe.status === 'fila' ? ' A nota fiscal entrou na fila: o emissor não respondeu agora, e ela sai sozinha depois.' : ' A nota fiscal teve um problema: veja no pedido.') : '';
      announce(quiet ? done : `${done}${refundText} ${result.mailed ? 'O cliente recebeu um e-mail.' : 'O e-mail ao cliente não saiu (envio de e-mails desligado neste ambiente).'}${nfeNote}`);
    }
    catch (error) {
      if (error.code === 'unauthorized') { signedOut(); return; }
      if (error.code === 'refunded') throw new Error('Este pedido já teve o valor estornado e não pode mais ser reaberto.');
      if (error.code === 'invalid_transition') { await openDashboard().catch(() => {}); throw new Error('Este pedido já tinha mudado de etapa. A lista foi atualizada.'); }
      if (error.code === 'invalid_request' && status === 'enviado') throw new Error('Código de rastreio inválido: confira as letras e os números na etiqueta (como AA123456785BR).');
      if (error.code === 'invoice_pending') { await openDashboard().catch(() => {}); throw new Error('A nota fiscal deste pedido ainda não foi autorizada: a peça não pode sair sem a nota. O envio é liberado assim que ela sair.'); }
      throw new Error('Não foi possível salvar agora. Tente novamente.');
    }
  });
}

content.addEventListener('submit', event => {
  event.preventDefault();
  if (busy || !event.target.reportValidity()) return;
  const data = Object.fromEntries(new FormData(event.target));
  // The tracking code of an order (Expedição, or a correction in Enviados).
  if (event.target.classList.contains('admin-tracking')) {
    const input = event.target.elements.trackingCode, code = String(data.trackingCode || '').replace(/\s+/g, '').toUpperCase();
    const problem = trackingProblem(code);
    if (problem) { input.setCustomValidity(problem); input.reportValidity(); input.addEventListener('input', () => input.setCustomValidity(''), {once: true}); return; }
    const order = orders.find(o => o.id === event.target.dataset.id);
    if (order) move(order.id, 'enviado', '', order.status === 'enviado' ? 'Código de rastreio corrigido.' : 'Envio confirmado: o pedido foi para Enviados.', {trackingCode: code, quiet: order.status === 'enviado' && !order.tracking?.oldCode});
    return;
  }
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

function openSection(id) {
  if (busy || id === section) return;
  section = id;
  history.replaceState(null, '', id === 'caixa' || id === 'internacional' ? `#${id}` : location.pathname);
  if (id === 'caixa' && !hasCash()) run('Abrindo o fluxo de caixa…', async () => { try { await loadCashData(); } catch (error) { if (error.code === 'unauthorized') { signedOut(); return; } throw error; } });
  else render();
}

content.addEventListener('click', event => {
  const sectionBtn = event.target.closest('[data-section]');
  if (sectionBtn) { openSection(sectionBtn.dataset.section); return; }
  if (section === 'caixa' && screen === 'dashboard' && handleCashClick(event)) return;
  if (section === 'internacional' && screen === 'dashboard' && handleIntlClick(event)) return;

  const tabBtn = event.target.closest('[data-tab]');
  if (tabBtn) { tab = tabBtn.dataset.tab; render(false); return; }

  const calBtn = event.target.closest('[data-cal]');
  if (calBtn) { let {year, month} = calendar; month += calBtn.dataset.cal === 'next' ? 1 : -1; if (month < 0) { month = 11; year--; } if (month > 11) { month = 0; year++; } calendar = {year, month}; render(false); return; }

  const dayBtn = event.target.closest('[data-day]');
  if (dayBtn && !dayBtn.disabled) { selectedDay = dayBtn.dataset.day; render(false); return; }

  const action = event.target.closest('[data-action]');
  if (!action) return;
  const id = action.dataset.id;
  if (action.dataset.action === 'confirm' || action.dataset.action === 'conclude') { const order = orders.find(o => o.id === id); if (order) openStepDialog(order, action.dataset.action === 'confirm' ? 'confirmado' : 'concluido'); }
  if (action.dataset.action === 'move') {
    const to = action.dataset.to, done = {pendente: 'O pedido voltou para Pendentes.', confirmado: 'O pedido voltou para Expedição.', enviado: 'O pedido foi reaberto em Enviados.'}[to];
    if (to === 'confirmado' && !confirm('Voltar este pedido para Expedição? O código de rastreio sai do pedido.')) return;
    if (done) move(id, to, '', done, {quiet: true});
  }
  if (action.dataset.action === 'refund-retry') run('Conferindo o estorno…', async () => {
    try { const result = await retryRefund(id); orders = replaceOrder(orders, result.order); announce(result.refund === 'refunded' ? 'Valor estornado pelo Mercado Pago.' : result.refund === 'requested' ? 'O estorno ainda está em andamento no Mercado Pago.' : 'O estorno ainda não deu certo. Estorne pelo painel do Mercado Pago.'); }
    catch (error) { if (error.code === 'unauthorized') { signedOut(); return; } throw new Error('Não foi possível conferir o estorno agora. Tente novamente.'); }
  });
  if (action.dataset.action === 'decline') { const order = orders.find(o => o.id === id); if (order) openDeclineDialog(order); }
  if (action.dataset.action === 'refresh') run('Atualizando os pedidos…', async () => { try { await openDashboard(); announce('Pedidos atualizados.'); } catch (error) { if (error.code === 'unauthorized') { signedOut(); return; } throw new Error('Não foi possível atualizar agora.'); } });
  if (action.dataset.action === 'retry-invoice') run('Emitindo a nota fiscal…', async () => {
    try { const order = await retryInvoice(id); orders = replaceOrder(orders, order); announce(order.invoice?.status === 'autorizada' ? `Nota fiscal nº ${order.invoice.number} emitida.` : order.invoice?.status === 'processando' || (order.invoice?.status === 'fila' && !order.invoice.message) ? 'A nota fiscal está sendo emitida.' : order.invoice?.status === 'fila' ? 'O emissor ainda não respondeu: a nota continua na fila e sai sozinha depois.' : 'A nota fiscal ainda tem um problema: veja no pedido.'); }
    catch (error) { if (error.code === 'unauthorized') { signedOut(); return; } throw new Error('Não foi possível emitir a nota agora. Tente novamente.'); }
  });
  if (action.dataset.action === 'reveal-cpf') run('Buscando o CPF…', async () => {
    try { revealed.set(id, await revealDocument(id)); announce('CPF completo exibido. A consulta fica registrada.'); }
    catch (error) { if (error.code === 'unauthorized') { signedOut(); return; } throw new Error('Não foi possível buscar o CPF agora. Tente novamente.'); }
  });
  if (action.dataset.action === 'bling-connect') run('Abrindo o Bling…', async () => {
    blingNote = '';
    try { location.assign(await blingAction('start')); }
    catch (error) { if (error.code === 'unauthorized') { signedOut(); return; } blingNote = blingMessage(error.code); }
  });
  if (action.dataset.action === 'bling-disconnect' && confirm('Desconectar o Bling? As notas fiscais param de sair até alguém conectar de novo.')) run('Desconectando o Bling…', async () => {
    blingNote = '';
    try { bling = await blingAction('disconnect'); blingNote = 'Bling desconectado.'; announce(blingNote); }
    catch (error) { if (error.code === 'unauthorized') { signedOut(); return; } blingNote = blingMessage(error.code); }
  });
  if (action.dataset.action === 'bling-resume') run('Liberando a emissão…', async () => {
    blingNote = '';
    try { bling = await blingAction('resume'); blingNote = 'Emissão de notas liberada.'; announce(blingNote); }
    catch (error) { if (error.code === 'unauthorized') { signedOut(); return; } blingNote = blingMessage(error.code); }
  });
  if (action.dataset.action === 'restart') { setup = null; screen = 'login'; render(); }
  if (action.dataset.action === 'retry') start();
});

// The logout button lives in the topbar (#admin-tools), outside #admin-content, so it needs its own listener.
tools.addEventListener('click', async event => {
  if (!event.target.closest('#admin-logout')) return;
  await logout(); session = null; orders = []; revealed.clear(); resetCash(); resetIntl(); screen = 'login'; render();
});

// Expedição: the code is typed, pasted or read by a barcode scanner (which types it and presses Enter), and nothing goes
// until "Confirmar envio" is clicked. A complete code with the right check digit says so under the field and the button
// stands out; the scanner's Enter goes to the button, not past it. A code whose check digit does not match says so at once.
const expeditionField = target => target.closest?.('.admin-order.status-confirmado .admin-tracking input[name="trackingCode"]');
const typedCode = field => field.value.replace(/\s+/g, '').toUpperCase();
content.addEventListener('input', event => {
  if (event.target.closest('#admin-login-form, #admin-code-form')) feedback = '';
  const scan = expeditionField(event.target);
  if (scan) {
    const code = typedCode(scan), ok = trackingOk(code), note = scan.form.querySelector('.admin-tracking-note');
    scan.setCustomValidity('');
    scan.form.classList.toggle('is-ready', ok);
    if (note) note.textContent = ok ? `Código ${code} conferido. Clique em Confirmar envio: o pedido vai para Enviados e o cliente recebe o e-mail com o código.` : '';
    if (!ok && TRACKING.test(code)) { scan.setCustomValidity(trackingProblem(code)); scan.reportValidity(); }
  }
  if (section === 'caixa' && screen === 'dashboard') handleCashInput(event);
  if (section === 'internacional' && screen === 'dashboard') handleIntlInput(event);
});
content.addEventListener('keydown', event => {
  const scan = expeditionField(event.target);
  if (!scan || event.key !== 'Enter') return;
  event.preventDefault();
  const problem = trackingProblem(typedCode(scan));
  if (problem) { scan.setCustomValidity(problem); scan.reportValidity(); return; }
  scan.form.querySelector('.btn-ship')?.focus();
});

// Back from Bling's authorization page (/admin.html?code=…&state=…): the code comes off the address at once and goes
// to the server as soon as the panel is open. Bling gives it one minute, so a signed-out return asks to start over.
const returned = new URLSearchParams(location.search);
let blingReturn = returned.has('state') && (returned.has('code') || returned.has('error')) ? {code: returned.get('code'), state: returned.get('state'), error: returned.get('error')} : null;
if (blingReturn) { section = 'pedidos'; history.replaceState(null, '', location.pathname); }

async function finishBling() {
  const back = blingReturn; blingReturn = null; blingNote = '';
  if (!back.code) { blingNote = back.error === 'access_denied' ? 'A conexão foi cancelada no Bling.' : 'O Bling não autorizou a conexão.'; return; }
  try { bling = await blingAction('connect', {code: back.code, state: back.state}); blingNote = 'Bling conectado. As notas fiscais saem sozinhas quando você confirmar um pedido.'; announce(blingNote); await busyDialog.success('Bling conectado!'); }
  catch (error) { if (error.code === 'unauthorized') { signedOut(); return; } blingNote = blingMessage(error.code); }
}

async function start() {
  screen = 'loading'; render(false);
  try {
    session = await currentSession();
    if (session) await openDashboard(); else screen = 'login';
  } catch (error) {
    if (error.code === 'unauthorized') { session = null; screen = 'login'; }
    else { screen = 'offline'; feedback = error.code === 'admin_unavailable' ? messageFor('admin_unavailable') : 'Não foi possível falar com o servidor. Verifique a conexão.'; }
  }
  if (blingReturn && screen === 'login') { blingReturn = null; feedback = 'Para conectar o Bling, entre no painel e clique em Conectar ao Bling de novo.'; }
  render();
  if (blingReturn && screen === 'dashboard') { await run('Conectando ao Bling…', finishBling); content.querySelector('.admin-bling')?.scrollIntoView({block: 'center'}); }
}
start();
