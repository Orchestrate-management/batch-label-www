/**
 * Repairs memberships that carry an entitling plan but still hold the fail-closed default
 * allowance — exactly the rows 20260802120000_plan_limits.sql's section-10 NOTICE counts.
 *
 *   export SUPABASE_URL=…  SUPABASE_SERVICE_ROLE_KEY=…            # Project Settings -> API
 *   npx vite-node scripts/repair-allowances.ts --project <ref>            # DRY RUN, writes nothing
 *   npx vite-node scripts/repair-allowances.ts --project <ref> --write    # applies
 *   npx vite-node scripts/repair-allowances.ts --project <ref> --only <membership id> --write
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
 * Nor is there a population it works for. No path in this repo can set an entitling plan
 * without ledgering an event id first: brand_memberships revokes insert/update/delete from
 * anon and authenticated, and apply_stripe_entitlement is service-role only. So every row
 * this script finds already has its entitling event claimed, and the ledger is never pruned.
 *
 * The 'no_membership' and 'unknown_brand' returns are the two Resend can still help with, and
 * neither is ledgered for that reason (20260801120000:368-371, src/server/webhook.ts:54).
 * That exception is the proof of the rule: once an event id is recorded, Resend is inert.
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
 * ONE PASS PER ROW, AND WHY THE SHAPE MATTERS MORE THAN THE STEPS
 *
 * This job runs against a live database while Stripe is still delivering webhooks. An earlier
 * shape scanned every row first and wrote afterwards, and that window was long enough to lose
 * a real customer's downgrade: the intent re-asserts the plan the SCAN saw, and
 * apply_stripe_entitlement writes `plan = coalesce(v_plan, m.plan)`, so a subscription that
 * moved Studio -> Maker (or was cancelled outright) between the scan and the write was
 * silently put back. Nothing said so; the run printed "applied … verified" and exited 0,
 * because the read-back only checked the two allowance columns.
 *
 * So there is no scan phase. Each row is confirmed, planned, RE-READ and written in one pass,
 * and the re-read immediately before the write compares every column the intent depends on
 * against what this run saw a moment earlier. Any difference and the row is refused, named
 * under "needs a human", and the run exits non-zero. It is never repaired on stale facts.
 *
 * A read and an RPC are still two round trips, so a window remains, and nothing short of doing
 * this inside the database could close it — the write path is deliberately one function that
 * this script does not get to extend. What the window is, is PART visible and part not, and
 * which part is which is the single most important thing to know before running this:
 *
 *   * A customer.subscription.* event that lands inside the window is seen. Applying one sets
 *     stripe_status_at to its own event.created, this repair deliberately never touches that
 *     column, and the read-back compares it against the value read immediately before the
 *     write — so the event shows up whether it landed before this repair's write or after it.
 *     That covers both of the ways a customer's billing state gets reverted, a DOWNGRADE and a
 *     CANCELLATION, which are the two blockers this shape was rewritten for. Both are named,
 *     both exit 1, neither is silent. (The one subscription event that could move nothing to
 *     compare is one whose event.created is bit-identical to the value already in the column.
 *     It is the same instant, so there is no reordering to detect — but it is the edge of this
 *     guarantee and not the middle of it.)
 *   * A plan change that arrives on a NON-subscription event is not visible from the row at
 *     all. checkout.session.completed is the real one: it sets the plan, the price and the
 *     allowance, and it leaves stripe_status_at exactly where it was — most conspicuously on a
 *     membership that has never had a subscription event, where that column is still null. A
 *     repair that overwrites one of those sees an unmoved clock, its own event id and its own
 *     two numbers on the row, and prints "applied and verified" in good faith.
 *
 * That second bullet is a real hole and it is not papered over here. Closing it means making
 * the write conditional on the row not having moved — a compare-and-set inside
 * apply_stripe_entitlement, i.e. a new migration, which is not this change. Until then `--only`
 * is the mitigation and it is a real one rather than a consolation: a reviewed row, a run that
 * is over in a round trip or two, and a window measured against one membership instead of the
 * whole population. With live webhook traffic that is the safe way to run this at all.
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
 *     this one's ledger rows.
 *
 * The event TYPE is `repair.allowance`. It must not begin with `customer.subscription.`:
 * apply_stripe_entitlement advances its ordering clock (stripe_status_at) only for those, and
 * a repair stamped as one could make a genuine later Stripe event look stale and be dropped.
 *
 * WHAT IT DOES NOT DO. It does not read Stripe at all — no key, no network call, no
 * dependency on scripts/stripe-catalogue.ts, whose openStripe() would demand a
 * STRIPE_SECRET_KEY this job has no use for. It does not INSERT or UPDATE anything directly:
 * every membership write goes through the one RPC. It never invents an allowance for a plan
 * slug the contract does not know — it reports that row and leaves it alone. And it does not
 * take a --brand: see THE BRAND IS NOT AN ARGUMENT below.
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

/**
 * THE BRAND IS NOT AN ARGUMENT.
 *
 * It was one, briefly, and it inverted the guard it was supposed to serve. `--brand otherbrand`
 * did not narrow the run to another brand's rows, because the allowance still came from THIS
 * repo's plan contract: it skipped every Batchlabel row as "foreign" and wrote Batchlabel's
 * Studio numbers onto another brand's membership. brand_memberships.plan has no CHECK
 * constraint and entitlement_is_active's allow-list is project-wide, so another Orchestrate
 * brand's rows genuinely can carry `maker`, `studio` or `consultant` and mean something else
 * by them — this project is shared with Starter at £480/mo and Scale at £1,800/mo.
 *
 * A brand is not a runtime choice for this script. It is a property of the repository the
 * script is in: src/server/plan-contract.ts holds Batchlabel's tiers, Batchlabel's lookup
 * keys and Batchlabel's numbers, and no flag or environment variable changes that. So the
 * brand is read the way the rest of the server reads it and then checked, and the run refuses
 * outright if it has been pointed anywhere else.
 */
const REPO_BRAND = DEFAULT_BRAND;
const BRAND_ENV_VAR = 'VITE_ORCHESTRATE_BRAND';

const VALUE_FLAGS = ['--project', '--only'] as const;
const BOOLEAN_FLAGS = ['--write', '--dry-run'] as const;

const USAGE =
'Usage: npx vite-node scripts/repair-allowances.ts --project <ref> [--only <membership id>]… [--write]';

/** brand_memberships.id is a uuid primary key; anything else is a typo, not a row. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Not imported from ./stripe-catalogue. That module pulls in the Stripe SDK and exists to
 * describe a Stripe account; this script touches no Stripe object and must not need a Stripe
 * key to repair a database row. Three lines of duplication buys that separation.
 */
function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

/** Everything a human has to look at afterwards, in the order it was discovered. */
const notes: string[] = [];

