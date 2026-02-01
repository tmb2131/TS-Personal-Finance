# Plan: AI Financial Health & Trends Analysis

**Goal:** Make the AI capable of providing a **perspective view** of the user's financial health and trends—account values, how money is allocated, and spending & income trends—using existing and minimal new data access.

**Scope:** Analysis and narrative only (no advice, no predictions, no executing actions). All numbers must come from tools or injected context; the AI interprets and explains.

---

## 1. Current state

- **Chat API** (`app/api/chat/route.ts`): `streamText` with Gemini 2.5 Flash, `maxSteps: 5`, date context injected into system prompt.
- **Existing tools:**
  - `get_financial_snapshot` – current or historical net worth / balances; group by currency, category, or entity (Personal/Family/Trust).
  - `analyze_spending` – spending or income over a date range; group by category, merchant, or month.
  - `get_budget_vs_actual` – budget targets vs actual (YTD or annual); over/under by category.
  - `analyze_forecast_evolution` – how the expenses gap to budget changed between two dates (e.g. “why did my forecast change?”).
- **System prompt** already frames the AI as “Senior Financial Analyst” with capabilities for snapshots, spending, and budget; it does **not** yet explicitly ask for a “financial health perspective” or “trend narrative.”
- **Data available but not yet exposed to chat:** net worth **time series** (`historical_net_worth`), **cash runway / net burn** (RPC `get_cash_runway_net_burn` and `/api/cash-runway`), and high-level **allocation** (current snapshot can be grouped by category/currency/entity).

**Gap:** The AI can answer point-in-time and single-topic questions (e.g. “Am I over budget?”, “What did I spend last month?”) but delivering a **single, coherent health-and-trends perspective** usually requires multiple tool calls and a clear instruction to synthesize. There is no one-shot “health summary” and no explicit trend-over-time tool for net worth or runway.

---

## 2. Phased plan

### Phase 1 – Prompt and UX (no new tools)

**Objective:** Clarify that the AI should offer a **perspective** on financial health and trends, and make it easy for users to ask for it.

1. **System prompt**
   - Add an explicit capability: **“Financial health perspective”** – synthesise account values, allocation, budget status, and spending/income trends into a short narrative (e.g. “Here’s where you stand and how things are trending”).
   - Add 1–2 example queries, e.g.:
     - “Summarise my financial health”
     - “How am I doing overall? Account values, budget, and spending trends”
   - Keep existing rules: always use tools for numbers, never invent data, distinguish Personal/Family/Trust where relevant.

2. **Chat UI (optional)**
   - Add a suggested prompt or quick action, e.g. “Summarise my financial health” or “How am I doing vs budget and spending?”, so users can trigger the health perspective in one click.

**Deliverables:** Updated system prompt in `app/api/chat/route.ts`; optional suggested prompt in the chat component.

**Effort:** Small (edits only).

---

### Phase 2 – One-shot financial health summary tool

**Objective:** Let the AI answer “Summarise my financial health” with **one** tool call that returns a structured snapshot, so the model can narrate from a single payload instead of chaining 4 tools.

1. **New tool: `get_financial_health_summary`**
   - **Inputs (all optional):** `asOfDate` (YYYY-MM-DD or omit for “current”), `currency` (GBP/USD for display).
   - **Behaviour (single execute function):**
     - **Net worth:** Current total (from `account_balances` latest per account, or latest `historical_net_worth` by date). Optionally breakdown by entity (Personal / Family / Trust) or by currency.
     - **Allocation:** High-level split (e.g. by category or currency) so the AI can say “most of your assets are in X”.
     - **Budget:** Net income budget vs tracking (from `budget_targets`: income vs expense categories), gap and “under/over” for the year.
     - **Spending/income trends:** YTD total spend and total income (from `transaction_log` or from `budget_targets` tracking if already aggregated); or top 3–5 expense categories YTD so the AI can say “biggest spend is X, Y, Z”.
   - **Output:** Single JSON with short, preformatted summary strings (e.g. `netWorthSummary`, `allocationSummary`, `budgetStatusSummary`, `topSpendCategories`) plus the raw numbers the AI can cite. The AI then turns this into a concise health narrative.

2. **Implementation options**
   - **Option A:** One route handler that runs 2–3 Supabase queries (balances or latest net worth, budget_targets, and optionally a simple transaction aggregate or budget_targets-based “top categories”) and shapes the response. The chat tool’s `execute` calls this logic (or the same logic lives inside the tool).
   - **Option B:** Tool’s `execute` invokes existing backend logic (e.g. reuse logic from dashboard: net worth from `historical_net_worth` or account_balances, budget from budget_targets, top categories from budget_targets or a small transaction aggregate). No new API route required if everything can be done server-side in the route.

