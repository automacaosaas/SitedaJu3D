'use strict';
// E-mails to the shop (ORDER_NOTIFY_EMAIL, the address that already gets the paid orders) when the NF-e service needs
// attention: Bling unstable (the notes wait in the queue), back to normal, the connection lost, or a note that did not
// go out after two days in the queue or is stuck processing. Short, in plain words, and never more than one of a kind
// an hour (Resend's idempotency key). Never throws: an alert that cannot go is logged, and the panel shows the same.
const {config, mailReady, sendMail} = require('./mail');
const {esc} = require('./email-template');

const HOUR = 3600000;
const hhmm = value => value ? new Intl.DateTimeFormat('pt-BR', {timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'}).format(new Date(value)) : '';
const notes = n => n === 1 ? '1 nota fiscal' : `${n} notas fiscais`;

// kind → {subject, title, lines}. `data`: {queued, since, retryAt, lastError} for the Bling ones; `reference` and
// `detail` for a single note.
const COPY = {
  instavel: ({queued = 0, since, retryAt, lastError}) => ({
    subject: 'Bling instável: as notas fiscais estão na fila',
    title: 'Integração com o Bling em modo de espera',
    lines: [
      `O Bling está fora do ar ou instável${since ? ` desde ${hhmm(since)}` : ''}.${lastError ? ` Última falha registrada: ${lastError.replace(/[.\s]+$/, '')}.` : ''}`,
      'Seus pedidos continuam salvos com segurança: a loja segue vendendo normalmente, e confirmar pedidos no painel funciona.',
      `${queued ? `${notes(queued)} esperando na fila` : 'As notas fiscais ficam na fila'} e saem sozinhas assim que o Bling voltar${retryAt ? ` (próxima tentativa por volta de ${hhmm(retryAt)})` : ''}. Não precisa fazer nada.`
    ]
  }),
  voltou: ({queued = 0}) => ({
    subject: 'O Bling voltou: as notas fiscais estão saindo',
    title: 'Integração com o Bling normalizada',
    lines: ['O Bling voltou a responder.', queued ? `${notes(queued)} ainda na fila, saindo agora.` : 'A fila de notas fiscais está em dia.', 'Os clientes recebem a nota por e-mail assim que ela é autorizada.']
  }),
  conexao: ({queued = 0}) => ({
    subject: 'Conecte o Bling de novo para as notas fiscais saírem',
    title: 'A conexão com o Bling expirou',
    lines: ['O Bling não aceitou mais o acesso do site (a conexão expirou ou foi revogada no Bling).', `${queued ? `${notes(queued)} esperando` : 'As próximas notas fiscais ficam'} na fila até alguém conectar de novo.`, 'No painel, em "Nota fiscal · Bling", clique em Conectar ao Bling. Depois disso, as notas saem sozinhas.']
  }),
  desistiu: ({reference, detail}) => ({
    subject: `A nota fiscal do pedido ${reference} não saiu`,
    title: 'Uma nota fiscal precisa de você',
    lines: [`O emissor ficou fora do ar por mais de dois dias, e a nota do pedido ${reference} saiu da fila sem ser emitida${detail ? ` (${detail.replace(/[.\s]+$/, '')})` : ''}.`, 'No painel, abra o pedido e clique em Tentar de novo quando o emissor estiver de volta.']
  }),
  // A package the Correios could not deliver, or are sending back (api/_lib/tracking.js). One e-mail per kind of problem.
  pacote: ({reference, detail, code, returned}) => ({
    area: 'ENTREGA',
    subject: returned ? `O pacote do pedido ${reference} está voltando` : `O pacote do pedido ${reference} precisa de atenção`,
    title: returned ? 'Um pacote está voltando para a loja' : 'Um pacote não foi entregue',
    lines: [`Os Correios registraram no pedido ${reference}${code ? ` (rastreio ${code})` : ''}: ${String(detail || '').replace(/[.\s]+$/, '')}.`,
      returned ? 'O pacote volta para a loja. Fale com o cliente para combinar um novo envio.' : 'Confira o rastreio no painel e, se precisar, fale com o cliente (endereço, alguém para receber) ou com a agência.']
  }),
  parada: ({reference}) => ({
    subject: `A nota fiscal do pedido ${reference} ficou parada`,
    title: 'Uma nota fiscal precisa de você',
    lines: [`A nota do pedido ${reference} ficou em processamento no emissor por mais de um dia.`, 'Confira a situação dela no Bling e, no painel, clique em Tentar de novo.']
  })
};

function renderAlert(kind, data = {}, {test = false, siteUrl = ''} = {}) {
  const copy = COPY[kind](data);
  const link = siteUrl ? `${siteUrl}/admin.html` : '';
  const text = `${copy.title}\n\n${copy.lines.join('\n\n')}${link ? `\n\nPainel: ${link}` : ''}`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#2b1d24;max-width:560px;margin:0 auto;padding:24px">
  <p style="margin:0 0 6px;font-size:12px;letter-spacing:1.5px;color:#b0476b">${esc(copy.area || 'NOTA FISCAL')} · AVISO DO SITE${test ? ' · TESTE' : ''}</p>
  <h1 style="margin:0 0 18px;font-size:22px;font-weight:600">${esc(copy.title)}</h1>
  ${copy.lines.map(line => `<p style="margin:0 0 12px;line-height:1.6">${esc(line)}</p>`).join('\n  ')}
  ${link ? `<p style="margin:18px 0 0"><a href="${esc(link)}" style="display:inline-block;background:#b0476b;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:600">Abrir o painel</a></p>` : ''}
</div>`;
  return {subject: `${test ? '[TESTE] ' : ''}${copy.subject}`, html, text};
}

// True when the e-mail went (or was printed by the console transport); false when there is nowhere to send it.
async function alertOwner({env = process.env, fetchImpl = globalThis.fetch, outbox, now = () => Date.now(), kind, reference = null, detail = null, data = {}, store = null, name = 'bling'}) {
  const mail = config(env), to = String(env.ORDER_NOTIFY_EMAIL || '').trim().toLowerCase();
  if (!COPY[kind] || !to || !mailReady(mail)) return false;
  const message = renderAlert(kind, {...data, reference, detail}, {test: !mail.production, siteUrl: mail.siteUrl});
  try {
    await sendMail({settings: mail, to, subject: message.subject, html: message.html, text: message.text, idempotencyKey: `alert-${name}-${kind}-${reference || 'geral'}-${Math.floor(now() / HOUR)}`, fetchImpl,
      outbox: outbox && (m => outbox({...m, kind: 'alerta', reference: reference || kind}))});
    await store?.integrationLog?.add({name, kind: 'alerta', reference, message: `E-mail enviado: ${message.subject}`}).catch(() => {});
    return true;
  } catch (error) { console.error(`alerts: the "${kind}" e-mail did not go —`, error.status || '', error.message); return false; }
}

module.exports = {alertOwner, renderAlert, COPY};
