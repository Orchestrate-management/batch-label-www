/**
 * POST /api/create-checkout-session
 *
 * Opens a Stripe Checkout Session for the Maker plan. Callable from the marketing site and,
 * cross-origin, from app.batchlabel.xyz.
 *
 * Body: { interval: 'monthly' | 'annual', attribution?: {...}, success_path?, cancel_path? }
 * Header: Authorization: Bearer <supabase access token>, when the visitor is signed in.
 *
 * WHAT IS AND IS NOT TAKEN FROM THE REQUEST
 *
 * Identity comes from the access token, verified against Supabase. The body's job is to say
 * which price and which ad brought them; it cannot say who they are. That distinction is
 * what stops "POST a different user_id and put a subscription on their account".
 *
 * Anonymous checkout is still allowed — the pricing page sells to people who have not signed
 * up yet, and refusing them would cost sales. Those sessions carry no supabase_user_id, and
 * the webhook links them by the email that paid.
 *
 * VAT: prices are stored in Stripe VAT-inclusive for consumers and `automatic_tax` is on, so
 * Stripe works out the rate from the address it collects and the customer pays the number on
 * the pricing page.
 */

import Stripe from 'stripe';
import { allowedOrigins, corsHeaders, isAllowedOrigin, preflightResponse } from '../src/server/cors';
import { readServerConfig, returnUrl } from '../src/server/config';
import { checkoutMetadata, resolveInterval } from '../src/server/checkout';
import { MAKER_PLAN } from '../src/server/entitlements';
import { fail, json } from '../src/server/http';
import { createAdminClient, findMembership, userFromRequest } from '../src/server/supabase-admin';

interface CheckoutRequestBody {
  interval?: unknown;
  attribution?: unknown;
  success_path?: unknown;
  cancel_path?: unknown;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const config = readServerConfig(process.env);
    const allowList = allowedOrigins(config.extraOrigins);
    const origin = request.headers.get('origin');
    const cors = corsHeaders(origin, allowList);

    if (request.method === 'OPTIONS') return preflightResponse(origin, allowList);
    if (request.method !== 'POST') return fail({ status: 405, message: 'Method not allowed' }, cors);

    if (!config.stripeSecretKey) {
      return fail({ status: 500, message: 'Checkout is not configured yet.', detail: 'STRIPE_SECRET_KEY missing' }, cors);
    }

    const body = (await request.json().catch(() => null)) as CheckoutRequestBody | null;
    const interval = resolveInterval(body?.interval);
    const priceId = interval === 'annual' ? config.priceAnnual : config.priceMonthly;
    if (!priceId) {
      return fail(
        {
          status: 500,
          message: 'That plan is not available just now. Please email us and we will sort it.',
          detail: `No price id configured for the ${interval} plan`
        },
        cors
      );
    }

    // Identity, if any. An invalid or expired token is treated as "not signed in" rather
    // than an error: the sale should still be possible, it just will not be pre-linked.
    let userId: string | null = null;
    let email: string | null = null;
    let customerId: string | null = null;

    if (config.supabaseUrl && config.serviceRoleKey) {
      try {
        const admin = createAdminClient(config.supabaseUrl, config.serviceRoleKey);
        const user = await userFromRequest(admin, request);
        if (user) {
          userId = user.id;
          email = user.email;
          // Reuse the Stripe customer we already have. Without this, a maker who cancels
          // and resubscribes becomes a second customer record, their invoice history
          // splits in two, and the billing portal shows them half their own past.
          const membership = await findMembership(admin, user.id, config.brand);
          customerId = membership?.stripe_customer_id ?? null;
        }
      } catch (error) {
        console.error('[create-checkout-session] identity lookup failed', error);
      }
    }

    // Returning to the origin that started the checkout keeps app.batchlabel.xyz's flow on
    // app.batchlabel.xyz. Constrained to the CORS allow-list, so this cannot be turned into
    // an open redirect by sending an Origin header.
    const trustedOrigin = isAllowedOrigin(origin, allowList) ? origin : config.siteUrl;
    const successUrl = `${returnUrl(trustedOrigin, body?.success_path as string | undefined, config.siteUrl, '/checkout/success')}?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = returnUrl(trustedOrigin, body?.cancel_path as string | undefined, config.siteUrl, '/checkout/cancelled');

    const metadata = checkoutMetadata({
      userId,
      brand: config.brand,
      interval,
      plan: MAKER_PLAN,
      attribution: body?.attribution
    });

    const stripe = new Stripe(config.stripeSecretKey);

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: true,
        automatic_tax: { enabled: true },
        billing_address_collection: 'auto',
        client_reference_id: userId ?? undefined,
        metadata,
        // The same block again. Session metadata reaches checkout.session.completed only;
        // subscription metadata is what every later customer.subscription.* event carries.
        subscription_data: { metadata },
        ...(customerId ?
        {
          customer: customerId,
          // Required by Stripe whenever automatic_tax is on and an existing customer is
          // reused — without it the API rejects the request outright, because it may need
          // to save the address Checkout collects back onto the customer.
          customer_update: { address: 'auto' as const, name: 'auto' as const }
        } :
        // NOTE: no `customer_creation` here. It is a payment-mode-only parameter and
        // Stripe 400s on it in subscription mode, which is where the previous stub would
        // have failed on its very first live call.
        { customer_email: email ?? undefined })
      });

      if (!session.url) {
        return fail({ status: 502, message: 'Could not open the checkout. Please try again.', detail: session.id }, cors);
      }
      return json({ id: session.id, url: session.url }, 200, cors);
    } catch (error) {
      return fail(
        {
          status: 502,
          message: 'We could not open the checkout just now. Please try again in a moment or email us.',
          detail: error
        },
        cors
      );
    }
  }
};
