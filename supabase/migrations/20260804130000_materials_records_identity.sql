-- The tables the four build areas need: materials, the record log, artefacts, and the
-- printed business identity.
--
-- =============================================================================
-- WHAT THIS FILE IS FOR, AND THE ONE DEFECT IT IS WRITTEN AGAINST
-- =============================================================================
--
-- The app has nine screens and four domain tables. The gap between those two numbers is
-- filled, today, by constants: a 739-line invented ingredient catalogue rendered as
-- reference data, a `disabled readOnly` Settings page bound to a placeholder business
-- identity, an 82-line Records shell, fifteen obligations that are permanently
-- outstanding because `products.obligations` is read by two call sites and written by
-- none, and an SDS "4 sections need a competent person" row that is always 4 because the
-- number is hardcoded.
--
-- Every one of those is the same defect: A SCREEN THAT ASSERTS SOMETHING THE SOFTWARE
-- NEVER ESTABLISHED. This file creates the storage that lets those screens state facts
-- instead. It does not make any of them true by itself — a table is not a feature — and
-- three of its design decisions exist specifically so that a half-built screen CANNOT
-- accidentally claim more than it has:
--
--   * batchlabel.reference_material_versions.provenance is NOT NULL over a three-value
--     CHECK, one of whose values is 'illustrative-example'. A reference material cannot
--     be published without saying where its hazard data came from, so "is this real or is
--     it made up?" is a column read rather than an act of faith.
--   * batchlabel.artefacts.is_placeholder DEFAULTS TO TRUE. Label generation may stay toy
--     — the app-server functions are not written — but an artefact row produced by a stub
--     is marked as a stub by the default, and a screen has to opt in to calling anything
--     produced.
--   * batchlabel.record_events is append-only, enforced by a trigger, not by a habit. A
--     log a screen can rewrite is not evidence of anything.
--
-- =============================================================================
-- THE TWO RULES THIS FILE INHERITS, RESTATED SO THEY ARE NOT RE-DERIVED
-- =============================================================================
--
-- 1. EVERY ACCOUNT-SCOPED DOMAIN TABLE LIVES IN `batchlabel`, CARRIES brand_slug PINNED BY
--    A CHECK, AND HAS THE COMPOSITE FOREIGN KEY (account_id, brand_slug) -> accounts
--    (id, brand_slug). 20260804120000 section 4 makes the argument in full: a foreign key
--    binds service_role and the table owner, a policy does not; a trigger can be disabled;
--    a CHECK cannot see another table. Fourteen tables below follow it exactly.
--
-- 2. EVERY ROW-LEVEL PREDICATE IS public.is_member_of(account_id). Never auth.uid() =
--    something. 20260803120000 section 7: for a single-member account the two are
--    identical today, which is exactly why the right one has to be written before invites
--    land.
--
-- THE ONE DEVIATION, DECLARED RATHER THAN SLIPPED IN. Two tables here are BRAND-GLOBAL and
-- have no account_id at all: reference_materials and reference_material_versions. They are
-- the catalogue Batchlabel ships, not anybody's data, so a composite foreign key to
-- `accounts` is not merely unnecessary, it is unwritable — there is no account for a row
-- that belongs to every account. They still carry brand_slug pinned by a CHECK, referencing
-- public.brands (slug), so a sibling brand's catalogue cannot land in Batchlabel's.
--
-- What replaces the brand lock on those two is stronger than a policy, not weaker:
-- `authenticated` IS GRANTED SELECT AND NOTHING ELSE. There is no INSERT, UPDATE or DELETE
-- grant to revoke later, RLS is enabled with a read-only policy underneath, and section 12
-- asserts all four verbs from a real signed-in session. A table nobody can write needs no
-- isolation between writers.
--
-- =============================================================================
-- MATERIALS: THE HYBRID, AND THE TWO QUESTIONS RHYS ASKED FOR ANSWERS TO
-- =============================================================================
--
-- The ruling is a shipped reference catalogue PLUS the maker's own, with the maker able to
-- override ours. Two questions had to be decided and written down. Here they are, decided.
--
-- ── QUESTION 1: WHICH WINS WHEN BOTH EXIST? ───────────────────────────────────
--
-- THE MAKER'S OWN ROW WINS. Always, unconditionally, whenever one exists for that account.
-- Ours is the fallback and only ever the fallback. There is no "unless ours is newer",
-- no confidence score and no merge.
--
-- WHY, and it is not a preference:
--
--   * THE DOCUMENT IN THE MAKER'S HAND IS THE AUTHORITY. A CLP classification is read off
--     the safety data sheet for the drum that is actually in their workshop. We hold a
--     generic description of a material with that name; they hold the document for the
--     batch they bought. When the two disagree, theirs is the one a regulator will ask to
--     see, and ours is a guess about a supplier we have never contacted.
--   * IT IS THEIR LEGAL RESPONSIBILITY, NOT OURS. The supplier block on the label names
--     them. A tool that could silently outrank a maker's own hazard data with its own
--     would be putting our guess on their legal document.
--   * AN UNCONDITIONAL RULE FITS IN ONE SENTENCE ON A SCREEN. Any rule with an exception
--     has to be explained at the moment a classification changes, which is the moment the
--     maker is least able to audit it. Every conditional variant considered — newest
--     version wins, most-specific wins, ours wins for hazards and theirs for everything
--     else — reintroduces the failure question 2 exists to prevent.
--
-- The rule is not left to be re-implemented by each caller. batchlabel.resolved_materials
-- (section 5) is a security_invoker view that applies it once, and it reports `source` as
-- 'account' or 'reference' on every row, so a screen can say which one it is showing
-- instead of the user having to know.
--
-- ── QUESTION 2: WHAT HAPPENS TO A MAKER WHO BUILT PRODUCTS ON A SHARED ROW
--                WHEN WE LATER UPDATE IT? ──────────────────────────────────────
--
-- NOTHING HAPPENS, BECAUSE WE CANNOT UPDATE IT. That is the whole answer, and it is a
-- storage-layer fact rather than a promise:
--
--   * batchlabel.reference_material_versions IS APPEND-ONLY FOR EVERYBODY, INCLUDING
--     service_role AND THE TABLE OWNER. A trigger refuses every UPDATE and every DELETE,
--     unconditionally — no auth.uid() escape hatch, unlike the append-only rule on
--     record_events below, because there is no legitimate caller. A correction to a
--     published classification is a NEW VERSION with a higher number. The old one stays
--     exactly as it was, for ever.
--   * A SPECIFICATION PINS A VERSION, NOT A MATERIAL. batchlabel.specification_material_pins
--     holds a foreign key to a specific reference_material_versions row (or to the maker's
--     own material). So the classification a product was built on is reachable by a key
--     that names an immutable row.
--   * ADOPTING A NEWER VERSION IS AN ACT, AND IT IS LOGGED. The maker moves the pin, which
--     is a write they make; the intended companion is a record_events row of kind
--     'material.version_adopted'. Until they do, publishing version 7 of our data changes
--     nothing about their product except that a screen may now truthfully say a newer
--     version exists — a fact established by a row existing, which is the only kind of
--     claim this codebase is allowed to render.
--
-- "An override that silently changes a classification under a maker is the worst outcome
-- here." It is now unreachable: there is no statement anybody can execute that alters the
-- data a live pin points at.
--
-- ── THE CATALOGUE SHIPS EMPTY, AND THAT IS THE HONEST STATE ────────────────────
--
-- src/lib/catalog.ts is 739 lines of INVENTED hazard classifications, allergen
-- percentages and IFRA limits, attributed to suppliers that do not exist. The ruling is
-- that a shipped catalogue must be genuinely real or obviously and honestly a starter set,
-- and that no more invented hazard data may be dressed as reference data.
--
-- SO THIS FILE SEEDS NOTHING. reference_materials and reference_material_versions are
-- created with zero rows and section 12 asserts they are empty. There is no real reference
-- data available to put in them today, and inventing some to make a screen look furnished
-- is precisely the defect class this whole exercise exists to end.
--
-- The `provenance` column is what makes the eventual import safe rather than a matter of
-- discipline. It is NOT NULL over exactly three values and every one of them is a claim
-- somebody has to make on the record:
--
--   'supplier-document'    read off a named supplier document we hold. document_reference,
--                          document_version and document_date are then required (a CHECK
--                          enforces it) — a provenance claim with no document behind it is
--                          the same lie in a different column.
--   'regulatory-source'    from a published regulatory list (CLP Annex VI, an IFRA
--                          standard). Same document requirement.
--   'illustrative-example' MADE UP, ON PURPOSE, TO SHOW THE SHAPE. Never to be classified
--                          from, and any screen rendering one MUST label it as an example.
--                          This value exists so that importing catalog.ts, if anybody
--                          decides to, is possible only by declaring what it is.
--
-- =============================================================================
-- BUSINESS IDENTITY: WHY ITS OWN TABLE AND NOT accounts.data
-- =============================================================================
--
-- accounts.data is jsonb and it already exists; the question was whether the printed
-- supplier block belongs there. It does not, and there are four reasons, in order of how
-- much they matter.
--
-- 1. JSONB CANNOT CARRY A NOT NULL OR A CHECK, AND THIS DATA PRINTS ON A LEGAL DOCUMENT.
--    This is not a new argument in this repository — 20260804120000 rejected
--    `allowances jsonb` for the identical reason and reproduced the failure against a real
--    server: a key absent from a jsonb document reads NULL, no constraint reaches inside a
--    document to prevent it, and every comparison downstream silently degrades. The
--    registered business name appears on the face of every label and in sections 1 and 15
--    of every safety data sheet. `data->>'registered_name'` returning NULL prints a blank
--    line under "Supplier" on a document a maker may hand to Trading Standards. A NOT NULL
--    column makes that a refused write instead.
--
--    The constraint that actually earns its keep is the smaller one: every optional field
--    carries `check (x is null or btrim(x) <> '')`. An empty string is the jsonb failure
--    mode reproduced in a text column — it is not null, so nothing complains, and it
--    prints as a blank line under a heading. Absent and empty must be the same state, and
--    only a CHECK can make them so.
--
-- 2. `accounts` IS READ-ONLY TO THE BROWSER ON PURPOSE, AND MUST STAY SO. 20260803120000
--    section 7: a client that could INSERT an account_members row could hand itself a
--    colleague's data, and a client that could INSERT an account could mint a second
--    workspace to hold a second free allowance. Granting UPDATE on accounts to make an
--    identity editor work would reopen both. The alternative — a SECURITY DEFINER RPC over
--    accounts.data — moves every field's validation into plpgsql, where it is an
--    invariant nobody wrote down rather than a constraint in \d. The brand-namespacing
--    file spends a section on why that trade is wrong.
--
-- 3. IT IS BRAND DATA AND `accounts` IS SHARED IDENTITY IN `public`. A registered supplier
--    block is a Batchlabel concept; a stockroom brand's account has no such thing. The
--    standing rule is that brand data does not go in public.
--
-- 4. IT CARRIES ITS OWN updated_at AND created_by. "Who changed the address that is on
--    that label, and when" is answerable from a row and is not from a key inside a
--    document whose timestamp covers the whole account.
--
-- WHAT IS DELIBERATELY NOT NOT NULL. Only registered_name is required. Under CLP Article
-- 17 a label must carry the supplier's name, address AND telephone number, so telephone is
-- genuinely required for a compliant print — but requiring it to SAVE would mean a maker
-- cannot record their own business name until they have typed a phone number, and the
-- screen, not the schema, is the right place to say which absences block a print. The
-- column comment names the three Article 17 elements so whoever builds that screen does
-- not have to go looking.
--
-- =============================================================================
-- RECORDS: ONE APPEND-ONLY LOG WITH A TYPED KIND
-- =============================================================================
--
-- Rhys's words: "the log that the user can look at/reference at any point and see what
-- happened and when". One chronological surface spanning batch production, label
-- print/export, and compliance events — designed as an event log with a typed kind, not
-- three tables bolted together.
--
-- batchlabel.record_events is that table. Two child tables hang off it because a
-- production event is genuinely one-to-many in two directions and neither belongs in
-- jsonb: record_event_lots (which supplier lot went into this batch) and
-- record_event_artefacts (which artefact version was applied to it).
--
-- THE RECALL QUESTION — "which batches carry the label I have just found wrong?" — is the
-- reason record_event_artefacts is a table and not a jsonb array. It is one join:
--
--     select e.batch_code, e.occurred_at, e.units
--       from batchlabel.record_events e
--       join batchlabel.record_event_artefacts ea on ea.record_event_id = e.id
--      where ea.artefact_id = :the_artefact_that_is_wrong
--        and e.kind = 'batch.produced'
--      order by e.occurred_at desc;
--
-- Section 12 RUNS that query at apply time against a probe batch and checks it returns the
-- batch and not the decoy, because "answers the recall question" is a claim and this file
-- does not get to make claims either.
--
-- APPEND-ONLY, WITH ONE ASYMMETRY THAT IS LOAD-BEARING. A trigger refuses UPDATE and
-- DELETE whenever auth.uid() is not null, and `authenticated` is granted only SELECT and
-- INSERT, so a browser can never rewrite history. A session with NO auth.uid()
-- (service_role, a migration, the cascade that runs during a GDPR erasure) is allowed
-- through — the same asymmetry, for the same reason, as public.pin_created_by(). Without
-- it, "delete this user" becomes a trigger exception, which is a poor way to discover that
-- an erasure obligation cannot be met. reference_material_versions has no such escape
-- because it has no legitimate deleter.
--
-- A wrong entry is corrected by writing another event, which is what a log is.
--
-- Additive and idempotent throughout, and replayed twice by supabase/tests/migrations.test.ts.

