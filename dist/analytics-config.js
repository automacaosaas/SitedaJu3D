// Analytics and ad tools (audit Q7). None is on: the site loads nothing from third parties to measure visits, so there is
// no cookie notice either (the Privacy Policy says so). To turn one on:
//   1. fill its id below (Google Analytics 4: 'G-XXXXXXXXXX'; Meta pixel: the digits only);
//   2. add its addresses (CSP_DOMAINS below) to the Content-Security-Policy in vercel.json and run node tools/sync-csp.cjs;
//   tests/consent.mjs fails while step 2 is missing.
// With an id filled in, the cookie notice (consent.js) shows on the first visit, and the tool loads only after the person
// accepts its category. The choice can be changed at any time in "Preferências de cookies", in the footer.
export const ANALYTICS = Object.freeze({ga4: '', metaPixel: ''});

export const CSP_DOMAINS = Object.freeze({
  ga4: {'script-src': ['https://www.googletagmanager.com'], 'connect-src': ['https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://www.googletagmanager.com'], 'img-src': ['https://*.google-analytics.com', 'https://www.googletagmanager.com']},
  metaPixel: {'script-src': ['https://connect.facebook.net'], 'connect-src': ['https://www.facebook.com', 'https://connect.facebook.net'], 'img-src': ['https://www.facebook.com']}
});

export const validIds = () => ({ga4: /^G-[A-Z0-9]{4,}$/.test(ANALYTICS.ga4) ? ANALYTICS.ga4 : '', metaPixel: /^\d{6,20}$/.test(ANALYTICS.metaPixel) ? ANALYTICS.metaPixel : ''});

// A preview of the notice for checking its look before any tool exists: open any page with ?cookies=preview. It lasts for
// the browser tab (sessionStorage) and never loads a tool.
const PREVIEW = 'ju.cookies.preview';
export function cookiePreview() {
  try {
    if (new URLSearchParams(location.search).get('cookies') === 'preview') sessionStorage.setItem(PREVIEW, '1');
    return sessionStorage.getItem(PREVIEW) === '1';
  } catch { return false; }
}
// Whether the notice is needed at all: only with a tool to ask about (or in the preview).
export const cookieNoticeNeeded = () => Boolean(validIds().ga4 || validIds().metaPixel) || cookiePreview();
