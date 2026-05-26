# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working Directory

Always edit files in `/Users/tombrosens/findash`. Never use git worktrees or worktree paths.

## Project Overview

**Findash** (in-app: **TS Personal Finance**) is a Next.js 16 personal finance app with:
- Google Sheets sync for selected source tabs
- In-app manual CRUD for key financial datasets
- CSV transaction import
- Derived calculations for trends, forecast evolution, historical net worth, and YoY net worth
- AI assistant powered by Gemini with tool-calling + telemetry

## Development Commands

```bash
# Development server (webpack mode)
npm run dev

# Production build
npm run build

# Start production server
npm start

# Lint
npm run lint

# Evaluate app instruction quality dataset
npm run eval:app-instructions
```

## Tech Stack

- Framework: Next.js 16+ (App Router, TypeScript)
- UI: Tailwind CSS + Shadcn/UI (Radix primitives)
- Charts: Recharts
- Theme: `next-themes` (light/dark/system)
- Database/Auth: Supabase (PostgreSQL + RLS, Google OAuth)
- AI: Gemini 2.5 Flash via `@ai-sdk/google`
- Data sync: Google Sheets API v4 (`googleapis`)
- CSV import: `papaparse`
- Markdown rendering: `react-markdown` + `remark-gfm`
- Analytics: Vercel Analytics

## Key Architecture Patterns

### Hybrid Data Flow

1. Google Sheets sync populates source-backed tables (accounts, transactions, FX, kids, recurring, investment return)
2. App-managed flows handle manual CRUD (budgets, debt, net worth overrides, and manual rows across multiple tables)
3. CSV imports append `transaction_log` rows with `data_source='csv'`
4. Derived rebuilds compute:
   - `historical_net_worth` (`app_generated`) from account history
   - `yoy_net_worth` forecast bridge (prior Dec 31 → forecast Dec 31): full-year income/gift/expense forecasts, YTD FX translation, YTD investment return held flat; metadata in `sync_metadata.yoy_bridge_meta`
   - annual/monthly trends in-memory via `computeAnnualTrends` / `computeMonthlyTrends`

### Data Source Guardrails

- Many CRUD routes enforce `data_source === 'manual'` for edit/delete.
- Sync deletes/replaces only `google_sheet` scoped rows where appropriate.
- Derived builders preserve manual overrides (for historical net worth).

### Forecast Evolution (Latest Build)

- Uses rollback computation from:
  - `forecast_settings_history`
  - `budget_targets_history`
  - `transaction_log`
- Implemented in `lib/forecast-evolution.ts`.
- APIs:
  - `GET /api/forecast-bridge`
  - `GET /api/forecast-gap-over-time`
  - `GET /api/forecast-snapshots`

### Sync Lifecycle

- Manual sync: `POST /api/sync`
- Cron sync: `GET|POST /api/cron/refresh` (CRON_SECRET required)
- On success, server rebuilds historical net worth + YoY net worth and records `sync_metadata.last_sync_at`.

## Database Tables

### User-Scoped Core Tables

- `user_profiles`
- `sync_metadata`
- `account_balances` (`data_source`)
- `transaction_log` (`data_source`)
- `budget_targets` (`data_source`, app-managed)
- `forecast_settings`
- `forecast_settings_history`
- `budget_targets_history`
- `budget_history` (legacy snapshot table)
- `historical_net_worth` (`data_source`: `app_generated` or `manual`)
- `yoy_net_worth` (derived)
- `debt` (app-only, manual)
- `kids_accounts` (`data_source`)
- `recurring_payments` (`data_source`)
- `recurring_preferences`
- `investment_return` (`data_source`)
- `ai_chat_telemetry`

### Global Tables

- `fx_rates`
- `fx_rate_current`
- `ai_quality_reports` (service-generated weekly reports)

### Removed Legacy Tables

- `annual_trends` and `monthly_trends` were dropped in migration `029`; trends are now computed from transactions/forecast logic.

## Google Sheet Structure (Current Sync Tabs)

Expected tabs in current build:
1. `Account Balances`
2. `Transaction Log`
3. `FX Rates`
4. `FX Rate Current`
5. `Kids`
6. `Investment Return`
7. `Recurring Payments`

Not synced from sheet anymore:
- `Budget Targets`
- `Debt`
- `Historical Net Worth`
- `Annual Trends`
- `Monthly Trends`
- `YoY Net Worth`

## Key Files

- `lib/sync-google-sheet.ts`: Google Sheets sync mappings + per-table merge strategy
- `lib/forecasting.ts`: Annual/monthly trend + forecast computation
- `lib/forecast-evolution.ts`: rollback-based forecast snapshots and gap series
- `lib/snapshot-historical-net-worth.ts`: rebuild app-generated historical net worth
- `lib/yoy-net-worth.ts`: rebuild YoY forecast Dec 31 bridge (full-year flows + YTD FX + YTD investment held flat)
- `lib/csv-parser.ts`: CSV detection/parsing helpers
- `app/api/chat/route.ts`: AI tools + telemetry logging + optional web search tool
- `app/api/import/csv/route.ts`: CSV import endpoint
- `app/api/category-planning/route.ts`: budget + forecast settings editor API
- `app/api/net-worth-history/route.ts`: manual historical net worth overrides
- `app/api/cron/refresh/route.ts`: scheduled sync + derived rebuilds
- `app/api/cron/ai-quality-report/route.ts`: scheduled AI quality report generation
- `components/settings/category-planning-section.tsx`: category planning UI
- `components/import/csv-upload.tsx`: CSV import flow UI
- `components/dashboard/edit-net-worth-history-dialog.tsx`: yearly net worth editor
- `proxy.ts`: auth + cron authorization middleware

