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
import { intentFromEvent, type EntitlementIntent, type IntentConfig } from './stripe-events';
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
'no_membership';

export interface EntitlementStore {
  apply: (intent: EntitlementIntent) => Promise<ApplyOutcome>;
}

export interface WebhookDeps {
  /** Only `webhooks` is used, so a test can pass a real Stripe instance with a dummy key. */
  stripe: Pick<Stripe, 'webhooks'>;
  webhookSecret: string | undefined;
  store: EntitlementStore;
  config: IntentConfig;
}

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

  if (outcome === 'no_membership') {
    // 200 on purpose. Retrying cannot help — there is no account to attach this to — and a
    // string of 5xx would get the endpoint disabled. Logged loudly instead, and the event
    // is NOT recorded as processed, so "Resend" from the Stripe dashboard will work once
    // the account exists.
    console.warn('[stripe-webhook] no membership matched this event', {
      event: event.id,
      type: event.type,
      customer: intent.customerId,
      subscription: intent.subscriptionId,
      email: intent.email ? 'present' : 'absent'
    });
  }

  return json({ received: true, outcome, type: event.type }, 200);
}
