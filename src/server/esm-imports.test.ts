import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Every relative import reachable from `api/` must carry a `.js` extension.
 *
 * WHY THIS TEST EXISTS. All four endpoints returned 500 in production with
 * ERR_MODULE_NOT_FOUND while typecheck, 772 tests and the build were green. Nothing was
 * wrong with the code — only with how it resolved once deployed:
 *
 *   * `package.json` sets `"type": "module"`, so Vercel runs these handlers as real Node
 *     ESM, and Node ESM requires a file extension on every relative specifier.
 *   * `tsconfig` sets `"moduleResolution": "bundler"`, which lets Vite and tsc resolve
 *     `'./foo'` perfectly happily.
 *
 * So the build tooling and the runtime disagreed, and the build tooling is what CI runs.
 * A test suite that only exercises the modules through Vite can never see this: the import
 * graph is correct in every environment except the one that serves customers.
 *
 * `'./foo.js'` is the specifier that satisfies both — TypeScript maps it back to `foo.ts`,
 * Vite rewrites it, and Node resolves the emitted file directly.
 *
 * This walks the real import graph from `api/` rather than checking a hard-coded list,
 * because the failure mode is a NEW file added later without the extension. A fixed list
 * would pass while the thing it guards regressed.
 */

const ROOT = join(__dirname, '..', '..');

/** Resolve a relative specifier to a real source file, mirroring bundler resolution. */
function resolveModule(fromFile: string, spec: string): string | null {
  const base = join(dirname(fromFile), spec.replace(/\.js$/, ''));
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function relativeSpecifiers(source: string): string[] {
  return [...source.matchAll(/(?:from|import\()\s*'(\.[^']*)'/g)].map((m) => m[1]);
}

/** Every module reachable from the deployed handlers, handlers included. */
function serverModuleGraph(): string[] {
  const seen = new Set<string>();
  const queue = readdirSync(join(ROOT, 'api')).
  filter((f) => f.endsWith('.ts')).
  map((f) => join(ROOT, 'api', f));

  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of relativeSpecifiers(readFileSync(file, 'utf8'))) {
      const resolved = resolveModule(file, spec);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }
  return [...seen].sort();
}

describe('every module Vercel deploys resolves under Node ESM', () => {
  const graph = serverModuleGraph();

  it('found the handlers and what they import', () => {
    // Non-vacuity. If the walk breaks — a renamed directory, a changed regex — it would
    // otherwise return nothing and the suite below would pass by finding no violations,
    // which is the same green it showed while production was down.
    expect(graph.length).toBeGreaterThanOrEqual(10);
    expect(graph.some((f) => f.endsWith('api/plans.ts'))).toBe(true);
    expect(graph.some((f) => f.endsWith('src/server/config.ts'))).toBe(true);
  });

  it.each(serverModuleGraph().map((f) => f.slice(ROOT.length + 1)))(
    '%s imports with explicit .js extensions',
    (relative) => {
      const specs = relativeSpecifiers(readFileSync(join(ROOT, relative), 'utf8'));
      const missing = specs.filter((s) => !s.endsWith('.js'));
      expect(
        missing,
        `${relative} has extensionless relative import(s): ${missing.join(', ')}. ` +
        'Node ESM cannot resolve these at runtime, so the endpoint 500s with ' +
        'ERR_MODULE_NOT_FOUND while typecheck and build stay green. Append .js.'
      ).toEqual([]);
    }
  );
});
