// NF-e: tax data and the switch (never real notes by accident), the invoice built from an order (person or company,
// same state or not), the CEP lookup, and the whole flow with the simulated service: issued when Ju confirms the order,
// once per order, e-mailed once, errors kept with the reason and retried, shown in the panel and in "Meus pedidos".
// Run: node tests/nfe.mjs — no network.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const fiscal = require('../api/_lib/fiscal');
const {buildInvoice, describe} = require('../api/_lib/nfe');
const {lookupCep} = require('../api/_lib/cep');
const {createInvoicing} = require('../api/_lib/invoicing');
const {createFakeProvider} = require('../api/_lib/nfe-providers/fake');
const {providerFor} = require('../api/_lib/nfe-providers');
const {createMemoryStore} = require('../api/_lib/store-memory');
const {encrypt} = require('../api/_lib/fields');
const catalog = require('../api/_lib/catalog');
const {renderInvoiceEmail} = require('../api/_lib/order-email');
const orderStatus = require('../api/admin/order-status'), orderInvoice = require('../api/admin/order-invoice'), orderRefund = require('../api/admin/order-refund'), adminOrders = require('../api/admin/orders'), accountOrders = require('../api/account/orders');

const ENV = {APP_ENV: 'preview', SITE_URL: 'https://site.test', NFE_PROVIDER: 'fake', NFE_EXAMPLE_DATA: '1', RESEND_API_KEY: 're_test_key_123', AUTH_SECRET: 's'.repeat(40), MAIL_FROM: 'Ju <pedidos@site.test>'};
const BH = {cep: '30140071', city: 'Belo Horizonte', state: 'MG', cityCode: '3106200'};
const SP = {cep: '01310100', city: 'São Paulo', state: 'SP', cityCode: '3550308'};
const lookupFrom = table => async cep => table[String(cep).replace(/\D/g, '')] || null;

function order(over = {}) {
  return {
    id: crypto.randomUUID(), reference: 'JU-' + crypto.randomBytes(5).toString('hex').toUpperCase(), customerId: null, source: 'test', status: 'confirmado', method: 'card', lang: 'pt-BR',
    subtotalCents: 12900 * 2 + 15900, shippingCents: 1800, totalCents: 12900 * 2 + 15900 + 1800,
    buyer: {name: 'Ana Souza Lima', email: 'ana@example.com', company: null}, buyerDocEnc: encrypt(ENV, '52998224725'), phoneEnc: encrypt(ENV, '31999991234'),
    shipTo: {recipient: 'Ana Souza Lima', cep: '30140071', street: 'Rua da Bahia', number: '1200', district: 'Centro', city: 'Belo Horizonte', state: 'MG', complement: 'Sala 4'},
    items: [{productId: 'borboletoscopio', title: 'Borboletoscópio', quantity: 2, unitCents: 12900, selection: {body: 'pink', details: 'lilac'}}, {productId: 'aviaoscopia', title: 'Aviãoscopia', quantity: 1, unitCents: 15900, selection: {body: 'black'}}],
    ...over
  };
}

