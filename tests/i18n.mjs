// Translation and language-picker checks (no browser needed). Run: node tests/i18n.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const {translate, SUPPORTED} = await import(pathToFileURL(path.join(root, 'dist/i18n-core.js')).href);

// ── dictionary integrity ──────────────────────────────────────────────
const source = read('dist/translations.js');
const rows = source.slice(source.indexOf('`') + 1, source.lastIndexOf('`.trim()')).trim().split('\n').map(line => line.split('|'));
assert(rows.length > 400, 'dictionary should keep its entries');
for (const row of rows) assert(row.length === 3 && row.every(part => part.trim()), `entry needs PT|EN|ES with no empty column: ${row.join('|').slice(0, 80)}`);
const seen = new Map();
for (const [pt, en, es] of rows) {
  if (seen.has(pt)) assert.deepEqual(seen.get(pt), [en, es], `"${pt}" is defined twice with different translations`);
  seen.set(pt, [en, es]);
}
const edge = text => (text.match(/^[←→]/)?.[0] ?? '') + '~' + (text.match(/[↗↓→…]$/)?.[0] ?? '');
for (const [pt, en, es] of rows) { assert.equal(edge(en), edge(pt), `arrow/ellipsis lost in EN: ${pt}`); assert.equal(edge(es), edge(pt), `arrow/ellipsis lost in ES: ${pt}`); }
assert.deepEqual(SUPPORTED, ['pt-BR', 'en', 'es']);

// ── translate(): exact, dynamic and untouched text ────────────────────
const t = (text, locale) => translate(text, locale);
assert.equal(t('Início', 'pt-BR'), 'Início', 'Portuguese is the source and passes through');
assert.equal(t('Início', 'en'), 'Home');
assert.equal(t('Início', 'es'), 'Inicio');
assert.equal(t('  Início \n', 'en'), '  Home \n', 'surrounding whitespace is kept');
assert.equal(t('Borboletoscópio', 'en'), 'Borboletoscópio', 'product names stay unchanged');
assert.equal(t('R$ 129,00', 'es'), 'R$ 129,00', 'prices stay unchanged');
assert.equal(t('texto que ninguém traduziu', 'en'), 'texto que ninguém traduziu', 'unknown text is left as is, never blanked');
// singular vs plural (the old rule matched "iten", so "1 item" stayed in Portuguese)
assert.equal(t('Carrinho, 1 item', 'en'), 'Cart, 1 item');
assert.equal(t('Carrinho, 1 item', 'es'), 'Carrito, 1 artículo');
assert.equal(t('Carrinho, 3 itens', 'en'), 'Cart, 3 items');
assert.equal(t('Carrinho, 3 itens', 'es'), 'Carrito, 3 artículos');
assert.equal(t('Coleção de 3 produtos', 'en'), 'Collection of 3 products');
assert.equal(t('Coleção de 1 produto', 'es'), 'Colección de 1 producto');
// banner: the label carries a product name and a list of colour names
const chooseLabel = 'Escolha sua cor: ver Borboletoscópio na coleção e personalizar. Cores originais: Verde-menta, Amarelo';
assert.equal(t(chooseLabel, 'en'), 'Choose your color: view Borboletoscópio in the collection and customize. Original colors: Mint green, Yellow');
assert.equal(t(chooseLabel, 'es'), 'Elige tu color: ver Borboletoscópio en la colección y personalizar. Colores originales: Verde menta, Amarillo');
assert.equal(t('Aviãoscopia sobre pilastra branca', 'en'), 'Aviãoscopia on a white pedestal');
assert.equal(t('Prévia 3D ilustrativa de Aviãoscopia', 'es'), 'Vista previa 3D ilustrativa de Aviãoscopia');
assert.equal(t('Olá, Maria.', 'en'), 'Hello, Maria.');
assert.equal(t('Escolha sua cor', 'en'), 'Choose your color');
// account flow copy added with the e-mail service
for (const text of ['Enviamos um código de seis números para', 'Código enviado!', 'Cadastro confirmado!', 'Este link não é mais válido. Entre ou crie sua conta para receber um novo código.', 'Sem conexão. Verifique sua internet e tente de novo.', 'Muitas tentativas. Aguarde um instante e tente de novo.',
  // storefront experience: loading dialog, e-mail-first sign-in, cart notice, image states
  'Um instante de cuidado.', 'Tudo pronto para continuar.', 'Preparando seu acesso…', 'Conferindo seu código…', 'Confirmar e continuar', 'Usar minha senha',
  'Vamos nos', 'conhecer?', 'Quero receber novidades e ofertas da Ju por e-mail.', 'Conta de teste criada!', 'Novidades por e-mail: você escolheu receber.',
  'Novidades por e-mail: não autorizadas.', 'Peça adicionada. Indo para o carrinho…', 'Cores salvas. Voltando ao carrinho…', 'Imagem indisponível',
  'Voltar à página anterior', 'Confirme seu e-mail com um novo código.', 'Enviamos um novo código para o seu e-mail.',
  // real payments (Mercado Pago) at checkout
  'AMBIENTE DE TESTE', 'Pagamentos de teste do Mercado Pago · nenhum valor real é cobrado', 'Como testar neste ambiente', 'Pague com o Pix e o pedido é confirmado na hora.', 'Já paguei · verificar agora', 'Gerar novo código Pix',
  'Só mais um instante.', 'Escolha como prefere pagar. O Mercado Pago processa tudo com segurança.', 'Carregando as formas de pagamento…', 'Confira os dados do cartão e tente novamente.',
  'O pagamento não foi aceito. Confira os dados ou tente outra forma de pagamento.', 'Não conseguimos confirmar o pagamento agora. Se tiver certeza de que não houve cobrança, tente novamente.',
  'O pagamento não foi aprovado. Confira os dados do cartão ou escolha outra forma de pagamento.', 'Pix gerado. Pague com o código ou o QR Code.', 'Pagamento de teste aprovado. Nenhum valor real foi cobrado e nenhuma peça será produzida.',
  'Pagamento confirmado. A Ju já recebeu o seu pedido.', 'O Pix expirou. Gere um novo código para continuar.', 'Tentar novamente']) {
  assert.notEqual(t(text, 'en'), text, `missing EN: ${text}`);
  assert.notEqual(t(text, 'es'), text, `missing ES: ${text}`);
}

