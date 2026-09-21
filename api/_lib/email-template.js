'use strict';
// Verification e-mail: one layout, three purposes (signup, access, reset), three languages.
// Table layout and inline styles on purpose: this is what mail clients render reliably.
const C = {page: '#fff7f5', card: '#fffcfb', border: '#f1e1e4', rose: '#b64c68', pink: '#ee96a5', soft: '#fbedf1', ink: '#282326', muted: '#7b7076', rule: '#f1d9de'};
const SERIF = "'Playfair Display',Georgia,'Times New Roman',serif";
const SANS = "'DM Sans','Helvetica Neue',Helvetica,Arial,sans-serif";

const COPY = {
  'pt-BR': {
    brand: 'JU IMPRIME PRA MIM', tagline: 'Mais cor na consulta. Mais encanto em cada olhar.', instagram: 'Instagram',
    alt: 'Ju, imprime pra mim? Criatividade em 3D',
    rights: year => `© ${year} Ju, imprime pra mim? Todos os direitos reservados.`,
    hello: name => name ? `Olá, ${name}.` : 'Olá!',
    expires: minutes => `Este código expira em ${minutes} minutos.`,
    fallback: 'Se o botão não abrir, copie e cole este link no seu navegador:',
    purposes: {
      signup: {subject: 'Seu código de verificação · Ju, imprime pra mim?', preheader: 'Use o código de verificação para finalizar seu cadastro.', eyebrow: 'CADASTRO', title: ['Seu código de verificação', 'para finalizar seu cadastro.'], intro: 'Use o código abaixo para confirmar seu cadastro.', label: 'CÓDIGO DE VERIFICAÇÃO', button: 'Confirmar meu e-mail', ignore: 'Se você não solicitou este cadastro, pode ignorar este e-mail com tranquilidade.'},
      access: {subject: 'Seu código de acesso · Ju, imprime pra mim?', preheader: 'Este é o código para o seu primeiro acesso ao site.', eyebrow: 'PRIMEIRO ACESSO', title: ['Seu código de acesso', 'para entrar no site.'], intro: 'Este é o código para realizar seu primeiro acesso ao nosso site.', label: 'CÓDIGO DE ACESSO', button: 'Entrar no site', ignore: 'Se você não solicitou este acesso, pode ignorar este e-mail com tranquilidade.'},
      reset: {subject: 'Recuperação de acesso · Ju, imprime pra mim?', preheader: 'Use o código para criar uma nova senha.', eyebrow: 'RECUPERAÇÃO DE ACESSO', title: ['Seu código para', 'criar uma nova senha.'], intro: 'Use o código abaixo para redefinir a senha da sua conta.', label: 'CÓDIGO DE VERIFICAÇÃO', button: 'Criar nova senha', ignore: 'Se você não pediu para redefinir a senha, pode ignorar este e-mail. Sua senha continua a mesma.'}
    }
  },
  en: {
    brand: 'JU IMPRIME PRA MIM', tagline: 'More color at every appointment. More wonder in every glance.', instagram: 'Instagram',
    alt: 'Ju, imprime pra mim? Creativity in 3D',
    rights: year => `© ${year} Ju, imprime pra mim? All rights reserved.`,
    hello: name => name ? `Hello, ${name}.` : 'Hello!',
    expires: minutes => `This code expires in ${minutes} minutes.`,
    fallback: 'If the button does not open, copy and paste this link into your browser:',
    purposes: {
      signup: {subject: 'Your verification code · Ju, imprime pra mim?', preheader: 'Use the verification code to finish your sign-up.', eyebrow: 'SIGN-UP', title: ['Your verification code', 'to finish your sign-up.'], intro: 'Use the code below to confirm your registration.', label: 'VERIFICATION CODE', button: 'Confirm my email', ignore: 'If you did not request this sign-up, you can safely ignore this email.'},
      access: {subject: 'Your access code · Ju, imprime pra mim?', preheader: 'This is the code for your first sign-in to the site.', eyebrow: 'FIRST ACCESS', title: ['Your access code', 'to enter the site.'], intro: 'This is the code for your first sign-in to our site.', label: 'ACCESS CODE', button: 'Go to the site', ignore: 'If you did not request this access, you can safely ignore this email.'},
      reset: {subject: 'Account recovery · Ju, imprime pra mim?', preheader: 'Use the code to create a new password.', eyebrow: 'ACCOUNT RECOVERY', title: ['Your code to', 'create a new password.'], intro: 'Use the code below to reset your account password.', label: 'VERIFICATION CODE', button: 'Create new password', ignore: 'If you did not ask to reset your password, you can ignore this email. Your password stays the same.'}
    }
  },
  es: {
    brand: 'JU IMPRIME PRA MIM', tagline: 'Más color en cada consulta. Más encanto en cada mirada.', instagram: 'Instagram',
    alt: 'Ju, imprime pra mim? Creatividad en 3D',
    rights: year => `© ${year} Ju, imprime pra mim? Todos los derechos reservados.`,
    hello: name => name ? `Hola, ${name}.` : '¡Hola!',
    expires: minutes => `Este código caduca en ${minutes} minutos.`,
    fallback: 'Si el botón no se abre, copia y pega este enlace en tu navegador:',
    purposes: {
      signup: {subject: 'Tu código de verificación · Ju, imprime pra mim?', preheader: 'Usa el código de verificación para terminar tu registro.', eyebrow: 'REGISTRO', title: ['Tu código de verificación', 'para terminar tu registro.'], intro: 'Usa el código de abajo para confirmar tu registro.', label: 'CÓDIGO DE VERIFICACIÓN', button: 'Confirmar mi correo', ignore: 'Si no solicitaste este registro, puedes ignorar este correo con tranquilidad.'},
      access: {subject: 'Tu código de acceso · Ju, imprime pra mim?', preheader: 'Este es el código para tu primer acceso al sitio.', eyebrow: 'PRIMER ACCESO', title: ['Tu código de acceso', 'para entrar al sitio.'], intro: 'Este es el código para tu primer acceso a nuestro sitio.', label: 'CÓDIGO DE ACCESO', button: 'Entrar al sitio', ignore: 'Si no solicitaste este acceso, puedes ignorar este correo con tranquilidad.'},
      reset: {subject: 'Recuperación de acceso · Ju, imprime pra mim?', preheader: 'Usa el código para crear una nueva contraseña.', eyebrow: 'RECUPERACIÓN DE ACCESO', title: ['Tu código para', 'crear una nueva contraseña.'], intro: 'Usa el código de abajo para restablecer la contraseña de tu cuenta.', label: 'CÓDIGO DE VERIFICACIÓN', button: 'Crear nueva contraseña', ignore: 'Si no pediste restablecer la contraseña, puedes ignorar este correo. Tu contraseña sigue igual.'}
    }
  }
};

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));

