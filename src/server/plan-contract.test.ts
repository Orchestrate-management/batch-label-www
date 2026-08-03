// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  BILLING_INTERVALS,
  ENTITLING_PLANS,
  PAID_TIERS,
  PLAN_CONTRACT,
  PLAN_SLUGS,
  UNLIMITED,
  allowanceForPlan,
  buildPriceIndex,
  displayNameForPlan,
  missingPriceEnvVars,
  planEntryForPrice,
  priceIdForTier,
  type PlanSlug } from
'./plan-contract';
import { DEFAULT_CHECKOUT_TIER, PRICES } from '../lib/billing';

/** Every price id a fully configured deployment sets. */
const FULL_ENV: Record<string, string> = {
  STRIPE_PRICE_MAKER_MONTHLY: 'price_maker_m',
  STRIPE_PRICE_MAKER_ANNUAL: 'price_maker_a',
  STRIPE_PRICE_STUDIO_MONTHLY: 'price_studio_m',
  STRIPE_PRICE_STUDIO_ANNUAL: 'price_studio_a',
  STRIPE_PRICE_CONSULTANT_MONTHLY: 'price_consultant_m',
  STRIPE_PRICE_CONSULTANT_ANNUAL: 'price_consultant_a',
  STRIPE_PRICE_RAIL_TEST_MONTHLY: 'price_rail_test_m'
};

describe('the ladder', () => {
  it('prices annual at exactly ten times monthly, so "two months free" is a fact', () => {
    for (const slug of PLAN_SLUGS) {
      const entry = PLAN_CONTRACT[slug];
      if (!entry.monthly || !entry.annual) continue;
      expect(entry.annual.amountPence).toBe(entry.monthly.amountPence * 10);
    }
  });

  it('holds every amount in integer pence, so no rounding ever reaches Stripe', () => {
    for (const slug of PLAN_SLUGS) {
      for (const interval of BILLING_INTERVALS) {
        const point = PLAN_CONTRACT[slug][interval];
        if (!point) continue;
        expect(Number.isInteger(point.amountPence)).toBe(true);
        expect(point.amountPence).toBeGreaterThan(0);
      }
    }
  });

  /** A live £0 subscription would make both the "already subscribed" 409 guard and the
   *  portal's plan picker wrong. Free is the ABSENCE of a subscription. */
  it('gives the free tier no Stripe price of any kind', () => {
    expect(PLAN_CONTRACT.free.monthly).toBeNull();
    expect(PLAN_CONTRACT.free.annual).toBeNull();
    expect(PLAN_CONTRACT.free.stripeProductName).toBeNull();
  });

  it('gives every entitling tier both intervals and a Stripe product', () => {
    for (const slug of ENTITLING_PLANS) {
      expect(PLAN_CONTRACT[slug].monthly).not.toBeNull();
      expect(PLAN_CONTRACT[slug].annual).not.toBeNull();
      expect(PLAN_CONTRACT[slug].stripeProductName).toBeTruthy();
    }
  });

  it('keeps the allowance ladder monotonic, so no upgrade is ever a downgrade', () => {
    const ladder: PlanSlug[] = ['free', 'maker', 'studio', 'consultant'];
    for (let i = 1; i < ladder.length; i += 1) {
      expect(PLAN_CONTRACT[ladder[i]].skuLimit).toBeGreaterThan(PLAN_CONTRACT[ladder[i - 1]].skuLimit);
      expect(PLAN_CONTRACT[ladder[i]].editorSeatLimit).toBeGreaterThanOrEqual(
        PLAN_CONTRACT[ladder[i - 1]].editorSeatLimit
      );
    }
  });

  it('uses the int4-max sentinel for unlimited, never null and never -1', () => {
    expect(PLAN_CONTRACT.consultant.skuLimit).toBe(UNLIMITED);
    expect(UNLIMITED).toBe(2147483647);
  });
});

/**
 * The penny item exists to prove the live rail end to end with real money. Every one of
 * these assertions is a way it could otherwise become a back door into a paid tier.
 */
