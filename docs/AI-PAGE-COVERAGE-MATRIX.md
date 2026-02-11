# AI Page Coverage Matrix

Purpose: define Phase 1 coverage so the AI can answer both finance analysis and app usage questions across all core pages/content.

Last updated: 2026-02-11

| Route | Page | Primary Content | Key User Actions | App-Instruction Coverage |
| --- | --- | --- | --- | --- |
| `/login` | Login | Google sign-in and auth errors | Sign in with Google | Covered |
| `/insights` | Key Insights | Overview cards/charts, connect-sheet modal, dummy data banner | Connect sheet, review top-level insights | Covered |
| `/` | Dashboard | KPI cards, net worth chart, income/expense, budget, annual/monthly trends | Jump by section, inspect tables/charts | Covered |
| `/accounts` | Accounts Overview | Account balance detail, add-account flow | Add/edit/view accounts | Covered |
| `/liquidity` | Liquidity Overview | Liquidity KPIs, debt, risk/horizon tables | Add debt, inspect liquidity profile | Covered |
| `/kids` | Kids Accounts | Kids balances and account details | Add/edit kids account records | Covered |
| `/analysis` | Analysis & Trends | Cash runway, transaction analysis, forecast evolution, YoY changes | Navigate by section, deep-dive trends, add transaction | Covered |
| `/recurring` | Recurring Payments | Recurring tables/cards and detected recurring series | Add/edit recurring items, review recurring patterns | Covered |
| `/import` | Import Transactions | CSV upload, mapping, preview/import flow | Upload CSV, map columns, import | Covered |
| `/settings` | Settings | Sheet setup, profile/currency, category planning, appearance | Connect sheet, set defaults, configure planning/theme | Covered |
| `global` | Global shell | Sidebar, mobile nav, header actions, floating AI button | Navigate pages, refresh sync, change currency, open chat | Covered |

## Source of truth

- Structured knowledge index: `lib/ai/app-knowledge.ts`
- Chat system prompt wiring: `app/api/chat/route.ts`
