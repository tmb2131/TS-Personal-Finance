# Phase 1 Implementation Plan: Remove Adoption Barriers

> Reference: [MONETIZATION-STRATEGY.md](./MONETIZATION-STRATEGY.md) — Phase 1

## Overview

The app currently requires users to build and maintain a 13-tab Google Sheet to get any value. This is the single biggest barrier to monetization. Phase 1 adds three alternative data input methods (CSV import, manual entry, Plaid) and makes the Sheets path easier with a one-click template.

**Build order** (each step is independently shippable):
1. Google Sheet template flow (quick win, 1-2 days)
2. Manual data entry forms (foundation for all other input, 3-5 days)
3. CSV import (builds on manual entry patterns, 3-4 days)
4. Plaid integration (premium feature, 5-7 days)
5. Data source tracking migration (cross-cutting, do first)

---

## Step 0: Data Source Tracking (Do First)

Add a `data_source` column so the app knows where each row came from. This prevents sync conflicts (e.g., Google Sheets sync wiping out manually entered data) and enables source badges in the UI.

### Migration: `supabase/migrations/023_data_source_tracking.sql`

```sql
-- Add data_source column to tables that will support multiple input methods
ALTER TABLE account_balances
  ADD COLUMN data_source TEXT NOT NULL DEFAULT 'google_sheet'
  CHECK (data_source IN ('google_sheet', 'plaid', 'csv', 'manual'));

ALTER TABLE transaction_log
  ADD COLUMN data_source TEXT NOT NULL DEFAULT 'google_sheet'
  CHECK (data_source IN ('google_sheet', 'plaid', 'csv', 'manual'));

ALTER TABLE budget_targets
  ADD COLUMN data_source TEXT NOT NULL DEFAULT 'google_sheet'
  CHECK (data_source IN ('google_sheet', 'plaid', 'csv', 'manual'));

ALTER TABLE debt
  ADD COLUMN data_source TEXT NOT NULL DEFAULT 'google_sheet'
  CHECK (data_source IN ('google_sheet', 'plaid', 'csv', 'manual'));

ALTER TABLE kids_accounts
  ADD COLUMN data_source TEXT NOT NULL DEFAULT 'google_sheet'
  CHECK (data_source IN ('google_sheet', 'plaid', 'csv', 'manual'));

-- Add index for filtering by source
CREATE INDEX idx_transaction_log_data_source ON transaction_log(user_id, data_source);
CREATE INDEX idx_account_balances_data_source ON account_balances(user_id, data_source);
```

### Sync Service Change: `lib/sync-google-sheet.ts`

The Google Sheets sync currently does delete-all-then-insert for some tables (e.g., `transaction_log`, `budget_targets`). After this migration, it must only delete rows where `data_source = 'google_sheet'` so it doesn't wipe out manual/CSV/Plaid data.

**Change the delete logic:**
```typescript
// BEFORE (current)
await supabase.from(table).delete().eq('user_id', userId)

// AFTER (scoped to source)
await supabase.from(table).delete().eq('user_id', userId).eq('data_source', 'google_sheet')
```

Apply this to every table in `DELETE_INSERT_TABLES` and to `transaction_log` (which also does delete-all first).

### Types Change: `lib/types.ts`

Add to relevant interfaces:
```typescript
data_source?: 'google_sheet' | 'plaid' | 'csv' | 'manual'
```

---

## Step 1: Google Sheet Template Flow

### What to Build
A "Copy Template" button on the Settings page that duplicates the existing dummy sheet into the user's Google Drive and auto-saves the new sheet ID.

### Implementation

#### 1. API Route: `app/api/sheets/copy-template/route.ts`

