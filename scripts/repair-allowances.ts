/**
 * Repairs memberships that carry an entitling plan but still hold the fail-closed default
 * allowance — exactly the rows 20260802120000_plan_limits.sql's section-10 NOTICE counts.
 *
 *   npx vite-node scripts/repair-allowances.ts --project <ref>            # DRY RUN, writes nothing
 *   npx vite-node scripts/repair-allowances.ts --project <ref> --write    # applies
 *
 * The dry run is the default and there is no way to write by accident: --write is the only
 * flag that changes anything, --project is mandatory, and an argument this script does not
 * recognise stops the run rather than being ignored.
 *
 * WHY THIS EXISTS, AND WHY "RESEND" IN THE STRIPE DASHBOARD IS NOT THE PROCEDURE
 *
 * Resend re-delivers the SAME event id. apply_stripe_entitlement claims that id in
 * public.stripe_webhook_events with `on conflict (event_id) do nothing` and returns
 * 'duplicate' the moment the insert finds nothing to do — BEFORE the resolution ladder
 * reaches the UPDATE that writes sku_limit. The endpoint answers HTTP 200 with
 * {"received":true,"outcome":"duplicate"} and the row is untouched, which reads to an
 * operator exactly like "it was already correct".
 *
 * Nor is there a population it works for: brand_memberships revokes insert/update/delete from
 * anon and authenticated, and apply_stripe_entitlement is service-role only, so the only path
 * that can ever have set an entitling plan is the one that ledgered its event id first. Every
 * affected row already has its entitling event claimed. The ledger is never pruned, so it
 * stays claimed.
 *
 * The 'no_membership' return is the one case Resend does help, and it is deliberately NOT
 * ledgered for that reason (20260801120000:368-371, src/server/webhook.ts:187-188). That
 * exception is the proof of the rule: once an event id is recorded, Resend is inert.
 *
 * SO THIS SCRIPT REPLAYS THE WRITE PATH ITSELF, WITH AN EVENT ID OF ITS OWN.
 *
 *   * WHO NEEDS REPAIR is not restated here. The candidate rows are narrowed with two
 *     conditions the migration asserts at apply time (section 4: a suspended membership is
 *     not entitled, and `free` grants nothing), and each candidate is then confirmed by
 *     calling this database's own public.entitlement_is_active() with the same four columns
 *     the section-10 count query passes it. The script and the migration cannot disagree,
 *     because they ask the same function.
 *   * HOW MUCH comes from allowanceForPlan in src/server/plan-contract.ts, never from a
 *     number typed in here. A tier whose allowance changes changes this script with it.
 *   * THE WRITE is createEntitlementStore from src/server/supabase-admin.ts — the webhook's
 *     own call site, with all sixteen arguments — so the argument list cannot drift from
 *     production. Nothing new is granted a path to the entitlement columns.
 *
 * THE SYNTHETIC EVENT ID: `repair_allowance_v1_<brand_memberships.id>`
 *
 *   * `repair_allowance_` cannot collide with a Stripe id (they are `evt_…`), so nobody
 *     reading the ledger or brand_memberships.stripe_event_id can mistake a repair for
 *     something Stripe said;
 *   * the membership uuid makes it STABLE per membership, so a second run claims the same id,
 *     returns 'duplicate' and changes nothing — re-running is safe rather than doubly applied;
 *   * `v1` is the escape hatch. A future repair that must legitimately touch the same
 *     memberships again bumps it to v2 rather than being blocked by, or silently reusing,
 *     this one's ledger rows. Needing a second repair at v1 means the webhook is broken
 *     again, which is a human's problem and not something to paper over.
 *
 * The event TYPE is `repair.allowance`. It must not begin with `customer.subscription.`:
 * apply_stripe_entitlement advances its ordering clock (stripe_status_at) only for those, and
 * a repair stamped as one could make a genuine later Stripe event look stale and be dropped.
 *
 * WHAT IT DOES NOT DO. It does not read Stripe at all — no key, no network call, no
 * dependency on scripts/stripe-catalogue.ts, whose openStripe() would demand a
 * STRIPE_SECRET_KEY this job has no use for. It does not INSERT or UPDATE anything directly:
 * every write goes through the one RPC. And it never invents an allowance for a plan slug the
 * contract does not know — it reports that row and leaves it alone.
 */

