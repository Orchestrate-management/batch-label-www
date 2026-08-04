/**
 * A Postgres that this repository can execute a migration against.
 *
 * WHY THIS EXISTS. Four migrations in supabase/migrations open by noting that the
 * repository has no SQL test harness — no PGlite, no ephemeral Postgres, nothing
 * in vitest that can execute a migration — and each works around it by asserting
 * its own behaviour in a `DO` block at apply time. That pattern is good and it
 * stays: an assertion that runs on the production database at the moment of
 * application is worth more than one that runs in CI.
 *
 * But it cannot express a TWO-USER test, and every isolation bug this schema has
 * had has lived exactly there:
 *
 *   * the SKU meter that answered a stranger with the victim's live product count
 *     and plan allowance, because PostgreSQL fires BEFORE ROW triggers before it
 *     evaluates the RLS `WITH CHECK` expression;
 *   * brand isolation that held only because nobody was yet a member of two
 *     brands' accounts at once — no policy on either domain table mentioned a
 *     brand at all.
 *
 * Neither is reachable from a `DO` block, because both need two identities and a
 * request-shaped session. That is what this file provides.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE POSTGRES VERSION GAP, STATED RATHER THAN DISCOVERED LATER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `supabase/config.toml` declares `major_version = 15`. PGlite 0.5.4 is
 * PostgreSQL 18.3. That gap cannot be closed by pinning, and it was checked
 * rather than assumed — no PGlite build ships PG15:
 *
 *     pglite@0.2.17 -> server_version_num 160004
 *     pglite@0.3.8  -> server_version_num 170005
 *     pglite@0.4.6  -> server_version_num 170005
 *     pglite@0.5.4  -> server_version_num 180003
 *
 * PG16 is the floor of what is available, so the narrowest possible gap is still
 * one major. This harness therefore proves that the migrations REPLAY and that
 * the isolation rules HOLD; it cannot prove that a behaviour which changed
 * between 15 and 18 behaves on production the way it behaves here. The repo
 * already documents one such difference — 20260803120000 section 7b, on how OLD
 * behaves inside an INSERT trigger — so this is a real class, not a theoretical
 * one. `migrations.test.ts` asserts the floor and prints the gap, so it stays
 * visible instead of becoming an assumption.
 *
 * The honest way to close it is from the other end: move the Supabase project to
 * a newer major, at which point the harness is testing the version that runs.
 */

import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolved from this file rather than hardcoded, because the version of this
 * harness that lived in a scratchpad carried an absolute path into a worktree
 * and would have silently tested nothing the moment the worktree went away.
 */
export const MIGRATIONS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations'
);

/**
 * Everything Supabase puts in place before the first migration runs.
 *
 * Deliberately faithful rather than convenient. In particular the
 * `alter default privileges` lines are load-bearing: several migrations exist
 * ONLY to revoke an execute grant by name, and a harness without those defaults
 * would agree happily with a migration that had forgotten to.
 */
const BOOTSTRAP = `
-- The three PostgREST roles.
create role anon nologin;
create role authenticated nologin;
-- BYPASSRLS mirrors a real Supabase project: the service role reads straight through.
create role service_role nologin bypassrls;

grant usage on schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to service_role;

-- The auth schema, as much of it as this schema touches.
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

-- Supabase's own definition, verbatim in behaviour: identity comes from the JWT
-- claim the request carries, and nothing else.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    ),
    ''
  )::uuid;
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;
`;

/**
 * What a column can hold coming back from Postgres.
 *
 * A union rather than `any`, because there is no `any` anywhere in this repo's
 * non-test source and a test harness is a poor place to introduce the first one.
 * It is wide enough that reading a row needs no cast and narrow enough that
 * arithmetic on a column still has to say which type it expects.
 */
export type SqlValue = string | number | boolean | null | Date | Record<string, unknown> | unknown[];
export type Row = Record<string, SqlValue>;

export interface Booted {
  readonly db: PGlite;
  /** The migration filenames replayed, in the order they ran. */
  readonly files: readonly string[];
}

export interface BootOptions {
  /**
   * Stop after this filename. Lets a suite run identically against the schema as
   * it was before a migration and as it is after, which is how the brand
   * isolation suite shows what the namespacing migration actually changed.
   */
  readonly through?: string | null;
}

export async function boot({ through = null }: BootOptions = {}): Promise<Booted> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec('create extension if not exists pgcrypto;');
  await db.exec(BOOTSTRAP);

  let files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  if (through) files = files.filter((f) => f <= through);

  for (const file of files) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    } catch (error) {
      throw new Error(`migration ${file} failed: ${(error as Error).message}`);
    }
  }
  return { db, files };
}

