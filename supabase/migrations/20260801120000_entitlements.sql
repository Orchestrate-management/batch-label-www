-- Stripe entitlements: the state a subscription actually needs, an exactly-once write
-- path for webhooks, and a read surface the product app can trust.
--
-- WHY THIS EXISTS
--
-- 20260729120000 gave brand_memberships four billing columns (plan, plan_status,
-- stripe_customer_id, stripe_subscription_id) and no way to fill them. That is enough to
-- record "this person pays us" and not enough to answer the only question the product
-- ever asks: *is this person entitled right now?* Answering that needs three more facts:
--
--   * current_period_end     — a cancelled-at-period-end subscription is still ACTIVE
--                              until that date. Without it we would cut someone off the
--                              moment they clicked cancel, having taken their money.
--   * cancel_at_period_end   — so the UI can say "ends on the 14th" instead of silently
--                              expiring, which is how you get a chargeback.
--   * trial_end / price id   — which thing they bought, and whether they are in a trial.
--
-- WHY THE WRITE PATH IS A FUNCTION AND NOT A PATCH
--
-- Stripe webhooks are at-least-once and NOT ordered. The same event arrives twice on a
-- retry, and a `customer.subscription.deleted` can be delivered before a `.updated` that
-- Stripe generated earlier. A naive "PATCH the row with whatever this event says" ends up
-- storing the state of whichever delivery happened to land last — i.e. it is a coin toss
-- whether a cancelled customer keeps access or a paying one loses it.
--
-- So the write path is one SECURITY DEFINER function, apply_stripe_entitlement(), which
-- in a single transaction:
--   1. resolves which membership the event is about (metadata > subscription > customer >
--      the email that paid, and that last one only to BOOTSTRAP a membership that has no
--      Stripe ids yet — see the note on it below, it is a real attack otherwise),
--   2. claims the Stripe event id in an append-only ledger — the PRIMARY KEY is what makes
--      processing exactly-once, not an application-level "have I seen this?" check that
--      two concurrent invocations would both fail,
--   3. refuses to let an OLD event contradict a newer one, monotonic on Stripe's own
--      event.created, with the clock scoped to the customer.subscription.* family (see
--      "TWO CLOCKS" below — one global clock silently throws away the period end),
--   4. applies the change as a partial update — a null argument means "this event says
--      nothing about that column", so a checkout.session.completed cannot blank the period
--      end that customer.subscription.created had already written.
--
-- WHY NO BROWSER CAN WRITE ANY OF IT
--
-- brand_memberships still grants INSERT/UPDATE/DELETE to nobody (20260729120000 granted
-- SELECT only, and this migration re-revokes for good measure). apply_stripe_entitlement is
-- executable by `service_role` alone, and revokes EXECUTE from `anon` and `authenticated`
-- BY NAME rather than relying on `revoke ... from public` — Supabase's default privileges
-- grant EXECUTE on new public-schema functions to those roles as separate ACL entries, and
-- revoking from PUBLIC does not touch them. Getting that wrong would publish a
-- "give me the paid plan" endpoint on the anon key. It also re-checks the caller's role at
-- runtime, so the GRANT is a second line of defence rather than the only one.
--
-- Multi-brand design is intact: everything is keyed on brand_slug, the new columns are
-- generic to any subscription business, and Stripe-specific extras (billing interval, last
-- payment failure) go in data->'billing' per supabase/README.md.
--
-- Safe to re-run: `if not exists` / `create or replace` throughout.

-- ---------------------------------------------------------------------------
-- 1. The columns a real subscription needs.
-- ---------------------------------------------------------------------------
alter table public.brand_memberships
  add column if not exists stripe_price_id      text,
  add column if not exists current_period_end   timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists trial_end            timestamptz,
  add column if not exists stripe_event_id      text,
  add column if not exists stripe_event_at      timestamptz,
  add column if not exists stripe_status_at     timestamptz;

comment on column public.brand_memberships.stripe_price_id is
  'Stripe price the subscription is currently on. Distinguishes monthly from annual.';
