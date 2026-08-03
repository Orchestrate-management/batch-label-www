/**
 * Turning a Stripe object into the entitlement we store.
 *
 * Pure functions only — no network, no Stripe client, no Supabase client — so the mapping
 * that decides whether somebody keeps their paid features can be tested exhaustively
 * without a single API key.
 *
 * TWO API-VERSION TRAPS ARE HANDLED HERE, and both are silent data loss if you miss them:
 *
 *   1. `Subscription.current_period_end` no longer exists at the top level. From API
 *      version 2025-03-31.basil onwards Stripe moved the billing period onto each
 *      SubscriptionItem (`subscription.items.data[n].current_period_end`). The stripe-node
 *      types in this repo are generated against 2026-07-29.dahlia, so reading
 *      `subscription.current_period_end` does not even compile — but a webhook endpoint
 *      pinned to an older API version still SENDS the old shape. Both are read.
 *
 *   2. `Invoice.subscription` moved to `invoice.parent.subscription_details.subscription`
 *      in the same release. Same treatment.
 *
 * The webhook endpoint's API version is a dashboard setting the founder controls, so the
 * code cannot assume either shape. Reading both costs nothing and removes a whole class of
 * "billing silently stopped working after Stripe upgraded our account" incident.
 */

import type Stripe from 'stripe';
import { FREE_PLAN, type PlanSlug } from './plan-contract.js';

/**
 * THE SIX FIRST-ITEM AND SINGLE-VALUE READS from docs/PRICING_RESEARCH.md §4.1, re-checked
 * now that the "no add-ons" decision has landed — one Stripe product per subscription, one
 * item, quantity always 1. Each was checked; none is assumed.
 *
 *   1. `subscriptionPriceId` — first item only. NO LONGER SAFE AS WRITTEN, for a new reason.
 *      With no add-ons the first item IS the only item, so it returns the right price today.
 *      But what a wrong answer costs has changed: it used to pick between a base price and an
 *      add-on price on a subscription that was entitling either way; it now picks the TIER.
 *      A second item can still appear from a hand-edit, a migration or a coupon materialised
 *      as an item, none of which our own checkout decision prevents. Changed below to refuse
 *      to answer rather than guess.
 *   2. `subscriptionInterval` — first item only. SAFE, and demoted. The resolved price entry
 *      now carries our own vocabulary ('monthly'/'annual'); this keeps Stripe's ('month'/
 *      'year') as a cross-check, because the two must never be conflated.
 *   3. `planForPrice` falling back to MAKER. NOT SAFE — deleted. With five entitling price
 *      ids and a penny price whose env var is unset by default, that fallback was a live
 *      pricing exploit. See planEntryForPrice in ./plan-contract.ts for the full argument.
 *   4. `belongsToThisBrand` testing the first item's price. SAFE but needlessly
 *      order-dependent; now scans every item (see ./stripe-events.ts).
 *   5. `EntitlementIntent.priceId: string | null` — one price per event. SAFE, no change.
 *      With one product per subscription this is not merely adequate, it is the correct
 *      model: the intent's job is to say which tier this subscription now sells, and that is
 *      one price. Widening it to an array would invent a shape neither the database (one
 *      stripe_price_id column) nor the contract has, and every consumer would take [0].
 *   6. `item.quantity` never read. NOW SAFE, and asserted anyway. Quantity must always be 1,
 *      so discarding it loses nothing — but unread and asserted differ when a human edits a
 *      subscription in the dashboard: unread, quantity 3 on a Studio price grants one Studio
 *      silently; asserted, it refuses to resolve and logs. A stated property with no check is
 *      a comment.
 *
 * The seventh row of that table is the migration's, not this file's.
 *
 * NOTE THE ASYMMETRY THIS LEAVES, deliberately: `subscriptionPeriodEnd` takes the MAX over
 * all items, while tier resolution REFUSES if there is more than one. Access should last as
 * long as anything on the subscription is paid up (permissive); a tier must never be guessed
 * from an ambiguous object (strict). Harmonising those two breaks whichever one is changed.
 */

/**
 * Stripe statuses that entitle. Deliberately the same list as
 * public.entitlement_is_active() in 20260801120000_entitlements.sql — see the comment
 * there for why past_due is on it.
 */
export const ENTITLING_STATUSES: readonly string[] = ['active', 'trialing', 'past_due'];

export function isEntitlingStatus(status: string | null | undefined): boolean {
  return status !== null && status !== undefined && ENTITLING_STATUSES.includes(status);
}

/**
 * Which plan a subscription in this status grants.
 *
 * The plan column is derived from the status rather than set independently, so the two can
 * never disagree — "plan: maker, plan_status: canceled" is not a state this code can
 * produce.
 */
export function planForStatus(status: string | null | undefined, paidPlan: PlanSlug): PlanSlug {
  return isEntitlingStatus(status) ? paidPlan : FREE_PLAN;
}

/** Stripe sends unix seconds; Postgres wants an ISO instant. */
export function toIso(seconds: number | null | undefined): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}

/**
 * The shapes we read defensively. Declared structurally rather than taken from
 * Stripe.Subscription, because the whole point is to read fields the current types no
 * longer admit exist.
 */
interface PeriodBearingSubscription {
  current_period_end?: number | null;
  trial_end?: number | null;
  items?: {data?: Array<{
    current_period_end?: number | null;
    /** Always 1 under the no-add-ons decision. Read so that "not 1" is visible. */
    quantity?: number | null;
    price?: {id?: string | null;recurring?: {interval?: string | null;} | null;} | null;
  }> | null;} | null;
}

