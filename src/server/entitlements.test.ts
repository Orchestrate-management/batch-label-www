// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  ENTITLING_STATUSES,
  idOf,
  invoiceSubscriptionId,
  isEntitlingStatus,
  isRenewalFailure,
  planForStatus,
  readSubscriptionPriceId,
  subscriptionInterval,
  subscriptionPeriodEnd,
  subscriptionPriceId,
  subscriptionPriceIds,
  subscriptionTrialEnd,
  toIso } from
'./entitlements';
import { FREE_PLAN } from './plan-contract';

const MAKER_PLAN = 'maker' as const;

describe('status -> entitlement', () => {
  it('treats active, trialing and past_due as entitling', () => {
    expect([...ENTITLING_STATUSES].sort()).toEqual(['active', 'past_due', 'trialing']);
  });

  it.each(['active', 'trialing', 'past_due'])('grants the paid plan while %s', (status) => {
    expect(planForStatus(status, MAKER_PLAN)).toBe(MAKER_PLAN);
  });

  /**
   * The important half. `incomplete` in particular is a subscription whose FIRST payment
   * never went through — Stripe creates the object before the card is charged, so treating
   * "a subscription exists" as "they have paid" hands out the product for free.
   */
  it.each(['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused', '', 'nonsense'])(
    'withholds the paid plan while %s',
    (status) => {
      expect(planForStatus(status, MAKER_PLAN)).toBe(FREE_PLAN);
    }
  );

  it('withholds the paid plan when the status is missing entirely', () => {
    expect(planForStatus(null, MAKER_PLAN)).toBe(FREE_PLAN);
    expect(planForStatus(undefined, MAKER_PLAN)).toBe(FREE_PLAN);
    expect(isEntitlingStatus(null)).toBe(false);
  });
});

/**
 * Price -> plan now lives in ./plan-contract.ts, and its fallback is the opposite of the one
 * that used to be here: an unrecognised price resolves to NULL rather than to Maker. See
 * plan-contract.test.ts.
 */

describe('subscriptionPeriodEnd (the API-version trap)', () => {
  const AT = 1893456000; // 2030-01-01T00:00:00Z

  it('reads the period end from subscription items (2025-03-31.basil and later)', () => {
    expect(subscriptionPeriodEnd({ items: { data: [{ current_period_end: AT }] } })).toBe(
      '2030-01-01T00:00:00.000Z'
    );
  });

  it('still reads the top-level field an older webhook API version sends', () => {
    expect(subscriptionPeriodEnd({ current_period_end: AT })).toBe('2030-01-01T00:00:00.000Z');
  });

  it('prefers the items when both shapes are present', () => {
    expect(
      subscriptionPeriodEnd({ current_period_end: 1, items: { data: [{ current_period_end: AT }] } })
    ).toBe('2030-01-01T00:00:00.000Z');
  });

  it('takes the LATEST item end, so access lasts as long as anything is paid up', () => {
    expect(
      subscriptionPeriodEnd({ items: { data: [{ current_period_end: 100 }, { current_period_end: AT }] } })
    ).toBe('2030-01-01T00:00:00.000Z');
  });

  it('returns null rather than an invalid date when neither shape is present', () => {
    expect(subscriptionPeriodEnd({})).toBeNull();
    expect(subscriptionPeriodEnd({ items: { data: [] } })).toBeNull();
    expect(subscriptionPeriodEnd({ items: { data: [{ current_period_end: null }] } })).toBeNull();
  });
});

describe('other subscription readers', () => {
  const subscription = {
    trial_end: 1893456000,
    items: { data: [{ price: { id: 'price_annual', recurring: { interval: 'year' } } }] }
  };

  it('reads the trial end, price id and interval', () => {
    expect(subscriptionTrialEnd(subscription)).toBe('2030-01-01T00:00:00.000Z');
    expect(subscriptionPriceId(subscription)).toBe('price_annual');
    expect(subscriptionInterval(subscription)).toBe('year');
  });

  it('survives an empty subscription without throwing', () => {
    expect(subscriptionTrialEnd({})).toBeNull();
    expect(subscriptionPriceId({})).toBeNull();
    expect(subscriptionInterval({})).toBeNull();
  });
});

/**
 * The tier is now derived from this price id, so a wrong answer no longer costs a redundant
 * lookup — it costs the customer the wrong product. Under the no-add-ons decision a
 * subscription we created always has exactly one item at quantity 1, so anything else means
 * the object means something this code does not model. It refuses rather than guessing.
 */
