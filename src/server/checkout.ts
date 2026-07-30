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


export type BillingInterval = 'monthly' | 'annual';

/** Anything that is not exactly 'annual' is monthly. Never trust the string as-is. */
export function resolveInterval(value: unknown): BillingInterval {
  return value === 'annual' ? 'annual' : 'monthly';
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

export interface CheckoutMetadataInput {
  /** From the verified JWT. Null for an anonymous checkout from the pricing page. */
  userId: string | null;
  /** A server constant, never a request parameter. */
  brand: string;
  interval: BillingInterval;
  plan: string;
  attribution: unknown;
}

/**
 * The metadata block written to BOTH the session and the subscription.
 *
 * Stripe rejects null metadata values, so absent facts are omitted rather than sent as
 * empty strings — an empty `supabase_user_id` would read as "linked to nobody" downstream
 * and is indistinguishable from a bug.
 */
export function checkoutMetadata(input: CheckoutMetadataInput): Record<string, string> {
  const metadata: Record<string, string> = {
    brand: input.brand,
    plan: input.plan,
    billing_interval: input.interval
  };
  if (input.userId) metadata.supabase_user_id = input.userId;
  return { ...metadata, ...sanitiseAttribution(input.attribution) };
}