```typescript
// POST /api/sheets/copy-template
// 1. Auth check (get user from session)
// 2. Use Google Drive API to copy DUMMY_SHEET_ID into user's Drive
//    - googleapis: drive.files.copy({ fileId: DUMMY_SHEET_ID, requestBody: { name: 'My Finance Dashboard' } })
//    - Note: requires Drive scope on the service account OR use a different approach
// 3. Share the copy with the service account (so sync can read it)
// 4. Update user_profiles.google_spreadsheet_id with the new sheet ID
// 5. Trigger sync
// 6. Return { spreadsheetId, spreadsheetUrl }
```

**Important constraint**: The Google service account can copy files it has access to, but the copy will live in the service account's Drive, not the user's. Two approaches:

- **Option A (simpler)**: Don't copy. Instead, provide a "Use Template" link that opens `https://docs.google.com/spreadsheets/d/{DUMMY_SHEET_ID}/copy` in a new tab. The user copies it to their own Drive, then pastes the new sheet ID back into Settings. Add clear instructions and a "I've copied it" button that opens the sheet ID input.

- **Option B (smoother)**: Use Google OAuth (not just service account) to get user's Drive access and copy the sheet into their Drive. This requires additional OAuth scopes and is more complex.

**Recommendation**: Start with Option A. It's 90% of the UX improvement with 10% of the effort.

#### 2. UI Change: `components/settings/settings-form.tsx`

Add above the spreadsheet ID input:
```tsx
<Card>
  <CardHeader>
    <CardTitle>Get Started with Google Sheets</CardTitle>
    <CardDescription>
      Copy our template to your Google Drive, then paste the new spreadsheet ID below.
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-3">
    <Button asChild variant="outline">
      <a
        href="https://docs.google.com/spreadsheets/d/1BxVuJ-DViN5nqpLc-8tGXex_pYiPY8dfL8UV5czCrHY/copy"
        target="_blank"
        rel="noopener noreferrer"
      >
        Copy Template to My Drive
      </a>
    </Button>
    <p className="text-sm text-muted-foreground">
      After copying, share the new sheet with: <code>{SERVICE_ACCOUNT_EMAIL}</code>
    </p>
  </CardContent>
</Card>
```

#### 3. Files to Create/Modify
| File | Action |
|---|---|
| `components/settings/settings-form.tsx` | Add template copy card above sheet ID input |

---

## Step 2: Manual Data Entry Forms

### What to Build
CRUD forms for the three most important data types: **transactions**, **account balances**, and **budget targets**. These are the tables users interact with most and the ones needed to get value from the dashboard without Sheets.

### Database: No Additional Migration Needed
The `data_source` column from Step 0 is sufficient. Manual entries use `data_source = 'manual'`.

### API Routes

#### `app/api/transactions/route.ts`

```
POST   /api/transactions          — Create transaction
GET    /api/transactions          — List transactions (paginated, filterable)
PATCH  /api/transactions/[id]     — Update transaction
DELETE /api/transactions/[id]     — Delete transaction (only if data_source = 'manual')
```

**POST body (validated with Zod):**
```typescript
const CreateTransactionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.string().min(1),
  counterparty: z.string().nullable(),
  amount_usd: z.number().nullable(),
  amount_gbp: z.number().nullable(),
  currency: z.enum(['USD', 'GBP']),
})
```

**Insert logic:**
```typescript
const { error } = await supabase.from('transaction_log').insert({
  user_id: user.id,
  date: body.date,
  category: body.category,
  counterparty: body.counterparty,
  counterparty_dedup: body.counterparty ?? '',
  amount_usd: body.amount_usd,
  amount_gbp: body.amount_gbp,
  currency: body.currency,
  data_source: 'manual',
})
```

#### `app/api/accounts/route.ts`

```
POST   /api/accounts              — Create/update account balance
DELETE /api/accounts/[id]         — Delete account (only if data_source = 'manual')
```

