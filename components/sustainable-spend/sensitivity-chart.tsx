'use client'

import { useMemo, useState } from 'react'
import {
  Area,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getChartFontSizes, getChartTooltipContentStyle } from '@/lib/chart-styles'
import { useChartTheme } from '@/lib/hooks/use-chart-theme'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import type { SustainableSpendInputsData } from '@/lib/hooks/use-sustainable-spend'
import { computeSustainableSpendRange } from '@/lib/sustainable-spend'
import { TrendingUp } from 'lucide-react'
import { toSpendAssumptions, type DraftAssumptions } from './spend-explorer'

type SweepVar = 'inflation' | 'savingsRate' | 'horizon' | 'wealthTarget'

const SWEEP_POINTS = 31

interface SweepConfig {
  label: string
  min: number
  max: number
  current: (draft: DraftAssumptions) => number
  apply: (draft: DraftAssumptions, x: number) => DraftAssumptions
  formatX: (x: number, symbol: string) => string
}

function buildSweepConfigs(draft: DraftAssumptions): Partial<Record<SweepVar, SweepConfig>> {
  const configs: Partial<Record<SweepVar, SweepConfig>> = {
    inflation: {
      label: 'Inflation',
      min: 0,
      max: 10,
      current: (d) => d.inflationRate * 100,
      apply: (d, x) => ({ ...d, inflationRate: x / 100 }),
      formatX: (x) => `${x.toFixed(1)}%`,
    },
  }
  if (draft.floorMode === 'savings_rate') {
    configs.savingsRate = {
      label: 'Savings rate',
      min: 0,
      max: 60,
      current: (d) => d.targetSavingsRate * 100,
      apply: (d, x) => ({ ...d, targetSavingsRate: x / 100 }),
      formatX: (x) => `${Math.round(x)}%`,
    }
  } else if (draft.wealthTarget != null && draft.wealthTarget > 0) {
    configs.horizon = {
      label: 'Horizon',
      min: 1,
      max: 60,
      current: (d) => d.horizonYears,
      apply: (d, x) => ({ ...d, horizonYears: Math.round(x) }),
      formatX: (x) => `${Math.round(x)} yrs`,
    }
    configs.wealthTarget = {
      label: 'Wealth target',
      min: draft.wealthTarget * 0.25,
      max: draft.wealthTarget * 2,
      current: (d) => d.wealthTarget ?? 0,
      apply: (d, x) => ({ ...d, wealthTarget: x }),
      formatX: (x, symbol) =>
        Math.abs(x) >= 1_000_000
          ? `${symbol}${(x / 1_000_000).toFixed(1)}M`
          : `${symbol}${(x / 1_000).toFixed(0)}k`,
    }
  }
  return configs
}

interface SensitivityChartProps {
  inputs: SustainableSpendInputsData
  draft: DraftAssumptions
  symbol: string
}

interface SweepPoint {
  x: number
  floor: number
  ceiling: number
  /** Filled only where the range is the right way up. */
  sustainable: [number, number] | null
  /** Filled only where the floor sits above the ceiling. */
  deficit: [number, number] | null
}

