'use strict';
// One page per product (audits C1 and J2): borboletoscopio.html, dinossauroscopio.html, aviaoscopia.html. A real address
// search engines can index and a link that shows the piece when shared. Top to bottom: the piece (photo, and with
// product-landing.js the 3D model that turns) with its colors as dots on the top corner, the category as a badge, name,
// price with the Pix price, the two actions ("Adicionar nas cores originais" first; "Personalizar o meu" opens the colors right on the
// page, or the configurator of the showcase without JavaScript), production / delivery / returns as accordions, and "Sobre a
// peça" (description, original colors and what keeps its color). Also writes sitemap.xml and
// robots.txt. Built from the shop's own data (products.js, commerce-config.js), from produtos.html (head, header and
// footer) and from the store's address in api/_lib/legal.js, so it never drifts from them. Also writes the page
// Escolha o seu (escolha.html) from dist/escolha.js, and the novelty showcase of the slit lamps (fenda.html) and its home banner from
// dist/fenda-stage.js.
// Run: node tools/build-product-pages.cjs   (or --check to only report; tests/product-landing.mjs fails when stale)
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {tags, base: siteBase, SITE} = require('./sync-meta.cjs');
const {COMPANY} = require('../api/_lib/legal');

const DIST = path.join(__dirname, '..', 'dist');
const esc = value => String(value ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const nbsp = text => text.replace(/ /g, '&nbsp;');
// Pages search engines may list (Sobre stays out while it is empty; account and checkout steps are private).
const LISTED = ['', 'produtos.html', 'escolha.html', 'fenda.html', '{products}', 'contato.html', 'envio.html', 'termos.html', 'privacidade.html', 'trocas.html'];
const PRIVATE = ['/admin.html', '/api/', '/checkout.html', '/comprar-agora.html', '/conta.html', '/email-preview.html'];

async function site() {
  const load = file => import(pathToFileURL(path.join(DIST, file)).href);
  const [products, commerce, icons, grid, tour, motion] = await Promise.all([load('products.js'), load('commerce-config.js'), load('icons.js'), load('product-grid.js'), load('escolha.js'), load('hero-motion.js')]);
  const contact = await load('contact-link.js'), gallery = await load('gallery.js'), novelty = await load('fenda-stage.js');
  return {...products, ...commerce, icon: icons.icon, productGrid: grid.productGrid, chooseBanners: tour.chooseBanners, noveltyStage: novelty.noveltyStage, noveltyBanner: novelty.noveltyBanner, journeyColors: motion.journeyColors, splitContact: contact.splitContact, contactMail: contact.contactMail, staticViews: gallery.staticViews, hasGallery: gallery.hasGallery};
}

function page(id, data, base) {
  const {PRODUCTS, PRODUCT_CATEGORIES, COMMERCE, money, pixPrice, installmentLabel, defaults, color, showcase, icon, splitContact, contactMail, staticViews, hasGallery, fixedColors, kitOffer, badgeStyle} = data;
  const product = PRODUCTS[id], price = COMMERCE.prices[id], theme = showcase(id).theme, chosen = defaults(id);
  // a peça de cores fixas (as lâmpadas, 07/10/2026): as cores dela, a oferta do kit e só o botão de compra (nada para personalizar);
  // logo depois do botão, o lugar do "Monte seu kit" (escondido; product-landing.js o monta com kit-builder.js)
  const fixed = fixedColors(id);
  // "entre em contato" na descrição: link para o e-mail da Ju (contact-link.js)
  const [before, phrase, after] = splitContact(product.description);
  const description = phrase ? `${esc(before)}<a class="contact-mail" href="${esc(contactMail(`Dúvida sobre o ${product.title}`))}">${phrase}</a>${esc(after)}` : esc(product.description);
  const category = PRODUCT_CATEGORIES[product.category]?.label || product.category, url = `${siteBase()}/${id}.html`;
  const lines = base.replace(/\r\n/g, '\n');
  const head = lines.slice(lines.indexOf('<head>\n') + 7, lines.indexOf('  <!-- og -->'))
    .replace(/<meta name="description" content="[^"]*">/, () => `<meta name="description" content="${esc(`${product.title}: ${product.subtitle.toLowerCase()} impressa em 3D, ${fixed ? 'nas cores da peça' : 'nas cores que você escolher'}. ${product.description}`)}">`)
    .replace(/<title>[^<]*<\/title>/, () => `<title>${esc(product.title)} · ${esc(product.subtitle)} | Ju, imprime pra mim?</title>\n  <link rel="canonical" href="${esc(url)}">`)
    .replace('<link rel="stylesheet" href="mini-cart.css">', () => '<link rel="stylesheet" href="mini-cart.css">\n  <link rel="stylesheet" href="product-landing.css">')
    // the 3D model needs three.js by name (the same import map as the home; its hash is in the security policy)
    .replace('<script type="module" src="site-shell.js"></script><script type="module" src="catalog.js"></script>', () => '<script type="importmap">{"imports":{"three":"./vendor/three.module.min.js"}}</script>\n  <script type="module" src="site-shell.js"></script><script type="module" src="catalog.js"></script><script type="module" src="product-landing.js"></script>');
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
  // .pl-info: a piece with a "Novidade" badge (products.js badge: the lamps, 08/10/2026) shows it before the category, in the same
  // colours as in the product dialog (badgeStyle; product-landing.css .pl-badge.is-badge)
  // the colors as dots on the top corner of the picture; with product-landing.js a click opens the color picker on that part
  const dots = fixed ? product.colors.map(c => `<li><span class="pl-dot is-fixed" role="img" title="${esc(c.name)}" aria-label="${esc(c.name)}"><i style="--chip:${c.hex}" aria-hidden="true"></i></span></li>`).join('') : product.parts.map(part => { const c = color(chosen[part.id]); return `<li><button type="button" class="pl-dot" data-pl-part="${part.id}" aria-controls="pl-custom" title="${esc(part.name)}: ${esc(c.name)}" aria-label="${esc(part.name)}: ${esc(c.name)}"><i style="--chip:${c.hex}" aria-hidden="true"></i></button></li>`; }).join('');
  const colors = fixed ? product.colors.map(c => `<strong>${esc(c.name)}</strong>`).join(' · ') : product.parts.map(part => `${esc(part.name)}: <strong>${esc(color(chosen[part.id]).name)}</strong>`).join(' · ');
  const style = `--pl-accent:${theme.accentColor};--pl-ink:${theme.textColor};--pl-muted:${theme.mutedColor};--pl-stops:${theme.bannerStops}`;
  const fact = (name, title, note, text) => `<details class="pl-acc"><summary>${icon(name)}<span><strong>${title}</strong><small>${note}</small></span><i class="pl-acc-mark" aria-hidden="true"></i></summary><div class="pl-acc-body"><p>${text}</p></div></details>`;
  const main = `<main class="pl-main" id="conteudo">
      <nav class="pl-crumbs" aria-label="Você está em"><a href="produtos.html">Produtos</a><span aria-hidden="true">/</span><span aria-current="page">${esc(product.title)}</span></nav>
      <article class="pl" style="${style}" data-pl="${id}">
        <div class="pl-stage">
          <div class="pl-art${hasGallery(id) ? ' is-real' : ''}" data-pl-stage data-view="photo">${hasGallery(id) ? `<img class="pl-photo" src="${esc(staticViews(id)[0].src)}" alt="${esc(product.title)} — ${esc(staticViews(id)[0].name)}" width="1200" height="1500" fetchpriority="high">` : `<img class="pl-photo" src="assets/${esc(product.catalogImage || product.image)}"${data.artSrcset(product.catalogImage || product.image) ? ` srcset="${esc(data.artSrcset(product.catalogImage || product.image))}" sizes="${esc(data.PHOTO_SIZES)}"` : ''} alt="${esc(product.title)} nas cores originais" width="1254" height="1254" fetchpriority="high">`}<div class="pl-3d" data-pl-viewer hidden></div><p class="pl-status" data-pl-status role="status" hidden></p><ul class="pl-dots" data-pl-dots aria-label="Cores originais">${dots}</ul></div>
${hasGallery(id) ? `
          <div class="pl-thumbs" role="group" aria-label="Fotos da peça" data-pl-thumbs hidden>${staticViews(id).map(v => ({...v, alt: `${product.title} — ${v.name}`})).map((v, i) => `<button type="button" aria-pressed="${i === 0}" aria-label="${esc(v.name)}" data-src="${esc(v.src)}" data-alt="${esc(v.alt)}"${v.main ? ' data-main' : ''}><img src="${esc(v.thumb)}" alt="" width="${v.main ? 384 : 160}" height="${v.main ? 384 : 200}" loading="lazy" decoding="async" draggable="false"></button>`).join('')}</div>` : ''}
          <div class="pl-views" role="group" aria-label="Ver a peça" data-pl-views hidden><button type="button" data-pl-view="photo" aria-pressed="true">Foto</button><button type="button" data-pl-view="3d" aria-pressed="false">${icon('cube')}<span>Girar em 360°</span></button></div>
        </div>
        <div class="pl-info">
          ${product.badge ? `<p class="pl-badges"><span class="pl-badge is-badge" data-effect="${esc(product.eyebrowEffect || 'shine')}" style="${esc(badgeStyle(id))}">Novidade</span><span class="pl-badge">${esc(category)}</span></p>` : `<p class="pl-badge">${esc(category)}</p>`}
          <h1>${esc(product.title)}</h1>
          <p class="pl-sub">${esc(product.subtitle)}</p>
          <p class="pl-price"><strong>${nbsp(money(price))}</strong><span class="pl-pix">${nbsp(money(pixPrice(price)))} no Pix</span></p>
          <p class="pl-installments">ou ${nbsp(installmentLabel(price))} sem juros no cartão</p>${COMMERCE.extraPrices?.[id] ? `
          <p class="pl-offer">Levando 2, o segundo sai por ${nbsp(money(COMMERCE.extraPrices[id]))}</p>` : kitOffer(id) ? `
          <p class="pl-offer">${esc(kitOffer(id))}</p>` : ''}
          ${fixed ? `<div class="pl-actions is-single"><button type="button" class="pl-add" data-add-product="${id}">${icon('cart')}<span>Adicionar ao carrinho</span></button></div>${kitOffer(id) ? `
          <section class="pl-kit" data-pl-kit aria-labelledby="pl-kit-title" hidden><div class="pl-kit-head"><h2 id="pl-kit-title">Monte seu kit</h2><span class="pl-kit-mix">pode misturar</span></div><div data-pl-kit-body></div></section>` : ''}` : `<div class="pl-actions"><button type="button" class="pl-add" data-add-product="${id}">${icon('cart')}<span>Adicionar nas cores originais</span></button><a class="pl-customize" href="index.html#produto/${id}/personalizar" data-pl-customize>${icon('palette')}<span>Personalizar o meu</span></a></div>
          <div class="pl-custom" id="pl-custom" data-pl-custom hidden></div>`}
          <div class="pl-facts">
            ${fact('clock', 'Feito sob encomenda', `Produção em ${esc(COMMERCE.productionLabel)}`, `Cada peça é impressa depois do pedido, ${fixed ? 'nas cores dela' : 'nas cores escolhidas'}. A produção começa depois da confirmação do pagamento. <a href="envio.html#prazo">Ver envio e prazos</a>`)}
            ${fact('truck', 'Envio para todo o Brasil', 'Frete calculado pelo CEP', 'Enviamos pelos Correios. O frete e o prazo de entrega saem pelo CEP, já no carrinho. <a href="envio.html#frete">Ver envio e prazos</a>')}
            ${fact('returns', 'Trocas e Devoluções', 'Desistência em até 7 dias', 'Você pode desistir em até 7 dias depois de receber. <a href="trocas.html">Ver a política</a>')}
          </div>
          <section class="pl-about"><h2>Sobre a peça</h2><p class="pl-desc">${description}</p><p class="pl-note"><span>${fixed ? 'Cores da peça' : 'Cores originais'}:</span> ${colors}.</p>${product.fixed ? `<p class="pl-note"><span>Observação:</span> ${esc(product.fixed)}</p>` : ''}</section>
        </div>
      </article>
    </main>`;
  // The piece's own colors from the first frame: journey.js applies them to the header, background and buttons and carries
  // them on, so the logo, Início and the cart lead back to a showcase that opens on this piece.
  const journey = `data-theme-product="${id}" data-theme-colors="${esc(JSON.stringify(data.journeyColors(theme)))}"`;
  return `<!doctype html>\n<html lang="pt-BR" ${journey}>\n<head>\n${head}${preview}</head>\n<body class="product-landing">\n  <div class="page">\n    ${header}\n    ${main}\n    ${footer}\n  </div>\n</body>\n</html>\n`;
}

// Escolha o seu: um banner por família de encaixe, cada um abrindo a
// página Produtos só com as peças daquele equipamento (produtos.html?encaixe=<família>). Head, header e footer de produtos.html.
function choosePage(data, base) {
  const url = `${siteBase()}/escolha.html`, title = `Escolha o seu · ${SITE}`;
  const description = 'Comece pelo equipamento da sua consulta: retinoscópio, régua de esquiascopia ou lâmpada de fenda. Peças impressas em 3D.';
  const head = base.slice(base.indexOf('<head>\n') + 7, base.indexOf('  <!-- og -->'))
    .replace(/<meta name="description" content="[^"]*">/, () => `<meta name="description" content="${esc(description)}">`)
    .replace(/<title>[^<]*<\/title>/, () => `<title>${esc(title)}</title>\n  <link rel="canonical" href="${esc(url)}">`)
    .replace('<link rel="stylesheet" href="mini-cart.css">', () => '<link rel="stylesheet" href="mini-cart.css">\n  <link rel="stylesheet" href="escolha.css">');
  const preview = tags({url, title, description}).map(line => '  ' + line).join('\n') + '\n';
  const header = /<header class="header">[^]*?<\/header>/.exec(base)[0];
  const footer = /<footer class="site-footer">[^]*?<\/footer>/.exec(base)[0];
  const back = /<a class="catalog-back showcase-return"[^]*?<\/a>/.exec(base)[0];
  const main = `<main class="choose-main" id="conteudo">${back}
      <header class="choose-head"><p class="eyebrow">O 3D NAS SUAS CONSULTAS</p><h1>Escolha o seu</h1><p>Comece pelo equipamento da sua consulta.</p></header>
      <div class="choose-banners">${data.chooseBanners()}</div>
    </main>`;
  return `<!doctype html>\n<html lang="pt-BR">\n<head>\n${head}${preview}</head>\n<body class="choose-page">\n  <div class="page">\n    ${header}\n    ${main}\n    ${footer}\n  </div>\n</body>\n</html>\n`;
}

// Vitrine de novidade das lâmpadas de fenda (fenda.html, endereço curto /fenda; o banner da home e o flyer levam a ela): o palco de
// fenda-stage.js (a peça encaixada no centro, as vizinhas desfocadas, "Ver mais" com o preço, as cores e o "Monte seu kit"), com o fundo
// da vitrine da home (carousel.css), a figura da página Escolha o seu (escolha.css) e o selo e o kit da página da peça
// (product-landing.css). Embaixo, como a compra funciona e os dois botões de WhatsApp (fenda.js). Prévia de link: assets/og-fenda.jpg
// (tools/flyer-fenda/render.cjs).
const FENDA = 'lampada';
function fendaPage(data, base) {
  // o endereço da página (canônico, sitemap, prévia) e o curto, do flyer e da mensagem do WhatsApp (o servidor abre /fenda como fenda.html)
  const {COMMERCE, pixPercent, kitOffer, icon, FAMILIES} = data, url = `${siteBase()}/fenda.html`, short = `${siteBase()}/fenda`, first = FAMILIES[FENDA].items[0];
  const title = `Novidade: encaixe para lâmpada de fenda · ${SITE}`;
  const description = 'MonkeyLamp, GiraffeLamp e UnicornLamp: capas impressas em 3D que se encaixam na lâmpada de fenda portátil. ' + kitOffer(first) + '.';
  const head = base.slice(base.indexOf('<head>\n') + 7, base.indexOf('  <!-- og -->'))
    .replace(/<meta name="description" content="[^"]*">/, () => `<meta name="description" content="${esc(description)}">`)
    .replace(/<title>[^<]*<\/title>/, () => `<title>${esc(title)}</title>\n  <link rel="canonical" href="${esc(url)}">`)
    .replace('<link rel="stylesheet" href="mini-cart.css">', () => '<link rel="stylesheet" href="mini-cart.css">\n  <link rel="stylesheet" href="carousel.css"><link rel="stylesheet" href="escolha.css"><link rel="stylesheet" href="product-landing.css"><link rel="stylesheet" href="fenda.css">')
    .replace('<script type="module" src="catalog.js"></script>', () => '<script type="module" src="catalog.js"></script><script type="module" src="fenda.js"></script>');
  const preview = tags({url, title, description, image: {path: 'assets/og-fenda.jpg', width: 1200, height: 630, alt: 'MonkeyLamp, GiraffeLamp e UnicornLamp, as capas para lâmpada de fenda, com o selo Novidade'}}).map(line => '  ' + line).join('\n') + '\n';
  const header = /<header class="header">[^]*?<\/header>/.exec(base)[0];
  const footer = /<footer class="site-footer">[^]*?<\/footer>/.exec(base)[0];
  const back = /<a class="catalog-back showcase-return"[^]*?<\/a>/.exec(base)[0];
  const share = `https://wa.me/?text=${encodeURIComponent(`Olha que fofura: capas impressas em 3D para a lâmpada de fenda portátil, da Ju, imprime pra mim? Conheça: ${short}`)}`;
  const main = `<main class="nv-main" id="conteudo">${back}
      ${data.noveltyStage(FENDA)}
      <section class="nv-foot" aria-label="Como funciona">
        <ul class="nv-facts">
          <li>${icon('clock')}<span><strong>Feito sob encomenda</strong>Produção em ${esc(COMMERCE.productionLabel)}</span></li>
          <li>${icon('truck')}<span><strong>Envio para todo o Brasil</strong>Frete calculado pelo CEP</span></li>
          <li>${icon('pix')}<span><strong>${pixPercent}% de desconto no Pix</strong>${esc(kitOffer(first))}</span></li>
        </ul>
        <p class="nv-actions"><a class="nv-share" href="${esc(share)}" target="_blank" rel="noopener" data-nv-share>${icon('whatsapp')}<span>Enviar a um colega</span></a><a class="nv-ju" href="contato.html" data-nv-ju>${icon('chat')}<span>Falar com a Ju</span></a></p>
      </section>
    </main>`;
  return `<!doctype html>\n<html lang="pt-BR">\n<head>\n${head}${preview}</head>\n<body class="fenda-page">\n  <div class="page">\n    ${header}\n    ${main}\n    ${footer}\n  </div>\n</body>\n</html>\n`;
}
// O banner da novidade na home, entre <!-- novidade --> e <!-- /novidade --> (fenda-stage.js › noveltyBanner).
const withBanner = (html, data) => html.replace(/(<!-- novidade -->)[^]*?(<!-- \/novidade -->)/, (all, open, close) => open + data.noveltyBanner(FENDA) + close);

const sitemap = ids => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${LISTED.flatMap(entry => entry === '{products}' ? ids.map(id => `${id}.html`) : [entry])
  .map(entry => `  <url><loc>${esc(`${siteBase()}/${entry}`)}</loc></url>`).join('\n')}\n</urlset>\n`;
const robots = () => `User-agent: *\n${PRIVATE.map(p => `Disallow: ${p}`).join('\n')}\n\nSitemap: ${siteBase()}/sitemap.xml\n`;

async function build() {
  const data = await site(), ids = Object.keys(data.PRODUCTS);
  // produtos.html: the grid of products (audit B2), the same markup product-grid.js draws in the browser.
  const base = fs.readFileSync(path.join(DIST, 'produtos.html'), 'utf8').replace(/\r\n/g, '\n')
    .replace(/(<div class="product-grid" data-product-grid data-category="([a-z]+)"[^>]*><!-- grid -->)[^]*?(<!-- \/grid -->)/, (all, open, key, close) => open + data.productGrid(key) + close);
  const home = withBanner(fs.readFileSync(path.join(DIST, 'index.html'), 'utf8').replace(/\r\n/g, '\n'), data);
  return [{name: 'produtos.html', text: base}, {name: 'index.html', text: home}, {name: 'escolha.html', text: choosePage(data, base)}, {name: 'fenda.html', text: fendaPage(data, base)}, ...ids.map(id => ({name: `${id}.html`, text: page(id, data, base)})), {name: 'sitemap.xml', text: sitemap(ids)}, {name: 'robots.txt', text: robots()}];
}

if (require.main === module) {
  (async () => {
    const check = process.argv.includes('--check'), stale = [];
    for (const {name, text} of await build()) {
      const file = path.join(DIST, name), current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : '';
      if (current === text) continue;
      stale.push(name);
      // keeps the file's own line endings (index.html is CRLF in the working copy on Windows)
      if (!check) fs.writeFileSync(file, /\r\n/.test(current ? fs.readFileSync(file, 'utf8') : '') ? text.replace(/\n/g, '\r\n') : text);
    }
    console.log(stale.length ? `${check ? 'desatualizada' : 'gerada'}: ${stale.join(', ')}` : 'páginas de produto, sitemap e robots em dia.');
    if (check && stale.length) process.exitCode = 1;
  })();
}

module.exports = {build, DIST};
