# Site copy

Every piece of copy a visitor can read on www.batchlabel.xyz, in the order they meet it.
Home first, then the rest of the marketing pages, then the account flow, then the legal
documents, then the parts that sit on every page.

This file is written to be edited and handed back. Each entry has a key like
`home.hero.headline`. The same key is in `docs/copy-manifest.json` next to the file and
line the string came from, so a returned edit can be put back where it belongs without
anyone guessing.

---

## How to hand this back

Edit the text inside the `>` blocks. That is the copy. Everything else is scaffolding.

**Please do:**

- Keep every `` `key` `` exactly as it is. The key is how an edit finds its way home.
- Reorder sections, add comments, add headings, leave notes to yourself. None of that
  breaks anything.
- Mark an entry you want deleted rather than deleting the block. Write `DELETE:` and why,
  above the quote. A missing block reads as "no change" and will be skipped.
- Add a new string as a new block with a key of `NEW:` and a short description of where it
  should go. It cannot be applied automatically, but it will not be lost.
- Say when you are unsure. A note like `not sure this is still true` is more useful than a
  guess.

**Please do not:**

- Change a key, or move a key onto a different block.
- Delete an entry block.
- Split one quote into several, or merge two quotes into one. If a sentence needs to
  become two, write it as one block and say so in a note.
- Edit anything marked **legal**, **consent** or **structured data** without meaning to.
  Each of those carries a consequence, set out below.

When it comes back, each entry is matched by key, checked against the string the manifest
recorded, and replaced only if the file still says what the manifest expects. Anything
that has moved in the meantime is reported rather than overwritten.

---

## Before you change anything

Six things constrain this copy. They are not style preferences. Each one was a decision.

### 1. The voice is written down

`VOICE.md` at the root of the repo is the agreed voice, and it was arrived at
deliberately. Plain British English. Short sentences. Name a real thing — a document, a
regulation, a number. Say it once. One adjective beats three.

Banned: hollow antithesis ("It's not just X, it's Y"), "Whether you're..." openers,
rule-of-three padding, rhetorical questions as headings, em dashes and colons in
headlines. Banned words include seamless, effortless, unlock, empower, streamline,
robust, leverage, "peace of mind", "designed to", "simply" and "easily".

`VOICE.md` also records several before-and-after pairs. Those are corrections, not drafts.
Rewriting one back to its earlier form would undo a decision.

### 2. Candles is the only category

Candles and home fragrance is the **only live category**. Cosmetics, wider consumer goods
and electronics are directions the company has named out loud. None of them is built.

There are **no dates and no "coming soon"** anywhere, and that was a deliberate
correction: the site's one real advantage over a compliance consultant is that people
believe it. Copy must not reintroduce a claim that anything but candles is available.
`POSITIONING.md` has the full rule. `src/content/verticals.ts` is the single source of
truth, and both the home page and /about render from it, so they cannot drift apart.

Entries this applies to are marked *Must stay true*.

### 3. The legal pages are version-stamped

`/terms`, `/privacy`, `/cookie-policy` and `/acceptable-use` are legally operative.

The terms are also **versioned**. `src/lib/agreements.ts` records which version of the
Terms of Service each customer accepted, and writes it to an append-only audit trail. The
version on file today is `2026-07-30.2`. If the wording changes, the version must be
bumped — and from that point every existing acceptance refers to wording that is no longer
on the site. That is what the version field is for, so it is workable, but it has to be a
decision rather than a side effect of tidying a sentence.

**Changing any of the four has legal and audit consequences. Recommendation: leave them
alone unless you are deliberately revising them, with advice.** They are in this file so
you can read what is live, not because they are an easy win.

### 4. The consent wording is compliance-sensitive

The sign-up checkboxes and the cookie banner are governed the same way as the terms. Each
consent is a versioned record — Terms of Service, Marketing emails, Advertising and
retargeting — and what a person saw on screen is stored with what they agreed to.

The cookie banner's marketing toggle is the **only** place advertising consent is asked
anywhere, on the site or in the account area. The account screen deliberately shows the
answer and sends people back to the banner to change it, because two controls writing the
same flag is how the two records disagreed in the first place. Copy that describes this
has to keep describing what actually happens.

Same treatment as the legal pages: change it on purpose or not at all.

### 5. The FAQ answers are structured data

The `FAQPage` JSON-LD on the home page, /pricing and /faq is generated from
`src/content/faqs.ts` — the same array the accordions render. Answers are plain strings
rather than formatted text for exactly this reason: the markup cannot drift from what a
reader sees.

So editing an FAQ answer changes what Google and answer engines are told about
Batchlabel. That is a reason to edit carefully, not a reason not to. The three steps on
/how-it-works feed `HowTo` markup the same way.

### 6. Pricing figures live in three places at once

£14 a month, £140 a year, VAT included. Those numbers are in this copy, in Stripe, and in
the `SoftwareApplication` structured data.

**Changing the words does not change the price.** A customer is charged what Stripe says.
If a price moves, Stripe, the structured data and every sentence below has to move
together, or the site advertises one number and bills another. The sentences carrying a
price are: `pricing.meta.title`, `pricing.meta.description`, `pricing.hero.intro`,
`pricing.faq.q1.answer`, `about.values.card3.body`,
`dashboard.account.plan.upgrade_blurb`, `legal.terms.s5.item2` and `llms.pricing.maker`.
Only the number on the pricing card itself is read from code.

---

## How to read an entry

    **What it is** · `the.key` · <source file and line>

    > The copy.

    - *Length:* SEO titles and meta descriptions only. A title is shown twice: on its own,
      and again with ` | Batchlabel` appended, because that is what the browser tab and
      the search result show. The limits are roughly 60 characters for a full title and
      155 for a description, which is where Google starts truncating.
    - *Appears on:* the pages this string is seen on, when it is more than one.
    - *Shared:* the same string exists in several files. One edit means all of them.
    - *Must stay true:* a fact, a legal position or a cross-reference the wording carries.
    - *Split:* the sentence is stored in fragments either side of a link.
    - *Note:* anything else worth knowing.

Where a string appears more than once, the manifest lists every file and line. Do not
assume a button label is local.

---

## Contents

