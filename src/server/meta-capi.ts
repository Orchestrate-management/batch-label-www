/**
 * Meta Conversions API — the server half of Batchlabel's Meta measurement.
 *
 * SECRET CONTAINMENT. `META_CAPI_ACCESS_TOKEN` is a system-user token that can write
 * events into the dataset and, depending on how it was minted, read from it. It is read
 * from `process.env` here and NOWHERE ELSE. It has no `VITE_` prefix, because a `VITE_`
 * variable is inlined into the browser bundle at build time — the token would then be
 * sitting in the JavaScript of a public marketing site. Nothing under `src/lib`, nothing
 * under `src/pages` and nothing in a component may import this module. There is a test
 * (`meta-capi.test.ts`) that greps the tree to enforce that, because "we remembered" is
 * not a control.
 *
 * WHAT IS SENT FROM HERE, AND WHY IT IS ONLY THIS
 *
 * One event: `Purchase`, on `checkout.session.completed`, once the entitlement store has
 * confirmed the event was `applied`. Nothing else. There is deliberately no browser-side
 * purchase event (src/TRACKING.md), because payment success is only known server-side and a
 * browser event inflates on refunds, failed cards and redirect drop-off. The outcome check
 * matters as much as the event type: forwarding on `duplicate` or `stale` would report a
 * Stripe retry as a second sale.
 *
 * THE CONSENT GATE IS INSIDE forwardPurchase(), NOT AT ITS CALL SITE.
 *
 * `src/server/webhook.ts` carries a note written before this file existed, saying that
 * neither Meta's nor Google's server-side call may run for a user whose
 * `brand_memberships.advertising_opt_in` is false, and that the gate must fail CLOSED when
 * the lookup fails. Putting the check in the caller would mean every future caller has to
 * remember it. It is therefore the first thing this function does, and there is no
 * parameter, flag or override that skips it.
 *
 * Fail-closed means all four of these send nothing:
 *   * the flag is false;
 *   * there is no membership row to read the flag from;
 *   * the lookup throws (network, RLS, bad key, Supabase outage);
 *   * the Checkout Session carried no Supabase user id, so there is nobody to ask about.
 *
 * A failure to prove consent is not consent. The event is dropped and the reason logged,
 * which under-reports conversions. That is the correct direction to be wrong in: an
 * unreported sale costs us attribution, an unconsented send costs somebody their privacy
 * and is the thing the whole consent model exists to prevent.
 */

import {
  buildFbc,
  isoToUnixMs,
  purchaseEventId } from
'../lib/meta-events';

/**
 * Graph API version. Pinned rather than floating: Meta deprecates versions on a schedule,
 * and an unpinned call changes behaviour underneath us without a deploy.
 */
export const META_GRAPH_VERSION = 'v21.0';
export const META_GRAPH_HOST = 'https://graph.facebook.com';

export interface MetaCapiConfig {
  /** The dataset (Pixel) id. Same value as VITE_META_PIXEL_ID — public. */
  pixelId: string;
  /** SECRET. Never VITE_ prefixed, never logged, never returned in a response body. */
  accessToken: string;
  /**
   * Routes events to the Test Events tab instead of the live dataset. Set only while
   * verifying; an accidental value left in production makes real conversions invisible to
   * optimisation, because test events are not counted.
   */
  testEventCode?: string;
  /** Canonical site origin, used to derive event_source_url. */
  siteUrl: string;
  graphVersion?: string;
}

/** Reads the server-only Meta configuration. Returns null when it is not set up. */
export function readMetaConfig(env: Record<string, string | undefined>, siteUrl: string): MetaCapiConfig | null {
  const pixelId = (env.META_PIXEL_ID ?? env.VITE_META_PIXEL_ID ?? '').trim();
  const accessToken = (env.META_CAPI_ACCESS_TOKEN ?? '').trim();
  if (!pixelId || !accessToken) return null;
  return {
    pixelId,
    accessToken,
    testEventCode: (env.META_TEST_EVENT_CODE ?? '').trim() || undefined,
    siteUrl,
    graphVersion: (env.META_GRAPH_VERSION ?? '').trim() || META_GRAPH_VERSION
  };
}

