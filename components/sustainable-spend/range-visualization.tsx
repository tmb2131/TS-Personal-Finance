'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { SpendRangePosition, SustainableSpendResult } from '@/lib/sustainable-spend'
import { cn } from '@/utils/cn'
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  Scale,
} from 'lucide-react'

const POSITION_CONFIG: Record<
  SpendRangePosition,
  { border: string; text: string; bg: string; icon: typeof CheckCircle2; label: string }
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

interface RangeVisualizationProps {
  result: SustainableSpendResult
  /** Result under the saved assumptions; shown as ghost markers when it differs. */
  savedResult: SustainableSpendResult | null
  symbol: string
}

export function RangeVisualization({ result, savedResult, symbol }: RangeVisualizationProps) {
  const formatCurrency = (value: number) => {
    const abs = Math.abs(value)
    if (abs >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000) return `${symbol}${(value / 1_000).toFixed(1)}k`
    return `${symbol}${Math.round(value)}`
  }
  const formatMonthly = (value: number) => `${formatCurrency(value / 12)}/mo`

  const config = POSITION_CONFIG[result.position]
  const Icon = config.icon

  const { floorAnnual, ceilingAnnual, currentForecastSpend } = result

  // Include the saved range in the axis so ghost markers stay on-scale
  const axisMax = Math.max(
    ceilingAnnual * 1.12,
    (savedResult?.ceilingAnnual ?? 0) * 1.12,
    currentForecastSpend * 1.05,
    1
  )
  const pct = (v: number) => Math.max(0, Math.min(100, (v / axisMax) * 100))
  const floorPct = pct(floorAnnual)
  const ceilingPct = pct(ceilingAnnual)
  const spendPct = pct(currentForecastSpend)

  const showGhost =
    savedResult != null &&
    (Math.abs(savedResult.floorAnnual - floorAnnual) > 1 ||
      Math.abs(savedResult.ceilingAnnual - ceilingAnnual) > 1)

  const gapToFloor = floorAnnual - currentForecastSpend
  const gapToCeiling = currentForecastSpend - ceilingAnnual
  const headline =
    result.position === 'below_floor'
      ? `Forecast spend is ${formatCurrency(gapToFloor)} below your sustainable floor — you can afford to spend more.`
      : result.position === 'in_range'
        ? 'Forecast spend sits comfortably within your sustainable range.'
        : result.position === 'near_ceiling'
          ? 'Forecast spend is approaching the most you can sustainably spend.'
          : `Forecast spend is ${formatCurrency(gapToCeiling)} above what your income and returns can sustain.`

  return (
    <Card className={cn('border-l-[3px]', config.border)}>
      <CardHeader className="bg-muted/50">
        <CardTitle className="text-lg flex items-center gap-2">
          <Scale className="h-4 w-4 text-muted-foreground" />
          Sustainable Spending Range
        </CardTitle>
        <div className="flex items-start gap-2 mt-1">
          <div
            className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
              config.bg
            )}
          >
            <Icon className={cn('h-3.5 w-3.5', config.text)} />
          </div>
          <p className="text-sm text-muted-foreground">
            <span className={cn('font-semibold', config.text)}>{config.label}.</span> {headline}
          </p>
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        {/* Range bar */}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">Annual forecast spend vs sustainable range</span>
            <span className="tabular-nums font-medium">{formatCurrency(currentForecastSpend)}</span>
          </div>
          <div className="relative h-6 w-full">
            <div className="absolute inset-0 rounded-full overflow-hidden bg-muted" aria-hidden>
              <div
                className="absolute inset-y-0 left-0 bg-indigo-500/25 transition-all duration-300 ease-out"
                style={{ width: `${floorPct}%` }}
              />
              <div
                className="absolute inset-y-0 bg-green-500/40 transition-all duration-300 ease-out"
                style={{ left: `${floorPct}%`, width: `${Math.max(0, ceilingPct - floorPct)}%` }}
              />
              <div
                className="absolute inset-y-0 bg-red-500/25 transition-all duration-300 ease-out"
                style={{ left: `${ceilingPct}%`, width: `${Math.max(0, 100 - ceilingPct)}%` }}
              />
            </div>
            {/* Ghost markers for the saved-assumptions range */}
            {showGhost && savedResult && (
              <>
                <div
                  className="absolute -top-1.5 bottom-0 w-0.5 min-w-[2px] border-l-2 border-dashed border-indigo-400/70 -translate-x-1/2 z-10"
                  style={{ left: `${pct(savedResult.floorAnnual)}%` }}
                  title={`Saved floor: ${formatCurrency(savedResult.floorAnnual)}`}
                  aria-hidden
                />
                <div
                  className="absolute -top-1.5 bottom-0 w-0.5 min-w-[2px] border-l-2 border-dashed border-red-400/70 -translate-x-1/2 z-10"
                  style={{ left: `${pct(savedResult.ceilingAnnual)}%` }}
                  title={`Saved ceiling: ${formatCurrency(savedResult.ceilingAnnual)}`}
                  aria-hidden
                />
              </>
            )}
            {/* Floor + ceiling ticks */}
            <div
              className="absolute top-0 bottom-0 w-0.5 min-w-[2px] bg-indigo-600 -translate-x-1/2 rounded z-10 transition-all duration-300 ease-out"
              style={{ left: `${floorPct}%` }}
              title={`Floor: ${formatCurrency(floorAnnual)}`}
              aria-hidden
            />
            <div
              className="absolute top-0 bottom-0 w-0.5 min-w-[2px] bg-red-600 -translate-x-1/2 rounded z-10 transition-all duration-300 ease-out"
              style={{ left: `${ceilingPct}%` }}
              title={`Ceiling: ${formatCurrency(ceilingAnnual)}`}
              aria-hidden
            />
            {/* Current spend marker */}
            <div
              className="absolute -top-1.5 -bottom-1.5 w-1 min-w-[3px] bg-foreground -translate-x-1/2 rounded z-20 transition-all duration-300 ease-out"
              style={{ left: `${spendPct}%` }}
              title={`Forecast spend: ${formatCurrency(currentForecastSpend)}`}
              aria-hidden
            />
          </div>
          <div className="relative mt-2 h-4 text-[11px] text-muted-foreground" aria-hidden>
            <span
              className="absolute -translate-x-1/2 tabular-nums text-indigo-600 font-medium transition-all duration-300 ease-out"
              style={{ left: `${Math.max(5, floorPct)}%` }}
            >
              {formatCurrency(floorAnnual)}
            </span>
            <span
              className="absolute -translate-x-1/2 tabular-nums text-red-600 font-medium transition-all duration-300 ease-out"
              style={{ left: `${Math.min(95, ceilingPct)}%` }}
            >
              {formatCurrency(ceilingAnnual)}
            </span>
          </div>
          {showGhost && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Dashed markers show the range under your saved assumptions.
            </p>
          )}
        </div>

        {/* Floor / spend / ceiling stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border border-l-[3px] border-l-indigo-500 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Floor</p>
            <p className="text-xl font-bold tabular-nums text-indigo-600">
              {formatCurrency(floorAnnual)}
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">{formatMonthly(floorAnnual)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Spend less and you out-save your goal
            </p>
            {showGhost && savedResult && Math.abs(savedResult.floorAnnual - floorAnnual) > 1 && (
              <p className="text-[11px] tabular-nums text-muted-foreground mt-0.5">
                Saved: {formatCurrency(savedResult.floorAnnual)}
              </p>
            )}
          </div>
          <div className={cn('rounded-lg border border-l-[3px] p-3', config.border)}>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Forecast Spend
            </p>
            <p className={cn('text-xl font-bold tabular-nums', config.text)}>
              {formatCurrency(currentForecastSpend)}
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {formatMonthly(currentForecastSpend)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">This year at current pace</p>
          </div>
          <div className="rounded-lg border border-l-[3px] border-l-red-500 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Ceiling</p>
            <p className="text-xl font-bold tabular-nums text-red-600">
              {formatCurrency(ceilingAnnual)}
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {formatMonthly(ceilingAnnual)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Most you can spend and preserve real net worth
            </p>
            {showGhost && savedResult && Math.abs(savedResult.ceilingAnnual - ceilingAnnual) > 1 && (
              <p className="text-[11px] tabular-nums text-muted-foreground mt-0.5">
                Saved: {formatCurrency(savedResult.ceilingAnnual)}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
