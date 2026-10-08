'use strict';
// GET/POST /api/admin/messages — "Mensagens" in Ju's panel: the contact form's messages (api/_lib/messages.js).
//   GET ?summary=1                                   → {ok, unread}   (the badge on the chat icon, every minute)
//   GET ?view=novas|todas|arquivadas&limit=&cursor=  → {ok, messages, unread, nextCursor (null on the last page)}
//   POST {action: 'read' | 'unread' | 'replied' | 'archive' | 'unarchive' | 'spam' | 'notspam' | 'delete', id}
//                                                    → {ok, message (null after delete), unread}
// Only for a signed-in admin with the second factor; every POST checks the origin and goes to the audit log (the id,
// never the text). 'delete' is for a person who asks for their data to go (LGPD); otherwise they go after 12 months.
const {adminEndpoint} = require('../_lib/admin-http');
const {createMessages, queryOf} = require('../_lib/messages');

module.exports = adminEndpoint({methods: ['GET', 'POST'], async handle({req, body, store, env, now, admin, auth, ip}) {
  const messages = createMessages({store, env, now});
  if (req.method === 'POST') {
    const {message, change} = await messages.apply(body, {actor: admin.email});
    await auth.audit(admin.id, change.action, change.detail, ip);
    return {body: {ok: true, message, unread: await messages.unread()}};
  }
  const {summary, view, limit, before} = queryOf(req.url);
  if (summary) return {body: {ok: true, unread: await messages.unread()}};
  return {body: {ok: true, ...(await messages.view({view, limit, before}))}};
}});
