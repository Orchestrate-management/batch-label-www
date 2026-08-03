/**
 * The service-role half of billing: identifying the caller, reading their membership, and
 * the one function allowed to write entitlements.
 *
 * SECURITY MODEL, in one paragraph. The service role bypasses row level security entirely,
 * so anything in this file could read or rewrite every account. It is therefore never
 * handed a user id from a request body. Identity comes from exactly two places:
 *
 *   * `userFromRequest` — a Supabase access token in the Authorization header, verified by
 *     asking the Supabase Auth server who it belongs to. Same principle as the
 *     `auth.uid()` that set_consent and complete_oauth_signup rely on, moved to the edge:
 *     the browser proves who it is, it does not assert it.
 *   * the Stripe webhook — a signature-verified event, whose metadata we wrote ourselves.
 *
 * A `user_id` in a JSON body is not identity, it is a wish. Nothing here reads one.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { EntitlementIntent } from './stripe-events';
import type { ApplyOutcome, EntitlementStore } from './webhook';

export function createAdminClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: {
      // A serverless function has no session to persist and no browser URL to inspect.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

export interface AuthenticatedUser {
  id: string;
  email: string | null;
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * Who is calling, according to Supabase.
 *
 * `auth.getUser(jwt)` is a network call to the Auth server rather than a local decode. That
 * is the point: it re-validates the signature, the expiry AND the fact that the session has
 * not been revoked, using a key we never have to hold. Local verification would need the
 * JWT secret in this environment and would keep honouring tokens after a sign-out.
 */
