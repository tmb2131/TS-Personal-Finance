import type {
  AccountBalance,
  AnnualTrend,
  MonthlyTrend,
  RecurringPayment,
} from '@/lib/types'
import type { ForecastByCategoryItem } from '@/lib/insights-data'
import {
  LIQUID_CATEGORIES,
  accountsOnBasis,
  toGbp,
  totalAssetsGbp,
} from '@/lib/account-totals'

export type ObservationKind = 'allocation' | 'spending'
export type ObservationSeverity = 'info' | 'notable' | 'attention'
export type ObservationUnit = '%' | 'GBP' | 'USD' | 'days' | 'count'

export interface ObservationMetric {
  label: string
  value: number
  unit: ObservationUnit
}

export interface ObservationEvidenceRow {
  label: string
  value: number | string
  subtotal?: boolean
}

export interface Observation {
  id: string
  kind: ObservationKind
  detector: string
  severity: ObservationSeverity
  title: string
  oneLiner: string
  metric: ObservationMetric
  evidence: ObservationEvidenceRow[]
  comparators?: { vsLastYear?: number; vsBudget?: number; zScore?: number }
  baseCurrency: 'GBP' | 'USD'
  asOf: string
  drillIn?: { href: string; label: string }
  rankScore: number
}

export interface ObservationsInput {
  accounts: AccountBalance[]
  recurring: RecurringPayment[]
  annualTrends: AnnualTrend[]
  monthlyTrends: MonthlyTrend[]
  forecastByCategory: ForecastByCategoryItem[]
  gbpUsdRate: number
  baseCurrency: 'GBP' | 'USD'
  asOf: string
}

const EXPENSE_EXCLUDED_CATEGORIES = new Set([
  'Income',
  'Gift Money',
  'Other Income',
  'Excluded',
])

const STALE_DAYS = 60
const NOISE_FLOOR_GBP = 500
const CONCENTRATION_TOP1_THRESHOLD = 0.25
const CONCENTRATION_TOP3_THRESHOLD = 0.6
const CASH_LOW_YIELD_THRESHOLD = 0.2
const FX_EXPOSURE_THRESHOLD = 0.15
const YOY_SPIKE_THRESHOLD = 0.25
const Z_SCORE_THRESHOLD = 2
const FORECAST_OVER_BUDGET_THRESHOLD = 1.1

const LOW_YIELD_CATEGORIES = new Set(['Cash', 'Checking'])

/**
 * Spending is in sterling, so non-GBP holdings carry the FX risk regardless of
 * which currency the screen is currently displaying. Anchoring the exposure to
 * `baseCurrency` meant toggling the header to USD inverted the observation and
 * called sterling holdings the exposure.
 */
const SPENDING_CURRENCY = 'GBP'

const BANLIST_REGEX = /\b(move|switch|consider|should|recommend(?:ed|s)?|buy|sell|invest in|cut|reduce|trim|increase|decrease|allocate|reallocate)\b/i

/** Shared with every other surface — see lib/account-totals. */
const convertToGbp = toGbp

function convertGbpToBase(amountGbp: number, baseCurrency: 'GBP' | 'USD', rate: number): number {
  if (baseCurrency === 'GBP') return amountGbp
  return amountGbp * rate
}

function formatCurrency(amount: number, currency: 'GBP' | 'USD'): string {
  const symbol = currency === 'GBP' ? '£' : '$'
  return `${symbol}${Math.abs(amount).toLocaleString('en-US', { maximumFractionDigits: 0 })}${amount < 0 ? ' (cr)' : ''}`
}

function daysSince(dateISO: string, asOfISO: string): number {
  const a = new Date(dateISO).getTime()
  const b = new Date(asOfISO).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.max(0, Math.round((b - a) / (1000 * 60 * 60 * 24)))
}

/** Past this, a day count stops being information. */
const AGE_AS_DATE_DAYS = 180

/**
 * "2517+ days" is not a fact anyone can use. Past roughly six months a date
 * reads better than a day count — "since May 2019" lands immediately.
 */
