# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working Directory

Always edit files in `/Users/tombrosens/findash`. Never use git worktrees or worktree paths.

## Project Overview

**Findash** (displayed as "TS Personal Finance") is a Next.js 16 personal finance dashboard that syncs data from Google Sheets and displays net worth tracking, budget analysis, spending trends, liquidity monitoring, recurring payment detection, and includes an AI financial assistant powered by Google Gemini.

## Development Commands

```bash
# Development server (uses webpack instead of turbopack)
npm run dev

# Production build
npm run build

# Start production server
npm start

# Linting
npm run lint
```

## Tech Stack & Architecture

- **Framework**: Next.js 16+ with App Router (TypeScript)
- **UI**: Tailwind CSS + Shadcn/UI (Radix primitives)
- **Charts**: Recharts
- **Database**: Supabase (PostgreSQL) with Row Level Security (RLS)
- **Auth**: Supabase Auth (Google OAuth)
- **AI**: Google Gemini 2.5 Flash (via @ai-sdk/google)
- **Data Source**: Google Sheets API v4 (source of truth)
- **Analytics**: Vercel Analytics
- **Dates**: date-fns
- **Toasts**: Sonner
- **Markdown**: react-markdown + remark-gfm (used in AI chat)

## Key Architecture Patterns

### Data Flow
1. **Source of Truth**: Google Sheets → contains all financial data (accounts, transactions, budgets, etc.)
2. **Sync Service**: `lib/sync-google-sheet.ts` pulls data from Google Sheets
3. **Database**: Supabase stores synced data with user isolation via RLS
4. **Components**: Server Components fetch data directly from Supabase; Client Components use hooks/contexts

### User Data Isolation
- Each user's data is isolated using `user_id` foreign keys in most tables
- Exception: `fx_rates` and `fx_rate_current` are global tables (no user_id)
- RLS policies enforce per-user access
- User can connect their own Google Sheet via Settings page

### Multi-Currency Support
- Global `CurrencyContext` (GBP/USD toggle) persists in localStorage
- All financial displays respect current currency selection
- FX rates stored in database for historical conversions

### Google Sheets Sync
- **Manual**: User clicks "Sync Data" button → calls `syncData()` server action
- **Automatic**: Optional cron jobs (6am & 11:30pm UTC) via `/api/cron/refresh`
- **Batching**: Large tables (transaction_log, fx_rates) processed sequentially in 1000-row chunks
- **Transform Functions**: Each sheet tab has a transform function in SHEET_CONFIGS array

### AI Assistant
- Chat widget (floating button) streams responses from `/api/chat/route.ts`
- Uses Google Gemini with structured tool calling (Zod schemas)
- Tools fetch live data from Supabase and can optionally search web (Serper API)
- Date context is computed server-side to handle relative dates ("last month", "this year")

## Database Tables

Core tables (user-scoped):
- `account_balances`: Current account balances by institution/category with liquidity/risk/horizon profiles
- `transaction_log`: Historical transactions (income/expenses)
- `budget_targets`: Annual budget targets by category
- `budget_history`: Historical budget snapshots
- `historical_net_worth`: Net worth snapshots over time
- `yoy_net_worth`: Year-over-year net worth comparisons
- `annual_trends`: Year-over-year spending patterns
- `monthly_trends`: Month-over-month spending with Z-scores
- `kids_accounts`: Children's account balances
- `debt`: Debt tracking (mortgages, loans, credit cards) with dual currency amounts
- `recurring_payments`: Detected recurring payment patterns
- `recurring_preferences`: User preferences for recurring payment detection
- `investment_return`: Investment return tracking
- `sync_metadata`: Sync operation metadata and tracking
- `user_profiles`: Stores user's Google Sheet ID and settings

Global tables (no user_id):
- `fx_rates`: Historical FX rates
- `fx_rate_current`: Current FX rate

## Google Sheet Structure

