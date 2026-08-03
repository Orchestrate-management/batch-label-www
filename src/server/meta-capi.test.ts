// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildPurchasePayload,
  createConversionForwarder,
  minorToMajor,
  readMetaConfig,
  resolveFbc,
  sendToMeta,
  sha256Hex,
  type MetaCapiConfig,
  type PurchaseSignal } from
'./meta-capi';

const config: MetaCapiConfig = {
  pixelId: '1374342861305621',
  accessToken: 'SECRET_TOKEN_VALUE',
  siteUrl: 'https://www.batchlabel.xyz'
};

const USER_ID = '11111111-1111-4111-8111-111111111111';

/** 2026-01-01T00:00:00Z in seconds, and 2025-12-01T00:00:00Z as the first touch. */
const EVENT_TIME = 1767225600;
const FIRST_SEEN_ISO = '2025-12-01T00:00:00.000Z';
const FIRST_SEEN_MS = 1764547200000;

function signal(overrides: Partial<PurchaseSignal> = {}): PurchaseSignal {
  return {
    checkoutSessionId: 'cs_test_a1b2c3',
    supabaseUserId: USER_ID,
    eventTimeUnix: EVENT_TIME,
    amountSubtotalMinor: 1400,
    taxMinor: 280,
    plan: 'maker',
    currency: 'gbp',
    fbclid: null,
    firstSeenAt: null,
    fbp: null,
    fbc: null,
    ...overrides
  };
}

/** A transport that records what it was asked to send and answers 200. */
function recordingTransport(ok = true, status = 200, body = '{"events_received":1}') {
  const calls: {url: string;init: RequestInit;}[] = [];
  const transport = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(body, { status: ok ? status : status });
  };
  return { transport, calls, sentBody: () => JSON.parse(String(calls[0]?.init.body ?? '{}')) };
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * THE SERVER CONSENT GATE.
 *
 * These are the tests that matter most in this file. The failure they guard against is not
 * a crash or a wrong number — it is personal data reaching an advertising platform for
 * somebody who declined, which is invisible from inside the system and cannot be undone.
 * Every path that is not an explicit, successfully-read "yes" must send nothing.
 */
