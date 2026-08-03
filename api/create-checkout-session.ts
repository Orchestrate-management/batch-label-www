/**
 * POST /api/create-checkout-session
 *
 * Opens a Stripe Checkout Session for a paid tier. Called cross-origin from the app's
 * billing page, which is the single place a customer picks a tier and an interval.
 *
 * Body: { tier, interval?, railTest?, attribution?, meta?, success_path?, cancel_path? }
 * Header: Authorization: Bearer <supabase access token>. REQUIRED — 401 without it.
 *
 * NO price id, product id, amount, currency, allowance, plan, brand, user_id or email is
 * accepted in any field. The body says which tier and which ad brought them; it cannot say
 * who they are, and it cannot say what anything costs.
 *
 * WHY A CLIENT CANNOT BUY CONSULTANT AT THE MAKER PRICE — four independent reasons, because
 * the question deserves a demonstration rather than an assertion:
 *
 *   1. THERE IS NO FIELD IN WHICH THE PAIR CAN BE EXPRESSED. "Consultant at the Maker price"
 *      needs two values from the client. The contract accepts one.
 *   2. THE ONE VALUE IT DOES ACCEPT IS AN INDEX INTO SERVER-ONLY ENV, not a value. `tier`
 *      selects PLAN_CONTRACT[tier][interval].envVar; the price id is env[envVar], which the
 *      browser has never seen.
 *   3. `resolveTier` ALLOW-LISTS AND RETURNS NULL. No coercion, no default. 'Consultant',
 *      'consultant ', 'free', 'rail_test', {} and absent all 400. There is no input that
 *      silently becomes a different tier.
 *   4. THE ROUND TRIP RE-DERIVES THE METADATA FROM THE PRICE. `plan` and `interval` written
 *      to Stripe come from resolving the price id back through the SAME index the webhook
 *      uses — so even a hypothetical bug in (1)–(3) would write the tier the price actually
 *      sells, and the customer would be charged Maker and granted Maker. Wrong, but not
 *      exploitable.
 *
 * And in the other direction: `resolveTier` cannot return `rail_test`, `railTest: true`
 * cannot select a paid price, and buildPriceIndex throws at boot if the two are ever
 * configured to the same id.
 *
 * SIGN-IN IS REQUIRED, and that is a security decision as much as a product one. Selling to
 * a signed-out visitor meant the webhook had to guess afterwards who had paid, and the only
 * thing it had to guess with was the email typed into Stripe Checkout — which was
 * exploitable, because profiles.email was user-writable. It also produced unrecoverable
 * sales: a buyer with no account could not be linked to anything, ever.
 *
 * VAT: every price is stored EXCLUSIVE of VAT, so `automatic_tax` ADDS the VAT that the
 * customer's country requires rather than backing it out, and `tax_id_collection` is what
 * lets a business supply a VAT number and get the reverse charge. Both are required, not
 * optional. Nothing here enables currency options: every customer is billed in GBP, in every
 * country, with no presentment conversion.
 */

import Stripe from 'stripe';
import { allowedOrigins, corsHeaders, preflightResponse } from '../src/server/cors';
import { readServerConfig, returnUrl } from '../src/server/config';
import { checkoutMetadata, resolveInterval, resolveRailTest, resolveTier, sanitiseMetaCookies } from '../src/server/checkout';
import { displayNameForPlan, planEntryForPrice, priceIdForTier } from '../src/server/plan-contract';
import { fail, json } from '../src/server/http';
import { createAdminClient, findEntitlement, findMembership, userFromRequest } from '../src/server/supabase-admin';

interface CheckoutRequestBody {
  tier?: unknown;
  interval?: unknown;
  /** The £0.01 rail test. Ignored unless ALLOW_RAIL_TEST_CHECKOUT is on. */
  railTest?: unknown;
  attribution?: unknown;
  /** Meta's `_fbp` / `_fbc` cookies, sent only when advertising consent is granted. */
  meta?: unknown;
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

    // (1) TIER — allow-listed, never coerced. Absent or unrecognised is a 400, not a sale of
    //     whichever tier happened to be the default.
    const tier = resolveTier(body?.tier);
    const railTest = resolveRailTest(body?.railTest, config.allowRailTestCheckout);
    if (!tier && !railTest) {
      return fail({ status: 400, message: 'Choose a plan first.', detail: `tier=${String(body?.tier)}` }, cors);
    }

    // (2) INTERVAL — coercion is fine here. See resolveTier's comment for why the two differ.
    const interval = resolveInterval(body?.interval);

    // (3) TIER -> PRICE ID. The only place a price id enters this handler, and it comes from
    //     server-only env by way of the contract. The body chose which env var to read; it
    //     did not supply, name or influence its value.
    const priceId = railTest ? config.railTestPriceId ?? null : priceIdForTier(tier!, interval, config.env);
    if (!priceId) {
      return fail(
        {
          status: 500,
          message: 'That plan is not available just now. Please email us and we will sort it.',
          detail: railTest ?
          'rail test requested but STRIPE_PRICE_RAIL_TEST_MONTHLY is unset' :
          `no price id configured for ${tier}/${interval}`
        },
        cors
      );
    }

