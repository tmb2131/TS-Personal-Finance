'use client'

import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  ResponsiveContainer,
} from 'recharts'
import { Activity, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useForecastGapOverTime } from '@/lib/hooks/queries/use-forecast-gap-over-time'
import { useCurrency } from '@/lib/contexts/currency-context'
import { toLocalDateString } from '@/lib/daily-summary-utils'
import { addCalendarDays } from '@/lib/daily-today-metrics'
import { cn } from '@/utils/cn'

const TREND_THRESHOLD = 0.5

type TrendDirection = 'improving' | 'worsening' | 'stable'

type ForecastWeekTrendCardProps = {
  cardContentClass?: string
  onNavigate?: (path: string) => void
}

function formatCompactCurrency(value: number, currency: 'GBP' | 'USD') {
  const abs = Math.abs(value)
  const symbol = currency === 'USD' ? '$' : '£'
  if (abs >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${symbol}${(value / 1_000).toFixed(1)}k`
  return `${symbol}${Math.round(value)}`
}

const TREND_CONFIG: Record<
  TrendDirection,
  {
    label: string
    borderClass: string
    bgClass: string
    lineColor: string
    textClass: string
    pillClass: string
    iconBgClass: string
    iconTextClass: string
  }
> = {
  improving: {
    label: 'Improving',
    borderClass: 'border-l-green-500',
    bgClass: 'bg-gradient-to-br from-green-500/10 via-green-500/5 to-transparent',
    lineColor: '#22c55e',
    textClass: 'text-green-600 dark:text-green-400',
    pillClass: 'bg-green-500/15 text-green-600 dark:text-green-400',
    iconBgClass: 'bg-green-500/15',
    iconTextClass: 'text-green-600 dark:text-green-400',
  },
  worsening: {
    label: 'Worsening',
    borderClass: 'border-l-red-500',
    bgClass: 'bg-gradient-to-br from-red-500/10 via-red-500/5 to-transparent',
    lineColor: '#ef4444',
    textClass: 'text-red-600 dark:text-red-400',
    pillClass: 'bg-red-500/15 text-red-600 dark:text-red-400',
    iconBgClass: 'bg-red-500/15',
    iconTextClass: 'text-red-600 dark:text-red-400',
  },
  stable: {
    label: 'Stable',
    borderClass: 'border-l-slate-400 dark:border-l-slate-500',
    bgClass: 'bg-gradient-to-br from-muted/30 via-muted/10 to-transparent',
    lineColor: '#64748b',
    textClass: 'text-muted-foreground',
    pillClass: 'bg-muted text-muted-foreground',
    iconBgClass: 'bg-muted',
    iconTextClass: 'text-muted-foreground',
  },
}

function deriveTrend(gaps: number[]): TrendDirection {
  if (gaps.length < 2) return 'stable'
  const delta = gaps[gaps.length - 1] - gaps[0]
  if (delta < -TREND_THRESHOLD) return 'improving'
  if (delta > TREND_THRESHOLD) return 'worsening'
  return 'stable'
}

export function ForecastWeekTrendCard({
  cardContentClass = 'px-4 pb-4 pt-4 sm:px-5 sm:pb-4 sm:pt-5 md:pt-5',
  onNavigate,
}: ForecastWeekTrendCardProps) {
  const { currency, fxRate, convertAmount } = useCurrency()

  const { startDate, endDate } = useMemo(() => {
    const today = toLocalDateString(new Date())
    return {
      startDate: addCalendarDays(today, -7),
      endDate: today,
    }
  }, [])

  const { data: apiData, isLoading, error } = useForecastGapOverTime(startDate, endDate)
  const series = (apiData?.data ?? []) as Array<{ date: string; gap: number }>

  const formatCurrency = (value: number) => formatCompactCurrency(value, currency)

  const chartData = useMemo(() => {
    return series.map((point) => {
      const gapDisplay =
        currency === 'USD' ? convertAmount(point.gap, 'GBP', fxRate) : point.gap
      return { ...point, gapDisplay }
    })
  }, [series, currency, fxRate, convertAmount])

  const sparklineData = useMemo(() => {
    if (chartData.length === 0) return []
    const values = chartData.map((point) => point.gapDisplay)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1
    return chartData.map((point) => ({
      ...point,
      normalized: ((point.gapDisplay - min) / range) * 100,
    }))
  }, [chartData])

  const trend = useMemo(
    () => deriveTrend(chartData.map((point) => point.gapDisplay)),
    [chartData]
  )
  const trendConfig = TREND_CONFIG[trend]

  const weeklyChange = useMemo(() => {
    if (chartData.length < 2) return 0
    return chartData[chartData.length - 1].gapDisplay - chartData[0].gapDisplay
  }, [chartData])

  const changeLabel = useMemo(() => {
    if (Math.abs(weeklyChange) <= TREND_THRESHOLD) return 'Unchanged this week'
    return weeklyChange < 0 ? 'Gap improved' : 'Gap worsened'
  }, [weeklyChange])

  const handleClick = () => {
    onNavigate?.('/analysis#forecast-evolution')
  }

  if (isLoading) {
    return (
      <Card className="overflow-hidden border-l-[3px] border-l-indigo-500/40">
        <CardContent className={cardContentClass}>
          <Skeleton className="h-4 w-24 mb-3" />
          <Skeleton className="h-5 w-16 mb-4" />
          <Skeleton className="h-16 w-full mb-4" />
          <Skeleton className="h-8 w-32" />
        </CardContent>
      </Card>
    )
  }

  if (error || sparklineData.length === 0) {
    return (
      <Card className="overflow-hidden border-l-[3px] border-l-muted-foreground/30">
        <CardContent className={cardContentClass}>
          <button
            type="button"
            onClick={handleClick}
            className="flex items-center justify-between w-full gap-1.5 mb-2 group hover:opacity-70 transition-opacity text-left"
          >
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500/15">
                <Activity className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">Gap Trend</span>
            </div>
            <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
          <p className="text-xs text-muted-foreground">
            {error ? 'Unable to load trend data' : 'No gap trend data for the past week yet'}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card
      className={cn(
        'overflow-hidden border-l-[3px]',
        trendConfig.borderClass,
        trendConfig.bgClass
      )}
    >
      <CardContent className={cardContentClass}>
        <button
          type="button"
          onClick={handleClick}
          className="flex items-center justify-between w-full gap-1.5 mb-2 group hover:opacity-70 transition-opacity text-left"
        >
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full',
                trendConfig.iconBgClass
              )}
            >
              <Activity className={cn('h-4 w-4', trendConfig.iconTextClass)} />
            </div>
            <span className="text-xs font-medium text-muted-foreground">Gap Trend</span>
          </div>
          <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>

        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            trendConfig.pillClass
          )}
        >
          {trendConfig.label}
        </span>

        <div className="mt-3 mb-3 h-16 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={sparklineData}
              margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
            >
              <defs>
                <linearGradient id="gapTrendSparkFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={trendConfig.lineColor} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={trendConfig.lineColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="normalized"
                stroke={trendConfig.lineColor}
                strokeWidth={2}
                fill="url(#gapTrendSparkFill)"
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div
          className={cn(
            'text-3xl sm:text-2xl font-bold tabular-nums leading-none',
            trendConfig.textClass
          )}
        >
          {formatCurrency(Math.abs(weeklyChange))}
        </div>
        <p className={cn('mt-1.5 text-sm opacity-80', trendConfig.textClass)}>
          {changeLabel}
        </p>
      </CardContent>
    </Card>
  )
}
