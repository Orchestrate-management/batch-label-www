/**
 * The Meta Pixel, loaded only for someone who has actually said yes.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: the Pixel script is not fetched, `fbq` does not
 * exist, and no Meta cookie is written, until marketing consent is granted. It is not
 * loaded-then-suppressed. Loading `fbevents.js` and hoping a consent flag holds it back is
 * a different promise from the one the cookie banner makes — the request itself reaches
 * Meta with the visitor's IP and referring URL, before any flag is consulted, and
 * `connect.facebook.net` in the network tab is not something you can explain to somebody
 * who pressed "Reject optional".
 *
 * There is no tag manager (see src/TRACKING.md), so this is loaded from
 * `src/lib/consent.ts` immediately after the Consent Mode v2 defaults are pushed, in the
 * same place and for the same reason GA4 is. Consent Mode is Google's mechanism and Meta
 * does not read it; the gate here is our own, which is exactly why it has to be explicit.
 *
 * CONSENT CAN CHANGE AFTER LOAD, IN BOTH DIRECTIONS, and both are handled:
 *
 *  - GRANTED LATER (the common case: the banner is answered on the first page). The script
 *    is injected at that moment and a single `PageView` is sent for the page they are on,
 *    which is the view their consent now covers. They start being measured from the
 *    decision, not retroactively.
 *
 *  - WITHDRAWN LATER. Three things happen, because one is not enough. (1) Our own gate
 *    closes, so nothing in this file emits again — that is absolute and does not depend on
 *    Meta honouring anything. (2) `fbq('consent', 'revoke')` is called, which is Meta's own
 *    documented switch and is what stops the parts of the Pixel we do not drive: automatic
 *    event detection, button-click autologging, microdata scraping. (3) The `_fbp` and
 *    `_fbc` cookies are deleted, because they are advertising identifiers written under a
 *    permission that has just been taken away and leaving them would let the next grant
 *    silently resume the same identity.
 *
 *    What cannot be done, stated plainly rather than implied: JavaScript that has already
 *    executed cannot be un-executed. The script element is removed and the Pixel is revoked,
 *    but the library remains in memory until the next navigation. That is why the primary
 *    gate is "never load without consent" rather than "load and revoke".
 */

import {
  randomEventId,
  type MetaEventName } from
'./meta-events';

const env = (import.meta as unknown as {env?: Record<string, string>;}).env;

/**
 * The Pixel id. Public by design — it ships inside the page and anyone can read it out of
 * the network tab — which is why it is `VITE_` prefixed and why that is safe. The CAPI
 * access token is the opposite and lives in `src/server/meta-capi.ts`; the two must never
 * be confused. See docs/META_CAPI_SETUP.md.
 *
 * Absent by default. With no id configured every function in this file is a no-op, so the
 * site runs unchanged until the founder sets it.
 */
export const META_PIXEL_ID: string = (env?.VITE_META_PIXEL_ID ?? '').trim();

/**
 * Loads the Pixel on localhost too, for verifying in Meta's Test Events tool without
 * deploying. Off unless the value is exactly "true", so it cannot be left on by accident.
 */
export const META_PIXEL_DEBUG: boolean = (env?.VITE_META_PIXEL_DEBUG ?? '').trim() === 'true';

/**
 * Configuration for initMetaPixel.
 *
 * Both fields default to the environment values above, which is what the application uses.
 * They are parameters rather than constants because `import.meta.env` is substituted at
 * BUILD time — a test cannot vary it, and a consent gate whose two branches cannot both be
 * exercised is a consent gate nobody has checked. Making the module configurable is the
 * honest fix; mocking the module under test would only assert that the mock works.
 */
export interface MetaPixelOptions {
  pixelId?: string;
  allowLocalhost?: boolean;
}

const PIXEL_SRC = 'https://connect.facebook.net/en_US/fbevents.js';
const SCRIPT_ATTRIBUTE = 'data-bl-meta-pixel';

/** Meta's own identifiers, written by fbevents.js on the registrable domain. */
const META_COOKIES = ['_fbp', '_fbc'] as const;

type FbqCommand = (...args: unknown[]) => void;

interface FbqFunction extends FbqCommand {
  callMethod?: FbqCommand;
  queue?: unknown[];
  push?: unknown;
  loaded?: boolean;
  version?: string;
}

declare global {
  interface Window {
    fbq?: FbqFunction;
    _fbq?: FbqFunction;
  }
}

/**
 * Module state, deliberately not derived from `window.fbq`.
 *
 * `granted` is the gate every send checks. It starts false and only the two entry points
 * below can open it, so a missing call fails towards sending nothing.
 */
