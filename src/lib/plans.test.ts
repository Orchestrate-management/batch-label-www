import { describe, it, expect } from 'vitest';
import {
  CONSULTANT,
  LADDER,
  PLANS,
  PUBLIC_PLANS,
  SKU_DEFINITION,
  approximateScents,
  gbpNumeral,
  priceBare,
  priceForInterval,
  priceWithInterval,
  skuAllowance
} from './plans';

/**
 * This file is the one place on www where a plan number may be typed by a human, because
 * typing it here is the assertion. Everywhere else reads it from the projection.
 */
describe('the ladder', () => {
  it('matches the decided amounts, in pence, exclusive of VAT', () => {
    expect(PLANS.free.monthlyPence).toBeNull();
    expect(PLANS.free.annualPence).toBeNull();
    expect([PLANS.maker.monthlyPence, PLANS.maker.annualPence]).toEqual([1400, 14000]);
    expect([PLANS.studio.monthlyPence, PLANS.studio.annualPence]).toEqual([3500, 35000]);
    expect([PLANS.consultant.monthlyPence, PLANS.consultant.annualPence]).toEqual([19900, 199000]);
  });

  it('matches the decided SKU allowances', () => {
    expect(PLANS.free.skus).toBe(3);
    expect(PLANS.maker.skus).toBe(45);
    expect(PLANS.studio.skus).toBe(180);
    expect(PLANS.consultant.skusUnlimited).toBe(true);
  });

  /** Two months free. An invariant, not a coincidence to re-derive per tier. */
  it('prices annual at exactly ten times monthly on every priced plan', () => {
    for (const plan of PUBLIC_PLANS) {
      if (plan.monthlyPence === null) continue;
      expect(plan.annualPence).toBe(plan.monthlyPence * 10);
    }
  });

  /**
   * The £0.01 payment-rail item exists to prove the live rail with real money. It must
   * never be purchasable by an ordinary customer, and the cheapest guarantee of that is
   * for the projection every public surface maps over not to contain it at all.
   */
  it('does not contain the payment rail test item', () => {
    expect(Object.keys(PLANS)).toEqual(['free', 'maker', 'studio', 'consultant']);
    expect(JSON.stringify(PLANS)).not.toMatch(/rail/i);
  });

  it('lays Consultant apart from the maker ladder', () => {
    expect(LADDER).toEqual(['free', 'maker', 'studio']);
    expect(LADDER).not.toContain('consultant');
    expect(CONSULTANT.slug).toBe('consultant');
    expect(PUBLIC_PLANS.map((plan) => plan.slug)).toEqual([
      'free',
      'maker',
      'studio',
      'consultant'
    ]);
  });
});

describe('the price formatters', () => {
  /**
   * Every rendered price carries "exc VAT" in the same string as the number. A customer
   * reading a figure and then being charged 20% on top of it at Stripe has been misled
   * about the price, which is the single most expensive error available here.
   */
  it('qualifies every amount with exc VAT', () => {
    expect(priceWithInterval(1400, 'monthly')).toBe('£14/month exc VAT');
    expect(priceWithInterval(14000, 'annual')).toBe('£140/year exc VAT');
    expect(priceBare(3500)).toBe('£35 exc VAT');
    for (const plan of PUBLIC_PLANS) {
      for (const interval of ['monthly', 'annual'] as const) {
        const pence = priceForInterval(plan, interval);
        if (pence === null) continue;
        expect(priceWithInterval(pence, interval).endsWith('exc VAT')).toBe(true);
      }
    }
  });

  it('groups thousands, so Consultant annual is not four undifferentiated digits', () => {
    expect(priceWithInterval(199000, 'annual')).toBe('£1,990/year exc VAT');
  });

  it('shows pence only when there are pence to show', () => {
    expect(gbpNumeral(1400)).toBe('£14');
    expect(gbpNumeral(1)).toBe('£0.01');
  });
});

describe('allowances', () => {
  /**
   * The database uses an int4 sentinel for "no ceiling". Nothing in the copy layer may
   * ever be in a position to render 2,147,483,647 SKUs at a Consultant customer.
   */
  it('renders unlimited as words, never as the sentinel', () => {
    expect(skuAllowance(CONSULTANT)).toBe('Unlimited SKUs');
    expect(skuAllowance(CONSULTANT)).not.toMatch(/\d/);
    expect(JSON.stringify(PLANS)).not.toContain('2147483647');
  });

  it('states the count for every limited plan', () => {
    expect(skuAllowance(PLANS.free)).toBe('3 SKUs');
    expect(skuAllowance(PLANS.maker)).toBe('45 SKUs');
    expect(skuAllowance(PLANS.studio)).toBe('180 SKUs');
  });

  /**
   * No SKU limit is enforced anywhere in the product yet, so an allowance is all we may
   * state. A sentence about being stopped would be a promise the software cannot keep.
   */
  it('says nothing about what happens at the limit', () => {
    for (const plan of PUBLIC_PLANS) {
      expect(skuAllowance(plan)).not.toMatch(/\blimit\b|cannot|blocked|up to/i);
    }
  });

  it('translates the allowance into scents at three SKUs per formulation', () => {
    expect(approximateScents(PLANS.maker)).toBe(15);
    expect(approximateScents(PLANS.studio)).toBe(60);
    expect(approximateScents(CONSULTANT)).toBeNull();
  });
});

describe('the SKU definition', () => {
  it('is the exact decided sentence, so no surface has to paraphrase it', () => {
    expect(SKU_DEFINITION).toBe('A SKU is one thing you sell: one fragrance in one pack size.');
  });
});
