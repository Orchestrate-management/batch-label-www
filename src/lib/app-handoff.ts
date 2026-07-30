/**
 * Handing a signed-in maker over to the product app.
 *
 * The split: www.batchlabel.xyz does marketing, accounts and payments.
 * app.batchlabel.xyz is the product. Once someone has an account they belong in
 * the app, so every completed auth flow ends by sending them there.
 *
 * The session travels with them in a cookie on `.batchlabel.xyz` — see
 * lib/session-storage.ts. Without that they would arrive signed out.
 */

const DEFAULT_APP_URL = 'https://app.batchlabel.xyz';

/** Override per deployment (a preview of the app, or a local dev instance). */
export const APP_URL =
((import.meta as unknown as {env?: Record<string, string>;}).env?.VITE_APP_URL ||
DEFAULT_APP_URL).replace(/\/+$/, '');

/**
 * Hosts we are willing to bounce a freshly authenticated user to.
 *
 * The app sends people here as `/log-in?next=<url>` so they land back where they
 * started. That parameter is attacker-controllable, so it is matched against
 * this list rather than trusted — an unchecked `next` is an open redirect, and a
 * convincing one, because it happens immediately after a real login.
 */
/** True only in a dev build. Vite replaces this at build time. */
function isDevBuild(): boolean {
  return Boolean((import.meta as unknown as {env?: Record<string, unknown>;}).env?.DEV);
}

function isAllowedDestination(raw: string, allowLocalhost: boolean = isDevBuild()): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw, APP_URL);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;

  const appHost = (() => {
    try {
      return new URL(APP_URL).hostname;
    } catch {
      return '';
    }
  })();

  const host = parsed.hostname;
  if (host === appHost || host === 'app.batchlabel.xyz') return true;

  // Local development of the app, and ONLY in a dev build. Left unconditional this is a
  // production open redirect: a login link could bounce someone to an attacker's
  // localhost-named host. No token leaks either way — the session cookie is scoped to
  // .batchlabel.xyz — but sending a freshly authenticated person somewhere unexpected is
  // exactly the moment they are least likely to notice.
  return allowLocalhost && (host === 'localhost' || host === '127.0.0.1');
}

/**
 * Where to send someone once they are authenticated and provisioned.
 *
 * `next` comes from the query string when the app bounced them here to sign in.
 * Anything unrecognised falls back to the app's front door rather than being
 * followed.
 */
export function resolveHandoffTarget(next?: string | null): string {
  if (next && isAllowedDestination(next)) {
    return new URL(next, APP_URL).toString();
  }
  return APP_URL;
}

/** Leaves the marketing site for the app. A full navigation, not a router push. */
export function goToApp(next?: string | null) {
  if (typeof window === 'undefined') return;
  window.location.assign(resolveHandoffTarget(next));
}

/** Exported for tests. */
export const __testing = { isAllowedDestination };
