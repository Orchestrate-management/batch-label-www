/**
 * Reading and updating a user's marketing consents from the account area.
 *
 * Reads go straight through the Supabase client (RLS returns only the caller's own
 * membership row). Writes go through the set_consent SECURITY DEFINER function via
 * supabase.rpc: it identifies the user from their own JWT (auth.uid()) and, in one
 * transaction, updates the flag, the consents snapshot and the immutable audit row —
 * so nobody can forge consent and state can never diverge from the audit trail.
 */

import { supabase } from './supabase';
import { BRAND_SLUG } from './brand';
import type { Agreement } from './agreements';
import { agreementUrl } from './agreements';

export interface ConsentPreferences {
  marketingEmail: boolean;
  advertising: boolean;
}

/** Returns the caller's current opt-in state for this brand, or null if unavailable. */
export async function fetchConsentPreferences(): Promise<ConsentPreferences | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.
  from('brand_memberships').
  select('marketing_email_opt_in, advertising_opt_in').
  eq('brand_slug', BRAND_SLUG).
  maybeSingle();
  if (error || !data) return null;
  return {
    marketingEmail: Boolean(data.marketing_email_opt_in),
    advertising: Boolean(data.advertising_opt_in)
  };
}

/**
 * Records a change to one marketing consent. Sends the current agreement snapshot so the
 * audit row captures which wording was in front of the user; the server stamps the time.
 */
export async function updateConsentPreference(
agreement: Agreement,
accepted: boolean)
: Promise<{error: string | null;}> {
  if (!supabase) return { error: 'Sign in is not connected.' };

  // The atomic set_consent function does the flag + snapshot + audit write together and
  // derives the user from the session JWT, so we just send the agreement snapshot.
  const { error } = await supabase.rpc('set_consent', {
    p_consent_id: agreement.id,
    p_accepted: accepted,
    p_brand: BRAND_SLUG,
    p_title: agreement.title,
    p_version: agreement.version,
    p_url: agreementUrl(agreement)
  });

  if (error) {
    return { error: 'Could not save your preference. Please try again.' };
  }
  return { error: null };
}