import { createAdminClient, createEntitlementStore } from '../src/server/supabase-admin';
import { DEFAULT_BRAND } from '../src/server/config';
import {
  FREE_PLAN,
  PLAN_CONTRACT,
  allowanceForPlan,
  isEntitlingPlan,
  isPlanSlug,
  type PlanSlug } from
'../src/server/plan-contract';
import type { EntitlementIntent } from '../src/server/stripe-events';
import type { ApplyOutcome } from '../src/server/webhook';

/**
 * The COLUMN DEFAULT from 20260802120000 section 1 — the floor a row keeps when nothing has
 * resolved an allowance for it. Not a copy of any tier's figure, which is why it is written
 * here as the schema fact it is rather than read off the contract: the predicate has to match
 * what the migration's count query looks for, and that is the default the column actually
 * holds. `assertFloorMatchesContract` below reports the day the two stop agreeing.
 */
const FAIL_CLOSED_SKU_LIMIT = 3;

/** The synthetic event id and type. See the header for why each is shaped this way. */
const REPAIR_EVENT_PREFIX = 'repair_allowance_v1_';
const REPAIR_EVENT_TYPE = 'repair.allowance';

const VALUE_FLAGS = ['--project', '--brand'] as const;
const BOOLEAN_FLAGS = ['--write', '--dry-run'] as const;

const USAGE =
'Usage: npx vite-node scripts/repair-allowances.ts --project <ref> [--brand <slug>] [--write]';

/**
 * Not imported from ./stripe-catalogue. That module pulls in the Stripe SDK and exists to
 * describe a Stripe account; this script touches no Stripe object and must not need a Stripe
 * key to repair a database row. Three lines of duplication buys that separation.
 */
function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

const notes: string[] = [];

interface Args {
  readonly write: boolean;
  readonly project: string;
  readonly brand: string;
}

function readArgs(argv: readonly string[]): Args {
  const values = new Map<string, string>();
  const flags = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const split = token.indexOf('=');
    const name = split === -1 ? token : token.slice(0, split);
    const inline = split === -1 ? null : token.slice(split + 1);

    if ((VALUE_FLAGS as readonly string[]).includes(name)) {
      const value = (inline ?? argv[index + 1] ?? '').trim();
      if (!value || value.startsWith('--')) fail(`${name} needs a value.\n  ${USAGE}`);
      if (inline === null) index += 1;
      values.set(name, value);
      continue;
    }

    if ((BOOLEAN_FLAGS as readonly string[]).includes(name) && inline === null) {
      flags.add(name);
      continue;
    }

    // Unknown arguments STOP the run rather than being ignored. A typo, or a `--live` typed
    // out of muscle memory from the Stripe scripts, must not silently produce a dry run that
    // the operator then reads as "nothing needed repairing".
    fail(`unrecognised argument "${token}".\n  ${USAGE}`);
  }

  if (flags.has('--write') && flags.has('--dry-run')) {
    fail('--write and --dry-run contradict each other. A dry run is the default; pass neither, or pass --write.');
  }

  const project = values.get('--project');
  if (!project) {
    fail(
      '--project is required.\n' +
      '  Name the Supabase project ref you intend to write to. It must match the ref in\n' +
      '  SUPABASE_URL, and this job writes to live billing rows in a project shared by every\n' +
      '  Orchestrate brand — so WHICH project is a decision, not a default.\n' +
      '  The ref is in the dashboard URL: app.supabase.com/project/<ref>.\n' +
      `  ${USAGE}`
    );
  }

  return {
    write: flags.has('--write'),
    project,
    // The brand this repo sells for. Read the same way src/server/config.ts reads it, so a
    // deployment that overrides the brand does not have to be remembered here.
    brand: values.get('--brand') ?? process.env.VITE_ORCHESTRATE_BRAND?.trim() ?? DEFAULT_BRAND
  };
}

/** `https://<ref>.supabase.co` -> `<ref>`. Null when the URL is not a Supabase project URL. */
function projectRefFromUrl(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  const labels = host.split('.');
  if (labels.length < 3) return null;
  if (!host.endsWith('.supabase.co') && !host.endsWith('.supabase.in')) return null;
  return labels[0] || null;
}