Expected tabs:
1. **Account Balances**: Institution, Account Name, Category, Currency, Balances (Personal/Family/Total), Profiles (Liquidity/Risk/Horizon)
2. **Transaction Log**: Date, Category, Counterparty, Amounts (USD/GBP), Currency
3. **Budget Targets**: Category, Annual Budgets (GBP/USD), YTD tracking
4. **Historical Net Worth**: Date, Category, Amounts (USD/GBP)
5. **FX Rates**: Historical exchange rates
6. **FX Rate Current**: Current GBP/USD rate
7. **Annual Trends**: 5-year spending patterns by category
8. **Monthly Trends**: Last 3 months + current month estimates with Z-scores
9. **Kids**: Children's accounts (name, type, balance, notes)
10. **Debt**: Type, Name, Purpose, Amounts (GBP/USD), Date Updated
11. **Budget History**: Historical budget snapshots
12. **YoY Net Worth**: Year-over-year net worth comparisons
13. **Investment Return**: Investment return data
14. **Recurring Payments**: Detected recurring payment patterns

## Key Files

- `lib/sync-google-sheet.ts`: Google Sheets sync service (transform functions, batching logic)
- `lib/sync-metadata.ts`: Sync metadata tracking
- `lib/types.ts`: TypeScript interfaces for all data models
- `lib/allowed-emails.ts`: Email allowlist for auth (if used)
- `lib/analysis-url.ts`: Analysis URL utilities
- `lib/snapshot-budget-history.ts`: Budget history snapshot logic
- `lib/chart-styles.ts`: Consistent chart color palette for Recharts
- `lib/utils/detect-recurring-payments.ts`: Recurring payment detection logic
- `lib/utils/fx-rates.ts`: FX rate utilities
- `lib/utils/chart-format.ts`: Chart formatting utilities
- `lib/contexts/currency-context.tsx`: Global currency state (GBP/USD)
- `lib/contexts/auth-timeout-provider.tsx`: Auth timeout provider
- `lib/hooks/use-is-mobile.ts`: Mobile detection hook
- `app/actions.ts`: Server actions (syncData)
- `app/manifest.ts`: PWA manifest configuration
- `app/api/chat/route.ts`: AI assistant streaming endpoint
- `app/api/cron/refresh/route.ts`: Scheduled sync endpoint
- `app/api/sync/route.ts`: Sync API endpoint
- `app/api/forecast-bridge/route.ts`: Budget forecast bridge/waterfall analysis
- `app/api/cash-runway/route.ts`: Cash runway calculation
- `app/api/forecast-gap-over-time/route.ts`: Forecast gap timeline data
- `proxy.ts`: Middleware/proxy configuration
- `components/app-shell.tsx`: Main layout wrapper with sidebar/header
- `supabase/migrations/`: 22 migration files (001 through 022)

## Environment Variables

Required:
```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
```

Optional:
```bash
CRON_SECRET=  # For scheduled sync (Bearer auth)
SERPER_API_KEY=  # For AI web search
```

## Database Migrations

Run migrations in Supabase SQL Editor. There are currently 22 migrations (001 through 022):
```sql
-- Copy contents from supabase/migrations/00N_description.sql
```

New migrations should follow the pattern `00N_description.sql` (next: `023_*.sql`).

## Deployment

Configured for Vercel:
1. Push to GitHub
2. Import in Vercel
3. Add environment variables
4. Set `CRON_SECRET` for scheduled syncs (cron runs at 6am & 11:30pm UTC)

`vercel.json` contains cron configuration for automatic data refresh.

## Pages & Navigation

The sidebar navigation order (defined in `components/sidebar.tsx`):
1. **Key Insights** (`/insights`) — Primary landing page with KPIs, daily summary, sheet connection
2. **Dashboard** (`/`) — Net worth charts, budget overview, spending trends
3. **Accounts** (`/accounts`) — Account balances by institution/category
4. **Liquidity** (`/liquidity`) — Cash position, debt tracking, liquidity distribution, committed capital vs liquidity
5. **Kids Accounts** (`/kids`) — Children's account balances
6. **Analysis** (`/analysis`) — Detailed spending analysis, forecast bridge, category breakdowns
7. **Recurring** (`/recurring`) — Detected recurring payments and subscriptions
8. **Settings** (`/settings`) — Google Sheet connection, sync preferences

## API Routes

- `POST /api/chat` — AI assistant streaming endpoint (Gemini + tool calling)
- `GET /api/cron/refresh` — Scheduled sync endpoint (Bearer auth via CRON_SECRET)
- `POST /api/sync` — Manual sync endpoint
- `GET /api/forecast-bridge` — Budget forecast bridge/waterfall analysis
- `GET /api/cash-runway` — Cash runway calculation (net burn last 3 months)
- `GET /api/forecast-gap-over-time` — Forecast gap timeline data