// The link opens the verification screen with the code already filled in. It travels in the URL fragment, which
// browsers never send to a server or forward in a Referer header.
function verificationUrl({siteUrl, token, code}) {
  return `${siteUrl.replace(/\/+$/, '')}/conta.html#verificar?c=${encodeURIComponent(token)}&k=${encodeURIComponent(code)}`;
}

function renderVerificationEmail({lang = 'pt-BR', purpose = 'signup', name = '', code, url, siteUrl, assetUrl = siteUrl, expiryMinutes = 10, year = new Date().getFullYear()}) {
  const copy = COPY[lang] || COPY['pt-BR'], p = copy.purposes[purpose] || copy.purposes.signup;
  const logo = `${assetUrl.replace(/\/+$/, '')}/assets/logo-ju-email.png`;
  const instagram = 'https://www.instagram.com/juimprimepramim/';
  const hello = copy.hello(String(name || '').trim());
  const html = `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(p.subject)}</title>
<style>:root{color-scheme:light only;supported-color-schemes:light only}@media (max-width:520px){.px{padding-left:22px!important;padding-right:22px!important}.h1{font-size:27px!important;line-height:33px!important}.code{font-size:32px!important;letter-spacing:6px!important;padding-left:6px!important}}</style>
</head>
<body style="margin:0;padding:0;background:${C.page};color:${C.ink};">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;overflow:hidden;mso-hide:all;">${esc(p.preheader)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${C.page}" style="width:100%;background:${C.page};">
<tr><td align="center" style="padding:28px 14px 36px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${C.card}" style="width:100%;max-width:560px;background:${C.card};border:1px solid ${C.border};border-radius:24px;">
<tr><td align="center" style="padding:34px 32px 4px;"><img src="${esc(logo)}" width="172" height="172" alt="${esc(copy.alt)}" style="display:block;width:172px;height:172px;border:0;outline:none;text-decoration:none;"></td></tr>
<tr><td class="px" align="center" style="padding:8px 44px 0;">
<p style="margin:0 0 14px;color:${C.rose};font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:2.4px;line-height:16px;">${esc(p.eyebrow)}</p>
<h1 class="h1" style="margin:0;color:${C.ink};font-family:${SERIF};font-size:31px;font-weight:500;line-height:37px;">${esc(p.title[0])}<br><em style="color:${C.rose};font-style:italic;">${esc(p.title[1])}</em></h1>
<p style="margin:20px 0 0;color:${C.muted};font-family:${SANS};font-size:16px;line-height:25px;">${esc(hello)} ${esc(p.intro)}</p>
</td></tr>
<tr><td class="px" style="padding:26px 44px 0;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${C.soft}" style="width:100%;background:${C.soft};border-radius:18px;"><tr><td align="center" style="padding:20px 16px 22px;">
<p style="margin:0 0 8px;color:${C.rose};font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:2px;line-height:16px;">${esc(p.label)}</p>
<p class="code" style="margin:0;color:${C.rose};font-family:${SANS};font-size:38px;font-weight:700;letter-spacing:8px;line-height:46px;padding-left:8px;">${esc(code)}</p>
</td></tr></table>
</td></tr>
<tr><td align="center" style="padding:24px 44px 0;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center"><tr><td align="center" bgcolor="${C.rose}" style="border-radius:999px;background:${C.rose};"><a href="${esc(url)}" target="_blank" style="display:inline-block;padding:15px 34px;border-radius:999px;color:#ffffff;font-family:${SANS};font-size:16px;font-weight:700;line-height:22px;text-decoration:none;">${esc(p.button)}</a></td></tr></table>
</td></tr>
<tr><td class="px" align="center" style="padding:18px 44px 0;">
<p style="margin:0 0 6px;color:${C.muted};font-family:${SANS};font-size:13px;line-height:20px;">${esc(copy.fallback)}</p>
<p style="margin:0;font-family:${SANS};font-size:12px;line-height:18px;word-break:break-all;"><a href="${esc(url)}" target="_blank" style="color:${C.rose};text-decoration:underline;">${esc(url)}</a></p>
</td></tr>
<tr><td class="px" style="padding:26px 44px 0;"><div style="height:1px;line-height:1px;font-size:1px;background:${C.rule};">&nbsp;</div></td></tr>
<tr><td class="px" align="center" style="padding:20px 44px 0;">
<p style="margin:0 0 6px;color:${C.rose};font-family:${SANS};font-size:14px;font-weight:700;line-height:22px;">${esc(copy.expires(expiryMinutes))}</p>
<p style="margin:0;color:${C.muted};font-family:${SANS};font-size:14px;line-height:22px;">${esc(p.ignore)}</p>
</td></tr>
<tr><td align="center" style="padding:30px 32px 0;">
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
  const text = [p.eyebrow, `${p.title[0]} ${p.title[1]}`, '', `${hello} ${p.intro}`, '', `${p.label}: ${code}`, copy.expires(expiryMinutes), '', `${p.button}: ${url}`, '', p.ignore, '', `${copy.brand} · ${copy.tagline}`, copy.rights(year)].join('\n');
  return {subject: p.subject, html, text};
}

module.exports = {COPY, renderVerificationEmail, verificationUrl};
