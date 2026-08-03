// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  ATTRIBUTION_KEYS,
  checkoutMetadata,
  resolveInterval,
  sanitiseAttribution,
  railTestAllowedFor,
  railTestRequested,
  resolveTier,
  sanitiseMetaCookies } from
'./checkout';
import { PAID_TIERS } from './plan-contract';

const MAKER_PLAN = 'maker' as const;

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

/**
 * The tier is allow-listed and never coerced, while the interval directly above it IS
 * coerced. That asymmetry is deliberate: guessing the interval wrong costs a billing period
 * the portal fixes in one click; guessing the tier wrong sells the customer a different
 * product at a different price with a different allowance.
 */
describe('resolveTier', () => {
  it('accepts each purchasable tier exactly as written', () => {
    for (const tier of PAID_TIERS) expect(resolveTier(tier)).toBe(tier);
  });

  it('returns null rather than coercing anything else to a tier', () => {
    const rejected = [undefined, null, '', '   ', 'Maker', 'MAKER', 'makerr', {}, [], 0, 1, true];
    for (const value of rejected) expect(resolveTier(value)).toBeNull();
  });

  /** 'free' has no Stripe price to sell — it is the ABSENCE of a subscription. */
  it('refuses free, which is not a thing that can be bought', () => {
    expect(resolveTier('free')).toBeNull();
  });

  /**
   * Half of the pair that makes the £0.01 exploit unrepresentable: a `tier` request can
   * never resolve to the penny price. The other half is that railTest cannot select a paid
   * one.
   */
  it('refuses rail_test, which is requested through a different field entirely', () => {
    expect(resolveTier('rail_test')).toBeNull();
    expect(resolveTier(' rail_test ')).toBeNull();
  });

  it('trims surrounding whitespace on an otherwise valid tier', () => {
    expect(resolveTier('  studio  ')).toBe('studio');
  });
});

describe('railTestRequested', () => {
  it('honours nothing but a real boolean true', () => {
    expect(railTestRequested(true)).toBe(true);
    for (const value of ['true', 1, {}, 'rail_test', undefined, null, false]) {
      expect(railTestRequested(value)).toBe(false);
    }
  });
});

