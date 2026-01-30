# TS Personal Finance - Product Requirements Document

**Version:** 1.4  
**Last Updated:** January 28, 2026  
**Status:** Active Development

---

## 1. Project Overview

**TS Personal Finance** is a modern, web-based personal finance dashboard that provides comprehensive financial tracking, analysis, and insights. The application aggregates financial data from Google Sheets (acting as the source of truth) and presents it through an intuitive, data-rich interface with multi-currency support, budget tracking, trend analysis, and net worth visualization.

### Key Value Propositions
- **Single Source of Truth**: Google Sheets integration ensures data consistency
- **Real-time Insights**: Quick overview of financial performance and trends
- **Multi-Currency Support**: Seamless switching between GBP and USD
- **Comprehensive Analysis**: Year-over-year trends, monthly patterns, and transaction-level analysis
- **Visual Data Representation**: Charts, tables, and visual indicators for quick comprehension

---

## 2. Tech Stack

### Frontend Framework
- **Next.js 16.1.6** (App Router)
- **React 18.3.0**
- **TypeScript 5.3.3**

### Styling & UI
- **Tailwind CSS 3.4.1** - Utility-first CSS framework
- **Shadcn/UI** - Component library built on Radix UI primitives
- **Radix UI Components**:
  - `@radix-ui/react-checkbox` ^1.3.3
  - `@radix-ui/react-dialog` ^1.0.5
  - `@radix-ui/react-dropdown-menu` ^2.0.6
  - `@radix-ui/react-label` ^2.0.2
  - `@radix-ui/react-select` ^2.0.2
  - `@radix-ui/react-separator` ^1.0.3
  - `@radix-ui/react-slot` ^1.0.2
  - `@radix-ui/react-tabs` ^1.0.4
- **Lucide React** ^0.344.0 - Icon library

### Data Visualization
- **Recharts** ^2.10.0 - Charting library for React

### Backend & Database
- **Supabase** (PostgreSQL)
  - `@supabase/ssr` ^0.8.0 - Server-side rendering support
  - `@supabase/supabase-js` ^2.39.0 - JavaScript client

### External Integrations
- **Google Sheets API** (`googleapis` ^129.0.0) - Data synchronization

### Utilities
- **clsx** ^2.1.0 - Conditional class names
- **tailwind-merge** ^2.2.0 - Merge Tailwind classes
- **class-variance-authority** ^0.7.0 - Component variants
- **date-fns** ^3.0.0 - Date manipulation
- **sonner** ^2.0.7 - Toast notification library for user feedback

### Development Tools
- **ESLint** ^8.56.0
- **PostCSS** ^8.4.33
- **Autoprefixer** ^10.4.17

---

## 3. System Architecture

### 3.1 Data Flow

```
Google Sheets (Source of Truth)
    ↓
Google Sheets API (Service Account Auth)
    ↓
Next.js API Route (/api/sync)
    ↓
Supabase PostgreSQL Database
    ↓
Next.js Server Components / Client Components
    ↓
React UI (Shadcn/UI + Recharts)
```

### 3.2 Authentication Flow

**Current Implementation: Developer Bypass (Password Login)**

1. **Login Page** (`/app/login/page.tsx`):
   - Pre-filled credentials: `admin@findash.com` / `123456`
   - Uses `supabase.auth.signInWithPassword()` (not Magic Links)
   - On success: `router.refresh()` + `router.push('/insights')`
   - Includes console logging for debugging

2. **Route Protection** (`/proxy.ts`):
   - Next.js 16 compliant proxy function (replaces deprecated `middleware.ts`)
   - Protects all routes except `/login` and `/auth`
   - Email-based access control via `ALLOWED_EMAILS` environment variable:
     - `thomas.brosens@gmail.com`
     - `sriya.sundaresan@gmail.com`
     - `admin@findash.com` (Developer bypass)
   - Redirects authenticated users from `/login` to `/insights`
   - Redirects unauthenticated users to `/login`
   - Uses Supabase SSR client for server-side authentication

3. **OAuth Callback** (`/app/auth/callback/route.ts`):
   - Handles Supabase OAuth callbacks
   - Exchanges auth codes for sessions
   - Sets cookies on redirect response

