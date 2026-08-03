/**
 * THE PLAN CONTRACT. The single source of truth for plan identity, price, allowance and tax
 * behaviour. Every other surface — the checkout endpoint, the webhook, GET /api/plans, the
 * Stripe sync scripts — derives from this file and restates none of it.
 *
 * SERVER ONLY. Never import this from src/pages, src/components or src/lib. It holds the
 * mapping from a Stripe price id to an entitlement, which is the thing a browser must never
 * be able to read or influence. The one client-facing projection of it is the JSON that
 * GET /api/plans serves, which is filtered on `publiclyListed` and carries no price ids.
 *
 * Amounts are integer pence, GBP, EXCLUSIVE of VAT. Annual is exactly 10 x monthly (two
 * months free) — asserted in test rather than left as a coincidence, because it is the
 * invariant every "2 months free" claim rests on.
 *
 * WHY THE SLUG LIST LIVES HERE RATHER THAN IN A SHARED MODULE. The spec proposed a
 * browser-safe `src/shared/plan-slugs.ts` holding the union and the membership sets, with
 * this file importing it. One module is simpler and is what makes "single source of truth"
 * literally true: there is no second file to drift, and no import that a future refactor can
 * point at the wrong copy. Nothing on www needs the slugs in a client bundle today — the
 * pricing page renders a display projection, not a membership set. If a client ever does,
 * it gets them over the wire from /api/plans, which is generated from this table.
 *
 * WHY NOT STRIPE METADATA, AND WHY NOT A POSTGRES TABLE. Both are editable by anyone with
 * dashboard access, so an allowance stored in either is an unaudited grant path: a two-field
 * edit that no reviewer sees, with no diff, no commit and no author. The database stores the
 * RESULT of resolution (sku_limit on the membership row, written by the webhook); the rule
 * that produced it is code, reviewed and deployed atomically with the code that reads it.
 * Stripe metadata therefore carries identity only — brand, plan, billing_interval.
 */

/** Every plan slug this system knows. Lowercase, stable, never renamed once a live
 *  subscription carries one. These exact strings appear in brand_memberships.plan, in
 *  Stripe metadata.plan, and in the Meta/GA4 payloads. */
export const PLAN_SLUGS = ['free', 'maker', 'studio', 'consultant', 'rail_test'] as const;
export type PlanSlug = (typeof PLAN_SLUGS)[number];

/**
 * The tiers a customer may buy through the public checkout.
 *
 * `free` is excluded because it is the ABSENCE of a subscription and has no Stripe price to
 * sell. `rail_test` is excluded because it is requested through a different field entirely
 * (see resolveRailTest in ./checkout.ts), so a `tier` request can never resolve to the penny
 * price and a penny can never buy a paid tier. The pair is not representable in either
 * direction.
 */
export const PAID_TIERS = ['maker', 'studio', 'consultant'] as const;
export type PaidTier = (typeof PAID_TIERS)[number];

/**
 * The plans that entitle — that is, the plans for which the product may be used at all.
 *
 * Same members as PAID_TIERS today, and still a separate set, because they answer different
 * questions: this one is "may they use the product", PAID_TIERS is "may this be bought". The
 * day the two diverge, conflating them is how `rail_test` or `free` becomes purchasable.
 */
export const ENTITLING_PLANS = ['maker', 'studio', 'consultant'] as const;

/** The free tier. Its defining property is that no Stripe object of any kind exists for it. */
export const FREE_PLAN: PlanSlug = 'free';

/**
 * int4 max, used as the "unlimited SKUs" sentinel. NOT null, NOT -1.
 *
 * Null is what "we don't know" already looks like — a join miss, an unwritten column, a
 * failed request — and `count >= NULL` is not TRUE, so an enforcement point comparing
 * against it fails OPEN in exactly the cases where it knows least. -1 is worse: `count >= -1`
 * is always true, so an unlimited customer would read as permanently at their limit.
 *
 * A client never sees this number. GET /api/plans reports `skuUnlimited: true` and
 * `skuLimit: null` for the tier that has it, so "2,147,483,647 SKUs" cannot be rendered.
 */
export const UNLIMITED = 2147483647;

/** GBP for every customer in every country. No multi-currency prices, no presentment
 *  currency conversion, no localised pricing. A maker in Ireland or the US is charged in
 *  GBP, and Checkout must not enable currency options. */
