import {SUPPORTED as supported, translate as translateText} from './i18n-core.js';

const KEY = 'ju.language';
let language = 'pt-BR';
try { const saved = localStorage.getItem(KEY); if (supported.includes(saved)) language = saved; } catch {}
const originals = new WeakMap();
const attributes = ['aria-label', 'aria-roledescription', 'placeholder', 'title', 'alt'];
const ignored = 'script,style,[translate="no"],.language-picker';
export function translate(value, locale = language) { return translateText(value, locale); }
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
  syncPickers();
  observe();
}
export function setLanguage(locale) {
  if (!supported.includes(locale)) return;
  language = locale;
  try { localStorage.setItem(KEY, language); } catch {}
  document.querySelector('.language-suggest')?.remove();
  apply();
  window.dispatchEvent(new CustomEvent('ju:language', {detail:language}));
}
export const LANGUAGES = [
  {code:'pt-BR', short:'PT', name:'Português'},
  {code:'en', short:'EN', name:'English'},
  {code:'es', short:'ES', name:'Español'}
];
const PICKER_TEXT = {
  'pt-BR': {button:name => `Idioma: ${name}. Mudar idioma`, menu:'Escolher idioma'},
  en: {button:name => `Language: ${name}. Change language`, menu:'Choose language'},
  es: {button:name => `Idioma: ${name}. Cambiar idioma`, menu:'Elegir idioma'}
};
const GLOBE = '<svg class="language-globe" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6.5h14M5 17.5h14"/></svg>';
const CARET = '<svg class="language-caret" viewBox="0 0 12 12" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m2.5 4.5 3.5 3.5 3.5-3.5"/></svg>';
export function getLanguage() { return language; }
function syncPickers() {
  const current = LANGUAGES.find(item => item.code === language) || LANGUAGES[0];
  const text = PICKER_TEXT[current.code];
  document.querySelectorAll('.language-picker').forEach(picker => {
    const button = picker.querySelector('.language-button');
    button.querySelector('.language-code').textContent = current.short;
    button.setAttribute('aria-label', text.button(current.name));
    picker.querySelector('.language-menu').setAttribute('aria-label', text.menu);
    picker.querySelectorAll('.language-option').forEach(option => option.setAttribute('aria-checked', String(option.dataset.language === language)));
  });
}
function createLanguagePicker() {
  const picker = document.createElement('div');
  picker.className = 'language-picker';
  picker.setAttribute('translate', 'no');
  picker.innerHTML = `<button type="button" class="language-button" aria-haspopup="menu" aria-expanded="false" aria-controls="language-menu">${GLOBE}<span class="language-code"></span>${CARET}</button><div class="language-menu" id="language-menu" role="menu" hidden>${LANGUAGES.map(item => `<button type="button" class="language-option" role="menuitemradio" data-language="${item.code}" lang="${item.code}" aria-checked="false"><span>${item.name}</span><b aria-hidden="true">${item.short}</b></button>`).join('')}</div>`;
  const button = picker.querySelector('.language-button'), menu = picker.querySelector('.language-menu');
  const options = () => [...menu.querySelectorAll('.language-option')];
  const isOpen = () => !menu.hidden;
  const close = ({restoreFocus = false} = {}) => {
    if (!isOpen()) return;
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (restoreFocus) button.focus();
  };
  const open = (from = 'selected') => {
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    const list = options();
    (from === 'last' ? list.at(-1) : list.find(option => option.dataset.language === language) || list[0]).focus();
  };
  button.addEventListener('click', () => isOpen() ? close() : open());
  button.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); open(event.key === 'ArrowUp' ? 'last' : 'selected'); }
  });
  menu.addEventListener('click', event => {
    const option = event.target.closest('.language-option');
    if (!option) return;
    setLanguage(option.dataset.language);
    close({restoreFocus:true});
  });
  menu.addEventListener('keydown', event => {
    const list = options(), index = list.indexOf(document.activeElement);
    const move = next => { event.preventDefault(); list[(next + list.length) % list.length].focus(); };
    if (event.key === 'ArrowDown') move(index + 1);
    else if (event.key === 'ArrowUp') move(index - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(list.length - 1);
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close({restoreFocus:true}); }
    else if (event.key === 'Tab') close();
  });
  document.addEventListener('pointerdown', event => { if (isOpen() && !picker.contains(event.target)) close(); });
  return picker;
}
// Desktop: sits beside the cart. The header markup decides where it goes; see site-shell.js and account.js.
export function mountLanguagePicker(container, before = null) {
  if (!container || document.querySelector('.language-picker')) return null;
  const picker = createLanguagePicker();
  container.insertBefore(picker, before && before.parentNode === container ? before : null);
  syncPickers();
  return picker;
}
// First visit: if the browser is set to English or Spanish, offer our own translation once (like the browser's
// translate bar, but with the site's reviewed copy). Shown in the language being offered.
const PROMPTED = 'ju.language.prompted';
const SUGGESTIONS = {
  en: {label:'Language suggestion', message:'This site is also available in English.', accept:'Switch to English', keep:'Keep Portuguese', close:'Close'},
  es: {label:'Sugerencia de idioma', message:'Este sitio también está disponible en español.', accept:'Cambiar a español', keep:'Seguir en portugués', close:'Cerrar'}
};
function suggestLanguage() {
  try { if (localStorage.getItem(KEY) || localStorage.getItem(PROMPTED)) return; } catch { return; }
  if (document.querySelector('.language-suggest')) return;
  const preferred = String(navigator.languages?.[0] || navigator.language || '').toLowerCase();
  const code = preferred.startsWith('en') ? 'en' : preferred.startsWith('es') ? 'es' : null;
  if (!code) return;
  const text = SUGGESTIONS[code], bar = document.createElement('div');
  bar.className = 'language-suggest';
  bar.lang = code;
  bar.setAttribute('translate', 'no');
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', text.label);
  bar.innerHTML = `<p>${text.message}</p><button type="button" data-accept>${text.accept}</button><button type="button" data-keep>${text.keep}</button><button type="button" class="suggest-close" aria-label="${text.close}">×</button>`;
  bar.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-accept')) setLanguage(code);
    dismissSuggestion();
  });
  document.body.prepend(bar);
}
function dismissSuggestion() {
  try { localStorage.setItem(PROMPTED, '1'); } catch {}
  document.querySelector('.language-suggest')?.remove();
}
function init() { apply(); suggestLanguage(); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();
window.addEventListener('storage', event => { if (event.key === KEY) { language = supported.includes(event.newValue) ? event.newValue : 'pt-BR'; apply(); } });
