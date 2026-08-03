/**
 * GET /api/plans
 *
 * The public plan catalogue, so the app's billing page can show a customer what they are
 * about to be charged without holding a price map of its own.
 *
 * Deliberately thin: everything worth testing — the projection, the `publiclyListed` filter
 * that keeps the £0.01 rail-test item off a public price list, the cache header and the
 * method handling — lives in src/server/plans.ts. Vercel deploys every file in this root
 * /api directory as an endpoint, so shared code cannot sit beside the handlers.
 *
 * Unauthenticated and cacheable. It contains no secret and no price id: it is the same
 * projection already printed on the public pricing page.
 */

import { allowedOrigins } from '../src/server/cors';
import { readServerConfig } from '../src/server/config';
import { handlePlansRequest } from '../src/server/plans';

export default {
  async fetch(request: Request): Promise<Response> {
    const config = readServerConfig(process.env);
    return handlePlansRequest(request, allowedOrigins(config.extraOrigins));
  }
};
