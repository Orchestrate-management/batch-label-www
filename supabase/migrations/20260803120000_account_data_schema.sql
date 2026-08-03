-- Accounts, specifications, products: real per-account data, and the end of the
-- in-memory prototype.
--
-- =============================================================================
-- THE CONTRACT FOR THE APP WORKSTREAM. Read this block; it is the interface.
-- =============================================================================
--
-- Every table below is keyed on `account_id`. NOTHING is keyed on `user_id`. An app
-- that writes `user_id` will not compile against this schema, which is the point.
--
--   public.accounts
--     id             uuid  pk
--     brand_slug     text  not null -> public.brands.slug
--     owner_user_id  uuid  not null -> auth.users.id
--     name           text            (the business name; seeded from the membership)
--     data           jsonb not null default '{}'
--     created_at, updated_at  timestamptz not null
--     READ ONLY to the browser. Created by the provisioning path, never by the client.
--
--   public.account_members
--     id, account_id, user_id, role, status, invited_by, created_at, updated_at
--     role   in ('owner','admin','editor','viewer')  default 'editor'
--     status in ('active','suspended','removed')     default 'active'
--     unique (account_id, user_id)
--     READ ONLY to the browser. One row today: the owner. Invites are deferred.
--
--   public.specifications      -- THE COMPOSITION. One row per recipe.
--     id                uuid    pk
--     account_id        uuid    not null -> accounts.id   (default current_account_id())
--     name              text    not null
--     category_id       text    not null  'home-fragrance' | 'cosmetics' | 'electronics'
--     kind              text    not null  'mixture' | 'phased' | 'bom'   (= Spec.kind)
--     product_type      text
--     fragrance_id      text            \
--     base_id           text             |  the four inputs deriveMixture() reads.
--     dye_id            text             |  Typed, not buried in jsonb, because
--     load              numeric(6,3)    /   §1.3c's variant guard is a check on them.
--     additive          text
--     markets           text[]  not null default '{GB}'
--     regimes           text[]  not null default '{}'
--     ufi               text            -- THE UFI LIVES HERE, NOT ON A PRODUCT (§1.2)
--     data              jsonb   not null default '{}'
--     version           integer not null default 1
--     archived_at       timestamptz
--     created_by        uuid            default auth.uid()
--     created_at, updated_at
--     SELECT / INSERT / UPDATE for members. No DELETE grant — see section 7.
--
--   public.products           -- THE SKU. recipe x pack size x packaging.
--     id                uuid    pk
--     account_id        uuid    not null -> accounts.id   (default current_account_id())
--     specification_id  uuid    not null -> specifications.id  (same account, enforced)
--     name              text    not null
--     sku               text            (unique per account across LIVE rows)
--     net_quantity      numeric(12,3)
--     net_unit          text            'g' | 'ml'
--     packaging_id      text
--     identifiers       jsonb   not null default '{}'   -- model / weee_registration /
--                                                       -- model_year. NEVER ufi.
--     obligations       jsonb   not null default '{}'
--     data              jsonb   not null default '{}'
--     archived_at       timestamptz
--     created_by        uuid            default auth.uid()
--     created_at, updated_at
--     SELECT / INSERT / UPDATE / DELETE for members.
--
-- Functions the app may call:
--   public.current_account_id()  -> uuid    the caller's account when they have exactly
--                                           one; NULL when none or ambiguous. It is the
--                                           column default, so an insert may omit
--                                           account_id entirely. Prefer passing
--                                           entitlements.account_id explicitly.
--   public.is_member_of(uuid)    -> boolean the RLS predicate, callable for UI checks.
--
-- Read surface (public.entitlements / public.get_entitlement) gains, this migration:
--   account_id   NOW RESOLVES TO accounts.id. It used to be aliased from user_id
--                (20260802120000 section 8 said only this expression would change, and
--                this is that change). It is NOT auth.uid(). Do not assume it is.
--   sku_count    live (archived_at is null) products for the account. integer.
--   can_modify   false exactly when the SKU trigger would refuse a new product.
--
-- ARTEFACTS AND RECORDS ARE NOT HERE. Artefacts are derived and "can never be made by
-- hand" (products.ts:531); records are the batch log. Both are additive later and
-- neither is metered. This migration creates only what the founder's sentence needs:
-- a virgin account, and a product that is really created when you create it.
--
-- =============================================================================
--
-- WHY account_id AND NOT user_id
--
-- Team support is deferred, not cancelled. Today every account has exactly one member,
-- so an `account_id` column and a `user_id` column would hold the same value and the
-- indirection looks like ceremony. It is the opposite. PRICING_RESEARCH.md §5.3: if
-- these tables key on user_id, adding a second person later means backfilling an
-- account_id onto live customer data while every RLS policy, every query and every
-- insert path changes underneath it — a migration project, not a feature. Keyed on
-- account_id from the start, seats become an invite flow plus a count.
--
-- 20260802120000 section 8 committed to the name in advance, so that this file could be
-- written without renaming anything.
--
-- WHY TWO TABLES AND NOT ONE
--
-- PRICING_RESEARCH.md §1.3b. A Product is uniquely recipe x pack size x packaging; every
-- expensive derivation (CLP classification, allergens, the 16-section SDS, which regimes
-- apply) reads only fragrance/base/dye/load and is identical across pack sizes; and the
-- UFI belongs to the composition, not the pack (§1.2 — one UFI per Product would push a
-- maker into three poison-centre notifications where one is correct). Shipping one flat
-- table means deduplicating live customer rows on four columns later. It costs a join
-- now. That is the whole trade, and §1.3b calls it a cheap hedge worth taking whatever
-- the pricing decision turns out to be.
--
-- WHAT THIS DOES NOT DO
--
--   * No invites, no seat UI, no seat enforcement. Just the shape (§5.3 step 1).
--   * No fixture data. Ever. See section 8: a new account starts empty, by construction,
--     and there is no code path in this file that inserts a specification or a product.
--   * No second provisioning path. handle_new_user and complete_oauth_signup are
--     extended in place and both call one helper.
--
-- Idempotent throughout: `if not exists`, `or replace`, `drop policy if exists`, and an
-- explicit drop-then-create for every signature this file changes.

-- ---------------------------------------------------------------------------
-- 1. accounts.
--
-- The billing anchor is still brand_memberships — this table does NOT take over plan,
-- plan_status or the Stripe ids, and apply_stripe_entitlement is untouched. What
-- `accounts` owns is the thing product data belongs to. Entitlement is resolved from the
-- account to its owner's membership (section 6), which is one query to change on the day
-- billing moves.
--
-- brand_slug is on the account, not implied, because this Supabase project is the shared
-- identity pool for every Orchestrate offering (supabase/README.md). One person may hold
-- a Batchlabel account and, later, an account on a sibling brand; those are two accounts
-- and they must not see each other's products.
--
-- unique (owner_user_id, brand_slug) is what makes provisioning idempotent and makes
-- "the account for this membership" a single row. It is the constraint to drop on the
-- day one person may own two businesses on one brand; nothing else depends on it.
-- ---------------------------------------------------------------------------
create table if not exists public.accounts (
  id            uuid primary key default gen_random_uuid(),
  brand_slug    text not null references public.brands (slug),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  name          text,
  data          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (owner_user_id, brand_slug)
);

