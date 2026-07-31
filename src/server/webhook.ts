/**
 * The Stripe webhook, minus the wiring.
 *
 * /api/stripe-webhook.ts is a fifteen-line adapter that builds the dependencies below and
 * calls this. Everything that can be got wrong lives here, where it can be tested against a
 * real Stripe SDK signature without a Stripe account, a database or a network.
 *
 * THE RAW BODY IS THE WHOLE GAME
 *
 * Stripe signs the exact bytes it sent. Any framework that parses the body first — Express'
 * json(), Next's default API body parser, Vercel's own `request.body` helper on the
 * (req, res) signature — hands you an object, and re-serialising it produces different
 * bytes (key order, whitespace, unicode escapes), so verification fails. Worse, it fails
 * only in production, because in local testing people reach for `constructEvent` with a
 * payload they stringified themselves and it matches.
 *
 * This handler takes a Web-standard `Request` and calls `request.text()`. There is no body
 * parser anywhere in the path: the bytes verified are the bytes received. /api handlers on
 * Vercel use the Web signature (`export default { fetch }`), so this is also the shape the
 * platform actually gives us.
 *
 * AN UNVERIFIED WEBHOOK IS AN OPEN ENDPOINT THAT GRANTS PAID PLANS.
 * Anyone who can POST JSON to it could mint themselves a subscription. There is therefore
 * no "skip verification if the secret is missing" branch — a missing secret is a 500.
 */

import type Stripe from 'stripe';
import { intentFromEvent, purchaseSignal, type EntitlementIntent, type IntentConfig } from './stripe-events';
import type { ConversionForwarder } from './meta-capi';
import { json } from './http';

export const STRIPE_SIGNATURE_HEADER = 'stripe-signature';

/**
 * What the database said it did. Returned to Stripe in the 200 body so the founder can see
 * it in the dashboard's event log without opening Vercel.
 */
export type ApplyOutcome =
'applied' |
'duplicate' |
'stale' |
'superseded' |
'no_membership' |
'unknown_brand';

/**
 * Outcomes that mean "we will never be able to act on this event".
 *
 * They are acknowledged with a 200 rather than a 500. Retrying cannot help — there is no
 * account to attach the event to, or no such brand — and a run of 5xx gets the endpoint
 * automatically disabled by Stripe, which takes billing down for everybody over one
 * unattributable event.
 */
const UNACTIONABLE: readonly ApplyOutcome[] = ['no_membership', 'unknown_brand'];

export interface EntitlementStore {
  apply: (intent: EntitlementIntent) => Promise<ApplyOutcome>;
}

export interface WebhookDeps {
  /** Only `webhooks` is used, so a test can pass a real Stripe instance with a dummy key. */
  stripe: Pick<Stripe, 'webhooks'>;
  webhookSecret: string | undefined;
  store: EntitlementStore;
  config: IntentConfig;
  /**
   * Meta Conversions API. Optional: billing must work whether or not Meta is configured,
   * and every existing test constructs these deps without it. When absent, nothing is
   * forwarded — which is also what happens on preview, where the access token is
   * deliberately unset. See ./meta-capi.ts.
   */
  conversions?: ConversionForwarder;
}

/**
 * CONSENT GATE — this is the note that specified the forwarding below, kept as the record
 * of what was required.
 *
 * A paid conversion is the obvious place to call Meta's Conversions API or Google's
 * Enhanced Conversions, and both forward personal data (a hashed email at minimum) to an
 * advertising platform. That is exactly what `brand_memberships.advertising_opt_in`
 * records, and it is the only thing that flag is for.
 *
 * Neither call may run for a user whose flag is false. Look it up with the service-role
 * key by the supabase user id already carried in the Checkout Session metadata, and skip
 * the forwarding when it is false OR when the lookup fails — fail closed, not open.
 *
 * AS IMPLEMENTED: Meta is done. `deps.conversions.forwardPurchase` performs that lookup as
 * the first thing it does, before it touches Meta, and drops the event on a false flag, a
 * missing membership, a thrown lookup or a missing user id. The gate lives inside the
 * forwarder rather than here so that a second call site cannot be added without it — see
 * `src/server/meta-capi.ts`, and `findAdvertisingConsent` in `src/server/supabase-admin.ts`
 * for the lookup itself. Google Enhanced Conversions is still not implemented; when it is,
 * it goes through the same gate rather than a second copy of it.
 *
 * Browser-side ad use is gated separately and by a different mechanism, because Consent
 * Mode is Google's and Meta does not read it: GA4 by Consent Mode v2, the Meta Pixel by not
 * being loaded at all (`src/lib/meta-pixel.ts`). Both are driven by the same decision — the
 * cookie banner's marketing toggle, which is also what sets `advertising_opt_in`. There is
 * deliberately no second question at signup. See docs/CONSENT.md.
 */
