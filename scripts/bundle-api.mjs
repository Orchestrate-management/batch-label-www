/**
 * Bundles everything the serverless handlers import into one file beside them.
 *
 * WHY THIS EXISTS. All four endpoints 500'd in production while typecheck, tests and the
 * build were green, and two different import styles failed two different ways:
 *
 *   `'../src/server/cors'`     -> ERR_MODULE_NOT_FOUND        (nothing resolved)
 *   `'../src/server/cors.js'`  -> "does not provide an export named 'allowedOrigins'"
 *
 * The second is the shape you get importing a named export from CommonJS via ESM — so the
 * deployed runtime was resolving the module and handing back the wrong module format. Which
 * exact combination of `"type": "module"`, `moduleResolution: "bundler"` and Vercel's own
 * TypeScript loader produces that is not something the repo can pin down or rely on, and it
 * is not something CI can see: every one of those layers behaves differently under Vite.
 *
 * So the fix removes the variable rather than guessing at it. esbuild produces ONE plain ESM
 * file with no relative imports left to resolve, and the handlers import from `./_server.js`
 * — same directory, real file, no tsconfig involved.
 *
 * The leading underscore matters: Vercel treats files in /api as routes, but skips those
 * beginning with `_`. That is what lets shared code sit beside the handlers at all.
 *
 * Runs as part of `vercel-build`, so the file is generated wherever the build runs and never
 * committed — a checked-in bundle would drift from source silently.
 */

import { build } from 'esbuild';
import { writeFileSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The barrel is DERIVED from what the handlers actually import, not hand-maintained.
 *
 * A hand-written list is a second source of truth: add an import to a handler, forget to add
 * it here, and the bundle is missing an export — which surfaces as the exact runtime 500 this
 * script exists to prevent, with a green build. Reading the handlers means the bundle cannot
 * be out of step with them by construction.
 */
function deriveBarrel() {
  // 1. What do the handlers ask for? They import a flat list of names from './_server.js'.
  const wanted = new Set();
  for (const file of readdirSync(join(ROOT, 'api')).filter((f) => f.endsWith('.ts') && !f.startsWith('_'))) {
    const source = readFileSync(join(ROOT, 'api', file), 'utf8');
    for (const [, names] of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*'\.\/_server\.js'/g)) {
      for (const raw of names.split(',')) {
        const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
        if (name) wanted.add(name);
      }
    }
  }

  // 2. Which module provides each? Scan the server sources for their top-level exports.
  //    Done by lookup rather than `export *` because two modules exporting the same name
  //    would make `export *` drop it silently — a missing export that only shows as a
  //    runtime 500, which is the whole failure class this script exists to close.
  const byModule = new Map();
  const unresolved = new Set(wanted);

  for (const dir of ['src/server', 'src/lib']) {
    for (const file of readdirSync(join(ROOT, dir))) {
      if (!file.endsWith('.ts') || file.includes('.test.')) continue;
      const spec = `../${dir}/${file.replace(/\.ts$/, '')}`;
      const source = readFileSync(join(ROOT, dir, file), 'utf8');
      const provided = [...source.matchAll(
        /^export\s+(?:async\s+)?(?:function|const|class|let)\s+([A-Za-z_$][\w$]*)/gm
      )].map((m) => m[1]);

      for (const name of provided) {
        if (!unresolved.has(name)) continue;
        const set = byModule.get(spec) ?? new Set();
        set.add(name);
        byModule.set(spec, set);
        unresolved.delete(name);
      }
    }
  }

  if (unresolved.size > 0) {
    // Fail the build rather than emit a bundle missing an export. The alternative is a
    // green build and a 500 on the endpoint that needed it.
    throw new Error(
      `[bundle-api] no source module exports: ${[...unresolved].join(', ')}. ` +
      'A handler imports these from ./_server.js but nothing under src/server or src/lib ' +
      'declares them as a top-level export.'
    );
  }

  return [...byModule].
  map(([spec, names]) => `export { ${[...names].sort().join(', ')} } from '${spec}';`).
  join('\n');
}

const BARREL = deriveBarrel();

const barrelPath = join(ROOT, 'api', '_barrel.generated.ts');
writeFileSync(barrelPath, BARREL);

await build({
  entryPoints: [barrelPath],
  outfile: join(ROOT, 'api', '_server.js'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  // ESM out, because package.json declares "type": "module" and a CJS bundle here is
  // precisely the failure this script exists to end.
  format: 'esm',
  // Dependencies stay external: they are real packages in node_modules that Node resolves
  // without help, and inlining stripe + supabase would produce a needlessly large function.
  packages: 'external',
  logLevel: 'warning'
});

// The barrel has served its purpose; leaving it would make `api/` contain a stray .ts file
// that Vercel might try to treat as a route.
writeFileSync(barrelPath, '');
unlinkSync(barrelPath);

/**
 * Declarations for the bundle, so the handlers keep real types.
 *
 * esbuild emits JavaScript only, and a handler importing an untyped `./_server.js` gets
 * `any` for everything — which would silently disable type checking across exactly the code
 * that moves money. These re-exports point TypeScript back at the original sources, so the
 * types are the real ones rather than a hand-written approximation that could drift.
 *
 * Runtime resolves `_server.js` (the bundle); the compiler resolves `_server.d.ts` (these
 * types). They are generated from the same barrel, so they cannot disagree.
 */
writeFileSync(join(ROOT, 'api', '_server.d.ts'), `${BARREL}\n`);

console.log('[bundle-api] wrote api/_server.js and api/_server.d.ts');
