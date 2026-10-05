'use strict';
// Issuing the NF-e of an order: called when Ju confirms the order in the panel, again by the retry button, and by the
// queue (api/_lib/invoice-queue.js). One invoice per order (reference = the order's JU- reference, which the services
// also use to avoid duplicates): a second call on an authorized invoice changes nothing. The recipient's CPF goes from the
// order (encrypted) straight to the service over HTTPS; it is not stored with the invoice nor shown to anyone.
//
// Invoice statuses:
//   fila        saved, waiting to go: first thing on confirming (so nothing is lost if the attempt never ends), and after
//               a passing failure (the service down or slow, refusing for too many calls, disconnected, paused, the CEP
//               lookup down). The queue tries again by itself: 1, 5, 15 minutes, then every hour (QUEUE.retry), or as
//               soon as Ju connects or resumes. Two days of failures turn it into an error and e-mail Ju.
//   processando sent, the service is still working: asked again from 30 seconds to every hour (QUEUE.poll).
//   autorizada  done; the buyer's e-mail goes again later if it failed (QUEUE.mail).
//   erro        needs a person (refused, data missing): the reason stays, and the panel offers to try again.
// One attempt at a time per note (store.invoices.lease): the panel and the queue never send the same note together.
const crypto = require('node:crypto');
const {nfeSettings, EXAMPLE} = require('./fiscal');
const {buildInvoice} = require('./nfe');
const {lookupCep} = require('./cep');
const {providerFor} = require('./nfe-providers');
const {createOrders, INVOICED} = require('./orders');
const {config, mailReady, sendMail} = require('./mail');
const {renderInvoiceEmail} = require('./order-email');
const {alertOwner} = require('./integration-alerts');

const MINUTE = 60000, HOUR = 60 * MINUTE;
const QUEUE = Object.freeze({
  retry: [MINUTE, 5 * MINUTE, 15 * MINUTE, HOUR],                                       // fila, after a passing failure
  poll: [30000, MINUTE, 2 * MINUTE, 5 * MINUTE, 10 * MINUTE, 30 * MINUTE, HOUR],        // processando
  mail: [5 * MINUTE, 15 * MINUTE, HOUR, 3 * HOUR],                                      // autorizada, the buyer's e-mail
  waitForPerson: HOUR,          // disconnected or paused: looked at every hour, and right away when Ju connects or resumes
  maxRetries: 48, maxPolls: 40, maxMails: 6,
  // An attempt holds its note this long at most: the slowest one (each Bling call has 20 seconds) ends well before, and
  // one that never ends (the process stopped) frees the note after it.
  lease: 5 * MINUTE,
  answerWithin: 8000            // the panel waits this long for a note at most; a slower service keeps going after the answer
});
const LATE = Symbol('late');
const FAZENDA_REFUSAL = /rejei[cç][aã]o/i;   // the tax authority's refusals, as the Bling adapter writes them

const fail = (code, extra = {}) => Object.assign(new Error(code), {code, ...extra});
const httpsOnly = value => /^https:\/\/[^\s"'<>]+$/.test(String(value || '')) ? String(value).slice(0, 600) : null;   // links from the service, never javascript: or http:
const clean = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 600);
const step = (list, n) => list[Math.min(Math.max(n, 0), list.length - 1)];
const time = value => value ? new Date(value).getTime() : 0;

