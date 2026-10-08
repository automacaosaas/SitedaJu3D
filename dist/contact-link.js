// "entre em contato" na descrição de uma peça (hoje, o avião: "Para saber mais medidas, entre em contato.") abre o e-mail da Ju,
// já com o assunto (06/10/2026). O texto fica em três pedaços que o i18n traduz: o antes, "entre em contato" e o depois.
import {COMMERCE} from './commerce-config.js';

export const CONTACT_PHRASE = 'entre em contato';
export const contactMail = subject => `mailto:${COMMERCE.contactEmail}?subject=${encodeURIComponent(subject)}`;
export const splitContact = text => {
  const at = text.indexOf(CONTACT_PHRASE);
  return at < 0 ? [text] : [text.slice(0, at), CONTACT_PHRASE, text.slice(at + CONTACT_PHRASE.length)];
};
export function fillDescription(element, text, title) {
  const [before, phrase, after] = splitContact(text);
  if (!phrase) { element.textContent = text; return; }
  const link = document.createElement('a');
  link.className = 'contact-mail'; link.href = contactMail(`Dúvida sobre o ${title}`); link.textContent = phrase;
  element.replaceChildren(before, link, after);
}
