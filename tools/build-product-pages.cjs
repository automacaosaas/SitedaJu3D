'use strict';
// One page per product (audits C1 and J2): borboletoscopio.html, dinossauroscopio.html, aviaoscopia.html. A real address
// search engines can index and a link that shows the piece when shared: photo, price and Pix price, description, original
// colors, production time, delivery and returns, and two actions, "Personalizar o meu" (the configurator in the product
// window of the showcase) and "Adicionar nas cores originais" (straight to the mini-cart). Also writes sitemap.xml and
// robots.txt. Built from the shop's own data (products.js, commerce-config.js), from produtos.html (head, header and
// footer) and from the store's address in api/_lib/legal.js, so it never drifts from them.
// Run: node tools/build-product-pages.cjs   (or --check to only report; tests/product-landing.mjs fails when stale)
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {tags, base: siteBase, SITE} = require('./sync-meta.cjs');
const {COMPANY} = require('../api/_lib/legal');

const DIST = path.join(__dirname, '..', 'dist');
const esc = value => String(value ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const nbsp = text => text.replace(/ /g, '&nbsp;');
// Pages search engines may list (Sobre and Contato stay out while they are empty; account and checkout steps are private).
const LISTED = ['', 'produtos.html', '{products}', 'termos.html', 'privacidade.html', 'trocas.html'];
const PRIVATE = ['/admin.html', '/api/', '/checkout.html', '/comprar-agora.html', '/conta.html', '/email-preview.html'];

async function site() {
  const load = file => import(pathToFileURL(path.join(DIST, file)).href);
  const [products, commerce, icons, grid] = await Promise.all([load('products.js'), load('commerce-config.js'), load('icons.js'), load('product-grid.js')]);
  return {...products, ...commerce, icon: icons.icon, productGrid: grid.productGrid};
}

function page(id, data, base) {
  const {PRODUCTS, PRODUCT_CATEGORIES, COMMERCE, money, pixPrice, defaults, color, showcase, icon} = data;
  const product = PRODUCTS[id], price = COMMERCE.prices[id], theme = showcase(id).theme, chosen = defaults(id);
  const category = PRODUCT_CATEGORIES[product.category]?.label || product.category, url = `${siteBase()}/${id}.html`;
  const lines = base.replace(/\r\n/g, '\n');
  const head = lines.slice(lines.indexOf('<head>\n') + 7, lines.indexOf('  <!-- og -->'))
    .replace(/<meta name="description" content="[^"]*">/, () => `<meta name="description" content="${esc(`${product.title}: ${product.subtitle.toLowerCase()} impressa em 3D, nas cores que você escolher. ${product.description}`)}">`)
    .replace(/<title>[^<]*<\/title>/, () => `<title>${esc(product.title)} · ${esc(product.subtitle)} | Ju, imprime pra mim?</title>\n  <link rel="canonical" href="${esc(url)}">`)
    .replace('<link rel="stylesheet" href="mini-cart.css">', () => '<link rel="stylesheet" href="mini-cart.css">\n  <link rel="stylesheet" href="product-landing.css">');
  // Link preview with the piece's own picture and price, and the product data search engines read.
  const preview = tags({url, type: 'product', title: `${product.title} · ${product.subtitle} | ${SITE}`, description: product.description,
    image: {path: `assets/og-${id}.jpg`, width: 1200, height: 630, alt: `${product.title}, ${product.subtitle.toLowerCase()}, nas cores originais`},
    extra: [`<meta property="product:price:amount" content="${(price / 100).toFixed(2)}">`, '<meta property="product:price:currency" content="BRL">'],
    jsonLd: {'@context': 'https://schema.org', '@type': 'Product', name: product.title, description: product.description, sku: id, category,
      image: [`${siteBase()}/assets/${product.catalogImage || product.image}`, `${siteBase()}/assets/og-${id}.jpg`],
      brand: {'@type': 'Brand', name: SITE},
      offers: {'@type': 'Offer', url, priceCurrency: 'BRL', price: (price / 100).toFixed(2), availability: 'https://schema.org/MadeToOrder',
        itemCondition: 'https://schema.org/NewCondition', seller: {'@type': 'Organization', name: COMPANY.legalName}}}
  }).map(line => '  ' + line).join('\n') + '\n';
  const header = /<header class="header">[^]*?<\/header>/.exec(lines)[0];
  const footer = /<footer class="site-footer">[^]*?<\/footer>/.exec(lines)[0];
  const colors = product.parts.map(part => { const c = color(chosen[part.id]); return `<li><i style="--chip:${c.hex}" aria-hidden="true"></i><span>${esc(part.name)}: <strong>${esc(c.name)}</strong></span></li>`; }).join('');
  const style = `--pl-accent:${theme.accentColor};--pl-ink:${theme.textColor};--pl-muted:${theme.mutedColor};--pl-stops:${theme.bannerStops}`;
  const main = `<main class="pl-main" id="conteudo">
      <nav class="pl-crumbs" aria-label="Você está em"><a href="produtos.html">Produtos</a><span aria-hidden="true">/</span><span aria-current="page">${esc(product.title)}</span></nav>
      <article class="pl" style="${style}">
        <div class="pl-art"><img src="assets/${esc(product.catalogImage || product.image)}" alt="${esc(product.title)} nas cores originais" width="1254" height="1254" fetchpriority="high"></div>
        <div class="pl-info">
          <p class="pl-category">${esc(category)}</p>
          <h1>${esc(product.title)}</h1>
          <p class="pl-sub">${esc(product.subtitle)}</p>
          <p class="pl-price"><strong>${nbsp(money(price))}</strong><span class="pl-pix">${nbsp(money(pixPrice(price)))} no Pix</span></p>
          <p class="pl-installments">ou 3x sem juros no cartão</p>
          <p class="pl-desc">${esc(product.description)}</p>
          <div class="pl-colors"><h2>Cores originais</h2><ul>${colors}</ul>${product.fixed ? `<p class="pl-fixed">${esc(product.fixed)}</p>` : ''}</div>
          <div class="pl-actions"><a class="primary pl-customize" href="index.html#produto/${id}/personalizar">${icon('palette')}<span>Personalizar o meu</span></a><button type="button" class="pl-add" data-add-product="${id}">${icon('cart')}<span>Adicionar nas cores originais</span></button></div>
          <ul class="pl-facts">
            <li>${icon('clock')}<span><strong>Feito sob encomenda</strong>Produção em ${esc(COMMERCE.productionLabel)}</span></li>
            <li>${icon('truck')}<span><strong>Envio para todo o Brasil</strong>Frete calculado pelo CEP</span></li>
            <li>${icon('returns')}<span><strong>Trocas e Devoluções</strong><a href="trocas.html">Ver a política</a></span></li>
          </ul>
        </div>
      </article>
    </main>`;
  return `<!doctype html>\n<html lang="pt-BR">\n<head>\n${head}${preview}</head>\n<body class="product-landing">\n  <div class="page">\n    ${header}\n    ${main}\n    ${footer}\n  </div>\n</body>\n</html>\n`;
}

const sitemap = ids => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${LISTED.flatMap(entry => entry === '{products}' ? ids.map(id => `${id}.html`) : [entry])
  .map(entry => `  <url><loc>${esc(`${siteBase()}/${entry}`)}</loc></url>`).join('\n')}\n</urlset>\n`;
const robots = () => `User-agent: *\n${PRIVATE.map(p => `Disallow: ${p}`).join('\n')}\n\nSitemap: ${siteBase()}/sitemap.xml\n`;

async function build() {
  const data = await site(), ids = Object.keys(data.PRODUCTS);
  // produtos.html: the grid of products (audit B2), the same markup product-grid.js draws in the browser.
  const base = fs.readFileSync(path.join(DIST, 'produtos.html'), 'utf8').replace(/\r\n/g, '\n')
    .replace(/(<div class="product-grid" data-product-grid data-category="([a-z]+)"[^>]*><!-- grid -->)[^]*?(<!-- \/grid -->)/, (all, open, key, close) => open + data.productGrid(key) + close);
  return [{name: 'produtos.html', text: base}, ...ids.map(id => ({name: `${id}.html`, text: page(id, data, base)})), {name: 'sitemap.xml', text: sitemap(ids)}, {name: 'robots.txt', text: robots()}];
}

if (require.main === module) {
  (async () => {
    const check = process.argv.includes('--check'), stale = [];
    for (const {name, text} of await build()) {
      const file = path.join(DIST, name), current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : '';
      if (current === text) continue;
      stale.push(name);
      if (!check) fs.writeFileSync(file, text);
    }
    console.log(stale.length ? `${check ? 'desatualizada' : 'gerada'}: ${stale.join(', ')}` : 'páginas de produto, sitemap e robots em dia.');
    if (check && stale.length) process.exitCode = 1;
  })();
}

module.exports = {build, DIST};