## Environment Variables

Required:
```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=         # required for admin cron/report routes
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
```

Optional:
```bash
CRON_SECRET=                       # required to authorize cron endpoints
SERPER_API_KEY=                    # enables chat search_web tool
ALLOWED_EMAILS=                    # helper exists but not wired into auth flow
```

## Database Migrations

There are currently **37** migrations (`001` through `037`).

Next migration should be `038_*.sql`.

## Deployment

Configured for Vercel.

Current cron jobs in `vercel.json`:
- `0 6 * * *` -> `/api/cron/refresh`
- `30 23 * * *` -> `/api/cron/refresh`
- `0 9 * * 1` -> `/api/cron/ai-quality-report`

All cron routes require `Authorization: Bearer <CRON_SECRET>` and are enforced in `proxy.ts`.

## Pages & Navigation

Sidebar order (`components/sidebar.tsx`):
1. `Daily Summary` (`/`)
2. `Key Insights` (`/insights`)
3. `Dashboard` (`/dashboard`)
4. `Today` (`/today`)
5. `Accounts` (`/accounts`)
6. `Transactions` (`/transactions`)
7. `Liquidity` (`/liquidity`)
8. `Kids Accounts` (`/kids`) - hidden if no kids data
9. `Analysis` (`/analysis`)
10. `Forecast` (`/forecast`)
11. `Recurring` (`/recurring`)
12. `Import` (`/import`)
13. `Settings` (`/settings`)

## API Routes

### Core
- `POST /api/chat`
- `POST /api/sync`
- `GET|POST /api/cron/refresh`
- `GET|POST /api/cron/ai-quality-report`
- `GET /api/ai/quality-report`

### Forecast/Analysis
- `GET /api/cash-runway`
- `GET /api/forecast-bridge`
- `GET /api/forecast-gap-over-time`
- `GET /api/forecast-snapshots`
- `POST /api/yoy-net-worth/rebuild`

### Data Management
- `POST /api/accounts`, `PATCH|DELETE /api/accounts/[id]`
- `POST /api/transactions`, `PATCH|DELETE /api/transactions/[id]`
- `GET|POST /api/budgets`, `PATCH|DELETE /api/budgets/[id]`
- `GET|PUT /api/category-planning`
- `POST /api/debt`, `PATCH|DELETE /api/debt/[id]`
- `POST /api/kids`, `PATCH|DELETE /api/kids/[id]`
- `POST /api/recurring`, `PATCH|DELETE /api/recurring/[id]`
- `GET|POST /api/investment-returns`, `PATCH|DELETE /api/investment-returns/[id]`
- `GET|PUT /api/net-worth-history`
- `POST /api/import/csv`

## Component Organization

Key folders:
- `components/dashboard/`
- `components/analysis/`
- `components/insights/`
- `components/liquidity/`
- `components/accounts/`
- `components/budgets/`
- `components/transactions/`
- `components/kids/`
- `components/recurring/`
- `components/import/`
- `components/settings/`
- `components/ai-assistant/`
- `components/ui/`

## Authentication Flow

1. User signs in at `/login` via Google OAuth.
2. `/auth/callback` exchanges auth code for session.
3. Profile row is upserted in `user_profiles`.
4. New users are seeded with dummy sheet ID and background sync starts.
5. Middleware (`proxy.ts`) protects routes and redirects signed-in users away from `/login`.

## Styling Conventions

- Tailwind CSS with custom tokens in `app/globals.css`
- Theme support via `next-themes` (`system`/`light`/`dark`)
- Mobile-first responsive layout
- Shared chart styles in `lib/chart-styles.ts`

## Common Tasks

### Add a New App-Managed Dataset
1. Create migration (`036_*.sql` onward).
2. Add RLS policies (`user_id` scoped unless global).
3. Add TypeScript types in `lib/types.ts`.
4. Add API route(s) under `app/api/...` as needed.
5. Add UI components and wire into pages/sidebar.
6. Decide `data_source` semantics and edit/delete guardrails.

### Add a New Sync Tab
1. Add mapping in `SHEET_CONFIGS` (`lib/sync-google-sheet.ts`).
2. Add transform + upsert/delete strategy.
3. Confirm table constraints/indexes support sync behavior.
4. Update docs (CLAUDE.md and PRD.md).

### Modify AI Assistant Tools
1. Edit `app/api/chat/route.ts` tool schemas and execute handlers.
2. Update system prompt tool instructions.
3. Ensure telemetry quality flags still classify outcomes correctly.

### Debug Sync Issues
1. Verify `google_spreadsheet_id` in `user_profiles`.
2. Confirm service account has Viewer access to the sheet.
3. Inspect `/api/sync` response and server logs.
4. Validate tab names match `SHEET_CONFIGS` exactly.
5. Check derived rebuild logs for historical/yoy recomputation.

## Automation Shortcuts

### shipit
1. Run `npm run build`.
2. If build fails, fix errors and re-run until green.
3. Stage changes.
4. Commit with concise message.
5. Push directly to `main`.
