// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { DEFAULT_APP_URL, DEFAULT_BRAND, DEFAULT_SITE_URL, readServerConfig, returnUrl } from './config';

describe('readServerConfig', () => {
  it('reads the Stripe and Supabase server secrets', () => {
    const config = readServerConfig({
      STRIPE_SECRET_KEY: 'sk_live_x',
      STRIPE_WEBHOOK_SECRET: 'whsec_x',
      STRIPE_PRICE_MAKER_MONTHLY: 'price_m',
      STRIPE_PRICE_MAKER_ANNUAL: 'price_a',
      SUPABASE_URL: 'https://ref.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service_role_x'
    });

    expect(config.stripeSecretKey).toBe('sk_live_x');
    expect(config.stripeWebhookSecret).toBe('whsec_x');
    expect(config.supabaseUrl).toBe('https://ref.supabase.co');
    expect(config.serviceRoleKey).toBe('service_role_x');
    expect(config.priceIndex.get('price_m')).toEqual({ slug: 'maker', interval: 'monthly' });
    expect(config.priceIndex.get('price_a')).toEqual({ slug: 'maker', interval: 'annual' });
  });

  /** The catastrophic env misconfiguration must kill the deploy on the first request rather
   *  than sell a paid tier for a penny on the thousandth. */
  it('throws when two contract entries point at the same Stripe price id', () => {
    expect(() =>
    readServerConfig({ STRIPE_PRICE_MAKER_MONTHLY: 'price_x', STRIPE_PRICE_RAIL_TEST_MONTHLY: 'price_x' })
    ).toThrow(/price_x/);
  });

  it('carries the raw env so a tier resolves through the same object the index was built from', () => {
    const env = { STRIPE_PRICE_STUDIO_ANNUAL: 'price_studio_a' };
    expect(readServerConfig(env).env).toBe(env);
  });

  /** Two independent gates on the penny price. The flag is the second one. */
  it('leaves rail-test checkout off unless the flag is exactly the string true', () => {
    expect(readServerConfig({}).allowRailTestCheckout).toBe(false);
    expect(readServerConfig({ ALLOW_RAIL_TEST_CHECKOUT: 'false' }).allowRailTestCheckout).toBe(false);
    expect(readServerConfig({ ALLOW_RAIL_TEST_CHECKOUT: '1' }).allowRailTestCheckout).toBe(false);
    expect(readServerConfig({ ALLOW_RAIL_TEST_CHECKOUT: 'true' }).allowRailTestCheckout).toBe(true);
  });

  it('reads the rail-test price id and the portal configuration', () => {
    const config = readServerConfig({
      STRIPE_PRICE_RAIL_TEST_MONTHLY: 'price_penny',
      STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_test'
    });
    expect(config.railTestPriceId).toBe('price_penny');
    expect(config.portalConfigurationId).toBe('bpc_test');
    expect(readServerConfig({}).portalConfigurationId).toBeUndefined();
  });

  /** SUPABASE_URL is the server-only name; VITE_SUPABASE_URL already holds the same value. */
  it('falls back to VITE_SUPABASE_URL when the server-only alias is absent', () => {
    expect(readServerConfig({ VITE_SUPABASE_URL: 'https://ref.supabase.co' }).supabaseUrl).toBe(
      'https://ref.supabase.co'
    );
  });

  it('defaults the site url, the app url and the brand', () => {
    const config = readServerConfig({});
    expect(config.siteUrl).toBe(DEFAULT_SITE_URL);
    expect(config.appUrl).toBe(DEFAULT_APP_URL);
    expect(config.brand).toBe(DEFAULT_BRAND);
  });

  /** Billing lands in the app, so the app url is the origin Stripe returns to. VITE_APP_URL
   *  is what the client handoff already uses, and the two must never point at different
   *  apps. */
  it('takes the app url from either alias and trims a trailing slash', () => {
    expect(readServerConfig({ VITE_APP_URL: 'https://app.local:3000/' }).appUrl).toBe('https://app.local:3000');
    expect(
      readServerConfig({ APP_URL: 'https://app.example', VITE_APP_URL: 'https://other.example' }).appUrl
    ).toBe('https://app.example');
  });

  it('trims a trailing slash off SITE_URL so return urls never double up', () => {
    expect(readServerConfig({ SITE_URL: 'https://www.batchlabel.xyz/' }).siteUrl).toBe(
      'https://www.batchlabel.xyz'
    );
  });

  it('takes the brand from the deployment, not from any request', () => {
    expect(readServerConfig({ VITE_ORCHESTRATE_BRAND: ' otherbrand ' }).brand).toBe('otherbrand');
    expect(readServerConfig({ VITE_ORCHESTRATE_BRAND: '  ' }).brand).toBe(DEFAULT_BRAND);
  });
});

describe('returnUrl', () => {
  const FALLBACK = 'https://www.batchlabel.xyz';

  it('returns to the origin that started the checkout', () => {
    expect(returnUrl('https://app.batchlabel.xyz', '/billing/done', FALLBACK, '/checkout/success')).toBe(
      'https://app.batchlabel.xyz/billing/done'
    );
  });

  it('falls back to the site url when there is no trusted origin', () => {
    expect(returnUrl(null, undefined, FALLBACK, '/checkout/success')).toBe(
      'https://www.batchlabel.xyz/checkout/success'
    );
  });

  /**
   * A Checkout success_url is a redirect target. An unchecked path is an open redirect with
   * our brand on it, and '//evil.example' is the one that catches people out: browsers treat
   * a protocol-relative URL as a different origin entirely.
   */
  it('refuses an absolute url, a protocol-relative url or a relative path', () => {
    const cases = ['https://evil.example', '//evil.example', 'evil.example', '', '   '];
    for (const path of cases) {
      expect(returnUrl('https://app.batchlabel.xyz', path, FALLBACK, '/checkout/success')).toBe(
        'https://app.batchlabel.xyz/checkout/success'
      );
    }
  });

  it('refuses a non-string path', () => {
    expect(
      returnUrl('https://app.batchlabel.xyz', undefined, FALLBACK, '/checkout/cancelled')
    ).toBe('https://app.batchlabel.xyz/checkout/cancelled');
  });
});
