/* ESLint 8 (legacy eslintrc) config for the Batchlabel Vite + React + TS site. */
module.exports = {
  root: true,
  env: { browser: true, es2020: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'coverage', 'node_modules', '*.cjs'],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
  plugins: ['@typescript-eslint', 'react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    // The codebase deliberately swallows storage/parse failures in a few places.
    'no-empty': ['error', { allowEmptyCatch: true }],
  },
  overrides: [
    {
      // THE SERVER BOUNDARY. src/server/** holds the plan contract — the mapping from a
      // Stripe price id to an entitlement — plus the code that reads STRIPE_SECRET_KEY and
      // the Supabase service role key. An import from a page, a component or a client
      // helper would pull it into the browser bundle, where a price id is visible and the
      // allowance table is editable in devtools. Only the functions in /api may import it.
      //
      // Test files are exempt below: plan-contract.test.ts imports both the contract and
      // the client display projection on purpose, to assert they have not drifted.
      files: ['src/pages/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}', 'src/lib/**/*.{ts,tsx}'],
      excludedFiles: ['**/*.test.ts', '**/*.test.tsx'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/server/*', '../server/*', '../../server/*'],
                message:
                  'src/server/** is server-only. The plan contract and the Stripe/Supabase ' +
                  'secrets live there and must never reach a browser bundle. Client code ' +
                  'gets the catalogue from GET /api/plans.',
              },
            ],
          },
        ],
      },
    },
    {
      // Test files pull in Vitest globals via explicit imports; nothing extra needed,
      // but relax a couple of rules that are noisy in test setups.
      files: ['**/*.test.ts', '**/*.test.tsx', 'src/test/**/*.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  ],
};
