// "Mensagens" in Ju's panel (07/10/2026): what people wrote in "Fale com a Ju" (contato.html), saved by the server before
// the e-mail notice (api/admin/messages.js). A chat icon in the topbar and in the parts of the panel carries the number of
// new messages, asked again every minute while the panel is open and visible: only those numbers and the tab title change
// ("(3) Painel da Ju"), never the whole page, so a tracking code being typed in Expedição stays as it is.
// Novas (not opened yet) / Todas / Arquivadas. A message opens in place and counts as read. Answers go by e-mail or by
// WhatsApp (links that open Ju's own apps with a greeting ready; nothing is sent from here). Everything the visitor wrote
// is escaped and no link in it becomes clickable. admin.js shows this part and hands the clicks over, like the Fluxo de caixa.
import {messagesSummary, loadMessages, messageAction} from './admin-auth.js';
import {icon} from './icons.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const formatWhen = iso => iso ? new Date(iso).toLocaleString('pt-BR', {day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'}) : '';
const formatDay = iso => iso ? new Date(iso).toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit', year: 'numeric'}) : '';
const VIEWS = {novas: 'Novas', todas: 'Todas', arquivadas: 'Arquivadas'};
const EMPTY = {
  novas: 'Nenhuma mensagem nova. Quando alguém escrever pelo formulário de Contato, a mensagem aparece aqui e o ícone de conversa ganha um número.',
  todas: 'Nenhuma mensagem ainda. As mensagens do formulário de Contato aparecem aqui.',
  arquivadas: 'Nenhuma mensagem arquivada.'
};
const LANGUAGE = {en: 'Escreveu em inglês', es: 'Escreveu em espanhol'};
const BASE_TITLE = document.title;
const POLL_MS = 60000;

// admin.js passes run (busy dialog + re-render), announce, signedOut, render, active (the dashboard is open), busy and
// showOrder (Pedidos, at the card of one order).
let deps = null;
export function initInbox(options) { deps = options; }

let view = 'novas', list = null, nextCursor = null, openId = null, error = '';
let unread = 0, listedUnread = 0, timer = null, lastCheck = 0;
export function resetInbox() {
  clearInterval(timer); timer = null;
  view = 'novas'; list = null; nextCursor = null; openId = null; error = '';
  unread = 0; listedUnread = 0; document.title = BASE_TITLE;
}

// ── the number on the chat icons ───────────────────────────────────────
const shown = n => n > 99 ? '99+' : String(n);
const unreadLabel = n => n ? `Mensagens: ${n} ${n === 1 ? 'nova' : 'novas'}` : 'Mensagens';
const badge = () => `<span class="admin-badge" data-unread aria-hidden="true"${unread ? '' : ' hidden'}>${shown(unread)}</span>`;
// The topbar button (beside "Olá") and the label of the "Mensagens" part in the switch between parts.
export const inboxButton = () => `<button type="button" class="admin-inbox" data-open-inbox data-unread-label aria-label="${unreadLabel(unread)}" title="Mensagens">${icon('chat')}${badge()}</button>`;
export const inboxNavLabel = () => `${icon('chat')}<span>Mensagens</span>${badge()}`;
export const inboxNavAttrs = () => ` data-unread-label aria-label="${unreadLabel(unread)}"`;

function setUnread(n) {
  unread = Math.max(0, Number(n) || 0);
  for (const node of document.querySelectorAll('[data-unread]')) { node.textContent = shown(unread); node.hidden = !unread; }
  for (const node of document.querySelectorAll('[data-unread-label]')) node.setAttribute('aria-label', unreadLabel(unread));
  for (const node of document.querySelectorAll('[data-unread-count]')) node.textContent = shown(unread);
  document.title = unread ? `(${shown(unread)}) ${BASE_TITLE}` : BASE_TITLE;
  // New ones arrived while the list is open: say so, and let Ju bring them in (the list itself does not move under her).
  const fresh = document.querySelector('[data-inbox-fresh]');
  if (fresh) fresh.hidden = !(unread > listedUnread);
}

