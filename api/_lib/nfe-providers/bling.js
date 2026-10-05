'use strict';
// NF-e through Bling: turns the neutral invoice of api/_lib/nfe.js into Bling's NF-e (POST /nfe), sends it to the tax
// authority (POST /nfe/{id}/enviar) and reads back the number, access key and links (GET /nfe/{id}). Same contract as
// fake.js, plus providerId: Bling's id for the note, saved on the invoice, so a new attempt updates and resends that same
// note (PUT /nfe/{id}) and never creates a second one; a note the tax authority refused is resent as it is in Bling, where
// it was fixed. The tax rules (CFOP, CSOSN, PIS/COFINS) come from the "natureza de operação" the accountant set up in
// Bling; the payment method is Bling's own for Pix, credit or debit card.
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
  4: 'A Fazenda rejeitou a nota. Veja o motivo no Bling, corrija a nota lá mesmo e clique em Tentar de novo: o site reenvia a nota como ela está no Bling.',
  9: 'Uso denegado pela Fazenda. Resolva com o contador antes de emitir de novo.',
  11: 'A nota está bloqueada no Bling. Veja no Bling o que falta.'
};
const FAZENDA_REFUSAL = /rejei[cç][aã]o/i;   // the tax authority's refusals ("234 - Rejeicao: …", "Rejeição 539: …"); Bling's own checks never say it
const money = cents => Math.round(Number(cents) || 0) / 100;
const cep = value => String(value || '').replace(/\D/g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2');
const ncm = value => String(value || '').replace(/\D/g, '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1.$2.$3');   // Bling writes the NCM as 9999.99.99
const https = value => /^https:\/\//.test(String(value || '')) ? String(value) : null;
// Bling takes local date-times ("AAAA-MM-DD HH:MM:SS", Brasília time) and refuses a note without dataEmissao and
// dataOperacao ("Data de operação inválida"); the site keeps UTC, which would also turn an evening sale into the next day.
const brasilia = iso => new Intl.DateTimeFormat('sv-SE', {timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'}).format(new Date(iso));

// Bling's body for the note (API v3, POST/PUT /nfe).
function toBling(invoice, paymentMethodId) {
  const r = invoice.recipient, a = r.address, when = brasilia(invoice.issuedAt);
  return {
    tipo: 1, finalidade: 1, dataEmissao: when, dataOperacao: when,
    naturezaOperacao: {id: Number(invoice.bling.natureId)},
    contato: {
      nome: r.name, tipoPessoa: r.cnpj ? 'J' : 'F', numeroDocumento: r.cnpj || r.cpf, contribuinte: Number(r.ieIndicator),
      ...(r.stateRegistration ? {ie: r.stateRegistration} : {}), ...(r.email ? {email: r.email} : {}),
      endereco: {endereco: a.street, numero: a.number, complemento: a.complement || '', bairro: a.district, cep: cep(a.cep), municipio: a.city, uf: a.state, pais: 'Brasil'}
    },
    itens: invoice.items.map(i => ({codigo: i.code, descricao: i.description, unidade: i.unit, quantidade: i.quantity, valor: money(i.unitCents), tipo: 'P', classificacaoFiscal: ncm(i.ncm), origem: Number(i.icms.origin)})),
    parcelas: [{data: when.slice(0, 10), valor: money(invoice.payment.cents), ...(paymentMethodId ? {formaPagamento: {id: Number(paymentMethodId)}} : {})}],
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

// The creation broke after it left the site: Bling may have created the note, and creating again could make two.
const UNKNOWN_CREATION = 'O Bling não confirmou se criou a nota: a conexão caiu no meio do envio. Confira no Bling (Vendas → Notas Fiscais de Saída) se já existe uma nota deste pedido. Se não existir, clique em Tentar de novo. Se existir, não tente por aqui: envie aquela nota pelo próprio Bling, para não sair nota em dobro.';

// While it is not known whether Bling created a note (the creation broke midway), the invoice keeps, instead of Bling's
// id, "busca:" and the second of issue the site sent: the next attempt looks for that note in Bling before anything else.
const SEARCH = /^busca:(\d{14})$/;
const SEARCHING = 'A conexão caiu no meio da criação da nota. Antes de tentar de novo, o site procura no Bling a nota que pode ter sido criada, para não sair nota em dobro.';
const plain = value => String(value || '').toUpperCase().replace(/[^0-9A-Z]/g, '');

// Bling down, slow, refusing for too many calls (or the breaker open), or the connection lost: the note waits in the
// queue (`wait`) and goes by itself later. Anything else Bling refuses is about the note itself and needs a person.
const passing = error => error instanceof BlingError && (error.transient || error.code === 'not_connected');
const waiting = (error, providerId) => ({status: 'erro', wait: error.code === 'not_connected' ? 'conexao' : 'bling', retryAt: error.retryAt || null, providerId, message: error.message});

function createBlingProvider({store, env = process.env, now, fetchImpl, sleep, clock}) {
  const bling = createBling({store, env, now, fetchImpl, sleep, clock});

  async function checkEnvironment(result, xml, expected) {
    const actual = tpAmb(xml);
    if (!actual || actual === expected) return result;
    if (actual === 'producao') {
      await bling.pause('O Bling emitiu uma nota em PRODUÇÃO, mas este site esperava homologação. Confira com o contador (a nota pode ser cancelada no Bling em até 24 horas) e depois clique em Liberar a emissão.');
      return {...result, environment: 'producao', warning: 'Nota emitida em PRODUÇÃO (tem valor fiscal), mas este site esperava homologação. A emissão foi pausada: confira com o contador.'};
    }
    return {status: 'erro', providerId: null, message: 'O Bling está em homologação: esta nota saiu sem valor fiscal. Mude o ambiente no Bling para produção e clique em Tentar de novo (sai uma nota nova).'};
  }

  // The note a broken creation may have left in Bling: among the notes of that day not yet sent, the one of this buyer
  // (CPF or CNPJ) issued at that exact second. Exactly one: its id. None, or more than one: null, and a person decides.
  async function findCreated(stamp, document, ref) {
    const day = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`;
    const data = await bling.api('GET', `/nfe?pagina=1&limite=100&tipo=1&situacao=1&dataEmissaoInicial=${day}&dataEmissaoFinal=${day}`, null, ref);
    const found = (data?.data || []).filter(n => n?.id && String(n.dataEmissao || '').replace(/\D/g, '') === stamp && plain(n.contato?.numeroDocumento) === plain(document) && (n.situacao === undefined || Number(n.situacao) === 1));
    return found.length === 1 ? String(found[0].id) : null;
  }

  return {
    name: 'bling',
    wake: () => bling.wake(),

    // lastError: the reason the previous attempt failed, as the panel shows it (null on the first attempt).
    async emit(invoice, {providerId = null, lastError = null} = {}) {
      let id = providerId ? String(providerId) : null, asInBling = false;
      const ref = {reference: invoice.reference};
      try {
        const {pausedReason} = await bling.status();
        if (pausedReason) return {status: 'erro', wait: 'pausa', providerId: id, message: `Emissão pausada: ${pausedReason}`};
        const search = SEARCH.exec(id || '');
        if (search) {
          // Bling not answering throws here and the invoice keeps the marker: the search runs again on the next attempt.
          id = await findCreated(search[1], invoice.recipient.cnpj || invoice.recipient.cpf, ref);
          if (!id) { await bling.log({kind: 'incerta', operation: 'GET /nfe', reference: invoice.reference, message: 'A nota não foi encontrada no Bling com segurança: é preciso conferir à mão.'}); return {status: 'erro', providerId: null, message: UNKNOWN_CREATION}; }
          await bling.log({kind: 'achada', operation: 'GET /nfe', reference: invoice.reference, message: `A nota ${id} foi encontrada no Bling: o envio segue com ela, sem criar outra.`});
        }
        if (id) {
          const current = (await bling.api('GET', `/nfe/${encodeURIComponent(id)}`, null, ref))?.data;
          const situation = Number(current?.situacao);
          if (AUTHORIZED.has(situation) || WAITING.has(situation) || situation === 9 || situation === 11) return outcome(current, id);   // done, on its way, or needs a person: never twice
          if (situation === 2) id = null;   // cancelled in Bling on purpose: this attempt issues a new note
          // Refused by the tax authority: the panel cannot edit the buyer's data, so the fix is made on the note in Bling and
          // it goes again as it is there. Rewriting it with the order's data would undo the fix and bring the same refusal back.
          else asInBling = situation === 4 || FAZENDA_REFUSAL.test(String(lastError || ''));
        }
        if (!asInBling) {
          // Bling's payment method for the note (or none: Bling's default). Bling not answering stops here, before anything
          // is created.
          let method = null;
          try { method = await bling.paymentMethodId(invoice.payment.code, ref); } catch (error) { if (passing(error)) throw error; }
          const body = toBling(invoice, method);
          if (id) await bling.api('PUT', `/nfe/${encodeURIComponent(id)}`, body, ref);
          else {
            let created;
            try { created = (await bling.api('POST', '/nfe', body, {...ref, unsafe: true}))?.data; }
            catch (error) {
              // It may have been created: wait in the queue with the marker; the next attempt looks for it first.
              if (error instanceof BlingError && error.unknown) {
                await bling.log({kind: 'incerta', operation: 'POST /nfe', reference: invoice.reference, message: `${error.message} A nota pode ter sido criada: o site vai procurá-la no Bling.`});
                return {status: 'erro', wait: 'bling', providerId: `busca:${String(body.dataEmissao).replace(/\D/g, '')}`, message: SEARCHING};
              }
              throw error;
            }
            if (!created?.id) return {status: 'erro', providerId: null, message: 'O Bling não devolveu o código da nota. Confira no Bling antes de tentar de novo.'};
            id = String(created.id);
          }
        }
        let sent;
        try { sent = await bling.api('POST', `/nfe/${encodeURIComponent(id)}/enviar?enviarEmail=false`, {}, ref); }   // the site e-mails the buyer itself
        catch (error) {
          if (error instanceof BlingError && error.code === 'bling_rejected') {
            // Refused because it is already on its way (an earlier sending that seemed lost got through): what Bling shows wins.
            const shown = (await bling.api('GET', `/nfe/${encodeURIComponent(id)}`, null, ref).catch(() => null))?.data;
            if (AUTHORIZED.has(Number(shown?.situacao)) || WAITING.has(Number(shown?.situacao))) return checkEnvironment(outcome(shown, id), null, invoice.environment);
            const message = FAZENDA_REFUSAL.test(error.message)
              ? `Nota recusada pela Fazenda: ${error.message.replace(/[.\s]+$/, '')}. Corrija a nota no Bling e clique em Tentar de novo: o site reenvia a nota como ela está no Bling.`
              : `Nota recusada: ${error.message}`;
            return {status: 'erro', providerId: id, message};
          }
          throw error;
        }
        const result = outcome((await bling.api('GET', `/nfe/${encodeURIComponent(id)}`, null, ref))?.data, id);
        if (result.situation === 1) Object.assign(result, {status: 'processando', message: undefined});   // just sent: Bling may still be queuing it
        return checkEnvironment(result, sent?.data?.xml, invoice.environment);
      } catch (error) {
        if (passing(error)) return waiting(error, id);
        if (!(error instanceof BlingError)) console.error('bling: unexpected failure —', error.message);
        return {status: 'erro', providerId: id, message: error instanceof BlingError ? error.message : 'Falha inesperada ao falar com o Bling. Tente de novo.'};
      }
    },

    // A note already sent: what Bling says of it now. Bling not answering throws (the queue asks again later).
    async check({providerId, reference = null} = {}) {
      if (!providerId) return {status: 'erro', message: 'A nota não chegou ao Bling. Clique em Tentar de novo.'};
      return outcome((await bling.api('GET', `/nfe/${encodeURIComponent(providerId)}`, null, {reference}))?.data, providerId);
    }
  };
}

module.exports = {createBlingProvider, toBling, outcome, tpAmb, UNKNOWN_CREATION};
