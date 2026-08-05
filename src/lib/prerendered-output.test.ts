import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INDEXABLE_ROUTES, canonicalUrl } from './routes';

/**
 * What is actually in dist/, read the way a crawler reads it.
 *
 * scripts/prerender.mjs refuses to write output that fails its own checks, so in the
 * normal course of things this file agrees with it. It exists anyway because the build
 * and the suite fail in different places and at different times: this is the version that
 * turns red in the pull request, next to the diff that caused it.
 *
 * It needs a build, and both CI and `vercel-build` now run `npm run build` BEFORE the test
 * step so these actually execute rather than skipping their way to green. Locally:
 * `npm run build && npm run test:run`.
 */

const DIST = resolve(process.cwd(), 'dist');
const built = existsSync(resolve(DIST, 'index.html'));

const read = (file: string) => readFileSync(resolve(DIST, file), 'utf8');
const fileFor = (path: string) => (path === '/' ? 'index.html' : `${path.slice(1)}.html`);

/** Cheap head parsing. jsdom is available but this is a handful of regexes. */
const titleOf = (html: string) => /<title>([\s\S]*?)<\/title>/.exec(html)?.[1] ?? '';
const metaOf = (html: string, key: string) =>
  new RegExp(`<meta[^>]+(?:name|property)="${key}"[^>]+content="([^"]*)"`).exec(html)?.[1] ??
  new RegExp(`<meta[^>]+content="([^"]*)"[^>]+(?:name|property)="${key}"`).exec(html)?.[1] ??
  '';
const canonicalOf = (html: string) =>
  /<link[^>]+rel="canonical"[^>]+href="([^"]*)"/.exec(html)?.[1] ?? '';

describe.skipIf(!built)('the prerendered pages in dist/', () => {
  /**
   * Read lazily, per test, NOT in this callback.
   *
   * `describe.skipIf` skips the TESTS; it does not stop vitest running the callback, which
   * it must do at collection time to discover them. Reading here therefore happens even
   * when the guard says to skip — so on a checkout with no dist/ this file did not skip,
   * it threw ENOENT and took the whole suite with it. That is how `vercel-build` came to
   * fail before it ever reached `vite build`.
   */
  const htmlFor = (path: string) => read(fileFor(path));

  /** The same shape the eager array had, built inside a test rather than at collection. */
  const allPages = () =>
  INDEXABLE_ROUTES.map((route) => ({ path: route.path, html: htmlFor(route.path) }));

  it.each(INDEXABLE_ROUTES.map((route) => route.path))('%s is a real document, not the shell', (path) => {
    const html = htmlFor(path);
    // The shell was 6,413 bytes with 54 characters of readable text. Anything that size
    // means React produced nothing and the bug is back.
    expect(html.length).toBeGreaterThan(10_000);
    expect(html).toMatch(/<h1[^>]*>/);
    expect(html).not.toMatch(/<div id="root"><\/div>/);
  });

  it('gives every route its own title, description and canonical', () => {
    expect(new Set(allPages().map((page) => titleOf(page.html))).size).toBe(INDEXABLE_ROUTES.length);
    expect(new Set(allPages().map((page) => metaOf(page.html, 'description'))).size).toBe(INDEXABLE_ROUTES.length);
    for (const page of allPages()) {
      expect(canonicalOf(page.html)).toBe(canonicalUrl(page.path));
      expect(metaOf(page.html, 'og:url')).toBe(canonicalUrl(page.path));
      expect(metaOf(page.html, 'og:title')).toBe(titleOf(page.html));
      expect(metaOf(page.html, 'robots')).toBe('index, follow');
    }
  });

  it('makes no two routes byte-identical, which is the defect this replaced', () => {
    expect(new Set(allPages().map((page) => page.html)).size).toBe(INDEXABLE_ROUTES.length);
  });

  it('carries the site-wide and the page-level JSON-LD on every route', () => {
    for (const page of allPages()) {
      // Two at least: the static Organization/WebSite graph from index.html, and the
      // page's own, which useStructuredData appends with a data-bl-jsonld attribute.
      const blocks = [...page.html.matchAll(/<script type="application\/ld\+json"[^>]*>/g)];
      expect(blocks.length).toBeGreaterThanOrEqual(2);
      expect(page.html).toContain('"@type": "Organization"');
      expect(page.html).toContain('data-bl-jsonld="page"');
    }
  });

  it('shows the cookie banner in its first-visit state and grants nothing', () => {
    for (const page of allPages()) {
      expect(page.html).toContain('id="cookie-title"');
      expect(page.html).toContain('Accept all');
      expect(page.html).toContain('Reject optional');
      // The detail panel is only open once somebody asks for it.
      expect(page.html).not.toContain('id="consent-analytics"');
      // Nothing measurable may be loaded by a file a build wrote.
      expect(page.html).not.toContain('googletagmanager.com/gtag/js');
      expect(page.html).not.toContain('connect.facebook.net');
    }
  });

  it('contains no session, no user and no account data', () => {
    for (const page of allPages()) {
      expect(page.html).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/);
      expect(page.html).not.toMatch(/access_token|refresh_token/);
      expect(page.html).not.toMatch(/sb-[a-z0-9]+-auth-token/);
      // The signed-out header. A prerendered page must never show the signed-in one.
      expect(page.html).toContain('Log in');
      expect(page.html).not.toMatch(/Sign out|Log out/);
    }
  });

  it('still boots the app for everybody who does run JavaScript', () => {
    for (const page of allPages()) {
      expect(page.html).toMatch(/<script type="module"[^>]+src="\/assets\//);
      expect(page.html).toMatch(/<link rel="stylesheet"[^>]+href="\/assets\//);
    }
  });
});

describe.skipIf(!built)('the SPA fallback shell in dist/', () => {
  it('exists, because vercel.json rewrites everything else to it', () => {
    expect(existsSync(resolve(DIST, 'spa-shell.html'))).toBe(true);
  });

  it('is noindex, so auth routes and dead links are not offered to a crawler', () => {
    const html = read('spa-shell.html');
    expect(metaOf(html, 'robots')).toBe('noindex, nofollow');
    expect(canonicalOf(html)).toBe('');
    expect(metaOf(html, 'og:url')).toBe('');
  });

  it('is the empty shell, not a copy of the home page', () => {
    const html = read('spa-shell.html');
    expect(html).toContain('<div id="root"></div>');
    expect(html).toMatch(/<script type="module"[^>]+src="\/assets\//);
  });
});
