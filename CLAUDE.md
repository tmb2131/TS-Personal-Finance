# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Findash** (displayed as "TS Personal Finance") is a Next.js 16 personal finance dashboard that syncs data from Google Sheets and displays net worth tracking, budget analysis, spending trends, and includes an AI financial assistant powered by Google Gemini.

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
- `historical_net_worth`: Net worth snapshots over time
- `annual_trends`: Year-over-year spending patterns
- `monthly_trends`: Month-over-month spending with Z-scores
- `kids_accounts`: Children's account balances
- `debt`: Debt tracking (mortgages, loans, credit cards) with dual currency amounts
- `recurring_payments`: Detected recurring payment patterns
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

## Key Files

- `lib/sync-google-sheet.ts`: Google Sheets sync service (transform functions, batching logic)
- `lib/types.ts`: TypeScript interfaces for all data models
- `lib/allowed-emails.ts`: Email allowlist for auth (if used)
- `app/actions.ts`: Server actions (syncData)
- `app/api/chat/route.ts`: AI assistant streaming endpoint
- `app/api/cron/refresh/route.ts`: Scheduled sync endpoint
- `supabase/migrations/001_initial_schema.sql`: Database schema
- `components/app-shell.tsx`: Main layout wrapper with sidebar/header
- `lib/contexts/currency-context.tsx`: Global currency state (GBP/USD)

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

Run migrations in Supabase SQL Editor:
```sql
-- Copy contents from supabase/migrations/001_initial_schema.sql
```

Subsequent migrations should follow the pattern `00N_description.sql`.

## Deployment

Configured for Vercel:
1. Push to GitHub
2. Import in Vercel
3. Add environment variables
4. Set `CRON_SECRET` for scheduled syncs (cron runs at 6am & 11:30pm UTC)

`vercel.json` contains cron configuration for automatic data refresh.

## Component Organization

```
components/
├── ui/              # Shadcn/UI primitives (button, dialog, card, etc.)
├── dashboard/       # Dashboard page components (charts, tables)
├── accounts/        # Accounts page components
├── analysis/        # Analysis page components
├── insights/        # Key Insights page components
├── settings/        # Settings page components
├── ai-assistant/    # AI chat widget
├── app-shell.tsx    # Main layout with sidebar
├── header.tsx       # Top header with sync button
└── sidebar.tsx      # Navigation sidebar
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
