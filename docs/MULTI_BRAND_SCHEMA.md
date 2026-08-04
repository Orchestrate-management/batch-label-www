# The multi-brand schema contract

One Supabase project holds **every Orchestrate brand**. One login, one identity, one
billing pipeline — and hard separation between each brand's own data.

This is the document for somebody adding brand #2 who has never read the migrations.
It says what is shared, what is yours, what you must create, and which four invariants
you must not break. Everything here is enforced by the database and proved by an
exploit script, not by convention; where something is *not* enforced it says so.

---

## The one-paragraph version

Identity, consent and billing are **shared** and live in `public`. Every brand's own
domain data lives in **its own schema**, keyed on `account_id`, and is pinned to that
brand by a foreign key so that no other brand's account can ever hold a row in it.
Batchlabel is the worked example: its schema is `batchlabel`.

---

## What is shared — `public`

Do not fork any of these. A second copy of identity is a second place a person can be
suspended, and the two will disagree.

| Object | What it is | May brand #2 write to it? |
| --- | --- | --- |
| `auth.users` | Supabase-managed credentials. The login. | No — Supabase owns it |
| `public.profiles` | One row per user. Global, brand-agnostic. | No — provisioning only |
| `public.brands` | The brand dimension. `slug` is the key everything filters on. | **Yes — insert your slug** |
| `public.brand_memberships` | One row per `(user, brand)`. Plan, Stripe ids, consents, allowances. | Only via `apply_stripe_entitlement` |
| `public.consent_events` | Append-only GDPR audit trail. | No — provisioning only |
| `public.stripe_webhook_events` | The exactly-once ledger. Service role only. | No |
| `public.accounts` | The business. Carries `brand_slug`. One per `(owner, brand)`. | No — `ensure_account` only |
| `public.account_members` | Who may act inside an account. | No — `ensure_account` only |
| `public.entitlements` (view) | The read surface. `security_invoker`. | Read only |

**A person may hold an account on Batchlabel and a separate account on your brand.**
That is by design — `accounts` is unique on `(owner_user_id, brand_slug)`, not on
`owner_user_id`. Those are two accounts and they must not see each other's data.

### Shared functions you get for free

| Function | Use it for |
| --- | --- |
| `public.is_member_of(account_id)` | **The RLS predicate for every one of your tables.** True only when the caller is an active member *and* the account's brand membership is active. |
| `public.current_account_id()` | The column default for your `account_id`. NULL when the caller has none or more than one — it will never guess. |
| `public.ensure_account(user, brand, name)` | Provisioning. Service role only. Already called by both signup paths. |
| `public.get_entitlement(brand)` | Plan, status, `active`, and the allowance, for the calling user. |

---

## What is per-brand — one schema each

```
public                     shared identity, consent, billing, accounts
batchlabel                 specifications, products        (maker labelling)
<your_brand>               your domain tables              (add this)
```

`public.products` and `public.specifications` **used to be in `public`** and were moved
to `batchlabel` on 2026-08-04, precisely so that your brand can have a table called
`products` meaning something else. Do not put a domain table in `public`. There is no
second chance at this: it is a migration while a table is empty and a data migration
with downtime once it holds customer rows.

### Why a schema rather than a `brand_` prefix

A prefix is a naming convention; a schema is a catalogue entry.

- **Default privileges are per-schema.** Supabase grants `EXECUTE` on every new function
  in `public` to `anon` and `authenticated` automatically. Three migrations in this repo
  exist partly to revoke that *by name*, because `revoke ... from public` does not remove
  it. A new schema does not inherit those grants, so an object you forget to lock down
  is private by default instead of exposed by default. **Do not add
  `alter default privileges in schema <yours> ... to anon, authenticated`.**
- **`revoke usage on schema <brand> from <role>` is one total statement.** There is no
  equivalent for a prefix.
- The blast radius is identical either way: the table's name changes for the client
  regardless, so the prefix saves nothing except the dashboard toggle below.

---

## What brand #2 must create

### 1. A brand row

```sql
insert into public.brands (slug, name, domain)
values ('yourbrand', 'Your Brand', 'yourbrand.example')
on conflict (slug) do nothing;
```

Nothing provisions a membership for a brand `public.brands` has never heard of —
`handle_new_user`, `complete_oauth_signup` and `apply_stripe_entitlement` all gate on it.

### 2. Your schema

