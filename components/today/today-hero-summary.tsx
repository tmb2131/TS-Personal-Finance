'use client'

import { useCurrency } from '@/lib/contexts/currency-context'
import { cn } from '@/utils/cn'
import { TrendingDown, TrendingUp } from 'lucide-react'

type TodayHeroSummaryProps = {
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

  const fmt = (value: number) => {
    const abs = Math.abs(value)
    if (abs >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`
    if (abs >= 10_000) return `${symbol}${(value / 1_000).toFixed(1)}k`
    if (abs >= 1_000) return `${symbol}${(value / 1_000).toFixed(1)}k`
    return `${symbol}${Math.round(value)}`
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

  return (
    <div className="space-y-3">
      {/* Q1: Spent today */}
      <div className="rounded-xl border bg-card px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
          Spent today
        </p>
        <p className="mt-1 text-4xl font-bold num leading-tight">
          {fmtPrecise(spentDisplay)}
        </p>
      </div>

      {/* Q2: Room to spend by methodology */}
      {bars.length > 0 && (
        <div className="rounded-xl border bg-card px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
            Room to spend
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground/60">
            Available daily allocation based on your annual budget
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
                    gapNoMoreSpend >= 0 ? 'text-positive' : 'text-negative'
                  )}
                >
                  {gapNoMoreSpend >= 0 ? 'Under' : 'Over'} {fmt(Math.abs(gapNoMoreSpend))}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
