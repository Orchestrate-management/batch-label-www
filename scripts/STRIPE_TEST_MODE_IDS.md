# Stripe TEST mode — what exists, and the commands to point Vercel at it

Written 2026-08-03 by the run of `scripts/stripe-sync.ts` and `scripts/stripe-portal-config.ts`
recorded below. **Test mode only. Nothing in live mode was created, changed or deleted.**

It lives in `scripts/` rather than `docs/` deliberately: `docs/STRIPE_SETUP.md` is being
rewritten by another workstream in parallel, and two agents editing one file is a merge
conflict for no benefit. Fold it in when that rewrite lands.

No amount appears in this file. Every price is a fact of `src/server/plan-contract.ts`; this
is only the map from a contract entry to the Stripe object that now carries it.

---

## What was already there

| Object | State found | What happened |
|---|---|---|
| `prod_Uysr1x15rF1mDL` "Batchlabel Maker" | `brand` metadata but no `plan`, no tax code, no statement descriptor, and a description promising "print ready PDF and SVG with no watermark" | **Reused**, not duplicated. Brought up to contract; the description was replaced (ruling R6 — there is no exporter yet, so no surface may promise one, and a Stripe description renders in Checkout and on the invoice). |
| `price_1Tyv5i2BOl8QlN28KD3o0PoZ` Maker monthly | `tax_behavior: inclusive` | **Archived.** `tax_behavior` is immutable once set, so an exclusive price cannot be an edit — it has to be a new object. |
| `price_1Tyv5i2BOl8QlN28Tu9sbRvT` Maker annual | `tax_behavior: inclusive` | **Archived**, same reason. |
| Portal configurations | none existed | One created (below). |
| Subscriptions on those prices | none | Nothing to cancel. Archiving a price does not cancel its subscriptions, so `stripe-sync.ts` checks and refuses rather than stranding anyone. |

> **Both Maker prices being tax-inclusive is why this is not just an addition.** Under the
> decided pricing every price is exclusive of VAT, so the old pair did not merely hold a stale
> amount — a checkout through them charged a different thing from what the copy says. They are
> archived, and the two ids below replace them. **`STRIPE_PRICE_MAKER_MONTHLY` and
> `STRIPE_PRICE_MAKER_ANNUAL` must be updated in preview and development, or those
> environments now point at archived prices.**

There are also 17 `myproduct` / USD products and 13 subscriptions in test mode left by
`stripe trigger` runs. They carry no `brand` metadata, so nothing here touches them and
`stripe-verify.ts` ignores them.

---

## The objects

| Plan | Product |
|---|---|
| maker | `prod_Uysr1x15rF1mDL` |
| studio | `prod_V0J7MflamSrAKv` |
| consultant | `prod_V0J7MY17Y2hbdo` |
| rail_test | `prod_V0J8QH5IDctccf` |

| Env var | Price id |
|---|---|
| `STRIPE_PRICE_MAKER_MONTHLY` | `price_1U0IVk2BOl8QlN28GXh1RS6I` |
| `STRIPE_PRICE_MAKER_ANNUAL` | `price_1U0IVl2BOl8QlN28RE8QZCgQ` |
| `STRIPE_PRICE_STUDIO_MONTHLY` | `price_1U0IVl2BOl8QlN28tQfhd5LZ` |
| `STRIPE_PRICE_STUDIO_ANNUAL` | `price_1U0IVl2BOl8QlN287hmSj15V` |
| `STRIPE_PRICE_CONSULTANT_MONTHLY` | `price_1U0IVl2BOl8QlN28lYBWHERx` |
| `STRIPE_PRICE_CONSULTANT_ANNUAL` | `price_1U0IVm2BOl8QlN28Lz9HveGA` |
| `STRIPE_PRICE_RAIL_TEST_MONTHLY` | `price_1U0IVm2BOl8QlN285So4wkId` |
| `STRIPE_PORTAL_CONFIGURATION_ID` | `bpc_1U0IYV2BOl8QlN28a74P56Ne` |

Every price: GBP, `tax_behavior: exclusive`, `recurring.usage_type: licensed`, quantity 1,
`metadata.brand=batchlabel`, `metadata.plan=<slug>`, `metadata.billing_interval=<monthly|annual>`,
and a `lookup_key` from the contract. Every product: the same SaaS tax code
(`txcd_10103001`), `statement_descriptor=BATCHLABEL`, and identity metadata only — no
allowance number is stored on any Stripe object, in any field, including the descriptions.

`free` has no Stripe object of any kind, deliberately: free is the absence of a subscription.
A £0 price would trip the "already subscribed" guard at checkout and show a phantom
subscription in the portal to somebody who has never paid.

### The rail test, and what keeps it unsellable

Four things, and none of them is a flag in a dashboard-editable field:

1. its product has **no `default_price`**, so the dashboard's one-click sell affordances
   (Payment Links, the Share button) have nothing to key off;
2. it is **absent from the portal configuration**, so no customer can switch to it or from it;
3. its price nickname says *do not sell* to anyone who opens it in the dashboard;
4. the real gate is code — `publiclyListed: false` on the contract entry is what the pricing
   page and the structured data filter on, and `rail_test` is not an entitling plan.

`stripe-verify.ts` asserts all four, including that no active Payment Link anywhere on the
account sells any Batchlabel price.

---

## The commands

Copy-paste from the www repo root. `vercel env add` refuses to overwrite, so each is removed
first. **`printf`, never `echo`** — `echo` appends a newline, and Stripe then reports the
price id as not found, which reads exactly like the price does not exist.

