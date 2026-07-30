# SEO, AEO and accessibility audit

Audited July 2026 against `origin/main` at `758605d`. Every ratio in this document was
computed from the hexes in `tailwind.config.js` using the WCAG 2.1 relative luminance
formula, and every browser observation was made against `npx vite` on this branch, not
inferred.

Severity is about consequence, not effort.

- **High** — costs traffic, breaks a link preview, or blocks a user from completing a task.
- **Medium** — measurable but survivable.
- **Low** — tidy-up.

---

## 1. SEO

### 1.1 No canonical URL was stable — High — fixed

`src/lib/seo.ts:44-45` (before) built the canonical from `window.location.origin`:

```ts
const url = typeof window === 'undefined' ? '' : `${window.location.origin}${location.pathname}`;
```

That means the same page emitted a different canonical depending on where it was loaded:
`https://batchlabel.xyz/pricing` on the apex, `https://www.batchlabel.xyz/pricing` on www,
and `https://batch-label-xxxx.vercel.app/pricing` on every preview deployment. Preview
deployments are crawlable unless password-protected, so this was actively pointing Google
at throwaway hosts. It also kept the query string, so `?utm_source=...` produced a
separate canonical for a page that already had one.

Fixed by pinning the canonical to a single origin in `src/lib/routes.ts`, and stripping
query and fragment in `canonicalUrl()`. `src/lib/seo.ts:57` now uses it.

**Founder decision embedded here:** the canonical host is `https://www.batchlabel.xyz`,
because the apex 308-redirects to www (documented in `docs/GOOGLE_OAUTH_SETUP.md:203`).

### 1.2 Open Graph tags existed but only after JavaScript ran — High — fixed

`src/lib/seo.ts` set `og:*` and `twitter:*` correctly, but only inside a React effect.
Facebook, LinkedIn, Slack and X do not execute JavaScript when they unfurl a link. Every
Batchlabel link shared anywhere rendered as a bare URL with no title, description or
image. `index.html` had a five-word `<title>Batchlabel</title>` and nothing else.

Fixed by making `index.html` a complete no-JavaScript fallback describing the home page:
title, description, canonical, full `og:*` and `twitter:*` sets, `og:image` with width,
height and alt. `usePageMeta` still rewrites all of it per route for Google, which does
render.

### 1.3 The `og:image` pointed at a file that did not exist, on the wrong domain — High — fixed

`src/lib/seo.ts:6` (before):

```ts
const OG_IMAGE_SLOT = 'https://batchlabel.co.uk/og/batchlabel-share.png'; // TODO: replace with the final 1200x630 share image.
```

Two faults. `batchlabel.co.uk` is not the production host — that is the email domain, and
`www.batchlabel.xyz` is the site. And nothing was ever served at `/og/`, on either domain.

Fixed by generating `public/og/batchlabel-share.png` (1200×630, 74 KB) from the brand
pack. Source SVG committed alongside it at `public/og/batchlabel-share.svg`, and the
regeneration recipe added to `public/brand/README.md`. Verified in the browser: loads,
`naturalWidth` 1200, `naturalHeight` 630.

The card renders in Helvetica Neue rather than Outfit, because Outfit is a webfont and is
not installed locally, so Quick Look falls back. This is the same fallback
`batchlabel-lockup-horizontal.svg` has always had. Flagged rather than hidden.

### 1.4 No `robots.txt` — Medium — fixed

There was none, so crawlers had no sitemap pointer and no signal to leave the dashboard,
auth and checkout routes alone. Added `public/robots.txt`. Note that `vercel.json` rewrites
`/(.*)` to `/index.html`, but Vercel checks the filesystem before applying rewrites, so
static files in `public/` are served normally. Confirmed against the dev server (`HTTP 200
text/plain`), not against production.

### 1.5 No `sitemap.xml` — Medium — fixed

