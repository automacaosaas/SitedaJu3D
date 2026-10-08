'use strict';
// Link previews (Open Graph): what WhatsApp, Instagram and other apps show when someone shares a page of the store
// (audit J1). One block per page, between <!-- og --> and <!-- /og -->, written from the table below and from the
// store's address in api/_lib/legal.js (COMPANY.website), so the launch domain is changed in one place. Like
// tools/sync-legal.cjs: static HTML, readable without scripts; tests/storefront.mjs fails if a page is out of date.
// Run: node tools/sync-meta.cjs   (or --check to only report)
const fs = require('node:fs');
const path = require('node:path');
const {COMPANY, contact} = require('../api/_lib/legal');

const DIST = path.join(__dirname, '..', 'dist');
const IMAGE = {path: 'assets/og-ju.jpg', width: 1200, height: 630, alt: 'Borboletoscópio, Dinossauroscópio e Aviãoscopia ao lado da frase "Mais cor na consulta. Mais encanto em cada olhar."'};
const SITE = 'Ju, imprime pra mim?';
const SHOP = 'Mais cor na consulta, mais encanto em cada olhar: capas para retinoscópio e avião para régua de grau, impressos em 3D nas cores que você escolher.';

// Every page a person may share. Pages only for signed-in steps get the shop's general preview. canonical: the page's own
// address on the shop's domain (apex), for search engines (2026-10-07): the pages listed in sitemap.xml; never on the pages
// marked noindex (Sobre while empty, account and checkout), whose og:url points elsewhere.
const PAGES = {
  'index.html': {url: '', canonical: true, title: 'Ju, imprime pra mim? · Peças em 3D para a consulta', description: SHOP},
  'produtos.html': {canonical: true, title: 'Produtos · Ju, imprime pra mim?', description: 'Borboletoscópio, Dinossauroscópio e Aviãoscopia: peças impressas em 3D para a consulta, personalizadas nas cores que você escolher.'},
  'sobre.html': {title: 'Sobre a Ju · Ju, imprime pra mim?', description: SHOP},
  'contato.html': {canonical: true, title: 'Fale com a Ju · Contato e perguntas frequentes | Ju, imprime pra mim?', description: `Fale com a Ju pelo ${contact().whatsapp ? 'WhatsApp, pelo ' : ''}formulário, e-mail ou Instagram, e veja as respostas sobre prazos, pagamento, frete, trocas e peças personalizadas.`},
  'termos.html': {canonical: true, title: 'Termos de Uso · Ju, imprime pra mim?', description: 'Termos de Uso da loja Ju, imprime pra mim?: conta, pedidos sob encomenda, pagamento, produção, entrega e seus direitos.'},
  'privacidade.html': {canonical: true, title: 'Política de Privacidade · Ju, imprime pra mim?', description: 'Política de Privacidade da loja Ju, imprime pra mim?: quais dados coletamos, para quê, com quem compartilhamos e como exercer seus direitos (LGPD).'},
  'trocas.html': {canonical: true, title: 'Trocas e Devoluções · Ju, imprime pra mim?', description: 'Trocas e Devoluções da loja Ju, imprime pra mim?: desistência em 7 dias, peças com defeito e como o valor é devolvido.'},
  'envio.html': {canonical: true, title: 'Envio e prazos · Ju, imprime pra mim?', description: 'Envio e prazos da loja Ju, imprime pra mim?: produção sob encomenda em 3 a 5 dias úteis, frete pelos Correios calculado pelo CEP e frete grátis a partir de R$ 500,00.'},
  'checkout.html': {url: '', title: 'Ju, imprime pra mim? · Peças em 3D para a consulta', description: SHOP},
  'comprar-agora.html': {url: '', title: 'Ju, imprime pra mim? · Peças em 3D para a consulta', description: SHOP},
  'conta.html': {url: '', title: 'Ju, imprime pra mim? · Peças em 3D para a consulta', description: SHOP}
};

const esc = value => String(value).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const base = () => String(COMPANY.website).replace(/\/+$/, '');

// The tags of one page. jsonLd: structured data for search engines (schema.org), written as a data block that is never
// executed (so the Content-Security-Policy has nothing to allow). extra: more <meta> lines (product price, for instance).
function tags({url, title, description, image = IMAGE, type = 'website', extra = [], jsonLd = null, canonical = false}) {
  return [
    '<!-- og -->',
    ...(canonical ? [`<link rel="canonical" href="${esc(url)}">`] : []),
    `<meta property="og:type" content="${esc(type)}">`,
    `<meta property="og:site_name" content="${esc(SITE)}">`,
    '<meta property="og:locale" content="pt_BR">',
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(`${base()}/${image.path}`)}">`,
    `<meta property="og:image:width" content="${image.width}">`,
    `<meta property="og:image:height" content="${image.height}">`,
    `<meta property="og:image:alt" content="${esc(image.alt)}">`,
    ...extra,
    '<meta name="twitter:card" content="summary_large_image">',
    ...(jsonLd ? [`<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`] : []),
    '<!-- /og -->'
  ];
}
// Who the shop is, for search engines (on the home page). The phone (the WhatsApp of api/_lib/legal.js, as
// "+55-31-99198-1151") and the service channel only once the number is filled in.
const intlPhone = digits => digits.replace(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/, '+$1-$2-$3-$4');
function organization() {
  const {whatsapp, email} = contact(), telephone = whatsapp ? intlPhone(whatsapp) : '';
  return {'@context': 'https://schema.org', '@type': 'Organization', name: SITE, legalName: COMPANY.legalName, url: `${base()}/`,
    logo: `${base()}/assets/logo-ju.webp`, sameAs: ['https://www.instagram.com/juimprimepramim/'],
    ...(telephone ? {telephone, contactPoint: {'@type': 'ContactPoint', contactType: 'customer service', telephone, ...(email ? {email} : {}), areaServed: 'BR', availableLanguage: ['Portuguese', 'English', 'Spanish']}} : {})};
}

function block(name) {
  const page = PAGES[name];
  return tags({url: `${base()}/${page.url ?? name}`, title: page.title, description: page.description, jsonLd: name === 'index.html' ? organization() : null, canonical: Boolean(page.canonical)});
}

function sync(html, name) {
  if (!PAGES[name]) return html;
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const lines = block(name).map(line => '  ' + line).join(eol);
  const existing = /[ \t]*<!-- og -->[^]*?<!-- \/og -->/;
  if (existing.test(html)) return html.replace(existing, () => lines);
  if (!html.includes('</head>')) throw new Error(`${name}: no </head>`);
  return html.replace('</head>', () => lines + eol + '</head>');
}

const pages = () => Object.keys(PAGES).filter(name => fs.existsSync(path.join(DIST, name)));

if (require.main === module) {
  const check = process.argv.includes('--check');
  const stale = [];
  for (const name of pages()) {
    const file = path.join(DIST, name), html = fs.readFileSync(file, 'utf8'), next = sync(html, name);
    if (next === html) continue;
    stale.push(name);
    if (!check) fs.writeFileSync(file, next);
  }
  console.log(stale.length ? `${check ? 'desatualizada' : 'atualizada'}: ${stale.join(', ')}` : 'todas as páginas em dia.');
  if (check && stale.length) process.exitCode = 1;
}

module.exports = {sync, pages, block, tags, base, PAGES, IMAGE, SITE, DIST};
