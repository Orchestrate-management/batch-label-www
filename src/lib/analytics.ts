/**
 * Batchlabel event layer.
 *
 * Every event goes onto the dataLayer AND through gtagEvent, because GA4 is loaded
 * directly and acts only on gtag commands — see src/TRACKING.md. Consent gating is
 * Consent Mode v2 (lib/consent.ts), which holds the tag denied until the maker chooses.
 *
 * EVENT REFERENCE (create a matching Custom Event trigger in GTM for each one):
 *
 *  page_view          { page_path, page_title }              Every route change.
 *  view_pricing       { page_path }                          Pricing page viewed.
 *  cta_click          { cta_label, cta_location, page_path }  Any primary or secondary CTA.
 *  sign_up_started    { method: 'password' | 'magic_link'      Sign up form submitted, or
 *                       | 'google' }                           Continue with Google pressed.
 *  sign_up_completed  { method, user_id, em_sha256,           Account created. em_sha256
 *                       marketing_email_opt_in,                feeds Meta advanced matching
 *                       advertising_opt_in }                   and Google Enhanced Conversions.
 *                                                            advertising_opt_in is DERIVED
 *                                                            from the cookie banner, never a
 *                                                            signup box — see docs/CONSENT.md.
 *                                                            method 'google' fires at the END
 *                                                            of the completion step, not at the
 *                                                            redirect, because that is where
 *                                                            consent is actually given.
 *  begin_checkout     { plan, interval, value, currency }     Paid plan CTA pressed.
 *  purchase_redirect  { plan, interval, value, currency,      Immediately before the
 *                       checkout_session_id }                 redirect to Stripe Checkout.
 *
 * The actual purchase event is intentionally NOT fired in the browser. It is raised
 * server side from the Stripe webhook so refunds and failed cards cannot inflate it.
 * See api/stripe-webhook.ts.
 */

import { getAttribution } from './attribution';
import { gtagEvent } from './consent';

export type AnalyticsPayload = Record<string, string | number | boolean | null | undefined>;

/** GA4 ignores null and undefined params but still counts them against the 25 per event. */
function compact(payload: AnalyticsPayload): Record<string, string | number | boolean> {
  return Object.entries(payload).reduce<Record<string, string | number | boolean>>(
    (acc, [key, value]) => {
      if (value !== null && value !== undefined) acc[key] = value;
      return acc;
    },
    {}
  );
}

function push(event: string, payload: AnalyticsPayload = {}) {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];
  const attribution = getAttribution();
  const withAttribution: AnalyticsPayload = {
    ...payload,
    // First touch click identifiers travel with every event, so the ad that produced a
    // signup is on the event itself rather than having to be re-read from storage.
    attr_source: attribution.utm_source,
    attr_medium: attribution.utm_medium,
    attr_campaign: attribution.utm_campaign,
    attr_gclid: attribution.gclid,
    attr_fbclid: attribution.fbclid
  };

  // dataLayer keeps the full record, nulls and all. It is what a tag manager would read
  // if one is ever put in front of this, and it is what the tests assert against.
  window.dataLayer.push({ event, ...withAttribution });

  // GA4 only acts on gtag commands, so this is the call that actually reports. Without
  // it the dataLayer push above would be inert and every event below would be lost.
  gtagEvent(event, compact(withAttribution));
}

export function trackPageView(path: string, title: string) {
  push('page_view', {
    page_path: path,
    page_title: title,
    // GA4's own page_view dimension. The SPA sends this itself (config sets
    // send_page_view: false), so the full URL has to be supplied per route change.
    page_location: typeof window === 'undefined' ? null : window.location.href
  });
}

export function trackViewPricing(path: string) {
  push('view_pricing', { page_path: path });
}

export function trackCtaClick(label: string, location: string) {
  push('cta_click', {
    cta_label: label,
    cta_location: location,
    page_path: typeof window === 'undefined' ? null : window.location.pathname
  });
}

export type SignUpMethod = 'password' | 'magic_link' | 'google';

export function trackSignUpStarted(method: SignUpMethod) {
  push('sign_up_started', { method });
}

export async function trackSignUpCompleted(
method: SignUpMethod,
email: string,
userId?: string,
marketingEmailOptIn?: boolean,
advertisingOptIn?: boolean)
{
  push('sign_up_completed', {
    method,
    user_id: userId ?? null,
    em_sha256: await sha256(email.trim().toLowerCase()),
    marketing_email_opt_in: marketingEmailOptIn ?? null,
    advertising_opt_in: advertisingOptIn ?? null
  });
}

export function trackBeginCheckout(interval: 'monthly' | 'annual', value: number) {
  push('begin_checkout', { plan: 'maker', interval, value, currency: 'GBP' });
}

export function trackPurchaseRedirect(
interval: 'monthly' | 'annual',
value: number,
checkoutSessionId: string)
{
  push('purchase_redirect', {
    plan: 'maker',
    interval,
    value,
    currency: 'GBP',
    checkout_session_id: checkoutSessionId
  });
}

/** SHA-256 hex, used for Meta advanced matching and Google Enhanced Conversions. */
export async function sha256(value: string): Promise<string | null> {
  if (!value || typeof crypto === 'undefined' || !crypto.subtle) return null;
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).
  map((byte) => byte.toString(16).padStart(2, '0')).
  join('');
}