comment on table public.accounts is
  'The thing product data belongs to. One per (owner, brand) today; the shape that makes seats an invite flow rather than a data migration (PRICING_RESEARCH.md §5.3). Billing still lives on brand_memberships — this table deliberately holds no plan and no Stripe id.';
comment on column public.accounts.owner_user_id is
  'The person who pays. Entitlement for this account is resolved through (owner_user_id, brand_slug) to brand_memberships — the single place to change when billing moves onto the account.';
comment on column public.accounts.name is
  'The business name, seeded from brand_memberships.business_name at provisioning. Display only.';

create index if not exists accounts_owner_idx on public.accounts (owner_user_id);
create index if not exists accounts_brand_idx on public.accounts (brand_slug);

drop trigger if exists accounts_set_updated_at on public.accounts;
create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. account_members.
--
-- One row today — the owner — and no way for a browser to create a second. The roles are
-- declared now so that the invite flow, when it lands, adds rows rather than columns.
--
-- 'viewer' exists on purpose and is separate from 'editor'. §5.4: the competent person
-- who signs off an SDS is frequently an external consultant who reads and creates
-- nothing, and if a read-only reviewer costs a full seat, makers share the owner's login
-- — which destroys the "who signed this off" trail the product exists to keep.
-- editor_seat_limit (20260802120000) counts owner + admin + editor and never viewer,
-- which is why that column is not called seat_limit. Nothing enforces it yet.
-- ---------------------------------------------------------------------------
create table if not exists public.account_members (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'editor',
  status     text not null default 'active',
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, user_id)
);

comment on table public.account_members is
  'Who may act inside an account. One row per account today (the owner). Invites, seat counting and removal are deferred; this is the shape they attach to.';

alter table public.account_members drop constraint if exists account_members_role_check;
alter table public.account_members
  add  constraint account_members_role_check
  check (role in ('owner', 'admin', 'editor', 'viewer'));

alter table public.account_members drop constraint if exists account_members_status_check;
alter table public.account_members
  add  constraint account_members_status_check
  check (status in ('active', 'suspended', 'removed'));

create index if not exists account_members_user_idx    on public.account_members (user_id);
create index if not exists account_members_account_idx on public.account_members (account_id);

drop trigger if exists account_members_set_updated_at on public.account_members;
create trigger account_members_set_updated_at
  before update on public.account_members
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. is_member_of — THE RECURSION TRAP, AND THE FIX.
--
-- An RLS policy on account_members that reads account_members to decide visibility
-- recurses infinitely. Postgres will not warn you; the first select against the table
-- errors with "infinite recursion detected in policy for relation account_members", and
-- it costs a day if you meet it unprepared (§5.2 names it for exactly that reason).
--
-- The fix is this: a SECURITY DEFINER helper. It runs as the function's owner, and a
-- table owner bypasses row level security, so the lookup inside does not re-enter the
-- policy. That is the same mechanism handle_new_user, set_consent and
-- apply_stripe_entitlement already rely on, with the same two safety rules:
--
--   * search_path is PINNED, so definer rights cannot be redirected at a table shadowed
--     into an earlier schema by a caller who controls their own search_path;
--   * identity is auth.uid() and is NEVER an argument, so the function cannot be used to
--     ask about anybody but the caller. This is why there is no is_member_of(user, acct).
--
-- ONE STANDING HAZARD, WRITTEN DOWN BECAUSE IT IS INVISIBLE: do NOT enable
-- `alter table public.account_members force row level security`. FORCE makes RLS apply
-- to the owner too, which re-arms the recursion this function exists to defuse.
-- ---------------------------------------------------------------------------
create or replace function public.is_member_of(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.account_members am
     where am.account_id = p_account_id
       and am.user_id    = auth.uid()
       and am.status     = 'active'
  );
$$;

comment on function public.is_member_of(uuid) is
  'True when the CALLER is an active member of this account. SECURITY DEFINER so that a policy on account_members does not recurse into itself; identity is auth.uid() and is never an argument, so it cannot be used to probe anybody else''s membership.';

