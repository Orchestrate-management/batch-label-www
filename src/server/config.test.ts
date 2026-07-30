// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { DEFAULT_BRAND, DEFAULT_SITE_URL, readServerConfig, returnUrl } from './config';

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
    expect(config.prices).toEqual({ price_m: 'maker', price_a: 'maker' });
  });

  /** SUPABASE_URL is the server-only name; VITE_SUPABASE_URL already holds the same value. */
  it('falls back to VITE_SUPABASE_URL when the server-only alias is absent', () => {
    expect(readServerConfig({ VITE_SUPABASE_URL: 'https://ref.supabase.co' }).supabaseUrl).toBe(
      'https://ref.supabase.co'
    );
  });

  it('defaults the site url and brand', () => {
    const config = readServerConfig({});
    expect(config.siteUrl).toBe(DEFAULT_SITE_URL);
    expect(config.brand).toBe(DEFAULT_BRAND);
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
