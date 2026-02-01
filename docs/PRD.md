# Product Requirements Document (PRD)

## 1. Executive Summary

### What is this app?

**Findash** (branded in-app as **TS Personal Finance**) is a personal finance dashboard that aggregates account balances, transactions, budgets, and net worth from a single Google Sheet, syncs them into Supabase, and presents them via a multi-page web app with charts, trend analysis, forecast evolution, and an AI assistant for natural-language queries.

### Who is the primary user?

The primary user is an individual or household (e.g. family/trust) who maintains financial data in a Google Sheet and wants a single place to view net worth, budget vs actual, spending trends, cash runway, year-over-year net worth changes, and “why did my forecast change?”—with optional chat-based analysis. Access is restricted to an allowlist of emails (env-configured); authentication is Google OAuth via Supabase.

---

## 2. Technical Architecture

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 16 (App Router), React 18, Tailwind CSS |
| **Backend / Data** | Supabase (PostgreSQL), server-side Supabase client via `@supabase/ssr` |
| **Auth** | Supabase Auth with Google OAuth; post-login redirect to `/insights`; allowlist via `ALLOWED_EMAILS` (comma-separated in env) |
| **Routing / Middleware** | Next.js middleware (`proxy.ts`) enforces auth on all routes except `/login` and `/api/cron/*`; cron routes require `Authorization: Bearer <CRON_SECRET>` |

### Key libraries

1. **AI SDK (`ai`, `@ai-sdk/react`, `@ai-sdk/google`)** – Streaming chat with tool use; model: Gemini 2.5 Flash. Powers the in-app “Financial Assistant” chat widget with tools for snapshots, spending, budget vs actual, and forecast evolution.
2. **Recharts** – All charts: net worth over time, income vs expenses, cumulative spend, annual cumulative spend, YoY net worth waterfall, forecast evolution (bridge) waterfall, forecast gap over time (line).
3. **googleapis** – Google Sheets API; used by `lib/sync-google-sheet.ts` to pull data into Supabase (account balances, transactions, budget targets, historical net worth, FX rates, trends, recurring payments, kids accounts, investment return, YoY net worth).
4. **Supabase (`@supabase/supabase-js`, `@supabase/ssr`)** – Database client, auth, and cookie-based session handling in server and client components.
5. **Zod** – Input validation and schema for AI tool parameters (chat API) and type-safe config.

Other notable deps: `lucide-react` (icons), `react-markdown` + `remark-gfm` (chat responses), `date-fns`, `sonner` (toasts), Radix UI primitives (dialog, checkbox, progress, etc.).

---

## 3. Data Model & Schema

Core entities are defined in `supabase/migrations/`. Below is a concise reference.

### Transactions & spending

| Table | Purpose |
|-------|--------|
| **transaction_log** | Individual transactions: `date`, `category`, `counterparty`, `amount_usd`, `amount_gbp`, `currency` (TEXT; original transaction currency USD/GBP from sheet col F), `counterparty_dedup` (for upsert). Used for spending analysis, budget vs actual, cash runway net burn by currency, and AI tools. No unique constraint on dedup key (migration 012); sheet may contain duplicate rows. |
| **fx_rates** | Historical FX: `date` (PK), `gbpusd_rate`, `eurusd_rate`. |
| **fx_rate_current** | Current GBP/USD rate for display and conversions; single row per date. |

### Budgets & forecast

| Table | Purpose |
|-------|--------|
| **budget_targets** | One row per category: `annual_budget_gbp/usd`, `tracking_est_gbp/usd` (projected/“Tracking” from sheet), `ytd_gbp/usd`. Source of truth for current budget and forecast; synced from Google Sheet. |
| **budget_history** | Daily snapshots for Forecast Evolution: `date`, `category`, `annual_budget`, `forecast_spend`, `actual_ytd`; unique on `(date, category)`. Populated by cron and by “Refresh Data” (sync) so comparisons over time (e.g. “vs last week”) are possible. |

### Net worth & balances

| Table | Purpose |
|-------|--------|
| **account_balances** | Per-account balance snapshots: `date_updated`, `institution`, `account_name`, `category`, `currency`, `balance_personal_local`, `balance_family_local`, `balance_total_local`. Unique on `(institution, account_name, date_updated)`. |
| **historical_net_worth** | Time series of net worth by category: `date`, `category`, `amount_usd`, `amount_gbp`; unique on `(date, category)`. |
| **yoy_net_worth** | Year-over-year net worth by category (Year Start, Income, Expenses, etc.): `category`, `amount_usd`, `amount_gbp`. Used for YoY waterfall and start/end charts. |

