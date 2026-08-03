-- Plan limits, and the end of "any non-free slug entitles".
--
-- Two changes, and they answer two different questions. Keeping them apart is the whole
-- design, so it is stated once here and enforced by the shapes below:
--
--   * WHETHER  — entitlement_is_active(). May this person use the product at all?
--   * HOW MUCH — sku_limit / editor_seat_limit on the row. How many things may they have?
--
-- Folding the second into the first is the failure this file exists to prevent. `active`
-- gates export, print and reprint in the product app, and it is the only server-side guard
-- against selling the same customer a second subscription. A maker one SKU over their
-- allowance who lost `active` would lose the ability to re-print a label for stock that is
-- already on a shelf — which is a reprint, is unmetered on every tier, and is needed at
-- exactly the moment a recall or a Trading Standards query happens. Over the limit is
-- `active = true` AND `sku_count >= sku_limit`. Two facts, two columns, two questions.
--
-- WHY THE ALLOWANCE IS AN INTEGER ON THE ROW AND NOT A PLAN NAME
--
--   * a plan-name -> limit map copied into a client bundle is the same defect class as the
--     duplicated "is active" rule that docs/ENTITLEMENTS.md already forbids;
--   * grandfathering and comped accounts become an UPDATE, not an invented Stripe price;
--   * enforcement, when it lands, compares a count against a column in the same database.
--
-- WHERE THE RULE THAT PRODUCES THE NUMBER LIVES: src/server/plan-contract.ts, server-side
-- and in version control. Deliberately NOT Stripe metadata — dashboard-editable by anyone
-- with access to an account shared across Orchestrate brands, i.e. an unaudited grant path.
-- Deliberately NOT a Postgres table either: the Supabase dashboard is the same hazard in a
-- different hat. This database stores the RESULT of resolution, never the rule. No tier's
-- SKU count and no tier's seat count appears anywhere below; every one arrives as an
-- argument on the write path.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
--
--   * It does not create public.products, and it does not create the SKU enforcement
--     trigger. Those are the cofounder's, and they key on ACCOUNT_ID (see section 8).
--     sku_limit is therefore stored, exposed and displayable from today, and NOT enforced.
--     No surface may claim otherwise until the trigger exists.
--   * It does not create can_modify. That boolean ships with enforcement, in the same
--     migration, for the same reason. Until then the read surface simply does not have the
--     column and the app treats its absence as unknown and fails OPEN — a missing column
--     must never become a lockout.
--   * It does not add sku_count. A view column is fixed at `create view` time and cannot
--     conditionally reference a table that does not exist yet. Absent is read as unknown,
--     never as zero.
--
-- Additive, and every statement is re-runnable.

-- ---------------------------------------------------------------------------
-- 1. The allowance columns.
--
-- NOT NULL, defaulting to the SMALLEST allowance, mirroring `plan text not null default
-- 'free'` from 20260729120000. A row created by a path nobody remembered gets the least,
-- never the most. These two defaults are the only allowance literals in this file, they are
-- the floor rather than a copy of any tier's figure, and the plan contract writes this DDL
-- out verbatim.
--
-- NOT NULL is load-bearing rather than tidiness: because the column can never be null, the
-- enforcement trigger — whenever it lands — can never observe a null, and therefore can
-- never fail open on one. `count >= NULL` is NULL, which is not TRUE, which allows the
-- insert; that is failing open at precisely the point that knows least.
--
-- THE SEAT COLUMN IS `editor_seat_limit`, NOT `seat_limit`. The longer name is the cheapest
-- available guard against the one wrong reading — that read-only viewers count against it.
-- They never do, on any tier. There is deliberately no read_only_seat_limit column: a column
-- implying a ceiling would eventually be enforced by accident.
-- ---------------------------------------------------------------------------
alter table public.brand_memberships
  add column if not exists sku_limit         integer not null default 3,
  add column if not exists editor_seat_limit integer not null default 1;

comment on column public.brand_memberships.sku_limit is
  'How many live SKUs this membership may hold. A SKU is one thing you sell: one fragrance in one pack size. Resolved server-side from the subscription price by src/server/plan-contract.ts and written only by apply_stripe_entitlement; never read from Stripe metadata. 2147483647 means unlimited — read sku_unlimited on the entitlements view rather than comparing against that number. NOT ENFORCED until the SKU enforcement trigger ships with the products table.';

