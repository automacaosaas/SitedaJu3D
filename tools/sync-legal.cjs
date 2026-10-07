'use strict';
// Copies the store's details and the terms date from api/_lib/legal.js into every page of dist/: each element marked
// data-company="<field>" gets that field, and each data-terms-date gets the date of TERMS_VERSION. Like
// tools/sync-csp.cjs: one source, static HTML (readable without scripts). tests/legal.mjs fails if a page is out of date.
// Also writes dist/company.js, the contact channels for the scripts (WhatsApp button, e-mail link), from the same file.
// Run: node tools/sync-legal.cjs   (or --check to only report)
const fs = require('node:fs');
const path = require('node:path');
const {COMPANY, termsDate, contact} = require('../api/_lib/legal');

const DIST = path.join(__dirname, '..', 'dist');
const COMPANY_JS = 'company.js';
const companyModule = () => `// Written by tools/sync-legal.cjs from api/_lib/legal.js. Do not edit here: change legal.js and run the tool.\n`
  + `// The shop's contact channels for the scripts. An empty value is still to be filled in, and the page hides that channel.\n`
  + `export const CONTACT = Object.freeze(${JSON.stringify(contact(), null, 2)});\n`;
const esc = value => String(value).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

function sync(html) {
  return html
    .replace(/(<(\w+)\b[^>]*\bdata-company="(\w+)"[^>]*>)[^<]*(<\/\2>)/g, (all, open, tag, field, close) => {
      if (!(field in COMPANY)) throw new Error(`data-company="${field}" is not in api/_lib/legal.js`);
      return open + esc(COMPANY[field]) + close;
    })
    .replace(/(<(\w+)\b[^>]*\bdata-terms-date[^>]*>)[^<]*(<\/\2>)/g, (all, open, tag, close) => open + esc(termsDate()) + close);
}

function pages() { return fs.readdirSync(DIST).filter(name => name.endsWith('.html')); }

if (require.main === module) {
  const check = process.argv.includes('--check');
  const stale = [];
  for (const name of pages()) {
    const file = path.join(DIST, name), html = fs.readFileSync(file, 'utf8'), next = sync(html);
    if (next === html) continue;
    stale.push(name);
    if (!check) fs.writeFileSync(file, next);
  }
  const moduleFile = path.join(DIST, COMPANY_JS), module = companyModule();
  if (!fs.existsSync(moduleFile) || fs.readFileSync(moduleFile, 'utf8').replace(/\r\n/g, '\n') !== module) {
    stale.push(COMPANY_JS);
    if (!check) fs.writeFileSync(moduleFile, module);
  }
  console.log(stale.length ? `${check ? 'desatualizada' : 'atualizada'}: ${stale.join(', ')}` : 'todas as páginas em dia.');
  if (check && stale.length) process.exitCode = 1;
}

module.exports = {sync, pages, companyModule, COMPANY_JS, DIST};