```bash
cd ~/Documents/Orchestrate/batch-label

# TEST mode ids -> preview + development ONLY. Production must never carry a test id, and
# preview must never carry a live one: a preview deployment that can take real money is a
# preview deployment that eventually does.
VALUES=(
  "STRIPE_PRICE_MAKER_MONTHLY=price_1U0IVk2BOl8QlN28GXh1RS6I"
  "STRIPE_PRICE_MAKER_ANNUAL=price_1U0IVl2BOl8QlN28RE8QZCgQ"
  "STRIPE_PRICE_STUDIO_MONTHLY=price_1U0IVl2BOl8QlN28tQfhd5LZ"
  "STRIPE_PRICE_STUDIO_ANNUAL=price_1U0IVl2BOl8QlN287hmSj15V"
  "STRIPE_PRICE_CONSULTANT_MONTHLY=price_1U0IVl2BOl8QlN28lYBWHERx"
  "STRIPE_PRICE_CONSULTANT_ANNUAL=price_1U0IVm2BOl8QlN28Lz9HveGA"
  "STRIPE_PRICE_RAIL_TEST_MONTHLY=price_1U0IVm2BOl8QlN285So4wkId"
  "STRIPE_PORTAL_CONFIGURATION_ID=bpc_1U0IYV2BOl8QlN28a74P56Ne"
)
for PAIR in "${VALUES[@]}"; do
  NAME="${PAIR%%=*}"; VALUE="${PAIR#*=}"
  for ENV in preview development; do
    vercel env rm "$NAME" "$ENV" --yes 2>/dev/null || true
    printf '%s' "$VALUE" | vercel env add "$NAME" "$ENV"
  done
done

# Vite inlines at build time and the functions read process.env at runtime, so redeploy.
vercel deploy

# Check: names and environments only, no values.
vercel env ls
```

`ALLOW_RAIL_TEST_CHECKOUT=true` belongs in the same block, but only once the checkout code
that reads it exists. Setting a flag no code reads is how a flag ends up trusted for something
it never did.

Only `STRIPE_PRICE_MAKER_MONTHLY` and `STRIPE_PRICE_MAKER_ANNUAL` are read by www today
(`src/server/config.ts`). The other five ids and the portal id are inert until the plan
contract and the portal-session change land — but setting them now is correct and safe, and a
price id absent from the environment is not a loud failure: it drops out of the map
`belongsToThisBrand` falls back to, so a subscription on it is silently ignored and the
customer pays for nothing.

---

## Re-running any of this

```bash
export STRIPE_SECRET_KEY=sk_test_...          # the value the Stripe CLI already holds

npx vite-node scripts/stripe-sync.ts --dry-run   # print the plan, write nothing
npx vite-node scripts/stripe-sync.ts             # products and prices
npx vite-node scripts/stripe-portal-config.ts    # the portal configuration
npx vite-node scripts/stripe-verify.ts           # every field of every object; exit 1 on any failure
```

All three are idempotent and refuse to touch live mode unless `--live` is passed with a live
key. `stripe-verify.ts` is the one to put in CI, in both modes.

> **They will not run until `src/server/plan-contract.ts` exists.** That file belongs to the
> www-server workstream and is not on this branch, so the import fails until the two are
> merged. That is the intended failure: the only way to make the scripts runnable in
> isolation is to keep a second copy of the amounts here, which is the drift the contract
> exists to prevent — and it would be found by a customer, not by a build. The objects listed
> above were created by exactly this code against exactly that file.

---

## Open, and needing a decision rather than a re-run

1. **The Batchlabel portal configuration is now the test-mode account default.** Stripe makes
   the first configuration on an account its default and there is no API to undo it —
   `is_default` is read-only. Until a neutral default is set in the Dashboard
   (Billing → Customer portal), the other Orchestrate brands' test-mode portal sessions
   inherit Batchlabel's headline, terms link and plan picker.

   **Live mode has no portal configuration either — checked.** So running
   `stripe-portal-config.ts --live` will do the same thing there, to the real customers of
   Starter and Scale. Set a neutral default in the live Dashboard **first**, then run it.

2. **£0.01 is below Stripe's £0.30 GBP minimum.** The rail-test price was created at a penny
   as decided, but a 1p invoice cannot be collected from a card, so the subscription never
   reaches `active` and the exercise proves the failure path rather than the happy one. With
   exclusive tax, 20% VAT on 1p also rounds to 0p, so it would not exercise a VAT line either
   — and the VAT line is the newest, least-proven part of the change. Raising only
   `unit_amount` to 30 fixes both and moves nothing else: same slug, same lookup key, same
   non-entitling resolution, same never-listed rule. **This has to be closed before the live
   rail test is worth running.**

3. **`txcd_10103001` (Software as a service — business use) is pinned across all four
   products.** Chosen because the decided pricing states the buyer is a business. Which code is
   correct is an accountant's question; what matters technically is that it is set explicitly
   and identically, because `null` falls back to the *account's* default tax code on an account
   shared with the other Orchestrate brands.

4. **Stripe Tax registrations are an account setting and were not touched.** `automatic_tax`
   at checkout cannot add VAT for a country the account is not registered in.

5. **Live mode is untouched, and its catalogue does not exist yet.** Run the same three scripts
   with `--live` and a live key when the rail is ready, then re-run the env block against
   `production` with the live ids.