**POST body:**
```typescript
const CreateAccountSchema = z.object({
  institution: z.string().min(1),
  account_name: z.string().min(1),
  category: z.string().min(1),       // Cash, Brokerage, Retirement, etc.
  currency: z.enum(['USD', 'GBP', 'EUR']),
  balance_total_local: z.number(),
  balance_personal_local: z.number().default(0),
  balance_family_local: z.number().default(0),
  liquidity_profile: z.string().nullable(),
  risk_profile: z.string().nullable(),
  horizon_profile: z.string().nullable(),
})
```

#### `app/api/budgets/route.ts`

```
POST   /api/budgets               — Create/update budget target
DELETE /api/budgets/[id]          — Delete budget (only if data_source = 'manual')
```

**POST body:**
```typescript
const CreateBudgetSchema = z.object({
  category: z.string().min(1),
  annual_budget_gbp: z.number().default(0),
  annual_budget_usd: z.number().default(0),
})
```

### UI Components

#### `components/transactions/add-transaction-dialog.tsx`

Dialog with form fields:
- **Date**: date picker input (default: today)
- **Category**: dropdown (populated from existing categories + free text)
- **Counterparty**: text input
- **Amount**: number input
- **Currency**: USD/GBP toggle

Trigger: "Add Transaction" button on the Dashboard transactions section and on the Analysis page.

#### `components/accounts/add-account-dialog.tsx`

Dialog with form fields:
- **Institution**: text input (with autocomplete from existing institutions)
- **Account Name**: text input
- **Category**: dropdown (Cash, Brokerage, Retirement, Property, Other)
- **Currency**: USD/GBP/EUR
- **Balance**: number input
- **Liquidity Profile**: dropdown (Instant, Within 6 Months, Locked Up)
- **Risk Profile**: dropdown (if applicable)

Trigger: "Add Account" button on the Accounts page.

#### `components/budgets/add-budget-dialog.tsx`

Dialog with form fields:
- **Category**: text input
- **Annual Budget (GBP)**: number input
- **Annual Budget (USD)**: number input

Trigger: "Add Budget" button on the Dashboard budget section.

### Where to Add Entry Points

| Page | Component | Entry Point |
|---|---|---|
| Dashboard | `components/dashboard/` | "Add Transaction" button near transactions table |
| Accounts | `app/accounts/page.tsx` | "Add Account" button in page header |
| Analysis | `app/analysis/page.tsx` | "Add Transaction" button |
| Dashboard | `components/dashboard/` | "Add Budget" button near budget section |

### Delete Protection
Only rows with `data_source = 'manual'` can be deleted via the UI. Google Sheets, Plaid, and CSV data is managed by their respective sync mechanisms.

```typescript
// In DELETE handler
const { data: row } = await supabase.from('transaction_log').select('data_source').eq('id', id).single()
if (row?.data_source !== 'manual') {
  return NextResponse.json({ error: 'Can only delete manually entered data' }, { status: 403 })
}
```

### Files to Create

| File | Purpose |
|---|---|
| `app/api/transactions/route.ts` | POST (create), GET (list) |
| `app/api/transactions/[id]/route.ts` | PATCH (update), DELETE |
| `app/api/accounts/route.ts` | POST (create/upsert) |
| `app/api/accounts/[id]/route.ts` | DELETE |
| `app/api/budgets/route.ts` | POST (create/upsert) |
| `app/api/budgets/[id]/route.ts` | DELETE |
| `components/transactions/add-transaction-dialog.tsx` | Transaction form dialog |
| `components/accounts/add-account-dialog.tsx` | Account form dialog |
| `components/budgets/add-budget-dialog.tsx` | Budget form dialog |

---

## Step 3: CSV Import

### What to Build
A CSV upload flow on the Settings page (and as a standalone `/import` page) that lets users upload bank statement CSVs and map columns to the transaction schema.

### Dependencies
```bash
npm install papaparse
npm install -D @types/papaparse
```

### UI Flow

#### Screen 1: Upload
- Drag-and-drop zone or file picker
- Accept `.csv` files only
- Parse with PapaParse on the client side (no server round-trip for parsing)
- Show first 5 rows as preview

