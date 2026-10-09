// Tema escuro (09/10/2026): dois padrões, o claro como sempre foi e o escuro desenhado à parte, só por tokens.
//  · journey.js escolhe o tema antes da página aparecer: o que a pessoa escolheu (Aparência, ju.scheme) ou o do aparelho;
//  · os tokens (--surface, --fg, --glass-rgb…) só existem em :root[data-theme="dark"]; os componentes usam var(--token, <cor do
//    claro>), então o claro lê a reserva e fica idêntico (os testes de desenho do claro leem o CSS por tests/lib/light-css.cjs);
//  · nada no escuro mexe nas fotos das peças (sem filtro, inversão ou camada por cima);
//  · a Aparência (scheme-picker.js) em "Seu cantinho" e no menu do perfil, com rádios nativos.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import lightCssModule from './lib/light-css.cjs';
import {pathToFileURL} from 'node:url';   // Windows: import() needs a file:// URL, not C:…
const {lightCss} = lightCssModule;

const root = path.join(import.meta.dirname, '..'), dist = path.join(root, 'dist');
const read = file => fs.readFileSync(path.join(dist, file), 'utf8');
const sheets = fs.readdirSync(dist).filter(f => f.endsWith('.css') && f !== 'admin.css');

// ── journey.js: o tema antes da primeira pintura ──────────────────────
function boot({stored = null, systemDark = false, denied = false} = {}) {
  const data = new Map(stored ? [['ju.scheme', stored]] : []), listeners = {}, meta = {content: '#fff7f5', setAttribute(k, v) { this[k] = v; }};
  const media = {matches: systemDark, addEventListener: (name, fn) => { listeners.media = fn; }};
  const storage = {getItem: key => { if (denied) throw Error(); return data.get(key) ?? null; }, setItem: (key, value) => { if (denied) throw Error(); data.set(key, value); }, removeItem: key => data.delete(key)};
  const rootEl = {dataset: {}, style: {setProperty() {}}, classList: {add() {}, remove() {}}};
  const context = {URL, URLSearchParams, Event: class { constructor(type) { this.type = type; } }, localStorage: storage, matchMedia: () => media,
    document: {documentElement: rootEl, addEventListener() {}, querySelector: selector => selector === 'meta[name="theme-color"]' ? meta : null, images: [], fonts: {ready: Promise.resolve()}},
    location: {href: 'https://ju.test/index.html', origin: 'https://ju.test', pathname: '/index.html', search: ''}, innerWidth: 1200, setTimeout: () => 0, clearTimeout() {}};
  const fired = [];
  context.window = context; context.parent = context;
  context.addEventListener = (name, fn) => { listeners[name] = fn; };
  context.dispatchEvent = event => fired.push(event.type);
  vm.runInNewContext(read('journey.js'), context);
  return {context, rootEl, meta, data, media, listeners, fired};
}
let page = boot();
assert.equal(page.rootEl.dataset.theme, 'light', 'sem escolha e com o aparelho no claro: claro');
assert.equal(page.context.juScheme.mode(), 'auto');
page = boot({systemDark: true});
assert.equal(page.rootEl.dataset.theme, 'dark', 'Automático segue o aparelho no escuro');
assert.equal(page.meta.content, '#151214', 'a barra do navegador acompanha o tema');
page = boot({stored: 'light', systemDark: true});
assert.equal(page.rootEl.dataset.theme, 'light', 'a escolha da pessoa ganha do aparelho');
page = boot({stored: 'roxo'});
assert.equal(page.context.juScheme.mode(), 'auto', 'valor estranho guardado: volta ao Automático');
page = boot({denied: true, systemDark: true});
assert.equal(page.rootEl.dataset.theme, 'dark', 'sem acesso ao armazenamento, o do aparelho');
assert.doesNotThrow(() => page.context.juScheme.set('light'));
page = boot();
assert.equal(page.context.juScheme.set('dark'), 'dark');
assert.equal(page.data.get('ju.scheme'), 'dark', 'a escolha fica guardada');
assert(page.fired.includes('ju:scheme'), 'e avisa a página (o pedestal do 3D, a Aparência marcada)');
page.context.juScheme.set('auto');
assert(!page.data.has('ju.scheme'), 'Automático apaga a escolha');
page.media.matches = true; page.listeners.media();
assert.equal(page.rootEl.dataset.theme, 'dark', 'no Automático, o aparelho trocando de tema troca a página');
page.listeners.storage({key: 'ju.scheme'});
assert(page.fired.length >= 2, 'a escolha feita noutra aba chega aqui');