### Trends & derived

| Table | Purpose |
|-------|--------|
| **annual_trends** | Per-category annual columns: `cur_yr_minus_4` … `cur_yr_est`, `cur_yr_est_vs_4yr_avg`. Synced from sheet. |
| **monthly_trends** | Per-category monthly columns: `cur_month_minus_3` … `cur_month_est`, `ttm_avg`, `z_score`, `delta_vs_l3m`. Synced from sheet. |
| **investment_return** | Income source label and manual amount (GBP) from “Investment Return” sheet tab. |

### Recurring & kids

| Table | Purpose |
|-------|--------|
| **recurring_payments** | Name, annualized amounts (GBP/USD), `needs_review`. Unique on `name`. |
| **recurring_preferences** | User preferences for counterparty patterns (e.g. “not a recurring payment”): `counterparty_pattern`, `is_ignored`. |
| **kids_accounts** | Per-child, per-account-type balances: `child_name`, `account_type`, `balance_usd`, `date_updated`, `notes`, `purpose`. Unique on `(child_name, account_type, date_updated, notes)`. |

### Sync metadata

| Table | Purpose |
|-------|--------|
| **sync_metadata** | Single row (`id = 1`): `last_sync_at` (timestamptz). Updated after every successful sync (cron or manual) via `recordLastSync()` in `lib/sync-metadata.ts`. Header “Last Refresh” and related copy read from this so they reflect cron runs as well as manual refresh. |

### RPCs

| Function | Purpose |
|----------|--------|
| **get_cash_runway_net_burn(p_start, p_end)** | Returns `gbp_net`, `usd_net`: net burn (expenses + refunds) per currency for date range. Filters: `category NOT IN ('Income', 'Excluded', 'Gift Money')`; USD = `currency IS NULL OR 'USD'`, GBP = `'GBP'`. Used by `GET /api/cash-runway`. |

---

## 4. Core Feature Specifications

### 4.0 Login (`/login`)

- **Purpose:** Unauthenticated users are redirected here by middleware; after sign-in, auth callback redirects to `/insights` (or back to `/login` with an error).
- **Flow:** Google sign-in button; redirects to Supabase OAuth then `/auth/callback`. Callback exchanges code for session; if email is not in `ALLOWED_EMAILS`, user is signed out and redirected to `/login?error=not_allowed`. If code exchange fails, redirect to `/login?error=auth_code_error`.
- **Already signed in:** If an allowed user visits `/login`, middleware redirects to `/insights`.

---

### 4.1 Dashboard (`/`)

- **At a glance:** Executive summary (e.g. net worth, budget gap, key KPIs); mobile uses horizontal scroll carousel.
- **Net worth chart:** Line chart of historical net worth (with optional entity filters: Personal/Family/Trust); mobile: reduced ticks and compact Y-axis.
- **Income vs expenses chart:** Budget vs tracking vs YTD; optional investment return; mobile: toggles can be hidden.
- **Budget table:** Categories with annual budget, tracking (forecast), YTD actual; variance and over/under budget. Optional **Full table view** toggle on Expenses: opens the expense tables in a full-screen overlay scaled to fit. See `docs/COMPACT-DATA-GRID.md`.
- **Annual trends table:** Current year vs prior years by category (GBP/USD via FX). Optional **Full table view** toggle: opens the table in a full-screen overlay scaled to fit (no scrolling).
- **Monthly trends table:** Current month vs prior months, TTM avg, z-score, delta vs last 3 months. Optional **Full table view** toggle (same behavior as Annual).
- **Navigation:** In-page anchors (Net Worth, Budget Table, Annual Trends, Monthly Trends) and “Back to top.”

### 4.2 Key Insights (`/insights`)

- **Key Insights:** Combined view of budget targets, annual/monthly trends, historical net worth, and latest account balances. Includes charts (e.g. net worth over time, pie by category), progress indicators, and “at a glance” style cards. Currency toggle (GBP/USD) and mobile-friendly layout.

### 4.3 Accounts (`/accounts`)

- **Accounts overview:** List/cards of account balances (by institution, account name, category, currency). Latest balance per account; optional grouping. Mobile: card layout instead of table.

### 4.4 Kids Accounts (`/kids`)

- **Kids accounts overview:** Balances by child and account type (USD), with notes and purpose. Data sourced from Google Sheet and synced into `kids_accounts`.

### 4.5 Recurring (`/recurring`)

