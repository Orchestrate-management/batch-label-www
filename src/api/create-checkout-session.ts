/**
 * POST /api/create-checkout-session
 *
 * Server route stub. Deploy this behind any Node runtime (Vercel, Netlify, Cloudflare
 * with the Node compatibility flag, or a small Express server).
 *
 * TODO before going live:
 *   1. Set STRIPE_SECRET_KEY in the server environment. Never expose it to the browser.
 *   2. Set STRIPE_PRICE_MAKER_MONTHLY and STRIPE_PRICE_MAKER_ANNUAL to the live price ids.
 *   3. npm install stripe and swap the fetch call below for the official SDK if preferred.
 *   4. Confirm Stripe Tax is enabled in the dashboard. Prices are stored VAT inclusive
 *      for consumers, so automatic_tax handles the rest.
 */

declare const process: {env: Record<string, string | undefined>;};

interface Attribution {
  [key: string]: string | null;
}

interface CheckoutRequestBody {
  interval: 'monthly' | 'annual';
  email?: string | null;
  user_id?: string | null;
  attribution?: Attribution;
}

const SITE_URL = process.env.SITE_URL ?? 'https://batchlabel.co.uk';

const PRICE_IDS: Record<CheckoutRequestBody['interval'], string | undefined> = {
  monthly: process.env.STRIPE_PRICE_MAKER_MONTHLY, // TODO: price_...
  annual: process.env.STRIPE_PRICE_MAKER_ANNUAL // TODO: price_...
};

export async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return json({ error: 'Stripe is not configured yet.' }, 500);
  }

  const body = (await request.json().catch(() => null)) as CheckoutRequestBody | null;
  const interval = body?.interval === 'annual' ? 'annual' : 'monthly';
  const priceId = PRICE_IDS[interval];
  if (!priceId) {
    return json({ error: `No Stripe price id configured for the ${interval} plan.` }, 500);
  }

  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('line_items[0][price]', priceId);
  params.set('line_items[0][quantity]', '1');
  params.set('success_url', `${SITE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${SITE_URL}/checkout/cancelled`);
  params.set('allow_promotion_codes', 'true');
  params.set('automatic_tax[enabled]', 'true');
  params.set('customer_creation', 'always');
  params.set('billing_address_collection', 'auto');
  if (body?.email) params.set('customer_email', body.email);

  // Attribution is stored on the subscription metadata. The webhook reads it back to
  // forward a server side conversion with the original click identifiers.
  if (body?.user_id) params.set('metadata[supabase_user_id]', body.user_id);
  Object.entries(body?.attribution ?? {}).forEach(([key, value]) => {
    if (value) params.set(`metadata[${key}]`, String(value).slice(0, 480));
  });

  const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  const session = (await stripeResponse.json()) as {id?: string;url?: string;error?: {message?: string;};};
  if (!stripeResponse.ok || !session.url) {
    return json({ error: session.error?.message ?? 'Could not create a checkout session.' }, 502);
  }

  return json({ id: session.id, url: session.url }, 200);
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export default handler;