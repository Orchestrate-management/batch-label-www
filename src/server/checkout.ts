/**
 * Building the Checkout Session request. Pure, so the metadata contract can be tested.
 *
 * WHY THE METADATA GOES IN TWO PLACES
 *
 * `metadata` on the Checkout Session is visible on exactly one event:
 * checkout.session.completed. Every later event — every renewal, cancellation, plan change,
 * every customer.subscription.* for the rest of that customer's life — carries the
 * SUBSCRIPTION's metadata instead. Put the Supabase user id only on the session and the
 * webhook can link the first payment and nothing after it.
 *
 * So the same block is written to both `metadata` and `subscription_data.metadata`. That is
 * what lets customer.subscription.updated arrive months later, out of order, possibly
 * before the session event, and still be attributed to the right account.
 *
 * The attribution half rides along for the same reason it exists at all: the browser
 * purchase event is unreliable (ad blockers, consent denial, drop-off on the redirect), so
 * the click identifiers captured on first touch have to survive to the server side of the
 * transaction if a paid conversion is ever to be reported accurately.
 */

import { isValidFbc, isValidFbp } from '../lib/meta-events';
import { PAID_TIERS, type BillingInterval, type PaidTier, type PlanSlug } from './plan-contract';

/** Stripe's limits: 50 keys, 40 chars per key, 500 chars per value. */
const MAX_METADATA_VALUE = 480;
const MAX_ATTRIBUTION_KEYS = 20;

/** Exactly the keys src/lib/attribution.ts produces. Anything else is dropped. */
export const ATTRIBUTION_KEYS: readonly string[] = [
'utm_source',
'utm_medium',
'utm_campaign',
'utm_term',
'utm_content',
'gclid',
'gbraid',
'wbraid',
'fbclid',
'referrer',
'landing_path',
'first_seen_at'];


export type { BillingInterval };

/** Anything that is not exactly 'annual' is monthly. Never trust the string as-is. */
export function resolveInterval(value: unknown): BillingInterval {
  return value === 'annual' ? 'annual' : 'monthly';
}

/**
 * The requested tier, or null.
 *
 * ALLOW-LISTED AND NEVER COERCED, unlike `resolveInterval` directly above it — and a
 * reviewer will ask why two functions side by side behave differently, so: guessing the
 * interval wrong costs a billing period the portal fixes in one click, while guessing the
 * TIER wrong sells the customer a different product from the one they clicked, at a
 * different price, with a different allowance. The interval is also a visible, changeable
 * toggle on the billing page, so a missing one is a client bug that degrades to the cheaper
 * option. The tier is the whole content of the request.
 *
 * Returns null for garbage, for absence, and — deliberately — for 'free' and 'rail_test'.
 * 'free' is not purchasable: it is the ABSENCE of a subscription and has no Stripe price to
 * sell. 'rail_test' is requested through a different field entirely (see resolveRailTest),
 * so a `tier` request can never resolve to the penny price and a penny can never buy a paid
 * tier. The pair is not representable in either direction.
 */
export function resolveTier(value: unknown): PaidTier | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return (PAID_TIERS as readonly string[]).includes(trimmed) ? trimmed as PaidTier : null;
}

/**
 * The £0.01 rail test, requested through its own boolean and honoured only when the server
 * flag is on. Two independent gates, neither sufficient alone: the flag is unset in
 * production except for the minutes it takes to run a live rail test.
 */
export function resolveRailTest(value: unknown, allowed: boolean): boolean {
  return allowed && value === true;
}

/**
 * Copies the first-touch record onto the metadata, allow-listed and truncated.
 *
 * This is the one part of the request body we do use, and it is marketing data rather than
 * identity — it decides which ad gets credited, never who gets a plan. It is still
 * filtered: an unbounded object from the browser would blow Stripe's metadata limits and
 * turn a paid checkout into a 400.
 */
export function sanitiseAttribution(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of ATTRIBUTION_KEYS) {
    if (Object.keys(out).length >= MAX_ATTRIBUTION_KEYS) break;
    const value = source[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    out[key] = trimmed.slice(0, MAX_METADATA_VALUE);
  }
  return out;
}

