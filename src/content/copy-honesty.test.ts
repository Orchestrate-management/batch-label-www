import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { PLANS, PUBLIC_PLANS, gbpNumeral, priceWithInterval, skuAllowance } from '../lib/plans';

/**
 * The claims register, enforced.
 *
 * An audit of the site found fourteen outright false customer-facing claims: a watermarked
 * PNG free tier with no watermarker and no raster exporter behind it, print-ready PDF and
 * SVG export behind two `toast()` stubs, UFI generation that nothing generates, unlimited
 * labels beside a per-SKU meter, five people on an account with no concept of a second
 * person, and VAT-inclusive prices that Stripe charges VAT on top of. Three of them had
 * reached the terms of service, and three more the machine-readable markup that answer
 * engines quote.
 *
 * Every one of those was correct copy at the moment it was written and went stale quietly.
 * The register below is what stops that being a recurring cost: a grep is cheap, and the
 * alternative is another audit.
 *
 * When one of these ships, delete its row here in the same commit as the code. Do not
 * weaken a pattern to let a string through.
 *
 * There are two registers in this file. `BANNED` below is literal: exact strings from a past
 * audit, cheap and exact. `CAPABILITY_CLAIMS` further down is the general one, and it is the
 * one that catches copy nobody has written yet. Read its comment before adding to either —
 * a new row usually belongs there, not here.
 */

const ROOT = resolve(__dirname, '../..');

/** Everything a customer, a crawler or an answer engine can read. */
const COPY_ROOTS = ['src/pages', 'src/content', 'src/components', 'src/lib'];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

/**
 * Comments are stripped before scanning. A comment explaining why a claim is banned has to
 * be allowed to name the claim, or the guard forces the next reader to rediscover the
 * reason from scratch. Only what ships to a customer is checked.
 */
