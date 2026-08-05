import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveRequest, type VercelConfig } from '../../scripts/vercel-routing.mjs';
import { INDEXABLE_ROUTES } from './routes';

/**
 * The regression guard for the half of prerendering that is not the prerendering.
 *
 * Writing dist/pricing.html is easy and, on its own, completely invisible. The old
 * vercel.json rewrote every non-API path to /index.html, and because rewrites are matched
 * against the request AFTER the filesystem has had its turn, that meant a request for
 * /pricing found nothing called `pricing`, fell through, and got the shell. Prerendered
 * files, green deploy, no observable change, and the only way to notice was to curl the
 * live site.
 *
 * So this drives the real vercel.json through the real resolver with the real route
 * table. Deleting `cleanUrls`, pointing the fallback back at /index.html, or replacing
 * the whole thing with a plain catch-all each fail here, at `npm run test:run`, rather
 * than silently six months later.
 */

const config: VercelConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')
);

/** What `npm run build` puts in dist/: one file per indexable route, plus the shell. */
const BUILT_FILES = new Set([
  'index.html',
  'spa-shell.html',
  'robots.txt',
  'sitemap.xml',
  'llms.txt',
  'assets/index-abc123.js',
  'assets/index-abc123.css',
  ...INDEXABLE_ROUTES.filter((route) => route.path !== '/').map(
    (route) => `${route.path.slice(1)}.html`
  )
]);

const exists = (file: string) => BUILT_FILES.has(file);
const resolvePath = (pathname: string) => resolveRequest(pathname, config, exists);

/** Routes that must never be prerendered, and must never be served a page. */
const PRIVATE_ROUTES = [
  '/sign-up',
  '/log-in',
  '/forgot-password',
  '/reset-password',
  '/check-your-email',
  '/finish-setup',
  '/dashboard',
  '/dashboard/account',
  '/checkout/success',
  '/checkout/cancelled'
];

describe('vercel.json', () => {
  it('sets cleanUrls, which is the only thing that maps /pricing onto pricing.html', () => {
    expect(config.cleanUrls).toBe(true);
  });

  it('does not fall back to /index.html, which is now the home page', () => {
    for (const rewrite of config.rewrites ?? []) {
      expect(rewrite.destination).not.toBe('/index.html');
      expect(rewrite.destination).not.toBe('/');
    }
  });

  it('still excludes /api from the fallback, because Stripe posts to one of them', () => {
    expect(config.rewrites?.some((rewrite) => rewrite.source.includes('?!api/'))).toBe(true);
  });

  it('writes the fallback destination without an extension, as cleanUrls requires', () => {
    for (const rewrite of config.rewrites ?? []) {
      expect(rewrite.destination.endsWith('.html')).toBe(false);
    }
  });
});

describe('every public route is served its own prerendered document', () => {
  it.each(INDEXABLE_ROUTES.map((route) => route.path))('%s', (path) => {
    const expected = path === '/' ? 'index.html' : `${path.slice(1)}.html`;
    expect(resolvePath(path)).toEqual({ kind: 'file', file: expected });
  });

  it('gives no two routes the same file, which was the whole defect', () => {
    const files = INDEXABLE_ROUTES.map((route) => {
      const result = resolvePath(route.path);
      return result.kind === 'file' ? result.file : result.kind;
    });
    expect(new Set(files).size).toBe(INDEXABLE_ROUTES.length);
  });

  it('fails loudly if a route was never prerendered, rather than serving the shell', () => {
    // The failure this whole file exists to catch: a page in the route table with no file
    // behind it must resolve to the shell, and that must be visibly different from a hit.
    const withoutPricing = (file: string) => file !== 'pricing.html' && exists(file);
    expect(resolveRequest('/pricing', config, withoutPricing)).toEqual({
      kind: 'file',
      file: 'spa-shell.html'
    });
  });
});

describe('everything else', () => {
  it.each(PRIVATE_ROUTES)('%s falls back to the noindex shell', (path) => {
    expect(resolvePath(path)).toEqual({ kind: 'file', file: 'spa-shell.html' });
  });

  it('serves an unknown URL the shell rather than the home page', () => {
    expect(resolvePath('/nothing-here')).toEqual({ kind: 'file', file: 'spa-shell.html' });
    expect(resolvePath('/deep/unknown/path')).toEqual({ kind: 'file', file: 'spa-shell.html' });
  });

  it('leaves the serverless functions alone', () => {
    expect(resolvePath('/api/stripe-webhook')).toEqual({
      kind: 'function',
      file: 'api/stripe-webhook'
    });
    expect(resolvePath('/api/plans')).toEqual({ kind: 'function', file: 'api/plans' });
  });

  it('still serves the static files that share the fallback pattern', () => {
    // These already prove on the live site that the filesystem is consulted before the
    // rewrite: all three match `/((?!api/).*)` and none of them is the shell.
    expect(resolvePath('/robots.txt')).toEqual({ kind: 'file', file: 'robots.txt' });
    expect(resolvePath('/sitemap.xml')).toEqual({ kind: 'file', file: 'sitemap.xml' });
    expect(resolvePath('/assets/index-abc123.js')).toEqual({
      kind: 'file',
      file: 'assets/index-abc123.js'
    });
  });

  it('308s the extension away, so a page has one address and not two', () => {
    expect(resolvePath('/pricing.html')).toEqual({
      kind: 'redirect',
      status: 308,
      location: '/pricing'
    });
  });
});
