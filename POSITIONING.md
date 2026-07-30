# Positioning

Why the site is structured the way it is, and what it is allowed to claim.

## What Batchlabel does

Turn the safety data sheet from a fragrance supplier into a UK and EU CLP label
that a small maker can print.

```
supplier safety data sheet  ->  your recipe and pack size  ->  print ready label
```

That is the whole product. It works for candles, wax melts, reed diffusers and
room sprays.

## What it does not do

Nothing else. Cosmetics is not built. Wider consumer goods and electronics are not
built. No category outside candles and home fragrance has been started.

This matters more than it looks. The site's one real advantage over a compliance
consultant is that people believe it. A "coming soon" badge on a category nobody
has written a line of code for spends that credibility for nothing.

**Rules for any copy about categories:**

- Never say a category is coming, next, in build, in beta, or launching.
- Never give a date, a quarter, or a countdown.
- Naming a direction is fine. Promising it is not.
- Candles stays the lead everywhere: the `<h1>`, the label preview, the funnel,
  the SEO. It is the only thing that works and the only thing that pays.

## The category list

`src/content/verticals.ts` is the single source of truth. The homepage categories
section and the About page both render from it, so they cannot drift apart.

| Category | Status | What that means |
|---|---|---|
| Candles & home fragrance | `live` | Built. You can label this today. |
| Cosmetics & skincare | `interest` | Not built, not started. We collect interest and nothing else. |
| Wider consumer goods | `idea` | Named out loud. No work has happened. |
| Electronics & batteries | `idea` | Named out loud. No work has happened. |

The status names are deliberate. `coming-soon` was the old value for cosmetics and
it was the wrong word, so it is gone. If someone later wants to promise a date, they
have to add a new status to do it, which is the point.

## Where the multi-category story appears

Once on the homepage, in the hero subhead and the categories section. Once on
About. Not in the footer, not in the page metadata, and not in the FAQ beyond a
straight "no, and here is why".

The earlier draft said the same "one engine, many categories" idea in five places.
Three of them are gone. The reader only needs it once.

## SEO

Titles and descriptions lead with candle terms: candle, wax melt, reed diffuser,
room spray, CLP, safety data sheet. Cosmetics keywords came out of the metadata,
because ranking for something you cannot sell wastes the click and the trust.

The homepage `<h1>` is unchanged: "Correct CLP labels for your candles, in minutes."

## Adding a category later

Edit the entry in `src/content/verticals.ts`. Move it to `status: 'live'`, change
`statusLabel` to "Available now", and point the CTA at `/sign-up`. The homepage
section and the About list follow automatically.

The FAQ answers in `src/content/faqs.ts` are hand-written, so update the "Which
products we cover" group by hand at the same time. Three answers there currently
say a category does not exist. They will be wrong the day one does.

## Open questions

1. **Cosmetics interest capture.** The CTA is a `mailto:` today. Worth a real list
   before it gets any traffic?
2. **Naming electronics at all.** It is two categories past anything real. Keep it
   on the page or cut it?
3. **Pricing across categories.** One plan at £14 a month today. Same plan when a
   second category arrives, or a separate line?
4. **How prominent Orchestrate should be.** It appears on About only.
5. **The name.** `batchlabel.co.uk` and a candle-heavy label preview both assume
   fragrance. Fine for now, worth revisiting if a second category ever lands.
