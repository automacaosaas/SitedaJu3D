// NF-e for a sale abroad (Nota Fiscal de Exportação), as the accountant listed on 08/10/2026 (RICMS/MG, Anexo VIII,
// art. 166): nature "Exportação de mercadoria", CFOP 7101, CSOSN 300, the place of embarkation (grupo ZA) and, in the
// "Informações complementares", that place with its address and CNPJ, the freight in its own field, a foreign buyer
// ("EXTERIOR", UF "EX", the country). Held back with a clear message while the store's export data is still to be filled,
// without touching the national notes; sent to the simulated Bling as an operation with the exterior.
// Run: node tests/nfe-exportacao.mjs — no network (tools/fake-bling.cjs plays Bling).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const fiscal = require('../api/_lib/fiscal');
const {buildInvoice, abroad, countryName} = require('../api/_lib/nfe');
const {createBling} = require('../api/_lib/bling');
const {createBlingProvider, toBling} = require('../api/_lib/nfe-providers/bling');
const {createInvoicing} = require('../api/_lib/invoicing');
const {createMemoryStore} = require('../api/_lib/store-memory');
const {encrypt} = require('../api/_lib/fields');
const {createFakeBling} = require('../tools/fake-bling.cjs');
const blingEndpoint = require('../api/admin/bling');

const fake = createFakeBling();
const ENV = {APP_ENV: 'preview', SITE_URL: 'https://site.test', NFE_PROVIDER: 'bling', NFE_EXAMPLE_DATA: '1', AUTH_SECRET: 's'.repeat(40), BLING_CLIENT_ID: fake.clientId, BLING_CLIENT_SECRET: fake.clientSecret, BLING_REQUESTS_PER_SECOND: '1000'};
const BH = {cep: '30140071', city: 'Belo Horizonte', state: 'MG', cityCode: '3106200'};
// The site's network: ViaCEP for the national orders (counted: an order for abroad never looks a CEP up), Bling for the rest.
const cepLookups = [];
const network = async (url, init) => {
  if (!String(url).includes('viacep.com.br')) return fake.fetchImpl(url, init);
  cepLookups.push(String(url));
  return {ok: true, json: async () => ({cep: '30140-071', localidade: 'Belo Horizonte', uf: 'MG', ibge: '3106200'})};
};
const creations = () => fake.calls.filter(c => c.method === 'POST' && c.path === '/nfe').length;

// An order from Mexico (combined by WhatsApp, paid by card), with the buyer's passport.
function exportOrder(over = {}) {
  return {
    id: crypto.randomUUID(), reference: 'JU-' + crypto.randomBytes(5).toString('hex').toUpperCase(), customerId: null, source: 'test', status: 'confirmado', method: 'card', lang: 'es',
    subtotalCents: 12900 * 2, shippingCents: 18900, totalCents: 12900 * 2 + 18900,
    buyer: {name: 'María López García', email: 'maria@example.com', company: null, foreignId: 'G12345678'}, buyerDocEnc: null, phoneEnc: encrypt(ENV, '31999991234'),
    shipTo: {recipient: 'María López García', street: 'Avenida Insurgentes Sur', number: '1602', complement: 'Piso 3', district: 'Crédito Constructor', city: 'Ciudad de México', state: 'CDMX', postalCode: '03940', country: 'MX'},
    items: [{productId: 'borboletoscopio', title: 'Borboletoscópio', quantity: 2, unitCents: 12900, selection: {body: 'pink', details: 'lilac'}}],
    ...over
  };
}
// The same pieces sold inside Brazil (Belo Horizonte, a person with CPF): the national note, which must not change.
function nationalOrder(over = {}) {
  return exportOrder({lang: 'pt-BR', shippingCents: 1800, totalCents: 12900 * 2 + 1800, buyer: {name: 'Ana Souza Lima', email: 'ana@example.com', company: null}, buyerDocEnc: encrypt(ENV, '52998224725'),
    shipTo: {recipient: 'Ana Souza Lima', cep: '30140071', street: 'Rua da Bahia', number: '1200', district: 'Centro', city: 'Belo Horizonte', state: 'MG', complement: 'Sala 4'}, ...over});
}
const build = (o, extra = {}) => buildInvoice({order: o, city: null, environment: 'homologacao', provider: 'bling', env: ENV, ...fiscal.EXAMPLE, ...extra});

