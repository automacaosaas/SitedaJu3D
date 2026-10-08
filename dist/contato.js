// "Fale com a Ju" (contato.html): the WhatsApp button and the e-mail link (each appears once it is filled in
// api/_lib/legal.js, copied to company.js by tools/sync-legal.cjs), the message form (checked here, then sent to
// /api/contact/send, which saves it for Mensagens in Ju's panel and e-mails her a notice) and a link straight to one question.
import {CONTACT} from './company.js';
import {translate, getLanguage} from './i18n.js';

// ── WhatsApp: a ready greeting in the visitor's language; without a number the card says it is coming ──
const number = /^\d{12,13}$/.test(CONTACT.whatsapp) ? CONTACT.whatsapp : '';
const whatsapp = document.querySelector('[data-whatsapp-link]');
const whatsappUrl = () => `https://wa.me/${number}?text=${encodeURIComponent(translate('Olá, Ju! Vim pelo site e tenho uma dúvida.'))}`;
if (number && whatsapp) {
  whatsapp.href = whatsappUrl();
  whatsapp.addEventListener('click', () => { whatsapp.href = whatsappUrl(); });   // the language may have changed since
  whatsapp.hidden = false;
  document.querySelector('[data-whatsapp-soon]').hidden = true;
  // the number itself, for whoever prefers to save it (written in the page by tools/sync-legal.cjs)
  const shown = document.querySelector('[data-whatsapp-number]');
  if (shown && CONTACT.phone) shown.hidden = false;
}
// ── E-mail: the official address, the same as in the footer and the legal pages ──
const mail = document.querySelector('[data-email-link]');
if (CONTACT.email && mail) {
  mail.href = `mailto:${CONTACT.email}`;
  mail.hidden = false;
  document.querySelector('[data-email-soon]').hidden = true;
}

// ── the form ────────────────────────────────────────────────────────────
const form = document.querySelector('#contact-form'), sent = document.querySelector('.contact-sent'), error = form.querySelector('.contact-error');
const MESSAGES = {name: 'Digite seu nome.', email: 'Digite um e-mail válido.', phone: 'Confira o WhatsApp: com DDD, como (31) 99999-9999. De fora do Brasil, comece com + e o código do país.', subject: 'Escolha um assunto.', message: 'Escreva sua mensagem, com pelo menos 10 caracteres.'};
const EMAIL = /^[^\s@<>()[\],;:"\\]+@[^\s@<>()[\],;:"\\]+\.[^\s@<>()[\],;:"\\]+$/;
// The optional WhatsApp, as the server reads it (api/_lib/contact.js): a Brazilian number with the area code, or one from
// abroad that starts with + (or 00) and its country code.
function phoneOk(value) {
  const text = value.trim(), digits = text.replace(/\D/g, '');
  if (!text) return true;
  if (!/^[\d\s()+.-]+$/.test(text)) return false;
  if (/^(55)?[1-9]{2}(9\d{8}|[2-8]\d{7})$/.test(digits)) return true;
  const abroad = /^(\+|00)/.test(text) ? digits.replace(/^00/, '') : '';
  return /^[1-9]\d{7,14}$/.test(abroad) && !abroad.startsWith('55');
}
const firstProblem = data => data.name.trim().length < 2 ? 'name' : !EMAIL.test(data.email.trim()) ? 'email' : !phoneOk(data.phone) ? 'phone' : !data.subject ? 'subject' : data.message.trim().length < 10 ? 'message' : null;

function showError(text, field) {
  error.textContent = translate(text);
  error.hidden = false;
  form.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
  if (field) { form.elements[field].setAttribute('aria-invalid', 'true'); form.elements[field].focus(); }
}
form.addEventListener('input', event => {
  if (!event.target.hasAttribute('aria-invalid')) return;
  event.target.removeAttribute('aria-invalid');
  error.hidden = true;
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  const data = {name: values.name || '', email: values.email || '', phone: values.phone || '', subject: values.subject || '', message: values.message || '', website: values.website || '', lang: getLanguage()};
  const problem = firstProblem(data);
  if (problem) return showError(MESSAGES[problem], problem);
  const button = form.querySelector('.contact-submit'), label = button.firstElementChild, idle = label.textContent;
  button.disabled = true; label.textContent = translate('Enviando…');
  try {
    const response = await fetch('/api/contact/send', {method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)});
    const answer = await response.json().catch(() => ({}));
    if (response.ok) { form.reset(); error.hidden = true; form.hidden = true; sent.hidden = false; sent.focus(); return; }
    if (answer.error === 'invalid_request' && MESSAGES[answer.field]) return showError(MESSAGES[answer.field], answer.field);
    showError(answer.error === 'too_many_requests' ? 'Muitas mensagens seguidas. Tente de novo daqui a pouco.' : CONTACT.email ? `${translate('Não foi possível enviar agora. Tente de novo em alguns minutos ou escreva para')} ${CONTACT.email}.` : 'Não foi possível enviar agora. Tente de novo em alguns minutos.');
  } catch {
    showError('Não foi possível enviar agora. Confira a sua conexão e tente de novo.');
  } finally {
    button.disabled = false; label.textContent = idle;
  }
});
document.querySelector('[data-contact-again]').addEventListener('click', () => { sent.hidden = true; form.hidden = false; form.elements.name.focus(); });

// ── questions: the slide is pure CSS (contact.css), so a question never gets stuck half open ──
// A link to one question (contato.html#faq-frete) opens it.
const linked = location.hash.length > 1 && document.querySelector(`details.faq-item#${CSS.escape(location.hash.slice(1))}`);
if (linked) linked.open = true;