comment on column public.brand_memberships.current_period_end is
  'End of the paid period. Access survives until this instant even after cancellation.';
comment on column public.brand_memberships.cancel_at_period_end is
  'True when the subscription is set to stop at current_period_end. Still entitled until then.';
comment on column public.brand_memberships.trial_end is
  'End of the Stripe trial, when there is one.';
comment on column public.brand_memberships.stripe_event_id is
  'Stripe event id of the LAST event applied to this row. Diagnostics / support.';
comment on column public.brand_memberships.stripe_event_at is
  'event.created of the last applied event, of any type. Diagnostics only — NOT the ordering clock.';
comment on column public.brand_memberships.stripe_status_at is
  'event.created of the last applied customer.subscription.* event. THIS is the ordering clock: only subscription events are authoritative about plan and status, so only they may advance it.';

-- stripe_subscription_id is a lookup key for webhooks whose payload carries no user id.
create index if not exists brand_memberships_stripe_sub_idx
  on public.brand_memberships (stripe_subscription_id);
-- Supports "who is expiring soon" / dunning queries per brand.
create index if not exists brand_memberships_period_end_idx
  on public.brand_memberships (brand_slug, current_period_end);

-- Belt and braces. 20260729120000 granted SELECT only, but a future `grant all` on the
-- schema would silently hand the browser a write path to its own plan.
revoke insert, update, delete on public.brand_memberships from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The processed-event ledger. This is the idempotency key.
--
-- Recorded per event id, not per membership, because Stripe's guarantee is per event:
-- "you may receive the same event more than once". A UNIQUE insert is the only check that
-- survives two deliveries being processed at the same instant in two Lambda invocations —
-- a SELECT-then-INSERT would let both through.
--
-- Note what is NOT recorded: an event we could not attribute to any membership (see
-- 'no_membership' below). Leaving it unclaimed is deliberate, so that once the account
-- exists, "Resend" in the Stripe dashboard actually does something.
-- ---------------------------------------------------------------------------
create table if not exists public.stripe_webhook_events (
  event_id     text primary key,
  event_type   text not null,
  event_at     timestamptz,
  brand_slug   text,
  user_id      uuid,
  outcome      text not null default 'applied'
    constraint stripe_webhook_events_outcome_check
    check (outcome in ('applied', 'stale', 'superseded')),
  processed_at timestamptz not null default now()
);

comment on table public.stripe_webhook_events is
  'Append-only ledger of Stripe events already processed. The primary key is what makes webhook handling exactly-once. Only three outcomes appear here: a duplicate never gets a row (it lost the insert), and an unattributable event is deliberately not recorded so it can be resent.';

create index if not exists stripe_webhook_events_user_idx on public.stripe_webhook_events (user_id);
create index if not exists stripe_webhook_events_at_idx   on public.stripe_webhook_events (processed_at desc);

alter table public.stripe_webhook_events enable row level security;

-- No policies, on purpose. RLS with zero policies denies everything, and the service role
-- bypasses RLS entirely — so this table is reachable by the webhook and by nobody else.
-- It is billing telemetry; users have no business reading it.
revoke all on public.stripe_webhook_events from anon, authenticated;
grant all on public.stripe_webhook_events to service_role;

-- ---------------------------------------------------------------------------
-- 3. The read surface is rebuilt from here down.
--
-- Dropped first so that entitlement_is_active() can be replaced with a different
-- signature. `create or replace function` cannot change a signature — it would leave the
-- old one behind as an overload, and the view would keep silently calling it.
-- ---------------------------------------------------------------------------
drop view if exists public.entitlements;
drop function if exists public.get_entitlement(text);
drop function if exists public.entitlement_is_active(text, text, timestamptz);

