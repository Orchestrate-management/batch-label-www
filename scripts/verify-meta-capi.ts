/**
 * Local verification harness for the Meta Conversions API path.
 *
 * WHY THIS EXISTS RATHER THAN "we tested it once"
 *
 * The two things most likely to be wrong about a server-side conversion are invisible from
 * inside the system: a consent gate that quietly stopped gating, and a payload Meta accepts
 * but mis-attributes. Neither shows up as an error. This script puts the REAL
 * `handleStripeWebhook` and the REAL `createConversionForwarder` behind an HTTP server so
 * `stripe listen --forward-to` delivers genuinely signed events into exactly the code path
 * Vercel runs, and prints the exact bytes that would reach Meta.
 *
 * It is deliberately not a test file: it needs a live Stripe CLI session and, for the Test
 * Events half, a real access token. See docs/META_CAPI_SETUP.md for the full procedure.
 *
 * WHAT IS REAL AND WHAT IS SUBSTITUTED. Everything in `src/` is real: signature
 * verification, event interpretation, the consent gate, `fbc` reconstruction, payload
 * construction and the HTTP call. Two dependencies are injected, because their credentials
 * are not available outside production:
 *
 *   - the entitlement store, which returns HARNESS_OUTCOME so that "forward only on
 *     applied" can be exercised without a database;
 *   - the consent lookup, which returns HARNESS_CONSENT so the gate can be proven in all
 *     three directions (granted, declined, lookup throws) on demand rather than by waiting
 *     for a real user to have each state.
 *
 * Substituting them proves MORE than using the real ones would, because the failing paths
 * are the ones that matter and a real database will not produce an outage to order.
 *
 *   HARNESS_PORT      default 4242
 *   HARNESS_OUTCOME   applied | duplicate | stale | ...   default applied
 *   HARNESS_CONSENT   granted | declined | error          default granted
 *   META_PIXEL_ID / META_CAPI_ACCESS_TOKEN / META_TEST_EVENT_CODE
 *                     When the token is set the call is REAL and goes to Meta. Always set
 *                     META_TEST_EVENT_CODE when it is, or the events land in the live
 *                     dataset and cannot be removed.
 *
 * Run:  npx vite-node scripts/verify-meta-capi.ts
 */

import { createServer } from 'node:http';
import Stripe from 'stripe';
import { buildPriceMap } from '../src/server/entitlements';
import {
  createConversionForwarder,
  readMetaConfig,
  type MetaTransport } from
'../src/server/meta-capi';
import { handleStripeWebhook, type ApplyOutcome } from '../src/server/webhook';

const PORT = Number(process.env.HARNESS_PORT ?? 4242);
const OUTCOME = (process.env.HARNESS_OUTCOME ?? 'applied') as ApplyOutcome;
const CONSENT = process.env.HARNESS_CONSENT ?? 'granted';
const SITE_URL = process.env.SITE_URL ?? 'https://www.batchlabel.xyz';

// A dummy key is fine: only `stripe.webhooks` is used, and signature verification is local
// crypto against the secret `stripe listen` prints.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_dummy_key_for_signature_only');
const metaConfig = readMetaConfig(process.env, SITE_URL);

function describe(body: Record<string, unknown>) {
  const { access_token: token, ...rest } = body;
  return { token: token ? `<present, ${String(token).length} chars>` : '<absent>', rest };
}

/** Prints what would be sent, without sending. */
const capturingTransport: MetaTransport = async (url, init) => {
  const { token, rest } = describe(JSON.parse(String(init.body)));
  console.log('\n--- WOULD POST TO META (dry run, nothing sent) ---');
  console.log('URL:', url);
  console.log('access_token:', token);
  console.log(JSON.stringify(rest, null, 2));
  console.log('--- end ---\n');
  return new Response(JSON.stringify({ events_received: 1, harness: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
};

/** The real call. Prints the payload and Meta's own reply. */
const realTransport: MetaTransport = async (url, init) => {
  const { rest } = describe(JSON.parse(String(init.body)));
  console.log('\n--- POSTING TO META ---');
  console.log('URL:', url);
  console.log(JSON.stringify(rest, null, 2));
  const response = await fetch(url, init);
  console.log('META REPLIED', response.status, await response.clone().text());
  console.log('--- end ---\n');
  return response;
};

/**
 * `HARNESS_DRY_RUN=1` builds and prints the payload without sending it.
 *
 * Worth having even once a token is available: it is the only way to read exactly what
 * would leave the system for a given Stripe event without putting anything into Events
 * Manager, and an event sent to Meta cannot be taken back.
 */
const DRY_RUN = process.env.HARNESS_DRY_RUN === '1';

const conversions = createConversionForwarder({
  config: metaConfig,
  lookupConsent: async (userId: string) => {
    console.log(`[harness] advertising_opt_in lookup for ${userId} -> ${CONSENT}`);
    if (CONSENT === 'error') throw new Error('simulated Supabase outage');
    if (CONSENT === 'declined') return { optedIn: false, email: null };
    return { optedIn: true, email: process.env.HARNESS_EMAIL ?? 'maker@example.com' };
  },
  transport: metaConfig && !DRY_RUN ? realTransport : capturingTransport
});

const server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks);

  // The raw bytes, untouched. Re-serialising would break the signature — the whole point
  // of the note at the top of src/server/webhook.ts.
  const request = new Request(`http://localhost:${PORT}${req.url ?? '/'}`, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: req.method === 'POST' ? raw : undefined
  });

  const response = await handleStripeWebhook(request, {
    stripe,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    store: {
      apply: async (intent) => {
        console.log(`[harness] store.apply(${intent.eventType}) -> ${OUTCOME}`);
        return OUTCOME;
      }
    },
    config: {
      brand: process.env.VITE_ORCHESTRATE_BRAND ?? 'batchlabel',
      prices: buildPriceMap({
        STRIPE_PRICE_MAKER_MONTHLY: process.env.STRIPE_PRICE_MAKER_MONTHLY ?? 'price_maker_monthly',
        STRIPE_PRICE_MAKER_ANNUAL: process.env.STRIPE_PRICE_MAKER_ANNUAL ?? 'price_maker_annual'
      })
    },
    conversions
  });

  const text = await response.text();
  console.log(`[harness] responded ${response.status} ${text}`);
  res.writeHead(response.status, { 'content-type': 'application/json' });
  res.end(text);
});

server.listen(PORT, () => {
  console.log(`[harness] listening on http://localhost:${PORT}/api/stripe-webhook`);
  console.log(`[harness] store outcome    = ${OUTCOME}`);
  console.log(`[harness] consent lookup   = ${CONSENT}`);
  console.log(`[harness] webhook secret   = ${process.env.STRIPE_WEBHOOK_SECRET ? 'set' : 'MISSING (every event will 500, deliberately)'}`);
  console.log(`[harness] meta configured  = ${Boolean(metaConfig)}${DRY_RUN ? ' (DRY RUN — nothing will be sent)' : ''}`);
  if (metaConfig && !DRY_RUN) {
    console.log(`[harness] test_event_code  = ${metaConfig.testEventCode ?? 'NONE — events will go to the LIVE dataset'}`);
  }
});