// Asks the server for the count; only the numbers change. A session that ended goes back to the login.
export async function refreshUnread() {
  if (!deps?.active()) return;
  lastCheck = Date.now();
  try { setUnread(await messagesSummary()); }
  catch (failure) {
    if (failure.code === 'unauthorized' && deps.active() && !deps.busy()) { deps.signedOut(); deps.render(); }
  }
}
// Every minute while the panel is open and visible, and at once when Ju comes back to the tab.
export function startUnreadPolling() {
  clearInterval(timer);
  timer = setInterval(() => { if (document.visibilityState === 'visible') refreshUnread(); }, POLL_MS);
  refreshUnread();
}
document.addEventListener('visibilitychange', () => {
  if (timer && document.visibilityState === 'visible' && Date.now() - lastCheck > 15000) refreshUnread();
});

// ── the list ───────────────────────────────────────────────────────────
// A failure other than a lapsed session leaves a message and the Atualizar button; the rest of the panel keeps working.
export async function loadInbox() {
  try {
    const data = await loadMessages({view});
    list = data.messages; nextCursor = data.nextCursor; error = ''; listedUnread = data.unread;
    if (!list.some(m => m.id === openId)) openId = null;
    setUnread(data.unread);
  } catch (failure) {
    if (failure.code === 'unauthorized') throw failure;
    list ||= []; error = 'Não foi possível carregar as mensagens agora. Clique em Atualizar.';
  }
}
async function loadMore() {
  const data = await loadMessages({view, cursor: nextCursor});
  const known = new Set(list.map(m => m.id));
  list.push(...data.messages.filter(m => !known.has(m.id))); nextCursor = data.nextCursor;
  setUnread(data.unread);
}

// Answers ready to edit, in the language the person wrote in (the form sends it). The quote keeps the message short.
const firstName = name => String(name || '').trim().split(/\s+/)[0] || '';
const GREETING = {
  'pt-BR': {subject: m => `Re: ${m.subjectLabel}`, hello: n => `Olá, ${n}!`, intro: 'Aqui é a Ju, do Ju, imprime pra mim? Obrigada pela sua mensagem.', bye: 'Um abraço,\nJu', wrote: (d, n) => `Em ${d}, ${n} escreveu:`, whatsapp: n => `Olá, ${n}! Aqui é a Ju, do Ju, imprime pra mim? Recebi a sua mensagem pelo site.`},
  en: {subject: () => 'Re: Ju, imprime pra mim?', hello: n => `Hi, ${n}!`, intro: 'This is Ju, from Ju, imprime pra mim? Thank you for your message.', bye: 'Best wishes,\nJu', wrote: (d, n) => `On ${d}, ${n} wrote:`, whatsapp: n => `Hi, ${n}! This is Ju, from Ju, imprime pra mim? I got your message through the website.`},
  es: {subject: () => 'Re: Ju, imprime pra mim?', hello: n => `¡Hola, ${n}!`, intro: 'Soy Ju, de Ju, imprime pra mim? Gracias por tu mensaje.', bye: 'Un abrazo,\nJu', wrote: (d, n) => `El ${d}, ${n} escribió:`, whatsapp: n => `¡Hola, ${n}! Soy Ju, de Ju, imprime pra mim? Recibí tu mensaje por el sitio.`}
};
function mailto(m) {
  const g = GREETING[m.lang] || GREETING['pt-BR'], quote = m.message.length > 500 ? `${m.message.slice(0, 500)}…` : m.message;
  const body = `${g.hello(firstName(m.name))}\n\n${g.intro}\n\n\n\n${g.bye}\n\n${g.wrote(formatDay(m.createdAt), m.name)}\n${quote.split('\n').map(line => `> ${line}`).join('\n')}`;
  const address = m.email.split('@').map(encodeURIComponent).join('@');
  return `mailto:${address}?subject=${encodeURIComponent(g.subject(m))}&body=${encodeURIComponent(body.replace(/\n/g, '\r\n'))}`;
}
const whatsappLink = m => `https://wa.me/${m.whatsapp}?text=${encodeURIComponent((GREETING[m.lang] || GREETING['pt-BR']).whatsapp(firstName(m.name)))}`;
const isNew = m => !m.readAt && !m.spam && !m.archivedAt;

