'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useSustainableSpend } from '@/lib/hooks/use-sustainable-spend'
import type { SpendRangePosition } from '@/lib/sustainable-spend'
import { cn } from '@/utils/cn'
import { ArrowDownCircle, ArrowUpCircle, CheckCircle2, AlertCircle, Scale, Settings2 } from 'lucide-react'

const POSITION_CONFIG: Record<
  SpendRangePosition,
  {
    border: string
    text: string
    bg: string
    icon: typeof CheckCircle2
    label: string
  }
> = {
  below_floor: {
    border: 'border-l-indigo-500',
    text: 'text-indigo-600',
    bg: 'bg-indigo-500/15',
    icon: ArrowDownCircle,
    label: 'Below your spending floor',
  },
  in_range: {
    border: 'border-l-green-500',
    text: 'text-green-600',
    bg: 'bg-green-500/15',
    icon: CheckCircle2,
    label: 'Within your sustainable range',
  },
  near_ceiling: {
    border: 'border-l-amber-500',
    text: 'text-amber-600',
    bg: 'bg-amber-500/15',
    icon: AlertCircle,
    label: 'Approaching your sustainable ceiling',
  },
  above_ceiling: {
    border: 'border-l-red-500',
    text: 'text-red-600',
    bg: 'bg-red-500/15',
    icon: ArrowUpCircle,
    label: 'Above your sustainable ceiling',
  },
}

