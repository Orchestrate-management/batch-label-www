-- Signup consent capture.
--
-- Consents collected at signup and recorded durably:
--   * Terms of Service acceptance          (mandatory, enforced in the UI)
--   * Marketing email opt-in                (optional)
--   * Advertising / retargeting opt-in      (optional) — use of email + account details
--                                           for ad audiences (Meta / Google).
--
-- Marketing email and advertising are SEPARATE consents so each can be given, proven and
-- withdrawn independently (GDPR granularity / "freely given").
--
-- Each consent is stored with the exact document snapshot the user saw (id, title,
-- version, url) plus a server-stamped acceptance time, so we can always prove which
-- version was accepted and when. Current state lives on brand_memberships (fast to read
-- and filter, e.g. building an ad audience); an append-only consent_events log keeps the
-- full history for audit (GDPR art. 7 accountability), including later re-consent or
-- withdrawal from the account area.

-- ---------------------------------------------------------------------------
-- Current-state columns on the membership.
-- ---------------------------------------------------------------------------
alter table public.brand_memberships
  add column if not exists marketing_email_opt_in boolean not null default false,
  add column if not exists advertising_opt_in     boolean not null default false,
  add column if not exists consents               jsonb   not null default '{}'::jsonb;

comment on column public.brand_memberships.marketing_email_opt_in is
  'Optional opt-in to marketing email.';
comment on column public.brand_memberships.advertising_opt_in is
  'Optional opt-in to use of email/account details for advertising and retargeting (Meta/Google).';
comment on column public.brand_memberships.consents is
  'Current-state snapshot of consents: {terms:{id,title,version,url,accepted,accepted_at}, marketing_email:{...}, advertising:{...}}.';

-- Filter indexes for building email / ad audiences per brand.
create index if not exists brand_memberships_mkt_email_idx
  on public.brand_memberships (brand_slug, marketing_email_opt_in);
create index if not exists brand_memberships_advertising_idx
  on public.brand_memberships (brand_slug, advertising_opt_in);

-- ---------------------------------------------------------------------------
-- Append-only audit trail of every consent decision (signup + later changes).
-- ---------------------------------------------------------------------------
create table if not exists public.consent_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  brand_slug   text references public.brands (slug),
  consent_id   text not null,          -- terms_of_service | marketing_emails | advertising
  title        text,
  version      text,
  url          text,
  accepted     boolean not null,
  source       text,                   -- signup | account_settings
  occurred_at  timestamptz not null default now()
);

comment on table public.consent_events is 'Immutable audit trail of consent decisions.';

create index if not exists consent_events_user_idx   on public.consent_events (user_id);
create index if not exists consent_events_lookup_idx on public.consent_events (consent_id, version);

alter table public.consent_events enable row level security;

-- A user can read their own consent history. There is deliberately no insert/update/
-- delete policy: rows are written server-side (the provisioning trigger and the
-- service-role consent endpoint) and never mutated, which is what makes the log
-- trustworthy as an audit trail.
drop policy if exists "own consent events are readable" on public.consent_events;
create policy "own consent events are readable"
  on public.consent_events for select
  using (auth.uid() = user_id);

grant select on public.consent_events to authenticated;

-- ---------------------------------------------------------------------------
-- Upgrade the provisioning trigger to record consents.
--
-- The browser sends, in auth.users.raw_user_meta_data:
--   consents: { terms:{id,title,version,url,accepted}, marketing_email:{...}, advertising:{...} }
--   marketing_email_opt_in: boolean
--   advertising_opt_in: boolean
-- We stamp accepted_at server-side (now()) on accepted consents only, mirror the
-- snapshot onto the membership, and append one immutable event per consent.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- set_consent: the single, atomic write path for changing a marketing consent
-- after signup (the account-area toggle).
--
-- Called directly from the browser via supabase.rpc('set_consent', ...). Identity comes
-- from auth.uid() (the caller's JWT), so a user can only ever change their OWN consent —
-- no service-role key is exposed to the client or the edge. SECURITY DEFINER lets it
-- write despite the browser having no RLS write path.
--
-- In ONE transaction it keeps all three representations in lockstep and appends the
-- immutable audit row, so state and audit can never diverge:
--   * the boolean flag (marketing_email_opt_in / advertising_opt_in)
--   * the current-state consents jsonb snapshot (accepted + accepted_at)
--   * a consent_events row (source = account_settings)
-- Terms are intentionally NOT changeable here (a contract, not a withdrawable consent).
-- ---------------------------------------------------------------------------
create or replace function public.set_consent(
  p_consent_id text,
  p_accepted   boolean,
  p_brand      text,
  p_title      text default null,
  p_version    text default null,
  p_url        text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid        := auth.uid();
  v_ts   timestamptz := now();
  v_key  text;
  v_at   jsonb       := case when p_accepted then to_jsonb(v_ts) else 'null'::jsonb end;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_accepted is null then
    raise exception 'accepted is required' using errcode = '22023';
  end if;

  -- Whitelist: map the consent id to its column + jsonb key. Unknown ids (and terms) reject.
  if p_consent_id = 'marketing_emails' then
    v_key := 'marketing_email';
    update public.brand_memberships
       set marketing_email_opt_in = p_accepted,
           consents = jsonb_set(
                        jsonb_set(consents, '{marketing_email,accepted}', to_jsonb(p_accepted), true),
                        '{marketing_email,accepted_at}', v_at, true),
           updated_at = v_ts
     where user_id = v_user and brand_slug = p_brand;
  elsif p_consent_id = 'advertising' then
    v_key := 'advertising';
    update public.brand_memberships
       set advertising_opt_in = p_accepted,
           consents = jsonb_set(
                        jsonb_set(consents, '{advertising,accepted}', to_jsonb(p_accepted), true),
                        '{advertising,accepted_at}', v_at, true),
           updated_at = v_ts
     where user_id = v_user and brand_slug = p_brand;
  else
    raise exception 'unknown or non-withdrawable consent: %', p_consent_id using errcode = '22023';
  end if;

  if not found then
    raise exception 'no membership for this brand' using errcode = 'P0002';
  end if;

  insert into public.consent_events (user_id, brand_slug, consent_id, title, version, url, accepted, source)
  values (v_user, p_brand, p_consent_id, p_title, p_version, p_url, p_accepted, 'account_settings');
end;
$$;

-- Only signed-in users may call it; the function itself constrains the effect to the caller.
revoke all on function public.set_consent(text, boolean, text, text, text, text) from public;
grant execute on function public.set_consent(text, boolean, text, text, text, text) to authenticated;