function withoutComments(source: string): string {
  return source.
    replace(/<!--[\s\S]*?-->/g, ' ').
    replace(/\/\*[\s\S]*?\*\//g, ' ').
    replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const sourceFiles = COPY_ROOTS.flatMap((dir) => walk(resolve(ROOT, dir)));
const llmsTxt = readFileSync(resolve(ROOT, 'public/llms.txt'), 'utf8');
const indexHtml = readFileSync(resolve(ROOT, 'index.html'), 'utf8');

const surfaces: { name: string; text: string }[] = [
  ...sourceFiles.map((file) => ({
    name: relative(ROOT, file),
    text: withoutComments(readFileSync(file, 'utf8'))
  })),
  { name: 'public/llms.txt', text: llmsTxt },
  { name: 'index.html', text: withoutComments(indexHtml) }
];

interface BannedClaim {
  /** Why it may not be said, in one line. */
  why: string;
  pattern: RegExp;
  /** Surfaces where the pattern legitimately matches something unrelated. */
  except?: RegExp;
}

const BANNED: BannedClaim[] = [
  {
    why: 'There is no watermarker in either repo. There is nothing to switch off.',
    pattern: /watermark/i
  },
  {
    why: 'There is no raster export path. A PNG label has never been produced.',
    pattern: /\bPNG\b/
  },
  {
    why: 'Both export buttons in the app are toast() stubs and SVG appears nowhere in it.',
    pattern: /print[ -]ready (PDF|SVG|file|label)/i
  },
  {
    why: 'Reprints are unlimited; SKUs are the metered unit. "Labels" reads as the thing being counted.',
    pattern: /unlimited\s+labels?/i
  },
  {
    why: 'No org concept exists. An account is one login, so no plan admits a second person.',
    pattern: /up to five (people|named people)/i
  },
  {
    why: 'Prices are stored and charged exclusive of VAT. Stripe adds it at checkout.',
    pattern: /VAT included|inclusive of VAT/i
  },
  {
    why: 'The portal cancels at period end with no proration. No refund is ever issued.',
    pattern: /refunded pro rata|pro rata on request/i
  },
  {
    why: 'The Free tier is an allowance of SKUs, not one label.',
    pattern: /first label free|one watermarked|free label/i
  },
  {
    why: 'Nothing generates a UFI. createProduct sets identifiers to an empty object.',
    pattern: /generates? (the |a )?UFI|UFI generation/i
  },
  {
    why: 'No forum, chat or community exists.',
    pattern: /community support/i
  },
  {
    why: 'No SKU limit is enforced until the products table lands. We must not claim we would stop you.',
    pattern: /cannot create a new (one|SKU|product) until/i
  }
];

describe('no surface repeats a claim the software cannot keep', () => {
  it.each(BANNED)('$why', ({ pattern, except }) => {
    const offenders = surfaces.
      filter((surface) => !except?.test(surface.name)).
      filter((surface) => pattern.test(surface.text)).
      map((surface) => surface.name);
    expect(offenders).toEqual([]);
  });
});

/**
 * The second register, and the one that matters.
 *
 * The literal register above only ever knows the exact strings of the last audit. It was
 * fully green — 662 tests green — while four fresh claims shipped: a live-category card
 * promising you could "download a UK and EU CLP label", "Unlimited prints and reprints" on
 * every pricing card, an FAQ answer offering to "place your own logo", and "archived SKUs
 * are never counted" in three places including the machine-readable surfaces. None of them
 * reused a banned string, so none of them was caught. A register of yesterday's sentences
 * cannot catch tomorrow's, and writing one row per sentence is a losing race.
 *
 * So these patterns match the *shape* of a capability claim rather than its wording, and the
 * rule is not "never say this" but "never say this as a plain fact". Honest copy about an
 * absent capability always names it and disclaims it in the same breath — that is what the
 * not-yet-built register on /pricing, in the terms and in llms.txt is for. A claim standing
 * on its own, with no disclaimer anywhere near it, is being sold.
 *
 * When one of these ships, delete its row. Until then, if a sentence trips this, the fix is
 * the sentence.
 */
interface CapabilityClaim {
  /** What is missing, and where we checked. */
  why: string;
  pattern: RegExp;
}

/**
 * The ways we say "not built". Deliberately narrow: plain negation is not on this list,
 * because "reprints are never counted" and "archived SKUs do not count" are both negations
 * and both were claims. Only wording about *availability* disclaims.
 */
const DISCLAIMED =
  /not built|never built|not been built|not available|is in build|being built|are building|we are building|no way to|does not exist|\b(not|no|none)\b[^.]{0,60}\byet\b/i;

/**
 * How far either side of a claim we will look for its disclaimer, in characters of
 * whitespace-normalised text. Wide enough that a not-yet-built entry's heading is covered by
 * its own body, narrow enough that a bullet cannot borrow a disclaimer from three bullets
 * away.
 */
const DISCLAIMER_WINDOW = 220;

/** Every match of `pattern` in `text` that has no availability disclaimer near it. */
function undisclaimed(text: string, pattern: RegExp): string[] {
  // Prose in JSX and in llms.txt wraps across lines, so a sentence is only whole once the
  // newlines are gone. Everything downstream is offset arithmetic on this flattened string.
  const flat = text.replace(/\s+/g, ' ');
  const scan = new RegExp(pattern.source, 'gi');
  return [...flat.matchAll(scan)].
    filter((match) => {
      const at = match.index ?? 0;
      const from = Math.max(0, at - DISCLAIMER_WINDOW);
      const to = at + match[0].length + DISCLAIMER_WINDOW;
      return !DISCLAIMED.test(flat.slice(from, to));
    }).
    map((match) => match[0]);
}

const CAPABILITY_CLAIMS: CapabilityClaim[] = [
  {
    why: 'Nothing writes a file. Both export buttons in the app are toast() stubs and no raster or vector writer exists.',
    pattern:
      /\b(?:download|export|save)\w*\s+(?:it|them|the|a|an|your|my|our|this|each|any|every|as)\b[^.]{0,24}\b(?:labels?|pdfs?|svgs?|artefacts?|files?)\b|\b(?:pdf|svg|file|label)s?\s+(?:download|export)\w*/i
  },
  {
    why: 'There is no print path in either repo — no window.print, no @media print stylesheet, no writer. A reprint is not an operation that exists.',
    pattern: /\bre-?print\w*|\bunlimited\s+(?:prints?|printing|reprints?)|\bprint\s+(?:it|them|the|your|a|an|these|those|at)\b/i
  },
  {
    why: 'There is no archive concept in the app. Every SKU a maker makes counts, and a seasonal range cannot be parked.',
    pattern: /\barchiv(?:e|es|ed|ing)\b/i
  },
  {
    why: 'Nothing accepts an uploaded image. The designer\'s optional block carries the business name as text; there is no logo, artwork or upload anywhere in the app.',
    pattern:
      /\b(?:upload|add|place|drop|insert|put|use|choose|set)\w*\s+(?:your|their|our|a|an|the|its)\b[\w\s'’-]{0,20}\b(?:logos?|artwork|brand ?marks?)\b|\b(?:your|their|own|custom)\s+(?:own\s+)?(?:logos?|artwork|brand ?marks?)\b|\bupload\w*\s+(?:your|a|an|the)\b[\w\s'’-]{0,20}\b(?:images?|photos?|pictures?|graphics?)\b/i
  },
  {
    why: 'Nothing saves or reuses a recipe. Products live in an in-memory array, so nothing survives a reload.',
    pattern:
      /\b(?:save|saved|saves|saving|store|stored|stores|storing|keep|keeps|reuse|reuses)\b[^.]{0,26}\b(?:recipes?|formulations?)\b|\b(?:recipes?|formulations?)\b[^.]{0,26}\b(?:saved|stored|kept|reused|reuse)\b/i
  }
];

describe('no surface states an absent capability as a plain fact', () => {
  it.each(CAPABILITY_CLAIMS)('$why', ({ pattern }) => {
    const offenders = surfaces.flatMap((surface) =>
      undisclaimed(surface.text, pattern).map((claim) => `${surface.name}: ${claim}`)
    );
    expect(offenders).toEqual([]);
  });

  /**
   * The guard is worth only what it catches, and it went green through four of these. Each
   * string below shipped; if a refactor stops one being caught, the register has quietly
   * gone back to being a list of yesterday's sentences.
   */
  it.each([
    ['download a UK and EU CLP label', 'enter your recipe and pack size, and download a UK and EU CLP label.'],
    ['unlimited prints and reprints', 'Unlimited prints and reprints'],
    ['place your own logo', 'You can set the label size, choose a layout, and place your own logo.'],
    ['archived SKUs are never counted', 'Reprints are never counted, archived SKUs are never counted.'],
    ['save it as a recipe', 'Save it as a recipe and reuse it for every batch.'],
    ['download your CLP labels', 'Log in to Batchlabel to make and download your CLP labels.']
  ])('still catches the shipped claim: %s', (_name, shipped) => {
    const caught = CAPABILITY_CLAIMS.some((claim) => undisclaimed(shipped, claim.pattern).length > 0);
    expect(caught).toBe(true);
  });

  /** And the other half: the not-yet-built copy has to survive, or the guard gets deleted. */
  it.each([
    'PDF and SVG export is being built and is not available yet.',
    'Downloading the label as a PDF or an SVG is the piece we are building now, and it is not available on any plan yet.',
    'There is no archive yet, so a SKU you have stopped selling still counts towards your plan.',
    'Only a little, and not with a logo yet. There is no way to upload a logo or artwork.'
  ])('leaves honestly disclaimed copy alone: %s', (honest) => {
    const caught = CAPABILITY_CLAIMS.flatMap((claim) => undisclaimed(honest, claim.pattern));
    expect(caught).toEqual([]);
  });
});

describe('prices are derived, never typed', () => {
  /**
   * Eight hand-typed copies of one price is how the terms of service ended up quoting a
   * figure the checkout did not charge. With four tiers that would have been thirty-two.
   *
   * Only ladder amounts are banned, not every pound sign: the liability cap in the terms is
   * a legal figure with nothing to do with the plans, and forbidding it would teach the
   * next reader that the rule is arbitrary.
   */
  it('states no plan amount as a literal outside the projection', () => {
    const amounts = PUBLIC_PLANS.flatMap((plan) =>
      [plan.monthlyPence, plan.annualPence].
        filter((pence): pence is number => pence !== null).
        map((pence) => gbpNumeral(pence))
    );
    const offenders = surfaces.
      filter((surface) => surface.name !== 'src/lib/plans.ts' && surface.name !== 'public/llms.txt').
      flatMap((surface) =>
        amounts.
          filter((amount) => surface.text.includes(amount)).
          map((amount) => `${surface.name}: ${amount}`)
      );
    expect(offenders).toEqual([]);
  });
});

describe('public/llms.txt', () => {
  /**
   * This file cannot interpolate, so it is the one customer-facing surface where the
   * figures are typed. Asserting them against the projection is what keeps it honest —
   * answer engines quote this file verbatim, so a stale price here is repeated at scale.
   */
  it('quotes every plan at the projection price, exclusive of VAT', () => {
    for (const plan of PUBLIC_PLANS) {
      expect(llmsTxt).toContain(skuAllowance(plan));
      if (plan.monthlyPence === null || plan.annualPence === null) continue;
      expect(llmsTxt).toContain(priceWithInterval(plan.monthlyPence, 'monthly'));
      expect(llmsTxt).toContain(priceWithInterval(plan.annualPence, 'annual'));
    }
  });

  it('states the free allowance and that prices exclude VAT', () => {
    expect(llmsTxt).toContain(`Free: ${PLANS.free.skus} SKUs`);
    expect(llmsTxt).toMatch(/exclude VAT/);
  });

  it('never names the payment rail test item', () => {
    expect(llmsTxt).not.toMatch(/rail.?test|payment rail/i);
  });

  /** The file exists to be read by machines, so what we cannot do has to be in it too. */
  it('tells an answer engine what is not built', () => {
    expect(llmsTxt).toMatch(/## What is not built yet/);
  });
});
