import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Home } from './Home';
import { Pricing } from './Pricing';
import { HowItWorks } from './HowItWorks';
import { Faq } from './Faq';
import { About } from './About';
import { Contact } from './Contact';
import { Terms } from './legal/Terms';
import { Privacy } from './legal/Privacy';
import { CookiePolicy } from './legal/CookiePolicy';
import { AcceptableUse } from './legal/AcceptableUse';
import { INDEXABLE_ROUTES, canonicalUrl } from '../lib/routes';
import { homeFaqs, pricingFaqs, allFaqEntries } from '../content/faqs';

vi.mock('../lib/auth', () => ({
  useAuth: () => ({ session: null, user: null, configured: false })
}));

interface PageCase {
  path: string;
  element: React.ReactElement;
}

const PAGES: PageCase[] = [
  { path: '/', element: <Home /> },
  { path: '/how-it-works', element: <HowItWorks /> },
  { path: '/pricing', element: <Pricing /> },
  { path: '/faq', element: <Faq /> },
  { path: '/about', element: <About /> },
  { path: '/contact', element: <Contact /> },
  { path: '/terms', element: <Terms /> },
  { path: '/privacy', element: <Privacy /> },
  { path: '/cookie-policy', element: <CookiePolicy /> },
  { path: '/acceptable-use', element: <AcceptableUse /> }
];

function renderPage(page: PageCase) {
  return render(<MemoryRouter initialEntries={[page.path]}>{page.element}</MemoryRouter>);
}

