// "Mensagens" (07/10/2026): the contact form saves every message before the e-mail notice, so a failed e-mail loses
// nothing; the optional WhatsApp is checked and stored encrypted; bots, floods and spam are kept out; Ju's panel reads them
// (api/admin/messages.js: the count for the chat icon, the views, the actions, each audited) — plus the shop's own number
// at the single source (api/_lib/legal.js) and the panel wiring.
// Run: node tests/messages.mjs — no network (Resend is faked), in-memory store, a clock under control.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const send = require('../api/contact/send');
const {readPhone, looksLikeSpam, LIMITS} = require('../api/_lib/contact');
const {decrypt} = require('../api/_lib/fields');
const {createMemoryStore} = require('../api/_lib/store-memory');
const totp = require('../api/_lib/totp');
const admin = Object.fromEntries(['login', 'verify', 'messages'].map(name => [name, require(`../api/admin/${name}`)]));

const SITE = 'https://site.test';
const ENV = {SITE_URL: SITE, APP_ENV: 'preview', RESEND_API_KEY: 're_test_key_123', AUTH_SECRET: 's'.repeat(40), ORDER_NOTIFY_EMAIL: 'ju@site.test', MAIL_FROM: 'Ju <oi@site.test>',
  ADMIN_EMAIL: 'ju@site.test', ADMIN_PASSWORD: 'senha-do-painel-2026'};
const MESSAGE = {name: 'Ana Souza', email: 'ana@example.com', phone: '(31) 98888-7777', subject: 'pedido', lang: 'en', message: 'Oi, Ju! Meu pedido ju-1a2b3c4d5e chegou?\nObrigada!'};
const realError = console.error; console.error = () => {};   // failed e-mails and saves are logged on purpose

function makeRes() { return {statusCode: 200, headers: {}, body: '', setHeader(key, value) { this.headers[key.toLowerCase()] = value; }, end(data) { this.body = data || ''; }, json() { return JSON.parse(this.body); }}; }
function setup({env = ENV, answer = [200, {id: 'em_1'}], store = createMemoryStore(), start = '2026-10-07T13:00:00Z'} = {}) {
  const sent = [], clock = {at: Date.parse(start)};
  const fetchImpl = async (url, init) => { sent.push({url, body: JSON.parse(init.body)}); return {ok: answer[0] < 400, status: answer[0], json: async () => answer[1]}; };
  const handler = send.create({env, store, now: () => clock.at, fetchImpl});
  const call = async ({body = MESSAGE, ip = '203.0.113.20', origin = SITE} = {}) => { const res = makeRes(); await handler({method: 'POST', headers: {origin, 'x-forwarded-for': ip}, body, socket: {}, url: '/api/contact/send'}, res); return res; };
  return {sent, call, store, clock};
}

// ── saved first, then the notice ──────────────────────────────────────
{
  const {sent, call, store} = setup();
  const ok = await call();
  assert.equal(ok.statusCode, 200); assert.deepEqual(ok.json(), {ok: true});
  const [saved] = await store.messages.list();
  assert.deepEqual([saved.name, saved.email, saved.subject, saved.status, saved.lang, saved.orderRef], ['Ana Souza', 'ana@example.com', 'pedido', 'nova', 'en', 'JU-1A2B3C4D5E'], 'saved for the panel, with the order it mentions');
  assert.equal(saved.message, 'Oi, Ju! Meu pedido ju-1a2b3c4d5e chegou?\nObrigada!', 'as written, line breaks kept');
  assert(saved.mailedAt, 'marked as e-mailed');
  assert.equal(await store.messages.countUnread(), 1, 'one new message for the chat icon');
  // The WhatsApp: encrypted (never the digits in clear), opened only with the data key.
  const blob = Buffer.from(saved.phoneEnc);
  assert(!blob.toString('latin1').includes('98888') && !blob.toString('latin1').includes('7777'), 'the number is not stored in clear');
  assert.equal(decrypt(ENV, blob), '5531988887777', 'digits with the country code');
  // The notice: to Ju, answering goes to the person, a link to the panel and the WhatsApp.
  assert.equal(sent.length, 1);
  const mail = sent[0].body;
  assert.deepEqual(mail.to, ['ju@site.test']); assert.equal(mail.reply_to, 'ana@example.com');
  assert(mail.html.includes(`${SITE}/admin.html#mensagens`) && mail.text.includes(`${SITE}/admin.html#mensagens`), 'the notice opens Mensagens in the panel');
  assert(mail.html.includes('https://wa.me/5531988887777') && mail.text.includes('WhatsApp: (31) 98888-7777'), 'and has the WhatsApp the person left');
}