export const CURRENCY = 'gbp' as const;

/** Every price is stored EXCLUSIVE of VAT; Stripe Tax adds VAT at checkout from the
 *  customer's location and their VAT number if they supply one. The consequence that bites
 *  elsewhere: session.amount_total then INCLUDES that VAT and so differs by country, which
 *  is why advertising value is read from amount_subtotal (see ./stripe-events.ts). */
export const TAX_BEHAVIOUR = 'exclusive' as const;

export type BillingInterval = 'monthly' | 'annual';

export const BILLING_INTERVALS = ['monthly', 'annual'] as const;

export interface PricePoint {
  /** Integer pence, exclusive of VAT. */
  readonly amountPence: number;
  /** The Stripe `lookup_key`. Stable across price replacements; the sync scripts key on it. */
  readonly lookupKey: string;
  /** The NAME of the env var holding the Stripe price id — never the id itself. */
  readonly envVar: string;
}

export interface PlanEntry {
  readonly slug: PlanSlug;
  readonly displayName: string;
  /** False for `free` and `rail_test`. This is what ENTITLING_PLANS is generated against. */
  readonly entitling: boolean;
  /** UNLIMITED sentinel for consultant. Never null, never -1. */
  readonly skuLimit: number;
  /**
   * EDITOR seats only. Read-only seats are unlimited and free on every tier, which is what
   * puts an external competent person inside the tool instead of sharing the owner's login.
   * The long name is the cheapest guard against the one wrong reading — there is deliberately
   * no `readOnlySeatLimit`, because a field implying a ceiling gets enforced by accident.
   */
  readonly editorSeatLimit: number;
  readonly monthly: PricePoint | null;
  readonly annual: PricePoint | null;
  readonly stripeProductName: string | null;
  /** False for rail_test. The filter GET /api/plans and the pricing page both apply. */
  readonly publiclyListed: boolean;
}

export const PLAN_CONTRACT: Readonly<Record<PlanSlug, PlanEntry>> = Object.freeze({
  free: {
    slug: 'free',
    displayName: 'Free',
    entitling: false,
    skuLimit: 3,
    editorSeatLimit: 1,
    // Free is the ABSENCE of a subscription. Never create a £0 Stripe price: a live £0
    // subscription would make both the "already subscribed" 409 guard and the Customer
    // Portal's plan picker wrong.
    monthly: null,
    annual: null,
    stripeProductName: null,
    publiclyListed: true
  },
  maker: {
    slug: 'maker',
    displayName: 'Maker',
    entitling: true,
    skuLimit: 45,
    editorSeatLimit: 1,
    monthly: { amountPence: 1400, lookupKey: 'batchlabel_maker_monthly_gbp', envVar: 'STRIPE_PRICE_MAKER_MONTHLY' },
    annual: { amountPence: 14000, lookupKey: 'batchlabel_maker_annual_gbp', envVar: 'STRIPE_PRICE_MAKER_ANNUAL' },
    stripeProductName: 'Batchlabel Maker',
    publiclyListed: true
  },
  studio: {
    slug: 'studio',
    displayName: 'Studio',
    entitling: true,
    skuLimit: 180,
    editorSeatLimit: 3,
    monthly: { amountPence: 3500, lookupKey: 'batchlabel_studio_monthly_gbp', envVar: 'STRIPE_PRICE_STUDIO_MONTHLY' },
    annual: { amountPence: 35000, lookupKey: 'batchlabel_studio_annual_gbp', envVar: 'STRIPE_PRICE_STUDIO_ANNUAL' },
    stripeProductName: 'Batchlabel Studio',
    publiclyListed: true
  },
  consultant: {
    slug: 'consultant',
    displayName: 'Consultant',
    entitling: true,
    skuLimit: UNLIMITED,
    editorSeatLimit: 10,
    monthly: {
      amountPence: 19900,
      lookupKey: 'batchlabel_consultant_monthly_gbp',
      envVar: 'STRIPE_PRICE_CONSULTANT_MONTHLY'
    },
    annual: {
      amountPence: 199000,
      lookupKey: 'batchlabel_consultant_annual_gbp',
      envVar: 'STRIPE_PRICE_CONSULTANT_ANNUAL'
    },
    stripeProductName: 'Batchlabel Consultant',
    publiclyListed: true
  },
  rail_test: {
    // £0.30 exc VAT, monthly recurring. It exists to prove the payment rail end to end with
    // real money — a real card, real 3DS, a real signature-verified webhook, a real
    // entitlement write — without risking a £199 charge to find out.
    //
    // 30p, not the penny originally specified, because £0.30 IS Stripe's minimum chargeable
    // amount in GBP. A 1p price cannot be collected at all, so it would have exercised the
    // payment-failure path while looking like a success test — and 20% VAT on 1p rounds to
    // 0p, so it would never have produced a VAT line either. 30p is the exact floor: the
    // cheapest amount that proves the rail actually works rather than proving it does not.
    //
    // Monthly recurring rather than one-off, because a one-off exercises a different webhook
    // path (payment_intent.*, no customer.subscription.*) and so would not test the path a
    // real sale takes. There is no annual rail-test price: it would exercise nothing new and
    // every extra price id is another way for the env to be mis-set.
    //
    // It grants byte-identically what `free` grants, and it is not entitling. A penny buys
    // the rail a heartbeat and nothing else. It is a first-class row rather than a special
    // case scattered through the code precisely so that every switch over the plan list is
    // forced to say what it does with it.
    slug: 'rail_test',
    displayName: 'Payment rail test',
    entitling: false,
    skuLimit: 3,
    editorSeatLimit: 1,
    monthly: { amountPence: 30, lookupKey: 'batchlabel_rail_test_monthly_gbp', envVar: 'STRIPE_PRICE_RAIL_TEST_MONTHLY' },
    annual: null,
    stripeProductName: 'Batchlabel Rail Test',
    publiclyListed: false
  }
});

