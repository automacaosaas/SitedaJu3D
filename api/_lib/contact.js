'use strict';
// "Fale com a Ju" (contato.html): the message form. Checks the fields, keeps bots and floods away (a hidden field no
// person fills; limits per address and per e-mail an hour, per address a day, and a cap for the whole site a day) and
// SAVES the message first (store.messages: Mensagens in Ju's panel, db/migrations/015_mensagens.sql). Then, as a best
// effort, it e-mails Ju a notice: CONTACT_EMAIL, or the ORDER_NOTIFY_EMAIL that already gets the paid orders, with the
// sender's address as "reply to" and a link to the panel. An e-mail that does not go out no longer loses the message.
// One that looks like automatic advertising (spam) is saved as such, with no e-mail, and stays out of the panel's Novas.
// The optional WhatsApp is stored encrypted (DATA_KEY), like the phone of an order.
const crypto = require('node:crypto');
const {config, mailReady, sendMail} = require('./mail');
const {esc} = require('./email-template');
const {digits, normalizePhone, formatPhone, encrypt} = require('./fields');

const SUBJECTS = Object.freeze({produto: 'Dúvida sobre produto', pedido: 'Status do meu pedido', personalizado: 'Orçamento / Personalizado', outro: 'Outro assunto'});
const EMAIL = /^[^\s@<>()[\],;:"\\]+@[^\s@<>()[\],;:"\\]+\.[^\s@<>()[\],;:"\\]+$/;
const LANGS = ['pt-BR', 'en', 'es'];
const HOUR = 3600000, DAY = 24 * HOUR;
// [bucket, messages, window]. The address comes from X-Forwarded-For, which some hosts let a sender choose: the cap per
// e-mail and the one for the whole site are what really bound a flood (and the size of the table).
const LIMITS = [['ip', 5, HOUR], ['email', 3, HOUR], ['ip-day', 20, DAY], ['all', 200, DAY]];
// An order number in the text ("JU-1A2B3C4D5E"): the panel links to it.
const ORDER_REF = /\bJU-[0-9A-Z]{4,16}\b/i;
const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const fail = (code, extra = {}) => Object.assign(new Error(code), {code, ...extra});

// The optional WhatsApp, as digits with the country code: a Brazilian number with the area code ("(31) 99198-1151",
// with or without +55) or, from abroad, one that starts with + (or 00) and its country code. Empty → null.
function readPhone(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (text.length > 30 || !/^[\d\s()+.-]+$/.test(text)) throw fail('invalid_request', {field: 'phone'});
  const brazil = normalizePhone(text);
  if (brazil) return `55${brazil}`;
  const abroad = /^(\+|00)/.test(text) ? digits(text).replace(/^00/, '') : '';
  if (/^[1-9]\d{7,14}$/.test(abroad) && !abroad.startsWith('55')) return abroad;
  throw fail('invalid_request', {field: 'phone'});
}
// As people read it: "(31) 99198-1151" for Brazil, "+52 5512345678" from abroad.
const showPhone = number => !number ? '' : /^55\d{10,11}$/.test(number) ? formatPhone(number.slice(2)) : `+${number}`;

function readMessage(body) {
  const name = clean(body.name, 80), email = String(body.email ?? '').trim().toLowerCase();
  const subject = Object.hasOwn(SUBJECTS, body.subject) ? body.subject : null;
  // Line breaks stay (the message is read as written); other control characters go.
  const message = String(body.message ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
  if (name.length < 2) throw fail('invalid_request', {field: 'name'});
  if (email.length > 180 || !EMAIL.test(email)) throw fail('invalid_request', {field: 'email'});
  const phone = readPhone(body.phone);
  if (!subject) throw fail('invalid_request', {field: 'subject'});
  if (message.length < 10 || message.length > 2000) throw fail('invalid_request', {field: 'message'});
  return {name, email, phone, subject, message, lang: LANGS.includes(body.lang) ? body.lang : 'pt-BR', orderRef: (ORDER_REF.exec(message)?.[0] || '').toUpperCase() || null};
}

// Automatic advertising: many links, link markup, a link as the name, or the message being only the name again.
function looksLikeSpam({name, message}) {
  const links = (message.match(/https?:\/\/|www\./gi) || []).length;
  return links > 3 || /\[url[=\]]|<a\s+href/i.test(message) || /https?:\/\/|www\./i.test(name) || message.toLowerCase() === name.toLowerCase();
}

function renderContactEmail({name, email, phone = null, subject, message, panelUrl = null, test = false}) {
  const topic = SUBJECTS[subject], shown = showPhone(phone);
  const text = `Nova mensagem pelo formulário de contato do site.\n\nNome: ${name}\nE-mail: ${email}${shown ? `\nWhatsApp: ${shown}` : ''}\nAssunto: ${topic}\n\n${message}\n\nResponda este e-mail para falar direto com ${name}.${panelUrl ? `\nA mensagem também está no Painel da Ju, em Mensagens: ${panelUrl}` : ''}`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#2b1d24;max-width:560px;margin:0 auto;padding:24px">
  <p style="margin:0 0 6px;font-size:12px;letter-spacing:1.5px;color:#b0476b">CONTATO PELO SITE${test ? ' · TESTE' : ''}</p>
  <h1 style="margin:0 0 18px;font-size:22px;font-weight:600">${esc(topic)}</h1>
  <p style="margin:0 0 4px"><strong>Nome:</strong> ${esc(name)}</p>
  <p style="margin:0 0 ${shown ? 4 : 18}px"><strong>E-mail:</strong> <a href="mailto:${esc(email)}" style="color:#b0476b">${esc(email)}</a></p>${shown ? `
  <p style="margin:0 0 18px"><strong>WhatsApp:</strong> <a href="https://wa.me/${esc(phone)}" style="color:#b0476b">${esc(shown)}</a></p>` : ''}
  <div style="white-space:pre-wrap;line-height:1.6;background:#fff7f5;border:1px solid #f0dfe3;border-radius:12px;padding:16px">${esc(message)}</div>
  <p style="margin:18px 0 0;font-size:13px;color:#6f5f67">Responda este e-mail para falar direto com ${esc(name)}.</p>${panelUrl ? `
  <p style="margin:18px 0 0"><a href="${esc(panelUrl)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#b0476b;color:#ffffff;font-weight:700;text-decoration:none">Abrir no Painel da Ju</a></p>` : ''}
</div>`;
  return {subject: `${test ? '[TESTE] ' : ''}Contato pelo site · ${topic} · ${name}`, html, text};
}

function createContact({store, env = process.env, now = () => Date.now(), fetchImpl = globalThis.fetch, outbox} = {}) {
  async function send(body, {ip = 'unknown'} = {}) {
    if (String(body?.website ?? '').trim()) return {sent: false, saved: false, mailed: false};   // the hidden field: a bot filled it; answer ok, keep nothing
    const data = readMessage(body || {});
    for (const [kind, max, windowMs] of LIMITS) {
      const key = kind.startsWith('ip') ? ip : kind === 'email' ? data.email : 'site';
      const taken = await store.rateLimit(`contact-${kind}:${key}`, max, windowMs, now());
      if (!taken.ok) throw fail('too_many_requests', {retryAfter: taken.retryAfter});
    }
    // 1. Saved, so Ju sees it in the panel whatever happens to the e-mail.
    const id = crypto.randomUUID(), spam = looksLikeSpam(data);
    let saved = false;
    try {
      await store.messages.create({id, name: data.name, email: data.email, phoneEnc: data.phone ? encrypt(env, data.phone) : null, subject: data.subject, message: data.message,
        orderRef: data.orderRef, lang: data.lang, status: spam ? 'spam' : 'nova', createdAt: new Date(now())});
      saved = true;
    } catch (error) { console.error('contact: message not saved —', error.code || error.message); }
    if (spam) { if (!saved) throw fail('contact_unavailable'); return {sent: true, saved, mailed: false}; }
    // 2. The notice by e-mail, when there is an inbox and an e-mail service. Its failure is only logged.
    const mail = config(env), to = String(env.CONTACT_EMAIL || env.ORDER_NOTIFY_EMAIL || '').trim().toLowerCase();
    let mailed = false;
    if (to && mailReady(mail)) {
      const notice = renderContactEmail({...data, panelUrl: saved ? `${mail.siteUrl}/admin.html#mensagens` : null, test: !mail.production});
      try {
        await sendMail({settings: mail, to, replyTo: data.email, subject: notice.subject, html: notice.html, text: notice.text, fetchImpl, outbox: outbox && (m => outbox({...m, kind: 'contato', reference: SUBJECTS[data.subject]}))});
        mailed = true;
      } catch (error) { console.error('contact: e-mail notice not sent —', error.status || '', error.message); }
    }
    // Neither saved nor e-mailed: the person is told to try again (nothing reached the shop).
    if (!saved && !mailed) throw fail('contact_unavailable');
    if (saved && mailed) await store.messages.update(id, {mailedAt: new Date(now())}).catch(error => console.error('contact: could not mark the notice as sent —', error.code || error.message));
    return {sent: true, saved, mailed};
  }
  return {send};
}

module.exports = {createContact, readMessage, readPhone, showPhone, looksLikeSpam, renderContactEmail, SUBJECTS, LIMITS};
