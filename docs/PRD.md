# Product Requirements Document (PRD)

## 1. Executive Summary

### What is this app?

**Findash** (branded in-app as **TS Personal Finance**) is a multi-tenant personal finance dashboard built on Next.js + Supabase.

The latest build uses a **hybrid data model**:
- Google Sheets sync for selected source tabs (accounts, transactions, FX, kids, recurring, investment return)
- In-app manual CRUD for key datasets (budgets, debt, account/transaction overrides, recurring, kids, investment return)
- CSV import for transactions
- Derived app-computed datasets (annual/monthly trends, historical net worth snapshots, YoY net worth bridge, forecast evolution snapshots)

The app provides dashboards, insights, liquidity monitoring, transaction analysis, forecast evolution, and an AI assistant with tool-calling.

### Who is the primary user?

Individuals/families who want one place to monitor net worth, budget vs actuals, spending trends, liquidity, and forecast deltas.

Any Google account can sign in. Data isolation is enforced by Supabase RLS per `user_id`.

On first login, the app seeds users with a dummy sheet ID and kicks off a background sync so users can explore immediately, then switch to their own sheet in Settings.

---

## 2. Technical Architecture

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 (App Router), React 18, Tailwind CSS |
| Backend/Data | Supabase PostgreSQL, `@supabase/ssr`, service-role admin client for cron |
| Auth | Supabase Auth (Google OAuth) |
| Routing/Middleware | `proxy.ts` enforces auth on app/API routes; `/api/cron/*` requires `Authorization: Bearer <CRON_SECRET>` |
| AI | AI SDK + Gemini 2.5 Flash, server tool-calling via `/api/chat` |

### Key Libraries

1. `ai`, `@ai-sdk/react`, `@ai-sdk/google` for streaming chat + tool orchestration
2. `recharts` for all charts (dashboard/analysis/insights/liquidity)
3. `googleapis` for Google Sheets batch sync
4. `papaparse` for CSV import parsing
5. `next-themes` for light/dark/system appearance
6. `zod` for route/tool input validation

---

## 3. Data Model & Schema

Migrations currently run through **035** (`supabase/migrations/001` ... `035`).

### User & Config

| Table | Purpose |
|-------|---------|
| `user_profiles` | Per-user profile + settings: `google_spreadsheet_id`, `display_name`, `default_currency` |
| `sync_metadata` | Per-user `last_sync_at` used by header refresh status |

### Core Financial Data (User-Scoped)

| Table | Purpose |
|-------|---------|
| `account_balances` | Account snapshots with liquidity/risk/horizon profiles + `data_source` |
| `transaction_log` | Transactions with currency + `data_source` (`google_sheet`, `csv`, `manual`, `plaid`) |
| `budget_targets` | App-managed budgets by category (`data_source` normalized to manual) |
| `forecast_settings` | Forecast methods per category (Annual/Linear/Budget/Manual, plus monthly method) |
| `forecast_settings_history` | Daily effective history for rollback-based forecast evolution |
| `budget_targets_history` | Daily effective history of annual budgets |
| `budget_history` | Legacy snapshot table retained for compatibility |
| `historical_net_worth` | Derived from account history (`app_generated`) plus manual yearly overrides |
| `yoy_net_worth` | App-computed YoY bridge rows (`Year Start`, `Income`, `Gift Money`, `Expenses`, optional `FX Impact`, `Investment Return YTD`, `Year End`) |
| `debt` | App-only debt tracking (`data_source` default/manual) |
| `kids_accounts` | Kids balances + notes (`google_sheet` and `manual` rows) |
| `recurring_payments` | Recurring obligations (`google_sheet` and `manual` rows) |
| `recurring_preferences` | Ignore patterns for recurring detection |
| `investment_return` | Investment return rows (`google_sheet` and `manual`) |

### AI Quality & Telemetry

| Table | Purpose |
|-------|---------|
| `ai_chat_telemetry` | Per-chat intent/tool/quality flags |
| `ai_quality_reports` | Weekly cron-generated aggregate quality reports |

### Global Tables

| Table | Purpose |
|-------|---------|
| `fx_rates` | Historical FX rates |
| `fx_rate_current` | Latest GBP/USD rate |

### RPCs

| Function | Purpose |
|----------|---------|
| `get_cash_runway_net_burn(p_start, p_end)` | Net burn in GBP/USD over date range |
| `distinct_categories()` | Distinct categories from budgets + transactions for current user |
| `current_user_id()` | Auth helper used by RLS policies |

---

## 4. Core Feature Specifications

### 4.0 Login (`/login`)

- Google OAuth via Supabase.
- Callback at `/auth/callback` exchanges code, upserts `user_profiles`, and redirects to `/insights`.
- New users get dummy sheet ID + background sync.
- Signed-in users visiting `/login` are redirected to `/insights`.

### 4.1 Dashboard (`/`)

- At-a-glance cards + section navigation.
- Net worth chart (historical, Trust-aware handling).
- Income vs Expenses chart.
- Budget table with in-app editing entry points (budget + category planning).
- Annual and Monthly trends tables are computed from app logic (`lib/forecasting.ts`) rather than legacy trends tables.
- Supports full-table view overlays.

### 4.2 Key Insights (`/insights`)

- KPI/summary cards built from budgets, computed trends, historical net worth, and latest balances.
- Daily Summary modal (on-mount + header-triggered).
- Connect Sheet modal when sheet setup is missing.
- Dummy-data banner shown when using seeded sample sheet.

### 4.3 Accounts (`/accounts`)

- Account listing with latest per account.
- Add/Edit/Delete manual account rows.
- Non-manual rows are read-only in edit/delete APIs.