/**
 * Meta's own browser cookies, captured at checkout time and carried to the webhook.
 *
 * WHY THESE ARE WORTH CARRYING, when `fbclid` is already in the attribution record.
 *
 * `_fbp` is the Pixel's first-party browser id and is the single strongest signal for
 * matching a server event back to a browser session; Meta weights it heavily in match
 * quality. `_fbc` is the Pixel's own click cookie — when it exists, sending it verbatim
 * means the browser's identifier and the server's are byte-identical, which beats even a
 * correctly reconstructed one.
 *
 * They are NOT first-touch data, which is why they are separate from the attribution
 * record rather than bolted onto it: attribution is written once and never overwritten,
 * while these are live cookies read at the moment of checkout.
 *
 * They are self-gating on consent, which is the neat part. Both cookies only exist because
 * `fbevents.js` wrote them, and `src/lib/meta-pixel.ts` only loads `fbevents.js` for
 * somebody who granted marketing consent — and deletes both cookies if that consent is
 * later withdrawn. No consent, no cookies, nothing to carry. `src/lib/billing.ts` checks
 * the banner as well, so the gate does not rest on cookie lifetime alone.
 */
export interface MetaCookies {
  fbp?: string;
  fbc?: string;
}

/**
 * Validates browser-supplied Meta cookie values before they go anywhere near Stripe.
 *
 * A request body is a claim. Without this, a caller could put 480 characters of anything
 * into our Stripe metadata and, from there, into a Meta event attributed to our dataset.
 * Both formats are fixed and documented, so they are checked rather than trusted.
 */
export function sanitiseMetaCookies(input: unknown): MetaCookies {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  const out: MetaCookies = {};
  if (isValidFbp(source.fbp)) out.fbp = source.fbp.trim();
  if (isValidFbc(source.fbc)) out.fbc = source.fbc.trim();
  return out;
}

export interface CheckoutMetadataInput {
  /** From the verified JWT. Null for an anonymous checkout from the pricing page. */
  userId: string | null;
  /** A server constant, never a request parameter. */
  brand: string;
  /**
   * BOTH of these come from the SERVER-RESOLVED price entry — planEntryForPrice(priceId) —
   * never from the request body. The body's `tier` selects which env var to read and is then
   * discarded. That is what closes the round trip: a claim the price does not support cannot
   * survive into Stripe, so even a bug in the request validation would write the tier the
   * price actually sells rather than the one the caller asked for.
   */
  interval: BillingInterval;
  plan: PlanSlug;
  attribution: unknown;
  /** Meta's `_fbp` / `_fbc`, if the browser had them. Validated by the caller. */
  meta?: MetaCookies;
}

/**
 * The metadata block written to BOTH the session and the subscription.
 *
 * Stripe rejects null metadata values, so absent facts are omitted rather than sent as
 * empty strings — an empty `supabase_user_id` would read as "linked to nobody" downstream
 * and is indistinguishable from a bug.
 */
export function checkoutMetadata(input: CheckoutMetadataInput): Record<string, string> {
  const trusted: Record<string, string> = {
    brand: input.brand,
    plan: input.plan,
    billing_interval: input.interval
  };
  if (input.userId) trusted.supabase_user_id = input.userId;
  // Grouped with the trusted block because they have already been format-validated by
  // sanitiseMetaCookies, and because they must not be overridable by an attribution key of
  // the same name.
  if (input.meta?.fbp) trusted.fbp = input.meta.fbp;
  if (input.meta?.fbc) trusted.fbc = input.meta.fbc;

  // The trusted block is spread LAST so it always wins. Today ATTRIBUTION_KEYS happens to
  // contain no key called `brand`, `plan` or `supabase_user_id`, so the order does not
  // change the result — but the day somebody adds a marketing field called `brand` to that
  // list, the other order would silently hand a request body control of the value the
  // webhook treats as the tenant. Structurally impossible beats incidentally true.
  return { ...sanitiseAttribution(input.attribution), ...trusted };
}
