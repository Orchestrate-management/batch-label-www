# Stripe subscriptions — setup

Almost everything in this file is a dashboard click or a one-line command, not code. Do them
in order:

1. [Product and prices](#1-product-and-prices) — £14/mo and £140/yr, VAT inclusive
2. [Stripe Tax](#2-stripe-tax) — so the VAT is worked out for you
3. [Customer portal](#3-customer-portal) — the screen "Manage billing" opens
4. [Webhook endpoint](#4-webhook-endpoint) — and its signing secret
5. [Vercel environment variables](#5-vercel-environment-variables) — the three missing ones
6. [Apply the database migration](#6-apply-the-database-migration)
7. [Test it](#7-test-it) — Stripe CLI, then a real card
8. [Check it landed](#8-check-it-landed) — the SQL to run

**Nothing charges anybody until step 5 and a redeploy.** The endpoints refuse to run without
the price ids, and the webhook refuses to process anything without its signing secret, so
merging this branch cannot start taking money before you have finished.

Real values for this project, used throughout:

| Thing | Value |
| --- | --- |
| Marketing site | `https://www.batchlabel.xyz` |
| Product client | `https://app.batchlabel.xyz` (separate repo) |
| **Webhook URL** | `https://www.batchlabel.xyz/api/stripe-webhook` |
| Vercel org / project | `orchestrate-hq` / `batch-label` |
| Supabase project ref | `cqzrwfresuiktgzhkhok` |
| Maker monthly | £14.00 GBP, VAT **inclusive** |
| Maker yearly | £140.00 GBP, VAT **inclusive** |

---

## 1. Product and prices

Stripe Dashboard → **Product catalogue** → **Add product**. Do this in **Test mode** first
(the toggle top right), then repeat in Live mode — test and live are entirely separate
worlds, including the price ids and the webhook secret.

### 1a. The product

- **Name**: `Batchlabel Maker`
- **Description**: `Unlimited print-ready CLP labels, UFI generation, batch codes and saved recipes.`
- **Tax code**: search for and pick **Software as a service (SaaS)**. This is what tells
  Stripe Tax which VAT rate applies where. If you are unsure which code fits, ask your
  accountant — it affects what you owe, and this document cannot answer it for you.

### 1b. The two prices

Add both to the same product, so the customer portal can switch between them.

| | Monthly | Yearly |
| --- | --- | --- |
| Amount | `14.00` | `140.00` |
| Currency | `GBP` | `GBP` |
| Billing period | `Monthly` | `Yearly` |
| **Tax behaviour** | **Inclusive of tax** | **Inclusive of tax** |

**Tax behaviour is the one that matters and it cannot be changed later.** "Inclusive" means
£14 is the total the customer pays and the VAT is worked out from inside it — which is what
the pricing page promises ("VAT included"). If you pick *Exclusive* by mistake, a UK customer
is charged £16.80 and you have to create new prices and switch everybody over.

Copy both price ids now. They look like `price_1Q...`. You need them in step 5.

---

## 2. Stripe Tax

Settings → **Tax** (or search "Tax" in the dashboard).

1. **Set your origin address** — where you trade from.
2. **Add a registration** for the UK if you are VAT registered. If you are not registered,
   Stripe still calculates £0 VAT correctly; you do not need to invent a registration.
3. Turn on **automatic tax calculation**.

The API calls in this repo already pass `automatic_tax: { enabled: true }`, so nothing in the
code changes here. Checkout will collect the customer's country and postcode when it needs
them to work out the rate.

---

## 3. Customer portal

Settings → **Billing** → **Customer portal**.

- Turn the portal **on**.
- **Invoice history**: on. Makers download their own VAT receipts and stop emailing you.
- **Customers can update payment methods**: on.
- **Customers can cancel subscriptions**: on, set to **at end of billing period**. This is
  what makes `cancel_at_period_end` meaningful — the person keeps access until the date they
  have already paid for, which the entitlement read surface reports honestly.
- **Customers can switch plans**: on, and add **both** Maker prices. That is the monthly ⇄
  yearly switch.
- Set the **business information** links to `https://www.batchlabel.xyz/terms` and
  `https://www.batchlabel.xyz/privacy`.

---

## 4. Webhook endpoint

Developers → **Webhooks** → **Add endpoint**.

- **Endpoint URL**:

  ```
  https://www.batchlabel.xyz/api/stripe-webhook
  ```

- **Events to send** — exactly these five:

  | Event | Why |
  | --- | --- |
  | `checkout.session.completed` | Links the Stripe customer to the Supabase account. Without it the billing portal can never find them. |
  | `customer.subscription.created` | First grant of the plan. |
  | `customer.subscription.updated` | Renewals, plan switches, cancel-at-period-end, past_due. |
  | `customer.subscription.deleted` | Ends the entitlement. |
  | `invoice.payment_failed` | Records a bounced renewal so the account screen can say why. |

- Save, then click into the endpoint and **Reveal** the **Signing secret**. It starts
  `whsec_`. That is `STRIPE_WEBHOOK_SECRET` in the next step.

**The test-mode and live-mode endpoints have different signing secrets.** If you set up both,
the live one is the one that belongs in the `production` environment.

---

## 5. Vercel environment variables

Three are missing. From the repo root:

```bash
cd ~/Documents/Orchestrate/batch-label

# The webhook signing secret from step 4. Without it the endpoint returns 500 and
# processes nothing - which is deliberate: an unverified webhook is an endpoint where
# anyone who can POST JSON can give themselves a paid plan.
for ENV in production preview development; do
  printf 'whsec_REPLACE_ME' | vercel env add STRIPE_WEBHOOK_SECRET "$ENV"
done

# The two price ids from step 1b.
for ENV in production preview development; do
  printf 'price_REPLACE_ME_MONTHLY' | vercel env add STRIPE_PRICE_MAKER_MONTHLY "$ENV"
done

for ENV in production preview development; do
  printf 'price_REPLACE_ME_ANNUAL' | vercel env add STRIPE_PRICE_MAKER_ANNUAL "$ENV"
done

# Vite inlines env at build time and the functions read it at runtime, so redeploy.
vercel --prod
```

Use `printf`, not `echo` — `echo` appends a newline, and a price id with a trailing `\n` fails
with a "No such price" error that reads like the price does not exist.

### Already set, and still needed

`STRIPE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` (or `VITE_SUPABASE_URL`),
`VITE_ORCHESTRATE_BRAND`.

### Optional

| Variable | Default | What it does |
| --- | --- | --- |
| `SITE_URL` | `https://www.batchlabel.xyz` | Where checkout returns when the caller's origin is unknown. |
| `STRIPE_ALLOWED_ORIGINS` | *(none)* | Extra comma-separated CORS origins. Use it to let a **preview** deployment of the app repo call these endpoints, e.g. `https://app-git-my-branch.vercel.app`. |

---

## 6. Apply the database migration

`supabase/migrations/20260801120000_entitlements.sql` adds the columns a real subscription
needs, the exactly-once event ledger, and the read surface the app repo uses.

```bash
cd ~/Documents/Orchestrate/batch-label
supabase link --project-ref cqzrwfresuiktgzhkhok   # once
supabase migration list                            # see what will run
supabase db push
```

Prefer no CLI? Paste the file into the Supabase SQL editor. It is idempotent
(`if not exists` / `create or replace` throughout), so re-running it is safe.

Then confirm the read surface exists and is locked down:

```sql
-- Should return one row, with security_invoker=true in the options.
select relname, reloptions from pg_class where relname = 'entitlements';

-- Should list ONLY 'authenticated'. If 'anon' appears, stop and re-run the migration.
select grantee, privilege_type from information_schema.role_table_grants
where table_name = 'entitlements';
```

---

## 7. Test it

### 7a. With the Stripe CLI (no real money)

```bash
brew install stripe/stripe-cli/stripe
stripe login

# Run the site and its functions locally. `vercel dev` is required rather than `npm run dev`
# - Vite serves the front end only and knows nothing about the /api directory.
cd ~/Documents/Orchestrate/batch-label
vercel dev            # serves on http://localhost:3000

# In a second terminal. This prints its OWN whsec_ secret - use that one locally, not the
# dashboard's, or every event fails verification.
stripe listen --forward-to localhost:3000/api/stripe-webhook
```

Then, in a third terminal:

```bash
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
stripe trigger invoice.payment_failed
```

Watch the `stripe listen` output. You want `[200]` with a JSON body like
`{"received":true,"outcome":"applied"}`.

Other outcomes and what they mean:

| Body | Meaning |
| --- | --- |
| `"outcome":"applied"` | Written. |
| `"outcome":"duplicate"` | Stripe sent the same event id twice. Correct behaviour, nothing rewritten. |
| `"outcome":"stale"` | A newer event was already applied. Correct behaviour for an out-of-order delivery. |
| `"outcome":"no_membership"` | The event matched no account. Expected for `stripe trigger`, which invents a customer that has never signed up. Not expected for a real purchase. |
| `"outcome":"ignored"` | An event type this endpoint does not act on. |
| `400 Invalid signature.` | Wrong secret. Locally you must use the one `stripe listen` printed. |

### 7b. With a real test card

1. Go to `https://www.batchlabel.xyz/pricing` (test mode: use a Vercel preview with test keys).
2. Press **Get the Maker plan**.
3. Card `4242 4242 4242 4242`, any future expiry, any CVC, any postcode.
4. You should land on `/checkout/success`.
5. Sign in and open **Account and billing** → **Manage billing**. The Stripe portal should
   open showing that subscription.

To test a failed renewal, use card `4000 0000 0000 0341` (attaches successfully, then fails on
the renewal charge).

---

## 8. Check it landed

Supabase → **SQL Editor**:

```sql
-- The entitlement itself.
select
  user_id, plan, plan_status, current_period_end, cancel_at_period_end,
  stripe_customer_id, stripe_subscription_id, stripe_price_id,
  stripe_event_id, stripe_event_at, data -> 'billing' as billing
from public.brand_memberships
where brand_slug = 'batchlabel'
order by updated_at desc
limit 5;

-- Every webhook event that has been processed, newest first. This is the idempotency
-- ledger: an event id appearing once is what "exactly once" looks like.
select event_id, event_type, outcome, event_at, processed_at
from public.stripe_webhook_events
order by processed_at desc
limit 20;
```

A healthy first subscription looks like `plan = 'maker'`, `plan_status = 'active'`,
`current_period_end` a month or a year out, `cancel_at_period_end = false`, and both Stripe
ids populated.

---

## Troubleshooting

### `/api/...` returns HTML, or a 200 with the whole web page in it

That is the single most confusing failure here, and it has two causes, both fixed on this
branch — check they have not been undone:

1. **The functions must live in the ROOT `/api` directory.** Vercel builds functions from
   `/api` only. They used to sit in `src/api/`, which Vercel never looks at, so the routes did
   not exist at all. See `src/api/README.md`.
2. **`vercel.json`'s SPA rewrite must exclude `/api`.** It must read
   `"source": "/((?!api/).*)"`. With a bare `/(.*)` the single-page app catch-all can answer
   API requests with `index.html` and a **200**, so a broken endpoint looks like a working
   one right up until you read the response body.

Quick check against production:

```bash
curl -i -X POST https://www.batchlabel.xyz/api/stripe-webhook
# Expect: HTTP/2 400  {"error":"Missing Stripe signature."}
# NOT:    HTTP/2 200  <!doctype html>...
```

A 400 there is the healthy answer — it means the function exists, ran, and refused an
unsigned request.

### Every event fails with `Invalid signature.`

- Locally: you are using the dashboard secret instead of the one `stripe listen` printed.
- In production: the secret belongs to the other mode (test secret on a live endpoint or
  vice versa), or it was added with `echo` and has a trailing newline.

### `outcome: no_membership` on a real purchase

The webhook could not tie the payment to an account. It tries, in order: the
`supabase_user_id` in the Stripe metadata, the subscription id, the customer id, then the
email that paid. That last one only works if the person's Supabase account uses the same
address they paid with.

Nothing is lost — the event is deliberately **not** recorded as processed, so once the
account exists you can open the event in the Stripe dashboard and press **Resend** and it will
apply properly.

### "Manage billing" says it cannot find a billing record

`stripe_customer_id` is null on that membership, which means `checkout.session.completed`
never arrived. Confirm that event is ticked on the webhook endpoint (step 4), then resend it
from the dashboard.

### Checkout 400s with a message about `customer_update`

Stripe requires `customer_update[address]=auto` whenever `automatic_tax` is on and an existing
customer is reused. The code passes it; if you see this, `automatic_tax` was turned on
somewhere the code does not know about (e.g. directly on a subscription).
