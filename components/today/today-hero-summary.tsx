'use client'

import { useCurrency } from '@/lib/contexts/currency-context'
import { cn } from '@/utils/cn'
import { TrendingDown, TrendingUp } from 'lucide-react'
import type { MonthToDateSummary } from '@/lib/month-to-date'

type TodayHeroSummaryProps = {
  monthToDate: MonthToDateSummary
  totalSpentToday: number
  spendByMethodology: Record<string, number>
  headroomByMethodology: Record<string, number | null>
  impliedForecastChange: number | null
  /** Est. annual spend (same day fraction as Dashboard: dayOfYear/daysInYear). */
  totalForecastAtCurrentYtd?: number | null
  totalForecastTomorrowAtZero?: number | null
  gapToBudgetCurrent: number | null
  gapToBudgetIfNoMoreSpend: number | null
  onMethodologyClick?: (methodology: string) => void
}

const METHODS_WITH_HEADROOM = ['Annual', 'Linear'] as const

export function TodayHeroSummary({
  monthToDate,
  totalSpentToday,
  spendByMethodology,
  headroomByMethodology,
  impliedForecastChange,
  totalForecastAtCurrentYtd,
  totalForecastTomorrowAtZero,
  gapToBudgetCurrent,
  gapToBudgetIfNoMoreSpend,
  onMethodologyClick,
}: TodayHeroSummaryProps) {
  const { currency, fxRate, convertAmount } = useCurrency()

  const toDisplay = (gbp: number) =>
    currency === 'USD' ? convertAmount(gbp, 'GBP', fxRate) : gbp

  const symbol = currency === 'USD' ? '$' : '£'

  // The sign belongs in front of the symbol: -£313, never £-313.
  const fmt = (value: number) => {
    const abs = Math.abs(value)
    const sign = value < 0 ? '-' : ''
    if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(1)}k`
    return `${sign}${symbol}${Math.round(abs)}`
  }

  const fmtPrecise = (value: number) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)

  const spentDisplay = toDisplay(totalSpentToday)

  const bars = METHODS_WITH_HEADROOM.map((method) => {
    const spend = toDisplay(spendByMethodology[method] ?? 0)
    const headroomRaw = headroomByMethodology[method]
    const headroom =
      headroomRaw != null && Number.isFinite(headroomRaw)
        ? Math.max(0, toDisplay(headroomRaw))
        : 0
    const total = spend + headroom
    const spendPct = total > 0 ? (spend / total) * 100 : 0
    return { method, spend, headroom, total, spendPct }
  }).filter((b) => b.total > 0 || b.spend > 0)

  const hasImpliedChange =
    impliedForecastChange != null && Number.isFinite(impliedForecastChange)
  const estAnnualSpendDisplay =
    totalForecastAtCurrentYtd != null && Number.isFinite(totalForecastAtCurrentYtd)
      ? toDisplay(totalForecastAtCurrentYtd)
      : null
  const gapCurrent =
    gapToBudgetCurrent != null && Number.isFinite(gapToBudgetCurrent)
      ? toDisplay(gapToBudgetCurrent)
      : null
  const gapNoMoreSpend =
    gapToBudgetIfNoMoreSpend != null && Number.isFinite(gapToBudgetIfNoMoreSpend)
      ? toDisplay(gapToBudgetIfNoMoreSpend)
      : null

  const mtdSpend = toDisplay(monthToDate.spendToDate)
  const mtdExpectedToDate = toDisplay(monthToDate.expectedToDate)
  const mtdExpectedMonth = toDisplay(monthToDate.expectedMonthTotal)
  const mtdVariance = toDisplay(monthToDate.varianceToDate)
  const mtdPct =
    mtdExpectedMonth > 0 ? Math.min(100, (mtdSpend / mtdExpectedMonth) * 100) : 0
  const mtdExpectedPct =
    mtdExpectedMonth > 0 ? Math.min(100, (mtdExpectedToDate / mtdExpectedMonth) * 100) : 0
  const daysLeft = monthToDate.daysInMonth - monthToDate.dayOfMonth

  return (
    <div className="space-y-3">
      {/* Q1: Month to date against this month's expected run rate.
             This leads because the commitments that drive this household's
             spend — childcare, school fees, holidays, tax — are decided months
             ahead. A daily allowance measures the wrong thing. */}
      <div className="rounded-xl border bg-card px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
          Month to date
        </p>
        <p className="mt-1 text-4xl font-bold num leading-tight">{fmtPrecise(mtdSpend)}</p>
        <p
          className={cn(
            'mt-1 num text-sm font-medium',
            mtdVariance > 0 ? 'text-negative' : 'text-positive'
          )}
        >
          {mtdVariance > 0 ? 'Ahead of' : 'Behind'} the run rate by{' '}
          {fmtPrecise(Math.abs(mtdVariance))}
        </p>

        {/* Expected-to-date sits as a marker on the month's expected total, so
            the bar shows position within the month rather than an allowance. */}
        <div className="relative mt-3 h-3 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${mtdPct}%`,
              background:
                mtdVariance > 0
                  ? 'var(--color-negative, #ef4444)'
                  : 'var(--color-slate-500, #64748b)',
            }}
          />
          <div
            className="absolute inset-y-0 w-px bg-foreground/60"
            style={{ left: `${mtdExpectedPct}%` }}
            aria-hidden
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground/60">
          <span className="num">{fmtPrecise(mtdExpectedToDate)} expected by today</span>
          <span className="num">{fmtPrecise(mtdExpectedMonth)} expected this month</span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground/60">
          {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left ·{' '}
          {monthToDate.basis === 'history'
            ? `this month's share of the year, averaged over ${monthToDate.historyYears} prior ${
                monthToDate.historyYears === 1 ? 'year' : 'years'
              }`
            : 'no prior years for this month yet, so the year is split evenly'}
        </p>
      </div>

      {/* Q2: Today, demoted to a single line. Kept because a same-day check is
             still occasionally useful, but it is no longer the headline. */}
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
            Spent today
          </span>
          <span className="num text-lg font-semibold">{fmtPrecise(spentDisplay)}</span>
        </div>
      </div>

      {/* Q3: Room to spend by methodology */}
      {bars.length > 0 && (
        <div className="rounded-xl border bg-card px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
            Room to spend today
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground/60">
            Two forecast methodologies, so two allowances. Annual spreads the remaining
            forecast over the days left; Linear spreads the annual budget evenly. Both
            assume spending is smooth, which this household&rsquo;s is not — read them as
            a sense check, not a limit.
          </p>
          <div className="mt-3 space-y-3">
            {bars.map((bar) => (
              <button
                key={bar.method}
                type="button"
                className={cn(
                  'w-full text-left',
                  onMethodologyClick && 'active:opacity-70 transition-opacity'
                )}
                onClick={() => onMethodologyClick?.(bar.method)}
              >
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    {bar.method}
                  </span>
                  <span className="text-xs font-bold num text-positive">
                    {bar.headroom > 0 ? `${fmtPrecise(bar.headroom)} left` : 'None'}
                  </span>
                </div>
                <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, bar.spendPct)}%`,
                      background:
                        bar.headroom > 0
                          ? 'var(--color-slate-500, #64748b)'
                          : 'var(--color-red-500, #ef4444)',
                    }}
                  />
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-[10px] text-muted-foreground/60 num">
                    {fmtPrecise(bar.spend)} spent
                  </span>
                  <span className="text-[10px] text-muted-foreground/60 num">
                    {fmtPrecise(bar.total)} total
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Q3: End of day projection */}
      {(hasImpliedChange || gapNoMoreSpend != null) && (
        <div className="rounded-xl border bg-muted px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
            Tomorrow if no more spend
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground/60">
            Compared with the start of today
          </p>

          <div className="mt-2 space-y-2">
            {estAnnualSpendDisplay != null && hasImpliedChange && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Est. annual spend</span>
                <span className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold num">
                    {fmt(estAnnualSpendDisplay)}
                  </span>
                  <span
                    className={cn(
                      'flex items-center gap-0.5 text-xs font-bold num',
                      impliedForecastChange! > 0
                        ? 'text-negative'
                        : impliedForecastChange! < 0
                          ? 'text-positive'
                          : 'text-muted-foreground'
                    )}
                  >
                    {impliedForecastChange! > 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : impliedForecastChange! < 0 ? (
                      <TrendingDown className="h-3 w-3" />
                    ) : null}
                    {impliedForecastChange! !== 0 &&
                      `${impliedForecastChange! > 0 ? '+' : ''}${fmt(toDisplay(impliedForecastChange!))}`}
                  </span>
                </span>
              </div>
            )}

            {gapNoMoreSpend != null && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Gap to budget</span>
                <span
                  className={cn(
                    'text-sm font-semibold num',
                    gapNoMoreSpend > 0 ? 'text-negative' : 'text-positive'
                  )}
                >
                  {gapNoMoreSpend > 0 ? 'Over' : 'Under'} {fmt(Math.abs(gapNoMoreSpend))}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