```sql
create schema if not exists yourbrand;
grant usage on schema yourbrand to authenticated, service_role;
-- anon deliberately gets nothing.
```

### 3. Your tables — keyed on `account_id`, never on `user_id`

```sql
create table yourbrand.items (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null default public.current_account_id(),
  -- THE BRAND LOCK. Not optional. See "Invariant 1" below.
  brand_slug  text not null default 'yourbrand',
  ...,
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint items_brand_check check (brand_slug = 'yourbrand'),
  foreign key (account_id, brand_slug)
    references public.accounts (id, brand_slug) on delete cascade
);
```

`public.accounts (id, brand_slug)` is covered by `accounts_id_brand_uidx`, which exists
solely to be the target of these foreign keys. **Do not drop that index.**

### 4. RLS, on every table, with the shared predicate

```sql
alter table yourbrand.items enable row level security;

create policy "items are readable by account members"
  on yourbrand.items for select using (public.is_member_of(account_id));
create policy "items are insertable by account members"
  on yourbrand.items for insert with check (public.is_member_of(account_id));
-- UPDATE needs BOTH: `using` decides which rows may be updated, `with check` decides
-- what they may become. Without the second, a member can move a row into an account
-- they do not belong to.
create policy "items are updatable by account members"
  on yourbrand.items for update
  using (public.is_member_of(account_id)) with check (public.is_member_of(account_id));

revoke all on yourbrand.items from anon, authenticated;
grant select, insert, update on yourbrand.items to authenticated;
grant all on yourbrand.items to service_role;
```

### 5. `updated_at` and `created_by`

`public.set_updated_at()` is shared — attach it. `created_by` must be pinned by a
trigger, not trusted from the client: the `INSERT` grant is table-wide and covers that
column, so without a pin a caller can file their work under a colleague. Copy the
`pin_created_by()` pattern from `20260803120000_account_data_schema.sql` section 7b.

### 6. Two things outside SQL

1. **Expose the schema.** Supabase dashboard → Project Settings → API → *Exposed
   schemas*. Until then every PostgREST request to your tables 404s.
2. **Point the client at it.** `client.schema('yourbrand').from('items')`. Do **not**
   set `db: { schema: ... }` on the client — the same client reads `public.entitlements`
   and calls `public.get_entitlement`, and a client-wide override breaks both.

Order that does not break a live app: expose the schema → apply the migration → deploy
the client.

---

## The four invariants you must not break

### 1. A brand's rows belong to that brand's accounts — enforced by a foreign key

`(account_id, brand_slug) → public.accounts (id, brand_slug)`, with `brand_slug` pinned
by a `CHECK`.

**This is the only thing that makes brand isolation a rule rather than a coincidence.**
Before it existed, an exploit proved that a sibling brand's user could write into
Batchlabel's `products` table using their *own* account id: `is_member_of(account_id)`
was true, because it was genuinely their account, and RLS has never had any notion of a
brand. Account isolation held perfectly; brand isolation was an emergent side effect of
nobody being a member of two brands' accounts at once — and `public.account_members` is
built for the invite flow that makes that false.

A foreign key was chosen over the alternatives on purpose:

| Mechanism | Why not |
| --- | --- |
| RLS policy | Bypassed by `service_role`, so any server-side script could still write across |
| Trigger | Can be disabled; skipped by some `COPY` paths |
| `CHECK` constraint | Cannot see another table, so it cannot ask what brand an account is |
| **Foreign key** | Checked for every writer including the owner and the service role |

### 2. Everything keys on `account_id`, and nothing keys on `user_id`

Seats are deferred, not cancelled. A table keyed on `user_id` means backfilling
`account_id` onto live customer data later while every policy, query and insert path
changes underneath it. Keyed on `account_id` from the first row, seats are an invite
flow plus a count.

### 3. Allowances are typed, `NOT NULL`, and default to the *smallest* value

`brand_memberships.sku_limit` and `.editor_seat_limit` are `integer not null` with
fail-closed defaults, and **unlimited is `2147483647`** — not `NULL` and not `-1`.

If your brand needs its own meter, **add another typed column with the same three
properties.** Do not put allowances in a jsonb document. That was proposed and rejected
after being built and measured:

- `allowances->>'skus'` on an absent key is `NULL`; no `NOT NULL` constraint reaches
  inside a jsonb. `count >= NULL` is `NULL`, which is not `TRUE`, which **allows the
  insert** — failing open at the point that knows least.
