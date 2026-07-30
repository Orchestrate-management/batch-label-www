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

/** 204 response for an OPTIONS preflight. */
export function preflightResponse(origin: string | null, allowList: string[]): Response {
  const headers: Record<string, string> = {
    ...corsHeaders(origin, allowList),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Max-Age': '86400'
  };
  return new Response(null, { status: 204, headers });
}