/**
 * What a legacy Supabase key says about itself.
 *
 * The service role key is a JWT whose unverified payload carries `ref` and `role`. Reading it
 * catches the two mix-ups the URL check alone cannot: a key from a DIFFERENT project pointed
 * at this URL, and the anon key pasted into SUPABASE_SERVICE_ROLE_KEY — which would otherwise
 * fail much later as an empty result set or an RLS error, i.e. as "nothing needs repairing".
 *
 * Returns null for the newer `sb_secret_…` format, which is not a JWT and carries no claims.
 * That is reported and not fatal: the URL guard and the brands preflight still apply.
 */
function claimsFromServiceKey(key: string): {ref: string | null;role: string | null;} | null {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
    return {
      ref: typeof payload.ref === 'string' ? payload.ref : null,
      role: typeof payload.role === 'string' ? payload.role : null
    };
  } catch {
    return null;
  }
}

interface Connection {
  readonly url: string;
  readonly serviceRoleKey: string;
  readonly project: string;
}

/**
 * The credentials, and a refusal to touch the wrong project.
 *
 * The guard is two-sided in the same spirit as openStripe in ./stripe-catalogue.ts: the
 * operator must NAME the project, and the environment must agree with the name. Either half
 * alone is not enough — an exported shell from another project would otherwise be repaired
 * silently, and a --project nobody checked would be decoration.
 *
 * readServerConfig() is deliberately not used to read these. It also builds the Stripe price
 * index and can throw on a duplicate price id; a repair script must not die because
 * STRIPE_PRICE_STUDIO_ANNUAL is unset in the operator's shell. The alias rule below is the
 * one readServerConfig applies, stated once here.
 */
function openSupabase(args: Args): Connection {
  const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url) {
    fail(
      'SUPABASE_URL is not set (VITE_SUPABASE_URL holds the same value and is also accepted).\n' +
      '  Project Settings -> API in the Supabase dashboard.'
    );
  }
  if (!serviceRoleKey) {
    fail(
      'SUPABASE_SERVICE_ROLE_KEY is not set.\n' +
      '  Project Settings -> API -> service_role. It bypasses row level security entirely,\n' +
      '  so export it for this run and do not leave it in a shell you forget about.'
    );
  }

  const urlRef = projectRefFromUrl(url);
  if (!urlRef) {
    fail(
      `SUPABASE_URL (${url}) does not look like a Supabase project URL, so this run cannot\n` +
      '  confirm which project it is about to write to. Refusing rather than guessing.'
    );
  }
  if (urlRef !== args.project) {
    fail(
      `--project says ${args.project} but SUPABASE_URL points at ${urlRef}.\n` +
      '  One of the two is wrong, and this writes to live billing rows. Refusing.'
    );
  }

  const claims = claimsFromServiceKey(serviceRoleKey);
  if (!claims) {
    notes.push(
      'SUPABASE_SERVICE_ROLE_KEY is not a JWT (the newer sb_secret_… format carries no claims), ' +
      'so its project and role could not be cross-checked against SUPABASE_URL.'
    );
  } else {
    if (claims.role && claims.role !== 'service_role') {
      fail(
        `SUPABASE_SERVICE_ROLE_KEY holds a "${claims.role}" key, not the service_role key.\n` +
        '  Row level security would hide every membership from it, and this script would then\n' +
        '  report that nothing needs repairing — which is the one wrong answer it must not give.'
      );
    }
    if (claims.ref && claims.ref !== args.project) {
      fail(
        `SUPABASE_SERVICE_ROLE_KEY belongs to project ${claims.ref}, not ${args.project}.\n` +
        '  The URL and the key are from different projects. Refusing.'
      );
    }
  }

  console.log(
    `\n[repair] project = ${args.project}  brand = ${args.brand}  mode = ${args.write ? 'WRITE' : 'DRY RUN'}`
  );
  if (!args.write) console.log('[repair] DRY RUN — nothing will be written\n');
  else console.log('');

  return { url, serviceRoleKey, project: args.project };
}

/** The columns section 10's count query reads, plus the two the repair reports on. */
interface Candidate {
  id: string;
  user_id: string;
  brand_slug: string;
  status: string;
  plan: string;
  plan_status: string | null;
  current_period_end: string | null;
  sku_limit: number;
  editor_seat_limit: number;
  stripe_subscription_id: string | null;
}

