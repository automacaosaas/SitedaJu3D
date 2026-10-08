// Real payments through Mercado Pago (Payment Brick in the browser + /api/payments/* on the server).
// Optional by design: when the server says mode "off" (no keys, or Production not switched to live) the checkout keeps
// using the local demo simulator, so nothing changes for anyone without credentials. No secret ever reaches this file:
// only the PUBLIC key comes back from /api/payments/config.
const SDK_URL = 'https://sdk.mercadopago.com/js/v2';
const LOCALES = {'pt-BR': 'pt-BR', en: 'en-US', es: 'es-AR'};

export const brickLocale = lang => LOCALES[lang] || LOCALES['pt-BR'];
// advancedFraudPrevention injects an inline script (a device session from Mercado Livre pages), which the site's
// Content-Security-Policy does not allow. It stays off: the device id goes the documented way instead (loadDeviceId
// below + X-meli-session-id on the server), without loosening the policy.
export const SDK_OPTIONS = lang => ({locale: brickLocale(lang), advancedFraudPrevention: false});

// Mercado Pago's device id (fraud prevention, better approval): security.js with view="checkout" sets
// window.MP_DEVICE_SESSION_ID, which goes with the payment (`deviceId`) and on to Mercado Pago as X-meli-session-id. An
// ordinary external script (its host is in the policy), never inline, loaded only once real payments are on. It never
// holds the checkout: blocked or slow, the payment goes without it.
export const DEVICE_URL = 'https://www.mercadopago.com/v2/security.js';
const DEVICE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;
export const currentDeviceId = (win = globalThis) => DEVICE_ID.test(String(win.MP_DEVICE_SESSION_ID ?? '')) ? String(win.MP_DEVICE_SESSION_ID) : '';
let devicePromise = null;
export function loadDeviceId({doc = document, win = window, timeout = 8000} = {}) {
  if (currentDeviceId(win)) return Promise.resolve(currentDeviceId(win));
  devicePromise ??= new Promise(resolve => {
    const script = doc.createElement('script'), started = Date.now();
    const done = () => resolve(currentDeviceId(win));
    script.src = DEVICE_URL; script.async = true; script.setAttribute('view', 'checkout');
    script.onload = () => { const check = () => currentDeviceId(win) || Date.now() - started >= timeout ? done() : setTimeout(check, 100); check(); };
    script.onerror = () => { devicePromise = null; done(); };
    setTimeout(done, timeout);
    doc.head.append(script);
  });
  return devicePromise;
}

// The account's payment methods, for the cart's marks (GET /api/payments/methods); null while unknown.
export async function loadPaymentMethods({fetchImpl = globalThis.fetch, timeout = 4000} = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetchImpl('/api/payments/methods', {signal: controller.signal});
    if (!response.ok) return null;
    const {methods} = await response.json();
    return Array.isArray(methods) && methods.length ? methods.filter(m => m && typeof m.id === 'string' && ['bank_transfer', 'credit_card', 'debit_card'].includes(m.type)) : null;
  } catch { return null; }
  finally { clearTimeout(timer); }
}

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

// One id per payment attempt. The server derives the order reference and the idempotency key from it, so a double
// click or a network retry lands on the same order instead of charging twice. The checkout keeps the same id until a
// definite answer (keepAttempt) and only then makes a new one. Must match /^[A-Za-z0-9-]{16,64}$/.
export const newAttempt = () => globalThis.crypto?.randomUUID?.() || `a${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}-${Math.random().toString(16).slice(2, 10)}`;
// No answer, or the server or Mercado Pago did not answer (timeout, 5xx): the charge may have gone through, so the next
// try reuses the attempt. Any other answer is definite (approved, Pix code, in review, refused, invalid data).
export const keepAttempt = status => !status || status >= 500;

async function request(path, {method = 'GET', body, fetchImpl = globalThis.fetch, timeout = 30000} = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetchImpl(path, {method, cache: 'no-store', signal: controller.signal, ...(body ? {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {})});
    return {status: response.status, data: await response.json().catch(() => null)};
  } finally { clearTimeout(timer); }
}
export const createPayment = (body, options) => request('/api/payments/create', {method: 'POST', body, ...options});
export const paymentState = (id, options) => request('/api/payments/status?id=' + encodeURIComponent(id), options);
// Leaving a Pix that waits: its code is cancelled at Mercado Pago (POST /api/payments/cancel), so it cannot be paid next
// to a new one. The answer's state says what happened: canceled, or approved when it was paid meanwhile.
export const cancelPayment = (id, options) => request('/api/payments/cancel', {method: 'POST', body: {id}, ...options});