// ── the accountant's rules and the data still to fill ──────────────────
{
  const exp = fiscal.FISCAL.export;
  assert.deepEqual([exp.nature, exp.cfop, exp.icms.origin, exp.icms.csosn], ['Exportação Direta - Simples Nacional', '7101', '0', '300'], 'nature, CFOP 7101 (the store makes what it sells) and CSOSN 300 with origin 0 ("X300")');
  assert.deepEqual(fiscal.missing(fiscal.FISCAL, {provider: 'bling'}), [], 'the export data still to fill never holds back the national notes');
  assert.deepEqual(fiscal.missing(), [], 'nor with another service');
  assert.deepEqual(fiscal.missingExport(fiscal.FISCAL, {provider: 'bling'}), ['export.shipment.state', 'export.shipment.place', 'export.shipment.address', 'export.shipment.cnpj'],
    'with Bling: the place of embarkation (UF, name, address, CNPJ) and the tax unit of the NCM in the export table; the export nature is set (15111672683, 09/10/2026) and PIS/COFINS come from it in Bling');
  assert.deepEqual(Object.keys(exp.taxUnit), [...new Set(Object.values(fiscal.FISCAL.products).map(p => p.ncm))], 'a tax unit for every NCM of the products');
  assert.deepEqual(exp.netG, {borboletoscopio: 75, dinossauroscopio: 60, aviaoscopia: 166, macacoscopio: 24, girafoscopio: 18, unicornioscopio: 16}, "the owner's net weights (08/10/2026), one per product");
  const other = fiscal.missingExport(fiscal.FISCAL, {provider: 'fake'});
  assert(!other.includes('export.pis.cst') && !other.includes('export.cofins.cst') && !other.some(p => p.startsWith('export.bling.')), 'PIS/COFINS 49 and IPI 55 set by the accountant (09/10/2026): another service would send them from the site; with Bling they come from the nature');
  assert.deepEqual([exp.pis.cst, exp.cofins.cst, exp.ipi.cst], ['49', '49', '55'], "the accountant's CSTs for the export");
  assert.deepEqual(fiscal.missingExport({...fiscal.FISCAL, export: undefined}, {provider: 'bling'}), ['export'], 'no export group at all');
  assert.deepEqual(fiscal.missingExport(fiscal.EXAMPLE.fiscal, {provider: 'bling'}), [], 'the example set is complete (tests and local demo only)');
  assert.deepEqual(fiscal.missingExport(fiscal.EXAMPLE.fiscal), []);
  assert(!/^\d/.test(exp.shipment.cnpj), 'no CNPJ guessed for the place of embarkation');
}

// ── which orders are for abroad ───────────────────────────────────────
{
  assert.equal(abroad(exportOrder()), true);
  assert.equal(abroad(nationalOrder()), false, 'the checkout writes no country: national');
  assert.equal(abroad(nationalOrder({shipTo: {...nationalOrder().shipTo, country: 'br'}})), false, 'Brazil written out is national too');
  assert.deepEqual(['MX', 'US', 'PT', 'DE', 'GB', 'FR', 'JP'].map(countryName), ['MEXICO', 'ESTADOS UNIDOS', 'PORTUGAL', 'ALEMANHA', 'REINO UNIDO', 'FRANCA', 'JAPAO'], 'the name as Bling takes it: capitals, no accents');
  for (const code of ['BR', 'ZZ', 'EU', 'XX', 'mx', 'MEX', '', 'XA', 'XB', 'IC', 'DD', 'SU', 'YU', 'UK']) assert.equal(countryName(code), null, `"${code}" is not a destination abroad`);
}

