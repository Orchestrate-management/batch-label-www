// @vitest-environment node
/**
 * Roles, seats and invites, attacked with eight identities.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM THE APPLY-TIME ASSERTIONS IN THE MIGRATION.
 * 20260805120000 asserts, on the database it is applied to, the things a DO block can reach:
 * the matrix is seeded, the policy census is right, the grants are what they claim, and — the
 * one claim the whole design rests on — a deferred constraint trigger is not reached for a row
 * RLS refuses. What a DO block CANNOT reach is a second person. The apply-time session is the
 * table owner, so row level security does not apply to it at all, and every question in this
 * file is of the form "what happens when THIS person tries that to THAT person's account".
 *
 * NOTHING HERE ASSERTS AN INTENTION. Every check is a statement executed as a real signed-in
 * user, through the `authenticated` role and the JWT claim PostgREST sets, and read back
 * through `attempt()` so that refused-by-policy (a code), refused-by-grant (a different code)
 * and succeeded-but-touched-nothing (zero rows, no error) stay three distinguishable answers.
 * An UPDATE that RLS filters to zero rows does not raise, so a suite that only caught throws
 * would call a policy that silently matched nothing a success.
 *
 * THE ROLE MATRIX IS EXHAUSTIVE OVER TABLES, NOT SAMPLED. Every one of the sixteen
 * account-scoped tables carrying a write policy is attacked by all four roles for all four
 * verbs, from the TABLES array below, and the coverage guard at the foot fails if that array
 * shrinks. A sampled suite is how a table keeps the old predicate and nobody notices: the one
 * table nobody thought to check is the one where a viewer can still write.
 *
 * WHAT IT FOUND. One defect, fixed in the migration rather than accommodated here:
 * account_seats_in_use and account_editor_seat_limit were granted to `authenticated` while
 * being SECURITY DEFINER, taking an account id, and consulting no membership. A REMOVED
 * member and a total stranger both read another business's headcount and its plan seat
 * ceiling, and an account that exists answered differently from one that does not. Section 4
 * is what measured it and section 10 is what stops it coming back.
 *
 * SECTIONS 9 AND 9b ARE A DIFFERENT KIND OF CHECK and are labelled as such. Everything above
 * them explores; those two pin defects that were reproduced against an earlier draft of this
 * design and then fixed. Each has a coverage guard at the foot naming the defect it pins, so
 * deleting one reads as "the proof for X is gone" rather than as a smaller number. What they
 * cover: an ownership transfer with no correct outcome (four separate corruptions), an
 * ownerless account left by a DELETE the owner floor structurally cannot watch for, a removed
 * member re-admitting themselves with a key they minted while privileged, invitations a
 * departing member had already sent, an RPC reporting a role it had declined to write, a
 * pending invite double-booking a seat its recipient already held, a unique-key collision used
 * as a read of another account, and current_account_id disagreeing with my_accounts about who
 * is a member.
 *
 * The structure is the one domain-tables.test.ts uses: one stateful scenario at module load,
 * each collected check reported as its own named test, plus a coverage assertion so that
 * deleting a scenario cannot silently shrink the suite.
 */

import { describe, expect, it } from 'vitest';
import { asServiceRole, asUser, attempt, boot, Checks, type CheckResult, type Row } from './harness';

const OWNER   = 'aaaaaaaa-0000-0000-0000-000000000001';
const ADMIN   = 'aaaaaaaa-0000-0000-0000-000000000002';
const EDITOR  = 'aaaaaaaa-0000-0000-0000-000000000003';
const VIEWER  = 'aaaaaaaa-0000-0000-0000-000000000004';
const OUTSIDE = 'aaaaaaaa-0000-0000-0000-000000000005';
const INVITEE = 'aaaaaaaa-0000-0000-0000-000000000006';
const SPARE   = 'aaaaaaaa-0000-0000-0000-000000000007';

const ACCOUNT = 'bbbbbbbb-0000-0000-0000-000000000001';
const OTHER   = 'bbbbbbbb-0000-0000-0000-000000000002';
/** An account id that has never existed. The control for every existence question. */
const NOWHERE = 'bbbbbbbb-0000-0000-0000-00000000dead';

/**
 * Section 10's cast, kept apart from the seven above ON PURPOSE.
 *
 * Everything before section 10 is one long stateful scenario where check 40 depends on the
 * writes of check 12, which is what lets it attack a realistic account. These are regressions
 * for specific reproduced exploits, and a regression that shares state with 214 other checks
 * is a regression that fails for a reason nobody can read. Each one below plants what it needs
 * and asserts one thing.
 */
const R_OWNER  = 'aaaaaaaa-0000-0000-0000-0000000000a1';
const R_ROGUE  = 'aaaaaaaa-0000-0000-0000-0000000000a2';
const R_SEAT   = 'aaaaaaaa-0000-0000-0000-0000000000a3';
const R_VIEWER = 'aaaaaaaa-0000-0000-0000-0000000000a4';
const R_ALIAS  = 'aaaaaaaa-0000-0000-0000-0000000000a5';
const R_FROZEN = 'aaaaaaaa-0000-0000-0000-0000000000a6';
const R_BOTH   = 'aaaaaaaa-0000-0000-0000-0000000000a7';
const R_THIEF  = 'aaaaaaaa-0000-0000-0000-0000000000a8';

const R_ACCT   = 'bbbbbbbb-0000-0000-0000-0000000000a1';
const R_FROZEN_ACCT = 'bbbbbbbb-0000-0000-0000-0000000000a2';
const R_THIEF_ACCT  = 'bbbbbbbb-0000-0000-0000-0000000000a3';

/** sha256 of a token, computed the same way the RPCs compute it. */
const hashOf = (token: string) => `sha256(convert_to('${token}','UTF8'))`;

/** The rows every child table hangs off, planted fresh before each role's turn. */
interface Ids {
  material: string;
  spec: string;
  product: string;
  event: string;
  artefact: string;
  /** A second artefact, so the role under test can insert a record_event_artefacts pair that
   *  does not collide with the planted one under `unique (record_event_id, artefact_id)`. */
  artefact2: string;
}

/**
 * One account-scoped table, with everything needed to attack it.
 *
 * `capability` is what the migration files it under, which is the whole question a role test
 * asks. `marker` is the column an UPDATE writes a sentinel into: a policy that filtered an
 * UPDATE to zero rows and a policy that let it through look identical in the row count if the
 * count is all you read, so every allowed update is confirmed to have LANDED and every
 * refused one is confirmed NOT to have.
 */
interface TableUnderTest {
  readonly name: string;
  readonly capability: 'write_data' | 'manage_identity' | 'manage_account';
  /** account_id for the two tables keyed on it; id for the rest. */
  readonly pk: 'id' | 'account_id';
  /** Keyed on account_id, so there can only ever be one row: the insert needs the row gone. */
  readonly singleton?: true;
  /** Whether `authenticated` holds the verb at all. Append-only tables hold neither. */
  readonly updatable: boolean;
  readonly deletable: boolean;
  /** The column an UPDATE marks, or null when the table has no UPDATE grant to test with. */
  readonly marker: string | null;
  readonly plant: (acct: string, ids: Ids) => string;
  readonly insert: (acct: string, ids: Ids) => string;
  readonly update: (pk: string, marker: string) => string;
  readonly remove: (pk: string) => string;
}

/**
 * ORDERED LEAF FIRST. Every child FK is `on delete cascade`, so a pass that deleted materials
 * before material_hazards would take the hazard row with it and the next check would be
 * measuring an empty table rather than a policy.
 */
const TABLES: readonly TableUnderTest[] = [
  {
    name: 'record_event_artefacts', capability: 'write_data', pk: 'id',
    updatable: false, deletable: false, marker: null,
    plant: (a, i) => `insert into batchlabel.record_event_artefacts (account_id, record_event_id, artefact_id)
                      values ('${a}','${i.event}','${i.artefact}') returning id`,
    insert: (a, i) => `insert into batchlabel.record_event_artefacts (account_id, record_event_id, artefact_id)
                       values ('${a}','${i.event}','${i.artefact2}') returning id`,
    update: (pk) => `update batchlabel.record_event_artefacts set created_at = now() where id = '${pk}' returning id`,
    remove: (pk) => `delete from batchlabel.record_event_artefacts where id = '${pk}' returning id`
  },
  {
    name: 'record_event_lots', capability: 'write_data', pk: 'id',
    updatable: false, deletable: false, marker: null,
    plant: (a, i) => `insert into batchlabel.record_event_lots (account_id, record_event_id, material_ref, lot)
                      values ('${a}','${i.event}','planted','LOT-PLANTED') returning id`,
    insert: (a, i) => `insert into batchlabel.record_event_lots (account_id, record_event_id, material_ref, lot)
                       values ('${a}','${i.event}','attempted','LOT-ATTEMPTED') returning id`,
    update: (pk) => `update batchlabel.record_event_lots set lot = 'LOT-OWNED' where id = '${pk}' returning id`,
    remove: (pk) => `delete from batchlabel.record_event_lots where id = '${pk}' returning id`
  },
  {
    name: 'record_events', capability: 'write_data', pk: 'id',
    updatable: false, deletable: false, marker: null,
    plant: (a) => `insert into batchlabel.record_events (account_id, kind, summary)
                   values ('${a}','note','Planted entry') returning id`,
    insert: (a) => `insert into batchlabel.record_events (account_id, kind, summary)
                    values ('${a}','note','Written by the role under test') returning id`,
    update: (pk) => `update batchlabel.record_events set summary = 'REWRITTEN' where id = '${pk}' returning id`,
    remove: (pk) => `delete from batchlabel.record_events where id = '${pk}' returning id`
  },
  {
    name: 'artefacts', capability: 'write_data', pk: 'id',
    updatable: true, deletable: true, marker: 'specification_hash',
    plant: (a, i) => `insert into batchlabel.artefacts (account_id, product_id, artefact_type, version, specification_hash)
                      values ('${a}','${i.product}','unit-label',3,'planted-3') returning id`,
    insert: (a, i) => `insert into batchlabel.artefacts (account_id, product_id, artefact_type, version, specification_hash)
                       values ('${a}','${i.product}','unit-label',4,'attempted-4') returning id`,
    update: (pk, m) => `update batchlabel.artefacts set specification_hash = '${m}' where id = '${pk}' returning id`,
    remove: (pk) => `delete from batchlabel.artefacts where id = '${pk}' returning id`
  },
  {
    name: 'specification_material_pins', capability: 'write_data', pk: 'id',
    updatable: true, deletable: true, marker: 'pinned_name',
    plant: (a, i) => `insert into batchlabel.specification_material_pins
                      (account_id, specification_id, role, slot, material_id, pinned_name)
                      values ('${a}','${i.spec}','dye','planted','${i.material}','Planted pin') returning id`,
    insert: (a, i) => `insert into batchlabel.specification_material_pins
                       (account_id, specification_id, role, slot, material_id, pinned_name)
                       values ('${a}','${i.spec}','dye','attempted','${i.material}','Attempted pin') returning id`,
    update: (pk, m) => `update batchlabel.specification_material_pins set pinned_name = '${m}' where id = '${pk}' returning id`,
    remove: (pk) => `delete from batchlabel.specification_material_pins where id = '${pk}' returning id`
  },
  {
    name: 'products', capability: 'write_data', pk: 'id',
    updatable: true, deletable: true, marker: 'name',
    plant: (a, i) => `insert into batchlabel.products (account_id, specification_id, name)
                      values ('${a}','${i.spec}','Planted candle') returning id`,
    insert: (a, i) => `insert into batchlabel.products (account_id, specification_id, name)
                       values ('${a}','${i.spec}','Attempted candle') returning id`,
    update: (pk, m) => `update batchlabel.products set name = '${m}' where id = '${pk}' returning id`,
    remove: (pk) => `delete from batchlabel.products where id = '${pk}' returning id`
  },
  {
    name: 'specifications', capability: 'write_data', pk: 'id',
    updatable: true, deletable: false, marker: 'name',
    plant: (a) => `insert into batchlabel.specifications (account_id, name, category_id)
                   values ('${a}','Planted formula','home-fragrance') returning id`,
    insert: (a) => `insert into batchlabel.specifications (account_id, name, category_id)
                    values ('${a}','Attempted formula','home-fragrance') returning id`,
    update: (pk, m) => `update batchlabel.specifications set name = '${m}' where id = '${pk}' returning id`,
    remove: (pk) => `delete from batchlabel.specifications where id = '${pk}' returning id`
  },
  {
    name: 'material_documents', capability: 'write_data', pk: 'id',
    updatable: true, deletable: true, marker: 'notes',
    plant: (a, i) => `insert into batchlabel.material_documents (account_id, material_id, document_kind, notes)
                      values ('${a}','${i.material}','Safety data sheet','planted') returning id`,
    insert: (a, i) => `insert into batchlabel.material_documents (account_id, material_id, document_kind, notes)
                       values ('${a}','${i.material}','Test report','attempted') returning id`,
    update: (pk, m) => `update batchlabel.material_documents set notes = '${m}' where id = '${pk}' returning id`,
    remove: (pk) => `delete from batchlabel.material_documents where id = '${pk}' returning id`
  },
  {
    name: 'material_ifra_limits', capability: 'write_data', pk: 'id',
    updatable: true, deletable: true, marker: 'category',
    plant: (a, i) => `insert into batchlabel.material_ifra_limits (account_id, material_id, category, max_pct)
                      values ('${a}','${i.material}','Planted category',50) returning id`,
    insert: (a, i) => `insert into batchlabel.material_ifra_limits (account_id, material_id, category, max_pct)
                       values ('${a}','${i.material}','Attempted category',25) returning id`,
    update: (pk, m) => `update batchlabel.material_ifra_limits set category = '${m}' where id = '${pk}' returning id`,
    remove: (pk) => `delete from batchlabel.material_ifra_limits where id = '${pk}' returning id`
  },
  {
    name: 'material_allergens', capability: 'write_data', pk: 'id',
    updatable: true, deletable: true, marker: 'name',
    plant: (a, i) => `insert into batchlabel.material_allergens (account_id, material_id, name, pct)
                      values ('${a}','${i.material}','planted allergen',1.5) returning id`,
    insert: (a, i) => `insert into batchlabel.material_allergens (account_id, material_id, name, pct)
                       values ('${a}','${i.material}','attempted allergen',2.5) returning id`,
    update: (pk, m) => `update batchlabel.material_allergens set name = '${m}' where id = '${pk}' returning id`,
    remove: (pk) => `delete from batchlabel.material_allergens where id = '${pk}' returning id`
  },
  {
    name: 'material_hazards', capability: 'write_data', pk: 'id',
    updatable: true, deletable: true, marker: 'statement',
    plant: (a, i) => `insert into batchlabel.material_hazards (account_id, material_id, code, statement, hazard_class)
                      values ('${a}','${i.material}','H411','Planted statement.','Aquatic Chronic 2') returning id`,
    insert: (a, i) => `insert into batchlabel.material_hazards (account_id, material_id, code, statement, hazard_class)
                       values ('${a}','${i.material}','H317','Attempted statement.','Skin Sens. 1') returning id`,
    update: (pk, m) => `update batchlabel.material_hazards set statement = '${m}' where id = '${pk}' returning id`,
    remove: (pk) => `delete from batchlabel.material_hazards where id = '${pk}' returning id`
  },
  {
    name: 'materials', capability: 'write_data', pk: 'id',
    updatable: true, deletable: true, marker: 'name',
    plant: (a) => `insert into batchlabel.materials (account_id, material_class, name)
                   values ('${a}','ingredient','Planted wax') returning id`,
    insert: (a) => `insert into batchlabel.materials (account_id, material_class, name)
                    values ('${a}','ingredient','Attempted wax') returning id`,
    update: (pk, m) => `update batchlabel.materials set name = '${m}' where id = '${pk}' returning id`,
    remove: (pk) => `delete from batchlabel.materials where id = '${pk}' returning id`
  },
  // ── manage_identity: what prints on the label, and account-wide configuration. ──
  {
    name: 'supplier_addresses', capability: 'manage_identity', pk: 'id',
    updatable: true, deletable: true, marker: 'label',
    plant: (a) => `insert into batchlabel.supplier_addresses (account_id, market, label, role, lines)
                   values ('${a}','GB','Planted block','supplier', array['1 Planted Way','Leeds','LS1 1AA']) returning id`,
    insert: (a) => `insert into batchlabel.supplier_addresses (account_id, market, label, role, lines)
                    values ('${a}','EU','Attempted block','importer', array['2 Attempted Str','Dublin','D01']) returning id`,
    update: (pk, m) => `update batchlabel.supplier_addresses set label = '${m}' where id = '${pk}' returning id`,
    remove: (pk) => `delete from batchlabel.supplier_addresses where id = '${pk}' returning id`
  },
  {
    name: 'business_identity', capability: 'manage_identity', pk: 'account_id', singleton: true,
    updatable: true, deletable: false, marker: 'registered_name',
    plant: (a) => `insert into batchlabel.business_identity (account_id, registered_name)
                   values ('${a}','Probe Co Ltd') returning account_id as id`,
    insert: (a) => `insert into batchlabel.business_identity (account_id, registered_name)
                    values ('${a}','Written by the role under test') returning account_id as id`,
    update: (pk, m) => `update batchlabel.business_identity set registered_name = '${m}'
                        where account_id = '${pk}' returning account_id as id`,
    remove: (pk) => `delete from batchlabel.business_identity where account_id = '${pk}' returning account_id as id`
  },
  {
    name: 'workspace_preferences', capability: 'manage_identity', pk: 'account_id', singleton: true,
    updatable: true, deletable: false, marker: 'default_export',
    plant: (a) => `insert into batchlabel.workspace_preferences (account_id, default_export)
                   values ('${a}','planted') returning account_id as id`,
    insert: (a) => `insert into batchlabel.workspace_preferences (account_id, default_export)
                    values ('${a}','attempted') returning account_id as id`,
    update: (pk, m) => `update batchlabel.workspace_preferences set default_export = '${m}'
                        where account_id = '${pk}' returning account_id as id`,
    remove: (pk) => `delete from batchlabel.workspace_preferences where account_id = '${pk}' returning account_id as id`
  },
  // ── manage_account: filing an erasure request against the account is not an edit. ──
  {
    name: 'account_data_requests', capability: 'manage_account', pk: 'id',
    updatable: false, deletable: false, marker: null,
    plant: (a) => `insert into batchlabel.account_data_requests (account_id, kind)
                   values ('${a}','export') returning id`,
    insert: (a) => `insert into batchlabel.account_data_requests (account_id, kind)
                    values ('${a}','erasure') returning id`,
    update: (pk) => `update batchlabel.account_data_requests set status = 'completed' where id = '${pk}' returning id`,
    remove: (pk) => `delete from batchlabel.account_data_requests where id = '${pk}' returning id`
  }
];

