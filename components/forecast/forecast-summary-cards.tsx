'use client'

import { Card, CardContent } from '@/components/ui/card'
import { useCurrency } from '@/lib/contexts/currency-context'
import type { TransactionForecastResult } from '@/lib/forecast-transaction-based'
import { TrendingDown, TrendingUp } from 'lucide-react'

export function ForecastSummaryCards({ data }: { data: TransactionForecastResult }) {
  const { currency, convertAmount } = useCurrency()
  const t = data.ensemble.totals

  const fmt = (gbp: number) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(convertAmount(gbp, 'GBP'))

  const ytdConsumed = t.fullYearBase > 0 ? (t.ytd / t.fullYearBase) * 100 : 0
  const pyDelta = t.priorYearActual > 0 ? ((t.fullYearBase - t.priorYearActual) / t.priorYearActual) * 100 : null
  const range = t.fullYearHigh - t.fullYearLow
  const rangePct = t.fullYearBase > 0 ? (range / t.fullYearBase) * 100 : 0
  const bestFit = data.bestFit
  const pickSummary = bestFit
    ? [
        bestFit.pickCounts.m1 ? `M1×${bestFit.pickCounts.m1}` : null,
        bestFit.pickCounts.m2 ? `M2×${bestFit.pickCounts.m2}` : null,
        bestFit.pickCounts.m3 ? `M3×${bestFit.pickCounts.m3}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null

  return (
    <div className={'grid grid-cols-2 gap-3 ' + (bestFit ? 'md:grid-cols-5' : 'md:grid-cols-4')}>
      <Card>
        <CardContent className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">YTD actual</div>
          <div className="mt-1 text-xl md:text-2xl font-semibold">{fmt(t.ytd)}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {ytdConsumed.toFixed(0)}% of base full-year
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Full-year base
          </div>
          <div className="mt-1 text-xl md:text-2xl font-semibold">{fmt(t.fullYearBase)}</div>
          <div className="mt-1 text-xs text-muted-foreground">Mean across methodologies</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Scenario range
          </div>
          <div className="mt-1 text-xl md:text-2xl font-semibold tabular-nums">
            {fmt(t.fullYearLow)}
            <span className="px-1 text-muted-foreground">–</span>
            {fmt(t.fullYearHigh)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            ±{fmt(range / 2)} ({rangePct.toFixed(0)}% of base)
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            vs {data.year - 1} actual
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            {pyDelta == null ? (
              <span className="text-xl md:text-2xl font-semibold text-muted-foreground">—</span>
            ) : (
              <>
                {pyDelta >= 0 ? (
                  <TrendingUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-positive" />
                )}
                <span
                  className={
                    'text-xl md:text-2xl font-semibold ' +
                    (pyDelta >= 0 ? 'text-muted-foreground dark:text-muted-foreground' : 'text-positive')
                  }
                >
                  {pyDelta >= 0 ? '+' : ''}
                  {pyDelta.toFixed(1)}%
                </span>
              </>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {fmt(t.priorYearActual)} prior year
          </div>
        </CardContent>
      </Card>

      {bestFit && (
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Best fit FY
            </div>
            <div className="mt-1 text-xl md:text-2xl font-semibold">
              {fmt(bestFit.fullYearTotal)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {pickSummary || 'Per-category best methodology'}
              {bestFit.pickCounts.fallback > 0 && (
                <span> · {bestFit.pickCounts.fallback} fallback</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
