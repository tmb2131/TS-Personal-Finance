# Scaling Findash to Multiple Users (Multi-Tenancy)

This doc describes how to scale the app from a single household (one Google Sheet, one allowlist) to many users, each with their own data and optional own Google Sheet.

---

## 1. Current State

- **Single tenant:** One `GOOGLE_SPREADSHEET_ID` in env; one sync for all data.
- **Auth:** Allowlist (`ALLOWED_EMAILS`); any authenticated user can access the app.
- **Data:** No `user_id` on any table; RLS policies use `USING (true)` for `authenticated`, so every logged-in user would see the same rows.
- **Sync:** Manual (`POST /api/sync`) and cron (`/api/cron/refresh`) both run one global sync and one global `sync_metadata` row (`id = 1`).

To support multiple users with **separate data**, you need tenant isolation by Supabase user id and per-user (or per-tenant) configuration for the sheet and sync.

---

## 2. Multi-Tenancy Model

**Idea:** Every row of user-specific data is tied to a **user id** (Supabase Auth `auth.uid()`). RLS ensures users only see and write their own rows. Each user has their own Google Sheet (or shared template); sync and metadata are per-user.

### 2.1 Add `user_id` to All Data Tables

Add a non-null column `user_id UUID REFERENCES auth.users(id)` (or `user_id UUID NOT NULL`) to every table that holds user-specific data:

- `account_balances`
- `transaction_log`
- `budget_targets`
- `historical_net_worth`
- `fx_rates` (or keep global and add a separate `user_fx_rates` if you want per-user overrides)
- `fx_rate_current`
- `annual_trends`
- `monthly_trends`
- `yoy_net_worth`
- `recurring_payments`
- `recurring_preferences`
- `kids_accounts`
- `investment_return`
- `budget_history`
- `sync_metadata`

**Design choice:**  
- **Option A – `fx_rates` / `fx_rate_current` global:** Keep one shared FX table; no `user_id`. All tenants use same rates. Simpler.  
- **Option B – Per-user FX:** Add `user_id` if you ever need user-specific rates.  

Recommendation: keep FX global (no `user_id`) unless you have a requirement for per-user rates.

### 2.2 User → Sheet Mapping: `user_profiles` (or `tenants`)

Add a table that stores, per user, the Google Sheet to sync and optional display name:

```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  google_spreadsheet_id TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Optional: RLS so users only read/update their own row
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_profile" ON user_profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
```

- **Manual sync:** Resolve `user_id` from session, read `google_spreadsheet_id` from `user_profiles`, run sync for that user and that sheet.
- **Cron:** Loop over rows in `user_profiles` where `google_spreadsheet_id IS NOT NULL`, and run sync for each `id` (and sheet).

Onboarding: after sign-up/sign-in, prompt user to “Connect your sheet” (paste spreadsheet ID, or later use Google OAuth to pick a sheet). Save to `user_profiles.google_spreadsheet_id`.

---

## 3. RLS: Restrict by `user_id`

Replace the current “any authenticated user sees everything” policy with “user sees only their rows.”

For every table that has `user_id`:

