/**
 * JSON-LD builders.
 *
 * Two rules govern everything in this file.
 *
 * 1. Only mark up what is on the page. The FAQ graphs are built from
 *    `src/content/faqs.ts`, which is the same array the accordions render, so the markup
 *    cannot drift from the visible answers. Prices come from `PRICES` in `lib/billing.ts`
 *    for the same reason.
 * 2. Never claim a category we have not built. Candles and home fragrance is the only
 *    live category (see POSITIONING.md), so nothing here mentions cosmetics, wider
 *    consumer goods or electronics as something Batchlabel does.
 *
 * `Organization` and `WebSite` are also emitted statically in `index.html` so a crawler
 * that does not run JavaScript still sees them. Everything else is per page and is
 * injected by `useStructuredData`.
 */

import { SITE_ORIGIN, SITE_NAME, canonicalUrl } from './routes';
import { PRICES } from './billing';
import type { FaqEntry } from '../content/faqs';

export const ORGANIZATION_ID = `${SITE_ORIGIN}/#organization`;
export const WEBSITE_ID = `${SITE_ORIGIN}/#website`;
export const SOFTWARE_ID = `${SITE_ORIGIN}/#software`;

export const OG_IMAGE_PATH = '/og/batchlabel-share.png';
export const OG_IMAGE_URL = `${SITE_ORIGIN}${OG_IMAGE_PATH}`;
export const OG_IMAGE_ALT =
  'Batchlabel. Correct CLP labels for your candles, in minutes.';

/** JSON-LD is an untyped tree; this keeps it honest without fighting the type system. */
export type JsonLd = Record<string, unknown>;

const SHORT_DESCRIPTION =
  'Batchlabel turns the safety data sheet from your fragrance supplier into a UK and EU CLP label for candles, wax melts, reed diffusers and room sprays.';

export function organizationSchema(): JsonLd {
  return {
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: SITE_NAME,
    legalName: 'Orchestrate Technologies Ltd',
    url: `${SITE_ORIGIN}/`,
    description: SHORT_DESCRIPTION,
    email: 'hello@batchlabel.co.uk',
    logo: {
      '@type': 'ImageObject',
      url: `${SITE_ORIGIN}/brand/apple-touch-icon.png`,
      width: 180,
      height: 180
    },
    address: {
      '@type': 'PostalAddress',
      streetAddress: '167-169 Great Portland Street',
      addressLocality: 'London',
      postalCode: 'W1W 5PF',
      addressCountry: 'GB'
    },
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: 'hello@batchlabel.co.uk',
        url: `${SITE_ORIGIN}/contact`,
        availableLanguage: 'en-GB'
      }
    ]
  };
}

export function websiteSchema(): JsonLd {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: `${SITE_ORIGIN}/`,
    name: SITE_NAME,
    description: SHORT_DESCRIPTION,
    inLanguage: 'en-GB',
    publisher: { '@id': ORGANIZATION_ID }
  };
}

/**
 * The product itself. Both Maker prices are VAT inclusive for consumers, which is what
 * the pricing page says, so `valueAddedTaxIncluded` is true on both.
 */
export function softwareApplicationSchema(): JsonLd {
  const subscription = (name: string, price: number, unitCode: 'MON' | 'ANN'): JsonLd => ({
    '@type': 'Offer',
    name,
    price: String(price),
    priceCurrency: 'GBP',
    url: `${SITE_ORIGIN}/pricing`,
    availability: 'https://schema.org/InStock',
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      price,
      priceCurrency: 'GBP',
      valueAddedTaxIncluded: true,
      referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode }
    }
  });

  return {
    '@type': 'SoftwareApplication',
    '@id': SOFTWARE_ID,
    name: SITE_NAME,
    url: `${SITE_ORIGIN}/`,
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Product labelling and CLP compliance',
    operatingSystem: 'Any modern web browser',
    description: SHORT_DESCRIPTION,
    inLanguage: 'en-GB',
    publisher: { '@id': ORGANIZATION_ID },
    image: OG_IMAGE_URL,
    featureList: [
      'Reads the classification, hazard statements and allergens out of a supplier safety data sheet',
      'Classifies the finished product from the fragrance percentage and pack size',
      'Places hazard pictograms and regulated text at the required minimum sizes',
      'Generates a UFI, the Unique Formula Identifier used for poison centre notification',
      'Print ready PDF and SVG downloads on the Maker plan',
      'Saved recipes you can edit and reuse'
    ],
    offers: [
      {
        '@type': 'Offer',
        name: 'Free',
        price: '0',
        priceCurrency: 'GBP',
        url: `${SITE_ORIGIN}/pricing`,
        availability: 'https://schema.org/InStock',
        description: 'One watermarked PNG label. No payment card needed.'
      },
      subscription('Maker, billed monthly', PRICES.monthly, 'MON'),
      subscription('Maker, billed yearly', PRICES.annual, 'ANN')
    ]
  };
}

/** Built from the same array the accordion renders, so the two cannot drift apart. */
export function faqPageSchema(pathname: string, entries: FaqEntry[]): JsonLd {
  return {
    '@type': 'FAQPage',
    '@id': `${canonicalUrl(pathname)}#faq`,
    inLanguage: 'en-GB',
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer }
    }))
  };
}

/**
 * Home is always position 1. Pass the current page as the second crumb; the home page
 * itself gets no breadcrumb, because a single-item trail says nothing.
 */
export function breadcrumbSchema(name: string, pathname: string): JsonLd {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${canonicalUrl(pathname)}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name, item: canonicalUrl(pathname) }
    ]
  };
}

export interface HowToStepInput {
  name: string;
  text: string;
  anchor: string;
}

/** The three steps as they appear on /how-it-works, in the order the page shows them. */
export function howToSchema(pathname: string, steps: HowToStepInput[]): JsonLd {
  const url = canonicalUrl(pathname);
  return {
    '@type': 'HowTo',
    '@id': `${url}#howto`,
    name: 'How to make a UK and EU CLP label for a candle',
    description:
      'Turn the safety data sheet from your fragrance supplier into a print ready CLP label for a candle, wax melt, reed diffuser or room spray.',
    inLanguage: 'en-GB',
    totalTime: 'PT10M',
    supply: [
      { '@type': 'HowToSupply', name: 'The safety data sheet from your fragrance oil supplier' },
      { '@type': 'HowToSupply', name: 'The fragrance percentage in your finished product' },
      { '@type': 'HowToSupply', name: 'Your pack size, and your business name and address' }
    ],
    tool: [{ '@type': 'HowToTool', name: 'Batchlabel' }],
    step: steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.name,
      text: step.text,
      url: `${url}#${step.anchor}`
    }))
  };
}

/** Wraps the page's entities in a single `@graph`, the shape crawlers prefer. */
export function graph(entities: JsonLd[]): JsonLd {
  return { '@context': 'https://schema.org', '@graph': entities };
}
