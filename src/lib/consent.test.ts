import { describe, it, expect, beforeEach } from 'vitest';
import {
  getStoredConsent,
  saveConsent,
  advertisingConsentFromBanner,
  CONSENT_STORAGE_KEY } from
'./consent';

describe('consent', () => {
  beforeEach(() => {
    window.dataLayer = [];
    window.localStorage.clear();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { protocol: 'https:', href: 'https://batchlabel.co.uk/' },
    });
  });

  describe('getStoredConsent', () => {
    it('returns null when nothing is stored', () => {
      expect(getStoredConsent()).toBeNull();
    });

    it('parses a valid stored record', () => {
      window.localStorage.setItem(
        CONSENT_STORAGE_KEY,
        JSON.stringify({ analytics: true, marketing: false, decided_at: '2026-01-01', version: 1 }),
      );
      const stored = getStoredConsent();
      expect(stored).toMatchObject({ analytics: true, marketing: false });
    });

    it('returns null for malformed JSON', () => {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, 'not-json');
      expect(getStoredConsent()).toBeNull();
    });

    it('returns null when the shape is invalid (non-boolean flags)', () => {
      window.localStorage.setItem(
        CONSENT_STORAGE_KEY,
        JSON.stringify({ analytics: 'yes', marketing: 1 }),
      );
      expect(getStoredConsent()).toBeNull();
    });
  });

  describe('saveConsent', () => {
    it('persists the choice and returns the full record', () => {
      const record = saveConsent({ analytics: true, marketing: true });

      expect(record).toMatchObject({ analytics: true, marketing: true, version: 1 });
      expect(record.decided_at).toEqual(expect.any(String));

      const roundTripped = getStoredConsent();
      expect(roundTripped).toMatchObject({ analytics: true, marketing: true });
    });

    it('writes a consent_update event to the dataLayer', () => {
      saveConsent({ analytics: false, marketing: true });
      const events = (window.dataLayer ?? []) as Array<Record<string, unknown>>;
      expect(
        events.some(
          (e) => e.event === 'consent_update' && e.consent_analytics === false && e.consent_marketing === true,
        ),
      ).toBe(true);
    });

    it('also mirrors the choice into a cookie', () => {
      saveConsent({ analytics: true, marketing: false });
      expect(document.cookie).toContain('bl_consent=');
    });
  });

  describe('advertisingConsentFromBanner (the single source of truth)', () => {
    it('is false before anyone has answered the banner, matching the denied default', () => {
      expect(advertisingConsentFromBanner()).toBe(false);
    });

    it('is true once marketing cookies are accepted', () => {
      saveConsent({ analytics: false, marketing: true });
      expect(advertisingConsentFromBanner()).toBe(true);
    });

    it('is false once they are rejected', () => {
      saveConsent({ analytics: true, marketing: false });
      expect(advertisingConsentFromBanner()).toBe(false);
    });

    it('follows marketing, not analytics: they are different purposes', () => {
      saveConsent({ analytics: true, marketing: false });
      expect(advertisingConsentFromBanner()).toBe(false);
      saveConsent({ analytics: false, marketing: true });
      expect(advertisingConsentFromBanner()).toBe(true);
    });

    it('is false when the stored record is unreadable, rather than assuming yes', () => {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, 'not-json');
      expect(advertisingConsentFromBanner()).toBe(false);
    });
  });
});