const CANDIDATE_COLUMNS =
'id, user_id, brand_slug, status, plan, plan_status, current_period_end, sku_limit, editor_seat_limit, stripe_subscription_id';

type Admin = ReturnType<typeof createAdminClient>;

/**
 * The contract's floor against the schema's floor.
 *
 * Reported rather than fatal. If they diverge, the column default is still what the affected
 * rows actually hold, so the predicate stays right and the repair stays correct — but somebody
 * has changed one without the other and should know.
 */
function assertFloorMatchesContract(): void {
  const contractFloor = Math.min(...Object.values(PLAN_CONTRACT).map((entry) => entry.skuLimit));
  if (contractFloor === FAIL_CLOSED_SKU_LIMIT) return;
  notes.push(
    `the smallest allowance in the plan contract is ${contractFloor}, but the fail-closed column ` +
    `default in 20260802120000 section 1 is ${FAIL_CLOSED_SKU_LIMIT}. This run followed the column ` +
    'default, because that is the number the affected rows hold. Reconcile the two.'
  );
}

/**
 * The rows to consider, narrowed by conditions the migration proves rather than by a copy of
 * its predicate.
 *
 * Both narrowings are asserted at apply time by section 4 of that migration: a membership
 * whose `status` is not active is never entitled, and `free` grants nothing. So neither can
 * drop a row entitlement_is_active() would have returned true for. Everything else — the
 * plan allow-list, the plan_status set, the period-end grace — is left to the function
 * itself, which is called per candidate below.
 */
async function candidates(admin: Admin): Promise<Candidate[]> {
  const { data, error } = await admin.
  from('brand_memberships').
  select(CANDIDATE_COLUMNS).
  eq('sku_limit', FAIL_CLOSED_SKU_LIMIT).
  eq('status', 'active').
  neq('plan', FREE_PLAN).
  order('created_at', { ascending: true });

  if (error) fail(`could not read brand_memberships: ${error.message}`);
  return (data as Candidate[] | null) ?? [];
}

/** THE predicate, asked of the database rather than restated. */
async function entitledAccordingToDatabase(admin: Admin, row: Candidate): Promise<boolean> {
  // Argument order matters and is easy to get backwards: the migration calls this as
  // entitlement_is_active(m.status, m.plan, m.plan_status, m.current_period_end), so the
  // MEMBERSHIP status is p_membership_status and the SUBSCRIPTION status is p_status.
  const { data, error } = await admin.rpc('entitlement_is_active', {
    p_membership_status: row.status,
    p_plan: row.plan,
    p_status: row.plan_status,
    p_period_end: row.current_period_end
  });
  if (error) fail(`entitlement_is_active failed for membership ${row.id}: ${error.message}`);
  return data === true;
}

interface Repair {
  readonly row: Candidate;
  readonly plan: PlanSlug;
  readonly skuLimit: number;
  readonly editorSeatLimit: number;
  readonly eventId: string;
}

/**
 * Everything a repair needs, or a reason it is not this script's to make.
 *
 * Each refusal is a row that stays exactly as it is and gets named to a human. Writing the
 * free allowance over a row that already holds it, or inventing a number for a slug this
 * deploy has never heard of, would burn the synthetic event id on a change that is not one —
 * and the ledger row would then say a repair happened.
 */
function planRepair(row: Candidate, brand: string): Repair | null {
  if (row.brand_slug !== brand) {
    notes.push(
      `${row.id} (${row.user_id}) is a ${row.brand_slug} membership on plan "${row.plan}", not a ${brand} one. ` +
      'This Supabase project is shared across Orchestrate brands and this repo carries only ' +
      `the ${brand} plan contract, so its allowance is not ours to resolve. Repair it from that brand's repo.`
    );
    return null;
  }

  if (!isPlanSlug(row.plan)) {
    notes.push(
      `${row.id} (${row.user_id}) is on plan "${row.plan}", which src/server/plan-contract.ts does not ` +
      'know. This deploy has no allowance for it and will not invent one.'
    );
    return null;
  }

  if (!isEntitlingPlan(row.plan)) {
    notes.push(
      `${row.id} (${row.user_id}) is on plan "${row.plan}", which the database counts as entitled but the ` +
      'plan contract marks as NOT entitling. The SQL allow-list in entitlement_is_active and ' +
      'ENTITLING_PLANS have drifted; that is the bug to fix, not this row.'
    );
    return null;
  }

  const allowance = allowanceForPlan(row.plan);
  if (allowance.skuLimit === row.sku_limit && allowance.editorSeatLimit === row.editor_seat_limit) {
    notes.push(
      `${row.id} (${row.user_id}) is on plan "${row.plan}", whose contract allowance is already exactly ` +
      `what the row holds (${row.sku_limit} SKUs, ${row.editor_seat_limit} editor seat(s)). Nothing to repair, ` +
      'but it will keep appearing in the migration NOTICE, which counts the number and not the plan.'
    );
    return null;
  }

  return {
    row,
    plan: row.plan,
    skuLimit: allowance.skuLimit,
    editorSeatLimit: allowance.editorSeatLimit,
    eventId: `${REPAIR_EVENT_PREFIX}${row.id}`
  };
}

