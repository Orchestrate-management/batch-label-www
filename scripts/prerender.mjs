/**
 * Prerenders the public marketing pages into static HTML, after `vite build`.
 *
 * WHY THIS EXISTS
 *
 * Before it, every public route served the same 6,413-byte shell containing 54
 * characters of readable text — the <title> — and / and /pricing were byte-identical.
 * Google renders JavaScript so it eventually saw the real pages, but GPTBot, ClaudeBot
 * and PerplexityBot do not, and they are the surfaces this product needs to be quotable
 * on. Ten identical documents is what they were being given.
 *
 * WHY jsdom AND NOT A HEADLESS BROWSER OR A FRAMEWORK
 *
 * jsdom is already a devDependency — it is the environment the existing suite renders
 * this same app in — so this pass adds no dependency, and nothing to download. Puppeteer
 * or Playwright would pull a ~150MB browser on every Vercel deploy for output jsdom
 * already produces correctly, on a build that is long enough. vite-react-ssg would mean
 * restructuring App.tsx's JSX routes into a route-object config and adopting its entry
 * contract, which is a large change to the shape of the app for ten static pages. What is
 * actually needed is narrow: run the real app, let effects run, take the document. That is
 * three dependencies the repo already has — vite, jsdom, react-dom.
 *
 * The one thing jsdom cannot do is execute <script type="module">, so the app is bundled
 * for Node with Vite's SSR build and imported directly. The built module scripts stay in
 * the output untouched, inert during the capture and live in the browser.
 *
 * WHAT IS PROVED HERE RATHER THAN ASSUMED
 *
 * Every check below fails the build. In order: no network egress during the capture,
 * nothing user-shaped in the output, no tag loaded and no consent granted, and no two
 * routes alike. A prerender that silently regressed to emitting the shell would be worse
 * than no prerender, because the deploy would still be green.
 *
 * SERVING
 *
 * Generating the files is the easy half. vercel.json has to serve them — see the comment
 * there, scripts/vercel-routing.mjs and src/lib/vercel-routing.test.ts.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const ROOT = resolve(process.cwd());
const DIST = join(ROOT, 'dist');
const BUNDLE_DIR = join(ROOT, '.prerender');
const BUNDLE_FILE = join(BUNDLE_DIR, 'entry.mjs');

/**
 * The origin the capture runs on.
 *
 * It has to be the real canonical host. `usePageMeta` pins canonicals to SITE_ORIGIN
 * regardless, but the app reads `window.location` in several places, and rendering on
 * localhost would bake a localhost-shaped page into a file on a CDN.
 */
const ORIGIN = 'https://www.batchlabel.xyz';

/** The SPA fallback document. See vercel.json. */
const SHELL_FILE = 'spa-shell.html';

const started = Date.now();
const step = (message) => console.log(`[prerender] ${message}`);

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('[prerender] dist/index.html is missing. Run `vite build` first.');
  process.exit(1);
}

/* ------------------------------------------------------------------ *
 * 1. Bundle the app for Node.
 * ------------------------------------------------------------------ */

const { build } = await import('vite');
await build({
  logLevel: 'warn',
  build: {
    ssr: 'src/prerender/entry.tsx',
    outDir: '.prerender',
    emptyOutDir: true,
    // Nothing here is served, so there is no reason to copy public/ into it.
    copyPublicDir: false,
    // Read by a build script, never shipped. Unminified so a stack trace from a failed
    // capture points at something legible.
    minify: false,
    rollupOptions: { output: { entryFileNames: 'entry.mjs' } }
  }
});
step(`bundled the app for Node in ${((Date.now() - started) / 1000).toFixed(1)}s`);

/**
 * React and react-dom are left external by the SSR build and resolved by Node below, so
 * NODE_ENV decides which of the two builds is loaded — and `act` throws outright in the
 * production one. Vite's build API sets NODE_ENV=production in this process, so it has to
 * be put back before the app is imported.
 *
 * This changes nothing about the output. React's development and production builds emit
 * identical DOM; the development build additionally warns about things worth knowing at
 * build time, which is why this is the one to want here. Everything the app itself reads
 * from `import.meta.env` was already substituted above, in production mode, so the page
 * being captured is the page production serves.
 */
process.env.NODE_ENV = 'development';

/* ------------------------------------------------------------------ *
 * 2. Capture each route.
 * ------------------------------------------------------------------ */

const template = readFileSync(join(DIST, 'index.html'), 'utf8');

