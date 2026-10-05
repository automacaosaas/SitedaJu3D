'use strict';
// Issuing the NF-e of an order: called when Ju confirms the order in the panel ("concluído") and again by the retry
// button. One invoice per order (reference = the order's JU- reference, which the services also use to avoid duplicates):
// a second call on an authorized invoice changes nothing. The recipient's CPF goes from the order (encrypted) straight to
// the service over HTTPS; it is not stored with the invoice nor shown to anyone.
//
// Invoice statuses: processando (sent, the service is still working) → autorizada | erro. An error keeps the reason, and
// the panel offers to try again after the data is fixed.
const crypto = require('node:crypto');
const {nfeSettings, EXAMPLE} = require('./fiscal');
const {buildInvoice} = require('./nfe');
const {lookupCep} = require('./cep');
const {providerFor} = require('./nfe-providers');
const {createOrders, INVOICED} = require('./orders');
const {config, mailReady, sendMail} = require('./mail');
const {renderInvoiceEmail} = require('./order-email');

const fail = (code, extra = {}) => Object.assign(new Error(code), {code, ...extra});
const httpsOnly = value => /^https:\/\/[^\s"'<>]+$/.test(String(value || '')) ? String(value).slice(0, 600) : null;   // links from the service, never javascript: or http:
const clean = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 600);

function createInvoicing({store, env = process.env, now = () => Date.now(), fetchImpl = globalThis.fetch, outbox, provider: injected, lookup = lookupCep}) {
  const settings = nfeSettings(env), date = () => new Date(now());
  const orders = createOrders({store, env, now});
  const provider = () => injected || providerFor(settings, {store, env, now, fetchImpl});

  async function record(invoice, patch, order, event) {
    const updated = await store.invoices.update(invoice.id, patch);
    if (event) await store.orders.addEvent(order.id, event.kind, event.detail, event.actor).catch(() => {});
    return updated;
  }

  // Sends the note to the buyer once (the mark stays empty on failure, so a later check retries).
  async function notifyCustomer(invoice, order) {
    if (invoice.status !== 'autorizada' || invoice.customerNotifiedAt) return false;
    const mail = config(env), data = orders.summary(order);
    if (!mailReady(mail) || !data.customer.email) return false;
    const message = renderInvoiceEmail({summary: data, invoice, lang: order.lang, test: invoice.environment !== 'producao', assetUrl: mail.assetUrl});
    try {
      await sendMail({settings: mail, to: data.customer.email, subject: message.subject, html: message.html, text: message.text, idempotencyKey: `invoice-${invoice.id}`, fetchImpl, outbox: outbox && (m => outbox({...m, kind: 'invoice', reference: order.reference}))});
      await store.invoices.update(invoice.id, {customerNotifiedAt: date()});
      return true;
    } catch (error) { console.error(`invoicing: e-mail with the invoice failed for ${order.reference} —`, error.status || '', error.message); return false; }
  }

  // A result may also carry the note's id at the service (providerId, kept even on an error so a retry reuses the note),
  // the environment the service really used, and a warning worth showing next to an authorized note.
  async function apply(invoice, order, result, actor) {
    const status = ['autorizada', 'processando'].includes(result.status) ? result.status : 'erro';
    const patch = {status, message: status === 'erro' ? clean(result.message || 'O emissor recusou a nota') : result.warning ? clean(result.warning) : null};
    if ('providerId' in result) patch.providerId = result.providerId ? String(result.providerId).slice(0, 40) : null;
    if (['producao', 'homologacao'].includes(result.environment)) patch.environment = result.environment;
    if (status !== 'erro') Object.assign(patch, {number: result.number || invoice.number, series: result.series || invoice.series, accessKey: result.accessKey || invoice.accessKey, pdfUrl: httpsOnly(result.pdfUrl) || invoice.pdfUrl, xmlUrl: httpsOnly(result.xmlUrl) || invoice.xmlUrl});
    if (status === 'autorizada' && !invoice.authorizedAt) patch.authorizedAt = date();
    const event = status === invoice.status && status !== 'erro' ? null : {kind: `nfe:${status}`, detail: status === 'autorizada' ? `nº ${patch.number}${patch.message ? ` · ${patch.message}` : ''}` : patch.message, actor};
    const updated = await record(invoice, patch, order, event);
    if (updated.status === 'autorizada') await notifyCustomer(updated, order);
    return store.invoices.findById(invoice.id);
  }

  return {
    settings,

    // Issues (or re-issues after an error) the note of a confirmed order. Never throws for a refusal: the reason is saved.
    async issue(order, {actor = 'painel'} = {}) {
      if (settings.mode === 'off') return null;
      if (!INVOICED.includes(order.status)) throw fail('invalid_request', {field: 'status'});
      const {invoice: found} = await store.invoices.create({id: crypto.randomUUID(), orderId: order.id, provider: settings.provider, environment: settings.environment, reference: order.reference, status: 'processando'});
      if (found.status === 'autorizada') return found;
      const invoice = await store.invoices.update(found.id, {attempts: (found.attempts || 0) + 1});

      let city = null;
      try { city = await lookup(order.shipTo?.cep, {fetchImpl}); }
      catch (error) { return record(invoice, {status: 'erro', message: `Não foi possível consultar o CEP agora (${error.message}). Tente de novo.`}, order, {kind: 'nfe:erro', detail: 'CEP', actor}); }
      const built = buildInvoice({order, city, environment: settings.environment, provider: settings.provider, env, now: now(), ...(settings.example ? EXAMPLE : {})});
      if (!built.ok) return record(invoice, {status: 'erro', message: clean(built.problems.join(' · '))}, order, {kind: 'nfe:erro', detail: clean(built.problems[0]), actor});

      let result;
      try { result = await provider().emit(built.invoice, {providerId: invoice.providerId || null, lastError: invoice.status === 'erro' ? invoice.message : null}); }
      catch (error) {
        console.error(`invoicing: the NF-e service failed for ${order.reference} —`, error.status || '', error.code || '', error.message);
        return record(invoice, {status: 'erro', message: error.code === 'provider_not_supported' ? `Emissor "${settings.provider}" ainda não integrado` : 'O emissor de notas não respondeu. Tente de novo em alguns minutos.'}, order, {kind: 'nfe:erro', detail: 'emissor', actor});
      }
      return apply(invoice, order, result, actor);
    },

    // For notes the service is still processing: asks again and saves the answer.
    async refresh(invoice, order) {
      if (settings.mode === 'off' || invoice?.status !== 'processando') return invoice;
      try { return apply(invoice, order, await provider().check({reference: invoice.reference, providerId: invoice.providerId || null}), 'emissor'); }
      catch (error) { console.error(`invoicing: could not check ${invoice.reference} —`, error.message); return invoice; }
    },

    // What the panel and the buyer see.
    view(invoice) {
      if (!invoice) return null;
      return {status: invoice.status, environment: invoice.environment, number: invoice.number, series: invoice.series, accessKey: invoice.accessKey, pdfUrl: invoice.pdfUrl, xmlUrl: invoice.xmlUrl, message: invoice.message, attempts: invoice.attempts, authorizedAt: invoice.authorizedAt ? new Date(invoice.authorizedAt).toISOString() : null};
    }
  };
}

module.exports = {createInvoicing};
