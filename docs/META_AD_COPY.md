# Meta ad copy — Batchlabel

Paste-ready text for the ad layer. Everything above the creative is already built:

| Object | ID | Status |
|---|---|---|
| Campaign — `Batchlabel \| Sales \| UK makers \| Prospecting` | `120251215398060203` | PAUSED |
| Ad set — `UK \| Broad \| Purchase` | `120251215422650203` | PAUSED |
| Page — `BatchLabel` | `1217508214783407` | exists |
| Dataset (pixel) | `1374342861305621` | live, firing |

Written down rather than applied because the ad could not be created: Meta's creative API
requires an image, and the only hosted brand assets are a 180px touch icon and a 32px
favicon. Add one image and every field below can be filled in.

---

## DO NOT RUN THIS YET

Not a scheduling note — a correctness one. **The product cannot currently do the thing this
copy sells.** SDS upload does not exist (the catalogue is seeded and read-only, there is no
file input and no parser) and export does not exist (both buttons are `toast()` stubs). Only
classification is real.

The same rule that governs the website governs the ads: **do not describe a mechanism that
does not exist.** Every line below is written for the product as it will be once the export
and upload work lands. Running it before then would be selling a stub, and paying for the
privilege.

Gate: run it when a maker can upload a supplier SDS and download a finished label.

---

## The positioning

The wedge is not "makers need CLP labels" — most already get them free. Candle Shack,
Craftiful, Nikura, Supplies for Candles and others hand out CLP labels and SDSs **free with
fragrance oil purchases** (`docs/PRICING_RESEARCH.md` §8.2). For a maker who buys everything
from one supplier at standard loads, compliance already costs £0.

**The wedge is exactly what those tools refuse:** mixed suppliers, custom blends,
non-standard fragrance loads, and any supplier's SDS. Candle Shack's tool declines those
cases in writing and routes them to a paid, unpublished design service.

So the target is not "UK candle makers". It is **makers whose supplier's free tool does not
cover them** — and who are therefore paying £60–150 per SDS to a consultant, or £0.85–0.99
per printed sheet.

That is what every variant below leads with. A generic "compliance made easy" ad competes
with free; this one competes with a £60 invoice.

---

## Variant A — the exclusion (lead with this)

**Primary text**
> Your oil supplier's free CLP tool only covers their oils, at their percentages. Blend two
> suppliers, or run a custom load, and you're on your own — right when a consultant starts
> charging £60 a sheet.
>
> Batchlabel reads any supplier's safety data sheet and gives you the finished label.

**Headline** — `CLP labels for any supplier's oil`
**Description** — `From £14/month, exc VAT`
**CTA** — `LEARN_MORE`

Strongest because it names a moment the reader has already had. It does not argue that
compliance is hard; it points at the gap they already fell into.

## Variant B — the arithmetic

**Primary text**
> £60 a sheet from a compliance consultant. £0.99 a sheet printed. Or £14 a month for every
> label you'll ever need — from any supplier's safety data sheet, at any fragrance load.
>
> Built for UK makers who outgrew their supplier's free tool.

**Headline** — `Stop paying per label`
**Description** — `£14/month, exc VAT`
**CTA** — `LEARN_MORE`

Works because this buyer is already used to paying per SKU, which is the same reason SKU is
the billing unit (§8.2). The comparison is to a bill they recognise.

## Variant C — the responsibility

**Primary text**
> Trading Standards don't care that your supplier's free tool didn't cover your custom blend.
> If you sell it, the label is yours.
>
> Batchlabel classifies from any supplier's SDS — hazard statements, allergens, UFI, poison
> centre notification — on every plan.

**Headline** — `Get the label right, every batch`
**Description** — `Made for UK makers`
**CTA** — `LEARN_MORE`

Accurate rather than scaremongering: responsibility genuinely does rest with the seller, and
Batchlabel's own terms say so. Test it against A — fear converts, but it attracts people
looking for reassurance rather than a tool.

---

## Destination URL

Same for every variant:

```
https://www.batchlabel.xyz/
```

## URL parameters — the field this was all for

Set at **ad level**, in the *Tracking* section, field **URL parameters**. It is per-ad; there
is no account-level equivalent, which is the whole reason it could not be set before an ad
existed.

```
utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}
```

Those are Meta's dynamic macros — they resolve at delivery, so the string is identical on
every ad and never needs editing.

**Why it matters more here than usual.** Meta has no auto-tagging, and its in-app browser
frequently strips the referrer, so untagged Meta traffic lands in GA4 as `direct` — the one
bucket you cannot act on. You would be paying for clicks that report as free.

And `src/lib/attribution.ts` already captures all five UTMs first-touch into a one-year
cookie, which flows into `brand_memberships.attribution`. Joined to `plan`, that answers
*"which campaign produced Studio customers"* — not just "customers" — in one SQL query.
That is the number that decides budget, and it only works if a readable campaign name is in
that jsonb.

---

## Two settings that are not copy but belong to the ad layer

**Link the Page to the ad account.** `BatchLabel` (`1217508214783407`) exists under
Orchestrate Technologies but is not a *promoted page* on ad account `28365194709740102`, so
the account-scoped page list returns empty. Business Settings → Accounts → Pages → add it.

**Optimise for conversion count, not value.** Already set on the campaign
(`LOWEST_COST_WITHOUT_CAP`), and it must stay that way while both billing intervals are live:
Studio annual (£350) is a larger first payment than Consultant monthly (£199), while
Consultant is worth £2,388/yr. Value optimisation would systematically buy the worse customer.
