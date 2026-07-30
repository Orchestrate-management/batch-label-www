# Entitlements — the contract for the product app

This is the interface between this repo (the marketing site, which owns billing) and
**`app.batchlabel.xyz`**, which lives in a separate repository. Everything below is a promise
this repo keeps; treat it as the API and do not reach past it into `brand_memberships`.

**Prerequisite — a signed-in Supabase client.** Everything here reads as the signed-in user,
so the app needs a Supabase client carrying that user's session. Making one login cover both
`www.batchlabel.xyz` and `app.batchlabel.xyz` is **handled separately and is not part of this
document** — it has to be identical on both sides, so it is specified and delivered once for
both repos. Until that lands, these queries return nothing on `app.` because there is no
session there yet, which is expected and is not a bug in the entitlement layer.

---

## The read surface

Two ways in. They answer identically; pick whichever suits the call site.

### `public.entitlements` (view)

| Column | Type | Meaning |
| --- | --- | --- |
| `user_id` | `uuid` | The Supabase user. Always the caller's own. |
| `brand` | `text` | Orchestrate sub-brand slug. `batchlabel` here. |
| `plan` | `text` | `free` or `maker`. |
| `status` | `text` | The **Stripe subscription** status. See the table below. |
| `membership_status` | `text` | The **account lifecycle**: `active`, `suspended` or `left`. Separate from `status` — it is about us, not about Stripe. |
| `active` | `boolean` | **Read this one.** Whether the user is entitled right now. |
| `current_period_end` | `timestamptz` | End of the paid period. Null on the free plan. |
| `cancel_at_period_end` | `boolean` | True when the subscription stops at `current_period_end`. |
| `trial_end` | `timestamptz` | End of the Stripe trial, when there is one. |
| `updated_at` | `timestamptz` | When the row last changed. |

One row per (user, brand). A user with no membership for a brand has **no row** — that is a
normal state, not an error.

### `public.get_entitlement(p_brand text default null)` (RPC)

Same columns minus `user_id`, as a set-returning function. Pass a brand slug to filter, or
nothing to get every brand the user belongs to.

### Why you cannot see anyone else's

The view is declared `with (security_invoker = true)`, so it runs as the **caller** and the
row-level-security policy on `brand_memberships` (`auth.uid() = user_id`) applies to it. A
view without that option would run as its owner, which bypasses RLS, and would hand every
signed-in user everybody else's billing state. `get_entitlement` is `SECURITY INVOKER` **and**
filters on `auth.uid()` explicitly — two independent reasons, so neither one being removed by
accident is enough to leak.

Neither is granted to `anon`. Signed out, you get nothing.

---

## Reading it

```ts
import { createClient } from '@supabase/supabase-js';

// Whatever client the app already uses for the signed-in user.
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export interface Entitlement {
  brand: string;
  plan: 'free' | 'maker';
  status: string | null;
  membership_status: 'active' | 'suspended' | 'left';
  active: boolean;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_end: string | null;
}

/**
 * The signed-in user's entitlement for Batchlabel, or null when they have no membership.
 *
 * No user id is passed and none should be: RLS scopes this to the caller, so asking for
 * someone else's row simply returns nothing.
 */
export async function fetchEntitlement(): Promise<Entitlement | null> {
  const { data, error } = await supabase
    .from('entitlements')
    .select('brand, plan, status, membership_status, active, current_period_end, cancel_at_period_end, trial_end')
    .eq('brand', 'batchlabel')
    .maybeSingle();

  if (error) {
    // Fail SOFT, not open: return null and let the UI say "we could not check your plan"
    // rather than either unlocking the product or locking out a paying customer.
    console.error('entitlement read failed', error);
    return null;
  }
  return (data as Entitlement) ?? null;
}
```

The RPC form, if you prefer it:

```ts
const { data } = await supabase.rpc('get_entitlement', { p_brand: 'batchlabel' });
const entitlement = (data as Entitlement[] | null)?.[0] ?? null;
```

### Gating a feature

```ts
const entitlement = await fetchEntitlement();

if (entitlement?.active) {
  // Unlimited labels, print-ready PDF/SVG, no watermark, UFI, saved recipes.
} else {
  // Free tier: one label, watermarked PNG.
}
```

**Use `active`. Do not reimplement it** from `plan`, `status` and `current_period_end`. That
rule lives in one place — `public.entitlement_is_active()` — precisely so the app and the
marketing site cannot disagree about whether somebody has paid. A second copy is how a
customer sees "active" on one screen and a paywall on the next.

---

## What each status means

| `status` | `active` | What it is | What the UI should do |
| --- | --- | --- | --- |
| *(no row)* | — | No membership for this brand. | Treat as free. |
| `null` | `false` | Membership exists, never subscribed. | Free tier. Offer the upgrade. |
| `trialing` | `true` | In a Stripe trial. | Full access. Optionally show when the trial ends. |
| `active` | `true` | Paying, in good standing. | Full access. |
| `past_due` | `true` | A renewal payment failed; Stripe is retrying. | **Keep access** and show a banner asking them to update their card. Locking out a customer whose card expired on a Sunday is worse for us than a few days of unpaid access. |
| `canceled` | `false` | Subscription ended. | Free tier. |
| `unpaid` | `false` | Stripe gave up retrying. | Free tier. |
| `incomplete` | `false` | The first payment never completed — they are not a customer. | Free tier. |
| `incomplete_expired` | `false` | Same, and Stripe has expired it. | Free tier. |
| `paused` | `false` | Subscription paused. | Free tier. |

And independently of all of the above, `membership_status`:

