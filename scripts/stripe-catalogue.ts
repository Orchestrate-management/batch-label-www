/**
 * The Batchlabel catalogue, projected out of the plan contract.
 *
 * Shared by stripe-sync.ts (writes it), stripe-portal-config.ts (lists it) and
 * stripe-verify.ts (asserts it). One projection, three consumers, so the objects that get
 * created, the objects offered in the portal and the objects CI checks cannot disagree.
 *
 * NOTHING HERE RESTATES AN AMOUNT. Every pence figure, lookup key and env var name is read
 * from `src/server/plan-contract.ts`, which spec 01-contract §8.5 makes the only source of
 * them. What this file adds is the Stripe-shaped detail the contract deliberately does not
 * carry: the tax code, the statement descriptor, the product prose, and the mode guard.
 *
 * Run any of the three with `npx vite-node scripts/<name>.ts`.
 *
 * DEPENDENCY, and it is deliberate: `src/server/plan-contract.ts` is created by the
 * www-server workstream. Until that branch lands, these three scripts will not resolve that
 * import and will not run. The alternative — a second copy of the amounts, lookup keys and
 * env var names living down here — is precisely the drift the contract exists to prevent,
 * and it would be discovered by a customer being charged the wrong number. A failed import
 * is the cheaper failure. The objects already in Stripe were created by this code against
 * that file; see scripts/STRIPE_TEST_MODE_IDS.md.
 */

import Stripe from 'stripe';
import { DEFAULT_BRAND } from '../src/server/config';
import {
  CURRENCY,
  PLAN_CONTRACT,
  TAX_BEHAVIOUR,
  type PlanEntry,
  type PricePoint } from
'../src/server/plan-contract';

/**
 * The value `belongsToThisBrand` compares against.
 *
 * Imported rather than typed, because the comparison in src/server/stripe-events.ts is an
 * exact string match after trim — `metadata.brand === config.brand` — and config.brand is
 * `VITE_ORCHESTRATE_BRAND` falling back to this constant. A capitalised "Batchlabel" here
 * would leave every subscription on the shared Orchestrate account looking like somebody
 * else's, and the webhook ignores rather than errors, so the symptom would be silence.
 */
export const BRAND = DEFAULT_BRAND;

/**
 * Software as a service — business use.
 *
 * Pinned as a literal, identical on all four products, for two reasons. A different SaaS
 * code on one tier changes what VAT is owed on that tier alone, which nobody notices until
 * a return. And `null` is not neutral: Stripe Tax falls back to the ACCOUNT's default tax
 * code, and the account is shared with the other Orchestrate brands — leaving it unset makes
 * Batchlabel's VAT treatment a downstream effect of somebody else's dashboard edit.
 *
 * Business rather than personal use because the decided pricing states the buyer is a
 * business (exc-VAT display, VAT number collected at checkout). Which code is ultimately
 * correct is an accountant's question, not this file's — but it must be answered once, here,
 * rather than four times by omission.
 */
export const TAX_CODE = 'txcd_10103001';

/**
 * What a Batchlabel charge reads as on a card statement.
 *
 * Set per product on purpose: the fallback is the ACCOUNT's descriptor, which is whatever
 * the other Orchestrate brands set, and a charge appearing under another brand's name is a
 * chargeback generator. Max 22 characters, letters/digits/spaces only.
 */
export const STATEMENT_DESCRIPTOR = 'BATCHLABEL';

export type StripeInterval = 'month' | 'year';

export interface CataloguePrice {
  readonly slug: string;
  readonly interval: 'monthly' | 'annual';
  readonly stripeInterval: StripeInterval;
  readonly nickname: string;
  readonly point: PricePoint;
}

export interface CatalogueProduct {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  /** false only for the rail test. Drives default_price and portal membership. */
  readonly publiclyListed: boolean;
  readonly prices: readonly CataloguePrice[];
}

/**
 * The one description the three sellable tiers share, and the rail test's.
 *
 * A Stripe description is a CUSTOMER-FACING claim — it renders in Checkout and on the
 * invoice line — living in a dashboard-editable field with no diff, no commit and no
 * reviewer. Three rules therefore bind it, and between them they leave one sentence:
 *
 *   * no allowance numbers, ever (spec 02-stripe §4.3): a SKU or seat count stored on a
 *     Stripe object is an unaudited grant path, and it would drift from the pricing page
 *     with nothing to catch it;
 *   * no PDF or SVG export claim (ruling R6): the exporter does not exist yet, and the
 *     existing test-mode description promises "print ready PDF and SVG with no watermark";
 *   * no per-tier differentiator (ruling R10): editor seats, multi-client workspaces, bulk
 *     generation and API access are not built, so the tiers cannot be described as differing
 *     by them. Under the governing principle the product IS the same on every tier, so one
 *     description for all three is not a shortcut — it is the accurate statement.
 *
 * The wording is the repo's own sanctioned claim, from POSITIONING.md.
 */
const SELLABLE_DESCRIPTION =
'Turns a fragrance supplier’s safety data sheet into a UK and EU CLP label for candles, wax melts, reed diffusers and room sprays.';

const RAIL_TEST_DESCRIPTION = 'Internal payment rail verification. Not for sale.';

function priceFor(entry: PlanEntry, interval: 'monthly' | 'annual'): CataloguePrice | null {
  const point = interval === 'monthly' ? entry.monthly : entry.annual;
  if (!point) return null;
  return {
    slug: entry.slug,
    interval,
    stripeInterval: interval === 'monthly' ? 'month' : 'year',
    // Derived, never a table: a hand-kept nickname is one more thing to drift. The rail
    // test says so in the one place a dashboard user reads before clicking "sell this".
    nickname: entry.publiclyListed ?
    `${entry.stripeProductName} — ${interval}` :
    `${entry.stripeProductName} — ${interval}, do not sell`,
    point
  };
}

