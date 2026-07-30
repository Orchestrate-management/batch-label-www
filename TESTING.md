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
  `openBillingPortal` with `fetch` mocked, and that neither one sends a `user_id` in the body:
  identity travels as a bearer token so it cannot be edited in devtools.
- `src/lib/consent.ts` — `getStoredConsent` parsing (valid/invalid) and `saveConsent` persistence.
- `src/components/ui/Button.tsx` — renders label/variant, fires `onClick`, pushes `cta_click`, and
  renders router links / anchors.
- `src/lib/membership.ts` — the OAuth completion gate: `membershipRedirect` (including that no
  state ever makes both pages redirect at once, so there is no loop), `fetchMembershipState`
  failing to `unknown` rather than to a signup screen, the `completionPayload` shape (no user id,
  no `accepted` flag inside the document snapshots, attribution carried through), and
  `completeOAuthSignup` refusing to call the database with the terms unticked.
- `src/lib/auth.tsx` — `RequireMembership` routing a Google user with no membership to
  `/finish-setup`, letting a provisioned user through, and not re-asking a returning user.
- `src/pages/auth/FinishSetup.tsx` — terms cannot be submitted unticked, the consent booleans sent
  match the boxes, and `sign_up_completed` fires only when the call actually provisioned.
- `src/pages/auth/{SignUp,LogIn}.tsx` — the Google button starts the redirect with the right
  intent, and the email signup path still refuses an unticked terms box.
- `src/server/*` — the billing back end, run under the `node` environment (`// @vitest-environment
  node` at the top of each file):
  - `webhook.ts` — signature verification against a **real** Stripe SDK signature (generated
    locally by `stripe.webhooks.generateTestHeaderString`, so no account or network is involved):
    a missing, forged or wrong-secret signature is a 400 and reaches no store, a missing
    `STRIPE_WEBHOOK_SECRET` fails closed with a 500, and — the one that catches the classic
    regression — a body that has been re-serialised rather than passed through raw fails
    verification. Plus the outcome contract: 500 on a write failure (Stripe retries), 200 on
    `no_membership` (retrying cannot help and a run of 5xx gets the endpoint disabled).
  - Idempotency and ordering end to end: a replayed event changes nothing, a late
    `customer.subscription.updated` cannot resurrect a plan a `deleted` already ended, a partial
    event cannot blank a period end an earlier event wrote, and a cancellation for a superseded
    subscription does not take the current one down. Plus the two-clock regression: a
    `checkout.session.completed` landing before the `customer.subscription.created` behind it
    must not discard it (Stripe always generates the subscription event *first*, so under a
    single ordering clock that delivery order throws away the only copy of the billing period
    that will ever be sent) — while an out-of-order checkout event still may not resurrect a
    cancelled plan. These drive an in-memory model of
    `apply_stripe_entitlement()`; the enforcing copy is the SQL, since only the database can make
    the claim-and-apply atomic — see the comment on `modelStore` for exactly what that does and
    does not prove.
  - `entitlements.ts` / `stripe-events.ts` — which Stripe statuses entitle (`incomplete` does
    not), both API-version shapes for `current_period_end` and `invoice.subscription`, and that an
    `invoice.*` event can never grant a plan.
  - `cors.ts` — the exact allow-list including `https://app.batchlabel.xyz`, never a wildcard on a
    credentialed endpoint, lookalike origins rejected, and `Vary: Origin` always present.
  - `config.ts` / `checkout.ts` — env reading, open-redirect rejection on the checkout return
    paths, and that the attribution blob cannot overwrite the brand or plan in Stripe metadata.
  - `supabase-admin.ts` — identity comes from the verified bearer token, and there is no code path
    from a request body to a user id.

### Coverage thresholds

Coverage is measured against the units that have tests (see `coverage.include` in
`vitest.config.ts`) so the gate is a real signal rather than being diluted by the not-yet-tested
view layer. Thresholds are intentionally **modest** so the gate is real without blocking legitimate
work:

```
lines: 50   functions: 50   statements: 50   branches: 45
```

Current coverage sits comfortably above these (~93% lines; the `src/server` billing modules are
~98%). Raise the thresholds and widen `coverage.include` as more of the app gets test coverage.

`src/server/supabase-admin.ts` is deliberately outside `coverage.include`: it is Supabase client
wiring whose only real logic (`bearerToken`, `userFromRequest`) is tested directly, and measuring
the query builder calls around it would only measure the mocks.

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
