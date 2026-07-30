/**
 * Tiny response helpers shared by the Vercel Functions in /api.
 *
 * These live under src/server, not under /api, for one reason: Vercel turns EVERY file in
 * the root /api directory into a deployed HTTP endpoint. A helper module sitting next to
 * the handlers would become a publicly addressable route. Shared server code therefore
 * lives here and is imported by the handlers.
 */

export function json(
payload: unknown,
status: number,
headers: Record<string, string> = {})
: Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}

/**
 * A message safe to show a customer, paired with the detail we want in the logs.
 *
 * Stripe and Supabase errors routinely contain ids, emails and internal reasons. Echoing
 * them into the browser is a slow leak, so the two halves are separated at the type level
 * rather than by remembering to be careful at each call site.
 */
export interface SafeError {
  status: number;
  /** Shown to the customer. */
  message: string;
  /** Logged only. */
  detail?: unknown;
}

export function fail(error: SafeError, headers: Record<string, string> = {}): Response {
  if (error.detail !== undefined) {
    console.error(`[api] ${error.message}`, error.detail);
  }
  return json({ error: error.message }, error.status, headers);
}
