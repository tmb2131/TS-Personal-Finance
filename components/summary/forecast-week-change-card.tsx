'use client'

import { useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useForecastBridge } from '@/lib/hooks/queries/use-forecast-bridge'
import { useCurrency } from '@/lib/contexts/currency-context'
import { toLocalDateString } from '@/lib/daily-summary-utils'
import { addCalendarDays } from '@/lib/daily-today-metrics'
import {
  GAP_CHANGE_THRESHOLD,
  SummaryGapChangeCard,
} from '@/components/summary/summary-gap-change-card'

type ForecastBridgeResponse = {
  totalStart: number
  totalEnd: number
  drivers: Array<{
    category: string
    delta: number
  }>
}

type ForecastWeekChangeCardProps = {
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

export function ForecastWeekChangeCard({
  cardContentClass = 'px-4 pb-4 pt-4 sm:px-5 sm:pb-4 sm:pt-5 md:pt-5',
  onNavigate,
}: ForecastWeekChangeCardProps) {
  const { currency, fxRate, convertAmount } = useCurrency()

  const { startDate, endDate } = useMemo(() => {
    const today = toLocalDateString(new Date())
    return {
      startDate: addCalendarDays(today, -7),
      endDate: today,
    }
  }, [])

  const { data: bridgeRaw, isLoading, error } = useForecastBridge(startDate, endDate)
  const forecastBridge = bridgeRaw as ForecastBridgeResponse | undefined

  const formatCurrency = (value: number) => formatCompactCurrency(value, currency)

  const weeklyChange = useMemo(() => {
    if (!forecastBridge) return null
    const changeGBP = forecastBridge.totalEnd - forecastBridge.totalStart
    if (!Number.isFinite(changeGBP)) return null
    return currency === 'USD' ? convertAmount(changeGBP, 'GBP', fxRate) : changeGBP
  }, [forecastBridge, currency, fxRate, convertAmount])

  const weeklyChangeLabel = useMemo(() => {
    if (weeklyChange == null) return null
    if (Math.abs(weeklyChange) <= GAP_CHANGE_THRESHOLD) return 'Unchanged over the last week'
    return weeklyChange < 0
      ? 'Gap improved over the last week'
      : 'Gap worsened over the last week'
  }, [weeklyChange])

  const driverHighlights = useMemo(() => {
    if (!forecastBridge) return []
    return forecastBridge.drivers
      .filter((d) => d.category !== 'Other' && Math.abs(d.delta) > 0)
      .map((d) => ({
        category: d.category,
        delta: currency === 'USD' ? convertAmount(d.delta, 'GBP', fxRate) : d.delta,
      }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 3)
  }, [forecastBridge, currency, fxRate, convertAmount])

  const otherDriverDelta = useMemo(() => {
    if (!forecastBridge) return null
    const other = forecastBridge.drivers.find((d) => d.category === 'Other')
    if (!other || Math.abs(other.delta) < 0.5) return null
    const deltaGBP = other.delta
    return currency === 'USD' ? convertAmount(deltaGBP, 'GBP', fxRate) : deltaGBP
  }, [forecastBridge, currency, fxRate, convertAmount])

  const handleNavigate = (path: string) => {
    onNavigate?.(path)
  }

  if (isLoading) {
    return (
      <Card className="overflow-hidden border-l-[3px] border-l-slate-400/40 dark:border-l-slate-500/40">
        <CardContent className={cardContentClass}>
          <Skeleton className="h-4 w-36 mb-3" />
          <Skeleton className="h-8 w-24 mb-2" />
          <Skeleton className="h-4 w-48 mb-4" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (error || weeklyChange == null) {
    return null
  }

  return (
    <SummaryGapChangeCard
      title="Change Over Last Week"
      footnote="End-of-day gap compared to seven days ago."
      change={weeklyChange}
      changeLabel={weeklyChangeLabel}
      drivers={driverHighlights}
      otherDriverDelta={otherDriverDelta}
      onNavigate={handleNavigate}
      cardContentClass={cardContentClass}
      formatCurrency={formatCurrency}
    />
  )
}
