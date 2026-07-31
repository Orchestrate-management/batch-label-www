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
 *                       advertising_opt_in }                   and Google Enhanced Conversions,
 *                                                              and is NULL without advertising
 *                                                              consent — see the function.
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
 *
 * META PIXEL EVENTS ARE MAPPED HERE, NOT SCATTERED THROUGH COMPONENTS
 *
 * Each helper below raises its GA4 event and, where there is one, the corresponding Meta
 * standard event. That keeps "what fires when" answerable from one file, and it means the
 * Meta consent gate is crossed at exactly one place per event rather than at every call
 * site. The mapping:
 *
 *   page_view          -> PageView
 *   view_pricing       -> ViewContent
 *   begin_checkout     -> InitiateCheckout
 *   sign_up_completed  -> CompleteRegistration
 *   (nothing)          -> Purchase, which is server-only. See src/server/meta-capi.ts.
 *
 * cta_click, sign_up_started, purchase_redirect and consent_update have no Meta
 * counterpart on purpose: none of them is a standard event, and a custom event that
 * nothing optimises against is cost without benefit.
 *
 * Every Meta send is a no-op unless the Pixel loaded, which requires marketing consent.
 * The gate lives in ./meta-pixel.ts and is checked inside each of those functions, so a
 * new caller cannot forget it.
 */

import { getAttribution } from './attribution';
import { advertisingConsentFromBanner, gtagEvent } from './consent';
import { registrationEventId } from './meta-events';
import {
  metaCompleteRegistration,
  metaInitiateCheckout,
  metaPageView,
  metaViewContent } from
'./meta-pixel';

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
  // Meta's PageView is raised here and only here. Meta's copy-paste snippet calls
  // `fbq('track', 'PageView')` immediately after `init`; ./meta-pixel.ts deliberately does
  // not, because in a single page app that fires once on boot and never again. Driving it
  // from the router instead means one PageView per route, and exactly one for the first.
  metaPageView();
}

export function trackViewPricing(path: string) {
  push('view_pricing', { page_path: path });
  metaViewContent(path);
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

/**
 * Account created.
 *
 * `em_sha256` IS GATED ON ADVERTISING CONSENT, and that is a fix rather than a decoration.
 * It used to be computed and pushed unconditionally, which meant that a maker who had
 * declined marketing cookies still had a hashed email sitting on the dataLayer — the exact
 * identifier Meta advanced matching and Google Enhanced Conversions consume, made available
 * for ad matching by somebody who said no. A hash is not anonymisation: it is a stable,
 * deterministic identifier for one person, and it is only useful to an ad platform because
 * that platform can hash the same address and get the same string.
 *
 * The gate reads `advertisingConsentFromBanner()` directly rather than trusting the
 * `advertisingOptIn` argument. The argument is derived from the banner at every call site
 * today, but a gate that depends on each caller passing the right thing is one refactor
 * from being open. `advertising_opt_in` is still recorded on the event: it is a boolean
 * about a decision, not personal data.
 *
 * With consent denied, `em_sha256` is null, `compact()` drops it before it reaches GA4, and
 * the Meta CompleteRegistration below is a no-op because the Pixel was never loaded.
 */
export async function trackSignUpCompleted(
method: SignUpMethod,
email: string,
userId?: string,
marketingEmailOptIn?: boolean,
advertisingOptIn?: boolean)
{
  const emailSha256 = advertisingConsentFromBanner() ?
  await sha256(email.trim().toLowerCase()) :
  null;

  push('sign_up_completed', {
    method,
    user_id: userId ?? null,
    em_sha256: emailSha256,
    marketing_email_opt_in: marketingEmailOptIn ?? null,
    advertising_opt_in: advertisingOptIn ?? null
  });

  // Keyed on the email hash, not the user id: a magic-link signup has no user id yet. See
  // registrationEventId() in ./meta-events.ts for why that choice is what makes a future
  // server-side signup event dedupe instead of double-count.
  metaCompleteRegistration(method, emailSha256, registrationEventId(emailSha256));
}

export function trackBeginCheckout(interval: 'monthly' | 'annual', value: number) {
  push('begin_checkout', { plan: 'maker', interval, value, currency: 'GBP' });
  metaInitiateCheckout(interval, value);
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