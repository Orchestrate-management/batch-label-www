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
 * The only entitlement write path in the codebase.
 *
 * Note that it is a single RPC, not a PATCH. The idempotency claim, the ordering guard and
 * the update have to happen in one transaction or they guarantee nothing — a
 * read-then-write from here would race with the second delivery of the same event.
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
        p_email: intent.email,
        p_plan: intent.plan,
        p_plan_status: intent.planStatus,
        p_price_id: intent.priceId,
        p_current_period_end: intent.currentPeriodEnd,
        p_cancel_at_period_end: intent.cancelAtPeriodEnd,
        p_trial_end: intent.trialEnd,
        p_billing: intent.billing
      });

      if (error) throw new Error(error.message);
      return (data as ApplyOutcome | null) ?? 'no_membership';
    }
  };
}
