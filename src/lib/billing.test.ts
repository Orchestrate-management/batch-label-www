import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PRICES, startCheckout, openBillingPortal, CHECKOUT_ENDPOINT, PORTAL_ENDPOINT } from './billing';

const mocks = vi.hoisted(() => ({
  session: { access_token: 'the.access.token' } as {access_token: string;} | null
}));

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: mocks.session } })
    }
  },
  isSupabaseConfigured: true,
  MISSING_CONFIG_MESSAGE: 'not connected'
}));

/** Build a minimal Response-like object for the mocked fetch. */
function fakeResponse(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body
  } as unknown as Response;
}

/** The options object the code passed to fetch on its most recent call. */
function lastRequest(fetchMock: ReturnType<typeof vi.fn>) {
  const [, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string, RequestInit];
  return {
    headers: (init.headers ?? {}) as Record<string, string>,
    body: JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>
  };
}

describe('billing', () => {
  beforeEach(() => {
    window.dataLayer = [];
    window.localStorage.clear();
    mocks.session = { access_token: 'the.access.token' };
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { href: 'https://batchlabel.co.uk/pricing', pathname: '/pricing', search: '' }
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
        fakeResponse({ url: 'https://checkout.stripe.com/c/pay/cs_test_1', id: 'cs_test_1' })
      );
      vi.stubGlobal('fetch', fetchMock);

      const result = await startCheckout('monthly');

      expect(result).toEqual({ error: null });
      expect(fetchMock).toHaveBeenCalledWith(CHECKOUT_ENDPOINT, expect.objectContaining({ method: 'POST' }));
      expect(window.location.href).toBe('https://checkout.stripe.com/c/pay/cs_test_1');
    });

    it('sends the Supabase access token so the server can derive the identity', async () => {
      const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ url: 'https://x', id: 'y' }));
      vi.stubGlobal('fetch', fetchMock);

      await startCheckout('monthly');

      expect(lastRequest(fetchMock).headers.Authorization).toBe('Bearer the.access.token');
    });

    /**
     * The security property, asserted rather than assumed: the browser no longer states who
     * it is. It used to post `user_id`, which anyone could edit in devtools to put a
     * subscription on somebody else's account.
     */
    it('sends no user id or email in the body', async () => {
      const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ url: 'https://x', id: 'y' }));
      vi.stubGlobal('fetch', fetchMock);

      await startCheckout('annual');

      const { body } = lastRequest(fetchMock);
      expect(body).not.toHaveProperty('user_id');
      expect(body).not.toHaveProperty('email');
      expect(body.interval).toBe('annual');
      expect(body).toHaveProperty('attribution');
    });

    /**
     * The endpoint allow-lists the tier and 400s without one, so a caller that forgets it
     * cannot sell anything. It also carries no price, amount or currency — the tier only
     * names which server-only env var holds the price id.
     */
    it('sends the tier, and no price, amount or currency', async () => {
      const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ url: 'https://x', id: 'y' }));
      vi.stubGlobal('fetch', fetchMock);

      await startCheckout('monthly', 'studio');

      const { body } = lastRequest(fetchMock);
      expect(body.tier).toBe('studio');
      for (const forbidden of ['price', 'price_id', 'amount', 'currency', 'plan', 'brand']) {
        expect(body).not.toHaveProperty(forbidden);
      }
    });

    it('defaults to the one tier www itself sells rather than omitting the field', async () => {
      const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ url: 'https://x', id: 'y' }));
      vi.stubGlobal('fetch', fetchMock);

      await startCheckout('monthly');

      expect(lastRequest(fetchMock).body.tier).toBe('maker');
    });

    /**
     * Checkout requires a session, and that is a security decision as much as a product
     * one: selling to a signed-out visitor forced the webhook to work out afterwards who
     * had paid, and the only thing it had for that was the email typed into Stripe
     * Checkout — which was exploitable, because profiles.email is user-writable.
     */
    it('refuses to open checkout with no session, and does not call the server', async () => {
      mocks.session = null;
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const result = await startCheckout('monthly');

      expect(result.error).toMatch(/sign in/i);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not fire begin_checkout when there is no session to check out with', async () => {
      mocks.session = null;
      vi.stubGlobal('fetch', vi.fn());

      await startCheckout('annual');

      const events = (window.dataLayer ?? []) as Array<Record<string, unknown>>;
      expect(events.some((e) => e.event === 'begin_checkout')).toBe(false);
    });

    it('surfaces the server refusal when the caller already has a subscription', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          fakeResponse({ error: 'You are already on the Maker plan. Use Manage billing...' }, false)
        )
      );
      const result = await startCheckout('monthly');
      expect(result.error).toMatch(/already on the Maker plan/i);
    });

    it('returns the server error message when the response is not ok', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(fakeResponse({ error: 'No price configured.' }, false))
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
        fakeResponse({ url: 'https://billing.stripe.com/p/session_1' })
      );
      vi.stubGlobal('fetch', fetchMock);

      const result = await openBillingPortal();

      expect(result).toEqual({ error: null });
      expect(fetchMock).toHaveBeenCalledWith(PORTAL_ENDPOINT, expect.objectContaining({ method: 'POST' }));
      expect(window.location.href).toBe('https://billing.stripe.com/p/session_1');
    });

    it('sends the access token and no user id', async () => {
      const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ url: 'https://billing.stripe.com/p/1' }));
      vi.stubGlobal('fetch', fetchMock);

      await openBillingPortal();

      const { headers, body } = lastRequest(fetchMock);
      expect(headers.Authorization).toBe('Bearer the.access.token');
      expect(body).not.toHaveProperty('user_id');
    });

    /**
     * A portal session URL exposes cards, addresses and invoices, so there is no anonymous
     * path to one. Without a session we do not even make the request.
     */
    it('refuses to ask for a portal session when there is no session', async () => {
      mocks.session = null;
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const result = await openBillingPortal();

      expect(result.error).toMatch(/sign in again/i);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns the server error message when not ok', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(fakeResponse({ error: 'No customer found.' }, false))
      );
      const result = await openBillingPortal();
      expect(result.error).toBe('No customer found.');
    });

    it('returns a fallback error when fetch rejects', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
      const result = await openBillingPortal();
      expect(result.error).toMatch(/could not reach the billing portal/i);
    });
  });
});
