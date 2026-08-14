'use client'

import { useMemo } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCurrency } from '@/lib/contexts/currency-context'
import { cn } from '@/utils/cn'
import type { TransactionForecastResult } from '@/lib/forecast-transaction-based'

interface ForecastTopMoversProps {
  data: TransactionForecastResult
}

interface Mover {
  category: string
  delta: number
  pct: number | null
  forecast: number
  prior: number
}

function formatMoney(value: number, symbol: string) {
  const sign = value < 0 ? '-' : ''
  return `${sign}${symbol}${Math.abs(value).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`
}

function formatPct(pct: number | null) {
  if (pct == null || !Number.isFinite(pct)) return '—'
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : ''
  return `${sign}${Math.abs(pct).toFixed(0)}%`
}

export function ForecastTopMovers({ data }: ForecastTopMoversProps) {
  const { currency, fxRate } = useCurrency()
  const symbol = currency === 'USD' ? '$' : '£'

  const movers = useMemo<{ ups: Mover[]; downs: Mover[] }>(() => {
    const all: Mover[] = []
    for (const c of data.ensemble.categories) {
      const forecast = c.fullYearBase
      const prior = c.priorYearActual
      if (forecast <= 0 && prior <= 0) continue
      const delta = forecast - prior
      const pct = prior > 0 ? (delta / prior) * 100 : null
      all.push({ category: c.category, delta, pct, forecast, prior })
    }
    const convert = (v: number) => (currency === 'USD' ? v * (fxRate || 1) : v)
    const mapped = all.map((m) => ({
      ...m,
      delta: convert(m.delta),
      forecast: convert(m.forecast),
      prior: convert(m.prior),
    }))
    const ups = [...mapped].sort((a, b) => b.delta - a.delta).slice(0, 5).filter((m) => m.delta > 0)
    const downs = [...mapped].sort((a, b) => a.delta - b.delta).slice(0, 5).filter((m) => m.delta < 0)
    return { ups, downs }
  }, [data, currency, fxRate])

  if (movers.ups.length === 0 && movers.downs.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top movers vs prior year</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Categories where this year's forecast diverges most from last year's actuals.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <MoverList
            heading="Trending higher"
            icon={TrendingUp}
            tone="up"
            movers={movers.ups}
            symbol={symbol}
          />
          <MoverList
            heading="Trending lower"
            icon={TrendingDown}
            tone="down"
            movers={movers.downs}
            symbol={symbol}
          />
        </div>
      </CardContent>
    </Card>
  )
}

interface MoverListProps {
  heading: string
  icon: typeof TrendingUp
  tone: 'up' | 'down'
  movers: Mover[]
  symbol: string
}

function MoverList({ heading, icon: Icon, tone, movers, symbol }: MoverListProps) {
  return (
    <div className="space-y-2">
      <div
        className={cn(
          'flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide',
          tone === 'up'
            ? 'text-negative'
            : 'text-positive',
        )}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {heading}
      </div>
      {movers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing notable.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {movers.map((m) => (
            <li key={m.category} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{m.category}</p>
                <p className="text-xs text-muted-foreground">
                  {formatMoney(m.prior, symbol)} → {formatMoney(m.forecast, symbol)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p
                  className={cn(
                    'text-sm font-semibold',
                    tone === 'up'
                      ? 'text-negative'
                      : 'text-positive',
                  )}
                >
                  {tone === 'up' ? '+' : ''}
                  {formatMoney(m.delta, symbol)}
                </p>
                <p className="text-xs text-muted-foreground">{formatPct(m.pct)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
