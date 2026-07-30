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
      // Test files pull in Vitest globals via explicit imports; nothing extra needed,
      // but relax a couple of rules that are noisy in test setups.
      files: ['**/*.test.ts', '**/*.test.tsx', 'src/test/**/*.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  ],
};
