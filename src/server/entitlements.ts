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

/** The free tier. Anything that is not this is a paid entitlement. */
export const FREE_PLAN = 'free';

/** The one paid tier Batchlabel sells today. */
export const MAKER_PLAN = 'maker';

/**
 * Every paid tier this deployment is willing to grant.
 *
 * An allow-list rather than a free-text field: the plan can be read from Stripe metadata
 * (which we wrote, and which arrives inside a signature-verified event), but a value that
 * is not on this list is ignored rather than stored. That keeps a hand-edited subscription
 * in the Stripe dashboard from inventing a tier the product has no idea how to price.
 */
export const PAID_PLANS: readonly string[] = [MAKER_PLAN];

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
export function planForStatus(status: string | null | undefined, paidPlan: string): string {
  return isEntitlingStatus(status) ? paidPlan : FREE_PLAN;
}

/** Maps a Stripe price id to the plan it sells. */
export interface PriceMap {
  [priceId: string]: string;
}

export function buildPriceMap(env: {
  STRIPE_PRICE_MAKER_MONTHLY?: string;
  STRIPE_PRICE_MAKER_ANNUAL?: string;
}): PriceMap {
  const map: PriceMap = {};
  if (env.STRIPE_PRICE_MAKER_MONTHLY) map[env.STRIPE_PRICE_MAKER_MONTHLY] = MAKER_PLAN;
  if (env.STRIPE_PRICE_MAKER_ANNUAL) map[env.STRIPE_PRICE_MAKER_ANNUAL] = MAKER_PLAN;
  return map;
}

/**
 * The plan a price sells.
 *
 * An unrecognised price falls back to MAKER_PLAN on purpose. Batchlabel sells exactly one
 * paid product; if the founder creates a replacement price, or runs a one-off custom
 * price for a workshop, the alternative is a customer who has paid and gets nothing. The
 * fallback can only ever be reached from a signature-verified subscription that Stripe says
 * is active, so it grants the tier we sell, never more.
 */
export function planForPrice(priceId: string | null | undefined, prices: PriceMap): string {
  if (priceId && prices[priceId]) return prices[priceId];
  return MAKER_PLAN;
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
  items?: {data?: Array<{current_period_end?: number | null;price?: {id?: string | null;recurring?: {interval?: string | null;} | null;} | null;}> | null;} | null;
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

export function subscriptionPriceId(subscription: Stripe.Subscription | unknown): string | null {
  const sub = subscription as PeriodBearingSubscription;
  return sub.items?.data?.[0]?.price?.id ?? null;
}

/** 'month' | 'year', recorded in data->'billing' for the account screen. */
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
