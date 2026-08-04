// @vitest-environment node
// THE SIXTEEN TABLES 20260804130000 ADDS, ATTACKED BY TWO STRANGERS.
//
// Not read from the SQL. Run against a real Postgres, as real signed-in users, through the
// same role and the same JWT claim PostgREST sets — because the two isolation bugs this
// schema has actually had were both invisible to a one-user test (harness.ts says which).
//
// Three identities:
//   victim    a Batchlabel maker who owns a row in every new table
//   neighbour a SECOND Batchlabel maker. The attack that stays possible in principle for
//             ever: same brand, same tables, different account. RLS is the only thing
//             between them.
//   attacker  a maker on a SIBLING BRAND (stockroom). The brand lock — a composite foreign
//             key, not a policy — is what refuses them, which is why it also refuses
//             service_role and the table owner.
//
// Every verb is attempted SEPARATELY. `attempt()` distinguishes refused-by-policy from
// succeeded-but-touched-nothing, because an UPDATE that RLS filters to zero rows does not
// raise, and reading that as "refused" would let a policy that silently matched nothing
// look identical to one that correctly said no.
import { describe, expect, it } from 'vitest';
import { asAnon, asServiceRole, asUser, attempt, boot, Checks, type CheckResult, type Row } from './harness';

/** Every account-scoped table this migration adds, with a row each identity can aim at. */
interface TableUnderTest {
  readonly name: string;
  /** Insert into an account, given (accountId, ownerScopedIds). Returns the SQL and params. */
  readonly insert: (acct: string, ids: Ids) => readonly [string, unknown[]];
  /** A harmless UPDATE of one row by id. */
  readonly update: (id: string) => readonly [string, unknown[]];
}

interface Ids {
  material: string;
  spec: string;
  product: string;
  artefact: string;
  event: string;
}

const TABLES: readonly TableUnderTest[] = [
  {
    name: 'materials',
    insert: (a) => [`insert into batchlabel.materials (account_id, material_class, name)
                     values ($1, 'ingredient', 'Planted') returning id`, [a]],
    update: (id) => [`update batchlabel.materials set name = 'Owned' where id = $1 returning id`, [id]]
  },
  {
    name: 'material_hazards',
    insert: (a, i) => [`insert into batchlabel.material_hazards
                        (account_id, material_id, code, statement, hazard_class)
                        values ($1, $2, 'H999', 'Planted.', 'Planted 1') returning id`, [a, i.material]],
    update: (id) => [`update batchlabel.material_hazards set code = 'H000' where id = $1 returning id`, [id]]
  },
  {
    name: 'material_allergens',
    insert: (a, i) => [`insert into batchlabel.material_allergens (account_id, material_id, name, pct)
                        values ($1, $2, 'planted', 9.9) returning id`, [a, i.material]],
    update: (id) => [`update batchlabel.material_allergens set pct = 99 where id = $1 returning id`, [id]]
  },
  {
    name: 'material_ifra_limits',
    insert: (a, i) => [`insert into batchlabel.material_ifra_limits (account_id, material_id, category, max_pct)
                        values ($1, $2, 'Planted', 50) returning id`, [a, i.material]],
    update: (id) => [`update batchlabel.material_ifra_limits set max_pct = 1 where id = $1 returning id`, [id]]
  },
  {
    name: 'material_documents',
    insert: (a, i) => [`insert into batchlabel.material_documents (account_id, material_id, document_kind)
                        values ($1, $2, 'Test report') returning id`, [a, i.material]],
    update: (id) => [`update batchlabel.material_documents set notes = 'owned' where id = $1 returning id`, [id]]
  },
  {
    name: 'specification_material_pins',
    insert: (a, i) => [`insert into batchlabel.specification_material_pins
                        (account_id, specification_id, role, slot, material_id, pinned_name)
                        values ($1, $2, 'dye', 'planted', $3, 'Planted') returning id`, [a, i.spec, i.material]],
    update: (id) => [`update batchlabel.specification_material_pins set pinned_name = 'Owned' where id = $1 returning id`, [id]]
  },
  {
    name: 'artefacts',
    insert: (a, i) => [`insert into batchlabel.artefacts
                        (account_id, product_id, artefact_type, version, specification_hash)
                        values ($1, $2, 'carton', 99, 'planted') returning id`, [a, i.product]],
    update: (id) => [`update batchlabel.artefacts set is_placeholder = false where id = $1 returning id`, [id]]
  },
  {
    name: 'record_events',
    insert: (a) => [`insert into batchlabel.record_events (account_id, kind, summary)
                     values ($1, 'note', 'Planted') returning id`, [a]],
    update: (id) => [`update batchlabel.record_events set summary = 'Owned' where id = $1 returning id`, [id]]
  },
  {
    name: 'record_event_lots',
    insert: (a, i) => [`insert into batchlabel.record_event_lots (account_id, record_event_id, material_ref, lot)
                        values ($1, $2, 'planted', 'LOT-X') returning id`, [a, i.event]],
    update: (id) => [`update batchlabel.record_event_lots set lot = 'OWNED' where id = $1 returning id`, [id]]
  },
  {
    name: 'record_event_artefacts',
    insert: (a, i) => [`insert into batchlabel.record_event_artefacts (account_id, record_event_id, artefact_id)
                        values ($1, $2, $3) returning id`, [a, i.event, i.artefact]],
    update: (id) => [`update batchlabel.record_event_artefacts set artefact_id = artefact_id where id = $1 returning id`, [id]]
  },
  {
    name: 'business_identity',
    insert: (a) => [`insert into batchlabel.business_identity (account_id, registered_name)
                     values ($1, 'Planted Ltd') returning account_id as id`, [a]],
    update: (id) => [`update batchlabel.business_identity set registered_name = 'Owned Ltd'
                      where account_id = $1 returning account_id as id`, [id]]
  },
  {
    name: 'supplier_addresses',
    insert: (a) => [`insert into batchlabel.supplier_addresses (account_id, market, label, role, lines)
                     values ($1, 'NI', 'Planted', 'Planted', array['a','b','c']) returning id`, [a]],
    update: (id) => [`update batchlabel.supplier_addresses set label = 'Owned' where id = $1 returning id`, [id]]
  },
  {
    name: 'workspace_preferences',
    insert: (a) => [`insert into batchlabel.workspace_preferences (account_id) values ($1)
                     returning account_id as id`, [a]],
    update: (id) => [`update batchlabel.workspace_preferences set default_market = 'EU'
                      where account_id = $1 returning account_id as id`, [id]]
  },
  {
    name: 'account_data_requests',
    insert: (a) => [`insert into batchlabel.account_data_requests (account_id, kind)
                     values ($1, 'erasure') returning id`, [a]],
    update: (id) => [`update batchlabel.account_data_requests set status = 'completed', completed_at = now()
                      where id = $1 returning id`, [id]]
  }
];