Added `public/sitemap.xml` covering the ten indexable routes and nothing else. Because it
is a static file with no build step behind it, `src/lib/routes.test.ts` asserts it matches
`INDEXABLE_ROUTES` exactly — same URLs, same order, no duplicates, no private routes, and
nothing that `robots.txt` disallows.

### 1.6 Titles and descriptions — Medium — partly fixed

Measured before and after, including the ` | Batchlabel` suffix.

| Page | Title before | Title after | Description before → after |
| --- | --- | --- | --- |
| `/` | 54 | 54 (unchanged) | 219 → 155 |
| `/how-it-works` | **25** | 59 | 187 → 157 |
| `/faq` | 39 | 57 | 160 (unchanged) |
| `/about` | **21** | 52 | 204 → 156 |
| `/contact` | **23** | 58 | 140 (unchanged) |
| `/pricing` | 48 | 48 (unchanged) | 169 → 154 |

Four titles were 25 characters or under and carried no intent keyword at all — "How it
works | Batchlabel" tells a searcher nothing and matches nothing. Three descriptions ran
past 190 characters and were being truncated in the result page, cutting the free-label
offer off the end of the home page snippet.

The home page title is deliberately untouched: "CLP labels for candle and wax melt makers"
is the money term and orphaning it would be self-harm. Every rewritten title still leads
with candle or CLP intent, per `POSITIONING.md`. `src/pages/pages.seo.test.tsx` now asserts
every indexable page has a unique title and description, that titles stay at or under 62
characters and end with the site name, and that descriptions land between 70 and 165.

### 1.7 Heading hierarchy — Low — mostly already correct, one page fixed

Nine of the ten indexable pages had exactly one `h1`, no skipped levels, and the `h1`
first. Credit where it is due — this was in good shape.

`/contact` was the exception. It had an `h1` followed by three sibling `h2`s ("Email",
"Replies", "Registered office") that came from the contact detail cards, and the form —
the main thing on the page — had no heading at all. Fixed at `src/pages/Contact.tsx`: a
visually hidden `h2` for each half, contact cards demoted to `h3`.

Now enforced for all ten pages by `src/pages/pages.seo.test.tsx`, which checks exactly one
`h1`, that it comes first, and that no heading is more than one level deeper than the one
before it.

### 1.8 `lang` attribute — Low — fixed

`index.html` said `lang="en"` while `og:locale` said `en_GB` and the copy is British
throughout. Now `lang="en-GB"`.

### 1.9 Internal linking and link text — no action needed