- **Recurring payments:** Table and cards of recurring items (name, annualized amount, needs review). Data from sheet `recurring_payments`.
- **Recurring preferences:** Support for marking counterparty patterns as ignored (not recurring).

### 4.6 Analysis (`/analysis`)

- **Cash runway:** Cards/metrics showing how long funds last at current burn (based on balances and spending). Net burn (last 3 full calendar months) from `GET /api/cash-runway`, which calls RPC `get_cash_runway_net_burn` (expenses + refunds by currency; category excludes Income, Excluded, Gift Money).
- **Transaction analysis:** Filter by period (YTD/month) and category; view transactions and category totals.
- **Forecast evolution:**  
  - **Compare to:** Dropdown (Yesterday, Last Week, Last Month) to choose start date; end date defaults to today.  
  - **Forecast bridge chart:** Waterfall (stacked bar “invisible spacer” technique): Start total → category-level drivers (forecast deltas) → End total. Green = forecast down (gap improved), red = forecast up (gap worsened). Data from `budget_history` via `/api/forecast-bridge`.  
  - **Forecast gap over time:** Line chart of total budget gap (annual_budget − forecast_spend, expense categories only) over the selected date range. Data from `budget_history` via `GET /api/forecast-gap-over-time?startDate=&endDate=`.  
  - **Logic:** For start date and end date, load snapshots from `budget_history`; compute per-category `Spend_Delta = End_Forecast - Start_Forecast`; sort by absolute delta; top drivers (e.g. top 5 + Other) drive the waterfall.
- **YTD spend over time:** Cumulative spend chart (e.g. by category) over the year.
- **Annual cumulative spend:** Multi-year cumulative spend vs budget (optional year toggles; mobile may show fewer lines by default).
- **YoY net worth change:** Start/end chart and YoY net worth waterfall (income, expenses, transfers, etc.) from `yoy_net_worth`.

### 4.7 Chat / AI Assistant

- **Entry:** Floating chat button (mobile: above bottom nav); opens modal “Financial Assistant.” Auth timeout: `AuthTimeoutProvider` (inactivity 5 min or tab hidden 5 min) signs out and redirects to `/login`.
- **API:** `POST /api/chat` with AI SDK `streamText`, model Gemini 2.5 Flash; multi-step tool use (`maxSteps: 5`).
- **Tools:**
  1. **get_financial_snapshot** – Current or historical (`asOfDate`) net worth/balances; optional groupBy (currency, category, entity) and entity filter (Personal/Family/Trust). Uses `historical_net_worth` or `account_balances`.
  2. **analyze_spending** – Transactions over a date range; optional merchant, category, type (expenses/income/all), groupBy (category, merchant, month). Uses `transaction_log`; excludes non-expense categories unless requested.
  3. **get_budget_vs_actual** – Budget vs actual (YTD or annual) by category; over/under budget. Uses `budget_targets` and `transaction_log`.
  4. **analyze_forecast_evolution** – How forecasted annual spend (and thus budget gap) changed between two dates. Uses `budget_history` (with fallback: latest date ≤ endDate, then `budget_targets`). Computes per-category `Spend_Delta = End_Forecast - Start_Forecast`; sorts by |delta|; returns total forecast change, gap impact direction, and drivers (all in GBP); summary can be in GBP or USD via current FX.
- **System prompt:** Date context (today, “last month”, “this year”, etc.), capabilities (snapshots, spending, budget performance, forecast evolution), and rules (always use tools, format currency, no raw JSON).
- **UX:** Markdown responses, loading states, clear chat; errors surfaced in UI.

---

## 5. Integrations & External Services

### 5.1 Google Sheets

- **Role:** Single source of truth for balances, transactions, budgets, net worth, FX, trends, recurring, kids, investment return, YoY net worth. No direct user editing in the app; all such data is read from the sheet.
- **Config:** `GOOGLE_SPREADSHEET_ID` (required); Google API credentials (service account or OAuth) for the Sheets API.
- **Flow:**  
  - **Sync:** `lib/sync-google-sheet.ts` reads configured ranges/tabs, maps rows to table columns, and upserts into Supabase (batch-friendly; heavy tables like `transaction_log`, `fx_rates` processed sequentially). After a successful sync (cron or manual), `recordLastSync(supabase)` updates `sync_metadata.last_sync_at` (see `lib/sync-metadata.ts`); header “Last Refresh” reads from `sync_metadata`.  
  - **Triggers:** (1) **Cron:** `GET|POST /api/cron/refresh` at 06:00 UTC (see `vercel.json`) calls `syncGoogleSheet()`, `snapshotBudgetHistory(today)`, then `recordLastSync(admin)`; secured by `CRON_SECRET`. (2) **Manual:** Header “Refresh Data” calls `POST /api/sync`, which runs `syncGoogleSheet()`, `snapshotBudgetHistory(today)`, then `recordLastSync(supabase)`.  