    // (4) THE ROUND TRIP. Resolve the price id BACK through the same index the webhook uses,
    //     and derive everything written to Stripe from the result. This is what makes the
    //     validation structural rather than procedural.
    const resolved = planEntryForPrice(priceId, config.priceIndex);
    if (!resolved) {
      // Only reachable if the env points at a price the index does not contain, which
      // buildPriceIndex's own construction makes impossible. A paranoia branch, kept because
      // the alternative to noticing is selling something we cannot name.
      return fail(
        {
          status: 500,
          message: 'That plan is not available just now. Please email us and we will sort it.',
          detail: `price ${priceId} is absent from the price index`
        },
        cors
      );
    }

    if (!config.supabaseUrl || !config.serviceRoleKey) {
      return fail({ status: 500, message: 'Checkout is not configured yet.', detail: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing' }, cors);
    }

    const admin = createAdminClient(config.supabaseUrl, config.serviceRoleKey);
    const user = await userFromRequest(admin, request);
    if (!user) {
      // The caller is the app's billing page, where the customer is by definition already
      // signed in — so a 401 here means an expired token, not "please make an account".
      return fail(
        { status: 401, message: 'Your session has expired. Sign in again and we will bring you straight back to billing.' },
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
    let heldPlan: string | null = null;
    try {
      const [membership, entitlement] = await Promise.all([
      findMembership(admin, userId, config.brand),
      findEntitlement(admin, userId, config.brand)]
      );
      customerId = membership?.stripe_customer_id ?? null;
      alreadyEntitled = entitlement?.active === true;
      heldPlan = entitlement?.plan ?? null;
    } catch (error) {
      return fail(
        { status: 503, message: 'We could not reach your account just now. Please try again in a moment.', detail: error },
        cors
      );
    }

    // Refuse to sell a second subscription to someone who already has one. The billing page
    // also hides the purchase surface once a plan is active, but the UI is not the guard: a
    // stale tab, a bookmarked link or a double submit all reach this endpoint, and the result
    // would be two subscriptions and two charges every month on one account. Plan changes
    // belong in the billing portal, which handles proration.
    //
    // THIS APPLIES TO THE RAIL TEST UNCHANGED — there is deliberately no `if (railTest) skip`
    // branch. The penny item is therefore never sold to an account that already holds a paid
    // plan, so it can never overwrite a real plan value. The consequence is correct: you
    // cannot run the rail test on an account that already pays, which is what testing a rail
    // end to end means anyway.
    if (alreadyEntitled) {
      return fail(
        {
          status: 409,
          message:
          `You are already on the ${displayNameForPlan(heldPlan)} plan. Use Manage billing to change plan, ` +
          `switch between monthly and yearly, update your card, or cancel.`
        },
        cors
      );
    }

    // CHECKOUT RETURNS TO THE APP, NEVER TO WWW. The app owns all account management; www is
    // marketing plus auth only, and has no billing screen to land on. The origin is a server
    // constant rather than the caller's Origin header, so a request cannot influence where
    // Stripe sends somebody at all; the paths stay caller-supplied but are constrained to
    // single-slash absolute paths, which is what rejects '//evil.example'.
    const successUrl = `${returnUrl(config.appUrl, body?.success_path as string | undefined, config.appUrl, '/billing/success')}?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = returnUrl(config.appUrl, body?.cancel_path as string | undefined, config.appUrl, '/billing');

    const metadata = checkoutMetadata({
      userId,
      brand: config.brand,
      // BOTH from the resolved price entry. The body's tier and interval are discarded here.
      plan: resolved.entry.slug,
      interval: resolved.interval,
      attribution: body?.attribution,
      // Format-validated, never trusted as sent. See sanitiseMetaCookies.
      meta: sanitiseMetaCookies(body?.meta)
    });

    const stripe = new Stripe(config.stripeSecretKey);

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: resolved.priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: true,
        // Prices are stored tax-exclusive, so this ADDS the customer's VAT rather than
        // backing it out of a gross number.
        automatic_tax: { enabled: true },
        // How a business supplies its VAT number and gets the reverse charge. Without it an
        // EU or UK business customer is charged VAT it then has to reclaim, which is the
        // single most common B2B checkout complaint.
        tax_id_collection: { enabled: true },
        // Stripe Tax needs an address to work out the rate at all.
        billing_address_collection: 'required',
        client_reference_id: userId,
        metadata,
        // The same block again. Session metadata reaches checkout.session.completed only;
        // subscription metadata is what every later customer.subscription.* event carries.
        subscription_data: { metadata },
        ...(customerId ?
        {
          customer: customerId,
          // Required by Stripe whenever automatic_tax or tax_id_collection is on and an
          // existing customer is reused — without it the API rejects the request outright,
          // because it may need to save what Checkout collects back onto the customer.
          customer_update: { address: 'auto' as const, name: 'auto' as const }
        } :
        // NOTE: no `customer_creation` here. It is a payment-mode-only parameter and Stripe
        // 400s on it in subscription mode.
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
