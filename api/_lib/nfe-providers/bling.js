'use strict';
// NF-e through Bling: turns the neutral invoice of api/_lib/nfe.js into Bling's NF-e (POST /nfe), sends it to the tax
// authority (POST /nfe/{id}/enviar) and reads back the number, access key and links (GET /nfe/{id}). Same contract as
// fake.js, plus providerId: Bling's id for the note, saved on the invoice, so a new attempt updates and resends that same
// note (PUT /nfe/{id}) and never creates a second one. The tax rules (CFOP, CSOSN, PIS/COFINS) come from the "natureza de
// operação" the accountant set up in Bling; the payment method is Bling's own for Pix, credit or debit card.
//
// Homologação or produção is a setting of the Bling account, not of each call, so the site reads the environment in the
// XML of every note it sends (tpAmb). A note authorized in produção on a site expecting homologação is recorded as what
// it is (a real note) and pauses issuing until someone checks; the opposite (Bling in homologação for the real store)
// is an error, and the next attempt creates a new note.
const {createBling, BlingError} = require('../bling');

const AUTHORIZED = new Set([5, 6, 7]), WAITING = new Set([3, 8, 10]);   // 5 autorizada, 6 emitida DANFE, 7 registrada · 3/8 aguardando recibo/protocolo, 10 consulta
const PROBLEM = {
  1: 'A nota foi criada no Bling, mas ainda não foi enviada à Fazenda. Clique em Tentar de novo.',
  2: 'A nota foi cancelada no Bling. Tentar de novo emite uma nota nova.',
  4: 'A Fazenda rejeitou a nota. Veja o motivo no Bling, corrija e clique em Tentar de novo.',
  9: 'Uso denegado pela Fazenda. Resolva com o contador antes de emitir de novo.',
  11: 'A nota está bloqueada no Bling. Veja no Bling o que falta.'
};
const money = cents => Math.round(Number(cents) || 0) / 100;
const cep = value => String(value || '').replace(/\D/g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2');
const ncm = value => String(value || '').replace(/\D/g, '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1.$2.$3');   // Bling writes the NCM as 9999.99.99
const https = value => /^https:\/\//.test(String(value || '')) ? String(value) : null;

// Bling's body for the note (API v3, POST/PUT /nfe).
function toBling(invoice, paymentMethodId) {
  const r = invoice.recipient, a = r.address;
  return {
    tipo: 1, finalidade: 1,
    naturezaOperacao: {id: Number(invoice.bling.natureId)},
    contato: {
      nome: r.name, tipoPessoa: r.cnpj ? 'J' : 'F', numeroDocumento: r.cnpj || r.cpf, contribuinte: Number(r.ieIndicator),
      ...(r.stateRegistration ? {ie: r.stateRegistration} : {}), ...(r.email ? {email: r.email} : {}),
      endereco: {endereco: a.street, numero: a.number, complemento: a.complement || '', bairro: a.district, cep: cep(a.cep), municipio: a.city, uf: a.state, pais: 'Brasil'}
    },
    itens: invoice.items.map(i => ({codigo: i.code, descricao: i.description, unidade: i.unit, quantidade: i.quantity, valor: money(i.unitCents), tipo: 'P', classificacaoFiscal: ncm(i.ncm), origem: Number(i.icms.origin)})),
    parcelas: [{data: invoice.issuedAt.slice(0, 10), valor: money(invoice.payment.cents), ...(paymentMethodId ? {formaPagamento: {id: Number(paymentMethodId)}} : {})}],
    transporte: {fretePorConta: Number(invoice.freight.mode), frete: money(invoice.freight.cents)},
    ...(invoice.totals?.discountCents ? {desconto: money(invoice.totals.discountCents)} : {}),   // Pix discount, on the whole note
    observacoes: invoice.additionalInfo
  };
}

// What the site records from Bling's note.
function outcome(note, providerId) {
  const situation = Number(note?.situacao);
  const found = {providerId: String(providerId), situation, number: note?.numero ? String(note.numero) : null, series: note?.serie !== undefined && note?.serie !== null ? String(note.serie) : null,
    accessKey: /^\d{44}$/.test(String(note?.chaveAcesso || '')) ? String(note.chaveAcesso) : null, pdfUrl: https(note?.linkPDF) || https(note?.linkDanfe), xmlUrl: https(note?.xml)};
  if (AUTHORIZED.has(situation)) return {...found, status: 'autorizada'};
  if (WAITING.has(situation)) return {...found, status: 'processando'};
  return {...found, status: 'erro', message: PROBLEM[situation] || 'O Bling não informou a situação da nota. Confira no Bling e clique em Tentar de novo.'};
}

const tpAmb = xml => { const match = /<tpAmb>\s*([12])\s*<\/tpAmb>/.exec(String(xml || '')); return match ? (match[1] === '1' ? 'producao' : 'homologacao') : null; };

function createBlingProvider({store, env = process.env, now, fetchImpl}) {
  const bling = createBling({store, env, now, fetchImpl});

  async function checkEnvironment(result, xml, expected) {
    const actual = tpAmb(xml);
    if (!actual || actual === expected) return result;
    if (actual === 'producao') {
      await bling.pause('O Bling emitiu uma nota em PRODUÇÃO, mas este site esperava homologação. Confira com o contador (a nota pode ser cancelada no Bling em até 24 horas) e depois clique em Liberar a emissão.');
      return {...result, environment: 'producao', warning: 'Nota emitida em PRODUÇÃO (tem valor fiscal), mas este site esperava homologação. A emissão foi pausada: confira com o contador.'};
    }
    return {status: 'erro', providerId: null, message: 'O Bling está em homologação: esta nota saiu sem valor fiscal. Mude o ambiente no Bling para produção e clique em Tentar de novo (sai uma nota nova).'};
  }

  return {
    name: 'bling',

    async emit(invoice, {providerId = null} = {}) {
      let id = providerId ? String(providerId) : null;
      try {
        const {pausedReason} = await bling.status();
        if (pausedReason) return {status: 'erro', providerId: id, message: `Emissão pausada: ${pausedReason}`};
        if (id) {
          const current = (await bling.api('GET', `/nfe/${encodeURIComponent(id)}`))?.data;
          const situation = Number(current?.situacao);
          if (AUTHORIZED.has(situation) || WAITING.has(situation) || situation === 9 || situation === 11) return outcome(current, id);   // done, on its way, or needs a person: never twice
          if (situation === 2) id = null;   // cancelled in Bling on purpose: this attempt issues a new note
        }
        const body = toBling(invoice, await bling.paymentMethodId(invoice.payment.code).catch(() => null));
        if (id) await bling.api('PUT', `/nfe/${encodeURIComponent(id)}`, body);
        else {
          const created = (await bling.api('POST', '/nfe', body))?.data;
          if (!created?.id) return {status: 'erro', providerId: null, message: 'O Bling não devolveu o código da nota. Confira no Bling antes de tentar de novo.'};
          id = String(created.id);
        }
        let sent;
        try { sent = await bling.api('POST', `/nfe/${encodeURIComponent(id)}/enviar?enviarEmail=false`, {}); }   // the site e-mails the buyer itself
        catch (error) {
          if (error instanceof BlingError && error.code === 'bling_rejected') return {status: 'erro', providerId: id, message: `Nota recusada: ${error.message}`};
          throw error;
        }
        const result = outcome((await bling.api('GET', `/nfe/${encodeURIComponent(id)}`))?.data, id);
        if (result.situation === 1) Object.assign(result, {status: 'processando', message: undefined});   // just sent: Bling may still be queuing it
        return checkEnvironment(result, sent?.data?.xml, invoice.environment);
      } catch (error) {
        if (!(error instanceof BlingError)) console.error('bling: unexpected failure —', error.message);
        return {status: 'erro', providerId: id, message: error instanceof BlingError ? error.message : 'Falha inesperada ao falar com o Bling. Tente de novo.'};
      }
    },

    async check({providerId} = {}) {
      if (!providerId) return {status: 'erro', message: 'A nota não chegou ao Bling. Clique em Tentar de novo.'};
      return outcome((await bling.api('GET', `/nfe/${encodeURIComponent(providerId)}`))?.data, providerId);
    }
  };
}

module.exports = {createBlingProvider, toBling, outcome, tpAmb};
