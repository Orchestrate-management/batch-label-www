// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { ATTRIBUTION_KEYS, checkoutMetadata, resolveInterval, sanitiseAttribution } from './checkout';
import { MAKER_PLAN } from './entitlements';

describe('resolveInterval', () => {
  it('accepts annual', () => {
    expect(resolveInterval('annual')).toBe('annual');
  });

  it('treats anything else as monthly rather than trusting the string', () => {
    expect(resolveInterval('monthly')).toBe('monthly');
    expect(resolveInterval('ANNUAL')).toBe('monthly');
    expect(resolveInterval(undefined)).toBe('monthly');
    expect(resolveInterval({ toString: () => 'annual' })).toBe('monthly');
  });
});

describe('sanitiseAttribution', () => {
  it('keeps the known first-touch keys', () => {
    const result = sanitiseAttribution({
      utm_source: 'google',
      utm_medium: 'cpc',
      gclid: 'abc123',
      referrer: 'direct'
    });
    expect(result).toEqual({
      utm_source: 'google',
      utm_medium: 'cpc',
      gclid: 'abc123',
      referrer: 'direct'
    });
  });

  it('drops keys that are not part of the attribution record', () => {
    const result = sanitiseAttribution({
      utm_source: 'google',
      supabase_user_id: '11111111-1111-4111-8111-111111111111',
      plan: 'enterprise',
      brand: 'someone-elses-brand'
    });
    expect(result).toEqual({ utm_source: 'google' });
  });

  it('truncates long values so a hostile body cannot break Stripe metadata limits', () => {
    const result = sanitiseAttribution({ utm_campaign: 'x'.repeat(5000) });
    expect(result.utm_campaign.length).toBe(480);
  });

  it('ignores non-string and empty values', () => {
    expect(sanitiseAttribution({ gclid: 42, fbclid: '   ', wbraid: null })).toEqual({});
  });

  it('returns an empty object for anything that is not a plain object', () => {
    expect(sanitiseAttribution(null)).toEqual({});
    expect(sanitiseAttribution('utm_source=google')).toEqual({});
    expect(sanitiseAttribution(['utm_source'])).toEqual({});
  });

  it('covers exactly the keys src/lib/attribution.ts produces', () => {
    expect(ATTRIBUTION_KEYS).toContain('gbraid');
    expect(ATTRIBUTION_KEYS).toContain('wbraid');
    expect(ATTRIBUTION_KEYS).toContain('first_seen_at');
    expect(ATTRIBUTION_KEYS).toContain('landing_path');
  });
});

describe('checkoutMetadata', () => {
  const base = {
    userId: '11111111-1111-4111-8111-111111111111',
    brand: 'batchlabel',
    interval: 'annual' as const,
    plan: MAKER_PLAN,
    attribution: { utm_source: 'google', gclid: 'abc' }
  };

  it('carries the identity, brand, plan and interval the webhook needs', () => {
    expect(checkoutMetadata(base)).toEqual({
      supabase_user_id: '11111111-1111-4111-8111-111111111111',
      brand: 'batchlabel',
      plan: 'maker',
      billing_interval: 'annual',
      utm_source: 'google',
      gclid: 'abc'
    });
  });

  /**
   * Stripe rejects null metadata values, and an EMPTY supabase_user_id would read as
   * "linked to nobody" downstream while looking like a populated field.
   */
  it('omits supabase_user_id entirely for an anonymous checkout', () => {
    const metadata = checkoutMetadata({ ...base, userId: null });
    expect('supabase_user_id' in metadata).toBe(false);
    expect(metadata.brand).toBe('batchlabel');
  });

  it('cannot have its brand or plan overwritten by the attribution blob', () => {
    const metadata = checkoutMetadata({
      ...base,
      attribution: { brand: 'other-brand', plan: 'enterprise', utm_source: 'google' }
    });
    expect(metadata.brand).toBe('batchlabel');
    expect(metadata.plan).toBe('maker');
  });

  /**
   * The above passes today only because ATTRIBUTION_KEYS happens to contain no key called
   * `brand`. This asserts the structural property instead: the trusted block wins even for
   * a key the allow-list DOES pass through, so adding a marketing field named `brand` later
   * cannot quietly hand a request body control of the tenant the webhook writes to.
   */
  it('the trusted block wins even for a key the attribution allow-list accepts', () => {
    const metadata = checkoutMetadata({
      ...base,
      // utm_source IS on the allow-list, so this proves the spread order, not the filter.
      attribution: { utm_source: 'google', supabase_user_id: 'someone-else' }
    });
    expect(metadata.utm_source).toBe('google');
    expect(metadata.supabase_user_id).toBe('11111111-1111-4111-8111-111111111111');
  });
});
