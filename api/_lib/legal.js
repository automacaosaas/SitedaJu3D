'use strict';
// The facts the legal pages share: who the store is (the Decreto 7.962/2013 asks an online store to show it) and the
// version of the terms the buyer accepts. tools/sync-legal.cjs copies them into every page (footer and the three
// documents: termos.html, privacidade.html, trocas.html); the server records TERMS_VERSION with each new account and
// each order. Whenever the text of the Termos, the Privacidade or the Trocas changes, move TERMS_VERSION to that day.
//
// Values still to be filled are written as "[PREENCHER: …]": /api/health reports "legal":"pending" while any is left.
const PENDING = what => `[PREENCHER: ${what}]`;

const COMPANY = {
  tradeName: 'Ju, imprime pra mim?',
  legalName: PENDING('razão social'),
  cnpj: PENDING('CNPJ'),
  address: PENDING('endereço completo com CEP'),
  email: PENDING('e-mail de atendimento'),
  phone: PENDING('telefone ou WhatsApp'),
  website: 'https://juimprimepramim.com.br'
};

const TERMS_VERSION = '2026-09-28';

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const termsDate = (version = TERMS_VERSION) => { const [y, m, d] = version.split('-').map(Number); return `${d} de ${MONTHS[m - 1]} de ${y}`; };
const pending = () => Object.values(COMPANY).some(value => String(value).startsWith('[PREENCHER'));

module.exports = {COMPANY, TERMS_VERSION, termsDate, pending};
