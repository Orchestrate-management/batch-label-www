/**
 * A small model of the part of Vercel's request routing this site depends on.
 *
 * It exists because the whole point of prerendering is that a crawler asking for
 * /pricing gets the /pricing document, and on Vercel that is decided by routing rather
 * than by what the build wrote into dist/. Writing dist/pricing.html changes nothing on
 * its own — if the catch-all rewrite still answers first, the deploy goes green and a
 * crawler still gets the shell. So the routing has to be something we can execute and
 * assert on locally, not something we assume.
 *
 * Two consumers, one implementation, so they cannot disagree:
 *   - scripts/serve-dist.mjs serves the built dist/ through it, which is what
 *     scripts/audit-static-html.mjs then fetches with no JavaScript.
 *   - src/lib/vercel-routing.test.ts drives it with the real vercel.json, so reverting
 *     the config to a plain catch-all turns the suite red.
 *
 * The order below is Vercel's, and both steps that matter here are documented:
 *
 *   cleanUrls — "all HTML files ... will have their extension removed. When visiting a
 *   path that ends with the extension, a 308 response will redirect the client to the
 *   extensionless path. For example, a static file named about.html will be served when
 *   visiting the /about path."
 *
 *   rewrites — "precedence is given to the filesystem prior to rewrites being applied",
 *   and the deprecated `handle: filesystem` route type is documented as unnecessary
 *   because `rewrites` "checks the filesystem by default".
 *
 * The live site already demonstrates the second one: /robots.txt, /sitemap.xml and
 * /assets/*.js all match the existing `/((?!api/).*)` rewrite and are all served as
 * themselves, because the filesystem answered first.
 *
 * Deliberately not modelled: `has`/`missing` conditions, external destinations, edge
 * middleware, and the `routes` escape hatch. None are used by this project, and a model
 * that pretends to cover them would be lying about what it proved.
 */

/**
 * Turns a Vercel `source` pattern into an anchored RegExp.
 *
 * Vercel uses path-to-regexp, which passes anything inside parentheses through as raw
 * regular expression — which is how `/((?!api/).*)` works. Named parameters are the only
 * other syntax this project would plausibly reach for, so they are supported and
 * everything else is left alone.
 */
export function sourceToRegExp(source) {
  const pattern = source
    .replace(/:[A-Za-z_][A-Za-z0-9_]*\*/g, '(.*)')
    .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, '([^/]+)');
  return new RegExp(`^${pattern}$`);
}

/** Applies `$1`/`:name` style captures. Only positional captures are used here. */
function applyCaptures(destination, match) {
  return destination.replace(/\$(\d+)/g, (whole, index) => match[Number(index)] ?? whole);
}

/**
 * Resolves a pathname against the built output the way Vercel would.
 *
 * @param {string} pathname            Request path, no query string.
 * @param {object} config              Parsed vercel.json.
 * @param {(file: string) => boolean} fileExists
 *        Answers for a dist-relative path with no leading slash, e.g. 'pricing.html'.
 * @returns {{kind: 'file', file: string} |
 *           {kind: 'redirect', status: number, location: string} |
 *           {kind: 'function', file: string} |
 *           {kind: 'notFound'}}
 */
export function resolveRequest(pathname, config, fileExists) {
  const cleanUrls = config.cleanUrls === true;

  // 1. Redirects, which run before anything touches the filesystem.
  for (const redirect of config.redirects ?? []) {
    const match = sourceToRegExp(redirect.source).exec(pathname);
    if (match) {
      return {
        kind: 'redirect',
        status: redirect.permanent === false ? 307 : 308,
        location: applyCaptures(redirect.destination, match)
      };
    }
  }

  // 2. cleanUrls turns a request for the extension into a 308 to the clean path.
  if (cleanUrls && pathname.endsWith('.html')) {
    return { kind: 'redirect', status: 308, location: pathname.slice(0, -'.html'.length) };
  }

  // 3. The filesystem. This is the step that makes prerendering visible at all.
  const fromFilesystem = matchFilesystem(pathname, cleanUrls, fileExists);
  if (fromFilesystem) return fromFilesystem;

  // 4. Rewrites, in order, first match wins.
  for (const rewrite of config.rewrites ?? []) {
    const match = sourceToRegExp(rewrite.source).exec(pathname);
    if (!match) continue;
    const destination = applyCaptures(rewrite.destination, match);
    if (destination.startsWith('/api/')) {
      return { kind: 'function', file: destination.slice(1) };
    }
    const rewritten = matchFilesystem(destination, cleanUrls, fileExists);
    if (rewritten) return rewritten;
    return { kind: 'notFound' };
  }

  return { kind: 'notFound' };
}

function matchFilesystem(pathname, cleanUrls, fileExists) {
  if (pathname.startsWith('/api/')) {
    // Serverless functions, not static files. The build bundles these separately
    // (scripts/bundle-api.mjs) and they are never in dist/.
    return { kind: 'function', file: pathname.slice(1) };
  }

  const relative = pathname.replace(/^\/+/, '');

  if (pathname === '/' && fileExists('index.html')) return { kind: 'file', file: 'index.html' };
  if (relative && fileExists(relative)) return { kind: 'file', file: relative };
  if (cleanUrls && relative && fileExists(`${relative}.html`)) {
    return { kind: 'file', file: `${relative}.html` };
  }
  if (relative && fileExists(`${relative}/index.html`)) {
    return { kind: 'file', file: `${relative}/index.html` };
  }
  return null;
}
