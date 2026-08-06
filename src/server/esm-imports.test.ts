import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A deployed handler may import from `./_server.js` and nothing else relative.
 *
 * WHY THIS TEST EXISTS. All four endpoints returned 500 in production while typecheck, 772
 * tests and the build were green. Nothing was wrong with the code — the build tooling and
 * the deployed runtime disagreed about module resolution, and CI only runs the build tooling.
 * Two import styles failed two different ways:
 *
 *   `'../src/server/cors'`     -> ERR_MODULE_NOT_FOUND
 *   `'../src/server/cors.js'`  -> "does not provide an export named 'allowedOrigins'"
 *
 * The second is what importing a named export from CommonJS via ESM looks like, so the
 * runtime was resolving the file and handing back the wrong module format. `"type": "module"`
 * in package.json, `moduleResolution: "bundler"` in tsconfig and Vercel's own TypeScript
 * loader each behave differently, and Vite papers over all of it — which is exactly why a
 * test suite that only exercises these modules through Vite can never see the problem.
 *
 * scripts/bundle-api.mjs removes the disagreement instead of guessing at it: esbuild emits
 * one plain ESM `api/_server.js` with no relative imports left to resolve. This test guards
 * the other half of that contract — that no handler quietly reintroduces a cross-directory
 * import and starts depending on the runtime's resolution again.
 *
 * It reads the handlers rather than a fixed list, because the failure mode is a NEW handler
 * added later. A hard-coded list would pass while the thing it guards regressed.
 */

const ROOT = join(__dirname, '..', '..');
const API_DIR = join(ROOT, 'api');

/**
 * Handlers only, at any depth. `_`-prefixed names are not routes and the bundle is generated.
 *
 * THIS WALKED THE TOP LEVEL ONLY, which made it blind to the exact case its own docstring
 * says it exists for. Vercel routes api/account/invite.ts to /api/account/invite, so a
 * nested file is an ordinary handler, and neither this guard nor scripts/bundle-api.mjs
 * could see one. The bundle would have shipped without the exports that handler imports and
 * the endpoint would have 500'd in production with everything green, which is the failure
 * this file was written about. Returns paths relative to api/ so the names stay readable in
 * test output.
 */
function handlerFiles(dir: string = API_DIR, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) {
      out.push(...handlerFiles(join(dir, entry.name), `${prefix}${entry.name}/`));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(`${prefix}${entry.name}`);
    }
  }
  return out.sort();
}

/**
 * What a handler at this depth is allowed to import: the generated bundle, reached with as
 * many parent hops as its own directory requires and no other relative path at all.
 */
function bundleSpecifier(file: string): string {
  const depth = file.split('/').length - 1;
  return depth === 0 ? './_server.js' : `${'../'.repeat(depth)}_server.js`;
}