describe('railTestAllowedFor', () => {
  const ALLOWED = ['rhys@orchestrate.management'];

  it('lets a listed address through', () => {
    expect(railTestAllowedFor('rhys@orchestrate.management', ALLOWED)).toBe(true);
  });

  it('refuses everybody else', () => {
    expect(railTestAllowedFor('someone@example.com', ALLOWED)).toBe(false);
    expect(railTestAllowedFor('maker@candles.co.uk', ALLOWED)).toBe(false);
  });

  it('is case-insensitive and tolerates stray whitespace', () => {
    // Email case is not significant, and a space in an env var is not a security decision
    // anybody meant to make.
    expect(railTestAllowedFor('  Rhys@Orchestrate.Management  ', ALLOWED)).toBe(true);
    expect(railTestAllowedFor('RHYS@ORCHESTRATE.MANAGEMENT', ALLOWED)).toBe(true);
  });

  it('refuses when there is no email at all', () => {
    // A token that carries no email must not be treated as a match against anything.
    for (const value of [null, undefined, '', '   ']) {
      expect(railTestAllowedFor(value, ALLOWED)).toBe(false);
    }
  });

  it('refuses everyone when the allow-list is empty', () => {
    // The default state of production. An unset env var must authorise nobody rather than
    // everybody — the failure that matters is a 30p price open to every customer.
    expect(railTestAllowedFor('rhys@orchestrate.management', [])).toBe(false);
  });

  it('does not match on a substring or a lookalike domain', () => {
    expect(railTestAllowedFor('rhys@orchestrate.management.evil.com', ALLOWED)).toBe(false);
    expect(railTestAllowedFor('notrhys@orchestrate.management', ALLOWED)).toBe(false);
    expect(railTestAllowedFor('rhys@orchestrate.managemen', ALLOWED)).toBe(false);
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

/**
 * Meta's own cookies, on their way to the server-side Purchase event.
 *
 * These arrive in a request body, so they are claims. Without validation a caller could put
 * arbitrary text into our Stripe metadata and, from there, into a Meta event attributed to
 * our dataset — or simply blow Stripe's 500-character metadata limit and turn a paid
 * checkout into a 400.
 */
describe('sanitiseMetaCookies', () => {
  it('keeps well-formed _fbp and _fbc values', () => {
    expect(
      sanitiseMetaCookies({
        fbp: 'fb.1.1767225600000.1234567890',
        fbc: 'fb.1.1767225600000.IwAR0abc'
      })
    ).toEqual({
      fbp: 'fb.1.1767225600000.1234567890',
      fbc: 'fb.1.1767225600000.IwAR0abc'
    });
  });

  it('drops anything that is not the documented cookie shape', () => {
    expect(sanitiseMetaCookies({ fbp: 'nonsense', fbc: 'also nonsense' })).toEqual({});
    expect(sanitiseMetaCookies({ fbp: '<script>alert(1)</script>' })).toEqual({});
    expect(sanitiseMetaCookies({ fbp: 'fb.1.notatimestamp.123' })).toEqual({});
  });

  it('drops an over-long value rather than letting Stripe reject the whole checkout', () => {
    expect(sanitiseMetaCookies({ fbc: `fb.1.1767225600000.${'a'.repeat(600)}` })).toEqual({});
  });

  it('ignores non-object input', () => {
    expect(sanitiseMetaCookies(null)).toEqual({});
    expect(sanitiseMetaCookies('fb.1.1.1')).toEqual({});
    expect(sanitiseMetaCookies([1, 2, 3])).toEqual({});
    expect(sanitiseMetaCookies(undefined)).toEqual({});
  });

  it('keeps whichever half is valid', () => {
    expect(sanitiseMetaCookies({ fbp: 'fb.1.1767225600000.99', fbc: 'junk' })).toEqual({
      fbp: 'fb.1.1767225600000.99'
    });
  });
});

describe('checkoutMetadata: the Meta cookies', () => {
  const base = {
    userId: '11111111-1111-4111-8111-111111111111',
    brand: 'batchlabel',
    interval: 'monthly' as const,
    plan: MAKER_PLAN,
    attribution: {}
  };

  it('writes fbp and fbc so the webhook can match the server event to the browser', () => {
    const metadata = checkoutMetadata({
      ...base,
      meta: { fbp: 'fb.1.1767225600000.99', fbc: 'fb.1.1767225600000.IwAR0abc' }
    });
    expect(metadata.fbp).toBe('fb.1.1767225600000.99');
    expect(metadata.fbc).toBe('fb.1.1767225600000.IwAR0abc');
  });

  it('omits them entirely when there were none — the no-consent case', () => {
    // The Pixel never loaded, so the cookies never existed. Nothing to carry.
    const metadata = checkoutMetadata({ ...base, meta: {} });
    expect(metadata).not.toHaveProperty('fbp');
    expect(metadata).not.toHaveProperty('fbc');
  });

  it('omits them when the caller passes no meta block at all', () => {
    expect(checkoutMetadata(base)).not.toHaveProperty('fbp');
  });

  it('cannot be overridden by an attribution key of the same name', () => {
    const metadata = checkoutMetadata({
      ...base,
      attribution: { fbp: 'attacker', fbc: 'attacker' },
      meta: { fbp: 'fb.1.1767225600000.99' }
    });
    // `fbp` and `fbc` are not on ATTRIBUTION_KEYS, and the trusted block spreads last.
    expect(metadata.fbp).toBe('fb.1.1767225600000.99');
    expect(metadata.fbc).toBeUndefined();
  });

  it('stays inside Stripe s 50-key metadata limit with everything populated', () => {
    const attribution = Object.fromEntries(ATTRIBUTION_KEYS.map((k) => [k, 'x']));
    const metadata = checkoutMetadata({
      ...base,
      attribution,
      meta: { fbp: 'fb.1.1767225600000.99', fbc: 'fb.1.1767225600000.IwAR0abc' }
    });
    expect(Object.keys(metadata).length).toBeLessThanOrEqual(50);
    Object.entries(metadata).forEach(([key, value]) => {
      expect(key.length).toBeLessThanOrEqual(40);
      expect(String(value).length).toBeLessThanOrEqual(500);
    });
  });
});
