/**
 * Brand membership: the completion gate for OAuth signups.
 *
 * An email signup arrives fully provisioned — auth.signUp carries the brand, business
 * name, attribution and consents in its metadata, and the database trigger turns that
 * into a brand_memberships row plus the consent audit trail before the user ever sees
 * the dashboard.
 *
 * An OAuth signup cannot. signInWithOAuth has nowhere to put that payload, so a user
 * comes back from Google signed in but with no membership and, more importantly, with no
 * Terms of Service acceptance on file. This module is how we notice (fetchMembershipState)
 * and how we fix it (completeOAuthSignup, which calls the complete_oauth_signup
 * SECURITY DEFINER function — see supabase/migrations/20260731120000).
 */

import { supabase } from './supabase';
import { BRAND_SLUG } from './brand';
import { signupAgreementDocuments } from './agreements';
import { attributionForMetadata } from './attribution';

/**
 * - `complete`    the user has a membership for this brand; let them through.
 * - `needs_setup` signed in, but no membership. Send them to the completion screen.
 * - `unknown`     we could not tell (Supabase not configured, or the read failed).
 */
export type MembershipState = 'complete' | 'needs_setup' | 'unknown';

/**
 * Reads whether the signed-in user has a membership for this brand.
 *
 * RLS ("own memberships are readable") means this can only ever see the caller's own
 * row, so no filtering on user id is needed here.
 *
 * A failed read returns `unknown` rather than `needs_setup` on purpose: a flaky network
 * should not push an established customer into a signup screen, and `unknown` is treated
 * as "let them through" by the gate below.
 */
export async function fetchMembershipState(): Promise<MembershipState> {
  if (!supabase) return 'unknown';
  const { data, error } = await supabase.
  from('brand_memberships').
  select('id').
  eq('brand_slug', BRAND_SLUG).
  maybeSingle();
  if (error) return 'unknown';
  return data ? 'complete' : 'needs_setup';
}

export const FINISH_SETUP_PATH = '/finish-setup';
export const DASHBOARD_PATH = '/dashboard';

/**
 * Where a signed-in user should be sent, or null to render the page they asked for.
 *
 * Kept as a plain function so the routing rule is testable on its own, and so both ends
 * of the gate use the same rule and cannot disagree into a redirect loop:
 * the dashboard only ever pushes people OUT on `needs_setup`, and the completion screen
 * only ever pushes people out on `complete`. `unknown` never redirects, from either side.
 */
export function membershipRedirect(
state: MembershipState,
page: 'dashboard' | 'finish_setup')
: string | null {
  if (page === 'dashboard') return state === 'needs_setup' ? FINISH_SETUP_PATH : null;
  return state === 'complete' ? DASHBOARD_PATH : null;
}

export interface CompletionInput {
  businessName: string;
  termsAccepted: boolean;
  marketingEmailOptIn: boolean;
  advertisingOptIn: boolean;
}

/**
 * The arguments for complete_oauth_signup.
 *
 * Note what is NOT here: no user id (the function takes it from the caller's JWT), no
 * acceptance timestamp (stamped server-side), and no `accepted` flag buried inside the
 * document snapshots (the booleans below are the only source of that).
 *
 * Attribution survives the Google round trip because it lives in localStorage and a
 * first-party cookie, so the first-touch record captured before the redirect is still
 * there afterwards and lands on the membership exactly as it does for an email signup.
 */
export function completionPayload(input: CompletionInput) {
  return {
    p_brand: BRAND_SLUG,
    p_business_name: input.businessName.trim() || null,
    p_terms_accepted: input.termsAccepted,
    p_marketing_email_opt_in: input.marketingEmailOptIn,
    p_advertising_opt_in: input.advertisingOptIn,
    p_agreements: signupAgreementDocuments(),
    p_attribution: attributionForMetadata()
  };
}

export interface CompletionResult {
  error: string | null;
  /** True when this call created the membership, false when one already existed. */
  provisioned: boolean;
}

/**
 * Provisions the membership and records the consent decisions for an OAuth user.
 *
 * Refuses to send an unaccepted Terms box at all. The database refuses it too; this half
 * exists so the user gets a sentence instead of a Postgres error.
 */
export async function completeOAuthSignup(input: CompletionInput): Promise<CompletionResult> {
  if (!input.termsAccepted) {
    return { error: 'Please accept the Terms of Service to finish setting up your account.', provisioned: false };
  }
  if (!supabase) return { error: 'Sign in is not connected.', provisioned: false };

  const { data, error } = await supabase.rpc('complete_oauth_signup', completionPayload(input));
  if (error) {
    return { error: 'Could not finish setting up your account. Please try again.', provisioned: false };
  }
  return { error: null, provisioned: data === true };
}
