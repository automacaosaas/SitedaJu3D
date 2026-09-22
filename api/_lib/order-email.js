'use strict';
// E-mails sent when Mercado Pago confirms a payment: one to Ju (what to produce, colors, where to send) and one to the
// customer (receipt, in the language they used on the site). Same look as the verification e-mail: tables and inline styles.
const {COPY, C, SERIF, SANS, esc} = require('./email-template');
const {money, describeSelection} = require('./catalog');

const CUSTOMER = {
  'pt-BR': {
    subject: ref => `Pagamento confirmado · ${ref} · Ju, imprime pra mim?`, preheader: 'Recebemos o seu pagamento. A Ju já vai preparar suas peças.',
    eyebrow: 'PAGAMENTO CONFIRMADO', title: ['Recebemos seu pedido,', 'obrigada!'], hello: name => name ? `Olá, ${name}.` : 'Olá!',
    intro: 'Seu pagamento foi confirmado e a Ju já vai começar a preparar suas peças, uma a uma.',
    order: 'PEDIDO', pieces: 'SUAS PEÇAS', piece: n => n === 1 ? '1 peça' : `${n} peças`, subtotal: 'Subtotal', delivery: 'Entrega', total: 'Total', payment: 'PAGAMENTO', deliverTo: 'ENTREGA', notes: 'SUA OBSERVAÇÃO',
    pix: 'Pix', credit: n => n > 1 ? `Cartão de crédito · ${n}x` : 'Cartão de crédito', debit: 'Cartão de débito',
    next: 'Quando as peças estiverem a caminho, avisamos por aqui.', test: 'AMBIENTE DE TESTE · nenhum valor real foi cobrado.'
  },
  en: {
    subject: ref => `Payment confirmed · ${ref} · Ju, imprime pra mim?`, preheader: 'We received your payment. Ju will start preparing your pieces.',
    eyebrow: 'PAYMENT CONFIRMED', title: ['We received your order,', 'thank you!'], hello: name => name ? `Hello, ${name}.` : 'Hello!',
    intro: 'Your payment is confirmed and Ju will start preparing your pieces, one by one.',
    order: 'ORDER', pieces: 'YOUR PIECES', piece: n => n === 1 ? '1 piece' : `${n} pieces`, subtotal: 'Subtotal', delivery: 'Delivery', total: 'Total', payment: 'PAYMENT', deliverTo: 'DELIVERY', notes: 'YOUR NOTE',
    pix: 'Pix', credit: n => n > 1 ? `Credit card · ${n}x` : 'Credit card', debit: 'Debit card',
    next: 'We will let you know here when your pieces are on their way.', test: 'TEST ENVIRONMENT · no real money was charged.'
  },
  es: {
    subject: ref => `Pago confirmado · ${ref} · Ju, imprime pra mim?`, preheader: 'Recibimos tu pago. Ju empezará a preparar tus piezas.',
    eyebrow: 'PAGO CONFIRMADO', title: ['Recibimos tu pedido,', '¡gracias!'], hello: name => name ? `Hola, ${name}.` : '¡Hola!',
    intro: 'Tu pago fue confirmado y Ju empezará a preparar tus piezas, una por una.',
    order: 'PEDIDO', pieces: 'TUS PIEZAS', piece: n => n === 1 ? '1 pieza' : `${n} piezas`, subtotal: 'Subtotal', delivery: 'Entrega', total: 'Total', payment: 'PAGO', deliverTo: 'ENTREGA', notes: 'TU OBSERVACIÓN',
    pix: 'Pix', credit: n => n > 1 ? `Tarjeta de crédito · ${n}x` : 'Tarjeta de crédito', debit: 'Tarjeta de débito',
    next: 'Cuando tus piezas estén en camino, te avisaremos por aquí.', test: 'ENTORNO DE PRUEBA · no se cobró ningún valor real.'
  }
};

