# Meta Pixel and Conversions API

One Meta dataset, two surfaces, two consent gates.

This is the shared reference for **both** repos: the marketing site (`www.batchlabel.xyz`,
this repo) and the product app (`app.batchlabel.xyz`, `Batch-Label-Product-Application`).
Both send to the same Pixel id. If the two sides disagree about which event fires from
where, conversions get counted twice — so the event map below is a contract, not a
suggestion.

---

## 1. The event map

| Event | Fires from | Consent basis | `event_id` |
| --- | --- | --- | --- |
| `PageView` | **www only**, per route change | Cookie banner → `marketing` | random |
| `ViewContent` | www, pricing page | Cookie banner | random |
| `CompleteRegistration` | www, on signup | Cookie banner | `signup.<em_sha256>` |
| `InitiateCheckout` | **www and app** — wherever the upgrade is clicked | www: banner · app: `advertising_opt_in` | random |
| `Purchase` | **server CAPI only**, from the Stripe webhook | `advertising_opt_in`, read server-side | Stripe Checkout Session id |

Deliberate decisions, recorded so nobody "fixes" them later:

- **There is no browser `Purchase`.** Payment success is only known server-side, and a
  browser event inflates on refunds, failed cards and redirect drop-off. This predates the
  Meta work — see [`../src/TRACKING.md`](../src/TRACKING.md).
- **The app gets no blanket `PageView`.** It is the authenticated product. Tracking a paying
  customer's every screen for advertising is not something Meta needs and not a cost worth
  paying. Conversion-relevant events only.
- **The app has no cookie banner and will not get one.** It is always authenticated, so it
  reads `brand_memberships.advertising_opt_in` under RLS. `bl_consent` is host-only and
  stays that way. Asking twice is the exact contradiction [`CONSENT.md`](./CONSENT.md)
  exists to prevent.
- **`InitiateCheckout` from both origins is not a deduplication case.** They are two
  different user actions in two different places, not one action reported twice.
- `cta_click`, `sign_up_started`, `purchase_redirect` and `consent_update` have **no** Meta
  counterpart. None is a standard event, and a custom event nothing optimises against is
  cost without benefit.

Everything on the www side is mapped inside `src/lib/analytics.ts`, next to the GA4 event it
accompanies. There are no `fbq` calls in components — the only file that touches `fbq` is
`src/lib/meta-pixel.ts`.

---

## 2. The deduplication contract

Meta deduplicates on the pair (`event_name`, `event_id`). Two events with the same pair
inside the window are one conversion; two different `event_id`s are two conversions.

**Inflated conversions are worse than missing ones.** A missing conversion is visible — the
number is lower than the bank statement. An inflated one is invisible, and it teaches Meta's
optimiser that traffic which does not convert does convert, so the damage compounds while
looking like success.

The rule: **`event_id` is derived from the identity of the action, never generated at call
time.** The two halves must be able to compute the same string independently, because the
entire reason server-side forwarding exists is that the browser is frequently blocked and
cannot be relied on to hand anything over.

| Event | `event_id` | Why |
| --- | --- | --- |
| `Purchase` | the Stripe **Checkout Session id** (`cs_…`) verbatim | See below. |
| `CompleteRegistration` | `signup.<sha256(lowercased email)>` | The user id is unavailable on the magic-link path — the account does not exist until the link is clicked. The email hash is present on all three signup paths, and the server can compute it from the auth record. |
| `PageView`, `ViewContent`, `InitiateCheckout` | random UUID | No server counterpart. A random id deduplicates against nothing, which is correct for an event that exists in one place, and it stops two genuinely separate actions being collapsed. |

### Why the Checkout Session id and not the Stripe event id

Both are stable across Stripe retries, so both would survive the at-least-once problem. The
session id wins on a different property:

- `cs_…` identifies **the purchase**. `evt_…` identifies **a message about the purchase**.
- A future browser-side `Purchase` could compute `cs_…` — the success page already receives
  it as `?session_id=`. It could never know `evt_…`, because that id only exists inside the
  webhook. Choosing `evt_…` would close off the browser twin permanently.
- If forwarding ever moved to a different event type (say `invoice.paid` for the first
  invoice), `evt_…` would change while the purchase did not.

Dedup should key on the thing that happened, not on the notification about it.

### Stripe webhooks are at-least-once — the defence is two-layered

