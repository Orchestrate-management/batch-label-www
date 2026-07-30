# Batchlabel tracking and attribution

Everything measurement related lives in three files: `lib/consent.ts` (tag loading and
Consent Mode v2), `lib/attribution.ts` (first touch capture) and `lib/analytics.ts`
(events).

## Load order

1. `index.tsx` calls `initTagging()` before React renders.
2. `initTagging()` creates `dataLayer`, pushes Consent Mode v2 **defaults in the denied
   state**, sets `ads_data_redaction` and `url_passthrough`, then replays any stored
   choice.
3. Only then does it inject `gtag/js` and call `gtag('config', …)`.

**Do not move the tag into `index.html`.** Google's copy-paste snippet loads gtag at the
top of `<head>`, which would put it ahead of the consent defaults in step 2 and measure
people who never consented. The ordering above is the whole point of this file.

Measurement id: `GA4_MEASUREMENT_ID` in `lib/consent.ts` (`G-BGDNRH022T`), overridable
per deployment with `VITE_GA4_MEASUREMENT_ID`. Localhost is excluded so development does
not report into the live property; preview deploys do report.

`send_page_view` is off in the config call. This is a single page app, so `page_view` is
sent per route change by `usePageMeta` instead — otherwise the first page would count
twice.

### There is no tag manager

GA4 is loaded directly. That matters for anyone adding an event: **a plain object pushed
to `dataLayer` is inert.** GA4 acts only on gtag commands, so `lib/analytics.ts` sends
every event twice — once onto `dataLayer` (kept so a tag manager could be put in front
later, and it is what the tests assert), and once through `gtagEvent()`, which is the
call that actually reports. Push to `dataLayer` alone and the event is recorded nowhere.

The Meta Pixel has no home yet as a result. When it is added it needs loading here, gated
on `ad_storage`, rather than assumed to be configured inside a container.

## Consent

- Banner: `components/CookieBanner.tsx`. Granular toggles for analytics and marketing,
  plus an always on strictly necessary row.
- Accept, reject and save all call `saveConsent()`, which stores the choice in
  localStorage and a first party cookie (`bl_consent`, six months) and pushes a
  Consent Mode `update`.
- Footer link "Cookie settings" calls `openCookieSettings()` so a maker can change their
  mind at any time. The cookie policy page has the same control.

Mapping used for Consent Mode v2:

| Toggle    | Consent signals updated                                    |
| --------- | ---------------------------------------------------------- |
| Analytics | `analytics_storage`                                        |
| Marketing | `ad_storage`, `ad_user_data`, `ad_personalization`          |
| Necessary | `security_storage` only, always granted                    |

## First touch attribution

`captureAttribution()` runs once per browser on first load and stores, to both
localStorage (`bl_attribution`) and a first party cookie (`bl_attr`, twelve months):

`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `gclid`,
`gbraid`, `wbraid`, `fbclid`, `referrer`, `landing_path`, `first_seen_at`.

First touch wins. If a record already exists it is never overwritten, so a later
organic or direct visit cannot erase the paid click that introduced the maker.

These values are passed into `supabase.auth.signUp` as user metadata (see
`lib/auth.tsx`), so they land on the account record, and into the Stripe Checkout
Session metadata (see `api/create-checkout-session.ts`), so the webhook can replay them.

## Events pushed to the dataLayer

| Event               | Fired from                                    | Key parameters                                                     |
| ------------------- | --------------------------------------------- | ------------------------------------------------------------------ |
| `page_view`         | `usePageMeta` on every route change           | `page_path`, `page_title`                                          |
| `view_pricing`      | Pricing page mount                            | `page_path`                                                        |
| `cta_click`         | Every `Button` with a `track` prop            | `cta_label`, `cta_location`, `page_path`                            |
| `sign_up_started`   | Sign up form submit, magic link request       | `method` (`password` or `magic_link`)                               |
| `sign_up_completed` | Successful Supabase sign up                   | `method`, `user_id`, `em_sha256`                                    |
| `begin_checkout`    | Maker plan CTA pressed                        | `plan`, `interval`, `value`, `currency`                             |
| `purchase_redirect` | Just before the redirect to Stripe Checkout   | `plan`, `interval`, `value`, `currency`, `checkout_session_id`      |
| `consent_update`    | Cookie choice saved                           | `consent_analytics`, `consent_marketing`                            |

Every event also carries `attr_source`, `attr_medium`, `attr_campaign`, `attr_gclid` and
`attr_fbclid` from the stored first touch record, so GTM can stamp them onto GA4 user
properties without re-reading storage.

`em_sha256` is a SHA-256 hash of the lowercased email. Use it for Meta advanced matching
(`user_data.em`) and Google Enhanced Conversions (`hashedEmail`). No raw email is ever
pushed to the dataLayer.

There is deliberately **no browser side `purchase` event**. Payment success is only known
server side.

## Server side conversion forwarding

**Not implemented yet.** The data it needs is already being captured and stored, which is the
part that cannot be added retrospectively:

- `api/create-checkout-session.ts` writes the allow-listed first-touch keys into **both** the
  Checkout Session metadata and `subscription_data.metadata` (see `src/server/checkout.ts`).
  Session metadata reaches `checkout.session.completed` only; the subscription copy is what
  every later `customer.subscription.*` event carries, so a renewal or an upgrade months later
  still knows which ad produced the customer.
- The verified event reaches `src/server/webhook.ts`, which is where a forwarder would hook in
  — after `handleStripeWebhook` has confirmed the signature and the store has returned
  `applied`. Forwarding on `duplicate` or `stale` would double-count a Stripe retry, so the
  outcome must be checked, not just the event type.

When it is built:

- **Meta Conversions API**: `Purchase` with `event_id` set to the Stripe session id so it
  dedupes against any browser event, `fbc` rebuilt from the stored `fbclid`, and hashed email
  for advanced matching.
- **Google Ads**: `uploadClickConversions` using the stored `gclid`, or `gbraid` and `wbraid`
  where a `gclid` is absent, plus hashed email for Enhanced Conversions.

Both would read the click identifiers from the metadata above, so conversions can still be
reported when browser tags were blocked.

## GTM container checklist

1. Google tag (GA4) with the measurement id, triggered on Consent Mode `analytics_storage`.
2. GA4 event tags for each custom event above, with the parameters mapped.
3. Meta Pixel base code with **advanced matching enabled**, reading `em_sha256` from the
   dataLayer, gated on `ad_storage`.
4. Google Ads conversion linker plus conversion tags, gated on `ad_storage`.
5. Consent Mode v2 checks on every non essential tag, using the built in consent settings
   rather than a custom blocking trigger.