- [Home](#home) (`/`) — 130 entries
- [How it works](#how-it-works) (`/how-it-works`) — 30 entries
- [Pricing](#pricing) (`/pricing`) — 52 entries
- [FAQ](#faq) (`/faq`) — 46 entries
- [About](#about) (`/about`) — 21 entries
- [Contact](#contact) (`/contact`) — 21 entries
- [Sign up, log in and password](#sign-up-log-in-and-password) — 88 entries
- [Checkout](#checkout) — 15 entries
- [Dashboard](#dashboard) — 64 entries
- [Legal](#legal) — 128 entries
- [Site-wide](#site-wide) — 101 entries
- [Coverage](#coverage)
- [What was deliberately not extracted](#what-was-deliberately-not-extracted)
- [Flagged while extracting](#flagged-while-extracting)

---

## Home

`/`

The page a visitor meets first, in the order the sections appear down the page: hero, trust strip, the problem, three steps, what goes on the label, categories, testimonials, FAQ, closing call to action.

The closing call to action is shared across four pages and lives in **Site-wide → Closing call to action band**.

### Page metadata

`index.html` carries a static copy of the home title and description for crawlers that do not run JavaScript (Facebook, LinkedIn, Slack, X). **Edit both or link previews go stale.** In `index.html` the description text appears three times (description, og:description, twitter:description) and the title twice more (og:title, twitter:title).

**SEO title** · `home.meta.title` · <sub>src/pages/Home.tsx:16</sub>

> CLP labels for candle and wax melt makers

- *Length:* 41 characters, 54 once ` | Batchlabel` is appended. That is within the practical limit of 60.
- *Appears on:* /.

**Meta description** · `home.meta.description` · <sub>src/pages/Home.tsx:18</sub>

> Turn your fragrance supplier's safety data sheet into a print ready UK and EU CLP label for candles, wax melts, diffusers and room sprays. First label free.

- *Length:* 156 characters. That is **over** the practical limit of 155.
- *Appears on:* /.
- *Must stay true:* 'First label free' must match the Free plan on /pricing.

**SEO title, no-JavaScript copy** · `home.meta.title.no_js` · <sub>index.html:29</sub>

> CLP labels for candle and wax melt makers | Batchlabel

- *Note:* Also repeated as og:title and twitter:title in the same file.

**Meta description, no-JavaScript copy** · `home.meta.description.no_js` · <sub>index.html:31</sub>

> Turn your fragrance supplier's safety data sheet into a print ready UK and EU CLP label for candles, wax melts, diffusers and room sprays. First label free.

- *Note:* Also repeated as og:description and twitter:description in the same file.

### Hero

**Badge above the headline** · `home.hero.badge` · <sub>src/components/home/Hero.tsx:17</sub>

> For small batch makers in the UK and EU

**Headline (h1)** · `home.hero.headline` · <sub>src/components/home/Hero.tsx:20</sub>

> Correct CLP labels for your candles, in minutes.

- *Note:* Echoed in the social share image alt text, `seo.og_image_alt`. Keep them in step.

**Sub-headline** · `home.hero.body` · <sub>src/components/home/Hero.tsx:23</sub>

> Upload the safety data sheet from your fragrance supplier, enter how much fragrance is in the product and how big the pack is, then download a print ready label.

- *Must stay true:* Describes the three steps on /how-it-works. If the steps change, this changes.

**Scope note under the sub-headline** · `home.hero.scope` · <sub>src/components/home/Hero.tsx:27</sub>

> Candles and home fragrance is the only category we cover. We would like to add more, but nothing else is built yet.

- *Must stay true:* Category rule (point 2 above). Candles is the only live category, no dates and no "coming soon".

**Reassurance 1** · `home.hero.reassurance.1` · <sub>src/components/home/Hero.tsx:6</sub>

> First label free, no card

**Reassurance 2** · `home.hero.reassurance.2` · <sub>src/components/home/Hero.tsx:7</sub>

> Candles, wax melts, reed diffusers and room sprays

- *Must stay true:* Category rule (point 2 above). Candles is the only live category, no dates and no "coming soon".

**Reassurance 3** · `home.hero.reassurance.3` · <sub>src/components/home/Hero.tsx:8</sub>

> UK and EU CLP wording

**Secondary button** · `home.hero.cta_secondary` · <sub>src/components/home/Hero.tsx:43,45</sub>

> See how it works

- *Note:* Appears twice in the file: once as the visible label, once as the analytics `track.label`. Change both.

### Example label preview

A worked example of the output, rendered three times: in the home hero, in 'Everything that goes on the label' below, and on /how-it-works. It is illustrative, not a real customer's label — the business name, address, UFI and batch code are invented.

**Product name** · `preview.product_name` · <sub>src/components/LabelPreview.tsx:23</sub>

> Sea Salt and Sage

**Product description** · `preview.product_meta` · <sub>src/components/LabelPreview.tsx:25</sub>

> Scented soy candle, 180 g

**Supplier name** · `preview.supplier` · <sub>src/components/LabelPreview.tsx:28</sub>

> Willow & Wick

- *Note:* The same invented business name is the placeholder in the sign-up form.

**Supplier address** · `preview.address` · <sub>src/components/LabelPreview.tsx:30</sub>

> Leeds, LS7 3PB, UK

**Pictogram 1, alt text** · `preview.pictogram_1_alt` · <sub>src/components/LabelPreview.tsx:35</sub>

> Exclamation mark hazard pictogram

**Pictogram 2, alt text** · `preview.pictogram_2_alt` · <sub>src/components/LabelPreview.tsx:36</sub>

> Environment hazard pictogram

**Signal word** · `preview.signal_word` · <sub>src/components/LabelPreview.tsx:37</sub>

> Warning

**Hazard statements, label** · `preview.hazard_label` · <sub>src/components/LabelPreview.tsx:42</sub>

> Hazard statements

**Hazard statements, text** · `preview.hazard_body` · <sub>src/components/LabelPreview.tsx:44</sub>

> H315 Causes skin irritation. H317 May cause an allergic skin reaction. H319 Causes serious eye irritation. H411 Toxic to aquatic life with long lasting effects.

- *Must stay true:* These are official CLP H-phrases. The wording is set by regulation, not by us.

**Precautionary statements, label** · `preview.precautionary_label` · <sub>src/components/LabelPreview.tsx:49</sub>

> Precautionary statements

**Precautionary statements, text** · `preview.precautionary_body` · <sub>src/components/LabelPreview.tsx:51</sub>

> P101 If medical advice is needed, have product container or label to hand. P102 Keep out of reach of children. P280 Wear protective gloves. P302+P352 IF ON SKIN: wash with plenty of water. P305+P351+P338 IF IN EYES: rinse cautiously with water for several minutes. P273 Avoid release to the environment. P501 Dispose of contents and container in accordance with local regulations.

- *Must stay true:* These are official CLP P-phrases. The wording is set by regulation, not by us.

**Allergens, label** · `preview.contains_label` · <sub>src/components/LabelPreview.tsx:59</sub>

> Contains

**Allergens, text** · `preview.contains_body` · <sub>src/components/LabelPreview.tsx:61</sub>

> Linalool, Citronellol, Geraniol, Limonene, Coumarin. May produce an allergic reaction.

**UFI line** · `preview.ufi` · <sub>src/components/LabelPreview.tsx:67</sub>

> UFI: 4W7C-P0Q9-T00J-VXRK

**Batch line** · `preview.batch` · <sub>src/components/LabelPreview.tsx:68</sub>

> Batch: 26-04-A

**Candle safety wording** · `preview.safety` · <sub>src/components/LabelPreview.tsx:69</sub>

> Burn within sight. Keep away from draughts.

**Caption under the preview** · `preview.caption` · <sub>src/components/LabelPreview.tsx:73</sub>

> Example output. Your wording comes from your supplier safety data sheet and the recipe you enter.

### Trust strip

**Regulation sentence** · `home.trust.body` · <sub>src/components/home/TrustStrip.tsx:15</sub>

> Labels are built against UK CLP and EU CLP, that is Regulation 1272/2008 on Classification, Labelling and Packaging.

- *Must stay true:* Regulation 1272/2008 is the EU CLP Regulation. Do not change the number.

**Chip 1** · `home.trust.chip.1` · <sub>src/components/home/TrustStrip.tsx:3</sub>

> Hazard pictograms

**Chip 2** · `home.trust.chip.2` · <sub>src/components/home/TrustStrip.tsx:4</sub>

> Hazard statements

**Chip 3** · `home.trust.chip.3` · <sub>src/components/home/TrustStrip.tsx:5</sub>

> Precautionary statements

**Chip 4** · `home.trust.chip.4` · <sub>src/components/home/TrustStrip.tsx:6</sub>

> Allergen declarations

**Chip 5** · `home.trust.chip.5` · <sub>src/components/home/TrustStrip.tsx:7</sub>

> UFI

### The problem

**Eyebrow** · `home.problem.eyebrow` · <sub>src/components/home/ProblemCards.tsx:21</sub>

> The bit nobody enjoys

**Heading** · `home.problem.heading` · <sub>src/components/home/ProblemCards.tsx:22</sub>

> Labelling is where good products get stuck

**Lead** · `home.problem.lead` · <sub>src/components/home/ProblemCards.tsx:24</sub>

> You did not start making candles so you could read regulations at eleven at night.

**Card 1, title** · `home.problem.card1.title` · <sub>src/components/home/ProblemCards.tsx:5</sub>

> Getting it wrong is expensive

**Card 1, body** · `home.problem.card1.body` · <sub>src/components/home/ProblemCards.tsx:6</sub>

> A missing hazard statement can get a listing pulled from Etsy or Shopify, and Trading Standards can fine you. Most makers only find out when the email lands.

- *Must stay true:* Names Etsy, Shopify and Trading Standards, and asserts they can fine you. Keep it accurate.

**Card 2, title** · `home.problem.card2.title` · <sub>src/components/home/ProblemCards.tsx:9</sub>

> Consultants charge per fragrance

**Card 2, body** · `home.problem.card2.body` · <sub>src/components/home/ProblemCards.tsx:10</sub>

> A one off assessment often costs more than a whole market stall takes in a day. Add a new scent and you pay again, then again when the supplier reformulates.

**Card 3, title** · `home.problem.card3.title` · <sub>src/components/home/ProblemCards.tsx:13</sub>

> Spreadsheets break quietly

**Card 3, body** · `home.problem.card3.body` · <sub>src/components/home/ProblemCards.tsx:14</sub>

> Change the fragrance load from 8 per cent to 10 per cent and half the formulas are wrong, but the sheet still prints something that looks fine.

### Three steps

The short version. The long version on /how-it-works is written separately in `src/pages/HowItWorks.tsx`, and the three step titles are currently word for word identical in both files. Changing one does not change the other.

**Eyebrow** · `home.steps.eyebrow` · <sub>src/components/home/HowItWorksSteps.tsx:26</sub>

> Three steps

**Heading** · `home.steps.heading` · <sub>src/components/home/HowItWorksSteps.tsx:27</sub>

> How Batchlabel works

**Lead** · `home.steps.lead` · <sub>src/components/home/HowItWorksSteps.tsx:29</sub>

> About ten minutes the first time, a couple of minutes after that.

- *Must stay true:* Repeated on /faq ('How long does the first label take?') and in the sign-up intro.

**Step counter** · `home.steps.counter` · <sub>src/components/home/HowItWorksSteps.tsx:37</sub>

> Step 1, Step 2, Step 3

- *Note:* Generated. The word 'Step' is the only editable part.

**Step 1, title** · `home.steps.1.title` · <sub>src/components/home/HowItWorksSteps.tsx:8</sub>

> Upload your supplier safety data sheet

**Step 1, body** · `home.steps.1.body` · <sub>src/components/home/HowItWorksSteps.tsx:9</sub>

> Drop in the PDF your fragrance oil supplier gave you. We read the classification, the hazard statements and the allergens out of it.

**Step 2, title** · `home.steps.2.title` · <sub>src/components/home/HowItWorksSteps.tsx:13</sub>

> Enter your fragrance percentage and pack size

**Step 2, body** · `home.steps.2.body` · <sub>src/components/home/HowItWorksSteps.tsx:14</sub>

> Tell us how much fragrance is in the product and how big the pack is. Save it as a recipe and reuse it for every batch.

**Step 3, title** · `home.steps.3.title` · <sub>src/components/home/HowItWorksSteps.tsx:18</sub>

> Download your print ready label

**Step 3, body** · `home.steps.3.body` · <sub>src/components/home/HowItWorksSteps.tsx:19</sub>

> Check the preview, then download a PDF at true size or an SVG for your printer. Pictograms and minimum text sizes are set for you.

### Everything that goes on the label

The eleven bullets are exported from `WhatsIncluded.tsx` and re-used on /how-it-works under 'What ends up on the label'. One edit changes both pages.

**Eyebrow** · `home.included.eyebrow` · <sub>src/components/home/WhatsIncluded.tsx:24</sub>

> What is included

**Heading** · `home.included.heading` · <sub>src/components/home/WhatsIncluded.tsx:25</sub>

> Everything that goes on the label

**Lead** · `home.included.lead` · <sub>src/components/home/WhatsIncluded.tsx:27</sub>

> Every line comes from your safety data sheet or from your recipe.

**Bullet 1** · `home.included.item.1` · <sub>src/components/home/WhatsIncluded.tsx:6</sub>

> Product name and pack size, with net weight or volume

- *Appears on:* /, /how-it-works.

**Bullet 2** · `home.included.item.2` · <sub>src/components/home/WhatsIncluded.tsx:7</sub>

> Hazard pictograms at the required minimum size

- *Appears on:* /, /how-it-works.

**Bullet 3** · `home.included.item.3` · <sub>src/components/home/WhatsIncluded.tsx:8</sub>

> The signal word, Warning or Danger, where one applies

- *Appears on:* /, /how-it-works.

**Bullet 4** · `home.included.item.4` · <sub>src/components/home/WhatsIncluded.tsx:9</sub>

> Hazard statements, the H codes, in full sentences

- *Appears on:* /, /how-it-works.

**Bullet 5** · `home.included.item.5` · <sub>src/components/home/WhatsIncluded.tsx:10</sub>

> Precautionary statements, the P codes, chosen and combined

- *Appears on:* /, /how-it-works.

**Bullet 6** · `home.included.item.6` · <sub>src/components/home/WhatsIncluded.tsx:11</sub>

> Allergen declarations from the fragrance, such as linalool and limonene

- *Appears on:* /, /how-it-works.

**Bullet 7** · `home.included.item.7` · <sub>src/components/home/WhatsIncluded.tsx:12</sub>

> A generated UFI, that is a Unique Formula Identifier, for poison centre notification

- *Appears on:* /, /how-it-works.
- *Must stay true:* UFI generation is a Maker plan feature on /pricing. This list does not say so.

**Bullet 8** · `home.included.item.8` · <sub>src/components/home/WhatsIncluded.tsx:13</sub>

> Batch code and date fields you can fill per batch

- *Appears on:* /, /how-it-works.
- *Must stay true:* Batch code fields are a Maker plan feature on /pricing. This list does not say so.

**Bullet 9** · `home.included.item.9` · <sub>src/components/home/WhatsIncluded.tsx:14</sub>

> Your business name, address and contact details as the supplier

- *Appears on:* /, /how-it-works.

**Bullet 10** · `home.included.item.10` · <sub>src/components/home/WhatsIncluded.tsx:15</sub>

> Candle and diffuser safety wording, such as burn within sight

- *Appears on:* /, /how-it-works.

**Bullet 11** · `home.included.item.11` · <sub>src/components/home/WhatsIncluded.tsx:16</sub>

> CLP text set at the minimum size your pack size requires

- *Appears on:* /, /how-it-works.

### Categories

**This is the section the category rule exists for.** The four category records live in `src/content/verticals.ts` and are the single source of truth. The same records render the ladder on /about, so an edit lands on both pages. Only candles is `live`. Cosmetics is `interest`, wider consumer goods and electronics are `idea`. No status may imply a date.

**Eyebrow** · `home.verticals.eyebrow` · <sub>src/components/home/Verticals.tsx:84</sub>

> Categories

**Heading** · `home.verticals.heading` · <sub>src/components/home/Verticals.tsx:85</sub>

> What we cover, and what we do not

**Lead** · `home.verticals.lead` · <sub>src/components/home/Verticals.tsx:87</sub>

> Candles and home fragrance is the only category you can label with Batchlabel today. The rest of this is where we would like to go.

- *Must stay true:* Category rule (point 2 above). Candles is the only live category, no dates and no "coming soon".

**Regulation line, live category** · `home.verticals.regulation_live` · <sub>src/components/home/Verticals.tsx:52</sub>

> Built against UK CLP and EU CLP.

**Regulation line, other categories** · `home.verticals.regulation_other` · <sub>src/components/home/Verticals.tsx:53</sub>

> The rules involved: [regulation].

**Heading over the unstarted categories** · `home.verticals.further_off` · <sub>src/components/home/Verticals.tsx:101</sub>

> Further off, and not started

- *Must stay true:* Category rule (point 2 above). Candles is the only live category, no dates and no "coming soon".

**Candles, name** · `verticals.candles.name` · <sub>src/content/verticals.ts:46</sub>

> Candles & home fragrance

- *Appears on:* /, /about.

**Candles, status badge** · `verticals.candles.status` · <sub>src/content/verticals.ts:27,48</sub>

> Available now

- *Appears on:* /, /about.

**Candles, tagline** · `verticals.candles.tagline` · <sub>src/content/verticals.ts:49</sub>

> The category Batchlabel is built for.

- *Appears on:* /.

**Candles, description** · `verticals.candles.description` · <sub>src/content/verticals.ts:51</sub>

> Upload the safety data sheet from your fragrance supplier, enter your recipe and pack size, and download a UK and EU CLP label.

- *Appears on:* /, /about.

**Candles, regulation** · `verticals.candles.regulation` · <sub>src/content/verticals.ts:53</sub>

> UK CLP and EU CLP

- *Appears on:* /.

**Candles, the document you start from** · `verticals.candles.input` · <sub>src/content/verticals.ts:52</sub>

> fragrance supplier safety data sheet

- *Note:* Set on every category but not rendered anywhere. Kept in case a card ever says what you need to begin.

**Candles, example chips** · `verticals.candles.examples` · <sub>src/content/verticals.ts:54</sub>

> Candles / Wax melts / Reed diffusers / Room sprays

**Cosmetics, name** · `verticals.cosmetics.name` · <sub>src/content/verticals.ts:59</sub>

> Cosmetics & skincare

- *Appears on:* /, /about.

**Cosmetics, status badge** · `verticals.cosmetics.status` · <sub>src/content/verticals.ts:61</sub>

> Not built

- *Appears on:* /, /about.
- *Must stay true:* Category rule (point 2 above). Candles is the only live category, no dates and no "coming soon".

**Cosmetics, tagline** · `verticals.cosmetics.tagline` · <sub>src/content/verticals.ts:62</sub>

> The one makers ask us for most.

- *Appears on:* /.

**Cosmetics, description** · `verticals.cosmetics.description` · <sub>src/content/verticals.ts:64</sub>

> We have not started this and we will not give you a date. Tell us you want it and we will let you know if that changes. It would cover the label only, so it would never replace a Cosmetic Product Safety Report.

- *Appears on:* /, /about.
- *Must stay true:* Category rule (point 2 above). Candles is the only live category, no dates and no "coming soon".

**Cosmetics, regulation** · `verticals.cosmetics.regulation` · <sub>src/content/verticals.ts:66</sub>

> UK and EU cosmetics labelling rules

- *Appears on:* /.

**Cosmetics, the document you start from** · `verticals.cosmetics.input` · <sub>src/content/verticals.ts:65</sub>

> ingredient and product information

- *Note:* Not rendered.

**Cosmetics, example chips** · `verticals.cosmetics.examples` · <sub>src/content/verticals.ts:67</sub>

> Soaps / Balms & butters / Skincare / Bath products

**Cosmetics, button** · `verticals.cosmetics.cta` · <sub>src/content/verticals.ts:69</sub>

> Tell us you want this

- *Appears on:* /.
- *Note:* Opens an email to hello@batchlabel.co.uk with the subject 'Cosmetics labelling'.

**Wider consumer goods, name** · `verticals.cpg.name` · <sub>src/content/verticals.ts:76</sub>

> Wider consumer goods

- *Appears on:* /, /about.

**Wider consumer goods, status badge** · `verticals.cpg.status` · <sub>src/content/verticals.ts:78</sub>

> Idea

- *Appears on:* /about.
- *Note:* The badge only renders on /about; on the home page these two sit in the 'Further off' row without a badge.

**Wider consumer goods, tagline** · `verticals.cpg.tagline` · <sub>src/content/verticals.ts:79</sub>

> Named, not started.

- *Note:* Not currently rendered anywhere: only `live` and `interest` cards show a tagline.

**Wider consumer goods, description** · `verticals.cpg.description` · <sub>src/content/verticals.ts:81</sub>

> Household products, detergents and food contact items turn safety data into label copy too. Same problem, different rules.

- *Appears on:* /, /about.
- *Must stay true:* Category rule (point 2 above). Candles is the only live category, no dates and no "coming soon".

**Wider consumer goods, the document you start from** · `verticals.cpg.input` · <sub>src/content/verticals.ts:82</sub>

> product safety and regulatory data

- *Note:* Not rendered.

**Wider consumer goods, regulation** · `verticals.cpg.regulation` · <sub>src/content/verticals.ts:83</sub>

> category specific labelling rules

- *Note:* Not rendered: only the two top cards show a regulation line.

**Wider consumer goods, example chips** · `verticals.cpg.examples` · <sub>src/content/verticals.ts:84</sub>

> Household products / Food contact items / Detergents

- *Note:* Not currently rendered: chips only appear on the two cards at the top.

**Electronics, name** · `verticals.electronics.name` · <sub>src/content/verticals.ts:88</sub>

> Electronics & batteries

- *Appears on:* /, /about.

**Electronics, status badge** · `verticals.electronics.status` · <sub>src/content/verticals.ts:90</sub>

> Idea

- *Appears on:* /about.

**Electronics, tagline** · `verticals.electronics.tagline` · <sub>src/content/verticals.ts:91</sub>

> Named, not started.

- *Note:* Not currently rendered. Identical to `verticals.cpg.tagline`.

**Electronics, description** · `verticals.electronics.description` · <sub>src/content/verticals.ts:93</sub>

> Conformity marks, warnings and disposal wording, on products that carry a CE or UKCA mark.

- *Appears on:* /, /about.
- *Must stay true:* Category rule (point 2 above). Candles is the only live category, no dates and no "coming soon".

**Electronics, the document you start from** · `verticals.electronics.input` · <sub>src/content/verticals.ts:94</sub>

> conformity and technical documentation

- *Note:* Not rendered.

**Electronics, regulation** · `verticals.electronics.regulation` · <sub>src/content/verticals.ts:95</sub>

> CE and UKCA marking, WEEE and battery rules

- *Note:* Not rendered.

**Electronics, example chips** · `verticals.electronics.examples` · <sub>src/content/verticals.ts:96</sub>

> Consumer electronics / Batteries / Chargers

- *Note:* Not currently rendered.

### Testimonials

There are no testimonials. The section ships three empty cards that say so. This is deliberate — see VOICE.md, 'invented social proof'. If real quotes arrive they replace the placeholders; until then the placeholder copy is live copy that visitors read.

**Eyebrow** · `home.testimonials.eyebrow` · <sub>src/components/home/Testimonials.tsx:22</sub>

> Early days

**Heading** · `home.testimonials.heading` · <sub>src/components/home/Testimonials.tsx:23</sub>

> We would rather leave this blank than invent it

**Lead** · `home.testimonials.lead` · <sub>src/components/home/Testimonials.tsx:25</sub>

> Batchlabel is new. When makers tell us what changed for them, their words go here, with their name and their shop.

**Placeholder card, first sentence** · `home.testimonials.placeholder_prefix` · <sub>src/components/home/Testimonials.tsx:37</sub>

> Space reserved for a real quote. [prompt]

**Card 1, prompt** · `home.testimonials.1.prompt` · <sub>src/components/home/Testimonials.tsx:6</sub>

> A candle maker on how long labelling used to take.

**Card 1, attribution** · `home.testimonials.1.meta` · <sub>src/components/home/Testimonials.tsx:7</sub>

> Candle maker, Yorkshire

**Card 2, prompt** · `home.testimonials.2.prompt` · <sub>src/components/home/Testimonials.tsx:10</sub>

> A wax melt seller on changing a fragrance without redoing the maths.

**Card 2, attribution** · `home.testimonials.2.meta` · <sub>src/components/home/Testimonials.tsx:11</sub>

> Wax melt seller, Etsy

**Card 3, prompt** · `home.testimonials.3.prompt` · <sub>src/components/home/Testimonials.tsx:14</sub>

> A two person studio on getting through a market season.

**Card 3, attribution** · `home.testimonials.3.meta` · <sub>src/components/home/Testimonials.tsx:15</sub>

> Diffuser studio, Cornwall

**Invitation below the cards** · `home.testimonials.invite` · <sub>src/components/home/Testimonials.tsx:45</sub>

> Used Batchlabel and happy to be quoted? Email hello@batchlabel.co.uk.

### Home FAQ

**These six answers are also the FAQPage structured data for the home page.** They live in `src/content/faqs.ts` and are fed straight into the JSON-LD, so editing them changes what Google and answer engines are told about Batchlabel. That is a reason to edit carefully, not a reason not to.

**Eyebrow** · `home.faq.eyebrow` · <sub>src/components/home/FaqSection.tsx:16,31</sub>

> FAQ

**Heading** · `home.faq.heading` · <sub>src/components/home/FaqSection.tsx:15</sub>

> Questions makers ask us

**Question 1** · `home.faq.q1.question` · <sub>src/content/faqs.ts:19</sub>

> Do I still need to read the safety data sheet myself?

**Answer 1** · `home.faq.q1.answer` · <sub>src/content/faqs.ts:21</sub>

> You upload it, and we read the parts that matter for labelling. It is worth keeping a copy on file, because your supplier will send an updated one when a fragrance is reformulated. If the sheet is missing information we need, we tell you which line to ask your supplier about.

**Question 2** · `home.faq.q2.question` · <sub>src/content/faqs.ts:24</sub>

> What is a UFI and do I need one?

**Answer 2** · `home.faq.q2.answer` · <sub>src/content/faqs.ts:26</sub>

> A UFI is a Unique Formula Identifier, the 16 character code that links your product to the recipe you notified to the poison centres. If your product is classified as hazardous and you sell it to the public in the UK or EU, it belongs on the label. Batchlabel generates the code and places it for you.

- *Must stay true:* A UFI is 16 characters. UFI generation is a Maker plan feature on /pricing.

**Question 3** · `home.faq.q3.question` · <sub>src/content/faqs.ts:29</sub>

> Is Batchlabel a substitute for a compliance consultant?

**Answer 3** · `home.faq.q3.answer` · <sub>src/content/faqs.ts:31</sub>

> No. Batchlabel builds your label against published UK CLP and EU CLP requirements using the information you give us. It does not certify or approve anything, and responsibility for the finished label stays with you as the seller. You can use us for everyday labels and still take advice on an unusual product.

- *Must stay true:* The 'we do not certify or approve' position is repeated in the terms and in five site-wide disclaimers. Do not soften it here alone.

**Question 4** · `home.faq.q4.question` · <sub>src/content/faqs.ts:34</sub>

> Which products does it cover?

**Answer 4** · `home.faq.q4.answer` · <sub>src/content/faqs.ts:36</sub>

> Candles, wax melts, reed diffusers and room sprays, built against UK and EU CLP. That is the lot. We would like to cover cosmetics and other categories one day, but none of that is built and we are not promising a date. If you make something unusual, send us the safety data sheet and we will tell you honestly whether we can handle it.

- *Must stay true:* Category rule (point 2 above). Candles is the only live category, no dates and no "coming soon".

**Question 5** · `home.faq.q5.question` · <sub>src/content/faqs.ts:39</sub>

> What if I change my recipe?

**Answer 5** · `home.faq.q5.answer` · <sub>src/content/faqs.ts:41</sub>

> Open the saved recipe, change the fragrance percentage or the pack size, and download a new label. Nothing is hard coded into a spreadsheet, so a change of fragrance load does not mean rebuilding your formulas.

- *Must stay true:* Saved recipes are a Maker plan feature on /pricing.

**Question 6** · `home.faq.q6.question` · <sub>src/content/faqs.ts:44</sub>

> Can I print the labels at home?

**Answer 6** · `home.faq.q6.answer` · <sub>src/content/faqs.ts:46</sub>

> Yes. Paid plans give you a print ready PDF at true size plus an SVG if your printer asks for vector artwork. Both keep the pictograms and regulated text at the minimum sizes the rules require.

**Link to the full FAQ, sentence** · `home.faq.more_link_text` · <sub>src/components/home/FaqSection.tsx:29</sub>

> More detail on the full FAQ page.

**Link to the full FAQ, link text** · `home.faq.more_link_label` · <sub>src/components/home/FaqSection.tsx:31</sub>

> full FAQ page

---

## How it works

`/how-it-works`

The long version of the three steps, walked through with a candle. Ends with the shared closing call to action band.

### Page metadata

**SEO title** · `how.meta.title` · <sub>src/pages/HowItWorks.tsx:45</sub>

> How it works, safety data sheet to candle label

- *Length:* 47 characters, 60 once ` | Batchlabel` is appended. That is within the practical limit of 60.

**Meta description** · `how.meta.description` · <sub>src/pages/HowItWorks.tsx:47</sub>

> Three steps to a CLP label for candles, wax melts and diffusers. Upload the supplier safety data sheet, enter your recipe and pack size, download a PDF or SVG.

- *Length:* 159 characters. That is **over** the practical limit of 155.

### Hero

**Eyebrow** · `how.hero.eyebrow` · <sub>src/pages/HowItWorks.tsx:68</sub>

> How it works

**Heading (h1)** · `how.hero.title` · <sub>src/pages/HowItWorks.tsx:69</sub>

> From safety data sheet to printed label

**Intro** · `how.hero.intro` · <sub>src/pages/HowItWorks.tsx:70</sub>

> Three steps, walked through with a candle. If you can read the safety data sheet your supplier emailed you, you can make a label.

### The three steps

**These three step titles and the first paragraph of each are also the HowTo structured data for this page.** The step titles are word for word identical to the short versions on the home page, but they are separate strings in separate files (`home.steps.1.title` and friends). Editing one will not change the other.

**Step counter** · `how.step.counter` · <sub>src/pages/HowItWorks.tsx:87</sub>

> Step 1, Step 2, Step 3

**Step 1, title** · `how.step1.title` · <sub>src/pages/HowItWorks.tsx:15</sub>

> Upload your supplier safety data sheet

**Step 1, paragraph 1** · `how.step1.para1` · <sub>src/pages/HowItWorks.tsx:17</sub>

> A safety data sheet, often shortened to SDS, is the document your fragrance oil supplier must give you free of charge. It lists what the fragrance contains and how it is classified.

- *Must stay true:* Suppliers must provide a safety data sheet free of charge. Repeated on /faq.

**Step 1, paragraph 2** · `how.step1.para2` · <sub>src/pages/HowItWorks.tsx:18</sub>

> Drag the PDF in. We pull out the classification, the hazard statements, the allergens you have to declare, and the substances that drive it. If something we need is missing, we tell you which line to ask your supplier about.

**Step 1, aside** · `how.step1.aside` · <sub>src/pages/HowItWorks.tsx:20</sub>

> Takes about a minute. Keep the PDF, because suppliers issue a new version when a fragrance is reformulated.

**Step 2, title** · `how.step2.title` · <sub>src/pages/HowItWorks.tsx:24</sub>

> Enter your fragrance percentage and pack size

**Step 2, paragraph 1** · `how.step2.para1` · <sub>src/pages/HowItWorks.tsx:26</sub>

> Tell us the fragrance load, for example 8 per cent, and the pack size, for example a 180 g candle or a 100 ml diffuser. Add your business name and address, since that has to appear on the label as the supplier.

**Step 2, paragraph 2** · `how.step2.para2` · <sub>src/pages/HowItWorks.tsx:27</sub>

> The classification of your finished product depends on how much fragrance is in it, not on the neat oil. That is the step most spreadsheets get wrong. Change the percentage here and the label changes with it, including which precautionary statements apply.

- *Must stay true:* The same claim is made in public/llms.txt. Keep them in step.

**Step 2, paragraph 3** · `how.step2.para3` · <sub>src/pages/HowItWorks.tsx:28</sub>

> Save it as a recipe. Next time you make the same product in a different size, start from the recipe.

**Step 2, aside** · `how.step2.aside` · <sub>src/pages/HowItWorks.tsx:30</sub>

> Saved recipes are on the Maker plan. Free accounts can still make one label.

- *Must stay true:* Must match the Free and Maker feature lists on /pricing.

**Step 3, title** · `how.step3.title` · <sub>src/pages/HowItWorks.tsx:34</sub>

> Download your print ready label

**Step 3, paragraph 1** · `how.step3.para1` · <sub>src/pages/HowItWorks.tsx:36</sub>

> The preview is at true size, so you see the label as it will print. Check your product name, your address and your batch code, then download.

**Step 3, paragraph 2** · `how.step3.para2` · <sub>src/pages/HowItWorks.tsx:37</sub>

> Paid plans give you a PDF for home printing or a print shop, and an SVG if your printer asks for vector artwork. Pictograms and regulated text stay at the minimum sizes the rules require, whatever else you change.

**Step 3, aside** · `how.step3.aside` · <sub>src/pages/HowItWorks.tsx:39</sub>

> Free accounts get a watermarked PNG, which is enough to check the wording.

- *Must stay true:* Must match the Free plan feature list on /pricing.

### What ends up on the label

The eleven bullets under this heading are `home.included.item.1` to `.11`, shared with the home page. They are not repeated here.

**Eyebrow** · `how.output.eyebrow` · <sub>src/pages/HowItWorks.tsx:111</sub>

> The output

**Heading** · `how.output.heading` · <sub>src/pages/HowItWorks.tsx:112</sub>

> What ends up on the label

**Lead** · `how.output.lead` · <sub>src/pages/HowItWorks.tsx:114</sub>

> If a line is on the label, it is because CLP requires it for a product like yours.

### What Batchlabel does not do

The site's honesty section. This is the same limit stated in the terms (`legal.terms.s3.*`) and in the five site-wide disclaimers. Do not weaken one without the others.

**Eyebrow** · `how.scope.eyebrow` · <sub>src/pages/HowItWorks.tsx:130</sub>

> Scope

**Heading** · `how.scope.heading` · <sub>src/pages/HowItWorks.tsx:131</sub>

> What Batchlabel does not do

**Card 1, title** · `how.scope.card1.title` · <sub>src/pages/HowItWorks.tsx:135</sub>

> It does not approve your label

**Card 1, body** · `how.scope.card1.body` · <sub>src/pages/HowItWorks.tsx:136</sub>

> We build the label against published CLP requirements from your inputs. We do not certify or verify it, and the finished label stays your responsibility as the seller.

**Card 2, title** · `how.scope.card2.title` · <sub>src/pages/HowItWorks.tsx:139</sub>

> It does not check your data

**Card 2, body** · `how.scope.card2.body` · <sub>src/pages/HowItWorks.tsx:140</sub>

> If the safety data sheet is out of date, or the percentage you enter is wrong, the label will be wrong. Garbage in, garbage on the tin.

**Card 3, title** · `how.scope.card3.title` · <sub>src/pages/HowItWorks.tsx:143</sub>

> It does not replace other duties

**Card 3, body** · `how.scope.card3.body` · <sub>src/pages/HowItWorks.tsx:144</sub>

> Poison centre notification, a Cosmetic Product Safety Report, weights and measures rules and packaging duties are all separate. We only do the label.

---

## Pricing

`/pricing`

**Every price on this page is also a number in Stripe and in the SoftwareApplication structured data.** Pricing figure (point 6 above). The same numbers are in Stripe and in the structured data. Changing the words here does not change what anyone is charged.

### Page metadata

**SEO title** · `pricing.meta.title` · <sub>src/pages/Pricing.tsx:46</sub>

> Pricing, £14 a month or £140 a year

- *Length:* 35 characters, 48 once ` | Batchlabel` is appended. That is within the practical limit of 60.
- *Must stay true:* Pricing figure (point 6 above). The same numbers are in Stripe and in the structured data. Changing the words here does not change what anyone is charged.

**Meta description** · `pricing.meta.description` · <sub>src/pages/Pricing.tsx:48</sub>

> Start free with one watermarked label. The Maker plan is £14 a month or £140 a year, VAT included, for unlimited print ready CLP labels and UFI generation.

- *Length:* 155 characters. That is within the practical limit of 155.
- *Must stay true:* Pricing figure (point 6 above). The same numbers are in Stripe and in the structured data. Changing the words here does not change what anyone is charged.

### Hero

**Eyebrow** · `pricing.hero.eyebrow` · <sub>src/pages/Pricing.tsx:104</sub>

> Pricing

**Heading (h1)** · `pricing.hero.title` · <sub>src/pages/Pricing.tsx:105</sub>

> Two plans. One of them is free.

**Intro** · `pricing.hero.intro` · <sub>src/pages/Pricing.tsx:106</sub>

> Try a label before you pay for anything. When you want files you can actually send to a printer, the Maker plan is £14 a month.

- *Must stay true:* Pricing figure (point 6 above). The same numbers are in Stripe and in the structured data. Changing the words here does not change what anyone is charged.

### Billing period toggle

**Monthly option** · `pricing.toggle.monthly` · <sub>src/pages/Pricing.tsx:125</sub>

> Monthly

**Yearly option** · `pricing.toggle.annual` · <sub>src/pages/Pricing.tsx:125</sub>

> Yearly, two months free

- *Must stay true:* £140 a year against £14 a month is exactly two months free. If either price moves, check this is still true.

### Free plan card

**Plan name** · `pricing.free.name` · <sub>src/pages/Pricing.tsx:132</sub>

> Free

**Tagline** · `pricing.free.tagline` · <sub>src/pages/Pricing.tsx:133</sub>

> To check we handle your fragrance properly.

**Price** · `pricing.free.price` · <sub>src/pages/Pricing.tsx:134</sub>

> £0

**Note under the price** · `pricing.free.price_note` · <sub>src/pages/Pricing.tsx:135</sub>

> No card needed.

**Feature, included** · `pricing.free.feature.1` · <sub>src/pages/Pricing.tsx:23</sub>

> 1 label

**Feature, included** · `pricing.free.feature.2` · <sub>src/pages/Pricing.tsx:24</sub>

> Watermarked preview

**Feature, included** · `pricing.free.feature.3` · <sub>src/pages/Pricing.tsx:25</sub>

> PNG download

**Feature, included** · `pricing.free.feature.4` · <sub>src/pages/Pricing.tsx:26</sub>

> Community support

- *Must stay true:* There is no community forum or chat anywhere on the site. See 'Flagged while extracting'.

**Feature, not included** · `pricing.free.feature.5` · <sub>src/pages/Pricing.tsx:27</sub>

> Print ready PDF and SVG

**Feature, not included** · `pricing.free.feature.6` · <sub>src/pages/Pricing.tsx:28</sub>

> UFI generation

**Feature, not included** · `pricing.free.feature.7` · <sub>src/pages/Pricing.tsx:29</sub>

> Batch code fields

**Feature, not included** · `pricing.free.feature.8` · <sub>src/pages/Pricing.tsx:30</sub>

> Saved recipes

### Maker plan card

**Plan name** · `pricing.maker.name` · <sub>src/pages/Pricing.tsx:176</sub>

> Maker

**Badge** · `pricing.maker.badge` · <sub>src/pages/Pricing.tsx:178</sub>

> Unlimited labels

- *Note:* VOICE.md records that this badge used to read 'Most makers pick this', which was invented social proof. It was changed on purpose.

**Tagline** · `pricing.maker.tagline` · <sub>src/pages/Pricing.tsx:181</sub>

> For everything you actually sell.

**Price unit, monthly** · `pricing.maker.price_unit_monthly` · <sub>src/pages/Pricing.tsx:185</sub>

> per month

**Price unit, yearly** · `pricing.maker.price_unit_annual` · <sub>src/pages/Pricing.tsx:185</sub>

> per year

**Note under the price** · `pricing.maker.price_note` · <sub>src/pages/Pricing.tsx:189</sub>

> VAT included. Cancel any time, monthly rolling. / VAT included. Cancel any time, refunded pro rata.

- *Must stay true:* 'VAT included' is a tax statement matching Stripe Tax configuration. It is also in the terms and the FAQ.

**Button, while opening Stripe** · `pricing.maker.cta.busy` · <sub>src/pages/Pricing.tsx:199</sub>

> Opening checkout...

**Button, signed out** · `pricing.maker.cta.signed_out` · <sub>src/pages/Pricing.tsx:199</sub>

> Sign up to get the Maker plan

**Button, signed in** · `pricing.maker.cta.signed_in` · <sub>src/pages/Pricing.tsx:199</sub>

> Get the Maker plan

**Note under the button, signed out** · `pricing.maker.signed_out_note` · <sub>src/pages/Pricing.tsx:204</sub>

> You will make an account first, then come straight back here to pay.

**Feature 1** · `pricing.maker.feature.1` · <sub>src/pages/Pricing.tsx:34</sub>

> Unlimited labels

**Feature 2** · `pricing.maker.feature.2` · <sub>src/pages/Pricing.tsx:35</sub>

> Print ready PDF and SVG

**Feature 3** · `pricing.maker.feature.3` · <sub>src/pages/Pricing.tsx:36</sub>

> No watermark

**Feature 4** · `pricing.maker.feature.4` · <sub>src/pages/Pricing.tsx:37</sub>

> UFI generation, that is a Unique Formula Identifier

**Feature 5** · `pricing.maker.feature.5` · <sub>src/pages/Pricing.tsx:38</sub>

> Batch code and date fields

**Feature 6** · `pricing.maker.feature.6` · <sub>src/pages/Pricing.tsx:39</sub>

> Saved recipes you can edit and reuse

**Feature 7** · `pricing.maker.feature.7` · <sub>src/pages/Pricing.tsx:40</sub>

> Email support from a human

**Feature 8** · `pricing.maker.feature.8` · <sub>src/pages/Pricing.tsx:41</sub>

> Up to five people on the account

- *Must stay true:* The five person limit is also stated in the terms, clause 4.

### Disclaimer

**Disclaimer under the plans** · `pricing.disclaimer` · <sub>src/pages/Pricing.tsx:226</sub>

> Batchlabel produces labels against published UK CLP and EU CLP requirements from the information you enter. We do not certify or approve labels, and responsibility for the final label rests with you as the seller.

- *Note:* One of five near-identical disclaimers on the site. See 'Flagged while extracting'.

### Billing questions

**These six answers are also the FAQPage structured data for /pricing.** They live in `src/content/faqs.ts`.

**Eyebrow** · `pricing.faq.eyebrow` · <sub>src/pages/Pricing.tsx:233</sub>

> Billing questions

**Heading** · `pricing.faq.heading` · <sub>src/pages/Pricing.tsx:234</sub>

> VAT, cancelling and refunds

**Question 1** · `pricing.faq.q1.question` · <sub>src/content/faqs.ts:167</sub>

> Is VAT included in the price?

**Answer 1** · `pricing.faq.q1.answer` · <sub>src/content/faqs.ts:169</sub>

> Yes. The £14 monthly and £140 annual prices are inclusive of VAT for consumers. VAT registered businesses can add a VAT number at checkout and it will be reflected on the invoice.

- *Must stay true:* Pricing figure (point 6 above). The same numbers are in Stripe and in the structured data. Changing the words here does not change what anyone is charged.

**Question 2** · `pricing.faq.q2.question` · <sub>src/content/faqs.ts:172</sub>

> How do I cancel?

**Answer 2** · `pricing.faq.q2.answer` · <sub>src/content/faqs.ts:174</sub>

> Open Billing in your dashboard and cancel in two clicks. You keep access until the end of the period you have paid for. No email, no retention call.

- *Must stay true:* Cancellation is through the Stripe customer portal, reached from Account and billing.

**Question 3** · `pricing.faq.q3.question` · <sub>src/content/faqs.ts:177</sub>

> What is your refund policy?

**Answer 3** · `pricing.faq.q3.answer` · <sub>src/content/faqs.ts:179</sub>

> If Batchlabel does not do what this page says within 14 days of your payment, email us and we will refund you in full. Cancelled annual plans are refunded pro rata on request.

- *Must stay true:* The 14 day window and the pro rata rule are also in the terms, clause 5. Changing one and not the other creates a contradiction a customer can rely on.

**Question 4** · `pricing.faq.q4.question` · <sub>src/content/faqs.ts:182</sub>

> Do I need a card for the free label?

**Answer 4** · `pricing.faq.q4.answer` · <sub>src/content/faqs.ts:184</sub>

> No. The free label needs an email address only. We ask for a card when you decide you want unwatermarked, print ready files.

**Question 5** · `pricing.faq.q5.question` · <sub>src/content/faqs.ts:187</sub>

> Can I switch between monthly and annual?

**Answer 5** · `pricing.faq.q5.answer` · <sub>src/content/faqs.ts:189</sub>

> Yes, from the billing portal. Changes are prorated by Stripe, so you are only charged for the difference.

**Question 6** · `pricing.faq.q6.question` · <sub>src/content/faqs.ts:192</sub>

> Do you offer anything for larger teams?

**Answer 6** · `pricing.faq.q6.answer` · <sub>src/content/faqs.ts:194</sub>

> The Maker plan covers teams of up to five people. If you run something bigger, email us and we will talk it through rather than sell you a tier you do not need.

---

## FAQ

`/faq`

Seventeen questions in five groups. **Every one of them is also the FAQPage structured data for this page**, generated from `src/content/faqs.ts`, so an edit changes what search engines and answer engines are told. Answers are plain strings, not formatted text, exactly so the two cannot drift apart.

### Page metadata

**SEO title** · `faq.meta.title` · <sub>src/pages/Faq.tsx:11</sub>

> Common questions about CLP labels for candles

- *Length:* 45 characters, 58 once ` | Batchlabel` is appended. That is within the practical limit of 60.

**Meta description** · `faq.meta.description` · <sub>src/pages/Faq.tsx:13</sub>

> Plain answers on CLP, safety data sheets, UFI codes, allergens, printing, pricing and VAT. Batchlabel covers candles, wax melts, reed diffusers and room sprays.

- *Length:* 160 characters. That is **over** the practical limit of 155.

### Hero

**Eyebrow** · `faq.hero.eyebrow` · <sub>src/pages/Faq.tsx:25</sub>

> FAQ

**Heading (h1)** · `faq.hero.title` · <sub>src/pages/Faq.tsx:26</sub>

> Common questions

**Intro** · `faq.hero.intro` · <sub>src/pages/Faq.tsx:27</sub>

> If your question is not here, email hello@batchlabel.co.uk and a person will reply.

### Which products we cover

**The category rule applies to all three of these answers.** Category rule (point 2 above). Candles is the only live category, no dates and no "coming soon".

**Group heading** · `faq.group1.title` · <sub>src/content/faqs.ts:53</sub>

> Which products we cover

**Question** · `faq.products.q1.question` · <sub>src/content/faqs.ts:56</sub>

> Which product categories can I label today?

**Answer** · `faq.products.q1.answer` · <sub>src/content/faqs.ts:58</sub>

> Candles, wax melts, reed diffusers and room sprays, all built against UK CLP and EU CLP. Nothing else, yet.

- *Must stay true:* Category rule (point 2 above). Candles is the only live category, no dates and no "coming soon".

**Question** · `faq.products.q2.question` · <sub>src/content/faqs.ts:61</sub>

> Do you do cosmetics labelling?

**Answer** · `faq.products.q2.answer` · <sub>src/content/faqs.ts:63</sub>

> No. It is the category makers ask us for most and the one we would most like to add, but we have not started building it and there is no date. Email hello@batchlabel.co.uk if you want it and we will let you know if that changes. Whenever it arrives it would cover the label only, so it would still not replace a Cosmetic Product Safety Report.

- *Must stay true:* Category rule (point 2 above). Candles is the only live category, no dates and no "coming soon".
- *Note:* VOICE.md records this answer as a deliberate correction: the previous version said 'Not yet, but it is the next category we are building', which was not true.

**Question** · `faq.products.q3.question` · <sub>src/content/faqs.ts:66</sub>

> Will Batchlabel work for other products, like wider consumer goods or electronics?

**Answer** · `faq.products.q3.answer` · <sub>src/content/faqs.ts:68</sub>

> One day, we hope. The hard part of any label is turning safety data into the exact words the rules require, and that is not specific to candles. But nothing beyond candles and home fragrance exists, and we would rather say so than sell you a roadmap.

- *Must stay true:* Category rule (point 2 above). Candles is the only live category, no dates and no "coming soon".

### Getting started

**Group heading** · `faq.group2.title` · <sub>src/content/faqs.ts:73</sub>

> Getting started

**Question** · `faq.start.q1.question` · <sub>src/content/faqs.ts:76</sub>

> What do I need before I start?

**Answer** · `faq.start.q1.answer` · <sub>src/content/faqs.ts:78</sub>

> The safety data sheet from your fragrance oil supplier, the percentage of fragrance in your product, and your pack size. That is it. If you sell more than one size, you can produce a label for each.

**Question** · `faq.start.q2.question` · <sub>src/content/faqs.ts:81</sub>

> Where do I get a safety data sheet?

**Answer** · `faq.start.q2.answer` · <sub>src/content/faqs.ts:83</sub>

> Your fragrance oil supplier must provide one free of charge. It is usually a PDF on the product page or available on request. Ask for the current version, because the classification changes when a fragrance is reformulated.

- *Must stay true:* 'must provide one free of charge' is a statement about the supplier's legal duty.

**Question** · `faq.start.q3.question` · <sub>src/content/faqs.ts:86</sub>

> How long does the first label take?

**Answer** · `faq.start.q3.answer` · <sub>src/content/faqs.ts:88</sub>

> About ten minutes on your first go, and a couple of minutes after that.

- *Must stay true:* The same ten minute claim is on the home page, the sign-up screen and the dashboard, and totalTime PT10M is in the HowTo structured data.

### Regulation, in plain words

**Group heading** · `faq.group3.title` · <sub>src/content/faqs.ts:93</sub>

> Regulation, in plain words

**Question** · `faq.reg.q1.question` · <sub>src/content/faqs.ts:96</sub>

> What is CLP?

**Answer** · `faq.reg.q1.answer` · <sub>src/content/faqs.ts:98</sub>

> CLP stands for Classification, Labelling and Packaging. In Great Britain it is the GB CLP Regulation, and in the EU and Northern Ireland it is EU CLP, Regulation 1272/2008. It sets out what has to appear on the label of a product that contains hazardous substances, including your candles and diffusers.

- *Must stay true:* The GB / EU split and Regulation 1272/2008 are factual. Do not paraphrase the regulation number.

**Question** · `faq.reg.q2.question` · <sub>src/content/faqs.ts:101</sub>

> Does Batchlabel confirm that my label is compliant?

**Answer** · `faq.reg.q2.answer` · <sub>src/content/faqs.ts:103</sub>

> No, and you should be wary of any tool that says it does. We build the label against published CLP requirements from the details you enter. If the safety data sheet or the percentage you give us is wrong, the label will be wrong too. Responsibility for the final label rests with you as the seller.

- *Must stay true:* This matches clause 3 of the terms. Do not soften it here alone.

**Question** · `faq.reg.q3.question` · <sub>src/content/faqs.ts:106</sub>

> Do I also need a CPSR for cosmetics?

**Answer** · `faq.reg.q3.answer` · <sub>src/content/faqs.ts:108</sub>

> If you sell cosmetics, yes. A CPSR is a Cosmetic Product Safety Report and it is separate from labelling. Batchlabel does not produce one, and we do not label cosmetics at all today.

- *Must stay true:* Category rule (point 2 above). Candles is the only live category, no dates and no "coming soon".

**Question** · `faq.reg.q4.question` · <sub>src/content/faqs.ts:111</sub>

> What about poison centre notification?

**Answer** · `faq.reg.q4.answer` · <sub>src/content/faqs.ts:113</sub>

> Notification is a separate submission to the relevant authority. Batchlabel generates the UFI, which is the code that ties your notified recipe to the label, but you still make the submission yourself.

### Labels and printing

**Group heading** · `faq.group4.title` · <sub>src/content/faqs.ts:118</sub>

> Labels and printing

**Question** · `faq.print.q1.question` · <sub>src/content/faqs.ts:121</sub>

> What is on the generated label?

**Answer** · `faq.print.q1.answer` · <sub>src/content/faqs.ts:123</sub>

> Product name and pack size, hazard pictograms, the signal word, hazard statements, precautionary statements, allergen declarations, the UFI, batch code, your business name and address, and any candle or diffuser safety wording that applies.

- *Must stay true:* A shorter restatement of `home.included.item.1` to `.11`. Keep the two lists saying the same thing.

**Question** · `faq.print.q2.question` · <sub>src/content/faqs.ts:126</sub>

> Can I match it to my brand?

**Answer** · `faq.print.q2.answer` · <sub>src/content/faqs.ts:128</sub>

> You can set the label size, choose a layout, and place your own logo. The regulated text stays at the sizes and spacing the rules require, because that is the part that gets a listing pulled down.

**Question** · `faq.print.q3.question` · <sub>src/content/faqs.ts:131</sub>

> What file formats do I get?

**Answer** · `faq.print.q3.answer` · <sub>src/content/faqs.ts:133</sub>

> The free plan gives you a watermarked PNG preview. The Maker plan gives you print ready PDF and SVG with no watermark.

- *Must stay true:* Must match the plan feature lists on /pricing.

### Account and billing

**Group heading** · `faq.group5.title` · <sub>src/content/faqs.ts:138</sub>

> Account and billing

**Question** · `faq.billing.q1.question` · <sub>src/content/faqs.ts:141</sub>

> Is there a free option?

**Answer** · `faq.billing.q1.answer` · <sub>src/content/faqs.ts:143</sub>

> Yes. You can make one label and see the full preview without entering a card. It is watermarked and PNG only, but the wording on it is the real thing.

**Question** · `faq.billing.q2.question` · <sub>src/content/faqs.ts:146</sub>

> Is VAT included?

**Answer** · `faq.billing.q2.answer` · <sub>src/content/faqs.ts:148</sub>

> Prices shown are inclusive of VAT for consumers. If you are a VAT registered business, enter your VAT number at checkout and Stripe will show the correct treatment on your invoice.

- *Must stay true:* Pricing figure (point 6 above). The same numbers are in Stripe and in the structured data. Changing the words here does not change what anyone is charged.

**Question** · `faq.billing.q3.question` · <sub>src/content/faqs.ts:151</sub>

> Can I cancel?

**Answer** · `faq.billing.q3.answer` · <sub>src/content/faqs.ts:153</sub>

> Any time, from the billing section in your dashboard. Your plan runs to the end of the period you have paid for, and we do not ask you why.

**Question** · `faq.billing.q4.question` · <sub>src/content/faqs.ts:156</sub>

> Do you refund?

**Answer** · `faq.billing.q4.answer` · <sub>src/content/faqs.ts:158</sub>

> If something is wrong within 14 days of paying and we cannot put it right, email us and we will refund you. Annual plans cancelled part way through are refunded pro rata on request.

- *Must stay true:* Must match clause 5 of the terms and `pricing.faq.q3.answer`.

### Closing call to action, overridden on this page

**Heading** · `faq.cta.heading` · <sub>src/pages/Faq.tsx:45</sub>

> Try one label before you decide

**Body** · `faq.cta.body` · <sub>src/pages/Faq.tsx:46</sub>

> No card needed. It is the quickest way to see whether we handle your fragrance properly.

---

## About

`/about`

The origin story, the category ladder and three values. The ladder renders from `src/content/verticals.ts`, so the category names, status badges and descriptions are the same strings as on the home page — they are listed under **Home → Categories** and not repeated here.

### Page metadata

**SEO title** · `about.meta.title` · <sub>src/pages/About.tsx:16</sub>

> About us, CLP labelling for small makers

- *Length:* 40 characters, 53 once ` | Batchlabel` is appended. That is within the practical limit of 60.

**Meta description** · `about.meta.description` · <sub>src/pages/About.tsx:18</sub>

> Batchlabel started with a candle business and a long evening reading a safety data sheet. We make CLP labels for candles, and we are straight about the limits.

- *Length:* 159 characters. That is **over** the practical limit of 155.

### Hero

**Eyebrow** · `about.hero.eyebrow` · <sub>src/pages/About.tsx:26</sub>

> About

**Heading (h1)** · `about.hero.title` · <sub>src/pages/About.tsx:27</sub>

> Built by people who have printed the wrong label

**Intro** · `about.hero.intro` · <sub>src/pages/About.tsx:28</sub>

> We are a small UK company. We make the labelling part of selling candles quicker to get right. We are not a compliance firm and we do not pretend to be one.

- *Note:* VOICE.md records this as a deliberate rewrite: the earlier version opened with 'a straightforward mission:' and was cut.

### The story

**Paragraph 1** · `about.story.p1` · <sub>src/pages/About.tsx:34</sub>

> This started with a candle business, a kitchen table and a very long evening trying to work out which hazard statements belonged on a 180 g tin. The safety data sheet ran to eleven pages. The advice online contradicted itself. A consultant quoted more for one fragrance than the whole month had taken in sales.

**Paragraph 2** · `about.story.p2` · <sub>src/pages/About.tsx:40</sub>

> We built a spreadsheet, then a better spreadsheet, then something that did not fall over when the fragrance load changed. Other makers asked to use it. That became Batchlabel.

**Paragraph 3** · `about.story.p3` · <sub>src/pages/About.tsx:44</sub>

> Somewhere along the way we noticed the hard part was never the candle. It was turning the data behind a product into the exact words a regulation demands, then setting them at the right size on a label. A soap maker or a skincare brand runs into a version of the same problem.

**Paragraph 4** · `about.story.p4` · <sub>src/pages/About.tsx:50</sub>

> Batchlabel is the first product from Orchestrate. We would like to take on more categories one day, and cosmetics is the one makers ask us for most. We have not started it. We are not going to give you a date, and you will not find a countdown anywhere on this site. Candles is what works, and it stays the priority.

- *Must stay true:* Category rule (point 2 above). Candles is the only live category, no dates and no "coming soon".

**Paragraph 5** · `about.story.p5` · <sub>src/pages/About.tsx:56</sub>

> We are based in the UK and we work with UK CLP and EU CLP, the rules on Classification, Labelling and Packaging. We read the published requirements and turn them into a label from the information you give us. We do not approve labels, we do not certify anything, and we will tell you when a product is beyond what we handle rather than take your money.

**Paragraph 6** · `about.story.p6` · <sub>src/pages/About.tsx:62</sub>

> There is no sales team. If you email us, one of us replies, usually the same day.

- *Must stay true:* /contact says 'Monday to Friday, 9am to 5pm UK time. Usually the same working day.' Keep the two promises compatible.

### Category ladder

The four rows are `verticals.*` under **Home → Categories**. Category rule (point 2 above). Candles is the only live category, no dates and no "coming soon".

**Eyebrow** · `about.ladder.eyebrow` · <sub>src/pages/About.tsx:68</sub>

> Categories

**Heading** · `about.ladder.heading` · <sub>src/pages/About.tsx:69</sub>

> Where things actually stand

**Lead** · `about.ladder.lead` · <sub>src/pages/About.tsx:71</sub>

> We would rather do one category properly than ten badly.

### What we care about

**Heading** · `about.values.heading` · <sub>src/pages/About.tsx:97</sub>

> What we care about

**Card 1, title** · `about.values.card1.title` · <sub>src/pages/About.tsx:101</sub>

> Plain words

**Card 1, body** · `about.values.card1.body` · <sub>src/pages/About.tsx:102</sub>

> If we cannot explain a rule without jargon, we have not understood it well enough yet.

**Card 2, title** · `about.values.card2.title` · <sub>src/pages/About.tsx:105</sub>

> Honest limits

**Card 2, body** · `about.values.card2.body` · <sub>src/pages/About.tsx:106</sub>

> You will never see us claim a label is guaranteed anything. We show our workings instead.

**Card 3, title** · `about.values.card3.title` · <sub>src/pages/About.tsx:109</sub>

> Fair price

**Card 3, body** · `about.values.card3.body` · <sub>src/pages/About.tsx:110</sub>

> One price, £14 a month. No tiers that punish you for growing.

- *Must stay true:* Pricing figure (point 6 above). The same numbers are in Stripe and in the structured data. Changing the words here does not change what anyone is charged.

---

## Contact

`/contact`

A form and three detail cards. The form does not post anywhere yet: submitting it opens the visitor's own email client with a pre-filled message. The button still says 'Send message'.

### Page metadata

**SEO title** · `contact.meta.title` · <sub>src/pages/Contact.tsx:12</sub>

> Contact us about CLP labelling or your account

- *Length:* 46 characters, 59 once ` | Batchlabel` is appended. That is within the practical limit of 60.

**Meta description** · `contact.meta.description` · <sub>src/pages/Contact.tsx:14</sub>

> Email hello@batchlabel.co.uk with a question about CLP labelling or your Batchlabel account. A person replies, usually the same working day.

- *Length:* 140 characters. That is within the practical limit of 155.

### Hero

**Eyebrow** · `contact.hero.eyebrow` · <sub>src/pages/Contact.tsx:38</sub>

> Contact

**Heading (h1)** · `contact.hero.title` · <sub>src/pages/Contact.tsx:39</sub>

> Talk to a person

**Intro** · `contact.hero.intro` · <sub>src/pages/Contact.tsx:40</sub>

> Questions about a safety data sheet, your account or the bill all come to the same inbox.

### The form

**Form heading, screen readers only** · `contact.form.sr_heading` · <sub>src/pages/Contact.tsx:57</sub>

> Send us a message

**Field label** · `contact.form.name.label` · <sub>src/pages/Contact.tsx:60</sub>

> Your name

**Field label** · `contact.form.email.label` · <sub>src/pages/Contact.tsx:68</sub>

> Email

**Field hint** · `contact.form.email.hint` · <sub>src/pages/Contact.tsx:75</sub>

> We reply to this address and nothing else.

**Field label** · `contact.form.message.label` · <sub>src/pages/Contact.tsx:79</sub>

> Message

**Submit button** · `contact.form.submit` · <sub>src/pages/Contact.tsx:92</sub>

> Send message

- *Note:* The same string is the analytics track label on line 91. Change both.

**Subject line of the email that opens** · `contact.form.mail_subject` · <sub>src/pages/Contact.tsx:30</sub>

> Question from the Batchlabel site

**Confirmation after submitting** · `contact.form.sent` · <sub>src/pages/Contact.tsx:96</sub>

> Thanks. Your email client should have opened. If it did not, write to hello@batchlabel.co.uk and we will pick it up.

### Contact details

**Heading, screen readers only** · `contact.details.sr_heading` · <sub>src/pages/Contact.tsx:103</sub>

> Other ways to reach us

**Card 1, title** · `contact.details.email.title` · <sub>src/pages/Contact.tsx:104</sub>

> Email

**Card 1, address** · `contact.details.email.value` · <sub>src/pages/Contact.tsx:109</sub>

> hello@batchlabel.co.uk

**Card 2, title** · `contact.details.replies.title` · <sub>src/pages/Contact.tsx:112</sub>

> Replies

**Card 2, body** · `contact.details.replies.body` · <sub>src/pages/Contact.tsx:113</sub>

> Monday to Friday, 9am to 5pm UK time. Usually the same working day.

**Card 3, title** · `contact.details.office.title` · <sub>src/pages/Contact.tsx:115</sub>

> Registered office

**Card 3, body** · `contact.details.office.body` · <sub>src/pages/Contact.tsx:116</sub>

> Orchestrate Technologies Ltd, 167-169 Great Portland Street, London W1W 5PF. Post is slower than email.

- *Must stay true:* The registered office is a Companies House fact. It also appears in the footer, the terms and the privacy policy.

**Closing paragraph** · `contact.details.limits` · <sub>src/pages/Contact.tsx:120</sub>

> We cannot give legal advice or confirm that a specific label meets your obligations. We can explain what Batchlabel produces and where each line comes from.

---

## Sign up, log in and password

Six screens outside the main site layout. None of them is indexed except sign-up. They share a wrapper (`AuthShell`) that carries the logo, the disclaimer and the legal links.

**The consent checkboxes and their supporting notes are compliance-sensitive.** Compliance-sensitive. The exact words a user agreed to are captured as a versioned snapshot in `src/lib/agreements.ts` and written to an append-only consent audit trail. Changing the wording means the version must be bumped, and every past acceptance then refers to older wording. Leave alone unless you are deliberately revising the consent.

### Sign up — page metadata

**SEO title** · `auth.signup.meta.title` · <sub>src/pages/auth/SignUp.tsx:28</sub>

> Make a label free

- *Length:* 17 characters, 30 once ` | Batchlabel` is appended. That is within the practical limit of 60.
- *Note:* This is the one auth screen that is indexed (`noIndex: false`).

**Meta description** · `auth.signup.meta.description` · <sub>src/pages/auth/SignUp.tsx:30</sub>

> Create a free Batchlabel account and make your first CLP label. No payment card needed.

- *Length:* 87 characters. That is within the practical limit of 155.

### Sign up — screen

**Heading (h1)** · `auth.signup.title` · <sub>src/pages/auth/SignUp.tsx:94</sub>

> Make your first label, free

**Intro** · `auth.signup.intro` · <sub>src/pages/auth/SignUp.tsx:95</sub>

> One label, no payment card, about ten minutes. You need the safety data sheet from your fragrance supplier to hand.

- *Must stay true:* 'about ten minutes' is repeated on the home page, /faq and the dashboard.

**Note under the Google button** · `auth.signup.google_note` · <sub>src/pages/auth/SignUp.tsx:123</sub>

> We will ask for your shop name and the terms on the next screen.

**Field label** · `auth.signup.field.business.label` · <sub>2 files — see the manifest</sub>

> Business or shop name

- *Appears on:* /sign-up, /finish-setup.

**Field placeholder** · `auth.signup.field.business.placeholder` · <sub>2 files — see the manifest</sub>

> Willow & Wick

- *Appears on:* /sign-up, /finish-setup.
- *Note:* The same invented business name is on the example label, where it is written `Willow &amp; Wick`.

**Field label** · `auth.signup.field.email.label` · <sub>src/pages/auth/SignUp.tsx:145</sub>

> Email

**Field label** · `auth.signup.field.password.label` · <sub>src/pages/auth/SignUp.tsx:156</sub>

> Password

**Field hint** · `auth.signup.field.password.hint` · <sub>src/pages/auth/SignUp.tsx:163</sub>

> At least eight characters. A short phrase works well.

- *Must stay true:* Sign-up does not actually enforce eight characters — only the reset screen does. See 'Flagged while extracting'.

**Submit button, working** · `auth.signup.submit.busy` · <sub>2 files — see the manifest</sub>

> Setting up your account...

- *Appears on:* /sign-up, /finish-setup.

**Submit button, password mode** · `auth.signup.submit.password` · <sub>src/pages/auth/SignUp.tsx:193</sub>

> Create my account

**Submit button, link mode** · `auth.signup.submit.magic` · <sub>src/pages/auth/SignUp.tsx:193</sub>

> Email me a sign in link

**Switch to a sign in link** · `auth.signup.mode.to_magic` · <sub>src/pages/auth/SignUp.tsx:204</sub>

> Rather not set a password? Email me a link

**Switch back to a password** · `auth.signup.mode.to_password` · <sub>src/pages/auth/SignUp.tsx:204</sub>

> Set a password instead

**Footer** · `auth.signup.footer.prompt` · <sub>src/pages/auth/SignUp.tsx:98</sub>

> Already have an account?

**Footer link** · `auth.signup.footer.link` · <sub>src/pages/auth/SignUp.tsx:100</sub>

> Log in

### Sign up — consent

**Compliance-sensitive. The exact words a user agreed to are captured as a versioned snapshot in `src/lib/agreements.ts` and written to an append-only consent audit trail. Changing the wording means the version must be bumped, and every past acceptance then refers to older wording. Leave alone unless you are deliberately revising the consent.**

**Key explaining the asterisk** · `auth.consent.required_key` · <sub>src/components/ui/Field.tsx:146</sub>

> Boxes marked * are required.

- *Appears on:* /sign-up, /finish-setup.
- *Note:* A screen reader hears "Boxes marked with an asterisk are required", because the character itself is hidden and the words stand in for it.

**Terms checkbox** · `auth.consent.terms` · <sub>2 files — see the manifest</sub>

> I accept the Terms of Service.

- *Appears on:* /sign-up, /finish-setup.
- *Must stay true:* Consent wording (point 4 above). It is version-stamped and stored in the audit trail. Change it on purpose or not at all.

**Error when the box is not ticked** · `auth.consent.terms.error` · <sub>src/pages/auth/SignUp.tsx:67</sub>

> Please accept the Terms of Service to create your account.

**Marketing email checkbox** · `auth.consent.marketing` · <sub>2 files — see the manifest</sub>

> Send me product tips and offers by email. Optional, unsubscribe any time.

- *Appears on:* /sign-up, /finish-setup.
- *Must stay true:* Consent wording (point 4 above). It is version-stamped and stored in the audit trail. Change it on purpose or not at all.

**Note under the form** · `auth.consent.footnote` · <sub>src/pages/auth/SignUp.tsx:208</sub>

> The email box is optional. Change it any time from your account settings, or unsubscribe using the link in any marketing email. Advertising and retargeting follows your cookie choice, which you can change from the footer of any page.

- *Must stay true:* Consent wording (point 4 above). It is version-stamped and stored in the audit trail. Change it on purpose or not at all.
- *Must stay true:* It is true that advertising is not asked on this form: it is derived from the cookie banner. Do not add an advertising checkbox here without changing the wording.

**Stored consent title, terms** · `auth.consent.agreement.terms_title` · <sub>src/lib/agreements.ts:38</sub>

> Terms of Service

- *Note:* Written into the consent audit trail, not shown on screen. Changing it changes what past records are compared against.

**Stored consent title, email** · `auth.consent.agreement.marketing_title` · <sub>src/lib/agreements.ts:46</sub>

> Marketing emails

- *Note:* Also shown as the checkbox heading in Account and billing.

**Stored consent title, advertising** · `auth.consent.agreement.advertising_title` · <sub>src/lib/agreements.ts:62</sub>

> Advertising and retargeting

- *Note:* Also shown as the heading of the advertising panel in Account and billing.

### Log in

**SEO title** · `auth.login.meta.title` · <sub>src/pages/auth/LogIn.tsx:13</sub>

> Log in

- *Length:* 6 characters, 19 once ` | Batchlabel` is appended. That is within the practical limit of 60.

**Meta description** · `auth.login.meta.description` · <sub>src/pages/auth/LogIn.tsx:14</sub>

> Log in to Batchlabel to make and download your CLP labels.

- *Length:* 58 characters. That is within the practical limit of 155.
- *Note:* Not indexed (`noIndex: true`).

**Heading (h1)** · `auth.login.title` · <sub>src/pages/auth/LogIn.tsx:76</sub>

> Welcome back

**Intro** · `auth.login.intro` · <sub>src/pages/auth/LogIn.tsx:77</sub>

> Log in to pick up a saved recipe or make a new label.

**Submit button, working** · `auth.login.submit.busy` · <sub>src/pages/auth/LogIn.tsx:128</sub>

> Checking...

**Submit button** · `auth.login.submit` · <sub>src/pages/auth/LogIn.tsx:128</sub>

> Log in

**Alternative sign in** · `auth.login.magic_link` · <sub>src/pages/auth/LogIn.tsx:137</sub>

> Email me a sign in link instead

**Forgotten password link** · `auth.login.forgot` · <sub>src/pages/auth/LogIn.tsx:143</sub>

> Forgotten your password?

**Error when the link is asked for with no address** · `auth.login.error.no_email` · <sub>src/pages/auth/LogIn.tsx:60</sub>

> Add your email address first and we will send you a link.

**Footer** · `auth.login.footer.prompt` · <sub>src/pages/auth/LogIn.tsx:80</sub>

> No account yet?

**Footer link** · `auth.login.footer.link` · <sub>src/pages/auth/LogIn.tsx:82</sub>

> Make a label free

### Google sign in

The Google button only renders when `VITE_GOOGLE_AUTH_ENABLED` is on. Google's branding terms require the words 'Continue with Google' or 'Sign in with Google' beside their mark, so this label is not free text.

**Button** · `auth.google.button` · <sub>src/components/auth/GoogleButton.tsx:8,21,52</sub>

> Continue with Google

- *Must stay true:* Google's branding terms constrain this wording.

**Divider between Google and the form** · `auth.google.divider` · <sub>src/components/auth/GoogleButton.tsx:72</sub>

> or

### Forgotten password

**SEO title** · `auth.forgot.meta.title` · <sub>src/pages/auth/ForgotPassword.tsx:11</sub>

> Reset your password

- *Length:* 19 characters, 32 once ` | Batchlabel` is appended. That is within the practical limit of 60.

**Meta description** · `auth.forgot.meta.description` · <sub>src/pages/auth/ForgotPassword.tsx:12</sub>

> Send yourself a password reset link for your Batchlabel account.

- *Length:* 64 characters. That is within the practical limit of 155.

**Heading (h1)** · `auth.forgot.title` · <sub>src/pages/auth/ForgotPassword.tsx:37</sub>

> Forgotten your password?

**Intro** · `auth.forgot.intro` · <sub>src/pages/auth/ForgotPassword.tsx:38</sub>

> Happens to all of us. Put in your email and we will send you a link to set a new one.

**Submit button, working** · `auth.forgot.submit.busy` · <sub>src/pages/auth/ForgotPassword.tsx:70</sub>

> Sending...

**Submit button** · `auth.forgot.submit` · <sub>src/pages/auth/ForgotPassword.tsx:70</sub>

> Send me a reset link

**Confirmation** · `auth.forgot.sent` · <sub>src/pages/auth/ForgotPassword.tsx:50</sub>

> If we have an account for [email], a reset link is on its way. It is valid for one hour.

- *Must stay true:* The one hour expiry is a Supabase setting. If the setting changes this sentence is wrong.
- *Must stay true:* The 'if we have an account' hedge is deliberate: it stops the screen confirming whether an address is registered.

**Note under the confirmation** · `auth.forgot.sent_help` · <sub>src/pages/auth/ForgotPassword.tsx:53</sub>

> Nothing in a few minutes? Check your spam folder, then email hello@batchlabel.co.uk and we will sort it out.

**Footer link** · `auth.forgot.footer.link` · <sub>2 files — see the manifest</sub>

> Back to log in

- *Appears on:* /forgot-password, /reset-password.

### Check your email

**SEO title** · `auth.checkemail.meta.title` · <sub>src/pages/auth/CheckEmail.tsx:8</sub>

> Check your email

- *Length:* 16 characters, 29 once ` | Batchlabel` is appended. That is within the practical limit of 60.

**Meta description** · `auth.checkemail.meta.description` · <sub>src/pages/auth/CheckEmail.tsx:9</sub>

> We have sent you a link to confirm your Batchlabel account.

- *Length:* 59 characters. That is within the practical limit of 155.

**Heading (h1)** · `auth.checkemail.title` · <sub>src/pages/auth/CheckEmail.tsx:19</sub>

> Check your email

**Intro, sign in link** · `auth.checkemail.intro.magic` · <sub>src/pages/auth/CheckEmail.tsx:22</sub>

> We have sent you a link that signs you straight in. No password to remember.

**Intro, confirm your address** · `auth.checkemail.intro.confirm` · <sub>src/pages/auth/CheckEmail.tsx:23</sub>

> We have sent you a link to confirm your address. One click and your account is live.

**Confirmation panel** · `auth.checkemail.sent` · <sub>src/pages/auth/CheckEmail.tsx:38</sub>

> Sent to [email address]. The link is valid for one hour.

- *Must stay true:* The one hour expiry is a Supabase setting.

**Used when no address was passed through** · `auth.checkemail.fallback` · <sub>src/pages/auth/CheckEmail.tsx:38</sub>

> your email address

**Step 1** · `auth.checkemail.step.1` · <sub>src/pages/auth/CheckEmail.tsx:44</sub>

> 1. Open the email from Batchlabel.

**Step 2** · `auth.checkemail.step.2` · <sub>src/pages/auth/CheckEmail.tsx:45</sub>

> 2. Tap the link. It opens your dashboard.

**Step 3** · `auth.checkemail.step.3` · <sub>src/pages/auth/CheckEmail.tsx:46</sub>

> 3. Have your fragrance supplier safety data sheet ready and make your first label.

**Help text** · `auth.checkemail.help` · <sub>src/pages/auth/CheckEmail.tsx:50</sub>

> Nothing after a few minutes? Check spam, and check the address above is right. Still stuck, email hello@batchlabel.co.uk.

**Footer** · `auth.checkemail.footer.prompt` · <sub>src/pages/auth/CheckEmail.tsx:27</sub>

> Wrong address?

**Footer link** · `auth.checkemail.footer.link` · <sub>src/pages/auth/CheckEmail.tsx:29</sub>

> Start again

### Set a new password

**SEO title** · `auth.reset.meta.title` · <sub>src/pages/auth/ResetPassword.tsx:11</sub>

> Set a new password

- *Length:* 18 characters, 31 once ` | Batchlabel` is appended. That is within the practical limit of 60.

**Meta description** · `auth.reset.meta.description` · <sub>src/pages/auth/ResetPassword.tsx:12</sub>

> Choose a new password for your Batchlabel account.

- *Length:* 50 characters. That is within the practical limit of 155.

**Heading (h1)** · `auth.reset.title` · <sub>src/pages/auth/ResetPassword.tsx:46</sub>

> Set a new password

**Intro** · `auth.reset.intro` · <sub>src/pages/auth/ResetPassword.tsx:47</sub>

> Pick something you will remember. A short phrase is stronger than a clever word.

**Field label** · `auth.reset.field.new.label` · <sub>src/pages/auth/ResetPassword.tsx:58</sub>

> New password

**Field hint** · `auth.reset.field.new.hint` · <sub>src/pages/auth/ResetPassword.tsx:65</sub>

> At least eight characters.

- *Must stay true:* This screen does enforce eight characters.

**Field label** · `auth.reset.field.confirm.label` · <sub>src/pages/auth/ResetPassword.tsx:68</sub>

> Confirm new password

**Validation message** · `auth.reset.error.too_short` · <sub>src/pages/auth/ResetPassword.tsx:26</sub>

> Please use at least eight characters.

**Validation message** · `auth.reset.error.mismatch` · <sub>src/pages/auth/ResetPassword.tsx:30</sub>

> The two passwords do not match.

**Submit button, working** · `auth.reset.submit.busy` · <sub>src/pages/auth/ResetPassword.tsx:78</sub>

> Saving...

**Submit button** · `auth.reset.submit` · <sub>src/pages/auth/ResetPassword.tsx:78</sub>

> Save my new password

### Finish setting up (after signing up with Google)

Google's redirect cannot carry a shop name or a Terms acceptance, so both are collected here instead. The consent checkboxes are the same strings as on the sign-up form and are listed under **Sign up — consent**. Compliance-sensitive. The exact words a user agreed to are captured as a versioned snapshot in `src/lib/agreements.ts` and written to an append-only consent audit trail. Changing the wording means the version must be bumped, and every past acceptance then refers to older wording. Leave alone unless you are deliberately revising the consent.

**SEO title** · `auth.finish.meta.title` · <sub>src/pages/auth/FinishSetup.tsx:40</sub>

> Finish setting up your account

- *Length:* 30 characters, 43 once ` | Batchlabel` is appended. That is within the practical limit of 60.

**Meta description** · `auth.finish.meta.description` · <sub>src/pages/auth/FinishSetup.tsx:41</sub>

> One more step before your first label.

- *Length:* 38 characters. That is within the practical limit of 155.

**Heading (h1)** · `auth.finish.title` · <sub>src/pages/auth/FinishSetup.tsx:98</sub>

> One more thing before your first label

**Intro when the address is known** · `auth.finish.intro.signed_in` · <sub>src/pages/auth/FinishSetup.tsx:101</sub>

> You are signed in as [email]. We need your shop name and your agreement to the terms.

**Intro when it is not** · `auth.finish.intro.fallback` · <sub>src/pages/auth/FinishSetup.tsx:101,102</sub>

> We need your shop name and your agreement to the terms.

**Error when the box is not ticked** · `auth.finish.terms.error` · <sub>2 files — see the manifest</sub>

> Please accept the Terms of Service to finish setting up your account.

- *Shared:* the same string is in 2 files (`src/lib/membership.ts`, `src/pages/auth/FinishSetup.tsx`). One edit means all of them.
- *Note:* The same sentence is also returned by the server-side guard in `src/lib/membership.ts`. Change both.

**Submit button** · `auth.finish.submit` · <sub>src/pages/auth/FinishSetup.tsx:160</sub>

> Finish and start my label

**Note under the form** · `auth.finish.footnote` · <sub>src/pages/auth/FinishSetup.tsx:164</sub>

> The email box is optional and can be changed any time from your account settings, or unsubscribe using the link in any marketing email. Advertising and retargeting follows your cookie choice, which you can change from the footer of any page.

- *Must stay true:* Consent wording (point 4 above). It is version-stamped and stored in the audit trail. Change it on purpose or not at all.
- *Note:* Almost, but not exactly, the same sentence as `auth.consent.footnote` on the sign-up form.

**Footer** · `auth.finish.footer.prompt` · <sub>src/pages/auth/FinishSetup.tsx:106</sub>

> Wrong account?

**Footer link** · `auth.finish.footer.link` · <sub>2 files — see the manifest</sub>

> Log out

- *Appears on:* /finish-setup, /dashboard.

### Auth screen wrapper

**Disclaimer under every auth screen** · `auth.shell.disclaimer` · <sub>src/components/auth/AuthShell.tsx:33</sub>

> Batchlabel produces labels against published UK CLP and EU CLP requirements from the information you provide. Responsibility for the final label rests with you as the seller. See our terms and privacy policy.

- *Note:* One of five near-identical disclaimers. See 'Flagged while extracting'.

**Link text** · `auth.shell.link.terms` · <sub>src/components/auth/AuthShell.tsx:37</sub>

> terms

**Link text** · `auth.shell.link.privacy` · <sub>src/components/auth/AuthShell.tsx:41</sub>

> privacy policy

**Notice when sign in is switched off** · `auth.shell.not_configured` · <sub>2 files — see the manifest</sub>

> Sign in is not connected in this environment yet. The form below is complete and will work as soon as the Supabase keys are set.

- *Appears on:* /sign-up, /finish-setup.
- *Note:* Only seen in an environment with no Supabase keys, e.g. a preview build.

**Notice when sign in is switched off, log in** · `auth.login.not_configured` · <sub>src/pages/auth/LogIn.tsx:90</sub>

> Sign in is not connected in this environment yet. Add the Supabase keys to switch it on.

### Form furniture

**Added to the label of every optional field** · `form.optional_suffix` · <sub>src/components/ui/Field.tsx:36</sub>

> (optional)

- *Note:* Not currently seen anywhere: all eleven fields on the site are required. It appears the moment one is not.

**Read after a required checkbox, screen readers only** · `form.required_sr` · <sub>src/components/ui/Field.tsx:121</sub>

> (required)

---

## Checkout

Where Stripe returns a customer. Neither page is indexed. Nothing on either page changes what is charged.

### Payment received

**SEO title** · `checkout.success.meta.title` · <sub>src/pages/checkout/CheckoutSuccess.tsx:8</sub>

> Payment received

- *Length:* 16 characters, 29 once ` | Batchlabel` is appended. That is within the practical limit of 60.

**Meta description** · `checkout.success.meta.description` · <sub>src/pages/checkout/CheckoutSuccess.tsx:9</sub>

> Your Batchlabel Maker plan is active.

- *Length:* 37 characters. That is within the practical limit of 155.

**Heading (h1)** · `checkout.success.heading` · <sub>src/pages/checkout/CheckoutSuccess.tsx:23</sub>

> You are on the Maker plan

**Body** · `checkout.success.body` · <sub>src/pages/checkout/CheckoutSuccess.tsx:26</sub>

> Thank you. Watermarks are off and print ready PDF and SVG downloads are switched on. Your VAT receipt is on its way by email from Stripe.

- *Must stay true:* Stripe is the one that sends the VAT receipt. If invoicing moves, this sentence moves.

**Primary button** · `checkout.success.cta_primary` · <sub>src/pages/checkout/CheckoutSuccess.tsx:32</sub>

> Go to my dashboard

**Secondary button** · `checkout.success.cta_secondary` · <sub>2 files — see the manifest</sub>

> Read the three steps

- *Appears on:* /checkout/success, /dashboard.

**Stripe session reference** · `checkout.success.reference` · <sub>src/pages/checkout/CheckoutSuccess.tsx:40</sub>

> Reference: [session id]

**Note at the foot** · `checkout.success.footnote` · <sub>src/pages/checkout/CheckoutSuccess.tsx:45</sub>

> Anything not right? Email hello@batchlabel.co.uk and we will fix it or refund you.

- *Must stay true:* The refund promise here must not be broader than clause 5 of the terms.

### Checkout cancelled

**SEO title** · `checkout.cancelled.meta.title` · <sub>src/pages/checkout/CheckoutCancelled.tsx:6</sub>

> Checkout cancelled

- *Length:* 18 characters, 31 once ` | Batchlabel` is appended. That is within the practical limit of 60.

**Meta description** · `checkout.cancelled.meta.description` · <sub>src/pages/checkout/CheckoutCancelled.tsx:7</sub>

> You have not been charged. Your free label is still available.

- *Length:* 62 characters. That is within the practical limit of 155.

**Heading (h1)** · `checkout.cancelled.heading` · <sub>src/pages/checkout/CheckoutCancelled.tsx:15</sub>

> No payment taken

**Body** · `checkout.cancelled.body` · <sub>src/pages/checkout/CheckoutCancelled.tsx:18</sub>

> You closed the checkout, so nothing has been charged. Your free label is still there whenever you want it.

**Second paragraph** · `checkout.cancelled.body2` · <sub>src/pages/checkout/CheckoutCancelled.tsx:22</sub>

> If something on the pricing page was unclear, tell us. We would rather answer a question than take money from someone who is unsure.

**Primary button** · `checkout.cancelled.cta_primary` · <sub>src/pages/checkout/CheckoutCancelled.tsx:28</sub>

> Back to pricing

- *Note:* The same string is the analytics track label on line 27.

**Secondary button** · `checkout.cancelled.cta_secondary` · <sub>src/pages/checkout/CheckoutCancelled.tsx:31</sub>

> Ask us a question

---

## Dashboard

The account area on the marketing site. The product itself lives at app.batchlabel.xyz, so this is a shell: an empty labels screen and a billing screen. Neither page is indexed.

### Dashboard shell

**Tab** · `dashboard.tab.labels` · <sub>src/components/dashboard/DashboardLayout.tsx:7</sub>

> Labels

**Tab** · `dashboard.tab.account` · <sub>src/components/dashboard/DashboardLayout.tsx:8</sub>

> Account and billing

**Shown in place of an email address** · `dashboard.signed_out_placeholder` · <sub>2 files — see the manifest</sub>

> Not signed in

- *Appears on:* /dashboard, /dashboard/account.

**Notice when sign in is switched off** · `dashboard.not_configured` · <sub>src/components/dashboard/DashboardLayout.tsx:62</sub>

> This is the dashboard shell. Sign in is not connected in this environment, so you are seeing it as a new maker would.

**Disclaimer at the foot** · `dashboard.footer_disclaimer` · <sub>src/components/dashboard/DashboardLayout.tsx:71</sub>

> Batchlabel produces labels against published UK CLP and EU CLP requirements from the information you provide. Responsibility for the final label rests with you as the seller.

- *Note:* One of five near-identical disclaimers. See 'Flagged while extracting'.

### Your labels, and the empty state

**SEO title** · `dashboard.labels.meta.title` · <sub>src/pages/dashboard/Labels.tsx:8</sub>

> Your labels

- *Length:* 11 characters, 24 once ` | Batchlabel` is appended. That is within the practical limit of 60.

**Meta description** · `dashboard.labels.meta.description` · <sub>src/pages/dashboard/Labels.tsx:9</sub>

> Your Batchlabel dashboard.

- *Length:* 26 characters. That is within the practical limit of 155.

**Heading when the shop name is known** · `dashboard.labels.heading.named` · <sub>src/pages/dashboard/Labels.tsx:19</sub>

> Welcome, [shop name]

**Heading when it is not** · `dashboard.labels.heading.fallback` · <sub>src/pages/dashboard/Labels.tsx:19</sub>

> Your labels

**Intro** · `dashboard.labels.intro` · <sub>src/pages/dashboard/Labels.tsx:22</sub>

> Nothing here yet. Have the safety data sheet from your fragrance supplier to hand and you can be done in about ten minutes.

- *Note:* Written for someone with no labels. It says 'Nothing here yet' unconditionally.

**Empty state, heading** · `dashboard.empty.heading` · <sub>src/pages/dashboard/Labels.tsx:31</sub>

> No labels yet

**Empty state, body** · `dashboard.empty.body` · <sub>src/pages/dashboard/Labels.tsx:34</sub>

> Your first label is free. You will need your supplier safety data sheet, your fragrance percentage and your pack size.

**Empty state, primary button** · `dashboard.empty.cta_primary` · <sub>src/pages/dashboard/Labels.tsx:40</sub>

> Create your first label

- *Note:* Currently links back to /dashboard: the label builder route does not exist yet.

**Card 1, title** · `dashboard.card1.title` · <sub>src/pages/dashboard/Labels.tsx:50</sub>

> Saved recipes

**Card 1, body** · `dashboard.card1.body` · <sub>src/pages/dashboard/Labels.tsx:50</sub>

> Reuse a fragrance and pack size instead of starting again.

**Card 2, title** · `dashboard.card2.title` · <sub>src/pages/dashboard/Labels.tsx:51</sub>

> Batch codes

**Card 2, body** · `dashboard.card2.body` · <sub>src/pages/dashboard/Labels.tsx:51</sub>

> Add a batch code and date to each print run.

**Card 3, title** · `dashboard.card3.title` · <sub>src/pages/dashboard/Labels.tsx:52</sub>

> Print ready files

**Card 3, body** · `dashboard.card3.body` · <sub>src/pages/dashboard/Labels.tsx:52</sub>

> PDF at true size, plus SVG for a print shop.

### Account and billing

**SEO title** · `dashboard.account.meta.title` · <sub>src/pages/dashboard/Account.tsx:12</sub>

> Account and billing

- *Length:* 19 characters, 32 once ` | Batchlabel` is appended. That is within the practical limit of 60.

**Meta description** · `dashboard.account.meta.description` · <sub>src/pages/dashboard/Account.tsx:13</sub>

> Manage your Batchlabel account, plan and billing details.

- *Length:* 57 characters. That is within the practical limit of 155.

**Heading (h1)** · `dashboard.account.heading` · <sub>src/pages/dashboard/Account.tsx:62</sub>

> Account and billing

**Lead** · `dashboard.account.lead` · <sub>src/pages/dashboard/Account.tsx:65</sub>

> Everything about your plan in one place. No hunting through menus.

**Your details, heading** · `dashboard.account.details.heading` · <sub>src/pages/dashboard/Account.tsx:71</sub>

> Your details

**Field label** · `dashboard.account.details.email` · <sub>src/pages/dashboard/Account.tsx:75</sub>

> Email

**Field label** · `dashboard.account.details.business` · <sub>src/pages/dashboard/Account.tsx:80</sub>

> Business name

**Shown when no shop name was given** · `dashboard.account.details.unset` · <sub>src/pages/dashboard/Account.tsx:83</sub>

> Not set yet

**Note under the details** · `dashboard.account.details.note` · <sub>src/pages/dashboard/Account.tsx:88</sub>

> Need to change your email or business name? Email hello@batchlabel.co.uk and we will do it for you while the self service settings are being built.

- *Note:* Describes a manual process. It stops being true the moment self-service settings ship.

**Your plan, heading** · `dashboard.account.plan.heading` · <sub>src/pages/dashboard/Account.tsx:97</sub>

> Your plan

**Blurb offered to free accounts** · `dashboard.account.plan.upgrade_blurb` · <sub>src/pages/dashboard/Account.tsx:114</sub>

> The Maker plan is £14 a month or £140 a year, VAT included. It gives you unlimited labels, print ready PDF and SVG with no watermark, UFI generation, batch code fields and saved recipes.

- *Must stay true:* Pricing figure (point 6 above). The same numbers are in Stripe and in the structured data. Changing the words here does not change what anyone is charged.

**Upgrade button** · `dashboard.account.plan.upgrade_button` · <sub>src/pages/dashboard/Account.tsx:133</sub>

> Upgrade to Maker

- *Note:* The same string is the analytics track label on line 131.

**Upgrade button, working** · `dashboard.account.plan.upgrade_busy` · <sub>src/pages/dashboard/Account.tsx:133</sub>

> Opening checkout...

**Billing portal button** · `dashboard.account.plan.portal_button` · <sub>src/pages/dashboard/Account.tsx:142</sub>

> Manage billing

**Billing portal button, working** · `dashboard.account.plan.portal_busy` · <sub>src/pages/dashboard/Account.tsx:142</sub>

> Opening...

**Note under the buttons** · `dashboard.account.plan.portal_note` · <sub>src/pages/dashboard/Account.tsx:154</sub>

> Manage billing opens the Stripe customer portal, where you can change your card, download invoices, switch between monthly and yearly, or cancel. Cancelling leaves your access in place until the end of the period you have paid for.

- *Must stay true:* Describes what the Stripe portal is configured to allow. If the portal configuration changes, this changes.

**Your data, heading** · `dashboard.account.data.heading` · <sub>src/pages/dashboard/Account.tsx:162</sub>

> Your data

**Your data, body** · `dashboard.account.data.body` · <sub>src/pages/dashboard/Account.tsx:165</sub>

> You can ask us for a copy of everything we hold, or ask us to delete your account and your uploaded safety data sheets. Email privacy@batchlabel.co.uk and we will reply within a month, usually the same week.

- *Must stay true:* The one month reply is the UK GDPR deadline and is also promised in the privacy policy.

### Email and advertising preferences

**Compliance-sensitive. The exact words a user agreed to are captured as a versioned snapshot in `src/lib/agreements.ts` and written to an append-only consent audit trail. Changing the wording means the version must be bumped, and every past acceptance then refers to older wording. Leave alone unless you are deliberately revising the consent.**

**Heading** · `dashboard.prefs.heading` · <sub>src/components/dashboard/MarketingPreferences.tsx:62</sub>

> Email and advertising

**Lead** · `dashboard.prefs.lead` · <sub>src/components/dashboard/MarketingPreferences.tsx:65</sub>

> Both are optional. Email is a box here. Advertising follows the cookie choice you made on the site, so it is changed in cookie settings.

- *Must stay true:* It is true that advertising is only asked at the cookie banner. Do not add a second control here without changing the wording.

**While loading** · `dashboard.prefs.loading` · <sub>src/components/dashboard/MarketingPreferences.tsx:70</sub>

> Loading your preferences...

**When the read fails** · `dashboard.prefs.load_failed` · <sub>src/components/dashboard/MarketingPreferences.tsx:73</sub>

> We could not load your preferences just now. Please refresh the page.

**Under the email checkbox** · `dashboard.prefs.email_sublabel` · <sub>src/components/dashboard/MarketingPreferences.tsx:85</sub>

> Product tips and offers by email. Unsubscribe any time.

- *Must stay true:* Consent wording (point 4 above). It is version-stamped and stored in the audit trail. Change it on purpose or not at all.

**While saving** · `dashboard.prefs.saving` · <sub>src/components/dashboard/MarketingPreferences.tsx:88</sub>

> Saving...

**Advertising panel, body** · `dashboard.prefs.advertising_body` · <sub>src/components/dashboard/MarketingPreferences.tsx:94</sub>

> Your email and account details used to build ad audiences with Meta and Google. This is the marketing cookie choice, kept in one place so it cannot say two different things.

- *Must stay true:* Consent wording (point 4 above). It is version-stamped and stored in the audit trail. Change it on purpose or not at all.
- *Must stay true:* Names Meta and Google as the ad platforms. The same two are named in the cookie banner and the privacy policy.

**Advertising panel, current state** · `dashboard.prefs.advertising_state` · <sub>src/components/dashboard/MarketingPreferences.tsx:99</sub>

> Currently on. / Currently off.

**Advertising panel, button** · `dashboard.prefs.advertising_button` · <sub>src/components/dashboard/MarketingPreferences.tsx:104</sub>

> Change in cookie settings

### Plan states

One of these is shown as a badge plus a sentence, depending on what Stripe says. Written in `src/lib/entitlements.ts`. The rule they encode — never offer to sell a plan to someone who already has one — is not a copy decision.

**Badge, plan could not be read** · `plan.unknown.label` · <sub>src/lib/entitlements.ts:95</sub>

> Checking your plan...

**Sentence, plan could not be read** · `plan.unknown.detail` · <sub>src/lib/entitlements.ts:96</sub>

> We could not read your plan just now. Refresh in a moment.

**Badge, account suspended** · `plan.suspended.label` · <sub>src/lib/entitlements.ts:105</sub>

> Account suspended

**Sentence, account suspended** · `plan.suspended.detail` · <sub>src/lib/entitlements.ts:106</sub>

> Your account is suspended.

**Warning, account suspended** · `plan.suspended.warning` · <sub>src/lib/entitlements.ts:109</sub>

> Your account is suspended. Email hello@batchlabel.co.uk and we will sort it out.

**Badge, free plan** · `plan.free.label` · <sub>src/lib/entitlements.ts:115</sub>

> Free plan

**Sentence, free plan** · `plan.free.detail` · <sub>src/lib/entitlements.ts:116</sub>

> 1 label, watermarked PNG preview

- *Must stay true:* Must match the Free plan feature list on /pricing.

**Warning, subscription has ended** · `plan.cancelled.warning` · <sub>src/lib/entitlements.ts:122</sub>

> Your Maker plan has ended. Subscribe again whenever you are ready.

**Badge, on a trial** · `plan.trial.label` · <sub>src/lib/entitlements.ts:131</sub>

> Maker plan (trial)

**Sentence, on a trial** · `plan.trial.detail` · <sub>src/lib/entitlements.ts:132</sub>

> Your trial runs until [date].

- *Note:* No trial is offered anywhere in the current pricing copy.

**Sentence, on a trial with no end date** · `plan.trial.detail_nodate` · <sub>src/lib/entitlements.ts:132</sub>

> You are on a trial.

**Badge, Maker plan** · `plan.maker.label` · <sub>src/lib/entitlements.ts:141,152,163</sub>

> Maker plan

- *Note:* Used for the past-due, cancelling and active states.

**Warning, last payment failed** · `plan.past_due.warning` · <sub>src/lib/entitlements.ts:146</sub>

> Your last payment did not go through. Update your card in Manage billing to keep your plan — nothing is switched off yet.

- *Note:* Contains an em dash. VOICE.md bans em dashes in headlines; this is body text, so it is allowed, but it is the only one in the product copy.

**Sentence, cancelling at period end** · `plan.cancelling.detail` · <sub>src/lib/entitlements.ts:154</sub>

> Cancelled — your plan stays on until [date].

**Sentence, cancelling with no end date** · `plan.cancelling.detail_nodate` · <sub>src/lib/entitlements.ts:155</sub>

> Cancelled — your plan stays on until the end of the period you have paid for.

**Sentence, active Maker plan** · `plan.active.detail` · <sub>src/lib/entitlements.ts:165</sub>

> Unlimited labels, print ready PDF and SVG, UFI generation and saved recipes. Renews [date].

- *Must stay true:* Must match the Maker plan feature list on /pricing.

**Sentence, active with no renewal date** · `plan.active.detail_nodate` · <sub>src/lib/entitlements.ts:166</sub>

> Unlimited labels, print ready PDF and SVG, UFI generation and saved recipes.

**Sentence, last payment failed** · `plan.past_due.detail` · <sub>src/lib/entitlements.ts:142</sub>

> Unlimited labels, print ready PDF and SVG, UFI generation and saved recipes.

---

## Legal

**Read this before editing anything in this part.**

These four documents are legally operative. The terms in particular are **version-stamped**: `src/lib/agreements.ts` holds a version identifier for the Terms of Service, and every account's acceptance is stored with that version in an append-only audit trail. The version currently on file is `2026-07-30.2`.

That has a consequence. If you change the wording of the terms, the version must be bumped, and from that moment every existing customer has accepted a version of the document that no longer exists on the site. That is defensible — it is exactly what the version field is for — but it has to be a decision, not a side effect of tidying a sentence.

The privacy policy and the cookie policy are the documents the consent wording points at, so the same care applies.

**Recommendation: leave all four alone unless you are deliberately revising them, and get advice when you do.** They are listed here for completeness and so you can read what is currently live, not because they are an easy win.

### Shared

**Eyebrow above every legal heading** · `legal.updated_prefix` · <sub>src/components/legal/LegalLayout.tsx:14</sub>

> Last updated [month year]

**The date on all four documents** · `legal.updated_value` · <sub>4 files — see the manifest</sub>

> July 2026

- *Appears on:* /terms, /privacy, /cookie-policy, /acceptable-use.
- *Must stay true:* This is a claim about when the document last changed. If you edit any of the four, change its date.

### Terms of service — page and heading

**The terms are version-stamped. `src/lib/agreements.ts` records which version each customer accepted (currently `2026-07-30.2`) and writes it to an append-only consent audit trail. If the wording changes, the version must be bumped, and every past acceptance then refers to older wording that is no longer on the site. Changing this has legal and audit consequences. Recommended: leave alone unless you are deliberately revising the document with advice.**

**SEO title** · `legal.terms.meta.title` · <sub>src/pages/legal/Terms.tsx:8</sub>

> Terms of service

- *Length:* 16 characters, 29 once ` | Batchlabel` is appended. That is within the practical limit of 60.

**Meta description** · `legal.terms.meta.description` · <sub>src/pages/legal/Terms.tsx:10</sub>

> The terms on which you use Batchlabel, including what the label generator does, the limits of our role, subscriptions, cancellation and liability.

- *Length:* 146 characters. That is within the practical limit of 155.

**Heading (h1)** · `legal.terms.title` · <sub>src/pages/legal/Terms.tsx:17</sub>

> Terms of service

**Intro** · `legal.terms.intro` · <sub>src/pages/legal/Terms.tsx:19</sub>

> Plain terms for a small tool. Please read the section on what Batchlabel does and does not do, because it matters more than the rest.

### Terms of service — clauses

**The terms are version-stamped. `src/lib/agreements.ts` records which version each customer accepted (currently `2026-07-30.2`) and writes it to an append-only consent audit trail. If the wording changes, the version must be bumped, and every past acceptance then refers to older wording that is no longer on the site. Changing this has legal and audit consequences. Recommended: leave alone unless you are deliberately revising the document with advice.**

**Clause heading** · `legal.terms.s1.title` · <sub>src/pages/legal/Terms.tsx:21</sub>

> 1. Who we are

**Clause body** · `legal.terms.s1.body` · <sub>src/pages/legal/Terms.tsx:23</sub>

> Batchlabel is a trading name of Orchestrate Technologies Ltd, registered in England and Wales, company number 16522544. Registered office: 167-169 Great Portland Street, London W1W 5PF. In these terms, "we" and "us" mean Orchestrate Technologies Ltd, and "you" means the person or business using Batchlabel.

- *Must stay true:* Company number and registered office are Companies House facts.

**Clause heading** · `legal.terms.s2.title` · <sub>src/pages/legal/Terms.tsx:30</sub>

> 2. What the service does

**Clause body** · `legal.terms.s2.p1` · <sub>src/pages/legal/Terms.tsx:32</sub>

> Batchlabel takes information you provide, including a supplier safety data sheet, a fragrance percentage, a pack size and your business details, and produces label artwork laid out against published labelling requirements under the GB CLP Regulation and EU Regulation 1272/2008 on Classification, Labelling and Packaging.

**Clause body** · `legal.terms.s2.p2` · <sub>src/pages/legal/Terms.tsx:38</sub>

> The output is artwork generated from your inputs. It is a tool that saves you time. It is not a certification, an approval, an inspection, a safety assessment or legal advice.

**Clause heading** · `legal.terms.s3.title` · <sub>src/pages/legal/Terms.tsx:43</sub>

> 3. What the service does not do, and your responsibility

**Clause body** · `legal.terms.s3.p1` · <sub>src/pages/legal/Terms.tsx:45</sub>

> This is the most important section in these terms. By using Batchlabel you accept the following.

**Clause bullet** · `legal.terms.s3.item1` · <sub>src/pages/legal/Terms.tsx:50</sub>

> We do not certify, approve, verify or confirm that any label meets your legal obligations, and we do not represent that it does.

**Clause bullet** · `legal.terms.s3.item2` · <sub>src/pages/legal/Terms.tsx:51</sub>

> We do not carry out a chemical safety assessment, a classification review by a qualified toxicologist, or a Cosmetic Product Safety Report.

**Clause bullet** · `legal.terms.s3.item3` · <sub>src/pages/legal/Terms.tsx:52</sub>

> Our output depends entirely on the accuracy and currency of the information you enter, including the safety data sheet you upload and the percentages you type. We cannot detect an out of date safety data sheet or an incorrect recipe.

**Clause bullet** · `legal.terms.s3.item4` · <sub>src/pages/legal/Terms.tsx:53</sub>

> You remain the supplier of your product for the purposes of labelling law. Responsibility for the final label, for checking it against your own product and circumstances, and for any other obligation such as poison centre notification, packaging, weights and measures or product safety, rests with you.

**Clause bullet** · `legal.terms.s3.item5` · <sub>src/pages/legal/Terms.tsx:54</sub>

> Regulations, guidance and their interpretation change. We update the service as we become aware of changes, but we do not warrant that the service reflects every change at any given moment.

**Clause bullet** · `legal.terms.s3.item6` · <sub>src/pages/legal/Terms.tsx:55</sub>

> Where your product is unusual, borderline, or your safety data sheet is incomplete, you should take independent professional advice before selling.

**Clause body** · `legal.terms.s3.p2` · <sub>src/pages/legal/Terms.tsx:59</sub>

> If you need someone to take legal responsibility for your classification, engage a suitably qualified consultant. Batchlabel is not a substitute for that, and we will say so plainly whenever anyone asks.

**Clause heading** · `legal.terms.s4.title` · <sub>src/pages/legal/Terms.tsx:65</sub>

> 4. Your account

**Clause body** · `legal.terms.s4.body` · <sub>src/pages/legal/Terms.tsx:67</sub>

> You must give an accurate email address, keep your password to yourself, and tell us promptly if you think someone else has access. You are responsible for activity under your account. Accounts are for one business, and the Maker plan allows up to five named people within that business.

- *Must stay true:* The five person limit is also a bullet on /pricing.

**Clause heading** · `legal.terms.s5.title` · <sub>src/pages/legal/Terms.tsx:74</sub>

> 5. Plans, prices and payment

**Clause bullet** · `legal.terms.s5.item1` · <sub>src/pages/legal/Terms.tsx:77</sub>

> The Free plan allows one watermarked label and requires no payment card.

**Clause bullet** · `legal.terms.s5.item2` · <sub>src/pages/legal/Terms.tsx:78</sub>

> The Maker plan is £14 per month or £140 per year. Prices shown on the site are inclusive of VAT for consumers. VAT registered businesses may enter a VAT number at checkout, and Stripe Tax will apply the correct treatment on the invoice.

- *Must stay true:* These figures are also in Stripe, on /pricing and in the structured data. They must not drift apart.

**Clause bullet** · `legal.terms.s5.item3` · <sub>src/pages/legal/Terms.tsx:79</sub>

> Payments are handled by Stripe. We never see or store your full card details.

**Clause bullet** · `legal.terms.s5.item4` · <sub>src/pages/legal/Terms.tsx:80</sub>

> Subscriptions renew automatically until cancelled. You can cancel at any time through the billing portal in your dashboard, and you keep access until the end of the period you have paid for.

**Clause bullet** · `legal.terms.s5.item5` · <sub>src/pages/legal/Terms.tsx:81</sub>

> If Batchlabel does not do what the pricing page describes, tell us within 14 days of payment and we will refund you in full if we cannot put it right. Annual plans cancelled part way through are refunded pro rata on request.

- *Must stay true:* The same promise is made twice on /faq and once on /pricing.

**Clause bullet** · `legal.terms.s5.item6` · <sub>src/pages/legal/Terms.tsx:82</sub>

> We may change prices for future billing periods. We will give you at least 30 days notice by email, and you may cancel before the change takes effect.

**Clause heading** · `legal.terms.s6.title` · <sub>src/pages/legal/Terms.tsx:87</sub>

> 6. Your content

**Clause body** · `legal.terms.s6.body` · <sub>src/pages/legal/Terms.tsx:89</sub>

> You keep ownership of everything you upload and of the label artwork you generate. You grant us permission to store and process your files only so far as we need to in order to run the service for you. We do not sell your data, and we do not use your safety data sheets to train models for third parties.

**Clause heading** · `legal.terms.s7.title` · <sub>src/pages/legal/Terms.tsx:96</sub>

> 7. Acceptable use

**Clause body** · `legal.terms.s7.body` · <sub>src/pages/legal/Terms.tsx:98,102</sub>

> Our acceptable use policy forms part of these terms. In short: do not break the law with our tool, do not attack the service, and do not resell it as your own compliance approval.

- *Split:* this sentence is stored as 2 fragments either side of a link. Rewriting it needs a human to decide where the link falls.

**Link text inside the clause** · `legal.terms.s7.link` · <sub>src/pages/legal/Terms.tsx:100</sub>

> acceptable use policy

**Clause heading** · `legal.terms.s8.title` · <sub>src/pages/legal/Terms.tsx:107</sub>

> 8. Availability

**Clause body** · `legal.terms.s8.body` · <sub>src/pages/legal/Terms.tsx:109</sub>

> We aim to keep Batchlabel available and quick, but we do not promise uninterrupted service. We may suspend access for maintenance, and we will avoid busy periods where we can.

**Clause heading** · `legal.terms.s9.title` · <sub>src/pages/legal/Terms.tsx:114</sub>

> 9. Liability

**Clause body** · `legal.terms.s9.p1` · <sub>src/pages/legal/Terms.tsx:116</sub>

> Nothing in these terms limits liability that cannot be limited by law, including for death or personal injury caused by negligence, or for fraud.

**Clause body** · `legal.terms.s9.p2` · <sub>src/pages/legal/Terms.tsx:120</sub>

> Subject to that, and because the service produces artwork from information you control, our total liability to you in connection with the service is limited to the greater of the amount you paid us in the twelve months before the claim, or £100. We are not liable for loss of profit, loss of sales, loss of goodwill, regulatory penalties, product recall costs, marketplace delisting, or any indirect or consequential loss.

- *Must stay true:* This is the liability cap. Do not reword it without advice.

**Clause body** · `legal.terms.s9.p3` · <sub>src/pages/legal/Terms.tsx:127</sub>

> If you are using Batchlabel as a consumer, you keep all your statutory rights and this section does not affect them.

**Clause heading** · `legal.terms.s10.title` · <sub>src/pages/legal/Terms.tsx:132</sub>

> 10. Ending the agreement

**Clause body** · `legal.terms.s10.body` · <sub>src/pages/legal/Terms.tsx:134</sub>

> You may stop using Batchlabel and delete your account at any time. We may suspend or close an account that breaches these terms or the acceptable use policy, and we will explain why unless we are legally prevented from doing so.

**Clause heading** · `legal.terms.s11.title` · <sub>src/pages/legal/Terms.tsx:140</sub>

> 11. Law and disputes

**Clause body** · `legal.terms.s11.body` · <sub>src/pages/legal/Terms.tsx:142</sub>

> These terms are governed by the law of England and Wales, and the courts of England and Wales have exclusive jurisdiction. If you live in Scotland or Northern Ireland, you may also bring proceedings in your local courts.

**Clause heading** · `legal.terms.s12.title` · <sub>src/pages/legal/Terms.tsx:148</sub>

> 12. Contact

**Clause body** · `legal.terms.s12.body` · <sub>src/pages/legal/Terms.tsx:150</sub>

> Questions about these terms: hello@batchlabel.co.uk.

### Privacy policy

**Changing this has legal and audit consequences. Recommended: leave alone unless you are deliberately revising the document with advice. This is also the document the consent wording points at.**

**SEO title** · `legal.privacy.meta.title` · <sub>src/pages/legal/Privacy.tsx:8</sub>

> Privacy policy

- *Length:* 14 characters, 27 once ` | Batchlabel` is appended. That is within the practical limit of 60.

**Meta description** · `legal.privacy.meta.description` · <sub>src/pages/legal/Privacy.tsx:10</sub>

> What personal data Batchlabel collects, why we collect it, how long we keep it, who processes it, and the rights you have under UK GDPR.

- *Length:* 136 characters. That is within the practical limit of 155.

**Heading (h1)** · `legal.privacy.title` · <sub>src/pages/legal/Privacy.tsx:17</sub>

> Privacy policy

**Intro** · `legal.privacy.intro` · <sub>src/pages/legal/Privacy.tsx:19</sub>

> What we collect, why, and how to make us stop. Written to be read, not to be skipped.

**Section heading** · `legal.privacy.s1.title` · <sub>src/pages/legal/Privacy.tsx:21</sub>

> Who is the controller

**Section body** · `legal.privacy.s1.body` · <sub>src/pages/legal/Privacy.tsx:23</sub>

> Orchestrate Technologies Ltd, trading as Batchlabel, registered in England and Wales, company number 16522544, registered office 167-169 Great Portland Street, London W1W 5PF, is the data controller. Contact us at privacy@batchlabel.co.uk.

- *Must stay true:* 'Data controller' is a UK GDPR term with legal meaning.

**Section heading** · `legal.privacy.s2.title` · <sub>src/pages/legal/Privacy.tsx:33</sub>

> What we collect

**Bullet** · `legal.privacy.s2.item1` · <sub>src/pages/legal/Privacy.tsx:36</sub>

> Account data: your email address, password hash, business name, and the date you signed up. Lawful basis: performance of our contract with you.

**Bullet** · `legal.privacy.s2.item2` · <sub>src/pages/legal/Privacy.tsx:37</sub>

> Product data: the safety data sheets you upload, recipes, pack sizes, batch codes and the labels you generate. Lawful basis: performance of our contract.

**Bullet** · `legal.privacy.s2.item3` · <sub>src/pages/legal/Privacy.tsx:38</sub>

> Billing data: your Stripe customer reference, plan, invoices and VAT number if you give one. Card details are handled by Stripe and never reach us. Lawful basis: contract and our legal obligation to keep records.

**Bullet** · `legal.privacy.s2.item4` · <sub>src/pages/legal/Privacy.tsx:39</sub>

> Marketing attribution data: the campaign values in the link you arrived on, that is utm_source, utm_medium, utm_campaign, utm_term and utm_content, plus advertising click identifiers gclid, gbraid, wbraid and fbclid, the site that referred you, the first page you landed on, and the time of your first visit. These are stored in your browser and, if you create an account, saved against your account record so we know which advert paid for itself. Lawful basis: our legitimate interest in understanding how our advertising performs, and your consent where cookies or similar technologies are not strictly necessary.

- *Must stay true:* The named parameters must match what `src/lib/attribution.ts` actually captures.

**Bullet** · `legal.privacy.s2.item5` · <sub>src/pages/legal/Privacy.tsx:40</sub>

> Analytics and advertising data: how you move through the site, collected through Google Analytics 4 and the Meta Pixel via Google Tag Manager. Lawful basis: your consent. Nothing optional loads until you agree.

- *Must stay true:* 'Nothing optional loads until you agree' is the Consent Mode v2 default-denied behaviour. It is also claimed in the cookie banner and the cookie policy.

**Bullet** · `legal.privacy.s2.item6` · <sub>src/pages/legal/Privacy.tsx:41</sub>

> Support data: the emails you send us and our replies. Lawful basis: legitimate interest in helping you.

**Section heading** · `legal.privacy.s3.title` · <sub>src/pages/legal/Privacy.tsx:46</sub>

> Consent and tags

**Section body** · `legal.privacy.s3.body` · <sub>src/pages/legal/Privacy.tsx:48,57</sub>

> Analytics and marketing tags are held in a default denied state using Google Consent Mode v2 until you choose. You can change your mind at any time using cookie settings. Rejecting optional cookies does not reduce your access to the product.

- *Split:* this sentence is stored as 2 fragments either side of a link. Rewriting it needs a human to decide where the link falls.

**Link text inside the section** · `legal.privacy.s3.link` · <sub>src/pages/legal/Privacy.tsx:55</sub>

> cookie settings

**Section heading** · `legal.privacy.s4.title` · <sub>src/pages/legal/Privacy.tsx:61</sub>

> Who processes data for us

**Bullet** · `legal.privacy.s4.item1` · <sub>src/pages/legal/Privacy.tsx:64</sub>

> Supabase, for authentication and the database.

**Bullet** · `legal.privacy.s4.item2` · <sub>src/pages/legal/Privacy.tsx:65</sub>

> Stripe, for payments, tax and invoices.

**Bullet** · `legal.privacy.s4.item3` · <sub>src/pages/legal/Privacy.tsx:66</sub>

> Google, for Google Tag Manager, Google Analytics 4 and Google Ads measurement, where you have consented.

**Bullet** · `legal.privacy.s4.item4` · <sub>src/pages/legal/Privacy.tsx:67</sub>

> Meta, for advertising measurement, where you have consented.

**Bullet** · `legal.privacy.s4.item5` · <sub>src/pages/legal/Privacy.tsx:68</sub>

> Our email provider, for account and support email.

**Section body** · `legal.privacy.s4.body` · <sub>src/pages/legal/Privacy.tsx:72</sub>

> Some of these providers are outside the UK. Where data leaves the UK or EEA we rely on the UK International Data Transfer Addendum or the European Commission standard contractual clauses.

- *Must stay true:* Names the actual transfer mechanism relied on.

**Section heading** · `legal.privacy.s5.title` · <sub>src/pages/legal/Privacy.tsx:78</sub>

> How long we keep things

**Bullet** · `legal.privacy.s5.item1` · <sub>src/pages/legal/Privacy.tsx:81</sub>

> Account and product data: while your account is open, then 30 days after you delete it, unless you ask us to remove it sooner.

**Bullet** · `legal.privacy.s5.item2` · <sub>src/pages/legal/Privacy.tsx:82</sub>

> Billing records: six years, because tax law requires it.

**Bullet** · `legal.privacy.s5.item3` · <sub>src/pages/legal/Privacy.tsx:83</sub>

> Attribution data: 24 months from first visit.

- *Must stay true:* The cookie policy says the `bl_attr` cookie lasts 12 months. See 'Flagged while extracting'.

**Bullet** · `legal.privacy.s5.item4` · <sub>src/pages/legal/Privacy.tsx:84</sub>

> Analytics data: 14 months in Google Analytics 4.

**Bullet** · `legal.privacy.s5.item5` · <sub>src/pages/legal/Privacy.tsx:85</sub>

> Support email: three years.

**Section heading** · `legal.privacy.s6.title` · <sub>src/pages/legal/Privacy.tsx:90</sub>

> Your rights

**Section body** · `legal.privacy.s6.body` · <sub>src/pages/legal/Privacy.tsx:92,98</sub>

> Under the UK GDPR you can ask for a copy of your data, ask us to correct or delete it, ask us to restrict or stop certain processing, object to processing based on legitimate interests, and withdraw consent for analytics and marketing at any time. Email privacy@batchlabel.co.uk and we will reply within one month. If we get it wrong you can complain to the Information Commissioner's Office at ico.org.uk.

- *Must stay true:* The list of rights and the one month deadline are set by UK GDPR, not by us.
- *Split:* this sentence is stored as 2 fragments either side of a link. Rewriting it needs a human to decide where the link falls.

**Section heading** · `legal.privacy.s7.title` · <sub>src/pages/legal/Privacy.tsx:103</sub>

> Security

**Section body** · `legal.privacy.s7.body` · <sub>src/pages/legal/Privacy.tsx:105</sub>

> Data is encrypted in transit and at rest. Access to production data is limited to the people who need it. We do not sell personal data, and we do not share your uploaded safety data sheets with anyone outside the providers listed above.

**Section heading** · `legal.privacy.s8.title` · <sub>src/pages/legal/Privacy.tsx:111</sub>

> Children

**Section body** · `legal.privacy.s8.body` · <sub>src/pages/legal/Privacy.tsx:112</sub>

> Batchlabel is for businesses and is not intended for anyone under 16.

### Cookie policy

**Changing this has legal and audit consequences. Recommended: leave alone unless you are deliberately revising the document with advice.** This is the document the cookie banner links to, so the two must describe the same behaviour.

**SEO title** · `legal.cookies.meta.title` · <sub>src/pages/legal/CookiePolicy.tsx:49</sub>

> Cookie policy

- *Length:* 13 characters, 26 once ` | Batchlabel` is appended. That is within the practical limit of 60.

**Meta description** · `legal.cookies.meta.description` · <sub>src/pages/legal/CookiePolicy.tsx:51</sub>

> Every cookie Batchlabel sets, what it does, how long it lasts, and how to change your choices at any time.

- *Length:* 106 characters. That is within the practical limit of 155.

**Heading (h1)** · `legal.cookies.title` · <sub>src/pages/legal/CookiePolicy.tsx:58</sub>

> Cookie policy

**Intro** · `legal.cookies.intro` · <sub>src/pages/legal/CookiePolicy.tsx:60</sub>

> A short list of what we set and why. Optional cookies do not load until you say yes.

**Section heading** · `legal.cookies.s1.title` · <sub>src/pages/legal/CookiePolicy.tsx:62</sub>

> How consent works here

**Section body** · `legal.cookies.s1.body` · <sub>src/pages/legal/CookiePolicy.tsx:64</sub>

> Tags are managed through Google Tag Manager and held in a default denied state using Google Consent Mode v2. Until you accept, analytics and advertising tags do not run and no analytics or marketing cookies are written. Choosing "Reject optional" keeps them off.

- *Must stay true:* Describes the actual Consent Mode v2 configuration.
- *Must stay true:* It quotes the banner button label 'Reject optional'. If the button is renamed, this sentence is wrong.

**Button** · `legal.cookies.s1.button` · <sub>src/pages/legal/CookiePolicy.tsx:70</sub>

> Change your cookie settings

**Section heading** · `legal.cookies.s2.title` · <sub>src/pages/legal/CookiePolicy.tsx:75</sub>

> What we set

**Table header** · `legal.cookies.table.name` · <sub>src/pages/legal/CookiePolicy.tsx:81</sub>

> Name

**Table header** · `legal.cookies.table.category` · <sub>src/pages/legal/CookiePolicy.tsx:82</sub>

> Category

**Table header** · `legal.cookies.table.purpose` · <sub>src/pages/legal/CookiePolicy.tsx:83</sub>

> Purpose

**Table header** · `legal.cookies.table.life` · <sub>src/pages/legal/CookiePolicy.tsx:84</sub>

> Life

**Category label** · `legal.cookies.category.necessary` · <sub>src/pages/legal/CookiePolicy.tsx:10,23</sub>

> Strictly necessary

- *Note:* Used by two rows. Also the title of the first cookie banner toggle, which is a separate string.

**Category label** · `legal.cookies.category.marketing` · <sub>src/pages/legal/CookiePolicy.tsx:16,35,41</sub>

> Marketing, set only with consent

- *Note:* Used by three rows.

**Category label** · `legal.cookies.category.analytics` · <sub>src/pages/legal/CookiePolicy.tsx:29</sub>

> Analytics, set only with consent

**bl_consent, purpose** · `legal.cookies.row1.purpose` · <sub>src/pages/legal/CookiePolicy.tsx:11</sub>

> Remembers your cookie choices so we do not ask again.

**bl_consent, life** · `legal.cookies.row1.life` · <sub>src/pages/legal/CookiePolicy.tsx:12</sub>

> 6 months

- *Must stay true:* This is the real cookie lifetime set in `src/lib/consent.ts`.

**bl_attr, purpose** · `legal.cookies.row2.purpose` · <sub>src/pages/legal/CookiePolicy.tsx:18</sub>

> Stores the campaign and click values from the link you first arrived on, so we can tell which advert brought you here.

**bl_attr, life** · `legal.cookies.row2.life` · <sub>src/pages/legal/CookiePolicy.tsx:19</sub>

> 12 months

- *Must stay true:* The privacy policy says attribution data is kept for 24 months. See 'Flagged while extracting'.

**Supabase session, purpose** · `legal.cookies.row3.purpose` · <sub>src/pages/legal/CookiePolicy.tsx:24</sub>

> Keeps you signed in to your Batchlabel account. Set by Supabase.

**Supabase session, life** · `legal.cookies.row3.life` · <sub>src/pages/legal/CookiePolicy.tsx:25</sub>

> Session and 30 days

**Google Analytics, purpose** · `legal.cookies.row4.purpose` · <sub>src/pages/legal/CookiePolicy.tsx:30</sub>

> Google Analytics 4 measures which pages help and which confuse.

**Google Analytics, life** · `legal.cookies.row4.life` · <sub>src/pages/legal/CookiePolicy.tsx:31</sub>

> 13 months

**Meta Pixel, purpose** · `legal.cookies.row5.purpose` · <sub>src/pages/legal/CookiePolicy.tsx:36</sub>

> Meta Pixel measures whether a Facebook or Instagram advert led to a sign up.

**Meta Pixel, life** · `legal.cookies.row5.life` · <sub>src/pages/legal/CookiePolicy.tsx:37</sub>

> 3 months

- *Note:* Used by both the Meta and the Google Ads rows.

**Google Ads, purpose** · `legal.cookies.row6.purpose` · <sub>src/pages/legal/CookiePolicy.tsx:42</sub>

> Google Ads conversion measurement.

**Section heading** · `legal.cookies.s3.title` · <sub>src/pages/legal/CookiePolicy.tsx:103</sub>

> Local storage

**Section body** · `legal.cookies.s3.body` · <sub>src/pages/legal/CookiePolicy.tsx:105</sub>

> We also use your browser's local storage for the same two purposes: remembering your cookie choice, and keeping the first campaign values we saw. Clearing site data removes both, and the banner will ask again on your next visit.

**Section heading** · `legal.cookies.s4.title` · <sub>src/pages/legal/CookiePolicy.tsx:111</sub>

> Browser controls

**Section body** · `legal.cookies.s4.body` · <sub>src/pages/legal/CookiePolicy.tsx:113</sub>

> You can block or delete cookies in your browser settings. Blocking the strictly necessary ones will stop you signing in, because that is how the session is kept.

### Acceptable use policy

**Changing this has legal and audit consequences. Recommended: leave alone unless you are deliberately revising the document with advice.** It forms part of the terms, so it inherits their versioning problem.

**SEO title** · `legal.aup.meta.title` · <sub>src/pages/legal/AcceptableUse.tsx:7</sub>

> Acceptable use policy

- *Length:* 21 characters, 34 once ` | Batchlabel` is appended. That is within the practical limit of 60.

**Meta description** · `legal.aup.meta.description` · <sub>src/pages/legal/AcceptableUse.tsx:9</sub>

> The short list of things you must not do with Batchlabel, including misrepresenting our output as an approval or certification.

- *Length:* 127 characters. That is within the practical limit of 155.

**Heading (h1)** · `legal.aup.title` · <sub>src/pages/legal/AcceptableUse.tsx:16</sub>

> Acceptable use policy

**Intro** · `legal.aup.intro` · <sub>src/pages/legal/AcceptableUse.tsx:18</sub>

> Short and obvious. This policy forms part of our terms of service.

**Section heading** · `legal.aup.s1.title` · <sub>src/pages/legal/AcceptableUse.tsx:20</sub>

> Please do not

**Bullet** · `legal.aup.s1.item1` · <sub>src/pages/legal/AcceptableUse.tsx:23</sub>

> Describe a Batchlabel output as certified, approved, verified or guaranteed by us, or imply that we take responsibility for your label. We do not, and saying otherwise misleads your customers.

**Bullet** · `legal.aup.s1.item2` · <sub>src/pages/legal/AcceptableUse.tsx:24</sub>

> Upload safety data sheets or documents you have no right to use, or anyone else’s confidential information.

- *Note:* Written in the source with a `\u2019` escape for the apostrophe.

**Bullet** · `legal.aup.s1.item3` · <sub>src/pages/legal/AcceptableUse.tsx:25</sub>

> Use the service to label a product you know to be unsafe, or to hide a hazard you are aware of.

**Bullet** · `legal.aup.s1.item4` · <sub>src/pages/legal/AcceptableUse.tsx:26</sub>

> Resell, white label or repackage Batchlabel output as a compliance assessment service without a written agreement with us.

**Bullet** · `legal.aup.s1.item5` · <sub>src/pages/legal/AcceptableUse.tsx:27</sub>

> Share one account across separate businesses, or exceed the number of people your plan allows.

**Bullet** · `legal.aup.s1.item6` · <sub>src/pages/legal/AcceptableUse.tsx:28</sub>

> Scrape, reverse engineer, load test or attack the service, or try to reach data belonging to another account.

**Bullet** · `legal.aup.s1.item7` · <sub>src/pages/legal/AcceptableUse.tsx:29</sub>

> Upload malware, or use the service to send unlawful, abusive or infringing content.

**Bullet** · `legal.aup.s1.item8` · <sub>src/pages/legal/AcceptableUse.tsx:30</sub>

> Circumvent usage limits, watermarks or payment.

**Section heading** · `legal.aup.s2.title` · <sub>src/pages/legal/AcceptableUse.tsx:35</sub>

> What happens if you do

**Section body** · `legal.aup.s2.body` · <sub>src/pages/legal/AcceptableUse.tsx:37</sub>

> We will normally email you first and ask you to put it right. For serious matters, in particular anything that puts consumers at risk or threatens the service for other makers, we may suspend or close the account immediately. Where the law requires it, we will report the matter to the relevant authority.

**Section heading** · `legal.aup.s3.title` · <sub>src/pages/legal/AcceptableUse.tsx:44</sub>

> Reporting misuse

**Section body** · `legal.aup.s3.body` · <sub>src/pages/legal/AcceptableUse.tsx:46,50</sub>

> If you see Batchlabel being misrepresented or misused, tell us at hello@batchlabel.co.uk. We take it seriously, because our credibility depends on being straight about what the tool does.

- *Split:* this sentence is stored as 2 fragments either side of a link. Rewriting it needs a human to decide where the link falls.

---

## Site-wide

Copy that is not owned by one page. Edit anything here and it changes everywhere at once — which is the point, but check the list of pages under each entry before you assume a change is local.

### The one call to action

**'Make a label free' is the site's primary button and appears seventeen times across ten files.** Some of those are the visible label and some are the analytics event label that must match it. Rename it and you rename every button on the site, plus the sign-up page title.

**Primary button, everywhere** · `shared.cta.make_label_free` · <sub>10 files — see the manifest</sub>

> Make a label free

- *Appears on:* /, /how-it-works, /pricing, /faq, /about, every page (header and footer), /log-in, /sign-up.

### Header and navigation

**Skip link, visible on keyboard focus** · `layout.skip_link` · <sub>src/components/layout/SiteLayout.tsx:12</sub>

> Skip to content

**Wordmark** · `logo.wordmark` · <sub>src/components/layout/Logo.tsx:61</sub>

> Batchlabel

- *Must stay true:* The brand name. It is also in every page title, in the structured data and on the logo artwork in `public/brand`.

**Read after the wordmark, screen readers only** · `logo.sr_suffix` · <sub>src/components/layout/Logo.tsx:62</sub>

> , home

**Logo label when the wordmark is hidden** · `logo.sr_markonly` · <sub>src/components/layout/Logo.tsx:58</sub>

> Batchlabel, home

**Nav item** · `nav.how_it_works` · <sub>3 files — see the manifest</sub>

> How it works

- *Shared:* the same string is in 3 files (`src/components/layout/SiteFooter.tsx`, `src/components/layout/SiteHeader.tsx`, `src/lib/routes.ts`). One edit means all of them.
- *Note:* Header, footer and the breadcrumb label in `src/lib/routes.ts`.

**Nav item** · `nav.pricing` · <sub>3 files — see the manifest</sub>

> Pricing

- *Shared:* the same string is in 3 files (`src/components/layout/SiteFooter.tsx`, `src/components/layout/SiteHeader.tsx`, `src/lib/routes.ts`). One edit means all of them.

**Nav item** · `nav.faq` · <sub>3 files — see the manifest</sub>

> FAQ

- *Shared:* the same string is in 3 files (`src/components/layout/SiteFooter.tsx`, `src/components/layout/SiteHeader.tsx`, `src/lib/routes.ts`). One edit means all of them.

**Nav item** · `nav.about` · <sub>3 files — see the manifest</sub>

> About

- *Shared:* the same string is in 3 files (`src/components/layout/SiteFooter.tsx`, `src/components/layout/SiteHeader.tsx`, `src/lib/routes.ts`). One edit means all of them.

**Nav item, signed in** · `nav.dashboard` · <sub>src/components/layout/SiteHeader.tsx:48,88</sub>

> Dashboard

**Nav item, signed out** · `nav.log_in` · <sub>src/components/layout/SiteHeader.tsx:52,88</sub>

> Log in

**Mobile menu button, screen readers only** · `nav.menu_toggle` · <sub>src/components/layout/SiteHeader.tsx:67</sub>

> Close menu / Open menu

### Footer

**Blurb under the logo** · `footer.blurb` · <sub>src/components/layout/SiteFooter.tsx:32</sub>

> UK and EU CLP labels for small batch makers. Candles, wax melts, reed diffusers and room sprays.

- *Must stay true:* Category rule (point 2 above). Candles is the only live category, no dates and no "coming soon".

**Column heading** · `footer.col.product` · <sub>src/components/layout/SiteFooter.tsx:37</sub>

> Product

**Column heading** · `footer.col.company` · <sub>src/components/layout/SiteFooter.tsx:38</sub>

> Company

**Column heading** · `footer.col.legal` · <sub>src/components/layout/SiteFooter.tsx:42</sub>

> Legal

**Footer link** · `footer.link.contact` · <sub>2 files — see the manifest</sub>

> Contact

- *Shared:* the same string is in 2 files (`src/components/layout/SiteFooter.tsx`, `src/lib/routes.ts`). One edit means all of them.

**Footer link** · `footer.link.terms` · <sub>2 files — see the manifest</sub>

> Terms of service

- *Shared:* the same string is in 2 files (`src/components/layout/SiteFooter.tsx`, `src/lib/routes.ts`). One edit means all of them.

**Footer link** · `footer.link.privacy` · <sub>2 files — see the manifest</sub>

> Privacy policy

- *Shared:* the same string is in 2 files (`src/components/layout/SiteFooter.tsx`, `src/lib/routes.ts`). One edit means all of them.

**Footer link** · `footer.link.cookies` · <sub>2 files — see the manifest</sub>

> Cookie policy

- *Shared:* the same string is in 2 files (`src/components/layout/SiteFooter.tsx`, `src/lib/routes.ts`). One edit means all of them.

**Footer link** · `footer.link.aup` · <sub>2 files — see the manifest</sub>

> Acceptable use

- *Shared:* the same string is in 2 files (`src/components/layout/SiteFooter.tsx`, `src/lib/routes.ts`). One edit means all of them.

**Reopens the cookie banner** · `footer.cookie_settings` · <sub>src/components/layout/SiteFooter.tsx:58</sub>

> Cookie settings

- *Must stay true:* This is the withdrawal route promised in the privacy policy, the sign-up footnote and the account area. It must stay reachable from every page.

**Contact address** · `footer.email` · <sub>src/components/layout/SiteFooter.tsx:62</sub>

> hello@batchlabel.co.uk

**Disclaimer** · `footer.disclaimer` · <sub>src/components/layout/SiteFooter.tsx:72</sub>

> Batchlabel produces labels against published UK CLP and EU CLP requirements using the information you give us. We do not certify, approve or verify labels, and we do not give legal advice. Responsibility for the final label, and for the accuracy of the safety data sheet and recipe details you enter, rests with you as the seller.

- *Note:* The longest of the five near-identical disclaimers. See 'Flagged while extracting'.

**Company details** · `footer.company_details` · <sub>src/components/layout/SiteFooter.tsx:78</sub>

> Batchlabel is a trading name of Orchestrate Technologies Ltd, registered in England and Wales, company number 16522544. Registered office: 167-169 Great Portland Street, London W1W 5PF.

- *Must stay true:* Companies House facts, and a disclosure requirement for a limited company. Also in the terms and the privacy policy.

### Closing call to action band

Appears at the foot of the home page, /how-it-works and /about with the default wording below. /faq overrides the heading and body — see **FAQ → Closing call to action**.

**Heading** · `cta_band.heading` · <sub>src/components/CtaBand.tsx:10</sub>

> Make your first label tonight

- *Appears on:* /, /how-it-works, /about.

**Body** · `cta_band.body` · <sub>src/components/CtaBand.tsx:11</sub>

> Free, and no card needed. If it does not handle your fragrance properly, you have lost ten minutes.

- *Appears on:* /, /how-it-works, /about.

**Secondary button** · `cta_band.cta_secondary` · <sub>src/components/CtaBand.tsx:35,37</sub>

> See pricing

- *Note:* Appears twice in the file: the visible label and the analytics track label.

**Disclaimer under the buttons** · `cta_band.disclaimer` · <sub>src/components/CtaBand.tsx:41</sub>

> Batchlabel builds labels against published CLP requirements from the details you provide. The final label remains your responsibility as the seller.

- *Note:* One of five near-identical disclaimers. See 'Flagged while extracting'.

### Cookie banner

**Compliance-sensitive, for the same reason as the legal pages.** The banner's marketing toggle is the *only* place advertising consent is asked, on the site and in the account area, and the choice is written to the same versioned audit trail as the signup consents (`ADVERTISING_AGREEMENT`, currently version `2026-07-30.2`, pointing at the cookie policy). Compliance-sensitive. The exact words a user agreed to are captured as a versioned snapshot in `src/lib/agreements.ts` and written to an append-only consent audit trail. Changing the wording means the version must be bumped, and every past acceptance then refers to older wording. Leave alone unless you are deliberately revising the consent.

**Heading** · `cookies.banner.title` · <sub>src/components/CookieBanner.tsx:85</sub>

> Cookies

**Body** · `cookies.banner.description` · <sub>src/components/CookieBanner.tsx:88</sub>

> We use cookies that are needed to run the site. We would also like to measure how people find us, so we know which adverts are worth paying for. Nothing optional loads until you say yes. Read our cookie policy.

- *Must stay true:* Consent wording (point 4 above). It is version-stamped and stored in the audit trail. Change it on purpose or not at all.
- *Must stay true:* 'Nothing optional loads until you say yes' is a statement about the Consent Mode v2 default-denied configuration. It is repeated in the privacy policy and the cookie policy.

**Link text** · `cookies.banner.policy_link` · <sub>src/components/CookieBanner.tsx:92</sub>

> Read our cookie policy

**Toggle 1, title** · `cookies.toggle.necessary.title` · <sub>src/components/CookieBanner.tsx:102</sub>

> Strictly necessary

- *Must stay true:* Consent wording (point 4 above). It is version-stamped and stored in the audit trail. Change it on purpose or not at all.

**Toggle 1, description** · `cookies.toggle.necessary.description` · <sub>src/components/CookieBanner.tsx:103</sub>

> Sign in, security and remembering your cookie choice. Always on.

- *Must stay true:* Consent wording (point 4 above). It is version-stamped and stored in the audit trail. Change it on purpose or not at all.
- *Must stay true:* Must match the 'Strictly necessary' rows in the cookie policy table.

**Toggle 2, title** · `cookies.toggle.analytics.title` · <sub>src/components/CookieBanner.tsx:110</sub>

> Analytics

- *Must stay true:* Consent wording (point 4 above). It is version-stamped and stored in the audit trail. Change it on purpose or not at all.

**Toggle 2, description** · `cookies.toggle.analytics.description` · <sub>src/components/CookieBanner.tsx:111</sub>

> Google Analytics 4, so we can see which pages help and which confuse.

- *Must stay true:* Consent wording (point 4 above). It is version-stamped and stored in the audit trail. Change it on purpose or not at all.
- *Must stay true:* Names the actual tool. Must match the cookie policy and the privacy policy.

**Toggle 3, title** · `cookies.toggle.marketing.title` · <sub>src/components/CookieBanner.tsx:117</sub>

> Marketing

- *Must stay true:* Consent wording (point 4 above). It is version-stamped and stored in the audit trail. Change it on purpose or not at all.

**Toggle 3, description** · `cookies.toggle.marketing.description` · <sub>src/components/CookieBanner.tsx:118</sub>

> Google Ads and Meta, so we can tell which advert brought you here.

- *Must stay true:* Consent wording (point 4 above). It is version-stamped and stored in the audit trail. Change it on purpose or not at all.
- *Must stay true:* This toggle is what sets `advertising_opt_in` on the account. Its wording is what the audit trail says the person agreed to.

**Button** · `cookies.button.accept` · <sub>src/components/CookieBanner.tsx:126</sub>

> Accept all

- *Must stay true:* Consent wording (point 4 above). It is version-stamped and stored in the audit trail. Change it on purpose or not at all.

**Button** · `cookies.button.reject` · <sub>src/components/CookieBanner.tsx:128</sub>

> Reject optional

- *Must stay true:* Consent wording (point 4 above). It is version-stamped and stored in the audit trail. Change it on purpose or not at all.
- *Must stay true:* Quoted verbatim in the cookie policy. Renaming it makes that document wrong.

**Button** · `cookies.button.save` · <sub>src/components/CookieBanner.tsx:132</sub>

> Save my choices

- *Must stay true:* Consent wording (point 4 above). It is version-stamped and stored in the audit trail. Change it on purpose or not at all.

**Button** · `cookies.button.choose` · <sub>src/components/CookieBanner.tsx:136</sub>

> Choose cookies

- *Must stay true:* Consent wording (point 4 above). It is version-stamped and stored in the audit trail. Change it on purpose or not at all.

**Fieldset legend, screen readers only** · `cookies.fieldset_legend` · <sub>src/components/CookieBanner.tsx:99</sub>

> Choose which cookies to allow

### Page not found

**SEO title** · `notfound.meta.title` · <sub>src/pages/NotFound.tsx:6</sub>

> Page not found

- *Length:* 14 characters, 27 once ` | Batchlabel` is appended. That is within the practical limit of 60.

**Meta description** · `notfound.meta.description` · <sub>src/pages/NotFound.tsx:7</sub>

> That page does not exist.

- *Length:* 25 characters. That is within the practical limit of 155.
- *Note:* Not indexed (`noIndex: true`).

**Code above the heading** · `notfound.code` · <sub>src/pages/NotFound.tsx:14</sub>

> 404

**Heading (h1)** · `notfound.heading` · <sub>src/pages/NotFound.tsx:16</sub>

> We cannot find that page

**Body** · `notfound.body` · <sub>src/pages/NotFound.tsx:19</sub>

> The link may be old, or we may have moved something.

**Primary button** · `notfound.cta_primary` · <sub>src/pages/NotFound.tsx:23</sub>

> Back to the home page

**Secondary button** · `notfound.cta_secondary` · <sub>src/pages/NotFound.tsx:26</sub>

> Tell us about the broken link

### System and error messages

Short strings a customer only sees when something has gone wrong. Easy to forget and the most likely place for the voice to slip. Errors coming back from Supabase itself (wrong password, address already registered, expired link) are **not** ours — they are shown verbatim from the provider and cannot be edited here.

**Sign in has no keys in this environment** · `system.not_configured` · <sub>src/lib/supabase.ts:32</sub>

> Sign in is not connected yet. Add your Supabase URL and anon key to the environment to switch it on.

- *Note:* Only ever seen in a misconfigured deployment. Written for a developer, not a maker.

**While the session is read** · `system.checking_session` · <sub>src/lib/auth.tsx:251</sub>

> Checking your session...

**While the account is read** · `system.checking_account` · <sub>src/lib/auth.tsx:312</sub>

> Checking your account...

**Checkout pressed while signed out** · `error.checkout.signed_out` · <sub>src/lib/billing.ts:81</sub>

> Please sign in to subscribe, then press this again.

**Checkout could not be opened** · `error.checkout.failed` · <sub>src/lib/billing.ts:103</sub>

> We could not open the checkout just now. Please try again in a moment or email us.

**Checkout could not be reached** · `error.checkout.offline` · <sub>src/lib/billing.ts:111</sub>

> We could not reach the checkout. Please check your connection and try again.

**Billing portal pressed while signed out** · `error.portal.signed_out` · <sub>src/lib/billing.ts:124</sub>

> Please sign in again to manage your billing.

**Billing portal could not be opened** · `error.portal.failed` · <sub>src/lib/billing.ts:135</sub>

> We could not open the billing portal. Please email us.

**Billing portal could not be reached** · `error.portal.offline` · <sub>src/lib/billing.ts:140</sub>

> We could not reach the billing portal. Please try again shortly.

**Consent or setup attempted with no sign in** · `error.signin_unavailable` · <sub>2 files — see the manifest</sub>

> Sign in is not connected.

- *Shared:* the same string is in 2 files (`src/lib/consent-preferences.ts`, `src/lib/membership.ts`). One edit means all of them.
- *Note:* In `src/lib/membership.ts` and `src/lib/consent-preferences.ts`.

**Account completion failed** · `error.finish_setup.failed` · <sub>src/lib/membership.ts:124</sub>

> Could not finish setting up your account. Please try again.

**Consent change could not be saved** · `error.consent.save_failed` · <sub>src/lib/consent-preferences.ts:58</sub>

> Could not save your preference. Please try again.

### Search results, link previews and answer engines

Not visible on the site, but read by people all the same — in a Google result, a Slack unfurl or an AI answer. Built in `src/lib/structured-data.ts` and duplicated statically in `index.html`. **The FAQ answers and the three HowTo steps are also structured data and are listed with their pages, not here.**

**One-line description of the product** · `seo.short_description` · <sub>src/lib/structured-data.ts:36</sub>

> Batchlabel turns the safety data sheet from your fragrance supplier into a UK and EU CLP label for candles, wax melts, reed diffusers and room sprays.

- *Must stay true:* Category rule (point 2 above). Candles is the only live category, no dates and no "coming soon".
- *Note:* Used for Organization, WebSite and SoftwareApplication, and repeated twice in `index.html`.

**Alt text on the social share image** · `seo.og_image_alt` · <sub>src/lib/structured-data.ts:30</sub>

> Batchlabel. Correct CLP labels for your candles, in minutes.

- *Note:* Repeated twice in `index.html`. The image itself is `public/og/batchlabel-share.png` and has the same words baked into it, so changing this string alone leaves the picture saying something else.

**Application sub-category** · `seo.software.subcategory` · <sub>src/lib/structured-data.ts:111</sub>

> Product labelling and CLP compliance

**Operating system field** · `seo.software.os` · <sub>src/lib/structured-data.ts:112</sub>

> Any modern web browser

**Feature list** · `seo.software.feature.1` · <sub>src/lib/structured-data.ts:118</sub>

> Reads the classification, hazard statements and allergens out of a supplier safety data sheet

**Feature list** · `seo.software.feature.2` · <sub>src/lib/structured-data.ts:119</sub>

> Classifies the finished product from the fragrance percentage and pack size

**Feature list** · `seo.software.feature.3` · <sub>src/lib/structured-data.ts:120</sub>

> Places hazard pictograms and regulated text at the required minimum sizes

**Feature list** · `seo.software.feature.4` · <sub>src/lib/structured-data.ts:121</sub>

> Generates a UFI, the Unique Formula Identifier used for poison centre notification

**Feature list** · `seo.software.feature.5` · <sub>src/lib/structured-data.ts:122</sub>

> Print ready PDF and SVG downloads on the Maker plan

**Feature list** · `seo.software.feature.6` · <sub>src/lib/structured-data.ts:123</sub>

> Saved recipes you can edit and reuse

**Offer name** · `seo.offer.free.name` · <sub>src/lib/structured-data.ts:128</sub>

> Free

**Offer description** · `seo.offer.free.description` · <sub>src/lib/structured-data.ts:133</sub>

> One watermarked PNG label. No payment card needed.

**Offer name** · `seo.offer.monthly.name` · <sub>src/lib/structured-data.ts:135</sub>

> Maker, billed monthly

- *Must stay true:* Pricing figure (point 6 above). The same numbers are in Stripe and in the structured data. Changing the words here does not change what anyone is charged.

**Offer name** · `seo.offer.annual.name` · <sub>src/lib/structured-data.ts:136</sub>

> Maker, billed yearly

- *Must stay true:* Pricing figure (point 6 above). The same numbers are in Stripe and in the structured data. Changing the words here does not change what anyone is charged.

**First breadcrumb on every page** · `seo.breadcrumb.home` · <sub>src/lib/structured-data.ts:164</sub>

> Home

**HowTo name for /how-it-works** · `seo.howto.name` · <sub>src/lib/structured-data.ts:182</sub>

> How to make a UK and EU CLP label for a candle

**HowTo description** · `seo.howto.description` · <sub>src/lib/structured-data.ts:184</sub>

> Turn the safety data sheet from your fragrance supplier into a print ready CLP label for a candle, wax melt, reed diffuser or room spray.

**What you need, item** · `seo.howto.supply.1` · <sub>src/lib/structured-data.ts:188</sub>

> The safety data sheet from your fragrance oil supplier

**What you need, item** · `seo.howto.supply.2` · <sub>src/lib/structured-data.ts:189</sub>

> The fragrance percentage in your finished product

**What you need, item** · `seo.howto.supply.3` · <sub>src/lib/structured-data.ts:190</sub>

> Your pack size, and your business name and address

**Tool used** · `seo.howto.tool` · <sub>src/lib/structured-data.ts:192</sub>

> Batchlabel

### llms.txt

`public/llms.txt` is served at https://www.batchlabel.xyz/llms.txt and is written for AI answer engines. It restates the product, the categories and the prices in one place, which means it is a **second copy of the category claim and the pricing figures**. If either changes on the site and not here, the two disagree in public.

**Opening summary** · `llms.summary` · <sub>public/llms.txt:3</sub>

> Batchlabel turns the safety data sheet from a fragrance supplier into a UK and EU CLP label that a small candle or home fragrance maker can print.

**Who runs it** · `llms.who` · <sub>public/llms.txt:6</sub>

> Batchlabel is a web app operated by Orchestrate Technologies Ltd, a company registered in England and Wales (number 16522544). The site is https://www.batchlabel.xyz.

**What it does, paragraph 1** · `llms.what.p1` · <sub>public/llms.txt:11</sub>

> You upload the safety data sheet your fragrance oil supplier gave you, enter the fragrance percentage and the pack size, and download a print ready label. The classification of the finished product depends on how much fragrance is in it, not on the neat oil, and that is the calculation Batchlabel does for you.

**What it does, paragraph 2** · `llms.what.p2` · <sub>public/llms.txt:16</sub>

> The label carries the product name and pack size, hazard pictograms at the required minimum size, the signal word, hazard statements, precautionary statements, allergen declarations, a generated UFI (Unique Formula Identifier), batch code and date fields, the supplier's name and address, and candle or diffuser safety wording where it applies.

- *Must stay true:* Must match `home.included.item.1` to `.11`.

**Who it is for** · `llms.who_for` · <sub>public/llms.txt:23</sub>

> Small batch makers in the UK and EU selling candles, wax melts, reed diffusers and room sprays.

**What it covers** · `llms.covers` · <sub>public/llms.txt:28</sub>

> Candles and home fragrance is the only product category Batchlabel covers. Cosmetics, wider consumer goods and electronics are directions the company has named out loud; none of them are built, and there is no date for any of them. Any answer that says Batchlabel labels cosmetics today is wrong.

- *Must stay true:* Category rule (point 2 above). Candles is the only live category, no dates and no "coming soon".

**What it does not do** · `llms.limits` · <sub>public/llms.txt:35</sub>

> Batchlabel does not certify, approve or verify a label, and it is not legal advice. It does not carry out a chemical safety assessment or produce a Cosmetic Product Safety Report. It does not make the poison centre notification, though it does generate the UFI that the notification and the label share. Responsibility for the finished label rests with the seller, and the output is only as good as the safety data sheet and the recipe entered.

**Pricing, free** · `llms.pricing.free` · <sub>public/llms.txt:44</sub>

> - Free: one watermarked PNG label, no payment card needed.

- *Must stay true:* Pricing figure (point 6 above). The same numbers are in Stripe and in the structured data. Changing the words here does not change what anyone is charged.

**Pricing, Maker** · `llms.pricing.maker` · <sub>public/llms.txt:45</sub>

> - Maker plan: GBP 14 per month, or GBP 140 per year. VAT included. Unlimited labels, print ready PDF and SVG with no watermark, UFI generation, saved recipes, batch code fields, email support, and up to five people on the account. Cancel any time.

- *Must stay true:* Pricing figure (point 6 above). The same numbers are in Stripe and in the structured data. Changing the words here does not change what anyone is charged.

**Page list, one line each** · `llms.pages` · <sub>public/llms.txt:51</sub>

> what Batchlabel does, and what goes on the label / the three steps, walked through with a candle / plans, VAT, cancellation and refunds / CLP, safety data sheets, UFIs, allergens and printing / who runs it and which categories are built / hello@batchlabel.co.uk / terms of service / privacy policy / cookie policy / acceptable use policy

- *Note:* Ten one-line descriptions, one per public page. Kept as a single block because they are one list.

### Text only screen readers hear

Not visible on screen, but announced to anyone using a screen reader, so it is copy. The rest of the accessibility plumbing — element ids, `aria-labelledby` references, decorative icons marked `aria-hidden` — is not copy and is not listed.

**Landmark name for the main navigation** · `a11y.nav.main` · <sub>src/components/layout/SiteHeader.tsx:29</sub>

> Main

**Landmark name for the mobile navigation** · `a11y.nav.main_mobile` · <sub>src/components/layout/SiteHeader.tsx:74</sub>

> Main, mobile

**Landmark name for the dashboard tabs** · `a11y.nav.dashboard` · <sub>src/components/dashboard/DashboardLayout.tsx:40</sub>

> Dashboard

**Landmark name for the trust strip** · `a11y.trust_strip` · <sub>src/components/home/TrustStrip.tsx:12</sub>

> What the labels are built against

**Name of the billing period control** · `a11y.pricing.toggle_group` · <sub>src/pages/Pricing.tsx:114</sub>

> Billing period

**Heading over the two plan cards** · `a11y.pricing.plans_heading` · <sub>src/pages/Pricing.tsx:111</sub>

> Plans

**Read before each free plan feature** · `a11y.pricing.included` · <sub>src/pages/Pricing.tsx:166</sub>

> Included. / Not included.

- *Note:* Without these the tick and dash icons are silent, and the list reads as eight features the free plan has. Four of them are the opposite.

**Caption on the cookie table** · `a11y.cookies.table_caption` · <sub>src/pages/legal/CookiePolicy.tsx:78</sub>

> Cookies used by Batchlabel

---

## Coverage

**696 entries.**

| Section | Entries |
| --- | ---: |
| Home | 130 |
| How it works | 30 |
| Pricing | 52 |
| FAQ | 46 |
| About | 21 |
| Contact | 21 |
| Sign up, log in and password | 88 |
| Checkout | 15 |
| Dashboard | 64 |
| Legal | 128 |
| Site-wide | 101 |
| **Total** | **696** |

Counted as one entry: a single string in the source, or one sentence
split across a link. Counted separately: the short and long versions of the three steps,
which are word-for-word identical but live in two files and do not move together.

Every key in this file is in `docs/copy-manifest.json` and every key in the manifest is in
this file. Each manifest entry records the file, the line numbers and the exact string as
it currently appears in the source, so a re-apply can check before it replaces.

---

## What was deliberately not extracted

Being honest about the edges.

- **Code comments.** Extensive and often good, but nobody reads them on the site.
- **Test files** (`*.test.ts`, `*.test.tsx`, `src/test/`). Fixtures, not copy.
- **Server code** (`src/server/`, `api/`). The error strings there are HTTP responses;
  the ones a customer actually sees are re-worded on the client and are in
  **Site-wide → System and error messages**.
- **Errors returned by Supabase.** Wrong password, address already registered, expired
  link. They are shown to customers verbatim from the provider and cannot be edited in
  this repo. Worth knowing they exist and are not in our voice.
- **Analytics event labels.** Every tracked button carries a `track.label` for the
  dataLayer. Most are the same string as the button and so appear in the manifest anyway.
  Four are not, and nobody sees them: `Start free`, `Create account`, `Finish setup`,
  `Go to dashboard`. Noted below rather than extracted.
- **Developer-facing strings.** `useAuth must be used inside AuthProvider` and similar
  throw messages. A customer never sees them.
- **Repo documentation** — `README.md`, `VOICE.md`, `POSITIONING.md`, `TESTING.md`,
  `docs/*.md`. Internal.
- **`public/robots.txt` and `public/sitemap.xml`.** Machine files with no prose beyond
  comments.
- **Structured data field names and types** (`@type`, `priceCurrency`, `availability`).
  The *values* are extracted; the schema vocabulary is not ours to write.
- **Element ids, `aria-labelledby` references, class names, decorative icons marked
  `aria-hidden`.** Plumbing.
- **Cookie names in the cookie policy table** — `bl_consent`, `bl_attr`,
  `sb-access-token`, `sb-refresh-token`, `_ga`, `_ga_*`, `_fbp`, `_gcl_au`. Visible, but
  they are identifiers set by the code and by Google and Meta, not wording. They must
  match reality and must not be edited for style. The category, purpose and life columns
  beside them **are** copy and are extracted.
- **Brand artwork.** `public/brand` and `public/og/batchlabel-share.png` have words baked
  into the images. The share image repeats `seo.og_image_alt` word for word, so changing
  that string alone leaves the picture saying something else. Noted on the entry.
- **The product app** at app.batchlabel.xyz. A separate repo. Anyone who finishes signing
  in is handed over to it, so the copy a customer meets next is not in this file.

Screen-reader-only text and landmark names **were** extracted, in
**Site-wide → Text only screen readers hear**. They are read aloud, so they are copy.

---

## Flagged while extracting

Nothing below has been changed. These are things that looked wrong, stale or
contradictory while reading every string on the site.

### Two documents disagree

1. **Attribution is kept for either 12 or 24 months.** `legal.cookies.row2.life` says the
   `bl_attr` cookie lasts 12 months. `legal.privacy.s5.item3` says attribution data is
   kept for 24 months from first visit. They may be describing different things — a
   cookie lifetime and a retention period — but they read as a contradiction, in two
   documents a regulator would compare.

### Claims that may not be true

2. **"Community support"** (`pricing.free.feature.4`) is listed as a Free plan feature.
   There is no forum, chat or community anywhere on the site, and no link to one. As
   written it promises something that does not exist.

3. **The free label may not be "the real thing".** `faq.billing.q1.answer` says the free
   label is "watermarked and PNG only, but the wording on it is the real thing". The Free
   plan card lists UFI generation and batch code fields as *not* included
   (`pricing.free.feature.6`, `.7`), and `home.included.item.7` and `.8` present both as
   things that go on the label. A free label with no UFI is not the same wording.

4. **The contact form does not send anything.** `contact.form.submit` says "Send message".
   Submitting builds a `mailto:` link and opens the visitor's own email client. The
   confirmation (`contact.form.sent`) is honest about it, but the button is not, and
   anyone without a configured mail client sees nothing happen. There is a `TODO` in
   `src/pages/Contact.tsx` acknowledging this.

5. **"Create your first label" goes nowhere.** `dashboard.empty.cta_primary` links back to
   `/dashboard`, the page it is already on. The label builder route does not exist yet
   (there is a `TODO` beside it).

6. **The password hint is not enforced.** `auth.signup.field.password.hint` says "At least
   eight characters". Sign-up does not check it — only the reset screen does
   (`auth.reset.error.too_short`). Supabase's own minimum is what actually applies.

7. **"It opens your dashboard"** (`auth.checkemail.step.2`). A completed sign-in hands the
   customer over to app.batchlabel.xyz, not to the dashboard on this site.

### Stale, or soon will be

8. **The dashboard always says the account is empty.** `dashboard.labels.intro` opens with
   "Nothing here yet" whatever the account contains. True today, because no labels are
   listed yet. It becomes wrong the moment they are.

9. **A manual process is described as temporary.** `dashboard.account.details.note` asks
   people to email to change their email or business name "while the self service settings
   are being built". No date, which is right, but it will read badly if it is still there
   in a year.

10. **Trial wording exists for a trial that is not offered.** `plan.trial.label`,
    `plan.trial.detail` and `plan.trial.detail_nodate` handle a Stripe trial. Nothing in
    the pricing copy offers one.

11. **Ten category fields are never rendered.** Only the two top cards on the home page
    show a tagline, chips and a regulation line, and the two idea rows below show a name
    and a description. That leaves `verticals.cpg.tagline`, `verticals.cpg.examples`,
    `verticals.cpg.regulation`, `verticals.electronics.tagline`,
    `verticals.electronics.examples` and `verticals.electronics.regulation` written but
    never shown, plus all four `verticals.*.input` values, which no component reads at
    all. Written copy nobody has ever read is worth either using or deleting.

### Inconsistencies worth a decision

12. **Five disclaimers say almost the same thing, differently.** `footer.disclaimer`,
    `cta_band.disclaimer`, `pricing.disclaimer`, `auth.shell.disclaimer` and
    `dashboard.footer_disclaimer` all state that Batchlabel does not certify labels and
    that responsibility rests with the seller. Each is worded slightly differently and
    each is a separate string. An edit to one will not reach the other four, which is how
    a legal position drifts.

13. **The price is typed out in eight sentences.** Only the number on the pricing card is
    read from `PRICES` in code. Everywhere else — including the page title, the meta
    description and the terms — the figures are hand-written. Listed in full under
    "Pricing figures" above.

14. **Four analytics labels no longer match their buttons.** The dataLayer records
    `Start free` for a button that says "Make a label free", `Create account` for "Create
    my account", `Finish setup` for "Finish and start my label", and `Go to dashboard` for
    "Go to my dashboard". Nobody sees these, but anyone reading a funnel report is
    matching them up by hand.

15. **Reply times differ by page.** `about.story.p6` says "usually the same day".
    `contact.details.replies.body` says "Monday to Friday, 9am to 5pm UK time. Usually the
    same working day." Not a contradiction, but two different promises.

16. **Every email address is on a different domain from the site.** The site is
    `batchlabel.xyz`; every address in the copy is `@batchlabel.co.uk`
    (`hello@` and `privacy@`). That may well be deliberate, but it appears in the footer,
    the terms, the privacy policy, the structured data and `llms.txt`, so it is worth
    confirming once rather than fifteen times.

### Live placeholders

17. **The testimonials are three empty cards.** `home.testimonials.*` ships prompts like
    "Space reserved for a real quote. A candle maker on how long labelling used to take."
    This is deliberate and it is in `VOICE.md` as the alternative to invented social
    proof. Recording it because it is placeholder text that customers currently read.

### SEO lengths

18. **Some titles and meta descriptions run past the practical limit.** They will be
    truncated in a search result rather than break anything, but they are worth a pass.
    Each entry states its own length.

    - Titles over 60 characters once ` | Batchlabel` is appended: none.
    - Meta descriptions over 155 characters: `home.meta.description` (156), `how.meta.description` (159), `faq.meta.description` (160), `about.meta.description` (159).

19. **`/sign-up` is indexable but not in the sitemap.** `auth.signup.meta.title` sets
    `noIndex: false`, and `public/robots.txt` does not disallow the path, but `/sign-up`
    is absent from `INDEXABLE_ROUTES` and therefore from `public/sitemap.xml`. Either is
    defensible; the two together look unintended.
