#!/usr/bin/env node
'use strict';
// E-mail to the shop (ORDER_NOTIFY_EMAIL) when the own server's automatic publishing fails: run by systemd
// (deploy/juimprime-deploy-alert.service, OnFailure= of juimprime-deploy.service and juimprime-rollback.service) from the
// release that is live, with the server's .env. It reads what deploy/deploy.sh left in /srv/juimprime — .deploy-status
// ("<reason> <commit>"), .deploy-last.log and the end of .deploy-tests.log — and sends it through Resend
// (api/_lib/mail.js). One e-mail per problem: the same commit (or, without one, the same reason on the same day) is not
// sent again, so GitHub being down does not become an e-mail a minute. Never prints a secret: only those files.
//   node tools/deploy-alert.cjs            (the server; APP_DIR=/srv/juimprime)
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {config, mailReady, sendMail} = require('../api/_lib/mail');
const {esc} = require('../api/_lib/email-template');

const REASONS = {
  github: 'o servidor não conseguiu baixar o código do GitHub (rede, Deploy Key ou branch que não existe)',
  guarda: 'o commit não é o site completo ou não respeita o HOST (branch errada em deploy.conf?), e foi recusado',
  npm: 'a instalação dos pacotes (npm ci) falhou',
  testes: 'os testes falharam na versão nova, que não foi publicada',
  backup: 'a cópia do banco antes de uma versão que muda o banco falhou, e a versão não foi publicada',
  saude: 'a versão nova não respondeu no /api/health, e o site voltou para a anterior',
  rollback: 'a volta para a versão anterior não deu certo',
  erro: 'a publicação parou com um erro inesperado'
};

function read(dir, file, max) {
  try { const text = fs.readFileSync(path.join(dir, file), 'utf8'); return text.length > max ? '…' + text.slice(-max) : text; } catch { return ''; }
}

// {sent, reason?, key}: sent once per key; `repeated` when this problem was already e-mailed, `mail_off` when there is
// nowhere to send it (the journal still has everything).
async function run({env = process.env, dir = env.APP_DIR || '/srv/juimprime', now = () => Date.now(), fetchImpl = globalThis.fetch, outbox, log = console} = {}) {
  const [reason = 'erro', commit = ''] = read(dir, '.deploy-status', 200).trim().split(/\s+/);
  const known = Object.hasOwn(REASONS, reason) ? reason : 'erro';
  const sha = /^[0-9a-f]{7,40}$/.test(commit) ? commit : '';
  const key = sha ? `${known} ${sha}` : `${known} ${new Date(now()).toISOString().slice(0, 10)}`;
  if (read(dir, '.deploy-alerted', 200).trim() === key) { log.log(`deploy-alert: já avisado (${key})`); return {sent: false, reason: 'repeated', key}; }
  const settings = config(env), to = String(env.ORDER_NOTIFY_EMAIL || '').trim().toLowerCase();
  if (!mailReady(settings) || !to) { log.error('deploy-alert: e-mail desligado (RESEND_API_KEY ou ORDER_NOTIFY_EMAIL); veja journalctl -u juimprime-deploy'); return {sent: false, reason: 'mail_off', key}; }

  const steps = read(dir, '.deploy-last.log', 3000).trim(), tests = known === 'testes' ? read(dir, '.deploy-tests.log', 2500).trim() : '';
  const subject = `Publicação do site falhou${sha ? ` (${sha.slice(0, 7)})` : ''}`;
  const lines = [
    `No servidor próprio da loja, ${REASONS[known]}.`,
    known === 'saude' || known === 'testes' || known === 'backup' || known === 'guarda' ? 'O site continua no ar com a versão anterior. Esse commit não é tentado de novo: o próximo commit na branch é publicado normalmente.' : 'O servidor tenta de novo a cada minuto; este aviso não se repete para o mesmo problema.',
    'Para ver tudo no servidor: journalctl -u juimprime-deploy -n 80'
  ];
  const block = (title, text) => text ? `<p style="margin:16px 0 6px;font-weight:600">${esc(title)}</p><pre style="margin:0;padding:12px;background:#f7f1f3;border-radius:8px;font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-word">${esc(text)}</pre>` : '';
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#2b1d24;max-width:620px;margin:0 auto;padding:24px">
  <p style="margin:0 0 6px;font-size:12px;letter-spacing:1.5px;color:#b0476b">SERVIDOR · AVISO DA PUBLICAÇÃO</p>
  <h1 style="margin:0 0 18px;font-size:22px;font-weight:600">${esc(subject)}</h1>
  ${lines.map(line => `<p style="margin:0 0 12px;line-height:1.6">${esc(line)}</p>`).join('\n  ')}
  ${block('O que a publicação registrou', steps)}
  ${block('Final dos testes', tests)}
</div>`;
  const text = `${subject}\n\n${lines.join('\n\n')}${steps ? `\n\nO que a publicação registrou:\n${steps}` : ''}${tests ? `\n\nFinal dos testes:\n${tests}` : ''}`;
  try {
    await sendMail({settings, to, subject, html, text, idempotencyKey: `deploy-${crypto.createHash('sha256').update(key).digest('hex').slice(0, 32)}`, fetchImpl, outbox: outbox && (m => outbox({...m, kind: 'alerta', reference: key}))});
  } catch (error) { log.error('deploy-alert: o e-mail não saiu —', error.status || '', error.message); return {sent: false, reason: 'send_failed', key}; }
  try { fs.writeFileSync(path.join(dir, '.deploy-alerted'), key + '\n'); } catch (error) { log.error('deploy-alert: não consegui guardar o aviso —', error.message); }
  log.log(`deploy-alert: e-mail enviado (${key})`);
  return {sent: true, key};
}

if (require.main === module) run().then(() => process.exit(0), error => { console.error('deploy-alert:', error.message); process.exit(1); });

module.exports = {run, REASONS};
