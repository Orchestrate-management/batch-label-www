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

/** Handlers only. `_`-prefixed files are not routes and the bundle is generated. */
function handlerFiles(): string[] {
  return readdirSync(API_DIR).
  filter((f) => f.endsWith('.ts') && !f.startsWith('_')).
  sort();
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
  });

  it.each(handlerFiles())('%s imports only ./_server.js', (file) => {
    const specs = relativeSpecifiers(readFileSync(join(API_DIR, file), 'utf8'));
    const offenders = specs.filter((s) => s !== './_server.js');
    expect(
      offenders,
      `api/${file} imports ${offenders.join(', ')}. Serverless handlers may only import ` +
      "'./_server.js' — a real file in the same directory, produced by " +
      'scripts/bundle-api.mjs. A cross-directory import puts module resolution back in the ' +
      "hands of the deployed runtime, which is what made every endpoint 500 with a green " +
      'build. Add the export to a handler import and the bundle picks it up automatically.'
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
        `api/${file} must import from './_server.js' with a braced named-import, which is ` +
        'the form scripts/bundle-api.mjs scans for.'
      ).toMatch(/import\s*\{[^}]+\}\s*from\s*'\.\/_server\.js'/);
    }
  });
});
