/**
 * Google Consent Mode v2 bootstrap.
 *
 * Order matters and is enforced here:
 *  1. dataLayer is created.
 *  2. Consent Mode v2 defaults are pushed with everything non essential DENIED.
 *  3. Any previously stored choice is replayed as a consent update.
 *  4. The Meta Pixel is loaded, but ONLY if that stored choice granted marketing.
 *  5. Only then is the GA4 tag injected into <head>.
 *
 * There is no tag manager: GA4 is loaded directly, below. See src/TRACKING.md.
 *
 * The Meta Pixel is loaded from here too, in step 4, and on the same terms. Consent Mode is
 * Google's mechanism — Meta does not read it — so `ad_storage: denied` suppresses nothing
 * on Meta's side. The Pixel is gated by NOT LOADING IT: see initMetaPixel() in
 * ./meta-pixel.ts, which is also what carries a later change of mind in both directions.
 *
 * This file owns ADVERTISING for the whole product. The banner's `marketing` toggle
 * drives ad_storage, ad_user_data and ad_personalization, it decides whether the Meta Pixel
 * exists at all, and it is what the account-level advertising_opt_in is derived from — see
 * advertisingConsentFromBanner() and docs/CONSENT.md. Nothing else asks the user about
 * advertising, so the records cannot contradict each other.
 */

import { initMetaPixel, setMetaConsent } from './meta-pixel';

/**
 * GA4 measurement id. Public by design (it ships in the page), so it lives in code
 * rather than an env var — one less thing to forget on a redeploy. Override per
 * deployment with VITE_GA4_MEASUREMENT_ID if a sub-brand ever needs its own property.
 */
export const GA4_MEASUREMENT_ID =
(import.meta as unknown as {env?: Record<string, string>;}).env?.
VITE_GA4_MEASUREMENT_ID || 'G-BGDNRH022T';

/**
 * Local development should not report into the live property. Anything that is not a
 * localhost hostname counts as a real environment, so preview deploys still measure.
 */
function isMeasurableHost(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return h !== 'localhost' && h !== '127.0.0.1' && h !== '::1' && !h.endsWith('.local');
}
export const CONSENT_STORAGE_KEY = 'bl_consent';
const CONSENT_COOKIE_NAME = 'bl_consent';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 183; // Six months, then we ask again.

export interface ConsentChoice {
  analytics: boolean;
  marketing: boolean;
  decided_at: string;
  version: 1;
}

type ConsentValue = 'granted' | 'denied';

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

function pushToDataLayer(payload: unknown) {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);
}

// Consent Mode requires the raw arguments object, not a plain array, so this stays a
// classic function expression.
const gtag = function () {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments);
} as (...args: unknown[]) => void;

/**
 * Sends a GA4 event.
 *
 * Without a tag manager in front of it, a plain object pushed to dataLayer is inert —
 * GA4 only acts on gtag commands. Every event therefore has to go through here as well
 * as onto dataLayer, or it is recorded nowhere. See lib/analytics.ts.
 *
 * Safe to call before the tag has loaded: the command sits on the queue and is replayed
 * when it boots, and Consent Mode still decides whether anything is actually sent.
 */
export function gtagEvent(name: string, params: Record<string, unknown> = {}) {
  gtag('event', name, params);
}

function writeCookie(value: string) {
  if (typeof document === 'undefined') return;
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CONSENT_COOKIE_NAME}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

export function getStoredConsent(): ConsentChoice | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentChoice;
    if (typeof parsed?.analytics !== 'boolean' || typeof parsed?.marketing !== 'boolean') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * The account-level advertising opt-in, derived from the banner.
 *
 * There is deliberately no second question about advertising anywhere in the product.
 * Sharing a hashed email with Meta or Google is account level, the retargeting it powers
 * is device level, and asking twice produced two records that could disagree — at which
 * point neither proves anything.
 *
 * No stored choice means no. Consent Mode already defaults ad_storage to denied, so
 * false is the only answer consistent with what the browser is already doing.
 */
export function advertisingConsentFromBanner(): boolean {
  return getStoredConsent()?.marketing ?? false;
}

function toValue(granted: boolean): ConsentValue {
  return granted ? 'granted' : 'denied';
}

function updateConsentMode(choice: Pick<ConsentChoice, 'analytics' | 'marketing'>) {
  gtag('consent', 'update', {
    analytics_storage: toValue(choice.analytics),
    ad_storage: toValue(choice.marketing),
    ad_user_data: toValue(choice.marketing),
    ad_personalization: toValue(choice.marketing)
  });
  pushToDataLayer({
    event: 'consent_update',
    consent_analytics: choice.analytics,
    consent_marketing: choice.marketing
  });
}

/** Persists a choice and tells Consent Mode about it straight away. */
export function saveConsent(choice: Pick<ConsentChoice, 'analytics' | 'marketing'>): ConsentChoice {
  const record: ConsentChoice = {
    analytics: choice.analytics,
    marketing: choice.marketing,
    decided_at: new Date().toISOString(),
    version: 1
  };
  const serialised = JSON.stringify(record);
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, serialised);
  } catch {

    // Fall back to the cookie only.
  }writeCookie(serialised);
  updateConsentMode(record);
  // Meta does not read Consent Mode, so the Pixel has to be told separately. This is the
  // call that starts tracking somebody who has just accepted, and stops — and cleans up
  // after — somebody who has just withdrawn. See ./meta-pixel.ts.
  setMetaConsent(record.marketing);
  return record;
}

let booted = false;

/** Call once, as early as possible, before React renders. */
export function initTagging() {
  if (booted || typeof window === 'undefined') return;
  booted = true;

  window.dataLayer = window.dataLayer || [];

  // 1. Default deny. Security storage stays granted because it is strictly necessary.
  gtag('consent', 'default', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    functionality_storage: 'denied',
    personalization_storage: 'denied',
    security_storage: 'granted',
    wait_for_update: 500
  });
  gtag('set', 'ads_data_redaction', true);
  gtag('set', 'url_passthrough', true);

  // 2. Replay a stored decision, if the maker has already chosen.
  const stored = getStoredConsent();
  if (stored) updateConsentMode(stored);

  // 3. The Meta Pixel, which loads ONLY if marketing was already accepted. No stored
  //    choice means false, so a first-time visitor gets no connect.facebook.net request at
  //    all — not a suppressed one. Placed here, after the denied defaults and the replay,
  //    for the same ordering reason GA4 is placed below, and before the localhost guard
  //    because meta-pixel.ts applies its own (with a debug override for Test Events).
  initMetaPixel(stored?.marketing ?? false);

  // 4. Load GA4. Order matters: the consent defaults above are already on the queue, so
  //    gtag applies them the moment it boots and will not read or write storage until
  //    the maker grants analytics. Loading the tag in index.html instead — as Google's
  //    copy-paste snippet does — would put it ahead of those defaults and measure people
  //    who never consented.
  if (!isMeasurableHost()) return;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  gtag('js', new Date());
  // send_page_view is off because this is a single page app: the initial GA4 page view
  // would double count against the page_view that usePageMeta sends on every route
  // change, including the first one.
  gtag('config', GA4_MEASUREMENT_ID, { send_page_view: false });
}