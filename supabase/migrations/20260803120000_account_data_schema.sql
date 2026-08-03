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
--     created_by        uuid            auth.uid(), PINNED BY THE DATABASE. A value sent
--                                       by a signed-in client is discarded on insert and
--                                       cannot be changed on update (section 7b).
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
--     created_by        uuid            auth.uid(), PINNED BY THE DATABASE. A value sent
--                                       by a signed-in client is discarded on insert and
--                                       cannot be changed on update (section 7b).
--     created_at, updated_at
--     SELECT / INSERT / UPDATE / DELETE for members.
--
-- Functions the app may call:
--   public.current_account_id()  -> uuid    the caller's account when they have exactly
--                                           one; NULL when none or ambiguous. It is the
--                                           column default, so an insert may omit
--                                           account_id entirely.
--   public.is_member_of(uuid)    -> boolean the RLS predicate, callable for UI checks.
--
-- =============================================================================
-- THE account_id CONTRACT. Decided jointly with the app workstream; the same rule is
-- written on both branches, because a contract only one side states is a preference.
-- =============================================================================
--
--   1. THE APP MAY — AND SHOULD — SEND account_id EXPLICITLY. The id to send is the one
--      it already reads back from entitlements / get_entitlement(BRAND_SLUG). Send it on
--      every insert into specifications and products.
--
--   2. SENDING IT WEAKENS NOTHING. Both INSERT policies are
--      `with check (public.is_member_of(account_id))`, so an id that is not one of the
--      caller's own is refused by the database whatever the client believes about it.
--      Isolation has never rested on the default; it rests on the policy. The default
--      exists to spare the app an id it does not have — not to stop it supplying one it
--      does.
--
--   3. WHEN THE APP DOES NOT KNOW, IT OMITS THE COLUMN and takes the default. Omitting is
--      the honest expression of "we do not know". A null entitlements.account_id means
--      unknown; it never means "this user has no account", and it must never be turned
--      into a guess.
--
--   4. current_account_id() STAYS NULL WHEN AMBIGUOUS. It is not being taught to pick.
--      A default that chooses between two of a person's accounts files a maker's product
--      in the wrong workspace and does it silently; a refusal at the insert is strictly
--      better than that. See section 4.
--
--   5. THE ERROR CODES, because the obvious one is wrong. A null account_id does NOT
--      produce 23502. RLS is evaluated before table constraints, so it produces 42501 and
--      the NOT NULL is never reached — measured, not assumed (section 7c). Match on the
--      HINT, never on 23502 and never on the sentence:
--
--        hint 'account_missing'    -> no membership yet. Transient. "Still being set up"
--                                     is true here and only here.
--        hint 'account_ambiguous'  -> two or more. The app must send an account_id (1).
--                                     Never tell this customer to wait; nothing is coming.
--        hint 'sku_limit_reached'  -> the allowance (section 6).
--        bare 42501, no hint       -> a policy refusal. It is deliberately uninformative
--                                     and the app must not dress it up as a diagnosis.
--
-- WHY THIS WAY ROUND, rather than a brand-aware default. entitlements.account_id is
-- already resolved per brand (section 10: the lateral matches the membership's own
-- brand_slug) and the app already filters that read to its BRAND_SLUG — so in the one
-- case that defeats the default, a person holding accounts on two Orchestrate brands, the
-- app has exactly one correct answer in hand before it writes anything, and the
-- deployment reading it is the deployment the answer belongs to. Teaching
-- current_account_id() the brand instead would mean knowing the brand at insert time: a
-- column default takes no argument, and this file will not hardcode a brand into a shared
-- identity pool, so it would take a session claim this project does not issue. The
-- app-side answer costs one field on an object already fetched.
--
-- WHAT THIS DOES NOT SOLVE, named so it is not mistaken for solved: entitlements resolves
-- the account by OWNERSHIP (accounts.owner_user_id), so an invited member who owns no
-- account reads account_id as null and falls back to the default. That is right while
-- they hold one membership and ambiguous the day invites let them hold two. That case
-- wants an account chooser in the UI, not a cleverer default, and invites are deferred.
--
-- WHAT RLS SCOPES, EXACTLY — because the policies are easy to read as more than they are.
-- Every policy in section 7 is is_member_of(account_id). That makes an account's rows
-- invisible to a NON-MEMBER. It does not choose between two accounts the same person
-- belongs to: for a caller with two memberships an unfiltered `select from products`
-- returns the union of both, and nothing the app reads back says which account a row came
-- from. So A CLIENT THAT CAN HOLD MORE THAN ONE ACCOUNT MUST FILTER ITS READS BY
-- account_id — the same id rule 1 has it send on writes. That is not belt-and-braces over
-- RLS; it is the part RLS was never doing.
--
-- =============================================================================
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
-- WHICH HALF OF THAT SENTENCE IS ENFORCED HERE, stated plainly because the policies below
-- read like they cover all of it and they do not. The database keeps the two accounts
-- apart from EVERYBODY ELSE: is_member_of makes each one's rows invisible to a non-member,
-- and the composite foreign key on products makes a cross-account reference an error
-- rather than a policy question. What the database does not do is keep them apart from
-- EACH OTHER in the hands of the one person who is a member of both — RLS has no notion of
-- "the account I am looking at right now", and this project issues no session claim that
-- could give it one. That separation is the client's, per the account_id contract in the
-- header: read with an account_id filter, write with an account_id. Enforcing it in the
-- database would take a per-request account claim, which is a real design and not this
-- migration.
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
-- THE NULL IS CORRECT AND IT IS NOT THE WHOLE ANSWER. Returning NULL is the right thing
-- for a function that cannot know which account was meant; it is not, on its own, a way
-- for a person with two accounts to create anything. Left there, that person's every
-- insert fails forever — and not with the NOT NULL violation everyone expects, but with a
-- bare RLS refusal that says nothing (section 7c measured it). The other half of the
-- answer is in two places: the account_id contract in the header, where the app sends the
-- account_id it read from entitlements for ITS brand and omits the column only when it
-- genuinely has none; and section 7c, which makes the remaining null case say which of
-- its two causes it is. Then this default carries the single-account case, which is every
-- case today, and the ambiguous case is both avoidable and legible when it happens.
--
-- This function is therefore deliberately NOT taught to disambiguate. Two things were
-- considered and rejected. Ordering by created_at and taking the first is the silent
-- mis-filing above. Taking a brand argument cannot work as a column default (defaults take
-- no arguments) and would otherwise need a per-request account or brand claim, which
-- Supabase will not put in the JWT here without an access-token hook — a design worth
-- having the day one login spans two brands, and not something to half-build now.
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
  'The calling user''s account when they have exactly one; NULL when they have none or more than one. The column default for products.account_id and specifications.account_id, so a client insert need never handle an account id — and cannot supply the wrong one by omission. CONTRACT: the app SHOULD send account_id explicitly (the one it read from entitlements for its brand) and omit it only when it has none; the INSERT policy refuses an account the caller is not a member of, so an explicit id weakens nothing. This function will not be taught to disambiguate — a default that picks between two of a person''s accounts mis-files their product silently. Returns NULL under service_role (no auth.uid()), which is intentional.';

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
comment on column public.specifications.created_by is
  'Who created the row. Pinned to auth.uid() by a trigger (section 7b) and immutable thereafter — the INSERT/UPDATE grants are table-wide, so without that a client could file its work under a colleague. Null only for rows written with no JWT (service_role, migrations).';

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
comment on column public.products.created_by is
  'Who created the row. Pinned to auth.uid() by a trigger (section 7b) and immutable thereafter. Null only for rows written with no JWT (service_role, migrations).';

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
  -- No account to meter against, and the allowance is not the interesting thing that went
  -- wrong. Section 7c's trigger answers this case with account_missing or
  -- account_ambiguous — and it is named to sort before this one, so on INSERT it has
  -- already raised and this line is unreachable. It stays as the guard for any future
  -- path that reaches the meter another way.
  --
  -- (It used to say the NOT NULL constraint would reject the row "a moment later with a
  -- better message". That was wrong: RLS runs before constraints, so the row dies on the
  -- policy with a bare 42501 and the constraint is never reached. See section 7c.)
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
-- READ THE PREDICATE AS WHAT IT SAYS: "an account you are a member of", not "the account".
-- These policies keep other people out. They do not pick between two accounts one person
-- belongs to, and there is no way for them to — a policy sees the row and the caller, and
-- nothing tells it which workspace the caller thinks they are in. A client that can hold
-- two accounts filters its own reads by account_id (header, THE account_id CONTRACT). Said
-- here as well as in the header because this is the section a reader lands on when they
-- want to know what "user X only accesses user X's data" is actually worth.
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
-- 7b. created_by IS THE DATABASE'S ANSWER, NOT THE CLIENT'S.
--
-- The grants above are table-wide, and `grant insert on public.specifications to
-- authenticated` covers every column of the table — created_by included. No policy narrows
-- it either: every predicate in section 7 tests account_id and nothing else. So without
-- what follows, a raw PostgREST call
--
--   POST /rest/v1/specifications
--     {"name":"x","category_id":"home-fragrance","created_by":"<a colleague's user id>"}
--
-- succeeds and files the row under that colleague, and a PATCH rewrites the attribution of
-- an existing row afterwards, on either table.
--
-- This is not a cross-account write — account_id must still be an account the caller
-- belongs to — so with one member per account the only person it deceives is its author,
-- and on its own it would be worth a note rather than a trigger. It stops being harmless
-- at precisely the point section 2 is built for: the invite flow, where 'viewer' exists
-- because "who signed this off" is the trail the whole product keeps (§5.4). An editor who
-- can attribute a composition change to the competent person who signs the sheets off has
-- broken that trail, and the row does not say so. Attribution has to be unforgeable BEFORE
-- there is a second person to forge it onto, because the rows written in between are the
-- ones nobody re-examines.
--
-- Secondary, and the reason not to leave it for the invites migration: created_by is a
-- foreign key to auth.users, so a supplied uuid coming back 23503 rather than 201 answers
-- "is this a real user id?" for any signed-in caller. Pinning the column throws the
-- client's value away before the constraint is checked, and the oracle goes with it.
--
-- THE RULE, and it is this file's rule everywhere else too: a session that HAS an
-- auth.uid() does not get to choose an identity — created_by is overwritten with it on
-- insert and frozen on update. A session with NO auth.uid() (service_role, a migration,
-- psql) is left exactly as it is: nothing running there is inferring whose data it writes,
-- and a server-side repair of a mis-attributed row has to stay possible. The same
-- asymmetry as current_account_id(), for the same reason.
--
-- A trigger rather than column-level grants. `grant insert (name, category_id, ...)` would
-- have to be re-issued in full, on both tables, every time a column is added, and the
-- failure mode of forgetting is a column nobody can write — discovered by a customer. The
-- trigger names one column and survives the next one.
--
-- Not SECURITY DEFINER: it reads auth.uid() and touches NEW, and needs no privilege it
-- would not otherwise have. search_path is pinned all the same, so a caller cannot shadow
-- what `auth.uid()` resolves to.
-- ---------------------------------------------------------------------------
create or replace function public.pin_created_by()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- No JWT: service_role, a migration, or psql. Trusted, and deliberately not
  -- second-guessed — see the rule above.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    -- Immutable once written.
    --
    -- The TG_OP branch is not decoration. OLD carries no prior row on an INSERT (PG 18
    -- reads it as null; older versions raise instead — checked, because the comment that
    -- was here first claimed the opposite), so a single unguarded
    -- `new.created_by := old.created_by` would null the column out on every insert and
    -- undo the pin. It has to be two branches.
    new.created_by := old.created_by;
  end if;

  return new;
