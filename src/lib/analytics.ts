/**
 * Batchlabel event layer.
 *
 * Every event is pushed to the GTM dataLayer. Nothing is sent to a vendor directly, so
 * consent gating lives in one place (the GTM container plus Consent Mode v2).
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
 *                                                            advertising_opt_in gates ad use.
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

export type AnalyticsPayload = Record<string, string | number | boolean | null | undefined>;

function push(event: string, payload: AnalyticsPayload = {}) {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];
  const attribution = getAttribution();
  window.dataLayer.push({
    event,
    ...payload,
    // First touch click identifiers travel with every event so GTM can stamp them onto
    // GA4 user properties without re-reading storage.
    attr_source: attribution.utm_source,
    attr_medium: attribution.utm_medium,
    attr_campaign: attribution.utm_campaign,
    attr_gclid: attribution.gclid,
    attr_fbclid: attribution.fbclid
  });
}

export function trackPageView(path: string, title: string) {
  push('page_view', { page_path: path, page_title: title });
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