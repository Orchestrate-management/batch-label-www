-- Make "this label still matches the composition" a fact about the materials it was
-- derived from, rather than a fact about four text columns that never move.
--
-- =============================================================================
-- WHAT WAS FALSE, AND HOW IT WAS PROVED FALSE BEFORE ANYTHING HERE WAS WRITTEN
-- =============================================================================
--
-- The label designer renders, off batchlabel.artefacts.specification_hash compared with
-- batchlabel.artefact_source_fingerprint(product_id):
--
--     "v1 still matches this composition — nothing that goes onto the label has changed
--      since."
--
-- Run against the schema as it stood, as a signed-in maker (supabase/tests, PGlite):
--
--     fingerprint at print time  : b670f02af6be0693136a7bff34023a61
--     after H317 was removed     : b670f02af6be0693136a7bff34023a61   UNCHANGED
--     after the material archived: b670f02af6be0693136a7bff34023a61   UNCHANGED
--     pins in the whole database : 0
--
-- The maker corrected their fragrance oil because the supplier reissued the safety data
-- sheet — the H317 row went. The label preview lost H317 and the signal word went from
-- "Warning" to null IMMEDIATELY, because src/lib/derive.ts resolves the material out of the
-- register on every render. The fingerprint did not move, so the screen went on telling
-- them the label on their jars still matched.
--
-- IT DID NOT MOVE BECAUSE IT NEVER LOOKED. The old fingerprint covered the composition's
-- four text columns, the pack, the printed identity, and a term over
-- batchlabel.specification_material_pins. specifications.fragrance_id holds the material's
-- ID, and an id does not change when the row it names is edited. The pin term was the
-- literal '~no-pins~' for every row in the database, because NOTHING HAS EVER INSERTED A
-- PIN — the only INSERT into that table anywhere in either repository is in the previous
-- migration's own probe block, which rolls back. So the fingerprint hashed the identity of
-- the materials and never their contents, and their contents are the entire classification.
--
-- =============================================================================
-- THE CHOICE, AND WHY IT IS NOT PINNING
-- =============================================================================
--
-- The obvious repair is to make the pins real: write a pin row when a material is chosen,
-- so the fingerprint's existing pin term starts moving. It was rejected, and the reason is
-- worth writing down because the table's own comments recommend it.
--
--   * A PIN WOULD NOT DETECT THIS AT ALL. A pin holds (role, slot, target id, name at the
--     time). The maker's own material is EDITED IN PLACE — batchlabel.materials and its
--     hazard rows are mutable, which is the whole point of a register you correct — so the
--     pin tuple is byte-identical either side of the correction that removed H317. Pinning
--     leaves the blocker exactly where it is. The pin design answers a different question,
--     the one about OUR catalogue moving under a maker, and the catalogue is empty.
--   * A PIN IS A SECOND SOURCE OF TRUTH FOR WHICH MATERIAL A COMPOSITION USES. The
--     derivation reads specifications.fragrance_id. A pin written beside it, by a separate
--     statement in a pair that products.ts already documents as non-atomic, can disagree
--     with it — and then the fingerprint is a hash of a material the label was not derived
--     from. That is not a smaller version of the defect being fixed here; it is the same
--     defect with a table behind it.
--   * A PIN IS ONLY SOUND IF IT DRIVES THE DERIVATION, and making it drive the derivation
--     means threading a per-specification reference version through a synchronous material
--     index shared by derive, sds, regimes, pipeline and five screens.
--
-- So the fingerprint is widened instead: it now covers THE RESOLVED MATERIAL STATE the
-- label was derived from, resolved the same way src/lib/derive.ts resolves it — off the ids
-- the specification actually stores. One source of truth, and the thing that is hashed is
-- the thing that prints.
--
-- batchlabel.specification_material_pins is left in place and left empty. Its comment is
-- corrected below so the next reader is not told that currency depends on it.
--
-- =============================================================================
-- WHAT ARCHIVING DOES, AND WHY archived_at IS DELIBERATELY NOT IN THE HASH
-- =============================================================================
--
-- The materials register says, at the moment a maker archives: "Products already built on
-- it keep working and keep naming it." That was false too — batchlabel.resolved_materials
-- carries `where m.archived_at is null`, so the row left the register entirely and the
-- product's hazard statements went to []. The app side of that is fixed in the client (an
-- archived material is still resolvable for anything already built on it, and only leaves
-- the pickers), and this file is the storage half of the same decision:
--
--   * material_state_fingerprint RESOLVES AN ARCHIVED MATERIAL. It does not fall through to
--     '~unresolved~', because the label is still derived from it.
--   * IT DOES NOT HASH archived_at. Archiving changes nothing that prints, so an artefact
--     must not be marked out of date by it. Hashing the flag would produce the opposite
--     false sentence — "no longer matches" over a label that matches perfectly.
--
-- The two together are what make the register's promise true rather than reworded.
--
-- =============================================================================
-- WHAT THIS COSTS: EVERY EXISTING ARTEFACT NOW READS "OUT OF DATE"
-- =============================================================================
--
-- specification_hash rows were computed by the old function, so none of them can equal the
-- new one. Every recorded print in the three internal accounts flips to "no longer matches
-- this product" on first load. That is the correct direction for a compliance tool — the
-- error runs toward reprinting — and it is honest: nothing checked those labels against
-- their materials, so "current" was never established for any of them. The probe at the
-- foot of this file counts them and raises a notice with the number.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. THE MATERIAL STATE. What one composition slot resolves to, and what it says.
--
-- ONE ARGUMENT, TAKING THE STRING A SPECIFICATION ACTUALLY STORES. specifications.
-- fragrance_id / base_id / dye_id and products.packaging_id hold one string per slot, and
-- src/lib/material-index.ts resolves it against a single id space: the account material's
-- uuid, or a reference material's slug. This function resolves it the same way and in the
-- same order, because a fingerprint that resolved differently from the derivation would be
-- hashing a material the label was not made from.
--
-- FOUR ANSWERS, ALL OF THEM DISTINCT:
--   '~unset~'       the slot is empty. A composition the maker has not finished.
--   an md5          it resolved, and this is what it says.
--   '~unresolved~'  the string names nothing. A deleted material, or a stale id — and it
--                   MUST hash differently from '~unset~', because a slot that lost its
--                   material is a change to what prints and an empty slot is not.
--
-- WHAT IS HASHED IS WHAT THE DERIVATION READS: every hazard row with its concentration
-- limits, pictogram and signal word; every allergen and its percentage; every IFRA limit;
-- the document the figures are cited from (it prints, in the safety data sheet); the INCI
-- name and CAS number; and the packaging geometry the artefact is laid out against.
--
-- WHAT IS NOT: archived_at (see the header), categories, notes, and the created/updated
-- timestamps. None of them reach a label, and a fingerprint that moved when a maker tidied
-- a note would cry wolf until nobody read it.
--
-- EVERY ARGUMENT IS COALESCED BEFORE concat_ws SEES IT, deliberately. concat_ws SKIPS null
-- arguments rather than emitting a separator for them, so ('a', null, 'b') and ('a', 'b')
-- produce the same string — two different materials with one hash. The coalesces are what
-- stop that, and they are not noise.
--
-- SECURITY INVOKER (the default) and stable, for the reason the previous migration gives
-- for artefact_source_fingerprint: RLS then applies to materials and this cannot be used to
-- ask whether somebody else's material exists.
-- ---------------------------------------------------------------------------
create or replace function batchlabel.material_state_fingerprint(p_account_id uuid, p_ref text)
returns text
language sql
stable
set search_path = batchlabel, public
as $$
  select case
    when coalesce(btrim(p_ref), '') = '' then '~unset~'
    else coalesce(
      -- The maker's own material, ARCHIVED OR NOT. Compared as text so a slot holding a
      -- reference slug cannot raise 22P02 on its way past this branch.
      (
        select md5(concat_ws('|',
          'account',
          m.id::text,
          coalesce(m.slug, ''),
          coalesce(m.material_class, ''),
          coalesce(m.name, ''),
          coalesce(m.supplier, ''),
          coalesce(m.supplier_code, ''),
          coalesce(m.role, ''),
          coalesce(m.inci, ''),
          coalesce(m.inci_function, ''),
          coalesce(m.cas, ''),
          coalesce(m.format, ''),
          coalesce(m.capacity_ml::text, ''),
          coalesce(m.label_area_width_mm::text, ''),
          coalesce(m.label_area_height_mm::text, ''),
          coalesce(m.food_contact::text, ''),
          coalesce(m.child_resistant::text, ''),
          coalesce(m.overrides_reference_id::text, ''),
          coalesce((
            select string_agg(
                     concat_ws(':', coalesce(h.code, ''), coalesce(h.hazard_class, ''),
                               coalesce(h.gcl::text, '~'), coalesce(h.scl::text, '~'),
                               coalesce(h.pictogram, ''), coalesce(h.signal, ''),
                               coalesce(h.statement, '')),
                     '|' order by h.code, h.statement)
              from batchlabel.material_hazards h
             where h.material_id = m.id
          ), '~no-hazards~'),
          coalesce((
            select string_agg(coalesce(a.name, '') || ':' || coalesce(a.pct::text, '~'),
                              '|' order by a.name, a.pct)
              from batchlabel.material_allergens a
             where a.material_id = m.id
          ), '~no-allergens~'),
          coalesce((
            select string_agg(
                     concat_ws(':', coalesce(i.category, ''), coalesce(i.description, ''),
                               coalesce(i.max_pct::text, '~')),
                     '|' order by i.category, i.max_pct)
              from batchlabel.material_ifra_limits i
             where i.material_id = m.id
          ), '~no-ifra~'),
          coalesce((
            select string_agg(
                     concat_ws(':', coalesce(d.document_kind, ''), coalesce(d.reference, ''),
                               coalesce(d.version, ''), coalesce(d.document_date::text, '')),
                     '|' order by d.document_kind, d.reference, d.version)
              from batchlabel.material_documents d
             where d.material_id = m.id
          ), '~no-documents~')
        ))
          from batchlabel.materials m
         where m.account_id = p_account_id
           and m.id::text   = p_ref
      ),
      -- Ours. The LATEST published version, which is what batchlabel.resolved_materials
      -- hands the app, so publishing a correction moves this hash and the maker is told
      -- their recorded print no longer matches. It does not freeze them on the old version
      -- — nothing in this codebase does that yet, and the register no longer says it does.
      (
        select md5(concat_ws('|',
          'reference',
          rm.id::text,
          coalesce(rm.slug, ''),
          coalesce(rm.material_class, ''),
          coalesce(rm.name, ''),
          coalesce(rm.supplier, ''),
          coalesce(rm.supplier_code, ''),
          coalesce(rm.role, ''),
          coalesce(v.id::text, '~no-version~'),
          coalesce(v.version::text, ''),
          coalesce(v.provenance, ''),
          coalesce(v.payload::text, ''),
          coalesce(v.document_kind, ''),
          coalesce(v.document_reference, ''),
          coalesce(v.document_version, ''),
          coalesce(v.document_date::text, '')
        ))
          from batchlabel.reference_materials rm
          left join lateral (
            select rv.id, rv.version, rv.provenance, rv.payload, rv.document_kind,
                   rv.document_reference, rv.document_version, rv.document_date
              from batchlabel.reference_material_versions rv
             where rv.reference_material_id = rm.id
             order by rv.version desc
             limit 1
          ) v on true
         where rm.slug = p_ref
      ),
      '~unresolved~'
    )
  end;