/**
 * dist/index.html is both the template every route is rendered into AND where the home
 * page is written, so a second pass over an already-prerendered dist would render the
 * home page into the home page. React clears #root, but the JSON-LD baked into the head
 * by the previous pass would survive and the next page would append its own on top.
 * Refuse rather than quietly emit a page with two FAQPage graphs.
 */
if (new JSDOM(template).window.document.getElementById('root')?.childElementCount) {
  console.error('[prerender] dist/index.html has already been prerendered. Run `vite build` first.');
  process.exit(1);
}

// React's `act` is what flushes effects deterministically; without this it warns on every
// call. Set before the bundle is imported, which is when React reads it.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { PRERENDER_ROUTES } = await import(pathToFileURL(BUNDLE_FILE).href);
if (!Array.isArray(PRERENDER_ROUTES) || PRERENDER_ROUTES.length === 0) {
  throw new Error('[prerender] the app exported no routes to prerender');
}

const networkAttempts = [];
const captures = [];

/** A route that does not settle is a deploy that never finishes. Fail instead. */
const ROUTE_TIMEOUT_MS = 60_000;

for (const [index, route] of PRERENDER_ROUTES.entries()) {
  captures.push(await withTimeout(capture(route, index), route));
}

function withTimeout(work, route) {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`[prerender] ${route} did not settle within ${ROUTE_TIMEOUT_MS / 1000}s`)),
      ROUTE_TIMEOUT_MS
    );
  });
  return Promise.race([work, guard]).finally(() => clearTimeout(timer));
}

/**
 * Renders one route in its own document.
 *
 * A fresh JSDOM per route, and a fresh copy of the app's module graph with it. Several
 * modules do work when they are first evaluated — src/lib/recovery-entry.ts snapshots the
 * URL fragment, src/lib/supabase.ts constructs the client — so a graph carried over from
 * the previous route would be holding a document that no longer exists. The `?route=`
 * suffix is what makes Node re-evaluate it.
 */
async function capture(route, index) {
  const dom = new JSDOM(template, {
    url: `${ORIGIN}${route}`,
    pretendToBeVisual: true,
    // Default: jsdom executes nothing. The built <script type="module"> in the template
    // is inert here and runs only in the browser.
    virtualConsole: quietConsole()
  });

  installGlobals(dom.window);

  const container = dom.window.document.getElementById('root');
  if (!container) throw new Error('[prerender] dist/index.html has no #root to render into');

  const dispose = await renderRoute(container, index);
  const html = dom.serialize();
  dispose();
  dom.window.close();

  return { route, html };
}

async function renderRoute(container, index) {
  const entry = await import(`${pathToFileURL(BUNDLE_FILE).href}?route=${index}`);
  return entry.renderInto(container);
}

/* ------------------------------------------------------------------ *
 * 3. Check what came out, then write it.
 * ------------------------------------------------------------------ */

/**
 * Things that would mean a session, a user or an account leaked into a public file.
 *
 * `hello@batchlabel.xyz` is the published support address and appears on the contact
 * and legal pages on purpose, so the email pattern excludes it rather than excluding
 * emails.
 */
const SESSION_SHAPED = {
  'that looks like a JWT': /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  'that looks like an access token': /"?access_token"?\s*[:=]/i,
  'that looks like a refresh token': /"?refresh_token"?\s*[:=]/i,
  'that looks like a Supabase session key': /\bsb-[a-z0-9]+-auth-token\b/,
  'that looks like a private email address':
    /[A-Za-z0-9._%+-]+@(?!batchlabel\.xyz|example\.com)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  'that looks like a signed-in navigation': /Sign out|Log out|My account|Dashboard<\/a>/
};

/** Measurement that must not be in a file generated by a build. */
const TAGS = {
  'the GA4 tag': /googletagmanager\.com\/gtag\/js/,
  'the Meta Pixel': /connect\.facebook\.net/,
  'a granted consent state': /"analytics"\s*:\s*true|"marketing"\s*:\s*true/
};

const failures = [];
const fail = (route, message) => failures.push(`${route}: ${message}`);

if (networkAttempts.length > 0) {
  // Nothing on a public marketing page should need the network to render. If something
  // does, it is reaching a backend during a build and whatever comes back would be baked
  // into a public file, so this is fatal rather than a warning.
  fail('(all)', `made ${networkAttempts.length} network request(s): ${[...new Set(networkAttempts)].join(', ')}`);
}

const seen = new Map();