// ── static pages: every visible string has an English translation ─────
const keepAsIs = new Set(['Ju, imprime pra mim', 'Ju imprime pra mim', 'Subtotal', 'Total', 'Pix', 'Borboletoscópio', 'Dinossauroscópio', 'Aviãoscopia', 'Instagram', 'WhatsApp']);
const entities = {'&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&copy;': '©', '&larr;': '←', '&rarr;': '→', '&middot;': '·', '&hearts;': '♥'};
const decode = text => text.replace(/&#?\w+;/g, entity => entities[entity] ?? entity);
const missing = [];
for (const file of fs.readdirSync(path.join(root, 'dist')).filter(name => name.endsWith('.html') && name !== 'email-preview.html')) {
  const html = read('dist/' + file).replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|svg)[\s\S]*?<\/\1>/g, '');
  const strings = [...html.matchAll(/(?:aria-label|alt|placeholder|title)="([^"]+)"/g)].map(match => match[1]);
  strings.push(...html.replace(/<[^>]+>/g, '\n').split('\n'));
  for (const raw of strings) {
    const text = decode(raw).trim().replace(/\s+/g, ' ');
    if (!/\p{L}/u.test(text) || keepAsIs.has(text) || /^[\w.+-]+@[\w.-]+$/.test(text) || /^R\$/.test(text)) continue;
    if (t(text, 'en') === text) missing.push(`${file}: ${text.slice(0, 90)}`);
  }
}
assert.deepEqual(missing, [], `strings without an English translation:\n${missing.join('\n')}`);

// ── language picker: source guards ────────────────────────────────────
const i18n = read('dist/i18n.js'), shell = read('dist/site-shell.js'), theme = read('dist/theme.css'), account = read('dist/account.js');
assert(!/<select/.test(i18n), 'the picker is a button + menu, not a native select');
assert(/export function mountLanguagePicker\(container, before = null\)/.test(i18n));
assert(!/document\.querySelector\('\.header, \.account-header, \.intro'\)/.test(i18n), 'the picker must not append itself to a header at import time');
assert(/mountLanguagePicker\(host, host\.querySelector\('\[data-cart-link\]'\)\)/.test(shell), 'desktop: the picker sits beside the cart');
assert(/host\.querySelector\('\.profile-nav > button'\)/.test(shell), 'profile trigger must not be "the first button" (the picker is one)');
assert(/mountLanguagePicker\(document\.querySelector\('\.account-tools'\)\)/.test(account));
assert(/role="menuitemradio"/.test(i18n) && /aria-haspopup="menu"/.test(i18n) && /aria-expanded/.test(i18n), 'menu semantics');
assert(/Escape/.test(i18n) && /ArrowDown/.test(i18n), 'keyboard support');
assert(/translate', 'no'/.test(i18n), 'the picker itself is never translated');
assert(/\.language-button \.language-globe\{display:none\}/.test(theme), 'desktop shows initials only');
assert(/@media\(max-width:800px\)\{\.language-button\{[^}]*\}\.language-button \.language-globe\{display:block\}/.test(theme), 'phones show the globe with the initials');
assert.equal((theme.match(/\.language-picker\{position:relative/g) || []).length, 1, 'picker base rule defined once');

// ── the merge-conflict regression that shipped in theme.css ──────────
for (const file of ['dist/theme.css', 'dist/i18n.js', 'dist/account.js', 'dist/site-shell.js', 'dist/translations.js', 'dist/account.css', 'dist/conta.html']) {
  assert(!/^(<<<<<<< |=======$|>>>>>>> )/m.test(read(file)), `${file} contains merge-conflict markers`);
}

console.log('PASS: dictionary integrity, dynamic rules (singular/plural, colour lists), static-page coverage in English, picker structure and conflict-marker guard.');