**Note:** Magic Link authentication was previously implemented but replaced with password-based login for developer convenience. Future roadmap includes restoring Magic Link functionality.

### 3.3 Data Synchronization

**Sync Process** (`/lib/sync-google-sheet.ts`):

1. **Authentication**: Google Service Account credentials from environment variables
2. **Configuration**: Spreadsheet ID retrieved from `GOOGLE_SPREADSHEET_ID` environment variable (externalized from hardcoded value)
3. **Sheet Discovery**: Fetches available sheets to verify existence
4. **Data Extraction**: Reads data from configured ranges for each sheet
5. **Transformation**: Maps Google Sheets rows to database schema
6. **Upsert Logic**: 
   - Uses conflict resolution based on table structure
   - Handles deduplication (e.g., FX Rates by date)
   - Handles institution name changes by pre-deleting old records before upsert
   - Validates and filters empty rows

**Sync API Endpoint** (`/app/api/sync/route.ts`):
- POST endpoint requiring authentication
- Calls `syncGoogleSheet()` function
- Returns success/error status with detailed results

**Google Sheets Configuration**:
- Spreadsheet ID: Externalized to `GOOGLE_SPREADSHEET_ID` environment variable
- Configured Sheets:
  1. Account Balances (A:H)
  2. Transaction Log (A:E)
  3. Budget Targets (A:H)
  4. Historical Net Worth (A:D)
  5. FX Rates (A:C)
  6. FX Rate Current (A:B)
  7. Annual Trends (A:G)
  8. Monthly Trends (A:H)
  9. YoY Net Worth (A:C)

---

## 4. Database Schema

### 4.1 Tables

#### `account_balances`
Tracks account balances by institution, account name, and category.

**Columns:**
- `id` (UUID, Primary Key)
- `date_updated` (TIMESTAMP WITH TIME ZONE)
- `institution` (TEXT)
- `account_name` (TEXT)
- `category` (TEXT) - Values: Cash, Brokerage, Alt Inv, Retirement, Taconic, House, Trust
- `currency` (TEXT) - CHECK constraint: USD, GBP, EUR
- `balance_personal_local` (NUMERIC(15, 2))
- `balance_family_local` (NUMERIC(15, 2))
- `balance_total_local` (NUMERIC(15, 2))

**Unique Constraint:** `(institution, account_name, date_updated)`

#### `transaction_log`
Records individual financial transactions.

**Columns:**
- `id` (UUID, Primary Key)
- `date` (DATE)
- `category` (TEXT)
- `counterparty` (TEXT, nullable)
- `amount_usd` (NUMERIC(15, 2), nullable)
- `amount_gbp` (NUMERIC(15, 2), nullable)
- `created_at` (TIMESTAMP WITH TIME ZONE)

#### `budget_targets`
Defines annual budget targets and tracks progress.

**Columns:**
- `id` (UUID, Primary Key)
- `category` (TEXT, UNIQUE)
- `annual_budget_gbp` (NUMERIC(15, 2))
- `annual_budget_usd` (NUMERIC(15, 2))
- `tracking_est_gbp` (NUMERIC(15, 2)) - Added in migration 002
- `ytd_gbp` (NUMERIC(15, 2)) - Added in migration 002
- `tracking_est_usd` (NUMERIC(15, 2)) - Added in migration 002
- `ytd_usd` (NUMERIC(15, 2)) - Added in migration 002

#### `historical_net_worth`
Historical net worth snapshots by category.

**Columns:**
- `id` (UUID, Primary Key)
- `date` (DATE)
- `category` (TEXT) - Values: Personal, Family, Trust
- `amount_usd` (NUMERIC(15, 2), nullable)
- `amount_gbp` (NUMERIC(15, 2), nullable)

**Unique Constraint:** `(date, category)`

#### `fx_rates`
Historical foreign exchange rates.

**Columns:**
- `date` (DATE, Primary Key)
- `gbpusd_rate` (NUMERIC(10, 6))
- `eurusd_rate` (NUMERIC(10, 6))

#### `fx_rate_current`
Current foreign exchange rate.

