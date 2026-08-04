import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Vitest picks this file up in preference to vite.config.ts. Production builds still
// use vite.config.ts, so test-only settings never leak into the shipped bundle.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    // Serve the jsdom document from an https origin so `Secure` cookies (written by the
    // attribution/consent helpers on https) are actually persisted in the cookie jar.
    environmentOptions: {
      jsdom: { url: 'https://batchlabel.co.uk/' },
    },
    setupFiles: ['./src/test/setup.ts'],
    // supabase/tests holds the SQL suite: real migrations replayed into a real
    // Postgres (PGlite). Those files declare `@vitest-environment node` in a
    // docblock, because jsdom buys them nothing and the harness is pure Node.
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'supabase/tests/**/*.test.ts'],
    // Booting Postgres and replaying the whole chain is seconds, not milliseconds,
    // and several suites do it more than once. The default 5s kills them on a
    // busy machine — which is a flaky gate, not a signal.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      // Measure coverage against the units that actually have tests, so the gate is a
      // real signal rather than being diluted by the (as yet untested) view layer.
      include: [
        'src/lib/attribution.ts',
        'src/lib/analytics.ts',
        'src/lib/billing.ts',
        'src/lib/consent.ts',
        'src/lib/consent-preferences.ts',
        'src/lib/agreements.ts',
        'src/lib/membership.ts',
        'src/lib/entitlements.ts',
        'src/lib/checkout-intent.ts',
        'src/components/ui/Button.tsx',
        // The billing server half. These decide who keeps a paid plan, so they are held to
        // the same gate as the client units. src/server/supabase-admin.ts is deliberately
        // absent: it is Supabase wiring whose only testable logic (bearerToken,
        // userFromRequest) is covered directly, and measuring the client calls around it
        // would only measure the mocks.
        'src/server/plan-contract.ts',
        'src/server/plans.ts',
        'src/server/entitlements.ts',
        'src/server/stripe-events.ts',
        'src/server/checkout.ts',
        'src/server/cors.ts',
        'src/server/config.ts',
        'src/server/webhook.ts',
      ],
      thresholds: {
        lines: 50,
        functions: 50,
        statements: 50,
        branches: 45,
      },
    },
  },
});