// ── tax data and the switch ───────────────────────────────────────────
{
  assert.deepEqual(Object.keys(fiscal.FISCAL.products).sort(), Object.keys(catalog.PRODUCTS).sort(), 'one tax entry (NCM) per product of the catalog');
  assert.deepEqual(fiscal.missing(), [], "the accountant's data is complete");
  assert.deepEqual(fiscal.missing(fiscal.FISCAL, {provider: 'bling'}), [], 'with Bling, nothing is left');
  assert.deepEqual(fiscal.FISCAL.bling.natureId, {nonTaxpayer: '15111617940', taxpayer: '15111617959'}, 'the two Bling natures, by kind of buyer (01/10/2026)');
  assert.deepEqual([fiscal.FISCAL.cfop.sameState, fiscal.FISCAL.cfop.otherState, fiscal.FISCAL.cfop.otherStateConsumer, fiscal.FISCAL.icms.csosn, fiscal.FISCAL.pis.cst, fiscal.FISCAL.cofins.cst], ['5101', '6101', '6107', '102', '49', '49']);
  assert(Object.values(fiscal.FISCAL.products).every(p => p.ncm === '39269090'), 'NCM 3926.90.90 for the three pieces');
  assert.deepEqual(fiscal.missing(fiscal.EXAMPLE.fiscal), [], 'the example set is complete (tests and local demo only)');
  assert.equal(fiscal.nfeSettings({}).mode, 'off');
  assert.deepEqual(fiscal.nfeSettings({APP_ENV: 'preview', NFE_PROVIDER: 'focusnfe', NFE_TOKEN: 't'}), {mode: 'test', blocked: false, provider: 'focusnfe', environment: 'homologacao', token: 't', example: false});
  assert.equal(fiscal.nfeSettings({APP_ENV: 'preview', NFE_PROVIDER: 'x', NFE_ENVIRONMENT: 'producao'}).environment, 'homologacao', 'the test site never issues real notes');
  assert.equal(fiscal.nfeSettings({APP_ENV: 'production', NFE_PROVIDER: 'x'}).environment, 'homologacao', 'production issues real notes only with NFE_ENVIRONMENT=producao');
  assert.equal(fiscal.nfeSettings({APP_ENV: 'production', NFE_PROVIDER: 'x', NFE_ENVIRONMENT: 'producao'}).mode, 'live');
  assert.equal(fiscal.nfeSettings({APP_ENV: 'production', NFE_PROVIDER: 'x', NFE_ENVIRONMENT: 'PRODUCAO'}).mode, 'test', 'only the exact word');
  assert.deepEqual(fiscal.nfeSettings({APP_ENV: 'production', NFE_PROVIDER: 'fake'}), {mode: 'off', blocked: true}, 'the simulator never runs in production');
  assert.equal(fiscal.nfeSettings({APP_ENV: 'production', NFE_PROVIDER: 'x', NFE_EXAMPLE_DATA: '1'}).example, false, 'example data never in production');
  assert.throws(() => providerFor({mode: 'test', provider: 'focusnfe'}), e => e.code === 'provider_not_supported', 'until its adapter is written');
}

