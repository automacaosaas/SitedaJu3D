// "Meus pedidos" (dist/account.js): the cards drawn from real order data, without a browser. The block of account.js that
// builds them runs in a sandbox with the shop's own products (dist/products.js) and plain stand-ins for the page helpers.
// Run: node tests/meus-pedidos.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../dist/account.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const start = source.indexOf('// "Meus pedidos": the account\'s orders'), end = source.indexOf('// A panel under a card');
assert(start > 0 && end > start, 'the "Meus pedidos" block is where the test expects it');
const {PRODUCTS, SOON, color, paint} = await import(new URL('../dist/products.js', import.meta.url).href);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const context = vm.createContext({esc, icon: name => `<svg data-icon="${name}"></svg>`, money: cents => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`, getLanguage: () => 'pt-BR', PRODUCTS, SOON, color, paint, Intl, Date});
vm.runInContext(source.slice(start, end) + '\nObject.assign(globalThis, {orderCard, demoCard, filterBar, noOrders, setFilter: value => { orderFilter = value; }});', context);
const {orderCard, demoCard, filterBar, noOrders, setFilter} = context;

const selection = Object.fromEntries(PRODUCTS.dinossauroscopio.parts.map(part => [part.id, part.default]));
const base = {reference: 'JU-71AF26EB97', createdAt: '2026-10-05T14:00:00.000Z', paidAt: '2026-10-05T14:02:00.000Z', method: 'pix', test: true, refunded: false,
  items: [{productId: 'dinossauroscopio', title: 'Dinossauroscópio', quantity: 2, unitCents: 13900, selection}],
  subtotalCents: 27800, shippingCents: 2990, discountCents: 1390, totalCents: 29400, trackingCode: null, tracking: null, invoice: null};
const card = extra => orderCard({...base, ...extra});

// ── the top of the card: the short number (the full code stays in the details), the date and the badge ──
let html = card({status: 'confirmado'});
assert.match(html, /<h3 id="pedido-JU-71AF26EB97"><span>Pedido<\/span> <span class="order-number" translate="no">#71AF26<\/span><\/h3>/);
assert.match(html, /<time datetime="2026-10-05T14:00:00.000Z">05 out 2026<\/time>/);
assert(html.includes('<dt>Código completo</dt><dd><span translate="no">JU-71AF26EB97</span></dd>'), 'the full code, as in the e-mails');
assert.doesNotMatch(html, /<header|<footer/, 'plain blocks: the site styles every header and footer');

// ── badge (words and tone) and the steps, for every stage the buyer can see ──
const now = h => (h.match(/<li class="is-now" aria-current="step"><span>([^<]+)<\/span><\/li>/) || [])[1] || null;
const stages = [
  [{status: 'aguardando_pagamento'}, 'Aguardando pagamento', 'neutral', 'Pagamento'],
  [{status: 'pendente'}, 'Pagamento confirmado', 'wait', 'Produção 3D'],
  [{status: 'confirmado'}, 'Em produção', 'making', 'Produção 3D'],
  [{status: 'enviado', trackingCode: 'AA123456785BR'}, 'Em trânsito', 'transit', 'Entregue'],
  [{status: 'enviado', trackingCode: 'AA123456785BR', tracking: {state: 'saiu_para_entrega'}}, 'Saiu para entrega', 'transit', 'Entregue'],
  [{status: 'enviado', trackingCode: 'AA123456785BR', tracking: {state: 'aguardando_retirada'}}, 'Aguardando retirada', 'wait', 'Entregue'],
  [{status: 'enviado', trackingCode: 'AA123456785BR', tracking: {state: 'problema'}}, 'Entrega não realizada', 'stop', 'Entregue'],
  [{status: 'enviado', trackingCode: 'AA123456785BR', tracking: {state: 'devolvido'}}, 'Devolvido ao remetente', 'stop', 'Entregue'],
  [{status: 'concluido', trackingCode: 'AA123456785BR', tracking: {state: 'entregue'}}, 'Entregue', 'done', null],
  [{status: 'recusado', refunded: true}, 'Não pôde ser atendido', 'stop', null]
];
for (const [extra, label, tone, step] of stages) {
  html = card(extra);
  assert(html.includes(`class="order-card tone-${tone}"`), `${label}: tone ${tone}`);
  assert(html.includes(`<span class="order-badge">${label}</span>`), `${label}: badge`);
  assert.equal(now(html), step, `${label}: the step it is in`);
}
assert.equal((card({status: 'concluido'}).match(/class="is-done"/g) || []).length, 4, 'delivered: the four steps behind it');
assert.doesNotMatch(card({status: 'recusado'}), /order-steps/, 'declined: no steps bar');
assert(card({status: 'recusado', refunded: true}).includes('<p class="order-flag">Valor estornado</p>'));

// ── body: the pieces with their colours, the total, the invoice; foot: the buttons ──
html = card({status: 'enviado', trackingCode: 'AA123456785BR', tracking: {state: 'saiu_para_entrega', last: {description: 'Objeto saiu para entrega ao destinatário', place: {city: 'SAO PAULO', uf: 'SP'}, at: '2026-10-06T12:00:00.000Z'}}, invoice: {number: 123, pdfUrl: 'https://exemplo.test/nfe.pdf'}});
assert.match(html, /<img src="assets\/card-preview-dinossauroscopio\.webp" alt="" width="56" height="56" loading="lazy" decoding="async">/);
assert.match(html, /<strong>2×<\/strong> <span translate="no">Dinossauroscópio<\/span>/);
assert.equal((html.match(/<i style="--swatch:#[0-9a-f]{6}"/gi) || []).length, PRODUCTS.dinossauroscopio.parts.length, 'one dot per coloured part');
assert(html.includes('<span translate="no">Objeto saiu para entrega ao destinatário</span> · <span translate="no">Sao Paulo/SP</span>'), 'the last event on the card');
assert(html.includes('<div class="order-sum"><span>Total</span><strong>R$ 294,00</strong></div>'));
assert(html.includes('<a class="order-invoice" href="https://exemplo.test/nfe.pdf" target="_blank" rel="noopener"><svg data-icon="document"></svg><span>Nota fiscal</span> <span translate="no">nº 123</span></a>'));
assert(html.includes('data-more="JU-71AF26EB97" aria-expanded="false" aria-controls="detalhes-JU-71AF26EB97"'));
assert(html.includes('data-track="JU-71AF26EB97" aria-expanded="false" aria-controls="rastreio-JU-71AF26EB97"'), 'posted: "Rastrear pacote"');
assert(html.includes('<ol class="order-timeline" id="timeline-JU-71AF26EB97"></ol>'), 'the timeline, filled when it opens');
assert.doesNotMatch(card({status: 'confirmado'}), /data-track=/, 'not posted yet: no tracking button');
// the details: payment, the code for the Correios, each piece with its colours, the totals
assert(html.includes('<dt>Forma de pagamento</dt><dd>Pix</dd>') && html.includes('<code translate="no">AA123456785BR</code>'));
assert(html.includes(`<span>${PRODUCTS.dinossauroscopio.parts[0].name}</span>: <span>${color(selection[PRODUCTS.dinossauroscopio.parts[0].id]).name}</span>`), 'each part with its colour, by name');
for (const [label, value] of [['Subtotal', 'R$ 278,00'], ['Frete', 'R$ 29,90'], ['Desconto no Pix', '− R$ 13,90']]) assert(html.includes(`<dt>${label}</dt><dd>${value}</dd>`), label);
assert(card({status: 'pendente', shippingCents: 0, discountCents: 0}).includes('<dt>Frete</dt><dd>Grátis</dd>'));
assert.doesNotMatch(card({status: 'pendente', discountCents: 0}), /Desconto no Pix/, 'no discount line without a discount');
assert(card({status: 'pendente', method: 'card'}).includes('<dd>Cartão de crédito</dd>') && card({status: 'pendente', method: 'debit'}).includes('<dd>Cartão de débito</dd>'));

// ── nothing typed by a person or sent by the Correios reaches the page as markup ──
html = card({status: 'enviado', trackingCode: 'AA123456785BR', items: [{productId: 'x', title: '<img src=x onerror=alert(1)>', quantity: 1, unitCents: 100}], tracking: {state: 'em_transito', last: {description: '<script>x</script>', at: '2026-10-06T12:00:00.000Z'}}});
assert.doesNotMatch(html, /<img src=x|<script>/);
assert(html.includes('&lt;img src=x onerror=alert(1)&gt;') && html.includes('<span class="order-thumb-empty"><svg data-icon="bag"></svg></span>'), 'unknown piece: escaped name and a plain icon');

// ── the pills: only with orders in more than one stage; the chosen one hides the others ──
const of = (...statuses) => statuses.map(status => ({...base, status}));
assert.equal(filterBar(of('enviado', 'enviado')), '', 'one stage: nothing to filter');
html = filterBar(of('pendente', 'confirmado', 'enviado', 'recusado'));
assert(html.includes('role="group" aria-label="Filtrar pedidos"'));
assert.deepEqual([...html.matchAll(/data-filter="(\w+)" aria-pressed="(\w+)"><span>([^<]+)<\/span> <span class="orders-filter-count">(\d+)<\/span>/g)].map(m => m.slice(1).join(' ')),
  ['todos true Todos 4', 'producao false Em produção 2', 'enviados false Enviados 1'], 'Todos counts every order; a stage without orders has no pill');
setFilter('enviados');
assert.match(card({status: 'confirmado'}), /data-group="producao" aria-labelledby="pedido-JU-71AF26EB97" hidden>/, 'another stage is hidden');
assert.doesNotMatch(card({status: 'enviado'}), / hidden>/);
setFilter('todos');

// ── no orders yet, and the orders of the demonstration (payments off) ──
assert(noOrders.includes('<h3>Você ainda não fez nenhum pedido.</h3><p>Que tal dar uma olhada nas nossas coleções?</p><a class="primary account-submit" href="produtos.html">Ver as coleções'));
html = demoCard({id: 'DEMO-AB12CD34', total: 12900, items: [{title: 'Borboletoscópio', quantity: 1}]});
assert(html.includes('#AB12CD') && html.includes('Pagamento simulado · nenhuma cobrança') && html.includes('R$ 129,00'));

// ── every new word has its English and Spanish (a Spanish word may be the same as the Portuguese: "Todos") ──
const dictionary = fs.readFileSync(new URL('../dist/translations.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const rows = new Map(dictionary.slice(dictionary.indexOf('`') + 1, dictionary.lastIndexOf('`.trim()')).trim().split('\n').map(line => line.split('|')).map(([pt, en, es]) => [pt, {en, es}]));
const translate = (text, lang) => rows.get(text)?.[lang];
for (const text of ['Acompanhe a produção e a entrega dos seus pedidos.', 'Filtrar pedidos', 'Todos', 'Em produção', 'Enviados', 'Concluídos', 'Não pôde ser atendido', 'Pagamento', 'Produção 3D', 'Envio', 'Entregue',
  'Detalhes do pedido', 'Ocultar detalhes', 'Rastrear pacote', 'Ocultar rastreio', 'Código completo', 'Data da compra', 'Forma de pagamento', 'Cartão de crédito', 'Cartão de débito', 'Frete', 'Desconto no Pix',
  'Nota fiscal', 'Você ainda não fez nenhum pedido.', 'Que tal dar uma olhada nas nossas coleções?', 'Ver as coleções', 'Andamento do pedido'])
  for (const lang of ['en', 'es']) assert(translate(text, lang)?.trim(), `${lang}: ${text}`);

console.log('PASS: Meus pedidos — short number with the full code in the details, badge and tone for every stage (and where the package stands), the four steps, pieces with their colours, total, invoice, the details and tracking buttons, escaped text, the filter pills, the empty and demonstration states, EN/ES.');