// Portuguese texts for what can go wrong (the site translates them like the rest of the page). `detail` only exists in
// test mode, where the server passes Mercado Pago's own reason along to make problems easy to find.
export function paymentMessage(status, data) {
  const code = data?.error, field = data?.field;
  if (code === 'invalid_request' && field === 'cep') return 'Não encontramos esse CEP. Confira o CEP da entrega.';
  if (code === 'invalid_request' && field === 'state') return 'O CEP não é do estado escolhido. Confira o CEP e o estado da entrega.';
  if (code === 'invalid_request' && field === 'terms') return 'Para pagar, aceite os Termos de Uso e a Política de Trocas e Devoluções na etapa de entrega.';
  if (code === 'invalid_request' && field) return 'Confira os dados de entrega e tente novamente.';
  if (code === 'invalid_items') return 'Não foi possível conferir os itens do pedido. Volte ao carrinho e tente novamente.';
  if (code === 'invalid_card' || code === 'invalid_installments') return 'Confira os dados do cartão e tente novamente.';
  if (code === 'unsupported_method') return 'Esta forma de pagamento não está disponível. Escolha Pix ou cartão.';
  if (code === 'too_many_requests' || status === 429) return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
  if (code === 'payment_rejected') return data?.reason ? refusalMessage(data.reason) : 'O pagamento não foi aceito. Confira os dados ou tente outra forma de pagamento.';
  if (code === 'profile_incomplete') return 'Complete sua identificação (nome, CPF e telefone) para a nota fiscal e a entrega.';
  if (code === 'unauthorized' || status === 401) return 'Sua sessão terminou. Entre de novo na sua conta para continuar.';
  if (code === 'payments_not_configured') return 'Os pagamentos ainda não estão disponíveis. Tente novamente mais tarde.';
  return 'Não conseguimos confirmar o pagamento agora. Se tiver certeza de que não houve cobrança, tente novamente.';
}
export const refusedMessage = () => 'O pagamento não foi aprovado. Confira os dados do cartão ou escolha outra forma de pagamento.';
// Why the card was refused (the reasons the server passes on, api/_lib/mercadopago.js REFUSAL_REASONS), in words the
// buyer can act on. Mercado Pago's own code is never shown on the real site; an unknown reason gets the general sentence.
const REFUSALS = {
  card: 'Algum dado do cartão não confere (número, validade ou código de segurança). Confira e tente de novo.',
  funds: 'O cartão não tem limite disponível para esta compra. Tente outro cartão ou pague com Pix.',
  call: 'O banco do cartão pediu para você autorizar esta compra. Fale com o banco e tente de novo.',
  disabled: 'Este cartão está bloqueado ou inativo. Use outro cartão ou pague com Pix.',
  attempts: 'Foram muitas tentativas com este cartão. Use outro cartão ou pague com Pix.',
  installments: 'O cartão não aceita esse número de parcelas. Escolha outra quantidade e tente de novo.',
  duplicated: 'Um pagamento igual acabou de ser feito. Confira em Meus pedidos antes de tentar de novo.',
  risk: 'O pagamento não passou pela análise de segurança do Mercado Pago. Tente outro cartão ou pague com Pix.',
  issuer: 'O banco do cartão não aprovou o pagamento. Tente outro cartão ou pague com Pix.',
  processing: 'Não conseguimos processar o pagamento agora. Tente de novo em alguns instantes.',
  challenge: 'O tempo para confirmar a compra com o banco acabou. Tente de novo.'
};
const REASON_GROUP = {
  bad_filled_card_data: 'card', bad_filled_security_code: 'card', bad_filled_date: 'card', bad_filled_other: 'card', invalid_card_token: 'card', invalid_security_code: 'card', invalid_expiration_date: 'card',
  insufficient_amount: 'funds', card_insufficient_amount: 'funds', amount_limit_exceeded: 'funds', required_call_for_authorize: 'call', call_for_authorize: 'call', card_disabled: 'disabled',
  max_attempts_exceeded: 'attempts', invalid_installments: 'installments', duplicated_payment: 'duplicated', high_risk: 'risk', rejected_high_risk: 'risk', blacklist: 'risk', rejected_by_regulations: 'risk',
  rejected_by_issuer: 'issuer', rejected_other_reason: 'issuer', processing_error: 'processing', '3ds_challenge_expired': 'challenge'
};
export const refusalMessage = reason => (Object.hasOwn(REASON_GROUP, String(reason)) ? REFUSALS[REASON_GROUP[reason]] : '') || refusedMessage();

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
