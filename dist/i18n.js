import {translations} from './translations.js';

const KEY = 'ju.language';
const supported = ['pt-BR', 'en', 'es'];
let language = 'pt-BR';
try { const saved = localStorage.getItem(KEY); if (supported.includes(saved)) language = saved; } catch {}
const originals = new WeakMap();
const attributes = ['aria-label', 'aria-roledescription', 'placeholder', 'title', 'alt'];
const ignored = 'script,style,[translate="no"],.language-picker';
const dynamic = [
  [/^COLEÇÃO 01 \/ PEÇA (\d+)$/, 'COLLECTION 01 / PIECE $1', 'COLECCIÓN 01 / PIEZA $1'],
  [/^(.+), produto (\d+) de (\d+)\.$/, '$1, product $2 of $3.', '$1, producto $2 de $3.'],
  [/^Conhecer (.+)$/, 'Discover $1', 'Conocer $1'],
  [/^Trazer ao centro (.+)$/, 'Bring $1 to center', 'Centrar $1'],
  [/^Olá, (.+)\.$/, 'Hello, $1.', 'Hola, $1.'],
  [/^Reenviar em (\d+)s$/, 'Resend in $1s', 'Reenviar en $1s'],
  [/^Selecionar todos \((\d+)\)$/, 'Select all ($1)', 'Seleccionar todos ($1)'],
  [/^(\d+) peça selecionada$/, '$1 selected item', '$1 pieza seleccionada'],
  [/^(\d+) peças selecionadas\.?$/, '$1 selected items', '$1 piezas seleccionadas'],
  [/^Carrinho, (\d+) itens?$/, 'Cart, $1 items', 'Carrito, $1 artículos'],
  [/^(.+), (\d+) de (\d+)\.$/, '$1, $2 of $3.', '$1, $2 de $3.'],
  [/^Pedido (.+)$/, 'Order $1', 'Pedido $1'],
  [/^PEDIDO (.+)$/, 'ORDER $1', 'PEDIDO $1'],
  [/^Produção: (.+)$/, 'Production: $1', 'Producción: $1'],
  [/^(\d+) peça · (.+)$/, '$1 item · $2', '$1 pieza · $2'],
  [/^(\d+) peças · (.+)$/, '$1 items · $2', '$1 piezas · $2'],
  [/^Adicionar (.+) ao carrinho$/, 'Add $1 to cart', 'Añadir $1 al carrito'],
  [/^Personalizar (.+)$/, 'Customize $1', 'Personalizar $1'],
  [/^Mostrar (.+)$/, 'Show $1', 'Mostrar $1'],
  [/^Selecionar (.+)$/, 'Select $1', 'Seleccionar $1'],
  [/^Remover (.+)$/, 'Remove $1', 'Eliminar $1'],
  [/^Quantidade de (.+)$/, 'Quantity of $1', 'Cantidad de $1'],
  [/^Aumentar quantidade de (.+)$/, 'Increase quantity of $1', 'Aumentar cantidad de $1'],
  [/^Diminuir quantidade de (.+)$/, 'Decrease quantity of $1', 'Reducir cantidad de $1'],
  [/^Editar personalização de (.+)$/, 'Edit customization of $1', 'Editar personalización de $1'],
  [/^Cores escolhidas para (.+)$/, 'Selected colors for $1', 'Colores elegidos para $1'],
  [/^(.+) — imagem nas cores originais$/, '$1 — original colors', '$1 — colores originales'],
  [/^(.+) nas cores originais$/, '$1 in original colors', '$1 en colores originales'],
  [/^(.+) — prévia 3D da combinação$/, '$1 — 3D combination preview', '$1 — vista previa 3D de la combinación'],
  [/^(.+) sobre uma pilastra branca — imagem de apresentação$/, '$1 on a white pedestal — presentation image', '$1 sobre un pedestal blanco — imagen de presentación'],
  [/^Preço de (.+)$/, 'Price for $1', 'Precio de $1']
];
export function translate(value, locale = language) {
  if (locale === 'pt-BR') return value;
  const index = locale === 'es' ? 1 : 0;
  const source = value.trim().replace(/\s+/g, ' ');
  let result = translations[source]?.[index];
  if (!result && source.startsWith('Produção: ')) result = (index ? 'Producción: ' : 'Production: ') + translate(source.slice(10), locale);
  if (!result) {
    for (const [pattern, en, es] of dynamic) {
      if (pattern.test(source)) { result = source.replace(pattern, index ? es : en); break; }
    }
  }
  // Keep punctuation, currency, product names and user data unchanged.
  if (!result && /[·:]/.test(source)) {
    const segments = source.split(/(\s*[·:]\s*)/);
    result = segments.map(segment => translations[segment]?.[index] || segment).join('');
  }
  if (!result) return value;
  return value.slice(0, value.length - value.trimStart().length) + result + value.slice(value.trimEnd().length);
}
function update(node, key, read, write) {
  let state = originals.get(node);
  if (!state) { state = new Map(); originals.set(node, state); }
  const current = read();
  const previous = state.get(key);
  const source = previous && current === previous.output ? previous.source : current;
  const output = translate(source);
  state.set(key, {source, output});
  if (current !== output) write(output);
}
function visit(root) {
  if (root.nodeType === Node.TEXT_NODE) {
    if (root.parentElement && !root.parentElement.closest(ignored + ',textarea')) update(root, 'text', () => root.data, text => { root.data = text; });
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE || root.closest(ignored)) return;
  for (const attr of attributes) if (root.hasAttribute(attr)) update(root, attr, () => root.getAttribute(attr), text => root.setAttribute(attr, text));
  for (const child of root.childNodes) visit(child);
}
const observer = new MutationObserver(records => {
  observer.disconnect();
  for (const record of records) {
    if (record.type === 'childList') record.addedNodes.forEach(visit);
    else visit(record.target);
  }
  observe();
});
function observe() { observer.observe(document.documentElement, {subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:attributes}); }
function apply() {
  observer.disconnect();
  document.documentElement.lang = language;
  visit(document.documentElement);
  document.querySelectorAll('.language-picker select').forEach(select => { select.value = language; });
  observe();
}
export function setLanguage(locale) {
  if (!supported.includes(locale)) return;
  language = locale;
  try { localStorage.setItem(KEY, language); } catch {}
  apply();
  window.dispatchEvent(new CustomEvent('ju:language', {detail:language}));
}
export function mountLanguagePicker() {
  const header = document.querySelector('.header, .account-header, .intro');
  if (!header || header.querySelector('.language-picker')) return;
  const label = document.createElement('label');
  label.className = 'language-picker';
  label.setAttribute('translate', 'no');
  label.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6h14M5 18h14"/></svg><select aria-label="Idioma / Language / Idioma"><option value="pt-BR">Português</option><option value="en">English</option><option value="es">Español</option></select>';
  label.querySelector('select').value = language;
  label.addEventListener('change', event => setLanguage(event.target.value));
  header.append(label);
}
function init() { mountLanguagePicker(); apply(); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();
window.addEventListener('storage', event => { if (event.key === KEY) { language = supported.includes(event.newValue) ? event.newValue : 'pt-BR'; apply(); } });