let granted = false;
let loaded = false;
let pixelId = META_PIXEL_ID;
let allowLocalhost = META_PIXEL_DEBUG;

/** The current hostname, or '' where there is not one. Never throws. */
function hostname(): string {
  if (typeof window === 'undefined') return '';
  const h = window.location?.hostname;
  return typeof h === 'string' ? h : '';
}

/** Same rule as GA4: development must not report into the live dataset. */
function isMeasurableHost(): boolean {
  if (typeof window === 'undefined') return false;
  if (allowLocalhost) return true;
  const h = hostname();
  // No hostname at all is not a host we can prove is safe to measure from.
  if (!h) return false;
  return h !== 'localhost' && h !== '127.0.0.1' && h !== '::1' && !h.endsWith('.local');
}

/** Meta's bootstrap snippet, written out so it can be read. */
function installFbqStub() {
  if (window.fbq) return;
  const fbq = function (...args: unknown[]) {
    // Once fbevents.js has loaded it replaces `callMethod`, and every call goes straight
    // through. Until then the arguments sit on `queue` and the library replays them.
    if (fbq.callMethod) {
      fbq.callMethod(...args);
    } else {
      fbq.queue?.push(args);
    }
  } as FbqFunction;
  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = '2.0';
  // fbevents.js reads `push` off the function and expects it to be the function itself.
  fbq.push = fbq;
  window.fbq = fbq;
  if (!window._fbq) window._fbq = fbq;
}

function injectScript() {
  if (document.querySelector(`script[${SCRIPT_ATTRIBUTE}]`)) return;
  const script = document.createElement('script');
  script.async = true;
  script.src = PIXEL_SRC;
  script.setAttribute(SCRIPT_ATTRIBUTE, 'true');
  document.head.appendChild(script);
}

function removeScript() {
  document.querySelectorAll(`script[${SCRIPT_ATTRIBUTE}]`).forEach((node) => node.remove());
}

/**
 * Expires Meta's cookies.
 *
 * Written on both the current host and the registrable domain, because fbevents.js sets
 * them with an explicit `domain` of the registrable domain (`.batchlabel.xyz`) while a
 * host-only copy can exist from a different path. A `Set-Cookie` that does not match the
 * original's domain does not delete it, so both are attempted rather than guessed at.
 */
function clearMetaCookies() {
  if (typeof document === 'undefined') return;

  // A cookie is only deleted by a Set-Cookie whose domain MATCHES the one it was written
  // with. fbevents.js writes against the registrable domain, and working out which suffix
  // that is needs a public suffix list (`batchlabel.xyz` is registrable, `co.uk` is not).
  // Rather than ship one, every parent domain down to two labels is attempted: the browser
  // silently ignores the ones it is not allowed to set, so the only cost is a few no-ops
  // and the one that matches always lands. `undefined` covers a host-only cookie.
  const host = hostname();
  const domains: (string | undefined)[] = [undefined];
  if (host) {
    domains.push(host);
    const parts = host.split('.');
    for (let i = 1; parts.length - i >= 2; i++) {
      domains.push(`.${parts.slice(i).join('.')}`);
    }
  }

  META_COOKIES.forEach((name) => {
    domains.forEach((domain) => {
      const scope = domain ? `; domain=${domain}` : '';
      document.cookie = `${name}=; path=/; max-age=0${scope}`;
    });
  });
}

/** Can we send anything at all right now? */
function ready(): boolean {
  return granted && loaded && typeof window !== 'undefined' && typeof window.fbq === 'function';
}

function load() {
  if (loaded || !pixelId || typeof window === 'undefined') return;
  if (!isMeasurableHost()) return;
  installFbqStub();
  injectScript();
  // `init` without advanced matching. There is no email to attach on a cold page load, and
  // sending an empty user-data object is not the same as sending none. Advanced matching is
  // added by setMetaUserData() at the one moment we legitimately have an address.
  window.fbq?.('init', pixelId);
  loaded = true;
}

/**
 * Called once from `initTagging()`, with the stored banner decision.
 *
 * Takes the decision as an argument rather than reading it, so this module never imports
 * `./consent` — that module already imports this one, and a cycle between the file that
 * owns the consent decision and the file that obeys it is not a place to be clever.
 */
export function initMetaPixel(marketingGranted: boolean, options: MetaPixelOptions = {}) {
  if (options.pixelId !== undefined) pixelId = options.pixelId.trim();
  if (options.allowLocalhost !== undefined) allowLocalhost = options.allowLocalhost;
  granted = Boolean(marketingGranted);
  if (!granted) return;
  load();
}

/**
 * Called from `saveConsent()` every time the banner is answered.
 *
 * Idempotent: answering "accept" twice loads once and sends one extra PageView only on the
 * transition, because `loaded` is already true the second time.
 */
