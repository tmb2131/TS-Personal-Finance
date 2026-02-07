# Monetization Strategy

## Model: Freemium SaaS with Tiered Subscriptions

### Pricing Tiers

| | Free | Pro ($9/mo or $89/yr) | Household ($15/mo or $149/yr) |
|---|---|---|---|
| Dashboard & Charts | All pages | All pages | All pages |
| Data Sync | Manual only | Auto (cron 2x/day) | Auto (cron 2x/day) |
| Data Input | Google Sheets only | Sheets + Plaid + CSV | Sheets + Plaid + CSV |
| AI Assistant | 5 queries/day | Unlimited + web search | Unlimited + web search |
| Transaction History | 6 months | Unlimited | Unlimited |
| Export (PDF/CSV) | No | Yes | Yes |
| Email Reports | No | Weekly/Monthly digest | Weekly/Monthly digest |
| Multiple Users | No | No | Up to 4 |
| Trial | — | 14 days free | 14 days free |

---

## Implementation Phases

### Phase 1: Remove Adoption Barriers

**Goal**: Let users get value without building a 13-tab Google Sheet.

#### 1a. Plaid Integration (Premium Feature)
- Integrate Plaid Link for automatic bank/brokerage connections
- Auto-import transactions and account balances
- Map Plaid categories to existing category taxonomy
- Store Plaid access tokens per user in `user_profiles`
- This is the primary justification for the Pro tier

#### 1b. CSV Import
- Upload bank statements (CSV/OFX) via drag-and-drop
- Column mapping UI (date, amount, description, category)
- Duplicate detection against existing transactions
- Available on all tiers (reduces barrier to entry)

#### 1c. Manual Data Entry Forms
- CRUD forms for: transactions, account balances, budget targets
- Available on all tiers
- Supplements Sheets/Plaid rather than replacing them

#### 1d. Google Sheet Template
- Pre-built template with all 13 tabs, sample data, and instructions
- One-click copy from Settings page
- Lowers the bar for the Sheets-first path

**Files to create/modify**:
- `app/api/plaid/` — New route handlers for Plaid Link token, webhook, sync
- `components/settings/plaid-connection.tsx` — Plaid Link UI
- `components/settings/csv-import.tsx` — CSV upload + column mapping
- `components/transactions/transaction-form.tsx` — Manual entry form
- `lib/sync-plaid.ts` — Plaid data sync service
- `lib/csv-parser.ts` — CSV parsing and mapping logic

**Dependencies to add**:
- `plaid` (Plaid Node SDK)
- `papaparse` (CSV parsing)

---

### Phase 2: Payment Infrastructure

**Goal**: Enable charging users with Stripe.

#### 2a. Database Changes
New migration (`023_subscription_billing.sql`):
```sql
ALTER TABLE user_profiles ADD COLUMN subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'household'));
ALTER TABLE user_profiles ADD COLUMN subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'trialing', 'past_due', 'canceled'));
ALTER TABLE user_profiles ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE user_profiles ADD COLUMN trial_ends_at TIMESTAMPTZ;
ALTER TABLE user_profiles ADD COLUMN subscription_ends_at TIMESTAMPTZ;
```

#### 2b. Stripe Integration
- Stripe Checkout for new subscriptions
- Stripe Customer Portal for self-service billing management
- Webhook handler for subscription lifecycle events

**API Routes**:
- `POST /api/billing/checkout` — Create Checkout Session
- `POST /api/billing/portal` — Create Customer Portal session
- `POST /api/billing/webhook` — Handle Stripe webhooks
- `GET /api/billing/status` — Return current subscription status

**Webhook Events to Handle**:
- `checkout.session.completed` — Activate subscription
- `customer.subscription.updated` — Tier/status changes
- `customer.subscription.deleted` — Downgrade to free
- `invoice.payment_failed` — Mark as past_due

#### 2c. Feature Gating
- Middleware in `proxy.ts`: check `subscription_tier` before serving premium routes
- Helper: `lib/subscription.ts` with `canAccess(tier, feature)` utility
- Soft limits: show upgrade prompts, not hard blocks (better UX)

#### 2d. Billing UI
- `app/settings/billing/page.tsx` — Subscription status, plan selection, portal link
- Upgrade prompts embedded in rate-limited features (AI chat, export buttons)
- Banner for trial expiration countdown

**Dependencies to add**:
- `stripe` (Stripe Node SDK)

---

### Phase 3: AI as Premium Differentiator

**Goal**: Make the AI assistant the engagement driver that justifies ongoing subscription.

#### 3a. Rate Limiting
- Track daily AI query count per user in `user_profiles` or a `usage` table
- Free: 5 queries/day (reset at midnight UTC)
- Pro/Household: Unlimited
- Show remaining queries in chat UI for free users

#### 3b. Premium AI Features (Pro only)
- Web search tool (`SERPER_API_KEY`) enabled only for Pro
- Proactive alerts: "Your spending is 40% above budget this month"
- Financial health score with trend tracking
- Actionable recommendations ("Based on your runway, consider increasing your emergency fund")

