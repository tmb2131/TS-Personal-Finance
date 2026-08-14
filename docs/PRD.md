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
- Callback at `/auth/callback` exchanges code, upserts `user_profiles`, and redirects to `/`.
- New users get dummy sheet ID + background sync.
- Signed-in users visiting `/login` are redirected to `/`.

### 4.1 Home (`/`)

Merges the former Daily Summary and Key Insights pages, which overlapped on net
worth, budget, income vs expenses, and trends. Home answers one question: is
there anything I need to do? Target is a primary read that fits one mobile
screen without scrolling.

Four blocks, in order:

1. **GBP available** — sterling cash actually held across the UK accounts,
   largest type on the page. Deliberately does **not** follow the currency
   toggle: roughly 95% of the working pool is USD-denominated, so a converted
   total would read as sterling that is not there. The converted all-cash total
   is shown separately and labelled.
2. **Budget status** — full-year tracking against budget, with the over/under gap.
3. **Net worth** — latest total, excluding trust capital, with the exclusion
   labelled rather than silent.
4. **Attention** — zero to three items, and only when genuinely actionable
   (sync stale beyond 48h, a category more than 20% over budget). The empty
   state is one line, not a card.

The Executive Summary card and the Milestones banner were removed. Nothing on
Home is duplicated from the other four pages.

### 4.2 Spending (`/spending`)

- Today section: today's headroom, spend by category and by forecast methodology.
- Budget table with in-app editing entry points (section id `budget-table`).
- Transaction Analysis, with period/year/month/category deep links preserved
  from the retired `/analysis?section=transaction-analysis` URLs.
- Transactions list: search, filter, review; manual CRUD.
- Recurring: table plus detection summary from `lib/utils/detect-recurring-payments.ts`.

### 4.3 Position (`/position`)

- Accounts: listing with latest row per account; manual add/edit/delete, with
  non-manual rows read-only in the edit/delete APIs.
- Net worth chart over time (section id `net-worth-chart`).
- Cash runway (section id `cash-runway`).
- Liquidity: Total Cash, Liquid Assets, Instant Liquidity; committed capital vs
  liquidity; monthly expenses vs liquidity; debt overview; distribution, risk
  and horizon views. Debt is app-managed (manual source).
- Sustainable spend explorer.
- Kids accounts, hidden entirely when there is no kids data.

**Trust exclusion.** The Brosens 2012 Children's Trust line is a 25% interest in
a larger trust and is preserve-and-pass-down capital; the education trust is
ring-fenced for Kiran's and Nilan's education and is tracked separately in
`kids_accounts`. Neither belongs in runway, liquidity, or spendable-capital
figures. The headline figures already excluded trust capital before this was
made explicit, but only incidentally — the account's category is `Trust` and its
liquidity profile is `Locked Up`, so it missed the Cash/Brokerage and Instant
filters by accident of categorisation. `lib/trust-exclusions.ts` now makes the
exclusion load-bearing, and every surface carries a visible label for it.

### 4.4 Trends (`/trends`)

Cut from the seven sections the old Analysis page carried down to a shorter set:

- Observations: top ranked allocation and spending observations.
- **Forecast**: one section with a period toggle, opening on **how the forecast
  changed** (bridge + gap-over-time), with year-to-date and full-year alongside. These were three separate sections
  (`ytd-spend`, `annual-cumulative`, `forecast-evolution`) — three renderings of
  one question. Each old fragment still lands here and opens the matching period.
- Methodologies: three forecast methodologies and the scenario band.
- YoY Net Worth (section id `yoy-net-worth`).
- Monthly Category Trends (section id `monthly-category-trends`).
- Annual and monthly trends tables, computed from `lib/forecasting.ts`.

Forecast evolution endpoints use rollback history computation
(`forecast_settings_history`, `budget_targets_history`) via
`lib/forecast-evolution.ts`.

### 4.5 Settings (`/settings`)

- Google Sheet connection + template copy workflow.
- CSV import (absorbed from the retired `/import` route, `?target=` preserved):
  upload, column mapping, preview, import summary. `POST /api/import/csv`,
  dedup key `date + normalized counterparty + amount`, rows written with
  `data_source = 'csv'`.
- Default currency preference (`user_profiles.default_currency`).
- Category Planning: annual budget, forecast methods, manual overrides.
- Financial assumptions.
- Appearance (Light/Dark/System) via `next-themes`.
- Account: log out.
- Saving settings with a sheet ID triggers sync.

### 4.6 Navigation and chrome

- Five destinations, flat: Home, Spending, Position, Trends, Settings. Five
  items do not need grouping headers, and the mobile bar holds all five — there
  is no "More" sheet, and every destination is one tap.
- Header: sync status, refresh, currency chip, quick add. The currency toggle is
  a single chip showing the active currency; theme and log out moved to Settings.
- One floating button: the AI assistant. Quick Add moved into the header.
- Retained: scroll-to-hide header, pull-to-refresh, safe-area insets, skip link.

### 4.7 Retired routes

Every retired route redirects and no bookmark 404s. Single-destination routes
redirect in `next.config.ts`; `/dashboard` and `/analysis` resolve on the client,
because their sections split across more than one destination and a URL fragment
never reaches the server. New pages reuse the old section ids so fragments and
query params survive. Full table in `docs/AI-PAGE-COVERAGE-MATRIX.md`.

### 4.8 Non-cash ledger entries

Ledger rows with counterparty "Valuation change" are non-cash mark-to-market
entries that book as sterling inflows. They arrive categorised `Excluded`, so
the category filters already kept them out of most totals — but that depends on
the source sheet staying categorised correctly, and a single recategorisation
upstream would reintroduce phantom income. The exclusion is enforced on the
counterparty as well, in `lib/category-filters.ts` and in the cash runway RPC,
matched on the exact normalized name so genuine expenses such as "Prestige
Valuations" keep flowing through.

### 4.9 AI Assistant

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
