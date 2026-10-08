#!/usr/bin/env node
// Prévia de link (og:image, 1200 x 630) das lâmpadas — macaco, girafa e unicórnio (07/10/2026, à venda): o mesmo desenho das outras
// peças (logo, categoria, nome, subtítulo, selo do Pix e a frase de baixo, com a foto da vitrine à direita, no degradê da peça), com a
// oferta do kit na frase de baixo. Grava dist/assets/og-<peça>.jpg. Chrome sem janela.
//   node tools/og-lampadas.cjs
const fs = require('node:fs');
const path = require('node:path');
const {withBrowser} = require('./render-aviao-macaco/cdp.cjs');

const ROOT = path.join(__dirname, '..'), ASSETS = path.join(ROOT, 'dist', 'assets');
const data = file => `data:image/webp;base64,${fs.readFileSync(path.join(ASSETS, file)).toString('base64')}`;

(async () => {
  const {PRODUCTS, PRODUCT_CATEGORIES, showcase} = await import(path.join(ROOT, 'dist', 'products.js').replace(/\\/g, '/').replace(/^/, 'file:///'));
  const {kitOffer, kitOf} = await import(path.join(ROOT, 'dist', 'commerce-config.js').replace(/\\/g, '/').replace(/^/, 'file:///'));
  const ids = Object.keys(PRODUCTS).filter(id => kitOf(id));
  await withBrowser(async b => {
    await b.viewport(1200, 630);
    for (const id of ids) {
      const p = PRODUCTS[id], t = showcase(id).theme, [one, two, three] = t.bannerStops.match(/#[0-9a-f]{6}/gi);
      const offer = kitOffer(id);
      const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@500;600;700&family=Playfair+Display:wght@500&display=swap"><style>
        *{box-sizing:border-box}body{margin:0;width:1200px;height:630px;overflow:hidden;font-family:'DM Sans',sans-serif;color:${t.textColor};background:radial-gradient(90% 120% at 72% 42%,${one} 0%,${two} 58%,${three} 100%)}
        .logo{position:absolute;left:72px;top:55px;width:110px;height:110px;border-radius:50%;background:#fff;box-shadow:0 6px 18px #0000001a;display:grid;place-items:center;overflow:hidden}.logo img{width:96px;height:96px;object-fit:contain}
        .copy{position:absolute;left:74px;top:250px;width:560px}.cat{margin:0;font-size:17px;font-weight:600;letter-spacing:.32em;color:${t.mutedColor}}
        h1{margin:10px 0 0;font:500 64px/1.1 'Playfair Display',Georgia,serif;letter-spacing:-1px}.sub{margin:14px 0 0;font-size:24px;color:${t.mutedColor}}
        .pix{display:inline-block;margin-top:26px;padding:9px 16px;border-radius:999px;background:${t.accentColor};color:#fff;font-size:19px;font-weight:700}
        .foot{position:absolute;left:74px;bottom:50px;width:600px;margin:0;font-size:20px;font-weight:600;line-height:1.5;color:${t.accentColor}}.foot span{display:block;font-size:17px;color:${t.mutedColor}}
        .piece{position:absolute;right:40px;bottom:18px;width:560px;height:590px;display:grid;place-items:end center}.piece img{max-width:100%;max-height:100%;object-fit:contain;filter:drop-shadow(0 22px 24px #2a1c2230)}
      </style></head><body><div class="logo"><img src="${data('logo-ju.webp')}" alt=""></div>
      <div class="copy"><p class="cat">${(PRODUCT_CATEGORIES[p.category]?.label || p.category).toUpperCase()}</p><h1>${p.title}</h1><p class="sub">${p.subtitle}</p><span class="pix">5% off no Pix</span></div>
      <p class="foot">${offer}<span>Ju, imprime pra mim?</span></p><div class="piece"><img src="${data(p.catalogImage || p.image)}" alt=""></div></body></html>`;
      await b.goto('about:blank', {wait: 50});
      await b.eval(`document.open();document.write(${JSON.stringify(html)});document.close();(async()=>{await Promise.all([...document.querySelectorAll('link[rel=stylesheet]')].map(l=>l.sheet?0:new Promise(r=>{l.onload=r;l.onerror=r;})));await Promise.all(["500 64px 'Playfair Display'","600 20px 'DM Sans'","700 19px 'DM Sans'","500 24px 'DM Sans'"].map(f=>document.fonts.load(f)));await Promise.all([...document.images].map(i=>i.decode()));await new Promise(r=>setTimeout(r,300));})()`);
      const {data: jpg} = await b.send('Page.captureScreenshot', {format: 'jpeg', quality: 88, clip: {x: 0, y: 0, width: 1200, height: 630, scale: 1}});
      fs.writeFileSync(path.join(ASSETS, `og-${id}.jpg`), Buffer.from(jpg, 'base64'));
      console.log(`og-${id}.jpg`, Math.round(Buffer.from(jpg, 'base64').length / 1024), 'KB');
    }
  }, {webgl: false, port: 9400 + process.pid % 500});
})().catch(error => { console.error(error); process.exitCode = 1; });
