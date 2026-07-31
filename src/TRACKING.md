# Batchlabel tracking and attribution

Everything measurement related lives in these files: `lib/consent.ts` (tag loading and
Consent Mode v2), `lib/attribution.ts` (first touch capture), `lib/analytics.ts` (events),
`lib/meta-pixel.ts` (the Meta Pixel and its consent gate) and `lib/meta-events.ts` (the
deduplication contract shared with the server). Server side conversions live in
`server/meta-capi.ts`.

## Load order

1. `index.tsx` calls `initTagging()` before React renders.
2. `initTagging()` creates `dataLayer`, pushes Consent Mode v2 **defaults in the denied
   state**, sets `ads_data_redaction` and `url_passthrough`, then replays any stored
   choice.
3. It calls `initMetaPixel()` with that stored choice. The Meta Pixel loads **only** if
   marketing was granted — a first-time visitor gets no request to
   `connect.facebook.net` at all, not a suppressed one.
4. Only then does it inject `gtag/js` and call `gtag('config', …)`.

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

**The Meta Pixel now has a home: `lib/meta-pixel.ts`, loaded from `lib/consent.ts`.** It is
gated by *not being loaded*, not by Consent Mode — Consent Mode is Google's mechanism and
**Meta does not read it**, so `ad_storage: denied` suppresses nothing on Meta's side. Meta's
copy-paste snippet must never go into `index.html`: it calls `fbq('init')` and
`fbq('track', 'PageView')` on parse, which would run ahead of the consent defaults. The
snippet's `<noscript>` image beacon is deliberately omitted too — it cannot be gated by
anything, and the only people it reaches are those who cannot operate the banner and so
can never have consented. Full reasoning in
[`../docs/META_CAPI_SETUP.md`](../docs/META_CAPI_SETUP.md).

## Consent

- Banner: `components/CookieBanner.tsx`. Granular toggles for analytics and marketing,
  plus an always on strictly necessary row.
- Accept, reject and save all call `saveConsent()`, which stores the choice in
  localStorage and a first party cookie (`bl_consent`, six months) and pushes a
  Consent Mode `update`.
- Footer link "Cookie settings" calls `openCookieSettings()` so a maker can change their
  mind at any time. The cookie policy page has the same control.

Mapping used for Consent Mode v2:

| Toggle    | Consent signals updated                                                        |
| --------- | ------------------------------------------------------------------------------ |
| Analytics | `analytics_storage`                                                            |
| Marketing | `ad_storage`, `ad_user_data`, `ad_personalization`, **and whether the Meta Pixel loads at all** |
| Necessary | `security_storage` only, always granted                                        |

### The marketing toggle is the only advertising question

It drives the three ad signals above **and** the account-level
`brand_memberships.advertising_opt_in`. Signup does not ask: it derives the value with
`advertisingConsentFromBanner()`, and every later banner decision is carried onto a
signed-in maker's account through `syncAdvertisingConsent()` and the `set_consent` RPC.

This used to be asked twice — once here, once as a signup checkbox — with nothing
reconciling the two. The signup form now has exactly two boxes: Terms (required) and
marketing email (optional). Full model in [`../docs/CONSENT.md`](../docs/CONSENT.md).

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
| `sign_up_completed` | Successful Supabase sign up                   | `method`, `user_id`, `em_sha256`, `marketing_email_opt_in`, `advertising_opt_in` |
| `begin_checkout`    | Maker plan CTA pressed                        | `plan`, `interval`, `value`, `currency`                             |
| `purchase_redirect` | Just before the redirect to Stripe Checkout   | `plan`, `interval`, `value`, `currency`, `checkout_session_id`      |
| `consent_update`    | Cookie choice saved                           | `consent_analytics`, `consent_marketing`                            |

Every event also carries `attr_source`, `attr_medium`, `attr_campaign`, `attr_gclid` and
`attr_fbclid` from the stored first touch record, so GTM can stamp them onto GA4 user
properties without re-reading storage.

`em_sha256` is a SHA-256 hash of the lowercased email, used for Meta advanced matching
(`user_data.em`) and Google Enhanced Conversions (`hashedEmail`). No raw email is ever
pushed to the dataLayer.

**`em_sha256` is null without advertising consent.** It used to be computed and pushed on
every signup regardless, which made a hashed email — the exact identifier an ad platform
consumes — available for matching for somebody who had declined. A hash is not
anonymisation: it is a stable identifier for one person, useful to Meta precisely because
Meta can hash the same address and get the same string. The gate reads
`advertisingConsentFromBanner()` directly rather than a caller-supplied argument.

