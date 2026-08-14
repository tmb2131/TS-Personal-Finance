'use client'

import { useCurrency } from '@/lib/contexts/currency-context'
import { Card, CardContent } from '@/components/ui/card'
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
    /* One card, four bands.
       These were four sibling boxes with identical borders and identical
       all-caps labels, which gave a reader no way to tell the headline from its
       footnotes — the month, the day, the two allowances and the projection all
       looked equally important. They are one story about this month, so they
       are now one plane, separated by rules and ordered by weight. */
    <Card>
      {/* Q1: Month to date against this month's expected run rate.
             This leads because the commitments that drive this household's
             spend — childcare, school fees, holidays, tax — are decided months
             ahead. A daily allowance measures the wrong thing. */}
      <CardContent className="p-4 md:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="eyebrow">Month to date</p>
          {/* Today, demoted to a trailing figure. Kept because a same-day check
              is still occasionally useful, but it is no longer the headline and
              no longer needs a box of its own. */}
          <p className="text-meta text-muted-foreground">
            Spent today <span className="num font-semibold text-foreground">{fmtPrecise(spentDisplay)}</span>
          </p>
        </div>

        <p className="figure mt-1.5 text-display leading-none">{fmtPrecise(mtdSpend)}</p>
        <p
          className={cn(
            'mt-2 num text-body font-semibold',
            mtdVariance > 0 ? 'text-negative' : 'text-positive'
          )}
        >
          {mtdVariance > 0 ? 'Ahead of' : 'Behind'} the run rate by{' '}
          {fmtPrecise(Math.abs(mtdVariance))}
        </p>

        {/* Expected-to-date sits as a marker on the month's expected total, so
            the bar shows position within the month rather than an allowance. */}
        <div className="meter relative mt-3 h-2.5 w-full">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              mtdVariance > 0 ? 'bg-negative' : 'bg-primary'
            )}
            style={{ width: `${mtdPct}%` }}
          />
          <div
            className="absolute inset-y-0 w-px bg-foreground"
            style={{ left: `${mtdExpectedPct}%` }}
            aria-hidden
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-meta text-muted-foreground">
          <span className="num">{fmtPrecise(mtdExpectedToDate)} expected by today</span>
          <span className="num">{fmtPrecise(mtdExpectedMonth)} expected this month</span>
        </div>
        <p className="mt-1.5 text-meta text-muted-foreground">
          {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left ·{' '}
          {monthToDate.basis === 'history'
            ? `this month's share of the year, averaged over ${monthToDate.historyYears} prior ${
                monthToDate.historyYears === 1 ? 'year' : 'years'
              }`
            : 'no prior years for this month yet, so the year is split evenly'}
        </p>
      </CardContent>

      {/* Q2: Room to spend by methodology */}
      {bars.length > 0 && (
        <div className="border-t border-border p-4 md:p-5">
          <p className="eyebrow">Room to spend today</p>
          <p className="mt-1 text-meta text-muted-foreground">
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
                  'w-full rounded-md text-left',
                  onMethodologyClick && 'active:opacity-70 transition-opacity'
                )}
                onClick={() => onMethodologyClick?.(bar.method)}
              >
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="text-body font-medium">{bar.method}</span>
                  <span
                    className={cn(
                      'num text-body font-semibold',
                      bar.headroom > 0 ? 'text-positive' : 'text-negative'
                    )}
                  >
                    {bar.headroom > 0 ? `${fmtPrecise(bar.headroom)} left` : 'None'}
                  </span>
                </div>
                <div className="meter h-2 w-full">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      bar.headroom > 0 ? 'bg-primary' : 'bg-negative'
                    )}
                    style={{ width: `${Math.min(100, bar.spendPct)}%` }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-meta text-muted-foreground">
                  <span className="num">{fmtPrecise(bar.spend)} spent</span>
                  <span className="num">{fmtPrecise(bar.total)} total</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Q3: End of day projection. On the sunken plane because it is a
             what-if, not a fact about what has happened. */}
      {(hasImpliedChange || gapNoMoreSpend != null) && (
        <div className="surface-sunken border-t border-border p-4 md:p-5">
          <p className="eyebrow">Tomorrow if no more spend</p>
          <p className="mt-1 text-meta text-muted-foreground">Compared with the start of today</p>

          <div className="mt-2.5 space-y-2">
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
    </Card>
  )
}
