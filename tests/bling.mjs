// Bling, the NF-e service: connecting the account from the panel (OAuth with a state tied to the admin session, tokens
// encrypted and renewed by themselves, single-use refresh tokens), the note sent to Bling from the neutral invoice
// (person or company, payment method, freight), sent once and retried on the same note, rejections kept with Bling's
// words, the environment read from the XML (a real note on the test site pauses issuing), and disconnecting.
// Run: node tests/bling.mjs — no network (tools/fake-bling.cjs plays Bling).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const fiscal = require('../api/_lib/fiscal');
const {buildInvoice} = require('../api/_lib/nfe');
const {createBling, blingSettings, signState, checkState, readable} = require('../api/_lib/bling');
const {createBlingProvider, toBling, outcome, tpAmb} = require('../api/_lib/nfe-providers/bling');
const {createInvoicing} = require('../api/_lib/invoicing');
const {createMemoryStore} = require('../api/_lib/store-memory');
const {encrypt} = require('../api/_lib/fields');
const {createFakeBling} = require('../tools/fake-bling.cjs');
const blingEndpoint = require('../api/admin/bling'), adminOrders = require('../api/admin/orders');

const fake = createFakeBling();
// BLING_REQUESTS_PER_SECOND: the pace Bling asks for (3) is checked in tests/bling-resilience.mjs; here it would only add waiting.
const ENV = {APP_ENV: 'preview', SITE_URL: 'https://site.test', NFE_PROVIDER: 'bling', NFE_EXAMPLE_DATA: '1', AUTH_SECRET: 's'.repeat(40), BLING_CLIENT_ID: fake.clientId, BLING_CLIENT_SECRET: fake.clientSecret, BLING_REQUESTS_PER_SECOND: '1000'};
const SP = {cep: '01001000', city: 'São Paulo', state: 'SP', cityCode: '3550308'};
// The site's network here: ViaCEP answers for the CEP of the orders, everything else goes to the simulated Bling.
const network = async (url, init) => String(url).includes('viacep.com.br') ? {ok: true, json: async () => ({cep: '01001-000', localidade: 'São Paulo', uf: 'SP', ibge: '3550308'})} : fake.fetchImpl(url, init);

function order(over = {}) {
  return {
    id: crypto.randomUUID(), reference: 'JU-' + crypto.randomBytes(5).toString('hex').toUpperCase(), customerId: null, source: 'test', status: 'concluido', method: 'pix', lang: 'pt-BR',
    subtotalCents: 12900 * 2, shippingCents: 1800, totalCents: 12900 * 2 + 1800,
    buyer: {name: 'Ana Souza Lima', email: 'ana@example.com', company: null}, buyerDocEnc: encrypt(ENV, '52998224725'), phoneEnc: encrypt(ENV, '31999991234'),
    shipTo: {recipient: 'Ana Souza Lima', cep: '01001000', street: 'Praça da Sé', number: '100', district: 'Sé', city: 'São Paulo', state: 'SP', complement: ''},
    items: [{productId: 'borboletoscopio', title: 'Borboletoscópio', quantity: 2, unitCents: 12900, selection: {body: 'pink', details: 'lilac'}}],
    ...over
  };
}
const built = (o, environment = 'homologacao') => buildInvoice({order: o, city: SP, environment, provider: 'bling', env: ENV, ...fiscal.EXAMPLE}).invoice;
const count = (method, path) => fake.calls.filter(c => c.method === method && c.path.startsWith(path)).length;
const creations = () => fake.calls.filter(c => c.method === 'POST' && c.path === '/nfe').length;