-- ---------------------------------------------------------------------------
-- 1. Preflight. Refuse to build on a schema that is not there.
--
-- Everything below hangs off batchlabel.products / batchlabel.specifications and
-- public.accounts. Applying against a half-migrated database would create tables whose
-- foreign keys point at nothing, which is a worse state than not applying at all.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('batchlabel.products') is null or to_regclass('batchlabel.specifications') is null then
    raise exception
      'materials_records_identity: batchlabel.products / batchlabel.specifications are missing. 20260804120000_brand_namespacing.sql must be applied first.'
      using errcode = '22023';
  end if;

  if to_regclass('public.accounts') is null then
    raise exception 'materials_records_identity: public.accounts is missing.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.brands where slug = 'batchlabel') then
    raise exception
      'materials_records_identity: public.brands has no ''batchlabel'' row, so every brand_slug CHECK below would create a table nothing can be written to.'
      using errcode = '22023';
  end if;
end
$$;

-- The referenced key for the composite (product_id, account_id) foreign keys added by
-- artefacts and record_events. products.id is already the primary key, so this index is
-- redundant for uniqueness and exists solely to give those foreign keys a target —
-- exactly as accounts_id_brand_uidx does for the brand lock. specifications already has
-- the equivalent as a table constraint (20260803120000 section 5).
create unique index if not exists products_id_account_uidx
  on batchlabel.products (id, account_id);

comment on index batchlabel.products_id_account_uidx is
  'Target for the (product_id, account_id) composite foreign keys on batchlabel.artefacts and batchlabel.record_events. Redundant for uniqueness and load-bearing for cross-account integrity: without it an artefact or a batch record could name another account''s product. Do not drop it.';

-- ---------------------------------------------------------------------------
-- 2. One helper, because a CHECK constraint may not contain a subquery.
--
-- supplier_addresses.lines is a text[] whose SHAPE IS LOAD-BEARING: the label renderer
-- indexes lines[0] and lines[length - 2] to lay a compressed address onto a small surface
-- (src/lib/identity.ts and the artefact designer). A null or blank element does not fail
-- there, it prints a blank line in the middle of a supplier address on a legal label,
-- which is the quiet version of the failure this file is about.
--
-- IMMUTABLE and side-effect free, which is what a CHECK requires. In `batchlabel`, which
-- means it inherits none of the public-schema default EXECUTE grants and is granted
-- explicitly below.
-- ---------------------------------------------------------------------------
create or replace function batchlabel.all_lines_present(p_lines text[])
returns boolean
language sql
immutable
as $$
  select p_lines is not null
     and cardinality(p_lines) > 0
     and not exists (select 1 from unnest(p_lines) as l where l is null or btrim(l) = '');
$$;

comment on function batchlabel.all_lines_present(text[]) is
  'True when every element of the array is present and non-blank. Exists because a CHECK constraint may not contain a subquery, and because a blank element in supplier_addresses.lines prints as an empty line inside a supplier address block on a label rather than raising anything.';