function createInvoicing({store, env = process.env, now = () => Date.now(), fetchImpl = globalThis.fetch, outbox, provider: injected, lookup = lookupCep, sleep, clock}) {
  const settings = nfeSettings(env), date = () => new Date(now());
  const orders = createOrders({store, env, now});
  const provider = () => injected || providerFor(settings, {store, env, now, fetchImpl, sleep, clock});

  async function record(invoice, patch, order, event) {
    const updated = await store.invoices.update(invoice.id, patch);
    if (event) await store.orders.addEvent(order.id, event.kind, event.detail, event.actor).catch(() => {});
    return updated;
  }

  // Sends the note to the buyer once: 'sent', 'skipped' (e-mail off, no address, already sent) or 'failed' (tried again
  // later by the queue).
  async function notifyCustomer(invoice, order) {
    if (invoice.status !== 'autorizada' || invoice.customerNotifiedAt) return 'skipped';
    const mail = config(env), data = orders.summary(order);
    if (!mailReady(mail) || !data.customer.email) return 'skipped';
    const message = renderInvoiceEmail({summary: data, invoice, lang: order.lang, test: invoice.environment !== 'producao', assetUrl: mail.assetUrl});
    try {
      await sendMail({settings: mail, to: data.customer.email, subject: message.subject, html: message.html, text: message.text, idempotencyKey: `invoice-${invoice.id}`, fetchImpl, outbox: outbox && (m => outbox({...m, kind: 'invoice', reference: order.reference}))});
      await store.invoices.update(invoice.id, {customerNotifiedAt: date()});
      return 'sent';
    } catch (error) { console.error(`invoicing: e-mail with the invoice failed for ${order.reference} —`, error.status || '', error.message); return 'failed'; }
  }

  // A result may also carry the note's id at the service (providerId, kept even on an error so a retry reuses the note),
  // the environment the service really used, and a warning worth showing next to an authorized note.
  async function apply(invoice, order, result, actor) {
    const status = ['autorizada', 'processando'].includes(result.status) ? result.status : 'erro';
    const patch = {status, message: status === 'erro' ? clean(result.message || 'O emissor recusou a nota') : result.warning ? clean(result.warning) : null, nextAttemptAt: null, retries: 0};
    if ('providerId' in result) patch.providerId = result.providerId ? String(result.providerId).slice(0, 40) : null;
    if (['producao', 'homologacao'].includes(result.environment)) patch.environment = result.environment;
    if (status !== 'erro') Object.assign(patch, {number: result.number || invoice.number, series: result.series || invoice.series, accessKey: result.accessKey || invoice.accessKey, pdfUrl: httpsOnly(result.pdfUrl) || invoice.pdfUrl, xmlUrl: httpsOnly(result.xmlUrl) || invoice.xmlUrl});
    if (status === 'autorizada' && !invoice.authorizedAt) patch.authorizedAt = date();
    if (status === 'processando') {
      const polls = invoice.status === 'processando' ? (invoice.retries || 0) + 1 : 0;
      if (polls >= QUEUE.maxPolls) return stuck(invoice, order);
      Object.assign(patch, {retries: polls, nextAttemptAt: new Date(now() + step(QUEUE.poll, polls))});
    }
    const event = status === invoice.status && status !== 'erro' ? null : {kind: `nfe:${status}`, detail: status === 'autorizada' ? `nº ${patch.number}${patch.message ? ` · ${patch.message}` : ''}` : patch.message, actor};
    const updated = await record(invoice, patch, order, event);
    if (updated.status === 'autorizada' && await notifyCustomer(updated, order) === 'failed') await store.invoices.update(invoice.id, {nextAttemptAt: new Date(now() + QUEUE.mail[0]), retries: 0});
    return store.invoices.findById(invoice.id);
  }

  // A passing failure: the note waits in the queue. Bling down, slow or refusing for too many calls: again after
  // QUEUE.retry (or when the breaker lets calls through). Disconnected or paused: it waits for Ju, without counting.
  async function later(invoice, order, {message, wait = 'bling', retryAt = null, providerId}, actor) {
    const forPerson = wait === 'conexao' || wait === 'pausa';
    const retries = forPerson ? invoice.retries || 0 : invoice.status === 'fila' ? (invoice.retries || 0) + 1 : 1;
    if (retries > QUEUE.maxRetries) return giveUp(invoice, order, message);
    const next = new Date(Math.max(now() + (forPerson ? QUEUE.waitForPerson : step(QUEUE.retry, retries - 1)), time(retryAt)));
    const patch = {status: 'fila', message: clean(message || 'O emissor de notas não respondeu.'), nextAttemptAt: next, retries};
    if (providerId !== undefined) patch.providerId = providerId ? String(providerId).slice(0, 40) : null;
    // In the order history when it starts waiting, or waits for another reason (not at every hourly try).
    return record(invoice, patch, order, invoice.status === 'fila' && invoice.message === patch.message ? null : {kind: 'nfe:fila', detail: patch.message, actor});
  }

  async function giveUp(invoice, order, reason) {
    const message = `O emissor ficou fora do ar por muito tempo e a nota não saiu (${clean(reason).replace(/[.\s]+$/, '')}). Confira o emissor e clique em Tentar de novo.`;
    const updated = await record(invoice, {status: 'erro', message, nextAttemptAt: null, retries: 0}, order, {kind: 'nfe:erro', detail: 'desistiu depois de dois dias na fila', actor: 'fila'});
    await alertOwner({env, fetchImpl, outbox, now, kind: 'desistiu', reference: order.reference, detail: reason, store, name: settings.provider});
    return updated;
  }

  // Still processing after QUEUE.maxPolls checks (about a day): a person looks at it in the service.
  async function stuck(invoice, order) {
    const message = 'A nota ficou em processamento no emissor por mais de um dia. Confira a situação dela no emissor e clique em Tentar de novo.';
    const updated = await record(invoice, {status: 'erro', message, nextAttemptAt: null, retries: 0}, order, {kind: 'nfe:erro', detail: 'em processamento por mais de um dia', actor: 'fila'});
    await alertOwner({env, fetchImpl, outbox, now, kind: 'parada', reference: order.reference, detail: message, store, name: settings.provider});
    return updated;
  }

  // The last refusal by the tax authority since the note was last authorized, from the order history: the note waited in
  // the queue after it, so the invoice's own message is now about the wait.
  async function lastRefusal(order) {
    const events = await store.orders.events(order.id).catch(() => []);
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].kind === 'nfe:autorizada') return null;
      if (events[i].kind === 'nfe:erro' && FAZENDA_REFUSAL.test(String(events[i].detail || ''))) return events[i].detail;
    }
    return null;
  }

  // One attempt, holding the note (lease) from the start to the end.
  async function attempt(invoice, order, actor, force) {
    // The order as it is now: Ju may have taken it back to Pendentes or declined it since this attempt was asked for. Its
    // note then leaves the queue and waits for a new confirmation.
    const current = await store.orders.findById(order.id);
    if (current && !INVOICED.includes(current.status)) return store.invoices.update(invoice.id, {nextAttemptAt: null});
    if (force) await provider()?.wake?.();
    invoice = await store.invoices.update(invoice.id, {attempts: (invoice.attempts || 0) + 1});

    let city = null;
    try { city = await lookup(order.shipTo?.cep, {fetchImpl}); }
    catch (error) { return later(invoice, order, {message: `Não foi possível consultar o CEP agora (${clean(error.message)}).`, wait: 'cep'}, actor); }
    const built = buildInvoice({order, city, environment: settings.environment, provider: settings.provider, env, now: now(), ...(settings.example ? EXAMPLE : {})});
    if (!built.ok) return record(invoice, {status: 'erro', message: clean(built.problems.join(' · ')), nextAttemptAt: null, retries: 0}, order, {kind: 'nfe:erro', detail: clean(built.problems[0]), actor});

    const lastError = invoice.status === 'erro' ? invoice.message : invoice.status === 'fila' && invoice.providerId ? await lastRefusal(order) : null;
    let result;
    try { result = await provider().emit(built.invoice, {providerId: invoice.providerId || null, lastError}); }
    catch (error) {
      console.error(`invoicing: the NF-e service failed for ${order.reference} —`, error.status || '', error.code || '', error.message);
      if (error.code === 'provider_not_supported') return record(invoice, {status: 'erro', message: `Emissor "${settings.provider}" ainda não integrado`, nextAttemptAt: null, retries: 0}, order, {kind: 'nfe:erro', detail: 'emissor', actor});
      return later(invoice, order, {message: 'O emissor de notas não respondeu.', wait: 'emissor'}, actor);
    }
    if (result.wait) return later(invoice, order, result, actor);
    return apply(invoice, order, result, actor);
  }

  // Runs `work` holding the note; null when another attempt holds it right now. At the end the note is let go only if
  // this attempt still holds it (one that took longer than its hold never frees another attempt's).
  async function holding(invoice, work) {
    const until = new Date(now() + QUEUE.lease);
    if (!await store.invoices.lease(invoice.id, {until, now: date()})) return null;
    try { return await work(await store.invoices.findById(invoice.id)); }
    finally { await store.invoices.release(invoice.id, until).catch(error => console.error('invoicing: could not free the note —', error.message)); }
  }

  // Issues (or re-issues after an error) the note of a confirmed order. The invoice is saved in the queue first, then
  // tried once; never throws for a refusal or for the service being down: the reason is saved. `force`: Ju asked to try
  // now, past the breaker's wait.
  async function issue(order, {actor = 'painel', force = false} = {}) {
    if (settings.mode === 'off') return null;
    if (!INVOICED.includes(order.status)) throw fail('invalid_request', {field: 'status'});
    const {invoice: found} = await store.invoices.create({id: crypto.randomUUID(), orderId: order.id, provider: settings.provider, environment: settings.environment, reference: order.reference, status: 'fila', nextAttemptAt: date()});
    if (found.status === 'autorizada') return found;
    const done = await holding(found, current => current.status === 'autorizada' ? current : attempt(current, order, actor, force));
    return done || store.invoices.findById(found.id);
  }

  return {
    settings,
    issue,

    // issue() for the panel: the answer waits QUEUE.answerWithin at most. A slower service keeps going after the answer
    // (handed to waitUntil, still holding the note), and the panel shows the note as being sent.
    async issueWithin(order, options = {}, {ms = QUEUE.answerWithin, waitUntil = () => {}} = {}) {
      const issuing = issue(order, options).catch(error => { console.error(`invoicing: the note of ${order.reference} failed —`, error.code || '', error.message); return null; });
      let timer;
      const first = await Promise.race([issuing, new Promise(resolve => { timer = setTimeout(() => resolve(LATE), ms); })]);
      clearTimeout(timer);
      if (first !== LATE) return first || store.invoices.findByOrder(order.id);
      waitUntil(issuing);
      return store.invoices.findByOrder(order.id);
    },

    // For notes the service is still processing: asks again and saves the answer. The service not answering (down,
    // breaker open, disconnected) keeps it processing and asks again later, without counting it as an answer.
    async refresh(invoice, order) {
      if (settings.mode === 'off' || invoice?.status !== 'processando') return invoice;
      const done = await holding(invoice, async current => {
        if (current.status !== 'processando') return current;
        try { return await apply(current, order, await provider().check({reference: current.reference, providerId: current.providerId || null}), 'emissor'); }
        catch (error) {
          console.error(`invoicing: could not check ${current.reference} —`, error.message);
          return store.invoices.update(current.id, {nextAttemptAt: new Date(Math.max(now() + Math.max(step(QUEUE.poll, current.retries || 0), MINUTE), time(error.retryAt)))});
        }
      });
      return done || store.invoices.findById(invoice.id);
    },

    // An authorized note whose e-mail to the buyer failed: tries again, a few times.
    async resendMail(invoice, order) {
      const done = await holding(invoice, async current => {
        if (current.status !== 'autorizada' || current.customerNotifiedAt) return store.invoices.update(current.id, {nextAttemptAt: null, retries: 0});
        if (await notifyCustomer(current, order) !== 'failed') return store.invoices.update(current.id, {nextAttemptAt: null, retries: 0});
        const tries = (current.retries || 0) + 1;
        if (tries >= QUEUE.maxMails) { console.error(`invoicing: gave up e-mailing the invoice of ${order.reference}`); return store.invoices.update(current.id, {nextAttemptAt: null, retries: tries}); }
        return store.invoices.update(current.id, {retries: tries, nextAttemptAt: new Date(now() + step(QUEUE.mail, tries))});
      });
      return done || store.invoices.findById(invoice.id);
    },

    // What the panel and the buyer see.
    view(invoice) {
      if (!invoice) return null;
      return {status: invoice.status, environment: invoice.environment, number: invoice.number, series: invoice.series, accessKey: invoice.accessKey, pdfUrl: invoice.pdfUrl, xmlUrl: invoice.xmlUrl, message: invoice.message, attempts: invoice.attempts,
        nextAttemptAt: invoice.status === 'fila' && invoice.nextAttemptAt ? new Date(invoice.nextAttemptAt).toISOString() : null,
        authorizedAt: invoice.authorizedAt ? new Date(invoice.authorizedAt).toISOString() : null};
    }
  };
}

module.exports = {createInvoicing, QUEUE};
