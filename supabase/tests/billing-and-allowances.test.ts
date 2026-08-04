// @vitest-environment node
// THE LIVE BILLING PATH, AND THE ALLOWANCE INVARIANTS.
//
// The namespacing migration rebuilds public.entitlements and rewrites
// enforce_sku_limit(). Neither is on the Stripe write path, but get_entitlement()
// reads the view and the webhook is taking real money, so "it should be fine" is not
// a standard. Every outcome apply_stripe_entitlement can return is exercised through
// the SAME sixteen NAMED arguments src/server/supabase-admin.ts sends.
//
// Then the three properties the `allowances jsonb` proposal would have destroyed are
// asserted on the real columns, and destroyed on purpose in a jsonb replica to show
// the difference is real and not a matter of taste.
import { describe, expect, it } from 'vitest';
import { asAnon, asServiceRole, asUser, attempt, boot, Checks, type Row, type CheckResult } from './harness';

async function run(): Promise<readonly CheckResult[]> {
  const checks = new Checks();
  const { db } = await boot();


  await db.exec(`insert into public.brands (slug, name) values ('stockroom','Stockroom') on conflict do nothing;`);

  const user = (await db.query<Row>(
    `insert into auth.users (email, raw_user_meta_data)
     values ('payer@batchlabel.test', jsonb_build_object('brand','batchlabel','business_name','Payer Ltd'))
     returning id`)).rows[0].id as string;
  const acct = (await db.query<Row>(
    'select id from public.accounts where owner_user_id = $1', [user])).rows[0].id as string;

  // The exact call site, argument for argument and name for name.
  const ARGS = ['p_event_id', 'p_event_type', 'p_event_at', 'p_brand', 'p_user_id',
    'p_customer_id', 'p_subscription_id', 'p_plan', 'p_plan_status', 'p_price_id',
    'p_current_period_end', 'p_cancel_at_period_end', 'p_trial_end', 'p_billing',
    'p_sku_limit', 'p_editor_seat_limit'];

  /**
   * The webhook's own payload shape. Every field optional and defaulted the same
   * way src/server/supabase-admin.ts defaults it, so a test that omits one is
   * exercising the same NULL the real call site would send.
   */
  interface WebhookCall {
    eventId: string;
    eventType: string;
    eventAt?: string;
    brand?: string;
    userId?: string | null;
    customerId?: string | null;
    subscriptionId?: string | null;
    plan?: string | null;
    planStatus?: string | null;
    priceId?: string | null;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd?: boolean | null;
    trialEnd?: string | null;
    billing?: Record<string, unknown>;
    skuLimit?: number | null;
    editorSeatLimit?: number | null;
  }

  async function webhook(o: WebhookCall) {
    const named = ARGS.map((a, i) => `${a} => $${i + 1}`).join(', ');
    const vals = [
      o.eventId, o.eventType, o.eventAt ?? new Date().toISOString(), o.brand ?? 'batchlabel',
      o.userId ?? null, o.customerId ?? null, o.subscriptionId ?? null, o.plan ?? null,
      o.planStatus ?? null, o.priceId ?? null, o.currentPeriodEnd ?? null,
      o.cancelAtPeriodEnd ?? null, o.trialEnd ?? null, JSON.stringify(o.billing ?? {}),
      o.skuLimit ?? null, o.editorSeatLimit ?? null];
    return asServiceRole(db, () =>
      attempt(() => db.query<Row>(`select public.apply_stripe_entitlement(${named}) as outcome`, vals)));
  }

  const row = async () =>
    (await db.query<Row>('select * from public.brand_memberships where user_id = $1', [user])).rows[0];

  console.log('\n=== 1. THE SIXTEEN-ARGUMENT CALL SITE, EVERY OUTCOME ===');

  let r = await webhook({ eventId: 'evt_unknownbrand', eventType: 'customer.subscription.created',
    brand: 'not_a_brand', userId: user, plan: 'maker', planStatus: 'active' });
  checks.check('unknown_brand', r.ok && r.rows[0].outcome === 'unknown_brand', r.ok ? r.rows[0].outcome : r.message);

  r = await webhook({ eventId: 'evt_nomember', eventType: 'customer.subscription.created',
    userId: '00000000-0000-0000-0000-000000000000', plan: 'maker', planStatus: 'active' });
  checks.check('no_membership', r.ok && r.rows[0].outcome === 'no_membership', r.ok ? r.rows[0].outcome : r.message);

  const t0 = '2026-08-04T10:00:00Z';
  r = await webhook({ eventId: 'evt_1', eventType: 'customer.subscription.created', eventAt: t0,
    userId: user, customerId: 'cus_1', subscriptionId: 'sub_1', plan: 'consultant',
    planStatus: 'active', priceId: 'price_1', currentPeriodEnd: '2026-09-04T10:00:00Z',
    skuLimit: 2147483647, editorSeatLimit: 50, billing: { interval: 'month' } });
  checks.check('applied', r.ok && r.rows[0].outcome === 'applied', r.ok ? r.rows[0].outcome : r.message);

  let m = await row();
  checks.check('the allowance was written by the live path',
    m.sku_limit === 2147483647 && m.editor_seat_limit === 50,
    `sku_limit=${m.sku_limit} editor_seat_limit=${m.editor_seat_limit}`);
  checks.check('the plan and period landed too',
    m.plan === 'consultant' && m.plan_status === 'active' && m.stripe_customer_id === 'cus_1',
    `${m.plan}/${m.plan_status}/${m.stripe_customer_id}`);

  r = await webhook({ eventId: 'evt_1', eventType: 'customer.subscription.created', eventAt: t0,
    userId: user, plan: 'maker', planStatus: 'active', skuLimit: 3, editorSeatLimit: 1 });
  checks.check('duplicate (Stripe retry of the same event id)',
    r.ok && r.rows[0].outcome === 'duplicate', r.ok ? r.rows[0].outcome : r.message);
  m = await row();
  checks.check('...and the retry changed nothing', m.sku_limit === 2147483647, String(m.sku_limit));

  r = await webhook({ eventId: 'evt_old', eventType: 'customer.subscription.updated',
    eventAt: '2026-08-04T09:00:00Z', userId: user, subscriptionId: 'sub_1',
    plan: 'maker', planStatus: 'canceled', skuLimit: 3, editorSeatLimit: 1 });
  checks.check('stale (a subscription event older than the clock)',
    r.ok && r.rows[0].outcome === 'stale', r.ok ? r.rows[0].outcome : r.message);

  r = await webhook({ eventId: 'evt_super', eventType: 'invoice.payment_failed',
    eventAt: '2026-08-04T11:00:00Z', userId: user, subscriptionId: 'sub_OTHER' });
  checks.check('superseded (an event about a subscription this membership does not hold)',
    r.ok && r.rows[0].outcome === 'superseded', r.ok ? r.rows[0].outcome : r.message);

  // THE ONE NEW INVARIANT 20260802120000 added: the allowance travels with the plan.
  r = await webhook({ eventId: 'evt_late_checkout', eventType: 'checkout.session.completed',
    eventAt: '2026-08-04T09:30:00Z', userId: user, subscriptionId: 'sub_1',
    customerId: 'cus_1', plan: 'consultant', planStatus: 'active',
    skuLimit: 999, editorSeatLimit: 999 });
  m = await row();
  checks.check('an event that may not change the plan may not change the allowance',
    m.sku_limit === 2147483647 && m.editor_seat_limit === 50,
    `sku_limit=${m.sku_limit} editor_seat_limit=${m.editor_seat_limit} (999 would mean the invariant broke)`);

  console.log('\n=== 2. THE READ SURFACE, AFTER THE VIEW WAS REBUILT ===');
  await asUser(db, user, async () => {
    const v = await attempt(() => db.query<Row>('select * from public.entitlements'));
    checks.check('entitlements returns the caller\'s row', v.ok && v.count === 1, v.ok ? `${v.count}` : v.message);
    const cols = v.ok ? Object.keys(v.rows[0]) : [];
    for (const c of ['user_id', 'brand', 'plan', 'status', 'membership_status', 'active',
                     'current_period_end', 'cancel_at_period_end', 'trial_end', 'updated_at',
                     'account_id', 'business_name', 'sku_limit', 'editor_seat_limit',
                     'sku_unlimited', 'sku_count', 'can_modify']) {
      checks.check(`entitlements still exposes ${c}`, cols.includes(c), cols.join(','));
    }
    checks.check('account_id resolves to a real accounts.id, not the user id',
      v.ok && v.rows[0].account_id === acct, v.ok ? String(v.rows[0].account_id) : '');
    checks.check('sku_count reads from the moved table (0 live products)',
      v.ok && v.rows[0].sku_count === 0, v.ok ? String(v.rows[0].sku_count) : '');
    checks.check('sku_unlimited is true on the unlimited sentinel, and the sentinel is never rendered',
      v.ok && v.rows[0].sku_unlimited === true, v.ok ? String(v.rows[0].sku_unlimited) : '');

    const g = await attempt(() => db.query<Row>(`select * from public.get_entitlement('batchlabel')`));
    checks.check('get_entitlement() still resolves through the rebuilt view',
      g.ok && g.count === 1 && g.rows[0].plan === 'consultant',
      g.ok ? `${g.count} row(s)` : g.message);
  });

  // The view's security is the security_invoker flag. Prove it by looking, not by trusting.
  const inv = await db.query<Row>(
    `select reloptions::text o from pg_class where oid = 'public.entitlements'::regclass`);
  checks.check('the rebuilt view is still security_invoker AND security_barrier',
    /security_invoker=true/.test(String(inv.rows[0].o)) && /security_barrier=true/.test(String(inv.rows[0].o)),
    inv.rows[0].o);

  await asAnon(db, async () => {
    const a = await attempt(() => db.query<Row>('select * from public.entitlements'));
    checks.check('anon still cannot read the rebuilt view', !a.ok, a.ok ? `${a.count} row(s)` : a.code);
  });

  console.log('\n=== 3. THE THREE ALLOWANCE INVARIANTS, ON THE REAL COLUMNS ===');
  const cols = await db.query<Row>(`
    select column_name, is_nullable, column_default, data_type
      from information_schema.columns
     where table_schema='public' and table_name='brand_memberships'
       and column_name in ('sku_limit','editor_seat_limit') order by 1`);
  for (const c of cols.rows) {
    checks.check(`${c.column_name} is NOT NULL`, c.is_nullable === 'NO', c.is_nullable);
    checks.check(`${c.column_name} has a default`, c.column_default !== null, String(c.column_default));
    checks.check(`${c.column_name} is an integer, not jsonb`, c.data_type === 'integer', c.data_type);
  }
  checks.check('the defaults are the SMALLEST allowance (3 SKUs, 1 editor seat)',
    String(cols.rows.find((c) => c.column_name === 'sku_limit')?.column_default ?? '').startsWith('3') &&
    String(cols.rows.find((c) => c.column_name === 'editor_seat_limit')?.column_default ?? '').startsWith('1'),
    cols.rows.map((c) => `${c.column_name}=${c.column_default}`).join(' '));

  const sent = await db.query<Row>(`select
    public.sku_is_unlimited(2147483647) a,
    public.sku_is_unlimited(null)       b,
    public.sku_is_unlimited(-1)         c`);
  checks.check('unlimited is 2147483647', sent.rows[0].a === true, String(sent.rows[0].a));
  checks.check('NULL does NOT read as unlimited', sent.rows[0].b === false, String(sent.rows[0].b));
  checks.check('-1 does NOT read as unlimited', sent.rows[0].c === false, String(sent.rows[0].c));

  // A NOT NULL column cannot be nulled, so the trigger provably cannot observe one.
  const nulled = await attempt(() => db.query<Row>(
    'update public.brand_memberships set sku_limit = null where user_id = $1', [user]));
  checks.check('sku_limit CANNOT be set to null even by the owner (so the trigger can never see one)',
    !nulled.ok && nulled.code === '23502', nulled.ok ? 'NULLED' : nulled.code);

  const neg = await attempt(() => db.query<Row>(
    'update public.brand_memberships set sku_limit = -1 where user_id = $1', [user]));
  checks.check('sku_limit CANNOT be -1 (count >= -1 is always true)',
    !neg.ok, neg.ok ? 'ACCEPTED -1' : neg.code);

  const seat0 = await attempt(() => db.query<Row>(
    'update public.brand_memberships set editor_seat_limit = 0 where user_id = $1', [user]));
  checks.check('editor_seat_limit CANNOT be 0 (nobody could edit what they pay for)',
    !seat0.ok, seat0.ok ? 'ACCEPTED 0' : seat0.code);

  console.log('\n=== 4. WHY `allowances jsonb` WAS REJECTED — the same three, destroyed ===');
  // A faithful replica of the proposal, built and exercised rather than argued about.
  await db.exec(`
    create table jsonb_proposal (
      id uuid primary key default gen_random_uuid(),
      allowances jsonb not null default '{}'::jsonb
    );
    insert into jsonb_proposal (allowances) values ('{}'::jsonb);
  `);

  const j = await db.query<Row>(`
    select
      (allowances ->> 'skus')::int                              as limit_value,
      (5 >= (allowances ->> 'skus')::int)                        as would_refuse,
      public.sku_within_limit(5, (allowances ->> 'skus')::int)   as within_limit
    from jsonb_proposal`);

  checks.check('a MISSING jsonb key yields NULL where a NOT NULL column could not',
    j.rows[0].limit_value === null, String(j.rows[0].limit_value));
  checks.check('`count >= NULL` is NULL — not TRUE — so the comparison does not refuse',
    j.rows[0].would_refuse === null, String(j.rows[0].would_refuse));
  checks.check('...and the real rule FAILS OPEN on it: 5 SKUs "within" an absent allowance',
    j.rows[0].within_limit === true,
    'this is the fail-open the NOT NULL column exists to make unreachable');

  // `not null` on the jsonb column does not reach inside it, which is the whole point.
  const jn = await attempt(() => db.query<Row>(
    `update jsonb_proposal set allowances = '{}'::jsonb`));
  checks.check('NOT NULL on the jsonb column permits {} — the constraint cannot reach the key',
    jn.ok, jn.ok ? 'accepted an empty allowance document' : jn.code);

  // And a plausible typo is a runtime error on a customer's insert rather than a DDL error.
  const jt = await attempt(() => db.query<Row>(
    `select (('{"skus":"unlimited"}'::jsonb) ->> 'skus')::int`));
  checks.check('a non-integer value raises at CAST time, inside the trigger, on the customer\'s write',
    !jt.ok, jt.ok ? 'cast succeeded' : jt.code);

  await db.exec('drop table jsonb_proposal;');

  console.log('\n=== 5. THE METER STILL METERS, ON THE MOVED TABLE ===');
  await db.query<Row>(
    `update public.brand_memberships set sku_limit = 2 where user_id = $1`, [user]);
  await asUser(db, user, async () => {
    const spec = (await db.query<Row>(
      `insert into batchlabel.specifications (account_id, name, category_id)
       values ($1, 'Meter spec', 'home-fragrance') returning id`, [acct])).rows[0].id;
    for (let i = 0; i < 2; i += 1) {
      const ok = await attempt(() => db.query<Row>(
        `insert into batchlabel.products (account_id, specification_id, name)
         values ($1, $2, $3)`, [acct, spec, `P${i}`]));
      checks.check(`product ${i + 1} of 2 is allowed`, ok.ok, ok.ok ? '' : `${ok.code} ${ok.message}`);
    }
    const over = await attempt(() => db.query<Row>(
      `insert into batchlabel.products (account_id, specification_id, name)
       values ($1, $2, 'one too many')`, [acct, spec]));
    checks.check('the third is refused by the meter, with the stable hint',
      !over.ok && over.hint === 'sku_limit_reached', `code=${over.code} hint=${over.hint}`);

    // §6.1: no new, keep everything old fully working.
    const edit = await attempt(() => db.query<Row>(
      `update batchlabel.products set name = 'renamed' where account_id = $1 returning id`, [acct]));
    checks.check('an over-limit account can still EDIT what it already has',
      edit.ok && edit.count === 2, edit.ok ? `${edit.count} row(s)` : edit.message);

    const v = await attempt(() => db.query<Row>('select sku_count, can_modify from public.entitlements'));
    checks.check('can_modify agrees with the trigger (both false at the limit)',
      v.ok && v.rows[0].sku_count === 2 && v.rows[0].can_modify === false,
      v.ok ? `sku_count=${v.rows[0].sku_count} can_modify=${v.rows[0].can_modify}` : v.message);
  });


  await db.close();
  return checks.all();
}

const results = await run();

describe(`the billing path and the allowance invariants (${results.length} checks)`, () => {
  it.each([...results])('$name', ({ ok, name, detail }: CheckResult) => {
    expect(ok, `${name}${detail ? ` — ${detail}` : ''}`).toBe(true);
  });
});