/** Soft-wrap a long sentence under a fixed indent, so a refusal is readable in a terminal. */
function wrap(text: string, indent: string, width = 96): string {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && `${line} ${word}`.length + indent.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.map((entry) => `${indent}${entry}`).join('\n');
}

interface Args {
  readonly write: boolean;
  readonly project: string;
  /** Empty means the whole population. See `--only` in readArgs. */
  readonly only: readonly string[];
}

function readArgs(argv: readonly string[]): Args {
  const values = new Map<string, string>();
  const only: string[] = [];
  const flags = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const split = token.indexOf('=');
    const name = split === -1 ? token : token.slice(0, split);
    const inline = split === -1 ? null : token.slice(split + 1);

    if (name === '--brand') {
      // Not "unrecognised". Somebody typing this has a specific idea in mind and deserves to
      // be told why it is not on offer, rather than to go looking for the right spelling.
      fail(
        'there is no --brand. This repo carries the Batchlabel plan contract and nothing else,\n' +
        `  so it can only resolve allowances for ${REPO_BRAND} memberships. Naming another brand\n` +
        "  would not read that brand's tiers; it would write Batchlabel's numbers onto that\n" +
        "  brand's rows and skip every row this script is for. Repair another brand from its\n" +
        `  own repo.\n  ${USAGE}`
      );
    }

    if ((VALUE_FLAGS as readonly string[]).includes(name)) {
      const value = (inline ?? argv[index + 1] ?? '').trim();
      if (!value || value.startsWith('--')) fail(`${name} needs a value.\n  ${USAGE}`);
      if (inline === null) index += 1;

      if (name === '--only') {
        if (!UUID.test(value)) {
          fail(
            `--only ${value} is not a brand_memberships.id.\n` +
            '  It takes the membership uuid printed by a dry run, not a user id, an email or a\n' +
            `  plan slug.\n  ${USAGE}`
          );
        }
        if (!only.includes(value.toLowerCase())) only.push(value.toLowerCase());
        continue;
      }

      if (values.has(name)) fail(`${name} was given twice.\n  ${USAGE}`);
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

  return { write: flags.has('--write'), project, only };
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
 * That is not fatal, but it is not free either: see WHEN THE ROLE CANNOT BE PROVEN below.
 *
 * A three-part key whose payload has no usable `role` is NOT the same as a non-JWT, and it used
 * to be treated as better than one: `claims` came back non-null, the "could not be proven"
 * warning was skipped because that warning only fired for a null, and `claims.role !== …` was
 * skipped too because the role was null. The least trustworthy shape of all — a well-formed
 * token that will not say what it is — got the least warning of all. Both shapes now reach the
 * same place, and `shape` is what lets the warning say which one it is looking at.
 */
interface KeyClaims {
  readonly shape: 'jwt' | 'opaque';
  readonly ref: string | null;
  readonly role: string | null;
}

function claimsFromServiceKey(key: string): KeyClaims {
  const parts = key.split('.');
  if (parts.length !== 3) return { shape: 'opaque', ref: null, role: null };
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
    return {
      shape: 'jwt',
      ref: typeof payload.ref === 'string' ? payload.ref : null,
      role: typeof payload.role === 'string' ? payload.role : null
    };
  } catch {
    // Three dot-separated parts whose middle is not JSON is not a JWT, whatever else it is.
    return { shape: 'opaque', ref: null, role: null };
  }
}

interface Connection {
  readonly url: string;
  readonly serviceRoleKey: string;
  readonly project: string;
  /**
   * True only when the key ITSELF said `role: service_role`. False for the `sb_secret_…`
   * format, which carries no claims — in which case an empty result set is not evidence of
   * anything and this run must not report one as an all-clear.
   */
  readonly roleProven: boolean;
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

  // The brand is a property of this repository, not of the shell it is run from. An override
  // pointing anywhere else is refused rather than honoured, because the numbers this script
  // would write are Batchlabel's either way.
  const brandOverride = process.env[BRAND_ENV_VAR]?.trim();
  if (brandOverride && brandOverride !== REPO_BRAND) {
    fail(
      `${BRAND_ENV_VAR} is set to "${brandOverride}", but src/server/plan-contract.ts holds the\n` +
      `  ${REPO_BRAND} tiers and only those. Running would resolve ${REPO_BRAND}'s allowances and write\n` +
      `  them onto ${brandOverride} memberships. Unset it, or repair that brand from its own repo.`
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

  // The anon-equivalent of the new key format. It is one character class away from
  // `sb_secret_…`, carries no claims to catch it by, and under RLS it can see nothing at all —
  // which arrives looking exactly like an empty result set. Refuse it by name.
  if (serviceRoleKey.startsWith('sb_publishable_')) {
    fail(
      'SUPABASE_SERVICE_ROLE_KEY holds an sb_publishable_… key. That is the PUBLISHABLE key —\n' +
      '  the new format\'s anon key — and row level security would hide every membership from\n' +
      '  it, so this script would report that nothing needs repairing. The one it wants is the\n' +
      '  secret key: Project Settings -> API -> sb_secret_… (or the legacy service_role JWT).'
    );
  }

  const claims = claimsFromServiceKey(serviceRoleKey);

  // What the key DID say is checked first, because a key that names the wrong role or the
  // wrong project is a refusal, not a warning.
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

  const roleProven = claims.role === 'service_role';

  if (!roleProven) {
    // WHEN THE ROLE CANNOT BE PROVEN. Printed HERE, before any result, and not filed away as
    // a footnote under the all-clear where it reads as reassurance. The consequence is
    // carried into the run itself: see requireVisibleMemberships().
    //
    // Reached by BOTH keys that cannot prove a role: the `sb_secret_…` format, which is not a
    // JWT and never carried claims, and a three-part JWT whose payload has no string `role`.
    // The second is the worse of the two and used to be the only one that got no warning.
    const shape =
    claims.shape === 'opaque' ?
    ['⚠ SUPABASE_SERVICE_ROLE_KEY is not a JWT, so neither its project nor its ROLE could',
    '  be checked.'] :
    ['⚠ SUPABASE_SERVICE_ROLE_KEY IS a JWT, but its payload carries no `role` claim (or it',
    `  is not a string), so its role could not be checked${claims.ref ? '.' : ', and it names no project'}`,
    claims.ref ? '  A well-formed token that will not say what it is deserves MORE suspicion' : '  either. A well-formed token that will not say what it is deserves MORE suspicion',
    '  than an opaque key, not less.'];

    const body = [
    '  A key without the service role sees nothing through RLS and an empty result would',
    '  be indistinguishable from a clean database. This run will refuse to report "nothing',
    '  to repair" unless it can prove it can read brand_memberships at all.'];

    console.warn(`\n${[...shape, ...body].map((line) => `[repair] ${line}`).join('\n')}`);
    notes.push(
      'the service key could not prove its role ' +
      (claims.shape === 'opaque' ? '(it is not a JWT)' : '(it is a JWT carrying no `role` claim)') +
      ', so the role was taken on trust' +
      (claims.ref ?
      `, though the key did name project ${claims.ref} and that was checked` :
      ' — and it names no project either, so that was taken on trust too') +
      '. Prefer the legacy service_role JWT for this job, or read the SQL below yourself.'
    );
  }

  console.log(
    `\n[repair] project = ${args.project}  brand = ${REPO_BRAND}  mode = ${args.write ? 'WRITE' : 'DRY RUN'}`
  );
  if (args.only.length > 0) {
    console.log(`[repair] --only: ${args.only.length} membership(s) named; every other row is out of scope`);
  }
  if (!args.write) console.log('[repair] DRY RUN — nothing will be written\n');
  else console.log('');

  return { url, serviceRoleKey, project: args.project, roleProven };
}

/**
 * THE TWO QUERIES THIS RUN CAN BE CHECKED AGAINST, held as a value rather than as a series of
 * console.log calls at the bottom of main().
 *
 * Because a refusal that says "read the SQL below" has to be able to PRINT it. The UNPROVEN
 * refusal in requireVisibleMemberships said exactly that and then exited through fail(), which
 * never reaches the bottom of main() — so the one output that told an operator to go and check
 * by hand was the one output that did not show them how.
 */
const VERIFY_SQL =
`  -- the same count the plan_limits migration raises a NOTICE for
  select id, user_id, brand_slug, business_name, plan, sku_limit, editor_seat_limit
    from public.brand_memberships m
   where public.entitlement_is_active(m.status, m.plan, m.plan_status, m.current_period_end)
     and m.sku_limit = ${FAIL_CLOSED_SKU_LIMIT};
  -- what this script recorded
  select * from public.stripe_webhook_events where event_id like '${REPAIR_EVENT_PREFIX}%';`;

/** The columns section 10's count query reads, plus the ones the repair reports and guards on. */
interface Candidate {
  id: string;
  user_id: string;
  brand_slug: string;
  business_name: string | null;
  status: string;
  plan: string;
  plan_status: string | null;
  current_period_end: string | null;
  sku_limit: number;
  editor_seat_limit: number;
  stripe_subscription_id: string | null;
  stripe_event_id: string | null;
  stripe_status_at: string | null;
}

// One string literal on one line, deliberately: supabase-js types the result from the column
// list, and it can only do that when the argument is a literal type. Concatenating two shorter
// lines infers `string`, the row type collapses, and every read here becomes an `unknown` cast.
const CANDIDATE_COLUMNS =
'id, user_id, brand_slug, business_name, status, plan, plan_status, current_period_end, sku_limit, editor_seat_limit, stripe_subscription_id, stripe_event_id, stripe_status_at';

/**
 * The columns the intent is built from, or that decide whether the write is safe. If any of
 * them moved between this run reading the row and this run writing it, somebody else wrote
 * the membership and this run's facts are stale.
 *
 * stripe_event_id is the catch-all: apply_stripe_entitlement stamps it on every successful
 * apply, so any write through the one write path shows up here even when it changed a column
 * this script does not otherwise read.
 */
const GUARDED_COLUMNS = [
'status',
'plan',
'plan_status',
'sku_limit',
'editor_seat_limit',
'stripe_event_id',
'stripe_status_at'] as const satisfies readonly (keyof Candidate)[];

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
 * Neither narrowing can drop a row entitlement_is_active() would have returned true for, and
 * it is worth being exact about what carries that, because the two halves are carried by
 * different things:
 *
 *   * `free` grants nothing — asserted at apply time by section 4 of that migration, which
 *     fails the migration if entitlement_is_active('active','free','active',…) is true;
 *   * a membership that is not active is not entitled — NOT asserted in general by section 4,
 *     which only pins the `suspended` case. The general claim is the first conjunct of
 *     entitlement_is_active's body, `coalesce(p_membership_status, 'active') = 'active'`.
 *
 * Everything else — the plan allow-list, the plan_status set, the period-end grace — is left
 * to the function itself, which is called per candidate below.
 *
 * `created_at` alone is not a total order: rows written in one transaction share it exactly,
 * and the report then shuffles between runs of a job whose whole output is meant to be
 * compared against the previous run. `id` breaks the tie.
 */
async function candidates(admin: Admin, only: readonly string[]): Promise<Candidate[]> {
  let query = admin.
  from('brand_memberships').
  select(CANDIDATE_COLUMNS).
  eq('sku_limit', FAIL_CLOSED_SKU_LIMIT).
  eq('status', 'active').
  neq('plan', FREE_PLAN);

  if (only.length > 0) query = query.in('id', only as string[]);

  const { data, error } = await query.
  order('created_at', { ascending: true }).
  order('id', { ascending: true });

  if (error) fail(`could not read brand_memberships: ${error.message}`);
  return (data as Candidate[] | null) ?? [];
}

/**
 * Why a named row is not in the candidate set.
 *
 * `--only` is how an operator excludes rows, so a name that matches nothing is either a typo
 * or a row somebody else has already dealt with, and both are worth one line each rather than
 * a silent shorter list.
 */
async function explainMissing(admin: Admin, id: string): Promise<void> {
  const { data, error } = await admin.
  from('brand_memberships').
  select(CANDIDATE_COLUMNS).
  eq('id', id).
  maybeSingle();

  if (error) {
    notes.push(`--only ${id} could not be read back: ${error.message}`);
    return;
  }
  const row = data as Candidate | null;
  if (!row) {
    notes.push(`--only ${id} matches no membership in project. Check the id.`);
    return;
  }
  notes.push(
    `--only ${id} is not a candidate and was not touched: it holds status "${row.status}", ` +
    `plan "${row.plan}", sku_limit ${row.sku_limit}. A candidate is active, off ${FREE_PLAN}, and ` +
    `sitting on the fail-closed default ${FAIL_CLOSED_SKU_LIMIT}.`
  );
}

/**
 * PROOF THAT AN EMPTY ANSWER MEANS SOMETHING.
 *
 * "candidates: 0 … nothing to repair" is the one wrong answer this script must never give,
 * and a key without the service role produces it for free: RLS hides every row and the
 * result set is empty for a reason that has nothing to do with allowances. When the key could
 * not be checked, an empty candidate set is therefore UNPROVEN until this run can show it can
 * see a membership at all.
 */
async function requireVisibleMemberships(admin: Admin, connection: Connection): Promise<void> {
  const { data, error } = await admin.
  from('brand_memberships').
  select('id').
  limit(1);

  if (error) fail(`could not read brand_memberships: ${error.message}`);
  const visible = ((data as {id: string;}[] | null) ?? []).length > 0;
  if (visible) return;

  if (!connection.roleProven) {
    fail(
      'UNPROVEN, not clean. This run found no candidates AND cannot see a single row of\n' +
      '  public.brand_memberships — and the service key could not prove its role, so it may\n' +
      '  simply lack the service role and be looking at an empty view of a full table. Refusing\n' +
      '  to report "nothing to repair".\n' +
      '  Re-run with the legacy service_role JWT (Project Settings -> API), whose claims this\n' +
      '  script can verify, or run this as an admin — the answer this run could not get:\n\n' +
      VERIFY_SQL
    );
  }
  notes.push(
    'public.brand_memberships is empty in this project. The key IS the service role, so that ' +
    'is a fact rather than an RLS artefact — but a billing project with no memberships is ' +
    'worth a second look at --project.'
  );
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

/** `Studio Ltd · batchlabel · 7f3e…` — how a row is named everywhere it is mentioned. */
function label(row: Candidate): string {
  return `${row.business_name?.trim() || '(no business name)'} · ${row.brand_slug} · ${row.id}`;
}

/**
 * Everything a repair needs, or a reason it is not this script's to make.
 *
 * Each refusal is a row that stays exactly as it is and gets named to a human. Writing the
 * free allowance over a row that already holds it, or inventing a number for a slug this
 * deploy has never heard of, would burn the synthetic event id on a change that is not one —
 * and the ledger row would then say a repair happened.
 */
function planRepair(row: Candidate): Repair | null {
  if (row.brand_slug !== REPO_BRAND) {
    notes.push(
      `${label(row)} is on plan "${row.plan}", but it belongs to ${row.brand_slug} and this repo ` +
      `carries only the ${REPO_BRAND} plan contract. This Supabase project is shared across ` +
      'Orchestrate brands, and another brand may mean something entirely different by the same ' +
      "plan slug, so its allowance is not ours to resolve. Repair it from that brand's repo."
    );
    return null;
  }

  if (!isPlanSlug(row.plan)) {
    notes.push(
      `${label(row)} is on plan "${row.plan}", which src/server/plan-contract.ts does not ` +
      'know. This deploy has no allowance for it and will not invent one.'
    );
    return null;
  }

  if (!isEntitlingPlan(row.plan)) {
    notes.push(
      `${label(row)} is on plan "${row.plan}", which the database counts as entitled but the ` +
      'plan contract marks as NOT entitling. The SQL allow-list in entitlement_is_active and ' +
      'ENTITLING_PLANS have drifted; that is the bug to fix, not this row.'
    );
    return null;
  }

  const allowance = allowanceForPlan(row.plan);
  if (allowance.skuLimit === row.sku_limit && allowance.editorSeatLimit === row.editor_seat_limit) {
    notes.push(
      `${label(row)} is on plan "${row.plan}", whose contract allowance is already exactly ` +
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
 * That second one is why the row is re-read immediately before this is sent: re-asserting a
 * plan is only harmless while the plan is still the one on the row.
 *
 * planStatus, priceId, currentPeriodEnd, cancelAtPeriodEnd and trialEnd stay null so the
 * function's leave-alone semantics apply: this repair knows the allowance and nothing else,
 * and must not restate billing facts it has not been told.
 */
function intentFor(repair: Repair, eventAt: string): EntitlementIntent {
  return {
    eventId: repair.eventId,
    eventType: REPAIR_EVENT_TYPE,
    eventAt,
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

/** The dry-run listing IS the safety review, so it names the row a human can recognise. */
function printRepair(repair: Repair, index: number, write: boolean): void {
  const row = repair.row;
  console.log(`\n  [${index}] ${write ? 'REPAIR' : 'would repair'}  ${row.business_name?.trim() || '(no business name)'}`);
  console.log(`      membership   ${row.id}          (brand_memberships.id — the value --only takes)`);
  console.log(`      user         ${row.user_id}          (auth.users.id)`);
  console.log(`      brand        ${row.brand_slug}`);
  console.log(
    `      plan         ${repair.plan.padEnd(11)}sku_limit ${String(row.sku_limit)} -> ${repair.skuLimit}` +
    `     editor_seat_limit ${row.editor_seat_limit} -> ${repair.editorSeatLimit}`
  );
  console.log(`      event_id     ${repair.eventId}`);
}

/** One membership by id, or the sentence explaining why it could not be read. */
async function readRow(admin: Admin, id: string): Promise<Candidate | string> {
  const { data, error } = await admin.
  from('brand_memberships').
  select(CANDIDATE_COLUMNS).
  eq('id', id).
  maybeSingle();

  if (error) return `the row could not be read: ${error.message}`;
  return (data as Candidate | null) ?? 'the row has disappeared';
}

/**
 * Every guarded column that moved between two reads of the same row. Empty means nobody else
 * has written this membership in between.
 */
function movedBetween(before: Candidate, after: Candidate): string[] {
  return GUARDED_COLUMNS.
  filter((column) => after[column] !== before[column]).
  map((column) => `${column} ${JSON.stringify(before[column])} -> ${JSON.stringify(after[column])}`);
}

/**
 * WHAT THIS RUN LEFT ON THE ROW — a different question from "did the repair succeed", and the
 * one the last line of the output has to answer.
 *
 *   * `nothing-written` — this repair's plan and allowance are NOT what the membership holds.
 *     Either the call never happened, or apply_stripe_entitlement withdrew its opinion, or
 *     somebody else's write is the one that stands. The row is not this run's doing.
 *   * `stands-on-top` — this repair's write LANDED, over a genuine concurrent event, and is
 *     still there. Nothing in this script can undo it. It is the one outcome where a failure
 *     also means a change.
 *   * `unconfirmed` — the RPC did something and this run could not read back what. Not the same
 *     as either of the others and not to be rounded into one of them.
 */
type Landing = 'nothing-written' | 'stands-on-top' | 'unconfirmed';

/** A row this run did not repair: the sentence for the operator, and what it left behind. */
interface Refusal {
  readonly sentence: string;
  readonly landing: Landing;
}

/** A row that is already correct — nobody has to do anything about it. */
interface Settled {
  readonly sentence: string;
}

type RowOutcome = null | Refusal | Settled;

function refused(landing: Landing, sentence: string): Refusal {
  return { sentence, landing };
}

function isRefusal(outcome: RowOutcome): outcome is Refusal {
  return outcome !== null && 'landing' in outcome;
}

/**
 * DID THE WRITE DO WHAT IT SAID, AND WAS IT THE RIGHT WRITE TO MAKE?
 *
 * Three questions, not one. Checking only the two allowance columns is what let a silent
 * revert print "applied … verified": the numbers were right and the plan underneath them was
 * a year out of date.
 *
 *   * `stripe_status_at` moves only for a customer.subscription.* event, and this repair is
 *     deliberately not one — so if it moved at all, a genuine subscription event landed inside
 *     the window between the pre-write read and the write. That is the irreducible window: no
 *     amount of re-reading closes it, because the read and the RPC are two round trips. It is
 *     DETECTABLE, which is the point of comparing it.
 *   * `stripe_event_id` is stamped by every successful apply. If it is not this repair's id,
 *     somebody else's write is the one that stands — which is usually fine, and always worth
 *     saying out loud rather than reporting as a success.
 *   * only then are the allowance columns worth reading, because only then is this repair the
 *     write they came from.
 *
 * WHAT stripe_status_at CANNOT SEE, stated here because this is where the guarantee is made
 * and an operator reading it deserves its edges as well as its middle.
 *
 * It sees SUBSCRIPTION events. It cannot see a plan change that arrives on anything else,
 * because the migration moves that column only for `customer.subscription.%` — and
 * checkout.session.completed is a real, sixteen-argument, plan-and-allowance-setting event
 * that is not one. A checkout landing inside this window is applied, and then overwritten by
 * this repair, and every test below passes: the clock did not move, the event id IS this
 * repair's, and the two allowance columns hold exactly what the intent asked for. The run
 * prints "applied and verified" and there is nothing dishonest about it — the row simply
 * cannot be asked the question. The shape is at its most likely on a membership whose
 * stripe_status_at is null, i.e. one that has never had a subscription event: a comped or
 * grandfathered account, or one whose only Stripe history is a checkout.
 *
 * What that costs, and what it does not: the two failures this whole shape was rewritten for —
 * a mid-window DOWNGRADE and a mid-window CANCELLATION — are both customer.subscription.*
 * events, so both are still caught here in full, named, and exited non-zero. The residual is
 * narrower than the original bug, not a return to it. Closing it needs the write itself to be
 * conditional on the row not having moved — a compare-and-set inside apply_stripe_entitlement,
 * which is a migration and not this script's to make. Until then `--only` is the mitigation:
 * one reviewed membership and a window a round trip long.
 */
function confirmWrite(repair: Repair, before: Candidate, after: Candidate): Refusal | null {
  const ours = after.stripe_event_id === repair.eventId;
  const clockMoved = after.stripe_status_at !== before.stripe_status_at;

  if (clockMoved && ours) {
    const landedOnTop =
    after.plan === repair.plan &&
    after.sku_limit === repair.skuLimit &&
    after.editor_seat_limit === repair.editorSeatLimit;

    const preamble =
    'a customer.subscription.* event landed while this repair was in flight — stripe_status_at ' +
    `moved ${before.stripe_status_at} -> ${after.stripe_status_at}`;

    // Which of the two happened depends on that event's own Stripe timestamp against this
    // run's, and both are real: an event Stripe created before the run began can still be
    // delivered during it.
    if (!landedOnTop) {
      return refused(
        'nothing-written',
        `${preamble}. Because this run is stamped earlier than that event, ` +
        "apply_stripe_entitlement withdrew this repair's opinion about the plan and the allowance " +
        `with it, so nothing was reverted — the row is that event's and holds plan ` +
        `"${after.plan}", sku_limit ${after.sku_limit}. This membership was simply not repaired; ` +
        'run again once the subscription has settled'
      );
    }
    return refused(
      'stands-on-top',
      `${preamble} — and THIS REPAIR WROTE ON TOP OF IT, re-asserting plan "${repair.plan}" and ` +
      `${repair.skuLimit} SKUs over whatever that event said. If it was a downgrade or a ` +
      'cancellation, the row now claims a plan the customer no longer pays for. Read the ' +
      'subscription in Stripe and correct the membership by hand: nothing here can undo it'
    );
  }

  if (!ours) {
    return refused(
      'nothing-written',
      `the repair applied, but the row's stripe_event_id is now ${after.stripe_event_id ?? 'null'} ` +
      `and not ${repair.eventId}: something wrote this membership immediately afterwards and ITS ` +
      `write is the one that stands${clockMoved ? ' (a customer.subscription.* event — the ordering clock moved with it)' : ''}. ` +
      `The row holds sku_limit ${after.sku_limit}, editor_seat_limit ${after.editor_seat_limit}. If ` +
      'that is what Stripe now says then nothing is wrong except that this membership was not ' +
      'repaired'
    );
  }

  if (after.sku_limit !== repair.skuLimit || after.editor_seat_limit !== repair.editorSeatLimit) {
    return refused(
      'nothing-written',
      `the RPC reported success but the row holds sku_limit ${after.sku_limit}, ` +
      `editor_seat_limit ${after.editor_seat_limit}`
    );
  }
  return null;
}

/**
 * Un-claim a synthetic event id whose write did not land.
 *
 * apply_stripe_entitlement inserts the ledger row BEFORE the resolution ladder, so a call that
 * returns 'applied' having written nothing still leaves `repair_allowance_v1_<id>` in
 * public.stripe_webhook_events with outcome 'applied'. Left there, that row is wrong twice: it
 * records a write that did not happen, and it makes every later run of THIS script return
 * 'duplicate' for that membership — the id is spent, and only a v2 could try again.
 *
 * Deleting it is the narrowest correction available: one row, matched on an id this script
 * minted itself, which no Stripe delivery can ever carry. No Stripe event id is touched and
 * the ledger's exactly-once guarantee for real webhook traffic is untouched with it.
 *
 * The membership's own stripe_event_id can be left naming the retracted id — the RPC stamps
 * that column on every apply, including one that wrote nothing else. It is a text column and
 * not a foreign key, and a dangling name there is much cheaper than a second write to a row
 * this run has just concluded it should not be touching.
 *
 * WHEN IT IS CALLED, AND WHEN IT MUST NOT BE. Only on `nothing-written`: this repair's plan and
 * allowance are not what the row holds, so the ledger row claims a repair that is not there,
 * and withdrawing it frees v1 for a real attempt later.
 *
 * On `stands-on-top` the ledger row is KEPT, and that is the whole point of the distinction.
 * There the repair DID write, over a genuine downgrade or cancellation, and it is still on the
 * row; `repair_allowance_v1_<id>` in stripe_webhook_events, with its event_at, is the only
 * durable record anywhere that this run is what put that plan back. The membership's own
 * stripe_event_id names it, so deleting the ledger row does not even hide the repair — it just
 * removes the thing the name points at, leaving whoever investigates tomorrow with a dangling
 * id and no timestamp. An incident record is not litter. Buying a retry of v1 by erasing the
 * evidence of a write that needs investigating is the worst trade in this file.
 */
async function retractLedgerRow(admin: Admin, eventId: string): Promise<string | null> {
  const { error } = await admin.
  from('stripe_webhook_events').
  delete().
  eq('event_id', eventId);

  if (!error) return null;
  return (
    `and the ledger row for ${eventId} could NOT be retracted (${error.message}), so that id is ` +
    'burned: re-running this script will return "duplicate" for this membership for ever. A ' +
    `retry needs REPAIR_EVENT_PREFIX bumped to repair_allowance_v2_, or that one row deleted ` +
    'by hand from public.stripe_webhook_events'
  );
}

/** The store, as the webhook sees it. Only built in --write mode. */
type Store = ReturnType<typeof createEntitlementStore>;

/**
 * Confirm, write, prove. Returns null when the membership is repaired, a Settled when somebody
 * else has already repaired it, or the Refusal that goes both on screen and under "needs a
 * human" — carrying, with the sentence, what this run left on the row.
 */
async function applyOne(
admin: Admin,
store: Store,
repair: Repair,
eventAt: string)
: Promise<RowOutcome> {
  // THE ROW AGAIN, IMMEDIATELY BEFORE THE WRITE. Everything above happened against a read that
  // is now some milliseconds old, and this job runs while Stripe is still delivering.
  const before = await readRow(admin, repair.row.id);
  if (typeof before === 'string') return refused('nothing-written', `NOT repaired — ${before}`);

  const drifted = movedBetween(repair.row, before);
  if (drifted.length > 0) {
    return refused(
      'nothing-written',
      `NOT repaired — the row changed while this run was in flight (${drifted.join(', ')}). ` +
      'Something else wrote this membership, and a Stripe webhook is the usual answer. This ' +
      'repair re-asserts the plan it read, so applying it now would write that plan back over ' +
      'whatever landed — a downgrade or a cancellation would be silently undone and the customer ' +
      'would keep an allowance they no longer pay for. Read the row, then re-run with ' +
      `--only ${repair.row.id} if it still needs repairing`
    );
  }

  // THE ORDERING CLOCK. apply_stripe_entitlement withdraws a non-subscription event's opinion
  // about the plan when p_event_at <= stripe_status_at, and the allowance travels with the
  // plan — so the call would ledger this id, write nothing, and return 'applied'. Checked here
  // rather than left to the read-back because refusing costs nothing and the read-back costs
  // the event id.
  //
  // Compared against the ROW's own clock rather than against a timestamp taken from the
  // database, and that is the stronger test rather than the lazier one: stripe_status_at is
  // Stripe's `event.created`, not Postgres's now(), so it can sit in the future of a database
  // whose clock is perfectly correct. Sourcing now() from the database would not see that;
  // this does. (PostgREST renders timestamptz as `…+00:00` and this run stamps `…Z`, so the
  // two are parsed before they are compared — lexicographic order across those two spellings
  // is not chronological order.)
  const rowClock = repair.row.stripe_status_at === null ? null : Date.parse(repair.row.stripe_status_at);
  if (rowClock !== null && (Number.isNaN(rowClock) || rowClock >= Date.parse(eventAt))) {
    return refused(
      'nothing-written',
      'NOT repaired — its ordering clock is at or ahead of this run (stripe_status_at ' +
      `${repair.row.stripe_status_at}, this run's event_at ${eventAt}). apply_stripe_entitlement ` +
      "would have withdrawn this repair's opinion about the plan, dropped the allowance with " +
      `it, written nothing and still returned "applied" — burning ${repair.eventId}. Check the ` +
      "clock on this host against the database's, then run again"
    );
  }

  let outcome: ApplyOutcome;
  try {
    outcome = await store.apply(intentFor(repair, eventAt));
  } catch (error) {
    // 'unconfirmed', not 'nothing-written'. A throw is a transport that stopped answering, and
    // the call it was carrying may well have committed on the far side. Guessing "nothing was
    // written" here is exactly the kind of comforting sentence this script must not print.
    const message = error instanceof Error ? error.message : String(error);
    return refused(
      'unconfirmed',
      'NOT repaired — apply_stripe_entitlement threw, so whether it wrote is UNKNOWN: ' +
      `${message}. Read the row and the ledger row for ${repair.eventId} before assuming either way`
    );
  }

  if (outcome === 'duplicate') {
    // This run's own view of the row is now the OLDEST fact it has, and 'duplicate' is exactly
    // the outcome that says somebody else has been here. Reporting the scan-time row back as if
    // it were current is how two operators repairing the same population produce two false
    // statements about a membership that is, by then, perfectly correct: this branch used to
    // say "the row still holds the fail-closed default" and name a stripe_event_id read before
    // the other run wrote. So the row is read AGAIN and the answer describes what it holds NOW.
    return await explainDuplicate(admin, repair);
  }

  if (outcome !== 'applied') {
    // Every remaining outcome is the function declining, and each is worth reading in full in
    // 20260802120000 section 6.
    return refused('nothing-written', `NOT repaired — outcome "${outcome}", nothing written`);
  }

  const after = await readRow(admin, repair.row.id);
  if (typeof after === 'string') {
    // The RPC said 'applied', so a write DID happen; what it left is what could not be read.
    // 'unconfirmed', never 'nothing-written'.
    return refused(
      'unconfirmed',
      `NOT repaired — apply_stripe_entitlement reported "applied", so this repair HAS written, ` +
      `but the row could not be read back to say what it wrote over: ${after}. The ledger row ` +
      `for ${repair.eventId} has been left in place, because withdrawing the record of a write ` +
      'that may well stand is worse than a spent id. Read the row'
    );
  }

  const problem = confirmWrite(repair, before, after);
  if (!problem) return null;

  // THE LEDGER ROW IS KEPT WHEN THE WRITE STANDS. See retractLedgerRow: withdrawing the id is
  // right when this repair's numbers are not on the row, and is destroying the incident record
  // when they are.
  if (problem.landing === 'stands-on-top') {
    return refused(
      problem.landing,
      `NOT repaired — ${problem.sentence}. The ledger row for ${repair.eventId} has deliberately ` +
      'been KEPT: this repair wrote and its write is still on the row, so that row — with its ' +
      'event_at — is the only durable record of what happened here, and brand_memberships.' +
      'stripe_event_id names it. v1 is spent for this membership, which is correct; a further ' +
      'attempt is a human deciding what the plan should be, not another run of this script'
    );
  }

  const retraction = await retractLedgerRow(admin, repair.eventId);
  if (retraction) return refused(problem.landing, `NOT repaired — ${problem.sentence}, ${retraction}`);
  return refused(
    problem.landing,
    `NOT repaired — ${problem.sentence}. This repair's allowance is not what the row holds, so ` +
    `the ledger row for ${repair.eventId} has been retracted: v1 is not spent on this outcome ` +
    'and this membership can be attempted again once the reason is understood'
  );
}

/**
 * WHAT THE ROW HOLDS NOW, after apply_stripe_entitlement answered 'duplicate'.
 *
 * The candidate scan said this membership was on the fail-closed default. 'duplicate' says the
 * v1 id for it is already in the ledger. Between those two facts sits the ordinary case that
 * produces both: ANOTHER OPERATOR running this same script against the same population, a
 * moment ahead of this one. The id is stable per membership precisely so that the second run
 * cannot apply twice — and the row it is now describing is one the first run has already put
 * right.
 *
 * So the row is re-read and the sentence is written from that, not from the scan. Two answers,
 * and they are genuinely different news:
 *
 *   * the row now holds the contract allowance for its plan — there is nothing to do. Said as
 *     such, and NOT counted as a failure, because a membership that is correct is the outcome
 *     this script exists for regardless of which run got there first.
 *   * it does not — then 'duplicate' is the real problem it always was: the id is spent while
 *     the allowance is still wrong, and the two readings below are what a human needs.
 */
async function explainDuplicate(admin: Admin, repair: Repair): Promise<RowOutcome> {
  const now = await readRow(admin, repair.row.id);

  if (typeof now === 'string') {
    return refused(
      'nothing-written',
      `NOT repaired — outcome "duplicate": ${repair.eventId} is already in the ledger, and this ` +
      `run then could not re-read the membership to see what it holds now (${now}). At the ` +
      `candidate scan it held plan "${repair.row.plan}", sku_limit ${repair.row.sku_limit}, ` +
      `stripe_event_id ${repair.row.stripe_event_id ?? 'null'} — those are SCAN-TIME facts and ` +
      'may already be out of date. Read the row and the ledger row before concluding anything'
    );
  }

  const correctNow =
  now.plan === repair.plan &&
  now.sku_limit === repair.skuLimit &&
  now.editor_seat_limit === repair.editorSeatLimit;

  if (correctNow) {
    const byUs = now.stripe_event_id === repair.eventId;
    return {
      sentence:
      `already repaired — outcome "duplicate": ${repair.eventId} was already in the ledger, and ` +
      `the row now holds plan "${now.plan}", sku_limit ${now.sku_limit}, editor_seat_limit ` +
      `${now.editor_seat_limit}, which is exactly what this run would have written. ` + (
      byUs ?
      'Its stripe_event_id is that same repair id, so another run of this script got here ' +
      'first — two operators, one population. Nothing to do' :
      `Its stripe_event_id is ${now.stripe_event_id ?? 'null'}, so a later write is the one that ` +
      'stands, and it agrees with the contract. The v1 id is spent for this membership, which ' +
      'costs nothing while the allowance is right. Nothing to do')
    };
  }

  // The re-read answers the question this branch used to leave to the reader as an if/else.
  // The row's own stripe_event_id is right here; there is no reason to make somebody at 2am
  // compare two ids in their head.
  const reading =
  now.stripe_event_id === repair.eventId ?
  'That IS the repair id, so the repair did land and something outside ' +
  'apply_stripe_entitlement has since put the default back — which is the interesting bug here, ' +
  'and it is not in the webhook' :
  'That is NOT the repair id, so either a later event overwrote the repair or an earlier run ' +
  'claimed the id without writing. Read the ledger row for it before blaming the webhook';

  return refused(
    'nothing-written',
    `NOT repaired — outcome "duplicate": ${repair.eventId} is already in the ledger, and a ` +
    `re-read shows the row still does NOT hold this plan's allowance: it has plan "${now.plan}", ` +
    `sku_limit ${now.sku_limit}, editor_seat_limit ${now.editor_seat_limit}, stripe_event_id ` +
    `${now.stripe_event_id ?? 'null'}. ${reading}. Note that v1 is spent for this membership ` +
    'either way: nothing was retracted here, because this run is not what claimed the id'
  );
}

async function main(): Promise<void> {
  const args = readArgs(process.argv.slice(2));
  const connection = openSupabase(args);
  assertFloorMatchesContract();

  const admin = createAdminClient(connection.url, connection.serviceRoleKey);

  // ONE TIMESTAMP FOR THE WHOLE RUN, TAKEN BEFORE THE FIRST READ — literally here, before the
  // brands preflight and before the candidate scan, which is what that sentence has to mean if
  // it is going to be written down. It used to be stamped further down, after the scan and
  // after the --only explain reads, while claiming this; taking it here costs nothing and makes
  // it true. Earlier is also the safe direction: every millisecond earlier can only make the
  // ordering rule below MORE likely to take the repair's side of a race away from it.
  //
  // It is a safety property rather than a tidiness one. Stamped per row at write time — which
  // is what this script used to do — the repair is always NEWER than any event it is racing, so
  // apply_stripe_entitlement's ordering branch lets it through and `plan = coalesce(v_plan,
  // m.plan)` writes the scanned plan back over a downgrade or a cancellation that landed seconds
  // earlier. Stamped once up front it is OLDER than anything that arrives during the run, so for
  // those events the database's own rule — withdraw a non-subscription event's opinion when
  // p_event_at <= stripe_status_at — takes the repair's side of the race away from it. The guard
  // in applyOne then keeps that from turning into a burnt event id, and the read-back reports
  // whatever is left.
  //
  // It also makes one invocation greppable in the ledger as one operation.
  const eventAt = new Date().toISOString();

  // Preflight. apply_stripe_entitlement returns 'unknown_brand' for a brand this database
  // does not run, which would otherwise show up as every repair quietly doing nothing.
  const { data: brandRow, error: brandError } = await admin.
  from('brands').
  select('slug').
  eq('slug', REPO_BRAND).
  maybeSingle();
  if (brandError) fail(`could not read public.brands: ${brandError.message}`);
  if (!brandRow) {
    fail(
      `project ${args.project} has no brand "${REPO_BRAND}". This is the wrong project: the\n` +
      '  Batchlabel memberships this script repairs live wherever that brand row does.'
    );
  }

  const rows = await candidates(admin, args.only);
  console.log(
    `candidates (sku_limit = ${FAIL_CLOSED_SKU_LIMIT}, membership active, plan <> ${FREE_PLAN}` +
    (args.only.length > 0 ? ', --only' : '') + `): ${rows.length}`
  );

  for (const id of args.only) {
    if (!rows.some((row) => row.id.toLowerCase() === id)) await explainMissing(admin, id);
  }

  const store = args.write ? createEntitlementStore(admin) : null;

  let entitled = 0;
  let repaired = 0;
  let planned = 0;
  let alreadyCorrect = 0;

  // FAILURES ARE COUNTED BY WHAT THEY LEFT ON THE ROW, not just counted. The last line of this
  // run is the last thing an operator reads at 2am, and "N repair(s) did not land. Nothing was
  // written for those rows." is false in exactly the case that matters most: a repair that
  // landed on top of a genuine downgrade DID write, the detail above says so in capitals, and
  // the summary used to contradict it.
  const failures: Refusal[] = [];

  for (const row of rows) {
    if (!(await entitledAccordingToDatabase(admin, row))) {
      console.log(
        `\n  --  not entitled  ${label(row)}` +
        `\n      public.entitlement_is_active() says no for plan_status ${JSON.stringify(row.plan_status)}, ` +
        `current_period_end ${JSON.stringify(row.current_period_end)}. Left alone.`
      );
      continue;
    }
    entitled += 1;

    const repair = planRepair(row);
    if (!repair) continue;
    planned += 1;
    printRepair(repair, planned, args.write);

    if (!args.write || !store) continue;

    const outcome = await applyOne(admin, store, repair, eventAt);
    if (outcome === null) {
      repaired += 1;
      console.log(`      ✓ applied and verified: sku_limit ${repair.skuLimit}, editor_seat_limit ${repair.editorSeatLimit}`);
      continue;
    }

    const [headline, ...detail] = outcome.sentence.split(' — ');
    if (!isRefusal(outcome)) {
      // Somebody else's run got here first and the row is right. Not a failure, and it must not
      // be made to look like one — but it is not silent either, because two operators on one
      // population is worth knowing about.
      alreadyCorrect += 1;
      console.log(`      ✓ ${headline}`);
      console.log(wrap(detail.join(' — '), '        '));
      continue;
    }

    failures.push({ landing: outcome.landing, sentence: `${label(row)} — ${outcome.sentence}` });
    console.log(`      ✗ ${headline}`);
    console.log(wrap(detail.join(' — '), '        '));
  }

  if (rows.length === 0) await requireVisibleMemberships(admin, connection);

  console.log(
    `\n${rows.length} candidate(s); ${entitled} entitled according to public.entitlement_is_active(); ` +
    `${planned} repairable` + (
    args.write ?
    `; ${repaired} repaired and verified` + (alreadyCorrect > 0 ? `; ${alreadyCorrect} already correct` : '') :
    '')
  );

  for (const failure of failures) notes.push(failure.sentence);

  if (notes.length > 0) {
    console.log('\n─── needs a human ─────────────────────────────────────────────');
    for (const note of notes) console.log(`  ! ${wrap(note, '    ').trimStart()}`);
  }

  console.log('\n─── verify from SQL ───────────────────────────────────────────');
  console.log(VERIFY_SQL);

  if (failures.length > 0) {
    // THE LAST THING ON THE SCREEN. One count per kind of ending, because they need different
    // things from the person reading: the first needs a re-run, the second needs a human in
    // Stripe tonight, the third needs somebody to go and look before assuming either.
    const wroteNothing = failures.filter((entry) => entry.landing === 'nothing-written').length;
    const wroteOnTop = failures.filter((entry) => entry.landing === 'stands-on-top').length;
    const unconfirmed = failures.filter((entry) => entry.landing === 'unconfirmed').length;

    console.error(`\n✗ ${failures.length} of ${planned} repair(s) did not land.`);
    if (wroteNothing > 0) {
      // Deliberately does NOT promise that the repair id was withdrawn. It is on the branches
      // that retracted, and it is untrue on the ones that did not — a 'duplicate' leaves the
      // id spent, because the run that spent it was not this one.
      console.error(
        `  ${wroteNothing} changed nothing — this run's plan and allowance are not on those rows.` +
        '\n    What to do about each, and whether its repair id is still available, is above.'
      );
    }
    if (wroteOnTop > 0) {
      console.error(
        `  ${wroteOnTop} WROTE ON TOP of a genuine Stripe event and the write is still there.` +
        '\n    Those rows were CHANGED by this run, nothing here can undo it, and the ledger row' +
        '\n    for each has been kept as the record. Read them in Stripe now — see above.'
      );
    }
    if (unconfirmed > 0) {
      console.error(
        `  ${unconfirmed} could not be confirmed either way. Read the row and the ledger before` +
        '\n    assuming anything was or was not written.'
      );
    }
    console.error('');
    process.exit(1);
  }

  if (!args.write) {
    if (planned === 0) {
      console.log('\nNothing to repair, and nothing was written.\n');
      return;
    }
    console.log(
      `\n${planned} membership(s) would be repaired. Nothing was written.` +
      '\n\nREAD THE LIST FIRST. A membership whose allowance was set BY HAND — a grandfathered or' +
      '\ncomped account, which 20260802120000 section 1 says is an UPDATE rather than an invented' +
      '\nStripe price — looks identical here to one the webhook never resolved: both sit on an' +
      '\nentitling plan at the fail-closed default. This script cannot tell them apart, and it' +
      '\nwill raise a hand-set 3 to the full tier allowance. Name the rows that SHOULD be' +
      '\nrepaired, rather than repairing the population, whenever there is any doubt:' +
      `\n\n  npx vite-node scripts/repair-allowances.ts --project ${args.project} --only <membership id> --write` +
      '\n\nRepairing one reviewed row at a time is also the safe way to run this against live' +
      '\nwebhook traffic: a subscription that changes mid-run is refused rather than reverted,' +
      '\nbut a shorter run is a smaller window.\n'
    );
    return;
  }

  if (repaired === 0) {
    // "Nothing needed repairing" is a claim about the POPULATION, and it used to be printed
    // after a run in which every row named with --only had been examined and refused — a row
    // belonging to another brand, a plan the contract does not know, a membership that is not a
    // candidate at all. Those rows may well need repairing; this script is simply not the thing
    // that repairs them. Only the genuinely empty case gets the all-clear now.
    if (alreadyCorrect > 0) {
      console.log(
        `\n${alreadyCorrect} membership(s) were already correct — another run got there first — and ` +
        'nothing\nwas written by this one.\n'
      );
      return;
    }
    if (planned === 0 && (rows.length > 0 || args.only.length > 0)) {
      const considered =
      args.only.length > 0 ?
      `${args.only.length} membership(s) named with --only` :
      `${rows.length} candidate(s)`;
      console.log(
        '\nNothing was written, and this run repaired nothing:' +
        `\nthe ${considered} were considered and every one was left alone.` +
        '\nThe reason against each is under "needs a human" above. A row listed' +
        '\nthere may still need repairing — by somebody, or by something that is' +
        '\nnot this script.\n'
      );
      return;
    }
    console.log('\nNothing needed repairing, and nothing was written.\n');
    return;
  }
  console.log(`\n✓ ${repaired} membership(s) repaired and verified in project ${args.project}.\n`);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
