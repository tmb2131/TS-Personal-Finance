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
- `financial_assumptions` (app-only, one row per user; sustainable spending range + FI assumptions)
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
- `lib/account-totals.ts`: **the** source of total assets, liquid assets and cash.
  One `LIQUID_CATEGORIES` (Cash + Brokerage), one dedupe, one category
  normalization, one GBP conversion. Both the trust-inclusive and
  trust-exclusive bases derive from `totalAssetsGbp`. Never total accounts
  inline in a component — that is how three surfaces ended up with three
  answers for the same figure.
- `lib/app-sections.ts`: the five destinations and the section ids each renders,
  plus fragment aliases. `hrefResolves()` backs the drill-in link test; add new
  sections here in the same change.
- `lib/month-to-date.ts`: MTD spend vs this month's expected run rate, where the
  month's share of the year comes from history rather than a flat twelfth
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

54 files, numbered `001` through `051` — three numbers were used twice and the
colliding files carry a `b` suffix (`036b`, `037b`, `038b`).

**Next migration is `052_*.sql`.**

The remote ledger (`supabase_migrations.schema_migrations`) matches these
filenames exactly. Applying a migration through the MCP `apply_migration` tool
mints a `YYYYMMDDHHMMSS` version instead of a number — rewrite it to match the
filename afterwards, or the two drift apart.

Two migrations are outstanding and deliberately not applied:

- `030_add_budget_input_mode` — never ran. Leaves a dead
  `user_profiles.budget_input_mode` column and 115 `budget_targets` rows stuck
  on `data_source = 'google_sheet'`, which the CRUD routes will not let you
  edit. None belong to the primary user. Applying it mutates other users' rows.
- `036b_move_accounts_kids_recurring_to_app_inputs` — **do not apply.**
  Superseded by `048`; the accounts importer now writes `google_sheet` rows on
  purpose and scopes its delete-and-replace on that value.

See `supabase/migrations/README.md` for the full picture.

## Deployment

Configured for Vercel.

Current cron jobs in `vercel.json`:
- `0 6 * * *` -> `/api/cron/refresh`
- `30 23 * * *` -> `/api/cron/refresh`
- `0 9 * * 1` -> `/api/cron/ai-quality-report`

All cron routes require `Authorization: Bearer <CRON_SECRET>` and are enforced in `proxy.ts`.

## Pages & Navigation

Five destinations, flat — no grouping headers on desktop, no "More" sheet on
mobile (`components/sidebar.tsx`):

1. `Home` (`/`) — GBP available, budget status, net worth, 0-3 attention items
2. `Spending` (`/spending`) — today, budget table, transaction analysis, transactions, recurring
3. `Position` (`/position`) — accounts, net worth chart, cash runway, liquidity, sustainable spend, kids (hidden when empty)
4. `Trends` (`/trends`) — observations, forecast (period toggle, opens on "How it changed"), methodologies, YoY net worth, category trends, annual/monthly tables
5. `Settings` (`/settings`) — data sources, CSV import, category planning, assumptions, appearance, account

Header carries sync status, refresh, the currency chip, and quick add. Theme and
log out live in Settings. One floating button only: the AI assistant.

### Retired routes

All redirect; nothing 404s. Single-destination routes redirect in
`next.config.ts`. `/dashboard` and `/analysis` resolve on the client
(`components/nav/hash-redirect.tsx`) because their sections split across more
than one destination and a fragment never reaches the server. New pages reuse
the old section ids, so `/analysis#forecast-evolution` and
`/analysis?section=transaction-analysis&period=YTD` both still land correctly.

`/insights` → `/` · `/accounts` `/liquidity` `/kids` `/sustainable-spend` →
`/position` · `/transactions` `/recurring` `/today` → `/spending` · `/forecast`
→ `/trends` · `/import` → `/settings`

When adding or moving a route, update `lib/ai/app-knowledge.ts`, `PAGE_ALIASES`
in the same file, `lib/ai/evals/app-instructions-cases.ts`, and
`docs/AI-PAGE-COVERAGE-MATRIX.md` in the same change — the assistant's routing
breaks otherwise. Verify with `npm run eval:app-instructions`.

