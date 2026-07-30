/**
 * POST /api/create-checkout-session
 *
 * Opens a Stripe Checkout Session for the Maker plan. Callable from the marketing site and,
 * cross-origin, from app.batchlabel.xyz.
 *
 * Body: { interval: 'monthly' | 'annual', attribution?: {...}, success_path?, cancel_path? }
 * Header: Authorization: Bearer <supabase access token>. REQUIRED — 401 without it.
 *
 * WHAT IS AND IS NOT TAKEN FROM THE REQUEST
 *
 * Identity comes from the access token, verified against Supabase. The body's job is to say
 * which price and which ad brought them; it cannot say who they are. That distinction is
 * what stops "POST a different user_id and put a subscription on their account".
 *
 * SIGN-IN IS REQUIRED, and that is a security decision as much as a product one. Selling to
 * a signed-out visitor meant the webhook had to guess afterwards who had paid, and the only
 * thing it had to guess with was the email typed into Stripe Checkout — which was
 * exploitable, because profiles.email was user-writable. It also produced unrecoverable
 * sales: a buyer with no account at all could not be linked to anything, ever. Requiring a
 * session removes both. Signed-out visitors are sent to sign up and returned here.
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
import { createAdminClient, findEntitlement, findMembership, userFromRequest } from '../src/server/supabase-admin';

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

    // SIGN-IN IS REQUIRED. There used to be an anonymous path here, which is what forced
    // the webhook to fall back to matching the email typed into Stripe Checkout — and that
    // was a critical vulnerability, because profiles.email was user-writable, so an
    // attacker could point it at a victim and absorb the plan and the Stripe customer they
    // paid for. Requiring a session removes the reason that path existed: every session now
    // carries a supabase_user_id taken from a verified JWT.
    //
    // It also means the buyer has an account to attach the subscription to. An anonymous
    // purchase by someone with no account was unrecoverable: money taken, nothing granted.
    if (!config.supabaseUrl || !config.serviceRoleKey) {
      return fail({ status: 500, message: 'Checkout is not configured yet.', detail: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing' }, cors);
    }

    const admin = createAdminClient(config.supabaseUrl, config.serviceRoleKey);
    const user = await userFromRequest(admin, request);
    if (!user) {
      return fail(
        { status: 401, message: 'Please sign in to subscribe. Your basket is safe — you will come straight back here.' },
        cors
      );
    }

    const userId = user.id;
    const email = user.email;

    // Deliberately NOT inside the identity try/catch it used to share. A transient failure
    // here is not "no existing customer"; treating it as such creates a SECOND Stripe
    // customer for someone who already has one, splitting their invoice history in two and
    // leaving the billing portal showing them half their own past. Fail loudly and let them
    // retry instead.
    let customerId: string | null = null;
    let alreadyEntitled = false;
    try {
      const [membership, entitlement] = await Promise.all([
      findMembership(admin, userId, config.brand),
      findEntitlement(admin, userId, config.brand)]
      );
      customerId = membership?.stripe_customer_id ?? null;
      alreadyEntitled = entitlement?.active === true;
    } catch (error) {
      return fail(
        { status: 503, message: 'We could not reach your account just now. Please try again in a moment.', detail: error },
        cors
      );
    }

    // Refuse to sell a second subscription to someone who already has one. The account
    // screen also hides the upgrade button once a plan is active, but the UI is not the
    // guard: a stale tab, a bookmarked link or a double submit all reach this endpoint, and
    // the result would be two subscriptions and two charges every month on one account.
    // Plan changes belong in the billing portal, which handles proration.
    if (alreadyEntitled) {
      return fail(
        {
          status: 409,
          message: 'You are already on the Maker plan. Use Manage billing to switch between monthly and yearly, change your card, or cancel.'
        },
        cors
      );
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