export async function handleStripeWebhook(request: Request, deps: WebhookDeps): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  if (!deps.webhookSecret) {
    // Fail closed. Processing unverified events would let anyone POST themselves a plan.
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set; refusing to process events.');
    return json({ error: 'Webhook is not configured.' }, 500);
  }

  const signature = request.headers.get(STRIPE_SIGNATURE_HEADER);
  if (!signature) {
    return json({ error: 'Missing Stripe signature.' }, 400);
  }

  // THE raw body. Read once, as text, before anything else touches the request.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    // Async variant so this same code works unchanged on the Edge runtime, where the
    // synchronous crypto the sync version needs does not exist.
    event = await deps.stripe.webhooks.constructEventAsync(rawBody, signature, deps.webhookSecret);
  } catch (error) {
    // 400 tells Stripe not to retry. A bad signature is never going to become a good one,
    // and retrying would just repeat a forgery attempt for three days.
    console.error('[stripe-webhook] signature verification failed', {
      message: error instanceof Error ? error.message : String(error)
    });
    return json({ error: 'Invalid signature.' }, 400);
  }

  const intent = intentFromEvent(event, deps.config);
  if (!intent) {
    // Acknowledged, deliberately not acted on. Returning non-2xx for events we do not care
    // about is how an endpoint gets automatically disabled for "too many failures".
    return json({ received: true, outcome: 'ignored', type: event.type }, 200);
  }

  let outcome: ApplyOutcome;
  try {
    outcome = await deps.store.apply(intent);
  } catch (error) {
    // 500 so Stripe retries: a database blip must not silently lose a paid subscription.
    console.error('[stripe-webhook] failed to apply entitlement', {
      event: event.id,
      type: event.type,
      message: error instanceof Error ? error.message : String(error)
    });
    return json({ error: 'Could not record the subscription.' }, 500);
  }

  // Conversion forwarding, at the one point where the event is known to be genuine AND to
  // have changed something.
  //
  // `outcome === 'applied'` is not belt-and-braces, it is the whole protection against
  // double-counting. Stripe retries on any non-2xx and re-delivers on its own schedule, so
  // this handler sees the same event more than once as a matter of routine. The entitlement
  // RPC claims the event id atomically, so the second delivery returns `duplicate` and the
  // Purchase is not sent again. Forwarding on event type alone would report one sale as
  // several — and inflated conversions are worse than missing ones, because Meta optimises
  // towards whatever we tell it is working.
  //
  // Awaited, not fired and forgotten: a serverless function is frozen the moment it
  // responds, so an un-awaited promise here is a request that may never leave the machine.
  // The outcome is never allowed to change the response — see below.
  if (outcome === 'applied' && deps.conversions) {
    const signal = purchaseSignal(event, deps.config);
    if (signal) {
      try {
        await deps.conversions.forwardPurchase(signal);
      } catch (error) {
        // Unreachable in practice — forwardPurchase catches its own failures — but this
        // handler grants paid plans, and measurement must never be able to break billing.
        // A 500 here would make Stripe retry an event that has already been applied.
        console.error('[stripe-webhook] conversion forwarding threw', {
          event: event.id,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  if (UNACTIONABLE.includes(outcome)) {
    // Logged loudly instead of retried. The event is NOT recorded as processed either, so
    // "Resend" from the Stripe dashboard will work once the account exists.
    console.warn(`[stripe-webhook] ${outcome}`, {
      event: event.id,
      type: event.type,
      brand: intent.brand,
      customer: intent.customerId,
      subscription: intent.subscriptionId,
      email: intent.email ? 'present' : 'absent'
    });
  }

  return json({ received: true, outcome, type: event.type }, 200);
}
