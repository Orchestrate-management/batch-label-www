/**
 * Server-side configuration for the Vercel Functions in /api.
 *
 * Read from process.env, never from `import.meta.env`: the VITE_ prefixed values are inlined
 * into the browser bundle at build time, and nothing in this file may ever be.
 * STRIPE_SECRET_KEY and SUPABASE_SERVICE_ROLE_KEY in particular are the two values that
 * turn "a customer" into "anyone".
 *
 * Note the deliberate absence of a `brand` request parameter anywhere in the API surface.
 * The brand is a property of the deployment, so it is read here once. A brand taken from the
 * request body would let a caller aim a write at another Orchestrate brand's membership.
 */

import { buildPriceMap, type PriceMap } from './entitlements';

export type Env = Record<string, string | undefined>;

export interface ServerConfig {
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  priceMonthly?: string;
  priceAnnual?: string;
  supabaseUrl?: string;
  serviceRoleKey?: string;
  /** Where checkout returns to when the caller's origin is not on the allow-list. */
  siteUrl: string;
  brand: string;
  prices: PriceMap;
  /** Comma-separated extra CORS origins (e.g. a preview deployment of the app repo). */
  extraOrigins?: string;
}

export const DEFAULT_SITE_URL = 'https://www.batchlabel.xyz';
export const DEFAULT_BRAND = 'batchlabel';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function readServerConfig(env: Env): ServerConfig {
  return {
    stripeSecretKey: env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
    priceMonthly: env.STRIPE_PRICE_MAKER_MONTHLY,
    priceAnnual: env.STRIPE_PRICE_MAKER_ANNUAL,
    // SUPABASE_URL is the server-only name; VITE_SUPABASE_URL holds the same value and is
    // already set on this project, so accept either rather than fail on a missing alias.
    supabaseUrl: env.SUPABASE_URL ?? env.VITE_SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    siteUrl: trimTrailingSlash(env.SITE_URL ?? DEFAULT_SITE_URL),
    brand: env.VITE_ORCHESTRATE_BRAND?.trim() || DEFAULT_BRAND,
    prices: buildPriceMap({
      STRIPE_PRICE_MAKER_MONTHLY: env.STRIPE_PRICE_MAKER_MONTHLY,
      STRIPE_PRICE_MAKER_ANNUAL: env.STRIPE_PRICE_MAKER_ANNUAL
    }),
    extraOrigins: env.STRIPE_ALLOWED_ORIGINS
  };
}

/**
 * Builds an absolute return URL for Stripe from an origin we already trust and a path the
 * caller asked for.
 *
 * Both halves are constrained, because a Checkout success_url is a redirect target and an
 * unchecked one is an open redirect with our brand on it:
 *   * the ORIGIN must already be on the CORS allow-list (the caller passes the result of
 *     that check in, it is not re-derived from a header here);
 *   * the PATH must be a single-slash absolute path. '//evil.example' and
 *     'https://evil.example' are both rejected, since the first is a protocol-relative URL
 *     that browsers happily treat as another origin.
 */
export function returnUrl(
origin: string | null,
path: string | null | undefined,
fallbackOrigin: string,
defaultPath: string)
: string {
  const base = trimTrailingSlash(origin ?? fallbackOrigin);
  const candidate = typeof path === 'string' ? path.trim() : '';
  const safePath =
  candidate.startsWith('/') && !candidate.startsWith('//') ? candidate : defaultPath;
  return `${base}${safePath}`;
}