## Design System

Defined in `app/globals.css` and wired through `tailwind.config.ts`. The header
comment in `globals.css` is the canonical statement; this is the summary.

**Surfaces, not outlines.** Four planes — `background` (canvas), `card`,
`raised`, `sunken` — plus a hairline `border` and a heavier `border-strong`.
Depth is tonal first and shadowed second, because a shadow is invisible on the
dark ground. Use the `.surface-card` / `.surface-raised` / `.surface-sunken`
classes, or the `Card` variants that wrap them, rather than assembling
`border + bg + shadow` by hand.

**Never nest a bordered card inside a bordered card.** Two concentric rounded
borders is the single most dating detail in a dashboard. A panel inside a card
takes `<Card variant="flush">`; a table or totals row inside a card takes
`variant="sunken"`.

**Three faces, three jobs.**
- `.editorial` (Instrument Serif) — page titles and the one hero figure per
  page. One weight, hairline serifs: never use it below the figure step.
- `.figure` (Archivo) — every working number: KPI values, table cells, totals.
- Inter — everything else.

**One type scale**, six steps: `--text-display` / `heading` / `figure` /
`title` / `body` / `meta`, available as `text-display` … `text-meta` and as
`.type-*` classes. `heading` exists so a page title outranks the KPI values
under it. Do not reach for a raw Tailwind size step, and do not put a size
override on `CardTitle`.

**Colour is rationed, not banned.**
- `primary` (teal) is the brand and lives on chrome — buttons, focus rings,
  active nav, links, and proportion bars. It is deliberately far in hue from
  both semantic colours so it never reads as a status.
- `positive` / `negative` mean over or under, and nothing else. Each has a solid
  and a 12% `-tint`.
- `chart-1` … `chart-6` are the ordered series ramp, kept clear of the semantic
  pair so a series colour is never mistaken for a verdict.
- There are **no hard-coded hex colours or `green-*` / `red-*` / `blue-*`
  classes** in `components/`; do not add any. Charts read colour from
  `useChartTheme()` (which resolves the tokens) or from `hsl(var(--token))`
  string literals — `var()` resolves correctly in Recharts fills.

**`.num` on every currency and percentage figure** for tabular figures. `"tnum"`
is deliberately not set globally on `body`. `TableCell numeric` / `TableHead
numeric` sets alignment and tabular figures together.

**`.meter` / `.meter-fill`** is the one proportion bar. A bar that clamps at
100% reports nothing an adjacent sentence has not already said — where a value
can exceed its reference, span the meter across the larger of the two and draw
the overshoot to scale.

**No gradients** except `.scroll-fade-right`, a real scroll-overflow affordance.

## API Routes

### Core
- `POST /api/chat`
- `POST /api/sync`
- `GET|POST /api/cron/refresh`
- `GET|POST /api/cron/ai-quality-report`
- `GET /api/ai/quality-report`

### Forecast/Analysis
- `GET /api/cash-runway` — one currency-independent burn: trailing-12-full-month
  mean of all expense cash flow in GBP (`get_cash_runway_total_burn`). Never
  split the runway denominator by the currency an account is held in.
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
- `GET|PUT /api/financial-assumptions`
- `POST /api/import/csv`

## Component Organization

Key folders:
- `components/dashboard/`
- `components/analysis/`
- `components/insights/`
- `components/sustainable-spend/`
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

This is the **default** for every change, not a command that has to be asked
for. Finish a piece of work, then ship it without waiting to be told:

1. Run `npm run build`, plus `npx tsc --noEmit`, `npm run lint` and `npm test`.
2. If anything fails, fix it and re-run until green.
3. Stage changes.
4. Commit with a concise message explaining why, not just what.
5. Push directly to `main`, rebasing onto `origin/main` first if it has moved.
   Never force-push.

Only hold off when the change is genuinely unfinished, or when it needs a
decision that has not been made yet — in which case say so rather than
leaving work sitting uncommitted.