// ── the e-mail fails or is not set up: the message is in the panel all the same ──
{
  for (const [label, options] of [['no inbox', {env: {...ENV, ORDER_NOTIFY_EMAIL: ''}}], ['no e-mail service', {env: {...ENV, RESEND_API_KEY: '', AUTH_SECRET: ''}}], ['Resend refused', {answer: [500, {message: 'boom'}]}], ['Resend rate limit', {answer: [429, {message: 'slow down'}]}]]) {
    const {call, store} = setup(options);
    const res = await call();
    assert.equal(res.statusCode, 200, `${label}: still 200`);
    const rows = await store.messages.list();
    assert.equal(rows.length, 1, `${label}: saved`); assert.equal(rows[0].mailedAt, null, `${label}: not marked as e-mailed`);
  }
  // The database fails: the e-mail is the only copy (without the panel link); both failing tells the person to try again.
  const broken = createMemoryStore(); broken.messages.create = async () => { throw Object.assign(new Error('db down'), {code: 'ECONNREFUSED'}); };
  const mailOnly = setup({store: broken});
  assert.equal((await mailOnly.call()).statusCode, 200, 'not saved, but e-mailed');
  assert.equal(mailOnly.sent.length, 1); assert(!mailOnly.sent[0].body.html.includes('admin.html#mensagens'), 'no link to a message that is not there');
  const nothing = setup({store: broken, answer: [500, {}]});
  const failed = await nothing.call();
  assert.equal(failed.statusCode, 503); assert.equal(failed.json().error, 'contact_unavailable', 'neither saved nor e-mailed: try again');
}

// ── bots and floods ───────────────────────────────────────────────────
{
  const {sent, call, store} = setup();
  const bot = await call({body: {...MESSAGE, website: 'http://spam.example'}});
  assert.equal(bot.statusCode, 200, 'the trap: the bot sees success…');
  assert.equal((await store.messages.list()).length, 0, '…and nothing is kept'); assert.equal(sent.length, 0);
  assert.deepEqual(LIMITS.map(([kind, max, ms]) => [kind, max, ms / 3600000]), [['ip', 5, 1], ['email', 3, 1], ['ip-day', 20, 24], ['all', 200, 24]]);
}
{
  // 20 a day from one address (5 an hour), whatever the e-mail.
  const {call, clock} = setup({start: '2026-10-07T01:00:00Z'});
  for (let i = 0; i < 20; i++) {
    if (i && i % 5 === 0) clock.at += 3600000;
    assert.equal((await call({body: {...MESSAGE, email: `pessoa${i}@example.com`}})).statusCode, 200, `message ${i + 1}`);
  }
  clock.at += 3600000;
  const blocked = await call({body: {...MESSAGE, email: 'pessoa99@example.com'}});
  assert.equal(blocked.statusCode, 429, 'the 21st of the day'); assert(Number(blocked.headers['retry-after']) > 3600, 'until the next day');
  assert.equal((await call({body: {...MESSAGE, email: 'outra@example.com'}, ip: '198.51.100.9'})).statusCode, 200, 'another address goes on');
}
{
  // 200 a day for the whole site, from any address (X-Forwarded-For can be chosen on some hosts).
  const {call, store} = setup();
  for (let i = 0; i < 200; i++) assert.equal((await call({body: {...MESSAGE, email: `p${i}@example.com`}, ip: `10.0.${Math.floor(i / 200)}.${i % 200}`})).statusCode, 200);
  const capped = await call({body: {...MESSAGE, email: 'last@example.com'}, ip: '192.0.2.250'});
  assert.equal(capped.statusCode, 429, 'the cap for the whole site'); assert.equal(capped.json().error, 'too_many_requests');
  assert.equal((await store.messages.list({limit: 200})).length, 200, 'the table never grows past it in a day');
}