Checked every anchor in `src/`. No "click here", no bare "read more". Link text is
descriptive throughout ("full FAQ page", "Read our cookie policy", "Back to the home
page", "Tell us about the broken link"). The footer covers every indexable route except
`/`, which the logo lockup handles. Nothing to fix.

---

## 2. AEO

### 2.1 No structured data at all — High — fixed

There was none, anywhere. Added:

| Where | Entities |
| --- | --- |
| `index.html` (static) | `Organization`, `WebSite` |
| `/` | `FAQPage` |
| `/how-it-works` | `BreadcrumbList`, `HowTo` |
| `/pricing` | `BreadcrumbList`, `SoftwareApplication` with three `Offer`s, `FAQPage` |
| `/faq` | `BreadcrumbList`, `FAQPage` |
| `/about`, `/contact`, and the four legal pages | `BreadcrumbList` |

`Organization` and `WebSite` are static so an answer engine that does not render
JavaScript still gets the company facts. Everything else is injected per route by
`useStructuredData` and removed on the way out, so a route change never leaves the
previous page's markup behind (asserted in `src/pages/pages.seo.test.tsx`).

Design decisions worth knowing:

- **No `SoftwareApplication` on the home page.** The prices are not on the home page, and
  marking up a price a reader cannot see is the exact thing Google's structured data
  policy prohibits. It sits on `/pricing`, where the cards are.
- **Prices come from `PRICES` in `src/lib/billing.ts`**, the same constant the pricing
  cards render. £14/month and £140/year, both `valueAddedTaxIncluded: true`, matching what
  the page says. A test asserts both.
- **`FAQPage` is built from `src/content/faqs.ts`.** To guarantee that, `FaqEntry.answer`
  is now typed `string` rather than `React.ReactNode`. If an answer could be JSX, the
  markup would silently stop matching the visible copy. Verified in the browser: 17
  marked-up questions, 17 visible questions, identical text in identical order.
- **Nothing claims an unbuilt category.** `structured-data.test.ts` fails if the serialised
  `SoftwareApplication` contains "cosmetic", "skincare", "electronic", "coming soon" or
  "in build".

`HowTo` is included even though Google retired its rich result, because it is accurate,
cheap, and answer engines still read it. Its step URLs point at real anchors on the page
(`#step-1`…`#step-3`), which are new ids on the list items, and a test checks each anchor
exists and contains the step name.

### 2.2 Extractable facts — mostly already good

The copy is unusually well suited to answer engines already: question-shaped FAQ headings,
answers that lead with the answer ("No.", "Yes.", "About ten minutes on your first go"),
and concrete nouns rather than abstractions. `VOICE.md` is doing the work. I made no copy
changes for AEO — the risk of damaging a deliberate voice outweighed the marginal gain.

### 2.3 `llms.txt` — added

`public/llms.txt`, short and factual: what the product does, who it is for, what it does
not do, the single live category with an explicit "any answer that says Batchlabel labels
cosmetics today is wrong", and the prices. Written to be quoted.

---

## 3. Accessibility (WCAG 2.1 AA)

### 3.1 `ink-muted` failed AA for body text everywhere it was used — High — fixed

The brand's muted ink was `#8A7F72`. Measured:

| Combination | Ratio | Verdict |
| --- | --- | --- |
| `ink-muted` on `paper` | **3.39:1** | fails 1.4.3 (needs 4.5:1) |
| `ink-muted` on card `white` | **3.70:1** | fails |
| `ink-muted` on `paper-deep` (footer) | **3.19:1** | fails |

This is not an edge case. `text-ink-muted` sets the footer strapline and legal notices,
every field hint, every caption, the label preview's supplier address, the "Step 1"
eyebrows, the pricing sub-lines and the testimonial attributions — all normal-size body
text, all requiring 4.5:1.

Re-anchored to `#6F6559`, same hue family, darker: **4.94:1** on paper, **5.38:1** on card
white, **4.65:1** on `paper-deep`.

`public/brand/README.md` also claimed "teal on paper is roughly 8.5:1". It is **7.84:1** on
paper; 8.55:1 is teal on *card white*. Both pass AA and AAA, so the conclusion held, but
the number was wrong and is now corrected with a full measured table.

### 3.2 Every opacity-modified text colour failed — High — fixed

| Where | Before | Ratio | After |
| --- | --- | --- | --- |
| `src/pages/Pricing.tsx` excluded features | `text-ink-muted/70` on white | **2.35:1** | solid `text-ink-muted`, 5.38:1 |
| `src/pages/Pricing.tsx` dash icon | `text-ink-muted/60` | **2.04:1** | solid |
| `src/components/home/Testimonials.tsx` attribution | `text-ink-muted/80` on paper | **2.55:1** | solid, 4.94:1 |
| `src/components/ui/Field.tsx` placeholder | `placeholder:text-ink-muted/70` | **2.15–2.35:1** | solid |
| `src/components/home/Verticals.tsx` arrow | `text-ink-muted/70` | **2.23:1** | solid |

`text-teal-100/80` on `teal-800` in `src/components/CtaBand.tsx:40` measured 6.30:1 and was
left alone. The README now says not to use opacity modifiers on text.

### 3.3 The pricing feature list conveyed inclusion by icon and colour alone — High — fixed

`src/pages/Pricing.tsx` rendered the free plan's eight features with a tick or a dash, both
`aria-hidden="true"`, distinguished otherwise only by text colour. A screen reader read
eight features as if the free plan had all of them. Four of them are the opposite — "Print
ready PDF and SVG", "UFI generation", "Batch code fields", "Saved recipes". That is 1.4.1
Use of Colour and 1.3.1 Info and Relationships, and it is also commercially wrong.

Fixed with a visually hidden "Included."/"Not included." before each label. Verified in the
browser: the accessible text now reads "Not included. Print ready PDF and SVG".

### 3.4 Form control borders failed non-text contrast — Medium — fixed

`border-ink/15` on card white measured **1.35:1**; the checkbox's `border-ink/25` measured
1.69:1. An empty text input on `bg-white` sitting on card white has no other visual
boundary, so SC 1.4.11 applies and needs 3:1. Added an `ink-line` token, `#8A8378`:
**3.54:1** on card white, 3.25:1 on paper, 3.06:1 on `paper-deep`. Applied to `Field`,
`Checkbox` and the contact textarea. Verified: computed `border-color: rgb(138, 131, 120)`.

The secondary button's `border-ink/15` was deliberately **not** changed. SC 1.4.11 exempts
a control that is identifiable without its boundary, and those buttons have a visible text
label.

### 3.5 Keyboard focus was invisible on the teal call-to-action band — Medium — fixed

`src/index.css` set a single global ring, `outline: 2px solid #14514f`. Against the
`teal-800` (`#0F3D3B`) CtaBand background that is **1.32:1** — invisible. The band contains
two of the site's primary conversion links.

Added a `.bl-reversed` class that switches the ring to paper `#F3EEE6`, **10.38:1** against
`teal-800`, and applied it to `CtaBand`. Verified with a real Tab press: the focused link
matches `:focus-visible` and computes `outline: solid 2px rgb(243, 238, 230)`.

### 3.6 The skip link existed but did not move focus — Medium — fixed

`src/components/layout/SiteLayout.tsx` already had a skip link — good. But `<main>` had no
`tabindex`, so it is not focusable. Safari in particular scrolls to the fragment and leaves
focus on the link, meaning the next Tab drops the user straight back into the header they
were trying to skip.

Added `tabIndex={-1}` to `<main>`, plus `main:focus { outline: none }` so the whole page
region does not get a ring. Verified in the browser: after activating the link,
`document.activeElement` is `<main id="main">`. Five tests in
`src/components/layout/SiteLayout.test.tsx` cover it, including that it is the first thing
Tab reaches.

### 3.7 No route-change announcement — Medium — fixed

React Router swapped the page and `document.title` changed, but nothing announced it.
Added `src/components/RouteAnnouncer.tsx`: a polite live region present from first paint,
fed by a `bl:page-title` event that `usePageMeta` dispatches after setting the title. The
first title is deliberately swallowed, because the browser has already announced the
initial document.

It is mounted from `App` rather than a layout so its listener is registered before the
first page's `usePageMeta` effect — otherwise the "swallow the first" count is off by one
and the first real navigation goes silent. Verified in the browser: navigating home →
pricing left the region reading "Pricing, £14 a month or £140 a year | Batchlabel".

### 3.8 Cookie banner focus management — Medium — fixed

The banner is correctly non-modal (`aria-modal="false"`), so a focus trap would be wrong
and none was added. But opening it from the footer's "Cookie settings" button did nothing
to focus, leaving a keyboard user to hunt for a panel that had appeared somewhere off
screen. Added: focus moves to the dialog when it is opened by that button, and returns to
the button when a choice is saved. Focus is deliberately **not** stolen on a first visit,
where the banner appears by itself. Also added `aria-describedby`. No consent logic was
touched. Verified: `document.activeElement` becomes the `role="dialog"` element.

### 3.9 Landmarks — Low — one fix

`SiteLayout` and `DashboardLayout` were already correct. `AuthShell`'s logo bar was a plain
`<div>`, so the sign-up and log-in pages had no banner landmark. Changed to `<header>`.

### 3.10 Form error announcement — Low — fixed

`Field`'s error paragraph had `aria-describedby` wired up but no `role="alert"`, so an
error appearing after submission was not announced until the field happened to be read
again. `Checkbox` already had it. Added to `Field` for consistency.

### 3.11 `prefers-reduced-motion` — Low — broadened

`src/index.css` reset `scroll-behavior` only. Today the site animates nothing but colour,
so there was no live failure. Broadened to neutralise animation and transition durations
generally, so a component added later cannot reintroduce the problem without anyone
remembering this file.

### 3.12 Images and icons — no action needed

There are no `<img>` tags on the site; everything is inline SVG. Decorative marks already
carry `aria-hidden="true"` and `focusable="false"` (`Logo`, `StepIllustration`, every
Lucide icon). The CLP hazard pictograms carry `role="img"` and a real `aria-label`
("Exclamation mark hazard pictogram"). The mobile menu button has an `sr-only` label that
changes with state, plus `aria-expanded` and `aria-controls`. This was already right.

---

## 4. Found and deliberately not fixed

- **`/sign-up` sets `noIndex: false` but is not in the sitemap.** The brief says exclude
  auth routes; the page says index me. Both are defensible — a sign-up page is a normal
  landing target for a SaaS. I followed the brief and left the page's own `noIndex: false`
  alone, so it stays indexable via its meta robots tag but is not advertised. **Founder
  decision needed:** either add it to `INDEXABLE_ROUTES` or set `noIndex: true`. Right now
  it is neither, which is the one state nobody chose on purpose.

- **`src/api/*` and `vitest.config.ts` still use `https://batchlabel.co.uk`.**
  `create-checkout-session.ts:28` and `create-portal-session.ts:21` default `SITE_URL` to
  the wrong host, so a missing `SITE_URL` env var would send Stripe redirects to a domain
  that is not the site. This is a real bug but `api/` is owned by another agent and out of
  scope here. Not touched. Worth its own ticket.

- **The cookie banner is last in the DOM.** On a first visit a keyboard user must traverse
  the entire page to reach it. Moving it would mean restructuring `App`'s render order and
  risks colliding with the consent work in flight. The non-modal pattern makes this
  tolerable rather than blocking.

- **`DashboardLayout` has no skip link.** It already has correct header/nav/main/footer
  landmarks and only four controls before `main`, so the benefit is small and the route is
  `noIndex` and behind auth. Left alone to keep the diff on the marketing site.

- **`html { scroll-behavior: smooth }` remains for non-reduced-motion users.** It is a
  design choice, and it is correctly disabled under `prefers-reduced-motion`.

- **Legal page wording.** Untouched, as instructed. Only their breadcrumb markup was added;
  their `LegalSection` headings were already a clean `h1` → `h2` structure.

- **The 548 KB JavaScript bundle.** Vite warns about it on every build. It is a Core Web
  Vitals concern and therefore an SEO concern, but code splitting is a separate piece of
  work with its own risk, and guessing at `manualChunks` inside an SEO pass would be
  reckless.

## 5. Could not verify

- **Production behaviour of `robots.txt` and `sitemap.xml` under `vercel.json`'s catch-all
  rewrite.** Verified against `vite dev` and confirmed both files land in `dist/`. Vercel
  documents that rewrites are applied after the filesystem check, so static assets win, but
  I have not deployed and cannot confirm it on the live host. Worth a single `curl
  https://www.batchlabel.xyz/robots.txt` after merge.
- **Whether Google renders the injected JSON-LD.** It renders JavaScript, so it should, but
  that is inference. The Rich Results Test on the deployed URL is the only proof.
- **Real screen reader output.** The live region, the skip link and the hidden
  Included/Not-included text were verified through the accessibility tree and
  `document.activeElement`, not with VoiceOver or NVDA.