-- Supabase's default privileges grant EXECUTE on new public-schema functions to anon
-- and authenticated as separate ACL entries, so `revoke ... from public` does not remove
-- them: the roles are named. (20260801120000:483-490 is the file that learned this.)
revoke all     on function public.is_member_of(uuid) from public, anon;
grant  execute on function public.is_member_of(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. current_account_id — so an insert cannot name the wrong account.
--
-- Used as the DEFAULT for products.account_id and specifications.account_id. The app can
-- therefore insert a product without holding an account id at all, and the id it did not
-- supply cannot be somebody else's.
--
-- It refuses to guess. Exactly one active membership -> that account. None, or more than
-- one (a person on two Orchestrate brands), -> NULL, which hits the NOT NULL constraint
-- and produces an error at the insert instead of silently filing the row against
-- whichever account sorted first. An ambiguous default that picks one is how a maker's
-- product lands in the wrong workspace.
--
-- The service role has no auth.uid(), so a server-side insert gets NULL here and MUST
-- pass account_id explicitly. That is deliberate: nothing running as service_role should
-- be inferring whose data it is writing.
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
   where am.user_id = auth.uid()
     and am.status  = 'active';
$$;

comment on function public.current_account_id() is
  'The calling user''s account when they have exactly one; NULL when they have none or more than one. The column default for products.account_id and specifications.account_id, so a client insert need never handle an account id — and cannot supply the wrong one by omission. Returns NULL under service_role (no auth.uid()), which is intentional.';

revoke all     on function public.current_account_id() from public, anon;
grant  execute on function public.current_account_id() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. specifications and products.
--
-- THE SPLIT, from §1.3b: the specification owns everything deriveMixture(), buildSds()
-- and regimesFor() read; the product owns the pack. Concretely, `regimes.ts` contains
-- zero references to netQuantity, netUnit, packagingId or capacityMl — not one — and the
-- 16-section SDS is byte-identical across pack sizes of one formulation. So the
-- expensive half is per specification and is shared; the product is the SKU.
--
-- fragrance_id / base_id / dye_id / load are TYPED COLUMNS rather than keys in `data`
-- because they are exactly, and only, the four fields deriveMixture reads
-- (derive.ts:105-118). §1.3c makes them load-bearing: "a variant is the same recipe in a
-- different pack" is enforceable as a uniqueness check on those four columns, not as a
-- judgement call. This file does NOT add that unique constraint — whether variants are
-- free is a pricing decision nobody has made — but it puts the columns and the index
-- where the decision can be implemented in one statement.
--
-- `data` is the flexibility knob, per supabase/README.md: the shape-varying parts of a
-- Spec live there (PhasedSpec.phases, BomSpec.items and ratings, application, paoMonths)
-- so that a new product family does not need a migration. Anything common and queried
-- gets a typed column.
--
-- ufi is on the SPECIFICATION and there is deliberately no ufi column on products. Under
-- CLP Annex VIII the UFI is tied to the mixture composition, not the package (§1.2);
-- model.ts:212 already carries a comment saying the field has to move here. Putting it
-- anywhere else manufactures regulatory busywork for the customer.
-- ---------------------------------------------------------------------------
create table if not exists public.specifications (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null default public.current_account_id()
               references public.accounts (id) on delete cascade,

  name         text not null,
  category_id  text not null,
  kind         text not null default 'mixture',
  product_type text,

  -- The four classification inputs. Identical values => provably identical derivation.
  fragrance_id text,
  base_id      text,
  dye_id       text,
  load         numeric(6,3),
  additive     text,

  markets      text[] not null default array['GB']::text[],
  regimes      text[] not null default '{}'::text[],

  -- Per composition, never per pack. See §1.2.
  ufi          text,

  data         jsonb   not null default '{}'::jsonb,
  version      integer not null default 1,

  archived_at  timestamptz,
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- The target of the composite foreign key on products: it is what lets the database,
  -- rather than the application, guarantee that a product and its specification belong
  -- to the same account.
  unique (id, account_id)
);

comment on table public.specifications is
  'The composition — the recipe. Everything expensive is derived from here and shared across pack sizes (PRICING_RESEARCH.md §1.2). Specifications are NOT metered; products are.';
comment on column public.specifications.ufi is
  'The Unique Formula Identifier. Belongs to the composition and is shared by every pack size of it (CLP Annex VIII, §1.2). There is deliberately no ufi column on products.';
comment on column public.specifications.data is
  'Shape-varying spec body: phases/application/paoMonths for a phased spec, items/ratings/model for a bill of materials. Common, queried fields get typed columns instead.';
comment on column public.specifications.archived_at is
  'Soft delete. Set it rather than deleting: an archived specification keeps its products readable and printable.';

create table if not exists public.products (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null default public.current_account_id(),
  specification_id uuid not null,

  name             text not null,
  sku              text,

  -- The pack. This is the entire difference between two products of one specification.
  net_quantity     numeric(12,3),
  net_unit         text,
  packaging_id     text,

  identifiers      jsonb not null default '{}'::jsonb,
  obligations      jsonb not null default '{}'::jsonb,
  data             jsonb not null default '{}'::jsonb,

  archived_at      timestamptz,
  created_by       uuid default auth.uid() references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  foreign key (account_id) references public.accounts (id) on delete cascade,

  -- THE CROSS-ACCOUNT GUARD. A composite key, not a plain reference to
  -- specifications(id): with a plain one, a client could file a product against another
  -- account's specification, and RLS on products would happily show them a row that
  -- joins to data they may not read. This makes it a foreign key violation instead of a
  -- policy question.
  --
  -- ON DELETE CASCADE, not RESTRICT. Both tables also cascade from accounts, and RESTRICT
  -- here would make a specification deleted by that cascade collide with a product not
  -- yet deleted by it — turning "delete this user" (a GDPR erasure request) into a
  -- constraint violation. The normal path is archived_at, and section 7 grants the
  -- browser no DELETE on specifications at all, so this cascade is reachable only by
  -- deleting the whole account.
  foreign key (specification_id, account_id)
    references public.specifications (id, account_id) on delete cascade
);

comment on table public.products is
  'The SKU: one specification in one pack size and packaging. "A SKU is one thing you sell: one fragrance in one pack size." This is the metered entity — sku_limit counts live rows here.';
comment on column public.products.specification_id is
  'The composition this pack is of. The foreign key is composite with account_id, so a product can never point at another account''s specification.';
comment on column public.products.identifiers is
  'model / weee_registration / model_year. NEVER the UFI — that is on the specification (§1.2).';
comment on column public.products.archived_at is
  'Soft delete, and the meter''s definition of "live". An archived product does not count against sku_limit and stays fully readable and printable (§6.1: never make an existing label unprintable).';

alter table public.specifications drop constraint if exists specifications_kind_check;
alter table public.specifications
  add  constraint specifications_kind_check check (kind in ('mixture', 'phased', 'bom'));

alter table public.specifications drop constraint if exists specifications_name_check;
alter table public.specifications
  add  constraint specifications_name_check check (btrim(name) <> '');

alter table public.specifications drop constraint if exists specifications_load_check;
alter table public.specifications
  add  constraint specifications_load_check check (load is null or (load >= 0 and load <= 100));

alter table public.products drop constraint if exists products_net_unit_check;
alter table public.products
  add  constraint products_net_unit_check check (net_unit is null or net_unit in ('g', 'ml'));

alter table public.products drop constraint if exists products_name_check;
alter table public.products
  add  constraint products_name_check check (btrim(name) <> '');

alter table public.products drop constraint if exists products_net_quantity_check;
alter table public.products
  add  constraint products_net_quantity_check check (net_quantity is null or net_quantity > 0);

create index if not exists specifications_account_idx on public.specifications (account_id);
create index if not exists specifications_live_idx    on public.specifications (account_id) where archived_at is null;

-- The composition index. Not unique, deliberately: see the note above about §1.3c.
create index if not exists specifications_composition_idx
  on public.specifications (account_id, fragrance_id, base_id, dye_id, load);

create index if not exists products_account_idx  on public.products (account_id);
create index if not exists products_spec_idx     on public.products (specification_id);
-- The index the SKU meter counts on.
create index if not exists products_live_idx     on public.products (account_id) where archived_at is null;

-- One live SKU code per account. Case-insensitive, because 'RD-SMV-100' and
-- 'rd-smv-100' are the same code on a shelf. Archived rows are excluded so a retired
-- code can be reused, and null is allowed so a product can be drafted before its code
-- exists.
create unique index if not exists products_account_sku_uidx
  on public.products (account_id, lower(sku))
  where archived_at is null and sku is not null;

drop trigger if exists specifications_set_updated_at on public.specifications;
create trigger specifications_set_updated_at
  before update on public.specifications
  for each row execute function public.set_updated_at();

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. THE SKU METER.
--
-- §3.3 is explicit that a client-side check is not enforcement: the browser holds an
-- anon key against PostgREST and anyone can insert directly. The honest enforcement
-- point is a BEFORE INSERT trigger that counts live rows for the ACCOUNT and raises. A
-- WITH CHECK policy carrying a count subquery would also work and would give a generic
-- RLS violation instead of a message you can put in front of a maker.
--
-- FOUR RULINGS ARE BUILT INTO THIS, AND EACH ONE IS LOAD-BEARING.
--
-- (a) FAIL OPEN WHEN THE ALLOWANCE IS UNKNOWN. If no membership resolves — a user
--     mid-OAuth-completion, a brand mismatch, a row a future code path forgot — the
--     insert is ALLOWED. A missing allowance must never lock a paying customer out of
--     their own product. Note the asymmetry with the column itself: sku_limit is NOT
--     NULL precisely so that a null can only ever mean "no row found", never "we have a
--     row and it says nothing".
--
-- (b) ARCHIVED ROWS DO NOT COUNT. The meter counts what a maker actually sells.
--
-- (c) THE COUNT-AND-INSERT RACE IS CLOSED WITH `select ... for update` ON THE ACCOUNT
--     ROW, the pattern apply_stripe_entitlement already demonstrates
--     (20260801120000:331). Two concurrent inserts serialise on that lock, so the second
--     one counts the first. At a maker's volumes this is theoretical; it costs nothing,
--     and "theoretical" is what every race is until it is a support ticket.
--
-- (d) IT FIRES ON CREATION AND ON UN-ARCHIVING, AND ON NOTHING ELSE. There are two
--     triggers rather than one, and that is the structural expression of §6.1's rule —
--     "no new, keep everything old fully working". No UPDATE of a live product can reach
--     this function, so editing, re-deriving, versioning and above all EXPORTING an
--     existing SKU cannot be blocked by a limit, at any tier, ever. A maker over their
--     limit after a downgrade must still be able to reprint a label for stock already on
--     a shelf — which is exactly when a recall or a Trading Standards query happens.
--     A single `before insert or update` trigger could not express this, because a WHEN
--     clause may not reference OLD on an INSERT.
-- ---------------------------------------------------------------------------

-- The rule itself, in one place, so the trigger and the read surface cannot drift. Both
-- call this; neither reimplements it.
--
-- Null limit -> true (ruling (a)). Null count -> treated as zero, which also permits:
-- an unknown count is not evidence of an overage.
--
-- Schema-qualified reference to sku_is_unlimited, and deliberately no `set search_path`:
-- qualification already defeats a shadowing attack, and omitting the clause keeps the
-- function inlinable so the entitlements view stays a plain scan. Same reasoning as
-- 20260802120000:112-116.
create or replace function public.sku_within_limit(p_count integer, p_sku_limit integer)
returns boolean
language sql
immutable
parallel safe
as $$
  select p_sku_limit is null
      or public.sku_is_unlimited(p_sku_limit)
      or coalesce(p_count, 0) < p_sku_limit;
$$;

comment on function public.sku_within_limit(integer, integer) is
  'True when one more live SKU is permitted. The single definition of the SKU rule: the enforcement trigger and the can_modify column on public.entitlements both call it, so the number the app shows and the number the database enforces cannot diverge. Fails OPEN on a null limit — a missing allowance must never become a lockout.';

revoke all     on function public.sku_within_limit(integer, integer) from public, anon;
grant  execute on function public.sku_within_limit(integer, integer) to authenticated, service_role;

-- Account -> allowance. THE ONE PLACE that knows entitlement still lives on the owner's
-- membership; when billing moves onto the account, this function is the change.
create or replace function public.account_sku_limit(p_account_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select m.sku_limit
    from public.accounts a
    join public.brand_memberships m
      on m.user_id    = a.owner_user_id
     and m.brand_slug = a.brand_slug
   where a.id = p_account_id;
$$;

comment on function public.account_sku_limit(uuid) is
  'The SKU allowance for an account, resolved through its owner''s brand membership. Returns NULL when no membership resolves, and every caller must read NULL as "unknown" and fail open.';

-- Internal. The trigger below is SECURITY DEFINER and owned by the same role, so it can
-- call this; no browser needs to, and the entitlements view reads sku_limit directly.
revoke all     on function public.account_sku_limit(uuid) from public, anon, authenticated;
grant  execute on function public.account_sku_limit(uuid) to service_role;

create or replace function public.enforce_sku_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_count integer;
begin
  -- The NOT NULL constraint rejects this a moment later with a better message than any
  -- we could raise, and there is no account to meter against.
  if new.account_id is null then
    return new;
  end if;

  -- METER ONLY AN ACCOUNT THE CALLER BELONGS TO.
  --
  -- PostgreSQL fires BEFORE ROW triggers BEFORE it evaluates the RLS WITH CHECK
  -- expression, so at this point new.account_id has been validated by nothing. This
  -- function is SECURITY DEFINER, so everything below it — the lock, account_sku_limit,
  -- the count — runs with RLS bypassed against whatever account id the caller put in the
  -- row. Reached that way, the exception below hands back the victim's live product
  -- count, their plan allowance and their account id, to any signed-in user willing to
  -- POST to /rest/v1/products with somebody else's id in the body. Proved with a working
  -- exploit against a real Postgres before this guard existed.
  --
  -- Worse than the numbers is the oracle: a full account raises P0001 while an account
  -- under its limit falls through to a 42501, so the two responses distinguish "this
  -- account exists and is full" from everything else.
  --
  -- Returning NEW here is deliberate rather than raising. RLS refuses the insert a moment
  -- later with a generic 42501 that says nothing about whether the account exists — which
  -- is the correct answer to a question the caller had no right to ask.
  if not public.is_member_of(new.account_id) then
    return new;
  end if;

  -- (c) Serialise concurrent creations for this account before counting. SECURITY
  -- DEFINER is what makes this possible at all: `select ... for update` needs an UPDATE
  -- policy as well as a SELECT one, and section 7 deliberately grants the browser
  -- neither on accounts.
  perform 1 from public.accounts a where a.id = new.account_id for update;

  v_limit := public.account_sku_limit(new.account_id);

  -- (a) Unknown allowance: allow. Never lock a customer out of their own product.
  if v_limit is null then
    return new;
  end if;

  -- Cheap exit for the unlimited tier: no count, no scan.
  if public.sku_is_unlimited(v_limit) then
    return new;
  end if;

  -- (b) Live rows only. On an un-archive this correctly excludes the row being changed,
  -- because BEFORE UPDATE still sees it archived on disk.
  select count(*)::integer into v_count
    from public.products p
   where p.account_id  = new.account_id
     and p.archived_at is null;

  if not public.sku_within_limit(v_count, v_limit) then
    raise exception using
      errcode = 'P0001',
      message = format(
        'SKU limit reached: this account already holds %s of %s SKUs. Everything you have stays editable and printable — you just cannot add a new one until you are under the limit or on a larger plan.',
        v_count, v_limit),
      detail  = format('account_id=%s live_sku_count=%s sku_limit=%s', new.account_id, v_count, v_limit),
      -- A stable token for the app to match on. Match the hint, never the sentence:
      -- the sentence is customer-facing copy and will be rewritten.
      hint    = 'sku_limit_reached';
  end if;

  return new;
end;
$$;

comment on function public.enforce_sku_limit() is
  'BEFORE INSERT (and BEFORE un-archive) on public.products: counts live rows for the account against the resolved sku_limit and refuses one too many. Locks the account row first so a concurrent pair of inserts cannot both pass the count. Fails OPEN when the allowance is unknown. Raises P0001 with hint = sku_limit_reached.';

revoke all on function public.enforce_sku_limit() from public, anon, authenticated;

-- (d) Two triggers, so that no update of a LIVE product can ever reach the check.
drop trigger if exists products_enforce_sku_limit           on public.products;
drop trigger if exists products_enforce_sku_limit_on_insert on public.products;
create trigger products_enforce_sku_limit_on_insert
  before insert on public.products
  for each row
  when (new.archived_at is null)
  execute function public.enforce_sku_limit();

-- Two ways an UPDATE can add a live row to an account, and no others: un-archiving one,
-- and moving one in from elsewhere. Both are covered; every other update — the name, the
-- pack size, the SKU code, archiving — passes untouched, which is what makes §6.1's
-- "keep everything old fully working" a property of the schema rather than a promise.
--
-- On both paths the row on disk still belongs to its old account (or is still archived),
-- so the count below correctly excludes the row being changed.
drop trigger if exists products_enforce_sku_limit_on_unarchive on public.products;
drop trigger if exists products_enforce_sku_limit_on_update    on public.products;
create trigger products_enforce_sku_limit_on_update
  before update on public.products
  for each row
  when (
    new.archived_at is null
    and (old.archived_at is not null or new.account_id is distinct from old.account_id)
  )
  execute function public.enforce_sku_limit();

-- ---------------------------------------------------------------------------
-- 7. Row Level Security. "user X only accesses user X's data", stated as a policy.
--
-- Every predicate is is_member_of(account_id) and nothing is auth.uid() = user_id. For a
-- single-member account the two are behaviourally identical today (§5.3 step 3), which
-- is exactly why the right one has to be written now: the day a second member exists,
-- this file needs no edit.
--
-- accounts and account_members are READ ONLY to the browser. They are the anchor the
-- allowance is resolved through, so a client that could INSERT an account_members row
-- could hand itself a colleague's data, and a client that could INSERT an account could
-- mint a second workspace to hold a second free allowance. Every write to both is
-- SECURITY DEFINER provisioning (section 8) or the service role — the same rule
-- 20260729120000 applied to brand_memberships, for the same reason.
--
-- specifications has SELECT / INSERT / UPDATE and no DELETE. Deleting a specification
-- cascades to its products (section 5), which is not something a mis-click should do;
-- archived_at is the intended path and keeps existing labels printable (§6.1).
-- ---------------------------------------------------------------------------
alter table public.accounts        enable row level security;
alter table public.account_members enable row level security;
alter table public.specifications  enable row level security;
alter table public.products        enable row level security;

drop policy if exists "accounts are readable by their members" on public.accounts;
create policy "accounts are readable by their members"
  on public.accounts for select
  using (public.is_member_of(id));

drop policy if exists "members of an account are readable by each other" on public.account_members;
create policy "members of an account are readable by each other"
  on public.account_members for select
  using (public.is_member_of(account_id));

drop policy if exists "specifications are readable by account members" on public.specifications;
create policy "specifications are readable by account members"
  on public.specifications for select
  using (public.is_member_of(account_id));

drop policy if exists "specifications are insertable by account members" on public.specifications;
create policy "specifications are insertable by account members"
  on public.specifications for insert
  with check (public.is_member_of(account_id));

-- USING and WITH CHECK both, and both matter: USING decides which rows may be updated,
-- WITH CHECK decides what they may become. Without the second, a member could move a row
-- into an account they do not belong to.
drop policy if exists "specifications are updatable by account members" on public.specifications;
create policy "specifications are updatable by account members"
  on public.specifications for update
  using (public.is_member_of(account_id))
  with check (public.is_member_of(account_id));

drop policy if exists "products are readable by account members" on public.products;
create policy "products are readable by account members"
  on public.products for select
  using (public.is_member_of(account_id));

drop policy if exists "products are insertable by account members" on public.products;
create policy "products are insertable by account members"
  on public.products for insert
  with check (public.is_member_of(account_id));

drop policy if exists "products are updatable by account members" on public.products;
create policy "products are updatable by account members"
  on public.products for update
  using (public.is_member_of(account_id))
  with check (public.is_member_of(account_id));

drop policy if exists "products are deletable by account members" on public.products;
create policy "products are deletable by account members"
  on public.products for delete
  using (public.is_member_of(account_id));

-- Grants. RLS still decides which rows; these decide which verbs.
revoke all on public.accounts        from anon, authenticated;
revoke all on public.account_members from anon, authenticated;
revoke all on public.specifications  from anon, authenticated;
revoke all on public.products        from anon, authenticated;

grant select                         on public.accounts        to authenticated;
grant select                         on public.account_members to authenticated;
grant select, insert, update         on public.specifications  to authenticated;
grant select, insert, update, delete on public.products        to authenticated;

grant all on public.accounts        to service_role;
grant all on public.account_members to service_role;
grant all on public.specifications  to service_role;
grant all on public.products        to service_role;

-- ---------------------------------------------------------------------------
-- 8. A CLEAN SLATE ON SIGNUP.
--
-- The founder's sentence: "when a user signs in for the first time, they are in a virgin
-- account with no products… if they add a product or any other detail then that actually
-- is created". The first half is guaranteed structurally rather than by discipline —
-- there is no insert into specifications or products anywhere in this file, and the
-- fixtures in src/lib/products.ts have no path into the database at all. A new account
-- starts empty because nothing can make it start otherwise.
--
-- ONE provisioning helper, called from BOTH existing entry points, rather than a second
-- competing path:
--   * handle_new_user      — the trigger on auth.users, for email/password and magic
--                            link signups, which carry their brand in raw_user_meta_data;
--   * complete_oauth_signup — the RPC the /finish-setup screen calls, because
--                            signInWithOAuth cannot carry that payload (20260731120000).
--
-- Both already gate on "we know this brand", and the account is created inside that same
-- gate. A user with no membership therefore has no account, which is correct: they have
-- not finished signing up. They get both, atomically, the moment they do.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_account(
  p_user_id uuid,
  p_brand   text,
  p_name    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
begin
  if p_user_id is null or p_brand is null then
    return null;
  end if;

  -- Idempotent on (owner_user_id, brand_slug). A double submit of the completion screen,
  -- a retried trigger, or a re-run of the backfill in section 9 all land here and change
  -- nothing.
  insert into public.accounts (brand_slug, owner_user_id, name)
  values (p_brand, p_user_id, nullif(btrim(coalesce(p_name, '')), ''))
  on conflict (owner_user_id, brand_slug) do nothing
  returning id into v_account_id;

  if v_account_id is null then
    select a.id into v_account_id
      from public.accounts a
     where a.owner_user_id = p_user_id
       and a.brand_slug    = p_brand;
  end if;

  if v_account_id is null then
    return null;
  end if;

  -- The owner is the sole member. Role 'owner' rather than 'editor' so that the day a
  -- seat count exists, the person paying is not counted as an ordinary editor by
  -- accident, and so "transfer the business" has something to change.
  insert into public.account_members (account_id, user_id, role, status)
  values (v_account_id, p_user_id, 'owner', 'active')
  on conflict (account_id, user_id) do nothing;

  return v_account_id;
end;
$$;

comment on function public.ensure_account(uuid, text, text) is
  'Creates the account and its owner membership for a user on a brand, or returns the existing one. Idempotent. The ONLY provisioning path — called by handle_new_user and by complete_oauth_signup, so there is never a second, competing one. Creates no specifications and no products: a new account is empty by construction.';

-- Not callable from a browser. A client that could call this could mint itself a second
-- account, and a second account is a second free allowance.
revoke all     on function public.ensure_account(uuid, text, text) from public, anon, authenticated;
grant  execute on function public.ensure_account(uuid, text, text) to service_role;

-- --- handle_new_user, extended in place -------------------------------------
--
-- This is the function as it stands in 20260730120000 (consents), with ONE new line,
-- marked NEW, inside the block that already decides a brand is known. Nothing else is
-- changed and nothing is reordered: the consent handling below is a compliance audit
-- trail and this migration is not the place to re-litigate any of it.
--
-- Signature is unchanged, so `create or replace` preserves the existing ACL and the
-- on_auth_user_created trigger keeps pointing at it. No drop, and no re-created trigger.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brand          text        := nullif(new.raw_user_meta_data ->> 'brand', '');
  v_business       text        := nullif(new.raw_user_meta_data ->> 'business_name', '');
  v_full           text        := nullif(new.raw_user_meta_data ->> 'full_name', '');
  v_attr           jsonb       := coalesce(new.raw_user_meta_data -> 'attribution', '{}'::jsonb);
  v_consents       jsonb       := coalesce(new.raw_user_meta_data -> 'consents', '{}'::jsonb);
  v_ts             timestamptz := now();
  -- Coerce client-controlled JSON to booleans by string comparison, never a bare
  -- ::boolean cast: raw_user_meta_data is attacker-controllable, and an uncoercible
  -- value (e.g. "maybe") in a cast would raise and abort the whole signup.
  v_terms_accepted boolean     := coalesce((v_consents #>> '{terms,accepted}') = 'true', false);
  v_email_accepted boolean     := coalesce((v_consents #>> '{marketing_email,accepted}') = 'true', false);
  v_ad_accepted    boolean     := coalesce((v_consents #>> '{advertising,accepted}') = 'true', false);
  v_email_optin    boolean     := coalesce((new.raw_user_meta_data ->> 'marketing_email_opt_in') = 'true', v_email_accepted, false);
  v_ad_optin       boolean     := coalesce((new.raw_user_meta_data ->> 'advertising_opt_in') = 'true', v_ad_accepted, false);
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, v_full)
  on conflict (id) do nothing;

  if v_brand is not null and exists (select 1 from public.brands b where b.slug = v_brand) then
    -- Stamp a server timestamp, but only where the consent was actually accepted, so a
    -- declined consent never carries an "accepted_at".
    if v_consents ? 'terms' and v_terms_accepted then
      v_consents := jsonb_set(v_consents, '{terms,accepted_at}', to_jsonb(v_ts), true);
    end if;
    if v_consents ? 'marketing_email' and v_email_accepted then
      v_consents := jsonb_set(v_consents, '{marketing_email,accepted_at}', to_jsonb(v_ts), true);
    end if;
    if v_consents ? 'advertising' and v_ad_accepted then
      v_consents := jsonb_set(v_consents, '{advertising,accepted_at}', to_jsonb(v_ts), true);
    end if;

    insert into public.brand_memberships
      (user_id, brand_slug, business_name, attribution, signup_source,
       consents, marketing_email_opt_in, advertising_opt_in)
    values
      (new.id, v_brand, v_business, v_attr, 'web',
       v_consents, v_email_optin, v_ad_optin)
    on conflict (user_id, brand_slug) do nothing;

    -- NEW. The account and its sole owner membership, in the same transaction as the
    -- brand membership, so "has a membership" and "has an account" cannot come apart.
    -- Empty: no specification, no product, no fixture, ever.
    perform public.ensure_account(new.id, v_brand, v_business);

    if v_consents ? 'terms' then
      insert into public.consent_events (user_id, brand_slug, consent_id, title, version, url, accepted, source)
      values (new.id, v_brand,
              coalesce(v_consents #>> '{terms,id}', 'terms_of_service'),
              v_consents #>> '{terms,title}', v_consents #>> '{terms,version}', v_consents #>> '{terms,url}',
              v_terms_accepted, 'signup');
    end if;
    if v_consents ? 'marketing_email' then
      insert into public.consent_events (user_id, brand_slug, consent_id, title, version, url, accepted, source)
      values (new.id, v_brand,
              coalesce(v_consents #>> '{marketing_email,id}', 'marketing_emails'),
              v_consents #>> '{marketing_email,title}', v_consents #>> '{marketing_email,version}', v_consents #>> '{marketing_email,url}',
              v_email_accepted, 'signup');
    end if;
    if v_consents ? 'advertising' then
      insert into public.consent_events (user_id, brand_slug, consent_id, title, version, url, accepted, source)
      values (new.id, v_brand,
              coalesce(v_consents #>> '{advertising,id}', 'advertising'),
              v_consents #>> '{advertising,title}', v_consents #>> '{advertising,version}', v_consents #>> '{advertising,url}',
              v_ad_accepted, 'signup');
    end if;
  end if;

  return new;
end;
$$;

-- --- complete_oauth_signup, extended in place -------------------------------
--
-- The function as it stands in 20260731120000, with ONE new line, marked NEW, placed
-- after the membership insert has been confirmed to be OURS (v_created is not null).
-- Position matters: a call that lost the race returns early and writes nothing, and it
-- must not create an account either — the winning call already did.
--
-- Everything else, including the security model, is unchanged. Restated because it is
-- easy to lose in a re-paste: identity is auth.uid() and is never a parameter; terms are
-- mandatory; the accepted flags and timestamps are server-built and never taken from the
-- client blob; the whole thing is idempotent per (user, brand).
--
-- Signature unchanged, so `create or replace` keeps the existing grant. It is re-issued
-- below anyway, because it costs one line and being wrong here means the completion
-- screen 403s for every OAuth signup.
create or replace function public.complete_oauth_signup(
  p_brand                  text,
  p_business_name          text    default null,
  p_terms_accepted         boolean default false,
  p_marketing_email_opt_in boolean default false,
  p_advertising_opt_in     boolean default false,
  p_agreements             jsonb   default '{}'::jsonb,
  p_attribution            jsonb   default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user      uuid        := auth.uid();
  v_ts        timestamptz := now();
  v_email     text;
  v_full      text;
  v_business  text        := nullif(btrim(coalesce(p_business_name, '')), '');
  v_attr      jsonb       := coalesce(p_attribution, '{}'::jsonb);
  v_agree     jsonb       := coalesce(p_agreements, '{}'::jsonb);
  v_marketing boolean     := coalesce(p_marketing_email_opt_in, false);
  v_ads       boolean     := coalesce(p_advertising_opt_in, false);
  v_consents  jsonb;
  v_created   int;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_brand is null or not exists (select 1 from public.brands b where b.slug = p_brand) then
    raise exception 'unknown brand: %', p_brand using errcode = '22023';
  end if;

  -- The whole point of the completion step. No terms, no account.
  if p_terms_accepted is not true then
    raise exception 'the Terms of Service must be accepted' using errcode = '22023';
  end if;

  -- Fast path for the common repeat case (double submit, or an OAuth identity linked
  -- onto an account that already has a membership). This is only an optimisation: it is
  -- NOT what makes the function idempotent, because two concurrent calls can both pass
  -- it. The insert below is the real arbiter.
  if exists (
    select 1 from public.brand_memberships m
     where m.user_id = v_user and m.brand_slug = p_brand
  ) then
    -- NEW. Repair path, not a second provisioning path: ensure_account is idempotent, so
    -- a user whose membership predates this migration and who re-submits the completion
    -- screen still ends up with an account. Section 9 backfills the rest.
    perform public.ensure_account(v_user, p_brand, v_business);
    return false;
  end if;

  -- Both jsonb arguments are client-controlled. A scalar or an array where an object
  -- is expected would corrupt the column shape, so coerce rather than trust.
  if jsonb_typeof(v_attr) is distinct from 'object' then
    v_attr := '{}'::jsonb;
  end if;
  if jsonb_typeof(v_agree) is distinct from 'object' then
    v_agree := '{}'::jsonb;
  end if;

  select u.email, nullif(u.raw_user_meta_data ->> 'full_name', '')
    into v_email, v_full
    from auth.users u
   where u.id = v_user;

  -- Defensive: handle_new_user already created this row when the auth user was made.
  insert into public.profiles (id, email, full_name)
  values (v_user, v_email, v_full)
  on conflict (id) do nothing;

  -- Consents snapshot, built server-side. accepted_at is stamped only where the
  -- consent was accepted, so a declined consent never carries an acceptance time.
  v_consents := jsonb_build_object(
    'terms', public.consent_snapshot_for(
      v_agree -> 'terms', 'terms_of_service', 'Terms of Service', true, v_ts),
    'marketing_email', public.consent_snapshot_for(
      v_agree -> 'marketing_email', 'marketing_emails', 'Marketing emails', v_marketing, v_ts),
    'advertising', public.consent_snapshot_for(
      v_agree -> 'advertising', 'advertising', 'Advertising and retargeting', v_ads, v_ts)
  );

  insert into public.brand_memberships
    (user_id, brand_slug, business_name, attribution, signup_source,
     consents, marketing_email_opt_in, advertising_opt_in, data)
  values
    (v_user, p_brand, v_business, v_attr, 'web',
     v_consents, v_marketing, v_ads,
     jsonb_build_object('signup_method', 'oauth'))
  on conflict (user_id, brand_slug) do nothing
  returning 1 into v_created;

  -- Lost a race with a concurrent call: that call owns this membership and has written
  -- the audit rows for it. Writing ours too would put two contradictory sets of consent
  -- decisions in an append-only log, so we write nothing and report "already set up".
  if v_created is null then
    return false;
  end if;

  -- NEW. Same transaction as the membership and the consent rows: a person who has
  -- accepted the terms has an account, and it is empty.
  perform public.ensure_account(v_user, p_brand, v_business);

  insert into public.consent_events
    (user_id, brand_slug, consent_id, title, version, url, accepted, source)
  values
    (v_user, p_brand,
     v_consents #>> '{terms,id}', v_consents #>> '{terms,title}',
     v_consents #>> '{terms,version}', v_consents #>> '{terms,url}',
     true, 'oauth_signup'),
    (v_user, p_brand,
     v_consents #>> '{marketing_email,id}', v_consents #>> '{marketing_email,title}',
     v_consents #>> '{marketing_email,version}', v_consents #>> '{marketing_email,url}',
     v_marketing, 'oauth_signup'),
    (v_user, p_brand,
     v_consents #>> '{advertising,id}', v_consents #>> '{advertising,title}',
     v_consents #>> '{advertising,version}', v_consents #>> '{advertising,url}',
     v_ads, 'oauth_signup');

  return true;
end;
$$;

comment on function public.complete_oauth_signup(text, text, boolean, boolean, boolean, jsonb, jsonb) is
  'Provisions the brand membership, the account and the consent audit trail for a user who signed up through an OAuth provider. Identity from auth.uid(); Terms mandatory; timestamps server-stamped; idempotent per (user, brand).';

revoke all     on function public.complete_oauth_signup(text, text, boolean, boolean, boolean, jsonb, jsonb) from public;
grant  execute on function public.complete_oauth_signup(text, text, boolean, boolean, boolean, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Backfill: one account per existing membership, with that user as sole owner.
--
-- Driven off brand_memberships rather than auth.users, because a membership is what says
-- "this person finished signing up for this brand", and because it carries the brand and
-- the business name. An auth user with no membership (an OAuth signup stuck before
-- /finish-setup) deliberately gets nothing; complete_oauth_signup provisions them when
-- they finish, and section 8's repair path covers them if they already had a membership.
--
-- Two plain inserts rather than a loop over ensure_account: same result, one statement
-- each, and re-runnable by construction.
-- ---------------------------------------------------------------------------
insert into public.accounts (brand_slug, owner_user_id, name)
select m.brand_slug, m.user_id, nullif(btrim(coalesce(m.business_name, '')), '')
  from public.brand_memberships m
on conflict (owner_user_id, brand_slug) do nothing;

insert into public.account_members (account_id, user_id, role, status)
select a.id, a.owner_user_id, 'owner', 'active'
  from public.accounts a
on conflict (account_id, user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 10. The read surface, rebuilt — and the two columns 20260802120000 promised.
--
-- That file stated the debt precisely (its section 7): sku_count was blocked on the
-- products table, because a view column is fixed at `create view` time and cannot
-- conditionally reference a relation that does not exist; and can_modify "ships with the
-- enforcement trigger, in the same migration, so that the rule and the boolean that
-- reports it arrive together". This is that migration, so both land here. The product
-- app's reader already maps them and treats their absence as unknown
-- (src/lib/membership.ts), so this is additive on the client with no code change.
--
-- THREE THINGS TO GET RIGHT, ALL OF WHICH ARE EASY TO LOSE IN A REBUILD:
--
--   * `security_invoker = true` is the whole security of this view. Without it the view
--     runs as its OWNER, which bypasses row level security, and every signed-in user
--     sees every other user's billing state. It looks fine in testing, because you only
--     ever test with one account. security_barrier as well, so the planner cannot push a
--     user-supplied function inside and use it to probe rows the caller cannot see.
--   * COLUMNS ARE APPENDED, never inserted. The documented column order stays valid and
--     docs/ENTITLEMENTS.md gains rows rather than being rewritten.
--   * `account_id` KEEPS ITS POSITION AND CHANGES ITS EXPRESSION. It was
--     `m.user_id as account_id`, with 20260802120000 section 8 promising that "when a
--     real accounts table arrives, only the expression on the right-hand side of that
--     alias changes: no app change, no column rename". This is that change. Nothing in
--     either repo reads the column yet, so the value moving from a user id to an account
--     id breaks nothing — and doing it now, before anything depends on it, is the entire
--     reason the alias was published early.
--
-- The lateral joins are subject to the CALLER's RLS, because the view is
-- security_invoker: `accounts` is visible via is_member_of and `products` likewise, so a
-- caller's own row resolves correctly and there is no path to anybody else's count.
-- Under the service role (which bypasses RLS) they resolve correctly too, by ownership
-- rather than by session — so this is not a view that only works when a browser reads it.
-- ---------------------------------------------------------------------------
drop view     if exists public.entitlements;
drop function if exists public.get_entitlement(text);

create view public.entitlements
with (security_invoker = true, security_barrier = true)
as
select
  m.user_id,
  m.brand_slug   as brand,
  m.plan,
  m.plan_status  as status,
  m.status       as membership_status,
  public.entitlement_is_active(m.status, m.plan, m.plan_status, m.current_period_end) as active,
  m.current_period_end,
  m.cancel_at_period_end,
  m.trial_end,
  m.updated_at,
  -- THE ACCOUNT KEY. Now a real accounts.id, not the user id.
  acct.id        as account_id,
  m.business_name,
  m.sku_limit,
  m.editor_seat_limit,
  public.sku_is_unlimited(m.sku_limit) as sku_unlimited,
  -- NEW. Live SKUs held by this account. Null only when no account resolves, which the
  -- app reads as unknown — never as zero.
  sku.n          as sku_count,
  -- NEW. Exactly the rule the trigger enforces, via the same function, so the button the
  -- app disables and the insert the database refuses can never disagree.
  public.sku_within_limit(sku.n, m.sku_limit) as can_modify
from public.brand_memberships m
left join lateral (
  select a.id
    from public.accounts a
   where a.owner_user_id = m.user_id
     and a.brand_slug    = m.brand_slug
   order by a.created_at
   limit 1
) acct on true
-- The `where acct.id is not null` is load-bearing and easy to delete by accident: without
-- it the lateral still produces one row, count(*) over an unmatchable predicate is ZERO,
-- and a membership with no account would report sku_count = 0. Zero is a claim ("you have
-- none"); the honest answer is that we do not know, and the app's reader is built to tell
-- those apart. With the guard the lateral yields no row and the LEFT JOIN gives null.
left join lateral (
  select (
    select count(*)::integer
      from public.products p
     where p.account_id  = acct.id
       and p.archived_at is null
  ) as n
  where acct.id is not null
) sku on true;

comment on view public.entitlements is
  'Read-only entitlement state for the signed-in user. security_invoker = true, so brand_memberships RLS applies and a caller sees only their own row. `active` answers whether they may use the product; sku_limit / sku_count / can_modify answer how much, and the two must never be conflated. can_modify is computed by the same function the enforcement trigger calls. Never grant to anon.';

revoke all    on public.entitlements from anon, authenticated;
grant  select on public.entitlements to authenticated;

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
  sku_unlimited        boolean,
  sku_count            integer,
  can_modify           boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    e.brand,
    e.plan,
    e.status,
    e.membership_status,
    e.active,
    e.current_period_end,
    e.cancel_at_period_end,
    e.trial_end,
    e.updated_at,
    e.account_id,
    e.business_name,
    e.sku_limit,
    e.editor_seat_limit,
    e.sku_unlimited,
    e.sku_count,
    e.can_modify
  from public.entitlements e
  where e.user_id = auth.uid()
    and (p_brand is null or e.brand = p_brand);
$$;

comment on function public.get_entitlement(text) is
  'Entitlement state for the calling user, optionally filtered to one brand. SECURITY INVOKER plus an explicit auth.uid() predicate: two independent reasons a caller cannot see somebody else''s row. Returns the resolved allowance and the live SKU count alongside `active`; they answer different questions and neither substitutes for the other.';

revoke all     on function public.get_entitlement(text) from public, anon;
grant  execute on function public.get_entitlement(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Behavioural assertions, run at apply time.
--
-- The repository has no SQL test harness (20260802120000 section 4 says so and does the
-- same thing). The properties that matter here are behavioural, and a grep over a
-- function body would pass on a predicate that reads its arguments backwards — so they
-- are asserted inside the database, against the objects just created, in the same
-- transaction. Failing here aborts the migration, which is the point: shipping a SKU
-- rule that fails CLOSED on an unknown allowance would lock paying customers out of
-- their own products, and the only thing worse than that bug is it arriving silently.
-- ---------------------------------------------------------------------------
do $$
declare
  v_orphans integer;
begin
  -- THE ruling that must never regress: unknown allowance -> allowed.
  if not public.sku_within_limit(99999, null) then
    raise exception
      'sku_within_limit fails CLOSED on a null limit. A membership that cannot be resolved would lock a paying customer out of their own product.'
      using errcode = '22023';
  end if;

  -- An unknown count is not evidence of an overage either.
  if not public.sku_within_limit(null, 3) then
    raise exception 'sku_within_limit fails CLOSED on a null count.' using errcode = '22023';
  end if;

  -- The unlimited sentinel is an allowance, not a number to compare against.
  if not public.sku_within_limit(2147483646, 2147483647) then
    raise exception 'sku_within_limit denies the unlimited tier.' using errcode = '22023';
  end if;

  -- ...and it is not a rubber stamp. Without this, "always true" would pass everything
  -- above and the trigger would enforce nothing at all.
  if public.sku_within_limit(3, 3) then
    raise exception
      'sku_within_limit permits an insert at the limit. The comparison must be strict: three live SKUs on a three-SKU allowance is full.'
      using errcode = '22023';
  end if;

  if not public.sku_within_limit(2, 3) then
    raise exception 'sku_within_limit denies an insert below the limit.' using errcode = '22023';
  end if;

  -- The invariant section 9 exists to establish. A membership without an account is a
  -- customer who cannot create anything, and it must not be discovered in support.
  select count(*) into v_orphans
    from public.brand_memberships m
   where not exists (
     select 1 from public.accounts a
      where a.owner_user_id = m.user_id
        and a.brand_slug    = m.brand_slug
   );

  if v_orphans > 0 then
    raise exception
      'account backfill incomplete: % brand membership(s) have no account.', v_orphans
      using errcode = '22023';
  end if;

  raise notice 'account_data_schema: SKU rule verified (fails open on unknown, strict at the limit); every membership has an account.';
end
$$;

do $$
declare
  v_accounts integer;
  v_members  integer;
begin
  select count(*) into v_accounts from public.accounts;
  select count(*) into v_members  from public.account_members;
  raise notice 'account_data_schema: % account(s), % member row(s). specifications and products created empty — no fixture data is seeded, ever.',
    v_accounts, v_members;
end
$$;