| `membership_status` | `active` | What the UI should do |
| --- | --- | --- |
| `active` | as per the table above | Normal. |
| `suspended` | always `false` | "Your account is suspended — get in touch." Do **not** show a paywall or an upgrade button; they may already be paying. |
| `left` | always `false` | Treat as no account for this brand. |

Three more things `active` already accounts for, so you do not have to:

- **`cancel_at_period_end = true` with `status = 'active'` is still entitled.** They cancelled
  but have paid up to `current_period_end`. Show "your plan ends on {date}", keep the features
  on until then.
- **A one-day grace past `current_period_end`.** Absorbs webhook lag and clock skew so a
  renewal we have not been told about yet does not read as an expiry.
- **`membership_status` must be `active`.** A suspended or departed member is not entitled
  even with a live Stripe subscription — otherwise suspending an account would do nothing.
  It is exposed as its own column so the UI can tell "your subscription ended" from "your
  account is suspended", which need very different messages.

---

## Reacting to a change

Entitlements change from Stripe webhooks, not from anything the app does, so a value read at
page load can go stale.

- **After returning from Checkout**, re-read once on mount and, if it still says `free`, again
  after a couple of seconds. The webhook and the browser redirect are racing and the webhook
  usually wins, but not always.
- **For live updates**, subscribe to changes on `public.brand_memberships` with Supabase
  Realtime (RLS applies, so you only receive your own row) and re-read the view when one
  arrives. Realtime does not publish views, which is why the subscription is on the table and
  the read stays on the view.
- Otherwise, re-reading on app focus is plenty. This is not high-frequency data.

---

## Sending someone to billing

The billing endpoints live on the marketing site and accept cross-origin calls from
`https://app.batchlabel.xyz` **with credentials**, so send the user's access token:

```ts
async function openBilling(path: '/api/create-portal-session' | '/api/create-checkout-session', body: object) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('not signed in');

  const response = await fetch(`https://www.batchlabel.xyz${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });

  const payload = await response.json();
  if (!response.ok || !payload.url) throw new Error(payload.error ?? 'billing unavailable');
  window.location.href = payload.url;
}

// Upgrade:
openBilling('/api/create-checkout-session', { interval: 'monthly', success_path: '/billing/done' });

// Manage an existing subscription:
openBilling('/api/create-portal-session', { return_path: '/settings/billing' });
```

Notes:

- **Both endpoints require a session and answer 401 without one.** `create-checkout-session`
  used to allow an anonymous purchase; it no longer does. The webhook then had to work out
  afterwards who had paid, and the only thing it had for that was the email typed into Stripe
  Checkout — which was exploitable, and which could not link a buyer who had no account at
  all. So send a signed-out user to sign in *before* offering checkout, rather than letting
  the call fail. (The marketing site remembers which interval they picked across the signup;
  see `src/lib/checkout-intent.ts` if you want the same behaviour.)
- **Never send a `user_id`.** Both endpoints ignore any such field and resolve identity from
  the token. There is no parameter to get wrong.
- **`create-checkout-session` returns 409 if the user already has an active subscription.**
  Do not treat that as an error to retry — show "you are already on the Maker plan" and offer
  the billing portal instead. Read `active` before rendering an upgrade button so they are
  never invited to buy a second one.
- `success_path` / `cancel_path` / `return_path` must be **paths**, not URLs. They are joined
  onto your own origin (which must be on the allow-list); an absolute or protocol-relative
  value is rejected and the default is used, so these cannot be turned into an open redirect.
- A preview deployment of the app repo needs its origin added to `STRIPE_ALLOWED_ORIGINS` in
  Vercel — see `docs/STRIPE_SETUP.md`.
- `/api/create-portal-session` returns **404** when the user has never subscribed. That is a
  normal state, not a failure: show "you are on the free plan" rather than an error.

---

## What the app must NOT do

- **Never write entitlement state.** No `update`, no `upsert`, no `insert` against
  `brand_memberships` or anything derived from it. The database will refuse — `authenticated`
  holds `SELECT` and nothing else, and this migration re-revokes the rest — so an attempt
  fails at runtime rather than quietly succeeding. Entitlements are written only by the Stripe
  webhook, from a signature-verified event, using the service role.
- **Never put `SUPABASE_SERVICE_ROLE_KEY` in the app.** It bypasses RLS entirely. If it
  reaches a browser bundle, every user can read and rewrite every account's billing.
- **Never call `apply_stripe_entitlement`.** It is granted to `service_role` only and will
  reject an anon or authenticated caller, but do not build anything that tries.
- **Never trust a plan value held in client state, a JWT claim, or `localStorage`** as the
  authority for unlocking a paid feature. Read the view.
- **Do not read `brand_memberships` directly for billing.** Its column set is this repo's to
  change; `entitlements` is the stable contract. (Reading it for non-billing fields the app
  already uses is fine.)
- **Do not duplicate the "is active" rule.** See above.
- **Do not offer checkout to someone who is already `active`.** The endpoint refuses with a
  409, but a UI that offers the button at all is how a paying customer ends up with two
  subscriptions and two charges a month. Plan changes go through the billing portal, which
  handles proration.
- **Do not write `profiles.email`.** It is server-maintained from `auth.users` and
  `authenticated` no longer holds the column privilege. `full_name` and `attributes` are
  yours to write.

---

## Related

- `supabase/migrations/20260801120000_entitlements.sql` — the columns, the write path and the
  view, with the reasoning.
- `docs/STRIPE_SETUP.md` — what the founder does in the Stripe and Vercel dashboards.
- `supabase/README.md` — the shared Orchestrate identity model this sits on.