/** The order the catalogue is served and rendered in. */
export const PLAN_ORDER: readonly PlanSlug[] = PLAN_SLUGS;

/** Named separately because the rail test is reached through its own request field rather
 *  than through a tier, so no tier lookup ever produces it. */
export const RAIL_TEST_PRICE_ENV_VAR = PLAN_CONTRACT.rail_test.monthly?.envVar ?? '';

export interface PriceIdentity {
  readonly slug: PlanSlug;
  readonly interval: BillingInterval;
}

export interface ResolvedPrice {
  readonly entry: PlanEntry;
  readonly interval: BillingInterval;
  readonly priceId: string;
}

export type PriceIndex = ReadonlyMap<string, PriceIdentity>;

/**
 * price id -> { slug, interval }. Identity only: NO allowance on this value.
 *
 * A promotional or replacement price added to the env resolves to a slug, and the slug's
 * allowance is untouched. Putting skuLimit on this value would make every new price id a new
 * place an allowance can be invented.
 *
 * THROWS on a duplicate price id. The catastrophic env misconfiguration —
 * STRIPE_PRICE_RAIL_TEST_MONTHLY set to the Consultant price id — must kill the deploy, not
 * sell Consultant for a penny. readServerConfig calls this on every cold start, so a bad env
 * fails the first request rather than the thousandth.
 */
export function buildPriceIndex(env: Record<string, string | undefined>): PriceIndex {
  const index = new Map<string, PriceIdentity>();
  for (const entry of Object.values(PLAN_CONTRACT)) {
    for (const interval of BILLING_INTERVALS) {
      const point = entry[interval];
      // `free` has neither price point; `rail_test` has no annual one.
      if (!point) continue;
      const id = env[point.envVar]?.trim();
      // An absent env var is a deploy-config problem, reported by missingPriceEnvVars rather
      // than thrown here — a missing Studio price must not take the webhook down for the
      // Maker customers who are already paying.
      if (!id) continue;
      const clash = index.get(id);
      if (clash) {
        throw new Error(
          `[plan-contract] price id ${id} is configured for both ${clash.slug}/${clash.interval} ` +
          `and ${entry.slug}/${interval}. Check ${point.envVar}.`
        );
      }
      index.set(id, { slug: entry.slug, interval });
    }
  }
  return index;
}

/**
 * The env var names for entitling prices that are not configured. Reported, never thrown.
 *
 * Throwing would mean a missing STRIPE_PRICE_STUDIO_ANNUAL stops entitling EXISTING Maker
 * customers over a tier nobody has bought yet. The checkout endpoint turns a missing id for
 * the tier actually requested into a 500 with the env var name in the log detail, which is
 * where the failure belongs.
 */