## Component Organization

```
components/
├── ui/              # Shadcn/UI primitives (button, dialog, card, empty-state, etc.)
├── dashboard/       # Dashboard page components (charts, tables) — 19 files
├── accounts/        # Accounts page components
├── analysis/        # Analysis page components — 16 files
├── insights/        # Key Insights page (KPIs, daily summary, navigation, connect-sheet modal)
├── liquidity/       # Liquidity page (KPIs, committed capital vs liquidity, monthly expenses vs liquidity, debt overview, distribution)
├── kids/            # Kids accounts page
├── recurring/       # Recurring payments page (detection, table)
├── settings/        # Settings page components
├── ai-assistant/    # AI chat widget
├── app-shell.tsx    # Main layout with sidebar
├── header.tsx       # Top header with sync button
├── sidebar.tsx      # Navigation sidebar
├── kpi-card.tsx     # Reusable KPI card component
├── currency-toggle.tsx  # GBP/USD currency switcher
└── login-header.tsx # Login page header
```

## Authentication Flow

1. User clicks "Sign in with Google" on `/login`
2. Supabase Auth redirects to Google OAuth
3. Callback at `/auth/callback` exchanges code for session
4. RLS policies filter all queries by authenticated user ID
5. Email restrictions can be enforced in `lib/allowed-emails.ts`

## Styling Conventions

- Tailwind CSS with custom HSL-based color system (defined in globals.css)
- Dark mode support via `class` strategy (toggle not yet implemented in UI)
- Responsive: mobile-first with `md:` and `lg:` breakpoints
- Chart colors: Defined in `lib/chart-styles.ts` (consistent palette across Recharts)
- Chart formatting: Shared utilities in `lib/utils/chart-format.ts`

## Other Directories

- `utils/cn.ts`: Tailwind `cn()` merge utility (clsx + tailwind-merge)
- `docs/`: Planning documents and PRDs (`PRD.md`, mobile UI recommendations, scaling notes, etc.)

## Liquidity Page Definitions

The Liquidity page uses two different classification systems from `account_balances`:

### Category-based (from `category` column)
- **Cash**: `category === 'Cash'`
- **Liquid Assets**: `category === 'Cash' || category === 'Brokerage'`

### Liquidity profile-based (from `liquidity_profile` column)
- **Instant**: `liquidity_profile === 'Instant'`
- **Within 6 Months**: `liquidity_profile === 'Within 6 Months'`
- **Locked Up**: `liquidity_profile === 'Locked Up'`

Note: Cash (category-based) may overlap with Instant (profile-based). Instant and Within 6 Months do not overlap.

### Charts
- **KPIs**: Total Cash, Liquid Assets (Cash + Brokerage), Instant Liquidity
- **Committed Capital vs. Liquidity**: 4 bars — Committed Capital (from `debt` table), Cash, Instant, Within 6 Months
- **Monthly Expenses vs. Liquidity**: 4 bars — Monthly Expenses (avg net spend over last 3 full months, excl. income & gifts), Cash, Instant, Liquid
- **Liquidity Distribution**: Pie chart by `liquidity_profile` (color-coded: Instant=emerald, Within 6 Months=blue, Locked Up=slate)
- **Debt vs Assets**: Total debt vs total assets (excludes Trust category from assets; shows "Assets exclude Trust" subtext when Trust exists)

## Common Tasks

### Adding a new data table
1. Add sheet config to SHEET_CONFIGS array in `lib/sync-google-sheet.ts`
2. Add interface to `lib/types.ts`
3. Create migration in `supabase/migrations/`
4. Add user_id column and RLS policies (unless global table)

### Adding a new page
1. Create route in `app/[page-name]/page.tsx`
2. Add navigation link in `components/sidebar.tsx`
3. Follow pattern: server component for data fetching, client components for interactivity

### Modifying AI assistant tools
1. Edit tool schemas in `/api/chat/route.ts` (Zod definitions)
2. Update system prompt to guide tool usage
3. Test with various natural language queries

### Debugging sync issues
1. Check browser console for sync errors
2. Verify Google Sheet ID in Settings
3. Confirm service account has access to sheet
4. Check Supabase logs for database errors
5. Review transform functions in sync-google-sheet.ts for data parsing issues
