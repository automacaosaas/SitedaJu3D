'use strict';
// The facts the legal pages share: who the store is (the Decreto 7.962/2013 asks an online store to show it) and the
// version of the terms the buyer accepts. tools/sync-legal.cjs copies them into every page (footer and the three
// documents: termos.html, privacidade.html, trocas.html); the server records TERMS_VERSION with each new account and
// each order. Whenever the text of the Termos, the Privacidade or the Trocas changes, move TERMS_VERSION to that day.
//
// Values still to be filled are written as "[PREENCHER: …]": /api/health reports "legal":"pending" while any is left.
//
// This is also the one place for the shop's contact channels (audit Q3): the e-mail, the phone, the WhatsApp number and
// the service hours. tools/sync-legal.cjs writes them into the pages (data-company="…") and into dist/company.js, which
// the scripts read (the WhatsApp button on Contato and in the phone menu, the e-mail link, the order confirmation).
// After changing anything here: node tools/sync-legal.cjs
const PENDING = what => `[PREENCHER: ${what}]`;

const COMPANY = {
  tradeName: 'Ju, imprime pra mim?',
  legalName: 'JU IMPRIME PARA MIM LTDA',
  cnpj: '67.771.044/0001-96',
  address: 'Rua Presidente Castelo Branco, 61, Nossa Senhora de Lourdes, Ouro Preto/MG, CEP 35404-450',
  email: PENDING('e-mail de atendimento'),
  phone: PENDING('telefone ou WhatsApp'),
  hours: 'Segunda a sexta, das 9h às 18h',
  website: 'https://juimprimepramim.com.br'
};
// The WhatsApp number, digits only, with the country code and the area code (5531999999999). Optional: while empty, the
// site shows no WhatsApp button and says the channel is coming. Not part of COMPANY, so it never shows as "[PREENCHER]".
const WHATSAPP = '';

const TERMS_VERSION = '2026-10-06';

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const termsDate = (version = TERMS_VERSION) => { const [y, m, d] = version.split('-').map(Number); return `${d} de ${MONTHS[m - 1]} de ${y}`; };
const pending = () => Object.values(COMPANY).some(value => String(value).startsWith('[PREENCHER'));
const filled = value => (String(value).startsWith('[PREENCHER') ? '' : String(value));

// What the scripts of the site may show: empty strings for what is still to be filled (the page then hides that channel).
const contact = () => ({email: filled(COMPANY.email), phone: filled(COMPANY.phone), whatsapp: /^\d{12,13}$/.test(WHATSAPP) ? WHATSAPP : '', hours: filled(COMPANY.hours)});

module.exports = {COMPANY, WHATSAPP, TERMS_VERSION, termsDate, pending, contact};