1. **The webhook forwards only when the entitlement store returns `applied`.** The RPC claims
   the Stripe event id atomically, so a redelivery returns `duplicate` and never reaches
   Meta at all. This is the primary defence and it stops the request being made.
2. **The `event_id` is deterministic.** Even if a send did happen twice — two Vercel
   instances racing, a manual replay — Meta collapses the pair.

Both are tested: `src/server/webhook.test.ts` ("Meta conversion forwarding") delivers the
same event twice and asserts the ids are identical, and asserts that `duplicate`, `stale`,
`superseded`, `no_membership` and `unknown_brand` all forward nothing.

The rule lives in one file, `src/lib/meta-events.ts`, which is imported by **both** the
browser Pixel and the server module. It is deliberately isomorphic — no `window`, no
`process.env`, no imports at all — and there is a test asserting that, because two copies of
this rule would drift.

---

## 3. The two consent gates

Advertising consent is asked in exactly one place — the cookie banner's **Marketing**
toggle — and recorded in two: `bl_consent` in the browser and
`brand_memberships.advertising_opt_in` on the account. See [`CONSENT.md`](./CONSENT.md).

### Gate 1 — the browser

**The Pixel is gated by not being loaded.** `connect.facebook.net/en_US/fbevents.js` is not
requested, `window.fbq` does not exist, and no `_fbp`/`_fbc` cookie is written until
marketing consent is granted.

This matters more than it sounds. Loading the script and relying on a suppression flag is a
weaker promise than the banner makes: the request itself reaches Meta with the visitor's IP
and referring URL before any flag is consulted. Google's Consent Mode does not help here —
**Meta does not read Consent Mode.** `ad_storage: denied` suppresses nothing on Meta's side.

The Pixel loads from `src/lib/consent.ts`, in step 3 of `initTagging()`, after the Consent
Mode defaults are pushed and the stored choice replayed — the same position and the same
reasoning as GA4.

Changing your mind works in both directions:

- **Accepting later** injects the script at that moment and sends one `PageView` for the page
  they are on. Measurement starts at the decision, not retroactively.
- **Withdrawing later** does three things, because one is not enough:
  1. our own gate closes, so nothing in `meta-pixel.ts` emits again — absolute, and not
     dependent on Meta honouring anything;
  2. `fbq('consent', 'revoke')` stops the parts of the Pixel we do not drive (automatic event
     detection, button-click autologging, microdata scraping);
  3. the `_fbp` and `_fbc` cookies are deleted, so a later grant cannot silently resume the
     same identity.

  **What cannot be done:** JavaScript that has already executed cannot be un-executed. The
  script element is removed and the Pixel revoked, but the library stays in memory until the
  next navigation. That is exactly why the primary gate is "never load without consent".

Also fixed here: `em_sha256` used to be computed and pushed to the dataLayer on **every**
signup, regardless of advertising consent. A hash is not anonymisation — it is a stable
identifier for one person, and it is only useful to Meta because Meta can hash the same
address and get the same string. It is now null unless the banner granted marketing.

### Gate 2 — the server

Before any Conversions API call, `src/server/meta-capi.ts` reads
`brand_memberships.advertising_opt_in` with the service-role key, keyed on the Supabase user
id carried in the Checkout Session metadata.

**It fails closed.** All five of these send nothing:

| Situation | Outcome |
| --- | --- |
| `advertising_opt_in` is `false` | `consent_declined` |
| no membership row exists | `consent_declined` (no record of a permission is not a permission) |
| the lookup throws — network, RLS, bad key, Supabase down | `consent_lookup_failed` |
| the session carried no `supabase_user_id` | `no_user_id` — the lookup is not even attempted |
| `META_CAPI_ACCESS_TOKEN` is absent | `not_configured` |

A failure to prove consent is not consent. Dropping the event under-reports conversions,
which is the correct direction to be wrong in: an unreported sale costs attribution, an
unconsented send costs somebody their privacy.

The gate is **inside** `forwardPurchase`, not at its call site, so a second caller cannot be
added without it.

The email that gets hashed comes from `auth.admin.getUserById` — the verified auth identity
of the user whose consent was just checked. **Not** `profiles.email`, which is user-writable
and could be pointed at somebody else, and **not** the address typed into Stripe Checkout,
which is whatever the cardholder felt like entering. The consent we checked and the data we
send have to be about the same person.

---

## 4. Environment variables