function itemView(m) {
  const id = esc(m.id), open = openId === m.id, fresh = isNew(m);
  const firstLine = m.message.split('\n').find(line => line.trim()) || '';
  const tags = [m.spam && '<span class="inbox-tag is-spam">Parece spam</span>', m.archivedAt && view !== 'arquivadas' && '<span class="inbox-tag">Arquivada</span>',
    m.repliedAt && '<span class="inbox-tag is-ok">Respondida</span>', LANGUAGE[m.lang] && `<span class="inbox-tag">${LANGUAGE[m.lang]}</span>`].filter(Boolean).join('');
  const act = (action, label, extra = '') => `<button type="button" class="btn-reopen${extra}" data-inbox-act="${action}" data-id="${id}">${label}</button>`;
  return `<li class="inbox-item${fresh ? ' is-new' : ''}${m.spam ? ' is-spam' : ''}" data-message="${id}">
    <button type="button" class="inbox-head" data-inbox-toggle="${id}" aria-expanded="${open}" aria-controls="msg-${id}">
      <span class="inbox-dot" aria-hidden="true"></span>
      <span class="inbox-who"><strong>${esc(m.name)}</strong><small>${esc(m.subjectLabel)}</small>${tags}</span>
      <time class="inbox-when" datetime="${esc(m.createdAt)}">${esc(formatWhen(m.createdAt))}</time>
      <span class="inbox-preview">${fresh ? '<span class="sr-only">Nova. </span>' : ''}${esc(firstLine.slice(0, 160))}</span>
    </button>
    <div class="inbox-body" id="msg-${id}"${open ? '' : ' hidden'}>
      <p class="inbox-contact"><span translate="no">${esc(m.email)}</span>${m.phone ? ` · WhatsApp <span translate="no">${esc(m.phone)}</span>` : ''}</p>
      <div class="inbox-text">${esc(m.message)}</div>
      <div class="inbox-actions">
        <a class="inbox-reply" href="${esc(mailto(m))}" data-inbox-reply="${id}">${icon('mail')}<span>Responder por e-mail</span></a>
        ${m.whatsapp ? `<a class="inbox-reply is-whatsapp" href="${esc(whatsappLink(m))}" target="_blank" rel="noopener" data-inbox-reply="${id}">${icon('chat')}<span>Responder no WhatsApp</span><span class="sr-only"> (abre em uma nova aba)</span></a>` : ''}
        ${m.orderRef ? `<button type="button" class="btn-reopen" data-inbox-order="${esc(m.orderRef)}">Ver pedido ${esc(m.orderRef)}</button>` : ''}
      </div>
      <div class="admin-secondary inbox-secondary">
        ${m.readAt && !m.archivedAt ? act('unread', 'Marcar como não lida') : ''}
        ${m.archivedAt ? act('unarchive', 'Desarquivar') : act('archive', 'Arquivar')}
        ${m.spam ? act('notspam', 'Não é spam') : act('spam', 'É spam')}
        ${act('delete', 'Excluir', ' is-danger')}
      </div>
    </div>
  </li>`;
}

