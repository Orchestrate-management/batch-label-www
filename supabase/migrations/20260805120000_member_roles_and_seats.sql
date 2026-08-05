-- Roles that mean something, seats that are counted, and invites that carry a token.
--
-- =============================================================================
-- WHAT WAS ACTUALLY TRUE BEFORE THIS FILE, MEASURED RATHER THAN ASSUMED
-- =============================================================================
--
-- public.account_members.role has existed since 20260803120000 with a CHECK pinning it to
-- ('owner','admin','editor','viewer'), and public.brand_memberships.editor_seat_limit has
-- existed since 20260802120000 with a NOT NULL and a floor of 1. Both were declared for a
-- day that had not arrived. Neither was read by anything:
--
--   * `select prosrc from pg_proc where proname = 'is_member_of'` contains no occurrence of
--     the word `role`. is_member_of(account_id) was the sole row-level predicate on 55 of
--     the 62 policies in this database, so a member with role 'viewer' and a member with
--     role 'editor' had BYTE-IDENTICAL database rights. Proved against a live chain with
--     two identities: a viewer could UPDATE another member's specification, INSERT and
--     DELETE their products, rewrite batchlabel.business_identity.registered_name (which is
--     what prints on every label the account produces), append to the append-only
--     compliance log, and file an account erasure request.
--   * `select tgrelid::regclass, tgname from pg_trigger where not tgisinternal and
--     tgrelid = 'public.account_members'::regclass` returned exactly one row, and it was
--     set_updated_at. A membership with editor_seat_limit = 1 held 40 active editors
--     without a single refusal.
--
-- So the matrix was documentation and the seat count was a number in a column. This file
-- makes both load-bearing.
--
-- =============================================================================
-- A CORRECTION TO THE STANDING BRIEF, BECAUSE IT WOULD OTHERWISE BE COPIED
-- =============================================================================
--
-- editor_seat_limit does NOT arrive from Stripe metadata. It is resolved server-side from
-- the PLAN SLUG by src/server/plan-contract.ts (allowanceForPlan), and the plan slug is
-- resolved from the Stripe PRICE ID, with subscription metadata used only as a fallback
-- claim when the price is not in the index. scripts/stripe-catalogue.ts refuses to write
-- allowance numbers onto Stripe objects at all, on the ground that a seat count stored on a
-- Stripe object is an unaudited grant path. Nothing below hardcodes a tier's seat count and
-- nothing below may learn one: the ceiling is read from the membership row, and WHICH ROLES
-- CONSUME A SEAT is a boolean column on a lookup table, not a list in a function body.
--
-- =============================================================================
-- THE ONE DEFECT CLASS THIS FILE IS WRITTEN AGAINST
-- =============================================================================
--
-- PostgreSQL fires BEFORE ROW triggers BEFORE it evaluates the RLS WITH CHECK expression.
-- This schema shipped that bug once already, and public.enforce_sku_limit still carries the
-- hand-written `if not public.is_member_of(new.account_id) then return new; end if;` guard
-- (20260803120000:450, restated 20260804120000:450) that exists solely to defuse it: without
-- that line the SKU meter answered a stranger with the victim's live product count and plan
-- allowance.
--
-- A seat counter is the same shape — it reads OTHER ROWS, keyed by an account id the caller
-- supplied — so writing it as a BEFORE ROW trigger would be the same bug in a new hat. The
-- alternatives were measured rather than reasoned about, on a scratch table carrying the
-- exact policy shape of a domain table:
--
--   BEFORE ROW trigger, attacker naming a victim's account_id
--     -> P0001 "BEFORE FIRED and saw account_id=aaaaaaaa-...-000000000001"
--   DEFERRED CONSTRAINT trigger, identical position, identical insert
--     -> 42501 "new row violates row-level security policy", and the body NEVER RAN
--   the same constraint trigger, legitimate member
--     -> the body ran, so it still enforces
--   UPDATE of a row RLS filters to zero rows
--     -> ok, 0 rows, the trigger never fired
--
-- A constraint trigger is STRUCTURALLY UNREACHABLE for a row RLS refuses. public.
-- enforce_editor_seats below therefore carries NO is_member_of re-guard, and it must not
-- grow one: adding it would be cargo-culting a defence against an ordering that no longer
-- applies, and would make the next reader think the guard is what makes it safe.
--
-- Section 11 re-proves that ordering AT APPLY TIME, on the server being applied to, rather
-- than trusting a green PGlite run. supabase/tests/harness.ts runs PostgreSQL 18 while
-- supabase/config.toml declares 17, and trigger-versus-RLS ordering is exactly the class of
-- behaviour that can move between majors.
--
-- =============================================================================
-- WHAT IS NOT CLOSED, STATED HERE RATHER THAN DISCOVERED
-- =============================================================================
--
-- 1. THE RACE IS ARGUED, NOT MEASURED. Every mutation path below locks the account row
--    (`select 1 from public.accounts where id = ... for update`) before counting, which is
--    the pattern enforce_sku_limit already ships at 20260803120000:455 and is the same lock
--    object, so all account-level invariants serialise on one row and cannot deadlock by
--    taking locks in a different order. Under READ COMMITTED the count after the lock takes
--    a fresh snapshot and sees the other transaction's committed row. PGlite is
--    single-connection, so NO TEST IN THIS REPOSITORY EXECUTES TWO RACING TRANSACTIONS.
--    This claim is structural. Two psql sessions against `supabase db start` are what would
--    make it measured, and until somebody runs them it is reasoning and not evidence.
--
--    THE ONE THING THAT ARGUMENT DEPENDS ON IS NOW CHECKED RATHER THAN ASSUMED. The
--    lock-then-count pattern is only sound because the count after the lock takes a FRESH
--    snapshot, which is a READ COMMITTED property. Under REPEATABLE READ the count would use
--    the transaction's original snapshot, and `select ... for update` on a row nobody UPDATES
--    raises no serialization failure, so two transactions could both count under the ceiling
--    and both commit. That is not reachable through PostgREST, which uses the server default,
--    but it is one `begin isolation level repeatable read` away in any future server-side
--    path. Section 11 therefore asserts the server default is read committed at apply time,
--    so the assumption fails loudly on a database where it is untrue instead of silently
--    disabling every seat check. It does not make the race measured, and nothing here claims
--    it does.
--
-- 2. TWO ADMINS CAN DEMOTE EACH OTHER SIMULTANEOUSLY. The peer comparison in section 5 is
--    `<=` rather than `<`, so an admin may act on another admin. Two of them acting at once
--    touch different rows and both USING clauses pass at snapshot time. It is bounded: the
--    owner cannot be demoted by an admin and can restore anyone. Making it `<` would close
--    this and would also mean two admins can never remove a rogue peer without the owner.
--    It is one operator in one policy if the call goes the other way.
--
-- 3. THE POLICY PREDICATE GOT MORE EXPENSIVE. public.can() calls public.account_rank(),
--    which now joins account_roles as well as accounts and brand_memberships, and then
--    looks up account_capabilities. Postgres does not memoise a STABLE function across
--    rows, so this is a real per-row cost on a large read. It was NOT measured. Measure it
--    on a full materials list before assuming it is free; the fix if it bites is an
--    index-only path or a per-statement cache, never a weaker predicate.
--
-- 4. OWNERSHIP CANNOT BE HANDED OVER AT ALL, AND SECTION 8 EXPLAINS WHY THAT IS THE HONEST
--    ANSWER RATHER THAN A GAP. An earlier draft of this file shipped a
--    transfer_account_ownership RPC. It was attacked and it had no correct outcome; the whole
--    argument, with the measured codes, is written at the head of section 8. Handing a
--    business over is therefore not built, it says so on the team screen and in
--    src/content/availability.ts, and support does it by hand with a Stripe change beside it.
--
-- 5. TWO ADDRESSES FOR ONE PERSON RESERVE TWO SEATS. account_seats_in_use now discounts a
--    pending invite whose address already belongs to an active seat-holding member, so
--    re-inviting somebody who is already an editor does not double-book their seat. It cannot
--    discount `ada@x.test` against `ada+work@x.test`: those are two addresses, and until one
--    of them is redeemed the database has no way to know they are one human. Two live invites
--    reserve two seats, which is correct arithmetic for what the account actually asked for,
--    and both are withdrawable.
--
-- =============================================================================
-- THE DOCTRINE THAT IS PRESERVED VERBATIM AND MUST STAY PRESERVED
-- =============================================================================
--
-- public.is_member_of consults STATUS ONLY. plan, plan_status and period end are
-- deliberately not read, so a free, lapsed, past_due or downgraded customer keeps full read
-- and write access to what they already have (PRICING_RESEARCH.md §6.1). This file changes
-- that function's BODY (it now asks account_rank whether a rank resolves) and changes
-- nothing about what it consults. Section 11 asserts, on the source of every predicate
-- helper below, that none of them mentions editor_seat_limit, plan, plan_status,
-- current_period_end or sku_limit, and that no policy anywhere does either.
--
-- The seat ceiling therefore lives on the SEAT CONSUMPTION path and nowhere else. Enforcing
-- it in a row-level predicate would import plan state into every read and write, which is
-- the doctrine above, inverted.
--
-- =============================================================================
-- THE DOWNGRADE RULE, AND THE SINGLE DECISION THAT IMPLEMENTS IT
-- =============================================================================
--
-- docs/PRICING_RESEARCH.md §6.4: over the seat limit, block new invites; do not deactivate
-- anyone; never sign anyone out for a seat-count reason. editor_seat_limit follows the plan
-- DOWN inside the same UPDATE that writes plan (20260802120000:504), so an account whose
-- headcount exceeds its ceiling arrives within one webhook and is a NORMAL STEADY STATE,
-- never an error.
--
-- enforce_editor_seats therefore meters a TRANSITION INTO CONSUMING, never a headcount. It
-- computes whether the row consumed a seat BEFORE and whether it consumes one AFTER, and
-- returns without counting unless the answer went from no to yes. That one decision is the
-- whole of the downgrade rule: demotion, suspension and removal are always allowed on an
-- over-limit account because they are not transitions into consuming, while every path that
-- would add consumption is refused. Verified at editor_seat_limit = 1 with 3 seats in use.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. THE PERMISSION MATRIX, AS DATA.
--
-- The brief asks for ONE authoritative definition so that changing a cell later is a single
-- edit. Two tables are that definition. Everything else in this file — six helper
-- functions, 37 rebuilt policies, two constraint triggers, three RPCs — reads them and
-- states no role name and no rank of its own.
--
-- WHY A TABLE AND NOT A FUNCTION. The obvious alternative is a role_rank() CASE expression
-- plus a list of (capability, minimum role) inside the loop that writes the policies. That
-- is TWO places, and the second one is invisible: it lives inside a `do $$` block and can
-- only be read by reading the migration. With tables, the entire permission system is
-- legible as one query on a running database:
--
--   select r.role, r.rank, r.consumes_seat,
--          (select string_agg(c.capability, ', ' order by c.min_rank)
--             from public.account_capabilities c where c.min_rank <= r.rank)
--     from public.account_roles r order by r.rank;
--
--     viewer 10 f  read
--     editor 20 t  read, write_data
--     admin  30 t  read, write_data, manage_identity, manage_members
--     owner  40 t  read, write_data, manage_identity, manage_members, manage_billing,
--                  manage_account
--
-- RANK IS AN INTEGER LADDER AND NOT A JOIN TABLE OF (role, capability) PAIRS, because every
-- cell in the ratified matrix is monotone: there is no capability an editor holds that an
-- admin does not. A pair table would be able to express a non-monotone matrix, which sounds
-- like flexibility and is actually the ability to write a permission set nobody can reason
-- about. Ranks are spaced by ten so a role can be inserted between two existing ones without
-- renumbering anything.
--
-- consumes_seat IS THE COLUMN THAT KEEPS EVERY ROLE LIST OUT OF THE SEAT CODE. Section 7
-- joins it rather than naming roles, so "who costs money" is one UPDATE here and appears
-- nowhere else. Read-only seats are free and unlimited on every plan, which is why there is
-- no read_only_seat_limit column anywhere and why viewer is the only false.
--
-- min_rank REFERENCES account_roles (rank), so a capability cannot be filed at a rank no
-- role holds. Getting that wrong silently is how a capability becomes unreachable for
-- everybody including the owner; with the foreign key it is a 23503 at the moment somebody
-- tries.
-- ---------------------------------------------------------------------------
create table if not exists public.account_roles (
  role          text primary key,
  rank          integer not null unique,
  consumes_seat boolean not null,
  label         text not null,
  description   text not null
);

comment on table public.account_roles is
  'THE role vocabulary for account membership, and the only one. Rank is an ordering, not an id: a higher rank holds every capability a lower rank holds (see public.account_capabilities). consumes_seat is the single definition of which roles are billed, joined by the seat trigger so that no role list appears in any function body. Unrelated to public.brand_memberships.role, which is a separate Orchestrate identity system nothing reads — see section 2.';
comment on column public.account_roles.rank is
  'Spaced by ten so a role can be inserted between two existing ones without renumbering. Compared with <= everywhere; never used as an identifier.';
comment on column public.account_roles.consumes_seat is
  'Whether holding this role consumes one of the account''s editor seats. Read-only seats are free and unlimited on every tier (20260802120000:74-75), which is why viewer is the only false and why there is no read_only_seat_limit column to be enforced by accident.';

create table if not exists public.account_capabilities (
  capability  text primary key,
  min_rank    integer not null references public.account_roles (rank),
  description text not null
);

comment on table public.account_capabilities is
  'What a rank is allowed to do. One row per capability; a caller holds it when their rank is at least min_rank. Moving a capability between roles is an UPDATE of one row here and nothing else in the system changes — the policies name the capability, never the role. min_rank is a foreign key to account_roles (rank) so a capability cannot be filed at a rank no role holds.';

-- The seed. `on conflict do update` rather than `do nothing`, so that a correction to a
-- label or a rank in a future edit of this file actually lands on a re-run instead of
-- silently doing nothing — which is the failure mode of a `do nothing` seed.
insert into public.account_roles (role, rank, consumes_seat, label, description) values
  ('viewer', 10, false, 'Read only',
   'Reads everything in the account and writes nothing. Free and unlimited on every plan, because the competent person who reviews a safety data sheet is frequently an external consultant who creates nothing, and a read-only reviewer who costs a full seat is a reviewer who ends up sharing the owner''s login.'),
  ('editor', 20, true,  'Editor',
   'Creates and edits product data: materials, specifications, products, the record log. Cannot manage members, cannot change the printed business identity, cannot touch billing.'),
  ('admin',  30, true,  'Admin',
   'Everything an editor can do, plus managing members and the printed business identity. Not billing, and not account-level acts such as erasure.'),
  ('owner',  40, true,  'Owner',
   'Everything, including billing and transferring ownership. Exactly one per account, and it is the same person as accounts.owner_user_id — the key the plan and the seat ceiling both resolve through.')
on conflict (role) do update
  set rank          = excluded.rank,
      consumes_seat = excluded.consumes_seat,
      label         = excluded.label,
      description   = excluded.description;

insert into public.account_capabilities (capability, min_rank, description) values
  ('read',            10, 'See everything in the account.'),
  ('write_data',      20, 'Create and change product data: materials and their parts, specifications, products, artefacts, and the append-only record log.'),
  ('manage_identity', 30, 'Change what prints on the label: the registered business identity and the supplier address blocks, and the account-wide workspace preferences.'),
  ('manage_members',  30, 'Invite, re-role, suspend and remove members, and see the pending invites.'),
  ('manage_billing',  40, 'Start, change and cancel the subscription. Enforced at the www billing endpoints, which take the actor from a verified token; no table in this database is gated on it.'),
  ('manage_account',  40, 'Account-level acts that are not product data: filing an erasure or export request. Ownership is not one of them; it does not move, see section 8.')
on conflict (capability) do update
  set min_rank    = excluded.min_rank,
      description = excluded.description;

-- THREE OF THOSE PLACEMENTS ARE THE ONES THAT ACTUALLY CHANGE WHAT A MEMBER CAN DO, and
-- each is a decision rather than a default:
--
--   business_identity and supplier_addresses -> manage_identity (admin). The obvious
--   placement is write_data, on the ground that they are just more tables a maker edits.
--   That would have left the measured defect exactly where it was: registered_name is
--   printed on every label the account produces and supplier_addresses feeds
--   batchlabel.identity_fingerprint, so an editor at write_data can rewrite the legally
--   responsible business named on somebody else's product.
--
--   workspace_preferences -> manage_identity (admin). It has no user_id column. It is not a
--   personal setting, it is account-wide configuration, so an editor changing it changes
--   what everyone in the account sees. If it ever grows a per-user shape, it moves to
--   write_data and that is one UPDATE above.
--
--   account_data_requests -> manage_account (owner). Filing an erasure request against the
--   account is not an edit. The measured defect included a viewer successfully inserting
--   one.