$$;

comment on function batchlabel.material_state_fingerprint(uuid, text) is
  'What ONE composition slot resolves to and what that material says: every hazard row with its concentration limits, every allergen and percentage, every IFRA limit, the cited document, the INCI and CAS, the packaging geometry. Resolves the maker''s own material by uuid first and a reference material by slug second — the same id space and the same precedence src/lib/material-index.ts uses, because a fingerprint that resolved differently would hash a material the label was not derived from. RESOLVES ARCHIVED MATERIALS and does NOT hash archived_at: archiving changes nothing that prints, so it must not mark a label out of date. Distinguishes ~unset~ (empty slot) from ~unresolved~ (an id naming nothing).';

-- ---------------------------------------------------------------------------
-- 2. EVERY MATERIAL ONE COMPOSITION NAMES, WHATEVER SHAPE IT HAS.
--
-- Three composition kinds and only one of them keeps its materials in columns. A mixture
-- names three (fragrance, base, dye); a phased cosmetic formula names one per phase item
-- and a bill of materials one per line, and both of those live inside specifications.data
-- because the column set cannot be per-shape.
--
-- SO THE JSON IS WALKED RATHER THAN THE TWO KNOWN SHAPES BEING READ. `$.**.materialId`
-- finds every materialId at any depth, which means a phase item, a bill-of-materials line,
-- and whatever the next composition shape stores are all covered by construction rather
-- than by somebody remembering to add a branch here. A fingerprint that silently stopped
-- covering a new shape would reintroduce exactly the defect this file exists to close.
--
-- The pack's packaging id is passed in rather than joined, because it is a column on
-- products and this function is about one specification.
-- ---------------------------------------------------------------------------
create or replace function batchlabel.specification_material_refs(
  p_specification_id uuid,
  p_packaging_id     text default null
)
returns setof text
language sql
stable
set search_path = batchlabel, public
as $$
  select distinct r
    from (
      select s.fragrance_id as r from batchlabel.specifications s where s.id = p_specification_id
      union all
      select s.base_id      from batchlabel.specifications s where s.id = p_specification_id
      union all
      select s.dye_id       from batchlabel.specifications s where s.id = p_specification_id
      union all
      select p_packaging_id
      union all
      select jp #>> '{}'
        from batchlabel.specifications s,
             lateral jsonb_path_query(coalesce(s.data, '{}'::jsonb), '$.**.materialId') jp
       where s.id = p_specification_id
    ) refs
   where coalesce(btrim(r), '') <> '';