export function missingPriceEnvVars(index: PriceIndex): string[] {
  const configured = new Set([...index.values()].map((v) => `${v.slug}/${v.interval}`));
  const missing: string[] = [];
  for (const entry of Object.values(PLAN_CONTRACT)) {
    // free and rail_test are exempt: one has no price at all, the other is deliberately
    // unset outside the minutes a live rail test is being run.
    if (!entry.entitling) continue;
    for (const interval of BILLING_INTERVALS) {
      const point = entry[interval];
      if (!point) continue;
      if (!configured.has(`${entry.slug}/${interval}`)) missing.push(point.envVar);
    }
  }
  return missing;
}

/**
 * THE resolver, and the one function that turns money into a tier.
 *
 * Returns null for an unrecognised price id — never a default, never Maker, never "grant
 * least". Null means "this event says nothing about the tier", and the caller leaves the
 * plan alone rather than guessing.
 *
 * THIS REPLACES A FALLBACK THAT RETURNED MAKER, and the reason it had to go is worth
 * keeping. That fallback was written when the catalogue held one paid product, so "grant the
 * tier we sell" was unambiguous. With five entitling price ids it is not: an unmapped id is
 * as likely to be Consultant — customer paid £199, granted Maker — as a stray. Worse, the
 * penny rail-test price's env var is UNSET by default, so an unset var meant the penny price
 * fell through the map and bought a paid tier. And the Stripe account is shared across
 * Orchestrate brands, so an unrecognised id may be another brand's customer entirely.
 *
 * `rail_test` resolves through its OWN entry rather than by falling through to anything.
 */
export function planEntryForPrice(priceId: string | null | undefined, index: PriceIndex): ResolvedPrice | null {
  if (!priceId) return null;
  const trimmed = priceId.trim();
  const hit = index.get(trimmed);
  if (!hit) return null;
  return { entry: PLAN_CONTRACT[hit.slug], interval: hit.interval, priceId: trimmed };
}

/**
 * tier -> price id, for checkout. Reads the same PLAN_CONTRACT envVar fields buildPriceIndex
 * reads, from the same env object, so the forward and reverse maps cannot drift.
 *
 * `rail_test` is unreachable here because PaidTier excludes it.
 */
export function priceIdForTier(
tier: PaidTier,
interval: BillingInterval,
env: Record<string, string | undefined>)
: string | null {
  const point = PLAN_CONTRACT[tier][interval];
  if (!point) return null;
  return env[point.envVar]?.trim() || null;
}

/**
 * The allowance, keyed by PLAN — never by price id, so a promotional or replacement price
 * can never invent an allowance.
 *
 * Unrecognised input returns the FREE allowance. "Grant least" is correct HERE and wrong in
 * planEntryForPrice, and the difference is the input: this one takes a slug that has already
 * passed the brand_memberships.plan CHECK constraint, so the only way to reach the fallback
 * is an older deploy reading a row a newer one wrote — where granting least is right.
 * planEntryForPrice's input is an id off a third-party object we may not have created.
 * A reviewer who sees the two side by side and harmonises them breaks one of them.
 */
export function allowanceForPlan(plan: string | null | undefined): {skuLimit: number;editorSeatLimit: number;} {
  // Via isPlanSlug rather than a bare index, because a plain property read would answer
  // `constructor`, `toString` and every other Object.prototype key with something truthy
  // that has no allowance on it — an unlimited-looking `undefined` where Free was meant.
  const resolved = isPlanSlug(plan) ? PLAN_CONTRACT[plan] : PLAN_CONTRACT.free;
  return { skuLimit: resolved.skuLimit, editorSeatLimit: resolved.editorSeatLimit };
}

export function isPlanSlug(value: unknown): value is PlanSlug {
  return typeof value === 'string' && (PLAN_SLUGS as readonly string[]).includes(value);
}

export function isEntitlingPlan(value: unknown): value is PlanSlug {
  return typeof value === 'string' && (ENTITLING_PLANS as readonly string[]).includes(value);
}

/** The display name for a slug, or the raw value when this deploy has never heard of it. */
export function displayNameForPlan(plan: string | null | undefined): string {
  return isPlanSlug(plan) ? PLAN_CONTRACT[plan].displayName : 'paid';
}
