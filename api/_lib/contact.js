'use strict';
// "Fale com a Ju" (contato.html): the message form. Checks the fields, keeps bots and floods away (a hidden field no
// person fills, and a limit per address and per e-mail) and e-mails the message to the shop: CONTACT_EMAIL, or the
// ORDER_NOTIFY_EMAIL that already gets the paid orders. The sender's address goes as "reply to", so Ju answers straight
// from her inbox. Nothing is stored on the site.
const {config, mailReady, sendMail} = require('./mail');
const {esc} = require('./email-template');

const SUBJECTS = Object.freeze({produto: 'Dúvida sobre produto', pedido: 'Status do meu pedido', personalizado: 'Orçamento / Personalizado', outro: 'Outro assunto'});
const EMAIL = /^[^\s@<>()[\],;:"\\]+@[^\s@<>()[\],;:"\\]+\.[^\s@<>()[\],;:"\\]+$/;
const LIMITS = [['ip', 5], ['email', 3]];   // messages per hour
const HOUR = 3600000;
const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const fail = (code, extra = {}) => Object.assign(new Error(code), {code, ...extra});

function readMessage(body) {
  const name = clean(body.name, 80), email = String(body.email ?? '').trim().toLowerCase();
  const subject = Object.hasOwn(SUBJECTS, body.subject) ? body.subject : null;
  // Line breaks stay (the message is read as written); other control characters go.
  const message = String(body.message ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
  if (name.length < 2) throw fail('invalid_request', {field: 'name'});
  if (email.length > 180 || !EMAIL.test(email)) throw fail('invalid_request', {field: 'email'});
  if (!subject) throw fail('invalid_request', {field: 'subject'});
  if (message.length < 10 || message.length > 2000) throw fail('invalid_request', {field: 'message'});
  return {name, email, subject, message};
}

function renderContactEmail({name, email, subject, message, test = false}) {
  const topic = SUBJECTS[subject];
  const text = `Nova mensagem pelo formulário de contato do site.\n\nNome: ${name}\nE-mail: ${email}\nAssunto: ${topic}\n\n${message}\n\nResponda este e-mail para falar direto com ${name}.`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#2b1d24;max-width:560px;margin:0 auto;padding:24px">
  <p style="margin:0 0 6px;font-size:12px;letter-spacing:1.5px;color:#b0476b">CONTATO PELO SITE${test ? ' · TESTE' : ''}</p>
  <h1 style="margin:0 0 18px;font-size:22px;font-weight:600">${esc(topic)}</h1>
  <p style="margin:0 0 4px"><strong>Nome:</strong> ${esc(name)}</p>
  <p style="margin:0 0 18px"><strong>E-mail:</strong> <a href="mailto:${esc(email)}" style="color:#b0476b">${esc(email)}</a></p>
  <div style="white-space:pre-wrap;line-height:1.6;background:#fff7f5;border:1px solid #f0dfe3;border-radius:12px;padding:16px">${esc(message)}</div>
  <p style="margin:18px 0 0;font-size:13px;color:#6f5f67">Responda este e-mail para falar direto com ${esc(name)}.</p>
</div>`;
  return {subject: `${test ? '[TESTE] ' : ''}Contato pelo site · ${topic} · ${name}`, html, text};
}

function createContact({store, env = process.env, now = () => Date.now(), fetchImpl = globalThis.fetch, outbox} = {}) {
  async function send(body, {ip = 'unknown'} = {}) {
    if (String(body?.website ?? '').trim()) return {sent: false};   // the hidden field: a bot filled it; answer ok, send nothing
    const data = readMessage(body || {});
    const mail = config(env), to = String(env.CONTACT_EMAIL || env.ORDER_NOTIFY_EMAIL || '').trim().toLowerCase();
    if (!to || !mailReady(mail)) throw fail('contact_unavailable');
    for (const [kind, max] of LIMITS) {
      const taken = await store.rateLimit(`contact-${kind}:${kind === 'ip' ? ip : data.email}`, max, HOUR, now());
      if (!taken.ok) throw fail('too_many_requests', {retryAfter: taken.retryAfter});
    }
    const message = renderContactEmail({...data, test: !mail.production});
    try { await sendMail({settings: mail, to, replyTo: data.email, subject: message.subject, html: message.html, text: message.text, fetchImpl, outbox: outbox && (m => outbox({...m, kind: 'contato', reference: SUBJECTS[data.subject]}))}); }
    catch (error) { console.error('contact: message not sent —', error.status || '', error.message); throw fail('mail_failed'); }
    return {sent: true};
  }
  return {send};
}

module.exports = {createContact, readMessage, renderContactEmail, SUBJECTS};