/**
 * Speak as this user, exactly as PostgREST would: the `authenticated` role plus
 * the JWT claim `auth.uid()` reads.
 *
 * Both claim shapes are set because Supabase has used both over time and
 * `auth.uid()` above reads either; setting one and not the other would make a
 * policy pass here for a reason it would not pass in production. The reset is in
 * a `finally` so a failing assertion cannot leak the role into the next check.
 */
export async function asUser<T>(db: PGlite, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`
    set role authenticated;
    select set_config('request.jwt.claim.sub', '${userId}', false);
    select set_config('request.jwt.claim.role', 'authenticated', false);
    select set_config('request.jwt.claims', '{"sub":"${userId}","role":"authenticated"}', false);
  `);
  try {
    return await fn();
  } finally {
    await resetRole(db);
  }
}

export async function asAnon<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
  await db.exec(`
    set role anon;
    select set_config('request.jwt.claim.role', 'anon', false);
    select set_config('request.jwt.claims', '{"role":"anon"}', false);
  `);
  try {
    return await fn();
  } finally {
    await resetRole(db);
  }
}

export async function asServiceRole<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
  await db.exec(`
    set role service_role;
    select set_config('request.jwt.claim.role', 'service_role', false);
    select set_config('request.jwt.claims', '{"role":"service_role"}', false);
  `);
  try {
    return await fn();
  } finally {
    await resetRole(db);
  }
}

async function resetRole(db: PGlite): Promise<void> {
  await db.exec(`
    reset role;
    select set_config('request.jwt.claim.sub', '', false);
    select set_config('request.jwt.claim.role', '', false);
    select set_config('request.jwt.claims', '', false);
  `);
}

export interface Attempt {
  readonly ok: boolean;
  readonly rows: Row[];
  readonly count: number;
  readonly code: string | null;
  readonly hint: string | null;
  readonly message: string;
}

/**
 * Try something and report what happened, never throw.
 *
 * These tests care about three different outcomes and a bare `rejects.toThrow`
 * collapses two of them: refused-by-policy, refused-for-another-reason, and
 * succeeded-but-touched-nothing. An UPDATE that RLS filters to zero rows does
 * not raise — it reports zero — and reading that as "refused" would let a policy
 * that silently matched nothing look identical to one that correctly said no.
 */
export async function attempt(fn: () => Promise<unknown>): Promise<Attempt> {
  try {
    const result = (await fn()) as { rows?: Row[] } | undefined;
    const rows = result?.rows ?? [];
    return { ok: true, rows, count: rows.length, code: null, hint: null, message: '' };
  } catch (error) {
    const e = error as { code?: string; hint?: string; message?: string; cause?: { code?: string; hint?: string } };
    return {
      ok: false,
      rows: [],
      count: 0,
      code: e.code ?? e.cause?.code ?? null,
      hint: e.hint ?? e.cause?.hint ?? null,
      message: String(e.message ?? error)
    };
  }
}

/**
 * Where the domain tables live right now.
 *
 * The isolation suite runs identically before and after the namespacing
 * migration and only the qualified name changes, so the suite asks rather than
 * assumes. A suite that hardcoded `public.products` would pass after the move by
 * testing a table that no longer holds anything.
 */
export async function domainSchema(db: PGlite): Promise<string> {
  const r = await db.query<{ nspname: string }>(
    `select n.nspname from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where c.relname = 'products' and c.relkind = 'r'
        and n.nspname in ('public', 'batchlabel')
      limit 1`
  );
  return r.rows[0]?.nspname ?? 'public';
}

export interface CheckResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

/**
 * Collects results instead of asserting immediately, so vitest can report one
 * named test per check.
 *
 * The scenario has to run as one sequence — these are stateful database
 * interactions where check 40 depends on the writes made by check 12 — but a
 * single `it()` wrapping all of it would report "1 failed" and hide which of 53
 * things broke. So the scenario runs once at module load and each collected
 * result becomes its own test.
 *
 * An instance per suite rather than module-level counters: two suites sharing a
 * module-level tally would report each other's failures.
 */
export class Checks {
  private readonly results: CheckResult[] = [];

  /**
   * `detail` is deliberately wide: most callers pass a Postgres error code or a
   * column straight through, and those are `string | null` or a `SqlValue`.
   * Forcing each call site to coerce would add noise to 110 of them to satisfy a
   * field that only ever ends up inside a template literal.
   */
  check(name: string, ok: boolean, detail: SqlValue | undefined = ''): void {
    this.results.push({ name, ok: Boolean(ok), detail: detail === null || detail === undefined ? '' : String(detail) });
  }

  all(): readonly CheckResult[] {
    return this.results;
  }
}