/** The primary key column, because two tables are keyed on account_id. */
const PK = (t: string): string =>
  t === 'business_identity' || t === 'workspace_preferences' ? 'account_id' : 'id';

async function run(): Promise<readonly CheckResult[]> {
  const checks = new Checks();
  const { db } = await boot();

  await db.exec(`
    insert into public.brands (slug, name, domain)
    values ('stockroom', 'Stockroom', 'stockroom.example')
    on conflict (slug) do nothing;
  `);

  async function signup(email: string, brand: string, business: string): Promise<string> {
    const r = await db.query<Row>(
      `insert into auth.users (email, raw_user_meta_data)
       values ($1, jsonb_build_object(
         'brand', $2::text, 'business_name', $3::text,
         'consents', jsonb_build_object('terms', jsonb_build_object('accepted', true, 'version', 'v1'))))
       returning id`,
      [email, brand, business]
    );
    return String(r.rows[0].id);
  }

  const victim    = await signup('maker@batchlabel.test', 'batchlabel', 'Victim Candles Ltd');
  const neighbour = await signup('other@batchlabel.test', 'batchlabel', 'Neighbour Candles Ltd');
  const attacker  = await signup('thief@stockroom.test',  'stockroom',  'Attacker Stock Ltd');

  const acct = async (u: string): Promise<string> =>
    String((await db.query<Row>('select id from public.accounts where owner_user_id = $1', [u])).rows[0].id);

  const victimAcct    = await acct(victim);
  const neighbourAcct = await acct(neighbour);
  const attackerAcct  = await acct(attacker);

  // Room for the probe products under the SKU meter.
  await db.exec(`update public.brand_memberships set plan='maker', plan_status='active', sku_limit=5,
                 current_period_end = now() + interval '30 days';`);

  // ---------------------------------------------------------------------------
  // The victim fills every table, as themselves, through the same role PostgREST uses.
  // ---------------------------------------------------------------------------
  const ids: Ids = { material: '', spec: '', product: '', artefact: '', event: '' };
  const rowId: Record<string, string> = {};

  await asUser(db, victim, async () => {
    const one = async (sql: string, params: unknown[]): Promise<string> =>
      String((await db.query<Row>(sql, params)).rows[0].id);

    ids.material = await one(
      `insert into batchlabel.materials (account_id, material_class, name, supplier)
       values ($1, 'ingredient', 'Victim Secret Wax', 'Their supplier') returning id`, [victimAcct]);
    ids.spec = await one(
      `insert into batchlabel.specifications (account_id, name, category_id, kind, fragrance_id, load)
       values ($1, 'Victim Secret Formula', 'home-fragrance', 'mixture', 'frg-secret', 8.5) returning id`, [victimAcct]);
    ids.product = await one(
      `insert into batchlabel.products (account_id, specification_id, name, sku, net_quantity, net_unit)
       values ($1, $2, 'Victim Candle 200ml', 'VIC-200', 200, 'ml') returning id`, [victimAcct, ids.spec]);
    ids.artefact = await one(
      `insert into batchlabel.artefacts (account_id, product_id, artefact_type, version, specification_hash)
       values ($1, $2, 'unit-label', 1, 'v1hash') returning id`, [victimAcct, ids.product]);
    ids.event = await one(
      `insert into batchlabel.record_events (account_id, kind, summary, product_id)
       values ($1, 'note', 'Victim private note', $2) returning id`, [victimAcct, ids.product]);

    for (const t of TABLES) {
      if (t.name === 'record_events' || t.name === 'artefacts') { continue; }
      const [sql, params] = t.insert(victimAcct, ids);
      const r = await attempt(() => db.query<Row>(sql, params));
      checks.check(`victim can create their own ${t.name} row`, r.ok && r.count === 1,
        r.ok ? `${r.count} row(s)` : `${r.code} ${r.message}`);
      if (r.ok && r.count === 1) rowId[t.name] = String(r.rows[0].id);
    }
    rowId.record_events = ids.event;
    rowId.artefacts     = ids.artefact;
  });

  // ---------------------------------------------------------------------------
  // 1. SAME BRAND, DIFFERENT ACCOUNT. Every verb, every table, separately.
  // ---------------------------------------------------------------------------
  await asUser(db, neighbour, async () => {
    for (const t of TABLES) {
      const pk = PK(t.name);

      const sel = await attempt(() => db.query<Row>(
        `select * from batchlabel.${t.name} where account_id = $1`, [victimAcct]));
      checks.check(`neighbour SELECT ${t.name} of the victim returns nothing`,
        sel.ok && sel.count === 0, sel.ok ? `${sel.count} row(s)` : sel.message);

      const [isql, iparams] = t.insert(victimAcct, ids);
      const ins = await attempt(() => db.query<Row>(isql, iparams));
      checks.check(`neighbour INSERT into the victim's ${t.name} is refused`,
        !ins.ok, ins.ok ? 'INSERT SUCCEEDED' : String(ins.code));

      const target = rowId[t.name];
      const [usql, uparams] = t.update(target);
      const upd = await attempt(() => db.query<Row>(usql, uparams));
      checks.check(`neighbour UPDATE of the victim's ${t.name} row changes nothing`,
        !upd.ok || upd.count === 0, upd.ok ? `${upd.count} row(s) updated` : String(upd.code));

      const del = await attempt(() => db.query<Row>(
        `delete from batchlabel.${t.name} where ${pk} = $1 returning ${pk}`, [target]));
      checks.check(`neighbour DELETE of the victim's ${t.name} row removes nothing`,
        !del.ok || del.count === 0, del.ok ? `${del.count} row(s) deleted` : String(del.code));
    }

    // And the row is still there afterwards, read back by its owner rather than inferred
    // from the attacker's zero. "Nothing was deleted" and "I could not see it" are two
    // different facts and only the first one is the one being claimed.
    const survived = await db.query<Row>(
      `select count(*)::int n from batchlabel.materials where id = $1`, [ids.material]);
    checks.check('the victim\'s material is untouched after every neighbour verb',
      Number(survived.rows[0].n) === 0, 'neighbour still cannot see it');
  });

  await asServiceRole(db, async () => {
    const r = await db.query<Row>(
      `select count(*)::int n from batchlabel.materials where id = $1 and name = 'Victim Secret Wax'`,
      [ids.material]);
    checks.check('the victim\'s material row is genuinely still there and unrenamed',
      Number(r.rows[0].n) === 1, `${r.rows[0].n} row(s)`);
  });

  // ---------------------------------------------------------------------------
  // 2. CROSS-BRAND. The attacker writes into THEIR OWN account, which no amount of
  //    account-level RLS can refuse — the brand lock is a foreign key or it is nothing.
  // ---------------------------------------------------------------------------
  await asUser(db, attacker, async () => {
    for (const t of TABLES) {
      const [sql, params] = t.insert(attackerAcct, ids);
      const r = await attempt(() => db.query<Row>(sql, params));
      checks.check(`cross-brand INSERT into ${t.name} with the attacker's OWN account is refused`,
        !r.ok, r.ok ? 'STOCKROOM ROW LANDED IN BATCHLABEL' : String(r.code));
      if (!r.ok && ['materials', 'record_events', 'business_identity', 'supplier_addresses',
                    'workspace_preferences', 'account_data_requests'].includes(t.name)) {
        // These have no Batchlabel parent to fail on first, so the refusal must be the
        // brand lock itself: 23503, foreign_key_violation, at the storage layer.
        checks.check(`...and ${t.name} refuses it with a FOREIGN KEY violation, not a policy`,
          r.code === '23503', String(r.code));
      }
    }

    // THE ATTACK THE CHECK CONSTRAINT EXISTS FOR, and the one a foreign key alone does not
    // stop. brand_slug defaults to 'batchlabel', so the composite key (account_id,
    // brand_slug) cannot be satisfied by a stockroom account — UNLESS the attacker supplies
    // brand_slug themselves. Then (their account, 'stockroom') matches accounts(id,
    // brand_slug) perfectly and the foreign key is content. The CHECK pinning the column to
    // 'batchlabel' is the only thing between that request and a stockroom row sitting in
    // Batchlabel's record log. Attempted explicitly rather than assumed away.
    for (const t of ['materials', 'record_events', 'business_identity', 'supplier_addresses',
                     'workspace_preferences', 'account_data_requests']) {
      const cols: Record<string, string> = {
        materials:             `(account_id, brand_slug, material_class, name) values ($1, 'stockroom', 'ingredient', 'Planted')`,
        record_events:         `(account_id, brand_slug, kind, summary) values ($1, 'stockroom', 'note', 'Planted')`,
        business_identity:     `(account_id, brand_slug, registered_name) values ($1, 'stockroom', 'Planted Ltd')`,
        supplier_addresses:    `(account_id, brand_slug, market, label, role, lines) values ($1, 'stockroom', 'GB', 'P', 'P', array['a','b','c'])`,
        workspace_preferences: `(account_id, brand_slug) values ($1, 'stockroom')`,
        account_data_requests: `(account_id, brand_slug, kind) values ($1, 'stockroom', 'export')`
      };
      const r = await attempt(() => db.query<Row>(
        `insert into batchlabel.${t} ${cols[t]}`, [attackerAcct]));
      checks.check(`${t} refuses a row that SUPPLIES brand_slug = 'stockroom' to satisfy the foreign key`,
        !r.ok, r.ok ? 'STOCKROOM ROW LANDED IN BATCHLABEL' : String(r.code));
      checks.check(`...and ${t} refuses it with the CHECK, not the key (23514)`,
        r.code === '23514', String(r.code));
    }

    const sel = await attempt(() => db.query<Row>('select * from batchlabel.record_events'));
    checks.check('cross-brand SELECT of the record log returns nothing',
      sel.ok && sel.count === 0, sel.ok ? `${sel.count} row(s)` : sel.message);

    const view = await attempt(() => db.query<Row>(
      'select * from batchlabel.resolved_materials where account_id = $1', [victimAcct]));
    checks.check('cross-brand SELECT of resolved_materials returns none of the victim\'s',
      view.ok && view.count === 0, view.ok ? `${view.count} row(s)` : view.message);
  });

  // ---------------------------------------------------------------------------
  // 3. THE APPEND-ONLY RULE, from the session it is written against: the owner's own.
  //    A maker rewriting their own log is the case the trigger exists for — a stranger's
  //    write is already refused by RLS and proves nothing about append-only.
  // ---------------------------------------------------------------------------
  await asUser(db, victim, async () => {
    const upd = await attempt(() => db.query<Row>(
      `update batchlabel.record_events set summary = 'never happened' where id = $1`, [ids.event]));
    checks.check('the victim cannot UPDATE their OWN record_events row', !upd.ok,
      upd.ok ? `${upd.count} row(s) rewritten` : String(upd.code));

    const del = await attempt(() => db.query<Row>(
      `delete from batchlabel.record_events where id = $1`, [ids.event]));
    checks.check('the victim cannot DELETE their OWN record_events row', !del.ok,
      del.ok ? `${del.count} row(s) removed` : String(del.code));

    const lots = await attempt(() => db.query<Row>(
      `delete from batchlabel.record_event_lots where account_id = $1`, [victimAcct]));
    checks.check('nor the input lots hanging off it', !lots.ok,
      lots.ok ? `${lots.count} row(s) removed` : String(lots.code));

    const arte = await attempt(() => db.query<Row>(
      `delete from batchlabel.record_event_artefacts where account_id = $1`, [victimAcct]));
    checks.check('nor the artefact links that answer the recall question', !arte.ok,
      arte.ok ? `${arte.count} row(s) removed` : String(arte.code));

    // ...and the correction path the design offers instead actually works.
    const fix = await attempt(() => db.query<Row>(
      `insert into batchlabel.record_events (account_id, kind, summary)
       values ($1, 'note', 'Correcting the note above') returning id`, [victimAcct]));
    checks.check('a correcting entry CAN be appended, which is what a log offers instead',
      fix.ok && fix.count === 1, fix.ok ? 'appended' : String(fix.code));

    // A maker may not mark their own erasure done. The grant, not a policy, is what says so.
    const done = await attempt(() => db.query<Row>(
      `update batchlabel.account_data_requests set status = 'completed', completed_at = now()
       where account_id = $1`, [victimAcct]));
    checks.check('the victim cannot mark their own data request completed', !done.ok,
      done.ok ? `${done.count} row(s)` : String(done.code));

    const seen = await attempt(() => db.query<Row>(
      `select status from batchlabel.account_data_requests where account_id = $1`, [victimAcct]));
    checks.check('...but they CAN see it, so the screen has a fact to render',
      seen.ok && seen.count === 1 && seen.rows[0].status === 'requested',
      seen.ok ? String(seen.rows[0]?.status) : seen.message);
  });

  // ---------------------------------------------------------------------------
  // 4. THE SHIPPED CATALOGUE: readable by everyone, writable by nobody, and empty.
  // ---------------------------------------------------------------------------
  const empty = await db.query<Row>(`select
      (select count(*)::int from batchlabel.reference_materials)         as m,
      (select count(*)::int from batchlabel.reference_material_versions) as v`);
  checks.check('the reference catalogue ships EMPTY — no invented hazard data is seeded',
    Number(empty.rows[0].m) === 0 && Number(empty.rows[0].v) === 0,
    `${empty.rows[0].m} material(s), ${empty.rows[0].v} version(s)`);

  // We publish one, as the only role that can.
  let refMat = '';
  let refV1 = '';
  await asServiceRole(db, async () => {
    refMat = String((await db.query<Row>(
      `insert into batchlabel.reference_materials (slug, material_class, name, supplier)
       values ('ing-example-wax', 'ingredient', 'Example Soy Wax', 'Example Supplier') returning id`)).rows[0].id);
    refV1 = String((await db.query<Row>(
      `insert into batchlabel.reference_material_versions
         (reference_material_id, version, provenance, notes)
       values ($1, 1, 'illustrative-example', 'shape only') returning id`, [refMat])).rows[0].id);
  });

  const noDoc = await asServiceRole(db, () => attempt(() => db.query<Row>(
    `insert into batchlabel.reference_material_versions (reference_material_id, version, provenance)
     values ($1, 99, 'supplier-document')`, [refMat])));
  checks.check('a supplier-document provenance with NO named document is refused',
    !noDoc.ok, noDoc.ok ? 'PUBLISHED WITHOUT A DOCUMENT' : String(noDoc.code));

  await asUser(db, victim, async () => {
    const sel = await attempt(() => db.query<Row>('select * from batchlabel.reference_materials'));
    checks.check('a signed-in maker CAN read the shipped catalogue', sel.ok && sel.count === 1,
      sel.ok ? `${sel.count} row(s)` : sel.message);

    const ins = await attempt(() => db.query<Row>(
      `insert into batchlabel.reference_materials (slug, material_class, name)
       values ('planted', 'ingredient', 'Planted')`));
    checks.check('a maker CANNOT publish into the shipped catalogue', !ins.ok,
      ins.ok ? 'PUBLISHED' : String(ins.code));

    const upd = await attempt(() => db.query<Row>(
      `update batchlabel.reference_materials set name = 'Owned' where id = $1`, [refMat]));
    checks.check('a maker CANNOT rewrite the shipped catalogue', !upd.ok,
      upd.ok ? `${upd.count} row(s)` : String(upd.code));

    const del = await attempt(() => db.query<Row>(
      `delete from batchlabel.reference_materials where id = $1`, [refMat]));
    checks.check('a maker CANNOT delete from the shipped catalogue', !del.ok,
      del.ok ? `${del.count} row(s)` : String(del.code));

    const vIns = await attempt(() => db.query<Row>(
      `insert into batchlabel.reference_material_versions (reference_material_id, version, provenance)
       values ($1, 2, 'illustrative-example')`, [refMat]));
    checks.check('a maker CANNOT publish a reference VERSION either', !vIns.ok,
      vIns.ok ? 'PUBLISHED' : String(vIns.code));
  });

  // ---------------------------------------------------------------------------
  // 5. IMMUTABILITY, FROM THE MOST PRIVILEGED SESSION THERE IS.
  //    This is the whole answer to "what happens to a maker who built products on a shared
  //    row when we later update it". If service_role — which BYPASSRLS and owns nothing it
  //    cannot reach — is refused, everybody is.
  // ---------------------------------------------------------------------------
  await asServiceRole(db, async () => {
    const upd = await attempt(() => db.query<Row>(
      `update batchlabel.reference_material_versions set notes = 'silently corrected' where id = $1`, [refV1]));
    checks.check('service_role CANNOT update a published reference version', !upd.ok,
      upd.ok ? `${upd.count} row(s) REWRITTEN` : `${upd.code} ${upd.hint}`);
    checks.check('...and the refusal names itself (hint = reference_version_immutable)',
      upd.hint === 'reference_version_immutable', String(upd.hint));

    const del = await attempt(() => db.query<Row>(
      `delete from batchlabel.reference_material_versions where id = $1`, [refV1]));
    checks.check('service_role CANNOT delete a published reference version', !del.ok,
      del.ok ? `${del.count} row(s) REMOVED` : String(del.code));
  });

  // ---------------------------------------------------------------------------
  // 6. THE PRECEDENCE RULE, AND THE PIN THAT SURVIVES A NEW VERSION.
  // ---------------------------------------------------------------------------
  await asUser(db, victim, async () => {
    const before = await db.query<Row>(
      `select source, name from batchlabel.resolved_materials
        where account_id = $1 and reference_material_id = $2`, [victimAcct, refMat]);
    checks.check('with no override, the shipped row resolves and says so (source = reference)',
      before.rows.length === 1 && before.rows[0].source === 'reference',
      `${before.rows.length} row(s), source ${before.rows[0]?.source}`);
    checks.check('...and it carries its provenance, so a screen can label an example AS an example',
      (await db.query<Row>(`select provenance from batchlabel.resolved_materials
                             where account_id = $1 and reference_material_id = $2`,
        [victimAcct, refMat])).rows[0].provenance === 'illustrative-example', 'illustrative-example');

    // The maker overrides it.
    await db.query<Row>(
      `update batchlabel.materials set overrides_reference_id = $1, name = 'My Own Soy Wax'
        where id = $2`, [refMat, ids.material]);

    const after = await db.query<Row>(
      `select source, name from batchlabel.resolved_materials
        where account_id = $1 and reference_material_id = $2`, [victimAcct, refMat]);
    checks.check('THE MAKER\'S OWN ROW WINS: exactly one row resolves for an overridden material',
      after.rows.length === 1, `${after.rows.length} row(s)`);
    checks.check('...and it is theirs, not ours (source = account)',
      after.rows[0]?.source === 'account', String(after.rows[0]?.source));
    checks.check('...and it is their name that resolves',
      after.rows[0]?.name === 'My Own Soy Wax', String(after.rows[0]?.name));

    // The neighbour, who overrode nothing, still gets ours. Precedence is per account.
    const pin = await db.query<Row>(
      `insert into batchlabel.specification_material_pins
         (account_id, specification_id, role, reference_version_id, pinned_name)
       values ($1, $2, 'fragrance', $3, 'Example Soy Wax v1') returning id`,
      [victimAcct, ids.spec, refV1]);
    checks.check('a specification can pin ONE IMMUTABLE reference version',
      pin.rows.length === 1, 'pinned');

    const both = await attempt(() => db.query<Row>(
      `insert into batchlabel.specification_material_pins
         (account_id, specification_id, role, slot, material_id, reference_version_id, pinned_name)
       values ($1, $2, 'base', 'two', $3, $4, 'Both')`, [victimAcct, ids.spec, ids.material, refV1]));
    checks.check('a pin naming BOTH a material and a reference version is refused',
      !both.ok, both.ok ? 'AMBIGUOUS PIN ACCEPTED' : String(both.code));

    const neither = await attempt(() => db.query<Row>(
      `insert into batchlabel.specification_material_pins
         (account_id, specification_id, role, slot, pinned_name)
       values ($1, $2, 'base', 'none', 'Neither')`, [victimAcct, ids.spec]));
    checks.check('a pin naming NEITHER is refused too', !neither.ok,
      neither.ok ? 'EMPTY PIN ACCEPTED' : String(neither.code));
  });

  await asUser(db, neighbour, async () => {
    const r = await db.query<Row>(
      `select source from batchlabel.resolved_materials
        where account_id = $1 and reference_material_id = $2`, [neighbourAcct, refMat]);
    checks.check('the neighbour, who overrode nothing, still resolves OURS — precedence is per account',
      r.rows.length === 1 && r.rows[0].source === 'reference',
      `${r.rows.length} row(s), source ${r.rows[0]?.source}`);
  });

  // WE PUBLISH A CORRECTION. Nothing under the maker may move.
  const pinnedBefore = await asServiceRole(db, async () =>
    (await db.query<Row>(
      `select reference_version_id, pinned_name from batchlabel.specification_material_pins
        where specification_id = $1 and role = 'fragrance'`, [ids.spec])).rows[0]);

  await asServiceRole(db, async () => {
    await db.query<Row>(
      `insert into batchlabel.reference_material_versions
         (reference_material_id, version, provenance, document_reference, document_version, document_date, notes)
       values ($1, 2, 'supplier-document', 'REAL-SDS-1', '2.0', date '2026-08-04', 'corrected classification')`,
      [refMat]);
  });

  const pinnedAfter = await asServiceRole(db, async () =>
    (await db.query<Row>(
      `select reference_version_id, pinned_name from batchlabel.specification_material_pins
        where specification_id = $1 and role = 'fragrance'`, [ids.spec])).rows[0]);

  checks.check('publishing version 2 does NOT move the pin the maker\'s product rests on',
    pinnedBefore.reference_version_id === pinnedAfter.reference_version_id,
    `${pinnedBefore.reference_version_id} -> ${pinnedAfter.reference_version_id}`);

  const v1still = await asServiceRole(db, async () =>
    (await db.query<Row>(
      `select notes from batchlabel.reference_material_versions where id = $1`, [refV1])).rows[0]);
  checks.check('...and version 1 still says exactly what it said when it was pinned',
    v1still.notes === 'shape only', String(v1still.notes));

  // ---------------------------------------------------------------------------
  // 7. THE RECALL QUESTION, asked the way a maker would ask it.
  // ---------------------------------------------------------------------------
  await asUser(db, victim, async () => {
    const badLabel = String((await db.query<Row>(
      `insert into batchlabel.artefacts (account_id, product_id, artefact_type, version, specification_hash)
       values ($1, $2, 'unit-label', 2, 'v2hash') returning id`, [victimAcct, ids.product])).rows[0].id);

    const a = await attempt(() => db.query<Row>(
      `select batchlabel.record_batch_produced($1, $2, 'B-0091', 'Made 60 units', now(), 60,
              $3::jsonb, $4::uuid[], '{}'::jsonb) as id`,
      [victimAcct, ids.product, JSON.stringify([{ material_id: ids.material, lot: 'WAX-77' }]), [badLabel]]));
    checks.check('record_batch_produced writes a production record in one transaction',
      a.ok && a.count === 1, a.ok ? 'written' : `${a.code} ${a.message}`);

    await db.query<Row>(
      `select batchlabel.record_batch_produced($1, $2, 'B-0092', 'Made 20 units', now(), 20,
              '[]'::jsonb, $3::uuid[], '{}'::jsonb)`,
      [victimAcct, ids.product, [ids.artefact]]);

    // "Which batches carry the label I have just found wrong?"
    const recall = await db.query<Row>(
      `select e.batch_code, e.units
         from batchlabel.record_events e
         join batchlabel.record_event_artefacts ea on ea.record_event_id = e.id
        where ea.artefact_id = $1 and e.kind = 'batch.produced'
        order by e.occurred_at desc`, [badLabel]);
    checks.check('THE RECALL QUESTION: the wrong label names exactly the batch that carries it',
      recall.rows.length === 1 && recall.rows[0].batch_code === 'B-0091',
      recall.rows.map((r) => String(r.batch_code)).join(',') || 'none');
    checks.check('...and does not name the batch that carries a different version',
      !recall.rows.some((r) => r.batch_code === 'B-0092'), 'B-0092 excluded');

    // The other direction: a drum found wrong.
    const byLot = await db.query<Row>(
      `select e.batch_code from batchlabel.record_events e
         join batchlabel.record_event_lots l on l.record_event_id = e.id
        where lower(l.lot) = 'wax-77' and e.account_id = $1`, [victimAcct]);
    checks.check('and a supplier lot found wrong names the batches it went into',
      byLot.rows.length === 1 && byLot.rows[0].batch_code === 'B-0091',
      byLot.rows.map((r) => String(r.batch_code)).join(',') || 'none');

    // occurred_at and recorded_at are genuinely separable: a batch written up late.
    const late = await db.query<Row>(
      `insert into batchlabel.record_events (account_id, kind, summary, batch_code, occurred_at)
       values ($1, 'batch.produced', 'Written up on Friday', 'B-0088', now() - interval '3 days')
       returning occurred_at < recorded_at as backdated`, [victimAcct]);
    checks.check('a batch can be recorded after the day it was made, and the log keeps both dates',
      late.rows[0].backdated === true, String(late.rows[0].backdated));

    const noCode = await attempt(() => db.query<Row>(
      `insert into batchlabel.record_events (account_id, kind, summary)
       values ($1, 'batch.produced', 'No batch code')`, [victimAcct]));
    checks.check('a production event with no batch code is refused — it traces to nothing',
      !noCode.ok, noCode.ok ? 'ACCEPTED' : String(noCode.code));
  });

  // ---------------------------------------------------------------------------
  // 8. THE FINGERPRINT. "Current" has to be a fact.
  // ---------------------------------------------------------------------------
  await asUser(db, victim, async () => {
    const f1 = String((await db.query<Row>(
      `select batchlabel.artefact_source_fingerprint($1) as f`, [ids.product])).rows[0].f);
    checks.check('the fingerprint of a live product is a real value', f1.length === 32, f1);

    await db.query<Row>(`update batchlabel.specifications set load = 9.5 where id = $1`, [ids.spec]);
    const f2 = String((await db.query<Row>(
      `select batchlabel.artefact_source_fingerprint($1) as f`, [ids.product])).rows[0].f);
    checks.check('changing the composition moves the fingerprint', f1 !== f2, `${f1} -> ${f2}`);

    await db.query<Row>(
      `update batchlabel.business_identity set registered_name = 'Victim Candles Limited'
        where account_id = $1`, [victimAcct]);
    const f3 = String((await db.query<Row>(
      `select batchlabel.artefact_source_fingerprint($1) as f`, [ids.product])).rows[0].f);
    checks.check('changing the PRINTED BUSINESS NAME moves it too — it is on the label',
      f2 !== f3, `${f2} -> ${f3}`);

    const other = await db.query<Row>(
      `select batchlabel.artefact_source_fingerprint($1) as f`,
      ['00000000-0000-0000-0000-000000000000']);
    checks.check('the fingerprint of a product you cannot see is NULL, not an error — no oracle',
      other.rows[0].f === null, String(other.rows[0].f));
  });

  await asUser(db, neighbour, async () => {
    const r = await db.query<Row>(
      `select batchlabel.artefact_source_fingerprint($1) as f`, [ids.product]);
    checks.check('a neighbour cannot fingerprint the victim\'s product either',
      r.rows[0].f === null, String(r.rows[0].f));
  });

  // ---------------------------------------------------------------------------
  // 9. THE CONSTRAINTS THAT PROTECT A PRINTED DOCUMENT.
  // ---------------------------------------------------------------------------
  await asUser(db, victim, async () => {
    const blank = await attempt(() => db.query<Row>(
      `update batchlabel.business_identity set telephone = '   ' where account_id = $1`, [victimAcct]));
    checks.check('a whitespace-only telephone is refused — it prints as a blank line under a heading',
      !blank.ok, blank.ok ? 'ACCEPTED' : String(blank.code));

    const noName = await attempt(() => db.query<Row>(
      `update batchlabel.business_identity set registered_name = '' where account_id = $1`, [victimAcct]));
    checks.check('an empty registered name is refused — it is the one field that must print',
      !noName.ok, noName.ok ? 'ACCEPTED' : String(noName.code));

    const shortLines = await attempt(() => db.query<Row>(
      `insert into batchlabel.supplier_addresses (account_id, market, label, role, lines)
       values ($1, 'EU', 'EU', 'Responsible person', array['only one'])`, [victimAcct]));
    checks.check('an address with too few lines is refused — the renderer indexes lines[length-2]',
      !shortLines.ok, shortLines.ok ? 'ACCEPTED' : String(shortLines.code));

    const blankLine = await attempt(() => db.query<Row>(
      `insert into batchlabel.supplier_addresses (account_id, market, label, role, lines)
       values ($1, 'EU', 'EU', 'Responsible person', array['a', '  ', 'c', 'd'])`, [victimAcct]));
    checks.check('an address with a blank line in the middle is refused',
      !blankLine.ok, blankLine.ok ? 'ACCEPTED' : String(blankLine.code));

    const comp = await attempt(() => db.query<Row>(
      `insert into batchlabel.materials (account_id, material_class, name)
       values ($1, 'component', 'A component')`, [victimAcct]));
    checks.check('material_class "component" is refused — Rhys ruled components out entirely',
      !comp.ok, comp.ok ? 'COMPONENT ACCEPTED' : String(comp.code));

    const capacityOnOil = await attempt(() => db.query<Row>(
      `insert into batchlabel.materials (account_id, material_class, name, capacity_ml)
       values ($1, 'ingredient', 'Oil with a capacity', 250)`, [victimAcct]));
    checks.check('packaging geometry on an ingredient is refused rather than silently ignored',
      !capacityOnOil.ok, capacityOnOil.ok ? 'ACCEPTED' : String(capacityOnOil.code));

    const badKind = await attempt(() => db.query<Row>(
      `insert into batchlabel.record_events (account_id, kind, summary)
       values ($1, 'whatever.happened', 'Untyped')`, [victimAcct]));
    checks.check('an untyped record kind is refused — the log kinds are a closed set',
      !badKind.ok, badKind.ok ? 'ACCEPTED' : String(badKind.code));

    const twoOverrides = await attempt(() => db.query<Row>(
      `insert into batchlabel.materials (account_id, material_class, name, overrides_reference_id)
       values ($1, 'ingredient', 'A second override', $2)`, [victimAcct, refMat]));
    checks.check('a SECOND live override of one reference material is refused — "which wins" must stay answered',
      !twoOverrides.ok, twoOverrides.ok ? 'ACCEPTED' : String(twoOverrides.code));
  });

  // is_placeholder defaults true even when the caller forgets it exists.
  const ph = await asServiceRole(db, async () =>
    (await db.query<Row>(`select bool_and(is_placeholder) as all_ph from batchlabel.artefacts`)).rows[0]);
  checks.check('every artefact written so far is marked a placeholder, because none was generated',
    ph.all_ph === true, String(ph.all_ph));

  // ---------------------------------------------------------------------------
  // 10. THE ANON KEY. Nothing, anywhere.
  // ---------------------------------------------------------------------------
  await asAnon(db, async () => {
    for (const t of [...TABLES.map((t) => t.name), 'reference_materials', 'reference_material_versions']) {
      const r = await attempt(() => db.query<Row>(`select * from batchlabel.${t}`));
      checks.check(`anon SELECT on ${t} is refused outright`, !r.ok,
        r.ok ? `${r.count} row(s)` : String(r.code));
    }
    const v = await attempt(() => db.query<Row>('select * from batchlabel.resolved_materials'));
    checks.check('anon SELECT on resolved_materials is refused outright', !v.ok,
      v.ok ? `${v.count} row(s)` : String(v.code));
  });

  // ---------------------------------------------------------------------------
  // 11. A SUSPENDED BUSINESS LOSES WRITE ACCESS TO ALL OF IT.
  //     is_member_of consults brand_memberships.status, and every policy above is
  //     is_member_of — so this is a property of the whole set, worth one check rather
  //     than fourteen.
  // ---------------------------------------------------------------------------
  await db.exec(`update public.brand_memberships set status = 'suspended' where user_id = '${victim}';`);
  await asUser(db, victim, async () => {
    const sel = await attempt(() => db.query<Row>(
      `select * from batchlabel.materials where account_id = $1`, [victimAcct]));
    checks.check('a suspended business reads none of its own materials', sel.ok && sel.count === 0,
      sel.ok ? `${sel.count} row(s)` : sel.message);

    const ins = await attempt(() => db.query<Row>(
      `insert into batchlabel.record_events (account_id, kind, summary)
       values ($1, 'note', 'While suspended')`, [victimAcct]));
    checks.check('a suspended business cannot append to the record log', !ins.ok,
      ins.ok ? 'APPENDED' : String(ins.code));
  });
  await db.exec(`update public.brand_memberships set status = 'active' where user_id = '${victim}';`);
  await asUser(db, victim, async () => {
    const sel = await attempt(() => db.query<Row>(
      `select * from batchlabel.materials where account_id = $1`, [victimAcct]));
    checks.check('...and un-suspending restores every row, because nothing was destroyed',
      sel.ok && sel.count > 0, sel.ok ? `${sel.count} row(s)` : sel.message);
  });

  await db.close();
  return checks.all();
}