/**
 * Every plan the contract gives a Stripe product name — so `free` is absent, which is the
 * point: free is the ABSENCE of a subscription. A £0 price would trip the "already
 * subscribed" guard at checkout and show a phantom subscription in the portal to somebody
 * who has never paid.
 */
export const CATALOGUE: readonly CatalogueProduct[] = Object.values(PLAN_CONTRACT).
filter((entry): entry is PlanEntry & {stripeProductName: string;} =>
typeof entry.stripeProductName === 'string'
).
map((entry) => ({
  slug: entry.slug,
  name: entry.stripeProductName,
  description: entry.publiclyListed ? SELLABLE_DESCRIPTION : RAIL_TEST_DESCRIPTION,
  publiclyListed: entry.publiclyListed,
  prices: [priceFor(entry, 'monthly'), priceFor(entry, 'annual')].filter(
    (price): price is CataloguePrice => price !== null
  )
}));

export const SELLABLE = CATALOGUE.filter((product) => product.publiclyListed);

/** Identity only. Never an allowance — see the note on SELLABLE_DESCRIPTION. */
export function productMetadata(slug: string): Stripe.MetadataParam {
  return { brand: BRAND, plan: slug };
}

export function priceMetadata(price: CataloguePrice): Stripe.MetadataParam {
  return { brand: BRAND, plan: price.slug, billing_interval: price.interval };
}

export const ALL_PRICES: readonly CataloguePrice[] = CATALOGUE.flatMap(
  (product) => product.prices
);

export const LOOKUP_KEYS: readonly string[] = ALL_PRICES.map((price) => price.point.lookupKey);

/** The env var holding the portal configuration id. Named here so all three scripts agree. */
export const PORTAL_CONFIG_ENV = 'STRIPE_PORTAL_CONFIGURATION_ID';

export interface ModeContext {
  readonly stripe: Stripe;
  readonly live: boolean;
  readonly label: 'test' | 'live';
}

/**
 * A Stripe client, and a refusal to touch live mode by accident.
 *
 * The guard is two-sided on purpose. A live key with no `--live` aborts, so a shell that
 * still has production exported cannot rewrite the real catalogue. A `--live` flag with a
 * test key ALSO aborts, because "I passed --live and it said it worked" must never be true
 * of a test-mode run — that is how a founder concludes the live rail is configured when it
 * is not.
 */
export function openStripe(argv: readonly string[]): ModeContext {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    fail(
      'STRIPE_SECRET_KEY is not set.\n' +
      '  Test mode:  export STRIPE_SECRET_KEY=sk_test_...\n' +
      '  It is the same value the Stripe CLI keeps in ~/.config/stripe/config.toml.'
    );
  }

  const keyIsLive = key.startsWith('sk_live_') || key.startsWith('rk_live_');
  const wantsLive = argv.includes('--live');

  if (keyIsLive && !wantsLive) {
    fail('STRIPE_SECRET_KEY is a LIVE key. Pass --live to say so deliberately, or export a test key.');
  }
  if (wantsLive && !keyIsLive) {
    fail('--live was passed but STRIPE_SECRET_KEY is a test key. Refusing to report a test run as live.');
  }

  const stripe = new Stripe(key);
  const label = keyIsLive ? 'live' : 'test';
  console.log(`\n[stripe] mode = ${label.toUpperCase()}  account = ${key.slice(0, 12)}…  brand = ${BRAND}`);
  return { stripe, live: keyIsLive, label };
}

export function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

export interface ResolvedCatalogue {
  /** slug -> product */
  readonly products: ReadonlyMap<string, Stripe.Product>;
  /** `${slug}:${interval}` -> price */
  readonly prices: ReadonlyMap<string, Stripe.Price>;
  /** contract entries with no object in Stripe yet */
  readonly missing: readonly string[];
}

/**
 * What is actually in Stripe right now, keyed the way the contract is.
 *
 * Resolution is by `lookup_key`, not by environment variable, on purpose. The env is the
 * thing most likely to be wrong — spec 02-stripe §4.4's inverse failure is an env var
 * pointing at ANOTHER Orchestrate brand's price — so the scripts must be able to describe
 * the account without trusting it. stripe-verify.ts then checks the env against this, which
 * is the check that catches it.
 */
export async function resolveCatalogue(mode: ModeContext): Promise<ResolvedCatalogue> {
  const prices = new Map<string, Stripe.Price>();
  const products = new Map<string, Stripe.Product>();
  const missing: string[] = [];

  const held = await mode.stripe.prices.list({ lookup_keys: [...LOOKUP_KEYS], limit: 100 });
  const byLookupKey = new Map(held.data.map((price) => [price.lookup_key ?? '', price]));

  for (const product of CATALOGUE) {
    for (const price of product.prices) {
      const found = byLookupKey.get(price.point.lookupKey);
      if (found) prices.set(`${price.slug}:${price.interval}`, found);
      else missing.push(price.point.lookupKey);
    }
  }

  const all = await mode.stripe.products.list({ limit: 100 }).autoPagingToArray({ limit: 1000 });
  for (const product of CATALOGUE) {
    const found = all.find(
      (candidate) =>
      candidate.metadata?.brand === BRAND && candidate.metadata?.plan === product.slug
    );
    if (found) products.set(product.slug, found);
    else missing.push(product.name);
  }

  return { products, prices, missing };
}

export { CURRENCY, TAX_BEHAVIOUR };