// ── the optional WhatsApp ─────────────────────────────────────────────
{
  assert.equal(readPhone(''), null); assert.equal(readPhone('   '), null);
  assert.equal(readPhone('(31) 99198-1151'), '5531991981151');
  assert.equal(readPhone('+55 31 99198-1151'), '5531991981151', 'with the country code');
  assert.equal(readPhone('31 3333-4444'), '553133334444', 'a landline');
  assert.equal(readPhone('+1 415 555 0132'), '14155550132', 'from abroad, with + and the country code');
  assert.equal(readPhone('0052 55 1234 5678'), '525512345678', 'or 00');
  for (const wrong of ['9988', '99198-1151', '+55 12', '(31) 9919a-1151', '14155550132', '+0 123456789', '1'.repeat(31)]) assert.throws(() => readPhone(wrong), e => e.code === 'invalid_request' && e.field === 'phone', wrong);
  const {call, store} = setup();
  const bad = await call({body: {...MESSAGE, phone: '9988'}});
  assert.equal(bad.statusCode, 400); assert.deepEqual(bad.json(), {error: 'invalid_request', field: 'phone'});
  assert.equal((await call({body: {...MESSAGE, phone: ''}})).statusCode, 200, 'it is optional');
  assert.equal((await store.messages.list())[0].phoneEnc, null);
  assert.equal((await call({body: {...MESSAGE, lang: 'fr', email: 'b@example.com'}})).statusCode, 200);
  assert.equal((await store.messages.list()).find(m => m.email === 'b@example.com').lang, 'pt-BR', 'an unknown language is read as Portuguese');
}

// ── spam: kept as such, no e-mail, out of Novas ───────────────────────
{
  assert.equal(looksLikeSpam({name: 'Ana', message: 'Veja https://a.example e https://b.example'}), false, 'a couple of links is a person');
  assert.equal(looksLikeSpam({name: 'Ana', message: 'http://a.x http://b.x http://c.x www.d.x'}), true, 'four links');
  assert.equal(looksLikeSpam({name: 'Ana', message: 'Compre já [url=http://x.example]aqui[/url]'}), true, 'link markup');
  assert.equal(looksLikeSpam({name: 'www.seo.example', message: 'Melhore o seu site hoje mesmo'}), true, 'a link as the name');
  assert.equal(looksLikeSpam({name: 'Cadastro Rapido', message: 'cadastro rapido'}), true, 'the name again as the message');
  const {sent, call, store} = setup();
  assert.equal((await call({body: {...MESSAGE, message: 'Rank #1 http://a.example http://b.example http://c.example http://d.example'}})).statusCode, 200, 'the sender is not told');
  const [spam] = await store.messages.list();
  assert.equal(spam.status, 'spam'); assert.equal(spam.mailedAt, null);
  assert.equal(sent.length, 0, 'no e-mail for spam'); assert.equal(await store.messages.countUnread(), 0, 'not counted as new');
}

