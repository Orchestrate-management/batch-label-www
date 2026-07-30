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

## Billing write-back (server side)

`brand_memberships` billing columns (`plan`, `plan_status`, `stripe_customer_id`,
`stripe_subscription_id`) are **service-role only** — RLS gives browser clients no write
path, so a user cannot promote their own plan. Wire `src/api/stripe-webhook.ts` to update
the membership on `checkout.session.completed` using the service-role key, keyed off the
`supabase_user_id` already placed in the Stripe Checkout Session metadata by
`src/api/create-checkout-session.ts`:

```ts
await fetch(`${SUPABASE_URL}/rest/v1/brand_memberships?user_id=eq.${userId}&brand_slug=eq.batchlabel`, {
  method: 'PATCH',
  headers: {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal'
  },
  body: JSON.stringify({
    plan: 'maker',
    plan_status: 'active',
    stripe_customer_id: session.customer,
    stripe_subscription_id: session.subscription
  })
});
```
