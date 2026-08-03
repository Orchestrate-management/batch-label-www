/**
 * CORS for the billing endpoints.
 *
 * The marketing site (www.batchlabel.xyz) calls these same-origin and needs nothing. The
 * product client (app.batchlabel.xyz) is a SEPARATE deployment on a different origin, so
 * its calls are cross-origin and the browser will not show it the response without an
 * explicit Access-Control-Allow-Origin.
 *
 * Why not `*`: these requests are credentialed — they carry the caller's Supabase access
 * token in an Authorization header. The Fetch spec forbids `*` alongside
 * Access-Control-Allow-Credentials: true, and even if it did not, a wildcard on an endpoint
 * that mints a Stripe billing-portal link is an invitation. So the allow-list is exact, and
 * the header echoes back the request's own origin only when it is on the list.
 *
 * `Vary: Origin` is not optional. Without it a CDN can cache the response it built for
 * app.batchlabel.xyz and serve it, with the wrong ACAO header, to www — which fails in a
 * way that looks like a random intermittent CORS bug.
 *
 * TWO THINGS THAT WERE DECORATIVE AND ARE NOW LOAD-BEARING, now that checkout is launched
 * from the app rather than from www:
 *
 *   * `https://app.batchlabel.xyz` on the list is the only thing making checkout work at
 *     all. A "tidy up the allow-list" change that drops it takes billing down with a
 *     browser-only error that never appears in server logs. There is a test asserting it by
 *     name for exactly that reason.
 *   * `STRIPE_ALLOWED_ORIGINS` is the app's preview-deploy lifeline: every Vercel preview of
 *     the app repo is a distinct origin and is CORS-blocked until it is added here. Do NOT
 *     relax isAllowedOrigin to a `*.vercel.app` suffix match — that is every Vercel user's
 *     project, on endpoints that mint billing-portal links.
 *
 * The www origins STAY on the list, and that is a no-op rather than a judgement call: these
 * functions are deployed on the www origin, so www's own calls are same-origin and need no
 * ACAO header either way.
 */

/** Origins that may call the billing endpoints with credentials. */
export const DEFAULT_ALLOWED_ORIGINS = [
'https://app.batchlabel.xyz',
'https://www.batchlabel.xyz',
'https://batchlabel.xyz',
// Local development of either repo.
'http://localhost:5173',
'http://localhost:3000',
'http://127.0.0.1:5173'] as
const;

/**
 * Extra origins from the environment, comma separated. This is how a Vercel preview URL
 * for the app repo gets access without a code change.
 */
export function parseExtraOrigins(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw.
  split(',').
  map((value) => value.trim().replace(/\/$/, '')).
  filter((value) => value.length > 0);
}

export function allowedOrigins(extra: string | undefined | null): string[] {
  return [...DEFAULT_ALLOWED_ORIGINS, ...parseExtraOrigins(extra)];
}

export function isAllowedOrigin(origin: string | null, allowList: string[]): boolean {
  if (!origin) return false;
  return allowList.includes(origin.replace(/\/$/, ''));
}

/**
 * Headers for an actual (non-preflight) response.
 *
 * An origin that is not on the list simply gets no ACAO header. That is a deliberate
 * choice over returning 403: the request still runs for same-origin and server-to-server
 * callers, and the browser is the thing that enforces the block.
 */
export function corsHeaders(origin: string | null, allowList: string[]): Record<string, string> {
  const headers: Record<string, string> = { Vary: 'Origin' };
  if (!isAllowedOrigin(origin, allowList)) return headers;
  headers['Access-Control-Allow-Origin'] = origin as string;
  headers['Access-Control-Allow-Credentials'] = 'true';
  return headers;
}

/**
 * 204 response for an OPTIONS preflight.
 *
 * `methods` defaults to the billing endpoints' POST because they are the reason this module
 * exists. GET /api/plans passes 'GET, OPTIONS': advertising a method an endpoint does not
 * implement teaches a browser to send a request that will 405, which reads as a CORS bug.
 */
export function preflightResponse(
origin: string | null,
allowList: string[],
methods = 'POST, OPTIONS')
: Response {
  const headers: Record<string, string> = {
    ...corsHeaders(origin, allowList),
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Max-Age': '86400'
  };
  return new Response(null, { status: 204, headers });
}
