import { useEffect } from 'react';
import { usePageMeta } from '../lib/seo';
import { goToApp } from '../lib/app-handoff';

/**
 * A path on this site that now lives in the product, forwarded.
 *
 * This exists for the routes www used to own and no longer does — /dashboard and
 * /dashboard/account. They are kept mounted rather than deleted because a bookmark, an old
 * email, a Stripe receipt or a link in someone's notes still points at them, and a 404 is a
 * worse answer than the page they were actually after.
 *
 * WHY IT IS NOT A `<Navigate>`. The destination is another origin, so this has to be a real
 * browser navigation. The session travels in the cookie on `.batchlabel.xyz` — see
 * lib/session-storage.ts — so the maker arrives in the app signed in, exactly as they do
 * from a completed login.
 *
 * WHY IT IS NOT GATED. There is deliberately no RequireAuth around this. A signed-out
 * visitor hits the app's own gate, which sends them to /log-in with `next` set to where
 * they were going, so they end up on the page they asked for rather than on this site's
 * front door. Adding a gate here would swallow that intent and gain nothing: this component
 * renders no account data.
 *
 * `to` is a path inside the app, never a full URL, and it is a constant written in this
 * repo — nothing here reads a path from the query string. goToApp validates it against the
 * allow-list in lib/app-handoff.ts regardless.
 */
export function AppRedirect({ to }: {to?: string;}) {
  usePageMeta({
    title: 'Opening Batchlabel',
    description: 'Taking you to the Batchlabel app.',
    noIndex: true
  });

  useEffect(() => {
    goToApp(to);
  }, [to]);

  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center bg-paper px-5">
      <p className="text-sm text-ink-muted" role="status">
        Taking you to Batchlabel...
      </p>
    </div>);

}
