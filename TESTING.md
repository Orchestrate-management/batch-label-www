# Testing & quality gates

This project ships with a standard CI/CD quality gate: linting, type checking, unit/component
tests with coverage, and a production build all run on every push, every pull request, and every
deployment.

## Running things locally

| Command | What it does |
| --- | --- |
| `npm run lint` | ESLint over all `.js/.jsx/.ts/.tsx` files |
| `npm run typecheck` | `tsc --noEmit` — full TypeScript type check, emits nothing |
| `npm test` | Vitest in watch mode (for local development) |
| `npm run test:run` | Vitest once, non-interactive (what CI runs) |
| `npm run test:coverage` | Vitest once with a V8 coverage report + threshold enforcement |
| `npm run build` | Production Vite build |

The coverage HTML report is written to `coverage/index.html` after `npm run test:coverage`.

## Test stack

- **[Vitest](https://vitest.dev/)** — test runner, configured in `vitest.config.ts`.
- **[@testing-library/react](https://testing-library.com/)** + **@testing-library/jest-dom** — component
  rendering and DOM assertions.
- **jsdom** — the browser-like environment (`environment: 'jsdom'`). It is served from an `https://`
  origin so the `Secure` cookies written by the attribution/consent helpers persist in tests.
- **@vitest/coverage-v8** — coverage provider.

Global test APIs (`describe`, `it`, `expect`, `vi`, …) are enabled via `globals: true`, and
`src/test/setup.ts` registers the jest-dom matchers and cleans the DOM between tests.

### What is covered

Tests live next to the code they exercise (`*.test.ts` / `*.test.tsx`). The initial suite focuses on
the highest-value, most testable units:

- `src/lib/attribution.ts` — first-touch capture (first write wins, never overwritten),
  `getAttribution` storage→cookie fallback, and `attributionForMetadata` flattening/null-omission.
- `src/lib/analytics.ts` — `sha256` hashing and the dataLayer shape of every `track*` helper.
- `src/lib/billing.ts` — `PRICES` plus the success/error branches of `startCheckout` and
  `openBillingPortal` with `fetch` mocked.
- `src/lib/consent.ts` — `getStoredConsent` parsing (valid/invalid) and `saveConsent` persistence.
- `src/components/ui/Button.tsx` — renders label/variant, fires `onClick`, pushes `cta_click`, and
  renders router links / anchors.

### Coverage thresholds

Coverage is measured against the units that have tests (see `coverage.include` in
`vitest.config.ts`) so the gate is a real signal rather than being diluted by the not-yet-tested
view layer. Thresholds are intentionally **modest** so the gate is real without blocking legitimate
work:

```
lines: 50   functions: 50   statements: 50   branches: 45
```

Current coverage sits comfortably above these (~92% lines). Raise the thresholds and widen
`coverage.include` as more of the app gets test coverage.

## CI — runs on every push and PR

> **⚠️ Activation step required.** The workflow definition is committed at **`ci/ci.yml`** rather
> than `.github/workflows/ci.yml`, because the token used to open the PR that introduced it lacked
> the GitHub `workflow` OAuth scope and therefore could not push a file under `.github/workflows/`.
> A maintainer with that scope must activate it once, from the repo root:
>
> ```
> git mv ci/ci.yml .github/workflows/ci.yml && git commit -m "ci: activate workflow" && git push
> ```
>
> (Or recreate it at `.github/workflows/ci.yml` via the GitHub web UI, which carries the required
> permission.) GitHub only runs the workflow once it lives at `.github/workflows/ci.yml`.

The workflow runs on `push` and `pull_request` (Node 20, npm cache) and executes, in order:

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test:coverage`
5. `npm run build`

Any failing step fails the check. The coverage report is uploaded as a build artifact.

> **Enable branch protection for full enforcement.** CI reports status, but GitHub will still allow
> merging a red PR unless the check is *required*. In **Settings → Branches → Branch protection
> rules** for `main`, add a rule that requires the **"Lint, typecheck, test & build"** status check
> to pass before merging (and, ideally, require branches to be up to date). This must be done in the
> GitHub UI by a repo admin — it is not part of this change.

## Deployment gate

Vercel runs the `vercel-build` script in preference to `build` when it is present. Ours is:

```
"vercel-build": "npm run typecheck && npm run test:run && vite build"
```

So a deployment **fails** if type checking or tests fail — the same quality bar as CI is enforced at
deploy time, for both preview and production deployments.
