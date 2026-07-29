/**
 * Stripe Checkout and Customer Portal, client side half.
 *
 * Both calls hit our own API routes (see the api folder) so secret keys and price ids
 * never reach the browser. Stripe Tax is assumed to be on, and the Maker prices are
 * stored in Stripe as VAT inclusive for consumers.
 */

import { trackBeginCheckout, trackPurchaseRedirect } from './analytics';
import { getAttribution } from './attribution';

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
 * Fires begin_checkout, asks the server for a Checkout Session, fires
 * purchase_redirect, then hands the maker over to Stripe.
 */
export async function startCheckout(
interval: BillingInterval,
options: {email?: string | null;userId?: string | null;} = {})
: Promise<{error: string | null;}> {
  const value = PRICES[interval];
  trackBeginCheckout(interval, value);

  try {
    const response = await fetch(CHECKOUT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        interval,
        email: options.email ?? null,
        user_id: options.userId ?? null,
        // Click identifiers ride along so the webhook can forward a server side
        // conversion later without guessing which ad produced the sale.
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

/** Opens the Stripe Customer Portal for the signed in maker. */
export async function openBillingPortal(userId: string | null): Promise<{error: string | null;}> {
  try {
    const response = await fetch(PORTAL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId })
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