**Columns:**
- `id` (UUID, Primary Key)
- `date` (DATE, UNIQUE)
- `gbpusd_rate` (NUMERIC(10, 6))

#### `annual_trends`
Annual spending trends by category.

**Columns:**
- `id` (UUID, Primary Key)
- `category` (TEXT, UNIQUE)
- `cur_yr_minus_4` (NUMERIC(15, 2))
- `cur_yr_minus_3` (NUMERIC(15, 2))
- `cur_yr_minus_2` (NUMERIC(15, 2))
- `cur_yr_minus_1` (NUMERIC(15, 2))
- `cur_yr_est` (NUMERIC(15, 2))
- `cur_yr_est_vs_4yr_avg` (NUMERIC(15, 2))

#### `monthly_trends`
Monthly spending trends with statistical analysis.

**Columns:**
- `id` (UUID, Primary Key)
- `category` (TEXT, UNIQUE)
- `cur_month_minus_3` (NUMERIC(15, 2))
- `cur_month_minus_2` (NUMERIC(15, 2))
- `cur_month_minus_1` (NUMERIC(15, 2))
- `cur_month_est` (NUMERIC(15, 2))
- `ttm_avg` (NUMERIC(15, 2)) - Trailing Twelve Months average
- `z_score` (NUMERIC(10, 4)) - Statistical outlier detection
- `delta_vs_l3m` (NUMERIC(15, 2)) - Change vs last 3 months

#### `yoy_net_worth`
Year-over-Year Net Worth breakdown by category.

**Columns:**
- `id` (UUID, Primary Key)
- `category` (TEXT, UNIQUE) - Values: Year Start, Income, Other Income, Gift Money, Expenses, Taconic/Other YTD, Transfer to Kiran, Transfer to HMRC, Year End
- `amount_usd` (NUMERIC(15, 2), nullable)
- `amount_gbp` (NUMERIC(15, 2), nullable)

### 4.2 Indexes

Performance indexes created on:
- `account_balances`: `date_updated DESC`, `category`
- `transaction_log`: `date DESC`, `category`
- `historical_net_worth`: `date DESC`, `category`
- `fx_rates`: `date DESC`
- `yoy_net_worth`: `category`

---

## 5. Current Features

### 5.1 Pages & Navigation

#### Key Insights (`/insights`)
**Primary landing page** (first page after login)

**Components:**
- `KeyInsights` - Summary cards showing:
  - **Executive Summary** (at top of page):
    - **Net Worth Card**: Current net worth value prominently displayed, change vs last year with trending up/down icons (green for increase, red for decrease)
    - **Annual Budget Card**: Status indicator (Under Budget/Over Budget) with checkmark/X icon, gap amount displayed
    - **Annual Spend Card**: Status (Spending Less/Spending More) vs 4-year average with trending indicators, difference amount
    - **Monthly Spend Card**: Status (Spending Less/Spending More) vs TTM average with trending indicators, difference amount
    - **Visual Design**: 4-column responsive grid layout, color-coded icons (blue, purple, orange, indigo), large bold numbers for key metrics, gradient header for emphasis, borders and backgrounds for visual separation
  - **Net Worth**: Current net worth, comparison to last year and 5-year average, Personal vs Family breakdown (excluding Trust from Family), key account drivers (top 6 accounts by balance)
  - **Annual Budget**: Total budget vs tracking, gap analysis, top over/under budget categories
  - **Annual Spend**: Current year estimate vs last year and 4-year average, spending comparisons
  - **Monthly Spend**: Current month estimate vs TTM average, spending more/less categories

**Styling:** Clean, minimalist cards with icons (CheckCircle2/XCircle/TrendingUp/TrendingDown/DollarSign/Target/Calendar) and color-coded indicators

#### Dashboard (`/`)
**Main financial overview**

**Components:**
1. **Net Worth Chart** (`NetWorthChart`)
   - Composed chart (bars + line) showing Personal, Family, Trust over time
   - Category filters (checkboxes) to show/hide categories
   - Total line in orange
   - Clean styling with muted colors