describe('readSubscriptionPriceId — refusing to guess a tier', () => {
  const item = (over: Record<string, unknown> = {}) => ({ price: { id: 'price_studio_m' }, ...over });

  it('names the price for exactly one item at quantity 1, or with no quantity at all', () => {
    expect(readSubscriptionPriceId({ items: { data: [item()] } })).toEqual({
      priceId: 'price_studio_m',
      refusal: null
    });
    expect(readSubscriptionPriceId({ items: { data: [item({ quantity: 1 })] } }).priceId).toBe('price_studio_m');
  });

  /** Quantity 3 on a Studio price reads to a human as three Studio allowances. A bare [0]
   *  read would silently grant one. */
  it('refuses a quantity that is not 1, and says why', () => {
    expect(readSubscriptionPriceId({ items: { data: [item({ quantity: 3 })] } })).toEqual({
      priceId: null,
      refusal: 'quantity_not_one'
    });
    expect(readSubscriptionPriceId({ items: { data: [item({ quantity: 0 })] } }).refusal).toBe('quantity_not_one');
  });

  it('refuses a subscription with more than one item', () => {
    expect(
      readSubscriptionPriceId({ items: { data: [item(), { price: { id: 'price_addon' } }] } }).refusal
    ).toBe('multiple_items');
  });

  it('distinguishes no items at all from an item carrying no price', () => {
    expect(readSubscriptionPriceId({ items: { data: [] } }).refusal).toBe('no_items');
    expect(readSubscriptionPriceId({}).refusal).toBe('no_items');
    expect(readSubscriptionPriceId({ items: { data: [{ price: null }] } }).refusal).toBe('no_price');
  });
});

/** The brand check must not depend on which item Stripe happened to list first. */
describe('subscriptionPriceIds', () => {
  it('returns every item price in payload order', () => {
    expect(
      subscriptionPriceIds({ items: { data: [{ price: { id: 'a' } }, { price: { id: 'b' } }] } })
    ).toEqual(['a', 'b']);
  });

  it('returns an empty list rather than throwing on an empty subscription', () => {
    expect(subscriptionPriceIds({})).toEqual([]);
  });
});

describe('toIso', () => {
  it('converts Stripe unix seconds to an ISO instant', () => {
    expect(toIso(0)).toBe('1970-01-01T00:00:00.000Z');
  });

  it('rejects anything that is not a finite number', () => {
    expect(toIso(null)).toBeNull();
    expect(toIso(undefined)).toBeNull();
    expect(toIso(Number.NaN)).toBeNull();
  });
});

describe('idOf (expandable fields)', () => {
  it('handles both the unexpanded string and the expanded object', () => {
    expect(idOf('sub_123')).toBe('sub_123');
    expect(idOf({ id: 'sub_123' })).toBe('sub_123');
  });

  it('returns null for absent or malformed values', () => {
    expect(idOf(null)).toBeNull();
    expect(idOf(undefined)).toBeNull();
    expect(idOf({} as {id?: string;})).toBeNull();
  });
});

describe('invoiceSubscriptionId (the second API-version trap)', () => {
  it('reads the modern parent.subscription_details shape', () => {
    expect(
      invoiceSubscriptionId({ parent: { subscription_details: { subscription: 'sub_new' } } })
    ).toBe('sub_new');
  });

  it('reads the legacy top-level shape', () => {
    expect(invoiceSubscriptionId({ subscription: 'sub_old' })).toBe('sub_old');
  });

  it('prefers the modern shape when an endpoint sends both', () => {
    expect(
      invoiceSubscriptionId({
        subscription: 'sub_old',
        parent: { subscription_details: { subscription: 'sub_new' } }
      })
    ).toBe('sub_new');
  });

  it('returns null for a one-off invoice with no subscription at all', () => {
    expect(invoiceSubscriptionId({ parent: null })).toBeNull();
    expect(invoiceSubscriptionId({})).toBeNull();
  });
});

describe('isRenewalFailure', () => {
  it('is true for a failed renewal', () => {
    expect(isRenewalFailure({ billing_reason: 'subscription_cycle' })).toBe(true);
    expect(isRenewalFailure({ billing_reason: 'subscription_update' })).toBe(true);
  });

  /** A failed FIRST charge is not a lapsed customer; it is somebody who never subscribed. */
  it('is false for the first invoice of a new subscription', () => {
    expect(isRenewalFailure({ billing_reason: 'subscription_create' })).toBe(false);
    expect(isRenewalFailure({ billing_reason: null })).toBe(false);
    expect(isRenewalFailure({})).toBe(false);
  });
});