#### Screen 2: Column Mapping
After parsing, show a mapping UI:

| Our Field | Your Column |
|---|---|
| Date | [dropdown: col A, col B, ...] |
| Category | [dropdown or "None — I'll categorize later"] |
| Counterparty / Description | [dropdown] |
| Amount | [dropdown] |
| Currency | [fixed: USD or GBP based on user preference] |

- Auto-detect common column names (Date, Amount, Description, Category, Merchant)
- Show preview of mapped data (5 rows)

#### Screen 3: Review & Import
- Show total row count
- Show detected duplicates (matched by date + amount + counterparty)
- "Import X new transactions" button
- POST to `/api/import/csv`

### API Route: `app/api/import/csv/route.ts`

```
POST /api/import/csv
Body: { transactions: Array<{ date, category, counterparty, amount, currency }> }
```

**Server-side logic:**
1. Validate all rows with Zod
2. Convert amounts: if user provides a single "amount" column, populate `amount_usd` or `amount_gbp` based on currency
3. Generate `counterparty_dedup` (lowercase, trimmed)
4. Check for duplicates against existing `transaction_log` rows (same date + amount + counterparty_dedup)
5. Insert non-duplicate rows with `data_source = 'csv'`
6. Return `{ imported: number, duplicates: number, errors: number }`

### Duplicate Detection Logic

```typescript
// For each incoming row, check:
const isDuplicate = await supabase
  .from('transaction_log')
  .select('id')
  .eq('user_id', userId)
  .eq('date', row.date)
  .eq('counterparty_dedup', normalizeCounterparty(row.counterparty))
  .eq(currencyColumn, row.amount)  // amount_usd or amount_gbp
  .limit(1)

// Batch this: fetch all existing (date, counterparty_dedup, amount) tuples for the date range,
// then do in-memory comparison. Much faster than N queries.
```

### Category Inference
For rows without a category column:
- Match counterparty against existing `transaction_log` entries to infer category
- If no match, default to "Uncategorized"
- Show "Uncategorized" transactions in a review queue (future enhancement)

### Files to Create

| File | Purpose |
|---|---|
| `app/import/page.tsx` | Server component: import page |
| `components/import/csv-upload.tsx` | Client component: full CSV import flow |
| `components/import/column-mapper.tsx` | Column mapping UI |
| `components/import/import-preview.tsx` | Preview and confirm |
| `app/api/import/csv/route.ts` | Server: validate, dedupe, insert |
| `lib/csv-parser.ts` | Shared: column auto-detection, normalization |
| `components/sidebar.tsx` | Add "Import" nav item (or put under Settings) |

---

## Step 4: Plaid Integration (Premium Feature)

### What to Build
Plaid Link integration that lets Pro-tier users connect bank accounts and automatically import transactions and balances.

### Dependencies
```bash
npm install plaid react-plaid-link
```

### Environment Variables (New)
```bash
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=sandbox          # sandbox | production
PLAID_PRODUCTS=transactions,assets
PLAID_COUNTRY_CODES=US,GB
```

### Database Migration: `supabase/migrations/024_plaid_integration.sql`

```sql
-- Plaid item (one per connected institution)
CREATE TABLE plaid_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plaid_item_id TEXT NOT NULL,
  access_token TEXT NOT NULL,          -- encrypted at rest by Supabase
  institution_id TEXT,
  institution_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error', 'disconnected')),
  error_code TEXT,
  consent_expiration TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  cursor TEXT,                         -- Plaid sync cursor for incremental sync
  UNIQUE(user_id, plaid_item_id)
);

ALTER TABLE plaid_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_own_plaid_items" ON plaid_items
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Index for cron sync
CREATE INDEX idx_plaid_items_status ON plaid_items(status, last_synced_at);
```

### API Routes