function formatAge(dateISO: string | null | undefined, asOfISO: string): string {
  const days = daysSince(dateISO ?? '', asOfISO)
  if (days <= AGE_AS_DATE_DAYS) return `${days} days`

  const date = new Date(dateISO ?? '')
  if (Number.isNaN(date.getTime())) return `${days} days`
  return `since ${date.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })}`
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(1, v))
}

interface DetectorMeta {
  /** Higher priority breaks ties when scores are equal. */
  priority: number
}

const DETECTOR_META: Record<string, DetectorMeta> = {
  'top-account-concentration': { priority: 9 },
  'cash-low-yield': { priority: 8 },
  'fx-exposure': { priority: 7 },
  'stale-balances': { priority: 5 },
  'recurring-review-backlog': { priority: 4 },
  'yoy-category-spike': { priority: 9 },
  'monthly-outlier': { priority: 8 },
  'forecast-over-budget': { priority: 7 },
  'recurring-run-rate': { priority: 5 },
}

const SEVERITY_WEIGHT: Record<ObservationSeverity, number> = {
  info: 1,
  notable: 3,
  attention: 6,
}

/**
 * Deduped, category-normalized, trust-excluded account rows.
 *
 * This module used to sum every account into `totalAssetsGbp`, so the Brosens
 * 2012 trust was silently the largest holding in the app's own narration of the
 * balance sheet — "39% of assets in one account · JP Morgan Chase" was an
 * artefact of counting capital every other surface had decided not to count.
 * Every allocation detector now reads the spendable basis, and the panel
 * carries TRUST_EXCLUSION_LABEL to say so.
 */
function spendableAccounts(accounts: AccountBalance[]) {
  return accountsOnBasis(accounts, 'spendable')
}

function detectTopAccountConcentration(input: ObservationsInput): Observation[] {
  const accounts = spendableAccounts(input.accounts)
  const valued = accounts
    .map((acc) => {
      const gbp = convertToGbp(acc.balance_total_local ?? 0, acc.currency, input.gbpUsdRate)
      return {
        gbp,
        base: convertGbpToBase(gbp, input.baseCurrency, input.gbpUsdRate),
        institution: acc.institution,
        account_name: acc.account_name,
        category: acc.category,
      }
    })
    .filter((a) => a.gbp > 0)
    .sort((a, b) => b.gbp - a.gbp)

  // The one function that produces total assets, on the spendable basis. The
  // shares below are stated against the same denominator Position reports.
  const totalAssets = totalAssetsGbp(input.accounts, input.gbpUsdRate, 'spendable')
  if (totalAssets <= 0 || valued.length === 0) return []

  const out: Observation[] = []
  const top1 = valued[0]
  const top1Pct = top1.gbp / totalAssets

  if (top1Pct >= CONCENTRATION_TOP1_THRESHOLD) {
    const severity: ObservationSeverity =
      top1Pct >= 0.5 ? 'attention' : top1Pct >= 0.35 ? 'notable' : 'info'
    out.push({
      id: 'allocation.top-account-concentration',
      kind: 'allocation',
      detector: 'top-account-concentration',
      severity,
      title: `${(top1Pct * 100).toFixed(0)}% of assets in one account`,
      oneLiner: `${top1.institution} · ${top1.account_name} holds ${formatCurrency(top1.base, input.baseCurrency)} of your ${formatCurrency(convertGbpToBase(totalAssets, input.baseCurrency, input.gbpUsdRate), input.baseCurrency)} total assets.`,
      metric: { label: 'Top-1 account share', value: top1Pct * 100, unit: '%' },
      evidence: [
        { label: `${top1.institution} · ${top1.account_name}`, value: formatCurrency(top1.base, input.baseCurrency) },
        { label: 'Total assets', value: formatCurrency(convertGbpToBase(totalAssets, input.baseCurrency, input.gbpUsdRate), input.baseCurrency), subtotal: true },
      ],
      baseCurrency: input.baseCurrency,
      asOf: input.asOf,
      drillIn: { href: '/position#accounts', label: 'View accounts' },
      rankScore: 0,
    })
  }

  if (valued.length >= 3) {
    const top3 = valued.slice(0, 3)
    const top3Sum = top3.reduce((s, a) => s + a.gbp, 0)
    const top3Pct = top3Sum / totalAssets
    if (top3Pct >= CONCENTRATION_TOP3_THRESHOLD && top1Pct < 0.5) {
      const severity: ObservationSeverity = top3Pct >= 0.8 ? 'notable' : 'info'
      out.push({
        id: 'allocation.top3-account-concentration',
        kind: 'allocation',
        detector: 'top-account-concentration',
        severity,
        title: `${(top3Pct * 100).toFixed(0)}% of assets in top 3 accounts`,
        oneLiner: `Three accounts at ${top3.map((a) => a.institution).join(', ')} hold ${(top3Pct * 100).toFixed(0)}% of your total assets.`,
        metric: { label: 'Top-3 account share', value: top3Pct * 100, unit: '%' },
        evidence: [
          ...top3.map((a) => ({
            label: `${a.institution} · ${a.account_name}`,
            value: formatCurrency(convertGbpToBase(a.gbp, input.baseCurrency, input.gbpUsdRate), input.baseCurrency),
          })),
          { label: 'Top-3 subtotal', value: formatCurrency(convertGbpToBase(top3Sum, input.baseCurrency, input.gbpUsdRate), input.baseCurrency), subtotal: true },
          { label: 'Total assets', value: formatCurrency(convertGbpToBase(totalAssets, input.baseCurrency, input.gbpUsdRate), input.baseCurrency), subtotal: true },
        ],
        baseCurrency: input.baseCurrency,
        asOf: input.asOf,
        drillIn: { href: '/position#accounts', label: 'View accounts' },
        rankScore: 0,
      })
    }
  }

  return out
}