2. **Budget Tracker** (`BudgetTable`)
   - **Summary Table** (`BudgetSummaryTable`):
     - Total Income, Expenses, Net Income, Savings %
     - Gap calculations with visual bars
     - "All Good" indicator when net income gap ≥ 0 and savings ≥ 0
   - **Income Table** (`BudgetIncomeTable`):
     - Income and Gift Money categories
     - Sortable columns
     - Gap visualization
   - **Expenses Table**:
     - All expense categories (excluding Income/Gift Money)
     - Sortable columns
     - Gap calculation: `Tracking - Budget`
     - Filters out zero-value rows

3. **Annual Trends Table** (`AnnualTrendsTable`)
   - **Key Insights Cards** (above table):
     - **Top Increases**: Top 3 categories with biggest positive change (2026 vs 2025)
     - **Top Decreases**: Top 3 categories with biggest savings
     - **Total Variance**: Difference between 2026 Est and 2025 totals
   - **Sticky Total Row**: Remains visible while scrolling through table rows
   - 5 years of historical data + current year estimate
   - **Sparkline Column**: Tiny line charts showing 5-year trend (2022-2026) for each category
     - Red if trending up, green if trending down
     - Tooltips show start and end values on hover
   - **Delta vs Last Year Column**: New column showing `(2026 Est - 2025)` with colored bars
   - **Delta vs 4Yr Avg Column**: Existing column with colored bars
   - Color-coded backgrounds (subtle red tint, opacity 0.05-0.15 for readability)
   - Horizontal bars for delta visualizations
   - Dark gray borders on current year estimate column
   - Sortable columns (default: Delta vs Last Yr, ascending)
   - Currency formatting: `£0.0K` style
   - **Column Order**: [Category] [2022] [2023] [2024] [2025] [2026 Est] [Trend] [Delta vs Last Yr] [Delta vs 4Yr Avg]

