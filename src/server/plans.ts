/**
 * GET /api/plans — the public plan catalogue.
 *
 * api/plans.ts is a thin adapter that calls this; everything worth testing lives here, in
 * the same shape as the webhook (src/server/webhook.ts) for the same reason: Vercel deploys
 * every file in the root /api directory as an HTTP endpoint, so shared logic cannot live
 * beside the handlers without becoming a publicly addressable route.
 *
 * WHY THE ENDPOINT EXISTS AT ALL. The app's billing page is the single place a customer
 * picks a tier and is sent to Stripe Checkout, so it has to show what they are about to be
 * charged — but the app is a separate repo and must hold no price map, no allowance map and
 * no membership sets. It fetches the catalogue at runtime from the origin that owns the
 * contract instead. A stale literal in a second repo next to a live Stripe price is exactly
 * the class of defect this whole rail exists to remove.
 *
 * WHAT IS DELIBERATELY NOT IN THE PAYLOAD.
 *
 *   * NO STRIPE PRICE IDS. The client sends a `tier` and an `interval`; the server resolves
 *     the id from server-only env. A price id in this response would put the one value the
 *     checkout endpoint refuses to accept from a browser into a browser.
 *   * NO `rail_test`. It is filtered out by `publiclyListed`, not by name, so the filter
 *     cannot be defeated by renaming the slug — and a test asserts its absence, because the
 *     penny item appearing on a public price list is the one bug that is embarrassing in
 *     public rather than merely wrong.
 *   * NO SENTINEL. The tier with unlimited SKUs reports `skuLimit: null` and
 *     `skuUnlimited: true`, so no client can render "2,147,483,647 SKUs".
 *
 * Currency and tax behaviour are TOP-LEVEL constants of the whole catalogue rather than
 * per-entry fields, so no client can render one tier in a different currency from another.
 */

import { corsHeaders, preflightResponse } from './cors';
import { json } from './http';
import {
  CURRENCY,
  PLAN_CONTRACT,
  PLAN_ORDER,
  TAX_BEHAVIOUR,
  UNLIMITED,
  type PlanEntry } from
'./plan-contract';

/** Five minutes. Long enough to be worth a CDN, short enough that a price change is live
 *  the same working day. The response carries no identity, so it is safe to share. */
export const PLANS_CACHE_CONTROL = 'public, max-age=300';

export interface PublicPlan {
  slug: string;
  displayName: string;
  /** Integer pence, exclusive of VAT. Null where the tier has no price of that interval —
   *  `free` has neither, and free is the absence of a subscription rather than a £0 price. */
  monthlyPence: number | null;
  annualPence: number | null;
  /** Null when `skuUnlimited` is true. See the module header. */
  skuLimit: number | null;
  skuUnlimited: boolean;
  editorSeatLimit: number;
  /** False for `free`, which has no Stripe object to check out against. */
  purchasable: boolean;
}

export interface PublicPlanCatalogue {
  currency: typeof CURRENCY;
  taxBehaviour: typeof TAX_BEHAVIOUR;
  plans: PublicPlan[];
}

function toPublicPlan(entry: PlanEntry): PublicPlan {
  const unlimited = entry.skuLimit >= UNLIMITED;
  return {
    slug: entry.slug,
    displayName: entry.displayName,
    monthlyPence: entry.monthly?.amountPence ?? null,
    annualPence: entry.annual?.amountPence ?? null,
    skuLimit: unlimited ? null : entry.skuLimit,
    skuUnlimited: unlimited,
    editorSeatLimit: entry.editorSeatLimit,
    purchasable: entry.entitling
  };
}

/** The catalogue, generated from the contract. Nothing here is hand-maintained. */
export function publicPlanCatalogue(): PublicPlanCatalogue {
  return {
    currency: CURRENCY,
    taxBehaviour: TAX_BEHAVIOUR,
    plans: PLAN_ORDER.map((slug) => PLAN_CONTRACT[slug]).
    filter((entry) => entry.publiclyListed).
    map(toPublicPlan)
  };
}

/**
 * The handler. GET and OPTIONS only.
 *
 * Unauthenticated on purpose: this is the same projection already printed on the public
 * pricing page, so requiring a token would only mean the app could not render prices to
 * somebody whose session had expired.
 */
export function handlePlansRequest(request: Request, allowList: string[]): Response {
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') return preflightResponse(origin, allowList, 'GET, OPTIONS');

  const cors = corsHeaders(origin, allowList);
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: 'Method not allowed' }, 405, cors);
  }

  return json(publicPlanCatalogue(), 200, { ...cors, 'Cache-Control': PLANS_CACHE_CONTROL });
}