for (const { route, html } of captures) {
  const dom = new JSDOM(html);
  const { document } = dom.window;
  const head = document.head.innerHTML;
  const text = readableText(document);

  // (a) The page rendered at all. The shell is ~54 characters; anything near that means
  //     React produced nothing and we are about to ship the bug we set out to fix.
  if (text.length < 400) fail(route, `only ${text.length} characters of readable text`);
  if (!document.querySelector('#root')?.textContent?.trim()) fail(route, '#root is empty');
  if (!document.querySelector('h1')) fail(route, 'no <h1>');

  // (b) Every route differs. Ten files sharing a title is the thing being fixed.
  const previous = seen.get(head);
  if (previous) fail(route, `has a byte-identical <head> to ${previous}`);
  seen.set(head, route);

  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
  const expected = route === '/' ? `${ORIGIN}/` : `${ORIGIN}${route}`;
  if (canonical !== expected) fail(route, `canonical is ${canonical}, expected ${expected}`);
  if (attr(document, 'meta[property="og:url"]') !== expected) fail(route, 'og:url is not the canonical');
  if (!document.title) fail(route, 'no <title>');
  if (!attr(document, 'meta[name="description"]')) fail(route, 'no meta description');
  if (attr(document, 'meta[name="robots"]') !== 'index, follow') fail(route, 'is not index, follow');

  // (c) The JSON-LD the answer engines read is present, and per page.
  const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')];
  if (jsonLd.length < 1) fail(route, 'has no JSON-LD');
  for (const block of jsonLd) {
    try {
      JSON.parse(block.textContent ?? '');
    } catch {
      fail(route, 'has JSON-LD that does not parse');
    }
  }

  // (d) No session, no user, no account data. Prerendering runs the real app against the
  //     real client; if it ever picked a session up, this is what catches it before the
  //     file reaches a CDN.
  for (const [label, pattern] of Object.entries(SESSION_SHAPED)) {
    if (pattern.test(html)) fail(route, `contains something ${label}`);
  }

  // (e) Consent is not pre-granted, and nothing fired. The banner has to be in the
  //     document in the state a first-time visitor sees, and no tag may be present.
  if (!document.querySelector('[role="dialog"] #cookie-title')) fail(route, 'has no cookie banner');
  if (!/Accept all/.test(html) || !/Reject optional/.test(html)) {
    fail(route, 'has a cookie banner without both choices');
  }
  if (document.querySelector('#consent-analytics') || document.querySelector('#consent-marketing')) {
    fail(route, 'has the consent detail panel open, which is not the first-visit state');
  }
  for (const [label, pattern] of Object.entries(TAGS)) {
    if (pattern.test(html)) fail(route, `loads ${label}`);
  }

  // (f) The app still boots. Prerendered markup that lost its script tag is a dead page
  //     for everybody who does run JavaScript.
  if (!document.querySelector('script[type="module"][src]')) fail(route, 'lost its module script');
  if (!document.querySelector('link[rel="stylesheet"]')) fail(route, 'lost its stylesheet');
}

if (failures.length > 0) {
  console.error('\n[prerender] FAILED\n');
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error('\nNothing was written. dist/ is unchanged.\n');
  process.exit(1);
}

for (const { route, html } of captures) {
  const file = route === '/' ? 'index.html' : `${route.replace(/^\//, '')}.html`;
  const target = join(DIST, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html);
}

writeFileSync(join(DIST, SHELL_FILE), buildShell(template));
rmSync(BUNDLE_DIR, { recursive: true, force: true });

/* ------------------------------------------------------------------ *
 * 4. Report.
 * ------------------------------------------------------------------ */

const pad = (value, width) => String(value).padEnd(width);
console.log(`\n${pad('route', 18)}${pad('bytes', 9)}${pad('text', 8)}title`);
for (const { route, html } of captures) {
  const document = new JSDOM(html).window.document;
  console.log(
    `${pad(route, 18)}${pad(Buffer.byteLength(html), 9)}${pad(readableText(document).length, 8)}${document.title}`
  );
}
console.log(
  `\n[prerender] wrote ${captures.length} routes plus ${SHELL_FILE} in ${((Date.now() - started) / 1000).toFixed(1)}s\n`
);

/**
 * Exit rather than waiting for the event loop to drain, because it will not.
 *
 * When `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set — which they are on
 * Vercel, and are not in a bare checkout — each of the ten module graphs constructs its
 * own Supabase client, and each of those starts an `autoRefreshToken` interval on Node's
 * timers. `window.close()` cannot clear those; they are not the document's. Every route
 * would render, every file would be written, the report would print, and the build would
 * then sit there forever.
 *
 * This was not theoretical. It is exactly what happened the first time this ran with
 * credentials in the environment, and it is the reason `ROUTE_TIMEOUT_MS` exists as well:
 * a build that hangs tells you nothing, and it does it slowly.
 */
process.exit(0);