| Name | Secret? | Where | Purpose |
| --- | --- | --- | --- |
| `VITE_META_PIXEL_ID` | **No — public by design** | Production, Preview, Development | The dataset id. It ships inside the page and anyone can read it from the network tab, which is why the `VITE_` prefix is safe here. |
| `META_CAPI_ACCESS_TOKEN` | **YES — SECRET** | **Production only** | System-user token that writes events into the dataset. |
| `META_TEST_EVENT_CODE` | No | Nowhere in production | Routes events to the Test Events tab. Set it locally while verifying; never leave it set in Production. |
| `META_PIXEL_ID` | No | optional server-side alias | Falls back to `VITE_META_PIXEL_ID`. |
| `META_GRAPH_VERSION` | No | optional | Overrides the pinned `v21.0`. |
| `VITE_META_PIXEL_DEBUG` | No | local only | `true` loads the Pixel on localhost so it can be seen in Test Events without deploying. |

### `META_CAPI_ACCESS_TOKEN` must never carry a `VITE_` prefix

A `VITE_` variable is **inlined into the browser bundle at build time**. This is a public
marketing site: the token would sit in a JavaScript file anyone can fetch, and it can write
events into the dataset. There are tests in `src/server/meta-capi.test.ts` that walk the
source tree and fail if the token is ever `VITE_` prefixed, read outside
`src/server/meta-capi.ts`, or imported by anything under `src/lib`, `src/pages` or
`src/components`.

### The Production-only token is deliberate. Do not "fix" it.

`META_CAPI_ACCESS_TOKEN` is set in **Production only**, on purpose. A preview deployment
forwarding real `Purchase` events would put fictional sales into Events Manager and into ad
optimisation, and **there is no way to remove them afterwards**.

So on preview and development the forwarder logs:

```
[meta-capi] not configured (META_PIXEL_ID and/or META_CAPI_ACCESS_TOKEN absent).
Purchase NOT forwarded. Expected on preview and development — the token is Production-only by design.
```

That log is the expected state, not a bug report. There is deliberately **no** fallback, no
queue, no retry and no degraded mode: no token means do not send, full stop.

---

## 5. `fbc`, and the timestamp question

`fbc` is Meta's click identifier. Format:

```
fb.<subdomainIndex>.<creationTimeMs>.<fbclid>
```

- **`subdomainIndex` is `1`.** It counts hostname labels from the public suffix:
  `xyz` = 0, `batchlabel.xyz` = 1, `www.batchlabel.xyz` = 2. Meta's documentation for
  reconstructing `fbc` from a query parameter specifies 1, and the Pixel writes 1 for a
  cookie on the registrable domain, so 1 keeps a reconstructed value byte-identical to a
  real one.

- **`creationTimeMs` is the time the `fbclid` was OBSERVED, in unix milliseconds — not the
  time of the conversion.** This is the part that is easy to get wrong.

  The Pixel writes `_fbc` at the moment the ad click lands, so the timestamp inside a real
  cookie is the **click** time. If the server substituted the purchase time, the same click
  would produce two different `fbc` strings — one in the browser's cookie, one in the server
  event — and Meta matches on the whole string. The two halves would look like two different
  clicks instead of one.

  Batchlabel already captures the click time: `first_seen_at` on the first-touch attribution
  record, written in the same tick that `fbclid` is read off the URL, and carried into Stripe
  Checkout metadata precisely so the webhook can use it.

  Observed in the harness against a real Stripe event: `first_seen_at` of
  `2026-07-01T09:15:00.000Z` produced `fb.1.1782897300000.IwAR0…` while `event_time` was
  `1785503163` — a thirty-day gap. The difference is not academic.

**Order of preference:**

1. The **real `_fbc` cookie**, captured at checkout. Byte-identical to what the browser
   holds, so it beats even a correct reconstruction.
2. **Reconstructed from `fbclid` + `first_seen_at`.** This is the case the whole design
   exists for: the browser was blocked, or consent came after the click, so no cookie was
   ever written — but the `fbclid` was captured off the URL at first touch.
3. **Reconstructed from `fbclid` + the conversion time**, when `first_seen_at` is missing or
   unparseable (an older stored record). This is logged as a warning. Meta permits
   reconstructing with the time the identifier was observed, and an `fbc` carrying the right
   `fbclid` with an approximate timestamp attributes far better than none — but it is a
   documented degradation, not a silent one.
4. **No `fbc` at all** when there was never an `fbclid`. The field is omitted rather than
   sent empty.

### `_fbp` is captured too — recommended and implemented

