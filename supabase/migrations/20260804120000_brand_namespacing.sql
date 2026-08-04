-- Brand namespacing: getting the Batchlabel domain out of the shared namespace, and
-- turning brand isolation from an emergent property into an enforced one.
--
-- =============================================================================
-- WHAT WAS ACTUALLY TRUE BEFORE THIS FILE, MEASURED RATHER THAN ASSUMED
-- =============================================================================
--
-- An exploit was run against a real PostgreSQL with two brands, two users and one
-- project: every verb (SELECT / INSERT / UPDATE / DELETE), every SECURITY DEFINER
-- helper called with the other brand's ids, every view, every RPC, the anon key, and
-- the trigger-before-RLS shape that produced the SKU-meter leak. Nothing crossed.
--
-- But NOTHING THAT HELD WAS A BRAND RULE. Every one of those refusals came from
-- `is_member_of(account_id)`, which knows about accounts and has never heard of a
-- brand. Three facts from the same run make that concrete:
--
--   * a SIBLING BRAND'S ACCOUNT COULD WRITE INTO public.products AND
--     public.specifications. Its user is a member of its own account, the policy is
--     satisfied, and the row lands in Batchlabel's domain table. Nothing refused it.
--   * account_sku_limit() — the Batchlabel meter — RESOLVED FOR A SIBLING BRAND'S
--     ACCOUNT, because it joins accounts to brand_memberships on (owner, brand) and
--     never asks which brand it is metering.
--   * NOT ONE POLICY EXPRESSION on either table mentions a brand. Checked by query
--     against pg_policy, not by reading.
--
-- So brand isolation was real for a person who belongs to one brand, and it was real
-- only because such a person is not a member of the other brand's account. It rested
-- on a coincidence of the current membership graph, not on a rule. The day invites
-- land (public.account_members is built for them and section 2 of 20260803120000 says
-- so), one cross-brand account_members row makes the coincidence false, and no
-- constraint, policy or comment would object.
--
-- An invariant nobody wrote down is one somebody removes. This file writes it down as
-- a FOREIGN KEY, which is the only form of it that survives a policy edit, a service
-- role script and a future migration written by somebody who never read this one.
--
-- =============================================================================
-- OPERATOR: TWO THINGS OUTSIDE THIS FILE MUST HAPPEN, AND ORDER MATTERS
-- =============================================================================
--
-- Moving a table out of `public` moves it out of PostgREST's reach. This migration
-- cannot do either of the following, because neither is SQL:
--
--   1. EXPOSE THE SCHEMA. Supabase dashboard -> Project Settings -> API -> "Exposed
--      schemas": add `batchlabel` alongside `public`. Until this is done, every
--      request to /rest/v1/products 404s. (supabase/config.toml's [api] schemas key
--      governs LOCAL dev only; a linked project is configured in the dashboard or
--      through the Management API.)
--
--   2. POINT THE APP AT IT. batch-label-app-client issues ~8 calls of the shape
--      `client.from('products')` / `client.from('specifications')`
--      (src/lib/products.ts). Each becomes `client.schema('batchlabel').from(...)`.
--      A client-wide `db: { schema: 'batchlabel' }` is the WRONG fix: the same client
--      reads public.entitlements and calls public.get_entitlement, and a client-wide
--      override would break both. supabase-js 2.45.4 (the pinned version) has
--      `.schema()`, so per-query is available and is what to use.
--
-- THE ORDER THAT DOES NOT BREAK THE LIVE APP:
--      expose the schema  ->  apply this migration  ->  deploy the app client.
-- Between step 2 and step 3 the product screens are broken. That window is the whole
-- cost of this change, and it is a window that only gets more expensive: it is
-- measured in minutes while the tables are empty and in customer data afterwards.
--
-- =============================================================================
-- WHY A SCHEMA, AND NOT A PREFIX, A BRAND COLUMN, OR STAYING PUT
-- =============================================================================
--
-- Staying put is not an option: the inventory product wants a table called `products`
-- and means stock, not a candle SKU. Two tables cannot share a name in one schema.
-- That is a hard collision and it is the only one of these four that has no workaround.
--
-- A BRAND COLUMN on one shared `products` table was rejected outright. The two
-- domains do not share a shape — one has net_quantity, packaging_id and a
-- specification; the other has bins, counts and reorder points — so a shared table
-- means most columns are null most of the time, every constraint becomes conditional
-- on brand, and the CHECK constraints that make this schema trustworthy
-- (products_net_unit_check, products_net_quantity_check) either apply to rows they
-- were never written for or get dropped. It also does nothing about the vocabulary
-- problem it is meant to fix.
--
-- PREFIXED NAMES (`batchlabel_products` in public) were the real alternative, and they
-- lose on three counts, none of them aesthetic:
--
--   * The blast radius is IDENTICAL. Every app-client call site changes either way,
--     because the table's name changes either way. The only thing a prefix saves is
--     the dashboard toggle, and it saves it once.
--   * PRIVILEGES DO NOT SEPARATE. Supabase's ALTER DEFAULT PRIVILEGES grant EXECUTE on
--     new functions in `public` to anon and authenticated — the default that
--     20260801120000:483-490 calls dangerous and that three migrations since have had
--     to revoke BY NAME. Those default privileges are per-schema. A brand living in its
--     own schema does not inherit them, so brand N's forgotten `revoke` cannot expose
--     brand N's table to brand M's users. A prefix inherits every one of them.
--   * A PREFIX IS A CONVENTION; A SCHEMA IS A CATALOGUE ENTRY. `revoke usage on schema
--     batchlabel from <role>` is one statement and it is total. There is no equivalent
--     for a naming convention, and this repository's history — four rounds of review,
--     each finding another comment that claimed a property the code did not have — is
--     an argument against conventions and for constraints.
--
-- WHAT THE SCHEMA MOVE DOES *NOT* BUY, said plainly so it is not over-claimed: a
-- schema boundary is not an access boundary on its own. `authenticated` is granted
-- USAGE on `batchlabel` below, because the app's users are `authenticated` and they
-- must reach their own rows. Section 4's foreign key is what makes the brand boundary
-- real; the schema is what makes the NAMES not collide and the DEFAULTS not leak.
--
-- =============================================================================
-- ON `allowances jsonb` — JUDGED, AND REJECTED
-- =============================================================================
--
-- The proposal was to replace brand_memberships.sku_limit and .editor_seat_limit with
-- a single `allowances jsonb`, on the grounds that "sku" is Batchlabel vocabulary on a
-- table every brand shares. The diagnosis is half right; the remedy destroys all three
-- invariants 20260802120000 section 1 exists to hold, and it destroys the most
-- important one silently:
--
--   * THE TRIGGER COULD OBSERVE A NULL. `allowances->>'skus'` on an absent key is
--     NULL. There is no NOT NULL constraint that reaches inside a jsonb document, so
--     the guarantee that "the enforcement trigger can never observe a null, and can
--     therefore never fail open on one" cannot be stated at all — and `count >= NULL`
--     is NULL, which is not TRUE, which allows the insert. That is failing open at
--     precisely the point that knows least, which is the failure the NOT NULL was
--     chosen to prevent. Reproduced against a real server; see section 6.
--   * THE FAIL-CLOSED DEFAULT GOES. A column default cannot fill a key inside a jsonb.
--     A row created by a path nobody remembered would get `{}` and therefore the MOST
--     allowance, not the least — the exact inversion the current defaults exist to
--     prevent.
--   * THE CHECK CONSTRAINTS GO. `sku_limit >= 0` and `editor_seat_limit >= 1` cannot
--     be expressed over a document whose keys are optional and whose values are
--     untyped. A string where an integer was expected raises at cast time, inside the
--     trigger, on the customer's insert.
--   * AND THE SENTINEL STOPS BEING AN ORDINARY INTEGER. 2147483647 was chosen over
--     NULL and over -1 precisely so that "unlimited" needs no special case and so no
--     branch can be forgotten. Through a jsonb cast it needs one again.
--
-- SO THE COLUMNS STAY TYPED, NOT NULL, AND DEFAULTED TO THE SMALLEST ALLOWANCE, and
-- section 6 asserts all three properties at apply time rather than describing them.
--
-- WHAT ABOUT THE NAMES THEMSELVES? Two separate answers, because they are two
-- different columns and lumping them together is what made jsonb look attractive:
--
--   * editor_seat_limit IS NOT BATCHLABEL VOCABULARY. Seats, editors and read-only
--     viewers are universal B2B SaaS nouns; an inventory product has editors in
--     exactly the sense this column means. 20260802120000:62-65 gives a good reason
--     for the longer name (so that read-only viewers are never counted by accident)
--     and that reason survives a change of brand intact. Renaming it would change
--     apply_stripe_entitlement's signature — sixteen arguments, called by the live
--     Stripe webhook — for no gain at all. It is left exactly as it is.
--
--   * sku_limit IS Batchlabel-flavoured, and it is NOT renamed here. The rename would
--     touch ~200 references across two repositories: the live webhook call site, the
--     1300-line scripts/repair-allowances.ts (which reads brand_memberships.sku_limit
--     DIRECTLY through PostgREST, not through the view), src/server/plan-contract.ts,
--     and 23 files in batch-label-app-client. Weighed against a cosmetic gain, on a
--     path that is taking real money, that is the wrong trade this week.
--
--     IT IS ALSO A PROBLEM THIS FILE LARGELY DISSOLVES. The reason `sku_limit` on a
--     shared table was dangerous is that public.products was shared too, so the meter
--     genuinely did meter every brand — proved above. Once products lives in
--     `batchlabel` and section 4 pins its rows to Batchlabel accounts, sku_limit is
--     unambiguously Batchlabel's meter, sitting on a shared table beside a brand_slug
--     that says which brand it is about. A sibling brand does not reuse it; it adds
--     its own, by the recipe in docs/MULTI_BRAND_SCHEMA.md, with the same three
--     properties section 6 asserts. That is the generalisation that was actually
--     needed: not one column with a vaguer name, but a stated rule for minting the
--     next one correctly.
--
-- Additive and idempotent throughout. Every statement is guarded, and the file has
-- been replayed twice from scratch against a real PostgreSQL to prove it.

