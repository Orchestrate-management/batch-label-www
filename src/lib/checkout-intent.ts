/**
 * Remembering which plan someone was about to buy, across a signup.
 *
 * Checkout requires a session (see api/create-checkout-session.ts for why that is a
 * security decision, not just a product one), so a signed-out visitor pressing "Get the
 * Maker plan" has to sign up first. Without this they come back to an empty pricing page
 * with the monthly toggle reset, and the annual buyer we just interrupted is now a monthly
 * buyer or no buyer at all.
 *
 * localStorage rather than router state or sessionStorage, because the email-confirmation
 * signup path breaks both: the maker leaves the tab, clicks a link in their inbox, and may
 * well land in a different tab entirely. It carries no personal data — just which of two
 * buttons was pressed — and it expires, so a stale intent from last month cannot quietly
 * change what someone is buying today.
 *
 * Deliberately NOT auto-resumed into a redirect to Stripe. Being thrown at a payment page
 * by a page load you did not ask for is alarming; the interval is simply preselected so the
 * purchase is one deliberate click.
 */

import type { BillingInterval } from './billing';

export const CHECKOUT_INTENT_KEY = 'bl_checkout_intent';

/** An hour. Long enough for an email confirmation, short enough not to be a surprise. */
export const CHECKOUT_INTENT_TTL_MS = 60 * 60 * 1000;

interface StoredIntent {
  interval: BillingInterval;
  saved_at: number;
}

export function saveCheckoutIntent(interval: BillingInterval): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: StoredIntent = { interval, saved_at: Date.now() };
    window.localStorage.setItem(CHECKOUT_INTENT_KEY, JSON.stringify(payload));
  } catch {

    // Storage can be blocked. Losing the interval is a worse pricing page, not a broken one.
  }}

/** The remembered interval, or null when there is none, it expired, or it is malformed. */
export function readCheckoutIntent(now: number = Date.now()): BillingInterval | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CHECKOUT_INTENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredIntent> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.saved_at !== 'number' || now - parsed.saved_at > CHECKOUT_INTENT_TTL_MS) {
      return null;
    }
    return parsed.interval === 'annual' || parsed.interval === 'monthly' ? parsed.interval : null;
  } catch {
    return null;
  }
}

export function clearCheckoutIntent(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CHECKOUT_INTENT_KEY);
  } catch {}
}