`_fbp` is the Pixel's first-party browser id and is the strongest single signal for matching
a server event back to a browser; Meta weights it heavily in match quality. It is read at
checkout time in `src/lib/billing.ts` and carried through Stripe metadata alongside `_fbc`.

It is **self-gating on consent**, which is the neat part: both cookies only exist because
`fbevents.js` wrote them, and `fbevents.js` only loads for somebody who granted marketing
consent — and both are deleted if consent is later withdrawn. No consent, no cookies, nothing
to carry. `billing.ts` checks the banner as well, so the gate does not rest on cookie
lifetime alone. Both values are format-validated on the server before they reach Stripe
metadata, because a request body is a claim.

---

## 6. What is deliberately NOT sent

### `client_ip_address` and `client_user_agent`

**They cannot be obtained honestly at webhook time, so they are omitted.**

The webhook request comes from Stripe's servers. `request.headers.get('user-agent')` is
`Stripe/1.0 (+https://stripe.com/docs/webhooks)` and the remote address is a Stripe
datacentre. Sending those would tell Meta the buyer's device was a datacentre — and those two
fields are matching signals, so feeding them a datacentre IP pollutes the audience and the
attribution rather than improving it.

They could in principle be captured in `/api/create-checkout-session`, which **is** called by
the buyer's browser, and carried through metadata. That is not done: an end user's IP address
is personal data, Stripe's own guidance is that metadata is not the place for it, and it is
readable by anyone with dashboard access. The match is carried instead by `fbc`, `fbp`,
hashed email and hashed `external_id`.

### The `<noscript>` image beacon

Meta's copy-paste snippet ends with:

```html
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=...&ev=PageView&noscript=1" /></noscript>
```

**This is deliberately omitted, and must stay omitted.** It is a plain `<img>` that fires the
moment the document is parsed, with no JavaScript involved — so it cannot be gated by any
mechanism we have, ours or Meta's. A visitor who explicitly declined marketing still gets a
`PageView` sent to Meta, and there is no code path that can stop it.

The usual justification is that it covers visitors with JavaScript disabled. But those
visitors cannot operate the cookie banner either, so they can never have consented — which
makes them precisely the population it is least defensible to track. It adds essentially no
data, since the JS pixel already covers everyone capable of answering the banner.

`src/lib/meta-pixel.test.ts` asserts that `index.html` contains no `facebook.com/tr`, no
`connect.facebook.net` and no `fbq(`.

### The raw snippet must not go into `index.html`

Meta's block calls `fbq('init', …)` and `fbq('track', 'PageView')` **immediately on parse**.
Dropped into `index.html` it would run before the Consent Mode defaults in `initTagging()`
and before any consent gate, tracking people who never consented — precisely the failure
avoided with GA4. It loads from `src/lib/consent.ts`, gated, or it is wrong.

---

## 7. Verifying

### Unit and integration tests

```bash
npm run typecheck && npm run lint && npm run test:run
```

Relevant suites:

- `src/lib/meta-events.test.ts` — the `fbc` format, the dedup ids, isomorphic purity.
- `src/lib/meta-pixel.test.ts` — the browser gate, denied and granted, and both directions of
  a change of mind.
- `src/lib/analytics.test.ts` — the `em_sha256` gate.
- `src/server/meta-capi.test.ts` — the server gate failing closed five ways, the payload, and
  the secret-containment checks.
- `src/server/webhook.test.ts` — forward only on `applied`, never on a redelivery.

### End to end, with the Stripe CLI

`scripts/verify-meta-capi.ts` runs the **real** `handleStripeWebhook` and the **real**
forwarder behind an HTTP server, so genuinely signed Stripe events go through exactly the
code path Vercel runs. Only the entitlement store and the consent lookup are injected — so
that "the database is down" and "the user declined" can be produced on demand.

Terminal 1:

```bash
stripe listen --forward-to localhost:4242/api/stripe-webhook
# copy the whsec_… it prints — that is the LOCAL secret, not the dashboard one
```

Terminal 2:

```bash
STRIPE_WEBHOOK_SECRET=whsec_… \
META_PIXEL_ID=<pixel id> \
META_CAPI_ACCESS_TOKEN=<token> \
META_TEST_EVENT_CODE=TEST12345 \
HARNESS_CONSENT=granted \
npx vite-node scripts/verify-meta-capi.ts
```

Add `HARNESS_DRY_RUN=1` to print the payload without sending. Always set
`META_TEST_EVENT_CODE` when a real token is present, or the events land in the live dataset
and cannot be removed.