-- ---------------------------------------------------------------------------
-- "Is this person entitled right now?" — one definition, used everywhere.
--
-- Kept as a function so the view, the RPC, any future SQL report and the product app all
-- answer identically. A second copy of this rule in application code is how a customer
-- ends up seeing "active" on one screen and a paywall on the next.
--
-- The judgement calls, stated plainly:
--   * the MEMBERSHIP must be active. A suspended or departed member is not entitled even
--     with a live Stripe subscription — otherwise suspending an account does nothing, which
--     is a surprising way to find out you cannot remove abusive users.
--   * past_due COUNTS as entitled. Stripe retries a failed renewal for days; locking a
--     paying customer out over a card that expired on a Sunday is worse for us than a few
--     days of unpaid access. The app should nag, not block.
--   * trialing counts. incomplete / incomplete_expired / unpaid / paused / canceled do not.
--   * a one day grace after current_period_end absorbs webhook lag and clock skew, so a
--     renewal we have not been told about yet does not read as an expiry.
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
     and coalesce(p_plan, 'free') <> 'free'
     and coalesce(p_status, '') = any (array['active', 'trialing', 'past_due'])
     and (p_period_end is null or p_period_end > now() - interval '1 day');
$$;

comment on function public.entitlement_is_active(text, text, text, timestamptz) is
  'The single definition of "currently entitled". Requires an active membership; past_due is treated as a grace period; access survives one day past current_period_end to absorb webhook lag.';