// ── settings, state, pure mapping ─────────────────────────────────────
{
  assert.equal(blingSettings({}).configured, false);
  assert.equal(blingSettings(ENV).redirectUri, 'https://site.test/admin.html', 'the link to register in the Bling app');
  assert.equal(blingSettings(ENV).authorizeUrl, 'https://www.bling.com.br/Api/v3/oauth/authorize');
  assert.equal(blingSettings({...ENV, BLING_AUTHORIZE_URL: 'http://localhost:8844/__fake-bling/authorize'}).authorizeUrl, 'http://localhost:8844/__fake-bling/authorize', 'the local simulator');
  assert.equal(blingSettings({...ENV, APP_ENV: 'production', BLING_AUTHORIZE_URL: 'https://evil.test/'}).authorizeUrl, 'https://www.bling.com.br/Api/v3/oauth/authorize', 'never another address in production');

  const t0 = Date.now(), state = signState(ENV, 'session-a', t0);
  assert.equal(checkState(ENV, 'session-a', state, t0 + 1000), true);
  assert.equal(checkState(ENV, 'session-b', state, t0 + 1000), false, 'another admin session cannot hand the code back');
  assert.equal(checkState(ENV, 'session-a', state, t0 + 11 * 60000), false, 'expires in 10 minutes');
  assert.equal(checkState(ENV, 'session-a', state.slice(0, -1) + (state.endsWith('A') ? 'B' : 'A'), t0), false, 'tampered');
  assert.equal(checkState(ENV, 'session-a', '', t0), false);
  assert.equal(checkState({...ENV, AUTH_SECRET: 'x'.repeat(40)}, 'session-a', state, t0), false, 'signed with the site secret');

  assert.equal(readable({error: {type: 'VALIDATION_ERROR', message: 'm', description: 'Não foi possível', fields: [{msg: 'NCM inválido', collection: [{msg: 'item 1'}]}]}}, 400), 'Não foi possível · NCM inválido · item 1');
  assert.equal(readable(null, 503), 'O Bling respondeu 503.');

  for (const s of [5, 6, 7]) assert.equal(outcome({situacao: s, numero: '10', serie: 1, chaveAcesso: '1'.repeat(44), linkPDF: 'https://b.test/a.pdf'}, 9).status, 'autorizada');
  for (const s of [3, 8, 10]) assert.equal(outcome({situacao: s}, 9).status, 'processando');
  for (const s of [1, 2, 4, 9, 11]) { const r = outcome({situacao: s}, 9); assert.equal(r.status, 'erro'); assert(r.message.length > 20, `readable message for situation ${s}`); }
  const hostile = outcome({situacao: 5, numero: '1', chaveAcesso: 'abc', linkPDF: 'javascript:alert(1)', linkDanfe: 'http://b.test/d', xml: 'data:x'}, 9);
  assert.equal(hostile.pdfUrl, null); assert.equal(hostile.xmlUrl, null); assert.equal(hostile.accessKey, null);
  assert.equal(outcome({situacao: 5, linkDanfe: 'https://b.test/d'}, 9).pdfUrl, 'https://b.test/d', 'the DANFE link when there is no PDF link');
  assert.equal(tpAmb('<ide><tpAmb>1</tpAmb></ide>'), 'producao'); assert.equal(tpAmb('<tpAmb>2</tpAmb>'), 'homologacao'); assert.equal(tpAmb(''), null);

  // The note Bling receives: a person, Pix, the freight, parcelas adding up to the total.
  const person = toBling(built(order()), '501');
  assert.equal(person.tipo, 1); assert.equal(person.naturezaOperacao.id, 1);
  assert.deepEqual({...person.contato, endereco: undefined}, {nome: 'Ana Souza Lima', tipoPessoa: 'F', numeroDocumento: '52998224725', contribuinte: 9, email: 'ana@example.com', endereco: undefined});
  assert.deepEqual(person.contato.endereco, {endereco: 'Praça da Sé', numero: '100', complemento: '', bairro: 'Sé', cep: '01001-000', municipio: 'São Paulo', uf: 'SP', pais: 'Brasil'});
  assert.equal(person.itens[0].valor, 129); assert.equal(person.itens[0].quantidade, 2); assert.equal(person.itens[0].classificacaoFiscal, '3926.90.90', 'NCM as Bling writes it'); assert.equal(person.itens[0].origem, 0);
  assert.match(person.itens[0].descricao, /^Borboletoscópio \(/);
  assert.deepEqual(person.transporte, {fretePorConta: 0, frete: 18});
  assert.equal(person.parcelas[0].valor, 276); assert.deepEqual(person.parcelas[0].formaPagamento, {id: 501});
  assert.match(person.observacoes, /Pedido nº: JU-/);
  // Dates in Brasília time, as Bling wants them: an order concluded at 21:11 on 01/10 (00:11 UTC on 02/10) is issued on 01/10.
  const evening = toBling(buildInvoice({order: order(), city: SP, environment: 'homologacao', provider: 'bling', env: ENV, ...fiscal.EXAMPLE, now: Date.UTC(2026, 9, 2, 0, 11, 5)}).invoice, null);
  assert.deepEqual([evening.dataEmissao, evening.dataOperacao, evening.parcelas[0].data], ['2026-10-01 21:11:05', '2026-10-01 21:11:05', '2026-10-01'], 'dataEmissao, dataOperacao and the installment in Brasília time');
  assert(!('desconto' in person), 'no discount, no field');
  const pixNote = toBling(built(order({totalCents: 25800 - 1290 + 1800})), '501');
  assert.equal(pixNote.desconto, 12.9, 'the Pix 5% of the pieces as the note discount'); assert.equal(pixNote.parcelas[0].valor, 263.1);
  const company = toBling(built(order({buyer: {name: 'Ana', email: 'a@b.co', company: {cnpj: '11222333000181', name: 'Clínica Olhar', stateRegistration: '0620012345678'}}})), null);
  assert.deepEqual([company.contato.tipoPessoa, company.contato.numeroDocumento, company.contato.ie, company.contato.contribuinte, company.contato.nome], ['J', '11222333000181', '0620012345678', 1, 'Clínica Olhar']);
  const noIe = toBling(built(order({buyer: {name: 'Ana', email: 'a@b.co', company: {cnpj: '11222333000181', name: 'Clínica Olhar', stateRegistration: 'ISENTO'}}})), null);
  assert.deepEqual([noIe.contato.tipoPessoa, noIe.contato.contribuinte, 'ie' in noIe.contato], ['J', 9, false], 'a company without a state registration: "Não contribuinte" in Bling (rule 2, CFOP 6107)');
  assert(!('formaPagamento' in company.parcelas[0]), 'no payment method found: Bling uses its default');
  assert.equal(built(order()).bling.natureId, '1', 'a person: the nature for non-taxpayers (other states 6107)');
  const withIe = {name: 'Ana', email: 'a@b.co', company: {cnpj: '11222333000181', name: 'Clínica Olhar', stateRegistration: '0620012345678'}};
  assert.equal(built(order({buyer: withIe})).bling.natureId, '3', 'a company with a state registration: the "contribuinte" nature (other states 6101)');
  assert.equal(built(order({buyer: {...withIe, company: {...withIe.company, stateRegistration: 'ISENTO'}}})).bling.natureId, '1', 'a company without one: the non-taxpayer nature');
  assert.equal(toBling(built(order({buyer: withIe})), null).naturezaOperacao.id, 3);
  assert(!('bling' in buildInvoice({order: order(), city: SP, environment: 'homologacao', provider: 'fake', env: ENV, ...fiscal.EXAMPLE}).invoice), 'only the Bling note carries the nature id');
}

// ── tax data with Bling: CFOP, CSOSN, PIS/COFINS and series live in Bling ──
{
  const pendingFiscal = {...fiscal.FISCAL, bling: {natureId: {nonTaxpayer: '[PREENCHER: id]', taxpayer: '[PREENCHER: id]'}}};
  const missing = fiscal.missing(pendingFiscal, {provider: 'bling'});
  assert.deepEqual(missing, ['bling.natureId.nonTaxpayer', 'bling.natureId.taxpayer'], 'each nature id is asked for');
  assert(!missing.some(p => /^(series|cfop\.|icms\.csosn|pis\.|cofins\.)/.test(p)), 'tax rules come from Bling');
  assert(!fiscal.missing(pendingFiscal, {provider: 'focusnfe'}).some(p => p.startsWith('bling.')), 'other services do not need it');
  const blocked = buildInvoice({order: order(), city: SP, environment: 'homologacao', provider: 'bling', env: ENV, fiscal: pendingFiscal});
  assert.equal(blocked.ok, false); assert(blocked.problems[0].includes('bling.natureId'), 'no note while the nature id is missing');
}

// ── panel: connecting the Bling account ───────────────────────────────
function makeRes() { return {statusCode: 200, headers: {}, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(d) { this.body = d || ''; }, json() { return JSON.parse(this.body); }}; }
async function call(handler, {method = 'POST', body = {}, cookie = '', origin = 'https://site.test'} = {}) {
  const res = makeRes();
  await handler({method, headers: {origin, 'x-forwarded-for': '203.0.113.7', ...(cookie ? {cookie} : {})}, body, socket: {}, url: '/api/admin/bling'}, res);
  return res;
}
const token = () => crypto.randomBytes(32).toString('base64url'), sha = t => crypto.createHash('sha256').update(t).digest();
const store = createMemoryStore();
let clock = Date.now();
const now = () => clock;
// A signed-in admin (second factor done), sessions opened directly in the store on the test clock.
async function adminSession(store, email = 'ju@site.test') {
  let admin = await store.admins.findByEmail(email);
  if (!admin) { admin = {id: crypto.randomUUID()}; await store.admins.create({id: admin.id, email, passwordHash: 'x', totpEnabledAt: new Date(clock)}); }
  const raw = token(); await store.adminSessions.create({tokenHash: sha(raw), adminId: admin.id, mfaAt: new Date(clock), expiresAt: new Date(clock + 3600e3)});
  return {cookie: `__Host-ju_admin=${raw}`, raw};
}
const endpoint = blingEndpoint.create({env: ENV, store, now, fetchImpl: network});
{
  const ju = await adminSession(store), other = await adminSession(store, 'pedro@site.test');
  assert.equal((await call(endpoint, {method: 'GET'})).statusCode, 401, 'panel sign-in required');
  assert.equal((await call(blingEndpoint.create({env: {...ENV, NFE_PROVIDER: 'fake'}, store, now, fetchImpl: network}), {method: 'GET', cookie: ju.cookie})).json().error, 'bling_off');
  const notSetUp = await call(blingEndpoint.create({env: {...ENV, BLING_CLIENT_SECRET: ''}, store, now, fetchImpl: network}), {body: {action: 'start'}, cookie: ju.cookie});
  assert.equal(notSetUp.statusCode, 409); assert.equal(notSetUp.json().error, 'bling_not_configured');

  const before = (await call(endpoint, {method: 'GET', cookie: ju.cookie})).json().bling;
  assert.deepEqual([before.configured, before.connected, before.expired, before.redirectUri, before.natures], [true, false, false, 'https://site.test/admin.html', null]);

  assert.equal((await call(endpoint, {body: {action: 'start'}, cookie: ju.cookie, origin: 'https://evil.test'})).statusCode, 403, 'changes only from the site itself');
  const started = (await call(endpoint, {body: {action: 'start'}, cookie: ju.cookie})).json();
  assert(started.url.startsWith('https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=fake-bling-client&state='));
  const allowed = fake.authorize(started.url);

  assert.equal((await call(endpoint, {body: {action: 'connect', code: allowed.code, state: allowed.state}, cookie: other.cookie})).json().field, 'state', 'the code goes back only with the session that asked for it');
  assert.equal((await call(endpoint, {body: {action: 'connect', code: allowed.code, state: 'x'}, cookie: ju.cookie})).json().field, 'state');
  assert.equal((await call(endpoint, {body: {action: 'dance'}, cookie: ju.cookie})).json().field, 'action');
  const connected = await call(endpoint, {body: {action: 'connect', code: allowed.code, state: allowed.state}, cookie: ju.cookie});
  assert.equal(connected.statusCode, 200);
  const status = connected.json().bling;
  assert.deepEqual([status.connected, status.connectedBy, status.pausedReason], [true, 'ju@site.test', null]);
  assert.equal(status.natures.length, 3, 'the natures come right after connecting');
  assert(Math.abs(new Date(status.refreshExpiresAt).getTime() - (clock + 30 * 86400000)) < 5000, 'refresh token good for 30 days');
  assert.equal((await call(endpoint, {body: {action: 'connect', code: allowed.code, state: allowed.state}, cookie: ju.cookie})).json().error, 'bling_code_invalid', 'a code works once');
  assert((await store.adminAudit.list()).some(a => a.action === 'bling_connected'));

  // Tokens are stored encrypted, never in clear.
  const row = await store.integrations.get('bling');
  const issued = fake.calls.filter(c => c.path.startsWith('/oauth/token')).length;
  assert(issued >= 1); assert(!Buffer.from(row.tokensEnc).toString('latin1').includes('eyJ.fake.'), 'tokens encrypted at rest');

  const listed = (await call(endpoint, {method: 'GET', cookie: ju.cookie})).json().bling;
  assert.deepEqual(listed.natures.map(n => [n.id, n.description]), [['1', 'Venda de produção do estabelecimento'], ['2', 'Remessa para conserto'], ['3', 'Venda de produção do estabelecimento – contribuinte']], "Bling's natures with their ids");
  assert.deepEqual(listed.natureIds, {nonTaxpayer: '1', taxpayer: '3'}, 'the ones the site uses, by kind of buyer');
}

// ── issuing through Bling ─────────────────────────────────────────────
const invoicing = createInvoicing({store, env: ENV, now, fetchImpl: network});
const issue = o => invoicing.issue(o, {actor: 'ju@site.test'});
{
  const pix = order();
  const note = await issue(pix);
  assert.equal(note.status, 'autorizada', 'confirmed order → note authorized');
  assert.equal(note.provider, 'bling'); assert.match(note.providerId, /^\d+$/); assert.equal(note.environment, 'homologacao'); assert.equal(note.message, null);
  assert.equal(note.accessKey.length, 44); assert(note.pdfUrl.startsWith('https://www.bling.com.br/')); assert(note.xmlUrl.startsWith('https://'));
  const sentNote = fake.notes.get(note.providerId);
  assert.equal(sentNote.body.parcelas[0].formaPagamento.id, 501, 'Pix → Bling payment method of type 17 (the active one)');
  assert(!sentNote.bling_emailed, 'Bling does not e-mail the buyer; the site does');
  const made = creations(), sends = count('POST', `/nfe/${note.providerId}/enviar`);
  assert.equal((await invoicing.issue(pix)).number, note.number, 'confirming again changes nothing');
  assert.equal(creations(), made, 'never a second note'); assert.equal(count('POST', `/nfe/${note.providerId}/enviar`), sends, 'nor a second sending');

  const card = await issue(order({method: 'card'}));
  assert.equal(fake.notes.get(card.providerId).body.parcelas[0].formaPagamento.id, 502);
  const debit = await issue(order({method: 'debit'}));
  assert.equal(fake.notes.get(debit.providerId).body.parcelas[0].formaPagamento.id, 503);
  assert.equal(count('GET', '/formas-pagamentos'), 1, 'payment methods looked up once an hour');

  // Refused by the tax authority: Bling's words are kept, with what to do. The panel cannot edit the buyer, so the fix is
  // made on the note in Bling, and the retry resends that same note as it is there, never rewritten with the order's data.
  const rejected = order({buyer: {name: 'Ana REJEITAR', email: 'ana@example.com', company: null}});
  const refused = await issue(rejected);
  assert.equal(refused.status, 'erro'); assert.match(refused.message, /^Nota recusada pela Fazenda: .*Rejeição 539/);
  assert.match(refused.message, /Corrija a nota no Bling e clique em Tentar de novo: o site reenvia a nota como ela está no Bling\.$/);
  assert.match(refused.providerId, /^\d+$/, 'the note id is kept for the retry');
  const createdBefore = creations(), putsBefore = count('PUT', `/nfe/${refused.providerId}`);
  assert.equal((await issue(rejected)).status, 'erro', 'not fixed in Bling yet: refused again');
  assert(fake.correct(refused.providerId));
  const fixed = await issue(rejected);
  assert.equal(fixed.status, 'autorizada'); assert.equal(fixed.providerId, refused.providerId, 'same note');
  assert.equal(fixed.message, null, 'the old reason goes away');
  assert.equal(creations(), createdBefore, 'no second note created');
  assert.equal(count('PUT', `/nfe/${refused.providerId}`), putsBefore, "never rewritten with the order's data");
  assert.equal(fake.notes.get(refused.providerId).body.contato.nome, 'Ana', 'the fix made in Bling is what was sent');

  // A refusal that left the note "Pendente" in Bling: the panel's last message still says it was the tax authority's.
  const pendingOrder = order();
  const pending = await issue(pendingOrder);
  Object.assign(fake.notes.get(pending.providerId), {situacao: 1, numero: null, key: null});
  await store.invoices.update(pending.id, {status: 'erro', message: 'Nota recusada pela Fazenda: 234 - Rejeicao: IE do destinatario nao vinculada ao CNPJ. Corrija a nota no Bling…'});
  assert.equal((await issue(pendingOrder)).status, 'autorizada');
  assert.equal(count('PUT', `/nfe/${pending.providerId}`), 0, 'resent as it is in Bling');

  // Never reached the tax authority (the sending broke on the way): the retry rewrites the note with the site's data.
  const unsentOrder = order();
  const unsent = await issue(unsentOrder);
  Object.assign(fake.notes.get(unsent.providerId), {situacao: 1, numero: null, key: null});
  await store.invoices.update(unsent.id, {status: 'erro', message: 'O Bling não respondeu. Tente de novo em alguns minutos.'});
  const resent = await issue(unsentOrder);
  assert.equal(resent.status, 'autorizada'); assert.equal(resent.providerId, unsent.providerId, 'same note');
  assert.equal(count('PUT', `/nfe/${unsent.providerId}`), 1, 'updated with the order before resending');

  // A note Bling shows as rejected when the panel checks it: the same instructions.
  assert.match(outcome({situacao: 4}, 9).message, /corrija a nota lá mesmo e clique em Tentar de novo: o site reenvia a nota como ela está no Bling/);

  // Waiting for the protocol: processando, then the panel check finds it authorized.
  const slow = order({buyer: {name: 'Ana DEMORAR', email: 'ana@example.com', company: null}});
  const waiting = await issue(slow);
  assert.equal(waiting.status, 'processando');
  const later = await invoicing.refresh(waiting, slow);
  assert.equal(later.status, 'autorizada'); assert(later.number);

  // Data Bling refuses on creation (a nature that does not exist there): error with Bling's message, no id.
  const wrongNature = createBlingProvider({store, env: ENV, now, fetchImpl: network});
  const refusedAtCreation = await wrongNature.emit({...built(order()), bling: {natureId: '777'}});
  assert.equal(refusedAtCreation.status, 'erro'); assert.match(refusedAtCreation.message, /Natureza de operação não encontrada/); assert.equal(refusedAtCreation.providerId, null);

  // Cancelled in Bling on purpose: the retry issues a new note.
  const cancelledOrder = order();
  const first = await issue(cancelledOrder);
  fake.notes.get(first.providerId).situacao = 2;
  await store.invoices.update(first.id, {status: 'erro', message: 'Cancelada no Bling'});   // how the panel would see it after a check
  const reissued = await invoicing.issue(cancelledOrder, {actor: 'ju'});
  assert.equal(reissued.status, 'autorizada');
  assert.notEqual(reissued.providerId, first.providerId, 'a cancelled note is replaced by a new one');
}

// ── tokens: renewal, single use, a refused refresh, the weekly keep-alive ──
{
  const bling = createBling({store, env: ENV, now, fetchImpl: network});
  const refreshes = () => fake.calls.filter(c => c.path === '/oauth/token').length;
  const start = refreshes();
  clock += 7 * 3600e3; fake.expireAccessTokens();
  const [a, b] = await Promise.all([bling.natures(), bling.natures()]);
  assert.equal(a.length, 3); assert.equal(b.length, 3);
  assert.equal(refreshes(), start + 1, 'two calls needing a new token share one renewal (refresh tokens are single-use)');

  fake.expireAccessTokens();   // Bling says the token is dead even though the site thinks it is fresh
  assert.equal((await bling.natures()).length, 3, 'a 401 renews once and retries');
  assert.equal(refreshes(), start + 2);

  assert.equal(await bling.keepAlive(), false, 'renewed recently: nothing to do');
  clock += 8 * 86400000;
  assert.equal(await bling.keepAlive(), true, 'a week without renewing: renewed on panel load');
  clock += 8 * 86400000;
  const ju = await adminSession(store), before = refreshes();
  const background = [], waitUntil = work => { background.push(work); };
  const panel = await call(adminOrders.create({env: ENV, store, now, fetchImpl: network, waitUntil}), {method: 'GET', cookie: ju.cookie});
  assert.equal(panel.json().invoicingProvider, 'bling'); assert.equal(refreshes(), before, 'the answer does not wait for Bling');
  await Promise.all(background);
  assert.equal(refreshes(), before + 1, 'opening the panel keeps the connection alive, after the answer');

  // Too many calls (429): the same call goes again twice, after a short wait, before giving up for now.
  const waits = [], patient = createBling({store, env: ENV, now, fetchImpl: network, sleep: async ms => { waits.push(ms); }});
  const tries = () => fake.calls.filter(c => c.path.startsWith('/naturezas-operacoes')).length, triedBefore = tries();
  fake.state.tooManyRequests = true;
  await assert.rejects(patient.natures(), error => error.code === 'rate_limited' && /pausa/.test(error.message) && error.retryAt > new Date(clock));
  assert.equal(tries() - triedBefore, 3, 'asked three times'); assert.deepEqual(waits.filter(ms => ms >= 1000), [1000, 2000], 'waiting 1 s, then 2 s');
  fake.state.tooManyRequests = false;
  await store.integrations.save('bling', {failures: 0, failingSince: null, openUntil: null, lastError: null});   // this one 429 is not what the next checks are about

  // Bling refuses the refresh token (30 days unused, revoked in Bling): the site forgets the tokens and says so.
  clock += 7 * 3600e3; fake.expireAccessTokens(); fake.forgetRefreshTokens();
  await assert.rejects(bling.natures(), error => error.code === 'not_connected' && /expirou/.test(error.message));
  const lost = await bling.status();
  assert.deepEqual([lost.connected, lost.expired], [false, true], 'the panel shows it expired');
  // The note waits in the queue (BLING-RESILIENCIA.md) until someone connects again, instead of failing.
  const lostOrder = order(), noted = await issue(lostOrder);
  assert.equal(noted.status, 'fila'); assert.match(noted.message, /Conecte/); assert(noted.nextAttemptAt > new Date(clock), 'looked at again later');

  // Reconnect.
  const again = await adminSession(store);
  const url = (await call(endpoint, {body: {action: 'start'}, cookie: again.cookie})).json().url;
  const allowed = fake.authorize(url);
  assert.equal((await call(endpoint, {body: {action: 'connect', ...allowed}, cookie: again.cookie})).json().bling.connected, true);
  assert.equal((await invoicing.issue(lostOrder)).status, 'autorizada', 'after reconnecting, "Tentar de novo" issues it');
}

// ── environment: the test site must never issue real notes unnoticed ──
{
  fake.state.environment = '1';   // the Bling account is in produção
  const real = await issue(order());
  assert.equal(real.status, 'autorizada', 'the note exists: recorded as it is');
  assert.equal(real.environment, 'producao'); assert.match(real.message, /PRODUÇÃO/);
  const paused = await createBling({store, env: ENV, now, fetchImpl: network}).status();
  assert.match(paused.pausedReason, /PRODUÇÃO/, 'issuing paused');
  const next = await issue(order());
  assert.equal(next.status, 'fila', 'waits in the queue while paused'); assert.match(next.message, /Emissão pausada/);
  assert.equal(next.providerId, null, 'nothing sent while paused');
  const ju = await adminSession(store);
  assert.equal((await call(endpoint, {body: {action: 'resume'}, cookie: ju.cookie})).json().bling.pausedReason, null);
  assert((await store.adminAudit.list()).some(a => a.action === 'bling_resumed'));
  fake.state.environment = '2';

  // The real store with Bling still in homologação: an error, and the next attempt makes a new note.
  const production = {...ENV, APP_ENV: 'production', NFE_ENVIRONMENT: 'producao', DATA_KEY: crypto.randomBytes(32).toString('base64'), INDEX_KEY: crypto.randomBytes(32).toString('base64')};
  const prodStore = createMemoryStore();
  const prodBling = createBling({store: prodStore, env: production, now, fetchImpl: network});
  await prodBling.connect(fake.authorize(prodBling.authorizationUrl('s')).code, {actor: 'ju'});
  const wrong = await createBlingProvider({store: prodStore, env: production, now, fetchImpl: network}).emit(built(order(), 'producao'));
  assert.equal(wrong.status, 'erro'); assert.match(wrong.message, /homologação/); assert.equal(wrong.providerId, null);
}

// ── disconnecting ─────────────────────────────────────────────────────
{
  const ju = await adminSession(store);
  const off = await call(endpoint, {body: {action: 'disconnect'}, cookie: ju.cookie});
  assert.equal(off.json().bling.connected, false); assert.equal(off.json().bling.expired, false);
  assert.equal(await store.integrations.get('bling'), null, 'tokens forgotten');
  assert(fake.calls.some(c => c.path === '/oauth/revoke'), 'Bling asked to revoke');
  assert((await store.adminAudit.list()).some(a => a.action === 'bling_disconnected'));
  const idle = await issue(order());
  assert.equal(idle.status, 'fila', 'waits in the queue until Bling is connected'); assert.match(idle.message, /não está conectado/);
}

console.log('PASS: Bling — connection from the panel (state per session, encrypted tokens, shared renewal, single-use refresh, weekly keep-alive, expired and reconnected), the note sent from the order (person or company, payment method, freight), once per order, rejections kept and the same note resent as fixed in Bling, cancelled notes replaced, environment checked in the XML (a real note on the test site pauses issuing), disconnecting.');