function detectCashLowYield(input: ObservationsInput): Observation[] {
  const accounts = spendableAccounts(input.accounts)
  const liquid = accounts.filter((a) => LIQUID_CATEGORIES.has(a.category))
  const totalLiquidGbp = liquid.reduce(
    (s, a) => s + convertToGbp(a.balance_total_local ?? 0, a.currency, input.gbpUsdRate),
    0
  )
  if (totalLiquidGbp <= 0) return []

  const lowYieldAccounts = liquid.filter((a) => LOW_YIELD_CATEGORIES.has(a.category))
  const lowYieldGbp = lowYieldAccounts.reduce(
    (s, a) => s + convertToGbp(a.balance_total_local ?? 0, a.currency, input.gbpUsdRate),
    0
  )
  const pct = lowYieldGbp / totalLiquidGbp
  if (pct < CASH_LOW_YIELD_THRESHOLD) return []

  const severity: ObservationSeverity = pct >= 0.5 ? 'attention' : pct >= 0.3 ? 'notable' : 'info'
  return [
    {
      id: 'allocation.cash-low-yield',
      kind: 'allocation',
      detector: 'cash-low-yield',
      severity,
      title: `${(pct * 100).toFixed(0)}% of liquid assets in Cash/Checking`,
      oneLiner: `${formatCurrency(convertGbpToBase(lowYieldGbp, input.baseCurrency, input.gbpUsdRate), input.baseCurrency)} of ${formatCurrency(convertGbpToBase(totalLiquidGbp, input.baseCurrency, input.gbpUsdRate), input.baseCurrency)} liquid sits in Cash or Checking categories as of ${input.asOf}.`,
      metric: { label: 'Cash share of liquid', value: pct * 100, unit: '%' },
      evidence: [
        ...lowYieldAccounts
          .map((a) => {
            const gbp = convertToGbp(a.balance_total_local ?? 0, a.currency, input.gbpUsdRate)
            return {
              label: `${a.institution} · ${a.account_name} (${a.category})`,
              value: formatCurrency(convertGbpToBase(gbp, input.baseCurrency, input.gbpUsdRate), input.baseCurrency),
              gbp,
            }
          })
          .sort((a, b) => b.gbp - a.gbp)
          .map(({ gbp: _gbp, ...row }) => row),
        { label: 'Cash/Checking subtotal', value: formatCurrency(convertGbpToBase(lowYieldGbp, input.baseCurrency, input.gbpUsdRate), input.baseCurrency), subtotal: true },
        { label: 'Total liquid', value: formatCurrency(convertGbpToBase(totalLiquidGbp, input.baseCurrency, input.gbpUsdRate), input.baseCurrency), subtotal: true },
      ],
      baseCurrency: input.baseCurrency,
      asOf: input.asOf,
      drillIn: { href: '/position#liquidity', label: 'View liquidity' },
      rankScore: 0,
    },
  ]
}