-- ---------------------------------------------------------------------------
-- 4. The write path.
--
-- Every argument except the event identity is nullable and means "this event says nothing
-- about this field". That is what lets partial events (checkout.session.completed knows the
-- customer but not the period end; invoice.payment_failed knows neither the plan nor the
-- price) be applied without destroying facts a different event already established.
--
-- invoice.payment_failed in particular is always called with p_plan => null: an invoice
-- event must never be able to GRANT a plan, only to annotate one.
--
-- TWO CLOCKS, AND WHY ONE IS NOT ENOUGH
--
-- The obvious design — one "last event" timestamp, reject anything older — quietly loses
-- data. Stripe creates the subscription BEFORE the checkout session completes, so
-- customer.subscription.created.created <= checkout.session.completed.created. Deliver
-- those two in the other order (which Stripe is entitled to do, and which the documented
-- "Resend from the dashboard" recovery guarantees) and the subscription event is older than
-- the clock and gets thrown away — along with the only copy of current_period_end,
-- stripe_price_id and trial_end that will ever be sent. The customer pays and their renewal
-- date is blank forever.
--
-- So the ordering clock (stripe_status_at) is advanced ONLY by customer.subscription.*
-- events, which are the only ones authoritative about plan and status:
--
--   * a customer.subscription.* event older than the clock is `stale` and is not applied.
--     This is what makes a late .updated unable to resurrect a plan that a .deleted ended.
--   * any other event is ADDITIVE and always applied — a customer id or a bounced payment
--     is true regardless of arrival order — except that it may not touch plan/plan_status/
--     cancel_at_period_end if it predates the clock. So an out-of-order
--     checkout.session.completed still records the Stripe customer id (which is the only
--     way the billing portal ever works) without re-activating a cancelled subscription.
--
-- Returns one of:
--   applied       state was written
--   duplicate     this event id was already processed; nothing written (Stripe retry)
--   stale         a newer subscription event has been applied; nothing written
--   superseded    a cancellation for a subscription this membership no longer holds
--   no_membership could not attribute the event to anyone; nothing written or recorded
--   unknown_brand the event named a brand we do not run; nothing written or recorded
-- ---------------------------------------------------------------------------
create or replace function public.apply_stripe_entitlement(
  p_event_id             text,
  p_event_type           text,
  p_event_at             timestamptz,
  p_brand                text,
  p_user_id              uuid        default null,
  p_customer_id          text        default null,
  p_subscription_id      text        default null,
  p_email                text        default null,
  p_plan                 text        default null,
  p_plan_status          text        default null,
  p_price_id             text        default null,
  p_current_period_end   timestamptz default null,
  p_cancel_at_period_end boolean     default null,
  p_trial_end            timestamptz default null,
  p_billing              jsonb       default '{}'::jsonb
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
begin
  -- Defence in depth. The GRANT below should already make this unreachable for anon and
  -- authenticated, but the sibling definer functions (set_consent, complete_oauth_signup)
  -- are self-defending via auth.uid() and this one has no such natural guard — it takes the
  -- user id as an argument, because a Stripe webhook has no session. If the grant is ever
  -- wrong, this is what stops the anon key being a "give me the paid plan" endpoint.
  if v_role is not null and v_role <> 'service_role' then
    raise exception 'apply_stripe_entitlement is service-role only' using errcode = '42501';
  end if;

  if p_event_id is null or p_event_at is null then
    raise exception 'event id and event timestamp are required' using errcode = '22023';
  end if;

  -- NOT an exception. Raising here would make the webhook return 500, and Stripe would
  -- retry an event that can never succeed for three days and then disable the endpoint —
  -- exactly the failure this file works to avoid elsewhere. One subscription created by
  -- hand with a stray `brand` in its metadata should not take billing down.
  if p_brand is null or not exists (select 1 from public.brands b where b.slug = p_brand) then
    return 'unknown_brand';
  end if;

  -- --- Resolve the membership -------------------------------------------------------
  -- Most trustworthy first. p_user_id comes from Stripe metadata that WE wrote at
  -- checkout, on a signed event, so it cannot be forged by a browser.
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

  -- Last resort, and heavily fenced: an anonymous checkout (someone who paid from the
  -- pricing page before signing in) can only be tied back by the address that paid.
  --
  -- IT MAY ONLY EVER BOOTSTRAP, NEVER REBIND. Without the two `is null` conditions this is
  -- a real attack, not a theoretical one: anyone could buy a subscription, type a paying
  -- customer's email into Stripe Checkout, and have that customer's row repointed at the
  -- ATTACKER's Stripe ids. The victim's "Manage billing" would then open the attacker's
  -- portal (each seeing the other's cards and invoices), and the attacker cancelling their
  -- own subscription would read as the victim's cancellation and cut off access the victim
  -- is still being billed for.
  --
  -- Restricted to checkout.session.completed as well, since that is the only event this
  -- path exists to serve. What remains is the acceptable case the design intends: someone
  -- pays for a stranger's free account, at their own expense.
  if v_m.id is null
     and p_email is not null
     and p_event_type = 'checkout.session.completed' then
    select m.* into v_m
      from public.brand_memberships m
      join public.profiles pr on pr.id = m.user_id
     where m.brand_slug = p_brand
       and lower(pr.email) = lower(p_email)
       and m.stripe_customer_id is null
       and m.stripe_subscription_id is null
     order by m.created_at
     limit 1
     for update of m;
  end if;

  if v_m.id is null then
    -- Not recorded in the ledger: nothing was decided, so a later "Resend" from the
    -- Stripe dashboard (once the account exists) must still be able to apply it.
    return 'no_membership';
  end if;

  -- --- Exactly once -----------------------------------------------------------------
  insert into public.stripe_webhook_events (event_id, event_type, event_at, brand_slug, user_id, outcome)
  values (p_event_id, p_event_type, p_event_at, p_brand, v_m.user_id, 'applied')
  on conflict (event_id) do nothing;

  if not found then
    return 'duplicate';
  end if;

  -- --- Ordering ---------------------------------------------------------------------
  -- event.created is stamped by Stripe when the state change happened, not when we heard
  -- about it, so it is the only clock that means anything here. See "TWO CLOCKS" above for
  -- why only customer.subscription.* events advance it.
  if v_is_sub_event then
    if v_m.stripe_status_at is not null and p_event_at < v_m.stripe_status_at then
      update public.stripe_webhook_events set outcome = 'stale' where event_id = p_event_id;
      return 'stale';
    end if;

    -- Same-second tie-break. Two events can share an event.created to the second; never let
    -- an equally-stamped non-cancellation resurrect a subscription a cancellation ended.
    if v_m.stripe_status_at is not null
       and p_event_at = v_m.stripe_status_at
       and v_m.plan_status = 'canceled'
       and coalesce(p_plan_status, v_m.plan_status) is distinct from 'canceled' then
      update public.stripe_webhook_events set outcome = 'stale' where event_id = p_event_id;
      return 'stale';
    end if;

    -- A cancellation for a subscription this membership no longer holds. Happens when
    -- someone cancels and resubscribes: the new subscription is live, and the old one's
    -- deleted event must not take the new one down with it.
    if p_event_type = 'customer.subscription.deleted'
       and p_subscription_id is not null
       and v_m.stripe_subscription_id is not null
       and p_subscription_id <> v_m.stripe_subscription_id then
      update public.stripe_webhook_events set outcome = 'superseded' where event_id = p_event_id;
      return 'superseded';
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

comment on function public.apply_stripe_entitlement(text, text, timestamptz, text, uuid, text, text, text, text, text, text, timestamptz, boolean, timestamptz, jsonb) is
  'The only write path for Stripe entitlement state. Exactly-once via the stripe_webhook_events primary key, monotonic on event.created (clock scoped to customer.subscription.* events) so out-of-order deliveries cannot rewind state or discard the billing period, and partial (null argument = leave the column alone). service_role only, enforced by grant AND by a runtime role check.';

-- Callable by the webhook and by nothing else.
--
-- `from public` alone is NOT enough. Supabase's default privileges grant EXECUTE on new
-- functions in this schema to anon, authenticated and service_role as separate ACL entries,
-- and REVOKE ... FROM PUBLIC removes only the PUBLIC entry — leaving a SECURITY DEFINER
-- "set my plan to maker" function callable with the public anon key. The roles are named.
revoke all on function public.apply_stripe_entitlement(text, text, timestamptz, text, uuid, text, text, text, text, text, text, timestamptz, boolean, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.apply_stripe_entitlement(text, text, timestamptz, text, uuid, text, text, text, text, text, text, timestamptz, boolean, timestamptz, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 5. The read surface for app.batchlabel.xyz.
--
-- THE TRAP, stated up front: a Postgres view runs with the privileges of its OWNER by
-- default. The owner here is the migration role, which BYPASSES row level security. A
-- plain `create view entitlements as select ... from brand_memberships` therefore hands
-- every signed-in user every other user's billing state — the underlying table's RLS is
-- simply not consulted. It looks fine in testing, because you only ever test with one
-- account.
--
-- `with (security_invoker = true)` (PostgreSQL 15+) flips that: the view executes as the
-- CALLER, so "own memberships are readable" from 20260729120000 applies and each user sees
-- exactly one row — their own. That single clause is the whole security of this view.
--
-- security_barrier as well, so the planner cannot push a user-supplied function into the
-- view and use it to probe rows the caller cannot see.
-- ---------------------------------------------------------------------------
do $$
begin
  if current_setting('server_version_num')::int < 150000 then
    raise exception
      'public.entitlements requires PostgreSQL 15+ for security_invoker views. On an older server this view would expose every user''s billing state. Upgrade, or read entitlements through public.get_entitlement() instead.';
  end if;
end
$$;

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
  m.updated_at
from public.brand_memberships m;

comment on view public.entitlements is
  'Read-only entitlement state for the signed-in user. security_invoker = true, so brand_memberships RLS applies and a caller sees only their own row. Never grant to anon.';

revoke all on public.entitlements from anon, authenticated;
grant select on public.entitlements to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Same answer as an RPC, for callers who would rather not depend on view semantics.
--
-- SECURITY INVOKER (the default, written out because it matters): RLS on
-- brand_memberships applies, AND the auth.uid() predicate is stated explicitly. Two
-- independent reasons a caller cannot see somebody else's row, so neither one being
-- dropped by accident is enough to leak.
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
  updated_at           timestamptz
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
    m.updated_at
  from public.brand_memberships m
  where m.user_id = auth.uid()
    and (p_brand is null or m.brand_slug = p_brand);
$$;

comment on function public.get_entitlement(text) is
  'Entitlement state for the calling user, optionally filtered to one brand. SECURITY INVOKER plus an explicit auth.uid() predicate.';

revoke all on function public.get_entitlement(text) from public, anon;
grant execute on function public.get_entitlement(text) to authenticated;