/**
 * The intent, built for the webhook's own store.
 *
 * Every field that is not the allowance is null on purpose, and two of them are load-bearing:
 *
 *   * subscriptionId null, so the subscription-identity guard cannot fire and cannot return
 *     'superseded' on a membership holding a different subscription id;
 *   * plan is the plan the row ALREADY has, and it must not be null. apply_stripe_entitlement
 *     enforces that the allowance travels with the plan — `if v_plan is null then v_sku_limit
 *     := null` — so an intent with a null plan would be accepted, ledgered and would write
 *     nothing.
 *
 * planStatus, priceId, currentPeriodEnd, cancelAtPeriodEnd and trialEnd stay null so the
 * function's leave-alone semantics apply: this repair knows the allowance and nothing else,
 * and must not restate billing facts it has not been told.
 */
function intentFor(repair: Repair): EntitlementIntent {
  return {
    eventId: repair.eventId,
    eventType: REPAIR_EVENT_TYPE,
    eventAt: new Date().toISOString(),
    brand: repair.row.brand_slug,
    userId: repair.row.user_id,
    customerId: null,
    subscriptionId: null,
    email: null,
    plan: repair.plan,
    planStatus: null,
    priceId: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: null,
    trialEnd: null,
    skuLimit: repair.skuLimit,
    editorSeatLimit: repair.editorSeatLimit,
    billing: {}
  };
}

function describe(repair: Repair): string {
  const row = repair.row;
  return (
    `${row.user_id}  ${row.plan.padEnd(11)} sku ${String(row.sku_limit).padStart(4)} -> ${String(repair.skuLimit).padEnd(11)}` +
    `seats ${row.editor_seat_limit} -> ${repair.editorSeatLimit}`);

}

/**
 * What the row holds now, read back after the write.
 *
 * The RPC's 'applied' is not proof on its own. It reports that the function ran to the end,
 * and there is one path — an event timestamp at or before the membership's stripe_status_at —
 * on which it nulls the plan, writes no allowance and still returns 'applied'. Clock skew is
 * the only way this script can reach it, which is exactly the sort of thing a success count
 * hides. So the row is re-read and the numbers compared.
 */
async function verify(admin: Admin, repair: Repair): Promise<string | null> {
  const { data, error } = await admin.
  from('brand_memberships').
  select('sku_limit, editor_seat_limit').
  eq('id', repair.row.id).
  maybeSingle();

  if (error) return `could not re-read the row: ${error.message}`;
  const after = data as {sku_limit: number;editor_seat_limit: number;} | null;
  if (!after) return 'the row disappeared between the write and the read';
  if (after.sku_limit !== repair.skuLimit || after.editor_seat_limit !== repair.editorSeatLimit) {
    return (
      `the RPC reported success but the row holds sku_limit ${after.sku_limit}, ` +
      `editor_seat_limit ${after.editor_seat_limit}`);

  }
  return null;
}

