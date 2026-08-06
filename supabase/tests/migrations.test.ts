// @vitest-environment node
/**
 * The migration chain itself: does it replay, does it replay TWICE, and are we
 * testing it on a Postgres close enough to production for the answer to mean
 * something.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { boot, MIGRATIONS_DIR, type Booted } from './harness';

/**
 * One boot for the whole file. Replaying the chain is ~3 seconds, so a boot per
 * test turns a four-test file into fifteen — which is how a suite becomes the
 * thing somebody skips.
 */
describe('the migration chain', () => {
  let booted: Booted;
  beforeAll(async () => {
    booted = await boot();
  });
  afterAll(async () => {
    await booted?.db.close();
  });

  it('replays from empty', () => {
    expect(booted.files.length).toBeGreaterThan(0);
  });

  /**
   * NO TWO MIGRATIONS MAY SHARE A VERSION, and this harness is structurally unable to
   * notice on its own.
   *
   * Supabase records what it has applied in `supabase_migrations.schema_migrations`, keyed on
   * VERSION — the timestamp prefix alone, not the filename. Two files named `20260805120000_x`
   * and `20260805120000_y` are two different migrations to git, to this suite and to a code
   * review, and one single row to that table. The second one to be pushed fails on the primary
   * key while applying, taking its own DDL down with it.
   *
   * That is exactly what happened to `20260805120000_member_roles_and_seats.sql`. It passed
   * 628 checks here, passed CI, merged, and then could not be applied to the real database at
   * all: `supabase db push` reported a failure at the INSERT into schema_migrations, and the
   * whole team feature was live in the app with nothing behind it. Nothing in this file could
   * see it, because the harness reads the directory and sorts, so a duplicate version is just
   * two files that happen to sort adjacently and replay perfectly.
   *
   * The rename to 20260806120000 fixed the instance. This stops the next one, which would
   * otherwise be found the same way: in production, by hand, after merge.
   */
  it('gives every migration a unique version, which is the timestamp prefix alone', () => {
    const byVersion = new Map<string, string[]>();
    for (const file of booted.files) {
      const version = file.split('_')[0];
      byVersion.set(version, [...(byVersion.get(version) ?? []), file]);
    }

    const collisions = [...byVersion.entries()].
      filter(([, files]) => files.length > 1).
      map(([version, files]) => `${version}: ${files.join(' + ')}`);

    expect(
      collisions,
      'these migrations share a version. Supabase keys schema_migrations on the timestamp ' +
      'prefix, so only one of each pair can ever be recorded and the other fails to apply ' +
      'against a real database while passing everything here. Renaming one to the next free ' +
      'timestamp is the whole fix.'
    ).toEqual([]);
  });

  /**
   * Idempotency is not a nicety here. Every migration in this repo claims to be
   * re-runnable, `supabase db push` can re-apply, and a second application is
   * what found the defect where re-running 20260803120000 recreated empty decoy
   * tables in `public` and silently repointed the read surface at them.
   *
   * Runs against the already-replayed database above, which is exactly the
   * second application it is testing.
   */
  it('replays twice, and the second pass raises nothing', async () => {
    for (const file of booted.files) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      await expect(
        booted.db.exec(sql),
        `${file} is not idempotent — a second application raised`
      ).resolves.toBeDefined();
    }
  });
});

/**
 * These need a Postgres, not the schema, so they skip the chain entirely — a
 * bare PGlite answers `show server_version_num` in milliseconds.
 */
describe('the Postgres this is proved on', () => {
  let db: PGlite;
  let version: number;
  beforeAll(async () => {
    db = new PGlite();
    const { rows } = await db.query<{ server_version_num: string }>('show server_version_num');
    version = Number(rows[0].server_version_num);
  });
  afterAll(async () => {
    await db?.close();
  });
  /**
   * `security_invoker` on a view arrived in PostgreSQL 15 and three migrations
   * depend on it, so 15 is the floor below which the chain does not merely fail
   * a test — it means something different.
   */
  it('is at least 15, which is what security_invoker needs', () => {
    expect(version).toBeGreaterThanOrEqual(150000);
  });

  /**
   * NOT an assertion that the versions match, because they cannot: no PGlite
   * build ships PG15 (0.2.x is PG16, 0.3.x and 0.4.x are PG17, 0.5.x is PG18),
   * so the narrowest available gap is still one major. This test exists to keep
   * the gap VISIBLE — it prints both numbers on every run, so nobody reads a
   * green suite as "proved on production's Postgres".
   *
   * It fails only if config.toml stops declaring a version at all, which would
   * mean the comparison had quietly stopped being made.
   */
  it('is compared against the version config.toml declares, and the gap is reported', () => {
    const config = readFileSync(join(MIGRATIONS_DIR, '..', 'config.toml'), 'utf8');
    const declared = /^\s*major_version\s*=\s*(\d+)/m.exec(config);
    if (!declared) {
      throw new Error('supabase/config.toml no longer declares major_version — the comparison this test exists to make is no longer possible');
    }

    const harnessMajor = Math.floor(version / 10000);
    const projectMajor = Number(declared[1]);

    if (harnessMajor !== projectMajor) {
      console.warn(
        `\n  SQL tests run on PostgreSQL ${harnessMajor}; the linked Supabase project declares ` +
        `${projectMajor}.\n  No PGlite build ships ${projectMajor}, so this gap cannot be closed by ` +
        `pinning.\n  A behaviour that changed between the two is not covered here — see ` +
        `20260803120000 section 7b\n  for one this schema already depends on.\n`
      );
    }
    expect(harnessMajor).toBeGreaterThanOrEqual(15);
  });
});
