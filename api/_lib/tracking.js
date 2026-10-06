'use strict';
// Automatic tracking with the Correios (API Rastro, RASTREIO.md). Every posted package (status "enviado") is looked up
// every few hours, in batches of up to 50, with the same contract and token as the freight quote:
//   - the events are saved on the order, newest first: the panel shows the last one, "Meus pedidos" the whole line;
//   - out for delivery: the buyer gets an e-mail (once);
//   - delivered: the order goes to Concluídos by itself and the buyer gets the "pedido entregue" e-mail;
//   - a problem (recipient away, wrong address, returned to the sender…): Ju gets an e-mail, once per kind of problem;
//   - a code the Correios do not know yet stays as it is until the next look; after 60 days a code is no longer looked up.
// It runs in the Node server every 10 minutes, when the panel opens and on /api/fila/rodar (the scheduled task that wakes
// the app on a host that stops it). One round at a time per process; the move to Concluídos is atomic, and each notice is
// recorded on the order (tracking_notices), so none goes twice.
const {createCorreios, settings: correiosSettings} = require('./correios');
const {createOrders} = require('./orders');
const {alertOwner} = require('./integration-alerts');

const EVERY = 2 * 3600000;        // a package is looked up again after 2 hours
const FRESH = 30 * 60000;         // asked on demand ("Meus pedidos", the panel), the saved line counts while younger than this
const GIVE_UP = 60 * 86400000;    // codes posted longer ago than this are no longer looked up
const INTERVAL = 10 * 60000;      // a round every 10 minutes in the server
const ROUND = 200;                // packages per round, in batches of 50
const MAX_EVENTS = 40;
const STALE = 10 * 60000;         // a round still running after this no longer holds the next one
const STATES = ['postado', 'em_transito', 'saiu_para_entrega', 'aguardando_retirada', 'entregue', 'problema', 'devolvido', 'nao_encontrado'];

// One Correios event → where the package stands. The codes first (BDE/BDI/BDR "baixa" with type 01: delivered; OEC: out for
// delivery; LDI: waiting to be picked up; PO: posted), the words of the description as a backstop.
const BAIXA = new Set(['BDE', 'BDI', 'BDR']);
function classify({codigo = '', tipo = '', descricao = ''} = {}) {
  const code = String(codigo).toUpperCase(), kind = String(tipo).padStart(2, '0'), text = String(descricao).toLowerCase();
  if (/devolvid|devolu[cç][aã]o ao remetente|entregue ao remetente/.test(text)) return 'devolvido';
  if ((BAIXA.has(code) && ['00', '01'].includes(kind)) || /entregue ao destinat/.test(text)) return 'entregue';
  if (code === 'OEC' || /saiu para entrega/.test(text)) return 'saiu_para_entrega';
  if (code === 'LDI' || /aguardando retirada|dispon[ií]vel para retirada/.test(text)) return 'aguardando_retirada';
  if (BAIXA.has(code) || /ausente|n[aã]o localizado|endere[cç]o incorreto|recusad|extraviad|roubad|avariad|n[aã]o entregue|insuficiente/.test(text)) return 'problema';
  if (code === 'PO' || /postado/.test(text)) return 'postado';
  return 'em_transito';
}

// The Correios write the time of an event without a zone (Brasília): it is read as -03:00.
const timeOf = value => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const t = Date.parse(/(?:[zZ]|[+-]\d\d:?\d\d)$/.test(raw) ? raw : `${raw}-03:00`);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};
const placeOf = unit => {
  const address = unit?.endereco || {}, city = String(address.cidade || '').trim(), uf = String(address.uf || '').trim().toUpperCase();
  return city || uf ? {city: city.slice(0, 60), uf: uf.slice(0, 2)} : null;
};
// The events of one package, newest first, in a small shape of our own (no Correios ids, nothing personal).
function eventsOf(objeto) {
  return (Array.isArray(objeto?.eventos) ? objeto.eventos : []).map(e => ({
    code: String(e.codigo || '').slice(0, 4), type: String(e.tipo || '').slice(0, 3), state: classify(e),
    description: String(e.descricao || '').replace(/\s+/g, ' ').trim().slice(0, 120), detail: String(e.detalhe || '').replace(/\s+/g, ' ').trim().slice(0, 160) || null,
    at: timeOf(e.dtHrCriado), place: placeOf(e.unidade), to: placeOf(e.unidadeDestino)
  })).filter(e => e.at && e.description).sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX_EVENTS);
}

