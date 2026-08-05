import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { PLANS, PUBLIC_PLANS, gbpNumeral, priceWithInterval, skuAllowance } from '../lib/plans';

/**
 * The claims register, enforced.
 *
 * THIS REGISTER IS ABOUT MONEY AND TERMS. IT IS NOT ABOUT FEATURES. That distinction is
 * the whole of the file, and it is a reversal of what this file used to do.
 *
 * It used to ban capability claims — a watermarked PNG, print-ready PDF and SVG export,
 * UFI generation, a first-label-free tier — on the ground that the app could not do them
 * yet. The founder has since decided the other way: www describes the product Batchlabel
 * is being built into, not the state of this week's build. Downloading the label is going
 * to be something Batchlabel does, so the site is free to say so, and the bans on those
 * claims are gone.
 *
 * What is left is the four claims that a reversal does not reach, because they are not
 * about features arriving later. They are about the commercial terms a customer is being
 * charged under TODAY, and every one of them would still be false about the finished
 * product:
 *
 *   VAT included          prices are stored and charged exclusive of VAT, and always will
 *                         be; Stripe adds it at checkout from the buyer's location.
 *   refunded pro rata     the billing portal cancels at the end of the paid period with no
 *                         proration, and no refund is ever issued.
 *   up to five people     an account is one login. No plan admits a second person, and
 *                         selling a seat count is selling a thing with no mechanism.
 *   unlimited labels      reprints are unlimited, SKUs are the metered unit. "Labels"
 *                         reads as the thing being counted, and it is not.
 *
 * The test for a new row is not "can the app do this yet". It is: would a customer who
 * believed this be out of pocket, or hold a right we would not honour? If yes it belongs
 * here. If it is a feature that is coming, it does not, and writing about it early is a
 * decision the founder has already taken.
 *
 * Each row carries its own non-vacuity case below — the sentence it exists to catch. A
 * guard nobody has proved still fires is a guard that has quietly stopped working, and
 * that is exactly how the last audit's fourteen false claims got onto the site.
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

interface TermClaim extends BannedClaim {
  /** The sentence this row exists to catch. Proves the pattern still fires. */
  catches: string;
}

const BANNED: TermClaim[] = [
  {
    why: 'Prices are stored and charged exclusive of VAT. Stripe adds it at checkout from where the buyer is.',
    pattern: /VAT included|inclusive of VAT/i,
    catches: 'All plans are £14 a month, VAT included.'
  },
  {
    why: 'The billing portal cancels at the end of the paid period with no proration. No refund is ever issued.',
    pattern: /refunded pro rata|pro rata on request/i,
    catches: 'Cancel whenever you like and the unused months are refunded pro rata.'
  },
  {
    why: 'No org concept exists. An account is one login, so no plan admits a second person.',
    pattern: /up to (five|four|three|two|ten) (people|named people|seats|users|editors)/i,
    catches: 'Studio covers up to five people on one account.'
  },
  {
    why: 'Reprints are unlimited; SKUs are the metered unit. "Labels" reads as the thing being counted.',
    pattern: /unlimited\s+labels?/i,
    catches: 'Unlimited labels on every paid plan.'
  }
];

