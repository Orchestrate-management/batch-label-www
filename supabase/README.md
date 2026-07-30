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

1. resolves the membership (metadata user id → subscription id → customer id → the email that
   paid);
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
The contract for the separate product app is [`../docs/ENTITLEMENTS.md`](../docs/ENTITLEMENTS.md);
the founder's dashboard steps are [`../docs/STRIPE_SETUP.md`](../docs/STRIPE_SETUP.md).