// ── the panel endpoint ─────────────────────────────────────────────────
const clock = Date.parse('2026-10-07T15:00:00Z');
async function adminCall(handler, {method = 'POST', body = {}, cookie = '', url = '/', origin = SITE} = {}) {
  const res = makeRes();
  await handler({method, headers: {...(origin ? {origin} : {}), 'x-forwarded-for': '203.0.113.7', ...(cookie ? {cookie} : {})}, body, socket: {}, url}, res);
  return res;
}
const jar = res => String(res.headers['set-cookie'] || '').split(';')[0];
{
  const store = createMemoryStore(), {call, clock: sentAt} = setup({store, start: '2026-10-07T14:00:00Z'});
  const h = Object.fromEntries(Object.entries(admin).map(([name, handler]) => [name, handler.create({env: ENV, store, now: () => clock})]));
  const get = (cookie, query = 'summary=1') => adminCall(h.messages, {method: 'GET', url: `/api/admin/messages?${query}`, cookie, origin: ''});
  const post = (cookie, body, origin = SITE) => adminCall(h.messages, {body, cookie, origin});
  // Four messages: one with a Brazilian WhatsApp, one from abroad, one without, and spam.
  for (const [i, change] of [{phone: '(31) 98888-7777'}, {name: 'Emily Carter', email: 'emily@example.com', phone: '+1 415 555 0132', subject: 'personalizado', message: 'Hi Ju! A custom cover, please?'}, {name: 'Bia "da Clínica" & Cia', email: 'bia@example.com', phone: '', subject: 'produto', message: '<script>alert(1)</script> Serve no meu Heine?'}, {name: 'Spam', email: 'spam@example.com', phone: '', message: 'http://a.x http://b.x http://c.x http://d.x'}].entries())
    { sentAt.at += 60000; assert.equal((await call({body: {...MESSAGE, ...change}, ip: `198.51.100.${i + 1}`})).statusCode, 200); }

  assert.equal((await get('')).statusCode, 401, 'signed out: nothing');
  const login = await adminCall(h.login, {body: {email: 'ju@site.test', password: 'senha-do-painel-2026'}});
  assert.equal((await get(jar(login))).statusCode, 401, 'the password alone is not enough');
  const cookie = jar(await adminCall(h.verify, {body: {code: totp.codeAt(totp.fromBase32(login.json().setup.secret), totp.stepAt(clock))}, cookie: jar(login)}));
  const summary = await get(cookie);
  assert.equal(summary.statusCode, 200); assert.deepEqual(summary.json(), {ok: true, unread: 3}, 'the chat icon: three new, the spam left out');

  // Views, newest first, a page at a time.
  const novas = (await get(cookie, 'view=novas')).json();
  assert.equal(novas.messages.length, 3); assert.equal(novas.unread, 3); assert.equal(novas.nextCursor, null);
  const [bia, emily, ana] = novas.messages;
  assert.deepEqual([bia.name, emily.name, ana.name], ['Bia "da Clínica" & Cia', 'Emily Carter', 'Ana Souza'], 'newest first; the text exactly as written (the panel escapes it)');
  assert.equal(bia.message, '<script>alert(1)</script> Serve no meu Heine?', 'the message too: the panel escapes it, the API never rewrites it');
  assert.deepEqual([ana.phone, ana.whatsapp, ana.subjectLabel, ana.orderRef, ana.lang, ana.spam, ana.mailed, ana.readAt], ['(31) 98888-7777', '5531988887777', 'Status do meu pedido', 'JU-1A2B3C4D5E', 'en', false, true, null], 'what the panel shows');
  assert.deepEqual([emily.phone, emily.whatsapp], ['+14155550132', '14155550132'], 'a number from abroad');
  assert.deepEqual([bia.phone, bia.whatsapp], [null, null], 'no number, no WhatsApp button');
  assert(!('phoneEnc' in ana) && !('status' in ana), 'nothing encrypted or internal goes to the browser');
  const todas = (await get(cookie, 'view=todas')).json();
  assert.equal(todas.messages.length, 4); assert(todas.messages.some(m => m.spam), 'Todas has the spam, marked');
  const first = (await get(cookie, 'view=todas&limit=2')).json();
  assert.equal(first.messages.length, 2); assert(first.nextCursor);
  const second = (await get(cookie, `view=todas&limit=2&cursor=${encodeURIComponent(first.nextCursor)}`)).json();
  assert.deepEqual([...first.messages, ...second.messages].map(m => m.id), todas.messages.map(m => m.id), 'the pages join without gaps or repeats');
  assert.equal(second.nextCursor, null);
  for (const query of ['view=lixo', 'view=todas&limit=0', 'view=todas&limit=101', 'view=todas&cursor=nada']) {
    const res = await get(cookie, query);
    assert.equal(res.statusCode, 400, query); assert.equal(res.json().error, 'invalid_request');
  }

  // Actions: each answers the message and the new count, and goes to the audit log (the id only).
  const act = async (action, id, expected = 200) => { const res = await post(cookie, {action, id}); assert.equal(res.statusCode, expected, `${action}: ${res.body}`); return res.json(); };
  let answer = await act('read', ana.id);
  assert.equal(answer.unread, 2); assert(answer.message.readAt); assert.equal(answer.message.readBy, 'ju@site.test', 'who opened it');
  answer = await act('unread', ana.id);
  assert.equal(answer.unread, 3); assert.equal(answer.message.readAt, null, 'back to Novas');
  answer = await act('replied', ana.id);
  assert(answer.message.repliedAt && answer.message.readAt, 'answering also opens it'); assert.equal(answer.unread, 2);
  answer = await act('archive', emily.id);
  assert(answer.message.archivedAt); assert.equal(answer.unread, 1, 'an archived message is not new');
  assert.deepEqual((await get(cookie, 'view=arquivadas')).json().messages.map(m => m.id), [emily.id]);
  assert.equal((await act('unarchive', emily.id)).message.archivedAt, null);
  answer = await act('spam', bia.id);
  assert.equal(answer.message.spam, true); assert(!(await get(cookie, 'view=novas')).json().messages.some(m => m.id === bia.id), 'spam leaves Novas');
  assert.equal((await act('notspam', bia.id)).message.spam, false);
  answer = await act('delete', bia.id);
  assert.equal(answer.message, null, 'deleted (a person asked for their data to go)');
  assert.equal((await post(cookie, {action: 'read', id: bia.id})).statusCode, 404, 'gone for good');
  assert.equal((await post(cookie, {action: 'read', id: 'nao-e-um-id'})).json().field, 'id');
  assert.equal((await post(cookie, {action: 'apagar', id: ana.id})).json().field, 'action');
  assert.equal((await post(cookie, {action: 'read', id: '00000000-0000-4000-8000-000000000000'})).statusCode, 404);
  assert.equal((await post(cookie, {action: 'read', id: ana.id}, 'https://evil.example')).statusCode, 403, 'a change from another site');
  assert.equal((await post(cookie, {action: 'read', id: ana.id}, '')).statusCode, 403, 'or without an origin');
  assert.equal((await post('', {action: 'read', id: ana.id})).statusCode, 401);
  const audit = (await store.adminAudit.list(50)).filter(a => a.action.startsWith('message_'));
  assert.deepEqual(audit.map(a => a.action).reverse(), ['message_read', 'message_unread', 'message_replied', 'message_archive', 'message_unarchive', 'message_spam', 'message_notspam', 'message_delete'], 'every change is audited');
  assert(audit.every(a => /^[0-9a-f-]{36}$/.test(a.detail) && a.ip === '203.0.113.7'), 'with the id and the address, never the text');
}

