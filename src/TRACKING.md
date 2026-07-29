# Batchlabel tracking and attribution

Everything measurement related lives in three files: `lib/consent.ts` (tag loading and
Consent Mode v2), `lib/attribution.ts` (first touch capture) and `lib/analytics.ts`
(dataLayer events).

## Load order

1. `index.tsx` calls `initTagging()` before React renders.
2. `initTagging()` creates `dataLayer`, pushes Consent Mode v2 **defaults in the denied
   state**, sets `ads_data_redaction` and `url_passthrough`, replays any stored choice,
   then injects the GTM container script.
3. GA4 and the Meta Pixel are configured **inside GTM**, so a denied category actually
   blocks them rather than only hiding the banner.

Set the container id in `lib/consent.ts` (`GTM_CONTAINER_ID`).

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

`api/stripe-webhook.ts` contains documented placeholders for:

- **Meta Conversions API**: `Purchase` with `event_id` set to the Stripe session id so it
  dedupes against any browser event, `fbc` rebuilt from the stored `fbclid`, and hashed
  email for advanced matching.
- **Google Ads**: `uploadClickConversions` using the stored `gclid`, or `gbraid` and
  `wbraid` where a `gclid` is absent, plus hashed email for Enhanced Conversions.

Both read the click identifiers written to the Checkout Session metadata, so conversions
can still be reported when browser tags were blocked.

## GTM container checklist

1. Google tag (GA4) with the measurement id, triggered on Consent Mode `analytics_storage`.
2. GA4 event tags for each custom event above, with the parameters mapped.
3. Meta Pixel base code with **advanced matching enabled**, reading `em_sha256` from the
   dataLayer, gated on `ad_storage`.
4. Google Ads conversion linker plus conversion tags, gated on `ad_storage`.
5. Consent Mode v2 checks on every non essential tag, using the built in consent settings
   rather than a custom blocking trigger.