revoke all     on function batchlabel.all_lines_present(text[]) from public;
grant  execute on function batchlabel.all_lines_present(text[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. THE SHIPPED REFERENCE CATALOGUE. Brand-global, read-only, and empty.
--
-- Two tables, split so that identity is mutable and classification is not.
--
--   reference_materials         what the thing IS. Name, supplier, class. May be corrected
--                               and may be retired, because none of it classifies anything.
--   reference_material_versions what its SUPPLIER DOCUMENT SAYS. Hazards, allergens, IFRA
--                               limits, packaging geometry. APPEND-ONLY FOR EVERYBODY.
--
-- That split is the mechanism behind the answer to Rhys's question 2. Fixing a typo in a
-- supplier's name touches no classification and is an UPDATE. Changing a hazard code is a
-- new version and cannot be anything else.
--
-- WHY THE VERSION PAYLOAD IS jsonb HERE WHEN THE MAKER'S OWN HAZARDS GET TYPED TABLES
-- (section 4). The asymmetry is deliberate and it is about who is typing.
--
--   * These rows are IMMUTABLE and are written by us through a controlled import, never by
--     a user at a keyboard. There is no typo for a constraint to catch, and the properties
--     that make them trustworthy — provenance, a named document, and the impossibility of
--     change — are all typed columns with constraints on them.
--   * The maker's own rows are USER INPUT that ends up printed on a legal label, so there a
--     constraint is the only thing standing between a slip and a document.
--   * And today this table holds zero rows and will hold a small number for a long time.
--     Four child tables mirroring section 4's, to constrain data no human types into a
--     table that is empty, is scaffolding, not safety.
--
-- If a reference import ever becomes large or user-contributed, that reasoning expires and
-- the payload should be normalised into the section 4 tables. It is written here so the
-- reader knows it was a decision with conditions, not an oversight.
-- ---------------------------------------------------------------------------
create table if not exists batchlabel.reference_materials (
  id             uuid primary key default gen_random_uuid(),
  brand_slug     text not null default 'batchlabel' references public.brands (slug),

  -- The stable text id. src/lib/catalog.ts already keys on strings of this shape
  -- ('ing-crw45', 'pkg-tumbler-250') and specifications.base_id / fragrance_id / dye_id
  -- still hold them, so an import can preserve them rather than re-key the app.
  slug           text not null,

  material_class text not null,
  name           text not null,
  supplier       text,
  supplier_code  text,
  role           text,
  categories     text[] not null default '{}'::text[],

  -- A material we no longer publish. Existing pins keep resolving: a pin references a
  -- VERSION, and versions are never deleted, so retirement hides a row from the picker and
  -- changes nothing about a product already built on it.
  retired_at     timestamptz,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (brand_slug, slug)
);

comment on table batchlabel.reference_materials is
  'The reference catalogue Batchlabel ships: brand-global, owned by nobody, readable by every signed-in user and writable by none of them (SELECT is the only grant). Holds what a material IS; what its document SAYS lives in reference_material_versions and is immutable. SHIPS EMPTY — see this file''s header on why no invented hazard data is seeded here.';
comment on column batchlabel.reference_materials.slug is
  'The stable text id the app already uses (''ing-crw45''). specifications.fragrance_id / base_id / dye_id still hold strings of this shape, so an import can preserve them.';
comment on column batchlabel.reference_materials.retired_at is
  'Withdrawn from the picker. Never affects a product already built on it: pins reference an immutable version row, and versions are never deleted.';

alter table batchlabel.reference_materials drop constraint if exists reference_materials_brand_check;
alter table batchlabel.reference_materials
  add  constraint reference_materials_brand_check check (brand_slug = 'batchlabel');

-- 'component' IS ABSENT AND ITS ABSENCE IS THE RULING. Rhys: components are "not going to
-- be a priority for a long time, better to just get rid of it". src/lib/catalog.ts's
-- COMPONENTS array, the rohs-component-declarations obligation and the "<component> has no
-- material declaration" pipeline branch all go with it. A CHECK that does not list the
-- value is what stops it coming back through a side door.
alter table batchlabel.reference_materials drop constraint if exists reference_materials_class_check;
alter table batchlabel.reference_materials
  add  constraint reference_materials_class_check check (material_class in ('ingredient', 'packaging'));

alter table batchlabel.reference_materials drop constraint if exists reference_materials_name_check;
alter table batchlabel.reference_materials
  add  constraint reference_materials_name_check check (btrim(name) <> '');

alter table batchlabel.reference_materials drop constraint if exists reference_materials_slug_check;
alter table batchlabel.reference_materials
  add  constraint reference_materials_slug_check check (btrim(slug) <> '');

create index if not exists reference_materials_class_idx on batchlabel.reference_materials (material_class);
create index if not exists reference_materials_live_idx  on batchlabel.reference_materials (material_class) where retired_at is null;

drop trigger if exists reference_materials_set_updated_at on batchlabel.reference_materials;
create trigger reference_materials_set_updated_at
  before update on batchlabel.reference_materials
  for each row execute function public.set_updated_at();

create table if not exists batchlabel.reference_material_versions (
  id                    uuid primary key default gen_random_uuid(),
  brand_slug            text not null default 'batchlabel' references public.brands (slug),
  reference_material_id uuid not null references batchlabel.reference_materials (id),

  version               integer not null,

  -- THE HONESTY COLUMN. NOT NULL over three values, one of which is an admission.
  provenance            text not null,

  document_kind         text,
  document_reference    text,
  document_version      text,
  document_date         date,
  document_expires      date,

  -- hazards / allergens / ifra / packaging, in the shapes src/lib/model.ts already
  -- defines. See the section comment for why this half is a document and section 4's is
  -- not.
  payload               jsonb not null default '{}'::jsonb,

  notes                 text,
  published_at          timestamptz not null default now(),

  unique (reference_material_id, version)
);

comment on table batchlabel.reference_material_versions is
  'What a reference material''s document says, at one version. APPEND-ONLY FOR EVERYBODY INCLUDING service_role AND THE TABLE OWNER — a trigger refuses every UPDATE and every DELETE with no escape hatch. This is the whole of the answer to "what happens to a maker who built products on a shared row when we update it": we cannot update it. A correction is a new version with a higher number, and a specification''s pin keeps pointing at the row it was classified from.';
comment on column batchlabel.reference_material_versions.provenance is
  'Where this classification came from, and it is NOT NULL so it cannot be left unsaid. ''supplier-document'' and ''regulatory-source'' both require a named document (enforced by reference_material_versions_document_check). ''illustrative-example'' means MADE UP TO SHOW THE SHAPE — never to be classified from, and any screen rendering one must label it as an example. That third value exists so that importing src/lib/catalog.ts is possible only by declaring what it is.';
comment on column batchlabel.reference_material_versions.payload is
  'hazards / allergens / ifra / packaging, in the shapes src/lib/model.ts defines. A document rather than typed child tables because these rows are immutable, machine-written and few; the maker''s own equivalents are typed because they are user input that prints on a label. See the section comment — the condition under which this should be normalised is stated there.';

alter table batchlabel.reference_material_versions drop constraint if exists reference_material_versions_brand_check;
alter table batchlabel.reference_material_versions
  add  constraint reference_material_versions_brand_check check (brand_slug = 'batchlabel');

alter table batchlabel.reference_material_versions drop constraint if exists reference_material_versions_provenance_check;
alter table batchlabel.reference_material_versions
  add  constraint reference_material_versions_provenance_check
  check (provenance in ('supplier-document', 'regulatory-source', 'illustrative-example'));

-- A provenance claim with no document behind it is the same lie in a different column.
alter table batchlabel.reference_material_versions drop constraint if exists reference_material_versions_document_check;
alter table batchlabel.reference_material_versions
  add  constraint reference_material_versions_document_check
  check (
    provenance = 'illustrative-example'
    or (document_reference is not null and btrim(document_reference) <> ''
        and document_version is not null and btrim(document_version) <> ''
        and document_date is not null)
  );

alter table batchlabel.reference_material_versions drop constraint if exists reference_material_versions_version_check;
alter table batchlabel.reference_material_versions
  add  constraint reference_material_versions_version_check check (version >= 1);

create index if not exists reference_material_versions_material_idx
  on batchlabel.reference_material_versions (reference_material_id, version desc);

-- THE IMMUTABILITY TRIGGER. Unconditional, with no auth.uid() branch.
--
-- record_events below lets a session with no JWT through, because a GDPR erasure cascade
-- has to be able to remove a customer's rows. This table has no such caller: it holds no
-- personal data, it belongs to no account, and nothing about erasing a customer requires
-- deleting a published reference classification. So there is no exception, and a table
-- with no exception is one whose guarantee can be stated without qualification.
--
-- Deletion is refused a second time, independently, by the (deliberately NO ACTION)
-- foreign key from specification_material_pins. Two mechanisms for the one property the
-- materials design rests on.
create or replace function batchlabel.refuse_reference_version_change()
returns trigger
language plpgsql
set search_path = batchlabel, public
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'A published reference material version cannot be changed or removed. Correct it by publishing a new version; the old one is what somebody''s product was classified from.',
    detail  = format('operation=%s reference_material_version=%s', tg_op, coalesce(old.id::text, '')),
    hint    = 'reference_version_immutable';
end;
$$;

comment on function batchlabel.refuse_reference_version_change() is
  'BEFORE UPDATE OR DELETE on reference_material_versions: refuses, unconditionally, for every role including service_role and the table owner. This is the mechanism that makes "an override cannot silently change a classification under a maker" a storage-layer fact rather than a promise. There is deliberately no auth.uid() escape — unlike the append-only rule on record_events, this table has no legitimate deleter.';

revoke all on function batchlabel.refuse_reference_version_change() from public, anon, authenticated;

drop trigger if exists reference_material_versions_immutable on batchlabel.reference_material_versions;
create trigger reference_material_versions_immutable
  before update or delete on batchlabel.reference_material_versions
  for each row execute function batchlabel.refuse_reference_version_change();

-- ---------------------------------------------------------------------------
-- 4. THE MAKER'S OWN MATERIALS. Account-scoped, brand-locked, typed.
--
-- One table for the material, three for the parts of it that print, one for the document
-- it was read from. Every one carries account_id + brand_slug and the composite foreign
-- key to accounts, per rule 1.
--
-- WHY THE CHILDREN ARE TABLES AND NOT jsonb, said once and applying to all three: a hazard
-- code, an allergen percentage and an IFRA limit are what get printed on, or decide the
-- contents of, a CLP label. `check (btrim(code) <> '')` and `check (pct > 0 and pct <= 100)`
-- are the difference between a slip and a label. A jsonb document can hold neither. This
-- is the same argument this repository has now made three times — for allowances, for the
-- business identity above, and here.
--
-- EACH CHILD IS TIED TO ITS PARENT BY A COMPOSITE (material_id, account_id) FOREIGN KEY,
-- the same device 20260803120000 used to stop a product pointing at another account's
-- specification. A cross-account child is a 23503 at the storage layer, not a policy
-- question.
-- ---------------------------------------------------------------------------
create table if not exists batchlabel.materials (
  id                    uuid primary key default gen_random_uuid(),
  account_id            uuid not null default public.current_account_id(),
  brand_slug            text not null default 'batchlabel',

  -- The maker's own stable id, optional. Lets a pin, an import or a spreadsheet round-trip
  -- address a material by something the maker chose.
  slug                  text,

  material_class        text not null,
  name                  text not null,
  supplier              text,
  supplier_code         text,
  role                  text,
  categories            text[] not null default '{}'::text[],

  inci                  text,
  inci_function         text,
  cas                   text,

  -- Packaging geometry. Nullable, and constrained to be absent on an ingredient rather
  -- than merely ignored — a capacity on a fragrance oil is a data error that would
  -- otherwise sit there looking like a fact.
  format                text,
  capacity_ml           numeric(10,2),
  label_area_width_mm   numeric(8,2),
  label_area_height_mm  numeric(8,2),
  food_contact          boolean,
  child_resistant       boolean,

  -- THE OVERRIDE LINK. Null for a material that is wholly the maker's own; set when this
  -- row stands in place of one of ours. Either way the maker's row wins — see the header.
  overrides_reference_id uuid references batchlabel.reference_materials (id),

  notes                 text,
  archived_at           timestamptz,

  created_by            uuid references auth.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- The target of the composite foreign keys from the four child tables below.
  unique (id, account_id),
  foreign key (account_id, brand_slug) references public.accounts (id, brand_slug) on delete cascade
);

comment on table batchlabel.materials is
  'A material the maker holds. Beats the shipped reference catalogue whenever both describe the same thing — unconditionally, see this file''s header. Replaces src/lib/catalog.ts INGREDIENTS and PACKAGING as the source of every hazard, allergen and IFRA figure a screen renders as fact.';
comment on column batchlabel.materials.overrides_reference_id is
  'The reference material this row stands in place of, or null for one that is wholly the maker''s own. Precedence does not depend on this column — the maker''s row wins either way; it exists so a screen can say WHICH of ours is being overridden, and so resolved_materials can hide the superseded reference row.';
comment on column batchlabel.materials.brand_slug is
  'Always ''batchlabel''. Pinned by a CHECK and joined to the account''s own brand by a composite foreign key, so a sibling brand''s account can never own a row here. Same mechanism as batchlabel.products.brand_slug.';
comment on column batchlabel.materials.archived_at is
  'Soft delete. An archived material stops appearing in pickers and keeps every product already pinned to it working.';

alter table batchlabel.materials drop constraint if exists materials_brand_check;
alter table batchlabel.materials
  add  constraint materials_brand_check check (brand_slug = 'batchlabel');

alter table batchlabel.materials drop constraint if exists materials_class_check;
alter table batchlabel.materials
  add  constraint materials_class_check check (material_class in ('ingredient', 'packaging'));

alter table batchlabel.materials drop constraint if exists materials_name_check;
alter table batchlabel.materials
  add  constraint materials_name_check check (btrim(name) <> '');

alter table batchlabel.materials drop constraint if exists materials_slug_check;
alter table batchlabel.materials
  add  constraint materials_slug_check check (slug is null or btrim(slug) <> '');

alter table batchlabel.materials drop constraint if exists materials_packaging_check;
alter table batchlabel.materials
  add  constraint materials_packaging_check
  check (
    material_class = 'packaging'
    or (capacity_ml is null and label_area_width_mm is null and label_area_height_mm is null
        and food_contact is null and child_resistant is null and format is null)
  );

alter table batchlabel.materials drop constraint if exists materials_capacity_check;
alter table batchlabel.materials
  add  constraint materials_capacity_check
  check (
    (capacity_ml is null or capacity_ml > 0)
    and (label_area_width_mm  is null or label_area_width_mm  > 0)
    and (label_area_height_mm is null or label_area_height_mm > 0)
  );

create index if not exists materials_account_idx on batchlabel.materials (account_id);
create index if not exists materials_live_idx    on batchlabel.materials (account_id) where archived_at is null;

-- One live override of a given reference material per account. Two rows both claiming to
-- replace 'ing-crw45' would make "which wins" a question again, and the header's answer
-- is that it must never be one.
create unique index if not exists materials_account_override_uidx
  on batchlabel.materials (account_id, overrides_reference_id)
  where archived_at is null and overrides_reference_id is not null;

create unique index if not exists materials_account_slug_uidx
  on batchlabel.materials (account_id, lower(slug))
  where archived_at is null and slug is not null;

create table if not exists batchlabel.material_hazards (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null default public.current_account_id(),
  brand_slug    text not null default 'batchlabel',
  material_id   uuid not null,

  code          text not null,
  statement     text not null,
  hazard_class  text not null,

  -- Generic concentration limit: the percentage of this material in the finished mixture
  -- at which the hazard transfers. The number the whole classification turns on.
  gcl           numeric(7,4),
  -- Specific concentration limit, where the supplier gives one. Beats the generic.
  scl           numeric(7,4),

  pictogram     text,
  signal        text,
  derivation    text,

  created_at    timestamptz not null default now(),

  foreign key (account_id, brand_slug)   references public.accounts (id, brand_slug) on delete cascade,
  foreign key (material_id, account_id)  references batchlabel.materials (id, account_id) on delete cascade,
  unique (material_id, code)
);

comment on table batchlabel.material_hazards is
  'The hazard statements a maker''s own material carries at 100 percent, as read off their supplier''s document. Typed rather than jsonb because these print on a CLP label: code, statement and hazard_class are NOT NULL and non-blank, which a document cannot enforce.';
comment on column batchlabel.material_hazards.gcl is
  'Generic concentration limit — the percentage of this material in the finished mixture at which the hazard transfers. Nullable because a supplier does not always state one; a null must be rendered as unknown and never as zero.';

alter table batchlabel.material_hazards drop constraint if exists material_hazards_brand_check;
alter table batchlabel.material_hazards
  add  constraint material_hazards_brand_check check (brand_slug = 'batchlabel');

alter table batchlabel.material_hazards drop constraint if exists material_hazards_text_check;
alter table batchlabel.material_hazards
  add  constraint material_hazards_text_check
  check (btrim(code) <> '' and btrim(statement) <> '' and btrim(hazard_class) <> '');

alter table batchlabel.material_hazards drop constraint if exists material_hazards_limits_check;
alter table batchlabel.material_hazards
  add  constraint material_hazards_limits_check
  check ((gcl is null or (gcl > 0 and gcl <= 100)) and (scl is null or (scl > 0 and scl <= 100)));

alter table batchlabel.material_hazards drop constraint if exists material_hazards_signal_check;
alter table batchlabel.material_hazards
  add  constraint material_hazards_signal_check check (signal is null or signal in ('Warning', 'Danger'));

create index if not exists material_hazards_material_idx on batchlabel.material_hazards (material_id);
create index if not exists material_hazards_account_idx  on batchlabel.material_hazards (account_id);

create table if not exists batchlabel.material_allergens (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null default public.current_account_id(),
  brand_slug  text not null default 'batchlabel',
  material_id uuid not null,

  name        text not null,
  -- Percentage present in the raw material at 100 percent. Not the finished mixture.
  pct         numeric(7,4) not null,

  created_at  timestamptz not null default now(),

  foreign key (account_id, brand_slug)  references public.accounts (id, brand_slug) on delete cascade,
  foreign key (material_id, account_id) references batchlabel.materials (id, account_id) on delete cascade
);

-- An expression index rather than a table constraint, because a UNIQUE table constraint may
-- not contain an expression. Case-insensitive: 'Linalool' and 'linalool' are one allergen.
create unique index if not exists material_allergens_material_name_uidx
  on batchlabel.material_allergens (material_id, lower(name));

comment on table batchlabel.material_allergens is
  'Declarable fragrance allergens present in a maker''s own material, as a percentage of the material at 100 percent — NOT of the finished mixture. Which of them reach the label is a derivation over the load, and it is not stored here.';

alter table batchlabel.material_allergens drop constraint if exists material_allergens_brand_check;
alter table batchlabel.material_allergens
  add  constraint material_allergens_brand_check check (brand_slug = 'batchlabel');

alter table batchlabel.material_allergens drop constraint if exists material_allergens_name_check;
alter table batchlabel.material_allergens
  add  constraint material_allergens_name_check check (btrim(name) <> '');

alter table batchlabel.material_allergens drop constraint if exists material_allergens_pct_check;
alter table batchlabel.material_allergens
  add  constraint material_allergens_pct_check check (pct > 0 and pct <= 100);

create index if not exists material_allergens_material_idx on batchlabel.material_allergens (material_id);
create index if not exists material_allergens_account_idx  on batchlabel.material_allergens (account_id);

create table if not exists batchlabel.material_ifra_limits (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null default public.current_account_id(),
  brand_slug  text not null default 'batchlabel',
  material_id uuid not null,

  category    text not null,
  description text,
  max_pct     numeric(7,4) not null,

  created_at  timestamptz not null default now(),

  foreign key (account_id, brand_slug)  references public.accounts (id, brand_slug) on delete cascade,
  foreign key (material_id, account_id) references batchlabel.materials (id, account_id) on delete cascade,
  unique (material_id, category)
);

comment on table batchlabel.material_ifra_limits is
  'The IFRA maximum for a maker''s own fragrance material, per IFRA category. max_pct is a ceiling on the load, so a null would read as "no limit" — it is NOT NULL for that reason.';

alter table batchlabel.material_ifra_limits drop constraint if exists material_ifra_limits_brand_check;
alter table batchlabel.material_ifra_limits
  add  constraint material_ifra_limits_brand_check check (brand_slug = 'batchlabel');

alter table batchlabel.material_ifra_limits drop constraint if exists material_ifra_limits_category_check;
alter table batchlabel.material_ifra_limits
  add  constraint material_ifra_limits_category_check check (btrim(category) <> '');

alter table batchlabel.material_ifra_limits drop constraint if exists material_ifra_limits_max_check;
alter table batchlabel.material_ifra_limits
  add  constraint material_ifra_limits_max_check check (max_pct > 0 and max_pct <= 100);

create index if not exists material_ifra_limits_material_idx on batchlabel.material_ifra_limits (material_id);
create index if not exists material_ifra_limits_account_idx  on batchlabel.material_ifra_limits (account_id);

-- The supplier document THIS ACCOUNT holds.
--
-- Distinct from reference_material_versions.document_*, which describes a document WE read.
-- The distinction is the whole point: SDS section 3 and section 16 must keep saying no
-- document of yours is held until a row exists here, and today none does. `storage_path`
-- is nullable and null means exactly what it says — we hold the metadata the maker typed
-- and no file. A bucket for the bytes is an operator step, not SQL, and is not pretended
-- to exist here.
create table if not exists batchlabel.material_documents (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null default public.current_account_id(),
  brand_slug    text not null default 'batchlabel',
  material_id   uuid not null,

  document_kind text not null,
  reference     text,
  version       text,
  document_date date,
  expires_at    date,
  received_at   timestamptz not null default now(),

  storage_path  text,
  file_name     text,
  notes         text,

  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  foreign key (account_id, brand_slug)  references public.accounts (id, brand_slug) on delete cascade,
  foreign key (material_id, account_id) references batchlabel.materials (id, account_id) on delete cascade
);

comment on table batchlabel.material_documents is
  'The supplier document THIS ACCOUNT holds for one of its own materials. Not the same thing as reference_material_versions.document_* , which records a document WE read — and the difference is what SDS sections 3 and 16 turn on. storage_path null means metadata is held and no file is; a storage bucket for the bytes is an operator step and is not created by this migration.';
comment on column batchlabel.material_documents.storage_path is
  'Where the file lives, or null. NULL MEANS NO FILE IS HELD, and a screen must not render a document row as though a document had been received.';

alter table batchlabel.material_documents drop constraint if exists material_documents_brand_check;
alter table batchlabel.material_documents
  add  constraint material_documents_brand_check check (brand_slug = 'batchlabel');

alter table batchlabel.material_documents drop constraint if exists material_documents_kind_check;
alter table batchlabel.material_documents
  add  constraint material_documents_kind_check
  check (document_kind in ('Safety data sheet', 'INCI and allergen certificate', 'Technical drawing',
                           'Declaration of conformity', 'Test report', 'Other'));

alter table batchlabel.material_documents drop constraint if exists material_documents_blank_check;
alter table batchlabel.material_documents
  add  constraint material_documents_blank_check
  check ((reference is null or btrim(reference) <> '')
     and (version   is null or btrim(version)   <> '')
     and (storage_path is null or btrim(storage_path) <> ''));

create index if not exists material_documents_material_idx on batchlabel.material_documents (material_id);
create index if not exists material_documents_account_idx  on batchlabel.material_documents (account_id);

-- ---------------------------------------------------------------------------
-- 5. THE PRECEDENCE RULE, AS ONE OBJECT.
--
-- "The maker's own row wins" is a sentence in this file's header. This view is the same
-- sentence as code, in one place, so the app, any server route and any future report all
-- get the identical answer and it cannot drift between them.
--
-- security_invoker = true is the entire security of this view and it is not optional.
-- Without it the view runs as its owner, RLS on batchlabel.materials and public.accounts
-- is bypassed, and every signed-in user sees every other maker's materials. Section 12
-- asserts the flag is still set, the same assertion 20260804120000 makes about
-- public.entitlements and for the same reason.
--
-- security_barrier so the planner cannot push a user-supplied function inside it and use
-- that to probe rows the caller cannot see.
--
-- THE `source` COLUMN IS THE POINT, not decoration. A screen that shows a resolved
-- material has to be able to say whether the figures came from the maker's own record or
-- from our catalogue, and `provenance` on the reference side says whether ours is a real
-- document or an illustrative example. Both travel with the row so no screen has to guess.
--
-- WHAT IT COSTS. The reference half is a cross join of the caller's accounts against the
-- live reference catalogue. The catalogue holds zero rows today and is expected to hold
-- hundreds, not millions, and a maker holds one account; if that ever stops being true
-- this becomes a function taking an account_id rather than a view.
-- ---------------------------------------------------------------------------
create or replace view batchlabel.resolved_materials
with (security_invoker = true, security_barrier = true)
as
-- The maker's own. Always wins, so it is emitted unconditionally.
select
  m.account_id,
  'account'::text                as source,
  m.id                           as material_id,
  m.overrides_reference_id       as reference_material_id,
  null::uuid                     as reference_version_id,
  null::integer                  as reference_version,
  null::text                     as provenance,
  coalesce(m.slug, rm.slug)      as slug,
  m.material_class,
  m.name,
  m.supplier,
  m.supplier_code,
  m.role,
  m.categories,
  m.overrides_reference_id is not null as overrides_reference
from batchlabel.materials m
left join batchlabel.reference_materials rm on rm.id = m.overrides_reference_id
where m.archived_at is null

union all

-- Ours, but only where the maker has not replaced it.
select
  a.id                           as account_id,
  'reference'::text              as source,
  null::uuid                     as material_id,
  rm.id                          as reference_material_id,
  v.id                           as reference_version_id,
  v.version                      as reference_version,
  v.provenance,
  rm.slug,
  rm.material_class,
  rm.name,
  rm.supplier,
  rm.supplier_code,
  rm.role,
  rm.categories,
  false                          as overrides_reference
from public.accounts a
cross join batchlabel.reference_materials rm
left join lateral (
  select rv.id, rv.version, rv.provenance
    from batchlabel.reference_material_versions rv
   where rv.reference_material_id = rm.id
   order by rv.version desc
   limit 1
) v on true
where rm.retired_at is null
  and a.brand_slug = 'batchlabel'
  and not exists (
    select 1
      from batchlabel.materials m
     where m.account_id             = a.id
       and m.overrides_reference_id = rm.id
       and m.archived_at is null
  );

comment on view batchlabel.resolved_materials is
  'THE PRECEDENCE RULE, in one place: the maker''s own material wins over the shipped reference catalogue, unconditionally, whenever both describe the same thing. `source` is ''account'' or ''reference'' so a screen can say which it is showing; `provenance` travels with the reference half so a screen can say whether ours is a real document or an illustrative example. security_invoker = true, so RLS on materials and accounts applies and a caller sees only their own — without that flag this view is a full disclosure of every maker''s materials.';

-- ---------------------------------------------------------------------------
-- 6. THE PIN. What a specification was actually classified from.
--
-- This is the other half of the answer to Rhys's question 2. Section 3 makes it impossible
-- for a published reference version to change; this table makes a specification name the
-- version it used, so "impossible to change" is a guarantee about something specific
-- rather than about the catalogue in general.
--
-- EXACTLY ONE OF material_id / reference_version_id, enforced by a CHECK. A pin resolves
-- to the maker's own material or to one immutable version of ours, never both and never
-- neither.
--
-- ON DELETE IS DELIBERATELY *NOT* RESTRICT ON EITHER PARENT, AND THE DIFFERENCE IS SUBTLE
-- ENOUGH TO BE WORTH THE SENTENCE. RESTRICT is checked immediately; NO ACTION (the default,
-- which is what is written here by omission) is checked at the end of the statement. A GDPR
-- erasure deletes an account, which cascades to materials AND to these pins in one
-- statement — under RESTRICT the materials half raises before the cascade has finished
-- removing the pins, and the erasure fails. Under NO ACTION both sides are gone by the time
-- the check runs and it passes, while a bare `delete from materials where id = ...` still
-- raises 23503 exactly as intended. The behaviour we want is the default; writing RESTRICT
-- because it sounds stricter would break erasure.
--
-- `pinned_name` is denormalised on purpose. A retired reference material or an archived
-- own-material still has to render on a batch record printed two years ago, and the name at
-- the time is what the maker will recognise.
--
-- THE LEGACY TEXT IDS ARE NOT REMOVED. specifications.fragrance_id / base_id / dye_id still
-- hold catalog.ts strings and src/lib/derive.ts still reads them; nothing here rewrites
-- them, because doing so from a schema migration while build agents are editing those code
-- paths would be a merge conflict with a customer's classification inside it. These pin
-- rows are what a materials-backed classification must use, and the text columns are what
-- the current derivation still uses. Two sources of truth is a real cost and it is a
-- transitional one — whoever finishes the materials screen retires the text columns.
-- ---------------------------------------------------------------------------
create table if not exists batchlabel.specification_material_pins (
  id                   uuid primary key default gen_random_uuid(),
  account_id           uuid not null default public.current_account_id(),
  brand_slug           text not null default 'batchlabel',
  specification_id     uuid not null,

  -- Which part of the composition this material plays.
  role                 text not null,
  -- Distinguishes several materials in one role (phase items, bill-of-materials lines).
  slot                 text not null default '',

  material_id          uuid,
  reference_version_id uuid references batchlabel.reference_material_versions (id),

  pinned_name          text not null,
  pinned_at            timestamptz not null default now(),

  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  foreign key (account_id, brand_slug) references public.accounts (id, brand_slug) on delete cascade,
  foreign key (specification_id, account_id)
    references batchlabel.specifications (id, account_id) on delete cascade,
  foreign key (material_id, account_id)
    references batchlabel.materials (id, account_id),

  unique (specification_id, role, slot)
);

comment on table batchlabel.specification_material_pins is
  'The exact material a composition was classified from. A pin names either the maker''s own material or ONE IMMUTABLE VERSION of the shipped catalogue, so publishing a correction to our data cannot move a classification under a product already built on it. Moving a pin is an act the maker takes, and the intended companion is a record_events row of kind ''material.version_adopted''.';
comment on column batchlabel.specification_material_pins.pinned_name is
  'The material''s name at the moment it was pinned. Denormalised on purpose: a batch record printed two years ago has to render something the maker recognises even if the material has since been retired or renamed.';
comment on column batchlabel.specification_material_pins.slot is
  'Distinguishes several materials sharing one role — a phase item, a bill-of-materials line. Empty string, not null, so the (specification_id, role, slot) uniqueness actually bites: null is not equal to null and two null slots would both be allowed.';

alter table batchlabel.specification_material_pins drop constraint if exists specification_material_pins_brand_check;
alter table batchlabel.specification_material_pins
  add  constraint specification_material_pins_brand_check check (brand_slug = 'batchlabel');

alter table batchlabel.specification_material_pins drop constraint if exists specification_material_pins_role_check;
alter table batchlabel.specification_material_pins
  add  constraint specification_material_pins_role_check
  check (role in ('base', 'fragrance', 'dye', 'additive', 'packaging', 'phase-item', 'bom-item'));

-- Exactly one target. Not "at least one": a pin resolving two ways is the question the
-- precedence rule exists to have already answered.
alter table batchlabel.specification_material_pins drop constraint if exists specification_material_pins_target_check;
alter table batchlabel.specification_material_pins
  add  constraint specification_material_pins_target_check
  check ((material_id is not null) <> (reference_version_id is not null));

alter table batchlabel.specification_material_pins drop constraint if exists specification_material_pins_name_check;
alter table batchlabel.specification_material_pins
  add  constraint specification_material_pins_name_check check (btrim(pinned_name) <> '');

create index if not exists specification_material_pins_spec_idx    on batchlabel.specification_material_pins (specification_id);
create index if not exists specification_material_pins_account_idx on batchlabel.specification_material_pins (account_id);
create index if not exists specification_material_pins_version_idx on batchlabel.specification_material_pins (reference_version_id);
create index if not exists specification_material_pins_material_idx on batchlabel.specification_material_pins (material_id);

-- ---------------------------------------------------------------------------
-- 7. ARTEFACTS. A produced label or safety data sheet, with the fingerprint of what it
--    was produced from.
--
-- ONE TABLE, NOT artefacts + artefact_versions. An artefact IS a version: every production
-- writes a new row, `version` increments per (product, type), and nothing is ever updated
-- in place. A parent table holding "the current one" would be a mutable pointer to
-- immutable rows, which is the shape that lets "Current" drift from the truth.
--
-- is_placeholder DEFAULTS TO TRUE, AND THAT IS THE MOST IMPORTANT LINE IN THIS SECTION.
-- The app-server generation functions are not written; the two export controls in
-- ArtefactDesigner toast "Export is not ready yet". A stub that writes a row here gets
-- is_placeholder = true because it did not have to think about it, and a screen must
-- therefore opt in before it calls anything produced. Setting it false is a claim that a
-- real artefact exists, and whoever writes the generator makes that claim explicitly.
--
-- specification_hash IS WHAT MAKES "Current" AND "Out of date" FACTS. It stores what
-- batchlabel.artefact_source_fingerprint(product_id) returned at production time; the
-- artefact is current when that function returns the same value now. Without it,
-- ArtefactInstance.current is hardcoded true and "N outputs out of date" is dead code —
-- which is what the survey found.
--
-- ON DELETE CASCADE FROM products, AND WHAT THAT COSTS. Deleting a product takes its
-- artefacts and (section 8) its production history with it. The intended path for a
-- product is archived_at — 20260803120000 section 5 makes the same choice for
-- specifications and gives the reason: RESTRICT turns "delete this user" into a constraint
-- violation, and an erasure obligation that cannot be met is worse than a delete that is
-- more destructive than a mis-click deserves. If a product ever needs to be undeletable
-- while records exist, that is one word in this constraint and a deliberate decision about
-- erasure, not an accident.
-- ---------------------------------------------------------------------------
create table if not exists batchlabel.artefacts (
  id                 uuid primary key default gen_random_uuid(),
  account_id         uuid not null default public.current_account_id(),
  brand_slug         text not null default 'batchlabel',
  product_id         uuid not null,

  artefact_type      text not null,
  version            integer not null default 1,

  width_mm           numeric(8,2),
  height_mm          numeric(8,2),

  produced_at        timestamptz not null default now(),
  printed_at         timestamptz,

  specification_hash text not null,

  is_placeholder     boolean not null default true,
  storage_path       text,
  notes              text,

  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  unique (id, account_id),
  unique (product_id, artefact_type, version),

  foreign key (account_id, brand_slug) references public.accounts (id, brand_slug) on delete cascade,
  foreign key (product_id, account_id) references batchlabel.products (id, account_id) on delete cascade
);

comment on table batchlabel.artefacts is
  'A produced label or safety data sheet. One row per production — an artefact IS a version — so nothing here is ever updated in place and "Current" cannot drift. Unlocks Current / Out of date, "Last produced", the drift callout, the SDS revision line and clp-artefact-current, none of which have a source today.';
comment on column batchlabel.artefacts.is_placeholder is
  'TRUE BY DEFAULT, and the default is the safety. Label and SDS generation are not built; a stub that writes a row here is marked as a stub because it did not have to think about it. A screen must read this column before calling anything produced, and setting it false is an explicit claim that a real artefact exists.';
comment on column batchlabel.artefacts.specification_hash is
  'What batchlabel.artefact_source_fingerprint(product_id) returned at production time. The artefact is current exactly when that function returns the same value now — which is what turns ArtefactInstance.current from a hardcoded true into a fact.';
comment on column batchlabel.artefacts.printed_at is
  'When it was actually printed or exported, or null. Distinct from produced_at: a maker can generate a label and not print it, and only the printed ones matter to a recall.';

alter table batchlabel.artefacts drop constraint if exists artefacts_brand_check;
alter table batchlabel.artefacts
  add  constraint artefacts_brand_check check (brand_slug = 'batchlabel');

alter table batchlabel.artefacts drop constraint if exists artefacts_type_check;
alter table batchlabel.artefacts
  add  constraint artefacts_type_check
  check (artefact_type in ('unit-label', 'carton', 'leaflet', 'listing', 'rating-plate', 'sds'));

alter table batchlabel.artefacts drop constraint if exists artefacts_version_check;
alter table batchlabel.artefacts
  add  constraint artefacts_version_check check (version >= 1);

alter table batchlabel.artefacts drop constraint if exists artefacts_hash_check;
alter table batchlabel.artefacts
  add  constraint artefacts_hash_check check (btrim(specification_hash) <> '');

alter table batchlabel.artefacts drop constraint if exists artefacts_dimensions_check;
alter table batchlabel.artefacts
  add  constraint artefacts_dimensions_check
  check ((width_mm is null or width_mm > 0) and (height_mm is null or height_mm > 0));

create index if not exists artefacts_account_idx on batchlabel.artefacts (account_id);
create index if not exists artefacts_product_idx on batchlabel.artefacts (product_id, artefact_type, version desc);

-- The two functions that give specification_hash its meaning — identity_fingerprint and
-- artefact_source_fingerprint — are defined in SECTION 9b, after the identity tables. A
-- `language sql` body is parsed and validated at creation time, and the fingerprint covers
-- the printed supplier block, so it cannot be written before batchlabel.business_identity
-- exists. The ordering is a Postgres fact, not a preference.

-- ---------------------------------------------------------------------------
-- 8. THE RECORD LOG. One table, a typed kind, append-only.
--
-- See the header for the shape argument and the recall query. What follows is the two
-- decisions inside it that are not obvious.
--
-- occurred_at AND recorded_at ARE BOTH HERE AND THEY ARE NOT THE SAME. A maker writes up
-- Tuesday's batch on Friday: occurred_at is Tuesday, because that is when the units were
-- made and what a recall works backwards from; recorded_at is Friday and is set by the
-- database. A log with only one of them either lies about when a batch was made or loses
-- the fact that it was written up late, and a compliance log has to survive somebody
-- asking which it was.
--
-- obligation_id IS A TYPED COLUMN AND NOT A KEY IN `detail`. The Studio work queue reads
-- it on every render to decide whether an obligation has evidence, so it is a hot filtered
-- read and it belongs in an index, not in a jsonb probe. It is what discharges the fifteen
-- obligations that are permanently outstanding today because products.obligations is
-- written by nobody.
-- ---------------------------------------------------------------------------
create table if not exists batchlabel.record_events (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null default public.current_account_id(),
  brand_slug       text not null default 'batchlabel',

  kind             text not null,

  occurred_at      timestamptz not null default now(),
  recorded_at      timestamptz not null default now(),

  product_id       uuid,
  specification_id uuid,
  artefact_id      uuid,
  material_id      uuid,

  -- Production. Null on every other kind.
  batch_code       text,
  units            integer,
  identity_kind    text,
  serial_from      text,
  serial_to        text,

  -- Compliance. Null on every other kind.
  obligation_id    text,
  reference        text,

  summary          text not null,
  detail           jsonb not null default '{}'::jsonb,

  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),

  unique (id, account_id),

  foreign key (account_id, brand_slug) references public.accounts (id, brand_slug) on delete cascade,
  foreign key (product_id, account_id)       references batchlabel.products (id, account_id)       on delete cascade,
  foreign key (specification_id, account_id) references batchlabel.specifications (id, account_id) on delete cascade,
  foreign key (artefact_id, account_id)      references batchlabel.artefacts (id, account_id)      on delete cascade,
  foreign key (material_id, account_id)      references batchlabel.materials (id, account_id)      on delete cascade
);

comment on table batchlabel.record_events is
  'THE LOG. One append-only, chronological surface spanning batch production, label print and export, and compliance events — "the log that the user can look at/reference at any point and see what happened and when". A typed `kind` rather than three tables bolted together. UPDATE and DELETE are refused by a trigger for any session with a JWT and are not granted to authenticated at all; a wrong entry is corrected by writing another event, which is what a log is.';
comment on column batchlabel.record_events.occurred_at is
  'When the thing HAPPENED — a maker may write up Tuesday''s batch on Friday, and a recall works backwards from Tuesday. Not the same as recorded_at, which is when we learned of it and is set by the database.';
comment on column batchlabel.record_events.obligation_id is
  'The obligation this event is evidence for (src/lib/regimes.ts ids). A typed, indexed column rather than a key in `detail` because the Studio work queue filters on it every render. This is the write path that lets an obligation stop being permanently outstanding.';
comment on column batchlabel.record_events.summary is
  'The sentence the log shows. NOT NULL and non-blank: a log line nobody can read is not a record of anything.';

alter table batchlabel.record_events drop constraint if exists record_events_brand_check;
alter table batchlabel.record_events
  add  constraint record_events_brand_check check (brand_slug = 'batchlabel');

-- The typed kind. Everything Rhys named, and nothing speculative: batch production,
-- artefact print/export, and the compliance events (UFI assigned, PCN/NPIS submitted,
-- declaration signed, SDS section reviewed), plus the two acts this file's own design
-- requires a trail for — adopting a newer reference material version, and changing the
-- business identity that prints on every label.
alter table batchlabel.record_events drop constraint if exists record_events_kind_check;
alter table batchlabel.record_events
  add  constraint record_events_kind_check
  check (kind in (
    'batch.produced',
    'artefact.produced',
    'artefact.printed',
    'artefact.exported',
    'compliance.ufi_assigned',
    'compliance.pcn_submitted',
    'compliance.npis_submitted',
    'compliance.declaration_signed',
    'compliance.sds_section_reviewed',
    'compliance.evidence_recorded',
    'material.version_adopted',
    'identity.updated',
    'note'
  ));

alter table batchlabel.record_events drop constraint if exists record_events_summary_check;
alter table batchlabel.record_events
  add  constraint record_events_summary_check check (btrim(summary) <> '');

alter table batchlabel.record_events drop constraint if exists record_events_units_check;
alter table batchlabel.record_events
  add  constraint record_events_units_check check (units is null or units > 0);

-- A production event without a batch code is not traceable to anything, which is the one
-- thing a production record exists to be.
alter table batchlabel.record_events drop constraint if exists record_events_batch_check;
alter table batchlabel.record_events
  add  constraint record_events_batch_check
  check (kind <> 'batch.produced' or (batch_code is not null and btrim(batch_code) <> ''));

alter table batchlabel.record_events drop constraint if exists record_events_identity_kind_check;
alter table batchlabel.record_events
  add  constraint record_events_identity_kind_check
  check (identity_kind is null or identity_kind in ('batch', 'serial-range'));

alter table batchlabel.record_events drop constraint if exists record_events_serial_check;
alter table batchlabel.record_events
  add  constraint record_events_serial_check
  check (identity_kind is distinct from 'serial-range' or (serial_from is not null and serial_to is not null));

create index if not exists record_events_account_time_idx on batchlabel.record_events (account_id, occurred_at desc);
create index if not exists record_events_product_idx      on batchlabel.record_events (product_id, occurred_at desc);
create index if not exists record_events_kind_idx         on batchlabel.record_events (account_id, kind, occurred_at desc);
create index if not exists record_events_obligation_idx   on batchlabel.record_events (account_id, obligation_id) where obligation_id is not null;
create index if not exists record_events_batch_idx        on batchlabel.record_events (account_id, batch_code) where batch_code is not null;

-- Which traceable input lot went into which batch. The other half of a recall: a label
-- found wrong points at batches through record_event_artefacts, and a drum found wrong
-- points at batches through here.
create table if not exists batchlabel.record_event_lots (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null default public.current_account_id(),
  brand_slug      text not null default 'batchlabel',
  record_event_id uuid not null,

  material_id     uuid,
  -- The text id as recorded, for a material that is still a catalog.ts string or has since
  -- been archived. A lot number with no material named at all is not traceability.
  material_ref    text,
  lot             text not null,
  quantity        numeric(12,3),
  unit            text,

  created_at      timestamptz not null default now(),

  foreign key (account_id, brand_slug)       references public.accounts (id, brand_slug) on delete cascade,
  foreign key (record_event_id, account_id)  references batchlabel.record_events (id, account_id) on delete cascade,
  foreign key (material_id, account_id)      references batchlabel.materials (id, account_id)
);

comment on table batchlabel.record_event_lots is
  'The traceable supplier lots consumed by one production event. A table and not a jsonb array because the recall runs the other way too: given a drum found to be wrong, which batches used it.';

alter table batchlabel.record_event_lots drop constraint if exists record_event_lots_brand_check;
alter table batchlabel.record_event_lots
  add  constraint record_event_lots_brand_check check (brand_slug = 'batchlabel');

alter table batchlabel.record_event_lots drop constraint if exists record_event_lots_lot_check;
alter table batchlabel.record_event_lots
  add  constraint record_event_lots_lot_check check (btrim(lot) <> '');

alter table batchlabel.record_event_lots drop constraint if exists record_event_lots_material_check;
alter table batchlabel.record_event_lots
  add  constraint record_event_lots_material_check
  check (material_id is not null or (material_ref is not null and btrim(material_ref) <> ''));

create index if not exists record_event_lots_event_idx    on batchlabel.record_event_lots (record_event_id);
create index if not exists record_event_lots_lot_idx      on batchlabel.record_event_lots (account_id, lower(lot));
create index if not exists record_event_lots_material_idx on batchlabel.record_event_lots (material_id);

-- THE RECALL JOIN. Which artefact version was applied to which batch.
create table if not exists batchlabel.record_event_artefacts (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null default public.current_account_id(),
  brand_slug      text not null default 'batchlabel',
  record_event_id uuid not null,
  artefact_id     uuid not null,

  created_at      timestamptz not null default now(),

  foreign key (account_id, brand_slug)      references public.accounts (id, brand_slug) on delete cascade,
  foreign key (record_event_id, account_id) references batchlabel.record_events (id, account_id) on delete cascade,
  foreign key (artefact_id, account_id)     references batchlabel.artefacts (id, account_id) on delete cascade,
  unique (record_event_id, artefact_id)
);

comment on table batchlabel.record_event_artefacts is
  'Which artefact versions were applied to a production run. THIS IS THE RECALL ANSWER: given a label found to be wrong, join this to record_events on record_event_id and read off the batch codes and dates. A table rather than a jsonb array precisely so that join exists.';

alter table batchlabel.record_event_artefacts drop constraint if exists record_event_artefacts_brand_check;
alter table batchlabel.record_event_artefacts
  add  constraint record_event_artefacts_brand_check check (brand_slug = 'batchlabel');

create index if not exists record_event_artefacts_artefact_idx on batchlabel.record_event_artefacts (artefact_id);
create index if not exists record_event_artefacts_event_idx    on batchlabel.record_event_artefacts (record_event_id);

-- ── Append-only, enforced ───────────────────────────────────────────────────
--
-- The grants below give `authenticated` SELECT and INSERT and nothing else, which is the
-- first line. This trigger is the second, and it exists because a grant is one migration
-- away from being re-issued by somebody who did not read this file, whereas a trigger that
-- raises is loud.
--
-- THE auth.uid() BRANCH IS NOT A LOOPHOLE, it is what keeps a GDPR erasure possible. A
-- session with no JWT is service_role, a migration, or the ON DELETE CASCADE that runs when
-- an account is erased — and a BEFORE DELETE trigger fires on a cascade too, so without
-- this branch "delete this user" becomes a trigger exception. The browser holds a JWT on
-- every request and is refused. Same asymmetry, same reasoning, as public.pin_created_by().
create or replace function batchlabel.refuse_record_rewrite()
returns trigger
language plpgsql
security definer
set search_path = batchlabel, public
as $$
begin
  if auth.uid() is null then
    -- service_role, a migration, or a GDPR erasure cascade. See the comment above.
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  raise exception using
    errcode = 'P0001',
    message = 'The record log cannot be changed once written. Correct it by adding another entry — what happened and when is what this log is for.',
    detail  = format('operation=%s table=%s row=%s', tg_op, tg_table_name, coalesce(old.id::text, '')),
    hint    = 'record_append_only';
end;
$$;

comment on function batchlabel.refuse_record_rewrite() is
  'BEFORE UPDATE OR DELETE on record_events and its two child tables: refuses any session that carries a JWT, which is every browser request. Lets a session with no auth.uid() through, because the ON DELETE CASCADE of a GDPR erasure fires this trigger and an erasure obligation that cannot be met is worse than a log a server-side script could in principle rewrite. Same asymmetry as public.pin_created_by().';

revoke all on function batchlabel.refuse_record_rewrite() from public, anon, authenticated;

drop trigger if exists record_events_append_only on batchlabel.record_events;
create trigger record_events_append_only
  before update or delete on batchlabel.record_events
  for each row execute function batchlabel.refuse_record_rewrite();

drop trigger if exists record_event_lots_append_only on batchlabel.record_event_lots;
create trigger record_event_lots_append_only
  before update or delete on batchlabel.record_event_lots
  for each row execute function batchlabel.refuse_record_rewrite();

drop trigger if exists record_event_artefacts_append_only on batchlabel.record_event_artefacts;
create trigger record_event_artefacts_append_only
  before update or delete on batchlabel.record_event_artefacts
  for each row execute function batchlabel.refuse_record_rewrite();

-- ── Writing a production record atomically ──────────────────────────────────
--
-- WHY THIS RPC EXISTS. A batch record is one event plus N lots plus M artefact links, and
-- from the browser that is three round trips that are not a transaction. src/lib/products.ts
-- already documents what that costs on the products/specifications pair — a refused second
-- insert leaves an orphan, and a lost response leaves a row nobody can see — and on an
-- APPEND-ONLY table it is worse, because the half-written record cannot be cleaned up: the
-- browser has no UPDATE and no DELETE.
--
-- So the write is one statement. SECURITY INVOKER (the default, stated by omission of
-- `security definer` and relied upon), so every RLS policy and every foreign key applies to
-- the caller exactly as they would to three separate inserts. It grants nothing; it only
-- makes the three inserts share a transaction.
--
-- p_lots and p_artefact_ids are jsonb and uuid[] respectively rather than a composite type,
-- because PostgREST can pass both from a JSON body without a custom type round trip.
create or replace function batchlabel.record_batch_produced(
  p_account_id   uuid,
  p_product_id   uuid,
  p_batch_code   text,
  p_summary      text,
  p_occurred_at  timestamptz default now(),
  p_units        integer     default null,
  p_lots         jsonb       default '[]'::jsonb,
  p_artefact_ids uuid[]      default '{}'::uuid[],
  p_detail       jsonb       default '{}'::jsonb
)
returns uuid
language plpgsql
set search_path = batchlabel, public
as $$
declare
  v_event uuid;
  v_spec  uuid;
begin
  select p.specification_id into v_spec
    from batchlabel.products p
   where p.id = p_product_id and p.account_id = p_account_id;

  insert into batchlabel.record_events
    (account_id, kind, occurred_at, product_id, specification_id,
     batch_code, units, identity_kind, summary, detail)
  values
    (p_account_id, 'batch.produced', coalesce(p_occurred_at, now()), p_product_id, v_spec,
     p_batch_code, p_units, 'batch', p_summary, coalesce(p_detail, '{}'::jsonb))
  returning id into v_event;

  insert into batchlabel.record_event_lots
    (account_id, record_event_id, material_id, material_ref, lot, quantity, unit)
  select
    p_account_id,
    v_event,
    nullif(l->>'material_id', '')::uuid,
    nullif(l->>'material_ref', ''),
    l->>'lot',
    nullif(l->>'quantity', '')::numeric,
    nullif(l->>'unit', '')
  from jsonb_array_elements(coalesce(p_lots, '[]'::jsonb)) as e(l);

  insert into batchlabel.record_event_artefacts (account_id, record_event_id, artefact_id)
  select p_account_id, v_event, a
    from unnest(coalesce(p_artefact_ids, '{}'::uuid[])) as u(a);

  return v_event;
end;
$$;

comment on function batchlabel.record_batch_produced(uuid, uuid, text, text, timestamptz, integer, jsonb, uuid[], jsonb) is
  'Writes one production record — the event, its input lots and the artefact versions applied — in a single transaction. SECURITY INVOKER: every policy and every foreign key applies to the caller exactly as for three separate inserts, so this grants nothing and only makes them atomic. It exists because record_events is append-only, so a half-written record cannot be repaired from a browser that holds no UPDATE and no DELETE.';

revoke all     on function batchlabel.record_batch_produced(uuid, uuid, text, text, timestamptz, integer, jsonb, uuid[], jsonb) from public, anon;
grant  execute on function batchlabel.record_batch_produced(uuid, uuid, text, text, timestamptz, integer, jsonb, uuid[], jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. SETTINGS: the printed identity, the addresses, the preferences, and the two
--    UK GDPR obligations.
--
-- See the header for why business_identity is a table and not accounts.data.
-- ---------------------------------------------------------------------------
create table if not exists batchlabel.business_identity (
  account_id      uuid primary key,
  brand_slug      text not null default 'batchlabel',

  -- The only required field. See the header: requiring telephone to SAVE would stop a
  -- maker recording their own business name until they had typed one, and which absences
  -- block a PRINT is the screen's sentence to say, not the schema's.
  registered_name text not null,

  trading_name    text,
  telephone       text,
  email           text,
  website         text,

  -- A REGULATORY reference, not a billing field. It prints in section 15 of every safety
  -- data sheet. The VAT number Stripe holds for the reverse charge is a different value,
  -- collected in Checkout and editable in the billing portal, and the two must never be
  -- conflated: one is printed on a document, the other decides what a customer is charged.
  vat_number      text,

  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  foreign key (account_id, brand_slug) references public.accounts (id, brand_slug) on delete cascade
);

comment on table batchlabel.business_identity is
  'The supplier block that PRINTS: on the face of every label and in sections 1 and 15 of every safety data sheet. Its own table rather than accounts.data because jsonb carries no NOT NULL and no CHECK and this ends up on a legal document, because accounts is deliberately read-only to the browser, and because this is brand data while accounts is shared identity in public. Replaces the UNSET placeholders in src/lib/identity.ts. NO ROW MEANS NOTHING HAS BEEN TOLD TO US — which is exactly what those placeholders say today, and a screen must keep saying it rather than printing blanks.';
comment on column batchlabel.business_identity.registered_name is
  'The registered business name. The only NOT NULL field: a row exists precisely when a maker has told us who they are. Under CLP Article 17 a label must carry the supplier''s NAME, ADDRESS and TELEPHONE NUMBER — name here, address in supplier_addresses, telephone below — and a screen deciding whether a print may proceed should check all three.';
comment on column batchlabel.business_identity.vat_number is
  'A regulatory reference printed in SDS section 15, NOT the billing VAT number Stripe holds for the reverse charge. Do not conflate them: one is printed on a document, the other decides what a customer is charged.';

alter table batchlabel.business_identity drop constraint if exists business_identity_brand_check;
alter table batchlabel.business_identity
  add  constraint business_identity_brand_check check (brand_slug = 'batchlabel');

alter table batchlabel.business_identity drop constraint if exists business_identity_name_check;
alter table batchlabel.business_identity
  add  constraint business_identity_name_check check (btrim(registered_name) <> '');

-- THE CONSTRAINT THAT ACTUALLY EARNS ITS KEEP. An empty string is the jsonb failure mode
-- reproduced in a text column: it is not null, nothing complains, and it prints as a blank
-- line under a heading on a safety data sheet. Absent and empty must be the same state.
alter table batchlabel.business_identity drop constraint if exists business_identity_blank_check;
alter table batchlabel.business_identity
  add  constraint business_identity_blank_check
  check ((trading_name is null or btrim(trading_name) <> '')
     and (telephone    is null or btrim(telephone)    <> '')
     and (email        is null or btrim(email)        <> '')
     and (website      is null or btrim(website)      <> '')
     and (vat_number   is null or btrim(vat_number)   <> ''));

create table if not exists batchlabel.supplier_addresses (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null default public.current_account_id(),
  brand_slug  text not null default 'batchlabel',

  market      text not null,
  label       text not null,
  role        text not null,
  lines       text[] not null,
  is_default  boolean not null default false,

  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  foreign key (account_id, brand_slug) references public.accounts (id, brand_slug) on delete cascade,
  unique (account_id, market)
);

comment on table batchlabel.supplier_addresses is
  'The per-market address blocks that print: GB supplier and manufacturer, EU responsible person and economic operator, NI where it differs. Which block a label prints is decided by the product''s market, and that logic already exists — this is the contents it has never had.';
comment on column batchlabel.supplier_addresses.lines is
  'THE SHAPE IS LOAD-BEARING. The renderer indexes lines[0] and lines[length - 2] to lay a compressed address onto a small surface, so a null or blank element does not raise — it prints an empty line in the middle of a supplier address on a legal label. Constrained to 3..6 entries, every one present and non-blank.';

alter table batchlabel.supplier_addresses drop constraint if exists supplier_addresses_brand_check;
alter table batchlabel.supplier_addresses
  add  constraint supplier_addresses_brand_check check (brand_slug = 'batchlabel');

alter table batchlabel.supplier_addresses drop constraint if exists supplier_addresses_market_check;
alter table batchlabel.supplier_addresses
  add  constraint supplier_addresses_market_check check (market in ('GB', 'EU', 'NI'));

alter table batchlabel.supplier_addresses drop constraint if exists supplier_addresses_text_check;
alter table batchlabel.supplier_addresses
  add  constraint supplier_addresses_text_check check (btrim(label) <> '' and btrim(role) <> '');

alter table batchlabel.supplier_addresses drop constraint if exists supplier_addresses_lines_check;
alter table batchlabel.supplier_addresses
  add  constraint supplier_addresses_lines_check
  check (cardinality(lines) between 3 and 6 and batchlabel.all_lines_present(lines));

create index if not exists supplier_addresses_account_idx on batchlabel.supplier_addresses (account_id);

create table if not exists batchlabel.workspace_preferences (
  account_id        uuid primary key,
  brand_slug        text not null default 'batchlabel',

  enabled_categories text[] not null default array['home-fragrance']::text[],
  default_market     text,
  default_export     text,

  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  foreign key (account_id, brand_slug) references public.accounts (id, brand_slug) on delete cascade
);

comment on table batchlabel.workspace_preferences is
  'What turns the Preferences checkboxes from session state into a setting. enabled_categories is the one with a consumer today; default_market and default_export are nullable and nothing reads them yet — a null column nothing reads asserts nothing, unlike a select that appears to save and does not.';

alter table batchlabel.workspace_preferences drop constraint if exists workspace_preferences_brand_check;
alter table batchlabel.workspace_preferences
  add  constraint workspace_preferences_brand_check check (brand_slug = 'batchlabel');

alter table batchlabel.workspace_preferences drop constraint if exists workspace_preferences_market_check;
alter table batchlabel.workspace_preferences
  add  constraint workspace_preferences_market_check check (default_market is null or default_market in ('GB', 'EU'));

alter table batchlabel.workspace_preferences drop constraint if exists workspace_preferences_categories_check;
alter table batchlabel.workspace_preferences
  add  constraint workspace_preferences_categories_check
  check (cardinality(enabled_categories) > 0 and batchlabel.all_lines_present(enabled_categories));

-- The two UK GDPR obligations the privacy notice commits to, as REQUESTS rather than as
-- completions.
--
-- THE GRANT IS THE DESIGN. `authenticated` may SELECT and INSERT and nothing else. A maker
-- can ask for an export or an erasure and can watch its status; they cannot set that status
-- to 'completed', because they are not the party that completes it. Fulfilment is
-- service_role. That is what stops the Settings card from being another button that claims
-- an outcome — the honest sentence it can now render is "we have recorded your request",
-- which is a row, and the status column is the only thing that may ever say more.
create table if not exists batchlabel.account_data_requests (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null default public.current_account_id(),
  brand_slug   text not null default 'batchlabel',

  kind         text not null,
  status       text not null default 'requested',

  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  note         text,

  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  foreign key (account_id, brand_slug) references public.accounts (id, brand_slug) on delete cascade
);

comment on table batchlabel.account_data_requests is
  'A recorded request for a data export or an account erasure — the two UK GDPR obligations the privacy notice commits to and that the Settings card currently answers with an email address. authenticated may INSERT and SELECT and NOTHING ELSE: a maker asks, and cannot mark their own erasure complete. The honest sentence a screen may render off an inserted row is "we have recorded your request"; only `status` may ever say more than that.';

alter table batchlabel.account_data_requests drop constraint if exists account_data_requests_brand_check;
alter table batchlabel.account_data_requests
  add  constraint account_data_requests_brand_check check (brand_slug = 'batchlabel');

alter table batchlabel.account_data_requests drop constraint if exists account_data_requests_kind_check;
alter table batchlabel.account_data_requests
  add  constraint account_data_requests_kind_check check (kind in ('export', 'erasure'));

alter table batchlabel.account_data_requests drop constraint if exists account_data_requests_status_check;
alter table batchlabel.account_data_requests
  add  constraint account_data_requests_status_check
  check (status in ('requested', 'in_progress', 'completed', 'refused'));

alter table batchlabel.account_data_requests drop constraint if exists account_data_requests_completed_check;
alter table batchlabel.account_data_requests
  add  constraint account_data_requests_completed_check
  check (status <> 'completed' or completed_at is not null);

create index if not exists account_data_requests_account_idx on batchlabel.account_data_requests (account_id, requested_at desc);
create index if not exists account_data_requests_open_idx    on batchlabel.account_data_requests (status) where status in ('requested', 'in_progress');

-- ---------------------------------------------------------------------------
-- 9b. THE FINGERPRINT. What makes "Current" and "Out of date" facts.
-- WHAT IT COVERS, stated precisely, because a screen is going to render the word "Current"
-- off the back of it and that word must not be a lie:
--
--   * the composition — category, kind, product type, the four classification inputs, the
--     additive, markets, regimes, the UFI, the shape-varying `data` body, and the version;
--   * the pack — net quantity, unit, packaging id, and the product's own identifiers;
--   * the pinned materials — every (role, slot, target, name) tuple, so adopting a newer
--     reference version marks the artefact out of date;
--   * THE PRINTED BUSINESS IDENTITY — the supplier block and the address lines.
--
-- THE LAST ONE WAS A JUDGEMENT AND IT COULD HAVE GONE THE OTHER WAY. Including it means a
-- maker who corrects their registered address marks every artefact in the account out of
-- date, which is a large blast radius for a small edit. It is included anyway, because the
-- supplier name, address and telephone are printed on the face of every label under CLP
-- Article 17 and in sections 1 and 15 of every safety data sheet: a label printed against
-- the old address IS out of date, and a screen that said "Current" would be asserting
-- something false. The error runs toward reprinting, which is the safe direction for a
-- compliance tool.
--
-- WHAT IT DOES NOT COVER: the website (it is not part of the Article 17 block), and
-- anything derived rather than stored. Named so it is not discovered.
--
-- SECURITY INVOKER (the default) and stable. RLS therefore applies to every table it
-- reads, so a caller can only fingerprint a product they can already see and this is not
-- an existence oracle for somebody else's product id. That property is why it is NOT
-- security definer, and it should not be "optimised" into one.
create or replace function batchlabel.identity_fingerprint(p_account_id uuid)
returns text
language sql
stable
set search_path = batchlabel, public
as $$
  select md5(
    coalesce((
      select bi.registered_name || '|' || coalesce(bi.trading_name, '') || '|' ||
             coalesce(bi.telephone, '') || '|' || coalesce(bi.email, '') || '|' ||
             coalesce(bi.vat_number, '')
        from batchlabel.business_identity bi
       where bi.account_id = p_account_id
    ), '~no-identity~')
    || '||' ||
    coalesce((
      select string_agg(sa.market || ':' || sa.role || ':' || array_to_string(sa.lines, '\n'), '||'
                        order by sa.market)
        from batchlabel.supplier_addresses sa
       where sa.account_id = p_account_id
    ), '~no-addresses~')
  );
$$;

comment on function batchlabel.identity_fingerprint(uuid) is
  'A fingerprint of the supplier block that PRINTS: registered name, trading name, telephone, email, VAT number, and every market address. Deliberately excludes the website, which is not part of the CLP Article 17 block. Feeds artefact_source_fingerprint, so correcting a printed address marks existing artefacts out of date — a large blast radius, chosen because a label carrying the old address genuinely is out of date. SECURITY INVOKER, so RLS applies and it cannot be used to probe another account.';

create or replace function batchlabel.artefact_source_fingerprint(p_product_id uuid)
returns text
language sql
stable
set search_path = batchlabel, public
as $$
  select md5(
    concat_ws('||',
      p.id::text,
      coalesce(p.net_quantity::text, ''),
      coalesce(p.net_unit, ''),
      coalesce(p.packaging_id, ''),
      p.identifiers::text,
      s.category_id,
      s.kind,
      coalesce(s.product_type, ''),
      coalesce(s.fragrance_id, ''),
      coalesce(s.base_id, ''),
      coalesce(s.dye_id, ''),
      coalesce(s.load::text, ''),
      coalesce(s.additive, ''),
      array_to_string(s.markets, ','),
      array_to_string(s.regimes, ','),
      coalesce(s.ufi, ''),
      s.data::text,
      s.version::text,
      coalesce((
        select string_agg(
                 pin.role || ':' || pin.slot || ':' ||
                 coalesce(pin.material_id::text, pin.reference_version_id::text) || ':' || pin.pinned_name,
                 '|' order by pin.role, pin.slot)
          from batchlabel.specification_material_pins pin
         where pin.specification_id = s.id
      ), '~no-pins~'),
      batchlabel.identity_fingerprint(p.account_id)
    )
  )
  from batchlabel.products p
  join batchlabel.specifications s
    on s.id = p.specification_id and s.account_id = p.account_id
  where p.id = p_product_id;
$$;

comment on function batchlabel.artefact_source_fingerprint(uuid) is
  'Everything a label or safety data sheet is produced FROM: the composition, the pack, the pinned materials and the printed business identity. Stored on batchlabel.artefacts.specification_hash at production time; an artefact is current exactly when this returns the same value. Returns NULL for a product the caller cannot see — SECURITY INVOKER, so RLS applies and this is not an existence oracle. Does not cover the website or anything derived rather than stored.';

revoke all     on function batchlabel.identity_fingerprint(uuid)        from public;
revoke all     on function batchlabel.artefact_source_fingerprint(uuid) from public;
grant  execute on function batchlabel.identity_fingerprint(uuid)        to authenticated, service_role;
grant  execute on function batchlabel.artefact_source_fingerprint(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 10. Row Level Security, policies and grants.
--
-- Written as a loop over a named list rather than 60 hand-copied statements, because the
-- failure mode of the hand-copied version is one table where somebody pasted the wrong
-- predicate — and a loop that applies one expression to a named list cannot have that
-- defect. The list IS the audit surface: every account-scoped table appears in it exactly
-- once, and section 12 asserts the resulting policy count.
--
-- The predicate is public.is_member_of(account_id) everywhere, per rule 2.
--
-- THE VERB SETS, and each is a decision:
--
--   full        select, insert, update, delete. Materials and their parts, the addresses,
--               the pins — a maker owns these outright.
--   no-delete   select, insert, update. business_identity and workspace_preferences: there
--               is one row and you edit it; "delete my identity" is account erasure and
--               goes through account_data_requests.
--   append      select, insert. The record log and its two children, and the data
--               requests. See section 8 and section 9 for why each.
--   artefacts   select, insert, update, delete — update so printed_at can be stamped after
--               production, which is the one legitimate mutation of an artefact row.
-- ---------------------------------------------------------------------------
do $$
declare
  r         record;
  t         text;
  v_tables  text[];
begin
  for r in
    select * from (values
      ('materials',                  'full'),
      ('material_hazards',           'full'),
      ('material_allergens',         'full'),
      ('material_ifra_limits',       'full'),
      ('material_documents',         'full'),
      ('specification_material_pins','full'),
      ('supplier_addresses',         'full'),
      ('artefacts',                  'artefacts'),
      ('business_identity',          'no-delete'),
      ('workspace_preferences',      'no-delete'),
      ('record_events',              'append'),
      ('record_event_lots',          'append'),
      ('record_event_artefacts',     'append'),
      ('account_data_requests',      'append')
    ) as t(name, verbs)
  loop
    execute format('alter table batchlabel.%I enable row level security', r.name);

    execute format('drop policy if exists %I on batchlabel.%I',
                   r.name || ' are readable by account members', r.name);
    execute format('create policy %I on batchlabel.%I for select using (public.is_member_of(account_id))',
                   r.name || ' are readable by account members', r.name);

    execute format('drop policy if exists %I on batchlabel.%I',
                   r.name || ' are insertable by account members', r.name);
    execute format('create policy %I on batchlabel.%I for insert with check (public.is_member_of(account_id))',
                   r.name || ' are insertable by account members', r.name);

    -- USING and WITH CHECK both. USING decides which rows may be updated; WITH CHECK
    -- decides what they may become. Without the second, a member could move a row into an
    -- account they do not belong to.
    execute format('drop policy if exists %I on batchlabel.%I',
                   r.name || ' are updatable by account members', r.name);
    execute format('drop policy if exists %I on batchlabel.%I',
                   r.name || ' are deletable by account members', r.name);

    if r.verbs in ('full', 'no-delete', 'artefacts') then
      execute format('create policy %I on batchlabel.%I for update using (public.is_member_of(account_id)) with check (public.is_member_of(account_id))',
                     r.name || ' are updatable by account members', r.name);
    end if;

    if r.verbs in ('full', 'artefacts') then
      execute format('create policy %I on batchlabel.%I for delete using (public.is_member_of(account_id))',
                     r.name || ' are deletable by account members', r.name);
    end if;

    -- Grants. RLS still decides which rows; these decide which verbs. Revoked first so a
    -- narrowing of this list actually narrows what is granted on a re-run.
    execute format('revoke all on batchlabel.%I from anon, authenticated', r.name);
    execute format('grant all  on batchlabel.%I to service_role', r.name);

    if r.verbs = 'append' then
      execute format('grant select, insert on batchlabel.%I to authenticated', r.name);
    elsif r.verbs = 'no-delete' then
      execute format('grant select, insert, update on batchlabel.%I to authenticated', r.name);
    else
      execute format('grant select, insert, update, delete on batchlabel.%I to authenticated', r.name);
    end if;
  end loop;

  -- ── The brand-global catalogue. Readable by everybody, writable by nobody. ──
  --
  -- RLS is enabled with a SELECT policy and no other policy at all. With RLS on, a verb
  -- with no permissive policy is refused for every non-owner role even if a grant appears,
  -- so this is belt as well as braces: the absent INSERT/UPDATE/DELETE grants are the
  -- first refusal and the absent policies are the second.
  foreach t in array array['reference_materials', 'reference_material_versions']
  loop
    execute format('alter table batchlabel.%I enable row level security', t);
    execute format('drop policy if exists %I on batchlabel.%I',
                   t || ' are readable by every signed-in user', t);
    execute format('create policy %I on batchlabel.%I for select using (true)',
                   t || ' are readable by every signed-in user', t);
    execute format('revoke all    on batchlabel.%I from anon, authenticated', t);
    execute format('grant  select on batchlabel.%I to authenticated', t);
    execute format('grant  all    on batchlabel.%I to service_role', t);
  end loop;

  -- The resolution view. security_invoker, so it carries the caller's own RLS; never anon.
  revoke all    on batchlabel.resolved_materials from anon, authenticated;
  grant  select on batchlabel.resolved_materials to authenticated, service_role;

  v_tables := array(select c.relname from pg_class c
                     where c.relnamespace = 'batchlabel'::regnamespace
                       and c.relkind = 'r' and not c.relrowsecurity);
  if cardinality(v_tables) > 0 then
    raise exception
      'materials_records_identity: row level security is not enabled on batchlabel table(s): %. An RLS-less table in this schema is an open table.', array_to_string(v_tables, ', ')
      using errcode = '22023';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 11. The three triggers every account-scoped table gets, and why each.
--
--   _set_updated_at      public.set_updated_at(), so "when did this last change" is the
--                        database's answer and not the client's.
--   _pin_created_by      public.pin_created_by(). 20260803120000 section 7b: the INSERT and
--                        UPDATE grants are table-wide, so without this a raw PostgREST call
--                        can file a row under a colleague and a PATCH can rewrite the
--                        attribution afterwards. That matters most on this file's tables:
--                        the record log is evidence, and evidence with forgeable
--                        attribution is not evidence.
--   _account_required    public.require_account_id(). RLS refuses a null account_id with a
--                        bare 42501 BEFORE the NOT NULL is reached, so without this "you
--                        have no account yet" and "that is not your account" are the same
--                        code and no screen can say anything true about either. Named to
--                        sort before any other BEFORE INSERT trigger on the same table, so
--                        the account question is answered first.
--
-- Applied to the tables that carry the matching column, from one list, for the same reason
-- section 10 is a loop.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  v_updated text[] := array[
    'materials', 'material_documents', 'specification_material_pins', 'artefacts',
    'business_identity', 'supplier_addresses', 'workspace_preferences', 'account_data_requests'
  ];
  v_created text[] := array[
    'materials', 'material_documents', 'specification_material_pins', 'artefacts',
    'business_identity', 'supplier_addresses', 'workspace_preferences', 'account_data_requests',
    'record_events'
  ];
  v_account text[] := array[
    'materials', 'material_hazards', 'material_allergens', 'material_ifra_limits',
    'material_documents', 'specification_material_pins', 'artefacts',
    'supplier_addresses', 'account_data_requests',
    'record_events', 'record_event_lots', 'record_event_artefacts'
  ];
begin
  foreach t in array v_updated loop
    execute format('drop trigger if exists %I on batchlabel.%I', t || '_set_updated_at', t);
    execute format('create trigger %I before update on batchlabel.%I for each row execute function public.set_updated_at()',
                   t || '_set_updated_at', t);
  end loop;

  foreach t in array v_created loop
    execute format('drop trigger if exists %I on batchlabel.%I', t || '_pin_created_by', t);
    execute format('create trigger %I before insert or update on batchlabel.%I for each row execute function public.pin_created_by()',
                   t || '_pin_created_by', t);
  end loop;

  -- business_identity and workspace_preferences are absent from v_account deliberately:
  -- account_id is their PRIMARY KEY with no default, so an omitted column is a 23502 that
  -- already names the column, and a trigger would replace a precise error with a vaguer one.
  foreach t in array v_account loop
    execute format('drop trigger if exists %I on batchlabel.%I', t || '_account_required', t);
    execute format('create trigger %I before insert on batchlabel.%I for each row execute function public.require_account_id()',
                   t || '_account_required', t);
  end loop;
end
$$;
-- ---------------------------------------------------------------------------
-- 12. Behavioural assertions, run at apply time.
--
-- supabase/tests now exists and proves the isolation rules against two real users through
-- the role and JWT claim PostgREST sets, which is where the cross-account and cross-brand
-- work is done. THESE are the properties that must hold ON THE DATABASE THIS IS BEING
-- APPLIED TO: the catalogue really is empty here, the brand lock really does refuse a
-- sibling brand's account here, the recall query really does return the right batch. A
-- green CI run against PGlite is not evidence about production; a DO block that aborts the
-- migration is.
--
-- EVERY WRITE IS INSIDE A SUB-TRANSACTION THAT IS ALWAYS ROLLED BACK, and that is not
-- tidiness. Two of the probes below CANNOT be cleaned up by deleting afterwards, which is
-- the strongest possible evidence that they are testing the right thing:
--
--   * a reference material version cannot be deleted, by anybody, ever — that is the
--     guarantee section 3 exists to give, so a probe version would be permanent invented
--     reference data in a catalogue this file promises to leave empty;
--   * a record_events row cannot be removed by any session holding a JWT.
--
-- A plpgsql BEGIN ... EXCEPTION block is an implicit sub-transaction, so raising a sentinel
-- at the end of it discards every row written inside. Variable assignments are not
-- transactional and survive the rollback, which is how the results get out. The migration
-- therefore leaves ZERO durable rows behind — asserted at the end rather than assumed.
-- ---------------------------------------------------------------------------
do $$
declare
  v_n        integer;
  v_ok       boolean;
  v_account  uuid;
  v_probe    uuid;
  v_spec     uuid;
  v_product  uuid;
  v_art1     uuid;
  v_art2     uuid;
  v_event    uuid;
  v_refmat   uuid;
  v_refver   uuid;
  v_text     text;

  -- Collected inside the rolled-back probe, read after it.
  v_ran            boolean := false;
  v_update_refused boolean := false;
  v_delete_refused boolean := false;
  v_fingerprint    text;
  v_placeholder    boolean;
  v_recall_hit     integer := -1;
  v_recall_miss    integer := -1;
  v_lots           integer := -1;
  v_resolved       integer := -1;
  v_resolved_src   text;
  v_sibling_events boolean := true;
  v_sibling_ident  boolean := true;
begin
  -- --- Every table this file claims to create is here, in batchlabel ---------------
  select count(*) into v_n
    from pg_class c
   where c.relnamespace = 'batchlabel'::regnamespace
     and c.relkind = 'r'
     and c.relname in (
       'reference_materials', 'reference_material_versions', 'materials', 'material_hazards',
       'material_allergens', 'material_ifra_limits', 'material_documents',
       'specification_material_pins', 'artefacts', 'record_events', 'record_event_lots',
       'record_event_artefacts', 'business_identity', 'supplier_addresses',
       'workspace_preferences', 'account_data_requests');
  if v_n <> 16 then
    raise exception 'materials_records_identity: expected 16 new tables in batchlabel, found %.', v_n
      using errcode = '22023';
  end if;

  -- --- THE BRAND LOCK is on every account-scoped one of them ----------------------
  -- Counted rather than eyeballed: 14 new tables plus products and specifications from
  -- 20260804120000 must each carry the composite foreign key to accounts (id, brand_slug).
  -- One missing is one table a sibling brand can write into.
  select count(*) into v_n
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid
   where c.relnamespace = 'batchlabel'::regnamespace
     and k.contype   = 'f'
     and k.confrelid = 'public.accounts'::regclass
     and cardinality(k.conkey) = 2;
  if v_n < 16 then
    raise exception
      'materials_records_identity: only % of 16 account-scoped tables carry the composite (account_id, brand_slug) foreign key. A table without it is one a sibling brand can write into.', v_n
      using errcode = '22023';
  end if;

  -- ...and a brand_slug CHECK pinning the other half of that key. 16 new + 2 existing.
  select count(*) into v_n
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid
   where c.relnamespace = 'batchlabel'::regnamespace
     and k.contype = 'c'
     and k.conname like '%\_brand\_check';
  if v_n < 18 then
    raise exception
      'materials_records_identity: only % of 18 batchlabel tables pin brand_slug with a CHECK. Without the CHECK the composite foreign key can be satisfied by naming another brand.', v_n
      using errcode = '22023';
  end if;

  -- --- provenance CANNOT BE LEFT UNSAID -------------------------------------------
  -- The column is the difference between a catalogue and a pile of assertions, and a
  -- grep would pass on a `provenance text` that had quietly lost its NOT NULL.
  select count(*) into v_n
    from information_schema.columns
   where table_schema = 'batchlabel' and table_name = 'reference_material_versions'
     and column_name = 'provenance' and is_nullable = 'NO';
  if v_n <> 1 then
    raise exception
      'materials_records_identity: reference_material_versions.provenance is nullable. A reference classification could then be published without saying whether it came from a supplier document or was made up to show the shape — which is the exact defect this catalogue exists to refuse.'
      using errcode = '22023';
  end if;

  -- --- THE RECORD LOG IS APPEND-ONLY, BY BOTH MECHANISMS ---------------------------
  -- This cannot be exercised from here: the apply-time session has no auth.uid() and is
  -- DELIBERATELY let through, because the GDPR erasure cascade runs on that path (section
  -- 8). supabase/tests/domain-tables.test.ts does exercise it, as a real signed-in user.
  -- What is checkable here is that both mechanisms the design claims are actually in
  -- place: the trigger, and the absence of the grants.
  select count(*) into v_n
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
   where c.relnamespace = 'batchlabel'::regnamespace
     and not t.tgisinternal
     and t.tgname in ('record_events_append_only', 'record_event_lots_append_only',
                      'record_event_artefacts_append_only',
                      'reference_material_versions_immutable');
  if v_n <> 4 then
    raise exception
      'materials_records_identity: expected 4 append-only/immutability triggers, found %. A log a screen can rewrite is not evidence of anything.', v_n
      using errcode = '22023';
  end if;

  select count(*) into v_n
    from information_schema.role_table_grants
   where grantee = 'authenticated' and table_schema = 'batchlabel'
     and table_name in ('record_events', 'record_event_lots', 'record_event_artefacts',
                        'account_data_requests', 'reference_materials', 'reference_material_versions')
     and privilege_type in ('UPDATE', 'DELETE');
  if v_n > 0 then
    raise exception
      'materials_records_identity: authenticated holds % UPDATE/DELETE grant(s) on the append-only or read-only tables. The trigger is the second line; this is the first.', v_n
      using errcode = '22023';
  end if;

  select count(*) into v_n
    from information_schema.role_table_grants
   where grantee = 'authenticated' and table_schema = 'batchlabel'
     and table_name in ('reference_materials', 'reference_material_versions')
     and privilege_type = 'INSERT';
  if v_n > 0 then
    raise exception
      'materials_records_identity: authenticated can INSERT into the shipped reference catalogue. A maker would be able to publish reference data every other maker reads.'
      using errcode = '22023';
  end if;

  -- --- THE CATALOGUE IS EMPTY, and that is the point ------------------------------
  select count(*) into v_n from batchlabel.reference_materials;
  if v_n <> 0 then
    raise notice 'materials_records_identity: the reference catalogue already holds % material(s). This migration seeds none — check every version declares a provenance.', v_n;
  end if;

  select count(*) into v_n
    from batchlabel.reference_material_versions where provenance = 'illustrative-example';
  if v_n > 0 then
    raise notice 'materials_records_identity: % reference version(s) are marked illustrative-example. EVERY SCREEN RENDERING ONE MUST LABEL IT AS AN EXAMPLE.', v_n;
  end if;

  -- --- THE RESOLUTION VIEW still reads, and still reads AS THE CALLER --------------
  select count(*) into v_n from batchlabel.resolved_materials;

  select c.reloptions::text ilike '%security_invoker=true%' into v_ok
    from pg_class c where c.oid = 'batchlabel.resolved_materials'::regclass;
  if not coalesce(v_ok, false) then
    raise exception
      'materials_records_identity: batchlabel.resolved_materials is no longer security_invoker. It would run as its owner, which bypasses row level security, and every signed-in user would see every other maker''s materials.'
      using errcode = '22023';
  end if;

  -- ================================================================================
  -- THE PROBE. Everything below writes, and all of it is discarded.
  -- ================================================================================
  begin
    -- ── Reference versions are immutable, exercised rather than described ──────────
    -- Proved as the migration's own session, which is the owning, RLS-bypassing,
    -- service-level session — the one with the MOST privilege. Refused here is refused
    -- everywhere.
    insert into batchlabel.reference_materials (slug, material_class, name)
    values ('__probe_ref__', 'ingredient', 'Immutability probe')
    returning id into v_refmat;

    insert into batchlabel.reference_material_versions
      (reference_material_id, version, provenance, notes)
    values (v_refmat, 1, 'illustrative-example', 'probe')
    returning id into v_refver;

    begin
      update batchlabel.reference_material_versions set notes = 'rewritten' where id = v_refver;
      v_update_refused := false;
    exception when others then
      v_update_refused := true;
    end;

    begin
      delete from batchlabel.reference_material_versions where id = v_refver;
      v_delete_refused := false;
    exception when others then
      v_delete_refused := true;
    end;

    -- ── The brand lock admits a Batchlabel account, on every new table ─────────────
    -- Both directions matter: a lock that refuses everything passes a one-sided test
    -- while locking every customer out of their own workspace.
    select a.id into v_account from public.accounts a where a.brand_slug = 'batchlabel' limit 1;

    if v_account is not null then
      v_ran := true;

      insert into batchlabel.materials (account_id, material_class, name)
      values (v_account, 'ingredient', '__probe_material__') returning id into v_probe;

      insert into batchlabel.material_hazards (account_id, material_id, code, statement, hazard_class)
      values (v_account, v_probe, 'H317', 'May cause an allergic skin reaction.', 'Skin Sens. 1');

      insert into batchlabel.material_allergens (account_id, material_id, name, pct)
      values (v_account, v_probe, 'linalool', 3.1);

      insert into batchlabel.material_ifra_limits (account_id, material_id, category, max_pct)
      values (v_account, v_probe, 'Category 12', 100);

      insert into batchlabel.material_documents (account_id, material_id, document_kind)
      values (v_account, v_probe, 'Safety data sheet');

      insert into batchlabel.business_identity (account_id, registered_name)
      values (v_account, '__probe_identity__');

      insert into batchlabel.supplier_addresses (account_id, market, label, role, lines)
      values (v_account, 'GB', '__probe__', 'Supplier and manufacturer',
              array['__probe_identity__', 'Street', 'Town', 'United Kingdom']);

      insert into batchlabel.workspace_preferences (account_id) values (v_account);

      insert into batchlabel.account_data_requests (account_id, kind) values (v_account, 'export');

      insert into batchlabel.specifications (account_id, name, category_id)
      values (v_account, '__probe_spec__', 'home-fragrance') returning id into v_spec;

      insert into batchlabel.specification_material_pins
        (account_id, specification_id, role, material_id, pinned_name)
      values (v_account, v_spec, 'base', v_probe, '__probe_material__');

      insert into batchlabel.products (account_id, specification_id, name)
      values (v_account, v_spec, '__probe_product__') returning id into v_product;

      -- The fingerprint is a real value derived from real rows, not a constant.
      select batchlabel.artefact_source_fingerprint(v_product) into v_fingerprint;

      insert into batchlabel.artefacts (account_id, product_id, artefact_type, version, specification_hash)
      values (v_account, v_product, 'unit-label', 1, coalesce(v_fingerprint, 'x'))
      returning id into v_art1;
      insert into batchlabel.artefacts (account_id, product_id, artefact_type, version, specification_hash)
      values (v_account, v_product, 'unit-label', 2, coalesce(v_fingerprint, 'x'))
      returning id into v_art2;

      select is_placeholder into v_placeholder from batchlabel.artefacts where id = v_art1;

      -- Two batches: one carrying the artefact we are about to "find wrong", one not.
      select batchlabel.record_batch_produced(
        v_account, v_product, 'BATCH-A', 'Probe batch A', now(), 40,
        '[{"material_ref":"ing-probe","lot":"LOT-1"}]'::jsonb, array[v_art1]) into v_event;
      perform batchlabel.record_batch_produced(
        v_account, v_product, 'BATCH-B', 'Probe batch B', now(), 10,
        '[]'::jsonb, array[v_art2]);

      -- THE RECALL QUESTION, actually asked.
      select count(*) into v_recall_hit
        from batchlabel.record_events e
        join batchlabel.record_event_artefacts ea on ea.record_event_id = e.id
       where ea.artefact_id = v_art1 and e.kind = 'batch.produced' and e.batch_code = 'BATCH-A';

      select count(*) into v_recall_miss
        from batchlabel.record_events e
        join batchlabel.record_event_artefacts ea on ea.record_event_id = e.id
       where ea.artefact_id = v_art1 and e.batch_code = 'BATCH-B';

      select count(*) into v_lots
        from batchlabel.record_event_lots where record_event_id = v_event;

      -- THE PRECEDENCE RULE: the maker's own row beats ours.
      update batchlabel.materials set overrides_reference_id = v_refmat where id = v_probe;

      select count(*) into v_resolved
        from batchlabel.resolved_materials
       where account_id = v_account and reference_material_id = v_refmat;

      select source into v_resolved_src
        from batchlabel.resolved_materials
       where account_id = v_account and reference_material_id = v_refmat
       limit 1;
    end if;

    -- ── ...and refuses a sibling brand's account ───────────────────────────────────
    -- On the record log, which is the table a future shared "audit" helper is most likely
    -- to be pointed at, and on the printed identity, which is the one that would end up on
    -- somebody else's label.
    insert into public.brands (slug, name) values ('__probe_brand2__', 'Records probe')
      on conflict (slug) do nothing;

    insert into public.accounts (id, brand_slug, owner_user_id, name)
    select gen_random_uuid(), '__probe_brand2__', a.owner_user_id, '__probe_account__'
      from public.accounts a limit 1
    returning id into v_account;

    if v_account is not null then
      begin
        insert into batchlabel.record_events (account_id, kind, summary)
        values (v_account, 'note', 'planted by a sibling brand');
        v_sibling_events := false;
      exception when foreign_key_violation then
        v_sibling_events := true;
      end;

      begin
        insert into batchlabel.business_identity (account_id, registered_name)
        values (v_account, 'Planted Ltd');
        v_sibling_ident := false;
      exception when foreign_key_violation then
        v_sibling_ident := true;
      end;
    end if;

    -- Discard everything above. See the section comment: two of these rows cannot be
    -- deleted afterwards by design, which is why the whole probe is a sub-transaction.
    raise exception 'materials_records_identity_probe_rollback' using errcode = '22023';
  exception when others then
    if sqlerrm <> 'materials_records_identity_probe_rollback' then
      raise;
    end if;
  end;

  -- ================================================================================
  -- WHAT THE PROBE FOUND.
  -- ================================================================================
  if not v_update_refused then
    raise exception
      'materials_records_identity: a published reference material version COULD BE UPDATED. The answer to "what happens to a maker who built products on a shared row when we update it" was that we cannot — and we just did.'
      using errcode = '22023';
  end if;

  if not v_delete_refused then
    raise exception
      'materials_records_identity: a published reference material version COULD BE DELETED. A specification''s pin would be left pointing at nothing.'
      using errcode = '22023';
  end if;

  if not v_sibling_events then
    raise exception
      'materials_records_identity: a SIBLING BRAND''S ACCOUNT wrote into batchlabel.record_events. The (account_id, brand_slug) foreign key is not doing its job and brand isolation is emergent again.'
      using errcode = '22023';
  end if;

  if not v_sibling_ident then
    raise exception
      'materials_records_identity: a SIBLING BRAND''S ACCOUNT wrote into batchlabel.business_identity — the block that prints on a label.'
      using errcode = '22023';
  end if;

  if v_ran then
    if v_fingerprint is null or length(v_fingerprint) <> 32 then
      raise exception
        'materials_records_identity: artefact_source_fingerprint returned % for a live product. Without it "Current" and "Out of date" have no source and ArtefactInstance.current stays hardcoded.', coalesce(v_fingerprint, 'NULL')
        using errcode = '22023';
    end if;

    if not v_placeholder then
      raise exception
        'materials_records_identity: batchlabel.artefacts.is_placeholder no longer defaults to TRUE. A row written by the generation stub would claim to be a produced label.'
        using errcode = '22023';
    end if;

    if v_recall_hit <> 1 then
      raise exception
        'materials_records_identity: the recall query did not find the batch carrying the artefact (% row(s)). "Which batches carry the label I have just found wrong" is the question this log exists to answer.', v_recall_hit
        using errcode = '22023';
    end if;

    if v_recall_miss <> 0 then
      raise exception
        'materials_records_identity: the recall query returned a batch that does NOT carry the artefact. A recall that over-reports is a recall nobody acts on.'
        using errcode = '22023';
    end if;

    if v_lots <> 1 then
      raise exception
        'materials_records_identity: record_batch_produced did not write the input lot (% row(s)). The other half of a recall — which drum went into which batch — would be missing.', v_lots
        using errcode = '22023';
    end if;

    if v_resolved <> 1 then
      raise exception
        'materials_records_identity: resolved_materials returned % rows for an overridden reference material. The precedence rule is that the maker''s own row wins, which means exactly one.', v_resolved
        using errcode = '22023';
    end if;

    if v_resolved_src is distinct from 'account' then
      raise exception
        'materials_records_identity: resolved_materials resolved an overridden material to ''%'' rather than ''account''. Ours is winning over the maker''s, which is the precedence rule backwards.', coalesce(v_resolved_src, 'NULL')
        using errcode = '22023';
    end if;
  else
    raise notice 'materials_records_identity: no batchlabel account exists yet, so the maker-side probes did not run. The brand lock and the immutability rule were still proved.';
  end if;

  -- --- THE PROBE LEFT NOTHING BEHIND ---------------------------------------------
  -- Asserted, because "it rolls back" is a claim about plpgsql sub-transactions and this
  -- file does not get to make claims either.
  select count(*) into v_n from batchlabel.reference_materials where slug = '__probe_ref__';
  if v_n <> 0 then
    raise exception
      'materials_records_identity: the probe left % reference material(s) behind. This file promises the catalogue ships EMPTY and it has just seeded invented data into it.', v_n
      using errcode = '22023';
  end if;

  select count(*) into v_n from batchlabel.record_events where batch_code in ('BATCH-A', 'BATCH-B');
  if v_n <> 0 then
    raise exception
      'materials_records_identity: the probe left % row(s) in the record log, and the log is append-only so they cannot be removed.', v_n
      using errcode = '22023';
  end if;

  select count(*) into v_n from public.brands where slug = '__probe_brand2__';
  if v_n <> 0 then
    raise exception 'materials_records_identity: the probe left a brand behind.' using errcode = '22023';
  end if;

  -- --- The read surface billing depends on has not been disturbed -----------------
  select count(*) into v_n from public.entitlements;
  select c.reloptions::text ilike '%security_invoker=true%' into v_ok
    from pg_class c where c.oid = 'public.entitlements'::regclass;
  if not coalesce(v_ok, false) then
    raise exception
      'materials_records_identity: public.entitlements is no longer security_invoker. Every signed-in user would see every other user''s billing state.'
      using errcode = '22023';
  end if;

  -- --- anon reaches none of it ----------------------------------------------------
  select count(*) into v_n
    from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'batchlabel';
  if v_n > 0 then
    raise exception
      'materials_records_identity: anon holds % grant(s) in the batchlabel schema. anon is not granted USAGE on the schema either, but a grant that exists is one somebody reaches the day that changes.', v_n
      using errcode = '22023';
  end if;

  raise notice 'materials_records_identity: 16 tables; the composite brand lock on all of the account-scoped ones; an empty, provenance-constrained reference catalogue whose published versions refuse UPDATE and DELETE from the most privileged session there is; the maker-wins precedence rule proved on real rows; a recall query that finds the batch carrying a given artefact and not the one that does not; and no anon grant anywhere. Every probe row was rolled back.';
end
$$;