#### `app/api/plaid/create-link-token/route.ts`
```
POST /api/plaid/create-link-token
→ Returns { link_token }
```
- Creates a Plaid Link token for the frontend
- Configures products: `transactions`
- Configures country codes: `US, GB`

#### `app/api/plaid/exchange-token/route.ts`
```
POST /api/plaid/exchange-token
Body: { public_token, institution }
→ Returns { success, institution_name }
```
- Exchanges public token for access token
- Stores in `plaid_items` table
- Triggers initial transaction sync

#### `app/api/plaid/sync/route.ts`
```
POST /api/plaid/sync
Body: { plaid_item_id? }  (optional — syncs all if omitted)
→ Returns { added, modified, removed }
```
- Uses Plaid Transactions Sync API (cursor-based incremental sync)
- Maps Plaid transactions → `transaction_log` rows:
  - `date` → `date`
  - `name` / `merchant_name` → `counterparty`
  - `personal_finance_category.primary` → `category` (mapped to our categories)
  - `amount` → `amount_usd` or `amount_gbp` (based on `iso_currency_code`)
  - `data_source` = `'plaid'`
- Maps Plaid accounts → `account_balances` rows:
  - `name` → `account_name`
  - `institution_name` → `institution`
  - `type` → `category` (mapped: depository→Cash, investment→Brokerage, etc.)
  - `balances.current` → `balance_total_local`
  - `data_source` = `'plaid'`

#### `app/api/plaid/webhook/route.ts`
```
POST /api/plaid/webhook
```
- Handles Plaid webhooks:
  - `SYNC_UPDATES_AVAILABLE` → trigger incremental sync
  - `ITEM_ERROR` → mark item as error, notify user
  - `PENDING_EXPIRATION` → warn user to re-authenticate

#### `app/api/plaid/accounts/route.ts`
```
GET /api/plaid/accounts
→ Returns list of connected institutions and accounts
DELETE /api/plaid/accounts/[item_id]
→ Disconnects institution
```

### Plaid Category Mapping

Create `lib/plaid-category-map.ts`:
```typescript
// Map Plaid personal_finance_category.primary → our categories
const PLAID_CATEGORY_MAP: Record<string, string> = {
  'INCOME': 'Income',
  'FOOD_AND_DRINK': 'Food & Drink',
  'TRANSPORTATION': 'Transport',
  'TRAVEL': 'Travel',
  'ENTERTAINMENT': 'Entertainment',
  'RENT_AND_UTILITIES': 'Bills & Utilities',
  'GENERAL_MERCHANDISE': 'Shopping',
  'HOME_IMPROVEMENT': 'Home',
  'MEDICAL': 'Healthcare',
  'PERSONAL_CARE': 'Personal Care',
  'GENERAL_SERVICES': 'Services',
  'GOVERNMENT_AND_NON_PROFIT': 'Tax & Government',
  'TRANSFER_IN': 'Transfer',
  'TRANSFER_OUT': 'Transfer',
  'LOAN_PAYMENTS': 'Debt Payment',
  'BANK_FEES': 'Fees',
  // ... complete mapping
}
```

### UI Components

#### `components/settings/plaid-connection.tsx`

```tsx
// Uses react-plaid-link
// 1. "Connect Bank Account" button
// 2. Opens Plaid Link modal (handled by react-plaid-link)
// 3. On success: POST to /api/plaid/exchange-token
// 4. Show list of connected institutions with:
//    - Institution name + logo
//    - Number of accounts
//    - Last synced time
//    - "Disconnect" button
//    - "Re-sync" button
//    - Error state (if webhook reported error)
```

#### Integration with Settings Page

Add a new card section to `app/settings/page.tsx`:
```tsx
<Card>
  <CardHeader>
    <CardTitle>Connected Bank Accounts</CardTitle>
    <CardDescription>
      Automatically import transactions from your bank.
      {!isPro && <span> Upgrade to Pro to connect bank accounts.</span>}
    </CardDescription>
  </CardHeader>
  <CardContent>
    {isPro ? <PlaidConnection /> : <UpgradePrompt feature="bank-connection" />}
  </CardContent>
</Card>
```