// ── the invoice built from an order ───────────────────────────────────
{
  const person = buildInvoice({order: order(), city: BH, environment: 'homologacao', env: ENV, ...fiscal.EXAMPLE});
  assert(person.ok, person.problems?.join('; '));
  const i = person.invoice;
  assert.equal(i.recipient.cpf, '52998224725'); assert.equal(i.recipient.ieIndicator, '9', 'a person is a non-contributor');
  assert.equal(i.destination, '1'); assert.equal(i.items[0].cfop, '5101', 'same state');
  assert.equal(i.recipient.address.cityCode, '3106200', 'IBGE code from the CEP lookup');
  assert.deepEqual(i.items.map(x => [x.code, x.quantity, x.unitCents, x.totalCents, x.ncm]), [['borboletoscopio', 2, 12900, 25800, '39269090'], ['aviaoscopia', 1, 15900, 15900, '39269090']]);
  assert.equal(i.items[0].description, 'Borboletoscópio (Corpo: Rosa Ju, Detalhes das asas: Lilás)', 'the colors go on the invoice line');
  assert.deepEqual(i.totals, {productsCents: 41700, freightCents: 1800, discountCents: 0, totalCents: 43500});
  const pix = buildInvoice({order: order({method: 'pix', totalCents: 41700 - 2085 + 1800}), city: BH, environment: 'homologacao', env: ENV, ...fiscal.EXAMPLE}).invoice;
  assert.equal(pix.totals.discountCents, 2085, 'the Pix 5% goes on the note as a discount'); assert.equal(pix.payment.cents, 41415); assert.equal(pix.payment.code, '17');
  assert(!buildInvoice({order: order({totalCents: 50000}), city: BH, environment: 'homologacao', env: ENV, ...fiscal.EXAMPLE}).ok, 'a total above the pieces + delivery is refused');
  assert.equal(i.payment.code, '03'); assert.equal(i.presence, '2', 'internet sale'); assert.equal(i.finalConsumer, true);
  assert.equal(i.additionalInfo, `${fiscal.EXAMPLE.fiscal.additionalInfo} Pedido nº: ${i.reference}`, 'the tax text, then the order');
  assert.equal(fiscal.FISCAL.additionalInfo, 'DOCUMENTO EMITIDO POR ME OU EPP OPTANTE PELO SIMPLES NACIONAL. NAO GERA DIREITO A CREDITO FISCAL DE IPI.', "the accountant's text (01/10/2026)");
  assert.equal(buildInvoice({order: order({method: 'pix'}), city: BH, environment: 'homologacao', env: ENV, ...fiscal.EXAMPLE}).invoice.payment.code, '17');
  assert.equal(buildInvoice({order: order({method: 'debit'}), city: BH, environment: 'homologacao', env: ENV, ...fiscal.EXAMPLE}).invoice.payment.code, '04');

  const sp = buildInvoice({order: order({shipTo: {...order().shipTo, cep: '01310100', state: 'SP', city: 'São Paulo'}}), city: SP, environment: 'homologacao', env: ENV, ...fiscal.EXAMPLE}).invoice;
  assert.equal(sp.destination, '2'); assert.equal(sp.items[0].cfop, '6107', 'a person in another state: production sold to a non-taxpayer');
  assert.match(sp.additionalInfo, /DIFAL da UF destino R\$ 0,00 \+ FCP R\$ 0,00; DIFAL da UF Origem R\$ 0,00\. Pedido nº: JU-/, 'the interstate ICMS line (zero in the Simples)');
  assert(!i.additionalInfo.includes('DIFAL'), 'not inside MG');
  const spCompany = {name: 'Ana', email: 'a@b.co', company: {cnpj: '11222333000181', name: 'Clínica Olhar', stateRegistration: '110042490114'}};
  const taxpayer = buildInvoice({order: order({buyer: spCompany, shipTo: {...order().shipTo, cep: '01310100', state: 'SP', city: 'São Paulo'}}), city: SP, environment: 'homologacao', env: ENV, ...fiscal.EXAMPLE}).invoice;
  assert.equal(taxpayer.items[0].cfop, '6101', 'a company with a state registration in another state'); assert(!taxpayer.additionalInfo.includes('DIFAL'));
  const exemptSp = buildInvoice({order: order({buyer: {...spCompany, company: {...spCompany.company, stateRegistration: 'ISENTO'}}, shipTo: {...order().shipTo, cep: '01310100', state: 'SP', city: 'São Paulo'}}), city: SP, environment: 'homologacao', env: ENV, ...fiscal.EXAMPLE}).invoice;
  assert.equal(exemptSp.items[0].cfop, '6107', 'a company without a state registration is a non-taxpayer');
  assert.equal(exemptSp.recipient.ieIndicator, '9', 'and goes as a non-contributor (accountant, 01/10/2026)'); assert.match(exemptSp.additionalInfo, /DIFAL da UF destino/);

  const company = buildInvoice({order: order({buyer: {name: 'Ana Souza Lima', email: 'ana@example.com', company: {cnpj: '12ABC34501DE35', name: 'Clínica Olhar', stateRegistration: '0620012345678'}}}), city: BH, environment: 'homologacao', env: ENV, ...fiscal.EXAMPLE}).invoice;
  assert.equal(company.recipient.cnpj, '12ABC34501DE35'); assert.equal(company.recipient.name, 'Clínica Olhar'); assert.equal(company.recipient.ieIndicator, '1'); assert(!('cpf' in company.recipient), 'a company note carries the CNPJ, not the CPF');
  const exempt = buildInvoice({order: order({buyer: {name: 'Ana', email: 'a@b.co', company: {cnpj: '12ABC34501DE35', name: 'Clínica', stateRegistration: 'ISENTO'}}}), city: BH, environment: 'homologacao', env: ENV, ...fiscal.EXAMPLE}).invoice;
  assert.equal(exempt.recipient.ieIndicator, '9'); assert.equal(exempt.recipient.stateRegistration, '');

  // Problems are listed, nothing is sent.
  const pending = buildInvoice({order: order(), city: BH, environment: 'homologacao', provider: 'bling', env: ENV, fiscal: {...fiscal.FISCAL, bling: {natureId: {nonTaxpayer: '[PREENCHER: id]', taxpayer: '[PREENCHER: id]'}}}});
  assert.equal(pending.ok, false); assert(pending.problems.some(p => p.includes('Dados fiscais a preencher')));
  assert(!pending.problems.some(p => p.includes('Dados da empresa')), 'the company data in legal.js is filled');
  const noCompany = buildInvoice({order: order(), city: BH, environment: 'homologacao', env: ENV, ...fiscal.EXAMPLE, company: {legalName: '[PREENCHER: razão social]', cnpj: '[PREENCHER: CNPJ]'}});
  assert(noCompany.problems.some(p => p.includes('Dados da empresa')), 'a company still to be filled blocks the note');
  const problems = input => buildInvoice({environment: 'homologacao', env: ENV, ...fiscal.EXAMPLE, ...input}).problems || [];
  assert(problems({order: order(), city: null}).some(p => p.includes('CEP 30140071 não encontrado')));
  assert(problems({order: order(), city: SP}).some(p => p.includes('é de SP, mas o endereço diz MG')), 'CEP and state must agree');
  assert(problems({order: order({buyerDocEnc: null}), city: BH}).some(p => p.includes('sem CPF ou CNPJ')));
  assert(problems({order: order({totalCents: 1}), city: BH}).some(p => p.includes('não somam')));
  assert.equal(describe({productId: 'nao-existe', title: 'Peça antiga'}), 'Peça antiga');
}