- A column default cannot fill a key inside a document, so a row created by a forgotten
  path gets `{}` and therefore the *most* allowance rather than the least.
- `CHECK (sku_limit >= 0)` and `CHECK (editor_seat_limit >= 1)` cannot be expressed over
  optional, untyped keys. A string where an integer was expected raises at cast time,
  inside the trigger, on the customer's insert.
- The sentinel stops being an ordinary integer and needs a special case again — which is
  exactly what choosing `2147483647` over `NULL`/`-1` was meant to remove.

`sku_limit` keeps its Batchlabel-flavoured name deliberately: renaming it touches ~200
references across two repositories including the live Stripe webhook, and once
`products` lives in `batchlabel` and invariant 1 pins its rows, the column is
unambiguously *Batchlabel's* meter sitting beside a `brand_slug` that says so.

### 4. `WHETHER` and `HOW MUCH` are two different questions

`entitlement_is_active()` answers *may this person use the product at all* and **takes no
quantity — ever**. The allowance columns answer *how many things may they have*.
Conflating them means a maker one SKU over their limit loses the ability to reprint a
label for stock already on a shelf, which is exactly when a recall happens.

Related, and equally load-bearing: `is_member_of` consults **status only**. Not `plan`,
not `plan_status`, not `current_period_end`. A free, lapsed, past_due, cancelled or
downgraded customer keeps full read and write access to what they already have.

---

## What is *not* enforced, and is the client's job

Stated plainly because the policies read like they cover it and they do not.

**RLS keeps other people out. It does not choose between two accounts one person belongs
to.** For a caller with an account on Batchlabel and another on your brand, an unfiltered
`select` returns the union of both — and after the brand lock, the union of whatever they
hold in *each* schema. So:

- **Reads must be filtered by `account_id`**, using the id read from `entitlements` for
  *your* brand.
- **A null `account_id` means "do not read" — never "read without a filter".** Dropping
  the predicate does not narrow the query to nothing; it widens it to everything.
- **Select `account_id` back.** A client whose row shape cannot say which account a row
  came from cannot detect a mis-scoped read even in principle.

`entitlements.account_id` comes back NULL in three unrelated situations — signup
unfinished, an account somebody else owns, or a suspended/departed membership — and
`membership_status` on the same row tells them apart. Null means *unknown* and must fail
open; it never means "this user has no account".

---

## How any of this was established

Everything asserted above was run, not read. A PGlite harness replays every migration in
order and drives it through the same role and JWT claim PostgREST sets:

- `exploit-brand-isolation.mjs` — two brands, three users. Every verb separately, every
  SECURITY DEFINER helper called with the other brand's ids, every view and RPC, a sweep
  of every relation in every schema for a leaked id, the anon key, and the
  trigger-before-RLS shape that produced the SKU-meter leak. Runs identically before and
  after the namespacing migration; 53 checks each way.
- `prove-billing-and-allowances.mjs` — all six `apply_stripe_entitlement` outcomes
  through the same sixteen named arguments the webhook sends, the rebuilt read surface
  column by column, the three allowance invariants on the real columns, and the same
  three destroyed on purpose in a jsonb replica. 57 checks.

**These scripts are not in this repository.** They live in a scratchpad and will
evaporate. Committing a SQL test harness is the outstanding follow-up — four migrations
now open by noting that the repository has none, and each works around it by asserting
its own behaviour in a `DO` block at apply time. That is a good pattern and it is not a
substitute for a harness that can run two users at once.

---

## Reading order for the migrations

| File | What it establishes |
| --- | --- |
| `20260729120000_init_orchestrate_identity.sql` | brands, profiles, brand_memberships; the shared-identity design rule |
| `20260730120000_add_signup_consents.sql` | consent columns + the append-only audit trail |
| `20260731120000_google_oauth_provisioning.sql` | `complete_oauth_signup` — OAuth cannot carry signup context |
| `20260801120000_entitlements.sql` | the Stripe write path, exactly-once, two clocks; `security_invoker` views |
| `20260802120000_plan_limits.sql` | the allowance columns, the unlimited sentinel, the entitling allow-list |
| `20260803120000_account_data_schema.sql` | accounts, account_members, the domain tables, `is_member_of`, the SKU meter |
| `20260804120000_brand_namespacing.sql` | the `batchlabel` schema and the brand lock |

Their headers are the real interface documents and are deliberately long. Several record
production incidents; read the comment before changing the line.
