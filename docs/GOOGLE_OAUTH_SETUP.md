# Continue with Google — setup

Almost everything in this file is a console click, not code. Do these in order:

1. [Google Cloud Console](#1-google-cloud-console) — make the OAuth client
2. [Supabase](#2-supabase) — switch the provider on
3. [Apply the migration](#3-apply-the-migration) — the database function the app calls
4. **Show the button** — set `VITE_GOOGLE_AUTH_ENABLED=true` and redeploy
5. [Test it](#4-test-it) — and check what landed in the tables

**The Google button is hidden until step 4.** It is gated on `VITE_GOOGLE_AUTH_ENABLED`,
which is off unless the value is exactly `true`, so merging this branch cannot put a
"Continue with Google" button in front of a maker before the provider exists to serve it.
Turn it on only once steps 1–3 are done:

```bash
cd ~/Documents/Orchestrate/batch-label
for ENV in production preview development; do
  printf 'true' | vercel env add VITE_GOOGLE_AUTH_ENABLED "$ENV"
done
vercel --prod   # Vite inlines env at build time, so a redeploy is required
```

Real values for this project, used throughout:

| Thing | Value |
| --- | --- |
| Supabase project ref | `cqzrwfresuiktgzhkhok` |
| Supabase URL | `https://cqzrwfresuiktgzhkhok.supabase.co` |
| **Authorised redirect URI** | `https://cqzrwfresuiktgzhkhok.supabase.co/auth/v1/callback` |
| Production site | `https://www.batchlabel.xyz` |
| Local dev | `http://localhost:5173` |

The redirect URI goes to **Supabase**, not to batchlabel.xyz. Google hands the code to
Supabase, Supabase makes the session and then sends the browser on to
`https://www.batchlabel.xyz/finish-setup`. Getting this wrong is the single most common
failure, so copy that row exactly — no trailing slash, no `www`, all lower case.

---

## 1. Google Cloud Console

Go to <https://console.cloud.google.com/>.

Google renamed these screens in 2025. The old path was **APIs & Services → OAuth consent
screen**; it now redirects to **Google Auth Platform**, where the same settings are split
across **Branding**, **Audience**, **Clients** and **Data access**. Both namings are given
below.

### 1a. Pick or create a project

Top bar, project dropdown → **New project** if there is nothing suitable.

- **Project name**: `Batchlabel` (only ever seen by you in this console)
- **Organisation / Location**: whatever your account offers; `No organisation` is fine

Wait for the notification that the project is created, then make sure it is the one
selected in the top bar. Everything below applies to the selected project.

### 1b. Configure the consent screen

**APIs & Services → OAuth consent screen** (new: **Google Auth Platform → Get started**).

- **User Type / Audience**: **External**.
  Internal only exists if you have Google Workspace, and it would restrict sign-in to your
  own company's accounts, which is the opposite of what we want.
- **App name**: `Batchlabel`. This is the name makers see: *"Batchlabel wants access to
  your Google Account"*. It must not impersonate anything else.
- **User support email**: `hello@batchlabel.co.uk` (or your own address from the dropdown).
- **App logo**: optional. Uploading one triggers a brand-verification review; skip it for
  now, the button works without.
- **App domain** (new: **Branding**):
  - Application home page: `https://www.batchlabel.xyz`
  - Privacy policy link: `https://www.batchlabel.xyz/privacy`
  - Terms of service link: `https://www.batchlabel.xyz/terms`
- **Authorised domains**: add both
  - `batchlabel.xyz`
  - `supabase.co`

  Google requires the top private domain of every URL you referenced, and the redirect URI
  lives on `supabase.co`. Enter the bare domains, no `https://` and no `www`.
- **Developer contact information**: your email. Google uses it for policy notices.

Save and continue.

### 1c. Scopes

**Data access** (old: step 2 of the consent screen) → **Add or remove scopes**. Tick
exactly these three, nothing else:

| Scope | Why |
| --- | --- |
| `openid` | Identifies the Google account |
| `.../auth/userinfo.email` | The email address — the account key on our side |
| `.../auth/userinfo.profile` | Name and avatar, used for `profiles.full_name` |

All three are **non-sensitive**. That matters: an app that asks for only non-sensitive
scopes does not have to go through Google's verification review, so you can publish
straight away. Adding anything else later (Gmail, Drive, Calendar) puts the app into a
review that takes weeks. Do not add scopes speculatively.

Save and continue.

### 1d. Publishing status — do not skip this

**Audience** (old: **OAuth consent screen → Publishing status**).

A new app starts in **Testing**. In Testing:

- only Google accounts you have explicitly added under **Test users** can sign in;
- everyone else gets *"Access blocked: Batchlabel has not completed the Google
  verification process"* (`error=access_denied`);
- the cap is 100 test users;
- refresh tokens expire after 7 days.

So: either add your own Google account under **Test users** and keep it in Testing while
you try it out, **or** press **Publish app** → **Confirm** to move it to **In production**.
With only the three non-sensitive scopes above, publishing is immediate — there is no
review queue to wait in and no verification form.

**Before real makers can sign up, the status must read "In production".** A launched
signup button on an app still in Testing fails for every single visitor.

### 1e. Create the OAuth client

**APIs & Services → Credentials** (new: **Google Auth Platform → Clients**) → **Create
credentials → OAuth client ID**.

- **Application type**: **Web application**. Not "Desktop", not "Android" — those have no
  client secret and Supabase needs one.
- **Name**: `Batchlabel web (Supabase)`. Internal label only.
- **Authorised JavaScript origins** — add:
  - `https://www.batchlabel.xyz`
  - `https://batchlabel.xyz`
  - `http://localhost:5173`

  These are not strictly required for the flow we use (the browser is redirected to
  Google, it does not call Google from our page), but they cost nothing and are needed if
  Google One Tap is ever added.
- **Authorised redirect URIs** — add exactly one:

  ```
  https://cqzrwfresuiktgzhkhok.supabase.co/auth/v1/callback
  ```

  Do **not** add `https://www.batchlabel.xyz/finish-setup` here. That URL never talks to
  Google.

Press **Create**.

### 1f. Copy the Client ID and Client Secret

A panel appears with **Client ID** (ends `.apps.googleusercontent.com`) and **Client
secret** (starts `GOCSPX-`).

**Copy the secret now.** Google stopped showing full client secrets after creation — if
you close the panel without copying it, you cannot read it again and will have to add a
new secret from the client's detail page. There is also a **Download JSON** button on the
panel; downloading it is the safest option.

The secret is a credential. Put it in your password manager. Do not paste it into the
repo, an issue, or a chat message.

Changes to a Google OAuth client can take a few minutes, and occasionally a few hours, to
propagate. If step 4 fails immediately after this step, wait and retry before changing
anything.

---

## 2. Supabase

Dashboard: <https://supabase.com/dashboard/project/cqzrwfresuiktgzhkhok>

### 2a. Enable the provider

**Authentication → Sign In / Providers → Google**

1. Toggle **Enable Sign in with Google** on.
2. **Client IDs**: paste the Client ID from 1f.
3. **Client Secret (for OAuth)**: paste the secret from 1f.
4. Leave **Skip nonce checks** OFF. It is only for Google One Tap on iOS and turning it
   off is the safer setting.
5. **Save**.

The panel shows a **Callback URL (for OAuth)** near the bottom. Confirm it reads
`https://cqzrwfresuiktgzhkhok.supabase.co/auth/v1/callback` — character for character the
value you put into Google in 1e.

### 2b. Check the URL configuration

**Authentication → URL Configuration**

- **Site URL**: `https://www.batchlabel.xyz`
- **Redirect URLs** must include:
  - `https://www.batchlabel.xyz/**` (already there)
  - `http://localhost:5173/**` — add this if you want Google sign-in to work in local dev

The app asks Supabase to return the browser to `<origin>/finish-setup`, which the
wildcard covers. A redirect target that is not on this list is silently replaced with the
Site URL, which looks like "it signed me in but sent me to the home page".

`/finish-setup` is the return for **both** signup and login, because an OAuth redirect
cannot say which button was pressed. That one screen reads the membership and then either
asks for the terms (new user) or hands the maker straight to app.batchlabel.xyz
(returning user, no click). It used to return to `/dashboard`, a page on the marketing
site that no longer exists — see `src/lib/auth.tsx`.

Note the apex domain: `batchlabel.xyz` 308-redirects to `www`, so the app origin is always
`https://www.batchlabel.xyz` and the `www` form is the one that matters here.

---

## 3. Apply the migration

The Google button calls a database function, `complete_oauth_signup`, that does not exist
until this migration runs. Signing in will work without it; **finishing setup will not**.

**With the CLI** (from the repo root):

```bash
supabase link --project-ref cqzrwfresuiktgzhkhok   # once
supabase migration list                            # see local vs remote
supabase db push
```

**Or from the dashboard**: **SQL Editor → New query**, paste the whole contents of
`supabase/migrations/20260731120000_google_oauth_provisioning.sql`, **Run**. It is
idempotent (`create or replace` throughout), so running it twice is harmless.

Check it landed:

```sql
select proname, prosecdef
from pg_proc
where proname in ('complete_oauth_signup', 'consent_snapshot_for');
```

Two rows. `complete_oauth_signup` must show `prosecdef = true` (security definer) — that
is what lets it write the membership that browsers are not allowed to write directly.

### What the migration is for

Email signup carries the brand, business name, attribution and consents inside
`auth.signUp`, and a trigger turns that into a `brand_memberships` row plus the
`consent_events` audit trail. **An OAuth signup cannot carry any of that** — Google fills
`raw_user_meta_data` with its own profile and nothing else, so the trigger creates the
profile and skips the membership.

Left alone, that would mean a Google user with no membership (broken account area) and,
worse, **no Terms of Service acceptance on file**. So the app detects the missing
membership after the redirect, sends the user to `/finish-setup` to give a shop name and
accept the terms, and `complete_oauth_signup` writes the membership and the consent
records in one transaction. No terms, no account — the function raises rather than
provisioning.

---

## 4. Test it

Use a Google account that has **never** signed into Batchlabel. If the app is still in
Testing, it must be on the Test users list.

1. Go to <https://www.batchlabel.xyz/sign-up>.
2. Press **Continue with Google**. The Google account chooser appears.
3. Pick the account and approve.
4. You should land on **`/finish-setup`**. This is correct — it is where the terms are
   collected, and it is where every Google return lands.
5. Try pressing **Finish and start my label** with the terms box unticked. It must refuse.
6. Tick the terms, enter a shop name, submit. You should land in the **product**, on
   app.batchlabel.xyz, already signed in. Not on a page of the marketing site.
7. In the app, open **Settings -> Account**. The marketing email box must load (not "we
   could not read your preferences"), and the advertising row must show On or Off with a
   link to cookie settings. That is the membership row being read back.

### What should be in the database

Run these in the SQL editor, substituting the address you used.

```sql
-- 1. The auth user, with Google as the identity provider.
select id, email, raw_app_meta_data ->> 'provider' as provider, raw_user_meta_data ->> 'full_name'
from auth.users where email = 'you@example.com';
```
Expect one row, `provider` = `google`, and a full name taken from the Google profile.

```sql
-- 2. The global profile (created by the existing trigger, not by the new function).
select id, email, full_name from public.profiles where email = 'you@example.com';
```

```sql
-- 3. The membership. This is the row that did NOT exist before this change.
select brand_slug, business_name, signup_source, data ->> 'signup_method' as method,
       marketing_email_opt_in, advertising_opt_in,
       attribution, jsonb_pretty(consents) as consents
from public.brand_memberships m
join auth.users u on u.id = m.user_id
where u.email = 'you@example.com';
```
Expect:
- `brand_slug` = `batchlabel`
- `business_name` = whatever you typed on `/finish-setup`
- `signup_source` = `web`, `method` = `oauth`
- `marketing_email_opt_in` matching the box you ticked, and `advertising_opt_in`
  matching your cookie banner choice
- `attribution` carrying the first-touch record. **It should survive the Google round
  trip** — attribution lives in localStorage and a first-party cookie, so it is still
  there when the browser comes back. To prove it, start the whole test from
  `https://www.batchlabel.xyz/?utm_source=test&utm_medium=manual` and check
  `utm_source` shows up here. **Use a fresh incognito window**, or clear the
  `bl_attribution` localStorage key and the `bl_attr` cookie first: attribution is
  deliberately first-touch and is never overwritten, so on a browser that has already
  visited the site you will correctly see the original record instead of `test` — that is
  the feature working, not a failure.
- `consents` with three entries. `terms` must have `"accepted": true` and an
  `accepted_at` timestamp, plus the `version` (`2026-07-30.2`) and the `url` of the terms
  page that was on screen. A declined optional consent has `"accepted": false` and
  `"accepted_at": null`.
- `advertising` reflecting your **cookie banner** choice, not a box on `/finish-setup` —
  there is no advertising box there. Accept marketing cookies before starting and it is
  `true`; reject them, or never answer the banner, and it is `false`. See
  [`CONSENT.md`](CONSENT.md).

```sql
-- 4. The audit trail.
select consent_id, version, accepted, source, occurred_at
from public.consent_events e
join auth.users u on u.id = e.user_id
where u.email = 'you@example.com'
order by occurred_at;
```
Expect exactly **three** rows — `terms_of_service`, `marketing_emails`, `advertising` —
all with `source = 'oauth_signup'` and a server timestamp. Three, not six.

### What logging back in must NOT do

Log out, then press **Continue with Google** again with the same account.

- You should go **straight into the app** at app.batchlabel.xyz, with no click. You will
  pass through `/finish-setup`, which is where Google returns everybody, but it must not
  show you the form: it reads the membership, finds one, and hands over. If you see the
  consent form again, or you come to rest anywhere on www, that is the bug.
- Re-run query 4. Still three rows. Signing in is not a new consent decision, and
  `complete_oauth_signup` writes nothing when a membership already exists.
- Re-run query 3. Still one membership, `business_name` unchanged.

Changing the marketing email box in the app's **Settings -> Account** *does* add a row to
`consent_events`, with `source = 'account_settings'`. So does changing the marketing
cookie toggle, which is where advertising is changed. That is the intended difference:
every real decision is logged once, and a login is not a decision.

---

## 5. Troubleshooting

**`Error 400: redirect_uri_mismatch`**
The URI in the Google client does not match what Supabase sent. It must be exactly
`https://cqzrwfresuiktgzhkhok.supabase.co/auth/v1/callback`. Check for a trailing slash,
`http` instead of `https`, a typo in the project ref, or the URI having been pasted into
**Authorised JavaScript origins** instead of **Authorised redirect URIs**. Also check the
top bar of the console is on the same Google Cloud project as the client you edited.
Changes can take a few minutes to take effect.

**`Unsupported provider: provider is not enabled`**
Supabase side. The Google toggle in **Authentication → Sign In / Providers** is off, or
was saved without a Client ID or Secret. Re-open it and check both fields are populated,
then Save again.

**`Access blocked: Batchlabel has not completed the Google verification process`**
The consent screen is still in **Testing** and the account trying to sign in is not on the
**Test users** list. Either add that address, or publish the app (§1d). This is the one
that will silently break launch: it works for you, because you are a test user, and fails
for every maker.

**Signed in, but landed on the home page instead of the product**
The redirect target was not on the Supabase allow-list, so Supabase fell back to the Site
URL. Add `https://www.batchlabel.xyz/**` (§2b).

**Stuck on `/finish-setup`, or it says it could not finish**
The migration has not been applied. Run §3 and check the two functions exist. Until then
the button has nothing to call.

**Local dev does nothing**
Two things are needed: `http://localhost:5173` in the Google client's **Authorised
JavaScript origins**, and `http://localhost:5173/**` in Supabase's **Redirect URLs**. The
Google *redirect URI* stays the Supabase one — it never changes per environment.

**`invalid_client` / `unauthorized_client`**
The Client Secret is wrong or was rotated in Google without being updated in Supabase.
Since Google no longer shows existing secrets, add a new secret on the client's detail
page and paste that into Supabase.

### Account linking — the intended behaviour

**Decision: linking is what we want.** One person, one Orchestrate identity, however they
choose to sign in. That is the whole premise of the shared identity pool, and it is what
lets a maker who signed up by email later press **Continue with Google** without losing
anything.

Someone already has a Batchlabel account with `maker@example.com` and a password. They
later press **Continue with Google** with that same address. Google reports the email as
verified (it always does for a Google account), and their Batchlabel email is confirmed —
so Google is attached as a **second identity on the same user id**. They keep their
membership, plan and labels. They are **not** shown `/finish-setup` and **not** asked to
re-accept the terms, because their acceptance is already on file. That skip is what the
idempotency in `complete_oauth_signup` exists to guarantee.

This works by default. Nothing needs switching on for it.

#### What cannot happen, and what to actually test

An earlier draft of this file said an unconfirmed account would get "a second, separate
user with the same email". **That is wrong and worth correcting**, because it sends you
looking for the wrong thing: `auth.users` has a unique index on `email` for non-SSO users,
so two rows with one address is not a state the database will hold. Counting users will
therefore always look fine, whatever happens.

The case genuinely worth testing is a **pre-existing email/password account whose email
was never confirmed**. A verified Google sign-in on that address is the riskier path: it
can attach to the existing unconfirmed user and, depending on the GoTrue version, drop
that user's other unconfirmed identities.

Because your project has `mailer_autoconfirm` off, every real email/password user has had
to confirm before their account worked — so the risky population is people who started a
signup and never clicked the email. Size it with:

```sql
select id, email, created_at
from auth.users
where email_confirmed_at is null;
```

If that returns nothing, there is nobody in the risky state and linking is simply the
happy path.

**Test before launch** with a throwaway address — count *identities*, not users:

```sql
-- After: sign up by email, confirm, log out, then Continue with Google on same address.
select u.email,
       count(i.*) as identity_count,
       array_agg(i.provider order by i.provider) as providers
from auth.users u
join auth.identities i on i.user_id = u.id
where u.email = 'your-test-address@example.com'
group by u.email;
```

Expect **one** user with **two** identities (`email`, `google`). That is linking working.
Then confirm they are handed to the app rather than shown the `/finish-setup` form, and
that `brand_memberships` still holds their original row with its original consents.

#### Password-less Google users

Someone who only ever used Google has no password. "Forgotten your password?" is their
route to setting one if they later want to log in without Google — that works today (the
reset email lets them set a password), but the log-in page does not say so. Worth a line
of copy if it comes up in support.

---

## What the founder actually has to do, condensed

- [ ] Google Cloud Console: create project, configure consent screen (External, app name,
      support email, authorised domains `batchlabel.xyz` + `supabase.co`)
- [ ] Add scopes `openid`, `email`, `profile` — and nothing else
- [ ] **Publish the app** (or add test users and remember to publish before launch)
- [ ] Create a **Web application** OAuth client with redirect URI
      `https://cqzrwfresuiktgzhkhok.supabase.co/auth/v1/callback`
- [ ] Copy the Client ID and Secret **at creation time**
- [ ] Supabase → Authentication → Sign In / Providers → Google: enable, paste both, Save
- [ ] Supabase → Authentication → URL Configuration: confirm `https://www.batchlabel.xyz`
      and `https://www.batchlabel.xyz/**`
- [ ] Apply `supabase/migrations/20260731120000_google_oauth_provisioning.sql`
- [ ] Run the first-time signup test and the four queries in §4
- [ ] Decide the account-linking question above