4. **Monthly Trends Table** (`MonthlyTrendsTable`)
   - **Key Insights Cards** (above table):
     - **Top MoM Increases**: Top 3 categories with biggest spend increases (based on selected sort)
     - **Top MoM Decreases**: Top 3 categories with biggest spend decreases/savings
     - **Total Variance**: Difference based on selected sort (Last Month, Last 3M Avg, or Last 12M Avg)
   - **Sticky Total Row**: Remains visible while scrolling through table rows
   - Last 3 months + current month estimate + TTM average
   - **Sparkline Column**: Tiny line charts showing 4-month trend for each category
     - Red if trending up, green if trending down
     - Tooltips show start and end values on hover
   - **Delta vs Last Month Column**: New column showing `(Current Month - Previous Month)` with colored bars
   - **Delta vs L3M Column**: Existing column with colored bars
   - **Delta vs L12M Avg Column**: Existing column with colored bars
   - Color-coded backgrounds (subtle red tint, opacity 0.05-0.15 for readability)
   - Mini bar charts for Z-score values (centered with zero line)
   - Horizontal bars for delta visualizations
   - Sort dropdown for delta comparison (Last Month, Last 3 Months, Last 12M Avg)
   - Default sort: Delta vs Last Month (descending) - biggest movers at top
   - Dynamic month name formatting
   - Dark gray borders on current month estimate column
   - Currency formatting: `£0.0K` style
   - **Column Order**: [Category] [Oct] [Nov] [Dec] [Jan '26 Est] [Trend] [TTM Avg] [Z-Score] [Delta vs Last Mo] [Delta vs L3M] [Delta vs L12M Avg]

#### Accounts (`/accounts`)
**Detailed account balances**

**Components:**
- **Account Category Summary** (`AccountsOverview`):
  - Summary table showing totals by category (Personal, Family, Balance)
  - Categories: Cash, Brokerage, Alt Inv, Retirement, Taconic, House, Trust
  - Horizontal dark blue bars for balance visualization
  - Bold black font for grand total row

- **Accounts Table**:
  - Grouped by category
  - Sorted by balance (descending) within each category
  - Shows institution, account name, Personal/Family/Total balances
  - Horizontal dark blue bars for balance visualization
  - Multi-currency support with conversion

#### Analysis (`/analysis`)
**Deep dive analysis**

**Components:**
1. **Transaction Analysis** (`TransactionAnalysis`)
   - Filters: YTD (year) or MTD (year/month)
   - Category selector (dynamically populated based on period)
   - Aggregates transactions by first 9 characters of counterparty name
   - Highlights top 80% counterparties
   - Shows counterparty, converted amount, cumulative total
   - Sorted by amount (descending)

2. **YoY Net Worth Waterfall** (`YoYNetWorthWaterfall`)
   - Waterfall chart showing year-over-year net worth changes
   - Summary bullets: Year Start, Year End, Net Change
   - Bars ordered by actual value (descending)
   - Net Change bar at the end (bolded label)
   - Excludes zero-value categories
   - Clean, minimalist styling

### 5.2 Shared Components

#### Header (`components/header.tsx`)
- Currency toggle (GBP/USD)
- "Refresh Data" button (triggers `/api/sync`)
- Toast notifications for sync success/error feedback (using `sonner`)
- Error handling with retry actions

#### Sidebar (`components/sidebar.tsx`)
- **Desktop Sidebar** (left side, desktop only):
  - Navigation menu:
    1. Key Insights (Lightbulb icon)
    2. Dashboard (LayoutDashboard icon)
    3. Accounts (Wallet icon)
    4. Analysis (TrendingUp icon)
  - Active route highlighting
  - **Collapsible Feature**:
    - Toggle button with chevron icon in header (ChevronLeft when expanded, ChevronRight when collapsed)
    - Expanded state: `w-64` (256px) - shows full app name "TS Personal Finance" and navigation labels
    - Collapsed state: `w-20` (80px) - shows only icons, centered
    - Smooth transitions (`transition-all duration-300`) for width changes
    - State persisted to `localStorage` (`sidebar-collapsed` key) - remembers user preference across sessions
    - Tooltips (`title` attribute) show full navigation item names when collapsed
    - Icon-only mode maintains full functionality with hover states
- **Mobile Bottom Navigation** (Instagram-style):
  - Fixed bottom navigation bar (mobile only)
  - Icons with labels below
  - Active state with primary color and scale effect
  - Full-width horizontal layout

#### Currency Context (`lib/contexts/currency-context.tsx`)
- Global currency state (GBP/USD)
- Persists to localStorage
- `convertAmount()` utility for currency conversion
- Uses current FX rate from `fx_rate_current` table

#### Loading States (`components/ui/skeleton.tsx`)
- Reusable `Skeleton` component for consistent loading indicators
- Animated pulse effect with muted background
- Used across all data-fetching components

#### Empty States (`components/ui/empty-state.tsx`)
- Reusable `EmptyState` component for empty data or error states
- Supports optional Lucide icons, title, and description
- Consistent styling with muted backgrounds and centered layout
- Integrated across all major components for improved UX

### 5.3 Data Formatting

**Currency Formatting:**
- **Compact**: `£0.0K` or `$0.0K` (e.g., `£136.8K`)
- **Large**: `£X.XM` for millions, falls back to `£X.Xk` for thousands
- **With Parentheses**: `(£0.0K)` for negative values in some contexts
- **Full**: Standard currency format for tooltips and detailed views

**Consistent Styling:**
- Headers: `bg-muted/50 font-semibold` (no blue backgrounds)
- Total rows: `bg-muted/50 font-semibold`
- Clean, minimalist design throughout

---

## 6. Directory Structure

```
findash/
├── app/                          # Next.js App Router pages
│   ├── accounts/
│   │   └── page.tsx             # Accounts overview page
│   ├── analysis/
│   │   └── page.tsx             # Analysis & trends page
│   ├── api/
│   │   └── sync/
│   │       └── route.ts        # Data sync API endpoint
│   ├── auth/
│   │   └── callback/
│   │       └── route.ts        # OAuth callback handler
│   ├── insights/
│   │   └── page.tsx            # Key Insights page (landing)
│   ├── login/
│   │   ├── layout.tsx          # Login page layout
│   │   └── page.tsx            # Login page (password-based)
│   ├── actions.ts              # Server actions
│   ├── globals.css             # Global styles
│   ├── layout.tsx              # Root layout
│   └── page.tsx                # Dashboard page
│
├── components/                   # React components
│   ├── accounts/
│   │   └── accounts-overview.tsx
│   ├── analysis/
│   │   ├── annual-trends-table.tsx
│   │   ├── transaction-analysis.tsx
│   │   ├── yoy-net-worth-waterfall.tsx
│   │   └── yoy-waterfall-chart.tsx
│   ├── dashboard/
│   │   ├── budget-income-table.tsx
│   │   ├── budget-summary-table.tsx
│   │   ├── budget-table.tsx
│   │   ├── monthly-trends-table.tsx
│   │   ├── net-worth-chart.tsx
│   │   └── yoy-net-worth-table.tsx
│   ├── insights/
│   │   └── key-insights.tsx
│   ├── ui/                      # Shadcn/UI components
│   │   ├── badge.tsx
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── checkbox.tsx
│   │   ├── empty-state.tsx     # Empty state component
│   │   ├── label.tsx
│   │   ├── separator.tsx
│   │   ├── skeleton.tsx         # Loading skeleton component
│   │   └── table.tsx
│   ├── currency-toggle.tsx
│   ├── header.tsx
│   ├── kpi-card.tsx
│   └── sidebar.tsx
│
├── lib/                         # Utility libraries
│   ├── contexts/
│   │   └── currency-context.tsx # Currency state management
│   ├── supabase/
│   │   ├── client.ts           # Client-side Supabase client
│   │   └── server.ts           # Server-side Supabase client
│   ├── sync-google-sheet.ts    # Google Sheets sync service
│   └── types.ts                # TypeScript type definitions
│
├── supabase/
│   └── migrations/             # Database migrations
│       ├── 001_initial_schema.sql
│       ├── 002_add_budget_tracking_columns.sql
│       └── 003_add_yoy_net_worth.sql
│
├── utils/
│   └── cn.ts                   # Tailwind class name utility
│
├── proxy.ts                    # Route protection & auth (Next.js 16 compliant)
├── next.config.ts              # Next.js configuration
├── package.json                # Dependencies
├── tailwind.config.ts          # Tailwind configuration
├── tsconfig.json               # TypeScript configuration
└── README.md                   # Project documentation
```

---

## 7. Key Business Logic

### 7.1 Gap Calculation
**Formula:** `Gap = Tracking - Budget`

**Applied to:**
- Budget Summary (Income, Expenses, Net Income)
- Budget Income Table
- Budget Expenses Table

**For Expenses:**
- Values stored as negative (e.g., -£205.4K)
- Gap calculation uses raw (negative) values
- Positive gap = spending less than budgeted (good)
- Negative gap = spending more than budgeted (bad)

### 7.2 Net Worth Calculation
**Personal vs Family:**
- Personal: Sum of `balance_personal_local` across all accounts
- Family: Sum of `balance_family_local` across all accounts (excluding Trust)
- Trust: Separate category, not included in Family total

**Current Net Worth:**
- Calculated from most recent `account_balances` entries
- Uses most recent balance per account (deduplicated by institution + account_name)

### 7.3 Currency Conversion
**Logic:**
- If UI currency matches account currency → no conversion
- If UI is USD and account is GBP → multiply by `gbpusd_rate`
- If UI is GBP and account is USD → divide by `gbpusd_rate`
- Uses current FX rate from `fx_rate_current` table

### 7.4 Data Filtering
**Zero-value filtering:**
- Budget tables: Excludes categories where `annualBudget = 0`, `ytd = 0`, and `gap = 0`
- YoY Net Worth Waterfall: Excludes categories with zero change values
- Accounts: Only shows categories with non-zero totals

---

## 8. UI/UX Patterns

### 8.1 Design System
- **Color Scheme**: Muted, professional palette
- **Grid Lines**: `#e5e7eb` (light gray)
- **Axis Colors**: `#6b7280` (medium gray)
- **Positive Indicators**: Green (`#82ca9d`, `text-green-600`)
- **Negative Indicators**: Red (`#ff7c7c`, `text-red-600`)
- **Headers**: `bg-muted/50 font-semibold`
- **Total Rows**: `bg-muted/50 font-semibold`

### 8.2 Table Styling
- **Headers**: Muted background, no blue coloring
- **Sortable Columns**: Clickable headers with arrow icons
- **Visual Bars**: Horizontal bars for gaps, balances, deltas
- **Color Coding**: Background colors for trend indicators
- **Consistent Formatting**: `£0.0K` currency format throughout

### 8.3 Chart Styling
- **Clean Grid**: Subtle dashed lines
- **Muted Colors**: Professional color palette
- **Rounded Corners**: `radius={[4, 4, 0, 0]}` on bars
- **Tooltips**: White background, border, rounded corners
- **Legends**: Smaller font (12px), spaced items

### 8.4 Loading & Error States
- **Skeleton Loaders**: Animated pulse effect for data-fetching components
- **Empty States**: Consistent empty state component with icons and descriptions
- **Toast Notifications**: User-friendly success/error feedback using `sonner` library
- **Error Handling**: Comprehensive error states with retry actions where applicable

### 8.5 Navigation & Layout
- **Responsive Navigation**: Desktop sidebar (collapsible) vs mobile bottom navigation
- **Collapsible Sidebar**: Desktop-only feature allowing users to maximize content area
- **State Persistence**: Sidebar collapse state saved to localStorage for user preference
- **Smooth Transitions**: CSS transitions for sidebar width changes (300ms duration)
- **Icon Tooltips**: Native browser tooltips for icon-only navigation items when sidebar is collapsed

### 8.6 Table Visual Enhancements
- **Sparklines**: Tiny line charts embedded in table rows showing trend visualization
  - Used in Annual Trends (5-year trend) and Monthly Trends (4-month trend)
  - Color-coded: Red for upward trends, green for downward trends
  - Tooltips display start and end values on hover
  - Normalized scaling for consistent visual comparison
- **Summary Cards**: Key insights cards displayed above tables
  - Top Increases/Decreases: Highlight top movers based on selected sort
  - Total Variance: Quick comparison of totals
  - Consistent styling with borders and icons (TrendingUp/TrendingDown)
  - Responsive grid layout (1 column mobile, 3 columns desktop)
- **Sticky Total Rows**: Total rows remain visible while scrolling
  - Uses `sticky top-0 z-10` positioning
  - Solid background (`bg-muted/50`) ensures content scrolls behind
  - Tables wrapped in scrollable containers with `max-h-[600px]`
- **Delta Visualizations**: Consistent delta display across tables
  - Reusable `DeltaCell` component for text + colored bar visualization
  - Green bars for positive deltas, red bars for negative deltas
  - Proportional bar width based on max value in dataset
- **Reduced Heatmap Opacity**: Improved readability for color-coded backgrounds
  - Opacity reduced from `0.1-0.6` to `0.05-0.15` range
  - Subtle tint effect rather than solid blocks
  - High contrast text remains readable
- **Column Alignment**: Perfect vertical alignment between total and category rows
  - Consistent cell structure ensures sparklines, bars, and values align
  - Matching column widths and padding throughout

---

## 9. Environment Variables

Required environment variables (`.env.local`):

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Google Sheets API
GOOGLE_SERVICE_ACCOUNT_EMAIL=your_service_account_email
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=your_service_account_private_key

# Google Sheet ID (externalized from hardcoded value)
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id

# Allowed Email Addresses (comma-separated, externalized from middleware)
ALLOWED_EMAILS=email1@example.com,email2@example.com,admin@findash.com
```

---

## 10. Future Roadmap

### 10.1 Authentication
- [ ] **Restore Magic Link Authentication**: Replace password-based login with Supabase Magic Links
- [ ] **Email Verification**: Implement email verification flow
- [ ] **Session Management**: Enhanced session handling and refresh

### 10.2 Features
- [ ] **More Executive Summary Insights**: Additional high-level financial insights
- [ ] **Advanced Charts**: Additional visualization types (pie charts, area charts)
- [ ] **Export Functionality**: PDF/CSV export of reports
- [ ] **Budget Forecasting**: Predictive budget analysis
- [ ] **Goal Tracking**: Financial goal setting and tracking
- [ ] **Notifications**: Alerts for budget overruns, significant changes

### 10.3 Technical Improvements
- [ ] **Automated Sync**: Scheduled data synchronization (cron jobs)
- [ ] **Error Recovery**: Enhanced error handling and retry logic
- [ ] **Performance Optimization**: Caching strategies, query optimization
- [ ] **Testing**: Unit tests, integration tests, E2E tests
- [ ] **Documentation**: API documentation, component documentation
- [x] **Loading States**: Skeleton loaders implemented across all data-fetching components
- [x] **Error Handling**: Comprehensive empty states and toast notifications implemented
- [x] **Configuration Externalization**: Hardcoded values moved to environment variables
- [x] **Table Visual Enhancements**: Sparklines, summary cards, sticky totals, and improved readability implemented for Annual and Monthly Trends tables

### 10.4 Data Enhancements
- [ ] **Transaction Categorization**: AI-powered transaction categorization
- [ ] **Recurring Transactions**: Detection and management
- [ ] **Budget Templates**: Pre-configured budget templates
- [ ] **Multi-Account Aggregation**: Enhanced account grouping

---

## 11. Known Issues & Technical Debt

### 11.1 Current Limitations
- **Magic Link Disabled**: Currently using password-based authentication for development
- **Manual Sync**: Data sync requires manual trigger via "Refresh Data" button
- **No Real-time Updates**: Data changes require manual refresh

### 11.2 Technical Debt
- **ESLint Version Conflict**: ESLint 8 vs Next.js 16 requirement for ESLint 9
- **Type Safety**: Some `any` types could be more strictly typed
- **Sonner Package**: Currently installed but not listed in `package.json` dependencies (should be added for production)

---

## 12. Deployment

### 12.1 Build & Deploy
- **Platform**: Vercel (recommended)
- **Build Command**: `npm run build`
- **Start Command**: `npm start`
- **Node Version**: Compatible with Node 20+

### 12.2 Environment Setup
1. Set all required environment variables in Vercel dashboard
2. Ensure Google Service Account has access to spreadsheet
3. Run database migrations in Supabase SQL Editor
4. Configure allowed emails in middleware

---

## 13. Maintenance & Support

### 13.1 Data Sync
- Sync process logs detailed information to console
- Errors are returned with specific messages
- Sheet verification ensures data integrity

### 13.2 Database Migrations
- Migrations stored in `supabase/migrations/`
- Must be run manually in Supabase SQL Editor
- Sequential numbering (001, 002, 003...)

---

## Appendix A: TypeScript Interfaces

See `lib/types.ts` for complete type definitions:
- `AccountBalance`
- `TransactionLog`
- `BudgetTarget`
- `HistoricalNetWorth`
- `FXRate`
- `FXRateCurrent`
- `AnnualTrend`
- `MonthlyTrend`
- `YoYNetWorth`

---

## Appendix B: Google Sheets Schema

### Sheet: Account Balances
- **Range**: A:H
- **Columns**: Date Updated, Institution, Account Name, Category, Currency, Balance Personal, Balance Family, Balance Total

### Sheet: Transaction Log
- **Range**: A:E
- **Columns**: Date, Category, Counterparty, Amount USD, Amount GBP

### Sheet: Budget Targets
- **Range**: A:H
- **Columns**: Category, Annual Budget GBP, Tracking Est GBP, YTD GBP, Annual Budget USD, [skip], Tracking Est USD, YTD USD

### Sheet: Historical Net Worth
- **Range**: A:D
- **Columns**: Date, Category, Amount USD, Amount GBP

### Sheet: FX Rates
- **Range**: A:C
- **Columns**: Date, GBP/USD Rate, EUR/USD Rate

### Sheet: FX Rate Current
- **Range**: A:B
- **Columns**: Date, GBP/USD Rate

### Sheet: Annual Trends
- **Range**: A:G
- **Columns**: Category, Year-4, Year-3, Year-2, Year-1, Current Year Est, Est vs 4Yr Avg

### Sheet: Monthly Trends
- **Range**: A:H
- **Columns**: Category, Month-3, Month-2, Month-1, Current Month Est, TTM Avg, Z-Score, Delta vs L3M

### Sheet: YoY Net Worth
- **Range**: A:C
- **Columns**: Category, Value USD, Value GBP

---

**Document End**
