// The Pix that waits, remembered by this tab (2026-10-08). Reloading the checkout used to start it over from the identification
// with the old code still payable at Mercado Pago, so a second Pix could be created next to it and both paid. The checkout now
// keeps only the Mercado Pago id and the order reference (nothing about the buyer, the code or the card) in sessionStorage
// while a Pix waits, and, coming back, asks the server how that Pix stands (/api/payments/status?details=1) before anything
// else: still payable, the buyer chooses between going on with it and cancelling it first; paid meanwhile, the confirmation;
// gone (expired, cancelled, refused, unknown to the server), the memory is dropped and the checkout starts as usual.
// No page here (the storage comes as an argument), so tests/checkout-ux.mjs runs it in Node.
export const PENDING_KEY = 'ju.pix.pending.v1';
const MP_ID = /^[A-Za-z0-9]{10,64}$/, REFERENCE = /^[A-Za-z0-9-]{1,64}$/;

export function rememberPendingPix(storage, {mpId, reference} = {}) {
  if (!MP_ID.test(String(mpId ?? ''))) return;
  try { storage?.setItem(PENDING_KEY, JSON.stringify({mpId, reference: REFERENCE.test(String(reference ?? '')) ? reference : ''})); } catch {}
}
export function recallPendingPix(storage) {
  try {
    const kept = JSON.parse(storage?.getItem(PENDING_KEY) || 'null');
    return kept && MP_ID.test(String(kept.mpId ?? '')) ? {mpId: kept.mpId, reference: REFERENCE.test(String(kept.reference ?? '')) ? kept.reference : ''} : null;
  } catch { return null; }
}
export function forgetPendingPix(storage) { try { storage?.removeItem(PENDING_KEY); } catch {} }
// The pieces of the remembered order as this page knows them (2026-10-08, review): the server lists them without the cart's own
// ids, so each piece takes the id (and the picture) of the same piece in the page's cart, found by `key` (cart-store.js
// signature: product and colors). A payment confirmed after the reload then takes those pieces out of the cart like any other
// (removePurchased compares the ids); before, they stayed in it, paid, ready to be bought again.
export function matchCartItems(items, local, key) {
  return (items || []).map(item => {
    const mine = (local || []).find(other => key(other) === key(item));
    return mine ? {...item, id: mine.id, thumbnail: mine.thumbnail ?? item.thumbnail ?? null} : item;
  });
}

// What the server's answer about the remembered Pix leads to ({status, data} of /api/payments/status?details=1, null without
// one): 'resume' (still payable, with its code: offer to go on with it or cancel it), 'paid' (the confirmation), 'gone' (it can
// no longer be paid: forget it), 'unknown' (no answer, or not one to trust: keep it and offer the same choice, which asks again;
// never a new Pix while this one may be payable), 'signin' (the session ended: the account page, then back here).
export function resumeStep(answer) {
  const status = answer?.status, data = answer?.data, state = status === 200 ? data?.state : null;
  if (status === 401) return 'signin';
  if (status === 404 || status === 400) return 'gone';
  if (state === 'approved') return 'paid';
  if (state === 'pending_pix') return data?.pix?.qrCode && Array.isArray(data.items) && data.items.length ? 'resume' : 'unknown';
  if (state && state !== 'in_review') return 'gone';
  return 'unknown';
}