/**
 * FX exposure is a fact about the mismatch between what is held and what is
 * spent, not about what the screen is currently displaying.
 *
 * This compared each account's currency against `input.baseCurrency`, so
 * flipping the header toggle to USD inverted the finding and reported sterling
 * holdings as the exposure. Spending is in sterling; non-GBP holdings carry the
 * risk either way. `baseCurrency` now affects formatting only, so the measured
 * exposure is identical under both settings.
 */
function detectFxExposure(input: ObservationsInput): Observation[] {
  const accounts = spendableAccounts(input.accounts)
  const liquid = accounts.filter((a) => LIQUID_CATEGORIES.has(a.category))
  const totalLiquidGbp = liquid.reduce(
    (s, a) => s + convertToGbp(a.balance_total_local ?? 0, a.currency, input.gbpUsdRate),
    0
  )
  if (totalLiquidGbp <= 0) return []

  const nonSterling = liquid.filter(
    (a) => (a.currency ?? '').trim().toUpperCase() !== SPENDING_CURRENCY
  )
  const nonSterlingGbp = nonSterling.reduce(
    (s, a) => s + convertToGbp(a.balance_total_local ?? 0, a.currency, input.gbpUsdRate),
    0
  )
  const pct = nonSterlingGbp / totalLiquidGbp
  if (pct < FX_EXPOSURE_THRESHOLD) return []

  const byCurrency = nonSterling.reduce<Record<string, number>>((acc, a) => {
    const gbp = convertToGbp(a.balance_total_local ?? 0, a.currency, input.gbpUsdRate)
    const code = (a.currency ?? '').trim().toUpperCase()
    acc[code] = (acc[code] ?? 0) + gbp
    return acc
  }, {})

  const severity: ObservationSeverity = pct >= 0.5 ? 'notable' : 'info'
  return [
    {
      id: 'allocation.fx-exposure',
      kind: 'allocation',
      detector: 'fx-exposure',
      severity,
      title: `${(pct * 100).toFixed(0)}% of liquid assets in non-${SPENDING_CURRENCY} currencies`,
      oneLiner: `${formatCurrency(convertGbpToBase(nonSterlingGbp, input.baseCurrency, input.gbpUsdRate), input.baseCurrency)} of liquid net worth is held in currencies other than ${SPENDING_CURRENCY}, while spending is in ${SPENDING_CURRENCY}.`,
      metric: { label: `Non-${SPENDING_CURRENCY} FX share`, value: pct * 100, unit: '%' },
      evidence: [
        ...Object.entries(byCurrency)
          .sort(([, a], [, b]) => b - a)
          .map(([ccy, gbp]) => ({
            label: `${ccy} liquid`,
            value: formatCurrency(convertGbpToBase(gbp, input.baseCurrency, input.gbpUsdRate), input.baseCurrency),
          })),
        { label: 'Total liquid', value: formatCurrency(convertGbpToBase(totalLiquidGbp, input.baseCurrency, input.gbpUsdRate), input.baseCurrency), subtotal: true },
      ],
      baseCurrency: input.baseCurrency,
      asOf: input.asOf,
      drillIn: { href: '/position#liquidity', label: 'View liquidity' },
      rankScore: 0,
    },
  ]
}

