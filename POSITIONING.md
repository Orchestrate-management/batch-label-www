# Positioning: from candle labels to a compliance labelling platform

This document is the rationale behind the content and information-architecture
refactor on the `content-refactor` branch. It explains how the site is being
repositioned for a multi-category future **without weakening the candle
conversion path or its SEO**.

---

## 1. The core value proposition (category-agnostic)

> **Turn the safety and regulatory data behind a product into a print ready,
> compliant label in minutes.**

The mechanics Batchlabel already ships are not candle-specific. The flow is:

```
source document (data)  ->  your recipe / pack details  ->  compliant, print ready label
```

For candles that source document is a **fragrance supplier safety data sheet** and
the frame is **UK/EU CLP**. Swap the input document and the regulatory frame and the
same engine serves cosmetics, then wider consumer goods, then technical products. The
refactor makes this already-true fact *legible* on the site.

This is deliberately **not** "we label everything". Over-broad positioning converts
worse. The promise is specific (data in, correct label out) with a concrete first
vertical (candles) and a credible, ordered roadmap.

## 2. The category ladder

Codified in `src/content/verticals.ts` as the single source of truth:

| Category | Status | Input | Frame |
|---|---|---|---|
| **Candles & home fragrance** | `live` | Fragrance supplier SDS | UK/EU CLP |
| **Cosmetics & skincare** | `coming-soon` (waitlist) | Ingredient & product info | UK/EU Cosmetics Regulation |
| **Wider consumer goods** | `planned` | Product safety/regulatory data | Category-specific rules |
| **Electronics & batteries** | `planned` | Conformity & technical docs | CE/UKCA, WEEE, battery rules |

Candles stay first-class everywhere. Cosmetics is the one active "next" bet (it has a
waitlist CTA). CPG and electronics are shown only as a lighter "where this is heading"
row, so the roadmap is visible but not oversold.

## 3. Messaging framework

**Broaden the frame, don't bury the lead.**

- **Lead with candles, always.** The homepage `<h1>` is unchanged
  ("Correct CLP labels for your candles, in minutes."), the label preview is still a
  candle, the problem story is still the candle-maker's late-night regulation-reading,
  and the whole funnel (sign-up, pricing, dashboard empty state) stays candle-concrete.
  Candles are the paying use case and the SEO anchor.
- **Then widen, once.** Immediately after the concrete candle story (hero subhead, a new
  homepage categories section, About), the copy names the bigger idea: one engine,
  many categories, cosmetics next.
- **Stay honest.** The brand voice is warm, plain-English, British, small-maker-friendly.
  The multi-category framing is written as a natural expansion of the candle origin
  story, not a corporate pivot. The "honest limits" promise (labelling only, we do not
  certify) is explicitly extended to *every* category, not just candles.

## 4. Extensible information architecture

The design now treats "which products we cover" as **data, not layout**.

- `src/content/verticals.ts` exports the typed `verticals` array plus `coreValueProp`,
  `activeVerticals` and `plannedVerticals` helpers.
- `src/components/home/Verticals.tsx` renders the homepage categories section from that
  data: live/coming-soon categories become cards (with status-appropriate CTAs), planned
  ones render as a lighter roadmap row.
- `src/pages/About.tsx` renders the category ladder from the *same* array, so the story
  and the site can never drift out of sync.

Adding or promoting a category is a content edit, not a rebuild (see section 6).

## 5. Sections changed, and why

| File | Change | Why |
|---|---|---|
| `src/content/verticals.ts` | **New** category config + core value prop | Data-driven verticals; single source of truth |
| `src/components/home/Verticals.tsx` | **New** homepage categories section | Makes the platform visible after the candle lead |
| `src/pages/Home.tsx` | Insert `<Verticals />`; broaden meta description | New section in the narrative; broaden keywords without dropping candle terms |
| `src/components/home/Hero.tsx` | Keep candle `<h1>`; add one platform sentence to the subhead | Platform visible in the hero; candle lead and SEO anchor untouched |
| `src/components/home/HowItWorksSteps.tsx` | Add a lead framing the flow as general, candles as the worked example | Reframes the 3-step flow as category-agnostic |
| `src/pages/HowItWorks.tsx` | Reframe hero title/intro + meta to "source document -> label", candles as worked example | Generalises the flow; keeps candle walkthrough intact |
| `src/pages/About.tsx` | Add Orchestrate mission + data-driven category ladder; keep origin story | This is the multi-category ambition, told in brand voice |
| `src/content/faqs.ts` | New "Which products we cover" FAQ group; broaden coverage answers | Answers cosmetics/CPG/electronics intent; captures waitlist |
| `src/pages/Faq.tsx` | Broaden meta description | Broaden keywords |
| `src/components/layout/SiteFooter.tsx` | Broaden tagline to "compliance labelling ... candles today, more categories on the way" | Site-wide platform signal |