end;
$$;

comment on function public.pin_created_by() is
  'BEFORE INSERT OR UPDATE on specifications and products: sets created_by to auth.uid() on insert and freezes it on update, so a signed-in caller cannot attribute a row to somebody else through the table-wide INSERT/UPDATE grants. Leaves the row alone when there is no auth.uid() (service_role, migrations), which keeps server-side repair possible. Also closes the auth.users existence oracle a client-supplied created_by would otherwise give.';

revoke all on function public.pin_created_by() from public, anon, authenticated;

-- One trigger per table covering both events. The SKU meter had to be split in two because
-- a WHEN clause may not reference OLD on an INSERT; this one branches on TG_OP inside the
-- body, where that restriction does not apply, so one trigger is enough.
drop trigger if exists specifications_pin_created_by on public.specifications;
create trigger specifications_pin_created_by
  before insert or update on public.specifications
  for each row execute function public.pin_created_by();

drop trigger if exists products_pin_created_by on public.products;
create trigger products_pin_created_by
  before insert or update on public.products
  for each row execute function public.pin_created_by();

-- ---------------------------------------------------------------------------
-- 7c. "NO ACCOUNT" HAS TO BE SAYABLE. The NOT NULL constraint cannot say it.
--
-- THE FACT THIS SECTION EXISTS FOR, because it is not what anybody assumes and it was
-- found by running it rather than by reading it:
--
--   A null account_id does NOT come back as a NOT NULL violation (23502). It comes back
--   as 42501, "new row violates row-level security policy".
--
-- PostgreSQL evaluates the RLS WITH CHECK expression BEFORE it checks table constraints
-- (ExecInsert: ExecWithCheckOptions, then ExecConstraints). is_member_of(null) is false,
-- so the policy refuses the row first and the NOT NULL is never reached. Verified against
-- a real server, for both an omitted column and an explicit null, for a user with no
-- membership and for one with two.
--
-- Two consequences, and both matter more than the error code itself:
--
--   * 23502 IS UNREACHABLE from a browser on these two tables. Any client code branching
--     on it to mean "you have no account yet" is dead, and the sentence it was written to
--     show has never once been shown.
--   * 42501 CANNOT CARRY THAT SENTENCE EITHER. It is the same code a genuine cross-account
--     attempt returns, and it must stay that way — a policy refusal is deliberately
--     uninformative (section 6 makes the same argument for the SKU meter). So "you have no
--     account" and "that is not your account" are indistinguishable to the app, and the
--     honest thing for a screen to say about a 42501 is nothing specific at all.
--
-- The house rule is that no screen may state as fact something the software has not
-- established. Without this trigger the app has exactly two options: say nothing useful to
-- a customer whose signup did not finish, or say something it cannot know. So the database
-- says it instead, at the only point that can tell the two cases apart — before RLS turns
-- them both into one code. This is the same device as the SKU meter's hint: a stable token
-- to match on, never the sentence, which is customer-facing copy and will be rewritten.
--
--   hint = 'account_missing'    no active membership. TRANSIENT: it resolves when signup
--                              completes, so "still being set up" is true here.
--   hint = 'account_ambiguous'  more than one active membership. PERMANENT until the app
--                              sends an account_id (see THE account_id CONTRACT in the
--                              header). "Still being set up" is false here, and telling a
--                              customer to wait for something that will never happen is
--                              the failure this file is trying not to ship.
--
-- Nothing here weakens isolation: it fires only when account_id is null, which is a row
-- that could not be written by anyone, and it counts only the CALLER's own memberships. It
-- discloses nothing about anybody else, and the cross-account case never reaches it —
-- a non-null id belonging to someone else still meets RLS and still gets a bare 42501.
--
-- INSERT only. An UPDATE cannot null the column (NOT NULL), and moving a row to an account
-- you do not belong to is a policy question that deserves the uninformative answer.
-- ---------------------------------------------------------------------------
create or replace function public.require_account_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_memberships integer;
begin
  if new.account_id is not null then
    return new;
  end if;

  -- The caller's own memberships and nobody else's — auth.uid(), never an argument, the
  -- same rule as is_member_of.
  select count(*)::integer into v_memberships
    from public.account_members am
   where am.user_id = auth.uid()
     and am.status  = 'active';

  if v_memberships > 1 then
    raise exception using
      errcode = 'P0001',
      message = 'This could not be saved because it is not clear which account it belongs to: you are a member of more than one. Choosing the account is the app''s job, not the database''s.',
      detail  = format('table=%s active_memberships=%s', tg_table_name, v_memberships),
      hint    = 'account_ambiguous';
  end if;

  raise exception using
    errcode = 'P0001',
    message = 'There is no account to save this into yet. An account is created when signup is completed.',
    detail  = format('table=%s active_memberships=%s', tg_table_name, v_memberships),
    hint    = 'account_missing';