// ── the export note ───────────────────────────────────────────────────
{
  const built = build(exportOrder());
  assert(built.ok, built.problems?.join('; '));
  const i = built.invoice;
  assert.equal(i.nature, 'Exportação Direta - Simples Nacional'); assert.equal(i.destination, '3', 'idDest 3: operation with the exterior');
  assert.deepEqual([i.presence, i.finalConsumer, i.purpose, i.series], ['2', true, '1', '1'], 'internet sale to a final consumer');
  assert(i.items.every(x => x.cfop === '7101' && x.icms.origin === '0' && x.icms.csosn === '300' && x.ncm === '39269090'), 'CFOP 7101, CSOSN 300, NCM of the piece');
  assert(i.items.every(x => !('ipi' in x)), 'no IPI CST (Simples Nacional: Res. CGSN 140/2018, art. 59, § 4º)');
  assert.deepEqual(i.items.map(x => [x.unit, x.quantity, x.tax]), [['UN', 2, {unit: 'KG', quantity: 0.15}]], 'the tax unit of the NCM in the export table (example: KG), with the net weight of the pieces (2 × 75 g)');
  assert.deepEqual(i.recipient, {name: 'María López García', foreignId: 'G12345678', ieIndicator: '9', email: 'maria@example.com', address: {
    street: 'Avenida Insurgentes Sur', number: '1602', complement: 'Piso 3 · Código postal 03940', district: 'Crédito Constructor, Ciudad de México, CDMX',
    city: 'EXTERIOR', cityCode: '9999999', state: 'EX', cep: '', country: 'MEXICO', countryIso: 'MX'}}, 'a foreign buyer: no CPF or CNPJ, the city EXTERIOR, UF EX, the country');
  assert.deepEqual(i.freight, {mode: '0', cents: 18900}, 'the freight in its own field, with who pays it, although the operation is immune');
  assert.deepEqual(i.totals, {productsCents: 25800, freightCents: 18900, discountCents: 0, totalCents: 44700});
  assert.equal(i.payment.code, '03', 'paid by card');
  assert.deepEqual(i.export, {exitState: 'SP', place: 'LOCAL DE EMBARQUE DE EXEMPLO (dados de teste)', address: 'Rua de Exemplo, 100, São Paulo/SP', cnpj: '11.222.333/0001-81'}, 'grupo ZA: where the goods leave Brazil');
  assert.equal(i.additionalInfo, `${fiscal.EXAMPLE.fiscal.additionalInfo} Local de embarque: LOCAL DE EMBARQUE DE EXEMPLO (dados de teste), Rua de Exemplo, 100, São Paulo/SP, CNPJ 11.222.333/0001-81. Pedido nº: ${i.reference}`,
    'item g: the place of embarkation with its address and CNPJ, then the order');
  assert(!i.additionalInfo.includes('DIFAL'), 'no interstate ICMS line');
  assert.equal(i.bling.natureId, '4', 'the export nature in Bling');
  assert(!('bling' in buildInvoice({order: exportOrder(), city: null, environment: 'homologacao', provider: 'fake', env: ENV, ...fiscal.EXAMPLE}).invoice), 'only the Bling note carries the nature id');

  const noPassport = build(exportOrder({buyer: {name: 'John Smith', email: 'j@example.com', company: null}, shipTo: {...exportOrder().shipTo, number: '', complement: '', postalCode: '', district: '', state: '', country: 'US'}}));
  assert(noPassport.ok, noPassport.problems?.join('; '));
  assert.equal(noPassport.invoice.recipient.foreignId, '', 'the foreign document is optional on the note');
  assert.deepEqual([noPassport.invoice.recipient.address.number, noPassport.invoice.recipient.address.complement, noPassport.invoice.recipient.address.district, noPassport.invoice.recipient.address.country], ['S/N', '', 'Ciudad de México', 'ESTADOS UNIDOS']);
  const firm = build(exportOrder({buyer: {name: 'María', email: 'm@example.com', company: {name: 'Clínica Visión SA de CV'}, foreignId: 'VIS850101AB1'}}));
  assert.equal(firm.invoice.recipient.name, 'Clínica Visión SA de CV', 'a company abroad: its name');

  // The national note is the same as before: CEP, CFOP 5101, CPF, no export data.
  const national = buildInvoice({order: nationalOrder(), city: BH, environment: 'homologacao', provider: 'bling', env: ENV, ...fiscal.EXAMPLE}).invoice;
  assert.deepEqual([national.destination, national.items[0].cfop, national.items[0].icms.csosn, national.recipient.cpf, national.recipient.address.cityCode, national.bling.natureId, national.nature], ['1', '5101', '102', '52998224725', '3106200', '1', 'Venda de produção do estabelecimento']);
  assert(!('export' in national) && !national.additionalInfo.includes('Local de embarque') && national.items.every(x => !('tax' in x)));

  // What holds the note back, in plain words; nothing is sent.
  const problems = (o, extra) => build(o, extra).problems || [];
  const real = buildInvoice({order: exportOrder(), city: null, environment: 'homologacao', provider: 'bling', env: ENV});
  assert.equal(real.ok, false, 'the real store data: held back until the place of embarkation and the export nature are filled');
  assert.deepEqual(real.problems, ['Venda para o exterior: a nota de exportação só sai depois de preencher em api/_lib/fiscal.js: export.shipment.state, export.shipment.place, export.shipment.address, export.shipment.cnpj (veja "Venda para o exterior" no NFE-SETUP.md)']);
  assert(buildInvoice({order: nationalOrder(), city: BH, environment: 'homologacao', provider: 'bling', env: ENV}).ok, 'while the national note with the same real data goes');
  const withShipment = shipment => ({fiscal: {...fiscal.EXAMPLE.fiscal, export: {...fiscal.EXAMPLE.fiscal.export, shipment: {...fiscal.EXAMPLE.fiscal.export.shipment, ...shipment}}}});
  assert(problems(exportOrder(), withShipment({cnpj: '11.222.333/0001-00'})).some(p => p.includes('CNPJ do local de embarque inválido')), 'a CNPJ that does not check');
  assert(problems(exportOrder(), withShipment({state: 'EX'})).some(p => p.includes('UF do local de embarque inválida')), 'a Brazilian UF');
  for (const blank of [{place: ''}, {place: '  '}, {address: ''}]) assert(problems(exportOrder(), withShipment(blank)).some(p => p.includes('Local de embarque sem nome ou sem endereço')), `a blank place never goes out (${JSON.stringify(blank)})`);
  assert(problems(exportOrder(), withShipment({place: 'Centro Internacional de Tratamento de Encomendas dos Correios em São Paulo'})).some(p => p.includes('mais de 60 caracteres')), 'xLocExporta takes 60 characters');
  assert(problems(exportOrder({buyer: {email: 'x@example.com'}, shipTo: {...exportOrder().shipTo, recipient: ' '}})).includes('Pedido sem o nome do comprador'));
  // The tax unit (rejeição 817): UN keeps the pieces; KG the net weight; anything else, or a gap, holds the note back.
  const withExport = over => ({fiscal: {...fiscal.EXAMPLE.fiscal, export: {...fiscal.EXAMPLE.fiscal.export, ...over}}});
  const lamps = exportOrder({subtotalCents: 3 * 8900 + 12900, totalCents: 3 * 8900 + 12900 + 18900, items: [{productId: 'macacoscopio', title: 'Macacoscópio', quantity: 3, unitCents: 8900, selection: {}}, {productId: 'aviaoscopia', title: 'Aviãoscopia', quantity: 1, unitCents: 12900, selection: {}}]});
  assert.deepEqual(build(lamps).invoice.items.map(x => x.tax), [{unit: 'KG', quantity: 0.072}, {unit: 'KG', quantity: 0.166}], '3 × 24 g and 166 g');
  assert(build(exportOrder(), withExport({taxUnit: {'39269090': 'un'}})).invoice.items.every(x => !('tax' in x)), 'the table says UN: the pieces as they are');
  assert(problems(exportOrder(), withExport({taxUnit: {'39269090': 'PARES'}})).some(p => p.includes('Unidade tributável da exportação "PARES"')), 'a unit the site cannot convert to');
  assert.deepEqual(problems(exportOrder(), withExport({taxUnit: {}})), ['Unidade tributável da exportação a preencher em api/_lib/fiscal.js: export.taxUnit.39269090'], 'an NCM left out of the table');
  assert.deepEqual(problems(lamps, withExport({netG: {...fiscal.EXAMPLE.fiscal.export.netG, macacoscopio: 0}})), ['Peso da peça a preencher em api/_lib/fiscal.js: export.netG.macacoscopio'], 'a piece without its weight');
  assert(problems(exportOrder({shipTo: {...exportOrder().shipTo, country: 'ZZ'}})).some(p => p.includes('País de entrega desconhecido: "ZZ"')));
  assert(problems(exportOrder({shipTo: {...exportOrder().shipTo, city: ' '}})).some(p => p.includes('Endereço no exterior incompleto')));
  assert(problems(exportOrder({buyer: {...exportOrder().buyer, foreignId: 'AB#1'}})).some(p => p.includes('Documento do comprador estrangeiro inválido')));
  assert(problems(exportOrder({totalCents: 1})).some(p => p.includes('não somam')), 'the totals are checked as on a national note');
  assert(problems(exportOrder(), {company: {legalName: '[PREENCHER: razão social]', cnpj: '[PREENCHER: CNPJ]'}}).some(p => p.includes('Dados da empresa')));
}

