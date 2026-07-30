import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INDEXABLE_ROUTES, SITE_ORIGIN, canonicalUrl, routeFor } from './routes';

/**
 * public/sitemap.xml and public/robots.txt are static files, so nothing in the build
 * regenerates them when a route is added. These tests are the thing that notices.
 */
const read = (relative: string) => readFileSync(resolve(process.cwd(), relative), 'utf8');

const sitemap = read('public/sitemap.xml');
const robots = read('public/robots.txt');

/** Routes that must never be offered to a crawler. Each one also sets noIndex. */
const PRIVATE_ROUTES = [
  '/dashboard',
  '/log-in',
  '/forgot-password',
  '/reset-password',
  '/check-your-email',
  '/finish-setup',
  '/checkout/'
];

describe('canonicalUrl', () => {
  it('pins every URL to the www host, because the apex 308-redirects to it', () => {
    expect(canonicalUrl('/pricing')).toBe('https://www.batchlabel.xyz/pricing');
    expect(SITE_ORIGIN).toBe('https://www.batchlabel.xyz');
  });

  it('keeps the home page as a bare slash', () => {
    expect(canonicalUrl('/')).toBe('https://www.batchlabel.xyz/');
  });

  it('drops the query string, so a utm-tagged visit does not become its own canonical', () => {
    expect(canonicalUrl('/pricing?utm_source=google&gclid=abc')).toBe(
      'https://www.batchlabel.xyz/pricing'
    );
  });

  it('drops the fragment, so the skip link target is not a separate URL', () => {
    expect(canonicalUrl('/faq#main')).toBe('https://www.batchlabel.xyz/faq');
  });

  it('strips a trailing slash so /about and /about/ agree', () => {
    expect(canonicalUrl('/about/')).toBe(canonicalUrl('/about'));
  });
});

describe('sitemap.xml', () => {
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

  it('lists every indexable route exactly once, in the same order as the route table', () => {
    expect(locs).toEqual(INDEXABLE_ROUTES.map((route) => canonicalUrl(route.path)));
  });

  it('has no duplicate entries', () => {
    expect(new Set(locs).size).toBe(locs.length);
  });

  it('leaves out every auth, checkout and dashboard route', () => {
    for (const path of PRIVATE_ROUTES) {
      expect(sitemap).not.toContain(`${SITE_ORIGIN}${path}`);
    }
  });

  it('never offers the apex host, which would be a redirect for every crawl', () => {
    expect(sitemap).not.toContain('https://batchlabel.xyz/');
  });

  it('is well formed enough to parse, with one url element per loc', () => {
    const urls = [...sitemap.matchAll(/<url>/g)];
    expect(urls).toHaveLength(locs.length);
    expect(sitemap.trimStart().startsWith('<?xml')).toBe(true);
  });
});

describe('robots.txt', () => {
  it('points at the sitemap on the canonical host', () => {
    expect(robots).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
  });

  it('disallows every private route', () => {
    for (const path of PRIVATE_ROUTES) {
      expect(robots).toContain(`Disallow: ${path}`);
    }
  });

  it('does not disallow anything that is in the sitemap', () => {
    const disallowed = [...robots.matchAll(/^Disallow:\s*(\S+)$/gm)].map((match) => match[1]);
    for (const route of INDEXABLE_ROUTES) {
      expect(disallowed).not.toContain(route.path);
    }
  });
});

describe('routeFor', () => {
  it('finds the entry for an indexable path', () => {
    expect(routeFor('/faq')?.label).toBe('FAQ');
  });

  it('returns nothing for a route that is deliberately not indexed', () => {
    expect(routeFor('/dashboard')).toBeUndefined();
    expect(routeFor('/sign-up')).toBeUndefined();
  });
});