export function SensitivityChart({ inputs, draft, symbol }: SensitivityChartProps) {
  const isMobile = useIsMobile()
  const chartTheme = useChartTheme()
  const fonts = getChartFontSizes(isMobile)
  const [selectedVar, setSelectedVar] = useState<SweepVar>('inflation')

  const configs = useMemo(() => buildSweepConfigs(draft), [draft])
  const availableVars = Object.keys(configs) as SweepVar[]
  const effectiveVar = configs[selectedVar] ? selectedVar : availableVars[0]
  const config = configs[effectiveVar]!

  const { data, currentX, hasDeficit, crossesZero } = useMemo(() => {
    const points: SweepPoint[] = []
    let deficit = false
    let belowZero = false
    for (let i = 0; i < SWEEP_POINTS; i++) {
      const x = config.min + ((config.max - config.min) * i) / (SWEEP_POINTS - 1)
      const result = computeSustainableSpendRange({
        ...inputs,
        assumptions: toSpendAssumptions(config.apply(draft, x)),
      })
      const inverted = result.floorExceedsCeiling
      if (inverted) deficit = true
      if (result.ceilingAnnual < 0) belowZero = true
      points.push({
        x,
        floor: result.floorAnnual,
        ceiling: result.ceilingAnnual,
        // Two bands rather than one. A single [floor, ceiling] Area still fills
        // when the pair inverts, which silently painted an unsustainable gap in
        // the same green as a healthy range.
        sustainable: inverted ? null : [result.floorAnnual, result.ceilingAnnual],
        deficit: inverted ? [result.ceilingAnnual, result.floorAnnual] : null,
      })
    }
    return {
      data: points,
      currentX: config.current(draft),
      hasDeficit: deficit,
      crossesZero: belowZero,
    }
  }, [inputs, draft, config])

  const formatCompact = (value: number) => {
    const abs = Math.abs(value)
    const sign = value < 0 ? '−' : ''
    if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(0)}k`
    return `${sign}${symbol}${Math.round(abs)}`
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          Sensitivity — how one assumption moves the range
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Floor and ceiling as {config.label.toLowerCase()} varies, holding everything else at your
          current settings. Dashed lines mark your current value and forecast spend.
          {hasDeficit
            ? ' Amber marks where the floor rises above the ceiling and no sustainable level exists.'
            : ''}
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {availableVars.map((v) => (
            <Button
              key={v}
              type="button"
              size="sm"
              variant={effectiveVar === v ? 'default' : 'outline'}
              onClick={() => setSelectedVar(v)}
              className="h-7 px-2.5 text-xs"
            >
              {configs[v]!.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-2 flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/60 px-2.5 py-1 font-medium text-foreground">
            <span
              className="h-3 w-0 border-l border-dashed border-foreground/70"
              aria-hidden
            />
            Current {config.label.toLowerCase()}: {config.formatX(currentX, symbol)}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/60 px-2.5 py-1 font-medium text-foreground">
            <span
              className="h-0 w-3 border-t border-dashed border-foreground/70"
              aria-hidden
            />
            Forecast spend: {formatCompact(inputs.annualForecastSpend)}
          </span>
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 12, right: 16, left: 4, bottom: 4 }}>
              <XAxis
                dataKey="x"
                type="number"
                domain={[config.min, config.max]}
                tickFormatter={(x: number) => config.formatX(x, symbol)}
                tick={{ fontSize: fonts.axisTick, fill: chartTheme.axisStroke }}
                stroke={chartTheme.axisStroke}
                tickCount={isMobile ? 4 : 7}
              />
              <YAxis
                tickFormatter={formatCompact}
                tick={{ fontSize: fonts.axisTick, fill: chartTheme.axisStroke }}
                stroke={chartTheme.axisStroke}
                width={56}
              />
              <Tooltip
                contentStyle={getChartTooltipContentStyle(chartTheme, {
                  fontSize: fonts.tooltipMin,
                  isMobile,
                })}
                labelFormatter={(x: number) => `${config.label}: ${config.formatX(x, symbol)}`}
                formatter={(value: number | [number, number], name: string) => {
                  if (Array.isArray(value)) return [null, null]
                  return [formatCompact(value), name]
                }}
              />
              <Area
                dataKey="sustainable"
                name="Sustainable range"
                stroke="none"
                fill="#22c55e"
                fillOpacity={0.18}
                isAnimationActive={false}
                legendType="none"
                tooltipType="none"
                connectNulls={false}
              />
              <Area
                dataKey="deficit"
                name="No sustainable level"
                stroke="none"
                fill="#f59e0b"
                fillOpacity={0.28}
                isAnimationActive={false}
                legendType="none"
                tooltipType="none"
                connectNulls={false}
              />
              <Line
                dataKey="floor"
                name="Floor"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                dataKey="ceiling"
                name="Ceiling"
                stroke="#ef4444"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              {crossesZero && (
                <ReferenceLine y={0} stroke={chartTheme.axisStroke} strokeOpacity={0.6} />
              )}
              <ReferenceLine
                y={inputs.annualForecastSpend}
                stroke={chartTheme.labelFill}
                strokeDasharray="4 4"
                strokeOpacity={0.85}
              />
              <ReferenceLine
                x={Math.max(config.min, Math.min(config.max, currentX))}
                stroke={chartTheme.labelFill}
                strokeDasharray="3 3"
                strokeOpacity={0.85}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-[#ef4444] inline-block" /> Ceiling
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-[#6366f1] inline-block" /> Floor
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded bg-positive-tint inline-block" /> Sustainable range
          </span>
          {hasDeficit && (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-4 rounded bg-muted inline-block" /> No sustainable
              level
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span className="h-0 w-4 border-t border-dashed border-foreground/70 inline-block" />{' '}
            Current value
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0 w-4 border-t border-dashed border-muted-foreground inline-block" />{' '}
            Forecast spend
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
