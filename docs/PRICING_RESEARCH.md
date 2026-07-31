# Plan structure and value metric — research

Research only. Nothing here is a decision, and no product code was changed to produce it.

Two repositories were read at `main`:

- **www** — `batch-label` (this repo): marketing, accounts, Stripe, the Supabase schema.
- **app** — `Batch-Label-Product-Application`: the product at `app.batchlabel.xyz`.

The founder has decided the shape: **products/SKUs is the primary metering metric, seats are
secondary, and both must be purchasable as add-ons on every plan** rather than only by moving
up a tier. Metering on labels or exports printed is ruled out. This document is written to
that decision — it establishes what a SKU actually is, what can be enforced today, and what
the add-on model costs to build.

---

## 0. The six things that matter most

1. **The billing-unit question (SKU vs formulation) is real, and the code answers it
   lopsidedly: essentially all the work is per formulation.** But the disagreement matters
   less than it looks, because the *unit* and the *allowance* are separable — metering SKUs
   at a 3× allowance is economically identical to metering formulations. Recommendation and
   full trace in **§1**. There is one thing in that section that is not a pricing matter at
   all but a correctness bug in waiting: **the UFI must be one per composition, shared across
   pack sizes.**

2. **Usage counts live nowhere, so no limit is enforceable today.** There is no products
   table. The app holds products in a module-level array that resets on page reload, and
   `createProduct` has no entitlement check at all. The only server-side fact is the boolean
   `active`. **§3.**

3. **Add-ons break the Stripe Customer Portal, which was the main reason to build them.**
   Stripe: *"If a subscription uses any of the following, the customer can cancel it in the
   portal, but can't update it: Multiple products."* A base price plus add-on items is a
   multi-product subscription. Self-serve quantity changes will need a custom billing UI on
   www. **§4.3.**

4. **Seats have nothing to be a member of, and the cofounder's current work will decide
   whether they are ever possible.** `brand_memberships` is one row per (user, brand). There
   is no organisation. If the per-user data isolation now being built keys product tables on
   `user_id`, seats are dead on arrival and undoing it is a data migration, not a refactor.
   This is the largest hidden cost in the plan. **§5.**

5. **Almost every plan promise on www is currently false in the app.** "Your first label
   free" is the important one: www promises it in six places; the app disables both export
   buttons for any user who is not `active`, and there is no watermark or PNG path in the app
   at all. **§7.**

6. **The market validates SKU metering and prices the competitive floor at zero.** CraftCert —
   the only shipped UK maker-facing CLP SaaS — meters products/SKUs at 3 / 25 / unlimited for
   £0 / £9 / £15. But the real floor is Candle Shack, Craftiful and Nikura, who give CLP labels
   and SDSs away **free with fragrance oil purchases**. Batchlabel's wedge is exactly what
   those tools refuse: mixed suppliers, custom blends, non-standard loads. **§8.**

---

## 1. The definitional finding: what a "product" is

### 1.1 The entities, in the maker's own terms

The spine is declared at `Batch-Label-Product-Application/src/lib/model.ts:1-4` as
`material → specification → artefact → record`, governed by regimes.

| Entity | Type | What a maker would call it | Created how |
| --- | --- | --- | --- |
| **Material** | `Material` (`model.ts:140`) | "the fragrance oil / the wax / the jar I buy" | Seeded catalogue; not user-creatable today |
| **Specification** | `Spec` (`model.ts:184`) | "the recipe" | Edited inside a product; never exists alone |
| **Product** | `Product` (`model.ts:202`) | "the thing I sell, with a SKU" | **The only thing a user creates** |
| **Artefact** | `ArtefactInstance` (`model.ts:188`) | "the label" (and the SDS) | Derived; auto-generated from the product's category |
| **Record** | `ProductionRecord` (`model.ts:227`) | "the batch I made on Tuesday" | Logged against a product |

Two structural facts do the work:

- **A `Product` has exactly one `spec`** (`model.ts:209`). It is a field, not a collection.
  There is no way to express "one recipe, three pack sizes".
- **Pack size and packaging live *inside* the spec.** `MixtureSpec` carries `netQuantity`,
  `netUnit` and `packagingId` (`model.ts:153-155`). Changing the pack size mutates the recipe
  object.

So: **product = specification, 1:1**, and a `Product` is uniquely
`recipe × pack size × packaging × SKU`.

The seed data confirms the intent — SKUs encode the format and the size:
`RD-SMV-100` (reed diffuser, 100 ml), `RS-BSS-100` (room spray, 100 ml), `CC-BFC-220`
(container candle, 220 g) at `products.ts:189, 239, 135`.

### 1.2 Where the per-unit work genuinely lives — the full trace

The founder is commercially right that three pack sizes are three SKUs. The question is
whether a SKU is the right thing to *bill* for. I traced every reference to pack size
(`netQuantity`, `netUnit`, `packagingId`, `capacityMl`, `labelAreaMm`) across `derive.ts`,
`sds.ts`, `regimes.ts` and the artefact renderers. The result is lopsided.

**Per formulation — identical across every pack size:**

| Computation | Where | Inputs it actually reads |
| --- | --- | --- |
| **The whole CLP classification** — hazard map, H-statements, pictograms, signal word, proximity-to-threshold notes | `derive.ts:105-118` (`deriveMixture`) | `fragranceId`, `baseId`, `dyeId`, `load`. **Four fields. Neither `netQuantity` nor `packagingId` is read.** |
| **Allergen resolution** | same derivation | same |
| **The 16-section safety data sheet** (REACH Annex II) | `sds.ts:252` (`buildSds`) | The product + the derivation. **One pack-size touch in the entire file:** `sds.ts:181`, `netUnit === 'g'` → "Solid" vs "Liquid" |
| **Which regimes apply** | `regimes.ts:375` (`regimesFor`) | `product.regimes` |
| **Which obligations apply** | `regimes.ts:403` (`obligationsFor`) | regimes + markets |
| **Which blocks the label must carry** | `regimes.ts:380` (`blocksFor`) | regimes + artefact type |

`regimes.ts` contains **zero** references to `netQuantity`, `netUnit`, `packagingId` or
`capacityMl`. Not one.

The single SDS reference deserves a note, because it looks like a pack-size dependency and is
not one. `netUnit` is `'g'` or `'ml'` — solid or liquid — and it is fixed by *product type*,
not by size: `blankSpec` (`products.ts:568`) sets `'g'` for a container candle or wax melt and
`'ml'` for a diffuser or room spray. A 220 g candle and a 380 g candle are both `'g'`. **The
safety data sheet is byte-identical across pack sizes of the same formulation.**

**Per pack size — genuinely different:**

| Thing | Where | What differs |
| --- | --- | --- |
| CLP minimum label/pictogram dimensions | `derive.ts:613` (`clpMinimumDimensions`), used by `geometryRules` at `:640-660` | The Annex I Table 1.3 band, selected by `capacityMl` |
| Printable-area check | `derive.ts:673-676` | `packaging.labelAreaMm` — a 30 ml dropper has less room than a 250 ml tumbler |
| The printed net-quantity string | `ArtefactRenderer.tsx:184, 254, 437` | `"220 g ℮"` vs `"380 g ℮"` |
| The printed packaging format on the listing | `ArtefactRenderer.tsx:429, 438` | `"Tumbler"` vs `"Clamshell"` |
| The SKU code | `Product.sku` | — |

**And the first of those five mostly collapses.** `clpMinimumDimensions` returns the same band
— 52 × 74 mm label, 10 mm pictogram — for everything at or under **3 litres**
(`derive.ts:619-620`). Every candle, wax melt, reed diffuser and room spray this product will
ever see is under 3 litres. So for the entire target market, the CLP geometry minimum is
identical across pack sizes too. What actually varies is the printable area on the pack, which
is a property of the container, not of the classification.

`specSummary` (`derive.ts:705`) is the tell: it renders a mixture as
`"${productType}, load ${load} percent"` and never mentions pack size, because pack size is
not what distinguishes one derivation from another.

**So, to the coordinator's question 1, plainly: a new pack size causes no re-derivation at
all.** It changes a number and a format word on the artwork, and re-runs a dimensions check
against a different container. Everything expensive — read the SDS, classify, derive H and P
statements, resolve allergens — is per formulation and is shared.

#### The UFI is per composition, and this is a correctness issue, not a pricing one

Under CLP Annex VIII the UFI is tied to the **mixture composition**, not to the package. The
same UFI covers all packaging variants and even different trade names, provided the
composition is identical; a composition change is what triggers a new UFI. A composition
*may* legally carry several UFIs, but multiple compositions may never share one.