$$;

comment on function batchlabel.specification_material_refs(uuid, text) is
  'Every material id one composition names: the three mixture columns, the pack''s packaging id, and every materialId at any depth of specifications.data — so phase items, bill-of-materials lines and any future composition shape are covered without a branch per shape. Feeds artefact_source_fingerprint. SECURITY INVOKER, so it returns nothing for a specification the caller cannot see.';

-- ---------------------------------------------------------------------------
-- 3. THE FINGERPRINT, WIDENED.
--
-- Everything the previous definition covered is still covered — the composition, the pack,
-- the version, and the printed business identity, for the reasons 20260804130000 section 9b
-- gives and which have not changed. Two differences:
--
--   * THE MATERIAL STATE TERM IS NEW. For every id the composition and the pack name, the
--     id AND what that material currently says. This is the term that moves when a maker
--     corrects a hazard row, and it is the whole point of the file.
--   * THE PIN TERM IS GONE. It was the literal '~no-pins~' on every row in the database and
--     it was covering a mechanism nothing implements. A constant in a hash is not a
--     safeguard, and leaving it in would keep implying that pins are what makes this true.
--
-- Both the ids and the state are hashed, not just the state, so swapping two materials
-- between slots is a change even in the pathological case where they say the same thing.
-- ---------------------------------------------------------------------------
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
        select string_agg(ref || '=' || batchlabel.material_state_fingerprint(p.account_id, ref),
                          '|' order by ref)
          from batchlabel.specification_material_refs(s.id, p.packaging_id) as ref
      ), '~no-materials~'),
      batchlabel.identity_fingerprint(p.account_id)
    )
  )
  from batchlabel.products p
  join batchlabel.specifications s
    on s.id = p.specification_id and s.account_id = p.account_id
  where p.id = p_product_id;