/**
 * End of the period the customer has actually paid for.
 *
 * With multiple items the latest item end is used: access should last as long as anything
 * on the subscription is paid up. Batchlabel subscriptions have exactly one item, so in
 * practice this is that item's period end.
 */
export function subscriptionPeriodEnd(subscription: Stripe.Subscription | unknown): string | null {
  const sub = subscription as PeriodBearingSubscription;
  const itemEnds = (sub.items?.data ?? []).
  map((item) => item?.current_period_end).
  filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  if (itemEnds.length > 0) return toIso(Math.max(...itemEnds));
  return toIso(sub.current_period_end);
}

export function subscriptionTrialEnd(subscription: Stripe.Subscription | unknown): string | null {
  return toIso((subscription as PeriodBearingSubscription).trial_end);
}

/**
 * Every item's price id, in payload order.
 *
 * For the brand check, which must not depend on which item Stripe happened to list first.
 */
export function subscriptionPriceIds(subscription: Stripe.Subscription | unknown): (string | null)[] {
  const sub = subscription as PeriodBearingSubscription;
  return (sub.items?.data ?? []).map((item) => item?.price?.id ?? null);
}

/** Why `subscriptionPriceId` declined to name a price. Distinct values because the two
 *  mean very different things to whoever reads the log. */
export type PriceIdRefusal = 'no_items' | 'multiple_items' | 'quantity_not_one' | 'no_price';

/**
 * THE price id, for tier resolution — or a reason it will not say.
 *
 * Refuses when the subscription does not have exactly one item, or when that item's quantity
 * is present and not 1. Under the no-add-ons decision both are impossible for a subscription
 * we created, so either one means the object means something this code does not model — for
 * instance quantity 3 on a Studio price, which a human would read as three Studio allowances
 * and which a bare `[0]` read would silently grant as one.
 *
 * The refusal propagates to `plan: null` — leave the tier alone — plus an error log. A
 * visible "we did not change anything and here is why" beats a confident wrong tier.
 */
export function readSubscriptionPriceId(
subscription: Stripe.Subscription | unknown)
: {priceId: string;refusal: null;} | {priceId: null;refusal: PriceIdRefusal;} {
  const items = (subscription as PeriodBearingSubscription).items?.data ?? [];
  if (items.length === 0) return { priceId: null, refusal: 'no_items' };
  if (items.length > 1) return { priceId: null, refusal: 'multiple_items' };
  const item = items[0];
  if (typeof item?.quantity === 'number' && item.quantity !== 1) {
    return { priceId: null, refusal: 'quantity_not_one' };
  }
  const priceId = item?.price?.id ?? null;
  return priceId ? { priceId, refusal: null } : { priceId: null, refusal: 'no_price' };
}

/** The price id alone, for callers that do not need to log the reason. */
export function subscriptionPriceId(subscription: Stripe.Subscription | unknown): string | null {
  return readSubscriptionPriceId(subscription).priceId;
}

/**
 * STRIPE's interval vocabulary — 'month' | 'year' — recorded in data->'billing' as a
 * cross-check only.
 *
 * The authority on the interval is now the resolved price entry, which speaks OUR vocabulary
 * ('monthly' | 'annual') and is the same value the checkout wrote into Stripe metadata. The
 * two vocabularies must not be conflated, so both are stored under distinct keys: if they
 * ever disagree, the price index is wrong about an interval, which is a config bug worth
 * seeing rather than one to paper over.
 */
export function subscriptionInterval(subscription: Stripe.Subscription | unknown): string | null {
  const sub = subscription as PeriodBearingSubscription;
  return sub.items?.data?.[0]?.price?.recurring?.interval ?? null;
}

/**
 * The id of an expandable Stripe field, whether or not it was expanded.
 * `subscription` on a Checkout Session is `string | Subscription | null` depending on the
 * expand parameters used, and reading `.id` off a string is how you get `undefined` into a
 * database column.
 */
export function idOf(value: string | {id?: string;} | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return typeof value.id === 'string' ? value.id : null;
}

/**
 * The subscription metadata Stripe snapshots onto an invoice at finalisation.
 *
 * Present only for invoices created since June 2023, and only where the subscription had
 * metadata — so callers must treat `null` as "unknown", never as "not ours".
 */
export function invoiceSubscriptionMetadata(
invoice: Stripe.Invoice | unknown)
: Stripe.Metadata | null {
  const inv = invoice as {
    parent?: {subscription_details?: {metadata?: Stripe.Metadata | null;} | null;} | null;
    subscription_details?: {metadata?: Stripe.Metadata | null;} | null;
  };
  return inv.parent?.subscription_details?.metadata ?? inv.subscription_details?.metadata ?? null;
}

/** Handles both `invoice.subscription` (old) and `invoice.parent...` (2025-03-31.basil+). */
export function invoiceSubscriptionId(invoice: Stripe.Invoice | unknown): string | null {
  const inv = invoice as {
    subscription?: string | {id?: string;} | null;
    parent?: {subscription_details?: {subscription?: string | {id?: string;} | null;} | null;} | null;
  };
  return idOf(inv.parent?.subscription_details?.subscription) ?? idOf(inv.subscription);
}

/**
 * True when a failed invoice is a RENEWAL failure rather than the first charge.
 *
 * It matters because the two mean opposite things. A failed renewal is a paying customer
 * whose card bounced — past_due, keep their access, chase the card. A failed first charge
 * is somebody who never successfully subscribed at all, and marking them past_due would
 * read as "was paying, now isn't" in every report we ever write.
 */
export function isRenewalFailure(invoice: Stripe.Invoice | unknown): boolean {
  const reason = (invoice as {billing_reason?: string | null;}).billing_reason;
  return reason === 'subscription_cycle' || reason === 'subscription_update';
}