alter table public.account_roles        enable row level security;
alter table public.account_capabilities enable row level security;

-- Readable by every signed-in user, writable by nobody: the same shape as the shipped
-- reference catalogue in 20260804130000 section 10, and for the same reason. The matrix is
-- not a secret — the app renders it as which buttons are disabled — and a table with no
-- INSERT/UPDATE/DELETE grant and no policy for those verbs needs no isolation between
-- writers because there are none.
drop policy if exists "the role ladder is readable by every signed-in user" on public.account_roles;
create policy "the role ladder is readable by every signed-in user"
  on public.account_roles for select using (true);

drop policy if exists "the capability matrix is readable by every signed-in user" on public.account_capabilities;
create policy "the capability matrix is readable by every signed-in user"
  on public.account_capabilities for select using (true);

revoke all    on public.account_roles        from anon, authenticated;
revoke all    on public.account_capabilities from anon, authenticated;
grant  select on public.account_roles        to authenticated;
grant  select on public.account_capabilities to authenticated;
grant  all    on public.account_roles        to service_role;
grant  all    on public.account_capabilities to service_role;


-- ---------------------------------------------------------------------------
-- 2. account_members.role becomes a foreign key, and its default fails safe.
--
-- THE CHECK IS REPLACED BY A REFERENCE, so the table above is the definition rather than
-- one of two copies of it. A CHECK listing four strings is a second vocabulary that drifts
-- the moment a fifth role is seeded; a foreign key cannot drift, and it refuses an unknown
-- role with 23503 at exactly the same moment the CHECK would have refused it with 23514.
--
-- THE DEFAULT CHANGES FROM 'editor' TO 'viewer', and this is the fail-safe that matters
-- most. 'editor' consumes a seat. Today the only writer is public.ensure_account, which
-- passes 'owner' explicitly (20260803120000:1315-1317), so the default is never taken — but
-- the whole point of this file is that insert paths are about to exist, and an invite path
-- that forgets the column would silently grant a PAID seat. With 'viewer' the same mistake
-- grants the free, unlimited, writes-nothing role. Nothing in the system reads the default;
-- section 11 asserts provisioning still produces exactly one active owner under it.
--
-- ONE NEIGHBOUR THAT IS NOT PART OF THIS MATRIX AND MUST NOT BE FOLDED INTO IT.
-- public.brand_memberships.role is a DIFFERENT SYSTEM. It has no CHECK constraint, no
-- column comment, and a member|admin|owner vocabulary that exists only as a trailing SQL
-- comment at 20260729120000:85. `select prosrc from pg_proc` shows nothing anywhere reads
-- it. Anyone building a permission matrix will find two role columns and the unconstrained
-- one is the wrong one, which is why it is named here. It is left exactly as it is: giving
-- it a CHECK in this file would imply the two vocabularies are related, and they are not.
-- ---------------------------------------------------------------------------
alter table public.account_members drop constraint if exists account_members_role_check;
alter table public.account_members drop constraint if exists account_members_role_fkey;
alter table public.account_members
  add  constraint account_members_role_fkey
  foreign key (role) references public.account_roles (role);

alter table public.account_members alter column role set default 'viewer';

comment on column public.account_members.role is
  'What this member may do, resolved through public.account_roles.rank and public.account_capabilities. Defaults to viewer — the free, unlimited, writes-nothing role — so that an insert path which forgets the column fails safe rather than granting a billed seat. NOT related to public.brand_memberships.role, which is a separate Orchestrate identity system nothing reads.';
comment on table public.account_members is
  'Who may act inside an account, and at what rank. Removal is status = ''removed'', never a DELETE: a compliance product cannot discard the record of who was in the account and when, or "was this batch signed off by somebody authorised at the time" becomes unanswerable. The browser holds SELECT plus UPDATE on (role, status) only; account_id and user_id are unreachable to it by column privilege, which is checked before RLS is consulted.';


