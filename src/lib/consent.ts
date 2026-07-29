/**
 * Google Consent Mode v2 plus Google Tag Manager bootstrap.
 *
 * Order matters and is enforced here:
 *  1. dataLayer is created.
 *  2. Consent Mode v2 defaults are pushed with everything non essential DENIED.
 *  3. Any previously stored choice is replayed as a consent update.
 *  4. Only then is the GTM container script injected into <head>.
 *
 * GA4 and the Meta Pixel are configured inside the GTM container, so denying a
 * category here actually stops those tags firing rather than just hiding a banner.
 * Meta advanced matching is enabled on the Pixel tag in GTM and reads the hashed
 * email pushed to the dataLayer by lib/analytics.ts on sign up.
 */

export const GTM_CONTAINER_ID = 'GTM-XXXXXXX'; // TODO: replace with the live Batchlabel container id.
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

  // 3. Load the container. Tags inside it are still gated by Consent Mode above.
  pushToDataLayer({ 'gtm.start': Date.now(), event: 'gtm.js' });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_CONTAINER_ID}`;
  document.head.appendChild(script);
}