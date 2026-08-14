'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { SpendRangePosition, SustainableSpendResult } from '@/lib/sustainable-spend'
import { cn } from '@/utils/cn'
import {
  AlertCircle,
  AlertTriangle,
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
    border: '',
    text: 'text-muted-foreground',
    bg: 'bg-muted',
    icon: ArrowDownCircle,
    label: 'Below your spending floor',
  },
  in_range: {
    border: 'border-l-positive',
    text: 'text-positive',
    bg: 'bg-positive-tint',
    icon: CheckCircle2,
    label: 'Within your sustainable range',
  },
  near_ceiling: {
    border: '',
    text: 'text-muted-foreground',
    bg: 'bg-muted',
    icon: AlertCircle,
    label: 'Approaching your sustainable ceiling',
  },
  above_ceiling: {
    border: 'border-l-negative',
    text: 'text-negative',
    bg: 'bg-negative-tint',
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
    const sign = value < 0 ? '−' : ''
    if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(1)}k`
    return `${sign}${symbol}${Math.round(abs)}`
  }
  const formatMonthly = (value: number) => `${formatCurrency(value / 12)}/mo`

  const config = POSITION_CONFIG[result.position]
  const Icon = config.icon

  const { floorAnnual, ceilingAnnual, currentForecastSpend, floorExceedsCeiling } = result

  // The ceiling can be negative when the real after-tax return is negative, and
  // the floor can sit above it when committed spending exceeds what is
  // sustainable. Both are real states, so the axis has to span them rather than
  // clamping at zero.
  const axisMin = Math.min(0, ceilingAnnual * 1.12, (savedResult?.ceilingAnnual ?? 0) * 1.12)
  const axisMax = Math.max(
    ceilingAnnual * 1.12,
    floorAnnual * 1.12,
    (savedResult?.ceilingAnnual ?? 0) * 1.12,
    currentForecastSpend * 1.05,
    1
  )
  const span = axisMax - axisMin || 1
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - axisMin) / span) * 100))

  // Bands are drawn from the lower of the two bounds to the higher, so the same
  // code path handles a normal range and an inverted one.
  const lo = Math.min(floorAnnual, ceilingAnnual)
  const hi = Math.max(floorAnnual, ceilingAnnual)
  const loPct = pct(lo)
  const hiPct = pct(hi)
  const floorPct = pct(floorAnnual)
  const ceilingPct = pct(ceilingAnnual)
  const spendPct = pct(currentForecastSpend)
  const zeroPct = axisMin < 0 ? pct(0) : null

  const showGhost =
    savedResult != null &&
    (Math.abs(savedResult.floorAnnual - floorAnnual) > 1 ||
      Math.abs(savedResult.ceilingAnnual - ceilingAnnual) > 1)

  const gapToFloor = floorAnnual - currentForecastSpend
  const gapToCeiling = currentForecastSpend - ceilingAnnual
  const headline = floorExceedsCeiling
    ? `There is no sustainable range: committed spending of ${formatCurrency(floorAnnual)} already exceeds the ${formatCurrency(ceilingAnnual)} ceiling by ${formatCurrency(floorAnnual - ceilingAnnual)}.`
    : result.position === 'below_floor'
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
        {floorExceedsCeiling && (
          <div className="rounded-md border border-negative bg-negative-tint p-3 text-xs space-y-1.5">
            <p className="flex items-center gap-1.5 font-semibold text-negative">
              <AlertTriangle className="h-3.5 w-3.5" />
              Inverted range
            </p>
            <p className="text-muted-foreground">
              The floor sits above the ceiling, so no spending level satisfies both. Everything
              between {formatCurrency(ceilingAnnual)} and {formatCurrency(floorAnnual)} is
              contractually committed but erodes real net worth. Closing the gap needs some
              combination of higher returns, lower commitments, or more inflows — the amber band
              below is the size of the problem.
            </p>
          </div>
        )}
        {!floorExceedsCeiling && ceilingAnnual < 0 && (
          <div className="rounded-md border border-negative bg-negative-tint p-3 text-xs space-y-1.5">
            <p className="flex items-center gap-1.5 font-semibold text-negative">
              <AlertTriangle className="h-3.5 w-3.5" />
              Negative ceiling
            </p>
            <p className="text-muted-foreground">
              The real after-tax return is negative and large enough to outweigh inflows. Preserving
              real net worth would require adding {formatCurrency(Math.abs(ceilingAnnual))} a year
              rather than spending anything.
            </p>
          </div>
        )}

        {/* Range bar */}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">Annual forecast spend vs sustainable range</span>
            <span className="tabular-nums font-medium">{formatCurrency(currentForecastSpend)}</span>
          </div>
          <div className="relative h-6 w-full">
            <div className="absolute inset-0 rounded-full overflow-hidden bg-muted" aria-hidden>
              <div
                className="absolute inset-y-0 left-0 bg-muted transition-all duration-300 ease-out"
                style={{ width: `${loPct}%` }}
              />
              <div
                className={cn(
                  'absolute inset-y-0 transition-all duration-300 ease-out',
                  floorExceedsCeiling ? 'bg-muted' : 'bg-positive-tint'
                )}
                style={{ left: `${loPct}%`, width: `${Math.max(0, hiPct - loPct)}%` }}
              />
              <div
                className="absolute inset-y-0 bg-negative-tint transition-all duration-300 ease-out"
                style={{ left: `${hiPct}%`, width: `${Math.max(0, 100 - hiPct)}%` }}
              />
            </div>
            {/* Zero line, only when the axis extends below it */}
            {zeroPct != null && (
              <div
                className="absolute top-0 bottom-0 w-px bg-foreground/30 z-10"
                style={{ left: `${zeroPct}%` }}
                title="Zero"
                aria-hidden
              />
            )}
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
                  className="absolute -top-1.5 bottom-0 w-0.5 min-w-[2px] border-l-2 border-dashed border-negative -translate-x-1/2 z-10"
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
              className="absolute top-0 bottom-0 w-0.5 min-w-[2px] bg-negative -translate-x-1/2 rounded z-10 transition-all duration-300 ease-out"
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
              className="absolute -translate-x-1/2 tabular-nums text-muted-foreground font-medium transition-all duration-300 ease-out"
              style={{ left: `${Math.min(95, Math.max(5, floorPct))}%` }}
            >
              {formatCurrency(floorAnnual)}
            </span>
            <span
              className="absolute -translate-x-1/2 tabular-nums text-negative font-medium transition-all duration-300 ease-out"
              style={{ left: `${Math.min(95, Math.max(5, ceilingPct))}%` }}
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
          <div className="rounded-lg border p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Floor</p>
            <p className="text-xl font-bold tabular-nums text-muted-foreground">
              {formatCurrency(floorAnnual)}
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">{formatMonthly(floorAnnual)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {result.floorClampedToCommitted
                ? 'Your committed recurring spend'
                : 'Spend less and you out-save your goal'}
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
          <div className="rounded-lg border border-l-[3px] border-l-negative p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Ceiling</p>
            <p className="text-xl font-bold tabular-nums text-negative">
              {formatCurrency(ceilingAnnual)}
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {formatMonthly(ceilingAnnual)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {ceilingAnnual < 0
                ? 'Real returns are negative — any spending erodes capital'
                : 'Most you can spend and preserve real net worth'}
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