// One Correios client per environment and fetch, so the token is kept between rounds and requests.
const clients = new WeakMap();
function clientFor(env, fetchImpl, now) {
  if (!clients.has(env)) clients.set(env, new WeakMap());
  const byFetch = clients.get(env);
  if (!byFetch.has(fetchImpl)) byFetch.set(fetchImpl, createCorreios({env, fetchImpl, now}));
  return byFetch.get(fetchImpl);
}
const rounds = new WeakMap();   // store → the round running in this process

function createTracking({store, env = process.env, now = () => Date.now(), fetchImpl = globalThis.fetch, outbox, log = console, correios = null}) {
  const client = correios || clientFor(env, fetchImpl, now);
  const orders = createOrders({store, env, now});
  const ready = () => correiosSettings(env).ready;

  // What the Correios answered for one package → saved on the order, then the notices. Returns the order as it is now.
  async function apply(order, objeto) {
    const at = new Date(now()), events = eventsOf(objeto);
    if (!events.length) {
      // Not in the Correios system yet (just posted, or a typo): the look is recorded and the next one comes later.
      await store.orders.update(order.id, {trackingCheckedAt: at, ...(order.trackingState ? {} : {trackingState: 'nao_encontrado'})});
      return store.orders.findById(order.id);
    }
    const last = events[0], delivery = events.find(e => e.state === 'entregue');
    await store.orders.update(order.id, {trackingState: last.state, trackingEvents: events, trackingLast: last, trackingCheckedAt: at, ...(delivery ? {deliveredAt: new Date(delivery.at)} : {})});
    // Reopened by Ju after a delivery (orders.setStatus marks "reaberto:<time>"): only a delivery registered after that
    // closes the order again.
    const reopened = Math.max(0, ...String(order.trackingNotices || '').split(',').filter(n => n.startsWith('reaberto:')).map(n => parseInt(n.slice(9), 36) || 0));
    let delivered = false;
    if (delivery && order.status === 'enviado' && Date.parse(delivery.at) > reopened) {
      delivered = await store.orders.transition(order.id, ['enviado'], {status: 'concluido', decidedAt: at});
      if (delivered) await store.orders.addEvent(order.id, 'status:concluido', 'entregue (Correios)', 'correios');
    }
    let current = await store.orders.findById(order.id);
    const notices = new Set(String(current.trackingNotices || '').split(',').filter(Boolean));
    const notify = async (key, send) => {
      if (notices.has(key) || !(await send())) return;
      notices.add(key);
      current = await store.orders.update(order.id, {trackingNotices: [...notices].join(',').slice(0, 255)});
    };
    if (delivered) await notify('entregue', () => orders.notifyDecision(current, {fetchImpl, outbox}));
    else if (last.state === 'saiu_para_entrega' && current.status === 'enviado') await notify('saiu', () => orders.notifyTracking(current, 'saiu', {fetchImpl, outbox}));
    if (['problema', 'devolvido'].includes(last.state)) {
      const where = last.place ? ` (${[last.place.city, last.place.uf].filter(Boolean).join('/')})` : '';
      await notify(`${last.state}:${last.code}${last.type}`, () => alertOwner({env, fetchImpl, outbox, now, store, name: 'correios', kind: 'pacote', reference: order.reference,
        detail: `${last.description}${last.detail ? ` — ${last.detail}` : ''}${where}`, data: {code: order.trackingCode, returned: last.state === 'devolvido'}}));
    }
    return current;
  }

  // One round: the packages due for a look, in batches. The Correios down: the rest waits for the next round. A batch the
  // Correios refuse (the API off the contract, say) is recorded as looked at, so it is not asked again every 10 minutes.
  async function runOnce({limit = ROUND} = {}) {
    const done = {checked: 0, delivered: 0, failed: 0};
    if (!ready()) return done;
    const due = await store.orders.listForTracking({statuses: ['enviado'], checkedBefore: new Date(now() - EVERY), shippedAfter: new Date(now() - GIVE_UP), limit});
    for (let i = 0; i < due.length; i += client.TRACK_BATCH) {
      const batch = due.slice(i, i + client.TRACK_BATCH);
      let objetos;
      try { objetos = await client.track(batch.map(o => o.trackingCode)); }
      catch (error) {
        log.error(`rastreio: os Correios não responderam a consulta de ${batch.length} pacote(s) — ${error.code || error.message}${error.status ? ` (${error.status})` : ''} ${(error.messages || []).join(' | ')}`.trim());
        done.failed += batch.length;
        if (error.code === 'correios_unavailable') break;
        for (const order of batch) await store.orders.update(order.id, {trackingCheckedAt: new Date(now())}).catch(() => {});
        continue;
      }
      const byCode = new Map(objetos.map(o => [String(o?.codObjeto || '').toUpperCase(), o]));
      for (const order of batch) {
        try {
          const updated = await apply(order, byCode.get(order.trackingCode) || null);
          done.checked++;
          if (updated?.status === 'concluido') done.delivered++;
        } catch (error) { log.error(`rastreio: o pacote de ${order.reference} falhou nesta volta —`, error.code || '', error.message); done.failed++; }
      }
    }
    return done;
  }

  // On demand ("Meus pedidos", the panel): the saved line while it is fresh, otherwise one look now. A failure keeps the
  // saved line (the page never breaks because of the Correios).
  async function forOrder(order, {maxAge = FRESH} = {}) {
    if (!order?.trackingCode || !ready()) return order;
    if (order.status === 'concluido' && order.deliveredAt) return order;   // delivered: the line will not change any more
    const checked = order.trackingCheckedAt ? new Date(order.trackingCheckedAt).getTime() : 0;
    if (checked && now() - checked < maxAge) return order;
    try { const [objeto] = await client.track([order.trackingCode]); return await apply(order, objeto || null); }
    catch (error) { log.error(`rastreio: não foi possível consultar ${order.reference} agora —`, error.code || '', error.message); return order; }
  }

  // A round now, unless one is already running in this process (then that one). Never rejects.
  function kick() {
    const running = rounds.get(store);
    if (running && Date.now() - running.at < STALE) return running.round;
    const round = runOnce().catch(error => { log.error('rastreio: a volta falhou —', error.code || '', error.message); return null; })
      .finally(() => { if (rounds.get(store)?.round === round) rounds.delete(store); });
    rounds.set(store, {round, at: Date.now()});
    return round;
  }

  return {runOnce, forOrder, kick, apply, ready};
}

// The Node server's timer: a round every 10 minutes (the first one shortly after start), never keeping the process alive.
// Off without the Correios credentials or the database.
function startTrackingWorker({env = process.env, log = console, intervalMs = INTERVAL, store, fetchImpl, outbox} = {}) {
  const active = store || require('./account-http').storeFor(env);
  if (!correiosSettings(env).ready || !active) return () => {};
  const tracking = createTracking({store: active, env, fetchImpl, outbox, log});
  const first = setTimeout(() => tracking.kick(), Math.min(30000, intervalMs)), timer = setInterval(() => tracking.kick(), intervalMs);
  first.unref?.(); timer.unref?.();
  log.log(`rastreio dos Correios: ligado (uma volta a cada ${Math.round(intervalMs / 1000)} s; cada pacote a cada ${EVERY / 3600000} h)`);
  return () => { clearTimeout(first); clearInterval(timer); };
}

module.exports = {createTracking, startTrackingWorker, classify, eventsOf, timeOf, STATES, EVERY, FRESH, GIVE_UP};