function headingLevels(container: HTMLElement): number[] {
  return [...container.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((node) =>
    Number(node.tagName.slice(1))
  );
}

/** Every JSON-LD block this page put in the head, parsed. */
function pageSchemas(): Record<string, unknown>[] {
  return [...document.head.querySelectorAll('script[data-bl-jsonld]')].flatMap((script) => {
    const parsed = JSON.parse(script.textContent ?? '{}') as {
      '@graph'?: Record<string, unknown>[];
    };
    return parsed['@graph'] ?? [];
  });
}

const typesOnPage = () => pageSchemas().map((entity) => entity['@type']);

beforeEach(() => {
  window.dataLayer = [];
});

describe('every indexable page has one page test', () => {
  it('covers exactly the routes in the sitemap', () => {
    expect(PAGES.map((page) => page.path)).toEqual(INDEXABLE_ROUTES.map((route) => route.path));
  });
});

describe.each(PAGES)('$path', (page) => {
  it('has exactly one h1', () => {
    const { container } = renderPage(page);
    const levels = headingLevels(container);
    expect(levels.filter((level) => level === 1)).toHaveLength(1);
  });

  it('opens with the h1, before any other heading', () => {
    const { container } = renderPage(page);
    expect(headingLevels(container)[0]).toBe(1);
  });

  it('never skips a heading level on the way down', () => {
    // A heading may be at most one level deeper than the one before it. Going back up
    // any number of levels is fine — that is just the end of a section.
    const { container } = renderPage(page);
    const levels = headingLevels(container);
    for (let index = 1; index < levels.length; index += 1) {
      expect(levels[index], `heading ${index} of ${levels.join(',')}`).toBeLessThanOrEqual(
        levels[index - 1] + 1
      );
    }
  });

  it('sets a canonical on the www host for its own path', () => {
    renderPage(page);
    const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    expect(canonical?.href).toBe(canonicalUrl(page.path));
  });

  it('is offered to crawlers', () => {
    renderPage(page);
    const robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    expect(robots?.content).toBe('index, follow');
  });

  it('has a title and a description that fit in a result page', () => {
    renderPage(page);
    const description =
      document.head.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? '';
    expect(document.title.length).toBeGreaterThan(20);
    expect(document.title.length).toBeLessThanOrEqual(62);
    expect(document.title.endsWith(' | Batchlabel')).toBe(true);
    expect(description.length).toBeGreaterThan(70);
    expect(description.length).toBeLessThanOrEqual(165);
  });

  it('points Open Graph and Twitter at the 1200x630 share image', () => {
    renderPage(page);
    const og = document.head.querySelector<HTMLMetaElement>('meta[property="og:image"]');
    const twitter = document.head.querySelector<HTMLMetaElement>('meta[name="twitter:image"]');
    expect(og?.content).toBe('https://www.batchlabel.xyz/og/batchlabel-share.png');
    expect(twitter?.content).toBe(og?.content);
    expect(
      document.head.querySelector<HTMLMetaElement>('meta[property="og:image:alt"]')?.content
    ).toBeTruthy();
  });
});

describe('titles and descriptions are unique across the site', () => {
  it('gives every page its own pair', () => {
    const seen: { title: string; description: string }[] = [];
    for (const page of PAGES) {
      const { unmount } = renderPage(page);
      seen.push({
        title: document.title,
        description:
          document.head.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? ''
      });
      unmount();
    }
    expect(new Set(seen.map((entry) => entry.title)).size).toBe(PAGES.length);
    expect(new Set(seen.map((entry) => entry.description)).size).toBe(PAGES.length);
  });
});

describe('page level structured data', () => {
  it('marks up the home page FAQ, and nothing it cannot see', () => {
    renderPage(PAGES[0]);
    expect(typesOnPage()).toEqual(['FAQPage']);
    const faq = pageSchemas()[0];
    expect((faq.mainEntity as unknown[]).length).toBe(homeFaqs.length);
  });

  it('describes the three steps on how it works', () => {
    renderPage(PAGES[1]);
    expect(typesOnPage()).toEqual(['BreadcrumbList', 'HowTo']);
    const howTo = pageSchemas()[1];
    expect((howTo.step as unknown[]).length).toBe(3);
  });

  it('puts the product and its offers on the pricing page, where the prices are', () => {
    renderPage(PAGES[2]);
    expect(typesOnPage()).toEqual(['BreadcrumbList', 'SoftwareApplication', 'FAQPage']);
    const app = pageSchemas()[1];
    // Free, plus a monthly and an annual for each of the three priced plans.
    expect((app.offers as unknown[]).length).toBe(7);
    expect((pageSchemas()[2].mainEntity as unknown[]).length).toBe(pricingFaqs.length);
  });

  /**
   * The £0.01 payment-rail item exists to prove the live rail with real money and must
   * never be stumbled into. The pricing page maps over a projection that does not contain
   * it, so these are belt and braces rather than the only guard.
   */
  it('never renders the payment rail test item, in the page or in its markup', () => {
    const { container } = renderPage(PAGES[2]);
    expect(container.textContent ?? '').not.toMatch(/0\.01|rail.?test|payment rail/i);
    expect(JSON.stringify(pageSchemas())).not.toMatch(/0\.01|rail.?test|payment rail/i);
  });

  /** Every price a visitor can read carries its tax qualifier in the same element. */
  it('qualifies every price on the pricing page with exc VAT', () => {
    const { container } = renderPage(PAGES[2]);
    const priced = [...container.querySelectorAll('*')].filter(
      (node) => node.children.length === 0 && /£\d/.test(node.textContent ?? '')
    );
    expect(priced.length).toBeGreaterThan(0);
    for (const node of priced) {
      expect(node.parentElement?.textContent ?? '').toMatch(/exc VAT|for ever/);
    }
  });

  it('marks up every question on the FAQ page', () => {
    renderPage(PAGES[3]);
    expect(typesOnPage()).toEqual(['BreadcrumbList', 'FAQPage']);
    expect((pageSchemas()[1].mainEntity as unknown[]).length).toBe(allFaqEntries.length);
  });

  it('gives the remaining pages a breadcrumb and no invented entities', () => {
    for (const page of PAGES.slice(4)) {
      const { unmount } = renderPage(page);
      expect(typesOnPage()).toEqual(['BreadcrumbList']);
      unmount();
    }
  });

  it('removes the previous page markup when the route changes', () => {
    const { unmount } = renderPage(PAGES[2]);
    expect(typesOnPage().length).toBeGreaterThan(0);
    unmount();
    expect(typesOnPage()).toEqual([]);
  });
});

describe('the HowTo steps are the steps on the page', () => {
  it('uses each visible step heading as the step name, and a real anchor', () => {
    const { container } = renderPage(PAGES[1]);
    const howTo = pageSchemas().find((entity) => entity['@type'] === 'HowTo');
    expect(howTo).toBeDefined();
    const steps = howTo?.step as { name: string; url: string }[];
    expect(steps).toHaveLength(3);

    steps.forEach((step, index) => {
      const anchor = `step-${index + 1}`;
      expect(step.url.endsWith(`#${anchor}`)).toBe(true);
      expect(container.querySelector(`#${anchor}`)).not.toBeNull();
      expect(container.querySelector(`#${anchor}`)?.textContent).toContain(step.name);
    });
  });
});