// ── the shop's number, at the single source ───────────────────────────
{
  const legal = require('../api/_lib/legal');
  assert.equal(legal.WHATSAPP, '5531991981151'); assert.equal(legal.COMPANY.phone, '(31) 99198-1151', 'the phone of the pages comes from the WhatsApp');
  assert.deepEqual(legal.contact(), {email: 'juimprimepramim@gmail.com', phone: '(31) 99198-1151', whatsapp: '5531991981151', hours: legal.COMPANY.hours});
  assert.equal(legal.pending(), false, 'nothing left to fill in: /api/health says legal "ok"');
  assert.match(read('dist/company.js'), /"whatsapp": "5531991981151"/);
  const home = JSON.parse(/<script type="application\/ld\+json">([^<]*)<\/script>/.exec(read('dist/index.html'))[1]);
  assert.equal(home.telephone, '+55-31-99198-1151', 'the number for search engines');
  assert.deepEqual(home.contactPoint, {'@type': 'ContactPoint', contactType: 'customer service', telephone: '+55-31-99198-1151', email: 'juimprimepramim@gmail.com', areaServed: 'BR', availableLanguage: ['Portuguese', 'English', 'Spanish']});
  assert.match(read('dist/contato.html'), /<meta property="og:description" content="Fale com a Ju pelo WhatsApp, pelo formulário, e-mail ou Instagram/);
  const page = read('dist/contato.html');
  assert.match(page, /<p class="contact-number" data-whatsapp-number hidden><span translate="no" data-company="phone">\(31\) 99198-1151<\/span><\/p>/, 'the number under the WhatsApp button');
  assert.match(read('dist/site-shell.js'), /\$\{icon\('chat'\)\}<span>Fale com a Ju<\/span>/, 'the phone menu with the chat icon');
  assert.match(read('dist/icons.js'), /\n {2}chat: '/);
  // customers' numbers stay theirs: the order card and the owner e-mail open the BUYER's WhatsApp
  assert.match(read('dist/admin.js'), /https:\/\/wa\.me\/55\$\{phoneDigits\}/); assert.match(read('api/_lib/order-email.js'), /wa\.me\/55\$\{/);
}

// ── the form and the panel, wired ─────────────────────────────────────
{
  const page = read('dist/contato.html'), script = read('dist/contato.js'), translations = read('dist/translations.js');
  // the label names the field and the hint describes it (not both in the name)
  assert.match(page, /<label class="contact-field"><span id="contact-phone-label">WhatsApp \(opcional\)<\/span><input name="phone" type="tel" autocomplete="tel" inputmode="tel"[^>]*aria-labelledby="contact-phone-label" aria-describedby="contact-phone-hint"><small class="contact-hint" id="contact-phone-hint">Se preferir, a Ju responde por lá\.<\/small><\/label>/);
  assert.match(script, /phone: values\.phone \|\| ''/); assert.match(script, /lang: getLanguage\(\)/);
  assert.match(script, /!phoneOk\(data\.phone\) \? 'phone'/, 'checked before sending, like the server');
  for (const text of ['WhatsApp (opcional)', 'Se preferir, a Ju responde por lá.', 'Confira o WhatsApp: com DDD, como (31) 99999-9999. De fora do Brasil, comece com + e o código do país.'])
    assert(translations.includes(`\n${text}|`), `EN/ES for: ${text}`);
  const panel = read('dist/admin.js'), part = read('dist/admin-messages.js'), client = read('dist/admin-auth.js'), css = read('dist/admin.css');
  assert.match(panel, /\['internacional', 'Envio internacional'\], \['mensagens', 'Mensagens'\]\]/, 'a part of the panel');
  assert.match(panel, /location\.hash === '#mensagens' \? 'mensagens'/, '#mensagens keeps it on reload');
  assert.match(panel, /section === 'mensagens' \? inboxView\(\)/);
  assert.match(panel, /tools\.innerHTML = `\$\{inboxButton\(\)\}/, 'the chat icon in the topbar');
  assert.match(panel, /startUnreadPolling\(\);/); assert.match(panel, /resetInbox\(\); screen = 'login'/, 'leaving the panel stops the checks');
  assert.match(part, /const POLL_MS = 60000;/); assert.match(part, /if \(document\.visibilityState === 'visible'\) refreshUnread\(\);/, 'every minute, only while visible');
  assert.match(part, /setUnread\(await messagesSummary\(\)\);/, 'the minute check changes only the numbers');
  assert.match(part, /document\.title = unread \? `\(\$\{shown\(unread\)\}\) \$\{BASE_TITLE\}` : BASE_TITLE;/, '"(3) Painel da Ju"');
  const card = part.slice(part.indexOf('function itemView('), part.indexOf('export function inboxView('));
  for (const field of ['name', 'email', 'message', 'subjectLabel', 'phone', 'orderRef']) assert.match(card, new RegExp(`esc\\(m\\.${field}\\)`), `${field} escaped`);
  assert.doesNotMatch(card, /\$\{m\.(name|email|message|subjectLabel|phone|orderRef|whatsapp|id)\}/, 'nothing the visitor wrote goes into the card raw');
  assert.match(card, /href="\$\{esc\(mailto\(m\)\)\}"/); assert.match(card, /href="\$\{esc\(whatsappLink\(m\)\)\}"/, 'the reply links are escaped too');
  assert.match(part, /<div class="inbox-text">\$\{esc\(m\.message\)\}<\/div>/, 'the text as written, never turned into links');
  assert.match(part, /confirm\('Excluir esta mensagem de vez\?/);
  // 08/10/2026 (usabilidade 13): after an action the keyboard keeps its place — the same message if it stays in the list,
  // otherwise the next one (or the one before) — instead of going back to the title; the WhatsApp answer says it opens a new tab
  assert.match(part, /neighbour = ids\[at \+ 1\] \?\? ids\[at - 1\]/); assert.match(part, /focusId = answer\.message && stays\(answer\.message\) \? id : neighbour;/);
  assert.match(part, /\}\), \(\) => toggleOf\(focusId\)\);/, 'the focus moves once the list is drawn again');
  assert.match(card, /<span>Responder no WhatsApp<\/span><span class="sr-only"> \(abre em uma nova aba\)<\/span>/);
  assert.match(client, /request\('\/api\/admin\/messages\?summary=1'/);
  assert.match(css, /\.inbox-text\{[^}]*white-space:pre-wrap/); assert.match(css, /\.admin-badge\{[^}]*font-size:12px/);
  assert.match(read('tools/dev-server.cjs'), /'order-invoice', 'messages', 'bling', 'cash', 'international-quote'\]/, 'the local server answers /api/admin/messages');
  const sql = read('db/migrations/015_mensagens.sql');
  assert.match(sql, /CREATE TABLE contact_messages \(/); assert.match(sql, /phone_enc VARBINARY\(96\) NULL/); assert.match(sql, /KEY ix_contact_messages_created \(created_at, id\)/);
  assert(read('dist/privacidade.html').includes('<li><strong>Mensagens de atendimento:</strong> as mensagens do formulário de contato ficam guardadas por 12 meses'), 'the Privacy Policy says how long');
  assert.match(read('api/_lib/store-mysql.js'), /DELETE FROM contact_messages WHERE created_at < \?', \[before\(365\)\]/);
  assert.match(read('api/_lib/store-mysql.js'), /DELETE FROM contact_messages WHERE status = 'spam' AND created_at < \?", \[before\(30\)\]/);
}

console.error = realError;
console.log('PASS: mensagens — saved before the e-mail (a failed or missing e-mail loses nothing), the WhatsApp checked and encrypted, trap, hourly and daily limits and the site cap, spam kept apart; the panel endpoint (login, count, views, pages, actions, audit, origin) and the wiring; the shop number from api/_lib/legal.js.');