-- ---------------------------------------------------------------------------
-- 3. THE HELPERS. Identity is auth.uid() and is never an argument.
--
-- is_member_of was written SECURITY DEFINER with no user argument on purpose
-- (20260803120000:491): it cannot be used to probe anybody else's membership because there
-- is nowhere to put the somebody else. Every function here keeps that property. The obvious
-- shape for a role-aware sibling is has_role(p_account_id uuid, p_user_id uuid, p_role
-- text), and it would re-arm exactly the probe the current design closed. Section 11
-- asserts that no predicate helper takes more than one uuid.
--
-- WHY can() RATHER THAN A POLICY THAT COMPARES RANKS DIRECTLY. A policy reading
-- `public.account_rank(account_id) >= 20` would put the number 20 in 37 places. The
-- capability name is the indirection that makes the matrix one edit: policies name what
-- they need, the table says what rank that needs, and moving a cell touches neither.
--
-- AN UNKNOWN CAPABILITY RETURNS FALSE, so a typo in a policy fails closed rather than open.
-- That is not sufficient on its own — a policy gated on 'wrtie_data' would refuse everybody
-- silently — so section 11 also extracts every capability literal out of pg_policies and
-- fails the migration if one is not in the table.
-- ---------------------------------------------------------------------------
create or replace function public.account_role_rank(p_role text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select r.rank from public.account_roles r where r.role = p_role;
$$;

comment on function public.account_role_rank(text) is
  'The rank of a role name, straight off public.account_roles. Table lookup rather than a CASE expression, so there is one definition of the ladder. Returns NULL for an unknown role, which makes every comparison using it false.';

revoke all     on function public.account_role_rank(text) from public, anon;
grant  execute on function public.account_role_rank(text) to authenticated, service_role;

-- The join is the same one is_member_of has always made, plus account_roles for the rank.
-- The LEFT JOIN and coalesce on brand_memberships are carried over unchanged and mean the
-- same thing they meant there: absent is unknown, and unknown must not lock a customer out
-- of their own data. Only an explicit 'suspended' or 'left' does.
--
-- NOTE WHAT IS NOT IN THIS BODY: plan, plan_status, current_period_end, sku_limit,
-- editor_seat_limit. A lapsed customer keeps every right they had. Section 11 asserts it on
-- the source text rather than trusting this comment.
create or replace function public.account_rank(p_account_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select r.rank
    from public.account_members am
    join public.account_roles   r on r.role = am.role
    join public.accounts        a on a.id  = am.account_id
    left join public.brand_memberships bm
      on bm.user_id    = a.owner_user_id
     and bm.brand_slug = a.brand_slug
   where am.account_id = p_account_id
     and am.user_id    = auth.uid()
     and am.status     = 'active'
     and coalesce(bm.status, 'active') = 'active';
$$;

comment on function public.account_rank(uuid) is
  'The CALLER''s rank inside this account, or NULL when they are not an active member of it or the account itself is not in good standing on its brand. Consults status ONLY — plan, plan_status and period end are deliberately not read, so a free, lapsed, past_due or downgraded customer keeps every right they had. SECURITY DEFINER so a policy on account_members or accounts does not recurse into itself; identity is auth.uid() and is never an argument, so it cannot be used to probe anybody else''s membership.';

revoke all     on function public.account_rank(uuid) from public, anon;
grant  execute on function public.account_rank(uuid) to authenticated, service_role;

create or replace function public.can(p_account_id uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.account_rank(p_account_id) >= (
      select c.min_rank from public.account_capabilities c where c.capability = p_capability
    ),
    false
  );
$$;

comment on function public.can(uuid, text) is
  'Whether the CALLER holds this capability in this account. The predicate every write policy is built from. Returns false for a non-member, for a suspended member, and for a capability name that does not exist — a typo in a policy therefore fails closed. Identity is auth.uid() and is never an argument.';

revoke all     on function public.can(uuid, text) from public, anon;
grant  execute on function public.can(uuid, text) to authenticated, service_role;

-- --- is_member_of, restated onto the same join -------------------------------
--
-- SAME SIGNATURE, SAME ACL, SAME MEANING, SAME COMMENT. `create or replace` so the 18
-- SELECT policies that call it, and public.enforce_sku_limit which calls it too, keep
-- pointing at it with no edit and no re-grant.
--
-- The body becomes one line. That is the point: there is now ONE membership join in this
-- database instead of two that can drift, and "is this person a member" is definitionally
-- "does a rank resolve for them". A viewer still gets true — rank 10 is not null — so no
-- SELECT policy changes meaning and no read regresses. Section 11 asserts that.
--
-- The doctrine sentences in the comment are preserved verbatim from 20260803120000. One
-- sentence is added, saying where the rank comes from. Nothing is softened.
create or replace function public.is_member_of(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.account_rank(p_account_id) is not null;
$$;

comment on function public.is_member_of(uuid) is
  'True when the CALLER is an active member of this account AND the account itself is in good standing on its brand (brand_memberships.status = active — the person and the business are two separate gates and both are checked). Consults status ONLY: plan, plan_status and period end are deliberately not read, so a free, lapsed, past_due or downgraded customer keeps full read and write access to what they already have (§6.1). A missing membership row reads as active, the same coalesce entitlement_is_active uses. SECURITY DEFINER so that a policy on account_members or accounts does not recurse into itself; identity is auth.uid() and is never an argument, so it cannot be used to probe anybody else''s membership. Since 20260805120000 the membership join lives in public.account_rank and this asks it whether a rank resolves, so there is one join rather than two that can drift; it is true for every role including viewer, and WHICH role you hold is answered by public.can.';

revoke all     on function public.is_member_of(uuid) from public, anon;
grant  execute on function public.is_member_of(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 4. THE POLICY SWAP. 37 write policies, rebuilt from ONE authoring site.
--
-- THIS IS THE HIGHEST-RISK EDIT IN THE FILE. Before it, `select count(*) from pg_policies
-- where qual like '%is_member_of%' or with_check like '%is_member_of%'` returned 55: 18
-- SELECT and 37 write. Get one table wrong and it silently keeps the old predicate, a
-- viewer keeps write access there, and nothing anywhere reports it.
--
-- What makes that survivable is that the 37 were authored in THREE different places —
-- hand-written statements at 20260803120000:994-1042, carried into the batchlabel schema by
-- `alter table ... set schema` at 20260804120000:296 and :301, and emitted by a do-$$ loop
-- at 20260804130000:1733-1800 — and this loop does not care which. It asks pg_policies for
-- the write policies that EXIST on each named table and re-creates each one under its own
-- name with the capability predicate. There is no list of policy names here to fall out of
-- date, only a list of tables and the capability each one needs.
--
-- THE 18 SELECT POLICIES ARE NOT TOUCHED, and that is the actual shape of the matrix. A
-- viewer is SUPPOSED to read everything; a single role-aware predicate across all 55 would
-- have to either lock viewers out of reads or grant them writes. Splitting on the verb is
-- what lets one predicate mean "may look" and another mean "may change".
--
-- UPDATE keeps both slots for the reason 20260803120000:1015 already gives: USING decides
-- which rows may be updated, WITH CHECK decides what they may become. Without the second, a
-- member could move a row into an account they do not belong to.
--
-- A TRAP THAT COSTS AN AUDIT: pg_policies renders the call UNQUALIFIED, as
-- `can(account_id, 'write_data'::text)`, because public is in search_path. A test grepping
-- for 'public.can(' matches nothing, passes, and proves nothing. Every assertion in section
-- 11 matches on `can(account_id`.
-- ---------------------------------------------------------------------------
do $$
declare
  r          record;
  v_specs    text[];
  v_spec     text;
  v_name     text;
  v_cmd      text;
  v_pred     text;
  v_created  integer := 0;
  v_left     integer;
begin
  for r in
    select * from (values
      -- write_data (12): the product data a maker owns outright.
      ('materials',                   'write_data'),
      ('material_hazards',            'write_data'),
      ('material_allergens',          'write_data'),
      ('material_ifra_limits',        'write_data'),
      ('material_documents',          'write_data'),
      ('specification_material_pins', 'write_data'),
      ('artefacts',                   'write_data'),
      ('record_events',               'write_data'),
      ('record_event_lots',           'write_data'),
      ('record_event_artefacts',      'write_data'),
      ('specifications',              'write_data'),
      ('products',                    'write_data'),
      -- manage_identity (3): what prints on the label, and account-wide configuration.
      ('business_identity',           'manage_identity'),
      ('supplier_addresses',          'manage_identity'),
      ('workspace_preferences',       'manage_identity'),
      -- manage_account (1): filing an erasure or export request is not an edit.
      ('account_data_requests',       'manage_account')
    ) as t(name, capability)
  loop
    if to_regclass('batchlabel.' || quote_ident(r.name)) is null then
      raise exception
        'member_roles_and_seats: batchlabel.% does not exist, so its write policies cannot be rebuilt. A table missing from this loop is a table whose viewer can still write to it.', r.name
        using errcode = '22023';
    end if;

    -- Materialised BEFORE the drops. Iterating a cursor over pg_policies while dropping the
    -- policies it is reporting is a way to skip one, and skipping one is the entire failure
    -- mode this loop exists to prevent.
    v_specs := array(
      select p.policyname || E'\t' || p.cmd
        from pg_policies p
       where p.schemaname = 'batchlabel'
         and p.tablename  = r.name
         and p.cmd <> 'SELECT'
       order by p.policyname
    );

    if cardinality(v_specs) = 0 then
      raise exception
        'member_roles_and_seats: batchlabel.% carries no write policy to rebuild. Either the table lost its policies or this loop is naming a table that never had any; both mean the capability it should be gated on is not being applied.', r.name
        using errcode = '22023';
    end if;

    v_pred := format('public.can(account_id, %L)', r.capability);

    foreach v_spec in array v_specs loop
      v_name := split_part(v_spec, E'\t', 1);
      v_cmd  := split_part(v_spec, E'\t', 2);

      execute format('drop policy if exists %I on batchlabel.%I', v_name, r.name);

      if v_cmd = 'INSERT' then
        execute format('create policy %I on batchlabel.%I for insert with check (%s)',
                       v_name, r.name, v_pred);
      elsif v_cmd = 'UPDATE' then
        execute format('create policy %I on batchlabel.%I for update using (%s) with check (%s)',
                       v_name, r.name, v_pred, v_pred);
      elsif v_cmd = 'DELETE' then
        execute format('create policy %I on batchlabel.%I for delete using (%s)',
                       v_name, r.name, v_pred);
      else
        raise exception
          'member_roles_and_seats: policy %.% has cmd %, which this loop cannot rebuild. An ALL policy would collapse the read and write predicates back into one, which is the thing the verb split exists to prevent.', r.name, v_name, v_cmd
          using errcode = '22023';
      end if;

      v_created := v_created + 1;
    end loop;
  end loop;

  -- Nothing may be left behind on the old predicate. This is the assertion the whole loop
  -- exists to make true, and it is made here rather than in section 11 so that a table
  -- added to the schema later but forgotten in the list above aborts at the point of the
  -- mistake.
  select count(*) into v_left
    from pg_policies p
   where p.schemaname in ('public', 'batchlabel')
     and p.cmd <> 'SELECT'
     and (coalesce(p.qual, '') like '%is_member_of%' or coalesce(p.with_check, '') like '%is_member_of%');

  if v_left <> 0 then
    raise exception
      'member_roles_and_seats: % write polic(ies) still gate on is_member_of, which grants a viewer the same writes as an editor. Every account-scoped table with a write verb must appear in the list above.', v_left
      using errcode = '22023';
  end if;

  if v_created < 37 then
    raise exception
      'member_roles_and_seats: rebuilt only % write policies; 37 is what the census counted before this file (16 tables: 7 full, artefacts, 2 no-delete, 4 append, products, specifications). Fewer means a table lost policies somewhere upstream and this file has just written the shortfall into the schema.', v_created
      using errcode = '22023';
  end if;

  raise notice 'member_roles_and_seats: % write policies rebuilt onto public.can()', v_created;
end
$$;


-- ---------------------------------------------------------------------------
-- 5. THE MEMBERSHIP TABLE ITSELF: who may re-role whom, and the owner floor.
--
-- Until now `authenticated` held SELECT on account_members and nothing else, so member
-- management had to be an RPC. Granting COLUMN-LEVEL UPDATE instead is strictly stronger,
-- and the reason is a measured ordering fact: A COLUMN PRIVILEGE IS CHECKED BEFORE RLS IS
-- CONSULTED. Proved — updating a granted column succeeds while updating an ungranted one on
-- the same rows dies 42501. So account_id, user_id, invited_by and created_at are not
-- protected by a policy that could be got wrong; they are unreachable to the browser by
-- construction. No policy has to think about them.
--
-- WHAT THE POLICY THEN HAS TO SAY IS ONLY THE RANK RULE, and it says it twice on purpose:
--
--   USING      reads the row AS IT STANDS -> you may not touch anybody above you.
--   WITH CHECK reads what it WOULD BECOME -> you may not create a rank above your own.
--
-- Both are needed and neither is redundant. Measured: an admin promoting THEMSELVES to
-- owner is stopped by WITH CHECK (42501, new row violates row-level security policy); an
-- admin demoting THE OWNER is stopped by USING (0 rows, the owner's row is simply invisible
-- to their UPDATE). A WITH CHECK alone would miss the second entirely.
--
-- The obvious alternative — a flat "nobody may change their own role" rule — was rejected.
-- It is unnecessary, because the rank comparison already refuses every self-promotion (an
-- editor gets 0 rows, an admin gets 42501), and it is harmful, because it would also refuse
-- a legitimate self-demotion. An owner standing down is caught by the owner floor below,
-- which refuses with a sentence explaining what to do instead.
--
-- A policy CANNOT reference OLD or NEW. `using (public.account_role_rank(old.role) ...)`
-- raises 42P01, missing FROM-clause entry for table "old". The USING/WITH CHECK pair is the
-- only way to express a before-and-after rule at the policy level, which is also why the
-- seat rule in section 7 cannot be a policy at all.
--
-- NO INSERT GRANT AND NO DELETE GRANT, ever. A browser that could INSERT here would hand
-- itself a colleague's data; the only path to a new row is accept_account_invite, which
-- needs a token. A DELETE would lose who was in the account and when, which is the audit
-- trail a compliance product cannot discard — removal is status = 'removed'.
--
-- AND NO DELETE FOR service_role EITHER, WHICH IS A CORRECTION TO AN EARLIER DRAFT OF THIS
-- FILE. Supabase's default privileges (`alter default privileges in schema public grant all
-- on tables to service_role`) hand the service role DELETE on every new table, and this one
-- inherited it. That is a hole in the owner floor below, and it was reproduced rather than
-- theorised:
--
--   the owner standing down by UPDATE  -> P0001, hint = owner_floor
--   the same thing by DELETE           -> committed. active owners on the account: 0,
--                                         accounts.owner_user_id still naming a non-member,
--                                         the admin carrying on with rank 30, and
--                                         account_entitlement still resolving the departed
--                                         owner's plan.
--
-- The floor is AFTER INSERT OR UPDATE and must stay that way: a cascade delete of the parent
-- accounts row fires this child table's constraint triggers, so a floor listening for DELETE
-- would find zero owners at commit and make erasing an account impossible. The invariant is
-- therefore protected by making the statement unreachable rather than by watching for it.
-- Cascades are unaffected: a referential action is performed by the system and is not
-- subject to the DELETE privilege, so `delete from public.accounts` still removes the
-- membership rows with it. Section 11 asserts both halves.
-- ---------------------------------------------------------------------------
revoke all on public.account_members from anon, authenticated;
grant  select                 on public.account_members to authenticated;
grant  update (role, status)  on public.account_members to authenticated;
grant  all                    on public.account_members to service_role;
revoke delete                 on public.account_members from service_role;

drop policy if exists "members are re-roled by managers, never upward" on public.account_members;
create policy "members are re-roled by managers, never upward"
  on public.account_members for update
  using      (public.can(account_id, 'manage_members')
              and public.account_role_rank(role) <= public.account_rank(account_id))
  with check (public.can(account_id, 'manage_members')
              and public.account_role_rank(role) <= public.account_rank(account_id));

-- --- AT MOST ONE ACTIVE OWNER, DECLARATIVELY --------------------------------
--
-- A partial unique index, not a trigger, because this half of the rule needs no comparison
-- with anything: it is a uniqueness property and Postgres already has the mechanism.
-- Measured: a second active owner is refused 23505 EVEN AS SUPERUSER, which no trigger can
-- claim.
--
-- DELIBERATELY NOT DEFERRABLE. That is what makes an ownership change from a browser
-- impossible in either order — promote-then-demote hits the index, demote-then-promote
-- leaves the account ownerless in between and is caught at commit by the floor below. With
-- section 8's transfer RPC withdrawn, that is now the whole story: ownership does not move,
-- and the two halves of the rule are what say so.
--
-- The pre-check exists because `create unique index` on data that already violates it aborts
-- with a bare 23505 naming a row, and the operator meeting that needs to know what it means
-- and that the fix is a data question, not a migration question.
do $$
declare
  v_n integer;
begin
  select count(*) into v_n from (
    select am.account_id from public.account_members am
     where am.role = 'owner' and am.status = 'active'
     group by am.account_id having count(*) > 1
  ) x;
  if v_n > 0 then
    raise exception
      'member_roles_and_seats: % account(s) already hold more than one active owner, so the single-owner index cannot be created. Decide which person owns each of them and demote the others to admin before re-running; this file will not guess.', v_n
      using errcode = '22023';
  end if;
end
$$;

create unique index if not exists account_members_one_active_owner
  on public.account_members (account_id)
  where role = 'owner' and status = 'active';

-- --- AN ACCOUNT ALWAYS HAS AN OWNER, AND IT IS THE DECLARED ONE --------------
--
-- The other half cannot be an index: "at least one" is not a uniqueness property, and the
-- check has to run after the whole transition rather than after each statement, or a
-- legitimate transfer would be refused halfway through.
--
-- AFTER INSERT OR UPDATE, and DELIBERATELY NOT DELETE. Measured: a cascade delete of the
-- parent accounts row DOES fire this child table's constraint triggers. A floor that
-- listened for DELETE would find zero owners at commit and make deleting an account
-- impossible — which is to say it would break GDPR erasure in the name of an invariant
-- about an account that no longer exists. The `if not found` guard below covers the same
-- case for the UPDATE path.
--
-- IT ALSO ASSERTS THE OWNER IS accounts.owner_user_id. That column is the key BOTH the plan
-- and the seat ceiling resolve through (public.entitlements joins on it, and section 7's
-- limit lookup joins on it), so a divergence between "who the members table says owns this"
-- and "whose subscription pays for it" would silently meter the wrong person's plan. There
-- would be no error and no symptom until a bill was wrong.
create or replace function public.enforce_account_owner_floor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account  uuid := new.account_id;
  v_declared uuid;
  v_owners   integer;
  v_owner    uuid;
begin
  -- The account may have been deleted later in this same transaction. Nothing to protect.
  select a.owner_user_id into v_declared from public.accounts a where a.id = v_account;
  if not found then
    return null;
  end if;

  -- count and the id in one pass. NOT `min(am.user_id)`: there is no min(uuid) aggregate in
  -- core PostgreSQL, and the failure is a runtime "function min(uuid) does not exist" raised
  -- from inside a commit-time trigger — which surfaces as an unrelated-looking error on
  -- whatever statement happened to be last. Caught by the apply-time probe below.
  select count(*)::integer, (array_agg(am.user_id))[1]
    into v_owners, v_owner
    from public.account_members am
   where am.account_id = v_account
     and am.role       = 'owner'
     and am.status     = 'active';

  if v_owners = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'An account must always have an owner. Transfer ownership to somebody else before standing down.',
      detail  = format('account_id=%s active_owners=0', v_account),
      hint    = 'owner_floor';
  end if;

  if v_owner is distinct from v_declared then
    raise exception using
      errcode = 'P0001',
      message = 'The owner of this account and the person it is billed to have to be the same. Ownership does not move; ask us to change it and we will change the billing with it.',
      detail  = format('account_id=%s members_owner=%s accounts_owner_user_id=%s', v_account, v_owner, v_declared),
      hint    = 'owner_mismatch';
  end if;

  return null;
end;
$$;

comment on function public.enforce_account_owner_floor() is
  'Deferred constraint trigger on public.account_members: at commit, the account still has exactly one active owner and it is accounts.owner_user_id. Deferred so an ownership transfer can pass through an intermediate state inside one transaction. AFTER INSERT OR UPDATE only — a cascade delete of the parent accounts row fires child constraint triggers, so listening for DELETE would make deleting an account impossible.';

revoke all on function public.enforce_account_owner_floor() from public, anon, authenticated;

drop trigger if exists account_members_owner_floor on public.account_members;
create constraint trigger account_members_owner_floor
  after insert or update on public.account_members
  deferrable initially deferred
  for each row execute function public.enforce_account_owner_floor();


-- ---------------------------------------------------------------------------
-- 6. account_invites.
--
-- TIMESTAMPS, NOT A STATUS COLUMN. accepted_at / revoked_at / expires_at record WHEN, which
-- a compliance product wants anyway, and expiry is then DERIVED rather than needing a job to
-- flip a row from 'pending' to 'expired' — a job that, on the day it does not run, leaves
-- live invites that everybody believes are dead. The status word a screen wants is computed
-- by the view below.
--
-- ONLY A HASH IS STORED. The token is 64 hex characters minted inside create_account_invite
-- and returned exactly once; token_hash holds sha256 of it. A dump of this table yields
-- nothing redeemable.
--
-- WHY THE TOKEN IS NOT gen_random_bytes(32). That is the idiomatic call and it lives in
-- pgcrypto, which Supabase installs into the `extensions` schema while this harness installs
-- it into `public`. A function pinned to `set search_path = public` therefore resolves it in
-- one place and not the other, and the failure would appear at CALL time on production
-- rather than at apply time. gen_random_uuid() is core (pg_catalog) on every supported
-- major, so two of them concatenated is 244 bits of pg_strong_random entropy that resolves
-- identically everywhere with no search_path deviation and no extension dependency. 244
-- bits is not meaningfully weaker than 256 for a value nobody gets to guess twice.
--
-- role <> 'owner' AS A CHECK. Ownership does not move at all (section 8 says why, with the
-- measurements), so an invite that could name 'owner' would be the one path in the product
-- that repointed an account's billing, and it would do it with no lock, no seat arithmetic
-- and no Stripe change beside it.
-- ---------------------------------------------------------------------------
create table if not exists public.account_invites (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  email       text not null,
  role        text not null references public.account_roles (role),
  token_hash  bytea not null unique,
  invited_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at  timestamptz
);

comment on table public.account_invites is
  'Outstanding and historical invitations to join an account. Only sha256 of the token is stored, so a read of this table yields nothing redeemable. A live invite (not accepted, not revoked, not expired) whose role consumes a seat RESERVES that seat — see public.account_seats_in_use. Rows are never deleted: revoked_at is how an invite is withdrawn, and the history of who invited whom is part of the account record.';
comment on column public.account_invites.invited_by is
  'Nullable with ON DELETE SET NULL rather than the NOT NULL the design first specified. A NOT NULL foreign key to auth.users would make deleting a user fail while any invite they sent survives, which turns GDPR erasure into a foreign key error. account_members.invited_by made the same call for the same reason.';
comment on column public.account_invites.expires_at is
  'Seven days. Expiry is derived from this column on every read, so no scheduled job has to flip anything, and an unrun job cannot leave live invites that everybody believes are dead.';

alter table public.account_invites drop constraint if exists account_invites_role_not_owner;
alter table public.account_invites
  add  constraint account_invites_role_not_owner
  check (role <> 'owner');

create index if not exists account_invites_account_idx on public.account_invites (account_id);

-- ONE LIVE INVITE PER ADDRESS PER ACCOUNT. Caps how many seats a single address can reserve,
-- makes "re-invite" a well-defined act (the RPC revokes the live one first, so a forwarded
-- old link stops working), and is where a per-account rate limit attaches when one is
-- needed. Case- and whitespace-insensitive, because a second invite to " Ada@x.com " is the
-- same invite.
--
-- THE PREDICATE CANNOT MENTION EXPIRY, and the consequence is worth knowing before somebody
-- meets it. An index predicate has to be IMMUTABLE and now() is not, so an EXPIRED invite
-- still occupies this slot. That is invisible on the intended path — create_account_invite
-- revokes any unaccepted, unrevoked invite to the same address before minting, whether or not
-- it had expired, so re-inviting always works. It is only reachable by inserting into this
-- table by hand, which nothing in the product does.
create unique index if not exists account_invites_one_live_per_email
  on public.account_invites (account_id, lower(btrim(email)))
  where accepted_at is null and revoked_at is null;

alter table public.account_invites enable row level security;

drop policy if exists "invites are readable by member managers" on public.account_invites;
create policy "invites are readable by member managers"
  on public.account_invites for select
  using (public.can(account_id, 'manage_members'));

drop policy if exists "invites are revocable by member managers" on public.account_invites;
create policy "invites are revocable by member managers"
  on public.account_invites for update
  using      (public.can(account_id, 'manage_members'))
  with check (public.can(account_id, 'manage_members'));

-- COLUMN-LEVEL GRANTS. token_hash is outside the SELECT list, so not even an admin who is
-- entitled to see the invite can read the hash; and revoked_at is the only writable column,
-- so revocation needs no RPC while nothing else about a minted invite can be edited after
-- the fact. No INSERT and no DELETE: creation is service-role only (section 8) and an invite
-- is withdrawn, never erased.
revoke all on public.account_invites from anon, authenticated;
grant  select (id, account_id, email, role, invited_by, created_at, expires_at, accepted_at, accepted_by, revoked_at)
       on public.account_invites to authenticated;
grant  update (revoked_at) on public.account_invites to authenticated;
grant  all    on public.account_invites to service_role;

-- --- AND THEREFORE A VIEW, WHICH IS NOT TIDINESS -----------------------------
--
-- PostgREST issues `select *`. Against a table with column-level SELECT grants that is a
-- blanket 42501 for EVERYBODY, including the admin who is supposed to see the row. Measured:
-- an explicit column list succeeds where `select *` on the same table and the same session
-- does not. So the readable surface has to be an object whose every column is granted, which
-- is this view. Any future column-granted table in this schema needs the same treatment, and
-- discovering that from a support ticket is expensive.
--
-- security_invoker so the policies above apply to the caller rather than to the view's owner;
-- security_barrier so the planner cannot push a caller-supplied function inside it and use
-- that to probe rows the caller cannot see.
create or replace view public.account_invite_list
with (security_invoker = true, security_barrier = true)
as
select
  i.id,
  i.account_id,
  i.email,
  i.role,
  i.invited_by,
  i.created_at,
  i.expires_at,
  i.accepted_at,
  i.accepted_by,
  i.revoked_at,
  case
    when i.accepted_at is not null then 'accepted'
    when i.revoked_at  is not null then 'revoked'
    when i.expires_at  <= now()    then 'expired'
    else                                'pending'
  end as status
from public.account_invites i;

comment on view public.account_invite_list is
  'The readable shape of public.account_invites: every column except token_hash, plus a derived status. Exists because PostgREST issues select *, which a column-granted table refuses with 42501 for every role including the one entitled to read it. security_invoker = true, so the manage_members policy on the underlying table is what decides visibility — an editor or a viewer sees no invites at all, which is what keeps the team screen from being an email-harvesting surface for the least privileged member.';

revoke all    on public.account_invite_list from anon, authenticated;
grant  select on public.account_invite_list to authenticated, service_role;

-- --- SANCTIONING SOMEBODY REVOKES THE KEYS THEY WERE HOLDING -------------------
--
-- REPRODUCED, AND IT UNDID THE ONLY SANCTION THE PRODUCT OFFERS. An ordinary active admin
-- had the server mint an invite to their own address at admin rank, and then the owner
-- removed them. Every direct path was correctly closed:
--
--   removed: reads                          -> 0 rows
--   removed: writes                         -> 42501
--   removed: reactivates their own row      -> 0 rows, the UPDATE policy filters it away
--
-- and then:
--
--   REMOVED MEMBER REDEEMS THEIR OWN PRE-MINTED TOKEN
--     -> outcome = accepted, joined_role = admin
--   rank and capabilities now  -> rank 30, manage_members true
--   and they remove the editor -> 1 row
--
-- accept_account_invite is SECURITY DEFINER, so RLS never sees it, and it had no reason to
-- ask whether the redeemer was somebody this account had just thrown out. Identical with
-- status = 'suspended'. A live invite is a key, and removing somebody who is holding a key
-- has to take the key back.
--
-- TWO CLASSES OF KEY, AND BOTH ARE TAKEN. The invite ADDRESSED TO them is their own way
-- back in. The invites they SENT are a back door left for somebody else: a departing admin
-- who has already invited an address they control is in the account again the moment that
-- address is redeemed, and the second identity is not the row anybody sanctioned. Revoking
-- both means a manager who removes a person removes what that person set up, and a
-- legitimate new hire whose invite was withdrawn is one re-invite away from a manager who is
-- still there.
--
-- A PLAIN AFTER ROW TRIGGER, NOT A CONSTRAINT TRIGGER, and the distinction is deliberate.
-- This is a cascading WRITE and not a check: it must be visible to the seat count in the
-- same transaction (revoking an invite hands its reserved seat straight back), and there is
-- nothing to defer because it compares nothing. AFTER is still the safe half of the ordering
-- fact this whole file is written against — an AFTER ROW trigger fires only for a row that
-- was actually written, which is to say only for a row RLS admitted.
create or replace function public.revoke_invites_on_sanction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  -- auth.users is read here and NOWHERE ELSE in this file's invite path. It is safe in this
  -- position for the reason it is unsafe in create_account_invite: this function answers
  -- nobody. It returns no value, it is reachable only as a trigger on a row that has already
  -- been written, and its whole effect is to set revoked_at. There is no branch a caller can
  -- time and no response shape a caller can read.
  select lower(btrim(u.email)) into v_email from auth.users u where u.id = new.user_id;

  update public.account_invites i
     set revoked_at = now()
   where i.account_id  = new.account_id
     and i.accepted_at is null
     and i.revoked_at  is null
     and (
       i.invited_by = new.user_id
       or (v_email is not null and lower(btrim(i.email)) = v_email)
     );

  return null;
end;
$$;

comment on function public.revoke_invites_on_sanction() is
  'Withdraws every live invitation a sanctioned member was holding: the one addressed to them, which is their own way back in, and the ones they sent, which are a back door for an address they control. Reproduced before this existed: a removed admin redeemed a token they had minted for themselves while still privileged and came back at admin rank, because accept_account_invite is SECURITY DEFINER and RLS never sees it. Frees the reserved seats at the same instant, because the seat count is derived.';

revoke all on function public.revoke_invites_on_sanction() from public, anon, authenticated;

drop trigger if exists account_members_revoke_invites on public.account_members;
create trigger account_members_revoke_invites
  after update of status on public.account_members
  for each row
  when (new.status <> 'active' and old.status = 'active')
  execute function public.revoke_invites_on_sanction();


-- ---------------------------------------------------------------------------
-- 7. SEATS. Derived, never stored; metered on the transition, never on the headcount.
--
-- THE COUNT IS DERIVED. The obvious alternative is a seats_used counter column on accounts,
-- and it would have to be maintained by every invite, revoke, expiry, promotion, demotion,
-- suspension, reactivation and acceptance — nine paths, of which missing one silently sells
-- or withholds a seat with no error anywhere. account_seats_in_use computes the number under
-- the same lock that guards the mutation, so it cannot be stale.
--
-- PENDING INVITES RESERVE. Without reservation an admin on a three-seat plan can send thirty
-- valid editor invites and twenty-seven people click a link and are told there is no seat,
-- which is a worse experience than the one it saves. The cost is that the number looks
-- surprising until the UI shows pending invites inside it: on maker, one editor seat held by
-- the owner, you can invite viewers and nobody else.
--
-- RESERVATION IS ALSO WHY THE GUARD MUST BE DEFERRED, and this is the part that is easy to
-- miss. Acceptance is a SWAP — the reservation is released and the seat consumed in the same
-- transaction — so only a commit-time check evaluates it correctly. An IMMEDIATE guard would
-- refuse or admit depending on the order of two statements inside one RPC. Measured:
-- seats_in_use is 3 of 3 before an accept and 3 of 3 after it, and a one-out-one-in swap at
-- the ceiling commits cleanly.
--
-- THE JOIN THAT IS EASY TO GET WRONG: the limit lives on public.brand_memberships, keyed by
-- (user_id, brand_slug) FOR THE ACCOUNT OWNER, while the members live on
-- public.account_members keyed by account_id. Getting from one to the other goes through
-- accounts.owner_user_id AND accounts.brand_slug — both halves, or a person who owns
-- accounts on two brands supplies the wrong brand's allowance.
-- ---------------------------------------------------------------------------
create or replace function public.account_editor_seat_limit(p_account_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select bm.editor_seat_limit
    from public.accounts a
    join public.brand_memberships bm
      on bm.user_id    = a.owner_user_id
     and bm.brand_slug = a.brand_slug
   where a.id = p_account_id;
$$;

comment on function public.account_editor_seat_limit(uuid) is
  'The editor seat ceiling for an account, resolved through accounts.owner_user_id AND accounts.brand_slug to the owner''s brand_memberships row. Returns NULL when no membership row resolves, which the caller must treat as fail-CLOSED — see public.enforce_editor_seats. Never hardcodes a tier''s figure: the number is written by apply_stripe_entitlement from the plan contract. INTERNAL: not executable by authenticated, because it takes an account id and answers about it unconditionally. A member reads the same number from public.account_entitlement, which is guarded.';

-- NOT GRANTED TO authenticated, AND THE FIRST DRAFT OF THIS FILE GRANTED IT. That draft was
-- attacked by supabase/tests/member-roles-and-seats.test.ts and the leak is quoted here
-- because the shape is subtle enough to be re-introduced by anybody who wants the number on a
-- screen. This function and account_seats_in_use are SECURITY DEFINER, take an account id as
-- an ARGUMENT, and consult no membership at all, so with an authenticated grant they answered
-- anybody. Measured, as a REMOVED member and as a total stranger, against the live chain:
--
--   select public.account_seats_in_use('<somebody else''s account>')      -> 1
--   select public.account_editor_seat_limit('<somebody else''s account>') -> 3
--   select public.account_seats_in_use('<an account id that does not exist>') -> 0
--
-- Three separate failures in one grant. It is an existence oracle (a real account answers
-- non-zero, an invented one answers zero); it discloses another business's headcount; and the
-- seat limit discloses their PLAN TIER, which is billing state. It is also exactly the probe
-- shape the rest of this design refuses — is_member_of is argument-free about identity on
-- purpose (20260803120000:491), and the apply-time assertion in section 11 that no helper
-- takes two uuids does NOT catch this, because one uuid plus no guard is the same probe.
--
-- The fix is a revoke rather than a guard inside the body, and that is deliberate: adding
-- `and public.is_member_of(p_account_id)` would make the function return NULL when the seat
-- trigger calls it, and `null > limit` is null, which silently disables the ceiling for every
-- service-role and server-side write. Enforcement needs the unguarded number; a browser does
-- not need this function at all. Verified after revoking: the ceiling still refuses an editor
-- over the limit (P0001/seat_limit_reached), create_account_invite still meters, acceptance
-- still works, and a member still reads seats_in_use through account_entitlement — all of
-- which run as the definer and so hold no grant of their own.
revoke all     on function public.account_editor_seat_limit(uuid) from public, anon, authenticated;
grant  execute on function public.account_editor_seat_limit(uuid) to service_role;

create or replace function public.account_seats_in_use(p_account_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::integer
       from public.account_members am
       join public.account_roles r on r.role = am.role
      where am.account_id = p_account_id
        and am.status     = 'active'
        and r.consumes_seat)
  + (select count(*)::integer
       from public.account_invites i
       join public.account_roles r on r.role = i.role
      where i.account_id  = p_account_id
        and i.accepted_at is null
        and i.revoked_at  is null
        and i.expires_at  > now()
        and r.consumes_seat
        -- A PENDING INVITE TO SOMEBODY WHO IS ALREADY PAID FOR RESERVES NOTHING, because
        -- redeeming it consumes no new seat. Without this line, re-inviting a sitting editor
        -- double-books them: measured on a three-seat plan holding owner + admin, an invite
        -- to the admin's own address took the count from 2 to 3 against a head count of 2,
        -- and the genuine third hire was then refused with seat_limit_reached while the team
        -- screen showed two seat-holders beside "3 of 3 in use".
        --
        -- MATCHED ON THE ADDRESS AND ON consumes_seat, not on membership alone. An editor
        -- invite sent to a sitting VIEWER is a promotion: it genuinely will consume a seat on
        -- redemption, so it must still reserve one, and that is why the join carries
        -- r2.consumes_seat rather than stopping at "is a member".
        and not exists (
          select 1
            from public.account_members am2
            join public.account_roles   r2 on r2.role = am2.role
            join auth.users             u  on u.id    = am2.user_id
           where am2.account_id = p_account_id
             and am2.status     = 'active'
             and r2.consumes_seat
             and lower(btrim(u.email)) = lower(btrim(i.email))
        ));
$$;

comment on function public.account_seats_in_use(uuid) is
  'Editor seats consumed: active members holding a seat-consuming role, plus live pending invites for one. Both halves join account_roles.consumes_seat rather than naming roles, so which roles cost money is one UPDATE on that table and appears in no function body. Pending invites RESERVE, so an admin cannot oversubscribe a plan by sending invites nobody has accepted yet — except an invite to an address that already holds a seat in this account, which reserves nothing because redeeming it consumes nothing. Two different addresses belonging to one human still reserve two seats; the database cannot know they are the same person until one is redeemed. INTERNAL: not executable by authenticated, for the reason written above account_editor_seat_limit. A member reads this number from public.account_entitlement, which is guarded.';

-- Same revoke, same measurement, same reason. See the note above account_editor_seat_limit.
revoke all     on function public.account_seats_in_use(uuid) from public, anon, authenticated;
grant  execute on function public.account_seats_in_use(uuid) to service_role;

-- --- THE CEILING ------------------------------------------------------------
--
-- A NULL LIMIT FAILS CLOSED AT 1, WHICH IS THE OPPOSITE OF WHAT sku_within_limit DOES, and
-- the difference is deliberate. An unknown SKU allowance must fail OPEN, because failing
-- closed there locks a paying customer out of products they ALREADY OWN — catastrophe ruling
-- (a) of 20260803120000 section 6 exists to prevent exactly that. A seat is not retained
-- access, it is FRESH CONSUMPTION: a null limit means the owner has no brand_memberships row
-- at all, and failing open there hands unlimited free editors to any account whose
-- membership row went missing. Nobody is locked out of anything they already have, because
-- this function only ever runs on a transition INTO consuming.
--
-- The 1 is not a tier's seat count. It is the column's own `not null default 1` and its
-- `check (editor_seat_limit >= 1)` floor (20260802120000:69, :86-88), restated at the one
-- place a row can be missing entirely. If every tier's figure changed tomorrow this line
-- would not.
--
-- NO is_member_of RE-GUARD, AND IT MUST NOT GROW ONE. See the header: a constraint trigger
-- is structurally unreachable for a row RLS refuses, measured, and section 11 re-proves it
-- on the server this is applied to. enforce_sku_limit needs its guard because it is BEFORE
-- ROW; copying that line here would be defending against an ordering that does not apply and
-- would teach the next reader that the guard is what makes this safe.
create or replace function public.enforce_editor_seats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid;
  v_before  boolean;
  v_after   boolean;
  v_limit   integer;
  v_used    integer;
begin
  if tg_table_name = 'account_members' then
    v_account := new.account_id;
    v_after   := new.status = 'active'
                 and (select r.consumes_seat from public.account_roles r where r.role = new.role);
    v_before  := tg_op = 'UPDATE'
                 and old.status = 'active'
                 and (select r.consumes_seat from public.account_roles r where r.role = old.role);
  else
    -- account_invites. A live invite is one that is neither accepted nor revoked nor expired.
    v_account := new.account_id;
    v_after   := new.accepted_at is null and new.revoked_at is null and new.expires_at > now()
                 and (select r.consumes_seat from public.account_roles r where r.role = new.role);
    v_before  := tg_op = 'UPDATE'
                 and old.accepted_at is null and old.revoked_at is null and old.expires_at > now()
                 and (select r.consumes_seat from public.account_roles r where r.role = old.role);
  end if;

  -- THE WHOLE DOWNGRADE RULE IS THIS LINE. Not consuming afterwards: nothing to meter, so
  -- demotion, suspension, removal and revocation are always allowed however far over the
  -- limit the account is. Already consuming beforehand: an editor/admin sidegrade, a rename,
  -- any edit that does not add consumption — also not metered. Only a transition from
  -- not-consuming to consuming counts, which is why an over-limit account is a normal steady
  -- state rather than a table that refuses every write.
  if not coalesce(v_after, false) or coalesce(v_before, false) then
    return null;
  end if;

  -- Serialise on the account row before counting. The same lock object enforce_sku_limit
  -- takes (20260803120000:455) and the same one accept_account_invite takes, so every
  -- account-level invariant queues on one row and no two of them can deadlock by acquiring
  -- locks in a different order. SECURITY DEFINER is what makes this reachable at all: a
  -- non-definer trigger doing exactly this as `authenticated` dies 42501, permission denied
  -- for table accounts.
  perform 1 from public.accounts a where a.id = v_account for update;

  v_limit := coalesce(public.account_editor_seat_limit(v_account), 1);
  v_used  := public.account_seats_in_use(v_account);

  if v_used > v_limit then
    raise exception using
      errcode = 'P0001',
      message = format(
        'This account is using all %s of its editor seats. Read-only seats are free and unlimited on every plan, so you can still add somebody who only needs to look.',
        v_limit),
      detail  = format('account_id=%s seats_in_use=%s editor_seat_limit=%s', v_account, v_used, v_limit),
      hint    = 'seat_limit_reached';
  end if;

  return null;
end;
$$;

comment on function public.enforce_editor_seats() is
  'Deferred constraint trigger on public.account_members and public.account_invites: at commit, an account may not have consumed more editor seats than its plan allows. Meters a TRANSITION into consuming, never a headcount, so an account whose limit dropped below its headcount can still demote, suspend and remove but cannot add — which is the downgrade rule (PRICING_RESEARCH §6.4) rather than an approximation of it. Fails CLOSED on an unknown limit, unlike sku_within_limit, because a seat is fresh consumption rather than retained access. Carries no is_member_of re-guard and must not grow one: a constraint trigger never runs for a row RLS refused.';

revoke all on function public.enforce_editor_seats() from public, anon, authenticated;

-- ONE FUNCTION, TWO TABLES. Enforcement is structural on the reservation and on the seat, so
-- the invite RPC needs no seat check of its own and there is exactly one definition of the
-- ceiling. It binds service_role too — measured — which means no future server-side path can
-- grant a free seat by accident, and also that support cannot hand one out directly. The
-- auditable override is to raise editor_seat_limit.
drop trigger if exists account_members_seat_ceiling on public.account_members;
create constraint trigger account_members_seat_ceiling
  after insert or update on public.account_members
  deferrable initially deferred
  for each row execute function public.enforce_editor_seats();

drop trigger if exists account_invites_seat_ceiling on public.account_invites;
create constraint trigger account_invites_seat_ceiling
  after insert or update on public.account_invites
  deferrable initially deferred
  for each row execute function public.enforce_editor_seats();


-- ---------------------------------------------------------------------------
-- 8. THE TWO THINGS THAT GENUINELY CANNOT BE A POLICY.
--
-- Member management is otherwise ordinary DML above, deliberately: a rank comparison in
-- pg_policies is legible on a running database in a way a 200-line RPC is not. What is left
-- here are the two transitions that are not a property of (actor, row):
--
--   create_account_invite   needs a SECRET, and the secret must never reach a browser.
--   accept_account_invite   needs a TOKEN COMPARISON plus a multi-table atomic transition.
--
-- A third one, transfer_account_ownership, was here and is withdrawn. The argument is at the
-- foot of this section rather than in a changelog, because the next person to want that
-- feature needs the measurements and not the verdict.
--
-- CREATION IS SERVICE-ROLE ONLY, AND THIS IS THE SECURITY DECISION IN THE SECTION. The
-- tempting design is a SECURITY DEFINER function callable by `authenticated` that returns
-- the plaintext token to the browser, which then POSTs it to www to send the email. A token
-- that transits a browser is a token in a history entry, a network tab, a screen share, a
-- referrer header and any client-side error reporting. Instead the app POSTs to a www
-- serverless function with its bearer JWT, www verifies the token and takes the actor from
-- that VERIFIED token and from nowhere else, calls this with the service role, sends the
-- email, and returns {ok:true}. That is the pattern src/lib/billing.ts:13-18 already proves
-- for three endpoints.
--
-- EMAIL ENUMERATION IS CLOSED ARCHITECTURALLY, NOT BY MATCHING RESPONSE SHAPES.
-- create_account_invite NEVER READS auth.users — asserted on the function body in section 11.
-- There is no lookup, so there is no branch to time, no code to differentiate and no shape to
-- equalise. There is ONE email and ONE link, and no "create your account" versus "sign in"
-- variant, because a variant is a branch and a branch is an oracle. Whether the address
-- belongs to a real person is established at ACCEPT time, against the caller's own verified
-- email.
-- ---------------------------------------------------------------------------
create or replace function public.create_account_invite(
  p_actor      uuid,
  p_account_id uuid,
  p_email      text,
  p_role       text
)
returns table (invite_id uuid, token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role       text := coalesce(
                         nullif(current_setting('request.jwt.claim.role', true), ''),
                         nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
                       );
  v_actor_rank integer;
  v_min_rank   integer;
  v_new_rank   integer;
  v_email      text := lower(btrim(coalesce(p_email, '')));
  v_token      text;
  v_id         uuid;
begin
  -- Defence in depth, the same shape apply_stripe_entitlement uses (20260802120000:372).
  -- This function takes its actor as an ARGUMENT because the caller is a server holding a
  -- verified token, so it has no natural auth.uid() guard. If the grant below is ever wrong,
  -- this is what stops the anon key being an "add me to any account" endpoint.
  if v_role is not null and v_role <> 'service_role' then
    raise exception 'create_account_invite is service-role only' using errcode = '42501';
  end if;

  if p_actor is null or p_account_id is null or v_email = '' or p_role is null then
    raise exception 'actor, account, email and role are all required' using errcode = '22023';
  end if;

  -- SECURITY DEFINER BYPASSES RLS, so the actor's authority has to be re-resolved here
  -- rather than assumed from the fact that the call arrived. Written inline rather than as a
  -- has_role(account_id, user_id) helper: such a helper would be a granted function that
  -- answers questions about somebody else's membership, which is the probe is_member_of was
  -- shaped to make impossible.
  select r.rank into v_actor_rank
    from public.account_members am
    join public.account_roles   r on r.role = am.role
    join public.accounts        a on a.id  = am.account_id
    left join public.brand_memberships bm
      on bm.user_id    = a.owner_user_id
     and bm.brand_slug = a.brand_slug
   where am.account_id = p_account_id
     and am.user_id    = p_actor
     and am.status     = 'active'
     and coalesce(bm.status, 'active') = 'active';

  select c.min_rank into v_min_rank
    from public.account_capabilities c where c.capability = 'manage_members';

  -- ONE ANSWER FOR "you may not" AND "that account does not exist". Textually identical, so
  -- this is not an existence oracle for account ids.
  if v_actor_rank is null or v_actor_rank < v_min_rank then
    raise exception 'you are not allowed to invite people to this account' using errcode = '42501';
  end if;

  select r.rank into v_new_rank from public.account_roles r where r.role = p_role;
  if v_new_rank is null then
    raise exception 'unknown role %', p_role using errcode = '22023';
  end if;
  if p_role = 'owner' then
    raise exception 'an account owner cannot be invited; ownership does not move'
      using errcode = '22023';
  end if;
  if v_new_rank > v_actor_rank then
    raise exception 'you cannot invite somebody at a higher rank than your own' using errcode = '42501';
  end if;

  -- Re-inviting the same address withdraws the live invite first, so a forwarded old link
  -- stops working and the unique index has room. Doing this rather than erroring is what
  -- makes "resend" a safe thing for a screen to offer.
  update public.account_invites
     set revoked_at = now()
   where account_id = p_account_id
     and lower(btrim(email)) = v_email
     and accepted_at is null
     and revoked_at  is null;

  -- 244 bits from two core UUIDs. See the note in section 6 on why not gen_random_bytes.
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.account_invites (account_id, email, role, token_hash, invited_by)
  values (p_account_id, v_email, p_role, sha256(convert_to(v_token, 'UTF8')), p_actor)
  returning id into v_id;

  -- The seat reservation is NOT checked here. account_invites_seat_ceiling enforces it at
  -- commit, for the reservation and for the seat itself, so there is one definition of the
  -- ceiling and no way to reach a seat by a path that skipped this function.
  return query select v_id, v_token;
end;
$$;

comment on function public.create_account_invite(uuid, uuid, text, text) is
  'Mints an invite and returns its plaintext token EXACTLY ONCE. Service-role only: the token is emailed by the www endpoint that calls this, and never transits a browser. Re-resolves the actor''s rank itself, because SECURITY DEFINER bypasses RLS. Never reads auth.users, so there is no branch on whether the address belongs to an existing user and therefore no enumeration oracle. Refuses owner, an unknown role, and any role above the actor''s own. The seat reservation is enforced at commit by account_invites_seat_ceiling, not here.';

revoke all     on function public.create_account_invite(uuid, uuid, text, text) from public, anon, authenticated;
grant  execute on function public.create_account_invite(uuid, uuid, text, text) to service_role;

-- --- ACCEPTANCE -------------------------------------------------------------
--
-- THE OUTCOME VOCABULARY IS FOUR WORDS AND EACH IS A RULING.
--
--   'invalid'         unknown, revoked, or already accepted. These three collapse because
--                     distinguishing them would tell a token holder that they were removed,
--                     or that somebody else used their link.
--   'expired'         does NOT collapse into the above. To reach it you must already hold a
--                     real token, which you got from the email, so the branch discloses
--                     nothing to a prober — while being the difference between a useful
--                     message and a dead end.
--   'wrong_recipient' the accepting user's verified email is not the invited address. This
--                     is what makes a forwarded or stolen link useless.
--   'no_seat'         the account's ceiling dropped below what is already in use.
--
-- THE INSERT IS A FOUR-WAY RULE AND THE OBVIOUS TWO-WAY VERSION IS A SHIPPING BUG. `on
-- conflict do nothing` looks correct and defends a real concern — an existing admin must not
-- be silently demoted by accepting a stale lesser invite. Reproduced: with `do nothing`, a
-- person previously set to status='removed' accepts a fresh valid invite, the insert
-- conflicts and does nothing, this function answers 'accepted' with an account id, and they
-- ARE NOT A MEMBER. The app stores that as the active account and every subsequent request is
-- refused. Anyone ever removed or suspended could never be invited back. So:
--
--   no row                  -> join at the invited role
--   row, not active         -> RE-ADMIT at the invited role, unless the invite predates the
--                              sanction (see below). The deferred trigger meters it as new
--                              consumption, because old.status <> 'active' makes v_before
--                              false.
--   row, active, lower rank -> PROMOTE to the invited role
--   row, active, same or
--     higher rank           -> leave the existing role alone, which keeps the stale-invite
--                              concern: an editor invite cannot demote a sitting admin
--
-- PROMOTION IS A CORRECTION, NOT AN ADDITION. The earlier version of this rule collapsed the
-- last two cases into "leave the existing role alone", and it made this function answer a
-- question with a value it had not written. Reproduced: a sitting viewer redeems an editor
-- invite, the row stays viewer, and the RPC returns joined_role = 'editor', which the app
-- renders as "You have joined as editor" on a screen whose every write then dies 42501 while
-- account_entitlement reports caller_role = 'viewer'. Two screens in the same app disagreed
-- about what somebody was. The invite was minted by a manager at a rank they themselves hold,
-- so honouring it upward is what the manager asked for; the deferred seat trigger meters the
-- promotion exactly as it meters any other transition into consuming.
--
-- AND THE RETURN VALUE IS NOW READ BACK OUT OF THE ROW rather than echoed from the invite, so
-- there is no shape of this rule, present or future, that can report a role nobody holds. The
-- `on conflict` has no WHERE for the same reason: a suppressed DO UPDATE returns no row, and
-- a RETURNING that sometimes returns nothing is how the mis-report gets back in.
--
-- A LIVE INVITE IS A KEY, AND A SANCTION TAKES KEYS BACK. account_members_revoke_invites in
-- section 6 withdraws every live invite a removed or suspended member was holding, which is
-- the structural half of that. This function carries the second half: it refuses to re-admit
-- somebody whose membership row was last changed AFTER the invite was minted. Two independent
-- guards, because the trigger is the one that can be bypassed by a future path that writes
-- the row some other way, and this check is the one that can be dodged by a row touched
-- between the sanction and the click.
--
-- THE CONFLICT TARGET IS THE NAMED CONSTRAINT, and that is load-bearing rather than stylistic.
-- `on conflict (account_id, user_id)` inside a plpgsql function whose RETURNS TABLE declares
-- an output column named account_id raises 42702, "column reference account_id is ambiguous",
-- AT CALL TIME rather than at create time — so it passes every syntax check and fails in
-- front of a customer. The output columns are also named joined_account_id and joined_role
-- for the same reason.
create or replace function public.accept_account_invite(p_token text)
returns table (outcome text, joined_account_id uuid, joined_role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite      public.account_invites%rowtype;
  v_email       text;
  v_limit       integer;
  v_used        integer;
  v_seat        boolean;
  v_was_status  text;
  v_was_touched timestamptz;
  v_joined      text;
begin
  if auth.uid() is null then
    raise exception 'sign in before accepting an invitation' using errcode = '42501';
  end if;

  if p_token is null or btrim(p_token) = '' then
    return query select 'invalid'::text, null::uuid, null::text;
    return;
  end if;

  -- FOR UPDATE is what makes replay a race nobody wins: two deliveries of the same click
  -- queue, the first stamps accepted_at, the second re-reads it and answers 'invalid'.
  select * into v_invite
    from public.account_invites i
   where i.token_hash = sha256(convert_to(p_token, 'UTF8'))
   for update;

  if not found or v_invite.accepted_at is not null or v_invite.revoked_at is not null then
    return query select 'invalid'::text, null::uuid, null::text;
    return;
  end if;

  if v_invite.expires_at <= now() then
    return query select 'expired'::text, null::uuid, null::text;
    return;
  end if;

  select lower(btrim(u.email)) into v_email from auth.users u where u.id = auth.uid();
  if v_email is distinct from lower(btrim(v_invite.email)) then
    return query select 'wrong_recipient'::text, null::uuid, null::text;
    return;
  end if;

  -- Lock the account before reading the count, the same object every other account-level
  -- invariant locks.
  perform 1 from public.accounts a where a.id = v_invite.account_id for update;

  -- THE SANCTION CHECK. Read under the row lock, before anything is written. A membership
  -- that is not active and whose row was last touched at or after this invite was minted is a
  -- person somebody threw out while they were already holding this key, which is the shape
  -- that was reproduced: an admin invited their own address, the owner removed them, and the
  -- token they already had put them back at admin rank. One answer, 'invalid', for the same
  -- reason unknown and revoked collapse into it: it says nothing about who did what.
  --
  -- A genuine re-invitation is minted AFTER the removal, so its created_at is later and this
  -- refuses nothing legitimate. The one false refusal it can produce is a row edited in the
  -- window between the invite and the click, which costs the person one fresh invite from a
  -- manager who is still there.
  select am.status, am.updated_at into v_was_status, v_was_touched
    from public.account_members am
   where am.account_id = v_invite.account_id
     and am.user_id    = auth.uid()
   for update;

  if v_was_status is not null
     and v_was_status <> 'active'
     and v_invite.created_at <= v_was_touched then
    return query select 'invalid'::text, null::uuid, null::text;
    return;
  end if;

  select r.consumes_seat into v_seat from public.account_roles r where r.role = v_invite.role;

  if coalesce(v_seat, false) then
    v_limit := coalesce(public.account_editor_seat_limit(v_invite.account_id), 1);
    v_used  := public.account_seats_in_use(v_invite.account_id);
    -- STRICTLY GREATER, and the strictness is the point: this invite is ALREADY counted, as
    -- a live reservation, so at a full-but-not-over account v_used = v_limit and acceptance
    -- must proceed. It refuses only when the ceiling has genuinely dropped below what is in
    -- use, which is the downgrade case.
    if v_used > v_limit then
      return query select 'no_seat'::text, null::uuid, null::text;
      return;
    end if;
  end if;

  insert into public.account_members (account_id, user_id, role, status, invited_by)
  values (v_invite.account_id, auth.uid(), v_invite.role, 'active', v_invite.invited_by)
  on conflict on constraint account_members_account_id_user_id_key do update
    set role       = case
                       when public.account_members.status = 'active'
                        and public.account_role_rank(public.account_members.role)
                            >= public.account_role_rank(excluded.role)
                       then public.account_members.role
                       else excluded.role
                     end,
        status     = 'active',
        invited_by = coalesce(public.account_members.invited_by, excluded.invited_by)
  returning public.account_members.role into v_joined;

  update public.account_invites
     set accepted_at = now(), accepted_by = auth.uid()
   where id = v_invite.id;

  return query select 'accepted'::text, v_invite.account_id, v_joined;
end;
$$;

comment on function public.accept_account_invite(text) is
  'Redeems an invite token for the signed-in caller. Outcomes: accepted, invalid (unknown, revoked, already used, or held over a sanction — collapsed so a holder is not told they were removed or that somebody else used their link), expired (kept separate because reaching it requires already holding a real token), wrong_recipient (the caller''s verified email is not the invited address, which is what makes a forwarded link useless), no_seat. Re-admits a previously removed or suspended person UNLESS the invite predates the sanction, which is the reproduced case where a removed admin redeemed a token they had minted for themselves. Promotes a sitting member to a higher invited role and never demotes one. joined_role is READ BACK OUT OF THE ROW, never echoed from the invite: the earlier version reported the invited role while writing a different one, and the app rendered that to the customer.';

revoke all     on function public.accept_account_invite(text) from public, anon;
grant  execute on function public.accept_account_invite(text) to authenticated, service_role;

-- --- OWNERSHIP, AND WHY THERE IS NO FUNCTION HERE ----------------------------
--
-- AN EARLIER DRAFT OF THIS FILE SHIPPED public.transfer_account_ownership(uuid, uuid),
-- granted to `authenticated`. It demoted the outgoing owner to admin, promoted an existing
-- active member, and repointed accounts.owner_user_id, all under the account lock. It is
-- withdrawn, and the reason is not that it was badly written. It is that in this schema the
-- transaction it names HAS NO CORRECT OUTCOME. Every line below is a measured result.
--
-- THE SHAPE OF THE PROBLEM. accounts.owner_user_id is two things at once: who runs the
-- account, and whose subscription pays for it. public.entitlements, public.account_sku_limit
-- and public.account_editor_seat_limit all resolve an account's allowance by joining
-- accounts.owner_user_id to public.brand_memberships. Moving the first meaning moves the
-- second, and Stripe does not follow.
--
--   (a) TRANSFER TO A MEMBER WITH NO brand_memberships ROW — which is every invited
--       teammate, because a teammate is provisioned by accept_account_invite and never by
--       ensure_account — silently strips the account of its plan. On a consultant account
--       with sku_limit deliberately set to 2:
--
--         BEFORE  the SKU meter is enforcing            P0001 / sku_limit_reached
--         BEFORE  account_entitlement                   plan consultant, active true,
--                                                       sku_limit 2, editor_seat_limit 10
--         transfer owner -> admin                       'transferred'
--         AFTER   account_entitlement, the new owner    plan null, active false,
--                                                       sku_limit null, editor_seat_limit null
--         AFTER   public.entitlements, the OLD owner    plan consultant, active true,
--                                                       account_id NULL
--         AFTER   seven more products inserted past a limit of two, all accepted, because
--                 sku_within_limit fails OPEN on a null limit — which is the correct ruling
--                 for retained access and the wrong one for an allowance that just vanished.
--         AFTER   even service_role adding one editor   P0001, "using all 1 of its editor
--                                                       seats", because the seat ceiling
--                                                       correctly fails CLOSED on the same
--                                                       null. The account can never grow again.
--
--       So one committed statement gave an account unlimited SKUs, blanked the plan every
--       member's app renders from, froze its head count forever, and left Stripe billing a
--       person the account no longer resolves to.
--
--   (b) TRANSFER TO A MEMBER WHO DOES HAVE A brand_memberships ROW is refused by the schema:
--       public.accounts carries `unique (owner_user_id, brand_slug)` and every person with a
--       membership already owns an account, because ensure_account is called from both
--       provisioning paths. Measured: 23505, duplicate key value violates unique constraint
--       "accounts_owner_user_id_brand_slug_key", with no partial write.
--
--   THOSE TWO CASES ARE EXHAUSTIVE. A member either has a membership row or has not.
--
--   (c) AND THE FUNCTION WAS ALSO THE ONE PLACE THE BRAND GATE DID NOT REACH. account_rank
--       gates every read and write on the ACCOUNT OWNER's brand_memberships.status, which is
--       the single lever 20260803120000 section 9 relies on to suspend a customer. The
--       transfer checked accounts.owner_user_id and account_members.role and never joined
--       brand_memberships, so the one function able to move the gate's key was the one
--       function that did not consult the gate:
--
--         suspended owner: rank / is_member_of        null / false
--         suspended owner reads their account         0 rows
--         suspended owner writes                      42501
--         SUSPENDED OWNER CALLS transfer_account_ownership   'transferred'
--         the same person, now admin: rank            30, is_member_of true
--         the same person writes                      1 row
--         brand_memberships row                       still 'suspended'
--
--   (d) AND IT WAS HALF OF AN UNBOUNDED SEAT FARM. Shedding an account with (a) and then
--       re-running complete_oauth_signup — whose repair path calls ensure_account, which is
--       idempotent on (owner_user_id, brand_slug) and therefore sees a payer who has just
--       given ownership away as brand new — minted a fresh account carrying the SAME
--       allowance. Measured over three cycles on ONE studio subscription of three seats:
--       ten seat-consuming active members, all able to write, and the attacker still admin in
--       every shed account. Nothing bounded the loop.
--
-- WHY IT IS NOT REPAIRED IN PLACE. The obvious repairs each fail on their own terms. Refusing
-- a target with no membership row plus refusing one who already owns an account leaves no
-- admissible target at all, by (a) and (b) together. Moving the brand_memberships row along
-- with the account hands the incoming owner the outgoing owner's stripe_customer_id, so the
-- new owner administers somebody else's Stripe subscription, and it re-attributes that
-- person's recorded Terms acceptance to a different human, which a compliance product cannot
-- do. Keying the allowance on the account instead of on its owner is the real answer and it
-- is a schema change to public.accounts and to apply_stripe_entitlement, not a change to this
-- function.
--
-- SO OWNERSHIP DOES NOT MOVE. The two halves of section 5 are what say so structurally: the
-- single-active-owner index is not deferrable, so no sequence of client requests can promote
-- a second owner, and the owner floor refuses a commit that leaves the account without one.
-- Handing a business over is a support operation with a Stripe change beside it, it is listed
-- in src/content/availability.ts as not built, and the team screen says so on the owner's own
-- row. That is a smaller product than an RPC that appears to work; it is the one that does
-- not corrupt an account.
--
-- The drop is unconditional and idempotent so that a database which received the earlier
-- draft loses the function on re-apply. Section 11 asserts it is gone.
drop function if exists public.transfer_account_ownership(uuid, uuid);


-- ---------------------------------------------------------------------------
-- 9. THE READ SURFACE, WHICH IS WHERE SEATS WOULD OTHERWISE HAVE SHIPPED BROKEN.
--
-- THIS IS THE FINDING THAT MATTERS MOST IN THE WHOLE FILE. public.entitlements is keyed by
-- OWNERSHIP: it selects `from public.brand_memberships m`, is security_invoker, the only
-- SELECT policy on brand_memberships is `auth.uid() = user_id`, and the account is resolved
-- by a lateral on `owner_user_id = m.user_id`. src/lib/membership.ts:452-464 is the app's
-- ONLY source of an account id and of plan state, and it reads exactly that view.
--
-- Measured on a live chain: an ACTIVE INVITED EDITOR selecting from public.entitlements gets
-- ZERO ROWS. Their app renders the no-membership screen. Every invited member would be
-- locked out of the product they were invited to, which means seats would have shipped broken
-- for precisely the people they are sold to.
--
-- WIDENING THE VIEW IS NOT THE FIX. Making it return non-owners would put one person's plan,
-- Stripe status and billing state onto another person's row. Membership identity and the
-- allowance are two different questions with two different keys, so they get two functions:
-- my_accounts() answers "which accounts am I in", keyed on auth.uid(); account_entitlement()
-- answers "what does THIS ACCOUNT allow", keyed on the account.
--
-- FUNCTIONS RATHER THAN AN OWNER-RIGHTS VIEW. The alternative is a view with
-- security_invoker = false, and its own tradeoff is fatal: the column list becomes a
-- load-bearing, invisible security boundary, where somebody adding stripe_customer_id to the
-- select is a billing-data leak with no policy in the way. public.get_entitlement is already
-- a SECURITY DEFINER function, so this is the existing convention rather than a second and
-- opposite one, and a function can carry an explicit is_member_of guard that a test attacks
-- directly.
--
-- `create or replace function` CANNOT LATER CHANGE A RETURN TYPE (20260802120000:260), so
-- the column lists below are a commitment: adding a column later means DROP and re-CREATE,
-- which means re-granting. That is why sku_count, sku_unlimited and can_modify are here even
-- though the design's field list omitted them — the view the app is moving off carries all
-- three, and shipping without them would silently blank the SKU meter for every member.
-- ---------------------------------------------------------------------------
create or replace function public.my_accounts()
returns table (
  account_id   uuid,
  brand        text,
  account_name text,
  role         text,
  role_rank    integer,
  role_label   text,
  is_owner     boolean,
  joined_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id,
    a.brand_slug,
    a.name,
    am.role,
    r.rank,
    r.label,
    a.owner_user_id = am.user_id,
    am.created_at
  from public.account_members am
  join public.accounts      a on a.id  = am.account_id
  join public.account_roles r on r.role = am.role
  left join public.brand_memberships bm
    on bm.user_id    = a.owner_user_id
   and bm.brand_slug = a.brand_slug
  where am.user_id = auth.uid()
    and am.status  = 'active'
    and coalesce(bm.status, 'active') = 'active'
  order by a.created_at;
$$;

comment on function public.my_accounts() is
  'Every account the CALLER is an active member of, with the role they hold in each. Takes no argument, so it is not a probe. This is the app''s source of account identity: public.entitlements cannot be, because it is keyed by ownership through brand_memberships and returns ZERO ROWS for an invited member — measured, and it is why repointing the client is not optional. Mirrors is_member_of exactly, including the brand-standing gate, so an account this returns is one the caller can actually act in.';

revoke all     on function public.my_accounts() from public, anon;
grant  execute on function public.my_accounts() to authenticated, service_role;

create or replace function public.account_entitlement(p_account_id uuid)
returns table (
  brand                text,
  account_id           uuid,
  business_name        text,
  membership_status    text,
  plan                 text,
  plan_status          text,
  active               boolean,
  current_period_end   timestamptz,
  cancel_at_period_end boolean,
  trial_end            timestamptz,
  sku_limit            integer,
  sku_unlimited        boolean,
  sku_count            integer,
  can_modify           boolean,
  editor_seat_limit    integer,
  seats_in_use         integer,
  caller_role          text,
  caller_rank          integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.brand_slug,
    a.id,
    m.business_name,
    m.status,
    m.plan,
    m.plan_status,
    public.entitlement_is_active(m.status, m.plan, m.plan_status, m.current_period_end),
    m.current_period_end,
    m.cancel_at_period_end,
    m.trial_end,
    m.sku_limit,
    public.sku_is_unlimited(m.sku_limit),
    (select count(*)::integer
       from batchlabel.products p
      where p.account_id = a.id and p.archived_at is null),
    public.sku_within_limit(
      (select count(*)::integer
         from batchlabel.products p
        where p.account_id = a.id and p.archived_at is null),
      m.sku_limit),
    m.editor_seat_limit,
    public.account_seats_in_use(a.id),
    cm.role,
    r.rank
  from public.accounts a
  join public.account_members cm
    on cm.account_id = a.id and cm.user_id = auth.uid() and cm.status = 'active'
  join public.account_roles r on r.role = cm.role
  -- LEFT, because an account whose owner has no membership row must still resolve: the
  -- allowance columns come back null, which every reader already treats as unknown.
  left join public.brand_memberships m
    on m.user_id    = a.owner_user_id
   and m.brand_slug = a.brand_slug
  -- THE GUARD THAT MAKES SECURITY DEFINER SAFE. Belt as well as braces: the join above
  -- already requires an active membership row for the caller, and this adds the brand
  -- standing gate and states the rule in the form a test can attack directly.
  where a.id = p_account_id
    and public.is_member_of(p_account_id);
$$;

comment on function public.account_entitlement(uuid) is
  'The allowance and plan state for ONE account, for a caller who is a member of it, plus that caller''s own role and rank and the account''s seat usage. Returning the OWNER''s allowance to any member is correct: the allowance belongs to the account, not to the person sitting in it. Reuses entitlement_is_active, sku_is_unlimited and sku_within_limit so no definition of "active" or "within limit" is duplicated. Returns zero rows for a stranger. Replaces public.entitlements as the app''s read, because that view is keyed by ownership and returns nothing at all for an invited member.';

revoke all     on function public.account_entitlement(uuid) from public, anon;
grant  execute on function public.account_entitlement(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 10. TWO MISSING require_account_id TRIGGERS, AND A CORRECTION TO THE FILE THAT SKIPPED THEM.
--
-- 20260804130000 section 11 deliberately omitted business_identity and workspace_preferences
-- from the require_account_id list, on the stated ground that "account_id is their PRIMARY KEY
-- with no default, so an omitted column is a 23502 that already names the column, and a
-- trigger would replace a precise error with a vaguer one."
--
-- THAT IS NOT WHAT HAPPENS. Measured, as a real signed-in user against the live chain:
--
--   insert into batchlabel.business_identity (registered_name) values ('x')
--     -> 42501, new row violates row-level security policy for table "business_identity"
--   insert into batchlabel.workspace_preferences (default_market) values ('uk')
--     -> 42501, new row violates row-level security policy for table "workspace_preferences"
--
-- The NOT NULL is never reached, for exactly the reason 20260803120000:1155-1165 already
-- documents: PostgreSQL evaluates the RLS WITH CHECK expression BEFORE it checks table
-- constraints. So the two tables the app writes the printed business identity into were the
-- two where "you have no account yet" and "that is not your account" were indistinguishable —
-- the precise condition require_account_id exists to remove, on the screen a maker meets
-- first.
--
-- account_members deliberately gets no such trigger: it is not client-inserted at all.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['business_identity', 'workspace_preferences'] loop
    execute format('drop trigger if exists %I on batchlabel.%I', t || '_account_required', t);
    execute format('create trigger %I before insert on batchlabel.%I for each row execute function public.require_account_id()',
                   t || '_account_required', t);
  end loop;
end
$$;


-- ---------------------------------------------------------------------------
-- 10b. SIX UNIQUE KEYS THAT LEAKED ACROSS ACCOUNTS, BECAUSE A COLLISION IS AN ANSWER.
--
-- Nothing in this section is about roles or seats. It is here because the same survey that
-- produced this file reproduced a cross-account disclosure that no policy in the schema can
-- close, and shipping the seat work without it would leave the sharper hole open.
--
-- THE ORDERING. PostgreSQL evaluates an INSERT as: RLS WITH CHECK, then the heap and unique
-- index insert (23505), then the account-scoped foreign key (23503). Six of the domain
-- tables carried a unique key on a PARENT uuid with no account_id in it. So an attacker sets
-- account_id to THEIR OWN account, which RLS is happy with, and a parent id belonging to
-- somebody else. The global unique index collides against the victim's row and raises 23505
-- BEFORE the composite foreign key that carries account_id gets to raise 23503. The pair of
-- codes is a one-bit oracle, and it needs only the anon key and an ordinary user JWT.
--
-- REPRODUCED END TO END by a FORMER editor of the victim account, status = 'removed', holding
-- nothing but their own free account and the uuids they remember:
--
--   ex-member is_member_of(victim)     false
--   ex-member SELECT victim materials  0 rows
--   ex-member SELECT victim hazards    0 rows
--   enumerating CLP codes against material_hazards (material_id, code):
--     H317 -> 23505, H400 -> 23505, H411 -> 23505, everything else -> 23503
--     reconstructed hazard profile: H317, H400, H411
--     ground truth in the database:  H317, H400, H411
--   enumerating versions against artefacts (product_id, artefact_type, version):
--     1..5 -> 23505, 6..8 -> 23503
--     inferred highest existing revision: 5   (ground truth: 5)
--
-- A person with zero read access read a competitor's CLP classification and their label
-- revision count. That is the removed-member threat model this file's own sanction path
-- exists for.
--
-- THE FIX IS TO PUT account_id IN THE KEY, which confines a collision to rows the caller is
-- already authorised to see. It changes uniqueness for NO legitimate row: each of these
-- tables carries a composite foreign key (parent_id, account_id) to its parent, so the parent
-- id already functionally determines account_id, and (account_id, parent_id, ...) is unique
-- exactly where (parent_id, ...) was. What it removes is the ability to collide against a row
-- in another account.
--
-- NOT CLOSED BY THIS, AND SAID RATHER THAN LEFT TO BE FOUND. The primary key is the same
-- shape: `authenticated` holds INSERT on every column including id, so inserting a chosen id
-- distinguishes 23505 from success and confirms that a uuid the caller ALREADY HOLDS is a row
-- of that type. It carries no content, it discloses nothing the holder of the uuid did not
-- have, and closing it means column-level INSERT grants on fourteen tables where a column
-- added later and not added to the grant is a 42501 in front of a customer. The trade is
-- deliberate: the content-bearing oracle is closed, the existence one is documented.
--
-- material_allergens stays an INDEX rather than a constraint because its key contains
-- lower(name) and a UNIQUE table constraint may not contain an expression (20260804130000:686).
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('material_hazards',            'material_hazards_material_id_code_key',
       'unique (account_id, material_id, code)'),
      ('material_ifra_limits',        'material_ifra_limits_material_id_category_key',
       'unique (account_id, material_id, category)'),
      ('specification_material_pins', 'specification_material_pins_specification_id_role_slot_key',
       'unique (account_id, specification_id, role, slot)'),
      ('artefacts',                   'artefacts_product_id_artefact_type_version_key',
       'unique (account_id, product_id, artefact_type, version)'),
      ('record_event_artefacts',      'record_event_artefacts_record_event_id_artefact_id_key',
       'unique (account_id, record_event_id, artefact_id)')
    ) as t(tbl, con, def)
  loop
    execute format('alter table batchlabel.%I drop constraint if exists %I', r.tbl, r.con);
    execute format('alter table batchlabel.%I add constraint %I %s', r.tbl, r.con, r.def);
  end loop;
end
$$;

drop index if exists batchlabel.material_allergens_material_name_uidx;
create unique index if not exists material_allergens_material_name_uidx
  on batchlabel.material_allergens (account_id, material_id, lower(name));

comment on index batchlabel.material_allergens_material_name_uidx is
  'One row per allergen name per material, case-insensitively. account_id leads the key not for uniqueness (the composite foreign key to materials already makes material_id determine it) but so that a collision can only happen inside the caller''s own account: without it, an INSERT naming the caller''s account and another account''s material_id raised 23505 before the foreign key could raise 23503, and the difference between those two codes reconstructed a competitor''s allergen list.';


-- ---------------------------------------------------------------------------
-- 10c. current_account_id STOPS DISAGREEING WITH my_accounts ABOUT WHO IS A MEMBER.
--
-- public.my_accounts() and public.is_member_of() both gate on the account owner's brand
-- standing (`coalesce(bm.status, 'active') = 'active'`), which is the single lever
-- 20260803120000 section 9 relies on to suspend a customer. public.current_account_id() did
-- not. So a person sitting in two accounts, one of which is suspended at the brand level, was
-- ONE account to the app and TWO to the column default:
--
--   my_accounts()        [{ account_name: 'Good Co', role: 'editor' }]
--   current_account_id() null
--   an insert omitting account_id
--     -> P0001, hint = account_ambiguous, "you are a member of more than one"
--
-- One row from my_accounts is the branch in src/lib/active-account.tsx that renders no
-- switcher at all, so the customer is told they are in several accounts by a database that
-- has just told the app they are in one, and there is no action available to them.
--
-- THIS IS NOT TEACHING IT TO DISAMBIGUATE. The comment forbidding that is about choosing
-- between two accounts the caller can use, and it is preserved word for word below. This is
-- about not counting one they cannot. One left join and one coalesce, copied from
-- public.account_rank so the three cannot drift.
-- ---------------------------------------------------------------------------
create or replace function public.current_account_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  -- array_agg rather than min: Postgres has no min(uuid), and this failed to apply at all
  -- until a rehearsal against a real server caught it. The guard is count(*) = 1, so the
  -- aggregate only ever holds one element — it is picking the single row, not choosing
  -- between several.
  select case when count(*) = 1 then (array_agg(am.account_id))[1] end
    from public.account_members am
    join public.accounts a on a.id = am.account_id
    left join public.brand_memberships bm
      on bm.user_id    = a.owner_user_id
     and bm.brand_slug = a.brand_slug
   where am.user_id = auth.uid()
     and am.status  = 'active'
     and coalesce(bm.status, 'active') = 'active';
$$;

comment on function public.current_account_id() is
  'The caller''s account when they have exactly one usable active membership, and NULL when they have none or more than one. The column default for account_id on every account-scoped table, so an insert cannot name an account the caller is not in. This function will not be taught to disambiguate: when a person is in two accounts the app has to say which one it means, and public.require_account_id turns the NULL into P0001 with hint = account_ambiguous rather than a bare policy refusal. It DOES consult the account owner''s brand standing, exactly as is_member_of and my_accounts do, because an account frozen at the brand level is not one of the two the caller is choosing between; before that join it reported ambiguity to people the app was correctly showing a single account.';

revoke all     on function public.current_account_id() from public, anon;
grant  execute on function public.current_account_id() to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 11. BEHAVIOURAL ASSERTIONS, RUN AT APPLY TIME.
--
-- supabase/tests now exists and proves the two-identity rules against a real PGlite. That
-- suite is where the attack scenarios live. THIS block asserts the properties that must hold
-- ON THE DATABASE BEING APPLIED TO, because the harness runs PostgreSQL 18 while
-- supabase/config.toml declares 17, and the single claim this whole design rests on —
-- a constraint trigger does not run for a row RLS refuses — is exactly the class of behaviour
-- that can move between majors. A green CI run is not evidence about production; a DO block
-- that aborts the migration is.
--
-- EVERY WRITE IS INSIDE A SUB-TRANSACTION THAT IS ALWAYS ROLLED BACK. A plpgsql
-- BEGIN ... EXCEPTION block is an implicit sub-transaction, so raising a sentinel at the end
-- discards every row and every object created inside it. Variable assignments are not
-- transactional and survive, which is how the results get out.
-- ---------------------------------------------------------------------------
do $$
declare
  v_n        integer;
  v_txt      text;
  v_ok       boolean;
  v_account  uuid;
  v_owner    uuid;
  v_other    uuid;
  v_brand    text;

  -- Collected inside the rolled-back probes, read after them.
  v_ordering_ran     boolean := false;
  v_stranger_code    text;
  v_stranger_msg     text;
  v_member_hint      text;
  v_seats_ran        boolean := false;
  v_seat_refused     text;
  v_viewer_admitted  boolean := false;
  v_demote_allowed   boolean := false;
  v_provision_owners integer := -1;
begin
  -- --- The matrix is present, complete and ordered --------------------------------
  select count(*) into v_n from public.account_roles;
  if v_n < 4 then
    raise exception 'member_roles_and_seats: account_roles holds % rows; the four ratified roles must all be seeded.', v_n
      using errcode = '22023';
  end if;

  if (select count(*) from public.account_roles where role in ('viewer','editor','admin','owner')) <> 4 then
    raise exception 'member_roles_and_seats: one of viewer/editor/admin/owner is missing from account_roles.'
      using errcode = '22023';
  end if;

  -- The ladder, in order. A matrix whose ranks do not ascend is one where an admin cannot do
  -- what an editor can, and every capability lookup would be quietly wrong.
  if not (
    (select rank from public.account_roles where role = 'viewer') <
    (select rank from public.account_roles where role = 'editor') and
    (select rank from public.account_roles where role = 'editor') <
    (select rank from public.account_roles where role = 'admin')  and
    (select rank from public.account_roles where role = 'admin')  <
    (select rank from public.account_roles where role = 'owner')
  ) then
    raise exception 'member_roles_and_seats: the role ranks do not ascend viewer < editor < admin < owner.'
      using errcode = '22023';
  end if;

  -- Read-only is free; the other three are billed. This is the ONLY place in the system that
  -- knows which is which, so it is the only place that can be asserted.
  if (select consumes_seat from public.account_roles where role = 'viewer') then
    raise exception
      'member_roles_and_seats: viewer consumes a seat. Read-only seats are free and unlimited on every tier (20260802120000:74-75); billing them would make the external competent person a paid seat and push makers back onto sharing a login.'
      using errcode = '22023';
  end if;
  if (select count(*) from public.account_roles where role in ('editor','admin','owner') and not consumes_seat) > 0 then
    raise exception 'member_roles_and_seats: a role that can write does not consume a seat. Seats are billed on edit permission.'
      using errcode = '22023';
  end if;

  -- --- can() fails closed on a name that does not exist ---------------------------
  if public.can(gen_random_uuid(), 'nonsense_capability') then
    raise exception 'member_roles_and_seats: can() returns true for an unknown capability. A typo in a policy would grant rather than refuse.'
      using errcode = '22023';
  end if;

  -- --- Every capability a policy names actually exists ----------------------------
  -- The other half of the sentence above: failing closed on a typo is only safe if a typo is
  -- also loud. Extracts the literal out of every policy expression and checks the table.
  select count(*) into v_n
    from (
      select distinct (regexp_matches(
               coalesce(p.qual, '') || ' ' || coalesce(p.with_check, ''),
               'can\(account_id, ''([a-z_]+)''', 'g'))[1] as capability
        from pg_policies p
       where p.schemaname in ('public', 'batchlabel')
    ) used
   where not exists (select 1 from public.account_capabilities c where c.capability = used.capability);
  if v_n > 0 then
    raise exception
      'member_roles_and_seats: % capability name(s) used in a policy do not exist in account_capabilities. can() returns false for them, so those tables are refusing everybody including the owner.', v_n
      using errcode = '22023';
  end if;

  -- --- THE DOCTRINE, ASSERTED ON THE SOURCE RATHER THAN ON THIS COMMENT ------------
  -- is_member_of consults status only. If a seat or plan column ever appears in a predicate
  -- helper, a lapsed customer loses access to data they already have, which is the ruling
  -- 20260803120000 section 6 exists to protect.
  select string_agg(p.proname, ', ') into v_txt
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('is_member_of', 'account_rank', 'can', 'account_role_rank')
     and p.prosrc ~* '(editor_seat_limit|plan_status|current_period_end|sku_limit|\mplan\M)';
  if v_txt is not null then
    raise exception
      'member_roles_and_seats: predicate helper(s) % read plan or allowance state. The read and write predicate must consult status ONLY, so a free, lapsed, past_due or downgraded customer keeps full access to what they already have.', v_txt
      using errcode = '22023';
  end if;

  select count(*) into v_n
    from pg_policies p
   where p.schemaname in ('public', 'batchlabel')
     and (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, ''))
         ~ '(editor_seat_limit|plan_status|current_period_end|sku_limit)';
  if v_n > 0 then
    raise exception
      'member_roles_and_seats: % policy(ies) mention plan or allowance state. The seat ceiling belongs on the consumption path, never in a row-level predicate.', v_n
      using errcode = '22023';
  end if;

  -- --- A VIEWER STILL READS ---------------------------------------------------------
  -- The 18 SELECT policies were left on is_member_of precisely so that no read regresses. If
  -- that function had been made role-aware by mistake, this is what catches it.
  if (select c.min_rank from public.account_capabilities c where c.capability = 'read')
     <> (select r.rank from public.account_roles r where r.role = 'viewer') then
    raise exception
      'member_roles_and_seats: the read capability is not set at the viewer''s rank. A viewer who cannot read is not a viewer.'
      using errcode = '22023';
  end if;

  select count(*) into v_n
    from pg_policies p
   where p.schemaname in ('public', 'batchlabel')
     and p.cmd = 'SELECT'
     and coalesce(p.qual, '') like '%is_member_of%';
  if v_n < 18 then
    raise exception
      'member_roles_and_seats: only % SELECT policies still gate on is_member_of; 18 is the census. A SELECT policy that drifted onto a capability is a viewer who can no longer see the account they were invited to review.', v_n
      using errcode = '22023';
  end if;

  -- --- The write policies landed, and the trap is avoided ---------------------------
  -- MATCHED ON `can(account_id`, NOT ON `public.can(`. pg_policies renders the call
  -- unqualified because public is in search_path, so an audit grepping for the schema-
  -- qualified name matches nothing, passes, and proves nothing.
  select count(*) into v_n
    from pg_policies p
   where p.schemaname = 'batchlabel'
     and p.cmd <> 'SELECT'
     and (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) like '%can(account_id%';
  if v_n < 37 then
    raise exception 'member_roles_and_seats: only % write policies carry a capability predicate; 37 is the census.', v_n
      using errcode = '22023';
  end if;

  -- --- No predicate helper can probe another person's membership --------------------
  select string_agg(p.oid::regprocedure::text, ', ') into v_txt
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('is_member_of', 'account_rank', 'can', 'account_role_rank',
                       'account_seats_in_use', 'account_editor_seat_limit',
                       'my_accounts', 'account_entitlement')
     and (select count(*) from unnest(p.proargtypes::oid[]) t where t = 'uuid'::regtype::oid) > 1;
  if v_txt is not null then
    raise exception
      'member_roles_and_seats: predicate helper(s) % take more than one uuid. A has_role(account_id, user_id) shape re-arms the membership probe the SECURITY DEFINER design deliberately closed (20260803120000:491).', v_txt
      using errcode = '22023';
  end if;

  -- --- ...AND THE ONE UUID IS NOT A PROBE EITHER --------------------------------------
  -- The assertion above counts arguments, which is necessary and NOT sufficient: ONE uuid,
  -- SECURITY DEFINER, no membership test in the body and an execute grant is the same probe
  -- wearing a shorter signature. The first draft of this file shipped exactly that, and the
  -- suite measured a removed member and a stranger reading another account's headcount, its
  -- plan seat ceiling, and the difference between an account that exists and one that does
  -- not. The two seat helpers answer unconditionally by design, because the seat trigger
  -- needs the true number; the conclusion is that a browser may not call them, not that they
  -- should learn to lie. Every member-facing read of these numbers is account_entitlement,
  -- which carries an is_member_of guard.
  select string_agg(p.oid::regprocedure::text, ', ') into v_txt
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('account_seats_in_use', 'account_editor_seat_limit')
     and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
          or has_function_privilege('anon', p.oid, 'EXECUTE'));
  if v_txt is not null then
    raise exception
      'member_roles_and_seats: % is executable by a browser role. It is SECURITY DEFINER, takes an account id, and consults no membership, so a grant makes it an existence oracle and a headcount and plan-tier disclosure for any account id the caller can name — measured, as a removed member and as a stranger. Members read these numbers through public.account_entitlement, which is guarded. Do not fix this by adding is_member_of to the body: the seat trigger would then read NULL and null > limit is null, which disables the ceiling silently.', v_txt
      using errcode = '22023';
  end if;

  -- --- The account_members write surface ---------------------------------------------
  select count(*) into v_n
    from information_schema.role_table_grants
   where grantee = 'authenticated' and table_schema = 'public' and table_name = 'account_members'
     and privilege_type in ('INSERT', 'DELETE');
  if v_n > 0 then
    raise exception
      'member_roles_and_seats: authenticated holds an INSERT or DELETE grant on account_members. INSERT is a client that can hand itself a colleague''s data; DELETE loses who was in the account and when, which is the audit trail a compliance product cannot discard.'
      using errcode = '22023';
  end if;

  select string_agg(column_name, ', ' order by column_name) into v_txt
    from information_schema.column_privileges
   where grantee = 'authenticated' and table_schema = 'public' and table_name = 'account_members'
     and privilege_type = 'UPDATE';
  if v_txt is distinct from 'role, status' then
    raise exception
      'member_roles_and_seats: authenticated holds UPDATE on account_members column(s) [%]; it must be exactly (role, status). A column privilege is checked BEFORE RLS is consulted, which is what makes account_id and user_id unreachable to a browser by construction rather than by policy.', coalesce(v_txt, 'none')
      using errcode = '22023';
  end if;

  -- --- The invite table gives away nothing --------------------------------------------
  if exists (
    select 1 from information_schema.column_privileges
     where grantee = 'authenticated' and table_schema = 'public' and table_name = 'account_invites'
       and column_name = 'token_hash'
  ) then
    raise exception 'member_roles_and_seats: authenticated can read account_invites.token_hash.'
      using errcode = '22023';
  end if;

  select count(*) into v_n
    from information_schema.role_table_grants
   where grantee = 'authenticated' and table_schema = 'public' and table_name = 'account_invites'
     and privilege_type in ('INSERT', 'DELETE');
  if v_n > 0 then
    raise exception
      'member_roles_and_seats: authenticated can INSERT or DELETE account_invites. Creation is service-role only so the token never transits a browser, and an invite is withdrawn rather than erased.'
      using errcode = '22023';
  end if;

  -- --- The invite mint is not an enumeration oracle -------------------------------------
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'create_account_invite') ~* 'auth\.users' then
    raise exception
      'member_roles_and_seats: create_account_invite reads auth.users. A lookup is a branch, a branch is an oracle, and no amount of matching response shapes closes it afterwards.'
      using errcode = '22023';
  end if;

  -- --- Nothing on account_members reads other rows BEFORE RLS has spoken -----------------
  -- The class this whole design refuses, asserted structurally so it cannot come back through
  -- a refactor. tgtype bit 2 is BEFORE; tgconstraint <> 0 is a constraint trigger.
  --
  -- The rule is stated as two questions rather than one, because there are now two legitimate
  -- shapes here and collapsing them would have to be relaxed rather than sharpened next time.
  -- The CHECKS (owner floor, seat ceiling) must be deferred constraint triggers, so they are
  -- unreachable for a row RLS refuses and so they see the account's final state. The one
  -- CASCADING WRITE (revoke_invites_on_sanction) must be AFTER ROW and must not be a
  -- constraint trigger: it compares nothing, it has to be visible to the seat count inside the
  -- same transaction, and AFTER is what makes it fire only for a row that was actually
  -- written. What neither may be is BEFORE.
  select string_agg(t.tgname, ', ') into v_txt
    from pg_trigger t
   where t.tgrelid = 'public.account_members'::regclass
     and not t.tgisinternal
     and t.tgname not in ('account_members_set_updated_at', 'account_members_revoke_invites')
     and (t.tgconstraint = 0 or not t.tginitdeferred or (t.tgtype & 2) = 2);
  if v_txt is not null then
    raise exception
      'member_roles_and_seats: trigger(s) % on account_members are not deferred constraint triggers. A BEFORE ROW trigger reading other rows here is the defect this schema already shipped once, and enforce_sku_limit is still living proof of the class.', v_txt
      using errcode = '22023';
  end if;

  select string_agg(t.tgname, ', ') into v_txt
    from pg_trigger t
   where t.tgrelid = 'public.account_members'::regclass
     and not t.tgisinternal
     and t.tgname = 'account_members_revoke_invites'
     and ((t.tgtype & 2) = 2 or t.tgconstraint <> 0);
  if v_txt is not null then
    raise exception
      'member_roles_and_seats: % is a BEFORE or constraint trigger. It reads auth.users and writes account_invites, so BEFORE would hand it a row RLS has not yet ruled on, and deferring it would hide the freed seat from the ceiling that runs at the same commit.', v_txt
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from pg_trigger t
     where t.tgrelid = 'public.account_members'::regclass
       and t.tgname  = 'account_members_revoke_invites'
  ) then
    raise exception
      'member_roles_and_seats: account_members_revoke_invites is missing. Without it a removed or suspended member keeps every live invite they were holding, and a token minted to their own address while they were still privileged puts them back at their old rank through accept_account_invite, which is SECURITY DEFINER and which RLS never sees. That was reproduced.'
      using errcode = '22023';
  end if;

  -- --- Ownership does not move, and there is no function that says it does ----------------
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'transfer_account_ownership'
  ) then
    raise exception
      'member_roles_and_seats: public.transfer_account_ownership exists. In this schema accounts.owner_user_id is both who runs the account and whose subscription pays for it, so moving it either strips the account of its plan (measured: sku_limit null, the SKU meter failing open, seven products past a limit of two, and the seat ceiling frozen at 1 forever) or is refused 23505 by accounts_owner_user_id_brand_slug_key. Section 8 has the full argument. Ownership is a support operation with a Stripe change beside it.'
      using errcode = '22023';
  end if;

  -- --- Removal is a status, on every path, for every role ---------------------------------
  -- The owner floor is AFTER INSERT OR UPDATE and must stay that way (a cascade delete of the
  -- parent accounts row fires child constraint triggers, so a DELETE-listening floor would
  -- make erasing an account impossible). The invariant is therefore held by making the
  -- statement unreachable. Measured before this revoke: the owner standing down by UPDATE was
  -- refused P0001/owner_floor, and the same thing by DELETE committed and left the account
  -- with zero active owners, an owner_user_id naming a non-member, and a live plan.
  select string_agg(grantee, ', ') into v_txt
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'account_members'
     and privilege_type = 'DELETE'
     and grantee in ('anon', 'authenticated', 'service_role');
  if v_txt is not null then
    raise exception
      'member_roles_and_seats: % hold DELETE on account_members. Removal is status = ''removed''; a DELETE loses who was in the account and when, and it walks straight through the owner floor, which cannot listen for DELETE without making account erasure impossible.', v_txt
      using errcode = '22023';
  end if;

  -- --- The lock-then-count argument's one premise -----------------------------------------
  -- enforce_editor_seats, enforce_sku_limit and accept_account_invite all lock the accounts
  -- row and then COUNT. That is only sound because the count takes a fresh snapshot, which is
  -- a READ COMMITTED property; under REPEATABLE READ the count would use the transaction's
  -- original snapshot and `select ... for update` on a row nobody updates raises no
  -- serialization failure, so two transactions could both come in under the ceiling. Not
  -- reachable through PostgREST, which uses the server default. Asserted so that a server
  -- where the default is something else fails here rather than silently in a bill.
  select setting into v_txt from pg_settings where name = 'default_transaction_isolation';
  if v_txt is distinct from 'read committed' then
    raise exception
      'member_roles_and_seats: default_transaction_isolation is [%]. Every seat and SKU check locks the account row and then counts, which only serialises correctly under read committed. This is the one premise of that argument and it is checked rather than assumed; the race itself is still argued and not measured, because PGlite is single-connection.', v_txt
      using errcode = '22023';
  end if;

  -- --- A unique key that omits account_id is a cross-account oracle ------------------------
  -- Reproduced: a removed member reconstructed a competitor's CLP hazard profile and label
  -- revision count from nothing but 23505-versus-23503. See section 10b.
  select string_agg(format('%s.%s', c.conrelid::regclass, c.conname), ', ') into v_txt
    from pg_constraint c
   where c.contype = 'u'
     and c.connamespace = 'batchlabel'::regnamespace
     and not exists (
       select 1 from unnest(c.conkey) k(attnum)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
       where a.attname = 'account_id')
     and exists (
       select 1 from pg_attribute a
        where a.attrelid = c.conrelid and a.attname = 'account_id' and a.attnum > 0 and not a.attisdropped);
  if v_txt is not null then
    raise exception
      'member_roles_and_seats: unique constraint(s) % are on an account-scoped table and do not contain account_id. PostgreSQL checks the unique index BEFORE the account-scoped foreign key, so a caller naming their own account_id and somebody else''s parent id gets 23505 for a row that exists and 23503 for one that does not. That is a read of another account, and no policy can close it.', v_txt
      using errcode = '22023';
  end if;

  select string_agg(format('%s.%s', i.indrelid::regclass, ci.relname), ', ') into v_txt
    from pg_index i
    join pg_class ci on ci.oid = i.indexrelid
    join pg_class ct on ct.oid = i.indrelid
   where i.indisunique
     and ct.relnamespace = 'batchlabel'::regnamespace
     and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid)
     and not exists (
       select 1 from unnest(i.indkey::smallint[]) k(attnum)
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
       where a.attname = 'account_id')
     and exists (
       select 1 from pg_attribute a
        where a.attrelid = i.indrelid and a.attname = 'account_id' and a.attnum > 0 and not a.attisdropped);
  if v_txt is not null then
    raise exception
      'member_roles_and_seats: unique index(es) % are on an account-scoped table and do not contain account_id. Same oracle as the constraint check above; an expression index is not exempt from it.', v_txt
      using errcode = '22023';
  end if;

  -- --- accept_account_invite reports what it wrote -----------------------------------------
  -- It deliberately does not always write the invited role: a stale lesser invite must not
  -- demote a sitting admin. Returning the invited role anyway made the RPC answer "you have
  -- joined as editor" to somebody the same transaction had left a viewer, and the app rendered
  -- it. The property is that the value comes back out of the row.
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'accept_account_invite')
     !~ 'returning\s+public\.account_members\.role' then
    raise exception
      'member_roles_and_seats: accept_account_invite does not read the joined role back out of account_members. It must never echo the invited role, because the conflict rule can decline to apply it and the app prints the answer to the customer.'
      using errcode = '22023';
  end if;

  -- --- FORCE ROW LEVEL SECURITY stays off, on both -----------------------------------
  if (select relforcerowsecurity from pg_class where oid = 'public.accounts'::regclass)
     or (select relforcerowsecurity from pg_class where oid = 'public.account_members'::regclass) then
    raise exception
      'member_roles_and_seats: force row level security is enabled on accounts or account_members. The SELECT policy on accounts is itself is_member_of(id), so FORCE re-arms the recursion the SECURITY DEFINER exists to defuse (20260803120000:461-466).'
      using errcode = '22023';
  end if;

  -- --- role is a reference now, and its default is the free one ------------------------
  if not exists (
    select 1 from pg_constraint
     where conname = 'account_members_role_fkey' and conrelid = 'public.account_members'::regclass
       and contype = 'f'
  ) then
    raise exception 'member_roles_and_seats: account_members.role is not a foreign key to account_roles.'
      using errcode = '22023';
  end if;

  select column_default into v_txt from information_schema.columns
   where table_schema = 'public' and table_name = 'account_members' and column_name = 'role';
  if coalesce(v_txt, '') not like '%viewer%' then
    raise exception
      'member_roles_and_seats: account_members.role defaults to [%]; it must default to the free, writes-nothing role so that an insert path which forgets the column cannot silently grant a billed seat.', coalesce(v_txt, 'null')
      using errcode = '22023';
  end if;

  -- --- The conflict target accept_account_invite names by hand actually exists ---------
  -- `on conflict (account_id, user_id)` cannot be used there: a column list resolves against
  -- the function's RETURNS TABLE output parameters first and raises 42702 AT CALL TIME. So the
  -- named constraint is load-bearing, and a rename upstream would break acceptance in front of
  -- a customer rather than here.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.account_members'::regclass
       and conname  = 'account_members_account_id_user_id_key'
  ) then
    raise exception
      'member_roles_and_seats: the unique constraint account_members_account_id_user_id_key is missing. accept_account_invite names it in its ON CONFLICT target, and a missing conflict target fails at call time rather than at apply time.'
      using errcode = '22023';
  end if;

  -- --- AND THE INVARIANT ITSELF, ON THE DATA THAT IS ALREADY THERE --------------------------
  -- The index gives at-most-one and the floor gives at-least-one from here on, but neither
  -- looks backwards, and an account that arrived ownerless (through the DELETE this file has
  -- just revoked, or through the transfer it has just withdrawn) has no symptom until somebody
  -- tries to do something only an owner can do. Cheap enough to ask on every apply.
  select count(*) into v_n
    from public.accounts a
   where not exists (
     select 1 from public.account_members am
      where am.account_id = a.id and am.user_id = a.owner_user_id
        and am.role = 'owner' and am.status = 'active');
  if v_n > 0 then
    raise exception
      'member_roles_and_seats: % account(s) have no active owner membership matching accounts.owner_user_id. That is the state a DELETE on account_members, or the withdrawn ownership transfer, could leave behind: nobody can act on billing or on the account itself, and the plan still resolves through a person who is not a member. Reinstate the owner row (role = ''owner'', status = ''active'', user_id = accounts.owner_user_id) before re-running; this file will not guess who it should be.', v_n
      using errcode = '22023';
  end if;

  -- ===================================================================================
  -- THE BEHAVIOURAL PROBES. Everything below writes, and everything below is rolled back.
  -- ===================================================================================
  select a.id, a.owner_user_id, a.brand_slug into v_account, v_owner, v_brand
    from public.accounts a
    join public.account_members am on am.account_id = a.id and am.user_id = a.owner_user_id
   where am.status = 'active'
   order by a.created_at
   limit 1;

  -- --- PROBE 1: the ordering claim the whole design rests on ---------------------------
  -- Re-proved here rather than trusted from CI: a deferred constraint trigger does NOT run
  -- for a row RLS refuses, while it DOES run for one RLS admits. If that ever reverses, every
  -- seat check becomes a SECURITY DEFINER oracle for somebody else's account.
  --
  -- Skipped rather than failed when the applying role cannot `set role authenticated` — on a
  -- database where that is not grantable the probe is impossible, and a migration that aborts
  -- because it could not run its own test is worse than one that says so.
  if v_account is not null and pg_has_role(current_user, 'authenticated', 'MEMBER') then
    begin
      create table public.__seat_ordering_probe (
        id         uuid primary key default gen_random_uuid(),
        account_id uuid not null
      );
      alter table public.__seat_ordering_probe enable row level security;
      execute 'create policy "probe" on public.__seat_ordering_probe for insert with check (public.can(account_id, ''write_data''))';
      grant insert on public.__seat_ordering_probe to authenticated;

      execute $probe$
        create or replace function public.__seat_ordering_probe_fn() returns trigger
        language plpgsql as $fn$
        begin
          raise exception using errcode = 'P0001',
            message = 'PROBE TRIGGER BODY RAN',
            hint    = 'probe_trigger_ran';
        end $fn$;
      $probe$;

      create constraint trigger probe_ceiling
        after insert on public.__seat_ordering_probe
        deferrable initially deferred
        for each row execute function public.__seat_ordering_probe_fn();

      -- (a) A stranger naming somebody else's account. RLS must refuse, and the trigger body
      --     must never see the account id.
      set local role authenticated;
      perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
      perform set_config('request.jwt.claim.role', 'authenticated', true);
      begin
        insert into public.__seat_ordering_probe (account_id) values (v_account);
        set constraints all immediate;
        v_stranger_code := 'not refused at all';
      exception when others then
        v_stranger_code := sqlstate;
        v_stranger_msg  := sqlerrm;
      end;
      reset role;

      -- (b) A real member of that account. The trigger must fire, or (a) proves nothing: a
      --     trigger that never runs would pass the first half trivially.
      set local role authenticated;
      perform set_config('request.jwt.claim.sub', v_owner::text, true);
      perform set_config('request.jwt.claim.role', 'authenticated', true);
      begin
        insert into public.__seat_ordering_probe (account_id) values (v_account);
        set constraints all immediate;
        v_member_hint := 'trigger did not fire';
      exception when others then
        v_member_hint := sqlerrm;
      end;
      reset role;

      v_ordering_ran := true;
      raise exception 'rollback the ordering probe' using errcode = '22023';
    exception when others then
      if sqlerrm <> 'rollback the ordering probe' and not v_ordering_ran then
        raise notice 'member_roles_and_seats: the ordering probe could not run (%). It is proved in supabase/tests instead.', sqlerrm;
      end if;
    end;
  end if;

  if v_ordering_ran then
    if v_stranger_code <> '42501' then
      raise exception
        'member_roles_and_seats: on THIS Postgres a deferred constraint trigger is reached for a row RLS refuses (stranger got % / %). The seat trigger would then be a SECURITY DEFINER oracle for another account, which is the defect this schema already shipped once.',
        v_stranger_code, coalesce(v_stranger_msg, '')
        using errcode = '22023';
    end if;
    if v_stranger_msg like '%PROBE TRIGGER BODY RAN%' then
      raise exception 'member_roles_and_seats: the constraint trigger body ran for a refused row.'
        using errcode = '22023';
    end if;
    if v_member_hint not like '%PROBE TRIGGER BODY RAN%' then
      raise exception
        'member_roles_and_seats: the constraint trigger did NOT fire for a legitimate member (%). A trigger that never runs would pass the refusal half of this probe while enforcing nothing.', v_member_hint
        using errcode = '22023';
    end if;
    raise notice 'member_roles_and_seats: ordering re-proved here — stranger 42501 with the trigger body unreached, member reached the body.';
  end if;

  -- --- PROBE 2: the ceiling binds, the free role does not, and demotion always works ------
  if v_account is not null then
    select u.id into v_other
      from auth.users u
     where not exists (
       select 1 from public.account_members am
        where am.account_id = v_account and am.user_id = u.id)
     limit 1;

    if v_other is not null then
      begin
        -- Force the ceiling to the column's own floor, so the probe is deterministic on an
        -- account of any plan. Rolled back with everything else.
        update public.brand_memberships
           set editor_seat_limit = 1
         where user_id = v_owner and brand_slug = v_brand;

        -- A seat-consuming role over the ceiling: refused, and the hint is the stable token
        -- the app matches on.
        begin
          insert into public.account_members (account_id, user_id, role, status)
          values (v_account, v_other, 'editor', 'active');
          set constraints all immediate;
          v_seat_refused := 'not refused';
        exception when others then
          -- THE HINT, NOT THE SENTENCE. The message is customer-facing copy and will be
          -- rewritten; the hint is the stable token the app matches on, so asserting the hint
          -- is asserting the contract. It also stops an unrelated failure inside the trigger
          -- from reading as a successful refusal — which is exactly what happened once here.
          get stacked diagnostics v_seat_refused = pg_exception_hint;
          v_seat_refused := coalesce(nullif(v_seat_refused, ''), 'no hint: ' || sqlerrm);
        end;

        -- The free role, on the same over-limit account: admitted. Seats are billed on edit
        -- permission and never on account existence.
        begin
          insert into public.account_members (account_id, user_id, role, status)
          values (v_account, v_other, 'viewer', 'active');
          set constraints all immediate;
          v_viewer_admitted := true;
        exception when others then
          v_viewer_admitted := false;
        end;

        -- ...and on that same over-limit account, a demotion still commits. This is the
        -- downgrade rule: block new consumption, strip nobody.
        begin
          update public.account_members set role = 'viewer'
           where account_id = v_account and user_id = v_other;
          set constraints all immediate;
          v_demote_allowed := true;
        exception when others then
          v_demote_allowed := false;
        end;

        -- Provisioning still works under the new default, the new foreign key and the owner
        -- floor. ensure_account is the only writer of account_members today and it would be a
        -- poor discovery to make on a real signup.
        perform public.ensure_account(v_owner, v_brand, 'probe');
        select count(*)::integer into v_provision_owners
          from public.account_members am
         where am.account_id = v_account and am.role = 'owner' and am.status = 'active';

        v_seats_ran := true;
        raise exception 'rollback the seat probe' using errcode = '22023';
      exception when others then
        if sqlerrm <> 'rollback the seat probe' and not v_seats_ran then
          raise notice 'member_roles_and_seats: the seat probe could not run (%).', sqlerrm;
        end if;
      end;
    end if;
  end if;

  if v_seats_ran then
    if v_seat_refused is distinct from 'seat_limit_reached' then
      raise exception
        'member_roles_and_seats: an editor over the seat ceiling was not refused with hint = seat_limit_reached (got: %). Nothing counted seats before this file and the whole point of it is that something does now.', v_seat_refused
        using errcode = '22023';
    end if;
    if not v_viewer_admitted then
      raise exception
        'member_roles_and_seats: a VIEWER was refused on an over-limit account. Read-only seats are free and unlimited on every plan; metering them is the failure the consumes_seat column exists to prevent.'
        using errcode = '22023';
    end if;
    if not v_demote_allowed then
      raise exception
        'member_roles_and_seats: a demotion was refused on an over-limit account. The downgrade rule is block new consumption and strip nobody, so an account over its ceiling must still be able to demote, suspend and remove.'
        using errcode = '22023';
    end if;
    if v_provision_owners <> 1 then
      raise exception
        'member_roles_and_seats: ensure_account no longer produces exactly one active owner (found %) under the new default, foreign key and owner floor.', v_provision_owners
        using errcode = '22023';
    end if;
    raise notice 'member_roles_and_seats: seat ceiling proved here — editor refused, viewer admitted, demotion allowed, provisioning intact.';
  end if;

  -- --- Nothing durable was left behind ------------------------------------------------
  if to_regclass('public.__seat_ordering_probe') is not null then
    raise exception 'member_roles_and_seats: the ordering probe table survived. Its sub-transaction did not roll back.'
      using errcode = '22023';
  end if;
  if exists (select 1 from public.account_invites) then
    raise notice 'member_roles_and_seats: account_invites is not empty; this file created none.';
  end if;
end
$$;