/** What each role is expected to be able to write, from the ratified matrix. */
const REACH: Record<string, readonly TableUnderTest['capability'][]> = {
  viewer: [],
  editor: ['write_data'],
  admin: ['write_data', 'manage_identity'],
  owner: ['write_data', 'manage_identity', 'manage_account']
};

async function run(): Promise<readonly CheckResult[]> {
  const c = new Checks();
  const { db } = await boot();

  /** As the schema owner: seeding and measurement, never a claim about permission. */
  const q = (sql: string) => attempt(() => db.query(sql));
  /** As a real signed-in person, one statement per session, exactly as PostgREST arrives. */
  const as = (user: string, sql: string) => asUser(db, user, () => attempt(() => db.query(sql)));
  const svc = (sql: string) => asServiceRole(db, () => attempt(() => db.query(sql)));
  const one = async (sql: string): Promise<string> =>
    String((await db.query<Row>(sql)).rows[0].id);
  const num = async (sql: string): Promise<number> =>
    Number((await db.query<Row>(sql)).rows[0].n);

  // ── The world. Seeded as the owner of the schema, which bypasses RLS but NOT triggers, so
  //    the seat ceiling and the owner floor both apply to this seeding exactly as they would
  //    to any other writer. studio is three editor seats: owner + admin + editor fills it
  //    exactly, and the viewer is free.
  await db.exec(`
    insert into auth.users (id, email) values
      ('${OWNER}',  'owner@example.com'),
      ('${ADMIN}',  'admin@example.com'),
      ('${EDITOR}', 'editor@example.com'),
      ('${VIEWER}', 'viewer@example.com'),
      ('${OUTSIDE}','outside@example.com'),
      ('${INVITEE}','invitee@example.com'),
      ('${SPARE}',  'spare@example.com');

    insert into public.brand_memberships
      (user_id, brand_slug, status, plan, plan_status, editor_seat_limit, sku_limit)
    values
      ('${OWNER}',  'batchlabel', 'active', 'studio', 'active', 3, 180),
      ('${OUTSIDE}','batchlabel', 'active', 'studio', 'active', 3, 180);

    insert into public.accounts (id, brand_slug, owner_user_id, name) values
      ('${ACCOUNT}', 'batchlabel', '${OWNER}',   'Probe Co'),
      ('${OTHER}',   'batchlabel', '${OUTSIDE}', 'Somebody Else Ltd');

    insert into public.account_members (account_id, user_id, role, status) values
      ('${ACCOUNT}', '${OWNER}',   'owner',  'active'),
      ('${ACCOUNT}', '${ADMIN}',   'admin',  'active'),
      ('${ACCOUNT}', '${EDITOR}',  'editor', 'active'),
      ('${ACCOUNT}', '${VIEWER}',  'viewer', 'active'),
      ('${OTHER}',   '${OUTSIDE}', 'owner',  'active');
  `);

  /** Everything in ACCOUNT, gone. Leaf first, because a cascade would hide what was tested. */
  const wipe = async (): Promise<void> => {
    for (const t of TABLES) {
      await db.exec(`delete from batchlabel.${t.name} where account_id = '${ACCOUNT}';`);
    }
  };

  /** One row in every table, plus the parents the child tables hang off. */
  const plant = async (): Promise<Ids> => {
    const material = await one(`insert into batchlabel.materials (account_id, material_class, name)
      values ('${ACCOUNT}','ingredient','Parent wax') returning id`);
    const spec = await one(`insert into batchlabel.specifications (account_id, name, category_id)
      values ('${ACCOUNT}','Parent formula','home-fragrance') returning id`);
    const product = await one(`insert into batchlabel.products (account_id, specification_id, name)
      values ('${ACCOUNT}','${spec}','Parent candle') returning id`);
    const artefact = await one(`insert into batchlabel.artefacts
      (account_id, product_id, artefact_type, version, specification_hash)
      values ('${ACCOUNT}','${product}','unit-label',1,'parent-1') returning id`);
    const artefact2 = await one(`insert into batchlabel.artefacts
      (account_id, product_id, artefact_type, version, specification_hash)
      values ('${ACCOUNT}','${product}','unit-label',2,'parent-2') returning id`);
    const event = await one(`insert into batchlabel.record_events (account_id, kind, summary)
      values ('${ACCOUNT}','note','Parent entry') returning id`);
    return { material, spec, product, event, artefact, artefact2 };
  };

  /** The row id each table's UPDATE and DELETE aim at, planted for this pass. */
  const plantRows = async (ids: Ids): Promise<Record<string, string>> => {
    const rows: Record<string, string> = {};
    for (const t of TABLES) rows[t.name] = await one(t.plant(ACCOUNT, ids));
    return rows;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. THE MATRIX ITSELF, WHICH IS DATA RATHER THAN A CASE STATEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  const ladder = await q(`select role, rank, consumes_seat from public.account_roles order by rank`);
  c.check(
    'the role ladder is four rows, ascending, and only the read-only role is free',
    JSON.stringify(ladder.rows) ===
      JSON.stringify([
        { role: 'viewer', rank: 10, consumes_seat: false },
        { role: 'editor', rank: 20, consumes_seat: true },
        { role: 'admin', rank: 30, consumes_seat: true },
        { role: 'owner', rank: 40, consumes_seat: true }
      ]),
    JSON.stringify(ladder.rows)
  );

  const matrix = await q(`select r.role, string_agg(cap.capability, ',' order by cap.min_rank) as caps
    from public.account_roles r
    left join public.account_capabilities cap on cap.min_rank <= r.rank
   group by r.role, r.rank order by r.rank`);
  c.check(
    'the whole permission system is legible as one SELECT, and it says what was ratified',
    JSON.stringify(matrix.rows) === JSON.stringify([
      { role: 'viewer', caps: 'read' },
      { role: 'editor', caps: 'read,write_data' },
      { role: 'admin', caps: 'read,write_data,manage_identity,manage_members' },
      { role: 'owner', caps: 'read,write_data,manage_identity,manage_members,manage_billing,manage_account' }
    ]),
    JSON.stringify(matrix.rows)
  );

  const unknownRole = await q(
    `insert into public.account_members (account_id, user_id, role) values ('${ACCOUNT}','${SPARE}','superadmin')`
  );
  c.check(
    'a role outside the matrix is refused by the foreign key, not by a second copy of the list',
    unknownRole.code === '23503',
    unknownRole.code
  );

  const badCapability = await q(
    `insert into public.account_capabilities (capability, min_rank, description) values ('x', 999, 'x')`
  );
  c.check(
    'a capability filed at a rank no role holds is refused',
    badCapability.code === '23503',
    badCapability.code
  );

  const defaulted = await q(`select column_default from information_schema.columns
    where table_schema='public' and table_name='account_members' and column_name='role'`);
  c.check(
    'account_members.role defaults to the free role, so a forgotten column cannot grant a paid seat',
    String(defaulted.rows[0]?.column_default ?? '').includes('viewer'),
    defaulted.rows[0]?.column_default
  );

  const typo = await q(`select public.can('${ACCOUNT}','wrtie_data') as ok`);
  c.check('a capability name that does not exist returns false, so a typo in a policy fails closed',
    typo.ok && typo.rows[0]?.ok === false, JSON.stringify(typo.rows[0] ?? typo.code));

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. EVERY ROLE, EVERY VERB, EVERY ONE OF THE SIXTEEN TABLES.
  //
  //    Every viewer refusal below was ALLOWED before 20260805120000: is_member_of never read
  //    the role column, so a viewer and an editor had byte-identical database rights. This is
  //    the measured defect, reproduced sixteen times as a refusal.
  // ═══════════════════════════════════════════════════════════════════════════
  async function rolePass(user: string, label: string, exhaustiveReads: boolean): Promise<void> {
    const may = (t: TableUnderTest): boolean => REACH[label].includes(t.capability);

    await wipe();
    const ids = await plant();
    const rows = await plantRows(ids);

    // ── READ. Every role holds `read` at the viewer's rank, so all four see everything. The
    //    viewer's pass reports one check per table because "a viewer can still select product
    //    data" is the half of the matrix that must not have regressed; the others aggregate.
    const unread: string[] = [];
    for (const t of TABLES) {
      const r = await as(user, `select ${t.pk} from batchlabel.${t.name}`);
      const ok = r.ok && r.count >= 1;
      if (!ok) unread.push(`${t.name}=${r.ok ? r.count : r.code}`);
      if (exhaustiveReads) {
        c.check(`${label} SELECT batchlabel.${t.name}: reads the account's row`, ok, r.ok ? r.count : r.code);
      }
    }
    if (!exhaustiveReads) {
      c.check(`${label} reads all ${TABLES.length} account tables`, unread.length === 0, unread.join(' '));
    }

    // ── WRITE.
    for (const t of TABLES) {
      const allowed = may(t);
      const marker = `TOUCHED BY ${label}`;
      const notes: string[] = [];
      let ok = true;

      // INSERT. A singleton's row is cleared first: a duplicate key refusal and a policy
      // refusal are different sentences, and a success has to be a real one.
      if (t.singleton) await db.exec(`delete from batchlabel.${t.name} where account_id = '${ACCOUNT}';`);
      const ins = await as(user, t.insert(ACCOUNT, ids));
      notes.push(`insert=${ins.ok ? `ok(${ins.count})` : ins.code}`);
      ok = ok && (allowed ? ins.ok && ins.count === 1 : ins.code === '42501');
      if (t.singleton && !ins.ok) await db.exec(t.plant(ACCOUNT, ids) + ';');
      const pk = t.singleton ? ACCOUNT : rows[t.name];

      // UPDATE. Read back through the marker column, because zero rows updated and one row
      // updated are the same absence of an error.
      const upd = await as(user, t.update(pk, marker));
      notes.push(`update=${upd.ok ? `ok(${upd.count})` : upd.code}`);
      if (!t.updatable) {
        // Append-only: nobody holds the grant, not even the owner.
        ok = ok && upd.code === '42501';
      } else if (allowed) {
        ok = ok && upd.ok && upd.count === 1;
      } else {
        ok = ok && (upd.ok ? upd.count === 0 : upd.code === '42501');
      }
      if (t.marker) {
        const landed = await num(`select count(*)::int as n from batchlabel.${t.name}
          where account_id = '${ACCOUNT}' and ${t.marker} = '${marker}'`);
        notes.push(`marked=${landed}`);
        ok = ok && (allowed && t.updatable ? landed === 1 : landed === 0);
      }

      // DELETE.
      const del = await as(user, t.remove(pk));
      notes.push(`delete=${del.ok ? `ok(${del.count})` : del.code}`);
      const survivors = await num(`select count(*)::int as n from batchlabel.${t.name} where ${t.pk} = '${pk}'`);
      notes.push(`left=${survivors}`);
      if (!t.deletable) {
        ok = ok && del.code === '42501' && survivors === 1;
      } else if (allowed) {
        ok = ok && del.ok && del.count === 1 && survivors === 0;
      } else {
        ok = ok && (del.ok ? del.count === 0 : del.code === '42501') && survivors === 1;
      }

      c.check(
        `${label} WRITE batchlabel.${t.name} (${t.capability}): ${allowed ? 'every granted verb lands' : 'every verb refused'}`,
        ok,
        notes.join(' ')
      );
    }
  }

  await rolePass(VIEWER, 'viewer', true);
  await rolePass(EDITOR, 'editor', false);
  await rolePass(ADMIN, 'admin', false);
  await rolePass(OWNER, 'owner', false);

  // The three placements that are decisions rather than defaults, called out by name so a
  // future edit to account_capabilities that moves one of them fails here with a sentence.
  const placements = await q(`select capability, min_rank from public.account_capabilities
    where capability in ('manage_identity','manage_account') order by capability`);
  c.check(
    'the label identity and the erasure request sit above the editor, which is the ruling that changed',
    JSON.stringify(placements.rows) === JSON.stringify([
      { capability: 'manage_account', min_rank: 40 },
      { capability: 'manage_identity', min_rank: 30 }
    ]),
    JSON.stringify(placements.rows)
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. THE MEMBERSHIP TABLE, AND THE LINE BETWEEN MANAGING PEOPLE AND MANAGING MONEY
  // ═══════════════════════════════════════════════════════════════════════════
  const editorOnMembers = await as(EDITOR, `update public.account_members set role = 'viewer'
    where user_id = '${VIEWER}' and account_id = '${ACCOUNT}' returning role`);
  c.check('an editor cannot re-role anybody: manage_members is above them',
    editorOnMembers.ok && editorOnMembers.count === 0, editorOnMembers.count);

  const editorSuspends = await as(EDITOR, `update public.account_members set status = 'suspended'
    where user_id = '${VIEWER}' and account_id = '${ACCOUNT}' returning status`);
  c.check('an editor cannot suspend anybody either, which is the same policy on the other column',
    editorSuspends.ok && editorSuspends.count === 0, editorSuspends.count);

  const editorInserts = await as(EDITOR, `insert into public.account_members (account_id, user_id, role, status)
    values ('${ACCOUNT}','${SPARE}','viewer','active')`);
  c.check('an editor cannot add a member: there is no INSERT grant for any browser role',
    editorInserts.code === '42501', editorInserts.code);

  const editorDeletes = await as(EDITOR, `delete from public.account_members where user_id = '${VIEWER}'`);
  c.check('an editor cannot delete a member: there is no DELETE grant for any browser role',
    editorDeletes.code === '42501', editorDeletes.code);

  const editorUnchanged = await q(`select role, status from public.account_members
    where user_id = '${VIEWER}' and account_id = '${ACCOUNT}'`);
  c.check('and after all four attempts the member row is exactly as it was',
    editorUnchanged.rows[0]?.role === 'viewer' && editorUnchanged.rows[0]?.status === 'active',
    JSON.stringify(editorUnchanged.rows[0]));

  // ── The admin CAN manage people.
  const adminDemotes = await as(ADMIN, `update public.account_members set role = 'viewer'
    where user_id = '${EDITOR}' and account_id = '${ACCOUNT}' returning role`);
  c.check('an admin re-roles somebody below them', adminDemotes.ok && adminDemotes.count === 1,
    `${adminDemotes.code}/${adminDemotes.count}`);

  const adminSuspends = await as(ADMIN, `update public.account_members set status = 'suspended'
    where user_id = '${EDITOR}' and account_id = '${ACCOUNT}' returning status`);
  c.check('an admin suspends somebody below them', adminSuspends.ok && adminSuspends.count === 1,
    `${adminSuspends.code}/${adminSuspends.count}`);

  await db.exec(`update public.account_members set role = 'editor', status = 'active'
    where user_id = '${EDITOR}' and account_id = '${ACCOUNT}';`);

  // ── ...and cannot touch a single thing that decides what is paid, or how much is allowed.
  const billing: readonly (readonly [string, string])[] = [
    ['the plan on the membership row',
     `update public.brand_memberships set plan = 'consultant' where user_id = '${OWNER}'`],
    ['the editor seat ceiling itself',
     `update public.brand_memberships set editor_seat_limit = 99 where user_id = '${OWNER}'`],
    ['the SKU allowance',
     `update public.brand_memberships set sku_limit = 99999 where user_id = '${OWNER}'`],
    ['the billing status',
     `update public.brand_memberships set plan_status = 'active', current_period_end = now() + interval '99 days' where user_id = '${OWNER}'`],
    ['who the account is billed to',
     `update public.accounts set owner_user_id = '${ADMIN}' where id = '${ACCOUNT}'`],
    ['the entitlement writer itself',
     `select public.apply_stripe_entitlement('evt_x','customer.subscription.updated', now(), 'batchlabel', '${OWNER}')`]
  ];
  for (const [what, sql] of billing) {
    const r = await as(ADMIN, sql);
    c.check(`an admin cannot change ${what}`, r.code === '42501', `${r.code} ${r.message.slice(0, 60)}`);
  }

  const adminReadsPlan = await as(ADMIN, `select plan, editor_seat_limit from public.brand_memberships`);
  c.check('an admin cannot even READ the owner\'s billing row: that policy is auth.uid() = user_id',
    adminReadsPlan.ok && adminReadsPlan.count === 0, adminReadsPlan.count);

  const capabilities = await as(ADMIN, `select
      public.can('${ACCOUNT}','manage_members') as members,
      public.can('${ACCOUNT}','manage_billing') as billing,
      public.can('${ACCOUNT}','manage_account') as account`);
  c.check('and the matrix says the same thing the grants do: members yes, billing no, account no',
    JSON.stringify(capabilities.rows[0]) === JSON.stringify({ members: true, billing: false, account: false }),
    JSON.stringify(capabilities.rows[0]));

  const ownerCaps = await as(OWNER, `select bool_and(public.can('${ACCOUNT}', capability)) as all_of_them
    from public.account_capabilities`);
  c.check('the owner holds every capability in the table, including the two nobody else has',
    ownerCaps.rows[0]?.all_of_them === true, JSON.stringify(ownerCaps.rows[0]));

  // The honest other half: billing is not a grant this database hands to anybody, owner
  // included. It is enforced at the www endpoints, which take the actor from a verified token.
  const ownerBilling = await as(OWNER, `update public.brand_memberships set plan = 'consultant'
    where user_id = '${OWNER}'`);
  c.check('and the OWNER cannot write their own billing row either: no browser role holds that grant',
    ownerBilling.code === '42501', ownerBilling.code);

  const ownerManages = await as(OWNER, `update public.account_members set role = 'viewer'
    where user_id = '${ADMIN}' and account_id = '${ACCOUNT}' returning role`);
  c.check('the owner re-roles an admin, because rank comparison is the whole rule',
    ownerManages.ok && ownerManages.count === 1, `${ownerManages.code}/${ownerManages.count}`);
  await db.exec(`update public.account_members set role = 'admin'
    where user_id = '${ADMIN}' and account_id = '${ACCOUNT}';`);

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. STANDING: SUSPENDED, REMOVED, AND NEVER A MEMBER AT ALL
  // ═══════════════════════════════════════════════════════════════════════════
  await wipe();
  const standingIds = await plant();
  await plantRows(standingIds);

  // ANTI-VACUITY. Every check below reads zero rows and calls that a refusal. Zero rows is
  // also what an empty database returns, so the fixture is confirmed non-empty first: without
  // this, deleting the planting above would turn the whole section green while proving
  // nothing at all.
  const populated: string[] = [];
  for (const t of TABLES) {
    const n = await num(`select count(*)::int as n from batchlabel.${t.name} where account_id = '${ACCOUNT}'`);
    if (n < 1) populated.push(`${t.name}=${n}`);
  }
  c.check('the account really does hold a row in every one of the sixteen tables before anyone is suspended',
    populated.length === 0, populated.join(' '));

  /** What a person with no standing must be able to do: nothing at all. */
  async function provesNothing(user: string, label: string): Promise<void> {
    const notes: string[] = [];
    let ok = true;

    for (const t of TABLES) {
      const r = await as(user, `select ${t.pk} from batchlabel.${t.name}`);
      if (!(r.ok && r.count === 0)) { ok = false; notes.push(`read ${t.name}=${r.ok ? r.count : r.code}`); }
      const w = await as(user, t.insert(ACCOUNT, standingIds));
      if (w.code !== '42501') { ok = false; notes.push(`write ${t.name}=${w.ok ? 'LANDED' : w.code}`); }
    }

    const acct = await as(user, `select id from public.accounts where id = '${ACCOUNT}'`);
    if (!(acct.ok && acct.count === 0)) { ok = false; notes.push(`accounts=${acct.count}`); }

    const members = await as(user, `select user_id from public.account_members where account_id = '${ACCOUNT}'`);
    if (!(members.ok && members.count === 0)) { ok = false; notes.push(`members=${members.count}`); }

    const mine = await as(user, `select account_id from public.my_accounts() where account_id = '${ACCOUNT}'`);
    if (!(mine.ok && mine.count === 0)) { ok = false; notes.push(`my_accounts=${mine.count}`); }

    const ent = await as(user, `select plan from public.account_entitlement('${ACCOUNT}')`);
    if (!(ent.ok && ent.count === 0)) { ok = false; notes.push(`entitlement=${ent.count}`); }

    const rank = await as(user, `select public.account_rank('${ACCOUNT}') as r, public.can('${ACCOUNT}','read') as c`);
    if (!(rank.rows[0]?.r === null && rank.rows[0]?.c === false)) {
      ok = false; notes.push(`rank=${JSON.stringify(rank.rows[0])}`);
    }

    // Managing people is the one verb a browser holds a real grant for, so it is the one that
    // has to be refused by a policy rather than by an absent privilege. The target is a row
    // that really exists and really is re-rollable by an active admin (proved in section 3),
    // so zero rows here is the policy answering rather than an empty WHERE clause.
    const target = user === VIEWER ? EDITOR : VIEWER;
    const manage = await as(user, `update public.account_members set role = 'viewer'
      where account_id = '${ACCOUNT}' and user_id = '${target}' returning role`);
    if (!(manage.ok && manage.count === 0)) { ok = false; notes.push(`manage=${manage.ok ? manage.count : manage.code}`); }

    c.check(`${label} can do nothing at all: no read, no write, no member management, no entitlement`, ok,
      notes.length === 0 ? `${TABLES.length} tables silent` : notes.join(' '));
  }

  for (const [user, role] of [[ADMIN, 'admin'], [EDITOR, 'editor'], [VIEWER, 'viewer']] as const) {
    await db.exec(`update public.account_members set status = 'suspended'
      where user_id = '${user}' and account_id = '${ACCOUNT}';`);
    await provesNothing(user, `a SUSPENDED ${role}`);
    await db.exec(`update public.account_members set status = 'active'
      where user_id = '${user}' and account_id = '${ACCOUNT}';`);
  }

  for (const [user, role] of [[ADMIN, 'admin'], [EDITOR, 'editor'], [VIEWER, 'viewer']] as const) {
    await db.exec(`update public.account_members set status = 'removed'
      where user_id = '${user}' and account_id = '${ACCOUNT}';`);
    await provesNothing(user, `a REMOVED ${role}`);
    await db.exec(`update public.account_members set status = 'active'
      where user_id = '${user}' and account_id = '${ACCOUNT}';`);
  }

  const suspendOwner = await q(`update public.account_members set status = 'suspended'
    where user_id = '${OWNER}' and account_id = '${ACCOUNT}'`);
  c.check('there is no such thing as a suspended owner: the floor refuses at commit, even for a superuser',
    suspendOwner.code === 'P0001' && suspendOwner.hint === 'owner_floor',
    `${suspendOwner.code}/${suspendOwner.hint}`);

  const removeOwner = await q(`update public.account_members set status = 'removed'
    where user_id = '${OWNER}' and account_id = '${ACCOUNT}'`);
  c.check('nor a removed one, so an account cannot be orphaned by removing its last owner',
    removeOwner.code === 'P0001' && removeOwner.hint === 'owner_floor',
    `${removeOwner.code}/${removeOwner.hint}`);

  await provesNothing(OUTSIDE, 'a NON-MEMBER');

  // ── ...and cannot tell the account apart from one that has never existed. Every answer
  //    below is byte-identical for a real account and for an invented uuid, which is what
  //    "cannot detect the existence" has to mean if it is to mean anything.
  const oracles: readonly (readonly [string, (id: string) => string])[] = [
    ['can()', (id) => `select public.can('${id}','read')::text as v`],
    ['account_rank()', (id) => `select coalesce(public.account_rank('${id}')::text,'null') as v`],
    ['is_member_of()', (id) => `select public.is_member_of('${id}')::text as v`],
    ['account_entitlement()', (id) => `select count(*)::text as v from public.account_entitlement('${id}')`],
    ['a SELECT on accounts', (id) => `select count(*)::text as v from public.accounts where id = '${id}'`],
    ['a SELECT on account_members', (id) => `select count(*)::text as v from public.account_members where account_id = '${id}'`]
    // The invite list is deliberately NOT asked here: no invite exists yet, so it would be
    // comparing zero against zero and proving nothing. It is asked in section 7, against an
    // account that really does hold two pending invites.
  ];
  for (const [what, sql] of oracles) {
    const real = await as(OUTSIDE, sql(ACCOUNT));
    const fake = await as(OUTSIDE, sql(NOWHERE));
    const same = real.ok === fake.ok && real.rows[0]?.v === fake.rows[0]?.v && real.code === fake.code;
    c.check(`a non-member cannot detect the account exists through ${what}`, same,
      `real=${real.ok ? real.rows[0]?.v : real.code} fake=${fake.ok ? fake.rows[0]?.v : fake.code}`);
  }

  // ── THE DEFECT THIS SUITE FOUND, kept as a regression test.
  //
  //    account_seats_in_use and account_editor_seat_limit are SECURITY DEFINER, take an
  //    account id as an argument, and consult no membership at all. The first draft granted
  //    execute to `authenticated`, and this is what it answered a person who had been REMOVED
  //    from the account and a stranger who had never been in it:
  //
  //      account_seats_in_use('<their account>')       -> 1     (real headcount)
  //      account_editor_seat_limit('<their account>')  -> 3     (their PLAN TIER)
  //      account_seats_in_use('<a uuid nobody owns>')  -> 0     (so: an existence oracle)
  //
  //    The migration now revokes both from every browser role. The number a member is
  //    entitled to see comes from account_entitlement, which carries an is_member_of guard.
  for (const fn of ['account_seats_in_use', 'account_editor_seat_limit']) {
    const real = await as(OUTSIDE, `select public.${fn}('${ACCOUNT}') as v`);
    const fake = await as(OUTSIDE, `select public.${fn}('${NOWHERE}') as v`);
    c.check(`a non-member cannot call public.${fn}(), for a real account or an invented one`,
      real.code === '42501' && fake.code === '42501', `${real.code}/${fake.code}`);
  }
  await db.exec(`update public.account_members set status = 'removed'
    where user_id = '${VIEWER}' and account_id = '${ACCOUNT}';`);
  const goneSeats = await as(VIEWER, `select public.account_seats_in_use('${ACCOUNT}') as v`);
  c.check('a REMOVED member cannot read the headcount of the account they were removed from',
    goneSeats.code === '42501', goneSeats.code);
  await db.exec(`update public.account_members set status = 'active'
    where user_id = '${VIEWER}' and account_id = '${ACCOUNT}';`);

  const memberSeats = await as(EDITOR, `select seats_in_use, editor_seat_limit
    from public.account_entitlement('${ACCOUNT}')`);
  c.check('while a member still reads both numbers, through the one function that checks membership',
    memberSeats.ok && Number(memberSeats.rows[0]?.seats_in_use) === 3 &&
      Number(memberSeats.rows[0]?.editor_seat_limit) === 3,
    JSON.stringify(memberSeats.rows[0] ?? memberSeats.code));

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. SEATS. Three used of three: owner, admin and editor. The viewer is free.
  // ═══════════════════════════════════════════════════════════════════════════
  const baseline = await q(`select public.account_seats_in_use('${ACCOUNT}') as n,
                                   public.account_editor_seat_limit('${ACCOUNT}') as lim`);
  c.check('seats in use counts owner, admin and editor, and never the viewer',
    Number(baseline.rows[0]?.n) === 3 && Number(baseline.rows[0]?.lim) === 3,
    JSON.stringify(baseline.rows[0]));

  const overCeiling = await q(`insert into public.account_members (account_id, user_id, role, status)
    values ('${ACCOUNT}','${INVITEE}','editor','active')`);
  c.check('one editor beyond the ceiling is refused at commit, with hint seat_limit_reached',
    overCeiling.code === 'P0001' && overCeiling.hint === 'seat_limit_reached',
    `${overCeiling.code}/${overCeiling.hint}`);

  const freeSeat = await q(`insert into public.account_members (account_id, user_id, role, status)
    values ('${ACCOUNT}','${INVITEE}','viewer','active') returning id`);
  c.check('a read-only member is admitted onto a full account: free and unlimited on every plan',
    freeSeat.ok && freeSeat.count === 1, freeSeat.code ?? freeSeat.count);

  const promoteAtCeiling = await q(`update public.account_members set role = 'editor'
    where user_id = '${INVITEE}' and account_id = '${ACCOUNT}'`);
  c.check('promoting a viewer to editor at the ceiling is refused: INSERT is not the only path in',
    promoteAtCeiling.code === 'P0001' && promoteAtCeiling.hint === 'seat_limit_reached',
    `${promoteAtCeiling.code}/${promoteAtCeiling.hint}`);

  // ── Reactivation is a third path, and it is metered exactly like the other two.
  await db.exec(`update public.account_members set status = 'suspended'
    where user_id = '${EDITOR}' and account_id = '${ACCOUNT}';`);
  const freedSeat = await q(`select public.account_seats_in_use('${ACCOUNT}') as n`);
  c.check('suspending an editor frees their seat on the next statement, not at the next renewal',
    Number(freedSeat.rows[0]?.n) === 2, freedSeat.rows[0]?.n);

  const promoteIntoRoom = await q(`update public.account_members set role = 'editor'
    where user_id = '${INVITEE}' and account_id = '${ACCOUNT}' returning role`);
  c.check('and the seat it freed can be taken by promoting the viewer, which proves the refusal above was the ceiling',
    promoteIntoRoom.ok && promoteIntoRoom.count === 1, `${promoteIntoRoom.code}/${promoteIntoRoom.hint}`);

  const reactivate = await q(`update public.account_members set status = 'active'
    where user_id = '${EDITOR}' and account_id = '${ACCOUNT}'`);
  c.check('reactivating the suspended editor is now refused, because somebody else is sitting in the seat',
    reactivate.code === 'P0001' && reactivate.hint === 'seat_limit_reached',
    `${reactivate.code}/${reactivate.hint}`);

  await db.exec(`update public.account_members set role = 'viewer'
    where user_id = '${INVITEE}' and account_id = '${ACCOUNT}';`);
  const reactivateAgain = await q(`update public.account_members set status = 'active'
    where user_id = '${EDITOR}' and account_id = '${ACCOUNT}' returning status`);
  c.check('and is allowed the moment the seat is given back, so the rule is the count and nothing else',
    reactivateAgain.ok && reactivateAgain.count === 1, `${reactivateAgain.code}/${reactivateAgain.hint}`);

  const sidegrade = await q(`update public.account_members set role = 'admin'
    where user_id = '${EDITOR}' and account_id = '${ACCOUNT}'`);
  c.check('an editor to admin sidegrade at the ceiling is not metered: it adds no consumption',
    sidegrade.ok, `${sidegrade.code}/${sidegrade.hint}`);
  await db.exec(`update public.account_members set role = 'editor'
    where user_id = '${EDITOR}' and account_id = '${ACCOUNT}';`);

  // ── THE DOWNGRADE. editor_seat_limit follows the plan down inside the same UPDATE that
  //    writes the plan (20260802120000:504), so headcount over limit arrives within one
  //    webhook and has to be a normal steady state rather than an error.
  await db.exec(`update public.brand_memberships
    set editor_seat_limit = 1, plan = 'free', plan_status = 'past_due',
        current_period_end = now() - interval '30 days'
    where user_id = '${OWNER}' and brand_slug = 'batchlabel';`);

  const beforeDowngrade = await q(`select count(*)::int as n from public.account_members
    where account_id = '${ACCOUNT}' and status = 'active'`);
  c.check('DOWNGRADE: lowering the ceiling below what is in use deletes nobody and disables nobody',
    Number(beforeDowngrade.rows[0]?.n) === 5 &&
      Number((await db.query<Row>(`select public.account_seats_in_use('${ACCOUNT}') as n`)).rows[0].n) === 3,
    beforeDowngrade.rows[0]?.n);

  const rolesIntact = await q(`select role, status from public.account_members
    where user_id = '${EDITOR}' and account_id = '${ACCOUNT}'`);
  c.check('DOWNGRADE: nobody was demoted either, so the customer keeps exactly what they had',
    rolesIntact.rows[0]?.role === 'editor' && rolesIntact.rows[0]?.status === 'active',
    JSON.stringify(rolesIntact.rows[0]));

  const lapsedRead = await as(EDITOR, `select id from batchlabel.products`);
  c.check('DOWNGRADE: a lapsed, over-limit account still READS everything it had',
    lapsedRead.ok && lapsedRead.count >= 1, lapsedRead.ok ? lapsedRead.count : lapsedRead.code);

  const lapsedWrite = await as(EDITOR, `insert into batchlabel.record_events (account_id, kind, summary)
    values ('${ACCOUNT}','note','still working') returning id`);
  c.check('DOWNGRADE: and still WRITES, because the predicate reads status and never plan',
    lapsedWrite.ok && lapsedWrite.count === 1, lapsedWrite.code ?? lapsedWrite.count);

  const lapsedDemote = await as(ADMIN, `update public.account_members set role = 'viewer'
    where user_id = '${EDITOR}' and account_id = '${ACCOUNT}' returning role`);
  c.check('DOWNGRADE: an over-limit account can still demote, which is how an owner gets back under the line',
    lapsedDemote.ok && lapsedDemote.count === 1, `${lapsedDemote.code}/${lapsedDemote.count}`);

  const lapsedNewSeat = await q(`update public.account_members set role = 'editor'
    where user_id = '${INVITEE}' and account_id = '${ACCOUNT}'`);
  c.check('DOWNGRADE: but a NEW seat is refused, which is the whole rule: block consumption, strip nobody',
    lapsedNewSeat.code === 'P0001' && lapsedNewSeat.hint === 'seat_limit_reached',
    `${lapsedNewSeat.code}/${lapsedNewSeat.hint}`);

  // ── Viewers, in quantity, on a plan that allows one editor and is already over it.
  await db.exec(`insert into auth.users (id, email)
    select gen_random_uuid(), 'crowd' || g || '@example.com' from generate_series(1, 25) g;`);
  const crowd = await q(`insert into public.account_members (account_id, user_id, role, status)
    select '${ACCOUNT}', u.id, 'viewer', 'active' from auth.users u where u.email like 'crowd%' returning id`);
  const afterCrowd = await q(`select public.account_seats_in_use('${ACCOUNT}') as n`);
  c.check('twenty-five read-only members join an account whose editor ceiling is 1 and already over it',
    crowd.ok && crowd.count === 25 && Number(afterCrowd.rows[0]?.n) === 2,
    `${crowd.code ?? crowd.count} seats=${afterCrowd.rows[0]?.n}`);

  await db.exec(`delete from public.account_members where user_id in
    (select id from auth.users where email like 'crowd%');`);
  await db.exec(`update public.brand_memberships
    set editor_seat_limit = 3, plan = 'studio', plan_status = 'active',
        current_period_end = now() + interval '30 days'
    where user_id = '${OWNER}' and brand_slug = 'batchlabel';`);
  // The allowance goes back BEFORE the role does: restoring a demoted editor is itself a
  // transition into consuming and is metered like any other. Getting that order wrong is how
  // this section first failed, which is the rule behaving.
  await db.exec(`update public.account_members set role = 'editor'
    where user_id = '${EDITOR}' and account_id = '${ACCOUNT}';`);
  await db.exec(`delete from public.account_members
    where user_id = '${INVITEE}' and account_id = '${ACCOUNT}';`);

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. ESCALATION
  // ═══════════════════════════════════════════════════════════════════════════
  const editorSelfPromote = await as(EDITOR, `update public.account_members set role = 'admin'
    where user_id = '${EDITOR}' and account_id = '${ACCOUNT}' returning role`);
  c.check('an editor promoting themselves touches nothing, and is told nothing',
    editorSelfPromote.ok && editorSelfPromote.count === 0, editorSelfPromote.count);

  const adminSelfPromote = await as(ADMIN, `update public.account_members set role = 'owner'
    where user_id = '${ADMIN}' and account_id = '${ACCOUNT}' returning role`);
  c.check('an admin promoting themselves to owner is refused by WITH CHECK: you cannot create a rank above your own',
    adminSelfPromote.code === '42501', adminSelfPromote.code);

  const adminDemotesOwner = await as(ADMIN, `update public.account_members set role = 'viewer'
    where user_id = '${OWNER}' and account_id = '${ACCOUNT}' returning role`);
  c.check('an admin cannot even SEE the owner row to demote it, which is USING rather than WITH CHECK',
    adminDemotesOwner.ok && adminDemotesOwner.count === 0, adminDemotesOwner.count);

  const stillOwner = await q(`select role from public.account_members
    where user_id = '${OWNER}' and account_id = '${ACCOUNT}'`);
  c.check('so after both attempts the owner is still the owner', stillOwner.rows[0]?.role === 'owner',
    stillOwner.rows[0]?.role);

  const moveMembership = await as(ADMIN, `update public.account_members set account_id = '${OTHER}'
    where user_id = '${ADMIN}' and account_id = '${ACCOUNT}'`);
  c.check('nobody can move a MEMBERSHIP between accounts: the column grant refuses before RLS is consulted',
    moveMembership.code === '42501', moveMembership.code);

  const moveUser = await as(ADMIN, `update public.account_members set user_id = '${OUTSIDE}'
    where user_id = '${ADMIN}' and account_id = '${ACCOUNT}'`);
  c.check('nor rewrite whose membership it is, for the same reason and with no policy involved',
    moveUser.code === '42501', moveUser.code);

  // ── Moving a DATA row between accounts. The WITH CHECK half of every write policy.
  await wipe();
  const moveIds = await plant();
  const moveRows = await plantRows(moveIds);
  const moves: readonly (readonly [string, string])[] = [
    ['a product', `update batchlabel.products set account_id = '${OTHER}' where id = '${moveRows.products}' returning id`],
    ['a specification', `update batchlabel.specifications set account_id = '${OTHER}' where id = '${moveRows.specifications}' returning id`],
    ['a material', `update batchlabel.materials set account_id = '${OTHER}' where id = '${moveRows.materials}' returning id`],
    ['an artefact', `update batchlabel.artefacts set account_id = '${OTHER}' where id = '${moveRows.artefacts}' returning id`]
  ];
  for (const [what, sql] of moves) {
    const r = await as(EDITOR, sql);
    c.check(`an editor cannot move ${what} into an account they do not belong to`, r.code === '42501',
      `${r.code}/${r.count}`);
  }
  const landed = await q(`select count(*)::int as n from batchlabel.products where account_id = '${OTHER}'`);
  c.check('and nothing arrived in the other account while they were trying', Number(landed.rows[0]?.n) === 0,
    landed.rows[0]?.n);

  const twoOwners = await q(`insert into public.account_members (account_id, user_id, role, status)
    values ('${ACCOUNT}','${SPARE}','owner','active')`);
  c.check('a second active owner is refused by a partial unique index, even for a superuser',
    twoOwners.code === '23505', twoOwners.code);

  const standDown = await as(OWNER, `update public.account_members set role = 'viewer'
    where user_id = '${OWNER}' and account_id = '${ACCOUNT}' returning role`);
  c.check('the owner standing down without transferring is refused at commit, with hint owner_floor',
    standDown.code === 'P0001' && standDown.hint === 'owner_floor',
    `${standDown.code}/${standDown.hint}`);

  const strangerReRoles = await as(OUTSIDE, `update public.account_members set role = 'viewer'
    where account_id = '${ACCOUNT}' returning role`);
  c.check('a stranger cannot re-role anybody in an account they are not in',
    strangerReRoles.ok && strangerReRoles.count === 0, strangerReRoles.count);

  const strangerInserts = await as(OUTSIDE, `insert into public.account_members (account_id, user_id, role, status)
    values ('${ACCOUNT}','${OUTSIDE}','admin','active')`);
  c.check('and cannot invite themselves in: 42501 from the absent grant, and the seat trigger contributed nothing',
    strangerInserts.code === '42501' && strangerInserts.hint === null,
    `${strangerInserts.code}/${strangerInserts.hint}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. INVITES
  // ═══════════════════════════════════════════════════════════════════════════
  const editorMints = await as(EDITOR, `select * from public.create_account_invite(
    '${EDITOR}','${ACCOUNT}','someone@example.com','editor')`);
  c.check('an editor cannot reach the invite mint at all: it is granted to service_role only',
    editorMints.code === '42501', editorMints.code);

  const adminMintsDirect = await as(ADMIN, `select * from public.create_account_invite(
    '${ADMIN}','${ACCOUNT}','someone@example.com','editor')`);
  c.check('and neither can an admin from a browser, because the token must never transit one',
    adminMintsDirect.code === '42501', adminMintsDirect.code);

  const strangerActor = await svc(`select * from public.create_account_invite(
    '${OUTSIDE}','${ACCOUNT}','someone@example.com','editor')`);
  c.check('a stranger named as the actor is refused even on the service-role path',
    strangerActor.code === '42501', strangerActor.code);

  const noSuchAccount = await svc(`select * from public.create_account_invite(
    '${OUTSIDE}','${NOWHERE}','someone@example.com','editor')`);
  c.check('...and the refusal for an account that does not exist is textually identical to that one',
    noSuchAccount.code === '42501' && noSuchAccount.message === strangerActor.message,
    noSuchAccount.message.slice(0, 60));

  const inviteOwner = await svc(`select * from public.create_account_invite(
    '${ADMIN}','${ACCOUNT}','someone@example.com','owner')`);
  c.check('nobody can be invited straight to owner: ownership moves only through the transfer function',
    inviteOwner.code === '22023', inviteOwner.code);

  const inviteOverCeiling = await svc(`select * from public.create_account_invite(
    '${ADMIN}','${ACCOUNT}','extra@example.com','editor')`);
  c.check('an invite past the ceiling is refused at commit, because the reservation is metered too',
    inviteOverCeiling.code === 'P0001' && inviteOverCeiling.hint === 'seat_limit_reached',
    `${inviteOverCeiling.code}/${inviteOverCeiling.hint}`);

  const inviteViewer = await svc(`select invite_id from public.create_account_invite(
    '${ADMIN}','${ACCOUNT}','reviewer@example.com','viewer')`);
  c.check('a read-only invite is admitted however full the account is', inviteViewer.ok, inviteViewer.code);

  // Free a seat so the editor invite below has somewhere to go.
  await db.exec(`update public.account_members set status = 'removed'
    where user_id = '${EDITOR}' and account_id = '${ACCOUNT}';`);

  const mint = await svc(`select invite_id, token from public.create_account_invite(
    '${ADMIN}','${ACCOUNT}','invitee@example.com','editor')`);
  const token = String(mint.rows[0]?.token ?? '');
  c.check('an admin mints an invite through the server and gets a 64 character token back exactly once',
    mint.ok && token.length === 64, mint.code ?? `${token.length} chars`);

  const stored = await q(`select encode(token_hash,'hex') as h from public.account_invites
    where email = 'invitee@example.com' and accepted_at is null and revoked_at is null`);
  c.check('only a hash is stored, so a dump of the table yields nothing redeemable',
    stored.ok && String(stored.rows[0]?.h ?? '') !== token && !String(stored.rows[0]?.h ?? '').includes(token),
    String(stored.rows[0]?.h ?? '').slice(0, 16));

  const reserved = await q(`select public.account_seats_in_use('${ACCOUNT}') as n`);
  c.check('a pending editor invite RESERVES a seat, so an admin cannot oversubscribe by inviting',
    Number(reserved.rows[0]?.n) === 3, reserved.rows[0]?.n);

  const viewerSeesInvites = await as(VIEWER, `select id from public.account_invite_list
    where account_id = '${ACCOUNT}'`);
  c.check('a viewer sees no invites, so the team screen is not an email harvesting surface',
    viewerSeesInvites.ok && viewerSeesInvites.count === 0, viewerSeesInvites.count);

  const starSelect = await as(ADMIN, `select * from public.account_invites`);
  c.check('select * on the column-granted table is 42501 even for the admin entitled to read it',
    starSelect.code === '42501', starSelect.code);

  const adminList = await as(ADMIN, `select email, role, status from public.account_invite_list
    where account_id = '${ACCOUNT}' and status = 'pending'`);
  c.check('which is why the readable surface is a view, and through it the admin sees both invites',
    adminList.ok && adminList.count === 2, `${adminList.code}/${adminList.count}`);

  const readsHash = await as(ADMIN, `select token_hash from public.account_invites`);
  c.check('not even an admin can read token_hash', readsHash.code === '42501', readsHash.code);

  // The existence question, asked now that there is something to give away. The admin above
  // sees two; a stranger must see the same nothing for this account as for one that has never
  // existed, or the invite list becomes a way to confirm an account id and harvest addresses.
  const strangerList = await as(OUTSIDE, `select count(*)::int as n from public.account_invite_list
    where account_id = '${ACCOUNT}'`);
  const strangerNowhere = await as(OUTSIDE, `select count(*)::int as n from public.account_invite_list
    where account_id = '${NOWHERE}'`);
  c.check('a non-member sees the same empty invite list for a real account with two pending as for one that does not exist',
    strangerList.ok && Number(strangerList.rows[0]?.n) === 0 &&
      strangerNowhere.ok && Number(strangerNowhere.rows[0]?.n) === 0 && adminList.count === 2,
    `stranger=${strangerList.rows[0]?.n}/${strangerNowhere.rows[0]?.n} admin=${adminList.count}`);

  const guessed = await as(OUTSIDE, `select outcome from public.accept_account_invite('${'0'.repeat(64)}')`);
  c.check('a GUESSED token gets one flat answer: invalid',
    guessed.ok && guessed.rows[0]?.outcome === 'invalid', guessed.rows[0]?.outcome);

  const emptyToken = await as(OUTSIDE, `select outcome from public.accept_account_invite('')`);
  c.check('an empty token gets the same one', emptyToken.ok && emptyToken.rows[0]?.outcome === 'invalid',
    emptyToken.rows[0]?.outcome);

  const stolen = await as(OUTSIDE, `select outcome from public.accept_account_invite('${token}')`);
  c.check('a STOLEN or forwarded link is useless: the accepting address has to be the invited one',
    stolen.ok && stolen.rows[0]?.outcome === 'wrong_recipient', stolen.rows[0]?.outcome);

  const stolenJoined = await q(`select count(*)::int as n from public.account_members
    where account_id = '${ACCOUNT}' and user_id = '${OUTSIDE}'`);
  c.check('and the thief is not a member afterwards', Number(stolenJoined.rows[0]?.n) === 0,
    stolenJoined.rows[0]?.n);

  // EXPIRED: a real token minted by hand with a past expiry, addressed to the viewer rather
  // than the invitee because the one-live-invite-per-address index cannot know about expiry
  // (an index predicate must be IMMUTABLE and now() is not), so a second row for
  // invitee@example.com would collide with the live one above.
  await db.exec(`insert into public.account_invites (account_id, email, role, token_hash, invited_by, expires_at)
    values ('${ACCOUNT}','viewer@example.com','viewer',${hashOf('expired-token')},'${ADMIN}', now() - interval '1 day');`);
  const expired = await as(VIEWER, `select outcome from public.accept_account_invite('expired-token')`);
  c.check('an EXPIRED token says so, because reaching that branch needs a real token anyway',
    expired.ok && expired.rows[0]?.outcome === 'expired', expired.rows[0]?.outcome);

  const accepted = await as(INVITEE, `select outcome, joined_account_id, joined_role
    from public.accept_account_invite('${token}')`);
  c.check('the invited person joins, at the invited role',
    accepted.ok && accepted.rows[0]?.outcome === 'accepted' &&
      accepted.rows[0]?.joined_account_id === ACCOUNT && accepted.rows[0]?.joined_role === 'editor',
    JSON.stringify(accepted.rows[0] ?? accepted.message));

  const replayed = await as(INVITEE, `select outcome from public.accept_account_invite('${token}')`);
  c.check('a REPLAYED token is invalid, and is not told that somebody else already used it',
    replayed.ok && replayed.rows[0]?.outcome === 'invalid', replayed.rows[0]?.outcome);

  const replayedByAnother = await as(SPARE, `select outcome from public.accept_account_invite('${token}')`);
  c.check('and replaying it as a different person says the same word, not a different one',
    replayedByAnother.ok && replayedByAnother.rows[0]?.outcome === 'invalid',
    replayedByAnother.rows[0]?.outcome);

  const afterAccept = await q(`select public.account_seats_in_use('${ACCOUNT}') as n`);
  c.check('accepting is a SWAP: the reservation is released as the seat is taken, so the count is unchanged',
    Number(afterAccept.rows[0]?.n) === 3, afterAccept.rows[0]?.n);

  const revokedToken = 'revoked-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  await db.exec(`insert into public.account_invites (account_id, email, role, token_hash, invited_by, revoked_at)
    values ('${ACCOUNT}','spare@example.com','viewer',${hashOf(revokedToken)},'${ADMIN}', now());`);
  const revoked = await as(SPARE, `select outcome from public.accept_account_invite('${revokedToken}')`);
  c.check('a REVOKED token is invalid, collapsed with unknown so a holder is not told they were withdrawn',
    revoked.ok && revoked.rows[0]?.outcome === 'invalid', revoked.rows[0]?.outcome);

  // ── RE-ADMISSION. `on conflict do nothing` answers "accepted" to somebody who is not a
  //    member, which was reproduced before the three-way rule replaced it.
  await db.exec(`update public.account_members set status = 'removed'
    where user_id = '${INVITEE}' and account_id = '${ACCOUNT}';`);
  await db.exec(`insert into public.account_invites (account_id, email, role, token_hash, invited_by)
    values ('${ACCOUNT}','invitee@example.com','editor',${hashOf('re-admit-token')},'${ADMIN}');`);
  const readmit = await as(INVITEE, `select outcome, joined_role
    from public.accept_account_invite('re-admit-token')`);
  c.check('a previously REMOVED person can be invited back',
    readmit.ok && readmit.rows[0]?.outcome === 'accepted',
    JSON.stringify(readmit.rows[0] ?? readmit.message));

  const readmitted = await q(`select role, status from public.account_members
    where user_id = '${INVITEE}' and account_id = '${ACCOUNT}'`);
  c.check('and is really a member afterwards, which `on conflict do nothing` would not have been',
    readmitted.rows[0]?.status === 'active' && readmitted.rows[0]?.role === 'editor',
    JSON.stringify(readmitted.rows[0]));

  // ── THE TIE, PINNED. The four checks above used to fail about half the time, and the cause
  //    was not any of them: the sanction guard read `created_at <= updated_at` and refused the
  //    tie. now() is the TRANSACTION timestamp and PGlite's clock resolves to a millisecond, so
  //    a removal and the re-invitation after it land on the same value whenever they run inside
  //    one tick — measured at 19 collisions in 40 consecutive pairs. Reproducing that by racing
  //    the clock would only reproduce it sometimes, which is the property that let it reach a
  //    pull request, so both cases below CONSTRUCT the timestamp relationship in SQL instead.
  //    They cannot flake in either direction.
  //
  //    Role is 'viewer' on purpose: viewers are free and unlimited, so nothing here can fail for
  //    want of a seat and read as a timestamp bug.
  await db.exec(`update public.account_members set status = 'removed'
    where user_id = '${INVITEE}' and account_id = '${ACCOUNT}';`);
  await db.exec(`insert into public.account_invites
      (account_id, email, role, token_hash, invited_by, created_at)
    select '${ACCOUNT}','invitee@example.com','viewer',${hashOf('tie-token')},'${ADMIN}', am.updated_at
      from public.account_members am
     where am.user_id = '${INVITEE}' and am.account_id = '${ACCOUNT}';`);
  const tie = await as(INVITEE, `select outcome from public.accept_account_invite('tie-token')`);
  c.check('an invite minted in the SAME instant as the removal is admitted, because a tie cannot say which came first',
    tie.ok && tie.rows[0]?.outcome === 'accepted',
    JSON.stringify(tie.rows[0] ?? tie.message));

  const tieMember = await q(`select role, status from public.account_members
    where user_id = '${INVITEE}' and account_id = '${ACCOUNT}'`);
  c.check('and the tie really re-admits rather than merely answering accepted',
    tieMember.rows[0]?.status === 'active' && tieMember.rows[0]?.role === 'viewer',
    JSON.stringify(tieMember.rows[0]));

  // CLEAR THE SLOT BEFORE THE NEXT MINT, and the reason is a failure mode this pair produced
  // while being written. A refused invite is still LIVE, so under the bug the tie token above
  // survives and the next insert for the same address trips
  // account_invites_one_live_per_email — which throws, aborts run() and reports ZERO of this
  // file's checks instead of the handful that actually broke. A regression has to read as
  // failed assertions naming the fault, not as a suite that did not start.
  await db.exec(`update public.account_invites set revoked_at = now()
    where email = 'invitee@example.com' and accepted_at is null and revoked_at is null;`);

  // The other half of the same fix: conceding the tie must not concede the attack. An invite
  // minted STRICTLY before the removal is the key somebody was already holding when they were
  // thrown out, and it stays refused.
  await db.exec(`update public.account_members set status = 'removed'
    where user_id = '${INVITEE}' and account_id = '${ACCOUNT}';`);
  await db.exec(`insert into public.account_invites
      (account_id, email, role, token_hash, invited_by, created_at)
    select '${ACCOUNT}','invitee@example.com','viewer',${hashOf('predates-token')},'${ADMIN}',
           am.updated_at - interval '1 second'
      from public.account_members am
     where am.user_id = '${INVITEE}' and am.account_id = '${ACCOUNT}';`);
  const predates = await as(INVITEE, `select outcome from public.accept_account_invite('predates-token')`);
  c.check('while an invite minted STRICTLY before the removal is still refused, so the sanction still bites',
    predates.ok && predates.rows[0]?.outcome === 'invalid',
    JSON.stringify(predates.rows[0] ?? predates.message));

  const stillOut = await q(`select status from public.account_members
    where user_id = '${INVITEE}' and account_id = '${ACCOUNT}'`);
  c.check('and that person is still out',
    stillOut.rows[0]?.status === 'removed', JSON.stringify(stillOut.rows[0]));

  // Put the fixture back where the rest of this section expects it: an active editor.
  await db.exec(`update public.account_members set status = 'active', role = 'editor'
    where user_id = '${INVITEE}' and account_id = '${ACCOUNT}';`);

  await db.exec(`insert into public.account_invites (account_id, email, role, token_hash, invited_by)
    values ('${ACCOUNT}','admin@example.com','viewer',${hashOf('stale-token')},'${OWNER}');`);
  await as(ADMIN, `select outcome from public.accept_account_invite('stale-token')`);
  const stillAdmin = await q(`select role from public.account_members
    where user_id = '${ADMIN}' and account_id = '${ACCOUNT}'`);
  c.check('a stale lesser invite cannot demote a sitting admin', stillAdmin.rows[0]?.role === 'admin',
    stillAdmin.rows[0]?.role);

  const beforeRevoke = await num(`select public.account_seats_in_use('${ACCOUNT}') as n`);
  await db.exec(`update public.account_members set status = 'removed'
    where user_id = '${INVITEE}' and account_id = '${ACCOUNT}';`);
  await svc(`select * from public.create_account_invite('${ADMIN}','${ACCOUNT}','later@example.com','editor')`);
  const withPending = await num(`select public.account_seats_in_use('${ACCOUNT}') as n`);
  const revoke = await as(ADMIN, `update public.account_invites set revoked_at = now()
    where email = 'later@example.com' and revoked_at is null returning id`);
  c.check('an admin withdraws an invite with a plain PATCH on the one writable column',
    revoke.ok && revoke.count === 1, `${revoke.code}/${revoke.count}`);
  const afterRevoke = await num(`select public.account_seats_in_use('${ACCOUNT}') as n`);
  c.check('and withdrawing returns the reserved seat at once, because the count is derived',
    withPending === beforeRevoke && afterRevoke === beforeRevoke - 1,
    `${beforeRevoke} -> ${withPending} -> ${afterRevoke}`);

  const viewerRevokes = await as(VIEWER, `update public.account_invites set revoked_at = now()
    where account_id = '${ACCOUNT}' returning id`);
  c.check('a viewer withdraws nothing, because the invite policy is manage_members on both slots',
    viewerRevokes.ok && viewerRevokes.count === 0, `${viewerRevokes.code}/${viewerRevokes.count}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. MEMBERSHIP IDENTITY AND TWO ACCOUNTS
  // ═══════════════════════════════════════════════════════════════════════════
  await db.exec(`update public.account_members set status = 'active'
    where user_id = '${INVITEE}' and account_id = '${ACCOUNT}';`);

  const viewForInvited = await as(INVITEE, `select account_id from public.entitlements where brand = 'batchlabel'`);
  c.check('THE FINDING: an active invited member gets ZERO ROWS from public.entitlements, which is keyed by ownership',
    viewForInvited.ok && viewForInvited.count === 0, viewForInvited.count);

  const mine = await as(INVITEE, `select account_id, role, role_rank from public.my_accounts()`);
  c.check('while my_accounts() returns the account they were invited to, with the role they hold in it',
    mine.ok && mine.count === 1 && mine.rows[0]?.account_id === ACCOUNT && mine.rows[0]?.role === 'editor',
    JSON.stringify(mine.rows));

  const invitedEnt = await as(INVITEE, `select plan, editor_seat_limit, caller_role, sku_limit, can_modify
    from public.account_entitlement('${ACCOUNT}')`);
  c.check('and account_entitlement gives them the ACCOUNT allowance plus their own role',
    invitedEnt.ok && invitedEnt.count === 1 && invitedEnt.rows[0]?.plan === 'studio' &&
      invitedEnt.rows[0]?.caller_role === 'editor' && Number(invitedEnt.rows[0]?.editor_seat_limit) === 3,
    JSON.stringify(invitedEnt.rows[0] ?? invitedEnt.message));

  // ── The second account. OUTSIDE plants a row of their own for the reads below to aim at.
  await db.exec(`insert into batchlabel.materials (id, account_id, material_class, name)
    values ('eeeeeeee-0000-0000-0000-000000000001','${OTHER}','ingredient','Other account secret wax');`);
  await db.exec(`insert into public.account_members (account_id, user_id, role, status)
    values ('${OTHER}','${INVITEE}','editor','active');`);

  const both = await as(INVITEE, `select account_id, role from public.my_accounts() order by account_id`);
  c.check('a person in two accounts gets both from my_accounts(), with the right role in each',
    both.ok && both.count === 2 && both.rows[0]?.account_id === ACCOUNT && both.rows[1]?.account_id === OTHER,
    JSON.stringify(both.rows));

  const ambiguous = await as(INVITEE, `select public.current_account_id() as id`);
  c.check('current_account_id() returns NULL for them, exactly as its comment promises it always will',
    ambiguous.ok && ambiguous.rows[0]?.id === null, ambiguous.rows[0]?.id);

  const omitted = await as(INVITEE, `insert into batchlabel.materials (name, material_class)
    values ('no account named','ingredient')`);
  c.check('so an insert that omits account_id is a P0001 the app can act on, not a bare refusal',
    omitted.code === 'P0001' && omitted.hint === 'account_ambiguous', `${omitted.code}/${omitted.hint}`);

  const omittedIdentity = await as(INVITEE, `insert into batchlabel.business_identity (registered_name)
    values ('no account named')`);
  c.check('business_identity says the same thing, where before this migration it gave a bare 42501',
    omittedIdentity.code === 'P0001' && omittedIdentity.hint === 'account_ambiguous',
    `${omittedIdentity.code}/${omittedIdentity.hint}`);

  const omittedPrefs = await as(INVITEE, `insert into batchlabel.workspace_preferences (default_market)
    values ('GB')`);
  c.check('and so does workspace_preferences', omittedPrefs.code === 'P0001' &&
    omittedPrefs.hint === 'account_ambiguous', `${omittedPrefs.code}/${omittedPrefs.hint}`);

  const intoFirst = await as(INVITEE, `insert into batchlabel.materials (account_id, material_class, name)
    values ('${ACCOUNT}','ingredient','Filed into the first account') returning account_id`);
  const intoSecond = await as(INVITEE, `insert into batchlabel.materials (account_id, material_class, name)
    values ('${OTHER}','ingredient','Filed into the second account') returning account_id`);
  c.check('naming the account explicitly still works for a two-account person, and lands where it was told',
    intoFirst.ok && intoFirst.rows[0]?.account_id === ACCOUNT &&
      intoSecond.ok && intoSecond.rows[0]?.account_id === OTHER,
    `${intoFirst.rows[0]?.account_id} / ${intoSecond.rows[0]?.account_id}`);

  const filedRight = await q(`select
      (select count(*)::int from batchlabel.materials
        where account_id = '${ACCOUNT}' and name = 'Filed into the first account') as first,
      (select count(*)::int from batchlabel.materials
        where account_id = '${OTHER}' and name = 'Filed into the second account') as second,
      (select count(*)::int from batchlabel.materials
        where account_id = '${OTHER}' and name = 'Filed into the first account') as crossed`);
  c.check('measured from outside the session: one row in each account and nothing crossed over',
    Number(filedRight.rows[0]?.first) === 1 && Number(filedRight.rows[0]?.second) === 1 &&
      Number(filedRight.rows[0]?.crossed) === 0,
    JSON.stringify(filedRight.rows[0]));

  const scopedToSecond = await as(INVITEE, `select name from batchlabel.materials
    where account_id = '${OTHER}'`);
  c.check('ACTING IN THE SECOND ACCOUNT: a read scoped to it never returns the first account\'s rows',
    scopedToSecond.ok && scopedToSecond.count >= 1 &&
      scopedToSecond.rows.every((r: Row) => String(r.name) !== 'Filed into the first account'),
    `${scopedToSecond.count} rows: ${scopedToSecond.rows.map((r: Row) => r.name).join(', ')}`);

  // THE RESIDUAL, STATED RATHER THAN HIDDEN. The database has no session-level notion of
  // which account a person is "acting in": RLS answers on membership, so an UNSCOPED read by
  // a member of two accounts returns both. That is why the scoping is the app's job, and why
  // the ratified design repoints the client at my_accounts() and an ActiveAccountProvider
  // rather than leaving it to current_account_id(). This check exists so the day somebody
  // believes the database is doing it for them, it is written down that it is not.
  const unscoped = await as(INVITEE, `select count(*)::int as n from batchlabel.materials`);
  const inFirst = await num(`select count(*)::int as n from batchlabel.materials where account_id = '${ACCOUNT}'`);
  const inSecond = await num(`select count(*)::int as n from batchlabel.materials where account_id = '${OTHER}'`);
  c.check('an UNSCOPED read returns both accounts, because the database has no idea which one you are in',
    unscoped.ok && Number(unscoped.rows[0]?.n) === inFirst + inSecond && inFirst > 0 && inSecond > 0,
    `${unscoped.rows[0]?.n} = ${inFirst} + ${inSecond}`);

  const thirdAccount = await as(INVITEE, `select count(*)::int as n from batchlabel.materials
    where account_id = '${NOWHERE}'`);
  c.check('and a third account they are not in is invisible to them whatever they scope to',
    thirdAccount.ok && Number(thirdAccount.rows[0]?.n) === 0, thirdAccount.rows[0]?.n);

  const otherEnt = await as(EDITOR, `select plan from public.account_entitlement('${OTHER}')`);
  c.check('a member of one account learns nothing about another through account_entitlement',
    otherEnt.ok && otherEnt.count === 0, otherEnt.count);

  await db.exec(`delete from public.account_members where account_id = '${OTHER}' and user_id = '${INVITEE}';`);

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. OWNERSHIP DOES NOT MOVE, AND EVERY DOOR TO IT IS SHUT
  //
  // An earlier draft shipped public.transfer_account_ownership, granted to `authenticated`.
  // It was reproduced doing four incompatible things: stripping the account of its plan when
  // handed to a member with no brand_memberships row (which is every invited teammate),
  // raising a bare 23505 when handed to one who has such a row (because every such person
  // already owns an account), letting a BRAND-SUSPENDED owner restore themselves and everyone
  // else, and combining with complete_oauth_signup's repair path into an unbounded seat farm.
  // Section 8 of the migration carries the measurements. These checks are the residue: the
  // function is gone, and no other path can move accounts.owner_user_id or empty the seat it
  // names.
  // ═══════════════════════════════════════════════════════════════════════════
  const transferGone = await q(`select count(*)::int as n from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'transfer_account_ownership'`);
  c.check('there is no transfer_account_ownership function, at any signature',
    Number(transferGone.rows[0]?.n) === 0, transferGone.rows[0]?.n);

  const ownerCalls = await as(OWNER, `select public.transfer_account_ownership('${ACCOUNT}','${ADMIN}') as r`);
  c.check('so the owner calling it gets "no such function" rather than a corrupted account',
    ownerCalls.code === '42883', ownerCalls.code);

  const serviceCalls = await svc(`select public.transfer_account_ownership('${ACCOUNT}','${ADMIN}') as r`);
  c.check('and the server cannot reach it either, so no support script can do it by accident',
    serviceCalls.code === '42883', serviceCalls.code);

  const repoint = await as(OWNER, `update public.accounts set owner_user_id = '${ADMIN}'
    where id = '${ACCOUNT}' returning id`);
  c.check('the owner cannot repoint accounts.owner_user_id by hand: no UPDATE grant at all',
    repoint.code === '42501', repoint.code);

  const ownerStandsDown = await as(OWNER, `update public.account_members set role = 'admin'
    where account_id = '${ACCOUNT}' and user_id = '${OWNER}' returning id`);
  c.check('and the owner cannot stand down, because an account with no owner has nobody to bill',
    ownerStandsDown.hint === 'owner_floor', `${ownerStandsDown.code} ${ownerStandsDown.hint}`);

  // The floor cannot listen for DELETE (a cascade from accounts fires child constraint
  // triggers, so it would make erasure impossible), so the DELETE itself has to be
  // unreachable. Reproduced before the revoke: standing down by UPDATE was refused and the
  // same thing by DELETE committed, leaving zero active owners and a live plan.
  const svcDelete = await svc(`delete from public.account_members
    where account_id = '${ACCOUNT}' and user_id = '${VIEWER}' returning id`);
  c.check('nobody deletes a membership row, not even the service role: removal is a status',
    svcDelete.code === '42501', svcDelete.code);

  const ownersIntact = await num(`select count(*)::int as n from public.account_members
    where account_id = '${ACCOUNT}' and role = 'owner' and status = 'active'`);
  c.check('the account still has exactly one active owner after all of that', ownersIntact === 1, ownersIntact);

  // ═══════════════════════════════════════════════════════════════════════════
  // 9b. THE REST OF THE REPRODUCED EXPLOITS, ONE NAMED CHECK EACH
  //
  // Fresh identities: see the note on the R_ constants. Each block below fails on the
  // pre-fix migration and passes on this one.
  // ═══════════════════════════════════════════════════════════════════════════
  await db.exec(`
    insert into auth.users (id, email) values
      ('${R_OWNER}', 'r-owner@example.com'),
      ('${R_ROGUE}', 'r-rogue@example.com'),
      ('${R_SEAT}',  'r-seat@example.com'),
      ('${R_VIEWER}','r-viewer@example.com'),
      ('${R_ALIAS}', 'r-alias@example.com'),
      ('${R_FROZEN}','r-frozen@example.com'),
      ('${R_BOTH}',  'r-both@example.com'),
      ('${R_THIEF}', 'r-thief@example.com');

    insert into public.brand_memberships
      (user_id, brand_slug, status, plan, plan_status, editor_seat_limit, sku_limit)
    values
      ('${R_OWNER}', 'batchlabel', 'active', 'studio', 'active', 8, 180),
      ('${R_FROZEN}','batchlabel', 'active', 'studio', 'active', 8, 180),
      ('${R_THIEF}', 'batchlabel', 'active', 'free',   'active', 1, 3);

    insert into public.accounts (id, brand_slug, owner_user_id, name) values
      ('${R_ACCT}',        'batchlabel', '${R_OWNER}',  'Regression Co'),
      ('${R_FROZEN_ACCT}', 'batchlabel', '${R_FROZEN}', 'Frozen Co'),
      ('${R_THIEF_ACCT}',  'batchlabel', '${R_THIEF}',  'Thief Co');

    insert into public.account_members (account_id, user_id, role, status) values
      ('${R_ACCT}',        '${R_OWNER}',  'owner',  'active'),
      ('${R_ACCT}',        '${R_ROGUE}',  'admin',  'active'),
      ('${R_ACCT}',        '${R_SEAT}',   'editor', 'active'),
      ('${R_ACCT}',        '${R_VIEWER}', 'viewer', 'active'),
      ('${R_FROZEN_ACCT}', '${R_FROZEN}', 'owner',  'active'),
      ('${R_FROZEN_ACCT}', '${R_BOTH}',   'editor', 'active'),
      ('${R_THIEF_ACCT}',  '${R_THIEF}',  'owner',  'active');
  `);

  // ── (a) A KEY MINTED BEFORE THE SANCTION DOES NOT SURVIVE IT ────────────────
  // Reproduced: an active admin had the server mint an invite to their own address, the owner
  // removed them, and redeeming the token they already held answered accepted / admin. Every
  // direct path was correctly shut; this one skipped RLS entirely because
  // accept_account_invite is SECURITY DEFINER.
  const preMinted = await svc(
    `select token from public.create_account_invite('${R_ROGUE}','${R_ACCT}','r-rogue@example.com','admin')`);
  const preToken = String(preMinted.rows[0]?.token);
  await as(R_OWNER, `update public.account_members set status = 'removed'
    where account_id = '${R_ACCT}' and user_id = '${R_ROGUE}'`);

  const heldInvite = await q(`select status from public.account_invite_list
    where account_id = '${R_ACCT}' and email = 'r-rogue@example.com'`);
  c.check('removing somebody withdraws the live invitation addressed to them',
    heldInvite.rows[0]?.status === 'revoked', heldInvite.rows[0]?.status);

  const redeemed = await as(R_ROGUE, `select outcome, joined_role from public.accept_account_invite('${preToken}')`);
  c.check('so a REMOVED member redeeming a token they minted for themselves is refused',
    redeemed.ok && redeemed.rows[0]?.outcome === 'invalid', JSON.stringify(redeemed.rows[0]));

  const rogueRank = await as(R_ROGUE,
    `select public.account_rank('${R_ACCT}') as rank, public.can('${R_ACCT}','manage_members') as manage`);
  c.check('and they are still nobody in that account afterwards',
    rogueRank.rows[0]?.rank === null && rogueRank.rows[0]?.manage === false,
    JSON.stringify(rogueRank.rows[0]));

  // The other half of that ruling: a genuine re-invitation, minted after the removal, still
  // works. Closing the exploit by refusing all re-admission would have re-created the shipping
  // bug the three-way upsert exists to fix.
  const genuine = await svc(
    `select token from public.create_account_invite('${R_OWNER}','${R_ACCT}','r-rogue@example.com','editor')`);
  const backIn = await as(R_ROGUE,
    `select outcome, joined_role from public.accept_account_invite('${String(genuine.rows[0]?.token)}')`);
  const backInRow = await q(`select role, status from public.account_members
    where account_id = '${R_ACCT}' and user_id = '${R_ROGUE}'`);
  c.check('a FRESH invitation minted after the removal still re-admits them, at the invited role',
    backIn.rows[0]?.outcome === 'accepted' && backIn.rows[0]?.joined_role === 'editor' &&
      backInRow.rows[0]?.role === 'editor' && backInRow.rows[0]?.status === 'active',
    `${JSON.stringify(backIn.rows[0])} ${JSON.stringify(backInRow.rows[0])}`);

  // ── (b) AND THE BACK DOOR THEY LEFT FOR SOMEBODY ELSE ──────────────────────
  // A departing admin's own address is not the only key they hold. An invite they SENT to an
  // address they control admits a second identity that nobody sanctioned.
  await q(`update public.account_members set role = 'admin'
    where account_id = '${R_ACCT}' and user_id = '${R_ROGUE}'`);
  const alias = await svc(
    `select token from public.create_account_invite('${R_ROGUE}','${R_ACCT}','r-alias@example.com','admin')`);
  await as(R_OWNER, `update public.account_members set status = 'suspended'
    where account_id = '${R_ACCT}' and user_id = '${R_ROGUE}'`);
  const aliasStatus = await q(`select status from public.account_invite_list
    where account_id = '${R_ACCT}' and email = 'r-alias@example.com'`);
  const aliasRedeem = await as(R_ALIAS,
    `select outcome from public.accept_account_invite('${String(alias.rows[0]?.token)}')`);
  c.check('suspending somebody also withdraws the invitations they SENT, so no alias walks in later',
    aliasStatus.rows[0]?.status === 'revoked' && aliasRedeem.rows[0]?.outcome === 'invalid',
    `${aliasStatus.rows[0]?.status} / ${aliasRedeem.rows[0]?.outcome}`);

  await q(`update public.account_members set status = 'removed'
    where account_id = '${R_ACCT}' and user_id = '${R_ROGUE}'`);

  // ── (c) THE RPC REPORTS THE ROLE IT WROTE, NOT THE ONE IT WAS ASKED FOR ────
  // Reproduced: a sitting viewer redeemed an editor invite, the row stayed viewer, and the RPC
  // answered joined_role = 'editor'. src/pages/AcceptInvite.tsx renders that value, so the
  // customer read "You have joined as editor" on a screen whose every write then died 42501.
  const promoteInvite = await svc(
    `select token from public.create_account_invite('${R_OWNER}','${R_ACCT}','r-viewer@example.com','editor')`);
  const promoted = await as(R_VIEWER,
    `select outcome, joined_role from public.accept_account_invite('${String(promoteInvite.rows[0]?.token)}')`);
  const promotedRow = await q(`select role from public.account_members
    where account_id = '${R_ACCT}' and user_id = '${R_VIEWER}'`);
  c.check('a sitting viewer redeeming an editor invite is promoted, and told the role they now hold',
    promoted.rows[0]?.outcome === 'accepted' &&
      promoted.rows[0]?.joined_role === promotedRow.rows[0]?.role &&
      promotedRow.rows[0]?.role === 'editor',
    `${JSON.stringify(promoted.rows[0])} row=${promotedRow.rows[0]?.role}`);

  const promotedWrites = await as(R_VIEWER, `insert into batchlabel.specifications
    (account_id, name, category_id) values ('${R_ACCT}','after the promotion','home-fragrance') returning id`);
  c.check('and the promotion is real, not just reported', promotedWrites.ok && promotedWrites.count === 1,
    promotedWrites.code);

  // The concern the old rule existed to protect, kept: a lesser invite cannot demote anybody.
  const demoteInvite = await svc(
    `select token from public.create_account_invite('${R_OWNER}','${R_ACCT}','r-seat@example.com','viewer')`);
  const notDemoted = await as(R_SEAT,
    `select outcome, joined_role from public.accept_account_invite('${String(demoteInvite.rows[0]?.token)}')`);
  const seatRow = await q(`select role from public.account_members
    where account_id = '${R_ACCT}' and user_id = '${R_SEAT}'`);
  c.check('a sitting editor redeeming a read-only invite keeps their role, and is told so',
    notDemoted.rows[0]?.joined_role === 'editor' && seatRow.rows[0]?.role === 'editor',
    `${JSON.stringify(notDemoted.rows[0])} row=${seatRow.rows[0]?.role}`);

  // ── (d) AN INVITE TO SOMEBODY ALREADY PAID FOR RESERVES NOTHING ────────────
  // Reproduced on a three-seat plan holding owner + admin: inviting the admin's own address
  // took seats_in_use from 2 to 3 against a head count of 2, and the genuine third hire was
  // refused. The team screen printed "3 of 3 in use" beside a list showing two people.
  const seatsBefore = await num(`select public.account_seats_in_use('${R_ACCT}')::int as n`);
  await svc(`select 1 from public.create_account_invite('${R_OWNER}','${R_ACCT}','r-seat@example.com','editor')`);
  const seatsAfter = await num(`select public.account_seats_in_use('${R_ACCT}')::int as n`);
  c.check('re-inviting somebody who already holds a seat does not book them a second one',
    seatsBefore === seatsAfter, `${seatsBefore} -> ${seatsAfter}`);

  const genuineHire = await svc(
    `select token from public.create_account_invite('${R_OWNER}','${R_ACCT}','r-hire@example.com','editor')`);
  c.check('so the genuine next hire is still admitted rather than refused for a seat nobody holds',
    genuineHire.ok && genuineHire.count === 1, `${genuineHire.code} ${genuineHire.hint}`);

  // ...and the reservation itself is intact for somebody who does NOT hold a seat. Discounting
  // on membership alone rather than on consumes_seat would have broken this.
  const seatsWithHire = await num(`select public.account_seats_in_use('${R_ACCT}')::int as n`);
  c.check('while an invite to a genuinely new person still reserves a seat',
    seatsWithHire === seatsAfter + 1, `${seatsAfter} -> ${seatsWithHire}`);

  // ── (e) A UNIQUE KEY COLLISION IS NOT AN ANSWER ABOUT ANOTHER ACCOUNT ──────
  // Reproduced: a removed editor reconstructed a competitor's CLP hazard profile and label
  // revision count from nothing but the difference between 23505 and 23503, because PostgreSQL
  // checks the unique index before the account-scoped foreign key.
  const vMaterial = await one(`insert into batchlabel.materials (account_id, material_class, name)
    values ('${R_ACCT}','ingredient','Victim oil') returning id`);
  const vSpec = await one(`insert into batchlabel.specifications (account_id, name, category_id)
    values ('${R_ACCT}','Victim formula','home-fragrance') returning id`);
  const vProduct = await one(`insert into batchlabel.products (account_id, specification_id, name)
    values ('${R_ACCT}','${vSpec}','Victim candle') returning id`);
  await db.exec(`
    insert into batchlabel.material_hazards (account_id, material_id, code, statement, hazard_class)
      values ('${R_ACCT}','${vMaterial}','H317','May cause an allergic skin reaction','Skin Sens. 1');
    insert into batchlabel.material_allergens (account_id, material_id, name, pct)
      values ('${R_ACCT}','${vMaterial}','Linalool',2.5);
    insert into batchlabel.material_ifra_limits (account_id, material_id, category, max_pct)
      values ('${R_ACCT}','${vMaterial}','4',10);
    insert into batchlabel.artefacts (account_id, product_id, artefact_type, version, specification_hash)
      values ('${R_ACCT}','${vProduct}','unit-label',1,'victim-1');
  `);

  const probes: readonly { readonly label: string; readonly has: string; readonly lacks: string }[] = [
    {
      label: 'material_hazards (material_id, code)',
      has: `insert into batchlabel.material_hazards (account_id, material_id, code, statement, hazard_class)
            values ('${R_THIEF_ACCT}','${vMaterial}','H317','x','y') returning id`,
      lacks: `insert into batchlabel.material_hazards (account_id, material_id, code, statement, hazard_class)
              values ('${R_THIEF_ACCT}','${vMaterial}','H999','x','y') returning id`
    },
    {
      label: 'material_allergens (material_id, lower(name))',
      has: `insert into batchlabel.material_allergens (account_id, material_id, name, pct)
            values ('${R_THIEF_ACCT}','${vMaterial}','Linalool',1) returning id`,
      lacks: `insert into batchlabel.material_allergens (account_id, material_id, name, pct)
              values ('${R_THIEF_ACCT}','${vMaterial}','Citral',1) returning id`
    },
    {
      label: 'material_ifra_limits (material_id, category)',
      has: `insert into batchlabel.material_ifra_limits (account_id, material_id, category, max_pct)
            values ('${R_THIEF_ACCT}','${vMaterial}','4',5) returning id`,
      lacks: `insert into batchlabel.material_ifra_limits (account_id, material_id, category, max_pct)
              values ('${R_THIEF_ACCT}','${vMaterial}','11',5) returning id`
    },
    {
      label: 'artefacts (product_id, artefact_type, version)',
      has: `insert into batchlabel.artefacts (account_id, product_id, artefact_type, version, specification_hash)
            values ('${R_THIEF_ACCT}','${vProduct}','unit-label',1,'probe') returning id`,
      lacks: `insert into batchlabel.artefacts (account_id, product_id, artefact_type, version, specification_hash)
              values ('${R_THIEF_ACCT}','${vProduct}','unit-label',99,'probe') returning id`
    }
  ];

  for (const probe of probes) {
    const has = await as(R_THIEF, probe.has);
    const lacks = await as(R_THIEF, probe.lacks);
    c.check(
      `a stranger probing ${probe.label} learns nothing: the row that EXISTS and the row that does not answer identically`,
      !has.ok && !lacks.ok && has.code === lacks.code && has.code === '23503',
      `exists -> ${has.code}, absent -> ${lacks.code}`);
  }

  // The half that would make the fix useless if it broke: uniqueness still bites at home.
  const ownDuplicate = await as(R_OWNER,
    `insert into batchlabel.material_hazards (account_id, material_id, code, statement, hazard_class)
     values ('${R_ACCT}','${vMaterial}','H317','again','again') returning id`);
  c.check('and the same key still refuses a duplicate INSIDE the account that owns the row',
    ownDuplicate.code === '23505', ownDuplicate.code);

  // ── (f) current_account_id AND my_accounts AGREE ABOUT WHO IS A MEMBER ─────
  // Reproduced: a person in two accounts, one of them frozen at the brand level, was ONE
  // account to my_accounts and TWO to current_account_id. src/lib/active-account.tsx renders no
  // switcher for one account, so they were told by P0001/account_ambiguous that they were in
  // several, with no action available to them.
  await db.exec(`insert into public.account_members (account_id, user_id, role, status)
    values ('${R_ACCT}','${R_BOTH}','editor','active');`);
  await db.exec(`update public.brand_memberships set status = 'suspended' where user_id = '${R_FROZEN}';`);

  const bothMine = await as(R_BOTH, `select account_id from public.my_accounts()`);
  const bothCurrent = await as(R_BOTH, `select public.current_account_id() as a`);
  c.check('a member of one usable account and one frozen one gets a single answer from both functions',
    bothMine.count === 1 && bothMine.rows[0]?.account_id === R_ACCT &&
      bothCurrent.rows[0]?.a === R_ACCT,
    `my_accounts ${bothMine.count} rows, current_account_id ${bothCurrent.rows[0]?.a}`);

  const bothWrites = await as(R_BOTH, `insert into batchlabel.specifications (name, category_id)
    values ('no account named','home-fragrance') returning id`);
  c.check('so an insert that omits account_id lands in the one account they can use',
    bothWrites.ok && bothWrites.count === 1, `${bothWrites.code} ${bothWrites.hint}`);

  // ...and the ambiguity guard is intact for somebody genuinely in two usable accounts.
  await db.exec(`update public.brand_memberships set status = 'active' where user_id = '${R_FROZEN}';`);
  const reallyAmbiguous = await as(R_BOTH, `select public.current_account_id() as a`);
  const ambiguousWrite = await as(R_BOTH, `insert into batchlabel.specifications (name, category_id)
    values ('two usable accounts','home-fragrance') returning id`);
  c.check('while two USABLE accounts still refuse an insert that does not say which one it means',
    reallyAmbiguous.rows[0]?.a === null && ambiguousWrite.hint === 'account_ambiguous',
    `${reallyAmbiguous.rows[0]?.a} / ${ambiguousWrite.code} ${ambiguousWrite.hint}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. THE STRUCTURAL CENSUS, WHICH IS WHAT CATCHES A TABLE LEFT BEHIND
  // ═══════════════════════════════════════════════════════════════════════════
  const census = await q(`select
      count(*) filter (where cmd = 'SELECT' and coalesce(qual,'') like '%is_member_of%')                     as selects,
      count(*) filter (where cmd <> 'SELECT' and (coalesce(qual,'')||coalesce(with_check,'')) like '%is_member_of%') as writes_on_old,
      count(*) filter (where cmd <> 'SELECT' and schemaname = 'batchlabel'
                       and (coalesce(qual,'')||coalesce(with_check,'')) like '%can(account_id%')             as writes_on_can
    from pg_policies where schemaname in ('public','batchlabel')`);
  c.check('the census: 18 SELECT policies untouched, 0 write policies left on is_member_of, 37 on a capability',
    Number(census.rows[0]?.selects) === 18 && Number(census.rows[0]?.writes_on_old) === 0 &&
      Number(census.rows[0]?.writes_on_can) === 37,
    JSON.stringify(census.rows[0]));

  const doctrine = await q(`select count(*)::int as n from pg_policies
    where schemaname in ('public','batchlabel')
      and (coalesce(qual,'')||' '||coalesce(with_check,''))
          ~ '(editor_seat_limit|plan_status|current_period_end|sku_limit)'`);
  c.check('no policy anywhere reads plan or allowance state, so a lapsed customer keeps what they have',
    Number(doctrine.rows[0]?.n) === 0, doctrine.rows[0]?.n);

  const triggers = await q(`select count(*)::int as n from pg_trigger
    where tgrelid in ('public.account_members'::regclass, 'public.account_invites'::regclass)
      and not tgisinternal and tgconstraint <> 0 and tginitdeferred and (tgtype & 2) = 0`);
  c.check('both seat guards and the owner floor are deferred constraint triggers, never BEFORE ROW',
    Number(triggers.rows[0]?.n) === 3, triggers.rows[0]?.n);

  const forced = await q(`select count(*)::int as n from pg_class
    where oid in ('public.accounts'::regclass, 'public.account_members'::regclass)
      and relforcerowsecurity`);
  c.check('force row level security stays off on accounts and account_members, or the recursion comes back',
    Number(forced.rows[0]?.n) === 0, forced.rows[0]?.n);

  // The grant census for the two functions this suite found a leak in. Asserted here as well
  // as at apply time, because the apply-time block runs on a database somebody is deploying
  // and this one runs on every commit.
  const seatGrants = await q(`select p.proname,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as authed,
      has_function_privilege('anon', p.oid, 'EXECUTE')          as anon,
      has_function_privilege('service_role', p.oid, 'EXECUTE')  as svc
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('account_seats_in_use','account_editor_seat_limit')
   order by p.proname`);
  c.check('the two unguarded seat helpers are executable by the server and by nobody else',
    seatGrants.count === 2 && seatGrants.rows.every((r: Row) => r.authed === false && r.anon === false && r.svc === true),
    JSON.stringify(seatGrants.rows));

  const memberFacing = await q(`select
      has_function_privilege('authenticated', 'public.my_accounts()', 'EXECUTE') as mine,
      has_function_privilege('authenticated', 'public.account_entitlement(uuid)', 'EXECUTE') as ent,
      has_function_privilege('anon', 'public.account_entitlement(uuid)', 'EXECUTE') as anon`);
  c.check('while the two guarded read functions the app needs are executable by a signed-in user and not by anon',
    memberFacing.rows[0]?.mine === true && memberFacing.rows[0]?.ent === true &&
      memberFacing.rows[0]?.anon === false,
    JSON.stringify(memberFacing.rows[0]));

  await db.close();
  return c.all();
}

const results = await run();

describe(`roles, seats and invites, attacked with eight identities (${results.length} checks)`, () => {
  it.each([...results])('$name', ({ ok, name, detail }: CheckResult) => {
    expect(ok, `${name}${detail ? ` :: ${detail}` : ''}`).toBe(true);
  });
});

/**
 * GUARDS THE GUARD. Section 2 is data-driven over TABLES, so deleting an entry from that
 * array removes four verbs across four roles and the run still goes green with a smaller
 * number nobody reads. The one table nobody thought to check is the one where a viewer keeps
 * write access, which is the entire failure this file exists to prevent.
 */
describe('the coverage is what it claims to be', () => {
  it('attacks every write verb on all sixteen account tables, as all four roles', () => {
    for (const role of ['viewer', 'editor', 'admin', 'owner']) {
      const seen = results.filter((r: CheckResult) => r.name.startsWith(`${role} WRITE batchlabel.`));
      expect(seen.map((r: CheckResult) => r.name), `${role} write coverage`).toHaveLength(TABLES.length);
    }
    expect(TABLES).toHaveLength(16);
  });

  it('reports the read of every one of those tables separately for the viewer', () => {
    const seen = results.filter((r: CheckResult) => r.name.startsWith('viewer SELECT batchlabel.'));
    expect(seen.map((r: CheckResult) => r.name)).toHaveLength(TABLES.length);
  });

  it('proves the do-nothing standing for all three roles it can apply to, and for a stranger', () => {
    for (const standing of ['SUSPENDED', 'REMOVED']) {
      const seen = results.filter((r: CheckResult) =>
        new RegExp(`^a ${standing} (admin|editor|viewer) can do nothing at all`).test(r.name));
      expect(seen.map((r: CheckResult) => r.name), `${standing} coverage`).toHaveLength(3);
    }
    expect(results.filter((r: CheckResult) => /^a NON-MEMBER can do nothing at all/.test(r.name)))
      .toHaveLength(1);
    // The fourth role cannot hold either standing, and that is itself a check.
    expect(results.filter((r: CheckResult) => /there is no such thing as a suspended owner/.test(r.name)))
      .toHaveLength(1);
  });

  it('still asks every seat question, including the three paths into a seat', () => {
    for (const probe of [/one editor beyond the ceiling/, /promoting a viewer to editor at the ceiling/,
      /reactivating the suspended editor is now refused/, /read-only member is admitted onto a full account/,
      /twenty-five read-only members/, /lowering the ceiling below what is in use/,
      /a NEW seat is refused/]) {
      expect(results.filter((r: CheckResult) => probe.test(r.name)).map((r: CheckResult) => r.name),
        `the seat proof matching ${probe} has gone missing`).toHaveLength(1);
    }
  });

  it('still asks every invite question', () => {
    for (const probe of [/GUESSED token/, /REPLAYED token/, /EXPIRED token/, /STOLEN or forwarded/,
      /REVOKED token/, /RESERVES a seat/]) {
      expect(results.filter((r: CheckResult) => probe.test(r.name)).map((r: CheckResult) => r.name),
        `the invite proof matching ${probe} has gone missing`).toHaveLength(1);
    }
  });

  /**
   * ONE GUARD PER REPRODUCED EXPLOIT.
   *
   * Sections 9 and 9b are regressions rather than exploration, and a regression that can be
   * deleted without the suite noticing is a regression that will be deleted. Each pattern
   * below names the defect it pins, so a failure here reads as "the proof for X is gone"
   * rather than as an off-by-one in a count.
   */
  it('still pins every exploit that was reproduced against this design', () => {
    const pinned: readonly (readonly [string, RegExp])[] = [
      ['ownership transfer, which had no correct outcome',      /no transfer_account_ownership function/],
      ['...and its two callers',                                /"no such function" rather than a corrupted account/],
      ['...and the server path',                                /the server cannot reach it either/],
      ['...and the column it moved',                            /cannot repoint accounts\.owner_user_id/],
      ['the ownerless account left by a DELETE',                /nobody deletes a membership row/],
      ['re-admission by a key minted before the sanction',      /REMOVED member redeeming a token they minted/],
      ['...without breaking genuine re-admission',              /FRESH invitation minted after the removal/],
      ['the invitations a departing member had sent',           /withdraws the invitations they SENT/],
      ['accept_account_invite reporting a role it did not write', /promoted, and told the role they now hold/],
      ['...without letting a lesser invite demote anybody',     /keeps their role, and is told so/],
      ['the double-booked seat',                                /does not book them a second one/],
      ['...without cancelling a genuine reservation',           /still reserves a seat/],
      ['the unique-key oracle, on all four keyed tables',       /answer identically/],
      ['...without breaking uniqueness at home',                /refuses a duplicate INSIDE the account/],
      ['current_account_id disagreeing with my_accounts',       /a single answer from both functions/],
      ['...without losing the ambiguity guard',                 /two USABLE accounts still refuse an insert/]
    ];
    for (const [defect, probe] of pinned) {
      const seen = results.filter((r: CheckResult) => probe.test(r.name));
      expect(seen.map((r: CheckResult) => r.name), `the proof for "${defect}" has gone missing`)
        .not.toHaveLength(0);
    }
    // Four keyed tables, four separate oracle checks. A loop that shrank to one would still
    // match the pattern above.
    expect(results.filter((r: CheckResult) => /answer identically/.test(r.name))).toHaveLength(4);
  });

  it('reports no check twice, so a copy-pasted name cannot hide a failure', () => {
    expect(new Set(results.map((r: CheckResult) => r.name)).size).toBe(results.length);
  });
});
