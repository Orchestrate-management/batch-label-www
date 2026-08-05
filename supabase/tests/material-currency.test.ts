// @vitest-environment node
// "THIS LABEL STILL MATCHES THE COMPOSITION" — EXECUTED, BY THREE IDENTITIES.
//
// The sentence on the label designer is:
//
//     "v1 still matches this composition — nothing that goes onto the label has changed
//      since."
//
// It is rendered by comparing batchlabel.artefacts.specification_hash with what
// batchlabel.artefact_source_fingerprint(product_id) returns now, so it is exactly as true
// as that function is complete. Before 20260805120000 the function hashed the IDS of the
// materials and never their contents, and the scenario below — a supplier reissues a safety
// data sheet, the maker removes H317 — moved the label preview and not the fingerprint.
//
// Every check here is a sentence a screen renders. They are run as a signed-in maker through
// the same role and JWT claim PostgREST sets, and then attempted again by a stranger in the
// same brand and by a stranger in a sibling brand, because a function that answers a
// question about somebody else's material is a disclosure channel whatever it returns.
import { describe, expect, it } from 'vitest';
import { asAnon, asServiceRole, asUser, attempt, boot, Checks, type CheckResult, type Row } from './harness';

/** The three functions this migration adds. Every one of them is attacked below. */
const NEW_FUNCTIONS: readonly string[] = [
  'material_state_fingerprint',
  'specification_material_refs',
  'products_using_material'
];

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

  const maker     = await signup('maker@batchlabel.test', 'batchlabel', 'Maker Candles Ltd');
  const neighbour = await signup('other@batchlabel.test', 'batchlabel', 'Neighbour Candles Ltd');
  const attacker  = await signup('thief@stockroom.test',  'stockroom',  'Attacker Stock Ltd');

  const acct = async (u: string): Promise<string> =>
    String((await db.query<Row>('select id from public.accounts where owner_user_id = $1', [u])).rows[0].id);

  const makerAcct     = await acct(maker);
  const neighbourAcct = await acct(neighbour);
  const attackerAcct  = await acct(attacker);

  await db.exec(`update public.brand_memberships set plan='maker', plan_status='active', sku_limit=5,
                 current_period_end = now() + interval '30 days';`);

  const ids = { fig: '', wax: '', emulsifier: '', spec: '', product: '', phasedSpec: '', phasedProduct: '' };
  let atPrint = '';
  let afterCorrection = '';
  let afterArchive = '';
  let figStateBefore = '';

  // ---------------------------------------------------------------------------
  // THE SCENARIO. A maker with a candle, a recorded print, and a supplier who reissues
  // the safety data sheet.
  // ---------------------------------------------------------------------------
  await asUser(db, maker, async () => {
    const one = async (sql: string, p: unknown[]): Promise<string> =>
      String((await db.query<Row>(sql, p)).rows[0].id);

    ids.fig = await one(
      `insert into batchlabel.materials (account_id, material_class, name, role, supplier)
       values ($1,'ingredient','Black Fig oil','Fragrance oil','Aurelia Fragrances') returning id`,
      [makerAcct]);
    await db.query(
      `insert into batchlabel.material_hazards
         (account_id, material_id, code, statement, hazard_class, gcl, pictogram, signal)
       values ($1,$2,'H317','May cause an allergic skin reaction.','Skin Sens. 1',1.0,'GHS07','Warning')`,
      [makerAcct, ids.fig]);
    await db.query(
      `insert into batchlabel.material_allergens (account_id, material_id, name, pct)
       values ($1,$2,'linalool',3.1)`, [makerAcct, ids.fig]);

    ids.wax = await one(
      `insert into batchlabel.materials (account_id, material_class, name, role)
       values ($1,'ingredient','Soy wax','Wax') returning id`, [makerAcct]);

    ids.spec = await one(
      `insert into batchlabel.specifications (account_id, name, category_id, kind, fragrance_id, base_id, load)
       values ($1,'Black Fig','home-fragrance','mixture',$2,$3,8.5) returning id`,
      [makerAcct, ids.fig, ids.wax]);
    ids.product = await one(
      `insert into batchlabel.products (account_id, specification_id, name, sku, net_quantity, net_unit)
       values ($1,$2,'Black Fig 200ml','BF-200',200,'ml') returning id`, [makerAcct, ids.spec]);

    const fp = async (product: string): Promise<string> =>
      String((await db.query<Row>('select batchlabel.artefact_source_fingerprint($1) as h', [product])).rows[0].h);
    const state = async (ref: string): Promise<string> =>
      String((await db.query<Row>(
        'select batchlabel.material_state_fingerprint($1,$2) as h', [makerAcct, ref])).rows[0].h);

    atPrint = await fp(ids.product);
    figStateBefore = await state(ids.fig);
    checks.check('the fingerprint answers at all for a live product', Boolean(atPrint), atPrint);

    // The maker records printing v1. What is on the jars is this composition.
    await db.query(
      `insert into batchlabel.artefacts
         (account_id, product_id, artefact_type, version, specification_hash, printed_at)
       values ($1,$2,'unit-label',1,$3, now())`, [makerAcct, ids.product, atPrint]);

    // ── THE CORRECTION. The supplier reissues the sheet; H317 is no longer declared. ──
    await db.query(`delete from batchlabel.material_hazards where material_id = $1`, [ids.fig]);
    afterCorrection = await fp(ids.product);

    checks.check(
      'THE BLOCKER: removing H317 from the fragrance oil moves the fingerprint, so the recorded print stops claiming to match',
      afterCorrection !== atPrint && Boolean(afterCorrection),
      `${atPrint} -> ${afterCorrection}`);
    checks.check(
      'and the material state term is what moved, not the composition',
      (await state(ids.fig)) !== figStateBefore,
      `${figStateBefore} -> ${await state(ids.fig)}`);

    // An allergen percentage prints (EUH208) and is covered by the same term.
    const beforeAllergen = await fp(ids.product);
    await db.query(`update batchlabel.material_allergens set pct = 0.05 where material_id = $1`, [ids.fig]);
    checks.check('changing an allergen percentage moves it too — EUH208 is decided by that number',
      (await fp(ids.product)) !== beforeAllergen, 'moved');

    // A document is CITED on the safety data sheet, so it prints.
    const beforeDoc = await fp(ids.product);
    await db.query(
      `insert into batchlabel.material_documents (account_id, material_id, document_kind, reference, version)
       values ($1,$2,'Safety data sheet','SDS-4471','4.2')`, [makerAcct, ids.fig]);
    checks.check('recording the supplier document the figures came from moves it — the citation prints',
      (await fp(ids.product)) !== beforeDoc, 'moved');

    // ── ARCHIVING. It changes nothing that prints, so it must mark nothing out of date. ──
    const beforeArchive = await fp(ids.product);
    await db.query(`update batchlabel.materials set archived_at = now() where id = $1`, [ids.fig]);
    afterArchive = await fp(ids.product);

    checks.check(
      'archiving the material does NOT move the fingerprint, because archiving changes nothing that prints',
      afterArchive === beforeArchive, `${beforeArchive} -> ${afterArchive}`);
    checks.check(
      'and the archived material still RESOLVES, so the product it is under keeps its classification',
      (await state(ids.fig)) !== '~unresolved~', await state(ids.fig));

    // ── THE THREE ANSWERS ARE THREE ANSWERS. ──
    const unset = await state('');
    const missing = await state('00000000-0000-0000-0000-000000000000');
    checks.check('an empty slot answers ~unset~', unset === '~unset~', unset);
    checks.check('an id that names nothing answers ~unresolved~', missing === '~unresolved~', missing);
    checks.check('and the two are not the same answer — a composition that LOST its oil is not one that never had one',
      unset !== missing, `${unset} / ${missing}`);

    // ── COMPOSITION SHAPE 2: a material named inside specifications.data. ──
    ids.emulsifier = await one(
      `insert into batchlabel.materials (account_id, material_class, name, role)
       values ($1,'ingredient','Cetearyl alcohol','Emulsifier') returning id`, [makerAcct]);
    ids.phasedSpec = await one(
      `insert into batchlabel.specifications (account_id, name, category_id, kind, data)
       values ($1,'Hand cream','cosmetics','phased', jsonb_build_object('phases', jsonb_build_array(
         jsonb_build_object('name','A','items', jsonb_build_array(
           jsonb_build_object('materialId', $2::text, 'pct', 5)))))) returning id`,
      [makerAcct, ids.emulsifier]);
    ids.phasedProduct = await one(
      `insert into batchlabel.products (account_id, specification_id, name, sku)
       values ($1,$2,'Hand cream 50ml','HC-50') returning id`, [makerAcct, ids.phasedSpec]);

    const refs = await db.query<Row>(
      `select ref from batchlabel.specification_material_refs($1, null) as ref`, [ids.phasedSpec]);
    checks.check('a phase item inside specifications.data is found by the ref walk',
      refs.rows.some((r) => String(r.ref) === ids.emulsifier), `${refs.rows.length} ref(s)`);

    const phasedBefore = await fp(ids.phasedProduct);
    await db.query(`insert into batchlabel.material_hazards
      (account_id, material_id, code, statement, hazard_class)
      values ($1,$2,'H315','Causes skin irritation.','Skin Irrit. 2')`, [makerAcct, ids.emulsifier]);
    checks.check(
      'and classifying that phase item moves the phased product\'s fingerprint — two of three composition shapes keep their materials in the jsonb',
      (await fp(ids.phasedProduct)) !== phasedBefore, 'moved');

    // ── THE PACK. Packaging geometry lays the artefact out. ──
    const pack = await one(
      `insert into batchlabel.materials (account_id, material_class, name, label_area_width_mm, label_area_height_mm)
       values ($1,'packaging','Tumbler 250', 80, 60) returning id`, [makerAcct]);
    await db.query(`update batchlabel.products set packaging_id = $2 where id = $1`, [ids.product, pack]);
    const packBefore = await fp(ids.product);
    await db.query(`update batchlabel.materials set label_area_width_mm = 70 where id = $1`, [pack]);
    checks.check('changing the printable area of the pack moves it — the artefact is laid out against it',
      (await fp(ids.product)) !== packBefore, 'moved');

    // ── WHO IS USING IT. Asked before archiving, not discovered after. ──
    const using = await db.query<Row>(
      `select product_id, product_name, sku from batchlabel.products_using_material($1)`, [ids.fig]);
    checks.check('products_using_material names the live product built on the fragrance oil',
      using.rows.length === 1 && String(using.rows[0].product_id) === ids.product,
      `${using.rows.length} product(s)`);

    const usingPhase = await db.query<Row>(
      `select product_id from batchlabel.products_using_material($1)`, [ids.emulsifier]);
    checks.check('and it finds one named only inside specifications.data',
      usingPhase.rows.length === 1 && String(usingPhase.rows[0].product_id) === ids.phasedProduct,
      `${usingPhase.rows.length} product(s)`);

    const usingNone = await db.query<Row>(
      `select product_id from batchlabel.products_using_material($1)`, [ids.wax === '' ? 'x' : ids.wax]);
    checks.check('a material used by a specification IS reported, and one used by nothing is not',
      usingNone.rows.length === 1, `${usingNone.rows.length} product(s) for the base`);

    const orphan = await one(
      `insert into batchlabel.materials (account_id, material_class, name, role)
       values ($1,'ingredient','Unused dye','Dye') returning id`, [makerAcct]);
    const usingOrphan = await db.query<Row>(
      `select product_id from batchlabel.products_using_material($1)`, [orphan]);
    checks.check('a material no composition names reports no products at all',
      usingOrphan.rows.length === 0, `${usingOrphan.rows.length} product(s)`);

    // An ARCHIVED product is not a live one, and the confirmation counts live ones.
    await db.query(`update batchlabel.products set archived_at = now() where id = $1`, [ids.phasedProduct]);
    const afterArchivedProduct = await db.query<Row>(
      `select product_id from batchlabel.products_using_material($1)`, [ids.emulsifier]);
    checks.check('an archived product is not counted as one that would be affected',
      afterArchivedProduct.rows.length === 0, `${afterArchivedProduct.rows.length} product(s)`);
    await db.query(`update batchlabel.products set archived_at = null where id = $1`, [ids.phasedProduct]);
  });

  // ---------------------------------------------------------------------------
  // SAME BRAND, DIFFERENT ACCOUNT. A function is a read; every one of them is asked.
  // ---------------------------------------------------------------------------
  await asUser(db, neighbour, async () => {
    const fp = await attempt(() => db.query<Row>(
      'select batchlabel.artefact_source_fingerprint($1) as h', [ids.product]));
    checks.check('neighbour fingerprinting the maker\'s product gets NULL, not a hash',
      fp.ok && fp.rows[0].h === null, fp.ok ? String(fp.rows[0].h) : fp.message);

    const state = await attempt(() => db.query<Row>(
      'select batchlabel.material_state_fingerprint($1,$2) as h', [makerAcct, ids.fig]));
    checks.check('neighrbour asking for the state of the maker\'s material gets ~unresolved~, never its md5',
      state.ok && String(state.rows[0].h) === '~unresolved~',
      state.ok ? String(state.rows[0].h) : state.message);
    checks.check('...and that answer is NOT the real one, so it is not an oracle either',
      !state.ok || String(state.rows[0].h) !== figStateBefore, 'differs from the true state');

    const refs = await attempt(() => db.query<Row>(
      'select ref from batchlabel.specification_material_refs($1, null) as ref', [ids.spec]));
    checks.check('neighbour asking which materials the maker\'s composition names gets nothing',
      refs.ok && refs.count === 0, refs.ok ? `${refs.count} row(s)` : refs.message);

    const using = await attempt(() => db.query<Row>(
      'select product_id from batchlabel.products_using_material($1)', [ids.fig]));
    checks.check('neighbour asking who uses the maker\'s material gets nothing',
      using.ok && using.count === 0, using.ok ? `${using.count} row(s)` : using.message);

    // Their OWN account id with the maker's material id: the pair that would slip past a
    // function trusting its arguments rather than RLS.
    const crossed = await attempt(() => db.query<Row>(
      'select batchlabel.material_state_fingerprint($1,$2) as h', [neighbourAcct, ids.fig]));
    checks.check('neighbour passing THEIR account with the maker\'s material id still gets ~unresolved~',
      crossed.ok && String(crossed.rows[0].h) === '~unresolved~',
      crossed.ok ? String(crossed.rows[0].h) : crossed.message);
  });

  // ---------------------------------------------------------------------------
  // CROSS-BRAND. A stockroom maker, same three functions, same answers.
  // ---------------------------------------------------------------------------
  await asUser(db, attacker, async () => {
    const fp = await attempt(() => db.query<Row>(
      'select batchlabel.artefact_source_fingerprint($1) as h', [ids.product]));
    checks.check('cross-brand fingerprint of a batchlabel product returns NULL',
      fp.ok && fp.rows[0].h === null, fp.ok ? String(fp.rows[0].h) : fp.message);

    const state = await attempt(() => db.query<Row>(
      'select batchlabel.material_state_fingerprint($1,$2) as h', [makerAcct, ids.fig]));
    checks.check('cross-brand material state returns ~unresolved~',
      state.ok && String(state.rows[0].h) === '~unresolved~',
      state.ok ? String(state.rows[0].h) : state.message);

    const refs = await attempt(() => db.query<Row>(
      'select ref from batchlabel.specification_material_refs($1, null) as ref', [ids.spec]));
    checks.check('cross-brand composition ref walk returns nothing',
      refs.ok && refs.count === 0, refs.ok ? `${refs.count} row(s)` : refs.message);

    const using = await attempt(() => db.query<Row>(
      'select product_id from batchlabel.products_using_material($1)', [ids.fig]));
    checks.check('cross-brand usage query returns nothing',
      using.ok && using.count === 0, using.ok ? `${using.count} row(s)` : using.message);

    void attackerAcct;
  });

  // ---------------------------------------------------------------------------
  // anon reaches none of it, and the grant list says so rather than the behaviour.
  // ---------------------------------------------------------------------------
  await asAnon(db, async () => {
    for (const fn of NEW_FUNCTIONS) {
      const r = await attempt(() => db.query<Row>(
        `select has_function_privilege('anon', p.oid, 'execute') as granted
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'batchlabel' and p.proname = $1`, [fn]));
      checks.check(`anon holds no EXECUTE on batchlabel.${fn}`,
        r.ok && r.rows.every((row) => row.granted === false),
        r.ok ? r.rows.map((row) => String(row.granted)).join(',') : r.message);
    }
  });

  // ---------------------------------------------------------------------------
  // THE PIN TABLE IS STILL EMPTY, AND THE FINGERPRINT NO LONGER MENTIONS IT.
  //
  // This is the claim the migration makes about its own decision. If somebody later wires
  // pins up without also making them drive the derivation, this is the check that says so.
  // ---------------------------------------------------------------------------
  await asServiceRole(db, async () => {
    const pins = await db.query<Row>('select count(*)::int n from batchlabel.specification_material_pins');
    checks.check('nothing anywhere writes a specification_material_pin',
      Number(pins.rows[0].n) === 0, `${pins.rows[0].n} pin(s)`);

    const src = await db.query<Row>(
      `select pg_get_functiondef(p.oid) as def
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'batchlabel' and p.proname = 'artefact_source_fingerprint'`);
    const def = String(src.rows[0].def);
    checks.check('artefact_source_fingerprint no longer hashes the empty pin table',
      !def.includes('specification_material_pins'), 'no pin term');
    checks.check('and it does hash the resolved material state instead',
      def.includes('material_state_fingerprint'), 'material state term present');
  });

  await db.close();
  return checks.all();
}

const results = await run();

describe('a corrected material and the label that was printed from it', () => {
  for (const result of results) {
    it(result.name, () => {
      expect(result.ok, `${result.name} — ${result.detail}`).toBe(true);
    });
  }
});

/**
 * The coverage assertion, in the shape domain-tables.test.ts uses: a suite that silently
 * stopped attacking one of the three new functions would otherwise stay green.
 */
describe('the coverage is what it claims to be', () => {
  it('attacks all three new functions from a same-brand stranger and a cross-brand one', () => {
    for (const prefix of ['neighbour', 'cross-brand']) {
      const seen = results.filter((c) => c.name.startsWith(prefix));
      expect(seen.length, `${prefix} coverage`).toBeGreaterThanOrEqual(4);
    }
    const anon = results.filter((c) => /^anon holds no EXECUTE/.test(c.name));
    expect(anon).toHaveLength(NEW_FUNCTIONS.length);
  });

  it('still proves the blocker itself, by name', () => {
    const blocker = results.filter((c) => c.name.startsWith('THE BLOCKER:'));
    expect(blocker, 'the H317 proof has gone missing').toHaveLength(1);
  });
});