describe('meta-capi: the consent gate fails closed', () => {
  it('sends nothing when advertising_opt_in is false', async () => {
    const { transport, calls } = recordingTransport();
    const forwarder = createConversionForwarder({
      config,
      lookupConsent: async () => ({ optedIn: false, email: 'maker@example.com' }),
      transport
    });

    expect(await forwarder.forwardPurchase(signal())).toBe('consent_declined');
    expect(calls).toHaveLength(0);
  });

  it('sends nothing when the lookup THROWS — an unreachable database is not a yes', async () => {
    const { transport, calls } = recordingTransport();
    const forwarder = createConversionForwarder({
      config,
      lookupConsent: async () => {
        throw new Error('supabase unreachable');
      },
      transport
    });

    expect(await forwarder.forwardPurchase(signal())).toBe('consent_lookup_failed');
    expect(calls).toHaveLength(0);
  });

  it('sends nothing when there is no membership row to read a permission from', async () => {
    // findAdvertisingConsent returns { optedIn: false } for a missing row. No record of a
    // permission means no permission — the same rule docs/CONSENT.md sets for the app.
    const { transport, calls } = recordingTransport();
    const forwarder = createConversionForwarder({
      config,
      lookupConsent: async () => ({ optedIn: false, email: null }),
      transport
    });

    expect(await forwarder.forwardPurchase(signal())).toBe('consent_declined');
    expect(calls).toHaveLength(0);
  });

  it('sends nothing when the session carried no supabase user id: nobody to ask about', async () => {
    const { transport, calls } = recordingTransport();
    const lookup = vi.fn();
    const forwarder = createConversionForwarder({
      config,
      lookupConsent: lookup,
      transport
    });

    expect(await forwarder.forwardPurchase(signal({ supabaseUserId: null }))).toBe('no_user_id');
    expect(calls).toHaveLength(0);
    // Not even asked. There is no key to ask with.
    expect(lookup).not.toHaveBeenCalled();
  });

  it('checks consent BEFORE anything is built or sent, not after', async () => {
    const order: string[] = [];
    const forwarder = createConversionForwarder({
      config,
      lookupConsent: async () => {
        order.push('consent');
        return { optedIn: true, email: 'maker@example.com' };
      },
      transport: async () => {
        order.push('send');
        return new Response('{}', { status: 200 });
      }
    });

    await forwarder.forwardPurchase(signal());
    expect(order).toEqual(['consent', 'send']);
  });

  it('sends nothing when Meta is not configured, which is the preview case', async () => {
    // META_CAPI_ACCESS_TOKEN is Production-only on purpose. A preview deploy forwarding
    // real Purchases would put fictional sales into Events Manager permanently.
    const { transport, calls } = recordingTransport();
    const lookup = vi.fn();
    const forwarder = createConversionForwarder({ config: null, lookupConsent: lookup, transport });

    expect(await forwarder.forwardPurchase(signal())).toBe('not_configured');
    expect(calls).toHaveLength(0);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('DOES send once consent is granted — the gate is a gate, not a wall', async () => {
    const { transport, calls } = recordingTransport();
    const forwarder = createConversionForwarder({
      config,
      lookupConsent: async () => ({ optedIn: true, email: 'maker@example.com' }),
      transport
    });

    expect(await forwarder.forwardPurchase(signal())).toBe('sent');
    expect(calls).toHaveLength(1);
  });

  it('never lets a Meta failure escape: measurement must not break billing', async () => {
    const forwarder = createConversionForwarder({
      config,
      lookupConsent: async () => ({ optedIn: true, email: 'maker@example.com' }),
      transport: async () => {
        throw new Error('network down');
      }
    });
    // Resolves rather than rejecting. The webhook that calls this grants paid plans.
    await expect(forwarder.forwardPurchase(signal())).resolves.toBe('send_failed');
  });

  it('reports a non-2xx from Meta as a failure rather than a success', async () => {
    const forwarder = createConversionForwarder({
      config,
      lookupConsent: async () => ({ optedIn: true, email: 'maker@example.com' }),
      transport: async () => new Response('{"error":{"message":"Invalid token"}}', { status: 400 })
    });
    expect(await forwarder.forwardPurchase(signal())).toBe('send_failed');
  });
});

describe('meta-capi: the fbc identifier', () => {
  it('rebuilds fb.1.<unix_ms>.<fbclid> from the stored fbclid', async () => {
    const { fbc, source } = resolveFbc(
      signal({ fbclid: 'IwAR0abcDEF', firstSeenAt: FIRST_SEEN_ISO })
    );
    expect(fbc).toBe(`fb.1.${FIRST_SEEN_MS}.IwAR0abcDEF`);
    expect(source).toBe('first_touch');
  });

  /**
   * The question the brief asks: first-touch time or conversion time?
   *
   * FIRST TOUCH. The Pixel writes `_fbc` at the moment the ad click lands, so the timestamp
   * inside a real cookie is the click time. Substituting the conversion time would produce a
   * different string for the same click than the browser holds — and Meta matches on the
   * whole string, so the two halves would look like two different clicks.
   */
  it('uses the FIRST TOUCH time, not the conversion time', () => {
    const { fbc } = resolveFbc(signal({ fbclid: 'abc', firstSeenAt: FIRST_SEEN_ISO }));
    expect(fbc).toContain(String(FIRST_SEEN_MS));
    expect(fbc).not.toContain(String(EVENT_TIME * 1000));
    // A month apart in this fixture: the difference is not academic.
    expect(EVENT_TIME * 1000 - FIRST_SEEN_MS).toBeGreaterThan(24 * 60 * 60 * 1000);
  });

  it('falls back to the conversion time when first_seen_at is missing, and says so', () => {
    const { fbc, source } = resolveFbc(signal({ fbclid: 'abc', firstSeenAt: null }));
    expect(fbc).toBe(`fb.1.${EVENT_TIME * 1000}.abc`);
    expect(source).toBe('event_time');
  });

  it('falls back the same way when first_seen_at is unparseable', () => {
    const { source } = resolveFbc(signal({ fbclid: 'abc', firstSeenAt: 'nonsense' }));
    expect(source).toBe('event_time');
  });

  it('prefers the REAL _fbc cookie over any reconstruction', () => {
    // Byte-identical to what the browser holds beats even a correct rebuild.
    const real = 'fb.1.1700000000000.IwAR0real';
    const { fbc, source } = resolveFbc(
      signal({ fbc: real, fbclid: 'different', firstSeenAt: FIRST_SEEN_ISO })
    );
    expect(fbc).toBe(real);
    expect(source).toBe('cookie');
  });

  it('sends no fbc at all when there was never an fbclid', () => {
    const { fbc, source } = resolveFbc(signal({ fbclid: null, fbc: null }));
    expect(fbc).toBeNull();
    expect(source).toBe('none');
  });

  it('omits fbc from user_data entirely rather than sending an empty one', () => {
    const payload = buildPurchasePayload({
      signal: signal(),
      emailSha256: null,
      externalIdSha256: null,
      config
    });
    expect(payload.data[0].user_data).not.toHaveProperty('fbc');
  });
});

describe('meta-capi: the Purchase payload', () => {
  const built = (overrides: Partial<PurchaseSignal> = {}) =>
  buildPurchasePayload({
    signal: signal(overrides),
    emailSha256: 'a'.repeat(64),
    externalIdSha256: 'b'.repeat(64),
    config
  });

  it('is a Purchase in GBP with the EX-VAT amount converted out of minor units', () => {
    const event = built().data[0];
    expect(event.event_name).toBe('Purchase');
    // The subtotal, not the total. With tax-exclusive prices the total varies by the
    // customer's country, and reporting that would make one tier worth different amounts by
    // geography.
    expect(event.custom_data).toMatchObject({ currency: 'GBP', value: 14 });
  });

  it('converts the annual price correctly too', () => {
    expect(built({ amountSubtotalMinor: 14000 }).data[0].custom_data.value).toBe(140);
  });

  it('reports the tier that was bought, so a rail test is filterable out of ROAS', () => {
    expect(built().data[0].custom_data.content_ids).toEqual(['maker']);
    expect(built({ plan: 'consultant' }).data[0].custom_data.content_ids).toEqual(['consultant']);
    expect(built({ plan: 'rail_test' }).data[0].custom_data.content_ids).toEqual(['rail_test']);
  });

  it('uppercases whatever currency Stripe reported rather than assuming', () => {
    expect(built({ currency: 'eur' }).data[0].custom_data.currency).toBe('EUR');
    expect(built({ currency: null }).data[0].custom_data.currency).toBe('GBP');
  });

  it('uses the Stripe Checkout Session id as the event_id', () => {
    expect(built().data[0].event_id).toBe('cs_test_a1b2c3');
  });

  it('uses the Stripe event time in SECONDS, not "now"', () => {
    const event = built().data[0];
    expect(event.event_time).toBe(EVENT_TIME);
    // Ten digits: seconds. Thirteen would be milliseconds and Meta would reject it as
    // being tens of thousands of years in the future.
    expect(String(event.event_time)).toHaveLength(10);
  });

  it('marks the conversion as a website action with a source URL', () => {
    const event = built().data[0];
    expect(event.action_source).toBe('website');
    expect(event.event_source_url).toBe('https://www.batchlabel.xyz/checkout/success');
  });

  /**
   * The brief asks for client_ip_address and client_user_agent "if they can be obtained
   * honestly at that point". They cannot: this runs from a Stripe webhook, so the only IP
   * and User-Agent available belong to Stripe's servers. Sending those would tell Meta the
   * buyer's device was a datacentre, which pollutes matching rather than improving it.
   */
  it('sends NO client_ip_address or client_user_agent, because only Stripe s are available', () => {
    const userData = built().data[0].user_data as Record<string, unknown>;
    expect(userData).not.toHaveProperty('client_ip_address');
    expect(userData).not.toHaveProperty('client_user_agent');
  });

  it('sends the email and external id only as hashes', () => {
    const userData = built().data[0].user_data;
    expect(userData.em).toEqual(['a'.repeat(64)]);
    expect(userData.external_id).toEqual(['b'.repeat(64)]);
  });

  it('omits user_data fields it does not have, rather than sending empty arrays', () => {
    const payload = buildPurchasePayload({
      signal: signal(),
      emailSha256: null,
      externalIdSha256: null,
      config
    });
    expect(payload.data[0].user_data).toEqual({});
  });

  it('carries the _fbp cookie when checkout captured one', () => {
    const fbp = 'fb.1.1767225600000.1234567890';
    expect(built({ fbp }).data[0].user_data.fbp).toBe(fbp);
  });

  it('adds test_event_code only when one is configured', () => {
    expect(built()).not.toHaveProperty('test_event_code');
    const withCode = buildPurchasePayload({
      signal: signal(),
      emailSha256: null,
      externalIdSha256: null,
      config: { ...config, testEventCode: 'TEST12345' }
    });
    expect(withCode.test_event_code).toBe('TEST12345');
  });

  it('never puts a raw email address anywhere in the payload', () => {
    expect(JSON.stringify(built())).not.toContain('@');
  });
});

describe('meta-capi: the request itself', () => {
  it('POSTs to the pinned Graph version and the configured dataset', async () => {
    const { transport, calls } = recordingTransport();
    await sendToMeta({ data: [] }, config, transport);
    expect(calls[0].url).toBe('https://graph.facebook.com/v21.0/1374342861305621/events');
    expect(calls[0].init.method).toBe('POST');
  });

  it('puts the access token in the BODY, never in the URL', async () => {
    const { transport, calls, sentBody } = recordingTransport();
    await sendToMeta({ data: [] }, config, transport);
    // A token in a query string lands in proxy logs, Vercel request logs and any error
    // message that echoes the URL.
    expect(calls[0].url).not.toContain('SECRET_TOKEN_VALUE');
    expect(calls[0].url).not.toContain('access_token');
    expect(sentBody().access_token).toBe('SECRET_TOKEN_VALUE');
  });
});

describe('meta-capi: configuration', () => {
  const siteUrl = 'https://www.batchlabel.xyz';

  it('needs both a pixel id and a token', () => {
    expect(readMetaConfig({}, siteUrl)).toBeNull();
    expect(readMetaConfig({ META_PIXEL_ID: '123' }, siteUrl)).toBeNull();
    expect(readMetaConfig({ META_CAPI_ACCESS_TOKEN: 'tok' }, siteUrl)).toBeNull();
  });

  it('is null when the token is absent — the preview case, and deliberate', () => {
    expect(readMetaConfig({ VITE_META_PIXEL_ID: '1374342861305621' }, siteUrl)).toBeNull();
  });

  it('accepts the pixel id under either name, since VITE_META_PIXEL_ID is already set', () => {
    const fromVite = readMetaConfig(
      { VITE_META_PIXEL_ID: '1374342861305621', META_CAPI_ACCESS_TOKEN: 'tok' },
      siteUrl
    );
    expect(fromVite?.pixelId).toBe('1374342861305621');
  });

  it('treats whitespace-only values as absent', () => {
    expect(readMetaConfig({ META_PIXEL_ID: '   ', META_CAPI_ACCESS_TOKEN: 'tok' }, siteUrl)).toBeNull();
    expect(readMetaConfig({ META_PIXEL_ID: '123', META_CAPI_ACCESS_TOKEN: '  ' }, siteUrl)).toBeNull();
  });
});

describe('meta-capi: helpers', () => {
  it('hashes exactly as the browser does: trimmed, lowercased, lowercase hex', async () => {
    // Same known digest asserted in src/lib/analytics.test.ts, so the two halves cannot
    // drift into producing different hashes for the same person.
    expect(await sha256Hex('  TEST  ')).toBe(
      '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
    );
  });

  it('returns null for an empty value rather than hashing the empty string', async () => {
    expect(await sha256Hex('')).toBeNull();
    expect(await sha256Hex('   ')).toBeNull();
  });

  it('converts minor units to major', () => {
    expect(minorToMajor(1400)).toBe(14);
    expect(minorToMajor(14000)).toBe(140);
    expect(minorToMajor(999)).toBe(9.99);
    expect(minorToMajor(0)).toBe(0);
  });
});

/**
 * SECRET CONTAINMENT, enforced rather than remembered.
 *
 * `META_CAPI_ACCESS_TOKEN` can write events into the dataset. A `VITE_` prefix would inline
 * it into the browser bundle of a public marketing site, and an import from `src/lib` or a
 * page would drag this module into that bundle. Both are one careless edit away, and
 * neither shows up as a failing behaviour — only as a token in a JavaScript file that
 * anybody can read.
 */
describe('meta-capi: the access token cannot reach the browser', () => {
  const root = process.cwd();

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full, out);
      } else if (/\.tsx?$/.test(entry)) {
        out.push(full);
      }
    }
    return out;
  }

  /** Test files are excluded: this one names the forbidden strings in order to forbid them. */
  const sourceFiles = () =>
  walk(join(root, 'src')).
  concat(walk(join(root, 'api'))).
  filter((file) => !/\.test\.tsx?$/.test(file));

  it('is never VITE_ prefixed anywhere in the tree', () => {
    const offenders = sourceFiles().
    filter((file) => /VITE_META_CAPI|VITE_[A-Z_]*ACCESS_TOKEN/.test(readFileSync(file, 'utf8'))).
    map((f) => f.slice(root.length));
    expect(offenders).toEqual([]);
  });

  it('is read in exactly one file, and that file is this module', () => {
    const readers = sourceFiles().
    filter((file) => readFileSync(file, 'utf8').includes('META_CAPI_ACCESS_TOKEN'));
    expect(readers.map((f) => f.slice(root.length))).toEqual(['/src/server/meta-capi.ts']);
  });

  it('is not imported by anything under src/lib, src/pages or src/components', () => {
    const browserDirs = ['lib', 'pages', 'components'].map((d) => join(root, 'src', d));
    const importers = browserDirs.
    flatMap((dir) => walk(dir)).
    filter((file) => !/\.test\.tsx?$/.test(file)).
    filter((file) => /from\s+['"].*meta-capi['"]/.test(readFileSync(file, 'utf8')));
    expect(importers).toEqual([]);
  });

  it('does not import anything from src/lib that could pull in a browser global', () => {
    // The one permitted import is the isomorphic dedup contract, which has its own
    // purity test in src/lib/meta-events.test.ts.
    const source = readFileSync(join(root, 'src/server/meta-capi.ts'), 'utf8');
    // The `.js` is stripped rather than matched, because this assertion is about WHICH
    // module is imported, not how the specifier is spelled. Everything reachable from api/
    // carries an explicit .js extension so Node ESM can resolve it at runtime (see
    // esm-imports.test.ts); pinning the extension here would make this guard fail for a
    // reason that has nothing to do with browser globals — which is exactly what happened.
    const libImports = Array.
    from(source.matchAll(/from\s+['"]\.\.\/lib\/([^'"]+)['"]/g)).
    map((m) => m[1].replace(/\.js$/, ''));
    expect(libImports).toEqual(['meta-events']);
  });
});
