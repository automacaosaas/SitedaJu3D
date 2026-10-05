'use strict';
// The NF-e queue (BLING-RESILIENCIA.md). Every note is saved in the database before anything goes to the service
// (invoices, status "fila"), so a confirmed order never depends on Bling answering. Here, in the background, the site:
//   - sends the notes waiting in the queue when their time comes (1, 5, 15 minutes, then every hour; api/_lib/invoicing.js);
//   - asks again about the notes the tax authority is still processing, and e-mails the buyer once a note is authorized;
//   - sends again the buyer's e-mails that failed;
//   - keeps the Bling connection alive (renewed once a week, so a quiet month never drops it);
//   - waits, without counting attempts, while Bling is disconnected, paused or the circuit breaker is open
//     (api/_lib/bling.js), and then goes oldest first: the first note is the test that closes the breaker;
//   - e-mails Ju when Bling has been unstable for 10 minutes, when it is back, and when the connection is lost.
// It runs every minute in the Node server (server/create-server.cjs) and right after the panel opens. Several processes
// can run it at once: each note is held by one attempt at a time (store.invoices.lease).
const {createInvoicing} = require('./invoicing');
const {INVOICED} = require('./orders');
const {nfeSettings} = require('./fiscal');
const {createBling} = require('./bling');
const {alertOwner} = require('./integration-alerts');

const ROUND = 20;                  // notes per round
const INTERVAL = 60000;            // a round a minute
const STALE = 10 * 60000;          // a round still running after this no longer holds the queue
const ALERT_AFTER = 10 * 60000;    // Bling unstable for this long before Ju gets an e-mail
const rounds = new WeakMap();      // store → the round running in this process
const heartbeat = {worker: false, lastRound: null};   // this process: is the timer on, and when did a round last end
const pulled = new WeakMap();      // store → the last recovery of Bling this process already pulled the queue forward for

function createInvoiceQueue({store, env = process.env, now = () => Date.now(), fetchImpl = globalThis.fetch, outbox, sleep, clock, log = console}) {
  const settings = nfeSettings(env);
  const invoicing = createInvoicing({store, env, now, fetchImpl, outbox, sleep, clock});
  const bling = settings.provider === 'bling' ? createBling({store, env, now, fetchImpl, sleep, clock}) : null;

  // May the queue call the service now? Bling disconnected, paused or with the breaker open: not yet.
  async function gate() {
    if (!bling) return {open: true, status: null};
    const status = await bling.status();
    const open = status.configured && status.connected && !status.pausedReason && !(status.unstable && status.retryAt && new Date(status.retryAt).getTime() > now());
    return {open, status};
  }

  async function alerts(status) {
    if (!bling || !status) return;
    const unstable = status.unstable && status.failingSince && now() - new Date(status.failingSince).getTime() >= ALERT_AFTER;
    const trouble = unstable ? 'instavel' : status.expired ? 'conexao' : null;
    const send = async kind => {
      const queue = await store.invoices.queue();
      return alertOwner({env, fetchImpl, outbox, now, kind, store, name: 'bling', data: {queued: queue.waiting, since: status.failingSince, retryAt: status.retryAt, lastError: status.lastError}});
    };
    if (trouble && !status.alertedAt) { if (await send(trouble)) await bling.markAlerted(new Date(now())); }
    else if (!trouble && status.alertedAt && status.connected && !status.failures) { await send('voltou'); await bling.markAlerted(null); }
  }

  // Every note waiting in the queue goes now (its next attempt could be up to an hour away).
  async function pullForward() {
    for (const invoice of await store.invoices.due({now: new Date(now() + 365 * 86400000), limit: 200})) {
      if (invoice.status === 'fila' && new Date(invoice.nextAttemptAt).getTime() > now()) await store.invoices.update(invoice.id, {nextAttemptAt: new Date(now())});
    }
  }
  // Bling answered again since the last look (the breaker logged "recuperado", whoever's call it was: this queue, another
  // process, Ju's "Tentar agora"): the notes waiting for it go now instead of at their own next attempt.
  async function afterRecovery() {
    if (!bling) return;
    const last = (await bling.recent(10)).find(e => e.kind === 'recuperado');
    const at = last ? new Date(last.createdAt).getTime() : 0;
    if (at <= (pulled.get(store) || 0)) return;
    pulled.set(store, at);
    await pullForward();
  }

  // One round: the notes whose time has come, oldest first, one after the other (the Bling client keeps the pace). With
  // the service out of reach (disconnected, paused, breaker open) only the buyers' e-mails go; the rest is counted.
  async function runOnce({limit = ROUND} = {}) {
    const done = {sent: 0, checked: 0, mailed: 0, waiting: 0};
    if (settings.mode === 'off') return done;
    if (bling) await bling.keepAlive();
    await afterRecovery();
    let state = await gate();
    const at = new Date(now());
    if (!state.open) done.waiting = (await store.invoices.due({now: at, limit: 200, statuses: ['fila', 'processando']})).length;
    for (const invoice of await store.invoices.due({now: at, limit, ...(state.open ? {} : {statuses: ['autorizada']})})) {
      // One note that fails here never holds the others: it goes again in 15 minutes.
      try {
        const order = await store.orders.findById(invoice.orderId);
        // No order, or one taken back to Pendentes or declined before its note went out: the note leaves the queue (a new
        // confirmation issues it). A note already sent (processando) is followed whatever the order: it exists for the
        // tax authority, and only Bling says how it ended.
        if (!order || (invoice.status === 'fila' && !INVOICED.includes(order.status))) { await store.invoices.update(invoice.id, {nextAttemptAt: null}); continue; }
        if (invoice.status === 'autorizada') { await invoicing.resendMail(invoice, order); done.mailed++; continue; }   // e-mail only, no Bling
        if (!state.open) { done.waiting++; continue; }
        if (invoice.status === 'fila') { await invoicing.issue(order, {actor: 'fila'}); done.sent++; }
        else { await invoicing.refresh(invoice, order); done.checked++; }
        state = await gate();   // a failure may have opened the breaker: the rest waits for the next round
      } catch (error) {
        log.error(`fila de notas: a nota de ${invoice.reference} falhou nesta volta —`, error.code || '', error.message);
        await store.invoices.update(invoice.id, {nextAttemptAt: new Date(now() + 15 * 60000)}).catch(() => {});
      }
    }
    await alerts(state.status);
    heartbeat.lastRound = new Date().toISOString();
    return done;
  }

  // A round now, unless one is already running in this process (then that one). A round running for more than
  // STALE (something it waits for never answered) no longer holds the queue: a new one starts.
  function kick() {
    const running = rounds.get(store);
    if (running && Date.now() - running.at < STALE) return running.round;
    if (running) log.error('fila de notas: a volta anterior passou de 10 minutos; começando outra');
    const round = runOnce().catch(error => { log.error('fila de notas: a volta falhou —', error.code || '', error.message); return null; })
      .finally(() => { if (rounds.get(store)?.round === round) rounds.delete(store); });
    rounds.set(store, {round, at: Date.now()});
    return round;
  }

  // Ju connected Bling again or lifted the pause: every note waiting goes now. Never rejects (it runs after the answer).
  async function wakeAll() {
    try { await pullForward(); } catch (error) { log.error('fila de notas: não foi possível adiantar a fila —', error.code || '', error.message); }
    return kick();
  }

  return {runOnce, kick, wakeAll, settings};
}