#### 3c. Implementation
- Add query counter middleware in `app/api/chat/route.ts`
- New table or column for `ai_queries_today` + `ai_queries_reset_at`
- Conditionally enable `search_web` tool based on tier
- Add system prompt enhancements for Pro users (more detailed analysis)

---

### Phase 4: Onboarding Funnel

**Goal**: Convert signups to active users to paying customers.

#### 4a. Welcome Flow
1. Sign in → Welcome modal (not dump into dummy data)
2. Choose path: "Connect Bank (Pro)" / "Use Google Sheets" / "Try Demo"
3. If demo: guided tour of 3-4 key pages with tooltips
4. If sheets: template copy link + setup instructions
5. If Plaid: inline bank connection flow

#### 4b. Activation Metrics to Track
- Connected a data source (Sheets/Plaid/CSV)
- Viewed 3+ pages
- Used AI assistant at least once
- Returned within 7 days

#### 4c. Email Lifecycle
- Welcome email (immediate)
- "Getting started" tips (day 1)
- "Did you know?" feature highlights (day 3, 7)
- Trial expiration warning (day 10, 13)
- Post-trial win-back (day 15, 30)

**Dependencies to add**:
- `resend` or `@sendgrid/mail` (transactional email)

---

### Phase 5: Export & Reports

**Goal**: Add tangible value that justifies ongoing Pro subscription.

#### 5a. PDF Reports (Pro)
- Monthly financial summary: net worth, budget performance, top spending categories
- Quarterly review: trends, year-over-year comparisons
- Generate via `/api/reports/generate` using a PDF library

#### 5b. CSV Export (Pro)
- Export button on every data table (transactions, balances, budgets)
- Date range filtering for exports

#### 5c. Scheduled Email Reports (Pro)
- Weekly: spending summary + budget status
- Monthly: full financial report
- Configurable in Settings

**Dependencies to add**:
- `@react-pdf/renderer` or `puppeteer` (PDF generation)

---

### Phase 6: Operational Readiness

**Goal**: Support growth without breaking.

#### 6a. Cron Scaling
- Current: sequential sync of all users in one cron invocation (will timeout)
- Fix: switch to queued per-user jobs via Inngest, QStash, or Vercel Edge Functions
- Each user sync becomes an independent job with retry logic

#### 6b. Rate Limiting
- Add rate limiting to `/api/sync` (prevent abuse)
- Add rate limiting to `/api/chat` (enforce tier limits)
- Use `@upstash/ratelimit` with Redis or in-memory store

#### 6c. Admin Dashboard
- `/admin` route (protected by email allowlist)
- User count, active users, subscription breakdown
- Sync failure monitoring
- Revenue metrics (Stripe dashboard link)

#### 6d. GDPR & Data
- Data export endpoint (all user data as JSON/ZIP)
- Account deletion (cascade delete all user data)
- Privacy policy and terms of service pages

---

## Existing Code Changes Required

| File | Change |
|---|---|
| `proxy.ts` | Add tier-checking middleware for premium routes |
| `app/api/chat/route.ts` | Add rate limiting, conditional web search |
| `app/api/cron/refresh/route.ts` | Refactor from sequential to queued sync |
| `lib/allowed-emails.ts` | Re-enable for invite-only beta |
| `components/settings/` | Add billing section, Plaid connection, CSV import |
| `app/manifest.ts` | Add actual app icons for credible PWA |
| `components/header.tsx` | Add upgrade prompt / tier badge |
| `components/ai-assistant/` | Show query count for free users |

---

## Key Metrics to Track

### Acquisition
- Signups per week
- Data source connection rate (% who connect Sheets/Plaid/CSV)

### Activation
- % who view 3+ pages in first session
- % who use AI assistant in first week
- Time to first data sync

### Revenue
- Free → Trial conversion rate
- Trial → Paid conversion rate
- Monthly recurring revenue (MRR)
- Average revenue per user (ARPU)
- Churn rate (monthly)

### Engagement
- Weekly active users
- AI queries per user per week
- Pages viewed per session
- Sync frequency

---

## What NOT to Build Yet

- Enterprise/white-label tier (premature, no signal)
- Native mobile app (PWA is sufficient)
- Social features or sharing (adds complexity, unclear value)
- Dark mode toggle (not monetizable)
- Multi-currency beyond GBP/USD (wait for demand signal)
- Financial advisor marketplace (too ambitious)

---

## Quick Reference: Build Sequence

1. **Plaid + CSV import** → removes biggest adoption barrier
2. **Stripe billing + tier gating** → enables charging
3. **AI rate limiting + premium AI** → creates free/paid differentiation
4. **Onboarding flow** → improves signup-to-active conversion
5. **Export/reports** → adds Pro retention value
6. **Email lifecycle** → reduces churn
7. **Cron scaling + rate limiting** → operational readiness
8. **Admin dashboard** → visibility into business metrics
