/**
 * Types for scripts/vercel-routing.mjs.
 *
 * The module is plain ESM because scripts/ is run by node directly and is not part of the
 * TypeScript build. src/lib/vercel-routing.test.ts imports it, so it needs a declaration.
 */

export interface VercelRewrite {
  source: string;
  destination: string;
}

export interface VercelRedirect {
  source: string;
  destination: string;
  permanent?: boolean;
}

export interface VercelConfig {
  cleanUrls?: boolean;
  rewrites?: VercelRewrite[];
  redirects?: VercelRedirect[];
}

export type Resolution =
  | { kind: 'file'; file: string }
  | { kind: 'redirect'; status: number; location: string }
  | { kind: 'function'; file: string }
  | { kind: 'notFound' };

export function sourceToRegExp(source: string): RegExp;

export function resolveRequest(
  pathname: string,
  config: VercelConfig,
  fileExists: (file: string) => boolean
): Resolution;