ECHA's own pages (`poisoncentres.echa.europa.eu/generate-and-apply-the-ufi` and
`/changes-in-composition-and-the-effect-on-the-ufi`) return 403 to automated fetches, so this
is corroborated from several independent secondary sources rather than quoted from the primary
— [Chemius](https://www.chemius.net/ufi/can-we-have-one-ufi-code-for-two-products/),
[Bens Consulting](https://www.bens-consulting.com/en/blog/376/can-we-have-one-ufi-code-for-two-products),
[MSDS-Europe](https://www.msds-europe.com/ufi-unique-formula-identifier/),
[opesus](https://www.opesus.com/en/blog/strategies-for-implementing-ufis) (all accessed 31
July 2026). Worth a five-minute confirmation against the ECHA page in a browser before it is
relied on, but the sources are unanimous.

**Why this matters regardless of the pricing decision:** the app hangs `identifiers.ufi` off
`Product` (`model.ts:212`), and a Product is a pack size. If UFI generation is ever
implemented per Product, a maker with one fragrance in three sizes gets **three UFIs for one
composition** — which is legal but pointless, and pushes them toward three poison centre
notifications where one is correct. That is the tool manufacturing regulatory busywork for the
customer. **The UFI must be generated once per composition and shared across its pack sizes,
whichever unit is billed.** It is also, incidentally, the sharpest illustration that the
domain's own natural unit is the formulation.

### 1.2b Which unit is cheaper to run? (Neither — and that is the honest answer)

Asked to state the cost case for SKU metering fairly, I have to report that there is barely
one, in either direction:

- **Generation cost is negligible and it is per formulation.** `deriveMixture` is a loop over
  a handful of components and their hazards — microseconds. `buildSds` is string assembly.
  Both run **in the browser**; nothing server-side computes them.
- **Rendering is free.** Artefacts are client-side SVG (`ArtefactRenderer.tsx`,
  `Symbols.tsx`). There is no server render path today and no PDF pipeline — both export
  buttons are `toast()` stubs (§7, claim 19).
- **Storage is per artefact, and artefacts are tiny.** `ArtefactInstance` (`model.ts:188`) is
  seven scalar fields. Three per home-fragrance product. Version history would add rows, not
  gigabytes.
- **If a server-side PDF pipeline is ever built, its cost is per *export*, not per SKU** — and
  exports are unmetered by decision, so that cost is uncorrelated with any billing unit.
- **The one genuinely non-trivial cost in the system is ingesting a supplier document**, and
  that is per **material** — shared across every formulation that uses it, and promised
  unmetered forever (`Settings.tsx:441`).

**Conclusion: marginal cost per SKU is effectively zero, and so is marginal cost per
formulation.** This is a value-based pricing decision, not a cost-recovery one. Anyone arguing
for SKUs on cost grounds is arguing from a cost that does not exist. I would rather say that
than manufacture a case.

### 1.3 www and the app do not agree, and www is the one making the promise

www's copy consistently treats pack size as a **field you change inside a saved recipe**, not
as a thing that creates a new entity:

| Where | Copy |
| --- | --- |
| `src/content/faqs.ts:41` | "Open the **saved recipe**, change the fragrance percentage **or the pack size**, and download a new label." |
| `src/pages/dashboard/Labels.tsx:58` | "Saved recipes — Reuse a fragrance **and pack size** instead of starting again." |
| `src/pages/legal/Privacy.tsx:37` | "…**recipes, pack sizes**, batch codes and the labels you generate" — listed as separate data, not as one entity |
| `src/pages/Pricing.tsx:39` | "Saved recipes you can edit and reuse" |

The FAQ sentence is the sharpest. It tells a maker that changing pack size is an *edit to an
existing recipe* followed by a download. Under the app's model it is the creation of a new
Product — which, under the founder's chosen metric, is a **billable event**. A maker who
reads that FAQ, buys a plan with 10 SKUs, and then discovers that their 4 fragrances in 3
sizes consumed 12 of them, has been mis-sold. Not by much, and not deliberately, but the
sentence is on the pricing-adjacent FAQ and it is wrong under the new model.

### 1.3b Does the model already distinguish a spec from its size variants? No.

`Product.spec` is a single field, not a collection (`model.ts:209`). There is no `variants`
array, no `formulationId`, no parent pointer — nothing anywhere in `model.ts` groups two
Products that share a composition. Two pack sizes of one fragrance are **two unrelated
`Product` objects** that happen to hold structurally similar `MixtureSpec`s.

To meter formulations, that distinction has to be **built**. The shape is small:

- a `Specification` (or `Formulation`) entity owning `fragranceId`, `baseId`, `dyeId`, `load`,
  `productType` — the four classification inputs plus the type;
- `Product` keeps `sku`, `name`, `netQuantity`, `netUnit`, `packagingId` and its `artefacts`,
  and gains `specificationId`;
- `derive()` takes the specification; `buildSds()` takes the specification; `geometryRules()`
  keeps taking the product.

In the stubbed app that is perhaps **two to four days**: the split is almost exactly along the
line the code already draws, since `deriveMixture` reads only the four fields that would move
and `geometryRules` reads only the ones that would stay. The UI would need a "new pack size"
path and the Products table would want grouping.

**And it collides squarely with the cofounder's per-user data isolation work.** If that work
creates a single `products` table with the spec fields inline — the obvious thing to do, since
that is what `model.ts` describes — then splitting it later means creating a table, backfilling
by deduplicating live rows on four columns, rewriting every query and every RLS policy, and
doing it to customer data. That is a migration project, not a refactor. Same shape as the
`account_id` problem in §5.3, and on the same clock.

**Cheap hedge, worth taking whatever the pricing decision is:** ask for
`specifications` and `products` as **two tables from the start**, even if the UI never shows
the distinction and every specification has exactly one product for the first year. It costs a
join. It preserves the option to change the billing unit for as long as you like, and it also
happens to be where the UFI belongs (§1.2).

### 1.3c Gaming risk if variants are free — and the guard

Real, and worth taking seriously: nothing in `MixtureSpec` constrains a "variant" to be the
same mixture. A maker could file twelve entirely different fragrances as "pack sizes" of one
formulation and pay for one.

**The guard is unusually clean here, because the code hands it to you.** Define a variant as
sharing **identical values of `fragranceId`, `baseId`, `dyeId` and `load`** — which is exactly,
and only, the set of fields `deriveMixture` reads (`derive.ts:105-118`). That is not a
heuristic:

- if those four match, the derivation is *provably* identical, so the classification, the
  H/P statements, the allergens and the SDS are identical;
- it is therefore the same mixture in the CLP sense, so the shared UFI is legitimate;
- change any of them and it is a different composition, a different UFI, a new formulation.

It is also explicable in one sentence to a maker: **"A variant is the same recipe in a
different pack. Change the recipe and it's a new formulation."** Enforcement is a uniqueness
check on four columns, not a judgement call.

Add a **variant cap** (5–8) as belt and braces against the pathological case — a maker with
one fragrance in forty sizes — and because an unbounded free dimension is an invitation
regardless of how tight the definition is.

### 1.3d The recommendation

**Keep SKU as the billing unit — but set the allowance with the pack multiplier already
priced in, and fix the UFI.**

The reasoning, and the part that I think has been missing from the discussion: **the unit and
the allowance are separable.** A ladder of 3 / 30 / 100 *SKUs* is economically identical, for a
maker running three sizes per scent, to 1 / 10 / 33 *formulations*. Same customers, same
revenue, same perceived generosity — the only difference is which number you print. So the
disagreement is smaller than it looks, and it can be resolved by choosing the allowance rather
than by rebuilding the model.

Given that, SKU wins on the tiebreakers:

1. **It is already the model.** Zero build cost, and no collision with the cofounder's work at
   exactly the moment that work is landing.
2. **It captures growth that formulation metering leaks.** A maker who goes from 12 scents × 1
   size to 12 scents × 3 sizes has roughly tripled their range and their revenue. Under
   formulation metering they pay the same. That is a genuine and permanent leak, and the
   variant cap only bounds it, it does not price it.
3. **It is the market norm in the immediate neighbourhood.** CraftCert — the one shipped UK
   maker-facing CLP SaaS with public pricing — meters products/SKUs at 3 / 25 / unlimited.
   Cosmetica meters SKUs. Eldris meters "active SKU count" bands. Cosmetri meters products.
   Buyers will not need it explained (§8).
4. **It cannot be gamed**, so it needs no variant definition and no cap.

With four conditions attached, all of which matter:

- **Call it a SKU. Never "product", never "recipe".** "Products" is the word that causes the
  mis-count: a maker with 12 scents in 3 sizes hears "10 products" and thinks they are covered.
  Define it once on the pricing page — *"A SKU is one thing you sell: one fragrance in one pack
  size."* This is also the fix for the mis-selling risk in §1.3.
- **Design the ladder against ~3 SKUs per formulation.** A "10 products" tier is three scents
  and will feel mean to a maker who counts in scents. The same tier at 30 SKUs is ten scents at
  identical revenue. **This single choice does almost all the work the formulation metric was
  proposed to do.**
- **One UFI per composition, shared across pack sizes** (§1.2). Non-negotiable, and independent
  of pricing.
- **Ship a "add another pack size" action** that clones a Product, keeps the derivation and the
  UFI, and asks only for net quantity, packaging and SKU code. This turns the 3× multiplier
  from a tax into thirty seconds of work, and it makes the SKU count legible to the maker
  instead of surprising.

Plus one measurement: **instrument SKUs-per-formulation from the first customer.** The whole
argument rests on an assumed ratio of ~3 that nobody has verified — I could not find data on
typical pack-size counts for UK candle makers, and the research agent could not either (§8).
If the real ratio is 1.3, this debate is moot. If it is 5, revisit.

### 1.3e The strongest case for the option I am not recommending

Stated as forcefully as I can, because it is a good case and the code supports it:

**Every expensive thing Batchlabel does is per formulation, and the code says so without
ambiguity.** Not "mostly" — the classification reads four fields, none of them pack size; the
16-section SDS is byte-identical across pack sizes; `regimes.ts` does not reference pack size
at all. A pack size causes literally no re-derivation. **Charging three times for one
derivation is charging for work that does not happen.**

The regulator agrees with the formulation, not the SKU: the UFI — one of the headline paid
features on the pricing page — is defined per composition. Under SKU metering you are billing
three times for a code that legally exists once. That is not merely inelegant; if the app
issues one UFI per Product it actively degrades the customer's compliance position by
splitting one poison centre notification into three.

And the meter ticks on the wrong event. Adding a 100 ml version of an existing diffuser is
repackaging: no new SDS to read, no new hazards, no new risk, no new work for Batchlabel — a
pure upsell of a product the maker has already got right. Charging for it means the price goes
up at the moment the customer does something *easy*, which is precisely when a limit feels
punitive rather than fair. Adding a new fragrance is growth, involves real work on both sides,
and is the moment a maker would happily pay more. A meter should tick on the second and not the
first.

There is precedent (CM Studio+ meters formulations, 50 → unlimited), the window to build it is
open right now and closes when the cofounder's tables land, and the free tier it produces —
*"one formulation, all your pack sizes, printed as often as you like"* — is dramatically more
compelling than *"one SKU"*.

**If the founder finds the "billing for work that does not happen" argument decisive, that is a
defensible read of the same evidence and I would not argue hard against it.** The deciding
question is whether you would rather leak the revenue from a maker who triples their range
without adding a scent (formulation metering), or explain to a maker why their fourth pack
size costs money (SKU metering). I judge the second easier to explain than the first is to
recover — but it is a judgement, not a finding, and the two-table hedge in §1.3b keeps the door
open either way.

### 1.4 Where the other entities sit

- **Materials** (`catalog.ts:13-677`) are a seeded read-only catalogue: 3 classes,
  `MATERIALS = [...INGREDIENTS, ...PACKAGING, ...COMPONENTS]`. There is no `createMaterial`
  anywhere. Reading supplier documents is explicitly framed as never metered
  (`Settings.tsx:441`), which is right — it is the on-ramp, and it is where the maker gets
  their first "oh, it read my SDS" moment.
- **Artefacts are derived and cannot be created by hand.** `createProduct`
  (`products.ts:607`) generates them from the category pack: `category.artefacts.map(...)`
  (`products.ts:620`), plus `withSafetyDataSheet` (`products.ts:501`) which appends an SDS to
  anything that is not a bill of materials. Home fragrance therefore yields exactly 3
  artefacts per product (unit label, online listing, SDS). `products.ts:531` states the rule
  outright: *"A product is the one thing a user creates; outputs are always derived and can
  never be made by hand."*
  **Consequence: artefacts are a derived multiple of products, so metering on them is metering
  on products with a confusing multiplier.** Not a candidate.
- **Records** (`RECORDS`, `products.ts:676`) are batch/production-run logs. Seeded, and
  "Log a run" is a toast stub (`Records.tsx:59`). Records are the repeated action — the thing
  a maker does weekly — and they are the traceability evidence a regulator asks for. Metering
  them would be metering compliance record-keeping, which is the one thing you never want a
  customer to ration. **Not a candidate, for the same reason label reprints are not.**

---

## 2. Every entitlement checkpoint that exists today

Exhaustive. There are **two** functional gates in the entire product, both on the same
boolean, both on the same screen.

### 2.1 The read path

| Location | What it does |
| --- | --- |
| `app/src/App.tsx:27` | `EntitlementProvider` wraps the app |
| `app/src/lib/entitlement.tsx:31-70` | Reads the membership once, shares it via context, exposes `refresh()` |
| `app/src/lib/membership.ts:174-187` | `fetchMembership()` — queries `brand_memberships` **directly** for `brand_slug,status,business_name,plan,plan_status` |
| `app/src/lib/membership.ts:117-160` | `mapEntitlement()` — a **local re-implementation** of the "is active" rule |

### 2.2 The gates

| # | Location | Gates | What the user sees |
| --- | --- | --- | --- |
| 1 | `app/src/pages/ArtefactDesigner.tsx:54-55` | `const canExport = entitlement.active` | — |
| 2 | `app/src/pages/ArtefactDesigner.tsx:127` | **"Export sheet"** button `disabled={!canExport}` | Greyed button, `aria-describedby` pointing at the notice |
| 3 | `app/src/pages/ArtefactDesigner.tsx:142` | **"Export PDF"** button `disabled={!canExport}` | Same |
| 4 | `app/src/pages/ArtefactDesigner.tsx:166-170` | Renders `<PlanNotice feature="Exporting a finished artefact" />` | A callout, on screen the whole time — not a surprise at the end |
| 5 | `app/src/components/PlanNotice.tsx:33-99` | Chooses copy per `EntitlementStatus` | Seven distinct messages (see below) |
| 6 | `app/src/pages/Settings.tsx:408` | Same notice on the billing tab | Callout |
| 7 | `app/src/pages/Settings.tsx:364-366, 411-445` | **Display only** — usage meter | "3 of 10 products on Studio" + progress bar |
| 8 | `www/src/pages/dashboard/Account.tsx:28,38` → `www/src/lib/entitlements.ts:90` | `summarisePlan()` decides whether to offer checkout or the portal | Plan badge, upgrade button hidden when active |

`app/src/components/AppShell.tsx:159,166` reads the entitlement too, but only for
`businessName`. Not a gate.

The free-plan copy at `PlanNotice.tsx:38-46` is worth quoting because it is the current
statement of the pricing philosophy, and it is a good one:

> "Everything else stays open on the free plan — build products, read supplier documents and
> check what the regulations require. Producing the finished artefact is the paid part."

Note what is **not** gated anywhere: creating a product (`Products.tsx:31`,
`NewProductDialog.tsx:120` — no entitlement import in either file), "Generate outputs"
(`Specification.tsx:75-85`), "Version output" (`Specification.tsx:157-169`), "Log a run"
(`Records.tsx:59`), or inviting a team member (`Settings.tsx:297`). All are ungated toasts.

### 2.3 The app's copy of the rule has already drifted from the database's

`docs/ENTITLEMENTS.md:120-123` says *"Use `active`. Do not reimplement it"*, and
`ENTITLEMENTS.md:247` says *"Do not read `brand_memberships` directly for billing."* The app
does both. Three concrete disagreements, all of which mean **the app is more generous than
the database**:

| Case | `public.entitlement_is_active` (migration `20260801120000:213-216`) | `mapEntitlement` (app `membership.ts`) |
| --- | --- | --- |
| `plan_status = 'unpaid'` | **not** entitled — not in the entitling list | **entitled** — `GRACE_STATUSES` includes `'unpaid'` (`:78`) |
| `plan_status` empty/null with a paid plan | **not** entitled | **entitled** (`:152`) |
| `current_period_end` in the past | **not** entitled after a 1-day grace | **entitled** — the app never reads the column (`COLUMNS`, `:163`) |

Today the blast radius is one export button. **Under a limits model it is every limit**, since
the app would re-derive allowances locally the same way. Worth fixing as part of the same
change: point the app at the `entitlements` view, delete `mapEntitlement`'s rule, and let the
row carry the numbers (§4.4).

---

## 3. What the schema can enforce, and what it cannot

### 3.1 What exists

`brand_memberships` (`supabase/migrations/20260729120000_init_orchestrate_identity.sql:80-113`),
extended by `20260801120000_entitlements.sql:62-69`:

`id, user_id, brand_slug, role, status, business_name, plan, plan_status, stripe_customer_id,
stripe_subscription_id, stripe_price_id, current_period_end, cancel_at_period_end, trial_end,
stripe_event_id, stripe_event_at, stripe_status_at, signup_source, attribution, data (jsonb),
created_at, updated_at` — `unique (user_id, brand_slug)`.

RLS: `select` on your own row only; **no** user `insert`/`update` at all. Every write is the
Stripe webhook under the service role, through `apply_stripe_entitlement`
(`20260801120000:263`), which is exactly-once (event-id primary key), monotonic on
`event.created`, and partial (a null argument means leave the column alone). This is a
genuinely well-built write path and the add-on work should extend it, not route around it.

Read surface: the `entitlements` view (`:518-534`, `security_invoker`) and
`get_entitlement()` (`:550`). Neither exposes a quantity of anything.

### 3.2 What can be enforced server-side today

**Exactly one thing: whether a user is entitled at all.** `entitlement_is_active` returns a
boolean. Nothing else in the schema is a quantity.

Everything a plan might promise about *how much* is currently unenforceable, because:

- **There is no products table.** None of `products`, `specifications`, `artefacts` or
  `records` exists in `supabase/migrations/**`.
- **The app's data is in-memory.** `let runtime: Product[] = PRODUCTS`
  (`app/src/lib/products.ts:532`), mutated by `createProduct` (`:607-636`) and read through
  `useSyncExternalStore` (`workspace.tsx:6`). It resets on page reload.
- **`createProduct` never touches Supabase.** The app's only Supabase call in the whole
  product surface is the membership read (`membership.ts:181`).
- The app's own `PLANS` constant (`products.ts:974-995`: Maker £24/3, Studio £58/10,
  House £140/40) is stub UI. It is never enforced; `Settings.tsx:364` uses it only to render a
  progress bar, and it matches nothing being sold.

So a "10 SKUs" limit today would be **advisory decoration**. Worse than nothing, because
`Settings.tsx:441-443` already tells the user in plain English what happens at the limit:

> "At the limit you can keep working on existing products but cannot create a new one until
> you move up a plan."

That sentence is a promise the software cannot keep in either direction.

### 3.3 What each candidate limit needs to become enforceable

| Limit | Needs | Schema vs application |
| --- | --- | --- |
| **Feature on/off** (export, no watermark) | Nothing. Works today via `active`. | Done |
| **SKU count** | (1) a `products` table with an ownership key and RLS; (2) `sku_limit` on the entitlement row; (3) a `BEFORE INSERT` trigger that counts and raises | ~70% schema, 30% app |
| **Seat count** | An organisation concept that does not exist — see §5 | ~60% schema, 40% app (plus a whole invite flow) |
| **Record / batch count** | Same as SKUs, plus a rolling window. Not recommended (§1.4) | — |

**A client-side check is not enforcement.** The browser holds an anon key against PostgREST;
anyone can `insert` directly. The honest enforcement point is a `BEFORE INSERT` trigger on
`products` that counts existing rows for the account and raises when the count would exceed
`sku_limit`. The client check is UX (a disabled button and a good message); the trigger is the
rule. A `WITH CHECK` policy containing a count subquery would also work but gives a
generic RLS violation instead of a message you can put in front of a maker.

One ordering hazard worth naming: a count-and-insert trigger is racy under concurrency
without a lock on the account row. At the volumes involved (a maker adding a product by hand)
this is theoretical, but `select ... for update` on the account row inside the trigger costs
nothing and the existing `apply_stripe_entitlement` already uses that pattern
(`20260801120000:331`).

### 3.4 Are seats possible at all right now?

**No.** `brand_memberships.role` exists — `text not null default 'member'` with the comment
`-- member | admin | owner` (`20260729120000:85`) — and **nothing reads it**. Not the view
(`:518-534`), not `get_entitlement`, not the webhook, not either front end. It is a column
someone had the foresight to add and no code has ever used.

More fundamentally, `role` cannot carry seats even if something did read it, because
`brand_memberships` is one row per **(user, brand)**. There is no entity for a second user to
be a member *of*. Two users of the same business are two unrelated rows with two separate
`plan` values and two separate Stripe customers.

www's Maker copy — *"Up to five people on the account"* (`src/pages/Pricing.tsx:41`), *"The
Maker plan covers teams of up to five people"* (`src/content/faqs.ts:194`), and the same claim
in `public/llms.txt:47` — is **currently fiction**. Not "unenforced": there is no mechanism by
which a second person could join an account at all. The app's Settings team tab
(`Settings.tsx:292-319`) renders three hard-coded `TEAM` members (`products.ts:1064`) and the
Invite button is `onClick={() => toast('Invitation sent')}` (`Settings.tsx:297`).

---

## 4. Add-ons: what has to change

### 4.1 The single-price assumption, precisely

Today one subscription maps to one plan via one price. Every one of these is a first-item or
single-value assumption:

| Location | Assumption | Breaks how |
| --- | --- | --- |
| `src/server/entitlements.ts:132-135` | `subscriptionPriceId` returns `sub.items?.data?.[0]?.price?.id` | **First item only.** Stripe does not guarantee item order. With base + add-ons this may return the SKU add-on's price id. |
| `src/server/entitlements.ts:138-141` | `subscriptionInterval` — same first-item read | Same. Also means base and add-on prices must share an interval, which should be asserted rather than assumed. |
| `src/server/entitlements.ts:89-92` | `planForPrice` falls back to `MAKER_PLAN` for an unrecognised price | An add-on price id reaching here resolves to a base plan. Not a security hole (the subscription is entitling either way) but it means an add-on price can grant a tier. |
| `src/server/stripe-events.ts:114-122` | `belongsToThisBrand(metadata, priceId, …)` falls back to `config.prices[priceId]` using that first item | A hand-made subscription whose first item is an add-on fails the brand check. The metadata path usually saves it; the fallback should scan all items. |
| `src/server/stripe-events.ts:52` | `EntitlementIntent.priceId: string \| null` | One price per event. |
| `20260801120000_entitlements.sql:273, 460` | `p_price_id text` → `stripe_price_id text` | One price per membership. |
| **everywhere** | **`item.quantity` is never read** | This is the entire add-on signal, and it is currently discarded. |

`subscriptionPeriodEnd` (`entitlements.ts:118-126`) is the exception — it already maps over
all items and takes the max, with a comment explaining why. That is the pattern the other
three should follow.

### 4.2 How quantity changes arrive

Good news: **no new event type is needed.** A quantity change on a subscription item emits
`customer.subscription.updated`, which is already handled
(`stripe-events.ts:68-73`), already routed to `fromSubscription` (`:195-198`), and already
covered by the ordering guard on `stripe_status_at` (`20260801120000:419-433`). Adding or
removing an item emits the same event. There is no separate subscription-item webhook to
subscribe to.

One trap already documented in the codebase applies here too: `checkout.session.completed`
carries **no line items** in the webhook payload (noted at `stripe-events.ts:226-228`). So
initial add-on quantities cannot be read from the session event — they must come from the
`customer.subscription.*` event. That is already how plan and status work, so the shape is
familiar, but it does mean a maker who buys extra SKUs at checkout gets them a beat later
than the base plan. The existing "re-read after a couple of seconds" advice in
`docs/ENTITLEMENTS.md:167-171` covers it.

The required change to `fromSubscription` is: instead of one `priceId`, walk
`subscription.items.data[]`, classify each item's price against a typed map, and resolve.

### 4.3 The Customer Portal will not do this — verify before building

This is the finding most likely to change the plan.

Stripe's documentation states (accessed 31 July 2026,
<https://docs.stripe.com/customer-management>):

> "If a subscription uses any of the following, the customer can cancel it in the portal, but
> can't update it: **Multiple products.**"

The portal *does* support customer-driven quantity changes in general — the configuration is
`features.subscription_update` with `default_allowed_updates` accepting `price`,
`quantity` and `promotion_code`, plus a per-product `adjustable_quantity { enabled, minimum,
maximum }` (<https://docs.stripe.com/api/customer_portal/configurations/create>, accessed 31
July 2026). But that is for a subscription with **one** product. A base plan plus a SKU
add-on plus a seat add-on is three products, and the portal degrades to cancel-only.

`api/create-portal-session.ts:69-72` creates a portal session with no configuration override,
so it uses the account's default configuration. Nothing in this repo currently enables
`subscription_update` at all.

**Three ways out, with trade-offs:**

- **(a) Build a custom billing screen on www.** A quantity stepper that calls
  `stripe.subscriptionItems.update`. Full control, works for any number of items, and www
  already has the server plumbing (verified-JWT identity resolution in
  `src/server/supabase-admin.ts`, CORS allow-list in `src/server/cors.ts`). Cost: a new
  authenticated endpoint, proration handling, a preview-the-charge call
  (`stripe.invoices.createPreview`) if you want to show the price before committing, and the
  UI. This is the realistic answer, and it should be costed **as part of the add-on decision**,
  not discovered afterwards.
- **(b) Keep the subscription to one item** by making the plan itself quantity-bearing —
  one price where `quantity` = SKUs, with graduated tiers standing in for named plans. The
  portal then handles quantity natively. **But seats need a second item, which breaks it
  again**, unless seats are sold as a separate subscription. *Unverified:* I could not
  confirm whether the portal permits quantity updates on a `billing_scheme=tiered` licensed
  price — the documented limitation names usage-based (metered) billing, and tiered licensed
  pricing is not that, but I found no explicit statement either way. Worth a 20-minute test in
  a Stripe sandbox before this option is ruled in or out.
- **(c) Two subscriptions** (base+SKUs, and seats), each single-product, each portal-editable.
  Superficially attractive and **structurally hostile to the existing webhook**: the
  subscription-identity guard at `20260801120000:401-413` deliberately allows one
  `stripe_subscription_id` per membership and marks events about any other subscription
  `superseded`. That guard exists because a real incident (an abandoned `incomplete`
  subscription revoking a paying customer's access) is described in the comment above it.
  Making it multi-subscription-aware means reworking the most safety-critical function in the
  schema. Do not do this to save a UI screen.

**Recommendation: (a).** Accept that self-serve add-on quantities means a custom screen on
www, and scope it in. Keep using the portal for card, invoices, VAT and cancel — which is what
it is good at and what `api/create-portal-session.ts` already does well.

### 4.4 Store resolved numbers, not a plan name

**Recommendation: store `sku_limit int` and `seat_limit int` on the entitlement row, resolved
server-side from the subscription items.** Reasons, strongest first:

1. **The app must not interpret a plan name — it already does, and it is already wrong.**
   `app/src/lib/products.ts:974-995` maps plan ids to product limits (3/10/40) that match
   nothing being sold, and `Settings.tsx:364` renders a usage bar from it. A plan-name →
   limit map duplicated in a client bundle is the same class of defect as the duplicated
   `active` rule that `docs/ENTITLEMENTS.md:120` already forbids, and §2.3 shows that
   duplication has *already* drifted.
2. **Add-ons make the plan name insufficient by construction.** "Maker" no longer determines
   the allowance once a maker has bought seven extra SKUs. The only faithful representation
   is a number.
3. **Grandfathering and comped accounts get easy.** Giving an early customer 25 SKUs becomes
   an `update`, not an invented Stripe price. The schema already anticipates exactly this —
   `apply_stripe_entitlement` treats a paid plan with no Stripe status as a granted plan
   (`membership.ts:150-152` mirrors it), so hand-granted state is already a supported concept.
4. **It keeps the read contract stable and makes enforcement checkable in SQL.** The
   `entitlements` view gains two integer columns; the trigger in §3.3 compares a count against
   a column in the same database. No round-trip to Stripe, no plan-name parsing in a trigger.
5. **The resolution rule lands next to the price map**, server-side, which is where
   `entitlement_is_active` already lives and for the same reason.

The counter-argument, stated honestly: the *included* allowance for each base price still has
to be configured somewhere, and that config is now a second source of truth alongside Stripe.
Keep it server-side (a small table keyed by price id, or `readServerConfig` in
`src/server/config.ts` alongside the existing price env vars) — **never in client code**, and
never in Stripe product metadata alone, since metadata is editable in the dashboard by anyone
with access and would become an unaudited way to grant allowance.

Concrete shape:

- `brand_memberships` (or the accounts table from §5): `+ sku_limit int`, `+ seat_limit int`,
  and keep the raw item list in `data->'billing'->'items'` for debugging — the partial-update
  jsonb merge at `20260801120000:468-472` already supports this with no signature change.
- `apply_stripe_entitlement`: two new nullable `int` parameters, same leave-alone-on-null
  semantics as every other argument. **Signature change**, so it needs the explicit
  `drop function` dance the migration already demonstrates at `:180-182` — `create or replace`
  cannot change a signature and would leave the old overload callable.
- `entitlements` view + `get_entitlement`: expose both columns.
- `entitlement_is_active` **stays exactly as it is.** Limits are orthogonal to entitlement:
  `active` answers "may they use the product", limits answer "how much". Conflating them is
  how a maker over their SKU limit loses the ability to print an existing label — which §6
  says must never happen.

---

## 5. Seats: the largest hidden cost, unsoftened

### 5.1 The problem

There is no organisation. `brand_memberships` is `unique (user_id, brand_slug)` — one row per
person per brand, each with its own `plan`, its own `stripe_customer_id`, its own everything.
For a second person to be a seat on someone else's plan there must be a thing they are both
attached to, and that thing does not exist.

The RLS that makes the current design safe is also what makes it single-user:
`using (auth.uid() = user_id)` (`20260729120000:194-196`). The `entitlements` view inherits it
via `security_invoker` (`20260801120000:519`), and that inheritance is explicitly described as
"the whole security of this view" (`:504`). Any org model has to change that predicate without
breaking it.

### 5.2 Two models

**Option A — an owner pointer on the existing table.**
Add `account_id uuid` (or `owner_user_id uuid`) to `brand_memberships`; members of one
business share it.

- *Read path:* a non-owner's own row still says `plan = 'free'`, so either the webhook fans
  the plan out to every member row on every write (write amplification, and now the plan is
  denormalised in N places), or the view resolves through the pointer (a self-join, and the
  RLS predicate becomes "my row, or a row whose account_id matches mine" — which is a
  recursive read of the same table from inside its own policy).
- *Cost:* one migration, changes to the view, `get_entitlement`, and
  `apply_stripe_entitlement`'s membership resolution. Perhaps a week.
- *Honest assessment:* it is a lie in the data model that will be paid for later. Billing
  belongs to a person who happens to have colleagues, so "remove the owner" and "transfer the
  business" have no representation, and every future feature has to remember to resolve
  through the pointer. Defensible only as an explicit twelve-month expedient.

**Option B — accounts and members, properly.**
`accounts (id, brand_slug, name, owner_user_id, plan, plan_status, stripe_*, sku_limit,
seat_limit, …)` and `account_members (account_id, user_id, role, status)`. Billing moves off
`brand_memberships`, which reverts to identity/attribution. Every product table keys on
`account_id`.

- *Cost:* a substantial migration; rewriting `apply_stripe_entitlement`'s three-step
  membership resolution (`20260801120000:327-350`) to resolve user → account; rewriting the
  view and RPC; rewriting the app's read; **plus an entire invite flow** — an invitations
  table with expiring tokens, an email send, an accept page, seat-count enforcement on accept,
  removal, and the "what happens to their work when they leave" question. Realistically
  several weeks, and the invite flow is most of it.
- *One specific trap:* an RLS policy on `account_members` that queries `account_members` to
  decide visibility **recurses infinitely**. The standard fix is a `SECURITY DEFINER` helper
  (`is_member_of(account_id)`) called from the policy. This repo already uses
  `SECURITY DEFINER` helpers correctly and documents the surrounding hazards
  (`20260801120000:483-490` on Supabase's default grants), so the pattern is familiar — but it
  is a known way to lose a day and it should be planned for, not discovered.

**Recommendation: Option B, but the decision that matters is smaller and more urgent than
choosing between them.**

### 5.3 The thing that has to be said to the cofounder this week

The per-user data isolation being built right now will create the product tables. **If those
tables key on `user_id`, seats become a data migration rather than a feature.** Every row will
be owned by a person, and making it owned by a business means backfilling an `account_id` onto
live customer data while RLS policies, every query, and every insert path change underneath
it.

The cheap version costs almost nothing **if it is done now**:

1. Create an `accounts` table with one row per existing user, and an `account_members` table
   with one row each. No invites, no UI, no seat enforcement — just the shape.
2. Key every new product table on `account_id`, not `user_id`.
3. Write the RLS as "rows belonging to an account I am a member of", via the
   `SECURITY DEFINER` helper. For a single-member account that is behaviourally identical to
   `auth.uid() = user_id`.

Seats then become an invite flow plus a count — real work, but additive, and shippable
whenever the founder wants. Skip it, and seats stop being a pricing decision and become a
migration project. **This is the single highest-leverage thing in this document and it is
time-sensitive.**

### 5.4 A domain-specific seat argument

The app's own seed data makes the case for a **free or cheap read-only seat class**.
`COMPETENT_PERSON` (`products.ts:955-962`) is `kind: 'external'` — Dr Ruth Kelder at Kelder
Compliance BV, an outside organisation, with 2 sheets awaiting review. `TEAM`
(`products.ts:1064-1067`) includes `priya@kelder-compliance.eu` with role `'Read only'`, at a
different email domain from the other two members.

Every SDS is issued as a draft pending competent review (`Settings.tsx:260`,
`Specification.tsx:299`). That reviewer is frequently a paid external consultant who needs
read access and creates nothing. **If a read-only reviewer costs a full seat, makers will
share the owner's login** — which is worse for the maker, worse for auditability, and destroys
the "who signed this off" trail that is part of what the product is for. A viewer seat that is
free (or priced at a fraction) is both better product and better revenue, because it puts a
compliance consultant inside the tool where they can see it works.

---

## 6. Over-limit and downgrade — domain-constrained

**The hard constraint, stated first: a maker mid-batch-run must never find an existing label
unprintable.** Everything below follows from it.

### 6.1 SKUs

**Recommended rule: "no new, keep everything old fully working."**

Over the limit → block *creating* a new SKU. Do not touch anything that already exists:
editing, re-deriving, versioning and **especially exporting** all stay on for every existing
SKU, at every tier, forever.

The reasoning, and why the tempting alternative is actively dangerous:

- **"Excess SKUs become read-only" is the obvious rule and it is wrong here.** Read-only
  usually means "you can look but not change". If it instead meant "you can change the recipe
  but not export the result", the app would let a maker alter a specification while leaving
  them holding a printed label that no longer matches it. That is precisely the failure mode
  the product exists to detect — the drift model at `products.ts:652-672` and the blocking
  attention item at `products.ts:868-878` ("Classification changed since last print… Label v4
  was printed at 7 percent and no longer matches the specification"). **A pricing rule must
  not manufacture the hazard the product is sold to prevent.**
- **"No new, keep old" is self-limiting.** The overage cannot grow, because the only way to
  add a SKU is blocked. There is nothing to claw back.
- **It is the only rule that is obviously fair at the moment of impact.** The maker hits it
  while doing something optional (adding a new product), not while doing something urgent
  (reprinting labels for tomorrow's market stall).

Two supporting rules:

- **Never let software choose which SKUs are over.** If any restriction beyond "no new" is
  ever introduced, the maker picks which products it applies to. Software silently deciding
  that a maker's bestseller is the frozen one is unforgivable and unfixable in support.
- **Show the count before it bites.** The usage meter already exists (`Settings.tsx:411-445`);
  surface it where SKUs are created, not only in billing.

### 6.2 Downgrade while over the limit

**Recommended: allow it, apply "no new, keep old", and say so clearly.**

Blocking the downgrade is tempting and does not work, because **the over-limit state is
reachable anyway**. A maker can cancel in the Stripe portal at any time
(`api/create-portal-session.ts`), and cancellation is a downgrade to free. So the software
must handle "more SKUs than the plan allows" regardless — which means blocking the downgrade
buys nothing except a frustrated customer who cancels outright instead.

What to do instead: at the point of downgrade, show the count and name what changes — *"You
have 25 SKUs. On this plan you can't add new ones until you're under 10. Everything you
already have stays editable and printable."* That is honest, it is not a threat, and it makes
the upgrade path obvious without holding anything hostage.

### 6.3 Cancellation, and a decision the founder should make deliberately

Today, cancelling turns export off entirely: `canExport = entitlement.active`
(`ArtefactDesigner.tsx:55`) and `PlanNotice.tsx:58-66` says *"Nothing has been deleted. Your
products, materials and records are all still here and still readable."*

Under the compliance constraint this deserves a second look. A maker who cancels still has
product **on shelves, in customers' homes, carrying a label Batchlabel generated**. A recall,
a Trading Standards query, or a reprint of an unchanged label is exactly when they need the
file back, and exactly when they no longer have a subscription.

Worth considering: **re-export of an already-exported, unchanged artefact stays available
forever, on every tier including free.** Sell the ability to *change* labels and to *make new*
ones; never sell back access to a label the maker already put on a shelf. It is defensible on
safety grounds, it removes the nastiest support conversation the product can generate, and as
marketing — *"your labels stay printable, even if you stop paying"* — it is worth more than
the handful of retained subscriptions it costs. It also happens to make the free tier
genuinely honest for the first time (§7).

### 6.4 Seats

Different, because seats are not compliance-critical — but people are not fungible.

- **Over the seat limit:** block new invites. Do not deactivate anyone.
- **On downgrade below the current headcount:** require the **owner** to choose who to remove
  before the downgrade completes. Never auto-remove. An auto-removal picking by "last added"
  or "least active" would frequently remove the external competent person (§5.4) — who is
  by nature the least active user in the account and may be mid-review of an SDS.
- **Never sign anyone out mid-session** for a seat-count reason. Apply removals at the next
  session.

---

## 7. Every plan-related claim currently made to a customer

Compiled by exhaustive grep across both repos: `src/content/**`, the pricing page, FAQs,
legal pages, `public/llms.txt`, structured data, `docs/COPY.md`, and the app's entitlement UI.

Legend: **✗ false** — not deliverable today · **⚠ risky** — true only under a reading, or
false under the new model · **✓ true**

| # | Claim | Where | Status |
| --- | --- | --- | --- |
| 1 | "First label free, no card" | `src/components/home/Hero.tsx:6`; `src/pages/Home.tsx:18`; `index.html:32,43,58` | **✗** The app disables both export buttons whenever `active` is false (`ArtefactDesigner.tsx:127,142`). Free users get **zero** labels, not one. |
| 2 | "1 label" / "Watermarked preview" / "PNG download" | `src/pages/Pricing.tsx:23-25` | **✗** There is **no watermark code and no PNG export path anywhere in the app** (grep: zero hits for either). |
| 3 | "1 label, watermarked PNG preview" | `src/lib/entitlements.ts:116` | **✗** Same. |
| 4 | "Yes. You can make one label and see the full preview without entering a card. It is watermarked and PNG only, but the wording on it is the real thing." | `src/content/faqs.ts:143` | **✗** Twice over: no free label, and — per `docs/COPY.md:3858-3863`'s own flag — the free tier excludes UFI and batch code, which are label *content*. Not "the real thing". |
| 5 | "The free plan gives you a watermarked PNG preview." | `src/content/faqs.ts:133` | **✗** |
| 6 | "One watermarked PNG label. No payment card needed." (`Offer` structured data) | `src/lib/structured-data.ts:133` | **✗** And this one is machine-readable, indexed, and quoted by answer engines. |
| 7 | "Free: one watermarked PNG label, no payment card needed." | `public/llms.txt:44` | **✗** Same, aimed squarely at LLMs. |
| 8 | "The Free plan allows one watermarked label and requires no payment card." | `src/pages/legal/Terms.tsx:77` | **✗** In the **terms of service**. |
| 9 | "Community support" (free tier) | `src/pages/Pricing.tsx:26` | **✗** No forum, chat or community exists. Already flagged at `docs/COPY.md:3855`. |
| 10 | **"Up to five people on the account"** | `src/pages/Pricing.tsx:41` | **✗** No org concept exists (§3.4). Not unenforced — *impossible*. |
| 11 | "The Maker plan covers teams of up to five people." | `src/content/faqs.ts:194` | **✗** Same. |
| 12 | "…and up to five people on the account." | `public/llms.txt:47` | **✗** Same. |
| 13 | **"Unlimited labels"** (×5) | `src/pages/Pricing.tsx:34,178`; `src/lib/entitlements.ts:142,165,166`; `public/llms.txt:45`; `src/pages/dashboard/Account.tsx:114` | **⚠ Directly contradicts the new model.** Under SKU metering this must change everywhere. Note the useful nuance: *labels* can honestly stay unlimited (reprints are free) while *SKUs* are metered. |
| 14 | **"One price, £14 a month. No tiers that punish you for growing."** | `src/pages/About.tsx:110` | **⚠** A values statement that a Free\|Maker\|Small team\|Growth ladder falsifies. Add-ons are a genuine mitigation and the copy could be rewritten to claim them — but as written it must go. |
| 15 | "Open the saved recipe, change the fragrance percentage **or the pack size**, and download a new label." | `src/content/faqs.ts:41` | **⚠** The §1.3 finding. Under SKU metering, changing pack size creates a **billable** entity. |
| 16 | "Saved recipes you can edit and reuse" | `src/pages/Pricing.tsx:39`; `src/lib/structured-data.ts:123` | **⚠** No persistence exists (`products.ts:532` is an in-memory array). Also collides with "products". |
| 17 | "UFI generation, that is a Unique Formula Identifier" | `src/pages/Pricing.tsx:37`; `src/content/faqs.ts:26`; `llms.txt`; structured data | **✗** `identifiers.ufi` is a seeded string (`products.ts:139`). `createProduct` sets `identifiers: {}` (`products.ts:618`). **Nothing generates a UFI.** |
| 18 | "Batch code and date fields" | `src/pages/Pricing.tsx:38`; `src/components/home/WhatsIncluded.tsx:13` | **⚠** Present in seed data; no user-facing field to fill per batch. |
| 19 | "Print ready PDF and SVG" | `Pricing.tsx:35`; `entitlements.ts:142`; `CheckoutSuccess.tsx:27` | **✗** Both export buttons are `toast()` stubs (`ArtefactDesigner.tsx:129-135, 144-148`). No file is produced. **SVG is never mentioned in the app at all.** |
| 20 | "Watermarks are off and print ready PDF and SVG downloads are switched on." | `src/pages/checkout/CheckoutSuccess.tsx:27` | **✗** Shown immediately after a real payment. |
| 21 | "£14 a month / £140 a year, VAT included" | 8 places (enumerated at `docs/COPY.md:118-128`) | **⚠ True but fragile.** Only the pricing-card number reads from `PRICES` (`src/lib/billing.ts:30`); the rest are hand-typed, including the terms. Any ladder change touches 8 strings by hand. |
| 22 | "At the limit you can keep working on existing products but cannot create a new one until you move up a plan." | `app/src/pages/Settings.tsx:441-443` | **✗** No limit is enforced (`createProduct` has no check). Ironically this is close to the recommended rule in §6.1 — it just is not implemented. |
| 23 | "Maker £24 / 3 products, Studio £58 / 10, House £140 / 40" | `app/src/lib/products.ts:974-995`, rendered at `Settings.tsx:421` | **✗** Three tiers at prices that do not exist, shown to signed-in customers on the billing tab. **The most directly contradictory artefact in either repo** and the one to remove first. |
| 24 | "Reading supplier documents is never metered, on any plan." | `app/src/pages/Settings.tsx:441` | **✓** True, and worth keeping true — it is the on-ramp. |
| 25 | "Everything else stays open on the free plan — build products, read supplier documents and check what the regulations require." | `app/src/components/PlanNotice.tsx:42-44` | **✓** Accurate today, and a good statement of the philosophy. |
| 26 | "Your plan is still on while your bank retries, so nothing is blocked yet." | `app/src/components/PlanNotice.tsx:52-54` | **✓** Matches `entitlement_is_active` (`past_due` entitles). |

**Summary: 14 outright false, 6 risky under the new model, 3 true.** The free-tier cluster
(1–8) is the most exposed — it appears in the terms of service, in `Offer` structured data and
in `llms.txt`, so it is being quoted by search and answer engines as well as read by
customers. The seat cluster (10–12) is the second, because it promises a capability that has
no mechanism at all.

**One clean way to fix the free-tier cluster at a stroke:** adopt §6.3 and make the free tier
*"make and keep one SKU, print it as often as you like"* rather than *"one watermarked PNG"*.
That is deliverable with the gate that already exists, it is more generous than what is
promised, it needs no watermarking code, and it is honest.

---

## 8. Market comparison — what comparable tools charge and how they meter

All prices accessed **31 July 2026**. I care about the metric, not the number; numbers are
included for the crossover arithmetic in §9.3.

### 8.1 The headline: what do comparable tools count — formulations or sellable SKUs?

This is the question §1 turns on, so it goes first.

| Tool | Counts | Ladder | Price |
| --- | --- | --- | --- |
| **CraftCert** — the one shipped UK maker-facing CLP SaaS | **Products (SKUs)** | 3 / 25 / unlimited | £0 / £9 / £15 per month ([craftcert.co.uk/pricing](https://craftcert.co.uk/pricing)) |
| **Cosmetica** | **SKUs** | 1 / 50 / unlimited | $150 **per SKU one-time** / $479/mo / $1,279/mo ([getcosmetica.com/pricing](https://getcosmetica.com/pricing)) |
| **Eldris** (EU/UK responsible person) | **Active SKU count bands** | ≤10 / ≤20 / ≤50 / 100+ | £9.95 → £99.95/mo, plus **£195 per unique formula and £39.95 per variation** ([eldris.ai](https://eldris.ai/data-centre/eu-responsible-person-cost-2026/)) |
| **Euverify** | **Product families** + users + markets | 5 / 20 / 50 / 100 | £490 → £1,890/yr ([euverify.com/pricing](https://euverify.com/pricing)) |
| **Cosmetri** (Registrar Corp) | **Products + seats jointly** | 100 → unlimited | Unverified; sources conflict |
| **CM Studio+** | **Formulations** (+ raw materials, batches, quotes, clients) | 50 → unlimited | Free / $13.99 / $39.99 / $89.99 / $599.99 ([cmstudioplus.com/pricing](https://cmstudioplus.com/pricing)) |
| **Cosmedesk** | **Products as monthly credits**, *separately* from products stored | 1 / 5 / 15 credits against 300 / 600 / 900 stored | €72 / €200 / €339 per month ([cosmedesk.com/plans-pricing](https://cosmedesk.com/plans-pricing)) |

**Verdict: the neighbourhood counts sellable SKUs, with one exception.** CraftCert — the
closest analogue in existence, same country, same buyer, same regulation — chose products/SKUs
at 3 / 25 / unlimited. CM Studio+ is the lone formulation-metered tool, and it is a cosmetics
formulation workbench rather than a labelling tool, so its unit follows its primary object.

Two findings inside that worth more than the headline:

- **Eldris prices the distinction explicitly, and prices variants at 20% of a formula.**
  £195 per unique formula, **£39.95 per variation**. That is a real-world market answer to the
  exact question in §1: a variant is worth roughly a fifth of a formulation. It supports both
  positions — variants are not free, but they are not full price either. If the founder wants
  a defensible middle, this is the precedent.
- **Cosmedesk decouples *creating* from *storing*.** Monthly product credits (1/5/15) against a
  much larger stored-product cap (300/600/900). **This is the "seasonal range" and "back
  catalogue" answer from §9.1** — customers are never punished for products they already have,
  only for the rate at which they add new ones. Worth stealing conceptually even under SKU
  metering.

### 8.2 The competitive floor: CLP is already free if you buy your oils in one place

The most commercially significant finding from the research, and it is not a SaaS competitor:

- **Candle Shack** gives away two tools free with no login — **ScentFusion** (SDS, CLP label
  templates, IFRA certificates, allergen declarations, emailed out) and a **CLP Label Design
  Tool**. Both are locked to Candle Shack's own oil catalogue and fixed fragrance loads
  (candles 6/8/10%, diffusers 15/20%, room spray 5%). Custom bases or non-standard percentages
  route to a paid, unpublished "CLP Design Service".
- **Craftiful** includes **printed CLP label sheets free with every oil**, no minimum, scaled
  to bottle size (50 g → 1 sheet, 1 kg → 6).
- **Nikura**, **Supplies for Candles**, **Scentify**, **Fragrance Oil Studio** and **Scent
  Perfique** all run the same free-with-oils play.

**For a maker who buys all their fragrance from one supplier, CLP compliance already costs
£0.** Batchlabel's wedge is precisely what those tools refuse: **mixed suppliers, custom
blends, non-standard loads, and any supplier's SDS.** Candle Shack's tool declines exactly
those cases in writing. That exclusion is the market — and it is a reason to be careful that
the free tier is generous enough to be worth a maker's switching effort.

There is also a paid layer between free-with-oils and SaaS that shows makers already pay
**per SKU**: printed CLP sheets at **£0.85–£0.99 per sheet, one fragrance per sheet**
([Glow CLP](https://glowclp.co.uk), [Magic CLPs](https://magicclps.co.uk)), and one-off
authoring at **£60 ex VAT per job** ([Naturally Balmy](https://naturallybalmy.co.uk/products/clp-services))
or **£150 + VAT per SDS** (EL-Science). A maker with 12 SKUs pays ~£10 in printed sheets per
batch or £720 for one-off authoring — which frames £9–15/month as obviously cheap, and which
independently corroborates §1.3d: **this buyer is already accustomed to paying per SKU.**

### 8.3 Add-ons: nobody in this market sells them, which cuts both ways

Weighted per the founder's decision. Across every CLP, SDS, cosmetics-compliance and
maker-SaaS vendor examined, **no vendor publishes self-serve per-unit SKU or seat add-ons on
top of a tier.** Expansion is tier upgrade, or contact-sales credit packs. The nearest
approaches:

| Vendor | Add-on model | Per-unit or packs | Self-serve? |
| --- | --- | --- | --- |
| **Zoho Inventory** — the best template found | Live plan customiser on the pricing page with **+/− steppers** and price recalculating as you go | **Both**: users £6/user/mo (per-unit); orders £6 per **500-order pack**; locations £8 each | Yes, at checkout |
| **Cosmedesk** | Product credits addable "at any time", packs of **5/10/20/40/80/160**, credits valid 18 months | Packs. Note: **variable consumption** — a known ingredient costs 1 credit, a new one costs 5 | No — routes through sales, no per-credit price published |
| **SDS Manager** | A **slider** that reprices the whole subscription by SDS count (15→300) | Neither — it is a repriced tier | Yes |
| **Xero** | £1.50/person/mo, max 200 | Per-unit | Yes, auto-billed. **But this is payroll employees, not login seats — login seats are unlimited and free** |
| **Airtable / Canva / Notion** | Per-seat, prorated | Per-unit (Canva has a 3-seat floor) | Yes; Airtable auto-bills when you grant edit rights |
| **CraftCert, Cosmetri, Ecwid, Squarespace, Stocksmith, Shopify, QuickBooks** | **None.** Tier upgrade only. Cosmetri states outright that modules "are not available as separate add-ons"; QuickBooks UK states you cannot buy extra seats individually | — | — |

**Read this honestly in both directions.** Self-serve per-SKU and per-seat add-ons would be
genuinely differentiated — nobody in the category offers them, and the "I need 11 and the next
plan is 3× the price" cliff is real and unaddressed. But nobody has validated demand either,
and §4.3 shows the self-serve half needs a custom billing screen because Stripe's portal will
not do it. **The differentiation is real; the build cost is larger than it looks.**

### 8.4 Seats: the free read-only seat is a solved pattern

| Where seats start being charged | Who |
| --- | --- |
| **Never — unlimited users included** | Xero (all plans, with a first-class free **Read Only** role), FreeAgent, Stocksmith/Craftybase |
| **Free viewer/commenter alongside paid editors** | **Airtable** — read-only and commenter free on every plan including Business; billing is driven automatically by *edit* permission. **Notion** — free guests (10/100/250 by tier). **QuickBooks** — "reports only" users do not count |
| **Bites at 2–3 people** | QuickBooks UK, Canva Business (3-seat floor), Zoho Inventory, Squarespace |
| **Bites at 5** | Shopify (**0 staff seats below £65/mo** — a well-documented source of complaint), CM Studio+, Cosmetri, Euverify |

**This is a direct answer to §5.4.** The "external compliance reviewer needs access but creates
nothing" problem is solved the same way by four well-known tools: **bill on edit permission,
not on account existence.** Airtable is the cleanest reference. A free viewer seat costs
nothing, removes the main objection to seat metering, and puts a compliance consultant inside
the tool where they can see it working.

### 8.5 Over-limit and downgrade precedent

| Vendor | Over the limit | Downgrading while over |
| --- | --- | --- |
| **Shopify** — the model to copy | Hard gate on adding | Excess users **suspended in a published, deterministic order** (pending users first, most recently invited; then active users by longest-inactive). Excess locations auto-deactivated, reactivatable. **Nothing deleted.** |
| **Airtable** | Soft: keep using, cannot add records or attachments until you upgrade | Excess preserved but frozen; historically read-only |
| **Stocksmith / Craftybase** | **Automatic upgrade** on a rolling average (3-month monthly, 12-month annual) so one busy month does not trigger it | **Downgrade blocked** while the average exceeds the target plan |
| **QuickBooks Online** — the model to avoid | Caps apply to *active* items; must delete before adding | Accounts over limits "can be suspended at their next renewal"; reportedly **read-only for 12 months** if unresolved *(secondary sources; the official Intuit UK page timed out — verify before quoting)* |
| **CraftCert, Ecwid** | **Undocumented.** Could not verify | Undocumented |

Two lessons. **Shopify's rule is customer-legible and defensible** — deterministic, published,
nothing lost, reversible — and it is close to the §6 recommendation. **Stocksmith is the only
vendor in the set where reviewers complain about the metric**, and the complaints are about the
*automatic, non-consensual tier change*, not about the metric itself. Entity counts (SKUs,
seats) do not drift the way throughput does, which is a further point in favour of the chosen
metric.

### 8.6 The Etsy-scale price anchor

The buyer also lives in a market that meters almost nothing structural. eRank (free; $5.99),
Alura (free; $7.99), Sale Samurai (free; $19.99) all gate on **daily or monthly action
quotas**, not on business size. Marmalead meters nothing at all — $19/mo or **$300 lifetime**.
FreeAgent meters **legal entity type** (£9.50/mo sole trader) — a metric the customer cannot
game. Xero caps documents on its entry tier only and gives away users entirely.

**Anchoring consequence:** a UK sole trader already paying £9.50 for FreeAgent and $5.99 for
eRank has a reference band, and CraftCert has planted a flag at **£9–£15** for this exact job.
The current £14 Maker price sits inside it; a four-tier ladder needs its entry paid tier to as
well.

### 8.7 What could not be verified

- **Over-limit and downgrade behaviour for every CLP/compliance vendor**, including CraftCert.
  No pricing page, FAQ or terms documents it. Would need trial signups.
- **Typical SKUs-per-formulation for a UK candle maker.** No data found. This is the number
  §1.3d's recommendation rests on, and sampling Etsy shops directly would settle it faster than
  any search.
- **LabelCraft CLP** — search results describe a near-identical pitch to Batchlabel ("upload
  any supplier's SDS, get a compliant UK GHS label, free during closed beta"). The live page is
  **1,808 bytes containing only a `<title>` and a Google Analytics tag. There is no product.**
  Treat every claim about it as search-index residue. Worth monitoring.
- **Cosmetri pricing** — sources conflict irreconcilably (€49/user/mo vs $58/mo vs €99–199).
  Official page 403s after the Registrar Corp acquisition. **Do not quote.**
- **COPTIS, Formpak, Selerant/Devex, TraceGains, Decernis, Chemwatch, EcoOnline, Lisam** — all
  quote-only. Circulating figures come from AI-generated aggregators and are unreliable. Not
  comparable to this market anyway.
- **Xero UK, QuickBooks UK, Canva, Squarespace** official pricing pages blocked automated
  fetches; figures are from dated secondary sources.

---

## 9. Analysis for the discussion

### 9.1 Products/SKUs as the primary metric — the case, and the failure modes

**For:**

- It is the only entity a user creates (`products.ts:531`), so it is the only thing that can
  be counted without inventing a new concept.
- It correlates with the maker's revenue better than anything else available. A maker with 40
  SKUs is a bigger business than one with 4, reliably.
- **It is regulator-safe.** It restricts *how many* products, never *what appears on a label*.
  See §9.4 — this is a stronger argument than it first appears.
- It is legible. "How many things do you sell?" needs no explanation.
- Reprints stay free, which is the correct answer to the repeated core action.

**Against, and the failure modes to design around:**

- **The pack-size multiplier (§1.2).** The single biggest issue: a SKU meter charges three
  times for one derivation. Mitigated, not eliminated, by §1.3d — price the allowance at ~3
  SKUs per formulation, call the unit a SKU rather than a "product", ship a one-click "add
  another pack size", and issue one UFI per composition. Do all four or the multiplier becomes
  a grievance.
- **Seasonal ranges.** A candle maker's Christmas range may be 8 SKUs that exist for 10 weeks.
  Under a hard cap the maker either upgrades for a quarter or deletes last year's range —
  which destroys the traceability record that is half the product's value. **Worth an explicit
  archive concept that does not count toward the limit**, with the record retained. This is
  cheap to build now and expensive to retrofit. Cosmedesk has already solved it in the market
  by decoupling *products created this month* from *products stored* (§8.1) — the same idea,
  and evidence it is legible to buyers.
- **The limit lands at the moment of optimism.** A maker hits it while creating something new
  — the best moment in their week. Add-ons are the right mitigation precisely here: "add one
  more SKU for £x" is a far better experience than "upgrade your plan to continue".
- **Deletion as an escape hatch.** If deleting a SKU frees a slot, some users will churn SKUs
  to stay under the cap, losing their own history. If deletion does *not* free a slot, that is
  outrageous. Archive-without-counting resolves it; nothing else does.

### 9.2 The candidates that remain, briefly

Labels/exports printed is ruled out. For completeness, the other options and why they lose to
SKUs:

- **Seats alone.** Fails on this buyer — the median customer is one person, so it collects
  nothing from the largest accounts until they hire. Correct as a *secondary* metric, which is
  the decision taken.
- **Feature gating only** (the status quo: export on/off). Simple, already built, zero
  enforcement cost. Fails because it cannot price a 40-SKU business differently from a 2-SKU
  one, and both are real customers. Retain it *underneath* SKU metering — free stays
  "everything except the finished artefact" — but it cannot carry a four-tier ladder.
- **Records/batches.** Metering compliance record-keeping. Never.
- **Artefacts.** A derived multiple of SKUs (§1.4); metering it is metering SKUs with a
  confusing multiplier.

### 9.3 Add-on pricing structure

Not the numbers — the structure.

**Per-unit vs packs.** Recommend **per-unit for both SKUs and seats.** It maps exactly onto
Stripe's `quantity` on a subscription item, which is what makes the whole model buildable; it
is trivially explicable ("£x per extra SKU per month"); and it never strands a customer
mid-pack. Packs reduce invoice noise and make the upgrade maths tidier, but a maker who needs
one more SKU and must buy five is being handed the same cliff the add-on was invented to
remove.

**Making the ladder self-select.** The goal is that at roughly 1.5–2× a tier's included
allowance, upgrading is cheaper than stacking add-ons. With lower tier price `P₁` including
`S₁` SKUs, next tier `P₂`, and add-on unit price `a`, upgrading wins at usage `U` when:

```
P₁ + a·(U − S₁)  ≥  P₂        ⟹        a  ≥  (P₂ − P₁) / (U − S₁)
```

- Self-selection at **2× the allowance** (`U = 2·S₁`): **`a ≥ (P₂ − P₁) / S₁`**
- Self-selection at **1.5×** (`U = 1.5·S₁`): **`a ≥ 2·(P₂ − P₁) / S₁`**

In words: **the per-SKU add-on price should be at least the gap between the two tier prices
divided by the lower tier's included allowance.** That is also the intuitive answer — the
add-on should cost a little more per SKU than the tier upgrade delivers per SKU, or nobody
ever upgrades.

Two guard rails:

- **Floor:** the add-on must be *more* expensive per unit than the tier's own included units,
  or add-ons cannibalise the ladder entirely.
- **Ceiling:** not so expensive that it reads as a penalty. The purpose is to delete the
  "I need 11 and the next plan is 3× the price" cliff, not to replace it with a toll.

**Say the maths out loud in the UI.** When stacked add-ons would cost more than the next tier,
show it: *"You're paying £X in add-ons. Growth costs £Y and includes them."* Customers who are
told this trust the pricing more, not less, and it converts the upgrade without a sales email.

**Self-serve is the reason to build add-ons, and it is the part that does not work out of the
box.** See §4.3: the Stripe Customer Portal goes cancel-only on multi-product subscriptions.
Budget for a custom quantity screen on www, or the add-on model degrades into "email us to
change your SKU count", which is worse than no add-ons at all.

### 9.4 The regulatory angle — the one rule that should constrain tiering

**Gate convenience. Never gate correctness.**

If a lower tier produces a label that is *less correct* rather than *less convenient*, the
product is helping someone break the law, and Batchlabel's own disclaimer
(*"responsibility for the final label rests with you as the seller"*, `Pricing.tsx:226-228`)
does not make that comfortable. The following must never be tier-dependent:

- hazard statements, precautionary statements, signal word, pictograms
- allergen declarations
- the minimum pictogram and label dimensions from CLP Annex I Table 1.3
  (`derive.ts:613-626`)
- the UFI on the label, where the product requires one
- supplier name and address; the EU responsible person block for EU/NI supply

**The current free tier already crosses this line, in copy.** `docs/COPY.md:3858-3863` flags it
independently: the pricing page lists UFI generation and batch code fields as *not included*
on free (`Pricing.tsx:29,30`) while `WhatsIncluded.tsx:12-13` presents both as things that go
*on the label*. So the free label is described as "the real thing"
(`faqs.ts:143`) while being missing two pieces of mandatory label content. If a maker printed
it, it would be non-compliant.

**This is a strong, independent argument for the founder's chosen metric.** SKU metering
restricts *how many products* you can label, never *what goes on the label*. It moves the
free tier from "a deliberately wrong label" to "a complete, correct label, for one product" —
which is safer, more honest, better marketing, and needs no watermarking code.

Two further regulatory constraints, both already covered above:

- **Reprints must never be metered** (already decided) — a batch reprint is the core repeated
  action and often a safety-driven one.
- **Cancellation must not strand a label that is on a shelf** (§6.3).

And one that has not been mentioned: **the safety data sheet.** Every SDS is issued as a draft
pending competent review (`Settings.tsx:260`, `Specification.tsx:299`), and an SDS is a legal
document a customer's own trade buyer may demand. Gating SDS *access* differently from label
access would be a trap — a maker on a lower tier who can print a label but not produce the
sheet is non-compliant in a way they will not notice. Keep the label and the SDS on the same
side of every line; the model already does this, since both are artefacts of one derivation
(`products.ts:501`).

### 9.5 Cheap now vs blocked on the cofounder's work

**Buildable this week, no dependency:**

- Remove the contradictory `PLANS` stub (`app/src/lib/products.ts:974-995`) and the usage bar
  that renders it (`Settings.tsx:411-445`). It shows customers three tiers that do not exist.
- Fix the copy in §7 — especially the free-tier cluster (terms, `llms.txt`, structured data)
  and the seat claims. These are live promises and cost nothing but words.
- Point the app at the `entitlements` view and delete its local `mapEntitlement` rule
  (§2.3). One file, removes a real drift.
- Stripe: create the tier prices and the add-on prices. Independent of everything else.
- Decide the billing unit and the allowance (§1.3d) — free to decide now, expensive after the
  products table exists.
- **Fix the UFI to be one per composition** (§1.2). A correctness matter, not a pricing one,
  and cheap while nothing generates one yet.

**Needs the webhook work (self-contained, days not weeks):**

- Multi-item reads in `src/server/entitlements.ts` and `src/server/stripe-events.ts` (§4.1).
- `sku_limit` / `seat_limit` on the row, plus the `apply_stripe_entitlement` signature change
  and the view/RPC columns (§4.4).
- The custom add-on quantity screen on www (§4.3) — the largest single UI item here.

**Blocked on the cofounder's per-user data work:**

- Any actual SKU enforcement. Until a `products` table exists, `sku_limit` is a number nobody
  can compare anything to.
- The insert trigger and the real over-limit behaviour.

**Blocked on a decision that has to happen before that work lands:**

- **Seats.** §5.3. If the product tables key on `user_id`, seats become a migration. The
  `accounts` + `account_members` shape must exist before the first product table is created,
  even if every account has exactly one member for the next year.

**Suggested sequence, given the founder wants to move to Stripe setup next.** Steps 1 and 2 are
both messages to the cofounder, both cost close to nothing today, and both become migrations if
they are skipped — they are the only genuinely time-critical items in this document:

1. **Ask for `specifications` and `products` as two tables**, and for product tables to key on
   **`account_id`, not `user_id`** (§1.3b, §5.3). No UI, no invites, no seat enforcement — just
   the shape. This costs a join and preserves both the billing-unit option and seats.
2. Decide the billing unit and the allowance (§1.3d). *Blocks nothing if step 1 is taken, which
   is the point of taking it.*
3. Fix the copy (§7). *Independent, and currently the largest exposure — it is in the terms of
   service, the `Offer` structured data and `llms.txt`.*
4. Stripe prices + the multi-item webhook + resolved limits on the row (§4). *Independent of
   1–3, so it can run in parallel and the founder can start now.*
5. Enforcement, once the products table exists.
6. Seats and invites last — pricing can advertise them from the day the org shape exists, as
   long as the copy does not promise them before the invite flow ships. That is exactly the
   mistake currently live (§7, claims 10–12).

### 9.6 What I could not determine

- **Whether the Stripe Customer Portal permits quantity updates on a `billing_scheme=tiered`
  licensed price.** This decides whether §4.3 option (b) is viable. The documented limitation
  names usage-based (metered) billing, and tiered *licensed* pricing is not that, but I found
  no explicit statement. Testable in a sandbox in under an hour.
- **What the cofounder's per-user isolation work actually creates.** Not in either repo at
  `main`. Everything in §5.3 is written from the schema as it stands; if that work already
  keys on an account, the urgency drops sharply.
- **Whether `stripe_price_id` is populated in production.** The column exists
  (`20260801120000:63`) and the webhook writes it (`:460`), but I have no production data.
- **The typical SKUs-per-formulation ratio for a UK candle or home-fragrance maker.** No data
  found, and the market research could not find it either. **The §1.3d recommendation rests on
  an assumed ~3× that nobody has verified.** Sampling 30 Etsy shops by hand would settle it in
  an afternoon and would be the highest-value hour anyone spends on this decision.
- **The UFI-per-composition position is corroborated, not primary-sourced.** ECHA's own pages
  return 403 to automated fetches; four independent secondary sources agree (§1.2). Worth a
  five-minute browser check before it is written into anything customer-facing.
- **Real conversion or usage data.** No analytics were read. Every judgement about where a
  limit "bites" is reasoned from the domain, not measured.
- **Whether any Batchlabel customers exist yet.** This determines whether the §7 copy fixes
  are urgent (people are reading false promises) or merely important (they will).