### 4.4 Liquidity (`/liquidity`)

- KPIs: Total Cash, Liquid Assets, Instant Liquidity.
- Committed capital vs liquidity chart.
- Monthly expenses vs liquidity chart.
- Debt overview + distribution/risk/horizon views.
- Debt is app-managed (manual source).

### 4.5 Kids Accounts (`/kids`)

- Kids balances + notes/purpose.
- Supports sheet-synced rows plus manual rows.
- Sidebar hides Kids nav when no kids data exists.

### 4.6 Recurring (`/recurring`)

- Recurring table + detection summary.
- Recurring detection from transaction history (`lib/utils/detect-recurring-payments.ts`).
- Supports manual recurring entries while preserving synced rows.

### 4.7 Import (`/import`)

- CSV upload, column mapping, preview, import summary.
- API route: `POST /api/import/csv`.
- Dedup key: `date + normalized counterparty + amount`.
- Imported rows use `data_source = 'csv'`.

### 4.8 Settings (`/settings`)

- Google Sheet connection + template copy workflow.
- Default currency preference (`user_profiles.default_currency`).
- Category Planning section to manage annual budget + forecast methods + manual overrides by category.
- Appearance (Light/Dark/System) via `next-themes`.
- Saving settings with a sheet ID triggers sync.

### 4.9 Analysis (`/analysis`)

- Sections: Cash Runway, Transaction Analysis, Forecast Evolution, YTD Cumulative, Annual Cumulative, YoY Net Worth, Monthly Category Trends.
- Deep-link support via hash and query params.
- Add Transaction dialog (manual transaction CRUD).
- Forecast evolution endpoints use rollback history computation (`forecast_settings_history`, `budget_targets_history`) via `lib/forecast-evolution.ts`.

### 4.10 AI Assistant

- Chat widget available in app shell.
- Route: `POST /api/chat`.
- Model: `gemini-2.5-flash`.
- Tooling currently includes:
  1. `get_app_instructions`
  2. `get_financial_snapshot`
  3. `analyze_spending`
  4. `get_budget_vs_actual`
  5. `get_financial_health_summary`
  6. `analyze_forecast_evolution`
  7. `get_net_worth_trend`
  8. `analyze_monthly_category_trends`
  9. `get_cash_runway`
  10. `search_web` (enabled when `SERPER_API_KEY` is configured)
- Logs AI quality telemetry into `ai_chat_telemetry`.

---

## 5. Integrations & External Services

### 5.1 Google Sheets

- Per-user sheet ID in `user_profiles.google_spreadsheet_id`.
- Synced tabs in current build:
  - `Account Balances`
  - `Transaction Log`
  - `FX Rates`
  - `FX Rate Current`
  - `Kids`
  - `Investment Return`
  - `Recurring Payments`
- No longer synced from sheet: budgets, debt, annual/monthly trends, historical net worth, YoY net worth.

### 5.2 Sync Flow

- Manual sync: `POST /api/sync`.
- Scheduled sync: `GET|POST /api/cron/refresh` (CRON_SECRET protected).
- After successful sync, app rebuilds:
  - historical net worth snapshots (`rebuildHistoricalNetWorthFromAccountHistory`)
  - YoY net worth bridge (`rebuildYoYNetWorthFromAppData`)
  - sync timestamp (`recordLastSync`)

### 5.3 Supabase

- RLS on user-scoped tables.
- Service-role client used by cron jobs and global report generation.

### 5.4 AI + Web Search

- Gemini via AI SDK for core analysis.
- Optional Serper integration for benchmark-style external comparisons (`search_web`).

### 5.5 Deployment/Cron (Vercel)

`vercel.json` cron schedules:
- `0 6 * * *` → `/api/cron/refresh`
- `30 23 * * *` → `/api/cron/refresh`
- `0 9 * * 1` → `/api/cron/ai-quality-report`

### 5.6 API Surface (Current Build)

Core endpoints:
- `POST /api/chat`
- `POST /api/sync`
- `GET|POST /api/cron/refresh`
- `GET|POST /api/cron/ai-quality-report`
- `GET /api/ai/quality-report`

Forecast/analysis endpoints:
- `GET /api/cash-runway`
- `GET /api/forecast-bridge`
- `GET /api/forecast-gap-over-time`
- `GET /api/forecast-snapshots`

Data-management endpoints:
- `POST /api/accounts`, `PATCH|DELETE /api/accounts/[id]`
- `POST /api/transactions`, `PATCH|DELETE /api/transactions/[id]`
- `GET|POST /api/budgets`, `PATCH|DELETE /api/budgets/[id]`
- `GET|PUT /api/category-planning`
- `POST /api/debt`, `PATCH|DELETE /api/debt/[id]`
- `POST /api/kids`, `PATCH|DELETE /api/kids/[id]`
- `POST /api/recurring`, `PATCH|DELETE /api/recurring/[id]`
- `GET|POST /api/investment-returns`, `PATCH|DELETE /api/investment-returns/[id]`
- `GET|PUT /api/net-worth-history`
- `POST /api/yoy-net-worth/rebuild`
- `POST /api/import/csv`

---

## 6. Known Gaps / Follow-Ups

- `lib/allowed-emails.ts` exists but is not wired into auth flow.
- `snapshotBudgetHistory` utility remains in repo but is no longer part of primary sync/forecast evolution path.
- FX fallback constants (e.g. `1.25` / `1.27`) are still distributed across modules.
- No comprehensive automated test suite yet for sync mappings, history rollback logic, and AI tool orchestration.

---

*Last updated: February 11, 2026. Synced with build including app-managed budgets/debt/history, rollback-based forecast evolution, import flow, and AI telemetry/reporting.*
