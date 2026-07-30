/**
 * The canonical origin, and the list of routes that are allowed into the index.
 *
 * This is the single source of truth for anything that needs to know which URLs are
 * public: canonical tags, `public/sitemap.xml`, `public/robots.txt` and the breadcrumb
 * trails. `src/lib/routes.test.ts` asserts the shipped sitemap matches this list exactly,
 * so a new page cannot quietly go missing from it.
 *
 * The apex `batchlabel.xyz` 308-redirects to `www`, so `www` is the canonical host. Every
 * canonical, sitemap entry and `og:url` must use it, otherwise we hand Google two URLs
 * for the same page and let it pick.
 */
export const SITE_ORIGIN = 'https://www.batchlabel.xyz';

export const SITE_NAME = 'Batchlabel';

export interface SiteRoute {
  /** Path, always with a leading slash and no trailing slash (except the home page). */
  path: string;
  /** Breadcrumb label. The home page is the trail root and needs none. */
  label?: string;
  /** Sitemap hint only. Search engines treat both fields as advisory. */
  changefreq: 'weekly' | 'monthly' | 'yearly';
  priority: number;
}

/**
 * Public, indexable routes. Auth, checkout and dashboard routes are deliberately absent:
 * they all set `noIndex` through `usePageMeta` and are disallowed in robots.txt.
 */
export const INDEXABLE_ROUTES: SiteRoute[] = [
  { path: '/', changefreq: 'weekly', priority: 1.0 },
  { path: '/how-it-works', label: 'How it works', changefreq: 'monthly', priority: 0.9 },
  { path: '/pricing', label: 'Pricing', changefreq: 'monthly', priority: 0.9 },
  { path: '/faq', label: 'FAQ', changefreq: 'monthly', priority: 0.8 },
  { path: '/about', label: 'About', changefreq: 'yearly', priority: 0.5 },
  { path: '/contact', label: 'Contact', changefreq: 'yearly', priority: 0.5 },
  { path: '/terms', label: 'Terms of service', changefreq: 'yearly', priority: 0.3 },
  { path: '/privacy', label: 'Privacy policy', changefreq: 'yearly', priority: 0.3 },
  { path: '/cookie-policy', label: 'Cookie policy', changefreq: 'yearly', priority: 0.3 },
  { path: '/acceptable-use', label: 'Acceptable use', changefreq: 'yearly', priority: 0.3 }
];

/**
 * Absolute URL on the canonical host. Query strings and fragments are dropped, because
 * `?utm_source=...` and `#main` are the same page and must not become separate canonicals.
 */
export function canonicalUrl(pathname: string): string {
  const path = pathname.split('?')[0].split('#')[0];
  const withSlash = path.startsWith('/') ? path : `/${path}`;
  const trimmed = withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : '/';
  return `${SITE_ORIGIN}${trimmed}`;
}

/** The route entry for a path, or undefined if the path is not indexable. */
export function routeFor(pathname: string): SiteRoute | undefined {
  const path = canonicalUrl(pathname).slice(SITE_ORIGIN.length) || '/';
  return INDEXABLE_ROUTES.find((route) => route.path === path);
}
