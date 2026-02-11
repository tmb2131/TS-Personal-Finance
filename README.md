# TS Personal Finance - Personal Finance Dashboard

A modern personal finance dashboard built with Next.js 16, Supabase, and Google Sheets integration.

## Features

- 📊 **Net Worth Tracking**: Visualize net worth over time with stacked bar charts
- 💰 **Budget Tracking**: Monitor spending against annual budgets with gap analysis
- 📈 **Monthly Trends**: Track spending patterns with Z-score outlier detection
- 🏦 **Accounts Overview**: Detailed view of all account balances grouped by category
- 📉 **Annual Analysis**: Year-over-year spending trends and waterfall charts
- 💱 **Multi-Currency Support**: Toggle between GBP and USD across the entire dashboard
- 🔄 **Google Sheets Sync**: One-click sync from Google Sheets (source of truth); optional daily auto-refresh at 6am UTC via cron

## Tech Stack

- **Framework**: Next.js 16+ (App Router, TypeScript)
- **Styling**: Tailwind CSS
- **UI Components**: Shadcn/UI (Radix Primitives)
- **Charts**: Recharts
- **Backend/Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth (Google OAuth)
- **Integration**: Google Sheets API (v4)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

GOOGLE_SERVICE_ACCOUNT_EMAIL=your_service_account_email
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=your_service_account_private_key

GOOGLE_GENERATIVE_AI_API_KEY=your_google_generative_ai_api_key

# Optional: for daily 6am UTC data refresh cron (set in Vercel / hosting env)
CRON_SECRET=your_random_secret_string

# Optional: for AI assistant web search (comparative queries like "How does my spending compare?")
# Get a free API key from https://serper.dev
SERPER_API_KEY=your_serper_api_key
```

### 3. Database Setup

Run the SQL migration in Supabase:

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `supabase/migrations/001_initial_schema.sql`
4. Execute the migration

### 4. Google Sheets API Setup

1. Create a Google Cloud Project
2. Enable the Google Sheets API
3. Create a Service Account
4. Download the JSON key file
5. Share your Google Sheet with the service account email
6. Add the credentials to your `.env.local` file

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Google Sheet Structure

The app expects a Google Sheet with the following tabs:

1. **Account Balances**: Institution, Account Name, Category, Currency, Balances
2. **Transaction Log**: Date, Category, Counterparty, Amounts (USD/GBP)
3. **Budget Targets**: Category, Annual Budgets (GBP/USD)
4. **Historical Net Worth**: No longer required from sheet; generated in-app from account balance history
5. **FX Rates**: Date, GBP/USD Rate, EUR/USD Rate
6. **FX Rate Current**: Date, GBP/USD Rate
7. **Annual Trends**: No longer required from sheet; computed in-app from transactions
8. **Monthly Trends**: No longer required from sheet; computed in-app from transactions

## Trying it out (for testers)

**Findash** (in-app: **TS Personal Finance**) is a personal finance dashboard that pulls your data from a Google Sheet and shows net worth, budgets vs actuals, spending trends, cash runway, and an AI assistant for natural-language questions.

*I built this over the past week while learning how AI can build real apps—not just answer questions or summarize data. So consider this a work-in-progress experiment as much as a tool.*

**To try it:**

1. **Sign in** with your Google account.
2. You’ll land on **Key Insights**. If you don’t have a sheet connected yet, a **popup** will ask for a Google Spreadsheet ID. Paste the ID and click **Save and start**; the app will sync that sheet and refresh the page so you see data right away.
3. **Dummy data:** To use the shared test sheet, paste this ID in the popup:  
   `1BxVuJ-DViN5nqpLc-8tGXex_pYiPY8dfL8UV5czCrHY`
4. After that, use **Dashboard**, **Key Insights**, **Accounts**, and **Analysis** to explore. The floating chat button opens the **AI Financial Assistant**—you can ask things like “What’s my net worth?” or “How’s my budget vs actual?”
5. Your data is isolated to your account; you can change or disconnect your sheet anytime in **Settings**.

## Authentication

Sign in with Google; data is isolated per user via Supabase Row Level Security (RLS). Access can be restricted to specific emails (see `lib/allowed-emails.ts`).

## Project Structure

```
findash/
├── app/                    # Next.js app router pages
│   ├── accounts/          # Accounts overview page
│   ├── analysis/          # Analysis & trends page
│   ├── login/             # Login page
│   ├── actions.ts         # Server actions
│   └── layout.tsx         # Root layout
├── components/            # React components
│   ├── dashboard/        # Dashboard-specific components
│   ├── accounts/         # Accounts-specific components
│   ├── analysis/         # Analysis-specific components
│   └── ui/               # Shadcn UI components
├── lib/                  # Utility libraries
│   ├── contexts/         # React contexts (Currency)
│   ├── supabase/        # Supabase client setup
│   ├── sync-google-sheet.ts  # Google Sheets sync service
│   └── types.ts         # TypeScript type definitions
├── supabase/
│   └── migrations/      # Database migrations
└── utils/               # Utility functions
```

## Scheduled refresh (6am daily)

Data can be refreshed automatically every morning at **6:00 UTC**:

1. **Vercel**: Add `CRON_SECRET` to your project env (e.g. a long random string). The `vercel.json` cron will call `/api/cron/refresh` at 6am UTC; Vercel sends `Authorization: Bearer <CRON_SECRET>`.
2. **Other hosting**: Use a cron service (e.g. cron-job.org) to send a GET to `https://your-domain.com/api/cron/refresh` with header `Authorization: Bearer <your CRON_SECRET>` at 6am (or your preferred time).

Without `CRON_SECRET` set, the cron endpoint returns 401. The schedule in `vercel.json` is `0 6 * * *` (6am UTC); change it if you want a different time.

## Deployment

The app is configured for deployment on Vercel:

1. Push your code to GitHub
2. Import the project in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy!

## License

Private project - All rights reserved