export function SustainableSpendingSection() {
  const { currency } = useCurrency()
  const { data, loading } = useSustainableSpend()

  const symbol = currency === 'USD' ? '$' : '£'
  const formatCurrency = (value: number) => {
    const abs = Math.abs(value)
    if (abs >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000) return `${symbol}${(value / 1_000).toFixed(1)}k`
    return `${symbol}${Math.round(value)}`
  }

  if (loading) {
    return (
      <Card id="sustainable-spending" className="scroll-mt-24">
        <CardHeader className="bg-muted/50">
          <CardTitle className="text-lg">Sustainable Spending</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!data) return null

  const config = POSITION_CONFIG[data.position]
  const Icon = config.icon

  const { floorAnnual, ceilingAnnual, currentForecastSpend } = data
  const axisMax = Math.max(ceilingAnnual * 1.12, currentForecastSpend * 1.05, 1)
  const pct = (v: number) => Math.max(0, Math.min(100, (v / axisMax) * 100))
  const floorPct = pct(floorAnnual)
  const ceilingPct = pct(ceilingAnnual)
  const spendPct = pct(currentForecastSpend)

  const gapToFloor = floorAnnual - currentForecastSpend
  const gapToCeiling = currentForecastSpend - ceilingAnnual

  const headline =
    data.position === 'below_floor'
      ? `Forecast spend is ${formatCurrency(gapToFloor)} below your sustainable floor — you can afford to spend more.`
      : data.position === 'in_range'
        ? 'Forecast spend sits comfortably within your sustainable range.'
        : data.position === 'near_ceiling'
          ? 'Forecast spend is approaching the most you can sustainably spend.'
          : `Forecast spend is ${formatCurrency(gapToCeiling)} above what your income and returns can sustain.`

  return (
    <Card id="sustainable-spending" className={cn('scroll-mt-24 border-l-[3px]', config.border)}>
      <CardHeader className="bg-muted/50">
        <CardTitle className="text-lg flex items-center gap-2">
          <Scale className="h-4 w-4 text-muted-foreground" />
          Sustainable Spending
        </CardTitle>
        <div className="flex items-start gap-2 mt-1">
          <div className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full', config.bg)}>
            <Icon className={cn('h-3.5 w-3.5', config.text)} />
          </div>
          <p className="text-sm text-muted-foreground">
            <span className={cn('font-semibold', config.text)}>{config.label}.</span> {headline}
          </p>
        </div>
      </CardHeader>
      <CardContent className="pt-6 md:pt-6 space-y-5">
        {/* Range bar: floor → ceiling with current forecast spend marker */}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">Annual forecast spend vs sustainable range</span>
            <span className="tabular-nums font-medium">{formatCurrency(currentForecastSpend)}</span>
          </div>
          <div className="relative h-4 w-full">
            <div className="absolute inset-0 rounded-full overflow-hidden bg-muted" aria-hidden>
              {/* Below-floor zone */}
              <div
                className="absolute inset-y-0 left-0 bg-indigo-500/25"
                style={{ width: `${floorPct}%` }}
              />
              {/* Sustainable range */}
              <div
                className="absolute inset-y-0 bg-green-500/40"
                style={{ left: `${floorPct}%`, width: `${Math.max(0, ceilingPct - floorPct)}%` }}
              />
              {/* Above-ceiling zone */}
              <div
                className="absolute inset-y-0 bg-red-500/25"
                style={{ left: `${ceilingPct}%`, width: `${Math.max(0, 100 - ceilingPct)}%` }}
              />
            </div>
            {/* Floor + ceiling ticks */}
            <div
              className="absolute top-0 bottom-0 w-0.5 min-w-[2px] bg-indigo-600 -translate-x-1/2 rounded z-10"
              style={{ left: `${floorPct}%` }}
              title={`Floor: ${formatCurrency(floorAnnual)}`}
              aria-hidden
            />
            <div
              className="absolute top-0 bottom-0 w-0.5 min-w-[2px] bg-red-600 -translate-x-1/2 rounded z-10"
              style={{ left: `${ceilingPct}%` }}
              title={`Ceiling: ${formatCurrency(ceilingAnnual)}`}
              aria-hidden
            />
            {/* Current spend marker */}
            <div
              className="absolute -top-1 -bottom-1 w-1 min-w-[3px] bg-foreground -translate-x-1/2 rounded z-20"
              style={{ left: `${spendPct}%` }}
              title={`Forecast spend: ${formatCurrency(currentForecastSpend)}`}
              aria-hidden
            />
          </div>
          <div className="relative mt-1.5 h-4 text-[11px] text-muted-foreground" aria-hidden>
            <span
              className="absolute -translate-x-1/2 tabular-nums text-indigo-600 font-medium"
              style={{ left: `${Math.max(5, floorPct)}%` }}
            >
              {formatCurrency(floorAnnual)}
            </span>
            <span
              className="absolute -translate-x-1/2 tabular-nums text-red-600 font-medium"
              style={{ left: `${Math.min(95, ceilingPct)}%` }}
            >
              {formatCurrency(ceilingAnnual)}
            </span>
          </div>
        </div>

        {/* Floor / spend / ceiling stat cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-l-[3px] border-l-indigo-500 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Floor</p>
            <p className="text-lg font-bold tabular-nums text-indigo-600">{formatCurrency(floorAnnual)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Spend less and you out-save your goal</p>
          </div>
          <div className={cn('rounded-lg border border-l-[3px] p-3', config.border)}>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Forecast Spend</p>
            <p className={cn('text-lg font-bold tabular-nums', config.text)}>
              {formatCurrency(currentForecastSpend)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">This year at current pace</p>
          </div>
          <div className="rounded-lg border border-l-[3px] border-l-red-500 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Ceiling</p>
            <p className="text-lg font-bold tabular-nums text-red-600">{formatCurrency(ceilingAnnual)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Most you can spend and preserve real net worth</p>
          </div>
        </div>

        {/* Drivers + assumptions link */}
        <div className="space-y-1 border-t pt-3">
          <p className="text-xs text-muted-foreground">{data.drivers.floor}.</p>
          <p className="text-xs text-muted-foreground">{data.drivers.ceiling}.</p>
          <div className="flex items-center gap-1.5 pt-1">
            <Settings2 className="h-3 w-3 text-muted-foreground" />
            <Link
              href="/settings#financial-assumptions"
              className="text-xs text-muted-foreground underline-offset-4 hover:underline hover:text-foreground"
            >
              {data.hasCustomAssumptions
                ? 'Adjust your financial assumptions'
                : 'Using default assumptions — set yours in Settings'}
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