// ── the body Bling receives ───────────────────────────────────────────
{
  const body = toBling(build(exportOrder()).invoice, '502');
  assert.equal(body.operacaoComExterior, true, 'an operation with the exterior: Bling treats a "saída" note as an export');
  assert.deepEqual(body.exportacao, {ufEmbarque: 'SP', localEmbarque: 'LOCAL DE EMBARQUE DE EXEMPLO (dados de teste)'});
  assert.equal(body.naturezaOperacao.id, 4);
  assert.deepEqual(body.contato, {nome: 'María López García', tipoPessoa: 'E', numeroDocumento: 'G12345678', contribuinte: 9, email: 'maria@example.com',
    endereco: {endereco: 'Avenida Insurgentes Sur', numero: '1602', complemento: 'Piso 3 · Código postal 03940', bairro: 'Crédito Constructor, Ciudad de México, CDMX', municipio: 'EXTERIOR', uf: 'EX', pais: 'MEXICO'}}, 'foreign contact, no CEP nor state registration');
  assert.deepEqual(body.transporte, {fretePorConta: 0, frete: 189}, 'freight mode and value');
  assert.deepEqual(body.itens.map(x => [x.classificacaoFiscal, x.origem, x.valor, x.quantidade, x.unidade, x.unidadeTributavel]), [['3926.90.90', 0, 129, 2, 'UN', {unidade: 'KG', quantidade: 0.15}]], 'sold by the piece, taxed in the unit of the export table');
  assert.equal(body.parcelas[0].valor, 447); assert.deepEqual(body.parcelas[0].formaPagamento, {id: 502});
  assert.match(body.observacoes, /Local de embarque: .*CNPJ 11\.222\.333\/0001-81\. Pedido nº: JU-/);
  const national = toBling(buildInvoice({order: nationalOrder(), city: BH, environment: 'homologacao', provider: 'bling', env: ENV, ...fiscal.EXAMPLE}).invoice, '502');
  assert.deepEqual(Object.keys(national), ['tipo', 'finalidade', 'dataEmissao', 'dataOperacao', 'naturezaOperacao', 'contato', 'itens', 'parcelas', 'transporte', 'observacoes'], 'the national body is the same as before');
  assert.deepEqual([national.contato.tipoPessoa, national.contato.endereco.uf, national.contato.endereco.cep, national.contato.endereco.pais], ['F', 'MG', '30140-071', 'Brasil']);
  assert(national.itens.every(x => !('unidadeTributavel' in x)), 'national items as before');
}