/** The facts a completed checkout gives us, already extracted from the Stripe event. */
export interface PurchaseSignal {
  checkoutSessionId: string;
  /** From the Checkout Session metadata we wrote ourselves. Null means no consent to check. */
  supabaseUserId: string | null;
  /** Stripe's event.created, unix SECONDS. The time the purchase happened. */
  eventTimeUnix: number;
  /** Minor units, as Stripe reports them. 1400 = £14.00. */
  amountTotalMinor: number | null;
  currency: string | null;
  /** First-touch click id, carried through Checkout metadata. */
  fbclid: string | null;
  /** First-touch capture time, ISO. The correct timestamp for a reconstructed fbc. */
  firstSeenAt: string | null;
  /** Meta's own `_fbp` cookie, captured at checkout time. */
  fbp: string | null;
  /** Meta's own `_fbc` cookie, captured at checkout time. Preferred over reconstruction. */
  fbc: string | null;
}

/** What the consent lookup has to answer. Injected so it can be tested without Supabase. */
export interface AdvertisingConsent {
  optedIn: boolean;
  /**
   * The account's VERIFIED auth email, not the address typed into Stripe Checkout.
   *
   * These are not always the same person. The consent we just checked belongs to the
   * Supabase user in the session metadata; sending the email somebody typed on the payment
   * page would mean matching a possibly-different individual against a permission they
   * never gave. `profiles.email` is no good either — it is user-writable, so it could be
   * pointed at a victim. Only the auth identity is authoritative here.
   */
  email: string | null;
}

export type ConsentLookup = (userId: string) => Promise<AdvertisingConsent>;

/** Why nothing was sent. Logged, and returned so the webhook tests can assert on it. */
export type ForwardOutcome =
'sent' |
'not_configured' |
'no_user_id' |
'consent_declined' |
'consent_lookup_failed' |
'not_paid' |
'send_failed';

export interface MetaUserData {
  em?: string[];
  external_id?: string[];
  fbc?: string;
  fbp?: string;
}

export interface MetaServerEvent {
  event_name: 'Purchase';
  event_time: number;
  event_id: string;
  action_source: 'website';
  event_source_url?: string;
  user_data: MetaUserData;
  custom_data: Record<string, unknown>;
}

export interface MetaCapiPayload {
  data: MetaServerEvent[];
  test_event_code?: string;
}

/** SHA-256 hex, matching what the browser computes. Meta requires lowercase hex. */
export async function sha256Hex(value: string): Promise<string | null> {
  const normalised = value.trim().toLowerCase();
  if (!normalised) return null;
  const bytes = new TextEncoder().encode(normalised);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).
  map((byte) => byte.toString(16).padStart(2, '0')).
  join('');
}

/**
 * Stripe's minor units to the decimal amount Meta wants. 1400 -> 14.
 *
 * Assumes a two-decimal currency, which is true of everything Batchlabel sells (GBP only)
 * and of every currency it plausibly would. A zero-decimal currency such as JPY would need
 * an exponent table; this is called out here rather than silently mis-reporting the day
 * somebody adds one.
 */
export function minorToMajor(minor: number): number {
  return Math.round(minor) / 100;
}

/**
 * `fbc`, preferring the real cookie over a reconstruction.
 *
 * The `_fbc` cookie, when we captured one at checkout, is the exact string the Pixel wrote
 * in that browser. Sending it means the browser's identifier and the server's identifier
 * are byte-identical, which is the strongest possible match. Reconstruction is the fallback
 * for the case this whole design exists for: the browser was blocked, or consent was given
 * only after the click, so no cookie was ever written — but `fbclid` was captured off the
 * URL at first touch and carried through Stripe metadata.
 *
 * The reconstruction timestamp is `first_seen_at`, the moment the fbclid was OBSERVED, not
 * the moment of the conversion. See buildFbc() in src/lib/meta-events.ts for why using the
 * conversion time would produce an fbc that disagrees with the browser's.
 *
 * When `first_seen_at` is missing or unparseable — an older stored record, or a corrupted
 * one — the event time is used instead and the caller logs that it happened. Meta permits
 * reconstructing with the time the identifier was observed, and an fbc carrying the right
 * fbclid with an approximate timestamp attributes far better than no fbc at all. It is a
 * documented degradation, not a silent one.
 */
export function resolveFbc(signal: PurchaseSignal): {fbc: string | null;source: 'cookie' | 'first_touch' | 'event_time' | 'none';} {
  if (signal.fbc) return { fbc: signal.fbc, source: 'cookie' };
  if (!signal.fbclid) return { fbc: null, source: 'none' };

  const firstTouchMs = isoToUnixMs(signal.firstSeenAt);
  if (firstTouchMs !== null) {
    const built = buildFbc(signal.fbclid, firstTouchMs);
    if (built) return { fbc: built, source: 'first_touch' };
  }

  const built = buildFbc(signal.fbclid, signal.eventTimeUnix * 1000);
  return built ? { fbc: built, source: 'event_time' } : { fbc: null, source: 'none' };
}

