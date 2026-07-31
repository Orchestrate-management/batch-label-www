import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * The browser half of the consent gate.
 *
 * The promise the cookie banner makes is not "Meta will be asked to ignore you". It is
 * "nothing loads until you say yes". So the assertions below are mostly about ABSENCE:
 * no script element, no `window.fbq`, no request to connect.facebook.net, no event. An
 * assertion that we called a suppression API would prove the weaker promise.
 *
 * The module is imported dynamically per test so its module-level gate state starts fresh,
 * and the pixel id is supplied through initMetaPixel's options rather than the environment,
 * because `import.meta.env` is substituted at build time and cannot be varied from a test.
 */

const PIXEL_ID = '1374342861305621';

type PixelModule = typeof import('./meta-pixel');

/**
 * A fresh copy of the module with a known configuration.
 *
 * `import.meta.env` is substituted at BUILD time, so a test cannot vary it — which is why
 * initMetaPixel takes the pixel id and the localhost override as optional parameters that
 * default to the environment. This helper is what makes both branches of the gate
 * exercisable rather than merely asserted.
 */
async function loadModule(): Promise<PixelModule> {
  vi.resetModules();
  const mod = await import('./meta-pixel');
  mod.resetMetaPixelForTests();
  return mod;
}

/** initMetaPixel with the test pixel id already applied. */
function init(pixel: PixelModule, granted: boolean, options: {pixelId?: string;allowLocalhost?: boolean;} = {}) {
  pixel.initMetaPixel(granted, { pixelId: PIXEL_ID, allowLocalhost: false, ...options });
}

/** Every script element this module injected. The primary evidence. */
function pixelScripts(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll<HTMLScriptElement>('script[data-bl-meta-pixel]'));
}

/** The arguments of every fbq call, so a test can assert what was and was not sent. */
function fbqCalls(): unknown[][] {
  const fbq = window.fbq as unknown as {mock?: {calls: unknown[][];};} | undefined;
  return fbq?.mock?.calls ?? [];
}

/** Stands in for fbevents.js having loaded and taken over the stub. */
function pretendScriptLoaded() {
  const spy = vi.fn();
  window.fbq = spy as unknown as typeof window.fbq;
}

