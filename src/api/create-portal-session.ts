/**
 * POST /api/create-portal-session
 *
 * Opens the Stripe Customer Portal so a maker can change card, download invoices, or
 * cancel without emailing us.
 *
 * TODO before going live:
 *   1. Set STRIPE_SECRET_KEY in the server environment.
 *   2. Look up the Stripe customer id for the signed in Supabase user. The lookup below
 *      is a stub: store stripe_customer_id on your profiles table when the checkout
 *      webhook fires, then read it here using the service role key.
 *   3. Configure the portal branding and the cancellation flow in the Stripe dashboard.
 */

declare const process: {env: Record<string, string | undefined>;};

interface PortalRequestBody {
  user_id?: string | null;
}

const SITE_URL = process.env.SITE_URL ?? 'https://batchlabel.co.uk';

async function findStripeCustomerId(userId: string): Promise<string | null> {
  // TODO: replace with a real lookup, for example:
  //   const { data } = await supabaseAdmin
  //     .from('profiles')
  //     .select('stripe_customer_id')
  //     .eq('id', userId)
  //     .single()
  //   return data?.stripe_customer_id ?? null
  void userId;
  return null;
}

export async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return json({ error: 'Stripe is not configured yet.' }, 500);

  const body = (await request.json().catch(() => null)) as PortalRequestBody | null;
  if (!body?.user_id) return json({ error: 'Missing user id.' }, 400);

  const customerId = await findStripeCustomerId(body.user_id);
  if (!customerId) {
    return json({ error: 'We could not find a billing record for this account yet.' }, 404);
  }

  const params = new URLSearchParams();
  params.set('customer', customerId);
  params.set('return_url', `${SITE_URL}/dashboard/account`);

  const stripeResponse = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  const session = (await stripeResponse.json()) as {url?: string;error?: {message?: string;};};
  if (!stripeResponse.ok || !session.url) {
    return json({ error: session.error?.message ?? 'Could not open the billing portal.' }, 502);
  }

  return json({ url: session.url }, 200);
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export default handler;