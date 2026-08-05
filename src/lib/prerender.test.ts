import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PRERENDER_ROUTES } from '../prerender/entry';
import { INDEXABLE_ROUTES, canonicalUrl } from './routes';

/**
 * Holds the prerender to the route table, and the build to the prerender.
 *
 * Two ways this stops working quietly, and both are covered here:
 *
 *  1. A page is added to App.tsx and nobody adds it to INDEXABLE_ROUTES. It gets no
 *     canonical, no sitemap entry and no prerendered file — it is simply absent from
 *     everything a crawler reads, and the site looks fine.
 *  2. Somebody removes the prerender step from a build script. dist/ goes back to one
 *     shell, the deploy is green, and nothing anywhere says so.
 *
 * The output itself is checked by scripts/prerender.mjs, which refuses to write files
 * that fail, and by src/lib/prerendered-output.test.ts against a real dist/.
 */

const read = (relative: string) => readFileSync(resolve(process.cwd(), relative), 'utf8');
const packageJson = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
const vercelConfig = JSON.parse(read('vercel.json')) as {
  rewrites?: { destination: string }[];
};

describe('the prerender route list', () => {
  it('is the route table, not a copy of it', () => {
    expect(PRERENDER_ROUTES).toEqual(INDEXABLE_ROUTES.map((route) => route.path));
  });

  it('matches the sitemap exactly, in both directions', () => {
    const sitemap = [...read('public/sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (match) => match[1]
    );
    // Nothing prerendered that the sitemap omits, and nothing in the sitemap that is not
    // prerendered. A page offered to Google that only exists as a shell is worse than one
    // that is not offered at all.
    expect(PRERENDER_ROUTES.map(canonicalUrl)).toEqual(sitemap);
  });

  it('prerenders nothing that robots.txt disallows', () => {
    const disallowed = [...read('public/robots.txt').matchAll(/^Disallow:\s*(\S+)$/gm)].map(
      (match) => match[1]
    );
    for (const route of PRERENDER_ROUTES) {
      expect(disallowed).not.toContain(route);
    }
  });

  it('leaves out the auth, checkout and dashboard routes', () => {
    // Transient, query-parameter dependent or behind a login. A prerendered
    // /checkout/success is a page about somebody else's purchase.
    for (const path of [
      '/sign-up',
      '/log-in',
      '/forgot-password',
      '/reset-password',
      '/check-your-email',
      '/finish-setup',
      '/checkout/success',
      '/checkout/cancelled',
      '/dashboard'
    ]) {
      expect(PRERENDER_ROUTES).not.toContain(path);
    }
  });
});

describe('App.tsx', () => {
  /**
   * Every route the app declares must be a deliberate decision: indexed and prerendered,
   * or named below with a reason. Adding a page and forgetting the route table fails
   * here, which is the only moment anybody is looking.
   */
  const NOT_INDEXED: Record<string, string> = {
    '/sign-up': 'auth surface, noindex, disallowed in robots.txt',
    '/log-in': 'auth surface, noindex, disallowed in robots.txt',
    '/forgot-password': 'auth surface, noindex, disallowed in robots.txt',
    '/check-your-email': 'transient, noindex, disallowed in robots.txt',
    '/reset-password': 'carries a recovery token, noindex, disallowed in robots.txt',
    '/finish-setup': 'behind RequireAuth, noindex, disallowed in robots.txt',
    '/checkout/success': 'query-parameter dependent, disallowed in robots.txt',
    '/checkout/cancelled': 'query-parameter dependent, disallowed in robots.txt',
    '/dashboard': 'behind RequireAuth and RequireMembership',
    '/dashboard/account': 'behind RequireAuth and RequireMembership',
    '*': 'the 404 route, which has no URL of its own'
  };

  const declared = [...read('src/App.tsx').matchAll(/path="([^"]+)"/g)].map((match) => match[1]);

  it('declares every route either as indexable or as deliberately not', () => {
    const unaccounted = declared.filter(
      (path) =>
        !INDEXABLE_ROUTES.some((route) => route.path === path) &&
        !(path in NOT_INDEXED) &&
        // Nested dashboard children are declared relative to their parent.
        !(`/dashboard/${path}` in NOT_INDEXED)
    );
    expect(
      unaccounted,
      `Routes in App.tsx that are neither in INDEXABLE_ROUTES nor listed as deliberately ` +
        `unindexed: ${unaccounted.join(', ')}. Add the page to src/lib/routes.ts and ` +
        `public/sitemap.xml so it gets prerendered, or add it to NOT_INDEXED with a reason.`
    ).toEqual([]);
  });

  it('declares a route for every page that is prerendered', () => {
    for (const path of PRERENDER_ROUTES) {
      expect(declared).toContain(path);
    }
  });
});

describe('the build', () => {
  it('prerenders as part of `npm run build`', () => {
    expect(packageJson.scripts.build).toContain('vite build');
    expect(packageJson.scripts.build).toContain('prerender');
  });

  it('prerenders as part of the build Vercel runs', () => {
    // vercel-build is what the deployment actually executes. A prerender wired only into
    // `build` would work locally and in CI and do nothing in production.
    expect(packageJson.scripts['vercel-build']).toContain('npm run build');
    expect(packageJson.scripts.prerender).toBe('node scripts/prerender.mjs');
  });

  it('writes the shell file the rewrite points at', () => {
    // Renaming one without the other turns every unknown URL into a 404.
    const shell = /const SHELL_FILE = '([^']+)'/.exec(read('scripts/prerender.mjs'))?.[1];
    expect(shell).toBeTruthy();
    const destinations = (vercelConfig.rewrites ?? []).map((rewrite) => rewrite.destination);
    expect(destinations).toContain(`/${shell?.replace(/\.html$/, '')}`);
  });
});
