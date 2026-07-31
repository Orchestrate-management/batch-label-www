# Consent at Batchlabel

Every permission we hold, where it is asked, where it is stored, and what it gates.

The rule this document exists to enforce: **one purpose, one place it is asked, one
record.** A permission collected twice will eventually be answered two different ways, and
two contradictory records are worse than none — a contradiction proves we did not know.

## Who owns what

| Purpose | Asked | Stored | Changed |
| --- | --- | --- | --- |
| Terms of Service | Signup form, and `/finish-setup` after Google | `brand_memberships.consents.terms` + `consent_events` | Not withdrawable. It is a contract, not consent. |
| Marketing email | Signup form, one optional box | `brand_memberships.marketing_email_opt_in` | Account and billing here, Settings → Account in the app, or the unsubscribe link in any email |
| Advertising and retargeting | Cookie banner, the **Marketing** toggle. Nowhere else. | Browser: `bl_consent`. Account: `brand_memberships.advertising_opt_in` | Cookie settings, from the footer of any page |
| Analytics | Cookie banner, the **Analytics** toggle | `bl_consent` only. Nothing account level. | Cookie settings |

Terms are deliberately never described as a consent that can be withdrawn, and never
bundled with anything optional.

## Why advertising is derived, not asked

The two systems govern different halves of the same thing. The cookie banner governs
device-level tracking through Consent Mode v2: what fires in this browser. The account
flag governs account-level use: sharing a hashed email with Meta or Google to build an
audience, and forwarding a server-side conversion.

They are one purpose to the person answering. Asking twice produced two records with no
defined winner: someone could accept in the banner and decline at signup, and nothing in
the code reconciled them.

So the banner is the single source of truth, and the account flag is derived from it:

- **At signup** — `advertisingConsentFromBanner()` in `src/lib/consent.ts` reads the
  stored banner choice. No stored choice means **false**, because Consent Mode already
  defaults `ad_storage` to denied and false is the only answer consistent with what the
  browser is doing. It is passed into `signupConsents()` and, for Google signups, into
  `complete_oauth_signup` as `p_advertising_opt_in` — the same function signature as
  before, carrying a derived value instead of a ticked one.
- **Afterwards** — every banner decision calls `syncAdvertisingConsent()`
  (`src/lib/consent-preferences.ts`), which writes through the `set_consent` RPC when the
  account disagrees. That keeps the flag, the `consents` snapshot and the append-only
  `consent_events` row in step, with a server-stamped time.
- **In the account area** — `MarketingPreferences` shows the current state and sends the
  user to cookie settings. It is not a second toggle. A second control writing the same
  flag is the duplication, moved.

### What the sync does not do

`syncAdvertisingConsent` writes only when someone actually makes a banner choice, and only
when the account currently says something different.

- Signed out, or no membership yet: it does nothing. There is no account to keep in step.
- Already the same: it does nothing. An identical audit row is a re-affirmation, and a log
  full of those hides the decisions that matter.

One known gap follows from this. A person who accepts marketing cookies *after* submitting
the signup form but *before* they are signed in has a banner choice their account has not
heard about; the account keeps the honest default (false) until they next change their
cookie settings. The browser still obeys the banner immediately. The failure is in the
safe direction — recorded consent is narrower than granted consent, never wider.

A second gap, by design: the banner choice lives in one browser. On a new device the
banner asks again, and answering it re-syncs the account. The account record therefore
holds the most recent decision the user made *on a device where they were signed in*.

A third, worth naming because it looks like a bug: the banner choice does not cross to
`app.batchlabel.xyz`, even in the same browser. It is kept in `localStorage`, which is
partitioned per origin, and mirrored to a `bl_consent` cookie written with no `domain`
attribute — host-only on `www.batchlabel.xyz`, unlike the session cookie, which is
deliberately scoped to `.batchlabel.xyz`. So the app cannot read the banner and must not
pretend to. It does not need to: it loads no analytics or advertising tag, so there is
nothing device-level for it to gate, and the account flag it *can* read is the same
decision recorded server-side. If the app ever loads a tag of its own, this becomes a real
problem and the answer is to widen the cookie to `.batchlabel.xyz` and read it on both
sides — not to ask the question twice.

(`getStoredConsent()` only ever reads `localStorage`. The cookie is written and never read
back, so it is a fallback in name only. Harmless today, and a trap for whoever assumes
otherwise.)

## What is recorded, and where

Three representations, written together in one transaction by `set_consent()` or
`complete_oauth_signup()` (`supabase/migrations/`), so state and audit cannot diverge:

1. `brand_memberships.<flag>` — current state, fast to filter when building an audience.
2. `brand_memberships.consents` — the jsonb snapshot: id, title, **version**, url,
   accepted, accepted_at.
3. `consent_events` — append-only. RLS lets the owner read; nobody can write, update or
   delete from a browser.

Two things make a record provable rather than merely stored:

- **The version.** `src/lib/agreements.ts` holds the version of each document. Bump it
  whenever what the user is shown changes, or old acceptances silently appear to cover new
  wording.
- **The server clock.** Identity comes from `auth.uid()` and the timestamp from `now()`.
  A browser cannot forge an acceptance, back-date one, or claim a tick that was never
  made. A declined consent never carries an `accepted_at`.