const OWNER = Object.freeze({
  subject: (ref, total, test) => `${test ? '[TESTE] ' : ''}Novo pedido pago · ${ref} · ${total}`, preheader: 'Pagamento confirmado. Confira as cores e o endereço.',
  eyebrow: 'NOVO PEDIDO', title: ['Pedido pago,', 'pronto para produzir.'], intro: 'O Mercado Pago confirmou este pagamento. Abaixo estão as peças, as cores escolhidas e para onde enviar.',
  order: 'PEDIDO', pieces: 'PEÇAS E CORES', piece: n => n === 1 ? '1 peça' : `${n} peças`, subtotal: 'Subtotal', delivery: 'Entrega', total: 'Total', payment: 'PAGAMENTO', deliverTo: 'ENTREGAR PARA', notes: 'OBSERVAÇÃO DO CLIENTE',
  pix: 'Pix', credit: n => n > 1 ? `Cartão de crédito · ${n}x` : 'Cartão de crédito', debit: 'Cartão de débito', test: 'AMBIENTE DE TESTE · nenhum valor real foi cobrado.',
  contact: 'CONTATO', mpOrder: 'Pedido no Mercado Pago'
});

const label = text => `<p style="margin:0 0 8px;color:${C.rose};font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:2px;line-height:16px;">${esc(text)}</p>`;
const line = (text, extra = '') => `<p style="margin:0;color:${C.ink};font-family:${SANS};font-size:15px;line-height:23px;${extra}">${text}</p>`;
const section = (title, inner) => `<tr><td class="px" style="padding:22px 44px 0;">${label(title)}${inner}</td></tr>`;

function methodLabel(copy, method) {
  if (method.id === 'pix' || method.type === 'bank_transfer') return copy.pix;
  return method.type === 'debit_card' ? copy.debit : copy.credit(method.installments || 1);
}

function itemsTable(copy, summary, lang) {
  const rows = summary.items.map(item => {
    const colors = describeSelection(item.productId, item.selection, lang).map(entry => `${esc(entry.part)}: <strong>${esc(entry.color)}</strong>`).join(' · ');
    return `<tr><td style="padding:12px 0;border-bottom:1px solid ${C.rule};font-family:${SANS};"><p style="margin:0;color:${C.ink};font-size:15px;line-height:22px;font-weight:700;">${esc(item.title)} <span style="color:${C.muted};font-weight:400;">× ${item.quantity}</span></p><p style="margin:4px 0 0;color:${C.muted};font-size:13px;line-height:20px;">${colors}</p></td><td align="right" valign="top" style="padding:12px 0 12px 12px;border-bottom:1px solid ${C.rule};font-family:${SANS};color:${C.ink};font-size:15px;white-space:nowrap;">${esc(money(item.unitCents * item.quantity))}</td></tr>`;
  }).join('');
  const subtotal = summary.items.reduce((sum, item) => sum + item.unitCents * item.quantity, 0);
  const total = (name, value, strong) => `<tr><td style="padding:${strong ? '12px' : '8px'} 0 0;font-family:${SANS};color:${strong ? C.ink : C.muted};font-size:${strong ? 16 : 14}px;font-weight:${strong ? 700 : 400};">${esc(name)}</td><td align="right" style="padding:${strong ? '12px' : '8px'} 0 0;font-family:${SANS};color:${strong ? C.rose : C.muted};font-size:${strong ? 17 : 14}px;font-weight:${strong ? 700 : 400};">${esc(value)}</td></tr>`;
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;">${rows}${total(copy.subtotal, money(subtotal))}${total(copy.delivery, money(summary.shipping))}${total(copy.total, money(summary.total), true)}</table>`;
}

