/**
 * The client's display projection of the plan contract, and the only place a price is
 * written down on www.
 *
 * WHY THIS FILE EXISTS AT ALL. Every price on the site used to be hand-typed — eight
 * copies of "£14 a month or £140 a year", including one in the terms of service. With one
 * plan that was merely fragile; with four it is a guarantee of drift, because a ladder
 * change would touch thirty-two strings by hand. Everything customer-facing now reads from
 * here.
 *
 * WHAT THIS FILE IS NOT. It is a *display* projection. It is never consulted to decide
 * anything: an allowance decision reads the number off the entitlement row, always. It
 * holds no Stripe price id, no resolution logic and no server secrets, which is what makes
 * it safe to ship to a browser. The authority is the server-side plan contract; this is a
 * copy of the half a customer is allowed to read.
 *
 * Amounts are integer pence, GBP, EXCLUSIVE of VAT. Annual is exactly ten times monthly
 * (two months free) — asserted in test, not a coincidence to re-derive.
 *
 * The £0.01 payment-rail test item is deliberately absent. It is not a member of
 * `PublicPlanSlug`, so no surface built from this file can render it even by accident.
 */

export type PublicPlanSlug = 'free' | 'maker' | 'studio' | 'consultant';

export type BillingInterval = 'monthly' | 'annual';

export interface PlanDisplay {
  readonly slug: PublicPlanSlug;
  readonly label: string;
  /** null on Free: Free is the absence of a subscription, not a £0 one. */
  readonly monthlyPence: number | null;
  readonly annualPence: number | null;
  /**
   * null means "no ceiling". The database uses an int4 sentinel for that; the sentinel
   * never reaches a browser, so nothing here can render "2,147,483,647 SKUs".
   */
  readonly skus: number | null;
  readonly skusUnlimited: boolean;
  /**
   * Held so this projection matches the server contract field for field. Deliberately
   * rendered nowhere: multi-person accounts are not built, so an editor count on a pricing
   * card would be a ceiling on a capability that does not exist. See
   * src/content/availability.ts.
   */
  readonly editors: number;
}

export const PLANS = {
  free: {
    slug: 'free',
    label: 'Free',
    monthlyPence: null,
    annualPence: null,
    skus: 3,
    skusUnlimited: false,
    editors: 1
  },
  maker: {
    slug: 'maker',
    label: 'Maker',
    monthlyPence: 1400,
    annualPence: 14000,
    skus: 45,
    skusUnlimited: false,
    editors: 1
  },
  studio: {
    slug: 'studio',
    label: 'Studio',
    monthlyPence: 3500,
    annualPence: 35000,
    skus: 180,
    skusUnlimited: false,
    editors: 3
  },
  consultant: {
    slug: 'consultant',
    label: 'Consultant',
    monthlyPence: 19900,
    annualPence: 199000,
    skus: null,
    skusUnlimited: true,
    editors: 10
  }
} as const satisfies Record<PublicPlanSlug, PlanDisplay>;

/**
 * Render order for the maker ladder. Consultant is not in it: the founder's decision lays
 * it out apart from the ladder rather than as a fourth step.
 */
export const LADDER: readonly PublicPlanSlug[] = ['free', 'maker', 'studio'];

export const CONSULTANT: PlanDisplay = PLANS.consultant;

/** Every publicly listed plan, ladder first. Structured data and llms.txt map over this. */
export const PUBLIC_PLANS: readonly PlanDisplay[] = [
  ...LADDER.map((slug) => PLANS[slug] as PlanDisplay),
  CONSULTANT
];

/**
 * The billing unit, stated once. Reproduced verbatim on /pricing, in the terms and in
 * llms.txt, and paraphrased nowhere — a unit that is described three different ways is a
 * unit nobody can price against.
 */
export const SKU_DEFINITION = 'A SKU is one thing you sell: one fragrance in one pack size.';

function gbp(pence: number): string {
  const pounds = pence / 100;
  return pence % 100 === 0 ?
    `£${pounds.toLocaleString('en-GB')}` :
    `£${pounds.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * The numeral alone, e.g. "£140".
 *
 * Only for the oversized figure on a pricing card, and only when the caller puts
 * "exc VAT" inside the *same* element. Every other caller wants priceWithInterval or
 * priceBare: a bare number that drifts away from its tax qualifier is precisely the
 * failure this module exists to prevent.
 */
export function gbpNumeral(pence: number): string {
  return gbp(pence);
}

/** "£14/month exc VAT" | "£140/year exc VAT" */
export function priceWithInterval(pence: number, interval: BillingInterval): string {
  return `${gbp(pence)}/${interval === 'monthly' ? 'month' : 'year'} exc VAT`;
}

/** "£35 exc VAT" — for prose where the interval is already in the sentence. */
export function priceBare(pence: number): string {
  return `${gbp(pence)} exc VAT`;
}

/** The price for an interval, or null on Free. */
export function priceForInterval(plan: PlanDisplay, interval: BillingInterval): number | null {
  return interval === 'monthly' ? plan.monthlyPence : plan.annualPence;
}

/**
 * "45 SKUs" | "Unlimited SKUs".
 *
 * Note what this does NOT say: nothing about what happens when you pass the number. No SKU
 * limit is enforced anywhere in the product yet, so an allowance is all we may state — a
 * promise that we would stop you would be a promise the software cannot keep.
 */
export function skuAllowance(plan: PlanDisplay): string {
  if (plan.skusUnlimited || plan.skus === null) return 'Unlimited SKUs';
  return `${plan.skus} ${plan.skus === 1 ? 'SKU' : 'SKUs'}`;
}

/** Roughly three SKUs come out of one formulation, so a maker reads the ladder in scents. */
export function approximateScents(plan: PlanDisplay): number | null {
  return plan.skus === null ? null : Math.round(plan.skus / 3);
}
