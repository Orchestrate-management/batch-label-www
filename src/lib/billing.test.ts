import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PRICES, startCheckout, openBillingPortal, CHECKOUT_ENDPOINT, PORTAL_ENDPOINT } from './billing';

/** Build a minimal Response-like object for the mocked fetch. */
function fakeResponse(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  } as unknown as Response;
}

describe('billing', () => {
  beforeEach(() => {
    window.dataLayer = [];
    window.localStorage.clear();
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { href: 'https://batchlabel.co.uk/pricing', pathname: '/pricing', search: '' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('PRICES are the published Maker figures in GBP', () => {
    expect(PRICES).toEqual({ monthly: 14, annual: 140 });
  });

  describe('startCheckout', () => {
    it('redirects to Stripe and returns no error on success', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        fakeResponse({ url: 'https://checkout.stripe.com/c/pay/cs_test_1', id: 'cs_test_1' }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const result = await startCheckout('monthly', { email: 'maker@example.com' });

      expect(result).toEqual({ error: null });
      expect(fetchMock).toHaveBeenCalledWith(CHECKOUT_ENDPOINT, expect.objectContaining({ method: 'POST' }));
      expect(window.location.href).toBe('https://checkout.stripe.com/c/pay/cs_test_1');
    });

    it('returns the server error message when the response is not ok', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(fakeResponse({ error: 'No price configured.' }, false)),
      );

      const result = await startCheckout('monthly');
      expect(result.error).toBe('No price configured.');
    });

    it('returns a friendly fallback when the response is ok but has no url', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse({}, true)));

      const result = await startCheckout('annual');
      expect(result.error).toMatch(/could not open the checkout/i);
    });

    it('returns a connection error when fetch rejects', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

      const result = await startCheckout('monthly');
      expect(result.error).toMatch(/could not reach the checkout/i);
    });

    it('fires begin_checkout before contacting the server', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse({ url: 'https://x', id: 'y' })));
      await startCheckout('annual');
      const events = (window.dataLayer ?? []) as Array<Record<string, unknown>>;
      expect(events.some((e) => e.event === 'begin_checkout' && e.value === 140)).toBe(true);
    });
  });

  describe('openBillingPortal', () => {
    it('redirects to the portal and returns no error on success', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        fakeResponse({ url: 'https://billing.stripe.com/p/session_1' }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const result = await openBillingPortal('user-1');

      expect(result).toEqual({ error: null });
      expect(fetchMock).toHaveBeenCalledWith(PORTAL_ENDPOINT, expect.objectContaining({ method: 'POST' }));
      expect(window.location.href).toBe('https://billing.stripe.com/p/session_1');
    });

    it('returns the server error message when not ok', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(fakeResponse({ error: 'No customer found.' }, false)),
      );
      const result = await openBillingPortal('user-1');
      expect(result.error).toBe('No customer found.');
    });

    it('returns a fallback error when fetch rejects', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
      const result = await openBillingPortal('user-1');
      expect(result.error).toMatch(/could not reach the billing portal/i);
    });
  });
});
