// Real payments through Mercado Pago (Payment Brick in the browser + /api/payments/* on the server).
// Optional by design: when the server says mode "off" (no keys, or Production not switched to live) the checkout keeps
// using the local demo simulator, so nothing changes for anyone without credentials. No secret ever reaches this file:
// only the PUBLIC key comes back from /api/payments/config.
const SDK_URL = 'https://sdk.mercadopago.com/js/v2';
const LOCALES = {'pt-BR': 'pt-BR', en: 'en-US', es: 'es-AR'};

export const brickLocale = lang => LOCALES[lang] || LOCALES['pt-BR'];

export async function loadPaymentConfig({fetchImpl = globalThis.fetch, timeout = 2500} = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetchImpl('/api/payments/config', {cache: 'no-store', signal: controller.signal});
    if (!response.ok) return {mode: 'off'};
    const data = await response.json();
    return (data.mode === 'test' || data.mode === 'live') && typeof data.publicKey === 'string' && data.publicKey ? {mode: data.mode, publicKey: data.publicKey} : {mode: 'off'};
  } catch { return {mode: 'off'}; }
  finally { clearTimeout(timer); }
}

let sdkPromise = null;
export function loadSdk({timeout = 15000, doc = document, win = window} = {}) {
  if (win.MercadoPago) return Promise.resolve(win.MercadoPago);
  sdkPromise ??= new Promise((resolve, reject) => {
    const script = doc.createElement('script');
    const giveUp = error => { sdkPromise = null; script.remove(); reject(error); };
    const timer = setTimeout(() => giveUp(new Error('sdk_timeout')), timeout);
    script.src = SDK_URL; script.async = true;
    script.onload = () => { clearTimeout(timer); if (win.MercadoPago) resolve(win.MercadoPago); else giveUp(new Error('sdk_missing')); };
    script.onerror = () => { clearTimeout(timer); giveUp(new Error('sdk_blocked')); };
    doc.head.append(script);
  });
  return sdkPromise;
}

// One id per click on the Brick's button. The server derives the order reference and the idempotency key from it, so a
// double click or a network retry lands on the same order instead of charging twice. Must match /^[A-Za-z0-9-]{16,64}$/.
export const newAttempt = () => globalThis.crypto?.randomUUID?.() || `a${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}-${Math.random().toString(16).slice(2, 10)}`;

async function request(path, {method = 'GET', body, fetchImpl = globalThis.fetch, timeout = 30000} = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetchImpl(path, {method, cache: 'no-store', signal: controller.signal, ...(body ? {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {})});
    return {status: response.status, data: await response.json().catch(() => null)};
  } finally { clearTimeout(timer); }
}
export const createPayment = (body, options) => request('/api/payments/create', {method: 'POST', body, ...options});
export const paymentState = (id, options) => request('/api/payments/status?id=' + encodeURIComponent(id), options);

// Portuguese texts for what can go wrong (the site translates them like the rest of the page). `detail` only exists in
// test mode, where the server passes Mercado Pago's own reason along to make problems easy to find.
export function paymentMessage(status, data) {
  const code = data?.error, field = data?.field;
  if (code === 'invalid_request' && field) return 'Confira os dados de entrega e tente novamente.';
  if (code === 'invalid_items') return 'Não foi possível conferir os itens do pedido. Volte ao carrinho e tente novamente.';
  if (code === 'invalid_card' || code === 'invalid_installments') return 'Confira os dados do cartão e tente novamente.';
  if (code === 'unsupported_method') return 'Esta forma de pagamento não está disponível. Escolha Pix ou cartão.';
  if (code === 'too_many_requests' || status === 429) return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
  if (code === 'payment_rejected') return 'O pagamento não foi aceito. Confira os dados ou tente outra forma de pagamento.';
  if (code === 'payments_not_configured') return 'Os pagamentos ainda não estão disponíveis. Tente novamente mais tarde.';
  return 'Não conseguimos confirmar o pagamento agora. Se tiver certeza de que não houve cobrança, tente novamente.';
}
export const refusedMessage = () => 'O pagamento não foi aprovado. Confira os dados do cartão ou escolha outra forma de pagamento.';

// Looks of the Brick, matched to the shop (rose accents, soft form, rounded fields).
export const BRICK_STYLE = Object.freeze({
  theme: 'default',
  customVariables: {baseColor: '#b64c68', baseColorFirstVariant: '#a34059', baseColorSecondVariant: '#8e3549', textPrimaryColor: '#282326', textSecondaryColor: '#7b7076', formBackgroundColor: '#fffcfb', inputBackgroundColor: '#ffffff', errorColor: '#98364e', buttonTextColor: '#ffffff', borderRadiusMedium: '12px', borderRadiusLarge: '16px', borderRadiusFull: '999px'}
});

// Pix data comes from Mercado Pago; only what is safe to put in the page is used.
export const safeBase64 = value => (/^[A-Za-z0-9+/]+={0,2}$/.test(String(value || '')) && String(value).length < 20000 ? String(value) : '');
export function parseExpiry(value, now = Date.now(), fallbackMs = 60 * 60 * 1000) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) && time > now ? time : now + fallbackMs;
}