async function main(): Promise<void> {
  const args = readArgs(process.argv.slice(2));
  const connection = openSupabase(args);
  assertFloorMatchesContract();

  const admin = createAdminClient(connection.url, connection.serviceRoleKey);

  // Preflight. apply_stripe_entitlement returns 'unknown_brand' for a brand this database
  // does not run, which would otherwise show up as every repair quietly doing nothing.
  const { data: brandRow, error: brandError } = await admin.
  from('brands').
  select('slug').
  eq('slug', args.brand).
  maybeSingle();
  if (brandError) fail(`could not read public.brands: ${brandError.message}`);
  if (!brandRow) {
    fail(
      `project ${args.project} has no brand "${args.brand}". Either this is the wrong project or\n` +
      '  --brand names something this database has never heard of.'
    );
  }

  const rows = await candidates(admin);
  console.log(`candidates (sku_limit = ${FAIL_CLOSED_SKU_LIMIT}, membership active, plan <> ${FREE_PLAN}): ${rows.length}`);

  const affected: Candidate[] = [];
  for (const row of rows) {
    if (await entitledAccordingToDatabase(admin, row)) affected.push(row);
  }
  console.log(`entitled according to public.entitlement_is_active():                   ${affected.length}`);

  const repairs = affected.
  map((row) => planRepair(row, args.brand)).
  filter((repair): repair is Repair => repair !== null);

  if (repairs.length === 0) {
    console.log('\nnothing to repair.');
  } else {
    console.log('\nrepairs');
    for (const repair of repairs) {
      console.log(`  ${args.write ? 'did  ' : 'would'} ${'repair'.padEnd(10)} ${describe(repair)}`);
      console.log(`  ${' '.repeat(16)} event_id ${repair.eventId}`);
    }
  }

  const failures: string[] = [];

  if (args.write && repairs.length > 0) {
    const store = createEntitlementStore(admin);
    console.log('\noutcomes');
    for (const repair of repairs) {
      let outcome: ApplyOutcome;
      try {
        outcome = await store.apply(intentFor(repair));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${repair.row.user_id} (${repair.plan}) — apply_stripe_entitlement threw: ${message}`);
        console.log(`  ${'threw'.padEnd(13)} ${repair.row.user_id}  ${message}`);
        continue;
      }

      if (outcome !== 'applied') {
        // 'duplicate' here means this membership's v1 repair id is already in the ledger: it
        // was repaired before and has fallen back, which is a webhook problem rather than a
        // row to write again. Every other outcome is the function declining, and each of them
        // is worth reading in full in 20260802120000 section 6.
        failures.push(`${repair.row.user_id} (${repair.plan}) — outcome "${outcome}", nothing written`);
        console.log(`  ${outcome.padEnd(13)} ${repair.row.user_id}  ${repair.eventId}`);
        continue;
      }

      const problem = await verify(admin, repair);
      if (problem) {
        failures.push(`${repair.row.user_id} (${repair.plan}) — ${problem}`);
        console.log(`  ${'unverified'.padEnd(13)} ${repair.row.user_id}  ${problem}`);
        continue;
      }
      console.log(
        `  ${'applied'.padEnd(13)} ${repair.row.user_id}  sku_limit ${repair.skuLimit}, ` +
        `editor_seat_limit ${repair.editorSeatLimit} — verified`
      );
    }
  }

  if (notes.length > 0) {
    console.log('\n─── needs a human ─────────────────────────────────────────────');
    for (const note of notes) console.log(`  ! ${note}`);
  }

  console.log('\n─── verify from SQL ───────────────────────────────────────────');
  console.log('  -- the same count the plan_limits migration raises a NOTICE for');
  console.log('  select user_id, brand_slug, plan, sku_limit, editor_seat_limit');
  console.log('    from public.brand_memberships m');
  console.log('   where public.entitlement_is_active(m.status, m.plan, m.plan_status, m.current_period_end)');
  console.log(`     and m.sku_limit = ${FAIL_CLOSED_SKU_LIMIT};`);
  console.log('  -- what this script recorded');
  console.log(`  select * from public.stripe_webhook_events where event_id like '${REPAIR_EVENT_PREFIX}%';`);

  if (failures.length > 0) {
    console.error(`\n✗ ${failures.length} of ${repairs.length} repair(s) did not land:\n`);
    for (const failure of failures) console.error(`  · ${failure}`);
    console.error('');
    process.exit(1);
  }

  if (!args.write) {
    console.log(
      `\n${repairs.length} membership(s) would be repaired. Nothing was written.` +
      `\nRe-run with --write to apply:  npx vite-node scripts/repair-allowances.ts --project ${args.project} --write\n`
    );
    return;
  }

  console.log(`\n✓ ${repairs.length} membership(s) repaired and verified in project ${args.project}.\n`);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