const results = await run();

describe(`the materials, records and identity tables, attacked by two strangers (${results.length} checks)`, () => {
  it.each([...results])('$name', ({ ok, name, detail }: CheckResult) => {
    expect(ok, `${name}${detail ? ` — ${detail}` : ''}`).toBe(true);
  });
});

/**
 * GUARDS THE GUARD. The suite above is data-driven over TABLES, so deleting an entry from
 * that array removes four cross-account checks and two cross-brand ones and the run still
 * goes green with a smaller number nobody reads. This asserts the coverage itself.
 */
describe('the coverage is what it claims to be', () => {
  it('exercises all four verbs, cross-account, on every one of the fourteen tables', () => {
    for (const verb of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      const seen = results.filter((c) => c.name.startsWith(`neighbour ${verb} `));
      expect(seen.map((c) => c.name), `cross-account ${verb} coverage`).toHaveLength(TABLES.length);
    }
    expect(TABLES).toHaveLength(14);
  });

  it('attempts a cross-BRAND write on every one of them', () => {
    const seen = results.filter((c) => /^cross-brand INSERT into .* is refused$/.test(c.name));
    expect(seen.map((c) => c.name)).toHaveLength(TABLES.length);
  });

  it('still proves the two properties the materials design rests on', () => {
    const immutability = results.filter((c) => /service_role CANNOT (update|delete) a published reference version/.test(c.name));
    expect(immutability.map((c) => c.name), 'the immutability proof has gone missing').toHaveLength(2);

    const precedence = results.filter((c) => /THE MAKER'S OWN ROW WINS|source = account/.test(c.name));
    expect(precedence.map((c) => c.name), 'the precedence proof has gone missing').not.toHaveLength(0);
  });

  it('and still asks the recall question', () => {
    const recall = results.filter((c) => /THE RECALL QUESTION/.test(c.name));
    expect(recall.map((c) => c.name), 'the recall proof has gone missing').toHaveLength(1);
  });
});
