-- Orchestrate shared identity foundation.
--
-- One Supabase project is the single identity pool for ALL Orchestrate offerings.
-- Batchlabel (maker labelling) is the first sub-brand; others will follow. The design
-- goal is durability: a person is one Orchestrate identity, and every brand they touch
-- is recorded as an explicit membership that is fully filterable by brand.
--
-- Shape:
--   auth.users            (Supabase managed)  the credential / login
--   public.profiles       one row per user     global identity, brand agnostic
--   public.brands         dimension table      the sub-brands of Orchestrate
--   public.brand_memberships  join             which brands a user belongs to, with
--                                              per-brand billing, attribution and a
--                                              free-form `data` jsonb for whatever a
--                                              future offering needs to store.
--
-- Rule of thumb for adding fields later: if a value is common to most offerings, add a
-- typed column to brand_memberships; if it is specific to one offering, put it in the
-- `data` jsonb. This keeps common queries fast and typed while never blocking a new
-- value proposition on a schema migration.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Reusable helper: keep updated_at honest.
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- brands: the sub-brand dimension. Slug is the stable, human-readable key that
-- the front-end and analytics filter on (e.g. 'batchlabel').
-- ---------------------------------------------------------------------------
create table if not exists public.brands (
  slug        text primary key,
  name        text not null,
  domain      text,
  is_active   boolean not null default true,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

comment on table public.brands is 'Orchestrate sub-brands / offerings. Slug is the filter key.';

insert into public.brands (slug, name, domain)
values ('batchlabel', 'Batchlabel', 'batchlabel.co.uk')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user. Global Orchestrate identity, brand agnostic.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  attributes  jsonb not null default '{}'::jsonb,   -- flexible, brand-agnostic profile data
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'Global, brand-agnostic identity. One row per auth.users.';

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- brand_memberships: the join that makes identity multi-brand and filterable.
-- One row per (user, brand). Common columns are typed; anything brand-specific
-- lives in `data`.
-- ---------------------------------------------------------------------------
create table if not exists public.brand_memberships (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users (id) on delete cascade,
  brand_slug             text not null references public.brands (slug),

  role                   text not null default 'member',   -- member | admin | owner
  status                 text not null default 'active',   -- active | suspended | left

  business_name          text,                             -- common B2B field, per brand

  -- Billing (written server-side only, via the Stripe webhook using the service role).
  plan                   text not null default 'free',
  plan_status            text,                             -- mirrors Stripe subscription status
  stripe_customer_id     text,
  stripe_subscription_id text,

  -- Growth / marketing.
  signup_source          text,                             -- e.g. 'web'
  attribution            jsonb not null default '{}'::jsonb, -- first-touch capture at signup

  -- The flexibility knob: brand-specific fields that should not force a migration.
  data                   jsonb not null default '{}'::jsonb,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  unique (user_id, brand_slug)
);

comment on table public.brand_memberships is
  'Which Orchestrate brand(s) a user belongs to. Filter by brand_slug. Put brand-specific fields in data jsonb.';

create index if not exists brand_memberships_brand_idx     on public.brand_memberships (brand_slug);
create index if not exists brand_memberships_user_idx      on public.brand_memberships (user_id);
create index if not exists brand_memberships_plan_idx      on public.brand_memberships (brand_slug, plan);
create index if not exists brand_memberships_stripe_cus_idx on public.brand_memberships (stripe_customer_id);

drop trigger if exists brand_memberships_set_updated_at on public.brand_memberships;
create trigger brand_memberships_set_updated_at
  before update on public.brand_memberships
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Provisioning trigger: when Supabase creates an auth user, mirror a profile
-- and (if the signup carried a brand) create the brand membership. Runs as
-- security definer so it can write despite RLS.
--
-- The front-end passes signup context through auth.signUp options.data, which
-- lands in auth.users.raw_user_meta_data:
--   { brand, business_name, full_name, attribution: { ...first touch... } }
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brand    text  := nullif(new.raw_user_meta_data ->> 'brand', '');
  v_business text  := nullif(new.raw_user_meta_data ->> 'business_name', '');
  v_full     text  := nullif(new.raw_user_meta_data ->> 'full_name', '');
  v_attr     jsonb := coalesce(new.raw_user_meta_data -> 'attribution', '{}'::jsonb);
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, v_full)
  on conflict (id) do nothing;

  -- Only create a membership for a brand we actually know about.
  if v_brand is not null and exists (select 1 from public.brands b where b.slug = v_brand) then
    insert into public.brand_memberships (user_id, brand_slug, business_name, attribution, signup_source)
    values (new.id, v_brand, v_business, v_attr, 'web')
    on conflict (user_id, brand_slug) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.email in sync if the user changes their login email.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set email = new.email, updated_at = now()
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_change on auth.users;
create trigger on_auth_user_email_change
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Row Level Security.
--   brands             : world-readable reference data.
--   profiles           : a user sees and edits only their own row.
--   brand_memberships  : a user sees only their own memberships. All writes are
--                        server-side (provisioning trigger + service-role webhook),
--                        so no user INSERT/UPDATE policy is granted. This stops a
--                        browser client from setting its own plan to a paid tier.
-- ---------------------------------------------------------------------------
alter table public.brands            enable row level security;
alter table public.profiles          enable row level security;
alter table public.brand_memberships enable row level security;

drop policy if exists "brands are readable" on public.brands;
create policy "brands are readable"
  on public.brands for select
  using (true);

drop policy if exists "own profile is readable" on public.profiles;
create policy "own profile is readable"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "own profile is updatable" on public.profiles;
create policy "own profile is updatable"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "own memberships are readable" on public.brand_memberships;
create policy "own memberships are readable"
  on public.brand_memberships for select
  using (auth.uid() = user_id);

-- Role grants (RLS still restricts which rows are visible).
grant select on public.brands to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.brand_memberships to authenticated;