beforeEach(() => {
  document.head.innerHTML = '';
  delete window.fbq;
  delete window._fbq;
  document.cookie = '_fbp=; path=/; max-age=0';
  document.cookie = '_fbc=; path=/; max-age=0';
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('meta-pixel: consent DENIED', () => {
  it('injects no script, so connect.facebook.net is never requested', async () => {
    const pixel = await loadModule();
    init(pixel, false);
    expect(pixelScripts()).toHaveLength(0);
  });

  it('does not even create window.fbq', async () => {
    const pixel = await loadModule();
    init(pixel, false);
    // The stub is what queues events for the real library. Not creating it means there is
    // nowhere for a stray fbq() call elsewhere in the app to be buffered and later replayed.
    expect(window.fbq).toBeUndefined();
    expect(window._fbq).toBeUndefined();
  });

  it('reports itself as neither granted nor loaded', async () => {
    const pixel = await loadModule();
    init(pixel, false);
    expect(pixel.metaPixelState()).toEqual({ granted: false, loaded: false });
  });

  it('sends NOTHING when the tracking helpers are called anyway', async () => {
    const pixel = await loadModule();
    init(pixel, false);
    // A component calling these without checking consent first must be harmless. This is
    // the case that would otherwise leak, because the call sites are all over the app.
    pixel.metaPageView();
    pixel.metaViewContent('/pricing');
    pixel.metaInitiateCheckout('monthly', 14);
    pixel.metaCompleteRegistration('password', 'a'.repeat(64), 'signup.x');
    pixel.setMetaUserData('a'.repeat(64));

    expect(window.fbq).toBeUndefined();
    expect(pixelScripts()).toHaveLength(0);
  });

  it('sends nothing even if something else on the page has defined fbq', async () => {
    // A third-party script, or a stale fbq from a previous page in the same document.
    // Our gate is module state, not the presence of fbq, precisely so this cannot leak.
    pretendScriptLoaded();
    const pixel = await loadModule();
    init(pixel, false);
    pixel.metaPageView();
    pixel.metaInitiateCheckout('annual', 140);
    expect(fbqCalls()).toHaveLength(0);
  });

  it('defaults to denied when initMetaPixel is never called at all', async () => {
    const pixel = await loadModule();
    pretendScriptLoaded();
    pixel.metaPageView();
    expect(fbqCalls()).toHaveLength(0);
    expect(pixel.metaPixelState().granted).toBe(false);
  });
});

describe('meta-pixel: consent GRANTED', () => {
  it('injects exactly one script, pointing at fbevents.js', async () => {
    const pixel = await loadModule();
    init(pixel, true);
    const scripts = pixelScripts();
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe('https://connect.facebook.net/en_US/fbevents.js');
    expect(scripts[0].async).toBe(true);
  });

  it('initialises with the configured pixel id and no advanced matching yet', async () => {
    const pixel = await loadModule();
    init(pixel, true);
    const queued = (window.fbq?.queue ?? []) as unknown[][];
    expect(queued[0]).toEqual(['init', PIXEL_ID]);
    // No second argument: there is no email on a cold page load, and an empty user-data
    // object is not the same as sending none.
    expect(queued[0]).toHaveLength(2);
  });

  it('does NOT fire a PageView on load: the router owns that in a single page app', async () => {
    const pixel = await loadModule();
    init(pixel, true);
    const commands = (window.fbq?.queue ?? []) as unknown[][];
    expect(commands.filter((c) => c[0] === 'track')).toHaveLength(0);
  });

  it('loads only once, however many times init is called', async () => {
    const pixel = await loadModule();
    init(pixel, true);
    init(pixel, true);
    expect(pixelScripts()).toHaveLength(1);
  });

  it('sends each mapped event with the right Meta standard name', async () => {
    const pixel = await loadModule();
    init(pixel, true);
    pretendScriptLoaded();

    pixel.metaPageView();
    pixel.metaViewContent('/pricing');
    pixel.metaInitiateCheckout('annual', 140);

    const names = fbqCalls().filter((c) => c[0] === 'track').map((c) => c[1]);
    expect(names).toEqual(['PageView', 'ViewContent', 'InitiateCheckout']);
  });

  it('puts value and currency on InitiateCheckout, and none on ViewContent', async () => {
    const pixel = await loadModule();
    init(pixel, true);
    pretendScriptLoaded();

    pixel.metaInitiateCheckout('annual', 140);
    pixel.metaViewContent('/pricing');
    const calls = fbqCalls().filter((c) => c[0] === 'track');

    expect(calls[0][2]).toMatchObject({ value: 140, currency: 'GBP', content_ids: ['maker'] });
    // A pricing page view is not worth £14; a value here would flow into Meta's ROAS
    // reporting as though it were revenue.
    expect(calls[1][2]).not.toHaveProperty('value');
  });

  it('attaches an eventID to every event, so a server twin can dedupe', async () => {
    const pixel = await loadModule();
    init(pixel, true);
    pretendScriptLoaded();

    pixel.metaPageView();
    pixel.metaInitiateCheckout('monthly', 14);

    fbqCalls().filter((c) => c[0] === 'track').forEach((call) => {
      expect(call[3]).toMatchObject({ eventID: expect.any(String) });
      expect((call[3] as {eventID: string;}).eventID).not.toBe('');
    });
  });

  it('uses the supplied event id for CompleteRegistration rather than a random one', async () => {
    const pixel = await loadModule();
    init(pixel, true);
    pretendScriptLoaded();

    pixel.metaCompleteRegistration('password', 'b'.repeat(64), 'signup.deadbeef');
    const track = fbqCalls().find((c) => c[1] === 'CompleteRegistration');
    expect(track![3]).toEqual({ eventID: 'signup.deadbeef' });
  });

  it('sends advanced matching as a hash, never a raw address', async () => {
    const pixel = await loadModule();
    init(pixel, true);
    pretendScriptLoaded();

    const hash = 'c'.repeat(64);
    pixel.metaCompleteRegistration('password', hash, 'signup.x');

    const matching = fbqCalls().find((c) => c[0] === 'init' && c[2] !== undefined);
    expect(matching![2]).toEqual({ em: hash });
    // Nothing resembling an email address anywhere in what was sent.
    expect(JSON.stringify(fbqCalls())).not.toContain('@');
  });
});

describe('meta-pixel: changing your mind', () => {
  it('starts tracking somebody who accepts AFTER the first page load', async () => {
    const pixel = await loadModule();
    init(pixel, false);
    expect(pixelScripts()).toHaveLength(0);

    pixel.setMetaConsent(true);

    expect(pixelScripts()).toHaveLength(1);
    expect(pixel.metaPixelState()).toEqual({ granted: true, loaded: true });
  });

  it('sends one PageView on that transition, for the page they consented on', async () => {
    const pixel = await loadModule();
    init(pixel, false);
    pixel.setMetaConsent(true);
    const tracks = ((window.fbq?.queue ?? []) as unknown[][]).filter((c) => c[0] === 'track');
    expect(tracks).toHaveLength(1);
    expect(tracks[0][1]).toBe('PageView');
  });

  it('does not send a second PageView when the same choice is re-saved', async () => {
    const pixel = await loadModule();
    init(pixel, true);
    pretendScriptLoaded();
    pixel.setMetaConsent(true);
    expect(fbqCalls().filter((c) => c[0] === 'track')).toHaveLength(0);
  });

  it('stops sending the moment consent is withdrawn', async () => {
    const pixel = await loadModule();
    init(pixel, true);
    pretendScriptLoaded();

    pixel.setMetaConsent(false);
    const afterRevoke = fbqCalls().length;

    pixel.metaPageView();
    pixel.metaViewContent('/pricing');
    pixel.metaInitiateCheckout('monthly', 14);
    pixel.metaCompleteRegistration('password', 'd'.repeat(64), 'signup.x');

    // Not one further call. Our own gate closed; nothing depends on Meta honouring revoke.
    expect(fbqCalls()).toHaveLength(afterRevoke);
  });

  it('also tells Meta to revoke, which stops the parts of the Pixel we do not drive', async () => {
    const pixel = await loadModule();
    init(pixel, true);
    pretendScriptLoaded();
    pixel.setMetaConsent(false);
    // Automatic event detection and button-click autologging are inside fbevents.js and
    // are not routed through our helpers, so closing our own gate is not sufficient.
    expect(fbqCalls()).toContainEqual(['consent', 'revoke']);
  });

  it('removes the script element on withdrawal', async () => {
    const pixel = await loadModule();
    init(pixel, true);
    expect(pixelScripts()).toHaveLength(1);
    pixel.setMetaConsent(false);
    expect(pixelScripts()).toHaveLength(0);
  });

  it('deletes the _fbp and _fbc cookies, so a later grant cannot resume the same identity', async () => {
    document.cookie = '_fbp=fb.1.1767225600000.1234567890; path=/';
    document.cookie = '_fbc=fb.1.1767225600000.IwAR0abc; path=/';
    expect(document.cookie).toContain('_fbp=');

    const pixel = await loadModule();
    init(pixel, true);
    pretendScriptLoaded();
    pixel.setMetaConsent(false);

    expect(document.cookie).not.toContain('_fbp=fb.1');
    expect(document.cookie).not.toContain('_fbc=fb.1');
  });

  it('survives a withdraw -> re-grant cycle without duplicating the script', async () => {
    const pixel = await loadModule();
    init(pixel, true);
    pretendScriptLoaded();
    pixel.setMetaConsent(false);
    pixel.setMetaConsent(true);
    expect(pixelScripts()).toHaveLength(1);
    expect(pixel.metaPixelState()).toEqual({ granted: true, loaded: true });
  });
});

describe('meta-pixel: configuration', () => {
  it('is inert with no pixel id, so the site runs before Meta is set up', async () => {
    const pixel = await loadModule();
    init(pixel, true, { pixelId: '' });
    expect(pixelScripts()).toHaveLength(0);
    expect(window.fbq).toBeUndefined();
  });

  it('does not load on localhost, so development stays out of the live dataset', async () => {
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { hostname: 'localhost', protocol: 'http:', href: 'http://localhost/' }
    });
    try {
      const pixel = await loadModule();
      init(pixel, true, { allowLocalhost: false });
      expect(pixelScripts()).toHaveLength(0);
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });

  it('loads on localhost when the debug override is on, for Test Events', async () => {
    // VITE_META_PIXEL_DEBUG=true supplies this in the application. It exists so the Pixel
    // can be verified in Meta's Test Events tool without a deploy.
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { hostname: 'localhost', protocol: 'http:', href: 'http://localhost/' }
    });
    try {
      const pixel = await loadModule();
      init(pixel, true, { allowLocalhost: true });
      expect(pixelScripts()).toHaveLength(1);
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });

  it('refuses to measure a host it cannot identify at all', async () => {
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { protocol: 'https:' } });
    try {
      const pixel = await loadModule();
      init(pixel, true);
      expect(pixelScripts()).toHaveLength(0);
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });
});

/**
 * The <noscript> beacon from Meta's copy-paste snippet is deliberately absent, and this
 * test is the thing that stops it being "restored" as a missing piece of the official
 * install.
 *
 * It is a plain <img> that fires on document parse, with no JavaScript involved, so no
 * consent mechanism we have — ours or Meta's — can gate it. Its usual justification is
 * covering visitors with JavaScript disabled, but those visitors cannot operate the cookie
 * banner either, so they can never have consented: it is precisely the population it is
 * least defensible to track, for essentially no data, since the JS pixel already covers
 * everyone capable of answering the banner.
 */
describe('meta-pixel: the noscript beacon is deliberately absent', () => {
  it('ships no facebook.com/tr image anywhere in the built page or the source', () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    expect(html).not.toContain('facebook.com/tr');
    expect(html).not.toContain('connect.facebook.net');
    expect(html).not.toContain('fbq(');
  });
});