```sql
-- Example: account_balances
DROP POLICY IF EXISTS "authenticated_full_access" ON account_balances;
CREATE POLICY "user_own_data" ON account_balances
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

Repeat for all tables that now have `user_id`. Use a migration (e.g. `017_add_user_id_multi_tenant.sql`) to add the column, backfill if needed, then enable RLS with these policies.

**Important:**  
- Cron and server-side “sync” must run with a **service role** client (or a dedicated sync role) so they can write to any `user_id`. Do **not** use the end-user’s session for cron.  
- All app reads/writes that go through the user’s session will automatically be scoped by RLS to `auth.uid()`.

---

## 4. Sync: Per-User Spreadsheet and `user_id`

### 4.1 Signature Change for `syncGoogleSheet`

Today: `syncGoogleSheet(supabase?)` uses `process.env.GOOGLE_SPREADSHEET_ID`.  
Target: sheet and tenant come from arguments, not env.

- Add parameters, e.g. `syncGoogleSheet(supabase, options: { spreadsheetId: string, userId: string })`.
- Use `options.spreadsheetId` instead of `process.env.GOOGLE_SPREADSHEET_ID`.
- For every insert/upsert, set `user_id = options.userId` on each row (and pass `userId` into any helper that writes to DB).

### 4.2 Manual Sync (`POST /api/sync`)

1. Get `user` from `supabase.auth.getUser()` (already done).
2. Load `user_profiles` for `user.id`; if `google_spreadsheet_id` is null, return 400 with “Connect your sheet first.”
3. Call `syncGoogleSheet(supabase, { spreadsheetId, userId: user.id })` (use the **user-scoped** Supabase client so RLS applies on read; for writes you can use the same client and rely on `WITH CHECK (user_id = auth.uid())`, or use admin client and set `user_id` explicitly).
4. Call `snapshotBudgetHistory(date, supabase)` and `recordLastSync(supabase, user.id)` so history and “Last refresh” are per-user.

If you use the **server client** (user session) for sync, all writes must include `user_id: user.id` and RLS will allow them. If you use the **admin** client for sync, you must set `user_id` on every row and ensure the admin client is only used in sync/cron, not in normal request handlers.

### 4.3 Cron (`/api/cron/refresh`)

1. Verify `CRON_SECRET` (unchanged).
2. Use **admin** Supabase client.
3. Select from `user_profiles` where `google_spreadsheet_id IS NOT NULL`.
4. For each row: `syncGoogleSheet(admin, { spreadsheetId: row.google_spreadsheet_id, userId: row.id })`, then `snapshotBudgetHistory(today, admin)` for that user’s data (see below), then `recordLastSync(admin, row.id)`.

So cron iterates over users and runs one sync per user/sheet.

### 4.4 `sync_metadata` and `recordLastSync`

Today: single row `id = 1`, one `last_sync_at`.  
Per-user: one row per user.

Options:

- **A)** Primary key `(user_id)` and columns `user_id`, `last_sync_at`. Then `recordLastSync(supabase, userId)` upserts by `user_id`.
- **B)** Keep `id` as PK and add `user_id` unique; `recordLastSync(supabase, userId)` upserts where `user_id = userId`.

In both cases, “Last Refresh” in the UI reads `sync_metadata` for the current user (e.g. `supabase.from('sync_metadata').select('last_sync_at').eq('user_id', user.id).single()`).

### 4.5 `snapshotBudgetHistory`

Today: reads all `budget_targets` and writes to `budget_history`.  
Per-user: only snapshot the **current** user’s budget_targets. So when called from cron for `userId`, you must either:

- Use admin client and filter: `from('budget_targets').select(...).eq('user_id', userId)`, then insert into `budget_history` with `user_id: userId`, or  
- Use a server client that’s been created with a session for that user (e.g. **service role** + set `user_id` on inserts).

Easiest: use admin client, filter `budget_targets` by `user_id`, and write `budget_history` rows with that `user_id`. Same pattern as sync.

---

## 5. Auth and Onboarding

- **Allowlist:** You can keep `ALLOWED_EMAILS` for a closed beta: only those emails can sign up or sign in. After login, if `user_profiles` has no `google_spreadsheet_id`, show “Connect your sheet” and save it.
- **Open signup:** Remove or relax allowlist; any Google sign-in creates a user. Again, first-time flow: “Connect your sheet” and store `google_spreadsheet_id` in `user_profiles`.

Ensure middleware and auth callback still enforce your chosen rule (allowlist or open). The callback can create a `user_profiles` row on first login (e.g. `id = user.id`, `email = user.email`) so you have a row to update when they set a spreadsheet.

---

## 6. Migration for Existing Single-Tenant Data

If you already have data in production with no `user_id`:

1. **Pick the “legacy” user:** e.g. the Supabase user that corresponds to the current allowlist owner.
2. **Add nullable `user_id`** in a migration, then backfill:  
   `UPDATE account_balances SET user_id = '<legacy-user-uuid>' WHERE user_id IS NULL` (and same for all other tables).
3. **Set `user_id` to NOT NULL**, add FK if desired, add indexes (e.g. `(user_id, date_updated)` for account_balances).
4. **Replace RLS policies** with `USING (user_id = auth.uid())` (and same for `WITH CHECK`).
5. **Insert one `user_profiles`** row for the legacy user with `google_spreadsheet_id = current GOOGLE_SPREADSHEET_ID` (from env or config).
6. **Migrate `sync_metadata`** to the per-user shape and set `last_sync_at` for the legacy user from the current row.

After that, deploy app and sync changes so all new writes use `user_id` and RLS is enforced.

---

## 7. Checklist Summary

| Area | Change |
|------|--------|
| **Schema** | Add `user_id` to all user-specific tables; add `user_profiles` (id, google_spreadsheet_id, …). |
| **RLS** | Policies `USING (user_id = auth.uid())` and `WITH CHECK (user_id = auth.uid())` on those tables. |
| **Sync** | `syncGoogleSheet(supabase, { spreadsheetId, userId })`; every row written with that `userId`. |
| **Manual sync** | Resolve spreadsheet from `user_profiles` for current user; run sync for that user. |
| **Cron** | Loop over `user_profiles` with non-null spreadsheet; sync + snapshot + recordLastSync per user. |
| **sync_metadata** | One row per user; `recordLastSync(supabase, userId)`; UI reads by current user. |
| **snapshotBudgetHistory** | Filter by `user_id`; write `budget_history` with that `user_id`. |
| **Auth / onboarding** | Allowlist or open signup; “Connect your sheet” and save to `user_profiles`. |
| **Migration** | Backfill existing rows with legacy `user_id`; then NOT NULL + RLS. |

Once these are in place, the app is multi-tenant: each user has their own data and, if they’ve set a sheet, their own sync and “Last refresh” state.

---

## 8. Implemented steps (walkthrough)

The codebase has been updated to support multi-user scaling:

1. **Migration 017** (`supabase/migrations/017_add_multi_tenant_schema.sql`): Adds `user_profiles`, `user_id` on all user-specific tables, backfills from first auth user, updates unique constraints and `sync_metadata` to one row per user.
2. **Migration 018** (`supabase/migrations/018_rls_multi_tenant_policies.sql`): RLS policies `user_id = auth.uid()` on all tables with `user_id`; FX tables stay global.
3. **Sync** (`lib/sync-google-sheet.ts`): `syncGoogleSheet(supabase, { spreadsheetId, userId })`; every row (except FX) gets `user_id`; onConflict keys include `user_id`.
4. **recordLastSync** (`lib/sync-metadata.ts`): `recordLastSync(supabase, userId)` upserts by `user_id`.
5. **snapshotBudgetHistory** (`lib/snapshot-budget-history.ts`): Accepts `userId`, filters `budget_targets` by `user_id`, writes `budget_history` with `user_id`.
6. **POST /api/sync**: Loads `google_spreadsheet_id` from `user_profiles` for current user; returns 400 “Connect your sheet first” if null.
7. **Cron** (`/api/cron/refresh`): Lists `user_profiles` with non-null `google_spreadsheet_id`, runs sync + snapshot + recordLastSync per user.
8. **Header**: Reads `sync_metadata` with `.maybeSingle()` (RLS scopes to current user).
9. **Auth callback**: Upserts `user_profiles` (id, email) on successful login.
10. **Settings** (`/settings`): Page and form to set `google_spreadsheet_id` and optional `display_name`; sidebar link added.

**After applying migrations:** If you have existing single-tenant data, the first user in `auth.users` is used as the legacy user and their data is backfilled. That user should log in and go to **Settings** to set their Google Spreadsheet ID (use your current `GOOGLE_SPREADSHEET_ID` value). New users sign in, get a `user_profiles` row from the callback, and set their spreadsheet ID in Settings before using sync.
