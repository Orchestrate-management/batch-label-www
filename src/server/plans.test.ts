// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { PLANS_CACHE_CONTROL, handlePlansRequest, publicPlanCatalogue } from './plans';
import { allowedOrigins } from './cors';
import { PLAN_CONTRACT, UNLIMITED } from './plan-contract';

const allowList = allowedOrigins(undefined);
const APP = 'https://app.batchlabel.xyz';

function get(url = 'https://www.batchlabel.xyz/api/plans', init: RequestInit = {}): Request {
  return new Request(url, init);
}

describe('the public catalogue', () => {
  it('states the currency and tax behaviour once, at the top level', () => {
    const catalogue = publicPlanCatalogue();
    // Per-entry fields would let a client render one tier in a different currency from
    // another. Every customer is billed in GBP, in every country, exclusive of VAT.
    expect(catalogue.currency).toBe('gbp');
    expect(catalogue.taxBehaviour).toBe('exclusive');
    for (const plan of catalogue.plans) {
      expect(plan).not.toHaveProperty('currency');
      expect(plan).not.toHaveProperty('taxBehaviour');
    }
  });

  /**
   * THE assertion this endpoint exists to satisfy. The £0.01 rail-test item must never
   * appear on a public price list, and the filter is `publiclyListed` rather than a name
   * check so it cannot be defeated by renaming the slug.
   */
  it('never contains the rail test', () => {
    const body = JSON.stringify(publicPlanCatalogue());
    expect(body).not.toContain('rail_test');
    expect(body).not.toContain('Payment rail test');
    expect(publicPlanCatalogue().plans.map((p) => p.slug)).toEqual(['free', 'maker', 'studio', 'consultant']);
  });

  it('carries no Stripe price id, lookup key or env var name', () => {
    const body = JSON.stringify(publicPlanCatalogue());
    expect(body).not.toContain('price_');
    expect(body).not.toContain('lookupKey');
    expect(body).not.toContain('STRIPE_');
    expect(body).not.toContain('envVar');
  });

  it('reports amounts in ex-VAT pence, straight off the contract', () => {
    const plans = Object.fromEntries(publicPlanCatalogue().plans.map((p) => [p.slug, p]));
    expect(plans.maker.monthlyPence).toBe(PLAN_CONTRACT.maker.monthly?.amountPence);
    expect(plans.consultant.annualPence).toBe(PLAN_CONTRACT.consultant.annual?.amountPence);
    // Free is the absence of a subscription, not a £0 price.
    expect(plans.free.monthlyPence).toBeNull();
    expect(plans.free.annualPence).toBeNull();
    expect(plans.free.purchasable).toBe(false);
  });

  /** So that "2,147,483,647 SKUs" cannot be rendered to a Consultant customer. */
  it('reports unlimited as a boolean with no number beside it', () => {
    const consultant = publicPlanCatalogue().plans.find((p) => p.slug === 'consultant');
    expect(consultant?.skuUnlimited).toBe(true);
    expect(consultant?.skuLimit).toBeNull();
    expect(JSON.stringify(publicPlanCatalogue())).not.toContain(String(UNLIMITED));
  });

  it('reports a real number for every metered tier', () => {
    for (const plan of publicPlanCatalogue().plans) {
      if (plan.skuUnlimited) continue;
      expect(typeof plan.skuLimit).toBe('number');
      expect(plan.editorSeatLimit).toBeGreaterThan(0);
    }
  });
});

describe('the endpoint', () => {
  it('serves the catalogue with the cache header', async () => {
    const response = handlePlansRequest(get(), allowList);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe(PLANS_CACHE_CONTROL);
    const body = await response.json();
    expect(body.plans.map((p: {slug: string;}) => p.slug)).not.toContain('rail_test');
  });

  it('lets the product app read it cross-origin', () => {
    const response = handlePlansRequest(get(undefined, { headers: { origin: APP } }), allowList);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(APP);
    // Without Vary a CDN can serve the app's ACAO header to a different origin.
    expect(response.headers.get('Vary')).toBe('Origin');
  });

  it('gives an origin that is not on the list no ACAO header at all', () => {
    const response = handlePlansRequest(get(undefined, { headers: { origin: 'https://evil.example' } }), allowList);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('answers the preflight advertising GET, not POST', () => {
    const response = handlePlansRequest(
      get(undefined, { method: 'OPTIONS', headers: { origin: APP } }),
      allowList
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
  });

  it('refuses to be written to', () => {
    expect(handlePlansRequest(get(undefined, { method: 'POST' }), allowList).status).toBe(405);
    expect(handlePlansRequest(get(undefined, { method: 'DELETE' }), allowList).status).toBe(405);
  });
});