Terminal 3 — a subscription-mode session carrying our metadata. The default
`stripe trigger checkout.session.completed` fixture is a one-off payment with no metadata, so
`intentFromEvent` correctly ignores it; these overrides make it look like a real Batchlabel
checkout:

```bash
stripe trigger checkout.session.completed \
  --override "price:recurring[interval]=month" \
  --override "checkout_session:mode=subscription" \
  --remove   "checkout_session:payment_intent_data" \
  --add "checkout_session:metadata[brand]=batchlabel" \
  --add "checkout_session:metadata[plan]=maker" \
  --add "checkout_session:metadata[supabase_user_id]=11111111-1111-4111-8111-111111111111" \
  --add "checkout_session:metadata[fbclid]=IwAR0TestClickIdentifier" \
  --add "checkout_session:metadata[first_seen_at]=2026-07-01T09:15:00.000Z" \
  --add "checkout_session:metadata[fbp]=fb.1.1751360100000.1098765432"
```

Prove the gate both ways by re-running with `HARNESS_CONSENT=declined` and
`HARNESS_CONSENT=error`, and the dedup guard with `HARNESS_OUTCOME=duplicate`. Each should
log the reason and send nothing.

### Meta Test Events

1. Events Manager → your dataset → **Test Events**.
2. Copy the `TEST…` code into `META_TEST_EVENT_CODE` and run the harness above. The
   `Purchase` should appear within a few seconds, marked **Server**.
3. Check **Event Match Quality** on the event. `fbc`, `fbp`, `em` and `external_id` should
   all be listed as received.
4. Fire the same Stripe event twice and confirm Events Manager shows **one** Purchase, not
   two. That is the dedup contract working.
5. For the **browser** half, open Test Events and browse the site with
   `VITE_META_PIXEL_DEBUG=true` locally, or use a preview deployment. Accept marketing
   cookies and confirm `PageView`, then `ViewContent` on `/pricing`, then `InitiateCheckout`.
   Then **reject** cookies and confirm nothing further arrives.

---

## 8. What the founder needs to do in Meta Events Manager

1. **Confirm the dataset id** is the one in `VITE_META_PIXEL_ID` and that the CAPI token was
   generated against that same dataset. A token for a different dataset fails with an
   unhelpful permissions error.
2. **Run the Test Events verification** in section 7, with a `TEST…` code. This is the step
   that could not be completed during implementation — see the PR description.
3. **Turn on Automatic Advanced Matching?** No. Leave it **off**. It scrapes form fields in
   the page and hashes whatever it finds, which is a data flow the consent model does not
   describe and cannot gate. Advanced matching here is explicit: one hashed email, at signup,
   only with consent.
4. **Set up Event Deduplication** — nothing to configure; Meta does it automatically on
   (`event_name`, `event_id`). Just be aware it is happening when reading the numbers.
5. **Check the "Purchase" event is marked as a conversion** you want to optimise for, and
   that its currency is read as GBP.
6. **Do not add the Pixel through a partner integration or a tag manager.** There is no tag
   manager on this site by design, and a second install would double every event.
7. When rotating the CAPI token, update **Production only**. Leaving it out of Preview is
   deliberate (section 4).

---

## 9. Where the code is

| File | What it owns |
| --- | --- |
| `src/lib/meta-events.ts` | The dedup contract and the `fbc` format. Isomorphic; imported by both halves. |
| `src/lib/meta-pixel.ts` | The browser Pixel and its consent gate. The only file that touches `fbq`. |
| `src/lib/consent.ts` | Loads the Pixel (step 3) and carries a change of mind to it. |
| `src/lib/analytics.ts` | Maps GA4 events onto Meta standard events. The `em_sha256` gate. |
| `src/lib/billing.ts` | Captures `_fbp` / `_fbc` at checkout, consent-gated. |
| `src/server/meta-capi.ts` | The Conversions API. Reads the secret. Owns the server consent gate. |
| `src/server/supabase-admin.ts` | `findAdvertisingConsent` — the flag and the verified auth email. |
| `src/server/stripe-events.ts` | `purchaseSignal` — what a completed checkout tells us. |
| `src/server/webhook.ts` | Calls the forwarder, only on `applied`. |
| `src/server/checkout.ts` | Validates and writes `fbp` / `fbc` into Stripe metadata. |
| `scripts/verify-meta-capi.ts` | The end-to-end harness. |