// ── os tokens só existem no escuro ────────────────────────────────────
const TOKENS = ['surface', 'surface-2', 'surface-soft', 'tint', 'fg', 'fg-2', 'on-ink', 'scrim', 'glass-rgb', 'veil-rgb', 'gallery-bg', 'thumb-bg', 'hero-base', 'lift', 'accent-bg', 'accent-fg', 'wash', 'soft', 'border'];
const journey = read('journey.css'), darkBlock = journey.slice(journey.indexOf(':root[data-theme="dark"] {'));
for (const token of TOKENS) assert.match(darkBlock, new RegExp(`--${token}:`), `--${token} definido no escuro`);
for (const file of sheets) {
  const light = lightCss(read(file));
  for (const token of TOKENS) assert(!new RegExp(`(^|[{;\\s])--${token}\\s*:`).test(light), `${file}: --${token} definido fora do escuro (o claro mudaria)`);
}
assert.match(darkBlock, /color-scheme: dark;/, 'controles nativos (rolagem, campos) no escuro');

// ── as fotos das peças ficam como são ─────────────────────────────────
for (const file of sheets) {
  const css = read(file);
  for (const m of css.matchAll(/:root\[data-theme="dark"\][^{]*\{[^}]*\}/g)) {
    assert(!/filter\s*:|invert\(|hue-rotate|brightness\(|saturate\(/.test(m[0]), `${file}: o escuro não filtra nada (${m[0].slice(0, 90)}…)`);
    // numa imagem, o escuro só pinta o quadro atrás dela (fundo, borda); a foto em si não muda. O logo é a exceção (logo abaixo).
    const selector = m[0].slice(0, m[0].indexOf('{')).replace(/[^,]*(\.brand img|\.drawer-top img)[^,]*/g, ''), body = m[0].slice(m[0].indexOf('{') + 1, -1);
    if (/\bimg\b|picture|\.gallery-slide|canvas/.test(selector)) assert(body.split(';').map(d => d.split(':')[0].trim()).filter(Boolean).every(p => /^(background|background-color|border-color|box-shadow)$/.test(p)), `${file}: o escuro não mexe em imagem nem no 3D por CSS, só no quadro atrás (${m[0].slice(0, 90)}…)`);
  }
}
assert.match(journey, /:root\[data-theme="dark"\] :is\(\.site-header, \.account-header, \.header\) \.brand img[^{]*\{ mix-blend-mode: normal; \}/, 'só o logo deixa de multiplicar (no escuro ele sumiria)');

// ── o claro lê as reservas: o ajudante dos testes ─────────────────────
assert.equal(lightCss('.a { color: var(--fg, var(--theme-text, #111)); background: var(--surface, #fff); }'), '.a { color: var(--theme-text, #111); background: #fff; }');
assert.equal(lightCss('.b { color: color-mix(in oklab, var(--rose), #fff var(--lift, 0%)); }\n:root[data-theme="dark"] .b { color: red; }\n'), '.b { color: var(--rose); }\n');
assert.equal(lightCss('.c { background: var(--scrim, none), radial-gradient(#fff, #eee); }'), '.c { background: radial-gradient(#fff, #eee); }');

// ── Aparência: em "Seu cantinho" e no menu do perfil ──────────────────
const picker = read('scheme-picker.js'), account = read('account.js'), shell = read('site-shell.js');
globalThis.window = {juScheme: {mode: () => 'dark'}};
const {schemePicker} = await import(pathToFileURL(path.join(dist, 'scheme-picker.js')).href);
const full = schemePicker({hint: 'Automático acompanha o tema do seu aparelho.'}), compact = schemePicker({compact: true});
assert.match(full, /^<fieldset class="scheme-picker"><legend>Aparência<\/legend>/, 'um grupo com nome (fieldset + legend)');
assert.equal((full.match(/<input type="radio" name="ju-scheme-\d+" value="(auto|light|dark)"/g) || []).length, 3, 'três rádios nativos');
assert.match(full, /value="dark" checked/, 'marca o que está valendo');
assert.notEqual(full.match(/name="(ju-scheme-\d+)"/)[1], compact.match(/name="(ju-scheme-\d+)"/)[1], 'cada grupo com o próprio nome');
assert.match(compact, /scheme-picker is-compact/);
assert(/>Auto</.test(compact) && />Automático</.test(full), 'rótulo curto no menu');
assert.match(picker, /window\.juScheme\?\.set\(event\.target\.value\)/, 'quem grava e pinta é journey.js');
assert.match(account, /schemePicker\(\{hint: 'Automático acompanha o tema do seu aparelho\.'\}\)/, '"Seu cantinho" tem a Aparência');
assert.match(account, /wireSchemePicker\(host\)/);
assert.match(shell, /\$\{schemePicker\(\{compact: true\}\)\}<\/div><\/div>`/, 'o menu do perfil também');
assert.match(shell, /wireSchemePicker\(menu\)/);
const ui = journey.slice(journey.indexOf('.scheme-picker {'));
assert.match(ui, /\.scheme-options:has\(input\[value="dark"\]:checked\) \.scheme-thumb \{ translate:200% 0; \}/, 'o polegar desliza até a escolhida');
assert.match(ui, /@supports not selector\(:has\(a\)\)/, 'sem :has, a escolhida ganha o fundo');
assert.match(ui, /\.scheme-option input:focus-visible \+ span \{ outline:2px solid/, 'foco visível pelo teclado');
assert.match(ui, /@media \(prefers-reduced-motion: reduce\) \{ \.scheme-thumb, \.scheme-option \.icon \{ transition:none; \} \}/);

// ── "Seu cantinho" renovado ───────────────────────────────────────────
assert.match(account, /<nav class="profile-hub" aria-label="Sua conta">/, 'os atalhos num nav com nome');
for (const target of ['data-screen="orders"', 'data-screen="details"', 'href="checkout"', 'href="produtos"']) assert(account.includes(`class="profile-tile" \${attrs}`) && account.includes(target), `atalho ${target}`);
assert.match(account, /<button class="profile-signout" id="signout" type="button">/);
assert.match(read('account.css'), /\.profile-hub \{ display:grid; grid-template-columns:repeat\(auto-fit, minmax\(min\(100%, 210px\), 1fr\)\);/, 'dois por linha onde cabe, um embaixo do outro no celular');
const {translate} = await import(pathToFileURL(path.join(dist, 'i18n-core.js')).href);
for (const text of ['Aparência', 'Automático', 'Claro', 'Escuro', 'Preferências', 'Sua conta', 'Coleções', 'Vazio por enquanto', 'Produção, envio e entrega', 'Nota fiscal e entrega', 'Peças em 3D para a consulta', 'Automático acompanha o tema do seu aparelho.']) {
  assert.notEqual(translate(text, 'en'), text, `EN: ${text}`);
  if (!['Automático', 'Claro'].includes(text)) assert.notEqual(translate(text, 'es'), text, `ES: ${text}`);
}

// ── texto na cor da peça sempre com o ajuste do escuro (09/10/2026: o aviso e os rótulos do "Ver encaixado" do unicórnio sumiam) ──
// A cor de texto da peça (--theme-text, --pl-ink, --auth-rose…) é escura: como texto, vai dentro de var(--fg, …) — ou, o destaque,
// de color-mix(…, #fff var(--lift, 0%)) —, que no claro é ela mesma e no escuro clareia. tools/tema-escuro/tokens.py faz isso.
{
  const raw = /(?<![-\w])(color|fill|stroke)\s*:\s*var\(--(?:theme|pl|pd|nv|cat|tier|fit|auth|kit|rec)-(text|ink|strong|muted|accent|rose)\b/g;
  const loose = sheets.flatMap(file => [...read(file).matchAll(raw)].map(m => `${file}: ${read(file).slice(m.index, m.index + 60)}`));
  assert.deepEqual(loose, [], `texto na cor da peça sem o ajuste do escuro:\n${loose.join('\n')}`);
  const demo = read('hero-demo.css');
  assert.match(demo, /\.demo-hint \{[^}]*color: var\(--fg, var\(--theme-text,/, 'o aviso do "Ver encaixado" legível no escuro');
  assert.match(demo, /:root\[data-theme="dark"\] \.demo-glow \{ background:/, 'no escuro, sem o clarão branco atrás da peça');
}

console.log('PASS: tema escuro — tema antes da pintura (escolha, aparelho, outra aba), tokens só no escuro, fotos sem filtro, logo, a Aparência em "Seu cantinho" e no menu do perfil, e o perfil renovado.');
