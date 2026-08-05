import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../App';
import { INDEXABLE_ROUTES } from '../lib/routes';

/**
 * The build-time entry point for prerendering. Never shipped to a browser.
 *
 * `scripts/prerender.mjs` bundles this file with Vite, gives it a jsdom document per
 * route and writes out what React leaves behind. Two things live here rather than in the
 * script, and both for the same reason: the script is plain JavaScript in scripts/, and
 * anything it restated in its own words could drift from the app.
 *
 *  1. The route list. It is `INDEXABLE_ROUTES` — the same array that generates the
 *     canonicals, the breadcrumbs and (via src/lib/routes.test.ts) public/sitemap.xml.
 *     There is deliberately no second list anywhere: a page cannot be added to the site
 *     and quietly miss prerendering, because there is nowhere to miss it from.
 *
 *  2. The render itself, which mounts the real `<App />` — the same component tree the
 *     browser mounts, with the same router, the same providers and the same cookie
 *     banner. Nothing is stubbed for prerendering, so what a crawler receives is what a
 *     first-time visitor with no session and no cookie choice would see.
 *
 * `initTagging()` is NOT called, and that is the point of doing this here rather than
 * reusing src/index.tsx. It is what loads GA4 and the Meta Pixel, and a measurement tag
 * that fired during a build — or a consent state baked into a file on a CDN — would be a
 * consent failure on a compliance product. The browser still calls it, from index.tsx, on
 * the visitor's own machine where the choice belongs.
 */
export const PRERENDER_ROUTES: string[] = INDEXABLE_ROUTES.map((route) => route.path);

/**
 * Mounts the app into `container` and resolves once React has finished — including
 * effects.
 *
 * `act` rather than a timeout, because every piece of metadata this exercise is about is
 * written by an effect: `usePageMeta` sets the title, description, canonical and og:
 * tags, and `useStructuredData` appends the page's JSON-LD. `renderToString` would return
 * before any of it ran and produce ten identical heads all over again. `act` flushes
 * render and effects and settles the promises they started, so the document is captured
 * in the state a browser would reach, not the state the first paint is in.
 *
 * Returns the teardown. Unmounting matters: `useStructuredData` removes its JSON-LD on
 * cleanup and `AuthProvider` unsubscribes, so leaving roots mounted would leak listeners
 * and timers across routes in a single process.
 */
export async function renderInto(container: HTMLElement): Promise<() => void> {
  const root = createRoot(container);
  await act(async () => {
    root.render(<App />);
  });
  return () => {
    act(() => {
      root.unmount();
    });
  };
}