## Withdrawal

| Consent | Route |
| --- | --- |
| Marketing email | Account and billing → the box. Or the app's Settings → Account. Or the unsubscribe link. |
| Advertising | Cookie settings, linked from the footer of every page, the cookie policy and the privacy policy. |
| Analytics | The same place. |
| Terms | Not withdrawable. Closing the account ends the contract. |

Refusing is exactly as easy as accepting: **Reject optional** sits beside **Accept all**,
same size, same prominence. Nothing optional is ever pre-ticked.

## What each consent actually gates

A stored opt-in that no code reads is theatre. Today:

- **Analytics** — really gates GA4. `initTagging()` pushes denied defaults before the tag
  loads, so nothing measures anyone who has not agreed. Enforced.
- **Advertising, in the browser** — gates two different things by two different mechanisms,
  because they are not the same platform. For Google it gates `ad_storage`, `ad_user_data`
  and `ad_personalization` through Consent Mode v2, enforced by Google's own tag. For Meta
  it gates whether the Pixel script is **loaded at all** (`src/lib/meta-pixel.ts`) — Meta
  does not read Consent Mode, so a denied `ad_storage` suppresses nothing on their side, and
  loading the script then asking it to behave would be a weaker promise than the banner
  makes. Withdrawal revokes the Pixel and deletes the `_fbp` / `_fbc` cookies.
  It also gates `em_sha256`, the hashed email on `sign_up_completed`. That used to be pushed
  regardless, which made an ad-matching identifier available for somebody who declined.
- **Advertising, on the server** — really gates the **Meta Conversions API** `Purchase`
  event. `src/server/meta-capi.ts` reads `advertising_opt_in` with the service-role key,
  keyed on the Supabase user id in the Stripe Checkout Session metadata, and sends nothing
  when the flag is false, when there is no membership row, when the lookup throws, or when
  the session carried no user id. Fail closed: a failure to prove consent is not consent.
  The gate is inside the forwarder rather than at its call site, so a second caller cannot
  be added without it. Google Enhanced Conversions is still not implemented; when it is, it
  goes through the same gate. See `docs/META_CAPI_SETUP.md`.
- **Marketing email** — gates nothing in code yet, because no email is sent from this
  repo. It is the filter for any future send, and the index
  `brand_memberships_mkt_email_idx` exists for exactly that query.

## The contract for the product app

`app.batchlabel.xyz` (repo `Batch-Label-Product-Application`) shares the session cookie on
`.batchlabel.xyz` and the same Supabase project.

1. **Never invent a write path.** No table write, ever — not to `brand_memberships`, not
   to `consent_events` — and no endpoint of its own. RLS gives the browser no write path
   to either table and that is not an oversight to work around.

   `set_consent()` is not a way around that rule, it is the rule. It is granted to
   `authenticated`, it takes identity from `auth.uid()`, it builds the acceptance boolean
   and the timestamp server-side, and it writes the flag, the snapshot and the audit row
   in one transaction. It is what this site calls from its own account area. The app calls
   the same function for the same consent, so there is still exactly one way a consent is
   recorded, whichever screen the maker used.
2. **Change what it may, ask nothing new.** The app must not show its own cookie banner or
   an advertising toggle. Advertising is the banner's marketing choice and the app cannot
   even see it — `bl_consent` lives in `localStorage` and in a host-only cookie on
   `www.batchlabel.xyz`, so neither crosses to the app. The app shows the stored
   `advertising_opt_in` as state, read-only, and links to
   `/cookie-policy?cookie-settings=1`, which opens the banner directly.

   The marketing email box is the exception, and it is a change control rather than a new
   question: the same consent, the same wording, the same function, in the place a maker
   who lives in the product will actually look. Both screens read the same row, so neither
   can show a stale answer for long.
3. **Keep the version strings identical.** The app has its own copy of `agreements.ts`.
   Bump a version here and it must be bumped there in the same change, or one piece of
   wording ends up with two version numbers in `consent_events`, which defeats the only
   purpose the field has. There is a test in that repo pinning the values.
4. **Read under RLS, with the user's own session.** `advertising_opt_in`,
   `marketing_email_opt_in` and `consents` are readable on the caller's own membership
   row. No service-role key in the app.
5. **Honour what it reads.** If the app ever forwards data to an advertising platform,
   check `advertising_opt_in` first and fail closed.
6. **Assume denied when unknown.** A failed read is not consent.

One thing this does not record, and should. `set_consent()` stamps every post-signup
change with `source = 'account_settings'`, so an audit row cannot say which of the two
sites the maker was on. That is a missing detail rather than a wrong one — the user, the
consent, the version and the time are all correct — but a `source` argument on the
function would fix it, and it needs a migration.

If the app needs a genuinely new permission — one this document does not already cover —
add it here first, with which system owns it, before writing the UI.

## Adding a consent

Before adding a checkbox anywhere, answer these:

1. Is the purpose real and separable, or is it part of one we already ask about?
2. Is it consent at all, or is it contract, or legitimate interest?
3. Which system owns it, and how does the other one derive from it?
4. What will read the stored value, and what will it stop happening?

If question 4 has no answer, do not collect it.