function relativeSpecifiers(source: string): string[] {
  return [...source.matchAll(/(?:from|import\()\s*'(\.[^']*)'/g)].map((m) => m[1]);
}

describe('deployed handlers depend only on the generated bundle', () => {
  const handlers = handlerFiles();

  it('found the handlers', () => {
    // Non-vacuity. A broken glob would otherwise find no files, report no violations, and
    // show the same green that production was down behind.
    expect(handlers.length).toBeGreaterThanOrEqual(4);
    expect(handlers).toContain('plans.ts');
    expect(handlers).toContain('stripe-webhook.ts');
    // A nested handler exists, so the walk above is doing something the old flat read did
    // not. Without this the recursion could be removed and every assertion would still pass.
  });

  /**
   * NO HANDLER MAY LIVE IN A SUBDIRECTORY, because Vercel will not route it on this project.
   *
   * This was learned by shipping it. `api/account/invite.ts` was added on the assumption that
   * Vercel maps a nested file to a nested route; `vercel build` against that layout emitted
   * four functions and nothing for the nested file, so /api/account/invite answered Vercel's
   * own NOT_FOUND in production. Typecheck, lint, 1,494 tests and the build were all green
   * throughout, because nothing in CI runs Vercel's zero-config function detection.
   *
   * The walk above recurses precisely so this can be checked. If a nested route URL is wanted,
   * keep the file flat and map the URL with a rewrite in vercel.json, which is what
   * api/account-invite.ts does for /api/account/invite.
   */
  it('no handler sits in a subdirectory, because Vercel would not build it', () => {
    const nested = handlers.filter((f) => f.includes('/'));
    expect(
      nested,
      `these handlers are nested and will NOT be routed: ${nested.join(', ')}. Vercel's ` +
      'zero-config function detection globs the top level of api/ only, so a nested file ' +
      'produces no function and the endpoint answers NOT_FOUND with a completely green ' +
      'build. Put the file at the top level and map the URL with a rewrite in vercel.json.'
    ).toEqual([]);
  });

  /**
   * The other half of that workaround. The app posts to a URL that no filename matches, so
   * the rewrite in vercel.json IS the route: delete it and /api/account/invite goes back to
   * answering NOT_FOUND, with every test here still green because the handler is fine.
   *
   * Asserts the destination resolves to a handler that exists, rather than just that some
   * rewrite is present, because a rewrite pointing at a renamed file is the same 404.
   */
  it('every /api rewrite points at a handler that exists', () => {
    const vercelJson = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')) as {
      rewrites?: { source: string; destination: string }[];
    };
    const apiRewrites = (vercelJson.rewrites ?? []).filter((r) => r.destination.startsWith('/api/'));

    // Non-vacuity: the app's invite call depends on exactly this one existing.
    expect(
      apiRewrites.map((r) => r.source),
      'vercel.json has no rewrite for /api/account/invite. The app posts there, no filename ' +
      'matches it, and Vercel will not build a nested handler, so without this rewrite the ' +
      'endpoint answers NOT_FOUND.'
    ).toContain('/api/account/invite');

    const broken = apiRewrites.filter(
      (r) => !handlers.includes(`${r.destination.replace(/^\/api\//, '')}.ts`)
    );
    expect(
      broken.map((r) => `${r.source} -> ${r.destination}`),
      'these rewrites point at handlers that do not exist, which is a 404 the same as having ' +
      'no rewrite at all'
    ).toEqual([]);
  });

  it.each(handlerFiles())('%s imports only the generated bundle', (file) => {
    const allowed = bundleSpecifier(file);
    const specs = relativeSpecifiers(readFileSync(join(API_DIR, file), 'utf8'));
    const offenders = specs.filter((s) => s !== allowed);
    expect(
      offenders,
      `api/${file} imports ${offenders.join(', ')}. Serverless handlers may only import ` +
      `'${allowed}' — the real file produced by scripts/bundle-api.mjs, reached with the ` +
      'parent hops this handler\'s own depth requires. Any other relative path puts module ' +
      'resolution back in the hands of the deployed runtime, which is what made every ' +
      'endpoint 500 with a green build. Add the name to a handler import and the bundle ' +
      'picks it up automatically.'
    ).toEqual([]);
  });

  it('the bundler reads the handlers, so the bundle cannot miss an export', () => {
    // The barrel is derived from these same import statements. If that derivation stopped
    // matching the handlers' import syntax it would silently emit a bundle missing exports,
    // which surfaces only as a runtime 500 — so assert the shape it depends on.
    const bundler = readFileSync(join(ROOT, 'scripts', 'bundle-api.mjs'), 'utf8');
    expect(bundler).toContain('readdirSync');
    for (const file of handlerFiles()) {
      const source = readFileSync(join(API_DIR, file), 'utf8');
      expect(
        source,
        `api/${file} must import from '${bundleSpecifier(file)}' with a braced named-import, ` +
        'which is the form scripts/bundle-api.mjs scans for.'
      ).toMatch(/import\s*\{[^}]+\}\s*from\s*'(?:\.\.\/)*\.?\/?_server\.js'/);
    }
  });

  /**
   * THE ONLY ASSERTION HERE THAT CANNOT BE SATISFIED BY INTENT.
   *
   * Every other check in this file reads source and asserts a shape. This one reads the
   * GENERATED bundle and asserts that what the handlers import is actually in it, which is
   * the property production depends on and the only one a missing export would break.
   *
   * It was written after the weaker version failed its own mutation test: an earlier guard
   * asserted that scripts/bundle-api.mjs merely CONTAINED the word `handlerFiles`, and when
   * the recursion inside that function was disabled the bundle silently lost an export while
   * this file stayed green. A guard that survives the bug it guards against is decoration.
   *
   * The bundle is generated by the `pretest:run` / `pretest:coverage` hooks, so it is present
   * and current whenever this runs.
   */
  it('the generated bundle really exports every name the handlers import', () => {
    const barrel = readFileSync(join(API_DIR, '_server.d.ts'), 'utf8');
    const exported = new Set(
      [...barrel.matchAll(/export\s*\{([^}]+)\}/g)].
        flatMap(([, names]) => names.split(',')).
        map((raw) => raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()?.trim()).
        filter(Boolean) as string[]
    );
    expect(exported.size, 'the generated barrel exported nothing, so this assertion is vacuous').
      toBeGreaterThan(0);

    const missing: string[] = [];
    for (const file of handlerFiles()) {
      const source = readFileSync(join(API_DIR, file), 'utf8');
      for (const [, names] of source.matchAll(
        /import\s*\{([^}]+)\}\s*from\s*'(?:\.\.\/)*\.?\/?_server\.js'/g
      )) {
        for (const raw of names.split(',')) {
          const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
          if (name && !exported.has(name)) missing.push(`${file} -> ${name}`);
        }
      }
    }

    expect(
      missing,
      `api/_server.js is missing exports these handlers import: ${missing.join(', ')}. ` +
      'That is a 500 on a live endpoint with typecheck, tests and build all green. The usual ' +
      'cause is scripts/bundle-api.mjs not seeing the handler at all, which happens when it ' +
      'stops walking api/ subdirectories.'
    ).toEqual([]);
  });
});