// ── CEP lookup ────────────────────────────────────────────────────────
{
  const calls = [];
  const fetchImpl = async url => { calls.push(url); const cep = url.match(/ws\/(\d+)\//)[1]; return {ok: true, json: async () => cep === '99999999' ? {erro: true} : {cep: '30140-071', localidade: 'Belo Horizonte', uf: 'MG', ibge: '3106200'}}; };
  assert.deepEqual(await lookupCep('30140-071', {fetchImpl}), BH);
  await lookupCep('30140071', {fetchImpl}); assert.equal(calls.length, 1, 'cached');
  assert.equal(await lookupCep('99999999', {fetchImpl}), null, 'CEP that does not exist');
  assert.equal(await lookupCep('123', {fetchImpl}), null); assert.equal(calls.length, 2, 'an invalid CEP is not even looked up');
  await assert.rejects(lookupCep('11111111', {fetchImpl: async () => ({ok: false, status: 503})}), /ViaCEP 503/);
}

// ── the flow: issued on confirmation, once, e-mailed once ─────────────
{
  const store = createMemoryStore(), mails = [], provider = createFakeProvider(), emitted = [];
  const spy = {name: 'fake', emit: async inv => { emitted.push(inv.reference); return provider.emit(inv); }, check: ref => provider.check(ref)};
  const fetchImpl = async (url, init) => { mails.push(JSON.parse(init.body)); return {ok: true, status: 200, json: async () => ({id: 'em_' + mails.length})}; };
  const invoicing = createInvoicing({store, env: ENV, fetchImpl, provider: spy, lookup: lookupFrom({'30140071': BH})});
  const {order: saved} = await store.orders.create(order());

  await assert.rejects(invoicing.issue({...saved, status: 'pendente'}), e => e.field === 'status', 'only confirmed orders');
  const first = await invoicing.issue(saved, {actor: 'ju@site.test'});
  assert.equal(first.status, 'autorizada'); assert.match(first.number, /^\d+$/); assert.equal(first.accessKey.length, 44); assert.equal(first.environment, 'homologacao');
  assert(first.pdfUrl.startsWith('https://') && first.xmlUrl.startsWith('https://'));
  assert(!JSON.stringify(first).includes('52998224725'), 'the CPF is not stored with the invoice');
  assert.equal(mails.length, 1); assert.deepEqual(mails[0].to, ['ana@example.com']); assert(mails[0].subject.startsWith('[TESTE] Nota fiscal do seu pedido'), 'the buyer gets the note (test environment marked)');
  assert(mails[0].html.includes(first.pdfUrl) && mails[0].html.includes('nota de homologação, sem valor fiscal'));
  const again = await invoicing.issue(saved, {actor: 'ju@site.test'});
  assert.equal(again.id, first.id); assert.equal(emitted.length, 1, 'confirming again never issues a second note'); assert.equal(mails.length, 1, 'nor a second e-mail');
  const events = (await store.orders.events(saved.id)).map(e => e.kind);
  assert(events.includes('nfe:autorizada'), 'recorded in the order history');

  // Refused by the tax authority: the reason stays; after fixing, a retry authorizes the same invoice.
  const {order: refusedOrder} = await store.orders.create(order({buyer: {name: 'REJEITAR Teste', email: 'r@example.com', company: null}}));
  const refused = await invoicing.issue(refusedOrder);
  assert.equal(refused.status, 'erro'); assert.match(refused.message, /Rejeição 539/);
  await store.orders.update(refusedOrder.id, {buyer: {name: 'Rita Teste', email: 'r@example.com', company: null}});
  const retried = await invoicing.issue(await store.orders.findById(refusedOrder.id));
  assert.equal(retried.status, 'autorizada'); assert.equal(retried.attempts, 2); assert.equal(retried.id, refused.id);

  // Missing data, CEP not found, service down: saved as errors with a readable reason, never an exception.
  const pendingData = createInvoicing({store, env: {...ENV, NFE_PROVIDER: 'bling', NFE_EXAMPLE_DATA: ''}, fetchImpl, provider: spy, lookup: lookupFrom({'30140071': BH})});
  const {order: o2} = await store.orders.create(order());
  // Every tax datum is filled now, so a pending one is simulated for this check and put back right after.
  const realNatures = fiscal.FISCAL.bling.natureId;
  fiscal.FISCAL.bling.natureId = {nonTaxpayer: '[PREENCHER: id]', taxpayer: '[PREENCHER: id]'};
  try { assert.match((await pendingData.issue(o2)).message, /Dados fiscais a preencher/); } finally { fiscal.FISCAL.bling.natureId = realNatures; }
  const {order: o3} = await store.orders.create(order({shipTo: {...order().shipTo, cep: '99999999'}}));
  assert.match((await invoicing.issue(o3)).message, /CEP 99999999 não encontrado/);
  const down = createInvoicing({store, env: ENV, fetchImpl, provider: {emit: async () => { throw new Error('ECONNRESET'); }}, lookup: lookupFrom({'30140071': BH})});
  const {order: o4} = await store.orders.create(order());
  const errors = []; const original = console.error; console.error = (...a) => errors.push(a.join(' '));
  try { assert.match((await down.issue(o4)).message, /não respondeu/); } finally { console.error = original; }
  const cepDown = createInvoicing({store, env: ENV, fetchImpl, provider: spy, lookup: async () => { throw new Error('timeout'); }});
  const {order: o5} = await store.orders.create(order());
  assert.match((await cepDown.issue(o5)).message, /consultar o CEP/);

  // A note still processing is asked again later; the e-mail goes when it is authorized.
  const {order: slow} = await store.orders.create(order({buyer: {name: 'DEMORAR Teste', email: 'slow@example.com', company: null}}));
  const processing = await invoicing.issue(slow);
  assert.equal(processing.status, 'processando'); assert(!mails.some(m => m.to[0] === 'slow@example.com'), 'no e-mail while processing');
  const done = await invoicing.refresh(processing, slow);
  assert.equal(done.status, 'autorizada'); assert(mails.some(m => m.to[0] === 'slow@example.com'), 'e-mailed once authorized');

  // Links from the service are used only if they are https.
  const {order: o6} = await store.orders.create(order());
  const hostile = createInvoicing({store, env: ENV, fetchImpl, provider: {emit: async () => ({status: 'autorizada', number: '9', series: '1', accessKey: '1'.repeat(44), pdfUrl: 'javascript:alert(1)', xmlUrl: 'http://plain.test/x.xml'})}, lookup: lookupFrom({'30140071': BH})});
  const odd = await hostile.issue(o6);
  assert.equal(odd.pdfUrl, null); assert.equal(odd.xmlUrl, null);

  // Switched off: nothing happens.
  assert.equal(await createInvoicing({store, env: {APP_ENV: 'preview'}}).issue(saved), null);

  // Real notes (production + NFE_ENVIRONMENT=producao) only for orders paid for real: a test-mode order (source "test")
  // never reaches the service, not even by "Tentar de novo" or the queue; a live one goes as usual.
  const PROD = {APP_ENV: 'production', SITE_URL: 'https://site.test', NFE_PROVIDER: 'bling', NFE_ENVIRONMENT: 'producao', DATA_KEY: crypto.randomBytes(32).toString('base64'), INDEX_KEY: crypto.randomBytes(32).toString('base64')};
  const realEmits = [], realProvider = {name: 'bling', emit: async inv => { realEmits.push(inv.reference); return {status: 'autorizada', number: '11', series: '1', accessKey: '3'.repeat(44), environment: 'producao'}; }};
  const real = createInvoicing({store, env: PROD, fetchImpl, provider: realProvider, lookup: lookupFrom({'30140071': BH})});
  assert.equal(real.settings.environment, 'producao');
  const prodOrder = over => order({buyerDocEnc: encrypt(PROD, '52998224725'), phoneEnc: encrypt(PROD, '31999991234'), ...over});
  const {order: leftover} = await store.orders.create(prodOrder({source: 'test'}));
  const refusedTest = await real.issue(leftover, {actor: 'ju@site.test'});
  assert.equal(refusedTest.status, 'erro'); assert.match(refusedTest.message, /Pedido de teste/); assert.equal(refusedTest.nextAttemptAt, null, 'out of the queue');
  assert.equal((await real.issue(leftover, {actor: 'ju@site.test', force: true})).status, 'erro', '"Tentar de novo" refuses it too');
  assert.deepEqual(realEmits, [], 'the tax authority never saw it');
  assert((await store.orders.events(leftover.id)).some(e => e.kind === 'nfe:erro' && /pedido de teste/.test(e.detail)), 'the reason is in the order history');
  const {order: sale} = await store.orders.create(prodOrder({source: 'live'}));
  assert.notEqual((await real.issue(sale)).message || '', 'Pedido de teste (pago no modo de teste do Mercado Pago): não emitimos nota fiscal real para ele.');
  assert.deepEqual(realEmits, [sale.reference], 'a live sale gets its real note');
  const homolog = createInvoicing({store, env: {...PROD, NFE_ENVIRONMENT: ''}, fetchImpl, provider: realProvider, lookup: lookupFrom({'30140071': BH})});
  const {order: testInHomolog} = await store.orders.create(prodOrder({source: 'test'}));
  await homolog.issue(testInHomolog);
  assert.deepEqual(realEmits, [sale.reference, testInHomolog.reference], 'test orders still go to homologação (no fiscal value)');
}

// ── panel and "Meus pedidos" ──────────────────────────────────────────
function makeRes() { return {statusCode: 200, headers: {}, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(d) { this.body = d || ''; }, json() { return JSON.parse(this.body); }}; }
async function call(handler, {method = 'POST', body = {}, cookie = '', url = '/'} = {}) {
  const res = makeRes();
  await handler({method, headers: {origin: 'https://site.test', 'x-forwarded-for': '203.0.113.7', ...(cookie ? {cookie} : {})}, body, socket: {}, url}, res);
  return res;
}
{
  const store = createMemoryStore();
  // A signed-in admin and a signed-in buyer, sessions opened directly in the store.
  const token = () => crypto.randomBytes(32).toString('base64url'), sha = t => crypto.createHash('sha256').update(t).digest();
  const adminId = crypto.randomUUID(); await store.admins.create({id: adminId, email: 'ju@site.test', passwordHash: 'x', totpEnabledAt: new Date()});
  const adminToken = token(); await store.adminSessions.create({tokenHash: sha(adminToken), adminId, mfaAt: new Date(), expiresAt: new Date(Date.now() + 3600e3)});
  const buyerId = crypto.randomUUID(); await store.customers.create({id: buyerId, email: 'ana@example.com', emailVerifiedAt: new Date(), displayName: 'Ana'});
  const buyerToken = token(); await store.sessions.create({tokenHash: sha(buyerToken), customerId: buyerId, expiresAt: new Date(Date.now() + 3600e3)});
  const admin = `__Host-ju_admin=${adminToken}`, buyer = `__Host-ju_session=${buyerToken}`;
  const {order: paid} = await store.orders.create(order({status: 'pendente', customerId: buyerId, shipTo: {...order().shipTo, cep: '01001000', state: 'SP', city: 'São Paulo'}}));
  const env = {...ENV, RESEND_API_KEY: ''};   // no e-mail here; the e-mail itself is covered above

  // Without a network the CEP lookup fails: the note is saved as an error and the retry button issues it once fixed.
  const fetchImpl = async url => { if (String(url).includes('viacep')) return {ok: true, json: async () => ({cep: '01001-000', localidade: 'São Paulo', uf: 'SP', ibge: '3550308'})}; throw new Error('unexpected ' + url); };
  const confirmed = await call(orderStatus.create({env, store, fetchImpl}), {body: {id: paid.id, status: 'confirmado'}, cookie: admin});
  assert.equal(confirmed.statusCode, 200); assert.equal(confirmed.json().order.invoice.status, 'autorizada', 'confirming the order issues the note');
  assert.equal(confirmed.json().order.invoice.environment, 'homologacao');
  const listed = (await call(adminOrders.create({env, store, fetchImpl}), {method: 'GET', cookie: admin})).json();
  assert.equal(listed.invoicing, 'test'); assert.equal(listed.orders[0].invoice.number, confirmed.json().order.invoice.number, 'the panel lists the note with the order');

  // Notes still processing are checked again when the panel opens, after the answer: all of them on the page, a few at
  // a time (3) and in parallel. The answer shows them as saved; the next opening shows what came back.
  const background = [], waitUntil = work => { background.push(work); }, settled = () => Promise.all(background.splice(0));
  const fake = providerFor(fiscal.nfeSettings(env)), check = fake.check;
  const slowOnes = [];
  for (let i = 0; i < 7; i++) {
    const {order: o} = await store.orders.create(order({buyer: {name: `DEMORAR Painel ${i}`, email: `p${i}@example.com`, company: null}}));
    slowOnes.push(await createInvoicing({store, env, fetchImpl, lookup: lookupFrom({'30140071': BH})}).issue(o));
  }
  assert(slowOnes.every(i => i.status === 'processando'));
  let active = 0, peak = 0;
  fake.check = async query => { active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 15)); active--; return check(query); };
  try {
    const panel = adminOrders.create({env, store, fetchImpl, waitUntil});
    const answered = (await call(panel, {method: 'GET', cookie: admin})).json().orders;
    assert.equal(answered.filter(o => o.invoice?.status === 'processando').length, 7, 'the answer does not wait for the service');
    assert.equal(background.length, 1, 'the checks were handed to waitUntil');
    await settled();
    const refreshed = (await call(panel, {method: 'GET', cookie: admin})).json().orders;
    assert.equal(refreshed.filter(o => o.invoice?.status === 'autorizada').length, 8, 'every note processing is authorized on the next opening');
    assert.equal(peak, 3, 'checked 3 at a time, never more');
    assert.equal(background.length, 0, 'nothing left to check: nothing handed to waitUntil');
  } finally { fake.check = check; }

  // A page at a time: each page's cursor leads to the next, with no order repeated or skipped, until there is none.
  const panel = adminOrders.create({env, store, fetchImpl}), page = (query = '') => call(panel, {method: 'GET', cookie: admin, url: `/api/admin/orders${query}`});
  const whole = (await page()).json();
  assert.equal(whole.orders.length, 8); assert.equal(whole.nextCursor, null, 'everything fits in the default page');
  const paged = [];
  let cursor = null, pages = 0;
  do { const answer = (await page(`?limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)).json(); paged.push(...answer.orders); cursor = answer.nextCursor; pages++; } while (cursor);
  assert.equal(pages, 3); assert.deepEqual(paged.map(o => o.id), whole.orders.map(o => o.id), 'the pages join into the same list, newest first');
  assert.equal(paged.filter(o => o.invoice?.status === 'autorizada').length, 8, 'each page carries its notes');
  for (const query of ['?limit=0', '?limit=201', '?limit=abc', '?cursor=nada', `?cursor=${Buffer.from('["ontem","x"]').toString('base64url')}`]) {
    const refused = await page(query);
    assert.equal(refused.statusCode, 400, `${query} is refused`); assert.equal(refused.json().field, query.includes('cursor') ? 'cursor' : 'limit');
  }
  const retry = await call(orderInvoice.create({env, store, fetchImpl}), {body: {id: paid.id}, cookie: admin});
  assert.equal(retry.json().order.invoice.number, confirmed.json().order.invoice.number, 'retrying an authorized note changes nothing');
  assert((await store.adminAudit.list()).some(a => a.action === 'nfe_issue'));
  assert.equal((await call(orderInvoice.create({env, store, fetchImpl}), {body: {id: paid.id}})).statusCode, 401);
  const {order: open} = await store.orders.create(order({status: 'pendente'}));
  assert.equal((await call(orderInvoice.create({env, store, fetchImpl}), {body: {id: open.id}, cookie: admin})).json().field, 'status', 'only confirmed orders');
  assert.equal((await call(orderInvoice.create({env: {APP_ENV: 'preview', SITE_URL: 'https://site.test'}, store, fetchImpl}), {body: {id: paid.id}, cookie: admin})).statusCode, 409, 'issuing switched off');
  // Declining after the note: the order moves, the note stays (it must be cancelled at the service).
  const declined = await call(orderStatus.create({env, store, fetchImpl}), {body: {id: paid.id, status: 'recusado'}, cookie: admin});
  assert.equal(declined.json().order.status, 'recusado'); assert.equal(declined.json().order.invoice.status, 'autorizada');
  assert.equal(declined.json().refund, 'failed', 'no Mercado Pago here: the refund waits for a retry');
  const refundCheck = await call(orderRefund.create({env, store, fetchImpl}), {body: {id: paid.id}, cookie: admin});
  assert.equal(refundCheck.json().order.invoice.status, 'autorizada', 'checking the refund keeps the note on the order');

  const mine = (await call(accountOrders.create({env, store}), {method: 'GET', cookie: buyer})).json().orders;
  assert.equal(mine[0].invoice.number, confirmed.json().order.invoice.number); assert(mine[0].invoice.pdfUrl.startsWith('https://'), 'the buyer sees the note in "Meus pedidos"');
  assert(!('accessKey' in mine[0].invoice) && !('xmlUrl' in mine[0].invoice), 'only the number and the PDF');
}

// ── the e-mail itself ─────────────────────────────────────────────────
{
  const summary = {reference: 'JU-TESTE', customer: {name: '<b>Ana</b> Lima'}};
  const note = {number: '12', series: '1', accessKey: '31260911222333000181550010000000121000000123', pdfUrl: 'https://n.test/a.pdf', xmlUrl: 'https://n.test/a.xml'};
  for (const lang of ['pt-BR', 'en', 'es']) {
    const mail = renderInvoiceEmail({summary, invoice: note, lang, test: false, assetUrl: 'https://site.test'});
    assert(mail.html.includes('https://n.test/a.pdf') && mail.html.includes('3126 0911 2223 3300') && !mail.html.includes('<b>Ana'), lang);
    assert(!mail.subject.startsWith('[TESTE]') && mail.text.includes('JU-TESTE'));
  }
}

console.log('PASS: NF-e — tax data one per product and still pending, never real notes by accident (homologação unless NFE_ENVIRONMENT=producao in production, simulator and example data never in production, never a real note for an order paid in test mode), invoice for a person or a company in the same or another state, CEP lookup, issued once on confirmation and e-mailed once, errors kept with the reason and retried, panel and "Meus pedidos".');
