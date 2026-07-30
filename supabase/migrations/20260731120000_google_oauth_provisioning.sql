-- Google OAuth provisioning: closing the consent and membership hole.
--
-- WHY THIS EXISTS
--
-- Email signup (password or magic link) carries its whole signup context in
-- auth.signUp options.data, which Supabase writes to auth.users.raw_user_meta_data:
--   { brand, business_name, attribution, consents, marketing_email_opt_in, advertising_opt_in }
-- The on_auth_user_created trigger (handle_new_user) reads that, creates the brand
-- membership and writes the consent_events audit rows. Everything downstream — the
-- account area, ad audiences, the GDPR art. 7 audit trail — depends on it.
--
-- An OAuth signup CANNOT carry that payload. supabase.auth.signInWithOAuth has no
-- options.data: raw_user_meta_data is populated by the provider with Google's profile
-- (iss, sub, name, full_name, email, email_verified, avatar_url, picture). There is no
-- brand, no business_name and no consents. So on a Google signup the trigger:
--   * still creates the public.profiles row (it does not depend on the brand), and
--   * SKIPS the membership entirely, because `v_brand is not null` is false.
--
-- Two consequences, both unacceptable:
--   1. No brand_memberships row. The user is signed in but belongs to no brand, so
--      fetchConsentPreferences() finds nothing and the dashboard is broken for them.
--   2. No Terms of Service acceptance is ever recorded. A person could hold an account
--      without having accepted the terms — a compliance hole that silently contradicts
--      the guarantees written into 20260730120000_add_signup_consents.sql.
--
-- HOW IT IS FIXED
--
-- The provider redirect cannot carry consent, so consent is collected AFTER it. The app
-- detects a signed-in user with no membership for this brand and routes them to a
-- "finish setting up your account" screen (/finish-setup) which collects the business
-- name and the three consent decisions, then calls complete_oauth_signup() below. The
-- membership and the Terms acceptance are written in the SAME transaction, so the
-- invariant an email signup gives us holds for an OAuth signup too:
--
--     a membership exists  =>  a versioned, server-timestamped Terms acceptance exists.
--
-- Nothing here changes the email signup path; handle_new_user is deliberately untouched.
-- It is also, deliberately, not Google-specific: any future OAuth provider (Apple,
-- Microsoft) gets the same treatment for free.
--
-- Note on profiles.full_name: no change is needed. Supabase normalises the Google
-- profile into raw_user_meta_data.full_name, which handle_new_user already reads.
--
-- Safe to re-run: create or replace + if not exists throughout.

-- ---------------------------------------------------------------------------
-- Helper: normalise one client-supplied document snapshot into the stored consent
-- shape. Only id/title/version/url are read from the caller; `accepted` comes from
-- the trusted boolean argument and `accepted_at` from the server clock. This is what
-- makes "the client cannot forge an acceptance" true at the level of the data, not
-- just at the level of the calling code.
--
-- STABLE, not IMMUTABLE: rendering a timestamptz to json depends on the TimeZone
-- setting, so the result is only guaranteed constant within a single statement.
-- ---------------------------------------------------------------------------
create or replace function public.consent_snapshot_for(
  p_doc           jsonb,
  p_default_id    text,
  p_default_title text,
  p_accepted      boolean,
  p_at            timestamptz
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id',          coalesce(nullif(p_doc ->> 'id', ''), p_default_id),
    'title',       coalesce(nullif(p_doc ->> 'title', ''), p_default_title),
    'version',     nullif(p_doc ->> 'version', ''),
    'url',         nullif(p_doc ->> 'url', ''),
    'accepted',    p_accepted,
    'accepted_at', case when p_accepted then to_jsonb(p_at) else 'null'::jsonb end
  );
$$;

comment on function public.consent_snapshot_for(jsonb, text, text, boolean, timestamptz) is
  'Builds one stored consent snapshot from a client document snapshot plus a server-trusted accepted flag and timestamp.';

-- Internal helper only: nothing outside a definer function should call it.
revoke all on function public.consent_snapshot_for(jsonb, text, text, boolean, timestamptz) from public;

