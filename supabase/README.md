# Orchestrate identity (Supabase)

One Supabase project is the **shared identity pool for every Orchestrate offering**.
Batchlabel is the first sub-brand; others reuse the same project and the same login.

## Schema

| Table                      | Purpose                                                                 |
| -------------------------- | ----------------------------------------------------------------------- |
| `auth.users`               | Supabase-managed credentials / login.                                   |
| `public.profiles`          | One row per user. Global, brand-agnostic identity.                      |
| `public.brands`            | The sub-brand dimension. `slug` is the filter key (e.g. `batchlabel`).  |
| `public.brand_memberships` | Which brand(s) a user belongs to. **Filter by `brand_slug`.**           |
| `public.accounts`          | The business. What product data belongs to. Read-only to the browser.  |
| `public.account_members`   | Who may act in an account. One row today: the owner. Read-only.        |
| `public.specifications`    | The composition — one row per recipe. Keyed on `account_id`.           |
| `public.products`          | The SKU — recipe x pack size x packaging. Keyed on `account_id`.       |

The last four arrive in `migrations/20260803120000_account_data_schema.sql`; see
[Accounts and product data](#accounts-and-product-data-migrations20260803120000_account_data_schemasql)
below. **Nothing is keyed on `user_id`.**

**Extending later:** if a field is common to most offerings, add a typed column to
`brand_memberships`; if it is specific to one offering, put it in the `data` jsonb. That
keeps common queries typed and fast while never blocking a new value proposition on a
migration.

A new signup is provisioned automatically: a trigger on `auth.users` mirrors a `profiles`
row and, using the `brand` sent by the front-end, creates the matching `brand_membership`
with the first-touch attribution captured at signup.

**OAuth signups are the exception.** `signInWithOAuth` has nowhere to put that signup
context, so the trigger never sees a brand and creates no membership — and no Terms
acceptance. Those users are routed to a completion screen that calls
`complete_oauth_signup()` (see `migrations/20260731120000_google_oauth_provisioning.sql`),
which writes the membership and the consent audit rows in one transaction, keyed on
`auth.uid()`, refusing to provision at all unless the terms were accepted. Console setup
for the Google provider lives in [`../docs/GOOGLE_OAUTH_SETUP.md`](../docs/GOOGLE_OAUTH_SETUP.md).

## Consent columns

Three consents are recorded per membership, but only two are **asked** on a signup form:

| Column | Asked where |
| --- | --- |
| `consents.terms` | Signup form, and `/finish-setup` after Google. Required. |
| `marketing_email_opt_in` | Signup form, one optional box. |
| `advertising_opt_in` | **Not on any form.** Derived from the cookie banner's marketing toggle. |

Advertising used to be a third checkbox as well as a banner toggle, with nothing
reconciling the two. It is now written only from the banner choice — at signup through the
usual metadata and RPC arguments, and afterwards through `set_consent`. No schema change
was needed: `complete_oauth_signup(p_advertising_opt_in ...)` carries a derived value
where it used to carry a ticked one.

Every consent write still goes through `set_consent()` or `complete_oauth_signup()`.
Neither table has an INSERT or UPDATE policy for `authenticated`, so there is no
client-side write path, and `consent_events` is append-only by construction. The full
model, including what the product app may and may not do, is in
[`../docs/CONSENT.md`](../docs/CONSENT.md).

## Apply the migration (Supabase CLI)

```bash
# 1. Install the CLI (macOS)
brew install supabase/tap/supabase

# 2. Authenticate (opens the browser)
supabase login

# 3. Link this repo to the linked project. Get the ref from the dashboard URL
#    (app.supabase.com/project/<ref>) or Project Settings -> General.
supabase link --project-ref <your-project-ref>

# 4. Preview what will run, then push
supabase migration list          # local vs remote
supabase db push
```

`supabase db push` will ask for the database password on first connect (Project Settings
-> Database). Nothing runs until you confirm.

> Prefer no CLI? Open the SQL editor in the dashboard and paste the contents of
> `migrations/20260729120000_init_orchestrate_identity.sql`. The migration is idempotent
> (`if not exists` / `on conflict`), so re-running it is safe.

## Environment variables

Set in Vercel (and `.env.local` for local dev — see `../.env.example`):

| Variable                  | Where            | Notes                                             |
| ------------------------- | ---------------- | ------------------------------------------------- |
| `VITE_SUPABASE_URL`       | browser + server | Project API URL.                                  |
| `VITE_SUPABASE_ANON_KEY`  | browser + server | Anon key. RLS protects the data.                  |
| `VITE_ORCHESTRATE_BRAND`  | browser          | Sub-brand slug for this deployment. `batchlabel`. |
| `SUPABASE_SERVICE_ROLE_KEY` | server only    | For the Stripe webhook to write billing state. **Never expose to the browser.** |

## Billing and entitlements

Implemented in `migrations/20260801120000_entitlements.sql`. The billing columns on
`brand_memberships` (`plan`, `plan_status`, `stripe_customer_id`, `stripe_subscription_id`,
`current_period_end`, `cancel_at_period_end`, `trial_end`, `stripe_price_id`) are
**service-role only** — `authenticated` holds `SELECT` and nothing else, so a browser client
has no path to promoting its own plan.

**Writes go through one function, not a PATCH.** An earlier draft of this file suggested
PATCHing the row from the webhook. That is wrong, and the reason is worth keeping: Stripe
webhooks are at-least-once and unordered, so a plain PATCH stores whichever delivery happened
to land last — a coin toss between a cancelled customer keeping access and a paying one losing
it. `public.apply_stripe_entitlement()` instead does the whole thing in one transaction:

1. resolves the membership (metadata user id → subscription id → customer id — **never** by
   email; see the section-4 comment in that file for why that path was a critical
   vulnerability rather than a convenience);
2. claims the Stripe event id in `public.stripe_webhook_events`, whose **primary key** is what
   makes processing exactly-once;
3. refuses any event older than the one already applied (monotonic on Stripe's `event.created`);
4. applies a **partial** update — a null argument means "this event says nothing about that
   column", so `checkout.session.completed` cannot blank a period end that
   `customer.subscription.created` already wrote.

It is granted to `service_role` only, so even a leaked anon key cannot reach it.

The route that calls it is [`/api/stripe-webhook.ts`](../api/stripe-webhook.ts) — in the
**root** `/api` directory, because that is the only place Vercel builds functions from. See
[`../src/api/README.md`](../src/api/README.md) for why that used to be wrong and what it broke.

### Reading entitlements

`public.entitlements` (a `security_invoker` view) and `public.get_entitlement(brand)`. Both are
readable by the owning user and nobody else, and both are granted to `authenticated` only.

### Plan limits (`migrations/20260802120000_plan_limits.sql`)

Two things, kept apart on purpose:

- **Whether** — `entitlement_is_active()` now tests the plan against an explicit *entitling*
  allow-list instead of "anything that is not free". The old predicate meant the £0.01
  payment-rail test item bought a real paid tier; a slug now grants nothing until someone
  adds it to that list. The function keeps its four-argument signature and still knows no
  quantity of any kind, and the migration asserts the behaviour at apply time rather than
  trusting the text.
- **How much** — `sku_limit` and `editor_seat_limit` on `brand_memberships`, `NOT NULL` and
  defaulting to the smallest allowance, written only by `apply_stripe_entitlement` (now
  sixteen arguments) from the plan contract in `src/server/plan-contract.ts`. The rule that
  produces the number lives in code; this database stores only the result. Unlimited is the
  int4-max sentinel and is read through `sku_is_unlimited()`, never compared to by a client.

The view and the RPC also expose `account_id` — the account key, under its final name, one
account per user for now — and `business_name`.

**`sku_limit` is now enforced.** It was not when this file first said so, and that paragraph
outlived its subject by one migration — it promised that "`can_modify` and `sku_count` ship
with the trigger, in the same migration", and
`migrations/20260803120000_account_data_schema.sql` is that migration. The trigger
(`enforce_sku_limit`) counts live products for the **account** before an insert, and both
view columns are live. Customer-facing copy about the allowance is therefore not merely
permitted, it has shipped — the product app renders it from `can_modify`.

Two things a reader must still get right, and they are unchanged:

- **Null is unknown, never zero and never false.** `sku_count` and `can_modify` are null
  whenever no account resolves for the caller. Fail open on null: a missing or unreadable
  column must never become a lockout.
- **`can_modify` answers "how much", not "may you".** It is the allowance and nothing else.
  A suspended member is refused by the RLS policy, not by the meter.

The contract for the separate product app is [`../docs/ENTITLEMENTS.md`](../docs/ENTITLEMENTS.md);
the founder's dashboard steps are [`../docs/STRIPE_SETUP.md`](../docs/STRIPE_SETUP.md).

## Accounts and product data (`migrations/20260803120000_account_data_schema.sql`)

The migration that makes a new signup a **virgin account** — no fixtures, ever — and makes a
product that is really created when a maker creates it. Its own header is the interface
document and is deliberately long; this is the map.

**Everything keys on `account_id`. Nothing keys on `user_id`.** Team support is deferred, not
cancelled, so the indirection exists from the first row rather than as a backfill over live
customer data later.

| Object | What it is |
| --- | --- |
| `public.accounts` | The business. `brand_slug`, `owner_user_id`, `name`. Created only by the provisioning path — the browser has no INSERT. |
| `public.account_members` | The person's standing *inside* an account (`owner`/`admin`/`editor`/`viewer`, `active`/`suspended`/`removed`). |
| `public.specifications` | The composition. Owns the four derivation inputs and **the UFI** — one UFI per recipe, not per pack size. |
| `public.products` | The SKU: recipe x pack size x packaging. What the SKU meter counts. |
| `public.is_member_of(uuid)` | The RLS predicate, callable for UI checks. |
| `public.current_account_id()` | The column default for `account_id` on both data tables. |

### Two gates, and both are checked

`account_members.status` is **the person**; `brand_memberships.status` is **the business**.
`is_member_of` requires both to be `active`, so suspending a business stops everyone in it —
in the database, not merely in the UI. It consults **status only**: plan, plan_status and
period end are deliberately not read, so a free, lapsed, past_due or downgraded customer
keeps full read and write access to what they already have. A maker must be able to reprint
a label for stock already on a shelf.

Two consequences that are easy to meet unprepared:

- A suspended caller's `select` returns **zero rows and no error**. An empty result is not
  distinguishable, in this database, from a virgin account — and it should not be, because a
  policy that raised would announce that rows exist. The app distinguishes them from
  `entitlements.membership_status`, which it reads before it renders anything.
- Do **not** enable `force row level security` on `accounts` or `account_members`. FORCE
  applies RLS to the table owner too, which re-arms the policy recursion `is_member_of` is
  SECURITY DEFINER to defuse.

### The `account_id` contract (stated identically on both branches)

1. The app **may and should** send `account_id` explicitly — the one it read from
   `entitlements` for its brand. The INSERT policy is `with check (is_member_of(account_id))`,
   so an explicit id weakens nothing; isolation rests on the policy, never on the default.
2. When it does not know, it **omits the column** and takes the default.
3. `current_account_id()` returns NULL when the caller has none or more than one, and will
   not be taught to pick. A default that chooses between two of a person's accounts mis-files
   their product silently.
4. **The same id scopes every read, and a null id means "do not read" — never "read without
   a filter".** RLS makes an account's rows invisible to a non-member; it does not choose
   between two accounts the same person belongs to. Dropping the filter widens the query to
   the union of both.

### Error codes

Branch on `error.hint` first and on `error.code` only after. **23502 is unreachable** — RLS
and the BEFORE INSERT triggers both answer before the NOT NULL constraint is reached, so a
client branch testing for it has never fired.

| Signal | Meaning |
| --- | --- |
| `P0001` hint `account_missing` | No active membership. Transient: finishing signup resolves it. |
| `P0001` hint `account_ambiguous` | Two or more. The app must send an `account_id`. **Permanent until it does — never offer a retry.** |
| `P0001` hint `sku_limit_reached` | The allowance. |
| `42501`, no hint | A policy refusal, with three causes: an account that is not yours, a null `account_id`, or a suspended/departed membership. Deliberately uninformative, and the app must not dress it up as a diagnosis. |

The migration asserts its own behaviour at apply time (section 11): the SKU rule fails open
on an unknown allowance and is strict at the limit, every membership has an account and every
account has a membership, `created_by` is pinned on both tables, and the null-account guard is
attached in the trigger order it depends on. A failure there aborts the migration, which is
the intent.