end;
$$;

comment on function public.require_account_id() is
  'BEFORE INSERT on specifications and products: when account_id resolves to null, raises P0001 with hint = account_missing (no active membership — transient) or account_ambiguous (more than one — needs an explicit account_id from the app). Exists because RLS refuses a null account_id with a bare 42501 BEFORE the NOT NULL constraint is reached, so without it the two cases are indistinguishable from a genuine cross-account refusal and no screen can say anything true about either. Reads only the caller''s own memberships.';

revoke all on function public.require_account_id() from public, anon, authenticated;

-- Named to sort before the SKU meter on products, so the account question is answered
-- before the allowance question. "You have no account" beats "you are over your limit"
-- as an explanation of the same failed click.
drop trigger if exists specifications_account_required on public.specifications;
create trigger specifications_account_required
  before insert on public.specifications
  for each row execute function public.require_account_id();

drop trigger if exists products_account_required on public.products;
create trigger products_account_required
  before insert on public.products
  for each row execute function public.require_account_id();

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
  v_pins    integer;
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

  -- The created_by pin (section 7b). STRUCTURAL, not behavioural, and that is a decision
  -- rather than an omission: proving the behaviour needs a session carrying an auth.uid()
  -- and a specification row to write, and section 8's guarantee — that no code path in
  -- this file ever inserts a specification or a product — is worth more than the test.
  -- What is checked is what actually goes wrong: a trigger dropped in a rebuild, or
  -- attached to INSERT but not UPDATE, which would leave PATCH free to rewrite
  -- attribution. tgtype bits: 1 = FOR EACH ROW, 2 = BEFORE, 4 = INSERT, 16 = UPDATE.
  select count(*) into v_pins
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
   where not t.tgisinternal
     and c.relnamespace = 'public'::regnamespace
     and t.tgname in ('specifications_pin_created_by', 'products_pin_created_by')
     and t.tgfoid = 'public.pin_created_by()'::regprocedure
     and (t.tgtype &  1) <> 0
     and (t.tgtype &  2) <> 0
     and (t.tgtype &  4) <> 0
     and (t.tgtype & 16) <> 0;

  if v_pins <> 2 then
    raise exception
      'created_by is not pinned: expected 2 row-level BEFORE INSERT OR UPDATE triggers on specifications and products, found %. Without both, a signed-in client can file a row under another user through the table-wide grants.', v_pins
      using errcode = '22023';
  end if;

  -- The null-account answer (section 7c), same reasoning: structural. Lose these and the
  -- failure is silent — inserts still fail, exactly as before, just with a 42501 nobody
  -- can write honest copy about.
  select count(*) into v_pins
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
   where not t.tgisinternal
     and c.relnamespace = 'public'::regnamespace
     and t.tgname in ('specifications_account_required', 'products_account_required')
     and t.tgfoid = 'public.require_account_id()'::regprocedure
     and (t.tgtype & 1) <> 0
     and (t.tgtype & 2) <> 0
     and (t.tgtype & 4) <> 0;

  if v_pins <> 2 then
    raise exception
      'the null-account guard is missing: expected 2 row-level BEFORE INSERT triggers, found %. Without them a customer with no account, and one with two, both get the same bare RLS refusal.', v_pins
      using errcode = '22023';
  end if;

  -- The ordering 7c depends on: on products, the account question must be answered before
  -- the allowance question. Postgres fires same-event triggers in name order, so this is a
  -- property of the two names and would break silently if either were renamed.
  if 'products_account_required' >= 'products_enforce_sku_limit_on_insert' then
    raise exception
      'trigger name order broken: products_account_required must sort before products_enforce_sku_limit_on_insert, or a customer with no account is told they are over their SKU limit.'
      using errcode = '22023';
  end if;

  raise notice 'account_data_schema: SKU rule verified (fails open on unknown, strict at the limit); every membership has an account; created_by is pinned on both tables; a null account_id answers with a hint rather than a bare policy refusal.';
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
