// Every image and model the site references exists in dist/, and the published copies stay light. Originals live in
// design/originais/ (not published). See PERFORMANCE-QA.md for how the files were produced.
import assert from 'node:assert/strict';
import {readFile, readdir, stat} from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
const {PRODUCTS, SOON} = await import('../dist/products.js');
const exists = async name => stat(new URL(`assets/${name}`, dist)).then(() => true, () => false);

// Literal "assets/…" references in pages, scripts and styles.
const referenced = new Set();
for (const file of (await readdir(dist)).filter(f => /\.(html|js|css)$/.test(f))) {
  const text = await readFile(new URL(file, dist), 'utf8');
  for (const [, name] of text.matchAll(/assets\/([\w./-]+\.(?:webp|png|jpe?g|svg|glb))/g)) referenced.add(name);
}
// Names that code joins with "assets/" at runtime (product images, showcase layers and tools).
for (const product of Object.values(PRODUCTS)) for (const name of [product.image, product.catalogImage].filter(Boolean)) referenced.add(name);
// The showcase cards load a light preview first (catalog.js builds `card-preview-<id>.webp` next to each card-<id>.webp).
for (const id of [...Object.keys(PRODUCTS), ...Object.keys(SOON)]) if (await exists(`card-${id}.webp`)) referenced.add(`card-preview-${id}.webp`);   // also the novelties (SOON)
const productsSource = await readFile(new URL('products.js', dist), 'utf8');
for (const [, name] of productsSource.matchAll(/'([\w-]+\.(?:webp|png|jpe?g|svg))'/g)) referenced.add(name);

for (const name of referenced) assert(await exists(name), `referenced asset exists: assets/${name}`);
for (const name of referenced) assert(!/\.png$/.test(name) || name === 'logo-ju-email.png', `served images are WebP (PNG only for the e-mail logo): ${name}`);

// Budgets for what visitors download. Raise them only on purpose, after measuring.
// The butterfly on the home's banner is the first picture every new visitor downloads (index.html preloads it).
const budget = {'logo-ju.webp': 40, 'julia-auth.webp': 400, 'product-borboletoscopio-cutout.webp': 150};
for (const name of referenced) {
  const kb = (await stat(new URL(`assets/${name}`, dist))).size / 1024;
  const limit = budget[name] ?? (name.endsWith('.glb') ? 2500 : 300);
  assert(kb <= limit, `assets/${name} is ${Math.round(kb)} KB (budget ${limit} KB)`);
}
// The showcase photos also in 768 px (products.js ART_768; same framing, scaled): what phones and 1x/2x computers download.
const {ART_768} = await import('../dist/products.js');
for (const [big, small] of Object.entries(ART_768)) {
  assert(referenced.has(big) && referenced.has(small), `${small} is the light version of a showcase photo in use`);
  const kb = (await stat(new URL(`assets/${small}`, dist))).size / 1024;
  assert(kb <= 80, `assets/${small} is ${Math.round(kb)} KB (budget 80 KB)`);
}

// 3D models are Meshopt-compressed; an uncompressed export is several times larger.
for (const name of await readdir(new URL('assets/models/', dist))) {
  const raw = await readFile(new URL(`assets/models/${name}`, dist));
  const json = JSON.parse(raw.toString('utf8', 20, 20 + raw.readUInt32LE(12)));
  assert((json.extensionsUsed || []).includes('EXT_meshopt_compression'), `${name}: Meshopt-compressed (see PERFORMANCE-QA.md)`);
  assert((json.extensionsRequired || []).includes('EXT_meshopt_compression'), `${name}: loader must decode Meshopt`);
}

// Nothing unused is published: every file in dist/assets is referenced (except the e-mail logo, used by api/).
for (const name of (await readdir(new URL('assets/', dist), {withFileTypes: true})).filter(d => d.isFile()).map(d => d.name)) {
  assert(referenced.has(name) || name === 'logo-ju-email.png', `assets/${name} is used by the site (move originals to design/originais/)`);
}

console.log(`PASS: ${referenced.size} referenced assets exist, are WebP/GLB within budget, models are Meshopt-compressed and nothing unused is published.`);