/* ------------------------------------------------------------------ *
 * Helpers.
 * ------------------------------------------------------------------ */

/**
 * The SPA fallback: the untouched build shell, marked noindex.
 *
 * Everything that is not a prerendered page lands here — /sign-up, /log-in,
 * /checkout/success, and any URL that does not exist. All of them set noindex from
 * JavaScript already, but a crawler that does not run JavaScript never sees that, and
 * until now they were served a document claiming `index, follow` with a canonical
 * pointing at the home page. So it is set statically here too, and the canonical and
 * og:url are dropped rather than left claiming to be the home page.
 */
function buildShell(html) {
  const dom = new JSDOM(html);
  const { document } = dom.window;
  document.querySelector('meta[name="robots"]')?.setAttribute('content', 'noindex, nofollow');
  document.querySelector('link[rel="canonical"]')?.remove();
  document.querySelector('meta[property="og:url"]')?.remove();
  return dom.serialize();
}

/** Title plus body copy, whitespace collapsed — what a crawler can actually read. */
function readableText(document) {
  const clone = document.cloneNode(true);
  for (const node of clone.querySelectorAll('script, style, noscript, template')) node.remove();
  return [clone.title, clone.body?.textContent ?? ''].join(' ').replace(/\s+/g, ' ').trim();
}

function attr(document, selector) {
  return document.querySelector(selector)?.getAttribute('content') ?? '';
}

/**
 * Puts a jsdom window's globals where React and the app expect to find them, and closes
 * off the network on the way.
 */
function installGlobals(win) {
  // Timers, console, process and the platform primitives stay Node's. Everything else the
  // app might reach for comes from the document being rendered.
  //
  // `performance` in particular MUST stay Node's: jsdom implements
  // `window.performance.now()` by calling the global `performance.now()`, so installing
  // jsdom's over the top makes it call itself until the stack runs out.
  const keep = new Set([
    'console', 'process', 'global', 'globalThis', 'Buffer', 'require', 'module', 'exports',
    'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate',
    'clearImmediate', 'queueMicrotask', 'fetch', 'undefined', 'NaN', 'Infinity', 'eval',
    'performance', 'crypto', 'structuredClone', 'atob', 'btoa', 'TextEncoder', 'TextDecoder'
  ]);

  for (const key of Object.getOwnPropertyNames(win)) {
    if (keep.has(key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(win, key);
    if (!descriptor) continue;
    try {
      Object.defineProperty(globalThis, key, { ...descriptor, configurable: true });
    } catch {
      // Some host globals in Node are not redefinable. None of them are DOM.
    }
  }
  Object.defineProperty(globalThis, 'window', { value: win, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'self', { value: win, configurable: true, writable: true });

  // jsdom has no layout, so scrolling is a hard error rather than a no-op. App.tsx scrolls
  // to the top on every route change.
  win.scrollTo = () => undefined;
  win.scrollBy = () => undefined;

  blockNetwork(win);
}

/**
 * Every way out of the process, closed and recorded.
 *
 * This is the guarantee behind "no session, no user, no account data": if nothing can
 * reach Supabase, nothing signed-in can come back to be written into a file. Recording
 * rather than silently stubbing, so an attempt fails the build and says what it was.
 */
function blockNetwork(win) {
  const record = (target) => {
    networkAttempts.push(String(target));
    return new Error(`prerender does not have network access (attempted ${target})`);
  };

  const blockedFetch = (input) =>
    Promise.reject(record(typeof input === 'string' ? input : (input?.url ?? 'unknown')));

  globalThis.fetch = blockedFetch;
  win.fetch = blockedFetch;

  class BlockedXHR {
    open(_method, url) {
      this._url = url;
    }
    send() {
      throw record(this._url ?? 'unknown');
    }
    setRequestHeader() {}
    abort() {}
    addEventListener() {}
    removeEventListener() {}
  }
  win.XMLHttpRequest = BlockedXHR;
  globalThis.XMLHttpRequest = BlockedXHR;

  class BlockedWebSocket {
    constructor(url) {
      throw record(url);
    }
  }
  win.WebSocket = BlockedWebSocket;
  globalThis.WebSocket = BlockedWebSocket;

  if (win.navigator) {
    win.navigator.sendBeacon = (url) => {
      record(url);
      return false;
    };
  }
}

/**
 * jsdom logs "Not implemented" for the handful of layout APIs it has no answer for. Real
 * errors from the app still surface, because they come through React, not through here.
 */
function quietConsole() {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => {
    if (/Not implemented/.test(error.message)) return;
    console.error(error);
  });
  return virtualConsole;
}
