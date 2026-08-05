import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  ATTRIBUTION_STORAGE_KEY,
  ATTRIBUTION_COOKIE_NAME,
  captureAttribution,
  getAttribution,
  attributionForMetadata,
} from './attribution';

/** Point window.location at a given URL so captureAttribution reads its query string. */
function setLocation(url: string) {
  const parsed = new URL(url);
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      href: parsed.href,
      search: parsed.search,
      pathname: parsed.pathname,
      hostname: parsed.hostname,
      protocol: parsed.protocol,
    },
  });
}

/** Clear every cookie jsdom currently exposes. */
function clearCookies() {
  document.cookie
    .split('; ')
    .filter(Boolean)
    .forEach((row) => {
      const name = row.split('=')[0];
      document.cookie = `${name}=; path=/; max-age=0`;
    });
}

describe('attribution', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearCookies();
    setLocation('https://batchlabel.xyz/');
    Object.defineProperty(document, 'referrer', { configurable: true, value: '' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('captureAttribution', () => {
    it('captures utm params and click ids from the landing URL', () => {
      setLocation(
        'https://batchlabel.xyz/pricing?utm_source=google&utm_medium=cpc&utm_campaign=spring&gclid=abc123',
      );
      Object.defineProperty(document, 'referrer', {
        configurable: true,
        value: 'https://www.google.com/',
      });

      const record = captureAttribution();

      expect(record.utm_source).toBe('google');
      expect(record.utm_medium).toBe('cpc');
      expect(record.utm_campaign).toBe('spring');
      expect(record.gclid).toBe('abc123');
      expect(record.landing_path).toBe('/pricing?utm_source=google&utm_medium=cpc&utm_campaign=spring&gclid=abc123');
      expect(record.referrer).toBe('https://www.google.com/');
      expect(record.first_seen_at).not.toBeNull();
    });

    it('persists the record to both localStorage and the cookie', () => {
      setLocation('https://batchlabel.xyz/?utm_source=meta');
      captureAttribution();

      const stored = window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
      expect(stored).toContain('meta');
      expect(document.cookie).toContain(`${ATTRIBUTION_COOKIE_NAME}=`);
    });

    it('first touch wins: a later visit never overwrites the original values', () => {
      setLocation('https://batchlabel.xyz/?utm_source=google&utm_campaign=first');
      const first = captureAttribution();
      expect(first.utm_source).toBe('google');

      // A second, organic-looking visit with different params.
      setLocation('https://batchlabel.xyz/?utm_source=newsletter&utm_campaign=second');
      const second = captureAttribution();

      expect(second.utm_source).toBe('google');
      expect(second.utm_campaign).toBe('first');
      expect(second.first_seen_at).toBe(first.first_seen_at);
    });

    it('marks a same-host referrer as direct', () => {
      setLocation('https://batchlabel.xyz/');
      Object.defineProperty(document, 'referrer', {
        configurable: true,
        value: 'https://batchlabel.xyz/pricing',
      });
      const record = captureAttribution();
      expect(record.referrer).toBe('direct');
    });
  });

  describe('getAttribution', () => {
    it('returns an empty record when nothing is stored', () => {
      const record = getAttribution();
      expect(record.utm_source).toBeNull();
      expect(record.first_seen_at).toBeNull();
    });

    it('prefers localStorage over the cookie', () => {
      window.localStorage.setItem(
        ATTRIBUTION_STORAGE_KEY,
        JSON.stringify({ utm_source: 'from_storage' }),
      );
      document.cookie = `${ATTRIBUTION_COOKIE_NAME}=${encodeURIComponent(
        JSON.stringify({ utm_source: 'from_cookie' }),
      )}; path=/`;

      expect(getAttribution().utm_source).toBe('from_storage');
    });

    it('falls back to the cookie when localStorage is empty', () => {
      document.cookie = `${ATTRIBUTION_COOKIE_NAME}=${encodeURIComponent(
        JSON.stringify({ utm_source: 'from_cookie' }),
      )}; path=/`;

      expect(getAttribution().utm_source).toBe('from_cookie');
    });

    it('returns an empty record for corrupt stored JSON', () => {
      window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, '{not json');
      expect(getAttribution().utm_source).toBeNull();
    });
  });

  describe('attributionForMetadata', () => {
    it('flattens the record and omits null values', () => {
      setLocation('https://batchlabel.xyz/?utm_source=google&gclid=xyz');
      captureAttribution();

      const meta = attributionForMetadata();
      expect(meta.utm_source).toBe('google');
      expect(meta.gclid).toBe('xyz');
      // Untouched fields were null, so they must not appear at all.
      expect('utm_term' in meta).toBe(false);
      expect('fbclid' in meta).toBe(false);
      // Non-null bookkeeping fields survive.
      expect(meta.first_seen_at).toBeDefined();
    });

    it('returns an empty object when nothing was captured', () => {
      expect(attributionForMetadata()).toEqual({});
    });
  });
});