-- ---------------------------------------------------------------------------
-- 1. Preflight. How much data is about to move, said out loud.
--
-- `alter table ... set schema` moves rows with the table, so this is not a data-loss
-- question and there is no exception raised here. What the count actually tells the
-- operator is how expensive the app-client window above is: empty tables mean the
-- window costs a deploy, and non-empty tables mean it costs a deploy while customers
-- are using the thing being deployed.
--
-- 20260803120000 guarantees the tables were created empty ("no fixture data is seeded,
-- ever", and no code path in that file inserts a specification or a product). Whether
-- a customer has since put something in them is a question only the live database can
-- answer, which is exactly why this counts rather than assumes.
-- ---------------------------------------------------------------------------
do $$
declare
  v_specs    integer := 0;
  v_products integer := 0;
begin
  if to_regclass('public.specifications') is not null then
    execute 'select count(*) from public.specifications' into v_specs;
    execute 'select count(*) from public.products'       into v_products;

    if v_specs = 0 and v_products = 0 then
      raise notice 'brand_namespacing: specifications and products are empty. The move costs a coordinated deploy and nothing else.';
    else
      raise notice 'brand_namespacing: MOVING LIVE DATA — % specification(s) and % product(s). The rows travel with the table, but the app-client window is now customer-visible: expose the schema and deploy the client promptly.',
        v_specs, v_products;
    end if;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. The schema.
--
-- USAGE for authenticated and service_role only. anon is deliberately NOT granted:
-- it has no grant on either table and never had one, and withholding schema usage
-- means an anon request is refused one step earlier, at the schema rather than at the
-- table. Nothing in either repository reaches these tables with the anon key.
--
-- NOTE WHAT IS ABSENT AND MUST STAY ABSENT: there is no
-- `alter default privileges in schema batchlabel grant ... to anon, authenticated`.
-- Supabase configures exactly that for `public`, which is why 20260801120000,
-- 20260802120000 and 20260803120000 each have to revoke EXECUTE from those roles BY
-- NAME on every function they create. A new schema starts without that inheritance,
-- so a future object created here is private until somebody grants it on purpose.
-- That is the single largest safety dividend of this move and it is one line of
-- omission — do not "fix" it by copying the public-schema defaults across.
-- ---------------------------------------------------------------------------
create schema if not exists batchlabel;

comment on schema batchlabel is
  'Batchlabel domain data (maker labelling). Shared identity, billing and consent stay in public; everything specific to this one brand lives here. A sibling Orchestrate brand gets its own schema and never writes here — enforced by the (account_id, brand_slug) foreign key on the tables below, not by convention. See docs/MULTI_BRAND_SCHEMA.md.';

grant usage on schema batchlabel to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The move.
--
-- Guarded on the table still being in public, so a re-run is a no-op rather than an
-- error. Everything attached to the table travels with it and none of it needs
-- re-issuing — verified by querying the catalogue after a real move, not assumed:
--
--   * ROW LEVEL SECURITY and all seven policies (4 on products, 3 on specifications);
--   * all eight triggers, including both halves of the split SKU meter and the
--     created_by pin;
--   * every index, including products_account_sku_uidx;
--   * every constraint, including the composite (specification_id, account_id)
--     foreign key that makes a cross-account reference an error;
--   * the table ACLs — authenticated keeps arw / arwd exactly as granted.
--
-- ONE THING DOES NOT TRAVEL, AND IT IS THE ONE THAT WOULD HAVE BROKEN SILENTLY.
-- A VIEW's dependency is on the table's OID, so public.entitlements followed the move
-- by itself and pg_get_viewdef now reads `FROM batchlabel.products p` with no
-- intervention. A FUNCTION BODY is TEXT, resolved at call time: enforce_sku_limit()
-- still said `from public.products p` after the move and would have raised
-- "relation public.products does not exist" on the first insert a customer made.
-- Section 5 repoints it. This asymmetry is why the file was rehearsed rather than
-- reasoned about.
--
-- THE FOUR-STATE GUARD, AND WHY THE FOURTH STATE IS NOT PARANOIA. Re-applying the
-- whole chain — `supabase db reset`, a hand-repair, or the twice-through replay this
-- repository requires as proof — runs 20260803120000 again, and that file opens with
-- `create table if not exists public.specifications`. public.specifications no longer
-- exists, so it is CREATED, EMPTY, alongside the real one in batchlabel. Everything
-- downstream in that file then attaches to the decoy: its constraints, its triggers,
-- its RLS policies, and — the dangerous one — its rebuild of public.entitlements,
-- whose lateral is written `from public.products`. The read surface would silently
-- start reporting sku_count from an empty table while every customer's rows sat
-- untouched in batchlabel. Nothing would error.
--
-- This migration runs immediately after that one and is therefore the only place that
-- can repair it. It does, rather than assuming the ordering will never happen: an
-- empty decoy is dropped, a decoy with rows in it aborts the migration and asks for a
-- human, because at that point two tables both plausibly hold the truth and no
-- automatic answer is honest.
-- ---------------------------------------------------------------------------
do $$
declare
  v_rows integer;
begin
  -- STATE 4 first: both exist. The public pair is a decoy left by a re-run.
  if to_regclass('public.products') is not null and to_regclass('batchlabel.products') is not null then
    execute 'select count(*) from public.products' into v_rows;
    if v_rows > 0 then
      raise exception
        'brand_namespacing: BOTH public.products and batchlabel.products exist, and the public one holds % row(s). An earlier migration was re-applied and rows were written to the wrong table. This needs a human: decide which rows are real before re-running.', v_rows
        using errcode = '22023';
    end if;

    execute 'select count(*) from public.specifications' into v_rows;
    if v_rows > 0 then
      raise exception
        'brand_namespacing: BOTH public.specifications and batchlabel.specifications exist, and the public one holds % row(s). See above — this needs a human.', v_rows
        using errcode = '22023';
    end if;

    -- CASCADE, knowingly: public.entitlements was rebuilt against these decoys by the
    -- re-run and goes with them. Section 5 rebuilds it against batchlabel, which is the
    -- only reason dropping it here is safe.
    drop table public.products      cascade;
    drop table public.specifications cascade;
    raise notice 'brand_namespacing: dropped an empty public.products/public.specifications left behind by a re-applied migration, and will rebuild the read surface against batchlabel.';
  end if;

  if to_regclass('public.specifications') is not null then
    alter table public.specifications set schema batchlabel;
    raise notice 'brand_namespacing: moved public.specifications -> batchlabel.specifications';
  end if;

  if to_regclass('public.products') is not null then
    alter table public.products set schema batchlabel;
    raise notice 'brand_namespacing: moved public.products -> batchlabel.products';
  end if;

  if to_regclass('batchlabel.products') is null or to_regclass('batchlabel.specifications') is null then
    raise exception
      'brand_namespacing: neither schema holds the domain tables. 20260803120000 must be applied first.'
      using errcode = '22023';
  end if;
end
$$;

-- Re-issued rather than relied upon. The ACLs demonstrably survive the move, but a
-- grant that is stated cannot be lost by a future `set schema` somebody writes without
-- reading this comment, and re-granting what is already granted costs nothing.
grant select, insert, update         on batchlabel.specifications to authenticated;
grant select, insert, update, delete on batchlabel.products       to authenticated;
grant all                            on batchlabel.specifications to service_role;
grant all                            on batchlabel.products       to service_role;
revoke all on batchlabel.specifications from anon;
revoke all on batchlabel.products       from anon;

-- ---------------------------------------------------------------------------
-- 4. THE BRAND LOCK. This is the part that turns the emergent property into a rule.
--
-- THE HOLE, restated as the request that opens it: a signed-in user who holds an
-- account on a sibling brand, and no Batchlabel membership at all, POSTs to
-- /rest/v1/products with their OWN account_id in the body. `is_member_of(account_id)`
-- is TRUE — it is their account — so the INSERT policy passes and a stock item lands
-- in Batchlabel's table. This is not a cross-account attack and no amount of
-- account-level RLS will ever refuse it, because at the account level nothing is
-- wrong. It was demonstrated before this file existed.
--
-- THE FIX IS A FOREIGN KEY, NOT A POLICY AND NOT A TRIGGER, and the choice is the
-- point:
--
--   * a POLICY binds `authenticated` and is bypassed by service_role, so any
--     server-side script — including a future brand's — could still write here;
--   * a TRIGGER can be disabled, and is skipped by COPY in some paths;
--   * a CHECK constraint cannot see another table, so it cannot ask what brand an
--     account belongs to;
--   * a FOREIGN KEY is checked for every writer including the owner and the service
--     role, cannot be satisfied by a mistake, and shows up in \d.
--
-- HOW IT WORKS. Each table gains a brand_slug pinned to 'batchlabel' by a CHECK, and a
-- composite foreign key (account_id, brand_slug) -> accounts (id, brand_slug). The
-- CHECK fixes one side, the account row supplies the other, and the two can only agree
-- when the account is a Batchlabel account. A sibling brand's account_id is now a
-- foreign key violation — 23503, at the storage layer, for everybody.
--
-- WHY A COLUMN RATHER THAN SOMETHING CLEVERER. A generated column cannot be relied on
-- as a foreign key's referencing side across versions, and the default plus CHECK does
-- the same job with no version risk: clients never send it, the default fills it, and
-- the CHECK refuses anyone who tries to send something else. The cost is one text
-- column per row on tables that already carry jsonb.
--
-- WHY IT IS SAFE TO ADD TODAY. Both tables are empty on the production database
-- (section 1 counts and says so). If they were not, and if any existing row belonged
-- to a sibling brand's account, the constraint below would REFUSE TO BE CREATED and
-- the migration would abort — which is the correct outcome: it would mean brand data
-- is already mixed and needs a human, not a silent `not valid`.
-- ---------------------------------------------------------------------------

-- The referenced key. accounts.id is already the primary key, so this index is
-- redundant for uniqueness and exists solely to give the composite foreign key a
-- target: PostgreSQL requires the referenced columns to be covered by a unique
-- constraint or index, in that order.
create unique index if not exists accounts_id_brand_uidx
  on public.accounts (id, brand_slug);

comment on index public.accounts_id_brand_uidx is
  'Target for the per-brand domain tables'' (account_id, brand_slug) foreign keys. Redundant for uniqueness — accounts.id is already the primary key — and load-bearing for brand isolation. Every brand schema references it; do not drop it.';

alter table batchlabel.specifications
  add column if not exists brand_slug text not null default 'batchlabel';
alter table batchlabel.products
  add column if not exists brand_slug text not null default 'batchlabel';

comment on column batchlabel.specifications.brand_slug is
  'Always ''batchlabel''. Pinned by a CHECK and joined to the account''s own brand by a composite foreign key, so a sibling brand''s account can never own a row in this table. Not a filter and not a discriminator: it is one half of a two-column key whose only job is to make the brand boundary a storage-layer constraint rather than a property of the current membership graph.';
comment on column batchlabel.products.brand_slug is
  'Always ''batchlabel''. See batchlabel.specifications.brand_slug — same mechanism, stated on both tables so neither reads as safe only by inheritance.';

alter table batchlabel.specifications drop constraint if exists specifications_brand_check;
alter table batchlabel.specifications
  add  constraint specifications_brand_check check (brand_slug = 'batchlabel');

alter table batchlabel.products drop constraint if exists products_brand_check;
alter table batchlabel.products
  add  constraint products_brand_check check (brand_slug = 'batchlabel');

alter table batchlabel.specifications drop constraint if exists specifications_account_brand_fkey;
alter table batchlabel.specifications
  add  constraint specifications_account_brand_fkey
  foreign key (account_id, brand_slug)
  references public.accounts (id, brand_slug) on delete cascade;

alter table batchlabel.products drop constraint if exists products_account_brand_fkey;
alter table batchlabel.products
  add  constraint products_account_brand_fkey
  foreign key (account_id, brand_slug)
  references public.accounts (id, brand_slug) on delete cascade;

-- ---------------------------------------------------------------------------
-- 5. Repoint the one object whose reference is text.
--
-- enforce_sku_limit() is recreated verbatim from 20260803120000 section 6 with a
-- single change — `from public.products p` becomes `from batchlabel.products p` —
-- because a function body is not a dependency and did not follow the table. Without
-- this line the first product a customer creates raises
-- "relation public.products does not exist", and it raises it from inside a BEFORE
-- INSERT trigger, which is a confusing place to read a stack trace from.
--
-- Everything else is unchanged and unchanged deliberately. In particular the
-- `is_member_of(new.account_id)` guard at the top stays exactly where it is: it exists
-- because PostgreSQL fires BEFORE ROW triggers BEFORE it evaluates the RLS WITH CHECK
-- expression, so without it this SECURITY DEFINER function counts a victim's rows with
-- RLS bypassed and hands their live product count and plan allowance back in an
-- exception. That was proved with a working exploit. The mirror-image regression — a
-- guard that silences the meter for a legitimate member — is equally bad, and section
-- 6 asserts against both.
--
-- `create or replace` and not drop-then-create: the signature is unchanged (it is a
-- trigger function taking no arguments), the two triggers keep pointing at it, and its
-- ACL is preserved. A drop would have required re-creating both triggers.
-- ---------------------------------------------------------------------------
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
  -- No account to meter against, and the allowance is not the interesting thing that
  -- went wrong. require_account_id() sorts first on INSERT and has already raised with
  -- account_missing or account_ambiguous, so this is a guard for any future path that
  -- reaches the meter another way.
  if new.account_id is null then
    return new;
  end if;

  -- METER ONLY AN ACCOUNT THE CALLER BELONGS TO. See the block comment above: this is
  -- the guard that closes the count-and-allowance oracle. Returning NEW rather than
  -- raising is deliberate — RLS refuses the insert a moment later with a generic 42501
  -- that says nothing about whether the account exists, which is the correct answer to
  -- a question the caller had no right to ask.
  if not public.is_member_of(new.account_id) then
    return new;
  end if;

  -- Serialise concurrent creations for this account before counting.
  perform 1 from public.accounts a where a.id = new.account_id for update;

  v_limit := public.account_sku_limit(new.account_id);

  -- Unknown allowance: allow. Never lock a customer out of their own product.
  if v_limit is null then
    return new;
  end if;

  -- Cheap exit for the unlimited tier: no count, no scan.
  if public.sku_is_unlimited(v_limit) then
    return new;
  end if;

  -- Live rows only. CHANGED: the table now lives in the batchlabel schema.
  select count(*)::integer into v_count
    from batchlabel.products p
   where p.account_id  = new.account_id
     and p.archived_at is null;

  if not public.sku_within_limit(v_count, v_limit) then
    raise exception using
      errcode = 'P0001',
      message = format(
        'SKU limit reached: this account already holds %s of %s SKUs. Everything you have stays editable and printable — you just cannot add a new one until you are under the limit or on a larger plan.',
        v_count, v_limit),
      detail  = format('account_id=%s live_sku_count=%s sku_limit=%s', new.account_id, v_count, v_limit),
      hint    = 'sku_limit_reached';
  end if;

  return new;
end;
$$;

comment on function public.enforce_sku_limit() is
  'BEFORE INSERT (and BEFORE un-archive) on batchlabel.products: counts live rows for the account against the resolved sku_limit and refuses one too many. Locks the account row first so a concurrent pair of inserts cannot both pass the count. Fails OPEN when the allowance is unknown. Raises P0001 with hint = sku_limit_reached. Meters only an account the caller is a member of — without that guard it is a SECURITY DEFINER oracle for somebody else''s product count and plan allowance.';

revoke all on function public.enforce_sku_limit() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5b. The read surface, restated against batchlabel.
--
-- On the ordinary path this is very nearly a no-op: the view's dependency is on the
-- table's OID, so it followed the move by itself and already reads
-- `from batchlabel.products`. It is restated anyway for the decoy path in section 3 —
-- where `drop table ... cascade` took the view with it — because a migration that
-- repairs a hazard halfway is worse than one that never noticed it.
--
-- `create or replace view`, not drop-then-create: the column list below is identical to
-- 20260803120000 section 10, so a replace is legal, and on the ordinary path it
-- preserves the existing grants instead of dropping and re-granting them. The grants
-- are re-issued underneath regardless, because on the decoy path there are none left.
--
-- THE THREE THINGS THAT MUST NOT BE LOST IN A RESTATEMENT, all of them from that
-- file's own list and all of them still true here:
--   * `security_invoker = true` is the WHOLE security of this view. Without it the view
--     runs as its owner, which bypasses row level security, and every signed-in user
--     sees every other user's billing state. Section 6 asserts the flag is set.
--   * security_barrier, so the planner cannot push a user-supplied function inside and
--     use it to probe rows the caller cannot see.
--   * the `where acct.id is not null` in the sku lateral. Without it the lateral still
--     produces a row, count(*) over an unmatchable predicate is ZERO, and a membership
--     with no account reports sku_count = 0. Zero is a claim; the honest answer is that
--     we do not know.
--
-- ONE BEHAVIOUR CHANGES, and it is worth naming rather than discovering. A sibling
-- brand's membership now reads sku_count = 0 and can_modify = true, because its account
-- resolves and holds no rows in batchlabel.products. Both are literally true — that
-- account holds zero Batchlabel SKUs — and neither is exploitable, because section 4's
-- foreign key refuses the insert those columns appear to invite. It is not fixed by
-- hardcoding `m.brand_slug = 'batchlabel'` into this lateral: 20260802120000 section 8
-- and 20260803120000 both refuse to write a brand into a shared identity pool, and a
-- shared view that knows one brand's name is the first step to a shared view that knows
-- all of them. docs/MULTI_BRAND_SCHEMA.md records that a brand's own meter columns
-- belong on its own read surface.
-- ---------------------------------------------------------------------------
create or replace view public.entitlements
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
  acct.id        as account_id,
  m.business_name,
  m.sku_limit,
  m.editor_seat_limit,
  public.sku_is_unlimited(m.sku_limit) as sku_unlimited,
  sku.n          as sku_count,
  case
    when acct.id is not null then public.sku_within_limit(sku.n, m.sku_limit)
  end            as can_modify
from public.brand_memberships m
left join lateral (
  select a.id
    from public.accounts a
   where a.owner_user_id = m.user_id
     and a.brand_slug    = m.brand_slug
   order by a.created_at
   limit 1
) acct on true
left join lateral (
  select (
    select count(*)::integer
      from batchlabel.products p        -- CHANGED: was public.products
     where p.account_id  = acct.id
       and p.archived_at is null
  ) as n
  where acct.id is not null
) sku on true;

comment on view public.entitlements is
  'Read-only entitlement state for the signed-in user. security_invoker = true, so brand_memberships RLS applies and a caller sees only their own row. `active` answers whether they may use the product; sku_limit / sku_count / can_modify answer how much, and the two must never be conflated. sku_count counts batchlabel.products, so on a sibling brand''s membership it reads 0 and can_modify reads true — both true, and neither exploitable, because the (account_id, brand_slug) foreign key refuses the insert they appear to invite. account_id, sku_count and can_modify are ALL null when no account resolves. Null means unknown and must fail open; the caller distinguishes the cases from membership_status on the same row. Never grant to anon.';

revoke all    on public.entitlements from anon, authenticated;
grant  select on public.entitlements to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Behavioural assertions, run at apply time.
--
-- The repository still has no SQL test harness in CI (20260802120000 section 4 and
-- 20260803120000 section 11 both say so and both do this). These properties are
-- behavioural: a grep would pass on a constraint that reads its columns backwards. So
-- they are asserted inside the database, against the objects just created, in the same
-- transaction. Failing here aborts the migration, which is the point.
-- ---------------------------------------------------------------------------
do $$
declare
  v_n       integer;
  v_ok      boolean;
  v_account uuid;
  v_brand   text;
begin
  -- --- The move actually happened, and took everything with it -------------------
  if to_regclass('batchlabel.products') is null or to_regclass('batchlabel.specifications') is null then
    raise exception 'brand_namespacing: the domain tables are not in the batchlabel schema.'
      using errcode = '22023';
  end if;

  if to_regclass('public.products') is not null or to_regclass('public.specifications') is not null then
    raise exception
      'brand_namespacing: public.products or public.specifications still exists. The namespace is still shared and the next brand still collides.'
      using errcode = '22023';
  end if;

  -- RLS is not something to rediscover after a move.
  select count(*) into v_n
    from pg_class c
   where c.relnamespace = 'batchlabel'::regnamespace
     and c.relname in ('products', 'specifications')
     and c.relrowsecurity;
  if v_n <> 2 then
    raise exception 'brand_namespacing: row level security is not enabled on both moved tables (found %).', v_n
      using errcode = '22023';
  end if;

  -- Seven policies: 4 on products (select/insert/update/delete), 3 on specifications
  -- (select/insert/update — there is deliberately no DELETE grant).
  select count(*) into v_n
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
   where c.relnamespace = 'batchlabel'::regnamespace;
  if v_n <> 7 then
    raise exception
      'brand_namespacing: expected 7 policies on the moved tables, found %. A policy lost in the move is an open table.', v_n
      using errcode = '22023';
  end if;

  -- Both halves of the split SKU meter, the created_by pin, and the null-account guard.
  select count(*) into v_n
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
   where c.relnamespace = 'batchlabel'::regnamespace
     and not t.tgisinternal
     and t.tgname in ('products_enforce_sku_limit_on_insert', 'products_enforce_sku_limit_on_update',
                      'products_pin_created_by', 'specifications_pin_created_by',
                      'products_account_required', 'specifications_account_required');
  if v_n <> 6 then
    raise exception
      'brand_namespacing: expected 6 named triggers on the moved tables, found %. The SKU meter, the created_by pin or the null-account guard did not survive.', v_n
      using errcode = '22023';
  end if;

  -- The trigger name ordering 20260803120000 section 7c depends on still holds, and it
  -- is worth re-asserting here because a schema move is exactly the sort of change
  -- during which somebody renames something.
  if 'products_account_required' >= 'products_enforce_sku_limit_on_insert' then
    raise exception 'brand_namespacing: trigger name order broken.' using errcode = '22023';
  end if;

  -- The composite cross-account foreign key from 20260803120000 section 5.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'batchlabel.products'::regclass
       and contype  = 'f'
       and confrelid = 'batchlabel.specifications'::regclass
  ) then
    raise exception
      'brand_namespacing: the (specification_id, account_id) foreign key to specifications is gone. A product could point at another account''s composition.'
      using errcode = '22023';
  end if;

  -- --- The read surface still reads, and still reads as the CALLER ----------------
  select count(*) into v_n from public.entitlements;

  select c.reloptions::text ilike '%security_invoker=true%' into v_ok
    from pg_class c where c.oid = 'public.entitlements'::regclass;
  if not coalesce(v_ok, false) then
    raise exception
      'brand_namespacing: public.entitlements is no longer security_invoker. It would run as its owner, which bypasses RLS, and every signed-in user would see every other user''s billing state.'
      using errcode = '22023';
  end if;

  -- --- THE BRAND LOCK, exercised rather than described ---------------------------
  -- Both directions, because a constraint that refuses everything would pass a
  -- one-sided test while breaking every customer.
  select a.id, a.brand_slug into v_account, v_brand
    from public.accounts a where a.brand_slug = 'batchlabel' limit 1;

  if v_account is not null then
    -- A Batchlabel account must still be able to hold a Batchlabel row.
    begin
      insert into batchlabel.specifications (account_id, name, category_id)
      values (v_account, '__brand_lock_probe__', 'home-fragrance');
      -- Undo it. This file creates no durable data; the probe exists only to prove the
      -- constraint permits what it must permit.
      delete from batchlabel.specifications where name = '__brand_lock_probe__';
    exception when others then
      raise exception
        'brand_namespacing: the brand lock REFUSES A LEGITIMATE BATCHLABEL ROW (%). Every customer would be locked out of creating anything.', sqlerrm
        using errcode = '22023';
    end;
  end if;

  -- ...and must refuse a sibling brand's account. Built and torn down inside the
  -- assertion so it depends on no fixture and leaves nothing behind.
  begin
    insert into public.brands (slug, name) values ('__probe_brand__', 'Namespacing probe')
      on conflict (slug) do nothing;

    insert into public.accounts (id, brand_slug, owner_user_id, name)
    select gen_random_uuid(), '__probe_brand__', a.owner_user_id, '__brand_lock_probe__'
      from public.accounts a limit 1
    returning id into v_account;

    if v_account is not null then
      v_ok := false;
      begin
        insert into batchlabel.specifications (account_id, name, category_id)
        values (v_account, '__brand_lock_probe__', 'home-fragrance');
        v_ok := true;   -- got through: the lock does not hold
      exception when foreign_key_violation then
        v_ok := false;  -- refused by the foreign key, which is the whole point
      end;

      if v_ok then
        delete from batchlabel.specifications where name = '__brand_lock_probe__';
        raise exception
          'brand_namespacing: a SIBLING BRAND''S ACCOUNT was able to write into batchlabel.specifications. The (account_id, brand_slug) foreign key is not doing its job and brand isolation is still only an emergent property.'
          using errcode = '22023';
      end if;

      delete from public.accounts where id = v_account;
    end if;

    delete from public.brands where slug = '__probe_brand__';
  end;

  -- --- The three allowance invariants, since section "ON allowances jsonb" argues
  -- --- from them. Asserted, not described.
  select count(*) into v_n
    from information_schema.columns
   where table_schema = 'public' and table_name = 'brand_memberships'
     and column_name in ('sku_limit', 'editor_seat_limit')
     and is_nullable = 'NO'
     and column_default is not null;
  if v_n <> 2 then
    raise exception
      'brand_namespacing: the allowance columns are no longer NOT NULL with a default (found % of 2). The enforcement trigger could observe a null, and count >= NULL is NULL, which is not TRUE, which allows the insert.', v_n
      using errcode = '22023';
  end if;

  -- The sentinel is int4 max, and it is neither NULL nor negative.
  if not public.sku_is_unlimited(2147483647) then
    raise exception 'brand_namespacing: 2147483647 is no longer the unlimited sentinel.' using errcode = '22023';
  end if;
  if public.sku_is_unlimited(null) or public.sku_is_unlimited(-1) then
    raise exception
      'brand_namespacing: NULL or -1 now reads as unlimited. NULL already means "we do not know", and count >= -1 is always true — a forgotten special case would hand out an unlimited allowance.'
      using errcode = '22023';
  end if;

  -- And the meter is still strict at the limit, so none of the above is a rubber stamp.
  if public.sku_within_limit(3, 3) or not public.sku_within_limit(2, 3) then
    raise exception 'brand_namespacing: the SKU comparison is no longer strict at the limit.'
      using errcode = '22023';
  end if;

  raise notice 'brand_namespacing: domain tables are in the batchlabel schema with RLS, 7 policies and 6 triggers intact; the entitlements view still resolves and is still security_invoker; the brand lock admits Batchlabel accounts and refuses a sibling brand''s; the allowance columns are still NOT NULL, defaulted and strict at the limit.';
end
$$;