3. **System prompt**
   - Document the new tool: “Use `get_financial_health_summary` when the user asks for an overall picture of their financial health, a summary of where they stand, or how they’re doing (accounts, allocation, budget, spending trends).”

**Deliverables:** New tool in `app/api/chat/route.ts`; optional shared helper for “health summary” query logic; system prompt updated to mention the tool and when to use it.

**Effort:** Medium (one new tool + 2–3 queries).

---

### Phase 3 – Trends and runway in chat

**Objective:** Let the AI talk about **net worth over time** and **cash runway** using real data.

1. **Net worth trend**
   - **New tool: `get_net_worth_trend`**
     - **Inputs:** `startDate`, `endDate` (YYYY-MM-DD), optional `groupBy` (e.g. `entity` or “total only”).
     - **Behaviour:** Query `historical_net_worth` for the date range; aggregate by date (and optionally by entity). Return time series (e.g. array of `{ date, totalGbp, totalUsd, byEntity? }`).
     - **Output:** Summary string (e.g. “Net worth went from £X to £Y over the period”) plus the series so the AI can describe direction and magnitude.
   - **System prompt:** “Use `get_net_worth_trend` when the user asks how their net worth has changed over time, or for a trend over a date range.”

2. **Cash runway**
   - **New tool: `get_cash_runway`** (or reuse existing RPC name)
     - **Inputs:** None (or optional “months” for display).
     - **Behaviour:** Call existing `get_cash_runway_net_burn` RPC (or same logic as `/api/cash-runway`). Return runway months and net burn (and any existing summary fields).
     - **Output:** Short summary string (e.g. “Runway is X months at current burn”) plus numbers. AI uses this only when the user asks about runway, burn, or how long cash will last.

3. **System prompt**
   - Add to capabilities: “Cash runway and net worth trends – use when the user asks how long their cash will last or how their net worth has trended over time.”

**Deliverables:** `get_net_worth_trend` and `get_cash_runway` in chat route; system prompt updated.

**Effort:** Medium (two tools; runway is mostly wiring to existing RPC).

---

### Phase 4 – Optional enhancements

- **Pre-computed snapshot in context:** For power users or “daily digest”, optionally inject a short, read-only “financial snapshot” (e.g. net worth, budget status, top 3 categories) into the system message so the AI can reference it without a tool call for the first turn. Requires a small job or on-demand computation that writes a snapshot string.
- **Structured “health report” flow:** A dedicated UI action (“Generate financial health report”) that calls `get_financial_health_summary` (and optionally `get_net_worth_trend` + `get_cash_runway`), then the AI formats a consistent sectioned report (Accounts, Allocation, Budget, Spending trends, Runway). Same tools as above; only the prompt and possibly the first user message change.
- **Guardrails and disclaimers:** In system prompt and/or UI: “This is analysis of your data, not financial advice.” Ensure the AI never suggests specific investments or actions; it only describes and interprets.

---

## 3. Implementation order (recommended)

| Order | Phase   | What |
|-------|---------|------|
| 1     | Phase 1 | Prompt + optional suggested “Summarise my financial health” in chat UI |
| 2     | Phase 2 | `get_financial_health_summary` tool + prompt update |
| 3     | Phase 3 | `get_net_worth_trend` and `get_cash_runway` tools + prompt update |
| 4     | Phase 4 | Optional: snapshot in context, “health report” flow, disclaimers |

---

## 4. Files to touch

- **`app/api/chat/route.ts`** – All new tools, system prompt changes, and (if you keep logic in route) health-summary queries.
- **Chat UI component** (e.g. where the chat input or suggestions live) – Optional suggested prompt for “Summarise my financial health”.
- **Optional:** Shared module for “health summary” query logic if you want to reuse it from an API route or cron later.

---

## 5. Success criteria

- User can ask “Summarise my financial health” or “How am I doing?” and get a concise narrative that covers: account values (and optionally allocation), budget status (under/over, gap), and spending/income trends (e.g. top categories or YTD).
- User can ask “How has my net worth changed over [period]?” and get an answer grounded in `historical_net_worth`.
- User can ask “What’s my cash runway?” and get an answer grounded in the existing cash-runway RPC.
- All numbers in the AI’s answers come from tools (no hallucinated figures). Role is clearly “analysis and perspective,” not “advice.”