### Sync Integration with Cron

Update `app/api/cron/refresh/route.ts` to also sync Plaid items:
```typescript
// After Google Sheets sync loop:
// 1. Fetch all active plaid_items
// 2. For each item, call Plaid Transactions Sync
// 3. Update last_synced_at
// 4. Handle errors (mark item as error if auth expired)
```

### Files to Create

| File | Purpose |
|---|---|
| `supabase/migrations/024_plaid_integration.sql` | Plaid tables |
| `app/api/plaid/create-link-token/route.ts` | Link token creation |
| `app/api/plaid/exchange-token/route.ts` | Token exchange + initial sync |
| `app/api/plaid/sync/route.ts` | Incremental transaction sync |
| `app/api/plaid/webhook/route.ts` | Plaid webhook handler |
| `app/api/plaid/accounts/route.ts` | List/disconnect accounts |
| `lib/sync-plaid.ts` | Plaid sync logic (map + insert) |
| `lib/plaid-client.ts` | Plaid client initialization |
| `lib/plaid-category-map.ts` | Category mapping |
| `components/settings/plaid-connection.tsx` | Plaid Link UI + connected accounts list |

---

## Cross-Cutting Concerns

### Onboarding Flow Update

After all steps are complete, update the new-user experience:

**Current flow**: Sign in → dummy data auto-loaded → blue banner → Settings to connect sheet

**New flow**: Sign in → Welcome dialog with three paths:

```
┌─────────────────────────────────────────────┐
│  Welcome to TS Personal Finance!            │
│                                             │
│  How would you like to add your data?       │
│                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ 🏦       │ │ 📊       │ │ ✏️        │    │
│  │ Connect  │ │ Google   │ │ Start    │    │
│  │ Bank     │ │ Sheets   │ │ Manual   │    │
│  │ (Pro)    │ │          │ │          │    │
│  └──────────┘ └──────────┘ └──────────┘    │
│                                             │
│  ── or ──                                   │
│  📁 Import CSV    |    👀 Explore Demo      │
└─────────────────────────────────────────────┘
```

**File**: `components/insights/connect-sheet-modal.tsx` → refactor into `components/onboarding/welcome-dialog.tsx`

### Settings Page Reorganization

The Settings page should be reorganized into sections:

```
Settings
├── Data Sources
│   ├── Google Sheets (existing — template link + sheet ID)
│   ├── Bank Connections (Plaid — Pro only)
│   └── CSV Import (link to /import page)
├── Manual Data Entry
│   ├── Quick links to add: Transaction, Account, Budget
├── Preferences
│   ├── Display Name
│   ├── Default Currency
│   └── Appearance (theme)
└── Billing (Phase 2 — placeholder)
```

### Source Badges in UI

Add a small badge to data tables showing where each row came from:

```tsx
function SourceBadge({ source }: { source: string }) {
  const config = {
    google_sheet: { label: 'Sheet', className: 'bg-green-100 text-green-800' },
    plaid: { label: 'Bank', className: 'bg-blue-100 text-blue-800' },
    csv: { label: 'CSV', className: 'bg-amber-100 text-amber-800' },
    manual: { label: 'Manual', className: 'bg-purple-100 text-purple-800' },
  }[source]

  return <span className={`text-xs px-1.5 py-0.5 rounded-full ${config.className}`}>{config.label}</span>
}
```

---

## Full File Inventory

### New Files (19)

