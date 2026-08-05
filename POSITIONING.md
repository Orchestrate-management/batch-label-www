# Positioning

Why the site is structured the way it is, and what it is allowed to claim.

## What Batchlabel does

Turn the safety data sheet from a fragrance supplier into a UK and EU CLP label
for a small maker, shown on screen at true size.

```
supplier safety data sheet  ->  fragrance percentage and pack size  ->  the label, at true size
```

The last box used to read "print ready label". Nothing in either repo writes a
file, so that box was the origin of a claim that reached the pricing page, the
FAQs, the terms and the structured data. It ends where the software ends.

That is the whole product. It works for candles, wax melts, reed diffusers and
room sprays.

## What it does not do

Nothing else. No category outside candles and home fragrance has been started, and
per the master specification §13 none is going to be: "Out of scope, permanently:
Cosmetics in any form."

THE SITE NAMES NO OTHER CATEGORY AT ALL, and that is a deliberate change from the
earlier draft. It used to carry a "Cosmetics & skincare" card, an FAQ answering
"Do you do cosmetics labelling?" and an About paragraph calling cosmetics the
category makers ask for most. Every one of those sentences was true, and every one
of them put a second category in the reader's head on the two highest traffic pages
on the site. The rule now is ABSENCE, NOT DENIAL: a refusal to label cosmetics is
still the site talking about cosmetics.

`src/content/copy-honesty.test.ts` enforces it — see the third register, "no surface
names a category Batchlabel does not label", which bans the words on every copy
surface and carries a non-vacuity test built from the exact strings that shipped.

This matters more than it looks. The site's one real advantage over a compliance
consultant is that people believe it. A "coming soon" badge on a category nobody
has written a line of code for spends that credibility for nothing.

**Rules for any copy about categories:**

- Never say a category is coming, next, in build, in beta, or launching.
- Never give a date, a quarter, or a countdown.
- **The site describes the finished product.** Reversed by Rhys on 5 August 2026,
  deliberately and after being shown the trade-off: "the www represents what the
  app WILL do, not the app's current functionality." Naming a capability the build
  does not yet have is now correct on the marketing pages.
- **Except about money.** What a plan includes, what it costs, what is refunded and
  what is metered are statements about the contract somebody is about to enter, not
  about the product's direction. `src/content/copy-honesty.test.ts` still enforces
  those four and its header explains why. The Consultant tier is the live example:
  it may not be sold on capabilities it does not grant, because that sentence is
  the only stated reason to pay £164 a month more than Studio.
- **Home fragrance, not candles.** Candles, wax melts, reed diffusers and room
  sprays are all first-class, in the `<h1>`, the titles, the schema and the FAQ. A
  wax melt seller should not have to work out whether the product is for her.

**Rules for any copy about capabilities:**

The same discipline, for the same reason, and it is the one that keeps failing.
Four claims with no mechanism — downloading a label, unlimited reprints, placing
your own logo, archived SKUs not counting — shipped through a green test suite
because the guard only knew the previous audit's exact strings.

- Say what the software does today. Nothing about what it will do.
- If a customer would reasonably expect it and it does not exist, it goes in
  `src/content/availability.ts` and is rendered under a heading that says it is
  not available. There is no third option.
- A capability named without that disclaimer beside it is being sold. The general
  register in `src/content/copy-honesty.test.ts` enforces exactly that, on every
  copy surface, by shape rather than by wording.
- Verify against the product app before writing, not after. Every one of the four
  took a single grep to disprove.

## There is no category list any more

`src/content/verticals.ts` is deleted. `src/content/product-forms.ts` replaces it,
and the replacement is a change of subject rather than a rename.

The old file was a ladder: a `status` of `live` or `idea`, a `statusLabel`, an
`activeVerticals` / `plannedVerticals` split, and — after cosmetics and electronics
went — exactly two entries. The survivor was "Wider consumer goods", an `idea` card
covering household products, detergents and food contact items with no work behind
it. It survived the sweep by being neither cosmetics nor electronics, not by being
closer to real.

Dropping it left the homepage section rendering one live card in a two-column grid
above a dashed "further off, and not started" box containing nothing. A section
whose entire structure exists to compare had one thing to compare with nothing, and
an empty dashed box is an invitation to wonder what used to be in it.

**So the section changed subject.** The question it now answers is the one a maker
actually arrives with — *will this handle what I make* — and the unit is the product
form, not the vertical:

| Product form | What is specific about it |
|---|---|
| Container candles | Load in the finished wax, not the neat oil. Candle safety wording. |
| Wax melts | Same calculation, safety wording written for a warmer not a flame. |
| Reed diffusers | Far higher load, so statements a candle never triggers. |
| Room sprays | Flammable base, and a precautionary statement for being sprayed. |

There is no status field, and adding one back would be a mistake: with nothing to
contrast against, "Available now" is a badge on everything. `coming-soon`,
`interest` and `idea` are all gone with the ladder, and the way to promise a date is
now to write a whole section rather than flip an enum, which is the point.

Every `changes` line in that file is traceable to a branch in `derive.ts` in the app
repo — the EN 15494 wording on candles and melts, the diffuser wording under GPSR,
the `P261` a room spray gets for being aerosolised. A sentence that cannot be traced
there does not belong in the file. This is the categories rule and the capabilities
rule meeting: the section is only worth its space because it says something true and
specific, and the moment it stops being checkable it is back to being a brochure.

## Where the product scope appears

Once on the homepage, in the "What we cover" section, and once on About, as the four
names alone. Not in the footer, not in the page metadata. The FAQ answers "What can I
label with Batchlabel?" in one sentence and stops. It says what Batchlabel covers; it
does not enumerate what it does not.

## SEO

Titles and descriptions lead with candle terms: candle, wax melt, reed diffuser,
room spray, CLP, safety data sheet. Keywords for any other category came out of the
metadata, because ranking for something you cannot sell wastes the click and the trust.

The homepage `<h1>` is unchanged: "Correct CLP labels for your candles, in minutes."

## Adding a category later

There is no longer a one-line way to do this, and that is deliberate. A second
category is a real event and it should cost a real edit.

It means: relaxing the copy-honesty category register, which bans the words outright
today; deciding whether `product-forms.ts` grows a grouping or gains a sibling;
rewriting the homepage section, because four product forms of one category and two
categories of several forms are not the same shape; hand-updating the "Which products
we cover" group in `src/content/faqs.ts`; and revisiting the `<h1>`, which says
"candles".

Do not reach for a `status` field to stage it. That is what the last one was, and a
category with a badge on it is a promise whether or not the badge says so.

## Open questions

1. ~~**Naming "wider consumer goods" at all.**~~ Cut. The site now names exactly one
   category and four product forms within it, and the copy-honesty register bans the
   words so it cannot drift back.
2. **Pricing across categories.** A four-step ladder metered by SKU today, priced
   from `src/lib/plans.ts`. Same ladder when a second category arrives, or a
   separate line?
4. **How prominent Orchestrate should be.** It appears on About only.
5. **The name.** `batchlabel.co.uk` and a candle-heavy label preview both assume
   fragrance. Fine for now, worth revisiting if a second category ever lands.
