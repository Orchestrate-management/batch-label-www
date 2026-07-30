import { describe, it, expect, beforeEach } from 'vitest';
import {
  sha256,
  trackPageView,
  trackViewPricing,
  trackCtaClick,
  trackBeginCheckout,
  trackPurchaseRedirect,
  trackSignUpCompleted,
  trackSignUpStarted,
} from './analytics';
import { ATTRIBUTION_STORAGE_KEY } from './attribution';

type DataLayerEntry = Record<string, unknown>;

/**
 * The last event object on the dataLayer.
 *
 * dataLayer has two writers now: our own `{ event, ... }` records, and gtag, which uses
 * the same array as its command queue and pushes an `arguments` object per call. Taking
 * the literal last element would pick up gtag's command, so this skips anything
 * array-like and looks for our record.
 */
function lastEvent(): DataLayerEntry {
  const layer = (window.dataLayer ?? []) as DataLayerEntry[];
  for (let i = layer.length - 1; i >= 0; i--) {
    const entry = layer[i];
    const isGtagCommand =
    typeof entry === 'object' && entry !== null && typeof (entry as unknown as ArrayLike<unknown>).length === 'number';
    if (!isGtagCommand && typeof entry?.event === 'string') return entry;
  }
  return {} as DataLayerEntry;
}

/** The GA4 commands gtag queued, so a test can assert the event actually reports. */
function gtagCommands(): unknown[][] {
  const layer = (window.dataLayer ?? []) as unknown[];
  return layer.
  filter((e) => typeof e === 'object' && e !== null && typeof (e as ArrayLike<unknown>).length === 'number').
  map((e) => Array.from(e as ArrayLike<unknown>));
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

  /**
   * There is no tag manager in front of GA4, so a dataLayer push on its own reports
   * nothing. Every event has to reach gtag too. These guard the bridge, because losing
   * it fails silently — the site would look instrumented and record nothing.
   */
  describe('GA4 bridge', () => {
    it('sends every event to gtag, not only to the dataLayer', () => {
      trackCtaClick('Make a label free', 'hero');
      const events = gtagCommands().filter((c) => c[0] === 'event');
      expect(events).toHaveLength(1);
      expect(events[0][1]).toBe('cta_click');
      expect(events[0][2]).toMatchObject({
        cta_label: 'Make a label free',
        cta_location: 'hero',
      });
    });

    it('drops null and undefined params, which GA4 ignores but still counts', async () => {
      await trackSignUpCompleted('password', 'maker@example.com');
      const event = gtagCommands().find((c) => c[1] === 'sign_up_completed');
      expect(event).toBeDefined();
      const params = event![2] as Record<string, unknown>;
      expect('user_id' in params).toBe(false);
      expect(Object.values(params).every((v) => v !== null && v !== undefined)).toBe(true);
      // The dataLayer record keeps the full shape, nulls included.
      expect(lastEvent()).toMatchObject({ user_id: null });
    });

    it('sends page_location so GA4 can attribute the route, since send_page_view is off', () => {
      trackPageView('/pricing', 'Pricing');
      const event = gtagCommands().find((c) => c[1] === 'page_view');
      expect(event![2]).toMatchObject({
        page_path: '/pricing',
        page_location: 'https://batchlabel.co.uk/pricing',
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

    it('accepts google as a method, for the OAuth completion step', async () => {
      await trackSignUpCompleted('google', 'maker@example.com', 'user-1', true, false);
      expect(lastEvent()).toMatchObject({
        event: 'sign_up_completed',
        method: 'google',
        marketing_email_opt_in: true,
        advertising_opt_in: false,
      });
    });
  });

  describe('trackSignUpStarted', () => {
    it('records which route the signup started from', () => {
      trackSignUpStarted('google');
      expect(lastEvent()).toMatchObject({ event: 'sign_up_started', method: 'google' });
    });
  });
});
