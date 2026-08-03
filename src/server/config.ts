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
 *
 * The price ids are the same story one level down. They are never fields on this object any
 * more; what is carried instead is the INDEX built from them (price id -> plan and interval)
 * and the raw env, so that `priceIdForTier` reads the same object `buildPriceIndex` read and
 * the forward and reverse maps cannot drift.
 */

import { buildPriceIndex, missingPriceEnvVars, RAIL_TEST_PRICE_ENV_VAR, type PriceIndex } from './plan-contract.js';

export type Env = Record<string, string | undefined>;

export interface ServerConfig {
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  supabaseUrl?: string;
  serviceRoleKey?: string;
  /** The marketing site. Still the deployment's own origin; no longer where billing lands. */
  siteUrl: string;
  /** The product app. Where Stripe returns a customer after checkout or the portal. */
  appUrl: string;
  brand: string;
  /** price id -> { slug, interval }. Built once; throws on a duplicate id across entries. */
  priceIndex: PriceIndex;
  /** The raw env, so a tier can be turned into a price id without a second process.env read. */
  env: Env;
  /** bpc_… — distinct per Stripe mode. Without it the portal falls back to the SHARED
   *  account default, which has no tier switching and belongs to no brand in particular. */
  portalConfigurationId?: string;
  /** The £0.01 rail-test price. Never reachable through the `tier` field. */
  railTestPriceId?: string;
  /** Off unless explicitly enabled. Gates the `railTest: true` request field. */
  allowRailTestCheckout: boolean;
  /** Comma-separated extra CORS origins (e.g. a preview deployment of the app repo). */
  extraOrigins?: string;
}

export const DEFAULT_SITE_URL = 'https://www.batchlabel.xyz';
export const DEFAULT_APP_URL = 'https://app.batchlabel.xyz';
export const DEFAULT_BRAND = 'batchlabel';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function readServerConfig(env: Env): ServerConfig {
  const priceIndex = buildPriceIndex(env);
  const missing = missingPriceEnvVars(priceIndex);
  if (missing.length > 0) {
    // Logged, not thrown. A tier nobody has bought yet must not be able to stop the webhook
    // entitling the customers who are already paying.
    console.error(`[config] price ids not configured: ${missing.join(', ')}`);
  }

  return {
    stripeSecretKey: env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
    // SUPABASE_URL is the server-only name; VITE_SUPABASE_URL holds the same value and is
    // already set on this project, so accept either rather than fail on a missing alias.
    supabaseUrl: env.SUPABASE_URL ?? env.VITE_SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    siteUrl: trimTrailingSlash(env.SITE_URL ?? DEFAULT_SITE_URL),
    // Same alias trick: APP_URL is the server-only name, VITE_APP_URL is what the client
    // handoff already uses, and the two must never point at different apps.
    appUrl: trimTrailingSlash(env.APP_URL ?? env.VITE_APP_URL ?? DEFAULT_APP_URL),
    brand: env.VITE_ORCHESTRATE_BRAND?.trim() || DEFAULT_BRAND,
    priceIndex,
    env,
    portalConfigurationId: env.STRIPE_PORTAL_CONFIGURATION_ID?.trim() || undefined,
    railTestPriceId: env[RAIL_TEST_PRICE_ENV_VAR]?.trim() || undefined,
    // Anything other than the exact string 'true' is off. An env var accidentally set to '0'
    // or 'false' must not enable a live penny price on a public endpoint.
    allowRailTestCheckout: env.ALLOW_RAIL_TEST_CHECKOUT === 'true',
    extraOrigins: env.STRIPE_ALLOWED_ORIGINS
  };
}

/**
 * Builds an absolute return URL for Stripe from an origin we already trust and a path the
 * caller asked for.
 *
 * Both halves are constrained, because a Checkout success_url is a redirect target and an
 * unchecked one is an open redirect with our brand on it:
 *   * the ORIGIN is a SERVER CONSTANT — `config.appUrl` or `config.siteUrl`. It is no longer
 *     derived from the caller's Origin header at all, which removes the last way a request
 *     could influence where Stripe sends somebody;
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
