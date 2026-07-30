# Consent at Batchlabel

Every permission we hold, where it is asked, where it is stored, and what it gates.

The rule this document exists to enforce: **one purpose, one place it is asked, one
record.** A permission collected twice will eventually be answered two different ways, and
two contradictory records are worse than none — a contradiction proves we did not know.

## Who owns what

| Purpose | Asked | Stored | Changed |
| --- | --- | --- | --- |
| Terms of Service | Signup form, and `/finish-setup` after Google | `brand_memberships.consents.terms` + `consent_events` | Not withdrawable. It is a contract, not consent. |
| Marketing email | Signup form, one optional box | `brand_memberships.marketing_email_opt_in` | Account and billing, or the unsubscribe link in any email |
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
| Marketing email | Account and billing → the box. Or the unsubscribe link. |
| Advertising | Cookie settings, linked from the footer of every page, the cookie policy and the privacy policy. |
| Analytics | The same place. |
| Terms | Not withdrawable. Closing the account ends the contract. |

Refusing is exactly as easy as accepting: **Reject optional** sits beside **Accept all**,
same size, same prominence. Nothing optional is ever pre-ticked.

## What each consent actually gates

A stored opt-in that no code reads is theatre. Today:

- **Analytics** — really gates GA4. `initTagging()` pushes denied defaults before the tag
  loads, so nothing measures anyone who has not agreed. Enforced.
- **Advertising, in the browser** — really gates `ad_storage`, `ad_user_data` and
  `ad_personalization` through Consent Mode v2. Enforced by Google's tag.
- **Advertising, on the server** — gates **nothing yet**. The Meta Conversions API and
  Google Enhanced Conversions calls do not exist yet. The gate they must respect is
  documented at the top of `src/server/webhook.ts`, which is where a paid conversion
  would be forwarded from.
  There is a `CONSENT GATE` note at that exact point: whoever implements them must read
  `advertising_opt_in` and skip forwarding when it is false, failing closed if the lookup
  fails.
- **Marketing email** — gates nothing in code yet, because no email is sent from this
  repo. It is the filter for any future send, and the index
  `brand_memberships_mkt_email_idx` exists for exactly that query.

## The contract for the product app

`app.batchlabel.xyz` (repo `Batch-Label-Product-Application`) shares the session cookie on
`.batchlabel.xyz` and the same Supabase project. Its consent responsibilities are entirely
negative:

1. **Never write consent.** Not to `brand_memberships`, not to `consent_events`, not
   through any endpoint of its own. Every write goes through `set_consent()` or
   `complete_oauth_signup()`, which take identity from `auth.uid()` and stamp the time
   server-side. RLS gives the browser no write path to either table, and that is not an
   oversight to work around.
2. **Never ask again.** The app must not show its own cookie banner, marketing checkbox or
   advertising toggle. Asking a second time creates the exact contradiction this document
   exists to prevent. Link to the marketing site's cookie settings and account area.
3. **Read under RLS, with the user's own session.** `advertising_opt_in`,
   `marketing_email_opt_in` and `consents` are readable on the caller's own membership
   row. No service-role key in the app.
4. **Honour what it reads.** If the app ever forwards data to an advertising platform,
   check `advertising_opt_in` first and fail closed.
5. **Assume denied when unknown.** A failed read is not consent.

If the app needs a genuinely new permission — one this document does not already cover —
add it here first, with which system owns it, before writing the UI.

## Adding a consent

Before adding a checkbox anywhere, answer these:

1. Is the purpose real and separable, or is it part of one we already ask about?
2. Is it consent at all, or is it contract, or legitimate interest?
3. Which system owns it, and how does the other one derive from it?
4. What will read the stored value, and what will it stop happening?

If question 4 has no answer, do not collect it.