export function inboxView() {
  const pills = Object.entries(VIEWS).map(([id, label]) => `<button type="button" data-inbox-view="${id}" aria-pressed="${view === id}">${label}${id === 'novas' ? ` <span data-unread-count>${shown(unread)}</span>` : ''}</button>`).join('');
  const body = !list ? '' : list.length ? `<ul class="inbox-list">${list.map(itemView).join('')}</ul>` : `<p class="admin-empty">${EMPTY[view]}</p>`;
  return `<div class="admin-dash-head"><div><h1 id="admin-title" tabindex="-1">Mensagens</h1><p>O que as pessoas escreveram em Fale com a Ju, na página de Contato. Responda por e-mail ou pelo WhatsApp.</p></div><button type="button" class="btn-reopen" data-inbox="refresh">Atualizar</button></div>
    <p class="inbox-fresh" data-inbox-fresh${unread > listedUnread ? '' : ' hidden'}><span>Chegou mensagem nova.</span> <button type="button" class="btn-reopen" data-inbox="refresh">Mostrar agora</button></p>
    <div class="inbox-filters" role="group" aria-label="Quais mensagens mostrar">${pills}</div>
    ${error ? `<p class="admin-error" role="alert">${esc(error)}</p>` : ''}
    ${body}
    ${nextCursor ? '<button type="button" class="btn-reopen inbox-load" data-inbox="more">Ver mais mensagens</button>' : ''}`;
}

// One card drawn again in place (opened, read, answered), keeping the focus where it was.
function redraw(id) {
  const item = document.querySelector(`[data-message="${CSS.escape(id)}"]`), m = list?.find(x => x.id === id);
  if (!item || !m) return;
  const focused = document.activeElement && item.contains(document.activeElement) ? document.activeElement : null;
  const again = focused && (focused.dataset.inboxToggle ? `[data-inbox-toggle]` : focused.dataset.inboxReply ? `[data-inbox-reply]${focused.classList.contains('is-whatsapp') ? '.is-whatsapp' : ':not(.is-whatsapp)'}` : null);
  item.outerHTML = itemView(m);
  if (again) document.querySelector(`[data-message="${CSS.escape(id)}"] ${again}`)?.focus({preventScroll: true});
}
const replace = message => { const i = list.findIndex(m => m.id === message.id); if (i >= 0) list[i] = message; };
// Whether a message still belongs in the list being shown after a change (a message just opened stays in Novas until
// the list is loaded again, so it does not vanish while Ju reads it).
const stays = m => view === 'todas' || (view === 'novas' ? !m.archivedAt && !m.spam : Boolean(m.archivedAt));

// In the background (no busy dialog): opening a message marks it read, answering marks it answered.
async function quietly(action, id) {
  try {
    const answer = await messageAction(action, id);
    if (answer.message) { replace(answer.message); redraw(id); }
    listedUnread = Math.min(listedUnread, answer.unread); setUnread(answer.unread);
  } catch (failure) {
    if (failure.code === 'unauthorized' && !deps.busy()) { deps.signedOut(); deps.render(); }
  }
}

// The keyboard keeps its place: admin.js draws the part again after each action and sends the focus to the title, so once it
// is done the focus goes on — to the same message if it stays in this list, to the next one (or the one before) if it left,
// back to the button that was used (Atualizar, a filter) or to the first of the messages just brought in (Ver mais).
const toggleOf = id => id && document.querySelector(`[data-inbox-toggle="${CSS.escape(id)}"]`);
function after(done, target) { Promise.resolve(done).then(() => { const el = target(); if (el && !deps.busy()) el.focus(); }); }