describe('the £0.01 rail test grants nothing', () => {
  it('grants byte-identically what free grants', () => {
    expect(PLAN_CONTRACT.rail_test.skuLimit).toBe(PLAN_CONTRACT.free.skuLimit);
    expect(PLAN_CONTRACT.rail_test.editorSeatLimit).toBe(PLAN_CONTRACT.free.editorSeatLimit);
    expect(allowanceForPlan('rail_test')).toEqual(allowanceForPlan('free'));
  });

  it('is not entitling, not purchasable and not publicly listed', () => {
    expect(PLAN_CONTRACT.rail_test.entitling).toBe(false);
    expect(PLAN_CONTRACT.rail_test.publiclyListed).toBe(false);
    expect(ENTITLING_PLANS as readonly string[]).not.toContain('rail_test');
    expect(PAID_TIERS as readonly string[]).not.toContain('rail_test');
  });

  it('has no annual price — a 10p annual would exercise nothing the monthly one does not', () => {
    expect(PLAN_CONTRACT.rail_test.annual).toBeNull();
    expect(PLAN_CONTRACT.rail_test.monthly?.amountPence).toBe(1);
  });

  it('resolves through its own index entry rather than falling through to anything', () => {
    const index = buildPriceIndex(FULL_ENV);
    expect(planEntryForPrice('price_rail_test_m', index)?.entry.slug).toBe('rail_test');
  });
});

describe('the membership sets', () => {
  it('excludes free from the purchasable tiers — it has no price to sell', () => {
    expect(PAID_TIERS as readonly string[]).not.toContain('free');
  });

  /** Same members today, still two sets: one answers "may they use the product", the other
   *  "may this be bought". Conflating them is how rail_test eventually becomes purchasable. */
  it('keeps the entitling and purchasable sets separate even while they agree', () => {
    expect([...ENTITLING_PLANS].sort()).toEqual([...PAID_TIERS].sort());
    expect(ENTITLING_PLANS).not.toBe(PAID_TIERS as unknown);
  });

  it('uses slugs that match the charset the database CHECK constraint allows', () => {
    for (const slug of PLAN_SLUGS) expect(slug).toMatch(/^[a-z][a-z0-9_]*$/);
  });
});

describe('buildPriceIndex', () => {
  it('maps every configured price id to its slug and interval', () => {
    const index = buildPriceIndex(FULL_ENV);
    expect(index.get('price_maker_m')).toEqual({ slug: 'maker', interval: 'monthly' });
    expect(index.get('price_consultant_a')).toEqual({ slug: 'consultant', interval: 'annual' });
    expect(index.size).toBe(7);
  });

  it('skips the price ids this deployment has not configured', () => {
    const index = buildPriceIndex({ STRIPE_PRICE_MAKER_MONTHLY: 'price_maker_m' });
    expect(index.size).toBe(1);
    expect(buildPriceIndex({}).size).toBe(0);
  });

  /**
   * THE catastrophic env misconfiguration: the rail-test var set to the Consultant price id.
   * It must kill the deploy, not sell Consultant for a penny.
   */
  it('throws when two contract entries are configured to the same price id', () => {
    expect(() =>
    buildPriceIndex({ ...FULL_ENV, STRIPE_PRICE_RAIL_TEST_MONTHLY: 'price_consultant_m' })
    ).toThrow(/price_consultant_m/);
  });

  it('names the env var to check in the error, so the fix is obvious from the log', () => {
    expect(() =>
    buildPriceIndex({ ...FULL_ENV, STRIPE_PRICE_STUDIO_ANNUAL: 'price_maker_a' })
    ).toThrow(/STRIPE_PRICE_STUDIO_ANNUAL/);
  });
});

describe('missingPriceEnvVars', () => {
  it('is empty for a fully configured deployment', () => {
    expect(missingPriceEnvVars(buildPriceIndex(FULL_ENV))).toEqual([]);
  });

  it('names every unconfigured entitling price', () => {
    const missing = missingPriceEnvVars(buildPriceIndex({ STRIPE_PRICE_MAKER_MONTHLY: 'price_maker_m' }));
    expect(missing).toContain('STRIPE_PRICE_MAKER_ANNUAL');
    expect(missing).toContain('STRIPE_PRICE_CONSULTANT_ANNUAL');
    expect(missing).not.toContain('STRIPE_PRICE_MAKER_MONTHLY');
  });

  /** The rail-test var is deliberately unset outside the minutes a live test is running, so
   *  reporting it as missing would train everyone to ignore this list. */
  it('never reports the rail test as missing', () => {
    expect(missingPriceEnvVars(buildPriceIndex({}))).not.toContain('STRIPE_PRICE_RAIL_TEST_MONTHLY');
  });
});

