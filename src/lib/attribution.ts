/**
 * First touch attribution capture.
 *
 * On the very first page load we record every marketing identifier we can see and
 * persist it to BOTH localStorage and a first party cookie (one year). First touch
 * wins: once a record exists it is never overwritten, so a later organic visit cannot
 * erase the paid click that actually introduced the maker to Batchlabel.
 *
 * The stored record is passed into the Supabase sign up call as user metadata, and is
 * also the payload a future Stripe webhook would replay to Meta Conversions API and
 * Google Enhanced Conversions (see api/stripe-webhook.ts).
 */

export const ATTRIBUTION_STORAGE_KEY = 'bl_attribution';
export const ATTRIBUTION_COOKIE_NAME = 'bl_attr';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export interface Attribution {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  fbclid: string | null;
  referrer: string | null;
  landing_path: string | null;
  first_seen_at: string | null;
}

const PARAM_KEYS = [
'utm_source',
'utm_medium',
'utm_campaign',
'utm_term',
'utm_content',
'gclid',
'gbraid',
'wbraid',
'fbclid'] as
const;

function emptyAttribution(): Attribution {
  return {
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_term: null,
    utm_content: null,
    gclid: null,
    gbraid: null,
    wbraid: null,
    fbclid: null,
    referrer: null,
    landing_path: null,
    first_seen_at: null
  };
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function writeCookie(name: string, value: string) {
  if (typeof document === 'undefined') return;
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

function parse(raw: string | null): Attribution | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Attribution>;
    if (!parsed || typeof parsed !== 'object') return null;
    return { ...emptyAttribution(), ...parsed };
  } catch {
    return null;
  }
}

/** Returns the stored first touch record, checking localStorage then the cookie. */
export function getAttribution(): Attribution {
  if (typeof window === 'undefined') return emptyAttribution();
  const fromStorage = (() => {
    try {
      return parse(window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY));
    } catch {
      return null;
    }
  })();
  if (fromStorage) return fromStorage;
  return parse(readCookie(ATTRIBUTION_COOKIE_NAME)) ?? emptyAttribution();
}

/**
 * Captures attribution once per browser. Safe to call on every load.
 * Returns the record that is now stored.
 */
export function captureAttribution(): Attribution {
  if (typeof window === 'undefined') return emptyAttribution();

  const existing = getAttribution();
  if (existing.first_seen_at) {
    // First touch already recorded. Re-write the cookie so it keeps rolling forward,
    // but never change the values.
    writeCookie(ATTRIBUTION_COOKIE_NAME, JSON.stringify(existing));
    return existing;
  }

  const params = new URLSearchParams(window.location.search);
  const record = emptyAttribution();
  PARAM_KEYS.forEach((key) => {
    const value = params.get(key);
    if (value) record[key] = value.slice(0, 300);
  });

  const referrer = document.referrer || null;
  const sameHost = referrer ? (() => {
    try {
      return new URL(referrer).hostname === window.location.hostname;
    } catch {
      return false;
    }
  })() : false;

  record.referrer = referrer && !sameHost ? referrer : 'direct';
  record.landing_path = window.location.pathname + window.location.search;
  record.first_seen_at = new Date().toISOString();

  const serialised = JSON.stringify(record);
  try {
    window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, serialised);
  } catch {

    // Storage can be blocked. The cookie below is the fallback.
  }writeCookie(ATTRIBUTION_COOKIE_NAME, serialised);
  return record;
}

/** Flattens the record for Supabase user metadata or a dataLayer payload. */
export function attributionForMetadata(): Record<string, string> {
  const record = getAttribution();
  return Object.entries(record).reduce<Record<string, string>>((acc, [key, value]) => {
    if (value) acc[key] = value;
    return acc;
  }, {});
}