// For the panel's notice: how the Bling integration is and how many notes wait. Database only, never calls Bling.
//   state: ok · instavel (breaker open) · expirado (connection lost) · desconectado · pausado · nao_configurado
async function panelStatus({store, env = process.env, now = () => Date.now()}) {
  const status = await createBling({store, env, now}).status(), queue = await store.invoices.queue();
  const state = !status.configured ? 'nao_configurado' : status.pausedReason ? 'pausado' : !status.connected ? (status.expired ? 'expirado' : 'desconectado') : status.unstable ? 'instavel' : 'ok';
  const iso = value => value ? new Date(value).toISOString() : null;
  return {state, since: status.failingSince, retryAt: status.retryAt, lastError: status.lastError, pausedReason: status.pausedReason,
    waiting: queue.waiting, processing: queue.processing, oldestWaiting: iso(queue.oldestWaiting), nextAttemptAt: iso(queue.nextAttemptAt)};
}

// The Node server's timer: a round a minute (the first one shortly after start), never keeping the process alive.
function startWorker({env = process.env, log = console, intervalMs = INTERVAL, store, fetchImpl, outbox} = {}) {
  const settings = nfeSettings(env);
  const active = store || require('./account-http').storeFor(env);
  if (settings.mode === 'off' || !active) return () => {};
  const queue = createInvoiceQueue({store: active, env, fetchImpl, outbox, log});
  const first = setTimeout(() => queue.kick(), Math.min(10000, intervalMs)), timer = setInterval(() => queue.kick(), intervalMs);
  first.unref?.(); timer.unref?.();
  heartbeat.worker = true;
  log.log(`fila de notas: ligada (${settings.provider}, uma volta a cada ${Math.round(intervalMs / 1000)} s)`);
  return () => { clearTimeout(first); clearInterval(timer); heartbeat.worker = false; };
}

// For /api/health: whether this process runs the queue by itself and when its last round ended.
const queueHeartbeat = () => ({...heartbeat});

module.exports = {createInvoiceQueue, startWorker, panelStatus, queueHeartbeat, ALERT_AFTER};