// ── through the simulated Bling ───────────────────────────────────────
{
  const store = createMemoryStore();
  const bling = createBling({store, env: ENV, fetchImpl: network});
  await bling.connect(fake.authorize(bling.authorizationUrl('s')).code, {actor: 'ju'});
  const invoicing = createInvoicing({store, env: ENV, fetchImpl: network});

  const {order: mexico} = await store.orders.create(exportOrder());
  const note = await invoicing.issue(mexico, {actor: 'ju@site.test'});
  assert.equal(note.status, 'autorizada', note.message || ''); assert.match(note.number, /^\d+$/); assert.equal(note.accessKey.length, 44);
  assert.equal(cepLookups.length, 0, 'an order for abroad never looks a CEP up');
  const sent = fake.notes.get(note.providerId).body;
  assert.deepEqual([sent.operacaoComExterior, sent.exportacao.ufEmbarque, sent.contato.tipoPessoa, sent.contato.endereco.uf, sent.contato.endereco.pais, sent.naturezaOperacao.id, sent.itens[0].unidadeTributavel], [true, 'SP', 'E', 'EX', 'MEXICO', 4, {unidade: 'KG', quantidade: 0.15}]);
  assert.equal((await invoicing.issue(mexico)).number, note.number, 'once per order, as the national notes');

  const {order: bh} = await store.orders.create(nationalOrder());
  const nationalNote = await invoicing.issue(bh);
  assert.equal(nationalNote.status, 'autorizada'); assert.equal(cepLookups.length, 1, 'the national order still checks its CEP');
  const nationalBody = fake.notes.get(nationalNote.providerId).body;
  assert(!('operacaoComExterior' in nationalBody) && !('exportacao' in nationalBody) && nationalBody.contato.tipoPessoa === 'F', 'and goes as before');

  // The simulated Bling refuses what the tax authority would: an export note without the place of embarkation.
  const provider = createBlingProvider({store, env: ENV, fetchImpl: network});
  const exportInvoice = build(exportOrder()).invoice;
  const noPlace = await provider.emit({...exportInvoice, export: {...exportInvoice.export, place: ''}});
  assert.equal(noPlace.status, 'erro'); assert.match(noPlace.message, /Rejeição 355/); assert.equal(noPlace.providerId, null);
  const noWeight = await provider.emit({...exportInvoice, items: exportInvoice.items.map(i => ({...i, tax: {unit: 'KG', quantity: 0}}))});
  assert.equal(noWeight.status, 'erro'); assert.match(noWeight.message, /quantidade tributável/);

  // The real store data (example data off): the export note waits for the data, Bling is never called for it.
  const realData = createInvoicing({store, env: {...ENV, NFE_EXAMPLE_DATA: ''}, fetchImpl: network});
  const before = creations();
  const {order: pendingExport} = await store.orders.create(exportOrder());
  const held = await realData.issue(pendingExport);
  assert.equal(held.status, 'erro'); assert.match(held.message, /^Venda para o exterior: a nota de exportação só sai depois de preencher em api\/_lib\/fiscal\.js: export\.shipment\.state/);
  assert.equal(held.nextAttemptAt, null, 'out of the queue until someone fills the data and clicks "Tentar de novo"');
  assert.equal(creations(), before, 'nothing sent to Bling');

  // A creation that broke midway for a buyer abroad without a document: the next attempt finds the note by the name.
  const {order: unsure} = await store.orders.create(exportOrder({buyer: {name: 'John Smith', email: 'j@example.com', company: null}, shipTo: {...exportOrder().shipTo, country: 'US'}}));
  fake.fail('queda', {count: 1, match: 'POST /nfe'});
  const marked = await invoicing.issue(unsure);
  assert.equal(marked.status, 'fila'); assert.match(marked.providerId, /^busca:\d{14}$/);
  const made = creations();
  const found = await invoicing.issue(unsure);
  assert.equal(found.status, 'autorizada', found.message || ''); assert.equal(creations(), made, 'found in Bling, never created twice');
  assert.equal(fake.notes.get(found.providerId).body.contato.nome, 'John Smith');
}

