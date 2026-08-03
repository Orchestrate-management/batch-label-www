import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ORGANIZATION_ID,
  WEBSITE_ID,
  OG_IMAGE_URL,
  breadcrumbSchema,
  faqPageSchema,
  graph,
  howToSchema,
  organizationSchema,
  softwareApplicationSchema,
  websiteSchema
} from './structured-data';
import { SITE_ORIGIN } from './routes';
import { PLANS, PUBLIC_PLANS, priceForInterval, skuAllowance } from './plans';
import { homeFaqs, pricingFaqs, allFaqEntries, faqGroups } from '../content/faqs';

const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

/** The JSON-LD block in index.html, which is what a crawler running no JavaScript reads. */
function staticJsonLd(): Record<string, unknown> {
  const match = indexHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('index.html has no JSON-LD block');
  return JSON.parse(match[1]) as Record<string, unknown>;
}

function staticGraph(): Record<string, unknown>[] {
  return staticJsonLd()['@graph'] as Record<string, unknown>[];
}

const byType = (type: string) =>
  staticGraph().find((entity) => entity['@type'] === type) as Record<string, unknown>;

describe('the static JSON-LD in index.html', () => {
  it('is valid JSON with a schema.org context', () => {
    const parsed = staticJsonLd();
    expect(parsed['@context']).toBe('https://schema.org');
    expect(Array.isArray(parsed['@graph'])).toBe(true);
  });

  it('states the same Organization as the TypeScript builder, byte for byte', () => {
    expect(byType('Organization')).toEqual(organizationSchema());
  });

  it('states the same WebSite as the TypeScript builder', () => {
    expect(byType('WebSite')).toEqual(websiteSchema());
  });

  it('declares the canonical host, the og:image and the British locale in the head', () => {
    expect(indexHtml).toContain('<html lang="en-GB">');
    expect(indexHtml).toContain(`<link rel="canonical" href="${SITE_ORIGIN}/" />`);
    expect(indexHtml).toContain(`content="${OG_IMAGE_URL}"`);
    expect(indexHtml).toContain('property="og:image:width" content="1200"');
    expect(indexHtml).toContain('property="og:image:height" content="630"');
    expect(indexHtml).toContain('name="twitter:card" content="summary_large_image"');
  });

  it('carries a description, which is what a link preview shows without JavaScript', () => {
    expect(indexHtml).toMatch(/<meta\s+name="description"/);
  });
});

describe('Organization and WebSite', () => {
  it('uses stable @ids that the per page graphs can point at', () => {
    expect(organizationSchema()['@id']).toBe(ORGANIZATION_ID);
    expect(websiteSchema()['@id']).toBe(WEBSITE_ID);
    expect(websiteSchema().publisher).toEqual({ '@id': ORGANIZATION_ID });
  });

  it('names the operating company and its registered address', () => {
    const org = organizationSchema();
    expect(org.legalName).toBe('Orchestrate Technologies Ltd');
    expect(org.address).toMatchObject({ addressCountry: 'GB', postalCode: 'W1W 5PF' });
  });
});