function addressBlock(summary, {contact} = {}) {
  const a = summary.address, c = summary.customer;
  const cep = String(a.cep).replace(/^(\d{5})(\d{3})$/, '$1-$2');
  const lines = [`<strong>${esc(c.name)}</strong>`, `${esc(a.street)}, ${esc(a.number)}${a.complement ? ' — ' + esc(a.complement) : ''}`, `${esc(a.district)} · ${esc(a.city)}/${esc(a.state)} · CEP ${esc(cep)}`];
  if (contact) {
    const phone = String(c.phone).replace(/\D/g, '');
    lines.push(`${esc(c.email)}${phone ? ` · <a href="https://wa.me/55${esc(phone)}" target="_blank" style="color:${C.rose};">${esc(phone.replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3'))}</a>` : ''}`);
  }
  return lines.map(text => line(text)).join('');
}

function frame({lang, title, eyebrow, preheader, subject, inner, banner, assetUrl, year = new Date().getFullYear()}) {
  const copy = COPY[lang] || COPY['pt-BR'];
  const logo = `${assetUrl.replace(/\/+$/, '')}/assets/logo-ju-email.png`;
  const instagram = 'https://www.instagram.com/juimprimepramim/';
  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(subject)}</title>
<style>:root{color-scheme:light only;supported-color-schemes:light only}@media (max-width:520px){.px{padding-left:22px!important;padding-right:22px!important}.h1{font-size:27px!important;line-height:33px!important}}</style>
</head>
<body style="margin:0;padding:0;background:${C.page};color:${C.ink};">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;overflow:hidden;mso-hide:all;">${esc(preheader)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${C.page}" style="width:100%;background:${C.page};">
<tr><td align="center" style="padding:28px 14px 36px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${C.card}" style="width:100%;max-width:560px;background:${C.card};border:1px solid ${C.border};border-radius:24px;">
<tr><td align="center" style="padding:30px 32px 0;"><img src="${esc(logo)}" width="132" height="132" alt="${esc(copy.alt)}" style="display:block;width:132px;height:132px;border:0;outline:none;text-decoration:none;"></td></tr>
${banner ? `<tr><td class="px" align="center" style="padding:14px 44px 0;"><p style="margin:0;padding:8px 12px;border-radius:12px;background:#fff1cf;color:#7a5200;font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:.8px;line-height:18px;">${esc(banner)}</p></td></tr>` : ''}
<tr><td class="px" align="center" style="padding:14px 44px 0;">
<p style="margin:0 0 14px;color:${C.rose};font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:2.4px;line-height:16px;">${esc(eyebrow)}</p>
<h1 class="h1" style="margin:0;color:${C.ink};font-family:${SERIF};font-size:31px;font-weight:500;line-height:37px;">${esc(title[0])}<br><em style="color:${C.rose};font-style:italic;">${esc(title[1])}</em></h1>
</td></tr>
${inner}
<tr><td class="px" style="padding:26px 44px 0;"><div style="height:1px;line-height:1px;font-size:1px;background:${C.rule};">&nbsp;</div></td></tr>
<tr><td align="center" style="padding:24px 32px 0;">
<p style="margin:0;color:${C.rose};font-family:${SANS};font-size:13px;font-weight:700;letter-spacing:1.6px;line-height:18px;">${esc(copy.brand)}</p>
<p style="margin:6px 0 0;color:${C.muted};font-family:${SANS};font-size:12px;line-height:18px;">${esc(copy.tagline)}</p>
</td></tr>
<tr><td align="center" style="padding:16px 32px 32px;">
<p style="margin:0;color:${C.muted};font-family:${SANS};font-size:11px;line-height:18px;">${esc(copy.rights(year))} &nbsp;·&nbsp; <a href="${instagram}" target="_blank" style="color:${C.rose};text-decoration:underline;">${esc(copy.instagram)}</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
}

const plainItems = (summary, lang, copy) => summary.items.map(item => `- ${item.title} × ${item.quantity} · ${money(item.unitCents * item.quantity)}\n  ${describeSelection(item.productId, item.selection, lang).map(entry => `${entry.part}: ${entry.color}`).join(' · ')}`).join('\n');
const plainAddress = summary => { const a = summary.address; return `${summary.customer.name}\n${a.street}, ${a.number}${a.complement ? ' — ' + a.complement : ''}\n${a.district} · ${a.city}/${a.state} · CEP ${a.cep}`; };

function renderCustomerEmail({summary, lang = 'pt-BR', test = false, assetUrl}) {
  const language = CUSTOMER[lang] ? lang : 'pt-BR', copy = CUSTOMER[language];
  const hello = copy.hello(summary.customer.name.split(' ')[0] || '');
  const inner = [
    `<tr><td class="px" align="center" style="padding:18px 44px 0;"><p style="margin:0;color:${C.muted};font-family:${SANS};font-size:16px;line-height:25px;">${esc(hello)} ${esc(copy.intro)}</p></td></tr>`,
    section(copy.order, line(`<strong style="font-size:18px;color:${C.rose};letter-spacing:.5px;">${esc(summary.reference)}</strong>`)),
    section(copy.pieces, itemsTable(copy, summary, language)),
    section(copy.payment, line(esc(methodLabel(copy, summary.method)))),
    section(copy.deliverTo, addressBlock(summary)),
    summary.notes ? section(copy.notes, line(esc(summary.notes))) : '',
    `<tr><td class="px" align="center" style="padding:24px 44px 0;"><p style="margin:0;color:${C.muted};font-family:${SANS};font-size:14px;line-height:22px;">${esc(copy.next)}</p></td></tr>`
  ].join('\n');
  const subject = (test ? '[TESTE] ' : '') + copy.subject(summary.reference);
  const text = [copy.eyebrow, `${copy.title[0]} ${copy.title[1]}`, test ? copy.test : '', '', `${hello} ${copy.intro}`, '', `${copy.order}: ${summary.reference}`, '', copy.pieces, plainItems(summary, language, copy), `${copy.delivery}: ${money(summary.shipping)}`, `${copy.total}: ${money(summary.total)}`, '', `${copy.payment}: ${methodLabel(copy, summary.method)}`, '', copy.deliverTo, plainAddress(summary), summary.notes ? `\n${copy.notes}: ${summary.notes}` : '', '', copy.next].filter(part => part !== '').join('\n');
  return {subject, html: frame({lang: language, title: copy.title, eyebrow: copy.eyebrow, preheader: copy.preheader, subject, inner, banner: test ? copy.test : '', assetUrl}), text};
}

function renderOwnerEmail({summary, test = false, assetUrl}) {
  const copy = OWNER;
  const inner = [
    `<tr><td class="px" align="center" style="padding:18px 44px 0;"><p style="margin:0;color:${C.muted};font-family:${SANS};font-size:16px;line-height:25px;">${esc(copy.intro)}</p></td></tr>`,
    section(copy.order, line(`<strong style="font-size:18px;color:${C.rose};letter-spacing:.5px;">${esc(summary.reference)}</strong>`) + line(`${esc(copy.mpOrder)}: ${esc(summary.id)}`, `color:${C.muted};font-size:13px;`)),
    section(copy.pieces, itemsTable(copy, summary, 'pt-BR')),
    section(copy.payment, line(esc(methodLabel(copy, summary.method)))),
    section(copy.deliverTo, addressBlock(summary, {contact: true})),
    summary.notes ? section(copy.notes, line(esc(summary.notes))) : ''
  ].join('\n');
  const subject = copy.subject(summary.reference, money(summary.total), test);
  const text = [copy.eyebrow, `${copy.title[0]} ${copy.title[1]}`, test ? copy.test : '', '', copy.intro, '', `${copy.order}: ${summary.reference} (${copy.mpOrder}: ${summary.id})`, '', copy.pieces, plainItems(summary, 'pt-BR', copy), `${copy.delivery}: ${money(summary.shipping)}`, `${copy.total}: ${money(summary.total)}`, '', `${copy.payment}: ${methodLabel(copy, summary.method)}`, '', copy.deliverTo, plainAddress(summary), `${summary.customer.email} · ${summary.customer.phone}`, summary.notes ? `\n${copy.notes}: ${summary.notes}` : ''].filter(part => part !== '').join('\n');
  return {subject, html: frame({lang: 'pt-BR', title: copy.title, eyebrow: copy.eyebrow, preheader: copy.preheader, subject, inner, banner: test ? copy.test : '', assetUrl}), text};
}

module.exports = {renderCustomerEmail, renderOwnerEmail, CUSTOMER, OWNER};