// ── panel: the export nature is named once it is filled ───────────────
{
  const store = createMemoryStore();
  const sha = t => crypto.createHash('sha256').update(t).digest(), raw = crypto.randomBytes(32).toString('base64url'), adminId = crypto.randomUUID();
  await store.admins.create({id: adminId, email: 'ju@site.test', passwordHash: 'x', totpEnabledAt: new Date()});
  await store.adminSessions.create({tokenHash: sha(raw), adminId, mfaAt: new Date(), expiresAt: new Date(Date.now() + 3600e3)});
  const res = {statusCode: 200, headers: {}, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(d) { this.body = d || ''; }};
  await blingEndpoint.create({env: {...ENV, NFE_EXAMPLE_DATA: ''}, store, fetchImpl: network})({method: 'GET', headers: {origin: 'https://site.test', 'x-forwarded-for': '203.0.113.7', cookie: `__Host-ju_admin=${raw}`}, body: {}, socket: {}, url: '/api/admin/bling'}, res);
  assert.deepEqual(JSON.parse(res.body).bling.natureIds, {nonTaxpayer: '15111617940', taxpayer: '15111617959', export: '15111672683'}, 'the export nature set in api/_lib/fiscal.js (09/10/2026): the panel lists it as used');
}

console.log('PASS: NF-e de exportação — the accountant\'s rules (nature "Exportação de mercadoria", CFOP 7101, CSOSN 300, place of embarkation with address and CNPJ in the complementary information, freight mode and value, no IPI CST, no DIFAL), the tax unit of the export table (KG: net weight), a foreign buyer (EXTERIOR, UF EX, the country, optional passport), held back with a clear message while the store\'s export data is to be filled (never the national notes), sent to the simulated Bling as an operation with the exterior, found again after a broken creation, the national note unchanged.');