export async function userFromRequest(
admin: SupabaseClient,
request: Request)
: Promise<AuthenticatedUser | null> {
  const token = bearerToken(request);
  if (!token) return null;

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

export interface MembershipBilling {
  user_id: string;
  brand_slug: string;
  plan: string | null;
  plan_status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

/** The caller's membership for this brand, read with the service role. */
export async function findMembership(
admin: SupabaseClient,
userId: string,
brand: string)
: Promise<MembershipBilling | null> {
  const { data, error } = await admin.
  from('brand_memberships').
  select('user_id, brand_slug, plan, plan_status, stripe_customer_id, stripe_subscription_id').
  eq('user_id', userId).
  eq('brand_slug', brand).
  maybeSingle();

  if (error) throw new Error(error.message);
  return (data as MembershipBilling | null) ?? null;
}

/**
 * THE SERVER-SIDE ADVERTISING CONSENT GATE.
 *
 * Answers the only question `src/server/meta-capi.ts` is allowed to act on: may we forward
 * anything about this person to an advertising platform? Two facts come back together on
 * purpose, because they have to be about the same individual:
 *
 *  1. `advertising_opt_in` from `brand_memberships`, read with the service role and keyed on
 *     the Supabase user id that our own checkout wrote into the Checkout Session metadata.
 *     RLS is bypassed here, so the user_id and brand filters are doing real work.
 *
 *  2. The VERIFIED auth email, from `auth.admin.getUserById` — not `profiles.email`, which is
 *     user-writable and could therefore be pointed at somebody else, and not the address
 *     typed into Stripe Checkout, which is whatever the cardholder felt like entering. The
 *     permission we just checked belongs to the auth user; the email we hash and send has to
 *     belong to that same auth user or the consent proves nothing about the data.
 *
 * THIS FUNCTION THROWS RATHER THAN RETURNING A DEFAULT. That is the whole design. A caller
 * that received `{ optedIn: false }` for a database outage could not tell it apart from a
 * genuine refusal, and the difference matters for logging and for anyone later asking why a
 * conversion is missing. The caller catches and fails closed — see createConversionForwarder,
 * where both a throw and a false end in the event being dropped.
 */
export async function findAdvertisingConsent(
admin: SupabaseClient,
userId: string,
brand: string)
: Promise<{optedIn: boolean;email: string | null;}> {
  const { data, error } = await admin.
  from('brand_memberships').
  select('advertising_opt_in').
  eq('user_id', userId).
  eq('brand_slug', brand).
  maybeSingle();

  if (error) throw new Error(`advertising_opt_in lookup failed: ${error.message}`);
  // No membership row is not a yes. There is no record of a permission, so there is no
  // permission — the same rule docs/CONSENT.md sets for the product app ("assume denied
  // when unknown").
  if (!data) return { optedIn: false, email: null };

  const optedIn = data.advertising_opt_in === true;
  // Only fetch the identity we are actually allowed to use. Reading the email for somebody
  // who has declined would be pointless and is exactly the sort of "we had it anyway" that
  // turns into an accidental send later.
  if (!optedIn) return { optedIn: false, email: null };

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
  if (userError) throw new Error(`auth lookup failed: ${userError.message}`);
  return { optedIn: true, email: userData?.user?.email ?? null };
}

export interface Entitlement {
  brand: string;
  plan: string | null;
  status: string | null;
  membership_status: string | null;
  active: boolean;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

/**
 * Whether this user is already entitled, according to the database's own definition.
 *
 * Read from the `entitlements` view rather than recomputed from the membership columns, so
 * "are they already paying?" has exactly one answer across the webhook, the product app and
 * this endpoint. The view is `security_invoker`, and the service role bypasses RLS, so the
 * user_id filter below is doing real work — without it this would return every row.
 */
export async function findEntitlement(
admin: SupabaseClient,
userId: string,
brand: string)
: Promise<Entitlement | null> {
  const { data, error } = await admin.
  from('entitlements').
  select('brand, plan, status, membership_status, active, current_period_end, cancel_at_period_end').
  eq('user_id', userId).
  eq('brand', brand).
  maybeSingle();

  if (error) throw new Error(error.message);
  return (data as Entitlement | null) ?? null;
}

/**
 * The only entitlement write path in the codebase.
 *
 * Note that it is a single RPC, not a PATCH. The idempotency claim, the ordering guard and
 * the update have to happen in one transaction or they guarantee nothing — a
 * read-then-write from here would race with the second delivery of the same event.
 *
 * ALL SIXTEEN ARGUMENTS ARE NAMED, INCLUDING THE TWO THAT MAY BE NULL. PostgREST resolves an
 * overload by the set of argument names it is given, and 20260802120000_plan_limits.sql drops
 * the 14-argument signature precisely so a short call cannot silently land on a function that
 * ignores the allowance. Omitting p_sku_limit and p_editor_seat_limit here would not fail —
 * they default to null — it would simply never write an allowance, which is the defect this
 * call site was fixed for: every membership would keep the fail-closed column defaults
 * (3 SKUs, 1 editor seat) for ever, including a £199/mo Consultant.
 */
export function createEntitlementStore(admin: SupabaseClient): EntitlementStore {
  return {
    async apply(intent: EntitlementIntent): Promise<ApplyOutcome> {
      const { data, error } = await admin.rpc('apply_stripe_entitlement', {
        p_event_id: intent.eventId,
        p_event_type: intent.eventType,
        p_event_at: intent.eventAt,
        p_brand: intent.brand,
        p_user_id: intent.userId,
        p_customer_id: intent.customerId,
        p_subscription_id: intent.subscriptionId,
        // No p_email. The function takes no such argument: an address typed into Stripe
        // Checkout is a claim by whoever is holding the card, never an identity.
        p_plan: intent.plan,
        p_plan_status: intent.planStatus,
        p_price_id: intent.priceId,
        p_current_period_end: intent.currentPeriodEnd,
        p_cancel_at_period_end: intent.cancelAtPeriodEnd,
        p_trial_end: intent.trialEnd,
        p_billing: intent.billing,
        // HOW MUCH, resolved server-side from the plan contract by intentFromEvent. Null when
        // the event says nothing about the tier, which the function reads as leave-alone —
        // and which it also enforces itself, refusing an allowance without a plan.
        p_sku_limit: intent.skuLimit,
        p_editor_seat_limit: intent.editorSeatLimit
      });

      if (error) throw new Error(error.message);
      return (data as ApplyOutcome | null) ?? 'no_membership';
    }
  };
}
