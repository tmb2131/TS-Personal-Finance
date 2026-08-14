# AI Page Coverage Matrix

Purpose: define Phase 1 coverage so the AI can answer both finance analysis and app usage questions across all core pages/content.

Last updated: 2026-08-14

The app collapsed from nine navigable routes to five. Retired routes still
resolve — see the redirect table below — but the AI's knowledge index and
aliases are keyed on the five that exist.

| Route | Page | Primary Content | Key User Actions | App-Instruction Coverage |
| --- | --- | --- | --- | --- |
| `/login` | Login | Google sign-in and auth errors | Sign in with Google | Covered |
| `/` | Home | GBP available, budget status, net worth, 0-3 attention items | Act on an attention item, follow through to Spending or Position | Covered |
| `/spending` | Spending | Today's headroom, budget table, transaction analysis, transactions list, recurring | Add transaction or recurring item, filter analysis | Covered |
| `/position` | Position | Accounts, net worth chart, cash runway, liquidity, sustainable spend, kids | Add/edit accounts and debt, adjust assumptions | Covered |
| `/trends` | Trends | Observations, forecast (period toggle), methodologies, YoY net worth, category trends, annual/monthly tables | Switch forecast period, compare across years | Covered |
| `/settings` | Settings | Data sources, CSV import, category planning, assumptions, appearance, account | Connect sheet, import CSV, edit budgets, change theme, log out | Covered |
| `global` | Global shell | Five-item sidebar and bottom nav, header (sync, refresh, currency chip, quick add), chat FAB | Navigate, refresh, switch currency, open chat | Covered |

## Redirects from retired routes

Single-destination routes redirect in `next.config.ts`. `/dashboard` and
`/analysis` resolve on the client instead, because their sections split across
more than one destination and a URL fragment never reaches the server.

| Retired | Now | Notes |
| --- | --- | --- |
| `/insights` | `/` | Merged into Home |
| `/accounts` | `/position#accounts` | |
| `/liquidity` | `/position#liquidity` | |
| `/kids` | `/position#kids` | Still hidden when there is no kids data |
| `/sustainable-spend` | `/position#sustainable-spend` | |
| `/transactions` | `/spending#transactions` | |
| `/recurring` | `/spending#recurring` | |
| `/today` | `/spending#today` | |
| `/forecast` | `/trends#methodologies` | |
| `/import` | `/settings#import` | `?target=` preserved |
| `/dashboard` | `/`, `/spending`, `/position`, `/trends` | By fragment; see `app/dashboard/page.tsx` |
| `/analysis` | `/trends`, `/spending`, `/position` | By fragment; see `app/analysis/page.tsx` |

Section ids were deliberately carried over, so `/analysis#forecast-evolution`
and `/analysis?section=transaction-analysis&period=YTD` both still land on the
right content. The three former forecast sections (`ytd-spend`,
`annual-cumulative`, `forecast-evolution`) merged into one section with a period
toggle; each old fragment opens the toggle on its matching period.

## Source of truth

- Structured knowledge index: `lib/ai/app-knowledge.ts`
- Chat system prompt wiring: `app/api/chat/route.ts`