-- ---------------------------------------------------------------------------
-- complete_oauth_signup: the single, atomic provisioning path for a user who
-- arrived through an OAuth provider.
--
-- Called from the browser via supabase.rpc('complete_oauth_signup', ...).
--
-- SECURITY MODEL (same shape as set_consent, for the same reasons):
--   * Identity is auth.uid(), taken from the caller's JWT. A caller therefore cannot
--     provision, or record consent for, anybody but themselves — the user id is never
--     a parameter. No service-role key is exposed to the browser or the edge.
--   * SECURITY DEFINER, because brand_memberships and consent_events grant no INSERT
--     to `authenticated` (all writes are server-side, which is what stops a browser
--     from awarding itself a paid plan or forging an audit row).
--   * search_path is pinned to public so the definer rights cannot be redirected at a
--     shadowed table.
--   * Terms are MANDATORY: the function raises if p_terms_accepted is not true, so
--     there is no code path that produces a membership without a Terms acceptance.
--     The UI blocks submission as well; this is the half that a hand-crafted request
--     cannot skip.
--   * The `accepted` flags and the acceptance TIMESTAMP are never taken from a
--     client-supplied blob. The caller sends only the DOCUMENT snapshots it rendered
--     (id, title, version, url) in p_agreements; the function builds the consents
--     jsonb itself from the explicit booleans plus now(). A client cannot smuggle in
--     accepted:true for a box the user left unticked, nor back-date an acceptance.
--     (Which document VERSION was on screen is still the client's report — same as
--     set_consent. It is a claim about the browser's own render; the parts that matter
--     for accountability, who and when, are server-derived.)
--   * Idempotent. Provisioning is keyed on (user_id, brand_slug); if the membership
--     already exists the function returns false and writes NOTHING — no duplicate
--     membership, and no duplicate consent_events. That matters for two real cases:
--       - a double submit or a refresh of the completion screen;
--       - an existing email/password user who later signs in with Google on the same
--         verified address. Supabase links that as a second identity on the SAME user,
--         so the membership is already there and they are neither re-asked for consent
--         nor recorded as having consented twice.
--     Later CHANGES to a marketing consent go through set_consent, which is the path
--     that appends an audit row — so the log still records every decision exactly once.
--
-- Returns true when it provisioned the membership, false when one already existed.
-- ---------------------------------------------------------------------------
create or replace function public.complete_oauth_signup(
  p_brand                  text,
  p_business_name          text    default null,
  p_terms_accepted         boolean default false,
  p_marketing_email_opt_in boolean default false,
  p_advertising_opt_in     boolean default false,
  -- Document snapshots only: {terms:{id,title,version,url}, marketing_email:{...}, advertising:{...}}.
  -- Any `accepted` / `accepted_at` keys sent here are ignored and overwritten.
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
  -- Keeping it here means the function is correct on its own terms rather than
  -- depending on trigger ordering.
  insert into public.profiles (id, email, full_name)
  values (v_user, v_email, v_full)
  on conflict (id) do nothing;

  -- Consents snapshot, built server-side. accepted_at is stamped only where the
  -- consent was accepted, so a declined consent never carries an acceptance time
  -- (mirrors handle_new_user).
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
  'Provisions the brand membership + consent audit trail for a user who signed up through an OAuth provider (no signup metadata reaches raw_user_meta_data). Identity from auth.uid(); Terms mandatory; timestamps server-stamped; idempotent per (user, brand).';

-- Only signed-in users may call it; the function itself constrains the effect to the caller.
revoke all on function public.complete_oauth_signup(text, text, boolean, boolean, boolean, jsonb, jsonb) from public;
grant execute on function public.complete_oauth_signup(text, text, boolean, boolean, boolean, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- The completion gate reads brand_memberships to decide whether a signed-in user
-- still needs the setup screen. The existing "own memberships are readable" policy
-- from 20260729120000 already permits exactly that (auth.uid() = user_id), so no new
-- policy is required — noted here so the dependency is not accidentally dropped.
-- ---------------------------------------------------------------------------
