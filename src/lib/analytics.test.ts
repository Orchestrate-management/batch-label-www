import { describe, it, expect, beforeEach } from 'vitest';
import {
  sha256,
  trackPageView,
  trackViewPricing,
  trackCtaClick,
  trackBeginCheckout,
  trackPurchaseRedirect,
  trackSignUpCompleted,
} from './analytics';
import { ATTRIBUTION_STORAGE_KEY } from './attribution';

type DataLayerEntry = Record<string, unknown>;

function lastEvent(): DataLayerEntry {
  const layer = (window.dataLayer ?? []) as DataLayerEntry[];
  return layer[layer.length - 1];
}

describe('analytics', () => {
  beforeEach(() => {
    window.dataLayer = [];
    window.localStorage.clear();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { pathname: '/pricing', search: '', href: 'https://batchlabel.co.uk/pricing' },
    });
  });

  describe('sha256', () => {
    it('produces the correct lowercase hex digest', async () => {
      // Known SHA-256 of the ASCII string "test".
      expect(await sha256('test')).toBe(
        '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      );
    });

    it('is deterministic and 64 hex chars long', async () => {
      const a = await sha256('user@example.com');
      const b = await sha256('user@example.com');
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{64}$/);
    });

    it('returns null for an empty value', async () => {
      expect(await sha256('')).toBeNull();
    });
  });

  describe('dataLayer push helpers', () => {
    it('trackPageView pushes a page_view with path and title', () => {
      trackPageView('/how-it-works', 'How it works');
      expect(lastEvent()).toMatchObject({
        event: 'page_view',
        page_path: '/how-it-works',
        page_title: 'How it works',
      });
    });

    it('trackViewPricing pushes view_pricing with the path', () => {
      trackViewPricing('/pricing');
      expect(lastEvent()).toMatchObject({ event: 'view_pricing', page_path: '/pricing' });
    });

    it('trackCtaClick includes label, location and the current page path', () => {
      trackCtaClick('Start free', 'hero');
      expect(lastEvent()).toMatchObject({
        event: 'cta_click',
        cta_label: 'Start free',
        cta_location: 'hero',
        page_path: '/pricing',
      });
    });

    it('trackBeginCheckout shapes the ecommerce payload in GBP', () => {
      trackBeginCheckout('annual', 140);
      expect(lastEvent()).toMatchObject({
        event: 'begin_checkout',
        plan: 'maker',
        interval: 'annual',
        value: 140,
        currency: 'GBP',
      });
    });

    it('trackPurchaseRedirect carries the checkout session id', () => {
      trackPurchaseRedirect('monthly', 14, 'cs_test_123');
      expect(lastEvent()).toMatchObject({
        event: 'purchase_redirect',
        plan: 'maker',
        interval: 'monthly',
        value: 14,
        currency: 'GBP',
        checkout_session_id: 'cs_test_123',
      });
    });

    it('stamps first-touch attribution onto every event', () => {
      window.localStorage.setItem(
        ATTRIBUTION_STORAGE_KEY,
        JSON.stringify({ utm_source: 'google', utm_medium: 'cpc', gclid: 'g1', fbclid: 'f1' }),
      );
      trackPageView('/', 'Home');
      expect(lastEvent()).toMatchObject({
        attr_source: 'google',
        attr_medium: 'cpc',
        attr_gclid: 'g1',
        attr_fbclid: 'f1',
      });
    });
  });

  describe('trackSignUpCompleted', () => {
    it('hashes a normalised (trimmed, lowercased) email', async () => {
      await trackSignUpCompleted('password', '  USER@Example.COM  ', 'user-1');
      const expected = await sha256('user@example.com');
      expect(lastEvent()).toMatchObject({
        event: 'sign_up_completed',
        method: 'password',
        user_id: 'user-1',
        em_sha256: expected,
      });
    });

    it('defaults user_id to null when absent', async () => {
      await trackSignUpCompleted('magic_link', 'a@b.com');
      expect(lastEvent().user_id).toBeNull();
    });
  });
});