function detectStaleBalances(input: ObservationsInput): Observation[] {
  const accounts = spendableAccounts(input.accounts)
  const stale = accounts.filter(
    (a) => a.date_updated && daysSince(a.date_updated, input.asOf) > STALE_DAYS
  )
  if (stale.length === 0) return []

  const totalStaleGbp = stale.reduce(
    (s, a) => s + convertToGbp(Math.abs(a.balance_total_local ?? 0), a.currency, input.gbpUsdRate),
    0
  )
  if (totalStaleGbp < NOISE_FLOOR_GBP) return []

  const oldestRow = stale.reduce((oldestSoFar, a) =>
    daysSince(a.date_updated, input.asOf) > daysSince(oldestSoFar.date_updated, input.asOf)
      ? a
      : oldestSoFar
  )
  const oldest = daysSince(oldestRow.date_updated, input.asOf)

  const severity: ObservationSeverity = oldest > 180 ? 'notable' : 'info'
  return [
    {
      id: 'allocation.stale-balances',
      kind: 'allocation',
      detector: 'stale-balances',
      severity,
      title: `${stale.length} account${stale.length === 1 ? '' : 's'} not updated in over ${STALE_DAYS} days`,
      oneLiner: `${formatCurrency(convertGbpToBase(totalStaleGbp, input.baseCurrency, input.gbpUsdRate), input.baseCurrency)} sits in accounts whose oldest balance has stood ${formatAge(oldestRow.date_updated, input.asOf)}.`,
      metric: { label: 'Stale accounts', value: stale.length, unit: 'count' },
      evidence: stale
        .map((a) => ({
          label: `${a.institution} · ${a.account_name}`,
          value: `${formatAge(a.date_updated, input.asOf)} · ${formatCurrency(convertGbpToBase(convertToGbp(a.balance_total_local ?? 0, a.currency, input.gbpUsdRate), input.baseCurrency, input.gbpUsdRate), input.baseCurrency)}`,
          days: daysSince(a.date_updated, input.asOf),
        }))
        .sort((a, b) => b.days - a.days)
        .map(({ days: _days, ...row }) => row),
      baseCurrency: input.baseCurrency,
      asOf: input.asOf,
      drillIn: { href: '/position#accounts', label: 'View accounts' },
      rankScore: 0,
    },
  ]
}

function detectRecurringReviewBacklog(input: ObservationsInput): Observation[] {
  const flagged = input.recurring.filter((r) => r.needs_review)
  if (flagged.length === 0) return []

  const totalAnnualGbp = flagged.reduce((s, r) => s + (r.annualized_amount_gbp ?? 0), 0)
  if (totalAnnualGbp < NOISE_FLOOR_GBP) return []

  const severity: ObservationSeverity =
    flagged.length >= 10 ? 'notable' : 'info'

  return [
    {
      id: 'allocation.recurring-review-backlog',
      kind: 'allocation',
      detector: 'recurring-review-backlog',
      severity,
      title: `${flagged.length} recurring charges flagged for review`,
      oneLiner: `${flagged.length} recurring payments totalling ${formatCurrency(convertGbpToBase(totalAnnualGbp, input.baseCurrency, input.gbpUsdRate), input.baseCurrency)}/yr are flagged in your data.`,
      metric: { label: 'Flagged recurring', value: flagged.length, unit: 'count' },
      evidence: [
        ...flagged
          .slice()
          .sort((a, b) => (b.annualized_amount_gbp ?? 0) - (a.annualized_amount_gbp ?? 0))
          .slice(0, 8)
          .map((r) => ({
            label: r.name,
            value: formatCurrency(convertGbpToBase(r.annualized_amount_gbp ?? 0, input.baseCurrency, input.gbpUsdRate), input.baseCurrency) + '/yr',
          })),
        { label: 'Total flagged annualized', value: formatCurrency(convertGbpToBase(totalAnnualGbp, input.baseCurrency, input.gbpUsdRate), input.baseCurrency) + '/yr', subtotal: true },
      ],
      baseCurrency: input.baseCurrency,
      asOf: input.asOf,
      drillIn: { href: '/spending#recurring', label: 'View recurring' },
      rankScore: 0,
    },
  ]
}

