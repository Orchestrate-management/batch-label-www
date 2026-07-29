/**
 * POST /api/stripe-webhook
 *
 * Single source of truth for paid conversions, and the documented placeholder for
 * server side conversion forwarding.
 *
 * TODO before going live:
 *   1. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET, then verify the signature with
 *      stripe.webhooks.constructEvent using the RAW request body.
 *   2. Subscribe to checkout.session.completed, customer.subscription.updated and
 *      customer.subscription.deleted.
 *   3. Persist stripe_customer_id and plan state against the Supabase user using the
 *      service role key, so api/create-portal-session.ts can find the customer.
 *   4. Fill in the two forwarding functions below.
 *
 * WHY SERVER SIDE: the browser purchase event is unreliable (ad blockers, consent
 * denial, redirect drop off) and can fire before payment actually succeeds. The click
 * identifiers captured on first touch (gclid, gbraid, wbraid, fbclid) are written to
 * the Checkout Session metadata by api/create-checkout-session.ts, so this route can
 * report the conversion accurately even when the browser tags were blocked.
 */

interface StripeCheckoutSession {
  id: string;
  customer?: string;
  customer_details?: {email?: string | null;};
  amount_total?: number;
  currency?: string;
  metadata?: Record<string, string>;
}

export async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // TODO: verify the Stripe signature before trusting this payload.
  const event = (await request.json().catch(() => null)) as
  {type?: string;data?: {object?: StripeCheckoutSession;};} |
  null;

  if (event?.type === 'checkout.session.completed' && event.data?.object) {
    const session = event.data.object;
    // TODO: mark the Supabase account as Maker plan and store session.customer.
    await forwardToMetaConversionsApi(session);
    await forwardToGoogleEnhancedConversions(session);
  }

  return json({ received: true }, 200);
}

/**
 * PLACEHOLDER: Meta Conversions API.
 *
 * POST https://graph.facebook.com/v19.0/{PIXEL_ID}/events
 *   access_token: META_CAPI_ACCESS_TOKEN
 *   data: [{
 *     event_name: 'Purchase',
 *     event_time: unix seconds,
 *     event_id: session.id,            // Same id as the browser event, so Meta dedupes.
 *     action_source: 'website',
 *     custom_data: { value, currency: 'GBP' },
 *     user_data: {
 *       em: [sha256(lowercased email)], // Advanced matching.
 *       fbc: metadata.fbclid ? `fb.1.${timestamp}.${metadata.fbclid}` : undefined,
 *       fbp: metadata.fbp,
 *       client_ip_address, client_user_agent,
 *     },
 *   }]
 */
async function forwardToMetaConversionsApi(session: StripeCheckoutSession): Promise<void> {
  void session;
  // TODO: implement once META_PIXEL_ID and META_CAPI_ACCESS_TOKEN are set.
}

/**
 * PLACEHOLDER: Google Ads Enhanced Conversions for leads or the Click Conversions API.
 *
 * POST https://googleads.googleapis.com/v17/customers/{CUSTOMER_ID}:uploadClickConversions
 *   conversions: [{
 *     gclid: metadata.gclid,           // Or gbraid / wbraid when gclid is absent.
 *     conversionAction: 'customers/{CUSTOMER_ID}/conversionActions/{ACTION_ID}',
 *     conversionDateTime: '2026-01-01 12:00:00+00:00',
 *     conversionValue: value, currencyCode: 'GBP',
 *     userIdentifiers: [{ hashedEmail: sha256(lowercased email) }],
 *   }]
 */
async function forwardToGoogleEnhancedConversions(session: StripeCheckoutSession): Promise<void> {
  void session;
  // TODO: implement once GOOGLE_ADS_CUSTOMER_ID, developer token and OAuth refresh
  // token are set.
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export default handler;