**Deliberately left candle-concrete** (to protect conversion and SEO): the homepage
`<h1>`, the `LabelPreview`, `ProblemCards`, `Testimonials`, and the entire funnel
(`SignUp`, `Pricing`, `CheckEmail`, dashboard `Labels`). Legal copy untouched.

### Before / after, key messaging

- **Hero subhead** — *added:* "The same engine that gets candle labels right is built to
  extend across categories. Candles and home fragrance today, cosmetics labelling coming
  next." (H1 unchanged.)
- **Homepage** — *added* a "Who it is for" section: **Candles & home fragrance —
  Available now** (primary CTA) and **Cosmetics & skincare — Coming next** (waitlist CTA),
  plus a roadmap row for wider CPG and electronics.
- **How it works** — *"From supplier PDF to printed label"* -> *"From source document to
  printed label"*, framed as the same three steps for any category, walked through with
  candles.
- **About** — *"a small UK company making CLP labelling manageable for candle makers"* ->
  Batchlabel as **the first product from Orchestrate**, a compliance labelling platform,
  with an explicit, ordered category ladder and the honest-scope promise applied to all
  categories.
- **FAQ** — new questions: *Which product categories can I label today? / Do you do
  cosmetics labelling? / Will this work for other products like CPG or electronics?*

## 6. How to add (or promote) a category later

It is a **data change** in `src/content/verticals.ts`. No component rebuild.

**To promote Cosmetics from waitlist to live**, edit its entry:

```ts
{
  id: 'cosmetics',
  name: 'Cosmetics & skincare',
  status: 'live',                 // was 'coming-soon'
  statusLabel: 'Available now',   // was 'Coming next'
  // ...
  cta: { label: 'Make a label free', to: '/sign-up', location: 'verticals_cosmetics' }
}
```

The homepage categories section, the About ladder and the derived `activeVerticals` /
`plannedVerticals` lists all update automatically.

**To add a brand-new category**, append an object to the `verticals` array with a unique
`id`, a `status`, its `inputName`, `regulation`, `examples` and an optional `cta`. It
appears on the homepage and the About ladder immediately. FAQ entries in
`src/content/faqs.ts` are still hand-written prose (they carry nuance a config cannot),
so update the "Which products we cover" group when a category's status changes.

## 7. SEO notes

- Candle terms are **kept**, never replaced. Titles/descriptions still lead with
  "candle", "wax melt", "CLP".
- Descriptions are **broadened** with "compliance labelling", "cosmetics" and category
  language so cosmetics-intent traffic has something to match, without orphaning
  candle-intent traffic.
- The homepage `<h1>` (the strongest on-page signal) is unchanged.

## 8. Open questions for the founder

1. **Cosmetics waitlist plumbing.** The waitlist CTA is a `mailto:` today (no backend
   change, respects the "don't touch the funnel" guardrail). Do you want a real
   waitlist form / list capture before this ships?
2. **Cosmetics timing claim.** Copy says cosmetics is "in build now / next". Is that
   accurate enough to publish, or should it read softer ("exploring")?
3. **Pricing across categories.** Pricing copy stays candle-flavoured and single-plan
   (£14/mo). When cosmetics launches, is it the same plan/price, or a separate line?
4. **Brand architecture.** Is the public story "Batchlabel, expanding into more
   categories", or "Orchestrate, with Batchlabel as its first product"? The site
   currently says the latter on About only. Confirm how prominent "Orchestrate" should
   be site-wide.
5. **Electronics on the roadmap.** Naming electronics this early is a strong signal. Keep
   it visible, or hold it back until cosmetics has shipped?
6. **Domain / naming.** If the platform grows well beyond fragrance, does the
   `batchlabel.co.uk` name and the candle-heavy `LabelPreview` need a longer-term rethink?
   (Out of scope here; flagging it.)