function detectYoyCategorySpike(input: ObservationsInput): Observation[] {
  const candidates = input.annualTrends
    .filter((t) => !EXPENSE_EXCLUDED_CATEGORIES.has(t.category))
    .map((t) => {
      const lastYear = t.cur_yr_minus_1 ?? 0
      const thisYearEst = t.cur_yr_est ?? 0
      const absDelta = Math.abs(thisYearEst) - Math.abs(lastYear)
      const pct = Math.abs(lastYear) > 0 ? absDelta / Math.abs(lastYear) : 0
      return { category: t.category, lastYear, thisYearEst, absDelta, pct }
    })
    .filter((c) => c.pct >= YOY_SPIKE_THRESHOLD && Math.abs(c.absDelta) >= NOISE_FLOOR_GBP)
    .sort((a, b) => b.absDelta - a.absDelta)

  if (candidates.length === 0) return []
  const top = candidates[0]
  const severity: ObservationSeverity =
    top.pct >= 0.5 ? 'attention' : top.pct >= 0.35 ? 'notable' : 'info'

  const formatYr = (v: number) =>
    formatCurrency(convertGbpToBase(Math.abs(v), input.baseCurrency, input.gbpUsdRate), input.baseCurrency)

  return [
    {
      id: `spending.yoy-spike.${slug(top.category)}`,
      kind: 'spending',
      detector: 'yoy-category-spike',
      severity,
      title: `${top.category} running ${(top.pct * 100).toFixed(0)}% above last year`,
      oneLiner: `${top.category} is tracking at ${formatYr(top.thisYearEst)} this year vs ${formatYr(top.lastYear)} last year (full-year estimate).`,
      metric: { label: 'YoY change', value: top.pct * 100, unit: '%' },
      evidence: candidates.slice(0, 5).map((c) => ({
        label: c.category,
        value: `${formatYr(c.lastYear)} → ${formatYr(c.thisYearEst)} (+${(c.pct * 100).toFixed(0)}%)`,
      })),
      comparators: { vsLastYear: top.pct },
      baseCurrency: input.baseCurrency,
      asOf: input.asOf,
      drillIn: { href: `/spending?section=transaction-analysis&category=${encodeURIComponent(top.category)}`, label: 'View transactions' },
      rankScore: 0,
    },
  ]
}

function detectMonthlyOutlier(input: ObservationsInput): Observation[] {
  const candidates = input.monthlyTrends
    .filter((t) => !EXPENSE_EXCLUDED_CATEGORIES.has(t.category))
    .filter((t) => Math.abs(t.z_score ?? 0) >= Z_SCORE_THRESHOLD)
    .filter((t) => Math.abs(t.cur_month_est ?? 0) >= NOISE_FLOOR_GBP / 4)
    .sort((a, b) => Math.abs(b.z_score ?? 0) - Math.abs(a.z_score ?? 0))

  if (candidates.length === 0) return []
  const top = candidates[0]
  const z = top.z_score ?? 0
  const direction = z > 0 ? 'above' : 'below'
  const severity: ObservationSeverity =
    Math.abs(z) >= 3 ? 'attention' : Math.abs(z) >= 2.5 ? 'notable' : 'info'

  const formatBase = (v: number) =>
    formatCurrency(convertGbpToBase(Math.abs(v), input.baseCurrency, input.gbpUsdRate), input.baseCurrency)

  return [
    {
      id: `spending.monthly-outlier.${slug(top.category)}`,
      kind: 'spending',
      detector: 'monthly-outlier',
      severity,
      title: `${top.category} this month is an outlier (${z >= 0 ? '+' : ''}${z.toFixed(1)}σ)`,
      oneLiner: `${top.category} is tracking at ${formatBase(top.cur_month_est)} this month, ${direction} the typical monthly range.`,
      metric: { label: 'z-score', value: Math.abs(z), unit: 'count' },
      evidence: [
        { label: 'This month estimate', value: formatBase(top.cur_month_est) },
        { label: 'TTM monthly avg', value: formatBase(top.ttm_avg) },
        { label: 'Last 3 months avg', value: formatBase(((top.cur_month_minus_1 ?? 0) + (top.cur_month_minus_2 ?? 0) + (top.cur_month_minus_3 ?? 0)) / 3) },
        { label: 'z-score', value: `${z >= 0 ? '+' : ''}${z.toFixed(2)}` },
      ],
      comparators: { zScore: z },
      baseCurrency: input.baseCurrency,
      asOf: input.asOf,
      drillIn: { href: '/trends#monthly-category-trends', label: 'View monthly trends' },
      rankScore: 0,
    },
  ]
}