describe('no surface states a commercial term we would not honour', () => {
  it.each(BANNED)('$why', ({ pattern, except }) => {
    const offenders = surfaces.
      filter((surface) => !except?.test(surface.name)).
      filter((surface) => pattern.test(surface.text)).
      map((surface) => surface.name);
    expect(offenders).toEqual([]);
  });

  /**
   * A register goes vacuous silently. These are the sentences each row was written against,
   * and if a pattern stops matching its own then the row is decoration and the next false
   * claim goes past it the way the last fourteen did.
   */
  it.each(BANNED)('still catches its own claim: $catches', ({ pattern, catches }) => {
    expect(pattern.test(catches)).toBe(true);
  });

  /**
   * And the other half: the true copy on the site now has to survive the register, or the
   * next person to trip it will weaken the pattern instead of the sentence.
   */
  it.each([
    'Every price on this page excludes VAT. Stripe adds it at checkout based on where you are.',
    'Cancelling ends the plan at the end of the period you have already paid for.',
    'Every account is a single login, and no plan admits a second person.',
    'Download the label as a print-ready PDF or an SVG. Export is on every plan, including Free.',
    'Batchlabel generates the UFI and sets it on the label where CLP requires it.',
    'Put your own logo on it. The regulated text holds its minimum sizes whatever you change.'
  ])('leaves true copy alone: %s', (honest) => {
    const caught = BANNED.filter((claim) => claim.pattern.test(honest)).map((claim) => claim.why);
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

/**
 * THE THIRD REGISTER: the categories Batchlabel is not.
 *
 * The master specification is blunt about it — §13, "Out of scope, permanently: Cosmetics in
 * any form" — and the app repo has been brought back to that scope: there is no cosmetics
 * regime, no phased formula, no bill of materials, no CE mark and no wheelie bin in it.
 *
 * WHAT THIS GUARDS IS THE SITE SAYING OTHERWISE, and it is worth its own register because the
 * failure mode is not a lie so much as a leak. The words came back before as a roadmap: a
 * "Cosmetics & skincare" card, an FAQ answering "Do you do cosmetics labelling?", an About
 * paragraph naming it as the category makers ask for most. Every one of those sentences was
 * true and every one of them put a second category in the reader's head on the two highest
 * traffic pages on the site.
 *
 * SO THE RULE IS ABSENCE, NOT DENIAL. "We do not label cosmetics" is banned by this guard for
 * the same reason "we do label cosmetics" is: both are the site talking about cosmetics.
 * Batchlabel is CLP for candles, wax melts, reed diffusers and room sprays, and the way to say
 * that is to say it.
 *
 * Comments are stripped first, so this comment may name what it bans — and the one in
 * structured-data.ts may keep explaining the rule it follows.
 */
const OTHER_CATEGORIES: BannedClaim[] = [
  {
    why: 'Cosmetics is out of scope permanently. Naming it — to offer it OR to refuse it — puts it back in the reader\'s head.',
    pattern: /cosmetics?|skincare|\bCPSR\b/i
  },
  {
    why: 'Electronics went with the CE, RoHS and WEEE regimes. Nothing on the site may imply a device is labellable.',
    pattern: /electronics?|\bWEEE\b|\bRoHS\b|\bUKCA\b/i
  },
  {
    /**
     * The last roadmap entry standing, and the one that survived the cosmetics and
     * electronics sweep by being neither.
     *
     * "Wider consumer goods" was an `idea` card: household products, detergents and food
     * contact items, named out loud with no work behind it. It was the only thing left for
     * the categories section to compare candles against, which is how a section that exists
     * to compare ended up comparing one thing with nothing. Cutting it is what let that
     * section become four product forms instead of a ladder.
     *
     * It is banned by the same rule as the other two and for the same reason: a second scope
     * in the reader's head costs the same whether it is offered or refused. Detergents and
     * food contact items are a real labelling problem — they are just not this one.
     */
    why: 'Wider consumer goods was a named direction with nothing behind it. Naming it again puts a second scope in the reader\'s head.',
    pattern: /consumer goods|detergents?|household (?:products?|cleaners?|goods)|food[ -]contact/i
  }
];

describe('no surface names a category Batchlabel does not label', () => {
  it.each(OTHER_CATEGORIES)('$why', ({ pattern, except }) => {
    const offenders = surfaces.
      filter((surface) => !except?.test(surface.name)).
      filter((surface) => pattern.test(surface.text)).
      map((surface) => surface.name);
    expect(offenders).toEqual([]);
  });

  /**
   * Non-vacuity, and this register needs it more than the other two.
   *
   * A guard asserting the absence of words that are already absent everywhere looks identical
   * to a guard that works, and stays green if somebody rewrites the pattern into nonsense.
   * These are the exact strings that shipped, from the cards, the FAQ and the About page.
   */
  it.each([
  'Cosmetics & skincare',
  'Do you do cosmetics labelling?',
  'cosmetics is the one makers ask us for most',
  'it would never replace a Cosmetic Product Safety Report',
  'Electronics & batteries',
  'CE and UKCA marking, WEEE and battery rules',
  'Wider consumer goods',
  'Household products, detergents and food contact items turn safety data into label copy too.',
  'Will Batchlabel work for other products, like wider consumer goods or electronics?'])(
    'still catches the copy that shipped: %s',
    (shipped) => {
      expect(OTHER_CATEGORIES.some((claim) => claim.pattern.test(shipped))).toBe(true);
    }
  );

  /**
   * The other half, and it earns its place twice over now: the consumer-goods pattern is the
   * broadest of the three, so the copy that replaced the card has to be pinned against it.
   * Every sentence below is live on the homepage or on /about.
   */
  it('leaves the category we do label alone', () => {
    for (const allowed of [
    'Candles, wax melts, reed diffusers and room sprays',
    'built against UK CLP and EU CLP',
    'Upload the safety data sheet from your fragrance supplier',
    'Wax poured into a jar or a tin, sold by net weight.',
    'A fragrance base in a bottle with reeds, sold by volume.',
    'Fragrance in an alcohol or solvent base, in a spray bottle, sold by volume.',
    'Home fragrance is the only category we cover, and everything in Batchlabel is built around it.']) {
      expect(OTHER_CATEGORIES.some((claim) => claim.pattern.test(allowed))).toBe(false);
    }
  });
});