- **Sheets → tables:** Account Balances → `account_balances`; Transaction Log → `transaction_log`; Budget Targets → `budget_targets`; Historical Net Worth → `historical_net_worth`; FX Rates / FX Rate Current → `fx_rates`, `fx_rate_current`; Annual/Monthly Trends → `annual_trends`, `monthly_trends`; Investment Return → `investment_return`; YoY Net Worth → `yoy_net_worth`; Recurring Payments → `recurring_payments`; Kids → `kids_accounts`. (No sheet tab for `sync_metadata`; it is app-only.)

### 5.2 Supabase

- **Auth:** Google OAuth; session in cookies; middleware and auth callback enforce allowlist and redirect to `/insights`.
- **Database:** All tables above; RLS may be in use—cron and server-side sync use server Supabase client (or service role if required for RLS bypass).

### 5.3 Google AI (Gemini)

- **Role:** Chat model for the Financial Assistant (`@ai-sdk/google`, `google('gemini-2.5-flash')`).
- **Flow:** User message → `/api/chat` → `streamText` with tools → tool executions (Supabase reads) → model summarizes in natural language; response streamed to the client.

### 5.4 Vercel (or similar)

- **Cron:** `vercel.json` defines a daily cron for `/api/cron/refresh` at `0 6 * * *` (06:00 UTC). Caller must send `Authorization: Bearer <CRON_SECRET>`.

### 5.5 API routes summary

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/chat` | POST | Financial Assistant; AI SDK `streamText`, tools, Gemini 2.5 Flash. |
| `/api/cron/refresh` | GET/POST | Cron-only; runs sync, budget history snapshot, `recordLastSync`. Secured by `CRON_SECRET`. |
| `/api/sync` | POST | Manual refresh; runs sync, budget history snapshot, `recordLastSync`. Requires auth. |
| `/api/forecast-bridge` | GET | Forecast evolution waterfall data; query params for start/end dates. |
| `/api/forecast-gap-over-time` | GET | Forecast gap (annual_budget − forecast_spend) per date in range; `startDate`, `endDate`. |
| `/api/cash-runway` | GET | Net burn (GBP/USD) for last 3 full calendar months via RPC `get_cash_runway_net_burn`. Requires auth. |

---

## 6. Unknowns / Areas for Improvement

- **FX fallbacks:** Multiple places use a hardcoded GBP/USD fallback when `fx_rate_current` is missing or zero (e.g. `1.27` in chat route and currency context, `1.25` in some trend wrappers). Consider a single shared constant or config and document the source (e.g. “last known rate” or “default for display only”).
- **GOOGLE_SPREADSHEET_ID:** Sync throws if unset; no in-app warning. Consider a health check or startup validation and clear docs for deployment.
- **ALLOWED_EMAILS:** Access is allowlist-only; stored in env. No in-app admin; adding/removing users requires env change and redeploy.
- **Cron secret:** If `CRON_SECRET` is not set, all cron requests are rejected (401). Document in README/deploy docs so Vercel (or other) cron is configured with the header.
- **Budget history coverage:** Forecast Evolution and chat “forecast evolution” depend on `budget_history` being populated (cron or manual refresh). If the sheet is never synced or history is sparse, comparisons may fail or return “no data”; consider empty-state messaging and prompting user to run Refresh Data.
- **sync_metadata:** If no sync has run yet, `last_sync_at` may be default or missing; header “Last Refresh” should handle empty state (e.g. “Never” or hide the label).
- **Mobile layout:** Several charts and tables switch to card layout or hide toggles on small screens; regression testing on real devices is recommended.
- **Error handling:** Some API and sync paths return generic messages; consider structured error codes or user-facing messages for quota, auth, and “no data” cases.
- **Types:** Some Supabase responses are cast (e.g. `as BudgetTarget[]`); shared types or codegen from schema could reduce drift.
- **No automated tests referenced in repo:** Adding unit tests for sync mapping, forecast-bridge logic, and chat tool execution would help prevent regressions.

---

*Document generated from codebase scan. Last updated: sync_metadata and “Last Refresh”; transaction_log.currency and get_cash_runway_net_burn RPC; forecast-gap-over-time API and chart; Login page and auth callback errors; AuthTimeoutProvider; API routes summary.*
