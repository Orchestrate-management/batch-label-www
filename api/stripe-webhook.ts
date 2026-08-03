/**
 * POST /api/stripe-webhook
 *
 * Vercel deploys every file in this ROOT /api directory as a function. The previous copies
 * of these routes lived in src/api/, which Vercel never looks at — so /api/stripe-webhook
 * did not exist and Stripe's deliveries were answered by the single-page app's index.html.
 *
 * Deliberately thin: all of the logic, and every test, lives in src/server/webhook.ts.
 * The one thing that has to be right *here* is the runtime and the body.
 *
 * RUNTIME: the Web handler signature (`export default { fetch }`), which is Vercel's
 * documented shape for /api functions. It matters for more than style — the alternative
 * (req, res) Node signature comes with Vercel's `request.body` helper, which parses the
 * payload and destroys the exact bytes Stripe signed. With a `Request`, `request.text()`
 * returns the raw body and signature verification is possible at all.
 *
 * No CORS here on purpose. Stripe calls this server-to-server; no browser origin should be
 * able to read the response.
 */

import { createAdminClient, createConversionForwarder, createEntitlementStore, findAdvertisingConsent, handleStripeWebhook, json, readMetaConfig, readServerConfig } from './_server.js';
import Stripe from 'stripe';

export default {
  async fetch(request: Request): Promise<Response> {
    const config = readServerConfig(process.env);

    if (!config.stripeSecretKey || !config.supabaseUrl || !config.serviceRoleKey) {
      console.error('[stripe-webhook] missing STRIPE_SECRET_KEY, SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return json({ error: 'Billing is not configured.' }, 500);
    }

    const stripe = new Stripe(config.stripeSecretKey);
    const admin = createAdminClient(config.supabaseUrl, config.serviceRoleKey);

    // Meta Conversions API. `readMetaConfig` returns null unless BOTH the pixel id and the
    // secret access token are present, and the token is set in Production only — so on
    // preview and development this is a forwarder that reads the consent flag for nobody
    // and sends nothing. That is deliberate; see docs/META_CAPI_SETUP.md.
    const conversions = createConversionForwarder({
      config: readMetaConfig(process.env, config.siteUrl),
      lookupConsent: (userId) => findAdvertisingConsent(admin, userId, config.brand)
    });

    return handleStripeWebhook(request, {
      stripe,
      webhookSecret: config.stripeWebhookSecret,
      store: createEntitlementStore(admin),
      config: { brand: config.brand, priceIndex: config.priceIndex },
      conversions
    });
  }
};
