// @vitest-environment node
// DOES A SIBLING BRAND'S USER ALREADY FAIL TO REACH BATCHLABEL'S DATA?
//
// Not read from the SQL — run against a real Postgres, as a real signed-in user,
// through the same role and the same JWT claim PostgREST would set.
//
// Two brands in one project. Attacker (stockroom) tries every verb against the
// victim's (batchlabel) rows, every helper with the victim's ids, every view and
// every RPC, plus the trigger-before-RLS shape that produced the last leak.
import { describe, expect, it } from 'vitest';
import { asAnon, asServiceRole, asUser, attempt, boot, Checks, type Row, domainSchema, type CheckResult } from './harness';

/**
 * The suite runs twice: once against the chain stopped before the namespacing
 * migration, once against all of it. Both runs are expected to pass — the
 * difference is in WHAT they assert. Where the schema behaves differently, the
 * check branches on `before` and states the old behaviour and the new one
 * separately, so the pair is a record of what changed rather than a fix with no
 * evidence of what it fixed.
 */
async function run(before: boolean): Promise<readonly CheckResult[]> {
  const checks = new Checks();
  const { db } = await boot(before ? { through: '20260803120000_account_data_schema.sql' } : {});
  const S = await domainSchema(db);


  // ---------------------------------------------------------------------------
  // A second brand. This is all it takes today, which is itself part of the finding.
  // ---------------------------------------------------------------------------
  await db.exec(`
    insert into public.brands (slug, name, domain)
    values ('stockroom', 'Stockroom', 'stockroom.example')
    on conflict (slug) do nothing;
  `);

  async function signup(email: string, brand: string, business: string): Promise<string> {
    const r = await db.query<Row>(
      `insert into auth.users (email, raw_user_meta_data)
       values ($1, jsonb_build_object(
         'brand', $2::text,
         'business_name', $3::text,
         'consents', jsonb_build_object('terms', jsonb_build_object('accepted', true, 'version', 'v1'))
       ))
       returning id`,
      [email, brand, business]
    );
    return String(r.rows[0].id);
  }

  const victim   = await signup('maker@batchlabel.test',  'batchlabel', 'Victim Candles Ltd');
  const attacker = await signup('thief@stockroom.test',   'stockroom',  'Attacker Stock Ltd');
  const sibling  = await signup('other@batchlabel.test',  'batchlabel', 'Other Candles Ltd');

  const acct = async (u: string): Promise<string> =>
    String((await db.query<Row>('select id from public.accounts where owner_user_id = $1', [u])).rows[0].id);

  const victimAcct   = await acct(victim);
  const attackerAcct = await acct(attacker);
  const siblingAcct  = await acct(sibling);

  console.log('victim account  ', victimAcct);
  console.log('attacker account', attackerAcct);

  // Give the victim real data, and a paid allowance so the meter has something to leak.
  await db.exec(`
    update public.brand_memberships
       set plan = 'maker', plan_status = 'active', sku_limit = 5,
           current_period_end = now() + interval '30 days'
     where user_id = '${victim}';
  `);
  const victimSpec = (await db.query<Row>(
    `insert into ${S}.specifications (account_id, name, category_id, kind, fragrance_id, load)
     values ($1, 'Victim Secret Formula', 'home-fragrance', 'mixture', 'frg-secret', 8.5)
     returning id`,
    [victimAcct]
  )).rows[0].id as string;

  const victimProduct = (await db.query<Row>(
    `insert into ${S}.products (account_id, specification_id, name, sku, net_quantity, net_unit)
     values ($1, $2, 'Victim Candle 200ml', 'VIC-200', 200, 'ml') returning id`,
    [victimAcct, victimSpec]
  )).rows[0].id as string;

  console.log('\n=== 1. CROSS-BRAND READS (attacker on stockroom -> batchlabel rows) ===');
  await asUser(db, attacker, async () => {
    const p = await attempt(() => db.query<Row>(`select * from ${S}.products`));
    checks.check('SELECT products returns no victim row', p.ok && p.rows.every((r) => r.account_id !== victimAcct),
      p.ok ? `saw ${p.count} row(s)` : p.message);

    const pById = await attempt(() => db.query<Row>(`select * from ${S}.products where id = $1`, [victimProduct]));
    checks.check('SELECT products by victim id returns nothing', pById.ok && pById.count === 0,
      pById.ok ? `${pById.count} row(s)` : pById.message);

    const s = await attempt(() => db.query<Row>(`select * from ${S}.specifications where account_id = $1`, [victimAcct]));
    checks.check('SELECT specifications by victim account returns nothing', s.ok && s.count === 0,
      s.ok ? `${s.count} row(s)` : s.message);

    const a = await attempt(() => db.query<Row>('select * from public.accounts where id = $1', [victimAcct]));
    checks.check('SELECT accounts by victim id returns nothing', a.ok && a.count === 0,
      a.ok ? `${a.count} row(s)` : a.message);

    const am = await attempt(() => db.query<Row>('select * from public.account_members where account_id = $1', [victimAcct]));
    checks.check('SELECT account_members of victim returns nothing', am.ok && am.count === 0,
      am.ok ? `${am.count} row(s)` : am.message);

    const bm = await attempt(() => db.query<Row>('select * from public.brand_memberships'));
    checks.check('SELECT brand_memberships returns only own row',
      bm.ok && bm.rows.every((r) => r.user_id === attacker),
      bm.ok ? `${bm.count} row(s), users ${[...new Set(bm.rows.map((r) => r.user_id))].join(',')}` : bm.message);

    const pr = await attempt(() => db.query<Row>('select * from public.profiles'));
    checks.check('SELECT profiles returns only own row', pr.ok && pr.rows.every((r) => r.id === attacker),
      pr.ok ? `${pr.count} row(s)` : pr.message);

    const ce = await attempt(() => db.query<Row>('select * from public.consent_events'));
    checks.check('SELECT consent_events returns only own rows', ce.ok && ce.rows.every((r) => r.user_id === attacker),
      ce.ok ? `${ce.count} row(s)` : ce.message);

    const swe = await attempt(() => db.query<Row>('select * from public.stripe_webhook_events'));
    checks.check('SELECT stripe_webhook_events is refused outright', !swe.ok, swe.ok ? `${swe.count} row(s)` : swe.code);
  });

  console.log('\n=== 2. CROSS-BRAND WRITES — each verb separately ===');
  await asUser(db, attacker, async () => {
    const ins = await attempt(() => db.query<Row>(
      `insert into ${S}.products (account_id, specification_id, name)
       values ($1, $2, 'Planted By Attacker')`, [victimAcct, victimSpec]));
    checks.check('INSERT product into victim account is refused', !ins.ok, ins.ok ? 'INSERT SUCCEEDED' : `${ins.code}`);

    const insSpec = await attempt(() => db.query<Row>(
      `insert into ${S}.specifications (account_id, name, category_id)
       values ($1, 'Planted Spec', 'home-fragrance')`, [victimAcct]));
    checks.check('INSERT specification into victim account is refused', !insSpec.ok,
      insSpec.ok ? 'INSERT SUCCEEDED' : `${insSpec.code}`);

    const upd = await attempt(() => db.query<Row>(
      `update ${S}.products set name = 'Owned' where id = $1 returning id`, [victimProduct]));
    checks.check('UPDATE victim product reaches no rows', upd.ok && upd.count === 0,
      upd.ok ? `${upd.count} row(s) updated` : upd.message);

    const updSpec = await attempt(() => db.query<Row>(
      `update ${S}.specifications set name = 'Owned' where id = $1 returning id`, [victimSpec]));
    checks.check('UPDATE victim specification reaches no rows', updSpec.ok && updSpec.count === 0,
      updSpec.ok ? `${updSpec.count} row(s) updated` : updSpec.message);

    const del = await attempt(() => db.query<Row>(
      `delete from ${S}.products where id = $1 returning id`, [victimProduct]));
    checks.check('DELETE victim product reaches no rows', del.ok && del.count === 0,
      del.ok ? `${del.count} row(s) deleted` : del.message);

    const delSpec = await attempt(() => db.query<Row>(`delete from ${S}.specifications where id = $1`, [victimSpec]));
    checks.check('DELETE on specifications has no grant at all', !delSpec.ok, delSpec.ok ? 'DELETE ALLOWED' : delSpec.code);

    const bmUpd = await attempt(() => db.query<Row>(
      `update public.brand_memberships set sku_limit = 99999 where user_id = $1`, [attacker]));
    checks.check('UPDATE own brand_membership (self-granted allowance) is refused', !bmUpd.ok,
      bmUpd.ok ? 'SELF-GRANT SUCCEEDED' : bmUpd.code);

    const acctIns = await attempt(() => db.query<Row>(
      `insert into public.accounts (brand_slug, owner_user_id, name)
       values ('batchlabel', $1, 'Minted')`, [attacker]));
    checks.check('INSERT into accounts (minting a second allowance) is refused', !acctIns.ok,
      acctIns.ok ? 'MINT SUCCEEDED' : acctIns.code);

    const amIns = await attempt(() => db.query<Row>(
      `insert into public.account_members (account_id, user_id, role) values ($1, $2, 'owner')`,
      [victimAcct, attacker]));
    checks.check('INSERT into account_members (joining victim account) is refused', !amIns.ok,
      amIns.ok ? 'JOIN SUCCEEDED' : amIns.code);
  });

  console.log('\n=== 2b. SAME-BRAND, DIFFERENT ACCOUNT — the harder case ===');
  // The stockroom attacker cannot even hold a Batchlabel row after namespacing, so the
  // account-boundary tests that need the attacker to OWN something run as a second
  // BATCHLABEL customer. This is the attack that stays possible in principle for ever:
  // same brand, same tables, different account.
  await asUser(db, sibling, async () => {
    const mySpec = (await db.query<Row>(
      `insert into ${S}.specifications (account_id, name, category_id)
       values ($1, 'Sibling Spec', 'home-fragrance') returning id`, [siblingAcct])).rows[0].id;
    const myProd = (await db.query<Row>(
      `insert into ${S}.products (account_id, specification_id, name)
       values ($1, $2, 'Sibling Product') returning id`, [siblingAcct, mySpec])).rows[0].id;

    const readVictim = await attempt(() => db.query<Row>(
      `select * from ${S}.products where account_id = $1`, [victimAcct]));
    checks.check('a same-brand neighbour reads none of the victim\'s products',
      readVictim.ok && readVictim.count === 0, readVictim.ok ? `${readVictim.count} row(s)` : readVictim.message);

    const move = await attempt(() => db.query<Row>(
      `update ${S}.products set account_id = $1 where id = $2 returning id`, [victimAcct, myProd]));
    checks.check('UPDATE moving own product into the victim account is refused', !move.ok,
      move.ok ? 'MOVE SUCCEEDED' : move.code);

    // The composite (specification_id, account_id) foreign key: a product may never point
    // at another account's composition, even inside one brand.
    const crossFk = await attempt(() => db.query<Row>(
      `insert into ${S}.products (account_id, specification_id, name)
       values ($1, $2, 'Cross-account reference')`, [siblingAcct, victimSpec]));
    checks.check('INSERT product referencing the victim\'s specification is refused', !crossFk.ok,
      crossFk.ok ? 'CROSS-ACCOUNT FK ACCEPTED' : crossFk.code);

    // created_by is the database's answer, not the client's (section 7b of 20260803120000).
    const forged = await attempt(() => db.query<Row>(
      `insert into ${S}.specifications (account_id, name, category_id, created_by)
       values ($1, 'Forged attribution', 'home-fragrance', $2) returning created_by`,
      [siblingAcct, victim]));
    checks.check('created_by cannot be forged onto another user',
      forged.ok && forged.rows[0].created_by === sibling,
      forged.ok ? `created_by = ${forged.rows[0].created_by}` : forged.message);
  });

  console.log('\n=== 3. SECURITY DEFINER HELPERS, CALLED WITH THE OTHER BRAND\'S IDS ===');
  await asUser(db, attacker, async () => {
    const m = await attempt(() => db.query<Row>('select public.is_member_of($1) as v', [victimAcct]));
    checks.check('is_member_of(victim account) is false', m.ok && m.rows[0].v === false,
      m.ok ? String(m.rows[0].v) : m.message);

    const c = await attempt(() => db.query<Row>('select public.current_account_id() as v'));
    checks.check('current_account_id() returns only my own account',
      c.ok && c.rows[0].v === attackerAcct, c.ok ? String(c.rows[0].v) : c.message);

    const l = await attempt(() => db.query<Row>('select public.account_sku_limit($1) as v', [victimAcct]));
    checks.check('account_sku_limit(victim account) is not executable by authenticated', !l.ok,
      l.ok ? `LEAKED ${l.rows[0].v}` : l.code);

    const ens = await attempt(() => db.query<Row>(
      `select public.ensure_account($1, 'batchlabel', 'x') as v`, [victim]));
    checks.check('ensure_account is not executable by authenticated', !ens.ok,
      ens.ok ? 'EXECUTED' : ens.code);

    const ase = await attempt(() => db.query<Row>(
      `select public.apply_stripe_entitlement('evt_x','customer.subscription.updated', now(), 'batchlabel',
         $1, null, null, 'consultant', 'active', null, null, null, null, '{}'::jsonb, 2147483647, 50) as v`,
      [victim]));
    checks.check('apply_stripe_entitlement is not callable by authenticated', !ase.ok,
      ase.ok ? `EXECUTED -> ${ase.rows[0].v}` : ase.code);

    const enf = await attempt(() => db.query<Row>('select public.enforce_sku_limit()'));
    checks.check('enforce_sku_limit() is not directly callable', !enf.ok, enf.ok ? 'CALLED' : enf.code);

    const req = await attempt(() => db.query<Row>('select public.require_account_id()'));
    checks.check('require_account_id() is not directly callable', !req.ok, req.ok ? 'CALLED' : req.code);
  });

  console.log('\n=== 4. VIEWS AND RPCs — can a view re-expose what a policy blocked? ===');
  await asUser(db, attacker, async () => {
    const e = await attempt(() => db.query<Row>('select * from public.entitlements'));
    checks.check('entitlements view returns only my own row', e.ok && e.rows.every((r) => r.user_id === attacker),
      e.ok ? `${e.count} row(s)` : e.message);

    const eAll = await attempt(() => db.query<Row>(
      'select * from public.entitlements where user_id = $1', [victim]));
    checks.check('entitlements filtered to the victim returns nothing', eAll.ok && eAll.count === 0,
      eAll.ok ? `${eAll.count} row(s) — plan ${eAll.rows[0]?.plan}` : eAll.message);

    const g = await attempt(() => db.query<Row>(`select * from public.get_entitlement('batchlabel')`));
    checks.check('get_entitlement(batchlabel) from a stockroom user returns nothing',
      g.ok && g.count === 0, g.ok ? `${g.count} row(s)` : g.message);

    const gn = await attempt(() => db.query<Row>(`select * from public.get_entitlement(null)`));
    checks.check('get_entitlement(null) returns only my own brands',
      gn.ok && gn.rows.every((r) => r.brand === 'stockroom'),
      gn.ok ? gn.rows.map((r) => r.brand).join(',') : gn.message);

    // Every relation reachable in the schema, swept: does any of them show a victim id?
    const rels = await db.query<Row>(`
      select n.nspname, c.relname from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname in ('public','batchlabel') and c.relkind in ('r','v','m')
       order by 1,2`);
    const leaked = [];
    for (const { nspname, relname } of rels.rows) {
      const r = await attempt(() => db.query<Row>(`select * from ${nspname}.${relname}`));
      if (!r.ok) continue;
      for (const row of r.rows) {
        const vals = Object.values(row).map((v) => (v === null ? '' : String(v)));
        if (vals.includes(victim) || vals.includes(victimAcct) ||
            vals.includes(victimSpec) || vals.includes(victimProduct)) {
          leaked.push(`${nspname}.${relname}`);
          break;
        }
      }
    }
    checks.check('no relation in any schema leaks a victim id to the attacker', leaked.length === 0,
      leaked.join(', '));
  });

  console.log('\n=== 5. THE TRIGGER-BEFORE-RLS ORACLE (the shape of the last leak) ===');
  // Fill the victim to their limit so the meter WOULD raise if it were reachable.
  for (let i = 0; i < 4; i += 1) {
    await db.query<Row>(
      `insert into ${S}.products (account_id, specification_id, name, sku)
       values ($1, $2, $3, $4)`,
      [victimAcct, victimSpec, `Victim Filler ${i}`, `VIC-F${i}`]);
  }
  const liveCount = (await db.query<Row>(
    `select count(*)::int n from ${S}.products where account_id = $1 and archived_at is null`,
    [victimAcct])).rows[0].n;
  console.log(`  victim now holds ${liveCount} live SKUs against a limit of 5`);

  await asUser(db, attacker, async () => {
    const r = await attempt(() => db.query<Row>(
      `insert into ${S}.products (account_id, specification_id, name)
       values ($1, $2, 'oracle probe')`, [victimAcct, victimSpec]));
    checks.check('probing a FULL victim account gives a bare policy refusal, not the meter',
      !r.ok && r.hint !== 'sku_limit_reached' && r.code === '42501',
      r.ok ? 'INSERT SUCCEEDED' : `code=${r.code} hint=${r.hint} msg=${r.message.slice(0, 120)}`);

    checks.check('the refusal carries no victim count or allowance',
      !r.ok && !/live_sku_count|sku_limit=|already holds/.test(`${r.message} ${r.hint ?? ''}`),
      r.message?.slice(0, 160));

    // The mirror-image regression: the guard must not silence the meter for a legitimate member.
  });

  console.log('\n=== 5b. THE MIRROR-IMAGE REGRESSION: the meter still fires for a real member ===');
  await asUser(db, victim, async () => {
    const r = await attempt(() => db.query<Row>(
      `insert into ${S}.products (account_id, specification_id, name)
       values ($1, $2, 'one too many')`, [victimAcct, victimSpec]));
    checks.check('a legitimate member AT their limit is refused BY THE METER',
      !r.ok && r.hint === 'sku_limit_reached',
      r.ok ? 'INSERT SUCCEEDED — METER SILENCED' : `code=${r.code} hint=${r.hint}`);
  });

  console.log('\n=== 6. THE ANON KEY, UNAUTHENTICATED ===');
  await asAnon(db, async () => {
    for (const t of [`${S}.products`, `${S}.specifications`, 'public.accounts', 'public.account_members',
                     'public.brand_memberships', 'public.profiles', 'public.entitlements']) {
      const r = await attempt(() => db.query<Row>(`select * from ${t}`));
      checks.check(`anon cannot read ${t}`, !r.ok || r.count === 0, r.ok ? `${r.count} row(s)` : r.code);
    }
    const b = await attempt(() => db.query<Row>('select * from public.brands'));
    checks.check('anon CAN read brands (reference data, by design)', b.ok && b.count >= 2,
      b.ok ? `${b.count} row(s)` : b.code);
  });

  console.log('\n=== 7. IS BRAND ISOLATION ENFORCED, OR EMERGENT FROM ACCOUNT ISOLATION? ===');
  // The question the exploit above cannot answer by failing. Ask it directly.

  // (a) Can a stockroom account hold rows in the Batchlabel domain tables?
  await asUser(db, attacker, async () => {
    const s = await attempt(() => db.query<Row>(
      `insert into ${S}.specifications (account_id, name, category_id)
       values ($1, 'Widget bin location', 'home-fragrance') returning id`, [attackerAcct]));
    if (before) {
      checks.check('before: a STOCKROOM account CAN write into the shared specifications table',
        s.ok, s.ok ? 'yes — nothing scopes these tables to a brand' : s.code);
      if (s.ok) {
        const p = await attempt(() => db.query<Row>(
          `insert into ${S}.products (account_id, specification_id, name)
           values ($1, $2, 'Widget, 500 in stock') returning id`, [attackerAcct, s.rows[0].id]));
        checks.check('before: a STOCKROOM account CAN write into the shared products table',
          p.ok, p.ok ? 'yes' : p.code);
      }
    } else {
      checks.check('AFTER: a STOCKROOM account is REFUSED by the brand lock on specifications',
        !s.ok && s.code === '23503', s.ok ? 'WROTE ANYWAY' : `${s.code}`);
      const p = await attempt(() => db.query<Row>(
        `insert into ${S}.products (account_id, specification_id, name)
         values ($1, $2, 'Widget, 500 in stock')`, [attackerAcct, victimSpec]));
      checks.check('AFTER: a STOCKROOM account is REFUSED by the brand lock on products',
        !p.ok, p.ok ? 'WROTE ANYWAY' : `${p.code}`);
    }
  });

  // (b) Does the Batchlabel SKU meter meter a stockroom account?
  const stockLimit = (await db.query<Row>(
    'select public.account_sku_limit($1) as v', [attackerAcct])).rows[0].v;
  checks.check('account_sku_limit() still answers for a SIBLING brand account (it never asks which brand)',
    stockLimit !== null,
    `sku_limit = ${stockLimit} — harmless after namespacing because the FK refuses the row anyway`);

  // (c) One person on two brands: what does an UNFILTERED read return?
  await db.query<Row>(
    `insert into public.brand_memberships (user_id, brand_slug, business_name)
     values ($1, 'stockroom', 'Victim Stock Ltd') on conflict do nothing`, [victim]);
  await asServiceRole(db, async () => {
    await db.query<Row>(`select public.ensure_account($1, 'stockroom', 'Victim Stock Ltd')`, [victim]);
  });
  const victimStockAcct = (await db.query<Row>(
    `select id from public.accounts where owner_user_id = $1 and brand_slug = 'stockroom'`,
    [victim])).rows[0].id;
  const stockWrite = await attempt(() => db.query<Row>(
    `insert into ${S}.specifications (account_id, name, category_id)
     values ($1, 'Stock item', 'home-fragrance') returning id`, [victimStockAcct]));

  if (before) {
    checks.check('before: the same person\'s STOCKROOM account can hold rows in the shared table',
      stockWrite.ok, stockWrite.ok ? 'yes' : stockWrite.code);
    await db.query<Row>(
      `insert into ${S}.products (account_id, specification_id, name)
       values ($1, $2, 'Stockroom widget')`, [victimStockAcct, stockWrite.rows[0].id]);
  } else {
    checks.check('AFTER: the same person\'s STOCKROOM account is refused by the brand lock',
      !stockWrite.ok && stockWrite.code === '23503',
      stockWrite.ok ? 'WROTE ANYWAY' : stockWrite.code);
  }

  await asUser(db, victim, async () => {
    const all = await attempt(() => db.query<Row>(`select account_id, name from ${S}.products`));
    const brands = new Set(all.rows.map((r) => (r.account_id === victimStockAcct ? 'stockroom' : 'batchlabel')));
    checks.check(before
        ? 'before: an UNFILTERED read by a two-brand user returns BOTH brands\' rows'
        : 'AFTER: an unfiltered read can only ever return Batchlabel rows',
      all.ok && (before ? brands.size === 2 : brands.size === 1 && !brands.has('stockroom')),
      all.ok ? `${all.count} row(s) across ${[...brands].join(' + ')}` : all.message);

    const cai = await attempt(() => db.query<Row>('select public.current_account_id() as v'));
    checks.check('current_account_id() goes NULL for a two-brand user (refuses to guess)',
      cai.ok && cai.rows[0].v === null, cai.ok ? String(cai.rows[0].v) : cai.message);

    const ins = await attempt(() => db.query<Row>(
      `insert into ${S}.products (specification_id, name) values ($1, 'no account named')`,
      [victimSpec]));
    checks.check('...and an insert that omits account_id then raises account_ambiguous',
      !ins.ok && ins.hint === 'account_ambiguous', `code=${ins.code} hint=${ins.hint}`);
  });

  // (d) Is there anything at all in the schema that mentions a brand on the domain tables?
  const brandRefs = await db.query<Row>(`
    select count(*)::int n from pg_policy p
      join pg_class c on c.oid = p.polrelid
     where c.relname in ('products','specifications')
       and pg_get_expr(coalesce(p.polqual, p.polwithcheck), p.polrelid) ilike '%brand%'`);
  checks.check('NO policy on products/specifications mentions a brand at all',
    brandRefs.rows[0].n === 0, `${brandRefs.rows[0].n} policy expression(s) mention brand`);


  await db.close();
  return checks.all();
}

