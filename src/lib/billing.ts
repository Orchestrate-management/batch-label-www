/**
 * Stripe Checkout and Customer Portal, client side half.
 *
 * Both calls hit our own API routes (the root `/api` directory — see src/api/README.md for
 * why that location matters) so secret keys and price ids never reach the browser. Stripe
 * Tax is on, and the Maker prices are stored in Stripe VAT-inclusive for consumers.
 *
 * WHAT THIS MODULE DELIBERATELY NO LONGER SENDS
 *
 * It used to post `user_id` and `email` in the request body, and the server used them. That
 * is a claim, not a proof: anyone could change the id in devtools and put a subscription on
 * someone else's account, or open their billing portal. Both endpoints now derive identity
 * from the Supabase access token instead — the same principle as the `auth.uid()` that
 * set_consent and complete_oauth_signup rely on, moved to the edge.
 *
 * So the only thing the body carries is what the browser is genuinely the authority on:
 * which billing interval was clicked, and the first-touch attribution.
 *
 * BOTH CALLS NOW REQUIRE A SESSION. Checkout used to work signed out, which forced the
 * webhook to identify the buyer by the email typed into Stripe Checkout — a path that
 * turned out to be exploitable, and that could not link a buyer who had no account at all.
 */

import { trackBeginCheckout, trackPurchaseRedirect } from './analytics';
import { getAttribution } from './attribution';
import { supabase } from './supabase';

export type BillingInterval = 'monthly' | 'annual';

export const PRICES: Record<BillingInterval, number> = {
  monthly: 14,
  annual: 140
};

export const CHECKOUT_ENDPOINT = '/api/create-checkout-session';
export const PORTAL_ENDPOINT = '/api/create-portal-session';

interface CheckoutResponse {
  url?: string;
  id?: string;
  error?: string;
}

/**
 * The caller's Supabase access token, or null when signed out.
 *
 * getSession() is read at call time rather than cached, so a token refreshed in another tab
 * is picked up. A stale token would come back as a 401 the customer cannot act on.
 */
async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

function requestHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/**
 * Fires begin_checkout, asks the server for a Checkout Session, fires purchase_redirect,
 * then hands the maker over to Stripe.
 *
 * REQUIRES A SESSION. Selling to a signed-out visitor meant the webhook had to work out
 * afterwards who had paid, and the only thing it had for that was the email typed into
 * Stripe Checkout — which was exploitable. It also produced sales that could never be
 * honoured, because a buyer with no account had nothing to attach a plan to. Callers should
 * send a signed-out visitor to sign up first (see src/lib/checkout-intent.ts, which
 * remembers which plan they were about to buy).
 */
export async function startCheckout(interval: BillingInterval): Promise<{error: string | null;}> {
  const value = PRICES[interval];
  const token = await accessToken();
  if (!token) {
    return { error: 'Please sign in to subscribe, then press this again.' };
  }

  trackBeginCheckout(interval, value);

  try {
    const response = await fetch(CHECKOUT_ENDPOINT, {
      method: 'POST',
      headers: requestHeaders(token),
      body: JSON.stringify({
        interval,
        // Click identifiers ride along so the webhook can forward a server-side conversion
        // later without guessing which ad produced the sale.
        attribution: getAttribution()
      })
    });

    const payload = (await response.json().catch(() => ({}))) as CheckoutResponse;
    if (!response.ok || !payload.url) {
      return {
        error:
        payload.error ??
        'We could not open the checkout just now. Please try again in a moment or email us.'
      };
    }

    trackPurchaseRedirect(interval, value, payload.id ?? 'unknown');
    window.location.href = payload.url;
    return { error: null };
  } catch {
    return { error: 'We could not reach the checkout. Please check your connection and try again.' };
  }
}

/**
 * Opens the Stripe Customer Portal for the signed-in maker.
 *
 * Takes no arguments on purpose. There is no user id to pass, because the server will not
 * accept one — it resolves the Stripe customer from the token's own identity.
 */
export async function openBillingPortal(): Promise<{error: string | null;}> {
  const token = await accessToken();
  if (!token) {
    return { error: 'Please sign in again to manage your billing.' };
  }

  try {
    const response = await fetch(PORTAL_ENDPOINT, {
      method: 'POST',
      headers: requestHeaders(token),
      body: JSON.stringify({})
    });
    const payload = (await response.json().catch(() => ({}))) as CheckoutResponse;
    if (!response.ok || !payload.url) {
      return { error: payload.error ?? 'We could not open the billing portal. Please email us.' };
    }
    window.location.href = payload.url;
    return { error: null };
  } catch {
    return { error: 'We could not reach the billing portal. Please try again shortly.' };
  }
}
