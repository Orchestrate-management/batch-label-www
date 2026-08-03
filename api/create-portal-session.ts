/**
 * POST /api/create-portal-session
 *
 * Returns a Stripe Customer Portal URL so a maker can change card, download VAT invoices,
 * switch monthly/annual or cancel without emailing us.
 *
 * Header: Authorization: Bearer <supabase access token>. Required.
 * Body: { return_path?: string } — optional, constrained to a path on an allow-listed origin.
 *
 * THE ONE THING THIS ENDPOINT MUST GET RIGHT
 *
 * A billing portal session is a bearer URL: whoever holds it can see that customer's cards,
 * addresses and invoice history, and cancel their subscription. So the customer id is
 * resolved from the caller's VERIFIED Supabase JWT and nothing else. The previous stub took
 * `user_id` from the request body — with a real lookup behind it, that is an endpoint where
 * changing one string in a fetch call hands you a stranger's billing account.
 *
 * There is no `user_id` parameter here, at all, on purpose. It cannot be misused if it does
 * not exist.
 *
 * WHY THE `configuration` MATTERS. Without it the session uses the Stripe ACCOUNT DEFAULT
 * configuration, and that account is shared across Orchestrate brands — so it cannot be the
 * place Batchlabel's tier list is enabled without surfacing Batchlabel prices inside another
 * brand's portal. It is also the only thing that turns on `subscription_update`, which is
 * what makes tier switching possible at all: with one product per subscription and no
 * add-ons, the portal IS the tier-change screen, and there is no in-app substitute.
 */

import Stripe from 'stripe';
import { allowedOrigins, corsHeaders, preflightResponse } from '../src/server/cors.js';
import { readServerConfig, returnUrl } from '../src/server/config.js';
import { fail, json } from '../src/server/http.js';
import { createAdminClient, findMembership, userFromRequest } from '../src/server/supabase-admin.js';

export default {
  async fetch(request: Request): Promise<Response> {
    const config = readServerConfig(process.env);
    const allowList = allowedOrigins(config.extraOrigins);
    const origin = request.headers.get('origin');
    const cors = corsHeaders(origin, allowList);

    if (request.method === 'OPTIONS') return preflightResponse(origin, allowList);
    if (request.method !== 'POST') return fail({ status: 405, message: 'Method not allowed' }, cors);

    if (!config.stripeSecretKey || !config.supabaseUrl || !config.serviceRoleKey) {
      return fail(
        { status: 500, message: 'Billing is not configured yet.', detail: 'STRIPE_SECRET_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing' },
        cors
      );
    }

    const admin = createAdminClient(config.supabaseUrl, config.serviceRoleKey);

    const user = await userFromRequest(admin, request);
    if (!user) {
      return fail({ status: 401, message: 'Please sign in again to manage your billing.' }, cors);
    }

    let customerId: string | null = null;
    try {
      const membership = await findMembership(admin, user.id, config.brand);
      customerId = membership?.stripe_customer_id ?? null;
    } catch (error) {
      return fail({ status: 500, message: 'We could not reach your billing record. Please try again.', detail: error }, cors);
    }

    if (!customerId) {
      // Never a 500: this is the ordinary state of every free-plan account.
      return fail({ status: 404, message: 'We could not find a billing record for this account yet. If you have just subscribed, give it a moment and refresh.' }, cors);
    }

    const body = (await request.json().catch(() => null)) as {return_path?: unknown;} | null;

    if (!config.portalConfigurationId) {
      // Loud, because the silent version is worse than an outage: the portal still opens, it
      // just quietly loses tier switching, and the support ticket that follows reads like a
      // Stripe bug rather than a missing environment variable.
      console.error('[portal] STRIPE_PORTAL_CONFIGURATION_ID is unset; falling back to the shared account default');
    }

    try {
      const stripe = new Stripe(config.stripeSecretKey);
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        // Spread rather than an unconditional `configuration: undefined`, so the absence is
        // visible in the request we build rather than normalised away by the SDK.
        ...(config.portalConfigurationId ? { configuration: config.portalConfigurationId } : {}),
        // Back to the app, never to www: the app owns billing, and www no longer has an
        // account screen to return to.
        return_url: returnUrl(config.appUrl, body?.return_path as string | undefined, config.appUrl, '/billing')
      });
      return json({ url: session.url }, 200, cors);
    } catch (error) {
      return fail({ status: 502, message: 'We could not open the billing portal. Please email us.', detail: error }, cors);
    }
  }
};
