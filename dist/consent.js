// The cookie notice (LGPD, audit Q7). Loaded only when a tool is set in analytics-config.js (or in the preview), so a
// site without analytics pays nothing for it. Essential storage (cart, sign-in, language, this choice) is always on;
// analytics (Google Analytics 4) and ads (Meta pixel) load only after the person accepts their category. "Recusar" is as
// easy as "Aceitar todos", and the choice can change at any time in "Preferências de cookies", in the footer.
import {validIds, cookiePreview} from './analytics-config.js';

const KEY = 'ju.consent', VERSION = 1;
const CATEGORIES = [
  {id: 'analytics', tool: 'ga4', title: 'Análise', text: 'Medir as visitas e o desempenho das páginas, sem identificar você (Google Analytics).'},
  {id: 'marketing', tool: 'metaPixel', title: 'Anúncios', text: 'Mostrar anúncios da Ju para quem já visitou a loja (pixel da Meta).'}
];

export function readConsent() {
  try { const saved = JSON.parse(localStorage.getItem(KEY) || 'null'); return saved?.v === VERSION ? saved : null; } catch { return null; }
}
function saveConsent(choice) {
  const record = {v: VERSION, analytics: Boolean(choice.analytics), marketing: Boolean(choice.marketing), at: new Date().toISOString()};
  try { localStorage.setItem(KEY, JSON.stringify(record)); } catch {}
  return record;
}

// ── the tools, each loaded once and only with its category accepted (never in the preview: there is no id) ──
const loaded = new Set();
function addScript(src) { const script = document.createElement('script'); script.async = true; script.src = src; document.head.append(script); }
function loadTools(choice, ids = validIds()) {
  if (choice.analytics && ids.ga4 && !loaded.has('ga4')) {
    loaded.add('ga4');
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', ids.ga4, {anonymize_ip: true});
    addScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ids.ga4)}`);
  }
  if (choice.marketing && ids.metaPixel && !loaded.has('metaPixel')) {
    loaded.add('metaPixel');
    const fbq = window.fbq = function fbq() { fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments); };
    window._fbq = fbq; fbq.push = fbq; fbq.loaded = true; fbq.version = '2.0'; fbq.queue = [];
    fbq('init', ids.metaPixel);
    fbq('track', 'PageView');
    addScript('https://connect.facebook.net/en_US/fbevents.js');
  }
}
// Turning a category off after it ran: its cookies go, and the page reloads without it.
function forget(previous, next) {
  const dropped = (previous?.analytics && !next.analytics) || (previous?.marketing && !next.marketing);
  if (!dropped) return false;
  const names = document.cookie.split(';').map(c => c.split('=')[0].trim()).filter(name => /^(_ga|_gid|_gat|_fbp|_fbc)/.test(name));
  const host = location.hostname.split('.').slice(-3).join('.');
  for (const name of names) for (const domain of ['', `; domain=.${host}`, `; domain=${location.hostname}`]) document.cookie = `${name}=; Max-Age=0; path=/${domain}`;
  location.reload();
  return true;
}

// ── the notice ──
const esc = value => String(value).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
function categories(preview) {
  const ids = validIds();
  return CATEGORIES.filter(c => preview || ids[c.tool]);
}
function noticeHtml(list, current) {
  const toggles = list.map(c => `<label class="consent-option"><input type="checkbox" name="${c.id}"${current?.[c.id] ? ' checked' : ''}><span><strong>${esc(c.title)}</strong><small>${esc(c.text)}</small></span></label>`).join('');
  return `<div class="consent-card">
    <p class="consent-title" id="consent-title">Sua privacidade</p>
    <p class="consent-text">Usamos o essencial para o site funcionar e, com a sua permissão, cookies de análise e de anúncios para entender as visitas e melhorar a loja. Você escolhe. <a href="privacidade.html#cookies">Política de Privacidade</a></p>
    <form class="consent-options" data-consent-form hidden>
      <label class="consent-option is-fixed"><input type="checkbox" checked disabled><span><strong>Essenciais</strong><small>Carrinho, login, idioma e esta escolha. Sempre ativos.</small></span></label>
      ${toggles}
      <button type="submit" class="consent-save">Salvar minhas escolhas</button>
    </form>
    <div class="consent-actions" data-consent-actions>
      <button type="button" class="consent-accept" data-consent="accept">Aceitar todos</button>
      <button type="button" class="consent-decline" data-consent="decline">Recusar</button>
      <button type="button" class="consent-custom" data-consent="custom" aria-expanded="false">Personalizar</button>
    </div>
  </div>`;
}

function ensureStyles() {
  if (document.querySelector('link[href="consent.css"]')) return;
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'consent.css'; document.head.append(link);
}

export function openNotice({customize = false} = {}) {
  const preview = cookiePreview(), list = categories(preview), current = readConsent();
  document.querySelector('.consent-notice')?.remove();
  ensureStyles();
  const box = document.createElement('section');
  box.className = 'consent-notice';
  box.setAttribute('role', 'region');
  box.setAttribute('aria-labelledby', 'consent-title');
  box.innerHTML = noticeHtml(list, current);
  const form = box.querySelector('[data-consent-form]'), customButton = box.querySelector('[data-consent="custom"]');
  const showOptions = () => { form.hidden = false; customButton.hidden = true; customButton.setAttribute('aria-expanded', 'true'); form.querySelector('input:not([disabled])')?.focus({preventScroll: true}); };
  const decide = choice => {
    const record = saveConsent(choice);
    box.remove();
    mountFooterLink();
    if (!forget(current, record)) loadTools(record);
  };
  box.addEventListener('click', event => {
    const action = event.target.closest('[data-consent]')?.dataset.consent;
    if (action === 'accept') decide({analytics: true, marketing: true});
    else if (action === 'decline') decide({analytics: false, marketing: false});
    else if (action === 'custom') showOptions();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    decide({analytics: Boolean(form.elements.analytics?.checked), marketing: Boolean(form.elements.marketing?.checked)});
  });
  document.body.append(box);
  if (customize) showOptions();
  return box;
}

// "Preferências de cookies" in the footer, beside the legal pages.
function mountFooterLink() {
  const nav = document.querySelector('.footer-legal nav');
  if (!nav || nav.querySelector('[data-cookie-prefs]')) return;
  ensureStyles();
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'footer-cookies'; button.dataset.cookiePrefs = '';
  button.textContent = 'Preferências de cookies';
  button.addEventListener('click', () => openNotice({customize: true}));
  nav.append(button);
}

export function mountConsent() {
  const saved = readConsent();
  if (saved) { loadTools(saved); mountFooterLink(); return; }
  openNotice();
}