export interface BuildPurchaseInput {
  signal: PurchaseSignal;
  emailSha256: string | null;
  externalIdSha256: string | null;
  config: MetaCapiConfig;
}

/**
 * The exact body POSTed to Meta. Pure, so the shape is testable without a network or a
 * token, and so a review can read what leaves this system in one function.
 *
 * NOT INCLUDED, AND THIS IS DELIBERATE: `client_ip_address` and `client_user_agent`.
 *
 * At webhook time the only IP and User-Agent available are Stripe's — the request comes
 * from Stripe's servers, so `request.headers.get('user-agent')` is
 * "Stripe/1.0 (+https://stripe.com/docs/webhooks)" and the remote address is a Stripe
 * datacentre. Sending those would tell Meta the buyer's device was a Stripe server, which
 * is not a small inaccuracy: those two fields are matching signals, and feeding them a
 * datacentre IP pollutes the audience and the attribution rather than improving it. They
 * are omitted rather than approximated.
 *
 * They could in principle be captured honestly in /api/create-checkout-session, which IS
 * called by the buyer's browser, and carried through Stripe metadata. That is not done: an
 * end user's IP address is personal data, and Stripe's own guidance is that metadata is not
 * the place for it — it is readable by anyone with dashboard access and is retained on
 * their side indefinitely. The match is carried instead by `fbc`, `fbp`, hashed email and
 * hashed external_id, which are the high-signal identifiers anyway.
 *
 * `action_source: 'website'` because the conversion is a web checkout; the fact that we are
 * the ones reporting it does not make it a phone call or a physical store.
 *
 * `event_source_url` is DERIVED, not observed: it is the success page the buyer is returned
 * to, which is the only URL on our own domain that specifically represents a completed
 * purchase. Meta asks for a URL when action_source is `website`, and the alternative to
 * deriving one is omitting it and losing the signal.
 */
export function buildPurchasePayload(input: BuildPurchaseInput): MetaCapiPayload {
  const { signal, emailSha256, externalIdSha256, config } = input;
  const { fbc } = resolveFbc(signal);

  const user_data: MetaUserData = {};
  if (emailSha256) user_data.em = [emailSha256];
  if (externalIdSha256) user_data.external_id = [externalIdSha256];
  if (fbc) user_data.fbc = fbc;
  if (signal.fbp) user_data.fbp = signal.fbp;

  const custom_data: Record<string, unknown> = {
    // Batchlabel sells in GBP only. The Stripe value is used rather than a constant so a
    // second currency would be reported correctly instead of mislabelled as pounds.
    currency: (signal.currency ?? 'GBP').toUpperCase(),
    value: signal.amountTotalMinor === null ? 0 : minorToMajor(signal.amountTotalMinor),
    content_type: 'product',
    content_ids: ['maker'],
    num_items: 1
  };

  const event: MetaServerEvent = {
    event_name: 'Purchase',
    // Unix SECONDS, and Stripe's event.created rather than "now" — the time the purchase
    // happened, not the time our function got round to reporting it. Meta rejects events
    // older than seven days, so a delayed retry still lands with the correct time.
    event_time: signal.eventTimeUnix,
    // THE DEDUPLICATION KEY. The Stripe Checkout Session id, per src/lib/meta-events.ts.
    event_id: purchaseEventId(signal.checkoutSessionId),
    action_source: 'website',
    event_source_url: `${config.siteUrl}/checkout/success`,
    user_data,
    custom_data
  };

  const payload: MetaCapiPayload = { data: [event] };
  if (config.testEventCode) payload.test_event_code = config.testEventCode;
  return payload;
}

export interface SendResult {
  ok: boolean;
  status: number;
  /** Meta's response body, for logs. Never returned to a browser. */
  body: string;
}

export type MetaTransport = (url: string, init: RequestInit) => Promise<Response>;

/**
 * POSTs the payload to the Graph API.
 *
 * The access token goes in the BODY, not the query string. A token in a URL ends up in
 * proxy logs, in Vercel's request logs and in any error message that echoes the URL back;
 * in the body it stays in the request payload, which nothing logs by default.
 */