function detectForecastVsBudgetGap(input: ObservationsInput): Observation[] {
  const candidates = input.forecastByCategory
    .filter((f) => !EXPENSE_EXCLUDED_CATEGORIES.has(f.category))
    .filter((f) => Math.abs(f.annualBudget) >= NOISE_FLOOR_GBP)
    .map((f) => {
      const ratio = Math.abs(f.annualBudget) > 0 ? Math.abs(f.forecast) / Math.abs(f.annualBudget) : 0
      const overBy = Math.abs(f.forecast) - Math.abs(f.annualBudget)
      return { ...f, ratio, overBy }
    })
    .filter((f) => f.ratio >= FORECAST_OVER_BUDGET_THRESHOLD && f.overBy >= NOISE_FLOOR_GBP)
    .sort((a, b) => b.overBy - a.overBy)

  if (candidates.length === 0) return []
  const top = candidates[0]
  const severity: ObservationSeverity =
    top.ratio >= 1.5 ? 'attention' : top.ratio >= 1.25 ? 'notable' : 'info'

  const formatBase = (v: number) =>
    formatCurrency(convertGbpToBase(Math.abs(v), input.baseCurrency, input.gbpUsdRate), input.baseCurrency)

  return [
    {
      id: `spending.forecast-over-budget.${slug(top.category)}`,
      kind: 'spending',
      detector: 'forecast-over-budget',
      severity,
      title: `${top.category} forecast at ${(top.ratio * 100).toFixed(0)}% of budget`,
      oneLiner: `${top.category} is on track for ${formatBase(top.forecast)} this year vs a ${formatBase(top.annualBudget)} budget.`,
      metric: { label: 'Forecast vs budget', value: top.ratio * 100, unit: '%' },
      evidence: candidates.slice(0, 5).map((c) => ({
        label: c.category,
        value: `${formatBase(c.forecast)} forecast vs ${formatBase(c.annualBudget)} budget (+${formatBase(c.overBy)})`,
      })),
      comparators: { vsBudget: top.ratio },
      baseCurrency: input.baseCurrency,
      asOf: input.asOf,
      drillIn: { href: `/spending?section=transaction-analysis&category=${encodeURIComponent(top.category)}`, label: 'View category' },
      rankScore: 0,
    },
  ]
}