describe('SoftwareApplication', () => {
  const app = softwareApplicationSchema();
  const offers = app.offers as Record<string, unknown>[];

  it('offers every publicly listed plan, and nothing the pricing page does not show', () => {
    // Free (one offer) plus a monthly and an annual for each priced plan.
    const priced = PUBLIC_PLANS.filter((plan) => plan.monthlyPence !== null);
    expect(offers).toHaveLength(1 + priced.length * 2);
    expect(offers.map((offer) => offer.name)).toEqual([
      'Free',
      'Maker, billed monthly',
      'Maker, billed yearly',
      'Studio, billed monthly',
      'Studio, billed yearly',
      'Consultant, billed monthly',
      'Consultant, billed yearly'
    ]);
  });

  /** The 1p payment-rail item is not in the projection, so it cannot reach the markup. */
  it('never advertises the payment rail test item', () => {
    const serialised = JSON.stringify(app);
    expect(serialised).not.toMatch(/rail.?test|payment rail/i);
    expect(serialised).not.toContain('0.01');
  });

  it('takes every price from the plan projection, so the markup cannot drift from the page', () => {
    for (const plan of PUBLIC_PLANS) {
      for (const interval of ['monthly', 'annual'] as const) {
        const pence = priceForInterval(plan, interval);
        if (pence === null) continue;
        const name = `${plan.label}, billed ${interval === 'monthly' ? 'monthly' : 'yearly'}`;
        const offer = offers.find((entry) => entry.name === name);
        expect(offer?.price).toBe(String(pence / 100));
      }
    }
  });

  it('prices in sterling and says VAT is EXCLUDED, which is what the checkout charges', () => {
    for (const offer of offers) {
      expect(offer.priceCurrency).toBe('GBP');
    }
    for (const offer of offers.slice(1)) {
      const spec = offer.priceSpecification as Record<string, unknown>;
      expect(spec.valueAddedTaxIncluded).toBe(false);
      expect(spec['@type']).toBe('UnitPriceSpecification');
    }
  });

  it('bills the subscriptions per month and per year', () => {
    const unit = (offer: Record<string, unknown>) =>
      ((offer.priceSpecification as Record<string, unknown>).referenceQuantity as Record<
        string,
        unknown
      >).unitCode;
    expect(unit(offers[1])).toBe('MON');
    expect(unit(offers[2])).toBe('ANN');
  });

  it('describes the free tier as the decided allowance, not a watermarked preview', () => {
    expect(offers[0].description as string).toContain(skuAllowance(PLANS.free));
  });

  it('never claims a category Batchlabel has not built', () => {
    const serialised = JSON.stringify(app).toLowerCase();
    for (const forbidden of ['cosmetic', 'skincare', 'electronic', 'coming soon', 'in build']) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  /**
   * This markup is indexed and quoted verbatim by answer engines, so a false line here
   * outlives its correction on the page. It once advertised a watermarked PNG free tier,
   * print-ready PDF and SVG export and UFI generation, none of which existed anywhere.
   */
  it('never claims a capability Batchlabel has not built', () => {
    const serialised = JSON.stringify(app);
    for (const forbidden of [
      /watermark/i,
      /\bPNG\b/,
      /\bSVG\b/,
      /print ready/i,
      /generates? a UFI/i,
      /saved recipes/i,
      /unlimited labels?/i
    ]) {
      expect(serialised).not.toMatch(forbidden);
    }
  });
});

describe('the free-tier sentence in index.html', () => {
  /**
   * Three static meta descriptions carry the free allowance for crawlers that run no
   * JavaScript, and src/pages/Home.tsx carries a fourth for those that do. All four must
   * agree with the plan projection, or a link preview advertises a different offer from
   * the page it links to.
   */
  it('states the decided free allowance in all three static descriptions', () => {
    const sentence = `${PLANS.free.skus} SKUs free, no card.`;
    const occurrences = indexHtml.split(sentence).length - 1;
    expect(occurrences).toBe(3);
  });

  it('carries no claim the software cannot keep', () => {
    for (const forbidden of [/watermark/i, /first label free/i, /VAT included/i]) {
      expect(indexHtml).not.toMatch(forbidden);
    }
  });
});

describe('FAQPage', () => {
  it('is built from the same entries the accordion renders', () => {
    const schema = faqPageSchema('/', homeFaqs);
    const questions = schema.mainEntity as Record<string, unknown>[];
    expect(questions).toHaveLength(homeFaqs.length);
    questions.forEach((question, index) => {
      expect(question['@type']).toBe('Question');
      expect(question.name).toBe(homeFaqs[index].question);
      expect(question.acceptedAnswer).toEqual({
        '@type': 'Answer',
        text: homeFaqs[index].answer
      });
    });
  });

  it('covers every question on the FAQ page, in the order a reader meets them', () => {
    const schema = faqPageSchema('/faq', allFaqEntries);
    const names = (schema.mainEntity as Record<string, unknown>[]).map((q) => q.name);
    expect(names).toEqual(faqGroups.flatMap((group) => group.items).map((item) => item.question));
  });

  it('anchors itself to the canonical URL of the page it sits on', () => {
    expect(faqPageSchema('/pricing', pricingFaqs)['@id']).toBe(
      `${SITE_ORIGIN}/pricing#faq`
    );
  });

  it('has no empty answers, which Google rejects', () => {
    for (const entry of [...homeFaqs, ...allFaqEntries, ...pricingFaqs]) {
      expect(entry.answer.trim().length).toBeGreaterThan(20);
      expect(typeof entry.answer).toBe('string');
    }
  });
});

describe('BreadcrumbList', () => {
  const crumb = breadcrumbSchema('Pricing', '/pricing');

  it('runs Home first, then the current page, with absolute canonical items', () => {
    expect(crumb.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: 'Pricing', item: `${SITE_ORIGIN}/pricing` }
    ]);
  });
});

describe('HowTo', () => {
  const steps = [
    { name: 'Upload your supplier safety data sheet', text: 'Drag the PDF in.', anchor: 'step-1' },
    { name: 'Enter your fragrance percentage', text: 'Tell us the fragrance load.', anchor: 'step-2' }
  ];
  const howTo = howToSchema('/how-it-works', steps);

  it('numbers the steps in page order and links each to its anchor', () => {
    const listed = howTo.step as Record<string, unknown>[];
    expect(listed.map((step) => step.position)).toEqual([1, 2]);
    expect(listed[0].url).toBe(`${SITE_ORIGIN}/how-it-works#step-1`);
    expect(listed[1].name).toBe(steps[1].name);
  });
});

describe('graph', () => {
  it('wraps entities in a single schema.org context', () => {
    const wrapped = graph([breadcrumbSchema('FAQ', '/faq')]);
    expect(wrapped['@context']).toBe('https://schema.org');
    expect(wrapped['@graph']).toHaveLength(1);
  });

  it('serialises without a closing script tag, which would break the injected block', () => {
    const serialised = JSON.stringify(graph([softwareApplicationSchema()]));
    expect(serialised.toLowerCase()).not.toContain('</script');
  });
});