| File | Step |
|---|---|
| `supabase/migrations/023_data_source_tracking.sql` | 0 |
| `supabase/migrations/024_plaid_integration.sql` | 4 |
| `app/api/transactions/route.ts` | 2 |
| `app/api/transactions/[id]/route.ts` | 2 |
| `app/api/accounts/route.ts` | 2 |
| `app/api/accounts/[id]/route.ts` | 2 |
| `app/api/budgets/route.ts` | 2 |
| `app/api/budgets/[id]/route.ts` | 2 |
| `app/api/import/csv/route.ts` | 3 |
| `app/api/plaid/create-link-token/route.ts` | 4 |
| `app/api/plaid/exchange-token/route.ts` | 4 |
| `app/api/plaid/sync/route.ts` | 4 |
| `app/api/plaid/webhook/route.ts` | 4 |
| `app/api/plaid/accounts/route.ts` | 4 |
| `app/import/page.tsx` | 3 |
| `components/import/csv-upload.tsx` | 3 |
| `components/import/column-mapper.tsx` | 3 |
| `lib/sync-plaid.ts` | 4 |
| `lib/plaid-client.ts` | 4 |
| `lib/plaid-category-map.ts` | 4 |

### Existing Files to Modify (8)

| File | Change | Step |
|---|---|---|
| `lib/sync-google-sheet.ts` | Scope deletes to `data_source = 'google_sheet'` | 0 |
| `lib/types.ts` | Add `data_source` to interfaces | 0 |
| `components/settings/settings-form.tsx` | Add template copy card, reorganize sections | 1 |
| `app/settings/page.tsx` | Add Plaid connection section, import link | 1, 4 |
| `components/sidebar.tsx` | Add "Import" nav item | 3 |
| `app/api/cron/refresh/route.ts` | Add Plaid sync to cron loop | 4 |
| `components/insights/connect-sheet-modal.tsx` | Refactor into multi-path welcome dialog | Cross-cutting |
| `app/auth/callback/route.ts` | Update new-user flow for multi-source onboarding | Cross-cutting |

### Dependencies to Add

```bash
# Step 3: CSV
npm install papaparse
npm install -D @types/papaparse

# Step 4: Plaid
npm install plaid react-plaid-link
```

---

## Testing Checklist

### Step 0: Data Source Tracking
- [ ] Migration runs without error
- [ ] Existing rows get `data_source = 'google_sheet'` default
- [ ] Google Sheets sync only deletes `data_source = 'google_sheet'` rows
- [ ] Google Sheets sync still works end-to-end after the change

### Step 1: Sheet Template
- [ ] "Copy Template" link opens Google Sheets copy dialog
- [ ] Instructions clearly explain sharing with service account
- [ ] User can paste new sheet ID and sync successfully

### Step 2: Manual Entry
- [ ] Can create a transaction via dialog
- [ ] Can create an account balance via dialog
- [ ] Can create a budget target via dialog
- [ ] Manually entered data appears in dashboard/charts
- [ ] Can delete manually entered rows
- [ ] Cannot delete Google Sheets-sourced rows via UI
- [ ] Google Sheets sync does NOT delete manually entered rows
- [ ] Form validation works (required fields, number formats, date formats)

### Step 3: CSV Import
- [ ] Can upload a CSV file
- [ ] Column auto-detection works for common formats
- [ ] Manual column mapping works
- [ ] Preview shows correct mapped data
- [ ] Duplicate detection flags existing transactions
- [ ] Import inserts rows with `data_source = 'csv'`
- [ ] Imported transactions appear in dashboard
- [ ] Google Sheets sync does NOT delete CSV-imported rows

### Step 4: Plaid
- [ ] Can open Plaid Link and connect sandbox institution
- [ ] Token exchange stores access token in `plaid_items`
- [ ] Initial sync imports transactions and balances
- [ ] Category mapping produces reasonable categories
- [ ] Connected institutions show in Settings
- [ ] Can disconnect an institution
- [ ] Cron sync refreshes Plaid data
- [ ] Plaid data not deleted by Google Sheets sync
- [ ] Webhook handler processes sync updates