$$;

comment on function batchlabel.artefact_source_fingerprint(uuid) is
  'Everything a label or safety data sheet is produced FROM: the composition, the pack, THE STATE OF EVERY MATERIAL THE COMPOSITION AND PACK NAME — every hazard row, allergen, IFRA limit and cited document, resolved the way the derivation resolves them — and the printed business identity. Stored on batchlabel.artefacts.specification_hash at production time; an artefact is current exactly when this returns the same value. Correcting a fragrance oil''s hazard rows moves it, which is what makes "still matches this composition" a fact rather than a hope. Archiving a material does not move it, because archiving changes nothing that prints. Returns NULL for a product the caller cannot see — SECURITY INVOKER, so RLS applies and this is not an existence oracle. Does not cover the website or anything derived rather than stored.';

-- ---------------------------------------------------------------------------
-- 4. WHO IS USING THIS MATERIAL. Asked before archiving, not discovered after.
--
-- The archive button used to fire on the first click and then TELL the maker what it had
-- done. It now asks first, and the sentence it asks with names the products — which means
-- something has to be able to answer "which live products name this material", for all
-- three composition shapes, using the same resolution rule as the fingerprint. Doing it in
-- the client would mean re-implementing the jsonb walk in PostgREST filters, and the two
-- implementations would drift.
--
-- SECURITY INVOKER, so it answers only about the caller's own products: RLS on products and
-- specifications applies inside the function body exactly as it would outside it. It takes a
-- material REF rather than a uuid so it can answer for a reference material's slug too.
-- ---------------------------------------------------------------------------
create or replace function batchlabel.products_using_material(p_material_ref text)
returns table (
  product_id         uuid,
  product_name       text,
  sku                text,
  specification_name text
)
language sql
stable
set search_path = batchlabel, public
as $$
  select p.id, p.name, p.sku, s.name
    from batchlabel.products p
    join batchlabel.specifications s
      on s.id = p.specification_id and s.account_id = p.account_id
   where coalesce(btrim(p_material_ref), '') <> ''
     and p.archived_at is null
     and s.archived_at is null
     and p_material_ref in (
       select ref from batchlabel.specification_material_refs(s.id, p.packaging_id) as ref
     )
   order by p.name, p.id;