comment on column public.brand_memberships.editor_seat_limit is
  'How many EDITOR seats this membership may hold. Named for what it counts: read-only seats are unlimited and free on every tier, so they are deliberately not represented here and there is no read_only_seat_limit column to be enforced by accident. Seats are billed on edit permission, never on account existence.';

-- Constraints added by drop-then-add so a re-run cannot fail on "already exists".
alter table public.brand_memberships
  drop constraint if exists brand_memberships_sku_limit_check;
alter table public.brand_memberships
  add  constraint brand_memberships_sku_limit_check check (sku_limit >= 0);

-- >= 1, not >= 0. A membership with zero editor seats could not be edited by the person
-- paying for it, which is not a state any tier should be able to express.
alter table public.brand_memberships
  drop constraint if exists brand_memberships_editor_seat_limit_check;
alter table public.brand_memberships
  add  constraint brand_memberships_editor_seat_limit_check check (editor_seat_limit >= 1);

-- Belt and braces, exactly as 20260801120000 does. The table-level SELECT grant from
-- 20260729120000 already covers the new columns; a write grant must never appear, because a
-- browser that can UPDATE its own membership can set its own allowance.
revoke insert, update, delete on public.brand_memberships from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The unlimited sentinel, in exactly one place.
--
-- Unlimited is 2147483647 (int4 max) — not NULL and not -1.
--   * NULL is already what "we don't know" looks like: a left-join miss, an unwritten
--     column and a failed request all produce it, and it would collapse "unlimited" and
--     "unknown" into one wire value that the app must be able to tell apart.
--   * -1 violates the CHECK above, and `count >= -1` is always true, so a forgotten special
--     case would lock the highest-paying tier out of creating anything at all.
-- The sentinel is an ordinary integer to a comparison, so there is no special case and
-- therefore no branch that can be forgotten.
--
-- Both the view and get_entitlement need the test, so it is a function rather than a copied
-- expression: otherwise the database holds two definitions of "unlimited" that can drift.
-- The literal appears here and in the UNLIMITED constant in the plan contract, and nowhere
-- else in the system.
--
-- No `set search_path`: this function references no object, so a search_path cannot change
-- its meaning, and omitting the clause keeps it inlinable so the view stays a plain scan.
--
-- coalesce, not STRICT: an unexpected null must read as "not unlimited". The column is NOT
-- NULL so that cannot fire today; it fails closed if that ever stops being true.
-- ---------------------------------------------------------------------------
create or replace function public.sku_is_unlimited(p_sku_limit integer)
returns boolean
language sql
immutable
parallel safe
as $$
  select coalesce(p_sku_limit, 0) >= 2147483647;
$$;

comment on function public.sku_is_unlimited(integer) is
  'True when a sku_limit is the unlimited sentinel. The only place 2147483647 appears in this database. Clients read the resulting boolean and never the number, so nobody can render "2,147,483,647 SKUs" to a customer.';

