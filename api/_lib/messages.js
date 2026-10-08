'use strict';
// "Mensagens" in Ju's panel (api/admin/messages.js): what people wrote in "Fale com a Ju" (contato.html), saved by
// api/_lib/contact.js before the e-mail notice. The views (Novas: not read yet; Todas; Arquivadas), the count of new
// ones for the chat icon, and what the team does with a message. The visitor's WhatsApp is stored encrypted and only
// opened here, for the panel. Answers carry the text as it was written: the panel escapes it and never makes links.
const {decrypt} = require('./fields');
const {SUBJECTS, showPhone} = require('./contact');

const VIEWS = ['novas', 'todas', 'arquivadas'];
const ACTIONS = ['read', 'unread', 'replied', 'archive', 'unarchive', 'spam', 'notspam', 'delete'];
const PAGE = 30, MAX_PAGE = 100;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const invalid = field => Object.assign(new Error('invalid request'), {code: 'invalid_request', field});
const iso = value => value ? new Date(value).toISOString() : null;

// The cursor is the last message of a page ({createdAt, id}), opaque to the panel (like the orders list).
const encodeCursor = message => Buffer.from(JSON.stringify([new Date(message.createdAt).toISOString(), message.id])).toString('base64url');
function decodeCursor(text) {
  try {
    const [at, id] = JSON.parse(Buffer.from(String(text), 'base64url').toString('utf8')), createdAt = new Date(at);
    if (typeof at === 'string' && !Number.isNaN(createdAt.getTime()) && typeof id === 'string' && ID.test(id)) return {createdAt, id};
  } catch {}
  throw invalid('cursor');
}
// GET ?view=novas|todas|arquivadas&limit=1..100&cursor=…  (or ?summary=1 for the count alone)
function queryOf(url) {
  const query = new URL(url || '/', 'http://panel').searchParams, view = query.get('view') ?? 'novas', limit = query.get('limit'), cursor = query.get('cursor');
  if (!VIEWS.includes(view)) throw invalid('view');
  if (limit !== null && !(/^\d{1,3}$/.test(limit) && +limit >= 1 && +limit <= MAX_PAGE)) throw invalid('limit');
  return {summary: query.get('summary') === '1', view, limit: limit === null ? PAGE : +limit, before: cursor ? decodeCursor(cursor) : null};
}

// The WhatsApp opened for the panel: as read, and as digits for the wa.me link. A key that changed leaves it out.
function phoneOf(env, blob) {
  if (!blob) return {phone: null, whatsapp: null};
  try { const number = decrypt(env, blob); return /^\d{8,15}$/.test(number || '') ? {phone: showPhone(number), whatsapp: number} : {phone: null, whatsapp: null}; }
  catch (error) { console.error('messages: could not open a phone —', error.message); return {phone: null, whatsapp: null}; }
}
function toPanel(row, env) {
  return {id: row.id, name: row.name, email: row.email, ...phoneOf(env, row.phoneEnc), subject: row.subject, subjectLabel: SUBJECTS[row.subject] || 'Outro assunto',
    message: row.message, orderRef: row.orderRef || null, lang: row.lang || 'pt-BR', createdAt: iso(row.createdAt), readAt: iso(row.readAt), readBy: row.readBy || null,
    repliedAt: iso(row.repliedAt), archivedAt: iso(row.archivedAt), mailed: Boolean(row.mailedAt), spam: row.status === 'spam'};
}

function createMessages({store, env = process.env, now = () => Date.now()} = {}) {
  const unread = () => store.messages.countUnread();
  async function view({view = 'novas', limit = PAGE, before = null} = {}) {
    // One extra row says whether there is a next page, without counting the table.
    const rows = await store.messages.list({view, limit: limit + 1, before}), list = rows.slice(0, limit);
    return {messages: list.map(row => toPanel(row, env)), unread: await unread(), nextCursor: rows.length > limit ? encodeCursor(list[list.length - 1]) : null};
  }
  // One change, for the audit log: {message (null once deleted), change: {action, detail}}. The detail is the id only:
  // nothing the visitor wrote goes into the log.
  async function apply(body, {actor}) {
    const action = String(body?.action ?? ''), id = String(body?.id ?? '');
    if (!ACTIONS.includes(action)) throw invalid('action');
    if (!ID.test(id)) throw invalid('id');
    const row = await store.messages.findById(id);
    if (!row) throw Object.assign(new Error('not found'), {code: 'not_found'});
    const at = new Date(now()), opened = row.readAt ? {} : {readAt: at, readBy: actor};
    const patch = {
      read: opened, unread: {readAt: null, readBy: null}, replied: {...opened, repliedAt: at},
      archive: {...opened, archivedAt: at}, unarchive: {archivedAt: null}, spam: {status: 'spam'}, notspam: {status: 'nova'}
    }[action];
    if (action === 'delete') await store.messages.remove(id);
    const message = action === 'delete' ? null : toPanel(Object.keys(patch).length ? await store.messages.update(id, patch) : row, env);
    return {message, change: {action: `message_${action}`, detail: id}};
  }
  return {view, unread, apply};
}

module.exports = {createMessages, toPanel, queryOf, encodeCursor, decodeCursor, VIEWS, ACTIONS};