function detectRecurringRunRate(input: ObservationsInput): Observation[] {
  const totalRecurringGbp = input.recurring.reduce(
    (s, r) => s + Math.abs(r.annualized_amount_gbp ?? 0),
    0
  )
  if (totalRecurringGbp < NOISE_FLOOR_GBP) return []

  const totalAnnualSpendGbp = input.annualTrends
    .filter((t) => !EXPENSE_EXCLUDED_CATEGORIES.has(t.category))
    .reduce((s, t) => s + Math.abs(t.cur_yr_est ?? 0), 0)
  if (totalAnnualSpendGbp <= 0) return []

  const pct = totalRecurringGbp / totalAnnualSpendGbp
  if (pct < 0.15) return []

  const severity: ObservationSeverity = pct >= 0.4 ? 'notable' : 'info'
  const formatBase = (v: number) =>
    formatCurrency(convertGbpToBase(v, input.baseCurrency, input.gbpUsdRate), input.baseCurrency)

  const top = input.recurring
    .slice()
    .sort((a, b) => Math.abs(b.annualized_amount_gbp ?? 0) - Math.abs(a.annualized_amount_gbp ?? 0))
    .slice(0, 6)

  return [
    {
      id: 'spending.recurring-run-rate',
      kind: 'spending',
      detector: 'recurring-run-rate',
      severity,
      title: `${(pct * 100).toFixed(0)}% of annual spend is recurring`,
      oneLiner: `Recurring charges total ${formatBase(totalRecurringGbp)}/yr — ${(pct * 100).toFixed(0)}% of your forecast annual spend of ${formatBase(totalAnnualSpendGbp)}.`,
      metric: { label: 'Recurring share', value: pct * 100, unit: '%' },
      evidence: [
        ...top.map((r) => ({
          label: r.name,
          value: formatBase(Math.abs(r.annualized_amount_gbp ?? 0)) + '/yr',
        })),
        { label: 'Total recurring annualized', value: formatBase(totalRecurringGbp) + '/yr', subtotal: true },
        { label: 'Total annual spend (est.)', value: formatBase(totalAnnualSpendGbp), subtotal: true },
      ],
      baseCurrency: input.baseCurrency,
      asOf: input.asOf,
      drillIn: { href: '/spending#recurring', label: 'View recurring' },
      rankScore: 0,
    },
  ]
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function score(o: Observation): number {
  const meta = DETECTOR_META[o.detector] ?? { priority: 0 }
  let magnitudeNorm = 0
  if (o.metric.unit === '%') magnitudeNorm = clamp01(Math.abs(o.metric.value) / 50)
  else if (o.comparators?.zScore !== undefined) magnitudeNorm = clamp01(Math.abs(o.comparators.zScore) / 3)
  else if (o.metric.unit === 'count') magnitudeNorm = clamp01(o.metric.value / 20)
  else magnitudeNorm = 0.3

  const recencyBoost = daysSince(o.asOf, new Date().toISOString().slice(0, 10)) <= 7 ? 0.5 : 0
  return (
    SEVERITY_WEIGHT[o.severity] +
    magnitudeNorm * 4 +
    recencyBoost +
    meta.priority * 0.1
  )
}

function applyDuplicatePenalty(observations: Observation[]): Observation[] {
  const seenDetectors = new Set<string>()
  return observations.map((o) => {
    if (seenDetectors.has(o.detector)) {
      return { ...o, rankScore: o.rankScore - 1.5 }
    }
    seenDetectors.add(o.detector)
    return o
  })
}

function assertDescriptive(o: Observation): void {
  if (process.env.NODE_ENV === 'production') return
  if (BANLIST_REGEX.test(o.title) || BANLIST_REGEX.test(o.oneLiner)) {
    console.warn(
      `[observations] Detector "${o.detector}" produced text containing a banned imperative verb. ` +
        `Title: "${o.title}". One-liner: "${o.oneLiner}". Observations must be descriptive, not prescriptive.`
    )
  }
}

const ALLOCATION_DETECTORS = [
  detectTopAccountConcentration,
  detectCashLowYield,
  detectFxExposure,
  detectStaleBalances,
  detectRecurringReviewBacklog,
]

const SPENDING_DETECTORS = [
  detectYoyCategorySpike,
  detectMonthlyOutlier,
  detectForecastVsBudgetGap,
  detectRecurringRunRate,
]

function rankPool(
  detectors: Array<(input: ObservationsInput) => Observation[]>,
  input: ObservationsInput,
  limit: number
): Observation[] {
  const all: Observation[] = []
  for (const d of detectors) {
    try {
      const obs = d(input)
      for (const o of obs) {
        assertDescriptive(o)
        all.push(o)
      }
    } catch (err) {
      console.error(`[observations] detector "${d.name}" threw`, err)
    }
  }
  const scored = all.map((o) => ({ ...o, rankScore: score(o) }))
  const penalized = applyDuplicatePenalty(
    scored.slice().sort((a, b) => b.rankScore - a.rankScore || a.id.localeCompare(b.id))
  )
  return penalized
    .slice()
    .sort((a, b) => b.rankScore - a.rankScore || a.id.localeCompare(b.id))
    .slice(0, limit)
}

export function rankAllocationObservations(
  input: ObservationsInput,
  limit = 5
): Observation[] {
  return rankPool(ALLOCATION_DETECTORS, input, limit)
}

export function rankSpendingObservations(
  input: ObservationsInput,
  limit = 5
): Observation[] {
  return rankPool(SPENDING_DETECTORS, input, limit)
}