$$;

comment on function batchlabel.products_using_material(text) is
  'The caller''s live products whose composition or pack names this material, across all three composition shapes. Exists so the materials register can name them BEFORE the maker archives rather than after, and so that answer uses the same resolution rule as artefact_source_fingerprint instead of a second implementation in PostgREST filters. SECURITY INVOKER: it can only see the caller''s own products.';

revoke all     on function batchlabel.material_state_fingerprint(uuid, text)     from public;
revoke all     on function batchlabel.specification_material_refs(uuid, text)    from public;
revoke all     on function batchlabel.products_using_material(text)              from public;
grant  execute on function batchlabel.material_state_fingerprint(uuid, text)     to authenticated, service_role;
grant  execute on function batchlabel.specification_material_refs(uuid, text)    to authenticated, service_role;
grant  execute on function batchlabel.products_using_material(text)              to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. THE PIN TABLE SAYS WHAT IT IS, WHICH TODAY IS EMPTY.
--
-- Its old comment said currency depended on it ("the intended companion is a record_events
-- row of kind 'material.version_adopted'"). Nothing writes it, nothing reads it, and the
-- fingerprint no longer mentions it. A schema comment is documentation a future agent
-- trusts, and one that describes an unbuilt mechanism in the present tense is the same
-- defect class as a screen that does.
-- ---------------------------------------------------------------------------
comment on table batchlabel.specification_material_pins is
  'NOT WRITTEN BY ANYTHING TODAY, AND NOTHING DEPENDS ON IT. It was built to hold the exact material a composition was classified from, so that publishing a correction to the shipped catalogue could not move a classification under a product already built on it. No code in either repository inserts a row, the shipped catalogue is empty, and artefact_source_fingerprint no longer references it — currency is established by hashing the RESOLVED MATERIAL STATE instead (see batchlabel.material_state_fingerprint and 20260805120000, which says why a pin cannot detect the correction that matters: the maker''s own material is edited in place, so the pin tuple is identical either side of it). Kept because the question it answers — freezing a product on one immutable version of OUR data — is real the day the catalogue is seeded. Until then no screen may say a product is pinned to anything.';

-- ---------------------------------------------------------------------------
-- 6. THE PROBE. Everything below writes, and all of it is discarded.
--
-- Four claims, each executed rather than reasoned about, because every one of them is a
-- sentence a screen now renders:
--   1. correcting a material's hazard rows MOVES the fingerprint;
--   2. archiving a material does NOT move it, and the material still resolves;
--   3. an unset slot and an id that names nothing hash DIFFERENTLY;
--   4. a material inside specifications.data is covered, not just the three columns.
-- ---------------------------------------------------------------------------
do $$
declare
  v_account     uuid;
  v_material    uuid;
  v_second      uuid;
  v_spec        uuid;
  v_phased      uuid;
  v_product     uuid;
  v_phased_prod uuid;
  v_at_print    text;
  v_after_edit  text;
  v_after_arch  text;
  v_phase_a     text;
  v_phase_b     text;
  v_unset       text;
  v_missing     text;
  v_using       integer;
  v_ran         boolean := false;
  v_stale       integer;
  v_n           integer;
begin
  select a.id into v_account from public.accounts a where a.brand_slug = 'batchlabel' limit 1;

  begin
    if v_account is not null then
      v_ran := true;

      insert into batchlabel.materials (account_id, material_class, name, role, supplier)
      values (v_account, 'ingredient', '__probe_fig__', 'Fragrance oil', '__probe_supplier__')
      returning id into v_material;

      insert into batchlabel.material_hazards
        (account_id, material_id, code, statement, hazard_class, gcl, pictogram, signal)
      values (v_account, v_material, 'H317', 'May cause an allergic skin reaction.',
              'Skin Sens. 1', 1.0, 'GHS07', 'Warning');

      insert into batchlabel.materials (account_id, material_class, name, role)
      values (v_account, 'ingredient', '__probe_phase_item__', 'Emulsifier')
      returning id into v_second;

      insert into batchlabel.specifications (account_id, name, category_id, kind, fragrance_id, load)
      values (v_account, '__probe_spec__', 'home-fragrance', 'mixture', v_material::text, 8.5)
      returning id into v_spec;

      insert into batchlabel.products (account_id, specification_id, name)
      values (v_account, v_spec, '__probe_product__')
      returning id into v_product;

      -- 1. THE CORRECTION MOVES IT.
      select batchlabel.artefact_source_fingerprint(v_product) into v_at_print;
      delete from batchlabel.material_hazards where material_id = v_material;
      select batchlabel.artefact_source_fingerprint(v_product) into v_after_edit;

      -- 2. ARCHIVING DOES NOT.
      update batchlabel.materials set archived_at = now() where id = v_material;
      select batchlabel.artefact_source_fingerprint(v_product) into v_after_arch;

      -- 3. UNSET IS NOT THE SAME AS UNRESOLVED.
      select batchlabel.material_state_fingerprint(v_account, '')                into v_unset;
      select batchlabel.material_state_fingerprint(v_account, '__no_such_id__')  into v_missing;

      -- 4. A MATERIAL INSIDE specifications.data IS COVERED.
      insert into batchlabel.specifications (account_id, name, category_id, kind, data)
      values (v_account, '__probe_phased__', 'cosmetics', 'phased',
              jsonb_build_object('phases', jsonb_build_array(
                jsonb_build_object('name', 'A', 'items', jsonb_build_array(
                  jsonb_build_object('materialId', v_second::text, 'pct', 5))))))
      returning id into v_phased;

      insert into batchlabel.products (account_id, specification_id, name)
      values (v_account, v_phased, '__probe_phased_product__')
      returning id into v_phased_prod;

      select batchlabel.artefact_source_fingerprint(v_phased_prod) into v_phase_a;
      update batchlabel.materials set inci = '__probe_inci__' where id = v_second;
      select batchlabel.artefact_source_fingerprint(v_phased_prod) into v_phase_b;

      -- And the register can name who is using it, before anybody archives anything.
      select count(*) into v_using
        from batchlabel.products_using_material(v_material::text);
    end if;

    raise exception 'material_state_currency_probe_rollback' using errcode = '22023';
  exception when others then
    if sqlerrm <> 'material_state_currency_probe_rollback' then
      raise;
    end if;
  end;

  if v_ran then
    if v_after_edit is null or v_at_print is null then
      raise exception
        'material_state_currency: the fingerprint returned NULL for a live product. Without it, "Current" and "Out of date" have no source at all.'
        using errcode = '22023';
    end if;

    if v_after_edit = v_at_print then
      raise exception
        'material_state_currency: removing H317 from the fragrance oil did not move the fingerprint. The label preview loses the hazard statement immediately and the screen would still say "v1 still matches this composition". This is the defect the file exists to fix and it is not fixed.'
        using errcode = '22023';
    end if;

    if v_after_arch <> v_after_edit then
      raise exception
        'material_state_currency: archiving the material moved the fingerprint. Archiving changes nothing that prints, so every recorded print would be marked "no longer matches" over a label that matches — the same false sentence pointing the other way.'
        using errcode = '22023';
    end if;

    if v_unset = v_missing then
      raise exception
        'material_state_currency: an empty slot and an id naming nothing hash the same. A composition that LOST its fragrance oil would then look identical to one that never had one.'
        using errcode = '22023';
    end if;

    if v_phase_b = v_phase_a then
      raise exception
        'material_state_currency: editing a material named inside specifications.data did not move the fingerprint. Phased formulas and bills of materials keep their materials there, so two of the three composition shapes would be uncovered.'
        using errcode = '22023';
    end if;

    if v_using <> 1 then
      raise exception
        'material_state_currency: products_using_material found % live product(s) using the probe material rather than 1. The archive confirmation names products off this, and naming none of them is how a maker archives something under a live label.', v_using
        using errcode = '22023';
    end if;

    select count(*) into v_n from batchlabel.materials where name = '__probe_fig__';
    if v_n <> 0 then
      raise exception 'material_state_currency: the probe left % material(s) behind.', v_n
        using errcode = '22023';
    end if;
    select count(*) into v_n from batchlabel.products where name like '\_\_probe\_%';
    if v_n <> 0 then
      raise exception 'material_state_currency: the probe left % product(s) behind.', v_n
        using errcode = '22023';
    end if;
  else
    raise notice 'material_state_currency: no batchlabel account exists yet, so the probe did not run.';
  end if;

  -- --- WHAT THIS COSTS, COUNTED RATHER THAN DESCRIBED -----------------------------
  select count(*) into v_stale from batchlabel.artefacts where specification_hash is not null;
  if v_stale > 0 then
    raise notice 'material_state_currency: % recorded print(s) carry a hash computed by the OLD fingerprint and will now read "no longer matches this product". That is correct: nothing had ever checked them against the materials they were derived from, so "current" was never established for any of them. Re-record a print to clear it.', v_stale;
  end if;

  raise notice 'material_state_currency: currency now covers the state of every material a composition and pack name, resolved the way the derivation resolves them, across all three composition shapes; archiving resolves and does not mark anything out of date; the empty pin table no longer implies otherwise. Every probe row was rolled back.';
end
$$;
