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
import { PRICES } from './billing';
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

  it('offers exactly the three things the pricing page shows', () => {
    expect(offers).toHaveLength(3);
    expect(offers.map((offer) => offer.name)).toEqual([
      'Free',
      'Maker, billed monthly',
      'Maker, billed yearly'
    ]);
  });

  it('takes both prices from PRICES, so the markup cannot drift from the page', () => {
    expect(offers[1].price).toBe(String(PRICES.monthly));
    expect(offers[2].price).toBe(String(PRICES.annual));
    expect(offers[1].price).toBe('14');
    expect(offers[2].price).toBe('140');
  });

  it('prices in sterling and says VAT is included, which is what the page says', () => {
    for (const offer of offers) {
      expect(offer.priceCurrency).toBe('GBP');
    }
    for (const offer of offers.slice(1)) {
      const spec = offer.priceSpecification as Record<string, unknown>;
      expect(spec.valueAddedTaxIncluded).toBe(true);
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

  it('never claims a category Batchlabel has not built', () => {
    const serialised = JSON.stringify(app).toLowerCase();
    for (const forbidden of ['cosmetic', 'skincare', 'electronic', 'coming soon', 'in build']) {
      expect(serialised).not.toContain(forbidden);
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