const DONE = {unread: 'Mensagem marcada como não lida.', archive: 'Mensagem arquivada.', unarchive: 'Mensagem de volta à caixa de entrada.', spam: 'Mensagem marcada como spam.', notspam: 'Mensagem de volta às Novas.', delete: 'Mensagem excluída.'};
function change(action, id) {
  if (action === 'delete' && !confirm('Excluir esta mensagem de vez? Ela sai do painel e não pode ser recuperada. Use quando a pessoa pedir que os dados dela sejam apagados.')) return;
  const ids = list.map(m => m.id), at = ids.indexOf(id), neighbour = ids[at + 1] ?? ids[at - 1];
  let focusId = null;
  after(deps.run(action === 'delete' ? 'Excluindo a mensagem…' : 'Salvando…', async () => {
    try {
      const answer = await messageAction(action, id);
      focusId = answer.message && stays(answer.message) ? id : neighbour;
      if (!answer.message || !stays(answer.message)) { list = list.filter(m => m.id !== id); if (openId === id) openId = null; }
      else replace(answer.message);
      listedUnread = action === 'unread' || action === 'notspam' || action === 'unarchive' ? answer.unread : Math.min(listedUnread, answer.unread);
      setUnread(answer.unread);
      deps.announce(DONE[action]);
    } catch (failure) {
      if (failure.code === 'unauthorized') { deps.signedOut(); return; }
      if (failure.code === 'not_found') { await loadInbox().catch(() => {}); throw new Error('Essa mensagem já não existia. A lista foi atualizada.'); }
      throw new Error('Não foi possível salvar agora. Tente novamente.');
    }
  }), () => toggleOf(focusId));
}

// ── clicks handed over by admin.js ─────────────────────────────────────
export function handleInboxClick(event) {
  const find = selector => event.target.closest(selector);
  let el;
  if ((el = find('[data-inbox-view]'))) {
    if (el.dataset.inboxView === view) return true;
    view = el.dataset.inboxView; openId = null; nextCursor = null; list = null;
    after(deps.run('Abrindo as mensagens…', async () => { try { await loadInbox(); } catch (failure) { if (failure.code === 'unauthorized') { deps.signedOut(); return; } throw failure; } }),
      () => document.querySelector(`[data-inbox-view="${view}"]`));
    return true;
  }
  if ((el = find('[data-inbox]'))) {
    const more = el.dataset.inbox === 'more', head = Boolean(el.closest('.admin-dash-head')), before = list?.length || 0;
    after(deps.run(more ? 'Carregando mais mensagens…' : 'Atualizando as mensagens…', async () => {
      try { if (more) await loadMore(); else { await loadInbox(); deps.announce('Mensagens atualizadas.'); } }
      catch (failure) { if (failure.code === 'unauthorized') { deps.signedOut(); return; } throw new Error('Não foi possível carregar as mensagens agora.'); }
    }), () => more ? toggleOf(list?.[before]?.id) || document.querySelector('[data-inbox="more"]')
      : head ? document.querySelector('.admin-dash-head [data-inbox="refresh"]') : toggleOf(list?.[0]?.id));
    return true;
  }
  if ((el = find('[data-inbox-toggle]'))) {
    const id = el.dataset.inboxToggle, m = list?.find(x => x.id === id), opening = openId !== id;
    if (openId && openId !== id) {   // one open at a time
      const previous = document.querySelector(`[data-inbox-toggle="${CSS.escape(openId)}"]`);
      previous?.setAttribute('aria-expanded', 'false');
      const body = document.getElementById(`msg-${openId}`); if (body) body.hidden = true;
    }
    openId = opening ? id : null;
    el.setAttribute('aria-expanded', String(opening));
    const body = document.getElementById(`msg-${id}`); if (body) body.hidden = !opening;
    if (opening && m && !m.readAt) quietly('read', id);
    return true;
  }
  if ((el = find('[data-inbox-reply]'))) {   // the link opens Ju's e-mail or WhatsApp; the message is marked answered
    const m = list?.find(x => x.id === el.dataset.inboxReply);
    if (m && !m.repliedAt) quietly('replied', m.id);
    return true;
  }
  if ((el = find('[data-inbox-order]'))) { deps.showOrder(el.dataset.inboxOrder); return true; }
  if ((el = find('[data-inbox-act]'))) { change(el.dataset.inboxAct, el.dataset.id); return true; }
  return false;
}
