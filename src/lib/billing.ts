/**
 * Stripe Checkout and Customer Portal, client side half.
 *
 * Both calls hit our own API routes (the root `/api` directory — see src/api/README.md for
 * why that location matters) so secret keys and price ids never reach the browser. Stripe
 * Tax is on and every price is stored EXCLUSIVE of VAT, so the amounts below are ex-VAT and
 * must be labelled as such wherever they are rendered.
 *
 * THIS MODULE IS ON ITS WAY OUT. Under the decided flow the app's billing page is the single
 * place a customer picks a tier and is sent to Stripe Checkout; www keeps the public pricing
 * page, whose buttons route a visitor into the app rather than creating a session here. What
 * remains is kept alive only because www's own pages still import it, and it now speaks the
 * endpoint's current contract (a `tier` as well as an interval) so that it cannot become the
 * one caller that breaks when the endpoint gains a required field.
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
import { advertisingConsentFromBanner } from './consent';
import { isValidFbc, isValidFbp } from './meta-events';
import { PLANS, priceForInterval } from './plans';
import { supabase } from './supabase';

export type BillingInterval = 'monthly' | 'annual';

/**
 * The tier this module can ask for. www sells one tier from its own pages; the ladder lives
 * on the app's billing page, which posts its own tier to the same endpoint.
 *
 * Kept as a plain string union rather than imported from the plan contract, because the
 * contract is server-only and must never reach a browser bundle. `plan-contract.test.ts`
 * asserts this union is a subset of the contract's purchasable tiers, so the two cannot
 * drift without a test going red.
 */
export type CheckoutTier = 'maker' | 'studio' | 'consultant';

export const DEFAULT_CHECKOUT_TIER: CheckoutTier = 'maker';

/**
 * Maker's two amounts in major GBP units, EXCLUSIVE of VAT.
 *
 * DERIVED, NOT DECLARED. This used to be the second place a price was written down on www —
 * `src/lib/plans.ts` being the first — and two hand-maintained copies of a price is the
 * failure mode that puts one number on a pricing card and a different one on the invoice.
 * There is now exactly one client-side projection, `PLANS`, and this reads from it, so it
 * cannot drift by construction. `plan-contract.test.ts` asserts that projection against the
 * server contract, which is the alarm that catches a price changed in only one of them.
 *
 * IT SURVIVES ONLY FOR ITS TWO REMAINING CALLERS on this branch (`src/pages/Pricing.tsx` and
 * `src/lib/structured-data.ts`), both of which read from `PLANS` directly on the copy branch.
 * Delete it once those land — nothing else imports it.
 */
export const PRICES: Record<BillingInterval, number> = {
  monthly: PLANS.maker.monthlyPence / 100,
  annual: PLANS.maker.annualPence / 100
};

/**
 * The ex-VAT value in major GBP units to report to the analytics layer for a tier and
 * interval, or 0 when this deploy's projection has no amount for that pair.
 *
 * Keyed on the TIER as well as the interval. It used to read Maker's price whatever was being
 * bought, so a Consultant annual checkout — £1,990 — was reported to GA4 and Meta as a £140
 * begin_checkout. That is not a display bug: an ad platform optimises against those numbers.
 *
 * Ex-VAT deliberately, matching the rule the server applies to the Purchase event: prices are
 * stored exclusive of VAT, so a tax-inclusive value would make the same tier worth different
 * amounts in different countries and corrupt ROAS.
 */
function checkoutValue(tier: CheckoutTier, interval: BillingInterval): number {
  const pence = priceForInterval(PLANS[tier], interval);
  return pence === null ? 0 : pence / 100;
}

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

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

/**
 * Meta's `_fbp` and `_fbc` cookies, for the server-side Purchase event.
 *
 * These are written by the Pixel, and the Pixel only loads for somebody who granted
 * marketing consent — so in the normal case the cookies simply do not exist without
 * consent and there is nothing to send. The explicit `advertisingConsentFromBanner()`
 * check is not redundant: a maker who accepted, browsed, and then withdrew has cookies
 * from the consented period. `setMetaConsent(false)` deletes them, but a cookie that a
 * browser extension resurrected, or one written on a different subdomain, must not be able
 * to leak past a withdrawal. Two independent reasons to send nothing beats one.
 *
 * Both values are format-checked here as well as on the server. The server check is the
 * one that counts — this half runs in a browser and can be bypassed — but checking here
 * means a malformed cookie is dropped rather than making a round trip to be rejected.
 */
function metaCookiesForCheckout(): {fbp?: string;fbc?: string;} {
  if (!advertisingConsentFromBanner()) return {};
  const out: {fbp?: string;fbc?: string;} = {};
  const fbp = readCookie('_fbp');
  const fbc = readCookie('_fbc');
  if (isValidFbp(fbp)) out.fbp = fbp;
  if (isValidFbc(fbc)) out.fbc = fbc;
  return out;
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
export async function startCheckout(
interval: BillingInterval,
tier: CheckoutTier = DEFAULT_CHECKOUT_TIER)
: Promise<{error: string | null;}> {
  const value = checkoutValue(tier, interval);
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
        // REQUIRED by the endpoint, which allow-lists it and 400s on anything else. It
        // selects which server-only env var holds the price id; it does not name a price,
        // an amount or a currency, none of which this module has ever seen.
        tier,
        interval,
        // Click identifiers ride along so the webhook can forward a server-side conversion
        // later without guessing which ad produced the sale.
        attribution: getAttribution(),
        // Meta's own cookies, when consent allowed them to exist. They give the server-side
        // Purchase a real browser identity to match against instead of a reconstruction.
        meta: metaCookiesForCheckout()
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