export async function sendToMeta(
payload: MetaCapiPayload,
config: MetaCapiConfig,
transport: MetaTransport = fetch)
: Promise<SendResult> {
  const version = config.graphVersion ?? META_GRAPH_VERSION;
  const url = `${META_GRAPH_HOST}/${version}/${config.pixelId}/events`;
  const response = await transport(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, access_token: config.accessToken })
  });
  const body = await response.text().catch(() => '');
  return { ok: response.ok, status: response.status, body };
}

export interface ConversionForwarder {
  forwardPurchase: (signal: PurchaseSignal) => Promise<ForwardOutcome>;
}

export interface ForwarderDeps {
  config: MetaCapiConfig | null;
  lookupConsent: ConsentLookup;
  transport?: MetaTransport;
}

/**
 * The forwarder the webhook calls.
 *
 * Returns an outcome rather than throwing. A Meta failure must never turn into a non-2xx
 * from the Stripe webhook: Stripe would retry the event, and while the entitlement RPC is
 * idempotent, a retry that got as far as `applied` a second time is not what we want to be
 * relying on to keep ad numbers honest. Measurement is downstream of billing and must never
 * be able to break it.
 */
export function createConversionForwarder(deps: ForwarderDeps): ConversionForwarder {
  return {
    async forwardPurchase(signal: PurchaseSignal): Promise<ForwardOutcome> {
      const { config } = deps;
      if (!config) {
        // NOT A BUG, AND NOT A FALLBACK. META_CAPI_ACCESS_TOKEN is set in Production only,
        // on purpose: a preview deployment forwarding real Purchase events would put
        // fictional sales into Events Manager and into ad optimisation, and there is no way
        // to take them back out. So "no token" means "do not send", full stop — there is
        // deliberately no alternative path, no queue, no retry and no degraded mode.
        //
        // Anyone reading this log on a preview deploy and reaching for the "missing"
        // variable: it is missing because it is meant to be. See docs/META_CAPI_SETUP.md.
        console.info(
          '[meta-capi] not configured (META_PIXEL_ID and/or META_CAPI_ACCESS_TOKEN absent). ' +
          'Purchase NOT forwarded. Expected on preview and development — the token is Production-only by design.'
        );
        return 'not_configured';
      }

      // ---- CONSENT GATE. Nothing above this line touches Meta. ----------------------
      //
      // No user id means no membership row, which means no recorded permission. That is
      // not "probably fine because they bought something": consent to advertising is a
      // separate decision from consent to be sold to.
      if (!signal.supabaseUserId) {
        console.warn('[meta-capi] skipped Purchase: no supabase_user_id on the Checkout Session');
        return 'no_user_id';
      }

      let consent: AdvertisingConsent;
      try {
        consent = await deps.lookupConsent(signal.supabaseUserId);
      } catch (error) {
        // FAIL CLOSED. An unreachable database is not a yes.
        console.error('[meta-capi] skipped Purchase: advertising_opt_in lookup failed', {
          message: error instanceof Error ? error.message : String(error)
        });
        return 'consent_lookup_failed';
      }

      if (!consent.optedIn) {
        return 'consent_declined';
      }
      // ---- END CONSENT GATE ---------------------------------------------------------

      const [emailSha256, externalIdSha256] = await Promise.all([
      consent.email ? sha256Hex(consent.email) : Promise.resolve(null),
      sha256Hex(signal.supabaseUserId)]
      );

      const payload = buildPurchasePayload({ signal, emailSha256, externalIdSha256, config });

      const { source } = resolveFbc(signal);
      if (source === 'event_time') {
        console.warn('[meta-capi] fbc rebuilt with the conversion time: no first_seen_at on the session metadata', {
          session: signal.checkoutSessionId
        });
      }

      try {
        const result = await sendToMeta(payload, config, deps.transport);
        if (!result.ok) {
          console.error('[meta-capi] Meta rejected the Purchase event', {
            session: signal.checkoutSessionId,
            status: result.status,
            body: result.body.slice(0, 500)
          });
          return 'send_failed';
        }
        console.info('[meta-capi] Purchase forwarded', {
          session: signal.checkoutSessionId,
          event_id: payload.data[0].event_id,
          fbc_source: source,
          fbp: signal.fbp ? 'present' : 'absent',
          test: config.testEventCode ? config.testEventCode : 'live'
        });
        return 'sent';
      } catch (error) {
        console.error('[meta-capi] Purchase forwarding threw', {
          session: signal.checkoutSessionId,
          message: error instanceof Error ? error.message : String(error)
        });
        return 'send_failed';
      }
    }
  };
}