describe('planEntryForPrice — the resolver that must never guess', () => {
  const index = buildPriceIndex(FULL_ENV);

  it('resolves each configured price to its own tier and interval', () => {
    expect(planEntryForPrice('price_studio_a', index)).toMatchObject({
      interval: 'annual',
      priceId: 'price_studio_a'
    });
    expect(planEntryForPrice('price_studio_a', index)?.entry.slug).toBe('studio');
  });

  /**
   * The predecessor of this function returned MAKER for an unrecognised price. With five
   * entitling price ids that is theft in one direction (a Consultant buyer granted Maker)
   * and a pricing exploit in the other (the penny price, whose env var is unset by default,
   * buying a paid tier).
   */
  it('returns null for an unrecognised price rather than granting a tier', () => {
    expect(planEntryForPrice('price_replacement_2027', index)).toBeNull();
    expect(planEntryForPrice('price_orchestrate_scale_1800', index)).toBeNull();
    expect(planEntryForPrice('', index)).toBeNull();
    expect(planEntryForPrice(null, index)).toBeNull();
    expect(planEntryForPrice(undefined, index)).toBeNull();
  });

  it('returns null when the price index is empty, rather than defaulting', () => {
    expect(planEntryForPrice('price_maker_m', buildPriceIndex({}))).toBeNull();
  });
});

describe('priceIdForTier', () => {
  it('round-trips every purchasable tier and interval through the index', () => {
    const index = buildPriceIndex(FULL_ENV);
    for (const tier of PAID_TIERS) {
      for (const interval of BILLING_INTERVALS) {
        const priceId = priceIdForTier(tier, interval, FULL_ENV);
        expect(priceId).toBeTruthy();
        const resolved = planEntryForPrice(priceId, index);
        expect(resolved?.entry.slug).toBe(tier);
        expect(resolved?.interval).toBe(interval);
      }
    }
  });

  it('returns null when the env var for that tier is unset', () => {
    expect(priceIdForTier('studio', 'annual', {})).toBeNull();
    expect(priceIdForTier('studio', 'annual', { STRIPE_PRICE_STUDIO_ANNUAL: '  ' })).toBeNull();
  });
});

describe('allowanceForPlan', () => {
  it('returns the contract allowance for every known slug', () => {
    expect(allowanceForPlan('studio')).toEqual({ skuLimit: 180, editorSeatLimit: 3 });
    expect(allowanceForPlan('consultant').skuLimit).toBe(UNLIMITED);
  });

  /**
   * Grant-least is correct HERE and wrong in planEntryForPrice. The input is a slug the
   * database CHECK constraint has already validated, so the only way to reach this branch is
   * an older deploy reading a row a newer one wrote.
   */
  it('falls back to the FREE allowance for a slug this deploy has never heard of', () => {
    expect(allowanceForPlan('enterprise_unlimited')).toEqual(allowanceForPlan('free'));
    expect(allowanceForPlan(null)).toEqual(allowanceForPlan('free'));
    expect(allowanceForPlan('constructor')).toEqual(allowanceForPlan('free'));
  });
});

describe('displayNameForPlan', () => {
  it('names each tier', () => {
    expect(displayNameForPlan('consultant')).toBe('Consultant');
    expect(displayNameForPlan('maker')).toBe('Maker');
  });

  it('degrades to a neutral word rather than printing a raw slug at a customer', () => {
    expect(displayNameForPlan('something_new')).toBe('paid');
    expect(displayNameForPlan(null)).toBe('paid');
  });
});

/**
 * THE DRIFT ALARM for the client display projection.
 *
 * src/lib/billing.ts holds major-unit amounts because a page prints them, and it cannot
 * import the contract (server-only). This test imports both and asserts they agree, so a
 * price changed in one place and not the other fails the build rather than being discovered
 * by a customer reading one number and being charged another.
 */
describe('the client display projection agrees with the contract', () => {
  it('prints the same monthly and annual amounts the contract charges', () => {
    const maker = PLAN_CONTRACT.maker;
    expect(PRICES.monthly * 100).toBe(maker.monthly?.amountPence);
    expect(PRICES.annual * 100).toBe(maker.annual?.amountPence);
  });

  it('defaults to a tier the contract says is purchasable', () => {
    expect(PAID_TIERS as readonly string[]).toContain(DEFAULT_CHECKOUT_TIER);
  });
});