export function setMetaConsent(marketingGranted: boolean) {
  const next = Boolean(marketingGranted);
  if (next === granted) return;
  granted = next;

  if (granted) {
    const wasLoaded = loaded;
    load();
    // They have just consented while looking at a page whose own PageView was suppressed.
    // Send that one view, so measurement starts at the decision rather than at the next
    // navigation. Only on the transition — never on a re-affirmation.
    if (!wasLoaded && ready()) trackMeta('PageView');
    return;
  }

  // Withdrawn. Our gate is already closed by `granted = false` above; the rest stops the
  // parts of the Pixel we do not drive and removes what it stored.
  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    window.fbq('consent', 'revoke');
  }
  removeScript();
  clearMetaCookies();
  loaded = false;
}

/**
 * Attaches advanced matching, and only ever a hashed value.
 *
 * `emailSha256` is the SHA-256 of the trimmed, lowercased address that `lib/analytics.ts`
 * already computes — and, since the leak fix in that file, only computes when advertising
 * consent is granted. A raw email address must never be passed here: Meta's Pixel will hash
 * an unhashed value client-side, but that means the plaintext was in the page, in the
 * dataLayer and in memory first, which is the thing we are avoiding.
 *
 * Re-calling `init` with the same id is Meta's documented way to add user data to an
 * already-initialised Pixel; it merges rather than creating a second Pixel.
 */
export function setMetaUserData(emailSha256: string | null | undefined) {
  if (!ready() || !emailSha256) return;
  window.fbq?.('init', pixelId, { em: emailSha256 });
}

/**
 * The single send path. Every Meta event in this codebase goes through here.
 *
 * `eventID` is passed in Meta's options argument (the fourth), which is what the
 * deduplication contract in `./meta-events.ts` is for. When a caller has no stable id, a
 * random one is generated: an event with no `eventID` at all cannot be deduplicated by a
 * later server event, and silently omitting it is how a future Purchase or signup event
 * ends up counted twice.
 */
function trackMeta(
name: MetaEventName,
params: Record<string, unknown> = {},
eventId?: string | null)
{
  if (!ready()) return;
  window.fbq?.('track', name, params, { eventID: eventId || randomEventId() });
}

/** Every route change. Mapped from `trackPageView()`. */
export function metaPageView() {
  trackMeta('PageView');
}

/**
 * Pricing page viewed. Mapped from `trackViewPricing()`.
 *
 * Carries no `value`. A pricing page view is not worth £14, and putting a value on it
 * would flow into Meta's ROAS reporting as if it were revenue.
 */
export function metaViewContent(path: string) {
  trackMeta('ViewContent', {
    content_name: 'Pricing',
    content_category: 'pricing',
    content_type: 'product',
    content_ids: ['maker'],
    page_path: path
  });
}

/**
 * Checkout started. Mapped from `trackBeginCheckout()`, which fires when the plan CTA is
 * pressed — the same moment GA4 records `begin_checkout`.
 *
 * Deliberately NOT mapped to `trackPurchaseRedirect()`, which fires a moment later once
 * Stripe has returned a session. Meta defines InitiateCheckout as entering the checkout
 * flow, and keeping it on the same trigger as GA4's begin_checkout means the two platforms
 * cannot quietly disagree about how many people started.
 */
export function metaInitiateCheckout(interval: 'monthly' | 'annual', value: number) {
  trackMeta('InitiateCheckout', {
    value,
    currency: 'GBP',
    content_type: 'product',
    content_ids: ['maker'],
    contents: [{ id: `maker_${interval}`, quantity: 1, item_price: value }],
    num_items: 1
  });
}

/**
 * Account created. Mapped from `trackSignUpCompleted()`.
 *
 * `eventId` comes from `registrationEventId()` so that a server-side signup event, if one
 * is ever added, collapses into this one instead of doubling it.
 */
export function metaCompleteRegistration(
method: string,
emailSha256: string | null | undefined,
eventId: string | null)
{
  if (!ready()) return;
  setMetaUserData(emailSha256);
  trackMeta(
    'CompleteRegistration',
    { content_name: 'signup', registration_method: method, status: true },
    eventId
  );
}

/** Test seam. Exported so a test can assert the gate rather than infer it. */
export function metaPixelState(): {granted: boolean;loaded: boolean;} {
  return { granted, loaded };
}

/** Test seam. Resets module state between tests; never called by application code. */
export function resetMetaPixelForTests() {
  granted = false;
  loaded = false;
  pixelId = META_PIXEL_ID;
  allowLocalhost = META_PIXEL_DEBUG;
}