revoke all     on function public.sku_is_unlimited(integer) from public, anon;
grant  execute on function public.sku_is_unlimited(integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. entitlement_is_active: an explicit entitling allow-list.
--
-- THE BUG THIS FIXES. The predicate was `coalesce(p_plan, 'free') <> 'free'`, i.e. every
-- slug that is not the free one entitles. That was true when 'free' and 'maker' were the
-- only slugs. It stopped being true the moment the catalogue gained the £0.01 payment-rail
-- test item: a penny would have bought a real, entitling plan, because rail_test is not
-- 'free' and nothing else was consulted. A deny-list of one is not a policy, it is an
-- accident waiting for the next slug.
--
-- So the predicate is now membership of an explicit set. A new slug entitles nothing until
-- somebody writes it here, which is the correct default for a question about money.
--
-- SIGNATURE AND SEPARATION ARE PRESERVED, DELIBERATELY. Four arguments
-- (text, text, text, timestamptz), unchanged, so no drop is needed and every existing
-- caller keeps working. And it still learns NO QUANTITY: it takes no sku_limit, no seat
-- limit and no count, and it never will. Learning WHICH PLANS ENTITLE is not learning a
-- quantity — it is the same yes/no question it always answered, asked correctly.
--
-- The other judgement calls are unchanged and are restated because they are easy to lose in
-- a rewrite:
--   * the MEMBERSHIP must be active — a suspended or departed member is not entitled even
--     with a live Stripe subscription, otherwise suspending an account does nothing;
--   * past_due COUNTS. Stripe retries a failed renewal for days; locking a paying customer
--     out over a card that expired on a Sunday is worse for us than a few days of unpaid
--     access. The app should nag, not block;
--   * trialing counts. incomplete / incomplete_expired / unpaid / paused / canceled do not;
--   * one day of grace after current_period_end absorbs webhook lag and clock skew.
--
-- ON THE LIST ITSELF: it is ENTITLING_PLANS from the plan contract. It should be emitted
-- from that constant by scripts/emit-plan-check.ts, alongside the plan CHECK constraint, so
-- that the SQL and the contract cannot drift. That script does not exist yet and is not in
-- this workstream, so the list is written by hand HERE ONCE and nowhere else in the
-- database. When the script lands, this array and the CHECK constraint are its two outputs.
-- Until then, section 4 is the guard: it asserts the behaviour rather than trusting the
-- text.
-- ---------------------------------------------------------------------------
create or replace function public.entitlement_is_active(
  p_membership_status text,
  p_plan              text,
  p_status            text,
  p_period_end        timestamptz
)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(p_membership_status, 'active') = 'active'
     and coalesce(p_plan, 'free') = any (array['maker', 'studio', 'consultant'])
     and coalesce(p_status, '') = any (array['active', 'trialing', 'past_due'])
     and (p_period_end is null or p_period_end > now() - interval '1 day');
$$;

comment on function public.entitlement_is_active(text, text, text, timestamptz) is
  'The single definition of "currently entitled". The plan must be in the explicit entitling allow-list (a non-entitling slug such as the payment-rail test item grants nothing, and a slug nobody has thought about grants nothing either); the membership must be active; past_due is treated as a grace period; access survives one day past current_period_end to absorb webhook lag. It knows which plans entitle and it never knows a quantity — sku_limit answers how much, and the two must not be conflated.';

-- The entitlements view is security_invoker, so the CALLER needs EXECUTE on every function
-- the view calls. That has worked so far only because Supabase's default privileges grant
-- EXECUTE on new public-schema functions to anon and authenticated — the same default
-- 20260801120000:485-488 calls dangerous. Stating the grant we actually rely on is additive
-- and cannot break the view; tightening it (revoking from anon) is a separate, testable
-- change and is deliberately not made here.
grant execute on function public.entitlement_is_active(text, text, text, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. The behavioural assertion, run at apply time.
--
-- This is here because the repository has no SQL test harness — no PGlite, no ephemeral
-- Postgres, nothing in vitest that can execute a migration. The property that matters is
-- behavioural, not textual (grepping the function body for a slug would pass on a predicate
-- that reads the list backwards), so the check runs where the behaviour actually exists:
-- inside the database, against the function that was just created, in the same transaction.
--
-- Failing here aborts the migration. That is the point. Shipping a rail_test that entitles
-- means a penny buys a paid tier, and the only thing worse than that bug is that bug
-- arriving silently a second time.
--
-- The negative case alone is not enough — an empty allow-list would pass it while denying
-- every paying customer — so an entitling plan is asserted positive in the same block.
-- ---------------------------------------------------------------------------
do $$
declare
  v_future timestamptz := now() + interval '1 day';
begin
  -- THE ruling: the payment-rail test item grants nothing, ever.
  if public.entitlement_is_active('active', 'rail_test', 'active', v_future) then
    raise exception
      'entitlement_is_active grants entitlement to the rail_test plan. A penny would buy a paid tier. The plan predicate must be membership of the entitling allow-list, not "anything that is not free".'
      using errcode = '22023';
  end if;

  -- The other non-entitling slug, for the same reason.
  if public.entitlement_is_active('active', 'free', 'active', v_future) then
    raise exception 'entitlement_is_active grants entitlement to the free plan.'
      using errcode = '22023';
  end if;

  -- An unknown slug entitles nothing. This is what makes the allow-list a policy rather
  -- than a longer deny-list.
  if public.entitlement_is_active('active', 'something_nobody_has_added_yet', 'active', v_future) then
    raise exception 'entitlement_is_active grants entitlement to an unknown plan slug.'
      using errcode = '22023';
  end if;

  -- ...and the allow-list is not empty. Without this, denying everybody would pass.
  if not public.entitlement_is_active('active', 'maker', 'active', v_future) then
    raise exception
      'entitlement_is_active denies an entitling plan. The allow-list is wrong, and every paying customer is locked out.'
      using errcode = '22023';
  end if;

  -- The separation, asserted rather than asserted-in-a-comment: a suspended membership on
  -- an entitling plan is still not entitled.
  if public.entitlement_is_active('suspended', 'maker', 'active', v_future) then
    raise exception 'entitlement_is_active ignores the membership status.'
      using errcode = '22023';
  end if;

  raise notice 'plan_limits: entitlement_is_active allow-list verified (rail_test and free grant nothing).';
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Drop the read surface and every old write signature, before recreating them.
--
--   * `create or replace view` cannot add a column in the middle or retype one;
--   * `create or replace function` cannot change a return type OR an argument list — it
--     leaves the old definition behind as a callable OVERLOAD.
--
-- The overload is the dangerous one, and it is not theoretical. src/server/supabase-admin.ts
-- calls apply_stripe_entitlement through PostgREST with NAMED arguments. With two overloads
-- present, a call naming only the fourteen original arguments matches BOTH — PostgREST then
-- either errors on ambiguity or resolves to one of them, and the one it resolves to may be
-- the old function that silently ignores the allowance. The row would read "paid plan, free
-- allowance", and nothing would log an error.
--
-- This is the pattern 20260801120000:180-182 already establishes, for exactly this reason.
--
-- entitlement_is_active is deliberately absent from this block: section 3 changed its body
-- and not its signature, so `create or replace` was sufficient and a drop would only have
-- broken the view that depends on it.
-- ---------------------------------------------------------------------------
drop view     if exists public.entitlements;
drop function if exists public.get_entitlement(text);

-- The 14-argument signature currently live in production (20260801120000:263-278).
drop function if exists public.apply_stripe_entitlement(
  text, text, timestamptz, text, uuid, text, text, text, text, text, timestamptz, boolean, timestamptz, jsonb
);

-- The 15-argument signature that took p_email and resolved a membership by it.
-- 20260801120000:180-182 already drops this, so on a database that followed the migration
-- chain it is a no-op. It is repeated because that file records that an earlier build of
-- itself may already have been applied from a branch — this database has a documented
-- history of receiving a signature no committed migration created, and the vulnerable one is
-- the last one to leave lying around. One no-op line is cheaper than assuming.
drop function if exists public.apply_stripe_entitlement(
  text, text, timestamptz, text, uuid, text, text, text, text, text, text, timestamptz, boolean, timestamptz, jsonb
);

-- ---------------------------------------------------------------------------
-- 6. The write path, gaining the allowance.
--
-- The body is the production function from 20260801120000 with three changes, each marked
-- NEW. Everything else — the role re-check, the `for update` resolution ladder, the
-- exactly-once ledger insert, the subscription-identity guard, the two clocks, the
-- same-second tie-break, the jsonb merge — is unchanged, and unchanged deliberately: this
-- function is the most carefully reasoned object in the schema and this migration is not the
-- place to re-litigate any of it. Read 20260801120000:222-262 for why each part is there.
--
-- Both new arguments are nullable and default null, which carries the meaning every other
-- argument already has: "this event says nothing about that column, leave it alone."
--
-- THE ONE NEW INVARIANT: THE ALLOWANCE TRAVELS WITH THE PLAN.
--
-- An event that may not change the plan may not change the allowance. Enforced ONCE,
-- immediately before the UPDATE, rather than inside each branch that withdraws the event's
-- opinion — because the branches are not the only way p_plan arrives null. The webhook's own
-- resolver returns null for an unrecognised price id (it never guesses and never falls back
-- to a default tier), and in that case it passes p_plan => null while an earlier line may
-- still have computed an allowance. One enforcement point covers every route, including that
-- one and including whatever route somebody adds next year.
--
-- Without it, the concrete failure is: a late checkout.session.completed for an upgrade
-- raises sku_limit on a membership whose plan had already been cancelled back to free. The
-- row then reads "free plan, paid allowance" — and enforcement, when it lands, compares the
-- allowance and not the plan name, so the customer keeps the capacity they stopped paying
-- for and no screen shows anything wrong.
-- ---------------------------------------------------------------------------
create or replace function public.apply_stripe_entitlement(
  p_event_id             text,
  p_event_type           text,
  p_event_at             timestamptz,
  p_brand                text,
  p_user_id              uuid        default null,
  p_customer_id          text        default null,
  p_subscription_id      text        default null,
  p_plan                 text        default null,
  p_plan_status          text        default null,
  p_price_id             text        default null,
  p_current_period_end   timestamptz default null,
  p_cancel_at_period_end boolean     default null,
  p_trial_end            timestamptz default null,
  p_billing              jsonb       default '{}'::jsonb,
  p_sku_limit            integer     default null,   -- NEW
  p_editor_seat_limit    integer     default null    -- NEW
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m       public.brand_memberships%rowtype;
  v_billing jsonb := case
                       when jsonb_typeof(p_billing) = 'object' then p_billing
                       else '{}'::jsonb
                     end;
  v_existing    jsonb;
  -- The PostgREST role of the caller, when there is one. NULL on a direct SQL connection
  -- (a migration, the SQL editor, psql), which is why the guard below only rejects a role
  -- it can actually see.
  v_role        text := coalesce(
                          nullif(current_setting('request.jwt.claim.role', true), ''),
                          nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
                        );
  v_is_sub_event boolean := p_event_type like 'customer.subscription.%';
  v_plan         text    := p_plan;
  v_plan_status  text    := p_plan_status;
  v_cancel_at_pe boolean := p_cancel_at_period_end;
  v_sku_limit    integer := p_sku_limit;          -- NEW
  v_seat_limit   integer := p_editor_seat_limit;  -- NEW
begin
  -- Defence in depth. The GRANT below should already make this unreachable for anon and
  -- authenticated, but this function takes the user id as an argument (a Stripe webhook has
  -- no session) and so has no natural auth.uid() guard the way its sibling definer functions
  -- do. If the grant is ever wrong, this is what stops the anon key being a "give me the
  -- paid plan" endpoint.
  if v_role is not null and v_role <> 'service_role' then
    raise exception 'apply_stripe_entitlement is service-role only' using errcode = '42501';
  end if;

  if p_event_id is null or p_event_at is null then
    raise exception 'event id and event timestamp are required' using errcode = '22023';
  end if;

  -- NOT an exception: a 500 here makes Stripe retry an event that can never succeed for
  -- three days and then disable the endpoint.
  if p_brand is null or not exists (select 1 from public.brands b where b.slug = p_brand) then
    return 'unknown_brand';
  end if;

  -- --- Resolve the membership -------------------------------------------------------
  -- Most trustworthy first. p_user_id comes from Stripe metadata that WE wrote at checkout,
  -- on a signed event, so it cannot be forged by a browser.
  if p_user_id is not null then
    select * into v_m
      from public.brand_memberships
     where user_id = p_user_id and brand_slug = p_brand
     for update;
  end if;

  if v_m.id is null and p_subscription_id is not null then
    select * into v_m
      from public.brand_memberships
     where stripe_subscription_id = p_subscription_id and brand_slug = p_brand
     order by created_at
     limit 1
     for update;
  end if;

  if v_m.id is null and p_customer_id is not null then
    select * into v_m
      from public.brand_memberships
     where stripe_customer_id = p_customer_id and brand_slug = p_brand
     order by created_at
     limit 1
     for update;
  end if;

  -- THERE IS STILL DELIBERATELY NO EMAIL RESOLUTION PATH. See 20260801120000:352-367: it was
  -- a critical vulnerability, profiles.email is user-writable, and checkout now requires a
  -- signed-in buyer so every session carries a verified supabase_user_id.
  if v_m.id is null then
    -- Not recorded in the ledger: nothing was decided, so a later "Resend" from the Stripe
    -- dashboard (once the account exists) must still be able to apply it.
    return 'no_membership';
  end if;

  -- --- Exactly once -----------------------------------------------------------------
  insert into public.stripe_webhook_events (event_id, event_type, event_at, brand_slug, user_id, outcome)
  values (p_event_id, p_event_type, p_event_at, p_brand, v_m.user_id, 'applied')
  on conflict (event_id) do nothing;

  if not found then
    return 'duplicate';
  end if;

  -- --- Subscription identity ---------------------------------------------------------
  -- One Stripe customer routinely holds more than one subscription: an `incomplete` one left
  -- behind by a checkout that was never paid, plus the live one from the retry. A different
  -- subscription id may take over only when it plausibly supersedes the stored one.
  if p_subscription_id is not null
     and v_m.stripe_subscription_id is not null
     and p_subscription_id <> v_m.stripe_subscription_id
     and not (
       v_is_sub_event
       and (
         coalesce(v_m.plan_status, '') <> all (array['active', 'trialing', 'past_due'])
         or coalesce(p_plan_status, '') = any (array['active', 'trialing', 'past_due'])
       )
     ) then
    update public.stripe_webhook_events set outcome = 'superseded' where event_id = p_event_id;
    return 'superseded';
  end if;

  -- --- Ordering ---------------------------------------------------------------------
  -- Only customer.subscription.* events advance the clock; see "TWO CLOCKS" in
  -- 20260801120000:233-254 for why one global clock silently loses the period end.
  if v_is_sub_event then
    if v_m.stripe_status_at is not null and p_event_at < v_m.stripe_status_at then
      update public.stripe_webhook_events set outcome = 'stale' where event_id = p_event_id;
      return 'stale';
    end if;

    -- Same-second tie-break. Never let an equally-stamped non-cancellation resurrect a
    -- subscription a cancellation ended.
    if v_m.stripe_status_at is not null
       and p_event_at = v_m.stripe_status_at
       and v_m.plan_status = 'canceled'
       and coalesce(p_plan_status, v_m.plan_status) is distinct from 'canceled' then
      update public.stripe_webhook_events set outcome = 'stale' where event_id = p_event_id;
      return 'stale';
    end if;
  else
    -- An additive event that predates the subscription clock keeps its factual half (the
    -- customer id, the payment failure) and loses its opinion about the plan.
    if v_m.stripe_status_at is not null and p_event_at <= v_m.stripe_status_at then
      v_plan         := null;
      v_plan_status  := null;
      v_cancel_at_pe := null;
    end if;
  end if;

  -- NEW. THE ALLOWANCE TRAVELS WITH THE PLAN — one enforcement point, after every branch
  -- that could have withdrawn the event's opinion, and also covering the case where the
  -- caller never had one. If this event may not say what the plan is, it may not say how
  -- much the plan allows.
  if v_plan is null then
    v_sku_limit  := null;
    v_seat_limit := null;
  end if;

  -- --- Apply ------------------------------------------------------------------------
  v_existing := case
                  when jsonb_typeof(coalesce(v_m.data, '{}'::jsonb) -> 'billing') = 'object'
                    then v_m.data -> 'billing'
                  else '{}'::jsonb
                end;

  update public.brand_memberships m set
    plan                   = coalesce(v_plan, m.plan),
    plan_status            = coalesce(v_plan_status, m.plan_status),
    stripe_customer_id     = coalesce(p_customer_id, m.stripe_customer_id),
    stripe_subscription_id = coalesce(p_subscription_id, m.stripe_subscription_id),
    stripe_price_id        = coalesce(p_price_id, m.stripe_price_id),
    current_period_end     = coalesce(p_current_period_end, m.current_period_end),
    cancel_at_period_end   = coalesce(v_cancel_at_pe, m.cancel_at_period_end),
    trial_end              = coalesce(p_trial_end, m.trial_end),
    sku_limit              = coalesce(v_sku_limit,  m.sku_limit),          -- NEW
    editor_seat_limit      = coalesce(v_seat_limit, m.editor_seat_limit),  -- NEW
    stripe_event_id        = p_event_id,
    stripe_event_at        = p_event_at,
    -- Only a subscription event moves the ordering clock.
    stripe_status_at       = case when v_is_sub_event then p_event_at else m.stripe_status_at end,
    data                   = jsonb_set(
                               coalesce(m.data, '{}'::jsonb),
                               '{billing}',
                               v_existing || v_billing,
                               true),
    updated_at             = now()
  where m.id = v_m.id;

  return 'applied';
end;
$$;

comment on function public.apply_stripe_entitlement(text, text, timestamptz, text, uuid, text, text, text, text, text, timestamptz, boolean, timestamptz, jsonb, integer, integer) is
  'The only write path for Stripe entitlement state. Exactly-once via the stripe_webhook_events primary key, monotonic on event.created (clock scoped to customer.subscription.* events) so out-of-order deliveries cannot rewind state or discard the billing period, and partial (null argument = leave the column alone). sku_limit and editor_seat_limit are resolved server-side from the plan contract and travel with the plan: any event that may not change the plan may not change the allowance. service_role only, enforced by grant AND by a runtime role check.';

-- THE GRANTS MUST BE RE-ISSUED AGAINST THE NEW SIGNATURE, AND THIS IS THE SINGLE MOST
-- DANGEROUS PAIR OF LINES IN THE FILE TO OMIT.
--
-- The old function's ACL died with the old function. This is a NEW function, and Supabase's
-- default privileges grant EXECUTE on new public-schema functions to anon and authenticated
-- as separate ACL entries — `revoke ... from public` does NOT remove them, which is why the
-- roles are named. Skip these and the anon key becomes a "set my plan to Consultant"
-- endpoint. The runtime role check inside the function is the second line of defence, not a
-- substitute for these.
revoke all     on function public.apply_stripe_entitlement(text, text, timestamptz, text, uuid, text, text, text, text, text, timestamptz, boolean, timestamptz, jsonb, integer, integer) from public, anon, authenticated;
grant  execute on function public.apply_stripe_entitlement(text, text, timestamptz, text, uuid, text, text, text, text, text, timestamptz, boolean, timestamptz, jsonb, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 7. The view, rebuilt.
--
-- security_invoker = true remains the whole security of this view: it executes as the
-- CALLER, so "own memberships are readable" (20260729120000:211-214) applies and each user
-- sees exactly one row. Without it the view runs as its owner, which BYPASSES row level
-- security, and hands every signed-in user everybody else's billing state — including, now,
-- everybody else's allowance. It looks fine in testing, because you only ever test with one
-- account. security_barrier as well, so the planner cannot push a user-supplied function
-- inside the view and use it to probe rows the caller cannot see.
--
-- The PostgreSQL 15 assertion at 20260801120000:509-516 already ran and is not repeated:
-- this migration cannot be applied to a server that one did not run on.
--
-- New columns are APPENDED, so the first ten entries of the documented column order stay
-- valid and docs/ENTITLEMENTS.md gains rows rather than being rewritten.
--
-- TWO COLUMNS THE APP ASKS FOR ARE STILL ABSENT, ON PURPOSE:
--   * sku_count — blocked on the products table. A view column is fixed at `create view`
--     time and cannot conditionally reference a relation that does not exist.
--   * can_modify — ships with the enforcement trigger, in the same migration, so that the
--     rule and the boolean that reports it arrive together.
-- Both are read by the app as ABSENT, which its tolerant reader maps to unknown, never to
-- zero and never to false. A missing column must not become a lockout, and "we do not know
-- your count" is honest in a way that "you have none" is not.
-- ---------------------------------------------------------------------------
create view public.entitlements
with (security_invoker = true, security_barrier = true)
as
select
  m.user_id,
  m.brand_slug   as brand,
  m.plan,
  m.plan_status  as status,
  -- The membership lifecycle (active | suspended | left), exposed separately so the app can
  -- tell "you cancelled" from "we suspended you" rather than inferring it from `active`.
  m.status       as membership_status,
  public.entitlement_is_active(m.status, m.plan, m.plan_status, m.current_period_end) as active,
  m.current_period_end,
  m.cancel_at_period_end,
  m.trial_end,
  m.updated_at,
  -- THE ACCOUNT KEY, UNDER ITS FINAL NAME. See section 8 — this is `account_id` everywhere,
  -- and it is one account per user today.
  m.user_id      as account_id,
  -- Not billing state. Here so the app can render the workspace name and the "Billed as"
  -- line from the one read it already makes, instead of a second query straight at
  -- brand_memberships.
  m.business_name,
  -- HOW MUCH, as opposed to WHETHER. Deliberately separate from `active`.
  m.sku_limit,
  m.editor_seat_limit,
  -- So no client ever holds the sentinel. One definition, shared with get_entitlement.
  public.sku_is_unlimited(m.sku_limit) as sku_unlimited
from public.brand_memberships m;

comment on view public.entitlements is
  'Read-only entitlement state for the signed-in user. security_invoker = true, so brand_memberships RLS applies and a caller sees only their own row. `active` answers whether they may use the product; sku_limit and editor_seat_limit answer how much, and the two must never be conflated. sku_limit is not yet enforced. Never grant to anon.';

-- Dropping the view dropped its grants with it.
revoke all     on public.entitlements from anon, authenticated;
grant  select  on public.entitlements to authenticated;

-- ---------------------------------------------------------------------------
-- 8. THE ACCOUNT KEY IS account_id.
--
-- Recorded here because this is the file the next person reads, and because getting it wrong
-- is the one mistake that costs a data migration rather than an edit.
--
-- The SKU tables — public.products and the enforcement trigger over it — are the cofounder's
-- work and are deliberately NOT created by this migration. When they land they must key on
-- `account_id`, not on `owner_user_id` and not on `user_id`. The allowance is per ACCOUNT
-- and not per user: an account with three editors that counted per user would silently get
-- three times its allowance, and the bug would look like a rounding error until somebody
-- added a fourth editor.
--
-- There is no accounts table yet and one account per user is fine for now, which is exactly
-- why the NAME has to be right today. The view above therefore exposes `account_id` already,
-- sourced from the user id. When a real accounts table arrives, only the expression on the
-- right-hand side of that alias changes: no app change, no column rename, no re-keying of a
-- table that by then holds every customer's SKUs.
--
-- Nothing in this file writes or presumes `owner_user_id`.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 9. The same answer as an RPC, for callers who would rather not depend on view semantics.
--
-- SECURITY INVOKER (the default, written out because it matters) plus an explicit auth.uid()
-- predicate: two independent reasons a caller cannot see somebody else's row, so neither one
-- being dropped by accident is enough to leak. Dropped in section 5 rather than replaced,
-- because `create or replace function` cannot change a return type.
-- ---------------------------------------------------------------------------
create or replace function public.get_entitlement(p_brand text default null)
returns table (
  brand                text,
  plan                 text,
  status               text,
  membership_status    text,
  active               boolean,
  current_period_end   timestamptz,
  cancel_at_period_end boolean,
  trial_end            timestamptz,
  updated_at           timestamptz,
  account_id           uuid,
  business_name        text,
  sku_limit            integer,
  editor_seat_limit    integer,
  sku_unlimited        boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    m.brand_slug,
    m.plan,
    m.plan_status,
    m.status,
    public.entitlement_is_active(m.status, m.plan, m.plan_status, m.current_period_end),
    m.current_period_end,
    m.cancel_at_period_end,
    m.trial_end,
    m.updated_at,
    m.user_id,
    m.business_name,
    m.sku_limit,
    m.editor_seat_limit,
    public.sku_is_unlimited(m.sku_limit)
  from public.brand_memberships m
  where m.user_id = auth.uid()
    and (p_brand is null or m.brand_slug = p_brand);
$$;

comment on function public.get_entitlement(text) is
  'Entitlement state for the calling user, optionally filtered to one brand. SECURITY INVOKER plus an explicit auth.uid() predicate. Returns the resolved allowance alongside `active`; the two answer different questions and neither substitutes for the other.';

revoke all     on function public.get_entitlement(text) from public, anon;
grant  execute on function public.get_entitlement(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Verification, not backfill.
--
-- There is deliberately no UPDATE in this file. Writing tier allowances into SQL would put
-- them in a second place, and this database stores the RESULT of resolution, never the rule.
-- Any membership already carrying an entitling plan is re-resolved by replaying its
-- subscription through the webhook ("Resend" in the Stripe dashboard, or a one-shot script
-- that imports allowanceForPlan from the plan contract), which writes the allowance on the
-- normal path and leaves a ledger row proving it happened.
--
-- Until that replay such a row keeps the fail-closed default from section 1 — least
-- allowance, never most — so the intermediate state is safe. It should not be SILENT,
-- though, so this raises a NOTICE naming how many need replaying. A NOTICE cannot fail a
-- migration and is re-runnable by construction.
--
-- The literal 3 below is the column default declared in section 1 of this same file, not a
-- copy of any tier's allowance.
-- ---------------------------------------------------------------------------
do $$
declare
  v_pending integer;
begin
  select count(*) into v_pending
    from public.brand_memberships m
   where public.entitlement_is_active(m.status, m.plan, m.plan_status, m.current_period_end)
     and m.sku_limit = 3;

  if v_pending > 0 then
    raise notice
      'plan_limits: % membership(s) are entitled but still hold the fail-closed default allowance. Replay their subscriptions through the Stripe webhook to resolve the real allowance. Find them with:  select user_id, brand_slug, plan, stripe_subscription_id from public.brand_memberships m where public.entitlement_is_active(m.status, m.plan, m.plan_status, m.current_period_end) and m.sku_limit = 3;',
      v_pending;
  else
    raise notice 'plan_limits: no memberships awaiting allowance resolution.';
  end if;
end
$$;
