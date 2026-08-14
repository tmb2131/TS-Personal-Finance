'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCurrency } from '@/lib/contexts/currency-context'
import type { BacktestResult, MethodologyId } from '@/lib/forecast-transaction-based'
import { Trophy } from 'lucide-react'

const METHOD_LABEL: Record<MethodologyId, string> = {
  m1: 'M1 Seasonal',
  m2: 'M2 Seasonal+Trend',
  m3: 'M3 Fixed+Variable',
}

export function ForecastBacktestPanel({ backtest }: { backtest: BacktestResult }) {
  const { currency, convertAmount } = useCurrency()
  const fmt = (gbp: number) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(convertAmount(gbp, 'GBP'))

  const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`

  // Sort categories by absolute spend descending for visual priority.
  const rows = [...backtest.categories].sort((a, b) => b.actual - a.actual)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg md:text-xl">Backtest — {backtest.year} accuracy</CardTitle>
        <p className="text-xs text-muted-foreground">
          {backtest.backtestYears.length > 1
            ? `Each methodology was backtested against ${backtest.backtestYears[0]}–${backtest.backtestYears[backtest.backtestYears.length - 1]}; per-category err% is averaged across years.`
            : `Each methodology was run on 1 Jan ${backtest.year} using only data from before that year, then compared to actual ${backtest.year} spend.`}
        </p>
      </CardHeader>
      <CardContent className="px-0 md:px-6">
        <div className="px-3 md:px-0 mb-3 flex flex-wrap items-center gap-2">
          <Trophy className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">
            Best methodology for your data:{' '}
            <span className="font-semibold">{METHOD_LABEL[backtest.bestOverall]}</span>{' '}
            <span className="text-muted-foreground">
              ({fmtPct(backtest.totals[`${backtest.bestOverall}Mape`])} weighted MAPE)
            </span>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 text-left">Category</th>
                <th className="px-3 py-2 text-right">Actual</th>
                <th className="px-3 py-2 text-right">M1</th>
                <th className="px-3 py-2 text-right">M1 err</th>
                <th className="px-3 py-2 text-right">M2</th>
                <th className="px-3 py-2 text-right">M2 err</th>
                <th className="px-3 py-2 text-right">M3</th>
                <th className="px-3 py-2 text-right">M3 err</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const best = bestOf(c.m1Mape, c.m2Mape, c.m3Mape)
                return (
                  <tr key={c.category} className="border-b border-border/50">
                    <td className="px-3 py-2 font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        {c.category}
                        {c.lowConfidence && (
                          <span
                            className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/40"
                            title="Low confidence: limited history, lumpy spend, or small absolute amount."
                          />
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right num">{fmt(c.actual)}</td>
                    <td className="px-3 py-2 text-right num text-muted-foreground">{fmt(c.m1)}</td>
                    <td className={'px-3 py-2 text-right num ' + mapeClass(c.m1Mape, best === 0)}>
                      {fmtPct(c.m1Mape)}
                    </td>
                    <td className="px-3 py-2 text-right num text-muted-foreground">{fmt(c.m2)}</td>
                    <td className={'px-3 py-2 text-right num ' + mapeClass(c.m2Mape, best === 1)}>
                      {fmtPct(c.m2Mape)}
                    </td>
                    <td className="px-3 py-2 text-right num text-muted-foreground">{fmt(c.m3)}</td>
                    <td className={'px-3 py-2 text-right num ' + mapeClass(c.m3Mape, best === 2)}>
                      {fmtPct(c.m3Mape)}
                    </td>
                  </tr>
                )
              })}
              <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                <td className="px-3 py-2">Total / Weighted MAPE</td>
                <td className="px-3 py-2 text-right num">{fmt(backtest.totals.actual)}</td>
                <td className="px-3 py-2 text-right num">{fmt(backtest.totals.m1)}</td>
                <td className="px-3 py-2 text-right num">{fmtPct(backtest.totals.m1Mape)}</td>
                <td className="px-3 py-2 text-right num">{fmt(backtest.totals.m2)}</td>
                <td className="px-3 py-2 text-right num">{fmtPct(backtest.totals.m2Mape)}</td>
                <td className="px-3 py-2 text-right num">{fmt(backtest.totals.m3)}</td>
                <td className="px-3 py-2 text-right num">{fmtPct(backtest.totals.m3Mape)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function bestOf(a: number, b: number, c: number): 0 | 1 | 2 {
  const m = Math.min(a, b, c)
  if (m === a) return 0
  if (m === b) return 1
  return 2
}

function mapeClass(mape: number, isBest: boolean): string {
  if (isBest) return 'text-positive font-semibold'
  if (mape > 0.3) return 'text-muted-foreground dark:text-muted-foreground'
  return ''
}