const after = await run(false);

describe(`brand isolation, on the schema as it ships (${after.length} checks)`, () => {
  it.each([...after])('$name', ({ ok, name, detail }: CheckResult) => {
    expect(ok, `${name}${detail ? ` — ${detail}` : ''}`).toBe(true);
  });
});

/**
 * THE SAME SUITE, AGAINST THE SCHEMA AS IT WAS BEFORE THE BRAND LOCK.
 *
 * The checks named `before:` are the interesting ones, and they PASS: they assert
 * that a sibling brand's account COULD write into the shared domain tables,
 * because its user was a member of its own account and no policy on either table
 * mentioned a brand at all. Isolation held only because nobody was yet a member
 * of two brands' accounts — which `account_members` and the deferred invite flow
 * exist to make false.
 *
 * Asserting the hole rather than merely fixing it is the point. Without this, the
 * brand lock reads like belt-and-braces over rules that already worked, and the
 * next person to find a foreign key inconvenient has no reason not to drop it.
 */
const before = await run(true);

describe(`the same schema before the brand lock (${before.length} checks)`, () => {
  it.each([...before])('$name', ({ ok, name, detail }: CheckResult) => {
    expect(ok, `${name}${detail ? ` — ${detail}` : ''}`).toBe(true);
  });
});

describe('the before/after pair is doing what it claims', () => {
  /**
   * Guards the guard. If somebody deletes the `before:` branches, every remaining
   * assertion still passes and the suite silently stops recording that the hole
   * was ever there — which is exactly how a fix comes to look unnecessary.
   */
  it('still records that a sibling brand could write into the shared tables', () => {
    const holeChecks = before.filter((c) => /^before: a STOCKROOM account CAN write/.test(c.name));
    expect(
      holeChecks.map((c) => c.name),
      'the checks that document the pre-lock hole have gone missing'
    ).toHaveLength(2);
  });

  it('and that the brand lock refuses the same write afterwards', () => {
    const refusals = after.filter((c) => /^AFTER: .*REFUSED by the brand lock/.test(c.name));
    expect(
      refusals.map((c) => c.name),
      'the checks that prove the lock refuses a cross-brand write have gone missing'
    ).not.toHaveLength(0);
  });
});
