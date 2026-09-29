'use strict';
// GET/POST /api/admin/bling — the store's Bling connection, in the "Nota fiscal · Bling" card of the panel.
//   GET                                   → where it stands (set up, connected since/by, valid until, pause) and, when
//                                           connected, Bling's "naturezas de operação" with their ids, to fill fiscal.js.
//   POST {action: 'start'}                → {url} of Bling's authorization page (state tied to this admin session, 10 min).
//   POST {action: 'connect', code, state} → back from Bling at /admin.html with a code: exchanged for tokens.
//   POST {action: 'disconnect'}           → asks Bling to revoke and forgets the tokens.
//   POST {action: 'resume'}               → lifts a pause, once its reason was checked.
// Only with NFE_PROVIDER=bling (409 bling_off otherwise). Every change goes to the panel audit log.
const {adminEndpoint} = require('../_lib/admin-http');
const {nfeSettings, FISCAL, EXAMPLE} = require('../_lib/fiscal');
const {createBling, signState, checkState, BlingError} = require('../_lib/bling');

const fail = (code, field) => Object.assign(new Error(code), {code, ...(field ? {field} : {})});

module.exports = adminEndpoint({methods: ['GET', 'POST'], async handle({req, body, store, env, now, admin, auth, ip, token, fetchImpl}) {
  // Every answer carries the current state, with the natures when connected, so the card is complete after each action.
  const settings = nfeSettings(env);
  if (settings.provider !== 'bling') throw fail('bling_off');
  const bling = createBling({store, env, now, fetchImpl});
  const natureId = (settings.example ? EXAMPLE.fiscal : FISCAL).bling.natureId;

  async function view() {
    const status = await bling.status();
    let natures = null, naturesError = null;
    if (status.connected) { try { natures = await bling.natures(); } catch (error) { naturesError = error instanceof BlingError ? error.message : 'Falha ao consultar o Bling.'; } }
    return {ok: true, bling: {...status, natureId: String(natureId).startsWith('[PREENCHER') ? null : String(natureId), natures, naturesError}};
  }
  if (req.method === 'GET') return {body: await view()};

  const action = String(body.action || '');
  if (!['start', 'connect', 'disconnect', 'resume'].includes(action)) throw fail('invalid_request', 'action');
  if (action !== 'disconnect' && !bling.settings.configured) throw fail('bling_not_configured');
  if (action === 'start') return {body: {ok: true, url: bling.authorizationUrl(signState(env, token, now()))}};
  if (action === 'connect') {
    if (!checkState(env, token, body.state, now())) throw fail('invalid_request', 'state');
    try { await bling.connect(String(body.code || ''), {actor: admin.email}); }
    catch (error) { if (error instanceof BlingError) throw fail(error.code === 'bling_unavailable' ? 'bling_unavailable' : 'bling_code_invalid'); throw error; }
    await auth.audit(admin.id, 'bling_connected', null, ip);
  }
  if (action === 'disconnect') { await bling.disconnect(); await auth.audit(admin.id, 'bling_disconnected', null, ip); }
  if (action === 'resume') { await bling.resume(); await auth.audit(admin.id, 'bling_resumed', null, ip); }
  return {body: await view()};
}});