There is deliberately **no browser side `purchase` event**. Payment success is only known
server side.

## Meta Pixel events

Mapped inside `lib/analytics.ts`, beside the GA4 event they accompany, so there are no
`fbq` calls scattered through components — `lib/meta-pixel.ts` is the only file that
touches `fbq`.

| GA4 event           | Meta standard event    | `event_id`                    |
| ------------------- | ---------------------- | ----------------------------- |
| `page_view`         | `PageView`             | random                        |
| `view_pricing`      | `ViewContent`          | random                        |
| `begin_checkout`    | `InitiateCheckout`     | random                        |
| `sign_up_completed` | `CompleteRegistration` | `signup.<em_sha256>`          |
| —                   | `Purchase` (server)    | Stripe Checkout Session id    |

`cta_click`, `sign_up_started`, `purchase_redirect` and `consent_update` have no Meta
counterpart: none is a standard event, and a custom event nothing optimises against is
cost without benefit.

Deduplication keys are **derived from the identity of the action, never generated at call
time**, so the browser and the server can compute the same string independently — which
matters because the whole reason server forwarding exists is that the browser is often
blocked and cannot hand anything over. The rule lives in `lib/meta-events.ts` and is
imported by both halves.

## Server side conversion forwarding

**Meta is implemented.** Google Ads Enhanced Conversions is not. The captured data both
need was already in place, which is the part that cannot be added retrospectively:

- `api/create-checkout-session.ts` writes the allow-listed first-touch keys into **both** the
  Checkout Session metadata and `subscription_data.metadata` (see `src/server/checkout.ts`).
  Session metadata reaches `checkout.session.completed` only; the subscription copy is what
  every later `customer.subscription.*` event carries, so a renewal or an upgrade months later
  still knows which ad produced the customer.
- The verified event reaches `src/server/webhook.ts`, which is where a forwarder would hook in
  — after `handleStripeWebhook` has confirmed the signature and the store has returned
  `applied`. Forwarding on `duplicate` or `stale` would double-count a Stripe retry, so the
  outcome must be checked, not just the event type.

As built:

- **Meta Conversions API** (`server/meta-capi.ts`): `Purchase` with `event_id` set to the
  Stripe Checkout Session id, `fbc` preferring the real `_fbc` cookie and falling back to a
  reconstruction from the stored `fbclid` and **`first_seen_at`** — the time the click was
  observed, not the time of the conversion, because the Pixel writes `_fbc` when the click
  lands and Meta matches on the whole string. `_fbp` is carried too. Hashed email comes from
  the **verified auth identity**, not the address typed into Stripe Checkout. Forwarded only
  when the entitlement store returns `applied`, so a Stripe redelivery cannot double-count.
- **Google Ads**: still to build. `uploadClickConversions` using the stored `gclid`, or
  `gbraid` and `wbraid` where a `gclid` is absent, plus hashed email for Enhanced
  Conversions. It must go through the same consent gate rather than a second copy of it.

Both read the click identifiers from the metadata above, so conversions can still be
reported when browser tags were blocked.

**Neither may run for a user whose `advertising_opt_in` is false.** Consent Mode gates
nothing here — it is Google's mechanism and Meta does not read it — so a server-to-server
call is gated only by the code making it. `forwardPurchase` reads the flag with the
service-role key and fails closed on a false flag, a missing membership, a thrown lookup or
a missing user id. See [`../docs/META_CAPI_SETUP.md`](../docs/META_CAPI_SETUP.md) and
[`../docs/CONSENT.md`](../docs/CONSENT.md).

## If a tag manager is ever added

There is none today (see above), so this is a checklist for that day, not a description of
what exists:

1. Google tag (GA4) with the measurement id, triggered on Consent Mode `analytics_storage`.
2. GA4 event tags for each custom event above, with the parameters mapped.
3. Google Ads conversion linker plus conversion tags, gated on `ad_storage`.
4. Consent Mode v2 checks on every non essential tag, using the built in consent settings
   rather than a custom blocking trigger.
5. **Do not move the Meta Pixel into the container.** It would be a second install
   alongside `lib/meta-pixel.ts` and double every event, and a container-level consent check
   is weaker than not loading the script — Meta does not read Consent Mode.
