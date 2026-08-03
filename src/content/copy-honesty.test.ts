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
